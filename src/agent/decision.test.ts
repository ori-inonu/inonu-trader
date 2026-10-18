import { describe, expect, test } from "bun:test";
import { candidateOf, type EcoFacts } from "../opportunity/ecosystem";
import type { Candle } from "../quant/types";
import { buyCandidates, holdingCandidates, saldoOf } from "./candidates";
import { MAX_BUYS_PER_CYCLE, MAX_SELLS_PER_CYCLE, planOrders, validateDecision } from "./decision";
import { timingFacts, type TimingFacts } from "./timing";
import type { Book, Candidate, Decision, HoldingFacts, Posture, Position } from "./types";

const A = "0x1111111111111111111111111111111111111111";
const B = "0x2222222222222222222222222222222222222222";
const C = "0x3333333333333333333333333333333333333333";
const USDC = "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48";
const HOUR = 3_600_000;

const pos = (over: Partial<Position> = {}): Position => ({ id: `token:1:${A}`, chainIndex: "1", address: A, symbol: "AAA", wallet: "agente", usd: 90, balanceMinor: "1000000000000000000", decimals: 18, isCash: false, ...over });
const cash = (usd: number, chainIndex = "1"): Position => ({ id: `token:${chainIndex}:${USDC}`, chainIndex, address: USDC, symbol: "USDC", wallet: "agente", usd, balanceMinor: String(usd * 1e6), decimals: 6, isCash: true });
const book = (positions: Position[]): Book => {
  const cashByChain: Record<string, number> = {};
  for (const p of positions) if (p.isCash && p.wallet === "agente" && p.usd !== null) cashByChain[p.chainIndex] = (cashByChain[p.chainIndex] ?? 0) + p.usd;
  const agentUsd = positions.filter((p) => p.wallet === "agente").reduce((s, p) => s + (p.usd ?? 0), 0);
  return { observedAtMs: 1_000_000, positions, cashByChain, totalUsd: positions.reduce((s, p) => s + (p.usd ?? 0), 0), agentUsd };
};
const facts: HoldingFacts = { priceUsd: 1, sinceEntryPct: null, changeH24Pct: 0, liquidityUsd: 1e6, exitImpactPct: 0.01, volumeH24Usd: 5e5, soldPct: 0, riskLevel: 1, riskFlags: [], heldHours: 10 };
const eco = (address: string, symbol: string, over: Partial<EcoFacts> = {}): EcoFacts => ({ candidateId: `token:1:${address}`, chainIndex: "1", address, symbol, nota: 70, priceUsd: 1, changePct: 12, volumeUsd: 2e6, liquidityUsd: 5e6, marketCapUsd: 5e7, holders: 5000, buyShare: 0.6, txs: 800, top10Pct: 30, devPct: 2, bundlePct: 3, riskLevel: 1, riskFlags: [], wallets: 4, walletsUsd: 9000, soldPct: 10, ...over });

const bars = (closes: readonly number[]): Candle[] => closes.map((close, i) => { const open = i === 0 ? close : closes[i - 1]!; return { startMs: i * HOUR, open, high: Math.max(open, close) * 1.004, low: Math.min(open, close) * 0.996, close, volume: 1, confirmed: true }; });
/** A lively, sideways market (about 2 percent an hour): nothing extended, every profile fits. */
const calm: TimingFacts = (() => {
  const closes = [100];
  for (let i = 1; i < 48; i++) closes.push(closes[i - 1]! * (i % 2 === 1 ? 1.02 : 1 / 1.02));
  return timingFacts(bars(closes))!;
})();

const setup = (positions: Position[], ecoFacts: EcoFacts[] = []) => {
  const b = book(positions);
  const saldo = saldoOf(b, 0.1);
  const holdings = holdingCandidates(b, () => facts).candidates;
  const buys = buyCandidates({ observedAtMs: 1, saldo, candidates: ecoFacts.map((f) => candidateOf(f, saldo)), excluded: {} }, () => calm, () => 10);
  const candidates: Candidate[] = [...holdings, ...buys];
  return { b, saldo, candidates };
};

