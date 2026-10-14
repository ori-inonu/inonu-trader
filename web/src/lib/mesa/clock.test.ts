// The engine stamps each reading with the EXCHANGE clock (the core corrects its own clock against the exchange). The browser clock is the
// Windows clock, which the Doctor measured 70 s off on this machine. The ages of the engine views must therefore be counted against the
// exchange clock, the way the rest of the desk does (nowMs + skew), or a fresh reading reads "dado velho" and a stale one reads fresh.
// origin: synthetic_fixture, tests only.
import { describe, expect, test } from "bun:test";
import type { ChartOverlay } from "../inonu/overlay";
import type { OverlayFeedState } from "../inonu/overlay-feed";
import { exchangeNowMs } from "./clock";
import { flowTab, zonesTab } from "./flow-tab-model";
import { viewSource } from "./view-source";

const EXCHANGE_NOW = 1_800_000_000_000;
const overlay = (): ChartOverlay => ({
  instId: "BTC-USDT", asOfMs: EXCHANGE_NOW - 2_000, fonte: "okx_ws_trades", price: 100, atr14: 1, tickSz: "0.1", step: 0.1, binTicks: 1,
  aquecimento: { fechadas: 50, necessarias: 50, pronto: true, restaurado: 0 },
  niveis: [], corridas: { sequencial: [], progressao: [], exaustao: [] }, perfil: { poc: null, val: null, vah: null, hvn: [], lvn: [] }, absorcao: null, zonas: [],
});
const feed: OverlayFeedState = { status: "ok", overlay: overlay(), reason: null };

describe("the exchange clock from the browser clock", () => {
  test("it is the browser clock plus the measured skew, and nothing before the clock ticked or when no skew was measured", () => {
    expect(exchangeNowMs(1_000, 500)).toBe(1_500);
    expect(exchangeNowMs(1_000, -90_000)).toBe(-89_000);
    expect(exchangeNowMs(1_000, null)).toBe(1_000);
    expect(exchangeNowMs(0, 500)).toBe(0);
  });
});

describe("a Windows clock that is 90 seconds ahead", () => {
  const skew = -90_000; // exchange minus browser
  const browserNow = EXCHANGE_NOW + 90_000; // what Date.now() says at the very moment the exchange says EXCHANGE_NOW

  test("with the browser clock the fresh reading looks stale (the defect), with the exchange clock it is live", () => {
    expect(flowTab(feed, browserNow).state).toBe("stale");
    expect(flowTab(feed, exchangeNowMs(browserNow, skew)).state).toBe("live");
    expect(zonesTab(feed, exchangeNowMs(browserNow, skew)).state).toBe("live");
  });

  test("the line of origin and age says agora, not dado velho", () => {
    const engine = { asOfMs: overlay().asOfMs, fonte: "okx_ws_trades" as const };
    const line = viewSource({ view: "zonas", onchain: false, feedAgeMs: 300, engine, nowMs: exchangeNowMs(browserNow, skew), stale: false });
    expect(line).toBe("OKX trades ao vivo, agora");
  });

  test("a reading that really is old is still told old, whatever the local clock says", () => {
    const old: OverlayFeedState = { status: "ok", overlay: { ...overlay(), asOfMs: EXCHANGE_NOW - 5 * 60_000 }, reason: null };
    expect(flowTab(old, exchangeNowMs(browserNow, skew)).state).toBe("stale");
  });
});
