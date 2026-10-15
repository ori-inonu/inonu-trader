import { describe, expect, test } from "bun:test";
import { candidateOf, type EcoFacts, type Saldo } from "../opportunity/ecosystem";
import type { Candle } from "../quant/types";
import { buyCandidates, holdingCandidates, minBuyUsd, openByRisk, saldoOf, triggersOf, HOLDING_RULES } from "./candidates";
import { entryBlocked, timingFacts, timingFamilies, timingMarks, type TimingFacts } from "./timing";
import type { Book, Candidate, HoldingFacts, Position } from "./types";

const A = "0x1111111111111111111111111111111111111111";
const B = "0x2222222222222222222222222222222222222222";
const C = "0x3333333333333333333333333333333333333333";
const D = "0x4444444444444444444444444444444444444444";
const USDC = "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48";

const pos = (over: Partial<Position> = {}): Position => ({ id: `token:1:${A}`, chainIndex: "1", address: A, symbol: "AAA", wallet: "agente", usd: 90, balanceMinor: "1000000000000000000", decimals: 18, isCash: false, ...over });
const cash = (usd: number, chainIndex = "1"): Position => ({ id: `token:${chainIndex}:${USDC}`, chainIndex, address: USDC, symbol: "USDC", wallet: "agente", usd, balanceMinor: String(usd * 1e6), decimals: 6, isCash: true });
const book = (positions: Position[], over: Partial<Book> = {}): Book => {
  const cashByChain: Record<string, number> = {};
  for (const p of positions) if (p.isCash && p.wallet === "agente" && p.usd !== null) cashByChain[p.chainIndex] = (cashByChain[p.chainIndex] ?? 0) + p.usd;
  const agentUsd = positions.filter((p) => p.wallet === "agente").reduce((s, p) => s + (p.usd ?? 0), 0);
  return { observedAtMs: 1_000_000, positions, cashByChain, totalUsd: positions.reduce((s, p) => s + (p.usd ?? 0), 0), agentUsd, ...over };
};
const facts = (over: Partial<HoldingFacts> = {}): HoldingFacts => ({ priceUsd: 1, sinceEntryPct: null, changeH24Pct: 0, liquidityUsd: 1_000_000, exitImpactPct: 0.01, volumeH24Usd: 500_000, soldPct: 0, riskLevel: 1, riskFlags: [], heldHours: 10, ...over });

describe("triggers are observations of the code, never advice", () => {
  test("a quiet holding has none", () => {
    expect(triggersOf(facts())).toEqual([]);
  });

  test("each trigger has its own measured threshold", () => {
    const R = HOLDING_RULES;
    expect(triggersOf(facts({ soldPct: R.soldPct }))).toContain("carteiras_venderam");
    expect(triggersOf(facts({ soldPct: R.soldPct - 1 }))).not.toContain("carteiras_venderam");
    expect(triggersOf(facts({ exitImpactPct: R.exitImpactPct }))).toContain("saida_dificil");
    expect(triggersOf(facts({ riskFlags: ["x"] }))).toContain("sinal_de_risco");
    // only a tag that warns raises the trigger: smart money buying is not a danger
    expect(triggersOf(facts({ riskFlags: ["smartMoneyBuy", "communityRecognized"] }))).not.toContain("sinal_de_risco");
    expect(triggersOf(facts({ riskFlags: ["smartMoneyBuy", "devHoldingStatusSellAll"] }))).toContain("sinal_de_risco");
    expect(triggersOf(facts({ riskLevel: R.riskLevel }))).toContain("sinal_de_risco");
    expect(triggersOf(facts({ sinceEntryPct: R.lossPct }))).toContain("queda_desde_a_entrada");
    expect(triggersOf(facts({ sinceEntryPct: R.lossPct + 0.1 }))).not.toContain("queda_desde_a_entrada");
    expect(triggersOf(facts({ sinceEntryPct: R.gainPct }))).toContain("ganho_a_proteger");
  });

  test("unknown measurements raise nothing: null is not zero and not a danger", () => {
    const unknown = facts({ soldPct: null, exitImpactPct: null, riskLevel: null, sinceEntryPct: null });
    expect(triggersOf(unknown)).toEqual([]);
  });
});

