import { createHmac } from "node:crypto";
import type { BridgeQuote, BridgeQuoter, SwapQuote, SwapQuoter } from "../operator/candidates";

/**
 * OKX OnChain OS Trade API adapters (signed GET only; nothing here signs or
 * broadcasts a transaction).
 *
 * Single-chain swap, documented 2026-10-10:
 *   GET /api/v6/dex/aggregator/quote
 *   GET /api/v6/dex/aggregator/swap          (returns router calldata; signing is separate)
 *   GET /api/v6/dex/aggregator/approve-transaction
 *   GET /api/v6/dex/pre-transaction/gas-price
 * Cross-chain, paths confirmed in the OKX DEX SDK source
 * (src/okx/api/bridge.ts, github.com/okx/okx-dex-sdk, read 2026-10-10):
 *   GET /api/v5/dex/cross-chain/quote
 *   GET /api/v5/dex/cross-chain/build-tx
 * DeFi (dev docs wallet/defi-product-search and defi-transaction-exit):
 *   POST /api/v6/defi/product/search
 *   POST /api/v6/defi/transaction/exit
 */
const API_ORIGIN = "https://web3.okx.com";
export const TRADE_PATHS = {
  quote: "/api/v6/dex/aggregator/quote",
  swap: "/api/v6/dex/aggregator/swap",
  approve: "/api/v6/dex/aggregator/approve-transaction",
  gasPrice: "/api/v6/dex/pre-transaction/gas-price",
  crossChainQuote: "/api/v5/dex/cross-chain/quote",
  crossChainBuildTx: "/api/v5/dex/cross-chain/build-tx",
  defiProductSearch: "/api/v6/defi/product/search",
  defiTransactionExit: "/api/v6/defi/transaction/exit",
} as const;
type TradePath = typeof TRADE_PATHS[keyof typeof TRADE_PATHS];
const MAX_RESPONSE_CHARS = 2_000_000;

export interface OkxTradeCredentials { apiKey: string; secretKey: string; passphrase: string }

export interface TradeFetchInit { method: "GET" | "POST"; headers: Headers; body?: string; signal: AbortSignal; credentials: "omit"; redirect: "error"; cache: "no-store"; referrerPolicy: "no-referrer" }
export type TradeFetch = (input: string, init: TradeFetchInit) => Promise<{ readonly ok: boolean; text(): Promise<string> }>;

export interface OkxTradeClientOptions {
  credentials: OkxTradeCredentials;
  fetcher?: TradeFetch;
  now?: () => Date;
  timeoutMs?: number;
  allowLiveRequests?: boolean;
  /** Serializes requests so the documented per-second quota is respected. */
  minRequestIntervalMs?: number;
}

export interface OkxTradeClient {
  get(path: TradePath, params: Record<string, string>): Promise<Record<string, unknown>[]>;
  /** Signed POST with a JSON body; the body is part of the HMAC payload. */
  post(path: TradePath, body: Record<string, unknown>): Promise<Record<string, unknown>[] | Record<string, unknown>>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function requiredText(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value === value.trim() && !/[\u0000-\u001f\u007f]/.test(value);
}

export function createOkxTradeClient(options: OkxTradeClientOptions): OkxTradeClient {
  const { credentials } = options;
  if (!credentials || !requiredText(credentials.apiKey) || !requiredText(credentials.secretKey) || !requiredText(credentials.passphrase)) throw new Error("Invalid OKX API credentials");
  const timeoutMs = options.timeoutMs ?? 10_000;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 120_000) throw new Error("Invalid timeout");
  const minInterval = options.minRequestIntervalMs ?? 1_100;
  if (!Number.isInteger(minInterval) || minInterval < 0) throw new Error("Invalid request interval");
  const fetcher = options.fetcher ?? (fetch as unknown as TradeFetch);
  const now = options.now ?? (() => new Date());
  const allowed = new Set<string>(Object.values(TRADE_PATHS));
  let queue: Promise<unknown> = Promise.resolve();
  let lastRequestAt = 0;

