import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { useDesk, type UseDeskResult } from "./useDesk";

describe("useDesk on the server", () => {
  test("renders the empty initial state without opening a socket or starting a request", () => {
    let captured: UseDeskResult | null = null;
    const originalWebSocket = globalThis.WebSocket;
    let sockets = 0;
    // Any attempt to open a socket during render would be a side effect; count it.
    (globalThis as { WebSocket: unknown }).WebSocket = class {
      constructor() {
        sockets += 1;
      }
    };
    const calls: string[] = [];
    const originalFetch = globalThis.fetch;
    (globalThis as { fetch: unknown }).fetch = async (url: string) => {
      calls.push(String(url));
      throw new Error("no network in render");
    };
    try {
      function Probe() {
        captured = useDesk({ focus: "MON-USDT", bar: "5m" });
        return createElement("p", null, captured.state.focus);
      }
      const html = renderToStaticMarkup(createElement(Probe));
      expect(html).toBe("<p>MON-USDT</p>");
    } finally {
      globalThis.WebSocket = originalWebSocket;
      globalThis.fetch = originalFetch;
    }
    expect(sockets).toBe(0);
    expect(calls).toEqual([]);
    const result = captured as UseDeskResult | null;
    expect(result).not.toBeNull();
    const state = result?.state;
    expect(state).toMatchObject({ focus: "MON-USDT", bar: "5m", book: null, trades: [], candles: [], clockSkewMs: null, updatedAtMs: null });
    expect(state?.watchlist.map((row) => row.instId)).toEqual(["BTC-USDT", "ETH-USDT", "SOL-USDT", "OKB-USDT", "MON-USDT"]);
    expect(state?.feeds.every((feed) => feed.state === "idle")).toBe(true);
    expect(typeof result?.setFocus).toBe("function");
    expect(typeof result?.setBar).toBe("function");
  });

  test("accepts a custom watchlist", () => {
    const seen: UseDeskResult[] = [];
    function Probe() {
      seen.push(useDesk({ focus: "BTC-USDT", bar: "1m", watchlist: ["BTC-USDT"] }));
      return null;
    }
    renderToStaticMarkup(createElement(Probe));
    expect(seen).toHaveLength(1);
    expect(seen[0]?.state.watchlist.map((row) => row.instId)).toEqual(["BTC-USDT"]);
  });
});
