import { expect, test } from "bun:test";
import { annotateDecisionWeights } from "./weights";

test("historical unit weights retain their value without implying provider provenance", () => {
  const decision = Object.freeze({
    action: "buy",
    probabilities: Object.freeze({ buy: 1, sell: 0, hold: 0 }),
    status: "ok",
    confidence: 1,
    privateText: "must not escape",
  });
  const evidence = Object.freeze({ kind: "historical_record" });
  const before = JSON.stringify({ decision, evidence });

  expect(annotateDecisionWeights(decision, evidence)).toEqual({
    schemaVersion: 1,
    origin: "unknown",
    selectedWeight: 1,
    reportedSelectedWeight: null,
    financialCalibration: "not_established",
  });
  expect(JSON.stringify({ decision, evidence })).toBe(before);
});

test("reported weights are normalized without requiring the chosen action to be the largest", () => {
  for (const fixture of [
    { probabilities: { buy: 0.5, sell: 0.25, hold: 0.25 }, raw: { buy: 2, sell: 1, hold: 1 }, selected: 0.5 },
    { probabilities: { buy: 0.2, sell: 0.8, hold: 0 }, raw: { buy: 1, sell: 4, hold: 0 }, selected: 0.2 },
  ]) {
    expect(annotateDecisionWeights(
      { action: "buy", probabilities: fixture.probabilities, status: "ok" },
      { kind: "observed_response", raw: { choice: "buy", probabilities: fixture.raw } },
    )).toEqual({
      schemaVersion: 1, origin: "provider_reported", selectedWeight: fixture.selected,
      reportedSelectedWeight: fixture.selected, financialCalibration: "not_established",
    });
  }
});

test("compatible explicit vectors are supported for every action, including missing or null unused weights", () => {
  for (const fixture of [
    { action: "buy", probabilities: { buy: 1, sell: 0, hold: 0 }, raw: { buy: 3, sell: null } },
    { action: "sell", probabilities: { buy: 0, sell: 1, hold: 0 }, raw: { sell: 3, hold: null } },
    { action: "hold", probabilities: { buy: 0, sell: 0, hold: 1 }, raw: { hold: 3, buy: null } },
  ]) {
    expect(annotateDecisionWeights(
      { action: fixture.action, probabilities: fixture.probabilities, status: "ok" },
      { kind: "observed_response", raw: { choice: fixture.action, probabilities: fixture.raw } },
    )).toEqual({
      schemaVersion: 1, origin: "provider_reported", selectedWeight: 1,
      reportedSelectedWeight: 1, financialCalibration: "not_established",
    });
  }
});

test("missing, historical or malformed evidence cannot establish origin", () => {
  const decision = { action: "buy", probabilities: { buy: 1, sell: 0, hold: 0 }, status: "ok" };
  for (const evidence of [
    undefined, null, [], "observed_response", {}, { kind: "historical_record" },
    { kind: "other", raw: { choice: "buy" } }, { kind: "observed_response" },
    { kind: "observed_failure" }, { kind: "observed_failure", status: "malformed" },
  ]) {
    expect(annotateDecisionWeights(decision, evidence)).toEqual({
      schemaVersion: 1, origin: "unknown", selectedWeight: 1,
      reportedSelectedWeight: null, financialCalibration: "not_established",
    });
  }
});

