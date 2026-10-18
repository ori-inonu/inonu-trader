import { expect, test } from "bun:test";
import { auditExecutions, selectOrders, refreshReceiptCache, emptyReceiptCache, receiptCacheKey, parseReceiptCache } from "./executions";
import type { SolanaReceiptEvidence } from "../server/solana-receipts";

const wallet = "A".repeat(44), mint = "B".repeat(44), quote = "C".repeat(44);
const signature = (n: number) => String(n).repeat(88);
const order = (key: string, side: "buy" | "sell", n: number, extra = {}) => ({ kind: "order", orderKey: key, cycleId: "cycle" + n,
  atMs: n * 1000, stage: "executada", chainIndex: "501", wallet: "agente", address: mint, side, source: "modelo", ref: signature(n),
  balanceBeforeMinor: side === "buy" ? "0" : "110", amountMinor: side === "buy" ? null : "110", ...extra });
const receipt = (token: string, cash: string, extra = {}): SolanaReceiptEvidence => ({ status: "success", slot: token.startsWith("-") ? 11 : 10,
  blockTimeMs: 1000, feeLamports: "5000", walletFeeLamports: "5000", nativeDeltaLamports: "-9000",
  tokenDeltas: [{ mint, decimals: 9, deltaMinor: token }, { mint: quote, decimals: 6, deltaMinor: cash }],
  affectedTokenBalances: [{ mint, decimals: 9, beforeMinor: token[0] === "-" ? token.slice(1) : "0", afterMinor: token[0] === "-" ? "0" : token, coverage: "transaction_accounts" },
    { mint: quote, decimals: 6, beforeMinor: "12000000", afterMinor: (12000000n + BigInt(cash)).toString(), coverage: "transaction_accounts" }], ...extra });
const selected = (rows: unknown[]) => selectOrders(rows, "agente");
const run = (rows: unknown[], receipts: [string, SolanaReceiptEvidence][], complete = true) => auditExecutions(selected(rows), new Map(receipts), complete);

test("exact bought and sold quantities produce cash flow in their own currency, with SOL separate and net USD unknown", () => {
  const r = run([order("buy", "buy", 1), order("sell", "sell", 2)], [["buy", receipt("110", "-12000000")], ["sell", receipt("-110", "11947276", { blockTimeMs: 2000 })]]);
  expect(r.roundTrips).toHaveLength(1);
  expect(r.roundTrips[0]).toMatchObject({ quoteMint: quote, quoteDecimals: 6, cashFlowMinor: "-52724", cashFlow: "-0.052724",
    walletFeeLamports: "10000", nativeDeltaLamports: "-18000", nativeExcludingNetworkFeeLamports: "-8000", netUsd: null, basis: "ledger_zero_before_buy" });
});

test("a sale of an older holding is cash received, never invented profit; matching symbols cannot pair distinct mints", () => {
  const sale = run([order("sell", "sell", 2)], [["sell", receipt("-110", "11947276")]]);
  expect(sale.roundTrips).toHaveLength(0);
  expect(sale.orders[0]).toMatchObject({ cash: { deltaMinor: "11947276" }, outcome: "sale_without_matched_entry", netUsd: null });
  const other = run([order("buy", "buy", 1, { address: "D".repeat(44) }), order("sell", "sell", 2)], [["buy", receipt("110", "-12000000")], ["sell", receipt("-110", "11947276")]]);
  expect(other.roundTrips).toHaveLength(0);
});

test("one signature claimed by two orders, or two signatures on one order, proves no attributable fill", () => {
  const duplicate = selected([order("x", "buy", 1), order("y", "buy", 1)]);
  expect(duplicate.orders.every(o => o.issue === "signature_shared_by_orders")).toBe(true);
  const ambiguous = selected([order("x", "buy", 1), order("x", "buy", 1, { ref: signature(2) })]);
  expect(ambiguous.orders[0]?.issue).toBe("multiple_signatures_for_order");
});

test("a later receipt belongs only to its order; historical failure of another attempt does not contaminate it", () => {
  const r = selected([order("failed", "sell", 1, { ref: null, stage: "falhou" }), order("done", "sell", 2, { ref: null, stage: "incerta" }), order("done", "sell", 2)]);
  expect(r.orders.find(o => o.orderKey === "done")).toMatchObject({ signature: signature(2), issue: null });
  expect(r.orders.find(o => o.orderKey === "failed")).toMatchObject({ signature: null, issue: "no_recorded_signature" });
});

