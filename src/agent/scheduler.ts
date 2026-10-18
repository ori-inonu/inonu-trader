/**
 * The rhythm of the agent (AUT-2, AUT-12): one cycle every `intervalMin` minutes, a chain of single timers (never an interval, so a slow cycle cannot pile up). While the agent is off or stopped a tick does
 * nothing at all. Before a cycle the market context is refreshed and after it the Placar settles the windows that have closed; neither can stop the chain. Timers are injected, so the tests move time by
 * hand. Nothing starts by itself: the owner of the process calls `start()`.
 */
import type { AgentConfig } from "./config";
import type { CycleReport, CycleRunner } from "./cycle";
import type { RunState } from "./state";

export interface SchedulerStatus {
  readonly started: boolean;
  readonly nextAtMs: number | null;
  readonly lastAtMs: number | null;
}

export interface Scheduler {
  start(): void;
  stop(): void;
  status(): SchedulerStatus;
  /** One cycle now, through the same single flight (the step before, the cycle and the step after are ONE flight); the chain of ticks is not moved. */
  runNow(): Promise<CycleReport>;
  /**
   * A cycle because a fresh fact arrived (an event), through the same single flight. True only if this call ran the cycle AND the model was consulted: sharing a cycle already running is not consumption (false, nothing started),
   * and neither is a stopped, off or not started agent. A guard pass in flight is short and the cycle waits for it, as for any other caller. The chain of ticks is counted again from the end of this cycle, so the timer does not
   * run a second one right behind it.
   */
  requestCycle(): Promise<boolean>;
  /** Resolves when the work in flight is over, the step after the cycle included; at once when there is none. A server waits for this before it lets go of the folder. */
  idle(): Promise<void>;
}

export interface SchedulerDeps {
  readonly runner: CycleRunner;
  readonly state: RunState;
  readonly config: () => AgentConfig;
  readonly now: () => number;
  /** Runs `fn` after `ms`; returns the function that cancels it. */
  readonly schedule: (ms: number, fn: () => void) => () => void;
  /** Runs before each cycle (refresh the market context). */
  readonly before?: () => Promise<void>;
  /** Runs after each cycle (settle the Placar). */
  readonly after?: () => Promise<void>;
  /** How often the guard looks over the positions between the cycles, in ms; not given or 0: there is no guard chain. */
  readonly guardEveryMs?: number;
  /** How long after a start the FIRST cycle comes (a restart must not leave the screen blind for a whole interval, nor repeat a cycle that just ran); null or not usable: the plain interval. */
  readonly firstDelayMs?: () => number | null;
}

export function createScheduler(deps: SchedulerDeps): Scheduler {
  let started = false;
  let cancel: (() => void) | null = null;
  let cancelGuard: (() => void) | null = null;
  /** The guard pass in flight, if any: a cycle waits for it, and a guard tick during a cycle is skipped. */
  let guardFlight: Promise<void> | null = null;
  let nextAtMs: number | null = null;
  let lastAtMs: number | null = null;
  /** The single flight: the step before, the cycle and the step after, as one piece of work. */
  let flight: Promise<CycleReport> | null = null;
  /** A stop was asked: what is in flight finishes what it is doing and begins nothing new. */
  let halted = false;

  const haltedReport = (): CycleReport => ({
    cycleId: "parado",
    atMs: deps.now(),
    durationMs: 0,
    mode: deps.state.get().mode,
    outcome: "bloqueado",
    reason: "parado",
    consulted: false,
    modelo: null,
    usage: null,
    posture: null,
    stances: {},
    profiles: {},
    orders: [],
    dropped: [],
    considered: { holdings: 0, buys: 0, protected: 0 },
    notes: [],
  });

  /** A step that fails (a provider down) or hangs must not stop the cycles: it is given this long. */
  const safely = async (step: (() => Promise<void>) | undefined, limitMs: number): Promise<void> => {
    if (step === undefined) return;
    let cancel: () => void = () => {};
    const timeout = new Promise<void>((resolve) => {
      cancel = deps.schedule(limitMs, resolve);
    });
    try {
      await Promise.race([step(), timeout]);
    } catch {
      // see above
    } finally {
      cancel();
    }
  };

  const cycle = (): Promise<CycleReport> => {
    // two callers at once share one flight: the step before is entered once and the step after runs once
    if (flight !== null) return flight;
    const work = (async (): Promise<CycleReport> => {
      // a guard pass in flight is short: the cycle waits for it instead of being dropped
      if (guardFlight !== null) await guardFlight;
      await safely(deps.before, 60_000);
      // a stop that came while the step before was running: the cycle does not begin
      if (halted) return haltedReport();
      let report: CycleReport;
      try {
        report = await deps.runner.run();
      } finally {
        lastAtMs = deps.now();
      }
      await safely(deps.after, 120_000);
      return report;
    })();
    flight = work;
    const clear = (): void => {
      if (flight === work) flight = null;
    };
    work.then(clear, clear);
    return work;
  };

  const arm = (first = false): void => {
    // one chain timer at most: an event cycle and a tick that ended together must not leave two chains running
    cancel?.();
    cancel = null;
    const given = first ? deps.firstDelayMs?.() ?? null : null;
    const ms = given !== null && Number.isFinite(given) && given > 0 ? given : deps.config().intervalMin * 60_000;
    nextAtMs = deps.now() + ms;
    cancel = deps.schedule(ms, () => {
      cancel = null;
      void tick();
    });
  };

  const armGuard = (): void => {
    const ms = deps.guardEveryMs ?? 0;
    if (!(ms > 0)) return;
    cancelGuard = deps.schedule(ms, () => {
      cancelGuard = null;
      void guardTick();
    });
  };

  const guardTick = async (): Promise<void> => {
    if (!started) return;
    const s = deps.state.get();
    // never over a cycle in flight or another guard pass; and nothing while the agent is off or stopped
    if (flight === null && guardFlight === null && !halted && !s.stopped && s.mode !== "desligado" && deps.runner.guard !== undefined) {
      const work = (async (): Promise<void> => {
        try {
          await deps.runner.guard!();
        } catch {
          // the guard never throws, but the chain must survive if it ever does
        }
      })();
      guardFlight = work;
      await work;
      if (guardFlight === work) guardFlight = null;
    }
    if (started) armGuard();
  };

  const tick = async (): Promise<void> => {
    if (!started) return;
    const s = deps.state.get();
    if (!s.stopped && s.mode !== "desligado") {
      try {
        await cycle();
      } catch {
        // the runner never throws, but the chain must survive if it ever does
      }
    }
    if (started) arm();
  };

  return {
    start() {
      if (started) return;
      started = true;
      halted = false;
      arm(true);
      armGuard();
    },
    stop() {
      started = false;
      halted = true;
      cancel?.();
      cancel = null;
      cancelGuard?.();
      cancelGuard = null;
      nextAtMs = null;
    },
    status: () => ({ started, nextAtMs, lastAtMs }),
    runNow: () => cycle(),
    async requestCycle() {
      const s = deps.state.get();
      if (!started || halted || flight !== null || s.stopped || s.mode === "desligado") return false;
      let report: CycleReport;
      try {
        report = await cycle();
      } catch {
        return false;
      }
      if (started && !halted) arm();
      return report.consulted;
    },
    async idle() {
      while (flight !== null || guardFlight !== null) {
        try {
          await (flight ?? guardFlight);
        } catch {
          // the outcome of the flight is its caller's business; this only waits for it to be over
        }
      }
    },
  };
}
