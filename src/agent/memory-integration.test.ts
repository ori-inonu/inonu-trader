import { createHash } from "node:crypto";
import { describe, expect, test } from "bun:test";
import { buildExperienceMemory, type ExperienceEpisodeV2, type MemoryQueryV2 } from "../decision-review/evolution/memory";
import type { CapturedMemoryResult } from "../decision-review/evolution/captured-memory";
import { candidateOf, type EcoFacts } from "../opportunity/ecosystem";
import { createBudget, DEFAULT_LIMITS } from "./budget";
import { createCycleRunner, type ConsultRecord, type CycleDeps, type Executor } from "./cycle";
import { decisionVersionOf } from "./decision-metadata";
import { DEFAULT_CAPS, type LimitedFacts } from "./gate";
import { createAgentLedger } from "./ledger";
import { BRIEF_MEMORY_LEGEND, buildMemoryBrief, effectiveLegend, type MemoryHookDeps, type MemoryHookOutcome } from "./memory-hook";
import type { AgentBrief, AgentModel } from "./model";
import { createPlanStore } from "./plans";
import { runState } from "./run-state.test-helper";
import { createScoreboard } from "./scoreboard";
import { timingFacts } from "./timing";
import type { Candle } from "../quant/types";
import type { Book, HoldingFacts, Position } from "./types";

// The memory hook inside a cycle, with a FAKE model and a FAKE reader: nothing here calls a provider, opens a store or moves money.
const NOW = Date.UTC(2026, 9, 14, 12, 0, 0);
const A = "0x1111111111111111111111111111111111111111";
const B = "0x2222222222222222222222222222222222222222";
const USDC = "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48";
const COHORT = ["past-0", "past-1", "past-2"];
const context = { regime: "unknown", riskCheck: "unknown", liquidityBand: "unknown", codes: [] } as const;

const pos: Position = { id: `token:1:${A}`, chainIndex: "1", address: A, symbol: "AAA", wallet: "agente", usd: 90, balanceMinor: "1000000000000000000", decimals: 18, isCash: false };
const usdc: Position = { id: `token:1:${USDC}`, chainIndex: "1", address: USDC, symbol: "USDC", wallet: "agente", usd: 1000, balanceMinor: String(1000 * 1e6), decimals: 6, isCash: true };
const book: Book = { observedAtMs: NOW - 1000, positions: [usdc, pos], cashByChain: { "1": 1000 }, totalUsd: 1090, agentUsd: 1090 };
const facts: HoldingFacts = { priceUsd: 2, sinceEntryPct: null, changeH24Pct: 1, liquidityUsd: 1e6, exitImpactPct: 0.01, volumeH24Usd: 5e5, soldPct: 0, riskLevel: 1, riskFlags: [], heldHours: 10 };
const eco = (address: string, symbol: string): EcoFacts => ({ candidateId: `token:1:${address}`, chainIndex: "1", address, symbol, nota: 70, priceUsd: 0.5, changePct: 12, volumeUsd: 2e6, liquidityUsd: 5e6, marketCapUsd: 5e7, holders: 5000, buyShare: 0.6, txs: 800, top10Pct: 30, devPct: 2, bundlePct: 3, riskLevel: 1, riskFlags: [], wallets: 4, walletsUsd: 9000, soldPct: 10 });
const HOUR = 3_600_000;
const bars = (closes: readonly number[]): Candle[] => closes.map((close, i) => { const open = i === 0 ? close : closes[i - 1]!; return { startMs: i * HOUR, open, high: Math.max(open, close) * 1.004, low: Math.min(open, close) * 0.996, close, volume: 1, confirmed: true }; });
const calm = (() => {
  const closes = [100];
  for (let i = 1; i < 48; i++) closes.push(closes[i - 1]! * (i % 2 === 1 ? 1.02 : 1 / 1.02));
  return timingFacts(bars(closes))!;
})();
const limitedOk: LimitedFacts = { policy: { perTxUsd: 50, dailyTradeUsd: 200, dailyTransferUsd: 0, transferGuarded: true }, sessionExpiresAtMs: NOW + 3_600_000, nowMs: NOW, cycleBudgetMs: 120_000, addressMatches: true, binaryOk: true, localClockSkewMs: 100 } as unknown as LimitedFacts;

function frameFor(query: MemoryQueryV2, arm: "A" | "B"): Extract<CapturedMemoryResult, { ok: true }> {
  const episodes = COHORT.map((cycleId, i) => ({
    schemaVersion: 2, cycleId, candidateId: query.candidateId, itemScope: query.itemScope, snapshotHash: "d".repeat(64), decisionVersion: "b".repeat(64), evaluatorHash: "c".repeat(64), episodeVersion: 1,
    decidedAtMs: 1000 + i, recordedAtMs: 2000 + i, factAvailableAtMs: 500, arm, action: i === 0 ? "buy" : "hold", source: arm === "A" ? "decision_journal" : "shadow_journal", context, observations: [], outcome: null, counterfactuals: [],
  })) as unknown as ExperienceEpisodeV2[];
  const built = buildExperienceMemory(episodes, query);
  if (!built.ok) throw new Error(built.reason);
  return {
    ok: true, coverage: "requested_cycles_only", requestedCycleIds: [...COHORT], arm, memory: built.value,
    diagnostics: COHORT.map((cycleId) => ({ cycleId, status: "bound" as const, rawVariants: 1, metadataVariants: 1, referenceVariants: 0, pendingItems: 1, excludedQueryCycle: false })),
    sourceAuthenticated: false, financialExecution: false, qualifiedABActive: false, matureOutcomes: 0, consistency: "eligible_snapshots_rechecked",
  };
}
const goodRead: MemoryHookDeps["read"] = (req) => ({ ok: true, results: req.queries.map((q) => frameFor(q, req.arm)) });

