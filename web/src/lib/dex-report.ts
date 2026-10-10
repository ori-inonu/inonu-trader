export interface DexReportToken {
  address: string;
  decimals: number;
  metadataSource: string;
}

export interface DexReportLeg {
  inputAtomic: string;
  outputAtomic: string;
  priceImpactPercent: number | null;
  fromTaxFraction: number | null;
  toTaxFraction: number | null;
  networkEstimates: {
    tradeFeeUsd: string | null;
    estimateGasFeeNativeAtomic: string | null;
  };
  requestedAt?: number;
  receivedAt?: number;
}

export interface DexReportTiming {
  startedAt: number;
  completedAt: number | null;
  elapsedMs: number | null;
  coverageRequestedAt: number | null;
  coverageReceivedAt: number | null;
}

export interface NormalizedDexReport {
  schemaVersion: 1;
  source: "synthetic" | "okx_authenticated";
  chainIndex: string;
  tokenA: DexReportToken;
  tokenB: DexReportToken;
  inputAtomic: string;
  outputAtomic: string | null;
  quotedGrossDeltaAtomic: string | null;
  status: "quoted_gross_delta" | "blocked" | "unknown";
  reasons: string[];
  legs: DexReportLeg[];
  execution: "not_qualified";
  liveQualified: false;
  netAtomic: null;
  netStatus: "net_not_evaluated";
  costsCoverage: "unknown";
  costUsd: null;
  quotaRemaining: null;
  timing?: DexReportTiming;
  policy: {
    maxElapsedMs: number;
    maxImpactMagnitudePercent: number;
  };
}

const EVM_CHAIN_IDS = new Set([
  "1", "10", "56", "130", "146", "196", "137", "42161", "43114", "324", "1101", "8453",
  "59144", "250", "5000", "1030", "1088", "4200", "81457", "169", "534352", "25", "7000",
]);
const INVALID_REPORT = "Invalid DEX report.";
const POSITIVE_ATOMIC = /^(?:[1-9][0-9]{0,77})$/;
const NON_NEGATIVE_ATOMIC = /^(?:0|[1-9][0-9]{0,77})$/;
const SIGNED_DELTA = /^(?:0|-?[1-9][0-9]{0,77})$/;

function invalid(): never {
  throw new Error(INVALID_REPORT);
}

