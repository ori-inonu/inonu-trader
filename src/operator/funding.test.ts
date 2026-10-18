import { expect, test } from "bun:test";
import { syntheticInventory } from "../okx-wallet/portfolio";
import { loadOperatorConfig } from "./config";
import { annualizedFundingPercent, buildFundingCandidates, okxPublicFundingSource } from "./funding";
import { gateCandidate } from "./risk-gate";

test("funding carry candidates are research only and explain the exchange requirement", () => {
  const [candidate] = buildFundingCandidates([{ instId: "BTC-USDT-SWAP", fundingRate: 0.0001, nextFundingRate: null, fundingTimeMs: null, observedAtMs: 1 }], 0.0001);
  expect(candidate!.id).toBe("fund_btc_usdt");
  expect(candidate!.researchOnly).toBe(true);
  expect(candidate!.title).toContain("10.95% annualized");
  expect(annualizedFundingPercent(0.0001)).toBeCloseTo(10.95, 6);
  const verdict = gateCandidate(candidate!, syntheticInventory(1_760_000_000_000), loadOperatorConfig({ OPERATOR_PROFILE: "standard" }).policy);
  expect(verdict.eligible).toBe(false);
  expect(verdict.reasons[0]).toBe("research_only");
});

test("public funding source reads the OKX v5 envelope, skips failures and validates instruments", async () => {
  const fetcher = (async (input: string | URL | Request) => {
    const url = String(input);
    if (url.includes("ETH-USDT-SWAP")) return new Response("{}", { status: 500 });
    return new Response(JSON.stringify({ code: "0", data: [{ instId: "BTC-USDT-SWAP", fundingRate: "0.0002", nextFundingRate: "0.0001", fundingTime: "1760000000000" }] }));
  }) as typeof fetch;
  const source = okxPublicFundingSource(fetcher, () => 5);
  const observations = await source.fundingRates(["BTC-USDT-SWAP", "ETH-USDT-SWAP"]);
  expect(observations).toEqual([{ instId: "BTC-USDT-SWAP", fundingRate: 0.0002, nextFundingRate: 0.0001, fundingTimeMs: 1760000000000, observedAtMs: 5 }]);
  await expect(source.fundingRates(["btc"])).rejects.toThrow("Invalid instrument");
});
