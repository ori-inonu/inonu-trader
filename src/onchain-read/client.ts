/**
 * Signed read-only OKX OnchainOS client (ONC-1, gateway doc §2 and §5). One global queue sends at most one
 * request per minIntervalMs (measured at dispatch); the provider message is never forwarded. Errors map to the
 * closed ONC-5 set. The api-budget ledger keeps the provider's verdicts across restarts: a 402 blocks the endpoint
 * until the next UTC month (the system never pays), and a 429/50011 cools it down with exponential backoff and
 * full jitter, never below Retry-After; the gateway then serves stale cache. The Date header of every response
 * measures the local clock skew; a skew of 10 s or more is applied to the signature timestamp, and a 50102 ("Timestamp
 * request expired") is retried once inside the same queue slot with the just-learned offset before the call
 * reports clock_skew.
 */
import { join } from "node:path";
import { signRequest } from "./sign";
import type { OnchainTier, ProviderRequest } from "./catalog";
import { createApiBudget, BudgetDenied, type ApiBudget, type BudgetRequest } from "../api-budget/gateway";
import { createBudgetRegistry } from "../api-budget/registry";
import { OKX_KEY_ENV, okxEntries, type OkxRegistryOptions } from "../api-budget/okx";
import type { DenyReason } from "../api-budget/limiter";
import { defaultLedgerPath } from "../api-budget/ledger";

export interface OkxCredentials {
  readonly apiKey: string;
  readonly secret: string;
  readonly passphrase: string;
}

export type ClientErrorCode =
  | "no_credentials" | "provider_unauthorized" | "provider_payment_required" | "rate_limited" | "provider_error"
  | "schema" | "clock_skew" | "unsupported_chain";

/** `extraDispatches` is present only when the call took more than one physical request (the 50102 retry): each one is a request the provider received, so the caller counts them all against the quota. */
export type ClientResult =
  | { readonly ok: true; readonly data: unknown; readonly sent: true; readonly extraDispatches?: number }
  | { readonly ok: false; readonly error: ClientErrorCode; readonly sent: boolean; readonly extraDispatches?: number };

export interface OnchainClientDeps {
  readonly credentials: () => OkxCredentials | null;
  readonly fetch: typeof fetch;
  readonly now: () => number;
  readonly minIntervalMs?: number;
  readonly timeoutMs?: number;
  readonly maxBytes?: number;
  /** Shared 402/429 state. Default: the api-budget ledger under the repo data directory. */
  readonly budget?: ApiBudget;
  /** Jitter source for the 429 backoff. Default Math.random. */
  readonly random?: () => number;
}

export interface ClientStatus {
  readonly lastCallMs: number | null;
  readonly lastCode: number | null;
  readonly cooldownUntilMs: number | null;
  /** Last raw clock skew measured from a response Date header, in ms (server minus local). Null before any response. */
  readonly clockOffsetMs: number | null;
}

const BASE = "https://web3.okx.com";
/** Provider codes: missing/invalid key, signature or passphrase, and the documented equivalents. */
const AUTH_CODES = new Set(["50103", "50104", "50105", "50111", "50112", "50113", "50114"]);
/** "Timestamp request expired": a local clock problem, not a credential problem. */
/** Client side pacing floor between two signed requests: a local policy, not a provider limit (the provider publishes no RPS for Market). */
export const DEFAULT_MIN_INTERVAL_MS = 1100;
const CLOCK_CODE = "50102";
/** HTTP 200 body code for a chain the endpoint does not serve. */
const UNSUPPORTED_CHAIN_CODE = "50038";
const RATE_CODES = new Set(["50011"]);
const OKX_KEY = OKX_KEY_ENV;
const DENIED: Record<DenyReason, ClientErrorCode> = { blocked_402: "provider_payment_required", expired: "provider_payment_required", cooldown_429: "rate_limited", budget: "rate_limited", reserved: "rate_limited" };

function sleep(ms: number): Promise<void> {
  const { promise, resolve } = Promise.withResolvers<void>();
  setTimeout(resolve, ms);
  return promise;
}

/** Retry-After (delta seconds) as ms; absent or unparsable is undefined. */
function retryAfterMs(res: Response): number | undefined {
  const raw = res.headers.get("retry-after");
  return raw !== null && Number.isFinite(Number(raw)) ? Number(raw) * 1000 : undefined;
}

interface Dispatch {
  n: number;
  retryAfterMs?: number;
}

/** The OKX budget: 402 blocks an endpoint until the next UTC month; 429/50011 cool it down with jittered backoff. Persisted in the ledger, so both survive restarts. */
/** Plan facts the owner can state without code: JEV_OKX_PLAN (free, starter, ...) and JEV_OKX_KEY_CREATED_AT (ISO date of the Trade key, which starts its 60 day Trial). Unset: Free plan, no known expiry. */
function planFromEnv(): OkxRegistryOptions {
  const created = Date.parse(process.env.JEV_OKX_KEY_CREATED_AT ?? "");
  return { ...(process.env.JEV_OKX_PLAN ? { plan: process.env.JEV_OKX_PLAN } : {}), ...(Number.isFinite(created) ? { tradeKeyCreatedAtMs: created } : {}) };
}

