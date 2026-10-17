import { createHash } from "node:crypto";
import { ONLINE_LIMITS } from "./contracts.ts";
import type { OnlineObservation, OnlineOptions, OnlineSource } from "./contracts.ts";
import {
  createPublicOkxClient,
  createPublicOkxHttp,
  DEFAULT_PUBLIC_OKX_ORIGIN,
  toNumber,
} from "../../src/onchainos/public-okx.ts";
import { OnchainosError } from "../../src/onchainos/errors.ts";
import type { FetchInit, FetchResponseLike, ReadMeta } from "../../src/onchainos/http.ts";
import { readEpochMs } from "../../src/onchainos/values.ts";

const APP_ID = "inonu-trader";
const MARKET_INSTRUMENT = "SOL-USDT" as const;
const HEALTH_PATH = "/health";
const ANALYSIS_PATH = "/agent/analysis";
const LEDGER_PATH = "/agent/ledger?n=200";
const LEDGER_LIMIT = 200;
const OKX_TIME_PATH = "/api/v5/public/time";
const OKX_TICKER_PATH = "/api/v5/market/ticker";
const UTF8 = new TextDecoder("utf-8", { fatal: true });

class OnlineCollectionError extends Error {
  constructor(code: string) {
    super(code);
    this.name = "OnlineCollectionError";
  }
}

function fail(code: string): never {
  throw new OnlineCollectionError(code);
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);
const isEpochMs = (value: unknown): value is number =>
  Number.isSafeInteger(value) && typeof value === "number" && value >= 0 && value <= 4_102_444_800_000;
const isCount = (value: unknown): value is number =>
  Number.isSafeInteger(value) && typeof value === "number" && value >= 0;
const isShortString = (value: unknown, max = 256): value is string =>
  typeof value === "string" && value.length > 0 && value.length <= max;
const isStringOrNull = (value: unknown, max = 256): value is string | null =>
  value === null || isShortString(value, max);
const isNullableFinite = (value: unknown): value is number | null => value === null || isFiniteNumber(value);
const withinFutureSkew = (timestamp: number, referenceMs: number): boolean =>
  timestamp <= referenceMs + ONLINE_LIMITS.clockSkewMs;

function nowMs(code = "online_clock_invalid"): number {
  const value = Date.now();
  if (!isEpochMs(value)) fail(code);
  return value;
}

function validateRuntimeUrl(value: unknown, allowRootSlash: boolean): string | null {
  if (typeof value !== "string") return null;
  const pattern = allowRootSlash
    ? /^http:\/\/127\.0\.0\.1(?::([1-9]\d{0,4}))?\/?$/
    : /^http:\/\/127\.0\.0\.1(?::([1-9]\d{0,4}))?$/;
  const match = pattern.exec(value);
  if (match === null) return null;
  if (match[1] !== undefined && Number(match[1]) > 65_535) return null;
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "http:" || parsed.hostname !== "127.0.0.1" || parsed.username !== "" || parsed.password !== ""
      || parsed.search !== "" || parsed.hash !== "" || parsed.pathname !== "/") return null;
    if (!allowRootSlash && parsed.origin !== value) return null;
    return parsed.origin;
  } catch {
    return null;
  }
}

function runtimeOrigin(options: OnlineOptions): string {
  if (!isRecord(options)) fail("online_runtime_options_invalid");
  const baseOrigin = validateRuntimeUrl(options.runtimeBaseUrl, true);
  const origin = validateRuntimeUrl(options.runtimeOrigin, false);
  if (baseOrigin === null || origin === null || baseOrigin !== origin) fail("online_runtime_options_invalid");
  return origin;
}

function sourceDigest(input: {
  readonly id: string;
  readonly path: string;
  readonly requestedAtMs: number;
  readonly receivedAtMs: number;
  readonly asOfMs: number | null;
  readonly classification: OnlineSource["classification"];
  readonly transport: OnlineSource["transport"];
  readonly limitations: readonly string[];
  readonly sanitizedPayload: unknown;
}): string {
  const provenance = JSON.stringify({
    id: input.id,
    path: input.path,
    requestedAtMs: input.requestedAtMs,
    receivedAtMs: input.receivedAtMs,
    asOfMs: input.asOfMs,
    classification: input.classification,
    transport: input.transport,
    limitations: input.limitations,
    payload: input.sanitizedPayload,
  });
  return createHash("sha256").update(provenance).digest("hex");
}

