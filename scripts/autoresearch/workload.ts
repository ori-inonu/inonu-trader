import {
 applyOrder,
 equityUsd,
 newSim,
 unitizedReturnPct,
 type SimOrder,
 type SimQuote,
 type SimResult,
 type SimState,
} from "../../src/agent/shadow/sim-portfolio.ts";
import { MemoryJournal, type JournalData } from "../../src/lab/journal.ts";
import { COST_TABLE, returnOnCapital } from "../../src/lab/outcomes.ts";
import {
 buyAndHoldPolicy,
 carryRulePolicy,
 describePolicy,
 holdPolicy,
 momentumRulePolicy,
 randomPolicy,
 type LabPolicy,
} from "../../src/lab/policies.ts";
import { buildReport, buildSyntheticSpec, manifestOf, runEpochs } from "../../src/lab/run.ts";
import { SyntheticSource, syntheticConfig } from "../../src/lab/source.ts";
import { DAY_MS, HOLD, HOUR_MS, MINUTE_MS, type LabReport, type Outcome, type PolicyDecision, type PolicyReport } from "../../src/lab/types.ts";
import type { WorkloadResult } from "./contracts.ts";
import { createCandidatePolicy, RESEARCH_CANDIDATE_ID } from "./candidate.ts";

const SEED = 20_261_016;
const FIRST_DATA_MS = 1_704_067_200_000;
const EPOCHS = 224;
const NOTIONAL_BPS = 10_000;
const ANCESTOR_POLICY_ID = "momentum-rule";
const WALLET_START_USD = 118;
const SYNTHETIC_WALLET_ASSET_A = "SYNTH-A";
const SYNTHETIC_WALLET_ASSET_B = "SYNTH-B";

const CONFIG = syntheticConfig({
 seed: SEED,
 startMs: FIRST_DATA_MS,
 barMs: 15 * MINUTE_MS,
 stepMs: 6 * HOUR_MS,
 horizonMs: 24 * HOUR_MS,
 executionDelayMs: 15 * MINUTE_MS,
 epochs: EPOCHS,
 warmupMs: 3 * DAY_MS,
 quote: "USDT",
 assets: [
  { base: "SYNA", dailyVol: 0.025, startPrice: 100 },
  { base: "SYNB", dailyVol: 0.04, startPrice: 20 },
 ],
 dailyDrift: 0,
 funding: {
  intervalMs: 8 * HOUR_MS,
  meanPerInterval: 0.0003,
  ar: 0.9,
  innovationSd: 0.00003,
  predictionNoiseSd: 0.00001,
 },
 spreadBps: { spot: 2, perp: 1 },
 plantedEdgeBps: 0,
});

export interface PairedReturnSummary {
 readonly meanBps: number | null;
 readonly completePairs: number;
 readonly candidateCompleteEpochs: number;
 readonly ancestorCompleteEpochs: number;
 readonly excludedEpochs: number;
 readonly candidateMeanBps: number | null;
 readonly ancestorMeanBps: number | null;
}

function clean(value: number): number {
 return Object.is(value, -0) ? 0 : value;
}

function mean(values: readonly number[]): number | null {
 if (values.length === 0) return null;
 const value = values.reduce((sum, item) => sum + item, 0) / values.length;
 return Number.isFinite(value) ? clean(value) : null;
}

function outcomeReturn(
 epochId: string,
 decision: PolicyDecision | undefined,
 outcomes: ReadonlyMap<string, Outcome>,
): number | null {
 if (decision === undefined || decision.status !== "ok") return null;
 if (decision.choice === HOLD) return 0;
 const outcome = outcomes.get(`${epochId}|${decision.choice}`);
 if (outcome === undefined || !outcome.complete) return null;
 return returnOnCapital(outcome);
}

/**
 * Compute the primary sample by same-epoch intersection. A hold is a complete zero excess-return decision; a missing
 * decision, outcome, or cost-complete outcome is unknown and removes that epoch from both sides of the pair.
 */
