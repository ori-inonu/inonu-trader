import { describe, expect, test } from "bun:test";
import { parseSystemOneCycle } from "./system-one";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SystemOneView } from "../components/SystemOne/SystemOne";

const candidate = (id: string, side: "long" | "short", leverage: number, eligible: boolean) => ({
  id,
  side,
  leverage,
  marginUsd: 10,
  notionalUsd: 10 * leverage,
  liquidationDistance: 1 / leverage,
  touchProbability: 0.01 * leverage,
  medianMultipleNoEdge: 1 - 0.001 * leverage,
  fundingCarryPerDay: 0.0003,
  fundingCarryUsd: 0.02,
  eligible,
  reasons: eligible ? [] : ["above_leverage_cap"],
});

const cycle = {
  schemaVersion: 1,
  cycleId: "so-abc",
  startedAtMs: 1_000,
  completedAtMs: 2_000,
  brief: {
    phase: "fase-2",
    horizonDays: 7,
    market: { instId: "MON-USDT-SWAP", indexPrice: 0.025, markPrice: 0.02501, fundingRate: 0.0001, fundingIntervalMs: 28_800_000, realizedSigmaDaily: 0.04, candlesUsed: 96, candleBarMs: 900_000, source: "okx_public_v5", observedAtMs: 1_000 },
    wallet: { capitalUsd: 500, knownValueUsd: 500, valueComplete: true, openNotionalUsd: 0, openSide: null, source: "configured", observedAtMs: 1_000 },
    limits: { leverageCeiling: 2, leverageCap: 2, orderCapUsd: 10, exposureCapUsd: 125, liquidationDistanceFloor: 0.35, dailyStopUsd: 10, unknown: [] },
    candidates: [candidate("long-1x", "long", 1, true), candidate("long-2x", "long", 2, true), candidate("long-5x", "long", 5, false), { id: "broken" }],
    eligibleIds: ["long-1x", "long-2x"],
    notes: ["Probabilities are decision weights."],
  },
  decision: { choice: "long-2x", probabilities: { hold: 0.2, "long-1x": 0.1, "long-2x": 0.7, bad: "x" }, confidence: null, latencyMs: 120.4, model: "jev-latest", status: "ok" },
  chosen: candidate("long-2x", "long", 2, true),
  execution: { status: "dry_run", reasons: ["system_one_never_executes"] },
  warnings: [],
};