test("choice, vector and status mismatches keep origin unknown", () => {
  const buy = { action: "buy", probabilities: { buy: 1, sell: 0, hold: 0 }, status: "ok" };
  for (const raw of [
    { choice: "sell", probabilities: { buy: 0, sell: 1, hold: 0 } },
    { choice: "buy", probabilities: { buy: 1, sell: 1, hold: 0 } },
    { choice: "buy", probabilities: null },
  ]) {
    expect(annotateDecisionWeights(buy, { kind: "observed_response", raw })).toEqual({
      schemaVersion: 1, origin: "unknown", selectedWeight: 1,
      reportedSelectedWeight: null, financialCalibration: "not_established",
    });
  }
  for (const status of ["malformed", "error", "timeout"]) {
    const decision = { action: "hold", probabilities: { buy: 0, sell: 0, hold: 1 }, status };
    for (const evidence of [
      { kind: "observed_response", raw: { choice: "hold", probabilities: { buy: 0, sell: 0, hold: 1 } } },
      { kind: "observed_failure", status: "ok" },
      { kind: "observed_failure", status: status === "timeout" ? "error" : "timeout" },
    ]) {
      expect(annotateDecisionWeights(decision, evidence)).toEqual({
        schemaVersion: 1, origin: "unknown", selectedWeight: null,
        reportedSelectedWeight: null, financialCalibration: "not_established",
      });
    }
  }
  expect(annotateDecisionWeights(
    { action: "hold", probabilities: { buy: 0.1, sell: 0, hold: 0.9 }, status: "error" },
    { kind: "observed_failure", status: "error" },
  )?.origin).toBe("unknown");
});

test("malformed response values match the observed adapter validation contract", () => {
  const decision = { action: "hold", probabilities: { buy: 0, sell: 0, hold: 1 }, status: "malformed" };
  for (const raw of [
    undefined, null, [], "buy", {}, { choice: "wait" },
    { choice: "buy", probabilities: null },
    { choice: "buy", probabilities: [1, 0, 0] },
    { choice: "buy", probabilities: { buy: "1" } },
    { choice: "buy", probabilities: { buy: 1, sell: -1 } },
    { choice: "buy", probabilities: { buy: NaN } },
    { choice: "buy", probabilities: { buy: Infinity } },
    { choice: "buy", probabilities: { buy: 1, hold: -Infinity } },
    { choice: "buy", probabilities: { buy: Number.MAX_VALUE, sell: Number.MAX_VALUE } },
    { choice: "buy", probabilities: { buy: 0, sell: 1, hold: 0 } },
    { choice: "buy", probabilities: {} },
  ]) {
    expect(annotateDecisionWeights(decision, { kind: "observed_response", raw })).toEqual({
      schemaVersion: 1, origin: "adapter_safety_fallback", selectedWeight: null,
      reportedSelectedWeight: null, financialCalibration: "not_established",
    });
  }
});

test("vector comparisons accept the absolute boundary and do not repair larger differences", () => {
  const raw = { kind: "observed_response", raw: { choice: "buy", probabilities: { buy: 1, sell: 0, hold: 0 } } };
  expect(annotateDecisionWeights(
    { action: "buy", probabilities: { buy: 1 - 1e-12, sell: 1e-12, hold: 0 }, status: "ok" }, raw,
  )).toEqual({
    schemaVersion: 1, origin: "provider_reported", selectedWeight: 1 - 1e-12,
    reportedSelectedWeight: 1 - 1e-12, financialCalibration: "not_established",
  });
  expect(annotateDecisionWeights(
    { action: "buy", probabilities: { buy: 1 - 2e-12, sell: 2e-12, hold: 0 }, status: "ok" }, raw,
  )?.origin).toBe("unknown");
  expect(annotateDecisionWeights(
    { action: "buy", probabilities: { buy: 1, sell: 0.5e-12, hold: 0 }, status: "ok" }, undefined,
  )?.selectedWeight).toBe(1);
  expect(annotateDecisionWeights(
    { action: "buy", probabilities: { buy: 1, sell: 2e-12, hold: 0 }, status: "ok" }, undefined,
  )).toBeNull();
});

