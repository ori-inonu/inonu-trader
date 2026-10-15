// The decision of the ecosystem: what the code accepts of the model's closed answers and how it turns them into picks with dollars. origin: synthetic_fixture, tests only. No network, no model.
import { describe, expect, test } from "bun:test";
import {
  briefItem, candidateOf, enters, familiesOf, isSaldoFresh, marksOf, NO_FAMILY, offeredStances, parseSaldo, SALDO_MAX_AGE_MS, validateEcosystem,
  type EcoContext, type EcoFacts, type Saldo,
} from "./ecosystem";

const SOL = "So11111111111111111111111111111111111111112";
const USDC_HOLDER = "0xAbCdEf0123456789aBcDeF0123456789AbCdEf01";

const facts = (id: string, over: Partial<EcoFacts> = {}): EcoFacts => ({
  candidateId: `token:8453:${id}`, chainIndex: "8453", address: id, symbol: id.slice(-4).toUpperCase(), nota: 70, priceUsd: 0.5, changePct: 8, volumeUsd: 3_000_000, liquidityUsd: 900_000, marketCapUsd: 20_000_000,
  holders: 4_000, buyShare: 0.62, txs: 800, top10Pct: 22, devPct: 2, bundlePct: 3, riskLevel: 1, riskFlags: [], wallets: 4, walletsUsd: 60_000, soldPct: 20, ...over,
});

const saldo = (over: Partial<Saldo> = {}): Saldo => ({
  observedAtMs: 1_000_000, totalUsd: 10_000, cashUsd: 5_000, chains: [{ chainIndex: "8453", cashUsd: 3_000 }, { chainIndex: "56", cashUsd: 2_000 }], holdings: [], riskPct: null, ...over,
});

const ctxOf = (list: EcoFacts[], s: Saldo | null = saldo()): EcoContext => ({ observedAtMs: 1_000_000, saldo: s, candidates: list.map((f) => candidateOf(f, s)), excluded: { honeypot: 1 } });

test("RAD-01: a model-ranked watch survives without saldo and never becomes a purchase", () => {
  const context = ctxOf([facts("a"), facts("b")], null);
  const verdict = validateEcosystem({ stances: { "token:8453:a": "watch", "token:8453:b": "skip" }, drivers: { "token:8453:a": "fluxo", "token:8453:b": NO_FAMILY }, order: ["token:8453:a", "none", "none"] }, context);
  expect(verdict.ok).toBe(true);
  if (!verdict.ok) throw new Error(verdict.reason);
  expect(verdict.result.picks).toEqual([]);
  expect(verdict.result.saldo).toBeNull();
  expect(verdict.result.decisions).toEqual([
    { candidateId: "token:8453:a", chainIndex: "8453", address: "a", symbol: "A", stance: "watch", rank: 1, driver: "fluxo", families: context.candidates[0]!.families, marks: context.candidates[0]!.marks, facts: context.candidates[0]!.facts },
    { candidateId: "token:8453:b", chainIndex: "8453", address: "b", symbol: "B", stance: "skip", rank: null, driver: null, families: context.candidates[1]!.families, marks: context.candidates[1]!.marks, facts: context.candidates[1]!.facts },
  ]);
  expect(verdict.result.decisions!.every((decision) => !("usd" in decision) && !("size" in decision))).toBe(true);
});

test("RAD-02: global watch/buy priorities retain model slots while legacy purchases keep contiguous ranks and caps", () => {
  const context = ctxOf([facts("a"), facts("b"), facts("c"), facts("d")]);
  const stances = { "token:8453:a": "buy_full", "token:8453:b": "watch", "token:8453:c": "buy_third", "token:8453:d": "buy_two_thirds" };
  const drivers = { "token:8453:a": "liquidez", "token:8453:b": "fluxo", "token:8453:c": NO_FAMILY, "token:8453:d": "tracao" };
  const verdict = validateEcosystem({ stances, drivers, order: ["token:8453:b", "token:8453:c", "token:8453:a"] }, context);
  expect(verdict.ok).toBe(true);
  if (!verdict.ok) throw new Error(verdict.reason);
  expect(verdict.result.decisions!.map((d) => [d.candidateId, d.stance, d.rank])).toEqual([["token:8453:a", "buy_full", 3], ["token:8453:b", "watch", 1], ["token:8453:c", "buy_third", 2], ["token:8453:d", "buy_two_thirds", null]]);
  expect(verdict.result.picks.map((p) => [p.candidateId, p.rank])).toEqual([["token:8453:c", 1], ["token:8453:a", 2]]);
  for (const pick of verdict.result.picks) expect(pick.usd).toBeLessThanOrEqual(pick.capUsd);
  const legacy = validateEcosystem({ stances, drivers, order: ["token:8453:c", "token:8453:a", "none"] }, context);
  if (!legacy.ok) throw new Error(legacy.reason);
  expect(verdict.result.picks).toEqual(legacy.result.picks);
});

