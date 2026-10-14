/**
 * Keeps the chart's reading of the flow engine current (T5.7, T6.4). Reading is free (it never touches the model), but it still
 * must not hammer a core that is down: a failure waits longer each time (capped at a minute), the page being hidden pauses the
 * reads, changing the instrument cancels what is in flight, and a reading older than a minute is dropped instead of being drawn
 * as if it were fresh. Timers, clock and visibility are injected, so every rule is tested without waiting.
 */
import type { ChartOverlay, OverlayOutcome } from "./overlay";

export const OVERLAY_STALE_MS = 60_000;
const MAX_WAIT_MS = 60_000;

export interface OverlayFeedState {
  readonly status: "loading" | "ok" | "erro";
  readonly overlay: ChartOverlay | null;
  /** Why the last read failed; null when it did not. */
  readonly reason: string | null;
}

export interface OverlayFeedDeps {
  readonly client: { fetch(instId: string, signal?: AbortSignal): Promise<OverlayOutcome> };
  readonly instId: string;
  readonly onChange: (state: OverlayFeedState) => void;
  readonly now?: () => number;
  readonly setTimer?: (run: () => void, ms: number) => unknown;
  readonly clearTimer?: (id: unknown) => void;
  readonly isVisible?: () => boolean;
  readonly intervalMs?: number;
}

export function createOverlayFeed(deps: OverlayFeedDeps) {
  const now = deps.now ?? Date.now;
  const setTimer = deps.setTimer ?? ((run, ms) => setTimeout(run, ms));
  const clearTimer = deps.clearTimer ?? ((id) => clearTimeout(id as ReturnType<typeof setTimeout>));
  const isVisible = deps.isVisible ?? (() => typeof document === "undefined" || document.visibilityState !== "hidden");
  const interval = deps.intervalMs ?? 5000;

  let running = false;
  let timer: unknown = null;
  let controller: AbortController | null = null;
  let generation = 0;
  let fails = 0;
  let last: ChartOverlay | null = null;
  /** When the reading in `last` arrived, by the browser clock: its age is counted from here, because its own stamp is the exchange clock. */
  let lastAt = 0;

  const emit = (state: OverlayFeedState): void => {
    if (running) deps.onChange(state);
  };
  const cancelTimer = (): void => {
    if (timer !== null) clearTimer(timer);
    timer = null;
  };
  const schedule = (ms: number): void => {
    cancelTimer();
    timer = setTimer(() => {
      timer = null;
      void tick();
    }, ms);
  };

  async function tick(): Promise<void> {
    if (!running) return;
    if (!isVisible()) {
      schedule(interval);
      return;
    }
    controller?.abort();
    const mine = new AbortController();
    controller = mine;
    generation += 1;
    const mineGeneration = generation;
    let outcome: OverlayOutcome;
    try {
      outcome = await deps.client.fetch(deps.instId, mine.signal);
    } catch {
      outcome = { ok: false, reason: "resposta_invalida" };
    }
    if (!running || mine.signal.aborted || mineGeneration !== generation) return;
    if (outcome.ok) {
      fails = 0;
      last = outcome.overlay;
      lastAt = now();
      emit({ status: "ok", overlay: last, reason: null });
      schedule(interval);
      return;
    }
    fails += 1;
    if (last !== null && now() - lastAt >= OVERLAY_STALE_MS) last = null;
    emit({ status: "erro", overlay: last, reason: outcome.reason });
    schedule(Math.min(MAX_WAIT_MS, interval * 2 ** fails));
  }

  return {
    start(): void {
      this.stop();
      running = true;
      fails = 0;
      last = null;
      lastAt = 0;
      emit({ status: "loading", overlay: null, reason: null });
      void tick();
    },
    stop(): void {
      running = false;
      cancelTimer();
      controller?.abort();
      controller = null;
    },
    /** Reads now, once, instead of waiting for the timer. */
    poke(): void {
      if (!running) return;
      cancelTimer();
      void tick();
    },
  };
}

export type OverlayFeed = ReturnType<typeof createOverlayFeed>;
