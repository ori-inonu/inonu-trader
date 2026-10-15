import { describe, expect, test } from "bun:test";
import { parseOpportunityEvent } from "../decision-review/events";
import { eventsAllowed, MIN_EVENT_POSITION_USD, priceMoveEvents, pricesOf } from "./event-source";
import { planKey, type PositionPlan } from "./plans";
import type { Book, Position } from "./types";

const SOL = "6GmAFSYs4gk3FDao5FzzySQpPZaWsa4rUJHacpMpUNgx";
const EVM = "0xAbCdEf0123456789aBcDeF0123456789abcdef01";

const position = (over: Partial<Position> = {}): Position => ({
  id: `token:501:${SOL}`, chainIndex: "501", address: SOL, symbol: "STONK", wallet: "agente", usd: 12, balanceMinor: "110034676384", decimals: 6, isCash: false, priceUsd: 1, ...over,
});
const book = (positions: Position[], observedAtMs = 1_000_000): Book => ({ observedAtMs, positions, cashByChain: {}, totalUsd: 100, agentUsd: 100 });
const plan = (over: Partial<PositionPlan> = {}): PositionPlan => ({ key: planKey("501", SOL), chainIndex: "501", address: SOL, symbol: "STONK", profile: "alvo_10", entryPriceUsd: 1, entryAtMs: 0, peakPriceUsd: 1, targetHit: false, trimmed: false, cycleId: "c", ...over });
const plans = (...list: PositionPlan[]) => ({ get: (key: string) => list.find((p) => p.key === key) });
const looked = (price: number, key = planKey("501", SOL)) => new Map([[key, price]]);

describe("what the guard sees that is worth another look of the model", () => {
  test("a move of half the plan's stop distance from what the model last saw is one fact; less than that is nothing", () => {
    // alvo_10 stops at 6 percent: the step is 3 percent
    const p = plans(plan());
    expect(priceMoveEvents({ looked: looked(1), book: book([position({ priceUsd: 1.029 })]), plans: p, nowMs: 1_000_100 })).toEqual([]);
    const up = priceMoveEvents({ looked: looked(1), book: book([position({ priceUsd: 1.03 })]), plans: p, nowMs: 1_000_100 });
    expect(up).toHaveLength(1);
    expect(parseOpportunityEvent(up[0])).toEqual(up[0]!);
    expect(up[0]).toMatchObject({ assetKey: `token:501:${SOL}`, source: "guard_book", kind: "price_changed", observedAtMs: 1_000_000 });
    expect(priceMoveEvents({ looked: looked(1), book: book([position({ priceUsd: 0.97 })]), plans: p, nowMs: 1_000_100 })).toHaveLength(1);
  });

  test("the step follows the plan: a tighter plan asks sooner, a wider one later", () => {
    const tight = plans(plan({ profile: "alvo_2" })); // stop 1.5, step 0.75
    expect(priceMoveEvents({ looked: looked(1), book: book([position({ priceUsd: 1.008 })]), plans: tight, nowMs: 1_000_100 })).toHaveLength(1);
    const wide = plans(plan({ profile: "alvo_20" })); // stop 10, step 5
    expect(priceMoveEvents({ looked: looked(1), book: book([position({ priceUsd: 1.04 })]), plans: wide, nowMs: 1_000_100 })).toEqual([]);
  });

  test("the same size of move is the same fact, a bigger one or the other way is a new one", () => {
    const p = plans(plan());
    const at = (price: number) => priceMoveEvents({ looked: looked(1), book: book([position({ priceUsd: price })]), plans: p, nowMs: 1_000_100 })[0]!.fingerprint;
    expect(at(1.031)).toBe(at(1.058));
    expect(at(1.031)).not.toBe(at(1.061));
    expect(at(1.031)).not.toBe(at(0.969));
    expect(at(1.031)).toMatch(/^[a-f0-9]{64}$/);
  });

  test("without a plan, a baseline, a price, a size, the agent's wallet or a token that is not cash, there is no fact", () => {
    const moved = position({ priceUsd: 1.2 });
    const run = (pos: Position, over: { looked?: Map<string, number>; plans?: ReturnType<typeof plans> } = {}) =>
      priceMoveEvents({ looked: over.looked ?? looked(1), book: book([pos]), plans: over.plans ?? plans(plan()), nowMs: 1_000_100 });
    expect(run(moved)).toHaveLength(1);
    expect(run(moved, { plans: plans() })).toEqual([]);
    expect(run(moved, { looked: new Map() })).toEqual([]);
    expect(run(position({ priceUsd: null }))).toEqual([]);
    expect(run(position({ priceUsd: Number.NaN }))).toEqual([]);
    expect(run(position({ priceUsd: 1.2, usd: MIN_EVENT_POSITION_USD - 0.01 }))).toEqual([]);
    expect(run(position({ priceUsd: 1.2, usd: null }))).toEqual([]);
    expect(run(position({ priceUsd: 1.2, wallet: "principal" }))).toEqual([]);
    expect(run(position({ priceUsd: 1.2, isCash: true }))).toEqual([]);
    expect(run(moved, { looked: looked(0) })).toEqual([]);
  });

  test("an EVM address is written the way the dispatcher accepts it, and the time is never in the future", () => {
    const key = planKey("8453", EVM);
    const evm = position({ id: `token:8453:${EVM}`, chainIndex: "8453", address: EVM, priceUsd: 1.2 });
    const out = priceMoveEvents({ looked: looked(1, key), book: book([evm], 5_000), plans: plans(plan({ key, chainIndex: "8453", address: EVM })), nowMs: 4_000 });
    expect(out).toHaveLength(1);
    expect(out[0]!.assetKey).toBe(`token:8453:${EVM.toLowerCase()}`);
    expect(out[0]!.observedAtMs).toBe(4_000);
    expect(parseOpportunityEvent(out[0])).not.toBeNull();
  });

  test("what the model saw is the price of each held token that was priced, never cash", () => {
    const seen = pricesOf(book([position({ priceUsd: 2 }), position({ id: "x", address: "x2", priceUsd: 1, isCash: true }), position({ id: "y", address: "y2", priceUsd: null }), position({ id: "z", address: "z2", priceUsd: 3, wallet: "principal" })]));
    expect([...seen.entries()]).toEqual([[planKey("501", SOL), 2]]);
  });
});

describe("when a fact may ask for another look", () => {
  const ready = { connected: true, lockHeld: true, closing: false, auto: true, lastCycleAtMs: 1_000_000, nowMs: 1_090_000, minGapMs: 90_000, budgetOk: true };

  test("only connected, holding the folder, not closing, in the autonomous mode, with the day's budget left and the gap since the last cycle gone", () => {
    expect(eventsAllowed(ready)).toBe(true);
    for (const off of [{ connected: false }, { lockHeld: false }, { closing: true }, { auto: false }, { budgetOk: false }, { nowMs: 1_089_999 }]) {
      expect(eventsAllowed({ ...ready, ...off })).toBe(false);
    }
  });

  test("no cycle yet means no gap to wait, and a gap of zero never blocks", () => {
    expect(eventsAllowed({ ...ready, lastCycleAtMs: null, nowMs: 5 })).toBe(true);
    expect(eventsAllowed({ ...ready, minGapMs: 0, nowMs: 1_000_000 })).toBe(true);
  });
});
