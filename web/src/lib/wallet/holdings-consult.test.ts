// WAL-4, ASK: the decision about the wallet, on any network the reading holds something on. origin: synthetic_fixture, tests only.
import { describe, expect, test } from "bun:test";
import { CONSULT_COST_TEXT, consultNetworks, observedAt, PLAN_WORD, prepareConsult } from "./holdings-consult";
import type { BalanceRow } from "./holdings";

const USDC = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
const MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const row = (over: Partial<BalanceRow> = {}): BalanceRow => ({ chainIndex: "8453", symbol: "ETH", tokenAddress: null, balance: 0.5, priceUsd: 3000, valueUsd: 1500, flaggedRisk: false, ...over });
const rows: BalanceRow[] = [
  row(), row({ symbol: "USDC", tokenAddress: USDC, balance: 40, priceUsd: 1, valueUsd: 40 }),
  row({ chainIndex: "1", symbol: "ETH", balance: 2, valueUsd: 6000 }), row({ chainIndex: "1", symbol: "USDC", tokenAddress: USDC, balance: 90, valueUsd: 90 }),
  row({ chainIndex: "501", symbol: "SOL", balance: 3, valueUsd: 400 }), row({ chainIndex: "501", symbol: "USDC", tokenAddress: MINT, balance: 10, valueUsd: 10 }),
  row({ chainIndex: "56", symbol: "BNB", balance: 1, priceUsd: null, valueUsd: null }),
];

describe("consultNetworks", () => {
  test("every network the reading holds something on, the one with the most value first, with its count", () => {
    expect(consultNetworks(rows)).toEqual([
      { chainIndex: "1", count: 2, valueUsd: 6090 },
      { chainIndex: "8453", count: 2, valueUsd: 1540 },
      { chainIndex: "501", count: 2, valueUsd: 410 },
      { chainIndex: "56", count: 1, valueUsd: null },
    ]);
  });

  test("an empty reading has no network, and a network with nothing priced is last, not worth zero", () => {
    expect(consultNetworks([])).toEqual([]);
    expect(consultNetworks([row({ chainIndex: "56", valueUsd: null }), row({ chainIndex: "1", valueUsd: 5 })]).map((n) => n.chainIndex)).toEqual(["1", "56"]);
  });
});

describe("observedAt", () => {
  test("the moment of the answer minus the age it reports, and never a moment in the future or before zero", () => {
    expect(observedAt(100_000, 4_000)).toBe(96_000);
    expect(observedAt(100_000, -5)).toBe(100_000);
    expect(observedAt(100_000, 999_999)).toBe(0);
    expect(observedAt(100_000, 0)).toBe(100_000);
  });
});

describe("prepareConsult", () => {
  const OBSERVED = 100_000;
  const NOW = 110_000;

  test("an EVM network asks with hex contracts in lower case and the network's own number", () => {
    const p = prepareConsult(rows, "8453", OBSERVED, NOW);
    expect(p.ok).toBe(true);
    if (p.ok) {
      expect(p.request.carteira.chainIndex).toBe("8453");
      expect(p.request.carteira.assets).toEqual([{ contract: "native", symbol: "ETH", balance: "0.5" }, { contract: USDC.toLowerCase(), symbol: "USDC", balance: "40" }]);
      expect(p.assets).toBe(2);
    }
  });

  test("Solana asks with its mints as they are", () => {
    const p = prepareConsult(rows, "501", OBSERVED, NOW);
    expect(p.ok && p.request.carteira.assets.map((a) => a.contract)).toEqual(["native", MINT]);
  });

  test("only the holdings of the network asked go, never those of another", () => {
    const p = prepareConsult(rows, "1", OBSERVED, NOW);
    expect(p.ok && p.request.carteira.assets.map((a) => a.balance)).toEqual(["2", "90"]);
  });

  test("a network with one holding, or no holding, cannot be asked, and says why; a stale reading says to read again", () => {
    const one = prepareConsult(rows, "56", OBSERVED, NOW);
    expect(one.ok).toBe(false);
    if (!one.ok) expect(one.reason).toContain("2 a 6 ativos verificaveis");
    expect(prepareConsult(rows, "10", OBSERVED, NOW).ok).toBe(false);
    const stale = prepareConsult(rows, "8453", OBSERVED, OBSERVED + 90_000);
    expect(stale.ok).toBe(false);
    if (!stale.ok) expect(stale.reason).toContain("nova leitura");
  });

  test("no address, no price and no value ever goes in the request", () => {
    for (const chain of ["8453", "1", "501"]) {
      const p = prepareConsult(rows, chain, OBSERVED, NOW);
      expect(p.ok).toBe(true);
      if (p.ok) expect(JSON.stringify(p.request)).not.toMatch(/address|account|valueUsd|priceUsd|price/i);
    }
  });
});

describe("the words", () => {
  test("the plan says what the Inonu decided in words anyone reads, with no accent", () => {
    expect(PLAN_WORD).toEqual({ buy: "Comprar mais", hold: "Esperar", sell: "Vender", abstain: "Sem dados para decidir" });
    for (const w of [...Object.values(PLAN_WORD), CONSULT_COST_TEXT]) expect(w).not.toMatch(/[^\x20-\x7e]/);
  });
});
