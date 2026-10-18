"use client";

/**
 * Pinned instruments of the Ativos list (the star column): `jev.watch.v1` holds at most
 * WATCH_PINS_MAX instIds in the OKX format (AAA-BBB or AAA-BBB-SWAP). The list of the desk is
 * DESK_DEFAULT_WATCHLIST plus the pins; extra rows under the separator are volume-ranked catalog
 * entries with no sparkline, never a fabricated trend.
 */
import { useCallback, useEffect, useState } from "react";
import type { AssetCatalogRow } from "../desk/useAssetCatalog";

export const WATCH_PINS_KEY = "jev.watch.v1";
export const WATCH_PINS_MAX = 12;
export const WATCH_TOTAL_MAX = 50;

export const INST_ID_RE = /^[A-Z0-9]+-[A-Z0-9]+(-[A-Z0-9]+)?$/;

export function isInstId(v: unknown): v is string {
  return typeof v === "string" && v.length <= 24 && INST_ID_RE.test(v);
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** Field-by-field defensive parse: a corrupt payload falls back to no pins. */
export function parseWatchPins(raw: unknown): string[] {
  if (!isRecord(raw) || !Array.isArray(raw.pins)) return [];
  const out: string[] = [];
  for (const p of raw.pins) {
    if (isInstId(p) && !out.includes(p)) out.push(p);
    if (out.length >= WATCH_PINS_MAX) break;
  }
  return out;
}

type StorageLike = { getItem(key: string): string | null; setItem(key: string, value: string): void } | null;

export function loadWatchPins(storage: StorageLike): string[] {
  try {
    const raw = storage?.getItem(WATCH_PINS_KEY);
    if (raw == null) return [];
    return parseWatchPins(JSON.parse(raw));
  } catch {
    return [];
  }
}

export function saveWatchPins(storage: StorageLike, pins: readonly string[]): void {
  try {
    storage?.setItem(WATCH_PINS_KEY, JSON.stringify({ pins }));
  } catch {
    /* session only */
  }
}

export interface WatchPins {
  readonly pins: readonly string[];
  /** The five defaults can never be unpinned. */
  readonly isPinned: (instId: string) => boolean;
  readonly canPin: (instId: string) => boolean;
  readonly toggle: (instId: string) => void;
}

/** Pins read only after mount, so the server markup is always the unpinned default list. */
export function useWatchPins(defaults: readonly string[], storage?: StorageLike): WatchPins {
  const store = storage === undefined ? (typeof localStorage === "undefined" ? null : localStorage) : storage;
  const [pins, setPins] = useState<readonly string[]>([]);
  useEffect(() => setPins(loadWatchPins(store)), [store]);
  const isPinned = useCallback((instId: string) => defaults.includes(instId) || pins.includes(instId), [defaults, pins]);
  const canPin = useCallback((instId: string) => isInstId(instId) && !defaults.includes(instId), [defaults]);
  const toggle = useCallback(
    (instId: string) => {
      if (!isInstId(instId) || defaults.includes(instId)) return;
      setPins((current) => {
        const next = current.includes(instId) ? current.filter((p) => p !== instId) : current.length >= WATCH_PINS_MAX ? current : [...current, instId];
        if (next !== current) saveWatchPins(store, next);
        return next;
      });
    },
    [defaults, store],
  );
  return { pins, isPinned, canPin, toggle };
}

/**
 * Volume-ranked extras under "Mais ativos por volume": the biggest `*-USDT` spot names of the
 * catalog that are not already listed, just enough to reach WATCH_TOTAL_MAX rows.
 */
export function watchExtras(spot: readonly AssetCatalogRow[], listed: readonly string[], upto = WATCH_TOTAL_MAX): readonly AssetCatalogRow[] {
  const have = new Set(listed);
  const room = Math.max(0, upto - listed.length);
  if (room === 0) return [];
  const out: AssetCatalogRow[] = [];
  for (const row of spot) {
    if (out.length >= room) break;
    if (have.has(row.instId)) continue;
    out.push(row);
  }
  return out;
}
