// The model behind the decision center and the result meters: pure arithmetic over the status, so every bar, curve and count on the screen has a number to be checked against. origin: synthetic_fixture, tests only.
import { describe, expect, test } from "bun:test";
import { constellation, cycleStrip, equityChart, facetMeters, funnelModel, hitRows, probBars, recordRows, toneOfHit } from "./deck";
import type { CandidateView, LedgerRecord, OrderOutcome, WindowSummary } from "./types";

const view = (over: Partial<CandidateView>): CandidateView => ({ id: "x", kind: "buy", symbol: "AAA", chainIndex: "501", stance: "skip", families: [], marks: [], closed: null, probs: null, facets: null, ...over });
const order = (stage: OrderOutcome["stage"], side: "buy" | "sell" = "sell"): OrderOutcome => ({ order: { candidateId: "x", side, stance: "exit_all", chainIndex: "501", symbol: "AAA", address: "a", usd: 10, wallet: "agente", profile: null, source: "modelo" }, stage, ref: null, reason: null });

describe("the curve of the wallet's value", () => {
  const series = [{ t: 0, v: 100 }, { t: 1000, v: 120 }, { t: 2000, v: 110 }, { t: 3000, v: 130 }];

  test("it is a line from the first point to the last, scaled into the box: the highest value is near the top, the lowest near the bottom, time runs to the right", () => {
    const c = equityChart(series, [])!;
    expect(c.first).toBe(100);
    expect(c.last).toBe(130);
    expect(c.deltaUsd).toBe(30);
    expect(c.deltaPct).toBeCloseTo(30, 6);
    expect(c.line.startsWith("M ")).toBe(true);
    expect(c.line.match(/L /g)?.length).toBe(3);
    const ys = c.points.map((p) => p.y);
    expect(c.points[3]!.y).toBe(Math.min(...ys));
    expect(c.points[0]!.y).toBe(Math.max(...ys));
    const xs = c.points.map((p) => p.x);
    expect([...xs].sort((a, b) => a - b)).toEqual(xs);
    expect(xs[0]).toBe(c.box.padX);
    expect(xs[3]).toBe(c.box.width - c.box.padX);
    // inside the box, with room above and below
    for (const y of ys) {
      expect(y).toBeGreaterThanOrEqual(c.box.padTop);
      expect(y).toBeLessThanOrEqual(c.box.height - c.box.padBottom);
    }
  });

  test("the area under the line closes at the bottom, so it can be filled", () => {
    const c = equityChart(series, [])!;
    expect(c.area.endsWith("Z")).toBe(true);
    expect(c.area.startsWith(c.line)).toBe(true);
  });

  test("fewer than two points is no curve; a flat one is drawn in the middle, not at an edge", () => {
    expect(equityChart([], [])).toBeNull();
    expect(equityChart([{ t: 0, v: 100 }], [])).toBeNull();
    const flat = equityChart([{ t: 0, v: 50 }, { t: 1, v: 50 }], [])!;
    expect(flat.deltaPct).toBe(0);
    const mid = (flat.box.padTop + (flat.box.height - flat.box.padBottom)) / 2;
    expect(flat.points[0]!.y).toBeCloseTo(mid, 6);
  });

  test("an executed order is a marker on the curve at its time, on the side it was; one that did not execute, or is outside the curve, is not", () => {
    const orders: LedgerRecord[] = [
      { kind: "order", cycleId: "c", atMs: 1500, reason: null, stage: "executada", side: "sell", symbol: "AAA", usd: 12 },
      { kind: "order", cycleId: "c", atMs: 1600, reason: null, stage: "falhou", side: "sell", symbol: "BBB", usd: 12 },
      { kind: "order", cycleId: "c", atMs: 9999, reason: null, stage: "executada", side: "buy", symbol: "CCC", usd: 12 },
      { kind: "cycle", cycleId: "c", atMs: 1500, reason: null },
    ];
    const c = equityChart(series, orders)!;
    expect(c.markers).toHaveLength(1);
    expect(c.markers[0]).toMatchObject({ side: "sell", symbol: "AAA", usd: 12, atMs: 1500 });
    // halfway between the second and third points in time, the curve is between them in value
    const m = c.markers[0]!;
    expect(m.x).toBeCloseTo((c.points[1]!.x + c.points[2]!.x) / 2, 6);
    expect(m.y).toBeCloseTo((c.points[1]!.y + c.points[2]!.y) / 2, 6);
  });

  test("three gridlines carry the values they stand for", () => {
    const c = equityChart(series, [])!;
    expect(c.ticks).toHaveLength(3);
    expect(c.ticks[0]!.value).toBeGreaterThan(c.ticks[1]!.value);
    expect(c.ticks[1]!.value).toBeGreaterThan(c.ticks[2]!.value);
    expect(c.ticks[0]!.y).toBeLessThan(c.ticks[2]!.y);
  });
});

