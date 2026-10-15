/**
 * Two free provider calls in two API families (Market supported chains and Balance supported chains) used
 * by the settings "Testar conexao" button: the Market family tolerates clock drift while the Wallet family
 * rejects it, so both are checked. Builds a dedicated client around the supplied credential so the probe
 * shares all guards and error mapping of the real client but never touches the shared queue state.
 */
import type { OnchainTier } from "./catalog";
import { createOnchainClient, type OkxCredentials } from "./client";

export interface ProbeDeps {
  readonly fetch: typeof fetch;
  readonly now: () => number;
}

export type OnchainosProbe = (credentials: OkxCredentials) => Promise<{ ok: boolean; code: string }>;

const FREE = "free" as OnchainTier;

export function createProbeOnchainos(base: ProbeDeps): OnchainosProbe {
  return async (credentials) => {
    const client = createOnchainClient({ credentials: () => credentials, fetch: base.fetch, now: base.now, minIntervalMs: 0 });
    const market = await client.call({ method: "GET", path: "/api/v6/dex/market/supported/chain" }, FREE);
    if (!market.ok) return { ok: false, code: market.error };
    const balance = await client.call({ method: "GET", path: "/api/v6/dex/balance/supported/chain" }, FREE);
    if (!balance.ok) return { ok: false, code: balance.error };
    return { ok: true, code: "ok" };
  };
}