const allHold = (candidates: readonly Candidate[]) => Object.fromEntries(candidates.map((c) => [c.id, c.kind === "holding" ? "hold" : "skip"]));
/** The answer of the model: the stances, and the first offered profile for every purchase that is not skipped. */
const answer = (posture: string, stances: Record<string, string>, candidates: readonly Candidate[]) => ({
  posture,
  stances,
  profiles: Object.fromEntries(candidates.filter((c) => c.kind === "buy" && stances[c.id] !== "skip").map((c) => [c.id, c.profiles[0]!])),
});
const decision = (posture: Posture, stances: Record<string, string>, candidates: readonly Candidate[]): Decision => {
  const v = validateDecision(answer(posture, stances, candidates), candidates);
  if (!v.ok) throw new Error(`fixture decision refused: ${v.reason}`);
  return v.decision;
};

describe("the protection of a holding the agent did not open is the model's to choose, among the profiles the code offered", () => {
  const { candidates } = setup([cash(1000), pos()], []);
  const held = candidates.find((c) => c.kind === "holding")!;
  const offered: Candidate[] = candidates.map((c) => (c.id === held.id ? { ...c, profiles: ["alvo_5", "alvo_10"] } : c));
  const stances = allHold(offered);

  test("a holding that is kept with a profile that was offered carries that profile out of validation", () => {
    const v = validateDecision({ posture: "neutra", stances, profiles: { [held.id]: "alvo_5" } }, offered);
    expect(v).toMatchObject({ ok: true, decision: { profiles: { [held.id]: "alvo_5" } } });
  });

  test("a profile that was not offered, or none at all, does not spoil the decision: that holding simply has no plan", () => {
    expect(validateDecision({ posture: "neutra", stances, profiles: { [held.id]: "alvo_20" } }, offered)).toMatchObject({ ok: true, decision: { profiles: {} } });
    expect(validateDecision({ posture: "neutra", stances, profiles: {} }, offered)).toMatchObject({ ok: true, decision: { profiles: {} } });
  });

  test("a holding that is being sold gets no plan, however the answer filled the profile in", () => {
    const selling = { ...stances, [held.id]: "exit_all" };
    expect(validateDecision({ posture: "neutra", stances: selling, profiles: { [held.id]: "alvo_5" } }, offered)).toMatchObject({ ok: true, decision: { profiles: {} } });
  });
});

