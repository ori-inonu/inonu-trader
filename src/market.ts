import { ethers } from "ethers";
import * as Kuru from "@kuru-labs/kuru-sdk";
import OrderBookAbi from "@kuru-labs/kuru-sdk/abi/OrderBook.json";
import MarginAccountAbi from "@kuru-labs/kuru-sdk/abi/MarginAccount.json";
import { config } from "./config";
import { rpc } from "./chain";
import { readBook as fetchBook, readVaultParams, vaultActive, log10 } from "./book";

export interface Book {
  block: number;
  bid: number;
  ask: number;
  mid: number;
  spreadBps: number;
  /** (bidDepth - askDepth) / (bidDepth + askDepth) within 1% of mid. -1..1 */
  imbalance: number;
  /** Top 5 levels each side, best first: [price, size]. */
  levels: { bids: [number, number][]; asks: [number, number][] };
  /** Cumulative MON depth within N bps of mid, per side. */
  depthBps: { [band: string]: { bid: number; ask: number } };
}

export type Side = "buy" | "sell";
export type GasEvidence = "estimate" | "pending" | "observed" | "unknown";

/**
 * This block's order: a post-only limit order resting on Kuru's book, replacing last block's.
 * `sent` until the receipt lands, then `placed` (with its orderId) or `reverted` (the book moved
 * through the price, or a cancelled id had already filled). `lost` if no receipt ever came.
 */
export interface Quote {
  side: Side;
  price: number; // USDC per MON, tick aligned
  size: number; // MON
  txHash: string | null;
  /** Observed receipt gas, or a paper estimate. Null until a cost is actually established. */
  gasMon: number | null;
  /** Separate estimate retained while a live receipt is pending or unresolved. */
  gasEstimateMon: number | null;
  gasEvidence: GasEvidence;
  cancel: number[]; // resting order ids this tx cancels
  status: "sent" | "placed" | "reverted" | "lost" | "sim";
  orderId: number | null;
  /** The position cap or margin funds picked this side; the model's probabilities still show its call. */
  capped: boolean;
}

/** A maker fill: someone hit one of our resting orders. Arrives via the Trade log feed, not our own receipts. */
export interface Fill {
  side: Side;
  size: number; // MON
  price: number; // USDC per MON: our order's price
  txHash: string | null; // the taker's transaction
  orderId: number;
  simulated: boolean;
}

export interface QuoteResult { block: number; quote: Quote; canceled: number[]; kind?: "quote" | "cancel" }

const ERC20_ABI = [
  "function allowance(address,address) view returns (uint256)",
  "function approve(address,uint256) returns (bool)",
  "function balanceOf(address) view returns (uint256)",
];

const gwei = (n: number) => ethers.utils.parseUnits(String(n), "gwei");
const BN = ethers.BigNumber;
const ZERO_ADDRESS = ethers.constants.AddressZero;

interface Pending { block: number; quote: Quote; gasLimit: ethers.BigNumber; kind?: "quote" | "cancel"; lostReported?: boolean }

export class AmbiguousBroadcastError extends Error {
  override readonly name = "AmbiguousBroadcastError";
  readonly txHash: string;

  constructor(readonly quote: Quote, readonly kind: "quote" | "cancel") {
    super("Broadcast acknowledgement outcome is ambiguous");
    this.txHash = quote.txHash!;
  }
}

/** Kuru MON-USDC market: read the book, post one limit order per block, confirm asynchronously. */
export class Market {
  readonly provider = new ethers.providers.StaticJsonRpcProvider(config.rpcUrl, config.chainId);
  /** null in a dry run (no key, or DRY_RUN=true): nothing is signed, nothing is sent. */
  readonly wallet = config.dryRun ? null : new ethers.Wallet(config.privateKey!, this.provider);
  params!: Kuru.MarketParams; // public so scripts can build txs without init()
  /** Margin account balances, refreshed every `config.refreshBlocks`. Limit orders draw from here. */
  margin = { mon: 0, usdc: 0 };
  private iface = new ethers.utils.Interface(OrderBookAbi.abi);
  private marginIface = new ethers.utils.Interface(MarginAccountAbi.abi);
  private nonce = 0;
  private feeWei = gwei(102); // base + priority, last known; Monad's floor is 100 + 2
  private gasLimit = BN.from(config.gasLimitFallback);
  private useVault = false;
  private pending = new Map<string, Pending>();

