import { describe, expect, test } from "bun:test";
import { createScoreboard, effectUsd, MIN_SAMPLE, WINDOWS, type DecisionMark } from "./scoreboard";

const T0 = Date.UTC(2026, 9, 14, 12, 0, 0);
const mark = (over: Partial<DecisionMark> = {}): DecisionMark => ({
  kind: "decision",
  key: "c1:buy:x",
  cycleId: "c1",
  atMs: T0,
  mode: "sombra",
  side: "buy",
  candidateId: "buy:x",
  chainIndex: "1",
  address: "0x1111111111111111111111111111111111111111",
  symbol: "AAA",
  stance: "buy_full",
  usd: 100,
  entryPriceUsd: 2,
  costUsd: null,
  posture: "neutra",
  profile: "alvo_5",
  source: "modelo",
  families: ["carteiras"],
  triggers: [],
  wallet: "agente",
  ...over,
});

/** A distinct token per index: decisions on different tokens are independent bets. */
const token = (i: number) => `0x${i.toString(16).padStart(40, "0")}`;

const memory = () => {
  const lines: string[] = [];
  return { lines, deps: { read: () => lines, append: (l: string) => void lines.push(l) } };
};

describe("the effect of a decision is measured against not taking it", () => {
  test("a purchase is compared with keeping the dollars", () => {
    expect(effectUsd(mark(), 2.2)).toBeCloseTo(10, 9);
    expect(effectUsd(mark(), 1.8)).toBeCloseTo(-10, 9);
    expect(effectUsd(mark(), 2)).toBe(0);
  });

  test("a sale is compared with keeping the token", () => {
    const sell = mark({ side: "sell" });
    expect(effectUsd(sell, 1.8)).toBeCloseTo(10, 9);
    expect(effectUsd(sell, 2.2)).toBeCloseTo(-10, 9);
  });

  test("an unknown price on either side is no effect, never zero", () => {
    expect(effectUsd(mark({ entryPriceUsd: null }), 2)).toBeNull();
    expect(effectUsd(mark(), null)).toBeNull();
    expect(effectUsd(mark({ entryPriceUsd: 0 }), 2)).toBeNull();
  });
});

describe("settling the windows", () => {
  test("a window is settled only after it has passed, with the price at its end", async () => {
    const m = memory();
    const board = createScoreboard(m.deps);
    board.mark(mark());
    const asked: number[] = [];
    const lookup = async (_d: DecisionMark, atMs: number) => {
      asked.push(atMs - T0);
      return 2.2;
    };
    await board.settle(T0 + 10 * 60_000, lookup);
    expect(asked).toEqual([]);
    await board.settle(T0 + 16 * 60_000, lookup);
    expect(asked).toEqual([15 * 60_000]);
    await board.settle(T0 + 16 * 60_000, lookup);
    expect(asked).toEqual([15 * 60_000]);
    await board.settle(T0 + 25 * 3600_000, lookup);
    expect(asked).toEqual([15 * 60_000, 3600_000, 4 * 3600_000, 24 * 3600_000]);
  });

  test("a lookup with no price is retried, and only after a long wait settled as unknown", async () => {
    const m = memory();
    const board = createScoreboard(m.deps);
    board.mark(mark());
    let calls = 0;
    const none = async () => {
      calls++;
      return null;
    };
    await board.settle(T0 + 20 * 60_000, none);
    // a price not found is not asked again at once (the provider has a quota), but after a pause
    await board.settle(T0 + 21 * 60_000, none);
    expect(calls).toBe(1);
    await board.settle(T0 + 40 * 60_000, none);
    expect(calls).toBe(2);
    expect(board.summary(T0 + 40 * 60_000).windows["15m"]!.pending).toBe(1);
    await board.settle(T0 + 15 * 60_000 + 7 * 3600_000, none);
    const w = board.summary(T0 + 15 * 60_000 + 7 * 3600_000).windows["15m"]!;
    expect(w.pending).toBe(0);
    expect(w.unknownPrice).toBe(1);
  });

  test("a lookup that throws leaves the window pending", async () => {
    const board = createScoreboard(memory().deps);
    board.mark(mark());
    await board.settle(T0 + 20 * 60_000, async () => {
      throw new Error("provider");
    });
    expect(board.summary(T0 + 20 * 60_000).windows["15m"]!.pending).toBe(1);
  });

  test("a restart does not settle again what was settled", async () => {
    const m = memory();
    const first = createScoreboard(m.deps);
    first.mark(mark());
    await first.settle(T0 + 16 * 60_000, async () => 2.2);
    const second = createScoreboard(m.deps);
    let calls = 0;
    await second.settle(T0 + 16 * 60_000, async () => {
      calls++;
      return 2.2;
    });
    expect(calls).toBe(0);
    expect(second.summary(T0 + 16 * 60_000).windows["15m"]!.settled).toBe(1);
  });

  test("a mark with no entry price is counted and never settled", async () => {
    const board = createScoreboard(memory().deps);
    board.mark(mark({ entryPriceUsd: null }));
    let calls = 0;
    await board.settle(T0 + 30 * 3600_000, async () => {
      calls++;
      return 1;
    });
    expect(calls).toBe(0);
    expect(board.summary(T0 + 30 * 3600_000).noEntryPrice).toBe(1);
  });

  test("the same key is marked once", () => {
    const board = createScoreboard(memory().deps);
    board.mark(mark());
    board.mark(mark());
    expect(board.summary(T0).decisions).toBe(1);
  });
});

