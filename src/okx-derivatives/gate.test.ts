import { expect, test } from "bun:test";
import { classifyReason, decideVerdict } from "./gate.ts";
import { INELIGIBLE_REASON_CODES, UNAVAILABLE_REASON_CODES } from "./types.ts";

test("OKX-DERIV D11: every reason code has exactly one class and the two classes do not overlap", () => {
  for (const code of INELIGIBLE_REASON_CODES) expect(classifyReason(code)).toBe("ineligible");
  for (const code of UNAVAILABLE_REASON_CODES) expect(classifyReason(code)).toBe("unavailable");
  const overlap = INELIGIBLE_REASON_CODES.filter((code) => (UNAVAILABLE_REASON_CODES as readonly string[]).includes(code));
  expect(overlap).toEqual([]);
  expect(new Set([...INELIGIBLE_REASON_CODES, ...UNAVAILABLE_REASON_CODES]).size).toBe(INELIGIBLE_REASON_CODES.length + UNAVAILABLE_REASON_CODES.length);
});

test("OKX-DERIV D11: a misspelled or unknown reason code is a programming error, not a silent pass", () => {
  expect(() => classifyReason("limit:leverage_over_cap")).toThrow(RangeError);
  expect(() => decideVerdict(["not_a_reason"])).toThrow(RangeError);
});

test("OKX-DERIV D11: no reasons means eligible", () => {
  expect(decideVerdict([])).toEqual({ status: "eligible", reasons: [] });
});

test("OKX-DERIV D11: a definitive limit makes the verdict ineligible even when data is also missing", () => {
  expect(decideVerdict(["limit:leverage_above_cap"])).toEqual({ status: "ineligible", reasons: ["limit:leverage_above_cap"] });
  expect(decideVerdict(["stale:mark"])).toEqual({ status: "unavailable", reasons: ["stale:mark"] });
  expect(decideVerdict(["unknown:fee_perp_taker", "limit:leverage_above_cap"])).toEqual({
    status: "ineligible",
    reasons: ["limit:leverage_above_cap", "unknown:fee_perp_taker"],
  });
  expect(decideVerdict(["access:derivatives_denied"]).status).toBe("ineligible");
  expect(decideVerdict(["model:directional_no_modeled_edge"]).status).toBe("ineligible");
});

test("OKX-DERIV D11: reasons are unique and sorted so the output is deterministic", () => {
  const shuffled = ["unknown:maintenance_margin_rate", "depth:perp_open", "limit:liquidation_distance_below_floor", "depth:perp_open", "stale:funding"];
  const first = decideVerdict(shuffled);
  const second = decideVerdict([...shuffled].reverse());
  expect(first).toEqual(second);
  expect(first.reasons).toEqual(["depth:perp_open", "limit:liquidation_distance_below_floor", "stale:funding", "unknown:maintenance_margin_rate"]);
  expect(decideVerdict(new Set(shuffled)).reasons).toEqual(first.reasons);
});
