/**
 * Market and wallet readings for System One.
 *
 * `syntheticReadings` is the offline demo: deterministic candles from a seeded walk, a fixed
 * funding rate and a configured capital. `readPublicMarket` reads the keyless OKX v5 public
 * endpoints through the existing public client (mark price, funding rate, candles) and never
 * needs credentials. Neither touches a wallet; the wallet reading of a live run comes from the
 * operator inventory or from a configured capital, as stated in its `source`.
 */

import type { GetPort } from "../onchainos/http";
import { readGet } from "../onchainos/read";
import { parseFundingRate, parseMarkPrice, parsePublicCandles, toNumber, type PublicCandleRow } from "../onchainos/public-okx";
import type { MarketReading, Side, WalletReading } from "./types";
import { isFreshReading } from "./types";
import { realizedVolatility } from "./volatility";

export const DEFAULT_INST_ID = "MON-USDT-SWAP";
export const DEFAULT_BAR = "15m";
export const BAR_MS: Readonly<Record<string, number>> = Object.freeze({ "1m": 60_000, "5m": 300_000, "15m": 900_000, "1H": 3_600_000, "4H": 14_400_000, "1D": 86_400_000 });

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface SyntheticOptions {
  nowMs: number;
  seed?: number;
  instId?: string;
  startPrice?: number;
  sigmaDaily?: number;
  fundingRate?: number;
  candles?: number;
  capitalUsd?: number;
  openNotionalUsd?: number;
  openSide?: Side | null;
}

/** Deterministic closes: a driftless log walk at the requested daily sigma, 15 minute bars. */
export function syntheticCloses(seed: number, count: number, startPrice: number, sigmaDaily: number, barMs: number): number[] {
  const random = mulberry32(seed);
  const sigmaBar = sigmaDaily / Math.sqrt(86_400_000 / barMs);
  const closes: number[] = [startPrice];
  for (let i = 1; i < count; i += 1) {
    // Box Muller from two uniforms.
    const u1 = Math.max(1e-12, random());
    const u2 = random();
    const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    closes.push(closes[i - 1]! * Math.exp(sigmaBar * z));
  }
  return closes;
}

export function syntheticReadings(options: SyntheticOptions): { market: MarketReading; wallet: WalletReading } {
  const barMs = BAR_MS[DEFAULT_BAR]!;
  const count = options.candles ?? 96;
  const closes = syntheticCloses(options.seed ?? 7, count, options.startPrice ?? 0.025, options.sigmaDaily ?? 0.06, barMs);
  const volatility = realizedVolatility(closes, barMs);
  const last = closes[closes.length - 1]!;
  const capital = options.capitalUsd ?? 100;
  return {
    market: {
      instId: options.instId ?? DEFAULT_INST_ID,
      indexPrice: Math.round(last * 1e6) / 1e6,
      markPrice: Math.round(last * 1.0004 * 1e6) / 1e6,
      fundingRate: options.fundingRate ?? 0.0001,
      fundingIntervalMs: 8 * 3_600_000,
      realizedSigmaDaily: volatility.sigmaDaily === null ? null : Math.round(volatility.sigmaDaily * 1e6) / 1e6,
      candlesUsed: count,
      candleBarMs: barMs,
      source: "synthetic",
      observedAtMs: options.nowMs,
    },
    wallet: {
      capitalUsd: capital,
      knownValueUsd: capital,
      valueComplete: true,
      openNotionalUsd: options.openNotionalUsd ?? 0,
      openSide: options.openSide ?? null,
      source: "synthetic",
      observedAtMs: options.nowMs,
    },
  };
}

export interface PublicMarketOptions {
  instId?: string;
  bar?: keyof typeof BAR_MS;
  candles?: number;
  nowMs: number;
  /** Live callers sample after the awaited reads; fixed-time callers retain nowMs. */
  now?: () => number;
}

function closesOf(rows: readonly PublicCandleRow[], barMs: number, nowMs: number): number[] {
  // The public endpoint returns newest first; the volatility needs oldest first.
  const ordered = rows.filter(row => row.confirmed).sort((a, b) => a.startMs - b.startMs);
  const latest = ordered.at(-1);
  if (!latest || latest.startMs + barMs > nowMs || nowMs - (latest.startMs + barMs) > barMs) return [];
  const closes: number[] = [];
  let previous: number | null = null;
  for (const row of ordered) {
    if (previous !== null && row.startMs - previous !== barMs) return [];
    previous = row.startMs;
    const close = toNumber(row.close);
    if (close === null) return [];
    closes.push(close);
  }
  return closes;
}

/** Reads mark price, funding rate and candles from the OKX public v5 API through an injected port. */
export async function readPublicMarket(port: GetPort, options: PublicMarketOptions): Promise<MarketReading> {
  const instId = options.instId ?? DEFAULT_INST_ID;
  const bar = options.bar ?? DEFAULT_BAR;
  const barMs = Object.hasOwn(BAR_MS, bar) ? BAR_MS[bar]! : null;
  if (barMs === null) throw new Error("bar_unknown");
  const limit = Math.min(300, Math.max(2, options.candles ?? 96));

  const [mark, funding, candles] = await Promise.all([
    readGet(port, "public.mark-price", { instId, instType: "SWAP" }, (data) => parseMarkPrice(data, instId)),
    readGet(port, "public.funding-rate", { instId }, (data) => parseFundingRate(data, instId)),
    readGet(port, "public.candles", { instId, bar, limit }, (data) => parsePublicCandles(data, 300)),
  ]);

  const evaluatedAtMs = options.now?.() ?? options.nowMs;
  const closes = closesOf(candles.value, barMs, evaluatedAtMs);
  const volatility = barMs === null ? { sigmaDaily: null, returnsUsed: 0, reason: "bar_unknown" } : realizedVolatility(closes, barMs);
  const fundingRate = isFreshReading(funding.value.tsMs, evaluatedAtMs) ? toNumber(funding.value.fundingRate) : null;
  return {
    instId,
    indexPrice: null,
    markPrice: isFreshReading(mark.value.tsMs, evaluatedAtMs) ? toNumber(mark.value.markPx) : null,
    fundingRate,
    fundingIntervalMs: funding.value.intervalMs,
    realizedSigmaDaily: volatility.sigmaDaily,
    candlesUsed: closes.length,
    candleBarMs: barMs,
    source: "okx_public_v5",
    observedAtMs: Math.min(mark.value.tsMs ?? 0, funding.value.tsMs ?? 0),
  };
}

export function configuredWallet(capitalUsd: number, nowMs: number): WalletReading {
  return {
    capitalUsd,
    knownValueUsd: 0,
    valueComplete: false,
    openNotionalUsd: 0,
    openSide: null,
    source: "configured",
    observedAtMs: nowMs,
  };
}
