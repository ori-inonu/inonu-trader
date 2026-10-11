import { describe, expect, test } from "bun:test";
import {
  SATELLITES,
  actionWord,
  confidenceOf,
  conveyorTiles,
  depthPresence,
  haloArcs,
  operatorLine,
  orbitPhase,
  positionLine,
  projectOrbit,
  sceneTone,
  signalsFor,
} from "./command-center";
import { eventFixture, fillFixture, quoteFixture } from "./test-fixtures";

const frame = { cx: 100, cy: 50, rx: 80, ry: 30 };

describe("projectOrbit", () => {
  test("0 degrees sits at the right edge at mid depth", () => {
    const p = projectOrbit(0, frame);
    expect(p.x).toBeCloseTo(180);
    expect(p.y).toBeCloseTo(50);
    expect(p.depth).toBeCloseTo(0.5);
  });

  test("90 degrees is the near side, 270 the far side", () => {
    expect(projectOrbit(90, frame).depth).toBeCloseTo(1);
    expect(projectOrbit(90, frame).y).toBeCloseTo(80);
    expect(projectOrbit(270, frame).depth).toBeCloseTo(0);
    expect(projectOrbit(270, frame).y).toBeCloseTo(20);
  });

  test("satellites never share an angle and keep inputs left of outputs", () => {
    const angles = SATELLITES.map((s) => s.angleDeg);
    expect(new Set(angles).size).toBe(angles.length);
    const inputs = SATELLITES.filter((s) => s.role === "input").map((s) => projectOrbit(s.angleDeg, frame).x);
    const outputs = SATELLITES.filter((s) => s.role === "output").map((s) => projectOrbit(s.angleDeg, frame).x);
    expect(Math.max(...inputs)).toBeLessThan(Math.min(...outputs));
  });
});

describe("depthPresence", () => {
  test("clamps and grows with depth", () => {
    expect(depthPresence(-1)).toEqual(depthPresence(0));
    expect(depthPresence(2)).toEqual(depthPresence(1));
    expect(depthPresence(1).scale).toBeGreaterThan(depthPresence(0).scale);
    expect(depthPresence(1).opacity).toBe(1);
  });
});

describe("orbitPhase", () => {
  test("is zero at rest and wraps after one period", () => {
    expect(orbitPhase(0)).toBe(0);
    expect(orbitPhase(-5)).toBe(0);
    expect(orbitPhase(NaN)).toBe(0);
    expect(orbitPhase(48_000, 96_000)).toBeCloseTo(180);
    expect(orbitPhase(96_000, 96_000)).toBeCloseTo(0);
  });
});

describe("sceneTone and words", () => {
  test("reads the decision", () => {
    expect(sceneTone(null)).toBe("unknown");
    expect(sceneTone(eventFixture({ decision: null }))).toBe("neutral");
    expect(sceneTone(eventFixture({ decision: { action: "buy", probabilities: { buy: 0.7, sell: 0.2, hold: 0.1 }, upIn10: 0.5, latencyMs: 120, late: false } }))).toBe("buy");
    expect(sceneTone(eventFixture({ decision: { action: "sell", probabilities: { buy: 0.1, sell: 0.8, hold: 0.1 }, upIn10: 0.5, latencyMs: 900, late: true } }))).toBe("late");
  });

  test("action word states late and waiting plainly", () => {
    expect(actionWord(null)).toBe("Aguardando decisao");
    expect(actionWord(eventFixture({ decision: { action: "hold", probabilities: { buy: 0.3, sell: 0.3, hold: 0.4 }, upIn10: 0.5, latencyMs: 100, late: false } }))).toBe("Manter");
    expect(actionWord(eventFixture({ decision: { action: "hold", probabilities: { buy: 0.3, sell: 0.3, hold: 0.4 }, upIn10: 0.5, latencyMs: 100, late: true } }))).toBe("Resposta tardia");
  });

  test("confidence is the top probability and null when late", () => {
    expect(confidenceOf(null)).toBeNull();
    expect(confidenceOf({ action: "buy", probabilities: { buy: 0.62, sell: 0.2, hold: 0.18 }, upIn10: 0.5, latencyMs: 1, late: false })).toBeCloseTo(0.62);
    expect(confidenceOf({ action: "buy", probabilities: { buy: 0.62, sell: 0.2, hold: 0.18 }, upIn10: 0.5, latencyMs: 1, late: true })).toBeNull();
  });
});

