/**
 * The two routes that hand the browser what the person's own wallet needs to carry out an order they confirmed (inonu-desktop-v1 WAL-10): the swap of the aggregator (the transaction to be signed, with the
 * minimum received and the slippage) and the approval of a token for the router. They are the ONLY routes of the gateway that return something a wallet can sign, and that is why they live in a file of their
 * own, which the scans of the repository name as the single place of the core where it is allowed.
 *
 * What does not happen here: nothing is signed, nothing is broadcast and no key exists. The server asks the provider for the transaction and passes it on; the browser checks it against what the person
 * confirmed (`web/src/lib/wallet/send`), and only the wallet extension, after a click, signs and sends. Nothing of an order is cached: calldata is valid for seconds, so the time to live is zero and a stale copy
 * can never be served when the provider fails.
 *
 * Like the other route files this one imports only TYPES from the catalog (no import cycle). Provider numbers arrive as strings and stay strings when they are amounts (a JavaScript number cannot hold an 18
 * decimal amount); a field that is required and does not convert makes the whole answer invalid, never a zero.
 */
import type { Endpoint, Normalized, Params, Validation } from "../catalog";

type Rec = Record<string, unknown>;

const BAD: Validation = { ok: false, error: "bad_request" };
const DIGITS = /^\d{1,12}$/;
const AMOUNT = /^[1-9]\d{0,77}$/;
const QUANTITY = /^\d{1,78}$/;
const EVM_ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const SOLANA_ADDRESS = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const HEX = /^0x(?:[0-9a-fA-F]{2})*$/;
const SOLANA_PAYLOAD = /^[A-Za-z0-9+/=]{1,16384}$/;
const SLIPPAGE = /^(?:[0-4](?:\.\d{1,2})?|5(?:\.0{1,2})?)$/;
const SOLANA_CHAIN = "501";
/** A transaction is a few hundred bytes of calldata; this is far above any swap and far below anything that could be abused. */
const MAX_CALLDATA_CHARS = 20_000;
const STRIPPED = /[\u0000-\u001f\u007f\u2028\u2029\u202A-\u202E\u2066-\u2069]/g;

function rec(v: unknown): Rec | null {
  return typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Rec) : null;
}

