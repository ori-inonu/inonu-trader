"use client";

import { useCallback, useEffect, useState } from "react";
import { clearFired, createAlert, evaluateAlerts, markSeen, readStoredAlerts, removeAlert, unseenCount, writeStoredAlerts, type CreateResult, type PriceAlert } from "./alerts";

export interface AlertsState {
  readonly alerts: readonly PriceAlert[];
  readonly unseen: number;
  readonly create: (instId: string, text: string, last: number | null | undefined) => CreateResult;
  readonly remove: (id: string) => void;
  readonly clearFired: () => void;
  readonly markSeen: () => void;
}

/**
 * The alerts of this browser: read once from storage after mount (the server render is always empty), evaluated against
 * the prices the desk already holds every time they or the exchange clock change, and written back on every change.
 * Nothing leaves the browser. `nowMs` is the exchange time, 0 until measured, and nothing is evaluated before that.
 */
export function useAlerts(prices: Readonly<Record<string, number | null | undefined>> | undefined, nowMs: number): AlertsState {
  const [alerts, setAlerts] = useState<readonly PriceAlert[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setAlerts(readStoredAlerts());
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated || !prices || !(nowMs > 0)) return;
    setAlerts((current) => {
      const next = evaluateAlerts(current, prices, nowMs);
      return next.fired.length > 0 ? next.alerts : current;
    });
  }, [hydrated, prices, nowMs]);

  useEffect(() => {
    if (hydrated) writeStoredAlerts(alerts);
  }, [hydrated, alerts]);

  const create = useCallback(
    (instId: string, text: string, last: number | null | undefined): CreateResult => {
      const result = createAlert({ instId, text, last, nowMs: nowMs > 0 ? nowMs : Date.now(), existing: alerts });
      if (result.ok) setAlerts([...alerts, result.alert]);
      return result;
    },
    [alerts, nowMs],
  );
  const remove = useCallback((id: string) => setAlerts((current) => removeAlert(current, id)), []);
  const clear = useCallback(() => setAlerts((current) => clearFired(current)), []);
  const seen = useCallback(() => setAlerts((current) => markSeen(current)), []);

  return { alerts, unseen: unseenCount(alerts), create, remove, clearFired: clear, markSeen: seen };
}