export function summarizePairedNetReturn(
 data: Pick<JournalData, "epochs" | "decisions" | "outcomes">,
 candidateId = RESEARCH_CANDIDATE_ID,
 ancestorId = ANCESTOR_POLICY_ID,
): PairedReturnSummary {
 if (candidateId === ancestorId) throw new RangeError("paired policies must have distinct ids");
 const decisions = new Map<string, PolicyDecision>();
 for (const decision of data.decisions) decisions.set(`${decision.epochId}|${decision.policyId}`, decision);
 const outcomes = new Map<string, Outcome>();
 for (const outcome of data.outcomes) outcomes.set(`${outcome.epochId}|${outcome.candidateId}`, outcome);

 const differences: number[] = [];
 const candidateReturns: number[] = [];
 const ancestorReturns: number[] = [];
 for (const epoch of data.epochs) {
  const candidate = outcomeReturn(epoch.id, decisions.get(`${epoch.id}|${candidateId}`), outcomes);
  const ancestor = outcomeReturn(epoch.id, decisions.get(`${epoch.id}|${ancestorId}`), outcomes);
  if (candidate !== null) candidateReturns.push(candidate);
  if (ancestor !== null) ancestorReturns.push(ancestor);
  if (candidate !== null && ancestor !== null) differences.push(candidate - ancestor);
 }

 const averageDifference = mean(differences);
 const candidateAverage = mean(candidateReturns);
 const ancestorAverage = mean(ancestorReturns);
 return {
  meanBps: averageDifference === null ? null : clean(averageDifference * NOTIONAL_BPS),
  completePairs: differences.length,
  candidateCompleteEpochs: candidateReturns.length,
  ancestorCompleteEpochs: ancestorReturns.length,
  excludedEpochs: data.epochs.length - differences.length,
  candidateMeanBps: candidateAverage === null ? null : clean(candidateAverage * NOTIONAL_BPS),
  ancestorMeanBps: ancestorAverage === null ? null : clean(ancestorAverage * NOTIONAL_BPS),
 };
}

interface PolicySelectionSummary {
 readonly decisions: number;
 readonly trades: number;
 readonly holds: number;
 readonly refusals: number;
 readonly completeTradeOutcomes: number;
 readonly incompleteTradeOutcomes: number;
 readonly unknownCostTradeOutcomes: number;
 readonly grossBps: number | null;
 readonly fundingBps: number | null;
 readonly tradingCostBps: number | null;
 readonly opportunityCostBps: number | null;
 readonly netNotionalBps: number | null;
}

function summarizePolicySelections(data: JournalData, policyId: string): PolicySelectionSummary {
 const decisions = new Map<string, PolicyDecision>();
 for (const decision of data.decisions) if (decision.policyId === policyId) decisions.set(decision.epochId, decision);
 const outcomes = new Map<string, Outcome>();
 for (const outcome of data.outcomes) outcomes.set(`${outcome.epochId}|${outcome.candidateId}`, outcome);

 let trades = 0;
 let holds = 0;
 let refusals = 0;
 let completeTradeOutcomes = 0;
 let incompleteTradeOutcomes = 0;
 let unknownCostTradeOutcomes = 0;
 const gross: number[] = [];
 const funding: number[] = [];
 const tradingCost: number[] = [];
 const opportunityCost: number[] = [];
 const net: number[] = [];

 for (const epoch of data.epochs) {
  const decision = decisions.get(epoch.id);
  if (decision === undefined) continue;
  if (decision.status !== "ok") refusals += 1;
  if (decision.choice === HOLD) {
   holds += 1;
   continue;
  }
  trades += 1;
  if (decision.status !== "ok") continue;
  const outcome = outcomes.get(`${epoch.id}|${decision.choice}`);
  if (outcome === undefined || !outcome.complete) {
   incompleteTradeOutcomes += 1;
   if (outcome?.incompleteReason === "costs-unknown") unknownCostTradeOutcomes += 1;
   continue;
  }
  if (outcome.grossReturn === null || outcome.fundingReturn === null || outcome.costReturn === null || outcome.opportunityCost === null || outcome.netReturn === null) {
   incompleteTradeOutcomes += 1;
   continue;
  }
  completeTradeOutcomes += 1;

  gross.push(outcome.grossReturn * NOTIONAL_BPS);
  funding.push(outcome.fundingReturn * NOTIONAL_BPS);
  tradingCost.push(outcome.costReturn * NOTIONAL_BPS);
  opportunityCost.push(outcome.opportunityCost * NOTIONAL_BPS);
  net.push(outcome.netReturn * NOTIONAL_BPS);
 }

 return {
  decisions: decisions.size,
  trades,
  holds,
  refusals,
  completeTradeOutcomes,
  incompleteTradeOutcomes,
  unknownCostTradeOutcomes,
  grossBps: mean(gross),
  fundingBps: mean(funding),
  tradingCostBps: mean(tradingCost),
  opportunityCostBps: mean(opportunityCost),
  netNotionalBps: mean(net),
 };
}

