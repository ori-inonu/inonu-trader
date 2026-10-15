import { describe, expect, test } from "bun:test";
import { createBudget, type Budget } from "./budget";
import { CLOSING_QUOTE_FRESH_MS, type ClosingRecord } from "./closing";
import { runClosing, type ClosingCandidate, type ClosingDeps } from "./closing-phase";
import type { EntryQuoteRead } from "./cli";
import type { PlannedOrder } from "./types";

const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const T1 = "8nnaeWCw8mUypcGAgbmSuzAT85uWx4UN12adDrMhXrGF";
const T2 = "Hg5Ja55T5wESq4vyFoiVCMeHXtGyVA69X2UHq8hgpump";
let now = 1_700_000_000_000;

const order = (token: string, id: string): PlannedOrder => ({ candidateId: `buy:token:501:${token}`, side: "buy", stance: "buy_full", chainIndex: "501", symbol: id, address: token, usd: 11, amountMinor: null, wallet: "agente", profile: "alvo_20", source: "modelo" });
const candidate = (token: string, symbol: string, p: number): ClosingCandidate => ({ id: `buy:token:501:${token}`, order: order(token, symbol), symbol, portfolioUsd: 118.74, liquidityUsd: 685_000, profile: "alvo_20", smallest: true, firstP: p, facets: { fading: 0.6 }, item: { s: symbol }, itemLegend: {}, appliedByGate: "skip" });
const raw = (token: string, over: Record<string, unknown> = {}) => ({ chainIndex: "501", swapMode: "exactIn", action: "ok", fromTokenAmount: "11000000", toTokenAmount: "2602337160", priceImpactPercent: "-0.3", tradeFee: "0.0055",
  fromToken: { tokenContractAddress: USDC, decimal: "6", taxRate: "0", isHoneyPot: false }, toToken: { tokenContractAddress: token, decimal: "6", taxRate: "0", isHoneyPot: false }, ...over });
const read = (token: string, over: Record<string, unknown> = {}, started = now): EntryQuoteRead => ({ ok: true, raw: raw(token, over), request: { cycleId: "cy-1", candidateId: `buy:token:501:${token}`, requestId: "q", chainIndex: "501", fromAddress: USDC, toAddress: token, fromAmountMinor: "11000000", fromDecimals: 6, toDecimals: null, startedAtMs: started, receivedAtMs: started } });

function rig(over: { step?: number; quote?: (o: PlannedOrder) => Promise<EntryQuoteRead>; answer?: () => unknown; limits?: { maxConsultsPerDay: number }; mode?: "shadow" | "decide"; noClose?: boolean; reserve?: number } = {}) {
  const records: ClosingRecord[] = [];
  const asked: unknown[] = [];
  let closeCalls = 0;
  const budget: Budget = createBudget({ limits: { maxConsultsPerDay: over.limits?.maxConsultsPerDay ?? 100, maxTokensPerDay: null }, now: () => now, load: () => null, persist: () => {} });
  const deps: ClosingDeps = {
    ...(over.reserve === undefined ? {} : { reserveForPrimaries: () => over.reserve! }),
    mode: () => over.mode ?? "shadow", budget, now: () => (now += over.step ?? 0), newId: (() => { let n = 0; return () => `q-${++n}`; })(), record: (r) => void records.push(r), maxPerCycle: 2, timeouts: { quoteMs: 1000, modelMs: 1000 },
    quoter: { read: over.quote === undefined ? async (o) => read(o.address) : async (o) => over.quote!(o) },
    model: over.noClose === true ? { name: "m" } : { name: "m", close: async ({ brief }) => { closeCalls++; asked.push(brief); const a = over.answer === undefined ? { buy: 0.7, skip: 0.3 } : over.answer(); return { answer: a as never, usage: { inputTokens: 1000, outputTokens: 10 } }; } },
  };
  return { deps, records, asked, budget, closeCalls: () => closeCalls };
}
const run = (r: ReturnType<typeof rig>, list: ClosingCandidate[], placed: "antes" | "depois" = "antes") => runClosing({ deps: r.deps, cycleId: "cy-1", candidates: list, signal: new AbortController().signal, exec: null, placed });

