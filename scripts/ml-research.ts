/**
 * Research run of the learner on the exchange's own history (INT-3.9, INT-3.10, ML-2 to ML-4). Free: public OKX candles only, no
 * key, no model call, nothing is sent anywhere. It answers ONE question with the strictest test this repository has: do the
 * classical and structural CANDLE features carry any edge, net of costs, that survives a walk-forward test, the lab's overlap-aware
 * statistics and a Holm correction over every comparison?
 *
 *   bun --no-env-file run scripts/ml-research.ts [--days 60] [--inst BTC-USDT,ETH-USDT,...] [--cache <dir>] [--out <dir>]
 *                                               [--horizon 1h] [--step-min 15] [--refresh]
 *
 * What it does NOT have, and says: flow, zones and derivatives (the exchange keeps no history of them), and the real spread (an
 * assumed constant). The report is written as JSON and Markdown; a "not promoted" result is the normal, honest outcome and the
 * report is written either way. Nothing here changes the product.
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { INTERVAL_MS, INTERVALS, type Bar, type Interval } from "../src/intel/features/types";
import { buildDataset, type Dataset, type Side } from "../src/intel/ml/dataset";
import { trainArtifact } from "../src/intel/ml/artifact";
import { evaluate, GATE, walkForward, type ModelEvaluation, type ModelKind } from "../src/intel/ml/walkforward";
import { ASSUMED_SPREAD_BPS, backfill } from "../src/outcomes/backfill";
import { createOkxBars, MAX_BARS, MAX_HISTORY_BARS } from "../src/outcomes/okx-bars";
import { HORIZON_MS, type Horizon, type Label, type Snapshot } from "../src/outcomes/types";
import { COST_TABLE } from "../src/lab/outcomes";

const args = process.argv.slice(2);
const opt = (name: string): string | undefined => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const days = Number(opt("--days") ?? 60);
const instruments = (opt("--inst") ?? "BTC-USDT,ETH-USDT,SOL-USDT,XRP-USDT,DOGE-USDT,BNB-USDT").split(",").map((s) => s.trim()).filter(Boolean);
const horizon = (opt("--horizon") ?? "1h") as Horizon;
const stepMs = Number(opt("--step-min") ?? 15) * 60_000;
const cacheDir = resolve(opt("--cache") ?? join(process.env.TEMP ?? ".", "inonu-ml-cache"));
const outDir = resolve(opt("--out") ?? join(process.env.TEMP ?? ".", "inonu-ml-research"));
const refresh = args.includes("--refresh");
if (!(days >= 5 && days <= 400) || !(horizon in HORIZON_MS) || !(stepMs >= 300_000)) throw new Error("bad arguments");
mkdirSync(cacheDir, { recursive: true });
mkdirSync(outDir, { recursive: true });

const api = createOkxBars();
const now = Date.now();
const fromMs = now - days * 86_400_000;
const costOf = (inst: string): number => {
  const market = inst.endsWith("-SWAP") ? "perp" : "spot";
  return 2 * COST_TABLE.feeTakerBps[market] + 2 * COST_TABLE.slippageBpsPerSide;
};

async function fetchBars(instId: string, interval: Interval): Promise<Bar[]> {
  const file = join(cacheDir, `${instId}-${interval}-${days}d.json`);
  if (!refresh && existsSync(file)) {
    const cached = JSON.parse(readFileSync(file, "utf8")) as { at: number; bars: Bar[] };
    if (now - cached.at < 6 * 3_600_000) return cached.bars;
  }
  // a little earlier than needed so the first features have their warm-up
  const wanted = fromMs - 420 * INTERVAL_MS[interval];
  let bars = await api.bars(instId, interval, MAX_BARS);
  for (let guard = 0; guard < 4000 && bars.length > 0 && bars[0]!.ts > wanted; guard += 1) {
    const older = await api.history(instId, interval, bars[0]!.ts, MAX_HISTORY_BARS);
    if (older.length === 0) break;
    bars = [...older, ...bars];
  }
  const unique = [...new Map(bars.filter((b) => b.confirmed).map((b) => [b.ts, b])).values()].sort((a, b) => a.ts - b.ts);
  writeFileSync(file, JSON.stringify({ at: now, bars: unique }));
  return unique;
}

const t0 = Date.now();
const all: Record<string, Record<Interval, Bar[]>> = {};
for (const instId of new Set(["BTC-USDT", ...instruments])) {
  const entry = {} as Record<Interval, Bar[]>;
  for (const interval of INTERVALS) entry[interval] = await fetchBars(instId, interval);
  all[instId] = entry;
  console.error(`fetched ${instId}: ${INTERVALS.map((i) => `${i} ${entry[i].length}`).join(", ")} (${Math.round((Date.now() - t0) / 1000)} s)`);
}

const snapshots: Snapshot[] = [];
const labels: Label[] = [];
for (const instId of instruments) {
  const r = backfill({
    instId,
    bars: all[instId]!,
    btc15m: instId === "BTC-USDT" ? null : all["BTC-USDT"]!["15m"],
    fromMs,
    toMs: now - HORIZON_MS["4h"],
    stepMs,
    nowMs: now,
    feeAndSlippageRoundTripBps: costOf(instId),
  });
  snapshots.push(...r.snapshots);
  labels.push(...r.labels);
  console.error(`backfilled ${instId}: ${r.snapshots.length} snapshots, ${r.labels.length} labels`);
}

const horizonMs = HORIZON_MS[horizon];
const options = { horizonMs, stepMs, gbdt: { maxTrees: 150, minLeaf: 60 } };
const models: readonly ModelKind[] = ["logistic", "gbdt"];
const sides: readonly Side[] = ["long", "short"];

interface SideReport {
  readonly side: Side;
  readonly rows: number;
  readonly excluded: Readonly<Record<string, number>>;
  readonly baseRate: number;
  /** What entering at ANY snapshot returned on average over the horizon, net of cost (no filter at all). */
  readonly anyMomentMeanBps: number;
  readonly evaluations: ModelEvaluation[];
  readonly artifactTrained: boolean;
}