function policyReport(report: LabReport, id: string): PolicyReport {
 const found = report.policies.find((policy) => policy.id === id);
 if (found === undefined) throw new Error(`laboratory report omitted policy ${id}`);
 return found;
}

function setMetric(metrics: Record<string, number>, id: string, value: number | null): void {
 if (value !== null && Number.isFinite(value)) metrics[id] = clean(value);
}

function requireApplied(result: SimResult, label: string): SimState {
 if (!result.ok) throw new Error(`synthetic wallet scenario unexpectedly refused ${label}: ${result.refusedBy}`);
 return result.state;
}

function quote(atMs: number, out: number, networkFeeUsd: number, tradeFeeUsd: number, accountOpenUsd: number): SimQuote {
 return { atMs, out, networkFeeUsd, tradeFeeUsd, accountOpenUsd };
}

function order(side: "buy", atMs: number, id: string, usd: number, q: SimQuote): SimOrder;
function order(side: "sell", atMs: number, id: string, qty: number, q: SimQuote): SimOrder;
function order(side: "buy" | "sell", atMs: number, id: string, amount: number, q: SimQuote): SimOrder {
 return side === "buy" ? { side, atMs, id, usd: amount, quote: q } : { side, atMs, id, qty: amount, quote: q };
}

function maxDrawdownPct(equity: readonly number[]): number {
 let peak = 0;
 let drawdown = 0;
 for (const value of equity) {
  if (value > peak) peak = value;
  if (peak > 0) drawdown = Math.max(drawdown, (peak - value) / peak);
 }
 return clean(drawdown * 100);
}

function sumKnownQuotes(quotes: readonly SimQuote[], field: "networkFeeUsd" | "tradeFeeUsd" | "accountOpenUsd"): number {
 let total = 0;
 for (const item of quotes) {
  const value = item[field];
  if (value === null || !Number.isFinite(value) || value < 0) throw new Error(`known synthetic wallet ${field} became unknown`);
  total += value;
 }
 return clean(total);
}

interface WalletStress {
 readonly report: Record<string, unknown>;
 readonly metrics: Readonly<Record<string, number>>;
}

