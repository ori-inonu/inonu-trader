// T5.7, T6.4, T7.5: the chart layer of Inonu. Zones behind the candles, the measured flow on the right edge, and the marker of
// the model's decision on top. Every label of the engine is DESCRIPTIVE (demand, supply, measured levels); only the decision chip
// carries the model's own words (comprar, vender, manter). Nothing animated, plain ASCII. origin: synthetic_fixture, tests only.
import { describe, expect, test } from "bun:test";
import type { ChartOverlay } from "@/lib/inonu/overlay";
import type { DeskCandle } from "../types";
import { DEFAULT_PALETTE } from "../ui/canvas";
import { type CandleChartInput, computeGeometry, drawChart } from "../ui/draw-chart";
import { RecordingContext } from "../ui/recording-context";
import { MAX_ZONES_DRAWN, ageText, drawInonuBehind, drawInonuFront, type ChartDecision, type InonuLayerInput } from "./inonu-layer";

const T0 = Date.UTC(2026, 9, 11, 12, 0, 0);
const candle = (i: number): DeskCandle => {
  const open = 100 + i;
  const close = open + (i % 2 === 0 ? 1 : -1);
  return { tsMs: T0 + i * 60_000, open, high: Math.max(open, close) + 2, low: Math.min(open, close) - 2, close, volBase: 10, volQuote: 1000, confirmed: true };
};
const candles = Array.from({ length: 40 }, (_, i) => candle(i));
const base: CandleChartInput = { width: 600, height: 360, dpr: 1, candles, bar: "1m", decimals: 1, last: null, vwap: null, hover: null, palette: DEFAULT_PALETTE, font: '10.5px "Geist Mono", monospace' };
const geom = computeGeometry(base);
const FONT = base.font;

const overlay = (over: Partial<ChartOverlay> = {}): ChartOverlay => ({
  instId: "BTC-USDT", asOfMs: T0, fonte: "okx_ws_trades", price: 130, atr14: 2, tickSz: "0.5", step: 0.5, binTicks: 1,
  aquecimento: { fechadas: 50, necessarias: 50, pronto: true, restaurado: 0 },
  niveis: [
    { baixo: 128, alto: 128.5, c: 60, v: 10, imb: "c", volume: null, alerta: { c: true, v: false } },
    { baixo: 128.5, alto: 129, c: 90, v: 10, imb: "c", volume: "c", alerta: null },
    { baixo: 129, alto: 129.5, c: 50, v: 8, imb: "c", volume: null, alerta: null },
    { baixo: 131, alto: 131.5, c: 5, v: 40, imb: "v", volume: null, alerta: null },
  ],
  corridas: { sequencial: [{ lado: "c", baixo: 128, alto: 129.5, n: 3 }], progressao: [], exaustao: [] },
  perfil: { poc: { baixo: 128.5, alto: 129 }, val: 128, vah: 129.5, hvn: [], lvn: [] },
  absorcao: null,
  zonas: [{ id: "a1b2c3d4e5f6", lado: "demanda", baixo: 128, alto: 129.5, nota: 72.2, estado: "ativa", fatores: ["E2", "E3"], idadeBarras: 0, invalidacao: 127.8, primeiroTs: T0 + 30 * 60_000 }],
  ...over,
});

const layer = (over: Partial<InonuLayerInput> = {}): InonuLayerInput => ({ overlay: overlay(), decision: null, show: { zones: true, flow: true, decision: true }, nowMs: T0 + 100 * 60_000, ...over });
const texts = (ctx: RecordingContext) => ctx.of("fillText").map((c) => String(c.args[0]));

