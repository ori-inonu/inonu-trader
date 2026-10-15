/**
 * What the flow engine learned, kept on this machine (FLX-12). The adaptive thresholds need N closed minutes of the instrument's
 * own flow; without this, every restart of the app starts from zero minutes and the factors of the chart stay off for the
 * first fifty. The memory is REAL data of the previous real run (footprints per minute and the sizes of the latest trades), it
 * is never invented, the collector reports how much of its history came from here, and it expires after a few hours because a
 * market that has changed is not the one the thresholds describe.
 *
 * One small JSON file per instrument, written atomically once a minute. Validation on the way back is strict: anything that is
 * not exactly the documented shape is no memory at all. A folder that cannot be written never breaks the engine.
 */
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ThresholdCandle } from "../intel/thresholds";

export const FLOW_MEMORY_TTL_MS = 6 * 3_600_000;
const FUTURE_SKEW_MS = 5 * 60_000;
const MAX_HISTORY = 120;
const MAX_LEVELS = 2_000;
const MAX_TRADE_UNITS = 2_000;
const MAX_BIN_TICKS = 1_000_000;
const NAME = /^[A-Z0-9-]{3,60}$/;

export interface PersistedFlow {
  readonly binTicks: number;
  readonly history: readonly ThresholdCandle[];
  readonly tradeUnits: readonly number[];
}

export interface RestoredFlow extends PersistedFlow {
  readonly savedAtMs: number;
}

export interface FlowMemory {
  read(instId: string): RestoredFlow | null;
  write(instId: string, state: PersistedFlow): void;
}

const isRec = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const nonNeg = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v >= 0;
/** Volumes are whole numbers of units (the thresholds do exact integer arithmetic on them): a fraction or a huge float is a damaged file. */
const wholeUnits = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v) && v >= 0;
const wholeTicks = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v >= 1 && v <= MAX_BIN_TICKS;

function parseCandle(v: unknown): ThresholdCandle | null {
  if (!isRec(v) || !wholeTicks(v.binTicks) || !Array.isArray(v.levels) || v.levels.length > MAX_LEVELS) return null;
  const levels: { c: number; v: number }[] = [];
  for (const level of v.levels) {
    if (!isRec(level) || !wholeUnits(level.c) || !wholeUnits(level.v)) return null;
    levels.push({ c: level.c, v: level.v });
  }
  if (v.closedAtMs !== undefined && !nonNeg(v.closedAtMs)) return null;
  return { binTicks: v.binTicks, levels, ...(v.closedAtMs === undefined ? {} : { closedAtMs: v.closedAtMs }) };
}

export function createFlowMemory(options: { readonly dir: string; readonly now: () => number; readonly ttlMs?: number }): FlowMemory {
  const ttl = options.ttlMs ?? FLOW_MEMORY_TTL_MS;
  const fileOf = (instId: string): string | null => (NAME.test(instId) ? join(options.dir, `flow-${instId}.json`) : null);

  return {
    read(instId) {
      const file = fileOf(instId);
      if (file === null) return null;
      try {
        const raw: unknown = JSON.parse(readFileSync(file, "utf8"));
        if (!isRec(raw) || raw.v !== 1 || raw.instId !== instId || typeof raw.savedAtMs !== "number" || !Number.isFinite(raw.savedAtMs)) return null;
        const age = options.now() - raw.savedAtMs;
        if (age > ttl || age < -FUTURE_SKEW_MS) return null;
        if (!wholeTicks(raw.binTicks) || !Array.isArray(raw.history) || raw.history.length > MAX_HISTORY) return null;
        if (!Array.isArray(raw.tradeUnits) || raw.tradeUnits.length > MAX_TRADE_UNITS) return null;
        const history: ThresholdCandle[] = [];
        const nowMs = options.now();
        for (const item of raw.history) {
          const candle = parseCandle(item);
          if (candle === null) return null;
          if (candle.closedAtMs !== undefined) {
            if (candle.closedAtMs - nowMs > FUTURE_SKEW_MS) return null; // a minute that has not happened yet: not trustworthy
            if (nowMs - candle.closedAtMs > ttl) continue; // this minute is too old by itself, however recently the file was saved
          }
          history.push(candle);
        }
        const tradeUnits: number[] = [];
        for (const units of raw.tradeUnits) {
          if (!wholeUnits(units)) return null;
          tradeUnits.push(units);
        }
        return { binTicks: raw.binTicks, history, tradeUnits, savedAtMs: raw.savedAtMs };
      } catch {
        return null; // missing, unreadable or not JSON: no memory
      }
    },

    write(instId, state) {
      const file = fileOf(instId);
      if (file === null) return;
      const body = {
        v: 1,
        instId,
        savedAtMs: options.now(),
        binTicks: state.binTicks,
        history: state.history.map((candle) => ({ binTicks: candle.binTicks, levels: candle.levels.map((level) => ({ c: level.c, v: level.v })), ...(candle.closedAtMs === undefined ? {} : { closedAtMs: candle.closedAtMs }) })),
        tradeUnits: [...state.tradeUnits],
      };
      try {
        mkdirSync(options.dir, { recursive: true });
        const temp = `${file}.tmp`;
        writeFileSync(temp, JSON.stringify(body));
        renameSync(temp, file);
      } catch {
        // a folder that cannot be written changes nothing: the engine goes on from memory
      }
    },
  };
}