test("RAD-02: an invalid family is refused for an unranked stance as well as a ranked watch", () => {
  const context = ctxOf([facts("a", { wallets: null })], null);
  for (const order of [["none", "none", "none"], ["token:8453:a", "none", "none"]]) {
    expect(validateEcosystem({ stances: { "token:8453:a": "watch" }, drivers: { "token:8453:a": "carteiras" }, order }, context)).toEqual({ ok: false, reason: "ecossistema_motivo_invalido" });
  }
  for (const order of [["token:8453:a", "token:8453:a", "none"], ["token:8453:unknown", "none", "none"], [1, "none", "none"], ["token:8453:a", "none"]]) {
    expect(validateEcosystem({ stances: { "token:8453:a": "watch" }, drivers: { "token:8453:a": NO_FAMILY }, order }, context).ok).toBe(false);
  }
});

describe("the families of evidence", () => {
  test("a candidate with everything in its favour has all six, and each has its own limit", () => {
    expect(familiesOf(facts("0xaaaa"))).toEqual(["carteiras", "fluxo", "liquidez", "distribuicao", "tracao", "seguranca"]);
    expect(familiesOf(facts("a", { wallets: 1 }))).not.toContain("carteiras");
    expect(familiesOf(facts("a", { soldPct: 61 }))).not.toContain("carteiras");
    expect(familiesOf(facts("a", { txs: 99 }))).not.toContain("fluxo");
    expect(familiesOf(facts("a", { buyShare: 0.54 }))).not.toContain("fluxo");
    expect(familiesOf(facts("a", { liquidityUsd: 249_000 }))).not.toContain("liquidez");
    expect(familiesOf(facts("a", { top10Pct: 31 }))).not.toContain("distribuicao");
    expect(familiesOf(facts("a", { devPct: 6 }))).not.toContain("distribuicao");
    expect(familiesOf(facts("a", { changePct: 2.9 }))).not.toContain("tracao");
    expect(familiesOf(facts("a", { volumeUsd: 90_000 }))).not.toContain("tracao");
    expect(familiesOf(facts("a", { riskLevel: 2 }))).not.toContain("seguranca");
    expect(familiesOf(facts("a", { riskFlags: ["x"] }))).not.toContain("seguranca");
    // the favourable tags do not take the family of safety away
    expect(familiesOf(facts("a", { riskFlags: ["smartMoneyBuy"] }))).toContain("seguranca");
    expect(familiesOf(facts("a", { riskFlags: ["devHoldingStatusSellAll"] }))).not.toContain("seguranca");
  });

  test("a value the provider did not give is not a family in favour, and is never a zero", () => {
    const empty = facts("a", { nota: null, changePct: null, volumeUsd: null, liquidityUsd: null, holders: null, buyShare: null, txs: null, top10Pct: null, riskLevel: null, wallets: null, soldPct: null });
    expect(familiesOf(empty)).toEqual([]);
    expect(marksOf(empty)).toEqual([]);
    expect(enters(empty)).toBe(false);
  });
});

