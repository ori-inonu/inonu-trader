/**
 * Incremental order book of the OKX `books` channel, plus the `books5` full snapshots.
 *
 * `books` sends a snapshot of up to 400 levels per side and then updates: a level whose size is "0" is deleted, any
 * other size replaces the level. Every message carries `seqId` / `prevSeqId` (an update must chain to the previous
 * `seqId`) and a CRC32 `checksum` over the top 25 levels. OKX computes the checksum from the price and size TEXT
 * exactly as it printed them, so every level keeps both the text and the parsed number.
 *
 * Integrity: when OKX sends a non zero checksum it is verified on every message. Keyless public connections receive
 * `checksum: 0` on every message (verified live), which carries no information, so in that case the book is kept honest
 * through the sequence chain and reports `checksumOk: null` with `integrity: "sequence"`. Any failure returns a typed
 * reason so the caller can resubscribe to get a fresh snapshot.
 */

import { isRecord, parseCountText, parseJsonInt, parseMs, parseNonNegative, parsePositive } from "./okx-parse";
import type { DeskBook, DeskBookLevel } from "./types";

export const BOOK_DEPTH_CAP = 400;
export const BOOK5_DEPTH = 5;
export const CHECKSUM_LEVELS = 25;

export interface BookEntry extends DeskBookLevel {
  /** Price exactly as OKX printed it (used by the checksum). */
  readonly pxText: string;
  /** Size exactly as OKX printed it (used by the checksum). */
  readonly szText: string;
}

export interface BookState extends DeskBook {
  readonly bids: readonly BookEntry[];
  readonly asks: readonly BookEntry[];
  readonly channel: "books" | "books5";
  /** True once a non zero checksum was received on this subscription: from then on a checksum of 0 is a real value. */
  readonly checksumSeen: boolean;
}

export type BookFailure = "malformed" | "sequence" | "checksum";

export type BookStep =
  | { readonly ok: true; readonly book: BookState; readonly verified: "checksum" | "sequence" | "none" }
  | { readonly ok: false; readonly reason: BookFailure; readonly detail: string; readonly suspect?: BookState };

// ---------------------------------------------------------------------------
// CRC32 (IEEE 802.3, reflected, polynomial 0xEDB88320) returning a signed 32 bit integer like OKX
// ---------------------------------------------------------------------------

let crcTable: Int32Array | null = null;

function table(): Int32Array {
  if (crcTable !== null) return crcTable;
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  crcTable = t;
  return t;
}

/** CRC32 of the UTF-16 code units of `text` taken as bytes (the checksum string is plain ASCII). Signed 32 bit. */
export function crc32(text: string): number {
  const t = table();
  let crc = -1;
  for (let i = 0; i < text.length; i += 1) crc = t[(crc ^ text.charCodeAt(i)) & 0xff]! ^ (crc >>> 8);
  return (crc ^ -1) | 0;
}

/**
 * Checksum string of OKX: the first 25 levels of each side interleaved as bid1Px:bid1Sz:ask1Px:ask1Sz:bid2Px...
 * When one side has fewer levels the other side simply continues.
 */
export function checksumInput(
  bids: readonly { readonly pxText: string; readonly szText: string }[],
  asks: readonly { readonly pxText: string; readonly szText: string }[],
): string {
  const parts: string[] = [];
  for (let i = 0; i < CHECKSUM_LEVELS; i += 1) {
    const bid = bids[i];
    if (bid !== undefined) parts.push(bid.pxText, bid.szText);
    const ask = asks[i];
    if (ask !== undefined) parts.push(ask.pxText, ask.szText);
  }
  return parts.join(":");
}

export function bookChecksum(
  bids: readonly { readonly pxText: string; readonly szText: string }[],
  asks: readonly { readonly pxText: string; readonly szText: string }[],
): number {
  return crc32(checksumInput(bids, asks));
}

// ---------------------------------------------------------------------------
// Parsing and merging
// ---------------------------------------------------------------------------

function parseLevels(raw: unknown): BookEntry[] | null {
  if (!Array.isArray(raw)) return null;
  const out: BookEntry[] = [];
  for (const level of raw) {
    if (!Array.isArray(level) || level.length < 2) return null;
    const px = parsePositive(level[0]);
    const sz = parseNonNegative(level[1]);
    if (px === null || sz === null) return null;
    let orders = 0;
    if (level.length >= 4) {
      const parsed = parseCountText(level[3]);
      if (parsed === null) return null;
      orders = parsed;
    }
    out.push({ px, sz, orders, pxText: level[0] as string, szText: level[1] as string });
  }
  return out;
}

function mergeSide(
  previous: readonly BookEntry[],
  deltas: readonly BookEntry[],
  descending: boolean,
  cap: number,
): readonly BookEntry[] {
  const byPrice = new Map<number, BookEntry>();
  for (const entry of previous) byPrice.set(entry.px, entry);
  for (const delta of deltas) {
    if (delta.sz === 0) byPrice.delete(delta.px);
    else byPrice.set(delta.px, delta);
  }
  const merged = [...byPrice.values()].sort(descending ? (a, b) => b.px - a.px : (a, b) => a.px - b.px);
  return merged.length > cap ? merged.slice(0, cap) : merged;
}

