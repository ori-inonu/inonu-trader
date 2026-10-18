/** Funded spot account. Expenses retain the USD mark at the time charged. */
export class SpotLedger {
  cashUsd: number;
  mon: number;
  feeUsd = 0;
  gasUsd = 0;
  aiUsd = 0;
  private peak: number;
  private drawdown = 0;
  constructor(readonly bankrollUsd: number, initialMon: number, initialMid: number, readonly makerFeeBps: number) {
    this.mon = initialMon; this.cashUsd = bankrollUsd - initialMon * initialMid; this.peak = bankrollUsd;
    if (![bankrollUsd, initialMon, initialMid, makerFeeBps].every(Number.isFinite) || bankrollUsd <= 0 || initialMon < 0 || initialMid <= 0 || makerFeeBps < 0 || this.cashUsd < 0) throw new Error("Invalid funded spot account");
  }
  canFill(side: "buy" | "sell", size: number, price: number) {
    if (!Number.isFinite(size) || size <= 0 || !Number.isFinite(price) || price <= 0) return false;
    return side === "buy" ? size * price * (1 + this.makerFeeBps / 10000) <= this.cashUsd - this.gasUsd - this.aiUsd + 1e-9 : size <= this.mon + 1e-9;
  }
  fill(side: "buy" | "sell", size: number, price: number) {
    if (!this.canFill(side, size, price)) throw new Error("Unfunded spot fill");
    const value = size * price, fee = value * this.makerFeeBps / 10000;
    this.mon += side === "buy" ? size : -size;
    this.cashUsd += (side === "buy" ? -value : value) - fee;
    this.feeUsd += fee;
  }
  charge(kind: "gas" | "ai", usd: number) {
    if (!Number.isFinite(usd) || usd < 0) throw new Error("Invalid expense");
    if (kind === "gas") this.gasUsd += usd; else this.aiUsd += usd;
  }
  snapshot(mid: number) {
    if (!Number.isFinite(mid) || mid <= 0) throw new Error("Invalid mark");
    const equityUsd = this.cashUsd + this.mon * mid - this.gasUsd - this.aiUsd;
    this.peak = Math.max(this.peak, equityUsd); this.drawdown = Math.max(this.drawdown, this.peak - equityUsd);
    return { equityUsd, pnlUsd: equityUsd - this.bankrollUsd, maxDrawdownUsd: this.drawdown, cashUsd: this.cashUsd, mon: this.mon, feeUsd: this.feeUsd, gasUsd: this.gasUsd, aiUsd: this.aiUsd };
  }
}
