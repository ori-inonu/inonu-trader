import { describe, expect, test } from "bun:test";
import { PROFILES } from "./plans";
import { buildSwapArgs, buyCostCapPct, KNOWN_DOLLARS, NATIVE_EVM, NATIVE_SOLANA, settlementFor, swapAddress, SLIPPAGE_CAP_PCT } from "./swap-args";
import type { Book, PlannedOrder, Position } from "./types";

const TOKEN = "0xabcdef0123456789abcdef0123456789abcdef01";
const USDC_ETH = "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48";
const WALLET = "0x1111111111111111111111111111111111111111";
const SOLW = "9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin";

const cashPos = (chainIndex: string, address: string, usd: number, symbol = "USDC"): Position => ({ id: `token:${chainIndex}:${address}`, chainIndex, address, symbol, wallet: "agente", usd, balanceMinor: "1", decimals: 6, isCash: true });
const book = (positions: Position[]): Book => ({ observedAtMs: 1, positions, cashByChain: {}, totalUsd: 1, agentUsd: 1 });
const order = (over: Partial<PlannedOrder> = {}): PlannedOrder => ({ candidateId: "buy:x", side: "buy", stance: "buy_third", chainIndex: "1", symbol: "AAA", address: TOKEN, usd: 25, amountMinor: null, wallet: "agente", profile: "alvo_5", source: "modelo", ...over });

describe("the amount of a purchase reaches the tool exactly, at the precision of the coin it pays in", () => {
  const coin = (decimals: number | null) => ({ address: USDC_ETH, symbol: "USDC", decimals });
  const amountOf = (usd: number, decimals: number | null, phase: "quote" | "execute" = "quote"): string => {
    const args = buildSwapArgs(phase, order({ usd }), coin(decimals), WALLET);
    return args[args.findIndex((a) => a === "--amount" || a === "--readable-amount") + 1]!;
  };

  test("a fraction of a cent is not rounded up to the next cent: 0.125 USDC is 125000 minor units, in the quote and in the execution", () => {
    expect(amountOf(0.125, 6, "quote")).toBe("125000");
    expect(amountOf(0.125, 6, "execute")).toBe("125000");
    expect(amountOf(37.125, 6)).toBe("37125000");
    expect(amountOf(3.25, 6)).toBe("3250000");
    expect(amountOf(0.000001, 6)).toBe("1");
  });

  test("what the coin cannot represent is cut down, never up, and a decimal that is not exact in binary still lands where it was meant", () => {
    expect(amountOf(0.1234567, 6)).toBe("123456");
    expect(amountOf(0.3, 6)).toBe("300000");
    expect(amountOf(0.1 + 0.2, 6)).toBe("300000");
    expect(amountOf(1.005, 6)).toBe("1005000");
    expect(amountOf(12.34, 2)).toBe("1234");
    expect(amountOf(0.129, 2)).toBe("12");
  });

  test("a coin of eighteen decimals is exact too", () => {
    expect(amountOf(0.125, 18)).toBe("125000000000000000");
    expect(amountOf(25, 18)).toBe("25000000000000000000");
  });

  test("an amount that is zero after the cut is refused, never sent as zero", () => {
    expect(() => buildSwapArgs("quote", order({ usd: 0.0000001 }), coin(6), WALLET)).toThrow("amount");
    expect(() => buildSwapArgs("quote", order({ usd: 0 }), coin(6), WALLET)).toThrow("amount");
    expect(() => buildSwapArgs("quote", order({ usd: Number.NaN }), coin(6), WALLET)).toThrow("amount");
  });

  test("when the decimals of the coin are not known the tool is told the readable amount, cut to six places and not rounded", () => {
    expect(amountOf(0.125, null)).toBe("0.125");
    expect(amountOf(0.1234567, null)).toBe("0.123456");
  });
});

