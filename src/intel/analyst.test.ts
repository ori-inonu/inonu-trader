// The glue of the flow engine: from the trades of a window, the closed candles and the history of past footprints to the
// numbers and candidates that go into the Evidence Brief. Everything is deterministic and honest about warm-up: what needs
// a threshold that does not exist yet is null with the reason `aquecimento` (FLX-12). origin: synthetic_fixture, tests only.
import { describe, expect, test } from "bun:test";
import { buildBrief } from "./brief";
import { HOLD_CANDIDATE, spotCandidate } from "./candidates";
import type { InstrumentMeta } from "./footprint";
import type { Trade } from "./ingest";
import type { ThresholdCandle } from "./thresholds";
import { analyze, type AnalystInput } from "./analyst";

const T0 = 1_800_000_000_000;
const MIN = 60_000;
const META: InstrumentMeta = { instId: "TEST-USDT", instType: "SPOT", tickSz: "0.5", lotSz: "1" };

/** Twenty closed one minute candles around 100 with a range of 2: ATR 2, bin of 1 tick. */
const candles = Array.from({ length: 21 }, (_, i) => ({ ts: T0 - (21 - i) * MIN, open: "100", high: "101", low: "99", close: "100" }));

/** Buying imbalance stacked at 99.0, 99.5 and 100.0 (levels 198 to 200), the heaviest volume at 99.5, price ends at 101. */
const trade = (ts: number, px: string, sz: number, side: "buy" | "sell"): Trade => ({ ts, px, sz: String(sz), side });
const window: Trade[] = [
  trade(T0 + 1_000, "99.0", 60, "buy"), trade(T0 + 1_100, "99.0", 10, "sell"),
  trade(T0 + 2_000, "99.5", 90, "buy"), trade(T0 + 2_100, "99.5", 10, "sell"),
  trade(T0 + 3_000, "100.0", 50, "buy"), trade(T0 + 3_100, "100.0", 8, "sell"),
  trade(T0 + 4_000, "101.0", 5, "buy"), trade(T0 + 4_100, "101.0", 5, "sell"),
];

/** Three past candles with 20 to 60 units per level: the thresholds come out of these. */
const history: ThresholdCandle[] = [0, 1, 2].map(() => ({ binTicks: 1, levels: [{ c: 10, v: 10 }, { c: 30, v: 10 }, { c: 20, v: 20 }] }));

const input = (over: Partial<AnalystInput> = {}): AnalystInput => ({ meta: META, trades: window, candles, history, nowMs: T0 + 5_000, prevZones: [], warmupCandles: 3, ...over });

describe("warm-up (FLX-12)", () => {
  test("with no history the flow factors are null with the reason aquecimento, while the plain measures are there", () => {
    const a = analyze(input({ history: [] }));
    expect(a.thresholds).toMatchObject({ ok: false, reason: "aquecimento", have: 0 });
    expect(a.fluxo.imb).toBeNull();
    expect(a.fluxo.seq).toBeNull();
    expect(a.fluxo.cvd).toBeNull();
    expect(a.nulos["fluxo.imb"]).toBe("aquecimento");
    expect(a.nulos["fluxo.cvd"]).toBe("aquecimento");
    expect(a.fluxo.delta).toBe(60 - 10 + 90 - 10 + 50 - 8 + 5 - 5);
    expect(a.fluxo.poc).toBeCloseTo(99.5, 10);
    expect(a.fluxo.janela).toMatchObject({ negocios: 8, desdeMs: T0 + 1_000, ateMs: T0 + 4_100 });
  });

  test("with the history the thresholds exist and the factors are computed", () => {
    const a = analyze(input());
    expect(a.thresholds.ok).toBe(true);
    expect(a.fluxo.imb).toEqual({ c: 3, v: 0 });
    expect(a.fluxo.seq).toEqual([{ lado: "c", nivelInicial: 198, nivelFinal: 200, comprimento: 3 }]);
    expect(a.nulos["fluxo.imb"]).toBeUndefined();
  });
});

describe("the sizes of the latest trades", () => {
  test("T comes from the sizes the collector kept when they are given, instead of the window's own", () => {
    // 100 trades of 1 unit and one of 900: P99 of the 101 sizes is the 100th value
    const sizes = [...Array.from({ length: 100 }, () => 1), 900];
    const a = analyze(input({ tradeUnits: sizes }));
    expect(a.thresholds).toMatchObject({ ok: true, t: 1 });
    const b = analyze(input({ tradeUnits: [...sizes, ...Array.from({ length: 200 }, () => 900)] }));
    expect(b.thresholds).toMatchObject({ ok: true, t: 900 });
  });
});

