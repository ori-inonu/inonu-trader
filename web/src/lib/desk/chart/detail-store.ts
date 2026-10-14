"use client";

/**
 * One switch for the whole desk: "simples" or "completo" (see detail.ts). The chart, the thermometer and the side panels all read the same choice, so the
 * "Detalhes" button of the chart changes the screen, not just the chart. It lives in this module (not in a component), is saved on this machine, and follows
 * the other windows of the same app through the `storage` event. On the server, and on the first paint, it is always the simple view.
 */
import { useSyncExternalStore } from "react";
import { CHART_DETAIL_KEY, type ChartDetail, DEFAULT_DETAIL, loadDetail, parseDetail, saveDetail } from "./detail";

let current: ChartDetail | null = null;
const listeners = new Set<() => void>();

function storage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

function read(): ChartDetail {
  if (current === null) current = loadDetail(storage());
  return current;
}

export function setChartDetail(next: ChartDetail): void {
  if (next === current) return;
  current = next;
  saveDetail(storage(), next);
  for (const listener of [...listeners]) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key !== CHART_DETAIL_KEY) return;
    current = parseDetail(event.newValue);
    listener();
  };
  if (typeof window !== "undefined") window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    if (typeof window !== "undefined") window.removeEventListener("storage", onStorage);
  };
}

/** The choice and the way to change it. */
export function useChartDetail(): readonly [ChartDetail, (next: ChartDetail) => void] {
  const detail = useSyncExternalStore(subscribe, read, () => DEFAULT_DETAIL);
  return [detail, setChartDetail] as const;
}

/** Tests only: forget what was read, so the next read goes to storage again. */
export function resetChartDetailForTests(): void {
  current = null;
  listeners.clear();
}
