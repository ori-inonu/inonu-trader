import { createHash } from "node:crypto";
import { chainByIndex, isAddressForChain, validateChainList } from "./chains";

export type JsonValue = null | boolean | number | string | JsonValue[] | JsonObject;
export interface JsonObject { [key: string]: JsonValue }
type ErrorCode = "invalid_clock" | "invalid_capture" | "input_limit" | "invalid_envelope";

export class WalletValuationDiagnosticsError extends Error {
  constructor(public readonly code: ErrorCode) { super(code); this.name = "WalletValuationDiagnosticsError"; }
}

function fail(code: ErrorCode): never { throw new WalletValuationDiagnosticsError(code); }
const MAX_CLOCK = 8_640_000_000_000_000;
const MAX_CAPTURE_BYTES = 1_048_576;
const FIELDS = ["chainIndex", "tokenContractAddress", "address", "symbol", "balance", "rawBalance", "tokenPrice", "isRiskToken"] as const;
type FieldName = typeof FIELDS[number];
export interface FieldDescriptor {
  presence: "absent" | "empty" | "present";
  jsonType: "absent" | "string" | "number" | "boolean" | "null" | "array" | "object";
  rawValue: JsonValue;
  issues: ("missing_field" | "invalid_type")[];
  syntax?: "empty" | "decimal_text" | "invalid_text" | null;
  decimalText?: string | null;
  unit?: "unknown";
  scale?: "unknown";
  documentedUnit?: "USD";
}
export interface WalletDiagnosticRow {
  locator: string;
  fields: Record<FieldName, FieldDescriptor>;
  riskClaim: boolean | null;
  selectionMembership: "selected" | "outside_selection" | "unknown";
  accountAssociation: "format_match_unverified" | "mismatch" | "unknown";
  candidateIdentity: CandidateIdentity | null;
  candidateDuplicate: boolean;
  rowValueUsd: null;
}
export interface CandidateIdentity {
  key: string;
  chainIndex: string;
  address: string;
  asset: { kind: "native_marker" } | { kind: "contract"; address: string };
}
export interface WalletValuationDiagnostics {
  schema: "okx_wallet_valuation_diagnostics_v1";
  method: "GET";
  path: "/api/v6/dex/balance/all-token-balances-by-address";
  capture: JsonObject;
  selection: JsonObject & { address: string; chains: string[]; excludeRiskToken: "0" | "1" | null };
  sourceClaim: "synthetic" | "okx_api_claimed";
  verification: "unverified";
  representedCaptureSha256: string;
  generatedAtMs: number;
  capturedAtMs: number | null;
  maxAgeMs: number;
  localAgeMs: number | null;
  localFreshness: "unknown" | "future" | "fresh_local_capture" | "stale";
  providerPriceAsOfMs: null;
  providerPriceFreshness: "unknown";
  rows: WalletDiagnosticRow[];
  coverage: "partial_unverified";
  requestedChains: { chainIndex: string; observedRowCount: number; accountMatchRowCount: number; presence: "observed" | "not_reported" }[];
  outsideSelectionLocators: string[];
  unknownChainLocators: string[];
  duplicateCandidates: { key: string; locators: string[] }[];
  economicDeduplication: "not_performed";
  filterClaim: "filtered_claimed" | "unfiltered_claimed" | "default_filtered_claimed";
  actualRiskFilter: "unknown";
  execution: "not_qualified";
  eligibility: "unknown";
  completePortfolioValueUsd: null;
  netReturnUsd: null;
  realizedNetUsd: null;
  totalCostsUsd: null;
  executableExitLiquidityUsd: null;
  reinvestableUsd: null;
}

