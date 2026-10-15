import { describe, expect, test } from "bun:test";
import { applyCaps, capRaised, splitToPolicy, validateCaps, DEFAULT_CAPS, gate, HARD_CAPS, MAX_BOOK_AGE_MS, MAX_CLOCK_SKEW_MS, type GateInputs, type PolicyMirror } from "./gate";
import type { PlannedOrder } from "./types";

const NOW = 10_000_000;
const policy: PolicyMirror = { perTxUsd: 50, dailyTradeUsd: 200, dailyTransferUsd: 0, transferGuarded: true };
const base = (over: Partial<GateInputs> = {}): GateInputs => ({
  state: { mode: "sombra", stopped: false },
  stopFilePresent: false,
  clockSkewMs: 100,
  bookAgeMs: 1000,
  ledger: { ok: true },
  plans: { ok: true },
  limited: null,
  ...over,
});
const limited = (over: Partial<NonNullable<GateInputs["limited"]>> = {}): GateInputs["limited"] => ({ policy, sessionExpiresAtMs: NOW + 3_600_000, nowMs: NOW, cycleBudgetMs: 120_000, addressMatches: true, binaryOk: true, localSkewMs: 100, ...over });

describe("the gate of a cycle fails closed", () => {
  test("a healthy shadow cycle passes", () => {
    expect(gate(base())).toEqual({ ok: true });
  });

  test("off and stopped never pass, and say which", () => {
    expect(gate(base({ state: { mode: "desligado", stopped: false } }))).toEqual({ ok: false, reason: "desligado" });
    expect(gate(base({ state: { mode: "desligado", stopped: true } }))).toEqual({ ok: false, reason: "parado" });
    expect(gate(base({ state: { mode: "sombra", stopped: true } }))).toEqual({ ok: false, reason: "parado" });
  });

  test("the STOP file wins over any mode", () => {
    expect(gate(base({ state: { mode: "limitado", stopped: false }, stopFilePresent: true, limited: limited() }))).toEqual({ ok: false, reason: "arquivo_stop" });
  });

  test("the clock: unknown or skewed beyond the margin blocks", () => {
    expect(gate(base({ clockSkewMs: null }))).toEqual({ ok: false, reason: "relogio" });
    expect(gate(base({ clockSkewMs: MAX_CLOCK_SKEW_MS + 1 }))).toEqual({ ok: false, reason: "relogio" });
    expect(gate(base({ clockSkewMs: -(MAX_CLOCK_SKEW_MS + 1) }))).toEqual({ ok: false, reason: "relogio" });
    expect(gate(base({ clockSkewMs: MAX_CLOCK_SKEW_MS })).ok).toBe(true);
  });

  test("the wallet reading: unknown, old or from the future blocks", () => {
    expect(gate(base({ bookAgeMs: null }))).toEqual({ ok: false, reason: "carteira_antiga" });
    expect(gate(base({ bookAgeMs: MAX_BOOK_AGE_MS + 1 }))).toEqual({ ok: false, reason: "carteira_antiga" });
    expect(gate(base({ bookAgeMs: -10_000 }))).toEqual({ ok: false, reason: "carteira_antiga" });
  });

  test("an unhealthy ledger blocks (an order in flight is the cycle's business: it must not stop the stops of other tokens)", () => {
    expect(gate(base({ ledger: { ok: false, reason: "ledger_corrompido" } }))).toEqual({ ok: false, reason: "ledger_corrompido" });
  });
});

