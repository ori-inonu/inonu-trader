import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { SpotLedger } from "./risk";
import { makerEconomics } from "./economics";
import { config } from "./config";
import { Market, type Book, type Fill, type Quote, type QuoteResult, type Side } from "./market";
import { validateDecision, type Action, type Decision, type Model, type TradeState } from "./model";
import { TradeFeed, type MakerFill, type TradePrint } from "./trades";

export interface BlockEvent {
  block: number;
  ts: number;
  mid: number;
  bestBid: number;
  bestAsk: number;
  spreadBps: number;
  decision: { action: Action; probabilities: Record<Action, number>; upIn10: number; latencyMs: number; late: boolean } | null;
  /** The order this block put on the book. */
  quote: Quote | null;
  /** Maker fills that landed in this block (aggregated), attached when the trade logs for it arrive. */
  fill: Fill | null;
  /** Our size known to be resting on the book after this block's order. */
  resting: { bidMon: number; askMon: number };
  position: { side: "long" | "short" | "flat"; size: number; entryPrice: number | null; unrealizedUsd: number; unrealizedMon: number };
  totals: Totals;
}

/** Per-block latency: the book read, and read + decide + send end to end. */
export interface Timing { readMs: number; loopMs: number }

export interface Totals {
  blocks: number;
  decisions: number;
  quotes: number;
  fills: number;
  reverted: number;
  lateBlocks: number;
  jevUsd: number;
  gasMon: number;
  gasUsd: number;
  realizedUsd: number;
  pnlUsd: number;
  pnlMon: number;
  pnlPct: number;
}

interface Resting { side: Side; price: number; size: number; block: number }

/**
 * Read blocks, harvest fills and gate cost/risk/interval before asking buy, sell or hold.
 * Eligible funded spot orders replace prior quotes; suppressed paper orders are cleared.
 * One request in flight; newer blocks invalidate a delayed model result.
 *
 * Live sends are fire-and-forget: the block event carries the quote as `sent`; its receipt
 * (`placed` with an order id, or `reverted`) is applied when it turns up on a later block. Fills
 * come from the Trade log feed: a taker hit one of our resting orders. Dry runs simulate both:
 * orders can fill on the next observed print and are cleared when a later decision is suppressed.
 */
export class Trader {
  readonly history: BlockEvent[] = [];
  private mids: number[] = [];
  private busy = false;
  private lastBook: Book | null = null;
  private trades: TradeFeed | null = null;
  /** Orders we know are resting on the book (live: from receipts; dry run: last block's simulated order). */
  private orders = new Map<number, Resting>();
  /** Live quotes sent but not yet confirmed; they may become resting orders, so they count toward the cap. */
  private inflight = new Map<string, Quote>();
  private simId = 0;
  private ledger: SpotLedger | null = null;
  private latestBlock = 0;
  private lastDecisionBlock = -Infinity;
  private stopped: string | null = null;
  private fillId = 0;
  private pollWork: Promise<void> = Promise.resolve();
  private position = { mon: 0, costUsd: 0 }; // signed inventory and its cost basis
  private totals: Totals = { blocks: 0, decisions: 0, quotes: 0, fills: 0, reverted: 0, lateBlocks: 0, jevUsd: 0, gasMon: 0, gasUsd: 0, realizedUsd: 0, pnlUsd: 0, pnlMon: 0, pnlPct: 0 };

  constructor(
    private market: Market,
    private model: Model,
    private onEvent: (e: BlockEvent, timing?: Timing) => void,
    private onFill: (block: number, fill: Fill) => void = () => {},
    private onQuote: (block: number, quote: Quote) => void = () => {},
    private journal: (row: unknown) => void = (row) => appendFileSync(config.journalPath, JSON.stringify(row) + "\n"),
  ) {
    mkdirSync("data", { recursive: true });
    mkdirSync(dirname(config.journalPath), { recursive: true });
  }

  /** Call once the market params are known. Without it `trades` in the state is all zeros and no fills are ever seen. */
  attachTradeFeed(sizeDec: number) {
    this.trades = new TradeFeed({ market: config.market, url: config.readRpcUrl, sizeDec, maker: this.market.address });
  }

