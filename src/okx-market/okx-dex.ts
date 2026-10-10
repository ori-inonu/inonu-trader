import { createHmac } from "node:crypto";
import { normalizeTokenAddress } from "./token-identity";

const API_ORIGIN = "https://web3.okx.com";
const SUPPORTED_CHAIN_PATH = "/api/v6/dex/aggregator/supported/chain";
const QUOTE_PATH = "/api/v6/dex/aggregator/quote";
const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_MIN_REQUEST_INTERVAL_MS = 1_100;
const MAX_TIMEOUT_MS = 120_000;
const readOnlyAdapterClients = new WeakSet<object>();

export interface OkxDexCredentials {
  apiKey: string;
  secret: string;
  passphrase: string;
}

type OkxFetch = (
  input: Parameters<typeof globalThis.fetch>[0],
  init?: Parameters<typeof globalThis.fetch>[1],
) => ReturnType<typeof globalThis.fetch>;

export interface OkxDexReadOnlyClientOptions {
  credentials: OkxDexCredentials;
  fetch?: OkxFetch;
  now?: () => Date;
  timeoutMs?: number;
  minRequestIntervalMs?: number;
  wait?: (ms: number) => Promise<void>;
}

export interface OkxDexQuoteInput {
  chainIndex: string;
  fromTokenAddress: string;
  toTokenAddress: string;
  amount: string;
  priceImpactProtectionPercent: number;
}

export interface OkxDexReadOnlyClient {
  supportedChain(chainIndex: string): Promise<Record<string, unknown>[]>;
  quote(input: OkxDexQuoteInput): Promise<Record<string, unknown>[]>;
}

/** Identifies only the exact frozen adapter object; this does not prove remote authentication or access. */
export function isOkxDexReadOnlyClient(value: unknown): value is OkxDexReadOnlyClient {
  return typeof value === "object" && value !== null && readOnlyAdapterClients.has(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireCredential(value: unknown): asserts value is string {
  if (
    typeof value !== "string" ||
    value.trim().length === 0 ||
    /[\u0000-\u001f\u007f]/u.test(value)
  ) {
    throw new Error("Invalid API credentials.");
  }
}

function validateCredentials(credentials: unknown): asserts credentials is OkxDexCredentials {
  if (!isRecord(credentials)) throw new Error("Invalid API credentials.");
  requireCredential(credentials.apiKey);
  requireCredential(credentials.secret);
  requireCredential(credentials.passphrase);
}

function requireChainIndex(value: unknown): string {
  if (typeof value !== "string" || !/^[1-9]\d*$/.test(value)) {
    throw new Error("Invalid chainIndex.");
  }
  return value;
}

function normalizeAddress(chainIndex: string, value: unknown, field: string): string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.trim() !== value ||
    /[\s,\u0000-\u001f\u007f]/u.test(value)
  ) {
    throw new Error(`Invalid ${field}.`);
  }
  return normalizeTokenAddress(chainIndex, value);
}

function validateAmount(value: unknown): string {
  if (typeof value !== "string" || !/^[1-9]\d{0,77}$/.test(value)) {
    throw new Error("Invalid amount; expected a positive atomic integer of at most 78 digits.");
  }
  return value;
}

function validateProtectionPercent(value: unknown): string {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value >= 100) {
    throw new Error("Invalid priceImpactProtectionPercent; expected a finite value from 0 up to but excluding 100.");
  }
  return String(value);
}

function readClock(now: () => Date): Date {
  let value: Date;
  try {
    value = now();
  } catch {
    throw new Error("Invalid request clock.");
  }
  if (!(value instanceof Date) || !Number.isFinite(value.getTime()) || value.getTime() <= 0) {
    throw new Error("Invalid request clock.");
  }
  return new Date(value.getTime());
}

function validateTimeout(timeoutMs: number): void {
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > MAX_TIMEOUT_MS) {
    throw new Error("Invalid timeoutMs; expected an integer from 1 to 120000.");
  }
}

function validateRequestInterval(minRequestIntervalMs: number): void {
  if (!Number.isInteger(minRequestIntervalMs) || minRequestIntervalMs < 0 || minRequestIntervalMs > MAX_TIMEOUT_MS) {
    throw new Error("Invalid minRequestIntervalMs; expected an integer from 0 to 120000.");
  }
}

