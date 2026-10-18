/**
 * Conversion of OKX public candle rows (decimal text) into the numeric bars of the quant layer. An
 * unreadable value becomes NaN rather than dropping the row, so the audit reports the defect.
 */

import type { Candle } from "./types";

export interface PublicCandleRowLike {
  readonly startMs: number;
  readonly open: string | null;
  readonly high: string | null;
  readonly low: string | null;
  readonly close: string | null;
  readonly vol: string | null;
  readonly confirmed: boolean;
}

const DECIMAL = /^-?\d+(?:\.\d+)?(?:[eE][-+]?\d+)?$/;

function decimal(text: string | null): number {
  return text !== null && DECIMAL.test(text) ? Number(text) : Number.NaN;
}

export function candlesFromPublicRows(rows: readonly PublicCandleRowLike[]): Candle[] {
  return rows.map((row) => ({
    startMs: row.startMs,
    open: decimal(row.open),
    high: decimal(row.high),
    low: decimal(row.low),
    close: decimal(row.close),
    volume: row.vol === null ? null : decimal(row.vol),
    confirmed: row.confirmed,
  }));
}
