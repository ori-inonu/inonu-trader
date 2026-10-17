import type { CycleReview, CycleReviewDecision, CycleReviewEvidenceValue, CycleReviewFinding, CycleReviewFindingCode, CycleReviewFreshness, CycleReviewItem, CycleReviewWindow } from "./types";

type RecordValue = Record<string, unknown>;
const rec = (value: unknown): RecordValue | null => value !== null && typeof value === "object" && !Array.isArray(value) ? value as RecordValue : null;
const num = (value: unknown): number | null => typeof value === "number" && Number.isFinite(value) && Math.abs(value) <= 1_000_000_000_000 ? value : null;
const timestamp = (value: unknown): number | null => typeof value === "number" && Number.isSafeInteger(value) && Math.abs(value) <= 8_640_000_000_000_000 && Number.isFinite(new Date(value).getTime()) ? value : null;
const contextNum = (key: string, value: unknown): number | null => key.endsWith("_asof_ms") ? timestamp(value) : num(value);
const code = (value: unknown, max = 32): string | null => typeof value === "string" && /^[a-z][a-z0-9_-]*$/.test(value) && value.length <= max ? value : null;
const fieldPath = (value: unknown): string | null => typeof value === "string" && /^[A-Za-z][A-Za-z0-9_.-]{0,63}$/.test(value) ? value : null;
const sourceField = (value: unknown): string | null => value === "evidence.ag" || value === "evidence.mo.ag" || value === "evidence.tm.ag" || value === "context.s1_idade_min" ? value : null;
const id = (value: unknown, max = 80): string | null => typeof value === "string" && /^[A-Za-z0-9:._@-]+$/.test(value) && value.length > 0 && value.length <= max ? value : null;
const canonicalKey = (value: unknown, cycleId: string, candidateId: string, inaction = false): string | null => value === `${cycleId}:${candidateId}${inaction ? "|inacao" : ""}` && typeof value === "string" && value.length <= 168 ? value : null;
const windowName = (value: unknown): "15m" | "1h" | "4h" | "24h" | null => value === "15m" || value === "1h" || value === "4h" || value === "24h" ? value : null;
const stance = (value: unknown, kind: "holding" | "buy"): string | null => {
  const values = kind === "buy" ? ["skip", "buy_tenth", "buy_third", "buy_two_thirds", "buy_full"] : ["hold", "trim_third", "trim_half", "exit_all"];
  return typeof value === "string" && values.includes(value) ? value : null;
};
const strings = (value: unknown, maxItems = 24): readonly string[] => Array.isArray(value) ? value.slice(0, maxItems).map((entry) => code(entry)).filter((entry): entry is string => entry !== null) : [];

