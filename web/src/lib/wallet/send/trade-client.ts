/**
 * The reader of the two gateway routes that give the person's wallet what it needs to carry out a confirmed order: `GET /onchain/swap` and `GET /onchain/approve` (WAL-10, EXE-3). One request per call, made only
 * after a click, with no credentials and the intent of a person. What comes back is checked again here, field by field: whatever is not exactly the documented shape is an error, never a transaction handed to the
 * rest of the app. The checks that the transaction is the order the person confirmed are in `order.ts`; this file only makes sure that what it hands over has the shape those checks read.
 *
 * It never signs, never sends and never talks to a wallet.
 */
import { ONCHAIN_API_URL, type OnchainMeta } from "../../onchain/client";
import type { QuoteError } from "../quote";
import type { ApproveAnswer, RouteToken, SwapAnswer } from "./order";

export type TradeError = QuoteError | "sem_transacao";

export type SwapResult = { readonly ok: true; readonly data: SwapAnswer; readonly meta: OnchainMeta } | { readonly ok: false; readonly error: TradeError };
export type ApproveResult = { readonly ok: true; readonly data: ApproveAnswer; readonly meta: OnchainMeta } | { readonly ok: false; readonly error: TradeError };

export interface SwapParams {
  readonly chainIndex: string;
  readonly amount: string;
  readonly fromToken: string;
  readonly toToken: string;
  readonly slippagePct: number;
  readonly account: string;
}

export interface ApproveParams {
  readonly chainIndex: string;
  readonly token: string;
  readonly amount: string;
}

const ERRORS: ReadonlySet<string> = new Set([
  "no_credentials", "incomplete_credentials", "budget_exhausted", "pace_limited", "rate_limited",
  "provider_unauthorized", "provider_payment_required", "provider_error", "schema", "unsupported_chain", "clock_skew", "bad_request",
]);
const TIERS: ReadonlySet<string> = new Set(["free", "basic", "premium"]);

const isRec = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const numOrNull = (v: unknown): number | null | undefined => (v === null ? null : isNum(v) ? v : undefined);
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u001f\u007f]/;
const textOrNull = (v: unknown, max: number): string | null | undefined => (v === null ? null : typeof v === "string" && !CONTROL.test(v) ? v.slice(0, max) : undefined);
const DIGITS = /^\d{1,78}$/;
const HEX = /^0x(?:[0-9a-fA-F]{2})+$/;
const EVM_ADDRESS = /^0x[0-9a-fA-F]{40}$/;

function parseRouteToken(v: unknown): RouteToken | null {
  if (!isRec(v)) return null;
  const address = textOrNull(v.address, 128);
  const symbol = textOrNull(v.symbol, 20);
  const unitPriceUsd = numOrNull(v.unitPriceUsd);
  const taxRate = numOrNull(v.taxRate);
  const decimals = v.decimals === null ? null : isNum(v.decimals) && Number.isInteger(v.decimals) && v.decimals >= 0 && v.decimals <= 36 ? v.decimals : undefined;
  const honey = v.isHoneyPot === null || typeof v.isHoneyPot === "boolean" ? v.isHoneyPot : undefined;
  if (address === undefined || symbol === undefined || unitPriceUsd === undefined || taxRate === undefined || decimals === undefined || honey === undefined) return null;
  return { address, symbol, decimals, unitPriceUsd, taxRate, isHoneyPot: honey };
}

export function parseSwapAnswer(raw: unknown): SwapAnswer | null {
  if (!isRec(raw) || !isRec(raw.tx) || !isRec(raw.route)) return null;
  const chainIndex = textOrNull(raw.chainIndex, 20);
  if (chainIndex === undefined || (raw.family !== "evm" && raw.family !== "solana")) return null;
  const t = raw.tx;
  const from = textOrNull(t.from, 128);
  const to = textOrNull(t.to, 128);
  const gas = textOrNull(t.gas, 40);
  const gasPrice = textOrNull(t.gasPrice, 40);
  const tip = textOrNull(t.maxPriorityFeePerGas, 40);
  const min = textOrNull(t.minReceiveAmount, 80);
  const slippage = numOrNull(t.slippagePercent);
  if (from === undefined || to === undefined || gas === undefined || gasPrice === undefined || tip === undefined || min === undefined || slippage === undefined) return null;
  if (typeof t.data !== "string" || t.data.length === 0 || t.data.length > 20_000 || typeof t.value !== "string" || !DIGITS.test(t.value)) return null;
  if (raw.family === "evm" && (!HEX.test(t.data) || to === null || !EVM_ADDRESS.test(to))) return null;
  for (const amount of [gas, gasPrice, tip, min]) if (amount !== null && !DIGITS.test(amount)) return null;
  const r = raw.route;
  const fromToken = parseRouteToken(r.fromToken);
  const toToken = parseRouteToken(r.toToken);
  const priceImpactPct = numOrNull(r.priceImpactPct);
  const tradeFee = numOrNull(r.tradeFee);
  const estimateGasFee = numOrNull(r.estimateGasFee);
  if (fromToken === null || toToken === null || priceImpactPct === undefined || tradeFee === undefined || estimateGasFee === undefined) return null;
  if (typeof r.fromAmount !== "string" || !DIGITS.test(r.fromAmount) || typeof r.toAmount !== "string" || !DIGITS.test(r.toAmount)) return null;
  if (!Array.isArray(r.dexNames) || r.dexNames.length > 6 || !r.dexNames.every((n) => typeof n === "string" && n.length <= 24 && !CONTROL.test(n))) return null;
  return {
    chainIndex,
    family: raw.family,
    tx: { from, to, data: t.data, value: t.value, gas, gasPrice, maxPriorityFeePerGas: tip, minReceiveAmount: min, slippagePercent: slippage },
    route: { fromAmount: r.fromAmount, toAmount: r.toAmount, priceImpactPct, tradeFee, estimateGasFee, dexNames: r.dexNames as string[], fromToken, toToken },
  };
}

