/**
 * The model of the instrument header, the strip over the chart that answers the first question of
 * anyone who opens the desk: what is the price now, which way did it just move, how far is it from
 * where the day started, and where does it sit inside the 24h range. Pure, so every state is tested
 * without a browser. Nothing here invents a number: an unknown input prints as "Indisponivel", the
 * range marker disappears when the range is unknown, and the funding of another instrument is never
 * shown as if it belonged to the one in focus.
 */
import type { DeskDerivatives, DeskInstrument, DeskMetrics, DeskTicker } from "../types";
import {
  fmtBpsPlain,
  fmtClockSec,
  fmtCompact,
  fmtFundingPct,
  fmtPctSigned,
  fmtPx,
  fmtSignedNumber,
  priceDecimals,
  priceDecimalsForMagnitude,
  quoteSymbol,
  UNAVAILABLE,
} from "./format";

/** Which way the last print moved against the one before it. */
export type TickDirection = "up" | "down" | "flat";

/** Colour of a signed figure: none when unknown, flat when it prints as zero. */
export type ChangeTone = "up" | "down" | "flat" | "none";

export interface HeaderStat {
  readonly id: "vol" | "spread" | "funding";
  readonly label: string;
  readonly value: string;
  readonly tone: ChangeTone;
  /** False when the value is the unavailable word, so the view can mute it. */
  readonly known: boolean;
}

export interface InstrumentHeaderModel {
  /** False without a ticker: the view shows the awaiting line instead of a hero figure. */
  readonly known: boolean;
  readonly decimals: number;
  readonly price: string;
  /** Quote currency of the price, "USDT" for BTC-USDT, empty when the id has none. */
  readonly quote: string;
  readonly change: { readonly text: string; readonly tone: ChangeTone };
  /** Absolute move since the 24h open at the tick decimals, null when the open is unknown. */
  readonly changeAbs: string | null;
  readonly range: {
    readonly low: string;
    readonly high: string;
    /** Share of the 24h range below the last price, 0 to 1, null when the range is unknown. */
    readonly position: number | null;
    /** Spoken form of the range for assistive tech. */
    readonly label: string;
  };
  readonly stats: readonly HeaderStat[];
  /** Accessible name of the whole strip. */
  readonly label: string;
  /** Exchange time of the last print as "hh:mm:ss" UTC, null without a ticker. */
  readonly asOf: string | null;
}

export interface InstrumentHeaderInput {
  readonly ticker: DeskTicker | null;
  readonly metrics: DeskMetrics;
  readonly instrument: DeskInstrument | null;
  readonly derivatives: DeskDerivatives | null;
}

const isNum = (v: number | null | undefined): v is number => typeof v === "number" && Number.isFinite(v);

/**
 * The direction of a print against the previous one. An equal print keeps the direction that got
 * there, so the colour of the price does not drop back to neutral between two identical trades.
 */
export function tickDirection(prev: number | null, next: number | null, prevDir: TickDirection): TickDirection {
  if (!isNum(prev) || !isNum(next)) return "flat";
  if (next > prev) return "up";
  if (next < prev) return "down";
  return prevDir;
}

/** Share of the 24h range below `last`, clamped to 0..1. Null unless both ends are known and apart. */
export function rangePosition(last: number | null, low: number | null, high: number | null): number | null {
  if (!isNum(last) || !isNum(low) || !isNum(high) || high <= low) return null;
  return Math.min(1, Math.max(0, (last - low) / (high - low)));
}

/** A change that prints as 0,00% carries no colour. */
export function changeTone(v: number | null): ChangeTone {
  if (!isNum(v)) return "none";
  if (Math.abs(v) < 0.005) return "flat";
  return v > 0 ? "up" : "down";
}

