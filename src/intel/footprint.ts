/**
 * Footprint of a candle by price level (T5.2, FLX-1, FLX-11).
 *
 * For every price level, how much was bought and how much was sold by the AGGRESSOR (the taker) of each trade. The
 * exchange's public `trades` channel carries that side, which is what makes this free and real. Volumes are whole
 * numbers of the instrument's unit, summed exactly:
 *
 *  - level = floor(price / (binTicks * tickSz)), in exact decimal arithmetic;
 *  - on a perpetual `sz` is in CONTRACTS: base currency = sz * ctVal * ctMult. The unit is lotSz * ctVal * ctMult in
 *    base currency (one lot), and a size that is not a whole number of lots is rejected and counted, never rounded;
 *  - spot and perpetual are never mixed: every footprint names its instrument type and unit.
 *
 * Pure: no clock, no network, no disk.
 */
import { cmpDec, decToString, divExactDec, floorDivDec, mulDec, parseDec, subDec, type Dec } from "./decimal";
import type { Trade } from "./ingest";

export interface InstrumentMeta {
  readonly instId: string;
  /** SPOT counts in base currency; every other type (SWAP, FUTURES, OPTION) counts in contracts. */
  readonly instType: "SPOT" | "SWAP" | "FUTURES" | "OPTION" | "MARGIN";
  readonly tickSz: string;
  readonly lotSz: string;
  /** Contract value in base currency. Required when the size is in contracts. */
  readonly ctVal?: string;
  readonly ctMult?: string;
}

export interface FootprintLevel {
  /** floor(price / (binTicks * tickSz)). */
  readonly level: number;
  /** The low edge of the level, as a decimal text. */
  readonly priceLow: string;
  /** Aggressive buying, in units. */
  readonly c: number;
  /** Aggressive selling, in units. */
  readonly v: number;
}

export interface Footprint {
  readonly instId: string;
  readonly instType: InstrumentMeta["instType"];
  readonly binTicks: number;
  readonly tickSz: string;
  /** One unit in base currency, as a decimal text. */
  readonly unit: string;
  /** Ascending by level. */
  readonly levels: FootprintLevel[];
  readonly totals: { readonly c: number; readonly v: number; readonly delta: number };
  readonly trades: number;
  readonly rejected: number;
}

export interface FootprintBuilder {
  /** True when the trade was kept; false when it was rejected (and counted). */
  add(trade: Trade): boolean;
  build(): Footprint;
}

export type UnitResult = { readonly ok: true; readonly unit: string } | { readonly ok: false; readonly error: string };

interface Unit {
  /** Multiplier from a reported size to base currency: 1 for spot, ctVal * ctMult for contracts. */
  readonly toBase: Dec;
  /** One lot in base currency. */
  readonly lot: Dec;
}

function unitSpec(meta: InstrumentMeta): { ok: true; unit: Unit } | { ok: false; error: string } {
  const lotSz = parseDec(meta.lotSz);
  if (lotSz === null || lotSz.int <= 0n) return { ok: false, error: "lotSz must be a positive decimal" };
  if (meta.instType === "SPOT") return { ok: true, unit: { toBase: { int: 1n, scale: 0 }, lot: lotSz } };
  const ctVal = meta.ctVal === undefined ? null : parseDec(meta.ctVal);
  if (ctVal === null || ctVal.int <= 0n) return { ok: false, error: "a contract instrument needs a positive ctVal" };
  const ctMult = meta.ctMult === undefined ? null : parseDec(meta.ctMult);
  if (ctMult === null || ctMult.int <= 0n) return { ok: false, error: "a contract instrument needs a positive ctMult" };
  const toBase = mulDec(ctVal, ctMult);
  return { ok: true, unit: { toBase, lot: mulDec(lotSz, toBase) } };
}

/** The unit of the instrument in base currency, or why it cannot be determined. */
export function unitOf(meta: InstrumentMeta): UnitResult {
  const spec = unitSpec(meta);
  return spec.ok ? { ok: true, unit: decToString(spec.unit.lot) } : spec;
}

const toSafe = (value: bigint): number | null => (value >= -BigInt(Number.MAX_SAFE_INTEGER) && value <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(value) : null);

export interface ReadTrade {
  readonly level: number;
  /** Size in whole units of the instrument (see unitOf). */
  readonly units: number;
  readonly side: "buy" | "sell";
}

/**
 * Turns a raw trade into its price level and its size in units, or null when it must be rejected (bad decimal, zero
 * size, a size that is not a whole number of lots, a number too large to be exact). Shared by the footprint and by the
 * factors that look at single trades, so both convert contracts and bin prices the same way.
 */