describe("the answer of the model is checked against what the code offered", () => {
  const { candidates } = setup([cash(1000), pos()], [eco(B, "BBB")]);

  test("a complete, offered answer passes", () => {
    expect(validateDecision(answer("neutra", allHold(candidates), candidates), candidates)).toEqual({ ok: true, decision: { posture: "neutra", mandate: null, stances: allHold(candidates), profiles: {} } });
  });

  test("shape, posture and keys", () => {
    expect(validateDecision(null, candidates)).toEqual({ ok: false, reason: "agente_forma" });
    expect(validateDecision({ posture: "neutra" }, candidates)).toEqual({ ok: false, reason: "agente_forma" });
    expect(validateDecision({ posture: "neutra", stances: allHold(candidates), profiles: 5 }, candidates)).toEqual({ ok: false, reason: "agente_forma" });
    expect(validateDecision(answer("louca", allHold(candidates), candidates), candidates)).toEqual({ ok: false, reason: "agente_postura" });
    expect(validateDecision(answer("neutra", { ...allHold(candidates), extra: "hold" }, candidates), candidates)).toEqual({ ok: false, reason: "agente_estados" });
    const missing = allHold(candidates);
    delete missing[candidates[0]!.id];
    expect(validateDecision(answer("neutra", missing, candidates), candidates)).toEqual({ ok: false, reason: "agente_estados" });
  });

  test("a stance the code did not offer is refused, even if it is a real stance", () => {
    const hold = candidates.find((c) => c.kind === "holding")!;
    const buy = candidates.find((c) => c.kind === "buy")!;
    expect(validateDecision(answer("neutra", { ...allHold(candidates), [hold.id]: "buy_full" }, candidates), candidates)).toEqual({ ok: false, reason: "agente_postura_invalida" });
    expect(validateDecision(answer("neutra", { ...allHold(candidates), [buy.id]: "exit_all" }, candidates), candidates)).toEqual({ ok: false, reason: "agente_postura_invalida" });
    expect(validateDecision(answer("neutra", { ...allHold(candidates), [buy.id]: "buy_100000" }, candidates), candidates)).toEqual({ ok: false, reason: "agente_postura_invalida" });
  });

  test("the posture the Jev declares is recorded and limits nothing: a size, and any number of purchases, stand as chosen under every posture (the owner's decision of 2026-10-14)", () => {
    const buy = candidates.find((c) => c.kind === "buy")!;
    expect(buy.stances).toEqual(["skip", "buy_tenth", "buy_third", "buy_two_thirds", "buy_full"]);
    for (const posture of ["defensiva", "neutra", "ofensiva"] as const) {
      for (const stance of ["buy_tenth", "buy_third", "buy_two_thirds", "buy_full"] as const) {
        const v = validateDecision(answer(posture, { ...allHold(candidates), [buy.id]: stance }, candidates), candidates);
        expect(v).toMatchObject({ ok: true, decision: { posture, stances: { [buy.id]: stance } } });
        if (v.ok) expect(v.decision.limited).toBeUndefined();
      }
    }
    const two = setup([cash(1000), pos()], [eco(B, "BBB"), eco(C, "CCC")]).candidates;
    const buys = two.filter((c) => c.kind === "buy");
    const stances = { ...allHold(two), [buys[0]!.id]: "buy_third", [buys[1]!.id]: "buy_third" };
    expect(validateDecision(answer("defensiva", stances, two), two)).toMatchObject({ ok: true, decision: { stances: { [buys[0]!.id]: "buy_third", [buys[1]!.id]: "buy_third" } } });
  });

  test("a defensive posture may still sell", () => {
    const hold = candidates.find((c) => c.kind === "holding")!;
    expect(validateDecision(answer("defensiva", { ...allHold(candidates), [hold.id]: "exit_all" }, candidates), candidates).ok).toBe(true);
  });

  test("the same token cannot be sold and bought in one cycle", () => {
    const both = setup([cash(1000), pos()], [eco(A, "AAA")]).candidates;
    const hold = both.find((c) => c.kind === "holding")!;
    const buy = both.find((c) => c.kind === "buy")!;
    expect(buy.stances).toContain("buy_third");
    expect(validateDecision(answer("ofensiva", { ...allHold(both), [hold.id]: "trim_half", [buy.id]: "buy_third" }, both), both)).toEqual({ ok: false, reason: "agente_compra_e_venda" });
    // adding to a holding while leaving it is fine
    expect(validateDecision(answer("ofensiva", { ...allHold(both), [buy.id]: "buy_third" }, both), both).ok).toBe(true);
  });
});

describe("every purchase goes with a profile of target and stop that the code offered", () => {
  const { candidates } = setup([cash(1000), pos()], [eco(B, "BBB")]);
  const buy = candidates.find((c) => c.kind === "buy")!;
  const stances = { ...allHold(candidates), [buy.id]: "buy_third" };

  test("a purchase without a profile is refused", () => {
    expect(validateDecision({ posture: "ofensiva", stances }, candidates)).toEqual({ ok: false, reason: "agente_perfil_invalido" });
    expect(validateDecision({ posture: "ofensiva", stances, profiles: {} }, candidates)).toEqual({ ok: false, reason: "agente_perfil_invalido" });
  });

  test("a profile that does not exist, or that was not offered, is refused", () => {
    expect(validateDecision({ posture: "ofensiva", stances, profiles: { [buy.id]: "alvo_1000" } }, candidates)).toEqual({ ok: false, reason: "agente_perfil_invalido" });
    const narrowed = candidates.map((c) => (c.id === buy.id ? { ...c, profiles: ["alvo_5"] } : c));
    expect(validateDecision({ posture: "ofensiva", stances, profiles: { [buy.id]: "alvo_20" } }, narrowed)).toEqual({ ok: false, reason: "agente_perfil_invalido" });
    expect(validateDecision({ posture: "ofensiva", stances, profiles: { [buy.id]: "alvo_5" } }, narrowed).ok).toBe(true);
  });

  test("the decision keeps the profile of each purchase, and a skipped purchase needs none", () => {
    const v = validateDecision({ posture: "ofensiva", stances, profiles: { [buy.id]: "alvo_10" } }, candidates);
    expect(v).toMatchObject({ ok: true, decision: { profiles: { [buy.id]: "alvo_10" } } });
    expect(validateDecision({ posture: "ofensiva", stances: allHold(candidates), profiles: { [buy.id]: "alvo_10" } }, candidates)).toMatchObject({ ok: true, decision: { profiles: {} } });
  });
});