function clock(value: unknown, max: number): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 1 && value <= max;
}
function object(value: JsonValue | undefined): value is JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** Inspect data descriptors before copying; never run a capture getter or toJSON. */
function representCapture(value: unknown): { represented: string; capture: JsonValue } {
  let bytes = 0;
  const ancestors = new Set<object>();
  const consume = (count: number) => { bytes += count; if (bytes > MAX_CAPTURE_BYTES) fail("input_limit"); };
  const copy = (current: unknown, depth: number): JsonValue => {
    if (depth > 32) fail("input_limit");
    if (current === null || typeof current === "boolean" || typeof current === "string" || typeof current === "number") {
      if (typeof current === "number" && !Number.isFinite(current)) fail("invalid_capture");
      consume(Buffer.byteLength(JSON.stringify(current), "utf8"));
      return current;
    }
    if (typeof current !== "object" || ancestors.has(current)) return fail("invalid_capture");
    const array = Array.isArray(current), prototype = Object.getPrototypeOf(current);
    if (array ? prototype !== Array.prototype : prototype !== Object.prototype && prototype !== null) fail("invalid_capture");
    const descriptors = Object.getOwnPropertyDescriptors(current);
    const keys = Reflect.ownKeys(descriptors);
    if (keys.some(key => typeof key !== "string")) fail("invalid_capture");
    ancestors.add(current);
    try {
      if (array) {
        const length = descriptors.length!.value as number;
        if (keys.length !== length + 1 || keys.some(key => key !== "length" &&
          (typeof key !== "string" || !/^(0|[1-9][0-9]*)$/.test(key) || Number(key) >= length))) fail("invalid_capture");
        consume(2 + Math.max(0, length - 1));
        const result: JsonValue[] = [];
        for (let index = 0; index < length; index++) {
          const descriptor = descriptors[String(index)];
          if (!descriptor?.enumerable || !Object.hasOwn(descriptor, "value")) fail("invalid_capture");
          result.push(copy(descriptor.value, depth + 1));
        }
        return result;
      }
      consume(2 + Math.max(0, keys.length - 1));
      const result: JsonObject = Object.create(null);
      for (const key of keys as string[]) {
        const descriptor = descriptors[key]!;
        if (!descriptor.enumerable || !Object.hasOwn(descriptor, "value")) fail("invalid_capture");
        consume(Buffer.byteLength(JSON.stringify(key), "utf8") + 1);
        result[key] = copy(descriptor.value, depth + 1);
      }
      return result;
    } finally { ancestors.delete(current); }
  };
  try {
    const represented = JSON.stringify(copy(value, 0));
    return { represented, capture: JSON.parse(represented) as JsonValue };
  } catch (error) {
    if (error instanceof WalletValuationDiagnosticsError) throw error;
    return fail("invalid_capture");
  }
}
function describe(row: JsonObject, name: FieldName): FieldDescriptor {
  const present = Object.hasOwn(row, name), value = present ? row[name]! : null;
  const jsonType = !present ? "absent" : value === null ? "null" : Array.isArray(value) ? "array" : typeof value as "string" | "number" | "boolean" | "object";
  const expectedType = name === "isRiskToken" ? "boolean" : "string";
  const result: FieldDescriptor = {
    presence: !present ? "absent" : value === "" ? "empty" : "present", jsonType, rawValue: value,
    issues: !present ? ["missing_field"] : jsonType !== expectedType ? ["invalid_type"] : []
  };
  if (name === "balance" || name === "rawBalance" || name === "tokenPrice") {
    result.syntax = typeof value !== "string" ? null : value === "" ? "empty" : /^[0-9]+(?:\.[0-9]+)?$/.test(value) ? "decimal_text" : "invalid_text";
    result.decimalText = result.syntax === "decimal_text" ? value as string : null;
    if (name === "tokenPrice") result.documentedUnit = "USD";
    else { result.unit = "unknown"; result.scale = "unknown"; }
  }
  return result;
}

function accountAssociation(chainIndex: string, requested: string, returned: JsonValue | undefined): WalletDiagnosticRow["accountAssociation"] {
  if (!isAddressForChain(chainIndex, requested) || !isAddressForChain(chainIndex, returned)) return "unknown";
  const evm = chainByIndex(chainIndex)!.kind === "evm";
  return (evm ? requested.toLowerCase() === returned.toLowerCase() : requested === returned) ? "format_match_unverified" : "mismatch";
}

function candidateIdentity(chainIndex: string | null, row: JsonObject): CandidateIdentity | null {
  if (chainIndex === null || !isAddressForChain(chainIndex, row.address) || typeof row.tokenContractAddress !== "string" ||
    (row.tokenContractAddress !== "" && !isAddressForChain(chainIndex, row.tokenContractAddress))) return null;
  const normalize = (value: string) => chainByIndex(chainIndex)!.kind === "evm" ? value.toLowerCase() : value;
  const address = normalize(row.address);
  const asset: CandidateIdentity["asset"] = row.tokenContractAddress === "" ? { kind: "native_marker" } :
    { kind: "contract", address: normalize(row.tokenContractAddress) };
  const key = JSON.stringify([chainIndex, address, asset.kind === "native_marker" ? ["native_marker"] : ["contract", asset.address]]);
  return { key, chainIndex, address, asset };
}

