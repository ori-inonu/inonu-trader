import { afterAll, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { validateCaptureRecord, type CaptureRecord } from "./capture-format.ts";
import { FileJournal, JournalError, MemoryJournal, type JournalData } from "./journal.ts";
import { COST_TABLE, entryStartFor } from "./outcomes.ts";
import { MockJevChooser, defaultRoster, describePolicy, holdPolicy, type LabPolicy, type PolicyInput } from "./policies.ts";
import {
  MOCK_WARNING,
  STANDING_DISCLAIMER,
  buildReplaySpec,
  buildReport,
  buildSyntheticSpec,
  manifestOf,
  parseSpec,
  renderSummaryPt,
  runEpochs,
} from "./run.ts";
import { LeakError, ReplaySource, SyntheticSource, syntheticConfig, type DataSource } from "./source.ts";
import { HOLD, HOUR_MS, type LabReport, type PolicyDecision } from "./types.ts";

// Spec: docs/JEV-LABORATORIO-DE-DECISAO.md sections 4, 7 and 9. Titles start with the acceptance id.
// Everything is synthetic.

const SCRATCH = mkdtempSync(join(tmpdir(), "jev-lab-run-"));
afterAll(() => rmSync(SCRATCH, { recursive: true, force: true }));
let counter = 0;
const freshDir = (): string => join(SCRATCH, `run-${(counter += 1)}`);

const BANNED = new RegExp(`[${[0xb7, 0x2013, 0x2014, 0x2212, 0x2022, 0x2219, 0x22c5, 0x2027, 0x30fb].map((c) => String.fromCharCode(c)).join("")}]`);

const CONFIG = syntheticConfig({ seed: 7, epochs: 24, stepMs: 6 * HOUR_MS, horizonMs: 24 * HOUR_MS });
const BASE_SOURCE = new SyntheticSource(CONFIG);
const BASE_ROSTER = defaultRoster({ seed: 7 });
const BASE_SPEC = buildSyntheticSpec(CONFIG, BASE_ROSTER.map(describePolicy), {});
const BASE_JOURNAL = new MemoryJournal(manifestOf(BASE_SPEC));
const BASE_SUMMARY = await runEpochs({ source: BASE_SOURCE, policies: BASE_ROSTER, spec: BASE_SPEC, journal: BASE_JOURNAL });
const BASE_DATA = BASE_JOURNAL.data();

function policyIds(): string[] {
  return BASE_ROSTER.map((p) => p.id);
}

describe("LB24 the orchestrator records every epoch, every policy and every eligible candidate", () => {
  test("LB24 summary and journal sizes for a synthetic run of 24 epochs and six policies", () => {
    expect(BASE_SUMMARY).toEqual({ planned: 24, processed: 24, skipped: 0, pending: 0, appended: 24 + 24 * 6 + 24 * 8 });
    expect(BASE_DATA.epochs.length).toBe(24);
    expect(BASE_DATA.decisions.length).toBe(24 * 6);
    expect(BASE_DATA.outcomes.length).toBe(24 * 8);
    expect(BASE_DATA.outcomes.every((o) => o.complete)).toBe(true);
  });

  test("LB24 each epoch is on the grid, named e<t>, with candidates sorted by id, and every policy decided over hold plus the eligible ids", () => {
    BASE_DATA.epochs.forEach((epoch, index) => {
      expect(epoch.t).toBe(BASE_SPEC.firstEpochMs + index * BASE_SPEC.stepMs);
      expect(epoch.id).toBe(`e${epoch.t}`);
      expect(epoch.index).toBe(index);
      expect(epoch.candidates.map((c) => c.id)).toEqual([...epoch.candidates.map((c) => c.id)].sort());
      const decisions = BASE_DATA.decisions.filter((d) => d.epochId === epoch.id);
      expect(decisions.map((d) => d.policyId)).toEqual(policyIds());
      for (const decision of decisions) {
        expect([HOLD, ...epoch.eligibleIds]).toContain(decision.choice);
        expect(Object.keys(decision.probabilities).sort()).toEqual([HOLD, ...epoch.eligibleIds].sort());
      }
      const outcomes = BASE_DATA.outcomes.filter((o) => o.epochId === epoch.id);
      expect(outcomes.map((o) => o.candidateId)).toEqual(epoch.eligibleIds);
    });
  });

  test("LB24 rerunning on the same journal changes nothing and consults no policy", async () => {
    const before = JSON.stringify(BASE_JOURNAL.data());
    let calls = 0;
    const counting: LabPolicy[] = BASE_ROSTER.map((policy) => ({ ...policy, decide: (input: PolicyInput) => { calls += 1; return policy.decide(input); } }));
    const again = await runEpochs({ source: BASE_SOURCE, policies: counting, spec: BASE_SPEC, journal: BASE_JOURNAL });
    expect(again).toEqual({ planned: 24, processed: 0, skipped: 24, pending: 0, appended: 0 });
    expect(calls).toBe(0);
    expect(JSON.stringify(BASE_JOURNAL.data())).toBe(before);
  });

  test("LB24 the policy receives only the epoch id, the instant and frozen eligible candidates: no source, no raw records", async () => {
    const seen: PolicyInput[] = [];
    const spy: LabPolicy = { ...holdPolicy(), id: "spy", decide: (input) => { seen.push(input); return holdPolicy().decide(input) as PolicyDecision; } };
    const spec = buildSyntheticSpec(CONFIG, [describePolicy(spy)], {});
    const journal = new MemoryJournal(manifestOf(spec));
    await runEpochs({ source: new SyntheticSource(CONFIG), policies: [spy], spec, journal });
    expect(seen.length).toBe(24);
    for (const input of seen) {
      expect(Object.keys(input).sort()).toEqual(["eligible", "epochId", "t"]);
      expect(Object.isFrozen(input)).toBe(true);
      expect(Object.isFrozen(input.eligible)).toBe(true);
      expect(input.eligible.every((c) => Object.isFrozen(c) && Object.isFrozen(c.features))).toBe(true);
      expect(input.eligible.map((c) => c.id)).toEqual((journal.getEpoch(input.epochId)?.eligibleIds ?? []));
    }
  });

  test("LB24 a policy that fails, answers an unknown id, or answers nonsense is turned into a hold with a status, and the run goes on", async () => {
    const ids = (kind: string): LabPolicy => ({
      ...holdPolicy(),
      id: kind,
      decide: (input) => {
        const base = holdPolicy().decide(input) as PolicyDecision;
        if (kind === "thrower") throw new Error("boom SECRET-CANARY");
        if (kind === "stranger") return { ...base, policyId: "stranger", choice: "perp-directional.NOPE-USDT-SWAP.long" };
        if (kind === "garbage") return { ...base, policyId: "garbage", latencyMs: Number.NaN };
        if (kind === "mutator") {
          (input.eligible[0] as { id: string }).id = "hacked";
          return { ...base, policyId: "mutator" };
        }
        return { ...base, policyId: kind };
      },
    });
    const roster = ["thrower", "stranger", "garbage", "mutator"].map(ids);
    const spec = buildSyntheticSpec(CONFIG, roster.map(describePolicy), {});
    const journal = new MemoryJournal(manifestOf(spec));
    const summary = await runEpochs({ source: new SyntheticSource(CONFIG), policies: roster, spec, journal });
    expect(summary.processed).toBe(24);
    const byPolicy = (id: string): PolicyDecision[] => journal.data().decisions.filter((d) => d.policyId === id);
    expect(byPolicy("thrower").every((d) => d.status === "error" && d.choice === HOLD)).toBe(true);
    expect(byPolicy("stranger").every((d) => d.status === "invalid-choice" && d.choice === HOLD)).toBe(true);
    expect(byPolicy("garbage").every((d) => d.status === "malformed" && d.choice === HOLD)).toBe(true);
    expect(byPolicy("mutator").every((d) => d.status === "error" && d.choice === HOLD)).toBe(true);
    expect(JSON.stringify(journal.data())).not.toContain("SECRET-CANARY");
  });
});

describe("LB5 a policy that reaches for the future makes the run fail and leaves no trace of that epoch", () => {
  function leaking(source: DataSource, how: "future" | "asOf" | "swallowed"): LabPolicy {
    return {
      ...holdPolicy(),
      id: "peeker",
      decide(input) {
        if (input.epochId === `e${BASE_SPEC.firstEpochMs + 3 * BASE_SPEC.stepMs}`) {
          if (how === "future") source.future(input.t, input.t + HOUR_MS);
          else if (how === "asOf") source.asOf(input.t + 1);
          else {
            try {
              source.future(input.t, input.t + HOUR_MS);
            } catch {
              /* the policy hides the failure */
            }
          }
        }
        return holdPolicy().decide(input) as PolicyDecision;
      },
    };
  }

  for (const how of ["future", "asOf", "swallowed"] as const) {
    test(`LB5 a policy that reads the future (${how}) aborts the run with a LeakError; earlier epochs stay, that epoch and later ones are absent`, async () => {
      const source = new SyntheticSource(CONFIG);
      const policy = leaking(source, how);
      const spec = buildSyntheticSpec(CONFIG, [describePolicy(policy)], {});
      const journal = new MemoryJournal(manifestOf(spec));
      let error: unknown;
      try {
        await runEpochs({ source, policies: [policy], spec, journal });
      } catch (caught) {
        error = caught;
      }
      expect(error).toBeInstanceOf(LeakError);
      const data = journal.data();
      expect(data.epochs.map((e) => e.index)).toEqual([0, 1, 2]);
      expect(data.decisions.length).toBe(3);
      expect(data.outcomes.length).toBe(3 * 8);
      expect(journal.hasEpoch(`e${BASE_SPEC.firstEpochMs + 3 * BASE_SPEC.stepMs}`)).toBe(false);
      // the decision window was closed again: the source is usable afterwards
      expect(() => source.openDecision(0)).not.toThrow();
      source.closeDecision();
    });
  }

  test("LB5 an honest policy running on the same source is unaffected by the existence of the trap", async () => {
    const source = new SyntheticSource(CONFIG);
    const roster = defaultRoster({ seed: 7 });
    const spec = buildSyntheticSpec(CONFIG, roster.map(describePolicy), {});
    const journal = new MemoryJournal(manifestOf(spec));
    await runEpochs({ source, policies: roster, spec, journal });
    expect(source.leakAttempts()).toBe(0);
    expect(JSON.stringify(journal.data())).toBe(JSON.stringify(BASE_DATA));
  });
});

describe("LB6 decisions at t do not depend on anything after t", () => {
  const cutIndex = 10;
  const cut = BASE_SPEC.firstEpochMs + cutIndex * BASE_SPEC.stepMs;

  function poisoned(): ReplaySource {
    const mutated = BASE_SOURCE.records.map((record): CaptureRecord => {
      if (record.t <= cut) return record;
      if (record.kind === "candle") {
        const d = record.data;
        return validateCaptureRecord({ t: record.t, kind: "candle", inst: record.inst, data: { startMs: d.startMs, barMs: d.barMs, open: d.open * 9, high: d.high * 9, low: d.low * 9, close: d.close * 9 } });
      }
      if (record.kind === "ticker") return validateCaptureRecord({ t: record.t, kind: "ticker", inst: record.inst, data: { bid: record.data.bid * 9, ask: record.data.ask * 9, last: record.data.last * 9 } });
      if (record.kind === "funding") return validateCaptureRecord({ t: record.t, kind: "funding", inst: record.inst, data: { rate: 0.03, settleMs: record.data.settleMs, intervalMs: record.data.intervalMs } });
      if (record.kind === "oi") return validateCaptureRecord({ t: record.t, kind: "oi", inst: record.inst, data: { oi: record.data.oi * 50 } });
      return record;
    });
    return new ReplaySource(mutated, BASE_SOURCE.id);
  }

  test("LB6 the epochs and the decisions of all six policies up to the cut are identical when everything after the cut is absurd", async () => {
    const roster = defaultRoster({ seed: 7 });
    const journal = new MemoryJournal(manifestOf(BASE_SPEC));
    await runEpochs({ source: poisoned(), policies: roster, spec: BASE_SPEC, journal });
    const mine = journal.data();
    for (let i = 0; i <= cutIndex; i += 1) {
      expect(JSON.stringify(mine.epochs[i])).toBe(JSON.stringify(BASE_DATA.epochs[i]));
      const id = BASE_DATA.epochs[i]?.id;
      expect(JSON.stringify(mine.decisions.filter((d) => d.epochId === id))).toBe(JSON.stringify(BASE_DATA.decisions.filter((d) => d.epochId === id)));
    }
    // control: the poison does reach the epochs after the cut and their outcomes
    expect(JSON.stringify(mine.outcomes)).not.toBe(JSON.stringify(BASE_DATA.outcomes));
    expect(JSON.stringify(mine.epochs.slice(cutIndex + 2))).not.toBe(JSON.stringify(BASE_DATA.epochs.slice(cutIndex + 2)));
  });

  test("LB6 a replay of the exported synthetic capture produces exactly the same epochs, decisions and outcomes", async () => {
    const replay = new ReplaySource(BASE_SOURCE.records, "replay:export");
    const spec = buildReplaySpec(replay, "digest-of-the-export", BASE_ROSTER.map(describePolicy), {
      stepMs: CONFIG.stepMs,
      horizonMs: CONFIG.horizonMs,
      barMs: CONFIG.barMs,
      firstEpochMs: BASE_SPEC.firstEpochMs,
      seed: 7,
    });
    expect(spec.epochs).toBe(24);
    const journal = new MemoryJournal(manifestOf(spec));
    await runEpochs({ source: replay, policies: defaultRoster({ seed: 7 }), spec, journal });
    const data = journal.data();
    expect(JSON.stringify(data.epochs)).toBe(JSON.stringify(BASE_DATA.epochs).replaceAll("synthetic:seed=7", "replay:export"));
    expect(JSON.stringify(data.decisions)).toBe(JSON.stringify(BASE_DATA.decisions));
    expect(JSON.stringify(data.outcomes)).toBe(JSON.stringify(BASE_DATA.outcomes));
  });
});

describe("LB24 interruption and resume", () => {
  const manifest = manifestOf(BASE_SPEC);

  test("LB24 a run that dies in the middle and is resumed writes exactly the bytes of an uninterrupted run", async () => {
    const whole = freshDir();
    const wholeJournal = FileJournal.open(whole, manifest);
    await runEpochs({ source: new SyntheticSource(CONFIG), policies: defaultRoster({ seed: 7 }), spec: BASE_SPEC, journal: wholeJournal });

    const crashed = freshDir();
    const source = new SyntheticSource(CONFIG);
    const saboteur = defaultRoster({ seed: 7 }).map((policy): LabPolicy =>
      policy.id !== "jev"
        ? policy
        : { ...policy, decide: (input) => { if (input.epochId === `e${BASE_SPEC.firstEpochMs + 9 * BASE_SPEC.stepMs}`) source.future(input.t, input.t + HOUR_MS); return policy.decide(input); } },
    );
    const firstJournal = FileJournal.open(crashed, manifest);
    await expect(runEpochs({ source, policies: saboteur, spec: BASE_SPEC, journal: firstJournal })).rejects.toBeInstanceOf(LeakError);
    expect(firstJournal.data().epochs.length).toBe(9);

    const resumed = FileJournal.open(crashed, manifest);
    const summary = await runEpochs({ source: new SyntheticSource(CONFIG), policies: defaultRoster({ seed: 7 }), spec: BASE_SPEC, journal: resumed });
    expect(summary).toMatchObject({ processed: 15, skipped: 9 });
    expect(readFileSync(join(crashed, "journal.jsonl"), "utf8")).toBe(readFileSync(join(whole, "journal.jsonl"), "utf8"));
  });

  test("LB24 a half written epoch (the epoch line and one decision) is completed on resume, with the same final data", async () => {
    const partial = new MemoryJournal(manifest);
    const epoch5 = BASE_DATA.epochs[5];
    const first = BASE_DATA.decisions.find((d) => d.epochId === epoch5?.id && d.policyId === "hold");
    partial.append([{ type: "epoch", epoch: epoch5 as NonNullable<typeof epoch5> }, { type: "decision", decision: first as PolicyDecision }]);
    const summary = await runEpochs({ source: new SyntheticSource(CONFIG), policies: defaultRoster({ seed: 7 }), spec: BASE_SPEC, journal: partial });
    expect(summary.skipped).toBe(0);
    const data = partial.data();
    expect(data.epochs.length).toBe(24);
    expect(data.decisions.length).toBe(BASE_DATA.decisions.length);
    expect(data.outcomes.length).toBe(BASE_DATA.outcomes.length);
    const sort = (items: unknown[]): string[] => items.map((x) => JSON.stringify(x)).sort();
    expect(sort(data.decisions)).toEqual(sort(BASE_DATA.decisions));
    expect(sort(data.outcomes)).toEqual(sort(BASE_DATA.outcomes));
  });

  test("LB24 the snapshot hook runs during the run and at the end", async () => {
    let snapshots = 0;
    const journal = new MemoryJournal(manifest);
    await runEpochs({ source: new SyntheticSource(CONFIG), policies: defaultRoster({ seed: 7 }), spec: BASE_SPEC, journal, snapshot: () => { snapshots += 1; }, snapshotEvery: 10 });
    expect(snapshots).toBe(3);
  });

  test("LB24 epochs whose horizon is not covered by the data yet are pending: not run and not written", async () => {
    const longer = syntheticConfig({ ...CONFIG });
    const spec = { ...buildSyntheticSpec(longer, BASE_ROSTER.map(describePolicy), {}), epochs: 30 };
    const journal = new MemoryJournal(manifestOf(spec));
    const summary = await runEpochs({ source: new SyntheticSource(CONFIG), policies: defaultRoster({ seed: 7 }), spec, journal });
    expect(summary.processed).toBe(24);
    expect(summary.pending).toBe(6);
    expect(journal.data().epochs.length).toBe(24);
    const report = buildReport(journal.data());
    expect(report.run.pendingEpochs).toBe(6);
    expect(report.run.epochs).toBe(24);
  });
});

describe("LB8 unknown inference cost never becomes zero", () => {
  const jevOf = (data: JournalData) => data.decisions.filter((d) => d.policyId === "jev");

  test("LB8 without a price per token the cost of every consulted decision is null and the report says the cost is unknown", () => {
    for (const decision of jevOf(BASE_DATA)) {
      expect(decision.costUsd).toBeNull();
      expect(Number.isSafeInteger(decision.inputTokens)).toBe(true);
    }
    const report = buildReport(BASE_DATA);
    const jev = report.policies.find((p) => p.id === "jev");
    expect(jev?.inference.costKnown).toBe(false);
    expect(jev?.inference.costUsdTotal).toBeNull();
    expect(jev?.inference.consulted).toBe(24);
    expect(report.gate.unknown.map((c) => c.id)).toContain("custo-de-inferencia");
  });

  test("LB8 with a price per token the cost is known, it is charged to the Jev series every epoch and the gate criterion passes", async () => {
    const roster = defaultRoster({ seed: 7, inferenceUsdPerMTok: 42 });
    const spec = buildSyntheticSpec(CONFIG, roster.map(describePolicy), { inferenceUsdPerMTok: 42 });
    const journal = new MemoryJournal(manifestOf(spec));
    await runEpochs({ source: new SyntheticSource(CONFIG), policies: roster, spec, journal });
    const decisions = jevOf(journal.data());
    for (const decision of decisions) expect(decision.costUsd).toBeCloseTo(((decision.inputTokens as number) / 1_000_000) * 42, 12);
    const withCost = buildReport(journal.data());
    const without = buildReport(BASE_DATA);
    const a = withCost.policies.find((p) => p.id === "jev");
    const b = without.policies.find((p) => p.id === "jev");
    expect(a?.inference.costKnown).toBe(true);
    const total = decisions.reduce((sum, d) => sum + (d.costUsd as number), 0);
    expect(a?.inference.costUsdTotal).toBeCloseTo(total, 12);
    const expectedDrop = ((total / 24) / COST_TABLE.notionalUsd) * 1e4;
    expect((b?.mean?.meanBps as number) - (a?.mean?.meanBps as number)).toBeCloseTo(expectedDrop, 4);
    expect(withCost.gate.unknown.map((c) => c.id)).not.toContain("custo-de-inferencia");
    expect(withCost.gate.passed.map((c) => c.id)).toContain("custo-de-inferencia");
    // the rules never pay for inference
    expect(withCost.policies.find((p) => p.id === "momentum-rule")?.inference).toMatchObject({ costKnown: true, consulted: 0, costUsdTotal: 0 });
  });
});

describe("LB11 incomplete outcomes are excluded and counted, never read as zero", () => {
  const gapTime = BASE_SPEC.firstEpochMs + 5 * BASE_SPEC.stepMs;
  const outcomeParams = { barMs: CONFIG.barMs, horizonMs: CONFIG.horizonMs, executionDelayMs: CONFIG.executionDelayMs };
  const hole = entryStartFor(gapTime, outcomeParams) + 3 * CONFIG.barMs;
  const records = BASE_SOURCE.records.filter((r) => !(r.kind === "candle" && r.inst === "SYNA-USDT-SWAP" && r.data.startMs === hole));

  test("LB11 a candle missing in the middle of a window makes exactly the candidates of that perp incomplete (candle-gap)", async () => {
    const roster = defaultRoster({ seed: 7 });
    const journal = new MemoryJournal(manifestOf(BASE_SPEC));
    await runEpochs({ source: new ReplaySource(records, "replay:hole"), policies: roster, spec: BASE_SPEC, journal });
    const data = journal.data();
    const incomplete = data.outcomes.filter((o) => !o.complete);
    expect(incomplete.length).toBeGreaterThan(0);
    for (const outcome of incomplete) {
      expect(outcome.incompleteReason).toBe("candle-gap");
      expect(outcome.netReturn).toBeNull();
      expect(outcome.candidateId).toContain("SYNA-USDT-SWAP");
    }
    expect(new Set(incomplete.map((o) => o.epochId)).size).toBeGreaterThanOrEqual(1);
    const report = buildReport(data);
    for (const policy of report.policies) {
      const lost = data.epochs.filter((epoch) => {
        const decision = data.decisions.find((d) => d.epochId === epoch.id && d.policyId === policy.id);
        const outcome = data.outcomes.find((o) => o.epochId === epoch.id && o.candidateId === decision?.choice);
        return outcome !== undefined && !outcome.complete;
      }).length;
      expect(policy.incompleteDecisions).toBe(lost);
      expect(policy.usableEpochs).toBe(24 - lost);
    }
    const jev = report.policies.find((p) => p.id === "jev");
    expect(report.run.completeness).toBeCloseTo((jev?.usableEpochs as number) / 24, 12);
  });

  test("LB11 the same hole leaves the spot-only policy untouched", async () => {
    const journal = new MemoryJournal(manifestOf(BASE_SPEC));
    await runEpochs({ source: new ReplaySource(records, "replay:hole"), policies: defaultRoster({ seed: 7 }), spec: BASE_SPEC, journal });
    const clean = buildReport(BASE_DATA).policies.find((p) => p.id === "buy-and-hold");
    const holed = buildReport(journal.data()).policies.find((p) => p.id === "buy-and-hold");
    expect(holed?.usableEpochs).toBe(24);
    expect(JSON.stringify(holed?.mean)).toBe(JSON.stringify(clean?.mean));
  });
});

describe("LB24 report from the journal", () => {
  const report = buildReport(BASE_DATA);

  test("LB24 the shape: keys in the documented order and the standing disclaimer last", () => {
    expect(Object.keys(report)).toEqual(["schema", "mode", "source", "jev", "run", "costTable", "policies", "paired", "multipleTesting", "flagged", "gate", "notes", "disclaimer"]);
    expect(report.schema).toBe("jev-lab-report-v1");
    expect(report.mode).toBe("synthetic");
    expect(report.source).toBe("synthetic:seed=7");
    expect(report.disclaimer).toBe(STANDING_DISCLAIMER);
    expect(STANDING_DISCLAIMER).toContain("prova lucro");
    expect(STANDING_DISCLAIMER).toContain("não concede");
    expect(STANDING_DISCLAIMER).toContain("qualify:live");
  });

  test("LB24 run info: epochs, window, overlap, completeness and the cost table", () => {
    expect(report.run).toMatchObject({ epochs: 24, pendingEpochs: 0, stepMs: CONFIG.stepMs, horizonMs: CONFIG.horizonMs, overlap: 4, seed: 7, plantedEdgeBps: 0, frozenAtMs: null, completeness: 1 });
    expect(report.run.firstEpochMs).toBe(BASE_SPEC.firstEpochMs);
    expect(report.run.lastEpochMs).toBe(BASE_SPEC.firstEpochMs + 23 * CONFIG.stepMs);
    expect(report.run.spanDays).toBe(6);
    expect(report.costTable).toEqual(JSON.parse(JSON.stringify(COST_TABLE)));
  });

  test("LB17 the Jev of a default run is the mock, announced as such everywhere", () => {
    expect(report.jev).toEqual({ chooser: "mock", isMock: true, realJevCalled: false, warning: MOCK_WARNING });
    expect(MOCK_WARNING).toContain("SUBSTITUTO SIMULADO");
    expect(MOCK_WARNING).toContain("MockJevChooser");
    expect(MOCK_WARNING).toContain("Nenhuma chamada ao Jev real");
  });

  test("LB24 policies come in roster order with their roles; the pairs are every tested policy against every other baseline", () => {
    expect(report.policies.map((p) => p.id)).toEqual(policyIds());
    expect(report.policies.map((p) => [p.baseline, p.tested, p.passive])).toEqual([
      [true, false, false],
      [true, false, false],
      [true, false, true],
      [true, true, false],
      [true, true, false],
      [false, true, false],
    ]);
    const pairs = report.paired.map((row) => `${row.policy}>${row.baseline}`);
    expect(pairs).toEqual([
      "momentum-rule>hold", "momentum-rule>random", "momentum-rule>buy-and-hold", "momentum-rule>carry-rule",
      "carry-rule>hold", "carry-rule>random", "carry-rule>buy-and-hold", "carry-rule>momentum-rule",
      "jev>hold", "jev>random", "jev>buy-and-hold", "jev>momentum-rule", "jev>carry-rule",
    ]);
  });

  test("LB24 hold earns exactly zero and has no inference; buy-and-hold pays no trading cost and is not leveraged", () => {
    const hold = report.policies.find((p) => p.id === "hold");
    expect(hold?.mean).toMatchObject({ meanBps: 0, t: null });
    expect(hold?.trades).toBe(0);
    const buyAndHold = report.policies.find((p) => p.id === "buy-and-hold");
    expect(buyAndHold?.trades).toBe(24);
    for (const row of buyAndHold?.leverage ?? []) expect(row.applicableShare).toBe(0);
    const spotOutcomes = BASE_DATA.outcomes.filter((o) => o.candidateId.startsWith("spot-momentum.SYNA-USDT.long"));
    const passiveMean = spotOutcomes.reduce((sum, o) => sum + ((o.grossReturn as number) + (o.fundingReturn as number) - (o.opportunityCost as number)), 0) / 24;
    expect((buyAndHold?.mean?.meanBps as number) / 1e4).toBeCloseTo(passiveMean, 6);
  });

  test("LB24 with no planted edge nothing is flagged and the gate recommends fase-0 and fails the data criterion", () => {
    expect(report.flagged).toEqual([]);
    expect(report.gate.recommendedPhase).toBe("fase-0");
    expect(report.gate.grantsPermission).toBe(false);
    expect(report.gate.failed.map((c) => c.id)).toContain("dados-reais");
    expect(report.gate.recommendation.startsWith("Recomendação: permanecer na fase-0")).toBe(true);
  });

  test("LB24 the Holm family covers the tested and untested policies that have a test, not hold", () => {
    expect(report.multipleTesting.method).toBe("holm");
    expect(report.multipleTesting.alpha).toBe(0.05);
    const members = report.multipleTesting.family.filter((entry) => entry.modality === null).map((entry) => entry.policy);
    expect(members).not.toContain("hold");
    expect(members.length).toBeGreaterThan(0);
  });

  test("LB24 the same journal always gives the same report, byte for byte, and it survives JSON without NaN", () => {
    const again = buildReport(BASE_DATA);
    expect(JSON.stringify(again)).toBe(JSON.stringify(report));
    expect(JSON.stringify(report)).not.toMatch(/NaN|Infinity|undefined/);
    expect(JSON.parse(JSON.stringify(report))).toEqual(report);
  });

  test("LB24 the number of bootstrap resamples changes only the leverage bootstrap block, and bad values are refused", () => {
    const fast = buildReport(BASE_DATA, { bootstrapResamples: 20 });
    const strip = (value: LabReport): unknown =>
      JSON.parse(JSON.stringify({ ...value, policies: value.policies.map((policy) => ({ ...policy, leverage: policy.leverage.map((row) => ({ ...row, bootstrap: null })) })) }));
    expect(strip(fast)).toEqual(strip(report));
    const resamplesOf = (value: LabReport): number[] => value.policies.flatMap((policy) => policy.leverage.flatMap((row) => (row.bootstrap === null ? [] : [row.bootstrap.resamples])));
    expect(resamplesOf(fast).length).toBeGreaterThan(0);
    expect(new Set(resamplesOf(fast))).toEqual(new Set([20]));
    expect(new Set(resamplesOf(report))).toEqual(new Set([2000]));
    for (const bad of [0, -1, 1.5, Number.NaN, 100_001]) expect(() => buildReport(BASE_DATA, { bootstrapResamples: bad })).toThrow(RangeError);
  });

  test("LB24 the report built after a run equals the report read back from the journal file", async () => {
    const dir = freshDir();
    const journal = FileJournal.open(dir, manifestOf(BASE_SPEC));
    await runEpochs({ source: new SyntheticSource(CONFIG), policies: defaultRoster({ seed: 7 }), spec: BASE_SPEC, journal });
    const direct = buildReport(journal.data());
    const reread = buildReport(FileJournal.read(join(dir, "journal.jsonl")));
    expect(JSON.stringify(reread)).toBe(JSON.stringify(direct));
    expect(JSON.stringify(direct)).toBe(JSON.stringify(report));
  });

  test("LB24 notes say what the data is, and the notes carry no typographic marks that are banned", () => {
    expect(report.notes.length).toBeGreaterThan(2);
    expect(report.notes.join(" ")).toContain("sintéticos provam apenas aritmética");
    for (const note of report.notes) expect(note).not.toMatch(BANNED);
    expect(report.jev.warning ?? "").not.toMatch(BANNED);
    expect(STANDING_DISCLAIMER).not.toMatch(BANNED);
  });

  test("LB24 the report refuses a journal whose manifest is not a lab manifest", () => {
    const broken: JournalData = { ...BASE_DATA, manifest: { ...BASE_DATA.manifest, schema: "other" } };
    let error: unknown;
    try {
      buildReport(broken);
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(JournalError);
    expect(() => parseSpec({ schema: "jev-lab-manifest-v1" })).toThrow(JournalError);
  });

  test("LB24 an incomplete journal (a decision missing) is refused by the report", () => {
    const missing: JournalData = { ...BASE_DATA, decisions: BASE_DATA.decisions.slice(1) };
    expect(() => buildReport(missing)).toThrow(JournalError);
  });
});

describe("LB25 the short summary in Portuguese", () => {
  const lines = renderSummaryPt(buildReport(BASE_DATA));

  test("LB25 it starts by saying nothing is executed, then shouts that the Jev is a mock, and ends with the standing disclaimer", () => {
    expect(lines[0]).toContain("somente sombra");
    expect(lines[1]).toBe(MOCK_WARNING);
    expect(lines[lines.length - 1]).toBe(STANDING_DISCLAIMER);
  });

  test("LB25 it names the source, the window, every policy and the gate, with decimal commas and no banned marks", () => {
    const text = lines.join("\n");
    expect(text).toContain("sintética");
    expect(text).toContain("semente 7");
    expect(text).toContain("24 épocas");
    expect(text).toContain("6,0 dias");
    for (const id of policyIds()) expect(text).toContain(id);
    expect(text).toContain("Portão de promoção");
    expect(text).toContain("fase-0");
    expect(text).not.toMatch(BANNED);
    expect(text).not.toMatch(/\d\.\d+ bps/);
    expect(lines.length).toBeLessThan(40);
  });

  test("LB25 a report from a real Jev does not carry the mock warning", async () => {
    const roster = defaultRoster({ seed: 7, chooser: { name: "real-jev", isMock: false, choose: (state) => new MockJevChooser().choose(state) } });
    const spec = buildSyntheticSpec(CONFIG, roster.map(describePolicy), {});
    const journal = new MemoryJournal(manifestOf(spec));
    await runEpochs({ source: new SyntheticSource(CONFIG), policies: roster, spec, journal });
    const report = buildReport(journal.data());
    expect(report.jev).toEqual({ chooser: "real-jev", isMock: false, realJevCalled: true, warning: null });
    expect(renderSummaryPt(report).join("\n")).not.toContain("SUBSTITUTO SIMULADO");
  });
});

describe("LB24 specs", () => {
  test("LB24 the synthetic spec carries the full configuration, the roster and the single cost table", () => {
    expect(BASE_SPEC).toMatchObject({ schema: "jev-lab-manifest-v1", mode: "synthetic", source: "synthetic:seed=7", stepMs: CONFIG.stepMs, horizonMs: CONFIG.horizonMs, barMs: CONFIG.barMs, executionDelayMs: CONFIG.executionDelayMs, epochs: 24, seed: 7, plantedEdgeBps: 0 });
    expect(BASE_SPEC.firstEpochMs).toBe(CONFIG.startMs + CONFIG.warmupMs);
    expect(BASE_SPEC.costTable).toEqual(COST_TABLE);
    expect(BASE_SPEC.policies.map((p) => p.id)).toEqual(policyIds());
    expect(parseSpec(JSON.parse(JSON.stringify(BASE_SPEC)))).toEqual(BASE_SPEC);
  });

  test("LB24 the replay spec lays the grid on multiples of the step after the warmup and counts the epochs the data can finish", () => {
    const replay = new ReplaySource(BASE_SOURCE.records, "replay:export");
    const spec = buildReplaySpec(replay, "abc", BASE_ROSTER.map(describePolicy), { stepMs: 6 * HOUR_MS, horizonMs: 24 * HOUR_MS, barMs: CONFIG.barMs, seed: 3 });
    expect(spec.mode).toBe("replay");
    expect(spec.firstEpochMs % spec.stepMs).toBe(0);
    expect(spec.firstEpochMs).toBeGreaterThanOrEqual(replay.coverage.firstMs + 3 * 86_400_000);
    expect(spec.firstEpochMs - (replay.coverage.firstMs + 3 * 86_400_000)).toBeLessThan(spec.stepMs);
    const last = spec.firstEpochMs + (spec.epochs - 1) * spec.stepMs;
    const needed = (t: number) => entryStartFor(t, { barMs: spec.barMs, horizonMs: spec.horizonMs, executionDelayMs: spec.executionDelayMs }) + spec.horizonMs + spec.costTable.captureLagMs;
    expect(needed(last)).toBeLessThanOrEqual(replay.coverage.lastMs);
    expect(needed(last + spec.stepMs)).toBeGreaterThan(replay.coverage.lastMs);
    expect(spec.seed).toBe(3);
    expect(spec.sourceDetail).toMatchObject({ digest: "abc" });
    expect(() => buildReplaySpec(replay, "abc", BASE_ROSTER.map(describePolicy), { stepMs: 6 * HOUR_MS, horizonMs: 24 * HOUR_MS * 100, barMs: CONFIG.barMs, seed: 3 })).toThrow(RangeError);
  });

  test("LB24 the frozen window declaration is recorded in the spec and reaches the gate", () => {
    const spec = buildSyntheticSpec(CONFIG, BASE_ROSTER.map(describePolicy), { frozenAtMs: BASE_SPEC.firstEpochMs });
    expect(spec.frozenAtMs).toBe(BASE_SPEC.firstEpochMs);
    expect(spec.firstEpochMs).toBe(BASE_SPEC.firstEpochMs);
  });

  test("LB24 parseSpec refuses a manifest with a missing or wrong field", () => {
    for (const patch of [{ stepMs: 0 }, { horizonMs: "24h" }, { policies: [] }, { mode: "live" }, { epochs: -1 }]) {
      expect(() => parseSpec({ ...JSON.parse(JSON.stringify(BASE_SPEC)), ...patch })).toThrow(JournalError);
    }
  });
});
