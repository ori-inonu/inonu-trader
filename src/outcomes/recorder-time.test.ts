// REC-4 (found by the independent audit of 2026-10-13): nothing measured AFTER the instant of a snapshot may be written into it.
// The instant is the end of the collection (every block was captured at or before it); a flow or zone block whose own time is later
// than the instant is dropped with a stable reason, never written as "age zero". origin: synthetic_fixture, tests only.
import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { analyze } from "../intel/analyst";
import type { InstrumentMeta } from "../intel/footprint";
import type { Trade } from "../intel/ingest";
import type { ThresholdCandle } from "../intel/thresholds";
import { flowInputFromAnalysis } from "../intel/features/from-analysis";
import type { Bar } from "../intel/features/types";
import type { OkxBars } from "./okx-bars";
import { createRecorder, type RecorderDeps } from "./recorder";
import { createOutcomeStore } from "./store";

const dirs: string[] = [];
const tmp = (): string => {
  const d = mkdtempSync(join(tmpdir(), "inonu-rectime-"));
  dirs.push(d);
  return d;
};
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

const T0 = 1_800_000_000_000 - (1_800_000_000_000 % 14_400_000);
const META: InstrumentMeta = { instId: "TEST-USDT", instType: "SPOT", tickSz: "0.5", lotSz: "1" };
const candles1m = Array.from({ length: 21 }, (_, i) => ({ ts: T0 - (21 - i) * 60_000, open: "100", high: "101", low: "99", close: "100" }));
const trade = (ts: number, px: string, sz: number, side: "buy" | "sell"): Trade => ({ ts, px, sz: String(sz), side });
const trades = [trade(T0 + 1_000, "99.0", 60, "buy"), trade(T0 + 1_100, "99.0", 10, "sell"), trade(T0 + 2_000, "99.5", 90, "buy"), trade(T0 + 2_100, "99.5", 10, "sell"), trade(T0 + 3_000, "100.0", 50, "buy"), trade(T0 + 3_100, "100.0", 8, "sell")];
const history: ThresholdCandle[] = [0, 1, 2].map(() => ({ binTicks: 1, levels: [{ c: 10, v: 10 }, { c: 30, v: 10 }, { c: 20, v: 20 }] }));
const analysis = () => analyze({ meta: META, trades, candles: candles1m, history, nowMs: T0 + 5_000, prevZones: [], warmupCandles: 3 });

const noBars: Bar[] = [];
function build(clock: { now: number }, quoteTakes: number, analysisAt: (now: number) => number) {
  const api: OkxBars = {
    async bars() {
      return noBars;
    },
    async history() {
      return noBars;
    },
    async quote() {
      clock.now += quoteTakes; // the clock moves while the exchange answers
      return { last: 100, bid: 99.99, ask: 100.01, mid: 100, spreadBps: 2 };
    },
  };
  const store = createOutcomeStore({ dir: tmp(), now: () => clock.now });
  const deps: RecorderDeps = {
    store, bars: api, analysis: async () => ({ analysis: analysis(), nowMs: analysisAt(clock.now) }), regime: async () => null, instruments: () => ["TEST-USDT"],
    now: () => clock.now, newId: () => "id", feeAndSlippageRoundTripBps: { spot: 22, perp: 12 }, enabled: () => true,
  };
  return { recorder: createRecorder(deps), store };
}

describe("the instant of a snapshot is the end of its collection", () => {
  test("a clock that moves while the exchange answers: the flow read afterwards is NOT from the future of the snapshot", async () => {
    const clock = { now: T0 + 4_000 };
    const { recorder } = build(clock, 5_000, (now) => now); // the quote ends at T0 + 9000; the analysis is read at that time
    const s = (await recorder.snapshotNow("TEST-USDT", "relogio"))!;
    expect(s.asOfMs).toBeGreaterThanOrEqual(T0 + 9_000); // not the start of the collection
    expect(s.features.asOfMs).toBe(s.asOfMs);
    expect(s.features.values["flow.warm"]).toBe(1);
    expect(s.features.idades.flow!).toBeGreaterThanOrEqual(0);
    // bought minus sold over everything traded, three decimals (from-analysis.ts, the same share the Brief carries): (200 - 28) / 228
    expect(s.features.values["flow.deltaRatio"]).toBe(0.754);
  });

  test("a flow block whose own time is later than the instant is dropped with a stable reason, and so are the zones it carries", async () => {
    const clock = { now: T0 + 4_000 };
    const { recorder } = build(clock, 0, (now) => now + 10_000); // the engine says it read ten seconds AFTER the recorder's own clock
    const s = (await recorder.snapshotNow("TEST-USDT", "relogio"))!;
    expect(s.features.values["flow.deltaRatio"]).toBeNull();
    expect(s.features.nulos["flow.deltaRatio"]).toBe("fluxo_posterior_ao_instante");
    expect(s.features.values["flow.warm"]).toBeNull();
    expect(s.zones).toEqual({ demanda: null, oferta: null, todas: [] });
    expect(recorder.status().skipped.fluxo_do_futuro).toBe(1);
  });

  test("trades that happened after the instant are not in the flow, whatever the engine says its time is", async () => {
    const clock = { now: T0 + 500 }; // the last trade of the window is at T0 + 3100
    const { recorder } = build(clock, 0, (now) => now);
    const s = (await recorder.snapshotNow("TEST-USDT", "relogio"))!;
    expect(s.features.nulos["flow.deltaRatio"]).toBe("fluxo_posterior_ao_instante");
    expect(s.features.values["flow.pocBps"]).toBeNull(); // the name in FEATURE_NAMES; an unknown name would read undefined and prove nothing
    expect(s.features.nulos["flow.pocBps"]).toBe("fluxo_posterior_ao_instante");
  });
});

describe("the flow reducer does not turn the future into age zero", () => {
  test("a window that ends after the instant is refused, one that ends before it has its age", () => {
    const a = analysis();
    const last = a.fluxo.janela.ateMs!;
    expect(flowInputFromAnalysis(a, last - 1)).toBeNull();
    expect(flowInputFromAnalysis(a, last)!.ageMs).toBe(0);
    expect(flowInputFromAnalysis(a, last + 2_500)!.ageMs).toBe(2_500);
  });
});
