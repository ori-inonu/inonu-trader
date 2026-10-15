import { describe, expect, test } from "bun:test";
import { endpointFor } from "../onchain-read/catalog";
import { MAX_ONCHAIN_CALLS, cutPlan, planDiscoveryMode, planTokenMode, tierCounts, type PlanItem } from "./onchain-plan";

const WETH = "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2";
const USDC = "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48";
const TOKEN = { chainIndex: "1", token: WETH, symbol: "WETH", symbolQuery: "WETH", quote: { fromToken: USDC, amount: "1000000" } } as const;

describe("planTokenMode (F2-DIG-4, tabela 4.2)", () => {
  const plan = planTokenMode(TOKEN);

  test("13 calls T1 to T13 in the documented order", () => {
    expect(plan.map((i) => i.id)).toEqual(["T1", "T2", "T3", "T4", "T5", "T6", "T7", "T8", "T9", "T10", "T11", "T12", "T13"]);
    expect(plan.map((i) => i.route)).toEqual([
      "/onchain/search", "/onchain/price-info", "/onchain/candles", "/onchain/trades", "/onchain/trades", "/onchain/signals", "/onchain/top-traders",
      "/onchain/token-risk", "/onchain/pools", "/onchain/clusters", "/onchain/cluster-top-holders", "/onchain/sentiment", "/onchain/quote",
    ]);
  });

  test("5 Basic, 6 Premium and 2 of unknown tier, as the SPEC table says", () => {
    expect(tierCounts(plan)).toEqual({ free: 0, basic: 5, premium: 6, unknown: 2 });
  });

  test("it is under the cap of 15 and every route exists in the gateway today", () => {
    expect(plan.length).toBeLessThanOrEqual(MAX_ONCHAIN_CALLS);
    expect(plan.every((i) => i.available)).toBe(true);
  });

  test("every planned call passes the validator of its route, so none is refused at the gateway", () => {
    for (const item of plan) {
      const v = endpointFor(item.route)!.validate(item.params);
      expect(v.ok, `${item.id} ${item.route} ${JSON.stringify(item.params)}`).toBe(true);
    }
  });

  test("the smart money flow and the top traders ask for wallet type 3", () => {
    expect(plan.find((i) => i.id === "T5")!.params.tagFilter).toBe("3");
    expect(plan.find((i) => i.id === "T7")!.params.tagFilter).toBe("3");
    expect(plan.find((i) => i.id === "T4")!.params.tagFilter).toBeUndefined();
  });

  test("without a symbol typed by the person there is no search, and without a symbol at all there is no sentiment", () => {
    const noQuery = planTokenMode({ ...TOKEN, symbolQuery: undefined });
    expect(noQuery.find((i) => i.id === "T1")).toMatchObject({ available: false, reason: "nao_pedido" });
    const noSymbol = planTokenMode({ ...TOKEN, symbolQuery: undefined, symbol: undefined });
    expect(noSymbol.find((i) => i.id === "T12")).toMatchObject({ available: false, reason: "sem_simbolo" });
    expect(noSymbol.filter((i) => i.available)).toHaveLength(11);
  });

  test("without a quote pair there is no quote", () => {
    const noQuote = planTokenMode({ ...TOKEN, quote: undefined });
    expect(noQuote.find((i) => i.id === "T13")).toMatchObject({ available: false, reason: "sem_par_de_cotacao" });
  });
});

describe("planDiscoveryMode (F2-DIG-4, tabela 4.3)", () => {
  const plan = planDiscoveryMode({ chainIndex: "501", leaders: ["Tok1", "Tok2", "Tok3"], trenchesChain: true, trackerEnabled: true });

  test("14 calls D1 to D14 and the SPEC tier counts", () => {
    expect(plan.map((i) => i.id)).toEqual(["D1", "D2", "D3", "D4", "D5", "D6", "D7", "D8", "D9", "D10", "D11", "D12", "D13", "D14"]);
    expect(tierCounts(plan)).toEqual({ free: 0, basic: 4, premium: 9, unknown: 1 });
    expect(plan.length).toBeLessThanOrEqual(MAX_ONCHAIN_CALLS);
  });

  test("the routes the gateway does not have yet are marked, with a reason, and do not count as callable", () => {
    const missing = plan.filter((i) => !i.available).map((i) => `${i.id}:${i.reason}`);
    expect(missing).toEqual(["D3:rota_inexistente", "D4:rota_inexistente", "D5:lote_nao_suportado"]);
  });

  test("the deepening is for the three best only, and every available call passes its validator", () => {
    expect(plan.filter((i) => i.route === "/onchain/token-risk").map((i) => i.params.token)).toEqual(["Tok1", "Tok2", "Tok3"]);
    for (const item of plan.filter((i) => i.available)) expect(endpointFor(item.route)!.validate(item.params).ok, `${item.id}`).toBe(true);
  });

  test("fewer leaders means fewer deepening calls, never invented tokens", () => {
    const two = planDiscoveryMode({ chainIndex: "501", leaders: ["Tok1", "Tok2"], trenchesChain: false, trackerEnabled: false });
    expect(two.filter((i) => i.route === "/onchain/token-risk")).toHaveLength(2);
    expect(two.find((i) => i.id === "D4")).toMatchObject({ available: false, reason: "rede_nao_suportada" });
    expect(two.find((i) => i.id === "D3")).toMatchObject({ available: false, reason: "familia_nao_habilitada" });
  });
});

describe("cutPlan: the cap of 15 is applied to the plan before any call (API-3)", () => {
  const item = (n: number, available = true): PlanItem => ({ id: `X${n}`, route: "/onchain/chains", params: {}, tier: "free", tierKnown: true, available });

  test("a plan within the cap is kept whole", () => {
    const plan = Array.from({ length: 13 }, (_, i) => item(i));
    expect(cutPlan(plan)).toEqual({ kept: plan, cut: [], skipped: [] });
  });

  test("16 callable items keep the first 15 and cut the last one", () => {
    const plan = Array.from({ length: 16 }, (_, i) => item(i));
    const r = cutPlan(plan);
    expect(r.kept).toHaveLength(15);
    expect(r.cut.map((i) => i.id)).toEqual(["X15"]);
  });

  test("items that are not available are skipped, not counted against the cap", () => {
    const plan = [...Array.from({ length: 15 }, (_, i) => item(i)), item(99, false)];
    const r = cutPlan(plan);
    expect(r.kept).toHaveLength(15);
    expect(r.cut).toHaveLength(0);
    expect(r.skipped.map((i) => i.id)).toEqual(["X99"]);
  });

  test("a lower cap is respected", () => {
    expect(cutPlan(Array.from({ length: 6 }, (_, i) => item(i)), 4).kept).toHaveLength(4);
  });
});