describe("the gate of the mode that moves money", () => {
  const live = (over: Partial<NonNullable<GateInputs["limited"]>> = {}) => base({ state: { mode: "limitado", stopped: false }, limited: limited(over) });

  test("everything in order passes", () => {
    expect(gate(live())).toEqual({ ok: true });
  });

  test("without the account facts it does not pass: they are required, not assumed", () => {
    expect(gate(base({ state: { mode: "limitado", stopped: false }, limited: null }))).toEqual({ ok: false, reason: "conta_ilegivel" });
  });

  test("by default the owner's policy is the backstop: absent, partial or looser than the hard ceilings blocks", () => {
    expect(gate(live({ policy: null }))).toEqual({ ok: false, reason: "politica_ausente" });
    expect(gate(live({ policy: { ...policy, perTxUsd: null } }))).toEqual({ ok: false, reason: "politica_ausente" });
    expect(gate(live({ policy: { ...policy, dailyTradeUsd: null } }))).toEqual({ ok: false, reason: "politica_ausente" });
    expect(gate(live({ policy: { ...policy, transferGuarded: false } }))).toEqual({ ok: false, reason: "politica_ausente" });
    expect(gate(live({ policy: { ...policy, perTxUsd: HARD_CAPS.policyPerTxUsd + 1 } }))).toEqual({ ok: false, reason: "politica_frouxa" });
    expect(gate(live({ policy: { ...policy, dailyTradeUsd: HARD_CAPS.policyDailyUsd + 1 } }))).toEqual({ ok: false, reason: "politica_frouxa" });
    expect(gate(live({ policy: { ...policy, perTxUsd: HARD_CAPS.policyPerTxUsd, dailyTradeUsd: HARD_CAPS.policyDailyUsd } }))).toEqual({ ok: true });
  });

  test("only an explicit false relaxes it (a choice of the person): then the policy is no condition, absent, partial, loose or unreadable, and the agent's own caps hold", () => {
    const relaxed = (over: Partial<NonNullable<GateInputs["limited"]>>) => base({ state: { mode: "limitado", stopped: false }, limited: limited(over), requireOwnerPolicy: false });
    expect(gate(relaxed({ policy: null }))).toEqual({ ok: true });
    expect(gate(relaxed({ policy: { ...policy, perTxUsd: null } }))).toEqual({ ok: true });
    expect(gate(relaxed({ policy: { ...policy, perTxUsd: HARD_CAPS.policyPerTxUsd + 1 } }))).toEqual({ ok: true });
    expect(gate(relaxed({ policy: { ...policy, dailyTradeUsd: Number.NaN } }))).toEqual({ ok: true });
    // the rest of the gate is not relaxed with it
    expect(gate(relaxed({ binaryOk: false }))).toEqual({ ok: false, reason: "binario_divergente" });
    expect(gate(relaxed({ sessionExpiresAtMs: NOW + 1000 }))).toEqual({ ok: false, reason: "sessao_expirando" });
    // an undefined is not a false
    expect(gate(base({ state: { mode: "limitado", stopped: false }, limited: limited({ policy: null }), requireOwnerPolicy: undefined }))).toEqual({ ok: false, reason: "politica_ausente" });
  });

  test("the CLI signs with the real clock: a machine clock that is off blocks the money mode, whatever the app's corrected clock says", () => {
    expect(gate(live({ localSkewMs: 77_000 }))).toEqual({ ok: false, reason: "relogio" });
    expect(gate(live({ localSkewMs: -77_000 }))).toEqual({ ok: false, reason: "relogio" });
    expect(gate(live({ localSkewMs: null }))).toEqual({ ok: false, reason: "relogio" });
    expect(gate(live({ localSkewMs: MAX_CLOCK_SKEW_MS }))).toEqual({ ok: true });
    // the shadow signs nothing with the machine's clock
    expect(gate(base({ state: { mode: "sombra", stopped: false }, limited: null }))).toEqual({ ok: true });
  });

  test("the session must outlive the cycle", () => {
    expect(gate(live({ sessionExpiresAtMs: null }))).toEqual({ ok: false, reason: "sessao_expirando" });
    expect(gate(live({ sessionExpiresAtMs: NOW + 119_999 }))).toEqual({ ok: false, reason: "sessao_expirando" });
    expect(gate(live({ sessionExpiresAtMs: NOW + 120_000 }))).toEqual({ ok: true });
  });

  test("identity and binary: unknown is a block", () => {
    expect(gate(live({ addressMatches: false }))).toEqual({ ok: false, reason: "endereco_divergente" });
    expect(gate(live({ addressMatches: null }))).toEqual({ ok: false, reason: "endereco_divergente" });
    expect(gate(live({ binaryOk: false }))).toEqual({ ok: false, reason: "binario_divergente" });
    expect(gate(live({ binaryOk: null }))).toEqual({ ok: false, reason: "binario_divergente" });
  });

  test("a position without its plan has no stop: unreadable plans block the money mode only", () => {
    expect(gate(base({ state: { mode: "limitado", stopped: false }, limited: limited(), plans: { ok: false, reason: "planos_ilegiveis" } }))).toEqual({ ok: false, reason: "planos_ilegiveis" });
    expect(gate(base({ plans: { ok: false, reason: "planos_ilegiveis" } }))).toEqual({ ok: true });
  });

  test("the shadow needs none of that: it moves no money", () => {
    expect(gate(base({ state: { mode: "sombra", stopped: false } }))).toEqual({ ok: true });
  });
});

