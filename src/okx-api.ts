import { createHmac } from "node:crypto";
import { normalizeTokenAddress, tokenAddressesEqual } from "./okx-market/token-identity";

const API_ORIGIN = "https://web3.okx.com";
const MAX_RESPONSE_CHARS = 1_000_000;
const MAX_TOKEN_BATCH = 30;
const MAX_MEMEPUMP_LIMIT = 30;
const MAX_TIMEOUT_MS = 30_000;

const PATHS = {
  supportedChains: "/api/v6/dex/market/memepump/supported/chainsProtocol",
  memePumpTokens: "/api/v6/dex/market/memepump/tokenList",
  priceInfo: "/api/v6/dex/market/price-info",
  advancedInfo: "/api/v6/dex/market/token/advanced-info",
  topLiquidity: "/api/v6/dex/market/token/top-liquidity",
} as const;

export interface OkxApiCredentials {
  apiKey: string;
  secretKey: string;
  passphrase: string;
}

export interface OkxReadOnlyClientOptions {
  credentials: OkxApiCredentials;
  fetcher?: OkxFetch;
  now?: () => Date;
  timeoutMs?: number;
  allowLiveRequests?: boolean;
}

export interface OkxFetchInit {
  method: "GET" | "POST";
  headers: Headers;
  body?: string;
  signal: AbortSignal;
  credentials: "omit";
  redirect: "error";
  cache: "no-store";
  referrerPolicy: "no-referrer";
}

export interface OkxFetchResponse {
  readonly ok: boolean;
  text(): Promise<string>;
}

export type OkxFetch = (input: string, init: OkxFetchInit) => Promise<OkxFetchResponse>;

export interface TokenIdentity {
  chainIndex: string;
  tokenContractAddress: string;
}

export type MemePumpStage = "NEW" | "MIGRATING" | "MIGRATED";

export interface MemePumpTokenListInput {
  chainIndex: string;
  stage: MemePumpStage;
  limit: number;
}

export interface MemePumpProtocol {
  protocolId: string;
  protocolName: string;
}

export interface MemePumpSupportedChain {
  chainIndex: string;
  chainName: string;
  protocolList: MemePumpProtocol[];
}

export interface MemePumpTokenList {
  items: (TokenIdentity & Record<string, unknown>)[];
  cursor?: string;
}

export interface TokenPriceInfo extends TokenIdentity, Record<string, unknown> {
  time: string;
  price: string;
}

export interface TokenLiquidityPool extends Record<string, unknown> {
  pool: string;
  poolAddress: string;
  liquidityUsd: string;
}

export interface OkxApiRequest {
  url: string;
  method: string;
  body: string;
  headers: Headers;
}

export interface OkxReadOnlyClient {
  getMemePumpSupportedChains(): Promise<MemePumpSupportedChain[]>;
  getMemePumpTokenList(input: MemePumpTokenListInput): Promise<MemePumpTokenList>;
  getTokenPriceInfo(tokens: TokenIdentity[]): Promise<TokenPriceInfo[]>;
  getTokenAdvancedInfo(token: TokenIdentity): Promise<Record<string, unknown>>;
  getTokenTopLiquidity(token: TokenIdentity): Promise<TokenLiquidityPool[]>;
}

export type OkxApiErrorKind = "invalid_request" | "timeout" | "network" | "http" | "api" | "schema";

export class OkxApiError extends Error {
  constructor(readonly kind: OkxApiErrorKind, message: string) {
    super(message);
    this.name = "OkxApiError";
  }
}

const internalApiErrorKinds = new WeakMap<object, OkxApiErrorKind>();
const factoryCreatedOkxClients = new WeakSet<object>();

export function isOkxReadOnlyClient(value: unknown): value is OkxReadOnlyClient {
  if ((typeof value !== "object" && typeof value !== "function") || value === null) return false;
  return factoryCreatedOkxClients.has(value);
}