export function parseApproveAnswer(raw: unknown): ApproveAnswer | null {
  if (!isRec(raw) || typeof raw.data !== "string" || !HEX.test(raw.data) || raw.data.length > 20_000) return null;
  if (typeof raw.spender !== "string" || !EVM_ADDRESS.test(raw.spender)) return null;
  const gasLimit = textOrNull(raw.gasLimit, 40);
  const gasPrice = textOrNull(raw.gasPrice, 40);
  if (gasLimit === undefined || gasPrice === undefined) return null;
  for (const amount of [gasLimit, gasPrice]) if (amount !== null && !DIGITS.test(amount)) return null;
  return { data: raw.data, spender: raw.spender, gasLimit, gasPrice };
}

function parseMeta(v: unknown): OnchainMeta | null {
  if (!isRec(v) || typeof v.tier !== "string" || !TIERS.has(v.tier) || !isNum(v.cachedAtMs) || !isNum(v.ageMs) || typeof v.stale !== "boolean") return null;
  const b = v.budget;
  if (!isRec(b) || typeof b.tier !== "string" || !TIERS.has(b.tier) || !isNum(b.used) || !(b.cap === null || isNum(b.cap))) return null;
  return v as unknown as OnchainMeta;
}

const CHAIN = /^\d{1,12}$/;
const AMOUNT = /^[1-9]\d{0,77}$/;
const TOKEN = /^[A-Za-z0-9]{1,128}$/;
const EVM_ACCOUNT = /^0x[0-9a-fA-F]{40}$/;

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface TradeClient {
  swap(params: SwapParams, signal?: AbortSignal): Promise<SwapResult>;
  approve(params: ApproveParams, signal?: AbortSignal): Promise<ApproveResult>;
}

async function call(send: FetchLike, url: string, signal: AbortSignal | undefined): Promise<{ ok: true; data: unknown; meta: OnchainMeta } | { ok: false; error: TradeError }> {
  let res: Response;
  try {
    res = await send(url, { method: "GET", credentials: "omit", headers: { "x-inonu-intent": "user" }, ...(signal ? { signal } : {}) });
  } catch {
    return { ok: false, error: "network" };
  }
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    // a page that is not json still has a status
  }
  const envelope = isRec(body) && typeof body.ok === "boolean";
  if (!res.ok) {
    const code = isRec(body) ? String(body.error ?? body.code ?? "") : "";
    if (res.status === 404 && (!envelope || code === "not_found")) return { ok: false, error: "backend_stale" };
    if (res.status === 403 && (!envelope || code === "forbidden")) return { ok: false, error: "origin_denied" };
  }
  if (!isRec(body) || typeof body.ok !== "boolean") return { ok: false, error: "schema" };
  // a good looking body under an error status is not an answer
  if (body.ok === true && !res.ok) return { ok: false, error: "schema" };
  if (body.ok === false) {
    const code = body.error ?? body.code;
    return typeof code === "string" && ERRORS.has(code) ? { ok: false, error: code as TradeError } : { ok: false, error: "schema" };
  }
  const meta = parseMeta(body.meta);
  if (meta === null) return { ok: false, error: "schema" };
  // calldata is good for seconds: a copy that is older than that, or one the gateway says is stale, is not a transaction to carry out
  if (meta.stale || meta.ageMs > 10_000) return { ok: false, error: "provider_error" };
  // the provider has no transaction for this order: not a broken contract
  if (body.data === null) return { ok: false, error: "sem_transacao" };
  return { ok: true, data: body.data, meta };
}

export function createTradeClient(options: { readonly base?: string; readonly fetch?: FetchLike } = {}): TradeClient {
  const base = options.base ?? ONCHAIN_API_URL;
  const send: FetchLike = options.fetch ?? ((input, init) => fetch(input, init));
  return {
    async swap(params, signal) {
      if (!CHAIN.test(params.chainIndex) || !AMOUNT.test(params.amount) || !TOKEN.test(params.fromToken) || !TOKEN.test(params.toToken) || !EVM_ACCOUNT.test(params.account)) return { ok: false, error: "bad_request" };
      if (!Number.isFinite(params.slippagePct) || params.slippagePct <= 0 || params.slippagePct > 5) return { ok: false, error: "bad_request" };
      const query = new URLSearchParams({
        chainIndex: params.chainIndex, amount: params.amount, fromToken: params.fromToken, toToken: params.toToken, slippagePercent: String(params.slippagePct), userWalletAddress: params.account,
      });
      const got = await call(send, `${base}/onchain/swap?${query.toString()}`, signal);
      if (!got.ok) return got;
      const data = parseSwapAnswer(got.data);
      return data === null ? { ok: false, error: "schema" } : { ok: true, data, meta: got.meta };
    },
    async approve(params, signal) {
      if (!CHAIN.test(params.chainIndex) || !AMOUNT.test(params.amount) || !TOKEN.test(params.token)) return { ok: false, error: "bad_request" };
      const query = new URLSearchParams({ chainIndex: params.chainIndex, token: params.token, amount: params.amount });
      const got = await call(send, `${base}/onchain/approve?${query.toString()}`, signal);
      if (!got.ok) return got;
      const data = parseApproveAnswer(got.data);
      return data === null ? { ok: false, error: "schema" } : { ok: true, data, meta: got.meta };
    },
  };
}
