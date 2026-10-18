// Paper trading ponta a ponta pelo runner, sobre as oportunidades sintéticas determinísticas do benchmark.
// Mostra a mistura de motivos de operar e de recusar, a latência por etapa e a reconciliação de custo. SIMULADO: não
// é desempenho nem lucro, o preço sintético não tem edge e nada é enviado a rede ou carteira.
// Run: bun --no-env-file scripts/paper-run.ts [--n 5000] [--log data/bench/paper-run-reasons.jsonl]
// Saída: o log de motivos (JSONL) e data/bench/paper-run.json.
import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { createGuard } from "../src/decision/controls";
import { createExecutorHealth } from "../src/decision/executor-health";
import { appendReason } from "../src/decision/log";
import { round } from "../src/decision/metrics";
import { createPaperPort } from "../src/decision/paper-port";
import { createRunner } from "../src/decision/runner";
import { createLatencyRecorder, type LatencySummary } from "../src/decision/telemetry";
import type { Opportunity } from "../src/decision/types";
import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import { LIMITS, PORTFOLIO, SEED, generate } from "./bench-decision";
import { summarize, type ReasonsSummary } from "./decision-reasons";

export interface PaperRunReport {
  simulado: true;
  aviso: string;
  n: number;
  seed: number;
  wallMs: number;
  throughputPerSec: number;
  summary: ReasonsSummary;
  latency: LatencySummary;
  paperPnl: { realizedUsd: number; feesUsd: number; gasUsd: number; openPositions: number };
}

export async function paperRun(opps: readonly Opportunity[], logPath: string): Promise<PaperRunReport> {
  await rm(logPath, { force: true });
  await mkdir(dirname(logPath), { recursive: true });
  const byId = new Map(opps.map((o) => [o.id, o]));
  let now = 0;
  const telemetry = createLatencyRecorder();
  const port = createPaperPort({
    mode: "paper",
    priceFor: (order) => byId.get(order.id)?.priceUsd,
    feeBps: 15,
    gasUsd: 0.1,
    slippageBps: (order) => byId.get(order.id)?.costs.slippageBps ?? 0,
  });
  const runner = createRunner({
    limits: LIMITS,
    clock: { now: () => now },
    guard: createGuard({ mode: "paper", failureThreshold: 5, cooldownMs: 60_000 }),
    health: createExecutorHealth(),
    port,
    portfolio: () => PORTFOLIO,
    telemetry,
    log: (record) => appendReason(record, logPath),
    limitSlippageBps: 100,
  });
  const t0 = performance.now();
  for (const opp of opps) {
    now = opp.atMs;
    await runner.step(opp);
  }
  const wallMs = performance.now() - t0;
  const summary = await summarize(createInterface({ input: createReadStream(logPath), crlfDelay: Infinity }));
  const pnl = port.pnl();
  return {
    simulado: true,
    aviso: "SIMULADO sobre dados sintéticos determinísticos. Não é lucro, não é desempenho real e não autoriza operação.",
    n: opps.length,
    seed: SEED,
    wallMs: round(wallMs, 1),
    throughputPerSec: Math.round(opps.length / (wallMs / 1000)),
    summary,
    latency: telemetry.summary(),
    paperPnl: { realizedUsd: round(pnl.realizedUsd, 2), feesUsd: round(pnl.feesUsd, 2), gasUsd: round(pnl.gasUsd, 2), openPositions: Object.keys(pnl.open).length },
  };
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i === -1 ? undefined : process.argv[i + 1];
}

if (import.meta.main) {
  const n = Number(arg("--n") ?? 5000);
  const logPath = resolve(import.meta.dir, "..", arg("--log") ?? "data/bench/paper-run-reasons.jsonl");
  const report = await paperRun(generate(n), logPath);
  const out = resolve(import.meta.dir, "../data/bench/paper-run.json");
  await writeFile(out, `${JSON.stringify(report, null, 2)}\n`);
  const s = report.summary;
  console.log(`paper-run (SIMULADO) n=${report.n} ${report.throughputPerSec}/s | ${JSON.stringify(s.byAction)} | top recusas: ${s.rejections.slice(0, 4).map((r) => `${r.reason}=${r.count}`).join(", ")}`);
  console.log(`decisão local p95=${report.latency.measured.decisao_local?.p95} ms | envio simulado p95=${report.latency.measured.submissao?.p95} ms | não medidas: ${report.latency.notMeasured.join(", ")}`);
}
