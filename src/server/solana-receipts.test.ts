import { expect, test } from "bun:test";
import { createSolanaReceiptReader, createSolanaSwapFinder, solanaReceiptEvidence, withSolanaReceiptFallback, type SolanaOrderQuery } from "./solana-receipts";
import type { OrderRecord } from "../agent/ledger";

const signature = "5".repeat(88), wallet = "A".repeat(44), mint = "B".repeat(44);
const binding = { signature, wallet, slot: 10 };
const balance = (amount: string) => ({ owner: wallet, mint, uiTokenAmount: { amount, decimals: 6 } });
const tx = () => ({ slot: 10, transaction: { signatures: [signature], message: { accountKeys: [{ pubkey: wallet, signer: true }] } }, meta: {
  err: null, fee: 5000, preBalances: [100_000], postBalances: [91_000], preTokenBalances: [balance("9007199254740993123")], postTokenBalances: [balance("9007199254741000123")] } });

test("final receipt quantities use exact minor units, and rent/native movement is separate from network fee", () => {
  expect(solanaReceiptEvidence(tx(), binding)).toMatchObject({ status: "success", feeLamports: "5000", nativeDeltaLamports: "-9000", tokenDeltas: [{ mint, decimals: 6, deltaMinor: "7000" }] });
});

test("account balances carry their scope, and a wallet that signed but did not pay the fee is not charged", () => {
  const raw = tx();
  raw.transaction.message.accountKeys.unshift({ pubkey: "C".repeat(44), signer: true });
  raw.meta.preBalances.unshift(6000); raw.meta.postBalances.unshift(1000);
  raw.meta.preTokenBalances[0] = { ...balance("100"), accountIndex: 2 } as any;
  raw.meta.postTokenBalances[0] = { ...balance("130"), accountIndex: 2 } as any;
  raw.transaction.message.accountKeys.push({ pubkey: "D".repeat(44), signer: false });
  expect(solanaReceiptEvidence(raw, binding)).toMatchObject({ walletFeeLamports: "0", affectedTokenBalances: [
    { mint, decimals: 6, beforeMinor: "100", afterMinor: "130", coverage: "transaction_accounts" },
  ] });
});

test("duplicate account indexes or missing indexes never become detailed balance proof", () => {
  expect(solanaReceiptEvidence(tx(), binding)?.affectedTokenBalances).toBeNull();
  const raw = tx();
  raw.meta.preTokenBalances = [{ ...balance("100"), accountIndex: 0 }, { ...balance("100"), accountIndex: 0 }] as any;
  raw.meta.postTokenBalances = [{ ...balance("300"), accountIndex: 0 }] as any;
  expect(solanaReceiptEvidence(raw, binding)?.affectedTokenBalances).toBeNull();
});

test("a token balance whose owner is missing cannot silently become a measured sale or an empty fill", () => {
  const raw = tx(); delete (raw.meta.postTokenBalances[0] as { owner?: string }).owner;
  expect(solanaReceiptEvidence(raw, binding)?.tokenDeltas).toBeNull();
});

test("wrong signature, wallet, slot or absent result cannot prove execution", () => {
  expect(solanaReceiptEvidence(tx(), { ...binding, signature: "6".repeat(88) })).toBeNull();
  expect(solanaReceiptEvidence(tx(), { ...binding, wallet: "C".repeat(44) })).toBeNull();
  expect(solanaReceiptEvidence(tx(), { ...binding, slot: 11 })).toBeNull();
  expect(solanaReceiptEvidence(null, binding)).toBeNull();
});

test("a pending signature only polls status; an outage is unknown, never a failed order", async () => {
  const seen: string[] = [];
  const send = Object.assign(async (_url: unknown, init: any) => {
    const request = JSON.parse(init.body); seen.push(request.method);
    return Response.json({ jsonrpc: "2.0", id: request.id, result: { value: [{ slot: 10, confirmationStatus: "confirmed", err: null }] } });
  }, { preconnect: () => {} });
  expect((await createSolanaReceiptReader({ fetch: send })({ signature, wallet }, new AbortController().signal))?.status).toBe("pending");
  expect(seen).toEqual(["getSignatureStatuses"]);
  const down = Object.assign(async () => { throw new Error("offline"); }, { preconnect: () => {} });
  expect(await createSolanaReceiptReader({ fetch: down })({ signature, wallet }, new AbortController().signal)).toBeNull();
});

test("finalized success is bound to the actual transaction, while contradictory status or metadata stays unknown", async () => {
  for (const error of [null, { InstructionError: [1, "test"] }]) {
    const send = Object.assign(async (_url: unknown, init: any) => {
      const r = JSON.parse(init.body);
      return Response.json({ jsonrpc: "2.0", id: r.id, result: r.method === "getSignatureStatuses" ? { value: [{ slot: 10, confirmationStatus: "finalized", err: error }] } : tx() });
    }, { preconnect: () => {} });
    const result = await createSolanaReceiptReader({ fetch: send })({ signature, wallet }, new AbortController().signal);
    expect(result?.status ?? null).toBe(error === null ? "success" : null);
  }
});

test("provider outage or delayed indexing can use the exact chain receipt, while a missing hash or abort never guesses one", async () => {
  let reads = 0;
  const read = async () => { reads++; return solanaReceiptEvidence(tx(), binding); };
  const order = { chainIndex: "501", ref: signature } as OrderRecord;
  const fallback = withSolanaReceiptFallback(async () => { throw new Error("provider_offline"); }, read, () => wallet);
  expect(await fallback(order, new AbortController().signal)).toBe("success");
  expect(await fallback({ ...order, ref: null }, new AbortController().signal)).toBeNull();
  const cancelled = new AbortController(); cancelled.abort();
  expect(await fallback(order, cancelled.signal)).toBeNull();
  expect(reads).toBe(1);
});

