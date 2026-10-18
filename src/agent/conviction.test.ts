import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { applyConviction, BUY_CONVICTION, BUY_CONVICTION_BOLD, CHASE_GATE, choiceConfidence, convictionOf, gateBuy, moderateSale, sellQuantile, type Verdict } from "./conviction";

const FULL = ["skip", "buy_third", "buy_two_thirds", "buy_full"];
/** Four options with the given top probability: the rest is spread evenly, as the documented formula only reads the peak. */
const verdict = (choice: string, peak: number, over: Partial<Verdict> = {}): Verdict => {
  const rest = (1 - peak) / 3;
  const probabilities = Object.fromEntries(FULL.map((o) => [o, o === choice ? peak : rest]));
  return { choice, probabilities, confidence: null, ...over };
};
/** The probability that makes the documented confidence of four options equal to `c`. */
const peakFor = (c: number): number => (3 * c + 1) / 4;

describe("the confidence of a Choice, as TypeSafe documents it", () => {
  test("it reads only how far the top option stands above an even split", () => {
    expect(choiceConfidence({ a: 0.9, b: 0.06, c: 0.04 })).toBeCloseTo(0.85, 6);
    expect(choiceConfidence({ a: 1 / 3, b: 1 / 3, c: 1 / 3 })).toBeCloseTo(0, 6);
    expect(choiceConfidence({ a: 0.5, b: 0.5 })).toBeCloseTo(0, 6);
    expect(choiceConfidence({ a: 1, b: 0 })).toBe(1);
  });

  test("probabilities that are not probabilities give no confidence", () => {
    expect(choiceConfidence({ a: 0.4, b: 0.1 })).toBeNull();
    expect(choiceConfidence({ a: 1.4, b: -0.4 })).toBeNull();
    expect(choiceConfidence({ a: Number.NaN, b: 0.5 })).toBeNull();
    expect(choiceConfidence({ a: 1 })).toBeNull();
    expect(choiceConfidence({})).toBeNull();
  });
});

describe("the conviction behind an answer", () => {
  test("the confidence the provider reports is the one that counts", () => {
    expect(convictionOf(verdict("buy_full", 0.9, { confidence: 0.42 }))).toBe(0.42);
  });

  test("without it, it comes from the probabilities", () => {
    expect(convictionOf(verdict("buy_full", 0.85))).toBeCloseTo((4 * 0.85 - 1) / 3, 6);
  });

  test("with neither, it is unknown, never zero and never full", () => {
    expect(convictionOf({ choice: "buy_full", probabilities: null, confidence: null })).toBeNull();
    expect(convictionOf({ choice: "buy_full", probabilities: null, confidence: 1.4 })).toBeNull();
    expect(convictionOf({ choice: "buy_full", probabilities: null, confidence: Number.NaN })).toBeNull();
  });

  test("a confidence never vouches for probabilities that are not a distribution: a sum that is not 1 or a value that is not a number gives no conviction, whatever the confidence says", () => {
    expect(convictionOf({ choice: "buy_full", probabilities: { buy_full: 0.8, skip: 0.8 }, confidence: 0.95 })).toBeNull();
    expect(convictionOf({ choice: "buy_full", probabilities: { buy_full: Number.NaN, skip: 0.2 }, confidence: 0.95 })).toBeNull();
    expect(convictionOf({ choice: "buy_full", probabilities: { buy_full: 0.9, skip: Number.POSITIVE_INFINITY }, confidence: 0.95 })).toBeNull();
    expect(convictionOf({ choice: "buy_full", probabilities: { buy_full: 0.9, skip: -0.1, buy_third: 0.2 }, confidence: 0.95 })).toBeNull();
    expect(convictionOf({ choice: "buy_full", probabilities: { buy_full: 1 }, confidence: 0.95 })).toBeNull();
    // a real distribution still has its own confidence honoured
    expect(convictionOf({ choice: "buy_full", probabilities: { buy_full: 0.8, skip: 0.2 }, confidence: 0.95 })).toBe(0.95);
  });

  test("an answer whose probabilities point at another option is not trusted", () => {
    const other = verdict("skip", 0.8);
    expect(convictionOf({ ...other, choice: "buy_full", confidence: 0.99 })).toBeNull();
    expect(convictionOf({ choice: "buy_full", probabilities: { skip: 0.7, buy_third: 0.3 }, confidence: 0.9 })).toBeNull();
  });
});

