export interface PipelineWallet {
  address: string;
  chainIndex: "196" | "143";
  revision: number;
  identityKey: string;
}
export interface QueryConsent {
  active: true;
  queryScope: 'web3-rpc-read-v2';
  identityKey: string;
  chainIndex: string;
  revision: number;
}
export interface RealHealth {
  mode: "paper";
  executionEnabled: false;
  services: {
    onchainos: { configured: boolean; access: "unverified" | "ready" | "blocked"; missing: string[] };
    jev: { credentialPresent: boolean; authorized: boolean; model: string; costUsdPerMillion: number | null };
    worker: { running: boolean; intervalMs: number; lastCycleAtMs: number | null };
  };
  walletConsent: { active: boolean; queryScope?: 'web3-rpc-read-v2'; identityKey: string | null; chainIndex: string | null; revision: number | null };
  dependencies: string[];
  capabilities?: RealCapability[];
  effectiveConfig?: { intervalMs: number; quotePair: { fromToken: string; toToken: string; amount: string; slippagePercent: string } | null; rpcRecipients: { chainIndex: string; origin: string }[] };
  jevCalls?: { reserved: number; limit: number };
  quota?: unknown;
}
export interface RealEnvelope {
  status: "ready" | "blocked" | "error";
  source: string;
  mode?: string;
  endpoint: string;
  method?: string;
  chainIndex?: string;
  correlationId?: string;
  expiresAtMs: number | null;
  httpStatus: number | null;
  unit: string | null;
  error: string | null;
  data: unknown;
  observedAtMs?: number;
  requestedAtMs?: number;
  receivedAtMs?: number;
  sourceAtMs?: number | null;
}
export interface RealCapability {
  family?: string;
  module?: string;
  network?: string;
  chainIndex?: string;
  endpoint?: string;
  source?: string;
  status?: string;
  documented?: boolean;
  implemented?: boolean;
  exercisedReal?: boolean;
  integrated?: boolean;
  financiallyQualified?: boolean;
  reason?: string | null;
  dependency?: string | null;
  nextRequirement?: string | null;
  [key: string]: unknown;
}
export interface CoreSample {
  correlationId: string;
  chainIndex: string;
  identityKey: string;
  revision: number;
  observedAtMs: number;
  envelopes: Record<string, RealEnvelope>;
  capabilities: RealCapability[];
  proposal: ({ executionEnabled: false } & Record<string, unknown>) | null;
  holdReasons: string[];
  semanticProof?: Record<string, unknown>;
  rpcObservation?: Record<string, unknown>;
  valuation?: Record<string, unknown>;
}
export interface RealCycle {
  id: string;
  sequence: number;
  startedAtMs: number;
  finishedAtMs: number;
  mode: "paper";
  core: CoreSample | null;
  decision: { choice: string; status: "blocked" | "ready" | "error"; model: string | null; latencyMs: number | null; inputTokens: number | null; costUsd: number | null; reasons: string[] };
  realizedPnlUsd: null;
  executionEnabled: false;
}
export interface RealLatest { cycle: RealCycle | null; history: RealCycle[] }
export interface RealPipelineSnapshot {
  health: RealHealth | null;
  latest: RealLatest | null;
  consent: QueryConsent | null;
  busy: boolean;
  error: string | null;
  syncedAtMs: number | null;
}

export const initialRealPipelineSnapshot: RealPipelineSnapshot = Object.freeze({ health: null, latest: null, consent: null, busy: false, error: null, syncedAtMs: null });

