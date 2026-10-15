import { chainByIndex, isAddressForChain } from "../okx-wallet/chains";

/** Consistency comparison of REPORTED portfolio metrics. No return is computed
 * from prices here, no source is authenticated, and no version is promoted.
 * A caller must supply unitized net returns from its own qualified evaluator. */
export interface ShadowRound {
  readonly id: string;
  readonly createdAtMs: number;
  readonly aVersion: string;
  readonly bVersion: string;
  readonly bParentVersion: string;
  readonly evaluatorHash: string;
  readonly baselineHash: string;
  readonly numeraireKey: string;
  readonly horizonMs: number;
}

interface Measurement {
  readonly roundId: string;
  readonly pairId: string;
  readonly arm: "A" | "B";
  readonly version: string;
  readonly evaluatorHash: string;
  readonly baselineHash: string;
  readonly snapshotHash: string;
  readonly startAtMs: number;
  readonly endAtMs: number;
  readonly availableAtMs: number | null;
  readonly metric: "unitized_net_return_pct";
  /** Exact asset identity of the unit, never the symbol USDC alone. */
  readonly numeraireKey: string;
  readonly evidence: "observed" | "simulated";
  /** Finite reported return; negative equity from debt may be below -100%. */
  readonly returnPct: number | null;
  readonly costs: "complete" | "unknown";
  readonly cashFlows: "adjusted" | "unknown";
  readonly valuation: "complete" | "partial";
}

export type ShadowPairStatus = "comparable" | "missing_arm" | "invalid_record" | "conflicting_records" | "context_mismatch" | "evidence_mismatch" | "pending" | "costs_unknown" | "cash_flows_unknown" | "valuation_partial" | "return_unknown" | "numeric_overflow";
export interface ShadowPairComparison {
  readonly pairId: string;
  readonly status: ShadowPairStatus;
  readonly startAtMs: number | null;
  readonly endAtMs: number | null;
  readonly aReturnPct: number | null;
  readonly bReturnPct: number | null;
  readonly deltaPp: number | null;
}

export interface ShadowComparison {
  readonly round: ShadowRound;
  readonly asOfMs: number;
  readonly evidence: "reported_metrics_only";
  readonly promotionProven: false;
  readonly independentSampleCount: null;
  readonly invalidMeasurements: number;
  readonly duplicates: number;
  readonly pairs: readonly ShadowPairComparison[];
  readonly summary: {
    readonly comparable: number;
    /** Descriptive average only. Overlapping windows are included and flagged;
     * this is not a compounded portfolio return or a significance test. */
    readonly meanDeltaPp: number | null;
    readonly bHigher: number;
    readonly aHigher: number;
    readonly ties: number;
    /** Comparable pairs sharing any time with another comparable pair. */
    readonly overlapping: number;
  };
}

const object = (v: unknown): Record<string, unknown> | null => v !== null && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : null;
const exact = (r: Record<string, unknown>, fields: readonly string[]) => Object.keys(r).length === fields.length && fields.every(k => Object.hasOwn(r, k));
const code = (v: unknown): v is string => typeof v === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(v);
const hash = (v: unknown): v is string => typeof v === "string" && /^[a-f0-9]{64}$/.test(v);
const clock = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v) && v >= 0;
const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const unit = (v: unknown): string | null => {
  if (typeof v !== "string") return null;
  const parts = v.split(":");
  if (parts.length !== 3 || parts[0] !== "token" || !isAddressForChain(parts[1]!, parts[2]!)) return null;
  return `token:${parts[1]}:${chainByIndex(parts[1]!)?.kind === "evm" ? parts[2]!.toLowerCase() : parts[2]}`;
};

function parseRound(raw: unknown): ShadowRound | null {
  const r = object(raw);
  if (r === null || !exact(r, ["id", "createdAtMs", "aVersion", "bVersion", "bParentVersion", "evaluatorHash", "baselineHash", "numeraireKey", "horizonMs"]) || !code(r.id) || !clock(r.createdAtMs) || ![r.aVersion, r.bVersion, r.bParentVersion, r.evaluatorHash, r.baselineHash].every(hash) || r.aVersion === r.bVersion || r.bParentVersion !== r.aVersion || !clock(r.horizonMs) || r.horizonMs < 1) return null;
  const numeraireKey = unit(r.numeraireKey);
  if (numeraireKey === null) return null;
  return { id: r.id, createdAtMs: r.createdAtMs, aVersion: r.aVersion as string, bVersion: r.bVersion as string, bParentVersion: r.bParentVersion as string, evaluatorHash: r.evaluatorHash as string, baselineHash: r.baselineHash as string, numeraireKey, horizonMs: r.horizonMs };
}

