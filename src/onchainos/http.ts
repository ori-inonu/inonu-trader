/**
 * HTTP transport of the Onchain OS data layer: K4 signing, token bucket limiter, bounded retries, per call timeout,
 * strict envelope and per tier quota counters. Specification: docs/OKX-ONCHAINOS-DADOS-SPEC.md sections 4 and 5.
 *
 * Hard rules:
 *  - The network comes ONLY from the injected `fetch`. This file never touches the global `fetch`, the environment, the
 *    system clock or any file. Time and waiting come from the injected `now` and `sleep`.
 *  - Offline by default: a client sends only with valid credentials AND `allowNetwork: true`.
 *  - Credentials live in closures. No error, event, counter or property carries a credential, a signature, a header or a
 *    query string. The original exception of the `fetch` is never attached to an error.
 *  - Retries only for HTTP 429 and 5xx, bounded, with exponential backoff (full jitter when `random` is injected).
 *    No per call payment is ever made: a 402 blocks further calls until the next UTC month.
 */

import { createHmac } from "node:crypto";
import { OnchainosError, pathOnly, sanitizeProviderText, type OnchainosErrorKind } from "./errors.ts";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type Tier = "free" | "basic" | "premium" | "unknown" | "public";
export const TIERS: readonly Tier[] = Object.freeze(["free", "basic", "premium", "unknown", "public"] as const);
export type HttpMethod = "GET" | "POST";

export interface FetchInit {
  method: HttpMethod;
  headers: Record<string, string>;
  body?: string;
  signal: AbortSignal;
  redirect: "error";
  cache: "no-store";
}

export interface FetchResponseLike {
  readonly status: number;
  text(): Promise<string>;
}

/** The only door to the network. Always injected by the caller; a real `Response` satisfies it. */
export type FetchLike = (url: string, init: FetchInit) => Promise<FetchResponseLike>;

export interface OnchainosCredentials {
  readonly apiKey: string;
  readonly secretKey: string;
  readonly passphrase: string;
}

export interface EndpointRef {
  readonly path: string;
  readonly tier: Tier;
}

export type QueryInput = Readonly<Record<string, string | number | boolean | undefined>>;

export interface ReadMeta {
  readonly source: "onchainos-rest-v6" | "okx-public-v5";
  /** The request path without the query string. */
  readonly endpoint: string;
  readonly tier: Tier;
  readonly httpStatus: number;
  readonly attempts: number;
  /** Local clock before the first send. */
  readonly requestedAtMs: number;
  /** Local clock after the body was read: the instant the datum became knowable to us. */
  readonly receivedAtMs: number;
}

export interface HttpResult {
  readonly data: unknown;
  readonly meta: ReadMeta;
}

export interface CallEvent {
  readonly endpoint: string;
  readonly tier: Tier;
  readonly attempt: number;
  readonly status: number | null;
  readonly elapsedMs: number;
  readonly outcome: "ok" | "retry" | "error";
}

export interface GetPort {
  get(endpoint: EndpointRef, query?: QueryInput): Promise<HttpResult>;
}

export interface PostPort {
  post(endpoint: EndpointRef, body: unknown): Promise<HttpResult>;
}

export interface OnchainosHttp extends GetPort, PostPort {
  readonly quota: QuotaCounters;
  readonly info: HttpInfo;
}

export interface HttpInfo {
  readonly source: ReadMeta["source"];
  readonly origin: string;
  /** True when a request would actually be sent (credentials valid and allowNetwork true). */
  readonly ready: boolean;
  readonly requestsPerSecond: number;
  readonly burst: number;
  readonly timeoutMs: number;
  readonly maxRetries: number;
}

// ---------------------------------------------------------------------------
// Signing
// ---------------------------------------------------------------------------

export interface SignInput {
  secretKey: string;
  timestamp: string;
  method: HttpMethod;
  requestPath: string;
  body: string;
}

