/** Pure, injected valuation seam. Local consistency never proves a real RPC or USD observation. */
export interface ValuationIdentity {
  identityKey: string;
  chainIndex: string;
  revision: number;
  correlationId: string;
}
export interface ValuationContext extends ValuationIdentity {
  blockNumber: string;
  blockHash: string;
  observedAtMs: number;
  expiresAtMs: number;
}
export interface ValuationInventoryAsset {
  chainIndex: string;
  tokenContractAddress: string;
  balance: string | null;
  rawBalance: string | null;
  tokenPriceUsd: string | null;
}
/** Additional identity/revision and USD field namespace must be attached by the caller. */
export interface ValuationInventoryEnvelope extends ValuationIdentity {
  status: "ready" | "blocked" | "error";
  source: string;
  mode: string;
  endpoint: string;
  method: string;
  requestedAtMs: number;
  receivedAtMs: number;
  sourceAtMs: number | null;
  expiresAtMs: number;
  httpStatus: number | null;
  unit: string | null;
  error: string | null;
  priceSource: "balance-tokenPrice-usd" | null;
  data: { assets: ValuationInventoryAsset[] } | null;
}
export interface ValuationTokenObservation {
  token: string;
  balanceRaw: string | null;
  decimals: number | null;
  codeHash?: string | null;
}
export interface ValuationObservation {
  /** A read-only adapter's local qualification, never certification of transport reality. */
  status: "qualified" | "blocked" | "error";
  context: ValuationContext;
  tokens: ValuationTokenObservation[];
}
export interface ObservedValuationInput {
  inventoryEnvelope: ValuationInventoryEnvelope;
  observation: ValuationObservation | null;
  expected: ValuationIdentity;
  now: number;
}
export interface DerivedValuationAsset {
  token: string;
  balanceRaw: string | null;
  displayBalance: string | null;
  decimals: number | null;
  priceUsd: string | null;
  valueUsd: string | null;
  reasons: string[];
}
export interface ObservedValuation {
  status: "complete" | "partial" | "unknown";
  mode: "unverified";
  observation: "unverified";
  exercisedReal: false;
  financiallyQualified: false;
  executionEnabled: false;
  context: ValuationContext | null;
  priceSource: "balance-tokenPrice-usd" | null;
  assets: DerivedValuationAsset[];
  coverage: { observedAssets: number; qualifiedAssets: number; unknownAssets: number; scope: "observed-tokens-only" };
  knownValueUsd: string | null;
  completeValueUsd: string | null;
  reasons: string[];
}

const UINT256_LIMIT = 2n ** 256n;
function uint256(value: string | null): value is string {
  return typeof value === "string" && /^(?:0|[1-9]\d{0,77})$/.test(value) && BigInt(value) < UINT256_LIMIT;
}
function validDecimal(value: string): boolean {
  return /^(?:0|[1-9]\d{0,77})(?:\.\d{1,255})?$/.test(value);
}
function decimalParts(value: string): { integer: bigint; scale: number } {
  const [whole = "0", fraction = ""] = value.split(".");
  return { integer: BigInt(whole + fraction), scale: fraction.length };
}
function formatDecimal(integer: bigint, scale: number): string {
  const digits = integer.toString().padStart(scale + 1, "0");
  if (scale === 0) return digits;
  const fraction = digits.slice(-scale).replace(/0+$/, "");
  return digits.slice(0, -scale) + (fraction.length ? `.${fraction}` : "");
}
function time(value: number): boolean { return Number.isSafeInteger(value) && value >= 0; }
function envelopeReasons(envelope: ValuationInventoryEnvelope, now: number): string[] {
  const reasons: string[] = [];
  if (envelope.priceSource !== "balance-tokenPrice-usd") reasons.push("usd-source-unqualified");
  if (!time(now) || envelope.status !== "ready" || envelope.source !== "onchainos-rest-v6" || envelope.mode !== "unverified"
    || envelope.endpoint !== "/api/v6/dex/balance/all-token-balances-by-address" || envelope.method !== "GET"
    || envelope.unit !== "balance-unit-unknown" || envelope.error !== null || envelope.data === null
    || envelope.httpStatus === null || !Number.isInteger(envelope.httpStatus) || envelope.httpStatus < 200 || envelope.httpStatus >= 300
    || ![envelope.requestedAtMs, envelope.receivedAtMs, envelope.expiresAtMs].every(time)
    || envelope.requestedAtMs > envelope.receivedAtMs || envelope.receivedAtMs > now
    || envelope.expiresAtMs <= envelope.receivedAtMs
    || (envelope.sourceAtMs !== null && (!time(envelope.sourceAtMs) || envelope.sourceAtMs > envelope.receivedAtMs))) {
    reasons.push("inventory-envelope-unqualified");
  }
  if (time(envelope.expiresAtMs) && envelope.expiresAtMs <= now) reasons.push("usd-source-expired");
  return reasons;
}
function sameIdentity(value: ValuationIdentity, expected: ValuationIdentity): boolean {
  return value.identityKey === expected.identityKey && value.chainIndex === expected.chainIndex
    && value.revision === expected.revision && value.correlationId === expected.correlationId;
}
function contextReasons(input: ObservedValuationInput): string[] {
  const reasons: string[] = [];
  const expected = input.expected;
  const observation = input.observation;
  if (!time(input.now) || !/^[\da-f]{64}$/i.test(expected.identityKey) || !uint256(expected.chainIndex)
    || expected.chainIndex === "0" || !Number.isSafeInteger(expected.revision) || expected.revision < 0
    || typeof expected.correlationId !== "string" || !expected.correlationId.length) reasons.push("expected-context-unqualified");
  if (!sameIdentity(input.inventoryEnvelope, expected)) reasons.push("inventory-context-divergence");
  if (observation === null) return [...reasons, "observation-missing"];
  const context = observation.context;
  if (!sameIdentity(context, expected)) reasons.push("observation-context-divergence");
  if (observation.status !== "qualified") reasons.push("observation-unqualified");
  if (!uint256(context.blockNumber) || !/^0x[\da-f]{64}$/i.test(context.blockHash)
    || /^0x0{64}$/i.test(context.blockHash)) reasons.push("observation-block-unqualified");
  if (!time(context.observedAtMs) || !time(context.expiresAtMs) || context.observedAtMs > input.now
    || context.expiresAtMs <= context.observedAtMs) reasons.push("observation-time-unqualified");
  if (time(context.expiresAtMs) && context.expiresAtMs <= input.now) reasons.push("observation-expired");
  return reasons;
}