describe("the more risk a purchase adds, the more conviction it needs", () => {
  test("the bar rises with the size", () => {
    expect(BUY_CONVICTION.buy_third).toBeLessThan(BUY_CONVICTION.buy_two_thirds);
    expect(BUY_CONVICTION.buy_two_thirds).toBeLessThan(BUY_CONVICTION.buy_full);
  });

  test("a strong answer keeps its size", () => {
    const g = gateBuy(verdict("buy_full", peakFor(BUY_CONVICTION.buy_full + 0.05)), FULL);
    expect(g).toMatchObject({ stance: "buy_full", requested: "buy_full", gated: false, reason: null });
  });

  test("a moderate answer is bought smaller, not refused", () => {
    const g = gateBuy(verdict("buy_full", peakFor((BUY_CONVICTION.buy_two_thirds + BUY_CONVICTION.buy_full) / 2)), FULL);
    expect(g).toMatchObject({ stance: "buy_two_thirds", requested: "buy_full", gated: true, reason: "abaixo_do_limiar" });
  });

  test("a weak answer is not bought at all", () => {
    const g = gateBuy(verdict("buy_third", peakFor(BUY_CONVICTION.buy_third - 0.1)), FULL);
    expect(g).toMatchObject({ stance: "skip", requested: "buy_third", gated: true, reason: "abaixo_do_limiar" });
  });

  test("it never buys more than it was asked to", () => {
    expect(gateBuy(verdict("buy_third", 0.99), FULL).stance).toBe("buy_third");
  });

  test("it only falls to a size that was offered", () => {
    const offered = ["skip", "buy_third", "buy_full"];
    const g = gateBuy(verdict("buy_full", peakFor((BUY_CONVICTION.buy_two_thirds + BUY_CONVICTION.buy_full) / 2)), offered);
    expect(g.stance).toBe("buy_third");
  });

  test("not knowing how sure it is never buys", () => {
    expect(gateBuy({ choice: "buy_full", probabilities: null, confidence: null }, FULL)).toMatchObject({ stance: "skip", gated: true, reason: "sem_conviccao", conviction: null });
  });

  test("skip is the answer that adds no risk, so nothing gates it", () => {
    expect(gateBuy({ choice: "skip", probabilities: null, confidence: null }, FULL)).toMatchObject({ stance: "skip", gated: false, reason: null });
  });

  test("a stance outside the purchase sizes is refused", () => {
    expect(gateBuy(verdict("buy_all", 0.99), FULL)).toMatchObject({ stance: "skip", gated: true, reason: "opcao_invalida" });
    expect(gateBuy(verdict("buy_full", 0.99), ["skip", "buy_third"])).toMatchObject({ stance: "buy_third", gated: true });
    expect(gateBuy(verdict("hold", 0.99), FULL)).toMatchObject({ stance: "skip", reason: "opcao_invalida" });
  });
});

describe("the module has no way to act", () => {
  test("it reads, computes and returns: no network, disk, clock, process or model", () => {
    const source = readFileSync(new URL("./conviction.ts", import.meta.url), "utf8");
    for (const token of ["node:", "fetch(", "Bun.", "process.", "Date.now", "Math.random", "setTimeout", "import(", "require("]) expect(source.includes(token)).toBe(false);
    const imports = [...source.matchAll(/^import .* from "([^"]+)"/gm)].map((m) => m[1]);
    expect(imports.every((m) => m === "./types")).toBe(true);
  });
});