describe("the summary claims nothing the sample does not support", () => {
  const fill = async (n: number, price: (i: number) => number) => {
    const board = createScoreboard(memory().deps);
    for (let i = 0; i < n; i++) board.mark(mark({ key: `c${i}:buy:x`, cycleId: `c${i}`, address: token(i) }));
    // one pass looks up at most a bounded number of prices, so a large board needs a few passes
    for (let pass = 0; pass < 4; pass++) await board.settle(T0 + 25 * 3600_000, async (d) => price(Number(d.cycleId.slice(1))));
    return board.summary(T0 + 25 * 3600_000);
  };

  test("a small sample makes no claim, even when every decision won", async () => {
    const s = await fill(MIN_SAMPLE - 1, () => 3);
    const w = s.windows["24h"]!;
    expect(w.grossUsd).toBeCloseTo(50 * (MIN_SAMPLE - 1), 6);
    expect(w.claim).toBeNull();
    expect(w.claimReason).toBe("amostra_pequena");
  });

  test("a full, large sample says above or not above keeping dollars", async () => {
    const win = await fill(MIN_SAMPLE, () => 2.2);
    expect(win.windows["24h"]).toMatchObject({ settled: MIN_SAMPLE, pending: 0, claim: "acima_de_manter", claimReason: null });
    expect(win.windows["24h"]!.hitRate).toBe(1);
    const lose = await fill(MIN_SAMPLE, () => 1.8);
    expect(lose.windows["24h"]!.claim).toBe("nao_acima_de_manter");
    expect(lose.windows["24h"]!.hitRate).toBe(0);
  });

  test("pending windows make no claim", async () => {
    const board = createScoreboard(memory().deps);
    for (let i = 0; i < MIN_SAMPLE; i++) board.mark(mark({ key: `c${i}:buy:x`, cycleId: `c${i}`, address: token(i) }));
    await board.settle(T0 + 16 * 60_000, async () => 2.2);
    const s = board.summary(T0 + 16 * 60_000);
    expect(s.windows["15m"]!.claim).toBe("acima_de_manter");
    expect(s.windows["1h"]).toMatchObject({ settled: 0, pending: MIN_SAMPLE, claim: null, claimReason: "janela_incompleta" });
  });

  test("a decision whose window is still open does not take the claim away from the ones already measured: a rolling agent always has recent decisions", async () => {
    const m = memory();
    const board = createScoreboard(m.deps);
    for (let i = 0; i < MIN_SAMPLE; i++) board.mark(mark({ key: `c${i}:buy:x`, cycleId: `c${i}`, address: token(i) }));
    // (a pass spends at most fifty lookups: thirty decisions in four windows take three passes)
    for (let pass = 0; pass < 3; pass++) await board.settle(T0 + 25 * 3600_000, async () => 2.2);
    // five more taken at T0 + 24 h: their 24 h windows end at T0 + 48 h
    for (let i = 0; i < 5; i++) board.mark(mark({ key: `d${i}:buy:x`, cycleId: `d${i}`, address: token(100 + i), atMs: T0 + 24 * 3600_000 }));
    const w = board.summary(T0 + 25 * 3600_000).windows["24h"]!;
    expect(w).toMatchObject({ settled: MIN_SAMPLE, pending: 5, claim: "acima_de_manter" });
  });

  test("but a decision whose window ENDED and has no price yet still holds the claim back: the measured ones may be only the winners", async () => {
    const board = createScoreboard(memory().deps);
    for (let i = 0; i < MIN_SAMPLE; i++) board.mark(mark({ key: `c${i}:buy:x`, cycleId: `c${i}`, address: token(i) }));
    board.mark(mark({ key: "late:buy:x", cycleId: "late", address: token(999), atMs: T0 + 3600_000 }));
    // the lookup finds a price for everyone but the late one
    await board.settle(T0 + 25 * 3600_000, async (d) => (d.key === "late:buy:x" ? null : 2.2));
    expect(board.summary(T0 + 25 * 3600_000).windows["24h"]).toMatchObject({ claim: null, claimReason: "janela_incompleta" });
  });

  test("net of cost exists only when every cost is known", async () => {
    const board = createScoreboard(memory().deps);
    board.mark(mark({ key: "a", costUsd: 1, address: token(1) }));
    board.mark(mark({ key: "b", costUsd: null, address: token(2) }));
    await board.settle(T0 + 25 * 3600_000, async () => 2.2);
    const w = board.summary(T0 + 25 * 3600_000).windows["24h"]!;
    expect(w.grossUsd).toBeCloseTo(20, 9);
    expect(w.netUsd).toBeNull();
    const known = createScoreboard(memory().deps);
    known.mark(mark({ key: "a", costUsd: 1, address: token(1) }));
    known.mark(mark({ key: "b", costUsd: 2, address: token(2) }));
    await known.settle(T0 + 25 * 3600_000, async () => 2.2);
    expect(known.summary(T0 + 25 * 3600_000).windows["24h"]!.netUsd).toBeCloseTo(17, 9);
  });

  test("by mode, so that the shadow is never mixed with the real", async () => {
    const board = createScoreboard(memory().deps);
    board.mark(mark({ key: "a", mode: "sombra", address: token(1) }));
    board.mark(mark({ key: "b", mode: "limitado", address: token(2) }));
    await board.settle(T0 + 25 * 3600_000, async () => 2.2);
    const s = board.summary(T0 + 25 * 3600_000);
    expect(s.byMode.sombra!["24h"]!.grossUsd).toBeCloseTo(10, 9);
    expect(s.byMode.limitado!["24h"]!.grossUsd).toBeCloseTo(10, 9);
  });

  test("the same bet repeated every cycle is one sample per window, not thirty", async () => {
    const board = createScoreboard(memory().deps);
    // the model says "buy X" every 10 minutes for five hours: 30 decisions, one bet
    for (let i = 0; i < 30; i++) board.mark(mark({ key: `c${i}:buy:x`, cycleId: `c${i}`, atMs: T0 + i * 10 * 60_000 }));
    for (let pass = 0; pass < 4; pass++) await board.settle(T0 + 40 * 3600_000, async () => 2.2);
    const s = board.summary(T0 + 40 * 3600_000);
    // 15 minutes: every other decision is at least a window apart from the one counted before it
    expect(s.windows["15m"]!.n + s.windows["15m"]!.overlapping).toBe(30);
    expect(s.windows["15m"]!.n).toBe(15);
    // 24 hours: all of them fall inside the first one's window, so there is one independent bet
    expect(s.windows["24h"]).toMatchObject({ n: 1, overlapping: 29, settled: 1, claim: null, claimReason: "amostra_pequena" });
    expect(s.windows["24h"]!.grossUsd).toBeCloseTo(10, 9);
    expect(s.decisions).toBe(30);
  });

  test("a bet on the other side or on another token is a different bet, and the same one after the window is new", async () => {
    const board = createScoreboard(memory().deps);
    board.mark(mark({ key: "a", atMs: T0 }));
    board.mark(mark({ key: "b", atMs: T0 + 60_000, side: "sell" }));
    board.mark(mark({ key: "c", atMs: T0 + 120_000, address: token(7) }));
    board.mark(mark({ key: "d", atMs: T0 + 16 * 60_000 }));
    await board.settle(T0 + 25 * 3600_000, async () => 2.2);
    const s = board.summary(T0 + 25 * 3600_000);
    expect(s.windows["15m"]).toMatchObject({ n: 4, overlapping: 0 });
    expect(s.windows["1h"]).toMatchObject({ n: 3, overlapping: 1 });
  });

  test("the exits of the plan are not the model's decisions: counted apart, out of the windows", async () => {
    const board = createScoreboard(memory().deps);
    board.mark(mark({ key: "a", address: token(1) }));
    board.mark(mark({ key: "b", address: token(2), side: "sell", source: "protecao", stance: "exit_all" }));
    await board.settle(T0 + 25 * 3600_000, async () => 2.2);
    const s = board.summary(T0 + 25 * 3600_000);
    expect(s.decisions).toBe(2);
    expect(s.protective).toBe(1);
    expect(s.windows["24h"]).toMatchObject({ n: 1, settled: 1 });
    expect(s.windows["24h"]!.grossUsd).toBeCloseTo(10, 9);
  });

  test("one verdict over shadow and real decisions together is withheld, each mode keeps its own", async () => {
    const board = createScoreboard(memory().deps);
    for (let i = 0; i < MIN_SAMPLE; i++) board.mark(mark({ key: `c${i}:buy:x`, cycleId: `c${i}`, address: token(i), mode: i % 2 === 0 ? "sombra" : "limitado" }));
    for (let pass = 0; pass < 4; pass++) await board.settle(T0 + 25 * 3600_000, async () => 2.2);
    const s = board.summary(T0 + 25 * 3600_000);
    expect(s.windows["24h"]).toMatchObject({ settled: MIN_SAMPLE, claim: null, claimReason: "modos_misturados" });
    expect(s.byMode.sombra!["24h"]!.claimReason).toBe("amostra_pequena");
  });

  test("the windows are the four of the SPEC", () => {
    expect(WINDOWS.map((w) => w.id)).toEqual(["15m", "1h", "4h", "24h"]);
  });
});

