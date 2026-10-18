import { dist, type Dist } from "./metrics";

/**
 * Etapas da vida de uma decisão, medidas separadamente. Decidir rápido não é operar bem: só `decisao_local` depende
 * apenas deste módulo; as demais dependem de rede, do executor e da cadeia e quem as mede é quem as executa.
 */
export const LATENCY_STAGES = ["dados", "decisao_local", "cotacao", "submissao", "assinatura", "inclusao", "finalizacao"] as const;
export type LatencyStage = (typeof LATENCY_STAGES)[number];

export interface LatencySummary {
  /** Etapas com pelo menos uma amostra. */
  readonly measured: Readonly<Partial<Record<LatencyStage, Dist>>>;
  /** Etapas sem nenhuma amostra: "não medido", nunca zero. */
  readonly notMeasured: readonly LatencyStage[];
}

export interface LatencyRecorder {
  record(stage: LatencyStage, ms: number): void;
  summary(): LatencySummary;
}

/** Guarda as últimas `capacity` amostras por etapa (memória limitada). Amostra negativa ou não finita é descartada. */
export function createLatencyRecorder(capacity = 10_000): LatencyRecorder {
  const samples = new Map<LatencyStage, number[]>();
  return {
    record(stage, ms) {
      if (!Number.isFinite(ms) || ms < 0) return;
      const list = samples.get(stage) ?? [];
      list.push(ms);
      if (list.length > capacity) list.shift();
      samples.set(stage, list);
    },
    summary() {
      const measured: Partial<Record<LatencyStage, Dist>> = {};
      const notMeasured: LatencyStage[] = [];
      for (const stage of LATENCY_STAGES) {
        const d = dist(samples.get(stage) ?? [], 4);
        if (d === null) notMeasured.push(stage);
        else measured[stage] = d;
      }
      return { measured, notMeasured };
    },
  };
}
