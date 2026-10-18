import { afterAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { diskPersisted, httpAgentCall, planQuiescence, QuiesceError, quiesceLiveAgent, reconnectAgent, type AgentState, type Deps, type Envelope, type Persisted, type QuiesceCode } from "./handover-quiesce";

const SOL = "7e5H5fZsheG5KiuS8J1BU5j5U7mEqCaqNqfp3oSqPCFW";
const MANAGED = { kind: "agentica", evm: null, solana: SOL };
const DISC = "2026-10-14.1";

type Mode = "ok" | "throw_applied" | "throw_not_applied";

interface World {
  connected: boolean;
  persistedConnected: boolean;
  /** how many persisted reads after the disconnect still show the old connected state */
  persistLag: number;
  mode: string;
  plans: number;
  inFlight: number;
  unsettled: number;
  configHash: string;
  managed: object;
  orderLines: string[];
  ledgerMalformed: number;
  lockPid: number | null;
  portPid: number | null;
  alive: boolean;
  cores: number | null;
  /** the pid of the core process; defaults to the LOCK pid */
  corePid?: number | null;
  /** the hash plans.json reports; defaults to one derived from the plan count */
  planHash?: string | null;
  /** change the plan records the status shows, or the ones plans.json holds (same count, other content or order) */
  planTweak?: { status?: (plans: object[]) => object[]; disk?: (plans: object[]) => object[] };
  /** plans.json cannot be read: no count, no hash, no records */
  diskPlansUnreadable?: boolean;
  /** after the connect the LOCK, the port and the only core are a DIFFERENT process (a restart in the middle of the proof) */
  pidAfterConnect?: number;
  calls: string[];
  runReports: Envelope[];
  /** runs before each status answer, to script a race */
  onStatus?: (n: number, w: World) => void;
  statusCalls: number;
  now: number;
  /** the connect call leaves the persisted state untouched when false */
  connectPersists: boolean;
  /** the request fails after the server applied it (or without applying it): the answer is lost either way */
  disconnectMode: Mode;
  connectMode: Mode;
  /** after the disconnect, state.json says disconnected but the running agent's status still says connected */
  memoryConnectedAfterDisconnect: boolean;
  /** the mode the stale (still connected) status reports; the default is `limitado` */
  staleMemoryMode?: string;
  statusUnreadableAfterDisconnect: boolean;
  unhealthyAfterDisconnect: boolean;
  /** how many /agent/run calls throw (a timeout) before answering */
  runThrows: number;
  unhealthyAfterConnect: boolean;
  plansAfterConnect: number;
  portPidAfterConnect: number | null;
  statusPartialAfterConnect: boolean;
  statusUnreadableAfterConnect: boolean;
}

const world = (over: Partial<World> = {}): World => ({
  connected: true, persistedConnected: true, persistLag: 0, mode: "limitado", plans: 0, inFlight: 0, unsettled: 0, configHash: "cfg1", managed: MANAGED,
  orderLines: ['{"kind":"order","orderKey":"a","stage":"executada"}'], ledgerMalformed: 0, lockPid: 4242, portPid: 4242, alive: true, cores: 1,
  calls: [], runReports: [], statusCalls: 0, now: 0, connectPersists: true,
  disconnectMode: "ok", connectMode: "ok", memoryConnectedAfterDisconnect: false, statusUnreadableAfterDisconnect: false, unhealthyAfterDisconnect: false,
  runThrows: 0, unhealthyAfterConnect: false, plansAfterConnect: 0, portPidAfterConnect: null, statusPartialAfterConnect: false, statusUnreadableAfterConnect: false,
  ...over,
});

const OFF_REPORT = { mode: "desligado", consulted: false, orders: [] };

/** n plan records, as the status shows them and as plans.json holds them (the live agent shows the same fields in both places) */
const planList = (n: number): object[] => Array.from({ length: n }, (_, i) => ({ key: `501:A${i}`, symbol: `T${i}`, profile: "alvo_10", entryPriceUsd: 1 + i, peakPriceUsd: 2 + i, targetHit: false, trimmed: false }));

function deps(w: World): Deps {
  let lag = 0;
  const after = (call: string) => w.calls.includes(call);
  return {
    call: async (path, method) => {
      w.calls.push(`${method} ${path}`);
      if (path === "/agent/status") {
        w.statusCalls += 1;
        w.onStatus?.(w.statusCalls, w);
        const off = after("POST /agent/disconnect");
        const on = after("POST /agent/connect");
        if (w.statusUnreadableAfterDisconnect && off && !on) throw new Error("socket hang up");
        if (w.statusUnreadableAfterConnect && on) throw new Error("socket hang up");
        const staleMemory = w.memoryConnectedAfterDisconnect && off && !on;
        const connected = staleMemory ? true : w.connected;
        const unhealthy = (w.unhealthyAfterDisconnect && off && !on) || (w.unhealthyAfterConnect && on);
        const status: Record<string, unknown> = {
          state: { connected, disclosure: DISC }, mode: staleMemory ? (w.staleMemoryMode ?? "limitado") : w.mode, lock: true,
          health: { ledger: { ok: !unhealthy }, plans: { ok: true }, config: { ok: true } },
          plans: (w.planTweak?.status ?? ((p: object[]) => p))(planList(w.plans + (on ? w.plansAfterConnect : 0))), inFlight: Array.from({ length: w.inFlight }),
          config: { managed: w.managed }, budget: { day: "2026-10-15", consults: 190 },
        };
        if (w.statusPartialAfterConnect && on) delete status.health;
        return { ok: true, status };
      }
      if (path === "/agent/disconnect") {
        if (w.disconnectMode !== "throw_not_applied") { w.connected = false; w.mode = "desligado"; lag = w.persistLag; if (lag === 0) w.persistedConnected = false; }
        if (w.disconnectMode !== "ok") throw new Error("socket hang up");
        return { ok: true };
      }
      if (path === "/agent/run") {
        if (w.runThrows > 0) { w.runThrows -= 1; throw new Error("timeout"); }
        return { ok: true, report: w.runReports.shift() ?? (w.connected ? { mode: w.mode, consulted: true, orders: [] } : OFF_REPORT) };
      }
      if (path === "/agent/connect") {
        if (w.connectMode !== "throw_not_applied") { w.connected = true; w.mode = "limitado"; if (w.connectPersists) w.persistedConnected = true; }
        if (w.connectMode !== "ok") throw new Error("socket hang up");
        return { ok: true };
      }
      throw new Error("unexpected path");
    },
    persisted: async (): Promise<Persisted> => {
      if (!w.connected && lag > 0) { lag -= 1; if (lag === 0) w.persistedConnected = false; }
      const unreadable = w.diskPlansUnreadable === true;
      return { connected: w.persistedConnected, disclosure: DISC, configHash: w.configHash, plansOpen: unreadable ? null : w.plans, plansHash: unreadable ? null : w.planHash === undefined ? `ph${w.plans}` : w.planHash, plans: unreadable ? null : (w.planTweak?.disk ?? ((x: object[]) => x))(planList(w.plans)), unsettledOrders: w.unsettled, ledgerMalformed: w.ledgerMalformed, orderLines: [...w.orderLines] };
    },
    owner: async () => {
      const moved = after("POST /agent/connect") && w.pidAfterConnect !== undefined;
      const lockPid = moved ? w.pidAfterConnect! : w.lockPid;
      return { lockPid, portPid: moved ? w.pidAfterConnect! : after("POST /agent/connect") && w.portPidAfterConnect !== null ? w.portPidAfterConnect : w.portPid, alive: w.alive, cores: w.cores, corePid: moved ? w.pidAfterConnect! : w.corePid === undefined ? (w.cores === 1 ? w.lockPid : null) : w.corePid };
    },
    sleep: async (ms) => { w.now += ms; },
    now: () => w.now,
  };
}

const run = (w: World, opts = {}) => quiesceLiveAgent(deps(w), { pollMs: 1000, settleMaxMs: 30_000, ...opts });
const fails = async (p: Promise<unknown>) => { try { await p; return null; } catch (e) { return e as QuiesceError; } };
const mutating = (w: World) => w.calls.filter((c) => c.startsWith("POST"));

describe("the happy path and the order of the calls", () => {
  test("disconnect is the FIRST mutating call and /agent/run only comes after it; nothing is connected back or killed", async () => {
    const w = world();
    const r = await run(w);
    expect(mutating(w)).toEqual(["POST /agent/disconnect", "POST /agent/run"]);
    expect(r).toMatchObject({ quiescent: true, pid: 4242, disclosure: DISC, configHash: "cfg1", modeBefore: "limitado", orderRowsAtProof: 1 });
    expect(r.walletBinding).toBe(JSON.stringify(MANAGED));
  });
  test("a quiet agent is still read several times in a row before the disconnect (a single green is not enough)", async () => {
    const w = world();
    await run(w, { stableReads: 3 });
    const before = w.calls.slice(0, w.calls.indexOf("POST /agent/disconnect"));
    expect(before.filter((c) => c === "GET /agent/status").length).toBeGreaterThanOrEqual(4); // preflight + 3 stable reads
  });
});

describe("it refuses, and mutates NOTHING, when the preflight is not clean", () => {
  const cases: Record<string, Partial<World>> = {
    "not connected": { connected: false, persistedConnected: false },
    "already disabled": { mode: "desligado" },
    "a non-agentic wallet binding": { managed: { kind: "propria", evm: null, solana: SOL } },
    "a malformed solana address": { managed: { kind: "agentica", evm: null, solana: "short" } },
    "the persisted state says disconnected": { persistedConnected: false },
    "malformed ledger lines": { ledgerMalformed: 1 },
    "the LOCK does not name the port owner": { portPid: 9999 },
    "the LOCK owner is dead": { alive: false },
    "two cores": { cores: 2, corePid: null },
    "zero cores": { cores: 0, corePid: null },
    "an unreadable process inventory": { cores: null, corePid: null },
    "the only core is NOT the process the LOCK names": { corePid: 7777 },
  };
  for (const [name, over] of Object.entries(cases)) {
    test(name, async () => {
      const w = world(over);
      const e = await fails(run(w));
      expect(e).toBeInstanceOf(QuiesceError);
      expect(e!.agentState).toBe("running");
      expect(mutating(w)).toEqual([]);
    });
  }
  test("a status that cannot be read before anything changed surfaces as `running`, with no mutating call", async () => {
    const w = world();
    const d = deps(w);
    const e = await fails(quiesceLiveAgent({ ...d, call: async () => { throw new Error("connection refused"); } }));
    expect(e!.code).toBe("mutation_outcome_unknown");
    expect(e!.agentState).toBe("running");
    expect(w.calls).toEqual([]);
  });
});

describe("settling: wait for the real reconciliation, never kill on a timeout", () => {
  test("an order in flight that settles after a few reads: the disconnect waits for it", async () => {
    const w = world({ onStatus: (n, x) => { x.inFlight = n <= 3 ? 1 : 0; } });
    await run(w);
    expect(w.statusCalls).toBeGreaterThan(6);
    expect(mutating(w)[0]).toBe("POST /agent/disconnect");
  });
  test("an order that never settles: it gives up with unsettled_order, the agent is still RUNNING and nothing was mutated", async () => {
    const w = world({ inFlight: 1 });
    const e = await fails(run(w));
    expect(e!.code).toBe("unsettled_order");
    expect(e!.agentState).toBe("running");
    expect(mutating(w)).toEqual([]);
    expect(w.now).toBeGreaterThanOrEqual(30_000);
  });
  test("an unsettled order known only from the ledger (`enviando` or `incerta`) blocks the same way", async () => {
    const w = world({ unsettled: 1 });
    expect((await fails(run(w)))!.code).toBe("unsettled_order");
    expect(mutating(w)).toEqual([]);
  });
  test("an open plan blocks the same way", async () => {
    const w = world({ plans: 1 });
    expect((await fails(run(w)))!.code).toBe("unsettled_order");
    expect(mutating(w)).toEqual([]);
  });
  test("a race: the order shows up between two reads, the stable-read counter restarts", async () => {
    const w = world({ onStatus: (n, x) => { x.inFlight = n === 3 || n === 4 ? 1 : 0; } });
    await run(w, { stableReads: 3 });
    expect(w.statusCalls).toBeGreaterThanOrEqual(8);
  });
});

describe("planQuiescence: the READ-ONLY half, run against the real core before anything changes", () => {
  test("it returns the facts and calls NO mutating route, only GET /agent/status", async () => {
    const w = world();
    const plan = await planQuiescence(deps(w), { pollMs: 1000 });
    expect(plan).toMatchObject({ ready: true, pid: 4242, disclosure: DISC, configHash: "cfg1", mode: "limitado", orderRows: 1 });
    expect(plan.walletBinding).toBe(JSON.stringify(MANAGED));
    expect(mutating(w)).toEqual([]);
    expect(w.calls.every((c) => c === "GET /agent/status")).toBe(true);
  });
  test("it refuses exactly what the full path refuses at the preflight, with the agent still `running`", async () => {
    for (const over of [{ connected: false, persistedConnected: false }, { mode: "desligado" }, { portPid: 9999 }, { cores: 2 }, { ledgerMalformed: 1 }]) {
      const w = world(over);
      const e = await fails(planQuiescence(deps(w), { pollMs: 1000 }));
      expect(e).toBeInstanceOf(QuiesceError);
      expect(e!.agentState).toBe("running");
      expect(mutating(w)).toEqual([]);
    }
  });
  test("an order that never settles ends in unsettled_order, with no mutating call", async () => {
    const w = world({ inFlight: 1 });
    const e = await fails(planQuiescence(deps(w), { pollMs: 1000, settleMaxMs: 10_000 }));
    expect(e!.code).toBe("unsettled_order");
    expect(mutating(w)).toEqual([]);
  });
  test("an unreadable status becomes `running`, never a claim about a change that did not happen", async () => {
    const e = await fails(planQuiescence({ ...deps(world()), call: async () => { throw new Error("connection refused"); } }));
    expect(e!.code).toBe("mutation_outcome_unknown");
    expect(e!.agentState).toBe("running");
  });
});

describe("a disconnect request whose answer is lost is NOT a clean failure (Codex 172, defect 1)", () => {
  test("the server APPLIED the disconnect and then the answer was lost: the client reconciles from status and disk and goes on", async () => {
    const w = world({ disconnectMode: "throw_applied" });
    const r = await run(w);
    expect(r.quiescent).toBe(true);
    expect(mutating(w)).toEqual(["POST /agent/disconnect", "POST /agent/run"]);
  });
  test("the request failed and NOTHING was applied: disconnect_not_applied, state `running`, /agent/run never called", async () => {
    const w = world({ disconnectMode: "throw_not_applied" });
    const e = await fails(run(w));
    expect(e!.code).toBe("disconnect_not_applied");
    expect(e!.agentState).toBe("running");
    expect(mutating(w)).toEqual(["POST /agent/disconnect"]);
  });
  test("the answer is lost and the status cannot be read afterwards: the outcome is UNKNOWN, no run, no claim of either state", async () => {
    const w = world({ disconnectMode: "throw_applied", statusUnreadableAfterDisconnect: true });
    const e = await fails(run(w));
    expect(e!.code).toBe("mutation_outcome_unknown");
    expect(e!.agentState).toBe("unknown");
    expect(w.calls.includes("POST /agent/run")).toBe(false);
  });
});

describe("a disconnect that is not on disk, or not in memory", () => {
  test("the API says ok but state.json still says connected: disconnect_not_persisted, state `unknown`, never calls /agent/run", async () => {
    const w = world({ persistLag: 99 });
    const e = await fails(run(w));
    expect(e!.code).toBe("disconnect_not_persisted");
    expect(e!.agentState).toBe("unknown");
    expect(mutating(w)).toEqual(["POST /agent/disconnect"]);
  });
  test("a short lag in the write is tolerated by the bounded reconciliation", async () => {
    const w = world({ persistLag: 2 });
    expect((await run(w)).quiescent).toBe(true);
  });
  test("state.json says disconnected but the RUNNING agent still says connected: disconnect_not_confirmed and /agent/run is NEVER called (it would trade)", async () => {
    const w = world({ memoryConnectedAfterDisconnect: true });
    const e = await fails(run(w));
    expect(e!.code).toBe("disconnect_not_confirmed");
    expect(e!.agentState).toBe("unknown");
    expect(w.calls.includes("POST /agent/run")).toBe(false);
  });
  test("the reconciliation alone refuses a status that says connected even when its mode already reads `desligado`", async () => {
    const w = world({ memoryConnectedAfterDisconnect: true, staleMemoryMode: "desligado" });
    const e = await fails(run(w));
    expect(e!.code).toBe("disconnect_not_confirmed");
    expect(e!.agentState).toBe("unknown");
    expect(w.calls.includes("POST /agent/run")).toBe(false);
  });
  test("the status says desligado but is unhealthy: not confirmed, no run", async () => {
    const w = world({ unhealthyAfterDisconnect: true });
    const e = await fails(run(w));
    expect(e!.code).toBe("disconnect_not_confirmed");
    expect(w.calls.includes("POST /agent/run")).toBe(false);
  });
  test("the executor identity changes between the disconnect and the run: owner_mismatch, no run", async () => {
    const w = world({ onStatus: (_n, x) => { if (x.calls.includes("POST /agent/disconnect")) x.portPid = 7777; } });
    const e = await fails(run(w));
    expect(e!.code).toBe("owner_mismatch");
    expect(e!.agentState).toBe("disconnected");
    expect(w.calls.includes("POST /agent/run")).toBe(false);
  });
});

describe("proving the drain", () => {
  test("an order appears in a shared cycle: it waits for the real reconciliation and proves the drain on a later pass", async () => {
    const w = world();
    let first = true;
    w.runReports = [{ mode: "limitado", consulted: true, orders: [{ orderKey: "n", stage: "executada" }] }];
    w.onStatus = (_n, x) => {
      // after the first (non-drained) run report the new order is unsettled for a few reads, then settles and is appended to the ledger
      if (x.calls.includes("POST /agent/run") && first) { x.unsettled = x.statusCalls % 3 === 0 ? 0 : 1; if (x.unsettled === 0) { first = false; x.orderLines = [...x.orderLines, '{"kind":"order","orderKey":"n","stage":"executada"}']; } }
    };
    const r = await run(w);
    expect(w.calls.filter((c) => c === "POST /agent/run").length).toBe(2);
    expect(r.orderRowsAtProof).toBe(2);
  });
  test("a /agent/run that TIMES OUT is inconclusive, not a proof: it settles and proves the drain on the next pass", async () => {
    const w = world({ runThrows: 1 });
    const r = await run(w);
    expect(r.quiescent).toBe(true);
    expect(w.calls.filter((c) => c === "POST /agent/run").length).toBe(2);
  });
  test("an incomplete drain (every pass still consults): drain_unproven after exactly the allowed passes, agent left DISCONNECTED", async () => {
    const w = world();
    w.runReports = [1, 2, 3, 4].map(() => ({ mode: "limitado", consulted: true, orders: [] }));
    const e = await fails(run(w, { drainPasses: 3 }));
    expect(e!.code).toBe("drain_unproven");
    expect(e!.agentState).toBe("disconnected");
    expect(w.calls.filter((c) => c === "POST /agent/run").length).toBe(3);
  });
  test("a pass whose answer is disabled but that CONSULTED the model is NOT a proof either", async () => {
    const w = world();
    w.runReports = [{ mode: "desligado", consulted: true, orders: [] }, OFF_REPORT];
    expect((await run(w)).quiescent).toBe(true);
    expect(w.calls.filter((c) => c === "POST /agent/run").length).toBe(2);
  });
  test("a pass whose answer is disabled but carries an order is NOT a proof", async () => {
    const w = world();
    w.runReports = [{ mode: "desligado", consulted: false, orders: [{ orderKey: "x" }] }, OFF_REPORT];
    expect((await run(w)).quiescent).toBe(true);
    expect(w.calls.filter((c) => c === "POST /agent/run").length).toBe(2);
  });
});

describe("what must be identical at the end", () => {
  test("an order row that existed before was rewritten: orders_rewritten", async () => {
    const w = world();
    w.runReports = [OFF_REPORT];
    const base = deps(w);
    const e = await fails(quiesceLiveAgent({ ...base, persisted: async () => ({ ...(await base.persisted()), orderLines: w.calls.includes("POST /agent/disconnect") ? ['{"kind":"order","orderKey":"a","stage":"falhou"}'] : [...w.orderLines] }) }, { pollMs: 1000 }));
    expect(e!.code).toBe("orders_rewritten");
    expect(e!.agentState).toBe("disconnected");
  });
  test("a removed order row: orders_rewritten", async () => {
    const w = world();
    const base = deps(w);
    const e = await fails(quiesceLiveAgent({ ...base, persisted: async () => ({ ...(await base.persisted()), orderLines: w.calls.includes("POST /agent/disconnect") ? [] : [...w.orderLines] }) }, { pollMs: 1000 }));
    expect(e!.code).toBe("orders_rewritten");
  });
  test("config.json changed while quiescing: config_changed", async () => {
    const w = world();
    const base = deps(w);
    const e = await fails(quiesceLiveAgent({ ...base, persisted: async () => ({ ...(await base.persisted()), configHash: w.calls.includes("POST /agent/run") ? "cfg2" : "cfg1" }) }, { pollMs: 1000 }));
    expect(e!.code).toBe("config_changed");
    expect(e!.agentState).toBe("disconnected");
  });
  test("the managed wallet binding changed: wallet_changed", async () => {
    const w = world({ onStatus: (_n, x) => { if (x.calls.includes("POST /agent/run")) x.managed = { kind: "agentica", evm: "0x1", solana: SOL }; } });
    expect((await fails(run(w)))!.code).toBe("wallet_changed");
  });
  test("the process that holds the port changes at the end: owner_mismatch, flagged as disconnected", async () => {
    const w = world({ onStatus: (_n, x) => { if (x.calls.includes("POST /agent/run")) x.portPid = 7777; } });
    const e = await fails(run(w));
    expect(e!.code).toBe("owner_mismatch");
    expect(e!.agentState).toBe("disconnected");
  });
  test("it never terminates anything: the whole `calls` log has only HTTP routes", async () => {
    const w = world();
    await run(w);
    expect(w.calls.every((c) => /^(GET|POST) \/agent\/(status|disconnect|run)$/.test(c))).toBe(true);
  });
});

describe("reconnecting on the new version: success only after a COMPLETE proof (Codex 172, defect 2)", () => {
  const expected = { disclosure: DISC, walletBinding: JSON.stringify(MANAGED), configHash: "cfg1" };
  const quiet = (over: Partial<World> = {}) => world({ connected: false, persistedConnected: false, mode: "desligado", ...over });
  const attempt = (w: World) => reconnectAgent(deps(w), expected, { reconnectReads: 3 });

  test("the same disclosure and wallet, through the API, with exactly { disclosure } in the body", async () => {
    const w = quiet();
    const seen: unknown[] = [];
    const d = deps(w);
    await reconnectAgent({ ...d, call: async (p, m, b) => { if (p === "/agent/connect") seen.push(b); return d.call(p, m, b); } }, expected);
    expect(seen).toEqual([{ disclosure: DISC }]);
    expect(mutating(w)).toEqual(["POST /agent/connect"]);
  });
  test("an agent that is not a quiet disconnected one, or another config, is refused without a connect call", async () => {
    for (const over of [{ connected: true, persistedConnected: true, mode: "limitado" }, { configHash: "other" }, { plans: 1 }, { mode: "limitado" }]) {
      const w = quiet(over);
      const e = await fails(attempt(w));
      expect(e!.code).toBe("reconnect_precondition");
      expect(mutating(w)).toEqual([]);
    }
  });
  test("another wallet binding is refused before the connect call", async () => {
    const w = quiet({ managed: { kind: "agentica", evm: null, solana: "9".repeat(44) } });
    expect((await fails(attempt(w)))!.code).toBe("wallet_changed");
    expect(mutating(w)).toEqual([]);
  });
  test("a lock that names another process stops it before the connect call", async () => {
    const w = quiet({ portPid: 1 });
    expect((await fails(attempt(w)))!.code).toBe("owner_mismatch");
    expect(mutating(w)).toEqual([]);
  });
  test("the connect was APPLIED but its answer was lost: the full proof still passes", async () => {
    const w = quiet({ connectMode: "throw_applied" });
    expect(await attempt(w)).toEqual({ reconnected: true });
  });
  test("the connect failed and NOTHING was applied: connect_not_applied, the agent stays `disconnected`", async () => {
    const w = quiet({ connectMode: "throw_not_applied" });
    const e = await fails(attempt(w));
    expect(e!.code).toBe("connect_not_applied");
    expect(e!.agentState).toBe("disconnected");
  });
  test("a connect that the disk never shows is partial: the outcome is unknown, not success", async () => {
    const w = quiet({ connectPersists: false });
    const e = await fails(attempt(w));
    expect(e!.code).toBe("mutation_outcome_unknown");
    expect(e!.agentState).toBe("unknown");
  });
  test("the status cannot be read after the connect: unknown", async () => {
    const w = quiet({ statusUnreadableAfterConnect: true });
    const e = await fails(attempt(w));
    expect(e!.code).toBe("mutation_outcome_unknown");
    expect(e!.agentState).toBe("unknown");
  });
  test("bad health, a plan, a partial answer or another port owner AFTER the connect: reconnect_not_proven, state `running`, never success", async () => {
    for (const over of [{ unhealthyAfterConnect: true }, { plansAfterConnect: 1 }, { statusPartialAfterConnect: true }, { portPidAfterConnect: 5555 }]) {
      const w = quiet(over);
      const e = await fails(attempt(w));
      expect(e!.code).toBe("reconnect_not_proven");
      expect(e!.agentState).toBe("running");
    }
  });
  test("the proof is bounded: it reads at most reconnectReads times after the connect", async () => {
    const w = quiet({ unhealthyAfterConnect: true });
    await fails(reconnectAgent(deps(w), expected, { reconnectReads: 3 }));
    const afterConnect = w.calls.slice(w.calls.indexOf("POST /agent/connect") + 1).filter((c) => c === "GET /agent/status");
    expect(afterConnect.length).toBe(3);
  });
});

describe("open plans PRESERVED (allowOpenPlans): a held position must not make the pass wait for hours", () => {
  const keep = { allowOpenPlans: true } as const;

  test("the default stays strict: one open plan still blocks, as before", async () => {
    const w = world({ plans: 1 });
    expect((await fails(run(w)))!.code).toBe("unsettled_order");
    expect(mutating(w)).toEqual([]);
  });
  test("with one open plan it disconnects, proves the drain and returns the plan set the new version must load", async () => {
    const w = world({ plans: 1 });
    const r = await run(w, keep);
    expect(r).toMatchObject({ quiescent: true, plansHash: "ph1", plansCount: 1, allowOpenPlans: true });
    expect(mutating(w)).toEqual(["POST /agent/disconnect", "POST /agent/run"]);
  });
  test("an order in flight or unsettled still blocks, plans or not", async () => {
    for (const over of [{ plans: 1, inFlight: 1 }, { plans: 1, unsettled: 1 }]) {
      const w = world(over);
      expect((await fails(run(w, keep)))!.code).toBe("unsettled_order");
      expect(mutating(w)).toEqual([]);
    }
  });
  test("a plan file that keeps changing never becomes quiet: unsettled_order, nothing mutated", async () => {
    const w = world({ plans: 1, onStatus: (n, x) => { x.planHash = `churn-${n}`; } });
    const e = await fails(run(w, keep));
    expect(e!.code).toBe("unsettled_order");
    expect(mutating(w)).toEqual([]);
  });
  test("an unreadable plan file is not an open plan, it is unknown: it never passes", async () => {
    const w = world({ plans: 1, planHash: null });
    expect((await fails(run(w, keep)))!.code).toBe("unsettled_order");
    expect(mutating(w)).toEqual([]);
  });
  test("a plan set that changes AFTER the drain was proven is not a quiescent agent: plans_changed, state `disconnected`", async () => {
    const w = world({ plans: 1 });
    const base = deps(w);
    let reads = 0;
    const e = await fails(quiesceLiveAgent({
      ...base,
      persisted: async () => {
        const p = await base.persisted();
        // the first read after the disconnect/run is stable; a later read finds another file
        if (w.calls.includes("POST /agent/run")) { reads += 1; return { ...p, plansHash: reads >= 2 ? "changed" : p.plansHash }; }
        return p;
      },
    }, { pollMs: 1000, ...keep }));
    expect(e!.code).toBe("plans_changed");
    expect(e!.agentState).toBe("disconnected");
  });
  test("the strict mode keeps its exit-by-nothing guarantee: facts carry plansCount 0 and allowOpenPlans false", async () => {
    const r = await run(world());
    expect(r).toMatchObject({ plansCount: 0, allowOpenPlans: false });
  });

  describe("reconnecting after a preserved pass", () => {
    const expected = { disclosure: DISC, walletBinding: JSON.stringify(MANAGED), configHash: "cfg1", plansHash: "ph1", plansCount: 1 };
    const quiet = (over: Partial<World> = {}) => world({ connected: false, persistedConnected: false, mode: "desligado", plans: 1, ...over });
    const attempt = (w: World) => reconnectAgent(deps(w), expected, { reconnectReads: 3 });

    test("the new version loaded exactly the same plan set: it reconnects, and the plans may move afterwards (the agent resumes its exits)", async () => {
      const w = quiet({ onStatus: (_n, x) => { if (x.calls.includes("POST /agent/connect")) { x.plans = 0; x.planHash = "ph0"; } } });
      expect(await attempt(w)).toEqual({ reconnected: true });
      expect(mutating(w)).toEqual(["POST /agent/connect"]);
    });
    test("a different plan file, or a different number of plans, is refused BEFORE the connect call", async () => {
      for (const over of [{ planHash: "other" }, { plans: 2, planHash: "ph1" }, { plans: 0 }, { planHash: null }]) {
        const w = quiet(over);
        const e = await fails(attempt(w));
        expect(e!.code).toBe("reconnect_precondition");
        expect(mutating(w)).toEqual([]);
      }
    });
    test("something in flight before the connect is refused", async () => {
      const w = quiet({ inFlight: 1 });
      expect((await fails(attempt(w)))!.code).toBe("reconnect_precondition");
      expect(mutating(w)).toEqual([]);
    });
    test("an expected set with no plans still uses the strict precondition (no plan allowed)", async () => {
      const w = quiet({ plans: 1 });
      const e = await fails(reconnectAgent(deps(w), { disclosure: DISC, walletBinding: JSON.stringify(MANAGED), configHash: "cfg1" }, { reconnectReads: 3 }));
      expect(e!.code).toBe("reconnect_precondition");
    });
    test("health, identity and wallet are still proven after the connect even when plans are preserved", async () => {
      for (const over of [{ unhealthyAfterConnect: true }, { portPidAfterConnect: 5555 }, { statusPartialAfterConnect: true }]) {
        const w = quiet(over);
        const e = await fails(attempt(w));
        expect(e!.code).toBe("reconnect_not_proven");
        expect(e!.agentState).toBe("running");
      }
    });
  });
});

describe("review 174/175: the LAST observation carries the whole proof, and the executor is the same process throughout", () => {
  /** runs the change on the second status read after the proven drain: the last observation of the pass */
  const onLastObservation = (change: (w: World) => void) => (_n: number, x: World) => {
    const afterRun = x.calls.slice(x.calls.lastIndexOf("POST /agent/run") + 1);
    if (x.calls.includes("POST /agent/run") && afterRun.filter((c) => c === "GET /agent/status").length === 2) change(x);
  };
  const OTHER = "So11111111111111111111111111111111111111112";
  const cases: [string, (w: World) => void, QuiesceCode, AgentState][] = [
    ["the agent is connected again", (x) => { x.connected = true; x.mode = "limitado"; x.persistedConnected = true; }, "drain_unproven", "running"],
    ["an order is in flight", (x) => { x.inFlight = 1; }, "drain_unproven", "disconnected"],
    ["the ledger or plan health is bad", (x) => { x.unhealthyAfterDisconnect = true; }, "drain_unproven", "disconnected"],
    ["another wallet is bound", (x) => { x.managed = { kind: "agentica", evm: null, solana: OTHER }; }, "wallet_changed", "disconnected"],
    ["an order is left unsettled on disk", (x) => { x.unsettled = 1; }, "drain_unproven", "disconnected"],
    ["the ledger has a malformed line", (x) => { x.ledgerMalformed = 1; }, "drain_unproven", "disconnected"],
    ["config.json changed", (x) => { x.configHash = "cfg2"; }, "config_changed", "disconnected"],
    ["an order row that existed before was rewritten", (x) => { x.orderLines = ['{"kind":"order","orderKey":"a","stage":"falhou"}']; }, "orders_rewritten", "disconnected"],
    ["another process took the LOCK and the port", (x) => { x.lockPid = 5151; x.portPid = 5151; }, "owner_mismatch", "disconnected"],
  ];
  for (const [name, change, code, agentState] of cases) {
    test(`quiescent is not returned when, at the last read, ${name}`, async () => {
      const e = await fails(run(world({ onStatus: onLastObservation(change) })));
      expect(e).toBeInstanceOf(QuiesceError);
      expect(e!.code).toBe(code);
      expect(e!.agentState).toBe(agentState);
    });
  }
  test("the facts handed back are those of the last observation, not of the one before it", async () => {
    const w = world({ onStatus: onLastObservation((x) => { x.orderLines = [...x.orderLines, '{"kind":"order","orderKey":"b","stage":"executada"}']; }) });
    expect((await run(w)).orderRowsAtProof).toBe(2);
  });
  test("a different executor from the first read, even a consistent one, invalidates the pass and nothing is stopped", async () => {
    const w = world({ onStatus: (_n, x) => { if (x.calls.includes("POST /agent/disconnect")) { x.lockPid = 5151; x.portPid = 5151; } } });
    const e = await fails(run(w));
    expect(e!.code).toBe("owner_mismatch");
    expect(e!.agentState).toBe("disconnected");
    expect(mutating(w)).not.toContain("POST /agent/connect");
  });
  test("the plan set the status shows must be the one plans.json holds, record by record, at the end of a preserved pass", async () => {
    const w = world({ plans: 1, planTweak: { disk: (p) => p.map((x) => ({ ...x, key: "501:OTHER" })) } });
    const e = await fails(run(w, { allowOpenPlans: true }));
    expect(e!.code).toBe("plans_changed");
  });
  test("it hands back a digest of the plan set (an empty one in the strict mode) for the facts file", async () => {
    expect(typeof (await run(world({ plans: 1 }), { allowOpenPlans: true })).plansDigest).toBe("string");
    expect(typeof (await run(world())).plansDigest).toBe("string");
  });

  describe("reconnecting", () => {
    const strict = { disclosure: DISC, walletBinding: JSON.stringify(MANAGED), configHash: "cfg1" };
    const kept = { ...strict, plansHash: "ph1", plansCount: 1 };
    const quiet = (over: Partial<World> = {}) => world({ connected: false, persistedConnected: false, mode: "desligado", ...over });
    const attempt = (w: World, expected: object) => reconnectAgent(deps(w), expected as never, { reconnectReads: 3 });
    const refusedBeforeConnect = async (w: World, expected: object) => {
      const e = await fails(attempt(w, expected));
      expect(e!.code).toBe("reconnect_precondition");
      expect(e!.agentState).toBe("disconnected");
      expect(mutating(w)).toEqual([]);
    };

    test("an order left unsettled, or a malformed ledger, stops the reconnect BEFORE the connect call in both modes", async () => {
      await refusedBeforeConnect(quiet({ unsettled: 1 }), strict);
      await refusedBeforeConnect(quiet({ ledgerMalformed: 1 }), strict);
      await refusedBeforeConnect(quiet({ plans: 1, unsettled: 1 }), kept);
      await refusedBeforeConnect(quiet({ plans: 1, ledgerMalformed: 1 }), kept);
    });
    test("an unreadable plan file stops it in both modes", async () => {
      await refusedBeforeConnect(quiet({ diskPlansUnreadable: true }), strict);
      await refusedBeforeConnect(quiet({ plans: 1, diskPlansUnreadable: true }), kept);
    });
    test("the same number of plans and the same file hash are not enough: the loaded records must be the persisted ones", async () => {
      await refusedBeforeConnect(quiet({ plans: 1, planTweak: { status: (p) => p.map((x) => ({ ...x, entryPriceUsd: 99 })) } }), kept);
      await refusedBeforeConnect(quiet({ plans: 1, planTweak: { disk: (p) => p.map((x) => ({ ...x, key: "501:OTHER" })) } }), kept);
    });
    test("the same records in another order are the same set", async () => {
      const w = quiet({ plans: 2, planTweak: { status: (p) => [...p].reverse() } });
      expect(await attempt(w, { ...strict, plansHash: "ph2", plansCount: 2 })).toEqual({ reconnected: true });
    });
    test("a digest of the old process's plan set that does not match the loaded one stops it", async () => {
      await refusedBeforeConnect(quiet({ plans: 1 }), { ...kept, plansDigest: "not-the-digest" });
    });
    test("the digest a preserved pass hands back is accepted by the reconnect of the same set", async () => {
      const q = await run(world({ plans: 1 }), { allowOpenPlans: true });
      const w = quiet({ plans: 1 });
      expect(await attempt(w, { ...strict, plansHash: q.plansHash, plansCount: q.plansCount, plansDigest: q.plansDigest })).toEqual({ reconnected: true });
    });
    test("an order row that existed before the connect and changed after it is a stop, in both modes", async () => {
      const rewrite = (_n: number, x: World) => { if (x.calls.includes("POST /agent/connect")) x.orderLines = ['{"kind":"order","orderKey":"a","stage":"falhou"}']; };
      for (const [over, expected] of [[{ onStatus: rewrite }, strict], [{ plans: 1, onStatus: rewrite }, kept]] as const) {
        const e = await fails(attempt(quiet(over), expected));
        expect(e!.code).toBe("orders_rewritten");
        expect(e!.agentState).toBe("running");
      }
    });
    test("a NEW order the resumed agent starts after the connect is legitimate when plans were preserved", async () => {
      const w = quiet({ plans: 1, onStatus: (_n, x) => {
        if (x.calls.includes("POST /agent/connect") && !x.orderLines.some((l) => l.includes('"orderKey":"new"'))) { x.orderLines = [...x.orderLines, '{"kind":"order","orderKey":"new","stage":"enviando"}']; x.unsettled = 1; }
      } });
      expect(await attempt(w, kept)).toEqual({ reconnected: true });
    });
    test("a different executor after the connect (a restart in the middle of the proof) is not a proven reconnect, even if it is consistent", async () => {
      const w = quiet({ pidAfterConnect: 6000 });
      const e = await fails(attempt(w, strict));
      expect(e!.code).toBe("reconnect_not_proven");
      expect(e!.agentState).toBe("running");
    });
  });
});

describe("review 182: the identity and the disconnected state are confirmed again right before every request that changes anything", () => {
  test("an executor that changed DURING the wait, before the disconnect, stops the pass with nothing sent", async () => {
    const w = world({ onStatus: (n, x) => { if (n >= 3) { x.lockPid = 5151; x.portPid = 5151; } } });
    const e = await fails(run(w));
    expect(e!.code).toBe("owner_mismatch");
    expect(e!.agentState).toBe("running");
    expect(mutating(w)).toEqual([]);
  });
  test("an order that appeared during the wait, after the last quiet read, stops the pass with nothing sent", async () => {
    const w = world({ onStatus: (n, x) => { if (n === 5) x.inFlight = 1; } });
    const e = await fails(run(w));
    expect(e).toBeInstanceOf(QuiesceError);
    expect(mutating(w)).toEqual([]);
  });
  test("a reconnect between two drain passes ends the pass BEFORE another /agent/run, and nothing is stopped", async () => {
    const w = world({ runThrows: 1, onStatus: (_n, x) => {
      if (x.calls.includes("POST /agent/run")) { x.connected = true; x.mode = "limitado"; x.persistedConnected = true; }
    } });
    const e = await fails(run(w));
    expect(e!.code).toBe("drain_unproven");
    expect(e!.agentState).toBe("running");
    expect(mutating(w)).toEqual(["POST /agent/disconnect", "POST /agent/run"]);
  });
  test("another executor between two drain passes ends the pass BEFORE another /agent/run", async () => {
    const w = world({ runThrows: 1, onStatus: (_n, x) => {
      if (x.calls.includes("POST /agent/run")) { x.lockPid = 5151; x.portPid = 5151; }
    } });
    const e = await fails(run(w));
    expect(e!.code).toBe("owner_mismatch");
    expect(mutating(w)).toEqual(["POST /agent/disconnect", "POST /agent/run"]);
  });
  test("a status or disk that cannot be read before a drain run is unknown, and no run is sent", async () => {
    const w = world({ runThrows: 1 });
    const d = deps(w);
    let afterRun = false;
    const e = await fails(quiesceLiveAgent({
      ...d,
      call: async (path, method, body) => {
        if (path === "/agent/run") afterRun = true;
        if (afterRun && path === "/agent/status") throw new Error("socket hang up");
        return d.call(path, method, body);
      },
    }, { pollMs: 1000, settleMaxMs: 3000 }));
    expect(e).toBeInstanceOf(QuiesceError);
    expect(mutating(w)).toEqual(["POST /agent/disconnect", "POST /agent/run"]);
  });
});

describe("the real HTTP adapter", () => {
  const okEnvelope = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
  test("a GET carries the origin only; a POST carries the origin, the intent header, JSON and a body; redirects are errors", async () => {
    const seen: { url: string; init: RequestInit }[] = [];
    const call = httpAgentCall((async (url: string, init: RequestInit) => { seen.push({ url, init }); return okEnvelope({ ok: true, status: {} }); }) as unknown as typeof fetch);
    await call("/agent/status", "GET");
    await call("/agent/disconnect", "POST", {});
    await call("/agent/connect", "POST", { disclosure: DISC });
    expect(seen[0]!.url).toBe("http://127.0.0.1:3000/agent/status");
    expect(seen[0]!.init.headers).toEqual({ origin: "http://127.0.0.1:3000" });
    expect(seen[0]!.init.body).toBeUndefined();
    expect(seen[1]!.init.headers).toEqual({ origin: "http://127.0.0.1:3000", "content-type": "application/json", "x-inonu-intent": "user" });
    expect(seen[1]!.init.body).toBe("{}");
    expect(seen[2]!.init.body).toBe(JSON.stringify({ disclosure: DISC }));
    expect(seen.every((s) => s.init.redirect === "error")).toBe(true);
  });
  test("a non-OK status, an ok:false envelope and a non-object body are all refusals that claim NO state (`unknown`), never a clean failure", async () => {
    for (const res of [new Response("{}", { status: 500 }), okEnvelope({ ok: false }), okEnvelope([1]), new Response("x".repeat(1_000_001), { status: 200 })]) {
      const call = httpAgentCall((async () => res) as unknown as typeof fetch);
      const e = await fails(call("/agent/status", "GET"));
      expect(e).toBeInstanceOf(QuiesceError);
      expect(e!.agentState).toBe("unknown");
    }
  });
});

describe("the disk reader", () => {
  const dir = mkdtempSync(join(tmpdir(), "quiesce-test-"));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));
  test("reads the connected flag, the disclosure, the config hash, open plans, unsettled orders and the raw order lines", async () => {
    writeFileSync(join(dir, "state.json"), JSON.stringify({ connected: false, disclosure: DISC, events: [] }));
    writeFileSync(join(dir, "config.json"), '{"a":1}');
    writeFileSync(join(dir, "plans.json"), '{"version":1,"plans":{}}');
    writeFileSync(join(dir, "ledger.jsonl"), [
      '{"kind":"cycle","atMs":1}',
      '{"kind":"order","orderKey":"a","stage":"preparada"}',
      '{"kind":"order","orderKey":"a","stage":"enviando"}',
      '{"kind":"order","orderKey":"b","stage":"executada"}',
      "torn line {",
    ].join("\n") + "\n");
    const p = await diskPersisted(dir)();
    expect(p).toMatchObject({ connected: false, disclosure: DISC, plansOpen: 0, unsettledOrders: 1, ledgerMalformed: 1 });
    expect(p.orderLines).toHaveLength(3);
    expect(p.configHash).toMatch(/^[a-f0-9]{64}$/);
  });
  test("missing files are unknown, never a quiet default", async () => {
    const empty = mkdtempSync(join(tmpdir(), "quiesce-empty-"));
    try {
      const p = await diskPersisted(empty)();
      expect(p).toMatchObject({ connected: null, disclosure: null, plansOpen: null });
    } finally { rmSync(empty, { recursive: true, force: true }); }
  });
});
