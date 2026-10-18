import { createHmac } from "node:crypto";
import { normalizeTokenAddress } from "./token-identity";

const API_ORIGIN = "https://web3.okx.com";
const PROTOCOLS_PATH = "/api/v6/dex/market/memepump/supported/chainsProtocol";
const TOKEN_LIST_PATH = "/api/v6/dex/market/memepump/tokenList";
const PRICE_INFO_PATH = "/api/v6/dex/market/price-info";
const ADVANCED_INFO_PATH = "/api/v6/dex/market/token/advanced-info";
const TOP_LIQUIDITY_PATH = "/api/v6/dex/market/token/top-liquidity";
const DEFAULT_TIMEOUT_MS = 10_000;
const MEME_STAGES = new Set<MemeStage>(["NEW", "MIGRATING", "MIGRATED"]);

export interface TokenIdentity {
  chainIndex: string;
  tokenContractAddress: string;
}

export type MemeStage = "NEW" | "MIGRATING" | "MIGRATED";

export type OkxIdentityEndpoint = "advanced" | "pools" | "prices";

export class OkxIdentityMismatchError extends Error {
  readonly endpoint: OkxIdentityEndpoint;

  constructor(endpoint: OkxIdentityEndpoint) {
    super("OKX API returned an identity mismatch.");
    this.name = "OkxIdentityMismatchError";
    this.endpoint = endpoint;
  }
}

const internalIdentityMismatchErrors = new WeakSet<object>();
function makeIdentityMismatchError(endpoint: OkxIdentityEndpoint): OkxIdentityMismatchError {
  const error = new OkxIdentityMismatchError(endpoint);
  internalIdentityMismatchErrors.add(error);
  return error;
}
export function isOkxIdentityMismatchError(error: unknown): error is OkxIdentityMismatchError {
  if ((typeof error !== "object" && typeof error !== "function") || error === null) return false;
  return internalIdentityMismatchErrors.has(error);
}

export interface OkxCredentials {
  apiKey: string;
  secret: string;
  passphrase: string;
}

type OkxFetch = (
  input: Parameters<typeof globalThis.fetch>[0],
  init?: Parameters<typeof globalThis.fetch>[1],
) => ReturnType<typeof globalThis.fetch>;

export interface OkxReadOnlyClientOptions {
  credentials: OkxCredentials;
  fetch?: OkxFetch;
  now?: () => Date;
  timeoutMs?: number;
}

export interface OkxReadOnlyClient {
  protocols(): Promise<Record<string, unknown>[]>;
  listMemePump(input: {
    chainIndex: string;
    stage: MemeStage;
    protocolIdList?: string[];
    limit: number;
  }): Promise<{ cursor: string | null; items: Record<string, unknown>[] }>;
  prices(identities: TokenIdentity[]): Promise<Record<string, unknown>[]>;
  advanced(identity: TokenIdentity): Promise<Record<string, unknown>[]>;
  pools(identity: TokenIdentity): Promise<Record<string, unknown>[]>;
}

const okxReadOnlyClients = new WeakSet<object>();
export function isOkxReadOnlyClient(value: unknown): value is OkxReadOnlyClient {
  if ((typeof value !== "object" && typeof value !== "function") || value === null) return false;
  return okxReadOnlyClients.has(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireText(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0 || /[\r\n]/.test(value)) {
    throw new Error(`Invalid ${field}.`);
  }
  return value;
}

function isPositiveChainIndex(value: unknown): value is string {
  return typeof value === "string" && /^[1-9]\d*$/.test(value);
}

function requireChainIndex(value: unknown): string {
  if (!isPositiveChainIndex(value)) throw new Error("Invalid chainIndex.");
  return value;
}

function validateCredentials(credentials: OkxCredentials): void {
  requireText(credentials.apiKey, "API credentials");
  requireText(credentials.secret, "API credentials");
  requireText(credentials.passphrase, "API credentials");
}

function parseEnvelope(value: unknown): unknown {
  if (!isRecord(value) || !(value.code === "0" || value.code === 0) || !("data" in value)) {
    if (isRecord(value) && "code" in value && !(value.code === "0" || value.code === 0)) {
      throw new Error("OKX API returned a non-zero response code.");
    }
    throw new Error("OKX API returned an unexpected response schema.");
  }
  return value.data;
}

function parseRecordArray(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value) || !value.every(isRecord)) {
    throw new Error("OKX API returned an unexpected response schema.");
  }
  return value;
}