describe("a purchase must survive its own entry: what it may pay is a third of the stop of the profile it opens", () => {
  test("the cost cap of a purchase by profile, never above the ceilings of the code", () => {
    expect(buyCostCapPct("alvo_2", SLIPPAGE_CAP_PCT.buy)).toBe(0.5);
    expect(buyCostCapPct("alvo_5", SLIPPAGE_CAP_PCT.buy)).toBe(1.33);
    expect(buyCostCapPct("alvo_10", SLIPPAGE_CAP_PCT.buy)).toBe(2);
    expect(buyCostCapPct("alvo_20", SLIPPAGE_CAP_PCT.buy)).toBe(2);
    expect(buyCostCapPct("alvo_20", 3)).toBe(3);
    // a profile that is not one of ours gets the ceiling, which is the most the code ever accepts
    expect(buyCostCapPct(null, 2)).toBe(2);
    expect(buyCostCapPct("alvo_99", 2)).toBe(2);
  });

  test("the slippage of the tightest profile reaches the tool, and a stop is never wider than the entry cost it would pay", () => {
    const usdc = { address: USDC_ETH, symbol: "USDC", decimals: 6 };
    expect(buildSwapArgs("execute", order({ profile: "alvo_2" }), usdc, WALLET).slice(-2)).toEqual(["--max-auto-slippage", "0.5"]);
    for (const [id, spec] of Object.entries(PROFILES)) expect(buyCostCapPct(id, SLIPPAGE_CAP_PCT.buy) + buyCostCapPct(id, 3)).toBeLessThan(spec.stopPct);
  });
});

describe("addresses in a swap", () => {
  test("the native coin has the aggregator's own address on each family", () => {
    expect(NATIVE_EVM).toBe("0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee");
    expect(NATIVE_SOLANA).toBe("11111111111111111111111111111111");
    expect(swapAddress("1", "native")).toBe(NATIVE_EVM);
    expect(swapAddress("8453", "native")).toBe(NATIVE_EVM);
    expect(swapAddress("501", "native")).toBe(NATIVE_SOLANA);
    expect(swapAddress("1", TOKEN)).toBe(TOKEN);
  });
});

describe("the coin a swap is paid in or settled in", () => {
  test("the biggest dollar coin the wallet already holds on that network", () => {
    const b = book([cashPos("1", USDC_ETH, 50), cashPos("1", "0xdac17f958d2ee523a2206206994597c13d831ec7", 400, "USDT"), cashPos("8453", "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913", 900)]);
    expect(settlementFor(b, "1")).toEqual({ address: "0xdac17f958d2ee523a2206206994597c13d831ec7", symbol: "USDT", decimals: 6 });
    expect(settlementFor(b, "8453")?.address).toBe("0x833589fcd6edb6e08f4c7c32d4f71b54bda02913");
  });

  test("the wallet of the person is not the agent's: only the managed wallet's cash counts", () => {
    const other: Position = { ...cashPos("1", USDC_ETH, 9999), wallet: "principal" };
    expect(settlementFor(book([other]), "1")).toEqual({ address: USDC_ETH, symbol: "USDC", decimals: 6 });
  });

  test("with no cash there, a well-known dollar coin of the network, never a guess", () => {
    expect(settlementFor(book([]), "1")).toEqual({ address: USDC_ETH, symbol: "USDC", decimals: 6 });
    // a dollar coin with 18 decimals (USDT on BNB Chain) is known as such
    expect(settlementFor(book([]), "56")).toMatchObject({ symbol: "USDT", decimals: 18 });
    expect(settlementFor(book([]), "501")?.symbol).toBe("USDC");
    expect(settlementFor(book([]), "196")).toBeNull();
    expect(settlementFor(book([]), "143")).toBeNull();
  });

  test("the well-known coins are real contracts of their networks", () => {
    for (const [chain, coin] of Object.entries(KNOWN_DOLLARS)) {
      expect(coin.address.length).toBeGreaterThan(30);
      expect(coin.symbol).toMatch(/^US/);
      if (chain !== "501") expect(coin.address).toMatch(/^0x[0-9a-f]{40}$/);
    }
  });
});

