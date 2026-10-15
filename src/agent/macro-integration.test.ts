import { createHash } from "node:crypto";
import { describe, expect, test } from "bun:test";
import { createContextOpportunityDispatcher, type ContextOpportunityEvent } from "../decision-review/context-events";
import { candidateOf, type EcoFacts } from "../opportunity/ecosystem";
import { factOf, type PulseFact } from "../pulse/facts";
import type { PulseReading } from "../pulse/pulse";
import { MINUTE, type Regime } from "../pulse/regime";
import { createBudget, DEFAULT_LIMITS } from "./budget";
import { createCycleRunner, type ConsultRecord, type CycleDeps, type Executor } from "./cycle";
import { DEFAULT_CAPS, type LimitedFacts } from "./gate";
import { createAgentLedger } from "./ledger";
import { MACRO_LEGEND, createMacroBridge, createMacroContext } from "./macro-context";
import type { AgentBrief, AgentModel } from "./model";
import { createPlanStore } from "./plans";
import { runState } from "./run-state.test-helper";
import { createScoreboard } from "./scoreboard";
import { timingFacts } from "./timing";
import type { Candle } from "../quant/types";
import type { Book, HoldingFacts, Position } from "./types";

// The macro context inside a cycle, with a FAKE pulse, a FAKE model, the Codex's real dispatcher and proofs, and a stand-in for the flight of the scheduler: no network, no key, no money.
const NOW = Date.UTC(2026, 9, 14, 12, 0, 0);
const A = "0x1111111111111111111111111111111111111111";
const B = "0x2222222222222222222222222222222222222222";
const USDC = "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48";
const MIN0 = NOW - (NOW % MINUTE);

const pos: Position = { id: `token:1:${A}`, chainIndex: "1", address: A, symbol: "AAA", wallet: "agente", usd: 90, balanceMinor: "1000000000000000000", decimals: 18, isCash: false };
const usdc: Position = { id: `token:1:${USDC}`, chainIndex: "1", address: USDC, symbol: "USDC", wallet: "agente", usd: 1000, balanceMinor: String(1000 * 1e6), decimals: 6, isCash: true };
const book: Book = { observedAtMs: NOW - 1000, positions: [usdc, pos], cashByChain: { "1": 1000 }, totalUsd: 1090, agentUsd: 1090 };
const facts: HoldingFacts = { priceUsd: 2, sinceEntryPct: null, changeH24Pct: 1, liquidityUsd: 1e6, exitImpactPct: 0.01, volumeH24Usd: 5e5, soldPct: 0, riskLevel: 1, riskFlags: [], heldHours: 10 };
const eco = (address: string, symbol: string): EcoFacts => ({ candidateId: `token:1:${address}`, chainIndex: "1", address, symbol, nota: 70, priceUsd: 0.5, changePct: 12, volumeUsd: 2e6, liquidityUsd: 5e6, marketCapUsd: 5e7, holders: 5000, buyShare: 0.6, txs: 800, top10Pct: 30, devPct: 2, bundlePct: 3, riskLevel: 1, riskFlags: [], wallets: 4, walletsUsd: 9000, soldPct: 10 });
const HOUR = 3_600_000;
const bars = (closes: readonly number[]): Candle[] => closes.map((close, i) => { const open = i === 0 ? close : closes[i - 1]!; return { startMs: i * HOUR, open, high: Math.max(open, close) * 1.004, low: Math.min(open, close) * 0.996, close, volume: 1, confirmed: true }; });
const calmTiming = (() => {
  const closes = [100];
  for (let i = 1; i < 48; i++) closes.push(closes[i - 1]! * (i % 2 === 1 ? 1.02 : 1 / 1.02));
  return timingFacts(bars(closes))!;
})();
const limitedOk: LimitedFacts = { policy: { perTxUsd: 50, dailyTradeUsd: 200, dailyTransferUsd: 0, transferGuarded: true }, sessionExpiresAtMs: NOW + 3_600_000, nowMs: NOW, cycleBudgetMs: 120_000, addressMatches: true, binaryOk: true, localClockSkewMs: 100 } as unknown as LimitedFacts;

