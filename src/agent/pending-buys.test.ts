import { describe, expect, test } from "bun:test";
import { pendingBuys } from "./pending-buys";
import type { OrderRecord } from "./ledger";
import type { Book, Position } from "./types";

const A = "0x1111111111111111111111111111111111111111";
const B = "0x2222222222222222222222222222222222222222";
const NOW = 10_000_000;
const WINDOW = 15 * 60_000;

const order = (over: Partial<OrderRecord> = {}): OrderRecord => ({ kind: "order", cycleId: "cy1", atMs: NOW - 60_000, orderKey: "cy1:buy:A", stage: "incerta", candidateId: `buy:token:1:${A}`, side: "buy", stance: "buy_full", chainIndex: "1", symbol: "AAA", address: A, wallet: "agente", usd: 400, amountMinor: null, ref: "0xhash", reason: "transmitida", profile: "alvo_10", source: "modelo", balanceBeforeMinor: "0", ...over });
const held = (address: string, balanceMinor: string | null): Position => ({ id: `token:1:${address}`, chainIndex: "1", address, symbol: "X", wallet: "agente", usd: 10, balanceMinor, decimals: 18, isCash: false });
const bookWith = (positions: Position[]): Book => ({ observedAtMs: NOW - 5_000, positions, cashByChain: { "1": 400 }, totalUsd: 400, agentUsd: 400 });

describe("the purchases the wallet does not show yet", () => {
  test("a purchase that was sent and has no answer is pending: its dollars come off the cash of its network and its token is not offered again, until the wallet holds more of the token than it did before", () => {
    const p = pendingBuys({ records: [order()], book: bookWith([]), nowMs: NOW, settleWindowMs: WINDOW });
    expect(p.byChain).toEqual({ "1": 400 });
    expect([...p.tokens]).toEqual([`1:${A}`]);
    // the wallet now holds the token: the cash it shows already lost those dollars
    const shown = pendingBuys({ records: [order()], book: bookWith([held(A, "5")]), nowMs: NOW, settleWindowMs: WINDOW });
    expect(shown.byChain).toEqual({});
    expect(shown.tokens.size).toBe(0);
  });

  test("a purchase confirmed a moment ago counts while the wallet has not caught up, and stops counting when it has or when the window is over", () => {
    const done = order({ stage: "executada", reason: "recibo_sucesso", atMs: NOW - 2 * 60_000 });
    expect(pendingBuys({ records: [done], book: bookWith([]), nowMs: NOW, settleWindowMs: WINDOW }).byChain).toEqual({ "1": 400 });
    expect(pendingBuys({ records: [done], book: bookWith([held(A, "3")]), nowMs: NOW, settleWindowMs: WINDOW }).byChain).toEqual({});
    const old = order({ stage: "executada", reason: "recibo_sucesso", atMs: NOW - 30 * 60_000 });
    expect(pendingBuys({ records: [old], book: bookWith([]), nowMs: NOW, settleWindowMs: WINDOW }).byChain).toEqual({});
  });

  test("an order still in flight counts however old it is: only the answer or the wallet frees it", () => {
    const stuck = order({ stage: "enviando", reason: null, atMs: NOW - 3 * 3_600_000 });
    expect(pendingBuys({ records: [stuck], book: bookWith([]), nowMs: NOW, settleWindowMs: WINDOW }).byChain).toEqual({ "1": 400 });
  });

  test("a balance before the order that is unknown cannot prove the wallet caught up, so the purchase stays pending; a failed order, a sale and the principal wallet never count", () => {
    const unknown = order({ balanceBeforeMinor: null });
    expect(pendingBuys({ records: [unknown], book: bookWith([held(A, "5")]), nowMs: NOW, settleWindowMs: WINDOW }).byChain).toEqual({ "1": 400 });
    const rest = [order({ stage: "falhou", reason: "simulacao_falhou", orderKey: "k2" }), order({ side: "sell", orderKey: "k3" }), order({ wallet: "principal", orderKey: "k4" }), order({ stage: "preparada", orderKey: "k5" })];
    expect(pendingBuys({ records: rest, book: bookWith([]), nowMs: NOW, settleWindowMs: WINDOW }).byChain).toEqual({});
  });

  test("two pending purchases on one network add up, and each token is kept apart", () => {
    const two = [order(), order({ orderKey: "cy1:buy:B", address: B, candidateId: `buy:token:1:${B}`, usd: 25.5 })];
    const p = pendingBuys({ records: two, book: bookWith([]), nowMs: NOW, settleWindowMs: WINDOW });
    expect(p.byChain).toEqual({ "1": 425.5 });
    expect([...p.tokens].sort()).toEqual([`1:${A}`, `1:${B}`]);
  });

  test("a Solana address is compared as written, an EVM one without regard to case", () => {
    const sol = order({ chainIndex: "501", address: "AbCdEfGhJkLmNpQrStUvWxYz123456789", candidateId: "buy:token:501:AbCdEfGhJkLmNpQrStUvWxYz123456789" });
    expect(pendingBuys({ records: [sol], book: bookWith([]), nowMs: NOW, settleWindowMs: WINDOW }).byChain).toEqual({ "501": 400 });
    const upper = order({ address: A.toUpperCase().replace("0X", "0x") });
    const book = bookWith([held(A, "9")]);
    expect(pendingBuys({ records: [upper], book, nowMs: NOW, settleWindowMs: WINDOW }).byChain).toEqual({});
  });
});
