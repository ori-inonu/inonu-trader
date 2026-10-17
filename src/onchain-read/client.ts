/**
 * Signed read-only OKX OnchainOS client (ONC-1, gateway doc §2 and §5). One global queue sends at most one
 * request per minIntervalMs; the provider message is never forwarded. Errors map to the closed ONC-5 set.
 * A 402 answer blocks that fee tier in memory for one hour (the system never pays) and a 429/50011 opens a
 * 30 s global cooldown; the gateway then serves stale cache. The Date header of every response measures the
 * local clock skew; a skew of 10 s or more is applied to the signature timestamp, and a 50102 ("Timestamp
 * request expired") is retried once inside the same queue slot with the just-learned offset before the call
 * reports clock_skew.
 */
import { signRequest } from "./sign";
import type { OnchainTier, ProviderRequest } from "./catalog";

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
const CLOCK_CODE = "50102";
/** HTTP 200 body code for a chain the endpoint does not serve. */
const UNSUPPORTED_CHAIN_CODE = "50038";
const RATE_CODES = new Set(["50011"]);
const PAYMENT_BLOCK_MS = 3_600_000;
const RATE_COOLDOWN_MS = 30_000;

export interface OnchainClient {
 call(request: ProviderRequest, tier: OnchainTier, admitDispatch: () => DispatchAdmission): Promise<ClientResult>;
 status(): ClientStatus;
}

export function createOnchainClient(deps: OnchainClientDeps): OnchainClient {
 const minIntervalMs = deps.minIntervalMs ?? 1100;
 const timeoutMs = deps.timeoutMs ?? 8000;
 const maxBytes = deps.maxBytes ?? 2_000_000;
 let lastSentMs = -Infinity;
 let lastCallMs: number | null = null;
 let lastCode: number | null = null;
 let cooldownUntilMs = 0;
 const tierBlockedUntil = new Map<OnchainTier, number>();
 /** Signing offset learned from response Date headers (server minus local). Only applied when the skew is real. */
 let offsetMs = 0;
 let clockOffsetMs: number | null = null;
 let queue: Promise<unknown> = Promise.resolve();

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
  dispatched: { n: number },
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
  dispatched: { n: number },
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
    const nextCooldownUntilMs = deps.now() + RATE_COOLDOWN_MS;
    if (!recordResponse()) return expired();
    cooldownUntilMs = nextCooldownUntilMs;
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
   const nextCooldownUntilMs = RATE_CODES.has(env.code) ? deps.now() + RATE_COOLDOWN_MS : null;
   if (!recordResponse()) return expired();
   lastCode = Number(env.code);
   if (env.code === "0") return { ok: true, data: env.data, sent: true };
   if (env.code === UNSUPPORTED_CHAIN_CODE) return { ok: false, error: "unsupported_chain", sent: true };
   if (AUTH_CODES.has(env.code)) return { ok: false, error: "provider_unauthorized", sent: true };
   if (RATE_CODES.has(env.code)) {
    cooldownUntilMs = nextCooldownUntilMs!;
    return { ok: false, error: "rate_limited", sent: true };
   }
   return { ok: false, error: "provider_error", sent: true };
  }
  return { ok: false, error: "clock_skew", sent: true }; // unreachable: the second attempt never falls through
 }

 function refusal(tier: OnchainTier): ClientResult | null {
  const blocked = tierBlockedUntil.get(tier);
  if (blocked !== undefined && deps.now() < blocked) return { ok: false, error: "provider_payment_required", sent: false };
  if (deps.now() < cooldownUntilMs) return { ok: false, error: "rate_limited", sent: false };
  return null;
 }

 function call(request: ProviderRequest, tier: OnchainTier, admitDispatch: () => DispatchAdmission): Promise<ClientResult> {
  const initial = refusal(tier);
  if (initial) return Promise.resolve(initial);
  const result = queue.then(async (): Promise<ClientResult> => {
   const queued = refusal(tier);
   if (queued) return queued;
   const wait = Math.max(0, lastSentMs + minIntervalMs - deps.now());
   if (wait > 0) await sleep(wait);
   const beforeSend = refusal(tier);
   if (beforeSend) return beforeSend;
   const cred = deps.credentials();
   if (cred === null) return { ok: false, error: "no_credentials", sent: false };
   const dispatched = { n: 0 };
   const r = await send(request, cred, admitDispatch, dispatched);
   if (r.ok === false && r.error === "provider_payment_required") tierBlockedUntil.set(tier, deps.now() + PAYMENT_BLOCK_MS);
   return r;
  });
  queue = result.then(
   () => undefined,
   () => undefined,
  );
  return result;
 }

 return {
  call,
  status() {
   return { lastCallMs, lastCode, cooldownUntilMs: deps.now() < cooldownUntilMs ? cooldownUntilMs : null, clockOffsetMs };
  },
 };
}
