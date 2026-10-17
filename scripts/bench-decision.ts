// Latência de evaluate() (--label after, padrão) e do dimensionamento anterior ao pipeline (--label before, parcial), sobre oportunidades sintéticas determinísticas (mulberry32, seed fixa).
// Run: bun --no-env-file scripts/bench-decision.ts --label after
// Saída: data/bench/decision-<label>.json. Exit 1 se p95 > 80 ms.
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { percentile } from "../src/decision/metrics";
import { evaluate } from "../src/decision/pipeline";
import type { Limits, Opportunity, Portfolio } from "../src/decision/types";
import { allocate, capFor, type SizingInput } from "../src/opportunity/sizing";

// Percentil nearest-rank compartilhado com a telemetria e o auditor; reexportado para os scripts de replay.
export { percentile };
export const SEED = 20260417;
export const N = 20_000;
export const P95_LIMIT_MS = 80;
const WARMUP = 1_000;
const BASE_MS = 1_790_000_000_000;
const SYMBOLS = ["MON", "ETH", "BTC", "SOL"] as const;
const VENUES = ["kuru", "uniswap"] as const;

export const LIMITS: Limits = {
  minNetEdgeBps: 20, maxQuoteAgeMs: 3_000, maxSlippageBps: 100, maxGasUsd: 1, maxRiskScore: 0.8,
  minLiquidityMultiple: 5, maxPositionPct: 0.1, maxGrossExposurePct: 0.5, maxDayLossPct: 0.03,
  maxDrawdownPct: 0.15, maxCorrelation: 0.8, kellyFraction: 0.25,
};

export const PORTFOLIO: Portfolio = {
  equityUsd: 100_000, peakEquityUsd: 100_000, cashUsd: 100_000, dayPnlUsd: 0,
  exposureUsd: { MON: 2_000 }, correlation: (a, b) => (a === b ? 1 : 0.3),
};