/** Base64(HMAC-SHA256(secret, timestamp + METHOD + requestPath + body)). requestPath includes the query for a GET. */
export function signRequest(input: SignInput): string {
  return createHmac("sha256", input.secretKey).update(`${input.timestamp}${input.method}${input.requestPath}${input.body}`).digest("base64");
}

const CREDENTIAL_PATTERN = /^[\x21-\x7e]{1,512}$/;

function validCredentials(value: OnchainosCredentials | undefined): value is OnchainosCredentials {
  return value !== undefined && [value.apiKey, value.secretKey, value.passphrase].every((part) => typeof part === "string" && CREDENTIAL_PATTERN.test(part));
}

// ---------------------------------------------------------------------------
// Token bucket
// ---------------------------------------------------------------------------

export interface TokenBucketOptions {
  /** Refill speed in requests per second, from 0.1 to 10. */
  ratePerSecond: number;
  /** Bucket size in requests, an integer from 1 to 10. */
  burst: number;
  now: () => number;
  sleep: (ms: number) => Promise<void>;
}

const RATE_LIMITS = Object.freeze({ min: 0.1, max: 10 });
const BURST_LIMITS = Object.freeze({ min: 1, max: 10 });

export class TokenBucket {
  private readonly rate: number;
  private readonly capacity: number;
  private readonly now: () => number;
  private readonly sleep: (ms: number) => Promise<void>;
  private tokens: number;
  private last: number;
  private tail: Promise<void> = Promise.resolve();

  constructor(options: TokenBucketOptions) {
    if (!Number.isFinite(options.ratePerSecond) || options.ratePerSecond < RATE_LIMITS.min || options.ratePerSecond > RATE_LIMITS.max) {
      throw new OnchainosError("invalid_request", `requestsPerSecond deve estar entre ${RATE_LIMITS.min} e ${RATE_LIMITS.max}`);
    }
    if (!Number.isInteger(options.burst) || options.burst < BURST_LIMITS.min || options.burst > BURST_LIMITS.max) {
      throw new OnchainosError("invalid_request", `burst deve ser um inteiro de ${BURST_LIMITS.min} a ${BURST_LIMITS.max}`);
    }
    this.rate = options.ratePerSecond;
    this.capacity = options.burst;
    this.now = options.now;
    this.sleep = options.sleep;
    this.tokens = options.burst;
    this.last = options.now();
  }

  /** Resolves when one request may be sent. Concurrent callers are served one at a time, in order. */
  acquire(): Promise<void> {
    const turn = this.tail.then(() => this.take());
    this.tail = turn.catch(() => undefined);
    return turn;
  }

  private refill(): void {
    const instant = this.now();
    const elapsed = instant - this.last;
    // A clock that goes backwards never grants tokens; it only moves the reference point.
    if (elapsed > 0) this.tokens = Math.min(this.capacity, this.tokens + (elapsed / 1000) * this.rate);
    this.last = instant;
  }

  private async take(): Promise<void> {
    for (;;) {
      this.refill();
      if (this.tokens >= 1 - 1e-9) {
        this.tokens -= 1;
        return;
      }
      await this.sleep(Math.max(1, Math.ceil(((1 - this.tokens) / this.rate) * 1000)));
    }
  }
}

// ---------------------------------------------------------------------------
// Quota counters
// ---------------------------------------------------------------------------

export interface QuotaSnapshot {
  /** Logical calls started (one per read, whatever the number of attempts). */
  calls: Record<Tier, number>;
  /** HTTP requests actually sent, retries included. Each one is counted as a consumed call (conservative). */
  attempts: Record<Tier, number>;
  retries: number;
  totalAttempts: number;
  /** False when at least one attempt went to an endpoint whose tier the documentation does not declare. */
  costKnown: boolean;
}

function zeroByTier(): Record<Tier, number> {
  return { free: 0, basic: 0, premium: 0, unknown: 0, public: 0 };
}

export class QuotaCounters {
  private readonly calls = zeroByTier();
  private readonly attempts = zeroByTier();
  private retries = 0;

