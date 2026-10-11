/**
 * Typed client of the keyless OKX public v5 REST API (https://www.okx.com/api/v5), built for the browser.
 *
 * - Injectable fetch, clock and timers. Only GET, only `/api/v5/market/*` and `/api/v5/public/*`, no headers.
 * - Honest results: every call returns a `RestResult`, an error carries a code and a Portuguese message, and a value is
 *   never invented. Malformed payloads are rejected (a candle series with one bad row is rejected whole; list endpoints
 *   such as tickers drop unparsable rows and report how many).
 * - Rate limits: the strictest public limit is 10 requests per 2 s, so calls are spaced by `minIntervalMs` (300 ms by
 *   default, about 3 per second) through a queue, and an HTTP 429 or OKX code 50011 opens a cooldown that delays every
 *   later call. Successful instrument lookups are cached for the life of the client.
 * - `status()` reports the REST feed (`okx-public-rest`) from the outcome of the calls actually made.
 */

import {
  instTypeOf,
  isRecord,
  parseCandleRow,
  parseFundingRow,
  parseInstrumentRow,
  parseMarkPriceRow,
  parseOpenInterestRow,
  parseTicker,
  type FundingUpdate,
  type MarkPriceUpdate,
  type OpenInterestUpdate,
} from "./okx-parse";
import { sleepWith, systemNow, systemTimers, type Timers } from "./runtime";
import {
  DESK_FRESHNESS_MS,
  type DeskBar,
  type DeskCandle,
  type DeskFeedStatus,
  type DeskInstrument,
  type DeskInstType,
  type DeskTicker,
} from "./types";

export const OKX_REST_BASE = "https://www.okx.com";
export const CANDLES_MAX_LIMIT = 300;
export const HISTORY_CANDLES_MAX_LIMIT = 100;

export type RestErrorCode =
  | "network"
  | "timeout"
  | "aborted"
  | "http"
  | "rate_limited"
  | "okx_error"
  | "not_found"
  | "not_live"
  | "schema";

export interface RestError {
  readonly code: RestErrorCode;
  /** Portuguese, ready to show. */
  readonly message: string;
  readonly httpStatus?: number;
  readonly okxCode?: string;
}

export type RestResult<T> =
  | { readonly ok: true; readonly value: T; readonly atMs: number; readonly rejected: number }
  | { readonly ok: false; readonly error: RestError };

export interface FetchResponseLike {
  readonly ok: boolean;
  readonly status: number;
  text(): Promise<string>;
}

export type FetchLike = (url: string, init?: { readonly signal?: AbortSignal }) => Promise<FetchResponseLike>;

export interface OkxRestOptions {
  readonly fetch?: FetchLike;
  readonly now?: () => number;
  readonly timers?: Timers;
  readonly baseUrl?: string;
  /** Minimum spacing between two requests. */
  readonly minIntervalMs?: number;
  readonly timeoutMs?: number;
  /** Extra wait imposed on every call after a rate limit answer. */
  readonly rateLimitCooldownMs?: number;
  /** Called when a call changes the state of the REST feed (first success, failure, recovery). */
  readonly onStatusChange?: (status: DeskFeedStatus) => void;
}

export interface CandleQuery {
  readonly limit?: number;
  /** Return bars older than this bar opening time (ms). */
  readonly after?: number;
  readonly signal?: AbortSignal;
}

export interface OkxRest {
  instruments(instType: DeskInstType, signal?: AbortSignal): Promise<RestResult<readonly DeskInstrument[]>>;
  /** One live instrument, cached after the first success. */
  instrument(instId: string, signal?: AbortSignal): Promise<RestResult<DeskInstrument>>;
  /** Latest bars (up to 300), oldest first. */
  candles(instId: string, bar: DeskBar, query?: CandleQuery): Promise<RestResult<readonly DeskCandle[]>>;
  /** Older bars (up to 100 per call) through `after`, oldest first. */
  historyCandles(instId: string, bar: DeskBar, query?: CandleQuery): Promise<RestResult<readonly DeskCandle[]>>;
  /** `count` bars, oldest first: one `candles` call up to 300, then `history-candles` pages for anything older. */
  candleHistory(instId: string, bar: DeskBar, count: number, signal?: AbortSignal): Promise<RestResult<readonly DeskCandle[]>>;
  tickers(instType: DeskInstType, signal?: AbortSignal): Promise<RestResult<readonly DeskTicker[]>>;
  ticker(instId: string, signal?: AbortSignal): Promise<RestResult<DeskTicker>>;
  fundingRate(instId: string, signal?: AbortSignal): Promise<RestResult<FundingUpdate>>;
  openInterest(instId: string, signal?: AbortSignal): Promise<RestResult<OpenInterestUpdate>>;
  markPrice(instId: string, signal?: AbortSignal): Promise<RestResult<MarkPriceUpdate>>;
  status(nowMs?: number): DeskFeedStatus;
}