  async onBlock(block: number) {
    this.latestBlock = Math.max(this.latestBlock, block);
    this.totals.blocks++;
    this.confirmPending(block); // off the hot path: receipts for earlier blocks' sends
    if (this.totals.blocks % config.refreshBlocks === 0) this.market.refresh().catch(() => {}); // fee estimate + margin + vault check
    if (this.busy) {
      this.totals.lateBlocks++;
      if (!this.market.wallet) this.orders.clear();
      if (this.lastBook) this.emit(block, this.lastBook, null, null, true);
      return;
    }
    this.busy = true;
    const t0 = performance.now();
    try {
      const book = await this.market.readBook();
      const readMs = performance.now() - t0;
      this.lastBook = book;
      if (!Number.isFinite(book.mid) || book.mid <= 0 || book.bid <= 0 || book.ask < book.bid) throw new Error("Invalid market book");
      if (!this.ledger) {
        if (config.marginMon * book.mid > config.bankrollUsd * config.maxCapitalFraction) throw new Error("Initial inventory exceeds capital cap");
        this.ledger = new SpotLedger(config.bankrollUsd, config.marginMon, book.mid, config.makerFeeBps);
        this.position = { mon: config.marginMon, costUsd: config.marginMon * book.mid };
        this.journal({ kind: "session", ts: Date.now(), sessionId: crypto.randomUUID(), dataSource: this.market.wallet ? "live" : "real-market-paper", model: this.model.name, bankrollUsd: config.bankrollUsd, initialMon: config.marginMon, initialMid: book.mid, makerFeeBps: config.makerFeeBps });
      }
      this.mids.push(book.mid);
      if (this.mids.length > 400) this.mids.shift();
      // Harvest earlier prints before replacing the paper order: late RPC logs must not erase it.
      if (this.trades) { this.pollWork = this.trades.poll(block).then(() => this.harvest()); await this.pollWork; }
      if (this.riskStop(book)) { await this.clearOrders(block); this.emit(block, book, null, null, false); return; }
      if (block - this.lastDecisionBlock < config.quoteIntervalBlocks) { await this.clearOrders(block); this.emit(block, book, null, null, false); return; }
      const economics = makerEconomics({ buy: this.market.quotePrice("buy", book), sell: this.market.quotePrice("sell", book), size: config.tradeSizeMon, gasMonPerQuote: this.market.estimatedGasMon(), mid: book.mid, feeBps: config.makerFeeBps, inferenceUsd: this.model.name === "mock" ? 0 : config.inferenceBudgetTokens * config.jevUsdPerMTok / 1e6, bufferUsd: config.minNetEdgeUsd });
      if (!economics.eligible) { await this.clearOrders(block); this.emit(block, book, null, null, false); return; }
      this.lastDecisionBlock = block;

      const decision = validateDecision(await this.model.decide(this.buildState(block, book)));
      this.totals.decisions++;
      const spend = this.model.name === "mock" ? 0 : (decision.inputTokens / 1e6) * config.jevUsdPerMTok;
      this.totals.jevUsd += spend; this.ledger.charge("ai", spend);
      this.journal({ kind: "cost", block, ts: Date.now(), mid: book.mid, jevUsd: spend });
      const stale = block !== this.latestBlock || performance.now() - t0 > config.maxDecisionMs;
      const side: Side | null = !stale && !this.riskStop(book) && decision.action !== "hold" && decision.probabilities[decision.action] >= config.minConfidence && this.allowed(decision.action, book) ? decision.action : null;

      let quote: Quote | null = null;
      if (side) {
        decision.action = side;
        const cancel = [...this.orders.keys()].filter((id) => id > 0); // simulated orders have negative ids
        quote = await this.market.send(block, side, config.tradeSizeMon, book, cancel, false);
        this.totals.quotes++;
        if (quote.status === "sim") {
          this.totals.gasMon += quote.gasMon; this.ledger.charge("gas", quote.gasMon * book.mid);
          this.orders.clear(); // the simulated cancel
          quote.orderId = --this.simId; // journal and later fills must reference the same paper order
          this.orders.set(quote.orderId, { side, price: quote.price, size: quote.size, block });
        } else if (quote.txHash) {
          this.inflight.set(quote.txHash, quote);
        }
      } else {
        decision.action = "hold";
        await this.clearOrders(block);
      }
      if (this.riskStop(book)) await this.clearOrders(block);
      this.emit(block, book, decision, quote, false, { readMs: Math.round(readMs), loopMs: Math.round(performance.now() - t0) });
    } catch (e) {
      this.stopped = "data-or-decision-error";
      await this.clearOrders(block);
      console.error(`block ${block}:`, (e as Error).message);
    } finally {
      this.busy = false;
    }
  }

