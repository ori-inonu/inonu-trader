/**
 * Portfolio risk report from positions the user states and captured public candles
 * (docs/sdd/dados-quant/SPEC.md, Q-06). Offline: it reads data/quant/<KEY>-USDT-SWAP-15m.json written by
 * scripts/quant-capture.ts and makes no request. It does not read any wallet; positions are an explicit input.
 *
 *   bun --no-env-file run scripts/quant-portfolio.ts --positions positions.json [--dir data/quant] [--horizon-bars 96] [--json]
 *   bun --no-env-file run scripts/quant-portfolio.ts --demo            hypothetical positions, labeled as such
 *
 * positions.json is a list such as [{ "key": "BTC", "valueUsd": 5000 }, { "key": "MON", "valueUsd": null }].
 * A null value means the value is not known and the position is left out and named, never counted as zero.
 * A key without a capture is kept for the concentration and left out of the risk, and named.
 */

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { scenarioLoss, type PositionInput } from "../src/quant/portfolio";
import { analyzeCapturedPortfolio, type CaptureInput } from "../src/portfolio-analytics/captured-report";

const ROOT = resolve(import.meta.dir, "..");
const args = process.argv.slice(2);
const flag = (name: string) => args.includes(name);
const value = (name: string, fallback: string) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] ?? fallback : fallback; };

const dir = resolve(ROOT, value("--dir", "data/quant"));
const asJson = flag("--json");
const demo = flag("--demo");

const DEMO_POSITIONS: PositionInput[] = [
  { key: "BTC", valueUsd: 5000 },
  { key: "ETH", valueUsd: 3000 },
  { key: "SOL", valueUsd: 1500 },
  { key: "MON", valueUsd: 500 },
];

let positions: PositionInput[];
if (demo) {
  positions = DEMO_POSITIONS;
} else {
  const file = value("--positions", "");
  if (file === "") throw new Error("pass --positions <file.json> or --demo");
  const parsed: unknown = JSON.parse(readFileSync(resolve(file), "utf8"));
  if (!Array.isArray(parsed)) throw new Error("positions must be a list");
  positions = parsed.map((item) => {
    if (typeof item !== "object" || item === null || typeof (item as { key?: unknown }).key !== "string") throw new Error("each position needs a string key");
    const v = (item as { valueUsd?: unknown }).valueUsd;
    return { key: (item as { key: string }).key, valueUsd: typeof v === "number" ? v : null };
  });
}

const captures: CaptureInput[] = [];
const seen = new Set<string>();
for (const { key } of positions) {
  if (seen.has(key)) continue;
  seen.add(key);
  const file = resolve(dir, `${key}-USDT-SWAP-15m.json`);
  if (!/^[A-Z0-9]{2,12}$/.test(key) || !existsSync(file)) continue;
  try { captures.push({ key, value: JSON.parse(readFileSync(file, "utf8")) }); }
  catch { captures.push({ key, value: null, readError: true }); }
}
const horizonBars = Number(value("--horizon-bars", "96"));
const report = analyzeCapturedPortfolio({ positions, captures, horizonBars });
const { analysis, alignment } = report;
const barMs = alignment.barMs;
const shocks = Object.fromEntries(positions.map((p) => [p.key, -0.2]));
const stress = scenarioLoss(positions, shocks);

if (asJson) {
  console.log(JSON.stringify({ label: demo ? "hypothetical positions on real captured prices" : "user supplied positions", ...report, stressAllMinus20: stress }, null, 2));
  process.exit(0);
}

const pct = (x: number | null, d = 2) => (x === null ? "n/d" : `${(x * 100).toFixed(d)}%`);
console.log(demo ? "CARTEIRA HIPOTETICA sobre precos reais capturados (nao e a carteira de ninguem)" : "Carteira informada pelo usuario");
const c = analysis.concentration;
console.log(`grade comum: ${alignment.commonBars} candles de ${barMs} ms; arquivos historicos, atualidade live nao verificada`);
for (const capture of report.captures) console.log(`captura ${capture.key}: ${capture.status}${capture.reason === null ? "" : ` (${capture.reason})`}; instante ${capture.capturedAtMs ?? "n/d"}; ${capture.usableBars} candles; qualidade ${capture.grade ?? "n/d"}; recente na captura ${capture.freshAtCapture === null ? "n/d" : capture.freshAtCapture ? "sim" : "nao"}`);
console.log(`valor conhecido: ${c.totalValueUsd === null ? "n/d" : `US$ ${c.totalValueUsd.toFixed(2)}`}${c.complete ? "" : ` (fora do calculo: ${c.excluded.map((e) => `${e.key}:${e.reason}`).join(", ")})`}`);
console.log(`concentracao: N efetivo ${c.effectiveN?.toFixed(2) ?? "n/d"}, maior fatia ${pct(c.topShare, 1)}, tres maiores ${pct(c.top3Share, 1)}, HHI ${c.hhi?.toFixed(3) ?? "n/d"}`);
if (analysis.risk.status !== "ok") {
  console.log(`risco indisponivel: ${analysis.risk.reason}`);
} else {
  const r = analysis.risk;
  console.log(`risco sobre ${r.observations} barras (${(r.observations * barMs / 86_400_000).toFixed(0)} dias), cobre ${pct(r.riskedShare, 1)} do valor${r.excluded.length ? `; fora: ${r.excluded.map((e) => `${e.key}:${e.reason}`).join(", ")}` : ""}`);
  console.log(`volatilidade diaria da carteira ${pct(r.sigmaDaily)}; razao de diversificacao ${r.diversificationRatio?.toFixed(2) ?? "n/d"}; encolhimento ${r.shrinkage.toFixed(3)}`);
  console.log(`perda em ${r.horizonBars} barras: VaR95 normal ${pct(r.normal.var95)} historico ${pct(r.historical.var95)}; ES99 normal ${pct(r.normal.es99)} historico ${pct(r.historical.es99)}; razao ES99 historico/normal ${r.tailRatioEs99?.toFixed(2) ?? "n/d"}`);
  console.log(`queda maxima no periodo: ${pct(r.maxDrawdown)}`);
  console.log("contribuicao ao risco: " + r.contributions.map((x) => `${x.key} ${pct(x.share, 1)}`).join(", "));
}
console.log(`cenario todos -20%: perda ${pct(stress.lossFraction)} (US$ ${stress.lossUsd === null ? "n/d" : stress.lossUsd.toFixed(2)})`);