function parseEnvelope(value: unknown): Record<string, unknown>[] {
  if (!isRecord(value) || typeof value.code !== "string" || typeof value.msg !== "string" || !("data" in value)) {
    throw new Error("OKX API returned an unexpected response schema.");
  }
  if (value.code !== "0") throw new Error("OKX API returned a non-zero response code.");
  if (!Array.isArray(value.data) || !value.data.every(isRecord)) {
    throw new Error("OKX API returned an unexpected response schema.");
  }
  return value.data;
}

type RequestFailure =
  | { kind: "fetch"; stage: "fetch" | "json" }
  | { kind: "http"; status: number };

const internalRequestFailures = new WeakMap<object, RequestFailure>();

function makeRequestFailure(failure: RequestFailure): Error {
  const error = new Error(failure.kind === "http" ? "http" : failure.stage);
  internalRequestFailures.set(error, failure);
  return error;
}

function getInternalRequestFailure(error: unknown): RequestFailure | undefined {
  if ((typeof error !== "object" && typeof error !== "function") || error === null) return undefined;
  return internalRequestFailures.get(error);
}

function makeFetchFailure(stage: "fetch" | "json"): Error {
  return makeRequestFailure({ kind: "fetch", stage });
}

function makeHttpFailure(status: number): Error {
  return makeRequestFailure({ kind: "http", status });
}

