import { randomUUID, createHash } from "node:crypto";
import type { InventorySnapshot } from "../okx-wallet/portfolio";
import { chainByIndex } from "../okx-wallet/chains";
import { buildRoundTripCandidates, DEFAULT_PAIRS, type SwapQuoter } from "../operator/candidates";
import { pilotPolicy } from "./policy";
import { buildOperatorState, validateOperatorDecision, type OperatorModel } from "../operator/jev-selector";
import { gateCandidates } from "../operator/risk-gate";
import { buildExecutionPlan } from "../operator/plan";
import { PILOT_MAX_AGE_MS, pilotContextKey, pilotNonceValid, type PilotRequest, type PilotCycle } from "./protocol";

export interface PilotDeps {
  now?: () => number;
  source?: (request: PilotRequest, signal: AbortSignal) => Promise<unknown>;
  journal?: (cycle: PilotCycle) => void | Promise<void>;
  model?: OperatorModel;
  modelSource?: "real" | "fixture";
  /** Verified estimate/allowance; never an actual bill or a default price. */
  inferenceAllowanceUsd?: number | null;
  cycleTimeoutMs?: number;
  decisionTimeoutMs?: number;
}
export interface PilotBundle {
  inventory: InventorySnapshot;
  provenance: "real" | "fixture";
  coverageQualified: boolean;
  unitsQualified: boolean;
  quoteCostsComplete: boolean;
  quoter: SwapQuoter;
}
const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v >= 0;
const stamp = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v) && v > 0;
const atomic = (v: unknown): v is string => typeof v === "string" && /^[1-9][0-9]{0,77}$/.test(v) && BigInt(v) < BigInt(2) ** BigInt(256);
const pair = DEFAULT_PAIRS.find(p => p.chainIndex === "196")!;

function validateBundle(value: unknown, r: PilotRequest, now: number): PilotBundle {
  if (!value || typeof value !== "object") throw new Error("source_invalid");
  const b = value as PilotBundle;
  if (!["real","fixture"].includes(b.provenance) || !b.inventory || typeof b.inventory !== "object") throw new Error("source_invalid");
  const i = b.inventory;
  if (i.source !== (b.provenance === "real" ? "okx_balance_api" : "synthetic")) throw new Error("source_provenance_mismatch");
  if (typeof i.address !== "string" || i.address.toLowerCase() !== r.account.toLowerCase()) throw new Error("source_account_mismatch");
  if (!stamp(i.observedAtMs) || now < i.observedAtMs || now - i.observedAtMs > PILOT_MAX_AGE_MS) throw new Error("source_stale");
  if (b.coverageQualified !== true || i.valueComplete !== true || i.riskTokensExcluded !== false ||
    !Array.isArray(i.queriedChains) || i.queriedChains.length !== 1 || i.queriedChains[0] !== "196" ||
    !Array.isArray(i.chains) || i.chains.length !== 1) throw new Error("inventory_coverage_unknown");
  if (b.unitsQualified !== true || b.quoter?.unitsQualified !== true) throw new Error("quote_units_unknown");
  if (b.quoteCostsComplete !== true) throw new Error("quote_costs_unknown");
  if (!b.quoter || typeof b.quoter.quote !== "function") throw new Error("quote_access_unverified");
  const c = i.chains[0]!;
  const spec = chainByIndex("196")!;
  if (c.chainIndex !== "196" || c.chainName !== spec.name || c.kind !== "evm" || c.nativeSymbol !== "OKB" || !finite(c.nativeBalance) ||
    !finite(i.knownValueUsd) || !finite(c.knownValueUsd) || c.valueComplete !== true ||
    !Array.isArray(c.assets) || c.assets.length < 1 || c.assets.length > 500) throw new Error("inventory_invalid");
  const seen = new Set<string>();
  let sum = 0;
  for (const a of c.assets) {
    if (!a || a.chainIndex !== "196" || a.chainName !== spec.name || typeof a.tokenContractAddress !== "string" ||
      (a.tokenContractAddress !== "" && !/^0x[0-9a-fA-F]{40}$/.test(a.tokenContractAddress)) ||
      a.native !== (a.tokenContractAddress === "") || typeof a.symbol !== "string" || !/^[A-Za-z0-9._-]{1,24}$/.test(a.symbol) ||
      typeof a.balanceText !== "string" || !/^[0-9]{1,40}(\.[0-9]{1,40})?$/.test(a.balanceText) ||
      !finite(a.balance) || Number(a.balanceText) !== a.balance || !finite(a.priceUsd) || a.priceUsd === 0 ||
      !finite(a.valueUsd) || !Number.isFinite(a.balance * a.priceUsd) ||
      Math.abs(a.valueUsd - a.balance * a.priceUsd) > Math.max(1, a.valueUsd) * 1e-9 ||
      typeof a.isRiskToken !== "boolean" || a.isRiskToken) throw new Error("inventory_invalid");
    const key = a.tokenContractAddress.toLowerCase();
    if (seen.has(key)) throw new Error("inventory_duplicate_asset");
    seen.add(key); sum += a.valueUsd;
  }
  const native = c.assets.find(a => a.native);
  if (!native || native.symbol !== "OKB" || native.balance !== c.nativeBalance || !Number.isFinite(sum) ||
    Math.abs(sum - c.knownValueUsd) > Math.max(1, sum) * 1e-9 || Math.abs(sum - i.knownValueUsd) > Math.max(1, sum) * 1e-9)
    throw new Error("inventory_invalid");
  return b;
}