describe("applying the conviction to the stances of a whole answer", () => {
  const buy = (id: string, offered: string[] = ["buy_full", "buy_two_thirds", "buy_third", "skip"]) => ({ id, kind: "buy" as const, stances: offered });
  const hold = (id: string) => ({ id, kind: "holding" as const, stances: ["hold", "trim_half", "exit_all"] });
  const probs = (top: string, p: number) => ({ [top]: p, skip: 1 - p });

  test("a strong answer keeps its size, a moderate one is bought smaller, a weak one is not bought, and holdings are never touched", () => {
    const out = applyConviction(
      {
        stances: { "buy:a": "buy_full", "buy:b": "buy_full", "buy:c": "buy_full", "hold:x": "exit_all" },
        verdicts: { "buy:a": { choice: "buy_full", probabilities: probs("buy_full", 0.9), confidence: null }, "buy:b": { choice: "buy_full", probabilities: probs("buy_full", 0.82), confidence: null }, "buy:c": { choice: "buy_full", probabilities: probs("buy_full", 0.6), confidence: null } },
      },
      [buy("buy:a"), buy("buy:b"), buy("buy:c"), hold("hold:x")],
    );
    expect(out.stances["buy:a"]).toBe("buy_full");
    expect(["buy_two_thirds", "buy_third"]).toContain(out.stances["buy:b"]!);
    expect(out.stances["buy:c"]).toBe("skip");
    expect(out.stances["hold:x"]).toBe("exit_all");
    expect(out.notes).toContain("conviccao_reduziu");
  });

  test("an answer that came with no probabilities at all is unknown, never invented: it may buy the smallest size and no more", () => {
    const out = applyConviction({ stances: { "buy:a": "buy_full", "buy:b": "buy_third" }, verdicts: {} }, [buy("buy:a"), buy("buy:b")]);
    expect(out.stances["buy:a"]).toBe("buy_third");
    expect(out.stances["buy:b"]).toBe("buy_third");
    expect(out.notes).toContain("conviccao_desconhecida");
    // and when the smallest size was not offered there is nothing to fall to
    expect(applyConviction({ stances: { "buy:a": "buy_full" }, verdicts: {} }, [buy("buy:a", ["buy_full", "skip"])]).stances["buy:a"]).toBe("skip");
  });

  test("a stance that is not a purchase size the code offered is never turned into a purchase, whatever the verdict says or lacks", () => {
    const out = applyConviction({ stances: { "buy:a": "hold", "buy:b": "buy_everything", "buy:c": "exit_all", "buy:d": "buy_full" }, verdicts: {} }, [buy("buy:a"), buy("buy:b"), buy("buy:c"), buy("buy:d", ["buy_third", "skip"])]);
    // left exactly as asked, for the validation after it to refuse
    expect(out.stances["buy:a"]).toBe("hold");
    expect(out.stances["buy:b"]).toBe("buy_everything");
    expect(out.stances["buy:c"]).toBe("exit_all");
    // a size that was not offered for this candidate is not downgraded into one that was: it is left for the validation too
    expect(out.stances["buy:d"]).toBe("buy_full");
    expect(out.notes).toEqual([]);
  });

  test("probabilities that are not a distribution refuse the purchase outright", () => {
    const out = applyConviction({ stances: { "buy:a": "buy_full" }, verdicts: { "buy:a": { choice: "buy_full", probabilities: { buy_full: 0.8, skip: 0.8 }, confidence: null } } }, [buy("buy:a")]);
    expect(out.stances["buy:a"]).toBe("skip");
    expect(out.notes).toContain("conviccao_recusou");
  });

  test("skip and every candidate the answer did not mention pass through untouched, and nothing in the answer is mutated", () => {
    const raw = { stances: { "buy:a": "skip" }, verdicts: {} };
    const frozen = JSON.stringify(raw);
    const out = applyConviction(raw, [buy("buy:a"), buy("buy:z")]);
    expect(out.stances).toEqual({ "buy:a": "skip" });
    expect(out.notes).toEqual([]);
    expect(JSON.stringify(raw)).toBe(frozen);
  });
});