export function createOkxDexReadOnlyClient(options: OkxDexReadOnlyClientOptions): OkxDexReadOnlyClient {
  if (!isRecord(options)) throw new Error("Invalid client options.");
  validateCredentials(options.credentials);

  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  validateTimeout(timeoutMs);
  const minRequestIntervalMs = options.minRequestIntervalMs ?? DEFAULT_MIN_REQUEST_INTERVAL_MS;
  validateRequestInterval(minRequestIntervalMs);

  if (options.fetch !== undefined && typeof options.fetch !== "function") {
    throw new Error("Invalid fetch implementation.");
  }
  if (options.now !== undefined && typeof options.now !== "function") {
    throw new Error("Invalid request clock.");
  }
  if (options.wait !== undefined && typeof options.wait !== "function") {
    throw new Error("Invalid wait implementation.");
  }

  const fetchImpl: OkxFetch = options.fetch ?? globalThis.fetch;
  const now = options.now ?? (() => new Date());
  const wait = options.wait ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));

  let startQueue: Promise<void> = Promise.resolve();
  let nextStartAtMs: number | null = null;
  let lastClockMs: number | null = null;

  async function reserveStart<T>(onStart: (timestamp: Date) => T): Promise<T> {
    let unlock: () => void = () => {};
    const previous = startQueue;
    startQueue = new Promise<void>((resolve) => {
      unlock = resolve;
    });
    await previous;

    try {
      let timestamp = readClock(now);
      let timestampMs = timestamp.getTime();
      if (lastClockMs !== null && timestampMs < lastClockMs) {
        throw new Error("Invalid request clock.");
      }

      const delayMs = nextStartAtMs === null ? 0 : Math.max(0, nextStartAtMs - timestampMs);
      if (delayMs > 0) {
        try {
          await wait(delayMs);
        } catch {
          throw new Error("OKX request scheduling failed.");
        }
        timestamp = readClock(now);
        timestampMs = timestamp.getTime();
        if (timestampMs < (lastClockMs ?? 0)) throw new Error("Invalid request clock.");
        if (nextStartAtMs !== null && timestampMs < nextStartAtMs) {
          throw new Error("OKX request scheduling failed.");
        }
      }

      const startAtMs = Math.max(timestampMs, nextStartAtMs ?? timestampMs);
      const result = onStart(timestamp);
      nextStartAtMs = startAtMs + minRequestIntervalMs;
      lastClockMs = timestampMs;
      return result;
    } finally {
      unlock();
    }
  }

  async function request(pathQuery: string): Promise<Record<string, unknown>[]> {
    const exchange = await reserveStart((timestamp) => {
      let timestampText: string;
      try {
        timestampText = timestamp.toISOString();
      } catch {
        throw new Error("Invalid request clock.");
      }

      let signature: string;
      try {
        const signedMessage = `${timestampText}GET${pathQuery}`;
        signature = createHmac("sha256", options.credentials.secret).update(signedMessage).digest("base64");
      } catch {
        throw new Error("Could not sign OKX request.");
      }

      const headers: Record<string, string> = {
        "OK-ACCESS-KEY": options.credentials.apiKey,
        "OK-ACCESS-PASSPHRASE": options.credentials.passphrase,
        "OK-ACCESS-TIMESTAMP": timestampText,
        "OK-ACCESS-SIGN": signature,
      };
      const controller = new AbortController();
      const timeoutMarker = Symbol("request-timeout");
      let timer: ReturnType<typeof setTimeout> | undefined;
      const timeoutPromise = new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(timeoutMarker);
        }, timeoutMs);
      });

      let operation: Promise<unknown>;
      try {
        const fetchResult = fetchImpl(`${API_ORIGIN}${pathQuery}`, {
          method: "GET",
          headers,
          redirect: "error",
          signal: controller.signal,
        });
        operation = Promise.resolve(fetchResult)
          .then(async (response) => {
            if (!response.ok) {
              const status = response.status;
              if (typeof status !== "number" || !Number.isInteger(status) || status < 100 || status > 599) {
                throw makeFetchFailure("fetch");
              }
              throw makeHttpFailure(status);
            }
            try {
              return await response.json();
            } catch {
              throw makeFetchFailure("json");
            }
          })
          .catch((error: unknown) => {
            if (getInternalRequestFailure(error) !== undefined) throw error;
            throw makeFetchFailure("fetch");
          });
      } catch {
        operation = Promise.reject(makeFetchFailure("fetch"));
      }

      return { operation, timeoutPromise, timeoutMarker, timer };
    });

    let payload: unknown;
    try {
      payload = await Promise.race([exchange.operation, exchange.timeoutPromise]);
    } catch (error) {
      if (error === exchange.timeoutMarker) throw new Error("OKX request timed out.");
      const failure = getInternalRequestFailure(error);
      if (failure?.kind === "http") throw new Error(`OKX request failed with HTTP ${failure.status}.`);
      if (failure?.kind === "fetch" && failure.stage === "json") {
        throw new Error("OKX API returned invalid JSON.");
      }
      throw new Error("OKX request failed.");
    } finally {
      if (exchange.timer !== undefined) clearTimeout(exchange.timer);
    }

    return parseEnvelope(payload);
  }

  const client: OkxDexReadOnlyClient = {
    async supportedChain(chainIndex: string) {
      const normalizedChainIndex = requireChainIndex(chainIndex);
      const params = new URLSearchParams({ chainIndex: normalizedChainIndex });
      return request(`${SUPPORTED_CHAIN_PATH}?${params.toString()}`);
    },
    async quote(input: OkxDexQuoteInput) {
      if (!isRecord(input)) throw new Error("Invalid quote input.");
      const chainIndex = requireChainIndex(input.chainIndex);
      const fromTokenAddress = normalizeAddress(chainIndex, input.fromTokenAddress, "fromTokenAddress");
      const toTokenAddress = normalizeAddress(chainIndex, input.toTokenAddress, "toTokenAddress");
      if (fromTokenAddress === toTokenAddress) throw new Error("Quote token addresses must be distinct.");
      const amount = validateAmount(input.amount);
      const priceImpactProtectionPercent = validateProtectionPercent(input.priceImpactProtectionPercent);
      const params = new URLSearchParams();
      params.set("chainIndex", chainIndex);
      params.set("amount", amount);
      params.set("fromTokenAddress", fromTokenAddress);
      params.set("toTokenAddress", toTokenAddress);
      params.set("swapMode", "exactIn");
      params.set("singleRouteOnly", "true");
      params.set("priceImpactProtectionPercent", priceImpactProtectionPercent);
      return request(`${QUOTE_PATH}?${params.toString()}`);
    },
  };
  Object.freeze(client);
  readOnlyAdapterClients.add(client);
  return client;
}