/** In-memory HTTP boundary; this module never logs or persists wallet identity. */
export function createRealPipelineClient(options: { fetch?: (input: string, init?: RequestInit) => Promise<Response>; apiBase?: string } = {}) {
  const fetcher = options.fetch ?? ((input, init) => fetch(input, init));
  const apiBase = options.apiBase?.replace(/\/$/, "") ?? "";
  if (apiBase && !/^http:\/\/(?:127\.0\.0\.1|localhost)(?::\d{1,5})?$/.test(apiBase)) throw new Error("O pipeline exige um backend HTTP local.");
  let state = initialRealPipelineSnapshot;
  let wallet: PipelineWallet | null = null;
  let generation = 0;
  let mutations = Promise.resolve();
  let pending = 0;
  let grants = 0;
  let polling: AbortController | null = null;
  let refreshing: AbortController | null = null;
  let interval: ReturnType<typeof setInterval> | null = null;
  const listeners = new Set<() => void>();
  const publish = (change: Partial<RealPipelineSnapshot>) => {
    state = Object.freeze({ ...state, ...change });
    for (const listener of listeners) listener();
  };
  const request = async (path: string, init?: RequestInit): Promise<unknown> => {
    const response = await fetcher(`${apiBase}/api/real/${path}`, { ...init, cache: "no-store", credentials: "omit" });
    if (!response.ok) throw new Error(`Consulta local indisponível (HTTP ${response.status}).`);
    return response.json();
  };
  const enqueue = (action: () => Promise<void>) => {
    pending++;
    publish({ busy: true });
    const task = mutations.then(action).finally(() => { pending--; publish({ busy: pending > 0 }); });
    mutations = task.catch(() => {});
    return task;
  };
  const revokeConsent = () => {
    generation++;
    polling?.abort();
    refreshing?.abort();
    publish({ consent: null, latest: null, error: null });
    return enqueue(async () => {
      try { await request("consent", { method: "DELETE", keepalive: true }); }
      catch { publish({ error: "Revogação ainda não confirmada pelo backend. Tente revogar novamente." }); }
    });
  };
  const visibleCycle = (cycle: RealCycle): RealCycle => {
    const core = cycle.core;
    const consent = state.consent;
    return core && consent && core.identityKey === consent.identityKey && core.chainIndex === consent.chainIndex && core.revision === consent.revision ? cycle : { ...cycle, core: null };
  };
  const sync = async () => {
    polling?.abort();
    const controller = new AbortController();
    polling = controller;
    const observedGeneration = generation;
    try {
      const responses = await Promise.all([request("health", { signal: controller.signal }), request("latest", { signal: controller.signal })]);
      if (controller.signal.aborted || generation !== observedGeneration) return;
      const health = responses[0] as RealHealth;
      const latest = responses[1] as RealLatest;
      if (health?.mode !== "paper" || health.executionEnabled !== false || !health.services?.onchainos || !health.services?.jev || !health.services?.worker || !Array.isArray(health.dependencies) || !health.walletConsent || !Array.isArray(latest?.history)) throw new Error("Resposta incompatível.");
      const cycles = [...latest.history, ...(latest.cycle ? [latest.cycle] : [])];
      if (cycles.some((cycle) => cycle.mode !== "paper" || cycle.executionEnabled !== false || cycle.realizedPnlUsd !== null || !cycle.decision || !Array.isArray(cycle.decision.reasons))) throw new Error("Resposta incompatível.");
      const confirmed = state.consent;
      if (confirmed && (!health.walletConsent.active || health.walletConsent.queryScope !== confirmed.queryScope || health.walletConsent.identityKey !== confirmed.identityKey || health.walletConsent.chainIndex !== confirmed.chainIndex || health.walletConsent.revision !== confirmed.revision)) publish({ consent: null });
      publish({ health, latest: { cycle: latest.cycle ? visibleCycle(latest.cycle) : null, history: latest.history.map(visibleCycle) }, error: null, syncedAtMs: Date.now() });
    } catch {
      if (!controller.signal.aborted && generation === observedGeneration) publish({ error: "Não foi possível sincronizar o pipeline local. Verifique o backend e tente novamente." });
    } finally { controller.abort(); if (polling === controller) polling = null; }
  };

  return {
    getSnapshot: () => state,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    setWallet(next: PipelineWallet | null) {
      if (wallet?.identityKey === next?.identityKey && wallet?.revision === next?.revision && wallet?.chainIndex === next?.chainIndex) return Promise.resolve();
      const mustRevoke = state.consent !== null || grants > 0 || state.health?.walletConsent.active === true;
      wallet = next;
      generation++;
      polling?.abort();
      refreshing?.abort();
      publish({ consent: null, latest: null });
      return mustRevoke ? revokeConsent() : Promise.resolve();
    },
    grantConsent() {
      if (!wallet) { publish({ error: "Conecte uma conta na X Layer ou Monad antes de autorizar a consulta." }); return Promise.resolve(); }
      const target = wallet;
      const observedGeneration = generation;
      grants++;
      publish({ error: null });
      return enqueue(async () => {
       try {
        if (generation !== observedGeneration) return;
        const result = await request("consent", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ address: target.address, chainIndex: target.chainIndex, revision: target.revision, consent: true, queryScope: 'web3-rpc-read-v2' }) });
        if (generation !== observedGeneration) return;
        const consent = result as QueryConsent;
        if (!consent || consent.active !== true || consent.queryScope !== 'web3-rpc-read-v2' || consent.identityKey !== target.identityKey || consent.chainIndex !== target.chainIndex || consent.revision !== target.revision) throw new Error("O backend não confirmou esta identidade e revisão. A consulta continua desautorizada.");
        generation++;
        polling?.abort();
        refreshing?.abort();
        publish({ consent });
       } catch {
         if (generation === observedGeneration) {
           // A failed or incompatible response can still follow a remote commit.
           // Queue the compensating DELETE after this POST settles.
           void revokeConsent();
           publish({ consent: null, error: "O backend não confirmou esta consulta. Tente autorizar novamente." });
         }
       }
       finally { grants--; }
      });
    },
    revokeConsent,
    sync,
    start() {
      if (!interval) { void sync(); interval = setInterval(() => { void sync(); }, 5000); }
      return () => {
        if (interval) clearInterval(interval);
        interval = null;
        generation++;
        polling?.abort();
        refreshing?.abort();
        publish({ latest: null });
        if (state.consent || grants > 0) void revokeConsent();
      };
    },
    async refresh() {
      if (refreshing) return;
      const controller = new AbortController();
      refreshing = controller;
      const observedGeneration = generation;
      pending++;
      publish({ busy: true });
      try {
        await request("refresh", { method: "POST", signal: controller.signal });
        if (!controller.signal.aborted && generation === observedGeneration) await sync();
      } catch {
        if (!controller.signal.aborted && generation === observedGeneration) publish({ error: "Atualização não confirmada pelo backend. Tente novamente." });
      } finally {
        controller.abort();
        if (refreshing === controller) refreshing = null;
        pending--;
        publish({ busy: pending > 0 });
      }
    },
  };
}

export type RealPipelineClient = ReturnType<typeof createRealPipelineClient>;