/** PRNG mulberry32: mesma seed, mesma sequência, em [0,1). */
export function mulberry32(seed: number): () => number {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Gera n oportunidades válidas do tipo Opportunity. Determinístico para a mesma seed. */
export function generate(n: number, seed = SEED): Opportunity[] {
  const rnd = mulberry32(seed);
  const uni = (lo: number, hi: number) => lo + (hi - lo) * rnd();
  const out: Opportunity[] = new Array(n);
  for (let i = 0; i < n; i++) {
    const atMs = BASE_MS + i * 250;
    out[i] = {
      id: `syn-${i}`, venue: VENUES[Math.floor(rnd() * VENUES.length)]!, chain: "monad", symbol: SYMBOLS[Math.floor(rnd() * SYMBOLS.length)]!,
      side: rnd() < 0.5 ? "buy" : "sell", atMs, quoteAtMs: atMs - Math.floor(uni(0, 5_000)),
      priceUsd: uni(0.5, 2_000), upBps: uni(0, 300), downBps: uni(1, 200), pWin: rnd(),
      horizonMs: Math.floor(uni(60_000, 660_000)), liquidityUsd: uni(1_000, 2_000_000), riskScore: rnd(),
      ...(rnd() < 0.01 ? { blocked: "honeypot" } : {}),
      costs: {
        dexFeeBps: uni(5, 30), spreadBps: uni(0, 20), slippageBps: uni(0, 50), impactBps: uni(0, 20),
        mevBps: uni(0, 10), exitExtraBps: uni(0, 20), gasUsd: uni(0, 0.5), failProb: uni(0, 0.05), failCostUsd: uni(0, 1),
      },
    };
  }
  return out;
}

/** Relógio injetado: `at(ms)` fixa o instante usado por evaluate, fora da janela medida. */
export function makeClock(): { clock: { now(): number }; at(ms: number): void } {
  let t = 0;
  return { clock: { now: () => t }, at: (ms) => { t = ms; } };
}

/** Dimensionamento anterior ao pipeline (src/opportunity/sizing.ts: teto por candidato e alocação por caixa), sem I/O. Insumos sintéticos derivados da oportunidade. */
export function legacySizing(o: Opportunity): number {
  const input: SizingInput = {
    portfolioUsd: PORTFOLIO.equityUsd, cashOnChainUsd: PORTFOLIO.cashUsd, totalCashUsd: PORTFOLIO.cashUsd,
    heldUsd: PORTFOLIO.exposureUsd[o.symbol] ?? 0, liquidityUsd: o.liquidityUsd, volume24hUsd: null,
    marked: o.riskScore > 0.5, riskPct: null,
  };
  const cap = capFor(input);
  const [alloc] = allocate([{ candidateId: o.id, chainIndex: o.chain, capUsd: cap.maxUsd, size: "buy_full" }], { [o.chain]: PORTFOLIO.cashUsd }, PORTFOLIO.cashUsd, PORTFOLIO.equityUsd);
  return alloc!.usd;
}

export function parseLabel(argv: string[]): string {
  const label = argv[argv.indexOf("--label") + 1] ?? "after";
  if (!/^[a-z0-9][a-z0-9-]{0,31}$/.test(label)) throw new Error(`label inválido: ${label}`);
  return label;
}

const r3 = (x: number) => Math.round(x * 1000) / 1000;

/** Sujeito medido: `run` devolve um número (checksum) para que o trabalho não seja descartado. */
interface Subject {
  readonly path: string;
  readonly description: string;
  readonly limitations: readonly string[];
  run(o: Opportunity, clock: { now(): number }): number;
}

const BEFORE: Subject = {
  path: "src/opportunity/sizing.ts capFor + allocate",
  description: "dimensionamento anterior ao pipeline; checksum = dólares alocados",
  limitations: [
    "parcial: não mede o ciclo completo (chamada ao modelo, validateDecision, gate, conviction, controles), que faz I/O e não é isolável sem I/O",
    "insumos sintéticos: volume24h ausente, marked = riskScore > 0.5, riskPct padrão, carteira do PORTFOLIO",
    "mede custo por decisão; não é equivalente funcional de evaluate e não mede qualidade da decisão",
  ],
  run: (o) => legacySizing(o),
};

const AFTER: Subject = {
  path: "src/decision/pipeline.ts evaluate",
  description: "pipeline atual: filtro, edge, sizing e controles; checksum = edge líquido em bps",
  limitations: ["oportunidades sintéticas determinísticas (mulberry32), sem I/O", "relógio injetado fora da janela medida"],
  run: (o, clock) => evaluate(o, PORTFOLIO, LIMITS, clock).netEdgeBps,
};

async function main(): Promise<void> {
  const label = parseLabel(process.argv.slice(2));
  const subject = label === "before" ? BEFORE : AFTER;
  const opps = generate(N);
  const { clock, at } = makeClock();
  for (let i = 0; i < WARMUP; i++) { at(opps[i]!.atMs); subject.run(opps[i]!, clock); }

  const times = new Float64Array(opps.length);
  let checksum = 0;
  const wall0 = performance.now();
  for (let i = 0; i < opps.length; i++) {
    const o = opps[i]!;
    at(o.atMs);
    const t0 = performance.now();
    checksum += subject.run(o, clock);
    times[i] = performance.now() - t0;
  }
  const wallMs = performance.now() - wall0;

  const sorted = Float64Array.from(times).sort();
  const mean = times.reduce((s, x) => s + x, 0) / times.length;
  const p95 = percentile(sorted, 95);
  const report = {
    label, subject: { path: subject.path, description: subject.description, synthetic: true, limitations: subject.limitations },
    n: N, seed: SEED, warmup: WARMUP,
    latencyMs: { p50: r3(percentile(sorted, 50)), p95: r3(p95), p99: r3(percentile(sorted, 99)), mean: r3(mean), max: r3(sorted[sorted.length - 1]!) },
    throughputPerSec: Math.round(N / (wallMs / 1000)),
    p95LimitMs: P95_LIMIT_MS, pass: p95 <= P95_LIMIT_MS, checksum: r3(checksum),
    env: { bun: Bun.version, platform: process.platform, arch: process.arch },
    generatedAt: new Date().toISOString(),
  };
  const dir = resolve(import.meta.dir, "../data/bench");
  await mkdir(dir, { recursive: true });
  await Bun.write(resolve(dir, `decision-${label}.json`), JSON.stringify(report, null, 2) + "\n");
  console.log(`decision-${label}: n=${N} p50=${report.latencyMs.p50}ms p95=${report.latencyMs.p95}ms p99=${report.latencyMs.p99}ms throughput=${report.throughputPerSec}/s pass=${report.pass}`);
  process.exit(report.pass ? 0 : 1);
}

if (import.meta.main) await main();