function makeSource(input: {
  readonly id: string;
  readonly path: string;
  readonly requestedAtMs: number;
  readonly receivedAtMs: number;
  readonly asOfMs: number | null;
  readonly classification: OnlineSource["classification"];
  readonly transport: OnlineSource["transport"];
  readonly limitations: readonly string[];
  readonly sanitizedPayload: unknown;
}): OnlineSource {
  const limitations = [
    "SHA-256 covers sanitized projection and capture metadata, not raw response bytes or source authenticity.",
    ...input.limitations,
  ];
  return {
    id: input.id,
    path: input.path,
    sha256: sourceDigest({ ...input, limitations }),
    asOfMs: input.asOfMs,
    classification: input.classification,
    limitations,
    requestedAtMs: input.requestedAtMs,
    receivedAtMs: input.receivedAtMs,
    transport: input.transport,
  };
}

interface BoundedResponse extends FetchResponseLike {
  cancel(): void;
}

type RequestGuard = (url: URL, init: FetchInit) => boolean;

function boundedBytesText(response: Response): Promise<string> {
  const contentLength = response.headers.get("content-length");
  if (contentLength !== null && /^\d+$/.test(contentLength) && Number(contentLength) > ONLINE_LIMITS.maxResponseBytes) {
    void response.body?.cancel().catch(() => undefined);
    return Promise.reject(new OnchainosError("too_large", "response exceeds configured byte limit"));
  }
  const body = response.body;
  if (body === null) {
    return response.text().then((text) => {
      if (new TextEncoder().encode(text).byteLength > ONLINE_LIMITS.maxResponseBytes) {
        throw new OnchainosError("too_large", "response exceeds configured byte limit");
      }
      return text;
    });
  }

  return (async () => {
    const reader = body.getReader();
    const chunks: Uint8Array[] = [];
    let byteLength = 0;
    try {
      while (true) {
        const result = await reader.read();
        if (result.done) break;
        const chunk = result.value;
        byteLength += chunk.byteLength;
        if (byteLength > ONLINE_LIMITS.maxResponseBytes) {
          void reader.cancel().catch(() => undefined);
          throw new OnchainosError("too_large", "response exceeds configured byte limit");
        }
        chunks.push(chunk);
      }
    } finally {
      reader.releaseLock();
    }

    const bytes = new Uint8Array(byteLength);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    try {
      return UTF8.decode(bytes);
    } catch {
      throw new OnchainosError("schema", "response is not valid UTF-8");
    }
  })();
}

async function boundedFetch(urlText: string, init: FetchInit, guard: RequestGuard): Promise<BoundedResponse> {
  let url: URL;
  try {
    url = new URL(urlText);
  } catch {
    throw new Error("request_rejected");
  }
  if (init.method !== "GET" || init.redirect !== "error" || init.cache !== "no-store" || !guard(url, init)) {
    throw new Error("request_rejected");
  }

  const response = await globalThis.fetch(urlText, {
    method: "GET",
    headers: init.headers,
    signal: init.signal,
    redirect: "error",
    cache: "no-store",
    credentials: "omit",
    referrerPolicy: "no-referrer",
  });
  let textPromise: Promise<string> | null = null;
  return {
    status: response.status,
    text: () => {
      textPromise ??= boundedBytesText(response);
      return textPromise;
    },
    cancel: () => {
      if (response.body !== null) void response.body.cancel().catch(() => undefined);
    },
  };
}

function allowedRuntimeUrl(url: URL, origin: string): boolean {
  if (url.origin !== origin || url.username !== "" || url.password !== "" || url.hash !== "") return false;
  if (url.pathname === HEALTH_PATH || url.pathname === ANALYSIS_PATH) return url.search === "";
  return url.pathname === "/agent/ledger" && url.search === "?n=200";
}

function allowedOkxUrl(url: URL): boolean {
  if (url.origin !== DEFAULT_PUBLIC_OKX_ORIGIN || url.username !== "" || url.password !== "" || url.hash !== "") return false;
  if (url.pathname === OKX_TIME_PATH) return url.search === "";
  return url.pathname === OKX_TICKER_PATH && url.search === "?instId=SOL-USDT";
}

interface RuntimeJsonRead {
  readonly body: unknown;
  readonly requestedAtMs: number;
  readonly receivedAtMs: number;
}

type RuntimeRequestName = "health" | "analysis" | "ledger";

