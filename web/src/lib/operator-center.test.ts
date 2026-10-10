import { describe, expect, it } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { DecisionCenterView } from "../components/DecisionCenter/DecisionCenter";
import type { OperatorCycleView } from "./operator-feed";
import { parseInsights, rankCandidates, riskLabel, type OperatorInsightsView } from "./operator-center";

const candidate = (id: string, kind: string, netUsd: number | null, extra: Partial<OperatorCycleView["candidates"][number]> = {}): OperatorCycleView["candidates"][number] => ({
  id, kind, title: `t ${id}`, chainIndex: "196", from: { symbol: "USDT" }, to: { symbol: "OKB" }, sizeUsd: 10, netUsd, priceImpactPercent: -0.05, quoteAgeMs: 800, notes: [], ...extra,
});

const cycle: OperatorCycleView = {
  cycleId: "abcdef1234", startedAtMs: 1_760_000_000_000, completedAtMs: 1_760_000_000_500,
  inventory: { address: "0x0000...0001", observedAtMs: 1_760_000_000_000, source: "synthetic", knownValueUsd: 155, valueComplete: false, chains: [
    { chainIndex: "196", chainName: "X Layer", nativeSymbol: "OKB", nativeBalance: 0.2, knownValueUsd: 85, valueComplete: true, assets: [{ symbol: "USDT", balanceText: "75", valueUsd: 75, native: false }] },
  ] },
  candidates: [candidate("a", "dex_round_trip", 0.13), candidate("b", "cross_chain_rebalance", -0.9), candidate("k", "kuru_spot_maker", null, { sizeUsd: 40, priceImpactPercent: null, quoteAgeMs: null })],
  verdicts: [{ candidateId: "a", eligible: true, reasons: [] }, { candidateId: "b", eligible: false, reasons: ["net_below_minimum"] }, { candidateId: "k", eligible: true, reasons: [] }],
  eligibleIds: ["a", "k"],
  decision: { choice: "a", probabilities: { hold: 0.15, a: 0.7, k: 0.15 }, confidence: null, latencyMs: 3, model: "mock" },
  plan: { planId: "plan_1", candidateId: "a", executionQualification: "qualified_dry_run", expiresAtMs: 1_760_000_030_000, steps: [{ kind: "swap", description: "x" }] },
  execution: { status: "dry_run", reasons: ["dry_run_default"], txHash: null },
  inferenceUsd: 0, warnings: ["inventory_value_incomplete"],
  ledger: { dayNotionalUsd: 0, dayPlans: 0, dayRealizedUsd: 0, openLegs: [], killSwitch: false },
};

describe("decision center", () => {
  it("ranks eligible candidates first by Jev weight and labels risk from the candidate numbers", () => {
    const ranked = rankCandidates(cycle);
    expect(ranked.map((entry) => entry.id)).toEqual(["a", "k", "b"]);
    expect(ranked[0]!.netBps).toBeCloseTo(130, 6);
    expect(ranked[0]!.weight).toBe(0.7);
    expect(ranked[2]!.reasons).toEqual(["net_below_minimum"]);
    expect(riskLabel(ranked[0]!)).toBe("baixo");
    expect(riskLabel({ priceImpactPercent: -0.3, quoteAgeMs: 100, netUsd: 0.5, sizeUsd: 10 })).toBe("medio");
    expect(riskLabel({ priceImpactPercent: -0.1, quoteAgeMs: 20_000, netUsd: 0.5, sizeUsd: 10 })).toBe("alto");
    expect(riskLabel({ priceImpactPercent: null, quoteAgeMs: 1, netUsd: 1, sizeUsd: 10 })).toBe("desconhecido");
  });

  it("parses only well-formed insights", () => {
    expect(parseInsights({})).toBeNull();
    const insights: OperatorInsightsView = { cycles: 1, firstCycleAtMs: 1, lastCycleAtMs: 1, decisions: { asked: 1, hold: 0, chosen: 1 }, executions: { dry_run: 1 }, realized: { plans: 0, totalUsd: 0, wins: 0, losses: 0, hitRate: null, unknown: 0 }, inferenceUsd: 0, byKind: [], series: [] };
    expect(parseInsights(insights)).toEqual(insights);
  });

  it("renders the center with KPIs, probability bars, the candidate table and honest wording", () => {
    const html = renderToStaticMarkup(createElement(DecisionCenterView, { state: { status: "ready", cycle, history: [cycle], insights: null, error: null, ageMs: 4_000, lastFetchAtMs: 1, reload() {} } }));
    expect(html).toContain("CENTRAL DE DECISÕES");
    expect(html).toContain("155.00 USD");
    expect(html).toContain("parcial: ativos sem preço");
    expect(html).toContain("Ida e volta DEX");
    expect(html).toContain("130.0 bps");
    expect(html).toContain("líquido abaixo do mínimo");
    expect(html).toContain("simulada (dry run)");
    expect(html).toContain("Probabilidades são pesos de decisão, não taxas de acerto");
    expect(html).not.toContain("·");
    expect(html).not.toContain("—");
    const absent = renderToStaticMarkup(createElement(DecisionCenterView, { state: { status: "absent", cycle: null, history: [], insights: null, error: null, ageMs: null, lastFetchAtMs: 1, reload() {} } }));
    expect(absent).toContain("bun run okx:operator");
  });
});
