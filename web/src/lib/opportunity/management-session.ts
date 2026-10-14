import type { AskAnswer, AskRequest } from "../inonu/client";
import type { BalanceRead } from "./balance";
import type { LastPicks } from "./last-picks";

export const SALDO_FRESH_MS = 120_000;
export const SALDO_FUTURE_MS = 5_000;
export const ASK_MAX_BODY_BYTES = 2_048;

export type BalanceReadiness = "unavailable" | "stale" | "partial" | "ready";

export function balanceRequestFits(read: BalanceRead): boolean {
  return read.saldo !== null && new TextEncoder().encode(JSON.stringify({ modo: "ecossistema", saldo: read.saldo })).length <= ASK_MAX_BODY_BYTES;
}

export function balanceReadiness(read: BalanceRead | null, nowMs: number): BalanceReadiness {
  if (read === null || read.saldo === null) return "unavailable";
  const saldo = read.saldo;
  const cov = read.coverage;
  if (!Number.isFinite(nowMs) || nowMs <= 0 || saldo.observedAtMs > nowMs + SALDO_FUTURE_MS || nowMs - saldo.observedAtMs > SALDO_FRESH_MS || cov.stale) return "stale";
  if (read.missing.length > 0 || cov.skippedChains.length > 0 || !cov.networkListKnown || cov.unpricedRows > 0 || cov.flaggedRows > 0 || cov.truncated || !balanceRequestFits(read)) return "partial";
  return "ready";
}

export interface ManagementSnapshot {
  readonly phase: "idle" | "reading" | "ready" | "asking";
  readonly reading: BalanceRead | null;
  readonly consent: boolean;
  readonly last: LastPicks | null;
  readonly failure: string | null;
}

export interface ManagementDeps {
  readonly hasAccount: boolean;
  readonly read: (signal: AbortSignal) => Promise<BalanceRead>;
  readonly ask: (request: AskRequest, signal: AbortSignal, requestId: string) => Promise<AskAnswer>;
  readonly cancelRequest: (requestId: string) => Promise<boolean>;
  readonly now: () => number;
  readonly requestId: () => string;
  readonly isCurrent: () => boolean;
  readonly onAnswer: (last: LastPicks) => void;
  readonly onLedger: () => void;
}

export interface ManagementSession {
  get(): ManagementSnapshot;
  subscribe(listener: () => void): () => void;
  read(): Promise<void>;
  consent(value: boolean): void;
  analyze(mode: "market" | "portfolio"): Promise<void>;
  cancel(): void;
  dispose(): void;
  canPrepare(last: LastPicks): boolean;
}

interface Operation {
  readonly controller: AbortController;
  readonly requestId: string | null;
  readonly generation: number;
}

