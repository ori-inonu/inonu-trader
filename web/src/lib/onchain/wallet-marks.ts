"use client";

/**
 * Tracked-wallet marks for the on-chain chart (spec SMC-10): a signal the provider records for the
 * focused token becomes a diamond under the candle it happened in. These are purchases the OKX
 * indexer observed, never Jev decisions, and the readout says so in words.
 */
import { useMemo } from "react";
import type { DeskCandle } from "../desk/types";
import type { OnchainClient, Signal, SignalWalletType } from "./client";
import type { OnchainFocus } from "./focus";
import { useOnchainResource, type OnchainResource } from "./useOnchainResource";

export interface WalletMark {
  readonly tsMs: number;
  readonly walletType: SignalWalletType;
  /** Tracked wallets counted in this purchase. */
  readonly count: number;
  readonly amountUsd: number;
  readonly soldPct: number | null;
}

/** Never more than this many marks on the chart: the newest ones win. */
export const WALLET_MARKS_MAX = 40;

/** Signals into marks, oldest first, capped at WALLET_MARKS_MAX newest. */
export function signalMarks(signals: readonly Signal[]): WalletMark[] {
  const sorted = [...signals].sort((a, b) => a.tsMs - b.tsMs);
  const capped = sorted.slice(Math.max(0, sorted.length - WALLET_MARKS_MAX));
  return capped.map((s) => ({ tsMs: s.tsMs, walletType: s.walletType, count: s.walletCount, amountUsd: s.amountUsd, soldPct: s.soldRatioPct }));
}

/**
 * Index of the candle whose open interval contains tsMs (open <= tsMs < next open; the last
 * candle's interval ends at open + barMs). Binary search; -1 when outside the series.
 */
export function candleIndexForTs(candles: readonly { tsMs: number }[], tsMs: number, barMs: number): number {
  if (candles.length === 0 || tsMs < candles[0]!.tsMs) return -1;
  const last = candles[candles.length - 1]!.tsMs;
  if (tsMs >= last + barMs) return -1;
  let lo = 0;
  let hi = candles.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (candles[mid]!.tsMs <= tsMs) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

/** Marks grouped by the index of the candle they belong to; out-of-range marks are dropped. */
export function walletMarksByIndex(marks: readonly WalletMark[], candles: readonly DeskCandle[], barMs: number): Map<number, WalletMark[]> {
  const out = new Map<number, WalletMark[]>();
  for (const mark of marks) {
    const i = candleIndexForTs(candles, mark.tsMs, barMs);
    if (i < 0) continue;
    const list = out.get(i);
    if (list) list.push(mark);
    else out.set(i, [mark]);
  }
  return out;
}

/** The signals of the focused token: loaded once per token (user call), never polled. */
export function useOnchainWalletMarks(focus: OnchainFocus | null, client: OnchainClient): OnchainResource<WalletMark[]> {
  const key = focus !== null ? `wallet-marks:${focus.chainIndex}:${focus.address}` : null;
  const fetcher = useMemo(
    () => (user: boolean, _signal: AbortSignal) =>
      client.signals({ chainIndex: focus!.chainIndex, token: focus!.address, walletType: "1,2,3", limit: 100 }, user ? "user" : "background"),
    [client, focus?.chainIndex, focus?.address], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const res = useOnchainResource<Signal[]>(key, fetcher);
  return useMemo(
    () => ({
      state: { ...res.state, data: res.state.data === null ? null : signalMarks(res.state.data) },
      reload: res.reload,
    }),
    [res.state, res.reload],
  );
}