  recordCall(tier: Tier): void {
    this.calls[tier] += 1;
  }

  recordAttempt(tier: Tier): void {
    this.attempts[tier] += 1;
  }

  recordRetry(): void {
    this.retries += 1;
  }

  snapshot(): QuotaSnapshot {
    const totalAttempts = TIERS.reduce((sum, tier) => sum + this.attempts[tier], 0);
    return { calls: { ...this.calls }, attempts: { ...this.attempts }, retries: this.retries, totalAttempts, costKnown: this.attempts.unknown === 0 };
  }
}

// ---------------------------------------------------------------------------
// Transport
// ---------------------------------------------------------------------------

export interface AuthResult {
  headers: Record<string, string>;
  /** Kept only to redact it from provider text. */
  signature: string;
}

export interface TransportConfig {
  readonly source: ReadMeta["source"];
  readonly origin: string;
  readonly pathPattern: RegExp;
  readonly fetch: FetchLike;
  readonly now: () => number;
  readonly sleep: (ms: number) => Promise<void>;
  readonly limiter: TokenBucket;
  readonly quota: QuotaCounters;
  readonly canSend: () => boolean;
  readonly offlineDetail: string;
  readonly authenticate?: (input: { method: HttpMethod; requestPath: string; body: string; timestamp: string }) => AuthResult;
  readonly secrets: readonly string[];
  readonly timeoutMs: number;
  readonly maxRetries: number;
  readonly backoffBaseMs: number;
  readonly backoffMaxMs: number;
  readonly random?: (() => number) | undefined;
  readonly maxResponseChars: number;
  readonly onCall?: ((event: CallEvent) => void) | undefined;
}

export interface Transport {
  request(method: HttpMethod, endpoint: EndpointRef, input?: { query?: QueryInput; body?: unknown }): Promise<HttpResult>;
}

const MAX_QUERY_VALUE = 2048;
const MAX_BODY_CHARS = 1_000_000;
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u001f\u007f]/;
const TIMEOUT_MARK = Symbol("timeout");

function buildQuery(query: QueryInput | undefined, endpoint: string): string {
  if (query === undefined) return "";
  const parts: string[] = [];
  for (const [name, value] of Object.entries(query)) {
    if (value === undefined) continue;
    const text = typeof value === "string" ? value : typeof value === "number" || typeof value === "boolean" ? String(value) : "";
    if ((typeof value !== "string" && typeof value !== "number" && typeof value !== "boolean") || (typeof value === "number" && !Number.isFinite(value))) {
      throw new OnchainosError("invalid_request", "valor de parâmetro de consulta inválido", { endpoint });
    }
    if (!/^[A-Za-z][A-Za-z0-9]{0,40}$/.test(name) || text.length > MAX_QUERY_VALUE || CONTROL.test(text)) {
      throw new OnchainosError("invalid_request", "parâmetro de consulta inválido", { endpoint });
    }
    parts.push(`${encodeURIComponent(name)}=${encodeURIComponent(text)}`);
  }
  return parts.length === 0 ? "" : `?${parts.join("&")}`;
}

function buildBody(body: unknown, endpoint: string): string {
  let text: string | undefined;
  try {
    text = JSON.stringify(body);
  } catch {
    text = undefined;
  }
  if (text === undefined || text.length > MAX_BODY_CHARS) throw new OnchainosError("invalid_request", "corpo da requisição inválido", { endpoint });
  return text;
}

/** Reads `code` and `msg` of an error body without trusting it. The body itself is never copied. */
function readProviderInfo(text: string, secrets: readonly string[]): { apiCode: string | null; providerMessage: string | null } {
  if (text.length === 0 || text.length > 20_000) return { apiCode: null, providerMessage: null };
  try {
    const parsed: unknown = JSON.parse(text);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return { apiCode: null, providerMessage: null };
    const record = parsed as Record<string, unknown>;
    const rawCode = record.code;
    const apiCode = (typeof rawCode === "string" || typeof rawCode === "number") && /^-?\d{1,12}$/.test(String(rawCode)) ? String(rawCode) : null;
    return { apiCode, providerMessage: sanitizeProviderText(record.msg, secrets) };
  } catch {
    return { apiCode: null, providerMessage: null };
  }
}

