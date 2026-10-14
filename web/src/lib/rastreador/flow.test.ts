// RAS-3, DAT-1: the pressure of the flow of the visible rows is measured from the exchange's own public trades (one free read per
// row, spaced to respect the limit), never estimated. A failing row does not stop the others, a malformed trade is dropped and
// counted, and a row with no trade in the last minute is "no measurement", not zero. origin: synthetic_fixture, tests only.
import { describe, expect, test } from "bun:test";
import { MAX_ROWS_PER_READ, createFlowReader, parseTrades } from "./flow";

const NOW = 1_800_000_060_000;

const body = (data: unknown[], code = "0") => JSON.stringify({ code, msg: "", data });
const trade = (secondsAgo: number, sz: string, side: string, px = "100") => ({ instId: "X", tradeId: String(secondsAgo), px, sz, side, ts: String(NOW - secondsAgo * 1000) });

function harness(answers: Record<string, string | (() => Promise<string>) | Error>, options: { status?: number } = {}) {
  const urls: string[] = [];
  const waits: number[] = [];
  const reader = createFlowReader({
    fetch: async (url, init) => {
      urls.push(url);
      if (init?.signal?.aborted) throw new Error("aborted");
      const id = new URL(url).searchParams.get("instId")!;
      const a = answers[id];
      if (a instanceof Error) throw a;
      const text = typeof a === "function" ? await a() : (a ?? body([]));
      return { ok: (options.status ?? 200) < 400, status: options.status ?? 200, text: async () => text };
    },
    now: () => NOW,
    wait: async (ms) => {
      waits.push(ms);
    },
    minIntervalMs: 150,
  });
  return { reader, urls, waits };
}

describe("parseTrades", () => {
  test("reads the documented fields and nothing else", () => {
    const { trades, rejected } = parseTrades(JSON.parse(body([trade(5, "2.5", "buy"), trade(9, "1", "sell")])).data);
    expect(trades).toEqual([{ ts: NOW - 5000, sz: 2.5, side: "buy" }, { ts: NOW - 9000, sz: 1, side: "sell" }]);
    expect(rejected).toBe(0);
  });

  test("a row with a bad number, a bad side or no timestamp is dropped and counted", () => {
    const { trades, rejected } = parseTrades([trade(5, "x", "buy"), trade(5, "1", "up"), { px: "1", sz: "1", side: "buy" }, trade(5, "-3", "buy"), null, "str", trade(4, "2", "sell")]);
    expect(trades).toHaveLength(1);
    expect(rejected).toBe(6);
  });

  test("not a list is no trades", () => {
    expect(parseTrades(null)).toEqual({ trades: [], rejected: 0 });
    expect(parseTrades({})).toEqual({ trades: [], rejected: 0 });
  });
});

describe("reading the pressure of several rows", () => {
  test("one read per row with the limit in the query, spaced by the minimum interval", async () => {
    const { reader, urls, waits } = harness({ "BTC-USDT": body([trade(5, "30", "buy"), trade(10, "10", "sell")]), "ETH-USDT": body([trade(3, "4", "sell")]) });
    const out = await reader.pressure(["BTC-USDT", "ETH-USDT"]);
    expect(urls).toEqual([
      "https://www.okx.com/api/v5/market/trades?instId=BTC-USDT&limit=500",
      "https://www.okx.com/api/v5/market/trades?instId=ETH-USDT&limit=500",
    ]);
    expect(waits).toEqual([150]); // between the two reads, not before the first
    expect(out.get("BTC-USDT")).toMatchObject({ ok: true, atMs: NOW, pressure: { negocios: 2 } });
    const btc = out.get("BTC-USDT");
    expect(btc && btc.ok && btc.pressure?.valor).toBeCloseTo(0.5, 12);
    const eth = out.get("ETH-USDT");
    expect(eth && eth.ok && eth.pressure?.valor).toBe(-1);
  });

  test("a row with no trade in the last minute is a read that found nothing, not a zero", async () => {
    const { reader } = harness({ "BTC-USDT": body([trade(300, "5", "buy")]), "ETH-USDT": body([]) });
    const out = await reader.pressure(["BTC-USDT", "ETH-USDT"]);
    expect(out.get("BTC-USDT")).toMatchObject({ ok: true, pressure: null });
    expect(out.get("ETH-USDT")).toMatchObject({ ok: true, pressure: null });
  });

  test("a failing row says why and does not stop the others", async () => {
    const { reader } = harness({ "A-USDT": new Error("offline"), "B-USDT": body([], "50011"), "C-USDT": "not json", "D-USDT": body([trade(2, "1", "buy")]) });
    const out = await reader.pressure(["A-USDT", "B-USDT", "C-USDT", "D-USDT"]);
    expect(out.get("A-USDT")).toEqual({ ok: false, reason: "sem_conexao" });
    expect(out.get("B-USDT")).toEqual({ ok: false, reason: "okx_recusou" });
    expect(out.get("C-USDT")).toEqual({ ok: false, reason: "resposta_invalida" });
    expect(out.get("D-USDT")).toMatchObject({ ok: true });
  });

  test("an HTTP error is a refusal of the exchange", async () => {
    const { reader } = harness({ "A-USDT": "x" }, { status: 429 });
    expect((await reader.pressure(["A-USDT"])).get("A-USDT")).toEqual({ ok: false, reason: "okx_recusou" });
  });

  test("an id that is not an instrument never leaves the browser, and the list is bounded", async () => {
    const { reader, urls } = harness({});
    const out = await reader.pressure(["bad id", "BTC-USDT-250627", "BTC-USDT"]);
    expect(out.get("bad id")).toEqual({ ok: false, reason: "alvo_invalido" });
    expect(urls.some((u) => u.includes("bad"))).toBe(false);
    const many = Array.from({ length: MAX_ROWS_PER_READ + 15 }, (_, i) => `T${i}-USDT`);
    const big = harness({});
    await big.reader.pressure(many);
    expect(big.urls).toHaveLength(MAX_ROWS_PER_READ);
  });

  test("an aborted read stops at once and returns what it already had", async () => {
    const controller = new AbortController();
    let calls = 0;
    const reader = createFlowReader({
      fetch: async () => {
        calls += 1;
        controller.abort();
        return { ok: true, status: 200, text: async () => body([trade(1, "1", "buy")]) };
      },
      now: () => NOW,
      wait: async () => {},
      minIntervalMs: 0,
    });
    const out = await reader.pressure(["A-USDT", "B-USDT", "C-USDT"], controller.signal);
    expect(calls).toBe(1);
    expect(out.size).toBe(1);
  });

  test("the reader asks nobody but the exchange's public trades, and no header", async () => {
    const { reader, urls } = harness({ "BTC-USDT": body([]) });
    await reader.pressure(["BTC-USDT"]);
    expect(urls.every((u) => u.startsWith("https://www.okx.com/api/v5/market/trades?"))).toBe(true);
  });
});
