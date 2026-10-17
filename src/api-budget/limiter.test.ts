import { describe, expect, test } from "bun:test";
import { backoffMs, nextUtcMonthMs } from "../onchainos/http.ts";
import type { LedgerState } from "./ledger.ts";
import { MIN_SCALE, RECOVER_AFTER, createPacer, markBlocked, markCooldown, takeSlot } from "./limiter.ts";
import { type BudgetEntry } from "./registry.ts";

const base: BudgetEntry = { module: "onchainos", endpoint: "/quote", key: "OKX_API_KEY", validated: true, fonte: "docs" };
const fresh = (): LedgerState => ({ usage: {}, blocked: {}, cooldown: {} });
const T0 = Date.UTC(2026, 0, 5, 12, 0, 0);

describe("takeSlot", () => {
  test("teto por minuto libera de novo no minuto seguinte", () => {
    const state = fresh();
    const entry = { ...base, rpm: 2 };
    expect(takeSlot(state, entry, "normal", T0)).toBeNull();
    expect(takeSlot(state, entry, "normal", T0)).toBeNull();
    expect(takeSlot(state, entry, "normal", T0)).toBe("budget");
    expect(takeSlot(state, entry, "normal", T0 + 60_000)).toBeNull();
  });

  test("teto por hora e por dia são independentes do minuto", () => {
    const hour = fresh();
    for (let i = 0; i < 3; i++) expect(takeSlot(hour, { ...base, rph: 3 }, "normal", T0 + i * 60_000)).toBeNull();
    expect(takeSlot(hour, { ...base, rph: 3 }, "normal", T0 + 3 * 60_000)).toBe("budget");
    expect(takeSlot(hour, { ...base, rph: 3 }, "normal", T0 + 3_600_000)).toBeNull();

    const day = fresh();
    expect(takeSlot(day, { ...base, rpd: 1 }, "normal", T0)).toBeNull();
    expect(takeSlot(day, { ...base, rpd: 1 }, "normal", T0 + 3_600_000)).toBe("budget");
    expect(takeSlot(day, { ...base, rpd: 1 }, "normal", T0 + 86_400_000)).toBeNull();
  });

  test("franquia mensal esgota no mes e volta no dia 1 UTC", () => {
    const state = fresh();
    const entry = { ...base, franquiaMensal: 2 };
    expect(takeSlot(state, entry, "normal", T0)).toBeNull();
    expect(takeSlot(state, entry, "normal", T0 + 86_400_000)).toBeNull();
    expect(takeSlot(state, entry, "normal", T0 + 2 * 86_400_000)).toBe("budget");
    expect(takeSlot(state, entry, "normal", nextUtcMonthMs(T0))).toBeNull();
  });

  test("background nao consome a reserva de execution", () => {
    const state = fresh();
    const entry = { ...base, rpd: 10 };
    for (let i = 0; i < 8; i++) expect(takeSlot(state, entry, "background", T0)).toBeNull();
    expect(takeSlot(state, entry, "background", T0)).toBe("reserved");
    expect(takeSlot(state, entry, "execution", T0)).toBeNull();
    expect(takeSlot(state, entry, "execution", T0)).toBeNull();
    expect(takeSlot(state, entry, "execution", T0)).toBe("budget");
  });

  test("custo por chamada conta no teto e negada nao contabiliza", () => {
    const state = fresh();
    const entry = { ...base, rpd: 5, custo: 3 };
    expect(takeSlot(state, entry, "normal", T0)).toBeNull();
    expect(takeSlot(state, entry, "normal", T0)).toBe("budget");
    expect(takeSlot(state, { ...base, rpd: 5, custo: 2 }, "normal", T0)).toBeNull();
  });

  test("402 bloqueia ate o proximo mes UTC e cooldown 429 ate o instante marcado", () => {
    const state = fresh();
    markBlocked(state, base, T0);
    expect(takeSlot(state, base, "execution", T0 + 1)).toBe("blocked_402");
    expect(takeSlot(state, base, "execution", nextUtcMonthMs(T0))).toBeNull();

    const cooled = fresh();
    markCooldown(cooled, base, T0 + 500);
    expect(takeSlot(cooled, base, "normal", T0 + 499)).toBe("cooldown_429");
    expect(takeSlot(cooled, base, "normal", T0 + 500)).toBeNull();
  });

  test("entrada expirada nao libera chamadas", () => {
    expect(takeSlot(fresh(), { ...base, expiresAt: T0 }, "normal", T0)).toBe("expired");
  });
});

