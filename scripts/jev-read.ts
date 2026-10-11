/**
 * Jev reads the tape: a real buy / sell / hold call on the live OKX public feed, advisory only.
 *
 *   bun run jev-read --observe                         builds and records the state, never asks a model
 *   bun run jev-read --jev                             asks real Jev (TYPESAFE_AI_API_KEY) every interval, round robin
 *   bun run jev-read --jev --insts BTC-USDT,MON-USDT --interval 20000 --max-reads 500 --serve 3100
 *
 * It never signs, sends or places anything. The reads are written to JEV_READ_STATE_PATH (data/jev-read/latest.json)
 * and appended to JEV_READ_JOURNAL_PATH (data/jev-read/reads.jsonl); the backend serves the board at GET /jev-read, and
 * `--serve <port>` serves it from this process on 127.0.0.1. Without credentials or without a fresh feed nothing is
 * decided: the read records why. Real inference needs the app key in the environment, for example
 * `bun --env-file=.env scripts/jev-read.ts --jev`.
 */

import { resolve } from "node:path";
import { JevTapeModel } from "../src/jev-read/decide";
import { OkxTapeFeed } from "../src/jev-read/feed";
import { createJevReadHandler, DEFAULT_DASHBOARD_ORIGINS, isJevReadPath, parseOrigins, readHeaders } from "../src/jev-read/http";
import { runJevRead } from "../src/jev-read/read";
import { JevReadStore } from "../src/jev-read/store";
import { correctedClock, measureServerClockOffset, type ClockSample } from "../src/system-one/clock";

const ROOT = resolve(import.meta.dir, "..");
const args = process.argv.slice(2);
const switches = new Set(["--jev", "--observe", "--help", "-h"]);
const values = new Set(["--insts", "--interval", "--max-reads", "--serve", "--warmup", "--model"]);

const seen = new Set<string>();
for (let i = 0; i < args.length; i += 1) {
  const arg = args[i]!;
  if (seen.has(arg) || (!switches.has(arg) && !values.has(arg))) throw new Error(`invalid or duplicate flag: ${arg}`);
  seen.add(arg);
  if (values.has(arg)) {
    if (!args[i + 1] || args[i + 1]!.startsWith("--")) throw new Error(`missing value for ${arg}`);
    i += 1;
  }
}
const hasFlag = (name: string) => args.includes(name);
const flagValue = (name: string): string | null => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] ?? null : null;
};

if (hasFlag("--help") || hasFlag("-h")) {
  console.log([
    "jev-read: o Jev le a fita da OKX e diz comprar, vender ou manter. Consultivo: nunca assina nem envia.",
    "Modo (obrigatorio): --jev (Jev real) ou --observe (so o estado, sem consultar modelo).",
    "Flags: --insts <BTC-USDT,...> --interval <ms entre leituras, min 5000> --max-reads <teto de consultas> --serve <porta> --warmup <ms> --model <id>.",
    "Saida: data/jev-read/latest.json e data/jev-read/reads.jsonl; o backend serve em GET /jev-read.",
  ].join("\n"));
  process.exit(0);
}

if (hasFlag("--jev") === hasFlag("--observe")) throw new Error("choose exactly one mode: --jev or --observe");
const useJev = hasFlag("--jev");

const insts = (flagValue("--insts") ?? "BTC-USDT,ETH-USDT,SOL-USDT,OKB-USDT,MON-USDT").split(",").map((s) => s.trim()).filter(Boolean);
if (insts.length === 0 || insts.length > 12 || insts.some((id) => !/^[A-Z0-9]{1,12}-[A-Z0-9]{1,12}$/.test(id))) throw new Error("--insts must be 1 to 12 spot ids like BTC-USDT");

function intFlag(name: string, fallback: number, min: number, max: number): number {
  const raw = flagValue(name);
  const value = raw === null ? fallback : Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) throw new Error(`${name} must be an integer from ${min} to ${max}`);
  return value;
}
const intervalMs = intFlag("--interval", 15_000, 5_000, 3_600_000);
const maxReads = intFlag("--max-reads", 2_000, 1, 100_000);
const warmupMs = intFlag("--warmup", 8_000, 0, 120_000);
const servePort = flagValue("--serve") === null ? null : intFlag("--serve", 3100, 1024, 65_535);

const statePath = resolve(ROOT, process.env.JEV_READ_STATE_PATH ?? "data/jev-read/latest.json");
const journalPath = resolve(ROOT, process.env.JEV_READ_JOURNAL_PATH ?? "data/jev-read/reads.jsonl");

if (useJev && !process.env.TYPESAFE_AI_API_KEY) {
  throw new Error("--jev needs TYPESAFE_AI_API_KEY in the environment, for example: bun --env-file=.env scripts/jev-read.ts --jev");
}
const modelId = flagValue("--model") ?? process.env.JEV_MODEL_ID ?? "jev-latest";
const model = useJev ? new JevTapeModel(modelId) : null;

