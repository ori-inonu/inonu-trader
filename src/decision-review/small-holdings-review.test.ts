import { expect, test } from "bun:test";
import { holdingCandidates } from "../agent/candidates";
import { protectiveSellPlan } from "../agent/exit";
import type { Book, HoldingFacts, Position } from "../agent/types";

// origin: synthetic_fixture. The owner's updated policy removes the global $10
// floor. This verifies offered choices, not route profitability or execution.
const address = "5".repeat(44);
const position = (usd: number): Position => ({ id: `token:501:${address}`, chainIndex: "501", address, symbol: "SYNTH", wallet: "agente", usd,
  balanceMinor: String(usd * 1000000), decimals: 6, isCash: false, priceUsd: 1 });
const book = (usd: number): Book => ({ observedAtMs: 1000, positions: [position(usd)], cashByChain: { "501": 92 }, totalUsd: usd + 92, agentUsd: usd + 92 });
const facts: HoldingFacts = { priceUsd: 1, sinceEntryPct: null, changeH24Pct: 0, liquidityUsd: 1000000, exitImpactPct: 0.01, volumeH24Usd: 500000,
  soldPct: 0, riskLevel: 1, riskFlags: [], heldHours: 10 };

test("a priced holding and a representable trim stay available below ten dollars", () => {
  const large = holdingCandidates(book(24), () => facts).candidates[0]!;
  expect(large.stances).toContain("trim_third");
  expect(large.usdByStance.trim_third).toBe(8);
  expect(large.stances).toContain("trim_half");
  expect(large.usdByStance.trim_half).toBe(12);
  const small = holdingCandidates(book(8), () => facts);
  expect(small.candidates).toHaveLength(1);
  expect(small.candidates[0]!.stances).toContain("exit_all");
  expect(small.candidates[0]!.usdByStance.exit_all).toBe(8);
  expect(small.excluded).toEqual({});
});

test("a protective exit remains representable below ten dollars", () => {
  expect(protectiveSellPlan(position(8), "exit_all")).toEqual({ amountMinor: "8000000", usd: 8 });
});

test("one raw token unit can be exited while fractions that round to zero are absent", () => {
  const tiny = { ...book(0.000001), positions: [{ ...position(0.000001), balanceMinor: "1" }] };
  const offered = holdingCandidates(tiny, () => facts);
  expect(offered.candidates).toHaveLength(1);
  expect(offered.candidates[0]!.stances).toContain("exit_all");
  expect(offered.candidates[0]!.stances).not.toContain("trim_half");
  expect(offered.candidates[0]!.stances).not.toContain("trim_third");
});