function parseMeasurement(raw: unknown): Measurement | null {
  const r = object(raw);
  if (r === null || !exact(r, ["roundId", "pairId", "arm", "version", "evaluatorHash", "baselineHash", "snapshotHash", "startAtMs", "endAtMs", "availableAtMs", "metric", "numeraireKey", "evidence", "returnPct", "costs", "cashFlows", "valuation"])) return null;
  const numeraireKey = unit(r.numeraireKey);
  if (!code(r.roundId) || !code(r.pairId) || r.arm !== "A" && r.arm !== "B" || ![r.version, r.evaluatorHash, r.baselineHash, r.snapshotHash].every(hash) || !clock(r.startAtMs) || !clock(r.endAtMs) || r.endAtMs <= r.startAtMs || r.availableAtMs !== null && (!clock(r.availableAtMs) || r.availableAtMs < r.endAtMs) || r.metric !== "unitized_net_return_pct" || numeraireKey === null || r.evidence !== "observed" && r.evidence !== "simulated" || r.returnPct !== null && !finite(r.returnPct) || r.costs !== "complete" && r.costs !== "unknown" || r.cashFlows !== "adjusted" && r.cashFlows !== "unknown" || r.valuation !== "complete" && r.valuation !== "partial") return null;
  // Fixed field order makes duplicate detection independent of input key order.
  return { roundId: r.roundId, pairId: r.pairId, arm: r.arm, version: r.version as string, evaluatorHash: r.evaluatorHash as string, baselineHash: r.baselineHash as string, snapshotHash: r.snapshotHash as string, startAtMs: r.startAtMs, endAtMs: r.endAtMs, availableAtMs: r.availableAtMs as number | null, metric: r.metric, numeraireKey, evidence: r.evidence, returnPct: r.returnPct as number | null, costs: r.costs, cashFlows: r.cashFlows, valuation: r.valuation };
}

export function compareShadowRound(rawRound: unknown, observations: readonly unknown[], asOfMs: number): { readonly ok: true; readonly comparison: ShadowComparison } | { readonly ok: false; readonly reason: "round_invalid" | "input_invalid" } {
  const round = parseRound(rawRound);
  if (round === null) return { ok: false, reason: "round_invalid" };
  if (!clock(asOfMs) || asOfMs < round.createdAtMs || !Array.isArray(observations) || observations.length > 10_000) return { ok: false, reason: "input_invalid" };
  type Group = { A?: Measurement; B?: Measurement; conflict: boolean; invalid: boolean };
  const groups = new Map<string, Group>();
  let invalidMeasurements = 0, duplicates = 0;
  for (const raw of observations) {
    const m = parseMeasurement(raw);
    if (m === null) {
      invalidMeasurements++;
      const pairId = object(raw)?.pairId;
      if (code(pairId)) {
        const g = groups.get(pairId) ?? { conflict: false, invalid: false };
        g.invalid = true; groups.set(pairId, g);
      }
      continue;
    }
    const g = groups.get(m.pairId) ?? { conflict: false, invalid: false };
    const previous = g[m.arm];
    if (previous !== undefined) {
      if (JSON.stringify(previous) === JSON.stringify(m)) duplicates++;
      else g.conflict = true;
    } else g[m.arm] = m;
    groups.set(m.pairId, g);
  }
  const pairs: ShadowPairComparison[] = [];
  for (const [pairId, g] of [...groups].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)) {
    const a = g.A, b = g.B;
    let status: ShadowPairStatus;
    if (g.invalid) status = "invalid_record";
    else if (g.conflict) status = "conflicting_records";
    else if (a === undefined || b === undefined) status = "missing_arm";
    else if (a.roundId !== round.id || b.roundId !== round.id || a.version !== round.aVersion || b.version !== round.bVersion || a.evaluatorHash !== round.evaluatorHash || b.evaluatorHash !== round.evaluatorHash || a.baselineHash !== round.baselineHash || b.baselineHash !== round.baselineHash || a.startAtMs < round.createdAtMs || b.startAtMs < round.createdAtMs || a.snapshotHash !== b.snapshotHash || a.startAtMs !== b.startAtMs || a.endAtMs !== b.endAtMs || a.numeraireKey !== round.numeraireKey || b.numeraireKey !== round.numeraireKey || a.endAtMs - a.startAtMs !== round.horizonMs) status = "context_mismatch";
    else if (a.evidence !== "observed" || b.evidence !== "simulated") status = "evidence_mismatch";
    else if (a.availableAtMs === null || b.availableAtMs === null || a.availableAtMs > asOfMs || b.availableAtMs > asOfMs) status = "pending";
    else if (a.costs !== "complete" || b.costs !== "complete") status = "costs_unknown";
    else if (a.cashFlows !== "adjusted" || b.cashFlows !== "adjusted") status = "cash_flows_unknown";
    else if (a.valuation !== "complete" || b.valuation !== "complete") status = "valuation_partial";
    else if (a.returnPct === null || b.returnPct === null) status = "return_unknown";
    else status = finite(b.returnPct - a.returnPct) ? "comparable" : "numeric_overflow";
    const comparable = status === "comparable";
    pairs.push({ pairId, status,
      startAtMs: comparable ? a!.startAtMs : null, endAtMs: comparable ? a!.endAtMs : null,
      aReturnPct: comparable ? a!.returnPct : null, bReturnPct: comparable ? b!.returnPct : null,
      deltaPp: comparable ? b!.returnPct! - a!.returnPct! : null });
  }
  const comparable = pairs.filter(p => p.status === "comparable");
  // Convex incremental mean avoids overflowing a sum of large finite returns.
  const mean = comparable.reduce((m, p, i) => m * (i / (i + 1)) + p.deltaPp! / (i + 1), 0);
  const overlap = comparable.filter(p => comparable.some(q => p !== q && p.startAtMs! < q.endAtMs! && q.startAtMs! < p.endAtMs!)).length;
  return { ok: true, comparison: { round, asOfMs, evidence: "reported_metrics_only", promotionProven: false, independentSampleCount: null, invalidMeasurements, duplicates, pairs,
    summary: { comparable: comparable.length, meanDeltaPp: comparable.length === 0 || !finite(mean) ? null : mean,
      bHigher: comparable.filter(p => p.deltaPp! > 0).length, aHigher: comparable.filter(p => p.deltaPp! < 0).length, ties: comparable.filter(p => p.deltaPp === 0).length, overlapping: overlap } } };
}
