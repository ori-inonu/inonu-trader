/**
 * One run at a time for the screen that reads the ladder (T9.5, T9.6). A new run stops the old one; a run that was replaced or invalidated (a new draft,
 * the screen leaving) is stale and must never write into the screen again, even if it finishes later; a run the person only stopped is still current, so the
 * state it ends with (what was read, what was not asked) is written. Pure: no clock, no network.
 */
export interface Run {
  readonly signal: AbortSignal;
  /** False once another run began, or the guard was invalidated: whatever this run has to say, the screen no longer wants. */
  isCurrent(): boolean;
}

export function createRunGuard() {
  interface Mine extends Run {
    readonly controller: AbortController;
  }
  let current: Mine | null = null;
  return {
    begin(): Run {
      current?.controller.abort();
      const controller = new AbortController();
      const mine: Mine = { controller, signal: controller.signal, isCurrent: () => current === mine };
      current = mine;
      return mine;
    },
    /** Abort the request in flight; the run stays current and writes its last state. */
    stop(): void {
      current?.controller.abort();
    },
    /** Abort and forget: the run is stale from now on. */
    invalidate(): void {
      current?.controller.abort();
      current = null;
    },
    /** A run that finished frees the guard; a stale run changes nothing. */
    release(run: Run): void {
      if (current === run) current = null;
    },
    running(): boolean {
      return current !== null;
    },
  };
}

export type RunGuard = ReturnType<typeof createRunGuard>;