function arr(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

function text(v: unknown): string | null {
  return typeof v === "string" && v !== "" ? v : null;
}

function num(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v !== "string" || v.trim() === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function cleanText(v: unknown, max: number): string | null {
  const t = text(v);
  return t === null ? null : t.replace(STRIPPED, "").slice(0, max) || null;
}

/** An amount as the provider writes it, kept as a string; null when it is not whole digits. */
function quantity(v: unknown): string | null {
  const t = typeof v === "number" && Number.isSafeInteger(v) && v >= 0 ? String(v) : text(v);
  return t !== null && QUANTITY.test(t) ? t : null;
}

function get(path: string, query: Record<string, string>): { readonly method: "GET"; readonly path: string } {
  const search = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) search.set(k, v);
  const qs = search.toString();
  return { method: "GET", path: qs ? `${path}?${qs}` : path };
}

function allowed(params: Params, keys: readonly string[]): boolean {
  return Object.keys(params).every((k) => keys.includes(k));
}

/** A token of the network as the provider names it: a 0x contract (lower case) on the EVM networks, a mint (case kept) on Solana. Null when it is neither. */
function tokenOf(chainIndex: string, raw: string | undefined): string | null {
  if (raw === undefined) return null;
  if (chainIndex === SOLANA_CHAIN) return SOLANA_ADDRESS.test(raw) ? raw : null;
  return EVM_ADDRESS.test(raw) ? raw.toLowerCase() : null;
}

function walletOf(chainIndex: string, raw: string | undefined): string | null {
  if (raw === undefined) return null;
  if (chainIndex === SOLANA_CHAIN) return SOLANA_ADDRESS.test(raw) ? raw : null;
  return EVM_ADDRESS.test(raw) ? raw : null;
}

function side(v: unknown) {
  const t = rec(v);
  if (t === null) return null;
  const decimals = num(t.decimal);
  return {
    address: text(t.tokenContractAddress),
    symbol: cleanText(t.tokenSymbol, 20),
    decimals: decimals !== null && Number.isInteger(decimals) && decimals >= 0 && decimals <= 36 ? decimals : null,
    unitPriceUsd: num(t.tokenUnitPrice),
    taxRate: num(t.taxRate),
    // an unknown flag stays unknown: a missing honeypot answer is never "safe"
    isHoneyPot: typeof t.isHoneyPot === "boolean" ? t.isHoneyPot : null,
  };
}

const validSide = (s: ReturnType<typeof side>) => s !== null && s.address !== null;

/** The names of the venues in the route, plain text, a few of them: enough to show the person where the order goes. */
function dexNames(list: unknown): string[] {
  const names: string[] = [];
  for (const hop of arr(list)) {
    const r = rec(hop);
    const dex = r === null ? null : cleanText(rec(r.dexProtocol)?.dexName ?? r.dexName, 24);
    if (dex !== null && !names.includes(dex)) names.push(dex);
    if (names.length >= 6) break;
  }
  return names;
}

function normalizeSwap(data: unknown): Normalized {
  const first = rec(arr(data)[0] ?? data);
  if (first === null) return { ok: false };
  const tx = rec(first.tx);
  const router = rec(first.routerResult);
  if (tx === null || router === null) return { ok: false };

  const fromAmount = quantity(router.fromTokenAmount);
  const toAmount = quantity(router.toTokenAmount);
  const fromToken = side(router.fromToken);
  const toToken = side(router.toToken);
  if (fromAmount === null || toAmount === null || !validSide(fromToken) || !validSide(toToken)) return { ok: false };
  const chainIndex = text(router.chainIndex);

  const data0 = text(tx.data);
  if (data0 === null || data0.length > MAX_CALLDATA_CHARS) return { ok: false };
  const solana = chainIndex === SOLANA_CHAIN;
  if (solana ? !SOLANA_PAYLOAD.test(data0) : !HEX.test(data0) || data0 === "0x") return { ok: false };
  const to = text(tx.to);
  if (!solana && (to === null || !EVM_ADDRESS.test(to))) return { ok: false };
  const from = text(tx.from);
  const minReceive = quantity(tx.minReceiveAmount);
  const slippage = num(tx.slippagePercent);

  return {
    ok: true,
    data: {
      chainIndex,
      family: solana ? "solana" : "evm",
      tx: {
        from,
        to: solana ? null : to,
        data: data0,
        value: quantity(tx.value) ?? "0",
        gas: quantity(tx.gas),
        gasPrice: quantity(tx.gasPrice),
        maxPriorityFeePerGas: quantity(tx.maxPriorityFeePerGas),
        minReceiveAmount: minReceive,
        slippagePercent: slippage,
      },
      route: {
        fromAmount,
        toAmount,
        priceImpactPct: num(router.priceImpactPercent),
        tradeFee: num(router.tradeFee),
        estimateGasFee: num(router.estimateGasFee),
        dexNames: dexNames(router.dexRouterList),
        fromToken,
        toToken,
      },
    },
  };
}

function normalizeApprove(data: unknown): Normalized {
  const first = rec(arr(data)[0] ?? data);
  if (first === null) return { ok: false };
  const call = text(first.data);
  const spender = text(first.dexContractAddress);
  if (call === null || call.length > MAX_CALLDATA_CHARS || !HEX.test(call) || call === "0x") return { ok: false };
  if (spender === null || !EVM_ADDRESS.test(spender)) return { ok: false };
  return { ok: true, data: { data: call, spender, gasLimit: quantity(first.gasLimit), gasPrice: quantity(first.gasPrice) } };
}

export const TRADE_ENDPOINTS: readonly Endpoint[] = [
  {
    // the swap of the aggregator: the transaction the person's wallet would sign. Tier as the quote (not published by the portal, counted as Basic until measured). Never cached.
    id: "swap", route: "/onchain/swap", tier: "basic",
    validate: (p: Params): Validation => {
      if (!allowed(p, ["chainIndex", "amount", "fromToken", "toToken", "slippagePercent", "userWalletAddress"])) return BAD;
      const chain = p.chainIndex;
      if (chain === undefined || !DIGITS.test(chain)) return BAD;
      if (p.amount === undefined || !AMOUNT.test(p.amount)) return BAD;
      if (p.slippagePercent === undefined || !SLIPPAGE.test(p.slippagePercent) || Number(p.slippagePercent) <= 0) return BAD;
      const from = tokenOf(chain, p.fromToken);
      const to = tokenOf(chain, p.toToken);
      const wallet = walletOf(chain, p.userWalletAddress);
      if (from === null || to === null || wallet === null || from === to) return BAD;
      return {
        ok: true,
        request: get("/api/v6/dex/aggregator/swap", { chainIndex: chain, amount: p.amount, fromTokenAddress: from, toTokenAddress: to, slippagePercent: p.slippagePercent, userWalletAddress: wallet }),
        ttlMs: 0,
      };
    },
    normalize: normalizeSwap,
  },
  {
    // the approval of a token for the router (EVM only: Solana has no approvals). The amount is exactly what the order needs, never "unlimited".
    id: "approve", route: "/onchain/approve", tier: "basic",
    validate: (p: Params): Validation => {
      if (!allowed(p, ["chainIndex", "token", "amount"])) return BAD;
      const chain = p.chainIndex;
      if (chain === undefined || !DIGITS.test(chain) || chain === SOLANA_CHAIN) return BAD;
      if (p.amount === undefined || !AMOUNT.test(p.amount)) return BAD;
      const token = tokenOf(chain, p.token);
      if (token === null) return BAD;
      return { ok: true, request: get("/api/v6/dex/aggregator/approve-transaction", { chainIndex: chain, tokenContractAddress: token, approveAmount: p.amount }), ttlMs: 0 };
    },
    normalize: normalizeApprove,
  },
];
