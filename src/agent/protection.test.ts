import { describe, expect, test } from "bun:test";
import { createPlanStore, planKey, type PositionPlan } from "./plans";
import { protect } from "./protection";
import type { Book, Position } from "./types";

const T0 = Date.UTC(2026, 9, 14, 12);
const HOUR = 3_600_000;
const A = "0x1111111111111111111111111111111111111111";
const B = "0x2222222222222222222222222222222222222222";

const pos = (over: Partial<Position> = {}): Position => ({ id: `token:1:${A}`, chainIndex: "1", address: A, symbol: "AAA", wallet: "agente", usd: 100, balanceMinor: "1000000000000000000", decimals: 18, isCash: false, ...over });
const book = (positions: Position[]): Book => ({ observedAtMs: T0, positions, cashByChain: {}, totalUsd: 1000, agentUsd: 1000 });
const planFor = (p: Position, over: Partial<PositionPlan> = {}): PositionPlan => ({
  key: planKey(p.chainIndex, p.address),
  chainIndex: p.chainIndex,
  address: p.address,
  symbol: p.symbol,
  profile: "alvo_10",
  entryPriceUsd: 100,
  entryAtMs: T0 - 5 * HOUR,
  peakPriceUsd: 100,
  targetHit: false,
  trimmed: false,
  cycleId: "c0",
  ...over,
});
const storeWith = (...plans: PositionPlan[]) => {
  const store = createPlanStore({ read: () => null, write: () => {} });
  for (const plan of plans) store.open(plan);
  return store;
};
const prices = (map: Record<string, number | null>) => (p: Position) => (p.id in map ? map[p.id]! : null);
const holdId = (p: Position) => `hold:${p.id}@${p.wallet}`;

describe("the exits that the plan of a position demands", () => {
  test("a position inside its plan raises nothing and is described to the model", () => {
    const p = pos();
    const out = protect({ book: book([p]), plans: storeWith(planFor(p)), priceOf: prices({ [p.id]: 103 }), highOf: () => null, nowMs: T0 });
    expect(out.orders).toEqual([]);
    expect(out.handled.size).toBe(0);
    expect(out.views.get(holdId(p))).toMatchObject({ profile: "alvo_10", targetHit: false });
    expect(out.views.get(holdId(p))!.sinceEntryPct).toBeCloseTo(3, 9);
  });

  test("the stop leaves entirely, with the whole balance, and is the plan's, not the model's", () => {
    const p = pos();
    const out = protect({ book: book([p]), plans: storeWith(planFor(p)), priceOf: prices({ [p.id]: 93 }), highOf: () => null, nowMs: T0 });
    expect(out.orders).toHaveLength(1);
    expect(out.orders[0]).toMatchObject({ candidateId: holdId(p), side: "sell", stance: "exit_all", amountMinor: "1000000000000000000", usd: 100, wallet: "agente", source: "protecao", profile: null });
    expect([...out.handled]).toEqual([holdId(p)]);
  });

  test("the target takes half, once", () => {
    const p = pos();
    const first = protect({ book: book([p]), plans: storeWith(planFor(p)), priceOf: prices({ [p.id]: 111 }), highOf: () => null, nowMs: T0 });
    expect(first.orders[0]).toMatchObject({ stance: "trim_half", amountMinor: "500000000000000000", usd: 50, source: "protecao" });
    const done = protect({ book: book([p]), plans: storeWith(planFor(p, { trimmed: true, targetHit: true, peakPriceUsd: 111 })), priceOf: prices({ [p.id]: 111 }), highOf: () => null, nowMs: T0 });
    expect(done.orders).toEqual([]);
  });

  test("after the target, falling back from the peak leaves what is left", () => {
    const p = pos();
    const out = protect({ book: book([p]), plans: storeWith(planFor(p, { trimmed: true, targetHit: true, peakPriceUsd: 130 })), priceOf: prices({ [p.id]: 123 }), highOf: () => null, nowMs: T0 });
    expect(out.orders[0]).toMatchObject({ stance: "exit_all" });
  });

  test("out of time without reaching the target leaves", () => {
    const p = pos();
    const out = protect({ book: book([p]), plans: storeWith(planFor(p, { entryAtMs: T0 - 37 * HOUR })), priceOf: prices({ [p.id]: 102 }), highOf: () => null, nowMs: T0 });
    expect(out.orders[0]).toMatchObject({ stance: "exit_all" });
  });

  test("the price is observed after the triggers are read, and the peak follows the highs", () => {
    const p = pos();
    const store = storeWith(planFor(p));
    protect({ book: book([p]), plans: store, priceOf: prices({ [p.id]: 104 }), highOf: () => 112, nowMs: T0 });
    expect(store.get(planKey("1", A))).toMatchObject({ peakPriceUsd: 112, targetHit: true });
  });

  test("a position the agent did not open has no plan, and so no exit of the code", () => {
    const p = pos();
    const out = protect({ book: book([p]), plans: storeWith(), priceOf: prices({ [p.id]: 1 }), highOf: () => null, nowMs: T0 });
    expect(out.orders).toEqual([]);
    expect(out.views.size).toBe(0);
  });

  test("the principal wallet is never sold by the code, even if the same token has a plan", () => {
    const p = pos({ wallet: "principal" });
    const out = protect({ book: book([p]), plans: storeWith(planFor(p)), priceOf: prices({ [p.id]: 50 }), highOf: () => null, nowMs: T0 });
    expect(out.orders).toEqual([]);
  });

  test("cash is never a position to protect", () => {
    const p = pos({ isCash: true });
    const out = protect({ book: book([p]), plans: storeWith(planFor(p)), priceOf: prices({ [p.id]: 0.5 }), highOf: () => null, nowMs: T0 });
    expect(out.orders).toEqual([]);
  });

  test("a price the code cannot see means no action, and it says so", () => {
    const p = pos();
    const out = protect({ book: book([p]), plans: storeWith(planFor(p)), priceOf: prices({}), highOf: () => null, nowMs: T0 });
    expect(out.orders).toEqual([]);
    expect(out.notes).toContain("protecao_sem_preco");
  });

  test("a balance that cannot be sold exactly gives no order, and says so", () => {
    const p = pos({ balanceMinor: null });
    const out = protect({ book: book([p]), plans: storeWith(planFor(p)), priceOf: prices({ [p.id]: 90 }), highOf: () => null, nowMs: T0 });
    expect(out.orders).toEqual([]);
    expect(out.notes).toContain("protecao_sem_ordem");
  });

  test("several positions: each with its own plan, the exits in a stable order", () => {
    const p1 = pos();
    const p2 = pos({ id: `token:1:${B}`, address: B, symbol: "BBB", usd: 200 });
    const out = protect({ book: book([p1, p2]), plans: storeWith(planFor(p1), planFor(p2)), priceOf: prices({ [p1.id]: 90, [p2.id]: 90 }), highOf: () => null, nowMs: T0 });
    expect(out.orders.map((o) => o.symbol)).toEqual(["BBB", "AAA"]);
  });
});