describe("signalsFor", () => {
  const decided = (overrides = {}) =>
    eventFixture({
      block: 10,
      decision: { action: "buy", probabilities: { buy: 0.7, sell: 0.2, hold: 0.1 }, upIn10: 0.5, latencyMs: 100, late: false },
      ...overrides,
    });

  test("nothing moves without a block or for a repeated block", () => {
    expect(signalsFor(null, null)).toEqual([]);
    expect(signalsFor(10, decided())).toEqual([]);
    expect(signalsFor(11, decided())).toEqual([]);
  });

  test("inputs always reach the core on a new block", () => {
    const signals = signalsFor(9, decided({ quote: null }));
    expect(signals.map((s) => `${s.from}>${s.to}`)).toEqual(["feed>core", "monad>core"]);
  });

  test("a quote leaves the core for Kuru in the action colour, a fill reaches the wallet", () => {
    const signals = signalsFor(null, decided({ quote: quoteFixture({ side: "buy" }), fill: fillFixture({ side: "sell" }) }));
    expect(signals.slice(2)).toEqual([
      { id: "10:quote", from: "core", to: "kuru", tone: "buy" },
      { id: "10:fill", from: "kuru", to: "wallet", tone: "sell" },
    ]);
  });

  test("a late answer stays at the core", () => {
    const late = decided({ decision: { action: "buy", probabilities: { buy: 0.7, sell: 0.2, hold: 0.1 }, upIn10: 0.5, latencyMs: 900, late: true }, quote: quoteFixture() });
    const signals = signalsFor(9, late);
    expect(signals.at(-1)).toEqual({ id: "10:late", from: "core", to: "core", tone: "late" });
  });
});

describe("conveyorTiles", () => {
  test("keeps the newest blocks oldest first and marks quotes and fills", () => {
    const events = [1, 2, 3, 4].map((block) =>
      eventFixture({ block, quote: block % 2 === 0 ? quoteFixture() : null, fill: block === 4 ? fillFixture() : null }),
    );
    const tiles = conveyorTiles(events, 3);
    expect(tiles.map((t) => t.block)).toEqual([2, 3, 4]);
    expect(tiles.map((t) => t.quoted)).toEqual([true, false, true]);
    expect(tiles.map((t) => t.filled)).toEqual([false, false, true]);
    expect(conveyorTiles(events, 0)).toEqual([]);
  });
});

describe("haloArcs", () => {
  test("stacks buy, sell, hold around the ring", () => {
    const arcs = haloArcs({ buy: 0.5, sell: 0.3, hold: 0.2 });
    expect(arcs.map((a) => a.key)).toEqual(["buy", "sell", "hold"]);
    expect(arcs.map((a) => a.offset)).toEqual([0, 0.5, 0.8]);
    expect(arcs.map((a) => a.length)).toEqual([0.5, 0.3, 0.2]);
  });

  test("empties on null and ignores invalid values", () => {
    expect(haloArcs(null).every((a) => a.length === 0)).toBe(true);
    const arcs = haloArcs({ buy: NaN, sell: -1, hold: 4 });
    expect(arcs.map((a) => a.length)).toEqual([0, 0, 1]);
  });
});

describe("operator and position lines", () => {
  test("operator line reads the last choice", () => {
    expect(operatorLine(null)).toBe("Sem ciclo");
    const base = { cycleId: "c", startedAtMs: 0, completedAtMs: 0, inventory: { address: "", observedAtMs: 0, source: "synthetic", knownValueUsd: 0, valueComplete: true, chains: [] }, candidates: [{ id: "k1", kind: "kuru_spot_maker", title: "t", chainIndex: "143", from: { symbol: "MON" }, to: { symbol: "USDC" }, sizeUsd: 1, netUsd: 1, priceImpactPercent: 0, quoteAgeMs: 0, notes: [] }], verdicts: [], eligibleIds: [], plan: null, execution: { status: "dry_run", reasons: [], txHash: null }, inferenceUsd: null, warnings: [] };
    expect(operatorLine({ ...base, decision: null })).toBe("Sem elegiveis");
    expect(operatorLine({ ...base, decision: { choice: "hold", probabilities: {}, confidence: null, latencyMs: 0, model: "m" } })).toBe("Manter");
    expect(operatorLine({ ...base, decision: { choice: "k1", probabilities: {}, confidence: null, latencyMs: 0, model: "m" } })).toBe("Maker Kuru");
  });

  test("position line names the side", () => {
    expect(positionLine(null)).toBe("Sem posicao");
    expect(positionLine(eventFixture({ position: { side: "flat", size: 0, entryPrice: null, unrealizedUsd: 0, unrealizedMon: 0 } }))).toBe("Zerada");
    expect(positionLine(eventFixture({ position: { side: "long", size: 2, entryPrice: 1, unrealizedUsd: 0, unrealizedMon: 0 } }))).toBe("Comprada 2 MON");
  });
});
