"use client";

import { useEffect, useRef } from "react";

export interface RafLoop {
  start: () => void;
  stop: () => void;
}

/**
 * Owns one requestAnimationFrame loop.
 * The loop refuses to start while the tab is hidden, rechecks visibility on every frame so a
 * hidden tab stops within one frame, and cancels its pending frame on stop.
 */
export function createRafLoop(fn: (now: number) => void, isVisible: () => boolean): RafLoop {
  let handle = 0;

  const step = (now: number): void => {
    if (!isVisible()) {
      handle = 0;
      return;
    }
    fn(now);
    handle = requestAnimationFrame(step);
  };

  return {
    start() {
      if (handle !== 0) return;
      if (!isVisible()) return;
      handle = requestAnimationFrame(step);
    },
    stop() {
      if (handle === 0) return;
      cancelAnimationFrame(handle);
      handle = 0;
    },
  };
}

/** Runs fn on every animation frame while active, and never while the tab is hidden. */
export function useRafLoop(fn: (now: number) => void, active: boolean): void {
  const callback = useRef(fn);
  callback.current = fn;

  useEffect(() => {
    if (!active) return;

    const loop = createRafLoop(
      (now) => callback.current(now),
      () => typeof document === "undefined" || document.visibilityState === "visible",
    );
    loop.start();

    return () => loop.stop();
  }, [active]);
}