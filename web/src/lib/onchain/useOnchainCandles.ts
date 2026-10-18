"use client";

/**
 * On-chain candles for the chart focus (spec CHN-3/CHN-4): one `useOnchainResource` per
 * chain+token+bar, the first load is a user call and the refresh interval equals the bar's TTL
 * (and only fires while the page is visible and a focus exists). The 1D bar has no on-chain
 * route: the hook stays idle for it and the chart disables the button.
 */
import { useMemo } from "react";
import type { DeskBar, DeskCandle, DeskInstrument, DeskMetrics, DeskTicker } from "../desk/types";
import { priceDecimalsForMagnitude } from "../desk/ui/format";
import type { OnchainCandle, OnchainClient } from "./client";
import type { OnchainFocus } from "./focus";
import { useOnchainResource, type OnchainResource } from "./useOnchainResource";

/** Bars the on-chain candle route serves. 1D is absent on purpose. */
export type OnchainBar = Exclude<DeskBar, "1D">;
export const ONCHAIN_BARS: readonly OnchainBar[] = ["1m", "5m", "15m", "1H", "4H"];

/** Refresh interval per bar = the provider cache TTL, in ms. */
export const ONCHAIN_BAR_REFRESH_MS: Record<OnchainBar, number> = {
  "1m": 60_000,
  "5m": 120_000,
  "15m": 300_000,
  "1H": 600_000,
  "4H": 900_000,
};

export const ONCHAIN_NO_1D = "Sem 1D on-chain";

export function isOnchainBar(bar: DeskBar): bar is OnchainBar {
  return bar !== "1D";
}

/**
 * Map a provider candle into a desk candle: volume -> volBase, volumeUsd -> volQuote, the
 * provider's own confirmed flag. A row with non-finite or inverted values is discarded rather
 * than drawn.
 */
export function onchainCandlesToDesk(rows: readonly OnchainCandle[]): DeskCandle[] {
  const out: DeskCandle[] = [];
  for (const r of rows) {
    const ok =
      Number.isFinite(r.ts) &&
      [r.open, r.high, r.low, r.close, r.volume, r.volumeUsd].every((v) => Number.isFinite(v)) &&
      r.high >= r.low &&
      r.ts > 0;
    if (!ok) continue;
    out.push({ tsMs: r.ts, open: r.open, high: r.high, low: r.low, close: r.close, volBase: r.volume, volQuote: r.volumeUsd, confirmed: r.confirmed });
  }
  // The provider may answer newest first; the desk needs oldest first.
  out.sort((a, b) => a.tsMs - b.tsMs);
  return out;
}

const NULL_METRICS: DeskMetrics = {
  midPx: null,
  microPx: null,
  spreadBps: null,
  depthBidShare10bps: null,
  depthBidShare50bps: null,
  bidDepthQuote10bps: null,
  askDepthQuote10bps: null,
  bidDepthQuote50bps: null,
  askDepthQuote50bps: null,
  buyVolBase60s: null,
  sellVolBase60s: null,
  flowImbalance60s: null,
  tradesPerSecond60s: null,
  cvd: null,
  vwap: null,
  realizedSigmaDaily: null,
  change24hPct: null,
  bookReachBps: null,
};

const DAY_MS = 24 * 3_600_000;

/** Stats the candles themselves support: only candles at least 24 h old give a 24h window. */
function dayWindow(candles: readonly DeskCandle[]): { open: number; high: number; low: number; volBase: number; volQuote: number } | null {
  const last = candles[candles.length - 1];
  if (last === undefined) return null;
  const cutoff = last.tsMs - DAY_MS;
  if (candles[0]!.tsMs > cutoff) return null;
  let open = NaN;
  let high = -Infinity;
  let low = Infinity;
  let volBase = 0;
  let volQuote = 0;
  for (const c of candles) {
    if (c.tsMs < cutoff) continue;
    if (!Number.isFinite(open)) open = c.open;
    if (c.high > high) high = c.high;
    if (c.low < low) low = c.low;
    volBase += c.volBase;
    volQuote += c.volQuote;
  }
  return Number.isFinite(open) ? { open, high, low, volBase, volQuote } : null;
}

/**
 * Synthetic desk metrics of an on-chain token: the mid is the last close, the 24h change only
 * exists when the candle window covers a full day; every book and flow field is honestly null.
 */
export function onchainMetricsFor(candles: readonly DeskCandle[]): DeskMetrics {
  const last = candles[candles.length - 1];
  if (last === undefined) return NULL_METRICS;
  const day = dayWindow(candles);
  const change24hPct = day !== null && day.open > 0 ? ((last.close - day.open) / day.open) * 100 : null;
  return { ...NULL_METRICS, midPx: last.close, change24hPct };
}

/** Synthetic ticker of an on-chain token: last close, 24h window when covered, no bid/ask. */
export function onchainTickerFor(candles: readonly DeskCandle[], focus: OnchainFocus): DeskTicker | null {
  const last = candles[candles.length - 1];
  if (last === undefined) return null;
  const day = dayWindow(candles);
  return {
    instId: focus.symbol,
    last: last.close,
    open24h: day?.open ?? null,
    high24h: day?.high ?? null,
    low24h: day?.low ?? null,
    volBase24h: day?.volBase ?? null,
    volQuote24h: day?.volQuote ?? null,
    bidPx: null,
    bidSz: null,
    askPx: null,
    askSz: null,
    tsMs: last.tsMs,
  };
}

/** Synthetic instrument of an on-chain token: the tick follows the price magnitude. */
export function onchainInstrumentFor(focus: OnchainFocus, last: number): DeskInstrument {
  const d = priceDecimalsForMagnitude(last);
  const tickSz = d <= 0 ? "1" : `0.${"0".repeat(d - 1)}1`;
  return { instId: focus.symbol, instType: "SPOT", base: focus.symbol, quote: "USD", tickSz, lotSz: "1" };
}

/**
 * The resource of the focused token: null key for 1D and for "no focus" so neither costs a call.
 * Switching token or bar changes the key, which aborts the previous request.
 */
export function useOnchainCandles(focus: OnchainFocus | null, bar: DeskBar, client: OnchainClient): OnchainResource<DeskCandle[]> {
  const key = focus !== null && isOnchainBar(bar) ? `${focus.chainIndex}:${focus.address}:${bar}` : null;
  const refreshMs = isOnchainBar(bar) ? ONCHAIN_BAR_REFRESH_MS[bar] : undefined;
  const fetcher = useMemo(
    () => (user: boolean, _signal: AbortSignal) =>
      client.candles({ chainIndex: focus!.chainIndex, token: focus!.address, bar, limit: 200 }, user ? "user" : "background"),
    [client, focus?.chainIndex, focus?.address, bar], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const res = useOnchainResource<OnchainCandle[]>(key, fetcher, { refreshMs });
  return useMemo(
    () => ({
      state: { ...res.state, data: res.state.data === null ? null : onchainCandlesToDesk(res.state.data) },
      reload: res.reload,
    }),
    [res.state, res.reload],
  );
}
