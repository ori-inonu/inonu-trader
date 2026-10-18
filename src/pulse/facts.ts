/**
 * Facts with identity, and the events made from them (ADENDO-E, E1 and E3: the producer side; the contract of evidence and consumption is the Codex's, in `src/decision-review`).
 *
 * A fact says exactly what it is: the venue, the instrument, the kind of market, the source, the units, the exchange time of the latest print it used (not a local clock), the local time that print arrived, the generation of the
 * connection (it grows with every reconnect, so a gap is visible), the quality of the series it came from, and a hash of all of it. A ticker of a CEX is NOT a token: a fact has no chain and no address, and nothing here can
 * be mistaken for a Solana mint. Reading a fact again does not rejuvenate it: the origin time stays the one of the print, so the same print gives the same hash.
 *
 * An event is made when a fact is material: a move over five minutes of at least K times what the market's own volatility makes normal for five minutes, K being a parameter of the evaluation. It is told once per direction
 * inside a cooldown. Pure: no clock, no network.
 */
import { createHash } from "node:crypto";
import { instTypeOf } from "../inonu/okx-public";
import { MINUTE, type MinuteBar, type Regime } from "./regime";

export interface PulseFact {
  readonly kind: "market_regime";
  readonly venue: "okx";
  readonly marketType: "SPOT" | "SWAP" | "FUTURES";
  readonly instrument: string;
  readonly source: "okx-public-trades";
  readonly units: { readonly returns: "percent"; readonly flow: "ratio_minus1_to_1"; readonly volatility: "percent_per_minute" };
  /** End, in exchange time, of the last CLOSED minute the values were computed from, on the minute grid: the window is final up to this instant. Part of the hash (schema 2 of the consumer). */
  readonly windowEndMs: number;
  /** Exchange time of the latest print of that last contributing minute, inside [windowEndMs - 60000, windowEndMs): a print of a minute still open did not contribute. */
  readonly originAtMs: number;
  /** Local time at which that print arrived. */
  readonly observedAtLocalMs: number;
  /** Grows with every reconnect of the feed. */
  readonly generation: number;
  readonly quality: { readonly bars: number; readonly gaps: number };
  readonly values: Regime;
  /** SHA-256 of everything above, as canonical JSON. */
  readonly hash: string;
}

const UNITS = Object.freeze({ returns: "percent", flow: "ratio_minus1_to_1", volatility: "percent_per_minute" } as const);
const natural = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v) && v >= 0;
const isObject = (v: unknown): v is Readonly<Record<string, unknown>> => v !== null && typeof v === "object" && !Array.isArray(v);
const canonical = (v: unknown): string => JSON.stringify(v, (_key, value) => (isObject(value) ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) : value));

/** A fact, or null when what it would say is not a fact (an id that is not an instrument, times or counts that are not, nothing measured). */
export function factOf(input: {
  readonly instrument: string;
  /** End, in exchange time, of the last CLOSED minute the values were computed from: on the minute grid, and the origin print lies in [windowEndMs - 60000, windowEndMs). It is part of the hashed fact. */
  readonly windowEndMs: number;
  readonly originAtMs: number;
  readonly observedAtLocalMs: number;
  readonly generation: number;
  readonly bars: number;
  readonly gaps: number;
  readonly regime: Regime;
}): PulseFact | null {
  const marketType = typeof input.instrument === "string" ? instTypeOf(input.instrument) : null;
  if (marketType === null) return null;
  if (!natural(input.originAtMs) || !natural(input.observedAtLocalMs) || !natural(input.generation) || !natural(input.bars) || !natural(input.gaps)) return null;
  // the window ends on a minute boundary and the origin print belongs to the minute that ends there: it lies in [end - one minute, end)
  if (!natural(input.windowEndMs) || input.windowEndMs % MINUTE !== 0 || input.originAtMs < input.windowEndMs - MINUTE || input.originAtMs >= input.windowEndMs) return null;
  const { ret1m, ret5m, flow5m, rv15m } = input.regime;
  // a value is unknown (null) or a finite number in its unit; NaN and infinities are refused, because they would hash like null
  const finite = (v: number | null): boolean => v === null || (typeof v === "number" && Number.isFinite(v));
  if (![ret1m, ret5m, flow5m, rv15m].every(finite)) return null;
  if ((flow5m !== null && (flow5m < -1 || flow5m > 1)) || (rv15m !== null && rv15m < 0)) return null;
  if (ret1m === null && ret5m === null && flow5m === null && rv15m === null) return null;
  const body = {
    kind: "market_regime" as const,
    venue: "okx" as const,
    marketType,
    instrument: input.instrument,
    source: "okx-public-trades" as const,
    units: UNITS,
    windowEndMs: input.windowEndMs,
    originAtMs: input.originAtMs,
    observedAtLocalMs: input.observedAtLocalMs,
    generation: input.generation,
    quality: { bars: input.bars, gaps: input.gaps },
    values: { ret1m, ret5m, flow5m, rv15m },
  };
  return { ...body, hash: createHash("sha256").update(canonical(body)).digest("hex") };
}

/** How many of the last `window` minutes (ending at the last bar) have no bar. Nothing to count without bars. */
export function gapsInLast(bars: readonly MinuteBar[], window: number): number {
  if (bars.length === 0) return 0;
  const starts = new Set(bars.map((b) => b.start));
  const last = Math.max(...starts);
  let missing = 0;
  for (let k = 0; k < window; k++) if (!starts.has(last - k * MINUTE)) missing += 1;
  return missing;
}

export interface PulseEvent {
  readonly kind: "move";
  readonly instrument: string;
  readonly direction: "up" | "down";
  /** How many five-minute volatilities the move is. */
  readonly sigmas: number;
  /** The hash of the fact the event was made from: the reference that has to reach the Brief to count as consumed. */
  readonly factHash: string;
  readonly originAtMs: number;
}

export interface Materiality {
  /** The events the facts make, told once per direction inside the cooldown. */
  observe(facts: readonly PulseFact[]): PulseEvent[];
}

export function createMateriality(options: { readonly sigmas?: number; readonly cooldownMs?: number } = {}): Materiality {
  const threshold = options.sigmas ?? 3;
  const cooldownMs = options.cooldownMs ?? 5 * MINUTE;
  const last = new Map<string, number>();
  return {
    observe(facts) {
      const events: PulseEvent[] = [];
      for (const fact of facts) {
        const { ret5m, rv15m } = fact.values;
        if (ret5m === null || rv15m === null || !(rv15m > 0) || ret5m === 0) continue;
        // the volatility of a minute grows with the square root of the minutes: five of them
        const sigmas = Math.abs(ret5m) / (rv15m * Math.sqrt(5));
        if (!(sigmas >= threshold)) continue;
        const direction = ret5m > 0 ? "up" : "down";
        const key = `${fact.instrument}:${direction}`;
        const before = last.get(key);
        if (before !== undefined && fact.originAtMs - before < cooldownMs) continue;
        last.set(key, fact.originAtMs);
        events.push({ kind: "move", instrument: fact.instrument, direction, sigmas: Math.round(sigmas * 100) / 100, factHash: fact.hash, originAtMs: fact.originAtMs });
      }
      return events;
    },
  };
}