function evidenceValue(value: unknown): { readonly ok: boolean; readonly value: CycleReviewEvidenceValue } {
  if (value === null || typeof value === "boolean" || num(value) !== null || (typeof value === "string" && value.length <= 80)) return { ok: true, value: value as string | number | boolean | null };
  if (Array.isArray(value) && value.length <= 24 && value.every((entry) => entry === null || typeof entry === "boolean" || num(entry) !== null || (typeof entry === "string" && entry.length <= 80))) return { ok: true, value: value as readonly (string | number | boolean | null)[] };
  const object = rec(value);
  if (object !== null) {
    const entries = Object.entries(object);
    if (entries.length <= 24 && entries.every(([key, entry]) => /^[a-z][a-z0-9_]{0,23}$/.test(key) && (entry === null || typeof entry === "boolean" || num(entry) !== null || (typeof entry === "string" && entry.length <= 80)))) return { ok: true, value: object as Readonly<Record<string, string | number | boolean | null>> };
  }
  return { ok: false, value: null };
}
function evidenceRecord(value: unknown, kind: "holding" | "buy"): Readonly<Record<string, CycleReviewEvidenceValue>> | null {
  const object = rec(value);
  if (object === null) return null;
  const entries = Object.entries(object);
  if (entries.length > 32) return null;
  const allowed = kind === "buy"
    ? ["s", "n", "w", "p", "b", "l", "v", "c", "h", "t", "d", "u", "r", "m", "f", "x", "y", "o", "pf", "mo", "k", "ult", "wu", "sp", "inf", "ut", "lp", "tm", "i"]
    : ["s", "wl", "w", "p", "l", "i", "v", "r", "m", "g", "e", "h", "c5", "c1", "n5", "ag", "pt", "mo", "tm", "f", "ult", "t", "o", "pl"];
  const nestedAllowed: Readonly<Record<string, readonly string[]>> = { mo: ["r5", "r15", "r1", "rg", "vr", "ag"], tm: ["rsi", "rp", "r4", "r24", "up", "dd", "sg", "ag"], ult: ["n", "m", "p", "ag"], pl: ["pf", "e", "a", "s", "hl", "th"] };
  const result: Record<string, CycleReviewEvidenceValue> = {};
  for (const [key, raw] of entries) {
    if (!allowed.includes(key)) continue;
    const nestedKeys = nestedAllowed[key];
    const nestedRaw = rec(raw);
    if (nestedKeys !== undefined && nestedRaw !== null) {
      const nested: Record<string, string | number | boolean | null> = {};
      for (const [nestedKey, nestedValue] of Object.entries(nestedRaw)) {
        if (!nestedKeys.includes(nestedKey)) continue;
        const parsed = evidenceValue(nestedValue);
        if (!parsed.ok || typeof parsed.value === "object" && parsed.value !== null) return null;
        nested[nestedKey] = parsed.value as string | number | boolean | null;
      }
      result[key] = nested;
      continue;
    }
    if (Array.isArray(raw) && !["m", "f", "o", "pf", "t"].includes(key)) return null;
    if (kind === "holding" && key === "pt") {
      if (raw === 0 || raw === 1) result[key] = raw;
      continue;
    }
    const parsed = evidenceValue(raw);
    if (!parsed.ok) return null;
    result[key] = parsed.value;
  }
  return result;
}
function freshness(value: unknown): CycleReviewFreshness | null {
  const object = rec(value);
  const status = object?.status;
  if (status !== "age_observed" && status !== "data_stale" && status !== "unknown") return null;
  const source = object?.source === null ? null : sourceField(object?.source);
  const ageMin = object?.ageMin === null ? null : num(object?.ageMin);
  if ((object?.source !== null && source === null) || (object?.ageMin !== null && ageMin === null)) return null;
  return { status, source, ageMin };
}
function finding(value: unknown, cycleId: string, expectedCandidateId: string | null): CycleReviewFinding | null {
  const object = rec(value);
  const codes: readonly CycleReviewFindingCode[] = ["input_unknown", "data_stale", "stance_diverged", "estimated_cost_unknown", "realized_fee_unknown", "order_uncertain", "outcome_unmeasured"];
  const sources = ["brief", "context", "order", "fill", "scoreboard"] as const;
  if (object === null || typeof object.code !== "string" || !codes.includes(object.code as CycleReviewFindingCode) || typeof object.source !== "string" || !sources.includes(object.source as typeof sources[number])) return null;
  const candidateId = object.candidateId === null ? null : id(object.candidateId);
  const orderKey = object.orderKey === null ? null : canonicalKey(object.orderKey, cycleId, expectedCandidateId ?? "");
  const decisionKind = object.decision === null || object.decision === "action" || object.decision === "inaction" ? object.decision : undefined;
  const window = object.window === null ? null : windowName(object.window);
  if (decisionKind === undefined || candidateId !== expectedCandidateId || (object.orderKey !== null && orderKey === null) || (expectedCandidateId === null && object.orderKey !== null) || (object.window !== null && window === null) || (object.code === "outcome_unmeasured" && (decisionKind === null || candidateId === null || orderKey === null || window === null)) || (object.code !== "outcome_unmeasured" && decisionKind !== null) || !Array.isArray(object.fields) || object.fields.length > 12) return null;
  const fields = object.fields.map((entry) => fieldPath(entry) ?? windowName(entry));
  if (fields.some((entry) => entry === null)) return null;
  return { code: object.code as CycleReviewFindingCode, source: object.source as CycleReviewFinding["source"], candidateId, decision: decisionKind, orderKey, window, fields: fields as string[] };
}
function decision(value: unknown, kind: "holding" | "buy", cycleId: string, candidateId: string, inaction: boolean): CycleReviewDecision | null {
  const object = rec(value);
  if (object === null) return null;
  const key = canonicalKey(object.key, cycleId, candidateId, inaction);
  const orderKey = canonicalKey(object.orderKey, cycleId, candidateId);
  const side = object.side;
  const atMs = timestamp(object.atMs);
  const entryPriceUsd = object.entryPriceUsd === null ? null : num(object.entryPriceUsd);
  const estimatedCostUsd = object.estimatedCostUsd === null ? null : num(object.estimatedCostUsd);
  const stanceValue = object.stance === null ? null : stance(object.stance, kind);
  if (key === null || orderKey === null || (side !== "buy" && side !== "sell") || atMs === null || (object.entryPriceUsd !== null && entryPriceUsd === null) || (object.estimatedCostUsd !== null && estimatedCostUsd === null) || (object.stance !== null && stanceValue === null)) return null;
  return { key, orderKey, side, stance: stanceValue, atMs, entryPriceUsd, estimatedCostUsd };
}
function resultWindow(value: unknown): CycleReviewWindow | null {
  const object = rec(value);
  const window = windowName(object?.window);
  const status = object?.status;
  if (object === null || window === null || (status !== "pending" && status !== "measured" && status !== "unknown" && status !== "unmeasured")) return null;
  const settledAtMs = object.settledAtMs === null ? null : timestamp(object.settledAtMs);
  const priceUsd = object.priceUsd === null ? null : num(object.priceUsd);
  const movePct = object.movePct === null ? null : num(object.movePct);
  const reason = object.reason === null ? null : code(object.reason, 48);
  if ((object.settledAtMs !== null && settledAtMs === null) || (object.priceUsd !== null && priceUsd === null) || (object.movePct !== null && movePct === null) || (object.reason !== null && reason === null)) return null;
  return { window, status, settledAtMs, priceUsd, movePct, reason };
}
function reviewItem(value: unknown, cycleId: string): CycleReviewItem | null {
  const object = rec(value);
  const kind = object?.kind;
  if (object === null || (kind !== "holding" && kind !== "buy")) return null;
  const candidateId = id(object.candidateId);
  if (candidateId === null) return null;
  const frozen = rec(object.frozen);
  const fresh = freshness(object.freshness);
  const requested = object.requested === null ? null : stance(object.requested, kind);
  const applied = object.applied === null ? null : stance(object.applied, kind);
  const decisionObject = rec(object.decision);
  const action = decisionObject?.action === null ? null : decision(decisionObject?.action, kind, cycleId, candidateId, false);
  const inaction = decisionObject?.inaction === null ? null : decision(decisionObject?.inaction, kind, cycleId, candidateId, true);
  const gateRaw = rec(object.gate);
  let gate: CycleReviewItem["gate"] = null;
  if (gateRaw !== null) {
    const asked = stance(gateRaw.asked, kind), gateApplied = stance(gateRaw.applied, kind);
    const conviction = gateRaw.conviction === null ? null : num(gateRaw.conviction), bar = gateRaw.bar === null ? null : num(gateRaw.bar);
    const reason = gateRaw.reason === null ? null : code(gateRaw.reason, 48);
    if (asked === null || gateApplied === null || (gateRaw.conviction !== null && conviction === null) || (gateRaw.bar !== null && bar === null) || (gateRaw.reason !== null && reason === null)) return null;
    gate = { asked, applied: gateApplied, conviction, bar, reason };
  }
  let order: CycleReviewItem["order"] = null;
  const orderRaw = rec(object.order);
  if (orderRaw !== null) {
    const orderKey = canonicalKey(orderRaw.orderKey, cycleId, candidateId), stage = code(orderRaw.stage, 32), side = orderRaw.side, atMs = timestamp(orderRaw.atMs);
    const orderStance = orderRaw.stance === null ? null : stance(orderRaw.stance, kind);
    const reason = code(orderRaw.reason);
    if (orderKey === null || stage === null || (side !== "buy" && side !== "sell") || atMs === null || (orderRaw.stance !== null && orderStance === null)) return null;
    order = { orderKey, stage, reason, side, stance: orderStance, atMs };
  }
  const resultsRaw = rec(object.results);
  if (candidateId === null || frozen === null || fresh === null || (object.requested !== null && requested === null) || (object.applied !== null && applied === null) || decisionObject === null || (decisionObject.action !== null && action === null) || (decisionObject.inaction !== null && inaction === null) || resultsRaw?.postDecisionOnly !== true) return null;
  const steps = frozen.steps === null ? null : strings(frozen.steps);
  if (frozen.steps !== null && (!Array.isArray(frozen.steps) || steps?.length !== frozen.steps.length)) return null;
  const evidence = frozen.evidence === null ? null : evidenceRecord(frozen.evidence, kind);
  if (frozen.evidence !== null && evidence === null) return null;
  const findings = Array.isArray(object.findings) ? object.findings.slice(0, 24).map((entry) => finding(entry, cycleId, candidateId)) : [];
  const fillsRaw = Array.isArray(resultsRaw.fills) ? resultsRaw.fills.slice(0, 4) : [];
  const fills: Array<CycleReviewItem["results"]["fills"][number]> = [];
  for (const raw of fillsRaw) {
    const fill = rec(raw), orderKey = canonicalKey(fill?.orderKey, cycleId, candidateId), atMs = timestamp(fill?.atMs), side = fill?.side;
    const atSource = fill?.atSource === "chain" || fill?.atSource === "ledger" ? fill.atSource : null;
    const walletFeeLamports = fill?.walletFeeLamports === null ? null : typeof fill?.walletFeeLamports === "string" && /^\d{1,30}$/.test(fill.walletFeeLamports) ? fill.walletFeeLamports : null;
    if (orderKey === null || atMs === null || (side !== "buy" && side !== "sell") || (fill?.walletFeeLamports !== null && walletFeeLamports === null)) return null;
    fills.push({ orderKey, atMs, atSource, side, walletFeeLamports });
  }
  const actionResults = Array.isArray(resultsRaw.action) ? resultsRaw.action.slice(0, 4).map(resultWindow) : [];
  const inactionResults = Array.isArray(resultsRaw.inaction) ? resultsRaw.inaction.slice(0, 4).map(resultWindow) : [];
  if (!Array.isArray(frozen.marks) || !Array.isArray(frozen.families) || !Array.isArray(frozen.triggers) || findings.some((entry) => entry === null) || actionResults.some((entry) => entry === null) || inactionResults.some((entry) => entry === null) || typeof resultsRaw.fillsTruncated !== "boolean") return null;
  return {
    candidateId, kind, frozen: { steps, marks: strings(frozen.marks), families: strings(frozen.families), triggers: strings(frozen.triggers), evidence },
    requested, applied, gate, freshness: fresh, decision: { action, inaction }, order,
    results: { postDecisionOnly: true, fills, fillsTruncated: resultsRaw.fillsTruncated, action: actionResults as CycleReviewWindow[], inaction: inactionResults as CycleReviewWindow[] },
    findings: findings as CycleReviewFinding[],
  };
}
function review(value: unknown): CycleReview | null {
  const object = rec(value), cycleId = id(object?.cycleId), atMs = timestamp(object?.atMs), frozen = rec(object?.frozen), fresh = freshness(object?.freshness);
  if (object === null || cycleId === null || atMs === null || frozen === null || fresh === null || typeof object.itemsTruncated !== "boolean") return null;
  const briefHash = frozen.briefHash === null ? null : typeof frozen.briefHash === "string" && /^(?:[a-f0-9]{16}|[a-f0-9]{64})$/.test(frozen.briefHash) ? frozen.briefHash : null;
  if (frozen.briefHash !== null && briefHash === null) return null;
  const contextRaw = rec(frozen.context);
  let context: CycleReview["frozen"]["context"] = null;
  if (contextRaw !== null) {
    const entries = Object.entries(contextRaw);
    if (entries.length > 32 || entries.some(([key, item]) => !/^[a-z][a-z0-9_]{0,23}$/.test(key) || (item !== null && contextNum(key, item) === null && !(typeof item === "string" && (/^[a-z_]{1,20}$/.test(item) || (key.endsWith("_fh") && /^[a-f0-9]{64}$/.test(item))))))) return null;
    context = Object.fromEntries(entries) as Readonly<Record<string, string | number | null>>;
  } else if (frozen.context !== null) return null;
  const historyRaw = rec(frozen.history);
  let history: CycleReview["frozen"]["history"] = null;
  if (historyRaw !== null) {
    const entries = Object.entries(historyRaw);
    if (entries.length > 24) return null;
    const parsed: Record<string, Readonly<Record<string, number | null>>> = {};
    for (const [key, raw] of entries) {
      const row = rec(raw);
      if (!/^[a-z][a-z0-9_]{0,23}$/.test(key) || row === null || Object.keys(row).some((field) => !["n", "acerto", "medio", "melhor", "pior"].includes(field)) || Object.keys(row).length > 5 || Object.values(row).some((item) => item !== null && num(item) === null)) return null;
      parsed[key] = Object.fromEntries(Object.entries(row)) as Readonly<Record<string, number | null>>;
    }
    history = parsed;
  } else if (frozen.history !== null) return null;
  const items = Array.isArray(object.items) ? object.items.slice(0, 32).map((entry) => reviewItem(entry, cycleId)) : [];
  const findings = Array.isArray(object.findings) ? object.findings.slice(0, 24).map((entry) => finding(entry, cycleId, null)) : [];
  if (items.some((entry) => entry === null) || findings.some((entry) => entry === null)) return null;
  return { cycleId, atMs, frozen: { briefHash, context, history }, freshness: fresh, items: items as CycleReviewItem[], itemsTruncated: object.itemsTruncated, findings: findings as CycleReviewFinding[] };
}

/** Old cores omit cycleReviews; malformed individual reviews are dropped without hiding the rest of /analysis. */
export function parseCycleReviews(value: unknown): readonly CycleReview[] {
  if (!Array.isArray(value)) return [];
  return value.slice(-120).flatMap((entry) => {
    const parsed = review(entry);
    return parsed === null ? [] : [parsed];
  });
}
