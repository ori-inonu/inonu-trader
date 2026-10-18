import { createHash } from "node:crypto";
import { chainByIndex, isAddressForChain } from "../okx-wallet/chains";

/** Offline consistency review of the closing journal. No provider, executor, wallet or financial state writes. A consistent local record does not authenticate its source. */
export interface ClosingAudit {
  readonly version: 1;
  readonly cycleId: string;
  readonly candidateId: string;
  readonly requestId: string;
  readonly atMs: number;
  readonly criteria: string;
  readonly mode: "shadow" | "decide";
  readonly briefFingerprint: "matched" | "mismatched" | "missing";
  readonly quoteFingerprint: "matched" | "mismatched" | "missing";
  readonly quoteIdentity: "matched" | "mismatched" | "missing";
  /** The producer currently copies appliedByGate into applied. Equality of those
   * fields cannot establish what a cycle delivered to an executing adapter. */
  readonly shadowFieldsEqual: boolean | null;
  readonly shadowUnchanged: null;
  /** Reconstructed only when the saved, six-place distribution resolves the preference. This is not a profit probability. */
  readonly modelPreference: "buy" | "skip" | null;
  readonly verdictReconstructable: boolean;
  readonly refusal: string | null;
  readonly recordedWould: "buy" | "skip" | null;
  readonly applied: string;
  readonly placed: "antes" | "depois" | null;
  readonly phaseStartedAtMs: number | null;
  readonly askedAtMs: number | null;
  readonly answeredAtMs: number | null;
  /** Reported local-clock age, not an authenticated provider creation time. */
  readonly quoteAgeAtAskMs: number | null;
  /** Requires matching quote hash/identity, the documented window and coherent
   * reported clocks. Missing legacy clocks remain unknown. Never proves a call. */
  readonly quoteFreshAtModelCall: boolean | null;
  readonly sourceAuthenticated: false;
  readonly executionProven: false;
  readonly financialProfitProven: false;
  readonly findings: readonly string[];
}

const rec = (v: unknown): Record<string, unknown> | null => v !== null && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : null;
const code = (v: unknown): v is string => typeof v === "string" && /^[A-Za-z0-9_:./@-]{1,160}$/.test(v);
const num = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const sha = (text: string): string => createHash("sha256").update(text).digest("hex");
const textOf = (v: unknown): string | null => { try { return JSON.stringify(v) ?? null; } catch { return null; } };
const asset = (chain: unknown, key: unknown): string | null => {
  if (typeof chain !== "string" || typeof key !== "string" || !key.startsWith(`token:${chain}:`)) return null;
  const address = key.slice(`token:${chain}:`.length);
  return !isAddressForChain(chain, address) ? null : `token:${chain}:${chainByIndex(chain)?.kind === "evm" ? address.toLowerCase() : address}`;
};
const timestamp = (v: unknown): v is number => num(v) && Number.isSafeInteger(v) && v >= 0;
// Fixed by closing-v1, matching the provider quote cache window documented by
// closing.ts. The journal cannot enlarge this diagnostic window for itself.
const QUOTE_FRESH_MS = 15_000;
const REFUSALS = ["honeypot", "cotacao_bloqueada", "cotacao_aviso", "honeypot_desconhecido"] as const;
type Refusal = typeof REFUSALS[number];
const probability = (v: unknown): v is number | null => v === null || num(v) && v >= 0 && v <= 1;
const rounded = (v: unknown): number | null | undefined => v === null ? null : num(v) ? Math.round(v * 10_000) / 10_000 : undefined;
function expectedRefusal(q: Record<string, unknown>): { known: boolean; value: Refusal | null } {
  const h = rec(q.honeypot);
  if (!h || ![h.from, h.to].every(v => v === null || typeof v === "boolean") || !["ok", "provider_warn", "provider_block"].includes(q.disposition as string)) return { known: false, value: null };
  return { known: true, value: h.from === true || h.to === true ? "honeypot" : q.disposition === "provider_block" ? "cotacao_bloqueada" : q.disposition === "provider_warn" ? "cotacao_aviso" : h.to === null ? "honeypot_desconhecido" : null };
}

