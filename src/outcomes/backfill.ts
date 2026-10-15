/**
 * The backfill (INT-3.9, ML-2): snapshots and labels rebuilt from the exchange's history of candles, so the learner does not have to
 * wait weeks for the clock recorder before it has anything to test. Pure: the bars come in, the records go out.
 *
 * What it can and cannot know, said plainly in every record:
 *  - it has the candle features (trend, momentum, volatility, structure, cost, cross-asset with BTC); it has NO flow, NO zones and NO
 *    derivatives, because the exchange keeps no history of the footprint: those blocks are null with their reasons;
 *  - the price at a moment is the close of the last closed five minute bar, and the spread is an ASSUMED constant (the exchange
 *    keeps no history of the book), so the cost of the round trip is the fees and slippage of the lab plus that assumption;
 *  - the records say `origem: "historico"`, so nothing downstream can mistake them for what the clock recorded;
 *  - no look-ahead: the features of a moment read only bars closed by that moment (a test truncates the future and expects the same
 *    vector), and the label reads only bars after it.
 */
import { closedBars, computeFeatures } from "../intel/features/compute";
import { INTERVALS, INTERVAL_MS, type Bar, type Interval } from "../intel/features/types";
import { atr } from "../intel/ta/indicators";
import { LABEL_BAR_MS, labelSnapshot } from "./labeler";
import { HORIZONS, HORIZON_MS, type Horizon, type Label, type Snapshot } from "./types";

/** An assumption, not a measurement: the half spread paid on each side of a liquid pair. */
export const ASSUMED_SPREAD_BPS = 2;
const WINDOW_BARS = 400;

export interface BackfillInput {
  readonly instId: string;
  readonly bars: Readonly<Record<Interval, readonly Bar[]>>;
  /** 15 minute bars of BTC-USDT for the cross-asset block; null for BTC itself. */
  readonly btc15m: readonly Bar[] | null;
  /** The first and last moment to record, on the grid of `stepMs`. */
  readonly fromMs: number;
  readonly toMs: number;
  readonly stepMs: number;
  /** "Now", to tell a horizon that is over from one that is not. */
  readonly nowMs: number;
  /** Round-trip fees and slippage in bps, from the lab table. */
  readonly feeAndSlippageRoundTripBps: number;
  readonly horizons?: readonly Horizon[];
}

/** Index of the last bar whose open time is at or before `ts`, or -1. The bars must be sorted by open time. */
function lastAtOrBefore(bars: readonly Bar[], ts: number): number {
  let lo = 0;
  let hi = bars.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (bars[mid]!.ts <= ts) {
      found = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return found;
}

/** The last `WINDOW_BARS` bars that were closed at `asOfMs`. */
function windowAt(bars: readonly Bar[], interval: Interval, asOfMs: number): Bar[] {
  const idx = lastAtOrBefore(bars, asOfMs - INTERVAL_MS[interval]);
  return idx < 0 ? [] : bars.slice(Math.max(0, idx - WINDOW_BARS + 1), idx + 1);
}

export function backfill(input: BackfillInput): { readonly snapshots: Snapshot[]; readonly labels: Label[] } {
  const horizons = input.horizons ?? HORIZONS;
  const snapshots: Snapshot[] = [];
  const labels: Label[] = [];
  const market = input.instId.endsWith("-SWAP") ? "perp" : "spot";
  const sorted = (xs: readonly Bar[]): Bar[] => [...xs].filter((b) => b.confirmed).sort((a, b) => a.ts - b.ts);
  const bars: Record<Interval, Bar[]> = { "5m": sorted(input.bars["5m"]), "15m": sorted(input.bars["15m"]), "1h": sorted(input.bars["1h"]), "4h": sorted(input.bars["4h"]) };
  const btc = input.btc15m === null ? null : sorted(input.btc15m);
  const longest = Math.max(...horizons.map((h) => HORIZON_MS[h]));

  for (let t = Math.ceil(input.fromMs / input.stepMs) * input.stepMs; t <= input.toMs; t += input.stepMs) {
    const at = lastAtOrBefore(bars["5m"], t - INTERVAL_MS["5m"]);
    if (at < 0 || bars["5m"][at]!.ts + INTERVAL_MS["5m"] !== t) continue; // no closed bar ends exactly here: a hole in the history
    const price = bars["5m"][at]!.close;
    const slice: Record<Interval, Bar[]> = { "5m": [], "15m": [], "1h": [], "4h": [] };
    for (const interval of INTERVALS) slice[interval] = windowAt(bars[interval], interval, t);
    const features = computeFeatures({
      instId: input.instId,
      asOfMs: t,
      price,
      bars: slice,
      btc15m: btc === null ? null : windowAt(btc, "15m", t),
      spreadBps: ASSUMED_SPREAD_BPS,
      feeAndSlippageRoundTripBps: input.feeAndSlippageRoundTripBps,
    });
    const closed15 = closedBars(slice["15m"], "15m", t);
    const atr15 = closed15.length >= 20 ? atr(closed15.map((b) => b.high), closed15.map((b) => b.low), closed15.map((b) => b.close), 14).at(-1) ?? null : null;
    const snapshot: Snapshot = {
      id: `${input.instId}|${t}`,
      asOfMs: t,
      instId: input.instId,
      market,
      price,
      costRoundTripBps: Math.round((input.feeAndSlippageRoundTripBps + ASSUMED_SPREAD_BPS) * 100) / 100,
      atr15m: atr15 === null ? null : Math.round(atr15 * 1e8) / 1e8,
      zones: { demanda: null, oferta: null, todas: [] },
      features,
      origem: "historico",
    };
    snapshots.push(snapshot);

    const first = lastAtOrBefore(bars["5m"], t - 1) + 1;
    const ahead = bars["5m"].slice(first, first + longest / LABEL_BAR_MS + 2);
    for (const horizonte of horizons) {
      const label = labelSnapshot(snapshot, ahead, horizonte, input.nowMs);
      if (label.completo || label.motivoIncompleto !== "horizonte_alem_dos_dados") labels.push(label);
    }
  }
  return { snapshots, labels };
}
