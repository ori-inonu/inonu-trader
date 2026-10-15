import { expect, test } from "bun:test";
import { moderateSale } from "../agent/conviction";

const offered = ["hold", "trim_third", "trim_half", "exit_all"];

test("the new sale heuristic preserves a clear exit and moderates the split example without increasing exposure changes", () => {
  expect(moderateSale({ choice: "exit_all", confidence: null, probabilities: { hold: 0.05, trim_third: 0, trim_half: 0, exit_all: 0.95 } }, offered)).toBe("exit_all");
  expect(moderateSale({ choice: "exit_all", confidence: null, probabilities: { hold: 0.35, trim_half: 0.23, exit_all: 0.42 } }, offered)).toBe("trim_half");
});

test("no median is fabricated from an unoffered step, missing probability, or malformed distribution", () => {
  const cases: readonly (Readonly<Record<string, number>> | null)[] = [null, { hold: 0.7, exit_all: 0.8 }, { hold: Number.NaN, exit_all: 0.5 }, { hold: 0.1, trim_third: 0.6, exit_all: 0.3 }];
  for (const p of cases) {
    expect(moderateSale({ choice: "exit_all", confidence: null, probabilities: p }, ["hold", "exit_all"])).toBe("exit_all");
  }
});

test("selling more is never introduced, even across all normalized synthetic distributions", () => {
  let checked = 0;
  for (let a = 0; a <= 10; a++) for (let b = 0; b <= 10 - a; b++) for (let c = 0; c <= 10 - a - b; c++) {
    const values = [a / 10, b / 10, c / 10, (10 - a - b - c) / 10];
    const pick = values.indexOf(Math.max(...values));
    const probabilities = Object.fromEntries(offered.map((s, i) => [s, values[i]!]));
    const output = moderateSale({ choice: offered[pick]!, probabilities, confidence: null }, offered);
    expect(offered.indexOf(output)).toBeLessThanOrEqual(pick);
    checked++;
  }
  expect(checked).toBe(286);
});