describe("the price lookups of the settlement are spent where they matter", () => {
  const hold = (i: number, over: Partial<DecisionMark> = {}): DecisionMark => mark({ key: `c${i}:hold:${i}|inacao`, candidateId: `hold:${i}`, address: token(i), stance: "hold", side: "buy", inaction: true, usd: 50, ...over });

  test("the orders are settled first and the decisions not to act get a few lookups per pass: a pile of them cannot starve the orders (nor the quota of the provider)", async () => {
    const board = createScoreboard(memory().deps);
    // sixty decisions not to act, older, and one order, newer
    for (let i = 1; i <= 60; i++) board.mark(hold(i, { atMs: T0 - 1000 }));
    board.mark(mark({ key: "real:buy:x", cycleId: "real", address: token(500), atMs: T0 }));
    const asked: string[] = [];
    await board.settle(T0 + 25 * 3600_000, async (d) => (asked.push(d.key), 2.2));
    // the order's four windows went first
    expect(asked.slice(0, 4)).toEqual(["real:buy:x", "real:buy:x", "real:buy:x", "real:buy:x"]);
    // and the others were asked for at most their share of the pass
    expect(asked.filter((k) => k.endsWith("|inacao")).length).toBeLessThanOrEqual(10);
    expect(board.summary(T0 + 25 * 3600_000).windows["24h"]).toMatchObject({ settled: 1 });
  });

  test("a backlog of orders cannot take the whole pass: the decisions not to act keep their share, or the purchases the agent skipped would never be priced", async () => {
    const board = createScoreboard(memory().deps);
    // thirty orders with four due windows each (one hundred and twenty lookups), and five decisions not to act
    for (let i = 1; i <= 30; i++) board.mark(mark({ key: `o${i}:buy:x`, cycleId: `o${i}`, address: token(i), atMs: T0 }));
    for (let i = 1; i <= 5; i++) board.mark(hold(100 + i, { atMs: T0 }));
    const asked: string[] = [];
    await board.settle(T0 + 25 * 3600_000, async (d) => (asked.push(d.key), 2.2));
    const inaction = asked.filter((k) => k.endsWith("|inacao")).length;
    expect(inaction).toBeGreaterThan(0);
    expect(inaction).toBeLessThanOrEqual(10);
    expect(asked.length - inaction).toBeGreaterThanOrEqual(30);
    expect(asked.length).toBeLessThanOrEqual(50);
  });

  test("a price that could not be found is not asked again at the next pass, but after a pause", async () => {
    const board = createScoreboard(memory().deps);
    board.mark(mark({ key: "a:buy:x", address: token(1) }));
    let calls = 0;
    const nothing = async () => (calls++, null);
    const t = T0 + 16 * 60_000;
    await board.settle(t, nothing);
    expect(calls).toBe(1);
    await board.settle(t + 60_000, nothing);
    expect(calls).toBe(1);
    await board.settle(t + 20 * 60_000, nothing);
    expect(calls).toBe(2);
  });

  test("the same decision not to act, repeated by the cycles within the hour, is one mark; an hour later it is a new one", () => {
    const m = memory();
    const board = createScoreboard(m.deps);
    board.mark(hold(1, { key: "c1:hold:1|inacao", atMs: T0 }));
    board.mark(hold(1, { key: "c2:hold:1|inacao", atMs: T0 + 5 * 60_000 }));
    board.mark(hold(1, { key: "c3:hold:1|inacao", atMs: T0 + 55 * 60_000 }));
    expect(m.lines).toHaveLength(1);
    board.mark(hold(1, { key: "c4:hold:1|inacao", atMs: T0 + 61 * 60_000 }));
    expect(m.lines).toHaveLength(2);
    // another stance on the same token is another decision; so is another token
    board.mark(hold(1, { key: "c5:skip:1|inacao", atMs: T0 + 62 * 60_000, stance: "skip", side: "sell" }));
    board.mark(hold(2, { key: "c6:hold:2|inacao", atMs: T0 + 62 * 60_000 }));
    expect(m.lines).toHaveLength(4);
    // and a restart remembers: the marks on the file count
    const again = createScoreboard({ read: () => m.lines, append: (l) => void m.lines.push(l) });
    again.mark(hold(2, { key: "c7:hold:2|inacao", atMs: T0 + 70 * 60_000 }));
    expect(m.lines).toHaveLength(4);
  });
});

