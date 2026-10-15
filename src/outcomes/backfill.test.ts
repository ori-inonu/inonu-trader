import { describe, expect, test } from "bun:test";
import { INTERVAL_MS, type Bar, type Interval } from "../intel/features/types";
import { ASSUMED_SPREAD_BPS, backfill, type BackfillInput } from "./backfill";
import { labelSnapshot } from "./labeler";

const DAY = 86_400_000;
const START = 1_800_000_000_000 - (1_800_000_000_000 % (4 * 3_600_000));

/** A deterministic wandering price: closes of the bars of `interval` from `from` for `count` bars. */
function bars(interval: Interval, from: number, count: number, base = 100): Bar[] {
  const ms = INTERVAL_MS[interval];
  return Array.from({ length: count }, (_, i) => {
    const t = from + i * ms;
    const close = base + 3 * Math.sin(t / 7_000_000) + 1.5 * Math.sin(t / 1_900_000) + (t - from) / 1e11;
    return { ts: t, open: close - 0.1, high: close + 0.4, low: close - 0.4, close, volume: 5, confirmed: true };
  });
}

const SPAN = 10 * DAY;
const all = (from = START, span = SPAN, base = 100): Record<Interval, Bar[]> => ({
  "5m": bars("5m", from, span / INTERVAL_MS["5m"], base), "15m": bars("15m", from, span / INTERVAL_MS["15m"], base), "1h": bars("1h", from, span / INTERVAL_MS["1h"], base), "4h": bars("4h", from, span / INTERVAL_MS["4h"], base),
});

const input = (over: Partial<BackfillInput> = {}): BackfillInput => ({
  instId: "ETH-USDT", bars: all(), btc15m: bars("15m", START, SPAN / INTERVAL_MS["15m"], 5000), fromMs: START + 4 * DAY, toMs: START + 5 * DAY, stepMs: 900_000, nowMs: START + SPAN, feeAndSlippageRoundTripBps: 22, ...over,
});

describe("what a backfilled record says about itself", () => {
  const { snapshots, labels } = backfill(input());
  test("one snapshot per step of the grid, aligned, with an id that is the same on every run, and the origin said", () => {
    expect(snapshots).toHaveLength(96 + 1);
    expect(snapshots[0]!.asOfMs % 900_000).toBe(0);
    expect(snapshots[1]!.asOfMs - snapshots[0]!.asOfMs).toBe(900_000);
    expect(snapshots[0]!.id).toBe(`ETH-USDT|${snapshots[0]!.asOfMs}`);
    expect(snapshots.every((s) => s.origem === "historico" && s.market === "spot")).toBe(true);
    expect(JSON.stringify(backfill(input()).snapshots)).toBe(JSON.stringify(snapshots));
  });
  test("the cost is the fees and slippage plus the assumed spread, and the flow and zones are not pretended", () => {
    const s = snapshots[10]!;
    expect(s.costRoundTripBps).toBe(22 + ASSUMED_SPREAD_BPS);
    expect(s.zones).toEqual({ demanda: null, oferta: null, todas: [] });
    expect(s.features.values["flow.warm"]).toBeNull();
    expect(s.features.nulos["flow.deltaRatio"]).toBeDefined();
    expect(s.features.values["cost.roundTripBps"]).toBe(24);
    expect(s.features.values["x.betaBtc48h"]).not.toBeNull();
  });
  test("the price is the close of the bar that ended at that moment", () => {
    const s = snapshots[0]!;
    const bar = input().bars["5m"].find((b) => b.ts + 300_000 === s.asOfMs)!;
    expect(s.price).toBe(bar.close);
  });
  test("three labels per snapshot where the data reaches, each the same as the labeler gives", () => {
    expect(labels).toHaveLength(snapshots.length * 3);
    const s = snapshots[5]!;
    const direct = labelSnapshot(s, input().bars["5m"], "1h", START + SPAN);
    expect(labels.find((l) => l.snapshotId === s.id && l.horizonte === "1h")).toEqual(direct);
    expect(labels.every((l) => l.completo)).toBe(true);
  });
});

