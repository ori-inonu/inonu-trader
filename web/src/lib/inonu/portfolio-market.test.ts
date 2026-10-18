import { expect, test } from "bun:test";
import { parsePortfolioAnswer, portfolioCandidateId } from "./portfolio";

const contracts = ["A".repeat(33), "B".repeat(33)];
const market = { priceUsd: 2.5, liquidityUsd: 250_000, changePct: { m5: -1, h1: null, h4: -2, h24: 3 }, volumeUsd: { m5: 500, h1: null, h4: 20_000, h24: 50_000 }, ageMs: 500, stale: false };
function answer() {
  return { chainIndex: "501", observedAtMs: 1_800_000_000_000, coverage: "partial", profile: "conservative_no_leverage", netWorthUsd: null, positionsEmpty: false, assets: contracts.map((contract, i) => ({ contract, symbol: `TOKEN${i}`, balance: "1", candidateId: portfolioCandidateId("501", contract), action: "hold", model: "jev", evidence: { origin: "onchainos", ageMs: 500, gaps: ["optional:trades:nao_consultado:nao_pedido"], flow: null, risk: 3 } })) };
}

test("older answers without market remain readable and make its absence explicitly null", () => {
  expect(parsePortfolioAnswer(answer())?.assets.map(a => a.evidence.market)).toEqual([null, null]);
});

test("market price, signed changes, volume, own age and stale flag survive parsing without wallet values", () => {
  const raw = answer();
  const withMarket = { ...raw, assets: raw.assets.map(a => ({ ...a, evidence: { ...a.evidence, market: { ...market, walletAddress: "private", valueUsd: 99 } } })) };
  const parsed = parsePortfolioAnswer(withMarket);
  expect(parsed?.assets.map(a => a.evidence.market)).toEqual([market, market]);
  expect(JSON.stringify(parsed)).not.toContain("private");
  expect(JSON.stringify(parsed)).not.toContain("valueUsd");
});

test("malformed market cannot be presented as validated evidence", () => {
  for (const invalid of [{ ...market, priceUsd: -1 }, { ...market, ageMs: -1 }, { ...market, stale: "false" }, { ...market, volumeUsd: { ...market.volumeUsd, m5: -1 } }, { ...market, changePct: { ...market.changePct, m5: NaN } }, { ...market, volumeUsd: { ...market.volumeUsd, h4: -1 } }, { ...market, changePct: { ...market.changePct, h4: NaN } }]) {
    const raw = answer();
    expect(parsePortfolioAnswer({ ...raw, assets: raw.assets.map(a => ({ ...a, evidence: { ...a.evidence, market: invalid } })) })).toBeNull();
  }
});

test("earlier market responses missing four-hour windows remain readable as unknown", () => {
  const raw = answer();
  const legacyMarket = { ...market, changePct: { m5: -1, h1: null, h24: 3 }, volumeUsd: { m5: 500, h1: null, h24: 50_000 } };
  const parsed = parsePortfolioAnswer({ ...raw, assets: raw.assets.map(a => ({ ...a, evidence: { ...a.evidence, market: legacyMarket } })) });
  expect(parsed?.assets.map(a => a.evidence.market)).toEqual(contracts.map(() => ({ ...market, changePct: { ...market.changePct, h4: null }, volumeUsd: { ...market.volumeUsd, h4: null } })));
});
