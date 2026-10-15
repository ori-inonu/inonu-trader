/**
 * The durable record of the agent (AUT-9), in the same spirit as the operator ledger: the decision is written BEFORE anything is done, an order is marked `enviando` BEFORE the signing tool is called, and an
 * order that was sent and never settled is `em voo` after a restart and is never sent again. A line that cannot be read makes the ledger unhealthy and the agent holds; a write that fails throws, so the agent
 * never acts on something it could not record. Append-only JSON lines; the file is the truth, the memory is a view of it.
 */
import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, writeFileSync, writeSync } from "node:fs";
import { dirname } from "node:path";
import { dayKey } from "../operator/ledger";
import { MODES, POSTURES, type Mode, type Posture, type WalletKind } from "./types";

export const orderKey = (cycleId: string, candidateId: string): string => `${cycleId}:${candidateId}`;

export interface CycleRecord {
  readonly kind: "cycle";
  readonly cycleId: string;
  readonly atMs: number;
  readonly mode: Mode;
  readonly outcome: "mantido" | "decidido" | "bloqueado" | "erro";
  /** Why it held or was blocked: a constant code, never a message with a value in it. */
  readonly reason: string | null;
  readonly posture: Posture | null;
  /** candidate id -> the stance chosen. */
  readonly stances: Readonly<Record<string, string>>;
  readonly planned: number;
  readonly dropped: readonly { readonly candidateId: string; readonly reason: string }[];
  readonly modelo: string | null;
}

export const ORDER_STAGES = ["preparada", "enviando", "executada", "falhou", "incerta"] as const;
export type OrderStage = (typeof ORDER_STAGES)[number];

import { parseQuoteFacts, type QuoteFacts } from "./quote-facts";

export interface OrderRecord {
  readonly kind: "order";
  readonly cycleId: string;
  readonly atMs: number;
  readonly orderKey: string;
  readonly stage: OrderStage;
  readonly candidateId: string;
  readonly side: "buy" | "sell";
  readonly stance: string;
  readonly chainIndex: string;
  readonly symbol: string;
  readonly address: string;
  readonly wallet: WalletKind;
  readonly usd: number;
  readonly amountMinor: string | null;
  /** The order id or transaction hash the signing tool reported; null until it did. */
  readonly ref: string | null;
  readonly reason: string | null;
  /** What the tool said when it refused without proving anything: cut, plain text from outside, shown to the person and never given to the model. */
  readonly detail?: string;
  /** A purchase: the profile of target and stop the model chose. */
  readonly profile: string | null;
  /** Who asked for it: the model, or the plan of a position. */
  readonly source: "modelo" | "protecao";
  /** The balance of the token in the agent's wallet, in its smallest unit, when the order was written; "0" when it held none and null when it could not be read. What settles an order whose answer never came (reconcile.ts). Absent on records of before. */
  readonly balanceBeforeMinor?: string | null;
  /** The allowlisted facts of the quote the order was made under (quote-facts.ts), written from the executor's answer on and kept by every later stage; absent on older records and before the quote was read. */
  readonly quote?: QuoteFacts;
}

export type LedgerRecord = CycleRecord | OrderRecord;

export type LedgerHealth = { readonly ok: true } | { readonly ok: false; readonly reason: "ledger_corrompido" };

export interface AgentLedger {
  health(): LedgerHealth;
  /** Writes the record to the file first; throws `ledger_corrompido` or `ledger_nao_gravou` and records nothing in memory in that case. */
  append(record: LedgerRecord): void;
  orderStage(key: string): OrderStage | null;
  /**
   * True only for a key never seen or still only `preparada`: a key that went out, failed or is uncertain never starts again. The cycle does not call it: an order key is the id of its cycle plus its candidate, and a
   * cycle id is unique (the time it began in base 36 and a counter), so no key is ever written twice and an order left `preparada` by a crash is never sent later. This stays as the check for a caller that
   * asks BEFORE writing a record (after the write the stage is `preparada` again and the answer is lost).
   */
  mayStart(key: string): boolean;
  /** Orders sent and not settled (`enviando` or `incerta`), which must be reconciled with the wallet before anything else is sent. */
  inFlight(): readonly string[];
  /** The last record of each order in flight, so the person (and the cycle) can see what is unresolved. */
  inFlightRecords(): readonly OrderRecord[];
  /** The last record of EVERY order ever written (not only the recent tail): what the half at a target already sold is counted from. */
  orderRecords(): readonly OrderRecord[];
  /** The person's word, after looking at their wallet history, on an order in flight: it went out (`executada`) or it did not (`falhou`). False when that order is not in flight. */
  /** Settles an order in flight; `reason` says who or what proved it (the person's word by default, or a receipt of the tool's own history). The reference of the order is kept. */
  resolve(orderKey: string, stage: "executada" | "falhou", atMs: number, reason?: string, ref?: string): boolean;
  /** Dollars that went out today (sent, settled or uncertain; not failed), by side, each order once. */
  spentTodayUsd(nowMs: number): { readonly buy: number; readonly sell: number };
  tail(count: number): readonly LedgerRecord[];
}

