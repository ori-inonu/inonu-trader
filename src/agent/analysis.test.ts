import { describe, expect, test } from "bun:test";
import { buildAnalysis, type AnalysisInput } from "./analysis";

const T0 = 1_792_000_000_000;
const cand = (id: string, stances: string[]) => ({ id, kind: "buy", stances });
/** One consult record as the agent keeps it in briefs.jsonl (only the fields the analysis reads). */
const consult = (n: number, over: Record<string, unknown> = {}) => ({
  cycleId: `cy-${n}`, atMs: T0 + n * 120_000, criteria: "rank-v1",
  candidates: [cand("buy:a", ["skip", "buy_full"]), cand("buy:b", ["skip"]), cand("buy:c", ["skip", "buy_full"])],
  brief: { compras: { "buy:a": { s: "AAA" }, "buy:b": { s: "BBB" }, "buy:c": { s: "CCC" } } },
  verdicts: { "buy:a": { skip: 0.4, buy_full: 0.6 }, "buy:c": { skip: 0.9, buy_full: 0.1 } },
  requested: { "buy:a": "buy_full", "buy:b": "skip", "buy:c": "skip" },
  stances: { "buy:a": "buy_full", "buy:b": "skip", "buy:c": "skip" },
  posture: "neutra", ...over,
});
const base = (over: Partial<AnalysisInput> = {}): AnalysisInput => ({ nowMs: T0 + 10_000_000, briefs: [], orders: [], fills: [], scoreboard: [], ...over });

describe("the funnel from the item of purchase to the order that went out", () => {
  test("it counts what the code closed, what the Jev skipped, what he asked for, what passed the bar and what went out", () => {
    const briefs = [
      consult(1),
      consult(2, { requested: { "buy:a": "buy_full", "buy:b": "skip", "buy:c": "buy_full" }, stances: { "buy:a": "skip", "buy:b": "skip", "buy:c": "skip" }, verdicts: { "buy:a": { skip: 0.49, buy_full: 0.51 }, "buy:c": { skip: 0.45, buy_full: 0.55 } } }),
    ];
    const orders = [
      { orderKey: "o1", atMs: T0 + 120_000, side: "buy", stage: "executada", symbol: "AAA", usd: 11, source: "modelo", reason: "recibo_sucesso" },
      { orderKey: "o2", atMs: T0 + 130_000, side: "buy", stage: "falhou", symbol: "CCC", usd: 11, source: "modelo", reason: "simulacao_falhou" },
    ];
    const a = buildAnalysis(base({ briefs, orders }));
    expect(a.funnel).toEqual({ consults: 2, items: 6, closed: 2, open: 4, asked: 3, applied: 1, executed: 1, failed: 1 });
    // the asks, with the preference the Jev gave and whether it got through the bar
    expect(a.asks.map((x) => [x.s, x.p, x.ok])).toEqual([["AAA", 0.6, true], ["AAA", 0.51, false], ["CCC", 0.55, false]]);
  });

  test("only the last 25 consults count for the funnel and the asks, and the timeline keeps the last 30", () => {
    const briefs = Array.from({ length: 40 }, (_, i) => consult(i + 1));
    const a = buildAnalysis(base({ briefs }));
    expect(a.funnel.consults).toBe(25);
    expect(a.funnel.items).toBe(75);
    expect(a.timeline).toHaveLength(30);
    expect(a.timeline.at(-1)).toMatchObject({ open: 2, asked: 1, applied: 1 });
  });
});

describe("how much the Jev wanted to buy", () => {
  test("a histogram over all the open candidates, in bins of five points, and the part from the new wording of the questions", () => {
    const briefs = [consult(1, { criteria: undefined }), consult(2)];
    const a = buildAnalysis(base({ briefs }));
    expect(a.hist.all[12]).toBe(2);
    expect(a.hist.all[2]).toBe(2);
    expect(a.hist.fresh[12]).toBe(1);
    expect(a.hist.fresh[2]).toBe(1);
    expect(a.hist.all.reduce((x, y) => x + y, 0)).toBe(4);
  });
});

describe("the closed round trips and the fees", () => {
  const fill = (symbol: string, side: string, cash: number, at: number, fee = "5000") => ({ kind: "fill", orderKey: `${symbol}${side}${at}`, symbol, side, cashUnits: cash, atMs: at, walletFeeLamports: fee });
  test("a token bought and sold is one trip in the cash that went out and came back; a sale with no purchase is not a trip", () => {
    const fills = [fill("AAA", "buy", 12, T0), fill("AAA", "sell", 11.9, T0 + 900_000), fill("OLD", "sell", 20, T0 - 1000), fill("BBB", "buy", 11, T0 + 1000), fill("BBB", "sell", 10.8, T0 + 400_000)];
    const a = buildAnalysis(base({ fills }));
    expect(a.trips.map((t) => [t.s, t.in, t.out, t.pct])).toEqual([["BBB", 11, 10.8, -1.82], ["AAA", 12, 11.9, -0.83]]);
    expect(a.fees).toEqual({ lamports: 25_000, fills: 5, unmatchedSells: 1 });
  });
});

