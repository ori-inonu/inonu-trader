"use client";

/**
 * The board of the opportunity engine for the page: read when the radar is on screen, every two seconds while the core is still reading (so the progress moves) and once a minute after,
 * which is also what makes the core read again when its board is older than ten minutes. It pauses while the page is hidden and reads once when it is shown again. Free and never the model.
 */
import { useEffect, useRef, useState } from "react";
import { createEngineClient, type EngineOutcome } from "./client";
import type { EngineState } from "./engine";

export const POLL_READING_MS = 2_000;
export const POLL_READY_MS = 60_000;

export interface EngineView {
  /** The last state the core gave; null before the first answer. */
  readonly state: EngineState | null;
  /** Why the last read failed, or null when it worked. */
  readonly reason: Extract<EngineOutcome, { ok: false }>["reason"] | null;
}

export function useEngineBoard(enabled = true): EngineView {
  const [view, setView] = useState<EngineView>({ state: null, reason: null });
  const client = useRef(createEngineClient());

  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const controller = new AbortController();

    const next = (state: EngineState | null) => {
      if (!alive) return;
      timer = setTimeout(() => void tick(), state?.state === "lendo" ? POLL_READING_MS : POLL_READY_MS);
    };
    const tick = async () => {
      if (!alive) return;
      if (document.visibilityState === "hidden") return next(null);
      const out = await client.current.read(controller.signal);
      if (!alive) return;
      if (out.ok) setView({ state: out.state, reason: null });
      else setView((v) => ({ state: v.state, reason: out.reason }));
      next(out.ok ? out.state : null);
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        if (timer !== null) clearTimeout(timer);
        void tick();
      }
    };
    void tick();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      alive = false;
      if (timer !== null) clearTimeout(timer);
      controller.abort();
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [enabled]);

  return view;
}
