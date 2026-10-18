import { MOMENTUM } from "./momentum";
import { MAX_STALE_MS } from "./timing";


/**
 * The study of the decisions, from the files the agent already keeps (the consults, the orders, the fills and the Placar), for the screen of analysis. Pure and read only: nothing here reads a file or calls the network, and
 * a record that is not what is expected is skipped, never an error. Everything is counted from what was RECORDED: the funnel from the item of purchase to the order that went out, how much the model wanted to buy, the closed
 * round trips (cash that went out and came back, before the network fee, never a profit), and what the price did after each decision not to buy (a counterfactual, before cost and impact).
 */

export interface AnalysisInput {
 readonly nowMs: number;
 /** The consult records (briefs.jsonl), oldest first. */
 readonly briefs: readonly unknown[];
 /** The last record of each order (ledger). */
 readonly orders: readonly unknown[];
 /** The real fills (fills.jsonl). */
 readonly fills: readonly unknown[];
 /** The lines of the Placar (scoreboard.jsonl): decisions and settlements. */
 readonly scoreboard: readonly unknown[];
 /** One-based page of the newest retained cycle reviews (12 per page). */
 readonly reviewPage?: number;
}

export interface WindowStats {
 readonly n: number;
 readonly up: number;
 readonly mean: number | null;
 readonly vals: readonly number[];
}
export type GroupStats = Readonly<{ "15m": WindowStats; "1h": WindowStats }>;

export interface AnalysisView {
 readonly atMs: number;
 readonly funnel: { readonly consults: number; readonly items: number; readonly closed: number; readonly open: number; readonly asked: number; readonly applied: number; readonly executed: number; readonly failed: number };
 readonly asks: readonly { readonly t: number; readonly s: string | null; readonly p: number; readonly ok: boolean }[];
 readonly hist: { readonly all: readonly number[]; readonly fresh: readonly number[] };
 readonly timeline: readonly { readonly t: number; readonly open: number; readonly asked: number; readonly applied: number }[];
 readonly trips: readonly { readonly s: string; readonly in: number; readonly out: number; readonly pct: number; readonly buyAt: number; readonly sellAt: number }[];
 readonly fees: { readonly lamports: number; readonly fills: number; readonly unmatchedSells: number };
 readonly placar: { readonly skipped: GroupStats; readonly closed: GroupStats; readonly gated: GroupStats };
 readonly recent: readonly { readonly t: number; readonly s: string | null; readonly kind: string; readonly m15: number | null; readonly m1h: number | null }[];
 /** How the orders ended (the last stage of each), why the failed ones failed, and the dollars sent today (UTC day, like the daily caps), by side. */
 readonly orders: { readonly outcomes: Readonly<Record<string, number>>; readonly reasons: Readonly<Record<string, number>>; readonly spentToday: { readonly buy: number; readonly sell: number } };
 /** What the running agent knows and the files do not: the tokens the model used today and the risk per operation in force. The pure study leaves them null; the service fills them. */
 readonly runtime: { readonly tokensToday: number | null; readonly riskPct: number | null };
 readonly cycleReviewPage: { readonly page: number; readonly pageSize: number; readonly total: number; readonly totalPages: number };
 readonly cycleReviews: readonly CycleReview[];
}

export type ReviewFindingCode =
 | "input_unknown"
 | "data_stale"
 | "stance_diverged"
 | "estimated_cost_unknown"
 | "realized_fee_unknown"
 | "order_uncertain"
 | "outcome_unmeasured";

export interface CycleReviewFinding {
 readonly code: ReviewFindingCode;
 readonly source: "brief" | "context" | "order" | "fill" | "scoreboard";
 readonly candidateId: string | null;
 readonly orderKey: string | null;
 readonly decision: "action" | "inaction" | null;
 readonly window: string | null;
 readonly fields: readonly string[];
}

export type CycleReviewEvidenceValue =
 | string
 | number
 | boolean
 | null
 | readonly (string | number | boolean | null)[]
 | Readonly<Record<string, string | number | boolean | null>>;

export interface CycleReviewWindow {
 readonly window: "15m" | "1h" | "4h" | "24h";
 readonly status: "pending" | "measured" | "unknown" | "unmeasured";
 readonly settledAtMs: number | null;
 readonly priceUsd: number | null;
 readonly movePct: number | null;
 readonly reason: string | null;
}

export interface CycleReviewDecision {
 readonly key: string;
 readonly orderKey: string;
 readonly side: "buy" | "sell";
 readonly stance: string | null;
 readonly atMs: number;
 readonly entryPriceUsd: number | null;
 /** A quote estimate, never the realized fee or net return. */
 readonly estimatedCostUsd: number | null;
}

export interface CycleReviewFill {
 readonly orderKey: string;
 readonly atMs: number;
 readonly atSource: "chain" | "ledger" | null;
 readonly side: "buy" | "sell";
 readonly walletFeeLamports: string | null;
}

export interface CycleReviewFreshness {
 readonly status: "age_observed" | "data_stale" | "unknown";
 readonly source: string | null;
 readonly ageMin: number | null;
}

export interface CycleReviewItem {
 readonly candidateId: string;
 readonly kind: "holding" | "buy";
 /** Frozen options and candidate facts that were available in the brief. */
 readonly frozen: {
  readonly steps: readonly string[] | null;
  readonly marks: readonly string[];
  readonly families: readonly string[];
  readonly triggers: readonly string[];
  readonly evidence: Readonly<Record<string, CycleReviewEvidenceValue>> | null;
 };
 readonly requested: string | null;
 readonly applied: string | null;
 readonly gate: { readonly asked: string; readonly applied: string; readonly conviction: number | null; readonly bar: number | null; readonly reason: string | null } | null;
 readonly freshness: CycleReviewFreshness;
 /** A scoreboard mark is a decision record, not proof an order executed. */
 readonly decision: { readonly action: CycleReviewDecision | null; readonly inaction: CycleReviewDecision | null };
 readonly order: { readonly orderKey: string; readonly stage: string; readonly reason: string | null; readonly side: "buy" | "sell"; readonly stance: string | null; readonly atMs: number } | null;
 readonly results: {
  readonly postDecisionOnly: true;
  readonly fills: readonly CycleReviewFill[];
  readonly fillsTruncated: boolean;
  readonly action: readonly CycleReviewWindow[];
  readonly inaction: readonly CycleReviewWindow[];
 };
 readonly findings: readonly CycleReviewFinding[];
}