describe("zones (behind the candles)", () => {
  test("a demand zone is a translucent box in the buy tone from its birth to the right edge, labelled with side and score", () => {
    const ctx = new RecordingContext();
    drawInonuBehind(ctx, geom, candles, layer(), DEFAULT_PALETTE, 1, FONT);
    const fill = ctx.of("fillRect").find((c) => c.fillStyle.startsWith("rgba(61,220,151"));
    expect(fill).toBeDefined();
    const [x, y, w, h] = fill!.args as number[];
    expect(x).toBeGreaterThan(geom.plot.x);
    expect(x + w!).toBeCloseTo(geom.plot.x + geom.plot.w, 0);
    expect(y!).toBeCloseTo(geom.yPrice(129.5), 0);
    expect(h!).toBeGreaterThan(1);
    expect(texts(ctx)).toContain("Demanda 72");
  });

  test("supply is in the sell tone, and a tested zone says so and has a dashed border", () => {
    const ctx = new RecordingContext();
    const zonas = [{ ...overlay().zonas[0]!, lado: "oferta" as const, estado: "testada" as const, baixo: 133, alto: 134.5, invalidacao: 134.7 }];
    drawInonuBehind(ctx, geom, candles, layer({ overlay: overlay({ zonas }) }), DEFAULT_PALETTE, 1, FONT);
    expect(ctx.of("fillRect").some((c) => c.fillStyle.startsWith("rgba(255,107,129"))).toBe(true);
    expect(texts(ctx)).toContain("Oferta 72 testada");
    expect(ctx.of("setLineDash").some((c) => c.args.length > 0)).toBe(true);
  });

  test("the invalidation level is a dotted line across the zone", () => {
    const ctx = new RecordingContext();
    drawInonuBehind(ctx, geom, candles, layer(), DEFAULT_PALETTE, 1, FONT);
    const dotted = ctx.of("setLineDash").filter((c) => c.args.length === 2 && c.args[0] === 1);
    expect(dotted.length).toBeGreaterThan(0);
  });

  test("a zone outside the visible price range is not drawn, and at most six are", () => {
    const ctx = new RecordingContext();
    const off = { ...overlay().zonas[0]!, baixo: 500, alto: 501, invalidacao: 499 };
    drawInonuBehind(ctx, geom, candles, layer({ overlay: overlay({ zonas: [off] }) }), DEFAULT_PALETTE, 1, FONT);
    expect(ctx.of("fillRect")).toEqual([]);
    const many = Array.from({ length: 10 }, (_, i) => ({ ...overlay().zonas[0]!, id: `z${i}`, baixo: 110 + i * 2, alto: 111 + i * 2, invalidacao: 109 + i * 2 }));
    const ctx2 = new RecordingContext();
    drawInonuBehind(ctx2, geom, candles, layer({ overlay: overlay({ zonas: many }) }), DEFAULT_PALETTE, 1, FONT);
    expect(ctx2.of("fillRect").filter((c) => c.fillStyle.startsWith("rgba(61,220,151")).length).toBeLessThanOrEqual(MAX_ZONES_DRAWN);
  });

  test("the filter turns it off, and no overlay draws nothing", () => {
    const off = new RecordingContext();
    drawInonuBehind(off, geom, candles, layer({ show: { zones: false, flow: true, decision: true } }), DEFAULT_PALETTE, 1, FONT);
    expect(off.calls.filter((c) => c.op === "fillRect")).toEqual([]);
    const none = new RecordingContext();
    drawInonuBehind(none, geom, candles, layer({ overlay: null }), DEFAULT_PALETTE, 1, FONT);
    expect(none.calls).toEqual([]);
  });
});

