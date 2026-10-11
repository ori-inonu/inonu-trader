import { describe, expect, test } from "bun:test";
import { parseCaptureLine, parseCaptureText, serializeCapture, serializeCaptureRecord, type CaptureRecord } from "../lab/capture-format.ts";
import { CaptureError, type CaptureCursors, type EpochContext } from "./capture-types.ts";
import { createOnchainosCaptureSource, createPublicOkxCaptureSource, resolveOnchainosConfig, resolvePublicOkxConfig, type OnchainosSourceInput, type PublicOkxSourceInput } from "./capture-sources.ts";
import { envelope, makeStack, makeClock, makeFakeFetch, type FakeCall, type FakeReply } from "./fakes.ts";
import { FIXTURES } from "./fixtures.ts";
import { createMarketPriceClient } from "./market-price.ts";
import { createPublicOkxClient, createPublicOkxHttp } from "./public-okx.ts";

// 2026-10-11T10:40:00Z: after the real keyless reads of the fixtures, so every closed candle of them is closed here too.
const NOW_MS = 1_791_715_200_000;

const ROUTES: Record<string, keyof typeof FIXTURES> = {
  "/api/v5/market/ticker|BTC-USDT": "public.ticker.spot/live",
  "/api/v5/market/ticker|BTC-USDT-SWAP": "public.ticker.swap/live",
  "/api/v5/market/books|BTC-USDT": "public.books.spot/live",
  "/api/v5/market/books|BTC-USDT-SWAP": "public.books.swap/live",
  "/api/v5/market/candles|BTC-USDT": "public.candles.spot/live",
  "/api/v5/market/candles|BTC-USDT-SWAP": "public.candles.swap/live",
  "/api/v5/public/mark-price|BTC-USDT-SWAP": "public.mark-price/live",
  "/api/v5/public/funding-rate|BTC-USDT-SWAP": "public.funding-rate/live",
  "/api/v5/public/funding-rate-history|BTC-USDT-SWAP": "public.funding-rate-history/live",
  "/api/v5/public/open-interest|BTC-USDT-SWAP": "public.open-interest/live",
};

type Override = (call: FakeCall) => FakeReply | undefined;

function liveReply(call: FakeCall, override?: Override): FakeReply {
  const replaced = override?.(call);
  if (replaced !== undefined) return replaced;
  const instId = new URLSearchParams(call.query).get("instId") ?? "";
  const key = ROUTES[`${call.path}|${instId}`];
  if (key === undefined) return { status: 404, body: "sem rota de teste" };
  return { body: FIXTURES[key].body };
}

function noCursors(over: Partial<{ candle: number | null; settled: number | null }> = {}): CaptureCursors {
  return { lastCandleStartMs: () => over.candle ?? null, lastSettledFundingMs: () => over.settled ?? null };
}

function context(patch: Partial<EpochContext> = {}): EpochContext {
  return { epochId: "e1791714600000", gridMs: NOW_MS, epochMs: 60_000, firstEpoch: true, cursors: noCursors(), checkDeadline: () => undefined, ...patch };
}

function publicSetup(input: PublicOkxSourceInput = {}, override?: Override) {
  const clock = makeClock(NOW_MS);
  const fake = makeFakeFetch((call) => liveReply(call, override), clock);
  const http = createPublicOkxHttp({ fetch: fake.fetch, now: clock.now, sleep: clock.sleep, allowNetwork: true, requestsPerSecond: 5, burst: 5 });
  const source = createPublicOkxCaptureSource(createPublicOkxClient(http), resolvePublicOkxConfig(input));
  return { clock, fake, http, source };
}

function lines(records: readonly CaptureRecord[]): string[] {
  return records.map((record) => serializeCaptureRecord(record));
}

const ofKind = (records: readonly CaptureRecord[], kind: string, inst?: string) => records.filter((record) => record.kind === kind && (inst === undefined || record.inst === inst));