describe("no look-ahead (REC-4)", () => {
  test("the features of a moment do not change when every bar after it is removed", () => {
    const t = START + 4 * DAY + 6 * 3_600_000;
    const cut = (xs: readonly Bar[]) => xs.filter((b) => b.ts <= t);
    const full = backfill(input({ fromMs: t, toMs: t }));
    const truncated = backfill(input({ fromMs: t, toMs: t, bars: { "5m": cut(all()["5m"]), "15m": cut(all()["15m"]), "1h": cut(all()["1h"]), "4h": cut(all()["4h"]) }, btc15m: cut(bars("15m", START, SPAN / INTERVAL_MS["15m"], 5000)), nowMs: t }));
    expect(truncated.snapshots[0]!.features).toEqual(full.snapshots[0]!.features);
    expect(truncated.snapshots[0]!.price).toBe(full.snapshots[0]!.price);
    expect(truncated.snapshots[0]!.atr15m).toBe(full.snapshots[0]!.atr15m);
  });
  test("a horizon that is not over yet gives no label, and the snapshot still exists", () => {
    const t = START + 4 * DAY;
    const r = backfill(input({ fromMs: t, toMs: t, nowMs: t + 30 * 60_000 }));
    expect(r.snapshots).toHaveLength(1);
    expect(r.labels.map((l) => l.horizonte)).toEqual(["15m"]);
  });
  test("bars that are not confirmed are never read", () => {
    const unconfirmed = all();
    unconfirmed["5m"] = unconfirmed["5m"].map((b) => ({ ...b, confirmed: false }));
    expect(backfill(input({ bars: unconfirmed })).snapshots).toEqual([]);
  });
});

describe("holes and short history", () => {
  test("a moment with no closed bar ending there is skipped, not invented, and its labels with it", () => {
    const b = all();
    const hole = START + 4 * DAY + 2 * 3_600_000;
    b["5m"] = b["5m"].filter((x) => x.ts !== hole - 300_000);
    const r = backfill(input({ bars: b }));
    expect(r.snapshots.some((s) => s.asOfMs === hole)).toBe(false);
    expect(r.snapshots).toHaveLength(96);
  });
  test("a window with a gap in the bars after the moment is an incomplete label with its reason, never a number", () => {
    const b = all();
    const t = START + 4 * DAY + 3_600_000;
    b["5m"] = b["5m"].filter((x) => x.ts !== t + 20 * 60_000);
    const r = backfill(input({ bars: b, fromMs: t, toMs: t }));
    const l = r.labels.find((x) => x.horizonte === "1h")!;
    expect([l.completo, l.motivoIncompleto, l.liquidoLongBps]).toEqual([false, "lacuna_de_velas", null]);
    expect(r.labels.find((x) => x.horizonte === "15m")!.completo).toBe(true);
  });
  test("with no history before the moment there are no features to speak of, but nothing breaks", () => {
    const r = backfill(input({ fromMs: START + 900_000, toMs: START + 900_000 }));
    expect(r.snapshots[0]!.features.values["trend.ema1h"]).toBeNull();
  });
  test("a perpetual is told as one, with its own cost", () => {
    const r = backfill(input({ instId: "ETH-USDT-SWAP", feeAndSlippageRoundTripBps: 12, fromMs: START + 4 * DAY, toMs: START + 4 * DAY }));
    expect(r.snapshots[0]).toMatchObject({ market: "perp", costRoundTripBps: 14 });
  });
  test("BTC itself has no cross-asset block", () => {
    const r = backfill(input({ instId: "BTC-USDT", btc15m: null, fromMs: START + 4 * DAY, toMs: START + 4 * DAY }));
    expect(r.snapshots[0]!.features.values["x.betaBtc48h"]).toBeNull();
  });
});
