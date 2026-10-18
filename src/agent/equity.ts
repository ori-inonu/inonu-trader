/**
 * The growth of the wallet the agent trades from, measured the way a fund measures it (ZC-6 and ZC-7, docs/sdd/agente-autonomo/ADENDO-A-zero-configuracao.md): a time-weighted index in which a deposit or a withdrawal moves nothing, so that "the capital grew" means the
 * decisions earned it and not that money was added, and a loss is not hidden by one. The agent owner's only criterion is the result, so the result has to be the wallet's, per day, and honest about what it does
 * not know. The circuit breaker reads this series instead of a hypothetical: it sees what the wallet really lost, costs, slippage and failed exits included.
 *
 * How a flow is told from a result: between two readings, the quantities held are compared. Trading swaps one asset for another, so it moves the value of the quantities by its costs only (impact, fees, gas,
 * tax), a small share of what was traded. A change of quantities beyond that share is money that came in or went out, and it is taken out of the interval's return. A flow small enough to hide inside the costs of a
 * trade, or inside the dust line, cannot be told from them and counts as result; that is the limit of this method, stated here and not hidden.
 *
 * Unknown stays unknown: a reading that could not be valued is skipped, a change of quantity that cannot be priced is a gap (counted, the index carries over it), and readings out of order are refused. Pure:
 * the wire builds the snapshots from the book and the trades from the ledger, and applies the pause.
 */

/** One asset held, in decimal units, with the price used to value it; null when it had none. */
export interface Holding {
  readonly id: string;
  readonly units: number;
  readonly priceUsd: number | null;
}

/** One reading of the wallet. `usd` is what the reading valued it at (null when it could not be valued, or the reading was partial); `holdings` are the assets that valuation counted. */
export interface Snapshot {
  readonly atMs: number;
  readonly usd: number | null;
  readonly holdings: readonly Holding[];
}

/** An order the agent sent, with its size in dollars. */
export interface Trade {
  readonly atMs: number;
  readonly usd: number;
}

/** CHOICES of this code, conservative and not calibrated. */
export const EQUITY = {
  /** A trade moves value by its costs only. A change of quantities beyond this share of what was traded (plus the dust line) is a deposit or a withdrawal. The exchange itself refuses an impact above ten percent. */
  costBoundShare: 0.12,
  /** An order sent up to this long before a reading may still be settling into the balance. */
  settleLagMs: 30 * 60_000,
  /** Below this is rounding, a rebase or an airdrop nobody asked for. */
  dustUsd: 0.25,
} as const;

/** When the wallet's own result opens the circuit breaker. CHOICES of this code, conservative and not calibrated. */
export const EQUITY_LIMITS = {
  /** A loss of this percent of the index over the last day. */
  dayLossPct: 5,
  /** A loss of this percent from the best the index reached in the window below. */
  peakLossPct: 12,
  /** The peak is the best of this window, so that a loss is judged against the recent past and a breaker cannot hold for weeks. */
  peakWindowMs: 7 * 86_400_000,
  /** A series that stopped longer ago than this does not speak about now. */
  maxAgeMs: 2 * 3_600_000,
} as const;

const DAY_MS = 86_400_000;

export interface IndexPoint {
  readonly atMs: number;
  /** 1 at the first valued reading; moves only with the result of the wallet. */
  readonly index: number;
  /** What the wallet was valued at, deposits and withdrawals included. */
  readonly usd: number;
}

export interface EquitySeries {
  readonly points: readonly IndexPoint[];
  /** Intervals whose return could not be known (a quantity that changed and could not be priced, or flows that explain more than the wallet held). */
  readonly gaps: number;
  /** Readings that could not be valued and were skipped. */
  readonly unknown: number;
  /** Readings refused: out of order, repeated or with a time that is not a time. */
  readonly rejected: number;
  /** Deposits (positive) and withdrawals (negative) told apart from the result, summed in dollars. */
  readonly flowsUsd: number;
  /** The result in dollars over the intervals that were known, flows taken out. */
  readonly pnlUsd: number;
  /** How long the known intervals cover, and how long the series spans. */
  readonly knownMs: number;
  readonly spanMs: number;
}

