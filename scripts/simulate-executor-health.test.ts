import { describe, expect, test } from "bun:test";
import { simulate, terminalOrders, type OrderEvent } from "./simulate-executor-health";

const MIN = 60_000;
const T0 = 1_000_000;
const fail = (min: number, reason = "gas_station_pendente"): OrderEvent => ({ atMs: T0 + min * MIN, ok: false, reason });
const ok = (min: number): OrderEvent => ({ atMs: T0 + min * MIN, ok: true, reason: "ok" });

describe("terminalOrders", () => {
  test("só ordens com resultado final, em ordem de tempo", () => {
    const rows = [
      { kind: "order", stage: "executada", atMs: 30, reason: "recibo_sucesso" },
      { kind: "order", stage: "preparada", atMs: 10 },
      { kind: "order", stage: "falhou", atMs: 20, reason: "simulacao_falhou" },
      { kind: "order", stage: "incerta", atMs: 25, reason: "transmitida" },
      { kind: "cycle", atMs: 5 },
    ];
    expect(terminalOrders(rows)).toEqual([
      { atMs: 20, ok: false, reason: "simulacao_falhou" },
      { atMs: 30, ok: true, reason: "ok" },
    ]);
  });
});

describe("simulate", () => {
  test("falhas de ambiente repetidas: o breaker deixa passar o limite e depois só as sondas", () => {
    // Uma falha por minuto durante 10 horas.
    const events = Array.from({ length: 600 }, (_, i) => fail(i));
    const r = simulate(events);
    expect(r.attempts).toBe(600);
    expect(r.allowed).toBe(3 + r.probes);
    expect(r.suppressed).toBe(600 - r.allowed);
    expect(r.suppressedSuccesses).toBe(0);
    expect(r.avoidedShare).toBeGreaterThan(0.95);
    expect(r.suppressedByReason).toEqual({ gas_station_pendente: r.suppressed });
    expect(r.firstOpenAtMs).toBe(T0 + 2 * MIN);
  });

  test("execuções bem-sucedidas antes do bloqueio e falhas transitórias nunca são barradas", () => {
    const events = [ok(0), ok(1), fail(2, "simulacao_falhou"), fail(3, "impacto_alto"), ok(4), ...Array.from({ length: 30 }, (_, i) => fail(5 + i, "impacto_alto"))];
    const r = simulate(events);
    expect(r.suppressed).toBe(0);
    expect(r.suppressedSuccesses).toBe(0);
    expect(r.firstOpenAtMs).toBeNull();
  });

  test("um sucesso durante o bloqueio seria barrado e o simulador acusa", () => {
    // Abre em 2; um sucesso real em 5 cai dentro da espera de 15 minutos.
    const r = simulate([fail(0), fail(1), fail(2), ok(5)]);
    expect(r.suppressedSuccesses).toBe(1);
  });

  test("sem eventos não há divisão por zero", () => {
    expect(simulate([])).toMatchObject({ attempts: 0, allowed: 0, avoidedShare: null, spanHours: 0 });
  });
});