function runWalletStress(): WalletStress {
 const initial = newSim(WALLET_START_USD);
 const quoteA = quote(1, 0.6, 0.25, 0.35, 1.0);
 let state = requireApplied(applyOrder(initial, order("buy", 1, SYNTHETIC_WALLET_ASSET_A, 60, quoteA)), "first buy");
 const equityAfterFirstBuy = equityUsd(state, { [SYNTHETIC_WALLET_ASSET_A]: 100 }).usd;
 if (equityAfterFirstBuy === null) throw new Error("known first synthetic wallet mark was unexpectedly unknown");

 const quoteB = quote(2, 0.2, 0.1, 0.1, 0.5);
 state = requireApplied(applyOrder(state, order("buy", 2, SYNTHETIC_WALLET_ASSET_B, 20, quoteB)), "second buy");
 const equityAfterSecondBuy = equityUsd(state, { [SYNTHETIC_WALLET_ASSET_A]: 100, [SYNTHETIC_WALLET_ASSET_B]: 100 }).usd;
 if (equityAfterSecondBuy === null) throw new Error("known second synthetic wallet mark was unexpectedly unknown");

 const contentionQuote = quote(3, 0.36, 0.25, 0.25, 0);
 const contention = applyOrder(state, order("buy", 3, SYNTHETIC_WALLET_ASSET_B, 36, contentionQuote));
 if (contention.ok || contention.refusedBy !== "caixa") throw new Error("synthetic wallet cash contention did not refuse as expected");
 state = contention.state;

 const partialSellQuote = quote(4, 21, 0.05, 0.08, 0);
 state = requireApplied(applyOrder(state, order("sell", 4, SYNTHETIC_WALLET_ASSET_A, 0.2, partialSellQuote)), "partial sell");
 const remainingQty = state.positions[SYNTHETIC_WALLET_ASSET_A]?.qty;
 if (remainingQty === undefined || Math.abs(remainingQty - 0.4) > 1e-12) throw new Error("synthetic wallet partial sell did not preserve the remaining quantity");
 const equityAfterPartialSell = equityUsd(state, { [SYNTHETIC_WALLET_ASSET_A]: 105, [SYNTHETIC_WALLET_ASSET_B]: 100 }).usd;
 if (equityAfterPartialSell === null) throw new Error("known partial-sale marks were unexpectedly unknown");

 const finalMarks = { [SYNTHETIC_WALLET_ASSET_A]: 110, [SYNTHETIC_WALLET_ASSET_B]: 110 };
 const finalEquity = equityUsd(state, finalMarks);
 const returnPct = unitizedReturnPct(WALLET_START_USD, finalEquity.usd, state);
 if (finalEquity.usd === null || returnPct === null) throw new Error("known synthetic wallet stress unexpectedly has an unknown return");
 const markedPositions = Object.entries(state.positions).map(([id, position]) => ({ id, usd: position.qty * (finalMarks[id as keyof typeof finalMarks] as number) }));
 const markedInvestmentsUsd = markedPositions.reduce((sum, position) => sum + position.usd, 0);
 const topPositionUsd = markedPositions.reduce((max, position) => Math.max(max, position.usd), 0);
 const acceptedQuotes = [quoteA, quoteB, partialSellQuote];
 const fees = {
  networkFeeUsd: sumKnownQuotes(acceptedQuotes, "networkFeeUsd"),
  tradeFeeUsd: sumKnownQuotes(acceptedQuotes, "tradeFeeUsd"),
  accountOpenUsd: sumKnownQuotes(acceptedQuotes, "accountOpenUsd"),
  totalUsd: state.feesUsd,
 };
 const summedFees = fees.networkFeeUsd + fees.tradeFeeUsd + fees.accountOpenUsd;
 if (Math.abs(summedFees - state.feesUsd) > 1e-12) throw new Error("synthetic wallet fee accounting disagrees with applyOrder");
 const partialSaleUsd = partialSellQuote.out;
 if (partialSaleUsd === null) throw new Error("synthetic wallet partial sale has an unknown proceeds value");
 const turnoverUsd = 60 + 20 + partialSaleUsd;
 const equityPath = [WALLET_START_USD, equityAfterFirstBuy, equityAfterSecondBuy, equityAfterPartialSell, finalEquity.usd];
 const drawdownPct = maxDrawdownPct(equityPath);
 const cashShare = state.cashUsd / finalEquity.usd;
 const exposureShare = markedInvestmentsUsd / finalEquity.usd;
 const concentrationShare = markedInvestmentsUsd > 0 ? topPositionUsd / markedInvestmentsUsd : null;

 const missingCostResult = applyOrder(
  newSim(WALLET_START_USD),
  order("buy", 5, SYNTHETIC_WALLET_ASSET_A, 10, { ...quote(5, 0.1, 0, 0.02, 0), networkFeeUsd: null }),
 );
 const missingCostState = requireApplied(missingCostResult, "missing-cost case");
 const markedWithMissingCost = equityUsd(missingCostState, { [SYNTHETIC_WALLET_ASSET_A]: 100 });
 const missingCostReturnPct = unitizedReturnPct(WALLET_START_USD, markedWithMissingCost.usd, missingCostState);
 if (missingCostState.unknownCostOrders !== 1 || missingCostReturnPct !== null) throw new Error("unknown synthetic wallet cost was treated as known");

 const missingMarkState = requireApplied(
  applyOrder(newSim(WALLET_START_USD), order("buy", 6, SYNTHETIC_WALLET_ASSET_A, 10, quote(6, 0.1, 0.01, 0.02, 0))),
  "missing-mark case",
 );
 const missingMark = equityUsd(missingMarkState, { [SYNTHETIC_WALLET_ASSET_A]: null });
 const missingMarkReturnPct = unitizedReturnPct(WALLET_START_USD, missingMark.usd, missingMarkState);
 if (missingMark.usd !== null || missingMarkReturnPct !== null) throw new Error("synthetic wallet position without a mark was not kept unknown");

 const metrics: Record<string, number> = {
  synthetic_wallet_known_stress_start_usd: WALLET_START_USD,
  synthetic_wallet_known_stress_end_equity_usd: clean(finalEquity.usd),
  synthetic_wallet_known_stress_return_pct: clean(returnPct),
  synthetic_wallet_known_fees_usd: clean(state.feesUsd),
  synthetic_wallet_known_network_fees_usd: fees.networkFeeUsd,
  synthetic_wallet_known_trade_fees_usd: fees.tradeFeeUsd,
  synthetic_wallet_known_account_open_cost_usd: fees.accountOpenUsd,
  synthetic_wallet_known_drawdown_pct: drawdownPct,
  synthetic_wallet_known_cash_share: clean(cashShare),
  synthetic_wallet_known_exposure_share: clean(exposureShare),
  synthetic_wallet_known_turnover_usd: clean(turnoverUsd),
  synthetic_wallet_known_turnover_of_start_pct: clean((turnoverUsd / WALLET_START_USD) * 100),
  synthetic_wallet_known_applied_orders: state.applied,
  synthetic_wallet_known_refused_orders: state.refused,
  synthetic_wallet_unknown_cost_orders: missingCostState.unknownCostOrders,
  synthetic_wallet_missing_mark_assets: missingMark.unmarked.length,
 };
 if (concentrationShare !== null) metrics.synthetic_wallet_known_top_position_share = clean(concentrationShare);

 return {
  metrics,
  report: {
   classification: "synthetic_wallet_stress",
   separateFromLabPrimary: true,
   startUsd: WALLET_START_USD,
   endingKnownScenario: {
    markedEquityUsd: clean(finalEquity.usd),
    unitizedReturnPct: clean(returnPct),
    cashUsd: clean(state.cashUsd),
    knownFeesUsd: fees,
    appliedOrders: state.applied,
    refusedOrders: state.refused,
    cashContentionRefusal: "caixa",
    partialSell: { asset: SYNTHETIC_WALLET_ASSET_A, soldQty: 0.2, remainingQty: state.positions[SYNTHETIC_WALLET_ASSET_A]?.qty ?? null },
    markedPositionUsd: Object.fromEntries(markedPositions.map((position) => [position.id, clean(position.usd)])),
    exposureShare: clean(exposureShare),
    cashShare: clean(cashShare),
    topPositionShareOfMarkedInvestments: concentrationShare === null ? null : clean(concentrationShare),
    turnoverUsd: clean(turnoverUsd),
    turnoverOfStartPct: clean((turnoverUsd / WALLET_START_USD) * 100),
    maxDrawdownPct: drawdownPct,
    feesDeductedOnceByApplyOrder: true,
   },
   unknownCostCase: {
    unknownCostOrders: missingCostState.unknownCostOrders,
    markedEquityUsd: null,
    unitizedReturnPct: missingCostReturnPct,
    status: "unknown",
    reason: "Synthetic network fee is unknown; the known fee components are not treated as complete cost.",
   },
   missingMarkCase: {
    equityUsd: missingMark.usd,
    unitizedReturnPct: missingMarkReturnPct,
    unmarkedAssets: missingMark.unmarked,
    status: "unknown",
    reason: "Synthetic held position has no usable mark.",
   },
   limitations: [
    "Synthetic quote values exercise the pure accounting API; they are not executable quotes or venue costs.",
    "The wallet stress is separate from the paired laboratory return and is not extrapolated to a target balance or time horizon.",
   ],
  },
 };
}