  get address() { return this.wallet?.address ?? null; }
  private get priceDec() { return log10(this.params.pricePrecision); }
  private get sizeDec() { return log10(this.params.sizePrecision); }
  private get tickUnits() { return Number(this.params.tickSize.toString()); }

  async init() {
    if (this.wallet) throw new Error("Live execution is not qualified: reconcile existing orders, wallet/margin balances and restart capital baseline first. Use DRY_RUN=true.");
    if (parseInt(await rpc<string>("eth_chainId", [], config.rpcUrl), 16) !== config.chainId || parseInt(await rpc<string>("eth_chainId", [], config.readRpcUrl), 16) !== config.chainId) throw new Error("RPC chain mismatch");
    this.params = await Kuru.ParamFetcher.getMarketParams(this.provider, config.market);
    if (!this.params.makerFeeBps.isZero()) throw new Error("Nonzero on-chain maker fee requires qualified fee semantics before paper/live evaluation");
    await this.refresh();
    if (!this.wallet) return;
    await this.resyncNonce();
    if (config.autoDeposit) await this.ensureMargin();
    await this.initGasLimit();
  }

  /** Every `config.refreshBlocks`: fee estimate, margin balances, and whether the Kuru AMM vault went live. */
  async refresh() {
    const [fee, vault, mon, usdc] = await Promise.allSettled([
      rpc<string>("eth_gasPrice"),
      readVaultParams(config.readRpcUrl, config.market),
      this.wallet ? this.marginBalance(ZERO_ADDRESS) : Promise.resolve(null),
      this.wallet ? this.marginBalance(this.params.quoteAssetAddress) : Promise.resolve(null),
    ]);
    if (fee.status === "fulfilled") this.feeWei = BN.from(fee.value);
    if (vault.status === "fulfilled") this.useVault = vaultActive(vault.value);
    if (mon.status === "fulfilled" && mon.value) this.margin.mon = Number(ethers.utils.formatUnits(mon.value, this.params.baseAssetDecimals.toNumber()));
    if (usdc.status === "fulfilled" && usdc.value) this.margin.usdc = Number(ethers.utils.formatUnits(usdc.value, this.params.quoteAssetDecimals.toNumber()));
  }

  /** One eth_call (two batched into one HTTP request once the vault is live). */
  readBook(): Promise<Book> {
    return fetchBook(config.readRpcUrl, config.market, this.params, { vault: this.useVault });
  }

  /**
   * Where this block's order rests: `quoteInsideTicks` inside the touch on our side, never crossing.
   * If the spread is too tight to step inside, join the touch. Integer tick math, so the price is
   * exactly representable on-chain.
   */
  quotePrice(side: Side, book: Book): number {
    const scale = 10 ** this.priceDec, tick = this.tickUnits;
    const bidU = Math.round(book.bid * scale), askU = Math.round(book.ask * scale);
    const step = config.quoteInsideTicks * tick;
    let p = side === "buy" ? bidU + step : askU - step;
    if (side === "buy" && p >= askU) p = bidU;
    if (side === "sell" && p <= bidU) p = askU;
    return p / scale;
  }

