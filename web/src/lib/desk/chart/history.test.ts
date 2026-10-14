import { describe, expect, test } from "bun:test";
import {
  boardReads,
  DECISION_HISTORY_CAP,
  DECISION_HISTORY_KEY,
  DECISION_HISTORY_MAX_AGE_MS,
  historyList,
  isStorableRead,
  loadDecisionHistory,
  mergeDecisionHistory,
  saveDecisionHistory,
  type DecisionStorage,
} from "./history";
import { parseJevRead, type JevReadBoardView, type JevReadView } from "../../jev-read";

const state = {
  instId: "BTC-USDT",
  horizonMinutes: 5,
  mid: 83957.35,
  spreadBps: 0.12,
  bookImbalanceTop5: -0.31,
  volBpsPerMinute: 2.3,
  depthQuoteTop5: { bid: 120000, ask: 190000 },
  returnsBps: { m1: 1.2, m5: -3.4, m15: 5.6, m30: 7.8 },
  flow60s: { count: 12, buyBase: 0.4, sellBase: 0.9, imbalance: -0.38, cvdBase: -0.5, vwap: 83950, lastPx: 83957.4, lastSide: "buy" },
  change24hPct: 1.4,
  rangePosition24h: 0.62,
  fundingRatePct: null,
};

const NOW = 1_791_742_000_000;

function read(readId: string, atMs = NOW - 10_000, overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 1,
    readId,
    instId: "BTC-USDT",
    atMs,
    clockOffsetMs: 69_500,
    advisory: true,
    execution: "never",
    state,
    insufficient: [],
    decision: { action: "buy", probabilities: { buy: 0.7, sell: 0.1, hold: 0.2 }, confidence: 0.7, latencyMs: 200, model: "jev-1.13.0", status: "ok", inputTokens: 1 },
    ...overrides,
  };
}

const view = (readId: string, atMs = NOW - 10_000, overrides: Record<string, unknown> = {}): JevReadView => {
  const parsed = parseJevRead(read(readId, atMs, overrides));
  if (parsed === null) throw new Error("fixture read failed to parse");
  return parsed;
};

function memoryStorage(initial: Record<string, string> = {}): DecisionStorage & { data: Record<string, string> } {
  const data = { ...initial };
  return {
    data,
    getItem: (key) => data[key] ?? null,
    setItem: (key, value) => {
      data[key] = value;
    },
  };
}

describe("mergeDecisionHistory", () => {
  test("deduplicates by readId and orders newest first", () => {
    const map = new Map<string, JevReadView>();
    mergeDecisionHistory(map, [view("jr-1", NOW - 30_000), view("jr-2", NOW - 10_000)], NOW);
    mergeDecisionHistory(map, [view("jr-1", NOW - 30_000), view("jr-3", NOW - 20_000)], NOW);
    expect(map.size).toBe(3);
    expect(historyList(map).map((r) => r.readId)).toEqual(["jr-2", "jr-3", "jr-1"]);
  });

  test("a read with an error or timeout decision, or without a state, is never stored", () => {
    const map = new Map<string, JevReadView>();
    mergeDecisionHistory(
      map,
      [
        view("jr-err", NOW - 10_000, { decision: { action: "hold", probabilities: { buy: 0, sell: 0, hold: 1 }, confidence: null, latencyMs: 5, model: "jev-1.13.0", status: "error", inputTokens: null } }),
        view("jr-tmo", NOW - 10_000, { decision: { action: "hold", probabilities: { buy: 0, sell: 0, hold: 1 }, confidence: null, latencyMs: 5, model: "jev-1.13.0", status: "timeout", inputTokens: null } }),
        view("jr-none", NOW - 10_000, { decision: null, insufficient: ["candles_short"], state: null }),
        view("jr-ok", NOW - 10_000),
      ],
      NOW,
    );
    expect([...map.keys()]).toEqual(["jr-ok"]);
    expect(isStorableRead(view("jr-err2", NOW, { decision: { action: "hold", probabilities: { buy: 0, sell: 0, hold: 1 }, confidence: null, latencyMs: 5, model: "jev-1.13.0", status: "malformed", inputTokens: null } }))).toBe(false);
  });

  test("keeps at most the cap newest by atMs and drops entries older than seven days", () => {
    const map = new Map<string, JevReadView>();
    const many: JevReadView[] = [];
    for (let i = 0; i < DECISION_HISTORY_CAP + 20; i += 1) many.push(view(`jr-${i}`, NOW - i * 1_000));
    mergeDecisionHistory(map, many, NOW);
    expect(map.size).toBe(DECISION_HISTORY_CAP);
    expect(historyList(map)[0]!.readId).toBe("jr-0");
    expect(map.has(`jr-${DECISION_HISTORY_CAP + 19}`)).toBe(false);

    mergeDecisionHistory(map, [view("jr-ancient", NOW - DECISION_HISTORY_MAX_AGE_MS - 1)], NOW);
    expect(map.has("jr-ancient")).toBe(false);
    // Pre-existing entries older than the horizon are pruned on the next merge too.
    map.set("jr-old", view("jr-old", NOW - DECISION_HISTORY_MAX_AGE_MS - 10));
    mergeDecisionHistory(map, [], NOW);
    expect(map.has("jr-old")).toBe(false);
  });
});

describe("boardReads", () => {
  test("merges the per-instrument latest with the recent journal, deduplicated", () => {
    const board: JevReadBoardView = {
      updatedAtMs: NOW,
      reads: { "BTC-USDT": view("jr-a"), "ETH-USDT": view("jr-b", NOW - 5_000, { instId: "ETH-USDT" }) },
      recent: [view("jr-a"), view("jr-c", NOW - 20_000)],
    };
    expect(boardReads(board).map((r) => r.readId).sort()).toEqual(["jr-a", "jr-b", "jr-c"]);
  });
});

describe("loadDecisionHistory and saveDecisionHistory", () => {
  test("round trips through JSON and the wire parser", () => {
    const storage = memoryStorage();
    const map = new Map<string, JevReadView>([["jr-1", view("jr-1")]]);
    saveDecisionHistory(storage, map);
    const loaded = loadDecisionHistory(storage, NOW);
    expect([...loaded.keys()]).toEqual(["jr-1"]);
    expect(loaded.get("jr-1")!.decision?.action).toBe("buy");
  });

  test.each([
    ["not JSON", "{oops"],
    ["a foreign shape", JSON.stringify({ hello: 1 })],
    ["entries that are not reads", JSON.stringify({ reads: [{ garbage: true }, 42, "x"] })],
  ])("ignores malformed storage: %s", (_label: string, content: string) => {
    const storage = memoryStorage({ [DECISION_HISTORY_KEY]: content });
    expect(loadDecisionHistory(storage, NOW).size).toBe(0);
  });

  test("stored entries lose their status and their state when they go stale or stop being ok", () => {
    const timeoutRead = view("jr-t", NOW - 1_000, { decision: { action: "hold", probabilities: { buy: 0, sell: 0, hold: 1 }, confidence: null, latencyMs: 1, model: "jev-1.13.0", status: "timeout", inputTokens: null } });
    const storage = memoryStorage({ [DECISION_HISTORY_KEY]: JSON.stringify({ reads: [timeoutRead, view("jr-old", NOW - DECISION_HISTORY_MAX_AGE_MS - 1)] }) });
    expect(loadDecisionHistory(storage, NOW).size).toBe(0);
  });
});