function buildMetrics(
 pair: PairedReturnSummary,
 candidate: PolicySelectionSummary,
 ancestor: PolicySelectionSummary,
 candidateReport: PolicyReport,
 processedEpochs: number,
 plannedEpochs: number,
 pendingEpochs: number,
 walletMetrics: Readonly<Record<string, number>>,
): Record<string, number> {
 if (pair.meanBps === null || pair.completePairs === 0) throw new Error("synthetic paired net return has no complete candidate/ancestor epochs");
 const metrics: Record<string, number> = {
  synthetic_paired_net_return_bps: clean(pair.meanBps),
  synthetic_paired_complete_pairs: pair.completePairs,
  synthetic_paired_excluded_epochs: pair.excludedEpochs,
  synthetic_paired_candidate_complete_epochs: pair.candidateCompleteEpochs,
  synthetic_paired_ancestor_complete_epochs: pair.ancestorCompleteEpochs,
  synthetic_run_planned_epochs: plannedEpochs,
  synthetic_run_processed_epochs: processedEpochs,
  synthetic_run_pending_epochs: pendingEpochs,
  synthetic_candidate_trade_count: candidate.trades,
  synthetic_candidate_hold_count: candidate.holds,
  synthetic_candidate_refusal_count: candidate.refusals,
  synthetic_candidate_complete_trade_outcomes: candidate.completeTradeOutcomes,
  synthetic_candidate_incomplete_trade_outcomes: candidate.incompleteTradeOutcomes,
  synthetic_candidate_unknown_cost_trade_outcomes: candidate.unknownCostTradeOutcomes,
  synthetic_ancestor_trade_count: ancestor.trades,
 };
 if (candidate.trades > 0) metrics.synthetic_candidate_cost_coverage = clean(candidate.completeTradeOutcomes / candidate.trades);
 setMetric(metrics, "synthetic_candidate_mean_gross_bps", candidate.grossBps);
 setMetric(metrics, "synthetic_candidate_mean_funding_bps", candidate.fundingBps);
 setMetric(metrics, "synthetic_candidate_mean_trading_cost_bps", candidate.tradingCostBps);
 setMetric(metrics, "synthetic_candidate_mean_opportunity_cost_bps", candidate.opportunityCostBps);
 setMetric(metrics, "synthetic_candidate_mean_net_notional_bps", candidate.netNotionalBps);
 setMetric(metrics, "synthetic_candidate_mean_net_return_on_capital_bps_per_epoch", pair.candidateMeanBps);
 setMetric(metrics, "synthetic_ancestor_mean_net_return_on_capital_bps_per_epoch", pair.ancestorMeanBps);
 setMetric(metrics, "synthetic_candidate_max_drawdown_pct", candidateReport.maxDrawdown === null ? null : candidateReport.maxDrawdown * 100);

 for (const leverage of candidateReport.leverage) {
  const prefix = `synthetic_candidate_leverage_${leverage.leverage}x`;
  if (leverage.applicableShare !== null) setMetric(metrics, `${prefix}_applicable_share`, leverage.applicableShare);
  if (leverage.observed === null) continue;
  setMetric(metrics, `${prefix}_tranche_final_equity_multiple`, leverage.observed.finalEquity);
  setMetric(metrics, `${prefix}_tranche_max_drawdown_pct`, leverage.observed.maxDrawdown * 100);
  setMetric(metrics, `${prefix}_liquidation_count`, leverage.observed.liquidations);
  setMetric(metrics, `${prefix}_liquidation_rate`, leverage.observed.liquidationRate);
 }
 for (const [id, value] of Object.entries(walletMetrics)) setMetric(metrics, id, value);
 return metrics;
}

