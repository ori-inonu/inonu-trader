/**
 * Captures public OKX v5 candle history for the quant calibration (docs/sdd/dados-quant/SPEC.md, Q-09).
 *
 *   bun --no-env-file run scripts/quant-capture.ts --inst BTC-USDT-SWAP --bar 15m --days 90            plan only, sends nothing
 *   bun --no-env-file run scripts/quant-capture.ts --inst BTC-USDT-SWAP --bar 15m --days 90 --allow-network
 *
 * Read only and keyless: it uses the repository's public client (src/onchainos/public-okx.ts), which restricts the
 * host and path, rate limits requests and never sends credentials. Output goes to data/quant/ (git ignored) as one
 * JSON file per instrument with the candles, the capture time and a sha256 of the canonical candle list.
 */

import { createHash } from "node:crypto";
import { mkdirSync, renameSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { createPublicOkxClient, createPublicOkxHttp, toNumber, type PublicCandleRow } from "../src/onchainos/public-okx";
import type { Candle } from "../src/quant/types";

const ROOT = resolve(import.meta.dir, "..");
const BAR_MS: Readonly<Record<string, number>> = Object.freeze({ "1m": 60_000, "5m": 300_000, "15m": 900_000, "1H": 3_600_000, "4H": 14_400_000, "1D": 86_400_000 });
const PAGE = 100;

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const instId = arg("--inst") ?? "BTC-USDT-SWAP";
const bar = arg("--bar") ?? "15m";
const days = Number(arg("--days") ?? "90");
const outDir = resolve(ROOT, arg("--out") ?? "data/quant");
const allowNetwork = process.argv.includes("--allow-network");

const barMs = Object.hasOwn(BAR_MS, bar) ? BAR_MS[bar]! : null;
if (barMs === null) throw new Error("bar must be one of 1m 5m 15m 1H 4H 1D");
if (!/^[A-Z0-9]{2,12}-[A-Z0-9]{2,12}-SWAP$/.test(instId)) throw new Error("inst must look like BTC-USDT-SWAP");
if (!Number.isFinite(days) || days < 1 || days > 400) throw new Error("days must be from 1 to 400");

const pages = Math.ceil((days * 86_400_000) / barMs / PAGE) + 2;
const outFile = resolve(outDir, `${instId}-${bar}.json`);
console.error(`quant-capture: ${instId} ${bar}, ${days} days, about ${pages} requests of ${PAGE} bars each, output ${outFile}`);
if (!allowNetwork) {
  console.error("quant-capture: plan only. Nothing was sent. Add --allow-network to read the public candles.");
  process.exit(0);
}

const http = createPublicOkxHttp({
  fetch: globalThis.fetch.bind(globalThis),
  now: () => Date.now(),
  sleep: (ms) => new Promise((done) => setTimeout(done, ms)),
  allowNetwork: true,
});
const client = createPublicOkxClient(http);

const rows = new Map<number, PublicCandleRow>();
let cursor: number | null = null;
const target = Date.now() - days * 86_400_000;
let requests = 0;
for (; requests < pages; requests += 1) {
  const read = await client.historyCandles(instId, { bar: bar as never, limit: PAGE, ...(cursor === null ? {} : { after: cursor }) });
  if (read.value.length === 0) break;
  let oldest = Infinity;
  for (const row of read.value) {
    rows.set(row.startMs, row);
    if (row.startMs < oldest) oldest = row.startMs;
  }
  if (oldest >= (cursor ?? Infinity)) break;
  cursor = oldest;
  if (oldest <= target) break;
}

const candles: Candle[] = [...rows.values()]
  .sort((a, b) => a.startMs - b.startMs)
  .filter((row) => row.startMs >= target)
  .flatMap((row) => {
    const open = toNumber(row.open), high = toNumber(row.high), low = toNumber(row.low), close = toNumber(row.close), volume = toNumber(row.vol);
    if (open === null || high === null || low === null || close === null) return [];
    return [{ startMs: row.startMs, open, high, low, close, volume, confirmed: row.confirmed }];
  });

const canonical = JSON.stringify(candles.map((c) => [c.startMs, c.open, c.high, c.low, c.close, c.volume, c.confirmed]));
const sha256 = createHash("sha256").update(canonical).digest("hex");
const payload = { schema: "quant_candles_v1", source: "okx_public_v5_history_candles", instId, bar, barMs, capturedAtMs: Date.now(), requests, count: candles.length, sha256, candles };

mkdirSync(dirname(outFile), { recursive: true });
const tmp = `${outFile}.tmp-${process.pid}`;
writeFileSync(tmp, JSON.stringify(payload));
renameSync(tmp, outFile);
console.error(`quant-capture: wrote ${candles.length} candles in ${requests} requests, sha256 ${sha256.slice(0, 16)}`);