  async function send(method: "GET" | "POST", path: TradePath, params: Record<string, string>, body?: Record<string, unknown>): Promise<Record<string, unknown>[] | Record<string, unknown>> {
    if (options.allowLiveRequests !== true) throw new Error("OKX live requests are disabled");
    if (!allowed.has(path)) throw new Error("Trade path not allowed");
    for (const [key, value] of Object.entries(params)) if (!/^[a-zA-Z]+$/.test(key) || !requiredText(value) || /[\s]/.test(value)) throw new Error(`Invalid parameter ${key}`);
    const search = new URLSearchParams(Object.entries(params)).toString();
    const requestPath = search ? `${path}?${search}` : path;
    const bodyText = method === "POST" ? JSON.stringify(body ?? {}) : "";
    const wait = lastRequestAt + minInterval - Date.now();
    if (wait > 0) await Bun.sleep(wait);
    lastRequestAt = Date.now();
    const timestamp = now();
    if (!(timestamp instanceof Date) || !Number.isFinite(timestamp.getTime())) throw new Error("Invalid clock");
    const timestampText = timestamp.toISOString();
    const signature = createHmac("sha256", credentials.secretKey).update(`${timestampText}${method}${requestPath}${bodyText}`).digest("base64");
    const headers = new Headers({ "OK-ACCESS-KEY": credentials.apiKey, "OK-ACCESS-SIGN": signature, "OK-ACCESS-TIMESTAMP": timestampText, "OK-ACCESS-PASSPHRASE": credentials.passphrase });
    if (method === "POST") headers.set("Content-Type", "application/json");
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetcher(`${API_ORIGIN}${requestPath}`, { method, headers, ...(method === "POST" ? { body: bodyText } : {}), signal: controller.signal, credentials: "omit", redirect: "error", cache: "no-store", referrerPolicy: "no-referrer" });
      if (!response.ok) throw new Error("OKX returned an HTTP error");
      const body = await response.text();
      if (body.length > MAX_RESPONSE_CHARS) throw new Error("OKX response exceeded the allowed size");
      const envelope: unknown = JSON.parse(body);
      if (!isRecord(envelope) || !("data" in envelope) || !(typeof envelope.code === "string" || typeof envelope.code === "number")) throw new Error("Unexpected OKX envelope");
      if (envelope.code !== "0" && envelope.code !== 0) throw new Error(`OKX API returned code ${String(envelope.code)}`);
      if (isRecord(envelope.data)) return envelope.data;
      if (!Array.isArray(envelope.data) || !envelope.data.every(isRecord)) throw new Error("Unexpected OKX data");
      return envelope.data;
    } finally {
      clearTimeout(timer);
    }
  }

  const enqueue = <T,>(task: () => Promise<T>): Promise<T> => {
    const run = queue.then(task);
    queue = run.catch(() => undefined);
    return run;
  };
  return {
    get: (path, params) => enqueue(async () => {
      const data = await send("GET", path, params);
      if (!Array.isArray(data)) throw new Error("Unexpected OKX data");
      return data;
    }),
    post: (path, body) => enqueue(() => send("POST", path, {}, body)),
  };
}

