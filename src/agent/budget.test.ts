import { describe, expect, test } from "bun:test";
import { createBudget, DEFAULT_LIMITS, parseBudgetState, type BudgetState } from "./budget";

const DAY1 = Date.UTC(2026, 9, 14, 12, 0, 0);
const DAY2 = Date.UTC(2026, 9, 15, 0, 0, 1);

const make = (limits = DEFAULT_LIMITS, initial: BudgetState | null = null, now = () => DAY1) => {
  const saved: BudgetState[] = [];
  const budget = createBudget({ limits, now, load: () => initial, persist: (s) => void saved.push(s) });
  return { budget, saved };
};

describe("the model budget of the agent", () => {
  test("the default is the user's: 144 consultations a day and no token cap until they set one", () => {
    expect(DEFAULT_LIMITS).toEqual({ maxConsultsPerDay: 144, maxTokensPerDay: null });
  });

  test("a consultation is counted before the call, so a crash cannot hide it", () => {
    const { budget, saved } = make();
    expect(budget.check(1000)).toEqual({ ok: true });
    budget.begin(1000);
    expect(saved.at(-1)).toMatchObject({ consults: 1, committedTokens: 1000 });
    expect(budget.status().consults).toBe(1);
  });

  test("the day is spent: no more consultations, with the reason", () => {
    const { budget } = make({ maxConsultsPerDay: 2, maxTokensPerDay: null });
    budget.begin(10);
    budget.begin(10);
    expect(budget.check(10)).toEqual({ ok: false, reason: "consultas_esgotadas" });
    expect(() => budget.begin(10)).toThrow("consultas_esgotadas");
  });

  test("measured usage replaces the estimate, and unknown usage keeps the estimate (never zero)", () => {
    const { budget } = make({ maxConsultsPerDay: 10, maxTokensPerDay: 5000 });
    const a = budget.begin(2000);
    budget.finish(a, { inputTokens: 900, outputTokens: 100 });
    expect(budget.status()).toMatchObject({ committedTokens: 1000, measuredTokens: 1000, unmeasuredCalls: 0 });
    const b = budget.begin(2000);
    budget.finish(b, { inputTokens: null, outputTokens: null });
    expect(budget.status()).toMatchObject({ committedTokens: 3000, measuredTokens: 1000, unmeasuredCalls: 1 });
    const c = budget.begin(2000);
    budget.finish(c, null);
    expect(budget.status()).toMatchObject({ committedTokens: 5000, unmeasuredCalls: 2 });
  });


  test("the token cap counts what is committed, estimate included", () => {
    const { budget } = make({ maxConsultsPerDay: 10, maxTokensPerDay: 3000 });
    budget.begin(2000);
    expect(budget.check(1500)).toEqual({ ok: false, reason: "tokens_esgotados" });
    expect(budget.check(1000)).toEqual({ ok: true });
  });

  test("no token cap means only the consultation count limits", () => {
    const { budget } = make();
    expect(budget.check(10_000_000)).toEqual({ ok: true });
  });

  test("a new day starts from zero", () => {
    let now = DAY1;
    const { budget } = make({ maxConsultsPerDay: 1, maxTokensPerDay: null }, null, () => now);
    budget.begin(10);
    expect(budget.check(10).ok).toBe(false);
    now = DAY2;
    expect(budget.check(10)).toEqual({ ok: true });
    expect(budget.status().consults).toBe(0);
  });

  test("a restart reads today's counters back, and yesterday's are ignored", () => {
    const today: BudgetState = { version: 1, day: "2026-10-14", consults: 143, committedTokens: 0, measuredTokens: 0, unmeasuredCalls: 0 };
    expect(make(DEFAULT_LIMITS, today).budget.check(1)).toEqual({ ok: true });
    const full: BudgetState = { ...today, consults: 144 };
    expect(make(DEFAULT_LIMITS, full).budget.check(1)).toEqual({ ok: false, reason: "consultas_esgotadas" });
    expect(make(DEFAULT_LIMITS, { ...full, day: "2026-10-13" }).budget.check(1)).toEqual({ ok: true });
  });

  test("a counter that cannot be saved stops the consultation: nothing is spent unseen", () => {
    const budget = createBudget({
      limits: DEFAULT_LIMITS,
      now: () => DAY1,
      load: () => null,
      persist: () => {
        throw new Error("disk");
      },
    });
    expect(() => budget.begin(10)).toThrow("orcamento_nao_gravou");
    expect(budget.status().consults).toBe(0);
  });

  test("an untrusted saved state is refused: the day counts as spent", () => {
    expect(parseBudgetState({ version: 1, day: "2026-10-14", consults: -1, committedTokens: 0, measuredTokens: 0, unmeasuredCalls: 0 })).toBeNull();
    expect(parseBudgetState({ version: 1, day: "2026-10-14", consults: 1 })).toBeNull();
    const budget = createBudget({ limits: DEFAULT_LIMITS, now: () => DAY1, load: () => ({ junk: true }), persist: () => { } });
    expect(budget.check(1)).toEqual({ ok: false, reason: "consultas_esgotadas" });
  });

  test("a change of the limits applies at the next check", () => {
    const limits = { maxConsultsPerDay: 1, maxTokensPerDay: null as number | null };
    const budget = createBudget({ limits, now: () => DAY1, load: () => null, persist: () => { } });
    budget.begin(1);
    expect(budget.check(1)).toEqual({ ok: false, reason: "consultas_esgotadas" });
    limits.maxConsultsPerDay = 5;
    expect(budget.check(1)).toEqual({ ok: true });
    limits.maxTokensPerDay = 10;
    expect(budget.check(100)).toEqual({ ok: false, reason: "tokens_esgotados" });
    expect(budget.status().limits).toEqual({ maxConsultsPerDay: 5, maxTokensPerDay: 10 });
  });

  test("limits that make no sense are refused at creation", () => {
    expect(() => make({ maxConsultsPerDay: 0, maxTokensPerDay: null })).toThrow();
    expect(() => make({ maxConsultsPerDay: 1.5, maxTokensPerDay: null })).toThrow();
    expect(() => make({ maxConsultsPerDay: 10, maxTokensPerDay: -1 })).toThrow();
  });
});