describe("the detail the chart layer draws", () => {
  test("with the thresholds it carries every level mark, the runs, the volume factor and the price of a level", () => {
    const { detail } = analyze(input());
    expect(detail.step).toBe(0.5);
    expect(detail.lowOf(198)).toBe(99);
    expect(detail.highOf(198)).toBe(99.5);
    expect(detail.imbalances).toEqual([{ level: 198, imb: "c" }, { level: 199, imb: "c" }, { level: 200, imb: "c" }]);
    expect(detail.sequences).toEqual([{ lado: "c", nivelInicial: 198, nivelFinal: 200, comprimento: 3 }]);
    expect(detail.volumeMarks).toEqual([{ level: 199, dominante: "c", total: 100 }]);
    expect(detail.progressions).toEqual([]);
    expect(detail.exhaustions).toEqual([]);
    expect(detail.profile).toMatchObject({ poc: 199 });
  });

  test("in warm-up the marks that need a threshold are empty, and the profile and the step are still there", () => {
    const { detail } = analyze(input({ history: [] }));
    expect(detail.imbalances).toEqual([]);
    expect(detail.sequences).toEqual([]);
    expect(detail.volumeMarks).toEqual([]);
    expect(detail.quantityAlerts).toEqual([]);
    expect(detail.profile.poc).toBe(199);
    expect(detail.step).toBe(0.5);
  });
});

describe("zones from the footprint and the profile", () => {
  test("the stacked buying imbalance and the point of control fuse into one active zone under the price", () => {
    const a = analyze(input());
    expect(a.price).toBe(101);
    expect(a.atr14).toBe(2);
    expect(a.zones!.visible).toHaveLength(1);
    const zone = a.zones!.visible[0]!;
    expect(zone).toMatchObject({ lado: "demanda", estado: "ativa", fatores: ["E2", "E3"] });
    expect(zone.baixo).toBeCloseTo(99, 10);
    expect(zone.alto).toBeCloseTo(100.5, 10);
    expect(a.candidates.map((c) => c.id)).toEqual([`zona:${zone.id}`]);
    expect(a.candidates[0]).toMatchObject({ tipo: "zona", estado: "ativa", fatores: ["E2", "E3"] });
    expect(a.candidates[0]!.limitesBps![0]).toBeLessThan(0);
  });

  test("the enabled families are the ones this engine really has, so the Brief can say so", () => {
    expect(analyze(input()).zones!.familiasHabilitadas).toEqual(["E2", "E3"]);
  });

  test("in warm-up only the profile family proposes, so no zone is active or offered", () => {
    const a = analyze(input({ history: [] }));
    expect(a.zones!.visible).toEqual([]);
    expect(a.candidates).toEqual([]);
    expect(a.zones!.zones.every((z) => z.estado === "fraca")).toBe(true);
  });

  test("a zone carried from the previous analysis keeps its identity", () => {
    const first = analyze(input());
    const second = analyze(input({ prevZones: first.zones!.next, nowMs: T0 + 65_000 }));
    expect(second.zones!.zones[0]!.id).toBe(first.zones!.zones[0]!.id);
  });

  test("without enough closed candles there is no ATR and no zones, with the reason", () => {
    const a = analyze(input({ candles: candles.slice(-10) }));
    expect(a.atr14).toBeNull();
    expect(a.zones).toBeNull();
    expect(a.candidates).toEqual([]);
    expect(a.nulos.zonas).toBe("atr_indisponivel");
  });

  test("without trades there is no price and nothing to say", () => {
    const a = analyze(input({ trades: [] }));
    expect(a.price).toBeNull();
    expect(a.zones).toBeNull();
    expect(a.nulos.zonas).toBe("sem_negocios");
    expect(a.fluxo.delta).toBeNull();
  });
});

describe("into the Brief", () => {
  test("what the analysis produces fits the Brief, in 2 KB, deterministic, with no order word", () => {
    const run = () => {
      const a = analyze(input());
      return buildBrief({
        alvo: { instId: META.instId },
        asOfMs: T0 + 5_000,
        familiasHabilitadas: a.zones!.familiasHabilitadas,
        fluxo: a.fluxo as never,
        candidatos: [...a.candidates, spotCandidate(META.instId), HOLD_CANDIDATE],
        trilha: null,
        risco: null,
        regime: null,
        idades: { fluxo: 900 },
        origens: { fluxo: "okx_public_v5" },
        nulos: a.nulos,
      });
    };
    const a = run();
    expect(a.bytes).toBeLessThanOrEqual(2048);
    expect(run().json).toBe(a.json);
    for (const word of ["comprar", "compre", "vender", "venda", "buy", "sell", "hold", "action", "signal", "recommend", "vote", "side", "sinal"]) expect(new RegExp(`\\b${word}\\b`, "i").test(a.json)).toBe(false);
  });

  test("the same input twice gives the same analysis", () => {
    expect(JSON.stringify(analyze(input()))).toBe(JSON.stringify(analyze(input())));
  });
});
