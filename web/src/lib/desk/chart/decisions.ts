/**
 * Jev decision markers on the desk chart (spec G5, G6).
 *
 * A marker exists ONLY for a real read of the focused instrument whose model answered buy, sell or
 * hold (decision.status === "ok") with a usable tape state. Everything else - observe mode reads,
 * timeouts, errors, malformed answers, reads of other instruments, reads that cannot be placed on
 * the exchange clock - produces no marker. Nothing is ever invented to fill the lane.
 *
 * Anchoring: a read stamped with clockOffsetMs is already on the exchange clock; a read stamped on
 * the producer's local clock (clockOffsetMs === null) is shifted by the measured browser skew, and
 * without that skew the read cannot be compared with the candles at all, so it yields no marker.
 * The marker anchors on the candle that was open at that instant (`barIndex`). For Renko (F2) the
 * same anchorMs will be remapped to the brick current at that instant by one pure function; the
 * renderer only consumes `barIndex`, so that remap is the single seam.
 */

import type { JevReadView } from "../../jev-read";
import { BAR_MS } from "../okx-parse";
import type { DeskBar } from "../types";
import type { RenkoBrick } from "./transforms";

export type DecisionOutcome =
  | { readonly kind: "none" }
  | { readonly kind: "pending" }
  | { readonly kind: "not_measured"; readonly reason: "scale" }
  | { readonly kind: "measured"; readonly bps: number; readonly favourable: boolean };

export interface DecisionMarker {
  readonly readId: string;
  readonly action: "buy" | "sell" | "hold";
  /** Instant of the read on the exchange clock. */
  readonly anchorMs: number;
  /** Index into `candles` of the bar open at anchorMs. */
  readonly barIndex: number;
  /** state.mid at the read, the price the Jev looked at. */
  readonly price: number;
  readonly weights: { readonly buy: number; readonly sell: number; readonly hold: number };
  readonly confidence: number | null;
  readonly model: string;
  readonly latencyMs: number | null;
  readonly horizonMinutes: number;
  /** The raw stamp of the read, kept for the card (clock basis depends on clockOffsetMs). */
  readonly atMs: number;
  readonly outcome: DecisionOutcome;
}

export interface DecisionMarkersInput {
  readonly reads: readonly JevReadView[];
  readonly instId: string;
  /** Oldest first; the last bar may still be forming. */
  readonly candles: readonly {
    readonly tsMs: number;
    readonly open: number;
    readonly high: number;
    readonly low: number;
    readonly close: number;
    readonly confirmed: boolean;
  }[];
  readonly bar: DeskBar;
  /** OKX clock minus the browser clock, null until measured. */
  readonly browserSkewMs: number | null;
  /** Now on the exchange clock, null when the skew is unknown. */
  readonly nowExchangeMs: number | null;
}

/** Outcome of one buy or sell, per spec G6: side * (P(T+H) / P(T) - 1) in bps, confirmed closes only. */
function outcomeOf(
  action: "buy" | "sell" | "hold",
  price: number,
  horizonMinutes: number,
  anchorMs: number,
  candles: DecisionMarkersInput["candles"],
  bar: DeskBar,
  barMs: number,
  nowExchangeMs: number | null,
): DecisionOutcome {
  if (action === "hold") return { kind: "none" };
  if (bar !== "1m" && bar !== "5m") return { kind: "not_measured", reason: "scale" };
  const horizonEnd = anchorMs + horizonMinutes * 60_000;
  if (nowExchangeMs === null || nowExchangeMs < horizonEnd) return { kind: "pending" };
  let endPx: number | null = null;
  for (const c of candles) {
    if (c.tsMs + barMs > horizonEnd) break;
    if (c.confirmed) endPx = c.close;
  }
  if (endPx === null) return { kind: "pending" };
  const bps = (action === "buy" ? 1 : -1) * (endPx / price - 1) * 10_000;
  return { kind: "measured", bps, favourable: bps > 0 };
}

export function decisionMarkers(input: DecisionMarkersInput): DecisionMarker[] {
  const barMs = BAR_MS[input.bar];
  const out: DecisionMarker[] = [];
  for (const read of input.reads) {
    if (read.instId !== input.instId) continue;
    const d = read.decision;
    if (d === null || d.status !== "ok") continue;
    const s = read.state;
    if (s === null || !Number.isFinite(s.mid) || s.mid <= 0) continue;
    let anchorMs: number;
    if (read.clockOffsetMs !== null) {
      anchorMs = read.atMs;
    } else {
      if (input.browserSkewMs === null) continue;
      anchorMs = read.atMs + input.browserSkewMs;
    }
    const barIndex = input.candles.findIndex((c) => anchorMs >= c.tsMs && anchorMs < c.tsMs + barMs);
    if (barIndex === -1) continue;
    out.push({
      readId: read.readId,
      action: d.action,
      anchorMs,
      barIndex,
      price: s.mid,
      weights: { buy: d.probabilities.buy, sell: d.probabilities.sell, hold: d.probabilities.hold },
      confidence: d.confidence,
      model: d.model,
      latencyMs: d.latencyMs,
      horizonMinutes: s.horizonMinutes,
      atMs: read.atMs,
      outcome: outcomeOf(d.action, s.mid, s.horizonMinutes, anchorMs, input.candles, input.bar, barMs, input.nowExchangeMs),
    });
  }
  out.sort((a, b) => a.anchorMs - b.anchorMs);
  return out;
}

/**
 * Reanchors markers onto a Renko brick series (G5/F2). Each marker keeps every field; `barIndex`
 * becomes the index of the LAST brick fully completed before the read (brick tsMs + barMs <= anchorMs).
 * A marker older than the first completed brick is dropped. The outcome is not recomputed: it was
 * measured on the time candles and stays that way.
 */
export function remapMarkersToBricks(
  markers: readonly DecisionMarker[],
  bricks: readonly RenkoBrick[],
  barMs: number,
): DecisionMarker[] {
  const out: DecisionMarker[] = [];
  for (const m of markers) {
    let index = -1;
    for (let i = bricks.length - 1; i >= 0; i -= 1) {
      if (bricks[i]!.tsMs + barMs <= m.anchorMs) {
        index = i;
        break;
      }
    }
    if (index === -1) continue;
    out.push({ ...m, barIndex: index });
  }
  return out;
}

export interface DecisionScore {
  readonly measured: number;
  readonly favourable: number;
  readonly pending: number;
  readonly notMeasured: number;
  readonly text: string;
}

/** The honest scoreboard line above the chart (G6). Holds never count; the percent only shows from 10 measured. */
export function decisionScore(markers: readonly DecisionMarker[]): DecisionScore {
  let measured = 0;
  let favourable = 0;
  let pending = 0;
  let notMeasured = 0;
  for (const m of markers) {
    if (m.outcome.kind === "measured") {
      measured += 1;
      if (m.outcome.favourable) favourable += 1;
    } else if (m.outcome.kind === "pending") {
      pending += 1;
    } else if (m.outcome.kind === "not_measured") {
      notMeasured += 1;
    }
  }
  let text: string;
  if (measured === 0) {
    text = "Inonu neste ativo: nenhuma decisao medida ainda";
  } else {
    const word = measured === 1 ? "decisao" : "decisoes";
    const pctText = measured >= 10 ? `, ${Math.round((100 * favourable) / measured)}%` : "";
    text = `Inonu neste ativo: ${favourable} de ${measured} ${word} no sentido certo apos 5 min${pctText} (bruto, sem custos)`;
  }
  return { measured, favourable, pending, notMeasured, text };
}
