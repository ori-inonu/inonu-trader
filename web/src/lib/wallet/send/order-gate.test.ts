// WAL-10: the check of the transaction against the order, and the gate that lets an order reach the wallet. Every block has a case that makes it, and the happy path is the only one that ends in permission.
// origin: synthetic_fixture, tests only.
import { describe, expect, test } from "bun:test";
import { QUOTE_MAX_AGE_MS, confirmationWord, evaluateGate, isCleared, limitBlocks, trustOf, type GateInput } from "./gate";
import { ACCOUNT, NOW, OTHER_ACCOUNT, ROUTER, SPENDER, TOKEN, TRUST, USDC, approval, approveData, order, settingsOn, swap } from "./fixtures";
import { NATIVE_TOKEN, allowanceCall, decodeApprove, formatMinor, impliedImpactPct, orderUsd, selectorOf, verifyApproval, verifySwap } from "./order";

const FORBIDDEN = new RegExp(`[${String.fromCharCode(0xb7, 0x2014, 0x2013)}]`);
const AAA = (over: Record<string, unknown> = {}) => ({ address: TOKEN, symbol: "AAA", decimals: 18, unitPriceUsd: 0.4, taxRate: 0, isHoneyPot: false, ...over });
const USDC_SIDE = (over: Record<string, unknown> = {}) => ({ address: USDC, symbol: "USDC", decimals: 6, unitPriceUsd: 1, taxRate: 0, isHoneyPot: false, ...over });

