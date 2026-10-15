import { describe, expect, test } from "bun:test";
import { BOLD_HOT_FLOOR_MIN, boldHotIntervalMin, effectiveIntervalMin, HOT_INTERVAL_MIN } from "./autopilot";
import { createBudget } from "./budget";

const DAY = 86_400_000;
const MIN = 60_000;
const MIDNIGHT = Date.UTC(2026, 9, 15, 0, 0, 0);

describe("under the owner's bold profile the hot interval is the fastest the day's capacity can pay, never under a minute", () => {
  test("the floor is one minute", () => {
    expect(BOLD_HOT_FLOOR_MIN).toBe(1);
  });

  test("the interval everyone else has stays two minutes: this change reaches only the bold profile", () => {
    expect(HOT_INTERVAL_MIN).toBe(2);
  });

  test("with the whole capacity of 720 for the whole UTC day the interval is the two minutes of today", () => {
    expect(boldHotIntervalMin({ remainingConsults: 720, remainingMs: DAY })).toBe(2);
  });

  test("with capacity left over, as at 12:44 local with 463 consultations for 496 minutes, the interval is shorter than two", () => {
    expect(boldHotIntervalMin({ remainingConsults: 463, remainingMs: 496 * MIN })).toBe(1.07);
  });

  test("with far more capacity than time the interval stops at the floor", () => {
    expect(boldHotIntervalMin({ remainingConsults: 1_000, remainingMs: 100 * MIN })).toBe(1);
  });

  test("with no capacity left the interval is unbounded, so the rhythm of the mandate rules and the budget refuses the look", () => {
    expect(boldHotIntervalMin({ remainingConsults: 0, remainingMs: 10 * MIN })).toBe(Number.POSITIVE_INFINITY);
  });

  test("a time that is not a number does not make the interval a number: it falls to the floor, never to NaN", () => {
    expect(boldHotIntervalMin({ remainingConsults: 100, remainingMs: Number.NaN })).toBe(1);
  });

  test("hot, the interval is the shorter of the rhythm and the hot interval handed in", () => {
    expect(effectiveIntervalMin(5, true, 1.07)).toBe(1.07);
  });

  test("a hot interval slower than the rhythm never slows the rhythm down", () => {
    expect(effectiveIntervalMin(5, true, 9)).toBe(5);
  });

  test("not hot, the rhythm, whatever the hot interval", () => {
    expect(effectiveIntervalMin(5, false, 1)).toBe(5);
  });

  test("with no hot interval handed in the old behaviour is kept: two minutes", () => {
    expect(effectiveIntervalMin(10, true)).toBe(2);
  });
});

/**
 * One UTC day of looks, minute by minute on a fake clock, with the REAL budget (720 a day, paced over the day) and the interval the bold profile would ask for at each look. This is what "limited by the cap of
 * consultations" has to mean: however fast the interval, the day is never spent early and left blind, and the cap is never exceeded.
 */
function simulate(startMs: number, alreadyUsed: number): { used: number; refused: Record<string, number>; looks: number; lastLookAtMs: number } {
  let now = startMs;
  const day = new Date(startMs).toISOString().slice(0, 10);
  const budget = createBudget({
    limits: { maxConsultsPerDay: 720, maxTokensPerDay: null },
    now: () => now,
    load: () => (alreadyUsed === 0 ? null : { version: 1, day, consults: alreadyUsed, committedTokens: 0, measuredTokens: 0, unmeasuredCalls: 0 }),
    persist: () => {},
    pace: true,
  });
  const refused: Record<string, number> = {};
  let looks = 0;
  let lastLookAtMs = startMs;
  const dayEnd = Math.floor(startMs / DAY) * DAY + DAY;
  while (now < dayEnd) {
    const verdict = budget.check(15_000);
    if (verdict.ok) {
      const ticket = budget.begin(15_000);
      budget.finish(ticket, { inputTokens: 14_000, outputTokens: 1_000 } as never);
      looks++;
      lastLookAtMs = now;
    } else refused[verdict.reason] = (refused[verdict.reason] ?? 0) + 1;
    const s = budget.status();
    const interval = effectiveIntervalMin(5, true, boldHotIntervalMin({ remainingConsults: s.limits.maxConsultsPerDay - s.consults, remainingMs: dayEnd - now }));
    now += Math.max(1_000, interval * MIN);
  }
  return { used: budget.status().consults, refused, looks, lastLookAtMs };
}

describe("a whole UTC day at the bold hot interval spends the capacity evenly and never leaves the end of the day blind", () => {
  test("from midnight with nothing used, the 720 are spent and not one more", () => {
    expect(simulate(MIDNIGHT, 0).used).toBeLessThanOrEqual(720);
  });

  test("from midnight, a look still happens in the last ten minutes of the day", () => {
    const r = simulate(MIDNIGHT, 0);
    expect(MIDNIGHT + DAY - r.lastLookAtMs).toBeLessThanOrEqual(10 * MIN);
  });

  test("from midnight, the interval never outruns what the budget has earned: no look is refused by the pace of the day", () => {
    expect(simulate(MIDNIGHT, 0).refused.ritmo_do_dia ?? 0).toBe(0);
  });

  test("from 15:44 UTC with 257 used, as today, the day ends within the cap with a look near the end", () => {
    const start = MIDNIGHT + (15 * 60 + 44) * MIN;
    const r = simulate(start, 257);
    expect([r.used <= 720, MIDNIGHT + DAY - r.lastLookAtMs <= 10 * MIN]).toEqual([true, true]);
  });

  test("from 15:44 UTC with 257 used, it looks faster than the two minutes of today: more looks than one every two minutes would make", () => {
    const start = MIDNIGHT + (15 * 60 + 44) * MIN;
    const minutesLeft = (MIDNIGHT + DAY - start) / MIN;
    expect(simulate(start, 257).looks).toBeGreaterThan(minutesLeft / 2);
  });

  test("from 15:44 UTC with 257 used, no look is refused by the pace of the day nor by the cap before the end", () => {
    const start = MIDNIGHT + (15 * 60 + 44) * MIN;
    const r = simulate(start, 257);
    expect([r.refused.ritmo_do_dia ?? 0, r.refused.consultas_esgotadas ?? 0]).toEqual([0, 0]);
  });
});
