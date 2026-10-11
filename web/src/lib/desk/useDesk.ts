"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { createDeskController, type DeskController } from "./desk-controller";
import { DESK_DEFAULT_WATCHLIST, type DeskBar, type DeskState } from "./types";

export interface UseDeskArgs {
  /** Instrument shown by the desk, for example BTC-USDT. A change of this value switches the subscriptions. */
  readonly focus: string;
  /** Candle bar. A change of this value swaps the candle channel and reloads the history. */
  readonly bar: DeskBar;
  /** Instruments of the watchlist, default DESK_DEFAULT_WATCHLIST. */
  readonly watchlist?: readonly string[];
}

export interface UseDeskResult {
  /** The state of the desk, a new object only when something changed (about 10 Hz at most). */
  readonly state: DeskState;
  /** Switches the focus imperatively. Props and these setters drive the same controller, the last call wins. */
  readonly setFocus: (instId: string) => void;
  readonly setBar: (bar: DeskBar) => void;
}

/**
 * The real data layer of the desk: keyless OKX public v5 sockets and REST, merged into `DeskState`.
 *
 * Safe under React StrictMode: creating the controller has no side effects, the effect that starts it also stops it
 * (closing both sockets, every timer and every request), and a second start works. On the server it renders the empty
 * initial state, so hydration matches.
 */
export function useDesk({ focus, bar, watchlist = DESK_DEFAULT_WATCHLIST }: UseDeskArgs): UseDeskResult {
  const [controller] = useState<DeskController>(() => createDeskController({ focus, bar, watchlist }));

  useEffect(() => {
    controller.start();
    return () => controller.stop();
  }, [controller]);

  useEffect(() => {
    controller.setFocus(focus);
  }, [controller, focus]);

  useEffect(() => {
    controller.setBar(bar);
  }, [controller, bar]);

  // The list is compared by content, so a new array with the same instruments does nothing.
  const watchKey = watchlist.join(",");
  useEffect(() => {
    controller.setWatchlist(watchKey === "" ? [] : watchKey.split(","));
  }, [controller, watchKey]);

  const state = useSyncExternalStore(controller.subscribe, controller.getState, controller.getState);
  return { state, setFocus: controller.setFocus, setBar: controller.setBar };
}
