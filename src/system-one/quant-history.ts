/**
 * Rolling candle history for the quant annex. The public candle endpoint returns at most 300 bars (3 days of 15
 * minute bars), which is too short for the volatility clustering fit and for the tail of the simulation. This
 * reader keeps a longer window in memory: it reads the recent bars every cycle, and pages back through the public
 * history endpoint only while the newest consecutive run is shorter than the target (the first cycle, and after
 * a hole). Read only, keyless, through the repository's rate limited public client; the port is injected.
 */

import type { GetPort } from "../onchainos/http";
import { createPublicOkxClient, type PublicBar } from "../onchainos/public-okx";
import { contiguousSuffixStart, mergeCandles } from "../quant/history";
import { candlesFromPublicRows, type PublicCandleRowLike } from "../quant/rows";
import { QuantError, requirePositive, type Candle } from "../quant/types";

const RECENT_LIMIT = 300;
const PAGE_LIMIT = 100;

export interface QuantHistoryOptions {
  readonly instId: string;
  readonly bar: PublicBar;
  readonly barMs: number;
  /** Bars to keep, and the length of the consecutive run to reach. */
  readonly targetBars: number;
  /** Upper bound on history requests per refresh. Default: enough pages for the target plus three. */
  readonly maxPages?: number;
}

export interface HistoryRefresh {
  readonly candles: readonly Candle[];
  /** Requests sent by this refresh. */
  readonly requests: number;
  /** True when the newest consecutive run reaches the target. */
  readonly complete: boolean;
  readonly error: "recent_read_failed" | "history_read_failed" | null;
  /** Closed bars an exchange read restated with different values during this refresh (normally 0). */
  readonly restatedBars: number;
}

export class QuantHistory {
  private stored: Candle[] = [];
  private readonly maxPages: number;

  constructor(private readonly options: QuantHistoryOptions) {
    requirePositive(options.barMs, "bar_invalid");
    if (!Number.isInteger(options.targetBars) || options.targetBars < 1) throw new QuantError("option_invalid");
    this.maxPages = options.maxPages ?? Math.ceil(options.targetBars / PAGE_LIMIT) + 3;
    if (!Number.isInteger(this.maxPages) || this.maxPages < 0) throw new QuantError("option_invalid");
  }

  /**
   * @param recentRows rows the caller already read for the same instrument and bar (newest first); when absent
   *   the recent window is read here.
   */
  async refresh(port: GetPort, nowMs: number, recentRows?: readonly PublicCandleRowLike[]): Promise<HistoryRefresh> {
    void nowMs;
    const { instId, bar, barMs, targetBars } = this.options;
    const client = createPublicOkxClient(port);
    let requests = 0;
    let restatedBars = 0;
    let error: HistoryRefresh["error"] = null;

    let recent = recentRows;
    if (recent === undefined) {
      try {
        requests += 1;
        recent = (await client.candles(instId, { bar, limit: RECENT_LIMIT })).value;
      } catch {
        return { candles: [...this.stored], requests, complete: this.covers(), error: "recent_read_failed", restatedBars };
      }
    }
    const mergedRecent = mergeCandles(this.stored, candlesFromPublicRows(recent), targetBars);
    this.stored = mergedRecent.candles;
    restatedBars += mergedRecent.restated;

    for (let page = 0; page < this.maxPages && !this.covers(); page += 1) {
      const suffix = contiguousSuffixStart(this.stored, barMs);
      if (suffix === null) break;
      let rows: readonly PublicCandleRowLike[];
      try {
        requests += 1;
        rows = (await client.historyCandles(instId, { bar, limit: PAGE_LIMIT, after: suffix })).value;
      } catch {
        error = "history_read_failed";
        break;
      }
      if (rows.length === 0) break;
      const mergedPage = mergeCandles(this.stored, candlesFromPublicRows(rows), targetBars);
      this.stored = mergedPage.candles;
      restatedBars += mergedPage.restated;
      const moved = contiguousSuffixStart(this.stored, barMs);
      if (moved === null || moved >= suffix) break;
    }
    return { candles: [...this.stored], requests, complete: this.covers(), error, restatedBars };
  }

  private covers(): boolean {
    const last = this.stored[this.stored.length - 1];
    const first = contiguousSuffixStart(this.stored, this.options.barMs);
    if (last === undefined || first === null) return false;
    return (last.startMs - first) / this.options.barMs + 1 >= this.options.targetBars;
  }
}
