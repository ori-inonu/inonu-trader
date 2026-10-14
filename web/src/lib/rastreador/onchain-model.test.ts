// RAS-2, RAS-3, RAS-4, AC-RAS-1: the on-chain universe of the Rastreador. The tokens of one network from the hot list of the OnchainOS gateway, with
// the smart money signals of the same network added only when they were read. A value the provider did not give is `null` with the reason on the
// cell, never a made up number. The pressure of the flow is the measured ratio of buys to sells, with a descriptive word and never an instruction.
// origin: synthetic_fixture, tests only.
import { describe, expect, test } from "bun:test";
import type { HotToken, Signal } from "../onchain/client";
import {
  DEFAULT_ONCHAIN_FILTERS, ONCHAIN_VIEW_ORDER, ONCHAIN_VIEWS, applyOnchainFilters, buildOnchainRows, onchainCells, sortOnchain,
} from "./onchain-model";

const hot = (symbol: string, over: Partial<HotToken> = {}): HotToken => ({
  chainIndex: "501", symbol, address: `${symbol}1111111111111111111111111111111111111111`.slice(0, 44), price: 1.5, marketCap: 2_000_000, volumeUsd: 400_000, changePct: 12,
  liquidityUsd: 900_000, holders: 900, uniqueTraders: 300, txsBuy: 600, txsSell: 400, inflowUsd: 30_000, riskLevel: 2, top10HoldPct: 30, devHoldPct: 1, bundleHoldPct: 2, firstTradeMs: null, ...over,
});
const signal = (token: HotToken, over: Partial<Signal> = {}): Signal => ({
  tsMs: 1, chainIndex: "501", walletType: "smart_money", walletCount: 3, amountUsd: 10_000, priceUsd: 1, soldRatioPct: 20,
  token: { address: token.address, symbol: token.symbol, marketCap: null, holders: null, top10HoldPct: null }, ...over,
});

const AAA = hot("AAA", { volumeUsd: 900_000 });
const BBB = hot("BBB", { volumeUsd: 400_000, changePct: -8, txsBuy: 100, txsSell: 300, riskLevel: 4 });
const CCC = hot("CCC", { volumeUsd: 50_000, liquidityUsd: 10_000, holders: 30, txsBuy: null, txsSell: null, riskLevel: null, top10HoldPct: null });

describe("the rows", () => {
  test("one row per token, identified by network and address, ranked by the volume of the day, ties by address", () => {
    const rows = buildOnchainRows([BBB, AAA, CCC], null);
    expect(rows.map((r) => r.symbol)).toEqual(["AAA", "BBB", "CCC"]);
    expect(rows.map((r) => r.rank)).toEqual([1, 2, 3]);
    expect(rows[0]!.id).toBe(`501:${AAA.address}`);
    const tie = buildOnchainRows([hot("ZZZ", { volumeUsd: 5 }), hot("YYY", { volumeUsd: 5 })], null);
    expect(tie.map((r) => r.symbol)).toEqual(["YYY", "ZZZ"]);
  });

  test("what the provider gave is kept, and the pressure is (buys - sells) / (buys + sells) of the transactions", () => {
    const [a, b] = buildOnchainRows([AAA, BBB], null);
    expect(a).toMatchObject({ preco: 1.5, var24hPct: 12, volUsd24h: 900_000, marketCap: 2_000_000, liquidityUsd: 900_000, holders: 900, riskLevel: 2, top10HoldPct: 30 });
    expect(a!.pressao).toBeCloseTo(0.2, 6);
    expect(b!.pressao).toBeCloseTo(-0.5, 6);
    expect(a!.txs).toBe(1000);
  });

  test("a value the provider did not give is null with no invented number: no counts, no pressure; a zero total is no pressure either", () => {
    const [c] = buildOnchainRows([CCC], null);
    expect(c).toMatchObject({ pressao: null, txs: null, riskLevel: null, top10HoldPct: null });
    expect(buildOnchainRows([hot("ZERO", { txsBuy: 0, txsSell: 0 })], null)[0]!.pressao).toBeNull();
    expect(buildOnchainRows([hot("NP", { price: 0 })], null)[0]!.preco).toBeNull();
  });

  test("a token with no usable address or symbol is left out, and a repeated one counts once", () => {
    const rows = buildOnchainRows([AAA, AAA, hot("", {}), hot("NOADDR", { address: "" })], null);
    expect(rows.map((r) => r.symbol)).toEqual(["AAA"]);
  });
});