export function createManagementSession(deps: ManagementDeps): ManagementSession {
  let state: ManagementSnapshot = { phase: "idle", reading: null, consent: false, last: null, failure: null };
  let answeredRead: BalanceRead | null = null;
  let active: Operation | null = null;
  let generation = 0;
  let disposed = false;
  const listeners = new Set<() => void>();

  const emit = (next: ManagementSnapshot): void => {
    state = next;
    for (const listener of [...listeners]) listener();
  };
  const set = (patch: Partial<ManagementSnapshot>): void => emit({ ...state, ...patch });
  const current = (): boolean => !disposed && deps.isCurrent();
  const superseded = (op: Operation): boolean => active !== op || op.generation !== generation;
  const unusable = (op: Operation): boolean => superseded(op) || op.controller.signal.aborted || !current();
  const settlePhase = (): ManagementSnapshot["phase"] => (state.reading === null ? "idle" : "ready");

  async function read(): Promise<void> {
    if (!current() || active !== null || !deps.hasAccount) return;
    const op: Operation = { controller: new AbortController(), requestId: null, generation: ++generation };
    active = op;
    answeredRead = null;
    emit({ phase: "reading", reading: null, consent: false, last: null, failure: null });
    try {
      const result = await deps.read(op.controller.signal);
      if (unusable(op)) return;
      set({ phase: "ready", reading: result });
    } catch {
      if (unusable(op)) return;
      set({ phase: "idle", failure: "leitura_falhou" });
    } finally {
      if (active === op) active = null;
    }
  }

  function consent(value: boolean): void {
    if (!current()) return;
    if (!value) {
      set({ consent: false });
      return;
    }
    const reading = state.reading;
    if (reading === null || balanceReadiness(reading, deps.now()) !== "ready") return;
    set({ consent: true });
  }

  async function analyze(mode: "market" | "portfolio"): Promise<void> {
    if (!current() || active !== null) return;
    let request: AskRequest;
    let basis: BalanceRead | null = null;
    let basisSaldo: NonNullable<BalanceRead["saldo"]> | null = null;
    if (mode === "portfolio") {
      if (!state.consent) {
        set({ failure: "sem_consentimento" });
        return;
      }
      const reading = state.reading;
      if (reading === null || reading.saldo === null || balanceReadiness(reading, deps.now()) !== "ready") {
        set({ failure: "saldo_vencido" });
        return;
      }
      basis = reading;
      basisSaldo = reading.saldo;
      request = { modo: "ecossistema", saldo: reading.saldo };
    } else {
      request = { modo: "ecossistema" };
    }
    const requestId = deps.requestId();
    const op: Operation = { controller: new AbortController(), requestId, generation: ++generation };
    active = op;
    set({ phase: "asking", failure: null });
    try {
      const answer = await deps.ask(request, op.controller.signal, requestId);
      deps.onLedger();
      if (unusable(op)) return;
      if (basis !== null && (!state.consent || state.reading !== basis || balanceReadiness(basis, deps.now()) !== "ready")) {
        set({ failure: "saldo_vencido" });
        return;
      }
      if (answer.status === "respondido" && answer.oportunidades !== undefined) {
        const echoed = answer.oportunidades.saldo;
        const matches = basisSaldo === null ? echoed === null : echoed !== null && echoed.totalUsd === basisSaldo.totalUsd && echoed.cashUsd === basisSaldo.cashUsd;
        if (!matches) {
          set({ failure: "resposta_incompativel" });
          return;
        }
        const last: LastPicks = { answer: answer.oportunidades, atMs: deps.now(), briefHash: answer.briefHash, modelo: answer.modelo ?? null };
        answeredRead = basis;
        set({ last, failure: null });
        deps.onAnswer(last);
      } else {
        set({ failure: answer.motivo ?? answer.status });
      }
    } catch {
      if (unusable(op)) return;
      set({ failure: "pedido_falhou" });
    } finally {
      if (active === op) {
        active = null;
        if (current()) set({ phase: settlePhase() });
      }
    }
  }

  function cancel(): void {
    const op = active;
    if (op === null) return;
    generation += 1;
    active = null;
    op.controller.abort();
    if (op.requestId !== null) void deps.cancelRequest(op.requestId);
    if (current()) set({ phase: settlePhase(), failure: "cancelado" });
  }

  function dispose(): void {
    if (disposed) return;
    disposed = true;
    const op = active;
    active = null;
    op?.controller.abort();
    if (op !== null && op.requestId !== null) void deps.cancelRequest(op.requestId);
  }

  function canPrepare(last: LastPicks): boolean {
    return (
      current() &&
      active === null &&
      state.last !== null &&
      state.last === last &&
      last.answer.saldo !== null &&
      answeredRead !== null &&
      state.consent &&
      state.reading !== null &&
      state.reading === answeredRead &&
      balanceReadiness(state.reading, deps.now()) === "ready"
    );
  }

  return {
    get: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    read,
    consent,
    analyze,
    cancel,
    dispose,
    canPrepare,
  };
}