// ---- finding the transaction of an order that never carried a reference (read only, exact binding, one match)
const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const SOLD = mint; // the token of the order
const sigOf = (n: number) => String(n).repeat(88).slice(0, 88);
const swap = (n: number, moves: Record<string, { pre: string; post: string; decimals: number }>, over: { err?: unknown; blockTime?: number } = {}) => ({
  sig: { signature: sigOf(n), slot: 100 + n, err: over.err ?? null, blockTime: over.blockTime ?? 1_000_000, confirmationStatus: "finalized" },
  tx: { slot: 100 + n, transaction: { signatures: [sigOf(n)], message: { accountKeys: [{ pubkey: wallet, signer: true }] } }, meta: { err: over.err ?? null, fee: 5000, preBalances: [10_000], postBalances: [5_000],
    preTokenBalances: Object.entries(moves).map(([m, v]) => ({ owner: wallet, mint: m, uiTokenAmount: { amount: v.pre, decimals: v.decimals } })),
    postTokenBalances: Object.entries(moves).map(([m, v]) => ({ owner: wallet, mint: m, uiTokenAmount: { amount: v.post, decimals: v.decimals } })) } },
});
const rpcOf = (txs: ReturnType<typeof swap>[], calls: string[] = []) => Object.assign(async (_url: unknown, init: any) => {
  const r = JSON.parse(init.body); calls.push(r.method);
  if (r.method === "getSignaturesForAddress") return Response.json({ jsonrpc: "2.0", id: r.id, result: txs.map((t) => t.sig) });
  if (r.method === "getTransaction") return Response.json({ jsonrpc: "2.0", id: r.id, result: txs.find((t) => t.sig.signature === r.params[0])?.tx ?? null });
  return Response.json({ jsonrpc: "2.0", id: r.id, error: { code: -32601 } });
}, { preconnect: () => {} });
const sale = (n: number, amount = "29000000", over = {}) => swap(n, { [SOLD]: { pre: "100000000", post: String(100_000_000 - Number(amount)), decimals: 6 }, [USDC]: { pre: "1000000", post: "30000000", decimals: 6 } }, over);
const query: SolanaOrderQuery = { wallet, sinceMs: 1_000_000_000 - 30_000, side: "sell", mint: SOLD, amountMinor: "29000000", usd: 29 };
const find = (txs: ReturnType<typeof swap>[], q = query, calls: string[] = []) => createSolanaSwapFinder({ fetch: rpcOf(txs, calls) })(q, new AbortController().signal);

test("the sale of an order that never had a signature is found by what only it could have done: the wallet's own transaction that took exactly that amount of that token out", async () => {
  const found = await find([sale(1), swap(2, { [USDC]: { pre: "1", post: "5", decimals: 6 } })]);
  expect(found?.signature).toBe(sigOf(1));
});

test("two transactions that fit are ambiguous, and nothing is picked: the person's word stays the way out", async () => {
  expect(await find([sale(1), sale(2)])).toBeNull();
});

test("a transaction before the order, one that failed, one of another amount and one of another token are not the order", async () => {
  expect(await find([sale(1, "29000000", { blockTime: 100 })])).toBeNull();
  expect(await find([sale(1, "29000000", { err: { InstructionError: [0, "x"] } })])).toBeNull();
  expect(await find([sale(1, "26000000")])).toBeNull();
  expect(await find([swap(1, { [USDC]: { pre: "1000000", post: "0", decimals: 6 }, ["C".repeat(44)]: { pre: "0", post: "5", decimals: 6 } })])).toBeNull();
});

test("a purchase is found by the token that came in and about the dollars of stablecoin that went out, nothing else", async () => {
  const buy = swap(3, { [SOLD]: { pre: "0", post: "110000000", decimals: 6 }, [USDC]: { pre: "85000000", post: "73000000", decimals: 6 } });
  const q: SolanaOrderQuery = { ...query, side: "buy", amountMinor: null, usd: 12 };
  expect((await find([buy], q))?.signature).toBe(sigOf(3));
  // the dollars that left are not the dollars of the order
  expect(await find([buy], { ...q, usd: 40 })).toBeNull();
  // a token that came in for no stablecoin is not a purchase of the order
  expect(await find([swap(4, { [SOLD]: { pre: "0", post: "5", decimals: 6 } })], q)).toBeNull();
});

test("a sale with no amount on the order cannot be bound, and an outage is unknown, never a find", async () => {
  expect(await find([sale(1)], { ...query, amountMinor: null })).toBeNull();
  const down = Object.assign(async () => { throw new Error("offline"); }, { preconnect: () => {} });
  expect(await createSolanaSwapFinder({ fetch: down })(query, new AbortController().signal)).toBeNull();
  const aborted = new AbortController(); aborted.abort();
  expect(await createSolanaSwapFinder({ fetch: rpcOf([sale(1)]) })(query, aborted.signal)).toBeNull();
});

test("the finder only reads: it asks for signatures and transactions and nothing that sends", async () => {
  const calls: string[] = [];
  await find([sale(1)], query, calls);
  expect([...new Set(calls)].sort()).toEqual(["getSignaturesForAddress", "getTransaction"]);
});