  /**
   * Sign and fire one `batchUpdate`: cancel the given resting orders, post one new post-only limit
   * order. Returns as soon as the RPC has the hash. `pollPending` resolves placed/reverted later.
   */
  async send(block: number, side: Side, sizeMon: number, book: Book, cancel: number[], capped: boolean): Promise<Quote> {
    const price = this.quotePrice(side, book);
    const gasEstimateMon = this.gasMon(BN.from(config.gasLimit ?? config.gasLimitFallback), this.feeWei);
    if (!this.wallet) return { side, price, size: sizeMon, txHash: null, gasMon: gasEstimateMon, gasEstimateMon, gasEvidence: "estimate", cancel, status: "sim", orderId: null, capped };

    const tx = this.buildTx(side, sizeMon, price, cancel);
    const signed = await this.wallet.signTransaction(tx);
    const quote: Quote = { side, price, size: sizeMon, txHash: null, gasMon: null, gasEstimateMon: this.gasMon(this.gasLimit, this.feeWei), gasEvidence: "pending", cancel: [...cancel], status: "sent", orderId: null, capped };
    return this.broadcastSigned(block, quote, "quote", signed);
  }

  /** One eth_getTransactionReceipt per in-flight tx. Returns whatever resolved (or timed out). */
  async pollPending(block: number): Promise<QuoteResult[]> {
    if (!this.pending.size) return [];
    const out: QuoteResult[] = [];
    await Promise.all([...this.pending].map(async ([hash, p]) => {
      const receipt = await rpc<any>("eth_getTransactionReceipt", [hash]).catch(() => null);
      if (!this.pending.has(hash)) return; // an overlapping poll already resolved it
      if (receipt) {
        if (!this.matchesPendingReceipt(hash, p, receipt)) {
          if (!p.lostReported) out.push(this.unresolvedReceipt(hash, p));
          p.lostReported = true;
          return;
        }
        const result = this.parseReceipt(receipt, p, hash);
        if (result.quote.status !== "lost") this.pending.delete(hash);
        else p.lostReported = true; // malformed execution status remains retryable for reconciliation
        out.push(result);
      } else if (block - p.block >= config.pendingBlocks && !p.lostReported) {
        // Keep the hash pending: a delayed receipt must still be reconcilable, and nonce/exposure
        // cannot safely be reset just because one bounded receipt poll returned no result.
        p.lostReported = true;
        out.push({ block: p.block, quote: { ...p.quote, status: "lost", gasMon: null, gasEvidence: "unknown" }, canceled: [], kind: p.kind ?? "quote" });
      }
    }));
    return out;
  }

  private matchesPendingReceipt(hash: string, p: Pending, receipt: unknown): boolean {
    if (!isTransactionHash(hash) || !isTransactionHash(p.quote.txHash) || p.quote.txHash.toLowerCase() !== hash.toLowerCase()) return false;
    if (receipt === null || typeof receipt !== "object") return false;
    let receiptHash: unknown;
    try { receiptHash = (receipt as { transactionHash?: unknown }).transactionHash; }
    catch { return false; }
    return isTransactionHash(receiptHash) && receiptHash.toLowerCase() === hash.toLowerCase();
  }

  private unresolvedReceipt(hash: string, p: Pending): QuoteResult {
    return {
      block: p.block,
      quote: { ...p.quote, txHash: hash, status: "lost", orderId: null, gasMon: null, gasEvidence: "unknown" },
      canceled: [],
      kind: p.kind ?? "quote",
    };
  }

  /** The exact transaction the hot loop signs: no pre-send RPC, hardcoded gas limit, static type-2 fees. */
  buildTx(side: Side, sizeMon: number, price: number, cancel: number[]): ethers.providers.TransactionRequest {
    return {
      type: 2, chainId: config.chainId, to: config.market, nonce: this.nonce, gasLimit: this.gasLimit,
      maxFeePerGas: gwei(config.maxFeeGwei), maxPriorityFeePerGas: gwei(config.priorityFeeGwei),
      data: this.encode(side, sizeMon, price, cancel), value: BN.from(0),
    };
  }

  estimatedGasMon() { return this.gasMon(BN.from(config.gasLimit ?? config.gasLimitFallback), this.feeWei); }