function fail(code: RestErrorCode, message: string, extra: Partial<RestError> = {}): { ok: false; error: RestError } {
  return { ok: false, error: { code, message, ...extra } };
}

export function createOkxRest(options: OkxRestOptions = {}): OkxRest {
  const fetchImpl: FetchLike = options.fetch ?? ((url, init) => globalThis.fetch(url, init));
  const now = options.now ?? systemNow;
  const timers = options.timers ?? systemTimers;
  const baseUrl = (options.baseUrl ?? OKX_REST_BASE).replace(/\/+$/, "");
  const minIntervalMs = options.minIntervalMs ?? 300;
  const timeoutMs = options.timeoutMs ?? 8_000;
  const cooldownMs = options.rateLimitCooldownMs ?? 2_000;

  let nextSlotAtMs = 0;
  let cooldownUntilMs = 0;
  const instrumentCache = new Map<string, Promise<RestResult<DeskInstrument>>>();

  let everCalled = false;
  let lastOkAtMs: number | null = null;
  let lastError: RestError | null = null;
  let recoveries = 0;

  let lastEmitted = "";

  function recordOutcome(error: RestError | null): void {
    everCalled = true;
    if (error === null) {
      if (lastError !== null) recoveries += 1;
      lastError = null;
      lastOkAtMs = now();
    } else if (error.code !== "aborted") {
      lastError = error;
    }
    if (options.onStatusChange !== undefined) {
      const current = status();
      const key = `${current.state}|${current.reconnects}|${current.detail ?? ""}`;
      if (key !== lastEmitted) {
        lastEmitted = key;
        options.onStatusChange(current);
      }
    }
  }

  async function takeSlot(): Promise<void> {
    const t = now();
    const startAt = Math.max(t, nextSlotAtMs);
    nextSlotAtMs = startAt + minIntervalMs;
    if (startAt > t) await sleepWith(timers, startAt - t);
    const cooldown = cooldownUntilMs - now();
    if (cooldown > 0) {
      nextSlotAtMs = Math.max(nextSlotAtMs, cooldownUntilMs + minIntervalMs);
      await sleepWith(timers, cooldown);
    }
  }

  /** Performs one GET and returns the validated `data` array of the OKX envelope. */
  async function getData(
    path: string,
    params: Readonly<Record<string, string>>,
    signal?: AbortSignal,
  ): Promise<RestResult<readonly unknown[]>> {
    if (signal?.aborted) return fail("aborted", "Consulta cancelada.");
    await takeSlot();
    if (signal?.aborted) return fail("aborted", "Consulta cancelada.");

    const query = new URLSearchParams(params).toString();
    const url = `${baseUrl}/api/v5/${path}${query ? `?${query}` : ""}`;
    const controller = new AbortController();
    const onAbort = (): void => controller.abort();
    signal?.addEventListener("abort", onAbort, { once: true });
    let timedOut = false;
    const timer = timers.setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);

    let status = 0;
    let ok = false;
    let body = "";
    try {
      const response = await fetchImpl(url, { signal: controller.signal });
      status = response.status;
      ok = response.ok;
      body = await response.text();
    } catch {
      const error: RestError = timedOut
        ? { code: "timeout", message: "A OKX não respondeu a tempo." }
        : signal?.aborted
          ? { code: "aborted", message: "Consulta cancelada." }
          : { code: "network", message: "Sem conexão com a API REST da OKX." };
      recordOutcome(error);
      return { ok: false, error };
    } finally {
      timers.clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
    }

    if (status === 429) {
      cooldownUntilMs = now() + cooldownMs;
      const error: RestError = { code: "rate_limited", message: "A OKX limitou a frequência das consultas (HTTP 429).", httpStatus: 429 };
      recordOutcome(error);
      return { ok: false, error };
    }
    if (!ok) {
      const error: RestError = { code: "http", message: `A API REST da OKX respondeu HTTP ${status}.`, httpStatus: status };
      recordOutcome(error);
      return { ok: false, error };
    }
    let json: unknown;
    try {
      json = JSON.parse(body);
    } catch {
      const error: RestError = { code: "schema", message: "A resposta da OKX não é um JSON válido." };
      recordOutcome(error);
      return { ok: false, error };
    }
    if (!isRecord(json) || typeof json.code !== "string" || !Array.isArray(json.data)) {
      const error: RestError = { code: "schema", message: "A resposta da OKX não tem o envelope esperado." };
      recordOutcome(error);
      return { ok: false, error };
    }
    if (json.code !== "0") {
      // The service answered, so the transport is healthy even when the answer is a refusal.
      if (json.code === "50011" || json.code === "50061") {
        cooldownUntilMs = now() + cooldownMs;
        const error: RestError = { code: "rate_limited", message: "A OKX limitou a frequência das consultas.", okxCode: json.code };
        recordOutcome(error);
        return { ok: false, error };
      }
      recordOutcome(null);
      if (json.code === "51001") {
        return fail("not_found", "Instrumento inexistente na OKX.", { okxCode: json.code });
      }
      return fail("okx_error", `A OKX recusou a consulta (código ${json.code}).`, { okxCode: json.code });
    }
    recordOutcome(null);
    return { ok: true, value: json.data, atMs: now(), rejected: 0 };
  }

  function schemaFail(message: string): { ok: false; error: RestError } {
    const error: RestError = { code: "schema", message };
    recordOutcome(error);
    return { ok: false, error };
  }

  async function instruments(instType: DeskInstType, signal?: AbortSignal): Promise<RestResult<readonly DeskInstrument[]>> {
    const raw = await getData("public/instruments", { instType }, signal);
    if (!raw.ok) return raw;
    const out: DeskInstrument[] = [];
    let rejected = 0;
    for (const row of raw.value) {
      const parsed = parseInstrumentRow(row);
      if (parsed === null || parsed.instrument.instType !== instType) rejected += 1;
      else out.push(parsed.instrument);
    }
    return { ok: true, value: out, atMs: raw.atMs, rejected };
  }

  function instrument(instId: string, signal?: AbortSignal): Promise<RestResult<DeskInstrument>> {
    const cached = instrumentCache.get(instId);
    if (cached !== undefined) return cached;
    const pending = (async (): Promise<RestResult<DeskInstrument>> => {
      const raw = await getData("public/instruments", { instType: instTypeOf(instId), instId }, signal);
      if (!raw.ok) return raw;
      const parsed = raw.value.length === 1 ? parseInstrumentRow(raw.value[0]) : null;
      if (parsed === null || parsed.instrument.instId !== instId) return schemaFail("A OKX devolveu um instrumento fora do formato esperado.");
      if (parsed.state !== "live") return fail("not_live", `O instrumento ${instId} não está negociando (estado ${parsed.state}).`);
      return { ok: true, value: parsed.instrument, atMs: raw.atMs, rejected: 0 };
    })();
    instrumentCache.set(instId, pending);
    void pending.then((result) => {
      if (!result.ok) instrumentCache.delete(instId);
    });
    return pending;
  }

  async function candleRequest(
    path: "market/candles" | "market/history-candles",
    maxLimit: number,
    instId: string,
    bar: DeskBar,
    query: CandleQuery,
  ): Promise<RestResult<readonly DeskCandle[]>> {
    const limit = query.limit ?? maxLimit;
    if (!Number.isInteger(limit) || limit < 1 || limit > maxLimit) {
      return fail("schema", `O limite de velas deve ser um inteiro entre 1 e ${maxLimit}.`);
    }
    const params: Record<string, string> = { instId, bar, limit: String(limit) };
    if (query.after !== undefined) params.after = String(query.after);
    const raw = await getData(path, params, query.signal);
    if (!raw.ok) return raw;
    if (raw.value.length > limit) return schemaFail("A OKX devolveu mais velas do que o pedido.");
    const instType = instTypeOf(instId);
    const byTs = new Map<number, DeskCandle>();
    for (const row of raw.value) {
      const candle = parseCandleRow(row, instType);
      if (candle === null) return schemaFail("A OKX devolveu uma vela fora do formato esperado.");
      byTs.set(candle.tsMs, candle);
    }
    const ordered = [...byTs.values()].sort((a, b) => a.tsMs - b.tsMs);
    return { ok: true, value: ordered, atMs: raw.atMs, rejected: 0 };
  }

  const candles = (instId: string, bar: DeskBar, query: CandleQuery = {}) =>
    candleRequest("market/candles", CANDLES_MAX_LIMIT, instId, bar, query);

  const historyCandles = (instId: string, bar: DeskBar, query: CandleQuery = {}) =>
    candleRequest("market/history-candles", HISTORY_CANDLES_MAX_LIMIT, instId, bar, query);

  async function candleHistory(
    instId: string,
    bar: DeskBar,
    count: number,
    signal?: AbortSignal,
  ): Promise<RestResult<readonly DeskCandle[]>> {
    if (!Number.isInteger(count) || count < 1) return fail("schema", "A quantidade de velas deve ser um inteiro positivo.");
    const first = await candles(instId, bar, { limit: Math.min(count, CANDLES_MAX_LIMIT), ...(signal ? { signal } : {}) });
    if (!first.ok || first.value.length >= count || first.value.length < CANDLES_MAX_LIMIT) return first;
    let all: readonly DeskCandle[] = first.value;
    while (all.length < count) {
      const oldest = all[0];
      if (oldest === undefined) break;
      const page = await historyCandles(instId, bar, {
        limit: Math.min(HISTORY_CANDLES_MAX_LIMIT, count - all.length),
        after: oldest.tsMs,
        ...(signal ? { signal } : {}),
      });
      if (!page.ok) return page;
      if (page.value.length === 0) break;
      all = [...page.value, ...all];
    }
    return { ok: true, value: all, atMs: first.atMs, rejected: 0 };
  }

  async function tickers(instType: DeskInstType, signal?: AbortSignal): Promise<RestResult<readonly DeskTicker[]>> {
    const raw = await getData("market/tickers", { instType }, signal);
    if (!raw.ok) return raw;
    const out: DeskTicker[] = [];
    let rejected = 0;
    for (const row of raw.value) {
      const ticker = parseTicker(row);
      if (ticker === null) rejected += 1;
      else out.push(ticker);
    }
    return { ok: true, value: out, atMs: raw.atMs, rejected };
  }

  async function ticker(instId: string, signal?: AbortSignal): Promise<RestResult<DeskTicker>> {
    const raw = await getData("market/ticker", { instId }, signal);
    if (!raw.ok) return raw;
    const parsed = raw.value.length === 1 ? parseTicker(raw.value[0]) : null;
    if (parsed === null || parsed.instId !== instId) return schemaFail("A OKX devolveu um ticker fora do formato esperado.");
    return { ok: true, value: parsed, atMs: raw.atMs, rejected: 0 };
  }

  async function fundingRate(instId: string, signal?: AbortSignal): Promise<RestResult<FundingUpdate>> {
    const raw = await getData("public/funding-rate", { instId }, signal);
    if (!raw.ok) return raw;
    const parsed = raw.value.length === 1 ? parseFundingRow(raw.value[0]) : null;
    if (parsed === null || parsed.instId !== instId || parsed.fundingRate === null) {
      return schemaFail("A OKX devolveu um funding fora do formato esperado.");
    }
    return { ok: true, value: parsed, atMs: raw.atMs, rejected: 0 };
  }

  async function openInterest(instId: string, signal?: AbortSignal): Promise<RestResult<OpenInterestUpdate>> {
    const raw = await getData("public/open-interest", { instType: "SWAP", instId }, signal);
    if (!raw.ok) return raw;
    const parsed = raw.value.length === 1 ? parseOpenInterestRow(raw.value[0]) : null;
    if (parsed === null || parsed.instId !== instId || parsed.openInterest === null) {
      return schemaFail("A OKX devolveu um open interest fora do formato esperado.");
    }
    return { ok: true, value: parsed, atMs: raw.atMs, rejected: 0 };
  }

  async function markPrice(instId: string, signal?: AbortSignal): Promise<RestResult<MarkPriceUpdate>> {
    const raw = await getData("public/mark-price", { instType: "SWAP", instId }, signal);
    if (!raw.ok) return raw;
    const parsed = raw.value.length === 1 ? parseMarkPriceRow(raw.value[0]) : null;
    if (parsed === null || parsed.instId !== instId || parsed.markPx === null) {
      return schemaFail("A OKX devolveu um mark price fora do formato esperado.");
    }
    return { ok: true, value: parsed, atMs: raw.atMs, rejected: 0 };
  }

  /** The REST feed: `reconnects` counts recoveries after a failure. */
  function status(nowMs: number = now()): DeskFeedStatus {
    const freshnessMs = DESK_FRESHNESS_MS["okx-public-rest"];
    const base = { id: "okx-public-rest" as const, lastMessageAtMs: lastOkAtMs, freshnessMs, reconnects: recoveries };
    if (!everCalled) return { ...base, state: "idle", detail: "Nenhuma consulta REST feita ainda." };
    if (lastError !== null) return { ...base, state: "failed", detail: `Consulta REST falhou: ${lastError.message}` };
    if (lastOkAtMs === null) return { ...base, state: "connecting", detail: "Aguardando a primeira resposta REST." };
    const age = nowMs - lastOkAtMs;
    if (age > freshnessMs) {
      return { ...base, state: "stale", detail: `Sem consulta REST bem-sucedida há ${Math.round(age / 1000)} s.` };
    }
    return { ...base, state: "live", detail: null };
  }

  return {
    instruments,
    instrument,
    candles,
    historyCandles,
    candleHistory,
    tickers,
    ticker,
    fundingRate,
    openInterest,
    markPrice,
    status,
  };
}
