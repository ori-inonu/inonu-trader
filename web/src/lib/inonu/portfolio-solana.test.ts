// T9.1 and T9.4, WAL-1 and WAL-4: the manual portfolio consultation for the Solana account. The assets come from a reading of the account through the local gateway (the same
// rows "Minha carteira" shows), the request carries no address, a mint keeps its case everywhere, and the same rules of size and freshness as the EVM consultation hold.
// origin: synthetic_fixture, tests only (made up balances; the mints are public ones).
import { describe, expect, test } from "bun:test";
import { parsePortfolioAnswer, portfolioCandidateId, portfolioMatches, preparePortfolioSolana, type SolanaHolding } from "./portfolio";

const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const USDT = "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB";
const BONK = "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263";
const ACCOUNT = "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM";
const OBSERVED = 100_000;
const NOW = 110_000;

/** A made up mint of 44 base58 characters: the last one tells it from the others (the alphabet has no I). */
const mint = (i: number): string => `${USDC.slice(0, 43)}${"ABCDEFGHJ"[i]}`;
const row = (over: Partial<SolanaHolding> = {}): SolanaHolding => ({ symbol: "SOL", tokenAddress: null, balance: 2.5, valueUsd: 375, flaggedRisk: false, ...over });
const rows = (): SolanaHolding[] => [row(), row({ symbol: "USDC", tokenAddress: USDC, balance: 40, valueUsd: 40 }), row({ symbol: "USDT", tokenAddress: USDT, balance: 3, valueUsd: 3 })];
const reading = (r: readonly SolanaHolding[] = rows(), observedAtMs = OBSERVED) => ({ observedAtMs, rows: r });
const ok = (r: ReturnType<typeof preparePortfolioSolana>) => {
  if (!r.ok) throw new Error(r.reason);
  return r;
};

describe("what is sent", () => {
  test("the native coin, the mints as they are, the balances as text, network 501, partial and conservative; no address, no value, nothing else", () => {
    const { request } = ok(preparePortfolioSolana(reading(), NOW));
    expect(request.modo).toBe("carteira");
    expect(request.carteira).toEqual({
      chainIndex: "501", observedAtMs: OBSERVED, coverage: "partial", profile: "conservative_no_leverage",
      assets: [{ contract: "native", symbol: "SOL", balance: "2.5" }, { contract: USDC, symbol: "USDC", balance: "40" }, { contract: USDT, symbol: "USDT", balance: "3" }],
    });
    const text = JSON.stringify(request);
    expect(text).not.toContain(ACCOUNT);
    expect(text).not.toMatch(/valueUsd|priceUsd|account|address|apiKey/);
  });

  test("the case of a mint is kept, and two mints that differ only by case are two assets", () => {
    const upper = "AbCdEfGhJkMnPqRsTuVwXyZ123456789aBcDeF";
    const flipped = upper.replace(/[A-Za-z]/g, (c) => (c === c.toUpperCase() ? c.toLowerCase() : c.toUpperCase()));
    const { request } = ok(preparePortfolioSolana(reading([row(), row({ symbol: "AAA", tokenAddress: upper }), row({ symbol: "BBB", tokenAddress: flipped })]), NOW));
    expect(request.carteira.assets.map((a) => a.contract)).toEqual(["native", upper, flipped]);
    // the very same mint twice is one asset
    const twice = ok(preparePortfolioSolana(reading([row(), row({ symbol: "AAA", tokenAddress: upper }), row({ symbol: "AAA", tokenAddress: upper, balance: 9 })]), NOW));
    expect(twice.request.carteira.assets.length).toBe(2);
  });

  test("balances are plain decimals the server takes: no exponent, no trailing zeros, nothing that is not a number", () => {
    const sample = (balance: number) => ok(preparePortfolioSolana(reading([row({ balance }), row({ symbol: "USDC", tokenAddress: USDC, balance: 1 })]), NOW)).request.carteira.assets[0]?.balance;
    expect(sample(0.0000001)).toBe("0.0000001");
    expect(sample(5_200_000)).toBe("5200000");
    expect(sample(123.456)).toBe("123.456");
    for (const n of [0.0000001, 5_200_000, 123.456, 0.1 + 0.2, 1e-12, 987_654_321.123456]) expect(sample(n)).toMatch(/^(0|[1-9]\d*)(\.\d+)?$/);
    // a number the text form cannot carry is left out, not turned into something else
    const huge = preparePortfolioSolana(reading([row({ balance: 1e30 }), row({ symbol: "USDC", tokenAddress: USDC, balance: 1 })]), NOW);
    expect(huge.ok).toBe(false);
    expect(preparePortfolioSolana(reading([row({ balance: Number.NaN }), row({ symbol: "USDC", tokenAddress: USDC, balance: 1 })]), NOW).ok).toBe(false);
  });
});

