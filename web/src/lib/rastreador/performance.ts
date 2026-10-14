/**
 * The change of the last hour and of the last four hours of a row (RAS-3, Desempenho view), from the exchange's own one minute
 * candles: the last close against the close sixty (or two hundred and forty) candles before it. A row with fewer candles than a
 * window needs has no such change; a shorter window is never passed off as the full one. The reads go through the desk's own
 * rate limited REST client, one per visible row.
 */
import type { OkxRest } from "../desk/okx-rest";
import type { DeskCandle } from "../desk/types";

export const MAX_ROWS_PER_PERFORMANCE_READ = 30;
const CANDLES = 300;
const HOUR = 60;
const FOUR_HOURS = 240;
const INSTRUMENT = /^[A-Z0-9]{1,20}-USDT(-SWAP)?$/;

export interface Performance {
  readonly var1h: number | null;
  readonly var4h: number | null;
}

function changeOver(candles: readonly Pick<DeskCandle, "close">[], back: number): number | null {
  if (candles.length < back + 1) return null;
  const last = candles[candles.length - 1]!.close;
  const base = candles[candles.length - 1 - back]!.close;
  if (!Number.isFinite(last) || !Number.isFinite(base) || base <= 0) return null;
  return ((last - base) / base) * 100;
}

/** Candles oldest first, as the REST client returns them. */
export function performanceOf(candles: readonly Pick<DeskCandle, "close">[]): Performance {
  return { var1h: changeOver(candles, HOUR), var4h: changeOver(candles, FOUR_HOURS) };
}

export type PerformanceRead =
  | ({ readonly ok: true; readonly atMs: number } & Performance)
  | { readonly ok: false; readonly reason: "alvo_invalido" | "falhou" };

export function createPerformanceReader(options: { readonly rest: OkxRest; readonly now?: () => number }) {
  const now = options.now ?? Date.now;
  return {
    /** One read per row, in order; stops at once when aborted and returns what it had. */
    async read(ids: readonly string[], signal?: AbortSignal): Promise<Map<string, PerformanceRead>> {
      const out = new Map<string, PerformanceRead>();
      let reads = 0;
      for (const id of ids) {
        if (signal?.aborted) break;
        if (!INSTRUMENT.test(id)) {
          out.set(id, { ok: false, reason: "alvo_invalido" });
          continue;
        }
        if (reads >= MAX_ROWS_PER_PERFORMANCE_READ) break;
        reads += 1;
        const result = await options.rest.candles(id, "1m", { limit: CANDLES, ...(signal ? { signal } : {}) });
        out.set(id, result.ok ? { ok: true, atMs: now(), ...performanceOf(result.value) } : { ok: false, reason: "falhou" });
      }
      return out;
    },
  };
}

export type PerformanceReader = ReturnType<typeof createPerformanceReader>;