describe("choosing NOT to act is measured too, against the alternative the model turned down, and kept apart from the orders", () => {
  const hold = (i: number, over: Partial<DecisionMark> = {}): DecisionMark => mark({ key: `c${i}:hold:${i}|inacao`, candidateId: `hold:${i}`, address: token(i), stance: "hold", side: "buy", inaction: true, usd: 50, ...over });
  const skip = (i: number, over: Partial<DecisionMark> = {}): DecisionMark => mark({ key: `c${i}:buy:${i}|inacao`, candidateId: `buy:${i}`, address: token(i + 100), stance: "skip", side: "sell", inaction: true, usd: 30, ...over });

  test("keeping a holding is worth what the holding did (the sale it passed over would have lost that), and not buying is worth what the purchase it passed over would have lost", () => {
    // the price rose 10%: holding was right (+5 on 50), not buying was wrong (-3 on 30)
    expect(effectUsd(hold(1), 2.2)).toBeCloseTo(5, 9);
    expect(effectUsd(skip(1), 2.2)).toBeCloseTo(-3, 9);
    // the price fell 10%: the other way round
    expect(effectUsd(hold(1), 1.8)).toBeCloseTo(-5, 9);
    expect(effectUsd(skip(1), 1.8)).toBeCloseTo(3, 9);
  });

  test("they get their own windows and never move the board of the orders", () => {
    const m = memory();
    const board = createScoreboard(m.deps);
    board.mark(mark({ key: "c1:buy:real", address: token(1) }));
    board.mark(hold(2));
    board.mark(skip(3));
    const s = board.summary(T0 + 1000);
    expect(s.decisions).toBe(1);
    expect(s.windows["15m"].n).toBe(1);
    expect(s.inaction.decisions).toBe(2);
    expect(s.inaction.windows["15m"].n).toBe(2);
    expect(s.byMode.sombra!["15m"].n).toBe(1);
  });

  test("a measured sample of inaction says so with the same discipline as the orders: nothing before the window closes, nothing under the minimum", async () => {
    const m = memory();
    const board = createScoreboard(m.deps);
    for (let i = 0; i < MIN_SAMPLE; i++) board.mark(hold(i + 1));
    expect(board.summary(T0 + 1000).inaction.windows["15m"].claimReason).toBe("janela_incompleta");
    // (the decisions not to act get ten lookups a pass: thirty of them take three passes)
    for (let pass = 0; pass < 3; pass++) await board.settle(T0 + 16 * 60_000, async () => 2.2);
    const w = board.summary(T0 + 16 * 60_000).inaction.windows["15m"];
    expect(w.settled).toBe(MIN_SAMPLE);
    expect(w.grossUsd).toBeCloseTo(MIN_SAMPLE * 5, 6);
    expect(w.claim).toBe("acima_de_manter");
  });

  test("the marks of inaction are saved and read back like the others", () => {
    const m = memory();
    createScoreboard(m.deps).mark(hold(7));
    const again = createScoreboard(m.deps).summary(T0 + 1000);
    expect(again.inaction.decisions).toBe(1);
    expect(again.decisions).toBe(0);
  });
});

