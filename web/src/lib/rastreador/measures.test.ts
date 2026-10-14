// RAS-3: the pressure of the flow and the change of the last hours are measured only for the rows the person can see, in rounds
// that respect the public limit, again after a minute (pressure) or five (hours), never while the page is hidden, and a new
// target (another view, another window of rows) cancels the round in flight instead of piling up reads.
// origin: synthetic_fixture, tests only.
import { describe, expect, test } from "bun:test";
import type { FlowReader, PressureRead } from "./flow";
import { createMeasureLoop, needsRead, PERFORMANCE_TTL_MS, PRESSURE_TTL_MS, type MeasureState } from "./measures";
import type { PerformanceReader, PerformanceRead } from "./performance";

const NOW = 1_800_000_000_000;

describe("needsRead", () => {
  test("a row with no read, or an old one, needs reading; a fresh one does not", () => {
    const reads = new Map<string, { atMs: number } | "lendo" | { ok: false }>([
      ["FRESH-USDT", { atMs: NOW - 10_000 }],
      ["OLD-USDT", { atMs: NOW - 90_000 }],
      ["BUSY-USDT", "lendo"],
      ["FAILED-USDT", { ok: false }],
    ]);
    expect(needsRead(["FRESH-USDT", "OLD-USDT", "NEW-USDT", "BUSY-USDT", "FAILED-USDT"], reads as never, NOW, 60_000)).toEqual(["OLD-USDT", "NEW-USDT", "FAILED-USDT"]);
  });
});

function harness(options: { visible?: () => boolean; flowDelay?: () => Promise<void> } = {}) {
  let clock = NOW;
  const timers = new Map<number, { at: number; run: () => void }>();
  let nextId = 1;
  const states: MeasureState[] = [];
  const flowCalls: string[][] = [];
  const perfCalls: string[][] = [];
  const flow: FlowReader = {
    pressure: async (ids, signal) => {
      flowCalls.push([...ids]);
      await options.flowDelay?.();
      const out = new Map<string, PressureRead>();
      for (const id of ids) {
        if (signal?.aborted) break;
        out.set(id, { ok: true, pressure: { valor: 0.5, compra: 3, venda: 1, negocios: 9, janelaMs: 20_000 }, atMs: clock, rejected: 0 });
      }
      return out;
    },
  };
  const perf: PerformanceReader = {
    read: async (ids) => {
      perfCalls.push([...ids]);
      return new Map<string, PerformanceRead>(ids.map((id) => [id, { ok: true, atMs: clock, var1h: 1, var4h: 2 }]));
    },
  };
  const loop = createMeasureLoop({
    flow,
    perf,
    now: () => clock,
    setTimer: (run, ms) => {
      const id = nextId++;
      timers.set(id, { at: clock + ms, run });
      return id;
    },
    clearTimer: (id) => {
      timers.delete(id as number);
    },
    isVisible: options.visible ?? (() => true),
    onChange: (state) => states.push(state),
    chunk: 2,
  });
  const flush = async () => {
    for (let i = 0; i < 12; i += 1) await Promise.resolve();
  };
  const advance = async (ms: number) => {
    clock += ms;
    for (const [id, timer] of [...timers]) {
      if (timer.at <= clock) {
        timers.delete(id);
        timer.run();
      }
    }
    await flush();
  };
  return { loop, states, flowCalls, perfCalls, timers, advance, flush, last: () => states[states.length - 1]! };
}