interface Rig { deps: CycleDeps; records: ConsultRecord[]; briefs: AgentBrief[]; order: string[]; modelCalls: () => number; clock: { now: number }; asked: { asOfMs: number; cycleId: string; itemIds: readonly string[] }[] }
function rig(memoryHook?: (ask: { asOfMs: number; cycleId: string; itemIds: readonly string[] }) => MemoryHookOutcome): Rig {
  const lines: string[] = [];
  const ledger = createAgentLedger({ read: () => lines, append: (l) => void lines.push(l) });
  const records: ConsultRecord[] = [];
  const briefs: AgentBrief[] = [];
  const order: string[] = [];
  const asked: Rig["asked"] = [];
  const clock = { now: NOW };
  let calls = 0;
  const model: AgentModel = {
    name: "fake",
    estimateTokens: () => 1000,
    async choose({ brief, candidates }) {
      calls++;
      order.push("model");
      briefs.push(brief);
      return { raw: { posture: "neutra", stances: Object.fromEntries(candidates.map((c) => [c.id, c.kind === "holding" ? "hold" : "skip"])), profiles: {} }, usage: { inputTokens: 900, outputTokens: 60 } };
    },
  };
  const executor: Executor = { async execute() { return { status: "executada", ref: "ref" }; } };
  let id = 0;
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
    readBook: async () => book,
    holdingFacts: async () => () => facts,
    timingOf: async () => calm,
    ecosystem: async (saldo) => ({ observedAtMs: NOW, saldo, candidates: [candidateOf(eco(B, "BBB"), saldo)], excluded: {} }),
    context: () => null,
    history: () => null,
    riskPct: () => 0.1,
    caps: DEFAULT_CAPS,
    limitedFacts: async () => limitedOk,
    minBuyUsd: () => 10,
    refreshMs: 3_600_000,
    timeouts: { modelMs: 5000, readMs: 5000, orderMs: 5000 },
    onConsult: (entry) => void records.push(entry),
    ...(memoryHook === undefined ? {} : { memoryHook: (ask) => { order.push("hook"); asked.push(ask); return memoryHook(ask); } }),
  };
  return { deps, records, briefs, order, modelCalls: () => calls, clock, asked };
}
const sha = (v: unknown) => createHash("sha256").update(JSON.stringify(v)).digest("hex");
const hookWith = (read: MemoryHookDeps["read"]) => (ask: { asOfMs: number; cycleId: string; itemIds: readonly string[] }): MemoryHookOutcome =>
  buildMemoryBrief({ enabled: true, asOfMs: ask.asOfMs, cycleId: ask.cycleId, arm: "A", cohortCycleIds: COHORT, itemIds: ask.itemIds }, { read, clock: () => 0 });