  /** Cancellation-only transaction; failure remains visible to the risk latch. */
  async cancelOrders(ids: number[], block = 0): Promise<{ gasMon: number | null; gasEstimateMon: number; gasEvidence: GasEvidence; status: "sent"; txHash: string }> {
    if (!this.wallet || !ids.length) throw new Error("No live cancellation to send");
    const tx = this.buildTx("buy", config.tradeSizeMon, 1, []);
    tx.data = this.iface.encodeFunctionData("batchUpdate", [[], [], [], [], ids, true]);
    const signed = await this.wallet.signTransaction(tx);
    const quote: Quote = {
      side: "buy", price: 1, size: config.tradeSizeMon, txHash: null,
      gasMon: null, gasEstimateMon: this.gasMon(this.gasLimit, this.feeWei), gasEvidence: "pending",
      cancel: [...ids], status: "sent", orderId: null, capped: false,
    };
    const sent = await this.broadcastSigned(block, quote, "cancel", signed);
    return { gasMon: sent.gasMon, gasEstimateMon: sent.gasEstimateMon!, gasEvidence: sent.gasEvidence, status: "sent", txHash: sent.txHash! };
  }

  private async broadcastSigned(block: number, quote: Quote, kind: "quote" | "cancel", signed: string): Promise<Quote> {
    const txHash = ethers.utils.keccak256(signed);
    const sent = { ...quote, txHash };
    let acknowledgement: unknown;
    try {
      acknowledgement = await rpc<unknown>("eth_sendRawTransaction", [signed]);
    } catch {
      this.nonce++;
      throw this.rememberAmbiguousBroadcast(block, sent, kind);
    }
    this.nonce++;
    if (typeof acknowledgement !== "string" || !/^0x[0-9a-f]{64}$/i.test(acknowledgement) || acknowledgement.toLowerCase() !== txHash.toLowerCase()) {
      throw this.rememberAmbiguousBroadcast(block, sent, kind);
    }
    this.pending.set(txHash, { block, quote: sent, gasLimit: this.gasLimit, kind, lostReported: false });
    return sent;
  }

  private rememberAmbiguousBroadcast(block: number, quote: Quote, kind: "quote" | "cancel"): AmbiguousBroadcastError {
    const unresolved = { ...quote, status: "lost" as const, gasMon: null, gasEvidence: "unknown" as const };
    this.pending.set(quote.txHash!, { block, quote: unresolved, gasLimit: this.gasLimit, kind, lostReported: true });
    return new AmbiguousBroadcastError(unresolved, kind);
  }

  /** batchUpdate(buyPrices, buySizes, sellPrices, sellSizes, orderIdsToCancel, postOnly). Funds come from the margin account, so value is 0. */
  encode(side: Side, sizeMon: number, price: number, cancel: number[]): string {
    const priceU = BN.from(Math.round(price * 10 ** this.priceDec));
    const sizeU = ethers.utils.parseUnits(sizeMon.toFixed(this.sizeDec), this.sizeDec);
    const [bp, bs, sp, ss] = side === "buy" ? [[priceU], [sizeU], [], []] : [[], [], [priceU], [sizeU]];
    return this.iface.encodeFunctionData("batchUpdate", [bp, bs, sp, ss, cancel.map((id) => BN.from(id)), true]);
  }