const jump: Regime = { ret1m: 1.1, ret5m: 4.95, flow5m: 0.5, rv15m: 0.499 };
const fact = (instrument: string, minute: number, regime: Regime): PulseFact =>
  factOf({ instrument, windowEndMs: MIN0 + minute * MINUTE, originAtMs: MIN0 + minute * MINUTE - 10_000, observedAtLocalMs: MIN0 + minute * MINUTE - 10_000 + 40, generation: 0, bars: 15, gaps: 0, regime })!;
const sha = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

interface Rig {
  deps: CycleDeps;
  records: ConsultRecord[];
  briefs: AgentBrief[];
  clock: { now: number };
  pulse: { facts: PulseFact[] };
  modelCalls: () => number;
  runner: ReturnType<typeof createCycleRunner>;
  macro: ReturnType<typeof createMacroContext>;
  dispatcher: ReturnType<typeof createContextOpportunityDispatcher>;
  bridge: ReturnType<typeof createMacroBridge>;
  flight: { busy: boolean };
}
function rig(options: { withMacro?: boolean; startAt?: number; prepareThrows?: boolean } = {}): Rig {
  const lines: string[] = [];
  const ledger = createAgentLedger({ read: () => lines, append: (l) => void lines.push(l) });
  const records: ConsultRecord[] = [];
  const briefs: AgentBrief[] = [];
  const clock = { now: options.startAt ?? MIN0 + 20 * MINUTE };
  const pulse = { facts: [fact("BTC-USDT", 19, jump)] };
  let calls = 0;
  const model: AgentModel = {
    name: "fake",
    estimateTokens: () => 1000,
    async choose({ brief, candidates }) {
      calls++;
      briefs.push(brief);
      return { raw: { posture: "neutra", stances: Object.fromEntries(candidates.map((c) => [c.id, c.kind === "holding" ? "hold" : "skip"])), profiles: {} }, usage: { inputTokens: 900, outputTokens: 60 } };
    },
  };
  const executor: Executor = { async execute() { return { status: "executada", ref: "ref" }; } };
  let id = 0;
  const flight = { busy: false };
  let runner!: ReturnType<typeof createCycleRunner>;
  let bridge!: ReturnType<typeof createMacroBridge>;
  const dispatcher = createContextOpportunityDispatcher({
    now: () => clock.now,
    maxAgeMs: 180_000,
    allowed: () => true,
    request: (batch) => bridge.request(batch),
  });
  const macro = createMacroContext({ pulse: { read: (): PulseReading => ({ context: null, facts: pulse.facts }) }, now: () => clock.now, notify: (event) => dispatcher.notify(event) });
  bridge = createMacroBridge({
    macro,
    // the stand-in for the flight of the scheduler: one look at a time, false when busy
    requestCycle: async () => {
      if (flight.busy) return false;
      flight.busy = true;
      try {
        return (await runner.run()).consulted;
      } finally {
        flight.busy = false;
      }
    },
  });
  const port = options.prepareThrows
    ? { prepare: () => { throw new Error("pulse broke"); }, review: bridge.port.review }
    : {
        // time passes between making the context and asking the model
        prepare: (asOfMs: number) => { const prepared = bridge.port.prepare(asOfMs); clock.now += 5; return prepared; },
        review: bridge.port.review,
      };
  const deps: CycleDeps = {
    state: runState("sombra"),
    ledger,
    budget: createBudget({ limits: DEFAULT_LIMITS, now: () => clock.now, load: () => null, persist: () => {} }),
    scoreboard: createScoreboard({ read: () => [], append: () => {} }),
    plans: createPlanStore({ read: () => null, write: () => {} }),
    model,
    executor,
    now: () => clock.now,
    newId: () => `cy${++id}`,
    stopFilePresent: () => false,
    clockSkewMs: () => 100,
    readBook: async () => ({ ...book, observedAtMs: clock.now - 1000 }),
    holdingFacts: async () => () => facts,
    timingOf: async () => calmTiming,
    ecosystem: async (saldo) => ({ observedAtMs: clock.now, saldo, candidates: [candidateOf(eco(B, "BBB"), saldo)], excluded: {} }),
    context: () => ({ btc_24h: 1.5, tendencia: "lateral" }),
    history: () => null,
    riskPct: () => 0.1,
    caps: DEFAULT_CAPS,
    limitedFacts: async () => ({ ...limitedOk, nowMs: clock.now, sessionExpiresAtMs: clock.now + 3_600_000 }),
    minBuyUsd: () => 10,
    refreshMs: 3_600_000,
    timeouts: { modelMs: 5000, readMs: 5000, orderMs: 5000 },
    onConsult: (entry) => void records.push(entry),
    ...(options.withMacro === false ? {} : { macro: port }),
  };
  runner = createCycleRunner(deps);
  return { deps, records, briefs, clock, pulse, modelCalls: () => calls, runner, macro, dispatcher, bridge, flight };
}

