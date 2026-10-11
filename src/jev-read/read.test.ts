import { describe, expect, test } from "bun:test";
import { compactTapeState, validateTapeDecision, type TapeModel, type RawTapeAnswer } from "./decide";
import { runJevRead } from "./read";
import { buildTapeState } from "./state";
import type { TapeCandle, TapeInput, TapeState } from "./types";

const NOW = 2_000_000_000_000;

function candles(count: number): TapeCandle[] {
  return Array.from({ length: count }, (_, i) => ({ tsMs: NOW - (count - i) * 60_000, close: 100 + Math.sin(i / 3), confirmed: true }));
}

function input(overrides: Partial<TapeInput> = {}): TapeInput {
  return {
    instId: "ETH-USDT",
    nowMs: NOW,
    exchangeNowMs: NOW,
    tradesLive: true,
    book: { bids: [{ px: 99.9, sz: 2 }], asks: [{ px: 100.1, sz: 2 }], receivedAtMs: NOW - 100 },
    trades: [{ px: 100, sz: 1, side: "buy", receivedAtMs: NOW - 1_000 }],
    candles: candles(40),
    ticker: { last: 100, open24h: 99, high24h: 101, low24h: 98, receivedAtMs: NOW - 500 },
    fundingRate: null,
    ...overrides,
  };
}

function stateOf(i: TapeInput): TapeState {
  const out = buildTapeState(i);
  if (!out.ok) throw new Error("state expected");
  return out.state;
}

function fakeModel(answer: () => Promise<RawTapeAnswer> | RawTapeAnswer, name = "jev-test"): TapeModel & { calls: number } {
  const model = {
    name,
    calls: 0,
    async decide(): Promise<RawTapeAnswer> {
      model.calls += 1;
      return answer();
    },
  };
  return model;
}

describe("validateTapeDecision", () => {
  test("accepts a clean answer and normalizes the weights", () => {
    const d = validateTapeDecision({ choice: "buy", probabilities: { buy: 3, sell: 1, hold: 0 }, latencyMs: 812, inputTokens: 1_100 }, "jev-1.13.0");
    expect(d.status).toBe("ok");
    expect(d.action).toBe("buy");
    expect(d.probabilities).toEqual({ buy: 0.75, sell: 0.25, hold: 0 });
    expect(d.confidence).toBeCloseTo(0.75, 10);
    expect(d.model).toBe("jev-1.13.0");
    expect(d.latencyMs).toBe(812);
    expect(d.inputTokens).toBe(1_100);
  });

  test("a bare choice without weights is a one hot decision", () => {
    const d = validateTapeDecision({ choice: "sell", latencyMs: 10 }, "m");
    expect(d.status).toBe("ok");
    expect(d.probabilities).toEqual({ buy: 0, sell: 1, hold: 0 });
  });

  test.each([
    ["not a record", null],
    ["unknown action", { choice: "moon", latencyMs: 1 }],
    ["choice is not a string", { choice: 7, latencyMs: 1 }],
    ["negative weight", { choice: "buy", probabilities: { buy: -1, sell: 1, hold: 0 }, latencyMs: 1 }],
    ["non finite weight", { choice: "buy", probabilities: { buy: Number.NaN, sell: 1, hold: 0 }, latencyMs: 1 }],
    ["chosen action has no weight", { choice: "buy", probabilities: { buy: 0, sell: 1, hold: 0 }, latencyMs: 1 }],
    ["weights are not a record", { choice: "buy", probabilities: [1, 0, 0], latencyMs: 1 }],
  ])("%s becomes hold with status malformed, never an action", (_label, raw) => {
    const d = validateTapeDecision(raw, "m");
    expect(d.action).toBe("hold");
    expect(d.status).toBe("malformed");
    expect(d.probabilities).toEqual({ buy: 0, sell: 0, hold: 1 });
    expect(d.confidence).toBeNull();
  });

  test("usage that is not a safe non negative integer is unknown, not zero", () => {
    expect(validateTapeDecision({ choice: "hold", latencyMs: 1, inputTokens: -3 }, "m").inputTokens).toBeNull();
    expect(validateTapeDecision({ choice: "hold", latencyMs: 1, inputTokens: 1.5 }, "m").inputTokens).toBeNull();
    expect(validateTapeDecision({ choice: "hold", latencyMs: 1 }, "m").inputTokens).toBeNull();
  });
});

