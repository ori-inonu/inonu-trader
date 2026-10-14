/**
 * The measured pressure of the flow for the rows the person can see (RAS-3). One free read of the exchange's public trades per
 * row (the latest five hundred, with the aggressor side of each), spaced to respect the public limit, and the pressure computed from
 * them by `pressureOf`. Nothing is estimated: a row with no trade in the last minute is "no measurement" (null), a failing row
 * says why and does not stop the others, and a malformed trade is dropped and counted.
 *
 * The browser talks to the exchange directly, exactly as the desk's own feeds do; no key is involved and nothing is sent.
 */
import { pressureOf, type Pressure, type TradeLike } from "./model";

export const TRADES_URL = "https://www.okx.com/api/v5/market/trades";
/** The most the exchange gives in one read of this route; a busy pair fills it in well under a minute. */
export const TRADES_LIMIT = 500;
/** The windowed rows only: at most this many reads per round, so a round fits in a few seconds. */
export const MAX_ROWS_PER_READ = 30;
const INSTRUMENT = /^[A-Z0-9]{1,20}-USDT(-SWAP)?$/;

export interface FetchResponseLike {
  readonly ok: boolean;
  readonly status: number;
  text(): Promise<string>;
}
export type FetchLike = (url: string, init?: { readonly signal?: AbortSignal }) => Promise<FetchResponseLike>;

export type PressureRead =
  | { readonly ok: true; readonly pressure: Pressure | null; readonly atMs: number; readonly rejected: number }
  | { readonly ok: false; readonly reason: "alvo_invalido" | "sem_conexao" | "okx_recusou" | "resposta_invalida" };

export interface FlowReaderOptions {
  readonly fetch?: FetchLike;
  readonly now?: () => number;
  readonly wait?: (ms: number) => Promise<void>;
  /** Space between two reads; the public limit for this route is twenty per two seconds. */
  readonly minIntervalMs?: number;
}

/** The trades of an OKX answer as the pressure needs them; a row that is not exactly a trade is dropped and counted. */
export function parseTrades(data: unknown): { trades: TradeLike[]; rejected: number } {
  if (!Array.isArray(data)) return { trades: [], rejected: 0 };
  const trades: TradeLike[] = [];
  let rejected = 0;
  for (const row of data) {
    if (typeof row !== "object" || row === null) {
      rejected += 1;
      continue;
    }
    const r = row as Record<string, unknown>;
    const sz = typeof r.sz === "string" ? Number(r.sz) : Number.NaN;
    const ts = typeof r.ts === "string" ? Number(r.ts) : Number.NaN;
    if (!Number.isFinite(sz) || sz <= 0 || !Number.isFinite(ts) || (r.side !== "buy" && r.side !== "sell")) {
      rejected += 1;
      continue;
    }
    trades.push({ ts, sz, side: r.side });
  }
  return { trades, rejected };
}

export function createFlowReader(options: FlowReaderOptions = {}) {
  const doFetch: FetchLike = options.fetch ?? ((url, init) => fetch(url, init) as unknown as Promise<FetchResponseLike>);
  const now = options.now ?? Date.now;
  const wait = options.wait ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const spacing = options.minIntervalMs ?? 150;

  async function readOne(instId: string, signal?: AbortSignal): Promise<PressureRead> {
    let text: string;
    let status: number;
    try {
      const res = await doFetch(`${TRADES_URL}?instId=${instId}&limit=${TRADES_LIMIT}`, signal ? { signal } : {});
      status = res.status;
      text = await res.text();
    } catch {
      return { ok: false, reason: "sem_conexao" };
    }
    if (status >= 400) return { ok: false, reason: "okx_recusou" };
    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      return { ok: false, reason: "resposta_invalida" };
    }
    if (typeof body !== "object" || body === null) return { ok: false, reason: "resposta_invalida" };
    const answer = body as { code?: unknown; data?: unknown };
    if (answer.code !== "0") return { ok: false, reason: "okx_recusou" };
    const { trades, rejected } = parseTrades(answer.data);
    const at = now();
    return { ok: true, pressure: pressureOf(trades, at), atMs: at, rejected };
  }

  return {
    /** One read per row, in order, spaced; stops at once when aborted and returns what it had. */
    async pressure(ids: readonly string[], signal?: AbortSignal): Promise<Map<string, PressureRead>> {
      const out = new Map<string, PressureRead>();
      let reads = 0;
      for (const id of ids) {
        if (signal?.aborted) break;
        if (!INSTRUMENT.test(id)) {
          out.set(id, { ok: false, reason: "alvo_invalido" });
          continue;
        }
        if (reads >= MAX_ROWS_PER_READ) break;
        if (reads > 0 && spacing > 0) await wait(spacing);
        if (signal?.aborted) break;
        reads += 1;
        out.set(id, await readOne(id, signal));
      }
      return out;
    },
  };
}

export type FlowReader = ReturnType<typeof createFlowReader>;