/** USD is derived exclusively from Balance.tokenPrice; raw provider fields remain untouched. */
export function deriveObservedValuation(input: ObservedValuationInput): ObservedValuation {
  let subtotal = 0n;
  let subtotalScale = 0;
  let qualifiedAssets = 0;
  const reasons = [...envelopeReasons(input.inventoryEnvelope, input.now), ...contextReasons(input)];
  const inventory = input.inventoryEnvelope.data?.assets ?? [];
  const assets = inventory.map(asset => {
    const matches = (input.observation?.tokens ?? []).filter(item => item.token.toLowerCase() === asset.tokenContractAddress.toLowerCase());
    const token = matches.length === 1 ? matches[0] : undefined;
    const places = token?.decimals ?? null;
    const validDecimals = places !== null && Number.isInteger(places) && places >= 0 && places <= 255;
    const base = { token: asset.tokenContractAddress, balanceRaw: asset.rawBalance, displayBalance: asset.balance,
      decimals: validDecimals ? places : null, priceUsd: asset.tokenPriceUsd };
    if (reasons.length) return { ...base, valueUsd: null, reasons: [...reasons] };
    if (!/^0x[\da-f]{40}$/i.test(asset.tokenContractAddress)) return { ...base, valueUsd: null, reasons: ["token-address-unqualified"] };
    if (asset.chainIndex !== input.expected.chainIndex) return { ...base, valueUsd: null, reasons: ["asset-chain-divergence"] };
    if (inventory.filter(item => item.tokenContractAddress.toLowerCase() === asset.tokenContractAddress.toLowerCase()).length !== 1) {
      return { ...base, valueUsd: null, reasons: ["inventory-token-ambiguous"] };
    }
    if (matches.length > 1) return { ...base, valueUsd: null, reasons: ["token-observation-ambiguous"] };
    if (token === undefined) return { ...base, valueUsd: null, reasons: ["token-observation-missing"] };
    if (!validDecimals) return { ...base, valueUsd: null, reasons: ["decimals-unqualified"] };
    if (!uint256(asset.rawBalance)) return { ...base, valueUsd: null, reasons: ["provider-raw-unqualified"] };
    if (!uint256(token.balanceRaw)) return { ...base, valueUsd: null, reasons: ["observed-raw-unqualified"] };
    if (asset.rawBalance !== token.balanceRaw) return { ...base, valueUsd: null, reasons: ["raw-balance-divergence"] };
    if (asset.balance !== null) {
      if (!validDecimal(asset.balance)) return { ...base, valueUsd: null, reasons: ["display-balance-unqualified"] };
      const display = decimalParts(asset.balance);
      if (display.integer * 10n ** BigInt(places!) !== BigInt(token.balanceRaw) * 10n ** BigInt(display.scale)) {
        return { ...base, valueUsd: null, reasons: ["display-balance-divergence"] };
      }
    }
    if (asset.tokenPriceUsd === null) return { ...base, valueUsd: null, reasons: ["usd-price-unknown"] };
    if (!validDecimal(asset.tokenPriceUsd)) return { ...base, valueUsd: null, reasons: ["usd-price-unqualified"] };
    const price = decimalParts(asset.tokenPriceUsd!);
    const scale = token.decimals! + price.scale;
    const integer = BigInt(token.balanceRaw!) * price.integer;
    const commonScale = Math.max(subtotalScale, scale);
    subtotal = subtotal * 10n ** BigInt(commonScale - subtotalScale) + integer * 10n ** BigInt(commonScale - scale);
    subtotalScale = commonScale;
    qualifiedAssets++;
    return { ...base, valueUsd: formatDecimal(integer, scale), reasons: [] };
  });
  const value = qualifiedAssets ? formatDecimal(subtotal, subtotalScale) : null;
  const complete = qualifiedAssets > 0 && qualifiedAssets === assets.length;
  return {
    status: complete ? "complete" : qualifiedAssets ? "partial" : "unknown", mode: "unverified", observation: "unverified", exercisedReal: false,
    financiallyQualified: false, executionEnabled: false,
    context: reasons.length || input.observation === null ? null : { ...input.observation.context,
      expiresAtMs: Math.min(input.inventoryEnvelope.expiresAtMs, input.observation.context.expiresAtMs) },
    priceSource: input.inventoryEnvelope.priceSource === "balance-tokenPrice-usd" ? "balance-tokenPrice-usd" : null, assets,
    coverage: { observedAssets: assets.length, qualifiedAssets, unknownAssets: assets.length - qualifiedAssets, scope: "observed-tokens-only" },
    knownValueUsd: value, completeValueUsd: complete ? value : null, reasons,
  };
}