function decimalOrNull(value: unknown): number | null {
  if (typeof value !== "string" || !/^[+-]?\d+(?:\.\d+)?$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
function atomicOrThrow(value: unknown, field: string): string {
  if (typeof value !== "string" || !/^(0|[1-9]\d{0,77})$/.test(value)) throw new Error(`Quote field ${field} is not an atomic integer`);
  return value;
}

/** Maps the aggregator quote (routerResult fields) onto the operator's SwapQuote. */
export function okxSwapQuoter(client: OkxTradeClient, now: () => number = Date.now, priceImpactProtectionPercent = 1, unitsQualified = false): SwapQuoter {
  return {
    unitsQualified,
    async quote(input) {
      const data = await client.get(TRADE_PATHS.quote, {
        chainIndex: input.chainIndex, fromTokenAddress: input.fromTokenAddress, toTokenAddress: input.toTokenAddress,
        amount: input.amountAtomic, priceImpactProtectionPercent: String(priceImpactProtectionPercent),
      });
      const first = data[0];
      if (!first) throw new Error("Empty quote");
      const quote: SwapQuote = {
        fromAmountAtomic: atomicOrThrow(first.fromTokenAmount, "fromTokenAmount"),
        toAmountAtomic: atomicOrThrow(first.toTokenAmount, "toTokenAmount"),
        priceImpactPercent: decimalOrNull(first.priceImpactPercent),
        tradeFeeUsd: decimalOrNull(first.tradeFee),
        receivedAtMs: now(),
      };
      if (quote.fromAmountAtomic !== input.amountAtomic) throw new Error("Quote amount mismatch");
      return quote;
    },
  };
}

/** Maps a cross-chain route quote onto BridgeQuote; nullable where the provider is silent. */
export function okxBridgeQuoter(client: OkxTradeClient, now: () => number = Date.now, slippagePercent = 0.5, qualified = false): BridgeQuoter {
  return {
    qualified,
    async quote(input) {
      const data = await client.get(TRADE_PATHS.crossChainQuote, {
        fromChainIndex: input.fromChainIndex, toChainIndex: input.toChainIndex, fromTokenAddress: input.fromTokenAddress,
        toTokenAddress: input.toTokenAddress, amount: input.amountAtomic, slippagePercent: String(slippagePercent),
      });
      const first = data[0];
      if (!first) throw new Error("Empty cross-chain quote");
      const routers = Array.isArray(first.routerList) ? first.routerList.filter(isRecord) : [];
      const route = routers[0] ?? first;
      const router = isRecord(route.router) ? route.router : {};
      const fees = [router.crossChainFeeUsd, route.fromChainNetworkFeeUsd, route.toChainNetworkFeeUsd].map(decimalOrNull);
      const totalFeeUsd = fees.every((fee) => fee !== null) ? fees.reduce((sum, fee) => sum + (fee as number), 0) : null;
      const minutes = decimalOrNull(route.estimateTime);
      const quote: BridgeQuote = {
        fromAmountAtomic: atomicOrThrow(route.fromTokenAmount ?? first.fromTokenAmount, "fromTokenAmount"),
        toAmountAtomic: atomicOrThrow(route.toTokenAmount, "toTokenAmount"),
        minimumReceivedAtomic: typeof route.minimumReceived === "string" && /^(0|[1-9]\d{0,77})$/.test(route.minimumReceived) ? route.minimumReceived : null,
        totalFeeUsd,
        estimatedMinutes: minutes === null ? null : minutes / 60,
        receivedAtMs: now(),
      };
      if (quote.fromAmountAtomic !== input.amountAtomic) throw new Error("Cross-chain quote amount mismatch");
      return quote;
    },
  };
}

export interface PreparedEvmTransaction {
  chainIndex: string;
  to: string;
  data: string;
  value: string;
  gas: string;
  gasPrice: string | null;
  maxPriorityFeePerGas: string | null;
  minReceiveAmount: string | null;
  slippagePercent: string | null;
  /** Approval calldata when the router still needs an allowance. */
  approval: { to: string; data: string } | null;
}

function hexOrThrow(value: unknown, field: string): string {
  if (typeof value !== "string" || !/^0x[0-9a-fA-F]*$/.test(value)) throw new Error(`Swap field ${field} is not hex`);
  return value;
}

/** Builds (never sends) the EVM swap transaction returned by OKX for one leg. */
export async function prepareEvmSwap(client: OkxTradeClient, input: {
  chainIndex: string; fromTokenAddress: string; toTokenAddress: string; amountAtomic: string; slippagePercent: number; userWalletAddress: string;
}): Promise<PreparedEvmTransaction> {
  if (!/^0x[0-9a-fA-F]{40}$/.test(input.userWalletAddress)) throw new Error("Invalid EVM wallet address");
  if (!Number.isFinite(input.slippagePercent) || input.slippagePercent < 0 || input.slippagePercent > 5) throw new Error("Slippage outside 0..5 percent");
  const data = await client.get(TRADE_PATHS.swap, {
    chainIndex: input.chainIndex, fromTokenAddress: input.fromTokenAddress, toTokenAddress: input.toTokenAddress,
    amount: input.amountAtomic, slippagePercent: String(input.slippagePercent), userWalletAddress: input.userWalletAddress, approveTransaction: "true",
  });
  const first = data[0];
  if (!first || !isRecord(first.tx)) throw new Error("Swap response lacks tx");
  const tx = first.tx;
  const signatureData = Array.isArray(tx.signatureData) ? tx.signatureData.filter(isRecord) : [];
  const approvalEntry = signatureData.find((entry) => typeof entry.to === "string" && typeof entry.data === "string");
  return {
    chainIndex: input.chainIndex,
    to: hexOrThrow(tx.to, "to"),
    data: hexOrThrow(tx.data, "data"),
    value: atomicOrThrow(tx.value ?? "0", "value"),
    gas: atomicOrThrow(tx.gas, "gas"),
    gasPrice: typeof tx.gasPrice === "string" ? atomicOrThrow(tx.gasPrice, "gasPrice") : null,
    maxPriorityFeePerGas: typeof tx.maxPriorityFeePerGas === "string" ? atomicOrThrow(tx.maxPriorityFeePerGas, "maxPriorityFeePerGas") : null,
    minReceiveAmount: typeof tx.minReceiveAmount === "string" ? atomicOrThrow(tx.minReceiveAmount, "minReceiveAmount") : null,
    slippagePercent: typeof tx.slippagePercent === "string" ? tx.slippagePercent : null,
    approval: approvalEntry ? { to: hexOrThrow(approvalEntry.to, "approval.to"), data: hexOrThrow(approvalEntry.data, "approval.data") } : null,
  };
}