describe("flow (on the right edge)", () => {
  test("every visible level is a bar grown from the right edge, buying and selling in their tones, scaled to the busiest level", () => {
    const ctx = new RecordingContext();
    drawInonuFront(ctx, geom, candles, layer(), DEFAULT_PALETTE, 1, FONT);
    const right = geom.plot.x + geom.plot.w;
    const bars = ctx.of("fillRect").filter((c) => c.fillStyle.startsWith("rgba(61,220,151") || c.fillStyle.startsWith("rgba(255,107,129"));
    expect(bars.length).toBeGreaterThanOrEqual(4);
    for (const bar of bars) {
      const [x, , w] = bar.args as number[];
      expect(x! + w!).toBeLessThanOrEqual(right + 0.01);
    }
    // the busiest level (100 units) is the longest bar
    const widths = ctx.of("fillRect").filter((c) => c.fillStyle.startsWith("rgba(61,220,151")).map((c) => (c.args as number[])[2]!);
    expect(Math.max(...widths)).toBeGreaterThan(Math.min(...widths));
  });

  test("measured imbalances are triangles in the side\x27s tone, the Fator Volume is an outline", () => {
    const ctx = new RecordingContext();
    drawInonuFront(ctx, geom, candles, layer(), DEFAULT_PALETTE, 1, FONT);
    expect(ctx.of("fill").filter((c) => c.fillStyle.startsWith("rgba(61,220,151") || c.fillStyle === DEFAULT_PALETTE.buy).length).toBeGreaterThanOrEqual(3);
    expect(ctx.of("strokeRect").length).toBeGreaterThanOrEqual(1);
  });

  test("the stacked imbalance is a bracket labelled Seq and its length", () => {
    const ctx = new RecordingContext();
    drawInonuFront(ctx, geom, candles, layer(), DEFAULT_PALETTE, 1, FONT);
    expect(texts(ctx)).toContain("Seq 3");
  });

  test("the point of control and the value area are lines across the plot with their names", () => {
    const ctx = new RecordingContext();
    drawInonuFront(ctx, geom, candles, layer(), DEFAULT_PALETTE, 1, FONT);
    expect(texts(ctx)).toEqual(expect.arrayContaining(["POC", "VAL", "VAH"]));
  });

  test("progression, exhaustion and absorption are named when they exist", () => {
    const ctx = new RecordingContext();
    const o = overlay({
      corridas: { sequencial: [], progressao: [{ lado: "c", baixo: 128, alto: 129.5, n: 3 }], exaustao: [{ extremo: "baixo", baixo: 128, alto: 129, n: 3 }] },
      absorcao: { lado: "v", razaoVolume: 1.25 },
    });
    drawInonuFront(ctx, geom, candles, layer({ overlay: o }), DEFAULT_PALETTE, 1, FONT);
    expect(texts(ctx)).toEqual(expect.arrayContaining(["Prog 3", "Exaustao 3", "Absorcao v x1.3"]));
  });

  test("during the warm-up the marks that need a threshold are absent and the strip says how far it is", () => {
    const warm = overlay({
      aquecimento: { fechadas: 3, necessarias: 50, pronto: false, restaurado: 0 },
      niveis: overlay().niveis.map((n) => ({ ...n, imb: null, volume: null, alerta: null })),
      corridas: { sequencial: [], progressao: [], exaustao: [] },
      zonas: [],
    });
    const ctx = new RecordingContext();
    drawInonuFront(ctx, geom, candles, layer({ overlay: warm }), DEFAULT_PALETTE, 1, FONT);
    expect(texts(ctx)).toContain("Fluxo aquecendo 3/50");
    expect(texts(ctx).some((t) => t.startsWith("Seq"))).toBe(false);
    expect(ctx.of("strokeRect")).toEqual([]);
  });

  test("a level out of the visible range is not drawn, and the filter turns the whole flow off", () => {
    const ctx = new RecordingContext();
    const far = overlay({ niveis: [{ baixo: 900, alto: 900.5, c: 5, v: 5, imb: null, volume: null, alerta: null }], corridas: { sequencial: [], progressao: [], exaustao: [] }, perfil: { poc: null, val: null, vah: null, hvn: [], lvn: [] } });
    drawInonuFront(ctx, geom, candles, layer({ overlay: far }), DEFAULT_PALETTE, 1, FONT);
    expect(ctx.of("fillRect").filter((c) => c.fillStyle.startsWith("rgba(61"))).toEqual([]);
    const off = new RecordingContext();
    drawInonuFront(off, geom, candles, layer({ show: { zones: true, flow: false, decision: false } }), DEFAULT_PALETTE, 1, FONT);
    expect(off.calls).toEqual([]);
  });
});