describe("the holdings offered to the model", () => {
  test("cash and a position with no value are not holdings to manage, and are counted; a small one is: there is no dust threshold", () => {
    const b = book([cash(500), pos(), pos({ id: `token:1:${B}`, address: B, symbol: "BBB", usd: 4 }), pos({ id: `token:1:0x3333333333333333333333333333333333333333`, address: "0x3333333333333333333333333333333333333333", usd: null }), pos({ id: `token:1:0x4444444444444444444444444444444444444444`, address: "0x4444444444444444444444444444444444444444", symbol: "ZZZ", usd: 0 })]);
    const out = holdingCandidates(b, () => facts());
    expect(out.candidates.map((c) => c.symbol)).toEqual(["AAA", "BBB"]);
    expect(out.excluded).toEqual({ sem_valor: 2 });
  });

  test("a holding has hold plus the trims the code can carry out, with the dollars the code worked out", () => {
    const out = holdingCandidates(book([cash(500), pos()]), () => facts());
    const c = out.candidates[0]!;
    expect(c.kind).toBe("holding");
    expect(c.id).toBe(`hold:token:1:${A}@agente`);
    expect(c.stances).toEqual(["hold", "trim_third", "trim_half", "exit_all"]);
    expect(c.usdByStance).toEqual({ hold: 0, trim_third: 30, trim_half: 45, exit_all: 90 });
    expect(c.wallet).toBe("agente");
  });

  test("the same token in the two wallets are two candidates, and the principal wallet one is marked", () => {
    const out = holdingCandidates(book([cash(500), pos(), pos({ wallet: "principal", usd: 200 })]), () => facts());
    expect(out.candidates.map((c) => c.id)).toEqual([`hold:token:1:${A}@principal`, `hold:token:1:${A}@agente`]);
    expect(out.candidates[0]!.wallet).toBe("principal");
  });

  test("the biggest positions first and at most the limit; the rest is counted", () => {
    const many = Array.from({ length: HOLDING_RULES.maxHoldings + 3 }, (_, i) => {
      const address = `0x${(i + 16).toString(16).padStart(40, "0")}`;
      return pos({ id: `token:1:${address}`, address, symbol: `T${i}`, usd: 100 + i });
    });
    const out = holdingCandidates(book([cash(500), ...many]), () => facts());
    expect(out.candidates).toHaveLength(HOLDING_RULES.maxHoldings);
    expect(out.candidates[0]!.symbol).toBe(`T${many.length - 1}`);
    expect(out.excluded.fora_do_limite).toBe(3);
  });

  test("facts the provider did not give are carried as null, not invented", () => {
    const out = holdingCandidates(book([cash(500), pos()]), () => null);
    expect(out.candidates[0]!.facts).toBeNull();
    expect(out.candidates[0]!.triggers).toEqual([]);
  });

  test("triggers ride along", () => {
    const out = holdingCandidates(book([cash(500), pos()]), () => facts({ soldPct: 80 }));
    expect(out.candidates[0]!.triggers).toEqual(["carteiras_venderam"]);
  });
});

describe("the balance the buy sizing reads is the agent wallet only", () => {
  test("cash and holdings of the wallet the agent executes in; the principal wallet is out of it", () => {
    const b = book([cash(300), cash(100, "8453"), pos(), pos({ wallet: "principal", usd: 5000 })]);
    const saldo = saldoOf(b, null)!;
    expect(saldo.totalUsd).toBe(490);
    expect(saldo.cashUsd).toBe(400);
    expect(saldo.chains).toEqual([{ chainIndex: "1", cashUsd: 300 }, { chainIndex: "8453", cashUsd: 100 }]);
    expect(saldo.holdings).toEqual([{ chainIndex: "1", address: A, usd: 90 }]);
  });

  test("unknown portfolio value means no balance, so no buy can be sized", () => {
    expect(saldoOf(book([cash(300)], { agentUsd: null }), null)).toBeNull();
  });
});

const eco = (over: Partial<EcoFacts> = {}): EcoFacts => ({ candidateId: `token:1:${B}`, chainIndex: "1", address: B, symbol: "BBB", nota: 70, priceUsd: 1, changePct: 12, volumeUsd: 2_000_000, liquidityUsd: 5_000_000, marketCapUsd: 50_000_000, holders: 5000, buyShare: 0.6, txs: 800, top10Pct: 30, devPct: 2, bundlePct: 3, riskLevel: 1, riskFlags: [], wallets: 4, walletsUsd: 9000, soldPct: 10, ...over });

const HOUR = 3_600_000;
const bars = (closes: readonly number[]): Candle[] => closes.map((close, i) => { const open = i === 0 ? close : closes[i - 1]!; return { startMs: i * HOUR, open, high: Math.max(open, close) * 1.004, low: Math.min(open, close) * 0.996, close, volume: 1, confirmed: true }; });
/** A lively, sideways market (about 2 percent an hour): nothing extended, and every profile fits. */
const calm: TimingFacts = (() => {
  const closes = [100]; for (let i = 1; i < 48; i++) closes.push(closes[i - 1]! * (i % 2 === 1 ? 1.02 : 1 / 1.02));
  return timingFacts(bars(closes))!;
})();
const parabola: TimingFacts = timingFacts(bars(Array.from({ length: 48 }, (_, i) => 100 * 1.025 ** i)))!;
/** The same run-up with the noise of a real token (a smooth exponential has no volatility, so no profile could be sized for it). */
const noisyParabola: TimingFacts = timingFacts(bars(Array.from({ length: 48 }, (_, i) => 100 * 1.025 ** i * (i % 2 === 0 ? 1.012 : 0.988))))!;
/** A lively market that turns down in the last eight hours: the last four hours are under minus six percent. */
const falling: TimingFacts = (() => {
  const closes = [100]; for (let i = 1; i < 48; i++) closes.push(closes[i - 1]! * (i < 40 ? (i % 2 === 1 ? 1.02 : 1 / 1.02) : 0.975));
  return timingFacts(bars(closes))!;
})();
const quiet: TimingFacts = timingFacts(bars(Array.from({ length: 48 }, (_, i) => 100 + (i % 2) * 0.05)))!;

