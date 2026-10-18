import { describe, expect, test } from "bun:test";
import type { EndpointRef, GetPort, HttpResult, QueryInput, ReadMeta } from "../onchainos/http";
import { auditCandles } from "../quant/candles";
import { QuantHistory } from "./quant-history";

const BAR = 900_000;
const NOW = 1_800_000_000_000;

/** A synthetic exchange: bars every 15 minutes up to `lastStart`, served newest first like OKX. */
function exchange(options: { lastStart: number; firstStart: number; now?: number; calls?: { path: string; query: QueryInput | undefined }[] }): GetPort {
  const meta = (endpoint: EndpointRef): ReadMeta => ({ source: "okx-public-v5", endpoint: endpoint.path, tier: "public", httpStatus: 200, attempts: 1, requestedAtMs: NOW, receivedAtMs: NOW });
  return {
    async get(endpoint: EndpointRef, query?: QueryInput): Promise<HttpResult> {
      options.calls?.push({ path: endpoint.path, query });
      const limit = Number(query?.limit ?? 100);
      const history = endpoint.path.endsWith("history-candles");
      const after = query?.after === undefined ? Infinity : Number(query.after);
      const rows: string[][] = [];
      for (let start = options.lastStart; start >= options.firstStart && rows.length < limit; start -= BAR) {
        if (history && !(start < after)) continue;
        const close = 100 + Math.sin(start / BAR / 7);
        const confirmed = start + BAR <= (options.now ?? NOW) ? "1" : "0";
        rows.push([String(start), String(close), String(close + 0.5), String(close - 0.5), String(close), "1", "1", "1", confirmed]);
      }
      return { data: rows, meta: meta(endpoint) };
    },
  };
}

const lastStart = NOW - BAR; // the bar that closed one bar ago, so everything up to it is confirmed
const options = { instId: "BTC-USDT-SWAP", bar: "15m" as const, barMs: BAR, targetBars: 672 };

