"use client";

/**
 * The asset catalog behind the chart picker (spec G8): every `*-USDT` spot pair and every
 * `*-USDT-SWAP` perpetual from `GET /api/v5/market/tickers` (one call per instType), sorted by
 * 24h quote volume with unknown volume last. Loaded through the existing rate limited REST
 * client once on mount and every five minutes. When the catalog cannot be loaded the picker
 * falls back to the default watchlist and says so - it never invents rows.
 */

import { useEffect, useRef, useState } from "react";
import { createOkxRest, type OkxRest } from "./okx-rest";
import { type DeskTicker, DESK_DEFAULT_WATCHLIST } from "./types";

export const ASSET_CATALOG_REFRESH_MS = 300_000;
/** Rows rendered at once in the picker; the search box narrows beyond that. */
export const ASSET_PICKER_MAX_ROWS = 80;

export interface AssetCatalogRow {
  readonly instId: string;
  readonly last: number | null;
  /** Percent change against the 24h open, null when the open is unknown. */
  readonly change24hPct: number | null;
  /** 24h quote volume as OKX reports it (null for swaps: volCcy24h is in base there). */
  readonly volQuote24h: number | null;
}

export type AssetCatalogStatus = "loading" | "ready" | "error";

export interface AssetCatalog {
  readonly status: AssetCatalogStatus;
  readonly spot: readonly AssetCatalogRow[];
  readonly swap: readonly AssetCatalogRow[];
}

const EMPTY: AssetCatalog = { status: "loading", spot: [], swap: [] };

function changePctOf(t: DeskTicker): number | null {
  if (t.open24h === null || !(t.open24h > 0)) return null;
  return ((t.last - t.open24h) / t.open24h) * 100;
}

function rowOf(t: DeskTicker): AssetCatalogRow {
  return { instId: t.instId, last: t.last, change24hPct: changePctOf(t), volQuote24h: t.volQuote24h };
}

function byVolumeDesc(a: AssetCatalogRow, b: AssetCatalogRow): number {
  const av = a.volQuote24h;
  const bv = b.volQuote24h;
  if (av === null && bv === null) return a.instId.localeCompare(b.instId);
  if (av === null) return 1;
  if (bv === null) return -1;
  return bv - av || a.instId.localeCompare(b.instId);
}

/** Pure filter and sort over the raw ticker lists: `*-USDT` spot rows and `*-USDT-SWAP` perpetuals. */
export function catalogFromTickers(
  spot: readonly DeskTicker[] | null,
  swap: readonly DeskTicker[] | null,
  status: AssetCatalogStatus = spot !== null && swap !== null ? "ready" : "error",
): AssetCatalog {
  return {
    status,
    spot: (spot ?? []).filter((t) => t.instId.endsWith("-USDT")).map(rowOf).sort(byVolumeDesc),
    swap: (swap ?? []).filter((t) => t.instId.endsWith("-USDT-SWAP")).map(rowOf).sort(byVolumeDesc),
  };
}

/** Rows shown when the catalog cannot be loaded: the default watchlist, labelled in the UI. */
export function fallbackCatalogRows(): readonly AssetCatalogRow[] {
  return DESK_DEFAULT_WATCHLIST.map((instId) => ({ instId, last: null, change24hPct: null, volQuote24h: null }));
}

export function useAssetCatalog(rest?: OkxRest, intervalMs = ASSET_CATALOG_REFRESH_MS): AssetCatalog {
  const [catalog, setCatalog] = useState<AssetCatalog>(EMPTY);
  const clientRef = useRef<OkxRest | null>(null);
  if (clientRef.current === null) clientRef.current = rest ?? createOkxRest();
  const provided = rest !== undefined;

  useEffect(() => {
    const client = clientRef.current!;
    let disposed = false;
    let active: AbortController | null = null;

    const load = async (): Promise<void> => {
      active?.abort();
      const controller = new AbortController();
      active = controller;
      const [spotResult, swapResult] = await Promise.all([
        client.tickers("SPOT", controller.signal),
        client.tickers("SWAP", controller.signal),
      ]);
      if (disposed || controller.signal.aborted) return;
      if (spotResult.ok && swapResult.ok) {
        setCatalog(catalogFromTickers(spotResult.value, swapResult.value));
      } else {
        setCatalog((current) => (current.status === "ready" ? current : { ...EMPTY, status: "error" }));
      }
    };

    void load();
    const timer = setInterval(() => void load(), Math.max(30_000, intervalMs));
    return () => {
      disposed = true;
      active?.abort();
      clearInterval(timer);
    };
    // The client is created once; a provided one is stable for the life of the caller.
  }, [provided ? rest : null, intervalMs]);

  return catalog;
}