const ALL_PROFILES = ["alvo_2", "alvo_5", "alvo_10", "alvo_20"];
const ALL_STANCES = ["skip", "buy_tenth", "buy_third", "buy_two_thirds", "buy_full"];
const noMomentum = () => null;
/** A candidate of the ecosystem on a given network (the default candidate is BBB on Ethereum mainnet). */
const ecoOn = (chainIndex: string, address: string, symbol: string, over: Partial<EcoFacts> = {}): EcoFacts => eco({ candidateId: `token:${chainIndex}:${address}`, chainIndex, address, symbol, ...over });
/** The ecosystem context purchases are built from: the balance read and one candidate per set of facts. */
const ecoCtx = (saldo: Saldo | null, ...facts: EcoFacts[]) => ({ observedAtMs: 1, saldo, candidates: facts.map((f) => candidateOf(f, saldo)), excluded: {} });
/** The four sizes are the exact fractions of the ceiling of the network (a tenth, a third, two thirds and all of it), with `skip` before them. */
const expectAllSizes = (c: Candidate, ceiling: number) => {
  expect(c.stances).toEqual(ALL_STANCES);
  expect(Object.keys(c.usdByStance)).toEqual(ALL_STANCES);
  expect(c.usdByStance.skip).toBe(0);
  expect(c.usdByStance.buy_tenth).toBeCloseTo(ceiling / 10, 9);
  expect(c.usdByStance.buy_third).toBeCloseTo(ceiling / 3, 9);
  expect(c.usdByStance.buy_two_thirds).toBeCloseTo((ceiling * 2) / 3, 9);
  expect(c.usdByStance.buy_full).toBe(ceiling);
};