describe("backoffMs", () => {
  test("jitter fica em [0, cap] e o cap cresce ate maxMs", () => {
    const bounds = { baseMs: 1000, maxMs: 3000 };
    for (const r of [0, 0.25, 0.5, 0.999]) {
      for (let attempt = 0; attempt < 5; attempt++) {
        const value = backoffMs(attempt, undefined, () => r, bounds);
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(Math.min(3000, 1000 * 2 ** attempt));
      }
    }
    expect(backoffMs(0, undefined, () => 0)).toBe(0);
    expect(backoffMs(10, undefined, () => 0.999, bounds)).toBe(2997);
  });

  test("Retry-After e respeitado como piso do atraso", () => {
    expect(backoffMs(0, 5000, () => 0)).toBe(5000);
    expect(backoffMs(0, 100, () => 1, { baseMs: 1000, maxMs: 3000 })).toBe(1000);
  });
});

describe("createPacer", () => {
  test("entrada com rps espera o intervalo do bucket entre chamadas", async () => {
    const clock = { t: T0 };
    const pacer = createPacer(() => clock.t, async (ms) => {
      clock.t += ms;
    });
    await pacer.wait({ ...base, rps: 1 });
    await pacer.wait({ ...base, rps: 1 });
    expect(clock.t - T0).toBeGreaterThanOrEqual(1000);
  });

  test("chamadas concorrentes reservam slots distintos sem corrida", async () => {
    const clock = { t: T0 };
    const pacer = createPacer(() => clock.t, async (ms) => {
      clock.t += ms;
    });
    const entry = { ...base, rps: 2 };
    await Promise.all([pacer.wait(entry), pacer.wait(entry), pacer.wait(entry)]);
    expect(clock.t - T0).toBeGreaterThanOrEqual(500 + 500);
  });

  test("429 corta o ritmo pela metade ate o piso e sucessos seguidos o recuperam", async () => {
    const clock = { t: T0 };
    const pacer = createPacer(() => clock.t, async (ms) => {
      clock.t += ms;
    });
    const entry = { ...base, rps: 1 };
    expect(pacer.scale(entry)).toBe(1);
    pacer.penalize(entry);
    expect(pacer.scale(entry)).toBe(0.5);
    for (let i = 0; i < 5; i++) pacer.penalize(entry);
    expect(pacer.scale(entry)).toBe(MIN_SCALE);

    await pacer.wait(entry);
    const before = clock.t;
    await pacer.wait(entry);
    expect(clock.t - before).toBe(4000);

    for (let i = 0; i < RECOVER_AFTER - 1; i++) pacer.reward(entry);
    expect(pacer.scale(entry)).toBe(MIN_SCALE);
    pacer.reward(entry);
    expect(pacer.scale(entry)).toBeCloseTo(MIN_SCALE * 1.25, 10);
    for (let i = 0; i < RECOVER_AFTER * 10; i++) pacer.reward(entry);
    expect(pacer.scale(entry)).toBe(1);
  });

  test("um 429 zera a sequencia de sucessos", () => {
    const pacer = createPacer(() => T0, async () => undefined);
    const entry = { ...base, rps: 1 };
    pacer.penalize(entry);
    for (let i = 0; i < RECOVER_AFTER - 1; i++) pacer.reward(entry);
    pacer.penalize(entry);
    pacer.reward(entry);
    expect(pacer.scale(entry)).toBe(0.25);
  });
});

describe("pool", () => {
  const market = (endpoint: string): BudgetEntry => ({ ...base, endpoint, pool: "market-basic", franquiaMensal: 3 });

  test("endpoints do mesmo pool dividem a franquia; outro pool nao e afetado", () => {
    const state = fresh();
    expect(takeSlot(state, market("/a"), "normal", T0)).toBeNull();
    expect(takeSlot(state, market("/b"), "normal", T0)).toBeNull();
    expect(takeSlot(state, market("/c"), "normal", T0)).toBeNull();
    expect(takeSlot(state, market("/a"), "normal", T0)).toBe("budget");
    expect(takeSlot(state, { ...market("/a"), pool: "market-premium" }, "normal", T0)).toBeNull();
  });

  test("402 e 429 de um endpoint valem para o pool inteiro", () => {
    const blocked = fresh();
    markBlocked(blocked, market("/a"), T0);
    expect(takeSlot(blocked, market("/b"), "execution", T0 + 1)).toBe("blocked_402");

    const cooled = fresh();
    markCooldown(cooled, market("/a"), T0 + 500);
    expect(takeSlot(cooled, market("/b"), "normal", T0 + 100)).toBe("cooldown_429");
  });

  test("a chave separa pools: outra chave nunca herda nem consome o medidor", () => {
    const state = fresh();
    for (let i = 0; i < 3; i++) expect(takeSlot(state, market("/a"), "normal", T0)).toBeNull();
    expect(takeSlot(state, { ...market("/a"), key: "OTHER_KEY" }, "normal", T0)).toBeNull();
  });
});
