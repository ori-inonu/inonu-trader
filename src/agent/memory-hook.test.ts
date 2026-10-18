import { expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { buildExperienceMemory, type ExperienceEpisodeV2, type MemoryQueryV2 } from "../decision-review/evolution/memory";
import { BRIEF_MEMORY_LEGEND, BRIEF_MEMORY_SCHEMA_VERSION, BRIEF_MEMORY_VERSION_HASH, projectBriefMemory } from "../decision-review/evolution/brief-memory";
import type { CapturedMemoryBatchResult, CapturedMemoryResult } from "../decision-review/evolution/captured-memory";
import { MEMORY_HOOK_ENV, MEMORY_HOOK_VERSION, addedBytesOf, buildMemoryBrief, insertMemory, memoryHookEnabled, memoryQueries, type MemoryHookDeps } from "./memory-hook";

const AT = 1_800_000_000_000;
const ASSET_A = "token:501:So11111111111111111111111111111111111111112";
const ASSET_B = "token:1:0x00000000000000000000000000000000000000aa";
const BUY_A = `buy:${ASSET_A}`;
const HOLD_B = `hold:${ASSET_B}@agente`;
const COHORT = ["past-0", "past-1", "past-2"];
const context = { regime: "unknown", riskCheck: "unknown", liquidityBand: "unknown", codes: [] } as const;
const sha = (v: string) => createHash("sha256").update(v).digest("hex");

/** What the real batch reader returns for a query, built through the real memory builder: synthetic pending episodes only, no outcome, no wallet, no money. */
function frameFor(query: MemoryQueryV2, arm: "A" | "B", withRows: boolean, cohort: readonly string[] = COHORT): Extract<CapturedMemoryResult, { ok: true }> {
  const episodes: ExperienceEpisodeV2[] = withRows
    ? cohort.map((cycleId, i) => ({
        schemaVersion: 2, cycleId, candidateId: query.candidateId, itemScope: query.itemScope, snapshotHash: "d".repeat(64), decisionVersion: "b".repeat(64), evaluatorHash: "c".repeat(64), episodeVersion: 1,
        decidedAtMs: 1000 + i, recordedAtMs: 2000 + i, factAvailableAtMs: 500, arm, action: i === 0 ? "buy" : "hold", source: arm === "A" ? "decision_journal" : "shadow_journal", context, observations: [], outcome: null, counterfactuals: [],
      }) as unknown as ExperienceEpisodeV2)
    : [];
  const built = buildExperienceMemory(episodes, query);
  if (!built.ok) throw new Error(built.reason);
  return {
    ok: true, coverage: "requested_cycles_only", requestedCycleIds: [...cohort], arm, memory: built.value,
    diagnostics: cohort.map((cycleId) => ({ cycleId, status: "bound" as const, rawVariants: 1, metadataVariants: 1, referenceVariants: 0, pendingItems: withRows ? 1 : 0, excludedQueryCycle: false })),
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
    status: "ok", failure: null, items: 2, skipped: 0, duplicates: 0, invalid: 0, overflow: 0, cohort: COHORT.length, quality: { complete: 2, partial: 0, unavailable: 0, unknown: 0 }, gaps: 0,
    bytes: Buffer.byteLength(JSON.stringify(direct.value)), addedBytes: addedBytesOf(direct.value), hash: direct.value.h, version: BRIEF_MEMORY_VERSION_HASH, legendHash: sha(BRIEF_MEMORY_LEGEND), durationMs: 4, tokens: null, costUsd: null,
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

// The four vectors the independent review of this module reproduced (section 126): each was written to fail first.

test("RED1: a Brief that already carries a memory gets the NEW value in the canonical place, never the old one or a null", () => {
  const out = deps();
  const built = buildMemoryBrief({ ...input(), enabled: true }, out.deps);
  if (!built.enabled || !built.memoria) throw new Error("memory expected");
  const after = insertMemory({ v: 1, historico: null, mandato: null, memoria: null }, built.memoria);
  expect(Object.keys(after)).toEqual(["v", "historico", "memoria", "mandato"]);
  expect(after.memoria).toBe(built.memoria);
  const middle = insertMemory({ v: 1, memoria: "old", execucoes: { a: 1 }, mandato: null }, built.memoria);
  expect(Object.keys(middle)).toEqual(["v", "execucoes", "memoria", "mandato"]);
  expect(middle.memoria).toBe(built.memoria);
  const twice = insertMemory(insertMemory({ v: 1, mandato: null }, built.memoria), built.memoria);
  expect(Object.keys(twice).filter((k) => k === "memoria")).toHaveLength(1);
  // no new block: the Brief comes back untouched, whatever it held
  const brief = { v: 1, memoria: null, mandato: null };
  expect(insertMemory(brief, undefined) as unknown).toBe(brief);
});

test("RED2: a clock that throws or lies never escapes the hook, and the duration is then unknown, never zero", () => {
  const throwing = buildMemoryBrief({ ...input(), enabled: true }, deps({ clock: () => { throw new Error("clock gone"); } }).deps);
  if (!throwing.enabled) throw new Error("enabled expected");
  expect(throwing.memoria).toBeDefined();
  expect(throwing.record.durationMs).toBeNull();
  expect(throwing.record.status).toBe("ok");
  expect(JSON.stringify(throwing)).not.toContain("clock gone");
  let n = 0;
  const secondThrows = buildMemoryBrief({ ...input(), enabled: true }, deps({ clock: () => { if (n++ > 0) throw new Error("late"); return 5; } }).deps);
  if (!secondThrows.enabled) throw new Error("enabled expected");
  expect(secondThrows.record.durationMs).toBeNull();
  const nan = buildMemoryBrief({ ...input(), enabled: true }, deps({ clock: () => Number.NaN }).deps);
  if (!nan.enabled) throw new Error("enabled expected");
  expect(nan.record.durationMs).toBeNull();
  const backwards = [20, 10];
  const back = buildMemoryBrief({ ...input(), enabled: true }, deps({ clock: () => backwards.shift() ?? 10 }).deps);
  if (!back.enabled) throw new Error("enabled expected");
  expect(back.record.durationMs).toBeNull();
  const none = buildMemoryBrief({ ...input({ itemIds: [] }), enabled: true }, deps().deps);
  if (!none.enabled) throw new Error("enabled expected");
  expect(none.record.durationMs).toBeNull();
});

test("RED3: a frame for a cohort the host did not ask is unknown, never accepted as the cohort of this cycle", () => {
  const wrong = deps({ read: (req) => ({ ok: true, results: (req.queries as MemoryQueryV2[]).map((q) => frameFor(q, req.arm, true, ["unrequested"])) }) });
  const out = buildMemoryBrief({ ...input({ cohortCycleIds: ["missing"] }), enabled: true }, wrong.deps);
  if (!out.enabled || !out.memoria) throw new Error("memory expected");
  for (const id of [BUY_A, HOLD_B]) expect(out.memoria.items[id]).toMatchObject({ st: "unavailable", reason: "request_invalid", q: "unknown", h: null, x: [] });
  expect(out.record).toMatchObject({ status: "reader_failed", failure: "request_invalid" });
  expect(JSON.stringify(out.memoria)).not.toContain("unrequested");
  // only the frame that does not match is lost; the one that does is kept
  let calls = 0;
  const partial = deps({ read: (req) => ({ ok: true, results: (req.queries as MemoryQueryV2[]).map((q) => frameFor(q, req.arm, true, calls++ === 0 ? COHORT : ["unrequested"])) }) });
  const mixed = buildMemoryBrief({ ...input(), enabled: true }, partial.deps);
  if (!mixed.enabled || !mixed.memoria) throw new Error("memory expected");
  expect(mixed.memoria.items[BUY_A]).toMatchObject({ st: "available" });
  expect(mixed.memoria.items[HOLD_B]).toMatchObject({ st: "unavailable", reason: "request_invalid" });
  expect(mixed.record.status).toBe("reader_failed");
});

test("RED3b: the cohort asked is the canonical one (sorted, without repeats) and a frame that echoes it is accepted", () => {
  const seen: { cycleIds: readonly string[] }[] = [];
  const d = deps({ read: (req) => { seen.push({ cycleIds: req.cycleIds }); return { ok: true, results: (req.queries as MemoryQueryV2[]).map((q) => frameFor(q, req.arm, true, req.cycleIds)) }; } });
  const out = buildMemoryBrief({ ...input({ cohortCycleIds: ["b", "a", "a", "c"] }), enabled: true }, d.deps);
  if (!out.enabled) throw new Error("enabled expected");
  expect(seen[0]!.cycleIds).toEqual(["a", "b", "c"]);
  expect(out.record).toMatchObject({ status: "ok", cohort: 3, failure: null });
});

test("RED4: an error code outside the allowlist never reaches the record or the Brief value", () => {
  const leaky = deps({ read: () => ({ ok: false, code: "SECRET-token-123: boom" as never }) });
  const out = buildMemoryBrief({ ...input(), enabled: true }, leaky.deps);
  if (!out.enabled) throw new Error("enabled expected");
  expect(out.record.failure).toBe("reader_unavailable");
  expect(out.record.status).toBe("reader_failed");
  expect(JSON.stringify(out)).not.toContain("SECRET");
  const known = buildMemoryBrief({ ...input(), enabled: true }, deps({ read: () => ({ ok: false, code: "snapshot_changed" }) }).deps);
  if (!known.enabled) throw new Error("enabled expected");
  expect(known.record.failure).toBe("snapshot_changed");
  const projector = buildMemoryBrief({ ...input(), enabled: true }, deps({ project: () => ({ ok: false, code: "SECRET-from-projector" as never }) }).deps);
  if (!projector.enabled) throw new Error("enabled expected");
  expect(projector.record).toMatchObject({ status: "projector_failed", failure: "projector_invalid" });
  expect(JSON.stringify(projector)).not.toContain("SECRET");
});

// The remaining vectors of the retest of the independent review (sections 127 and 128): each was written to fail first.

const base58Ids = (n: number): string[] => {
  const letters = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  return Array.from({ length: n }, (_, i) => `buy:token:501:So${"1".repeat(38)}${letters[Math.floor(i / letters.length)]}${letters[i % letters.length]}`);
};

test("RED5: a projector that says ok with a null or malformed value is a projector failure, never a throw", () => {
  for (const value of [null, undefined, 7, "x", {}, { items: null }, { items: {}, gaps: 3 }]) {
    const out = buildMemoryBrief({ ...input(), enabled: true }, deps({ project: () => ({ ok: true, value: value as never }) }).deps);
    if (!out.enabled) throw new Error("enabled expected");
    expect(out.memoria).toBeUndefined();
    expect(out.record).toMatchObject({ status: "projector_failed", failure: "projector_invalid", hash: null });
  }
  const hostile = { get items(): never { throw new Error("getter ran"); } };
  const out = buildMemoryBrief({ ...input(), enabled: true }, deps({ project: () => ({ ok: true, value: hostile as never }) }).deps);
  if (!out.enabled) throw new Error("enabled expected");
  expect(out.record.status).toBe("projector_failed");
  expect(JSON.stringify(out)).not.toContain("getter ran");
});

test("RED6: an input that throws when it is read never reaches the reader and never throws out of the hook", () => {
  const ids: string[] = [];
  Object.defineProperty(ids, 0, { get() { throw new Error("getter ran"); }, enumerable: true });
  const d = deps();
  const out = buildMemoryBrief({ ...input(), enabled: true, itemIds: ids }, d.deps);
  if (!out.enabled) throw new Error("enabled expected");
  expect(d.seen.calls).toBe(0);
  expect(out.memoria).toBeUndefined();
  expect(out.record).toMatchObject({ status: "input_invalid", failure: "input_invalid", items: 0, hash: null, durationMs: null });
  expect(JSON.stringify(out)).not.toContain("getter ran");
  const cohort: string[] = [];
  Object.defineProperty(cohort, 0, { get() { throw new Error("getter ran"); }, enumerable: true });
  expect((buildMemoryBrief({ ...input(), enabled: true, cohortCycleIds: cohort }, deps().deps) as { record: { status: string } }).record.status).toBe("input_invalid");
  const asOf = { ...input(), enabled: true, get asOfMs(): number { throw new Error("getter ran"); } };
  expect((buildMemoryBrief(asOf as never, deps().deps) as { record: { status: string } }).record.status).toBe("input_invalid");
  const enabledThrows = { ...input(), get enabled(): boolean { throw new Error("getter ran"); } };
  expect(buildMemoryBrief(enabledThrows as never, deps().deps)).toEqual({ enabled: false });
});

test("RED7: a frame that answers a DIFFERENT query for the same item, cycle and as-of is unknown, never accepted", () => {
  const wrong = deps({ read: (req) => ({ ok: true, results: (req.queries as MemoryQueryV2[]).map((q) => frameFor({ ...q, maxExperiences: 99, snapshotHash: "e".repeat(64) }, req.arm, true)) }) });
  const out = buildMemoryBrief({ ...input(), enabled: true }, wrong.deps);
  if (!out.enabled || !out.memoria) throw new Error("memory expected");
  for (const id of [BUY_A, HOLD_B]) expect(out.memoria.items[id]).toMatchObject({ st: "unavailable", reason: "request_invalid", q: "unknown", h: null, x: [] });
  expect(out.record).toMatchObject({ status: "reader_failed", failure: "request_invalid" });
  // the same frames built for the query that was asked are accepted
  expect(buildMemoryBrief({ ...input(), enabled: true }, deps().deps)).toMatchObject({ record: { status: "ok" } });
});

test("RED8: a reader that mutates what it was given cannot contaminate the next consultation", () => {
  const seenCodes: unknown[][] = [];
  const mutating = deps({
    read: (req) => {
      const q = req.queries[0] as unknown as { context: { codes: unknown[] } };
      seenCodes.push([...q.context.codes]);
      q.context.codes.push("poison");
      (req.cycleIds as string[]).push("poison-cycle");
      return { ok: true, results: (req.queries as MemoryQueryV2[]).map((query) => frameFor(query, req.arm, true)) };
    },
  });
  const first = buildMemoryBrief({ ...input(), enabled: true }, mutating.deps);
  const second = buildMemoryBrief({ ...input(), enabled: true }, mutating.deps);
  expect(seenCodes).toEqual([[], []]);
  for (const out of [first, second]) {
    if (!out.enabled) throw new Error("enabled expected");
    // the frame was built from a query the reader had changed: it no longer answers the one that was asked
    expect(out.record.status).toBe("reader_failed");
  }
  expect(memoryQueries(input()).queries[0]!.context.codes).toEqual([]);
});

test("RED9: duplicates, ids the memory cannot scope and ids beyond the reader's bound are counted apart, and the overflow is visible", () => {
  const ids = base58Ids(70);
  const out = memoryQueries(input({ itemIds: [...ids, ids[0], "buy:not-a-token", "hold:token:501:native@someone"] }));
  expect(out.queries).toHaveLength(64);
  expect(out).toMatchObject({ duplicates: 1, invalid: 2, overflow: 6, skipped: 9 });
  const d = deps();
  const built = buildMemoryBrief({ ...input({ itemIds: [...ids, ids[0], "buy:not-a-token"] }), enabled: true }, d.deps);
  if (!built.enabled) throw new Error("enabled expected");
  expect(built.record).toMatchObject({ items: 64, duplicates: 1, invalid: 1, overflow: 6, skipped: 8 });
});

test("RED10: maxBytes bounds EVERYTHING the memory adds to the Brief (the value, its key and the legend entry), and the record says how much that is", () => {
  const first = buildMemoryBrief({ ...input(), enabled: true }, deps().deps);
  if (!first.enabled || !first.memoria) throw new Error("memory expected");
  const added = first.record.addedBytes;
  // the key and the legend entry in chaves: `,"memoria":` twice (11 bytes each), the value and the legend as JSON
  expect(added).toBe(22 + Buffer.byteLength(JSON.stringify(first.memoria)) + Buffer.byteLength(JSON.stringify(BRIEF_MEMORY_LEGEND)));
  expect(first.record.bytes).toBe(Buffer.byteLength(JSON.stringify(first.memoria)));
  const fits = buildMemoryBrief({ ...input(), enabled: true, maxBytes: added }, deps().deps);
  if (!fits.enabled) throw new Error("enabled expected");
  expect(fits.record.status).toBe("ok");
  const over = buildMemoryBrief({ ...input(), enabled: true, maxBytes: added - 1 }, deps().deps);
  if (!over.enabled) throw new Error("enabled expected");
  expect(over.memoria).toBeUndefined();
  expect(over.record).toMatchObject({ status: "over_budget", addedBytes: added });
});

test("RED of the retest (137): a Brief left alone keeps its own type, null included; the type no longer promises a BriefMemory that is not there", () => {
  const brief = { execucoes: {}, mandato: null, memoria: null };
  const out = insertMemory(brief, undefined);
  expect(out).toBe(brief);
  const memory = out.memoria;
  expect(() => {
    // @ts-expect-error in a Brief that was left alone `memoria` is the null it held; the old signature said BriefMemory | undefined and this line compiled
    if (memory !== undefined) void memory.h;
  }).toThrow();
  // with a value the key is replaced and typed as that value; with a value that may be absent the type is the union
  const built = buildMemoryBrief({ ...input(), enabled: true }, deps().deps);
  if (!built.enabled || !built.memoria) throw new Error("memory expected");
  const replaced = insertMemory(brief, built.memoria);
  expect(replaced.memoria.h).toBe(built.memoria.h);
  const maybe: typeof built.memoria | undefined = built.memoria;
  const either = insertMemory(brief, maybe);
  expect("memoria" in either).toBe(true);
});