describe("the smart money signals", () => {
  test("not read: the columns are null, which is not the same as zero wallets", () => {
    const [a] = buildOnchainRows([AAA], null);
    expect(a).toMatchObject({ carteiras: null, carteirasUsd: null, vendidaPct: null, tipos: [] });
  });

  test("read: wallets are the sum of the counts (an upper bound), the USD is the sum, the sold share is weighted by the amount, the types are listed once", () => {
    const rows = buildOnchainRows([AAA, BBB], [
      signal(AAA, { walletCount: 5, amountUsd: 20_000, soldRatioPct: 10 }),
      signal(AAA, { walletCount: 3, amountUsd: 8_000, soldRatioPct: 20, walletType: "whale" }),
      signal(AAA, { walletCount: 1, amountUsd: 2_000, soldRatioPct: 40, walletType: "smart_money" }),
    ]);
    const [a, b] = rows;
    expect(a).toMatchObject({ carteiras: 9, carteirasUsd: 30_000 });
    expect(a!.vendidaPct).toBeCloseTo((20_000 * 10 + 8_000 * 20 + 2_000 * 40) / 30_000, 6);
    expect(a!.tipos).toEqual(["smart_money", "whale"]);
    // a token with no signal when the signals WERE read has zero wallets: that is a reading, not a gap
    expect(b).toMatchObject({ carteiras: 0, carteirasUsd: 0, vendidaPct: null, tipos: [] });
  });

  test("a signal without a valid amount or sold share adds its wallets but not its USD or share, and a signal of another token is ignored", () => {
    const [a] = buildOnchainRows([AAA], [
      signal(AAA, { walletCount: 2, amountUsd: 0, soldRatioPct: 10 }),
      signal(AAA, { walletCount: 4, amountUsd: 5_000, soldRatioPct: null }),
      signal(AAA, { walletCount: 1, amountUsd: 1_000, soldRatioPct: 150 }),
      signal(BBB, { walletCount: 50, amountUsd: 99_000, soldRatioPct: 0 }),
    ]);
    expect(a!.carteiras).toBe(7);
    expect(a!.carteirasUsd).toBeNull();
    expect(a!.vendidaPct).toBeNull();
  });
});

describe("the same token in another case", () => {
  const EVM = "0xAbCdEf0123456789aBcDeF0123456789AbCdEf01";

  test("an EVM address has no case: a signal for it in lower case still belongs to the token, and the token is not listed twice in two cases", () => {
    const token = hot("EVMTOK", { chainIndex: "8453", address: EVM });
    const rows = buildOnchainRows([token, hot("EVMTOK", { chainIndex: "8453", address: EVM.toLowerCase() })], [signal({ ...token, address: EVM.toLowerCase() }, { walletCount: 4, amountUsd: 5_000, soldRatioPct: 10 })]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ carteiras: 4, carteirasUsd: 5_000, tipos: ["smart_money"] });
    expect(rows[0]!.id).toBe(`8453:${EVM.toLowerCase()}`);
  });

  test("any other address is case sensitive: a mint that differs by case is another token", () => {
    const rows = buildOnchainRows([hot("SOLA", { address: "AbC" + "1".repeat(40) }), hot("SOLB", { address: "abc" + "1".repeat(40) })], null);
    expect(rows).toHaveLength(2);
  });
});

describe("what the provider says that cannot be right", () => {
  test("a risk level outside the whole numbers 0 to 5 is not a level: it is not given, and the cell says so", () => {
    for (const bad of [9, 2.5, -1, Number.NaN]) {
      const row = buildOnchainRows([hot("RISKY", { riskLevel: bad })], null)[0]!;
      expect(row.riskLevel).toBeNull();
      expect(onchainCells(row).risco).toMatchObject({ text: "-", title: "A OKX nao informou o nivel de risco" });
    }
    expect(buildOnchainRows([hot("OK", { riskLevel: 0 })], null)[0]!.riskLevel).toBe(0);
  });

  test("no buys and no sells at all is its own reason, not 'did not inform'", () => {
    const row = buildOnchainRows([hot("QUIET", { txsBuy: 0, txsSell: 0 })], null)[0]!;
    expect(onchainCells(row).pressao).toMatchObject({ text: "-", title: "Sem transacoes na janela da OKX" });
  });

  test("a pressure that rounds to zero has no sign", () => {
    const row = buildOnchainRows([hot("FLAT", { txsBuy: 499, txsSell: 501 })], null)[0]!;
    expect(onchainCells(row).pressao.text.startsWith("-0,00")).toBe(false);
    expect(onchainCells(row).pressao.text.startsWith("0,00")).toBe(true);
  });
});