  /** OrderCreated for our address gives the new order id; OrdersCanceled lists what the tx removed. status 0x0: nothing changed on the book. */
  private parseReceipt(r: any, p: Pending, hash: string): QuoteResult {
    let gasMon: number | null = null;
    let gasEvidence: GasEvidence = "unknown";
    try {
      if (r.effectiveGasPrice !== undefined && r.effectiveGasPrice !== null) {
        const effectiveGasPrice = BN.from(r.effectiveGasPrice);
        if (!effectiveGasPrice.lt(0)) {
          const measured = this.gasMon(p.gasLimit, effectiveGasPrice);
          if (Number.isFinite(measured) && measured >= 0) {
            gasMon = measured;
            gasEvidence = "observed";
            this.feeWei = effectiveGasPrice;
          }
        }
      }
    } catch { /* invalid/missing receipt price is unknown, never the configured estimate */ }
    const me = this.wallet!.address.toLowerCase();
    const marketAddress = config.market.toLowerCase();
    const orderIds: number[] = [];
    const canceled: number[] = [];
    let invalidOwnerOrderId = false;
    const status = parseReceiptStatus(r.status);
    if (status === 1 && Array.isArray(r.logs)) {
      for (const log of r.logs) {
        if (!log || typeof log !== "object" || typeof log.address !== "string" || log.address.toLowerCase() !== marketAddress) continue;
        let ev; try { ev = this.iface.parseLog(log); } catch { continue; }
        const owner = ev.args.owner;
        if (typeof owner !== "string" || owner.toLowerCase() !== me) continue;
        if (ev.name === "OrderCreated") {
          try {
            const parsedId = BN.from(ev.args.orderId);
            if (parsedId.gt(0) && parsedId.lte(Number.MAX_SAFE_INTEGER.toString())) orderIds.push(parsedId.toNumber());
            else invalidOwnerOrderId = true;
          } catch { invalidOwnerOrderId = true; }
        }
        if (ev.name === "OrdersCanceled" && Array.isArray(ev.args.orderId)) {
          for (const rawId of ev.args.orderId) {
            try {
              const parsedId = BN.from(rawId);
              if (parsedId.gt(0) && parsedId.lte(Number.MAX_SAFE_INTEGER.toString())) canceled.push(parsedId.toNumber());
            } catch { /* malformed cancellation id cannot reconcile a requested order */ }
          }
        }
      }
    }
    const kind = p.kind ?? "quote";
    const hasOrderIdentity = orderIds.length === 1 && !invalidOwnerOrderId;
    const quoteStatus: Quote["status"] = status === 0 ? "reverted" : status === 1 && (kind === "cancel" || hasOrderIdentity) ? "placed" : "lost";
    const quote: Quote = { ...p.quote, txHash: hash, status: quoteStatus, orderId: hasOrderIdentity ? orderIds[0]! : null, gasMon, gasEvidence };
    return { block: p.block, quote, canceled, kind };
  }

  /** Top the margin account up to MARGIN_MON / MARGIN_USDC. Runs once at startup, awaiting each receipt. */
  private async ensureMargin() {
    const w = this.wallet!;
    const baseDec = this.params.baseAssetDecimals.toNumber(), quoteDec = this.params.quoteAssetDecimals.toNumber();
    const [monBal, usdcBal] = await Promise.all([this.marginBalance(ZERO_ADDRESS), this.marginBalance(this.params.quoteAssetAddress)]);
    const mon = Number(ethers.utils.formatUnits(monBal, baseDec)), usdc = Number(ethers.utils.formatUnits(usdcBal, quoteDec));
    const deposit = async (token: string, amount: ethers.BigNumber, native: boolean) => {
      const tx = await w.sendTransaction({
        to: config.marginAccount, nonce: this.nonce++, value: native ? amount : BN.from(0),
        data: this.marginIface.encodeFunctionData("deposit", [w.address, token, amount]),
      });
      await tx.wait(1);
    };
    if (mon < config.marginMon) {
      const amt = ethers.utils.parseUnits((config.marginMon - mon).toFixed(6), baseDec);
      console.log(`margin: depositing ${ethers.utils.formatUnits(amt, baseDec)} MON`);
      await deposit(ZERO_ADDRESS, amt, true);
    }
    if (usdc < config.marginUsdc) {
      const token = new ethers.Contract(this.params.quoteAssetAddress, ERC20_ABI, w);
      const amt = ethers.utils.parseUnits((config.marginUsdc - usdc).toFixed(quoteDec), quoteDec);
      const have: ethers.BigNumber = await token.balanceOf(w.address);
      if (have.lt(amt)) {
        console.warn(`margin: wallet has ${ethers.utils.formatUnits(have, quoteDec)} USDC, wanted to deposit ${ethers.utils.formatUnits(amt, quoteDec)}; depositing what is there`);
      }
      const dep = have.lt(amt) ? have : amt;
      if (dep.gt(0)) {
        const allowance: ethers.BigNumber = await token.allowance(w.address, config.marginAccount);
        if (allowance.lt(dep)) { const tx = await token.approve(config.marginAccount, dep, { nonce: this.nonce++ }); await tx.wait(1); }
        console.log(`margin: depositing ${ethers.utils.formatUnits(dep, quoteDec)} USDC`);
        await deposit(this.params.quoteAssetAddress, dep, false);
      }
    }
    await this.refresh();
    console.log(`margin · ${this.margin.mon.toFixed(2)} MON · ${this.margin.usdc.toFixed(2)} USDC`);
  }

