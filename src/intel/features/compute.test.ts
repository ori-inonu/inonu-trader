import { describe, expect, test } from "bun:test";
import { Rng } from "../../lab/rng";
import { closedBars, computeFeatures } from "./compute";
import { FEATURE_NAMES, INTERVAL_MS, type Bar, type FeatureInput, type FlowInput, type Interval } from "./types";

const ASOF = 1_760_000_000_000 - (1_760_000_000_000 % INTERVAL_MS["4h"]); // aligned to every interval

/** A seeded random walk of `count` closed bars ending right before `endTs`. */
function walk(interval: Interval, count: number, seed: number, endTs = ASOF, start = 100): Bar[] {
  const rng = new Rng(seed, interval);
  const ms = INTERVAL_MS[interval];
  const sigma = 0.0015 * Math.sqrt(ms / INTERVAL_MS["5m"]);
  const out: Bar[] = [];
  let price = start;
  for (let i = 0; i < count; i += 1) {
    const open = price;
    const close = open * Math.exp(sigma * rng.normal());
    const spread = Math.abs(sigma * rng.normal()) * open * 0.5;
    out.push({ ts: endTs - (count - i) * ms, open, high: Math.max(open, close) + spread, low: Math.min(open, close) - spread, close, volume: 10 + rng.next() * 5, confirmed: true });
    price = close;
  }
  return out;
}

const fullBars = (seed = 1) => ({ "5m": walk("5m", 400, seed), "15m": walk("15m", 400, seed + 1), "1h": walk("1h", 200, seed + 2), "4h": walk("4h", 100, seed + 3) });

function input(over: Partial<FeatureInput> = {}): FeatureInput {
  const bars = fullBars();
  return { instId: "ETH-USDT", asOfMs: ASOF, price: bars["15m"][bars["15m"].length - 1]!.close, bars, btc15m: walk("15m", 400, 77, ASOF, 5000), spreadBps: 2, feeAndSlippageRoundTripBps: 22, regime: null, flow: null, ...over };
}

describe("shape of the vector (REC-5)", () => {
  test("every name is there, in order, and every null has a reason", () => {
    const v = computeFeatures(input());
    expect(v.v).toBe(1);
    expect(Object.keys(v.values)).toEqual([...FEATURE_NAMES]);
    for (const name of FEATURE_NAMES) {
      const value = v.values[name];
      expect(value === null || Number.isFinite(value), name).toBe(true);
      if (value === null) expect(v.nulos[name], `${name} is null without a reason`).toBeDefined();
    }
    expect(FEATURE_NAMES.length).toBe(new Set(FEATURE_NAMES).size);
  });

  test("with enough bars the candle features are all known; flow and derivatives say why they are not", () => {
    const v = computeFeatures(input());
    for (const name of ["trend.regime15m", "trend.adx15m", "trend.ema1h", "trend.ema4h", "mom.rsi5m", "mom.rsi1h", "mom.macdAtr15m", "vol.atrBps15m", "vol.atrBps1h", "vol.rank24h", "vol.bbWidthRank15m", "str.donchianPos1h", "smc15.rangePos", "x.corrBtc48h", "x.betaBtc48h", "x.relStr24hBps", "cost.roundTripBps", "cost.moveToCost1h"]) {
      expect(v.values[name], name).not.toBeNull();
    }
    expect(v.nulos["flow.deltaRatio"]).toBe("sem_motor_de_fluxo");
    expect(v.nulos["drv.fundingBps"]).toBe("so_existe_para_perpetuos");
  });

  test("a bad price is refused instead of producing numbers", () => {
    expect(() => computeFeatures(input({ price: 0 }))).toThrow(RangeError);
    expect(() => computeFeatures(input({ price: Number.NaN }))).toThrow(RangeError);
  });
});