const order = (over: Partial<PlannedOrder> = {}): PlannedOrder => ({ candidateId: "buy:x", side: "buy", stance: "buy_full", chainIndex: "1", symbol: "AAA", address: "0x1111111111111111111111111111111111111111", usd: 20, amountMinor: null, wallet: "agente", profile: "alvo_5", source: "modelo", ...over });

describe("the caps of the agent", () => {
  test("by the owner's decision of 2026-10-14 there are no ceilings by default: every cap is null, which means no cap, and it survives JSON", () => {
    expect(DEFAULT_CAPS).toEqual({ maxBuyUsd: null, maxDailyBuyUsd: null, maxDailySellUsd: null });
    expect(JSON.parse(JSON.stringify(DEFAULT_CAPS))).toEqual(DEFAULT_CAPS);
  });

  test("with no ceilings every order the model chose goes through as it was, whatever the day's turnover and whatever its size, down to the fraction of a cent", () => {
    const orders = [order({ candidateId: "buy:a", usd: 37.125 }), order({ candidateId: "buy:b", usd: 0.125 }), order({ candidateId: "hold:y@agente", side: "sell", stance: "exit_all", usd: 2.125, amountMinor: "7", profile: null })];
    const out = applyCaps(orders, DEFAULT_CAPS, { buy: 100_000, sell: 100_000 });
    expect(out.dropped).toEqual([]);
    expect(out.orders).toEqual(orders);
  });

  test("a ceiling somebody wrote on purpose still holds, and a cut keeps what is left to the fraction, with no minimum order and no whole-dollar floor", () => {
    const caps = { maxBuyUsd: 30.5, maxDailyBuyUsd: 40.25, maxDailySellUsd: null };
    const out = applyCaps([order({ candidateId: "buy:a", usd: 80 }), order({ candidateId: "buy:b", usd: 20 })], caps, { buy: 0, sell: 0 });
    expect(out.orders.map((o) => [o.candidateId, o.usd])).toEqual([["buy:a", 30.5], ["buy:b", 9.75]]);
    const left = applyCaps([order({ usd: 40 })], caps, { buy: 40.1, sell: 0 });
    expect(left.orders[0]!.usd).toBeCloseTo(0.15, 9);
    const none = applyCaps([order({ usd: 40 })], caps, { buy: 40.25, sell: 0 });
    expect(none.dropped).toEqual([{ candidateId: "buy:x", reason: "teto_diario" }]);
  });

  test("whether a change of ceilings raises what the agent may spend: no ceiling is the loosest, a bigger number is looser than a smaller one", () => {
    expect(capRaised(null, 100)).toBe(true);
    expect(capRaised(100, null)).toBe(false);
    expect(capRaised(null, null)).toBe(false);
    expect(capRaised(150, 100)).toBe(true);
    expect(capRaised(100, 100)).toBe(false);
    expect(capRaised(50, 100)).toBe(false);
  });

  test("a ceiling is a number somebody chose or null: zero, negative or not a number is refused when the configuration is made", () => {
    expect(() => validateCaps({ maxBuyUsd: null, maxDailyBuyUsd: null, maxDailySellUsd: null })).not.toThrow();
    expect(() => validateCaps({ maxBuyUsd: 0.5, maxDailyBuyUsd: 3, maxDailySellUsd: 100_000 })).not.toThrow();
    for (const bad of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) expect(() => validateCaps({ maxBuyUsd: bad, maxDailyBuyUsd: null, maxDailySellUsd: null })).toThrow();
    expect(() => validateCaps({ maxBuyUsd: 50, maxDailyBuyUsd: 40, maxDailySellUsd: null })).toThrow();
  });

  test("a purchase above the per-order cap somebody wrote is cut to it, not refused", () => {
    const out = applyCaps([order({ usd: 80 })], { ...DEFAULT_CAPS, maxBuyUsd: 25, maxDailyBuyUsd: 1000 }, { buy: 0, sell: 0 });
    expect(out.orders.map((o) => o.usd)).toEqual([25]);
    expect(out.dropped).toEqual([]);
  });

  test("the daily purchase cap is shared by the orders of the day and by those already sent", () => {
    const caps = { ...DEFAULT_CAPS, maxBuyUsd: 50, maxDailyBuyUsd: 60 };
    const out = applyCaps([order({ candidateId: "buy:a", usd: 40 }), order({ candidateId: "buy:b", usd: 40 })], caps, { buy: 10, sell: 0 });
    expect(out.orders.map((o) => [o.candidateId, o.usd])).toEqual([["buy:a", 40], ["buy:b", 10]]);
    // what is left of the day is what is bought, however small: there is no minimum order
    const tight = applyCaps([order({ usd: 40 })], caps, { buy: 55, sell: 0 });
    expect(tight.orders.map((o) => o.usd)).toEqual([5]);
    const spent = applyCaps([order({ usd: 40 })], caps, { buy: 60, sell: 0 });
    expect(spent.orders).toEqual([]);
    expect(spent.dropped).toEqual([{ candidateId: "buy:x", reason: "teto_diario" }]);
  });

  test("sales are never cut by the per-order cap (leaving a position is how risk is reduced) but the daily cap holds", () => {
    const sell = order({ candidateId: "hold:y@agente", side: "sell", stance: "exit_all", usd: 400, amountMinor: "5" });
    const ok = applyCaps([sell], { ...DEFAULT_CAPS, maxBuyUsd: 25, maxDailySellUsd: 1000 }, { buy: 0, sell: 0 });
    expect(ok.orders).toHaveLength(1);
    expect(ok.orders[0]!.amountMinor).toBe("5");
    const over = applyCaps([sell], { ...DEFAULT_CAPS, maxDailySellUsd: 500 }, { buy: 0, sell: 200 });
    expect(over.dropped).toEqual([{ candidateId: "hold:y@agente", reason: "teto_diario" }]);
  });

  test("a sale the plan of a position demands is never held back by the daily cap", () => {
    const stop = order({ candidateId: "hold:z@agente", side: "sell", stance: "exit_all", usd: 900, amountMinor: "9", profile: null, source: "protecao" });
    const out = applyCaps([stop], { ...DEFAULT_CAPS, maxDailySellUsd: 500 }, { buy: 0, sell: 499 });
    expect(out.orders).toHaveLength(1);
    expect(out.dropped).toEqual([]);
    // and it counts for the sales that come after it
    const next = applyCaps([stop, order({ candidateId: "hold:y@agente", side: "sell", stance: "exit_all", usd: 50, amountMinor: "1", profile: null })], { ...DEFAULT_CAPS, maxDailySellUsd: 500 }, { buy: 0, sell: 0 });
    expect(next.orders).toHaveLength(1);
    expect(next.dropped).toEqual([{ candidateId: "hold:y@agente", reason: "teto_diario" }]);
  });

  test("orders of the principal wallet are not agent spending: they are prepared for the person", () => {
    const prepared = order({ side: "sell", wallet: "principal", usd: 9000, amountMinor: "1" });
    const out = applyCaps([prepared], { ...DEFAULT_CAPS, maxDailySellUsd: 10 }, { buy: 0, sell: 0 });
    expect(out.orders).toHaveLength(1);
  });

  test("a number that is not a number never slides through the caps", () => {
    const caps = { ...DEFAULT_CAPS, maxBuyUsd: 50, maxDailyBuyUsd: 500, maxDailySellUsd: 500 };
    const nan = applyCaps([order({ usd: Number.NaN }), order({ usd: -5 }), order({ usd: Number.POSITIVE_INFINITY }), order({ candidateId: "hold:y@agente", side: "sell", stance: "exit_all", usd: Number.NaN, amountMinor: "1" })], caps, { buy: 0, sell: 0 });
    expect(nan.orders).toEqual([]);
    expect(nan.dropped.map((d) => d.reason)).toEqual(["valor_invalido", "valor_invalido", "valor_invalido", "valor_invalido"]);
    // an unknown day's total is not zero: nothing that depends on it goes out, a plan's exit still does
    const unknownSpent = applyCaps([order({ usd: 20 }), order({ candidateId: "hold:y@agente", side: "sell", stance: "exit_all", usd: 50, amountMinor: "1", profile: null })], caps, { buy: Number.NaN, sell: Number.NaN });
    expect(unknownSpent.orders).toEqual([]);
    expect(unknownSpent.dropped.map((d) => d.reason)).toEqual(["gasto_desconhecido", "gasto_desconhecido"]);
    const stop = order({ candidateId: "hold:z@agente", side: "sell", stance: "exit_all", usd: 90, amountMinor: "9", profile: null, source: "protecao" });
    expect(applyCaps([stop], caps, { buy: Number.NaN, sell: Number.NaN }).orders).toHaveLength(1);
    // and a cap that is not a number stops the orders it would have governed
    expect(applyCaps([order({ usd: 20 })], { ...caps, maxBuyUsd: Number.NaN }, { buy: 0, sell: 0 }).orders).toEqual([]);
  });
});

