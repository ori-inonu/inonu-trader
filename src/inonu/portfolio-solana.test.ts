// Solana in the manual portfolio consultation (T9.1 and T9.4, WAL-1 and WAL-4). A Solana mint is base58 and its case is part of its identity: lowercasing it names another
// token, or none. These tests pin that the consultation takes network 501 with exact-case mints, keeps the EVM rule (hex is case free, lowercased) and never mixes the two
// families, and that nothing here calls the model or the provider. origin: synthetic_fixture, tests only (made up balances; the mints are public ones).
import { expect, test } from "bun:test";
import { buildBrief } from "../intel/brief";
import { createJevInonuModel } from "./jev-model";
import { createPortfolioSource, parsePortfolioInput } from "./portfolio";
import { SourceError, type BriefSource } from "./ask";

const NOW = 1_800_000_000_000;
const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const USDT = "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB";
const EVM = "0xAbCdEf0123456789aBcDeF0123456789AbCdEf01";
const input = (over: Record<string, unknown> = {}) => ({
  chainIndex: "501", observedAtMs: NOW, coverage: "partial", profile: "conservative_no_leverage",
  assets: [{ contract: "native", symbol: "SOL", balance: "2.5" }, { contract: USDC, symbol: "USDC", balance: "40" }], ...over,
});
const ctx = { signal: new AbortController().signal, maxOnchainosCalls: 15 };

test("a Solana wallet is accepted on network 501: native and mints, each exactly as given", () => {
  const parsed = parsePortfolioInput(input());
  expect(parsed?.chainIndex).toBe("501");
  expect(parsed?.assets.map((a) => a.contract)).toEqual(["native", USDC]);
  expect(parsePortfolioInput(input({ assets: [{ contract: USDC, symbol: "USDC", balance: null }, { contract: USDT, symbol: "USDT", balance: "1" }] }))?.assets.map((a) => a.contract)).toEqual([USDC, USDT]);
});

test("the case of a mint is never changed, and two mints that differ only by case are two assets", () => {
  // no L, i or o in it: flipping their case would make the characters base58 does not have
  const upper = "AbCdEfGhJkMnPqRsTuVwXyZ123456789aBcDeFgHjKmN";
  const flipped = upper.replace(/[A-Za-z]/g, (c) => (c === c.toUpperCase() ? c.toLowerCase() : c.toUpperCase()));
  const parsed = parsePortfolioInput(input({ assets: [{ contract: upper, symbol: "AAA", balance: "1" }, { contract: flipped, symbol: "BBB", balance: "1" }] }));
  expect(parsed?.assets.map((a) => a.contract)).toEqual([upper, flipped]);
  // the same mint twice is still a repeated asset
  expect(parsePortfolioInput(input({ assets: [{ contract: USDC, symbol: "USDC", balance: "1" }, { contract: USDC, symbol: "USDC", balance: "2" }] }))).toBeNull();
  expect(parsePortfolioInput(input({ assets: [{ contract: "native", symbol: "SOL", balance: "1" }, { contract: "native", symbol: "SOL", balance: "2" }] }))).toBeNull();
});

test("the two families never mix: a hex contract on Solana and a mint on an EVM network are both refused", () => {
  expect(parsePortfolioInput(input({ assets: [{ contract: "native", symbol: "SOL", balance: "1" }, { contract: EVM, symbol: "USDC", balance: "1" }] }))).toBeNull();
  for (const chainIndex of ["143", "196", "1", "8453"]) {
    expect(parsePortfolioInput(input({ chainIndex }))).toBeNull();
  }
});

test("text that is not a mint is refused: wrong characters, wrong length, spaces, a path", () => {
  const bad = [USDC.slice(0, 31), `${USDC}A`, `0${USDC.slice(1)}`, `O${USDC.slice(1)}`, `l${USDC.slice(1)}`, `${USDC} `, `${USDC}/x`, "", "Native", "NATIVE"];
  for (const contract of bad) expect(parsePortfolioInput(input({ assets: [{ contract: "native", symbol: "SOL", balance: "1" }, { contract, symbol: "USDC", balance: "1" }] }))).toBeNull();
});