describe("QuantHistory", () => {
  test("the first refresh pages back until the target window is covered, and the series is contiguous", async () => {
    const calls: { path: string; query: QueryInput | undefined }[] = [];
    const port = exchange({ lastStart, firstStart: lastStart - 5000 * BAR, calls });
    const h = new QuantHistory(options);
    const r = await h.refresh(port, NOW);
    expect(r.complete).toBe(true);
    expect(r.candles.length).toBeGreaterThanOrEqual(672);
    const audit = auditCandles(r.candles, BAR, NOW);
    expect(audit.grade).toBe("A");
    expect(audit.usable.length).toBe(r.candles.length);
    // one recent read of 300 and history pages of 100 for the rest
    expect(calls[0]!.path.endsWith("/candles")).toBe(true);
    expect(calls.slice(1).every((c) => c.path.endsWith("history-candles"))).toBe(true);
    expect(r.requests).toBe(calls.length);
    expect(r.requests).toBeLessThanOrEqual(8);
    // the first history page starts exactly at the oldest bar of the 300 bar recent window
    expect(Number(calls[1]!.query!.after)).toBe(lastStart - 299 * BAR);
    expect(calls[1]!.query!.limit).toBe(100);
  });

  test("a later refresh only reads the recent window and appends the new bars", async () => {
    const h = new QuantHistory(options);
    await h.refresh(exchange({ lastStart, firstStart: lastStart - 5000 * BAR }), NOW);
    const calls: { path: string; query: QueryInput | undefined }[] = [];
    const later = NOW + 3 * BAR;
    const r = await h.refresh(exchange({ lastStart: lastStart + 3 * BAR, firstStart: lastStart - 5000 * BAR, now: later, calls }), later);
    expect(calls).toHaveLength(1);
    expect(r.requests).toBe(1);
    expect(r.candles[r.candles.length - 1]!.startMs).toBe(lastStart + 3 * BAR);
    expect(auditCandles(r.candles, BAR, later).grade).toBe("A");
  });

  test("the window is capped at the target size plus one recent read", async () => {
    const h = new QuantHistory({ ...options, targetBars: 400 });
    const r = await h.refresh(exchange({ lastStart, firstStart: lastStart - 5000 * BAR }), NOW);
    expect(r.candles.length).toBeLessThanOrEqual(400);
    expect(r.complete).toBe(true);
  });

  test("a feed that has less history than asked is reported incomplete, with what it did give", async () => {
    const h = new QuantHistory(options);
    const r = await h.refresh(exchange({ lastStart, firstStart: lastStart - 450 * BAR }), NOW);
    expect(r.complete).toBe(false);
    expect(r.candles.length).toBe(451);
  });

  test("a hole between what is stored and what the recent read returns is healed by paging back", async () => {
    const h = new QuantHistory(options);
    await h.refresh(exchange({ lastStart, firstStart: lastStart - 5000 * BAR }), NOW);
    // the process slept for 500 bars; the recent read (300 bars) no longer overlaps the stored tail
    const later = NOW + 500 * BAR;
    const port = exchange({ lastStart: lastStart + 500 * BAR, firstStart: lastStart - 5000 * BAR, now: later });
    const r = await h.refresh(port, later);
    const audit = auditCandles(r.candles, BAR, later);
    expect(audit.coverage).toBe(1);
    expect(audit.usable.length).toBe(r.candles.length);
    expect(r.candles.length).toBeGreaterThanOrEqual(672);
  });

  test("recent rows already read by the caller are used without another recent request", async () => {
    const calls: { path: string; query: QueryInput | undefined }[] = [];
    const port = exchange({ lastStart, firstStart: lastStart - 5000 * BAR, calls });
    const recent = (await port.get({ path: "/api/v5/market/candles" } as EndpointRef, { instId: options.instId, bar: "15m", limit: 300 })).data as string[][];
    calls.length = 0;
    const rows = recent.map((raw) => ({ startMs: Number(raw[0]), open: raw[1]!, high: raw[2]!, low: raw[3]!, close: raw[4]!, vol: raw[5]!, confirmed: raw[8] === "1" }));
    const h = new QuantHistory(options);
    const r = await h.refresh(port, NOW, rows);
    expect(calls.every((c) => c.path.endsWith("history-candles"))).toBe(true);
    expect(r.candles.length).toBeGreaterThanOrEqual(672);
  });

  test("a failing history read keeps what was already known and reports it incomplete", async () => {
    const h = new QuantHistory(options);
    const good = exchange({ lastStart, firstStart: lastStart - 5000 * BAR });
    const failing: GetPort = { get: async (endpoint, query) => { if (endpoint.path.endsWith("history-candles")) throw new Error("boom"); return good.get(endpoint, query); } };
    const r = await h.refresh(failing, NOW);
    expect(r.complete).toBe(false);
    expect(r.error).toBe("history_read_failed");
    expect(r.candles.length).toBeGreaterThan(0);
  });

  test("a closed bar that the exchange later restates is counted and reported, not repaired in silence", async () => {
    const h = new QuantHistory(options);
    const first = await h.refresh(exchange({ lastStart, firstStart: lastStart - 5000 * BAR }), NOW);
    expect(first.restatedBars).toBe(0);
    const honest = exchange({ lastStart, firstStart: lastStart - 5000 * BAR });
    const restating: GetPort = {
      get: async (endpoint, query) => {
        const result = await honest.get(endpoint, query);
        const rows = (result.data as string[][]).map((row) => (row[0] === String(lastStart - 10 * BAR) ? [row[0]!, row[1]!, row[2]!, row[3]!, String(Number(row[4]) + 1), ...row.slice(5)] : row));
        return { ...result, data: rows };
      },
    };
    const second = await h.refresh(restating, NOW);
    expect(second.restatedBars).toBe(1);
    // an identical refresh afterwards restates nothing
    expect((await h.refresh(restating, NOW)).restatedBars).toBe(0);
  });

  test("invalid options are refused", () => {
    expect(() => new QuantHistory({ ...options, targetBars: 0 })).toThrow("option_invalid");
    expect(() => new QuantHistory({ ...options, barMs: 0 })).toThrow("bar_invalid");
  });
});