/** The OKX budget kept inside an app data directory (next to the monthly usage file), so no caller depends on git or on the working directory. */
export function okxBudgetIn(dataDir: string, now: () => number, random?: () => number): ApiBudget {
  return createOkxBudget({ ledgerPath: join(dataDir, "onchain", "api-budget-ledger.json"), now, ...(random === undefined ? {} : { random }) });
}

export function createOkxBudget(options: { readonly ledgerPath: string; readonly now: () => number; readonly random?: () => number; readonly plan?: OkxRegistryOptions }): ApiBudget {
  const registry = createBudgetRegistry(okxEntries(options.plan ?? planFromEnv()));
  return createApiBudget({ registry, ledgerPath: options.ledgerPath, now: options.now, sleep, random: options.random });
}

export interface OnchainClient {
  call(request: ProviderRequest, tier: OnchainTier): Promise<ClientResult>;
  status(): ClientStatus;
}

export function createOnchainClient(deps: OnchainClientDeps): OnchainClient {
  const minIntervalMs = deps.minIntervalMs ?? DEFAULT_MIN_INTERVAL_MS;
  const timeoutMs = deps.timeoutMs ?? 8000;
  const maxBytes = deps.maxBytes ?? 2_000_000;
  const budget = deps.budget ?? createOkxBudget({ ledgerPath: defaultLedgerPath(), now: deps.now, random: deps.random });
  let lastSentMs = -Infinity;
  let lastCallMs: number | null = null;
  let lastCode: number | null = null;
  let cooldownUntilMs = 0;
  /** Consecutive 429/50011 answers per endpoint: the backoff exponent. A success clears it. */
  const rateStreak = new Map<string, number>();
  /** Signing offset learned from response Date headers (server minus local). Only applied when the skew is real. */
  let offsetMs = 0;
  let clockOffsetMs: number | null = null;
  let queue: Promise<unknown> = Promise.resolve();

  /** The `code` field of a JSON error body, when the body parses. 401/403 answers carry it outside the data envelope. */
  function bodyCode(raw: string | null): string | null {
    if (raw === null) return null;
    try {
      const body = JSON.parse(raw) as { code?: unknown };
      return typeof body === "object" && body !== null && typeof body.code === "string" ? body.code : null;
    } catch {
      return null;
    }
  }

  /** One deadline covers fetch, body consumption and the optional clock retry. */
  async function send(request: ProviderRequest, cred: OkxCredentials, dispatched: Dispatch): Promise<ClientResult> {
    const controller = new AbortController();
    let timer!: ReturnType<typeof setTimeout>;
    const deadline = new Promise<ClientResult>((resolve) => {
      timer = setTimeout(() => {
        controller.abort();
        lastCallMs = deps.now();
        resolve({ ok: false, error: "provider_error", sent: true });
      }, timeoutMs);
    });
    try {
      return await Promise.race([sendBeforeDeadline(request, cred, controller.signal, dispatched), deadline]);
    } finally {
      clearTimeout(timer);
    }
  }

  async function sendBeforeDeadline(request: ProviderRequest, cred: OkxCredentials, signal: AbortSignal, dispatched: Dispatch): Promise<ClientResult> {
    const expired = (): ClientResult => ({ ok: false, error: "provider_error", sent: true });
    // A 50102 is retried exactly once, inside this queue slot, when the response itself teaches a new offset.
    for (let attempt = 0; attempt < 2; attempt += 1) {
      if (signal.aborted) return expired();
      const offsetUsed = offsetMs;
      const sentLocal = deps.now();
      const timestamp = new Date(sentLocal + offsetUsed).toISOString();
      const signature = signRequest(cred.secret, timestamp, request.method, request.path, request.body ?? "");
      let res: Response;
      try {
        const init: RequestInit = {
          method: request.method,
          headers: {
            "content-type": "application/json",
            "OK-ACCESS-KEY": cred.apiKey,
            "OK-ACCESS-SIGN": signature,
            "OK-ACCESS-TIMESTAMP": timestamp,
            "OK-ACCESS-PASSPHRASE": cred.passphrase,
          },
          body: request.body,
          redirect: "error",
          credentials: "omit",
          cache: "no-store",
          signal,
        };
        const url = BASE + request.path;
        const dispatch = deps.fetch.bind(deps);
        // Measure dispatch after synchronous preparation, including URL and transport lookup.
        lastSentMs = deps.now();
        dispatched.n += 1;
        res = await dispatch(url, init);
      } catch {
        if (signal.aborted) return expired();
        lastCallMs = deps.now();
        return { ok: false, error: "provider_error", sent: true };
      }
      if (signal.aborted) return expired();
      const recvLocal = deps.now();
      lastCallMs = recvLocal;
      lastCode = res.status;

      // The Date header (1 s resolution) measures the clock skew against the midpoint of the round trip.
      const headerMs = Date.parse(res.headers.get("date") ?? "");
      let learned = offsetUsed;
      let measured = false;
      if (Number.isFinite(headerMs)) {
        measured = true;
        const skew = headerMs - (sentLocal + recvLocal) / 2;
        clockOffsetMs = skew;
        learned = Math.abs(skew) >= 10_000 ? skew : 0;
        offsetMs = learned;
      }

      // Error statuses whose bodies can carry the clock code are read; others are not worth the bytes.
      if (res.status === 401 || res.status === 403) {
        let raw: string | null = null;
        try {
          raw = await res.text();
        } catch {
          raw = null;
        }
        if (signal.aborted) return expired();
        const code = bodyCode(raw);
        if (code === CLOCK_CODE) {
          if (attempt === 0 && measured && Math.abs(learned - offsetUsed) >= 5_000) continue;
          return { ok: false, error: "clock_skew", sent: true };
        }
        return { ok: false, error: "provider_unauthorized", sent: true };
      }
      if (res.status === 402) return { ok: false, error: "provider_payment_required", sent: true };
      if (res.status === 429) {
        dispatched.retryAfterMs = retryAfterMs(res);
        return { ok: false, error: "rate_limited", sent: true };
      }
      if (res.status >= 500 || !res.ok) return { ok: false, error: "provider_error", sent: true };
      let raw: string;
      try {
        raw = await res.text();
      } catch {
        return { ok: false, error: "provider_error", sent: true };
      }
      if (signal.aborted) return expired();
      if (new TextEncoder().encode(raw).length > maxBytes) return { ok: false, error: "provider_error", sent: true };
      let body: unknown;
      try {
        body = JSON.parse(raw);
      } catch {
        return { ok: false, error: "provider_error", sent: true };
      }
      const env = body as { code?: unknown; data?: unknown };
      if (typeof env !== "object" || env === null || typeof env.code !== "string" || !("data" in env)) {
        return { ok: false, error: "schema", sent: true };
      }
      lastCode = Number(env.code);
      if (env.code === "0") return { ok: true, data: env.data, sent: true };
      if (env.code === UNSUPPORTED_CHAIN_CODE) return { ok: false, error: "unsupported_chain", sent: true };
      if (AUTH_CODES.has(env.code)) return { ok: false, error: "provider_unauthorized", sent: true };
      if (RATE_CODES.has(env.code)) return { ok: false, error: "rate_limited", sent: true };
      return { ok: false, error: "provider_error", sent: true };
    }
    return { ok: false, error: "clock_skew", sent: true }; // unreachable: the second attempt never falls through
  }

  /** Persists the verdict of a call that reached the provider: 402 blocks the endpoint until the next UTC month; 429/50011 cool it down. */
  async function settle(target: BudgetRequest, r: ClientResult, dispatched: Dispatch): Promise<void> {
    if (r.ok) {
      rateStreak.delete(target.endpoint);
      return;
    }
    if (r.error === "provider_payment_required") {
      await budget.reject(target, 402);
    } else if (r.error === "rate_limited") {
      const attempt = rateStreak.get(target.endpoint) ?? 0;
      rateStreak.set(target.endpoint, attempt + 1);
      cooldownUntilMs = await budget.reject(target, 429, attempt, dispatched.retryAfterMs);
    }
  }

  function call(request: ProviderRequest): Promise<ClientResult> {
    const target: BudgetRequest = { module: "okx", endpoint: request.path.split("?")[0] ?? request.path, key: OKX_KEY };
    const result = queue.then(async (): Promise<ClientResult> => {
      const dispatched: Dispatch = { n: 0 };
      try {
        return await budget.run<ClientResult>(target, async () => {
          const wait = Math.max(0, lastSentMs + minIntervalMs / budget.scale(target) - deps.now());
          if (wait > 0) await sleep(wait);
          const cred = deps.credentials();
          if (cred === null) return { ok: false, error: "no_credentials", sent: false };
          const sent = await send(request, cred, dispatched);
          await settle(target, sent, dispatched);
          return dispatched.n > 1 ? { ...sent, extraDispatches: dispatched.n - 1 } : sent;
        });
      } catch (error) {
        if (error instanceof BudgetDenied) return { ok: false, error: DENIED[error.reason], sent: false };
        throw error;
      }
    });
    queue = result.then(() => undefined, () => undefined);
    return result;
  }

  return {
    call,
    status() {
      return { lastCallMs, lastCode, cooldownUntilMs: deps.now() < cooldownUntilMs ? cooldownUntilMs : null, clockOffsetMs };
    },
  };
}
