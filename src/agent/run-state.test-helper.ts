// A run state the tests move by hand: what the agent may do with the money right now, with no switch behind it. origin: test helper only.
import type { RunState } from "./state";
import type { Mode } from "./types";

export interface MutableRunState extends RunState {
  set(mode: Mode): void;
}

export function runState(initial: Mode = "sombra"): MutableRunState {
  let mode = initial;
  return {
    get: () => ({ mode, stopped: false }),
    set: (next) => {
      mode = next;
    },
  };
}