describe("the marks of care", () => {
  test("each has its own limit and its own code", () => {
    expect(marksOf(facts("a"))).toEqual([]);
    expect(marksOf(facts("a", { top10Pct: 50 }))).toEqual(["concentracao"]);
    expect(marksOf(facts("a", { devPct: 10 }))).toEqual(["criador"]);
    expect(marksOf(facts("a", { bundlePct: 20 }))).toEqual(["bundlers"]);
    expect(marksOf(facts("a", { liquidityUsd: 49_000 }))).toEqual(["liquidez_baixa"]);
    expect(marksOf(facts("a", { holders: 299 }))).toEqual(["poucos_detentores"]);
    expect(marksOf(facts("a", { riskLevel: 4 }))).toEqual(["risco_alto"]);
    expect(marksOf(facts("a", { riskFlags: ["f"] }))).toEqual(["sinal_de_risco"]);
    // a tag in favour (smart money buying, recognised by the community) is not a sign of risk; a tag that warns is, in the same list
    expect(marksOf(facts("a", { riskFlags: ["smartMoneyBuy", "communityRecognized"] }))).toEqual([]);
    expect(marksOf(facts("a", { riskFlags: ["smartMoneyBuy", "lowLiquidity"] }))).toEqual(["sinal_de_risco"]);
  });

  test("a candidate is offered only with a pool people can leave and enough holders", () => {
    expect(enters(facts("a"))).toBe(true);
    expect(enters(facts("a", { liquidityUsd: 19_999 }))).toBe(false);
    expect(enters(facts("a", { holders: 99 }))).toBe(false);
  });
});

describe("the balance the page sends", () => {
  const ok = { observedAtMs: 5, totalUsd: 1_000, cashUsd: 300, chains: [{ chainIndex: "1", cashUsd: 200 }, { chainIndex: "501", cashUsd: 100 }], holdings: [{ chainIndex: "1", address: USDC_HOLDER, usd: 50 }, { chainIndex: "501", address: SOL, usd: 20 }, { chainIndex: "1", address: "native", usd: 10 }], riskPct: 0.02 };

  test("a closed schema: numbers and public token addresses, kept the way the code keeps them", () => {
    const parsed = parseSaldo(ok)!;
    expect(parsed.holdings.map((h) => h.address)).toEqual([USDC_HOLDER.toLowerCase(), SOL, "native"]);
    expect(parsed.riskPct).toBe(0.02);
    expect(parseSaldo({ ...ok, riskPct: null })!.riskPct).toBeNull();
  });

  test("anything out of shape is no balance, and sizing on a wrong one is refused", () => {
    expect(parseSaldo(null)).toBeNull();
    expect(parseSaldo({ ...ok, extra: 1 })).toBeNull();
    expect(parseSaldo({ ...ok, totalUsd: -1 })).toBeNull();
    expect(parseSaldo({ ...ok, totalUsd: Number.NaN })).toBeNull();
    // more cash than portfolio, and more cash on the networks than overall
    expect(parseSaldo({ ...ok, cashUsd: 2_000 })).toBeNull();
    expect(parseSaldo({ ...ok, chains: [{ chainIndex: "1", cashUsd: 400 }] })).toBeNull();
    expect(parseSaldo({ ...ok, chains: [{ chainIndex: "1", cashUsd: 100 }, { chainIndex: "1", cashUsd: 100 }] })).toBeNull();
    expect(parseSaldo({ ...ok, holdings: [{ chainIndex: "1", address: "not an address", usd: 5 }] })).toBeNull();
    expect(parseSaldo({ ...ok, holdings: [{ chainIndex: "501", address: USDC_HOLDER, usd: 5 }] })).toBeNull();
    expect(parseSaldo({ ...ok, riskPct: 0.9 })).toBeNull();
    expect(parseSaldo({ ...ok, riskPct: 0 })).toBeNull();
    expect(parseSaldo({ ...ok, holdings: Array.from({ length: 41 }, () => ({ chainIndex: "1", address: "native", usd: 1 })) })).toBeNull();
    // a wallet address has no place in it, whatever the key
    expect(parseSaldo({ ...ok, wallet: USDC_HOLDER })).toBeNull();
  });

  test("it is fresh for two minutes, and not from the future", () => {
    const s = parseSaldo(ok)!;
    expect(isSaldoFresh(s, 5 + SALDO_MAX_AGE_MS)).toBe(true);
    expect(isSaldoFresh(s, 5 + SALDO_MAX_AGE_MS + 1)).toBe(false);
    expect(isSaldoFresh(s, 0)).toBe(true);
    expect(isSaldoFresh(s, -10_000)).toBe(false);
  });
});