describe("what is left out, and said", () => {
  test("a token the provider marked as risk, one without a verifiable symbol or mint, and one with nothing in it are not sent", () => {
    const r = ok(preparePortfolioSolana(reading([
      row(), row({ symbol: "USDC", tokenAddress: USDC, balance: 40 }),
      row({ symbol: "BONK", tokenAddress: BONK, flaggedRisk: true }),
      row({ symbol: "???", tokenAddress: USDT }),
      row({ symbol: "ODD", tokenAddress: "not a mint" }),
      row({ symbol: "EMPTY", tokenAddress: BONK, balance: 0 }),
    ]), NOW));
    expect(r.request.carteira.assets.map((a) => a.symbol)).toEqual(["SOL", "USDC"]);
    expect(r.skipped).toBe(4);
  });

  test("at most six assets, in the order the reading gave (the largest first), and the rest is counted", () => {
    const many = Array.from({ length: 9 }, (_, i) => row({ symbol: `T${i}`, tokenAddress: i === 0 ? null : mint(i), balance: 1 }));
    const r = ok(preparePortfolioSolana(reading(many), NOW));
    expect(r.request.carteira.assets.map((a) => a.symbol)).toEqual(["T0", "T1", "T2", "T3", "T4", "T5"]);
    expect(r.skipped).toBe(0);
    expect(r.beyond).toBe(3);
  });

  test("fewer than two verifiable assets cannot be consulted, and the reason says why", () => {
    const one = preparePortfolioSolana(reading([row()]), NOW);
    expect(one.ok).toBe(false);
    expect(!one.ok && one.reason).toContain("2 a 6 ativos verificaveis");
    const flagged = preparePortfolioSolana(reading([row(), row({ symbol: "BONK", tokenAddress: BONK, flaggedRisk: true })]), NOW);
    expect(!flagged.ok && flagged.reason).toContain("marcados como risco");
    expect(preparePortfolioSolana(reading([]), NOW).ok).toBe(false);
  });
});

describe("how old the reading is", () => {
  test("sixty seconds are valid and one more is not; a reading from the future is not one either", () => {
    expect(preparePortfolioSolana(reading(), OBSERVED + 60_000).ok).toBe(true);
    const stale = preparePortfolioSolana(reading(), OBSERVED + 60_001);
    expect(stale.ok).toBe(false);
    expect(!stale.ok && stale.reason).toContain("nova leitura");
    expect(preparePortfolioSolana(reading(), OBSERVED - 1).ok).toBe(false);
    expect(preparePortfolioSolana(reading(rows(), Number.NaN), NOW).ok).toBe(false);
  });
});

describe("the token in focus", () => {
  const focus = { chainIndex: "501", address: BONK, symbol: "BONK", name: null };

  test("a focused Solana token that is not in the list joins it with no balance; one that is already there is not added twice", () => {
    const joined = ok(preparePortfolioSolana(reading(), NOW, focus));
    expect(joined.candidateIncluded).toBe(true);
    expect(joined.request.carteira.assets.at(-1)).toEqual({ contract: BONK, symbol: "BONK", balance: null });
    const present = ok(preparePortfolioSolana(reading([...rows(), row({ symbol: "BONK", tokenAddress: BONK, balance: 7 })]), NOW, focus));
    expect(present.request.carteira.assets.filter((a) => a.contract === BONK).length).toBe(1);
    expect(present.candidateIncluded).toBe(true);
  });

  test("a token of another network, an address that is not a mint and a list that is already full do not join", () => {
    expect(ok(preparePortfolioSolana(reading(), NOW, { ...focus, chainIndex: "196" })).candidateIncluded).toBe(false);
    expect(ok(preparePortfolioSolana(reading(), NOW, { ...focus, address: "0x" + "c".repeat(40) })).candidateIncluded).toBe(false);
    const full = Array.from({ length: 6 }, (_, i) => row({ symbol: `T${i}`, tokenAddress: i === 0 ? null : mint(i) }));
    expect(ok(preparePortfolioSolana(reading(full), NOW, focus)).candidateIncluded).toBe(false);
  });
});

