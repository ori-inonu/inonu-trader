import { createHmac } from "node:crypto";
import { chainByIndex, isAddressForChain, validateChainList, type ChainSpec } from "./chains";

/**
 * Read-only OKX OnChain OS wallet inventory client (Balance API).
 *
 * Endpoints (https://web3.okx.com/onchainos/dev-docs/wallet/balance-api-all-token-balances
 * and .../balance-api-total-value, read 2026-10-10):
 *   GET /api/v6/dex/balance/all-token-balances-by-address?address=..&chains=a,b&excludeRiskToken=0|1
 *   GET /api/v6/dex/balance/total-value-by-address?address=..&chains=a,b&assetType=0|1|2
 *
 * The client never signs transactions, never reads PRIVATE_KEY and refuses live
 * requests unless explicitly enabled. Balances are strings from the provider; an
 * unparsable or missing value stays null and is never presented as zero.
 */
const API_ORIGIN = "https://web3.okx.com";
const PATHS = {
 allTokenBalances: "/api/v6/dex/balance/all-token-balances-by-address",
 totalValue: "/api/v6/dex/balance/total-value-by-address",
} as const;
const MAX_RESPONSE_CHARS = 2_000_000;
const MAX_TIMEOUT_MS = 30_000;

export interface OkxPortfolioCredentials {
 apiKey: string;
 secretKey: string;
 passphrase: string;
}

export interface PortfolioFetchInit {
 method: "GET";
 headers: Headers;
 signal: AbortSignal;
 credentials: "omit";
 redirect: "error";
 cache: "no-store";
 referrerPolicy: "no-referrer";
}

export interface PortfolioFetchResponse {
 readonly ok: boolean;
 text(): Promise<string>;
}

export type PortfolioFetch = (input: string, init: PortfolioFetchInit) => Promise<PortfolioFetchResponse>;

export interface OkxPortfolioClientOptions {
 credentials: OkxPortfolioCredentials;
 fetcher?: PortfolioFetch;
 now?: () => Date;
 timeoutMs?: number;
 allowLiveRequests?: boolean;
}

/** One raw token asset as returned by OKX; every field stays a string. */
export interface RawTokenAsset {
 chainIndex: string;
 tokenContractAddress: string;
 address: string;
 symbol: string;
 balance: string;
 rawBalance: string;
 tokenPrice: string;
 isRiskToken: boolean;
}

export interface OkxPortfolioClient {
 /** Token balances for one address across the listed chains (1..50). */
 allTokenBalances(address: string, chains: string[], includeRiskTokens?: boolean): Promise<RawTokenAsset[]>;
 /** USD valuation reported by OKX for tokens, DeFi or both. */
 totalValue(address: string, chains: string[], assetType?: "all" | "tokens" | "defi"): Promise<string>;
}

export type PortfolioErrorKind = "invalid_request" | "timeout" | "network" | "http" | "api" | "schema";

export class OkxPortfolioError extends Error {
 constructor(readonly kind: PortfolioErrorKind, message: string) {
  super(message);
  this.name = "OkxPortfolioError";
 }
}

function isRecord(value: unknown): value is Record<string, unknown> {
 return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown): value is string {
 return typeof value === "string" && !/[\u0000-\u001f\u007f]/.test(value);
}

function requiredText(value: unknown): value is string {
 return text(value) && value.length > 0 && value === value.trim();
}

function fail(kind: PortfolioErrorKind, message: string): never {
 throw new OkxPortfolioError(kind, message);
}

function validateAssets(data: unknown, requestedAddress: string, requestedChains: readonly string[]): RawTokenAsset[] {
 if (!Array.isArray(data)) fail("schema", "Unexpected OKX balance schema");
 const assets: RawTokenAsset[] = [];
 for (const entry of data) {
  if (!isRecord(entry) || !Array.isArray(entry.tokenAssets)) fail("schema", "Unexpected OKX balance schema");
  for (const asset of entry.tokenAssets) {
   if (!isRecord(asset) || !requiredText(asset.chainIndex) || !/^\d{1,12}$/.test(asset.chainIndex) ||
    !text(asset.tokenContractAddress) || !text(asset.address) || !text(asset.symbol) ||
    !text(asset.balance) || !text(asset.rawBalance) || !text(asset.tokenPrice) || typeof asset.isRiskToken !== "boolean") {
    fail("schema", "Unexpected OKX balance schema");
   }
   if (!requestedChains.includes(asset.chainIndex) ||
    (asset.address !== "" && (chainByIndex(asset.chainIndex)?.kind === "evm"
     ? asset.address.toLowerCase() !== requestedAddress.toLowerCase()
     : asset.address !== requestedAddress)))
    fail("schema", "Balance response does not match request identity");
   assets.push({
    chainIndex: asset.chainIndex,
    tokenContractAddress: asset.tokenContractAddress,
    address: asset.address,
    symbol: asset.symbol,
    balance: asset.balance,
    rawBalance: asset.rawBalance,
    tokenPrice: asset.tokenPrice,
    isRiskToken: asset.isRiskToken,
   });
  }
 }
 return assets;
}