describe("the bold profile of the owner asks for a lean, not a certainty: the bar is by the rank of the size on offer, so the smallest purchase the code can carry out needs the least", () => {
  const two = (pBuy: number) => ({ choice: "buy_full", probabilities: { skip: 1 - pBuy, buy_full: pBuy }, confidence: null });
  const run = (verdict: ReturnType<typeof two>, offered: string[], bold: boolean) => applyConviction({ stances: { "buy:a": "buy_full" }, verdicts: { "buy:a": verdict }, ...(bold ? { bold: true } : {}) }, [{ id: "buy:a", kind: "buy", stances: offered, marks: [] }]);

  test("the bars rise with the rank of the size on offer, and a small wallet that is offered only one size is asked for the smallest bar", () => {
    expect(BUY_CONVICTION_BOLD).toEqual([0.2, 0.35, 0.5]);
    expect(BUY_CONVICTION_BOLD[0]).toBeLessThan(BUY_CONVICTION.buy_third);
  });

  test("a 60 percent lean for the only purchase on offer buys it with the bold profile and is refused without", () => {
    expect(run(two(0.6), ["skip", "buy_full"], true).stances["buy:a"]).toBe("buy_full");
    expect(run(two(0.6), ["skip", "buy_full"], true).notes).toEqual([]);
    const plain = run(two(0.6), ["skip", "buy_full"], false);
    expect(plain.stances["buy:a"]).toBe("skip");
    expect(plain.notes).toContain("conviccao_recusou");
  });

  test("an even split is never a purchase, bold or not, and a thin lean is made smaller when smaller sizes are on offer", () => {
    expect(run(two(0.5), ["skip", "buy_full"], true).stances["buy:a"]).toBe("skip");
    expect(run(two(0.55), ["skip", "buy_full"], true).stances["buy:a"]).toBe("skip");
    const all = ["skip", "buy_third", "buy_two_thirds", "buy_full"];
    expect(run(two(0.6), all, true).stances["buy:a"]).toBe("buy_third");
    expect(run(two(0.7), all, true).stances["buy:a"]).toBe("buy_two_thirds");
    expect(run(two(0.78), all, true).stances["buy:a"]).toBe("buy_full");
  });

  test("the bar of a size is its rank among the sizes on offer: with two on offer, the smaller needs the least", () => {
    expect(run(two(0.6), ["skip", "buy_two_thirds", "buy_full"], true).stances["buy:a"]).toBe("buy_two_thirds");
    expect(run(two(0.7), ["skip", "buy_two_thirds", "buy_full"], true).stances["buy:a"]).toBe("buy_full");
  });

  test("the profile changes the bar and nothing else: an answer whose probabilities are not a distribution is still refused, and a skip is a skip", () => {
    const broken = { choice: "buy_full", probabilities: { buy_full: 0.9, skip: 0.9 }, confidence: null };
    expect(run(broken as never, ["skip", "buy_full"], true).stances["buy:a"]).toBe("skip");
    const passed = applyConviction({ stances: { "buy:a": "skip" }, verdicts: {}, bold: true }, [{ id: "buy:a", kind: "buy", stances: ["skip", "buy_full"], marks: [] }]);
    expect(passed.stances["buy:a"]).toBe("skip");
  });
});