describe("compactTapeState", () => {
  function numbersIn(value: unknown, out: number[] = []): number[] {
    if (typeof value === "number") out.push(value);
    else if (value !== null && typeof value === "object") for (const v of Object.values(value)) numbersIn(v, out);
    return out;
  }

  test("keeps five significant digits so small prices keep their information", () => {
    const s = stateOf(input({ fundingRate: 0.000123456789 }));
    const compact = compactTapeState(s) as Record<string, unknown>;
    expect(JSON.stringify(compact).length).toBeLessThan(JSON.stringify(s).length);
    expect(compact.instId).toBe("ETH-USDT");
    expect(compact.fundingRatePct).toBe(0.012346);
    for (const n of numbersIn(compact)) expect(Number(n.toPrecision(5))).toBe(n);
  });

  test("a sub cent price is not flattened to zero", () => {
    const base = input();
    const tiny = stateOf({
      ...base,
      book: { bids: [{ px: 0.027149, sz: 1000 }], asks: [{ px: 0.027151, sz: 1000 }], receivedAtMs: NOW - 100 },
      candles: candles(40).map((c) => ({ ...c, close: 0.027 + c.close / 1e6 })),
      ticker: { last: 0.02715, open24h: 0.02465, high24h: 0.02719, low24h: 0.02465, receivedAtMs: NOW - 100 },
    });
    expect((compactTapeState(tiny) as { mid: number }).mid).toBe(0.02715);
  });

  test("leaves null and string fields alone", () => {
    const s = stateOf(input({ fundingRate: null, ticker: { last: 100, open24h: null, high24h: null, low24h: null, receivedAtMs: NOW - 100 } }));
    const compact = compactTapeState(s) as { fundingRatePct: unknown; change24hPct: unknown };
    expect(compact.fundingRatePct).toBeNull();
    expect(compact.change24hPct).toBeNull();
  });
});

describe("runJevRead", () => {
  test("asks the model with a built state and records an advisory read that never executes", async () => {
    const model = fakeModel(() => ({ choice: "buy", probabilities: { buy: 0.6, sell: 0.1, hold: 0.3 }, latencyMs: 640, inputTokens: 1_000 }));
    const read = await runJevRead(input(), { model, now: () => NOW, readId: () => "jr-1", clockOffsetMs: 69_522 });
    expect(model.calls).toBe(1);
    expect(read.advisory).toBe(true);
    expect(read.execution).toBe("never");
    expect(read.readId).toBe("jr-1");
    expect(read.instId).toBe("ETH-USDT");
    expect(read.clockOffsetMs).toBe(69_522);
    expect(read.insufficient).toEqual([]);
    expect(read.state?.instId).toBe("ETH-USDT");
    expect(read.decision?.action).toBe("buy");
    expect(read.decision?.status).toBe("ok");
  });

  test("never calls the model when an input is missing: the read lists why", async () => {
    const model = fakeModel(() => ({ choice: "buy", latencyMs: 1 }));
    const read = await runJevRead(input({ book: null, candles: [] }), { model, now: () => NOW });
    expect(model.calls).toBe(0);
    expect(read.state).toBeNull();
    expect(read.decision).toBeNull();
    expect(read.insufficient).toEqual(["book_missing", "candles_short"]);
  });

  test("observe mode builds and records the state without any model: no decision exists", async () => {
    const read = await runJevRead(input(), { model: null, now: () => NOW, readId: () => "jr-obs" });
    expect(read.state?.instId).toBe("ETH-USDT");
    expect(read.decision).toBeNull();
    expect(read.insufficient).toEqual([]);
    expect(read.advisory).toBe(true);
  });

  test("a failing model yields hold with status error, not an exception", async () => {
    const model = fakeModel(() => { throw new Error("provider down"); });
    const read = await runJevRead(input(), { model, now: () => NOW });
    expect(read.decision?.action).toBe("hold");
    expect(read.decision?.status).toBe("error");
    expect(read.decision?.confidence).toBeNull();
  });

  test("a model that never answers is cut at the deadline and reported as timeout", async () => {
    const model = fakeModel(() => new Promise<RawTapeAnswer>(() => {}));
    const read = await runJevRead(input(), { model, now: () => NOW, timeoutMs: 30 });
    expect(read.decision?.action).toBe("hold");
    expect(read.decision?.status).toBe("timeout");
  });

  test("a malformed answer is hold with status malformed", async () => {
    const model = fakeModel(() => ({ choice: "all-in" } as unknown as RawTapeAnswer));
    const read = await runJevRead(input(), { model, now: () => NOW });
    expect(read.decision?.action).toBe("hold");
    expect(read.decision?.status).toBe("malformed");
  });

  test("the model receives a copy: mutating it cannot change the recorded state", async () => {
    const model: TapeModel = {
      name: "mutator",
      async decide(state) {
        (state as unknown as { mid: number }).mid = -1;
        return { choice: "hold", latencyMs: 1 };
      },
    };
    const read = await runJevRead(input(), { model, now: () => NOW });
    expect(read.state?.mid).toBeCloseTo(100, 6);
  });
});
