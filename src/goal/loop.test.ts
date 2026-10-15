import { describe, expect, test } from "bun:test";
import { addTask, bearings, blockTask, decide, humanReturned, LIMITS, markPassed, newState, onStop, STAGES, type GoalState, type StopInput } from "./loop";

const NOW = Date.UTC(2026, 9, 15, 16, 0, 0);
const SESSION = "b042d27b-ae6e-41ff-9200-03525d35a410";
const input = (over: Partial<StopInput> = {}): StopInput => ({ sessionId: SESSION, nowMs: NOW, digest: "d0", goalAchieved: null, ...over });
const state = (over: Partial<GoalState> = {}): GoalState => ({ ...newState({ sessionId: SESSION, goal: "Find the path to the owner's goal.", nowMs: NOW - 3_600_000, deadlineMs: NOW + 8 * 3_600_000, checkCommand: null, rails: ["Never place an order."] }), ...over });

describe("a stop is answered with the next step of the workflow, and never with the same report twice", () => {
  test("a session the goal does not belong to is never held back", () => {
    expect(onStop(state(), input({ sessionId: "another-session" })).output).toBeNull();
  });

  test("with no goal active the session may stop", () => {
    expect(onStop(state({ active: false }), input()).output).toBeNull();
  });

  test("a paused goal lets the session stop", () => {
    expect(onStop(state({ paused: true }), input()).output).toBeNull();
  });

  test("a goal whose check says it is achieved is closed and the session may stop", () => {
    const r = onStop(state(), input({ goalAchieved: true }));
    expect([r.output, r.state.active]).toEqual([null, false]);
  });

  test("past the deadline of the day the goal is closed and the session may stop", () => {
    const r = onStop(state({ deadlineMs: NOW - 1 }), input());
    expect([r.output, r.state.active]).toEqual([null, false]);
  });

  test("with a task waiting, the stop continues with that task, its stage and how to record it", () => {
    const s = addTask(state(), { stage: "planejar", title: "Write the plan of the outcome evaluator" });
    const r = onStop(s, input());
    expect([r.output?.decision, r.output?.reason.includes("Write the plan of the outcome evaluator"), r.output?.reason.includes("planejar")]).toEqual(["block", true, true]);
  });

  test("the task it hands over is marked as being done, so the next stop does not hand it over again", () => {
    const s = addTask(state(), { stage: "planejar", title: "Plan the rollout" });
    expect(onStop(s, input()).state.queue[0]!.status).toBe("doing");
  });

  test("with nothing in the queue the stop sends the session to the wayfinder step with the consensus tool, not to a report", () => {
    const r = onStop(state(), input());
    expect([r.output?.reason.includes("jev-consensus"), r.output?.reason.includes("consensus_run")]).toEqual([true, true]);
  });

  test("a finished task leaves the queue and the next one is handed over", () => {
    let s = addTask(addTask(state(), { stage: "planejar", title: "First" }), { stage: "implementar", title: "Second" });
    s = markPassed(onStop(s, input()).state, s.queue[0]!.id, "docs/plan.md");
    expect(onStop(s, input({ digest: "d1" })).output?.reason).toContain("Second");
  });

  test("a stop with nothing new since the last one is counted as idle", () => {
    const first = onStop(state(), input({ digest: "same" }));
    const second = onStop(first.state, input({ digest: "same" }));
    expect(second.state.loop.idleStops).toBe(1);
  });

  test("a stop with something new resets the idle count", () => {
    const first = onStop(state(), input({ digest: "a" }));
    const second = onStop(first.state, input({ digest: "a" }));
    expect(onStop(second.state, input({ digest: "b" })).state.loop.idleStops).toBe(0);
  });

  test("after two idle stops the wayfinder step comes first, even with a task waiting", () => {
    let s = addTask(state(), { stage: "implementar", title: "Build the thing" });
    s = onStop(s, input({ digest: "x" })).state;
    s = onStop(s, input({ digest: "x" })).state;
    s = onStop(s, input({ digest: "x" })).state;
    const r = onStop(s, input({ digest: "x" }));
    expect(r.output?.reason).toContain("consensus_run");
  });

  test("after too many idle stops the session may stop and the question for the person is recorded", () => {
    let s = state();
    for (let i = 0; i < LIMITS.maxIdleStops + 1; i++) s = onStop(s, input({ digest: "same" })).state;
    expect([onStop(s, input({ digest: "same" })).output, s.needsHuman !== null]).toEqual([null, true]);
  });

  test("past the hourly cap of continuations the session may stop and says why", () => {
    const stamps = Array.from({ length: LIMITS.maxBlocksPerHour }, (_, i) => NOW - i * 1000);
    const r = onStop(state({ loop: { stops: 0, blocks: 0, idleStops: 0, lastDigest: null, blockStamps: stamps } }), input());
    expect([r.output, r.state.needsHuman !== null]).toEqual([null, true]);
  });

  test("a task recorded as blocked leaves the queue with its reason, so it is not handed over again", () => {
    const s = addTask(state(), { stage: "implementar", title: "Needs the quota" });
    const blocked = blockTask(s, s.queue[0]!.id, "the real quota of the account is unknown");
    expect([blocked.queue[0]!.status, onStop(blocked, input()).output?.reason.includes("Needs the quota")]).toEqual(["blocked", false]);
  });

  test("when everything left is blocked, the first repeated stop releases the session with the blocked reasons as the question, instead of sending the wayfinder again", () => {
    let s = addTask(state(), { stage: "planejar", title: "Owner decision on the hot interval" });
    s = blockTask(s, s.queue[0]!.id, "only the owner decides what changes the live behavior");
    const first = onStop(s, input({ digest: "same" }));
    const second = onStop(first.state, input({ digest: "same" }));
    expect([first.output?.decision, second.output, second.state.needsHuman?.includes("only the owner decides")]).toEqual(["block", null, true]);
  });

  test("a queue that still has a task to do is never released by the blocked rule", () => {
    let s = addTask(addTask(state(), { stage: "planejar", title: "Blocked one" }), { stage: "implementar", title: "Open one" });
    s = blockTask(s, s.queue[0]!.id, "waits for the owner");
    const second = onStop(onStop(s, input({ digest: "same" })).state, input({ digest: "same" }));
    expect(second.output?.decision).toBe("block");
  });

  test("a decision is logged with its receipt hash and the paid calls it cost", () => {
    const s = decide(state(), { summary: "Ship the recorder first", receiptHash: "abc", paidCalls: 9, nowMs: NOW });
    expect([s.decisions.length, s.decisions[0]!.paidCalls]).toEqual([1, 9]);
  });

  test("the reason always carries the rails, so a long session does not forget them", () => {
    expect(onStop(state(), input()).output?.reason).toContain("Never place an order.");
  });

  test("the stages are the ones Anthropic recommends, in order: explore, plan, implement, verify, record", () => {
    expect(STAGES).toEqual(["explorar", "planejar", "implementar", "verificar", "registrar"]);
  });

  test("a feature does not pass by being said to pass: only markPassed sets it, and a new feature starts as not passing", () => {
    const s = addTask(state(), { stage: "implementar", title: "Feature", verify: "bun test src/consensus" });
    expect([s.queue[0]!.passes, markPassed(s, "t1", "44 passam").queue[0]!.passes]).toEqual([false, true]);
  });

  test("the message of a task shows what must be ready and the command that proves it, with exit 0 as the pass", () => {
    const s = addTask(state(), { stage: "implementar", title: "Feature", steps: ["the judge returns a receipt"], verify: "bun test src/consensus" });
    const reason = onStop(s, input()).output!.reason;
    expect([reason.includes("the judge returns a receipt"), reason.includes("bun test src/consensus"), reason.includes("exit 0")]).toEqual([true, true, true]);
  });

  test("each stage says how to do it: the plan goes to a file with what is out of scope, the verify stage runs the check and calls the reviewer", () => {
    const plan = onStop(addTask(state(), { stage: "planejar", title: "P" }), input()).output!.reason;
    const verify = onStop(addTask(state(), { stage: "verificar", title: "V" }), input()).output!.reason;
    expect([plan.includes("FORA de escopo"), verify.includes("jev-reviewer")]).toEqual([true, true]);
  });

  test("the wayfinder message asks for a path, never for a verdict that there is none", () => {
    expect(onStop(state(), input()).output!.reason).toContain("nunca feche um caminho");
  });

  test("the bearings at a session start list the features with their passes and what the person is waited for", () => {
    const s = markPassed(addTask(addTask(state(), { stage: "planejar", title: "A" }), { stage: "implementar", title: "B" }), "t1", "ok");
    const text = bearings({ ...s, needsHuman: "Which path?" });
    expect([text.includes("1 de 2 passaram"), text.includes("[x] t1"), text.includes("Which path?")]).toEqual([true, true, true]);
  });

  test("when the person comes back the loop counts again", () => {
    const s = humanReturned({ ...state(), needsHuman: "x", loop: { stops: 9, blocks: 5, idleStops: 4, lastDigest: "d", blockStamps: [] } });
    expect([s.needsHuman, s.loop.idleStops]).toEqual([null, 0]);
  });
});
