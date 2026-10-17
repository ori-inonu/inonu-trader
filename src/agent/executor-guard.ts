import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DEFAULT_HEALTH, createExecutorHealth, type ExecutorHealth, type HealthConfig, type HealthSnapshot, type Outcome } from "../decision/executor-health";
import type { ExecResult, Executor } from "./cycle";

/**
 * Controle de produção sobre o único ponto do agente que mexe em dinheiro. Quando o executor falha, uma tentativa depois da
 * outra, por um motivo que só uma pessoa resolve (gas_station_pendente, taxa_sem_saldo), insistir só gasta a cotação, a
 * simulação e ~2,7 s do executor por tentativa (1187 tentativas em 46 h no journal real, nenhuma com sucesso). Depois de
 * 3 falhas persistentes iguais o guarda deixa de chamar o executor e devolve "falhou" com o motivo abaixo, sem enviar nada;
 * passada a espera ele libera UMA sonda. Falha transitória (impacto alto, simulação) nunca o abre.
 *
 * Recupera rápido: sonda após 5 min, dobrando até 30 min, para que a retomada depois de o dono resolver a causa não demore.
 * Desligável por JEV_EXECUTOR_BREAKER=0. O estado é de memória: um reinício recomeça fechado e reaprende em 3 tentativas.
 */
export const PRODUCTION_HEALTH: HealthConfig = { ...DEFAULT_HEALTH, baseCooldownMs: 5 * 60_000, maxCooldownMs: 30 * 60_000 };

/** O motivo de uma recusa do guarda: nada foi enviado ao executor. */
export const UNAVAILABLE_REASON = "executor_indisponivel";

export interface GuardEvent {
  readonly atMs: number;
  readonly kind: "aberto" | "sonda" | "fechado";
  /** O motivo persistente que abriu o breaker. */
  readonly blockedBy: string | null;
}

export interface ExecutorGuardOptions {
  readonly now: () => number;
  readonly config?: HealthConfig;
  /** Falso desliga o guarda: passa direto. Lido a cada ordem. */
  readonly enabled?: () => boolean;
  /** Transições do breaker (abriu, sonda, fechou): poucas por dia, para o painel e a auditoria. */
  readonly onEvent?: (event: GuardEvent) => void;
}

export type GuardedExecutor = Executor & { health(): HealthSnapshot };

/** O resultado do executor como entrada do breaker: enviado conta como saúde; falha e incerteza carregam o motivo (liberam a sonda). */
export function outcomeOf(result: ExecResult): Outcome {
  return result.status === "executada" || result.status === "transmitida" ? { ok: true } : { ok: false, reason: result.reason };
}

export function withExecutorHealth(inner: Executor, options: ExecutorGuardOptions): GuardedExecutor {
  const health: ExecutorHealth = createExecutorHealth(options.config ?? PRODUCTION_HEALTH);
  const emit = (kind: GuardEvent["kind"], blockedBy: string | null): void => {
    try {
      options.onEvent?.({ atMs: options.now(), kind, blockedBy });
    } catch {
      /* observar nunca muda o que o executor faz */
    }
  };

  return {
    health: () => health.snapshot(),

    async execute(order, context) {
      if (options.enabled?.() === false) return inner.execute(order, context);
      const verdict = health.allow(options.now());
      if (!verdict.ok) {
        return { status: "falhou", reason: UNAVAILABLE_REASON, detail: `bloqueado por ${verdict.blockedBy}; nova tentativa a partir de ${new Date(verdict.retryAtMs).toISOString()}` };
      }
      if (verdict.probe) emit("sonda", health.snapshot().reason);

      let result: ExecResult;
      try {
        result = await inner.execute(order, context);
      } catch (error) {
        // Exceção do executor: libera a sonda como falha transitória e deixa o ciclo tratar o erro como sempre tratou.
        health.record(options.now(), { ok: false, reason: "excecao_do_executor" });
        throw error;
      }
      const before = health.snapshot().state;
      health.record(options.now(), outcomeOf(result));
      const after = health.snapshot();
      if (after.state === "open" && before !== "open") emit("aberto", after.reason);
      else if (after.state === "closed" && before !== "closed") emit("fechado", null);
      return result;
    },
  };
}

/** Uma linha JSON por transição, em modo append, para o painel. */
export function jsonlEventSink(path: string): (event: GuardEvent) => void {
  return (event) => {
    mkdirSync(dirname(path), { recursive: true });
    appendFileSync(path, `${JSON.stringify(event)}\n`);
  };
}
