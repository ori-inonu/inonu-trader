// T6.1 / SMT-1, SMT-2, SMT-5, AC-SMT-1: dynamic zones by confluence of independent evidence families, with decay by age and
// states. V-ZONA-1 and V-ZONA-2 of flow-engine.md 6. origin: synthetic_fixture, tests only. A zone describes demand or
// supply; it never says what to do (the model chooses among candidate ids).
import { describe, expect, test } from "bun:test";
import { DEFAULT_WEIGHTS, updateZones, type Family, type Proposal, type ZoneBar, type ZoneParams } from "./zones";

const INTERVAL = 60_000;
const T0 = 1_800_000_000_000;
const ALL: Family[] = ["E1", "E2", "E3", "E4", "E5", "E6"];
const NO_E6: Family[] = ["E1", "E2", "E3", "E4", "E5"];

const params = (over: Partial<ZoneParams> = {}): ZoneParams => ({ enabled: ALL, atr14: 2, intervalMs: INTERVAL, ...over });
const bar = (i: number, low: number, high: number, close: number, open = (low + high) / 2): ZoneBar => ({ ts: T0 + i * INTERVAL, open, high, low, close });
const far = (i: number) => bar(i, 105, 106, 105.5); // a bar that never touches a zone around 100 to 101.5
const prop = (family: Family, baixo: number, alto: number, forca: number, lado: "demanda" | "oferta" = "demanda", ts = T0): Proposal => ({ family, baixo, alto, forca, lado, ts });

describe("V-ZONA-1: the score", () => {
  const proposals = [prop("E1", 100, 101, 0.8), prop("E2", 100, 101, 0.6)];

  test("0.8 of E1 and 0.6 of E2 against weights that sum to 5.1 is 27.45, two families: active", () => {
    const [zone] = updateZones({ prev: [], proposals, bar: far(0), params: params() }).zones;
    expect(zone!.notaBruta).toBeCloseTo(27.45, 2);
    expect(zone!.nota).toBeCloseTo(27.45, 2);
    expect(zone!.estado).toBe("ativa");
    expect(zone!.fatores).toEqual(["E1", "E2"]);
  });

  test("the default weights are the documented priors and sum to 5.1", () => {
    expect(DEFAULT_WEIGHTS).toEqual({ E1: 1.0, E2: 1.0, E3: 0.8, E4: 0.6, E5: 0.5, E6: 1.2 });
    expect(Object.values(DEFAULT_WEIGHTS).reduce((a, b) => a + b, 0)).toBeCloseTo(5.1, 10);
  });

  test("after 50 bars with a half-life of 50 the score halves to 13.73, under the 15 floor: expired", () => {
    const first = updateZones({ prev: [], proposals, bar: far(0), params: params() });
    const later = updateZones({ prev: first.next, proposals, bar: far(50), params: params() });
    const zone = later.zones[0]!;
    expect(zone.idadeBarras).toBe(50);
    expect(zone.notaBruta).toBeCloseTo(27.45, 2);
    expect(zone.nota).toBeCloseTo(13.73, 2);
    expect(zone.estado).toBe("expirada");
    expect(later.next).toEqual([]); // a terminal state is not carried
    expect(later.visible).toEqual([]);
  });

  test("a zone older than the maximum age expires whatever its score", () => {
    const first = updateZones({ prev: [], proposals: [prop("E1", 100, 101, 1), prop("E2", 100, 101, 1), prop("E3", 100, 101, 1), prop("E4", 100, 101, 1), prop("E5", 100, 101, 1), prop("E6", 100, 101, 1)], bar: far(0), params: params({ meiaVida: 1_000_000 }) });
    const old = updateZones({ prev: first.next, proposals: [prop("E1", 100, 101, 1), prop("E2", 100, 101, 1)], bar: far(501), params: params({ meiaVida: 1_000_000 }) });
    expect(old.zones[0]!.estado).toBe("expirada");
  });
});

