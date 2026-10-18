import { expect, test } from "bun:test";
import { preparePortfolio, parsePortfolioAnswer, portfolioMatches } from "./portfolio";
import { createInonuClient } from "./client";
import type { WalletSnapshot } from "../okx-wallet";

const account = "0x" + "a".repeat(40);
const snapshot: WalletSnapshot = {
  status: "connected", account, chainId: "0x8f", error: null, balances: { network: "monad", mon: "0", usdc: "0", block: "0x1" },
  observation: { schemaVersion: 1, source: "okx-provider-reported", account, chainId: "0x8f", network: "monad", block: "0x1", observedAtMs: 100_000,
    assets: [
      { id: "mon", symbol: "MON", native: true, contract: null, rawRpc: "private-rpc", rawUnits: "0", decimals: 18, decimalsSource: "configured", formattedBalance: "0" },
      { id: "usdc", symbol: "USDC", native: false, contract: "0x" + "b".repeat(40), rawRpc: "private-rpc", rawUnits: "0", decimals: 6, decimalsSource: "configured", formattedBalance: "0" },
    ] },
};

test("manual portfolio preparation sends observed asset identities without wallet identifiers or raw RPC", () => {
  const result = preparePortfolio(snapshot, 110_000);
  expect(result.ok).toBe(true);
  if (!result.ok) throw Error(result.reason);
  expect(result.request.carteira.chainIndex).toBe("143");
  expect(result.request.carteira.coverage).toBe("partial");
  expect(result.request.carteira.assets[0]).toEqual({ contract: "native", symbol: "MON", balance: "0" });
  expect(JSON.stringify(result.request)).not.toContain(account);
  expect(JSON.stringify(result.request)).not.toContain("private-rpc");
  expect(JSON.stringify(result.request)).not.toMatch(/rawRpc|rawUnits|account|block|apiKey/);
});

test("expired, future and mismatched observations cannot be consulted", () => {
  expect(preparePortfolio(snapshot, 160_001).ok).toBe(false);
  expect(preparePortfolio(snapshot, 99_999).ok).toBe(false);
  expect(preparePortfolio({ ...snapshot, account: "0x" + "c".repeat(40) }, 110_000).ok).toBe(false);
  expect(preparePortfolio({ ...snapshot, chainId: "0xc4" }, 110_000).ok).toBe(false);
});

test("only the explicitly focused candidate from the same network joins the partial list", () => {
  const focus = { chainIndex: "143", address: "0x" + "c".repeat(40), symbol: "NEW", name: null };
  const result = preparePortfolio(snapshot, 110_000, focus);
  expect(result.ok && result.request.carteira.assets.at(-1)?.balance).toBeNull();
  const other = preparePortfolio(snapshot, 110_000, { ...focus, chainIndex: "196" });
  expect(other.ok && other.candidateIncluded).toBe(false);
});

test("symbols and decimal lengths match the server's bounded contract", () => {
  const result = preparePortfolio(snapshot, 110_000, { chainIndex: "143", address: "0x" + "c".repeat(40), symbol: "USDC.E", name: null });
  expect(result.ok && result.request.carteira.assets.at(-1)?.symbol).toBe("USDCE");
  const bad = { ...snapshot, observation: { ...snapshot.observation!, assets: snapshot.observation!.assets.map((a, i) => i === 0 ? { ...a, formattedBalance: "1".repeat(41) } : a) } };
  expect(preparePortfolio(bad, 110_000).ok).toBe(false);
  for (const label of ["USDC nativo", "USDC_Bridged", "USDC.e"]) {
    const labeled = { ...snapshot, observation: { ...snapshot.observation!, assets: snapshot.observation!.assets.map((a, i) => i === 1 ? { ...a, symbol: label } : a) } };
    const prepared = preparePortfolio(labeled, 110_000);
    expect(prepared.ok).toBe(true);
    expect(prepared.ok && prepared.request.carteira.assets[1]?.symbol).toMatch(/^[A-Z0-9]{1,12}$/);
  }
});

const answer = () => ({ chainIndex: "143", observedAtMs: 100_000, coverage: "partial", profile: "conservative_no_leverage", netWorthUsd: null, positionsEmpty: true,
  assets: snapshot.observation!.assets.map(a => ({ contract: a.native ? "native" : a.contract!.toLowerCase(), symbol: a.symbol, balance: "0", candidateId: `token:143:${a.native ? "native" : a.contract!.toLowerCase()}`, action: "abstain", model: "jev-test", evidence: { origin: "onchainos", ageMs: null, gaps: ["price_unavailable"], flow: null, risk: null } })) });

test("portfolio parser rejects invented identities, absent-position sales and invented total value", () => {
  expect(parsePortfolioAnswer(answer())).not.toBeNull();
  const wrong = answer(); wrong.assets[0]!.candidateId = "invented";
  expect(parsePortfolioAnswer(wrong)).toBeNull();
  const sale = answer(); sale.assets[0]!.action = "sell";
  expect(parsePortfolioAnswer(sale)).toBeNull();
  expect(parsePortfolioAnswer({ ...answer(), netWorthUsd: 100 })).toBeNull();
  expect(parsePortfolioAnswer({ ...answer(), positionsEmpty: false })).toBeNull();
  const prepared = preparePortfolio(snapshot, 110_000);
  expect(prepared.ok && portfolioMatches(parsePortfolioAnswer(answer())!, prepared.request)).toBe(true);
  expect(prepared.ok && portfolioMatches({ ...parsePortfolioAnswer(answer())!, observedAtMs: 1 }, prepared.request)).toBe(false);
});

test("manual client preserves the validated portfolio and uses the existing intent endpoint", async () => {
  const prepared = preparePortfolio(snapshot, 110_000);
  if (!prepared.ok) throw Error(prepared.reason);
  let called = 0;
  const client = createInonuClient("", async (url, init) => {
    called++;
    expect(url).toBe("/inonu/ask");
    expect(init?.headers?.["x-inonu-intent"]).toBe("user");
    expect(JSON.parse(init!.body!).modo).toBe("carteira");
    return Response.json({ ok: true, id: "manual", status: "respondido", carteira: answer(), custo: { chamadasOnchainos: 0, tokens: null, usd: null }, briefHash: "test", advisory: true, execution: "never" });
  });
  expect(called).toBe(0);
  const result = await client.ask(prepared.request);
  expect(result).toHaveProperty("carteira");
  expect(called).toBe(1);
});
