import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { SpotLedger } from "./risk";
import { makerEconomics } from "./economics";
import { config } from "./config";
import { AmbiguousBroadcastError, Market, type Book, type Fill, type Quote, type QuoteResult, type Side } from "./market";
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
  /** Known Jev usage at the configured rate; not an invoice. Null while usage evidence is unresolved. */
  jevUsd: number | null;
  jevCostBasis: "mock-free" | "configured-rate-estimate-not-invoice" | "unknown";
  gasMon: number | null;
  gasUsd: number | null;
  estimatedGasMon: number;
  estimatedGasUsd: number;
  observedGasMon: number | null;
  observedGasUsd: number | null;
  costsComplete: boolean;
  unknownCosts: string[];
  realizedUsd: number;
  pnlUsd: number | null;
  pnlMon: number | null;
  pnlPct: number | null;
}

interface Resting { side: Side; price: number; size: number; block: number }

class ModelDecisionTimeoutError extends Error {
  constructor(message: string) { super(message); }
}

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
  private receiptWork: Promise<void> = Promise.resolve();
  private jevUsdKnown = 0;
  private estimatedGasMonKnown = 0;
  private estimatedGasUsdKnown = 0;
  private observedGasMonKnown = 0;
  private observedGasUsdKnown = 0;
  private knownInferenceCosts = new Map<number, number>();
  private unknownInferenceCosts = new Map<number, string>();
  private unknownReceiptCosts = new Map<string, string>();
  private unknownExecutions = new Map<string, string>();
  private pendingReceiptCosts = new Map<string, string>();
  private observedReceiptCosts = new Map<string, { gasMon: number; usd: number }>();
  private pendingCancels = new Map<string, number[]>();
  private position = { mon: 0, costUsd: 0 }; // signed inventory and its cost basis
  private totals: Totals = {
    blocks: 0, decisions: 0, quotes: 0, fills: 0, reverted: 0, lateBlocks: 0,
    jevUsd: 0, jevCostBasis: "unknown", gasMon: 0, gasUsd: 0,
    estimatedGasMon: 0, estimatedGasUsd: 0, observedGasMon: 0, observedGasUsd: 0,
    costsComplete: true, unknownCosts: [], realizedUsd: 0, pnlUsd: 0, pnlMon: 0, pnlPct: 0,
  };

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
      if (config.economicGate && !economics.eligible) { await this.clearOrders(block); this.emit(block, book, null, null, false); return; }
      this.lastDecisionBlock = block;

      const decision = await this.decideBeforeDeadline(block, book, t0);
      this.totals.decisions++;
      const stale = block !== this.latestBlock || performance.now() - t0 > config.maxDecisionMs;
      const side: Side | null = !stale && !this.riskStop(book) && decision.action !== "hold" && decision.probabilities[decision.action] >= config.minConfidence && this.allowed(decision.action, book) ? decision.action : null;

      let quote: Quote | null = null;
      if (side) {
        decision.action = side;
        const cancel = [...this.orders.keys()].filter((id) => id > 0); // simulated orders have negative ids
        try {
          quote = await this.market.send(block, side, config.tradeSizeMon, book, cancel, false);
        } catch (error) {
          if (!(error instanceof AmbiguousBroadcastError)) throw error;
          quote = error.quote;
          this.inflight.set(error.txHash, quote);
          if (quote.cancel.length > 0) this.pendingCancels.set(error.txHash, [...quote.cancel]);
          this.recordUnknownExecution(error.txHash, "broadcast-acknowledgement-unknown");
          this.recordUnknownReceiptCost(error.txHash, "broadcast-gas-unknown");
          this.journal({ kind: "quote", block, ts: Date.now(), mid: book.mid, quote, canceled: [] });
        }
        this.totals.quotes++;
        if (quote.status === "sim") {
          this.recordPaperGas(quote, book);
          this.orders.clear(); // the simulated cancel
          this.orders.set(--this.simId, { side, price: quote.price, size: quote.size, block });
        } else if (quote.status === "sent") {
          const txId = quote.txHash ?? `missing-hash:block:${block}`;
          this.inflight.set(txId, quote);
          if (quote.txHash && quote.cancel.length > 0) this.pendingCancels.set(quote.txHash, [...quote.cancel]);
          if (quote.txHash && quote.gasEvidence === "pending" && quote.gasMon === null) {
            this.recordPendingReceiptCost(quote.txHash, "receipt-pending");
          } else {
            this.recordUnknownReceiptCost(txId, "sent-quote-gas-evidence-invalid");
          }
        }
      } else {
        decision.action = "hold";
        await this.clearOrders(block);
      }
      if (this.riskStop(book)) await this.clearOrders(block);
      this.emit(block, book, decision, quote, false, { readMs: Math.round(readMs), loopMs: Math.round(performance.now() - t0) });
    } catch (e) {
      if (e instanceof ModelDecisionTimeoutError) {
        this.stopped ??= `model-decision-timeout: ${e.message}`;
        await this.clearOrders(block);
        if (this.lastBook) this.emit(block, this.lastBook, null, null, true);
      } else {
        this.stopped ??= "data-or-decision-error";
        await this.clearOrders(block);
        console.error(`block ${block}:`, (e as Error).message);
        if (this.lastBook) this.emit(block, this.lastBook, null, null, false);
      }
    } finally {
      this.busy = false;
    }
  }

  async settle() { await Promise.all([this.pollWork, this.receiptWork]); }
  get stopReason() { return this.stopped; }
  private riskStop(book: Book) {
    if (this.stopped) return true;
    if (this.pendingReceiptCosts.size > 0) return true;
    if (!this.ledger) return false;
    const s = this.ledger.snapshot(book.mid);
    if (s.pnlUsd <= -config.maxLossUsd) this.stopped ??= "session-loss";
    if (s.gasUsd + s.aiUsd + s.feeUsd >= config.maxSpendUsd) this.stopped ??= "session-spend";
    return this.stopped !== null;
  }

  private async decideBeforeDeadline(block: number, book: Book, startedAt: number): Promise<Decision> {
    const deadline = startedAt + config.maxDecisionMs;
    const state = this.buildState(block, book);
    const remainingMs = deadline - performance.now();
    if (remainingMs <= 0) throw new ModelDecisionTimeoutError("deadline expired before inference");

    let timedOut = false;
    let timer: ReturnType<typeof setTimeout>;
    const modelResult = Promise.resolve()
      .then(() => this.model.decide(state))
      .then((result) => {
        this.accountInferenceCost(block, book, result);
        if (timedOut || performance.now() >= deadline) {
          timedOut = true;
          throw new ModelDecisionTimeoutError("inference unresolved at deadline");
        }
        return validateDecision(result);
      }, (error: unknown) => {
        if (this.model.name !== "mock") this.recordUnknownInferenceCost(block, book, timedOut ? "late-evaluator-error" : "evaluator-error");
        if (timedOut || performance.now() >= deadline) {
          timedOut = true;
          throw new ModelDecisionTimeoutError("inference unresolved at deadline");
        }
        throw error;
      });
    const timeout = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => {
        timedOut = true;
        this.stopped ??= "model-decision-timeout: inference unresolved at deadline";
        this.recordUnknownInferenceCost(block, book, "inference-unresolved-at-deadline");
        reject(new ModelDecisionTimeoutError("inference unresolved at deadline"));
      }, remainingMs);
    });
    try { return await Promise.race([modelResult, timeout]); }
    finally { clearTimeout(timer!); }
  }

  private accountInferenceCost(block: number, book: Book, result: unknown) {
    if (this.model.name === "mock") {
      this.recordKnownInferenceCost(block, book, 0, "mock-free");
      return;
    }
    if (result === null || typeof result !== "object" || !("inputTokens" in result)) {
      this.recordUnknownInferenceCost(block, book, "usage-missing");
      return;
    }
    const inputTokens = (result as { inputTokens?: unknown }).inputTokens;
    if (typeof inputTokens !== "number" || !Number.isSafeInteger(inputTokens) || inputTokens < 0) {
      this.recordUnknownInferenceCost(block, book, "usage-invalid");
      return;
    }
    const spend = (inputTokens / 1e6) * config.jevUsdPerMTok;
    if (!Number.isFinite(spend) || spend < 0) {
      this.recordUnknownInferenceCost(block, book, "rate-estimate-invalid");
      return;
    }
    this.recordKnownInferenceCost(block, book, spend, "configured-rate-estimate-not-invoice");
  }

  private recordUnknownInferenceCost(block: number, book: Book, reason: string) {
    if (this.knownInferenceCosts.has(block) || this.unknownInferenceCosts.has(block)) return;
    this.unknownInferenceCosts.set(block, reason);
    this.stopped ??= "unknown-inference-cost";
    this.journal({ kind: "cost", block, inferenceId: `block:${block}`, ts: Date.now(), mid: book.mid, status: "unknown", jevUsd: null, reason });
    this.updateCostTotals(book.mid);
  }

  private recordKnownInferenceCost(block: number, book: Book, spend: number, basis: "mock-free" | "configured-rate-estimate-not-invoice") {
    if (this.knownInferenceCosts.has(block)) return;
    this.unknownInferenceCosts.delete(block);
    this.knownInferenceCosts.set(block, spend);
    this.jevUsdKnown += spend;
    this.ledger?.charge("ai", spend);
    this.journal({ kind: "cost", block, inferenceId: `block:${block}`, ts: Date.now(), mid: book.mid, status: "known", jevUsd: spend, basis, ...(basis === "configured-rate-estimate-not-invoice" ? { rateUsdPerMTok: config.jevUsdPerMTok } : {}) });
    this.updateCostTotals(book.mid);
  }

  private async clearOrders(block: number) {
    if (!this.market.wallet) { this.orders.clear(); return; }
    const alreadyCanceling = new Set([...this.pendingCancels.values()].flat());
    const ids = [...this.orders.keys()].filter(id => id > 0 && !alreadyCanceling.has(id));
    if (!ids.length) return;
    try {
      const result = await this.market.cancelOrders(ids, block);
      const mid = this.lastBook?.mid ?? null;
      if (result.gasEvidence === "observed" && result.gasMon !== null && mid !== null) this.recordObservedGas(result.txHash, result.gasMon, mid);
      else if (result.gasEvidence === "pending" && result.gasMon === null) this.recordPendingReceiptCost(result.txHash, "cancel-receipt-pending");
      else this.recordUnknownReceiptCost(result.txHash, "cancellation-receipt-gas-unknown");
      if (result.status === "sent") this.pendingCancels.set(result.txHash, [...ids]);
      this.journal({ kind: "cancel", block, ts: Date.now(), mid, gasMon: result.gasMon, gasEstimateMon: result.gasEstimateMon, gasEvidence: result.gasEvidence, txHash: result.txHash, status: result.status, canceled: [...ids] });
    } catch (error) {
      if (error instanceof AmbiguousBroadcastError) {
        const txHash = error.txHash;
        this.pendingCancels.set(txHash, [...ids]);
        this.recordUnknownExecution(txHash, "cancellation-broadcast-acknowledgement-unknown");
        this.recordUnknownReceiptCost(txHash, "cancellation-gas-unknown");
        this.journal({ kind: "cancel", block, ts: Date.now(), mid: this.lastBook?.mid ?? null, gasMon: null, gasEstimateMon: error.quote.gasEstimateMon, gasEvidence: "unknown", txHash, status: "unknown", canceled: [...ids], reason: "cancellation-broadcast-acknowledgement-unknown" });
        return;
      }
      this.stopped ??= "cancel-failed: orders may remain live";
      this.recordUnknownExecution(`cancel-send:block:${block}`, "cancellation-send-outcome-unknown");
      this.journal({ kind: "cancel", block, ts: Date.now(), mid: this.lastBook?.mid ?? null, gasMon: null, gasEvidence: "unknown", txHash: null, status: "unknown", canceled: [...ids], reason: "cancellation-send-outcome-unknown" });
      console.error(this.stopped, (error as Error).message);
    }
  }

  /** One eth_getTransactionReceipt per in-flight tx, in parallel with this block's decision. */
  private confirmPending(block: number) {
    this.receiptWork = this.receiptWork.then(() => this.market.pollPending(block)).then((results) => {
      for (const r of results) this.applyQuoteResult(r);
    }).catch(() => {});
  }

  private applyQuoteResult({ block, canceled, kind = "quote", quote: receivedQuote }: QuoteResult) {
    let quote = receivedQuote;
    if (kind === "quote" && quote.status === "placed" &&
        (quote.orderId === null || !Number.isSafeInteger(quote.orderId) || quote.orderId <= 0)) {
      quote = { ...quote, status: "lost", orderId: null };
    }
    const originalBlockMid = this.history.find((event) => event.block === block)?.mid;
    const mid = originalBlockMid ?? this.lastBook?.mid ?? null;
    const txId = quote.txHash ?? `${kind}:block:${block}`;
    if (quote.status === "lost") {
      if (quote.gasEvidence === "observed" && quote.gasMon !== null && mid !== null) this.recordObservedGas(txId, quote.gasMon, mid);
      this.recordUnknownExecution(txId, "receipt-or-execution-unresolved");
      if (quote.gasEvidence !== "observed" || quote.gasMon === null || mid === null) this.recordUnknownReceiptCost(txId, "receipt-gas-unknown");
    } else {
      this.unknownExecutions.delete(txId); // a recognized final receipt resolves prior execution uncertainty
      if (quote.gasEvidence === "observed" && quote.gasMon !== null && mid !== null) this.recordObservedGas(txId, quote.gasMon, mid);
      else if (quote.status !== "sent" && quote.status !== "sim") this.recordUnknownReceiptCost(txId, "receipt-gas-unknown");
    }
    if (kind === "cancel") {
      if (quote.status === "placed") {
        const expected = new Set(this.pendingCancels.get(txId) ?? quote.cancel);
        const confirmed = new Set(canceled);
        if ([...expected].every((id) => confirmed.has(id))) {
          for (const id of canceled) this.orders.delete(id);
          this.pendingCancels.delete(txId);
        } else {
          this.recordUnknownExecution(txId, "cancellation-execution-unreconciled");
        }
      } else if (quote.status === "reverted") {
        this.recordUnknownExecution(txId, "cancellation-reverted-orders-may-remain-live");
      }
      this.journal({ kind: "cancel", block, ts: Date.now(), mid, gasMon: quote.gasMon, gasEstimateMon: quote.gasEstimateMon, gasEvidence: quote.gasEvidence, txHash: quote.txHash, status: quote.status, canceled: [...canceled] });
      return;
    }
    if (quote.status !== "lost" && quote.txHash) this.inflight.delete(quote.txHash);
    this.journal({ kind: "quote", block, ts: Date.now(), mid, quote, canceled: [...canceled] });
    if (quote.status === "reverted") this.totals.reverted++;
    if (quote.status !== "lost") {
      const expectedCancel = new Set(this.pendingCancels.get(txId) ?? quote.cancel);
      const confirmedCancel = new Set(canceled);
      if ([...expectedCancel].every((id) => confirmedCancel.has(id))) {
        for (const id of canceled) this.orders.delete(id);
        this.pendingCancels.delete(txId);
      } else if (expectedCancel.size > 0 && quote.status === "placed") {
        this.recordUnknownExecution(txId, "replacement-cancellation-unreconciled");
      } else {
        this.pendingCancels.delete(txId);
      }
    }
    if (quote.status === "placed" && quote.orderId !== null) this.orders.set(quote.orderId, { side: quote.side, price: quote.price, size: quote.size, block });
    const e = this.history.find((h) => h.block === block);
    if (e) e.quote = quote;
    this.onQuote(block, quote);
  }

  private recordPaperGas(quote: Quote, book: Book) {
    if (quote.gasEvidence !== "estimate" || quote.gasMon === null || !Number.isFinite(quote.gasMon) || quote.gasMon < 0) {
      this.recordUnknownReceiptCost(`paper:${book.block}`, "paper-gas-estimate-invalid");
      return;
    }
    const usd = quote.gasMon * book.mid;
    if (!Number.isFinite(usd)) {
      this.recordUnknownReceiptCost(`paper:${book.block}`, "paper-gas-mark-invalid");
      return;
    }
    this.estimatedGasMonKnown += quote.gasMon;
    this.estimatedGasUsdKnown += usd;
    this.ledger?.charge("gas", usd);
    this.updateCostTotals(book.mid);
  }

  private recordObservedGas(id: string, gasMon: number, mid: number) {
    if (!Number.isFinite(gasMon) || gasMon < 0 || !Number.isFinite(mid) || mid <= 0) {
      this.recordUnknownReceiptCost(id, "receipt-gas-invalid");
      return;
    }
    const usd = gasMon * mid;
    if (!Number.isFinite(usd)) {
      this.recordUnknownReceiptCost(id, "receipt-gas-mark-invalid");
      return;
    }
    const prior = this.observedReceiptCosts.get(id);
    if (prior) {
      if (Math.abs(prior.gasMon - gasMon) > 1e-12) this.recordUnknownReceiptCost(id, "receipt-gas-conflict");
      else {
        this.unknownReceiptCosts.delete(id);
        this.unknownExecutions.delete(id);
        this.pendingReceiptCosts.delete(id);
        this.updateCostTotals(mid);
      }
      return;
    }
    this.observedReceiptCosts.set(id, { gasMon, usd });
    this.observedGasMonKnown += gasMon;
    this.observedGasUsdKnown += usd;
    this.unknownReceiptCosts.delete(id);
    this.unknownExecutions.delete(id);
    this.pendingReceiptCosts.delete(id);
    this.ledger?.charge("gas", usd);
    this.updateCostTotals(mid);
  }

  private recordPendingReceiptCost(id: string, reason: string) {
    if (!this.observedReceiptCosts.has(id) && !this.unknownReceiptCosts.has(id)) this.pendingReceiptCosts.set(id, reason);
    this.updateCostTotals(this.lastBook?.mid ?? 1);
  }

  private recordUnknownReceiptCost(id: string, reason: string) {
    this.pendingReceiptCosts.delete(id);
    if (!this.unknownReceiptCosts.has(id)) this.unknownReceiptCosts.set(id, reason);
    this.stopped ??= "unknown-receipt-gas";
    this.updateCostTotals(this.lastBook?.mid ?? 1);
  }

  private recordUnknownExecution(id: string, reason: string) {
    this.pendingReceiptCosts.delete(id);
    if (!this.unknownExecutions.has(id)) this.unknownExecutions.set(id, reason);
    this.stopped ??= "unknown-transaction: reconcile on chain";
    this.updateCostTotals(this.lastBook?.mid ?? 1);
  }

  private updateCostTotals(mid: number) {
    const unknownCosts = [
      ...[...this.unknownInferenceCosts].map(([block, reason]) => `inference:block:${block}:${reason}`),
      ...[...this.unknownReceiptCosts].map(([id, reason]) => `receipt:${id}:${reason}`),
      ...[...this.unknownExecutions].map(([id, reason]) => `execution:${id}:${reason}`),
      ...[...this.pendingReceiptCosts].map(([id, reason]) => `pending:${id}:${reason}`),
    ].sort();
    const unknownReceiptGas = this.unknownReceiptCosts.size > 0 || this.pendingReceiptCosts.size > 0;
    this.totals.jevUsd = this.unknownInferenceCosts.size ? null : this.jevUsdKnown;
    this.totals.jevCostBasis = this.unknownInferenceCosts.size
      ? "unknown"
      : this.model.name === "mock" ? "mock-free" : "configured-rate-estimate-not-invoice";
    this.totals.estimatedGasMon = this.estimatedGasMonKnown;
    this.totals.estimatedGasUsd = this.estimatedGasUsdKnown;
    this.totals.observedGasMon = unknownReceiptGas ? null : this.observedGasMonKnown;
    this.totals.observedGasUsd = unknownReceiptGas ? null : this.observedGasUsdKnown;
    this.totals.gasMon = unknownReceiptGas ? null : this.estimatedGasMonKnown + this.observedGasMonKnown;
    this.totals.gasUsd = unknownReceiptGas ? null : this.estimatedGasUsdKnown + this.observedGasUsdKnown;
    this.totals.costsComplete = unknownCosts.length === 0;
    this.totals.unknownCosts = unknownCosts;
    const snapshot = this.ledger?.snapshot(mid);
    this.totals.pnlUsd = this.totals.costsComplete ? snapshot?.pnlUsd ?? null : null;
    this.totals.pnlMon = this.totals.pnlUsd === null ? null : this.totals.pnlUsd / mid;
    this.totals.pnlPct = this.totals.pnlUsd === null ? null : (this.totals.pnlUsd / config.bankrollUsd) * 100;
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
    this.updateCostTotals(book.mid);
    const unrealized = this.unrealizedUsd(book.mid);
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
      totals: {
        ...t,
        jevUsd: t.jevUsd === null ? null : round(t.jevUsd, 6),
        gasMon: t.gasMon === null ? null : round(t.gasMon, 6),
        gasUsd: t.gasUsd === null ? null : round(t.gasUsd, 6),
        estimatedGasMon: round(t.estimatedGasMon, 6),
        estimatedGasUsd: round(t.estimatedGasUsd, 6),
        observedGasMon: t.observedGasMon === null ? null : round(t.observedGasMon, 6),
        observedGasUsd: t.observedGasUsd === null ? null : round(t.observedGasUsd, 6),
        unknownCosts: [...t.unknownCosts],
        realizedUsd: round(t.realizedUsd, 4),
        pnlUsd: t.pnlUsd === null ? null : round(t.pnlUsd, 4),
        pnlMon: t.pnlMon === null ? null : round(t.pnlMon, 4),
        pnlPct: t.pnlPct === null ? null : round(t.pnlPct, 3),
      },
    };
    this.history.push(structuredClone(event));
    if (this.history.length > config.historySize) this.history.shift();
    appendFileSync("data/events.jsonl", JSON.stringify(event) + "\n");
    this.journal({ kind: "block", ...event });
    this.onEvent(structuredClone(event), timing);
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

export function formatNetPnl(pnlUsd: number | null): string {
  return pnlUsd === null ? "unknown (incomplete cost evidence)" : `$${pnlUsd.toFixed(2)}`;
}