/** Start of the next UTC month: the instant a payment demand (402) stops blocking reads. */
export function nextUtcMonthMs(now: number): number {
  const date = new Date(now);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1);
}

/**
 * Full jitter backoff: a uniform draw in [0, min(maxMs, baseMs * 2^attempt)], never below the provider's Retry-After.
 * `rng` yields a value in [0, 1). Without an injected `random` the transport uses the ceiling itself: a deterministic schedule.
 */
export function backoffMs(attempt: number, retryAfterMs: number | undefined, rng: () => number, bounds: { baseMs: number; maxMs: number } = { baseMs: DEFAULTS.backoffBaseMs, maxMs: DEFAULTS.backoffMaxMs }): number {
  const ceiling = Math.min(bounds.maxMs, bounds.baseMs * 2 ** attempt);
  return Math.max(retryAfterMs ?? 0, Math.floor(rng() * ceiling));
}

export function createTransport(config: TransportConfig): Transport {
  // epoch ms until which every read is refused after a 402: a payment demand blocks until the next UTC month
  const paymentBlocked = new Map<string, number>();
  function emit(event: CallEvent): void {
    if (config.onCall === undefined) return;
    try {
      config.onCall(event);
    } catch {
      // an observer must never break a read
    }
  }

  async function send(
    method: HttpMethod,
    requestPath: string,
    body: string,
    endpoint: string,
  ): Promise<{ status: number; text: string; signature: string | null }> {
    const timestamp = new Date(config.now()).toISOString();
    const auth = config.authenticate?.({ method, requestPath, body, timestamp });
    const headers: Record<string, string> = { ...(auth?.headers ?? {}) };
    if (method === "POST") headers["Content-Type"] = "application/json";
    const controller = new AbortController();
    let timedOut = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => {
        timedOut = true;
        controller.abort();
        reject(TIMEOUT_MARK);
      }, config.timeoutMs);
    });
    deadline.catch(() => undefined);
    try {
      const response = await Promise.race([
        config.fetch(`${config.origin}${requestPath}`, { method, headers, ...(method === "POST" ? { body } : {}), signal: controller.signal, redirect: "error", cache: "no-store" }),
        deadline,
      ]);
      if (typeof response?.status !== "number" || !Number.isInteger(response.status)) throw new OnchainosError("schema", "resposta sem status HTTP válido", { endpoint });
      const text = await Promise.race([response.text(), deadline]);
      if (typeof text !== "string") throw new OnchainosError("schema", "corpo da resposta não é texto", { endpoint });
      return { status: response.status, text, signature: auth?.signature ?? null };
    } catch (error) {
      if (error instanceof OnchainosError) throw error;
      if (timedOut || error === TIMEOUT_MARK) throw new OnchainosError("timeout", `tempo esgotado após ${config.timeoutMs} ms`, { endpoint });
      throw new OnchainosError("network", "falha de rede ao chamar o endpoint", { endpoint });
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
  }

  function fail(kind: OnchainosErrorKind, detail: string, endpoint: string, extra: { httpStatus?: number; apiCode?: string | null; attempts: number; providerMessage?: string | null }): never {
    throw new OnchainosError(kind, detail, { endpoint, ...extra });
  }

  return {
    async request(method, endpoint, input = {}) {
      const path = endpoint.path;
      if (typeof path !== "string" || !config.pathPattern.test(path)) throw new OnchainosError("invalid_request", "caminho de endpoint inválido", { endpoint: typeof path === "string" ? path.slice(0, 120) : "" });
      if (!(TIERS as readonly string[]).includes(endpoint.tier)) throw new OnchainosError("invalid_request", "tier de endpoint inválido", { endpoint: path });
      const requestPath = `${path}${method === "GET" ? buildQuery(input.query, path) : ""}`;
      const body = method === "POST" ? buildBody(input.body, path) : "";
      if (!config.canSend()) throw new OnchainosError("offline", config.offlineDetail, { endpoint: path });
      if (config.now() < (paymentBlocked.get(path) ?? 0)) throw new OnchainosError("http", "pagamento exigido pelo provedor: chamadas bloqueadas até o próximo mês UTC", { endpoint: path, httpStatus: 402 });

      config.quota.recordCall(endpoint.tier);
      const requestedAtMs = config.now();
      for (let index = 0; ; index += 1) {
        await config.limiter.acquire();
        config.quota.recordAttempt(endpoint.tier);
        const startedAtMs = config.now();
        const attempts = index + 1;
        let outcome: { status: number; text: string; signature: string | null };
        try {
          outcome = await send(method, requestPath, body, path);
        } catch (error) {
          emit({ endpoint: pathOnly(path), tier: endpoint.tier, attempt: attempts, status: null, elapsedMs: Math.max(0, config.now() - startedAtMs), outcome: "error" });
          if (error instanceof OnchainosError) throw new OnchainosError(error.kind, error.detail, { endpoint: path, attempts, rowIndex: error.rowIndex });
          throw new OnchainosError("network", "falha de rede ao chamar o endpoint", { endpoint: path, attempts });
        }
        const { status, text, signature } = outcome;
        const secrets = signature === null ? config.secrets : [...config.secrets, signature];
        const retryable = status === 429 || status >= 500;
        const elapsedMs = Math.max(0, config.now() - startedAtMs);

        if (retryable && index < config.maxRetries) {
          emit({ endpoint: pathOnly(path), tier: endpoint.tier, attempt: attempts, status, elapsedMs, outcome: "retry" });
          config.quota.recordRetry();
          await config.sleep(backoffMs(index, undefined, config.random ?? (() => 1), { baseMs: config.backoffBaseMs, maxMs: config.backoffMaxMs }));
          continue;
        }
        if (status < 200 || status >= 300) {
          if (status === 402) paymentBlocked.set(path, nextUtcMonthMs(config.now()));
          emit({ endpoint: pathOnly(path), tier: endpoint.tier, attempt: attempts, status, elapsedMs, outcome: "error" });
          const info = readProviderInfo(text, secrets);
          const kind: OnchainosErrorKind = status === 429 ? "rate_limited" : "http";
          return fail(kind, status === 429 ? "limite de taxa do provedor" : status === 402 ? "pagamento exigido pelo provedor" : "resposta HTTP não bem sucedida", path, { httpStatus: status, apiCode: info.apiCode, attempts, providerMessage: info.providerMessage });
        }
        if (text.length > config.maxResponseChars) {
          emit({ endpoint: pathOnly(path), tier: endpoint.tier, attempt: attempts, status, elapsedMs, outcome: "error" });
          return fail("too_large", `resposta acima de ${config.maxResponseChars} caracteres`, path, { httpStatus: status, attempts });
        }
        let parsed: unknown;
        try {
          parsed = JSON.parse(text);
        } catch {
          emit({ endpoint: pathOnly(path), tier: endpoint.tier, attempt: attempts, status, elapsedMs, outcome: "error" });
          return fail("schema", "a resposta não é JSON válido", path, { httpStatus: status, attempts });
        }
        if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
          emit({ endpoint: pathOnly(path), tier: endpoint.tier, attempt: attempts, status, elapsedMs, outcome: "error" });
          return fail("schema", "o envelope da resposta não é um objeto", path, { httpStatus: status, attempts });
        }
        const record = parsed as Record<string, unknown>;
        const code = record.code;
        if ((typeof code !== "string" && typeof code !== "number") || !Object.hasOwn(record, "data")) {
          emit({ endpoint: pathOnly(path), tier: endpoint.tier, attempt: attempts, status, elapsedMs, outcome: "error" });
          return fail("schema", "envelope sem os campos code e data no formato esperado", path, { httpStatus: status, attempts });
        }
        if (String(code) !== "0") {
          emit({ endpoint: pathOnly(path), tier: endpoint.tier, attempt: attempts, status, elapsedMs, outcome: "error" });
          const info = readProviderInfo(text, secrets);
          return fail("api", "a OKX respondeu com código de erro", path, { httpStatus: status, apiCode: info.apiCode, attempts, providerMessage: info.providerMessage });
        }
        emit({ endpoint: pathOnly(path), tier: endpoint.tier, attempt: attempts, status, elapsedMs, outcome: "ok" });
        return {
          data: record.data,
          meta: { source: config.source, endpoint: pathOnly(path), tier: endpoint.tier, httpStatus: status, attempts, requestedAtMs, receivedAtMs: config.now() },
        };
      }
    },
  };
}