describe("V-ZONA-2: fusion and states (ATR 2, no E6, weights sum 3.9)", () => {
  const e1 = prop("E1", 100.0, 101.0, 0.8);
  const e2 = prop("E2", 100.8, 101.5, 0.6);
  const p = params({ enabled: NO_E6 });

  test("overlapping proposals fuse into one zone [100.0, 101.5] scored 35.90, active", () => {
    const { zones } = updateZones({ prev: [], proposals: [e1, e2], bar: far(0), params: p });
    expect(zones).toHaveLength(1);
    expect(zones[0]).toMatchObject({ baixo: 100, alto: 101.5, lado: "demanda", estado: "ativa" });
    expect(zones[0]!.nota).toBeCloseTo(35.9, 2);
  });

  test("a low of 100.7 without closing under 100.0 makes it tested; a close at 99.9 makes it mitigated", () => {
    const born = updateZones({ prev: [], proposals: [e1, e2], bar: far(0), params: p });
    const tested = updateZones({ prev: born.next, proposals: [e1, e2], bar: bar(1, 100.7, 103, 102), params: p });
    expect(tested.zones[0]!.estado).toBe("testada");
    expect(tested.visible).toHaveLength(1); // tested zones are still offered
    const after = updateZones({ prev: tested.next, proposals: [e1, e2], bar: far(2), params: p });
    expect(after.zones[0]!.estado).toBe("testada"); // having been tested is remembered when price leaves
    const mitigated = updateZones({ prev: tested.next, proposals: [e1, e2], bar: bar(2, 99.5, 101, 99.9), params: p });
    expect(mitigated.zones[0]!.estado).toBe("mitigada");
    expect(mitigated.next).toEqual([]);
    expect(mitigated.visible).toEqual([]);
  });

  test("a lone E3 of 0.9 scores 18.46 with one family: weak, and not offered; at 0.5 it scores 10.26 and is not a zone", () => {
    const weak = updateZones({ prev: [], proposals: [prop("E3", 100, 101, 0.9)], bar: far(0), params: p });
    expect(weak.zones[0]!.nota).toBeCloseTo(18.46, 2);
    expect(weak.zones[0]!.estado).toBe("fraca");
    expect(weak.visible).toEqual([]);
    expect(updateZones({ prev: [], proposals: [prop("E3", 100, 101, 0.5)], bar: far(0), params: p }).zones).toEqual([]);
  });

  test("the invalidation level is the opposite limit minus 0.1 ATR for demand, plus for supply", () => {
    const demand = updateZones({ prev: [], proposals: [e1, e2], bar: far(0), params: p }).zones[0]!;
    expect(demand.invalidacao).toBeCloseTo(99.8, 10);
    const supply = updateZones({ prev: [], proposals: [prop("E1", 110, 111, 0.8, "oferta"), prop("E2", 110, 111, 0.6, "oferta")], bar: bar(0, 104, 105, 104.5), params: p }).zones[0]!;
    expect(supply.lado).toBe("oferta");
    expect(supply.invalidacao).toBeCloseTo(111.2, 10);
  });

  test("supply is mitigated by a close above its upper limit and tested by a high that enters it", () => {
    const born = updateZones({ prev: [], proposals: [prop("E1", 110, 111, 0.8, "oferta"), prop("E2", 110, 111, 0.6, "oferta")], bar: bar(0, 104, 105, 104.5), params: p });
    const tested = updateZones({ prev: born.next, proposals: [prop("E1", 110, 111, 0.8, "oferta"), prop("E2", 110, 111, 0.6, "oferta")], bar: bar(1, 104, 110.4, 109), params: p });
    expect(tested.zones[0]!.estado).toBe("testada");
    const mitigated = updateZones({ prev: tested.next, proposals: [prop("E1", 110, 111, 0.8, "oferta"), prop("E2", 110, 111, 0.6, "oferta")], bar: bar(2, 108, 112, 111.5), params: p });
    expect(mitigated.zones[0]!.estado).toBe("mitigada");
  });
});