function normalizeIdentity(identity: TokenIdentity): TokenIdentity {
  if (
    !isRecord(identity) ||
    !isPositiveChainIndex(identity.chainIndex) ||
    typeof identity.tokenContractAddress !== "string" ||
    identity.tokenContractAddress.length === 0 ||
    /[\s,]/u.test(identity.tokenContractAddress)
  ) {
    throw new Error("Invalid token identity.");
  }
  const chainIndex = identity.chainIndex;
  const tokenContractAddress = identity.tokenContractAddress;
  return {
    chainIndex,
    tokenContractAddress: normalizeTokenAddress(chainIndex, tokenContractAddress),
  };
}

function identityPath(path: string, identity: TokenIdentity): { identity: TokenIdentity; pathQuery: string } {
  const normalized = normalizeIdentity(identity);
  const params = new URLSearchParams({
    chainIndex: normalized.chainIndex,
    tokenContractAddress: normalized.tokenContractAddress,
  });
  return { identity: normalized, pathQuery: `${path}?${params.toString()}` };
}

function identityKey(identity: TokenIdentity): string {
  return JSON.stringify([identity.chainIndex, identity.tokenContractAddress]);
}

function parseResponseIdentity(chainIndex: unknown, tokenContractAddress: unknown): TokenIdentity {
  try {
    return normalizeIdentity({
      chainIndex: chainIndex as string,
      tokenContractAddress: tokenContractAddress as string,
    });
  } catch {
    throw new Error("OKX API returned an unexpected response schema.");
  }
}

