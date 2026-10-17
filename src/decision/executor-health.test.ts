import { describe, expect, test } from "bun:test";
import { DEFAULT_HEALTH, createExecutorHealth } from "./executor-health";

const MIN = 60_000;
const T0 = 1_000_000;
const gas = { ok: false, reason: "gas_station_pendente" } as const;

function failTimes(h: ReturnType<typeof createExecutorHealth>, n: number, at = T0, outcome: { ok: false; reason: string } = gas): void {
  for (let i = 0; i < n; i++) {
    expect(h.allow(at + i).ok).toBe(true);
    h.record(at + i, outcome);
  }
}

describe("executor health", () => {
  test("fecha e deixa tentar enquanto as falhas persistentes não chegam ao limite", () => {
    const h = createExecutorHealth();
    failTimes(h, DEFAULT_HEALTH.threshold - 1);
    expect(h.snapshot().state).toBe("closed");
    expect(h.allow(T0 + 10)).toEqual({ ok: true, probe: false });
  });

  test("abre no limite, recusa com o motivo e diz quando tentar de novo", () => {
    const h = createExecutorHealth();
    failTimes(h, 3);
    expect(h.snapshot().state).toBe("open");
    const denied = h.allow(T0 + 5 * MIN);
    expect(denied).toEqual({ ok: false, reason: "executor_unavailable", blockedBy: "gas_station_pendente", retryAtMs: T0 + 2 + 15 * MIN });
  });

  test("após a espera libera uma única sonda; as outras tentativas esperam o resultado dela", () => {
    const h = createExecutorHealth();
    failTimes(h, 3);
    const at = T0 + 20 * MIN;
    expect(h.allow(at)).toEqual({ ok: true, probe: true });
    expect(h.allow(at + 1).ok).toBe(false);
    expect(h.snapshot().state).toBe("half-open");
  });

  test("sonda que funciona fecha o breaker e zera tudo", () => {
    const h = createExecutorHealth();
    failTimes(h, 3);
    h.allow(T0 + 20 * MIN);
    h.record(T0 + 20 * MIN, { ok: true });
    expect(h.snapshot()).toMatchObject({ state: "closed", streak: 0, reopens: 0, reason: null });
    expect(h.allow(T0 + 20 * MIN + 1)).toEqual({ ok: true, probe: false });
  });

  test("sonda que falha reabre com o dobro da espera, até o teto", () => {
    const h = createExecutorHealth();
    failTimes(h, 3);
    let now = T0 + 20 * MIN;
    const waits: number[] = [];
    for (let i = 0; i < 6; i++) {
      expect(h.allow(now)).toEqual({ ok: true, probe: true });
      h.record(now, gas);
      const denied = h.allow(now + 1);
      if (denied.ok) throw new Error("deveria estar aberto");
      waits.push(denied.retryAtMs - now);
      now = denied.retryAtMs;
    }
    expect(waits).toEqual([30 * MIN, 60 * MIN, 120 * MIN, 240 * MIN, 240 * MIN, 240 * MIN]);
  });

  test("falha transitória nunca abre o breaker e não zera a sequência persistente", () => {
    const h = createExecutorHealth();
    failTimes(h, 2);
    h.record(T0 + 5, { ok: false, reason: "simulacao_falhou" });
    h.record(T0 + 6, { ok: false, reason: "impacto_alto" });
    expect(h.snapshot()).toMatchObject({ state: "closed", streak: 2 });
    h.record(T0 + 7, gas);
    expect(h.snapshot().state).toBe("open");

    const transient = createExecutorHealth();
    for (let i = 0; i < 50; i++) transient.record(T0 + i, { ok: false, reason: "impacto_alto" });
    expect(transient.snapshot().state).toBe("closed");
  });

  test("motivo persistente diferente reinicia a contagem", () => {
    const h = createExecutorHealth();
    failTimes(h, 2);
    h.record(T0 + 5, { ok: false, reason: "taxa_sem_saldo" });
    expect(h.snapshot()).toMatchObject({ state: "closed", streak: 1, reason: "taxa_sem_saldo" });
  });

  test("um sucesso no meio da sequência zera a contagem", () => {
    const h = createExecutorHealth();
    failTimes(h, 2);
    h.record(T0 + 5, { ok: true });
    failTimes(h, 2, T0 + 10);
    expect(h.snapshot().state).toBe("closed");
  });

  test("falha transitória na sonda libera outra sonda sem reabrir", () => {
    const h = createExecutorHealth();
    failTimes(h, 3);
    const at = T0 + 20 * MIN;
    expect(h.allow(at).ok).toBe(true);
    h.record(at, { ok: false, reason: "simulacao_falhou" });
    expect(h.snapshot()).toMatchObject({ state: "half-open", probing: false, reopens: 0 });
    expect(h.allow(at + 1)).toEqual({ ok: true, probe: true });
  });

  test("o estado salvo restaura o mesmo comportamento depois de um reinício", () => {
    const first = createExecutorHealth();
    failTimes(first, 3);
    const saved = JSON.parse(JSON.stringify(first.snapshot()));
    const second = createExecutorHealth(DEFAULT_HEALTH, saved);
    expect(second.allow(T0 + 5 * MIN).ok).toBe(false);
    expect(second.allow(T0 + 20 * MIN)).toEqual({ ok: true, probe: true });
  });
});