function makeApiError(kind: OkxApiErrorKind, message: string): OkxApiError {
  const error = new OkxApiError(kind, message);
  internalApiErrorKinds.set(error, kind);
  return error;
}
export function getInternalOkxApiErrorKind(error: unknown): OkxApiErrorKind | undefined {
  if ((typeof error !== "object" && typeof error !== "function") || error === null) return undefined;
  return internalApiErrorKinds.get(error);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredText(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value === value.trim() && !/[\u0000-\u001f\u007f]/.test(value);
}

function validChainIndex(value: unknown): value is string {
  return requiredText(value) && /^\d{1,12}$/.test(value);
}

function validTokenIdentity(value: unknown): value is TokenIdentity {
  return isRecord(value) && validChainIndex(value.chainIndex) && requiredText(value.tokenContractAddress);
}

function tokenIdentityKey(token: TokenIdentity): string {
  return JSON.stringify([token.chainIndex, normalizeTokenAddress(token.chainIndex, token.tokenContractAddress)]);
}

function schemaError(): never {
  throw makeApiError("schema", "Unexpected OKX response schema");
}

function validateSupportedChains(data: unknown): MemePumpSupportedChain[] {
  if (!Array.isArray(data)) return schemaError();
  for (const chain of data) {
    if (!isRecord(chain) || !requiredText(chain.chainIndex) || !requiredText(chain.chainName) || !Array.isArray(chain.protocolList))
      return schemaError();
    for (const protocol of chain.protocolList)
      if (!isRecord(protocol) || !requiredText(protocol.protocolId) || !requiredText(protocol.protocolName)) return schemaError();
  }
  return data as MemePumpSupportedChain[];
}

function validateTokenList(data: unknown, requestedLimit: number, requestedChainIndex: string): MemePumpTokenList {
  if (!isRecord(data) || !Array.isArray(data.items) || data.items.length > requestedLimit) return schemaError();
  if (data.cursor !== undefined && typeof data.cursor !== "string") return schemaError();
  for (const token of data.items)
    if (!validTokenIdentity(token) || token.chainIndex !== requestedChainIndex) return schemaError();
  return data as unknown as MemePumpTokenList;
}

function validatePriceInfo(data: unknown, requestedTokens: TokenIdentity[]): TokenPriceInfo[] {
  if (!Array.isArray(data) || data.length > requestedTokens.length) return schemaError();
  const requested = new Set(requestedTokens.map(tokenIdentityKey));
  const seen = new Set<string>();
  for (const item of data) {
    if (!validTokenIdentity(item) || !isRecord(item) || typeof item.time !== "string" || typeof item.price !== "string")
      return schemaError();
    const key = tokenIdentityKey(item);
    if (!requested.has(key) || seen.has(key)) return schemaError();
    seen.add(key);
  }
  return data as TokenPriceInfo[];
}

function validateAdvancedInfo(data: unknown, requested: TokenIdentity): Record<string, unknown> {
  if (!isRecord(data)) return schemaError();
  if (data.chainIndex !== undefined && data.chainIndex !== requested.chainIndex) return schemaError();
  if (data.tokenContractAddress !== undefined && (typeof data.tokenContractAddress !== "string" ||
    !tokenAddressesEqual(requested.chainIndex, data.tokenContractAddress, requested.tokenContractAddress))) return schemaError();
  return data;
}

function validateTopLiquidity(data: unknown): TokenLiquidityPool[] {
  if (!Array.isArray(data) || data.length > 5) return schemaError();
  for (const pool of data) {
    if (!isRecord(pool) || typeof pool.pool !== "string" || typeof pool.poolAddress !== "string" || typeof pool.liquidityUsd !== "string")
      return schemaError();
  }
  return data as TokenLiquidityPool[];
}

function validateTimeout(timeoutMs: number): void {
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > MAX_TIMEOUT_MS)
    throw makeApiError("invalid_request", "Invalid OKX request");
}

function validateToken(token: unknown): asserts token is TokenIdentity {
  if (!validTokenIdentity(token)) throw makeApiError("invalid_request", "Invalid OKX request");
}

function makeQuery(path: string, entries: [string, string][]): string {
  const params = new URLSearchParams();
  for (const [key, value] of entries) params.append(key, value);
  return `${path}?${params.toString()}`;
}

