/**
 * The scan of the opportunity engine: every liquid spot pair against USDT, read through its own daily history, put in order by how many of the three factors hold. It uses only the free
 * public reads of the exchange (the tickers and the daily candles), runs by itself in the background when someone looks at the board (it costs no model call and no OnchainOS call) and
 * is cached: a board is good for ten minutes, the daily candles of a pair for thirty, and while a scan runs the next look gets the progress, never a second scan.
 *
 * It describes and never decides. The order is a fact about the numbers (see `rank`), the model chooses among the pairs it puts forward when asked, and a pair that cannot be read is
 * counted and left out, never filled in.
 */
import { attention, MIN_CANDLES, moveInAtr, readFactors, type DayCandle, type FactorRead } from "./factors";
import { OpportunityDataError, type OkxDaily, type Ticker } from "./okx-daily";

export const BOARD_TTL_MS = 10 * 60_000;
export const CANDLES_TTL_MS = 30 * 60_000;
export const RETRY_AFTER_ERROR_MS = 30_000;

/** What a pair must have to be looked at at all: money traded, and a spread that does not eat the move. */
const LIQUIDITY_RULES = { minVolQuote24h: 1_000_000, maxSpreadBps: 15, maxPairs: 90 } as const;

/** Bases that are a dollar, or close to one: a pair of one against USDT is a price, not an opportunity. */
export const STABLE_BASES: ReadonlySet<string> = new Set(["USDC", "DAI", "TUSD", "FDUSD", "USDE", "PYUSD", "USDG", "USDD", "BUSD", "USDP", "EURT", "EUR", "USDT"]);

export interface OpportunityPair {
  readonly instId: string;
  readonly base: string;
  readonly price: number;
  /** 24h change against the open of the 24 hours, a fraction; null when the exchange did not send the open. */
  readonly change24h: number | null;
  readonly volQuote24h: number;
  readonly spreadBps: number;
  /** How far out of the ordinary the pair is today for its own normal (see `attention`), 0 to 2. */
  readonly attention: number;
  /** The 24 hour move in units of its usual daily range, signed. */
  readonly moveAtr: number | null;
  readonly read: FactorRead;
}

export interface OpportunityBoard {
  readonly asOfMs: number;
  /** Pairs against USDT the exchange lists, those that passed the liquidity rules, those that were read and those that failed. */
  readonly universe: { readonly listed: number; readonly liquid: number; readonly read: number; readonly failed: number };
  readonly pairs: readonly OpportunityPair[];
}

export type ScanState =
  | { readonly state: "idle" }
  | { readonly state: "lendo"; readonly done: number; readonly of: number; readonly startedAtMs: number; readonly board: OpportunityBoard | null }
  | { readonly state: "pronto"; readonly board: OpportunityBoard }
  | { readonly state: "erro"; readonly code: string; readonly board: OpportunityBoard | null };

/**
 * The order of the board: what is most out of the ordinary for its own normal first (see `attention`), then the one with more money traded. It is not an order of expected return: the
 * factors of the price history were measured on 13 months of 170 liquid pairs and none, alone or together, nor a learner trained only on the past, beat the average of the pairs.
 */
export function rank(pairs: readonly OpportunityPair[]): OpportunityPair[] {
  return [...pairs].sort((a, b) => b.attention - a.attention || b.volQuote24h - a.volQuote24h || (a.instId < b.instId ? -1 : 1));
}

export function spreadBps(t: Pick<Ticker, "bid" | "ask">): number | null {
  if (t.bid === null || t.ask === null || t.ask < t.bid) return null;
  const mid = (t.bid + t.ask) / 2;
  return mid > 0 ? ((t.ask - t.bid) / mid) * 10_000 : null;
}

/** The pairs worth reading, most traded first. */
export function liquidPairs(tickers: readonly Ticker[]): Ticker[] {
  return tickers
    .filter((t) => !STABLE_BASES.has(t.instId.split("-")[0]!) && t.volQuote24h >= LIQUIDITY_RULES.minVolQuote24h)
    .filter((t) => {
      const s = spreadBps(t);
      return s !== null && s <= LIQUIDITY_RULES.maxSpreadBps;
    })
    .sort((a, b) => b.volQuote24h - a.volQuote24h)
    .slice(0, LIQUIDITY_RULES.maxPairs);
}

