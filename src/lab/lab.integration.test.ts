import { describe, expect, test } from "bun:test";
import { MemoryJournal } from "./journal.ts";
import { COST_TABLE } from "./outcomes.ts";
import { JevPolicy, defaultRoster, describePolicy, type LabChooser } from "./policies.ts";
import { buildReport, buildSyntheticSpec, manifestOf, runEpochs } from "./run.ts";
import { SyntheticSource, syntheticConfig } from "./source.ts";
import { HOLD, HOUR_MS, type LabReport, type PolicyReport } from "./types.ts";

// LB19, end to end. Spec: docs/JEV-LABORATORIO-DE-DECISAO.md section 7.6.
//
// stats.test.ts shows that the mean test has the size and the power it claims on simulated series. These tests show that
// the WHOLE report keeps them: the same synthetic world goes through the real pipeline (SyntheticSource, the default
// roster with the mock Jev, outcomes with costs, journal, report with Newey-West, Holm and the paired comparisons against
// the baselines) for dozens of seeds, and the rates are counted on the report a user would read. Everything here is
// synthetic: it verifies the statistical machinery and says nothing about any market.
//
// All worlds have one asset with 1.5% daily volatility, 1 hour bars, a 24 hour horizon, and the seeds 1, 2, 3, ...
// The numbers in the comments were measured with the same builder over many more seeds than the test runs (the "scan"),
// and on the seeds the test runs. The limits of the assertions sit well beyond both, so that a harmless change in the
// order in which the generator draws numbers does not turn a deterministic test into a flaky one, while a real defect
// (for example an estimator that ignores the overlap, which rejects about 20% at K = 4) still fails it.
//
// If a rate here is ever clearly above nominal, the statistics are wrong: fix stats.ts, never relax the limit.

const LONG = 120_000;
const ZERO_COSTS = { ...COST_TABLE, feeTakerBps: { spot: 0, perp: 0 }, slippageBpsPerSide: 0, cashYieldAnnual: 0 };

interface World {
  epochs: number;
  /** 24 gives K = 1 (no overlap), 6 gives K = 4. */
  stepHours: number;
  plantedEdgeBps: number;
  /** No fees, spreads, slippage, cash yield, funding or basis: the price is a martingale and every policy has mean zero. */
  exactNull: boolean;
  /** Adds a second tested Jev that bets against the last 24 hour move. */
  withFade?: boolean;
}

/** A Jev that fades: against the 24 hour move of a perpetual when it exceeds one standard deviation. It reacts to the trailing return. */
const FADE_CHOOSER: LabChooser = {
  name: "fade-test-double",
  isMock: true,
  choose(state) {
    let best = HOLD;
    let bestZ = 1;
    for (const candidate of state.candidates) {
      if (candidate.modality !== "perp-directional") continue;
      const ret = candidate.criteria.retLookbackBps;
      const vol = candidate.criteria.volHorizonBps;
      if (typeof ret !== "number" || typeof vol !== "number" || vol <= 0) continue;
      const z = (candidate.side === "short" ? ret : -ret) / vol;
      if (z > bestZ) {
        best = candidate.key;
        bestZ = z;
      }
    }
    return { choice: best, latencyMs: 0 };
  },
};

async function reportOf(world: World, seed: number): Promise<LabReport> {
  const config = syntheticConfig({
    seed,
    epochs: world.epochs,
    stepMs: world.stepHours * HOUR_MS,
    horizonMs: 24 * HOUR_MS,
    barMs: HOUR_MS,
    executionDelayMs: HOUR_MS,
    plantedEdgeBps: world.plantedEdgeBps,
    assets: [{ base: "SYNA", dailyVol: 0.015, startPrice: 100 }],
    ...(world.exactNull
      ? {
          spreadBps: { spot: 0, perp: 0 },
          funding: { intervalMs: 8 * HOUR_MS, meanPerInterval: 0, ar: 0, innovationSd: 0, predictionNoiseSd: 0 },
          basis: { perFunding: 0, noiseSd: 0, noiseAr: 0 },
        }
      : {}),
  });
  const roster = defaultRoster({ seed });
  if (world.withFade === true) roster.push(new JevPolicy({ id: "jev-fade", chooser: FADE_CHOOSER }));
  const base = buildSyntheticSpec(config, roster.map(describePolicy), {});
  const spec = world.exactNull ? { ...base, costTable: ZERO_COSTS } : base;
  const journal = new MemoryJournal(manifestOf(spec));
  await runEpochs({ source: new SyntheticSource(config), policies: roster, spec, journal });
  // 20 resamples instead of 2000: the bootstrap only feeds the leverage block, which none of these tests reads.
  return buildReport(journal.data(), { bootstrapResamples: 20 });
}

function policyOf(report: LabReport, id: string): PolicyReport {
  const found = report.policies.find((policy) => policy.id === id);
  if (found === undefined) throw new Error(`policy ${id} is missing from the report`);
  return found;
}