describe("purchases come from the ecosystem candidates, sized by the code from the cash of the network", () => {
  test("a purchase is offered skip plus a tenth, a third, two thirds and all of the cash of its network, and keeps the id, symbol and address of the candidate", () => {
    const saldo = saldoOf(book([cash(300)]), 0.1)!;
    const [c] = buyCandidates(ecoCtx(saldo, eco()), () => calm);
    expect(c!.kind).toBe("buy");
    expect(c!.id).toBe(`buy:token:1:${B}`);
    expect(c!.symbol).toBe("BBB");
    expect(c!.chainIndex).toBe("1");
    expect(c!.address).toBe(B);
    expect(c!.wallet).toBe("agente");
    expect(c!.heldUsd).toBe(0);
    expect(c!.stances).toEqual(["skip", "buy_tenth", "buy_third", "buy_two_thirds", "buy_full"]);
    expect(c!.usdByStance).toEqual({ skip: 0, buy_tenth: 30, buy_third: 100, buy_two_thirds: 200, buy_full: 300 });
  });

  test("the sizes are exact fractions of the ceiling: a ceiling of 37.5 gives 3.75, 12.5, 25 and 37.5, and one of 37.12 (a wallet shows whole cents, and 37.125 is cut down to that) gives a tenth, a third and two thirds that are not cut at the cent", () => {
    const saldo = saldoOf(book([cash(37.5)]), null)!;
    const [c] = buyCandidates(ecoCtx(saldo, eco()), () => calm);
    expect(c!.stances).toEqual(ALL_STANCES);
    expect(c!.usdByStance).toEqual({ skip: 0, buy_tenth: 3.75, buy_third: 12.5, buy_two_thirds: 25, buy_full: 37.5 });
    expect(c!.cap!.maxUsd).toBe(37.5);
    const cents = saldoOf(book([cash(37.125)]), null)!;
    const [d] = buyCandidates(ecoCtx(cents, eco()), () => calm);
    expect(d!.cap!.maxUsd).toBe(37.12);
    expect(d!.usdByStance.buy_third).toBeCloseTo(37.12 / 3, 12);
    expect(d!.usdByStance.buy_full).toBe(37.12);
  });

  test("a third and two thirds are not cut at the cent either: 200 dollars of cash give 66.66666666666667 and 133.33333333333334", () => {
    const saldo = saldoOf(book([cash(200)]), null)!;
    const [c] = buyCandidates(ecoCtx(saldo, eco()), () => calm);
    expect(c!.usdByStance).toEqual({ skip: 0, buy_tenth: 20, buy_third: 66.66666666666667, buy_two_thirds: 133.33333333333334, buy_full: 200 });
  });

  test("the ceiling is the cash of the network of each candidate: two networks with different cash give two ceilings, and the order of the candidates is kept", () => {
    const saldo = saldoOf(book([cash(300), cash(100, "8453")]), null)!;
    const [onEthereum, onBase] = buyCandidates(ecoCtx(saldo, eco(), ecoOn("8453", C, "CCC")), () => calm);
    expect(onEthereum!.id).toBe(`buy:token:1:${B}`);
    expect(onBase!.id).toBe(`buy:token:8453:${C}`);
    expect(onBase!.chainIndex).toBe("8453");
    expect(onBase!.address).toBe(C);
    expectAllSizes(onEthereum!, 300);
    expectAllSizes(onBase!, 100);
    expect(onEthereum!.cap).toMatchObject({ maxUsd: 300, binding: "caixa" });
    expect(onBase!.cap).toMatchObject({ maxUsd: 100, binding: "caixa" });
  });

  test("the cap on the record carries the ceiling, what holds it (the cash), its share of the portfolio and the risk share the owner set, and nothing else", () => {
    const saldo = saldoOf(book([cash(300), pos({ usd: 100 })]), 0.02)!;
    const [c] = buyCandidates(ecoCtx(saldo, eco()), () => calm);
    expect(c!.cap).toStrictEqual({ maxUsd: 300, binding: "caixa", sharePct: 0.75, riskPct: 0.02 });
  });

  test("the share of the portfolio at risk sizes nothing: every level of it, and none, gives the same ceiling and the same sizes", () => {
    for (const risk of [null, 0.001, 0.05, 0.2]) {
      const saldo = saldoOf(book([cash(300), pos({ usd: 100 })]), risk)!;
      const [c] = buyCandidates(ecoCtx(saldo, eco()), () => calm);
      expectAllSizes(c!, 300);
      expect(c!.cap).toStrictEqual({ maxUsd: 300, binding: "caixa", sharePct: 0.75, riskPct: risk });
    }
  });

  test("no concentration, reserve, liquidity or volume ceiling: all the cash of the network stays on offer however big the rest of the portfolio, however thin the pool and however small the volume", () => {
    // 50 dollars of cash against 5000 in a holding, half the portfolio asked to be kept as a reserve, a pool of 100 dollars and a volume of 10: none of it lowers the ceiling
    const saldo = saldoOf(book([cash(50), pos({ usd: 5000 })]), null, 0.5)!;
    const [c] = buyCandidates(ecoCtx(saldo, ecoOn("1", B, "BBB", { liquidityUsd: 100, volumeUsd: 10 })), () => calm);
    expectAllSizes(c!, 50);
    expect(c!.cap).toMatchObject({ maxUsd: 50, binding: "caixa" });
  });

  test("a token already held keeps the whole ceiling: what is held is a fact (heldUsd) and not a limit", () => {
    const saldo = saldoOf(book([cash(300), pos({ id: `token:1:${B}`, address: B, symbol: "BBB", usd: 100 })]), null)!;
    const [c] = buyCandidates(ecoCtx(saldo, eco()), () => calm);
    expect(c!.heldUsd).toBe(100);
    expectAllSizes(c!, 300);
  });

  test("a token with a mark of care is sized like any other: the mark rides along as a fact for the model and does not lower the ceiling", () => {
    const saldo = saldoOf(book([cash(300)]), null)!;
    const [c] = buyCandidates(ecoCtx(saldo, eco({ top10Pct: 90 })), () => calm);
    expect(c!.marks).toContain("concentracao");
    expectAllSizes(c!, 300);
  });

  test("every profile has the same ceiling, whatever the volatility of the token: the stop of a profile sizes nothing", () => {
    const saldo = saldoOf(book([cash(300)]), 0.01)!;
    for (const timing of [calm, quiet, noisyParabola, null]) {
      const [c] = buyCandidates(ecoCtx(saldo, eco()), () => timing);
      expect(c!.capByProfile).toEqual({ alvo_2: 300, alvo_5: 300, alvo_10: 300, alvo_20: 300 });
      expect(c!.cap!.maxUsd).toBe(300);
    }
  });

  test("a balance of cents still offers every size: the code has no minimum order, and what a small order costs is a fact for the model", () => {
    const saldo = saldoOf(book([cash(0.5)]), null)!;
    const [c] = buyCandidates(ecoCtx(saldo, eco()), () => calm);
    expectAllSizes(c!, 0.5);
  });
});

