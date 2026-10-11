import { describe, expect, test } from "bun:test";
import { createFixtureAdapter } from "../okx-derivatives/adapter.ts";
import { parseDerivativesInput } from "../okx-derivatives/snapshot.ts";
import { buildDerivativesReport } from "../okx-derivatives/report.ts";
import { OnchainosError } from "./errors.ts";
import { envelope, makeClock, makeFakeFetch, type FakeReply } from "./fakes.ts";
import { FIXTURES } from "./fixtures.ts";
import {
  buildDerivativesInput,
  buildDerivativesSnapshot,
  createPublicOkxClient,
  createPublicOkxHttp,
  parseBooks,
  parseFundingHistory,
  parseFundingRate,
  parseInstruments,
  parsePublicCandles,
  PUBLIC_BAR_MS,
  toNumber,
} from "./public-okx.ts";

const fx = (key: keyof typeof FIXTURES): FakeReply => ({ body: FIXTURES[key].body });
const withData = (data: unknown): FakeReply => ({ body: envelope(data) });

function stack(script: FakeReply[], extra: Record<string, unknown> = {}) {
  const clock = makeClock();
  const fake = makeFakeFetch(script, clock);
  const http = createPublicOkxHttp({ fetch: fake.fetch, now: clock.now, sleep: clock.sleep, allowNetwork: true, requestsPerSecond: 5, burst: 5, ...extra });
  return { clock, fake, http, okx: createPublicOkxClient(http) };
}

const PERP = "BTC-USDT-SWAP";
const SPOT = "BTC-USDT";

describe("public-okx: keyless transport", () => {
  test("D17: offline by default, no authentication header of any kind, public tier and the OKX origin", async () => {
    const clock = makeClock();
    const quiet = makeFakeFetch([fx("public.mark-price/live")], clock);
    const offline = createPublicOkxHttp({ fetch: quiet.fetch, now: clock.now, sleep: clock.sleep });
    await expect(createPublicOkxClient(offline).markPrice(PERP)).rejects.toMatchObject({ kind: "offline" });
    expect(quiet.calls.length).toBe(0);

    const { fake, okx, http } = stack([fx("public.mark-price/live")]);
    const read = await okx.markPrice(PERP);
    const call = fake.calls[0]!;
    expect(call.url).toBe("https://www.okx.com/api/v5/public/mark-price?instType=SWAP&instId=BTC-USDT-SWAP");
    expect(call.method).toBe("GET");
    expect(Object.keys(call.headers)).toEqual([]);
    expect(read.meta.tier).toBe("public");
    expect(read.meta.source).toBe("okx-public-v5");
    expect(http.quota.snapshot().attempts.public).toBe(1);
    expect(http.quota.snapshot().costKnown).toBe(true);
  });

  test("D17: the default is one request per second and the ceiling is five, the strictest documented limit being 10 per 2 seconds", async () => {
    const clock = makeClock();
    const fake = makeFakeFetch([fx("public.mark-price/live"), fx("public.mark-price/live")], clock);
    const http = createPublicOkxHttp({ fetch: fake.fetch, now: clock.now, sleep: clock.sleep, allowNetwork: true });
    const okx = createPublicOkxClient(http);
    await okx.markPrice(PERP);
    await okx.markPrice(PERP);
    expect(clock.sleeps).toEqual([1000]);
    expect(http.info.requestsPerSecond).toBe(1);
    for (const requestsPerSecond of [5.5, 6, 10, 0.05, Number.NaN]) {
      expect(() => createPublicOkxHttp({ fetch: fake.fetch, now: clock.now, sleep: clock.sleep, allowNetwork: true, requestsPerSecond })).toThrow(OnchainosError);
    }
    expect(() => createPublicOkxHttp({ fetch: fake.fetch, now: clock.now, sleep: clock.sleep, allowNetwork: true, requestsPerSecond: 5 })).not.toThrow();
  });

  test("D17: the global fetch is never used and only the two documented public paths are reachable", async () => {
    const original = globalThis.fetch;
    let touched = 0;
    globalThis.fetch = ((): never => {
      touched += 1;
      throw new Error("fetch global usado");
    }) as unknown as typeof fetch;
    try {
      const { okx, http } = stack([fx("public.mark-price/live")]);
      await okx.markPrice(PERP);
      for (const path of ["/api/v5/account/balance", "/api/v5/trade/order", "/api/v5/asset/transfer", "/api/v6/dex/market/price", "/api/v5/public/../trade/order", "/api/v5/market"]) {
        await expect(http.get({ path, tier: "public" }), path).rejects.toMatchObject({ kind: "invalid_request" });
      }
    } finally {
      globalThis.fetch = original;
    }
    expect(touched).toBe(0);
  });
});