// ---------------------------------------------------------------------------
// Authenticated client for https://web3.okx.com (Onchain OS REST v6)
// ---------------------------------------------------------------------------

export interface HttpTuning {
  requestsPerSecond?: number;
  burst?: number;
  timeoutMs?: number;
  maxRetries?: number;
  backoffBaseMs?: number;
  backoffMaxMs?: number;
  maxResponseChars?: number;
  quota?: QuotaCounters;
  onCall?: (event: CallEvent) => void;
}

export interface OnchainosHttpOptions extends HttpTuning {
  /** Always injected. The global fetch is never used. */
  fetch: FetchLike;
  now: () => number;
  sleep: (ms: number) => Promise<void>;
  /** Source of the backoff jitter. Absent: the deterministic ceiling, no randomness. */
  random?: () => number;
  credentials?: OnchainosCredentials | undefined;
  /** Must be exactly `true`, together with valid credentials, for anything to be sent. */
  allowNetwork?: boolean;
  /** Scheme and host only. Defaults to https://web3.okx.com. */
  origin?: string;
}

export const DEFAULT_ONCHAINOS_ORIGIN = "https://web3.okx.com";
export const ONCHAINOS_PATH_PATTERN = /^\/api\/v6(?:\/[A-Za-z0-9_-]+)+$/;