describe("the answer", () => {
  const answerFor = (assets: { contract: string; symbol: string; balance: string | null }[], over: Record<string, unknown> = {}) => ({
    chainIndex: "501", observedAtMs: OBSERVED, coverage: "partial", profile: "conservative_no_leverage", netWorthUsd: null, positionsEmpty: false,
    assets: assets.map((a) => ({ ...a, candidateId: portfolioCandidateId("501", a.contract), action: "hold", model: "jev-test", evidence: { origin: "onchainos", ageMs: 400, gaps: [], flow: null, risk: null } })),
    ...over,
  });
  const sent = [{ contract: "native", symbol: "SOL", balance: "2.5" }, { contract: USDC, symbol: "USDC", balance: "40" }];

  test("the id of a Solana asset keeps the case of the mint, and the EVM id is still lower case", () => {
    expect(portfolioCandidateId("501", USDC)).toBe(`token:501:${USDC}`);
    expect(portfolioCandidateId("501", "native")).toBe("token:501:native");
    expect(portfolioCandidateId("143", "0xAbCdEf0123456789aBcDeF0123456789AbCdEf01")).toBe("token:143:0xabcdef0123456789abcdef0123456789abcdef01");
  });

  test("a Solana answer is accepted, and matches the request it came from", () => {
    const parsed = parsePortfolioAnswer(answerFor(sent));
    expect(parsed).not.toBeNull();
    const prepared = ok(preparePortfolioSolana(reading(rows().slice(0, 2)), NOW));
    expect(portfolioMatches(parsed!, prepared.request)).toBe(true);
  });

  test("an answer about a mint in another case is not the answer to this request", () => {
    const parsed = parsePortfolioAnswer(answerFor(sent));
    const prepared = ok(preparePortfolioSolana(reading(rows().slice(0, 2)), NOW));
    const lowered = { ...prepared.request, carteira: { ...prepared.request.carteira, assets: prepared.request.carteira.assets.map((a) => ({ ...a, contract: a.contract.toLowerCase() })) } };
    expect(portfolioMatches(parsed!, lowered)).toBe(false);
  });

  test("an id that does not carry the exact mint, a hex contract on Solana and a mint on an EVM network are all refused", () => {
    const wrongId = answerFor(sent);
    wrongId.assets[1]!.candidateId = `token:501:${USDC.toLowerCase()}`;
    expect(parsePortfolioAnswer(wrongId)).toBeNull();
    const hex = answerFor([{ contract: "native", symbol: "SOL", balance: "2.5" }, { contract: "0x" + "a".repeat(40), symbol: "USDC", balance: "40" }]);
    expect(parsePortfolioAnswer(hex)).toBeNull();
    expect(parsePortfolioAnswer(answerFor(sent, { chainIndex: "143" }))).toBeNull();
    expect(parsePortfolioAnswer(answerFor(sent, { chainIndex: "502" }))).toBeNull();
  });

  test("the rules of the answer are the same: no invented total, no sale of an absent position, no repeated asset", () => {
    expect(parsePortfolioAnswer(answerFor(sent, { netWorthUsd: 100 }))).toBeNull();
    const sale = answerFor([{ contract: "native", symbol: "SOL", balance: "0" }, { contract: USDC, symbol: "USDC", balance: "0" }], { positionsEmpty: true });
    sale.assets[0]!.action = "sell";
    expect(parsePortfolioAnswer(sale)).toBeNull();
    expect(parsePortfolioAnswer(answerFor([sent[1]!, sent[1]!]))).toBeNull();
    // two mints that differ only by case are not a repeat
    const flipped = USDC.replace(/[A-Za-z]/g, (c) => (c === c.toUpperCase() ? c.toLowerCase() : c.toUpperCase()));
    expect(parsePortfolioAnswer(answerFor([{ contract: USDC, symbol: "AAA", balance: "40" }, { contract: flipped, symbol: "BBB", balance: "3" }]))).not.toBeNull();
  });
});