describe("the closing phase, in shadow: it measures and changes nothing", () => {
  test("a candidate the Jev leaned to buy is quoted, asked once with the brief of the closing, and recorded with its answer; the order is never touched", async () => {
    const r = rig();
    const out = await run(r, [candidate(T1, "AAA", 0.62)]);
    expect(out).toHaveLength(1);
    expect(r.closeCalls()).toBe(1);
    expect(r.records).toEqual(out);
    expect(out[0]).toMatchObject({ phase: "closing", mode: "shadow", candidateId: `buy:token:501:${T1}`, would: "buy", wouldReason: "resposta_do_jev", applied: "skip", answer: { buy: 0.7, skip: 0.3 } });
    expect(out[0]!.brief!.cot).toMatchObject({ e: "ok", imp: -0.3 });
    expect(out[0]!.quote?.fingerprint).toMatch(/^[0-9a-f]{64}$/);
  });

  test("at most two candidates per cycle, the ones the Jev preferred most; the others are not quoted and leave no record of a question", async () => {
    const quoted: string[] = [];
    const MID = "DEW9dSN6QpWyNthphCpMmAbZP1Q4cEKR9xQXAri98WDP";
    const r = rig({ quote: async (o) => { quoted.push(o.symbol); return read(o.address); } });
    await run(r, [candidate(T1, "LOW", 0.51), candidate(T2, "HIGH", 0.9), candidate(MID, "MID", 0.6)]);
    expect(quoted).toEqual(["HIGH", "MID"]);
    expect(r.records.map((x) => x.candidateId)).toEqual([`buy:token:501:${T2}`, `buy:token:501:${MID}`]);
  });
});

describe("what the code refuses or cannot do, without asking the model", () => {
  test("a quote that failed is recorded with its code and no question is asked", async () => {
    const r = rig({ quote: async () => ({ ok: false, reason: "quote_demorou" }) });
    const [rec] = await run(r, [candidate(T1, "AAA", 0.62)]);
    expect(rec).toMatchObject({ would: null, wouldReason: "quote_demorou", quote: null, quoteFailure: "quote_demorou", brief: null });
    expect(r.closeCalls()).toBe(0);
  });

  test("a quote that does not bind to the request (another token, another amount) is a coded failure, not a quote", async () => {
    const r = rig({ quote: async (o) => read(o.address, { fromTokenAmount: "12000000" }) });
    const [rec] = await run(r, [candidate(T1, "AAA", 0.62)]);
    expect(rec).toMatchObject({ would: null, wouldReason: "quote_amount_mismatch", quote: null });
    expect(r.closeCalls()).toBe(0);
  });

  test("a provider block, a warning or a honeypot is an objective refusal: skip, with the reason, no question", async () => {
    for (const [over, reason] of [[{ action: "block" }, "cotacao_bloqueada"], [{ action: "warn" }, "cotacao_aviso"]] as const) {
      const r = rig({ quote: async (o) => read(o.address, over) });
      const [rec] = await run(r, [candidate(T1, "AAA", 0.62)]);
      expect(rec).toMatchObject({ would: "skip", wouldReason: reason, refusal: reason });
      expect(r.closeCalls()).toBe(0);
    }
  });

  test("a quote that went stale between its binding and the question is not used: the age is checked again right before the model is asked", async () => {
    // the clock moves six seconds at every look: the quote is 11 s old when it is bound and 17 s old when the question is about to go out
    const r = rig({ step: 6000, quote: async (o) => read(o.address, {}, now - 5000) });
    const out = await run(r, [candidate(T2, "HIGH", 0.9)]);
    expect(out[0]).toMatchObject({ would: null, wouldReason: "cotacao_vencida" });
    expect(out[0]!.quote?.fingerprint).toMatch(/^[0-9a-f]{64}$/);
    expect(r.closeCalls()).toBe(0);
  });

  test("a quote that was already too old when it was bound is refused by the binding itself, with its code", async () => {
    const r = rig({ quote: async (o) => read(o.address, {}, now - CLOSING_QUOTE_FRESH_MS - 1) });
    const out = await run(r, [candidate(T2, "HIGH", 0.9)]);
    expect(out[0]).toMatchObject({ would: null, wouldReason: "quote_stale", quote: null });
    expect(r.closeCalls()).toBe(0);
  });

  test("a model that has no closing, or whose answer is not a distribution over buy and skip, says so and decides nothing", async () => {
    const none = rig({ noClose: true });
    expect((await run(none, [candidate(T1, "AAA", 0.62)]))[0]).toMatchObject({ would: null, wouldReason: "modelo_sem_fechamento" });
    const bad = rig({ answer: () => null });
    expect((await run(bad, [candidate(T1, "AAA", 0.62)]))[0]).toMatchObject({ would: null, wouldReason: "sem_resposta" });
    const thrown = rig({ answer: () => { throw new Error("provider down"); } });
    expect((await run(thrown, [candidate(T1, "AAA", 0.62)]))[0]).toMatchObject({ would: null, wouldReason: "modelo_erro" });
  });
});