const reports: SideReport[] = [];
for (const side of sides) {
  const dataset: Dataset = buildDataset(snapshots, labels, { side, horizon });
  const runs = models.map((model) => walkForward(dataset, { ...options, model }));
  const evaluations = evaluate(runs, dataset, options, sides.length);
  const net = dataset.samples.map((s) => s.net);
  reports.push({
    side,
    rows: dataset.samples.length,
    excluded: dataset.excluded,
    baseRate: dataset.samples.length === 0 ? 0 : dataset.samples.filter((s) => s.y === 1).length / dataset.samples.length,
    anyMomentMeanBps: net.length === 0 ? 0 : Math.round((net.reduce((s, v) => s + v, 0) / net.length) * 100) / 100,
    evaluations,
    artifactTrained: evaluations.some((e) => e.promoted),
  });
  const promoted = evaluations.find((e) => e.promoted);
  if (promoted !== undefined) {
    const artifact = trainArtifact(dataset, promoted.model, options);
    if (artifact !== null) writeFileSync(join(outDir, `modelo-${side}-${horizon}-${promoted.model}.json`), JSON.stringify(artifact));
  }
  console.error(`${side}: ${dataset.samples.length} rows, ${evaluations.map((e) => `${e.model} ${e.promoted ? "PROMOVIDO" : "nao promovido"}`).join(", ")}`);
}