  async settle() { await this.pollWork; }
  get stopReason() { return this.stopped; }
  private riskStop(book: Book) {
    if (!this.ledger) return false;
    const s = this.ledger.snapshot(book.mid);
    if (s.pnlUsd <= -config.maxLossUsd) this.stopped ??= "session-loss";
    if (s.gasUsd + s.aiUsd + s.feeUsd >= config.maxSpendUsd) this.stopped ??= "session-spend";
    return this.stopped !== null;
  }
  private async clearOrders(block: number) {
    if (!this.market.wallet) { this.orders.clear(); return; }
    const ids = [...this.orders.keys()].filter(id => id > 0);
    if (!ids.length) return;
    try { const { gasMon, txHash } = await this.market.cancelOrders(ids); this.totals.gasMon += gasMon; this.ledger?.charge("gas", gasMon * this.lastBook!.mid); this.journal({ kind: "cancel", block, ts: Date.now(), mid: this.lastBook!.mid, gasMon, txHash }); ids.forEach(id => this.orders.delete(id)); }
    catch (e) { this.stopped = "cancel-failed: orders may remain live"; console.error(this.stopped, (e as Error).message); }
  }

  /** One eth_getTransactionReceipt per in-flight tx, in parallel with this block's decision. */
  private confirmPending(block: number) {
    this.market.pollPending(block).then((results) => {
      for (const r of results) this.applyQuoteResult(r);
    }).catch(() => {});
  }

  private applyQuoteResult({ block, quote, canceled }: QuoteResult) {
    if (quote.txHash) this.inflight.delete(quote.txHash);
    this.totals.gasMon += quote.gasMon; // charged on reverts too
    if (this.lastBook) this.ledger?.charge("gas", quote.gasMon * this.lastBook.mid);
    this.journal({ kind: "quote", block, ts: Date.now(), mid: this.lastBook?.mid, quote });
    if (quote.status === "lost") this.stopped = "unknown-transaction: reconcile on chain";
    if (quote.status === "reverted") this.totals.reverted++;
    for (const id of canceled) this.orders.delete(id);
    if (quote.status === "placed" && quote.orderId !== null) this.orders.set(quote.orderId, { side: quote.side, price: quote.price, size: quote.size, block });
    const e = this.history.find((h) => h.block === block);
    if (e) e.quote = quote;
    this.onQuote(block, quote);
  }

  /** After each trade-log poll: apply our maker fills (live) or simulate them against the new prints (dry run). */
  private harvest() {
    if (!this.trades) return;
    const prints = this.trades.drainPrints();
    const fills: Fill[] = this.market.wallet ? this.liveFills(this.trades.drainFills()) : this.simFills(prints);
    if (!fills.length) return;
    const byBlock = new Map<number, Fill[]>();
    for (const f of fills) {
      this.applyFill(f);
      const b = (f as Fill & { block: number }).block;
      this.journal({ kind: "fill", id: String(++this.fillId), block: b, ts: Date.now(), mid: this.lastBook!.mid, fill: f });
      byBlock.set(b, [...(byBlock.get(b) ?? []), f]);
    }
    for (const [block, fs] of byBlock) {
      const fill = aggregate(fs);
      const e = this.history.find((h) => h.block === block);
      if (e) e.fill = fill;
      this.onFill(block, fill);
    }
  }