describe("parseSystemOneCycle", () => {
  test("rejects invalid required financial values and preserves optional unknown risk", () => {
    const locations = [
      ["wallet", "capitalUsd"], ["wallet", "knownValueUsd"], ["wallet", "openNotionalUsd"],
      ["limits", "leverageCeiling"], ["limits", "orderCapUsd"], ["limits", "exposureCapUsd"],
      ["candidate", "leverage"], ["candidate", "marginUsd"], ["candidate", "notionalUsd"], ["candidate", "liquidationDistance"],
      ["chosen", "marginUsd"], ["chosen", "notionalUsd"], ["chosen", "liquidationDistance"],
    ];
    for (const [section, field] of locations) {
      for (const invalid of [null, undefined, NaN, Infinity, -Infinity, -1, "10"]) {
        const changed = structuredClone(cycle);
        const target = section === "candidate" ? changed.brief.candidates[0]! : section === "chosen" ? changed.chosen : section === "wallet" ? changed.brief.wallet : changed.brief.limits;
        (target as unknown as Record<string, unknown>)[field!] = invalid;
        expect(parseSystemOneCycle(changed)).toBeNull();
      }
    }
    const unknown = structuredClone(cycle);
    unknown.brief.market.realizedSigmaDaily = null as unknown as number;
    unknown.brief.candidates = unknown.brief.candidates.map(candidate => ({ ...candidate, touchProbability: null as unknown as number }));
    const parsed = parseSystemOneCycle(unknown);
    expect(parsed?.brief.market.realizedSigmaDaily).toBeNull();
    expect(parsed?.brief.candidates[0]?.touchProbability).toBeNull();
    expect(parsed?.brief.wallet.openNotionalUsd).toBe(0);
  });

  test("rejects unsupported schemas, failed selected decisions and forged candidates", () => {
    expect(parseSystemOneCycle({ ...cycle, schemaVersion: 99 })).toBeNull();
    expect(parseSystemOneCycle({ ...cycle, decision: { ...cycle.decision, status: "error" } })).toBeNull();
    expect(parseSystemOneCycle({ ...cycle, chosen: candidate("short-5x", "short", 5, true) })).toBeNull();
    expect(parseSystemOneCycle({ ...cycle, completedAtMs: undefined })).toBeNull();
  });

  test("view identifies mock, configured capital and failed refresh", () => {
    const parsed = parseSystemOneCycle({ ...cycle, decision: { ...cycle.decision, model: "mock" } })!;
    const html = renderToStaticMarkup(createElement(SystemOneView, { state: { status: "error", cycle: parsed, error: "fetch failed", ageMs: 180_000 }, reducedMotion: true }));
    expect(html).toContain("MOCK");
    expect(html).toContain("capital configurado");
    expect(html).toContain("Atualizacao indisponivel");
    expect(html).not.toContain("Alavancagem decidida pelo Jev");
  });
  test.each(["unknown", "unverified", null])("view preserves unknown provenance %s instead of claiming a public API or balance reading", (source: string | null) => {
    const parsed = parseSystemOneCycle({ ...cycle, brief: { ...cycle.brief, market: { ...cycle.brief.market, source }, wallet: { ...cycle.brief.wallet, source } } })!;
    const html = renderToStaticMarkup(createElement(SystemOneView, { state: { status: "ready", cycle: parsed, error: null, ageMs: 0 } }));
    expect(html).toContain("origem de mercado desconhecida");
    expect(html).toContain("origem de carteira desconhecida");
    expect(html).not.toContain("API publica OKX v5");
    expect(html).not.toContain("leitura de saldo");
  });
  test.each(["error", "timeout", "malformed", "invalid-choice"])("view identifies rejected %s decision without presenting fallback weights", (status: string) => {
    const parsed = parseSystemOneCycle({ ...cycle, chosen: null, decision: { ...cycle.decision, choice: "hold", probabilities: { hold: 1 }, status }, execution: { status: "blocked", reasons: ["system_one_never_executes", `decision_${status}`, "hold"] } })!;
    const html = renderToStaticMarkup(createElement(SystemOneView, { state: { status: "ready", cycle: parsed, error: null, ageMs: 0 }, reducedMotion: true }));
    expect(html).toContain("Decisao rejeitada");
    expect(html).toContain("Manter por seguranca");
    expect(html).toContain("Motivos da execucao");
    expect(html).not.toContain("peso 100%");
    expect(html).not.toContain('data-system-one-word="true">Manter<');
  });
  test("a valid hold retains its accepted decision weight", () => {
    const parsed = parseSystemOneCycle({ ...cycle, chosen: null, decision: { ...cycle.decision, choice: "hold", probabilities: { hold: 1 } }, execution: { status: "blocked", reasons: ["hold"] } })!;
    const html = renderToStaticMarkup(createElement(SystemOneView, { state: { status: "ready", cycle: parsed, error: null, ageMs: 0 } }));
    expect(html).toContain('data-system-one-word="true">Manter<');
    expect(html).toContain("peso 100%");
    expect(html).not.toContain("Decisao rejeitada");
  });
  test("ladder exposes eligibility and candidate details through native disclosure controls", () => {
    const parsed = parseSystemOneCycle(cycle)!;
    const html = renderToStaticMarkup(createElement(SystemOneView, { state: { status: "ready", cycle: parsed, error: null, ageMs: 0 }, reducedMotion: true }));
    expect(html).toContain("Elegivel");
    expect(html).toContain("Bloqueado");
    expect(html.match(/<details[ >]/g)).toHaveLength(3);
    expect(html.match(/<summary[ >]/g)).toHaveLength(3);
    expect(html).toContain("Detalhes long-5x");
    expect(html).toMatch(/<p[^>]*>long-5x: acima do cap<\/p>/);
    expect(html).toMatch(/<p[^>]*>long-1x: toque de liquidacao/);
  });
  test("parses a full cycle and drops malformed candidates and probabilities", () => {
    const parsed = parseSystemOneCycle(cycle);
    expect(parsed).not.toBeNull();
    expect(parsed!.cycleId).toBe("so-abc");
    expect(parsed!.brief.candidates.map((c) => c.id)).toEqual(["long-1x", "long-2x", "long-5x"]);
    expect(parsed!.decision?.probabilities).toEqual({ hold: 0.2, "long-1x": 0.1, "long-2x": 0.7 });
    expect(parsed!.chosen?.leverage).toBe(2);
    expect(parsed!.brief.limits.leverageCap).toBe(2);
    expect(parsed!.execution).toEqual({ status: "dry_run", reasons: ["system_one_never_executes"] });
  });

  test("a cycle without a decision parses with decision null", () => {
    const parsed = parseSystemOneCycle({ ...cycle, decision: null, chosen: null, execution: { status: "blocked", reasons: ["no_eligible_candidate"] } });
    expect(parsed?.decision).toBeNull();
    expect(parsed?.chosen).toBeNull();
    expect(parsed?.execution.status).toBe("blocked");
  });

  test("rejects anything that is not a cycle", () => {
    expect(parseSystemOneCycle(null)).toBeNull();
    expect(parseSystemOneCycle({})).toBeNull();
    expect(parseSystemOneCycle({ ...cycle, cycleId: "" })).toBeNull();
    expect(parseSystemOneCycle({ ...cycle, brief: { ...cycle.brief, candidates: "no" } })).toBeNull();
  });
});
