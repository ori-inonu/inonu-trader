import { describe, expect, test } from "bun:test";
import type { OnchainCandle } from "./client";
import { isOnchainBar, ONCHAIN_BAR_REFRESH_MS, onchainCandlesToDesk } from "./useOnchainCandles";

const candle = (over: Partial<OnchainCandle> = {}): OnchainCandle => ({
  ts: 1_700_000_000_000,
  open: 1,
  high: 1.2,
  low: 0.9,
  close: 1.1,
  volume: 10,
  volumeUsd: 11,
  confirmed: true,
  ...over,
});

describe("onchainCandlesToDesk", () => {
  test("maps volume to volBase, volumeUsd to volQuote and keeps the provider confirmed flag", () => {
    const [c] = onchainCandlesToDesk([candle({ confirmed: false })]);
    expect(c).toMatchObject({ tsMs: 1_700_000_000_000, volBase: 10, volQuote: 11, confirmed: false });
  });

  test("orders oldest first even when the provider answers newest first", () => {
    const out = onchainCandlesToDesk([candle({ ts: 300 }), candle({ ts: 100 }), candle({ ts: 200 })]);
    expect(out.map((c) => c.tsMs)).toEqual([100, 200, 300]);
  });

  test("discards invalid rows rather than drawing them", () => {
    const bad = [
      candle({ ts: 0 }),
      candle({ high: 1, low: 2 }),
      candle({ open: Number.NaN }),
      candle({ volumeUsd: Number.POSITIVE_INFINITY }),
    ];
    expect(onchainCandlesToDesk([candle({ ts: 5 }), ...bad])).toHaveLength(1);
  });

  test("empty in, empty out", () => {
    expect(onchainCandlesToDesk([])).toEqual([]);
  });
});

describe("isOnchainBar and the refresh table", () => {
  test("1D has no on-chain route, the five intraday bars do", () => {
    expect(isOnchainBar("1D")).toBe(false);
    for (const b of ["1m", "5m", "15m", "1H", "4H"] as const) expect(isOnchainBar(b)).toBe(true);
  });

  test("refresh intervals equal the bar TTLs of the spec", () => {
    expect(ONCHAIN_BAR_REFRESH_MS).toEqual({ "1m": 60_000, "5m": 120_000, "15m": 300_000, "1H": 600_000, "4H": 900_000 });
  });
});
