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

export type DispatchAdmission =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: "budget_exhausted" | "pace_limited" };

export type ClientErrorCode =
  | "no_credentials" | "provider_unauthorized" | "provider_payment_required" | "rate_limited" | "provider_error"
  | "schema" | "clock_skew" | "unsupported_chain" | "budget_exhausted" | "pace_limited";

export type ClientResult =
  | { readonly ok: true; readonly data: unknown; readonly sent: true }
  | { readonly ok: false; readonly error: ClientErrorCode; readonly sent: boolean };

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

/** Resolves after `ms`, or as soon as `signal` aborts, so a call past its deadline does not wait out a pacing sleep. */
function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  const { promise, resolve } = Promise.withResolvers<void>();
  let timer!: ReturnType<typeof setTimeout>;
  const finish = () => {
    clearTimeout(timer);
    signal?.removeEventListener("abort", finish);
    resolve();
  };
  timer = setTimeout(finish, ms);
  signal?.addEventListener("abort", finish, { once: true });
  if (signal?.aborted) finish();
  return promise;
}

/** The longest Retry-After the ledger will keep: a bad value must not wedge the pool until someone edits the ledger by hand. */
const RETRY_AFTER_MAX_MS = 3_600_000;

/** Retry-After (delta seconds) as ms, at most one hour; absent, negative or unparsable is undefined. */
function retryAfterMs(res: Response): number | undefined {
  const raw = res.headers.get("retry-after")?.trim();
  const seconds = raw === undefined || raw === "" ? Number.NaN : Number(raw);
  return Number.isFinite(seconds) && seconds >= 0 ? Math.min(seconds * 1000, RETRY_AFTER_MAX_MS) : undefined;
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
  call(request: ProviderRequest, tier: OnchainTier, admitDispatch: () => DispatchAdmission): Promise<ClientResult>;
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
  async function send(
    request: ProviderRequest,
    cred: OkxCredentials,
    admitDispatch: () => DispatchAdmission,
    dispatched: Dispatch,
  ): Promise<ClientResult> {
    const controller = new AbortController();
    const deadlineAt = performance.now() + timeoutMs;
    let timer!: ReturnType<typeof setTimeout>;
    const { promise: deadline, resolve: resolveDeadline } = Promise.withResolvers<ClientResult>();
    timer = setTimeout(() => {
      controller.abort();
      lastCallMs = deps.now();
      resolveDeadline({ ok: false, error: "provider_error", sent: dispatched.n > 0 });
    }, timeoutMs);
    try {
      return await Promise.race([
        sendBeforeDeadline(request, cred, admitDispatch, controller, deadlineAt, dispatched),
        deadline,
      ]);
    } finally {
      clearTimeout(timer);
    }
  }

  async function sendBeforeDeadline(
    request: ProviderRequest,
    cred: OkxCredentials,
    admitDispatch: () => DispatchAdmission,
    controller: AbortController,
    deadlineAt: number,
    dispatched: Dispatch,
  ): Promise<ClientResult> {
    const { signal } = controller;
    const expired = (): ClientResult => ({ ok: false, error: "provider_error", sent: dispatched.n > 0 });
    const isAbortedOrTimedOut = (): boolean => {
      if (signal.aborted) return true;
      if (performance.now() < deadlineAt) return false;
      controller.abort();
      return true;
    };

    // A 50102 is retried exactly once, inside this queue slot, when the response itself teaches a new offset.
    for (let attempt = 0; attempt < 2; attempt += 1) {
      if (isAbortedOrTimedOut()) return expired();
      if (attempt > 0) {
        const wait = Math.max(0, lastSentMs + minIntervalMs - deps.now());
        if (wait > 0) await sleep(wait, signal);
        if (isAbortedOrTimedOut()) return expired();
      }
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
        if (isAbortedOrTimedOut()) return expired();
        const admission = admitDispatch();
        if (!admission.ok) return { ok: false, error: admission.reason, sent: dispatched.n > 0 };
        lastSentMs = deps.now();
        dispatched.n += 1;
        res = await dispatch(url, init);
      } catch {
        if (isAbortedOrTimedOut()) return expired();
        lastCallMs = deps.now();
        return { ok: false, error: "provider_error", sent: dispatched.n > 0 };
      }
      if (isAbortedOrTimedOut()) return expired();
      const recvLocal = deps.now();

      // The Date header (1 s resolution) measures the clock skew against the midpoint of the round trip.
      const headerMs = Date.parse(res.headers.get("date") ?? "");
      let learned = offsetUsed;
      let skew: number | null = null;
      if (Number.isFinite(headerMs)) {
        skew = headerMs - (sentLocal + recvLocal) / 2;
        learned = Math.abs(skew) >= 10_000 ? skew : 0;
      }
      const recordResponse = (): boolean => {
        if (isAbortedOrTimedOut()) return false;
        lastCallMs = recvLocal;
        lastCode = res.status;
        if (skew !== null) {
          clockOffsetMs = skew;
          offsetMs = learned;
        }
        return true;
      };
      const responseResult = (result: ClientResult): ClientResult =>
        recordResponse() ? result : expired();

      // Error statuses whose bodies can carry the clock code are read; others are not worth the bytes.
      if (res.status === 401 || res.status === 403) {
        let raw: string | null = null;
        try {
          raw = await res.text();
        } catch {
          raw = null;
        }
        if (isAbortedOrTimedOut()) return expired();
        const code = bodyCode(raw);
        if (isAbortedOrTimedOut()) return expired();
        if (code === CLOCK_CODE) {
          if (attempt === 0 && skew !== null && Math.abs(learned - offsetUsed) >= 5_000) {
            if (!recordResponse()) return expired();
            continue;
          }
          return responseResult({ ok: false, error: "clock_skew", sent: true });
        }
        return responseResult({ ok: false, error: "provider_unauthorized", sent: true });
      }
      if (res.status === 402) return responseResult({ ok: false, error: "provider_payment_required", sent: true });
      if (res.status === 429) {
        if (!recordResponse()) return expired();
        dispatched.retryAfterMs = retryAfterMs(res);
        return { ok: false, error: "rate_limited", sent: true };
      }
      if (res.status >= 500 || !res.ok) return responseResult({ ok: false, error: "provider_error", sent: true });
      let raw: string;
      try {
        raw = await res.text();
      } catch {
        if (isAbortedOrTimedOut()) return expired();
        return responseResult({ ok: false, error: "provider_error", sent: true });
      }
      if (isAbortedOrTimedOut()) return expired();
      if (new TextEncoder().encode(raw).length > maxBytes) {
        return responseResult({ ok: false, error: "provider_error", sent: true });
      }
      let body: unknown;
      try {
        body = JSON.parse(raw);
      } catch {
        if (isAbortedOrTimedOut()) return expired();
        return responseResult({ ok: false, error: "provider_error", sent: true });
      }
      if (isAbortedOrTimedOut()) return expired();
      const env = body as { code?: unknown; data?: unknown };
      if (typeof env !== "object" || env === null || typeof env.code !== "string" || !("data" in env)) {
        return responseResult({ ok: false, error: "schema", sent: true });
      }
      if (!recordResponse()) return expired();
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

  /** `admitDispatch` is the caller's own quota gate: asked right before each physical request (the 50102 retry included); a refusal sends nothing. */
  function call(request: ProviderRequest, _tier: OnchainTier, admitDispatch: () => DispatchAdmission): Promise<ClientResult> {
    const target: BudgetRequest = { module: "okx", endpoint: request.path.split("?")[0] ?? request.path, key: OKX_KEY };
    const result = queue.then(async (): Promise<ClientResult> => {
      const dispatched: Dispatch = { n: 0 };
      try {
        return await budget.run<ClientResult>(target, async () => {
          const wait = Math.max(0, lastSentMs + minIntervalMs / budget.scale(target) - deps.now());
          if (wait > 0) await sleep(wait);
          const cred = deps.credentials();
          if (cred === null) return { ok: false, error: "no_credentials", sent: false };
          const sent = await send(request, cred, admitDispatch, dispatched);
          await settle(target, sent, dispatched);
          return sent;
        }, (r) => r.ok);
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