test("the EVM rule is what it was: hex is case free and is lowercased, and network 501 is not an EVM network", () => {
  const evm = parsePortfolioInput({ chainIndex: "143", observedAtMs: NOW, coverage: "partial", profile: "conservative_no_leverage", assets: [{ contract: "native", symbol: "MON", balance: "1" }, { contract: EVM, symbol: "USDC", balance: "1" }] });
  expect(evm?.assets[1]?.contract).toBe(EVM.toLowerCase());
  expect(parsePortfolioInput({ chainIndex: "143", observedAtMs: NOW, coverage: "partial", profile: "conservative_no_leverage", assets: [{ contract: "native", symbol: "MON", balance: "1" }, { contract: USDC, symbol: "USDC", balance: "1" }] })).toBeNull();
});

test("the source asks the token source for the mint exactly as it is, and attaches evidence only when the answer is for that exact mint", async () => {
  const asked: string[] = [];
  const token: BriefSource = {
    async build(request) {
      const target = request.alvo as { chainIndex: string; address: string };
      asked.push(`${target.chainIndex}:${target.address}`);
      const candidates = [{ id: `token:${target.chainIndex}:${target.address}`, tipo: "token" as const }];
      return { ...buildBrief({ alvo: target, asOfMs: NOW, familiasHabilitadas: [], fluxo: { buyShare: 0.6 }, candidatos: candidates, trilha: null, risco: { nivel: 2, flags: [] }, regime: null, idades: { trades: 400 }, origens: { trades: "onchainos" }, nulos: {} }), candidates, onchainosCalls: 2 };
    },
  };
  const built = await createPortfolioSource({ token, now: () => NOW }).build({ modo: "carteira", carteira: parsePortfolioInput(input())! }, ctx);
  expect(asked).toEqual([`501:${USDC}`]);
  const usdc = built.portfolio?.assets.find((a) => a.contract === USDC);
  expect(usdc).toMatchObject({ candidateId: `token:501:${USDC}`, evidence: { origin: "onchainos", ageMs: 400 } });
  expect(built.portfolio?.assets.find((a) => a.contract === "native")?.evidence.gaps).toContain("native_market_unavailable");
  expect(built.brief.candidatos.map((c) => c.id).sort()).toEqual([`token:501:${USDC}`, "token:501:native"].sort());
  expect(JSON.stringify(built.brief)).not.toContain("account");
  expect(new TextEncoder().encode(JSON.stringify(built.brief)).length).toBeLessThanOrEqual(2048);
});

test("an answer for the same mint in another case is another token: no evidence is attached to it", async () => {
  const lowered: BriefSource = {
    async build(request) {
      const target = request.alvo as { chainIndex: string; address: string };
      const address = target.address.toLowerCase();
      const candidates = [{ id: `token:${target.chainIndex}:${address}`, tipo: "token" as const }];
      return { ...buildBrief({ alvo: { chainIndex: target.chainIndex, address }, asOfMs: NOW, familiasHabilitadas: [], fluxo: { buyShare: 0.9 }, candidatos: candidates, trilha: null, risco: { nivel: 1, flags: [] }, regime: null, idades: { trades: 100 }, origens: { trades: "onchainos" }, nulos: {} }), candidates, onchainosCalls: 2 };
    },
  };
  const built = await createPortfolioSource({ token: lowered, now: () => NOW }).build({ modo: "carteira", carteira: parsePortfolioInput(input())! }, ctx);
  expect(built.portfolio?.assets.find((a) => a.contract === USDC)?.evidence).toMatchObject({ origin: "unavailable", flow: null, risk: null, gaps: ["market_identity_mismatch"] });
});

