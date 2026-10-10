import { existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { config } from "../src/config";
import { Market } from "../src/market";
import { createModel } from "../src/model";
import { Trader } from "../src/trader";
import { rpc } from "../src/chain";
import { log10 } from "../src/book";
if (!config.dryRun) throw new Error("Capture requires DRY_RUN=true");
const args = process.argv.slice(2);
if (args.length > (args[0] === "--seconds" ? 2 : 1)) throw new Error("Usage: capture [--seconds] <5..3600>");
if (args[0] === "--seconds" && args[1] === undefined) throw new Error("--seconds requires a duration");
const seconds = Number(args[0] === "--seconds" ? args[1] : args[0] ?? 120);
if (!Number.isFinite(seconds) || seconds < 5 || seconds > 3600) throw new Error("Duration must be 5..3600 seconds");
if (existsSync(config.journalPath)) throw new Error("Use a new JOURNAL_PATH for each session; never append different sessions");
mkdirSync(dirname(config.journalPath), { recursive: true });
const market = new Market(); await market.init();
const minimum = Number(market.params.minSize.toString()) / 10 ** log10(market.params.sizePrecision);
if (config.tradeSizeMon < minimum) throw new Error(`TRADE_SIZE_MON below current market minimum ${minimum}`);
const trader = new Trader(market, createModel(), () => {}); trader.attachTradeFeed(log10(market.params.sizePrecision));
const until = Date.now() + seconds * 1000; let previous = 0;
while (Date.now() < until) {
  const block = parseInt(await rpc<string>("eth_blockNumber", [], config.readRpcUrl), 16);
  if (block > previous) { await trader.onBlock(block); previous = block; }
  await Bun.sleep(500);
}
await trader.settle();
const last = trader.history.at(-1);
const result = { capturedAt: new Date().toISOString(), requestedSeconds: seconds, source: "real-market-paper", model: config.model, journal: config.journalPath, stopReason: trader.stopReason, first: trader.history[0]?.block, last: last?.block, totals: last?.totals, caveats: ["Optimistic maker fills from public prints; no queue model", "Short sample is not evidence of daily/weekly returns", "No real orders or transfers"] };
await Bun.write(config.journalPath + ".summary.json", JSON.stringify(result, null, 2)); console.log(JSON.stringify(result, null, 2));