const store = new JevReadStore({ statePath, journalPath });
const feed = new OkxTapeFeed({ instIds: insts });
const startedAtMs = Date.now();
let clockSample = null as ClockSample | null;
let modelReads = 0;
let totalReads = 0;
let running = true;

async function measureClock(): Promise<void> {
  clockSample = await measureServerClockOffset({ fetch: globalThis.fetch.bind(globalThis), now: () => Date.now() });
  console.error(clockSample === null
    ? "jev-read: desvio do relogio local nao medido"
    : `jev-read: relogio local ${clockSample.offsetMs} ms em relacao a OKX (ida e volta ${clockSample.roundTripMs} ms); leituras carimbadas no relogio da OKX`);
}

const cleanups: Array<() => void> = [];
function every(ms: number, fn: () => void | Promise<void>): void {
  const handle = setInterval(() => void Promise.resolve(fn()).catch(() => {}), ms);
  cleanups.push(() => clearInterval(handle));
}

if (servePort !== null) {
  const origins = (process.env.OPERATOR_DASHBOARD_ORIGINS ?? DEFAULT_DASHBOARD_ORIGINS.join(",")).split(",");
  const token = process.env.OPERATOR_READ_TOKEN ?? null;
  const allowed = parseOrigins(origins);
  const handler = createJevReadHandler(statePath, origins, token);
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: servePort,
    fetch(req) {
      const { pathname } = new URL(req.url);
      if (isJevReadPath(pathname)) return handler(req);
      if (pathname === "/health") {
        const headers = readHeaders(req.headers.get("origin"), allowed);
        if (headers === null) return new Response(JSON.stringify({ error: "origin not allowed" }), { status: 403, headers: { "content-type": "application/json" } });
        if (req.method === "OPTIONS") return new Response(null, { status: 204, headers });
        if (token && req.headers.get("authorization") !== `Bearer ${token}`) return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers });
        return new Response(JSON.stringify({ ok: true, mode: useJev ? "jev" : "observe", model: useJev ? modelId : null, startedAtMs, reads: totalReads, modelReads, feed: feed.status(), clockOffsetMs: clockSample?.offsetMs ?? null }), { headers });
      }
      return new Response(JSON.stringify({ error: "not found" }), { status: 404, headers: { "content-type": "application/json" } });
    },
  });
  cleanups.push(() => server.stop(true));
  console.error(`jev-read: servindo GET /jev-read em http://127.0.0.1:${servePort} para as origens ${origins.join(", ")}`);
}

function shutdown(): void {
  running = false;
  feed.stop();
  for (const cleanup of cleanups) cleanup();
  console.error("jev-read: encerrado");
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

await measureClock();
feed.start();
every(5_000, () => feed.tick());
every(600_000, measureClock);
for (const instId of insts) {
  await feed.refreshCandles(instId);
  await feed.refreshFunding(instId);
}
every(30_000, async () => { for (const instId of insts) await feed.refreshCandles(instId); });
every(120_000, async () => { for (const instId of insts) await feed.refreshFunding(instId); });
console.error(`jev-read: modo ${useJev ? `Jev real (${modelId})` : "observacao"}, ${insts.join(", ")}, uma leitura a cada ${intervalMs} ms, teto de ${maxReads} consultas`);
await Bun.sleep(warmupMs);

let cursor = 0;
while (running && (!useJev || modelReads < maxReads)) {
  const instId = insts[cursor % insts.length]!;
  cursor += 1;
  const sample = clockSample;
  const clock = sample === null ? () => Date.now() : correctedClock(sample);
  // A quiet market pushes nothing for a while without being broken: take a fresh REST snapshot before the read.
  const ages = feed.ages(instId, Date.now());
  if (ages.bookAgeMs === null || ages.bookAgeMs > 3_000) await feed.refreshBook(instId);
  if (ages.tickerAgeMs === null || ages.tickerAgeMs > 10_000) await feed.refreshTicker(instId);
  const read = await runJevRead(feed.snapshot(instId, Date.now()), { model, now: clock, clockOffsetMs: sample?.offsetMs ?? null });
  store.record(read);
  totalReads += 1;
  if (read.decision !== null) modelReads += 1;
  if (read.decision !== null) {
    const d = read.decision;
    console.log(`jev-read ${instId} ${d.action} p=${d.probabilities[d.action].toFixed(2)} ${d.model} ${d.status} ${Math.round(d.latencyMs)} ms tokens=${d.inputTokens ?? "n/d"}`);
  } else if (read.state !== null) {
    console.log(`jev-read ${instId} estado registrado (observacao) mid=${read.state.mid} spread=${read.state.spreadBps.toFixed(2)} bps`);
  } else {
    console.log(`jev-read ${instId} sem leitura: ${read.insufficient.join(", ")}`);
  }
  await Bun.sleep(read.state === null ? Math.min(intervalMs, 3_000) : intervalMs);
}
console.error(running ? `jev-read: teto de ${maxReads} consultas atingido` : "jev-read: encerrado");
shutdown();