describe("the loop", () => {
  test("the pressure views read the rows in small chunks, so cells fill in as the round goes", async () => {
    const h = harness();
    h.loop.setTarget("geral", ["A-USDT", "B-USDT", "C-USDT", "D-USDT", "E-USDT"]);
    await h.flush();
    expect(h.flowCalls).toEqual([["A-USDT", "B-USDT"], ["C-USDT", "D-USDT"], ["E-USDT"]]);
    expect([...h.last().pressure.keys()].sort()).toEqual(["A-USDT", "B-USDT", "C-USDT", "D-USDT", "E-USDT"]);
    expect(h.states.length).toBeGreaterThan(3); // a state after each chunk, plus the first one that marks the rows as being read
  });

  test("a row being read for the first time says so, and the first state is emitted before any answer", async () => {
    const h = harness();
    h.loop.setTarget("fluxo", ["A-USDT"]);
    expect(h.states[0]!.pressure.get("A-USDT")).toBe("lendo");
    await h.flush();
    expect(h.last().pressure.get("A-USDT")).toMatchObject({ ok: true });
  });

  test("a minute later the pressure is read again; only the rows that are old are asked", async () => {
    const h = harness();
    h.loop.setTarget("geral", ["A-USDT", "B-USDT"]);
    await h.flush();
    expect(h.flowCalls).toHaveLength(1);
    await h.advance(PRESSURE_TTL_MS + 1000);
    expect(h.flowCalls).toHaveLength(2);
    expect(h.flowCalls[1]).toEqual(["A-USDT", "B-USDT"]);
  });

  test("the hours view reads the candles, five minutes apart, and never the trades", async () => {
    const h = harness();
    h.loop.setTarget("desempenho", ["A-USDT", "B-USDT"]);
    await h.flush();
    expect(h.perfCalls).toEqual([["A-USDT", "B-USDT"]]);
    expect(h.flowCalls).toEqual([]);
    expect(h.last().performance.get("A-USDT")).toMatchObject({ ok: true, var1h: 1 });
    await h.advance(PRESSURE_TTL_MS + 1000);
    expect(h.perfCalls).toHaveLength(1);
    await h.advance(PERFORMANCE_TTL_MS);
    expect(h.perfCalls).toHaveLength(2);
  });

  test("views that have nothing to measure read nothing", async () => {
    const h = harness();
    h.loop.setTarget("smart", ["A-USDT"]);
    await h.flush();
    expect(h.flowCalls).toEqual([]);
    expect(h.perfCalls).toEqual([]);
    expect(h.timers.size).toBe(0);
  });

  test("the same target again changes nothing; another window of rows starts a new round", async () => {
    const h = harness();
    h.loop.setTarget("geral", ["A-USDT", "B-USDT"]);
    await h.flush();
    h.loop.setTarget("geral", ["A-USDT", "B-USDT"]);
    await h.flush();
    expect(h.flowCalls).toHaveLength(1);
    h.loop.setTarget("geral", ["A-USDT", "C-USDT"]);
    await h.flush();
    expect(h.flowCalls[1]).toEqual(["C-USDT"]); // A is still fresh
  });

  test("a new target cancels the round in flight: the old answers never land", async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => (release = resolve));
    const h = harness({ flowDelay: () => gate });
    h.loop.setTarget("geral", ["A-USDT"]);
    await h.flush();
    h.loop.setTarget("desempenho", ["B-USDT"]);
    release();
    await h.flush();
    expect(h.last().pressure.has("A-USDT") && (h.last().pressure.get("A-USDT") as unknown) !== "lendo").toBe(false);
  });

  test("with the page hidden nothing is read and the clock keeps ticking so it resumes", async () => {
    let visible = false;
    const h = harness({ visible: () => visible });
    h.loop.setTarget("geral", ["A-USDT"]);
    await h.flush();
    expect(h.flowCalls).toEqual([]);
    expect(h.timers.size).toBe(1);
    visible = true;
    await h.advance(PRESSURE_TTL_MS);
    expect(h.flowCalls).toHaveLength(1);
  });

  test("stop cancels the timer and anything in flight", async () => {
    const h = harness();
    h.loop.setTarget("geral", ["A-USDT"]);
    await h.flush();
    h.loop.stop();
    expect(h.timers.size).toBe(0);
    await h.advance(PRESSURE_TTL_MS * 2);
    expect(h.flowCalls).toHaveLength(1);
  });
});