test("partial sale, intervening uncertain order, unknown opening basis or different cash currency never masquerade as a complete round trip", () => {
  const buy = order("buy", "buy", 1), sell = order("sell", "sell", 3);
  for (const [rows, details] of [
    [[buy, { ...sell, amountMinor: "100" }], [["buy", receipt("110", "-12000000")], ["sell", receipt("-100", "10000000", { blockTimeMs: 3000 })]]],
    [[{ ...buy, balanceBeforeMinor: null }, sell], [["buy", receipt("110", "-12000000")], ["sell", receipt("-110", "11947276", { blockTimeMs: 3000 })]]],
    [[buy, order("unknown", "sell", 2, { ref: null, stage: "incerta" }), sell], [["buy", receipt("110", "-12000000")], ["sell", receipt("-110", "11947276", { blockTimeMs: 3000 })]]],
  ] as [unknown[], [string, SolanaReceiptEvidence][]][]) expect(run(rows, details).roundTrips).toHaveLength(0);
  expect(run([buy, sell], [["buy", receipt("110", "-12000000")], ["sell", receipt("-110", "11947276", { blockTimeMs: 3000 })]], false).roundTrips).toHaveLength(0);
  const alternate = receipt("-110", "11947276", { blockTimeMs: 3000 });
  const different = { ...alternate, tokenDeltas: alternate.tokenDeltas!.map(d => d.mint === quote ? { ...d, mint: "D".repeat(44) } : d),
    affectedTokenBalances: alternate.affectedTokenBalances!.map(d => d.mint === quote ? { ...d, mint: "D".repeat(44) } : d) };
  expect(run([buy, sell], [["buy", receipt("110", "-12000000")], ["sell", different]]).roundTrips).toHaveLength(0);
});

test("missing token account proof, wrong sale amount, extra token movement and failed chain transaction are not completed fills", () => {
  const sell = order("sell", "sell", 2);
  for (const e of [receipt("-110", "11947276", { affectedTokenBalances: null }), receipt("-100", "11947276"),
    receipt("-110", "11947276", { tokenDeltas: [...receipt("-110", "11947276").tokenDeltas!, { mint: "D".repeat(44), decimals: 1, deltaMinor: "1" }] }),
    receipt("-110", "11947276", { status: "failed" })]) expect(run([sell], [["sell", e]]).orders[0]?.fill).toBeNull();
});

test("a large integer amount is exact and a sponsored fee is zero only when explicitly proved", () => {
  const quantity = "9007199254740993123";
  const r = run([order("buy", "buy", 1), order("sell", "sell", 2, { amountMinor: quantity, balanceBeforeMinor: quantity })],
    [["buy", receipt(quantity, "-12000000", { walletFeeLamports: "0" })], ["sell", receipt("-" + quantity, "11947276", { blockTimeMs: 2000, walletFeeLamports: null })]]);
  expect(r.roundTrips[0]?.quantityMinor).toBe(quantity);
  expect(r.roundTrips[0]?.walletFeeLamports).toBeNull();
  expect(r.roundTrips[0]?.nativeExcludingNetworkFeeLamports).toBeNull();
});

test("receipt refresh is bounded, exact signature/wallet/version scoped, pending retried, final success cached", async () => {
  const orders = selected([order("one", "buy", 1), order("two", "sell", 2)]).orders;
  let calls = 0;
  const read = async (binding: { wallet: string; signature: string }) => { calls++; expect(binding.wallet).toBe(wallet); return binding.signature === signature(1) ? receipt("110", "-12000000") : null; };
  const a = await refreshReceiptCache(orders, wallet, emptyReceiptCache(), read, 100_000, 1);
  expect(a.lookups).toBe(1);
  const b = await refreshReceiptCache(orders, wallet, a.cache, read, 100_001, 1);
  expect(b.lookups).toBe(1); // unqueried older order must not starve behind an unavailable latest one
  const c = await refreshReceiptCache(orders, wallet, b.cache, read, 100_002, 4);
  expect(c.lookups).toBe(0); expect(calls).toBe(2);
  expect(receiptCacheKey(wallet, signature(1))).not.toBe(receiptCacheKey("D".repeat(44), signature(1)));
  expect(parseReceiptCache(a.cache)).not.toBeNull();
  expect(parseReceiptCache({ ...a.cache, version: 99 })).toBeNull();
});

test("pending receipts are retried after their cooldown and outages do not become failed transactions", async () => {
  const orders = selected([order("one", "buy", 1)]).orders;
  const pending = { ...receipt("110", "-12000000"), status: "pending" as const };
  const a = await refreshReceiptCache(orders, wallet, emptyReceiptCache(), async () => pending, 100_000);
  const b = await refreshReceiptCache(orders, wallet, a.cache, async () => { throw new Error("offline"); }, 160_000);
  expect(b.lookups).toBe(1); expect(b.evidence.size).toBe(0);
  expect(auditExecutions({ orders: [...orders], invalidOrderRows: 0 }, b.evidence, true).orders[0]?.status).toBe("unknown");
  const modified = structuredClone(a.cache); const key = Object.keys(modified.entries)[0]!; modified.entries[key]!.signature = signature(2);
  expect(parseReceiptCache(modified)).toBeNull();
});
