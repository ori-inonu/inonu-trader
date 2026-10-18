import { createHash } from "node:crypto";
import { quoteFactsOf, type QuoteFacts } from "../agent/quote-facts";
import { chainByIndex, isAddressForChain } from "../okx-wallet/chains";

/** Request context supplied by the read-only quote adapter, never reconstructed from a symbol. No signing, wallet address, amount selection or provider call occurs here. */
export interface EntryQuoteRequest {
  readonly cycleId: string;
  readonly candidateId: string;
  readonly requestId: string;
  readonly chainIndex: string;
  readonly fromAddress: string;
  readonly toAddress: string;
  readonly fromAmountMinor: string;
  readonly fromDecimals: number;
  /** Null when the expected destination decimals were not independently read. The quote must still supply its own decimals. */
  readonly toDecimals: number | null;
  readonly startedAtMs: number;
  readonly receivedAtMs: number;
}

export interface BoundEntryQuote {
  readonly version: 1;
  readonly source: "okx_cli_v4_6_4_quote_v6";
  readonly cycleId: string;
  readonly candidateId: string;
  readonly requestId: string;
  readonly chainIndex: string;
  readonly fromAssetKey: string;
  readonly toAssetKey: string;
  readonly fromAmountMinor: string;
  /** Provider output text. Neither an integer-looking string nor token decimals independently qualify its unit. */
  readonly toAmountRaw: string;
  readonly outputUnit: "unverified";
  readonly fromDecimals: number;
  readonly toDecimals: number;
  readonly startedAtMs: number;
  readonly receivedAtMs: number;
  readonly reviewedAtMs: number;
  readonly expiresAtMs: number;
  /** Conservative age since the local request began, including transport time. The provider's creation time is not known. */
  readonly ageMs: number;
  readonly timeBasis: "request_started_local_clock";
  readonly disposition: "ok" | "provider_warn" | "provider_block";
  readonly facts: Omit<QuoteFacts, "toAmountMinor"> & { readonly toAmountRaw: string | null; readonly outputUnit: "unverified" };
  readonly honeypot: { readonly from: boolean | null; readonly to: boolean | null };
  /** A quote is neither a broadcast nor a receipt, even when every identity matches. */
  readonly execution: "not_inferred";
  /** Consistency fingerprint of these allowlisted facts and context. It does not authenticate the provider or a receipt. */
  readonly fingerprint: string;
}

export type EntryQuoteFailure = "request_invalid" | "request_identity_invalid" | "quote_shape_invalid" | "quote_clock_invalid" | "quote_stale" | "quote_identity_mismatch" | "quote_amount_mismatch" | "quote_decimals_mismatch" | "quote_action_unknown";
export type EntryQuoteBinding = { readonly ok: true; readonly value: BoundEntryQuote } | { readonly ok: false; readonly reason: EntryQuoteFailure };

const record = (v: unknown): Record<string, unknown> | null => v !== null && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : null;
const code = (v: unknown): v is string => typeof v === "string" && /^[A-Za-z0-9_:./@-]{1,160}$/.test(v);
const time = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v) && v >= 0;
const decimals = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" && /^\d{1,2}$/.test(v) ? Number(v) : Number.NaN;
  return Number.isSafeInteger(n) && n >= 0 && n <= 38 ? n : null;
};
const minor = (v: unknown): string | null => {
  if (typeof v !== "string" || !/^\d{1,40}$/.test(v) || BigInt(v) <= 0n) return null;
  return BigInt(v).toString();
};
const canonical = (chain: string, address: unknown): string | null => !isAddressForChain(chain, address) ? null : chainByIndex(chain)?.kind === "evm" ? address.toLowerCase() : address;
const boolean = (v: unknown): boolean | null => typeof v === "boolean" ? v : null;

/**
 * Binds one Quote v6 record, as returned by CLI v4.6.4, to the exact request that read it. Pure and offline. API fee/tax units are normalized by quoteFactsOf.
 * This validates consistency only: it cannot prove that a caller actually made a network request. The executing adapter must quote and validate again when it acts.
 * Missing cost or safety fields stay unknown. Warnings and blocks are recorded, never promoted to an all-clear or a model decision.
 */