describe("the model's own view of the top and of the fall decides the entries the code only marked (the code does not close them)", () => {
  const buyWith = (id: string, marks: readonly string[], offered: string[] = ["skip", "buy_third", "buy_full"]) => ({ id, kind: "buy" as const, stances: offered, marks });
  const sure = (id: string) => ({ [id]: { choice: "buy_full", probabilities: { buy_full: 0.9, skip: 0.1 }, confidence: null } });
  const run = (marks: readonly string[], facets: Record<string, number> | null) =>
    applyConviction({ stances: { "buy:a": "buy_full" }, verdicts: sure("buy:a"), ...(facets === null ? {} : { facets: { "buy:a": facets } }) }, [buyWith("buy:a", marks)]);

  test("a stretched or parabolic entry goes through when the model says it is not late, and is skipped when it says it is", () => {
    for (const mark of ["esticado", "parabolico"]) {
      expect(run([mark], { late_entry: 0.3 }).stances["buy:a"]).toBe("buy_full");
      expect(run([mark], { late_entry: 0.3 }).notes).toEqual([]);
      const late = run([mark], { late_entry: CHASE_GATE.lateEntry });
      expect(late.stances["buy:a"]).toBe("skip");
      expect(late.notes).toContain("topo_visto_pelo_jev");
      expect(run([mark], { late_entry: CHASE_GATE.lateEntry - 0.01 }).stances["buy:a"]).toBe("buy_full");
    }
  });

  test("no answer about the top is never read as calm: a marked entry without it is skipped", () => {
    const none = run(["parabolico"], null);
    expect(none.stances["buy:a"]).toBe("skip");
    expect(none.notes).toContain("topo_sem_resposta");
    // an answer about something else is no answer about the top
    expect(run(["esticado"], { fading: 0.1 }).notes).toContain("topo_sem_resposta");
  });

  test("a price falling fast needs the model to say the fall has stopped", () => {
    expect(run(["caindo"], { still_falling: 0.2 }).stances["buy:a"]).toBe("buy_full");
    const knife = run(["caindo"], { still_falling: CHASE_GATE.stillFalling });
    expect(knife.stances["buy:a"]).toBe("skip");
    expect(knife.notes).toContain("queda_vista_pelo_jev");
    expect(run(["caindo"], null).notes).toContain("queda_sem_resposta");
  });

  test("an entry with no mark of the moment does not depend on the facets, and a skip stays a skip with no notes", () => {
    expect(run([], { late_entry: 0.99, still_falling: 0.99 }).stances["buy:a"]).toBe("buy_full");
    expect(run(["volatil", "disparando"], null).stances["buy:a"]).toBe("buy_full");
    const passed = applyConviction({ stances: { "buy:a": "skip" }, verdicts: {} }, [buyWith("buy:a", ["parabolico"])]);
    expect(passed.stances["buy:a"]).toBe("skip");
    expect(passed.notes).toEqual([]);
  });

  test("a smaller size the conviction chose is still checked against the top, and a holding is never touched by it", () => {
    const middling = (late: number) => applyConviction({ stances: { "buy:a": "buy_full" }, verdicts: { "buy:a": { choice: "buy_full", probabilities: { buy_full: 0.78, skip: 0.22 }, confidence: null } }, facets: { "buy:a": { late_entry: late } } }, [buyWith("buy:a", ["esticado"])]);
    expect(middling(0.1).stances["buy:a"]).toBe("buy_third");
    expect(middling(0.9).stances["buy:a"]).toBe("skip");
    expect(middling(0.9).notes).toEqual(expect.arrayContaining(["conviccao_reduziu", "topo_visto_pelo_jev"]));
    const holding = applyConviction({ stances: { "hold:x": "hold" }, verdicts: {}, facets: { "hold:x": { late_entry: 0.99 } } }, [{ id: "hold:x", kind: "holding", stances: ["hold", "exit_all"], marks: ["esticado"] }]);
    expect(holding.stances["hold:x"]).toBe("hold");
  });
});