describe("the memory hook inside a cycle (fake model, fake reader, no money)", () => {
  test("without a hook the Brief and the consultation record are exactly what they always were", async () => {
    const r = rig();
    await createCycleRunner(r.deps).run();
    expect(r.modelCalls()).toBe(1);
    expect(Object.keys(r.briefs[0]!)).not.toContain("memoria");
    expect(r.briefs[0]!.chaves).not.toHaveProperty("memoria");
    expect(r.records[0]).not.toHaveProperty("memoryHook");
    expect(r.records[0]!.brief).not.toHaveProperty("memoria");
  });

  test("a disabled hook (it answers enabled false) changes nothing either", async () => {
    const r = rig(() => ({ enabled: false }));
    await createCycleRunner(r.deps).run();
    expect(r.modelCalls()).toBe(1);
    expect(Object.keys(r.briefs[0]!)).not.toContain("memoria");
    expect(r.records[0]).not.toHaveProperty("memoryHook");
  });

  test("with the hook on: asked before the model, with the as-of read there and the ids the model is offered", async () => {
    const r = rig(hookWith(goodRead));
    await createCycleRunner(r.deps).run();
    expect(r.order).toEqual(["hook", "model"]);
    expect(r.asked).toHaveLength(1);
    expect(r.asked[0]!.asOfMs).toBe(NOW);
    expect(r.asked[0]!.cycleId).toBe("cy1");
    expect(r.asked[0]!.itemIds).toEqual([`hold:token:1:${A}@agente`, `buy:token:1:${B}`]);
  });

  test("the model reads the memory after execucoes and before mandato, with the legend in chaves, and the record keeps the SAME value", async () => {
    const r = rig(hookWith(goodRead));
    await createCycleRunner(r.deps).run();
    const brief = r.briefs[0]!;
    expect(brief.memoria).toBeDefined();
    const keys = Object.keys(brief);
    expect(keys.indexOf("memoria")).toBe(keys.indexOf("mandato") - 1);
    expect(keys.slice(0, 7)).toEqual(["v", "carteira", "chaves", "posicoes", "compras", "contexto", "historico"]);
    expect(brief.chaves.memoria).toBe(BRIEF_MEMORY_LEGEND);
    const rec = r.records[0]!;
    expect(rec.brief.memoria).toBe(brief.memoria);
    expect(JSON.stringify(rec.brief.memoria)).toBe(JSON.stringify(brief.memoria));
    expect(rec.memoryHook).toMatchObject({ status: "ok", items: 2, cohort: COHORT.length, tokens: null, costUsd: null, hash: brief.memoria!.h });
    // the hash the observer recomputes from the record (v, carteira, chaves, posicoes, compras, contexto, historico, execucoes?, memoria?, mandato) is the one the cycle recorded
    const again = sha({ v: 1, carteira: rec.brief.carteira, chaves: rec.brief.chaves, posicoes: rec.brief.posicoes, compras: rec.brief.compras, contexto: rec.contexto, historico: rec.historico, ...(rec.brief.execucoes === undefined ? {} : { execucoes: rec.brief.execucoes }), memoria: rec.brief.memoria, mandato: rec.brief.mandato });
    expect(again.slice(0, 16)).toBe(rec.briefHash);
  });

  test("a hook that throws costs the cycle nothing: the model is asked with the Brief it always got", async () => {
    const r = rig(() => { throw new Error("hook broke"); });
    const report = await createCycleRunner(r.deps).run();
    expect(r.modelCalls()).toBe(1);
    expect(Object.keys(r.briefs[0]!)).not.toContain("memoria");
    expect(r.records[0]).not.toHaveProperty("memoryHook");
    expect(JSON.stringify(report)).not.toContain("hook broke");
  });

  test("a reader that fails shows every item unavailable, the model is still asked and no stance is vetoed", async () => {
    const r = rig(hookWith(() => ({ ok: false, code: "storage_unavailable" })));
    await createCycleRunner(r.deps).run();
    expect(r.modelCalls()).toBe(1);
    const memoria = r.briefs[0]!.memoria!;
    for (const item of Object.values(memoria.items)) expect(item).toMatchObject({ st: "unavailable", reason: "storage_unavailable" });
    expect(r.records[0]!.memoryHook).toMatchObject({ status: "reader_failed", failure: "storage_unavailable" });
    expect(r.records[0]!.valid).toBe(true);
    expect(r.records[0]!.stances).toEqual({ [`hold:token:1:${A}@agente`]: "hold", [`buy:token:1:${B}`]: "skip" });
  });

  test("the memory does not break the 'nothing changed' check: a second look at the same facts, minutes later, is not asked again", async () => {
    const r = rig(hookWith(goodRead));
    const runner = createCycleRunner(r.deps);
    await runner.run();
    r.clock.now += 60_000;
    const second = await runner.run();
    expect(r.modelCalls()).toBe(1);
    expect(second.reason ?? second.outcome).toMatch(/sem_mudanca|mantido/);
    // and the hook was not asked for the Brief that was not sent
    expect(r.asked).toHaveLength(1);
  });

  test("a block that does not fit the room left is left out and the record says so", async () => {
    const r = rig((ask) => buildMemoryBrief({ enabled: true, asOfMs: ask.asOfMs, cycleId: ask.cycleId, arm: "A", cohortCycleIds: COHORT, itemIds: ask.itemIds, maxBytes: 100 }, { read: goodRead, clock: () => 0 }));
    await createCycleRunner(r.deps).run();
    expect(r.modelCalls()).toBe(1);
    expect(Object.keys(r.briefs[0]!)).not.toContain("memoria");
    expect(r.records[0]!.memoryHook).toMatchObject({ status: "over_budget" });
  });
});

describe("the effective version of a decision", () => {
  const base = { criteria: "rank-v1", briefVersion: 1, model: "fake", questions: "q".repeat(64) };
  test("without a memory block the legend, and so the version, are unchanged", () => {
    expect(effectiveLegend("scoped-v1", undefined)).toBe("scoped-v1");
  });
  test("with one, the version carries the contract hash and the legend hash, and it differs from the version without", async () => {
    const r = rig(hookWith(goodRead));
    await createCycleRunner(r.deps).run();
    const memoria = r.briefs[0]!.memoria!;
    const tagged = effectiveLegend("scoped-v1", memoria);
    expect(tagged.startsWith("scoped-v1+memoria:")).toBe(true);
    expect(tagged.split(":").slice(1).every((h) => /^[a-f0-9]{64}$/.test(h))).toBe(true);
    expect(decisionVersionOf({ ...base, legend: tagged })).not.toBe(decisionVersionOf({ ...base, legend: "scoped-v1" }));
  });
});