describe("the ceiling of a candidate, from the balance", () => {
  test("is the code's own: the cash of its network, what is already held, its liquidity", () => {
    const c = candidateOf(facts("0xaaaa"), saldo());
    expect(c.cap).toMatchObject({ maxUsd: 200, binding: "risco" });
    expect(offeredStances(c)).toEqual(["skip", "watch", "buy_third", "buy_two_thirds", "buy_full"]);
    // a network where the person holds no cash: no size is offered, only to skip or to watch
    const none = candidateOf(facts("0xbbbb", { chainIndex: "137", candidateId: "token:137:0xbbbb" }), saldo());
    expect(none.cap).toMatchObject({ maxUsd: 0, binding: "sem_saldo" });
    expect(offeredStances(none)).toEqual(["skip", "watch"]);
  });

  test("what is already held counts, on the same network and the same token only", () => {
    const held = saldo({ holdings: [{ chainIndex: "8453", address: "0xaaaa", usd: 150 }, { chainIndex: "56", address: "0xaaaa", usd: 999 }] });
    const c = candidateOf(facts("0xaaaa"), held);
    expect(c.heldUsd).toBe(150);
    expect(c.cap.maxUsd).toBe(50);
  });

  test("without a balance nothing can be sized, and the model is told so", () => {
    const c = candidateOf(facts("0xaaaa"), null);
    expect(c.cap).toEqual({ maxUsd: 0, binding: "sem_dado", sharePct: null });
    expect(briefItem(c, null).x).toBeNull();
  });
});