  private async marginBalance(token: string): Promise<ethers.BigNumber> {
    const data = this.marginIface.encodeFunctionData("getBalance", [this.wallet!.address, token]);
    const res = await rpc<string>("eth_call", [{ to: config.marginAccount, data }, "latest"], config.readRpcUrl);
    return BN.from(res);
  }

  /**
   * One eth_estimateGas at startup for a post-only place with no cancels, plus headroom for the one
   * or two cancels a normal block carries, x1.15. Never in the hot loop. Needs margin funds to succeed.
   */
  private async initGasLimit() {
    if (config.gasLimit) { this.gasLimit = BN.from(config.gasLimit); }
    else {
      try {
        const book = await this.readBook();
        const side: Side = this.margin.usdc >= config.tradeSizeMon * book.ask ? "buy" : "sell";
        const data = this.encode(side, config.tradeSizeMon, this.quotePrice(side, book), []);
        const est = await this.provider.estimateGas({ to: config.market, from: this.wallet!.address, data });
        this.gasLimit = est.add(90_000).mul(115).div(100);
      } catch (e) {
        console.warn(`gas estimate failed (${(e as Error).message.slice(0, 120)}); using ${config.gasLimitFallback}`);
      }
    }
    const perBlock = this.gasMon(this.gasLimit, this.feeWei);
    console.log(`gas limit ${this.gasLimit} · maxFee ${config.maxFeeGwei} gwei · priority ${config.priorityFeeGwei} gwei · ~${perBlock.toFixed(4)} MON per block, ~${(perBlock * 12_000).toFixed(0)} MON per hour`);
  }

  private gasMon(limit: ethers.BigNumber, feeWei: ethers.BigNumber) {
    return Number(ethers.utils.formatEther(limit.mul(feeWei)));
  }

  private async resyncNonce() {
    this.nonce = parseInt(await rpc<string>("eth_getTransactionCount", [this.wallet!.address, "latest"]), 16);
  }
}

function parseReceiptStatus(value: unknown): 0 | 1 | null {
  if (value === 0 || value === "0" || (typeof value === "string" && /^0x0+$/i.test(value))) return 0;
  if (value === 1 || value === "1" || (typeof value === "string" && /^0x0*1$/i.test(value))) return 1;
  return null;
}

function isTransactionHash(value: unknown): value is string {
  return typeof value === "string" && /^0x[0-9a-fA-F]{64}$/.test(value);
}

export function formatQuoteGas(value: unknown): string {
  if (value === null || typeof value !== "object") return "unknown gas evidence";
  const quote = value as Record<string, unknown>;
  const evidence = quote.gasEvidence;
  const amount = quote.gasMon;
  const estimate = quote.gasEstimateMon;
  const show = (n: unknown) => typeof n === "number" && Number.isFinite(n) && n >= 0 ? n.toFixed(6) : null;
  if (evidence === "estimate") return show(amount) === null ? "unknown estimate" : `${show(amount)} MON estimate`;
  if (evidence === "pending") return show(estimate) === null ? "receipt pending" : `receipt pending (estimate ${show(estimate)} MON)`;
  if (evidence === "observed") return show(amount) === null ? "unknown observed gas" : `${show(amount)} MON observed`;
  return "unknown gas cost";
}
