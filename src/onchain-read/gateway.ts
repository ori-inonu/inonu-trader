/**
 * Gateway orchestration (ONC-5): validate -> cache -> reserve -> client -> normalize -> cache set. One
 * envelope: {ok:true, data, meta:{tier, cachedAtMs, ageMs, stale, budget:{tier, used, cap|null}}} or
 * {ok:false, error} with the closed error set. Stale cache is served (marked) when the provider cannot be
 * called or fails; without any usable entry the error code is returned.
 */
import { endpointFor, type OnchainErrorCode, type OnchainTier, type Params } from "./catalog";
import type { OnchainCache } from "./cache";
import type { OnchainBudget, BudgetIntent } from "./budget";
import type { OnchainClient } from "./client";

export type CredentialState = "absent" | "incomplete" | "complete";

export interface GatewayMeta {
  readonly tier: OnchainTier;
  readonly cachedAtMs: number;
  readonly ageMs: number;
  readonly stale: boolean;
  readonly budget: { readonly tier: OnchainTier; readonly used: number; readonly cap: number | null };
}

export type GatewayResult = { readonly ok: true; readonly data: unknown; readonly meta: GatewayMeta } | { readonly ok: false; readonly error: OnchainErrorCode };

export interface GatewayDeps {
  readonly client: OnchainClient;
  readonly cache: OnchainCache;
  readonly budget: OnchainBudget;
  readonly credentialsState: () => CredentialState;
  readonly now: () => number;
}

export interface GatewayStatus {
  readonly credential: CredentialState;
  readonly lastCallMs: number | null;
  readonly lastCode: number | null;
  readonly cooldownUntilMs: number | null;
  /** Last raw clock skew measured from a provider Date header, in ms (server minus local). Null before any call. */
  readonly clockOffsetMs: number | null;
}

export interface OnchainGateway {
  call(route: string, params: Params, intent: BudgetIntent): Promise<GatewayResult>;
  budget(): ReturnType<OnchainBudget["snapshot"]>;
  status(): GatewayStatus;
}

/**
 * The gateway as the server process sees it. `callInternal` returns, for the routes that have one, the shape with full
 * wallet addresses and the sold quantity (catalog `normalizeInternal`); for every other route it answers like `call`.
 * It is never reachable from HTTP: `src/onchain-read/http.ts` is typed against `OnchainGateway`.
 */
export interface OnchainGatewayInternal extends OnchainGateway {
  callInternal(route: string, params: Params, intent: BudgetIntent): Promise<InternalGatewayResult>;
}

/** `sent` is true only when THIS call went to the provider: a cache hit, a refusal and a coalesced follower are false. */
export type InternalGatewayResult = GatewayResult & { readonly sent: boolean };

export function createOnchainGateway(deps: GatewayDeps): OnchainGatewayInternal {
  // Admit and record one coalesced leader at a time, so reserve sees completed usage.
  let admission: Promise<unknown> = Promise.resolve();

  function serial<T>(fn: () => Promise<T>): Promise<T> {
    const result = admission.then(fn);
    admission = result.catch(() => undefined);
    return result;
  }
  function budgetMeta(tier: OnchainTier) {
    const snap = deps.budget.snapshot().tiers[tier];
    return { tier, used: snap.used, cap: snap.cap };
  }

  function fresh(entry: { data: unknown; cachedAtMs: number }, tier: OnchainTier, stale: boolean): GatewayResult {
    return { ok: true, data: entry.data, meta: { tier, cachedAtMs: entry.cachedAtMs, ageMs: Math.max(0, deps.now() - entry.cachedAtMs), stale, budget: budgetMeta(tier) } };
  }

  async function run(route: string, params: Params, intent: BudgetIntent, internal: boolean): Promise<{ result: GatewayResult; sent: boolean }> {
    let sent = false;
    const result = await resolve(route, params, intent, internal, () => (sent = true));
    return { result, sent };
  }

  async function resolve(route: string, params: Params, intent: BudgetIntent, internal: boolean, markSent: () => void): Promise<GatewayResult> {
    const endpoint = endpointFor(route);
    if (!endpoint) return { ok: false, error: "bad_request" };
    const validated = endpoint.validate(params);
    if (!validated.ok) return { ok: false, error: "bad_request" };

    // the two shapes of one request are different payloads: they never share a cache entry or a coalesced call
    const normalize = internal && endpoint.normalizeInternal ? endpoint.normalizeInternal : endpoint.normalize;
    const key = (normalize === endpoint.normalize ? "" : "#internal ") + route + "?" + Object.keys(params).sort().map((k) => `${k}=${params[k]}`).join("&");
    const cached = deps.cache.get(key, validated.ttlMs);
    if (cached?.fresh) return fresh(cached.entry, endpoint.tier, false);

    const state = deps.credentialsState();
    if (state === "absent") return { ok: false, error: "no_credentials" };
    if (state === "incomplete") return { ok: false, error: "incomplete_credentials" };

    const reserved = deps.budget.reserve(endpoint.tier, intent);
    if (!reserved.ok) return cached ? fresh(cached.entry, endpoint.tier, true) : { ok: false, error: reserved.reason };

    const dispatch = () => deps.cache.coalesce(key, () => serial(async () => {
      const finalReserve = deps.budget.reserve(endpoint.tier, intent);
      if (!finalReserve.ok) return { ok: false as const, error: finalReserve.reason, sent: false };
      // only the leader of a coalesced group runs this closure, so only it can say it sent
      const r = await deps.client.call(validated.request, endpoint.tier);
      if (r.sent) {
        deps.budget.record(endpoint.tier);
        // the clock retry is a second request the provider received: it spends the quota too
        for (let extra = r.extraDispatches ?? 0; extra > 0; extra -= 1) deps.budget.record(endpoint.tier);
        markSent();
      }
      return r;
    }));
    let res = await dispatch();
    // A background leader may become pace-limited while queued. Its user followers
    // retain their own allowance, with one fresh, coalesced admission attempt.
    if (!res.ok && res.error === "pace_limited" && intent === "user" && deps.budget.reserve(endpoint.tier, intent).ok) {
      res = await dispatch();
    }
    if (!res.ok) return cached ? fresh(cached.entry, endpoint.tier, true) : { ok: false, error: res.error };

    const normalized = normalize(res.data);
    if (!normalized.ok) return cached ? fresh(cached.entry, endpoint.tier, true) : { ok: false, error: "schema" };

    deps.cache.set(key, normalized.data);
    return fresh({ data: normalized.data, cachedAtMs: deps.now() }, endpoint.tier, false);
  }

  return {
    call: async (route, params, intent) => (await run(route, params, intent, false)).result,
    callInternal: async (route, params, intent) => {
      const { result, sent } = await run(route, params, intent, true);
      return { ...result, sent };
    },
    budget: () => deps.budget.snapshot(),
    status() {
      const s = deps.client.status();
      return { credential: deps.credentialsState(), lastCallMs: s.lastCallMs, lastCode: s.lastCode, cooldownUntilMs: s.cooldownUntilMs, clockOffsetMs: s.clockOffsetMs };
    },
  };
}
