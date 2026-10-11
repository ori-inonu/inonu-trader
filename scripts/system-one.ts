/**
 * System One: one leverage decision cycle of Jev.
 *
 *   bun run system-one                       offline synthetic demo, mock model, phase 0
 *   bun run system-one --public              reads MON-USDT-SWAP from the keyless OKX public v5 API
 *   bun run system-one --jev                 asks real Jev (TYPESAFE_AI_API_KEY)
 *   bun run system-one --phase fase-2 --kelly 12 --capital 500 --inst MON-USDT-SWAP --bar 15m --candles 96
 *   bun run system-one --loop                repeats every SYSTEM_ONE_INTERVAL_MS (default 60000)
 *
 * It never signs or sends. The cycle is written to SYSTEM_ONE_STATE_PATH (data/system-one/latest.json)
 * and appended to SYSTEM_ONE_JOURNAL_PATH (data/system-one/cycles.jsonl); the backend serves the
 * latest cycle at GET /system-one for the dashboard. The wallet of a --public run is a configured
 * capital (SYSTEM_ONE_CAPITAL_USD or --capital), stated as such in the output; it is not a balance.
 */

import { appendFileSync, mkdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { dirname, resolve } from "node:path";
import { PHASE_IDS, type PhaseId } from "../src/policy/envelope";
import { createPublicOkxHttp } from "../src/onchainos/public-okx";
import { correctedClock, measureServerClockOffset } from "../src/system-one/clock";
import { runSystemOneCycle } from "../src/system-one/cycle";
import { JevSystemOneModel, MockSystemOneModel, type SystemOneModel } from "../src/system-one/decide";
import { BAR_MS, configuredWallet, readPublicMarket, syntheticReadings } from "../src/system-one/readings";

const ROOT = resolve(import.meta.dir, "..");
const args = process.argv.slice(2);

function hasFlag(name: string): boolean {
  return args.includes(name);
}

function flagValue(name: string): string | null {
  const index = args.indexOf(name);
  return index >= 0 && index + 1 < args.length ? args[index + 1]! : null;
}

function numberFlag(name: string, fallback: number): number {
  const raw = flagValue(name);
  const value = raw === null ? fallback : Number(raw);
  if (!Number.isFinite(value) || value <= 0) throw new Error(`${name} must be a positive number`);
  return value;
}

const switches = new Set(["--public", "--jev", "--loop", "--help", "-h"]);
const values = new Set(["--phase", "--kelly", "--capital", "--inst", "--bar", "--candles", "--horizon"]);
const seen = new Set<string>();
for (let i = 0; i < args.length; i += 1) {
  const arg = args[i]!;
  if (seen.has(arg) || (!switches.has(arg) && !values.has(arg))) throw new Error("invalid or duplicate flag");
  seen.add(arg);
  if (values.has(arg)) {
    if (!args[i + 1] || args[i + 1]!.startsWith("--")) throw new Error("missing flag value");
    i += 1;
  }
}

if (hasFlag("--help") || hasFlag("-h")) {
  console.log([
    "System One: um ciclo de decisao de alavancagem do Jev. Nunca assina nem envia.",
    "Flags: --public (API publica OKX v5, sem credenciais), --jev (Jev real), --loop, --phase fase-0|fase-1|fase-2,",
    "       --kelly <limite inferior de Kelly>, --capital <USD>, --inst <instId>, --bar 1m|5m|15m|1H|4H|1D, --candles <n>, --horizon <dias>.",
    "Saida: SYSTEM_ONE_STATE_PATH (data/system-one/latest.json) e SYSTEM_ONE_JOURNAL_PATH (data/system-one/cycles.jsonl).",
  ].join("\n"));
  process.exit(0);
}

const phaseRaw = flagValue("--phase") ?? process.env.SYSTEM_ONE_PHASE ?? "fase-0";
if (!(PHASE_IDS as readonly string[]).includes(phaseRaw)) throw new Error(`--phase must be one of ${PHASE_IDS.join(", ")}`);
const phase = phaseRaw as PhaseId;
const capitalUsd = numberFlag("--capital", Number(process.env.SYSTEM_ONE_CAPITAL_USD ?? "100"));
const kellyRaw = flagValue("--kelly");
const kellyLowerBound = kellyRaw === null ? null : Number(kellyRaw);
if (kellyLowerBound !== null && !(Number.isFinite(kellyLowerBound) && kellyLowerBound > 0)) throw new Error("--kelly must be a positive number");
const horizonDays = numberFlag("--horizon", 7);
const instId = flagValue("--inst") ?? process.env.SYSTEM_ONE_INST_ID ?? "MON-USDT-SWAP";
const bar = (flagValue("--bar") ?? "15m") as keyof typeof BAR_MS;
if (!Object.hasOwn(BAR_MS, bar)) throw new Error(`--bar must be one of ${Object.keys(BAR_MS).join(", ")}`);
const candles = numberFlag("--candles", 96);
if (!Number.isInteger(candles) || candles < 2 || candles > 300) throw new Error("--candles must be an integer from 2 to 300");
const usePublic = hasFlag("--public");
const useJev = hasFlag("--jev");
const statePath = resolve(ROOT, process.env.SYSTEM_ONE_STATE_PATH ?? "data/system-one/latest.json");
const journalPath = resolve(ROOT, process.env.SYSTEM_ONE_JOURNAL_PATH ?? "data/system-one/cycles.jsonl");
const intervalMs = Number(process.env.SYSTEM_ONE_INTERVAL_MS ?? "60000");
if (!Number.isSafeInteger(intervalMs) || intervalMs < 5_000 || intervalMs > 86_400_000) throw new Error("SYSTEM_ONE_INTERVAL_MS must be an integer from 5000 to 86400000");

const model: SystemOneModel = useJev ? new JevSystemOneModel(process.env.SYSTEM_ONE_MODEL ?? "jev-latest") : new MockSystemOneModel();
if (!useJev) console.error("system-one: modelo MOCK (sem --jev): a escolha e deterministica e nao e uma decisao do Jev.");

const publicHttp = usePublic
  ? createPublicOkxHttp({ fetch: globalThis.fetch.bind(globalThis), now: () => Date.now(), sleep: (ms) => new Promise((done) => setTimeout(done, ms)), allowNetwork: true })
  : null;

/**
 * OKX stamps every reading with its own clock. A local clock that is behind makes those stamps look like the future and
 * the freshness gate would reject all of them, so a public run evaluates freshness on the exchange-corrected clock
 * (src/system-one/clock.ts). If the offset cannot be measured the local clock is kept, which fails closed as before.
 */
async function cycleClock(): Promise<() => number> {
  if (!usePublic) return () => Date.now();
  const sample = await measureServerClockOffset({ fetch: globalThis.fetch.bind(globalThis), now: () => Date.now() });
  if (sample === null) {
    console.error("system-one: desvio do relogio local nao medido; frescor avaliado no relogio local");
    return () => Date.now();
  }
  console.error(`system-one: relogio local ${sample.offsetMs} ms em relacao a OKX (ida e volta ${sample.roundTripMs} ms); frescor avaliado no relogio corrigido`);
  return correctedClock(sample);
}

async function once(): Promise<void> {
  const clock = await cycleClock();
  const nowMs = clock();
  const readings = publicHttp
    ? { market: await readPublicMarket(publicHttp, { instId, bar, candles, nowMs, now: clock }), wallet: configuredWallet(capitalUsd, clock()) }
    : syntheticReadings({ nowMs, capitalUsd, instId, candles });
  const cycle = await runSystemOneCycle({ ...readings, phase, horizonDays, kellyLowerBound }, { model, now: clock });
  mkdirSync(dirname(statePath), { recursive: true });
  mkdirSync(dirname(journalPath), { recursive: true });
  const temporary = `${statePath}.${randomUUID()}.tmp`;
  try {
    writeFileSync(temporary, JSON.stringify(cycle, null, 2), { flag: "wx" });
    renameSync(temporary, statePath);
  } finally { rmSync(temporary, { force: true }); }
  appendFileSync(journalPath, `${JSON.stringify(cycle)}\n`);
  const market = cycle.brief.market;
  const summary = [
    `system-one ${cycle.cycleId} ${phase} ${market.instId} fonte=${market.source}`,
    `carteira=${cycle.brief.wallet.source} ${cycle.brief.wallet.source === "configured" ? "capital configurado, nao saldo" : "inventario sintetico"}`,
    `mark=${market.markPrice ?? "n/d"} funding=${market.fundingRate ?? "n/d"} sigma_dia=${market.realizedSigmaDaily === null ? "n/d" : (market.realizedSigmaDaily * 100).toFixed(2) + "%"} velas=${market.candlesUsed}`,
    `teto=${cycle.brief.limits.leverageCeiling}x cap=${cycle.brief.limits.leverageCap ?? "indefinido"} elegiveis=${cycle.brief.eligibleIds.length}/${cycle.brief.candidates.length}`,
    `decisao=${cycle.decision ? `${cycle.decision.choice} (${cycle.decision.model}, ${Math.round(cycle.decision.latencyMs)} ms, ${cycle.decision.status})` : "Jev nao consultado"} execucao=${cycle.execution.status}: ${cycle.execution.reasons.join(", ")}`,
  ];
  console.log(summary.join("\n"));
  if (cycle.warnings.length) console.error(`avisos: ${cycle.warnings.join("; ")}`);
}

await once();
if (hasFlag("--loop")) {
  console.error(`system-one: repetindo a cada ${intervalMs} ms`);
  while (true) {
    await Bun.sleep(intervalMs);
    try { await once(); } catch { console.error("system-one: ciclo falhou"); }
  }
}
