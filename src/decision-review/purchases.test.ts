import { expect, test } from "bun:test";
import { auditConsult } from "./audit";
import { summarizePurchases } from "./purchases";

function row(id: string, requested: string | null, selected: string, options = ["skip", "buy_full"], valid = true) {
  const r = { cycleId: id, atMs: 1000, mode: "limitado", posture: "neutra", criteria: "rank-v1", legend: "scoped-v1", candidates: [{ id: "synthetic:buy", kind: "buy", stances: options, marks: [] }],
    stances: { "synthetic:buy": selected }, ...(requested === null ? {} : { requested: { "synthetic:buy": requested } }), valid, invalidReason: valid ? null : "agente_perfil_invalido", notes: [], contexto: null, historico: null };
  return auditConsult(r)!;
}
test("a forced skip, a model skip and a purchase changed to skip are counted separately", () => {
  const result = summarizePurchases([row("closed", "skip", "skip", ["skip"]), row("model", "skip", "skip"), row("code", "buy_full", "skip")]);
  expect(result.groups[0]).toMatchObject({ consultations: 3, purchaseCandidates: 3, closedBeforeChoice: 1, modelSkipped: 1, requestedBuys: 1, buysChangedToSkip: 1, retainedBuys: 0, unattributed: 0 });
  expect(result.financialPerformance).toBe("not_evaluated");
});
test("a retained purchase is a decision only, with no inferred execution or profit", () => {
  const result = summarizePurchases([row("buy", "buy_full", "buy_full")]);
  expect(result.groups[0]).toMatchObject({ requestedBuys: 1, retainedBuys: 1, buysChangedToSkip: 0 });
  expect(result.execution).toBe("not_inferred");
});
test("rejected answers and missing legacy requests never become model choices by reconstruction", () => {
  expect(summarizePurchases([row("invalid", "buy_full", "skip", undefined, false), row("legacy", null, "skip")]).groups[0]).toMatchObject({ unattributed: 2, requestedBuys: 0, modelSkipped: 0 });
});
test("late updates replace the same cycle and variants and modes remain separate", () => {
  const a = row("a", "buy_full", "skip"), b = { ...row("b", "skip", "skip"), criteriaVersion: null, legendVersion: null };
  const result = summarizePurchases([a, b, { ...a, mode: "sombra" }, { ...a, candidates: [ { ...a.candidates[0]!, selected: "buy_full", source: "model_choice" } ] }, { ...row("c", "skip", "skip"), mode: "sombra" }]);
  expect(result.consultations).toBe(3);
  expect(result.groups).toHaveLength(3);
  expect(result.groups.find(g => g.criteriaVersion === "rank-v1" && g.mode === "limitado")).toMatchObject({ retainedBuys: 1, buysChangedToSkip: 0 });
  expect(result.groups.find(g => g.mode === "sombra")).toMatchObject({ modelSkipped: 1, consultations: 1 });
  expect(result.groups.find(g => g.criteriaVersion === null)).toMatchObject({ consultations: 1 });
});