describe("a sale is read from the whole spread of the model over the ladder, not from its single top option", () => {
  const holding = (id: string, offered: string[] = ["hold", "trim_third", "trim_half", "exit_all"]) => ({ id, kind: "holding" as const, stances: offered });
  const spread = (asked: string, probabilities: Record<string, number>) => applyConviction({ stances: { "hold:x": asked }, verdicts: { "hold:x": { choice: asked, probabilities, confidence: null } } }, [holding("hold:x", Object.keys(probabilities))]);

  test("a split answer sells the median step, not the top option: 42 sell all, 23 sell half, 35 keep sells half", () => {
    const out = spread("exit_all", { hold: 0.35, trim_half: 0.23, exit_all: 0.42 });
    expect(out.stances["hold:x"]).toBe("trim_half");
    expect(out.notes).toContain("conviccao_moderou");
  });

  test("the ladder is ordered by how much is sold: 40 sell all, 30 sell a third, 30 keep sells a third", () => {
    expect(spread("exit_all", { hold: 0.3, trim_third: 0.3, exit_all: 0.4 }).stances["hold:x"]).toBe("trim_third");
  });

  test("a clear answer keeps its step: 80 sell all stays selling all", () => {
    const out = spread("exit_all", { hold: 0.1, trim_half: 0.1, exit_all: 0.8 });
    expect(out.stances["hold:x"]).toBe("exit_all");
    expect(out.notes).toEqual([]);
  });

  test("an answer torn between the two ends with nothing between them goes with the larger side", () => {
    expect(spread("exit_all", { hold: 0.45, exit_all: 0.55 }).stances["hold:x"]).toBe("exit_all");
    expect(spread("hold", { hold: 0.55, exit_all: 0.45 }).stances["hold:x"]).toBe("hold");
  });

  test("it only ever sells LESS than the model's top option, never more, and never turns a keep into a sale", () => {
    // keep is the top option but 60 percent of the mass says to sell at least half: the keep stays
    const out = spread("hold", { hold: 0.4, trim_half: 0.3, exit_all: 0.3 });
    expect(out.stances["hold:x"]).toBe("hold");
    expect(out.notes).toEqual([]);
    // half is the top option and the median is half: unchanged
    expect(spread("trim_half", { hold: 0.3, trim_half: 0.45, exit_all: 0.25 }).stances["hold:x"]).toBe("trim_half");
  });

  test("it only falls to a step that was offered", () => {
    // a third was not offered, so the probabilities only cover keep, half and all
    const out = applyConviction({ stances: { "hold:x": "exit_all" }, verdicts: { "hold:x": { choice: "exit_all", probabilities: { hold: 0.3, trim_half: 0.28, exit_all: 0.42 }, confidence: null } } }, [holding("hold:x", ["hold", "trim_half", "exit_all"])]);
    expect(out.stances["hold:x"]).toBe("trim_half");
  });

  test("without probabilities, or with ones that are not a distribution, the answer passes as it came", () => {
    expect(applyConviction({ stances: { "hold:x": "exit_all" }, verdicts: {} }, [holding("hold:x")]).stances["hold:x"]).toBe("exit_all");
    expect(spread("exit_all", { hold: 0.2, trim_half: 0.2, exit_all: 0.2 }).stances["hold:x"]).toBe("exit_all");
    // probabilities that put another option on top are not an answer to read either
    expect(spread("exit_all", { hold: 0.6, trim_half: 0.1, exit_all: 0.3 }).stances["hold:x"]).toBe("exit_all");
  });

  test("the input is not changed and a purchase is not touched by this rule", () => {
    const raw = { stances: { "hold:x": "exit_all", "buy:a": "skip" }, verdicts: { "hold:x": { choice: "exit_all", probabilities: { hold: 0.35, trim_half: 0.23, exit_all: 0.42 }, confidence: null } } };
    const frozen = JSON.stringify(raw);
    const out = applyConviction(raw, [holding("hold:x", ["hold", "trim_half", "exit_all"]), { id: "buy:a", kind: "buy" as const, stances: ["skip", "buy_third"] }]);
    expect(out.stances["buy:a"]).toBe("skip");
    expect(JSON.stringify(raw)).toBe(frozen);
  });
});