describe("the transaction against the order", () => {
  test("a swap that is exactly the order has no problem", () => {
    expect(verifySwap(order(), swap(), TRUST)).toEqual([]);
  });

  test("another network, another amount, another token on either side or another account are each caught", () => {
    expect(verifySwap(order(), swap({ chainIndex: "1" }), TRUST)).toEqual(["rede"]);
    expect(verifySwap(order(), swap({ route: { fromAmount: "100000001" } }), TRUST)).toContain("valor");
    expect(verifySwap(order(), swap({ route: { fromToken: AAA({ decimals: 6 }) } }), TRUST)).toContain("token_de_origem");
    expect(verifySwap(order(), swap({ route: { toToken: USDC_SIDE({ decimals: 18 }) } }), TRUST)).toContain("token_de_destino");
    expect(verifySwap(order(), swap({ tx: { from: OTHER_ACCOUNT } }), TRUST)).toEqual(["conta"]);
    expect(verifySwap(order(), swap({ family: "solana" }), TRUST)).toContain("familia");
  });

  test("the decimals are the order's own: the provider cannot change them to shrink or inflate the amounts on the screen and the value under the caps", () => {
    expect(verifySwap(order(), swap({ route: { fromToken: USDC_SIDE({ decimals: 36 }) } }), TRUST)).toEqual(["casas_decimais"]);
    expect(verifySwap(order(), swap({ route: { toToken: AAA({ decimals: 0 }) } }), TRUST)).toEqual(["casas_decimais"]);
    expect(verifySwap(order(), swap({ route: { toToken: AAA({ decimals: null }) } }), TRUST)).toEqual(["casas_decimais"]);
  });

  test("a transaction that goes anywhere but to a router is caught, whatever its calldata says", () => {
    for (const to of [ACCOUNT, TOKEN, USDC, "0x0000000000000000000000000000000000000000", null, "0x123"]) {
      expect(verifySwap(order(), swap({ tx: { to } }), TRUST)).toContain("destino_da_transacao");
    }
    expect(verifySwap(order(), swap({ tx: { to: ROUTER.toUpperCase().replace("0X", "0x") } }), TRUST)).toEqual([]);
  });

  test("a router the person has not confirmed on this network is stopped, even with every number around it consistent (a third contract with the calldata of something else)", () => {
    const stranger = "0x9999999999999999999999999999999999999999";
    expect(verifySwap(order(), swap({ tx: { to: stranger } }), TRUST)).toEqual(["roteador_novo"]);
    expect(verifySwap(order(), swap(), { routers: [], spenders: [] })).toEqual(["roteador_novo"]);
    expect(verifySwap(order(), swap({ tx: { to: stranger } }), { routers: [stranger], spenders: [] })).toEqual([]);
  });

  test("the functions that move or release a token are never a swap: transfer, transferFrom, approve, permit, mint, burn", () => {
    for (const selector of ["a9059cbb", "23b872dd", "095ea7b3", "39509351", "a457c2d7", "a22cb465", "42842e0e", "b88d4fde", "d505accf", "40c10f19", "9dc29fac", "42966c68"]) {
      expect(verifySwap(order(), swap({ tx: { data: `0x${selector}${"00".repeat(64)}` } }), TRUST)).toContain("funcao_proibida");
    }
    expect(verifySwap(order(), swap({ tx: { data: "0x12" } }), TRUST)).toContain("funcao_proibida");
    expect(selectorOf("0xA9059CBB00")).toBe("0xa9059cbb");
    expect(selectorOf("nope")).toBeNull();
  });

  test("the coin of the network travels only when it is the coin being given, and then it is exactly the amount", () => {
    expect(verifySwap(order(), swap({ tx: { value: "1" } }), TRUST)).toEqual(["valor_nativo"]);
    const native = order({ from: { address: NATIVE_TOKEN, symbol: "ETH", decimals: 18 }, amountMinor: "1000000000000000000" });
    const s = swap({ route: { fromAmount: "1000000000000000000", fromToken: { address: NATIVE_TOKEN, symbol: "ETH", decimals: 18, unitPriceUsd: 3000, taxRate: 0, isHoneyPot: false } }, tx: { value: "1000000000000000000" } });
    expect(verifySwap(native, s, TRUST)).toEqual([]);
    expect(verifySwap(native, swap({ route: s.route, tx: { value: "0" } }), TRUST)).toEqual(["valor_nativo"]);
    expect(verifySwap(order(), swap({ tx: { value: "-1" } }), TRUST)).toEqual(["valor_nativo"]);
  });

  test("a minimum that is missing, zero, above the promise or far under it is caught; one inside the slippage and a point more is fine", () => {
    for (const min of [null, "0", "abc", "250000000000000000001", "100000000000000000000"]) expect(verifySwap(order(), swap({ tx: { minReceiveAmount: min } }), TRUST)).toContain("minimo_incoerente");
    // 98% of the promise is the floor with a 1% slippage
    expect(verifySwap(order(), swap({ tx: { minReceiveAmount: "245000000000000000000" } }), TRUST)).toEqual([]);
    expect(verifySwap(order(), swap({ tx: { minReceiveAmount: "244999999999999999999" } }), TRUST)).toContain("minimo_incoerente");
  });

  test("the slippage of the transaction is the one the person confirmed", () => {
    expect(verifySwap(order(), swap({ tx: { slippagePercent: 3 } }), TRUST)).toEqual(["slippage_diferente"]);
    expect(verifySwap(order(), swap({ tx: { slippagePercent: null } }), TRUST)).toEqual(["slippage_diferente"]);
    expect(verifySwap(order({ slippagePct: 2.5 }), swap({ tx: { slippagePercent: 2.5, minReceiveAmount: "243750000000000000000" } }), TRUST)).toEqual([]);
  });
});