export interface CycleReview {
 readonly cycleId: string;
 /** Original timestamp from the frozen consultation record. */
 readonly atMs: number;
 readonly frozen: {
  readonly briefHash: string | null;
  readonly context: Readonly<Record<string, string | number | null>> | null;
  readonly history: Readonly<Record<string, Readonly<Record<string, number | null>>>> | null;
 };
 readonly freshness: CycleReviewFreshness;
 readonly items: readonly CycleReviewItem[];
 readonly itemsTruncated: boolean;
 readonly findings: readonly CycleReviewFinding[];
}

const MAX_REVIEW_CYCLES = 120;
const MAX_REVIEW_ITEMS = 32;
const MAX_REVIEW_PAGE_SIZE = 12;
const MAX_REVIEW_ARRAY = 24;
const MAX_REVIEW_FILLS = 4;
const MAX_REVIEW_FINDING_FIELDS = 12;
const REVIEW_WINDOWS = ["15m", "1h", "4h", "24h"] as const;
const REVIEW_WINDOW_MS: Readonly<Record<(typeof REVIEW_WINDOWS)[number], number>> = { "15m": 15 * 60_000, "1h": 60 * 60_000, "4h": 4 * 60 * 60_000, "24h": 24 * 60 * 60_000 };
const REVIEW_STALE_AGE_MIN: Readonly<Record<string, number>> = {
 "mo.ag": MOMENTUM.maxBarAgeMs / 60_000,
 "tm.ag": MAX_STALE_MS / 60_000,
 "context.s1_idade_min": 30,
};

const FUNNEL_CONSULTS = 25;
const TIMELINE_CONSULTS = 30;
const RECENT_KEPT = 40;
const BINS = 20;

const rec = (v: unknown): Record<string, unknown> | null => (v !== null && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null);
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const str = (v: unknown): string | null => (typeof v === "string" && v.length > 0 && v.length <= 80 ? v : null);
const round = (x: number, d: number): number => Math.round(x * 10 ** d) / 10 ** d;
const REVIEW_KEY = /^[a-z][a-z0-9_]{0,23}$/;
const REVIEW_CODE = /^[a-z][a-z0-9_-]{0,31}$/;
const REVIEW_CONTEXT_CODE = /^[a-z_]{1,20}$/;
const REVIEW_CONTEXT_HASH = /^[a-f0-9]{64}$/;
const REVIEW_ID = /^[A-Za-z0-9:._@-]{1,80}$/;
const REVIEW_CYCLE_ID = /^[A-Za-z0-9._-]{1,80}$/;
const REVIEW_HASH = /^(?:[a-f0-9]{16}|[a-f0-9]{64})$/;
const MAX_REVIEW_ORDER_KEY_LENGTH = 80 + 1 + 80;
const REVIEW_INACTION_SUFFIX = "|inacao";
const MAX_REVIEW_SCORE_KEY_LENGTH = MAX_REVIEW_ORDER_KEY_LENGTH + REVIEW_INACTION_SUFFIX.length;
const REVIEW_STAGES: Readonly<Record<string, true>> = { preparada: true, enviando: true, executada: true, falhou: true, incerta: true };
const REVIEW_BUY_STANCES: Readonly<Record<string, true>> = { skip: true, buy_tenth: true, buy_third: true, buy_two_thirds: true, buy_full: true };
const REVIEW_HOLDING_STANCES: Readonly<Record<string, true>> = { hold: true, trim_third: true, trim_half: true, exit_all: true };
const REVIEW_BUY_EVIDENCE: Readonly<Record<string, true>> = { s: true, n: true, w: true, p: true, b: true, l: true, v: true, c: true, h: true, t: true, d: true, u: true, r: true, m: true, f: true, x: true, y: true, o: true, pf: true, mo: true, k: true, ult: true, wu: true, sp: true, inf: true, ut: true, lp: true, tm: true, i: true };
const REVIEW_HOLDING_EVIDENCE: Readonly<Record<string, true>> = { s: true, wl: true, w: true, p: true, l: true, i: true, v: true, r: true, m: true, g: true, e: true, h: true, c5: true, c1: true, n5: true, ag: true, pt: true, mo: true, tm: true, f: true, ult: true, t: true, o: true, pl: true };
const REVIEW_EVIDENCE_ARRAYS: Readonly<Record<string, true>> = { m: true, f: true, o: true, pf: true, t: true };
const REVIEW_EVIDENCE_OBJECTS: Readonly<Record<string, Readonly<Record<string, true>>>> = {
 mo: { r5: true, r15: true, r1: true, rg: true, vr: true, ag: true },
 tm: { rsi: true, rp: true, r4: true, r24: true, up: true, dd: true, sg: true, ag: true },
 ult: { n: true, m: true, p: true, ag: true },
 pl: { pf: true, e: true, a: true, s: true, hl: true, th: true },
};
const REVIEW_GATE_REASONS: Readonly<Record<string, true>> = { abaixo_do_limiar: true, conviccao_desconhecida: true, topo_visto_pelo_jev: true, topo_sem_resposta: true, queda_vista_pelo_jev: true, queda_sem_resposta: true };

function safeReviewNumber(value: unknown, min = -1_000_000_000_000, max = 1_000_000_000_000): number | null {
 const n = num(value);
 return n !== null && n >= min && n <= max ? n : null;
}
const MAX_REVIEW_TIMESTAMP_MS = 8_640_000_000_000_000;

function safeReviewTimestamp(value: unknown): number | null {
 const n = num(value);
 return n !== null && Number.isSafeInteger(n) && Math.abs(n) <= MAX_REVIEW_TIMESTAMP_MS ? n : null;
}

function safeReviewCode(value: unknown): string | null {
 return typeof value === "string" && REVIEW_CODE.test(value) ? value : null;
}

function safeReviewId(value: unknown, cycle = false): string | null {
 return typeof value === "string" && (cycle ? REVIEW_CYCLE_ID : REVIEW_ID).test(value) ? value : null;
}
interface ReviewCompositeKey {
 readonly baseKey: string;
 readonly orderKey: string;
 readonly inaction: boolean;
}

