// Resumo dos motivos de operar ou rejeitar: lê o log de decisões (JSONL) em streaming e conta por ação, por motivo e por etapa.
// Uma decisão executada deixa duas linhas (antes e depois do envio, mesmo id): vale a última de cada id.
// Run: bun --no-env-file scripts/decision-reasons.ts [--file data/decision-reasons.jsonl]
// Somente leitura. Arquivo ausente = zero decisões.
import { createReadStream, existsSync } from "node:fs";
import { resolve } from "node:path";
import { createInterface } from "node:readline";
import { dist, round, type Dist } from "../src/decision/metrics";
import type { ReasonRecord } from "../src/decision/types";

export interface ReasonsSummary {
  total: number;
  invalid: number;
  byAction: Record<string, number>;
  /** Motivo primário de cada NAO_OPERAR, do mais frequente ao menos, com a fração das recusas. */
  rejections: { reason: string; count: number; share: number }[];
  /** Etapa em que cada recusa parou. */
  byRejectingStage: Record<string, number>;
  /** Decisões de operar: tamanho, edge líquido e o que a execução devolveu. */
  trades: { count: number; sizeUsd: Dist | null; netEdgeBps: Dist | null; fills: Record<string, number>; reconciliationErrorBps: Dist | null };
}

const bump = (m: Record<string, number>, k: string): void => void (m[k] = (m[k] ?? 0) + 1);
const sorted = (m: Record<string, number>): Record<string, number> => Object.fromEntries(Object.entries(m).sort((a, b) => b[1] - a[1]));

export async function summarize(lines: AsyncIterable<string> | Iterable<string>): Promise<ReasonsSummary> {
  const latest = new Map<string, ReasonRecord>();
  let invalid = 0;
  let anonymous = 0;
  for await (const line of lines) {
    if (line.trim() === "") continue;
    let record: ReasonRecord | undefined;
    try {
      record = JSON.parse(line) as ReasonRecord;
    } catch {
      record = undefined;
    }
    const d = record?.decision;
    if (record === undefined || d === undefined || d === null || typeof d.action !== "string" || !Array.isArray(d.reasons)) {
      invalid++;
      continue;
    }
    latest.set(typeof d.id === "string" && d.id !== "" ? d.id : `sem-id-${anonymous++}`, record);
  }

  const byAction: Record<string, number> = {};
  const reasons: Record<string, number> = {};
  const stages: Record<string, number> = {};
  const fills: Record<string, number> = {};
  const sizes: number[] = [];
  const edges: number[] = [];
  const errors: number[] = [];
  let trades = 0;
  for (const { decision: d, fill, reconciliation } of latest.values()) {
    bump(byAction, d.action);
    if (d.action === "NAO_OPERAR") {
      bump(reasons, d.reasons[0] ?? "sem_motivo");
      const stop = [...d.stages].reverse().find((s) => !s.ok);
      bump(stages, stop?.name ?? "controles");
      continue;
    }
    trades++;
    sizes.push(d.sizeUsd);
    edges.push(d.netEdgeBps);
    if (fill !== undefined) bump(fills, fill.status);
    if (reconciliation !== undefined) errors.push(reconciliation.errorBps);
  }
  const rejected = byAction.NAO_OPERAR ?? 0;
  return {
    total: latest.size,
    invalid,
    byAction: sorted(byAction),
    rejections: Object.entries(sorted(reasons)).map(([reason, count]) => ({ reason, count, share: round(count / rejected, 4) })),
    byRejectingStage: sorted(stages),
    trades: { count: trades, sizeUsd: dist(sizes, 2), netEdgeBps: dist(edges, 2), fills: sorted(fills), reconciliationErrorBps: dist(errors, 2) },
  };
}

if (import.meta.main) {
  const i = process.argv.indexOf("--file");
  const file = resolve(import.meta.dir, "..", i === -1 ? "data/decision-reasons.jsonl" : process.argv[i + 1]!);
  const lines = existsSync(file) ? createInterface({ input: createReadStream(file), crlfDelay: Infinity }) : [];
  console.log(JSON.stringify({ file, exists: existsSync(file), ...(await summarize(lines)) }, null, 2));
}