describe("the limit the OKX account puts on a transaction bounds the ceiling at 95 percent of itself, and only when that is smaller than the cash", () => {
  test("a limit of 100 dollars under 1000 of cash makes the ceiling 95, named `limite_da_conta`, with the sizes cut from 95", () => {
    const saldo = saldoOf(book([cash(1000)]), 0.1)!;
    const [c] = buyCandidates(ecoCtx(saldo, eco()), () => calm, minBuyUsd, noMomentum, 100);
    expectAllSizes(c!, 95);
    expect(c!.usdByStance).toEqual({ skip: 0, buy_tenth: 9.5, buy_third: 31.666666666666668, buy_two_thirds: 63.333333333333336, buy_full: 95 });
    expect(c!.cap).toMatchObject({ maxUsd: 95, binding: "limite_da_conta", riskPct: 0.1 });
    expect(c!.cap!.sharePct).toBeCloseTo(0.095, 10);
    expect(c!.capByProfile).toEqual({ alvo_2: 95, alvo_5: 95, alvo_10: 95, alvo_20: 95 });
  });

  test("a limit above the cash binds nothing: the cash is the ceiling, and so is it when the provider reported no limit", () => {
    const saldo = saldoOf(book([cash(1000)]), null)!;
    const above = buyCandidates(ecoCtx(saldo, eco()), () => calm, minBuyUsd, noMomentum, 2000)[0]!;
    expect(above.cap).toMatchObject({ maxUsd: 1000, binding: "caixa" });
    expectAllSizes(above, 1000);
    const none = buyCandidates(ecoCtx(saldo, eco()), () => calm, minBuyUsd, noMomentum, null)[0]!;
    expect(none.cap).toMatchObject({ maxUsd: 1000, binding: "caixa" });
    expect(none.usdByStance).toEqual(above.usdByStance);
  });

  test("the limit is read network by network: where the cash is under 95 percent of it, the cash still holds", () => {
    const saldo = saldoOf(book([cash(1000), cash(50, "8453")]), null)!;
    const [onEthereum, onBase] = buyCandidates(ecoCtx(saldo, eco(), ecoOn("8453", C, "CCC")), () => calm, minBuyUsd, noMomentum, 100);
    expect(onEthereum!.cap).toMatchObject({ maxUsd: 95, binding: "limite_da_conta" });
    expect(onBase!.cap).toMatchObject({ maxUsd: 50, binding: "caixa" });
    expectAllSizes(onBase!, 50);
  });

  test("a limit does not conjure cash: with none on the network, `sem_saldo` still holds", () => {
    const saldo = saldoOf(book([cash(500, "8453")]), null)!;
    const [c] = buyCandidates(ecoCtx(saldo, eco()), () => calm, minBuyUsd, noMomentum, 100);
    expect(c!.stances).toEqual(["skip"]);
    expect(c!.cap).toMatchObject({ maxUsd: 0, binding: "sem_saldo" });
  });
});

describe("buying more of a token that already has a plan keeps that plan (the independent review, SF-5)", () => {
  test("the purchase is offered ONLY the profile of the plan the position already has, with the mark `soma_ao_plano`, so that what the Jev chooses is what the code does", () => {
    const saldo = saldoOf(book([cash(500)]), null)!;
    const plans = new Map<string, "alvo_20" | "alvo_2">([[`1:${B}`, "alvo_20"]]);
    const [c] = buyCandidates(ecoCtx(saldo, eco()), () => calm, () => 0, () => null, null, (chainIndex, address) => plans.get(`${chainIndex}:${address.toLowerCase()}`) ?? null);
    expect(c!.profiles).toEqual(["alvo_20"]);
    expect(c!.marks).toContain("soma_ao_plano");
    // every size is still on offer: only the plan is fixed
    expect(c!.stances).toEqual(ALL_STANCES);
  });

  test("a token without a plan keeps the four profiles and no such mark, and a caller that does not know the plans changes nothing", () => {
    const saldo = saldoOf(book([cash(500)]), null)!;
    const [none] = buyCandidates(ecoCtx(saldo, eco()), () => calm, () => 0, () => null, null, () => null);
    expect(none!.profiles).toHaveLength(4);
    expect(none!.marks).not.toContain("soma_ao_plano");
    const [legacy] = buyCandidates(ecoCtx(saldo, eco()), () => calm);
    expect(legacy!.profiles).toHaveLength(4);
  });
});

describe("a purchase with nothing to spend on its network has only skip, and says why", () => {
  test("cash on another network is no ceiling: only skip, a ceiling of zero and the binding `sem_saldo`, with the profiles still named and the ceiling of each at zero", () => {
    const saldo = saldoOf(book([cash(500, "8453")]), 0.01)!;
    const [c] = buyCandidates(ecoCtx(saldo, eco()), () => calm);
    expect(c!.stances).toEqual(["skip"]);
    expect(c!.usdByStance).toEqual({ skip: 0 });
    expect(c!.cap).toStrictEqual({ maxUsd: 0, binding: "sem_saldo", sharePct: 0, riskPct: 0.01 });
    expect(c!.profiles).toEqual(ALL_PROFILES);
    expect(c!.capByProfile).toEqual({ alvo_2: 0, alvo_5: 0, alvo_10: 0, alvo_20: 0 });
  });

  test("a wallet with holdings and no cash at all, and one whose cash on the network is exactly zero, are the same: `sem_saldo`", () => {
    for (const positions of [[pos()], [cash(0), pos()]]) {
      const saldo = saldoOf(book(positions), null)!;
      const [c] = buyCandidates(ecoCtx(saldo, eco()), () => calm);
      expect(c!.stances).toEqual(["skip"]);
      expect(c!.cap).toMatchObject({ maxUsd: 0, binding: "sem_saldo" });
    }
  });

  test("an unknown balance gives only skip and the binding `sem_dado`, never a guess of the cash", () => {
    for (const saldo of [null, saldoOf(book([cash(300)], { agentUsd: null }), null)]) {
      expect(saldo).toBeNull();
      const [c] = buyCandidates(ecoCtx(saldo, eco()), () => calm);
      expect(c!.stances).toEqual(["skip"]);
      expect(c!.usdByStance).toEqual({ skip: 0 });
      expect(c!.cap).toStrictEqual({ maxUsd: 0, binding: "sem_dado", sharePct: null, riskPct: null });
      expect(c!.profiles).toEqual(ALL_PROFILES);
    }
  });
});

