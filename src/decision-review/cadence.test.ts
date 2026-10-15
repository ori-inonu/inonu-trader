import { expect, test } from "bun:test";
import { dailyOpportunities, simulateDay } from "./cadence";

test("144 cannot consult at every five-minute opportunity, while 288 covers all of them under the real paced budget", () => {
  const current = simulateDay(5, 144);
  expect(current).toMatchObject({ scheduled: 288, consultations: 144, held: 144 });
  expect(simulateDay(5, 288)).toMatchObject({ scheduled: 288, consultations: 288, held: 0 });
});

test("a three-minute cadence needs 480 opportunities, and increasing speed alone does not increase a 144 consultation budget", () => {
  expect(dailyOpportunities(3)).toBe(480);
  expect(simulateDay(3, 144)).toMatchObject({ scheduled: 480, consultations: 144, held: 336 });
  expect(simulateDay(3, 480)).toMatchObject({ consultations: 480, held: 0 });
});

test("the observed 720 daily consultations cover a nominal two-minute rhythm under the real paced policy", () => {
  expect(simulateDay(2, 144)).toMatchObject({ scheduled: 720, consultations: 144, held: 576 });
  expect(simulateDay(2, 720)).toMatchObject({ scheduled: 720, consultations: 720, held: 0 });
});

test("cost estimates are explicit and missing cost is never zero", () => {
  expect(simulateDay(5, 288).estimatedModelUsd).toBeNull();
  expect(simulateDay(5, 288, { inputTokens: 7239, inputUsdPerMillion: 0.042 }).estimatedModelUsd).toBeCloseTo(0.087563, 5);
  expect(() => simulateDay(5, 144, { inputTokens: Number.NaN, inputUsdPerMillion: 0.042 })).toThrow();
});