describe("the funnel of the last decision", () => {
  const seen = [
    view({ id: "h1", kind: "holding", symbol: "P", stance: "exit_all" }),
    view({ id: "b1", closed: "entrada_esticada" }),
    view({ id: "b2", closed: "entrada_esticada" }),
    view({ id: "b3", closed: "abaixo_do_minimo" }),
    view({ id: "b4", closed: null, stance: "buy_third" }),
    view({ id: "b5", closed: null, stance: "skip" }),
  ];

  test("each step counts what is left: seen, closed by the code, left open to the model, chosen to act on, executed", () => {
    const f = funnelModel(seen, [order("executada"), order("incerta")]);
    expect(f.steps.map((s) => [s.key, s.count])).toEqual([["vistas", 6], ["fechadas", 3], ["abertas", 3], ["escolhidas", 2], ["executadas", 1]]);
    expect(f.steps[0]!.widthPct).toBe(100);
    expect(f.steps[1]!.widthPct).toBe(50);
  });

  test("the reasons the code closed purchases are counted, most common first, in plain words", () => {
    const f = funnelModel(seen, []);
    expect(f.reasons).toEqual([{ code: "entrada_esticada", label: "Preco esticado", count: 2 }, { code: "abaixo_do_minimo", label: "Abaixo do minimo", count: 1 }]);
  });

  test("a step with something in it is never drawn thinner than a sliver, and an empty one has no width", () => {
    const f = funnelModel([view({ id: "a" }), ...Array.from({ length: 99 }, (_, i) => view({ id: `c${i}`, closed: "sem_historico" }))], [order("executada")]);
    expect(f.steps.find((s) => s.key === "executadas")!.widthPct).toBeGreaterThanOrEqual(4);
    const none = funnelModel([], []);
    expect(none.steps.every((s) => s.count === 0 && s.widthPct === 0)).toBe(true);
  });
});

describe("how sure the model was, as bars", () => {
  test("a holding reads over keep, a third, half and all, in that order, and marks the one it chose", () => {
    const bars = probBars("holding", { exit_all: 0.43, hold: 0.36, trim_half: 0.21 }, "trim_half")!;
    expect(bars.map((b) => b.key)).toEqual(["hold", "trim_half", "exit_all"]);
    expect(bars.map((b) => b.pct)).toEqual([36, 21, 43]);
    expect(bars.find((b) => b.chosen)!.key).toBe("trim_half");
    expect(bars.find((b) => b.key === "hold")!.label).toBe("Manter");
  });

  test("a purchase reads over skip and the sizes, and a candidate with only one option is no bar at all", () => {
    expect(probBars("buy", { skip: 0.3, buy_third: 0.7 }, "buy_third")!.map((b) => b.key)).toEqual(["skip", "buy_third"]);
    expect(probBars("buy", { skip: 1 }, "skip")).toBeNull();
    expect(probBars("buy", null, "skip")).toBeNull();
  });

  test("percentages are whole numbers and an option the code does not know is left out", () => {
    const bars = probBars("holding", { hold: 0.555, bogus: 0.4, exit_all: 0.045 }, "hold")!;
    expect(bars.map((b) => b.key)).toEqual(["hold", "exit_all"]);
    expect(bars.map((b) => b.pct)).toEqual([56, 5]);
  });
});

describe("the narrow judgments, as meters", () => {
  test("a facet where high is bad is a warning when high and calm when low; one where high is good is the opposite", () => {
    const m = facetMeters("buy", { late_entry: 0.82, still_falling: 0.1, accumulating: 0.25, exit_easy: 0.7, distribution: 0.2, fading: 0.5 });
    const by = (k: string) => m.find((x) => x.key === k)!;
    expect(by("late_entry")).toMatchObject({ pct: 82, tone: "warn", label: "Entrada esticada" });
    expect(by("still_falling")).toMatchObject({ pct: 10, tone: "calm", label: "Ainda caindo" });
    expect(by("accumulating")).toMatchObject({ pct: 25, tone: "dim" });
    expect(by("exit_easy")).toMatchObject({ pct: 70, tone: "good" });
    expect(by("distribution")).toMatchObject({ pct: 20, tone: "calm" });
    expect(by("fading")).toMatchObject({ pct: 50, tone: "mid" });
  });

  test("a holding has its own set, in a fixed order, and nothing is invented for a missing one", () => {
    const m = facetMeters("holding", { fading: 0.83, risk_rising: 0.68 });
    expect(m.map((x) => x.key)).toEqual(["fading", "risk_rising"]);
    expect(facetMeters("holding", null)).toEqual([]);
    expect(facetMeters("buy", {})).toEqual([]);
  });
});