const MEMORY_TAIL = 500;

const str = (v: unknown): v is string => typeof v === "string" && v.length > 0 && v.length <= 400;
const ms = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v) && v >= 0;
const strOrNull = (v: unknown): v is string | null => v === null || str(v);

function parseRecord(raw: unknown): LedgerRecord | null {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  if (o.kind === "cycle") {
    if (!str(o.cycleId) || !ms(o.atMs) || typeof o.mode !== "string" || !(MODES as readonly string[]).includes(o.mode)) return null;
    if (!["mantido", "decidido", "bloqueado", "erro"].includes(o.outcome as string) || !strOrNull(o.reason) || !strOrNull(o.modelo)) return null;
    if (o.posture !== null && !(typeof o.posture === "string" && (POSTURES as readonly string[]).includes(o.posture))) return null;
    if (o.stances === null || typeof o.stances !== "object" || Array.isArray(o.stances) || !Object.values(o.stances).every((v) => typeof v === "string")) return null;
    if (!ms(o.planned) || !Array.isArray(o.dropped) || !o.dropped.every((d) => d !== null && typeof d === "object" && str((d as { candidateId?: unknown }).candidateId) && str((d as { reason?: unknown }).reason))) return null;
    return o as unknown as CycleRecord;
  }
  if (o.kind === "order") {
    if (!str(o.cycleId) || !ms(o.atMs) || !str(o.orderKey) || !ORDER_STAGES.includes(o.stage as OrderStage) || !str(o.candidateId) || (o.side !== "buy" && o.side !== "sell")) return null;
    if (!str(o.stance) || !str(o.chainIndex) || !str(o.symbol) || !str(o.address) || (o.wallet !== "agente" && o.wallet !== "principal")) return null;
    if (typeof o.usd !== "number" || !Number.isFinite(o.usd) || o.usd < 0 || !strOrNull(o.amountMinor) || !strOrNull(o.ref) || !strOrNull(o.reason)) return null;
    // records written before profiles and sources existed are read as the model's, without a profile
    const profile = o.profile === undefined ? null : o.profile;
    const source = o.source === undefined ? "modelo" : o.source;
    if (!strOrNull(profile) || (source !== "modelo" && source !== "protecao")) return null;
    if (o.balanceBeforeMinor !== undefined && !strOrNull(o.balanceBeforeMinor)) return null;
    if (o.detail !== undefined && (typeof o.detail !== "string" || o.detail.length > 200)) return null;
    // the facts of the quote are telemetry: shaped exactly or left out of the record, never a reason to refuse the ledger
    const { quote: rawQuote, ...rest } = o;
    const quote = rawQuote === undefined ? null : parseQuoteFacts(rawQuote);
    return { ...rest, profile, source, ...(quote === null ? {} : { quote }) } as unknown as OrderRecord;
  }
  return null;
}

export interface AgentLedgerDeps {
  /** Every line of the file, oldest first. */
  readonly read: () => readonly string[];
  /** Appends one line (no trailing newline) and throws when it could not be written. */
  readonly append: (line: string) => void;
}