test("repeated annotations of frozen provider evidence remain pure and exclude extra fields", () => {
  const decision = Object.freeze({
    action: "sell", status: "ok", probabilities: Object.freeze({ buy: 0.25, sell: 0.5, hold: 0.25 }),
    confidence: 0.5, model: "fixture-model", text: "fixture private text",
  });
  const evidence = Object.freeze({ kind: "observed_response", raw: Object.freeze({
    choice: "sell", probabilities: Object.freeze({ buy: 1, sell: 2, hold: 1 }),
    token: "synthetic-token", text: "untrusted instruction",
  }) });
  const before = JSON.stringify({ decision, evidence });
  const expected = {
    schemaVersion: 1, origin: "provider_reported", selectedWeight: 0.5,
    reportedSelectedWeight: 0.5, financialCalibration: "not_established",
  } as const;
  expect(annotateDecisionWeights(decision, evidence)).toEqual(expected);
  expect(annotateDecisionWeights(decision, evidence)).toEqual(expected);
  expect(JSON.stringify({ decision, evidence })).toBe(before);
  expect(Object.keys(annotateDecisionWeights(decision, evidence)!)).toEqual([
    "schemaVersion", "origin", "selectedWeight", "reportedSelectedWeight", "financialCalibration",
  ]);
});

test("invalid responses and observed matching failures identify only canonical safety holds", () => {
  const malformed = { action: "hold", probabilities: { buy: 0, sell: 0, hold: 1 }, status: "malformed" };
  for (const raw of [
    { choice: "buy", probabilities: { buy: 0, sell: 0, hold: 0 } },
    { choice: "buy", probabilities: { buy: Number.MIN_VALUE, sell: 2, hold: 0 } },
  ]) {
    expect(annotateDecisionWeights(malformed, { kind: "observed_response", raw })).toEqual({
      schemaVersion: 1, origin: "adapter_safety_fallback", selectedWeight: null,
      reportedSelectedWeight: null, financialCalibration: "not_established",
    });
  }
  for (const status of ["error", "timeout"]) {
    expect(annotateDecisionWeights({ ...malformed, status }, { kind: "observed_failure", status })).toEqual({
      schemaVersion: 1, origin: "adapter_safety_fallback", selectedWeight: null,
      reportedSelectedWeight: null, financialCalibration: "not_established",
    });
  }
});

test("a contemporaneous explicit unit vector is provider reported, while an absent vector is a choice fallback", () => {
  const decision = { action: "buy", probabilities: { buy: 1, sell: 0, hold: 0 }, status: "ok" };
  expect(annotateDecisionWeights(decision, {
    kind: "observed_response", raw: { choice: "buy", probabilities: { buy: 1, sell: 0, hold: 0 } },
  })).toEqual({
    schemaVersion: 1, origin: "provider_reported", selectedWeight: 1,
    reportedSelectedWeight: 1, financialCalibration: "not_established",
  });
  expect(annotateDecisionWeights(decision, { kind: "observed_response", raw: { choice: "buy" } })).toEqual({
    schemaVersion: 1, origin: "adapter_choice_fallback", selectedWeight: 1,
    reportedSelectedWeight: null, financialCalibration: "not_established",
  });
});

test("invalid decisions return null instead of inventing weights or status", () => {
  const valid = { action: "buy", probabilities: { buy: 1, sell: 0, hold: 0 }, status: "ok" };
  for (const decision of [
    null, [], "buy", {},
    { ...valid, action: "wait" },
    { ...valid, status: "unknown" },
    { ...valid, status: "error" },
    { ...valid, probabilities: null },
    { ...valid, probabilities: [1, 0, 0] },
    { ...valid, probabilities: { buy: 1, sell: 0 } },
    { ...valid, probabilities: { buy: "1", sell: 0, hold: 0 } },
    { ...valid, probabilities: { buy: NaN, sell: 0, hold: 0 } },
    { ...valid, probabilities: { buy: Infinity, sell: 0, hold: 0 } },
    { ...valid, probabilities: { buy: 1.1, sell: -0.1, hold: 0 } },
    { ...valid, probabilities: { buy: 0, sell: 1, hold: 0 } },
    { ...valid, probabilities: { buy: 0.9, sell: 0, hold: 0 } },
  ]) {
    expect(annotateDecisionWeights(decision, { kind: "historical_record" })).toBeNull();
  }
});