function validateTotalValue(data: unknown): string {
 if (!Array.isArray(data) || data.length !== 1 || !isRecord(data[0]) || !requiredText(data[0].totalValue))
  fail("schema", "Unexpected OKX total value schema");
 return data[0].totalValue;
}

function validateAddress(address: unknown, chains: string[]): string {
 if (typeof address !== "string" || !chains.some((chain) => isAddressForChain(chain, address)))
  fail("invalid_request", "Address does not match any requested chain family");
 return address;
}

export function createOkxPortfolioClient(options: OkxPortfolioClientOptions): OkxPortfolioClient {
 const { credentials } = options;
 if (!credentials || !requiredText(credentials.apiKey) || !requiredText(credentials.secretKey) || !requiredText(credentials.passphrase))
  fail("invalid_request", "Invalid OKX API credentials");
 const timeoutMs = options.timeoutMs ?? 8_000;
 if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > MAX_TIMEOUT_MS) fail("invalid_request", "Invalid timeout");
 const fetcher = options.fetcher ?? (fetch as unknown as PortfolioFetch);
 const now = options.now ?? (() => new Date());
 const allowLiveRequests = options.allowLiveRequests === true;

 async function request(requestPath: string): Promise<unknown> {
  if (!allowLiveRequests) fail("invalid_request", "OKX live requests are disabled");
  const timestamp = now();
  if (!(timestamp instanceof Date) || !Number.isFinite(timestamp.getTime())) fail("invalid_request", "Invalid clock");
  const timestampText = timestamp.toISOString();
  const signature = createHmac("sha256", credentials.secretKey).update(`${timestampText}GET${requestPath}`).digest("base64");
  const headers = new Headers({
   "OK-ACCESS-KEY": credentials.apiKey,
   "OK-ACCESS-SIGN": signature,
   "OK-ACCESS-TIMESTAMP": timestampText,
   "OK-ACCESS-PASSPHRASE": credentials.passphrase,
  });
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
  try {
   const response = await fetcher(`${API_ORIGIN}${requestPath}`, {
    method: "GET", headers, signal: controller.signal, credentials: "omit", redirect: "error", cache: "no-store", referrerPolicy: "no-referrer",
   });
   if (timedOut) fail("timeout", "OKX request timed out");
   if (!response.ok) fail("http", "OKX returned an HTTP error");
   let body: string;
   try { body = await response.text(); } catch { fail(timedOut ? "timeout" : "network", "OKX response could not be read"); }
   if (timedOut) fail("timeout", "OKX request timed out");
   if (body.length > MAX_RESPONSE_CHARS) fail("schema", "OKX response exceeded the allowed size");
   let envelope: unknown;
   try { envelope = JSON.parse(body); } catch { fail("schema", "OKX returned invalid JSON"); }
   if (!isRecord(envelope) || !(typeof envelope.code === "string" || typeof envelope.code === "number") || !("data" in envelope))
    fail("schema", "Unexpected OKX envelope");
   if (envelope.code !== "0" && envelope.code !== 0) fail("api", "OKX API returned a non-success code");
   return envelope.data;
  } catch (error) {
   if (error instanceof OkxPortfolioError) throw error;
   if (timedOut) fail("timeout", "OKX request timed out");
   fail("network", "OKX request failed");
  } finally {
   clearTimeout(timer);
  }
 }

 return {
  async allTokenBalances(address, chains, includeRiskTokens = false) {
   const chainList = validateChainList(chains);
   const validAddress = validateAddress(address, chainList);
   const params = new URLSearchParams([
    ["address", validAddress],
    ["chains", chainList.join(",")],
    ["excludeRiskToken", includeRiskTokens ? "1" : "0"],
   ]);
   return validateAssets(await request(`${PATHS.allTokenBalances}?${params.toString()}`), validAddress, chainList);
  },
  async totalValue(address, chains, assetType = "all") {
   const chainList = validateChainList(chains);
   const validAddress = validateAddress(address, chainList);
   const typeCode = assetType === "all" ? "0" : assetType === "tokens" ? "1" : assetType === "defi" ? "2" : fail("invalid_request", "Invalid asset type");
   const params = new URLSearchParams([
    ["address", validAddress],
    ["chains", chainList.join(",")],
    ["assetType", typeCode],
   ]);
   return validateTotalValue(await request(`${PATHS.totalValue}?${params.toString()}`));
  },
 };
}

/* ---------- Normalized inventory ---------- */

export interface InventoryAsset {
 chainIndex: string;
 chainName: string;
 /** Empty string means the chain's native coin, as OKX reports it. */
 tokenContractAddress: string;
 native: boolean;
 symbol: string;
 /** Decimal text exactly as the provider sent it. */
 balanceText: string;
 balance: number | null;
 priceUsd: number | null;
 valueUsd: number | null;
 isRiskToken: boolean;
}

