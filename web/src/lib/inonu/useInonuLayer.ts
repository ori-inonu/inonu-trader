"use client";

/**
 * Everything the chart needs to draw the Inonu layers for one instrument: the signal filters (kept on this machine), the
 * reading of the flow engine (polled, free, cancelled when the instrument changes) and the answers of the model for the
 * instrument. It returns the layer ready for `drawChart`, or null when the chart is not on an OKX instrument. The page is only
 * read here; the model is asked only by the button of "Pedir ao Inonu".
 */
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { SIMPLE_LAYERS } from "../desk/chart/detail";
import type { InonuLayerInput } from "../desk/chart/inonu-layer";
import { type StoredDecision, forInstrument, sharedDecisionStore } from "./decision-store";
import { createInonuJournal } from "./journal";
import type { OverlayFeedState } from "./overlay-feed";
import { DEFAULT_SIGNALS, type SignalFilters, loadSignals, saveSignals } from "./signals";
import { useOverlayReading } from "./useOverlayReading";

const NOW_REFRESH_MS = 15_000;
const INSTRUMENT = /^[A-Z0-9-]{3,60}$/;
const NONE: readonly StoredDecision[] = [];

function storage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

export interface InonuLayerState {
  readonly layer: InonuLayerInput | null;
  readonly filters: SignalFilters;
  readonly setFilters: (next: SignalFilters) => void;
  /** The reading of the engine for this instrument; null when the chart is not on one. */
  readonly feed: OverlayFeedState | null;
}

/** `simple`: the simple chart draws the zones and the answer only, whatever the saved filters say (they are kept, not rewritten). */
export function useInonuLayer(instId: string, enabled: boolean, simple = false): InonuLayerState {
  const [filters, setFiltersState] = useState<SignalFilters>(DEFAULT_SIGNALS);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const store = sharedDecisionStore();
  const stored = useSyncExternalStore(store.subscribe, store.list, () => NONE);

  // read the saved choice only after mount, so the first markup is always the default one
  useEffect(() => {
    setFiltersState(loadSignals(storage()));
  }, []);

  const setFilters = useCallback((next: SignalFilters) => {
    setFiltersState(next);
    saveSignals(storage(), next);
  }, []);

  const active = enabled && INSTRUMENT.test(instId);
  // one poll per instrument for every reader on the page (the Radar and Fluxo tabs read the same one)
  const feed = useOverlayReading(instId, active);

  // the age on the decision chip is told in minutes: refresh the clock now and then
  useEffect(() => {
    if (!active) return;
    setNowMs(Date.now());
    const timer = setInterval(() => setNowMs(Date.now()), NOW_REFRESH_MS);
    return () => clearInterval(timer);
  }, [active]);

  const answers = useMemo(() => forInstrument(stored, instId, createInonuJournal(storage()).mutedKinds(), nowMs), [stored, instId, nowMs]);

  const layer = useMemo((): InonuLayerInput | null => {
    if (!enabled) return null;
    // a reading that belongs to the instrument the chart was on a moment ago must never be drawn on the new one
    const overlay = feed !== null && feed.overlay !== null && feed.overlay.instId === instId ? feed.overlay : null;
    const show = simple ? SIMPLE_LAYERS : { zones: filters.zonas, flow: filters.fluxo, decision: filters.inonu };
    return { overlay, decision: answers.latest, trail: answers.trail, show, nowMs };
  }, [enabled, feed, instId, answers, simple, filters.zonas, filters.fluxo, filters.inonu, nowMs]);

  return { layer, filters, setFilters, feed: active ? feed : null };
}