describe("the same token bought and sold again and again is one round trip each time", () => {
  const fill = (side: string, cash: number, at: number, tokens: string) => ({ kind: "fill", orderKey: `STONK${side}${at}`, symbol: "STONK", side, cashUnits: cash, atMs: at, tokenMinor: tokens, walletFeeLamports: "5000" });
  test("three full round trips are three trips, with their own times and results, not a sum of everything bought", () => {
    const fills = [
      fill("buy", 11, T0, "1000"), fill("sell", 10.97, T0 + 120_000, "1000"),
      fill("buy", 11, T0 + 240_000, "900"), fill("sell", 10.98, T0 + 360_000, "900"),
      fill("buy", 11, T0 + 480_000, "800"), fill("sell", 10.9, T0 + 600_000, "800"),
    ];
    const a = buildAnalysis(base({ fills }));
    expect(a.trips.map((t) => [t.in, t.out, t.pct, t.sellAt - t.buyAt])).toEqual([[11, 10.97, -0.27, 120_000], [11, 10.98, -0.18, 120_000], [11, 10.9, -0.91, 120_000]]);
    expect(a.fees.unmatchedSells).toBe(0);
  });

  test("a partial sale stays inside its trip, a trip not yet closed is not a result, and dust left behind closes it", () => {
    const part = [fill("buy", 20, T0, "1000"), fill("sell", 7, T0 + 60_000, "333")];
    expect(buildAnalysis(base({ fills: part })).trips).toEqual([]);
    const closed = [...part, fill("sell", 13, T0 + 120_000, "640")];
    const a = buildAnalysis(base({ fills: closed }));
    expect(a.trips.map((t) => [t.in, t.out, t.pct])).toEqual([[20, 20, 0]]);
    const dust = [fill("buy", 11, T0, "1000"), fill("sell", 10.9, T0 + 60_000, "960")];
    expect(buildAnalysis(base({ fills: dust })).trips).toHaveLength(1);
  });
});

describe("what was skipped, measured afterwards (counterfactual)", () => {
  const dec = (key: string, atMs: number, entry: number, extra: Record<string, unknown> = {}) => ({ kind: "decision", key, atMs, entryPriceUsd: entry, symbol: "AAA", ...extra });
  const set = (key: string, window: string, price: number) => ({ kind: "settlement", key, window, priceUsd: price });
  test("the three groups are told apart: asked and cut by the bar, skipped by the Jev, closed by the code; unsettled ones are left out", () => {
    const briefs = [consult(1, { requested: { "buy:a": "buy_full", "buy:b": "skip", "buy:c": "skip" }, stances: { "buy:a": "skip", "buy:b": "skip", "buy:c": "skip" } })];
    const k = (id: string) => `cy-1:${id}|inacao`;
    const scoreboard = [
      dec(k("buy:a"), T0 + 1, 1), set(k("buy:a"), "15m", 1.1), set(k("buy:a"), "1h", 0.9),
      dec(k("buy:c"), T0 + 2, 2), set(k("buy:c"), "15m", 2.2),
      dec(k("buy:b"), T0 + 3, 4, { triggers: ["fechada_pelo_codigo"] }), set(k("buy:b"), "15m", 2),
    ];
    const a = buildAnalysis(base({ briefs, scoreboard }));
    expect(a.placar.gated["15m"]).toMatchObject({ n: 1, up: 1, vals: [10] });
    expect(a.placar.gated["1h"]).toMatchObject({ n: 1, up: 0, vals: [-10] });
    expect(a.placar.skipped["15m"]).toMatchObject({ n: 1, up: 1, vals: [10] });
    expect(a.placar.skipped["1h"].n).toBe(0);
    expect(a.placar.closed["15m"]).toMatchObject({ n: 1, up: 0, vals: [-50] });
    // oldest first
    expect(a.recent.map((r) => [r.kind, r.m15, r.m1h])).toEqual([["pedida e recusada", 10, -10], ["pulada pelo Jev", 10, null], ["puxada pelo codigo", -50, null]]);
  });
});

describe("a malformed record never breaks the reading", () => {
  test("garbage in every input gives an empty analysis, not an error", () => {
    const a = buildAnalysis({ nowMs: 1, briefs: [null, 1, {}, { brief: 3 }] as never, orders: [null, {}] as never, fills: [null, { symbol: 1 }] as never, scoreboard: [null, { kind: "decision" }] as never });
    expect(a.funnel.items).toBe(0);
    expect(a.trips).toEqual([]);
    expect(a.placar.skipped["15m"].n).toBe(0);
  });
});

describe("how the orders ended and what went out today", () => {
  const order = (n: number, over: Record<string, unknown>) => ({ orderKey: `o${n}`, atMs: T0 + 10_000_000 - n * 1000, side: "buy", stage: "executada", symbol: "AAA", usd: 11, source: "modelo", reason: null, ...over });
  test("the last stage of each order is counted, the reasons of the failures too, and today's dollars (UTC day) by side, never the ones sent yesterday", () => {
    const orders = [
      order(1, {}), order(2, { stage: "falhou", reason: "simulacao_falhou" }), order(3, { stage: "falhou", reason: "simulacao_falhou" }), order(4, { stage: "incerta", side: "sell", usd: 10 }),
      order(5, { side: "sell", usd: 30.456, stage: "executada" }), order(6, { atMs: T0 - 2 * 86_400_000, usd: 99 }), order(7, { stage: "falhou", usd: 50, reason: "recibo_erro" }),
    ];
    const a = buildAnalysis(base({ orders }));
    expect(a.orders.outcomes).toEqual({ executada: 3, falhou: 3, incerta: 1 });
    expect(a.orders.reasons).toEqual({ simulacao_falhou: 2, recibo_erro: 1 });
    // a failed order sent nothing: only the executed and the unanswered count as dollars that went out
    expect(a.orders.spentToday).toEqual({ buy: 11, sell: 40.46 });
  });
});
