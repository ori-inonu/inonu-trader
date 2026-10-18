export type DefiErrorCode = "invalid_arguments" | "invalid_file" | "invalid_utf8" | "invalid_json" | "invalid_capture" | "invalid_envelope" | "invalid_search" | "invalid_identity" | "duplicate_identity" | "invalid_clock";

export class DefiReportError extends Error {
  readonly code: DefiErrorCode;
  constructor(code: DefiErrorCode) {
    super(code);
    this.name = "DefiReportError";
    this.code = code;
  }
}

type Source = "search" | "detail";
type SourceClaim = "synthetic" | "okx_api_claimed";
type IssueField = "productName" | "platformName" | "platformId" | "network" | "advertisedYield.value" | "advertisedYield.label" | "tvl.value" | "fee.value" | "capabilities.isInvestable" | "capabilities.isSupportRedeem" | "capabilities.isSupportClaim";
type Issue = { field: IssueField; code: "missing_optional" | "invalid_optional" };
type Capture = { sourceClaim: SourceClaim; capturedAtMs: number | null; data: Record<string, unknown> };

export type DefiObservation = {
  source: Source;
  identity: { investmentId: string; representation: "text" | "safe_integer"; chainIndex: string };
  productName: string | null;
  platformName: string | null;
  platformId: string | null;
  network: string | null;
  advertisedYield: { value: string | null; label: string | null; unit: "decimal_fraction" | "unknown" };
  tvl: { value: string | null; unit: "USD" | "unknown" };
  fee: { value: string | null; basis: "unknown"; completeCost: null };
  capabilities: { isInvestable: boolean | null; isSupportRedeem: boolean | null; isSupportClaim: boolean | null };
  provenance: {
    sourceClaim: SourceClaim;
    verification: "unverified";
    capturedAtMs: number | null;
    ageMs: number | null;
    freshness: "unknown" | "future" | "fresh_local_capture" | "stale";
    providerTimestampMs: null;
    providerTtlMs: null;
  };
  issues: Issue[];
};

export type DefiReport = {
  schema: "okx_defi_report_v1";
  generatedAtMs: number;
  maxAgeMs: number;
  mode: "synthetic" | "imported";
  searchCoverage: { claimedTotal: number; observedCount: number; status: "partial_unverified" };
  observations: DefiObservation[];
  association: { status: "identity_match_unverified" | "unmatched"; searchIndex: number | null; detailIndex: number };
  execution: "not_qualified";
  netReturn: null;
  executableExit: null;
  personalEligibility: "unknown";
  totalCosts: null;
};

function record(value: unknown, code: DefiErrorCode = "invalid_capture"): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new DefiReportError(code);
  return value as Record<string, unknown>;
}

function clock(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value <= 8640000000000000;
}

function capture(value: unknown, endpoint: Source): Capture {
  const raw = record(value);
  if (raw.schema !== "okx_defi_capture_v1" || raw.endpoint !== endpoint || (raw.sourceClaim !== "synthetic" && raw.sourceClaim !== "okx_api_claimed")) throw new DefiReportError("invalid_capture");
  if (raw.capturedAtMs !== null && !clock(raw.capturedAtMs)) throw new DefiReportError("invalid_clock");
  const response = record(raw.response, "invalid_envelope");
  if (response.code !== 0) throw new DefiReportError("invalid_envelope");
  return {
    sourceClaim: raw.sourceClaim,
    capturedAtMs: raw.capturedAtMs,
    data: record(response.data, "invalid_envelope"),
  };
}

function identity(raw: Record<string, unknown>): DefiObservation["identity"] {
  const id = raw.investmentId;
  const chain = raw.chainIndex;
  const textId = typeof id === "string" && id.length >= 1 && id.length <= 128 && !/[^A-Za-z0-9_.:-]/.test(id);
  const integerId = typeof id === "number" && Number.isSafeInteger(id) && id > 0;
  if ((!textId && !integerId) || typeof chain !== "string" || chain.length < 1 || chain.length > 20 || chain[0] === "0" || /[^0-9]/.test(chain)) throw new DefiReportError("invalid_identity");
  return { investmentId: String(id), representation: integerId ? "safe_integer" : "text", chainIndex: chain };
}