describe("the decision of the model", () => {
  const decision = (over: Partial<ChartDecision> = {}): ChartDecision => ({ action: "buy", candidateId: "spot:BTC-USDT", atMs: T0 + 97 * 60_000, instId: "BTC-USDT", modelo: "jev-latest", ...over });

  test("a chip at the right edge with the model\x27s own word and the age; the model is the provenance, not the code", () => {
    const ctx = new RecordingContext();
    drawInonuFront(ctx, geom, candles, layer({ decision: decision() }), DEFAULT_PALETTE, 1, FONT);
    expect(texts(ctx)).toContain("Inonu: comprar, ha 3 min");
  });

  test("it sits at the price of the zone the model chose, or at the last price for an instrument", () => {
    const zoneCtx = new RecordingContext();
    drawInonuFront(zoneCtx, geom, candles, layer({ decision: decision({ candidateId: "zona:a1b2c3d4e5f6" }) }), DEFAULT_PALETTE, 1, FONT);
    const zoneChip = zoneCtx.of("fillText").find((c) => String(c.args[0]).startsWith("Inonu:"))!;
    expect(zoneChip.args[2] as number).toBeCloseTo(geom.yPrice((128 + 129.5) / 2), -1);
    const spotCtx = new RecordingContext();
    drawInonuFront(spotCtx, geom, candles, layer({ decision: decision() }), DEFAULT_PALETTE, 1, FONT);
    const spotChip = spotCtx.of("fillText").find((c) => String(c.args[0]).startsWith("Inonu:"))!;
    expect(spotChip.args[2] as number).toBeCloseTo(geom.yPrice(130), -1);
  });

  test("selling and holding have their words; holding has no price to sit on and goes to the top corner", () => {
    const sell = new RecordingContext();
    drawInonuFront(sell, geom, candles, layer({ decision: decision({ action: "sell" }) }), DEFAULT_PALETTE, 1, FONT);
    expect(texts(sell)).toContain("Inonu: vender, ha 3 min");
    const hold = new RecordingContext();
    drawInonuFront(hold, geom, candles, layer({ decision: decision({ action: "hold", candidateId: null }) }), DEFAULT_PALETTE, 1, FONT);
    const chip = hold.of("fillText").find((c) => String(c.args[0]).startsWith("Inonu:"))!;
    expect(String(chip.args[0])).toBe("Inonu: esperar, ha 3 min");
    expect(chip.args[2] as number).toBeLessThan(geom.plot.y + 30);
  });

  test("a decision about another instrument, a filtered one, or one without an overlay is not drawn", () => {
    const other = new RecordingContext();
    drawInonuFront(other, geom, candles, layer({ decision: decision({ instId: "ETH-USDT" }) }), DEFAULT_PALETTE, 1, FONT);
    expect(texts(other).some((t) => t.startsWith("Inonu:"))).toBe(false);
    const filtered = new RecordingContext();
    drawInonuFront(filtered, geom, candles, layer({ decision: decision(), show: { zones: true, flow: true, decision: false } }), DEFAULT_PALETTE, 1, FONT);
    expect(texts(filtered).some((t) => t.startsWith("Inonu:"))).toBe(false);
  });

  test("with the flow layer off the decision is still drawn, at the last known price", () => {
    const ctx = new RecordingContext();
    drawInonuFront(ctx, geom, candles, layer({ decision: decision(), show: { zones: true, flow: false, decision: true }, overlay: overlay() }), DEFAULT_PALETTE, 1, FONT);
    expect(texts(ctx)).toContain("Inonu: comprar, ha 3 min");
    expect(texts(ctx)).not.toContain("POC");
  });
});

describe("rules of the interface", () => {
  test("every label is plain ASCII, and the engine labels carry no word of an order (FLX-10)", () => {
    const ctx = new RecordingContext();
    drawInonuBehind(ctx, geom, candles, layer(), DEFAULT_PALETTE, 1, FONT);
    drawInonuFront(ctx, geom, candles, layer({ overlay: overlay({ absorcao: { lado: "c", razaoVolume: 2 }, corridas: { sequencial: [{ lado: "v", baixo: 131, alto: 131.5, n: 2 }], progressao: [{ lado: "v", baixo: 131, alto: 131.5, n: 2 }], exaustao: [{ extremo: "alto", baixo: 131, alto: 131.5, n: 2 }] } }) }), DEFAULT_PALETTE, 1, FONT);
    for (const text of texts(ctx)) {
      expect(/^[\x20-\x7e]*$/.test(text)).toBe(true);
      for (const word of ["comprar", "compre", "vender", "venda", "buy", "sell", "hold", "action", "signal", "recommend", "vote", "side", "sinal"]) expect(new RegExp(`\\b${word}\\b`, "i").test(text)).toBe(false);
    }
  });

  test("nothing blinks or pulses: the source has no timers, animation frames or keyframes", async () => {
    const source = (await Bun.file(new URL("./inonu-layer.ts", import.meta.url)).text()).replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    expect(source).not.toMatch(/requestAnimationFrame|setInterval|setTimeout|@keyframes|animation/);
  });
});