describe("the meters of the result", () => {
  const w = (over: Partial<WindowSummary> = {}): WindowSummary => ({ n: 0, overlapping: 0, settled: 0, pending: 0, unknownPrice: 0, grossUsd: 0, netUsd: null, hitRate: null, claim: null, claimBasis: null, claimReason: null, ...over });

  test("each window says how many decisions were measured, the hit rate in percent and the result, and whether it is still open", () => {
    const rows = hitRows({ "15m": w({ n: 23, settled: 23, hitRate: 0.58, netUsd: 0.59 }), "1h": w({ n: 15, settled: 5, pending: 10, hitRate: 0.2, netUsd: -9.41 }), "4h": w(), "24h": w({ n: 5, pending: 5 }) });
    expect(rows.map((r) => r.id)).toEqual(["15m", "1h", "4h", "24h"]);
    expect(rows[0]).toMatchObject({ settled: 23, hitPct: 58, netUsd: 0.59, open: false, tone: "mid" });
    expect(rows[1]).toMatchObject({ settled: 5, hitPct: 20, netUsd: -9.41, open: true, tone: "warn" });
    expect(rows[2]).toMatchObject({ settled: 0, hitPct: null, netUsd: null, open: false, tone: "dim" });
    expect(rows[3]!.open).toBe(true);
  });

  test("the tone of a hit rate: under four tenths a warning, six tenths or more good, in between neutral, and unknown dim", () => {
    expect(toneOfHit(null)).toBe("dim");
    expect(toneOfHit(39)).toBe("warn");
    expect(toneOfHit(40)).toBe("mid");
    expect(toneOfHit(59)).toBe("mid");
    expect(toneOfHit(60)).toBe("good");
  });

  test("the record of the model's own decisions: selling and keeping first, then each family, with the sample size said and a small one flagged", () => {
    const rows = recordRows({ fluxo: { n: 6, acerto: 67 }, vender: { n: 5, acerto: 0 }, manter: { n: 3, acerto: null }, liquidez: { n: 12, acerto: 41 } });
    expect(rows.map((r) => r.key)).toEqual(["vender", "manter", "liquidez", "fluxo"]);
    expect(rows[0]).toMatchObject({ n: 5, acertoPct: 0, enough: true, tone: "warn", label: "Quando vende" });
    expect(rows[1]).toMatchObject({ n: 3, acertoPct: null, enough: false, tone: "dim" });
    expect(rows[2]!.acertoPct).toBe(41);
    expect(recordRows({})).toEqual([]);
  });
});