describe("public-okx: instruments", () => {
  test("D17: the real swap instrument keeps exact decimal text and the contract terms the evaluator needs", async () => {
    const { fake, okx } = stack([fx("public.instruments.swap/live")]);
    const read = await okx.instruments({ instType: "SWAP", instId: PERP });
    expect(fake.calls[0]!.query).toBe("instType=SWAP&instId=BTC-USDT-SWAP");
    const row = read.value[0]!;
    expect(row).toMatchObject({
      instType: "SWAP",
      instId: PERP,
      state: "live",
      baseCcy: null,
      quoteCcy: null,
      settleCcy: "USDT",
      ctValCcy: "BTC",
      ctType: "linear",
      ctVal: "0.01",
      ctMult: "1",
      tickSz: "0.1",
      lotSz: "0.01",
      minSz: "0.01",
      maxLeverage: 100,
      listTimeMs: 1573557408000,
      expTimeMs: null,
    });
  });

  test("D17: the real spot instrument has no contract terms and they are null, not zero", async () => {
    const { okx } = stack([fx("public.instruments.spot/live")]);
    const [row] = (await okx.instruments({ instType: "SPOT", instId: SPOT })).value;
    expect(row).toMatchObject({ instType: "SPOT", instId: SPOT, baseCcy: "BTC", quoteCcy: "USDT", ctVal: null, ctMult: null, ctType: null, ctValCcy: null, tickSz: "0.1", lotSz: "0.00000001", minSz: "0.00001", maxLeverage: 10 });
  });

  test("D17: an instrument answer of the wrong type, instrument or with unreadable terms is handled strictly", () => {
    const base = { instType: "SWAP", instId: PERP, state: "live", ctType: "linear", ctVal: "0.01", ctMult: "1", ctValCcy: "BTC", settleCcy: "USDT", tickSz: "0.1", lotSz: "0.01", minSz: "0.01", lever: "100", listTime: "1", expTime: "" };
    expect(parseInstruments([base], "SWAP", PERP)[0]).toMatchObject({ ctVal: "0.01" });
    expect(() => parseInstruments([{ ...base, instType: "SPOT" }], "SWAP", PERP)).toThrow(/fora do pedido/);
    expect(() => parseInstruments([{ ...base, instId: "ETH-USDT-SWAP" }], "SWAP", PERP)).toThrow(/fora do pedido/);
    const sloppy = parseInstruments([{ ...base, ctVal: "1e-2", lotSz: "+1", minSz: "", tickSz: "0.1.1", ctType: "weird", state: "LIVE!", lever: "abc" }], "SWAP", PERP)[0]!;
    expect(sloppy).toMatchObject({ ctVal: null, lotSz: null, minSz: null, tickSz: null, ctType: null, state: null, maxLeverage: null });
    expect(() => parseInstruments([base, base], "SWAP", PERP)).toThrow(OnchainosError);
    expect(parseInstruments([base, { ...base, instId: "ETH-USDT-SWAP" }], "SWAP").length).toBe(2);
  });

  test("D17: instrument parameters are validated", async () => {
    const { fake, okx } = stack([fx("public.instruments.swap/live")]);
    for (const query of [{ instType: "FUTURES" }, { instType: "SWAP", instId: "btc-usdt-swap" }, { instType: "SWAP", instId: "A" }, { instType: "SWAP", instId: "x y" }]) {
      await expect(okx.instruments(query as never), JSON.stringify(query)).rejects.toMatchObject({ kind: "invalid_request" });
    }
    expect(fake.calls.length).toBe(0);
  });
});