function requireCondition(condition: unknown): asserts condition {
  if (!condition) invalid();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function matchesExactly(value: string, pattern: RegExp): boolean {
  const match = pattern.exec(value);
  return match !== null && match[0] === value;
}

function hasOwn(value: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function parseToken(value: unknown, chainIndex: string): DexReportToken {
  requireCondition(isRecord(value));
  requireCondition(typeof value.address === "string" && value.address.length >= 1 && value.address.length <= 256);
  requireCondition(!/[\s,\u0000-\u001f\u007f-\u009f]/u.test(value.address));
  requireCondition(Number.isInteger(value.decimals) && (value.decimals as number) >= 0 && (value.decimals as number) <= 255);
  requireCondition(typeof value.metadataSource === "string" && value.metadataSource.length <= 512);
  requireCondition(value.metadataSource.trim().length > 0 && !/[\u0000-\u001f\u007f-\u009f]/u.test(value.metadataSource));
  return {
    address: EVM_CHAIN_IDS.has(chainIndex) ? value.address.toLowerCase() : value.address,
    decimals: value.decimals as number,
    metadataSource: value.metadataSource,
  };
}

function parseTimestamp(value: unknown, nowWallMs: number, nullable: boolean): number | null {
  if (nullable && value === null) return null;
  requireCondition(Number.isSafeInteger(value) && (value as number) > 0 && (value as number) <= nowWallMs);
  return value as number;
}

function parseLeg(value: unknown, policyLimit: number, nowWallMs: number): DexReportLeg {
  requireCondition(isRecord(value));
  requireCondition(typeof value.inputAtomic === "string" && matchesExactly(value.inputAtomic, POSITIVE_ATOMIC));
  requireCondition(typeof value.outputAtomic === "string" && matchesExactly(value.outputAtomic, POSITIVE_ATOMIC));
  requireCondition(value.priceImpactPercent === null ||
    (typeof value.priceImpactPercent === "number" && Number.isFinite(value.priceImpactPercent) && Math.abs(value.priceImpactPercent) <= policyLimit));
  requireCondition(value.fromTaxFraction === null ||
    (typeof value.fromTaxFraction === "number" && Number.isFinite(value.fromTaxFraction) && value.fromTaxFraction >= 0 && value.fromTaxFraction <= 1));
  requireCondition(value.toTaxFraction === null ||
    (typeof value.toTaxFraction === "number" && Number.isFinite(value.toTaxFraction) && value.toTaxFraction >= 0 && value.toTaxFraction <= 1));
  requireCondition(isRecord(value.networkEstimates));
  const estimates = value.networkEstimates;
  requireCondition(estimates.tradeFeeUsd === null ||
    (typeof estimates.tradeFeeUsd === "string" && estimates.tradeFeeUsd.length <= 100 && matchesExactly(estimates.tradeFeeUsd, /^[0-9]+(?:\.[0-9]+)?$/)));
  requireCondition(estimates.estimateGasFeeNativeAtomic === null ||
    (typeof estimates.estimateGasFeeNativeAtomic === "string" && matchesExactly(estimates.estimateGasFeeNativeAtomic, NON_NEGATIVE_ATOMIC)));
  const leg: DexReportLeg = {
    inputAtomic: value.inputAtomic,
    outputAtomic: value.outputAtomic,
    priceImpactPercent: value.priceImpactPercent as number | null,
    fromTaxFraction: value.fromTaxFraction as number | null,
    toTaxFraction: value.toTaxFraction as number | null,
    networkEstimates: {
      tradeFeeUsd: estimates.tradeFeeUsd,
      estimateGasFeeNativeAtomic: estimates.estimateGasFeeNativeAtomic,
    },
  };
  if (hasOwn(value, "requestedAt")) leg.requestedAt = parseTimestamp(value.requestedAt, nowWallMs, false) as number;
  if (hasOwn(value, "receivedAt")) leg.receivedAt = parseTimestamp(value.receivedAt, nowWallMs, false) as number;
  requireCondition(leg.receivedAt === undefined || leg.requestedAt !== undefined);
  if (leg.requestedAt !== undefined && leg.receivedAt !== undefined) requireCondition(leg.receivedAt >= leg.requestedAt);
  return leg;
}

function parseTiming(value: unknown, nowWallMs: number): DexReportTiming {
  requireCondition(isRecord(value));
  const startedAt = parseTimestamp(value.startedAt, nowWallMs, false) as number;
  const completedAt = parseTimestamp(value.completedAt, nowWallMs, true);
  const coverageRequestedAt = parseTimestamp(value.coverageRequestedAt, nowWallMs, true);
  const coverageReceivedAt = parseTimestamp(value.coverageReceivedAt, nowWallMs, true);
  const elapsedMs = value.elapsedMs === null ? null : value.elapsedMs;
  requireCondition(elapsedMs === null || (Number.isSafeInteger(elapsedMs) && (elapsedMs as number) >= 0));
  requireCondition(coverageReceivedAt === null || coverageRequestedAt !== null);
  if (completedAt === null) requireCondition(elapsedMs === null);
  else requireCondition(elapsedMs === completedAt - startedAt);
  return { startedAt, completedAt, elapsedMs: elapsedMs as number | null, coverageRequestedAt, coverageReceivedAt };
}

function validateTimeline(report: NormalizedDexReport): void {
  const timeline: Array<number | null | undefined> = [];
  if (report.timing) {
    timeline.push(report.timing.startedAt, report.timing.coverageRequestedAt, report.timing.coverageReceivedAt);
  }
  for (const leg of report.legs) timeline.push(leg.requestedAt, leg.receivedAt);
  if (report.timing) timeline.push(report.timing.completedAt);
  let previous: number | undefined;
  for (const time of timeline) {
    if (time === null || time === undefined) continue;
    requireCondition(previous === undefined || time >= previous);
    previous = time;
  }
}

function parseDexReportInner(value: unknown, nowWallMs: number): NormalizedDexReport {
  requireCondition(Number.isSafeInteger(nowWallMs) && nowWallMs > 0);
  requireCondition(isRecord(value));
  const raw = value;
  requireCondition(raw.source === "synthetic" || raw.source === "okx_authenticated");
  requireCondition(typeof raw.chainIndex === "string" && raw.chainIndex.length <= 78 &&
    matchesExactly(raw.chainIndex, /^[1-9][0-9]{0,77}$/));
  const chainIndex = raw.chainIndex;
  const tokenA = parseToken(raw.tokenA, chainIndex);
  const tokenB = parseToken(raw.tokenB, chainIndex);
  requireCondition(EVM_CHAIN_IDS.has(chainIndex) ? tokenA.address !== tokenB.address : tokenA.address !== tokenB.address);
  requireCondition(typeof raw.inputAtomic === "string" && matchesExactly(raw.inputAtomic, POSITIVE_ATOMIC));
  requireCondition(raw.status === "quoted_gross_delta" || raw.status === "blocked" || raw.status === "unknown");
  requireCondition(Array.isArray(raw.reasons) && raw.reasons.length >= 2 && raw.reasons.length <= 32);
  const reasons: string[] = [];
  for (const reason of raw.reasons) {
    requireCondition(typeof reason === "string" && reason.length >= 1 && reason.length <= 128 && matchesExactly(reason, /^[a-z0-9_]+$/));
    reasons.push(reason);
  }
  requireCondition(reasons.includes("quoted_output_unit_inferred") && reasons.includes("total_cost_coverage_unknown"));
  requireCondition(isRecord(raw.policy));
  const policy = raw.policy;
  requireCondition(Number.isSafeInteger(policy.maxElapsedMs) && (policy.maxElapsedMs as number) > 0);
  requireCondition(typeof policy.maxImpactMagnitudePercent === "number" && Number.isFinite(policy.maxImpactMagnitudePercent) &&
    policy.maxImpactMagnitudePercent >= 0 && policy.maxImpactMagnitudePercent < 100);
  requireCondition(raw.execution === "not_qualified" && raw.liveQualified === false && raw.netAtomic === null &&
    raw.netStatus === "net_not_evaluated" && raw.costsCoverage === "unknown" && raw.costUsd === null && raw.quotaRemaining === null);
  requireCondition(typeof raw.outputAtomic === "string" && matchesExactly(raw.outputAtomic, POSITIVE_ATOMIC) || raw.outputAtomic === null);
  requireCondition(typeof raw.quotedGrossDeltaAtomic === "string" && matchesExactly(raw.quotedGrossDeltaAtomic, SIGNED_DELTA) || raw.quotedGrossDeltaAtomic === null);
  requireCondition(Array.isArray(raw.legs) && raw.legs.length <= 2);
  const legs = raw.legs.map((leg) => parseLeg(leg, policy.maxImpactMagnitudePercent as number, nowWallMs));
  if (legs.some((leg) => leg.fromTaxFraction === null || leg.toTaxFraction === null)) {
    requireCondition(reasons.includes("token_tax_fraction_unknown"));
  }
  const timing = raw.timing === undefined ? undefined : parseTiming(raw.timing, nowWallMs);
  const normalized: NormalizedDexReport = {
    schemaVersion: 1,
    source: raw.source,
    chainIndex,
    tokenA,
    tokenB,
    inputAtomic: raw.inputAtomic,
    outputAtomic: raw.outputAtomic as string | null,
    quotedGrossDeltaAtomic: raw.quotedGrossDeltaAtomic as string | null,
    status: raw.status,
    reasons,
    legs,
    execution: "not_qualified",
    liveQualified: false,
    netAtomic: null,
    netStatus: "net_not_evaluated",
    costsCoverage: "unknown",
    costUsd: null,
    quotaRemaining: null,
    policy: {
      maxElapsedMs: policy.maxElapsedMs as number,
      maxImpactMagnitudePercent: policy.maxImpactMagnitudePercent as number,
    },
  };
  if (timing) normalized.timing = timing;
  if (raw.status === "quoted_gross_delta") {
    requireCondition(normalized.outputAtomic !== null && normalized.quotedGrossDeltaAtomic !== null && legs.length === 2);
    requireCondition(legs[0]!.priceImpactPercent !== null && legs[1]!.priceImpactPercent !== null);
    requireCondition(legs[0]!.inputAtomic === normalized.inputAtomic);
    requireCondition(legs[1]!.inputAtomic === legs[0]!.outputAtomic);
    requireCondition(normalized.outputAtomic === legs[1]!.outputAtomic);
    const delta = (BigInt(normalized.outputAtomic) - BigInt(normalized.inputAtomic)).toString();
    requireCondition(normalized.quotedGrossDeltaAtomic === delta);
    requireCondition(timing !== undefined && timing.completedAt !== null && timing.elapsedMs !== null &&
      timing.coverageRequestedAt !== null && timing.coverageReceivedAt !== null);
    requireCondition(legs[0]!.requestedAt !== undefined && legs[0]!.receivedAt !== undefined &&
      legs[1]!.requestedAt !== undefined && legs[1]!.receivedAt !== undefined);
    requireCondition(timing.elapsedMs <= normalized.policy.maxElapsedMs);
  } else {
    requireCondition(normalized.outputAtomic === null && normalized.quotedGrossDeltaAtomic === null);
    if (legs.length >= 1) requireCondition(legs[0]!.inputAtomic === normalized.inputAtomic);
    if (legs.length === 2) requireCondition(legs[1]!.inputAtomic === legs[0]!.outputAtomic);
  }
  validateTimeline(normalized);
  return normalized;
}

export function parseDexReport(value: unknown, options: { nowWallMs: number }): NormalizedDexReport {
  try {
    return parseDexReportInner(value, options.nowWallMs);
  } catch {
    invalid();
  }
}

export function formatAtomicAmount(value: string, decimals: number): string {
  requireCondition(Number.isInteger(decimals) && decimals >= 0 && decimals <= 255);
  const negative = value.startsWith("-");
  const digits = negative ? value.slice(1) : value;
  requireCondition(matchesExactly(digits, /^(?:0|[1-9][0-9]{0,77})$/) && !(negative && digits === "0"));
  if (decimals === 0) return (negative ? "-" : "") + digits;
  const padded = digits.padStart(decimals + 1, "0");
  const whole = padded.slice(0, padded.length - decimals);
  const fraction = padded.slice(padded.length - decimals).replace(/0+$/, "");
  return (negative ? "-" : "") + whole + (fraction.length > 0 ? "." + fraction : "");
}
