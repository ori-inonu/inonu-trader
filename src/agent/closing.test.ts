import { describe, expect, test } from "bun:test";
import { bindEntryQuote, type BoundEntryQuote, type EntryQuoteRequest } from "../decision-review/entry-quote";
import { CLOSING_BRIEF_MAX_BYTES, CLOSING_CRITERIA, CLOSING_QUOTE_FRESH_MS, closingAnswerOf, closingBrief, closingQuestion, closingRecord, closingVerdict, quoteIsFresh, quoteRefusal } from "./closing";

const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const TOKEN = "8nnaeWCw8mUypcGAgbmSuzAT85uWx4UN12adDrMhXrGF";
const NOW = 1_700_000_000_000;
const request = (over: Partial<EntryQuoteRequest> = {}): EntryQuoteRequest => ({ cycleId: "cy-1", candidateId: `buy:token:501:${TOKEN}`, requestId: "q-1", chainIndex: "501", fromAddress: USDC, toAddress: TOKEN, fromAmountMinor: "11000000", fromDecimals: 6, toDecimals: null, startedAtMs: NOW - 2000, receivedAtMs: NOW - 1000, ...over });
const rawQuote = (over: Record<string, unknown> = {}) => ({ chainIndex: "501", swapMode: "exactIn", action: "ok", fromTokenAmount: "11000000", toTokenAmount: "2602337160", priceImpactPercent: "-0.3", tradeFee: "0.0055", estimateGasFee: "5000", contextSlot: 99,
  fromToken: { tokenContractAddress: USDC, decimal: "6", taxRate: "0", isHoneyPot: false }, toToken: { tokenContractAddress: TOKEN, decimal: "6", taxRate: "0.01", isHoneyPot: false }, ...over });
const bound = (raw: unknown = rawQuote()): BoundEntryQuote => {
  const r = bindEntryQuote(request(), raw, NOW, 150_000);
  if (!r.ok) throw new Error("fixture " + r.reason);
  return r.value;
};
const FACETS = { late_entry: 0.12, still_falling: 0.45, accumulating: 0.2, exit_easy: 0.7, distribution: 0.19, fading: 0.79 };
const ctx = (over: Record<string, unknown> = {}) => ({
  symbol: "HOTBOT", sizeUsd: 11, portfolioUsd: 118.74, liquidityUsd: 685_000, profile: "alvo_20" as const, smallest: true,
  first: { pBuy: 0.6234, facets: FACETS }, quote: bound(), quoteFailure: null, exec: { voltas: 2, retorno: -0.89, ultimas: [{ s: "HOTBOT", m: 4, p: -1.38 }], sem_entrada: 7, desconhecidas: 0 }, nowMs: NOW, ...over,
});

describe("the brief of the closing: percentages and codes, with what the Jev said before next to what the entry costs", () => {
  test("it carries the first answer, the quote as percentages, the size against the wallet and the pool, and the plan", () => {
    const b = closingBrief(ctx());
    expect(b.v).toBe(1);
    expect(b.c).toBe("HOTBOT");
    expect(b.sua).toEqual({ p: 0.62, f: { late_entry: 12, still_falling: 45, accumulating: 20, exit_easy: 70, distribution: 19, fading: 79 } });
    expect(b.cot).toMatchObject({ e: "ok", imp: -0.3, taxa: 0.05, imposto: [0, 1], idade: 2 });
    // what the quote promises for the way in: the impact (in absolute value) plus the network fee as a percent of the size, both known
    expect(b.cot!.entra).toBeCloseTo(0.35, 6);
    expect(b.tam).toEqual({ cart: 9.3, liq: 0.002 });
    expect(b.plano).toEqual({ alvo: 20, stop: 10 });
    expect(b.min).toBe(true);
    expect(b.voltas).toMatchObject({ voltas: 2, retorno: -0.89 });
  });

  test("it never carries a dollar amount, an address, a quote id or a route: a size in dollars is only ever a percent of something", () => {
    const text = JSON.stringify(closingBrief(ctx()));
    for (const outside of ["usd", "USD", USDC, TOKEN, "q-1", "router", "118", "685000"]) expect(text).not.toContain(outside);
    expect(new TextEncoder().encode(text).length).toBeLessThanOrEqual(CLOSING_BRIEF_MAX_BYTES);
  });

  test("an absent fact is null with the reason, never zero: no quote, no facet, no liquidity, no wallet value", () => {
    const b = closingBrief(ctx({ quote: null, quoteFailure: "quote_demorou", first: { pBuy: null, facets: {} }, liquidityUsd: null, portfolioUsd: null, exec: null }));
    expect(b.cot).toBeNull();
    expect(b.cotMotivo).toBe("quote_demorou");
    expect(b.sua).toEqual({ p: null, f: {} });
    expect(b.tam).toEqual({ cart: null, liq: null });
    expect(b.voltas).toBeNull();
  });

  test("a warning is shown as a warning and the cost of the way in is unknown when the fee is not there", () => {
    const warned = closingBrief(ctx({ quote: bound(rawQuote({ action: "warn", tradeFee: undefined })) }));
    expect(warned.cot).toMatchObject({ e: "aviso", taxa: null, entra: null });
  });
});

