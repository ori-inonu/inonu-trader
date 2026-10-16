import { describe, expect, test } from "bun:test";
import { cachedEntryQuoteReader, ENTRY_COST_CLOSED, ENTRY_COST_GAS_STATION, ENTRY_COST_NARROWED, ENTRY_PROBE, entryCostFits, impactOfQuote, narrowBuysByEntryCost, narrowByEntryCost, recentBuyImpacts, recentSaleRefusals, SALE_REFUSED_TRIGGER, smallestOrderOf, withoutRefusedSales, type EntryQuoteObservation, type EntryQuoteReader } from "./entry-cost";
import type { Candidate } from "./types";

const MINT = "BCdwQBAn8dYB5YjTsoB6TdHAWokxv28k2oZUodERpump";
const NOW = Date.UTC(2026, 9, 15, 14, 0, 0);
const ALL = ["alvo_2", "alvo_5", "alvo_10", "alvo_20"];
const observation = (impactPct: number | null, refusal: EntryQuoteObservation["refusal"] = null): EntryQuoteObservation => ({ impactPct, refusal });

const buy = (over: Partial<Candidate> = {}): Candidate => ({
  id: `buy:token:501:${MINT}`, kind: "buy", symbol: "BOTTLE", chainIndex: "501", address: MINT, heldUsd: 0,
  stances: ["skip", "buy_tenth", "buy_third"], usdByStance: { skip: 0, buy_tenth: 10.84, buy_third: 36.15 }, facts: null, triggers: [], families: [], marks: ["liquidez_baixa"],
  wallet: "agente", profiles: ALL, plan: null, timing: null, capByProfile: Object.fromEntries(ALL.map((p) => [p, 108.46])), ...over,
});
const holding = (over: Partial<Candidate> = {}): Candidate => buy({ id: `hold:token:501:${MINT}@agente`, kind: "holding", stances: ["hold", "trim_third", "trim_half", "exit_all"], usdByStance: { hold: 0, trim_third: 3, trim_half: 4, exit_all: 8 }, profiles: [], capByProfile: undefined, ...over });

const refused = (over: Record<string, unknown> = {}) => ({ atMs: NOW - 5 * 60_000, side: "buy", stage: "falhou", reason: "impacto_alto", chainIndex: "501", address: MINT, stance: "buy_tenth", usd: 10.84, wallet: "agente", source: "modelo", quote: { impactPct: -2.14 }, ...over }) as never;

describe("the entry cost the executor charges is the one the Jev is offered plans for", () => {
  test("a cost of 1 percent (MANIFEST) takes the 2 percent plan off the list and keeps the three others", () => {
    expect(narrowByEntryCost(buy(), observation(-1)).profiles).toEqual(["alvo_5", "alvo_10", "alvo_20"]);
  });

  test("a cost of 2.75 percent (BOTTLE) leaves only the longest plan", () => {
    expect(narrowByEntryCost(buy(), observation(2.75)).profiles).toEqual(["alvo_20"]);
  });

  test("a cost above what any plan pays closes the purchase to skip and says why", () => {
    const c = narrowByEntryCost(buy(), observation(-3.4));
    expect([c.stances, c.marks.includes(ENTRY_COST_CLOSED)]).toEqual([["skip"], true]);
  });

  test("a cost every plan pays leaves the purchase exactly as it was", () => {
    const c = buy();
    expect(narrowByEntryCost(c, observation(-0.2))).toBe(c);
  });

  test("a quote that could not be read changes nothing", () => {
    const c = buy();
    expect(narrowByEntryCost(c, observation(null))).toBe(c);
  });

  test("a narrowed list says so to the Jev and drops the ceiling of the plans it no longer offers", () => {
    const c = narrowByEntryCost(buy(), observation(-1));
    expect([c.marks.includes(ENTRY_COST_NARROWED), Object.keys(c.capByProfile ?? {})]).toEqual([true, ["alvo_5", "alvo_10", "alvo_20"]]);
  });

  test("the filter is the executor's rule: a cost exactly at the cap passes, one cent above does not", () => {
    expect([entryCostFits("alvo_10", 2), entryCostFits("alvo_10", 2.01)]).toEqual([true, false]);
  });
});