function safeReviewCompositeKey(value: unknown): ReviewCompositeKey | null {
 if (typeof value !== "string" || value.length === 0 || value.length > MAX_REVIEW_SCORE_KEY_LENGTH) return null;
 const inaction = value.endsWith(REVIEW_INACTION_SUFFIX);
 const baseKey = inaction ? value.slice(0, -REVIEW_INACTION_SUFFIX.length) : value;
 if (baseKey.length > MAX_REVIEW_ORDER_KEY_LENGTH) return null;
 const separator = baseKey.indexOf(":");
 if (separator < 1) return null;
 const cycleId = safeReviewId(baseKey.slice(0, separator), true);
 const candidateId = safeReviewId(baseKey.slice(separator + 1));
 if (cycleId === null || candidateId === null || `${cycleId}:${candidateId}` !== baseKey) return null;
 return { baseKey, orderKey: value, inaction };
}

function safeReviewContext(raw: unknown): Readonly<Record<string, string | number | null>> | null {
 const source = rec(raw);
 if (source === null) return null;
 const entries = Object.entries(source);
 if (entries.length > 32) return null;
 const out: Record<string, string | number | null> = {};
 for (const [key, value] of entries) {
  if (!REVIEW_KEY.test(key)) return null;
  if (value === null) out[key] = null;
  else if (typeof value === "number" && (key.endsWith("_asof_ms") ? safeReviewTimestamp(value) !== null : Number.isFinite(value) && Math.abs(value) <= 1_000_000_000_000)) out[key] = value;
  else if (typeof value === "string" && (REVIEW_CONTEXT_CODE.test(value) || (key.endsWith("_fh") && REVIEW_CONTEXT_HASH.test(value)))) out[key] = value;
  else return null;
 }
 return out;
}

function safeReviewHistory(raw: unknown): Readonly<Record<string, Readonly<Record<string, number | null>>>> | null {
 const source = rec(raw);
 if (source === null) return null;
 const entries = Object.entries(source);
 if (entries.length > 20) return null;
 const out: Record<string, Readonly<Record<string, number | null>>> = {};
 for (const [key, rawRow] of entries) {
  const row = rec(rawRow);
  const n = num(row?.n), acerto = row?.acerto === null ? null : safeReviewNumber(row?.acerto, 0, 100);
  if (!REVIEW_KEY.test(key) || row === null || n === null || !Number.isSafeInteger(n) || n < 0 || (row.acerto !== null && acerto === null)) return null;
  const values: Record<string, number | null> = { n, acerto };
  for (const field of ["medio", "melhor", "pior"] as const) {
   if (!Object.hasOwn(row, field)) continue;
   const value = row[field] === null ? null : safeReviewNumber(row[field], -100, 1_000_000);
   if (row[field] !== null && value === null) return null;
   values[field] = value;
  }
  out[key] = values;
 }
 return out;
}

function safeReviewScalar(value: unknown, key: string): string | number | boolean | null | undefined {
 if (value === null) return null;
 if (typeof value === "number") return safeReviewNumber(value) ?? undefined;
 if (typeof value === "boolean") return key === "th" ? value : undefined;
 if (typeof value === "string") {
  if (key === "s" && value === "?") return value;
  return REVIEW_CODE.test(value) || /^[A-Za-z0-9$._-]{1,24}$/.test(value) ? value : undefined;
 }
 return undefined;
}

function safeReviewEvidence(raw: unknown, kind: "holding" | "buy"): Readonly<Record<string, CycleReviewEvidenceValue>> | null {
 const source = rec(raw);
 if (source === null) return null;
 const allowed = kind === "buy" ? REVIEW_BUY_EVIDENCE : REVIEW_HOLDING_EVIDENCE;
 const out: Record<string, CycleReviewEvidenceValue> = {};
 for (const [key, value] of Object.entries(source)) {
  if (kind === "holding" && key === "pt") {
   if (value === 0 || value === 1) out[key] = value;
   continue;
  }
  if (allowed[key] !== true) continue;
  if (Array.isArray(value) && REVIEW_EVIDENCE_ARRAYS[key] === true) {
   const values = value.slice(0, MAX_REVIEW_ARRAY).map((item) => safeReviewCode(item));
   out[key] = value.length <= MAX_REVIEW_ARRAY && values.every((item) => item !== null) ? values as string[] : null;
   continue;
  }
  const nestedKeys = REVIEW_EVIDENCE_OBJECTS[key];
  if (nestedKeys !== undefined) {
   const nested = rec(value);
   if (nested === null) {
    out[key] = null;
    continue;
   }
   const nestedOut: Record<string, string | number | boolean | null> = {};
   for (const [nestedKey, nestedValue] of Object.entries(nested)) {
    if (nestedKeys[nestedKey] !== true) continue;
    const safe = safeReviewScalar(nestedValue, nestedKey);
    nestedOut[nestedKey] = safe === undefined ? null : safe;
   }
   out[key] = nestedOut;
   continue;
  }
  const safe = safeReviewScalar(value, key);
  out[key] = safe === undefined ? null : safe;
 }
 return out;
}

function safeReviewList(raw: unknown): readonly string[] {
 if (!Array.isArray(raw)) return [];
 return raw.slice(0, MAX_REVIEW_ARRAY).map(safeReviewCode).filter((value): value is string => value !== null);
}

function safeReviewStance(raw: unknown, kind: "holding" | "buy"): string | null {
 const value = str(raw);
 if (value === null) return null;
 return (kind === "buy" ? REVIEW_BUY_STANCES : REVIEW_HOLDING_STANCES)[value] === true ? value : null;
}

function reviewFinding(
 code: ReviewFindingCode,
 source: CycleReviewFinding["source"],
 candidateId: string | null,
 orderKey: string | null,
 fields: readonly string[] = [],
 window: string | null = null,
 decision: CycleReviewFinding["decision"] = null,
): CycleReviewFinding {
 return { code, source, candidateId, orderKey, decision, window, fields: [...new Set(fields)].slice(0, MAX_REVIEW_FINDING_FIELDS) };
}

function unknownEvidenceFields(value: unknown, path = ""): string[] {
 if (value === null) return path.length === 0 ? [] : [path];
 const object = rec(value);
 if (object === null) return [];
 const fields: string[] = [];
 for (const [key, child] of Object.entries(object)) {
  const childPath = path.length === 0 ? key : `${path}.${key}`;
  if (child === null) fields.push(childPath);
  else if (rec(child) !== null) fields.push(...unknownEvidenceFields(child, childPath));
  else if (Array.isArray(child) && child.includes(null)) fields.push(childPath);
 }
 return fields.slice(0, MAX_REVIEW_FINDING_FIELDS);
}

