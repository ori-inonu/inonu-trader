import { breakerRecord, checkControls, nextNonce, type Guard } from "./controls";
import { expectedLegCostBps } from "./edge";
import type { ExecutorHealth } from "./executor-health";
import { evaluate } from "./pipeline";
import type { LatencyRecorder } from "./telemetry";
import type { Decision, ExecutionPort, Fill, Limits, Opportunity, Order, Portfolio, Reason, Reconciliation, ReasonRecord } from "./types";

export interface RunnerDeps {
  readonly limits: Limits;
  readonly clock: { now(): number };
  /** Relógio de alta resolução em ms, só para medir latência. Padrão performance.now. */
  readonly hr?: () => number;
  readonly guard: Guard;
  readonly health: ExecutorHealth;
  readonly port: ExecutionPort;
  readonly portfolio: () => Portfolio;
  readonly telemetry?: LatencyRecorder;
  /** Trilha auditável, uma linha por evento. Obrigatória: se faltar ou falhar antes de um envio, o envio não acontece (falha fechada). */
  readonly log: (record: ReasonRecord) => void | Promise<void>;
  /** Pior preço aceito em relação ao preço da oportunidade, em bps. Vira o preço-limite da ordem. */
  readonly limitSlippageBps: number;
}

export interface StepResult {
  readonly decision: Decision;
  readonly fill?: Fill;
  readonly reconciliation?: Reconciliation;
}

export interface Runner {
  step(opp: Opportunity): Promise<StepResult>;
}

/** Decisão final trocada para NAO_OPERAR por uma etapa posterior ao pipeline. */
function refused(d: Decision, reason: Reason, ms: number): Decision {
  return { ...d, action: "NAO_OPERAR", sizeUsd: 0, reasons: [reason], stages: [...d.stages, { name: "controles", ok: false, reason, ms }] };
}

/**
 * Executa uma oportunidade de ponta a ponta no modo da porta (paper ou replay). A decisão é local e pura; a aquisição
 * de dados fica antes e a confirmação depois. Cada decisão, de operar ou não, deixa uma linha no log com o motivo.
 */
export function createRunner(deps: RunnerDeps): Runner {
  if (typeof deps.log !== "function") throw new Error("runner sem log de auditoria: nenhuma ordem pode sair sem trilha");
  if (deps.guard.mode !== deps.port.mode) throw new Error(`guard (${deps.guard.mode}) e porta (${deps.port.mode}) em modos diferentes`);
  const hr = deps.hr ?? (() => performance.now());
  let nonce = { last: 0 };

  const write = async (opp: Opportunity, decision: Decision, extra: Pick<ReasonRecord, "fill" | "reconciliation"> = {}): Promise<void> => {
    await deps.log({ v: 1, tsMs: deps.clock.now(), mode: deps.port.mode, venue: opp.venue, chain: opp.chain, decision, ...extra });
  };
  /** Log de uma recusa: falha de escrita não muda o resultado, porque nada foi enviado. */
  const writeRefusal = async (opp: Opportunity, decision: Decision): Promise<void> => {
    try {
      await write(opp, decision);
    } catch {
      /* nada foi enviado; a recusa vale com ou sem linha */
    }
  };

  const stepOnce = async (opp: Opportunity): Promise<StepResult> => {
    const t0 = hr();
    const now = deps.clock.now();
    const portfolio = { ...deps.portfolio(), executorAvailable: deps.health.peek(now) };
    let decision = evaluate(opp, portfolio, deps.limits, deps.clock);

    if (decision.action !== "NAO_OPERAR") {
      const control = checkControls(opp, portfolio, deps.limits, deps.guard, deps.clock);
      if (control !== "ok") decision = refused(decision, control, 0);
    }
    deps.telemetry?.record("decisao_local", hr() - t0);
    if (decision.action === "NAO_OPERAR") {
      await writeRefusal(opp, decision);
      return { decision };
    }

    // Última verificação antes do envio: pega a sonda do breaker de executor, se este envio for uma.
    const allowed = deps.health.allow(now);
    if (!allowed.ok) {
      decision = refused(decision, "executor_unavailable", 0);
      await writeRefusal(opp, decision);
      return { decision };
    }
    try {
      await write(opp, decision);
    } catch {
      decision = refused(decision, "audit_unavailable", 0);
      // Sem trilha, sem ordem. A sonda, se era uma, não foi usada: volta como falha transitória.
      deps.health.record(now, { ok: false, reason: "audit_unavailable" });
      return { decision };
    }

    const before = nonce;
    const next = nextNonce(nonce);
    nonce = next.state;
    const slip = deps.limitSlippageBps / 1e4;
    const order: Order = {
      id: opp.id,
      symbol: opp.symbol,
      side: opp.side,
      sizeUsd: decision.sizeUsd,
      limitPriceUsd: opp.side === "buy" ? opp.priceUsd * (1 + slip) : opp.priceUsd * (1 - slip),
      nonce: next.nonce,
    };
    const s0 = hr();
    let fill: Fill;
    try {
      fill = await deps.port.submit(order);
    } catch {
      // A ordem não chegou à porta: o nonce volta atrás para a seguinte não ser recusada por salto.
      nonce = before;
      fill = { id: order.id, status: "failed", fillPriceUsd: 0, feeUsd: 0, gasUsd: 0, slippageBps: 0, reason: "excecao_da_porta" };
    }
    deps.telemetry?.record("submissao", hr() - s0);

    const filled = fill.status === "filled";
    breakerRecord(deps.guard.breaker, filled, deps.clock.now());
    deps.health.record(deps.clock.now(), filled ? { ok: true } : { ok: false, reason: fill.reason ?? fill.status });

    let reconciliation: Reconciliation | undefined;
    if (filled) {
      const realized = fill.slippageBps + ((fill.feeUsd + fill.gasUsd) / decision.sizeUsd) * 1e4;
      const expected = expectedLegCostBps(opp, decision.sizeUsd);
      reconciliation = { id: opp.id, sizeUsd: decision.sizeUsd, expectedLegCostBps: expected, realizedLegCostBps: realized, errorBps: realized - expected };
    }
    try {
      await write(opp, decision, { fill, ...(reconciliation === undefined ? {} : { reconciliation }) });
    } catch {
      /* a ordem já foi decidida e enviada; o evento fica registrado na porta */
    }
    return { decision, fill, ...(reconciliation === undefined ? {} : { reconciliation }) };
  };

  // Um passo por vez: o nonce, a leitura do portfólio e o envio de uma ordem não podem intercalar com os de outra.
  let tail: Promise<unknown> = Promise.resolve();
  return {
    step(opp) {
      const run = tail.then(() => stepOnce(opp));
      tail = run.catch(() => undefined);
      return run;
    },
  };
}