describe("the same budget, every physical request counted", () => {
  test("each question is begun and finished in the budget of the primary consults; when the day is spent nothing is asked and the record says so", async () => {
    const r = rig({ limits: { maxConsultsPerDay: 1 } });
    const out = await run(r, [candidate(T2, "HIGH", 0.9), candidate(T1, "MID", 0.6)]);
    expect(r.budget.status().consults).toBe(1);
    expect(out[0]).toMatchObject({ wouldReason: "resposta_do_jev" });
    expect(out[1]).toMatchObject({ would: null, wouldReason: "consultas_esgotadas", quote: null });
    expect(r.closeCalls()).toBe(1);
  });

  test("a question that fails still counts: it was begun before the call", async () => {
    const r = rig({ answer: () => { throw new Error("x"); } });
    await run(r, [candidate(T1, "AAA", 0.62)]);
    expect(r.budget.status().consults).toBe(1);
  });
});

describe("the primary looks of the rest of the day come first", () => {
  test("a closing is asked only from what is left after every primary look still due today: none to spare, nothing is quoted or asked, and the record says so", async () => {
    // 100 a day, none spent, 100 primary looks still due: the closing has nothing to spend
    const r = rig({ reserve: 100 });
    const out = await run(r, [candidate(T1, "AAA", 0.62)]);
    expect(out[0]).toMatchObject({ would: null, wouldReason: "reserva_para_primarias", quote: null, brief: null });
    expect(r.closeCalls()).toBe(0);
    expect(r.budget.status().consults).toBe(0);
  });

  test("with one to spare it asks once, and the next candidate of the same cycle sees the spare spent", async () => {
    const r = rig({ reserve: 99, limits: { maxConsultsPerDay: 100 } });
    const out = await run(r, [candidate(T2, "HIGH", 0.9), candidate(T1, "MID", 0.6)]);
    expect(out[0]).toMatchObject({ wouldReason: "resposta_do_jev" });
    expect(out[1]).toMatchObject({ would: null, wouldReason: "reserva_para_primarias" });
    expect(r.budget.status().consults).toBe(1);
  });

  test("without a reserve given (a caller that does not know the cadence) nothing is held back, as before", async () => {
    const r = rig();
    const out = await run(r, [candidate(T1, "AAA", 0.62)]);
    expect(out[0]).toMatchObject({ wouldReason: "resposta_do_jev" });
  });
});

describe("the record says when each physical thing happened and where in the cycle the look was", () => {
  test("it carries where the look stood against the orders, when the phase began, when the question went out and when the answer came", async () => {
    const r = rig({ step: 10 });
    const [rec] = await run(r, [candidate(T1, "AAA", 0.62)], "depois");
    expect(rec).toMatchObject({ placed: "depois" });
    expect(rec!.phaseStartedAtMs).toBeLessThanOrEqual(rec!.atMs);
    expect(rec!.askedAtMs).not.toBeNull();
    expect(rec!.answeredAtMs!).toBeGreaterThan(rec!.askedAtMs!);
  });

  test("when no question went out there is no asked time and no answered time", async () => {
    const r = rig({ quote: async () => ({ ok: false, reason: "quote_demorou" }) });
    const [rec] = await run(r, [candidate(T1, "AAA", 0.62)]);
    expect(rec).toMatchObject({ askedAtMs: null, answeredAtMs: null, placed: "antes" });
  });
});

describe("the mode decide is not in force: the phase never reports a stance to apply while it is shadow", () => {
  test("in shadow the record applies exactly what the gate decided, whatever the answer", async () => {
    const r = rig({ answer: () => ({ buy: 0.1, skip: 0.9 }) });
    const [rec] = await run(r, [{ ...candidate(T1, "AAA", 0.62), appliedByGate: "buy_full" }]);
    expect(rec).toMatchObject({ would: "skip", applied: "buy_full", mode: "shadow" });
  });
});
