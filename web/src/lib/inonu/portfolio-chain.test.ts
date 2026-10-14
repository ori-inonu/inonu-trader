// WAL-4: the manual portfolio consultation for ANY EVM network the provider lists (not only Monad and X Layer). The assets come from a reading through the local gateway (the same rows
// "Minha carteira" shows), the request carries no address and no value, a hex contract is lower case everywhere, and the rules of size and freshness are those of the other families.
// origin: synthetic_fixture, tests only (made up balances; the contracts are made up too).
import { describe, expect, test } from "bun:test";
import { parsePortfolioAnswer, portfolioCandidateId, portfolioMatches, preparePortfolioChain, preparePortfolioSolana, type SolanaHolding } from "./portfolio";

const USDC = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
const USDT = "0xdAC17F958D2ee523a2206206994597C13D831ec7";
const OBSERVED = 100_000;
const NOW = 110_000;
const BASE = "8453";

const contract = (i: number): string => `0x${i.toString(16).padStart(40, "0")}`;
const row = (over: Partial<SolanaHolding> = {}): SolanaHolding => ({ symbol: "ETH", tokenAddress: null, balance: 0.5, valueUsd: 1500, flaggedRisk: false, ...over });
const rows = (): SolanaHolding[] => [row(), row({ symbol: "USDC", tokenAddress: USDC, balance: 40, valueUsd: 40 }), row({ symbol: "USDT", tokenAddress: USDT, balance: 3, valueUsd: 3 })];
const reading = (r: readonly SolanaHolding[] = rows(), observedAtMs = OBSERVED) => ({ observedAtMs, rows: r });
const ok = (r: ReturnType<typeof preparePortfolioChain>) => {
  if (!r.ok) throw new Error(r.reason);
  return r;
};

describe("what is sent", () => {
  test("the native coin, the contracts in lower case, the balances as text, the network asked, partial and conservative; no address, no value", () => {
    const { request } = ok(preparePortfolioChain(BASE, reading(), NOW));
    expect(request.modo).toBe("carteira");
    expect(request.carteira).toEqual({
      chainIndex: BASE, observedAtMs: OBSERVED, coverage: "partial", profile: "conservative_no_leverage",
      assets: [{ contract: "native", symbol: "ETH", balance: "0.5" }, { contract: USDC.toLowerCase(), symbol: "USDC", balance: "40" }, { contract: USDT.toLowerCase(), symbol: "USDT", balance: "3" }],
    });
    const text = JSON.stringify(request);
    expect(text).not.toContain("1500");
    expect(text).not.toMatch(/address|account|valueUsd|price/i);
  });

  test("it works on any network number the provider lists, and refuses Solana's and anything that is not a number", () => {
    for (const chain of ["1", "56", "143", "196", "4663", "5042", "42161", "534352"]) expect(ok(preparePortfolioChain(chain, reading(), NOW)).request.carteira.chainIndex).toBe(chain);
    for (const chain of ["501", "", "0x1", "abc", "1.5", "-1", "0", "1234567890123"]) expect(preparePortfolioChain(chain, reading(), NOW).ok).toBe(false);
  });

  test("a balance in scientific notation is carried as plain text, and one that cannot be carried is left out", () => {
    const { request } = ok(preparePortfolioChain(BASE, reading([row({ balance: 0.00000012 }), row({ symbol: "WEI", tokenAddress: contract(7), balance: 1e-7 }), row({ symbol: "BIG", tokenAddress: contract(8), balance: Number.POSITIVE_INFINITY })]), NOW));
    expect(request.carteira.assets.map((a) => [a.symbol, a.balance])).toEqual([["ETH", "0.00000012"], ["WEI", "0.0000001"]]);
  });
});

