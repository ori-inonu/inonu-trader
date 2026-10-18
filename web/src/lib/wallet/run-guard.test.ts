// T9.5, T9.6: one run at a time for the screen that reads the ladder. A run that was replaced or invalidated (a new draft, an unmount) must never write
// into the screen again, even if it finishes later; a run the person stopped still writes its last state, which is what stopping means. No clock, no
// network. origin: synthetic_fixture, tests only.
import { describe, expect, test } from "bun:test";
import { createRunGuard } from "./run-guard";

describe("one run at a time", () => {
  test("a new run stops the old one, and only the new one is current", () => {
    const guard = createRunGuard();
    const a = guard.begin();
    expect(a.isCurrent()).toBe(true);
    expect(a.signal.aborted).toBe(false);
    const b = guard.begin();
    expect(a.signal.aborted).toBe(true);
    expect(a.isCurrent()).toBe(false);
    expect(b.isCurrent()).toBe(true);
    expect(b.signal.aborted).toBe(false);
  });

  test("invalidating (another draft, the screen leaving) stops the run AND makes it stale: it can no longer write", () => {
    const guard = createRunGuard();
    const a = guard.begin();
    guard.invalidate();
    expect(a.signal.aborted).toBe(true);
    expect(a.isCurrent()).toBe(false);
    // and a run started afterwards is a fresh one
    const b = guard.begin();
    expect(b.isCurrent()).toBe(true);
    expect(a.isCurrent()).toBe(false);
  });

  test("stopping (the person pressed Cancelar) aborts the request but the run stays current, so it can still write what it had when it ended", () => {
    const guard = createRunGuard();
    const a = guard.begin();
    guard.stop();
    expect(a.signal.aborted).toBe(true);
    expect(a.isCurrent()).toBe(true);
  });

  test("a run that has finished releases the guard, and releasing a stale run changes nothing", () => {
    const guard = createRunGuard();
    const a = guard.begin();
    const b = guard.begin();
    guard.release(a);
    expect(b.isCurrent()).toBe(true);
    guard.release(b);
    expect(b.isCurrent()).toBe(false);
    expect(guard.running()).toBe(false);
    guard.stop();
    guard.invalidate();
  });

  test("the case that the review found: ladder A is half read, a new draft arrives, and A finishes later: it must not write into the screen of draft B", () => {
    const guard = createRunGuard();
    const screen: string[] = [];
    const a = guard.begin();
    const writeA = (text: string) => {
      if (a.isCurrent()) screen.push(text);
    };
    writeA("A rung 1");
    guard.invalidate(); // the draft changed
    screen.length = 0; // the screen of draft B starts clean
    const b = guard.begin();
    writeA("A rung 2 arriving late");
    if (b.isCurrent()) screen.push("B rung 1");
    expect(screen).toEqual(["B rung 1"]);
  });
});
