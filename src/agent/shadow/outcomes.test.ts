import { describe, expect, test } from "bun:test";
import { buildPathIndex, forwardReturn, outcomesOf, summarize, WINDOWS_MS } from "./outcomes";
import type { AnswerRecord } from "../recording";
import type { PriceRow } from "../recording";

const MIN = 60_000;
const T0 = Date.UTC(2026, 9, 15, 15, 0, 0);
const MINT = "BCdwQBAn8dYB5YjTsoB6TdHAWokxv28k2oZUodERpump";
const ID = `buy:token:501:${MINT}`;
const KEY = `501:${MINT}`;

const row = (atMs: number, price: number, src: PriceRow["src"] = "eco"): PriceRow => ({ v: 1, atMs, obsAtMs: null, src, n: 1, changed: 1, prices: { [KEY]: price } });
const answer = (over: Partial<AnswerRecord> = {}, probs: Record<string, number> = { skip: 0.77, buy_tenth: 0.23 }, requested: string | null = "skip"): AnswerRecord => ({
  v: 1, cycleId: "cy-1", atMs: T0, recordedAtMs: T0 + 5_000, askedAtMs: T0 + 1_000, answeredAtMs: T0 + 1_400, mode: "limitado", briefHash: "abcd1234abcd1234", valid: true, invalidReason: null, posture: "neutra", postureProbs: null, notes: [],
  items: [{ id: ID, kind: "buy", offered: ["skip", "buy_tenth"], requested, applied: requested, probs, facets: null, marks: [], triggers: [], families: [], cap: null }], ...over,
});

describe("the path of a token is the prices the cycle read, in time order, by plan key", () => {
  test("rows are grouped by token and sorted by the time of the read", () => {
    const index = buildPathIndex([row(T0 + 10 * MIN, 1.1), row(T0, 1)]);
    expect(index.get(KEY)!.map((p) => p.atMs)).toEqual([T0, T0 + 10 * MIN]);
  });
});

describe("the return after a window comes only from prices that were really read near the two instants, and an unknown stays unknown", () => {
  const path = buildPathIndex([row(T0 - 30_000, 1), row(T0 + 61 * MIN, 1.1)]).get(KEY);

  test("one hour after, the return is the exit price over the entry price", () => {
    expect(forwardReturn(path, T0, WINDOWS_MS["1h"]).ret).toBeCloseTo(0.1, 6);
  });

  test("with no price near the decision the entry is unknown and so is the return, never zero", () => {
    expect(forwardReturn(buildPathIndex([row(T0 + 61 * MIN, 1.1)]).get(KEY), T0, WINDOWS_MS["1h"]).ret).toBeNull();
  });

  test("a path that ends before the window gives an unknown return, never zero", () => {
    expect(forwardReturn(buildPathIndex([row(T0, 1), row(T0 + 20 * MIN, 1.2)]).get(KEY), T0, WINDOWS_MS["1h"]).ret).toBeNull();
  });

  test("a price read much later than the window is too late to stand for it", () => {
    expect(forwardReturn(buildPathIndex([row(T0, 1), row(T0 + 3 * 3_600_000, 2)]).get(KEY), T0, WINDOWS_MS["1h"]).ret).toBeNull();
  });

  test("a token with no path at all is unknown", () => {
    expect(forwardReturn(undefined, T0, WINDOWS_MS["1h"]).ret).toBeNull();
  });

  test("the lag of the exit read is reported, so a stale cache is not mistaken for the window", () => {
    expect(forwardReturn(path, T0, WINDOWS_MS["1h"]).lagMs).toBe(MIN);
  });

  test("synthetic finite prices whose ratio overflows remain unknown through outcomes and JSON summary", () => {
    const rows = [row(T0, 1e-300), row(T0 + 61 * MIN, 1e300)];
    const before = structuredClone(rows);
    const index = buildPathIndex(rows);
    expect(forwardReturn(index.get(KEY), T0, WINDOWS_MS["1h"])).toEqual({ ret: null, lagMs: null });
    const outcomes = outcomesOf([answer()], index);
    expect(outcomes).toHaveLength(1);
    expect(outcomes[0]).toMatchObject({ cycleId: "cy-1", id: ID, requested: "skip", applied: "skip", preference: 0.23, returns: { "1h": null } });
    const summary = summarize(outcomes, [{ name: "all", pick: () => true }], "1h");
    expect(summary).toEqual([{ name: "all", known: 0, unknown: 1, meanPct: null, medianPct: null, shareUpPct: null }]);
    expect(JSON.parse(JSON.stringify({ outcomes, summary }))).toEqual({ outcomes, summary });
    expect(rows).toEqual(before);
  });

  test("synthetic finite positive, zero and negative returns retain their formula and measured lag", () => {
    for (const price of [1.5, 1, 0.5]) {
      const path = buildPathIndex([row(T0, 1), row(T0 + 61 * MIN, price)]).get(KEY);
      expect(forwardReturn(path, T0, WINDOWS_MS["1h"])).toEqual({ ret: price - 1, lagMs: MIN });
    }
  });
});