/** The series the factors are read on: the closed days, plus today made of what the ticker says now (the last price and the volume of the last 24 hours). */
export function liveSeries(candles: readonly DayCandle[], ticker: Ticker): DayCandle[] | null {
  if (candles.length < MIN_CANDLES) return null;
  const last = candles[candles.length - 1]!;
  const today: DayCandle = { ts: last.ts, open: last.open, high: Math.max(last.high, ticker.last), low: Math.min(last.low, ticker.last), close: ticker.last, volQuote: ticker.volQuote24h };
  return [...candles.slice(0, -1), today];
}

export interface ScannerOptions {
  readonly okx: OkxDaily;
  readonly now?: () => number;
  /** Test seam: the scan is awaited instead of left to run behind the request. */
  readonly onSettled?: () => void;
}

export interface Scanner {
  /** The state now; starts a scan when there is none running and the board is older than its time to live (or there is none). */
  readonly look: () => ScanState;
  /** Resolves when the scan that is running, if any, ends. */
  readonly settled: () => Promise<void>;
}

export function createScanner(options: ScannerOptions): Scanner {
  const now = options.now ?? Date.now;
  const cache = new Map<string, { readonly atMs: number; readonly candles: DayCandle[] }>();
  let state: ScanState = { state: "idle" };
  let running: Promise<void> | null = null;
  let board: OpportunityBoard | null = null;
  let failedAtMs = 0;

  async function scan(): Promise<void> {
    const startedAtMs = now();
    try {
      const { tickers } = await options.okx.tickers();
      const pairs = liquidPairs(tickers);
      state = { state: "lendo", done: 0, of: pairs.length, startedAtMs, board };
      const read: OpportunityPair[] = [];
      let failed = 0;
      let done = 0;
      for (const t of pairs) {
        try {
          const hit = cache.get(t.instId);
          let candles: DayCandle[];
          if (hit !== undefined && now() - hit.atMs < CANDLES_TTL_MS) candles = hit.candles;
          else {
            candles = (await options.okx.daily(t.instId)).candles;
            cache.set(t.instId, { atMs: now(), candles });
          }
          const series = liveSeries(candles, t);
          const factors = series === null ? null : readFactors(series);
          const spread = spreadBps(t);
          if (factors === null || spread === null) failed += 1;
          else {
            const change24h = t.open24h === null ? null : t.last / t.open24h - 1;
            read.push({
              instId: t.instId,
              base: t.instId.split("-")[0]!,
              price: t.last,
              change24h,
              volQuote24h: t.volQuote24h,
              spreadBps: spread,
              attention: attention(change24h, factors.atrPct, factors.volRatio),
              moveAtr: moveInAtr(change24h, factors.atrPct),
              read: factors,
            });
          }
        } catch (error) {
          if (error instanceof OpportunityDataError && error.code === "cancelled") throw error;
          failed += 1;
        }
        done += 1;
        state = { state: "lendo", done, of: pairs.length, startedAtMs, board };
      }
      board = { asOfMs: now(), universe: { listed: tickers.length, liquid: pairs.length, read: read.length, failed }, pairs: rank(read) };
      state = { state: "pronto", board };
    } catch (error) {
      failedAtMs = now();
      state = { state: "erro", code: error instanceof OpportunityDataError ? error.code : "network", board };
    }
  }

  return {
    look() {
      const stale = board === null || now() - board.asOfMs >= BOARD_TTL_MS;
      // after a failure the next try waits, so a page that polls does not hammer an exchange that is not answering
      const cooling = state.state === "erro" && now() - failedAtMs < RETRY_AFTER_ERROR_MS;
      if (running === null && stale && !cooling) {
        state = { state: "lendo", done: 0, of: 0, startedAtMs: now(), board };
        running = scan().finally(() => {
          running = null;
          options.onSettled?.();
        });
      }
      return state;
    },
    settled: () => running ?? Promise.resolve(),
  };
}