export function bindEntryQuote(request: EntryQuoteRequest, raw: unknown, nowMs: number, maxAgeMs: number): EntryQuoteBinding {
  if (record(request) === null || !code(request.cycleId) || !code(request.candidateId) || !code(request.requestId) || !time(nowMs) || !Number.isSafeInteger(maxAgeMs) || maxAgeMs <= 0 || typeof request.fromDecimals !== "number" || decimals(request.fromDecimals) === null || !(request.toDecimals === null || typeof request.toDecimals === "number" && decimals(request.toDecimals) !== null)) return { ok: false, reason: "request_invalid" };
  if (!time(request.startedAtMs) || !time(request.receivedAtMs) || request.startedAtMs > request.receivedAtMs || request.receivedAtMs > nowMs || !Number.isSafeInteger(request.startedAtMs + maxAgeMs)) return { ok: false, reason: "quote_clock_invalid" };
  const from = canonical(request.chainIndex, request.fromAddress), to = canonical(request.chainIndex, request.toAddress);
  const prefix = `buy:token:${request.chainIndex}:`;
  const candidate = request.candidateId.startsWith(prefix) ? canonical(request.chainIndex, request.candidateId.slice(prefix.length)) : null;
  const fromAmount = minor(request.fromAmountMinor);
  if (from === null || to === null || from === to || candidate !== to || fromAmount === null) return { ok: false, reason: "request_identity_invalid" };
  const ageMs = nowMs - request.startedAtMs;
  if (ageMs > maxAgeMs) return { ok: false, reason: "quote_stale" };
  const q = record(Array.isArray(raw) && raw.length === 1 ? raw[0] : raw);
  const fromToken = record(q?.fromToken), toToken = record(q?.toToken);
  if (q === null || fromToken === null || toToken === null) return { ok: false, reason: "quote_shape_invalid" };
  if (q.chainIndex !== request.chainIndex || q.swapMode !== "exactIn" || canonical(request.chainIndex, fromToken.tokenContractAddress) !== from || canonical(request.chainIndex, toToken.tokenContractAddress) !== to) return { ok: false, reason: "quote_identity_mismatch" };
  const quotedFrom = minor(q.fromTokenAmount), quotedTo = minor(q.toTokenAmount);
  if (quotedFrom !== fromAmount || quotedTo === null) return { ok: false, reason: "quote_amount_mismatch" };
  const fromDecimals = decimals(fromToken.decimal), toDecimals = decimals(toToken.decimal);
  if (fromDecimals !== request.fromDecimals || toDecimals === null || request.toDecimals !== null && toDecimals !== request.toDecimals) return { ok: false, reason: "quote_decimals_mismatch" };
  if (q.action !== "ok" && q.action !== "warn" && q.action !== "block") return { ok: false, reason: "quote_action_unknown" };
  // QuoteFacts v17 names this raw output toAmountMinor. Do not promote that label to a verified unit in the new context.
  const { toAmountMinor: outputText, ...facts } = quoteFactsOf(q, request.receivedAtMs);
  const body: Omit<BoundEntryQuote, "fingerprint"> = {
    version: 1, source: "okx_cli_v4_6_4_quote_v6", cycleId: request.cycleId, candidateId: request.candidateId, requestId: request.requestId, chainIndex: request.chainIndex,
    fromAssetKey: `token:${request.chainIndex}:${from}`, toAssetKey: `token:${request.chainIndex}:${to}`, fromAmountMinor: fromAmount, toAmountRaw: q.toTokenAmount as string, outputUnit: "unverified", fromDecimals, toDecimals,
    startedAtMs: request.startedAtMs, receivedAtMs: request.receivedAtMs, reviewedAtMs: nowMs, expiresAtMs: request.startedAtMs + maxAgeMs, ageMs, timeBasis: "request_started_local_clock",
    disposition: q.action === "ok" ? "ok" : q.action === "warn" ? "provider_warn" : "provider_block", facts: { ...facts, toAmountRaw: outputText, outputUnit: "unverified" },
    honeypot: { from: boolean(fromToken.isHoneyPot), to: boolean(toToken.isHoneyPot) }, execution: "not_inferred",
  };
  return { ok: true, value: { ...body, fingerprint: createHash("sha256").update(JSON.stringify(body)).digest("hex") } };
}
