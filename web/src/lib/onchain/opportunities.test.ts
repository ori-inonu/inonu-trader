// The opportunity board of the ecosystem: tokens of several networks with more than one independent reading, and the facts that give pause. Pure, no network, no clock.
// origin: synthetic_fixture, tests only.
import { describe, expect, test } from "bun:test";
import type { HotToken, Signal } from "./client";
import { EVIDENCE_LIMITS, OPPORTUNITY_CARE, opportunityBoard, type ChainScan } from "./opportunities";

const FORBIDDEN = new RegExp(`[${String.fromCharCode(0xb7, 0x2014, 0x2013)}]`);

const hot = (over: Partial<HotToken> = {}): HotToken => ({
  chainIndex: "501", symbol: "AAA", address: "AAA111", price: 0.5, marketCap: 5_000_000, volumeUsd: 2_000_000, changePct: 1, liquidityUsd: 400_000, holders: 5000,
  uniqueTraders: 900, txsBuy: 50, txsSell: 50, inflowUsd: null, riskLevel: 1, top10HoldPct: 20, devHoldPct: 2, bundleHoldPct: 1, firstTradeMs: null, ...over,
});

const signal = (over: Partial<Signal> & { address?: string } = {}): Signal => {
  const { address = "AAA111", ...rest } = over;
  return {
    tsMs: 1, chainIndex: "501", walletType: "smart_money", walletCount: 3, amountUsd: 40_000, priceUsd: 0.5, soldRatioPct: 10,
    token: { address, symbol: "AAA", marketCap: null, holders: null, top10HoldPct: null }, ...rest,
  };
};

const scan = (over: Partial<ChainScan> = {}): ChainScan => ({
  chainIndex: "501", chainName: "Solana", hot: [hot()], signals: [], hotError: null, signalsError: null, atMs: 1, ...over,
});

describe("what counts as a reading", () => {
  test("a token with no reading in its favour is not on the board", () => {
    const board = opportunityBoard([scan()]);
    expect(board.rows).toHaveLength(0);
    expect(board.total).toBe(0);
    expect(board.chains).toEqual([{ chainIndex: "501", chainName: "Solana", state: "ok", tokens: 1, note: null }]);
  });

  test("the tracked wallets count when enough of them bought and they did not already leave", () => {
    const row = opportunityBoard([scan({ signals: [signal()] })]).rows[0]!;
    expect(row.evidence.map((e) => e.id)).toEqual(["smart"]);
    expect(row.evidence[0]!.text).toContain("3 carteiras rastreadas (smart money) compraram");
    expect(row.evidence[0]!.text).toContain("10% ja vendido");
    // one wallet is not enough, and wallets that mostly sold are not a reading in its favour
    expect(opportunityBoard([scan({ signals: [signal({ walletCount: 1 })] })]).rows).toHaveLength(0);
    expect(opportunityBoard([scan({ signals: [signal({ soldRatioPct: EVIDENCE_LIMITS.smartMaxSoldPct + 1 })] })]).rows).toHaveLength(0);
  });

  test("the flow counts only with enough transactions and a clear lead of the buys", () => {
    const strong = opportunityBoard([scan({ hot: [hot({ txsBuy: 140, txsSell: 60 })] })]).rows[0]!;
    expect(strong.evidence.map((e) => e.id)).toEqual(["fluxo"]);
    expect(strong.evidence[0]!.text).toBe("compras sao 70% dos 200 negocios");
    expect(opportunityBoard([scan({ hot: [hot({ txsBuy: 14, txsSell: 6 })] })]).rows).toHaveLength(0);
    expect(opportunityBoard([scan({ hot: [hot({ txsBuy: 105, txsSell: 100 })] })]).rows).toHaveLength(0);
  });

  test("the move counts only with real volume, so a big percentage of nothing is not a reading", () => {
    expect(opportunityBoard([scan({ hot: [hot({ changePct: 40, volumeUsd: 20_000 })] })]).rows).toHaveLength(0);
    const row = opportunityBoard([scan({ hot: [hot({ changePct: 12.5, volumeUsd: 3_000_000 })] })]).rows[0]!;
    expect(row.evidence.map((e) => e.id)).toEqual(["tracao"]);
    expect(row.evidence[0]!.text).toContain("em 24 h");
  });

  test("a value the provider left out is not a reading and is never a zero", () => {
    const board = opportunityBoard([scan({ hot: [hot({ txsBuy: null, txsSell: null, changePct: Number.NaN })] })]);
    expect(board.rows).toHaveLength(0);
  });
});

