import { describe, expect, test } from "bun:test";
import { DUR, EASE, flashValue, playSwap, prefersReducedMotion } from "./motion";

interface FakeElement {
  animate: (keyframes: unknown, options: unknown) => unknown;
}

function fakeElement(): FakeElement & { calls: Array<{ keyframes: unknown; options: unknown }> } {
  const calls: Array<{ keyframes: unknown; options: unknown }> = [];
  return {
    calls,
    animate(keyframes: unknown, options: unknown) {
      calls.push({ keyframes, options });
      return {};
    },
  };
}

describe("motion primitives", () => {
  test("exposes the shared duration and easing scales", () => {
    expect(DUR).toEqual({ instant: 90, fast: 160, base: 260, slow: 420, cinematic: 620 });
    expect(EASE.outExpo).toBe("cubic-bezier(0.16, 1, 0.3, 1)");
    expect(EASE.outBack).toBe("cubic-bezier(0.34, 1.56, 0.64, 1)");
    expect(EASE.snap).toBe("cubic-bezier(0.2, 0.9, 0.2, 1)");
    expect(EASE.inout).toBe("cubic-bezier(0.65, 0, 0.35, 1)");
  });

  test("reports no reduced motion preference when the query is absent", () => {
    expect(prefersReducedMotion()).toBe(false);
  });

  test("flashValue is a strict no-op without an element or with reduced motion", () => {
    const element = fakeElement();

    flashValue(null, false);
    flashValue(element as unknown as Element, true);
    expect(element.calls).toHaveLength(0);

    flashValue(element as unknown as Element, false);
    expect(element.calls).toHaveLength(1);
    expect(element.calls[0].options).toEqual({ duration: DUR.slow, easing: EASE.outExpo });
  });

  test("playSwap is a strict no-op without an element or with reduced motion", () => {
    const element = fakeElement();

    playSwap(null, false);
    playSwap(element as unknown as Element, true);
    expect(element.calls).toHaveLength(0);

    playSwap(element as unknown as Element, false);
    expect(element.calls).toHaveLength(1);
    expect(element.calls[0].options).toEqual({ duration: DUR.base, easing: EASE.outExpo });
  });

  test("flashValue and playSwap never emit an infinite animation", () => {
    const flashed = fakeElement();
    const swapped = fakeElement();
    flashValue(flashed as unknown as Element, false);
    playSwap(swapped as unknown as Element, false);

    for (const calls of [flashed.calls, swapped.calls]) {
      for (const call of calls) {
        const options = call.options as { iterations?: number };
        expect(options.iterations ?? 1).toBe(1);
      }
    }
  });
});