export function createAgentLedger(deps: AgentLedgerDeps): AgentLedger {
  let healthy = true;
  const tail: LedgerRecord[] = [];
  const orders = new Map<string, { last: OrderRecord; sentAtMs: number | null }>();

  const apply = (record: LedgerRecord) => {
    tail.push(record);
    if (tail.length > MEMORY_TAIL) tail.shift();
    if (record.kind !== "order") return;
    const before = orders.get(record.orderKey);
    const sentAtMs = before?.sentAtMs ?? (record.stage === "enviando" ? record.atMs : null);
    orders.set(record.orderKey, { last: record, sentAtMs });
  };

  try {
    for (const line of deps.read()) {
      if (line.trim().length === 0) continue;
      const record = parseRecord(JSON.parse(line));
      if (record === null) throw new Error("shape");
      apply(record);
    }
  } catch {
    healthy = false;
  }

  return {
    health: () => (healthy ? { ok: true } : { ok: false, reason: "ledger_corrompido" }),
    append(record) {
      if (!healthy) throw new Error("ledger_corrompido");
      const checked = parseRecord(JSON.parse(JSON.stringify(record)));
      if (checked === null) throw new Error("ledger_registro_invalido");
      try {
        deps.append(JSON.stringify(checked));
      } catch {
        throw new Error("ledger_nao_gravou");
      }
      apply(checked);
    },
    orderStage: (key) => orders.get(key)?.last.stage ?? null,
    mayStart: (key) => {
      const stage = orders.get(key)?.last.stage;
      return stage === undefined || stage === "preparada";
    },
    inFlight: () => [...orders].filter(([, v]) => v.last.stage === "enviando" || v.last.stage === "incerta").map(([k]) => k),
    inFlightRecords: () => [...orders.values()].filter((v) => v.last.stage === "enviando" || v.last.stage === "incerta").map((v) => v.last),
    orderRecords: () => [...orders.values()].map((v) => v.last),
    resolve(key, stage, atMs, reason = "resolvida_pelo_usuario", ref) {
      const before = orders.get(key)?.last;
      if (before === undefined || (before.stage !== "enviando" && before.stage !== "incerta")) return false;
      if (!healthy) throw new Error("ledger_corrompido");
      // whoever settles it leaves the trace of how, and the transaction reference the order carried is kept: the audit trail says what proved it
      // a reference found afterwards (the order never had one) is kept; the one the order carried is never replaced
      const record: OrderRecord = { ...before, stage, atMs, ref: before.ref ?? ref ?? null, reason };
      try {
        deps.append(JSON.stringify(record));
      } catch {
        throw new Error("ledger_nao_gravou");
      }
      apply(record);
      return true;
    },
    spentTodayUsd(nowMs) {
      const today = dayKey(nowMs);
      let buy = 0;
      let sell = 0;
      for (const { last, sentAtMs } of orders.values()) {
        if (sentAtMs === null || dayKey(sentAtMs) !== today) continue;
        if (last.stage !== "enviando" && last.stage !== "executada" && last.stage !== "incerta") continue;
        if (last.side === "buy") buy += last.usd;
        else sell += last.usd;
      }
      return { buy, sell };
    },
    tail: (count) => tail.slice(-Math.max(0, count)),
  };
}

/**
 * A power cut in the middle of the last write leaves a last line that is cut short and has no newline (the independent review of 2026-10-15, SF-4). That line is the ONE known shape of such a cut: it is set aside, in a file
 * beside the ledger kept for the audit, and the ledger goes on with every whole record before it; a last line that is a whole record and only lost its newline is kept and the newline put back. A line that cannot be read
 * anywhere else, or one that ends with a newline, is not a torn write: it stays a corrupt ledger and everything is refused.
 */
function repairTail(path: string, nowMs: number): void {
  if (!existsSync(path)) return;
  const text = readFileSync(path, "utf8");
  if (text.length === 0 || text.endsWith("\n")) return;
  const cut = text.lastIndexOf("\n") + 1;
  const fragment = text.slice(cut);
  let whole = false;
  try {
    whole = fragment.trim().length > 0 && parseRecord(JSON.parse(fragment)) !== null;
  } catch {
    whole = false;
  }
  if (whole) {
    writeDurable(path, `${text}\n`);
    return;
  }
  writeFileSync(`${path}.torn-${nowMs}`, fragment);
  writeDurable(path, text.slice(0, cut));
}

/** The file replaced as a whole by a temporary one in the same folder, written to the disk before the rename. */
function writeDurable(path: string, content: string): void {
  const temp = `${path}.tmp-${process.pid}`;
  const fd = openSync(temp, "w");
  try {
    writeSync(fd, content);
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  renameSync(temp, path);
}

export function createFileAgentLedger(path: string): AgentLedger {
  repairTail(path, Date.now());
  return createAgentLedger({
    read: () => (existsSync(path) ? readFileSync(path, "utf8").split("\n") : []),
    append: (line) => {
      mkdirSync(dirname(path), { recursive: true });
      // the mark of an order is written to the DISK before the order goes out: a power cut right after the send must not forget it
      const fd = openSync(path, "a");
      try {
        writeSync(fd, `${line}\n`);
        fsyncSync(fd);
      } finally {
        closeSync(fd);
      }
    },
  });
}
