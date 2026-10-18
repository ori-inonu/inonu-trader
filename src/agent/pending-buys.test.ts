import { describe, expect, test } from "bun:test";
import { pendingBuys } from "./pending-buys";
import { buildSwapArgs, settlementFor } from "./swap-args";
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

  test("the debit is ALSO kept in the raw units of the coin the order pays in, exactly what the order sends (cut down to six decimals of the coin): a third of 400 dollars sends 133333333 units and the debit is that, not 133.33 rounded to a cent", () => {
    const third = order({ usd: 400 / 3 });
    const p = pendingBuys({ records: [third], book: bookWith([]), nowMs: NOW, settleWindowMs: WINDOW });
    expect(p.rawByChain).toEqual({ "1": 133_333_333n });
    expect(p.byChain["1"]).toBeCloseTo(400 / 3, 12);
    const two = pendingBuys({ records: [third, order({ orderKey: "k2", address: B, candidateId: `buy:token:1:${B}`, usd: 0.004 })], book: bookWith([]), nowMs: NOW, settleWindowMs: WINDOW });
    expect(two.rawByChain).toEqual({ "1": 133_337_333n });
  });

  test("RED of the independent review (18 decimals): a coin with 18 decimals (USDT on BNB Chain) is paid with the amount at the FULL precision of the coin, exactly as `buildSwapArgs` writes it, so the debit of 0.0100001 dollars is 10000100000000000 units and not the six-decimal 10000000000000000", () => {
    const bnb = order({ chainIndex: "56", address: B, candidateId: `buy:token:56:${B}`, usd: 0.0100001 });
    const p = pendingBuys({ records: [bnb], book: bookWith([]), nowMs: NOW, settleWindowMs: WINDOW });
    expect(p.rawByChain).toEqual({ "56": 10_000_100_000_000_000n });
    // the same units the order argument carries
    const args = buildSwapArgs("execute", { ...bnb, wallet: "agente" }, settlementFor(bookWith([]), "56")!, "0x1111111111111111111111111111111111111111");
    expect(args[args.indexOf("--amount") + 1]).toBe("10000100000000000");
  });

  test("a network whose paying coin has no known decimals has a debit in dollars and none in units (nothing is invented), and an amount that is zero after the cut sends nothing", () => {
    const odd = order({ chainIndex: "99999", address: B, candidateId: `buy:token:99999:${B}` });
    const p = pendingBuys({ records: [odd], book: bookWith([]), nowMs: NOW, settleWindowMs: WINDOW });
    expect(p.byChain).toEqual({ "99999": 400 });
    expect(p.rawByChain).toEqual({});
    const dust = pendingBuys({ records: [order({ usd: 0.0000004 })], book: bookWith([]), nowMs: NOW, settleWindowMs: WINDOW });
    expect(dust.rawByChain).toEqual({});
  });

  test("a Solana address is compared as written, an EVM one without regard to case", () => {
    const sol = order({ chainIndex: "501", address: "AbCdEfGhJkLmNpQrStUvWxYz123456789", candidateId: "buy:token:501:AbCdEfGhJkLmNpQrStUvWxYz123456789" });
    expect(pendingBuys({ records: [sol], book: bookWith([]), nowMs: NOW, settleWindowMs: WINDOW }).byChain).toEqual({ "501": 400 });
    const upper = order({ address: A.toUpperCase().replace("0X", "0x") });
    const book = bookWith([held(A, "9")]);
    expect(pendingBuys({ records: [upper], book, nowMs: NOW, settleWindowMs: WINDOW }).byChain).toEqual({});
  });
});
