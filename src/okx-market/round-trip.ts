import { normalizeTokenAddress } from './token-identity';
import { isOkxDexReadOnlyClient } from './okx-dex';
export interface DexToken { address: string; decimals: number; metadataSource: string }
export interface HypotheticalRoundTripInput { inputAtomic: string; outputAtomic: string; externalCostsAtomic: string; bufferAtomic: string }
export function hypotheticalRoundTripEconomics(input: HypotheticalRoundTripInput) {
  if (!isRecord(input) || !atomic(input.inputAtomic) || !atomic(input.outputAtomic) ||
    ![input.externalCostsAtomic, input.bufferAtomic].every(value => typeof value === 'string' && /^(0|[1-9]\d{0,77})$/.test(value))) {
    throw new Error('Invalid hypothetical atomic inputs.');
  }
  const gross = BigInt(input.outputAtomic) - BigInt(input.inputAtomic);
  const net = gross - BigInt(input.externalCostsAtomic);
  return { hypothetical: true as const, execution: 'not_qualified' as const, grossDeltaAtomic: gross.toString(),
    netAtomic: net.toString(), eligible: net > BigInt(input.bufferAtomic),
    costsCoverage: 'caller_assumed_complete' as const, coverageVerified: false as const };
}
export interface DexQuoteInput { chainIndex: string; fromTokenAddress: string; toTokenAddress: string; amount: string; priceImpactProtectionPercent: number }
export interface DexQuoteClient {
  supportedChain(chainIndex: string): Promise<Record<string, unknown>[]>;
  quote(input: DexQuoteInput): Promise<Record<string, unknown>[]>;
}
export interface RoundTripInput {
  client: DexQuoteClient; chainIndex: string; tokenA: DexToken; tokenB: DexToken; amountAtomic: string;
  policy: { maxElapsedMs: number; maxImpactMagnitudePercent: number };
  /** Legacy caller annotation; never grants provenance or paired atomic arithmetic. */
  source: 'synthetic' | 'okx_authenticated'; now?: () => number;
}
export interface QuoteLeg {
  inputAtomic: string; outputAtomic: string; priceImpactPercent: number | null;
  fromTaxFraction: number | null; toTaxFraction: number | null;
  networkEstimates: { tradeFeeUsd: string | null; estimateGasFeeNativeAtomic: string | null };
  requestedAt?: number; receivedAt?: number;
}
export interface RoundTripReport {
  source: 'synthetic' | 'okx_read_only_adapter' | 'unknown'; chainIndex: string; tokenA: DexToken; tokenB: DexToken;
  inputAtomic: string; outputAtomic: string | null; quotedGrossDeltaAtomic: string | null;
  status: 'quoted_gross_delta' | 'blocked' | 'unknown'; reasons: string[]; legs: QuoteLeg[];
  execution: 'not_qualified'; liveQualified: false; netAtomic: null; netStatus: 'net_not_evaluated'; costsCoverage: 'unknown';
  costUsd: null; quotaRemaining: null;
  rawQuote?: { fromTokenAddress: string; toTokenAddress: string; inputAtomic: string; outputRaw: string;
    outputUnit: 'unknown'; requestedAt: number; receivedAt: number };
  timing?: { startedAt: number; completedAt: number | null; elapsedMs: number | null; coverageRequestedAt: number | null; coverageReceivedAt: number | null };
  policy: RoundTripInput['policy'];
}
function address(chainIndex: string, text: string) { return normalizeTokenAddress(chainIndex, text); }
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value); }
function atomic(value: unknown): value is string { return typeof value === 'string' && /^[1-9]\d{0,77}$/.test(value); }
function chain(value: unknown): value is string { return typeof value === 'string' && /^[1-9]\d*$/.test(value); }
function validAddress(value: unknown): value is string { return typeof value === 'string' && value.length > 0 && !/[\s,]/u.test(value); }
function validToken(value: unknown): value is DexToken {
  return isRecord(value) && validAddress(value.address) && Number.isInteger(value.decimals) &&
    (value.decimals as number) >= 0 && (value.decimals as number) <= 255 &&
    typeof value.metadataSource === 'string' && value.metadataSource.trim().length > 0 && !/[\r\n]/.test(value.metadataSource);
}
function validateInput(input: RoundTripInput) {
  if (!isRecord(input) || !chain(input.chainIndex) || !validToken(input.tokenA) || !validToken(input.tokenB) ||
    !atomic(input.amountAtomic) || address(input.chainIndex, input.tokenA.address) === address(input.chainIndex, input.tokenB.address) ||
    !isRecord(input.policy) || !Number.isSafeInteger(input.policy.maxElapsedMs) || input.policy.maxElapsedMs < 1 ||
    !Number.isFinite(input.policy.maxImpactMagnitudePercent) || input.policy.maxImpactMagnitudePercent < 0 || input.policy.maxImpactMagnitudePercent >= 100 ||
    !isRecord(input.client) || typeof input.client.supportedChain !== 'function' || typeof input.client.quote !== 'function' ||
    (input.source !== 'synthetic' && input.source !== 'okx_authenticated') || (input.now !== undefined && typeof input.now !== 'function')) {
    throw new Error('Invalid round-trip input.');
  }
}
const quoteGates = new WeakMap<object, { status: 'blocked' | 'unknown'; reason: string }>();
function stop(status: 'blocked' | 'unknown', reason: string): never {
  const error = new Error(reason);
  quoteGates.set(error, { status, reason });
  throw error;
}
function quoteGate(error: unknown) {
  if ((typeof error !== 'object' && typeof error !== 'function') || error === null) return undefined;
  return quoteGates.get(error);
}
function responseToken(value: unknown): { address: string; decimals: number; raw: Record<string, unknown> } {
  if (!isRecord(value) || !validAddress(value.tokenContractAddress) || typeof value.decimal !== 'string' ||
    !/^(0|[1-9]\d{0,2})$/.test(value.decimal) || Number(value.decimal) > 255) stop('unknown', 'token_metadata_unknown');
  return { address: value.tokenContractAddress, decimals: Number(value.decimal), raw: value };
}
function decimal(value: unknown, signed = false): number | null {
  if (typeof value !== 'string' || value.length > 100 || !(signed ? /^[+-]?\d+(?:\.\d+)?$/ : /^\d+(?:\.\d+)?$/).test(value)) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
function magnitudeExceeds(value: string, limit: number): boolean {
  const parts = (text: string) => {
    const match = /^[+-]?(\d+)(?:\.(\d+))?(?:e([+-]?\d+))?$/.exec(text)!;
    const scale = (match[2]?.length ?? 0) - Number(match[3] ?? 0);
    const coefficient = BigInt(match[1]! + (match[2] ?? ''));
    return scale < 0 ? { coefficient: coefficient * 10n ** BigInt(-scale), scale: 0 } : { coefficient, scale };
  };
  const left = parts(value), right = parts(String(limit));
  return left.coefficient * 10n ** BigInt(right.scale) > right.coefficient * 10n ** BigInt(left.scale);
}
function unverifiedQuote(records: unknown, input: RoundTripInput, fromToken: DexToken, toToken: DexToken,
  requestedAt: number, receivedAt: number): NonNullable<RoundTripReport['rawQuote']> {
  if (!Array.isArray(records) || records.length !== 1 || !isRecord(records[0])) stop('unknown', 'quote_schema_or_count_unknown');
  const record = records[0];
  if (!chain(record.chainIndex) || typeof record.swapMode !== 'string' || !atomic(record.fromTokenAmount) ||
    typeof record.toTokenAmount !== 'string' || record.toTokenAmount.length > 256 ||
    !/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(record.toTokenAmount)) stop('unknown', 'quote_units_or_identity_unknown');
  const from = responseToken(record.fromToken), to = responseToken(record.toToken);
  if (record.chainIndex !== input.chainIndex || record.swapMode !== 'exactIn' || record.fromTokenAmount !== input.amountAtomic ||
    address(input.chainIndex, from.address) !== fromToken.address || address(input.chainIndex, to.address) !== toToken.address ||
    from.decimals !== fromToken.decimals || to.decimals !== toToken.decimals) stop('blocked', 'quote_identity_or_units_mismatch');
  if (from.raw.isHoneyPot === true || to.raw.isHoneyPot === true) stop('blocked', 'honeypot_detected');
  if (from.raw.isHoneyPot !== false || to.raw.isHoneyPot !== false) stop('unknown', 'honeypot_status_unknown');
  if (decimal(record.priceImpactPercent, true) === null) stop('unknown', 'price_impact_unknown');
  if (magnitudeExceeds(record.priceImpactPercent as string, input.policy.maxImpactMagnitudePercent)) stop('blocked', 'price_impact_exceeds_policy');
  return { fromTokenAddress: fromToken.address, toTokenAddress: toToken.address, inputAtomic: record.fromTokenAmount as string,
    outputRaw: record.toTokenAmount as string, outputUnit: 'unknown', requestedAt, receivedAt };
}
export async function quoteRoundTrip(input: RoundTripInput): Promise<RoundTripReport> {
  validateInput(input);
  const now = input.now ?? Date.now;
  let last: number;
  try { last = now(); } catch { throw new Error('Invalid round-trip input.'); }
  if (!Number.isSafeInteger(last) || last <= 0) throw new Error('Invalid round-trip input.');
  const startedAt = last;
  const sample = () => {
    let value: number;
    try { value = now(); } catch { return stop('unknown', 'local_clock_unknown'); }
    if (!Number.isSafeInteger(value) || value <= 0 || value < last) stop('unknown', 'local_clock_unknown');
    last = value; return value;
  };
  const fresh = (time: number) => {
    if (time - startedAt > input.policy.maxElapsedMs) stop('blocked', 'scenario_elapsed_exceeds_policy');
  };
  const tokenA = { address: address(input.chainIndex, input.tokenA.address), decimals: input.tokenA.decimals, metadataSource: input.tokenA.metadataSource };
  const tokenB = { address: address(input.chainIndex, input.tokenB.address), decimals: input.tokenB.decimals, metadataSource: input.tokenB.metadataSource };
  const source = isOkxDexReadOnlyClient(input.client) ? 'okx_read_only_adapter' : 'unknown';
  const report: RoundTripReport = { source, chainIndex: input.chainIndex, tokenA, tokenB, inputAtomic: input.amountAtomic,
    outputAtomic: null, quotedGrossDeltaAtomic: null, status: 'unknown',
    reasons: ['provider_output_unit_unverified', 'total_cost_coverage_unknown'], legs: [],
    execution: 'not_qualified', liveQualified: false, netAtomic: null, netStatus: 'net_not_evaluated', costsCoverage: 'unknown',
    costUsd: null, quotaRemaining: null, policy: { maxElapsedMs: input.policy.maxElapsedMs, maxImpactMagnitudePercent: input.policy.maxImpactMagnitudePercent },
    timing: { startedAt, completedAt: null, elapsedMs: null, coverageRequestedAt: null, coverageReceivedAt: null } };
  const failure = (error: unknown) => {
    const gate = quoteGate(error);
    report.status = gate?.status ?? 'unknown';
    const reason = gate?.reason ?? 'provider_request_failed';
    if (!report.reasons.includes(reason)) report.reasons.push(reason);
    report.outputAtomic = null; report.quotedGrossDeltaAtomic = null;
  };
  try {
  report.timing!.coverageRequestedAt = sample(); fresh(last);
  const coverage = await input.client.supportedChain(input.chainIndex);
  report.timing!.coverageReceivedAt = sample(); fresh(last);
  if (!Array.isArray(coverage) || !coverage.every(record => isRecord(record) && chain(record.chainIndex) &&
    typeof record.chainName === 'string' && typeof record.dexTokenApproveAddress === 'string')) {
    stop('unknown', 'coverage_schema_unknown');
  }
  const matches = coverage.filter(record => record.chainIndex === input.chainIndex);
  if (matches.length !== 1) {
    stop(matches.length === 0 ? 'blocked' : 'unknown', matches.length === 0 ? 'chain_not_supported' : 'coverage_ambiguous');
  }
  const firstRequestedAt = sample(); fresh(last);
  const firstRecords = await input.client.quote({ chainIndex: input.chainIndex, fromTokenAddress: tokenA.address,
    toTokenAddress: tokenB.address, amount: input.amountAtomic, priceImpactProtectionPercent: input.policy.maxImpactMagnitudePercent });
  const firstReceivedAt = sample(); fresh(last);
  // No client-supplied transport or label can qualify provider output units or request a dependent leg.
  report.rawQuote = unverifiedQuote(firstRecords, input, tokenA, tokenB, firstRequestedAt, firstReceivedAt);
  stop('unknown', 'provider_output_unit_unverified');
  } catch (error) {
    failure(error);
  }
  try {
    const completedAt = sample();
    report.timing!.completedAt = completedAt; report.timing!.elapsedMs = completedAt - startedAt;
    fresh(completedAt);
  } catch (error) { failure(error); }
  return report;
}
