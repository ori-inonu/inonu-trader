import { describe, expect, test } from "bun:test";
import { summarize } from "./decision-reasons";
import type { Decision, Fill, ReasonRecord, Reconciliation } from "../src/decision/types";

const decision = (id: string, patch: Partial<Decision> = {}): Decision => ({ action: "COMPRAR", id, symbol: "T", sizeUsd: 100, grossEdgeBps: 150, costBps: 100, netEdgeBps: 50, reasons: ["ok"], stages: [{ name: "filtro", ok: true, ms: 0 }], ...patch });
const rec = (d: Decision, extra: Partial<ReasonRecord> = {}): string => JSON.stringify({ v: 1, tsMs: 1, mode: "paper", venue: "dex", chain: "base", decision: d, ...extra });
const refuse = (id: string, reason: string, stage: "filtro" | "edge" | "sizing" | "controles" = "filtro") =>
  decision(id, { action: "NAO_OPERAR", sizeUsd: 0, reasons: [reason as never], stages: [{ name: stage, ok: false, reason: reason as never, ms: 0 }] });
const fill: Fill = { id: "x", status: "filled", fillPriceUsd: 1, feeUsd: 0.1, gasUsd: 0.1, slippageBps: 5 };
const recon: Reconciliation = { id: "x", sizeUsd: 100, expectedLegCostBps: 60, realizedLegCostBps: 70, errorBps: 10 };

describe("summarize", () => {
  test("conta ações, motivo primário das recusas e a etapa em que pararam", async () => {
    const lines = [rec(refuse("a", "no_edge", "edge")), rec(refuse("b", "no_edge", "edge")), rec(refuse("c", "quote_stale")), rec(refuse("d", "day_loss_limit", "controles")), rec(decision("e"))];
    const s = await summarize(lines);
    expect(s.total).toBe(5);
    expect(s.byAction).toEqual({ NAO_OPERAR: 4, COMPRAR: 1 });
    expect(s.rejections).toEqual([
      { reason: "no_edge", count: 2, share: 0.5 },
      { reason: "quote_stale", count: 1, share: 0.25 },
      { reason: "day_loss_limit", count: 1, share: 0.25 },
    ]);
    expect(s.byRejectingStage).toEqual({ edge: 2, filtro: 1, controles: 1 });
  });

  test("uma decisão executada com duas linhas conta uma vez e vale a última", async () => {
    const d = decision("e");
    const s = await summarize([rec(d), rec(d, { fill, reconciliation: recon })]);
    expect(s.total).toBe(1);
    expect(s.trades.count).toBe(1);
    expect(s.trades.fills).toEqual({ filled: 1 });
    expect(s.trades.reconciliationErrorBps).toMatchObject({ n: 1, p50: 10 });
    expect(s.trades.sizeUsd).toMatchObject({ p50: 100 });
  });

  test("linhas inválidas são contadas e não derrubam o resumo", async () => {
    const s = await summarize(["não é json", "{}", JSON.stringify({ decision: { action: "COMPRAR" } }), "", rec(decision("a"))]);
    expect(s.invalid).toBe(3);
    expect(s.total).toBe(1);
  });

  test("sem decisões: tudo zerado, sem número inventado", async () => {
    const s = await summarize([]);
    expect(s).toMatchObject({ total: 0, rejections: [], trades: { count: 0, sizeUsd: null, netEdgeBps: null, reconciliationErrorBps: null } });
  });

  test("aceita fonte assíncrona", async () => {
    async function* gen() {
      yield rec(decision("a"));
    }
    expect((await summarize(gen())).total).toBe(1);
  });
});