async function readRuntimeJson(origin: string, path: string, name: RuntimeRequestName): Promise<RuntimeJsonRead> {
  const prefix = `online_runtime_${name}`;
  const requestedAtMs = nowMs(`${prefix}_clock_invalid`);
  const controller = new AbortController();
  let timedOut = false;
  const { promise: deadline, reject: rejectDeadline } = Promise.withResolvers<never>();
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
    rejectDeadline(new OnlineCollectionError(`${prefix}_timeout`));
  }, ONLINE_LIMITS.timeoutMs);
  void deadline.catch(() => undefined);

  try {
    const response = await Promise.race([
      boundedFetch(`${origin}${path}`, {
        method: "GET",
        headers: { origin, accept: "application/json" },
        signal: controller.signal,
        redirect: "error",
        cache: "no-store",
      }, (url) => allowedRuntimeUrl(url, origin)),
      deadline,
    ]);
    if (response.status !== 200) {
      response.cancel();
      fail(`${prefix}_http`);
    }
    const text = await Promise.race([response.text(), deadline]);
    const receivedAtMs = nowMs(`${prefix}_clock_invalid`);
    if (receivedAtMs < requestedAtMs) fail(`${prefix}_clock_invalid`);
    let body: unknown;
    try {
      body = JSON.parse(text) as unknown;
    } catch {
      fail(`${prefix}_invalid`);
    }
    return { body, requestedAtMs, receivedAtMs };
  } catch (error) {
    if (error instanceof OnlineCollectionError) throw error;
    if (error instanceof OnchainosError) {
      if (error.kind === "timeout" || timedOut) fail(`${prefix}_timeout`);
      if (error.kind === "too_large") fail(`${prefix}_response_too_large`);
      if (error.kind === "schema") fail(`${prefix}_invalid`);
    }
    if (timedOut || controller.signal.aborted) fail(`${prefix}_timeout`);
    fail(`${prefix}_failed`);
  } finally {
    clearTimeout(timer);
  }
}

function validateRuntimeHealth(body: unknown): OnlineObservation["health"] {
  if (!isRecord(body) || body.ok !== true || body.app !== APP_ID || !isShortString(body.version, 64)
    || !/^[A-Za-z0-9._+-]+$/.test(body.version) || !isEpochMs(body.startedAt)) {
    fail("online_runtime_health_invalid");
  }
  return { app: APP_ID, version: body.version, startedAt: body.startedAt };
}

function validateCountFields(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  if (!isRecord(value)) return false;
  return keys.every((key) => isCount(value[key]));
}

function validateNumberArray(value: unknown): value is number[] {
  return Array.isArray(value) && value.every(isFiniteNumber);
}

function validateTimestamp(value: unknown, receivedAtMs: number): value is number {
  return isEpochMs(value) && withinFutureSkew(value, receivedAtMs);
}

function validateAnalysisView(value: unknown, receivedAtMs: number): value is Record<string, unknown> {
  if (!isRecord(value) || !isEpochMs(value.atMs)) return false;
  if (!withinFutureSkew(value.atMs, receivedAtMs) || receivedAtMs - value.atMs > ONLINE_LIMITS.runtimeMaxAgeMs) return false;

  const funnel = value.funnel;
  if (!validateCountFields(funnel, ["consults", "items", "closed", "open", "asked", "applied", "executed", "failed"])) return false;

  if (!Array.isArray(value.asks) || !value.asks.every((raw) => {
    if (!isRecord(raw)) return false;
    return validateTimestamp(raw.t, receivedAtMs) && isStringOrNull(raw.s, 80) && isFiniteNumber(raw.p) && typeof raw.ok === "boolean";
  })) return false;

  if (!isRecord(value.hist) || !validateNumberArray(value.hist.all) || !validateNumberArray(value.hist.fresh)) return false;

  if (!Array.isArray(value.timeline) || !value.timeline.every((raw) => {
    if (!isRecord(raw)) return false;
    return validateTimestamp(raw.t, receivedAtMs) && validateCountFields(raw, ["open", "asked", "applied"]);
  })) return false;

  if (!Array.isArray(value.trips) || !value.trips.every((raw) => {
    if (!isRecord(raw)) return false;
    return isShortString(raw.s, 80) && isFiniteNumber(raw.in) && isFiniteNumber(raw.out) && isFiniteNumber(raw.pct)
      && validateTimestamp(raw.buyAt, receivedAtMs) && validateTimestamp(raw.sellAt, receivedAtMs);
  })) return false;

  if (!isRecord(value.fees) || !isCount(value.fees.lamports) || !isCount(value.fees.fills) || !isCount(value.fees.unmatchedSells)) return false;

  if (!isRecord(value.placar)) return false;
  for (const groupName of ["skipped", "closed", "gated"] as const) {
    const group = value.placar[groupName];
    if (!isRecord(group)) return false;
    for (const windowName of ["15m", "1h"] as const) {
      const window = group[windowName];
      if (!isRecord(window) || !isCount(window.n) || !isCount(window.up) || !isNullableFinite(window.mean) || !validateNumberArray(window.vals)) return false;
    }
  }

  if (!Array.isArray(value.recent) || !value.recent.every((raw) => {
    if (!isRecord(raw)) return false;
    return validateTimestamp(raw.t, receivedAtMs) && isStringOrNull(raw.s, 80) && isShortString(raw.kind, 80)
      && isNullableFinite(raw.m15) && isNullableFinite(raw.m1h);
  })) return false;

  if (!isRecord(value.orders) || !isRecord(value.orders.outcomes) || !isRecord(value.orders.reasons)
    || !Object.values(value.orders.outcomes).every(isCount) || !Object.values(value.orders.reasons).every(isCount)
    || !isRecord(value.orders.spentToday) || !isFiniteNumber(value.orders.spentToday.buy) || !isFiniteNumber(value.orders.spentToday.sell)) return false;

  return isRecord(value.runtime) && isNullableFinite(value.runtime.tokensToday) && isNullableFinite(value.runtime.riskPct);
}