function reviewFreshness(
 evidence: Readonly<Record<string, CycleReviewEvidenceValue>> | null,
 context: Readonly<Record<string, string | number | null>> | null = null,
): CycleReviewFreshness {
 const candidates: { source: string; ageMin: number; staleAfter: number | null }[] = [];
 const contextAge = safeReviewNumber(context?.s1_idade_min, 0, 1_000_000);
 if (contextAge !== null) candidates.push({ source: "context.s1_idade_min", ageMin: contextAge, staleAfter: REVIEW_STALE_AGE_MIN["context.s1_idade_min"]! });
 const evidenceAge = safeReviewNumber(evidence?.ag, 0, 1_000_000);
 if (evidenceAge !== null) candidates.push({ source: "evidence.ag", ageMin: evidenceAge, staleAfter: null });
 for (const field of ["mo", "tm"] as const) {
  const nested = rec(evidence?.[field]);
  const age = safeReviewNumber(nested?.ag, 0, 1_000_000);
  if (age !== null) candidates.push({ source: `evidence.${field}.ag`, ageMin: age, staleAfter: REVIEW_STALE_AGE_MIN[`${field}.ag`]! });
 }
 const stale = candidates.find((item) => item.staleAfter !== null && item.ageMin > item.staleAfter);
 const chosen = stale ?? candidates[0];
 return chosen === undefined
  ? { status: "unknown", source: null, ageMin: null }
  : { status: stale === undefined ? "age_observed" : "data_stale", source: chosen.source, ageMin: chosen.ageMin };
}

function reviewStaleFields(
 evidence: Readonly<Record<string, CycleReviewEvidenceValue>> | null,
 context: Readonly<Record<string, string | number | null>> | null,
): string[] {
 const fields: string[] = [];
 const contextAge = safeReviewNumber(context?.s1_idade_min, 0, 1_000_000);
 if (contextAge !== null && contextAge > REVIEW_STALE_AGE_MIN["context.s1_idade_min"]!) fields.push("context.s1_idade_min");
 for (const field of ["mo", "tm"] as const) {
  const age = safeReviewNumber(rec(evidence?.[field])?.ag, 0, 1_000_000);
  const cutoff = REVIEW_STALE_AGE_MIN[`${field}.ag`];
  if (age !== null && cutoff !== undefined && age > cutoff) fields.push(`${field}.ag`);
 }
 return fields;
}

interface ReviewScoreDecision {
 readonly key: string;
 readonly cycleId: string;
 readonly candidateId: string;
 readonly atMs: number;
 readonly side: "buy" | "sell";
 readonly stance: string | null;
 readonly entryPriceUsd: number | null;
 readonly estimatedCostUsd: number | null;
}

interface ReviewSettlement {
 readonly settledAtMs: number;
 readonly priceUsd: number | null;
 readonly reason: string | null;
}

function reviewScoreDecision(raw: Record<string, unknown>, key: string, cycleId: string, candidateId: string, kind: "holding" | "buy"): ReviewScoreDecision | null {
 const atMs = safeReviewTimestamp(raw.atMs);
 if (raw.kind !== "decision" || raw.key !== key || raw.cycleId !== cycleId || raw.candidateId !== candidateId || atMs === null || (raw.side !== "buy" && raw.side !== "sell")) return null;
 const entryPriceUsd = safeReviewNumber(raw.entryPriceUsd, 0, 1_000_000_000_000);
 const estimatedCostUsd = safeReviewNumber(raw.costUsd, 0, 1_000_000_000_000);
 return {
  key,
  cycleId,
  candidateId,
  atMs,
  side: raw.side,
  stance: safeReviewStance(raw.stance, kind),
  entryPriceUsd: entryPriceUsd !== null && entryPriceUsd > 0 ? entryPriceUsd : null,
  estimatedCostUsd,
 };
}

function reviewWindows(
 decision: ReviewScoreDecision | null,
 settlements: ReadonlyMap<string, ReadonlyMap<string, ReviewSettlement>>,
 nowMs: number,
): readonly CycleReviewWindow[] {
 if (decision === null) return [];
 const results: CycleReviewWindow[] = [];
 for (const window of REVIEW_WINDOWS) {
  const dueAtMs = decision.atMs + REVIEW_WINDOW_MS[window];
  const settled = settlements.get(decision.key)?.get(window);
  if (settled === undefined) {
   results.push({ window, status: nowMs >= dueAtMs ? "unmeasured" : "pending", settledAtMs: null, priceUsd: null, movePct: null, reason: null });
   continue;
  }
  const inWindow = settled.settledAtMs >= dueAtMs;
  const priceUsd = inWindow ? settled.priceUsd : null;
  const movePct = priceUsd !== null && decision.entryPriceUsd !== null
   ? round((priceUsd / decision.entryPriceUsd - 1) * 100, 2)
   : null;
  results.push({
   window,
   status: movePct === null ? "unknown" : "measured",
   settledAtMs: settled.settledAtMs,
   priceUsd,
   movePct,
   reason: settled.reason,
  });
 }
 return results;
}

