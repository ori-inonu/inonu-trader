import { expect, test } from "bun:test";
import { SYNTHETIC_DEX_REPORT } from "../../web/src/lib/dex-report-example";
import { parseDexReport } from "../../web/src/lib/dex-report";
import { projectMobileDecisionReport } from "./report";

const NOW = 1_791_504_000_100;
function input() {
  return {
    schema: "mobile_decision_input_v1",
    snapshot_id: "synthetic-mobile-001",
    revision: "1",
    origin: "synthetic_fixture",
    dex_report: structuredClone(SYNTHETIC_DEX_REPORT),
    source_time_ms: NOW - 200,
    fetched_at_ms: NOW - 50,
    max_age_ms: 1_000,
    api_cost_usd: null,
    jev: null,
  };
}

test("projects the actual DEX contract with exact facts and distinct source/collection clocks", () => {
  const result = projectMobileDecisionReport(input(), { now_ms: NOW });
  expect(result.observed.dex).toEqual(parseDexReport(SYNTHETIC_DEX_REPORT, { nowWallMs: NOW }));
  expect(result.clock).toMatchObject({ source_time_ms: NOW - 200, fetched_at_ms: NOW - 50, source_age_ms: 200, freshness: "fresh" });
  expect(result.observed.dex.outputAtomic).toBe("995000");
  expect(result.observed.dex.quotedGrossDeltaAtomic).toBe("-5000");
  expect(result.evaluation.status).toBe("not_evaluated");
  expect(result.costs.api.amount_usd).toBeNull();
  expect(result.costs.total_coverage).toBe("unknown");
  expect(result.snapshot.synthetic).toBe(true);
  expect(result.validity.execution).toBe("not_qualified");
});

test("missing source time remains unknown despite a freshly fetched report", () => {
  const result = projectMobileDecisionReport({ ...input(), source_time_ms: null }, { now_ms: NOW });
  expect(result.clock.freshness).toBe("unknown");
  expect(result.clock.source_age_ms).toBeNull();
  expect(result.validity.valid_until_ms).toBeNull();
  expect(result.alerts).toContain("source_time_missing");
  expect(result.validity.status).toBe("requires_review");
});

test("a stale source cannot be refreshed by a recent collection and expires at the source TTL", () => {
  const result = projectMobileDecisionReport({ ...input(), source_time_ms: NOW - 1_001 }, { now_ms: NOW });
  expect(result.clock.freshness).toBe("stale");
  expect(result.alerts).toContain("source_stale");
  expect(result.validity.valid_until_ms).toBe(NOW - 1);
  const boundary = projectMobileDecisionReport({ ...input(), source_time_ms: NOW - 1_000 }, { now_ms: NOW });
  expect(boundary.clock.freshness).toBe("fresh");
});

test("future clocks and contradictory chronology are exposed without negative ages", () => {
  const future = projectMobileDecisionReport({ ...input(), source_time_ms: NOW + 1, fetched_at_ms: NOW + 2 }, { now_ms: NOW });
  expect(future.clock.freshness).toBe("future");
  expect(future.clock.source_age_ms).toBeNull();
  expect(future.alerts).toEqual(expect.arrayContaining(["source_future", "fetch_future"]));
  const contradiction = projectMobileDecisionReport({ ...input(), source_time_ms: NOW - 25, fetched_at_ms: NOW - 200 }, { now_ms: NOW });
  expect(contradiction.alerts).toEqual(expect.arrayContaining(["source_after_fetch", "report_after_fetch"]));
  expect(contradiction.validity.status).toBe("requires_review");
});

test("an explicitly replaced identity/revision invalidates the snapshot", () => {
  const first = projectMobileDecisionReport(input(), { now_ms: NOW });
  const changed = projectMobileDecisionReport({ ...input(), revision: "2" }, { now_ms: NOW });
  expect(changed.snapshot.facts_sha256).not.toBe(first.snapshot.facts_sha256);
  const old = projectMobileDecisionReport(input(), { now_ms: NOW, current_binding_sha256: changed.snapshot.facts_sha256 });
  expect(old.validity.status).toBe("invalidated");
  expect(old.alerts).toContain("snapshot_replaced");
});