describe("filters", () => {
  const rows = buildOnchainRows([AAA, BBB, CCC], [signal(AAA, { walletCount: 5 }), signal(BBB, { walletCount: 1 })]);
  const ids = (f: Partial<typeof DEFAULT_ONCHAIN_FILTERS>) => applyOnchainFilters(rows, { ...DEFAULT_ONCHAIN_FILTERS, ...f }).map((r) => r.symbol);

  test("no filter shows everything", () => {
    expect(ids({})).toEqual(["AAA", "BBB", "CCC"]);
  });

  test("the search looks at the symbol and at the address, in any case", () => {
    expect(ids({ busca: "bb" })).toEqual(["BBB"]);
    expect(ids({ busca: AAA.address.slice(0, 6).toLowerCase() })).toEqual(["AAA"]);
  });

  test("each minimum and maximum applies to its own column", () => {
    expect(ids({ volUsdMin: 100_000 })).toEqual(["AAA", "BBB"]);
    expect(ids({ liquidezMin: 500_000 })).toEqual(["AAA", "BBB"]);
    expect(ids({ holdersMin: 500 })).toEqual(["AAA", "BBB"]);
    expect(ids({ carteirasMin: 2 })).toEqual(["AAA"]);
    expect(ids({ varMin: 0 })).toEqual(["AAA", "CCC"]);
    expect(ids({ varMax: 0 })).toEqual(["BBB"]);
    expect(ids({ riscoMax: 3 })).toEqual(["AAA"]);
  });

  test("a row that does not have the data of an active filter is left out: an unknown value cannot satisfy a limit", () => {
    // CCC has no risk level: with a limit on risk it is not shown, and without it it is
    expect(ids({ riscoMax: 5 })).toEqual(["AAA", "BBB"]);
    expect(ids({})).toContain("CCC");
  });

  test("the wallet filter does nothing while the signals were not read, instead of hiding every row", () => {
    const unread = buildOnchainRows([AAA, BBB], null);
    expect(applyOnchainFilters(unread, { ...DEFAULT_ONCHAIN_FILTERS, carteirasMin: 3 }).length).toBe(2);
  });
});

describe("the sort", () => {
  const rows = buildOnchainRows([AAA, BBB, CCC], null);
  const order = (key: Parameters<typeof sortOnchain>[1]["key"], dir: "asc" | "desc") => sortOnchain(rows, { key, dir }).map((r) => r.symbol);

  test("by a number, either way, with the rows that have none always last", () => {
    expect(order("vol", "desc")).toEqual(["AAA", "BBB", "CCC"]);
    expect(order("vol", "asc")).toEqual(["CCC", "BBB", "AAA"]);
    expect(order("risco", "asc")).toEqual(["AAA", "BBB", "CCC"]);
    expect(order("risco", "desc")).toEqual(["BBB", "AAA", "CCC"]);
    expect(order("pressao", "desc")).toEqual(["AAA", "BBB", "CCC"]);
  });

  test("by name it is alphabetical, and a tie keeps the order of the rank, so the table does not jump", () => {
    expect(order("ativo", "asc")).toEqual(["AAA", "BBB", "CCC"]);
    const equal = buildOnchainRows([hot("EQ1", { volumeUsd: 5, changePct: 1 }), hot("EQ2", { volumeUsd: 4, changePct: 1 })], null);
    expect(sortOnchain(equal, { key: "var24h", dir: "desc" }).map((r) => r.symbol)).toEqual(["EQ1", "EQ2"]);
  });

  test("the input is never changed in place", () => {
    const before = rows.map((r) => r.id);
    sortOnchain(rows, { key: "ativo", dir: "desc" });
    expect(rows.map((r) => r.id)).toEqual(before);
  });
});