describe("the more its own sales have failed to pay, the more doubt the model must show before a sale is made: the bar learns from the Placar", () => {
  const holding = (id: string, offered: string[] = ["hold", "trim_third", "trim_half", "exit_all"]) => ({ id, kind: "holding" as const, stances: offered });
  const P = { hold: 0.05, trim_half: 0.43, exit_all: 0.52 };
  const verdictOf = (probabilities: Record<string, number>): Verdict => ({ choice: "exit_all", probabilities, confidence: null });

  test("the quantile is the median while there is no record or the record is good, and falls toward 0.2 as the sales that were made kept losing to holding", () => {
    expect(sellQuantile(null)).toBe(0.5);
    expect(sellQuantile({ n: 4, acerto: 0 })).toBe(0.5);
    expect(sellQuantile({ n: 20, acerto: null })).toBe(0.5);
    expect(sellQuantile({ n: 5, acerto: 50 })).toBe(0.5);
    expect(sellQuantile({ n: 5, acerto: 80 })).toBe(0.5);
    expect(sellQuantile({ n: 5, acerto: 20 })).toBeCloseTo(0.32, 6);
    expect(sellQuantile({ n: 5, acerto: 0 })).toBeCloseTo(0.2, 6);
    expect(sellQuantile({ n: 30, acerto: 0 })).toBeCloseTo(0.2, 6);
  });

  test("a lower quantile takes the sale down further: 5 percent keep, 43 sell half and 52 sell all is a sale of everything at the median (48 is not yet half) and half at 0.2, and 28 keep is a keep at 0.2", () => {
    expect(moderateSale(verdictOf(P), ["hold", "trim_half", "exit_all"], 0.5)).toBe("exit_all");
    expect(moderateSale(verdictOf(P), ["hold", "trim_half", "exit_all"], 0.2)).toBe("trim_half");
    const doubt = { hold: 0.28, trim_half: 0.38, exit_all: 0.34 };
    expect(moderateSale({ choice: "trim_half", probabilities: doubt, confidence: null }, ["hold", "trim_half", "exit_all"], 0.5)).toBe("trim_half");
    expect(moderateSale({ choice: "trim_half", probabilities: doubt, confidence: null }, ["hold", "trim_half", "exit_all"], 0.2)).toBe("hold");
  });

  test("a sale the model is sure of survives even the strictest bar: a keep that carries under a fifth of its mass is not a keep", () => {
    const sure = { hold: 0.1, trim_half: 0.1, exit_all: 0.8 };
    expect(moderateSale(verdictOf(sure), ["hold", "trim_half", "exit_all"], 0.2)).toBe("trim_half");
    const surer = { hold: 0.02, trim_half: 0.03, exit_all: 0.95 };
    expect(moderateSale(verdictOf(surer), ["hold", "trim_half", "exit_all"], 0.2)).toBe("exit_all");
  });

  test("applying a whole answer with the record of the sales: the same doubt is a sale while the record is good and a keep once the sales have failed", () => {
    const doubt = { hold: 0.28, trim_half: 0.38, exit_all: 0.34 };
    const input = (sellRecord?: { n: number; acerto: number | null } | null) => ({ stances: { "hold:x": "trim_half" }, verdicts: { "hold:x": { choice: "trim_half", probabilities: doubt, confidence: null } }, ...(sellRecord === undefined ? {} : { sellRecord }) });
    const cands = [holding("hold:x", ["hold", "trim_half", "exit_all"])];
    expect(applyConviction(input(), cands).stances["hold:x"]).toBe("trim_half");
    expect(applyConviction(input({ n: 12, acerto: 70 }), cands).stances["hold:x"]).toBe("trim_half");
    const bad = applyConviction(input({ n: 5, acerto: 0 }), cands);
    expect(bad.stances["hold:x"]).toBe("hold");
    expect(bad.notes).toContain("conviccao_moderou");
  });
});