describe("the windows of the cycle: 1 and 5 minutes, read close to the two instants", () => {
  const price = (list: Array<[number, number]>) => buildPathIndex(list.map(([at, p]) => row(at, p))).get(KEY);

  test("1 and 5 minutes are windows of their own", () => {
    expect([WINDOWS_MS["1m"], WINDOWS_MS["5m"]]).toEqual([MIN, 5 * MIN]);
    expect(Object.keys(WINDOWS_MS)).toEqual(["1m", "5m", "15m", "1h", "4h"]);
  });

  test("a 1 minute return needs an exit read within one cycle (2 minutes) after the window, and reports the lag", () => {
    const path = price([[T0 - 20_000, 1], [T0 + MIN + 30_000, 1.01]]);
    expect(forwardReturn(path, T0, WINDOWS_MS["1m"])).toEqual({ ret: 1.01 / 1 - 1, lagMs: 30_000 });
  });

  test("an exit read 3 minutes late is not a 1 minute return (it stays unknown), though a 15 minute window still accepts the same lateness", () => {
    const late1m = price([[T0, 1], [T0 + MIN + 3 * MIN, 1.01]]);
    expect(forwardReturn(late1m, T0, WINDOWS_MS["1m"]).ret).toBeNull();
    const late15m = price([[T0, 1], [T0 + 15 * MIN + 3 * MIN, 1.01]]);
    expect(forwardReturn(late15m, T0, WINDOWS_MS["15m"]).ret).not.toBeNull();
  });

  test("an entry read 3 minutes before the decision is too old for a short window, but fine for a long one", () => {
    const old = price([[T0 - 3 * MIN, 1], [T0 + MIN, 1.01], [T0 + 60 * MIN, 1.02]]);
    expect(forwardReturn(old, T0, WINDOWS_MS["1m"]).ret).toBeNull();
    expect(forwardReturn(old, T0, WINDOWS_MS["5m"]).ret).toBeNull();
    expect(forwardReturn(old, T0, WINDOWS_MS["1h"]).ret).not.toBeNull();
  });

  test("outcomes carry the 1 and 5 minute returns from the same entry, unknown when no read lands near them", () => {
    const index = buildPathIndex([row(T0 - 10_000, 1), row(T0 + MIN + 20_000, 1.002), row(T0 + 16 * MIN, 1.05)]);
    const o = outcomesOf([answer()], index)[0]!;
    expect(o.returns["1m"]!.toFixed(3)).toBe("0.002");
    expect(o.returns["5m"]).toBeNull();
    expect(o.returns["15m"]!.toFixed(2)).toBe("0.05");
  });
});