describe("the arguments of a swap", () => {
  const usdc = { address: USDC_ETH, symbol: "USDC", decimals: 6 };

  test("a purchase pays the dollars in RAW units of the coin it pays in, from the settlement coin to the token, on the network the tool names", () => {
    expect(buildSwapArgs("quote", order(), usdc, WALLET)).toEqual(["swap", "quote", "--from", USDC_ETH, "--to", TOKEN, "--amount", "25000000", "--chain", "ethereum"]);
    // (alvo_5 stops at 4 percent: a third of it is what the purchase may pay in slippage)
    expect(buildSwapArgs("execute", order(), usdc, WALLET)).toEqual(["swap", "execute", "--from", USDC_ETH, "--to", TOKEN, "--amount", "25000000", "--chain", "ethereum", "--wallet", WALLET, "--max-auto-slippage", "1.33"]);
  });

  test("the raw amount follows the decimals of the coin: 18 on BNB Chain, cents are kept, and the tool's own lookup is only a fallback", () => {
    const usdt = { address: "0x55d398326f99059ff775485246999027b3197955", symbol: "USDT", decimals: 18 };
    expect(buildSwapArgs("quote", order({ chainIndex: "56", usd: 25 }), usdt, WALLET)).toContain("25000000000000000000");
    expect(buildSwapArgs("quote", order({ usd: 12.34 }), usdc, WALLET)).toContain("12340000");
    const unknown = { ...usdc, decimals: null };
    const args = buildSwapArgs("quote", order(), unknown, WALLET);
    expect(args).toContain("--readable-amount");
    expect(args).not.toContain("--amount");
    for (const bad of [0, 1, 30, 6.5]) expect(buildSwapArgs("quote", order(), { ...usdc, decimals: bad }, WALLET)).toContain("--readable-amount");
  });

  test("a network the tool has no name for here is passed by its number, and the known ones by their names", () => {
    expect(buildSwapArgs("quote", order({ chainIndex: "8453" }), usdc, WALLET)).toContain("base");
    expect(buildSwapArgs("quote", order({ chainIndex: "56" }), usdc, WALLET)).toContain("bsc");
    expect(buildSwapArgs("quote", order({ chainIndex: "143" }), usdc, WALLET)).toContain("143");
  });

  test("a sale gives the exact raw balance the code worked out, to the settlement coin", () => {
    const sale = order({ side: "sell", stance: "trim_half", amountMinor: "500000000000000000", usd: 45 });
    expect(buildSwapArgs("execute", sale, usdc, WALLET)).toEqual(["swap", "execute", "--from", TOKEN, "--to", USDC_ETH, "--amount", "500000000000000000", "--chain", "ethereum", "--wallet", WALLET, "--max-auto-slippage", String(SLIPPAGE_CAP_PCT.sell)]);
  });

  test("an exit the plan demands may accept more slippage than a purchase: getting out is the point", () => {
    const stop = order({ side: "sell", stance: "exit_all", amountMinor: "7", source: "protecao", profile: null });
    expect(buildSwapArgs("execute", stop, usdc, WALLET)).toContain(String(SLIPPAGE_CAP_PCT.protecao));
    expect(SLIPPAGE_CAP_PCT.protecao).toBeGreaterThan(SLIPPAGE_CAP_PCT.sell);
    expect(SLIPPAGE_CAP_PCT.sell).toBeGreaterThanOrEqual(SLIPPAGE_CAP_PCT.buy);
  });

  test("a native coin is addressed the way the aggregator wants", () => {
    const sale = order({ side: "sell", address: "native", amountMinor: "1000000000000000000", usd: 3000, symbol: "ETH" });
    expect(buildSwapArgs("quote", sale, usdc, WALLET)).toContain(NATIVE_EVM);
    const sol = order({ side: "sell", chainIndex: "501", address: "native", amountMinor: "2000000000", symbol: "SOL" });
    expect(buildSwapArgs("quote", sol, { address: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", symbol: "USDC", decimals: 6 }, SOLW)).toContain(NATIVE_SOLANA);
  });

  test("never --force, whatever the order", () => {
    for (const o of [order(), order({ side: "sell", amountMinor: "1", source: "protecao", profile: null })]) {
      for (const phase of ["quote", "execute"] as const) expect(buildSwapArgs(phase, o, usdc, WALLET)).not.toContain("--force");
    }
  });

  test("a sale without a worked-out amount, or a purchase of nothing, is refused here and never builds a command", () => {
    expect(() => buildSwapArgs("execute", order({ side: "sell", amountMinor: null }), usdc, WALLET)).toThrow();
    expect(() => buildSwapArgs("execute", order({ side: "sell", amountMinor: "0" }), usdc, WALLET)).toThrow();
    expect(() => buildSwapArgs("execute", order({ usd: 0 }), usdc, WALLET)).toThrow();
    expect(() => buildSwapArgs("execute", order({ usd: Number.NaN }), usdc, WALLET)).toThrow();
  });

  test("an argument that could be read as a flag, or contains control characters, is refused", () => {
    expect(() => buildSwapArgs("execute", order({ address: "--force" }), usdc, WALLET)).toThrow();
    expect(() => buildSwapArgs("execute", order({ address: `${TOKEN}\n--force` }), usdc, WALLET)).toThrow();
    expect(() => buildSwapArgs("execute", order(), usdc, "--force")).toThrow();
  });
});
