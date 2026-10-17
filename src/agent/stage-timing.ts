// Carimbo de tempo por etapa do ciclo. Módulo puro: o tempo vem do relógio
// injetado e a gravação vem da função append injetada. Não toca em disco.

export const STAGES = [
  "livro",
  "fatos",
  "ecossistema",
  "timing_candidatos",
  "timing_posicoes",
  "momentum",
  "modelo",
  "ordem",
  "fechamento",
] as const;

export type Stage = (typeof STAGES)[number];

const ETAPAS: ReadonlySet<string> = new Set(STAGES);

export interface StageSample {
  readonly etapa: Stage;
  /** Duração em ms. Null quando o relógio voltou (duração negativa) ou o valor não é finito. */
  readonly ms: number | null;
}

export interface StageSnapshot {
  /** Amostras na ordem em que as etapas terminaram. */
  readonly amostras: readonly StageSample[];
  /** Etapas com início e sem fim no momento do snapshot. Não geram amostra. */
  readonly abertas: readonly Stage[];
}

export interface StageTimer {
  /** Abre a etapa. Se ela já estiver aberta, substitui o instante anterior. Etapa desconhecida lança TypeError. */
  start(etapa: Stage): void;
  /** Fecha a etapa e grava a amostra. Devolve a duração, ou null se não havia início ou se a duração é negativa. */
  end(etapa: Stage): number | null;
  /** Grava uma duração já medida. Valor negativo ou não finito vira amostra com ms null. */
  record(etapa: Stage, ms: number): void;
  /** Leitura sem limpar o estado. */
  snapshot(): StageSnapshot;
}

export interface StageTimerDeps {
  /** Relógio injetado, em milissegundos. */
  readonly now: () => number;
}

function assertStage(etapa: string): asserts etapa is Stage {
  if (!ETAPAS.has(etapa)) throw new TypeError(`etapa desconhecida: ${etapa}`);
}

function duracaoValida(ms: number): number | null {
  return Number.isFinite(ms) && ms >= 0 ? ms : null;
}

export function createStageTimer(deps: StageTimerDeps): StageTimer {
  const inicios = new Map<Stage, number>();
  const amostras: StageSample[] = [];

  return {
    start(etapa) {
      assertStage(etapa);
      inicios.set(etapa, deps.now());
    },
    end(etapa) {
      assertStage(etapa);
      const inicio = inicios.get(etapa);
      if (inicio === undefined) return null;
      inicios.delete(etapa);
      const ms = duracaoValida(deps.now() - inicio);
      amostras.push({ etapa, ms });
      return ms;
    },
    record(etapa, ms) {
      assertStage(etapa);
      amostras.push({ etapa, ms: duracaoValida(ms) });
    },
    snapshot() {
      return {
        amostras: [...amostras],
        abertas: STAGES.filter((etapa) => inicios.has(etapa)),
      };
    },
  };
}

export interface StageSummary {
  readonly etapa: Stage;
  /** Amostras com ms finito. */
  readonly n: number;
  /** Amostras com ms null. */
  readonly nulas: number;
  readonly p50: number | null;
  readonly p95: number | null;
  readonly p99: number | null;
  readonly max: number | null;
}

/**
 * Posto mais próximo: índice ceil(p * n / 100), limitado a [1, n].
 * A conta usa inteiros (p em milésimos de ponto percentual) para evitar erro de
 * ponto flutuante na divisão. Lista vazia devolve null.
 */
export function percentile(ordenados: readonly number[], p: number): number | null {
  if (!(p > 0 && p <= 100)) throw new RangeError(`percentil fora de (0, 100]: ${p}`);
  const n = ordenados.length;
  if (n === 0) return null;
  const pMilesimos = Math.round(p * 1000);
  const posto = Math.min(n, Math.max(1, Math.ceil((pMilesimos * n) / 100000)));
  return ordenados[posto - 1] ?? null;
}

/** Um resumo por etapa presente, na ordem de STAGES. */
export function summarize(amostras: readonly StageSample[]): StageSummary[] {
  const resumos: StageSummary[] = [];
  for (const etapa of STAGES) {
    const daEtapa = amostras.filter((a) => a.etapa === etapa);
    if (daEtapa.length === 0) continue;
    const valores = daEtapa
      .flatMap((a) => (a.ms !== null && Number.isFinite(a.ms) ? [a.ms] : []))
      .sort((x, y) => x - y);
    resumos.push({
      etapa,
      n: valores.length,
      nulas: daEtapa.length - valores.length,
      p50: percentile(valores, 50),
      p95: percentile(valores, 95),
      p99: percentile(valores, 99),
      max: valores.at(-1) ?? null,
    });
  }
  return resumos;
}

export interface StageLine {
  /** Milissegundos desde a época. */
  readonly ts: number;
  readonly ciclo: string;
  readonly etapa: Stage;
  readonly ms: number | null;
  readonly consultou: boolean;
}

/** JSON com ordem de chaves ts, ciclo, etapa, ms, consultou, seguido de quebra de linha. */
export function formatStageLine(linha: StageLine): string {
  return (
    JSON.stringify({
      ts: linha.ts,
      ciclo: linha.ciclo,
      etapa: linha.etapa,
      ms: linha.ms,
      consultou: linha.consultou,
    }) + "\n"
  );
}

export interface RecordStagesInput {
  readonly timer: StageTimer;
  readonly ts: number;
  readonly ciclo: string;
  readonly consultou: boolean;
  /** Recebe uma linha por amostra. Exceções são contadas em falhas. */
  readonly append: (linha: string) => void;
}

export interface RecordStagesResult {
  readonly gravadas: number;
  readonly falhas: number;
}

/** Grava as amostras do snapshot atual, uma linha por amostra, e devolve a contagem. */
export function recordStages(input: RecordStagesInput): RecordStagesResult {
  let gravadas = 0;
  let falhas = 0;
  for (const amostra of input.timer.snapshot().amostras) {
    const linha = formatStageLine({
      ts: input.ts,
      ciclo: input.ciclo,
      etapa: amostra.etapa,
      ms: amostra.ms,
      consultou: input.consultou,
    });
    try {
      input.append(linha);
      gravadas += 1;
    } catch {
      falhas += 1;
    }
  }
  return { gravadas, falhas };
}