/** Units by asset id, or null when a count is not a count. Two entries of the same id are one holding. */
function unitsOf(holdings: readonly Holding[]): Map<string, number> | null {
  const out = new Map<string, number>();
  for (const x of holdings) {
    if (!Number.isFinite(x.units) || x.units < 0) return null;
    out.set(x.id, (out.get(x.id) ?? 0) + x.units);
  }
  return out;
}

/** The latest usable price of each asset. */
function pricesOf(holdings: readonly Holding[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const x of holdings) if (x.priceUsd !== null && Number.isFinite(x.priceUsd) && x.priceUsd >= 0) out.set(x.id, x.priceUsd);
  return out;
}

/** The value, at the later prices, of the quantities that changed between two readings; null when one of them cannot be priced. */
function quantityEffect(a: Snapshot, b: Snapshot): number | null {
  const ua = unitsOf(a.holdings);
  const ub = unitsOf(b.holdings);
  if (ua === null || ub === null) return null;
  const pa = pricesOf(a.holdings);
  const pb = pricesOf(b.holdings);
  let q = 0;
  for (const id of new Set([...ua.keys(), ...ub.keys()])) {
    const delta = (ub.get(id) ?? 0) - (ua.get(id) ?? 0);
    if (delta === 0) continue;
    const price = pb.get(id) ?? pa.get(id);
    if (price === undefined) return null;
    q += delta * price;
  }
  return q;
}

export function buildSeries(snapshots: readonly Snapshot[], trades: readonly Trade[]): EquitySeries {
  const sent = trades.filter((t) => Number.isFinite(t.atMs) && Number.isFinite(t.usd) && t.usd > 0);
  const points: IndexPoint[] = [];
  let rejected = 0;
  let unknown = 0;
  let gaps = 0;
  let flows = 0;
  let pnl = 0;
  let known = 0;
  let lastAt = Number.NEGATIVE_INFINITY;
  let firstAt = 0;
  let base: (Snapshot & { readonly usd: number }) | null = null;
  let index = 1;

  for (const s of snapshots) {
    if (!Number.isFinite(s.atMs) || s.atMs <= lastAt) {
      rejected++;
      continue;
    }
    lastAt = s.atMs;
    if (s.usd === null || !Number.isFinite(s.usd) || s.usd < 0) {
      unknown++;
      continue;
    }
    const here = s as Snapshot & { readonly usd: number };
    if (base === null) {
      firstAt = s.atMs;
      points.push({ atMs: s.atMs, index, usd: here.usd });
      base = here;
      continue;
    }
    const from = base;
    const span = s.atMs - from.atMs;
    if (from.usd === 0) {
      // the wallet was empty: whatever it holds now was put in, and there is no return to measure
      flows += here.usd;
      known += span;
    } else {
      const q = quantityEffect(from, here);
      if (q === null) {
        gaps++;
      } else {
        const traded = sent.filter((t) => t.atMs > from.atMs - EQUITY.settleLagMs && t.atMs <= s.atMs).reduce((sum, t) => sum + t.usd, 0);
        const flow = Math.abs(q) <= EQUITY.costBoundShare * traded + EQUITY.dustUsd ? 0 : q;
        const grown = here.usd - flow;
        if (grown < 0) {
          gaps++;
        } else {
          index *= grown / from.usd;
          flows += flow;
          pnl += grown - from.usd;
          known += span;
        }
      }
    }
    // over a gap the index carries: what could not be known is not made up
    points.push({ atMs: s.atMs, index, usd: here.usd });
    base = here;
  }
  const lastValued = points.length === 0 ? firstAt : points[points.length - 1]!.atMs;
  return { points, gaps, unknown, rejected, flowsUsd: flows, pnlUsd: pnl, knownMs: known, spanMs: lastValued - firstAt };
}

export interface EquitySummary {
  readonly fromMs: number;
  readonly toMs: number;
  /** What the wallet is valued at now, deposits and withdrawals included. */
  readonly valueUsd: number;
  /** The result since the first reading, flows taken out. */
  readonly twrPct: number;
  readonly pnlUsd: number;
  readonly flowsUsd: number;
  readonly peakIndex: number;
  /** Below the best the index ever reached, now and at the worst. */
  readonly drawdownPct: number;
  readonly maxDrawdownPct: number;
  /** The share of the span covered by intervals whose return was known, 0 to 1. */
  readonly coverage: number;
  readonly gaps: number;
  readonly unknown: number;
  readonly rejected: number;
  readonly points: number;
}