describe("no look-ahead (REC-4)", () => {
  test("bars that open after the moment, or are not confirmed, change nothing", () => {
    const past = fullBars(5);
    const base = computeFeatures(input({ bars: past }));
    const future: Record<Interval, Bar[]> = {
      "5m": [...past["5m"], ...walk("5m", 30, 9, ASOF + 30 * INTERVAL_MS["5m"], 400)],
      "15m": [...past["15m"], ...walk("15m", 10, 9, ASOF + 10 * INTERVAL_MS["15m"], 400)],
      "1h": [...past["1h"], ...walk("1h", 5, 9, ASOF + 5 * INTERVAL_MS["1h"], 400)],
      "4h": [...past["4h"], ...walk("4h", 3, 9, ASOF + 3 * INTERVAL_MS["4h"], 400)],
    };
    // and a bar that has started but is not confirmed yet, at the very end of the past
    const forming: Bar = { ...past["15m"][past["15m"].length - 1]!, ts: ASOF - INTERVAL_MS["15m"] / 2, close: 1, high: 1000, low: 0.5, confirmed: false };
    future["15m"] = [...future["15m"], forming];
    const withFuture = computeFeatures(input({ bars: future, price: base.values["cost.spreadBps"] === null ? 1 : input({ bars: past }).price }));
    expect(withFuture).toEqual(base);
  });

  test("the same holds at many moments inside the series", () => {
    const bars = fullBars(11);
    for (const k of [250, 300, 333, 380]) {
      const asOf = bars["15m"][k]!.ts + INTERVAL_MS["15m"];
      const price = bars["15m"][k]!.close;
      const cut = Object.fromEntries((Object.keys(bars) as Interval[]).map((i) => [i, bars[i].filter((b) => b.ts + INTERVAL_MS[i] <= asOf)])) as Record<Interval, Bar[]>;
      const all = computeFeatures({ ...input({ bars, price }), asOfMs: asOf, btc15m: null });
      const onlyPast = computeFeatures({ ...input({ bars: cut, price }), asOfMs: asOf, btc15m: null });
      expect(all, `at bar ${k}`).toEqual(onlyPast);
    }
  });

  test("closedBars keeps one bar per open time and drops unconfirmed, open and invalid bars", () => {
    const b = (ts: number, over: Partial<Bar> = {}): Bar => ({ ts, open: 10, high: 11, low: 9, close: 10, volume: 1, confirmed: true, ...over });
    const out = closedBars([b(0), b(0, { close: 10.5 }), b(900_000), b(1_800_000, { confirmed: false }), b(2_700_000, { high: 8 }), b(3_600_000, { open: Number.NaN })], "15m", 3_000_000);
    expect(out.map((x) => [x.ts, x.close])).toEqual([[0, 10.5], [900_000, 10]]);
    expect(closedBars(undefined, "15m", 1)).toEqual([]);
  });
});

describe("freshness", () => {
  test("an interval whose last closed bar is older than three bars is not used, and says so", () => {
    const bars = fullBars(3);
    const stale = { ...bars, "1h": bars["1h"].filter((x) => x.ts + INTERVAL_MS["1h"] <= ASOF - 5 * INTERVAL_MS["1h"]) };
    const v = computeFeatures(input({ bars: stale }));
    expect(v.nulos.bars1h).toBe("velas_velhas");
    expect(v.values["vol.atrBps1h"]).toBeNull();
    expect(v.nulos["vol.atrBps1h"]).toBeDefined();
    expect(v.values["vol.atrBps15m"]).not.toBeNull();
  });
  test("missing intervals give null with the reason of the interval", () => {
    const v = computeFeatures(input({ bars: {} }));
    expect(v.nulos["trend.adx15m"]).toBe("poucas_velas_15m");
    expect(v.nulos["trend.ema4h"]).toBe("poucas_velas_4h");
    expect(v.nulos["smc15.rangePos"]).toBe("poucas_velas");
  });
});

describe("hand cases", () => {
  const flatBars = (interval: Interval, count: number, close: number, half: number): Bar[] => {
    const ms = INTERVAL_MS[interval];
    return Array.from({ length: count }, (_, i) => ({ ts: ASOF - (count - i) * ms, open: close, high: close + half, low: close - half, close, volume: 1, confirmed: true }));
  };
  test("cost: a constant 2 percent hourly range against 22 bps of fees plus a 2 bps spread", () => {
    const v = computeFeatures(input({ price: 100, bars: { "1h": flatBars("1h", 60, 100, 1) } }));
    expect(v.values["vol.atrBps1h"]).toBe(200);
    expect(v.values["cost.roundTripBps"]).toBe(24);
    expect(v.values["cost.moveToCost1h"]).toBe(8.33);
  });
  test("an unknown spread makes the cost unknown, never zero", () => {
    const v = computeFeatures(input({ price: 100, spreadBps: null, bars: { "1h": flatBars("1h", 60, 100, 1) } }));
    expect(v.values["cost.roundTripBps"]).toBeNull();
    expect(v.nulos["cost.roundTripBps"]).toBe("spread_desconhecido");
    expect(v.values["cost.moveToCost1h"]).toBeNull();
  });
  test("EMA stack is +1 on a steady rise and -1 on a steady fall", () => {
    const ramp = (interval: Interval, step: number): Bar[] => {
      const ms = INTERVAL_MS[interval];
      return Array.from({ length: 80 }, (_, i) => {
        const close = 200 + step * i;
        return { ts: ASOF - (80 - i) * ms, open: close - step, high: Math.max(close, close - step) + 0.1, low: Math.min(close, close - step) - 0.1, close, volume: 1, confirmed: true };
      });
    };
    const up = computeFeatures(input({ price: 280, bars: { "15m": ramp("15m", 1), "1h": ramp("1h", 1), "4h": ramp("4h", 1) } }));
    expect([up.values["trend.ema15m"], up.values["trend.ema1h"], up.values["trend.ema4h"]]).toEqual([1, 1, 1]);
    expect(up.values["trend.regime15m"]).toBe(1);
    const down = computeFeatures(input({ price: 120, bars: { "15m": ramp("15m", -1), "1h": ramp("1h", -1), "4h": ramp("4h", -1) } }));
    expect([down.values["trend.ema15m"], down.values["trend.ema1h"], down.values["trend.ema4h"]]).toEqual([-1, -1, -1]);
    expect(down.values["trend.regime15m"]).toBe(-1);
  });
  test("BTC itself has no cross asset block", () => {
    const v = computeFeatures(input({ instId: "BTC-USDT" }));
    expect(v.nulos["x.betaBtc48h"]).toBe("e_o_proprio_btc");
  });
  test("derivatives: funding and the hour change of open interest come as given", () => {
    const v = computeFeatures(input({ regime: { funding: 1.234567, oiVar: null } }));
    expect(v.values["drv.fundingBps"]).toBe(1.235);
    expect(v.values["drv.oiVar1hPct"]).toBeNull();
    expect(v.nulos["drv.oiVar1hPct"]).toBe("aquecimento");
  });
});