describe("views and cells", () => {
  test("three views: the overview, the smart money and the risk; the two that the exchange has and a token does not are not here", () => {
    expect(ONCHAIN_VIEW_ORDER).toEqual(["geral", "smart", "risco"]);
    expect(ONCHAIN_VIEWS.geral.columns.map((c) => c.id)).toEqual(["rank", "ativo", "preco", "var24h", "vol", "mcap", "liquidez", "holders", "pressao"]);
    expect(ONCHAIN_VIEWS.smart.columns.map((c) => c.id)).toEqual(["ativo", "carteiras", "usd", "vendida", "tipo"]);
    expect(ONCHAIN_VIEWS.risco.columns.map((c) => c.id)).toEqual(["ativo", "risco", "top10", "dev", "bundlers", "liquidez", "holders"]);
    expect(ONCHAIN_VIEWS.smart.needsSignals).toBe(true);
    expect(ONCHAIN_VIEWS.geral.needsSignals).toBe(false);
  });

  test("a number the provider gave is shown formatted, and one it did not give is a dash with the reason", () => {
    const [a, c] = buildOnchainRows([AAA, CCC], null);
    const ca = onchainCells(a!);
    expect(ca.ativo).toMatchObject({ text: "AAA" });
    expect(ca.var24h.tone).toBe("up");
    expect(ca.vol.text).toBe("900 mil");
    expect(ca.pressao.text).toBe("+0,20 Pressao compradora");
    expect(ca.pressao.tone).toBe("up");
    expect(ca.risco.text).toBe("Nivel 2 de 5");
    const cc = onchainCells(c!);
    expect(cc.pressao).toMatchObject({ text: "-", title: "A OKX nao informou a contagem de transacoes" });
    expect(cc.risco).toMatchObject({ text: "-", title: "A OKX nao informou o nivel de risco" });
    expect(cc.top10).toMatchObject({ text: "-" });
  });

  test("the smart money cells say 'not read' for a gap and show zero for a real zero", () => {
    const unread = onchainCells(buildOnchainRows([AAA], null)[0]!);
    expect(unread.carteiras).toMatchObject({ text: "-", title: "Os registros de carteiras rastreadas ainda nao foram lidos" });
    const read = buildOnchainRows([AAA, BBB], [signal(AAA, { walletCount: 5, amountUsd: 20_000, soldRatioPct: 10, walletType: "kol" })]);
    const a = onchainCells(read[0]!);
    const b = onchainCells(read[1]!);
    expect(a.carteiras.text).toBe("5");
    expect(a.usd.text).toBe("20,0 mil");
    expect(a.vendida.text).toBe("10%");
    expect(a.tipo.text).toBe("KOL");
    expect(b.carteiras.text).toBe("0");
    // a zero means "not among the records that were read", which is the last hundred of the network, and not "the network has none": the cell says so
    expect(b.carteiras.title).toBe("Nenhum registro deste token entre os registros lidos da rede (uma pagina de ate 100)");
    expect(b.tipo).toMatchObject({ text: "-", title: "Nenhum registro deste token entre os registros lidos da rede (uma pagina de ate 100)" });
  });

  test("plain ASCII, no middle dot, em dash or en dash, and no word of an order, in every cell of every state", () => {
    const rows = buildOnchainRows([AAA, BBB, CCC], [signal(AAA, { walletType: "whale" }), signal(BBB, { walletType: "kol" })]);
    const words = /\b(comprar|compre|vender|venda|buy|sell|hold|action|signal|recommend|vote|side|sinal)\b/i;
    for (const set of [rows, buildOnchainRows([AAA, BBB, CCC], null)]) {
      for (const row of set) {
        for (const cell of Object.values(onchainCells(row))) {
          const text = `${cell.text} ${cell.title ?? ""}`;
          expect(/^[\x20-\x7e]*$/.test(text)).toBe(true);
          expect(words.test(text)).toBe(false);
        }
      }
    }
  });
});

describe("the column names and tips", () => {
  test("plain ASCII, no middle dot, em dash or en dash, and no word of an order, in every label and tip of every view", () => {
    const words = /\b(comprar|compre|vender|venda|buy|sell|hold|action|signal|recommend|vote|side|sinal)\b/i;
    for (const id of ONCHAIN_VIEW_ORDER) {
      expect(/^[\x20-\x7e]*$/.test(ONCHAIN_VIEWS[id].label)).toBe(true);
      for (const column of ONCHAIN_VIEWS[id].columns) {
        const text = `${column.label} ${column.tip}`;
        expect(/^[\x20-\x7e]*$/.test(text)).toBe(true);
        expect(words.test(text)).toBe(false);
      }
    }
  });
});