describe("the plan: the code works out every order", () => {
  test("sells come first, with the amount in minor units; buys after, in dollars, with their profile", () => {
    const { b, saldo, candidates } = setup([cash(1000), pos()], [eco(B, "BBB")]);
    const hold = candidates.find((c) => c.kind === "holding")!;
    const buy = candidates.find((c) => c.kind === "buy")!;
    const d = decision("ofensiva", { ...allHold(candidates), [hold.id]: "trim_third", [buy.id]: "buy_third" }, candidates);
    const plan = planOrders(d, candidates, b, saldo, () => 10);
    expect(plan.orders.map((o) => o.side)).toEqual(["sell", "buy"]);
    expect(plan.orders[0]).toMatchObject({ candidateId: hold.id, side: "sell", amountMinor: "333333333333333333", usd: 30, wallet: "agente", address: A, profile: null, source: "modelo" });
    expect(plan.orders[1]).toMatchObject({ candidateId: buy.id, side: "buy", amountMinor: null, address: B, wallet: "agente", profile: buy.profiles[0], source: "modelo" });
    // exactly what was offered for the size the Jev chose: a third of the cash of the network, not rounded and not made smaller
    expect(plan.orders[1]!.usd).toBe(buy.usdByStance.buy_third!);
    expect(plan.orders[1]!.usd).toBeCloseTo(1000 / 3, 9);
  });

  test("the profile the Jev picks (its stop and target) does not size the purchase: the size is the fraction it chose of the executable maximum, whatever the profile", () => {
    const b = book([cash(100), pos({ usd: 25 })]);
    const saldo = saldoOf(b, 0.01);
    const holdings = holdingCandidates(b, () => facts).candidates;
    const buys = buyCandidates({ observedAtMs: 1, saldo, candidates: [candidateOf(eco(B, "BBB"), saldo)], excluded: {} }, () => calm, () => 0);
    const candidates: Candidate[] = [...holdings, ...buys];
    const buy = buys[0]!;
    expect(new Set(Object.values(buy.capByProfile!))).toEqual(new Set([100]));
    const base = decision("ofensiva", { ...allHold(candidates), [buy.id]: "buy_full" }, candidates);
    for (const profile of ["alvo_2", "alvo_5", "alvo_10", "alvo_20"]) {
      const plan = planOrders({ ...base, profiles: { [buy.id]: profile } }, candidates, b, saldo, () => 0);
      expect(plan.orders[0]).toMatchObject({ side: "buy", usd: 100, profile });
    }
  });

  test("a size that fits is carried out whole, including a fraction of a cent (a third of 37.5 is exact, a third of 37.12 is not cut), and one that does not fit the cash of the network is refused with a name, never made smaller", () => {
    const b = book([cash(37.5)]);
    const saldo = saldoOf(b, 0.01);
    const buys = buyCandidates({ observedAtMs: 1, saldo, candidates: [candidateOf(eco(B, "BBB"), saldo)], excluded: {} }, () => calm, () => 0);
    const buy = buys[0]!;
    expect(buy.usdByStance).toEqual({ skip: 0, buy_tenth: 3.75, buy_third: 12.5, buy_two_thirds: 25, buy_full: 37.5 });
    const base = decision("ofensiva", { [buy.id]: "buy_full" }, buys);
    expect(planOrders(base, buys, b, saldo, () => 0).orders.map((o) => o.usd)).toEqual([37.5]);
    // the cash on the network changed after the sizes were offered: what was chosen no longer fits, and nothing smaller is put in its place
    const spent = { ...saldo!, chains: saldo!.chains.map((c) => ({ ...c, cashUsd: 30 })), cashUsd: 30 };
    const plan = planOrders(base, buys, b, spent, () => 0);
    expect(plan.orders).toEqual([]);
    expect(plan.dropped).toEqual([{ candidateId: buy.id, reason: "caixa_insuficiente" }]);
  });

  test("everything held or skipped makes no order", () => {
    const { b, saldo, candidates } = setup([cash(1000), pos()], [eco(B, "BBB")]);
    const plan = planOrders(decision("neutra", allHold(candidates), candidates), candidates, b, saldo, () => 10);
    expect(plan.orders).toEqual([]);
    expect(plan.dropped).toEqual([]);
  });

  test("a sale from the principal wallet is only prepared, never an order of the agent", () => {
    const { b, saldo, candidates } = setup([cash(100), pos({ wallet: "principal", usd: 300 })]);
    const hold = candidates.find((c) => c.kind === "holding")!;
    const plan = planOrders(decision("neutra", { ...allHold(candidates), [hold.id]: "trim_half" }, candidates), candidates, b, saldo, () => 10);
    expect(plan.orders).toHaveLength(1);
    expect(plan.orders[0]).toMatchObject({ side: "sell", wallet: "principal", usd: 150 });
  });

  test("purchases share the cash of their network: the one the Jev ranked first stands whole, the one that no longer fits is refused with a name and is not scaled down", () => {
    const { b, saldo, candidates } = setup([cash(200)], [eco(B, "BBB"), eco(C, "CCC")]);
    const buys = candidates.filter((c) => c.kind === "buy");
    const plan = planOrders(decision("ofensiva", Object.fromEntries(buys.map((c) => [c.id, "buy_full"])), candidates), candidates, b, saldo, () => 0);
    // each wanted all of the 200 dollars of cash: the first has it whole, the second finds nothing left
    expect(plan.orders.map((o) => [o.candidateId, o.usd])).toEqual([[buys[0]!.id, 200]]);
    expect(plan.dropped).toEqual([{ candidateId: buys[1]!.id, reason: "caixa_insuficiente" }]);
    // two sizes that together fit are both carried out exactly
    const fit = planOrders(decision("ofensiva", { [buys[0]!.id]: "buy_third", [buys[1]!.id]: "buy_third" }, candidates), candidates, b, saldo, () => 0);
    expect(fit.orders.map((o) => o.usd)).toEqual([200 / 3, 200 / 3]);
    expect(fit.dropped).toEqual([]);
  });

  test("at most a few orders per cycle, the biggest sales first; the rest is dropped and said so", () => {
    const many = Array.from({ length: MAX_SELLS_PER_CYCLE + 2 }, (_, i) => {
      const address = `0x${(i + 32).toString(16).padStart(40, "0")}`;
      return pos({ id: `token:1:${address}`, address, symbol: `T${i}`, usd: 100 + i * 10 });
    });
    const { b, saldo, candidates } = setup([cash(1000), ...many]);
    const holdings = candidates.filter((c) => c.kind === "holding");
    const plan = planOrders(decision("defensiva", Object.fromEntries(holdings.map((c) => [c.id, "exit_all"])), candidates), candidates, b, saldo, () => 10);
    expect(plan.orders).toHaveLength(MAX_SELLS_PER_CYCLE);
    expect(plan.orders[0]!.usd).toBeGreaterThanOrEqual(plan.orders[plan.orders.length - 1]!.usd);
    expect(plan.dropped).toHaveLength(2);
    expect(plan.dropped.every((d) => d.reason === "limite_de_ordens")).toBe(true);
  });

  test("buys are limited too", () => {
    expect(MAX_BUYS_PER_CYCLE).toBeGreaterThanOrEqual(1);
    const { b, saldo, candidates } = setup([cash(5000)], [eco(B, "BBB"), eco(C, "CCC"), eco("0x4444444444444444444444444444444444444444", "DDD")]);
    const buys = candidates.filter((c) => c.kind === "buy");
    const plan = planOrders(decision("ofensiva", Object.fromEntries(buys.map((c) => [c.id, "buy_third"])), candidates), candidates, b, saldo, () => 10);
    expect(plan.orders.filter((o) => o.side === "buy").length).toBeLessThanOrEqual(MAX_BUYS_PER_CYCLE);
    expect(plan.dropped.some((d) => d.reason === "limite_de_ordens")).toBe(true);
  });

  test("an unknown balance sizes no purchase", () => {
    const { b, candidates } = setup([cash(1000)], [eco(B, "BBB")]);
    const buy = candidates.find((c) => c.kind === "buy")!;
    const plan = planOrders(decision("ofensiva", { ...allHold(candidates), [buy.id]: "buy_third" }, candidates), candidates, b, null, () => 10);
    expect(plan.orders).toEqual([]);
    expect(plan.dropped).toEqual([{ candidateId: buy.id, reason: "sem_saldo" }]);
  });
});