function formatLeverageCounterfactuals(policy: PolicyReport): readonly Record<string, unknown>[] {
 return policy.leverage.map((row) => ({
  leverage: row.leverage,
  applicableShare: row.applicableShare,
  observedTranchePortfolio: row.observed === null ? null : {
   finalEquityMultiple: row.observed.finalEquity,
   maxDrawdownPct: row.observed.maxDrawdown * 100,
   minimumEquityMultiple: row.observed.minEquity,
   liquidationCount: row.observed.liquidations,
   liquidationRate: row.observed.liquidationRate,
  },
  classification: "synthetic_simplified_lab_counterfactual_not_venue_accurate",
 }));
}

interface CandidateProvenance {
 readonly type: "offline_candidate_policy_not_jev" | "offline_policy_injected_for_sensitivity";
 readonly method: string;
 readonly injectedPolicyId: string | null;
}

export async function runWorkload(): Promise<WorkloadResult> {
 return executeWorkload(createCandidatePolicy(), {
  type: "offline_candidate_policy_not_jev",
  method: "isolated offline chooser-free candidate policy; not the real Jev or a model inference",
  injectedPolicyId: null,
 });
}

/** Offline sensitivity hook for tests and the parent smoke check; the canonical no-argument runner stays fixed. */
export async function runWorkloadWithCandidate(candidateOverride: LabPolicy): Promise<WorkloadResult> {
 return executeWorkload(candidateOverride, {
  type: "offline_policy_injected_for_sensitivity",
  method: `offline chooser-free policy injection (${candidateOverride.id}); not the real Jev and no model chooser`,
  injectedPolicyId: candidateOverride.id,
 });
}