function analysisHashPayload(value: Record<string, unknown>): unknown {
  const funnel = value.funnel as Record<string, unknown>;
  const hist = value.hist as Record<string, unknown>;
  const fees = value.fees as Record<string, unknown>;
  const placar = value.placar as Record<string, unknown>;
  const orders = value.orders as Record<string, unknown>;
  const spentToday = orders.spentToday as Record<string, unknown>;
  const runtime = value.runtime as Record<string, unknown>;
  const countValues = (raw: unknown): number[] => Object.values(raw as Record<string, number>).sort((a, b) => a - b);
  const stats = (raw: unknown): unknown => {
    const record = raw as Record<string, unknown>;
    return { n: record.n, up: record.up, mean: record.mean, vals: record.vals };
  };
  const statsGroup = (raw: unknown): unknown => {
    const record = raw as Record<string, unknown>;
    return { "15m": stats(record["15m"]), "1h": stats(record["1h"]) };
  };

  return {
    atMs: value.atMs,
    funnel: { consults: funnel.consults, items: funnel.items, closed: funnel.closed, open: funnel.open, asked: funnel.asked, applied: funnel.applied, executed: funnel.executed, failed: funnel.failed },
    asks: (value.asks as Record<string, unknown>[]).map((row) => [row.t, row.p, row.ok]),
    hist: { all: hist.all, fresh: hist.fresh },
    timeline: (value.timeline as Record<string, unknown>[]).map((row) => [row.t, row.open, row.asked, row.applied]),
    trips: (value.trips as Record<string, unknown>[]).map((row) => [row.in, row.out, row.pct, row.buyAt, row.sellAt]),
    fees: { lamports: fees.lamports, fills: fees.fills, unmatchedSells: fees.unmatchedSells },
    placar: { skipped: statsGroup(placar.skipped), closed: statsGroup(placar.closed), gated: statsGroup(placar.gated) },
    recent: (value.recent as Record<string, unknown>[]).map((row) => [row.t, row.m15, row.m1h]),
    orders: { outcomes: countValues(orders.outcomes), reasons: countValues(orders.reasons), spentToday: { buy: spentToday.buy, sell: spentToday.sell } },
    runtime: { tokensToday: runtime.tokensToday, riskPct: runtime.riskPct },
  };
}

function validateLedger(body: unknown, receivedAtMs: number): readonly unknown[] {
  if (!isRecord(body) || body.ok !== true || !Array.isArray(body.records) || body.records.length > LEDGER_LIMIT) {
    fail("online_runtime_ledger_invalid");
  }
  const records = body.records;
  for (const raw of records) {
    if (!isRecord(raw) || !isEpochMs(raw.atMs) || !withinFutureSkew(raw.atMs, receivedAtMs)
      || (raw.kind !== "cycle" && raw.kind !== "order")) {
      fail("online_runtime_ledger_invalid");
    }
  }
  return records;
}