describe("what the code refuses on its own, before the Jev is asked", () => {
  test("a provider block or warning, a honeypot or an unknown honeypot on the token bought", () => {
    expect(quoteRefusal(bound())).toBeNull();
    expect(quoteRefusal(bound(rawQuote({ action: "block" })))).toBe("cotacao_bloqueada");
    expect(quoteRefusal(bound(rawQuote({ action: "warn" })))).toBe("cotacao_aviso");
    expect(quoteRefusal(bound(rawQuote({ toToken: { tokenContractAddress: TOKEN, decimal: "6", taxRate: "0", isHoneyPot: true } })))).toBe("honeypot");
    expect(quoteRefusal(bound(rawQuote({ toToken: { tokenContractAddress: TOKEN, decimal: "6", taxRate: "0" } })))).toBe("honeypot_desconhecido");
  });
});

describe("the question and the answer", () => {
  test("a closed choice between buying and skipping, naming the token without a free text of its own", () => {
    const q = closingQuestion("HOTBOT") as { type: string; criteria: Record<string, string>; instructions: { question: string } };
    expect(q.type).toBe("choice");
    expect(Object.keys(q.criteria).sort()).toEqual(["buy", "skip"]);
    expect(q.instructions.question).toContain("HOTBOT");
  });

  test("the answer is read only when it is a distribution over exactly those two options; the most likely one decides and a tie is a skip", () => {
    expect(closingAnswerOf({ choice: "buy", probabilities: { buy: 0.7, skip: 0.3 } })).toEqual({ buy: 0.7, skip: 0.3 });
    for (const bad of [null, {}, { choice: "buy" }, { choice: "buy", probabilities: { buy: 0.7 } }, { choice: "buy", probabilities: { buy: 0.9, skip: 0.3 } }, { choice: "buy", probabilities: { buy: -0.1, skip: 1.1 } }, { choice: "buy", probabilities: { buy: "0.7", skip: "0.3" } }, { choice: "buy", probabilities: { buy: 0.7, skip: 0.3, other: 0 } }]) {
      expect(closingAnswerOf(bad)).toBeNull();
    }
    expect(closingVerdict({ buy: 0.51, skip: 0.49 })).toBe("buy");
    expect(closingVerdict({ buy: 0.5, skip: 0.5 })).toBe("skip");
    expect(closingVerdict({ buy: 0.2, skip: 0.8 })).toBe("skip");
  });
});

