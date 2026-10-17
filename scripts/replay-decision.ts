// Replay SIMULADO sobre oportunidades sintéticas (mesmo gerador do bench): fração de decisões
// COMPRAR/VENDER com edge líquido >= 30 bps, com IC 95% bootstrap (B=1000, seed fixa).
// Não declara lucro nem desempenho real.
// Run: bun --no-env-file scripts/replay-decision.ts --label after
// Saída: data/bench/replay-<label>.json
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { evaluate } from "../src/decision/pipeline";
import { LIMITS, N, PORTFOLIO, SEED, generate, makeClock, mulberry32, parseLabel, percentile } from "./bench-decision";

const EDGE_MIN_BPS = 30;
const B = 1_000;
const BOOT_SEED = 7;

/** Bootstrap percentil do IC 95% da média de flags 0/1, com reamostragem com reposição. */
export function bootstrapCi95(flags: Uint8Array, reps: number, seed: number): [number, number] {
  const rnd = mulberry32(seed);
  const n = flags.length;
  const means = new Float64Array(reps);
  for (let b = 0; b < reps; b++) {
    let s = 0;
    for (let j = 0; j < n; j++) s += flags[Math.floor(rnd() * n)]!;
    means[b] = s / n;
  }
  means.sort();
  return [percentile(means, 2.5), percentile(means, 97.5)];
}

async function main(): Promise<void> {
  const label = parseLabel(process.argv.slice(2));
  const opps = generate(N);
  const { clock, at } = makeClock();
  const flags = new Uint8Array(opps.length);
  let actionable = 0;
  for (let i = 0; i < opps.length; i++) {
    const o = opps[i]!;
    at(o.atMs);
    const d = evaluate(o, PORTFOLIO, LIMITS, clock);
    const isOrder = d.action === "COMPRAR" || d.action === "VENDER";
    if (isOrder) actionable++;
    flags[i] = isOrder && d.netEdgeBps >= EDGE_MIN_BPS ? 1 : 0;
  }
  const qualifying = flags.reduce((s, x) => s + x, 0);
  const [lo, hi] = bootstrapCi95(flags, B, BOOT_SEED);
  const report = {
    label,
    simulado: true,
    aviso: "SIMULADO sobre dados sintéticos determinísticos. Não é lucro, não é desempenho real e não autoriza operação.",
    n: N,
    seed: SEED,
    edgeMinBps: EDGE_MIN_BPS,
    actionable,
    qualifying,
    fraction: qualifying / N,
    denominador: "todas as decisões avaliadas (n)",
    ci95: { lo, hi, method: "bootstrap percentil", B, bootSeed: BOOT_SEED },
    generatedAt: new Date().toISOString(),
  };
  const dir = resolve(import.meta.dir, "../data/bench");
  await mkdir(dir, { recursive: true });
  await Bun.write(resolve(dir, `replay-${label}.json`), JSON.stringify(report, null, 2) + "\n");
  console.log(`replay-${label} (SIMULADO): n=${N} comprar/vender=${actionable} edge>=${EDGE_MIN_BPS}bps=${qualifying} fração=${report.fraction.toFixed(4)} IC95=[${lo.toFixed(4)}, ${hi.toFixed(4)}]`);
}

if (import.meta.main) await main();