describe("judging the price once per bar", () => {
  const p = params({ enabled: NO_E6 });
  const strong = [prop("E1", 100, 101.5, 0.8), prop("E2", 100.8, 101.5, 0.6)];

  test("with judgePrice off the bar neither tests nor mitigates a zone: the same closed bar is not judged twice", () => {
    const born = updateZones({ prev: [], proposals: strong, bar: far(0), params: p });
    const touching = bar(0, 100.7, 103, 102); // a bar that enters the zone
    expect(updateZones({ prev: born.next, proposals: strong, bar: touching, params: { ...p, judgePrice: false } }).zones[0]!.estado).toBe("ativa");
    expect(updateZones({ prev: born.next, proposals: strong, bar: touching, params: p }).zones[0]!.estado).toBe("testada");
    const beyond = bar(0, 99.5, 101, 99.9); // a close under the lower limit
    expect(updateZones({ prev: born.next, proposals: strong, bar: beyond, params: { ...p, judgePrice: false } }).zones[0]!.estado).toBe("ativa");
    expect(updateZones({ prev: born.next, proposals: strong, bar: beyond, params: p }).zones[0]!.estado).toBe("mitigada");
  });

  test("with judgePrice off a zone already tested stays tested, and expiry by score or age still applies", () => {
    const born = updateZones({ prev: [], proposals: strong, bar: far(0), params: p });
    const tested = updateZones({ prev: born.next, proposals: strong, bar: bar(1, 100.7, 103, 102), params: p });
    expect(updateZones({ prev: tested.next, proposals: strong, bar: far(1), params: { ...p, judgePrice: false } }).zones[0]!.estado).toBe("testada");
    const old = updateZones({ prev: tested.next, proposals: strong, bar: far(501), params: { ...p, judgePrice: false } });
    expect(old.zones[0]!.estado).toBe("expirada");
  });
});

describe("fusion and identity", () => {
  const p = params({ enabled: NO_E6 });

  test("proposals within a quarter of the ATR fuse; farther apart they stay two zones", () => {
    const near = updateZones({ prev: [], proposals: [prop("E1", 100, 101, 1), prop("E2", 101.5, 102, 1)], bar: far(0), params: p });
    expect(near.zones).toHaveLength(1); // gap 0.5 = 0.25 * 2
    const apart = updateZones({ prev: [], proposals: [prop("E1", 100, 101, 1), prop("E2", 101.6, 102, 1)], bar: far(0), params: p });
    expect(apart.zones).toHaveLength(2); // each alone scores 100 * 1.0 / 3.9 = 25.64: one family, so both are weak zones
    expect(apart.zones.map((z) => z.estado)).toEqual(["fraca", "fraca"]);
  });

  test("two separate strong zones are both kept", () => {
    const out = updateZones({ prev: [], proposals: [prop("E1", 100, 101, 1), prop("E2", 100, 101, 1), prop("E1", 90, 91, 1), prop("E2", 90, 91, 1)], bar: bar(0, 95, 96, 95.5), params: p });
    expect(out.zones).toHaveLength(2);
  });

  test("the id is stable while the zone lives, even when its limits drift, and new zones get distinct ids", () => {
    const first = updateZones({ prev: [], proposals: [prop("E1", 100, 101, 1), prop("E2", 100, 101, 1)], bar: far(0), params: p });
    const second = updateZones({ prev: first.next, proposals: [prop("E1", 100.2, 101.3, 1), prop("E2", 100.2, 101.3, 1)], bar: far(1), params: p });
    expect(second.zones[0]!.id).toBe(first.zones[0]!.id);
    expect(second.zones[0]!.primeiroTs).toBe(first.zones[0]!.primeiroTs);
    expect(second.zones[0]).toMatchObject({ baixo: 100.2, alto: 101.3 });
    const other = updateZones({ prev: [], proposals: [prop("E1", 90, 91, 1), prop("E2", 90, 91, 1)], bar: bar(0, 95, 96, 95.5), params: p });
    expect(other.zones[0]!.id).not.toBe(first.zones[0]!.id);
    expect(first.zones[0]!.id).toMatch(/^[0-9a-f]{12}$/);
  });

  test("the side is the weighted majority; a tie is neutral", () => {
    const mixed = updateZones({ prev: [], proposals: [prop("E1", 100, 101, 1, "demanda"), prop("E3", 100, 101, 1, "oferta"), prop("E2", 100, 101, 1, "demanda")], bar: far(0), params: p });
    expect(mixed.zones[0]!.lado).toBe("demanda"); // 1.0 + 1.0 against 0.8
    const tie = updateZones({ prev: [], proposals: [prop("E1", 100, 101, 1, "demanda"), prop("E2", 100, 101, 1, "oferta")], bar: far(0), params: p });
    expect(tie.zones[0]!.lado).toBe("neutra");
  });

  test("a zone whose evidence vanished scores zero and expires", () => {
    const first = updateZones({ prev: [], proposals: [prop("E1", 100, 101, 1), prop("E2", 100, 101, 1)], bar: far(0), params: p });
    const gone = updateZones({ prev: first.next, proposals: [], bar: far(1), params: p });
    expect(gone.zones[0]!.estado).toBe("expirada");
  });
});