describe("public-okx: funding", () => {
  test("D17: the real funding rate gives the pending settlement, the interval derived from the times and an empty next rate as null", async () => {
    const { fake, okx } = stack([fx("public.funding-rate/live")]);
    const read = await okx.fundingRate(PERP);
    expect(fake.calls[0]!.query).toBe("instId=BTC-USDT-SWAP");
    expect(read.value).toEqual({
      instId: PERP,
      method: "current_period",
      fundingRate: "-0.0000148689400726",
      nextFundingRate: null,
      fundingTimeMs: 1791734400000,
      nextFundingTimeMs: 1791763200000,
      prevFundingTimeMs: 1791705600000,
      intervalMs: 28_800_000,
      minFundingRate: "-0.00375",
      maxFundingRate: "0.00375",
      premium: "-0.0004361072727514",
      settState: "settled",
      settFundingRate: "-0.0000154175824147",
      tsMs: 1791714443125,
    });
  });

  test("D9: an interval that is not 1, 2, 4 or 8 hours is null, never invented, and the previous time is the fallback", () => {
    const base = { instId: PERP, fundingRate: "0.0001", fundingTime: "1000000000000", ts: "1" };
    expect(parseFundingRate([{ ...base, nextFundingTime: String(1_000_000_000_000 + 6 * 3_600_000) }], PERP).intervalMs).toBeNull();
    expect(parseFundingRate([{ ...base, nextFundingTime: String(1_000_000_000_000 + 4 * 3_600_000) }], PERP).intervalMs).toBe(14_400_000);
    expect(parseFundingRate([{ ...base, nextFundingTime: "", prevFundingTime: String(1_000_000_000_000 - 3_600_000) }], PERP).intervalMs).toBe(3_600_000);
    expect(parseFundingRate([{ ...base, nextFundingTime: "", prevFundingTime: "" }], PERP).intervalMs).toBeNull();
    expect(parseFundingRate([{ ...base, fundingTime: "" }], PERP)).toMatchObject({ fundingTimeMs: null, intervalMs: null });
  });

  test("D17: a funding answer about another instrument, or with more than one row, is refused", () => {
    expect(() => parseFundingRate([{ instId: "ETH-USDT-SWAP" }], PERP)).toThrow(/fora do pedido/);
    expect(() => parseFundingRate([{ instId: PERP }, { instId: PERP }], PERP)).toThrow(OnchainosError);
    expect(() => parseFundingRate([], PERP)).toThrow(OnchainosError);
  });

  test("D17: the real funding history keeps the realized rate, newest first, and checks the instrument and the cap", async () => {
    const { fake, okx } = stack([fx("public.funding-rate-history/live")]);
    const read = await okx.fundingRateHistory(PERP, { limit: 3 });
    expect(fake.calls[0]!.query).toBe("instId=BTC-USDT-SWAP&limit=3");
    expect(read.value).toEqual([
      { fundingTimeMs: 1791705600000, fundingRate: "-0.0000154175824147", realizedRate: "-0.0000154175824147", method: "current_period" },
      { fundingTimeMs: 1791676800000, fundingRate: "-0.000021973068193", realizedRate: "-0.000021973068193", method: "current_period" },
      { fundingTimeMs: 1791648000000, fundingRate: "0.0000112787516257", realizedRate: "0.0000112787516257", method: "current_period" },
    ]);
    expect(() => parseFundingHistory([{ instId: "ETH-USDT-SWAP", fundingTime: "1" }], PERP, 5)).toThrow(/fora do pedido/);
    expect(() => parseFundingHistory([{ instId: PERP, fundingTime: "" }], PERP, 5)).toThrow(/fundingTime/);
    expect(() => parseFundingHistory(Array.from({ length: 4 }, () => ({ instId: PERP, fundingTime: "1" })), PERP, 3)).toThrow(/mais de 3 linhas/);
  });

  test("D17: funding history parameters are validated, with the documented ceiling of 400", async () => {
    const { fake, okx } = stack([withData([]), withData([])]);
    await okx.fundingRateHistory(PERP, { limit: 400, before: 1700000000000, after: "1800000000000" });
    expect(fake.calls[0]!.query).toBe("instId=BTC-USDT-SWAP&before=1700000000000&after=1800000000000&limit=400");
    for (const bad of [{ limit: 401 }, { limit: 0 }, { limit: 1.5 }, { before: "abc" }, { after: -1 }]) {
      await expect(okx.fundingRateHistory(PERP, bad as never), JSON.stringify(bad)).rejects.toMatchObject({ kind: "invalid_request" });
    }
    await expect(okx.fundingRateHistory(SPOT)).rejects.toMatchObject({ kind: "invalid_request" });
    await expect(okx.fundingRate("ANY")).rejects.toMatchObject({ kind: "invalid_request" });
    expect(fake.calls.length).toBe(1);
  });
});