function observation(raw: Record<string, unknown>, source: Source, captured: Capture, nowMs: number, maxAgeMs: number): DefiObservation {
  const issues: Issue[] = [];
  function optional<T>(value: unknown, field: IssueField, valid: (value: unknown) => value is T): T | null {
    if (valid(value)) return value;
    issues.push({ field, code: value === undefined || value === null ? "missing_optional" : "invalid_optional" });
    return null;
  }
  function text(value: unknown, field: IssueField, maxLength: number): string | null {
    return optional(value, field, (candidate): candidate is string => typeof candidate === "string" && candidate.length <= maxLength && candidate.trim().length > 0 && !/[\u0000-\u001f\u007f-\u009f]/.test(candidate));
  }
  function decimal(value: unknown, field: IssueField, allowNegative: boolean): string | null {
    return optional(value, field, (candidate): candidate is string => typeof candidate === "string" && candidate.length <= 96 && (allowNegative || !candidate.startsWith("-")) && /^-?(0|[1-9][0-9]*)(\.[0-9]+)?$/.exec(candidate)?.[0] === candidate);
  }
  function boolean(value: unknown, field: IssueField): boolean | null {
    return optional(value, field, (candidate): candidate is boolean => typeof candidate === "boolean");
  }
  const timestamp = captured.capturedAtMs;
  const ageMs = timestamp === null || timestamp > nowMs ? null : nowMs - timestamp;
  return {
    source,
    identity: identity(raw),
    productName: text(source === "search" ? raw.name : raw.investmentName, "productName", 160),
    platformName: text(raw.platformName, "platformName", 160),
    platformId: source === "detail" ? text(raw.analysisPlatformId, "platformId", 128) : null,
    network: source === "detail" ? text(raw.network, "network", 80) : null,
    advertisedYield: {
      value: decimal(raw.rate, "advertisedYield.value", true),
      label: source === "detail" ? text(raw.rateTypeDesc, "advertisedYield.label", 32) : "APY",
      unit: source === "search" ? "decimal_fraction" : "unknown",
    },
    tvl: { value: decimal(raw.tvl, "tvl.value", false), unit: source === "search" ? "USD" : "unknown" },
    fee: { value: decimal(raw.feeRate, "fee.value", false), basis: "unknown", completeCost: null },
    capabilities: {
      isInvestable: source === "detail" ? boolean(raw.isInvestable, "capabilities.isInvestable") : null,
      isSupportRedeem: source === "detail" ? boolean(raw.isSupportRedeem, "capabilities.isSupportRedeem") : null,
      isSupportClaim: source === "detail" ? boolean(raw.isSupportClaim, "capabilities.isSupportClaim") : null,
    },
    provenance: {
      sourceClaim: captured.sourceClaim,
      verification: "unverified",
      capturedAtMs: timestamp,
      ageMs,
      freshness: timestamp === null ? "unknown" : timestamp > nowMs ? "future" : ageMs! <= maxAgeMs ? "fresh_local_capture" : "stale",
      providerTimestampMs: null,
      providerTtlMs: null,
    },
    issues,
  };
}

export function buildDefiReport(input: { search: unknown; detail: unknown; nowMs: number; maxAgeMs: number }): DefiReport {
  try {
    if (!clock(input.nowMs) || !Number.isSafeInteger(input.maxAgeMs) || input.maxAgeMs < 1 || input.maxAgeMs > 3600000) throw new DefiReportError("invalid_clock");
    const search = capture(input.search, "search");
    const detail = capture(input.detail, "detail");
    const list = search.data.list;
    const total = search.data.total;
    if (typeof total !== "number" || !Number.isSafeInteger(total) || total < 0 || !Array.isArray(list) || list.length > 20 || total < list.length) throw new DefiReportError("invalid_search");
    const products = Array.from(list, (item) => record(item, "invalid_search"));
    const rows = products.map((item) => observation(item, "search", search, input.nowMs, input.maxAgeMs));
    const identities = new Set<string>();
    for (const row of rows) {
      const key = JSON.stringify([row.identity.investmentId, row.identity.chainIndex]);
      if (identities.has(key)) throw new DefiReportError("duplicate_identity");
      identities.add(key);
    }
    const detailRow = observation(detail.data, "detail", detail, input.nowMs, input.maxAgeMs);
    const index = rows.findIndex((row) => row.identity.investmentId === detailRow.identity.investmentId && row.identity.chainIndex === detailRow.identity.chainIndex);
    return {
      schema: "okx_defi_report_v1",
      generatedAtMs: input.nowMs,
      maxAgeMs: input.maxAgeMs,
      mode: search.sourceClaim === "synthetic" && detail.sourceClaim === "synthetic" ? "synthetic" : "imported",
      searchCoverage: { claimedTotal: total, observedCount: rows.length, status: "partial_unverified" },
      observations: [...rows, detailRow],
      association: { status: index === -1 ? "unmatched" : "identity_match_unverified", searchIndex: index === -1 ? null : index, detailIndex: rows.length },
      execution: "not_qualified",
      netReturn: null,
      executableExit: null,
      personalEligibility: "unknown",
      totalCosts: null,
    };
  } catch (error) {
    if (error instanceof DefiReportError) throw error;
    throw new DefiReportError("invalid_capture");
  }
}
