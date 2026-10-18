import { expect, test } from "bun:test";
import { buyCandidates } from "../agent/candidates";
import type { TimingFacts } from "../agent/timing";
import type { MomentumFacts } from "../agent/momentum";
import { candidateOf, type EcoFacts, type Saldo } from "../opportunity/ecosystem";

// origin: synthetic_fixture. No provider, model or signing tool is used.
const address = "5".repeat(44);
const facts: EcoFacts = { candidateId: `token:501:${address}`, chainIndex: "501", address, symbol: "SYNTH", nota: 70, priceUsd: 1, changePct: 12,
  volumeUsd: 2000000, liquidityUsd: 5000000, marketCapUsd: 50000000, holders: 5000, buyShare: 0.6, txs: 800, top10Pct: 30, devPct: 2, bundlePct: 3, riskLevel: 1, riskFlags: [], wallets: 4, walletsUsd: 9000, soldPct: 10 };
const saldo: Saldo = { observedAtMs: 1000, totalUsd: 1000, cashUsd: 1000, chains: [{ chainIndex: "501", cashUsd: 1000 }], holdings: [], riskPct: 0.02, reserveShare: 0.1 };
const calm: TimingFacts = { bars: 48, lastClose: 1, rangePos: 0.5, aboveMeanPct: 0, rsi: 50, ret4hPct: 1, ret24hPct: 5, runUpPct: 10, drawFromHighPct: 5, atrPct: 2, volExpansion: 1, sigmaHourPct: 2 };
const ctx = { observedAtMs: 1000, saldo, candidates: [candidateOf(facts, saldo)], excluded: {} };

test("an uncalibrated stretched-price mark remains data for Jev when identity, history and executable sizing are available", () => {
  const baseline = buyCandidates(ctx, () => calm, () => 10)[0]!;
  expect(baseline.stances.some(s => s.startsWith("buy_"))).toBe(true);
  const hot = { ...calm, rangePos: 0.95, rsi: 75, ret24hPct: 32, runUpPct: 65 };
  const c = buyCandidates(ctx, () => hot, () => 10)[0]!;
  expect(c.marks).toContain("parabolico");
  expect(c.stances.some(s => s.startsWith("buy_"))).toBe(true);
});

test("a flat recent hour is an observation for Jev rather than an automatic refusal of an otherwise executable candidate", () => {
  const mm: MomentumFacts = { bars: 24, ret5mPct: 0, ret15mPct: 0, ret1hPct: 0, rangeHourPct: 0.3, volRatio: 1, barAgeMin: 5, marks: ["estagnado"] };
  const c = buyCandidates(ctx, () => calm, () => 10, () => mm)[0]!;
  expect(c.marks).toContain("estagnado");
  expect(c.stances.some(s => s.startsWith("buy_"))).toBe(true);
});

test("high measured volatility is given to Jev rather than removing every existing target and stop by an uncalibrated touch-probability threshold", () => {
  const volatile = { ...calm, sigmaHourPct: 30, atrPct: 35 };
  const c = buyCandidates(ctx, () => volatile, () => 10)[0]!;
  expect(c.timing?.sigmaHourPct).toBe(30);
  expect(c.stances.some(s => s.startsWith("buy_"))).toBe(true);
});
