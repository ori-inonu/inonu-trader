import { describe, expect, test } from "bun:test";
import { eligibleTaskSet, objectiveTerminal, propagateBlockedDependencies, type SddTaskPlan, type TaskGraphView } from "./scheduler";
const plan: SddTaskPlan = { version: 1, id: "f03", objective: "Verify scheduling", authorizedScope: "local SDD harness", sourcePath: "tasks.json", sourceHash: "0".repeat(64), tasks: [
  { id: "A", title: "Base", acceptance: ["base works"], dependsOn: [], writePaths: ["scripts/sdd-harness/**"], verifyArgv: [["bun", "--no-env-file", "test"]], risk: "low", reversible: true },
  { id: "B", title: "Dependent", acceptance: ["dependent works"], dependsOn: ["A"], writePaths: ["docs/specs/**"], verifyArgv: [["bun", "--no-env-file", "run", "typecheck"]], risk: "low", reversible: true },
  { id: "C", title: "Independent", acceptance: ["independent works"], dependsOn: [], writePaths: ["tooling/sdd-harness/**"], verifyArgv: [["bun", "--no-env-file", "test"]], risk: "medium", reversible: true },
] };
function state(status: Record<string, "todo" | "running" | "done" | "blocked">): TaskGraphView { return { tasks: plan.tasks.map(t => ({ id: t.id, status: status[t.id] ?? "todo" })) }; }
describe("autonomous SDD task graph", () => {
  test("selects only ready tasks and unblocks dependencies after verification", () => {
    const s = state({});
    expect(eligibleTaskSet(plan, s).map((x) => x.id)).toEqual(["A", "C"]);
    s.tasks.find((x) => x.id === "A")!.status = "done";
    expect(eligibleTaskSet(plan, s).map((x) => x.id)).toEqual(["B", "C"]);
  });
  test("blocks dependents but continues independent work", () => {
    const s = state({ A: "blocked" });
    expect(propagateBlockedDependencies(plan, s)).toBe(true);
    expect(s.tasks.find((x) => x.id === "B")?.status).toBe("blocked");
    expect(eligibleTaskSet(plan, s).map((x) => x.id)).toEqual(["C"]);
  });
  test("reports blocked terminal state only when no eligible task remains", () => {
    const s = state({ A: "blocked", B: "blocked", C: "blocked" });
    expect(objectiveTerminal(plan, s)).toBe("blocked");
    s.tasks.find((x) => x.id === "C")!.status = "done";
    expect(objectiveTerminal(plan, s)).toBe("blocked");
  });
});
