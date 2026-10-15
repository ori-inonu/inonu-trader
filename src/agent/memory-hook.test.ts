import { expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { buildExperienceMemory, type ExperienceEpisodeV2, type MemoryQueryV2 } from "../decision-review/evolution/memory";
import { BRIEF_MEMORY_LEGEND, BRIEF_MEMORY_SCHEMA_VERSION, BRIEF_MEMORY_VERSION_HASH, projectBriefMemory } from "../decision-review/evolution/brief-memory";
import type { CapturedMemoryBatchResult, CapturedMemoryResult } from "../decision-review/evolution/captured-memory";
import { MEMORY_HOOK_ENV, MEMORY_HOOK_VERSION, buildMemoryBrief, insertMemory, memoryHookEnabled, memoryQueries, type MemoryHookDeps } from "./memory-hook";

const AT = 1_800_000_000_000;
const ASSET_A = "token:501:So11111111111111111111111111111111111111112";
const ASSET_B = "token:1:0x00000000000000000000000000000000000000aa";
const BUY_A = `buy:${ASSET_A}`;
const HOLD_B = `hold:${ASSET_B}@agente`;
const COHORT = ["past-0", "past-1", "past-2"];
const context = { regime: "unknown", riskCheck: "unknown", liquidityBand: "unknown", codes: [] } as const;
const sha = (v: string) => createHash("sha256").update(v).digest("hex");

/** What the real batch reader returns for a query, built through the real memory builder: synthetic pending episodes only, no outcome, no wallet, no money. */
function frameFor(query: MemoryQueryV2, arm: "A" | "B", withRows: boolean): Extract<CapturedMemoryResult, { ok: true }> {
  const episodes: ExperienceEpisodeV2[] = withRows
    ? COHORT.map((cycleId, i) => ({
        schemaVersion: 2, cycleId, candidateId: query.candidateId, itemScope: query.itemScope, snapshotHash: "d".repeat(64), decisionVersion: "b".repeat(64), evaluatorHash: "c".repeat(64), episodeVersion: 1,
        decidedAtMs: 1000 + i, recordedAtMs: 2000 + i, factAvailableAtMs: 500, arm, action: i === 0 ? "buy" : "hold", source: arm === "A" ? "decision_journal" : "shadow_journal", context, observations: [], outcome: null, counterfactuals: [],
      }) as unknown as ExperienceEpisodeV2)
    : [];
  const built = buildExperienceMemory(episodes, query);
  if (!built.ok) throw new Error(built.reason);
  return {
    ok: true, coverage: "requested_cycles_only", requestedCycleIds: [...COHORT], arm, memory: built.value,
    diagnostics: COHORT.map((cycleId) => ({ cycleId, status: "bound" as const, rawVariants: 1, metadataVariants: 1, referenceVariants: 0, pendingItems: withRows ? 1 : 0, excludedQueryCycle: false })),
    sourceAuthenticated: false, financialExecution: false, qualifiedABActive: false, matureOutcomes: 0, consistency: "eligible_snapshots_rechecked",
  };
}

interface Seen { calls: number; req: { arm: "A" | "B"; cycleIds: readonly string[]; queries: readonly unknown[] } | null }
function deps(over: Partial<MemoryHookDeps> = {}, seen: Seen = { calls: 0, req: null }): { deps: MemoryHookDeps; seen: Seen } {
  const ticks = [10, 14];
  return {
    seen,
    deps: {
      read: (req) => {
        seen.calls += 1;
        seen.req = req;
        return { ok: true, results: (req.queries as MemoryQueryV2[]).map((q) => frameFor(q, req.arm, true)) } satisfies CapturedMemoryBatchResult;
      },
      clock: () => ticks.shift() ?? 14,
      ...over,
    },
  };
}
const input = (over: Record<string, unknown> = {}) => ({ asOfMs: AT, cycleId: "current", arm: "A" as const, cohortCycleIds: COHORT, itemIds: [BUY_A, HOLD_B], ...over });

test("the hook is OFF unless the owner switches it on, and an off hook never reads", () => {
  expect(memoryHookEnabled({})).toBe(false);
  expect(memoryHookEnabled({ [MEMORY_HOOK_ENV]: "0" })).toBe(false);
  expect(memoryHookEnabled({ [MEMORY_HOOK_ENV]: "true" })).toBe(false);
  expect(memoryHookEnabled({ [MEMORY_HOOK_ENV]: "1" })).toBe(true);
  const { deps: d, seen } = deps();
  const off = buildMemoryBrief({ ...input(), enabled: false }, d);
  expect(off).toEqual({ enabled: false });
  expect(seen.calls).toBe(0);
});

test("queries are V2, exact per item, decided at the as-of captured before the model, with unknown versions kept null", () => {
  const { queries, skipped } = memoryQueries(input());
  expect(skipped).toBe(0);
  expect(queries).toHaveLength(2);
  expect(queries[0]).toEqual({
    schemaVersion: 2, cycleId: "current", candidateId: ASSET_A, snapshotHash: null, decisionVersion: null, evaluatorHash: null, decidedAtMs: AT, context, maxExperiences: 3,
    itemScope: { sourceItemId: BUY_A, kind: "buy", assetKey: ASSET_A, walletRole: null, physicalWalletIdentity: "unknown", walletAddress: null },
  });
  expect(queries[1]!.itemScope).toEqual({ sourceItemId: HOLD_B, kind: "holding", assetKey: ASSET_B, walletRole: "agente", physicalWalletIdentity: "unknown", walletAddress: null });
  // the REAL memory builder accepts every query as written (a wrong shape would be refused here, not in a live cycle)
  for (const q of queries) expect(buildExperienceMemory([], q).ok).toBe(true);
});

test("repeated ids count once; ids the memory cannot scope are skipped and counted, never guessed", () => {
  const { queries, skipped } = memoryQueries(input({ itemIds: [BUY_A, BUY_A, "buy:not-a-token", "hold:token:501:native@someone", "pos:1", HOLD_B] }));
  expect(queries.map((q) => q.itemScope.sourceItemId)).toEqual([BUY_A, HOLD_B]);
  expect(skipped).toBe(4);
});

test("more items than the reader accepts: the first ones are asked, the rest is counted as dropped", () => {
  const ids = Array.from({ length: 70 }, (_, i) => `buy:token:501:${(i + 1).toString().padStart(44, "A")}`);
  const { queries, skipped } = memoryQueries(input({ itemIds: ids }));
  expect(queries.length + skipped).toBe(70);
  expect(queries.length).toBeLessThanOrEqual(64);
});

test("success: the value is EXACTLY what the projector returns, with the cohort, versions and the record", () => {
  const { deps: d, seen } = deps();
  const out = buildMemoryBrief({ ...input(), enabled: true }, d);
  if (!out.enabled) throw new Error("enabled expected");
  expect(seen.calls).toBe(1);
  expect(seen.req?.arm).toBe("A");
  expect(seen.req?.cycleIds).toEqual(COHORT);
  const { queries } = memoryQueries(input());
  const direct = projectBriefMemory({ asOfMs: AT, cycleId: "current", arm: "A", items: queries.map((q) => ({ sourceItemId: q.itemScope.sourceItemId, result: frameFor(q, "A", true) })) });
  if (!direct.ok) throw new Error(direct.code);
  expect(out.memoria).toEqual(direct.value);
  expect(JSON.stringify(out.memoria)).toBe(JSON.stringify(direct.value));
  expect(out.record).toEqual({
    status: "ok", failure: null, items: 2, skipped: 0, cohort: COHORT.length, quality: { complete: 2, partial: 0, unavailable: 0, unknown: 0 }, gaps: 0,
    bytes: Buffer.byteLength(JSON.stringify(direct.value)), hash: direct.value.h, version: BRIEF_MEMORY_VERSION_HASH, legendHash: sha(BRIEF_MEMORY_LEGEND), durationMs: 4, tokens: null, costUsd: null,
  });
  expect(out.memoria?.sourceAuthenticated).toBe(false);
  expect(out.memoria?.financialExecution).toBe(false);
  expect(out.memoria?.evaluation).toBe("pending_only");
});

test("a cohort with no rows is reported as empty, never as missing history", () => {
  const { deps: d } = deps({ read: (req) => ({ ok: true, results: (req.queries as MemoryQueryV2[]).map((q) => frameFor(q, req.arm, false)) }) });
  const out = buildMemoryBrief({ ...input({ itemIds: [BUY_A] }), enabled: true }, d);
  if (!out.enabled || !out.memoria) throw new Error("memory expected");
  expect(out.memoria.items[BUY_A]).toMatchObject({ st: "empty", x: [] });
  expect(out.record.status).toBe("ok");
});

test("the reader fails as a whole: every item says unavailable with the reason, the cycle is not blocked and no veto exists", () => {
  const { deps: d } = deps({ read: () => ({ ok: false, code: "storage_unavailable" }) });
  const out = buildMemoryBrief({ ...input(), enabled: true }, d);
  if (!out.enabled || !out.memoria) throw new Error("memory expected");
  for (const id of [BUY_A, HOLD_B]) expect(out.memoria.items[id]).toMatchObject({ st: "unavailable", reason: "storage_unavailable", q: "unknown", h: null, k: null, x: [] });
  expect(out.record.status).toBe("reader_failed");
  expect(out.record.failure).toBe("storage_unavailable");
  expect(out.record.quality).toEqual({ complete: 0, partial: 0, unavailable: 0, unknown: 2 });
  expect(out).not.toHaveProperty("veto");
  expect(out).not.toHaveProperty("block");
});

test("a reader that throws is a reader failure, not a thrown cycle", () => {
  const { deps: d } = deps({ read: () => { throw new Error("disk gone"); } });
  const out = buildMemoryBrief({ ...input(), enabled: true }, d);
  if (!out.enabled || !out.memoria) throw new Error("memory expected");
  expect(out.memoria.items[BUY_A]).toMatchObject({ st: "unavailable", reason: "storage_unavailable" });
  expect(out.record).toMatchObject({ status: "reader_failed", failure: "storage_unavailable" });
  expect(JSON.stringify(out)).not.toContain("disk gone");
});

test("a global projector error records a memory failure and invents nothing", () => {
  const { deps: d } = deps({ project: () => ({ ok: false, code: "payload_limit" }) });
  const out = buildMemoryBrief({ ...input(), enabled: true }, d);
  if (!out.enabled) throw new Error("enabled expected");
  expect(out.memoria).toBeUndefined();
  expect(out.record).toMatchObject({ status: "projector_failed", failure: "payload_limit", items: 2, bytes: 0, hash: null, tokens: null, costUsd: null });
  const { deps: d2 } = deps({ project: () => { throw new Error("boom"); } });
  const out2 = buildMemoryBrief({ ...input(), enabled: true }, d2);
  if (!out2.enabled) throw new Error("enabled expected");
  expect(out2.memoria).toBeUndefined();
  expect(out2.record).toMatchObject({ status: "projector_failed", failure: "projector_threw" });
});

test("a memory that does not fit the room left in the Brief is left out and says so, never sliced", () => {
  const { deps: d } = deps();
  const out = buildMemoryBrief({ ...input(), enabled: true, maxBytes: 200 }, d);
  if (!out.enabled) throw new Error("enabled expected");
  expect(out.memoria).toBeUndefined();
  expect(out.record.status).toBe("over_budget");
  expect(out.record.bytes).toBeGreaterThan(200);
  expect(out.record.hash).not.toBeNull();
});

test("no items to ask means no read and no key", () => {
  const { deps: d, seen } = deps();
  const out = buildMemoryBrief({ ...input({ itemIds: [] }), enabled: true }, d);
  if (!out.enabled) throw new Error("enabled expected");
  expect(seen.calls).toBe(0);
  expect(out.memoria).toBeUndefined();
  expect(out.record).toMatchObject({ status: "no_items", items: 0 });
});

test("the key goes after execucoes and before mandato, and a Brief without a memory is byte identical to before", () => {
  const brief = { v: 1, carteira: 1, chaves: {}, posicoes: {}, compras: {}, contexto: null, historico: null, execucoes: { a: 1 }, mandato: null };
  const { deps: d } = deps();
  const out = buildMemoryBrief({ ...input(), enabled: true }, d);
  if (!out.enabled || !out.memoria) throw new Error("memory expected");
  const withMemory = insertMemory(brief, out.memoria);
  expect(Object.keys(withMemory)).toEqual(["v", "carteira", "chaves", "posicoes", "compras", "contexto", "historico", "execucoes", "memoria", "mandato"]);
  expect(withMemory.memoria).toBe(out.memoria);
  expect(JSON.stringify(insertMemory(brief, undefined))).toBe(JSON.stringify(brief));
  const noExec = { v: 1, historico: null, mandato: null };
  expect(Object.keys(insertMemory(noExec, out.memoria))).toEqual(["v", "historico", "memoria", "mandato"]);
});

test("the recorded version carries the contract hash and the legend hash, so a legend change changes the effective version", () => {
  expect(MEMORY_HOOK_VERSION).toEqual({ schema: BRIEF_MEMORY_SCHEMA_VERSION, versionHash: BRIEF_MEMORY_VERSION_HASH, legendHash: sha(BRIEF_MEMORY_LEGEND) });
  expect(MEMORY_HOOK_VERSION.legendHash).toMatch(/^[a-f0-9]{64}$/);
});

test("the inputs are not touched", () => {
  const i = Object.freeze({ ...input(), enabled: true, itemIds: Object.freeze([BUY_A, HOLD_B]), cohortCycleIds: Object.freeze([...COHORT]) });
  const { deps: d } = deps();
  expect(() => buildMemoryBrief(i, d)).not.toThrow();
});