describe("a sale above the owner's per-transaction limit is cut to parts that fit it (A1.10)", () => {
  const sale = (over: Partial<PlannedOrder> = {}): PlannedOrder => ({ candidateId: "hold:x", side: "sell", stance: "exit_all", chainIndex: "501", symbol: "AAA", address: "EZ7RFLpHv14NK8b6wQuRefLvspYTy1TFpj5756TKpump", usd: 120, amountMinor: "1200000000", wallet: "agente", profile: null, source: "protecao", ...over });

  test("the part is worth 95 percent of the limit, taken pro rata from the balance in whole minor units", () => {
    const [part] = splitToPolicy([sale()], 50);
    expect(part).toMatchObject({ usd: 47, amountMinor: "470000000", stance: "exit_all", side: "sell" });
    // big balances lose no digit
    const big = splitToPolicy([sale({ amountMinor: "123456789012345678901234567890", usd: 100 })], 50)[0]!;
    expect(big.amountMinor).toBe(((123456789012345678901234567890n * 4700n) / 10000n).toString());
  });

  test("what already fits, what has no known worth, a purchase, the person's own wallet and a policy with no limit are left alone", () => {
    const fits = sale({ usd: 40 });
    const unknown = sale({ usd: 0 });
    const buy = sale({ side: "buy", usd: 500, amountMinor: null });
    const mine = sale({ wallet: "principal" });
    const noAmount = sale({ amountMinor: null });
    expect(splitToPolicy([fits, unknown, buy, mine, noAmount], 50)).toEqual([fits, unknown, buy, mine, noAmount]);
    expect(splitToPolicy([sale()], null)).toEqual([sale()]);
    expect(splitToPolicy([sale()], 0)).toEqual([sale()]);
    expect(splitToPolicy([sale()], Number.NaN)).toEqual([sale()]);
  });

  test("a part that would round to nothing is not sent as a part: the order stays as it was", () => {
    const dust = sale({ amountMinor: "1", usd: 120 });
    expect(splitToPolicy([dust], 50)).toEqual([dust]);
  });
});