describe("what the code accepts of the model", () => {
  const a = facts("0xaaaa");
  const b = facts("0xbbbb", { chainIndex: "56", candidateId: "token:56:0xbbbb" });
  const c = facts("0xcccc");
  const ctx = ctxOf([a, b, c]);
  const answer = (over: Record<string, unknown> = {}) => ({
    stances: { [a.candidateId]: "buy_two_thirds", [b.candidateId]: "buy_third", [c.candidateId]: "skip" },
    order: [a.candidateId, b.candidateId, "none"],
    drivers: { [a.candidateId]: "carteiras", [b.candidateId]: NO_FAMILY, [c.candidateId]: NO_FAMILY },
    ...over,
  });

  test("a coherent answer becomes picks in the order the model gave, with dollars from the cash of each network", () => {
    const verdict = validateEcosystem(answer(), ctx);
    expect(verdict.ok).toBe(true);
    if (!verdict.ok) return;
    const [first, second] = verdict.result.picks;
    expect(first).toMatchObject({ rank: 1, candidateId: a.candidateId, size: "buy_two_thirds", usd: 133, capUsd: 200, driver: "carteiras", scaled: false });
    expect(second).toMatchObject({ rank: 2, candidateId: b.candidateId, size: "buy_third", usd: 66, driver: null });
    expect(verdict.result.picks).toHaveLength(2);
    expect(verdict.result.considered).toBe(3);
    expect(verdict.result.excluded).toEqual({ honeypot: 1 });
    expect(verdict.result.saldo).toEqual({ totalUsd: 10_000, cashUsd: 5_000 });
    expect(first!.families).toEqual(["carteiras", "fluxo", "liquidez", "distribuicao", "tracao", "seguranca"]);
  });

  test("nothing worth it is a valid answer: no picks", () => {
    const verdict = validateEcosystem(answer({ stances: { [a.candidateId]: "watch", [b.candidateId]: "skip", [c.candidateId]: "skip" }, order: ["none", "none", "none"] }), ctx);
    expect(verdict).toMatchObject({ ok: true, result: { picks: [] } });
  });

  test("a buy that was not ranked is not a pick: the model's ranking is the list", () => {
    const verdict = validateEcosystem(answer({ order: [a.candidateId, "none", "none"] }), ctx);
    expect(verdict.ok && verdict.result.picks.map((p) => p.candidateId)).toEqual([a.candidateId]);
  });

  test("the cash is spent in the order of the ranking and the total never passes it", () => {
    const poor = ctxOf([a, facts("0xdddd")], saldo({ chains: [{ chainIndex: "8453", cashUsd: 250 }], cashUsd: 250, totalUsd: 1_000, riskPct: 0.05 }));
    const d = poor.candidates[1]!.facts.candidateId;
    const verdict = validateEcosystem({ stances: { [a.candidateId]: "buy_full", [d]: "buy_full" }, order: [a.candidateId, d, "none"], drivers: {} }, poor);
    expect(verdict.ok).toBe(true);
    if (!verdict.ok) return;
    // 250 of cash, 200 of it is the reserve of a 1,000 portfolio: 50 may be spent in all, the first takes it and the second is left with nothing
    expect(verdict.result.picks.map((p) => p.usd)).toEqual([50, 0]);
    expect(verdict.result.picks.map((p) => p.scaled)).toEqual([false, true]);
    expect(verdict.result.picks.reduce((s, p) => s + p.usd, 0)).toBeLessThanOrEqual(50);
  });

  test("anything that is not one of the offered options is refused, with a constant reason", () => {
    const reason = (raw: unknown) => {
      const v = validateEcosystem(raw, ctx);
      return v.ok ? "ok" : v.reason;
    };
    expect(reason(null)).toBe("ecossistema_forma");
    expect(reason({ ...answer(), order: [a.candidateId] })).toBe("ecossistema_forma");
    expect(reason(answer({ stances: { [a.candidateId]: "buy_third" } }))).toBe("ecossistema_estados");
    expect(reason(answer({ stances: { [a.candidateId]: "buy_everything", [b.candidateId]: "skip", [c.candidateId]: "skip" } }))).toBe("ecossistema_postura_invalida");
    expect(reason(answer({ order: ["token:1:0xnope", "none", "none"] }))).toBe("ecossistema_ordem_invalida");
    expect(reason(answer({ order: [a.candidateId, a.candidateId, "none"] }))).toBe("ecossistema_ordem_invalida");
    expect(reason(answer({ order: [c.candidateId, "none", "none"] }))).toBe("ecossistema_ordem_incoerente");
    expect(reason(answer({ drivers: { [a.candidateId]: "numerologia", [b.candidateId]: NO_FAMILY } }))).toBe("ecossistema_motivo_invalido");
  });

  test("a family the candidate does not have cannot be the reason the model gives for it", () => {
    const weak = facts("0xeeee", { wallets: 0, soldPct: null });
    const w = ctxOf([weak, a]);
    const verdict = validateEcosystem({ stances: { [weak.candidateId]: "buy_third", [a.candidateId]: "skip" }, order: [weak.candidateId, "none", "none"], drivers: { [weak.candidateId]: "carteiras" } }, w);
    expect(verdict).toEqual({ ok: false, reason: "ecossistema_motivo_invalido" });
  });

  test("a size for a candidate with no ceiling is refused: the model was not offered one", () => {
    const other = ctxOf([facts("0xffff", { chainIndex: "137", candidateId: "token:137:0xffff" }), a]);
    const verdict = validateEcosystem({ stances: { "token:137:0xffff": "buy_third", [a.candidateId]: "skip" }, order: ["none", "none", "none"], drivers: {} }, other);
    expect(verdict).toEqual({ ok: false, reason: "ecossistema_postura_invalida" });
  });

  test("without a balance the picks have no dollars, only the model's size, and the balance is not invented", () => {
    const blind = ctxOf([a, b], null);
    // no ceiling means only to skip or to watch
    expect(validateEcosystem({ stances: { [a.candidateId]: "buy_third", [b.candidateId]: "skip" }, order: [a.candidateId, "none", "none"], drivers: {} }, blind)).toEqual({ ok: false, reason: "ecossistema_postura_invalida" });
    const watching = validateEcosystem({ stances: { [a.candidateId]: "watch", [b.candidateId]: "skip" }, order: ["none", "none", "none"], drivers: {} }, blind);
    expect(watching).toMatchObject({ ok: true, result: { picks: [], saldo: null } });
  });
});

describe("the item of the Brief", () => {
  test("is compact: numbers rounded, the ceiling as a share of the portfolio, and no address of any wallet", () => {
    const item = briefItem(candidateOf(facts("0xaaaa", { liquidityUsd: 912_345, volumeUsd: 3_456_789 }), saldo({ holdings: [{ chainIndex: "8453", address: "0xaaaa", usd: 100 }] })), 10_000);
    expect(item).toMatchObject({ l: 912, v: 3457, h: 4000, b: 62, x: 1, y: 1 });
    expect(JSON.stringify(item)).not.toMatch(/0x[0-9a-f]{40}/i);
    expect(JSON.stringify(item).length).toBeLessThan(400);
  });
});
