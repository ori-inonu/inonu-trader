import { describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ExecResult, Executor } from "./cycle";
import { PRODUCTION_HEALTH, UNAVAILABLE_REASON, jsonlEventSink, outcomeOf, withExecutorHealth, type GuardEvent } from "./executor-guard";

type Call = Parameters<Executor["execute"]>;
const order = {} as Call[0];
const context = { cycleId: "c", orderKey: "k", signal: new AbortController().signal } as Call[1];
const MIN = 60_000;

function setup(script: Array<ExecResult | Error>, options: { enabled?: () => boolean } = {}) {
  const clock = { t: 1_000_000 };
  const events: GuardEvent[] = [];
  let calls = 0;
  const inner: Executor = {
    async execute() {
      const next = script[Math.min(calls, script.length - 1)]!;
      calls += 1;
      if (next instanceof Error) throw next;
      return next;
    },
  };
  const guard = withExecutorHealth(inner, { now: () => clock.t, onEvent: (e) => events.push(e), ...options });
  return { guard, clock, events, calls: () => calls };
}

const gas: ExecResult = { status: "falhou", reason: "gas_station_pendente" };
const done: ExecResult = { status: "executada", ref: "r" };

describe("withExecutorHealth", () => {
  test("passa o resultado do executor sem mudar nada enquanto está saudável", async () => {
    const { guard, calls, events } = setup([done]);
    expect(await guard.execute(order, context)).toBe(done);
    expect(calls()).toBe(1);
    expect(events).toEqual([]);
  });

  test("depois de 3 falhas persistentes iguais deixa de chamar o executor e recusa com o motivo, sem enviar nada", async () => {
    const { guard, calls, events } = setup([gas]);
    for (let i = 0; i < 3; i++) expect(await guard.execute(order, context)).toEqual(gas);
    expect(events.map((e) => e.kind)).toEqual(["aberto"]);
    expect(events[0]).toMatchObject({ blockedBy: "gas_station_pendente" });

    const refused = await guard.execute(order, context);
    expect(refused).toMatchObject({ status: "falhou", reason: UNAVAILABLE_REASON });
    expect((refused as { detail?: string }).detail).toContain("gas_station_pendente");
    expect(calls()).toBe(3);
    for (let i = 0; i < 20; i++) await guard.execute(order, context);
    expect(calls()).toBe(3);
  });

  test("falha transitória nunca abre o guarda", async () => {
    const { guard, calls } = setup([{ status: "falhou", reason: "impacto_alto" }]);
    for (let i = 0; i < 30; i++) await guard.execute(order, context);
    expect(calls()).toBe(30);
    expect(guard.health().state).toBe("closed");
  });

  test("passada a espera de produção uma sonda chega ao executor e, se funciona, o guarda fecha", async () => {
    const { guard, clock, events, calls } = setup([gas, gas, gas, done]);
    for (let i = 0; i < 3; i++) await guard.execute(order, context);
    clock.t += PRODUCTION_HEALTH.baseCooldownMs - 1;
    expect(await guard.execute(order, context)).toMatchObject({ reason: UNAVAILABLE_REASON });
    clock.t += 2;
    expect(await guard.execute(order, context)).toBe(done);
    expect(calls()).toBe(4);
    expect(guard.health().state).toBe("closed");
    expect(events.map((e) => e.kind)).toEqual(["aberto", "sonda", "fechado"]);
    // Fechado de novo, as ordens seguintes vão direto ao executor.
    expect(await guard.execute(order, context)).toBe(done);
  });

  test("sonda que falha reabre com o dobro da espera, no teto de 30 minutos", async () => {
    const { guard, clock, calls } = setup([gas]);
    for (let i = 0; i < 3; i++) await guard.execute(order, context);
    expect(calls()).toBe(3);
    for (const [i, waitMin] of [5, 10, 20, 30, 30].entries()) {
      const openedAt = guard.health().openedAtMs;
      clock.t = openedAt + waitMin * MIN - 1;
      expect(await guard.execute(order, context)).toMatchObject({ reason: UNAVAILABLE_REASON });
      expect(calls()).toBe(3 + i);
      clock.t = openedAt + waitMin * MIN;
      expect(await guard.execute(order, context)).toEqual(gas);
      expect(calls()).toBe(3 + i + 1);
      expect(guard.health().state).toBe("open");
    }
  });

  test("exceção do executor sobe como sempre e libera a sonda", async () => {
    const { guard, clock } = setup([gas, gas, gas, new Error("rede caiu"), done]);
    for (let i = 0; i < 3; i++) await guard.execute(order, context);
    clock.t += PRODUCTION_HEALTH.baseCooldownMs + 1;
    await expect(guard.execute(order, context)).rejects.toThrow("rede caiu");
    expect(guard.health().probing).toBe(false);
    // A sonda foi liberada: a seguinte já pode tentar.
    expect(await guard.execute(order, context)).toBe(done);
  });

  test("resultado incerto na sonda libera a sonda em vez de travar o guarda para sempre", async () => {
    const { guard, clock } = setup([gas, gas, gas, { status: "incerta", reason: "recusa_sem_prova" }, done]);
    for (let i = 0; i < 3; i++) await guard.execute(order, context);
    clock.t += PRODUCTION_HEALTH.baseCooldownMs + 1;
    await guard.execute(order, context);
    expect(guard.health().probing).toBe(false);
    expect(await guard.execute(order, context)).toBe(done);
  });

  test("com JEV_EXECUTOR_BREAKER desligado o guarda passa tudo direto", async () => {
    const { guard, calls } = setup([gas], { enabled: () => false });
    for (let i = 0; i < 10; i++) expect(await guard.execute(order, context)).toEqual(gas);
    expect(calls()).toBe(10);
    expect(guard.health().state).toBe("closed");
  });

  test("transmitida conta como saúde e falhar no sink de eventos não muda o resultado", async () => {
    expect(outcomeOf({ status: "transmitida", ref: "h" })).toEqual({ ok: true });
    expect(outcomeOf({ status: "incerta", reason: "x" })).toEqual({ ok: false, reason: "x" });
    const inner: Executor = { execute: async () => gas };
    const guard = withExecutorHealth(inner, { now: () => 1, onEvent: () => { throw new Error("painel caiu"); } });
    for (let i = 0; i < 3; i++) expect(await guard.execute(order, context)).toEqual(gas);
    expect(guard.health().state).toBe("open");
  });
});

describe("jsonlEventSink", () => {
  test("uma linha por evento, em append", () => {
    const dir = mkdtempSync(join(tmpdir(), "executor-guard-"));
    try {
      const sink = jsonlEventSink(join(dir, "sub", "executor-health.jsonl"));
      sink({ atMs: 1, kind: "aberto", blockedBy: "gas_station_pendente" });
      sink({ atMs: 2, kind: "fechado", blockedBy: null });
      const lines = readFileSync(join(dir, "sub", "executor-health.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
      expect(lines).toEqual([
        { atMs: 1, kind: "aberto", blockedBy: "gas_station_pendente" },
        { atMs: 2, kind: "fechado", blockedBy: null },
      ]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