describe("public-okx: market data", () => {
  test("D17: the real mark price, tickers and open interest parse into exact text and times", async () => {
    const { okx } = stack([fx("public.mark-price/live"), fx("public.ticker.swap/live"), fx("public.ticker.spot/live"), fx("public.open-interest/live")]);
    expect((await okx.markPrice(PERP)).value).toEqual({ instId: PERP, markPx: "82970.7", tsMs: 1791714493199 });
    const swap = (await okx.ticker(PERP)).value;
    expect(swap).toMatchObject({ instId: PERP, last: "82970.8", askPx: "82970.9", askSz: "1570.77", bidPx: "82970.8", bidSz: "580.42", vol24h: "1582329.15", volCcy24h: "15823.2915", tsMs: 1791714495270 });
    const spot = (await okx.ticker(SPOT)).value;
    expect(spot).toMatchObject({ instId: SPOT, bidPx: "82983.1", askPx: "82983.2", vol24h: "1607.11433251", volCcy24h: "133369722.134158974" });
    expect((await okx.openInterest(PERP)).value).toEqual({ instId: PERP, oi: "3003402.5300000128", oiCcy: "30034.025300000128", oiUsd: "2491947106.3612506202624", tsMs: 1791714502733 });
  });

  test("D9: empty prices and sizes of a ticker are null; the numeric helper never turns null into zero", async () => {
    const { okx } = stack([withData([{ instId: SPOT, last: "", askPx: "x", askSz: "-1", bidPx: "0.1", bidSz: "1e5", vol24h: "0", ts: "" }])]);
    const row = (await okx.ticker(SPOT)).value;
    expect(row).toMatchObject({ last: null, askPx: null, askSz: null, bidPx: "0.1", bidSz: null, vol24h: "0", tsMs: null });
    expect(toNumber(null)).toBeNull();
    expect(toNumber("0")).toBe(0);
    expect(toNumber("82970.8")).toBe(82970.8);
  });

  test("D17: candles have exactly nine columns, newest first as observed, the confirm flag and the 300 cap", async () => {
    const { fake, okx } = stack([fx("public.candles.swap/live"), withData([])]);
    const read = await okx.candles(PERP, { bar: "1m", limit: 3 });
    expect(fake.calls[0]!.query).toBe("instId=BTC-USDT-SWAP&bar=1m&limit=3");
    expect(read.value).toEqual([
      { startMs: 1791714480000, open: "82970.8", high: "82970.9", low: "82970.8", close: "82970.8", vol: "8.74", volCcy: "0.0874", volCcyQuote: "7251.64803", confirmed: false },
      { startMs: 1791714420000, open: "82970.8", high: "82970.9", low: "82970.8", close: "82970.8", vol: "241.48", volCcy: "2.4148", volCcyQuote: "200357.88966", confirmed: true },
      { startMs: 1791714360000, open: "82975.7", high: "82975.7", low: "82970.8", close: "82970.9", vol: "442.09", volCcy: "4.4209", volCcyQuote: "366824.21949", confirmed: true },
    ]);
    await okx.candles(PERP, { limit: 300 });
    for (const bad of [{ limit: 301 }, { limit: 0 }, { bar: "1s" }, { bar: "7m" }, { after: "x" }, { before: -1 }]) {
      await expect(okx.candles(PERP, bad as never), JSON.stringify(bad)).rejects.toMatchObject({ kind: "invalid_request" });
    }
    expect(() => parsePublicCandles([["1", "2", "3"]], 5)).toThrow(/9 colunas/);
    expect(() => parsePublicCandles([["1791714480000", "1", "2", "1", "1", "1", "1", "1", "2"]], 5)).toThrow(/confirm/);
    expect(() => parsePublicCandles([["", "1", "2", "1", "1", "1", "1", "1", "1"]], 5)).toThrow(/ts/);
    expect(() => parsePublicCandles(Array.from({ length: 4 }, () => ["1791714480000", "1", "2", "1", "1", "1", "1", "1", "1"]), 3)).toThrow(/mais de 3 linhas/);
  });

  test("D17: the one second bar is only valid for the history endpoint and the bar durations are known for fixed bars", async () => {
    const { fake, okx } = stack([withData([])]);
    await okx.historyCandles(PERP, { bar: "1s", limit: 5 });
    expect(fake.calls[0]!.path).toBe("/api/v5/market/history-candles");
    expect(PUBLIC_BAR_MS["1m"]).toBe(60_000);
    expect(PUBLIC_BAR_MS["1D"]).toBe(86_400_000);
    expect(PUBLIC_BAR_MS["3D"]).toBe(259_200_000);
    expect(PUBLIC_BAR_MS["1M"]).toBeNull();
  });

  test("D17: the book keeps price, size and order count as exact text, checks the order and flags a crossed book instead of hiding it", async () => {
    const { fake, okx } = stack([fx("public.books.swap/live"), fx("public.books.spot/live")]);
    const swap = (await okx.books(PERP, { sz: 5 })).value;
    expect(fake.calls[0]!.query).toBe("instId=BTC-USDT-SWAP&sz=5");
    expect(swap.tsMs).toBe(1791715028856);
    expect(swap.seqId).toBe(345292865266);
    expect(swap.asks[0]).toEqual({ price: "82948.1", size: "890.22", orders: 62 });
    expect(swap.bids[0]).toEqual({ price: "82948", size: "298.2", orders: 26 });
    expect(swap.asks.length).toBe(5);
    expect(swap.crossed).toBe(false);
    expect((await okx.books(SPOT, { sz: 5 })).value.bids[4]).toEqual({ price: "82980", size: "0.18522471", orders: 2 });

    const level = (price: string) => [price, "1", "0", "1"];
    expect(parseBooks([{ asks: [level("10")], bids: [level("11")], ts: "1" }]).crossed).toBe(true);
    expect(parseBooks([{ asks: [level("10")], bids: [level("10")], ts: "1" }]).crossed).toBe(true);
    expect(parseBooks([{ asks: [], bids: [level("10")], ts: "1" }]).crossed).toBe(false);
    for (const [data, side, index] of [
      [{ asks: [level("10"), level("9")], bids: [], ts: "1" }, "asks", 1],
      [{ asks: [level("10"), level("10")], bids: [], ts: "1" }, "asks", 1],
      [{ asks: [], bids: [level("9"), level("10")], ts: "1" }, "bids", 1],
      [{ asks: [["10", "0", "0", "1"]], bids: [], ts: "1" }, "asks", 0],
      [{ asks: [["abc", "1", "0", "1"]], bids: [], ts: "1" }, "asks", 0],
      [{ asks: [["10", "1"]], bids: [], ts: "1" }, "asks", 0],
      [{ asks: [], bids: ["text"], ts: "1" }, "bids", 0],
    ] as Array<[unknown, string, number]>) {
      try {
        parseBooks([data]);
        throw new Error("deveria rejeitar");
      } catch (error) {
        expect((error as OnchainosError).kind).toBe("schema");
        expect((error as OnchainosError).rowIndex).toBe(index);
        expect((error as Error).message).toContain(side);
      }
    }
    expect(() => parseBooks([])).toThrow(OnchainosError);
    expect(() => parseBooks({})).toThrow(OnchainosError);
  });

  test("D17: book depth is validated up to 400", async () => {
    const { fake, okx } = stack([withData([{ asks: [], bids: [], ts: "1" }])]);
    await okx.books(PERP, { sz: 400 });
    for (const sz of [401, 0, 1.5]) await expect(okx.books(PERP, { sz }), String(sz)).rejects.toMatchObject({ kind: "invalid_request" });
    expect(fake.calls.length).toBe(1);
  });
});

