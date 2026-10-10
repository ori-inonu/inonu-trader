import { config } from "./config";
import { startBlockFeed } from "./chain";
import { Market, formatQuoteGas } from "./market";
import { createModel } from "./model";
import { Trader, formatNetPnl } from "./trader";
import { log10 } from "./book";
import { startServer } from "./server";
import { existsSync } from "node:fs";

if (existsSync(config.journalPath)) throw new Error("Set JOURNAL_PATH to a new session file; do not overwrite or mix sessions");

const market = new Market();
await market.init();
const minimum = Number(market.params.minSize.toString()) / 10 ** log10(market.params.sizePrecision);
if (config.tradeSizeMon < minimum) throw new Error(`TRADE_SIZE_MON below current market minimum ${minimum}`);
const model = createModel();

const server = startServer(
  { model: model.name, wallet: market.address, dryRun: config.dryRun, market: config.market, startedAt: Date.now() },
  () => trader.history,
);
const trader = new Trader(
  market,
  model,
  (e, t) => {
    server.broadcast(e);
    if (e.decision && !e.decision.late) {
      const p = e.decision.probabilities;
      const q = e.quote;
      const quote = !q ? " NO QUOTE (cap or funds on both sides)" : ` ${q.side.toUpperCase()} ${q.size} @ ${q.price.toFixed(6)}${q.capped ? " capped" : ""}${q.status === "sim" ? " (sim)" : ` cancel ${q.cancel.length} ${q.txHash}`}`;
      console.log(`#${e.block} ${e.mid.toFixed(6)} b${(p.buy * 100).toFixed(0)} s${(p.sell * 100).toFixed(0)} ${e.decision.latencyMs}ms${quote} pnl ${formatNetPnl(e.totals.pnlUsd)}${t ? ` · read ${t.readMs}ms loop ${t.loopMs}ms` : ""}`);
    }
  },
  (block, fill) => {
    server.broadcastFill(block, fill);
    console.log(`#${block} FILL ${fill.side} ${fill.size} @ ${fill.price.toFixed(6)}${fill.simulated ? " (sim)" : ` order ${fill.orderId} ${fill.txHash}`}`);
  },
  (block, quote) => {
    server.broadcastQuote(block, quote);
    if (quote.status !== "placed") console.log(`#${block} ${quote.status.toUpperCase()} ${quote.side} @ ${quote.price.toFixed(6)} gas ${formatQuoteGas(quote)} ${quote.txHash}`);
  },
);
trader.attachTradeFeed(log10(market.params.sizePrecision));

console.log(`jev-trader · model=${model.name} · post-only ${config.quoteInsideTicks} tick inside the touch · horizon ${config.horizonBlocks} blocks · ${config.dryRun ? "DRY RUN" : `wallet ${market.address}`} · market ${config.market} · read ${config.readRpcUrl} · :${config.port}`);
startBlockFeed((block) => trader.onBlock(block));