describe("families, regime and output", () => {
  test("proposals of a family that is not enabled for the asset are ignored, and the denominator only counts enabled ones", () => {
    const out = updateZones({ prev: [], proposals: [prop("E1", 100, 101, 1), prop("E2", 100, 101, 1), prop("E6", 100, 101, 1)], bar: far(0), params: params({ enabled: NO_E6 }) });
    expect(out.zones[0]!.nota).toBeCloseTo((100 * 2) / 3.9, 2);
    expect(out.zones[0]!.fatores).toEqual(["E1", "E2"]);
    expect(out.familiasHabilitadas).toEqual(NO_E6);
  });

  test("the derivatives regime scales strength between 0.8 and 1.2 and never past 1; outside that range it is clamped", () => {
    const base = [prop("E1", 100, 101, 0.5), prop("E2", 100, 101, 0.5)];
    const score = (regimeModifier: number) => updateZones({ prev: [], proposals: base, bar: far(0), params: params({ enabled: NO_E6, regimeModifier }) }).zones[0]!.notaBruta;
    expect(score(1)).toBeCloseTo((100 * 1) / 3.9, 2);
    expect(score(1.2)).toBeCloseTo((100 * 1.2) / 3.9, 2);
    expect(score(5)).toBeCloseTo(score(1.2), 10);
    expect(score(0.1)).toBeCloseTo(score(0.8), 10);
    const strong = updateZones({ prev: [], proposals: [prop("E1", 100, 101, 0.95), prop("E2", 100, 101, 0.95)], bar: far(0), params: params({ enabled: NO_E6, regimeModifier: 1.2 }) });
    expect(strong.zones[0]!.forcas.E1).toBe(1);
  });

  test("at most six zones are offered, the closest to the price first", () => {
    const proposals: Proposal[] = [];
    for (let i = 0; i < 8; i += 1) {
      const base = 100 + i * 10;
      proposals.push(prop("E1", base, base + 1, 1), prop("E2", base, base + 1, 1));
    }
    const out = updateZones({ prev: [], proposals, bar: bar(0, 134.5, 135.5, 135), params: params({ enabled: NO_E6 }) });
    expect(out.zones).toHaveLength(8);
    expect(out.visible).toHaveLength(6);
    const distances = out.visible.map((z) => Math.abs((z.baixo + z.alto) / 2 - 135));
    expect([...distances].sort((a, b) => a - b)).toEqual(distances);
  });

  test("the same input gives the same output", () => {
    const run = () => JSON.stringify(updateZones({ prev: [], proposals: [prop("E1", 100, 101, 0.7), prop("E2", 100.5, 101.5, 0.6), prop("E3", 120, 121, 0.9)], bar: far(0), params: params({ enabled: NO_E6 }) }));
    expect(run()).toBe(run());
  });

  test("bad parameters are errors", () => {
    expect(() => updateZones({ prev: [], proposals: [], bar: far(0), params: params({ atr14: 0 }) })).toThrow();
    expect(() => updateZones({ prev: [], proposals: [], bar: far(0), params: params({ enabled: [] }) })).toThrow();
    expect(() => updateZones({ prev: [], proposals: [], bar: far(0), params: params({ weights: { ...DEFAULT_WEIGHTS, E1: 0 } }) })).toThrow();
    expect(() => updateZones({ prev: [], proposals: [prop("E1", 101, 100, 1)], bar: far(0), params: params() })).toThrow();
    expect(() => updateZones({ prev: [], proposals: [prop("E1", 100, 101, 1.5)], bar: far(0), params: params() })).toThrow();
  });

  test("the source never uses the words of an order (FLX-10): whole-word scan of the module", async () => {
    const source = (await Bun.file(new URL("./zones.ts", import.meta.url)).text()).replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    for (const word of ["comprar", "compre", "vender", "venda", "buy", "sell", "hold", "action", "signal", "recommend", "vote", "side", "sinal"]) expect(new RegExp(`\\b${word}\\b`, "i").test(source)).toBe(false);
  });
});
