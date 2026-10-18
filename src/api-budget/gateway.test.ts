import { afterAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BudgetDenied, createApiBudget, type BudgetRequest } from "./gateway.ts";
import { createBudgetRegistry, type BudgetEntry } from "./registry.ts";
import { nextUtcMonthMs } from "../onchainos/http.ts";

const dir = mkdtempSync(join(tmpdir(), "api-budget-gw-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const quote: BudgetEntry = { module: "okx", endpoint: "/quote", key: "OKX_API_KEY", rpd: 10, validated: true, fonte: "test" };
const request: BudgetRequest = { module: "okx", endpoint: "/quote", key: "OKX_API_KEY" };
const T0 = Date.UTC(2026, 0, 5, 12);

let seq = 0;
function setup(entries: BudgetEntry[] = [quote], ledgerPath = join(dir, `ledger-${seq++}.json`)) {
  const clock = { t: T0, sleeps: [] as number[] };
  const budget = createApiBudget({
    registry: createBudgetRegistry(entries),
    ledgerPath,
    now: () => clock.t,
    sleep: async (ms) => {
      clock.sleeps.push(ms);
      clock.t += ms;
    },
    random: () => 0.5,
  });
  return { budget, clock, ledgerPath };
}

describe("api-budget gateway", () => {
  test("cache dentro do TTL evita chamada e expirado busca de novo", async () => {
    const { budget, clock } = setup();
    let calls = 0;
    const fn = async () => ++calls;
    const cached = { ...request, cacheKey: "q", ttlMs: 1000 };
    expect(await budget.run(cached, fn)).toBe(1);
    clock.t += 500;
    expect(await budget.run(cached, fn)).toBe(1);
    clock.t += 1500;
    expect(await budget.run(cached, fn)).toBe(2);
    expect(calls).toBe(2);
  });

  test("invalidate descarta o cache da chave", async () => {
    const { budget } = setup();
    let calls = 0;
    const fn = async () => ++calls;
    const cached = { ...request, cacheKey: "q", ttlMs: 60_000 };
    await budget.run(cached, fn);
    budget.invalidate("q");
    await budget.run(cached, fn);
    expect(calls).toBe(2);
  });

  test("chamadas simultaneas com a mesma chave viram uma unica chamada", async () => {
    const { budget } = setup();
    let calls = 0;
    const fn = async () => {
      calls++;
      return "ok";
    };
    const cached = { ...request, cacheKey: "same" };
    expect(await Promise.all([budget.run(cached, fn), budget.run(cached, fn)])).toEqual(["ok", "ok"]);
    expect(calls).toBe(1);
  });

  test("run negado lanca BudgetDenied sem chamar fn", async () => {
    const { budget } = setup([{ ...quote, rpd: 1 }]);
    await budget.run(request, async () => "first");
    let called = false;
    const error = await budget.run(request, async () => {
      called = true;
    }).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(BudgetDenied);
    expect((error as BudgetDenied).reason).toBe("budget");
    expect(called).toBe(false);
  });

  test("background respeita a reserva e execution usa a capacidade inteira", async () => {
    const { budget } = setup();
    for (let i = 0; i < 8; i++) expect((await budget.acquire({ ...request, priority: "background" })).ok).toBe(true);
    expect(await budget.acquire({ ...request, priority: "background" })).toEqual({ ok: false, reason: "reserved" });
    expect((await budget.acquire({ ...request, priority: "execution" })).ok).toBe(true);
    expect((await budget.acquire({ ...request, priority: "execution" })).ok).toBe(true);
    expect(await budget.acquire({ ...request, priority: "execution" })).toEqual({ ok: false, reason: "budget" });
  });

  test("402 bloqueia sem nova chamada ate o reset mensal", async () => {
    const { budget, clock } = setup();
    await budget.reject(request, 402);
    expect(await budget.acquire(request)).toEqual({ ok: false, reason: "blocked_402" });
    clock.t = nextUtcMonthMs(T0);
    expect((await budget.acquire(request)).ok).toBe(true);
  });

  test("429 entra em cooldown com backoff de jitter e respeita Retry-After", async () => {
    const { budget, clock } = setup();
    await budget.reject(request, 429, 0);
    expect(await budget.acquire(request)).toEqual({ ok: false, reason: "cooldown_429" });
    clock.t += 500;
    expect((await budget.acquire(request)).ok).toBe(true);

    const retried = setup();
    await retried.budget.reject(request, 429, 0, 7000);
    expect(await retried.budget.acquire(request)).toEqual({ ok: false, reason: "cooldown_429" });
    retried.clock.t += 7000;
    expect((await retried.budget.acquire(request)).ok).toBe(true);
  });

  test("entradas com rps sao espacadas pelo bucket", async () => {
    const { budget, clock } = setup([{ ...quote, rps: 1, rpd: undefined }]);
    await budget.run(request, async () => 1);
    await budget.run(request, async () => 2);
    expect(clock.t - T0).toBeGreaterThanOrEqual(1000);
  });

  test("o estado do ledger vale para todas as instancias com o mesmo arquivo", async () => {
    const first = setup([{ ...quote, rpd: 1 }]);
    const second = createApiBudget({
      registry: createBudgetRegistry([{ ...quote, rpd: 1 }]),
      ledgerPath: first.ledgerPath,
      now: () => T0,
      sleep: async () => undefined,
    });
    await first.budget.run(request, async () => "first");
    expect(await second.acquire(request)).toEqual({ ok: false, reason: "budget" });
  });

  test("resultado de falha devolvido como valor não recupera o ritmo nem entra no cache", async () => {
    const { budget } = setup([{ ...quote, rpd: undefined }]);
    await budget.reject(request, 429, 0);
    expect(budget.scale(request)).toBe(0.5);
    // Passado o cooldown, 40 falhas devolvidas como valor não recuperam nenhum degrau.
    const failing = { ...request };
    const settled = setup([{ ...quote, rpd: undefined }]);
    await settled.budget.reject(failing, 429, 0);
    settled.clock.t += 60_000;
    for (let i = 0; i < 40; i++) await settled.budget.run(failing, async () => ({ ok: false }), (r) => r.ok);
    expect(settled.budget.scale(failing)).toBe(0.5);
    for (let i = 0; i < 20; i++) await settled.budget.run(failing, async () => ({ ok: true }), (r) => r.ok);
    expect(settled.budget.scale(failing)).toBeCloseTo(0.625, 10);

    let calls = 0;
    const cached = { ...request, cacheKey: "k", ttlMs: 60_000 };
    const attempt = () => settled.budget.run(cached, async () => ({ ok: ++calls > 1 }), (r) => r.ok);
    expect((await attempt()).ok).toBe(false);
    expect((await attempt()).ok).toBe(true);
    expect((await attempt()).ok).toBe(true);
    expect(calls).toBe(2);
  });

  test("429 reduz a escala do ritmo e o pool inteiro entra em cooldown", async () => {
    const entries: BudgetEntry[] = [
      { ...quote, endpoint: "/a", pool: "p", rpd: undefined },
      { ...quote, endpoint: "/b", pool: "p", rpd: undefined },
    ];
    const { budget } = setup(entries);
    const a: BudgetRequest = { ...request, endpoint: "/a" };
    const b: BudgetRequest = { ...request, endpoint: "/b" };
    expect(budget.scale(a)).toBe(1);
    await budget.reject(a, 429, 0);
    expect(budget.scale(b)).toBe(0.5);
    expect(await budget.acquire(b)).toEqual({ ok: false, reason: "cooldown_429" });
  });

  test("franquia do pool conta chamadas de endpoints diferentes e o sucesso nao conta fora do pool", async () => {
    const entries: BudgetEntry[] = [
      { ...quote, endpoint: "/a", pool: "p", rpd: undefined, franquiaMensal: 2 },
      { ...quote, endpoint: "/b", pool: "p", rpd: undefined, franquiaMensal: 2 },
      { ...quote, endpoint: "/free", rpd: undefined },
    ];
    const { budget } = setup(entries);
    await budget.run({ ...request, endpoint: "/a" }, async () => 1);
    await budget.run({ ...request, endpoint: "/b" }, async () => 1);
    await budget.run({ ...request, endpoint: "/free" }, async () => 1);
    const denied = await budget.run({ ...request, endpoint: "/a" }, async () => 1).catch((e: unknown) => e);
    expect(denied).toBeInstanceOf(BudgetDenied);
    expect((await budget.acquire({ ...request, endpoint: "/free" })).ok).toBe(true);
  });

  test("entrada nao cadastrada e erro de programacao", async () => {
    const { budget } = setup();
    await expect(budget.run({ ...request, key: "OTHER_KEY" }, async () => 1)).rejects.toThrow("não cadastrada");
  });
});