  private liveFills(raw: MakerFill[]): (Fill & { block: number })[] {
    const out: (Fill & { block: number })[] = [];
    for (const f of raw) {
      const o = this.orders.get(f.orderId);
      if (f.updatedSize <= 0) this.orders.delete(f.orderId);
      else if (o) o.size = f.updatedSize;
      out.push({ side: f.side, size: f.size, price: f.price, txHash: f.txHash, orderId: f.orderId, simulated: false, block: f.block });
    }
    return out;
  }

  /**
   * A simulated order placed at block N is on the book from N+1. A taker sell printing at or below
   * our bid (or a taker buy at or above our ask) would have taken us first: fill up to the print's size.
   */
  private simFills(prints: TradePrint[]): (Fill & { block: number })[] {
    const out: (Fill & { block: number })[] = [];
    for (const p of prints) {
      for (const [id, o] of this.orders) {
        if (p.block <= o.block || o.size <= 0) continue;
        const hit = o.side === "buy" ? p.side === "sell" && p.price <= o.price : p.side === "buy" && p.price >= o.price;
        if (!hit) continue;
        const size = Math.min(o.size, p.size);
        o.size -= size;
        if (o.size <= 1e-9) this.orders.delete(id);
        out.push({ side: o.side, size, price: o.price, txHash: null, orderId: id, simulated: true, block: p.block });
      }
    }
    return out;
  }

  private restingMon(side: Side) {
    let mon = 0;
    for (const o of this.orders.values()) if (o.side === side) mon += o.size;
    for (const q of this.inflight.values()) if (q.side === side) mon += q.size;
    return mon;
  }

  /** Would this order, and everything already resting on its side, keep us inside the cap and (live) inside margin funds? */
  private allowed(side: Side, book: Book) {
    const size = config.tradeSizeMon;
    const exposure = side === "buy" ? this.position.mon + this.restingMon("buy") + size : this.position.mon - this.restingMon("sell") - size;
    if (exposure < 0 || exposure > config.maxPositionMon || exposure * book.mid > config.bankrollUsd * config.maxCapitalFraction) return false;
    if (!this.market.wallet) return this.ledger?.canFill(side, size + this.restingMon(side), side === "buy" ? book.ask : book.bid) ?? false;
    // Kuru debits margin when an order is placed, so the balance already excludes what is resting.
    return side === "buy" ? this.market.margin.usdc >= size * book.ask : this.market.margin.mon >= size;
  }

  private buildState(block: number, book: Book): TradeState {
    const m = this.mids, n = m.length, H = config.horizonBlocks;
    const ret = (k: number) => (n > k ? ((m[n - 1]! - m[n - 1 - k]!) / m[n - 1 - k]!) * 10_000 : 0);
    const sampled = m.slice(-H).filter((_, i, a) => (a.length - 1 - i) % 5 === 0); // every 5th block, newest included
    const lvl = (l: [number, number]) => `${l[0].toFixed(6)} x ${round(l[1], 1)}`;
    const empty = { count: 0, buyMon: 0, sellMon: 0, cvdMon: 0, vwap: null, lastPrice: null, lastSide: null };
    const depth: TradeState["depth"] = {};
    for (const [k, v] of Object.entries(book.depthBps)) depth[k + "bps"] = { bid: round(v.bid, 1), ask: round(v.ask, 1) };
    return {
      market: "MON-USDC",
      block,
      horizonBlocks: H,
      blockMs: 300,
      mid: book.mid,
      spreadBps: round(book.spreadBps, 2),
      bookImbalance: round(book.imbalance, 3),
      depth,
      book: { bids: book.levels.bids.map(lvl), asks: book.levels.asks.map(lvl) },
      returnsBps: { last1: round(ret(1), 2), last5: round(ret(5), 2), last20: round(ret(20), 2), last100: round(ret(100), 2) },
      recentMids: sampled.map((x) => x.toFixed(6)).join(" "),
      trades: this.trades ? this.trades.summary(H, block) : empty,
      recentTrades: (this.trades?.recent(10) ?? []).map((t) => `${t.block} ${t.side} ${round(t.size, 1)} @ ${t.price.toFixed(6)}`),
      allowed: { buy: this.allowed("buy", book), sell: this.allowed("sell", book) },
    };
  }