describe("without the macro context nothing changes", () => {
  test("no macro keys, no macro legend, no macro record, and a normal look", async () => {
    const r = rig({ withMacro: false });
    await r.runner.run();
    expect(r.modelCalls()).toBe(1);
    expect(Object.keys(r.briefs[0]!.contexto ?? {})).toEqual(["btc_24h", "tendencia"]);
    expect(r.briefs[0]!.chaves).not.toHaveProperty("contexto_macro");
    expect(r.records[0]).not.toHaveProperty("macro");
    expect(Object.isFrozen(r.briefs[0])).toBe(false);
  });
});

describe("with the macro context", () => {
  test("the model is sent the FROZEN Brief with the ten fields per market, and the legend, and the record can be replayed", async () => {
    const r = rig();
    await r.runner.run();
    const brief = r.briefs[0]!;
    expect(Object.isFrozen(brief)).toBe(true);
    const ctx = brief.contexto!;
    // the base context is kept and the projection is added: ten fields for BTC with a value, ten explicit nulls for SOL
    expect(ctx.btc_24h).toBe(1.5);
    expect(ctx.btc_1m).toBe(1.1);
    expect(ctx.btc_fh).toBe(r.pulse.facts[0]!.hash);
    for (const suffix of ["1m", "5m", "fl", "rv", "fh", "age_ms", "asof_ms", "bars", "gaps", "gen"]) {
      expect(ctx).toHaveProperty(`btc_${suffix}`);
      expect(ctx[`sol_${suffix}`]).toBeNull();
    }
    expect(brief.chaves.contexto_macro).toBe(MACRO_LEGEND);
    const rec = r.records[0]!;
    // the SHA-256 of the exact Brief that was sent is kept, and it is the hash the record's short hash comes from
    expect(rec.macro!.briefSha64).toBe(sha(brief));
    expect(rec.macro!.briefSha64!.slice(0, 16)).toBe(rec.briefHash);
    // the record says which instance of the host captured the snapshots: availability is the first capture BY THAT instance
    expect(rec.macro!.hostEpoch).toMatch(/^epoch-[0-9]+-[a-f0-9]{8}$/);
    expect(rec.macro!.registry.map((e) => e.contextKey)).toEqual(["okx:SPOT:BTC-USDT", "okx:SPOT:SOL-USDT"]);
    expect(rec.macro!.snapshots).toHaveLength(1);
    expect(rec.macro!.proof).toMatchObject({ cycleId: "cy1", sourceAuthenticated: false, modelCallObserved: false, executionProven: false });
    // the context was made BEFORE the model was asked: two different instants
    expect(rec.macro!.contextAtMs).toBe(MIN0 + 20 * MINUTE);
    expect(rec.macro!.proof!.askedAtMs).toBeGreaterThan(rec.macro!.contextAtMs);
  });

  test("a second look at the same observation, a minute later, is not asked again: age and time of the context are not a material change", async () => {
    const r = rig();
    await r.runner.run();
    r.clock.now += 60_000;
    const second = await r.runner.run();
    expect(r.modelCalls()).toBe(1);
    expect(second.consulted).toBe(false);
  });

  test("a NEW observation (new hash) is a material change and is asked again", async () => {
    const r = rig();
    await r.runner.run();
    r.clock.now += 60_000;
    r.pulse.facts = [fact("BTC-USDT", 20, { ...jump, ret1m: 0.4 })];
    await r.runner.run();
    expect(r.modelCalls()).toBe(2);
    expect(r.briefs[1]!.contexto!.btc_fh).toBe(r.pulse.facts[0]!.hash);
  });

  test("an observation that is too old reads as explicit nulls, not as a calm market", async () => {
    const r = rig({ startAt: MIN0 + 30 * MINUTE });
    await r.runner.run();
    const ctx = r.briefs[0]!.contexto!;
    expect(ctx.btc_1m).toBeNull();
    expect(ctx.btc_fh).toBeNull();
  });

  test("a pulse that throws costs the look nothing: no macro keys, a note, and the model is asked", async () => {
    const r = rig({ prepareThrows: true });
    const report = await r.runner.run();
    expect(r.modelCalls()).toBe(1);
    expect(Object.keys(r.briefs[0]!.contexto ?? {})).toEqual(["btc_24h", "tendencia"]);
    expect(r.records[0]).not.toHaveProperty("macro");
    expect(JSON.stringify(report)).not.toContain("pulse broke");
  });
});