function ledgerHashPayload(records: readonly unknown[]): unknown {
  let cycleCount = 0;
  let orderCount = 0;
  let firstAtMs: number | null = null;
  let latestAtMs: number | null = null;
  for (const raw of records) {
    const row = raw as Record<string, unknown>;
    const atMs = row.atMs as number;
    if (firstAtMs === null || atMs < firstAtMs) firstAtMs = atMs;
    if (latestAtMs === null || atMs > latestAtMs) latestAtMs = atMs;
    if (row.kind === "cycle") cycleCount += 1;
    else orderCount += 1;
  }
  return { recordCount: records.length, cycleCount, orderCount, firstAtMs, latestAtMs };
}

function checkFreshness(asOfMs: number, receivedAtMs: number, maxAgeMs: number, tag: string): void {
  if (!withinFutureSkew(asOfMs, receivedAtMs)) fail(`${tag}_future`);
  if (receivedAtMs - asOfMs > maxAgeMs) fail(`${tag}_stale`);
}

function validateReadMeta(meta: ReadMeta, path: string, tag: "time" | "ticker"): void {
  if (meta.source !== "okx-public-v5" || meta.endpoint !== path || meta.httpStatus !== 200
    || !isEpochMs(meta.requestedAtMs) || !isEpochMs(meta.receivedAtMs) || meta.receivedAtMs < meta.requestedAtMs) {
    fail(`online_okx_${tag}_invalid`);
  }
}

function parseOkxTime(data: unknown): number {
  if (!Array.isArray(data) || data.length !== 1) fail("online_okx_time_invalid");
  const row = data[0];
  if (!isRecord(row) || typeof row.ts !== "string" || !/^\d{1,16}$/.test(row.ts)) fail("online_okx_time_invalid");
  const timestamp = readEpochMs(row.ts);
  if (timestamp === null) fail("online_okx_time_invalid");
  return timestamp;
}

function providerFailure(tag: "time" | "ticker", error: unknown): never {
  if (error instanceof OnchainosError) {
    if (error.kind === "timeout") fail(`online_okx_${tag}_timeout`);
    if (error.kind === "too_large") fail(`online_okx_${tag}_response_too_large`);
    if (error.kind === "schema") fail(`online_okx_${tag}_invalid`);
  }
  fail(`online_okx_${tag}_failed`);
}

