// Reproduz a sequência REAL de ordens do ledger do agente pelo breaker de executor e mede o efeito: quantas tentativas
// teriam sido evitadas e se alguma execução bem-sucedida teria sido barrada. Somente leitura; não toca o agente.
// Run: bun --no-env-file scripts/simulate-executor-health.ts [--ledger <ledger.jsonl>] [--threshold 3] [--cooldown-min 15]
// Saída: data/bench/executor-health-sim.json
import { existsSync, readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { DEFAULT_HEALTH, createExecutorHealth, type HealthConfig } from "../src/decision/executor-health";
import { round } from "../src/decision/metrics";

export interface OrderEvent {
  readonly atMs: number;
  readonly ok: boolean;
  readonly reason: string;
}

export interface SimResult {
  /** Tentativas que o agente fez de fato (ordens com resultado final). */
  readonly attempts: number;
  /** Tentativas que o breaker teria deixado passar, incluindo as sondas. */
  readonly allowed: number;
  readonly probes: number;
  readonly suppressed: number;
  readonly avoidedShare: number | null;
  /** Execuções bem-sucedidas que o breaker teria barrado. O número tem de ser zero para o breaker ser seguro. */
  readonly suppressedSuccesses: number;
  readonly suppressedByReason: Readonly<Record<string, number>>;
  readonly firstOpenAtMs: number | null;
  readonly spanHours: number;
}

/** Ordens com resultado final, em ordem de tempo. `incerta` (transmitida) ainda não tem resultado e fica fora. */
export function terminalOrders(ledger: readonly Record<string, any>[]): OrderEvent[] {
  return ledger
    .filter((r) => r.kind === "order" && (r.stage === "falhou" || r.stage === "executada") && typeof r.atMs === "number")
    .map((r) => ({ atMs: r.atMs as number, ok: r.stage === "executada", reason: r.stage === "executada" ? "ok" : String(r.reason) }))
    .sort((a, b) => a.atMs - b.atMs);
}

export function simulate(events: readonly OrderEvent[], config: HealthConfig = DEFAULT_HEALTH): SimResult {
  const health = createExecutorHealth(config);
  let allowed = 0;
  let probes = 0;
  let suppressedSuccesses = 0;
  let firstOpenAtMs: number | null = null;
  const suppressedByReason: Record<string, number> = {};
  for (const e of events) {
    const verdict = health.allow(e.atMs);
    if (!verdict.ok) {
      suppressedByReason[e.reason] = (suppressedByReason[e.reason] ?? 0) + 1;
      if (e.ok) suppressedSuccesses++;
      continue;
    }
    allowed++;
    if (verdict.probe) probes++;
    health.record(e.atMs, e.ok ? { ok: true } : { ok: false, reason: e.reason });
    if (firstOpenAtMs === null && health.snapshot().state === "open") firstOpenAtMs = e.atMs;
  }
  const suppressed = events.length - allowed;
  return {
    attempts: events.length,
    allowed,
    probes,
    suppressed,
    avoidedShare: events.length === 0 ? null : round(suppressed / events.length, 4),
    suppressedSuccesses,
    suppressedByReason,
    firstOpenAtMs,
    spanHours: events.length < 2 ? 0 : round((events[events.length - 1]!.atMs - events[0]!.atMs) / 3_600_000, 1),
  };
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i === -1 ? undefined : process.argv[i + 1];
}

if (import.meta.main) {
  const home = process.env.LOCALAPPDATA === undefined ? undefined : join(process.env.LOCALAPPDATA, "InonuTrader", "data", "agent");
  const ledger = arg("--ledger") ?? (home === undefined ? undefined : join(home, "ledger.jsonl"));
  if (ledger === undefined || !existsSync(ledger)) throw new Error("ledger não encontrado: passe --ledger");
  const rows = readFileSync(ledger, "utf8").split("\n").filter(Boolean).flatMap((l) => {
    try {
      return [JSON.parse(l) as Record<string, any>];
    } catch {
      return [];
    }
  });
  const config: HealthConfig = { ...DEFAULT_HEALTH, threshold: Number(arg("--threshold") ?? DEFAULT_HEALTH.threshold), baseCooldownMs: Number(arg("--cooldown-min") ?? 15) * 60_000 };
  const result = simulate(terminalOrders(rows), config);
  const report = { generatedAt: new Date().toISOString(), config: { threshold: config.threshold, baseCooldownMs: config.baseCooldownMs, maxCooldownMs: config.maxCooldownMs, persistent: [...config.persistent] }, ...result };
  const out = resolve(import.meta.dir, "../data/bench/executor-health-sim.json");
  await mkdir(dirname(out), { recursive: true });
  await writeFile(out, `${JSON.stringify(report, null, 2)}\n`);
  console.log(
    `executor-health (${result.spanHours} h): tentativas reais=${result.attempts} passariam=${result.allowed} (sondas=${result.probes}) evitadas=${result.suppressed} (${((result.avoidedShare ?? 0) * 100).toFixed(1)}%) ` +
      `sucessos barrados=${result.suppressedSuccesses}`,
  );
}