describe("the approval", () => {
  test("it must approve exactly the address the provider named, an address the person trusts, for exactly the amount, by the approve call", () => {
    expect(verifyApproval(order(), approval(), TRUST)).toEqual([]);
    expect(verifyApproval(order(), approval({ data: approveData(OTHER_ACCOUNT, BigInt("100000000")) }), TRUST)).toEqual(["aprovacao_gastador"]);
    expect(verifyApproval(order(), approval({ data: approveData(SPENDER, BigInt("100000001")) }), TRUST)).toEqual(["aprovacao_valor"]);
    // "unlimited" is the usual trap
    expect(verifyApproval(order(), approval({ data: approveData(SPENDER, BigInt(2) ** BigInt(256) - BigInt(1)) }), TRUST)).toEqual(["aprovacao_valor"]);
    expect(verifyApproval(order(), approval({ data: "0xa9059cbb" + "00".repeat(64) }), TRUST)).toEqual(["aprovacao_seletor"]);
    expect(verifyApproval(order(), approval({ data: "0x095ea7b3" + "00".repeat(10) }), TRUST)).toEqual(["aprovacao_formato"]);
  });

  test("an address that the provider names AND that the data approves is still stopped until the person confirms it on this network", () => {
    const attacker = "0x8888888888888888888888888888888888888888";
    expect(verifyApproval(order(), approval({ data: approveData(attacker, BigInt("100000000")), spender: attacker }), TRUST)).toEqual(["gastador_novo"]);
    expect(verifyApproval(order(), approval(), { routers: [ROUTER], spenders: [] })).toEqual(["gastador_novo"]);
    expect(verifyApproval(order(), approval({ data: approveData(attacker, BigInt("100000000")), spender: attacker }), { routers: [], spenders: [attacker] })).toEqual([]);
  });

  test("the coin of the network is never approved", () => {
    expect(verifyApproval(order({ from: { address: NATIVE_TOKEN, symbol: "ETH", decimals: 18 } }), approval(), TRUST)).toEqual(["aprovacao_moeda_da_rede"]);
  });

  test("the calldata is read word by word: an address word with bytes in its first twelve is not an address", () => {
    expect(decodeApprove(approveData(SPENDER, BigInt(5)))).toEqual({ spender: SPENDER, amount: BigInt(5) });
    expect(decodeApprove("0x095ea7b3" + "ff".repeat(32) + "00".repeat(32))).toBeNull();
    expect(decodeApprove(approveData(SPENDER, BigInt(5)) + "00")).toBeNull();
    expect(decodeApprove("nothex")).toBeNull();
  });

  test("the allowance read asks the token for the owner and the spender", () => {
    expect(allowanceCall(ACCOUNT, SPENDER)).toBe(`0xdd62ed3e${"0".repeat(24)}${ACCOUNT.slice(2)}${"0".repeat(24)}${SPENDER.slice(2)}`);
    expect(allowanceCall("0x1", SPENDER)).toBeNull();
  });
});

describe("the value of an order and how an amount is shown", () => {
  test("a purchase is worth exactly what it pays in dollar coin, whatever price the provider names for either token", () => {
    expect(orderUsd(order(), swap())).toBe(100);
    expect(orderUsd(order(), swap({ route: { fromToken: USDC_SIDE({ unitPriceUsd: null }), toToken: AAA({ unitPriceUsd: 0 }) } }))).toBe(100);
    expect(orderUsd(order(), swap({ route: { fromToken: USDC_SIDE({ unitPriceUsd: 5 }) } }))).toBe(100);
  });

  test("a sale is worth the larger of what it is expected to receive and what the token is priced at, so understating one side does not lower it", () => {
    const sale = order({ dollarSide: "to", side: "sell", from: { address: TOKEN, symbol: "AAA", decimals: 18 }, to: { address: USDC, symbol: "USDC", decimals: 6 }, amountMinor: "250000000000000000000" });
    const base = { fromAmount: "250000000000000000000", toAmount: "100000000", fromToken: AAA(), toToken: USDC_SIDE() };
    expect(orderUsd(sale, swap({ route: base }))).toBe(100);
    // a lowball amount received is covered by the price of the token, and a lowball price by the amount received
    expect(orderUsd(sale, swap({ route: { ...base, toAmount: "1000000" } }))).toBe(100);
    expect(orderUsd(sale, swap({ route: { ...base, fromToken: AAA({ unitPriceUsd: 0 }) } }))).toBe(100);
    expect(orderUsd(sale, swap({ route: { ...base, fromToken: AAA({ unitPriceUsd: null }) } }))).toBe(100);
  });

  test("the dollar coin is the one the STRUCTURE of the order says, never one that a symbol says: a token that calls itself USDC is not a dollar", () => {
    // a sale of 0.5 of a token worth 60000 each whose NAME the provider made "USDC": it is valued by the coin it receives and by its price, not as 0.5 dollars
    const sale = order({ dollarSide: "to", side: "sell", from: { address: TOKEN, symbol: "USDC", decimals: 8 }, to: { address: USDC, symbol: "USDC", decimals: 6 }, amountMinor: "50000000" });
    const s = swap({ route: { fromAmount: "50000000", toAmount: "30000000000", fromToken: AAA({ decimals: 8, unitPriceUsd: 60000, symbol: "USDC" }), toToken: USDC_SIDE() } });
    expect(orderUsd(sale, s)).toBe(30000);
    // and a purchase is worth what it pays whatever either symbol says
    expect(orderUsd(order({ to: { address: TOKEN, symbol: "USDC", decimals: 18 } }), swap())).toBe(100);
    // an amount that is not whole digits has no value and no exception
    expect(orderUsd(order(), swap({ route: { toAmount: "x" } }))).toBeNull();
    expect(impliedImpactPct(order(), swap({ route: { toAmount: "x" } }))).toBeNull();
    expect(verifySwap(order(), swap({ route: { toAmount: "x" } }), TRUST)).toContain("minimo_incoerente");
  });

  test("the impact the numbers of the route imply is what was given minus what comes back, over what was given", () => {
    expect(impliedImpactPct(order(), swap())).toBeCloseTo(0, 6);
    // 100 dollars given, 90 dollars of token back: 10%
    expect(impliedImpactPct(order(), swap({ route: { toAmount: "225000000000000000000" } }))).toBeCloseTo(10, 6);
    expect(impliedImpactPct(order(), swap({ route: { toToken: AAA({ unitPriceUsd: null }) } }))).toBeNull();
  });

  test("amounts are exact and never in exponent form, and a tiny amount says so instead of showing zero", () => {
    expect(formatMinor("250500000000000000000", 18)).toBe("250.5");
    expect(formatMinor("100000000", 6)).toBe("100");
    expect(formatMinor("123456789", 6)).toBe("123.456789");
    expect(formatMinor("12", 0)).toBe("12");
    expect(formatMinor("1", 18)).toBe("menos de 0.00000001");
    expect(formatMinor("0", 18)).toBe("0");
    expect(formatMinor("abc", 6)).toBe("-");
  });
});

