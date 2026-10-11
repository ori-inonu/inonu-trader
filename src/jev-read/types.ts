/**
 * Jev reads the tape: an advisory buy / sell / hold call over a short horizon, on the real OKX public feed.
 *
 * It never executes anything. The record says so (`advisory: true`, `execution: "never"`), and the dashboard shows it
 * as a read, not as an order. The model is asked only when every input is real and fresh; otherwise the record carries
 * the reasons and no model call is made, so a decision can never be built on a missing or invented number.
 */

export const JEV_READ_SCHEMA_VERSION = 1;

export type TapeAction = "buy" | "sell" | "hold";
export const TAPE_ACTIONS: readonly TapeAction[] = Object.freeze(["buy", "sell", "hold"]);

export interface TapeLevel {
  readonly px: number;
  readonly sz: number;
}

export interface TapeTrade {
  readonly px: number;
  readonly sz: number;
  readonly side: "buy" | "sell";
  /** Local wall clock at which the print arrived. Receipt time keeps the window independent of the clock skew. */
  readonly receivedAtMs: number;
}

export interface TapeCandle {
  readonly tsMs: number;
  readonly close: number;
  readonly confirmed: boolean;
}

/** Raw, normalized inputs of one read of one instrument. Numbers are display and analysis values, never balances. */
export interface TapeInput {
  readonly instId: string;
  /** Local wall clock of the evaluation. */
  readonly nowMs: number;
  /** Best first on both sides. */
  readonly book: { readonly bids: readonly TapeLevel[]; readonly asks: readonly TapeLevel[]; readonly receivedAtMs: number } | null;
  readonly trades: readonly TapeTrade[];
  /** 1 minute bars, oldest first; the last one may still be forming. */
  readonly candles: readonly TapeCandle[];
  readonly ticker: {
    readonly last: number;
    readonly open24h: number | null;
    readonly high24h: number | null;
    readonly low24h: number | null;
    readonly receivedAtMs: number;
  } | null;
  /** Funding rate of the matching perpetual swap as a fraction, null when unknown or not applicable. */
  readonly fundingRate: number | null;
}

/** What Jev sees: compact, relative, no addresses, no credentials, no free text from a provider. */
export interface TapeState {
  readonly instId: string;
  readonly horizonMinutes: number;
  readonly mid: number;
  readonly spreadBps: number;
  /** (bid - ask) / (bid + ask) of the quote depth in the top 5 levels, from -1 (all asks) to 1 (all bids). */
  readonly bookImbalanceTop5: number;
  readonly depthQuoteTop5: { readonly bid: number; readonly ask: number };
  readonly returnsBps: { readonly m1: number; readonly m5: number; readonly m15: number; readonly m30: number };
  /** Standard deviation of the last 30 one minute log returns, in basis points per minute. */
  readonly volBpsPerMinute: number;
  readonly flow60s: {
    readonly count: number;
    readonly buyBase: number;
    readonly sellBase: number;
    /** (buy - sell) / (buy + sell), null when nothing printed. */
    readonly imbalance: number | null;
    readonly cvdBase: number;
    readonly vwap: number | null;
    readonly lastPx: number | null;
    readonly lastSide: "buy" | "sell" | null;
  };
  readonly change24hPct: number | null;
  /** Where the last price sits inside the 24h range, 0 at the low and 1 at the high. */
  readonly rangePosition24h: number | null;
  readonly fundingRatePct: number | null;
}

export type InsufficientReason =
  | "book_missing"
  | "book_stale"
  | "book_crossed"
  | "ticker_missing"
  | "ticker_stale"
  | "candles_short"
  | "candles_stale";

export interface TapeDecision {
  readonly action: TapeAction;
  readonly probabilities: Readonly<Record<TapeAction, number>>;
  /** The probability of the chosen action. It is a decision weight, not a win rate. */
  readonly confidence: number | null;
  readonly latencyMs: number;
  readonly model: string;
  readonly status: "ok" | "error" | "timeout" | "malformed";
  /** null means the provider did not report usage; it is not a zero cost. */
  readonly inputTokens: number | null;
}

export interface JevRead {
  readonly schemaVersion: typeof JEV_READ_SCHEMA_VERSION;
  readonly readId: string;
  readonly instId: string;
  /** On the exchange clock when `clockOffsetMs` is not null, on the local clock otherwise. */
  readonly atMs: number;
  /** Server clock minus local clock when it was measured, null otherwise. */
  readonly clockOffsetMs: number | null;
  readonly advisory: true;
  readonly execution: "never";
  readonly state: TapeState | null;
  /** Empty when the state was built; otherwise why Jev was not asked. */
  readonly insufficient: readonly InsufficientReason[];
  readonly decision: TapeDecision | null;
}

/** What the producer publishes: the latest read per instrument and a short newest first journal. */
export interface JevReadBoard {
  readonly schemaVersion: typeof JEV_READ_SCHEMA_VERSION;
  readonly updatedAtMs: number;
  readonly reads: Readonly<Record<string, JevRead>>;
  readonly recent: readonly JevRead[];
}

/** Freshness windows, receipt time based. */
export const BOOK_MAX_AGE_MS = 5_000;
export const TICKER_MAX_AGE_MS = 15_000;
export const CANDLES_MAX_AGE_MS = 150_000;
export const FLOW_WINDOW_MS = 60_000;
export const MIN_CANDLES = 31;
export const HORIZON_MINUTES = 5;