describe("a refusal for price impact is remembered from the ledger, for half an hour", () => {
  test("the impact the executor quoted narrows the same token on the next look, with no new quote", async () => {
    const out = await narrowBuysByEntryCost({ buys: [buy()], quality: () => 0, records: [refused()], nowMs: NOW, probe: null, clock: () => NOW });
    expect(out[0]!.profiles).toEqual(["alvo_20"]);
  });

  test("after half an hour the refusal is forgotten", () => {
    expect(recentBuyImpacts([refused({ atMs: NOW - 31 * 60_000 })], NOW).size).toBe(0);
  });

  test("a refusal of a larger size than the smallest on offer says nothing about it, so it narrows nothing", async () => {
    const c = buy();
    const out = await narrowBuysByEntryCost({ buys: [c], quality: () => 0, records: [refused({ stance: "buy_full", usd: 108.46 })], nowMs: NOW, probe: null, clock: () => NOW });
    expect(out[0]).toBe(c);
  });

  test("another reason for failing is not a price impact", () => {
    expect(recentBuyImpacts([refused({ reason: "quote_recusada" })], NOW).size).toBe(0);
  });

  test("the latest refusal of a token is the one that counts", () => {
    const records = [refused({ atMs: NOW - 20 * 60_000, quote: { impactPct: -2.9 } }), refused({ atMs: NOW - 2 * 60_000, quote: { impactPct: -0.7 } })];
    expect([...recentBuyImpacts(records, NOW).values()].map((v) => v.impactPct)).toEqual([-0.7]);
  });
});

describe("a sale the executor refused for price impact is not asked again at that size or larger, and a stop never waits", () => {
  const sale = (over: Record<string, unknown> = {}) => refused({ side: "sell", stance: "exit_all", source: "modelo", ...over });

  test("after a refused full exit the holding is offered the smaller slices and the model is told why", () => {
    const refusals = recentSaleRefusals([sale()], NOW);
    const c = withoutRefusedSales(holding(), refusals.get(`501:${MINT}`));
    expect([c.stances, c.triggers]).toEqual([["hold", "trim_third", "trim_half"], [SALE_REFUSED_TRIGGER]]);
  });

  test("a sale the plan demanded (a stop) is never counted", () => {
    expect(recentSaleRefusals([sale({ source: "protecao" })], NOW).size).toBe(0);
  });

  test("after half an hour the full exit is offered again", () => {
    expect(recentSaleRefusals([sale({ atMs: NOW - 31 * 60_000 })], NOW).size).toBe(0);
  });
});