function buildCycleReviews(input: AnalysisInput): {
 readonly reviews: readonly CycleReview[];
 readonly page: AnalysisView["cycleReviewPage"];
} {
 const sourceBriefs = input.briefs.slice(-MAX_REVIEW_CYCLES);
 const parsed = sourceBriefs.flatMap((raw) => {
  const record = rec(raw);
  const cycleId = safeReviewId(record?.cycleId, true), atMs = safeReviewTimestamp(record?.atMs);
  if (record === null || cycleId === null || atMs === null || !Array.isArray(record.candidates)) return [];
  return [{ record, cycleId, atMs }];
 });
 const total = parsed.length;
 const totalPages = Math.max(1, Math.ceil(total / MAX_REVIEW_PAGE_SIZE));
 const requestedPage = Number.isInteger(input.reviewPage) ? input.reviewPage! : 1;
 const page = Math.min(Math.max(requestedPage, 1), totalPages);
 const end = total - (page - 1) * MAX_REVIEW_PAGE_SIZE;
 const selectedCycles = parsed.slice(Math.max(0, end - MAX_REVIEW_PAGE_SIZE), end);
 const wanted = new Set<string>();
 const candidateKinds = new Map<string, "holding" | "buy">();
 for (const { record, cycleId } of selectedCycles) {
  for (const rawCandidate of (record.candidates as unknown[]).slice(0, MAX_REVIEW_ITEMS)) {
   const candidate = rec(rawCandidate), candidateId = safeReviewId(candidate?.id), kind = candidate?.kind;
   if (candidateId === null || (kind !== "holding" && kind !== "buy")) continue;
   const key = cycleId.includes(":") || cycleId.includes("|") || candidateId.includes("|") ? null : `${cycleId}:${candidateId}`;
   if (key !== null) {
    if (!wanted.has(key)) candidateKinds.set(key, kind);
    wanted.add(key);
   }
  }
 }

 const orders = new Map<string, Record<string, unknown>>();
 const malformedOrderPairs = new Set<string>();
 for (const raw of input.orders) {
  const order = rec(raw);
  if (order === null) continue;
  const cycleId = safeReviewId(order.cycleId, true), candidateId = safeReviewId(order.candidateId);
  if (cycleId === null || candidateId === null || !wanted.has(`${cycleId}:${candidateId}`)) continue;
  const key = `${cycleId}:${candidateId}`, parsedKey = safeReviewCompositeKey(order.orderKey);
  if (parsedKey === null || parsedKey.inaction || parsedKey.baseKey !== key) {
   malformedOrderPairs.add(key);
   continue;
  }
  const orderAtMs = safeReviewTimestamp(order.atMs);
  if (order.kind !== "order" || REVIEW_STAGES[String(order.stage)] !== true || (order.side !== "buy" && order.side !== "sell") || orderAtMs === null) {
   malformedOrderPairs.add(key);
   continue;
  }
  orders.set(key, order);
 }

 const fills = new Map<string, CycleReviewFill[]>();
 const fillCounts = new Map<string, number>();
 for (const raw of input.fills) {
  const fill = rec(raw), parsedKey = safeReviewCompositeKey(fill?.orderKey);
  const fillAtMs = safeReviewTimestamp(fill?.atMs);
  if (fill === null || parsedKey === null || parsedKey.inaction || !wanted.has(parsedKey.baseKey) || (fill.side !== "buy" && fill.side !== "sell") || fillAtMs === null) continue;
  const key = parsedKey.baseKey;
  const count = fillCounts.get(key) ?? 0;
  fillCounts.set(key, count + 1);
  if (count >= MAX_REVIEW_FILLS) continue;
  const feeRaw = fill.walletFeeLamports;
  const walletFeeLamports = typeof feeRaw === "string" && /^\d{1,30}$/.test(feeRaw) ? feeRaw : null;
  const atSource = fill.atSource === "chain" || fill.atSource === "ledger" ? fill.atSource : null;
  const list = fills.get(key) ?? [];
  list.push({ orderKey: key, atMs: fillAtMs, atSource, side: fill.side, walletFeeLamports });
  fills.set(key, list);
 }


 const actionDecisions = new Map<string, ReviewScoreDecision>();
 const inactionDecisions = new Map<string, ReviewScoreDecision>();
 const settlements = new Map<string, Map<string, ReviewSettlement>>();
 for (const raw of input.scoreboard) {
  const score = rec(raw), parsedKey = safeReviewCompositeKey(score?.key);
  if (score === null || parsedKey === null) continue;
  if (score.kind === "decision") {
   const cycleId = safeReviewId(score.cycleId, true), candidateId = safeReviewId(score.candidateId);
   if (cycleId === null || candidateId === null) continue;
   const baseKey = `${cycleId}:${candidateId}`;
   if (!wanted.has(baseKey) || parsedKey.baseKey !== baseKey) continue;
   const kind = candidateKinds.get(baseKey);
   if (kind === undefined) continue;
   const decision = reviewScoreDecision(score, parsedKey.orderKey, cycleId, candidateId, kind);
   if (decision === null) continue;
   if (parsedKey.inaction) inactionDecisions.set(baseKey, decision);
   else actionDecisions.set(baseKey, decision);
  } else if (score.kind === "settlement" && REVIEW_WINDOWS.includes(score.window as (typeof REVIEW_WINDOWS)[number]) && wanted.has(parsedKey.baseKey)) {
   const settledAtMs = safeReviewTimestamp(score.settledAtMs);
   const priceUsd = score.priceUsd === null ? null : safeReviewNumber(score.priceUsd, 0, 1_000_000_000_000);
   if (settledAtMs === null || (score.priceUsd !== null && priceUsd === null)) continue;
   const byWindow = settlements.get(parsedKey.orderKey) ?? new Map<string, ReviewSettlement>();
   byWindow.set(score.window as string, {
    settledAtMs,
    priceUsd,
    reason: score.reason === null ? null : safeReviewCode(score.reason),
   });
   settlements.set(parsedKey.orderKey, byWindow);
  }
 }

 const reviews = selectedCycles.map(({ record, cycleId, atMs }) => {
  const brief = rec(record.brief);
  const context = safeReviewContext(record.contexto ?? brief?.contexto);
  const history = safeReviewHistory(record.historico);
  const briefHash = typeof record.briefHash === "string" && REVIEW_HASH.test(record.briefHash) ? record.briefHash : null;
  const cycleFreshness = reviewFreshness(null, context);
  const cycleFindings: CycleReviewFinding[] = [];
  if (briefHash === null) cycleFindings.push(reviewFinding("input_unknown", "brief", null, null, ["briefHash"]));
  if (context === null) cycleFindings.push(reviewFinding("input_unknown", "context", null, null, ["contexto", "freshness"]));
  else {
   const unknownFields = unknownEvidenceFields(context);
   if (unknownFields.length > 0) cycleFindings.push(reviewFinding("input_unknown", "context", null, null, unknownFields));
   if (cycleFreshness.status === "unknown") cycleFindings.push(reviewFinding("input_unknown", "context", null, null, ["s1_idade_min"]));
   const staleFields = reviewStaleFields(null, context);
   if (staleFields.length > 0) cycleFindings.push(reviewFinding("data_stale", "context", null, null, staleFields));
  }
  if (history === null) cycleFindings.push(reviewFinding("input_unknown", "brief", null, null, ["historico"]));

  const requested = rec(record.requested), applied = rec(record.stances), gates = rec(record.gates);
  const candidates = record.candidates as unknown[];
  const seen = new Set<string>();
  const selected: { candidate: Record<string, unknown>; candidateId: string; kind: "holding" | "buy" }[] = [];
  for (const rawCandidate of candidates.slice(0, MAX_REVIEW_ITEMS)) {
   const candidate = rec(rawCandidate), candidateId = safeReviewId(candidate?.id);
   if (candidate === null || candidateId === null || (candidate.kind !== "holding" && candidate.kind !== "buy") || seen.has(candidateId)) continue;
   seen.add(candidateId);
   selected.push({ candidate, candidateId, kind: candidate.kind });
  }
  const items: CycleReviewItem[] = selected.map(({ candidate, candidateId, kind }) => {
   const candidatesBrief = rec(kind === "buy" ? brief?.compras : brief?.posicoes);
   const evidenceRaw = candidatesBrief?.[candidateId];
   const evidence = safeReviewEvidence(evidenceRaw, kind);
   const rawSteps = Array.isArray(candidate.stances) && candidate.stances.length <= MAX_REVIEW_ARRAY ? candidate.stances : null;
   const parsedSteps = rawSteps?.map((stance) => safeReviewStance(stance, kind)) ?? null;
   const steps = parsedSteps !== null && parsedSteps.every((stance): stance is string => stance !== null) ? parsedSteps : null;
   const asked = safeReviewStance(requested?.[candidateId], kind);
   const appliedStance = safeReviewStance(applied?.[candidateId], kind);
   const gateRaw = rec(gates?.[candidateId]);
   const gateAsked = safeReviewStance(gateRaw?.asked, "buy"), gateApplied = safeReviewStance(gateRaw?.applied, "buy");
   const gate = gateRaw !== null && gateAsked !== null && gateApplied !== null ? {
    asked: gateAsked,
    applied: gateApplied,
    conviction: safeReviewNumber(gateRaw.conviction, 0, 1),
    bar: safeReviewNumber(gateRaw.bar, 0, 1),
    reason: typeof gateRaw.reason === "string" && REVIEW_GATE_REASONS[gateRaw.reason] === true ? gateRaw.reason : null,
   } : null;
   const freshness = reviewFreshness(evidence);
   const baseKey = cycleId.includes(":") || cycleId.includes("|") || candidateId.includes("|") ? null : `${cycleId}:${candidateId}`;
   const orderRaw = baseKey === null ? null : orders.get(baseKey) ?? null;
   const order = orderRaw !== null && baseKey !== null && orderRaw.cycleId === cycleId && orderRaw.candidateId === candidateId && orderRaw.orderKey === baseKey
    ? {
     orderKey: baseKey,
     stage: orderRaw.stage as string,
     reason: safeReviewCode(orderRaw.reason),
     side: orderRaw.side as "buy" | "sell",
     stance: safeReviewStance(orderRaw.stance, orderRaw.side === "buy" ? "buy" : "holding"),
     atMs: safeReviewTimestamp(orderRaw.atMs)!,
    }
    : null;
   const actionRaw = baseKey === null ? null : actionDecisions.get(baseKey) ?? null;
   const inactionRaw = baseKey === null ? null : inactionDecisions.get(baseKey) ?? null;
   const decision = {
    action: actionRaw === null ? null : {
     key: actionRaw.key, orderKey: baseKey!, side: actionRaw.side, stance: actionRaw.stance, atMs: actionRaw.atMs,
     entryPriceUsd: actionRaw.entryPriceUsd, estimatedCostUsd: actionRaw.estimatedCostUsd,
    },
    inaction: inactionRaw === null ? null : {
     key: inactionRaw.key, orderKey: baseKey!, side: inactionRaw.side, stance: inactionRaw.stance, atMs: inactionRaw.atMs,
     entryPriceUsd: inactionRaw.entryPriceUsd, estimatedCostUsd: inactionRaw.estimatedCostUsd,
    },
   };
   const itemFills = baseKey === null ? [] : fills.get(baseKey) ?? [];
   const actionWindows = reviewWindows(actionRaw, settlements, input.nowMs);
   const inactionWindows = reviewWindows(inactionRaw, settlements, input.nowMs);
   const findings: CycleReviewFinding[] = [];
   const nullEvidenceFields = evidence === null ? ["candidateEvidence"] : unknownEvidenceFields(evidence);
   if (nullEvidenceFields.length > 0) findings.push(reviewFinding("input_unknown", "brief", candidateId, baseKey, nullEvidenceFields));
   if (steps === null) findings.push(reviewFinding("input_unknown", "brief", candidateId, baseKey, ["steps"]));
   const missingStances: string[] = [];
   if (asked === null) missingStances.push("requested");
   if (appliedStance === null) missingStances.push("applied");
   if (missingStances.length > 0) findings.push(reviewFinding("input_unknown", "brief", candidateId, baseKey, missingStances));
   if (gateRaw !== null && gate === null) findings.push(reviewFinding("input_unknown", "brief", candidateId, baseKey, ["gate"]));
   if (freshness.status === "unknown") findings.push(reviewFinding("input_unknown", "brief", candidateId, baseKey, ["freshness"]));
   const staleFields = reviewStaleFields(evidence, null);
   if (staleFields.length > 0) findings.push(reviewFinding("data_stale", "brief", candidateId, baseKey, staleFields));
   if (asked !== null && appliedStance !== null && asked !== appliedStance) findings.push(reviewFinding("stance_diverged", "brief", candidateId, baseKey, ["requested", "applied"]));
   if (baseKey !== null && malformedOrderPairs.has(baseKey)) findings.push(reviewFinding("input_unknown", "order", candidateId, baseKey, ["orderKey"]));
   if (order !== null && (order.stage === "enviando" || order.stage === "incerta")) findings.push(reviewFinding("order_uncertain", "order", candidateId, baseKey, ["stage"]));
   if ((decision.action !== null && decision.action.estimatedCostUsd === null) || (decision.action === null && order !== null && order.stage !== "falhou")) {
    findings.push(reviewFinding("estimated_cost_unknown", "scoreboard", candidateId, baseKey, ["estimatedCostUsd"]));
   }
   if (order?.stage === "executada" && itemFills.length === 0) findings.push(reviewFinding("input_unknown", "fill", candidateId, baseKey, ["fills"]));
   if (itemFills.some((fill) => fill.walletFeeLamports === null)) {
    findings.push(reviewFinding("realized_fee_unknown", "fill", candidateId, baseKey, ["walletFeeLamports"]));
   }
   for (const [decisionKind, windows, score] of [
    ["action", actionWindows, actionRaw],
    ["inaction", inactionWindows, inactionRaw],
   ] as const) {
    if (score === null) continue;
    for (const window of REVIEW_WINDOWS) {
     if (windows.some((result) => result.window === window && (result.status === "measured" || result.status === "pending"))) continue;
     findings.push(reviewFinding("outcome_unmeasured", "scoreboard", candidateId, baseKey, [window], window, decisionKind));
    }
   }
   return {
    candidateId,
    kind,
    frozen: {
     steps,
     marks: safeReviewList(candidate.marks),
     families: safeReviewList(candidate.families),
     triggers: safeReviewList(candidate.triggers),
     evidence,
    },
    requested: asked,
    applied: appliedStance,
    gate,
    freshness,
    decision,
    order,
    results: {
     postDecisionOnly: true,
     fills: itemFills,
     fillsTruncated: baseKey !== null && (fillCounts.get(baseKey) ?? 0) > MAX_REVIEW_FILLS,
     action: actionWindows,
     inaction: inactionWindows,
    },
    findings,
   };
  });
  return {
   cycleId,
   atMs,
   frozen: { briefHash, context, history },
   freshness: cycleFreshness,
   items,
   itemsTruncated: candidates.length > MAX_REVIEW_ITEMS,
   findings: cycleFindings,
  };
 });
 return { reviews, page: { page, pageSize: MAX_REVIEW_PAGE_SIZE, total, totalPages } };
}


