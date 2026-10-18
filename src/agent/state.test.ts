import { describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { agentStateFile, createAgentState, DISCLOSURE, isPaused, parseAgentState, type AgentState } from "./state";

const state3 = (over: Partial<AgentState> = {}): AgentState => ({ version: 3, connected: false, connectedAtMs: null, disclosure: null, pausedUntilMs: null, pauseReason: null, changedAtMs: null, events: [], ...over });
const connected = (over: Partial<AgentState> = {}): AgentState => state3({ connected: true, connectedAtMs: 1, disclosure: DISCLOSURE, changedAtMs: 1, ...over });
const memory = (initial: AgentState | null = null) => {
  const saved: AgentState[] = [];
  return { saved, load: () => initial, persist: (s: AgentState) => void saved.push(s) };
};

describe("the one authorization is connecting a wallet", () => {
  test("the agent is born not connected", () => {
    const state = createAgentState({ ...memory(), now: () => 1000 });
    expect(state.get()).toMatchObject({ connected: false, connectedAtMs: null, pausedUntilMs: null, events: [] });
  });

  test("connecting under the current notice starts it, with nothing else to say", () => {
    const m = memory();
    const state = createAgentState({ ...m, now: () => 1000 });
    expect(state.connect(DISCLOSURE)).toMatchObject({ ok: true });
    expect(state.get()).toMatchObject({ connected: true, connectedAtMs: 1000, disclosure: DISCLOSURE });
    expect(state.get().events).toEqual([{ atMs: 1000, kind: "conectou", reason: "conectou" }]);
    expect(m.saved).toHaveLength(1);
  });

  test("a notice that is not the current one does not connect", () => {
    const state = createAgentState({ ...memory(), now: () => 1000 });
    expect(state.connect("1999-01-01")).toEqual({ ok: false, reason: "aviso_desatualizado" });
    expect(state.connect("")).toEqual({ ok: false, reason: "aviso_desatualizado" });
    expect(state.get().connected).toBe(false);
  });

  test("connecting twice changes nothing and writes nothing the second time", () => {
    const m = memory();
    const state = createAgentState({ ...m, now: () => 1000 });
    state.connect(DISCLOSURE);
    state.connect(DISCLOSURE);
    expect(m.saved).toHaveLength(1);
  });

  test("a connection that cannot be saved does not happen", () => {
    const state = createAgentState({ load: () => null, persist: () => { throw new Error("disk"); }, now: () => 3 });
    expect(state.connect(DISCLOSURE)).toEqual({ ok: false, reason: "nao_gravou" });
    expect(state.get().connected).toBe(false);
  });
});

describe("disconnecting is immediate and always works", () => {
  test("stops the agent and says so, and keeps the agent's own pause of purchases: leaving and coming back is not a way round its circuit breaker", () => {
    const state = createAgentState({ ...memory(connected({ pausedUntilMs: 9000, pauseReason: "disjuntor_de_perda" })), now: () => 5000 });
    state.disconnect();
    expect(state.get()).toMatchObject({ connected: false, connectedAtMs: null, pausedUntilMs: 9000, pauseReason: "disjuntor_de_perda" });
    expect(state.get().events.at(-1)).toEqual({ atMs: 5000, kind: "desconectou", reason: "desconectou" });
    state.connect(DISCLOSURE);
    expect(state.get()).toMatchObject({ connected: true, pausedUntilMs: 9000, pauseReason: "disjuntor_de_perda" });
    expect(isPaused(state.get(), 5001)).toBe(true);
    // it ends by itself, or by the agent's own decision
    expect(isPaused(state.get(), 9001)).toBe(false);
    state.resume("disjuntor_liberado");
    expect(state.get().pausedUntilMs).toBeNull();
  });

  test("a disk that fails to write the disconnection is said, so the caller can leave the stop file the next start reads", () => {
    let fail = false;
    const state = createAgentState({ load: () => connected(), persist: () => { if (fail) throw new Error("disk"); }, now: () => 3 });
    expect(state.persistFailed()).toBe(false);
    fail = true;
    state.disconnect();
    expect(state.get().connected).toBe(false);
    expect(state.persistFailed()).toBe(true);
  });

  test("works even when the disk fails", () => {
    const state = createAgentState({ load: () => connected(), persist: () => { throw new Error("disk"); }, now: () => 3 });
    expect(() => state.disconnect()).not.toThrow();
    expect(state.get().connected).toBe(false);
  });

  test("disconnecting what is not connected writes nothing", () => {
    const m = memory();
    createAgentState({ ...m, now: () => 1 }).disconnect();
    expect(m.saved).toHaveLength(0);
  });
});

describe("the agent's own pause of new purchases", () => {
  test("is set by the agent only while connected, with a reason, and ends by itself", () => {
    const off = createAgentState({ ...memory(), now: () => 100 });
    off.pause(5000, "disjuntor_de_perda");
    expect(off.get().pausedUntilMs).toBeNull();
    const on = createAgentState({ ...memory(connected()), now: () => 100 });
    on.pause(5000, "disjuntor_de_perda");
    expect(on.get()).toMatchObject({ pausedUntilMs: 5000, pauseReason: "disjuntor_de_perda" });
    expect(isPaused(on.get(), 4999)).toBe(true);
    expect(isPaused(on.get(), 5000)).toBe(false);
    expect(isPaused(connected(), 1)).toBe(false);
  });

  test("a pause that ends in the past, or has a reason that is not a code, is not a pause", () => {
    const on = createAgentState({ ...memory(connected()), now: () => 100 });
    on.pause(50, "disjuntor_de_perda");
    on.pause(5000, "Not A Code!");
    expect(on.get().pausedUntilMs).toBeNull();
  });

  test("can be lifted, and says so", () => {
    const on = createAgentState({ ...memory(connected({ pausedUntilMs: 9000, pauseReason: "evidencia_perdida" })), now: () => 200 });
    on.resume("retomou");
    expect(on.get()).toMatchObject({ pausedUntilMs: null, pauseReason: null });
    expect(on.get().events.at(-1)).toMatchObject({ kind: "retomou" });
  });

  test("keeps only the last twenty events", () => {
    const on = createAgentState({ ...memory(connected()), now: () => 100 });
    for (let i = 0; i < 30; i++) {
      on.pause(1_000_000 + i, "disjuntor_de_perda");
      on.resume("retomou");
    }
    expect(on.get().events).toHaveLength(20);
  });
});

describe("a state file that is not trusted is a person who has not connected", () => {
  test("parse accepts only the exact shape", () => {
    const good = connected();
    expect(parseAgentState(good)).toEqual(good);
    expect(parseAgentState({ ...good, extra: 1 })).toBeNull();
    expect(parseAgentState({ ...good, version: 4 })).toBeNull();
    expect(parseAgentState({ ...good, connected: "yes" })).toBeNull();
    expect(parseAgentState({ ...good, connectedAtMs: null })).toBeNull();
    expect(parseAgentState({ ...good, disclosure: null })).toBeNull();
    expect(parseAgentState({ ...good, pausedUntilMs: 5 })).toBeNull();
    expect(parseAgentState({ ...good, pausedUntilMs: 5, pauseReason: "BAD" })).toBeNull();
    // a pause outlives a disconnection; a pause with no reason, or a reason with no pause, is not a pause
    expect(parseAgentState(state3({ pausedUntilMs: 5, pauseReason: "x" }))).toEqual(state3({ pausedUntilMs: 5, pauseReason: "x" }));
    expect(parseAgentState(state3({ pausedUntilMs: 5 }))).toBeNull();
    // a connection saved under another notice is not carried over: the person connects again under the current one
    expect(parseAgentState(connected({ disclosure: "1999-01-01" }))).toMatchObject({ connected: false, connectedAtMs: null });
    expect(parseAgentState({ ...good, events: [{ atMs: 1, kind: "voou", reason: "x" }] })).toBeNull();
    expect(parseAgentState({ ...good, events: Array.from({ length: 21 }, () => ({ atMs: 1, kind: "pausou", reason: "x" })) })).toBeNull();
    expect(parseAgentState(null)).toBeNull();
  });

  test("a state of an earlier version, with its modes and permissions, is not carried over as connected", () => {
    expect(parseAgentState({ version: 1, mode: "limitado", stopped: false, stoppedAtMs: null, changedAtMs: 1 })).toEqual(state3());
    expect(parseAgentState({ version: 2, mode: "limitado", stopped: false, stoppedAtMs: null, changedAtMs: 1, consent: { granted: true, atMs: 1 }, moves: [] })).toEqual(state3());
  });

  test("a corrupt file loads as not connected", () => {
    const dir = mkdtempSync(join(tmpdir(), "agent-state-"));
    try {
      const path = join(dir, "state.json");
      writeFileSync(path, "{not json");
      expect(createAgentState({ ...agentStateFile(path), now: () => 11 }).get().connected).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("a missing file is a fresh agent, and a connection is read back by a new process", () => {
    const dir = mkdtempSync(join(tmpdir(), "agent-state-"));
    try {
      const path = join(dir, "sub", "state.json");
      const first = createAgentState({ ...agentStateFile(path), now: () => 10 });
      expect(first.get().connected).toBe(false);
      expect(first.connect(DISCLOSURE)).toMatchObject({ ok: true });
      expect(JSON.parse(readFileSync(path, "utf8"))).toMatchObject({ version: 3, connected: true, connectedAtMs: 10, disclosure: DISCLOSURE });
      const second = createAgentState({ ...agentStateFile(path), now: () => 20 });
      expect(second.get()).toMatchObject({ connected: true, connectedAtMs: 10 });
      second.disconnect();
      expect(createAgentState({ ...agentStateFile(path), now: () => 30 }).get().connected).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
