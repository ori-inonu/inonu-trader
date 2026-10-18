/**
 * The state of the autonomous agent (AUT-1, AUT-30): there is exactly one authorization, and it is connecting a wallet. The person reads, once, what that means (the agent decides everything about the
 * portfolio: risk, capital, growth, leverage, purchases and sales, and asks nothing more) and connects; from then on the agent works by itself, with no mode to pick, no permission to grant per order and no
 * supervision. Disconnecting is the way back, and it is immediate. The agent keeps its own risk discipline: when its circuit breaker trips it pauses its NEW purchases for a while (exits and stops go on); that
 * pause is its decision, recorded here with the reason. What the agent is doing with the money (analysing only, or trading) follows from what is ready, not from a switch (see wire.ts). A state file that cannot be
 * trusted loads as not connected, never as connected.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { Mode } from "./types";

/** The version of the notice shown when connecting. Changing the text changes this, and a connection made under an older notice is not carried over. */
export const DISCLOSURE = "2026-10-14.1";

/** A thing that happened to the agent's authority, who or what caused it. The agent's own decisions are as visible as the person's. */
export interface AgentEvent {
  readonly atMs: number;
  readonly kind: "conectou" | "desconectou" | "pausou" | "retomou";
  /** A constant code (see the screen's words). */
  readonly reason: string;
}

export interface AgentState {
  readonly version: 3;
  /** The one authorization: the person connected a wallet knowing the agent decides everything. */
  readonly connected: boolean;
  readonly connectedAtMs: number | null;
  /** The notice the person saw when connecting. */
  readonly disclosure: string | null;
  /** New purchases are paused until then, by the agent's own circuit breaker; null when they are not. */
  readonly pausedUntilMs: number | null;
  readonly pauseReason: string | null;
  readonly changedAtMs: number | null;
  /** The last events, newest last. */
  readonly events: readonly AgentEvent[];
}

/** What the cycle and the scheduler need to know to run: what the agent may do with the money right now, derived from what is ready (wire.ts), and whether it is stopped. */
export interface RunState {
  get(): { readonly mode: Mode; readonly stopped: boolean };
}

export type ConnectResult = { readonly ok: true; readonly state: AgentState } | { readonly ok: false; readonly reason: "aviso_desatualizado" | "nao_gravou" };

export interface AgentStateController {
  get(): AgentState;
  /** The person connects the wallet, having read the notice (its version is the proof): the agent starts working. */
  connect(disclosure: string): ConnectResult;
  /** The person disconnects: the agent stops at once and nothing runs until a new connection. Never fails. */
  disconnect(): AgentState;
  /** The agent's own circuit breaker: no new purchase until `untilMs`. Only while connected. */
  pause(untilMs: number, reason: string): AgentState;
  /** Lifts the pause (it also ends by itself when the time passes). */
  resume(reason: string): AgentState;
  /** The last change could not be written to disk (the memory has it anyway). A disconnection in that case is made durable by the stop file the next start reads. */
  persistFailed(): boolean;
}

export interface AgentStateDeps {
  /** The saved state, or null when there is none. Throws or returns unparseable data when the file cannot be trusted. */
  readonly load: () => unknown;
  readonly persist: (state: AgentState) => void;
  readonly now: () => number;
}

/** New purchases are paused at this instant. */
export const isPaused = (state: Pick<AgentState, "pausedUntilMs">, nowMs: number): boolean => state.pausedUntilMs !== null && nowMs < state.pausedUntilMs;

const MAX_EVENTS = 20;
const FRESH: AgentState = { version: 3, connected: false, connectedAtMs: null, disclosure: null, pausedUntilMs: null, pauseReason: null, changedAtMs: null, events: [] };

const isMs = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v) && v >= 0;
const rec = (v: unknown): Record<string, unknown> | null => (v !== null && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null);
const exact = (o: Record<string, unknown>, keys: readonly string[]): boolean => Object.keys(o).length === keys.length && keys.every((k) => Object.hasOwn(o, k));
const CODE = /^[a-z_]{1,40}$/;

function parseEvents(raw: unknown): readonly AgentEvent[] | null {
  if (!Array.isArray(raw) || raw.length > MAX_EVENTS) return null;
  const out: AgentEvent[] = [];
  for (const item of raw) {
    const e = rec(item);
    if (e === null || !exact(e, ["atMs", "kind", "reason"]) || !isMs(e.atMs) || !["conectou", "desconectou", "pausou", "retomou"].includes(e.kind as string) || typeof e.reason !== "string" || !CODE.test(e.reason)) return null;
    out.push({ atMs: e.atMs, kind: e.kind as AgentEvent["kind"], reason: e.reason });
  }
  return out;
}

/**
 * The exact shape only. A state of an earlier version (it had modes, and a permission to trade) is not carried over as connected: the person connects again, under the new notice. A connected state without
 * the notice it was connected under, or a pause while not connected, is not trusted.
 */