describe("the minimum order the caller passes still hides the sizes under it, and the code plans none of its own", () => {
  test("a size whose dollars are under the minimum order is not offered and has no dollars on the record; the sizes above it keep theirs", () => {
    // 40 dollars: a tenth (4) is under 10; a third (13.33), two thirds (26.67) and all (40) are not
    const saldo = saldoOf(book([cash(40)]), null)!;
    const [c] = buyCandidates(ecoCtx(saldo, eco()), () => calm, () => 10);
    expect(c!.stances).toEqual(["skip", "buy_third", "buy_two_thirds", "buy_full"]);
    expect(c!.usdByStance).toEqual({ skip: 0, buy_third: 13.333333333333334, buy_two_thirds: 26.666666666666668, buy_full: 40 });
    expect(c!.usdByStance.buy_tenth).toBeUndefined();
  });

  test("a size exactly at the minimum order is offered", () => {
    const saldo = saldoOf(book([cash(100)]), null)!;
    const [c] = buyCandidates(ecoCtx(saldo, eco()), () => calm, () => 100);
    expect(c!.stances).toEqual(["skip", "buy_full"]);
    expect(c!.usdByStance).toEqual({ skip: 0, buy_full: 100 });
  });

  test("when every size is under the minimum order only skip is left, and the ceiling stays on the record so the block is found and not guessed", () => {
    const saldo = saldoOf(book([cash(5)]), null)!;
    const [c] = buyCandidates(ecoCtx(saldo, eco()), () => calm, () => 10);
    expect(c!.stances).toEqual(["skip"]);
    expect(c!.usdByStance).toEqual({ skip: 0 });
    expect(c!.cap).toMatchObject({ maxUsd: 5, binding: "caixa" });
    // the caller's minimum is not a mark and not a limit the code adds on its own
    expect(c!.cap).not.toHaveProperty("tightest");
    expect(c!.cap).not.toHaveProperty("tightestUsd");
  });

  test("the minimum order is asked of the network of each candidate", () => {
    const saldo = saldoOf(book([cash(100), cash(100, "8453")]), null)!;
    const asked: string[] = [];
    const minByChain = (chainIndex: string) => {
      asked.push(chainIndex);
      return chainIndex === "1" ? 50 : 0;
    };
    const [onEthereum, onBase] = buyCandidates(ecoCtx(saldo, eco(), ecoOn("8453", C, "CCC")), () => calm, minByChain);
    expect(new Set(asked)).toEqual(new Set(["1", "8453"]));
    // 50 on Ethereum hides a tenth (10), a third (33.33) and keeps two thirds (66.67) and all (100); Base has none
    expect(onEthereum!.stances).toEqual(["skip", "buy_two_thirds", "buy_full"]);
    expect(onBase!.stances).toEqual(ALL_STANCES);
  });

  test("no network has a minimum order: the code plans none, whatever the gas of the network, and says what a small order costs only as a fact", () => {
    expect(minBuyUsd("1")).toBe(0);
    expect(minBuyUsd("8453")).toBe(0);
    expect(minBuyUsd("501")).toBe(0);
  });
});

describe("how many purchases each level of risk puts on offer", () => {
  const levels = { cauteloso: 0.005, moderado: 0.01, agressivo: 0.02 };
  const saldo = () => saldoOf(book([cash(100), pos({ usd: 25 })]), 0.005)!;
  // BBB and CCC are on the network where the wallet has cash; DDD (with a mark of care) is on one where it has none
  const ctx = () => ecoCtx(saldo(), ecoOn("1", B, "BBB"), ecoOn("1", C, "CCC"), ecoOn("56", D, "DDD", { top10Pct: 90 }));

  test("the risk of the mandate sizes nothing, so every level opens the same purchases: the ones with something to buy, which the count must match", () => {
    expect(buyCandidates(ctx(), () => calm).filter((c) => c.stances.length > 1).map((c) => c.symbol)).toEqual(["BBB", "CCC"]);
    expect(openByRisk(ctx(), () => calm, minBuyUsd, levels)).toEqual({ cauteloso: 2, moderado: 2, agressivo: 2 });
  });

  test("a missing history closes nothing, so it does not change the count", () => {
    expect(openByRisk(ctx(), () => null, minBuyUsd, levels)).toEqual({ cauteloso: 2, moderado: 2, agressivo: 2 });
  });

  test("the minimum order and the limit of the account the caller passes are applied to the count", () => {
    // every size of 100 dollars of cash is under 1000, so nothing opens at any level
    expect(openByRisk(ctx(), () => calm, () => 1000, levels)).toEqual({ cauteloso: 0, moderado: 0, agressivo: 0 });
    // 1000 of cash and a minimum of 500: all of it (1000) opens one purchase; a limit of 100 holds the ceiling to 95 and nothing reaches 500
    const rich = ecoCtx(saldoOf(book([cash(1000)]), null)!, eco());
    expect(openByRisk(rich, () => calm, () => 500, { cauteloso: 0.005 })).toEqual({ cauteloso: 1 });
    expect(openByRisk(rich, () => calm, () => 500, { cauteloso: 0.005 }, noMomentum, 100)).toEqual({ cauteloso: 0 });
  });

  test("a wallet with no cash, or no balance read, opens nothing at any level; no level asked is no entry", () => {
    const noCash = saldoOf(book([pos()]), 0.005)!;
    expect(openByRisk(ecoCtx(noCash, eco()), () => calm, minBuyUsd, levels)).toEqual({ cauteloso: 0, moderado: 0, agressivo: 0 });
    expect(openByRisk({ ...ctx(), saldo: null }, () => calm, minBuyUsd, { cauteloso: 0.005 })).toEqual({ cauteloso: 0 });
    expect(openByRisk(ctx(), () => calm, minBuyUsd, {})).toEqual({});
  });
});