describe("capture sources: configuration", () => {
  test("D20: the public source has sane defaults and validates every field", () => {
    const config = resolvePublicOkxConfig({});
    expect(config.instruments).toEqual(["BTC-USDT", "BTC-USDT-SWAP"]);
    expect(config.kinds).toEqual(["ticker", "funding", "mark", "candle", "book", "oi"]);
    expect(config.bar).toBe("1m");
    expect(config.barMs).toBe(60_000);
    expect(config.bookDepth).toBe(10);
    expect(config.candlesLimit).toBe(100);
    expect(config.candleSafetyMs).toBe(2_000);
    expect(config.fundingHistoryLimit).toBe(3);
    const bad: PublicOkxSourceInput[] = [
      { instruments: [] },
      { instruments: ["btc-usdt"] },
      { instruments: ["BTC-USDT", "BTC-USDT"] },
      { instruments: ["A-B", "C-D", "E-F", "G-H", "I-J"] },
      { kinds: [] },
      { kinds: ["ticker", "trade" as never] },
      { kinds: ["ticker", "ticker"] },
      { bar: "1M" },
      { bar: "1s" },
      { bar: "7m" as never },
      { bookDepth: 0 },
      { bookDepth: 51 },
      { candlesLimit: 301 },
      { candlesLimit: 0 },
      { candleSafetyMs: -1 },
      { candleSafetyMs: 60_001 },
      { fundingHistoryLimit: 1 },
      { fundingHistoryLimit: 101 },
    ];
    for (const input of bad) expect(() => resolvePublicOkxConfig(input), JSON.stringify(input)).toThrow(/inválid|deve|aceita|repetid|não/i);
  });

  test("D20: the onchainos source validates aliases, identities, kinds and requires a bar of known duration", () => {
    const token = { alias: "WETH-USDC", chainIndex: "1", tokenContractAddress: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2" };
    const config = resolveOnchainosConfig({ tokens: [token] });
    expect(config.tokens).toEqual([{ alias: "WETH-USDC", chainIndex: "1", tokenContractAddress: "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2" }]);
    expect(config.kinds).toEqual(["mark", "candle"]);
    expect(config.bar).toBe("1m");
    expect(config.barMs).toBe(60_000);
    const bad: OnchainosSourceInput[] = [
      { tokens: [] },
      { tokens: [{ ...token, alias: "weth" }] },
      { tokens: [{ ...token, alias: "WETH" }] },
      { tokens: [{ ...token, alias: "A".repeat(49) + "-B" }] },
      { tokens: [{ ...token, chainIndex: "x" }] },
      { tokens: [{ ...token, tokenContractAddress: "nope" }] },
      { tokens: [token, { ...token, alias: "OTHER-USDC" }] },
      { tokens: [token, { ...token, tokenContractAddress: "0x0000000000000000000000000000000000000001" }] },
      { tokens: Array.from({ length: 9 }, (_, index) => ({ alias: `T${index}-USDC`, chainIndex: "1", tokenContractAddress: `0x${index.toString(16).padStart(40, "0")}` })) },
      { tokens: [token], kinds: ["ticker" as never] },
      { tokens: [token], bar: "1M" },
      { tokens: [token], candlesLimit: 300 },
    ];
    for (const input of bad) expect(() => resolveOnchainosConfig(input), JSON.stringify(input)).toThrow(/inválid|deve|aceita|repetid|não|duração/i);
  });
});

describe("capture sources: the plan", () => {
  test("D22: the public plan lists every call of one epoch with its tier and frequency, spot without derivatives calls", () => {
    const plan = publicSetup().source.plan();
    const summary = plan.map((call) => `${call.endpointId}:${call.params.instId}:${call.frequency}`);
    expect(summary).toEqual([
      "public.ticker:BTC-USDT:every_epoch",
      "public.books:BTC-USDT:every_epoch",
      "public.candles:BTC-USDT:every_epoch",
      "public.ticker:BTC-USDT-SWAP:every_epoch",
      "public.mark-price:BTC-USDT-SWAP:every_epoch",
      "public.funding-rate:BTC-USDT-SWAP:every_epoch",
      "public.funding-rate-history:BTC-USDT-SWAP:after_settlement",
      "public.open-interest:BTC-USDT-SWAP:every_epoch",
      "public.books:BTC-USDT-SWAP:every_epoch",
      "public.candles:BTC-USDT-SWAP:every_epoch",
    ]);
    for (const call of plan) {
      expect(call.tier).toBe("public");
      expect(call.method).toBe("GET");
      expect(call.path.startsWith("/api/v5/")).toBe(true);
    }
  });

  test("D22: a kind filter removes the calls it does not need", () => {
    const plan = publicSetup({ instruments: ["BTC-USDT-SWAP"], kinds: ["ticker", "funding", "mark"] }).source.plan();
    expect(plan.map((call) => call.endpointId)).toEqual(["public.ticker", "public.mark-price", "public.funding-rate", "public.funding-rate-history"]);
  });
});

describe("capture sources: public-okx epoch over real keyless answers", () => {
  test("D20: one epoch produces every kind, valid for the lab format, stamped with the local receipt and never with a provider time", async () => {
    const { clock, source } = publicSetup();
    const collection = await source.collect(context());
    for (const record of collection.records) expect(() => parseCaptureLine(serializeCaptureRecord(record)), serializeCaptureRecord(record)).not.toThrow();
    const sorted = [...collection.records].sort((a, b) => a.t - b.t);
    expect(() => parseCaptureText(serializeCapture(sorted))).not.toThrow();
    const kinds = collection.records.map((record) => `${record.kind}:${record.inst}`).sort();
    expect(kinds).toEqual(
      [
        "ticker:BTC-USDT",
        "book:BTC-USDT",
        "candle:BTC-USDT",
        "candle:BTC-USDT",
        "ticker:BTC-USDT-SWAP",
        "mark:BTC-USDT-SWAP",
        "funding:BTC-USDT-SWAP",
        "funding:BTC-USDT-SWAP",
        "funding:BTC-USDT-SWAP",
        "oi:BTC-USDT-SWAP",
        "book:BTC-USDT-SWAP",
        "candle:BTC-USDT-SWAP",
        "candle:BTC-USDT-SWAP",
      ].sort(),
    );
    // every t is a reading of the local clock between the start and now, never a provider timestamp (those are ~hours earlier)
    for (const record of collection.records) {
      if (record.kind === "candle") continue;
      expect(record.t).toBeGreaterThanOrEqual(NOW_MS);
      expect(record.t).toBeLessThanOrEqual(clock.now());
    }
  });

  test("D20: values are copied from the exact text: ticker, mark, open interest and the book levels", async () => {
    const { source } = publicSetup();
    const { records } = await source.collect(context());
    const ticker = ofKind(records, "ticker", "BTC-USDT")[0]!;
    expect(ticker.data).toEqual({ bid: 82983.1, ask: 82983.2, last: 82983.2, bidSize: 0.2529884, askSize: 0.82990421, vol24h: 1607.11433251 });
    expect(ofKind(records, "mark")[0]!.data).toEqual({ price: 82970.7 });
    expect(ofKind(records, "oi")[0]!.data).toEqual({ oi: 3003402.5300000128, oiUsd: 2491947106.3612506202624 });
    const book = ofKind(records, "book", "BTC-USDT-SWAP")[0]! as CaptureRecord & { data: { bids: number[][]; asks: number[][] } };
    expect(book.data.asks[0]).toEqual([82948.1, 890.22]);
    expect(book.data.bids[0]).toEqual([82948, 298.2]);
    expect(book.data.asks.length).toBe(5);
  });

  test("D20: only closed candles are recorded, the open one never is, and the volume is the first volume column", async () => {
    const { source } = publicSetup();
    const { records } = await source.collect(context());
    const swap = ofKind(records, "candle", "BTC-USDT-SWAP");
    expect(swap.map((record) => (record.data as { startMs: number }).startMs).sort()).toEqual([1791714360000, 1791714420000]);
    expect(swap.every((record) => record.t >= (record.data as { startMs: number; barMs: number }).startMs + (record.data as { barMs: number }).barMs)).toBe(true);
    expect(swap.find((record) => (record.data as { startMs: number }).startMs === 1791714420000)!.data).toEqual({ startMs: 1791714420000, barMs: 60_000, open: 82970.8, high: 82970.9, low: 82970.8, close: 82970.8, volume: 241.48 });
    // the candle that opened at 1791714480000 has confirm 0 and is not here
    expect(swap.some((record) => (record.data as { startMs: number }).startMs === 1791714480000)).toBe(false);
  });

  test("D20: a candle that the provider confirms but the local clock does not yet consider closed is held back and reported", async () => {
    const { source } = publicSetup({ candleSafetyMs: 2_000 }, (call) => {
      if (call.path !== "/api/v5/market/candles") return undefined;
      const start = NOW_MS - 60_000 + 1_000;
      return { body: envelope([[String(start), "1", "2", "1", "1.5", "10", "1", "15", "1"], [String(start - 60_000), "1", "2", "1", "1.5", "10", "1", "15", "1"]]) };
    });
    const { records, skipped } = await source.collect(context());
    const swap = ofKind(records, "candle", "BTC-USDT-SWAP");
    expect(swap.length).toBe(1);
    expect((swap[0]!.data as { startMs: number }).startMs).toBe(NOW_MS - 60_000 + 1_000 - 60_000);
    expect(skipped.some((note) => note.kind === "candle" && note.inst === "BTC-USDT-SWAP" && /ainda não fechou/.test(note.reason))).toBe(true);
  });

  test("D20: the candle cursor drops what was already recorded and a gap larger than one bar is noted, not filled", async () => {
    const { source } = publicSetup({ instruments: ["BTC-USDT-SWAP"], kinds: ["candle"] });
    const nothingNew = await source.collect(context({ firstEpoch: false, cursors: noCursors({ candle: 1791714420000 }) }));
    expect(nothingNew.records).toEqual([]);
    const gap = await publicSetup({ instruments: ["BTC-USDT-SWAP"], kinds: ["candle"] }).source.collect(context({ firstEpoch: false, cursors: noCursors({ candle: 1791714240000 }) }));
    expect(gap.records.length).toBe(2);
    expect(gap.notes.some((note) => /lacuna/.test(note) && /BTC-USDT-SWAP/.test(note))).toBe(true);
    const contiguous = await publicSetup({ instruments: ["BTC-USDT-SWAP"], kinds: ["candle"] }).source.collect(context({ firstEpoch: false, cursors: noCursors({ candle: 1791714300000 }) }));
    expect(contiguous.records.length).toBe(2);
    expect(contiguous.notes.length).toBe(0);
  });

  test("D20: later epochs ask for just enough candles, the first one for the configured amount", async () => {
    const first = publicSetup({ instruments: ["BTC-USDT-SWAP"], kinds: ["candle"], candlesLimit: 120 });
    await first.source.collect(context());
    expect(first.fake.calls[0]!.query).toContain("limit=120");
    const later = publicSetup({ instruments: ["BTC-USDT-SWAP"], kinds: ["candle"], candlesLimit: 120 });
    await later.source.collect(context({ firstEpoch: false, epochMs: 300_000, cursors: noCursors({ candle: 1 }) }));
    expect(later.fake.calls[0]!.query).toContain("limit=8");
  });

  test("D20: funding records an announcement before its settlement and the settled values after it, with intervals derived from the history", async () => {
    const { source } = publicSetup({ instruments: ["BTC-USDT-SWAP"], kinds: ["funding"] });
    const { records, skipped } = await source.collect(context());
    const funding = ofKind(records, "funding");
    const announcement = funding.find((record) => record.t < (record.data as { settleMs: number }).settleMs)!;
    expect(announcement.data).toEqual({ rate: -0.0000148689400726, settleMs: 1791734400000, intervalMs: 28_800_000 });
    const settled = funding.filter((record) => record.t >= (record.data as { settleMs: number }).settleMs).sort((a, b) => (a.data as { settleMs: number }).settleMs - (b.data as { settleMs: number }).settleMs);
    expect(settled.map((record) => record.data)).toEqual([
      { rate: -0.000021973068193, settleMs: 1791676800000, intervalMs: 28_800_000 },
      { rate: -0.0000154175824147, settleMs: 1791705600000, intervalMs: 28_800_000 },
    ]);
    // the oldest settlement of the page has no earlier one to derive its interval from: it is not written, and that is said
    expect(skipped.some((note) => note.kind === "funding" && /intervalo/.test(note.reason) && /1791648000000/.test(note.reason))).toBe(true);
  });

  test("D20: the settled history is not requested again when the previous settlement is already recorded", async () => {
    const { fake, source } = publicSetup({ instruments: ["BTC-USDT-SWAP"], kinds: ["funding"] });
    const { records } = await source.collect(context({ firstEpoch: false, cursors: noCursors({ settled: 1791705600000 }) }));
    expect(fake.calls.map((call) => call.path)).toEqual(["/api/v5/public/funding-rate"]);
    expect(records.length).toBe(1);
    const stale = publicSetup({ instruments: ["BTC-USDT-SWAP"], kinds: ["funding"] });
    await stale.source.collect(context({ firstEpoch: false, cursors: noCursors({ settled: 1791676800000 }) }));
    expect(stale.fake.calls.map((call) => call.path)).toEqual(["/api/v5/public/funding-rate", "/api/v5/public/funding-rate-history"]);
  });

  test("D20: an interval the lab format cannot carry (6 hours) and an announcement after its settlement are skipped with a reason, not invented", async () => {
    const sixHours = publicSetup({ instruments: ["BTC-USDT-SWAP"], kinds: ["funding"] }, (call) => {
      if (call.path === "/api/v5/public/funding-rate") {
        return { body: envelope([{ instId: "BTC-USDT-SWAP", method: "current_period", fundingRate: "0.0001", fundingTime: String(NOW_MS + 3_600_000), nextFundingTime: String(NOW_MS + 3_600_000 + 6 * 3_600_000), prevFundingTime: "", ts: String(NOW_MS) }]) };
      }
      return { body: envelope([]) };
    });
    const six = await sixHours.source.collect(context());
    expect(six.records).toEqual([]);
    expect(six.skipped.some((note) => note.kind === "funding" && /intervalo/.test(note.reason))).toBe(true);

    const late = publicSetup({ instruments: ["BTC-USDT-SWAP"], kinds: ["funding"] }, (call) => {
      if (call.path === "/api/v5/public/funding-rate") {
        return { body: envelope([{ instId: "BTC-USDT-SWAP", method: "current_period", fundingRate: "0.0001", fundingTime: String(NOW_MS - 1_000), nextFundingTime: String(NOW_MS - 1_000 + 28_800_000), prevFundingTime: String(NOW_MS - 1_000 - 28_800_000), ts: String(NOW_MS) }]) };
      }
      return { body: envelope([]) };
    });
    const afterwards = await late.source.collect(context({ cursors: noCursors({ settled: NOW_MS }) }));
    expect(afterwards.records).toEqual([]);
    expect(afterwards.skipped.some((note) => /depois da liquidação/.test(note.reason))).toBe(true);
  });

  test("D20: spot instruments get no mark, funding or open interest calls", async () => {
    const { fake, source } = publicSetup({ instruments: ["BTC-USDT"] });
    await source.collect(context());
    expect(fake.calls.map((call) => call.path)).toEqual(["/api/v5/market/ticker", "/api/v5/market/books", "/api/v5/market/candles"]);
  });

  test("D21: a malformed provider answer stops the epoch with a clear error naming the instrument and the field", async () => {
    const cases: Array<[Override, RegExp]> = [
      [(call) => (call.path === "/api/v5/market/ticker" ? { body: envelope([{ instId: "BTC-USDT-SWAP", last: "1", askPx: "2", bidPx: "", ts: "1" }]) } : undefined), /ticker.*BTC-USDT-SWAP.*bid/is],
      [(call) => (call.path === "/api/v5/market/books" ? { body: envelope([{ asks: [["10", "1", "0", "1"]], bids: [["11", "1", "0", "1"]], ts: "1" }]) } : undefined), /livro.*cruzado/is],
      [(call) => (call.path === "/api/v5/market/candles" ? { body: envelope([["1791714420000", "1", "2", "1", "", "10", "1", "15", "1"]]) } : undefined), /vela.*close/is],
      [(call) => (call.path === "/api/v5/market/candles" ? { body: envelope([["1791714420000", "1", "2", "1", "1.5", "10", "1", "15", "1"], ["1791714420000", "1", "3", "1", "1.7", "10", "1", "15", "1"]]) } : undefined), /velas repetidas/is],
      [(call) => (call.path === "/api/v5/public/mark-price" ? { body: envelope([{ instId: "BTC-USDT-SWAP", markPx: "", ts: "1" }]) } : undefined), /mark.*price/is],
      [(call) => (call.path === "/api/v5/public/open-interest" ? { body: envelope([{ instId: "BTC-USDT-SWAP", oi: "abc", ts: "1" }]) } : undefined), /oi/is],
    ];
    for (const [override, message] of cases) {
      const { source } = publicSetup({ instruments: ["BTC-USDT-SWAP"] }, override);
      try {
        await source.collect(context());
        throw new Error("deveria parar");
      } catch (error) {
        expect(error).toBeInstanceOf(CaptureError);
        expect((error as CaptureError).kind).toBe("malformed_record");
        expect((error as Error).message).toMatch(message);
      }
    }
  });

  test("D21: the deadline is checked before every read and ends the epoch without further calls", async () => {
    const { fake, source } = publicSetup();
    let allowed = 2;
    await expect(
      source.collect(
        context({
          checkDeadline: () => {
            if (allowed <= 0) throw new CaptureError("deadline", "prazo");
            allowed -= 1;
          },
        }),
      ),
    ).rejects.toMatchObject({ kind: "deadline" });
    expect(fake.calls.length).toBe(2);
  });
});

describe("capture sources: onchainos", () => {
  const TOKEN = { alias: "WETH-USDC", chainIndex: "1", tokenContractAddress: "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2" };
  const candle = (startMs: number, confirm = "1", close = "1.5") => [String(startMs), "1", "2", "0.5", close, "10", "15", confirm];

  function onchainosSetup(input: Partial<OnchainosSourceInput>, script: (call: FakeCall) => FakeReply, extra: Record<string, unknown> = {}) {
    const stack = makeStack(script, extra);
    stack.clock.set(NOW_MS);
    const market = createMarketPriceClient(stack.http);
    const source = createOnchainosCaptureSource(market, resolveOnchainosConfig({ tokens: [TOKEN], ...input }));
    return { ...stack, source };
  }

  const priceBody = (price: string, address = TOKEN.tokenContractAddress) => envelope([{ chainIndex: "1", tokenContractAddress: address, time: String(NOW_MS - 5_000), price }]);

  test("D22: the plan lists candles per token plus one batch of prices and one of index prices, with their tiers", () => {
    const { source } = onchainosSetup({ tokens: [TOKEN, { alias: "WBTC-USDC", chainIndex: "1", tokenContractAddress: "0x2260fac5e5542a773aa44fbcfedf7c193bc2c599" }] }, () => ({ body: envelope([]) }));
    const plan = source.plan();
    expect(plan.map((call) => `${call.endpointId}:${call.tier}`)).toEqual(["market.price.candles:basic", "market.price.candles:basic", "market.price.price:basic", "market.index.current-price:free"]);
    expect(plan.map((call) => call.method)).toEqual(["GET", "GET", "POST", "POST"]);
  });

  test("D20: candles become candle records under the alias, only closed and safe ones, and the mark carries the price and the index", async () => {
    const { source } = onchainosSetup({}, (call) => {
      if (call.path === "/api/v6/dex/market/candles") return { body: envelope([candle(NOW_MS - 60_000), candle(NOW_MS - 180_000), candle(NOW_MS - 120_000, "0")]) };
      if (call.path === "/api/v6/dex/market/price") return { body: priceBody("3201.5") };
      return { body: priceBody("3200.25") };
    });
    const { records } = await source.collect(context());
    const candles = ofKind(records, "candle", "WETH-USDC");
    expect(candles.map((record) => (record.data as { startMs: number }).startMs).sort()).toEqual([NOW_MS - 180_000]);
    expect(candles[0]!.data).toEqual({ startMs: NOW_MS - 180_000, barMs: 60_000, open: 1, high: 2, low: 0.5, close: 1.5, volume: 10 });
    const mark = ofKind(records, "mark", "WETH-USDC");
    expect(mark.length).toBe(1);
    expect(mark[0]!.data).toEqual({ price: 3201.5, index: 3200.25 });
    for (const record of records) expect(() => parseCaptureLine(serializeCaptureRecord(record))).not.toThrow();
  });

  test("D20: the mark takes the later of the two receipts as its t, so it is never stamped before the index was known", async () => {
    const { source, clock } = onchainosSetup({ kinds: ["mark"] }, (call) => (call.path === "/api/v6/dex/market/price" ? { body: priceBody("3201.5") } : { body: priceBody("3200.25") }), { requestsPerSecond: 1, burst: 1 });
    const { records } = await source.collect(context());
    expect(records.length).toBe(1);
    expect(clock.sleeps).toEqual([1000]);
    expect(records[0]!.t).toBe(NOW_MS + 1000);
    expect(records[0]!.t).toBe(clock.now());
  });

  test("D9: a token without a price has NO mark record (never a zero), the skip is reported, and a missing index just omits the index", async () => {
    const noPrice = onchainosSetup({ kinds: ["mark"] }, (call) => (call.path === "/api/v6/dex/market/price" ? { body: envelope([{ chainIndex: "1", tokenContractAddress: TOKEN.tokenContractAddress, time: "1", price: "0" }]) } : { body: priceBody("3200.25") }));
    const first = await noPrice.source.collect(context());
    expect(first.records).toEqual([]);
    expect(first.skipped).toEqual([{ kind: "mark", inst: "WETH-USDC", reason: "preço desconhecido: nenhum registro de mark foi escrito" }]);

    const noIndex = onchainosSetup({ kinds: ["mark"] }, (call) => (call.path === "/api/v6/dex/market/price" ? { body: priceBody("3201.5") } : { body: envelope([]) }));
    const second = await noIndex.source.collect(context());
    expect(second.records[0]!.data).toEqual({ price: 3201.5 });
  });

  test("D21: the documented duplicate timestamp with different content is refused, not silently picked", async () => {
    const { source } = onchainosSetup({ kinds: ["candle"] }, () => ({ body: FIXTURES["market.price.candles/doc"].body }));
    await expect(source.collect(context())).rejects.toMatchObject({ kind: "malformed_record" });
  });

  test("D21: an unusable OHLC of a closed candle stops the epoch", async () => {
    const { source } = onchainosSetup({ kinds: ["candle"] }, () => ({ body: envelope([candle(NOW_MS - 180_000, "1", "")]) }));
    await expect(source.collect(context())).rejects.toMatchObject({ kind: "malformed_record" });
  });

  test("D20: nothing new when the cursor is ahead, and the epoch asks for just enough candles", async () => {
    const { source, fake } = onchainosSetup({ kinds: ["candle"], candlesLimit: 50 }, () => ({ body: envelope([candle(NOW_MS - 180_000)]) }));
    const result = await source.collect(context({ firstEpoch: false, epochMs: 60_000, cursors: noCursors({ candle: NOW_MS - 180_000 }) }));
    expect(result.records).toEqual([]);
    expect(fake.calls[0]!.query).toContain("limit=4");
  });
});