describe("the trail of older answers", () => {
  const at = (minute: number, action: ChartDecision["action"], over: Partial<ChartDecision> = {}): ChartDecision => ({ action, candidateId: null, atMs: T0 + minute * 60_000, instId: "BTC-USDT", modelo: "jev-latest", ...over });

  test("each older answer is a small glyph at the bar it was given: under the low for a buy, over the high for a sell", () => {
    const ctx = new RecordingContext();
    drawInonuFront(ctx, geom, candles, layer({ trail: [at(10, "buy"), at(20, "sell")], overlay: null, show: { zones: true, flow: true, decision: true } }), DEFAULT_PALETTE, 1, FONT);
    const fills = ctx.of("fill");
    expect(fills.length).toBe(2);
    const buy = ctx.of("moveTo")[0]!;
    const sell = ctx.of("moveTo")[1]!;
    const x10 = geom.xCenter(10 - geom.firstIndex);
    expect(buy.args[0]).toBeCloseTo(x10, 5);
    expect(sell.args[0]).toBeCloseTo(geom.xCenter(20 - geom.firstIndex), 5);
  });

  test("answers about another instrument, older than the window, or with the decision filter off are not drawn", () => {
    const ctx = new RecordingContext();
    drawInonuFront(ctx, geom, candles, layer({ overlay: overlay(), show: { zones: true, flow: false, decision: true }, trail: [at(10, "buy", { instId: "ETH-USDT" }), at(-500, "sell")] }), DEFAULT_PALETTE, 1, FONT);
    expect(ctx.of("fill")).toEqual([]);
    const off = new RecordingContext();
    drawInonuFront(off, geom, candles, layer({ overlay: null, show: { zones: true, flow: true, decision: false }, trail: [at(10, "buy")] }), DEFAULT_PALETTE, 1, FONT);
    expect(off.calls).toEqual([]);
  });

  test("without an engine reading the newest answer still shows, at the last close", () => {
    const ctx = new RecordingContext();
    drawInonuFront(ctx, geom, candles, layer({ overlay: null, decision: at(97, "buy") }), DEFAULT_PALETTE, 1, FONT);
    const chip = ctx.of("fillText").find((c) => String(c.args[0]).startsWith("Inonu:"))!;
    expect(chip.args[2] as number).toBeCloseTo(geom.yPrice(candles[candles.length - 1]!.close), -1);
  });
});

describe("age", () => {
  test("is said in the largest whole unit, and never negative", () => {
    expect(ageText(0)).toBe("agora");
    expect(ageText(-5000)).toBe("agora");
    expect(ageText(42_000)).toBe("ha 42 s");
    expect(ageText(3 * 60_000)).toBe("ha 3 min");
    expect(ageText(5 * 3_600_000)).toBe("ha 5 h");
    expect(ageText(3 * 86_400_000)).toBe("ha 3 d");
  });
});

describe("inside drawChart", () => {
  test("the zones go under the candles and the decision chip over them, in one pass", () => {
    const ctx = new RecordingContext();
    drawChart(ctx, { ...base, inonu: layer({ decision: { action: "buy", candidateId: "spot:BTC-USDT", atMs: T0 + 97 * 60_000, instId: "BTC-USDT", modelo: "jev-latest" } }) });
    const zone = ctx.calls.findIndex((c) => c.op === "fillRect" && c.fillStyle.startsWith("rgba(61,220,151,0.1"));
    const firstCandle = ctx.calls.findIndex((c) => c.op === "fillRect" && c.fillStyle === DEFAULT_PALETTE.sell);
    const chip = ctx.calls.findIndex((c) => c.op === "fillText" && String(c.args[0]).startsWith("Inonu:"));
    expect(zone).toBeGreaterThanOrEqual(0);
    expect(firstCandle).toBeGreaterThan(zone);
    expect(chip).toBeGreaterThan(firstCandle);
  });

  test("without the input the chart draws exactly what it drew before, and Renko ignores it", () => {
    const plain = new RecordingContext();
    drawChart(plain, base);
    const empty = new RecordingContext();
    drawChart(empty, { ...base, inonu: layer({ overlay: null, decision: null }) });
    expect(empty.calls.length).toBe(plain.calls.length);
    const renko = new RecordingContext();
    drawChart(renko, { ...base, kind: "renko", inonu: layer() });
    expect(renko.calls.some((c) => c.op === "fillText" && String(c.args[0]).startsWith("Demanda"))).toBe(false);
  });
});