test("the target of the answer is checked by itself: a brief for the lowered mint is not for this mint, even when its candidate id looks right", async () => {
  const half: BriefSource = {
    async build(request) {
      const target = request.alvo as { chainIndex: string; address: string };
      // the candidate carries the exact id, but the brief is about the address in another case
      const candidates = [{ id: `token:${target.chainIndex}:${target.address}`, tipo: "token" as const }];
      return { ...buildBrief({ alvo: { chainIndex: target.chainIndex, address: target.address.toLowerCase() }, asOfMs: NOW, familiasHabilitadas: [], fluxo: { buyShare: 0.9 }, candidatos: candidates, trilha: null, risco: { nivel: 1, flags: [] }, regime: null, idades: { trades: 100 }, origens: { trades: "onchainos" }, nulos: {} }), candidates, onchainosCalls: 2 };
    },
  };
  const built = await createPortfolioSource({ token: half, now: () => NOW }).build({ modo: "carteira", carteira: parsePortfolioInput(input())! }, ctx);
  expect(built.portfolio?.assets.find((a) => a.contract === USDC)?.evidence).toMatchObject({ origin: "unavailable", gaps: ["market_identity_mismatch"] });
});

test("a consultation that has no credential still answers with the gaps, for Solana as for any network", async () => {
  const noKey: BriefSource = { async build() { throw new SourceError("sem_credencial_onchainos", 0); } };
  const built = await createPortfolioSource({ token: noKey, now: () => NOW }).build({ modo: "carteira", carteira: parsePortfolioInput(input())! }, ctx);
  expect(built.portfolio?.assets.find((a) => a.contract === USDC)?.evidence.gaps).toEqual(["onchainos_credentials_unavailable"]);
});

test("the model is asked about Solana candidates by their exact ids, and answers only with those", async () => {
  const noKey: BriefSource = { async build() { throw new SourceError("sem_credencial_onchainos", 0); } };
  const built = await createPortfolioSource({ token: noKey, now: () => NOW }).build({ modo: "carteira", carteira: parsePortfolioInput(input())! }, ctx);
  const seen: any[] = [];
  const model = createJevInonuModel({
    apiKey: () => "injected-key",
    createProvider: () => ({ evaluationModel: () => ({}) as never }),
    evaluate: (async (call: any) => { seen.push(call); return { answers: { asset_0: { choice: "hold" }, asset_1: { choice: "abstain" } }, usage: { inputTokens: 300 } }; }) as never,
  });
  const ids = built.brief.candidatos.map((c) => c.id);
  const out = await model.choose({ brief: built.brief, ids, mode: "carteira", signal: new AbortController().signal });
  expect(seen).toHaveLength(1);
  expect(JSON.stringify(seen[0].questions)).toContain(`token:501:${USDC}`);
  expect((out.raw as { choices: { candidateId: string }[] }).choices.map((c) => c.candidateId)).toEqual(ids);
});

test("the model still refuses an id that is neither native, a hex contract on an EVM chain nor a mint on Solana", async () => {
  const noKey: BriefSource = { async build() { throw new SourceError("sem_credencial_onchainos", 0); } };
  const built = await createPortfolioSource({ token: noKey, now: () => NOW }).build({ modo: "carteira", carteira: parsePortfolioInput(input())! }, ctx);
  const model = createJevInonuModel({ apiKey: () => "injected-key", createProvider: () => ({ evaluationModel: () => ({}) as never }), evaluate: (async () => ({ answers: {} })) as never });
  const forged = { ...built.brief, candidatos: built.brief.candidatos.map((c, i) => (i === 0 ? { ...c, id: "token:143:EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v" } : c)) };
  await expect(model.choose({ brief: forged, ids: forged.candidatos.map((c) => c.id), mode: "carteira", signal: new AbortController().signal })).rejects.toThrow("Invalid portfolio candidates");
});