describe("the track record the model reads: how often each kind of decision beat the alternative, one hour later", () => {
  const H = 3_600_000;
  const skip = (i: number, families: string[], over: Partial<DecisionMark> = {}): DecisionMark => mark({ key: `c${i}:buy:${i}|inacao`, candidateId: `buy:${i}`, address: token(i), stance: "skip", side: "sell", inaction: true, usd: 10, families, ...over });
  const hold = (i: number, over: Partial<DecisionMark> = {}): DecisionMark => mark({ key: `c${i}:hold:${i}|inacao`, candidateId: `hold:${i}`, address: token(i), stance: "hold", side: "buy", inaction: true, usd: 50, ...over });
  const settle = async (board: ReturnType<typeof createScoreboard>, priceAfter: (d: DecisionMark) => number) => {
    for (let pass = 0; pass < 8; pass++) await board.settle(T0 + 2 * H, async (d) => priceAfter(d));
  };

  test("a family's record is how often BUYING a candidate with it beat keeping dollars, counted from the purchases the model skipped too (the price rose after)", async () => {
    const board = createScoreboard(memory().deps);
    // six skipped purchases with the family `fluxo`: four rose, two fell; five with `liquidez`: all fell
    for (let i = 1; i <= 6; i++) board.mark(skip(i, ["fluxo"]));
    for (let i = 11; i <= 15; i++) board.mark(skip(i, ["liquidez"]));
    await settle(board, (d) => (["fluxo"].every((f) => d.families.includes(f)) ? (Number(d.candidateId.split(":")[1]) <= 4 ? 2.4 : 1.6) : 1.6));
    const r = board.record("1h", T0 + 2 * H);
    expect(r.fluxo).toEqual({ n: 6, acerto: 67, medio: 6.7, melhor: 20, pior: -20 });
    expect(r.liquidez).toEqual({ n: 5, acerto: 0, medio: -20, melhor: -20, pior: -20 });
    expect(r.pular).toEqual({ n: 11, acerto: 64, medio: -5.5, melhor: 20, pior: -20 });
  });

  test("actual purchases (`comprar`) and high-conviction facet judgments (`f_*`) are calibrated separately in the record", async () => {
    const board = createScoreboard(memory().deps);
    for (let i = 1; i <= 5; i++) {
      board.mark(mark({ key: `b${i}:buy:x`, cycleId: `b${i}`, candidateId: `buy:${i}`, address: token(i), side: "buy", stance: "buy_third", usd: 20, facets: { accumulating: 0.75, late_entry: 0.7 } }));
    }
    await settle(board, (d) => (Number(d.candidateId.split(":")[1]) <= 4 ? 2.4 : 1.6));
    const r = board.record("1h", T0 + 2 * H);
    // 4 of 5 rose (+20%), 1 fell (-20%): comprar, alvo_5 and f_accumulating hit 80%, while f_late_entry (bearish facet) hit 20%
    expect(r.comprar).toEqual({ n: 5, acerto: 80, medio: 12, melhor: 20, pior: -20 });
    expect(r.alvo_5).toEqual({ n: 5, acerto: 80, medio: 12, melhor: 20, pior: -20 });
    expect(r.f_accumulating).toEqual({ n: 5, acerto: 80, medio: 12, melhor: 20, pior: -20 });
    expect(r.f_late_entry).toEqual({ n: 5, acerto: 20, medio: 12, melhor: 20, pior: -20 });
  });

  test("keeping a holding and selling are their own records, and a purchase the code closed (not the model's choice) never counts toward a family", async () => {
    const board = createScoreboard(memory().deps);
    for (let i = 1; i <= 5; i++) board.mark(hold(i));
    for (let i = 21; i <= 25; i++) board.mark(mark({ key: `c${i}:sell:x`, cycleId: `c${i}`, address: token(i), stance: "exit_all", side: "sell", usd: 40 }));
    for (let i = 31; i <= 35; i++) board.mark(skip(i, ["tracao"], { triggers: ["fechada_pelo_codigo"] }));
    await settle(board, () => 2.2);
    const r = board.record("1h", T0 + 2 * H);
    // price rose 10 percent: keeping was right (5 of 5), selling was wrong (0 of 5)
    expect(r.manter).toEqual({ n: 5, acerto: 100, medio: 10, melhor: 10, pior: 10 });
    expect(r.vender).toEqual({ n: 5, acerto: 0, medio: 10, melhor: 10, pior: 10 });
    expect(r.tracao).toBeUndefined();
  });

  test("the record also says what the TOKEN did in the hour after those decisions, whatever the side (the average, the best and the worst percent move), so that a hit rate cannot hide a tail: selling five winners that then rose 10, 20, 30, 40 and 199 percent is `vender` with a medio of 59.8 and a melhor of 199", async () => {
    const board = createScoreboard(memory().deps);
    for (let i = 21; i <= 25; i++) board.mark(mark({ key: `c${i}:sell:x`, cycleId: `c${i}`, address: token(i), stance: "exit_all", side: "sell", usd: 40 }));
    const after = [2.2, 2.4, 2.6, 2.8, 5.98];
    await settle(board, (d) => after[Number(d.cycleId.slice(1)) - 21] ?? 2);
    const r = board.record("1h", T0 + 2 * H);
    expect(r.vender?.n).toBe(5);
    expect(r.vender?.acerto).toBe(0);
    expect(r.vender?.melhor).toBeGreaterThan(100);
    expect(r.vender).toEqual({ n: 5, acerto: 0, medio: 59.8, melhor: 199, pior: 10 });
  });

  test("under five measured decisions the hit rate is null: a small n is not evidence, and what is not measured yet is not in the record", async () => {
    const board = createScoreboard(memory().deps);
    for (let i = 1; i <= 3; i++) board.mark(skip(i, ["carteiras"]));
    board.mark(skip(9, ["seguranca"]));
    await settle(board, () => 2.2);
    const r = board.record("1h", T0 + 2 * H);
    // a small sample carries no tail either: one anecdote is not a measure
    expect(r.carteiras).toEqual({ n: 3, acerto: null });
    // a decision whose window has not closed yet does not count
    const early = createScoreboard(memory().deps);
    early.mark(skip(1, ["fluxo"]));
    expect(early.record("1h", T0 + 10 * 60_000)).toEqual({});
  });

  test("the same bet repeated by the cycles within the window is one sample, and only the model's own decisions are counted", async () => {
    const board = createScoreboard(memory().deps);
    board.mark(skip(1, ["fluxo"]));
    board.mark(skip(1, ["fluxo"], { key: "later:buy:1|inacao", atMs: T0 + 5 * 60_000 }));
    board.mark(skip(1, ["fluxo"], { key: "plan:buy:1|inacao", source: "protecao", atMs: T0 + 10 * 60_000 }));
    await settle(board, () => 2.2);
    expect(board.record("1h", T0 + 2 * H).fluxo?.n).toBe(1);
  });
});