export interface ChainInventory {
 chainIndex: string;
 chainName: string;
 kind: ChainSpec["kind"];
 nativeSymbol: string;
 assets: InventoryAsset[];
 /** Native coin balance when OKX reported it; null means not reported, not zero. */
 nativeBalance: number | null;
 /** Sum of assets whose USD value is known. */
 knownValueUsd: number;
 /** False when any asset on this chain lacks a usable price or balance. */
 valueComplete: boolean;
}

export interface InventorySnapshot {
 address: string;
 observedAtMs: number;
 source: "okx_balance_api" | "synthetic";
 /** Chains that were part of the request; absence from `chains` means nothing reported, not zero. */
 queriedChains: string[];
 chains: ChainInventory[];
 knownValueUsd: number;
 valueComplete: boolean;
 riskTokensExcluded: boolean;
}

function parseDecimal(value: string): number | null {
 if (!/^\d+(?:\.\d+)?$/.test(value)) return null;
 const parsed = Number(value);
 return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

export function normalizeInventory(input: {
 address: string;
 queriedChains: string[];
 assets: RawTokenAsset[];
 observedAtMs: number;
 source: InventorySnapshot["source"];
 riskTokensExcluded: boolean;
}): InventorySnapshot {
 if (!Number.isSafeInteger(input.observedAtMs) || input.observedAtMs <= 0) throw new Error("Invalid observation time");
 const queriedChains = validateChainList(input.queriedChains);
 const finiteSum = (sum: number, value: number): number => {
  const next = sum + value;
  if (!Number.isFinite(next)) throw new Error("Inventory USD total is not representable");
  return next;
 };
 const byChain = new Map<string, ChainInventory>();
 for (const raw of input.assets) {
  if (!queriedChains.includes(raw.chainIndex)) continue;
  const spec = chainByIndex(raw.chainIndex)!;
  let chain = byChain.get(raw.chainIndex);
  if (!chain) {
   chain = { chainIndex: raw.chainIndex, chainName: spec.name, kind: spec.kind, nativeSymbol: spec.nativeSymbol, assets: [], nativeBalance: null, knownValueUsd: 0, valueComplete: true };
   byChain.set(raw.chainIndex, chain);
  }
  const balance = parseDecimal(raw.balance);
  const price = parseDecimal(raw.tokenPrice);
  const product = balance !== null && price !== null ? balance * price : null;
  const valueUsd = product !== null && Number.isFinite(product) ? product : null;
  const native = raw.tokenContractAddress === "";
  const asset: InventoryAsset = {
   chainIndex: raw.chainIndex, chainName: spec.name, tokenContractAddress: raw.tokenContractAddress, native,
   symbol: raw.symbol, balanceText: raw.balance, balance, priceUsd: price, valueUsd, isRiskToken: raw.isRiskToken,
  };
  chain.assets.push(asset);
  if (native) chain.nativeBalance = balance;
  if (valueUsd === null) chain.valueComplete = false;
  else chain.knownValueUsd = finiteSum(chain.knownValueUsd, valueUsd);
 }
 const chains = queriedChains.map((chainIndex) => byChain.get(chainIndex)).filter((chain): chain is ChainInventory => chain !== undefined);
 return {
  address: input.address,
  observedAtMs: input.observedAtMs,
  source: input.source,
  queriedChains,
  chains,
  knownValueUsd: chains.reduce((sum, chain) => finiteSum(sum, chain.knownValueUsd), 0),
  valueComplete: chains.every((chain) => chain.valueComplete),
  riskTokensExcluded: input.riskTokensExcluded,
 };
}

/** Deterministic offline example used by CLI demos and tests; never a real wallet. */
export function syntheticInventory(observedAtMs: number): InventorySnapshot {
 const address = "0x0000000000000000000000000000000000000001";
 return normalizeInventory({
  address,
  queriedChains: ["143", "196", "501"],
  observedAtMs,
  source: "synthetic",
  riskTokensExcluded: true,
  assets: [
   { chainIndex: "143", tokenContractAddress: "", address, symbol: "MON", balance: "12.5", rawBalance: "12500000000000000000", tokenPrice: "1.8", isRiskToken: false },
   { chainIndex: "143", tokenContractAddress: "0x754704bc059f8c67012fed69bc8a327a5aafb603", address, symbol: "USDC", balance: "40", rawBalance: "40000000", tokenPrice: "1", isRiskToken: false },
   { chainIndex: "196", tokenContractAddress: "", address, symbol: "OKB", balance: "0.2", rawBalance: "200000000000000000", tokenPrice: "50", isRiskToken: false },
   { chainIndex: "196", tokenContractAddress: "0x1e4a5963abfd975d8c9021ce480b42188849d41d", address, symbol: "USDT", balance: "75", rawBalance: "75000000", tokenPrice: "1", isRiskToken: false },
   { chainIndex: "501", tokenContractAddress: "", address, symbol: "SOL", balance: "0.05", rawBalance: "50000000", tokenPrice: "150", isRiskToken: false },
   { chainIndex: "501", tokenContractAddress: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", address, symbol: "USDC", balance: "30", rawBalance: "30000000", tokenPrice: "", isRiskToken: false },
  ],
 });
}
