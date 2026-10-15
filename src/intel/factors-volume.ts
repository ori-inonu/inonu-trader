/**
 * Fator Volume, Ordem original and Alerta de quantidade (T5.9, FLX-6). Operational definitions of our own, see
 * flow-engine.md 2.5. Volumes are whole units of the instrument (footprint.ts); a perpetual is converted from contracts
 * to base currency before anything is compared.
 */
import { createTradeReader, type InstrumentMeta } from "./footprint";
import type { LevelRow } from "./factors";
import type { Trade } from "./ingest";

export interface VolumeMark {
  readonly level: number;
  /** The aggressor that dominated the level: c, v, or n when equal. */
  readonly dominante: "c" | "v" | "n";
  readonly total: number;
}

/** The K busiest levels (0 to 3) by total volume; ties go to the lower level. Listed in rank order. */
export function volumeFactor(rows: readonly LevelRow[], k: number): VolumeMark[] {
  if (!Number.isSafeInteger(k) || k < 0 || k > 3) throw new RangeError("K is a whole number from 0 to 3");
  return rows
    .map((row) => ({ level: row.level, dominante: row.c > row.v ? ("c" as const) : row.v > row.c ? ("v" as const) : ("n" as const), total: row.c + row.v }))
    .sort((a, b) => b.total - a.total || a.level - b.level)
    .slice(0, k);
}

export interface OriginalOrders {
  readonly level: number;
  /** How many single trades reached the threshold at this level. */
  readonly quantidade: number;
  readonly maior: number;
}

/** Single trades of at least `threshold` units, counted at their level. Rejected trades are ignored. */
export function originalOrders(meta: InstrumentMeta, binTicks: number, trades: readonly Trade[], threshold: number): OriginalOrders[] {
  if (!Number.isSafeInteger(threshold) || threshold < 1) throw new RangeError("T must be a positive whole number");
  const read = createTradeReader(meta, binTicks);
  const byLevel = new Map<number, { quantidade: number; maior: number }>();
  for (const trade of trades) {
    const parsed = read(trade);
    if (parsed === null || parsed.units < threshold) continue;
    const entry = byLevel.get(parsed.level) ?? { quantidade: 0, maior: 0 };
    entry.quantidade += 1;
    entry.maior = Math.max(entry.maior, parsed.units);
    byLevel.set(parsed.level, entry);
  }
  return [...byLevel].sort((a, b) => a[0] - b[0]).map(([level, entry]) => ({ level, ...entry }));
}

export interface QuantityAlert {
  readonly level: number;
  readonly c: boolean;
  readonly v: boolean;
}

/** Levels where ONE side's accumulated aggression reached `quantity` (per side, never the sum). */
export function quantityAlerts(rows: readonly LevelRow[], quantity: number): QuantityAlert[] {
  if (!Number.isSafeInteger(quantity) || quantity < 1) throw new RangeError("Q must be a positive whole number");
  return [...rows]
    .sort((a, b) => a.level - b.level)
    .filter((row) => row.c >= quantity || row.v >= quantity)
    .map((row) => ({ level: row.level, c: row.c >= quantity, v: row.v >= quantity }));
}