describe("the order of the board", () => {
  const three = hot({ symbol: "TRI", address: "TRI1", txsBuy: 300, txsSell: 100, changePct: 9, volumeUsd: 1_000_000 });
  const two = hot({ symbol: "TWO", address: "TWO1", txsBuy: 300, txsSell: 100, changePct: 9, volumeUsd: 9_000_000 });
  const one = hot({ symbol: "ONE", address: "ONE1", changePct: 9, volumeUsd: 50_000_000 });
  const signals = [signal({ address: "TRI1", amountUsd: 5_000 })];

  test("most readings first, then what the tracked wallets put in, then the volume", () => {
    const board = opportunityBoard([scan({ hot: [one, two, three], signals })]);
    expect(board.rows.map((r) => r.symbol)).toEqual(["TRI", "TWO", "ONE"]);
    expect(board.rows.map((r) => r.evidence.length)).toEqual([3, 2, 1]);
  });

  test("the cut is at the budget of a tab and says how many qualified", () => {
    const many = Array.from({ length: 20 }, (_, i) => hot({ symbol: `T${i}`, address: `T${i}x`, changePct: 9, volumeUsd: 1_000_000 + i }));
    const board = opportunityBoard([scan({ hot: many })], 12);
    expect(board.rows).toHaveLength(12);
    expect(board.total).toBe(20);
    expect(board.rows[0]!.symbol).toBe("T19");
  });

  test("the networks are crossed: the same list orders tokens of different chains together", () => {
    const board = opportunityBoard([
      scan({ chainIndex: "501", chainName: "Solana", hot: [hot({ symbol: "SOLX", address: "S1", changePct: 9 })] }),
      scan({ chainIndex: "8453", chainName: "Base", hot: [hot({ chainIndex: "8453", symbol: "BASEX", address: "0xAbC", changePct: 9, volumeUsd: 9_000_000 })] }),
    ]);
    expect(board.rows.map((r) => `${r.chainName}:${r.symbol}`)).toEqual(["Base:BASEX", "Solana:SOLX"]);
  });
});

describe("the marks of care", () => {
  const risky = hot({ liquidityUsd: 12_000, holders: 120, top10HoldPct: 62, devHoldPct: 14, bundleHoldPct: 25, riskLevel: 5, changePct: 9 });

  test("each is a measurement with its number, in the order a person weighs them", () => {
    const row = opportunityBoard([scan({ hot: [risky] })]).rows[0]!;
    expect(row.marks).toEqual([
      "liquidez de so US$ 12,0 mil",
      "so 120 detentores",
      "as 10 maiores carteiras tem 62%",
      "o criador tem 14%",
      "bundlers com 25%",
      "nivel de risco 5 de 5 na OKX",
    ]);
  });

  test("a healthy token carries none, and a limit is the edge: at it counts, under it does not", () => {
    const healthy = opportunityBoard([scan({ hot: [hot({ changePct: 9 })] })]).rows[0]!;
    expect(healthy.marks).toEqual([]);
    const edge = opportunityBoard([scan({ hot: [hot({ changePct: 9, top10HoldPct: OPPORTUNITY_CARE.top10Pct })] })]).rows[0]!;
    expect(edge.marks).toEqual(["as 10 maiores carteiras tem 50%"]);
    const under = opportunityBoard([scan({ hot: [hot({ changePct: 9, top10HoldPct: OPPORTUNITY_CARE.top10Pct - 1 })] })]).rows[0]!;
    expect(under.marks).toEqual([]);
  });
});

describe("what each network gave", () => {
  test("a network whose list failed is told apart from one with nothing in it", () => {
    const board = opportunityBoard([scan(), scan({ chainIndex: "56", chainName: "BNB Chain", hot: null, signals: null, hotError: "A OKX respondeu com erro" })]);
    expect(board.chains.map((c) => c.state)).toEqual(["ok", "falhou"]);
    expect(board.chains[1]!.note).toBe("A OKX respondeu com erro");
    expect(board.chains[1]!.tokens).toBe(0);
  });

  test("without the purchases of tracked wallets the board still works on the other two readings and says so", () => {
    const board = opportunityBoard([scan({ hot: [hot({ changePct: 9 })], signals: null, signalsError: "Limite de leituras da OKX" })]);
    expect(board.rows).toHaveLength(1);
    expect(board.chains[0]!.state).toBe("parcial");
    expect(board.chains[0]!.note).toBe("Limite de leituras da OKX: so fluxo e tracao puderam ser lidos");
  });
});

describe("the words on the board", () => {
  test("no middle dot, no dash and no broken number, and no word of an order", () => {
    const board = opportunityBoard([
      scan({ hot: [hot({ liquidityUsd: 9_000, txsBuy: 300, txsSell: 100, changePct: 9 })], signals: [signal()] }),
    ]);
    const text = JSON.stringify(board);
    expect(text).not.toMatch(FORBIDDEN);
    for (const word of ["NaN", "undefined", "Infinity"]) expect(text).not.toContain(word);
    expect(text.toLowerCase()).not.toMatch(/\b(comprar|compre|vender|venda|sinal|sinais|recomend|aconselh|deve)\b/);
  });
});
