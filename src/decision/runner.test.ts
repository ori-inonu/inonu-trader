import { describe, expect, test } from "bun:test";
import { createGuard } from "./controls";
import { DEFAULT_HEALTH, createExecutorHealth } from "./executor-health";
import { createPaperPort, type PaperPortOptions } from "./paper-port";
import { createRunner, type RunnerDeps } from "./runner";
import { NOW, limits, opportunity, portfolio } from "./testing";
import { createLatencyRecorder } from "./telemetry";
import type { Fill, ReasonRecord } from "./types";

function setup(patch: { port?: Partial<PaperPortOptions>; deps?: Partial<RunnerDeps>; clockMs?: { t: number } } = {}) {
  const clock = patch.clockMs ?? { t: NOW };
  const records: ReasonRecord[] = [];
  const port = createPaperPort({ mode: "paper", priceFor: () => 2, feeBps: 15, gasUsd: 1, slippageBps: () => 10, ...patch.port });
  const health = createExecutorHealth();
  const telemetry = createLatencyRecorder();
  const runner = createRunner({
    limits,
    clock: { now: () => clock.t },
    guard: createGuard({ mode: "paper", failureThreshold: 3, cooldownMs: 60_000 }),
    health,
    port,
    portfolio: () => portfolio(),
    telemetry,
    log: (r) => void records.push(r),
    limitSlippageBps: 50,
    ...patch.deps,
  });
  return { runner, port, health, telemetry, records, clock };
}

