import { describe, expect, test } from "bun:test";
import { analyzeCapturedPortfolio } from "./captured-report";

function capture(key: string, count = 80, offset = 0) {
  return { instId: `${key}-USDT-SWAP`, barMs: 900_000, capturedAtMs: (count + offset) * 900_000,
    candles: Array.from({ length: count }, (_, i) => {
      const close = 100 * Math.exp(0.004 * Math.sin(i + offset));
      return { startMs: (i + offset) * 900_000, open: close, high: close * 1.01, low: close * 0.99, close, volume: null, confirmed: true };
    }) };
}
const positions = [{ key: "BTC", valueUsd: 750 }, { key: "ETH", valueUsd: 250 }];

describe("captured portfolio public report", () => {
  test("excludes a different interval and gives identical scale and coverage after reordering", () => {
    const btc = capture("BTC"), eth = capture("ETH");
    const captures = [{ key: "BTC", value: btc }, { key: "ETH", value: { ...eth, barMs: 1_800_000 } }];
    const a = analyzeCapturedPortfolio({ positions, captures });
    const b = analyzeCapturedPortfolio({ positions: [...positions].reverse(), captures: [...captures].reverse() });
    expect(a.analysis.risk.status).toBe("ok");
    expect(a.analysis.risk).toEqual(b.analysis.risk);
    expect(a.alignment.barMs).toBe(900_000);
    if (a.analysis.risk.status === "ok") expect(a.analysis.risk.riskedShare).toBe(0.75);
    expect(a.captures).toContainEqual(expect.objectContaining({ key: "ETH", reason: "interval_mismatch" }));
  });

  test.each([
    ["identity_mismatch", { ...capture("ETH"), instId: "SOL-USDT-SWAP" }],
    ["invalid_capture", { ...capture("ETH"), capturedAtMs: "72000000" }],
    ["invalid_capture", { ...capture("ETH"), candles: [null] }],
    ["invalid_capture", { ...capture("ETH"), candles: [{ ...capture("ETH").candles[0], confirmed: "true" }] }],
    ["insufficient_candles", { ...capture("ETH"), candles: [] }],
    ["insufficient_candles", capture("ETH", 30)],
  ])("keeps other risk for excluded %s capture", (reason, invalid) => {
    const r = analyzeCapturedPortfolio({ positions, captures: [{ key: "BTC", value: capture("BTC") }, { key: "ETH", value: invalid }] });
    expect(r.analysis.risk.status).toBe("ok");
    expect(r.captures).toContainEqual(expect.objectContaining({ key: "ETH", status: "excluded", reason }));
  });

  test("missing and unreadable captures are distinguished even if risk is unavailable", () => {
    const r = analyzeCapturedPortfolio({ positions, captures: [{ key: "ETH", value: null, readError: true }] });
    expect(r.analysis.risk).toEqual({ status: "unavailable", reason: "no_returns" });
    expect(r.captures.map(c => c.reason)).toEqual(["missing_capture", "unreadable_capture"]);
  });

  test("unknown and zero valued positions cannot restrict the common grid", () => {
    const r = analyzeCapturedPortfolio({ positions: [...positions.slice(0, 1), { key: "ETH", valueUsd: null }, { key: "SOL", valueUsd: 0 }],
      captures: [{ key: "BTC", value: capture("BTC") }, { key: "ETH", value: capture("ETH", 0) }, { key: "SOL", value: capture("SOL", 0) }] });
    expect(r.alignment.commonBars).toBe(80);
    expect(r.analysis.risk.status).toBe("ok");
    expect(r.analysis.concentration.excluded).toEqual([{ key: "ETH", reason: "value_unknown" }]);
    expect(r.captures).toHaveLength(1);
  });

  test("aligns only common closed bars and reports their actual range", () => {
    const r = analyzeCapturedPortfolio({ positions, captures: [{ key: "BTC", value: capture("BTC") }, { key: "ETH", value: capture("ETH", 80, 20) }] });
    expect(r.alignment).toEqual({ barMs: 900_000, commonBars: 60, startMs: 18_000_000, endMs: 71_100_000 });
    expect(r.analysis.risk.status).toBe("ok");
    if (r.analysis.risk.status === "ok") expect(r.analysis.risk.observations).toBe(59);
  });

  test("does not manufacture overlap or interpolate disconnected captures", () => {
    const r = analyzeCapturedPortfolio({ positions, captures: [{ key: "BTC", value: capture("BTC") }, { key: "ETH", value: capture("ETH", 80, 60) }] });
    expect(r.alignment.commonBars).toBe(20);
    expect(r.analysis.risk).toEqual({ status: "unavailable", reason: "too_few_observations" });
  });

  test("future and unconfirmed candles cannot change historical risk; freshness is at capture time", () => {
    const btc = capture("BTC");
    const before = analyzeCapturedPortfolio({ positions: positions.slice(0, 1), captures: [{ key: "BTC", value: btc }] });
    const after = analyzeCapturedPortfolio({ positions: positions.slice(0, 1), captures: [{ key: "BTC", value: { ...btc,
      candles: [...btc.candles, { ...btc.candles[0], startMs: 80 * 900_000, close: 10000, high: 10000 }, { ...btc.candles[0], startMs: 79 * 900_000, confirmed: false }] } }] });
    expect(after.analysis).toEqual(before.analysis);
    expect(after.captures[0]?.freshAtCapture).toBe(true);
    expect(after.captures[0]?.capturedAtMs).toBe(72_000_000);
    const stale = analyzeCapturedPortfolio({ positions: positions.slice(0, 1), captures: [{ key: "BTC", value: { ...btc, capturedAtMs: 100 * 900_000 } }] });
    expect(stale.captures[0]?.freshAtCapture).toBe(false);
  });
});