  private applyFill(f: Fill) {
    if (f.size <= 0) return;
    this.ledger?.fill(f.side, f.size, f.price);
    const signed = f.side === "buy" ? f.size : -f.size;
    const p = this.position;
    if (p.mon === 0 || Math.sign(p.mon) === Math.sign(signed)) {
      p.costUsd += signed * f.price; // adding to position
    } else {
      const closing = Math.min(Math.abs(signed), Math.abs(p.mon)) * Math.sign(signed);
      const entry = p.costUsd / p.mon;
      this.totals.realizedUsd += -closing * (f.price - entry); // closing part realizes pnl
      p.costUsd += closing * entry;
      const remainder = signed - closing;
      p.costUsd += remainder * f.price; // any flip opens the other way
    }
    p.mon += signed;
    if (Math.abs(p.mon) < 1e-9) { p.mon = 0; p.costUsd = 0; }
    this.totals.fills++;
  }

  private entryPrice() { return this.position.mon ? this.position.costUsd / this.position.mon : null; }
  private unrealizedUsd(mid: number) { return this.position.mon ? this.position.mon * (mid - this.entryPrice()!) : 0; }

  private emit(block: number, book: Book, decision: Decision | null, quote: Quote | null, late: boolean, timing?: Timing) {
    const t = this.totals;
    t.gasUsd = this.ledger?.gasUsd ?? 0;
    const unrealized = this.unrealizedUsd(book.mid);
    t.pnlUsd = this.ledger?.snapshot(book.mid).pnlUsd ?? 0;
    t.pnlMon = t.pnlUsd / book.mid;
    t.pnlPct = (t.pnlUsd / config.bankrollUsd) * 100;
    const size = Math.abs(this.position.mon);
    const event: BlockEvent = {
      block, ts: Date.now(), mid: book.mid, bestBid: book.bid, bestAsk: book.ask, spreadBps: round(book.spreadBps, 2),
      decision: late
        ? { action: "hold", probabilities: { buy: 0, sell: 0, hold: 1 }, upIn10: 0.5, latencyMs: 0, late: true }
        : decision && { action: decision.action, probabilities: decision.probabilities, upIn10: decision.upIn10, latencyMs: Math.round(decision.latencyMs), late: false },
      quote,
      fill: null,
      resting: { bidMon: round(this.restingMon("buy"), 1), askMon: round(this.restingMon("sell"), 1) },
      position: {
        side: this.position.mon > 0 ? "long" : this.position.mon < 0 ? "short" : "flat",
        size, entryPrice: this.entryPrice(), unrealizedUsd: round(unrealized, 4), unrealizedMon: round(unrealized / book.mid, 4),
      },
      totals: { ...t, jevUsd: round(t.jevUsd, 6), gasMon: round(t.gasMon, 6), gasUsd: round(t.gasUsd, 6), realizedUsd: round(t.realizedUsd, 4), pnlUsd: round(t.pnlUsd, 4), pnlMon: round(t.pnlMon, 4), pnlPct: round(t.pnlPct, 3) },
    };
    this.history.push(event);
    if (this.history.length > config.historySize) this.history.shift();
    appendFileSync("data/events.jsonl", JSON.stringify(event) + "\n");
    this.journal({ kind: "block", ...event });
    this.onEvent(event, timing);
  }
}

/** Several fills in one block become one: total size, size-weighted price, the side with more size. */
function aggregate(fills: Fill[]): Fill {
  const buy = fills.filter((f) => f.side === "buy").reduce((s, f) => s + f.size, 0);
  const sell = fills.filter((f) => f.side === "sell").reduce((s, f) => s + f.size, 0);
  const side: Side = buy >= sell ? "buy" : "sell";
  const same = fills.filter((f) => f.side === side);
  const size = same.reduce((s, f) => s + f.size, 0);
  const price = same.reduce((s, f) => s + f.size * f.price, 0) / size;
  return { side, size: round(size, 4), price, txHash: same[0]!.txHash, orderId: same[0]!.orderId, simulated: same[0]!.simulated };
}

const round = (x: number, d: number) => Math.round(x * 10 ** d) / 10 ** d;
