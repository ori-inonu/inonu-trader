/**
 * SYNTHETIC desk state for the dev-only lab page (/mesa-lab) and for tests.
 *
 * Nothing here is market data. It is a seeded random walk that fills every slice of DeskState so
 * the panels can be reviewed at their densest. It must never be imported by production code: only
 * the lab page and tests import it, and the page announces it on a banner.
 */
import type {
  DeskBar,
  DeskBook,
  DeskBookLevel,
  DeskCandle,
  DeskDerivatives,
  DeskFeedStatus,
  DeskFlowBucket,
  DeskInstrument,
  DeskLiquiditySlice,
  DeskMetrics,
  DeskState,
  DeskTicker,
  DeskTrade,
  DeskWatchRow,
} from "../types";
import { DESK_FRESHNESS_MS } from "../types";

export const LAB_BANNER = "LABORATORIO: dados sinteticos, nao e mercado";

/** Same layout the data layer documents: 60 bins of 2 bps over mid minus 60 bps to mid plus 60 bps. */
export const LAB_BINS = 60;
export const LAB_SPAN_BPS = 60;
const BOOK_LEVELS = 60;
const TRADES_KEPT = 400;
const TRADES_SHOWN = 200;
const FLOW_KEPT = 120;
const LIQUIDITY_KEPT = 90;
const CANDLES_KEPT = 200;
const SPARK_POINTS = 48;

export interface LabPreset {
  readonly instId: string;
  readonly instType: "SPOT" | "SWAP";
  readonly tickSz: string;
  readonly lotSz: string;
  readonly startPx: number;
  /** Typical size resting at the touch, in base units. */
  readonly touchSz: number;
  /** How far from mid the 60 synthetic levels reach, in bps. A short reach exercises the cropped wall. */
  readonly reachBps: number;
}

export const LAB_PRESETS: readonly LabPreset[] = [
  { instId: "BTC-USDT-SWAP", instType: "SWAP", tickSz: "0.1", lotSz: "0.01", startPx: 67_432.1, touchSz: 18, reachBps: 22 },
  // Tiny base sizes, like the real BTC-USDT book: prints of 0,00004 BTC and a short reach.
  { instId: "BTC-USDT", instType: "SPOT", tickSz: "0.1", lotSz: "0.00000001", startPx: 67_432.1, touchSz: 0.0015, reachBps: 14 },
  { instId: "ETH-USDT", instType: "SPOT", tickSz: "0.01", lotSz: "0.00001", startPx: 3_250.55, touchSz: 22, reachBps: 58 },
  { instId: "MON-USDT", instType: "SPOT", tickSz: "0.00001", lotSz: "0.1", startPx: 0.02223, touchSz: 90_000, reachBps: 58 },
];

const WATCH_IDS: ReadonlyArray<{ id: string; px: number; swap: boolean }> = [
  { id: "BTC-USDT", px: 67_432.1, swap: false },
  { id: "ETH-USDT", px: 3_250.55, swap: false },
  { id: "SOL-USDT", px: 148.32, swap: false },
  { id: "OKB-USDT", px: 52.17, swap: false },
  { id: "MON-USDT", px: 0.02223, swap: false },
  { id: "BTC-USDT-SWAP", px: 67_438.4, swap: true },
];

const BAR_MS: Record<DeskBar, number> = {
  "1m": 60_000,
  "5m": 300_000,
  "15m": 900_000,
  "1H": 3_600_000,
  "4H": 14_400_000,
  "1D": 86_400_000,
};

/** Small seeded generator so a given seed always produces the same market. */
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

export interface LabMarket {
  readonly preset: LabPreset;
  /** Advances the simulation to `nowMs` and returns the new state. */
  step(nowMs: number): DeskState;
  state(): DeskState;
  setBar(bar: DeskBar): void;
  setFocus(instId: string): void;
}