describe("the day's consultations are paced, so 144 of them cannot be spent by noon and leave the afternoon blind", () => {
  const at = (hh: number, mm = 0) => Date.UTC(2026, 9, 14, hh, mm, 0);
  const paced = (consults: number, now: number) =>
    createBudget({ limits: DEFAULT_LIMITS, now: () => now, load: () => ({ version: 1, day: "2026-10-14", consults, committedTokens: 0, measuredTokens: 0, unmeasuredCalls: 0 }), persist: () => { }, pace: true });

  test("what the clock allows grows through the UTC day, with a small reserve for a moment that needs a quick answer", () => {
    // six hours into the day a quarter of 144 is 36, plus the reserve of 8
    expect(paced(43, at(6)).check(1)).toEqual({ ok: true });
    expect(paced(44, at(6)).check(1)).toEqual({ ok: false, reason: "ritmo_do_dia" });
    // the first minutes of a day still allow the reserve
    expect(paced(7, at(0, 1)).check(1)).toEqual({ ok: true });
    expect(paced(8, at(0, 1)).check(1)).toEqual({ ok: false, reason: "ritmo_do_dia" });
    // late in the day nearly all of it is allowed
    expect(paced(143, at(23, 59)).check(1)).toEqual({ ok: true });
  });

  test("the day's limit still comes first, and says so", () => {
    expect(paced(144, at(23, 59)).check(1)).toEqual({ ok: false, reason: "consultas_esgotadas" });
  });

  test("a steady one-every-ten-minutes cadence is never held back, and a five-minute one is held to the pace", () => {
    for (const everyMin of [10]) {
      let consults = 0;
      let held = 0;
      for (let t = 0; t < 24 * 60; t += everyMin) {
        const b = paced(consults, at(0) + t * 60_000);
        if (b.check(1).ok) consults++;
        else held++;
      }
      expect(held).toBe(0);
    }
    let consults = 0;
    let held = 0;
    for (let t = 0; t < 24 * 60; t += 5) {
      const b = paced(consults, at(0) + t * 60_000);
      if (b.check(1).ok) consults++;
      else held++;
    }
    // every 5 minutes asks for 288 and gets the 144 the day has, spread over the whole day instead of the first twelve hours
    expect(consults).toBeLessThanOrEqual(144);
    expect(consults).toBeGreaterThanOrEqual(140);
    expect(held).toBeGreaterThan(100);
    // and it is still consulting in the last hours of the day
    let lateConsults = 0;
    consults = 0;
    for (let t = 0; t < 24 * 60; t += 5) {
      const b = paced(consults, at(0) + t * 60_000);
      if (b.check(1).ok) {
        consults++;
        if (t >= 18 * 60) lateConsults++;
      }
    }
    expect(lateConsults).toBeGreaterThan(20);
  });

  test("without the option nothing is paced (the plain limit of before)", () => {
    expect(make(DEFAULT_LIMITS, { version: 1, day: "2026-10-14", consults: 100, committedTokens: 0, measuredTokens: 0, unmeasuredCalls: 0 }, () => at(1)).budget.check(1)).toEqual({ ok: true });
  });
});
