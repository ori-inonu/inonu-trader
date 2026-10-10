"use client";

import { useEffect, useState } from "react";

export const EASE = {
  outExpo: "cubic-bezier(0.16, 1, 0.3, 1)",
  outBack: "cubic-bezier(0.34, 1.56, 0.64, 1)",
  snap: "cubic-bezier(0.2, 0.9, 0.2, 1)",
  inout: "cubic-bezier(0.65, 0, 0.35, 1)",
} as const;

export const DUR = {
  instant: 90,
  fast: 160,
  base: 260,
  slow: 420,
  cinematic: 620,
} as const;

export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(query.matches);
    const onChange = (event: MediaQueryListEvent) => setReduced(event.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  return reduced;
}

/** Short accent pulse on a value change. Strict no-op when the element is gone or motion is reduced. */
export function flashValue(el: Element | null, reduced: boolean): void {
  if (!el || reduced) return;
  if (typeof el.animate !== "function") return;
  el.animate(
    [
      { color: "var(--signal)", offset: 0 },
      { color: "currentColor", offset: 1 },
    ],
    { duration: DUR.slow, easing: EASE.outExpo },
  );
}

/** Cross fade used when a value swaps in place. Strict no-op when the element is gone or motion is reduced. */
export function playSwap(el: Element | null, reduced: boolean): void {
  if (!el || reduced) return;
  if (typeof el.animate !== "function") return;
  el.animate(
    [
      { opacity: 0, transform: "translateY(4px)" },
      { opacity: 1, transform: "translateY(0)" },
    ],
    { duration: DUR.base, easing: EASE.outExpo },
  );
}