describe("public-okx: bounded pagination", () => {
  const row = (fundingTime: number) => ({ instId: PERP, fundingTime: String(fundingTime), fundingRate: "0.0001", realizedRate: "0.0001", method: "current_period" });

  test("D19: the funding history walks backwards with after, stops at a short page and obeys the caps", async () => {
    const { fake, okx } = stack([withData([row(300), row(200), row(100)]), withData([row(90), row(80), row(70)]), withData([row(60)])]);
    const walked = await okx.fundingRateHistoryBackwards(PERP, { limit: 3 }, { maxPages: 5, maxRows: 100 });
    expect(walked.value.rows.map((entry) => entry.fundingTimeMs)).toEqual([300, 200, 100, 90, 80, 70, 60]);
    expect(walked.value.stopReason).toBe("exhausted");
    expect(fake.calls[1]!.query).toContain("after=100");
    expect(fake.calls[2]!.query).toContain("after=70");
    expect(walked.meta.attempts).toBe(3);

    const capped = stack([withData([row(300), row(200), row(100)]), withData([row(90), row(80), row(70)]), withData([row(60), row(50), row(40)])]);
    const limited = await capped.okx.fundingRateHistoryBackwards(PERP, { limit: 3 }, { maxPages: 2, maxRows: 100 });
    expect(limited.value.truncated).toBe(true);
    expect(limited.value.stopReason).toBe("max_pages");
    expect(capped.fake.calls.length).toBe(2);

    const rowCap = stack([withData([row(300), row(200), row(100)]), withData([row(90), row(80), row(70)])]);
    const trimmed = await rowCap.okx.fundingRateHistoryBackwards(PERP, { limit: 3 }, { maxPages: 5, maxRows: 4 });
    expect(trimmed.value.rows.length).toBe(4);
    expect(trimmed.value.stopReason).toBe("max_rows");

    const stuck = stack([withData([row(300), row(200), row(100)]), withData([row(300), row(200), row(100)])]);
    expect((await stuck.okx.fundingRateHistoryBackwards(PERP, { limit: 3 }, { maxPages: 9, maxRows: 100 })).value.stopReason).toBe("repeated_cursor");
  });

  test("D19: the candle history walks backwards the same way and never duplicates a bar", async () => {
    const candle = (ts: number) => [String(ts), "1", "2", "1", "1.5", "10", "1", "15", "1"];
    const { fake, okx } = stack([withData([candle(900), candle(800), candle(700)]), withData([candle(700), candle(600), candle(500)]), withData([candle(400)])]);
    const walked = await okx.historyCandlesBackwards(PERP, { bar: "1m", limit: 3 }, { maxPages: 5, maxRows: 100 });
    expect(walked.value.rows.map((entry) => entry.startMs)).toEqual([900, 800, 700, 600, 500, 400]);
    expect(fake.calls[1]!.query).toContain("after=700");
    expect(walked.value.stopReason).toBe("exhausted");
  });
});