export function parseAgentState(raw: unknown): AgentState | null {
  const o = rec(raw);
  if (o === null) return null;
  if (o.version === 1 || o.version === 2) return FRESH;
  if (!exact(o, ["version", "connected", "connectedAtMs", "disclosure", "pausedUntilMs", "pauseReason", "changedAtMs", "events"]) || o.version !== 3 || typeof o.connected !== "boolean") return null;
  if (o.connectedAtMs !== null && !isMs(o.connectedAtMs)) return null;
  if (o.changedAtMs !== null && !isMs(o.changedAtMs)) return null;
  if (o.disclosure !== null && (typeof o.disclosure !== "string" || o.disclosure.length > 40)) return null;
  if (o.pausedUntilMs !== null && !isMs(o.pausedUntilMs)) return null;
  if (o.pauseReason !== null && (typeof o.pauseReason !== "string" || !CODE.test(o.pauseReason))) return null;
  if ((o.pausedUntilMs === null) !== (o.pauseReason === null)) return null;
  if (o.connected && (o.connectedAtMs === null || o.disclosure === null)) return null;
  if (!o.connected && o.connectedAtMs !== null) return null;
  // saved under a notice that is not the current one: the connection is not carried over (the pause the agent put on itself is)
  if (o.connected && o.disclosure !== DISCLOSURE) return { ...FRESH, pausedUntilMs: o.pausedUntilMs as number | null, pauseReason: o.pauseReason as string | null };
  const events = parseEvents(o.events);
  if (events === null) return null;
  return { version: 3, connected: o.connected, connectedAtMs: o.connectedAtMs as number | null, disclosure: o.disclosure as string | null, pausedUntilMs: o.pausedUntilMs as number | null, pauseReason: o.pauseReason as string | null, changedAtMs: o.changedAtMs as number | null, events };
}

export function createAgentState(deps: AgentStateDeps): AgentStateController {
  let state: AgentState;
  let loaded: unknown;
  try {
    loaded = deps.load();
  } catch {
    loaded = undefined;
  }
  // a file that cannot be trusted is a person who has not connected: nothing runs until they do
  if (loaded === null) state = FRESH;
  else state = parseAgentState(loaded) ?? FRESH;

  let lastSaveFailed = false;
  const save = (next: AgentState): boolean => {
    try {
      deps.persist(next);
      lastSaveFailed = false;
      return true;
    } catch {
      lastSaveFailed = true;
      return false;
    }
  };
  const withEvent = (base: AgentState, kind: AgentEvent["kind"], reason: string, now: number): AgentState => ({ ...base, changedAtMs: now, events: [...base.events, { atMs: now, kind, reason }].slice(-MAX_EVENTS) });

  return {
    get: () => state,
    connect(disclosure) {
      if (disclosure !== DISCLOSURE) return { ok: false, reason: "aviso_desatualizado" };
      const now = deps.now();
      if (state.connected) return { ok: true, state };
      // the pause the agent put on its own purchases is not undone by connecting again (it ends when its time does)
      const next = withEvent({ ...state, connected: true, connectedAtMs: now, disclosure }, "conectou", "conectou", now);
      if (!save(next)) return { ok: false, reason: "nao_gravou" };
      state = next;
      return { ok: true, state: next };
    },
    disconnect() {
      const now = deps.now();
      if (!state.connected) return state;
      // the memory changes first and never fails because of the disk: disconnecting is the way out
      const next = withEvent({ ...state, connected: false, connectedAtMs: null }, "desconectou", "desconectou", now);
      state = next;
      save(next);
      return next;
    },
    persistFailed: () => lastSaveFailed,
    pause(untilMs, reason) {
      const now = deps.now();
      if (!state.connected || !isMs(untilMs) || untilMs <= now || !CODE.test(reason)) return state;
      const next = withEvent({ ...state, pausedUntilMs: untilMs, pauseReason: reason }, "pausou", reason, now);
      state = next;
      save(next);
      return next;
    },
    resume(reason) {
      const now = deps.now();
      if (state.pausedUntilMs === null || !CODE.test(reason)) return state;
      const next = withEvent({ ...state, pausedUntilMs: null, pauseReason: null }, "retomou", reason, now);
      state = next;
      save(next);
      return next;
    },
  };
}

/** Atomic file persistence: a half-written file is never read back. A missing file is a fresh agent; an unreadable one loads as not connected. */
export function agentStateFile(path: string): Pick<AgentStateDeps, "load" | "persist"> {
  return {
    load: () => {
      if (!existsSync(path)) return null;
      return JSON.parse(readFileSync(path, "utf8")) as unknown;
    },
    persist: (state) => {
      mkdirSync(dirname(path), { recursive: true });
      const tmp = `${path}.${process.pid}.tmp`;
      writeFileSync(tmp, `${JSON.stringify(state)}\n`);
      renameSync(tmp, path);
    },
  };
}
