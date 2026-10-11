import type { DeskBook, DeskBookLevel } from "../types";

/** Height of one ladder row, in CSS px. The panel CSS uses the same number. */
export const LADDER_ROW_H = 17;
/** Fixed bands of the ladder: depth imbalance bar, column header, spread row. */
export const LADDER_IMBALANCE_H = 34;
export const LADDER_COLUMNS_H = 18;
export const LADDER_SPREAD_H = 32;

export interface LadderRow {
  readonly px: number;
  readonly sz: number;
  /** Running total of size from the best price outward, in base units. */
  readonly cum: number;
  /** Size against the largest visible level, from 0 to 1. Drives the heat bar width. */
  readonly ratio: number;
  /** Heat bar opacity from the same ratio. */
  readonly alpha: number;
}

export interface LadderModel {
  /** Best ask first (ascending). The panel renders it reversed so the best ask touches the spread row. */
  readonly asks: readonly LadderRow[];
  /** Best bid first (descending). */
  readonly bids: readonly LadderRow[];
  readonly maxSz: number;
  readonly bestBid: number | null;
  readonly bestAsk: number | null;
}

/** How many levels fit on each side of the spread row. At least 1, at most `max`. */
export function rowsPerSide(bodyHeight: number, rowH = LADDER_ROW_H, max = 40): number {
  const fixed = LADDER_IMBALANCE_H + LADDER_COLUMNS_H + LADDER_SPREAD_H;
  const room = bodyHeight - fixed;
  if (!Number.isFinite(room) || room <= 0) return 1;
  return Math.max(1, Math.min(max, Math.floor(room / rowH / 2)));
}

/** Heat bar opacity for a size ratio: a quiet floor so every level reads, rising to a clear wall. */
export function heatAlpha(ratio: number): number {
  const r = Math.min(1, Math.max(0, ratio));
  return Number((0.08 + 0.36 * r).toFixed(3));
}

function validLevels(levels: readonly DeskBookLevel[], count: number): DeskBookLevel[] {
  const out: DeskBookLevel[] = [];
  for (const level of levels) {
    if (out.length >= count) break;
    if (Number.isFinite(level.px) && Number.isFinite(level.sz) && level.sz >= 0) out.push(level);
  }
  return out;
}

function side(levels: readonly DeskBookLevel[], maxSz: number): LadderRow[] {
  let cum = 0;
  return levels.map((level) => {
    cum += level.sz;
    const ratio = maxSz > 0 ? level.sz / maxSz : 0;
    return { px: level.px, sz: level.sz, cum, ratio, alpha: heatAlpha(ratio) };
  });
}

/** Builds the visible ladder from the book. `perSide` is the number of levels to keep on each side. */
export function buildLadder(book: DeskBook | null, perSide: number): LadderModel {
  if (!book) return { asks: [], bids: [], maxSz: 0, bestBid: null, bestAsk: null };
  const asks = validLevels(book.asks, perSide);
  const bids = validLevels(book.bids, perSide);
  let maxSz = 0;
  for (const level of asks) maxSz = Math.max(maxSz, level.sz);
  for (const level of bids) maxSz = Math.max(maxSz, level.sz);
  return {
    asks: side(asks, maxSz),
    bids: side(bids, maxSz),
    maxSz,
    bestBid: bids.length ? bids[0].px : null,
    bestAsk: asks.length ? asks[0].px : null,
  };
}

/** Mid price and spread in bps computed from the top of the book, used only when the metrics have none. */
export function topOfBook(book: DeskBook | null): { mid: number; spreadBps: number } | null {
  if (!book || !book.bids.length || !book.asks.length) return null;
  const bid = book.bids[0].px;
  const ask = book.asks[0].px;
  if (!Number.isFinite(bid) || !Number.isFinite(ask) || bid <= 0 || ask <= 0) return null;
  const mid = (bid + ask) / 2;
  return { mid, spreadBps: ((ask - bid) / mid) * 10_000 };
}
