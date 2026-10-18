// PF-2, PF-3: the numbers and the plain facts about what the wallet holds. The code DESCRIBES (how much, where, how concentrated) and never says what to do; the only words of an
// order on this screen are the Inonu's own answer. origin: synthetic_fixture, tests only.
import { describe, expect, test } from "bun:test";
import type { BalanceRow } from "./holdings";
import { allocationSegments, buildPortfolio, isStable } from "./portfolio-model";

const row = (chainIndex: string, symbol: string, valueUsd: number | null, over: Partial<BalanceRow> = {}): BalanceRow => ({
  chainIndex, symbol, tokenAddress: symbol === "ETH" || symbol === "BNB" ? null : `0x${symbol.toLowerCase().padEnd(40, "0").slice(0, 40)}`, balance: valueUsd === null ? 5 : valueUsd / 100,
  priceUsd: valueUsd === null ? null : 100, valueUsd, flaggedRisk: false, ...over,
});

const rows: BalanceRow[] = [
  row("1", "ETH", 6000), row("42161", "ETH", 1500), row("8453", "ETH", 500),
  row("1", "USDC", 1500), row("56", "USDT", 500),
  row("501", "SOL", 400),
  row("1", "PEPE", 0.4), row("8453", "DUST", 0.3),
  row("1", "AIRDROP", 9_000_000, { flaggedRisk: true }),
  row("1", "NOPRICE", null),
];

describe("the totals", () => {
  const p = buildPortfolio(rows, []);

  test("the total counts what has a price and is not marked as risk, across every network; it is not the provider's number", () => {
    expect(p.totalUsd).toBeCloseTo(10_400.7, 6);
    expect(p.groups[0]).toMatchObject({ symbol: "ETH", valueUsd: 8000 });
    expect(p.groups[0]!.chains).toEqual(["1", "42161", "8453"]);
  });

  test("the same asset on several networks is one position, the largest network first, with the quantities added", () => {
    const eth = p.groups.find((g) => g.symbol === "ETH")!;
    expect(eth.balance).toBeCloseTo(80, 6);
    expect(eth.sharePct).toBeCloseTo((8000 / 10_400.7) * 100, 6);
  });

  test("what the provider marks as risk and what has no price are kept apart, named, and out of the total and the shares", () => {
    expect(p.flagged.map((g) => g.symbol)).toEqual(["AIRDROP"]);
    expect(p.unpriced.map((g) => g.symbol)).toEqual(["NOPRICE"]);
    expect(p.groups.map((g) => g.symbol)).not.toContain("AIRDROP");
    expect(p.groups.map((g) => g.symbol)).not.toContain("NOPRICE");
    expect(p.groups.reduce((sum, g) => sum + (g.sharePct ?? 0), 0)).toBeCloseTo(100, 6);
  });

  test("by network: the value and the share of each, with its count, the largest first", () => {
    expect(p.byNetwork.map((n) => n.chainIndex)).toEqual(["1", "42161", "8453", "56", "501"]);
    expect(p.byNetwork[0]).toMatchObject({ chainIndex: "1", count: 3 });
    expect(p.byNetwork.reduce((sum, n) => sum + n.sharePct, 0)).toBeCloseTo(100, 6);
  });

  test("an empty reading has no total, no share and no fact about concentration", () => {
    const empty = buildPortfolio([], []);
    expect(empty.totalUsd).toBeNull();
    expect(empty.groups).toEqual([]);
    expect(empty.facts).toEqual([]);
    expect(allocationSegments(empty)).toEqual([]);
  });

  test("a reading with only unpriced holdings has no total either, and says so instead of zero", () => {
    const only = buildPortfolio([row("1", "NOPRICE", null)], []);
    expect(only.totalUsd).toBeNull();
    expect(only.facts.join(" ")).toContain("1 token sem preco ficou fora do total");
  });
});

describe("the stable coins", () => {
  test("recognised by symbol, in the spellings the networks use", () => {
    for (const s of ["USDT", "usdc", "USDC.e", "USDbC", "DAI", "FDUSD", "USDe", "PYUSD", "USDT0", "crvUSD"]) expect(isStable(s)).toBe(true);
    for (const s of ["ETH", "BTC", "SOL", "USDX2", "WUSDC"]) expect(isStable(s)).toBe(false);
  });

  test("their share of the total", () => {
    expect(buildPortfolio(rows, []).stableSharePct).toBeCloseTo((2000 / 10_400.7) * 100, 6);
    expect(buildPortfolio([row("1", "ETH", 100)], []).stableSharePct).toBe(0);
  });
});

describe("the facts", () => {
  const facts = buildPortfolio(rows, ["10", "250"]).facts;
  const text = facts.join("\n");

  test("the largest position, the stable share, the spread over networks, the small positions, what is out of the total, and the networks that did not answer", () => {
    expect(text).toContain("A maior parte e ETH, com 77% do valor.");
    expect(text).toContain("19% do valor esta em moedas estaveis (USDC, USDT).");
    expect(text).toContain("O valor esta em 5 redes.");
    expect(text).toContain("2 posicoes pequenas (menos de US$ 1) somam US$ 0,70.");
    expect(text).toContain("1 token sem preco ficou fora do total.");
    expect(text).toContain("1 token marcado como risco pelo provedor ficou fora do total.");
    expect(text).toContain("2 redes nao responderam.");
  });

  test("no stable coin is a fact too, and one network is said as one", () => {
    expect(buildPortfolio([row("1", "ETH", 100)], []).facts.join(" ")).toContain("Nenhuma parte do valor esta em moedas estaveis.");
    expect(buildPortfolio([row("1", "ETH", 100)], []).facts.join(" ")).toContain("Todo o valor esta em uma rede.");
  });

  test("it describes and never says what to do: no verb of an order in any fact", () => {
    for (const fact of facts) {
      expect(fact.toLowerCase()).not.toMatch(/\b(comprar|compre|vender|venda|reduzir|reduza|diversificar|diversifique|trocar|troque|manter|mantenha|aumentar|aumente|deve|devia|recomend|sugir|sinal)\b/);
      expect(fact).not.toMatch(/[^\x20-\x7e]/);
    }
  });
});

describe("the bar of the allocation", () => {
  test("the largest positions with their share, the rest together, and the shares add to one hundred", () => {
    const many = Array.from({ length: 9 }, (_, i) => row("1", `T${i}`, 1000 - i * 100));
    const seg = allocationSegments(buildPortfolio(many, []), 5);
    expect(seg.length).toBe(6);
    expect(seg.at(-1)!.label).toBe("Outros");
    expect(seg.reduce((sum, s) => sum + s.sharePct, 0)).toBeCloseTo(100, 6);
    expect(seg[0]!.label).toBe("T0");
  });

  test("with few positions there is no 'Outros'", () => {
    const seg = allocationSegments(buildPortfolio(rows, []), 5);
    expect(seg.map((s) => s.label)).toEqual(["ETH", "USDC", "USDT", "SOL", "PEPE", "Outros"]);
    expect(allocationSegments(buildPortfolio([row("1", "ETH", 5), row("1", "BTC", 3)], []), 5).map((s) => s.label)).toEqual(["ETH", "BTC"]);
  });
});
