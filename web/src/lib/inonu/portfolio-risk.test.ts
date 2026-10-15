import { expect, test } from "bun:test";
import { parsePortfolioAnswer, portfolioCandidateId } from "./portfolio";
import { parseAnswer } from "./client";

const riskDetails = { level: 3, tags: ["suspicious", "devAddLiquidity"], lpBurnedPct: 80, devCreateCount: 12, devLaunchedCount: 8, devRugCount: 2, origin: "onchainos", ageMs: 500, stale: false };
const concentration = { top10HoldPct: 38, devHoldPct: 2, bundleHoldPct: null, sniperHoldPct: 5, suspiciousHoldPct: 3, origin: "onchainos", ageMs: 500, stale: false };
const poolLiquidity = { poolCount: 2, topPoolsLiquidityUsd: 150_000, largestPoolSharePct: 80, partial: true, origin: "onchainos", ageMs: 500, stale: false };
function answer(extra: Record<string, unknown>) {
  return { chainIndex: "501", observedAtMs: 1_800_000_000_000, coverage: "partial", profile: "conservative_no_leverage", netWorthUsd: null, positionsEmpty: false, assets: ["A".repeat(33), "B".repeat(33)].map((contract, i) => ({ contract, symbol: `TOKEN${i}`, balance: "1", candidateId: portfolioCandidateId("501", contract), action: "hold", model: "jev", evidence: { origin: "onchainos", ageMs: 500, gaps: [], flow: null, risk: 3, ...extra } })) };
}
test("copies normalized risk, concentration and partial top-pool evidence without private fields", () => {
  const parsed = parsePortfolioAnswer(answer({ riskDetails: { ...riskDetails, wallet: "private" }, concentration, poolLiquidity }));
  expect(parsed?.assets[0]?.evidence.riskDetails).toEqual(riskDetails);
  expect(parsed?.assets[0]?.evidence.concentration).toEqual(concentration);
  expect(parsed?.assets[0]?.evidence.poolLiquidity).toEqual(poolLiquidity);
  expect(JSON.stringify(parsed)).not.toContain("private");
});
test("invalid scales, counts, risk zero and claimed complete pools fail closed", () => {
  for (const extra of [{ riskDetails: { ...riskDetails, level: 0 } }, { concentration: { ...concentration, top10HoldPct: 101 } }, { poolLiquidity: { ...poolLiquidity, partial: false } }, { riskDetails: { ...riskDetails, devRugCount: -1 } }, { concentration: { ...concentration, ageMs: -1 } }]) expect(parsePortfolioAnswer(answer(extra))).toBeNull();
});
test("older evidence leaves optional observations explicitly unknown", () => {
  const e = parsePortfolioAnswer(answer({}))?.assets[0]?.evidence;
  expect([e?.riskDetails, e?.concentration, e?.poolLiquidity]).toEqual([null, null, null]);
});

test("the client accepts the full closed backend risk vocabulary and still bounds excess tags", () => {
  // Closed wire-contract fixture; importing the backend sanitizer here drags unrelated runtime modules into the web compiler.
  const tags = ["honeypot", "lowLiquidity", "communityRecognized", "devHoldingStatusSell", "devHoldingStatusSellAll", "devHoldingStatusBuy", "initialHighLiquidity", "smartMoneyBuy", "devAddLiquidity", "devBurnToken", "volumeChangeRateHoldersPlunge", "holdersChangeRateHoldersSurge", "dexScreenerTokenCommunityTakeOver", "dexScreenerPaid", "dexBoost", "rwaXstock", "rwaOndo", "rwaOndoStatusPreMarket", "rwaOndoStatusRegular", "rwaOndoStatusPostmarket", "rwaOndoStatusOvernight", "rwaOndoStatusClosed", "rwaOndoStatusPaused"];
  expect(tags).toHaveLength(23);
  const envelope = (carteira: unknown) => ({ ok: true, id: "synthetic-risk-contract", status: "respondido", carteira, custo: { chamadasOnchainos: 12, tokens: null, usd: null }, briefHash: "synthetic", advisory: true, execution: "never" });
  for (const length of [17, 23]) {
    const parsed = parseAnswer(envelope(answer({ riskDetails: { ...riskDetails, tags: tags.slice(0, length) } })));
    expect(parsed?.carteira?.assets[0]?.evidence.riskDetails?.tags).toHaveLength(length);
  }
  expect(parseAnswer(envelope(answer({ riskDetails: { ...riskDetails, tags: [...tags, "extraTag"] } })))).toBeNull();
});