export function createTradeReader(meta: InstrumentMeta, binTicks: number): (trade: Trade) => ReadTrade | null {
  if (!Number.isSafeInteger(binTicks) || binTicks < 1) throw new RangeError("binTicks must be a positive whole number");
  const tick = parseDec(meta.tickSz);
  if (tick === null || tick.int <= 0n) throw new RangeError("tickSz must be a positive decimal");
  const spec = unitSpec(meta);
  if (!spec.ok) throw new RangeError(spec.error);
  const { toBase, lot } = spec.unit;
  const step = mulDec(tick, { int: BigInt(binTicks), scale: 0 });
  return (trade) => {
    if (trade === null || typeof trade !== "object" || (trade.side !== "buy" && trade.side !== "sell")) return null;
    const px = parseDec(trade.px);
    const sz = parseDec(trade.sz);
    if (px === null || sz === null || px.int <= 0n || sz.int <= 0n) return null;
    const units = divExactDec(mulDec(sz, toBase), lot);
    if (units === null) return null; // not a whole number of lots: a data anomaly, never rounded
    const amount = toSafe(units);
    const level = toSafe(floorDivDec(px, step));
    return amount === null || level === null ? null : { level, units: amount, side: trade.side };
  };
}

export function createFootprint(meta: InstrumentMeta, binTicks: number): FootprintBuilder {
  const read = createTradeReader(meta, binTicks);
  const tick = parseDec(meta.tickSz)!;
  const lot = (unitSpec(meta) as { ok: true; unit: Unit }).unit.lot;
  const step = mulDec(tick, { int: BigInt(binTicks), scale: 0 });

  const levels = new Map<number, { c: number; v: number }>();
  let trades = 0;
  let rejected = 0;
  let totalC = 0;
  let totalV = 0;

  const reject = (): false => {
    rejected += 1;
    return false;
  };

  return {
    add(trade) {
      const read_ = read(trade);
      if (read_ === null) return reject();
      let row = levels.get(read_.level);
      if (row === undefined) {
        row = { c: 0, v: 0 };
        levels.set(read_.level, row);
      }
      if (read_.side === "buy") {
        row.c += read_.units;
        totalC += read_.units;
      } else {
        row.v += read_.units;
        totalV += read_.units;
      }
      trades += 1;
      return true;
    },

    build() {
      const stepDec = step;
      const ordered = [...levels.entries()].sort((a, b) => a[0] - b[0]).map(([level, row]) => ({
        level,
        priceLow: decToString(mulDec({ int: BigInt(level), scale: 0 }, stepDec)),
        c: row.c,
        v: row.v,
      }));
      return {
        instId: meta.instId,
        instType: meta.instType,
        binTicks,
        tickSz: decToString(tick),
        unit: decToString(lot),
        levels: ordered,
        totals: { c: totalC, v: totalV, delta: totalC - totalV },
        trades,
        rejected,
      };
    },
  };
}

export function buildFootprint(meta: InstrumentMeta, binTicks: number, trades: readonly Trade[]): Footprint {
  const builder = createFootprint(meta, binTicks);
  for (const trade of trades) builder.add(trade);
  return builder.build();
}

// ---------------------------------------------------------------------------------------------------------------------
// Candles and the automatic bin width

export const CANDLE_INTERVALS_MS = { "1m": 60_000, "5m": 300_000, "15m": 900_000, "1H": 3_600_000, "4H": 14_400_000, "1D": 86_400_000 } as const;

/** A candle is the UTC window aligned to its interval. */
export function candleStart(ts: number, intervalMs: number): number {
  return Math.floor(ts / intervalMs) * intervalMs;
}

const AMPLITUDE_CANDLES = 20;
const TARGET_LEVELS = 30;

/**
 * Bin width in ticks for a session: max(1, ceil(median amplitude in ticks / 30)) over the last 20 closed candles. The
 * median is the lower middle value of the sorted amplitudes (our definition: it stays an integer). Computed at the
 * start of a UTC session and held for it, so footprints of one session are comparable.
 */
export function autoBinTicks(candles: readonly { readonly high: string; readonly low: string }[], tickSz: string): number {
  const tick = parseDec(tickSz);
  if (tick === null || tick.int <= 0n) throw new RangeError("tickSz must be a positive decimal");
  const amplitudes: number[] = [];
  for (const candle of candles.slice(-AMPLITUDE_CANDLES)) {
    const high = parseDec(candle.high);
    const low = parseDec(candle.low);
    if (high === null || low === null || cmpDec(high, low) < 0) continue;
    const ticks = toSafe(floorDivDec(subDec(high, low), tick));
    if (ticks !== null) amplitudes.push(ticks);
  }
  if (amplitudes.length === 0) return 1;
  amplitudes.sort((a, b) => a - b);
  const median = amplitudes[Math.floor((amplitudes.length - 1) / 2)]!;
  return Math.max(1, Math.ceil(median / TARGET_LEVELS));
}
