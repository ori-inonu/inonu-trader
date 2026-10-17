// Avalia a hipótese de capturar 0,3% líquido por operação, com cadência de 80 a 100 ms, contra os números MEDIDOS.
// Lê data/bench/baseline-audit.json (bun scripts/baseline-audit.ts) e, se existir, data/bench/decision-after.json.
// Run: bun --no-env-file scripts/edge-hypothesis.ts [--target-bps 30] [--interval-ms 90]
// Saída: data/bench/hypothesis-030.json. Não declara lucro: só diz o que os dados sustentam, o que não sustentam e o que não mostram.
import { existsSync, readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { assessHypothesis, type Assessment, type HypothesisInputs } from "../src/decision/hypothesis";
import type { Baseline } from "./baseline-audit";
import { throughputFeasibility } from "./baseline-audit";

export function inputsFrom(baseline: Baseline, decisionBench: { latencyMs?: { p95?: number } } | null, targetNetBps: number, targetIntervalMs: number): HypothesisInputs {
  const feasibility = throughputFeasibility(targetIntervalMs);
  const buys15 = baseline.opportunities.forward.compra?.["15m"];
  const maxLegPct = targetNetBps / 2 / 100;
  const shareLe = baseline.closings.absImpactShareLe;
  // Fração de cotações dentro do que cabe por perna: usa o maior limiar medido que não excede o necessário.
  const key = Object.keys(shareLe)
    .map(Number)
    .filter((t) => t <= maxLegPct + 1e-9)
    .sort((a, b) => b - a)[0];
  const rt = baseline.fills.roundtrips;
  return {
    targetNetBps,
    targetIntervalMs,
    requiredPerSecond: feasibility.requiredPerSecond,
    tradeRps: feasibility.tradeTrialRps,
    requiredPerDay: feasibility.requiredPerDay,
    basicPerDay: feasibility.basicFranchisePerDay,
    quoteP50Ms: baseline.closings.quoteNetworkMs?.p50 ?? null,
    modelP50Ms: baseline.jev.latencyMs?.p50 ?? null,
    localP95Ms: decisionBench?.latencyMs?.p95 ?? null,
    entryImpactP50Pct: baseline.closings.absImpactPct?.p50 ?? null,
    entryShareWithinTarget: key === undefined ? null : (shareLe[String(key)] ?? null),
    realized: { n: rt.matchedSells, wins: rt.wins, atLeastTarget: rt.perSell.filter((m) => m.returnPct >= targetNetBps / 100).length, returnPct: rt.returnPct },
    forwardBuys: buys15 === undefined ? null : { n: buys15.n, meanBps: buys15.meanBps, atLeastTarget: { k: targetNetBps === 30 ? buys15.ge30bps.k : 0, ci95: buys15.ge30bps.ci95 } },
  };
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i === -1 ? undefined : process.argv[i + 1];
}

if (import.meta.main) {
  const root = resolve(import.meta.dir, "..");
  const baselinePath = resolve(root, "data/bench/baseline-audit.json");
  if (!existsSync(baselinePath)) throw new Error("rode antes: bun --no-env-file scripts/baseline-audit.ts");
  const benchPath = resolve(root, "data/bench/decision-after.json");
  const target = Number(arg("--target-bps") ?? 30);
  const interval = Number(arg("--interval-ms") ?? 90);
  if (target !== 30) console.warn("aviso: o retorno futuro das compras está medido só contra 30 bps; outros alvos zeram essa contagem");
  const baseline = JSON.parse(readFileSync(baselinePath, "utf8")) as Baseline;
  const bench = existsSync(benchPath) ? JSON.parse(readFileSync(benchPath, "utf8")) : null;
  const inputs = inputsFrom(baseline, bench, target, interval);
  const assessment: Assessment = assessHypothesis(inputs);
  const out = resolve(root, "data/bench/hypothesis-030.json");
  await mkdir(dirname(out), { recursive: true });
  await writeFile(out, `${JSON.stringify({ generatedAt: new Date().toISOString(), baselineGeneratedAt: baseline.generatedAt, inputs, ...assessment }, null, 2)}\n`);
  console.log(assessment.verdict);
  for (const f of assessment.findings) console.log(`- ${f.id} [${f.status}]: ${f.evidence}`);
  console.log(`pWin exigida (custo de duas pernas ${assessment.requiredPWinBySymmetricMove[0]?.costBps} bps, alvo ${target} bps): ${assessment.requiredPWinBySymmetricMove.map((r) => `±${r.moveBps} bps -> ${r.pWin > 1 ? "impossível" : `${(r.pWin * 100).toFixed(1)}%`}`).join(" | ")}`);
}