function receipt(binding: string) {
  return { id: "synthetic-context-001", model: "synthetic-offline", version: "1", evaluated_at_ms: NOW - 25, bound_facts_sha256: binding, observations: ["Contexto sintético fornecido para revisão humana."], limitations: ["Nenhuma inferência foi executada."], input_tokens: null, output_tokens: null, cost_usd: null };
}

test("a supplied contextual receipt stays separate and preserves exact reported costs", () => {
  const base = { ...input(), api_cost_usd: "000.000000000000000000000001" };
  const binding = projectMobileDecisionReport(base, { now_ms: NOW }).snapshot.facts_sha256;
  const result = projectMobileDecisionReport({ ...base, jev: { ...receipt(binding), cost_usd: "0", input_tokens: 0 } }, { now_ms: NOW });
  expect(result.evaluation.status).toBe("provided_context");
  expect(result.evaluation.provenance).toBe("provided_unverified");
  expect(result.evaluation.observations).toEqual(["Contexto sintético fornecido para revisão humana."]);
  expect(result.evaluation.usage).toEqual({ input_tokens: 0, output_tokens: null });
  expect(result.costs.api.amount_usd).toBe("000.000000000000000000000001");
  expect(result.costs.jev).toEqual({ amount_usd: "0", status: "reported_unverified" });
  expect(result.costs.total_coverage).toBe("unknown");
  expect(result.observed.dex.netAtomic).toBeNull();
});

test("mismatched, expired, future and pre-fetch contextual receipts are invalidated", () => {
  const binding = projectMobileDecisionReport(input(), { now_ms: NOW }).snapshot.facts_sha256;
  for (const [change, code] of [
    [{ bound_facts_sha256: "0".repeat(64) }, "jev_binding_mismatch"],
    [{ evaluated_at_ms: NOW - 1_001 }, "jev_stale"],
    [{ evaluated_at_ms: NOW + 1 }, "jev_future"],
    [{ evaluated_at_ms: NOW - 75 }, "jev_before_fetch"],
  ] as const) {
    const result = projectMobileDecisionReport({ ...input(), jev: { ...receipt(binding), ...change } }, { now_ms: NOW });
    expect(result.evaluation.status).toBe("invalidated");
    expect(result.evaluation.observations).toEqual([]);
    expect(result.alerts).toContain(code);
    expect(result.validity.status).toBe("invalidated");
  }
});

test("invalid fields fail with a fixed error and unknown fields/accessors never escape", () => {
  for (const bad of [null, [], { ...input(), source_time_ms: NaN }, { ...input(), api_cost_usd: 0 }, { ...input(), jev: {} }, { ...input(), max_age_ms: 0 }, { ...input(), revision: "<script>" }]) {
    expect(() => projectMobileDecisionReport(bad, { now_ms: NOW })).toThrow("Invalid mobile decision report.");
  }
  const base = input();
  Object.defineProperty(base, "apiKey", { enumerable: true, get() { throw new Error("unknown accessor must not run"); } });
  (base.dex_report as Record<string, unknown>).privateKey = "synthetic-extra-field-must-disappear";
  const result = projectMobileDecisionReport(base, { now_ms: NOW });
  expect(JSON.stringify(result)).not.toContain("privateKey");
  expect(JSON.stringify(result)).not.toContain("synthetic-extra-field-must-disappear");
  const invalidDex = structuredClone(SYNTHETIC_DEX_REPORT) as Record<string, unknown>;
  invalidDex.outputAtomic = "995001";
  expect(() => projectMobileDecisionReport({ ...input(), dex_report: invalidDex }, { now_ms: NOW })).toThrow("Invalid mobile decision report.");
});