export function auditClosing(raw: unknown): ClosingAudit | null {
  const r = rec(raw), first = rec(r?.first);
  if (r === null || r.v !== 1 || r.phase !== "closing" || !code(r.criteria) || !code(r.cycleId) || !code(r.candidateId) || !code(r.requestId) || !num(r.atMs) || !Number.isSafeInteger(r.atMs) || r.atMs < 0 || r.mode !== "shadow" && r.mode !== "decide" || first === null || !code(first.appliedByGate) || !code(r.applied)) return null;
  const findings: string[] = [];
  let briefFingerprint: ClosingAudit["briefFingerprint"] = "missing";
  const brief = rec(r.brief), text = brief === null ? null : textOf(brief);
  if (text !== null) {
    briefFingerprint = r.briefHash === sha(text).slice(0, 16) ? "matched" : "mismatched";
    if (briefFingerprint === "mismatched") findings.push("closing_brief_hash_mismatch");
    if (r.briefBytes !== new TextEncoder().encode(text).length) findings.push("closing_brief_size_mismatch");
    if (brief?.cob !== "parcial") findings.push("closing_cost_coverage_unspecified");
  } else if (r.briefHash != null || r.briefBytes != null || r.answer != null) findings.push("closing_brief_missing");

  if (!probability(first.pBuy)) findings.push("closing_first_probability_invalid");
  if (brief !== null) {
    const sua = rec(brief.sua);
    if (sua === null || !probability(sua.p) || !probability(first.pBuy) || (sua.p === null) !== (first.pBuy === null) || typeof sua.p === "number" && typeof first.pBuy === "number" && Math.abs(sua.p - first.pBuy) > .0050011) findings.push("closing_brief_first_probability_mismatch");
  }

  let quoteFingerprint: ClosingAudit["quoteFingerprint"] = "missing", quoteIdentity: ClosingAudit["quoteIdentity"] = "missing";
  let quoteClockConsistent = false, quoteWindowExpected = false;
  const q = rec(r.quote);
  if (q !== null) {
    const { fingerprint, ...body } = q, quoteText = textOf(body);
    quoteFingerprint = quoteText !== null && fingerprint === sha(quoteText) ? "matched" : "mismatched";
    if (quoteFingerprint === "mismatched") findings.push("closing_quote_hash_mismatch");
    const from = asset(q.chainIndex, q.fromAssetKey), to = asset(q.chainIndex, q.toAssetKey), candidate = asset(q.chainIndex, r.candidateId.startsWith("buy:") ? r.candidateId.slice(4) : null);
    quoteIdentity = q.cycleId === r.cycleId && q.candidateId === r.candidateId && q.requestId === r.requestId && from !== null && to !== null && from !== to && candidate === to ? "matched" : "mismatched";
    if (quoteIdentity === "mismatched") findings.push("closing_quote_identity_mismatch");
    if (q.outputUnit !== "unverified" || q.execution !== "not_inferred") findings.push("closing_quote_claim_exceeds_contract");
    quoteClockConsistent = timestamp(q.startedAtMs) && timestamp(q.receivedAtMs) && timestamp(q.reviewedAtMs) && timestamp(q.expiresAtMs) && q.startedAtMs <= q.receivedAtMs && q.receivedAtMs <= q.reviewedAtMs && q.reviewedAtMs <= q.expiresAtMs && q.ageMs === q.reviewedAtMs - q.startedAtMs && q.timeBasis === "request_started_local_clock";
    if (!quoteClockConsistent) findings.push("closing_quote_clock_inconsistent");
    quoteWindowExpected = r.criteria === "closing-v1" && timestamp(q.startedAtMs) && timestamp(q.expiresAtMs) && q.expiresAtMs - q.startedAtMs === QUOTE_FRESH_MS;
    if (r.criteria === "closing-v1" && !quoteWindowExpected) findings.push("closing_quote_window_unexpected");
    const facts = rec(q.facts), cot = rec(brief?.cot);
    if (brief !== null) {
      const impact = rounded(facts?.impactPct), taxFrom = rounded(facts?.taxFromPct), taxTo = rounded(facts?.taxToPct);
      const state = q.disposition === "ok" ? "ok" : q.disposition === "provider_warn" ? "aviso" : q.disposition === "provider_block" ? "bloqueio" : null;
      // Only recorded/recomputable fields are bound. cot.taxa, cot.entra and
      // size percentages need the original sizeUsd, which is not in this journal.
      if (cot === null || state === null || impact === undefined || taxFrom === undefined || taxTo === undefined || cot.e !== state || cot.imp !== impact || !Array.isArray(cot.imposto) || cot.imposto.length !== 2 || cot.imposto[0] !== taxFrom || cot.imposto[1] !== taxTo) findings.push("closing_brief_quote_mismatch");
    }
  } else if (r.quote != null || r.answer != null) findings.push("closing_quote_missing");

  if (brief !== null && q === null) findings.push("closing_brief_without_quote");
  const refusal = REFUSALS.includes(r.refusal as Refusal) ? r.refusal as Refusal : null;
  if (r.refusal != null && refusal === null) findings.push("closing_refusal_unknown");
  const recordedWould = r.would === "buy" || r.would === "skip" ? r.would : null;
  if (r.would != null && recordedWould === null) findings.push("closing_would_invalid");
  if (refusal !== null) {
    if (r.answer != null) findings.push("closing_refusal_with_answer");
    if (recordedWould !== "skip") findings.push("closing_refusal_would_mismatch");
    if (q === null) findings.push("closing_refusal_without_quote");
  }
  if (q !== null) {
    const expected = expectedRefusal(q);
    if (!expected.known) findings.push("closing_refusal_basis_invalid");
    else {
      if (expected.value !== refusal) findings.push("closing_refusal_mismatch");
      if (expected.value !== null && (brief !== null || r.answer != null || r.askedAtMs != null)) findings.push("closing_asked_despite_objective_refusal");
    }
  }
  if (recordedWould !== null && refusal === null && r.answer == null) findings.push("closing_would_without_basis");
  let modelPreference: ClosingAudit["modelPreference"] = null, verdictReconstructable = false;
  if (r.answer != null) {
    const a = rec(r.answer);
    if (a === null || Object.keys(a).length !== 2 || !num(a.buy) || !num(a.skip) || a.buy < 0 || a.buy > 1 || a.skip < 0 || a.skip > 1 || Math.abs(a.buy + a.skip - 1) > .02) findings.push("closing_distribution_invalid");
    else if (Math.abs(a.buy - a.skip) > .0000011) {
      modelPreference = a.buy > a.skip ? "buy" : "skip";
      verdictReconstructable = true;
      if (refusal === null && recordedWould !== modelPreference) findings.push("closing_verdict_mismatch");
    }
  }
  const shadowFieldsEqual = r.mode === "shadow" ? r.applied === first.appliedByGate : null;
  if (shadowFieldsEqual === false) findings.push("closing_shadow_field_mismatch");

  const placed = r.placed === "antes" || r.placed === "depois" ? r.placed : null;
  let physicalClockConsistent = true;
  if (Object.hasOwn(r, "placed") && placed === null) { findings.push("closing_placement_invalid"); physicalClockConsistent = false; }
  const phaseStartedAtMs = timestamp(r.phaseStartedAtMs) ? r.phaseStartedAtMs : null;
  const askedAtMs = timestamp(r.askedAtMs) ? r.askedAtMs : null;
  const answeredAtMs = timestamp(r.answeredAtMs) ? r.answeredAtMs : null;
  const badPhysicalClock = Object.hasOwn(r, "phaseStartedAtMs") && phaseStartedAtMs === null
    || phaseStartedAtMs !== null && phaseStartedAtMs > r.atMs
    || Object.hasOwn(r, "askedAtMs") && r.askedAtMs !== null && askedAtMs === null
    || Object.hasOwn(r, "answeredAtMs") && r.answeredAtMs !== null && answeredAtMs === null
    || Object.hasOwn(r, "askedAtMs") && askedAtMs === null && (r.answer != null || answeredAtMs !== null)
    || Object.hasOwn(r, "answeredAtMs") && r.answer != null && answeredAtMs === null
    || askedAtMs !== null && askedAtMs < r.atMs
    || answeredAtMs !== null && answeredAtMs < r.atMs
    || askedAtMs !== null && answeredAtMs !== null && askedAtMs > answeredAtMs
    || q !== null && timestamp(q.startedAtMs) && r.atMs > q.startedAtMs
    || q !== null && timestamp(q.reviewedAtMs) && askedAtMs !== null && q.reviewedAtMs > askedAtMs;
  if (badPhysicalClock) { findings.push("closing_physical_clock_inconsistent"); physicalClockConsistent = false; }
  const quoteAgeAtAskMs = q !== null && timestamp(q.startedAtMs) && askedAtMs !== null && askedAtMs >= q.startedAtMs ? askedAtMs - q.startedAtMs : null;
  const quoteFreshAtModelCall = quoteAgeAtAskMs !== null && quoteClockConsistent && quoteWindowExpected && physicalClockConsistent && quoteFingerprint === "matched" && quoteIdentity === "matched" ? quoteAgeAtAskMs <= QUOTE_FRESH_MS : null;
  if (quoteFreshAtModelCall === false) findings.push("closing_quote_stale_at_model_call");
  return { version: 1, cycleId: r.cycleId, candidateId: r.candidateId, requestId: r.requestId, atMs: r.atMs, criteria: r.criteria, mode: r.mode,
    briefFingerprint, quoteFingerprint, quoteIdentity, shadowFieldsEqual, shadowUnchanged: null, modelPreference, verdictReconstructable, refusal, recordedWould, applied: r.applied,
    placed, phaseStartedAtMs, askedAtMs, answeredAtMs, quoteAgeAtAskMs, quoteFreshAtModelCall, sourceAuthenticated: false, executionProven: false, financialProfitProven: false, findings };
}