async function bounded<T>(run: () => Promise<T>, timeout: number, abort: AbortController, code: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const start = performance.now();
  try {
    if (abort.signal.aborted) throw new Error(code);
    const value = await Promise.race([
      Promise.resolve().then(run),
      new Promise<never>((_, reject) => { timer = setTimeout(() => { abort.abort(); reject(new Error(code)); }, timeout); }),
    ]);
    if (performance.now() - start >= timeout || abort.signal.aborted) { abort.abort(); throw new Error(code); }
    return value;
  } finally { clearTimeout(timer); }
}
function validatePilotRequest(value: unknown): PilotRequest {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("invalid_pilot_request");
  const r = value as Record<string, unknown>;
  if (!pilotNonceValid(r.sessionId) || !pilotNonceValid(r.requestId) || typeof r.account !== "string" || !/^0x[0-9a-fA-F]{40}$/.test(r.account) ||
    typeof r.chainId !== "string" || !/^0x(?:0|[1-9a-f][0-9a-f]{0,15})$/.test(r.chainId) ||
    typeof r.block !== "string" || !/^(0|[1-9][0-9]{0,19})$/.test(r.block) || BigInt(r.block) > BigInt("18446744073709551615") ||
    typeof r.observedAtMs !== "number" || !Number.isSafeInteger(r.observedAtMs) || r.observedAtMs <= 0 ||
    Object.keys(r).some(k => !["sessionId","requestId","account","chainId","observedAtMs","block"].includes(k))) throw new Error("invalid_pilot_request");
  return r as unknown as PilotRequest;
}
export async function evaluatePilot(value: unknown, deps: PilotDeps = {}): Promise<PilotCycle> {
  const started = performance.now();
  const r = validatePilotRequest(value);
  const clock = deps.now ?? Date.now;
  const now = clock();
  if (!stamp(now)) throw new Error("invalid_pilot_clock");
  const cycleTimeout = deps.cycleTimeoutMs ?? 15_000;
  const decisionTimeout = deps.decisionTimeoutMs ?? 5_000;
  if (![cycleTimeout,decisionTimeout].every(n => Number.isInteger(n) && n > 0 && n <= 30_000)) throw new Error("invalid_pilot_timeout");
  const cycle: PilotCycle = {
    protocol:"gev-wallet-pilot-v1", sessionId:r.sessionId,requestId:r.requestId,contextKey:pilotContextKey(r),cycleId:randomUUID(),
    maskedAccount:r.account.slice(0,6)+"..."+r.account.slice(-4),chainId:r.chainId,chainIndex:r.chainId === "0xc4" ? "196" : null,
    mode:"simulation",execution:"disabled",status:"hold",source:"unavailable",dataVersion:null,observedAtMs:null,
    coverage:{status:"unknown",chains:[],valueComplete:null,unitsQualified:null,quoteCostsComplete:null,assetCount:null},quoteObservedAtMs:null,
    completedAtMs:now,validUntilMs:now,knownValueUsd:null,candidates:[],verdicts:[],decision:null,plan:null,
    reasons:[],inferenceCostUsd:null,billedCostUsd:null,realizedProfitUsd:null,
  };
  if (r.chainId !== "0xc4") cycle.reasons.push("network_outside_pilot");
  else if (now < r.observedAtMs || now - r.observedAtMs > PILOT_MAX_AGE_MS) cycle.reasons.push("wallet_observation_stale");
  else if (!deps.source) cycle.reasons.push("inventory_access_unverified");
  else {
    const abort = new AbortController();
    try {
      await bounded(async () => {
        let source: unknown;
        try { source = await deps.source!(r, abort.signal); } catch { throw new Error("source_unavailable"); }
        if (abort.signal.aborted) throw new Error("cycle_timeout");
        const b = validateBundle(source, r, clock());
        cycle.source = b.provenance;
        cycle.observedAtMs = b.inventory.observedAtMs;
        cycle.knownValueUsd = b.inventory.knownValueUsd;
        cycle.coverage = {status:"qualified",chains:["196"],valueComplete:true,unitsQualified:true,quoteCostsComplete:true,assetCount:b.inventory.chains[0]!.assets.length};
        cycle.dataVersion = createHash("sha256").update(JSON.stringify(b.inventory)).digest("hex");
        if (!finite(deps.inferenceAllowanceUsd)) throw new Error("inference_cost_unknown");
        const policy = pilotPolicy(deps.inferenceAllowanceUsd);
        let oldestQuote: number | null = null;
        const quoter: SwapQuoter = { unitsQualified:true, quote: async input => {
          if (abort.signal.aborted) throw new Error("cycle_timeout");
          let q: Awaited<ReturnType<SwapQuoter["quote"]>>;
          try {q=await b.quoter.quote(input);}catch{throw new Error("quote_unavailable");}
          if (abort.signal.aborted) throw new Error("cycle_timeout");
          if (!q || q.fromAmountAtomic !== input.amountAtomic || !atomic(q.toAmountAtomic) || !stamp(q.receivedAtMs) ||
            q.receivedAtMs > clock() || clock() - q.receivedAtMs > policy.maxQuoteAgeMs ||
            !finite(q.tradeFeeUsd) || typeof q.priceImpactPercent !== "number" || !Number.isFinite(q.priceImpactPercent)) throw new Error("quote_invalid");
          oldestQuote = oldestQuote === null ? q.receivedAtMs : Math.min(oldestQuote, q.receivedAtMs);
          return q;
        }};
        const candidates = await buildRoundTripCandidates({inventory:b.inventory,policy,nowMs:clock(),now:clock,pairs:[pair],swapQuoter:quoter});
        if (abort.signal.aborted) throw new Error("cycle_timeout");
        cycle.candidates = candidates;
        cycle.quoteObservedAtMs = oldestQuote;
        cycle.verdicts = gateCandidates(cycle.candidates, b.inventory, policy);
        const eligible = cycle.candidates.filter(c => cycle.verdicts.some(v => v.candidateId === c.id && v.eligible));
        if (!eligible.length) { cycle.reasons.push("no_eligible_candidate"); return; }
        const beforeInference = clock();
        if (beforeInference < r.observedAtMs || beforeInference - r.observedAtMs > PILOT_MAX_AGE_MS ||
          beforeInference < b.inventory.observedAtMs || beforeInference - b.inventory.observedAtMs > PILOT_MAX_AGE_MS ||
          oldestQuote === null || beforeInference < oldestQuote || beforeInference - oldestQuote > policy.maxQuoteAgeMs)
          throw new Error("data_expired_during_cycle");
        if (!deps.model || !["real","fixture"].includes(deps.modelSource ?? "")) throw new Error("model_access_unverified");
        if (b.provenance !== deps.modelSource) throw new Error("model_provenance_mismatch");
        let result: unknown;
        try { result = await bounded(() => deps.model!.choose(buildOperatorState(b.inventory,eligible),eligible,{signal:abort.signal}),decisionTimeout,abort,"decision_timeout"); }
        catch (error) { throw new Error(error instanceof Error && error.message === "decision_timeout" ? "decision_timeout" : "decision_failed"); }
        if (abort.signal.aborted) throw new Error("cycle_timeout");
        try { cycle.decision = validateOperatorDecision(result,eligible); } catch { throw new Error("decision_invalid"); }
        const completed = clock();
        if (completed < r.observedAtMs || completed - r.observedAtMs > PILOT_MAX_AGE_MS ||
          completed < b.inventory.observedAtMs || completed - b.inventory.observedAtMs > PILOT_MAX_AGE_MS ||
          oldestQuote === null || completed < oldestQuote || completed - oldestQuote > policy.maxQuoteAgeMs)
          throw new Error("data_expired_during_cycle");
        if (cycle.decision.model !== deps.model.name) throw new Error("decision_invalid");
        cycle.inferenceCostUsd = deps.inferenceAllowanceUsd!;
        if (cycle.decision.choice === "hold") { cycle.reasons.push("gev_chose_hold"); return; }
        const chosen = eligible.find(c => c.id === cycle.decision!.choice)!;
        const plan = buildExecutionPlan(chosen,cycle.decision,policy,{operatorExecute:false,operatorLiveAck:false,realModel:false,signerAvailable:false},completed);
        cycle.validUntilMs = Math.min(plan.expiresAtMs,r.observedAtMs+PILOT_MAX_AGE_MS,b.inventory.observedAtMs+PILOT_MAX_AGE_MS,oldestQuote+policy.maxQuoteAgeMs);
        plan.expiresAtMs = cycle.validUntilMs;
        cycle.plan = plan; cycle.status = "simulated";
      },deps.journal ? cycleTimeout - Math.min(1000,Math.max(1,Math.ceil(cycleTimeout/4))) : cycleTimeout,abort,"cycle_timeout");
    } catch (error) {
      const code = error instanceof Error ? error.message : "";
      const allowed = ["source_invalid","source_provenance_mismatch","source_account_mismatch","source_stale","inventory_coverage_unknown","quote_units_unknown","quote_costs_unknown","quote_access_unverified","inventory_invalid","inventory_duplicate_asset","inference_cost_unknown","model_access_unverified","model_provenance_mismatch","decision_timeout","decision_failed","decision_invalid","data_expired_during_cycle","cycle_timeout","source_unavailable"];
      cycle.reasons.push(allowed.includes(code) ? code : "cycle_failed");
      cycle.plan = null; cycle.status = "hold";
      if (["decision_invalid","data_expired_during_cycle","cycle_timeout"].includes(code)) cycle.decision = null;
    } finally { abort.abort(); }
  }
  cycle.completedAtMs = clock();
  if (cycle.status === "hold") cycle.validUntilMs = cycle.completedAtMs;
  if (deps.journal) {
    // Reserve part of the overall deadline for persistence. A failed/late write
    // cannot produce a successful response or keep the HTTP slot indefinitely.
    const remaining = Math.floor(cycleTimeout - (performance.now() - started));
    if (remaining <= 0) throw new Error("journal_timeout");
    const abort = new AbortController();
    try { await bounded(async()=>{await deps.journal!(cycle);},remaining,abort,"journal_timeout"); }
    finally { abort.abort(); }
  }
  const delivered = clock();
  if (!stamp(delivered) || delivered < cycle.completedAtMs ||
    (cycle.plan && (delivered >= cycle.validUntilMs || delivered - r.observedAtMs > PILOT_MAX_AGE_MS)))
    throw new Error("pilot_result_expired");
  return cycle;
}
