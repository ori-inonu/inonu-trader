// T4.5: the Inonu tab shows the latest requests of the ledger. A request ends in the panel that made it, and the list in the tab must not wait for
// the next poll to show it: the panel says "the ledger changed" and the tab reads it again. Nothing here touches the network or the model.
// origin: synthetic_fixture, tests only.
import { describe, expect, test } from "bun:test";
import { createLedgerSignal } from "./ledger-signal";

describe("the signal that the ledger changed", () => {
  test("every listener hears each notice, once, and a listener that left hears nothing", () => {
    const signal = createLedgerSignal();
    let a = 0;
    let b = 0;
    const offA = signal.subscribe(() => (a += 1));
    signal.subscribe(() => (b += 1));
    signal.notify();
    signal.notify();
    expect([a, b]).toEqual([2, 2]);
    offA();
    signal.notify();
    expect([a, b]).toEqual([2, 3]);
  });

  test("a listener that throws does not stop the others", () => {
    const signal = createLedgerSignal();
    let heard = 0;
    signal.subscribe(() => {
      throw new Error("boom");
    });
    signal.subscribe(() => (heard += 1));
    signal.notify();
    expect(heard).toBe(1);
  });

  test("it holds no data: only the fact that something changed", () => {
    const signal = createLedgerSignal();
    const seen: unknown[][] = [];
    signal.subscribe((...args: unknown[]) => seen.push(args));
    signal.notify();
    expect(seen).toEqual([[]]);
  });
});
