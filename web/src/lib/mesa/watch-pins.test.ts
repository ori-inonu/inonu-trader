import { describe, expect, test } from "bun:test";
import type { AssetCatalogRow } from "../desk/useAssetCatalog";
import { isInstId, parseWatchPins, WATCH_PINS_MAX, WATCH_TOTAL_MAX, watchExtras } from "./watch-pins";

const row = (instId: string): AssetCatalogRow => ({ instId, last: 1, change24hPct: 1, volQuote24h: 100 });

describe("isInstId", () => {
  test("accepts AAA-BBB and AAA-BBB-SWAP, rejects anything else", () => {
    expect(isInstId("BTC-USDT")).toBe(true);
    expect(isInstId("ETH-USDT-SWAP")).toBe(true);
    expect(isInstId("btc-usdt")).toBe(false);
    expect(isInstId("BTCUSDT")).toBe(false);
    expect(isInstId("BTC-USDT-EXTRA-LEG")).toBe(false);
    expect(isInstId("")).toBe(false);
    expect(isInstId(null)).toBe(false);
    expect(isInstId(42)).toBe(false);
  });
});

describe("parseWatchPins", () => {
  test("corrupt payloads fall back to no pins", () => {
    expect(parseWatchPins(null)).toEqual([]);
    expect(parseWatchPins("pins")).toEqual([]);
    expect(parseWatchPins({ pins: "BTC-USDT" })).toEqual([]);
    expect(parseWatchPins({ pins: [1, null, {}] })).toEqual([]);
  });

  test("keeps valid ids, drops invalid ones and duplicates", () => {
    expect(parseWatchPins({ pins: ["SOL-USDT", "bad id", "SOL-USDT", "ETH-USDT-SWAP"] })).toEqual(["SOL-USDT", "ETH-USDT-SWAP"]);
  });

  test("caps the list at WATCH_PINS_MAX", () => {
    const pins = Array.from({ length: WATCH_PINS_MAX + 3 }, (_, i) => `COIN${i}-USDT`);
    expect(parseWatchPins({ pins })).toHaveLength(WATCH_PINS_MAX);
  });
});

describe("watchExtras", () => {
  test("skips instruments already listed and fills up to the total", () => {
    const listed = ["BTC-USDT", "ETH-USDT"];
    const spot = [row("BTC-USDT"), row("SOL-USDT"), row("XRP-USDT"), row("DOGE-USDT")];
    const out = watchExtras(spot, listed, 4);
    expect(out.map((r) => r.instId)).toEqual(["SOL-USDT", "XRP-USDT"]);
  });

  test("no room means no extras", () => {
    const listed = Array.from({ length: WATCH_TOTAL_MAX }, (_, i) => `A${i}-USDT`);
    expect(watchExtras([row("SOL-USDT")], listed)).toEqual([]);
  });

  test("fewer candidates than the room returns what exists", () => {
    expect(watchExtras([row("SOL-USDT")], ["BTC-USDT"], 50)).toHaveLength(1);
  });
});
