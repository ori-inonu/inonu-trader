/**
 * Manual live smoke of the desk data layer against the REAL keyless OKX public API. Not a test: it needs the network.
 *
 *   cd <repo> && bun web/src/lib/desk/live-smoke.manual.ts [seconds]
 *
 * For BTC-USDT and then MON-USDT it wires the real controller (real sockets, real REST, real clock) for about 10 s
 * each and prints a compact summary: messages per channel, best bid and ask, how the book is verified, trades, candles,
 * metrics and feed states. It sends nothing but subscriptions and GET requests.
 */

import { createDeskController } from "./desk-controller";
import type { DeskMetrics, DeskState } from "./types";

const SECONDS = Math.max(3, Number(process.argv[2] ?? "10") || 10);

function compact(metrics: DeskMetrics): string {
  return Object.entries(metrics)
    .map(([key, value]) => `${key}=${value === null || value === undefined ? "null" : Number.isInteger(value) ? String(value) : Number(value).toPrecision(6)}`)
    .join(" ");
}

function levels(state: DeskState): string {
  const book = state.book;
  if (book === null) return "sem livro";
  const bid = book.bids[0];
  const ask = book.asks[0];
  return `bid ${bid?.px ?? "?"} x ${bid?.sz ?? "?"} | ask ${ask?.px ?? "?"} x ${ask?.sz ?? "?"} | niveis ${book.bids.length}/${book.asks.length} | seqId ${book.seqId} | checksumOk ${book.checksumOk} | integridade ${book.integrity}`;
}

async function run(focus: string): Promise<void> {
  const controller = createDeskController({ focus, bar: "1m" });
  const startedAt = Date.now();
  controller.start();
  await new Promise((resolve) => setTimeout(resolve, SECONDS * 1000));
  controller.store.flush();
  const state = controller.getState();
  const diag = controller.getDiagnostics();
  const book = diag.store.book;
  const checks = book.checksumVerified + book.checksumMismatches;
  const lastCandle = state.candles[state.candles.length - 1];
  const out: string[] = [];
  out.push(`=== ${focus} (${((Date.now() - startedAt) / 1000).toFixed(1)} s) ===`);
  out.push(`public ws msgs : ${JSON.stringify(diag.publicSocket?.messages ?? {})} malformed=${diag.publicSocket?.malformed} errors=${diag.publicSocket?.errors}`);
  out.push(`business ws msgs: ${JSON.stringify(diag.businessSocket?.messages ?? {})} malformed=${diag.businessSocket?.malformed} errors=${diag.businessSocket?.errors}`);
  out.push(`protocol errors : ${diag.protocolErrors.length === 0 ? "none" : JSON.stringify(diag.protocolErrors)}`);
  out.push(`book            : ${levels(state)}`);
  out.push(
    `book integrity  : checksum verified ${book.checksumVerified} / mismatches ${book.checksumMismatches} (ratio ${checks === 0 ? "n/a, OKX sent checksum 0" : (book.checksumVerified / checks).toFixed(3)}), sequence verified ${book.sequenceVerified}, sequence breaks ${book.sequenceBreaks}, resyncs ${book.resyncs}, snapshots ${book.snapshots}, updates ${book.updates}, books5 ${book.books5}`,
  );
  out.push(`rows            : rejected ${diag.store.rejectedRows}, ignored messages ${diag.store.ignoredMessages}`);
  out.push(`trades          : ${state.trades.length} kept, newest ${state.trades[0] ? `${state.trades[0].side} ${state.trades[0].sz} @ ${state.trades[0].px}` : "none"}; flow buckets ${state.flow.length}; liquidity slices ${state.liquidity.length} (bins ${state.liquidity[0]?.bins.length ?? 0}, reach ${state.liquidity[state.liquidity.length - 1]?.reachBidBps?.toFixed(1) ?? "n/a"}/${state.liquidity[state.liquidity.length - 1]?.reachAskBps?.toFixed(1) ?? "n/a"} bps)`);
  out.push(`candles         : ${state.candles.length} (1m), last ${lastCandle ? `${new Date(lastCandle.tsMs).toISOString()} close ${lastCandle.close} confirmed ${lastCandle.confirmed}` : "none"}`);
  out.push(`ticker          : ${state.ticker ? `last ${state.ticker.last} 24h open ${state.ticker.open24h}` : "none"}; instrument ${state.instrument ? `${state.instrument.instId} tick ${state.instrument.tickSz}` : "none"}`);
  out.push(`derivatives     : ${state.derivatives ? JSON.stringify(state.derivatives) : "null (no perpetual or not yet loaded)"}`);
  out.push(`clock skew      : ${state.clockSkewMs === null ? "null" : `${state.clockSkewMs} ms (OKX minus browser)`}`);
  out.push(`metrics         : ${compact(state.metrics)}`);
  out.push(`watchlist       : ${state.watchlist.map((row) => `${row.instId} ${row.ticker?.last ?? "-"} spark${row.spark.length} fund ${row.fundingRate ?? "-"}`).join(" | ")}`);
  out.push(`feeds           : ${state.feeds.map((feed) => `${feed.id}=${feed.state}${feed.detail ? ` (${feed.detail})` : ""} reconnects ${feed.reconnects}`).join("; ")}`);
  controller.stop();
  console.log(out.join("\n"));
}

for (const focus of ["BTC-USDT", "MON-USDT"]) {
  await run(focus);
  console.log("");
}
process.exit(0);