const DEFAULTS = Object.freeze({ requestsPerSecond: 1, burst: 1, timeoutMs: 10_000, maxRetries: 2, backoffBaseMs: 1000, backoffMaxMs: 8000, maxResponseChars: 2_000_000 });
const TIMEOUT_LIMITS = Object.freeze({ min: 1, max: 60_000 });
const MAX_RETRIES_CEILING = 5;

/** Validates and completes the tuning shared by the authenticated and the public client. */
export function resolveTuning(options: HttpTuning, maxRate: number): Required<Omit<HttpTuning, "quota" | "onCall">> {
  const tuning = {
    requestsPerSecond: options.requestsPerSecond ?? DEFAULTS.requestsPerSecond,
    burst: options.burst ?? DEFAULTS.burst,
    timeoutMs: options.timeoutMs ?? DEFAULTS.timeoutMs,
    maxRetries: options.maxRetries ?? DEFAULTS.maxRetries,
    backoffBaseMs: options.backoffBaseMs ?? DEFAULTS.backoffBaseMs,
    backoffMaxMs: options.backoffMaxMs ?? DEFAULTS.backoffMaxMs,
    maxResponseChars: options.maxResponseChars ?? DEFAULTS.maxResponseChars,
  };
  const invalid = (what: string): never => {
    throw new OnchainosError("invalid_request", `${what} fora da faixa permitida`);
  };
  if (!Number.isFinite(tuning.requestsPerSecond) || tuning.requestsPerSecond < RATE_LIMITS.min || tuning.requestsPerSecond > maxRate) invalid("requestsPerSecond");
  if (!Number.isInteger(tuning.timeoutMs) || tuning.timeoutMs < TIMEOUT_LIMITS.min || tuning.timeoutMs > TIMEOUT_LIMITS.max) invalid("timeoutMs");
  if (!Number.isInteger(tuning.maxRetries) || tuning.maxRetries < 0 || tuning.maxRetries > MAX_RETRIES_CEILING) invalid("maxRetries");
  if (!Number.isInteger(tuning.backoffBaseMs) || tuning.backoffBaseMs < 1 || tuning.backoffBaseMs > 60_000) invalid("backoffBaseMs");
  if (!Number.isInteger(tuning.backoffMaxMs) || tuning.backoffMaxMs < tuning.backoffBaseMs || tuning.backoffMaxMs > 120_000) invalid("backoffMaxMs");
  if (!Number.isInteger(tuning.maxResponseChars) || tuning.maxResponseChars < 100 || tuning.maxResponseChars > 20_000_000) invalid("maxResponseChars");
  return tuning;
}

