import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync, appendFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ClockSample } from "../system-one/clock";
import type { TapeModel } from "./decide";
import { ClockKeeper, countRecentModelReads, MAX_SAMPLE_AGE_MS, readRound, type ReaderFeed } from "./loop";
import { JevReadStore } from "./store";
import type { JevRead, TapeCandle, TapeInput } from "./types";

const sample = (offsetMs: number, roundTripMs = 400): ClockSample => ({ offsetMs, roundTripMs, measuredAtMs: 0 });

describe("ClockKeeper", () => {
  function keeper(measures: Array<ClockSample | null>) {
    let mono = 1_000;
    let wall = 1_791_000_000_000;
    let i = 0;
    const k = new ClockKeeper({ measure: async () => measures[Math.min(i++, measures.length - 1)] ?? null, mono: () => mono, wall: () => wall });
    return { k, advance: (ms: number) => { mono += ms; wall += ms; } };
  }

  test("starts unknown: no offset and no exchange clock", () => {
    const { k } = keeper([null]);
    expect(k.offsetMs()).toBeNull();
    expect(k.exchangeNow()).toBeNull();
  });

  test("after a sample it exposes the offset and an exchange clock that never trails the exchange", async () => {
    const { k, advance } = keeper([sample(70_000, 400)]);
    await k.refresh();
    expect(k.offsetMs()).toBe(70_000);
    const first = k.exchangeNow()!;
    advance(5_000);
    expect(k.exchangeNow()! - first).toBe(5_000);
    expect(first).toBeGreaterThanOrEqual(1_791_000_000_000 + 70_000 + 200);
  });

  test("a failed re-measure keeps the previous good sample", async () => {
    const { k, advance } = keeper([sample(70_000), null]);
    await k.refresh();
    advance(600_000);
    await k.refresh();
    expect(k.offsetMs()).toBe(70_000);
    expect(k.exchangeNow()).not.toBeNull();
  });

  test("a sample that keeps failing to refresh expires instead of being trusted forever", async () => {
    const { k, advance } = keeper([sample(70_000), null]);
    await k.refresh();
    advance(MAX_SAMPLE_AGE_MS + 1_000);
    await k.refresh();
    expect(k.offsetMs()).toBeNull();
    expect(k.exchangeNow()).toBeNull();
  });

  test("the stamp clock is the exchange clock when known and the local clock otherwise", async () => {
    const { k } = keeper([sample(70_000)]);
    expect(k.stamp()).toBe(1_791_000_000_000);
    await k.refresh();
    expect(k.stamp()).toBeGreaterThan(1_791_000_000_000 + 69_000);
  });
});

function candles(count: number, endTs: number): TapeCandle[] {
  return Array.from({ length: count }, (_, i) => ({ tsMs: endTs - (count - 1 - i) * 60_000, close: 100 + i * 0.01, confirmed: true }));
}

function feedStub(overrides: { bookAgeMs?: number | null; tickerAgeMs?: number | null; snapshotThrows?: boolean } = {}) {
  const calls: string[] = [];
  const exchangeNow = 1_791_000_070_000;
  const local = 1_791_000_000_000;
  const feed: ReaderFeed = {
    ages: () => ({ bookAgeMs: overrides.bookAgeMs === undefined ? 100 : overrides.bookAgeMs, tickerAgeMs: overrides.tickerAgeMs === undefined ? 100 : overrides.tickerAgeMs }),
    async refreshBook() { calls.push("book"); },
    async refreshTicker() { calls.push("ticker"); },
    snapshot(instId, nowMs, exchangeNowMs): TapeInput {
      if (overrides.snapshotThrows) throw new Error("boom");
      return {
        instId,
        nowMs,
        exchangeNowMs: exchangeNowMs ?? null,
        tradesLive: true,
        book: { bids: [{ px: 99.9, sz: 1 }], asks: [{ px: 100.1, sz: 1 }], receivedAtMs: nowMs - 100 },
        trades: [],
        candles: candles(40, (exchangeNowMs ?? exchangeNow) - 30_000),
        ticker: { last: 100, open24h: 99, high24h: 101, low24h: 98, receivedAtMs: nowMs - 100 },
        fundingRate: null,
      };
    },
  };
  return { feed, calls, local, exchangeNow };
}

const askModel: TapeModel & { calls: number } = Object.assign({ name: "jev-1.13.0", calls: 0 }, {
  async decide() {
    askModel.calls += 1;
    return { choice: "hold", probabilities: { buy: 0.2, sell: 0.2, hold: 0.6 }, latencyMs: 5, inputTokens: 10 };
  },
});