describe("what the gate did to each purchase is kept per candidate, with the raw numbers", () => {
  const single = ["buy_full", "skip"];
  const one = (id: string, offered: string[] = single) => ({ id, kind: "buy" as const, stances: offered, marks: [] as string[] });
  const two = (up: number) => ({ choice: "buy_full", probabilities: { skip: 1 - up, buy_full: up }, confidence: null });

  test("a lean the owner's bold bar refuses says its raw conviction and the bar it fell under (the 51 to 49 case)", () => {
    const out = applyConviction({ stances: { "buy:a": "buy_full" }, verdicts: { "buy:a": two(0.51) }, bold: true }, [one("buy:a")]);
    expect(out.stances["buy:a"]).toBe("skip");
    expect(out.gates["buy:a"]).toEqual({ asked: "buy_full", applied: "skip", conviction: 0.02, bar: 0.2, reason: "abaixo_do_limiar" });
  });

  test("a purchase that clears the bar keeps its size and shows the same numbers, with no reason", () => {
    const out = applyConviction({ stances: { "buy:a": "buy_full" }, verdicts: { "buy:a": two(0.7) }, bold: true }, [one("buy:a")]);
    expect(out.gates["buy:a"]).toEqual({ asked: "buy_full", applied: "buy_full", conviction: 0.4, bar: 0.2, reason: null });
  });

  test("a size taken down names the bar of the size that was kept", () => {
    const sizes = ["buy_full", "buy_two_thirds", "buy_third", "skip"];
    const out = applyConviction({ stances: { "buy:a": "buy_full" }, verdicts: { "buy:a": { choice: "buy_full", probabilities: { skip: 0.1, buy_third: 0.1, buy_two_thirds: 0.2, buy_full: 0.6 }, confidence: null } }, bold: true }, [one("buy:a", sizes)]);
    expect(out.stances["buy:a"]).toBe("buy_two_thirds");
    expect(out.gates["buy:a"]).toMatchObject({ asked: "buy_full", applied: "buy_two_thirds", bar: 0.35, reason: "abaixo_do_limiar" });
  });

  test("the raw conviction is kept to six places, not rounded to the two the probabilities are shown with", () => {
    const out = applyConviction({ stances: { "buy:a": "buy_full" }, verdicts: { "buy:a": two(0.5951234) }, bold: true }, [one("buy:a")]);
    expect(out.gates["buy:a"]!.conviction).toBe(0.190247);
    expect(out.gates["buy:a"]!.applied).toBe("skip");
  });

  test("an unknown conviction and the model's own view of the fall are told apart from a weak lean", () => {
    const none = applyConviction({ stances: { "buy:a": "buy_full" }, verdicts: {} }, [one("buy:a", ["buy_full", "buy_third", "skip"])]);
    expect(none.gates["buy:a"]).toEqual({ asked: "buy_full", applied: "buy_third", conviction: null, bar: null, reason: "conviccao_desconhecida" });
    const falling = applyConviction({ stances: { "buy:a": "buy_full" }, verdicts: { "buy:a": two(0.9) }, bold: true, facets: { "buy:a": { still_falling: 0.8 } } }, [{ ...one("buy:a"), marks: ["caindo"] }]);
    expect(falling.stances["buy:a"]).toBe("skip");
    expect(falling.gates["buy:a"]).toMatchObject({ asked: "buy_full", applied: "skip", conviction: 0.8, bar: 0.2, reason: "queda_vista_pelo_jev" });
  });

  test("a skip, a holding and a stance that is not a size the code offered leave no gate entry", () => {
    const out = applyConviction({ stances: { "buy:a": "skip", "hold:x": "exit_all", "buy:b": "buy_everything" }, verdicts: {} }, [one("buy:a"), { id: "hold:x", kind: "holding", stances: ["hold", "exit_all"], marks: [] }, one("buy:b")]);
    expect(out.gates).toEqual({});
  });
});