describe("the record of the phase", () => {
  const base = { cycleId: "cy-1", candidateId: `buy:token:501:${TOKEN}`, requestId: "q-1", atMs: NOW, mode: "shadow" as const, firstP: 0.6234567, appliedByGate: "buy_full" };

  test("it keeps both probabilities raw to six places, the bound quote, the size of the brief and what would have been done, next to what was done", () => {
    const brief = closingBrief(ctx());
    const rec = closingRecord({ ...base, quote: bound(), quoteFailure: null, refusal: null, brief, answer: { buy: 0.512345678, skip: 0.487654322 } });
    expect(rec).toMatchObject({ v: 1, phase: "closing", mode: "shadow", first: { pBuy: 0.623457, appliedByGate: "buy_full" }, answer: { buy: 0.512346, skip: 0.487654 }, would: "buy", applied: "buy_full" });
    expect(rec.briefBytes).toBe(new TextEncoder().encode(JSON.stringify(brief)).length);
    // the exact brief is on the record, so an auditor can recompute the hash and see what the second request carried; and the version of the wording
    expect(rec.brief).toEqual(brief);
    expect(rec.criteria).toBe(CLOSING_CRITERIA);
    expect(rec.briefHash).toMatch(/^[0-9a-f]{16}$/);
    expect(rec.quote?.fingerprint).toMatch(/^[0-9a-f]{64}$/);
  });

  test("a refused or missing quote, or a missing answer, says why and applies nothing of its own", () => {
    const refused = closingRecord({ ...base, quote: bound(rawQuote({ action: "block" })), quoteFailure: null, refusal: "cotacao_bloqueada", brief: null, answer: null });
    expect(refused).toMatchObject({ would: "skip", wouldReason: "cotacao_bloqueada", answer: null, applied: "buy_full" });
    const none = closingRecord({ ...base, quote: null, quoteFailure: "quote_demorou", refusal: null, brief: null, answer: null });
    expect(none).toMatchObject({ would: null, wouldReason: "quote_demorou", quote: null });
    const unanswered = closingRecord({ ...base, quote: bound(), quoteFailure: null, refusal: null, brief: closingBrief(ctx()), answer: null });
    expect(unanswered).toMatchObject({ would: null, wouldReason: "sem_resposta" });
  });
});

describe("the findings of the independent review of the closing", () => {
  test("the quote is aged at the moment the brief is built, from the start of the request", () => {
    expect(closingBrief(ctx()).cot!.idade).toBe(2);
    expect(closingBrief(ctx({ nowMs: NOW + 20_000 })).cot!.idade).toBe(22);
    expect(quoteIsFresh(bound(), NOW)).toBe(true);
    expect(quoteIsFresh(bound(), NOW - 2000 + CLOSING_QUOTE_FRESH_MS)).toBe(true);
    expect(quoteIsFresh(bound(), NOW - 2000 + CLOSING_QUOTE_FRESH_MS + 1)).toBe(false);
    // a clock that went backwards is never fresh
    expect(quoteIsFresh(bound(), NOW - 5000)).toBe(false);
  });

  test("a real fee of a cent on a purchase of eleven dollars is kept, not rounded into a zero", () => {
    const cot = closingBrief(ctx({ quote: bound(rawQuote({ tradeFee: "0.0005206" })) })).cot!;
    expect(cot.taxa).toBeGreaterThan(0);
    expect(cot.taxa!).toBeCloseTo((0.0005206 / 11) * 100, 6);
  });

  test("a price difference in your favour is shown with its sign and never counted as a cost; one against you is", () => {
    const favourable = closingBrief(ctx({ quote: bound(rawQuote({ priceImpactPercent: "2" })) })).cot!;
    expect(favourable.imp).toBe(2);
    expect(favourable.entra).toBeCloseTo(favourable.taxa!, 6);
    const against = closingBrief(ctx({ quote: bound(rawQuote({ priceImpactPercent: "-2.14" })) })).cot!;
    expect(against.imp).toBe(-2.14);
    expect(against.entra).toBeCloseTo(2.14 + against.taxa!, 6);
  });

  test("the brief says the cost is partial, what p is, and carries the facts of the first brief for this token with their legend", () => {
    const item = { s: "HOTBOT", l: 685, v: 827, h: 5251, t: 19, mo: { r5: 0.7, r1: -11.2, ag: 8 }, tm: { rsi: 50 } };
    const b = closingBrief(ctx({ item, itemLegend: { "compras.l": "pool liquidity, thousands of dollars" } }));
    expect(b.cob).toBe("parcial");
    expect(b.cand).toEqual(item);
    expect(b.chaves.cob).toContain("PARTIAL");
    expect(b.chaves.sua).toContain("not a chance of profit");
    expect(b.chaves["compras.l"]).toContain("pool liquidity");
    const q = closingQuestion("HOTBOT") as { instructions: { question: string; goal: string } };
    expect(q.instructions.goal).toContain("partial");
    expect(q.instructions.question).not.toContain("known:");
    expect(new TextEncoder().encode(JSON.stringify(b)).length).toBeLessThanOrEqual(CLOSING_BRIEF_MAX_BYTES);
  });
});
