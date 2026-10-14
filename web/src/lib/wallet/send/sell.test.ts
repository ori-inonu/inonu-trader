// WAL-10, EXE-10: the sale. The share of what the wallet holds, the plan of the network, and the two reads of the token. origin: synthetic_fixture, tests only.
import { describe, expect, test } from "bun:test";
import { draftFromDecision, ticketPlan } from "../ticket";
import { DEFAULT_FRACTION, FRACTIONS, fractionOf, isFractionId, orderPlan, readHolding } from "./sell";
import type { SendProvider } from "./send";
import { ACCOUNT, TOKEN, USDC } from "./fixtures";
import { EVM_CHAINS } from "../../evm-multichain";

const draft = (action: "buy" | "sell", chain = "8453", address = TOKEN) => draftFromDecision({ candidateId: `token:${chain}:${address}`, action, briefHash: null, symbol: "AAA", atMs: 1 })!;

describe("the share of the balance", () => {
  test("it is rounded DOWN to a whole unit, and all is exactly the balance, never more", () => {
    expect(fractionOf(BigInt(1000), "terco")).toBe("333");
    expect(fractionOf(BigInt(1000), "metade")).toBe("500");
    expect(fractionOf(BigInt(1000), "doisTercos")).toBe("666");
    expect(fractionOf(BigInt(1000), "tudo")).toBe("1000");
    const big = BigInt("123456789012345678901234567890");
    expect(fractionOf(big, "tudo")).toBe(big.toString());
    expect(BigInt(fractionOf(big, "doisTercos")!) <= big).toBe(true);
  });

  test("nothing, or less than one unit, is no amount", () => {
    expect(fractionOf(BigInt(0), "tudo")).toBeNull();
    expect(fractionOf(BigInt(1), "terco")).toBeNull();
    expect(fractionOf(BigInt(-5), "tudo")).toBeNull();
  });

  test("the choices are four, the default is the middle one, and an unknown id is not one", () => {
    expect(FRACTIONS.map((f) => f.id)).toEqual(["terco", "metade", "doisTercos", "tudo"]);
    expect(DEFAULT_FRACTION).toBe("metade");
    expect(isFractionId("tudo")).toBe(true);
    expect(isFractionId("dobro")).toBe(false);
    expect(isFractionId(null)).toBe(false);
  });
});

describe("the coins an order can pay with or receive", () => {
  // the value of an order under the caps takes the coin to pay or to receive as one dollar a unit (Order.dollarSide): that is true only while EVERY coin of the registry is a dollar coin. A coin that is not one
  // (WETH, a native wrapper) must not be added without a flag that says so, and this test is what stops it being added by accident
  test("every coin of the registry of every network is a dollar coin", () => {
    const coins = EVM_CHAINS.flatMap((chain) => chain.tokens.map((t) => ({ chain: chain.name, symbol: t.symbol })));
    expect(coins.length).toBeGreaterThan(10);
    expect(coins.filter((c) => !/^USD[CT]/i.test(c.symbol))).toEqual([]);
  });
});

describe("the plan of a sale", () => {
  test("a purchase keeps the ticket plan as it is", () => {
    const d = draft("buy");
    expect(orderPlan(d, ticketPlan(d))).toEqual(ticketPlan(d));
  });

  test("a sale receives one of the dollar coins of the network, and never the token itself", () => {
    const d = draft("sell");
    const plan = orderPlan(d, ticketPlan(d));
    expect(plan.quotable).toBe(true);
    expect(plan.pay.length).toBeGreaterThan(0);
    expect(plan.pay.some((c) => c.contract.toLowerCase() === TOKEN)).toBe(false);
    const usdc = draft("sell", "8453", USDC);
    const other = orderPlan(usdc, ticketPlan(usdc));
    expect(other.pay.every((c) => c.contract.toLowerCase() !== USDC)).toBe(true);
  });

  test("a network the app does not know, a token that is not a contract and the coin of the network are said, not guessed", () => {
    const unknown = draft("sell", "999");
    expect(orderPlan(unknown, ticketPlan(unknown))).toMatchObject({ quotable: false, reason: "O app ainda nao tem uma moeda para receber conhecida para esta rede" });
    const native = draft("sell", "8453", "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee");
    expect(orderPlan(native, ticketPlan(native))).toMatchObject({ quotable: false });
  });
});

function tokenWallet(answers: { balance?: unknown; decimals?: unknown; fail?: boolean }) {
  const calls: { to: string; data: string }[] = [];
  const provider: SendProvider = {
    async request(args) {
      if (answers.fail) throw new Error("down");
      const call = (args.params as [{ to: string; data: string }, string])[0];
      calls.push(call);
      return call.data.startsWith("0x70a08231") ? (answers.balance ?? "0x3e8") : (answers.decimals ?? "0x12");
    },
  };
  return { provider, calls };
}

describe("the reads of the token", () => {
  test("the balance and the decimals come from the token itself, with the owner in the call", async () => {
    const w = tokenWallet({ balance: "0x3e8", decimals: "0x6" });
    expect(await readHolding(w.provider, TOKEN, ACCOUNT)).toEqual({ balance: BigInt(1000), decimals: 6 });
    expect(w.calls[0]).toEqual({ to: TOKEN, data: `0x70a08231${"0".repeat(24)}${ACCOUNT.slice(2)}` });
    expect(w.calls[1]).toEqual({ to: TOKEN, data: "0x313ce567" });
  });

  test("anything that is not a number, a decimals out of range or a wallet that fails is no holding", async () => {
    expect(await readHolding(tokenWallet({ balance: "0x" }).provider, TOKEN, ACCOUNT)).toBeNull();
    expect(await readHolding(tokenWallet({ balance: 5 }).provider, TOKEN, ACCOUNT)).toBeNull();
    expect(await readHolding(tokenWallet({ decimals: "0x25" }).provider, TOKEN, ACCOUNT)).toBeNull();
    expect(await readHolding(tokenWallet({ decimals: "abc" }).provider, TOKEN, ACCOUNT)).toBeNull();
    expect(await readHolding(tokenWallet({ fail: true }).provider, TOKEN, ACCOUNT)).toBeNull();
    expect(await readHolding(tokenWallet({}).provider, "nope", ACCOUNT)).toBeNull();
    expect(await readHolding(tokenWallet({}).provider, TOKEN, "0x12")).toBeNull();
  });
});