/** Diagnoses a declared local balance capture; never computes or qualifies money. */
export function buildWalletValuationDiagnostics(input: { capture: unknown; nowMs: number; maxAgeMs: number }): WalletValuationDiagnostics {
  if (!clock(input.nowMs, MAX_CLOCK) || !clock(input.maxAgeMs, 3_600_000)) fail("invalid_clock");
  const { represented, capture } = representCapture(input.capture);
  if (!object(capture) || capture.schema !== "okx_wallet_balance_capture_v1" || capture.endpoint !== "all_token_balances" ||
    !["synthetic", "okx_api_claimed"].includes(capture.sourceClaim as string) ||
    !(capture.capturedAtMs === null || clock(capture.capturedAtMs, MAX_CLOCK)) || !object(capture.request)) fail("invalid_capture");
  const request = capture.request;
  let chains: string[];
  try { chains = validateChainList(request.chains); } catch { return fail("invalid_capture"); }
  if (typeof request.address !== "string" || !chains.some(chain => isAddressForChain(chain, request.address)) ||
    !Object.hasOwn(request, "excludeRiskToken") || !["0", "1", null].includes(request.excludeRiskToken as "0" | "1" | null)) fail("invalid_capture");
  const response = capture.response;
  if (!object(response) || !(response.code === 0 || response.code === "0") || !Array.isArray(response.data)) fail("invalid_envelope");
  if (response.data.length > 256) fail("input_limit");
  const rows: WalletDiagnosticRow[] = [];
  for (const [groupIndex, group] of response.data.entries()) {
    if (!object(group) || !Array.isArray(group.tokenAssets)) fail("invalid_envelope");
    if (rows.length + group.tokenAssets.length > 4096) fail("input_limit");
    for (const [rowIndex, row] of group.tokenAssets.entries()) {
      if (!object(row)) fail("invalid_envelope");
      const knownChain = typeof row.chainIndex === "string" && chainByIndex(row.chainIndex) ? row.chainIndex : null;
      rows.push({ locator: `/response/data/${groupIndex}/tokenAssets/${rowIndex}`,
        fields: Object.fromEntries(FIELDS.map(name => [name, describe(row, name)])) as Record<FieldName, FieldDescriptor>,
        selectionMembership: knownChain === null ? "unknown" : chains.includes(knownChain) ? "selected" : "outside_selection",
        accountAssociation: knownChain === null ? "unknown" : accountAssociation(knownChain, request.address, row.address),
        candidateIdentity: candidateIdentity(knownChain, row), candidateDuplicate: false,
        riskClaim: typeof row.isRiskToken === "boolean" ? row.isRiskToken : null, rowValueUsd: null });
    }
  }
  const candidates = new Map<string, string[]>();
  for (const row of rows) if (row.candidateIdentity) {
    const key = row.candidateIdentity.key;
    const locators = candidates.get(key) ?? [];
    locators.push(row.locator);
    candidates.set(key, locators);
  }
  const duplicateCandidates = [...candidates].filter(([, locators]) => locators.length > 1).map(([key, locators]) => ({ key, locators }));
  for (const row of rows) if (row.candidateIdentity) {
    const locators = candidates.get(row.candidateIdentity.key)!;
    if (locators.length > 1) row.candidateDuplicate = true;
  }
  const capturedAtMs = capture.capturedAtMs as number | null;
  const localAgeMs = capturedAtMs === null || capturedAtMs > input.nowMs ? null : input.nowMs - capturedAtMs;
  const localFreshness = capturedAtMs === null ? "unknown" : capturedAtMs > input.nowMs ? "future" : localAgeMs! <= input.maxAgeMs ? "fresh_local_capture" : "stale";
  return { schema: "okx_wallet_valuation_diagnostics_v1", method: "GET", path: "/api/v6/dex/balance/all-token-balances-by-address",
    capture, selection: capture.request as WalletValuationDiagnostics["selection"], sourceClaim: capture.sourceClaim as WalletValuationDiagnostics["sourceClaim"],
    verification: "unverified", representedCaptureSha256: createHash("sha256").update(represented, "utf8").digest("hex"),
    generatedAtMs: input.nowMs, capturedAtMs, maxAgeMs: input.maxAgeMs, localAgeMs, localFreshness,
    providerPriceAsOfMs: null, providerPriceFreshness: "unknown",
    rows, coverage: "partial_unverified", requestedChains: chains.map(chainIndex => {
      const observed = rows.filter(row => row.fields.chainIndex.rawValue === chainIndex);
      return { chainIndex, observedRowCount: observed.length,
        accountMatchRowCount: observed.filter(row => row.accountAssociation === "format_match_unverified").length,
        presence: observed.length ? "observed" : "not_reported" };
    }), outsideSelectionLocators: rows.filter(row => row.selectionMembership === "outside_selection").map(row => row.locator),
    unknownChainLocators: rows.filter(row => row.selectionMembership === "unknown").map(row => row.locator),
    duplicateCandidates, economicDeduplication: "not_performed",
    filterClaim: request.excludeRiskToken === "0" ? "filtered_claimed" : request.excludeRiskToken === "1" ? "unfiltered_claimed" : "default_filtered_claimed",
    actualRiskFilter: "unknown", execution: "not_qualified", eligibility: "unknown", completePortfolioValueUsd: null,
    netReturnUsd: null, realizedNetUsd: null, totalCostsUsd: null, executableExitLiquidityUsd: null, reinvestableUsd: null };
}
