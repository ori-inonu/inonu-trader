/**
 * The local log of every attempt to carry out an order through the person's wallet (WAL-10, EXE-7): what was asked, the hash the wallet gave, and how it ended. It holds no key, no signature and no address
 * but the transaction hash and the token the order was about; it stays on this machine, in the browser storage, and it is also what the daily cap is counted from, so it is written BEFORE the wallet is asked
 * (an attempt that is open in the wallet counts against the cap from that moment, and a wallet window that is answered late can never be an order the cap did not see).
 *
 * The storage is shared by every tab: the log is RE-READ on every `list()` and every write is a read-modify-write, so an order sent in one tab counts in the others. When the entries cannot be kept (no storage, or
 * a write that fails) `durable` is false and the gate stops the order: a cap that forgets on reload is not a cap. Read back only if each entry is exactly the shape.
 */

export const TRADE_LOG_KEY = "inonu.trade.log.v1";
/** Far more than the orders of any day, and the 24 hour window always fits in it. */
const MAX_ENTRIES = 500;
const DAY_MS = 24 * 3_600_000;
const HASH = /^0x[0-9a-fA-F]{64}$/;
const PLAIN = /^[A-Za-z0-9._:-]{1,160}$/;
const SYMBOL = /^[A-Za-z0-9]{1,20}$/;
const ID = /^[A-Za-z0-9]{8,40}$/;

export type TradeStep = "approve" | "swap";
export type TradeResult =
  /** The request is open in the wallet (or its answer was lost): counted, because the person may still approve it. */
  | "pendente"
  /** The wallet showed the request and the person said no. */
  | "recusada"
  /** The wallet took the order and gave a transaction hash; the chain has not confirmed yet. */
  | "enviada"
  /** The chain confirmed it. */
  | "confirmada"
  /** The chain confirmed that it failed (the transaction reverted). */
  | "revertida"
  /** The wallet or the connection failed before there was a hash, and the wallet said it was not sent. */
  | "falhou"
  /** There is a hash, and no receipt within the time the app waits; the person can look it up in the explorer. */
  | "sem_recibo";

export interface TradeLogEntry {
  /** What ties the entry written before the wallet was asked to the answer that comes after. */
  readonly id: string;
  readonly atMs: number;
  readonly chainIndex: string;
  readonly side: "buy" | "sell";
  readonly step: TradeStep;
  readonly symbol: string;
  /** What the order was worth when it was confirmed, in dollars; null when it could not be worked out. */
  readonly usd: number | null;
  readonly txHash: string | null;
  readonly result: TradeResult;
  /** The hash of the Brief of the Inonu answer behind the order, when there was one. */
  readonly briefHash: string | null;
}

const RESULTS: readonly string[] = ["pendente", "recusada", "enviada", "confirmada", "revertida", "falhou", "sem_recibo"];
const KEYS = ["atMs", "briefHash", "chainIndex", "id", "result", "side", "step", "symbol", "txHash", "usd"].join(",");

function parseEntry(raw: unknown): TradeLogEntry | null {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  if (Object.keys(r).sort().join(",") !== KEYS) return null;
  if (typeof r.id !== "string" || !ID.test(r.id)) return null;
  if (typeof r.atMs !== "number" || !Number.isFinite(r.atMs)) return null;
  if (typeof r.chainIndex !== "string" || !/^\d{1,12}$/.test(r.chainIndex)) return null;
  if (r.side !== "buy" && r.side !== "sell") return null;
  if (r.step !== "approve" && r.step !== "swap") return null;
  if (typeof r.symbol !== "string" || !SYMBOL.test(r.symbol)) return null;
  if (r.usd !== null && (typeof r.usd !== "number" || !Number.isFinite(r.usd) || r.usd < 0)) return null;
  if (r.txHash !== null && (typeof r.txHash !== "string" || !HASH.test(r.txHash))) return null;
  if (typeof r.result !== "string" || !RESULTS.includes(r.result)) return null;
  if (r.briefHash !== null && (typeof r.briefHash !== "string" || !PLAIN.test(r.briefHash))) return null;
  return r as unknown as TradeLogEntry;
}

/**
 * The orders that count against the daily cap: swaps that were asked of the wallet and were not refused, in the last 24 hours. A refused or failed one spent nothing; a reverted one did not move the money (it cost
 * the fee, which the cap in dollars of the order does not measure). An entry dated in the future (the clock was set back) counts: it is never read as old.
 */