describe("the map of the decision: the Jev in the middle and each candidate around it", () => {
  const seen = [
    view({ id: "h1", kind: "holding", symbol: "Pedro", stance: "exit_all", probs: { hold: 0.05, trim_half: 0.43, exit_all: 0.52 } }),
    view({ id: "h2", kind: "holding", symbol: "Mole", stance: "hold", probs: { hold: 0.7, exit_all: 0.3 } }),
    view({ id: "b1", symbol: "NEAR", closed: "abaixo_do_minimo" }),
    view({ id: "b2", symbol: "OMNI", closed: "entrada_esticada" }),
    view({ id: "b3", symbol: "ZED", stance: "buy_third", probs: { skip: 0.3, buy_third: 0.7 } }),
    view({ id: "b4", symbol: "SKIP", stance: "skip", probs: { skip: 0.8, buy_third: 0.2 } }),
  ];

  test("every candidate is a node with a tone that says what became of it: sell, keep, buy, passed over by the model, or closed by the code", () => {
    const m = constellation(seen);
    const tone = (id: string) => m.nodes.find((n) => n.id === id)!.tone;
    expect(tone("h1")).toBe("sell");
    expect(tone("h2")).toBe("hold");
    expect(tone("b3")).toBe("buy");
    expect(tone("b4")).toBe("open");
    expect(tone("b1")).toBe("closed");
    expect(tone("b2")).toBe("closed");
    expect(m.nodes).toHaveLength(6);
  });

  test("holdings sit on the inner ring, what the model could choose on the middle one, and what the code closed on the outer one", () => {
    const m = constellation(seen);
    const dist = (id: string) => { const n = m.nodes.find((x) => x.id === id)!; return Math.hypot(n.x - m.center.x, n.y - m.center.y); };
    expect(dist("h1")).toBeCloseTo(dist("h2"), 6);
    expect(dist("b3")).toBeCloseTo(dist("b4"), 6);
    expect(dist("b1")).toBeCloseTo(dist("b2"), 6);
    expect(dist("h1")).toBeLessThan(dist("b3"));
    expect(dist("b3")).toBeLessThan(dist("b1"));
  });

  test("the nodes are inside the box and no two sit on the same spot", () => {
    const m = constellation(seen);
    for (const n of m.nodes) {
      expect(n.x).toBeGreaterThan(0);
      expect(n.x).toBeLessThan(m.box.width);
      expect(n.y).toBeGreaterThan(0);
      expect(n.y).toBeLessThan(m.box.height);
    }
    for (let i = 0; i < m.nodes.length; i++) for (let j = i + 1; j < m.nodes.length; j++) expect(Math.hypot(m.nodes[i]!.x - m.nodes[j]!.x, m.nodes[i]!.y - m.nodes[j]!.y)).toBeGreaterThan(6);
  });

  test("the same candidates always land in the same places: the map does not shuffle from one reading to the next", () => {
    const at = (v: typeof seen) => Object.fromEntries(constellation(v).nodes.map((n) => [n.id, [n.x, n.y]]));
    expect(at([...seen].reverse())).toEqual(at(seen));
  });

  test("a line joins the Jev to each candidate the model could really weigh, as strong as the model was sure of its pick; a closed one has none", () => {
    const m = constellation(seen);
    expect(m.links.map((l) => l.id).sort()).toEqual(["b3", "b4", "h1", "h2"]);
    const strong = (id: string) => m.links.find((l) => l.id === id)!.strength;
    expect(strong("h1")).toBeCloseTo(0.52, 6);
    expect(strong("b4")).toBeCloseTo(0.8, 6);
    for (const l of m.links) {
      expect(l.strength).toBeGreaterThanOrEqual(0.2);
      expect(l.strength).toBeLessThanOrEqual(1);
    }
  });

  test("a node that was chosen for action is bigger than one that was only watched, and a closed one is the smallest", () => {
    const m = constellation(seen);
    const r = (id: string) => m.nodes.find((n) => n.id === id)!.r;
    expect(r("h1")).toBeGreaterThan(r("h2"));
    expect(r("b3")).toBeGreaterThan(r("b4"));
    expect(r("b4")).toBeGreaterThan(r("b1"));
  });

  test("nothing to map is an empty map, not an error", () => {
    const m = constellation([]);
    expect(m.nodes).toEqual([]);
    expect(m.links).toEqual([]);
  });
});

describe("the strip of the last cycles", () => {
  const cycle = (atMs: number, outcome: string, cycleId = `c${atMs}`, reason: string | null = null): LedgerRecord => ({ kind: "cycle", cycleId, atMs, reason, outcome });
  const ord = (atMs: number, cycleId: string, stage: OrderOutcome["stage"]): LedgerRecord => ({ kind: "order", cycleId, atMs, reason: null, stage, side: "sell", symbol: "X", usd: 10 });

  test("each cycle is a bar, oldest to newest, colored by what it did, taller when it put orders out", () => {
    const bars = cycleStrip([cycle(3, "mantido"), cycle(1, "decidido", "a"), ord(1, "a", "executada"), ord(1, "a", "incerta"), cycle(2, "bloqueado", "b", "carteira_antiga")], 36);
    expect(bars.map((b) => b.atMs)).toEqual([1, 2, 3]);
    expect(bars.map((b) => b.tone)).toEqual(["act", "wait", "calm"]);
    expect(bars[0]!.orders).toBe(2);
    expect(bars[0]!.heightPct).toBeGreaterThan(bars[2]!.heightPct);
    expect(bars[1]!.reason).toBe("carteira_antiga");
  });

  test("only the last cycles are drawn, a failed order is not an order sent, and a ledger with no cycles is an empty strip", () => {
    const many = Array.from({ length: 50 }, (_, i) => cycle(i + 1, "mantido"));
    expect(cycleStrip(many, 36)).toHaveLength(36);
    expect(cycleStrip(many, 36)[0]!.atMs).toBe(15);
    const bars = cycleStrip([cycle(1, "decidido", "a"), ord(1, "a", "falhou"), ord(1, "a", "preparada")], 36);
    expect(bars[0]!.orders).toBe(0);
    expect(cycleStrip([], 36)).toEqual([]);
  });
});
