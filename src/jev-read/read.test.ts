import { describe, expect, test } from "bun:test";
import { compactTapeState, validateTapeDecision, type TapeModel, type RawTapeAnswer } from "./decide";
import { runJevRead } from "./read";
import { publicReadView } from "./public-view";
import { buildTapeState } from "./state";
import type { TapeCandle, TapeInput, TapeState } from "./types";

const NOW = 2_000_000_000_000;

function candles(count: number): TapeCandle[] {
  return Array.from({ length: count }, (_, i) => ({ tsMs: NOW - (count - i) * 60_000, close: 100 + Math.sin(i / 3), confirmed: true,
    proof: { feedId: "read-fixture", feedEpoch: 0, captureId: 3, forSpotInstId: "ETH-USDT", requestedInstId: "ETH-USDT",
      reportedInstId: null, source: "rest_candles_1m", wsGeneration: null, sourceTsMs: NOW - (count - i) * 60_000,
      receivedAtMs: NOW - 100, receivedAtMonoMs: 199_900 },
  }));
}

function input(overrides: Partial<TapeInput> = {}): TapeInput {
  return {
    instId: "ETH-USDT",
    feedId: "read-fixture",
    feedEpoch: 0,
    wsGeneration: 0,
    monotonicNowMs: 200_000,
    funding: null,
    nowMs: NOW,
    exchangeNowMs: NOW,
    tradesLive: true,
    coverage: { feedId: "read-fixture", feedEpoch: 0, instId: "ETH-USDT", wsGeneration: 0, source: "ws_trades",
      acknowledgedAtMonoMs: 100_000, continuousSinceMonoMs: 100_000, observedThroughMonoMs: 200_000,
      socketOpen: true, lostThroughMonoMs: null },
    book: { bids: [{ px: 99.9, sz: 2 }], asks: [{ px: 100.1, sz: 2 }], receivedAtMs: NOW - 100,
      proof: { feedId: "read-fixture", feedEpoch: 0, captureId: 1, forSpotInstId: "ETH-USDT", requestedInstId: "ETH-USDT",
        reportedInstId: null, source: "rest_book", wsGeneration: null, sourceTsMs: NOW - 100, receivedAtMs: NOW - 100, receivedAtMonoMs: 199_900 } },
    trades: [{ px: 100, sz: 1, side: "buy", receivedAtMs: NOW - 1_000,
      proof: { feedId: "read-fixture", feedEpoch: 0, captureId: 4, forSpotInstId: "ETH-USDT", requestedInstId: "ETH-USDT",
        reportedInstId: "ETH-USDT", source: "ws_trades", wsGeneration: 0, sourceTsMs: NOW - 1_000,
        receivedAtMs: NOW - 1_000, receivedAtMonoMs: 199_000 } }],
    candles: candles(40),
    ticker: { last: 100, open24h: 99, high24h: 101, low24h: 98, receivedAtMs: NOW - 500,
      proof: { feedId: "read-fixture", feedEpoch: 0, captureId: 2, forSpotInstId: "ETH-USDT", requestedInstId: "ETH-USDT",
        reportedInstId: "ETH-USDT", source: "rest_ticker", wsGeneration: null, sourceTsMs: NOW - 500,
        receivedAtMs: NOW - 500, receivedAtMonoMs: 199_500 } },
    fundingMaxAgeMs: 120_000,
    ...overrides,
  };
}

function stateOf(i: TapeInput): TapeState {
  const out = buildTapeState(i);
  if (!out.ok) throw new Error("state expected");
  return out.state;
}