export function spentLast24hUsd(entries: readonly TradeLogEntry[], nowMs: number): number {
  let total = 0;
  for (const e of entries) {
    if (e.step !== "swap" || e.usd === null) continue;
    if (e.result !== "pendente" && e.result !== "enviada" && e.result !== "confirmada" && e.result !== "sem_recibo") continue;
    if (nowMs - e.atMs >= DAY_MS) continue;
    total += e.usd;
  }
  return total;
}

export interface TradeLogStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** A new id for an entry: plain characters, not guessable and not repeated. */
export function newEntryId(): string {
  const bytes = new Uint8Array(10);
  try {
    crypto.getRandomValues(bytes);
  } catch {
    for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  }
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function createTradeLog(options: { readonly storage?: TradeLogStorage | null } = {}) {
  const storage = options.storage ?? null;
  let memory: TradeLogEntry[] = [];
  /** What is kept NOW: another tab may have written since this page last looked. */
  const fresh = (): TradeLogEntry[] => {
    if (storage === null) return memory;
    try {
      const kept = storage.getItem(TRADE_LOG_KEY);
      const parsed: unknown = kept === null ? [] : JSON.parse(kept);
      if (Array.isArray(parsed)) memory = parsed.map(parseEntry).filter((e): e is TradeLogEntry => e !== null).slice(-MAX_ENTRIES);
    } catch {
      // a blocked storage leaves what this page knew
    }
    return memory;
  };
  const listeners = new Set<() => void>();
  const notify = (): void => {
    for (const listener of [...listeners]) {
      try {
        listener();
      } catch {
        // a listener that fails must not keep the others from hearing
      }
    }
  };
  /** Keeps the entries; false when they could not be kept (the order must not go on). */
  const save = (next: TradeLogEntry[]): boolean => {
    if (storage === null) return false;
    try {
      storage.setItem(TRADE_LOG_KEY, JSON.stringify(next));
    } catch {
      return false;
    }
    memory = next;
    notify();
    return true;
  };
  return {
    /** Whether what is written here survives a reload: without it the daily cap cannot be kept. */
    durable: storage !== null,
    list: (): readonly TradeLogEntry[] => fresh(),
    /** Adds one entry; an entry that is not exactly the shape is refused, and so is one that could not be kept. */
    add(entry: TradeLogEntry): boolean {
      if (parseEntry(entry) === null) return false;
      return save([...fresh(), { ...entry }].slice(-MAX_ENTRIES));
    },
    /** The same attempt, later: what the wallet answered (the hash, the refusal), found by the id written before. */
    settle(id: string, patch: { readonly txHash?: string | null; readonly result: TradeResult }): boolean {
      const entries = fresh();
      const index = entries.findIndex((e) => e.id === id);
      if (index < 0 || !RESULTS.includes(patch.result)) return false;
      const next = entries.map((e, i) => (i === index ? { ...e, result: patch.result, txHash: patch.txHash === undefined ? e.txHash : patch.txHash } : e));
      if (next.some((e) => parseEntry(e) === null)) return false;
      return save(next);
    },
    /** The chain spoke: the result of the entry that has this hash moves from "enviada" to what the chain said. */
    resolve(txHash: string, result: TradeResult): boolean {
      const entries = fresh();
      const index = entries.findIndex((e) => e.txHash === txHash);
      if (index < 0 || !RESULTS.includes(result)) return false;
      return save(entries.map((e, i) => (i === index ? { ...e, result } : e)));
    },
    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    /** Tells the listeners that the storage changed under this page (another tab wrote it). */
    changedElsewhere(): void {
      fresh();
      notify();
    },
  };
}

export type TradeLog = ReturnType<typeof createTradeLog>;

let shared: TradeLog | null = null;

export function sharedTradeLog(): TradeLog {
  if (shared === null) {
    shared = createTradeLog({ storage: localStorageOrNull() });
    try {
      if (typeof window !== "undefined") {
        const log = shared;
        window.addEventListener("storage", (e) => {
          if (e.key === TRADE_LOG_KEY || e.key === null) log.changedElsewhere();
        });
      }
    } catch {
      // no events: every read of the log still reads the storage again
    }
  }
  return shared;
}

function localStorageOrNull(): TradeLogStorage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}