describe("the quote taken before the Jev is asked is small, one at a time, and never fatal", () => {
  const token = (n: number, quality: number): Candidate & { q: number } => ({ ...buy({ id: `buy:token:501:T${n}`, address: `T${n}`, symbol: `T${n}` }), q: quality });
  const run = (buys: Candidate[], probe: EntryQuoteReader | null) => narrowBuysByEntryCost({ buys, quality: (c) => (c as Candidate & { q: number }).q ?? 0, records: [], nowMs: NOW, probe, clock: () => NOW });

  test("a quote narrows the purchase it was taken for", async () => {
    const out = await run([token(1, 0)], async () => observation(-1));
    expect(out[0]!.profiles).toEqual(["alvo_5", "alvo_10", "alvo_20"]);
  });

  test("an explicit gas-station refusal closes only that purchase and unknown leaves the other unchanged", async () => {
    const gas = token(1, 1);
    const unknown = token(2, 0);
    const out = await run([gas, unknown], async (order) => order.address === "T1" ? observation(null, ENTRY_COST_GAS_STATION) : observation(null));
    expect(out[0]).toMatchObject({ stances: ["skip"], usdByStance: { skip: 0 }, profiles: [], capByProfile: {} });
    expect(out[0]!.marks).toEqual([...gas.marks, ENTRY_COST_GAS_STATION]);
    expect(out[0]!.triggers).toBe(gas.triggers);
    expect(out[1]).toBe(unknown);
  });

  test("no more than the best few open purchases are quoted in a cycle", async () => {
    const asked: string[] = [];
    await run([token(1, 1), token(2, 2), token(3, 3), token(4, 4), token(5, 5)], async (order) => (asked.push(order.address), observation(null)));
    expect(asked).toEqual(["T5", "T4", "T3"]);
  });

  test("a quote that throws leaves the purchase as it was", async () => {
    const c = token(1, 0);
    const out = await run([c], async () => { throw new Error("tool down"); });
    expect(out[0]).toBe(c);
  });

  test("with no probe wired (shadow mode, buying paused) nothing is quoted", async () => {
    const c = token(1, 0);
    expect((await run([c], null))[0]).toBe(c);
  });

  test("a purchase already closed is never quoted", async () => {
    let asked = 0;
    await run([{ ...token(1, 0), stances: ["skip"] }], async () => (asked++, observation(null)));
    expect(asked).toBe(0);
  });

  test("the smallest size is what is quoted, for the first plan on offer", () => {
    expect(smallestOrderOf(buy())).toMatchObject({ stance: "buy_tenth", usd: 10.84, side: "buy", wallet: "agente", profile: "alvo_2" });
  });

  test("an unknown quote expires after 60 seconds", async () => {
    let clock = NOW;
    let calls = 0;
    const read: EntryQuoteReader = async () => (calls++ === 0 ? observation(null) : observation(-1));
    const cached = cachedEntryQuoteReader(read, () => clock);
    const order = smallestOrderOf(buy())!;
    const signal = new AbortController().signal;
    await cached(order, signal);
    clock += ENTRY_PROBE.failTtlMs - 1;
    await cached(order, signal);
    expect(calls).toBe(1);
    clock += 2;
    await cached(order, signal);
    expect(calls).toBe(2);
  });

  test("a gas refusal expires after 60 seconds", async () => {
    let clock = NOW;
    let calls = 0;
    const read: EntryQuoteReader = async () => (calls++ === 0 ? observation(null, ENTRY_COST_GAS_STATION) : observation(null));
    const cached = cachedEntryQuoteReader(read, () => clock);
    const order = smallestOrderOf(buy())!;
    const signal = new AbortController().signal;
    await cached(order, signal);
    clock += ENTRY_PROBE.failTtlMs - 1;
    await cached(order, signal);
    expect(calls).toBe(1);
    clock += 2;
    await cached(order, signal);
    expect(calls).toBe(2);
  });

  test("a finite impact is kept for five minutes, then an unknown reread reopens the purchase", async () => {
    let clock = NOW;
    let calls = 0;
    const read: EntryQuoteReader = async () => (calls++ === 0 ? observation(3.6) : observation(null));
    const cached = cachedEntryQuoteReader(read, () => clock);
    const order = smallestOrderOf(buy())!;
    const candidate = buy();
    const signal = new AbortController().signal;
    const refused = await cached(order, signal);
    expect(narrowByEntryCost(candidate, refused).stances).toEqual(["skip"]);
    clock += ENTRY_PROBE.ttlMs - 1;
    await cached(order, signal);
    expect(calls).toBe(1);
    clock += 2;
    const recovered = await cached(order, signal);
    expect([calls, narrowByEntryCost(candidate, recovered)]).toEqual([2, candidate]);
  });

  test("the impact of a quote is read from the number or the string the provider writes", () => {
    expect([impactOfQuote({ priceImpactPercent: "-2.14" }), impactOfQuote({ priceImpactPercent: 0.3 }), impactOfQuote({ priceImpactPercent: "" }), impactOfQuote({})]).toEqual([-2.14, 0.3, null, null]);
  });
});