describe("runner", () => {
  test("oportunidade boa vira ordem, fill e reconciliação, com duas linhas de log (decisão antes, resultado depois)", async () => {
    const { runner, port, records, telemetry } = setup();
    const result = await runner.step(opportunity("o-1"));
    expect(result.decision.action).toBe("COMPRAR");
    expect(result.fill?.status).toBe("filled");
    expect(port.fills()).toHaveLength(1);
    expect(records).toHaveLength(2);
    expect(records[0]!.fill).toBeUndefined();
    expect(records[1]!.fill?.status).toBe("filled");
    expect(records[1]!.reconciliation).toBeDefined();
    expect(records.every((r) => r.mode === "paper" && r.v === 1)).toBe(true);

    // Reconciliação: gas e falha esperados 1,05 USD contra 1 USD cobrado, taxa 15 bps e slippage 10 bps cobrados.
    const rec = result.reconciliation!;
    expect(rec.sizeUsd).toBe(result.decision.sizeUsd);
    expect(rec.realizedLegCostBps).toBeCloseTo(10 + (15 / 1e4) * 1e4 + (1 / rec.sizeUsd) * 1e4, 9);
    expect(rec.errorBps).toBeCloseTo(rec.realizedLegCostBps - rec.expectedLegCostBps, 12);

    const { measured, notMeasured } = telemetry.summary();
    expect(Object.keys(measured).sort()).toEqual(["decisao_local", "submissao"]);
    expect(notMeasured).toEqual(["dados", "cotacao", "assinatura", "inclusao", "finalizacao"]);
  });

  test("NAO_OPERAR não envia nada e registra o motivo", async () => {
    const { runner, port, records } = setup();
    const result = await runner.step(opportunity("o-1", { pWin: 0.2 }));
    expect(result.decision.action).toBe("NAO_OPERAR");
    expect(result.decision.reasons).toEqual(["no_edge"]);
    expect(result.fill).toBeUndefined();
    expect(port.fills()).toHaveLength(0);
    expect(records).toHaveLength(1);
    expect(records[0]!.decision.reasons).toEqual(["no_edge"]);
  });

  test("a mesma oportunidade enviada duas vezes gera uma única ordem", async () => {
    const { runner, port } = setup();
    await runner.step(opportunity("o-1"));
    const again = await runner.step(opportunity("o-1"));
    expect(again.decision.reasons).toEqual(["duplicate"]);
    expect(port.fills()).toHaveLength(1);
  });

  test("nonces são sequenciais entre ordens distintas", async () => {
    const { runner, port } = setup();
    for (const id of ["a", "b", "c"]) expect((await runner.step(opportunity(id))).fill?.status).toBe("filled");
    expect(port.fills().map((f) => f.status)).toEqual(["filled", "filled", "filled"]);
  });

  test("falha de ambiente repetida abre o breaker de executor e as próximas oportunidades nem tentam", async () => {
    let attempts = 0;
    const { runner, health } = setup({ port: { failure: () => ((attempts += 1), "gas_station_pendente") }, deps: { guard: createGuard({ mode: "paper", failureThreshold: 99, cooldownMs: 1 }) } });
    for (const id of ["a", "b", "c"]) {
      const r = await runner.step(opportunity(id));
      expect(r.fill?.reason).toBe("gas_station_pendente");
    }
    expect(health.snapshot().state).toBe("open");
    const blocked = await runner.step(opportunity("d"));
    expect(blocked.decision.reasons).toEqual(["executor_unavailable"]);
    expect(blocked.fill).toBeUndefined();
    expect(attempts).toBe(3);
  });

  test("passada a espera, uma sonda que funciona reabre o executor", async () => {
    const clock = { t: NOW };
    let broken = true;
    const { runner, health } = setup({ clockMs: clock, port: { failure: () => (broken ? "gas_station_pendente" : undefined) }, deps: { guard: createGuard({ mode: "paper", failureThreshold: 99, cooldownMs: 1 }) } });
    for (const id of ["a", "b", "c"]) await runner.step(opportunity(id));
    expect((await runner.step(opportunity("d"))).decision.reasons).toEqual(["executor_unavailable"]);

    broken = false;
    clock.t += DEFAULT_HEALTH.baseCooldownMs + 1;
    const probe = await runner.step(opportunity("e", { atMs: clock.t, quoteAtMs: clock.t - 100 }));
    expect(probe.fill?.status).toBe("filled");
    expect(health.snapshot().state).toBe("closed");
  });

  test("falhas de execução seguidas abrem o breaker de execução do guard", async () => {
    const { runner } = setup({ port: { failure: () => "simulacao_falhou" }, deps: { guard: createGuard({ mode: "paper", failureThreshold: 2, cooldownMs: 60_000 }) } });
    await runner.step(opportunity("a"));
    await runner.step(opportunity("b"));
    const third = await runner.step(opportunity("c"));
    expect(third.decision.reasons).toEqual(["breaker_open"]);
    expect(third.fill).toBeUndefined();
  });

  test("sem trilha de auditoria não há ordem: falha ao gravar antes do envio recusa", async () => {
    const { runner, port } = setup({ deps: { log: () => { throw new Error("disco cheio"); } } });
    const result = await runner.step(opportunity("o-1"));
    expect(result.decision.action).toBe("NAO_OPERAR");
    expect(result.decision.reasons).toEqual(["audit_unavailable"]);
    expect(port.fills()).toHaveLength(0);
  });

  test("falha ao gravar uma recusa não muda nada", async () => {
    const { runner } = setup({ deps: { log: () => { throw new Error("disco cheio"); } } });
    const result = await runner.step(opportunity("o-1", { pWin: 0.2 }));
    expect(result.decision.reasons).toEqual(["no_edge"]);
  });

  test("exceção da porta vira falha, devolve o nonce e a ordem seguinte não é recusada por salto", async () => {
    let boom = true;
    const real = createPaperPort({ mode: "paper", priceFor: () => 2, feeBps: 0, gasUsd: 0 });
    const flaky = { mode: real.mode, submit: async (o: Parameters<typeof real.submit>[0]): Promise<Fill> => { if (boom) throw new Error("rede"); return real.submit(o); } };
    const { runner } = setup({ deps: { port: flaky, guard: createGuard({ mode: "paper", failureThreshold: 99, cooldownMs: 1 }) } });
    const first = await runner.step(opportunity("a"));
    expect(first.fill).toMatchObject({ status: "failed", reason: "excecao_da_porta" });
    boom = false;
    expect((await runner.step(opportunity("b"))).fill?.status).toBe("filled");
  });

  test("passos simultâneos são serializados: nonces em ordem e uma porta lenta não recebe ordens intercaladas", async () => {
    const real = createPaperPort({ mode: "paper", priceFor: () => 2, feeBps: 0, gasUsd: 0 });
    const inFlight: number[] = [];
    let active = 0;
    let maxActive = 0;
    const slow = {
      mode: real.mode,
      submit: async (o: Parameters<typeof real.submit>[0]): Promise<Fill> => {
        active += 1;
        maxActive = Math.max(maxActive, active);
        inFlight.push(o.nonce);
        await new Promise((r) => setTimeout(r, 5));
        active -= 1;
        return real.submit(o);
      },
    };
    const { runner } = setup({ deps: { port: slow, guard: createGuard({ mode: "paper", failureThreshold: 99, cooldownMs: 1 }) } });
    const results = await Promise.all(["a", "b", "c", "d"].map((id) => runner.step(opportunity(id))));
    expect(results.map((r) => r.fill?.status)).toEqual(["filled", "filled", "filled", "filled"]);
    expect(inFlight).toEqual([1, 2, 3, 4]);
    expect(maxActive).toBe(1);
  });

  test("um passo que lança não trava os seguintes", async () => {
    const { runner } = setup({ deps: { portfolio: (() => { let n = 0; return () => { if (n++ === 0) throw new Error("fonte caiu"); return portfolio(); }; })() } });
    await expect(runner.step(opportunity("a"))).rejects.toThrow("fonte caiu");
    expect((await runner.step(opportunity("b"))).fill?.status).toBe("filled");
  });

  test("guard e porta em modos diferentes não montam", () => {
    expect(() => setup({ deps: { guard: createGuard({ mode: "replay", failureThreshold: 3, cooldownMs: 1 }) } })).toThrow("modos diferentes");
  });

  test("dado ruim é recusado com bad_data e não chega à porta", async () => {
    const { runner, port } = setup();
    const result = await runner.step(opportunity("o-1", { pWin: 3 }));
    expect(result.decision.reasons).toEqual(["bad_data"]);
    expect(port.fills()).toHaveLength(0);
  });
});
