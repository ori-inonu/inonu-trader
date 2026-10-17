export type DevBookQuality = "current" | "partial" | "stale" | "unavailable";

export interface DevBookStatus {
 readonly atMs: number;
 readonly observedAtMs: number | null;
 readonly quality: DevBookQuality;
 readonly totalUsd: number | null;
 readonly agentUsd: number | null;
 readonly cashUsd: number | null;
}

export interface DevAgentStatus {
 readonly atMs: number;
 readonly connected: boolean;
 readonly book: DevBookStatus | null;
}

const rec = (value: unknown): Record<string, unknown> | null =>
 value !== null && typeof value === "object" && !Array.isArray(value)
  ? value as Record<string, unknown>
  : null;
const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const nullableFinite = (value: unknown): value is number | null => value === null || finite(value);
const exactKeys = (value: Record<string, unknown>, keys: readonly string[]): boolean =>
 Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));

const BOOK_QUALITIES: readonly DevBookQuality[] = ["current", "partial", "stale", "unavailable"];
const STATUS_KEYS = ["atMs", "connected", "book"] as const;
const BOOK_KEYS = ["atMs", "observedAtMs", "quality", "totalUsd", "agentUsd", "cashUsd"] as const;

export function parseDevStatus(body: unknown): DevAgentStatus | null {
 const envelope = rec(body);
 const status = envelope?.ok === true ? rec(envelope.status) : null;
 if (status === null || !exactKeys(status, STATUS_KEYS) || !finite(status.atMs) || typeof status.connected !== "boolean") return null;
 if (status.book === null) return { atMs: status.atMs, connected: status.connected, book: null };
 const book = rec(status.book);
 if (
  book === null ||
  !exactKeys(book, BOOK_KEYS) ||
  !finite(book.atMs) ||
  !nullableFinite(book.observedAtMs) ||
  typeof book.quality !== "string" ||
  !BOOK_QUALITIES.includes(book.quality as DevBookQuality) ||
  !nullableFinite(book.totalUsd) ||
  !nullableFinite(book.agentUsd) ||
  !nullableFinite(book.cashUsd)
 ) return null;
 return {
  atMs: status.atMs,
  connected: status.connected,
  book: {
   atMs: book.atMs,
   observedAtMs: book.observedAtMs,
   quality: book.quality as DevBookQuality,
   totalUsd: book.totalUsd,
   agentUsd: book.agentUsd,
   cashUsd: book.cashUsd,
  },
 };
}
