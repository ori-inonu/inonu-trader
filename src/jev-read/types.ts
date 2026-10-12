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
  /** Diagnostic wall receipt; the flow window uses proof.receivedAtMonoMs. */
  readonly receivedAtMs: number;
  readonly proof: ValueProof;
}

export interface TapeCandle {
  readonly tsMs: number;
  readonly close: number;
  readonly confirmed: boolean;
  readonly proof: ValueProof;
}

export interface ValueProof {
  readonly feedId: string;
  readonly feedEpoch: number;
  readonly captureId: number;
  readonly forSpotInstId: string;
  readonly requestedInstId: string;
  readonly reportedInstId: string | null;
  readonly source: "rest_book" | "ws_books5" | "rest_ticker" | "ws_tickers" | "rest_candles_1m" | "rest_funding" | "ws_trades";
  readonly wsGeneration: number | null;
  readonly sourceTsMs: number;
  readonly receivedAtMs: number;
  readonly receivedAtMonoMs: number;
}

export interface FundingObservation {
  readonly rate: number;
  readonly fundingTimeMs: number | null;
  readonly nextFundingTimeMs: number | null;
  readonly proof: ValueProof;
}

export interface CoverageProof {
  readonly feedId: string;
  readonly feedEpoch: number;
  readonly instId: string;
  readonly wsGeneration: number;
  readonly source: "ws_trades";
  readonly acknowledgedAtMonoMs: number;
  readonly continuousSinceMonoMs: number;
  readonly observedThroughMonoMs: number;
  readonly socketOpen: boolean;
  readonly lostThroughMonoMs: number | null;
}

/** Raw, normalized inputs of one read of one instrument. Numbers are display and analysis values, never balances. */
export interface TapeInput {
  readonly instId: string;
  readonly feedId: string;
  readonly feedEpoch: number;
  readonly monotonicNowMs: number;
  readonly wsGeneration: number;
  readonly funding: FundingObservation | null;
  /** Validated per-feed funding lifetime; the builder must not supply a fallback. */
  readonly fundingMaxAgeMs: number;
  /** Local wall clock of the evaluation. Book, ticker and trade receipts are on this clock. */
  readonly nowMs: number;
  /**
   * The exchange clock at the evaluation (local time plus the measured offset), null when the offset is unknown.
   * Candle stamps are issued by the exchange, so they are aged against this clock and never against the local one.
   */
  readonly exchangeNowMs: number | null;
  /** True only while the socket is open and the trades channel of this instrument was acknowledged. */
  readonly tradesLive: boolean;
  readonly coverage: CoverageProof | null;
  /** Best first on both sides. */
  readonly book: { readonly bids: readonly TapeLevel[]; readonly asks: readonly TapeLevel[]; readonly receivedAtMs: number; readonly proof: ValueProof } | null;
  readonly trades: readonly TapeTrade[];
  /** 1 minute bars, oldest first; the last one may still be forming. */
  readonly candles: readonly TapeCandle[];
  readonly ticker: {
    readonly proof: ValueProof;
    readonly last: number;
    readonly open24h: number | null;
    readonly high24h: number | null;
    readonly low24h: number | null;
    readonly receivedAtMs: number;
  } | null;
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
  | "candles_stale"
  | "clock_unknown"
  | "trades_unavailable";

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
/** A stamp this far ahead of the clock it is compared with is the residual of the offset measurement, not freshness. */
export const FUTURE_TOLERANCE_MS = 5_000;
export const MIN_CANDLES = 31;
export const HORIZON_MINUTES = 5;
