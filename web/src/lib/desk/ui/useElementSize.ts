"use client";

import { type RefObject, useEffect, useLayoutEffect, useRef, useState } from "react";

export interface Size {
  readonly width: number;
  readonly height: number;
}

const useIsomorphicLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

/**
 * Tracks the layout size of an element with a ResizeObserver. Layout size is not affected by CSS
 * transforms, so a panel inside a tilted 3D wing measures its real box, not the projected one.
 * `fallback` is what the server and the first paint use before the box has been measured.
 */
export function useElementSize<T extends HTMLElement>(fallback: Size): [RefObject<T | null>, Size] {
  const ref = useRef<T | null>(null);
  const [size, setSize] = useState<Size>(fallback);

  useIsomorphicLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;

    const apply = (width: number, height: number): void => {
      setSize((current) =>
        Math.abs(current.width - width) < 0.5 && Math.abs(current.height - height) < 0.5
          ? current
          : { width: Math.round(width), height: Math.round(height) },
      );
    };

    apply(element.clientWidth, element.clientHeight);
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) apply(entry.contentRect.width, entry.contentRect.height);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return [ref, size];
}