export function createLabMarket(preset: LabPreset = LAB_PRESETS[0], seed = 7, startMs = Date.UTC(2026, 9, 11, 12, 0, 0)): LabMarket {
  const rng = mulberry32(seed);
  const gauss = (): number => {
    const u = Math.max(1e-9, rng());
    const v = rng();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };
  const tick = Number(preset.tickSz);
  const roundTick = (px: number): number => Number((Math.round(px / tick) * tick).toFixed(12));

  let nowMs = startMs;
  let mid = preset.startPx;
  let bias = 0;
  let bar: DeskBar = "1m";
  let focus = preset.instId;
  let tradeSeq = 1;
  let lastSliceAt = 0;
  let lastSparkAt = 0;
  const open24h = preset.startPx * (1 + (rng() - 0.5) * 0.04);
  let high24h = Math.max(preset.startPx, open24h) * 1.012;
  let low24h = Math.min(preset.startPx, open24h) * 0.988;
  let volBase24h = preset.touchSz * 9_000;

  const bidSz = Array.from({ length: BOOK_LEVELS }, () => preset.touchSz);
  const askSz = Array.from({ length: BOOK_LEVELS }, () => preset.touchSz);
  const walls = new Set<number>();

  let book: DeskBook = { instId: preset.instId, bids: [], asks: [], tsMs: nowMs, seqId: 1, checksumOk: null };
  let trades: DeskTrade[] = [];
  let candles: DeskCandle[] = [];
  let flow: DeskFlowBucket[] = [];
  let liquidity: DeskLiquiditySlice[] = [];
  let watch = WATCH_IDS.map((w) => ({ ...w, open: w.px * (1 + (rng() - 0.5) * 0.05), spark: [] as number[], vol: w.px * 1e6 * (0.2 + rng() * 6) }));

  const moveMid = (dt: number): void => {
    bias = bias * 0.97 + gauss() * 0.05;
    const sigma = 0.00006 * Math.sqrt(dt / 200);
    mid = Math.max(tick * 10, mid * Math.exp(gauss() * sigma + bias * 0.00002));
  };

  const buildBook = (): void => {
    const spreadTicks = 1 + (rng() < 0.25 ? 1 : 0) + (rng() < 0.05 ? 2 : 0);
    const bestBid = roundTick(Math.floor(mid / tick - spreadTicks / 2) * tick);
    const bestAsk = roundTick(bestBid + spreadTicks * tick);
    const tickBps = (tick / mid) * 10_000;
    for (let k = 0; k < BOOK_LEVELS; k += 1) {
      if (rng() < 0.012) walls.add(k);
      else if (rng() < 0.01) walls.delete(k);
      const wall = walls.has(k) ? 4 + rng() * 5 : 1;
      const grow = 1 + k * 0.05;
      const target = (side: number): number => preset.touchSz * Math.exp(gauss() * 0.55 - 0.15) * grow * wall * side;
      bidSz[k] = bidSz[k] * 0.78 + target(1) * 0.22;
      askSz[k] = askSz[k] * 0.78 + target(1) * 0.22;
    }
    const levels = (anchor: number, dir: 1 | -1, sizes: number[]): DeskBookLevel[] => {
      const out: DeskBookLevel[] = [];
      let previous = anchor;
      for (let k = 0; k < BOOK_LEVELS; k += 1) {
        const offsetBps = k === 0 ? 0 : Math.max(tickBps * k, (preset.reachBps / 60 ** 1.25) * (k + 1) ** 1.25);
        let px = roundTick(anchor * (1 + (dir * offsetBps) / 10_000));
        if (k > 0 && (dir === 1 ? px <= previous : px >= previous)) px = roundTick(previous + dir * tick);
        previous = px;
        out.push({ px, sz: Number(sizes[k].toFixed(6)), orders: 1 + Math.floor(rng() * 6) });
      }
      return out;
    };
    book = {
      instId: preset.instId,
      bids: levels(bestBid, -1, bidSz),
      asks: levels(bestAsk, 1, askSz),
      tsMs: nowMs,
      seqId: (book.seqId ?? 0) + 1,
      checksumOk: null,
    };
  };

  const buildCandles = (): void => {
    const dur = BAR_MS[bar];
    const closes: number[] = [mid];
    const sigmaBar = 0.0009 * Math.sqrt(dur / 60_000) ** 0.9;
    for (let i = 1; i <= CANDLES_KEPT; i += 1) closes.unshift(closes[0] * Math.exp(-gauss() * sigmaBar));
    const startTs = Math.floor(nowMs / dur) * dur - CANDLES_KEPT * dur;
    candles = closes.slice(1).map((close, i) => {
      const open = closes[i];
      const wick = Math.abs(gauss()) * sigmaBar * 0.5;
      const volBase = preset.touchSz * (20 + rng() * 60) * (1 + Math.abs(close / open - 1) * 400);
      return {
        tsMs: startTs + (i + 1) * dur,
        open,
        high: Math.max(open, close) * (1 + wick),
        low: Math.min(open, close) * (1 - wick * 0.9),
        close,
        volBase,
        volQuote: volBase * close,
        confirmed: true,
      };
    });
    const last = candles[candles.length - 1];
    candles[candles.length - 1] = { ...last, confirmed: false, volBase: last.volBase * 0.3 };
  };

  const metrics = (): DeskMetrics => {
    const bid = book.bids[0];
    const ask = book.asks[0];
    const m = (bid.px + ask.px) / 2;
    const within = (side: readonly DeskBookLevel[], bps: number): number => {
      let sum = 0;
      for (const l of side) if (Math.abs((l.px - m) / m) * 10_000 <= bps) sum += l.px * l.sz;
      return sum;
    };
    const b10 = within(book.bids, 10);
    const a10 = within(book.asks, 10);
    const b50 = within(book.bids, 50);
    const a50 = within(book.asks, 50);
    const cut = nowMs - 60_000;
    let buy = 0;
    let sell = 0;
    let count = 0;
    let cvd = 0;
    let pv = 0;
    let vol = 0;
    for (const t of trades) {
      cvd += t.side === "buy" ? t.sz : -t.sz;
      pv += t.px * t.sz;
      vol += t.sz;
      if (t.tsMs >= cut) {
        count += 1;
        if (t.side === "buy") buy += t.sz;
        else sell += t.sz;
      }
    }
    const last = trades.length ? trades[0].px : m;
    return {
      midPx: m,
      microPx: (bid.px * ask.sz + ask.px * bid.sz) / (bid.sz + ask.sz),
      spreadBps: ((ask.px - bid.px) / m) * 10_000,
      depthBidShare10bps: b10 + a10 > 0 ? b10 / (b10 + a10) : null,
      depthBidShare50bps: b50 + a50 > 0 ? b50 / (b50 + a50) : null,
      bidDepthQuote10bps: b10,
      askDepthQuote10bps: a10,
      bidDepthQuote50bps: b50,
      askDepthQuote50bps: a50,
      buyVolBase60s: buy,
      sellVolBase60s: sell,
      flowImbalance60s: buy + sell > 0 ? (buy - sell) / (buy + sell) : null,
      tradesPerSecond60s: count / 60,
      cvd,
      vwap: vol > 0 ? pv / vol : null,
      realizedSigmaDaily: null,
      change24hPct: ((last - open24h) / open24h) * 100,
    };
  };

  const pushSlice = (): void => {
    const m = (book.bids[0].px + book.asks[0].px) / 2;
    const bins = new Array<number>(LAB_BINS).fill(0);
    const width = (LAB_SPAN_BPS * 2) / LAB_BINS;
    const reach = (side: readonly DeskBookLevel[]): number => {
      const far = side[side.length - 1].px;
      return Math.min(LAB_SPAN_BPS, (Math.abs(far - m) / m) * 10_000);
    };
    const add = (levels: readonly DeskBookLevel[]): void => {
      for (const l of levels) {
        const bps = ((l.px - m) / m) * 10_000;
        const index = Math.floor((bps + LAB_SPAN_BPS) / width);
        if (index >= 0 && index < LAB_BINS) bins[index] += l.px * l.sz;
      }
    };
    add(book.bids);
    add(book.asks);
    liquidity = [
      ...liquidity,
      { tsMs: nowMs, bins, midPx: m, reachBidBps: reach(book.bids), reachAskBps: reach(book.asks) },
    ].slice(-LIQUIDITY_KEPT);
  };

  /** Adds one print to its per second bucket. Buckets are replaced, never mutated, so memoised views see the change. */
  const addFlow = (t: DeskTrade): void => {
    const sec = Math.floor(t.tsMs / 1000) * 1000;
    const last = flow[flow.length - 1];
    const base: DeskFlowBucket = last && last.tsMs === sec ? last : { tsMs: sec, buyBase: 0, sellBase: 0, lastPx: t.px };
    const next: DeskFlowBucket = {
      tsMs: sec,
      buyBase: base.buyBase + (t.side === "buy" ? t.sz : 0),
      sellBase: base.sellBase + (t.side === "sell" ? t.sz : 0),
      lastPx: t.px,
    };
    flow = (last && last.tsMs === sec ? [...flow.slice(0, -1), next] : [...flow, next]).slice(-FLOW_KEPT);
  };

  const advance = (dt: number): void => {
    moveMid(dt);
    buildBook();
    const bestBid = book.bids[0].px;
    const bestAsk = book.asks[0].px;
    // Taker prints, about six a second, biased with the drift.
    let n = 0;
    for (let p = Math.exp(-(dt / 1000) * 6), acc = rng(); acc > p && n < 40; acc *= rng()) n += 1;
    const fresh: DeskTrade[] = [];
    for (let i = 0; i < n; i += 1) {
      const side = rng() < 0.5 + bias * 0.9 ? "buy" : "sell";
      const big = rng() < 0.05 ? 7 + rng() * 6 : 1;
      const sz = Number((preset.touchSz * 0.05 * Math.exp(gauss() * 0.7) * big).toFixed(6));
      fresh.push({
        id: String(tradeSeq++),
        px: side === "buy" ? bestAsk : bestBid,
        sz: Math.max(sz, Number(preset.lotSz)),
        side,
        tsMs: Math.round(nowMs - rng() * dt),
      });
    }
    fresh.sort((a, b) => b.tsMs - a.tsMs);
    trades = [...fresh, ...trades].slice(0, TRADES_KEPT);
    for (const t of [...fresh].reverse()) {
      addFlow(t);
      volBase24h += t.sz;
      high24h = Math.max(high24h, t.px);
      low24h = Math.min(low24h, t.px);
    }
    // Candles: update the forming one and roll over at the boundary.
    const dur = BAR_MS[bar];
    let lastCandle = candles[candles.length - 1];
    const px = trades.length ? trades[0].px : mid;
    const boundary = Math.floor(nowMs / dur) * dur;
    if (boundary > lastCandle.tsMs) {
      candles = [...candles.slice(-(CANDLES_KEPT - 1)).map((c, i, all) => (i === all.length - 1 ? { ...c, confirmed: true } : c)), {
        tsMs: boundary,
        open: lastCandle.close,
        high: lastCandle.close,
        low: lastCandle.close,
        close: lastCandle.close,
        volBase: 0,
        volQuote: 0,
        confirmed: false,
      }];
      lastCandle = candles[candles.length - 1];
    }
    const traded = fresh.reduce((s, t) => s + t.sz, 0);
    candles = [
      ...candles.slice(0, -1),
      {
        ...lastCandle,
        high: Math.max(lastCandle.high, px),
        low: Math.min(lastCandle.low, px),
        close: px,
        volBase: lastCandle.volBase + traded,
        volQuote: lastCandle.volQuote + traded * px,
      },
    ];
    if (nowMs - lastSliceAt >= 1000) {
      lastSliceAt = nowMs;
      pushSlice();
    }
    watch = watch.map((w) => {
      const next = w.px * Math.exp(gauss() * 0.00014 * Math.sqrt(dt / 200));
      return { ...w, px: next };
    });
    if (nowMs - lastSparkAt >= 2000) {
      lastSparkAt = nowMs;
      watch = watch.map((w) => ({ ...w, spark: [...w.spark, w.px].slice(-SPARK_POINTS) }));
    }
  };

  const instrument: DeskInstrument = {
    instId: preset.instId,
    instType: preset.instType,
    base: preset.instId.split("-")[0],
    quote: preset.instId.split("-")[1],
    tickSz: preset.tickSz,
    lotSz: preset.lotSz,
  };

  const snapshot = (): DeskState => {
    const m = metrics();
    const ticker: DeskTicker = {
      instId: preset.instId,
      last: trades.length ? trades[0].px : mid,
      open24h,
      high24h,
      low24h,
      volBase24h,
      volQuote24h: volBase24h * mid,
      bidPx: book.bids[0].px,
      bidSz: book.bids[0].sz,
      askPx: book.asks[0].px,
      askSz: book.asks[0].sz,
      tsMs: nowMs,
    };
    const nextFunding = Math.ceil((nowMs + 1) / 28_800_000) * 28_800_000;
    const derivatives: DeskDerivatives | null =
      preset.instType === "SWAP"
        ? {
            instId: preset.instId,
            fundingRate: 0.00008 + bias * 0.00002,
            nextFundingTimeMs: nextFunding,
            markPx: mid * (1 + 0.00004),
            indexPx: mid * (1 - 0.00003),
            openInterest: 1_204_000 + Math.round(bias * 9_000),
            openInterestUsd: 8_120_000_000,
            tsMs: nowMs,
          }
        : null;
    const watchlist: DeskWatchRow[] = watch.map((w) => ({
      instId: w.id,
      ticker: {
        instId: w.id,
        last: w.px,
        open24h: w.open,
        high24h: Math.max(w.px, w.open) * 1.01,
        low24h: Math.min(w.px, w.open) * 0.99,
        volBase24h: w.vol / w.px,
        volQuote24h: w.vol,
        bidPx: null,
        bidSz: null,
        askPx: null,
        askSz: null,
        tsMs: nowMs,
      },
      spark: w.spark,
      fundingRate: w.swap ? 0.0001 : null,
    }));
    const feeds: DeskFeedStatus[] = (Object.keys(DESK_FRESHNESS_MS) as Array<keyof typeof DESK_FRESHNESS_MS>).map((id) => ({
      id,
      state: "live",
      lastMessageAtMs: nowMs,
      freshnessMs: DESK_FRESHNESS_MS[id],
      reconnects: 0,
      detail: null,
    }));
    return {
      focus,
      bar,
      instrument,
      ticker,
      book,
      trades: trades.slice(0, TRADES_SHOWN),
      candles,
      derivatives,
      metrics: m,
      flow,
      liquidity,
      watchlist,
      feeds,
      updatedAtMs: nowMs,
      clockSkewMs: 0,
    };
  };

  // Warm up ninety seconds so every panel opens full: slices, flow buckets, trades and a spark line.
  nowMs = startMs - 100_000;
  buildBook();
  buildCandles();
  for (let i = 0; i < 500; i += 1) {
    nowMs += 200;
    advance(200);
  }
  nowMs = startMs;
  let current = snapshot();

  return {
    preset,
    state: () => current,
    step(next: number): DeskState {
      const dt = Math.max(1, Math.min(2_000, next - nowMs));
      nowMs = next;
      advance(dt);
      current = snapshot();
      return current;
    },
    setBar(next: DeskBar): void {
      bar = next;
      buildCandles();
      current = snapshot();
    },
    setFocus(instId: string): void {
      focus = instId;
      current = snapshot();
    },
  };
}
