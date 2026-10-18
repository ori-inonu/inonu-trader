/**
 * The loop that measures what is not in the ticker list, only for the rows the person can see (RAS-3): the pressure of the flow
 * (views Visao geral and Fluxo, again every minute) and the change of the last hours (view Desempenho, every five minutes).
 * It reads in small chunks so cells fill in as the round goes, spaces the reads through the readers, skips rows that are still
 * fresh, never reads while the page is hidden, and a new target (another view or another window of rows) cancels the round in
 * flight, so reads do not pile up and an old answer never lands on the wrong rows. Timers, clock and visibility are injected.
 */
import type { FlowReader, PressureRead } from "./flow";
import type { ViewId } from "./model";
import type { PerformanceRead, PerformanceReader } from "./performance";

export const PRESSURE_TTL_MS = 60_000;
export const PERFORMANCE_TTL_MS = 300_000;
const HIDDEN_RETRY_MS = 5_000;
const DEFAULT_CHUNK = 5;

export interface MeasureState {
  readonly pressure: ReadonlyMap<string, PressureRead | "lendo">;
  readonly performance: ReadonlyMap<string, PerformanceRead | "lendo">;
}

export const EMPTY_MEASURES: MeasureState = { pressure: new Map(), performance: new Map() };

type AnyRead = { readonly atMs: number } | { readonly ok: false } | "lendo";

/** The rows that have no read, a failed one, or one older than `ttlMs`; a row being read right now is left alone. */
export function needsRead(ids: readonly string[], reads: ReadonlyMap<string, AnyRead>, nowMs: number, ttlMs: number): string[] {
  return ids.filter((id) => {
    const read = reads.get(id);
    if (read === undefined) return true;
    if (read === "lendo") return false;
    if ("ok" in read && read.ok === false) return true;
    return "atMs" in read ? nowMs - read.atMs >= ttlMs : true;
  });
}

export interface MeasureLoopDeps {
  readonly flow: FlowReader;
  readonly perf: PerformanceReader;
  readonly now?: () => number;
  readonly setTimer?: (run: () => void, ms: number) => unknown;
  readonly clearTimer?: (id: unknown) => void;
  readonly isVisible?: () => boolean;
  readonly onChange: (state: MeasureState) => void;
  readonly chunk?: number;
}

type Mode = "pressure" | "performance" | null;
const modeOf = (view: ViewId): Mode => (view === "geral" || view === "fluxo" ? "pressure" : view === "desempenho" ? "performance" : null);

export function createMeasureLoop(deps: MeasureLoopDeps) {
  const now = deps.now ?? Date.now;
  const setTimer = deps.setTimer ?? ((run, ms) => setTimeout(run, ms));
  const clearTimer = deps.clearTimer ?? ((id) => clearTimeout(id as ReturnType<typeof setTimeout>));
  const isVisible = deps.isVisible ?? (() => typeof document === "undefined" || document.visibilityState !== "hidden");
  const chunk = deps.chunk ?? DEFAULT_CHUNK;

  let pressure = new Map<string, PressureRead | "lendo">();
  let performance = new Map<string, PerformanceRead | "lendo">();
  let key = "";
  let mode: Mode = null;
  let ids: string[] = [];
  let timer: unknown = null;
  let controller: AbortController | null = null;
  let generation = 0;
  let stopped = false;

  const emit = (): void => {
    if (!stopped) deps.onChange({ pressure: new Map(pressure), performance: new Map(performance) });
  };
  const cancelTimer = (): void => {
    if (timer !== null) clearTimer(timer);
    timer = null;
  };
  const schedule = (ms: number): void => {
    cancelTimer();
    timer = setTimer(() => {
      timer = null;
      void round();
    }, ms);
  };
  /** Rows that were being read when the round was cancelled are not "being read" any more. */
  const dropPending = (): void => {
    let changed = false;
    for (const [id, read] of pressure) if (read === "lendo") (pressure.delete(id), (changed = true));
    for (const [id, read] of performance) if (read === "lendo") (performance.delete(id), (changed = true));
    if (changed) emit();
  };

  async function round(): Promise<void> {
    if (stopped || mode === null) return;
    const ttl = mode === "pressure" ? PRESSURE_TTL_MS : PERFORMANCE_TTL_MS;
    if (!isVisible()) {
      schedule(HIDDEN_RETRY_MS);
      return;
    }
    const mine = ++generation;
    controller?.abort();
    const own = new AbortController();
    controller = own;
    const reads = mode === "pressure" ? pressure : performance;
    const need = needsRead(ids, reads as ReadonlyMap<string, AnyRead>, now(), ttl);
    if (need.length === 0) {
      schedule(ttl);
      return;
    }
    // a row that was never read says it is being read; one that has an older read keeps showing it (marked old if it is)
    let marked = false;
    for (const id of need) {
      if (!reads.has(id)) {
        (reads as Map<string, never>).set(id, "lendo" as never);
        marked = true;
      }
    }
    if (marked) emit();
    for (let at = 0; at < need.length; at += chunk) {
      if (own.signal.aborted || mine !== generation || stopped) return;
      const part = need.slice(at, at + chunk);
      if (mode === "pressure") {
        const result = await deps.flow.pressure(part, own.signal);
        if (own.signal.aborted || mine !== generation || stopped) return;
        for (const [id, read] of result) pressure.set(id, read);
        for (const id of part) if (pressure.get(id) === "lendo") pressure.delete(id);
      } else {
        const result = await deps.perf.read(part, own.signal);
        if (own.signal.aborted || mine !== generation || stopped) return;
        for (const [id, read] of result) performance.set(id, read);
        for (const id of part) if (performance.get(id) === "lendo") performance.delete(id);
      }
      emit();
    }
    schedule(ttl);
  }

  return {
    /** Points the loop at a view and the ids inside the calculation window; the same target again changes nothing. */
    setTarget(view: ViewId, nextIds: readonly string[]): void {
      stopped = false;
      const nextKey = `${view}|${nextIds.join(",")}`;
      if (nextKey === key) return;
      key = nextKey;
      mode = modeOf(view);
      ids = [...nextIds];
      cancelTimer();
      controller?.abort();
      generation += 1;
      dropPending();
      if (mode !== null) void round();
    },
    stop(): void {
      stopped = true;
      cancelTimer();
      controller?.abort();
      controller = null;
      generation += 1;
      key = "";
    },
  };
}

export type MeasureLoop = ReturnType<typeof createMeasureLoop>;