describe("the history of a token is a fact with a mark for the model, never a closure of the purchase", () => {
  const saldo = () => saldoOf(book([cash(1000)]), 0.1)!;
  const ctx = () => ecoCtx(saldo(), eco());

  test("a sound entry carries every profile, its timing and its families, and none of the marks of care", () => {
    const [c] = buyCandidates(ctx(), () => calm);
    expectAllSizes(c!, 1000);
    expect(c!.profiles).toEqual(ALL_PROFILES);
    expect(c!.timing).toMatchObject({ sigmaHourPct: expect.any(Number) });
    expect(c!.families).toEqual([...candidateOf(eco(), saldo()).families, ...timingFamilies(calm)]);
    for (const mark of ["entrada_esticada", "sem_historico", "historico_curto", "volatilidade_extrema", "sem_perfil_que_caiba"]) expect(c!.marks).not.toContain(mark);
  });

  test("an extended or parabolic price is a FACT for the model, not a closure: every size stays on offer and the marks and the numbers come along (the model judges the top, the code does not)", () => {
    const [c] = buyCandidates(ctx(), () => noisyParabola);
    expectAllSizes(c!, 1000);
    expect(c!.marks).toContain("parabolico");
    expect(c!.marks).not.toContain("entrada_esticada");
    expect(c!.timing).toMatchObject({ runUpPct: expect.any(Number), rsi: expect.any(Number) });
    expect(entryBlocked(timingMarks(noisyParabola))).toBe(true);
  });

  test("a price falling fast is a fact too: every size stays on offer with the mark", () => {
    const [c] = buyCandidates(ctx(), () => falling);
    expect(c!.marks).toContain("caindo");
    expect(c!.marks).not.toContain("entrada_esticada");
    expectAllSizes(c!, 1000);
  });

  test("a token a few hours old is not closed for being young: it carries the mark `historico_curto` and the very same sizes and ceiling as one with a full day of history", () => {
    const closes = Array.from({ length: 12 }, (_, i) => 100 * (i % 2 === 1 ? 1.01 : 1));
    const young: TimingFacts = timingFacts(bars(closes))!;
    expect(young.bars).toBe(12);
    const [y] = buyCandidates(ctx(), () => young);
    expect(y!.marks).toContain("historico_curto");
    expect(y!.marks).not.toContain("sem_historico");
    expectAllSizes(y!, 1000);
    expect(y!.profiles).toEqual(ALL_PROFILES);
    // the same market with a full day of history (calm has 48 bars): no mark, and the same sizes and ceilings
    const [full] = buyCandidates(ctx(), () => calm);
    expect(full!.marks).not.toContain("historico_curto");
    expect(y!.usdByStance).toEqual(full!.usdByStance);
    expect(y!.capByProfile).toEqual(full!.capByProfile);
    expect(y!.cap).toEqual(full!.cap);
  });

  test("a token with no history at all is not closed: it carries the mark `sem_historico` and no timing, and keeps every size and every profile (unknown is a fact, never calm)", () => {
    const [c] = buyCandidates(ctx(), () => null);
    expectAllSizes(c!, 1000);
    expect(c!.profiles).toEqual(ALL_PROFILES);
    expect(c!.capByProfile).toEqual({ alvo_2: 1000, alvo_5: 1000, alvo_10: 1000, alvo_20: 1000 });
    expect(c!.marks).toContain("sem_historico");
    // with no history there is no volatility to call extreme or quiet, and no age to call short
    for (const mark of ["historico_curto", "volatilidade_extrema", "sem_perfil_que_caiba"]) expect(c!.marks).not.toContain(mark);
    expect(c!.timing).toBeNull();
  });

  test("a token so wild that every stop is noise keeps every profile and every size and carries the mark `volatilidade_extrema`: the model weighs the volatility, the code does not close it", () => {
    const wild = timingFacts(bars(Array.from({ length: 48 }, (_, i) => 100 * (i % 2 === 0 ? 1.08 : 0.93) * 1.01 ** i)))!;
    expect(wild.sigmaHourPct!).toBeGreaterThan(4);
    const [c] = buyCandidates(ctx(), () => wild);
    expect(c!.marks).toContain("volatilidade_extrema");
    expect(c!.marks).not.toContain("sem_perfil_que_caiba");
    expect(c!.marks).not.toContain("sem_historico");
    expect(c!.profiles).toEqual(ALL_PROFILES);
    expectAllSizes(c!, 1000);
    // and a token with profiles of its own does not carry the mark
    expect(buyCandidates(ctx(), () => calm)[0]!.marks).not.toContain("volatilidade_extrema");
  });

  test("a market too quiet for any target is NOT closed: it carries the mark `sem_perfil_que_caiba` and keeps every size and every profile", () => {
    expect(quiet.sigmaHourPct!).toBeLessThan(0.5);
    const [c] = buyCandidates(ctx(), () => quiet);
    expect(c!.marks).toContain("sem_perfil_que_caiba");
    expect(c!.marks).not.toContain("volatilidade_extrema");
    expect(c!.marks).not.toContain("sem_historico");
    expect(c!.profiles).toEqual(ALL_PROFILES);
    expectAllSizes(c!, 1000);
    // a market with a profile that fits does not carry the mark
    expect(buyCandidates(ctx(), () => calm)[0]!.marks).not.toContain("sem_perfil_que_caiba");
  });
});