export function createOkxReadOnlyClient(options: OkxReadOnlyClientOptions): OkxReadOnlyClient {
  const { credentials } = options;
  if (!credentials || !requiredText(credentials.apiKey) || !requiredText(credentials.secretKey) || !requiredText(credentials.passphrase))
    throw makeApiError("invalid_request", "Invalid OKX API credentials");

  const timeoutMs = options.timeoutMs ?? 5_000;
  validateTimeout(timeoutMs);
  const fetcher = options.fetcher ?? (fetch as unknown as OkxFetch);
  const now = options.now ?? (() => new Date());
  const allowLiveRequests = options.allowLiveRequests === true;

  async function request(method: "GET" | "POST", requestPath: string, body = ""): Promise<unknown> {
    if (!allowLiveRequests) throw makeApiError("invalid_request", "OKX live requests are disabled");
    const timestamp = now();
    if (!(timestamp instanceof Date) || !Number.isFinite(timestamp.getTime()))
      throw makeApiError("invalid_request", "Invalid OKX request");
    const timestampText = timestamp.toISOString();
    const signature = createHmac("sha256", credentials.secretKey)
      .update(`${timestampText}${method}${requestPath}${body}`)
      .digest("base64");
    const headers = new Headers({
      "OK-ACCESS-KEY": credentials.apiKey,
      "OK-ACCESS-SIGN": signature,
      "OK-ACCESS-TIMESTAMP": timestampText,
      "OK-ACCESS-PASSPHRASE": credentials.passphrase,
    });
    if (method === "POST") headers.set("Content-Type", "application/json");

    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);
    try {
      const response: OkxFetchResponse = await fetcher(`${API_ORIGIN}${requestPath}`, {
        method,
        headers,
        ...(body ? { body } : {}),
        signal: controller.signal,
        credentials: "omit",
        redirect: "error",
        cache: "no-store",
        referrerPolicy: "no-referrer",
      });
      if (timedOut) throw makeApiError("timeout", "OKX request timed out");
      if (!response.ok) throw makeApiError("http", "OKX returned an HTTP error");

      let text: string;
      try {
        text = await response.text();
      } catch {
        if (timedOut) throw makeApiError("timeout", "OKX request timed out");
        throw makeApiError("network", "OKX response could not be read");
      }
      if (timedOut) throw makeApiError("timeout", "OKX request timed out");
      if (text.length > MAX_RESPONSE_CHARS) throw makeApiError("schema", "OKX response exceeded the allowed size");

      let envelope: unknown;
      try {
        envelope = JSON.parse(text);
      } catch {
        throw makeApiError("schema", "OKX returned invalid JSON");
      }
      if (!isRecord(envelope) || !(typeof envelope.code === "string" || typeof envelope.code === "number") || !("data" in envelope)) schemaError();
      if (envelope.code !== "0" && envelope.code !== 0) throw makeApiError("api", "OKX API returned a non-success code");
      return envelope.data;
    } catch (error) {
      if (getInternalOkxApiErrorKind(error) !== undefined) throw error;
      if (timedOut) throw makeApiError("timeout", "OKX request timed out");
      throw makeApiError("network", "OKX request failed");
    } finally {
      clearTimeout(timer);
    }
  }

  const client: OkxReadOnlyClient = {
    async getMemePumpSupportedChains() {
      return validateSupportedChains(await request("GET", PATHS.supportedChains));
    },

    async getMemePumpTokenList(input) {
      if (!isRecord(input) || !validChainIndex(input.chainIndex) ||
        !["NEW", "MIGRATING", "MIGRATED"].includes(input.stage) ||
        !Number.isInteger(input.limit) || input.limit < 1 || input.limit > MAX_MEMEPUMP_LIMIT)
        throw makeApiError("invalid_request", "Invalid OKX request");
      const requestPath = makeQuery(PATHS.memePumpTokens, [
        ["chainIndex", input.chainIndex],
        ["stage", input.stage],
        ["limit", String(input.limit)],
      ]);
      return validateTokenList(await request("GET", requestPath), input.limit, input.chainIndex);
    },

    async getTokenPriceInfo(tokens) {
      if (!Array.isArray(tokens) || tokens.length < 1 || tokens.length > MAX_TOKEN_BATCH)
        throw makeApiError("invalid_request", "Invalid OKX request");
      tokens.forEach(validateToken);
      const body = JSON.stringify(tokens);
      return validatePriceInfo(await request("POST", PATHS.priceInfo, body), tokens);
    },

    async getTokenAdvancedInfo(token) {
      validateToken(token);
      const path = makeQuery(PATHS.advancedInfo, [
        ["chainIndex", token.chainIndex],
        ["tokenContractAddress", token.tokenContractAddress],
      ]);
      return validateAdvancedInfo(await request("GET", path), token);
    },

    async getTokenTopLiquidity(token) {
      validateToken(token);
      const path = makeQuery(PATHS.topLiquidity, [
        ["chainIndex", token.chainIndex],
        ["tokenContractAddress", token.tokenContractAddress],
      ]);
      return validateTopLiquidity(await request("GET", path));
    },
  };
  factoryCreatedOkxClients.add(client);
  return client;
}