describe("flow and zones", () => {
  const flow = (over: Partial<FlowInput> = {}): FlowInput => ({
    warm: true,
    deltaRatio: 0.25,
    imb: { c: 3, v: 1 },
    seqCount: 1,
    prgCount: 0,
    exhCount: 2,
    absorption: { side: "v", volumeRatio: 2.456 },
    poc: 99,
    val: 98,
    vah: 101,
    zones: [
      { lado: "demanda", baixo: 94, alto: 96, nota: 60, estado: "ativa", families: 2 },
      { lado: "demanda", baixo: 97, alto: 98.5, nota: 40, estado: "testada", families: 3 },
      { lado: "demanda", baixo: 80, alto: 82, nota: 90, estado: "fraca", families: 1 },
      { lado: "oferta", baixo: 103, alto: 104, nota: 55, estado: "ativa", families: 2 },
    ],
    ageMs: 1200,
    ...over,
  });
  const at = (f: FlowInput | null) => computeFeatures(input({ price: 100, flow: f }));

  test("measures come out in basis points of the price and the nearest live zone of each side is chosen", () => {
    const v = at(flow());
    expect(v.values["flow.pocBps"]).toBe(-100);
    expect(v.values["flow.vahBps"]).toBe(100);
    expect(v.values["flow.deltaRatio"]).toBe(0.25);
    expect([v.values["flow.imbC"], v.values["flow.imbV"], v.values["flow.seqN"], v.values["flow.exhN"]]).toEqual([3, 1, 1, 2]);
    expect([v.values["flow.absorbSide"], v.values["flow.absorbRatio"]]).toEqual([1, 2.46]);
    expect([v.values["zone.demandBps"], v.values["zone.demandNota"], v.values["zone.demandTested"], v.values["zone.demandFamilies"]]).toEqual([150, 40, 1, 3]);
    expect([v.values["zone.supplyBps"], v.values["zone.supplyNota"], v.values["zone.supplyTested"]]).toEqual([300, 55, 0]);
    expect(v.values["zone.count"]).toBe(3); // the weak zone is not counted
    expect(v.idades.flow).toBe(1200);
  });
  test("while the thresholds are being learned the factors are null with the reason, but the plain measures stay", () => {
    const v = at(flow({ warm: false, imb: null, seqCount: null, prgCount: null, exhCount: null }));
    expect(v.values["flow.warm"]).toBe(0);
    for (const name of ["flow.imbC", "flow.seqN", "flow.exhN", "flow.absorbSide", "flow.absorbRatio"]) expect(v.nulos[name], name).toBe("aquecimento");
    expect(v.values["flow.pocBps"]).toBe(-100);
  });
  test("no absorption while warm is a zero, because the engine looked and found none", () => {
    const v = at(flow({ absorption: null }));
    expect([v.values["flow.absorbSide"], v.values["flow.absorbRatio"]]).toEqual([0, 0]);
  });
  test("no zone on a side is null with a reason; an inside zone is at distance zero", () => {
    const v = at(flow({ zones: [{ lado: "demanda", baixo: 99, alto: 101, nota: 70, estado: "ativa", families: 2 }] }));
    expect(v.values["zone.demandBps"]).toBe(0);
    expect(v.values["zone.supplyBps"]).toBeNull();
    expect(v.nulos["zone.supplyBps"]).toBe("sem_zona");
  });
});
