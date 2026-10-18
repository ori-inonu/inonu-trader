// The steady hand of the thermometer: smoothed, with hysteresis and a minimum time in a band, and the number moving in steps. origin: synthetic_fixture, tests only.
import { describe, expect, test } from "bun:test";
import { bandOf, createStabilizer, EDGES } from "./stabilize";

describe("bandOf", () => {
  test("five bands on the scale, the edges belonging to the stronger side", () => {
    expect(bandOf(1)).toBe("buy2");
    expect(bandOf(EDGES.strong)).toBe("buy2");
    expect(bandOf(0.3)).toBe("buy1");
    expect(bandOf(EDGES.mild)).toBe("buy1");
    expect(bandOf(0)).toBe("flat");
    expect(bandOf(-0.1)).toBe("flat");
    expect(bandOf(-EDGES.mild)).toBe("sell1");
    expect(bandOf(-0.3)).toBe("sell1");
    expect(bandOf(-EDGES.strong)).toBe("sell2");
    expect(bandOf(-1)).toBe("sell2");
  });
});

describe("createStabilizer", () => {
  const feed = (s: ReturnType<typeof createStabilizer>, values: readonly number[], start = 0, everyMs = 1000) =>
    values.map((v, i) => s.push(v, start + i * everyMs));

  test("nothing before there is a sample, and a sample that is not a number shows nothing and changes nothing", () => {
    const s = createStabilizer();
    expect(s.push(null, 0)).toBeNull();
    expect(s.push(Number.NaN, 1000)).toBeNull();
    expect(s.push(0.4, 2000)).not.toBeNull();
    const kept = s.push(null, 3000);
    expect(kept).toEqual(s.push(Number.POSITIVE_INFINITY, 4000));
    expect(kept).not.toBeNull();
  });

  test("the first sample sets the band at once, and the number moves in steps of five", () => {
    const s = createStabilizer();
    expect(s.push(0.47, 0)).toMatchObject({ band: "buy1", pct: 45 });
    expect(s.push(0.47, 1000)).toMatchObject({ band: "buy1", pct: 45 });
    expect(createStabilizer().push(-0.23, 0)).toMatchObject({ band: "sell1", pct: -25 });
  });

  test("one wild second does not swing it: the average moves a fraction of the way", () => {
    const s = createStabilizer();
    s.push(0.3, 0);
    for (let i = 1; i < 20; i++) s.push(0.3, i * 1000);
    const after = s.push(-1, 20_000)!;
    // 15% of the way from 0.3 towards -1 is about 0.1, not -1, and that is still inside the margin of the edge (0.15 - 0.07 = 0.08)
    expect(after.pct).toBeGreaterThan(0);
    expect(after.band).toBe("buy1");
  });

  test("a value hovering at an edge does not flip the band back and forth", () => {
    const s = createStabilizer();
    s.push(0.2, 0);
    const bands = new Set<string>();
    // the sample alternates just under and just over the edge of 0.15
    for (let i = 1; i < 120; i++) bands.add(s.push(i % 2 === 0 ? 0.13 : 0.17, i * 1000)!.band);
    expect(bands.size).toBe(1);
  });

  test("a real change takes the band, but only after the old band lasted the minimum time", () => {
    const s = createStabilizer({ dwellMs: 15_000 });
    s.push(0.3, 0);
    // the market turns hard to sellers: the average crosses the edge within seconds, yet the band holds until the dwell time passes
    let seen = feed(s, Array(10).fill(-0.8), 1000);
    expect(seen.every((r) => r!.band === "buy1")).toBe(true);
    seen = feed(s, Array(30).fill(-0.8), 11_000);
    expect(seen.at(-1)!.band).not.toBe("buy1");
  });

  test("the band changes one step at a time, never skipping the middle one", () => {
    const s = createStabilizer({ dwellMs: 1000 });
    s.push(0.9, 0);
    const order: string[] = [];
    for (let i = 1; i < 200; i++) {
      const r = s.push(-0.9, i * 1000)!;
      if (order.at(-1) !== r.band) order.push(r.band);
    }
    expect(order).toEqual(["buy2", "buy1", "flat", "sell1", "sell2"]);
  });

  test("it needs to go past the edge by the margin to change, not just touch it", () => {
    const s = createStabilizer({ alpha: 1, margin: 0.07, dwellMs: 0 });
    s.push(0.3, 0);
    expect(s.push(0.14, 1000)!.band).toBe("buy1"); // below the edge of 0.15, inside the margin
    expect(s.push(0.08, 2000)!.band).toBe("buy1"); // exactly at the margin (0.15 - 0.07): still not past it
    expect(s.push(0.079, 3000)!.band).toBe("flat");
  });

  test("a value outside the scale is held at the scale, and reset forgets everything", () => {
    const s = createStabilizer();
    expect(s.push(9, 0)).toMatchObject({ band: "buy2", pct: 100 });
    s.reset();
    expect(s.push(null, 1000)).toBeNull();
    expect(s.push(-9, 2000)).toMatchObject({ band: "sell2", pct: -100 });
  });
});

describe("the number agrees with the word", () => {
  test("while the band catches up with the average, the number stays inside the band that is shown (seen live: sellers 'a little ahead' at -95%)", () => {
    const s = createStabilizer({ alpha: 1, dwellMs: 15_000 });
    s.push(-0.2, 0); // sell1
    // the market turns hard: the average is at -95% at once, the band can change only after the dwell time
    const early = s.push(-0.95, 1000)!;
    expect(early.band).toBe("sell1");
    expect(early.pct).toBe(-50);
    // the next band down is reached after the dwell time, one step, and then the number follows
    const late = s.push(-0.95, 16_000)!;
    expect(late.band).toBe("sell2");
    expect(late.pct).toBe(-95);
  });

  test("every reading, over a long and violent run, has its number inside the range of its band", () => {
    const s = createStabilizer();
    let t = 0;
    for (let i = 0; i < 600; i++) {
      const r = s.push(Math.sin(i / 7) * 1.4, (t += 1000))!;
      const [low, high] = { sell2: [-100, -50], sell1: [-50, -15], flat: [-15, 15], buy1: [15, 50], buy2: [50, 100] }[r.band]!;
      expect(r.pct).toBeGreaterThanOrEqual(low);
      expect(r.pct).toBeLessThanOrEqual(high);
    }
  });
});

describe("how long the band has held", () => {
  test("the moment the band began, kept while it holds and moved when it changes", () => {
    const s = createStabilizer({ alpha: 1, dwellMs: 1000 });
    expect(s.push(0.3, 5_000)!.sinceMs).toBe(5_000);
    expect(s.push(0.3, 9_000)!.sinceMs).toBe(5_000);
    expect(s.push(-0.3, 20_000)!.sinceMs).toBe(20_000);
    expect(s.push(null, 21_000)!.sinceMs).toBe(20_000);
  });
});