export async function collectOnlineObservation(options: OnlineOptions): Promise<OnlineObservation> {
  const origin = runtimeOrigin(options);
  const startedAtMs = nowMs();
  const healthRead = await readRuntimeJson(origin, HEALTH_PATH, "health");
  const health = validateRuntimeHealth(healthRead.body);
  if (!withinFutureSkew(health.startedAt, healthRead.receivedAtMs)) fail("online_runtime_health_invalid");
  const analysisRead = await readRuntimeJson(origin, ANALYSIS_PATH, "analysis");
  const analysisBody = analysisRead.body;
  if (!isRecord(analysisBody) || analysisBody.ok !== true
    || !validateAnalysisView(analysisBody.analysis, analysisRead.receivedAtMs)) {
    fail("online_runtime_analysis_invalid");
  }
  const analysis = analysisBody.analysis as Record<string, unknown>;
  const analysisAsOfMs = analysis.atMs as number;
  const ledgerRead = await readRuntimeJson(origin, LEDGER_PATH, "ledger");
  const ledger = validateLedger(ledgerRead.body, ledgerRead.receivedAtMs);

  const publicHttp = createPublicOkxHttp({
    fetch: (url, init) => boundedFetch(url, init, (requestUrl) => allowedOkxUrl(requestUrl)),
    now: () => Date.now(),
    sleep: (ms) => {
      const { promise, resolve } = Promise.withResolvers<void>();
      setTimeout(resolve, ms);
      return promise;
    },
    allowNetwork: true,
    origin: DEFAULT_PUBLIC_OKX_ORIGIN,
    timeoutMs: ONLINE_LIMITS.timeoutMs,
    maxResponseChars: ONLINE_LIMITS.maxResponseBytes,
  });
  const publicClient = createPublicOkxClient(publicHttp);

  const timeRead = await publicHttp.get({ path: OKX_TIME_PATH, tier: "public" }).catch((error: unknown) => {
    providerFailure("time", error);
  });
  validateReadMeta(timeRead.meta, OKX_TIME_PATH, "time");
  const serverAtMs = parseOkxTime(timeRead.data);
  checkFreshness(serverAtMs, timeRead.meta.receivedAtMs, ONLINE_LIMITS.marketMaxAgeMs, "online_okx_time");

  const tickerRead = await publicClient.ticker(MARKET_INSTRUMENT).catch((error: unknown) => {
    providerFailure("ticker", error);
  });
  validateReadMeta(tickerRead.meta, OKX_TICKER_PATH, "ticker");
  const ticker = tickerRead.value;
  const last = toNumber(ticker.last);
  const bid = toNumber(ticker.bidPx);
  const ask = toNumber(ticker.askPx);
  const quoteAtMs = ticker.tsMs;
  if (ticker.instId !== MARKET_INSTRUMENT || last === null || bid === null || ask === null || !isEpochMs(quoteAtMs)
    || last <= 0 || bid <= 0 || ask <= 0 || bid > ask) {
    fail("online_okx_ticker_invalid");
  }
  checkFreshness(quoteAtMs, tickerRead.meta.receivedAtMs, ONLINE_LIMITS.marketMaxAgeMs, "online_okx_ticker");
  checkFreshness(quoteAtMs, serverAtMs, ONLINE_LIMITS.marketMaxAgeMs, "online_okx_ticker");

  const completedAtMs = nowMs();
  if (completedAtMs < startedAtMs || completedAtMs < healthRead.receivedAtMs
    || completedAtMs < analysisRead.receivedAtMs || completedAtMs < ledgerRead.receivedAtMs
    || completedAtMs < timeRead.meta.receivedAtMs || completedAtMs < tickerRead.meta.receivedAtMs) {
    fail("online_clock_invalid");
  }
  checkFreshness(analysisAsOfMs, completedAtMs, ONLINE_LIMITS.runtimeMaxAgeMs, "online_runtime_analysis");
  checkFreshness(serverAtMs, completedAtMs, ONLINE_LIMITS.marketMaxAgeMs, "online_okx_time");
  checkFreshness(quoteAtMs, completedAtMs, ONLINE_LIMITS.marketMaxAgeMs, "online_okx_ticker");

  const sources: OnlineSource[] = [
    makeSource({
      id: "runtime_health",
      path: HEALTH_PATH,
      requestedAtMs: healthRead.requestedAtMs,
      receivedAtMs: healthRead.receivedAtMs,
      asOfMs: null,
      classification: "local_process",
      transport: "http_loopback",
      limitations: ["Process identity only; startedAt is not a data timestamp."],
      sanitizedPayload: health,
    }),
    makeSource({
      id: "runtime_analysis",
      path: ANALYSIS_PATH,
      requestedAtMs: analysisRead.requestedAtMs,
      receivedAtMs: analysisRead.receivedAtMs,
      asOfMs: analysisAsOfMs,
      classification: "local_process",
      transport: "http_loopback",
      limitations: ["atMs is the analysis projection time, not the decision time.", "Historical timeline and markout timestamps are preserved."],
      sanitizedPayload: analysisHashPayload(analysis),
    }),
    makeSource({
      id: "runtime_ledger",
      path: LEDGER_PATH,
      requestedAtMs: ledgerRead.requestedAtMs,
      receivedAtMs: ledgerRead.receivedAtMs,
      asOfMs: ledgerRead.receivedAtMs,
      classification: "local_process",
      transport: "http_loopback",
      limitations: ["The response is limited to the last 200 ledger records, not the full ledger.", "Record timestamps remain original and are not refreshed by collection."],
      sanitizedPayload: ledgerHashPayload(ledger),
    }),
    makeSource({
      id: "okx_time",
      path: OKX_TIME_PATH,
      requestedAtMs: timeRead.meta.requestedAtMs,
      receivedAtMs: timeRead.meta.receivedAtMs,
      asOfMs: serverAtMs,
      classification: "public_market",
      transport: "https_public",
      limitations: ["Public OKX server clock; not a local clock."],
      sanitizedPayload: { serverAtMs },
    }),
    makeSource({
      id: "okx_ticker",
      path: `${OKX_TICKER_PATH}?instId=${MARKET_INSTRUMENT}`,
      requestedAtMs: tickerRead.meta.requestedAtMs,
      receivedAtMs: tickerRead.meta.receivedAtMs,
      asOfMs: quoteAtMs,
      classification: "public_market",
      transport: "https_public",
      limitations: ["Public SOL-USDT CEX context only; not an executable DEX quote or portfolio valuation."],
      sanitizedPayload: { instrument: MARKET_INSTRUMENT, last, bid, ask, quoteAtMs },
    }),
  ];

  return {
    startedAtMs,
    completedAtMs,
    sources,
    health,
    analysis,
    ledger,
    market: { instrument: MARKET_INSTRUMENT, last, bid, ask, quoteAtMs, serverAtMs },
  };
}