async function executeWorkload(candidateOverride: LabPolicy, candidateProvenance: CandidateProvenance): Promise<WorkloadResult> {
 if (candidateOverride.chooser !== null) throw new RangeError("candidate sensitivity hook accepts only chooser-free offline policies");
 const candidatePolicy: LabPolicy = {
  ...candidateOverride,
  id: RESEARCH_CANDIDATE_ID,
  baseline: false,
  tested: true,
  passive: false,
  chooser: null,
  decide: async (input) => {
   const decision = await candidateOverride.decide(input);
   return { ...decision, policyId: RESEARCH_CANDIDATE_ID };
  },
 };
 const ancestorPolicy = momentumRulePolicy();
 const policies: LabPolicy[] = [
  holdPolicy(),
  randomPolicy(SEED),
  buyAndHoldPolicy(),
  ancestorPolicy,
  carryRulePolicy(),
  candidatePolicy,
 ];
 const source = new SyntheticSource(CONFIG);
 const spec = buildSyntheticSpec(CONFIG, policies.map(describePolicy));
 const journal = new MemoryJournal(manifestOf(spec));
 const execution = await runEpochs({ source, policies, spec, journal });
 const data = journal.data();
 const pair = summarizePairedNetReturn(data);
 const candidateSelections = summarizePolicySelections(data, RESEARCH_CANDIDATE_ID);
 const ancestorSelections = summarizePolicySelections(data, ANCESTOR_POLICY_ID);
 const labReport = buildReport(data, { bootstrapResamples: 1 });
 const candidateStats = policyReport(labReport, RESEARCH_CANDIDATE_ID);
 const wallet = runWalletStress();
 const metrics = buildMetrics(pair, candidateSelections, ancestorSelections, candidateStats, execution.processed, execution.planned, execution.pending, wallet.metrics);

 const report = {
  schemaVersion: 1,
  workload: "deterministic_offline_synthetic_lab",
  provenance: {
   classification: "synthetic",
   sourceId: `synthetic:seed=${SEED}`,
   candidate: { id: RESEARCH_CANDIDATE_ID, type: candidateProvenance.type, injectedPolicyId: candidateProvenance.injectedPolicyId },
   ancestor: { id: ANCESTOR_POLICY_ID, type: "momentumRulePolicy" },
   externalAccess: false,
  },
  configuration: {
   seed: SEED,
   plannedEpochs: EPOCHS,
   barMinutes: CONFIG.barMs / MINUTE_MS,
   stepHours: CONFIG.stepMs / HOUR_MS,
   horizonHours: CONFIG.horizonMs / HOUR_MS,
   warmupHours: CONFIG.warmupMs / HOUR_MS,
   dailyDrift: CONFIG.dailyDrift,
   plantedEdgeBps: CONFIG.plantedEdgeBps,
   assets: CONFIG.assets.map((asset) => ({ base: asset.base, dailyVol: asset.dailyVol, startPrice: asset.startPrice })),
   funding: { intervalHours: CONFIG.funding.intervalMs / HOUR_MS, meanPerIntervalBps: CONFIG.funding.meanPerInterval * NOTIONAL_BPS, ar: CONFIG.funding.ar, innovationBps: CONFIG.funding.innovationSd * NOTIONAL_BPS, predictionNoiseBps: CONFIG.funding.predictionNoiseSd * NOTIONAL_BPS },
   marketCostProxy: {
    takerFeeBpsPerSide: { spot: COST_TABLE.feeTakerBps.spot, perp: COST_TABLE.feeTakerBps.perp },
    slippageBpsPerSide: COST_TABLE.slippageBpsPerSide,
    annualCashYield: COST_TABLE.cashYieldAnnual,
    referenceNotionalUsd: COST_TABLE.notionalUsd,
   },
  },
  execution: {
   plannedEpochs: execution.planned,
   processedEpochs: execution.processed,
   pendingEpochs: execution.pending,
   skippedEpochs: execution.skipped,
   journalRecords: { epochs: data.epochs.length, decisions: data.decisions.length, outcomes: data.outcomes.length },
   policies: policies.map((policy) => policy.id),
  },
  primary: {
   id: "synthetic_paired_net_return_bps",
   value: pair.meanBps,
   unit: "bps of capital per epoch",
   sampleCount: pair.completePairs,
   candidateCompleteEpochs: pair.candidateCompleteEpochs,
   ancestorCompleteEpochs: pair.ancestorCompleteEpochs,
   excludedEpochs: pair.excludedEpochs,
   definition: "Arithmetic mean of same-epoch candidate minus ancestor net returns divided by committed capital; only epochs complete for both enter. A successful hold is zero excess return; incomplete/refused decisions are unknown, not zero.",
   interpretation: "Synthetic development result only, not wallet profit. The initial baseline uses the ancestral rule; later candidate deltas do not establish a financial edge.",
  },
  candidate: {
   id: RESEARCH_CANDIDATE_ID,
   method: candidateProvenance.method,
   decisionStats: {
    decisions: candidateSelections.decisions,
    trades: candidateSelections.trades,
    holds: candidateSelections.holds,
    refusals: candidateSelections.refusals,
    usableEpochs: candidateStats.usableEpochs,
    incompleteDecisions: candidateStats.incompleteDecisions,
    tradeRate: candidateStats.tradeRate,
    costCoverage: candidateSelections.trades === 0 ? null : candidateSelections.completeTradeOutcomes / candidateSelections.trades,
    completeTradeOutcomes: candidateSelections.completeTradeOutcomes,
    incompleteTradeOutcomes: candidateSelections.incompleteTradeOutcomes,
    unknownCostTradeOutcomes: candidateSelections.unknownCostTradeOutcomes,
   },
   completedTradeMeans: {
    sampleCount: candidateSelections.completeTradeOutcomes,
    grossNotionalBps: candidateSelections.grossBps,
    fundingBps: candidateSelections.fundingBps,
    tradingCostProxyBps: candidateSelections.tradingCostBps,
    cashOpportunityCostBps: candidateSelections.opportunityCostBps,
    netNotionalBps: candidateSelections.netNotionalBps,
   },
   meanNetReturnOnCapitalBpsPerEpoch: pair.candidateMeanBps,
   maxDrawdownPct: candidateStats.maxDrawdown === null ? null : candidateStats.maxDrawdown * 100,
   leverageCounterfactuals: formatLeverageCounterfactuals(candidateStats),
  },
  ancestor: {
   id: ANCESTOR_POLICY_ID,
   decisionStats: { decisions: ancestorSelections.decisions, trades: ancestorSelections.trades, holds: ancestorSelections.holds, refusals: ancestorSelections.refusals },
   meanNetReturnOnCapitalBpsPerEpoch: pair.ancestorMeanBps,
  },
  walletStress: wallet.report,
  financialGoal: {
   status: "not_proven",
   target: { balanceUsd: 1_180, withinHours: 24 },
   reason: "No complete observed wallet equity series, reconciled external flows, fills, marks, and contemporaneous complete USD costs are evaluated by this synthetic stress.",
   extrapolation: "none",
  },
  limitations: [
   "Synthetic market paths with zero arithmetic drift and zero planted edge test mechanics only, not a financial edge or future return.",
   "Laboratory transaction costs are simplified CEX proxies and do not price OKX Wallet/OnchainOS execution, account creation, network fees, market impact, or fills.",
   "Leverage values are simplified laboratory counterfactuals and are not venue-accurate margin or liquidation results.",
   "No Choice weight is interpreted as a calibrated probability; no Brier or log-loss result is emitted.",
   "The wallet stress is a separate synthetic accounting scenario and is not extrapolated to the 10x/24-hour goal.",
  ],
 };

 return { metrics, report };
}
