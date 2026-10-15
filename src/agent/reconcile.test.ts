import { describe, expect, test } from "bun:test";
import type { OrderRecord } from "./ledger";
import { LOOKUP_EVERY_MS, MAX_LOOKUPS_PER_PASS, newReconcileMemory, settleByReceipts, type ReceiptLookup, type RefRecovery } from "./reconcile";
import type { ReceiptStatus } from "./receipt";

const NOW = 10_000_000_000;
const signal = new AbortController().signal;
const order = (over: Partial<OrderRecord> = {}): OrderRecord => ({
  kind: "order",
  cycleId: "c1",
  atMs: NOW - 4 * 60_000,
  orderKey: "c1:a",
  stage: "incerta",
  candidateId: "a",
  side: "buy",
  stance: "buy_third",
  chainIndex: "501",
  symbol: "X",
  address: "EZ7RFLpHv14NK8b6wQuRefLvspYTy1TFpj5756TKpump",
  wallet: "agente",
  usd: 12,
  amountMinor: null,
  ref: "5Ksig11111111111111",
  reason: "recusa_sem_prova",
  profile: "alvo_5",
  source: "modelo",
  balanceBeforeMinor: "0",
  ...over,
});
const lookupOf = (answer: (o: OrderRecord) => ReceiptStatus | null): ReceiptLookup => async (o) => answer(o);

describe("an order in flight is settled by a receipt of the tool's own history, and by nothing else", () => {
  test("SUCCESS means it went out, ERROR or CANCELLED that it did not, PENDING and nothing at all that we wait", async () => {
    const memory = newReconcileMemory();
    const orders = [order({ orderKey: "ok" }), order({ orderKey: "bad" }), order({ orderKey: "wait" }), order({ orderKey: "none" })];
    const verdict: Record<string, ReceiptStatus | null> = { ok: "success", bad: "failed", wait: "pending", none: null };
    const out = await settleByReceipts(orders, lookupOf((o) => verdict[o.orderKey]!), NOW, memory, signal);
    expect(out).toEqual([
      { orderKey: "ok", outcome: "executada", reason: "recibo_sucesso" },
      { orderKey: "bad", outcome: "falhou", reason: "recibo_erro" },
    ]);
  });

  test("a clock and a balance prove nothing: however old the order and whatever the wallet shows, without a receipt it stays in flight", async () => {
    const memory = newReconcileMemory();
    const ancient = order({ atMs: NOW - 30 * 24 * 3_600_000 });
    expect(await settleByReceipts([ancient], lookupOf(() => null), NOW, memory, signal)).toEqual([]);
  });

  test("only what is in flight, and only the agent's own wallet, is looked up", async () => {
    const asked: string[] = [];
    const lookup: ReceiptLookup = async (o) => (asked.push(o.orderKey), "success");
    await settleByReceipts([order({ orderKey: "a", stage: "executada" }), order({ orderKey: "b", stage: "preparada" }), order({ orderKey: "c", wallet: "principal" }), order({ orderKey: "d", stage: "enviando" }), order({ orderKey: "e" })], lookup, NOW, newReconcileMemory(), signal);
    expect(asked).toEqual(["d", "e"]);
  });

  test("the same order is asked about once a minute, not at every look, and a pass asks about a few at most", async () => {
    const memory = newReconcileMemory();
    let asked = 0;
    const lookup: ReceiptLookup = async () => (asked++, null);
    await settleByReceipts([order()], lookup, NOW, memory, signal);
    await settleByReceipts([order()], lookup, NOW + LOOKUP_EVERY_MS - 1, memory, signal);
    expect(asked).toBe(1);
    await settleByReceipts([order()], lookup, NOW + LOOKUP_EVERY_MS, memory, signal);
    expect(asked).toBe(2);
    asked = 0;
    const many = Array.from({ length: MAX_LOOKUPS_PER_PASS + 4 }, (_, i) => order({ orderKey: `k${i}` }));
    await settleByReceipts(many, lookup, NOW + 10 * LOOKUP_EVERY_MS, memory, signal);
    expect(asked).toBe(MAX_LOOKUPS_PER_PASS);
    // the ones left over are asked about in the next pass
    await settleByReceipts(many, lookup, NOW + 20 * LOOKUP_EVERY_MS, memory, signal);
    expect(asked).toBeGreaterThan(MAX_LOOKUPS_PER_PASS);
  });

  test("a lookup that throws, or a stop that comes in the middle, settles nothing and spoils nothing", async () => {
    const boom: ReceiptLookup = async () => {
      throw new Error("tool down");
    };
    expect(await settleByReceipts([order()], boom, NOW, newReconcileMemory(), signal)).toEqual([]);
    const ac = new AbortController();
    ac.abort();
    let asked = 0;
    expect(await settleByReceipts([order()], async () => (asked++, "success"), NOW, newReconcileMemory(), ac.signal)).toEqual([]);
    expect(asked).toBe(0);
  });
});

describe("an order the tool refused without proof and that never carried a reference is looked for on the chain by what only it could have done, and settled only on one exact match", () => {
  const SIG = "5".repeat(88);
  const found = (sig: string | null): RefRecovery => async () => (sig === null ? null : { ref: sig });

  test("a match settles it as executed with the reference it found, and it is never sent again", async () => {
    const out = await settleByReceipts([order({ orderKey: "lost", ref: null })], lookupOf(() => null), NOW, newReconcileMemory(), signal, found(SIG));
    expect(out).toEqual([{ orderKey: "lost", outcome: "executada", reason: "recibo_recuperado", ref: SIG }]);
  });

  test("no match, or a recovery that fails, leaves it in flight: the person's word stays the way out", async () => {
    expect(await settleByReceipts([order({ orderKey: "a", ref: null })], lookupOf(() => null), NOW, newReconcileMemory(), signal, found(null))).toEqual([]);
    const throwing: RefRecovery = async () => { throw new Error("rpc down"); };
    expect(await settleByReceipts([order({ orderKey: "b", ref: null })], lookupOf(() => null), NOW, newReconcileMemory(), signal, throwing)).toEqual([]);
  });

  test("an order that has its reference is looked up by it, and the recovery is not asked about it", async () => {
    let asked = 0;
    const recover: RefRecovery = async () => (asked++, { ref: SIG });
    const out = await settleByReceipts([order({ orderKey: "has" })], lookupOf(() => "success"), NOW, newReconcileMemory(), signal, recover);
    expect(out).toEqual([{ orderKey: "has", outcome: "executada", reason: "recibo_sucesso" }]);
    expect(asked).toBe(0);
  });

  test("only the agent's own orders in flight are looked for, and the same order is not looked for again within the pause", async () => {
    let asked = 0;
    const recover: RefRecovery = async () => (asked++, null);
    const memory = newReconcileMemory();
    const list = [order({ orderKey: "p", ref: null, wallet: "principal" }), order({ orderKey: "d", ref: null, stage: "executada" }), order({ orderKey: "own", ref: null })];
    await settleByReceipts(list, lookupOf(() => null), NOW, memory, signal, recover);
    await settleByReceipts(list, lookupOf(() => null), NOW + 1000, memory, signal, recover);
    expect(asked).toBe(1);
  });
});