describe("public-okx: the bridge to the derivatives evaluator", () => {
  async function readAll() {
    const { okx } = stack([
      fx("public.instruments.spot/live"),
      fx("public.instruments.swap/live"),
      fx("public.books.spot/live"),
      fx("public.books.swap/live"),
      fx("public.mark-price/live"),
      fx("public.funding-rate/live"),
      fx("public.funding-rate-history/live"),
    ]);
    const spot = (await okx.instruments({ instType: "SPOT", instId: SPOT })).value[0]!;
    const perp = (await okx.instruments({ instType: "SWAP", instId: PERP })).value[0]!;
    const spotBook = (await okx.books(SPOT, { sz: 5 })).value;
    const perpBook = (await okx.books(PERP, { sz: 5 })).value;
    const mark = (await okx.markPrice(PERP)).value;
    const funding = (await okx.fundingRate(PERP)).value;
    const history = (await okx.fundingRateHistory(PERP, { limit: 3 })).value;
    return { spot, perp, spotBook, perpBook, mark, funding, history };
  }

  test("D18: the snapshot built from real keyless reads is accepted by the strict parser of the evaluator", async () => {
    const snapshot = buildDerivativesSnapshot(await readAll());
    expect(Object.keys(snapshot).sort()).toEqual(["books", "funding", "mark", "perp", "spot"]);
    const raw = buildDerivativesInput(snapshot, { carry: { contracts: "1" }, leverages: [1, 2, 3], holdingSettlements: 3 });
    const parsed = parseDerivativesInput(raw);
    expect(parsed.sourceClaim).toBe("operator_claimed");
    expect(parsed.snapshot.perp.ctVal).toEqual({ n: 1n, d: 100n });
    expect(parsed.snapshot.perp.maxLeverage).toBe(100);
    expect(parsed.snapshot.spot.lotSz).toEqual({ n: 1n, d: 100_000_000n });
    expect(parsed.snapshot.funding.history.map((entry) => entry.fundingTimeMs)).toEqual([1791648000000, 1791676800000, 1791705600000]);
    expect(parsed.snapshot.funding.fundingTimeMs).toBe(1791734400000);
    expect(parsed.snapshot.books.perp.bids[0]!.price).toEqual({ n: 82948n, d: 1n });
  });

  test("D18: fees, maintenance margin and account access are NOT invented: they stay unknown and the evaluator says unavailable because of them", async () => {
    const raw = buildDerivativesInput(buildDerivativesSnapshot(await readAll()), { carry: { contracts: "1" }, leverages: [1, 2], holdingSettlements: 3 });
    expect((raw.snapshot as Record<string, unknown>).fees).toBeUndefined();
    expect((raw.snapshot as Record<string, unknown>).maintenanceMarginRate).toBeUndefined();
    expect((raw.snapshot as Record<string, unknown>).access).toBeUndefined();
    const adapter = createFixtureAdapter(raw, "imported");
    const report = buildDerivativesReport(adapter, 1791715100000);
    expect(report.unknownInputs).toEqual([
      "access.derivatives",
      "fees.perp.makerCost",
      "fees.perp.takerCost",
      "fees.spot.makerCost",
      "fees.spot.takerCost",
      "maintenanceMarginRate",
    ]);
    expect(report.carry.summary).toEqual({ eligible: [], ineligible: [], unavailable: [1, 2] });
    expect(report.carry.reasons).toEqual(expect.arrayContaining(["unknown:fee_perp_taker", "unknown:fee_spot_taker", "unknown:maintenance_margin_rate", "unknown:access_derivatives"]));
    expect(report.liveQualified).toBe(false);
    expect(report.financiallyAuthorized).toBe(false);
  });

  test("D18: history is sorted from oldest to newest, keeps only settled rows with a realized rate, and a missing piece is named", async () => {
    const parts = await readAll();
    const shuffled = [parts.history[1]!, parts.history[2]!, { ...parts.history[0]!, realizedRate: null }, { fundingTimeMs: parts.funding.tsMs! + 1, fundingRate: "0.0001", realizedRate: "0.0001", method: null }];
    const snapshot = buildDerivativesSnapshot({ ...parts, history: shuffled }) as { funding: { history: Array<{ fundingTimeMs: number }> } };
    expect(snapshot.funding.history.map((entry) => entry.fundingTimeMs)).toEqual([1791648000000, 1791676800000]);

    for (const [patch, piece] of [
      [{ perp: { ...parts.perp, ctVal: null } }, "perp.ctVal"],
      [{ spot: { ...parts.spot, tickSz: null } }, "spot.tickSz"],
      [{ mark: { ...parts.mark, markPx: null } }, "mark.markPx"],
      [{ funding: { ...parts.funding, fundingRate: null } }, "funding.fundingRate"],
      [{ funding: { ...parts.funding, nextFundingTimeMs: null } }, "funding.nextFundingTimeMs"],
      [{ perpBook: { ...parts.perpBook, tsMs: null } }, "books.perp.tsMs"],
      [{ perp: { ...parts.perp, ctType: null } }, "perp.ctType"],
    ] as Array<[object, string]>) {
      try {
        buildDerivativesSnapshot({ ...parts, ...patch } as never);
        throw new Error("deveria rejeitar");
      } catch (error) {
        expect((error as OnchainosError).kind).toBe("schema");
        expect((error as Error).message).toContain(piece);
      }
    }
  });
});