interface ParsedBookRow {
  readonly bids: BookEntry[];
  readonly asks: BookEntry[];
  readonly tsMs: number;
  readonly seqId: number | null;
  readonly prevSeqId: number | null;
  readonly checksum: number | null;
}

function parseBookRow(row: unknown): ParsedBookRow | null {
  if (!isRecord(row)) return null;
  const bids = parseLevels(row.bids);
  const asks = parseLevels(row.asks);
  const tsMs = parseMs(row.ts);
  if (bids === null || asks === null || tsMs === null) return null;
  const checksum = row.checksum === undefined ? null : parseJsonInt(row.checksum);
  if (row.checksum !== undefined && checksum === null) return null;
  const seqId = row.seqId === undefined ? null : parseJsonInt(row.seqId);
  const prevSeqId = row.prevSeqId === undefined ? null : parseJsonInt(row.prevSeqId);
  if ((row.seqId !== undefined && seqId === null) || (row.prevSeqId !== undefined && prevSeqId === null)) return null;
  return { bids, asks, tsMs, seqId, prevSeqId, checksum };
}

/** Applies one message of the `books` channel. `prev` is the book before the message, null when none. */
export function applyBooksMessage(
  prev: BookState | null,
  instId: string,
  action: "snapshot" | "update",
  row: unknown,
): BookStep {
  const parsed = parseBookRow(row);
  if (parsed === null) return { ok: false, reason: "malformed", detail: "Mensagem de livro fora do formato esperado." };
  if (parsed.seqId === null) return { ok: false, reason: "malformed", detail: "Mensagem de livro sem seqId." };

  let bids: readonly BookEntry[];
  let asks: readonly BookEntry[];
  let previous: BookState | null = null;
  if (action === "snapshot") {
    bids = mergeSide([], parsed.bids, true, BOOK_DEPTH_CAP);
    asks = mergeSide([], parsed.asks, false, BOOK_DEPTH_CAP);
  } else {
    if (prev === null || prev.channel !== "books" || prev.seqId === null) {
      return { ok: false, reason: "sequence", detail: "Atualizacao de livro recebida sem snapshot anterior." };
    }
    if (parsed.prevSeqId === null) {
      return { ok: false, reason: "malformed", detail: "Atualizacao de livro sem prevSeqId." };
    }
    if (parsed.seqId < parsed.prevSeqId) {
      return { ok: false, reason: "sequence", detail: "A OKX reiniciou a sequencia do livro." };
    }
    if (parsed.prevSeqId !== prev.seqId) {
      return { ok: false, reason: "sequence", detail: `Quebra de sequencia do livro: esperado ${prev.seqId}, recebido ${parsed.prevSeqId}.` };
    }
    previous = prev;
    bids = mergeSide(prev.bids, parsed.bids, true, BOOK_DEPTH_CAP);
    asks = mergeSide(prev.asks, parsed.asks, false, BOOK_DEPTH_CAP);
  }

  const seenBefore = previous?.checksumSeen === true;
  const received = parsed.checksum;
  const checksumActive = received !== null && (received !== 0 || seenBefore);
  const checksumSeen = seenBefore || (received !== null && received !== 0);
  const base = {
    instId,
    bids,
    asks,
    tsMs: parsed.tsMs,
    seqId: parsed.seqId,
    channel: "books" as const,
    checksumSeen,
  };

  if (checksumActive && received !== null) {
    const expected = bookChecksum(bids, asks);
    if (((received | 0) !== expected)) {
      const suspect: BookState = { ...base, checksumOk: false, integrity: "checksum" };
      return { ok: false, reason: "checksum", detail: "Checksum do livro nao confere com o da OKX.", suspect };
    }
    return { ok: true, verified: "checksum", book: { ...base, checksumOk: true, integrity: "checksum" } };
  }
  return {
    ok: true,
    verified: action === "snapshot" ? "none" : "sequence",
    book: { ...base, checksumOk: null, integrity: "sequence" },
  };
}

/** Applies one `books5` message: a full snapshot of the best five levels, nothing to verify. */
export function applyBooks5Message(instId: string, row: unknown): BookStep {
  const parsed = parseBookRow(row);
  if (parsed === null) return { ok: false, reason: "malformed", detail: "Mensagem de livro (5 niveis) fora do formato esperado." };
  const bids = mergeSide([], parsed.bids, true, BOOK5_DEPTH);
  const asks = mergeSide([], parsed.asks, false, BOOK5_DEPTH);
  return {
    ok: true,
    verified: "none",
    book: {
      instId,
      bids,
      asks,
      tsMs: parsed.tsMs,
      seqId: parsed.seqId,
      channel: "books5",
      checksumSeen: false,
      checksumOk: null,
      integrity: "snapshot",
    },
  };
}

/** Number of levels per side the channel behind this book can ever deliver; fewer levels means the side is complete. */
export function bookLevelCap(book: DeskBook): number {
  return book.integrity === "snapshot" ? BOOK5_DEPTH : BOOK_DEPTH_CAP;
}
