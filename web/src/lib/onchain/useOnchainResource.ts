"use client";

/**
 * One-shot loader for a single /onchain/* resource behind a key (spec DOC-5 call policy): when the
 * key becomes non-null the fetcher runs once with user intent; changing the key, reloading or
 * unmounting aborts the previous request and late answers are dropped by the reducer, so the UI
 * never shows data for the wrong selection. There is no polling unless `refreshMs` is given, and
 * then a tick only fires while the page is visible and always as background intent.
 *
 * The state machine is a pure reducer so the whole contract is tested without a DOM.
 */
import { useCallback, useEffect, useReducer, useRef } from "react";
import { OnchainRequestError, type OnchainErrorCode, type OnchainMeta, type OnchainResult } from "./client";

export type OnchainResourceStatus = "idle" | "loading" | "ready" | "error";
/** The envelope error set plus the transport failures the client itself throws. */
export type OnchainResourceError = OnchainErrorCode | "network" | "backend_stale" | "origin_denied";

export interface OnchainResourceState<T> {
  readonly status: OnchainResourceStatus;
  /** The key the state belongs to; answers for an older key are ignored. */
  readonly key: string | null;
  readonly data: T | null;
  readonly meta: OnchainMeta | null;
  readonly error: OnchainResourceError | null;
}

export type OnchainResourceAction<T> =
  | { readonly type: "start"; readonly key: string }
  | { readonly type: "success"; readonly key: string; readonly data: T; readonly meta: OnchainMeta }
  | { readonly type: "failure"; readonly key: string; readonly error: OnchainResourceError }
  | { readonly type: "reset" };

export function initialResourceState<T>(): OnchainResourceState<T> {
  return { status: "idle", key: null, data: null, meta: null, error: null };
}

/**
 * The reducer is the single place that decides what an event may change. A success or failure that
 * arrives for a key different from the current one came from an aborted request and is discarded.
 * A failure keeps the last data so a refresh error never blanks a table that was already honest.
 * Starting a different key clears the data: the old answer describes another selection and must
 * never render under the new one.
 */
export function onchainResourceReducer<T>(state: OnchainResourceState<T>, action: OnchainResourceAction<T>): OnchainResourceState<T> {
  switch (action.type) {
    case "start":
      return action.key === state.key
        ? { status: "loading", key: action.key, data: state.data, meta: state.meta, error: null }
        : { status: "loading", key: action.key, data: null, meta: null, error: null };
    case "success":
      if (action.key !== state.key) return state;
      return { status: "ready", key: action.key, data: action.data, meta: action.meta, error: null };
    case "failure":
      if (action.key !== state.key) return state;
      return { status: "error", key: state.key, data: state.data, meta: state.meta, error: action.error };
    case "reset":
      return initialResourceState();
  }
}

export interface OnchainResource<T> {
  readonly state: OnchainResourceState<T>;
  /** Manual refresh: always a user-initiated call. */
  readonly reload: () => void;
}

/**
 * The poll interval: callers may ask for less, but a resource never ticks faster than every 5 s.
 */
export function pollIntervalMs(refreshMs: number): number {
  return Math.max(5_000, refreshMs);
}

/**
 * A tick only fires while the page is visible; a missing document (SSR, tests) means visible.
 */
export function shouldPollNow(visibilityState: string | undefined): boolean {
  return visibilityState === undefined || visibilityState === "visible";
}

export function useOnchainResource<T>(
  key: string | null,
  fetcher: (userInitiated: boolean, signal: AbortSignal) => Promise<OnchainResult<T>>,
  opts?: { readonly refreshMs?: number },
): OnchainResource<T> {
  const [state, dispatch] = useReducer(onchainResourceReducer<T>, null, initialResourceState<T>);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;
  const abortRef = useRef<AbortController | null>(null);

  const run = useCallback((k: string, userInitiated: boolean) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    dispatch({ type: "start", key: k });
    fetcherRef
      .current(userInitiated, controller.signal)
      .then((res) => {
        if (controller.signal.aborted) return;
        if (res.ok) dispatch({ type: "success", key: k, data: res.data, meta: res.meta });
        else dispatch({ type: "failure", key: k, error: res.error });
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        dispatch({ type: "failure", key: k, error: err instanceof OnchainRequestError ? err.code : "network" });
      });
  }, []);

  // The first load of a key is a user-initiated call: opening the tab is the user's act.
  useEffect(() => {
    if (key === null) {
      dispatch({ type: "reset" });
      return;
    }
    run(key, true);
    return () => abortRef.current?.abort();
  }, [key, run]);

  // Unmount: nothing may touch state afterwards.
  useEffect(
    () => () => {
      abortRef.current?.abort();
    },
    [],
  );

  // Optional refresh: only when the caller asks for it, only while the page is visible, always
  // background intent so it spends the budget as a background call.
  const refreshMs = opts?.refreshMs;
  useEffect(() => {
    if (refreshMs === undefined || key === null) return;
    const timer = setInterval(() => {
      if (shouldPollNow(typeof document === "undefined" ? undefined : document.visibilityState)) run(key, false);
    }, pollIntervalMs(refreshMs));
    return () => clearInterval(timer);
  }, [key, refreshMs, run]);

  const reload = useCallback(() => {
    if (key !== null) run(key, true);
  }, [key, run]);

  return { state, reload };
}