interface Consult {
 readonly cycleId: string;
 readonly atMs: number;
 readonly fresh: boolean;
 readonly items: readonly { readonly id: string; readonly open: boolean; readonly symbol: string | null; readonly requested: string | null; readonly applied: string | null; readonly pBuy: number | null }[];
}

function consultOf(raw: unknown): Consult | null {
 const r = rec(raw);
 const cycleId = str(r?.cycleId), atMs = num(r?.atMs);
 if (r === null || cycleId === null || atMs === null || !Array.isArray(r.candidates)) return null;
 const compras = rec(rec(r.brief)?.compras);
 const verdicts = rec(r.verdicts), requested = rec(r.requested), stances = rec(r.stances);
 const items: Consult["items"][number][] = [];
 for (const c of r.candidates) {
  const cr = rec(c);
  const id = str(cr?.id);
  if (cr === null || id === null || cr.kind !== "buy" || !Array.isArray(cr.stances)) continue;
  const probs = rec(verdicts?.[id]);
  let pBuy: number | null = null;
  if (probs !== null) for (const [k, v] of Object.entries(probs)) if (k.startsWith("buy") && num(v) !== null) pBuy = Math.max(pBuy ?? 0, v as number);
  items.push({ id, open: cr.stances.length > 1, symbol: str(rec(compras?.[id])?.s), requested: str(requested?.[id]), applied: str(stances?.[id]), pBuy });
 }
 return { cycleId, atMs, fresh: r.criteria === "rank-v1", items };
}

