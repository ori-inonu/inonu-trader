"use client";

/**
 * The alerts of the flow and the zones for the focused instrument (ASK-13): the reading of the engine the page already polls (shared with
 * the chart and the dock, free, never the model) is compared with the previous one, and each change goes to the store of the session.
 * Nothing here asks the model; the button on an alert leaves a request in the ask trigger, and the Inonu panel decides.
 */
import { useEffect, useRef, useSyncExternalStore } from "react";
import { createEngineAlertStore, detectEngineAlerts, type EngineAlert } from "./engine-alerts";
import type { ChartOverlay } from "./overlay";
import { useOverlayReading } from "./useOverlayReading";

const store = createEngineAlertStore({ now: () => Date.now() });
const NONE: readonly EngineAlert[] = [];

export interface EngineAlertsState {
  readonly alerts: readonly EngineAlert[];
  readonly unseen: number;
  readonly markSeen: () => void;
}

export function useEngineAlerts(instId: string, enabled: boolean): EngineAlertsState {
  const feed = useOverlayReading(instId, enabled);
  const last = useRef<ChartOverlay | null>(null);

  useEffect(() => {
    last.current = null; // another instrument starts from a new baseline
  }, [instId, enabled]);

  const overlay = feed?.overlay ?? null;
  useEffect(() => {
    if (overlay === null || overlay.instId !== instId) return;
    const previous = last.current;
    if (previous !== null && previous.asOfMs === overlay.asOfMs) return; // the same reading again
    for (const alert of detectEngineAlerts(previous, overlay, Date.now())) store.add(alert);
    last.current = overlay;
  }, [overlay, instId]);

  const alerts = useSyncExternalStore(store.subscribe, store.list, () => NONE);
  const unseen = useSyncExternalStore(store.subscribe, store.unseen, () => 0);
  return { alerts, unseen, markSeen: store.markSeen };
}
