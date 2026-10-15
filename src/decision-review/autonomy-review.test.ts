import { expect, test } from "bun:test";
import { applyCaps, DEFAULT_CAPS } from "../agent/gate";
import type { PlannedOrder } from "../agent/types";
import { buildSwapArgs, KNOWN_DOLLARS } from "../agent/swap-args";

// Independent regression for the owner's 2026-10-14 instruction. These are
// already chosen MODEL orders, not recommendations or calls to an executor.
const order = (side: "buy" | "sell", usd: number, id: string): PlannedOrder => ({
  candidateId: `token:501:${id}`, chainIndex: "501", address: id,
  symbol: "FIXTURE", wallet: "agente", side, usd,
  amountMinor: side === "sell" ? "1250000" : null,
  source: "modelo", stance: side === "buy" ? "buy_full" : "exit_all",
  profile: side === "buy" ? "alvo_5" : null,
});

test("default agent policy preserves model buys and sales after any daily turnover", () => {
  const orders = [order("buy", 3.25, "fixtureA"), order("sell", 2.125, "fixtureB")];
  const result = applyCaps(orders, DEFAULT_CAPS, { buy: 100000, sell: 100000 });
  expect(result.dropped).toEqual([]);
  expect(result.orders).toEqual(orders);
});

test("post-model validation does not silently resize an affordable chosen ticket", () => {
  const orders = [order("buy", 37.125, "fixtureA")];
  const result = applyCaps(orders, DEFAULT_CAPS, { buy: 0, sell: 0 });
  expect(result.dropped).toEqual([]);
  expect(result.orders).toEqual(orders);
});

test("fractional chosen USDC input reaches quote and execute at token precision", () => {
  const chosen = order("buy", .125, "So11111111111111111111111111111111111111112");
  for (const phase of ["quote", "execute"] as const) {
    const args = buildSwapArgs(phase, chosen, KNOWN_DOLLARS["501"]!, "11111111111111111111111111111111");
    expect(args[args.indexOf("--amount") + 1]).toBe("125000");
  }
});