const isBuy = (s: string | null): boolean => s !== null && s.startsWith("buy");

function windowStats(vals: number[]): WindowStats {
 return { n: vals.length, up: vals.filter((v) => v > 0).length, mean: vals.length === 0 ? null : round(vals.reduce((a, b) => a + b, 0) / vals.length, 2), vals };
}

export function buildAnalysis(input: AnalysisInput): AnalysisView {
 const consults = input.briefs.map(consultOf).filter((c): c is Consult => c !== null);

 // ---- orders: the last stage of each key
 const orders = input.orders.map(rec).filter((o): o is Record<string, unknown> => o !== null && str(o.stage) !== null && num(o.atMs) !== null);

 // ---- the funnel over the last consults
 const window = consults.slice(-FUNNEL_CONSULTS);
 const funnel = { consults: window.length, items: 0, closed: 0, open: 0, asked: 0, applied: 0, executed: 0, failed: 0 };
 const asks: { t: number; s: string | null; p: number; ok: boolean }[] = [];
 for (const c of window) {
  for (const it of c.items) {
   funnel.items++;
   if (!it.open) { funnel.closed++; continue; }
   funnel.open++;
   if (it.requested !== null && it.requested !== "skip") {
    funnel.asked++;
    const ok = isBuy(it.applied);
    if (ok) funnel.applied++;
    asks.push({ t: c.atMs, s: it.symbol, p: it.pBuy ?? 0, ok });
   }
  }
 }
 const t0 = window[0]?.atMs ?? Number.POSITIVE_INFINITY;
 for (const o of orders) {
  if (o.side !== "buy" || (num(o.atMs) as number) < t0) continue;
  if (o.stage === "executada") funnel.executed++;
  else if (o.stage === "falhou") funnel.failed++;
 }

 // ---- the histogram of the buy preference over every open candidate of every consult
 const all = new Array<number>(BINS).fill(0), fresh = new Array<number>(BINS).fill(0);
 for (const c of consults) {
  for (const it of c.items) {
   if (!it.open || it.pBuy === null) continue;
   const bin = Math.min(BINS - 1, Math.floor(it.pBuy * BINS + 1e-9));
   all[bin]!++;
   if (c.fresh) fresh[bin]!++;
  }
 }

 // ---- the timeline of the last consults
 const timeline = consults.slice(-TIMELINE_CONSULTS).map((c) => {
  const open = c.items.filter((i) => i.open);
  const asked = open.filter((i) => i.requested !== null && i.requested !== "skip");
  return { t: c.atMs, open: open.length, asked: asked.length, applied: asked.filter((i) => isBuy(i.applied)).length };
 });

 // ---- the real fills: closed round trips and the network fees
 const fills = input.fills.map(rec).filter((f): f is Record<string, unknown> => f !== null && str(f.symbol) !== null && (f.side === "buy" || f.side === "sell") && num(f.cashUnits) !== null && num(f.atMs) !== null);
 const bySymbol = new Map<string, Record<string, unknown>[]>();
 for (const f of fills) {
  const k = f.symbol as string;
  let group = bySymbol.get(k);
  if (group === undefined) { group = []; bySymbol.set(k, group); }
  group.push(f);
 }
 const trips: { s: string; in: number; out: number; pct: number; buyAt: number; sellAt: number }[] = [];
 let unmatchedSells = 0;
 // one round trip is a stretch in which the token was held: it opens with the first purchase after the balance was empty and closes with the sale that leaves (almost) none. The same token bought and sold five times is
 // five trips, never one. Partial sales stay inside their trip; a trip not yet closed is not a result. Without the token amounts of a fill the sale is taken to close the trip (the old reading).
 const minor = (v: unknown): bigint | null => (typeof v === "string" && /^\d{1,30}$/.test(v) ? BigInt(v) : null);
 for (const [symbol, fs] of bySymbol) {
  let open: { cin: number; cout: number; buyAt: number; bal: bigint; peak: bigint; known: boolean } | null = null;
  for (const f of fs.sort((a, b) => (a.atMs as number) - (b.atMs as number))) {
   const cash = f.cashUnits as number, tm = minor(f.tokenMinor);
   if (f.side === "buy") {
    open ??= { cin: 0, cout: 0, buyAt: f.atMs as number, bal: 0n, peak: 0n, known: true };
    open.cin += cash;
    if (tm === null) open.known = false;
    else { open.bal += tm; open.peak += tm; }
   } else if (open === null) unmatchedSells += 1;
   else {
    open.cout += cash;
    if (tm === null) open.known = false;
    else open.bal = open.bal > tm ? open.bal - tm : 0n;
    // what is left after the sale is dust (5% of what was bought or less), so the trip is over
    if (!open.known || open.bal * 20n <= open.peak) {
     if (open.cin > 0) trips.push({ s: symbol, in: round(open.cin, 4), out: round(open.cout, 4), pct: round((open.cout / open.cin - 1) * 100, 2), buyAt: open.buyAt, sellAt: f.atMs as number });
     open = null;
    }
   }
  }
 }
 trips.sort((a, b) => a.sellAt - b.sellAt);
 let lamports = 0;
 for (const f of fills) {
  const fee = typeof f.walletFeeLamports === "string" && /^\d{1,18}$/.test(f.walletFeeLamports) ? Number(f.walletFeeLamports) : 0;
  lamports += fee;
 }

 // ---- the Placar: what the price did after a decision not to buy
 const dec = new Map<string, Record<string, unknown>>();
 const settled = new Map<string, Map<string, number>>();
 for (const line of input.scoreboard) {
  const r = rec(line);
  const key = str(r?.key);
  if (r === null || key === null) continue;
  if (r.kind === "decision") dec.set(key, r);
  else if (r.kind === "settlement" && typeof r.window === "string" && num(r.priceUsd) !== null) settled.set(key, new Map([...(settled.get(key) ?? []), [r.window, r.priceUsd as number]]));
 }
 const move = (key: string, w: string): number | null => {
  const d = dec.get(key), price = settled.get(key)?.get(w), entry = num(d?.entryPriceUsd);
  return d !== undefined && price !== undefined && entry !== null && entry > 0 ? (price / entry - 1) * 100 : null;
 };
 const gated: string[] = [], skipped: string[] = [], closed: string[] = [];
 for (const c of consults) {
  for (const it of c.items) {
   const key = `${c.cycleId}:${it.id}|inacao`;
   if (it.requested === "skip" && !isBuy(it.applied) && it.open) skipped.push(key);
   else if (it.requested !== null && it.requested !== "skip" && !isBuy(it.applied)) gated.push(key);
  }
 }
 for (const [key, d] of dec) if (key.endsWith("|inacao") && Array.isArray(d.triggers) && d.triggers.includes("fechada_pelo_codigo")) closed.push(key);
 const group = (keys: string[]): GroupStats => ({ "15m": windowStats(keys.map((k) => move(k, "15m")).filter((v): v is number => v !== null).map((v) => round(v, 2))), "1h": windowStats(keys.map((k) => move(k, "1h")).filter((v): v is number => v !== null).map((v) => round(v, 2))) });
 const kinds: [string, string[]][] = [["pedida e recusada", gated], ["puxada pelo codigo", closed], ["pulada pelo Jev", skipped]];
 const recent: { t: number; s: string | null; kind: string; m15: number | null; m1h: number | null }[] = [];
 for (const [kind, keys] of kinds) {
  for (const k of keys) {
   const d = dec.get(k);
   const t = num(d?.atMs);
   if (d === undefined || t === null) continue;
   const m15 = move(k, "15m"), m1h = move(k, "1h");
   recent.push({ t, s: str(d.symbol), kind, m15: m15 === null ? null : round(m15, 2), m1h: m1h === null ? null : round(m1h, 2) });
  }
 }
 recent.sort((a, b) => a.t - b.t);

 // ---- how the orders ended, and what went out today
 const outcomes: Record<string, number> = {};
 const reasons: Record<string, number> = {};
 const spentToday = { buy: 0, sell: 0 };
 const day = (t: number): string => new Date(t).toISOString().slice(0, 10);
 for (const o of orders) {
  const stage = o.stage as string;
  if (stage === "executada" || stage === "falhou" || stage === "incerta") outcomes[stage] = (outcomes[stage] ?? 0) + 1;
  if (stage === "falhou") { const why = str(o.reason) ?? "desconhecido"; reasons[why] = (reasons[why] ?? 0) + 1; }
  const usd = num(o.usd);
  if ((stage === "executada" || stage === "incerta" || stage === "enviando") && usd !== null && (o.side === "buy" || o.side === "sell") && day(o.atMs as number) === day(input.nowMs)) spentToday[o.side] += usd;
 }
 spentToday.buy = round(spentToday.buy, 2);
 spentToday.sell = round(spentToday.sell, 2);

 const cycleReviewPage = buildCycleReviews(input);
 return {
  atMs: input.nowMs, funnel, asks, hist: { all, fresh }, timeline, trips, fees: { lamports, fills: fills.length, unmatchedSells },
  placar: { skipped: group(skipped), closed: group(closed), gated: group(gated) }, recent: recent.slice(-RECENT_KEPT), orders: { outcomes, reasons, spentToday },
  runtime: { tokensToday: null, riskPct: null },
  cycleReviews: cycleReviewPage.reviews,
  cycleReviewPage: cycleReviewPage.page,
 };
}