const input = (over: Partial<GateInput> = {}): GateInput => ({
  settings: settingsOn(),
  nowMs: NOW,
  spentLast24hUsd: 0,
  logDurable: true,
  order: order(),
  step: "swap",
  swap: swap(),
  swapFetchedAtMs: NOW - 5_000,
  approval: null,
  wallet: { account: ACCOUNT, chainIdHex: "0x2105" },
  typed: "AAA",
  ...over,
});
const codes = (i: GateInput): string[] => {
  const r = evaluateGate(i);
  return r.ok ? [] : r.blocks.map((b) => b.code);
};

describe("the gate", () => {
  test("with everything in order it gives permission for the step, and only then", () => {
    const r = evaluateGate(input());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(isCleared(r.cleared)).toBe(true);
    expect(r.cleared).toMatchObject({ step: "swap", usd: 100, fetchedAtMs: NOW - 5_000, issuedAtMs: NOW });
    // a permission built by hand is not one
    expect(isCleared({ step: "swap", order: order(), swap: swap(), approval: null, usd: 1, issuedAtMs: NOW })).toBe(false);
    expect(isCleared(null)).toBe(false);
    // and it cannot be changed after it was given
    expect(() => Object.assign(r.cleared, { usd: 1 })).toThrow();
  });

  test("the approve step needs the approval, and the approval must be the right one", () => {
    expect(codes(input({ step: "approve", approval: null }))).toEqual(["aprovacao"]);
    expect(codes(input({ step: "approve", approval: approval({ data: approveData(SPENDER, BigInt(1)) }) }))).toEqual(["aprovacao"]);
    const ok = evaluateGate(input({ step: "approve", approval: approval() }));
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(ok.cleared.approval).toEqual(approval());
  });

  test("off, stopped, and no cap are each a reason, and they come together", () => {
    expect(codes(input({ settings: settingsOn({ enabled: false }) }))).toEqual(["desligado"]);
    expect(codes(input({ settings: settingsOn({ killed: true }) }))).toEqual(["parado"]);
    expect(codes(input({ settings: settingsOn({ perOperationUsd: null, dailyUsd: null }) }))).toEqual(["sem_teto", "sem_teto_diario"]);
    expect(codes(input({ settings: { ...settingsOn(), enabled: false, killed: true, perOperationUsd: null } }))).toEqual(["desligado", "parado", "sem_teto"]);
  });

  test("the caps are compared with the value of THIS order and the orders of the last 24 hours", () => {
    expect(codes(input({ settings: settingsOn({ perOperationUsd: 99.99 }) }))).toEqual(["acima_do_teto"]);
    expect(codes(input({ settings: settingsOn({ perOperationUsd: 100 }) }))).toEqual([]);
    expect(codes(input({ spentLast24hUsd: 401 }))).toEqual(["acima_do_dia"]);
    expect(codes(input({ spentLast24hUsd: 400 }))).toEqual([]);
    // an order whose value is unknown is stopped, never let through under a cap, and never an exception
    expect(codes(input({ swap: swap({ route: { toAmount: "x" } }) }))).toContain("valor_desconhecido");
  });

  test("the caps can be asked again on their own, with fresh values: this is what the module that talks to the wallet does at the last moment", () => {
    expect(limitBlocks(settingsOn(), 100, 0)).toEqual([]);
    expect(limitBlocks(settingsOn({ killed: true }), 100, 0).map((b) => b.code)).toEqual(["parado"]);
    expect(limitBlocks(settingsOn({ enabled: false }), 100, 0).map((b) => b.code)).toEqual(["desligado"]);
    expect(limitBlocks(settingsOn(), 100, 450).map((b) => b.code)).toEqual(["acima_do_dia"]);
    expect(limitBlocks(settingsOn(), null, 0).map((b) => b.code)).toEqual(["valor_desconhecido"]);
  });

  test("a log that cannot keep the attempt across a reload stops the order: a cap that forgets is not a cap", () => {
    expect(codes(input({ logDurable: false }))).toEqual(["sem_registro"]);
  });

  test("the wallet must be connected, on the account and the network of the order", () => {
    expect(codes(input({ wallet: { account: null, chainIdHex: null } }))).toEqual(["carteira_desconectada"]);
    expect(codes(input({ wallet: { account: OTHER_ACCOUNT, chainIdHex: "0x2105" } }))).toEqual(["conta_diferente"]);
    expect(codes(input({ wallet: { account: ACCOUNT, chainIdHex: "0x1" } }))).toEqual(["rede_diferente"]);
    expect(codes(input({ wallet: { account: ACCOUNT.toUpperCase().replace("0X", "0x"), chainIdHex: "0x2105" } }))).toEqual([]);
  });

  test("a quote is good for thirty seconds, no more, and not from the future", () => {
    expect(QUOTE_MAX_AGE_MS).toBe(30_000);
    expect(codes(input({ swapFetchedAtMs: NOW - 30_000 }))).toEqual([]);
    expect(codes(input({ swapFetchedAtMs: NOW - 30_001 }))).toEqual(["cotacao_velha"]);
    expect(codes(input({ swapFetchedAtMs: NOW + 1 }))).toEqual(["cotacao_velha"]);
    expect(codes(input({ swap: null, swapFetchedAtMs: null }))).toEqual(["sem_cotacao"]);
  });

  test("the impact must be known and inside the limit, in either direction, by what the provider says AND by what its own numbers imply", () => {
    expect(codes(input({ swap: swap({ route: { priceImpactPct: 1.01 } }) }))).toEqual(["impacto_alto"]);
    expect(codes(input({ swap: swap({ route: { priceImpactPct: -1.01 } }) }))).toEqual(["impacto_alto"]);
    expect(codes(input({ swap: swap({ route: { priceImpactPct: 1 } }) }))).toEqual([]);
    expect(codes(input({ swap: swap({ route: { priceImpactPct: null } }) }))).toEqual(["impacto_desconhecido"]);
    // a provider that writes a loss as a negative number, and a route whose numbers imply the same loss as a positive one, agree: by size, not by sign
    const threePoints = swap({ route: { priceImpactPct: -3, toAmount: "242500000000000000000" }, tx: { minReceiveAmount: "240075000000000000000" } });
    expect(codes(input({ settings: settingsOn({ maxImpactPct: 5 }), swap: threePoints }))).toEqual([]);
    expect(codes(input({ swap: threePoints }))).toContain("impacto_alto");
    // the provider says 0.1% and its numbers say 10%: the claim is not the truth, and the numbers are over the limit too
    const lowball = swap({ route: { priceImpactPct: 0.1, toAmount: "225000000000000000000" }, tx: { minReceiveAmount: "222750000000000000000" } });
    expect(codes(input({ swap: lowball }))).toEqual(["impacto_alto", "preco_incoerente"]);
    // no price for the token: the impact cannot be checked against the numbers
    expect(codes(input({ swap: swap({ route: { toToken: AAA({ unitPriceUsd: null }) } }) }))).toEqual(["preco_incoerente"]);
  });

  test("a honeypot on either side, an unknown flag, and a tax over the limit are stopped", () => {
    expect(codes(input({ swap: swap({ route: { toToken: AAA({ isHoneyPot: true }) } }) }))).toEqual(["honeypot"]);
    expect(codes(input({ swap: swap({ route: { toToken: AAA({ isHoneyPot: null }) } }) }))).toEqual(["honeypot_desconhecido"]);
    expect(codes(input({ swap: swap({ route: { toToken: AAA({ taxRate: 0.06 }) } }) }))).toEqual(["taxa_alta"]);
    expect(codes(input({ swap: swap({ route: { toToken: AAA({ taxRate: 0.05 }) } }) }))).toEqual([]);
    expect(codes(input({ swap: swap({ route: { toToken: AAA({ taxRate: null }) } }) }))).toEqual(["taxa_desconhecida"]);
    expect(codes(input({ swap: swap({ route: { fromToken: USDC_SIDE({ isHoneyPot: true }) } }) }))).toEqual(["honeypot"]);
  });

  test("the name the provider gives a token is put in a sentence only as plain readable characters", () => {
    const r = evaluateGate(input({ swap: swap({ route: { toToken: AAA({ symbol: "A" + String.fromCharCode(0x202e) + "B" + String.fromCharCode(0x0a) + String.fromCharCode(0x200b) + "C", isHoneyPot: true }) } }) }));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    const text = r.blocks.find((b) => b.code === "honeypot")!.text;
    expect(text).toBe("ABC esta marcado como honeypot: pode nao ser possivel sair dele");
  });

  test("a transaction that is not the order is a reason, with the words of the problem", () => {
    const r = evaluateGate(input({ swap: swap({ tx: { to: ACCOUNT } }) }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.blocks.map((b) => b.code)).toEqual(["transacao"]);
  });

  test("a router the person has not confirmed is its own reason, so the screen can offer the one thing that fixes it", () => {
    expect(codes(input({ settings: settingsOn({ trustedRouters: {} }) }))).toEqual(["roteador_novo"]);
    expect(codes(input({ settings: settingsOn({ trustedRouters: { "1": [ROUTER] } }) }))).toEqual(["roteador_novo"]);
    expect(codes(input({ step: "approve", approval: approval(), settings: settingsOn({ trustedSpenders: {} }) }))).toEqual(["gastador_novo"]);
    expect(trustOf(settingsOn(), "8453")).toEqual(TRUST);
    expect(trustOf(settingsOn(), "1")).toEqual({ routers: [], spenders: [] });
  });

  test("the person types the symbol of the token traded: the one that comes in on a purchase, the one that goes out on a sale", () => {
    expect(confirmationWord(order())).toBe("AAA");
    expect(confirmationWord(order({ dollarSide: "to", side: "sell", from: { address: TOKEN, symbol: "AAA", decimals: 18 }, to: { address: USDC, symbol: "USDC", decimals: 6 } }))).toBe("AAA");
    expect(codes(input({ typed: "" }))).toEqual(["confirmacao"]);
    expect(codes(input({ typed: "aab" }))).toEqual(["confirmacao"]);
    expect(codes(input({ typed: "  aaa " }))).toEqual([]);
  });

  test("every reason is said in plain words, with no middle dot, dash or accent, and no order word the code writes", () => {
    const all = evaluateGate(input({
      settings: { ...settingsOn(), enabled: false, killed: true, perOperationUsd: 1, dailyUsd: 1, trustedRouters: {}, trustedSpenders: {} },
      swap: swap({ tx: { to: ACCOUNT }, route: { priceImpactPct: 9, toToken: AAA({ isHoneyPot: true, taxRate: 0.9 }) } }), swapFetchedAtMs: NOW - 99_000, typed: "x", wallet: { account: OTHER_ACCOUNT, chainIdHex: "0x1" }, logDurable: false,
    }));
    expect(all.ok).toBe(false);
    if (all.ok) return;
    expect(all.blocks.length).toBeGreaterThan(8);
    for (const b of all.blocks) {
      expect(FORBIDDEN.test(b.text)).toBe(false);
      expect(/^[\x20-\x7e]*$/.test(b.text)).toBe(true);
      expect(b.text.toLowerCase()).not.toMatch(/\b(comprar|compre|vender|venda|sinal|recomend\w*|deve)\b/);
    }
  });
});
