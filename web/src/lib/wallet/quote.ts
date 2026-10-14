/**
 * The reader of one quote from the local gateway (T9.5, WAL-5): GET /onchain/quote, read only. The gateway already drops what could be used to sign or
 * send (no quote id, no router, no route list, no calldata), and this reader checks again what comes back: whatever is not exactly the documented shape is
 * an error, never a number on the screen. The request carries the chain, the amount (an integer in the smallest unit) and the two token addresses, with no
 * credentials and the intent of a click. A flag the provider left out stays unknown.
 *
 * It makes one request per call and never signs, sends, prepares a transaction or talks to a wallet.
 */
import { ONCHAIN_API_URL, type OnchainErrorCode, type OnchainMeta, type OnchainTier } from "../onchain/client";

/** `sem_cotacao`: the gateway answered, and the provider has no quote for this size (an empty payload). */
export type QuoteError = OnchainErrorCode | "network" | "backend_stale" | "origin_denied" | "sem_cotacao";

export interface QuoteSide {
  readonly address: string | null;
  readonly symbol: string | null;
  readonly decimals: number | null;
  readonly unitPriceUsd: number | null;
  /** Tax of the token, from 0 to 1 (0.01 is 1%); null when the provider did not say. */
  readonly taxRate: number | null;
  /** Null when the provider did not say: an unknown flag is never "safe". */
  readonly isHoneyPot: boolean | null;
}

export interface Quote {
  readonly chainIndex: string | null;
  readonly mode: string | null;
  /** In the smallest unit of each coin, as numbers (an 18 decimals amount above 2^53 is approximate). */
  readonly fromAmount: number;
  readonly toAmount: number;
  /** (received - paid) / paid, in percent: a loss is negative. */
  readonly priceImpactPct: number | null;
  /** Estimated gas consumption, in the smallest unit of the chain. */
  readonly estimateGasFee: number | null;
  /** Estimated network fee of the route, in USD. */
  readonly tradeFee: number | null;
  readonly fromToken: QuoteSide;
  readonly toToken: QuoteSide;
}

export type QuoteResult =
  | { readonly ok: true; readonly data: Quote; readonly meta: OnchainMeta }
  | { readonly ok: false; readonly error: QuoteError };

export interface QuoteParams {
  readonly chainIndex: string;
  readonly amount: string;
  readonly fromToken: string;
  readonly toToken: string;
}

const ERRORS: ReadonlySet<string> = new Set([
  "no_credentials", "incomplete_credentials", "budget_exhausted", "pace_limited", "rate_limited",
  "provider_unauthorized", "provider_payment_required", "provider_error", "schema", "unsupported_chain", "clock_skew", "bad_request",
]);
const TIERS: ReadonlySet<string> = new Set<OnchainTier>(["free", "basic", "premium"]);

const isRec = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const numOrNull = (v: unknown): number | null | undefined => (v === null ? null : isNum(v) ? v : undefined);
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u001f\u007f]/;
const textOrNull = (v: unknown, max: number): string | null | undefined => (v === null ? null : typeof v === "string" && !CONTROL.test(v) ? v.slice(0, max) : undefined);

function parseSide(v: unknown): QuoteSide | null {
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

export function parseQuote(raw: unknown): Quote | null {
  if (!isRec(raw)) return null;
  const fromToken = parseSide(raw.fromToken);
  const toToken = parseSide(raw.toToken);
  const chainIndex = textOrNull(raw.chainIndex, 20);
  const mode = textOrNull(raw.mode, 16);
  const priceImpactPct = numOrNull(raw.priceImpactPct);
  const estimateGasFee = numOrNull(raw.estimateGasFee);
  const tradeFee = numOrNull(raw.tradeFee);
  if (fromToken === null || toToken === null) return null;
  if (!isNum(raw.fromAmount) || raw.fromAmount < 0 || !isNum(raw.toAmount) || raw.toAmount < 0) return null;
  if (chainIndex === undefined || mode === undefined || priceImpactPct === undefined || estimateGasFee === undefined || tradeFee === undefined) return null;
  return { chainIndex, mode, fromAmount: raw.fromAmount, toAmount: raw.toAmount, priceImpactPct, estimateGasFee, tradeFee, fromToken, toToken };
}

function parseMeta(v: unknown): OnchainMeta | null {
  if (!isRec(v) || typeof v.tier !== "string" || !TIERS.has(v.tier) || !isNum(v.cachedAtMs) || !isNum(v.ageMs) || typeof v.stale !== "boolean") return null;
  const b = v.budget;
  if (!isRec(b) || typeof b.tier !== "string" || !TIERS.has(b.tier) || !isNum(b.used) || !(b.cap === null || isNum(b.cap))) return null;
  return v as unknown as OnchainMeta;
}

/** An EVM address has no case: the same address in another case is the same token. Anything else is compared as it is. */
const sameToken = (echoed: string | null, asked: string): boolean => echoed === null || (/^0x[0-9a-fA-F]+$/.test(asked) ? echoed.toLowerCase() === asked.toLowerCase() : echoed === asked);

/** The quote must be about what was asked: the network, the amount (the numbers are floats, so a relative difference) and both tokens. */
function isAbout(quote: Quote, params: QuoteParams): boolean {
  if (quote.chainIndex !== null && quote.chainIndex !== params.chainIndex) return false;
  const asked = Number(params.amount);
  if (!Number.isFinite(asked) || Math.abs(quote.fromAmount - asked) > asked * 1e-9) return false;
  return sameToken(quote.fromToken.address, params.fromToken) && sameToken(quote.toToken.address, params.toToken);
}

const CHAIN = /^\d{1,12}$/;
const AMOUNT = /^[1-9]\d{0,39}$/;
const TOKEN = /^[A-Za-z0-9]{1,128}$/;

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface QuoteReader {
  read(params: QuoteParams, signal?: AbortSignal): Promise<QuoteResult>;
}

export function createQuoteReader(options: { readonly base?: string; readonly fetch?: FetchLike } = {}): QuoteReader {
  const base = options.base ?? ONCHAIN_API_URL;
  const send: FetchLike = options.fetch ?? ((input, init) => fetch(input, init));
  return {
    async read(params, signal) {
      // what the gateway takes, checked here too: a request that is not that never leaves
      if (!CHAIN.test(params.chainIndex) || !AMOUNT.test(params.amount) || !TOKEN.test(params.fromToken) || !TOKEN.test(params.toToken)) return { ok: false, error: "bad_request" };
      const query = new URLSearchParams({ chainIndex: params.chainIndex, amount: params.amount, fromToken: params.fromToken, toToken: params.toToken });
      let res: Response;
      try {
        res = await send(`${base}/onchain/quote?${query.toString()}`, { method: "GET", credentials: "omit", headers: { "x-inonu-intent": "user" }, ...(signal ? { signal } : {}) });
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
        return typeof code === "string" && ERRORS.has(code) ? { ok: false, error: code as QuoteError } : { ok: false, error: "schema" };
      }
      const meta = parseMeta(body.meta);
      if (meta === null) return { ok: false, error: "schema" };
      // the gateway has nothing for this size: a quote that does not exist, not a broken contract
      if (body.data === null) return { ok: false, error: "sem_cotacao" };
      const data = parseQuote(body.data);
      return data === null || !isAbout(data, params) ? { ok: false, error: "schema" } : { ok: true, data, meta };
    },
  };
}
