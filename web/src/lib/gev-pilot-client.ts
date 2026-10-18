import { PILOT_MAX_AGE_MS, PILOT_MAX_QUOTE_AGE_MS, pilotContextKey, pilotNonceValid, type PilotCycle, type PilotRequest } from "./gev-pilot-protocol";
import type { ExecutionPlan, OpportunityCandidate, OperatorDecision } from "../../../src/operator/types";
import type { WalletSnapshot } from "./okx-wallet";

/**
 * Address of the pilot service: port 3020 unless the NEXT_PUBLIC_PILOT_PORT variable says otherwise. A wrong value throws, so
 * a typo fails the build instead of shipping a panel that cannot reach the service. This is the browser copy of the rule of
 * src/pilot/ports.ts (Turbopack is rooted at web/); gev-pilot-endpoint.test.ts keeps the two in agreement.
 */
export function pilotEndpoint(portText: string | undefined): string {
  const text = portText ?? "3020";
  if (!/^[1-9][0-9]{0,4}$/.test(text) || Number(text) > 65535) throw new Error("invalid_pilot_port");
  return `http://127.0.0.1:${text}/pilot/cycles`;
}
const endpointValid = (v: unknown): v is string => typeof v === "string" && /^http:\/\/127\.0\.0\.1:[1-9][0-9]{0,4}\/pilot\/cycles$/.test(v) && Number(/:(\d+)\//.exec(v)![1]) <= 65535;
// Next replaces only this literal access in the browser bundle, so the variable must not be read in any other way.
export const GEV_PILOT_ENDPOINT = pilotEndpoint(process.env.NEXT_PUBLIC_PILOT_PORT);
export interface GevPilotState {
  status: "blocked" | "ready" | "evaluating" | "hold" | "simulated" | "expired" | "error";
  canEvaluate: boolean;
  reason: string;
  contextKey: string | null;
  cycle: PilotCycle | null;
  activePlan: ExecutionPlan | null;
  /** Complete identity retained only in memory; the context hash is correlation. */
  observation: Omit<PilotRequest, "requestId"> | null;
}
export interface GevPilotOptions {
  sessionId?: string;
  nonce?: () => string;
  now?: () => number;
  fetch?: (url: string, init: RequestInit) => Promise<Response>;
  requestDeadlineMs?: number;
  /** Defaults to GEV_PILOT_ENDPOINT; only a loopback pilot address is accepted. */
  endpoint?: string;
  scheduler?: { setTimeout(callback: () => void, delayMs: number): unknown; clearTimeout(handle: unknown): void };
}
export interface GevPilotController {
  getSnapshot(): GevPilotState;
  subscribe(listener: () => void): () => void;
  setWallet(snapshot: WalletSnapshot): void;
  evaluate(): Promise<void>;
  dispose(): void;
}

const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const text = (v: unknown, max = 512): v is string => typeof v === "string" && v.length > 0 && v.length <= max;
const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const nonnegative = (v: unknown): v is number => finite(v) && v >= 0;
const stamp = (v: unknown): v is number => nonnegative(v) && Number.isSafeInteger(v) && v > 0;
const nullable = (v: unknown, check: (v: unknown) => boolean) => v === null || check(v);
const strings = (v: unknown): v is string[] => Array.isArray(v) && v.length <= 64 && v.every(s => text(s));
const nonceValid = pilotNonceValid;
const hash = (v: unknown): v is string => typeof v === "string" && /^[a-f0-9]{64}$/.test(v);
// Existing candidate builder truncates quote fingerprints to 32 hex characters.
const quoteHash = (v: unknown): v is string => typeof v === "string" && /^[a-f0-9]{32}$/.test(v);
const atomic = (v: unknown): v is string => typeof v === "string" && /^(0|[1-9][0-9]{0,77})$/.test(v) && BigInt(v) < BigInt(2) ** BigInt(256);
const shape = (v: Record<string, unknown>, keys: string[], optional: string[] = []) =>
  keys.every(k => Object.hasOwn(v, k)) && Object.keys(v).every(k => keys.includes(k) || optional.includes(k));

function asset(v: unknown): boolean {
  return record(v) && shape(v, ["chainIndex", "tokenContractAddress", "symbol", "decimals"]) && v.chainIndex === "196" &&
    typeof v.tokenContractAddress === "string" && (v.tokenContractAddress === "" || /^0x[0-9a-fA-F]{40}$/.test(v.tokenContractAddress)) &&
    text(v.symbol, 24) && nullable(v.decimals, n => nonnegative(n) && Number.isInteger(n) && n <= 255);
}
function candidate(v: unknown): v is OpportunityCandidate {
  return record(v) && shape(v, ["id", "kind", "title", "chainIndex", "from", "to", "sizeUsd", "sizeAtomic", "expectedOutAtomic",
    "expectedLeg1OutAtomic", "pairKey", "netUsd", "priceImpactPercent", "costs", "quoteAgeMs", "quoteHash", "notes", "researchOnly"], ["toChainIndex"]) &&
    typeof v.id === "string" && /^[a-z0-9_]{1,64}$/.test(v.id) && v.id !== "hold" && v.kind === "dex_round_trip" && text(v.title) &&
    v.chainIndex === "196" && (v.toChainIndex === undefined || v.toChainIndex === "196") && asset(v.from) && asset(v.to) &&
    nullable(v.sizeUsd, nonnegative) && atomic(v.sizeAtomic) && nullable(v.expectedOutAtomic, atomic) && nullable(v.expectedLeg1OutAtomic, atomic) &&
    text(v.pairKey, 160) && nullable(v.netUsd, finite) && nullable(v.priceImpactPercent, finite) && record(v.costs) &&
    shape(v.costs, ["networkFeeUsd", "tradingFeeUsd", "inferenceUsd", "complete"]) && nullable(v.costs.networkFeeUsd, nonnegative) &&
    nullable(v.costs.tradingFeeUsd, nonnegative) && nonnegative(v.costs.inferenceUsd) && typeof v.costs.complete === "boolean" &&
    nullable(v.quoteAgeMs, nonnegative) && nullable(v.quoteHash, quoteHash) && strings(v.notes) && typeof v.researchOnly === "boolean";
}
function qualified(c: OpportunityCandidate): boolean {
  return c.from.symbol === "USDT" && c.from.decimals === 6 && c.to.symbol === "OKB" && c.to.decimals === 18 &&
    !c.researchOnly && c.costs.complete && c.costs.networkFeeUsd !== null && c.costs.tradingFeeUsd !== null &&
    c.sizeUsd !== null && c.sizeUsd > 0 && c.sizeAtomic !== "0" && c.expectedOutAtomic !== null && c.expectedOutAtomic !== "0" &&
    c.expectedLeg1OutAtomic !== null && c.expectedLeg1OutAtomic !== "0" && c.netUsd !== null && c.priceImpactPercent !== null &&
    c.quoteHash !== null && c.quoteAgeMs !== null && c.quoteAgeMs <= PILOT_MAX_QUOTE_AGE_MS;
}
function coverage(v: unknown, source: unknown): boolean {
  if (!record(v) || !shape(v,["status","chains","valueComplete","unitsQualified","quoteCostsComplete","assetCount"]) || !Array.isArray(v.chains)) return false;
  if (source === "unavailable") return v.status === "unknown" && v.chains.length === 0 && v.valueComplete === null && v.unitsQualified === null && v.quoteCostsComplete === null && v.assetCount === null;
  return v.status === "qualified" && v.chains.length === 1 && v.chains[0] === "196" && v.valueComplete === true && v.unitsQualified === true && v.quoteCostsComplete === true &&
    nonnegative(v.assetCount) && Number.isInteger(v.assetCount) && v.assetCount >= 1 && v.assetCount <= 500;
}
function decision(v: unknown, eligible: string[]): v is OperatorDecision {
  if (!record(v) || !shape(v, ["choice", "probabilities", "confidence", "latencyMs", "inputTokens", "model"]) ||
    !text(v.choice, 64) || !["hold", ...eligible].includes(v.choice) || !record(v.probabilities) ||
    !shape(v.probabilities, ["hold", ...eligible]) || !nullable(v.confidence, n => nonnegative(n) && n <= 1) ||
    !nonnegative(v.latencyMs) || !nullable(v.inputTokens, n => nonnegative(n) && Number.isSafeInteger(n)) || !text(v.model, 128)) return false;
  const values = Object.values(v.probabilities);
  return values.every(n => nonnegative(n) && n <= 1) && Math.abs(values.reduce<number>((sum, n) => sum + (typeof n === "number" ? n : 0), 0) - 1) <= 0.02;
}
function plan(v: unknown, c: OpportunityCandidate, completedAt: number): v is ExecutionPlan {
  return record(v) && shape(v, ["planId", "candidateId", "kind", "createdAtMs", "expiresAtMs", "steps", "quoteHash", "maxLossUsd", "idempotencyKey", "executionQualification"]) &&
    text(v.planId, 128) && v.candidateId === c.id && v.kind === c.kind && stamp(v.createdAtMs) && v.createdAtMs <= completedAt &&
    stamp(v.expiresAtMs) && v.expiresAtMs > v.createdAtMs && Array.isArray(v.steps) && v.steps.length > 0 && v.steps.length <= 8 &&
    v.steps.every(s => record(s) && shape(s, ["kind", "chainIndex", "description"]) && ["approve", "swap"].includes(String(s.kind)) && s.chainIndex === "196" && text(s.description)) &&
    quoteHash(v.quoteHash) && v.quoteHash === c.quoteHash && nonnegative(v.maxLossUsd) && c.sizeUsd !== null && v.maxLossUsd <= c.sizeUsd &&
    text(v.idempotencyKey, 160) && ["not_qualified", "qualified_dry_run"].includes(String(v.executionQualification));
}

/** Untrusted HTTP data is checked in full before it can enter controller state. */
function cycleValid(v: unknown, r: PilotRequest, time: number): v is PilotCycle {
  if (!record(v) || !shape(v, ["protocol", "sessionId", "requestId", "contextKey", "cycleId", "maskedAccount", "chainId", "chainIndex", "mode", "execution",
    "status", "source", "dataVersion", "observedAtMs", "coverage", "quoteObservedAtMs", "completedAtMs", "validUntilMs", "knownValueUsd", "candidates", "verdicts", "decision", "plan", "reasons", "inferenceCostUsd", "billedCostUsd", "realizedProfitUsd"]) ||
    v.protocol !== "gev-wallet-pilot-v1" || v.sessionId !== r.sessionId || v.requestId !== r.requestId || v.contextKey !== pilotContextKey(r) ||
    !text(v.cycleId, 128) || v.maskedAccount !== r.account.slice(0, 6) + "..." + r.account.slice(-4) || v.chainId !== "0xc4" || v.chainIndex !== "196" ||
    v.mode !== "simulation" || v.execution !== "disabled" || !["hold", "simulated"].includes(String(v.status)) ||
    !["unavailable", "real", "fixture"].includes(String(v.source)) || !nullable(v.dataVersion, hash) || !nullable(v.observedAtMs, stamp) ||
    !coverage(v.coverage,v.source) || !nullable(v.quoteObservedAtMs,stamp) ||
    !stamp(v.completedAtMs) || v.completedAtMs > time || v.completedAtMs < r.observedAtMs || !stamp(v.validUntilMs) ||
    !nullable(v.knownValueUsd, nonnegative) || !nullable(v.inferenceCostUsd, nonnegative) || v.billedCostUsd !== null || v.realizedProfitUsd !== null ||
    !strings(v.reasons) || !Array.isArray(v.candidates) || v.candidates.length > 32 || !v.candidates.every(candidate) ||
    !Array.isArray(v.verdicts) || v.verdicts.length !== v.candidates.length) return false;
  if (v.observedAtMs !== null && (typeof v.observedAtMs !== "number" || v.observedAtMs > v.completedAtMs)) return false;
  if (v.quoteObservedAtMs !== null && (typeof v.quoteObservedAtMs !== "number" || v.quoteObservedAtMs > v.completedAtMs)) return false;
  const candidates = v.candidates;
  const ids = candidates.map(c => c.id);
  if (new Set(ids).size !== ids.length) return false;
  const seen = new Set<string>();
  const eligible: string[] = [];
  for (const verdict of v.verdicts) {
    if (!record(verdict) || !shape(verdict, ["candidateId", "eligible", "reasons"]) || !text(verdict.candidateId, 64) ||
      !ids.includes(verdict.candidateId) || seen.has(verdict.candidateId) || typeof verdict.eligible !== "boolean" || !strings(verdict.reasons)) return false;
    seen.add(verdict.candidateId);
    if (verdict.eligible) {
      if (verdict.reasons.length || !qualified(candidates.find(c => c.id === verdict.candidateId)!)) return false;
      eligible.push(verdict.candidateId);
    }
  }
  if (v.source === "unavailable" && (v.candidates.length || v.decision !== null || v.plan !== null || v.dataVersion !== null || v.observedAtMs !== null || v.quoteObservedAtMs !== null || v.knownValueUsd !== null)) return false;
  if (v.source !== "unavailable" && (!hash(v.dataVersion) || !stamp(v.observedAtMs) || v.knownValueUsd === null)) return false;
  if (v.decision !== null && (!decision(v.decision, eligible) || v.source === "unavailable" || v.inferenceCostUsd === null)) return false;
  if (v.status === "hold") return v.plan === null;
  if (!decision(v.decision, eligible) || v.decision.choice === "hold" || v.source === "unavailable" || !hash(v.dataVersion) ||
    !stamp(v.observedAtMs) || time < v.observedAtMs || time - v.observedAtMs > PILOT_MAX_AGE_MS ||
    v.knownValueUsd === null || v.inferenceCostUsd === null) return false;
  const choice = v.decision.choice;
  const selected = candidates.find(c => c.id === choice);
  if (!selected || !plan(v.plan, selected, v.completedAtMs) || !stamp(v.quoteObservedAtMs) ||
    v.completedAtMs - v.quoteObservedAtMs > PILOT_MAX_QUOTE_AGE_MS) return false;
  const dataDeadline = Math.min(r.observedAtMs + PILOT_MAX_AGE_MS, v.observedAtMs + PILOT_MAX_AGE_MS, v.quoteObservedAtMs + PILOT_MAX_QUOTE_AGE_MS);
  return v.validUntilMs <= dataDeadline && v.plan.expiresAtMs <= dataDeadline;
}

export const initialGevPilotState = (): GevPilotState => ({ status: "blocked", canEvaluate: false, reason: "wallet_disconnected", contextKey: null, observation: null, cycle: null, activePlan: null });
function observation(snapshot: WalletSnapshot, sessionId: string, time: number): Omit<PilotRequest, "requestId"> | null {
  const at = snapshot.observedAtMs;
  const block = snapshot.balances?.block;
  if (snapshot.status !== "connected" || snapshot.error !== null || snapshot.chainId !== "0xc4" || snapshot.balances?.network !== "xlayer" ||
    !snapshot.account || !/^0x[0-9a-fA-F]{40}$/.test(snapshot.account) || !stamp(at) || !stamp(time) || at > time || time - at > PILOT_MAX_AGE_MS ||
    !block || !/^(0x[0-9a-fA-F]{1,16}|[0-9]{1,20})$/.test(block) || BigInt(block) > BigInt("18446744073709551615")) return null;
  return { sessionId, account: snapshot.account.toLowerCase(), chainId: "0xc4", observedAtMs: at, block: BigInt(block).toString() };
}
const same = (a: Omit<PilotRequest, "requestId">, b: Omit<PilotRequest, "requestId">) =>
  a.sessionId === b.sessionId && a.account === b.account && a.chainId === b.chainId && a.observedAtMs === b.observedAtMs && a.block === b.block;

/** Render guard: a prop change hides old decisions before React effects can run. */
export function gevPilotStateForWallet(state: GevPilotState, snapshot: WalletSnapshot, time = Date.now()): GevPilotState {
  const current = observation(snapshot, state.observation?.sessionId ?? "pending-0001", time);
  if (!current || !state.observation || !same(current, state.observation)) return { ...initialGevPilotState(), reason: snapshot.status === "reading" ? "wallet_reading" : snapshot.chainId && snapshot.chainId !== "0xc4" ? "network_outside_pilot" : "wallet_unavailable" };
  if (state.activePlan && state.cycle && time >= Math.min(state.activePlan.expiresAtMs, state.cycle.validUntilMs))
    return { ...state, status: "expired", reason: "cycle_expired", activePlan: null };
  return state;
}

/** Only the page supplies wallet observations; no provider, RPC, polling or executor. */
export function createGevPilotController(options: GevPilotOptions = {}): GevPilotController {
  const now = options.now ?? Date.now;
  const nonce = options.nonce ?? (() => crypto.randomUUID());
  const sessionId = options.sessionId ?? nonce();
  const transport = options.fetch ?? ((url, init) => fetch(url, init));
  const scheduler = options.scheduler ?? {
    setTimeout: (fn: () => void, ms: number) => globalThis.setTimeout(fn, ms),
    clearTimeout: (handle: unknown) => globalThis.clearTimeout(handle as ReturnType<typeof setTimeout>),
  };
  const deadlineMs = options.requestDeadlineMs ?? 20_000;
  const endpoint = options.endpoint ?? GEV_PILOT_ENDPOINT;
  if (!nonceValid(sessionId) || !Number.isSafeInteger(deadlineMs) || deadlineMs <= 0 || deadlineMs > 30_000 || !endpointValid(endpoint)) throw new Error("invalid_pilot_options");
  let request: Omit<PilotRequest, "requestId"> | null = null;
  let state = initialGevPilotState();
  let disposed = false;
  let generation = 0;
  let pending: AbortController | null = null;
  let walletTimer: unknown;
  let planTimer: unknown;
  const listeners = new Set<() => void>();
  function publish(next: GevPilotState) { state = next; for (const listener of listeners) listener(); }
  function cancel() { generation++; pending?.abort(); pending = null; scheduler.clearTimeout(planTimer); }
  function invalidate(reason: string) {
    cancel(); request = null; scheduler.clearTimeout(walletTimer);
    publish({ ...initialGevPilotState(), reason });
  }
  function reconcile() {
    const time = now();
    if (request && (!stamp(time) || time < request.observedAtMs || time - request.observedAtMs > PILOT_MAX_AGE_MS)) { invalidate("wallet_stale"); return; }
    if (state.activePlan && state.cycle && time >= Math.min(state.activePlan.expiresAtMs, state.cycle.validUntilMs)) {
      scheduler.clearTimeout(planTimer);
      publish({ ...state, status: "expired", reason: "cycle_expired", activePlan: null });
    }
  }
  return {
    getSnapshot() { reconcile(); return state; },
    subscribe(listener) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    setWallet(snapshot) {
      if (disposed) return;
      const next = observation(snapshot, sessionId, now());
      if (next && request && same(next, request)) { reconcile(); return; }
      cancel(); scheduler.clearTimeout(walletTimer); request = next;
      if (request) walletTimer = scheduler.setTimeout(reconcile, request.observedAtMs + PILOT_MAX_AGE_MS + 1 - now());
      publish({ ...initialGevPilotState(), status: request ? "ready" : "blocked", canEvaluate: !!request, reason: request ? "ready" :
        snapshot.status === "reading" ? "wallet_reading" : snapshot.chainId && snapshot.chainId !== "0xc4" ? "network_outside_pilot" : "wallet_unavailable",
        observation: request, contextKey: request ? pilotContextKey({ ...request, requestId: "pending-0001" }) : null });
    },
    async evaluate() {
      reconcile();
      if (disposed || !request || pending) return;
      const requestId = nonce();
      if (!nonceValid(requestId)) { publish({ ...state, status: "error", reason: "invalid_request_id", cycle: null, activePlan: null }); return; }
      const captured: PilotRequest = { ...request, requestId };
      const revision = ++generation;
      const abort = new AbortController(); pending = abort;
      scheduler.clearTimeout(planTimer);
      const deadlineAt = now() + deadlineMs;
      let removeAbortListener = () => {};
      const aborted = new Promise<never>((_resolve, reject) => {
        const listener = () => reject(new Error(abort.signal.reason === "request_timeout" ? "request_timeout" : "request_cancelled"));
        abort.signal.addEventListener("abort", listener, { once: true });
        removeAbortListener = () => abort.signal.removeEventListener("abort", listener);
      });
      const deadlineTimer = scheduler.setTimeout(() => abort.abort("request_timeout"), deadlineMs);
      publish({ ...state, status: "evaluating", canEvaluate: false, reason: "evaluating", cycle: null, activePlan: null });
      try {
        const value: unknown = await Promise.race([aborted, (async () => {
          const response = await transport(endpoint, { method: "POST", headers: { "Content-Type": "application/json" },
            credentials: "omit", redirect: "error", cache: "no-store", body: JSON.stringify(captured), signal: abort.signal });
          if (!response.ok) throw new Error("service_unavailable");
          if (response.redirected || (response.url && response.url !== endpoint) || !/^application\/json(?:\s*;|$)/i.test(response.headers.get("content-type") ?? "")) throw new Error("invalid_response");
          const length = response.headers.get("content-length");
          if (length && (!/^[0-9]+$/.test(length) || Number(length) > 131_072)) throw new Error("invalid_response");
          const body = await response.text();
          if (body.length > 131_072) throw new Error("invalid_response");
          try { return JSON.parse(body); } catch { throw new Error("invalid_response"); }
        })()]);
        reconcile();
        if (disposed || revision !== generation || !request || !same(request, captured)) return;
        if (now() >= deadlineAt) throw new Error("request_timeout");
        if (!cycleValid(value, captured, now())) throw new Error("invalid_response");
        const expiry = value.plan ? Math.min(value.plan.expiresAtMs, value.validUntilMs) : null;
        const expired = expiry !== null && now() >= expiry;
        publish({ ...state, status: expired ? "expired" : value.status, canEvaluate: true, reason: expired ? "cycle_expired" : value.status,
          cycle: value, activePlan: expired ? null : value.plan });
        if (expiry !== null && !expired) planTimer = scheduler.setTimeout(reconcile, expiry - now());
      } catch (error) {
        reconcile();
        if (disposed || revision !== generation || !request) return;
        const reason = error instanceof Error && ["request_timeout", "invalid_response"].includes(error.message) ? error.message : "service_unavailable";
        publish({ ...state, status: "error", canEvaluate: true, reason, cycle: null, activePlan: null });
      } finally {
        scheduler.clearTimeout(deadlineTimer); removeAbortListener();
        if (pending === abort) pending = null;
      }
    },
    dispose() { disposed = true; cancel(); request = null; scheduler.clearTimeout(walletTimer); listeners.clear(); state = initialGevPilotState(); },
  };
}