describe("the last hour of a token in five-minute bars, as the code sees it before offering an entry", () => {
  const momentum = (marks: readonly ("estagnado" | "disparando" | "caindo_agora")[]) => ({ bars: 13, ret5mPct: 0.1, ret15mPct: 0.2, ret1hPct: 0.3, rangeHourPct: 0.4, volRatio: 1.1, barAgeMin: 5, marks });
  const context = () => {
    const saldo = saldoOf(book([cash(1000)]), 0.1)!;
    return { observedAtMs: 1, saldo, candidates: [candidateOf(eco(), saldo)], excluded: {} };
  };

  test("a token that did not move all hour keeps its sizes and carries the mark: it earns nothing while it is still, and that is for the model to weigh, not a closure of the code; the view of its minutes comes along", () => {
    const [c] = buyCandidates(context(), () => calm, () => 10, () => momentum(["estagnado"]));
    expect(c!.stances.length).toBeGreaterThan(1);
    expect(c!.marks).toContain("estagnado");
    expect(c!.profiles.length).toBeGreaterThan(0);
    expect(c!.momentum).toMatchObject({ ret15mPct: 0.2, rangeHourPct: 0.4, barAgeMin: 5 });
  });

  test("a token that is racing or dropping keeps its sizes and carries the mark: the model weighs it, the code does not decide", () => {
    const [c] = buyCandidates(context(), () => calm, () => 10, () => momentum(["disparando"]));
    expect(c!.stances.length).toBeGreaterThan(1);
    expect(c!.marks).toContain("disparando");
  });

  test("no data of the minutes is no change at all", () => {
    const base = buyCandidates(context(), () => calm, () => 10);
    const none = buyCandidates(context(), () => calm, () => 10, () => null);
    expect(none).toEqual(base);
    expect(none[0]!.momentum ?? null).toBeNull();
  });
});

describe("the minutes of a holding are an observation, never a sale", () => {
  const view = { bars: 13, ret5mPct: -0.2, ret15mPct: -6, ret1hPct: -7, rangeHourPct: 8, volRatio: 2, barAgeMin: 4, marks: ["caindo_agora"] as const };

  test("they ride with the holding and add their mark to the triggers; the stances offered do not change", () => {
    const b = book([cash(1000), pos()]);
    const plain = holdingCandidates(b, () => facts()).candidates[0]!;
    const withMinutes = holdingCandidates(b, () => facts(), () => null, () => view).candidates[0]!;
    expect(withMinutes.momentum).toMatchObject({ ret15mPct: -6, rangeHourPct: 8 });
    expect(withMinutes.triggers).toContain("caindo_agora");
    expect(withMinutes.stances).toEqual(plain.stances);
    expect(withMinutes.usdByStance).toEqual(plain.usdByStance);
  });

  test("a stagnant holding is NOT offered for sale by that alone: low activity is a fact for the model to weigh", () => {
    const b = book([cash(1000), pos()]);
    const stagnant = holdingCandidates(b, () => facts(), () => null, () => ({ ...view, ret15mPct: 0, rangeHourPct: 0.2, marks: ["estagnado"] as const })).candidates[0]!;
    expect(stagnant.stances).toEqual(holdingCandidates(b, () => facts()).candidates[0]!.stances);
    expect(stagnant.triggers).toContain("estagnado");
  });
});