const stamp = new Date(now).toISOString().slice(0, 10);
const n = (v: number | null, d = 2): string => (v === null ? "n/d" : v.toFixed(d).replace(".", ","));
const lines: string[] = [];
lines.push(`# Pesquisa do aprendiz: ${stamp}`, "");
lines.push(`Origem: historico de velas publico da OKX (sem chave, sem modelo), ${days} dias, instrumentos ${instruments.join(", ")}.`);
lines.push(`Passo de ${stepMs / 60_000} min, horizonte ${horizon}. Custo de ida e volta: taxas e folga da tabela do laboratorio mais ${ASSUMED_SPREAD_BPS} bps de spread ASSUMIDO.`);
lines.push("");
lines.push("O que esta pesquisa tem: tendencia, momento, volatilidade, estrutura (SMC), custo e correlacao com o BTC, calculados so com velas fechadas.");
lines.push("O que NAO tem: fluxo, zonas e derivativos (a corretora nao guarda historico deles) e o spread real. Portanto ela responde apenas se os atributos de vela carregam vantagem liquida de custo; nao diz nada sobre o fluxo.");
lines.push("");
for (const r of reports) {
  lines.push(`## Lado ${r.side === "long" ? "compra" : "venda"}`, "");
  lines.push(`Linhas: ${r.rows}. Frequencia de terminar acima de zero depois de custos: ${n(r.baseRate * 100, 1)}%. Entrar em qualquer momento, sem filtro, rendeu em media ${n(r.anyMomentMeanBps)} bps liquidos.`);
  if (Object.keys(r.excluded).length > 0) lines.push(`Fora da tabela: ${Object.entries(r.excluded).map(([k, v]) => `${k} ${v}`).join(", ")}.`);
  lines.push("");
  lines.push("| Modelo | Fora da amostra | Operacoes | Brier | Habilidade | ECE | Media da politica (bps) | Promovido |", "|---|---|---|---|---|---|---|---|");
  for (const e of r.evaluations) {
    lines.push(`| ${e.model} | ${e.oosSamples} | ${e.trades} (${n(e.tradeShare * 100, 0)}%) | ${n(e.brier, 4)} | ${n(e.skill, 4)} | ${n(e.ece, 3)} | ${n(e.policyMeanBps)} | ${e.promoted ? "SIM" : "nao"} |`);
  }
  lines.push("");
  for (const e of r.evaluations) {
    lines.push(`### ${e.model}: comparacoes (Holm sobre todas, e vezes ${sides.length} por causa dos dois lados)`, "");
    lines.push("| Contra | n | Diferenca media (bps) | IC 95% (bps) | amostras efetivas | p unilateral | p corrigido |", "|---|---|---|---|---|---|---|");
    for (const t of e.tests) lines.push(`| ${t.versus} | ${t.n} | ${n(t.meanBps)} | ${t.ci95Bps === null ? "n/d" : `${n(t.ci95Bps[0])} a ${n(t.ci95Bps[1])}`} | ${t.effectiveSamples ?? "n/d"} | ${n(t.pOneSided, 4)} | ${n(t.pHolm, 4)} |`);
    lines.push("", e.promoted ? "Passou em todos os criterios do portao." : `Nao passou: ${e.reasons.join(", ")}.`, "");
  }
}
lines.push("## O que isto prova e o que nao prova", "");
lines.push(`- Portao: sem prova contra zero e contra cada regra simples (p corrigido abaixo de ${GATE.alpha}), pelo menos ${GATE.minTrades} operacoes, pelo menos ${GATE.minEffectiveSamples} amostras efetivas, habilidade de probabilidade positiva e ECE ate ${GATE.maxEce}.`);
lines.push("- Um resultado de nao promovido e o esperado para atributos de vela em horizonte de uma hora: o custo e grande perto do movimento. Nao e uma falha da pesquisa.");
lines.push("- Mesmo um modelo promovido aqui seria apenas evidencia descritiva num periodo, em dados sem fluxo e com spread assumido. Ele so entraria no produto como contexto, nunca como ordem, e so depois de rodar em sombra com o gravador de verdade.");
lines.push("- Nao ha afirmacao de lucro em lugar nenhum deste relatorio.");
const report = lines.join("\n");
writeFileSync(join(outDir, `pesquisa-${stamp}.md`), report);
writeFileSync(join(outDir, `pesquisa-${stamp}.json`), JSON.stringify({ stamp, days, instruments, horizon, stepMs, assumedSpreadBps: ASSUMED_SPREAD_BPS, gate: GATE, reports }, null, 1));
console.log(report);