function volumeStat(ticker: DeskTicker | null, instrument: DeskInstrument | null, quote: string): HeaderStat {
  const label = "Vol 24h";
  const unknown: HeaderStat = { id: "vol", label, value: UNAVAILABLE, tone: "none", known: false };
  if (ticker === null) return unknown;
  const swap = instrument?.instType === "SWAP" || ticker.instId.toUpperCase().endsWith("-SWAP");
  if (swap) {
    // OKX reports the 24h volume of a perpetual in contracts; the quote amount is not known here.
    return isNum(ticker.volBase24h) ? { id: "vol", label, value: `${fmtCompact(ticker.volBase24h)} contratos`, tone: "none", known: true } : unknown;
  }
  if (isNum(ticker.volQuote24h)) return { id: "vol", label, value: `${fmtCompact(ticker.volQuote24h)}${quote ? ` ${quote}` : ""}`, tone: "none", known: true };
  if (isNum(ticker.volBase24h)) {
    const base = instrument?.base ?? ticker.instId.split("-")[0] ?? "";
    return { id: "vol", label, value: `${fmtCompact(ticker.volBase24h)}${base ? ` ${base}` : ""}`, tone: "none", known: true };
  }
  return unknown;
}

/**
 * Builds the header from the live desk slices. The change prefers the metric the desk already
 * computes and falls back to the ticker open, both real; the funding is a stat only when the
 * derivatives row is the very instrument in focus (a spot pair never borrows its perpetual's funding).
 */
export function instrumentHeaderModel({ ticker, metrics, instrument, derivatives }: InstrumentHeaderInput): InstrumentHeaderModel {
  const last = ticker?.last ?? null;
  const decimals = instrument !== null ? priceDecimals(instrument.tickSz, priceDecimalsForMagnitude(last)) : priceDecimalsForMagnitude(last);
  const instId = instrument?.instId ?? ticker?.instId ?? "";
  const quote = instrument?.quote ?? quoteSymbol(instId);

  const open = ticker?.open24h ?? null;
  const pctFromTicker = isNum(last) && isNum(open) && open > 0 ? ((last - open) / open) * 100 : null;
  const pct = isNum(metrics.change24hPct) ? metrics.change24hPct : pctFromTicker;
  const change = { text: fmtPctSigned(pct), tone: changeTone(pct) };
  const changeAbs = isNum(last) && isNum(open) ? fmtSignedNumber(last - open, decimals) : null;

  const low = ticker?.low24h ?? null;
  const high = ticker?.high24h ?? null;
  const position = rangePosition(last, low, high);
  const lowText = fmtPx(low, decimals);
  const highText = fmtPx(high, decimals);
  const rangeLabel =
    isNum(low) && isNum(high)
      ? `Faixa de 24 horas: minima ${lowText}, maxima ${highText}${position === null ? "" : `, ultimo a ${Math.round(position * 100)}% da faixa`}`
      : "Faixa de 24 horas indisponivel";

  const stats: HeaderStat[] = [volumeStat(ticker, instrument, quote)];
  const spread = metrics.spreadBps;
  stats.push({ id: "spread", label: "Spread", value: fmtBpsPlain(spread, 2), tone: "none", known: isNum(spread) });
  if (instrument?.instType === "SWAP" && derivatives !== null && derivatives.instId === instrument.instId) {
    // A funding rate is tiny by nature (bps of a percent), so its sign decides the colour, not the zero threshold of a change.
    const rate = derivatives.fundingRate;
    const tone: ChangeTone = !isNum(rate) ? "none" : rate > 0 ? "up" : rate < 0 ? "down" : "flat";
    stats.push({ id: "funding", label: "Funding", value: fmtFundingPct(rate), tone, known: isNum(rate) });
  }

  return {
    known: ticker !== null,
    decimals,
    price: fmtPx(last, decimals),
    quote,
    change,
    changeAbs,
    range: { low: lowText, high: highText, position, label: rangeLabel },
    stats,
    label: instId ? `Ultimo preco e faixa de 24 horas de ${instId}` : "Ultimo preco e faixa de 24 horas",
    asOf: ticker !== null && Number.isFinite(ticker.tsMs) ? fmtClockSec(ticker.tsMs) : null,
  };
}
