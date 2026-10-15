export interface OwnedCore {
  readonly exited: Promise<number | null>;
  readonly ready?: Promise<void>;
  stop(): Promise<void>;
}

export interface LocalSupervisorDeps {
  probe(signal: AbortSignal): Promise<"ours" | "absent" | "other">;
  spawn(): OwnedCore | Promise<OwnedCore>;
  wait(ms: number, signal: AbortSignal): Promise<void>;
  report(code: "local_existing" | "local_waiting" | "local_port_busy" | "local_started" | "local_retry" | "local_failed" | "local_stopped"): void;
  /** Wait for a recognized foreign-owned app to exit naturally. Never adopt or stop it. */
  readonly awaitExisting?: boolean;
  readonly maxRestarts?: number;
  readonly now?: () => number;
  readonly healthyRunMs?: number;
}

/** Supervises only the child it created. It never kills another process or overlaps a replacement with an old child. */
export async function superviseLocal(deps: LocalSupervisorDeps, signal: AbortSignal): Promise<"existing" | "busy" | "failed" | "stopped"> {
  const maxRestarts = deps.maxRestarts ?? 4;
  const now = deps.now ?? Date.now;
  const healthyRunMs = deps.healthyRunMs ?? 600_000;
  let restarts = 0;
  let waitingReported = false;
  while (!signal.aborted) {
    const present = await deps.probe(signal);
    if (signal.aborted) break;
    if (present === "ours") {
      if (deps.awaitExisting !== true) { deps.report("local_existing"); return "existing"; }
      if (!waitingReported) { deps.report("local_waiting"); waitingReported = true; }
      await deps.wait(5000, signal);
      continue;
    }
    if (present === "other") { deps.report("local_port_busy"); return "busy"; }
    waitingReported = false;
    let child: OwnedCore | null = null;
    const startedAt = now();
    try { child = await deps.spawn(); } catch { /* a spawn failure follows the same bounded backoff */ }
    if (child !== null) {
      let healthySince: number | null = child.ready === undefined ? startedAt : null;
      void child.ready?.then(() => { healthySince = now(); });
      deps.report("local_started");
      let onAbort: () => void = () => {};
      const stopped = new Promise<"stop">((resolve) => { onAbort = () => resolve("stop"); signal.addEventListener("abort", onAbort, { once: true }); if (signal.aborted) resolve("stop"); });
      try {
        const end = await Promise.race([child.exited.then(() => "exit" as const), stopped]);
        if (end === "stop" || signal.aborted) {
          await child.stop();
          await child.exited;
          break;
        }
      } finally { signal.removeEventListener("abort", onAbort); }
      if (healthySince !== null && now() - healthySince >= healthyRunMs) restarts = 0;
    }
    if (restarts >= maxRestarts) { deps.report("local_failed"); return "failed"; }
    deps.report("local_retry");
    await deps.wait(Math.min(60_000, 5_000 * 2 ** restarts), signal);
    restarts++;
  }
  deps.report("local_stopped");
  return "stopped";
}