/** The picture of a series, or null when it has fewer than two valued readings to compare. */
export function summarize(series: EquitySeries): EquitySummary | null {
  const p = series.points;
  if (p.length < 2) return null;
  const first = p[0]!;
  const last = p[p.length - 1]!;
  let peak = first.index;
  let maxDd = 0;
  for (const x of p) {
    peak = Math.max(peak, x.index);
    if (peak > 0) maxDd = Math.max(maxDd, ((peak - x.index) / peak) * 100);
  }
  return {
    fromMs: first.atMs,
    toMs: last.atMs,
    valueUsd: last.usd,
    twrPct: (last.index / first.index - 1) * 100,
    pnlUsd: series.pnlUsd,
    flowsUsd: series.flowsUsd,
    peakIndex: peak,
    drawdownPct: peak > 0 ? ((peak - last.index) / peak) * 100 : 0,
    maxDrawdownPct: maxDd,
    coverage: series.spanMs > 0 ? Math.min(1, series.knownMs / series.spanMs) : 1,
    gaps: series.gaps,
    unknown: series.unknown,
    rejected: series.rejected,
    points: p.length,
  };
}

/** The change of the index over the last `windowMs` up to `nowMs`, in percent; the window is as long as the series when the series is shorter. Null when there is nothing to compare. */
export function windowChangePct(series: EquitySeries, nowMs: number, windowMs: number): number | null {
  const p = series.points.filter((x) => x.atMs <= nowMs);
  if (p.length < 2) return null;
  const current = p[p.length - 1]!;
  const edge = nowMs - windowMs;
  let baseline = p[0]!;
  for (const x of p) {
    if (x.atMs > edge) break;
    baseline = x;
  }
  if (baseline === current || baseline.index <= 0) return null;
  return (current.index / baseline.index - 1) * 100;
}

export type EquityPause = "queda_do_dia" | "queda_do_pico";

/**
 * The reason to pause new purchases now, from what the wallet really did, or null to go on. The caller applies the conditions of its own (that it is trading, that it is not already paused): this only reads
 * the series. A series that stopped long ago, or has fewer than two valued readings, says nothing.
 */
export function judgeEquity(series: EquitySeries, nowMs: number): EquityPause | null {
  const p = series.points.filter((x) => x.atMs <= nowMs);
  const current = p[p.length - 1];
  if (p.length < 2 || current === undefined || nowMs - current.atMs > EQUITY_LIMITS.maxAgeMs) return null;
  const day = windowChangePct(series, nowMs, DAY_MS);
  if (day !== null && day <= -EQUITY_LIMITS.dayLossPct) return "queda_do_dia";
  const edge = nowMs - EQUITY_LIMITS.peakWindowMs;
  let peak = 0;
  for (const x of p) if (x.atMs >= edge) peak = Math.max(peak, x.index);
  if (peak > 0 && ((peak - current.index) / peak) * 100 >= EQUITY_LIMITS.peakLossPct) return "queda_do_pico";
  return null;
}

export interface DayReturn {
  /** The person's day, `YYYY-MM-DD`. */
  readonly day: string;
  /** The result of the day in percent, flows taken out: the close of the day against the close of the one before. */
  readonly returnPct: number;
  readonly closeIndex: number;
  /** The first day of the series has no close before it: its return runs from the first reading. */
  readonly partial: boolean;
}

/** The result of each day, for the person's day: `tzOffsetMin` is the offset of their clock from UTC in minutes (Brazil: -180). */
export function dailyReturns(series: EquitySeries, tzOffsetMin = 0): DayReturn[] {
  if (series.points.length === 0) return [];
  const offset = tzOffsetMin * 60_000;
  const closes = new Map<number, IndexPoint>();
  for (const p of series.points) closes.set(Math.floor((p.atMs + offset) / DAY_MS), p);
  const out: DayReturn[] = [];
  let open = series.points[0]!.index;
  let partial = true;
  for (const key of [...closes.keys()].sort((a, b) => a - b)) {
    const close = closes.get(key)!;
    out.push({ day: new Date(key * DAY_MS).toISOString().slice(0, 10), returnPct: open > 0 ? (close.index / open - 1) * 100 : 0, closeIndex: close.index, partial });
    open = close.index;
    partial = false;
  }
  return out;
}
