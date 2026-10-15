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
  call(request: ProviderRequest, tier: OnchainTier): Promise<ClientResult>;
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

  function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
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
  async function send(request: ProviderRequest, cred: OkxCredentials, dispatched: { n: number }): Promise<ClientResult> {
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

  async function sendBeforeDeadline(request: ProviderRequest, cred: OkxCredentials, signal: AbortSignal, dispatched: { n: number }): Promise<ClientResult> {
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
        cooldownUntilMs = deps.now() + RATE_COOLDOWN_MS;
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
      if (RATE_CODES.has(env.code)) {
        cooldownUntilMs = deps.now() + RATE_COOLDOWN_MS;
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

  function call(request: ProviderRequest, tier: OnchainTier): Promise<ClientResult> {
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
      const sentResult = await send(request, cred, dispatched);
      const r: ClientResult = dispatched.n > 1 ? { ...sentResult, extraDispatches: dispatched.n - 1 } : sentResult;
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