describe("what is left out, counted and never turned into something else", () => {
  test("a holding marked as risk by the provider, with no usable symbol, with nothing in it, with a contract that is not hex, or repeated", () => {
    const list = [
      row(), row({ symbol: "USDC", tokenAddress: USDC, balance: 40 }),
      row({ symbol: "SCAM", tokenAddress: contract(1), flaggedRisk: true }), row({ symbol: "", tokenAddress: contract(2) }), row({ symbol: "ZERO", tokenAddress: contract(3), balance: 0 }),
      row({ symbol: "MINT", tokenAddress: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v" }), row({ symbol: "USDC", tokenAddress: USDC.toLowerCase(), balance: 41 }),
    ];
    const prepared = ok(preparePortfolioChain(BASE, reading(list), NOW));
    expect(prepared.request.carteira.assets.map((a) => a.symbol)).toEqual(["ETH", "USDC"]);
    expect(prepared.skipped).toBe(5);
  });

  test("more than six: the six largest go, the rest are counted as beyond", () => {
    const many = Array.from({ length: 9 }, (_, i) => row({ symbol: `T${i}`, tokenAddress: contract(i + 1), balance: i + 1 }));
    const prepared = ok(preparePortfolioChain(BASE, reading(many), NOW));
    expect(prepared.request.carteira.assets.length).toBe(6);
    expect(prepared.beyond).toBe(3);
    expect(prepared.request.carteira.assets[0]!.symbol).toBe("T0");
  });

  test("fewer than two verifiable holdings is no consultation, and says what was left out", () => {
    const one = preparePortfolioChain(BASE, reading([row(), row({ symbol: "SCAM", tokenAddress: contract(1), flaggedRisk: true })]), NOW);
    expect(one.ok).toBe(false);
    if (!one.ok) {
      expect(one.reason).toContain("2 a 6 ativos verificaveis");
      expect(one.reason).toContain("Foram deixados de fora 1 ativos");
    }
  });
});

describe("freshness and the token in focus", () => {
  test("a reading older than 60 seconds is not enough", () => {
    expect(preparePortfolioChain(BASE, reading(rows(), OBSERVED), OBSERVED + 59_000).ok).toBe(true);
    const old = preparePortfolioChain(BASE, reading(rows(), OBSERVED), OBSERVED + 61_000);
    expect(old.ok).toBe(false);
    if (!old.ok) expect(old.reason).toContain("nova leitura");
  });

  const focus = { chainIndex: BASE, address: contract(9), symbol: "NEW", name: null };

  test("the focused token of the same network joins with no balance when there is room, and one of another network never does", () => {
    const joined = ok(preparePortfolioChain(BASE, reading(), NOW, focus));
    expect(joined.candidateIncluded).toBe(true);
    expect(joined.request.carteira.assets.at(-1)).toEqual({ contract: contract(9), symbol: "NEW", balance: null });
    expect(ok(preparePortfolioChain(BASE, reading(), NOW, { ...focus, chainIndex: "1" })).candidateIncluded).toBe(false);
    expect(ok(preparePortfolioChain(BASE, reading(), NOW, { ...focus, address: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v" })).candidateIncluded).toBe(false);
  });

  test("a focused token the wallet already holds is not added twice", () => {
    const held = ok(preparePortfolioChain(BASE, reading(), NOW, { ...focus, address: USDC.toLowerCase(), symbol: "USDC" }));
    expect(held.candidateIncluded).toBe(true);
    expect(held.request.carteira.assets.length).toBe(3);
  });
});

describe("the answer of the model for any network", () => {
  const sent = () => ok(preparePortfolioChain(BASE, reading(), NOW)).request;
  const answerFor = (request: ReturnType<typeof sent>, over: Record<string, unknown> = {}) => ({
    chainIndex: request.carteira.chainIndex, observedAtMs: request.carteira.observedAtMs, coverage: "partial", profile: "conservative_no_leverage", netWorthUsd: null, positionsEmpty: false,
    assets: request.carteira.assets.map((a) => ({
      ...a, candidateId: portfolioCandidateId(request.carteira.chainIndex, a.contract), action: "hold", model: "jev-latest",
      evidence: { origin: "OKX OnchainOS", ageMs: 1000, gaps: [], flow: null, risk: null },
    })),
    ...over,
  });

  test("an answer about the network that was asked is read, and matches the request", () => {
    const request = sent();
    const parsed = parsePortfolioAnswer(answerFor(request));
    expect(parsed).not.toBeNull();
    expect(parsed!.chainIndex).toBe(BASE);
    expect(portfolioMatches(parsed!, request)).toBe(true);
  });

  test("an answer about another network does not match what was sent", () => {
    const request = sent();
    const other = parsePortfolioAnswer(answerFor(request, { chainIndex: "1" }));
    // the contracts are valid on both networks, so it parses; it is the match with the request that refuses it
    if (other !== null) expect(portfolioMatches(other, request)).toBe(false);
  });

  test("a mint under an EVM network, or a hex contract under Solana, is not an answer", () => {
    const request = sent();
    const mint = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
    const withMint = answerFor(request);
    (withMint.assets[1] as Record<string, unknown>).contract = mint;
    expect(parsePortfolioAnswer(withMint)).toBeNull();
    expect(parsePortfolioAnswer(answerFor(request, { chainIndex: "501" }))).toBeNull();
  });

  test("a chain that is not a number is not an answer", () => {
    for (const chainIndex of ["", "abc", "0", "1.5", "0x1", 8453, null]) expect(parsePortfolioAnswer(answerFor(sent(), { chainIndex }))).toBeNull();
  });

  test("the Solana preparation is untouched", () => {
    const sol = preparePortfolioSolana({ observedAtMs: OBSERVED, rows: [row({ symbol: "SOL" }), row({ symbol: "USDC", tokenAddress: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", balance: 40 })] }, NOW);
    expect(sol.ok && sol.request.carteira.chainIndex).toBe("501");
  });
});