export function createOkxReadOnlyClient(options: OkxReadOnlyClientOptions): OkxReadOnlyClient {
  validateCredentials(options.credentials);
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 120_000) {
    throw new Error("Invalid timeoutMs; expected an integer from 1 to 120000.");
  }
  const fetchImpl: OkxFetch = options.fetch ?? globalThis.fetch;
  const now = options.now ?? (() => new Date());
  const protocolIdsByChain = new Map<string, Set<string>>();

  async function request(method: "GET" | "POST", pathQuery: string, body?: string): Promise<unknown> {
    const timestamp = now();
    if (!(timestamp instanceof Date) || !Number.isFinite(timestamp.getTime())) {
      throw new Error("Invalid request clock.");
    }
    const timestampText = timestamp.toISOString();
    const signedMessage = `${timestampText}${method}${pathQuery}${body ?? ""}`;
    const signature = createHmac("sha256", options.credentials.secret).update(signedMessage).digest("base64");
    const headers: Record<string, string> = {
      "OK-ACCESS-KEY": options.credentials.apiKey,
      "OK-ACCESS-PASSPHRASE": options.credentials.passphrase,
      "OK-ACCESS-TIMESTAMP": timestampText,
      "OK-ACCESS-SIGN": signature,
    };
    if (body !== undefined) headers["Content-Type"] = "application/json";

    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeoutMarker = Symbol("request-timeout");
    const timeoutPromise = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(timeoutMarker);
      }, timeoutMs);
    });

    try {
      const fetchPromise = Promise.resolve().then(() => fetchImpl(`${API_ORIGIN}${pathQuery}`, {
        method,
        headers,
        redirect: "error",
        signal: controller.signal,
        ...(body === undefined ? {} : { body }),
      }));
      let response: Response;
      try {
        response = await Promise.race([fetchPromise, timeoutPromise]);
      } catch (error) {
        if (error === timeoutMarker) throw new Error("OKX request timed out.");
        throw new Error("OKX request failed.");
      }

      if (!response.ok) throw new Error(`OKX request failed with HTTP ${response.status}.`);
      let payload: unknown;
      try {
        payload = await Promise.race([response.json(), timeoutPromise]);
      } catch (error) {
        if (error === timeoutMarker) throw new Error("OKX request timed out.");
        throw new Error("OKX API returned invalid JSON.");
      }
      return parseEnvelope(payload);
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
  }

  const client: OkxReadOnlyClient = {
    async protocols() {
      const data = parseRecordArray(await request("GET", PROTOCOLS_PATH));
      const discovered = new Map<string, Set<string>>();
      for (const protocol of data) {
        if (
          typeof protocol.chainIndex !== "string" ||
          protocol.chainIndex.length === 0 ||
          typeof protocol.chainName !== "string" ||
          !Array.isArray(protocol.protocolList) ||
          !protocol.protocolList.every((item) =>
            isRecord(item) && typeof item.protocolId === "string" && typeof item.protocolName === "string",
          )
        ) {
          throw new Error("OKX API returned an unexpected response schema.");
        }
        discovered.set(
          protocol.chainIndex as string,
          new Set((protocol.protocolList as Record<string, unknown>[]).map((item) => item.protocolId as string)),
        );
      }
      protocolIdsByChain.clear();
      for (const [chainIndex, protocolIds] of discovered) protocolIdsByChain.set(chainIndex, protocolIds);
      return data;
    },
    async listMemePump(input) {
      const chainIndex = requireChainIndex(input.chainIndex);
      if (!MEME_STAGES.has(input.stage)) throw new Error("Invalid stage.");
      if (!Number.isInteger(input.limit) || input.limit < 1 || input.limit > 30) {
        throw new Error("Invalid limit; expected an integer from 1 to 30.");
      }

      let protocolIdList: string[] | undefined;
      if (input.protocolIdList !== undefined) {
        if (!Array.isArray(input.protocolIdList) || input.protocolIdList.length === 0) {
          throw new Error("Invalid protocolIdList.");
        }
        protocolIdList = input.protocolIdList.map((protocolId) => requireText(protocolId, "protocolIdList"));
        const discovered = protocolIdsByChain.get(chainIndex);
        if (!discovered || protocolIdList.some((protocolId) => !discovered.has(protocolId))) {
          throw new Error("protocolIdList must match protocols discovered for chainIndex.");
        }
      }

      const params = new URLSearchParams({ chainIndex, stage: input.stage });
      if (protocolIdList) params.set("protocolIdList", protocolIdList.join(","));
      const data = await request("GET", `${TOKEN_LIST_PATH}?${params.toString()}`);
      if (
        !isRecord(data) ||
        !(typeof data.cursor === "string" || data.cursor === null) ||
        !Array.isArray(data.items) ||
        !data.items.every(isRecord)
      ) {
        throw new Error("OKX API returned an unexpected response schema.");
      }
      return {
        cursor: typeof data.cursor === "string" && data.cursor.length > 0 ? data.cursor : null,
        items: (data.items as Record<string, unknown>[]).slice(0, input.limit),
      };
    },
    async prices(identities) {
      if (!Array.isArray(identities) || identities.length < 1 || identities.length > 30) {
        throw new Error("Invalid identities; expected an array with 1 to 30 tokens.");
      }
      const normalizedIdentities = identities.map(normalizeIdentity);
      const requestedIdentities = new Set(normalizedIdentities.map(identityKey));
      const body = JSON.stringify(normalizedIdentities);
      const data = parseRecordArray(await request("POST", PRICE_INFO_PATH, body));
      for (const price of data) {
        const responseIdentity = parseResponseIdentity(price.chainIndex, price.tokenContractAddress);
        if (!requestedIdentities.has(identityKey(responseIdentity))) {
          throw makeIdentityMismatchError("prices");
        }
      }
      return data;
    },
    async advanced(identity) {
      const requestIdentity = identityPath(ADVANCED_INFO_PATH, identity);
      const data = await request("GET", requestIdentity.pathQuery);
      if (!isRecord(data)) throw new Error("OKX API returned an unexpected response schema.");
      const responseIdentity = parseResponseIdentity(data.chainIndex, data.tokenContractAddress);
      if (identityKey(responseIdentity) !== identityKey(requestIdentity.identity)) {
        throw makeIdentityMismatchError("advanced");
      }
      return [data];
    },
    async pools(identity) {
      const requestIdentity = identityPath(TOP_LIQUIDITY_PATH, identity);
      const data = parseRecordArray(await request("GET", requestIdentity.pathQuery));
      for (const pool of data) {
        if (!Array.isArray(pool.liquidityAmount) || !pool.liquidityAmount.every(isRecord)) {
          throw new Error("OKX API returned an unexpected response schema.");
        }
        const poolIdentities = pool.liquidityAmount.map((asset) =>
          parseResponseIdentity(requestIdentity.identity.chainIndex, asset.tokenContractAddress),
        );
        if (!poolIdentities.some((poolIdentity) => identityKey(poolIdentity) === identityKey(requestIdentity.identity))) {
          throw makeIdentityMismatchError("pools");
        }
      }
      return data;
    },
  };
  Object.freeze(client);
  okxReadOnlyClients.add(client);
  return client;
}