describe("every purchase the Jev was asked about gets an outcome, skipped or not, with its preference", () => {
  const index = buildPathIndex([row(T0 - 10_000, 1), row(T0 + 16 * MIN, 1.05), row(T0 + 61 * MIN, 1.1)]);

  test("a skipped purchase keeps what the Jev asked for and its preference, the highest probability of an option that buys", () => {
    const o = outcomesOf([answer()], index)[0]!;
    expect([o.requested, o.preference]).toEqual(["skip", 0.23]);
  });

  test("the returns are measured at each window from the same entry", () => {
    const o = outcomesOf([answer()], index)[0]!;
    expect([o.returns["15m"]!.toFixed(2), o.returns["1h"]!.toFixed(2)]).toEqual(["0.05", "0.10"]);
  });

  test("a holding is not a purchase and gets no outcome here", () => {
    const a = answer();
    const holding = { ...a, items: [{ ...a.items[0]!, id: "hold:token:501:X@agente", kind: "holding" as const }] };
    expect(outcomesOf([holding], index)).toEqual([]);
  });

  test("an answer with no probabilities has an unknown preference, not zero", () => {
    const a = answer({}, {}, "skip");
    const none = { ...a, items: [{ ...a.items[0]!, probs: null }] };
    expect(outcomesOf([none], index)[0]!.preference).toBeNull();
  });

  test("synthetic malformed Choice vectors keep their outcomes but never become numeric preferences", () => {
    const valid = answer();
    const expected = { ...outcomesOf([valid], index)[0]!, preference: null };
    const invalid: (Record<string, number> | null)[] = [null, {}, { skip: -3, buy_tenth: 4 }, { skip: 0.5, buy_tenth: 0.53 },
      { skip: 0.1, buy_tenth: 0.1 }, { buy_tenth: 1 }, { skip: 0.77, buy_tenth: 0.23, extra: 0 },
      { skip: 0.77, buy_tenth: NaN }, { skip: 0.77, buy_tenth: Infinity }];
    for (const probs of invalid) {
      const a = { ...valid, items: [{ ...valid.items[0]!, probs }] };
      const before = structuredClone(a);
      expect(outcomesOf([a], index)).toEqual([expected]);
      expect(a).toEqual(before);
    }
  });

  test("synthetic valid zero and rounded multi-buy Choice weights preserve max preference and returns", () => {
    const a = answer({}, { skip: 1, buy_tenth: 0 });
    const zero = outcomesOf([a], index)[0]!;
    expect(zero.preference).toBe(0);
    const multi = { ...a, items: [{ ...a.items[0]!, offered: ["skip", "buy_tenth", "buy_full"], probs: { skip: 0.34, buy_tenth: 0.33, buy_full: 0.34 } }] };
    expect(outcomesOf([multi], index)).toEqual([{ ...zero, preference: 0.34 }]);
  });
});

describe("the summary counts the unknown apart, so a lost path is never read as a flat price", () => {
  const index = buildPathIndex([row(T0 - 10_000, 1), row(T0 + 61 * MIN, 1.1), row(T0 + 24 * MIN * 60 + 0, 1)]);
  const lost = answer({ cycleId: "cy-2", atMs: T0 + 30 * 3_600_000, askedAtMs: T0 + 30 * 3_600_000 });
  const outcomes = outcomesOf([answer(), lost], index);

  test("a return that could not be measured is counted as unknown and not averaged in", () => {
    const g = summarize(outcomes, [{ name: "all", pick: () => true }], "1h")[0]!;
    expect([g.known, g.unknown]).toEqual([1, 1]);
  });

  test("the mean and the median are over the known returns only", () => {
    const g = summarize(outcomes, [{ name: "all", pick: () => true }], "1h")[0]!;
    expect([g.meanPct, g.medianPct]).toEqual([10, 10]);
  });

  test("a group with nothing known says so with null, not zero", () => {
    const g = summarize(outcomes, [{ name: "none", pick: () => false }], "1h")[0]!;
    expect([g.known, g.meanPct, g.medianPct]).toEqual([0, null, null]);
  });
});