describe("the dispatcher, the bridge and the same flight", () => {
  test("a material fact makes ONE look through the flight, and the proof of that look is the acknowledgement", async () => {
    const r = rig();
    r.macro.poll();
    await r.dispatcher.idle();
    expect(r.modelCalls()).toBe(1);
    expect(r.records[0]!.macro!.proof!.events.map((e) => [e.event.contextKey, e.status])).toEqual([["okx:SPOT:BTC-USDT", "reviewed"]]);
    expect(r.dispatcher.status()).toMatchObject({ queued: 0, awaitingWake: false });
    expect(r.flight.busy).toBe(false);
    r.dispatcher.stop();
  });

  test("a busy flight is not a review: no look, the event is kept, and a wake after it frees makes the look", async () => {
    const r = rig();
    r.flight.busy = true;
    r.macro.poll();
    await r.dispatcher.idle();
    expect(r.modelCalls()).toBe(0);
    expect(r.dispatcher.status()).toMatchObject({ queued: 1, awaitingWake: true });
    r.flight.busy = false;
    r.dispatcher.wake();
    await r.dispatcher.idle();
    expect(r.modelCalls()).toBe(1);
    expect(r.dispatcher.status()).toMatchObject({ queued: 0 });
    r.dispatcher.stop();
  });

  test("a look that the cycle does not take (nothing changed) is not a review either: the event stays", async () => {
    const r = rig();
    await r.runner.run(); // a normal look first: the same observation is now 'nothing changed'
    r.clock.now += 60_000;
    r.macro.poll();
    await r.dispatcher.idle();
    expect(r.modelCalls()).toBe(1);
    expect(r.dispatcher.status().queued).toBeLessThanOrEqual(1);
    r.dispatcher.stop();
  });

  test("after stop, no look is made for a material fact", async () => {
    const r = rig();
    r.dispatcher.stop();
    r.macro.poll();
    await r.dispatcher.idle();
    expect(r.modelCalls()).toBe(0);
  });
});