export function validateOrigin(origin: string): string {
  if (!/^https:\/\/[a-z0-9.-]+$/.test(origin)) throw new OnchainosError("invalid_request", "origin deve ser https://host, sem caminho, credenciais ou consulta");
  return origin;
}

export function createOnchainosHttp(options: OnchainosHttpOptions): OnchainosHttp {
  const credentials = options.credentials;
  if (credentials !== undefined && !validCredentials(credentials)) {
    throw new OnchainosError("invalid_request", "credenciais malformadas: use texto ASCII imprimível, sem espaço, de 1 a 512 caracteres");
  }
  const origin = validateOrigin(options.origin ?? DEFAULT_ONCHAINOS_ORIGIN);
  const tuning = resolveTuning(options, RATE_LIMITS.max);
  const limiter = new TokenBucket({ ratePerSecond: tuning.requestsPerSecond, burst: tuning.burst, now: options.now, sleep: options.sleep });
  const quota = options.quota ?? new QuotaCounters();
  const ready = credentials !== undefined && options.allowNetwork === true;

  // Copies into closures: later mutation of the caller's object cannot change what is signed.
  const apiKey = credentials?.apiKey ?? "";
  const secretKey = credentials?.secretKey ?? "";
  const passphrase = credentials?.passphrase ?? "";

  const transport = createTransport({
    source: "onchainos-rest-v6",
    origin,
    pathPattern: ONCHAINOS_PATH_PATTERN,
    fetch: options.fetch,
    now: options.now,
    sleep: options.sleep,
    random: options.random,
    limiter,
    quota,
    canSend: () => ready,
    offlineDetail: "cliente offline: faltam credenciais válidas ou allowNetwork true; nada foi enviado",
    authenticate: ({ method, requestPath, body, timestamp }) => {
      const signature = signRequest({ secretKey, timestamp, method, requestPath, body });
      return {
        signature,
        headers: { "OK-ACCESS-KEY": apiKey, "OK-ACCESS-SIGN": signature, "OK-ACCESS-TIMESTAMP": timestamp, "OK-ACCESS-PASSPHRASE": passphrase },
      };
    },
    secrets: [apiKey, secretKey, passphrase].filter((value) => value.length > 0),
    timeoutMs: tuning.timeoutMs,
    maxRetries: tuning.maxRetries,
    backoffBaseMs: tuning.backoffBaseMs,
    backoffMaxMs: tuning.backoffMaxMs,
    maxResponseChars: tuning.maxResponseChars,
    onCall: options.onCall,
  });

  const info: HttpInfo = Object.freeze({
    source: "onchainos-rest-v6" as const,
    origin,
    ready,
    requestsPerSecond: tuning.requestsPerSecond,
    burst: tuning.burst,
    timeoutMs: tuning.timeoutMs,
    maxRetries: tuning.maxRetries,
  });

  return Object.freeze({
    get: (endpoint: EndpointRef, query?: QueryInput) => transport.request("GET", endpoint, query === undefined ? {} : { query }),
    post: (endpoint: EndpointRef, body: unknown) => transport.request("POST", endpoint, { body }),
    quota,
    info,
  });
}