describe("readRound", () => {
  const dirs: string[] = [];
  afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); });
  const tmp = () => { const d = mkdtempSync(join(tmpdir(), "jev-loop-")); dirs.push(d); return d; };

  async function readyKeeper() {
    let mono = 0;
    const k = new ClockKeeper({ measure: async () => sample(70_000), mono: () => mono, wall: () => 1_791_000_000_000 });
    await k.refresh();
    return k;
  }

  test("refreshes a quiet book and ticker by REST before reading, and records the read", async () => {
    const dir = tmp();
    const store = new JevReadStore({ statePath: join(dir, "l.json"), journalPath: join(dir, "j.jsonl") });
    const { feed, calls, local } = feedStub({ bookAgeMs: 9_000, tickerAgeMs: 30_000 });
    const result = await readRound({ feed, keeper: await readyKeeper(), model: askModel, store, instId: "BTC-USDT", localNow: () => local });
    expect(calls).toEqual(["book", "ticker"]);
    expect(result.error).toBeNull();
    expect(result.read?.decision?.action).toBe("hold");
    expect(readdirSync(dir).sort()).toEqual(["j.jsonl", "l.json"]);
  });

  test("does not refresh what is fresh", async () => {
    const dir = tmp();
    const store = new JevReadStore({ statePath: join(dir, "l.json"), journalPath: join(dir, "j.jsonl") });
    const { feed, calls, local } = feedStub({ bookAgeMs: 500, tickerAgeMs: 2_000 });
    await readRound({ feed, keeper: await readyKeeper(), model: null, store, instId: "BTC-USDT", localNow: () => local });
    expect(calls).toEqual([]);
  });

  test("without a measured clock the read records why and the model is not asked", async () => {
    const dir = tmp();
    const store = new JevReadStore({ statePath: join(dir, "l.json"), journalPath: join(dir, "j.jsonl") });
    const unmeasured = new ClockKeeper({ measure: async () => null });
    askModel.calls = 0;
    const { feed, local } = feedStub();
    const result = await readRound({ feed, keeper: unmeasured, model: askModel, store, instId: "BTC-USDT", localNow: () => local });
    expect(result.read?.insufficient).toEqual(["clock_unknown"]);
    expect(askModel.calls).toBe(0);
  });

  test("a failing disk write is reported, never thrown into the loop", async () => {
    const store = { record() { throw new Error("EPERM: operation not permitted, rename"); } } as unknown as JevReadStore;
    const { feed, local } = feedStub();
    const result = await readRound({ feed, keeper: await readyKeeper(), model: null, store, instId: "BTC-USDT", localNow: () => local });
    expect(result.error).toBe("store_failed");
    expect(result.read).not.toBeNull();
  });

  test("any unexpected failure of the round is contained", async () => {
    const dir = tmp();
    const store = new JevReadStore({ statePath: join(dir, "l.json"), journalPath: join(dir, "j.jsonl") });
    const { feed, local } = feedStub({ snapshotThrows: true });
    const result = await readRound({ feed, keeper: await readyKeeper(), model: null, store, instId: "BTC-USDT", localNow: () => local });
    expect(result.error).toBe("round_failed");
    expect(result.read).toBeNull();
  });
});

describe("countRecentModelReads", () => {
  const dirs: string[] = [];
  afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); });

  test("counts only reads that asked the model inside the window, across the journal and its backup, ignoring garbage", () => {
    const dir = mkdtempSync(join(tmpdir(), "jev-count-"));
    dirs.push(dir);
    const line = (atMs: number, decided: boolean) => JSON.stringify({ atMs, decision: decided ? { action: "hold" } : null });
    writeFileSync(join(dir, "j.jsonl"), [line(900, true), line(950, false), "{not json", line(990, true), "", JSON.stringify([1])].join("\n") + "\n");
    writeFileSync(join(dir, "j.jsonl.1"), [line(100, true), line(920, true)].join("\n") + "\n");
    expect(countRecentModelReads(join(dir, "j.jsonl"), 500)).toBe(3);
    expect(countRecentModelReads(join(dir, "missing.jsonl"), 500)).toBe(0);
  });
});

describe("JevReadStore journal rotation", () => {
  const dirs: string[] = [];
  afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); });

  test("the journal rotates to a single backup when it passes its size limit", () => {
    const dir = mkdtempSync(join(tmpdir(), "jev-rot-"));
    dirs.push(dir);
    const journal = join(dir, "j.jsonl");
    const store = new JevReadStore({ statePath: join(dir, "l.json"), journalPath: journal, journalMaxBytes: 300 });
    const read = (id: string): JevRead => ({ schemaVersion: 1, readId: id, instId: "BTC-USDT", atMs: 1, clockOffsetMs: null, advisory: true, execution: "never", state: null, insufficient: ["book_missing"], decision: null });
    for (let i = 0; i < 6; i += 1) store.record(read(`jr-${i}`));
    const files = readdirSync(dir).sort();
    expect(files).toContain("j.jsonl.1");
    expect(readFileSync(journal, "utf8").length).toBeLessThan(600);
    appendFileSync(journal, "");
  });
});