/** The one-sided test "mean > 0" at 5%, on the raw p-value. */
const rejects = (policy: PolicyReport): boolean => (policy.mean?.pOneSided ?? 1) < 0.05;
/** The same test after the Holm correction over the whole family. */
const holmRejects = (policy: PolicyReport): boolean => (policy.adjustedP ?? 1) < 0.05;
/** What the gate asks of the mean: Holm significant, t >= 2 and a 95% interval above zero. */
const clearWinner = (policy: PolicyReport): boolean => holmRejects(policy) && (policy.mean?.t ?? 0) >= 2 && (policy.mean?.ci95Bps?.[0] ?? -1) > 0;

class Tally {
  private readonly counts = new Map<string, number>();
  add(key: string, amount = 1): void {
    this.counts.set(key, (this.counts.get(key) ?? 0) + amount);
  }
  get(key: string): number {
    return this.counts.get(key) ?? 0;
  }
}

const average = (values: readonly number[]): number => (values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length);

describe("LB19 the whole report keeps the size and the power of the statistics", () => {
  test(
    "LB19 null world with overlap (K=4, 120 epochs, 60 seeds): the one-sided tests reject near 5%, and Holm and the flags stay far below",
    async () => {
      // Every policy has a true mean of exactly zero here. The planted edge is 1e-6 bps, which is nothing, but it makes the
      // source publish a planted score that is pure noise, so that the mock Jev has something to trade on (about 74 of 120
      // epochs). jev-fade trades about a third of the epochs.
      //
      // Scan (600 seeds, same builder), share of seeds in which the raw one-sided test rejected at 5%:
      //   random 3.5%, buy-and-hold 5.3%, momentum-rule 2.5%, jev 3.3%, jev-fade 7.0%.
      // The two rules that react to the trailing return have mirror image tails: the mean of their t is -0.24 (momentum-rule)
      // and +0.21 (jev-fade) while it is 0.00 to 0.02 for random and buy-and-hold, so the rejection of the test "mean > 0" is
      // below nominal for the first and above for the second (the two-sided size is right). A standalone simulation on pure
      // GBM prices, outside the pipeline, gives 3.7% and 7.0% at 400 epochs. Section 7.6 of the spec explains why the gate
      // does not depend on this raw test alone.
      // After Holm: at most 0.7% per policy (jev-fade) and 1.3% of the seeds with any rejection in the whole family.
      // Flagged (Holm plus beating every baseline): 0 of 600 seeds.
      //
      // On the 60 seeds of this test: rejections random 0, buy-and-hold 5, momentum-rule 1, jev 4, jev-fade 3 (13 of 300, 4.3%);
      // Holm rejections 1 in total; family with any rejection 1 seed; flagged 0 seeds; mean t of random -0.04, buy-and-hold 0.08, jev 0.17.
      const world: World = { epochs: 120, stepHours: 6, plantedEdgeBps: 1e-6, exactNull: true, withFade: true };
      const ids = ["random", "buy-and-hold", "momentum-rule", "jev", "jev-fade"];
      const seeds = 60;
      const tested = new Tally();
      const rejected = new Tally();
      const holm = new Tally();
      const trades = new Tally();
      const tByPolicy = new Map<string, number[]>();
      let familyAny = 0;
      let flaggedSeeds = 0;
      for (let seed = 1; seed <= seeds; seed += 1) {
        const report = await reportOf(world, seed);
        for (const id of ids) {
          const policy = policyOf(report, id);
          if (policy.mean?.pOneSided !== null && policy.mean?.pOneSided !== undefined) tested.add(id);
          if (rejects(policy)) rejected.add(id);
          if (holmRejects(policy)) holm.add(id);
          trades.add(id, policy.trades);
          const t = policy.mean?.t;
          if (t !== null && t !== undefined) tByPolicy.set(id, [...(tByPolicy.get(id) ?? []), t]);
        }
        if (report.multipleTesting.family.some((entry) => entry.rejected)) familyAny += 1;
        if (report.flagged.length > 0) flaggedSeeds += 1;
      }

      // The test is not vacuous: every policy produced a p-value in every seed, and the two Jevs really traded.
      for (const id of ids) expect({ id, tested: tested.get(id) }).toEqual({ id, tested: seeds });
      expect(trades.get("jev") / seeds).toBeGreaterThan(30);
      expect(trades.get("jev-fade") / seeds).toBeGreaterThan(10);

      // Near nominal and never much above: at most 10 of 60 (17%) for any policy, at most 36 of 300 (12%) pooled.
      // Ignoring the overlap would give about 20%.
      for (const id of ids) expect({ id, rejected: rejected.get(id) <= 10 }).toEqual({ id, rejected: true });
      const pooled = ids.reduce((sum, id) => sum + rejected.get(id), 0);
      expect(pooled).toBeGreaterThan(0);
      expect(pooled).toBeLessThanOrEqual(36);

      // The corrected verdicts are far below the nominal level.
      for (const id of ids) expect(holm.get(id)).toBeLessThanOrEqual(2);
      expect(familyAny).toBeLessThanOrEqual(6);
      expect(flaggedSeeds).toBeLessThanOrEqual(1);

      // The premise of the world: policies that do not react to the trailing return have a mean t around zero.
      for (const id of ["random", "buy-and-hold", "jev"]) expect(Math.abs(average(tByPolicy.get(id) ?? []))).toBeLessThan(0.5);
      for (const id of ["momentum-rule", "jev-fade"]) expect(Math.abs(average(tByPolicy.get(id) ?? []))).toBeLessThan(0.9);
    },
    LONG,
  );

  test(
    "LB19 realistic costs and no edge (K=1, 160 epochs, 16 seeds): costs make the policies lose and nothing is flagged",
    async () => {
      // Default costs, spreads and funding of the synthetic source, and the same noise score as above. Scan (200 seeds): the
      // raw test rejected in 0% (random), 3.5% (buy-and-hold), 0.5% (momentum-rule) and 0.5% (jev) of the seeds; no Holm
      // rejection, no seed with any rejection in the family and no flag in 200 seeds. The random policy lost money in 192 of
      // 200 seeds (mean about -15 bps per epoch) and momentum-rule in 171 of 200: the cost table bites, which is the
      // point of making it conservative. On the 16 seeds of this test: no rejection at all, no flag.
      const world: World = { epochs: 160, stepHours: 24, plantedEdgeBps: 1e-6, exactNull: false };
      const seeds = 16;
      let pooled = 0;
      let familyAny = 0;
      let flaggedSeeds = 0;
      let randomLost = 0;
      const jevTrades: number[] = [];
      for (let seed = 1; seed <= seeds; seed += 1) {
        const report = await reportOf(world, seed);
        for (const id of ["random", "buy-and-hold", "momentum-rule", "jev"]) if (rejects(policyOf(report, id))) pooled += 1;
        if (report.multipleTesting.family.some((entry) => entry.rejected)) familyAny += 1;
        if (report.flagged.length > 0) flaggedSeeds += 1;
        if ((policyOf(report, "random").mean?.meanBps ?? 0) < 0) randomLost += 1;
        jevTrades.push(policyOf(report, "jev").trades);
      }
      expect(average(jevTrades)).toBeGreaterThan(10);
      expect(randomLost).toBeGreaterThanOrEqual(13);
      expect(pooled).toBeLessThanOrEqual(3);
      expect(familyAny).toBeLessThanOrEqual(1);
      expect(flaggedSeeds).toBeLessThanOrEqual(1);
    },
    LONG,
  );

  test(
    "LB19 planted edge (K=1, 160 epochs, 110 bps, realistic costs, 30 seeds): the report finds it in the vast majority of the seeds",
    async () => {
      // 110 bps is the expected gross return of the ORACLE rule "long if the planted score is positive, else short", every
      // epoch, for an asset with 1.5% daily volatility (correlation 0.92 between the score and the next move; the source
      // refuses 0.95 and above). The mock Jev trades only the strong scores, about 30 epochs of 160, and pays the costs of
      // the cost table on each. Scan (120 seeds): Holm significant with t >= 2 and an interval above zero in 100% of the
      // seeds; FLAGGED, that is also better than every one of the five baselines, in 94% (113 of 120; the 7 misses all
      // failed the comparison with buy-and-hold, whose swings are large); the mean net return of the Jev positive in
      // 100%, 43 bps per epoch on average; momentum-rule and carry-rule never flagged. In the worst window of 30 consecutive
      // seeds of the scan 26 were flagged, which is also what the 30 seeds of this test give.
      const world: World = { epochs: 160, stepHours: 24, plantedEdgeBps: 110, exactNull: false };
      const seeds = 30;
      let significant = 0;
      let flaggedJev = 0;
      let positive = 0;
      let wrongFlag = 0;
      const means: number[] = [];
      for (let seed = 1; seed <= seeds; seed += 1) {
        const report = await reportOf(world, seed);
        const jev = policyOf(report, "jev");
        if (clearWinner(jev)) significant += 1;
        if (report.flagged.includes("jev")) flaggedJev += 1;
        if ((jev.mean?.meanBps ?? 0) > 0) positive += 1;
        if (report.flagged.some((id) => id !== "jev")) wrongFlag += 1;
        means.push(jev.mean?.meanBps ?? 0);
      }
      expect(significant).toBeGreaterThanOrEqual(27);
      expect(flaggedJev).toBeGreaterThanOrEqual(23);
      expect(positive).toBeGreaterThanOrEqual(29);
      expect(wrongFlag).toBeLessThanOrEqual(1);
      // Units: basis points of the committed capital per epoch, net of costs; the scan average is 43.
      expect(average(means)).toBeGreaterThan(20);
      expect(average(means)).toBeLessThan(110);
    },
    LONG,
  );
});
