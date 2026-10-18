import { expect, test } from "bun:test";
import { createSolanaSwapFinder, type SolanaOrderQuery } from "../server/solana-receipts";

// origin: synthetic_fixture. Fake finalized RPC replies, no real wallet or network.
const wallet = "B".repeat(44), mint = "A".repeat(44), stable = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const query: SolanaOrderQuery = { wallet, mint, side: "sell", amountMinor: "29000000", usd: 29, sinceMs: 999_970_000 };
function transaction(n: number, matches: boolean) {
  const signature = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"[n - 1]!.repeat(88), slot = n + 100;
  const balances = (after: boolean) => [{ owner: wallet, mint, uiTokenAmount: { amount: after && matches ? "71000000" : "100000000", decimals: 6 } },
    { owner: wallet, mint: stable, uiTokenAmount: { amount: after ? "30000000" : "1000000", decimals: 6 } }];
  return { entry: { signature, slot, err: null, blockTime: 1_000_000 }, tx: { slot, transaction: { signatures: [signature], message: { accountKeys: [{ pubkey: wallet, signer: true }] } },
    meta: { err: null, fee: 5000, preBalances: [10000], postBalances: [5000], preTokenBalances: balances(false), postTokenBalances: balances(true) } } };
}
function reader(items: ReturnType<typeof transaction>[], unavailable?: number) {
  const fetch = Object.assign(async (_url: unknown, init: any) => {
    const r = JSON.parse(init.body);
    const result = r.method === "getSignaturesForAddress" ? items.map(t => t.entry) : items.find((t, i) => i !== unavailable && t.entry.signature === r.params[0])?.tx ?? null;
    return Response.json({ jsonrpc: "2.0", id: r.id, result });
  }, { preconnect: () => {} });
  return createSolanaSwapFinder({ fetch });
}

test("a matching ninth transaction cannot disappear from the uniqueness proof after eight candidates", async () => {
  const items = Array.from({ length: 9 }, (_, i) => transaction(i + 1, i === 0 || i === 8));
  expect(await reader(items)(query, new AbortController().signal)).toBeNull();
});

test("an unreadable candidate leaves uniqueness unknown instead of confirming the only readable match", async () => {
  expect(await reader([transaction(1, true), transaction(2, true)], 1)(query, new AbortController().signal)).toBeNull();
});

test("a full signatures page still inside the order window cannot prove that older unlisted matches do not exist", async () => {
  const items = Array.from({ length: 20 }, (_, i) => transaction(i + 1, i === 0));
  for (const item of items.slice(1)) (item.entry as { err: unknown }).err = { InstructionError: [0, "synthetic"] };
  expect(await reader(items)(query, new AbortController().signal)).toBeNull();
});