function knownFunding(rate: number): NonNullable<TapeInput["funding"]> {
  return { rate, fundingTimeMs: null, nextFundingTimeMs: null, proof: { feedId: "read-fixture", feedEpoch: 0,
    captureId: 1, forSpotInstId: "ETH-USDT", requestedInstId: "ETH-USDT-SWAP", reportedInstId: "ETH-USDT-SWAP",
    source: "rest_funding", wsGeneration: null, sourceTsMs: NOW, receivedAtMs: NOW, receivedAtMonoMs: 200_000 } };
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
  test("ordinary buy/hold weights retain their 3:1 meaning", () => {
    const d = validateTapeDecision({ choice: "buy", probabilities: { buy: 3, sell: 0, hold: 1 } }, "m");
    expect(d.status).toBe("ok");
    expect(d.probabilities).toEqual({ buy: 0.75, sell: 0, hold: 0.25 });
    expect(d.confidence).toBe(0.75);
  });

  test("a chosen weight that normalizes to zero becomes hold/malformed", () => {
    const d = validateTapeDecision({ choice: "buy", probabilities: { buy: Number.MIN_VALUE, sell: 0, hold: Number.MAX_VALUE } }, "m");
    expect(d.status).toBe("malformed");
    expect(d.action).toBe("hold");
    expect(d.confidence).toBeNull();
    expect(d.probabilities).toEqual({ buy: 0, sell: 0, hold: 1 });
  });

  test("finite weights with an overflowing total become hold/malformed", () => {
    const d = validateTapeDecision({ choice: "buy", probabilities: { buy: Number.MAX_VALUE, sell: Number.MAX_VALUE, hold: 0 } }, "m");
    expect(d.status).toBe("malformed");
    expect(d.action).toBe("hold");
    expect(d.confidence).toBeNull();
    expect(d.probabilities).toEqual({ buy: 0, sell: 0, hold: 1 });
  });

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
    ["zero total", { choice: "hold", probabilities: { buy: 0, sell: 0, hold: 0 }, latencyMs: 1 }],
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
    const s = stateOf(input({ funding: knownFunding(0.000123456789) }));
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
      book: { bids: [{ px: 0.027149, sz: 1000 }], asks: [{ px: 0.027151, sz: 1000 }], receivedAtMs: NOW - 100,
        proof: { feedId: "read-fixture", feedEpoch: 0, captureId: 1, forSpotInstId: "ETH-USDT", requestedInstId: "ETH-USDT",
          reportedInstId: null, source: "rest_book", wsGeneration: null, sourceTsMs: NOW - 100, receivedAtMs: NOW - 100, receivedAtMonoMs: 199_900 } },
      candles: candles(40).map((c) => ({ ...c, close: 0.027 + c.close / 1e6 })),
      ticker: { ...base.ticker!, last: 0.02715, open24h: 0.02465, high24h: 0.02719, low24h: 0.02465, receivedAtMs: NOW - 100 },
    });
    expect((compactTapeState(tiny) as { mid: number }).mid).toBe(0.02715);
  });

  test("leaves null and string fields alone", () => {
    const s = stateOf(input({ funding: null, ticker: { ...input().ticker!, last: 100, open24h: null, high24h: null, low24h: null, receivedAtMs: NOW - 100 } }));
    const compact = compactTapeState(s) as { fundingRatePct: unknown; change24hPct: unknown };
    expect(compact.fundingRatePct).toBeNull();
    expect(compact.change24hPct).toBeNull();
  });
});

describe("runJevRead", () => {
  test("invalid normalized weights remain hold through the public read projection", async () => {
    const model = fakeModel(() => ({ choice: "buy", probabilities: { buy: Number.MAX_VALUE, sell: Number.MAX_VALUE, hold: 0 } }), "jev-1.13.0");
    const read = await runJevRead(input(), { model, now: () => NOW });
    expect(read.decision?.status).toBe("malformed");
    expect(read.decision?.probabilities).toEqual({ buy: 0, sell: 0, hold: 1 });
    const view = publicReadView(read);
    expect(view?.decision).toEqual(read.decision);
    expect(view?.advisory).toBe(true);
    expect(view?.execution).toBe("never");
  });

  test("a synchronous model result beyond the elapsed deadline becomes hold/timeout", async () => {
    const model = fakeModel(() => {
      const started = performance.now();
      while (performance.now() - started < 30) { /* Deliberately block timer callbacks. */ }
      return { choice: "buy", latencyMs: 30 };
    });
    const read = await runJevRead(input(), { model, now: () => NOW, timeoutMs: 5 });
    expect(read.decision?.status).toBe("timeout");
    expect(read.decision?.action).toBe("hold");
    expect(read.decision?.confidence).toBeNull();
  });

  test("cancellation settles a read even when the model ignores the signal", async () => {
    const controller = new AbortController();
    let resolveAnswer!: (answer: RawTapeAnswer) => void;
    const model = fakeModel(() => new Promise<RawTapeAnswer>((resolve) => { resolveAnswer = resolve; }));
    const pending = runJevRead(input(), { model, now: () => NOW, signal: controller.signal, timeoutMs: 1000 });
    controller.abort();
    let guard: ReturnType<typeof setTimeout> | undefined;
    const read = await Promise.race([
      pending,
      new Promise<null>((resolve) => { guard = setTimeout(() => resolve(null), 100); }),
    ]);
    if (guard !== undefined) clearTimeout(guard);
    resolveAnswer({ choice: "buy", latencyMs: 1 });
    expect(read).not.toBeNull();
    expect(read?.decision?.status).toBe("error");
    expect(read?.decision?.action).toBe("hold");
    expect(read?.decision?.probabilities).toEqual({ buy: 0, sell: 0, hold: 1 });
    expect((await pending).decision?.status).toBe("error");
  });

  test("an already cancelled read never asks the model and records hold/error", async () => {
    const controller = new AbortController();
    controller.abort();
    const model = fakeModel(() => ({ choice: "buy", latencyMs: 1 }));
    const read = await runJevRead(input(), { model, now: () => NOW, signal: controller.signal });
    expect(model.calls).toBe(0);
    expect(read.decision?.status).toBe("error");
    expect(read.decision?.action).toBe("hold");
    expect(read.decision?.confidence).toBeNull();
    expect(read.decision?.probabilities).toEqual({ buy: 0, sell: 0, hold: 1 });
    expect(read.advisory).toBe(true);
    expect(read.execution).toBe("never");
  });

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
