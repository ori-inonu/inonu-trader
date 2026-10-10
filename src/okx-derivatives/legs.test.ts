import { expect, test } from "bun:test";
import { parseDecimal, ratInt } from "./decimal.ts";
import { priceLeg } from "./legs.ts";
import type { Level } from "./types.ts";

function dec(text: string) {
  const value = parseDecimal(text);
  if (value === null) throw new Error(`test decimal did not parse: ${text}`);
  return value;
}

function levels(rows: Array<[string, string]>): Level[] {
  return rows.map(([price, size]) => ({ price: dec(price), size: dec(size) }));
}

const bids = levels([["99.9", "30"], ["99.8", "40"]]);
const asks = levels([["100.1", "30"], ["100.2", "40"]]);
const mid = ratInt(100);

test("OKX-DERIV D3: a taker buy walks the asks and measures slippage against the touch and cost against the mid", () => {
  const result = priceLeg({ side: "buy", role: "taker", bids, asks, mid, bookSize: dec("40"), coin: dec("40") });
  expect(result.ok).toBe(true);
  if (!result.ok) return;
  expect(result.leg.avgPrice).toEqual(dec("100.125"));
  expect(result.leg.worstPrice).toEqual(dec("100.2"));
  expect(result.leg.touchPrice).toEqual(dec("100.1"));
  expect(result.leg.notional).toEqual(ratInt(4005));
  // 0.025 / 100.1 = 249.75 ppm rounds up
  expect(result.leg.slippagePpm).toBe(250n);
  // 40 coins x (100.125 - 100) = 5 quote = 5000000 micro
  expect(result.leg.executionCostMicro).toBe(5_000_000n);
});

test("OKX-DERIV D3: a taker sell walks the bids", () => {
  const result = priceLeg({ side: "sell", role: "taker", bids, asks, mid, bookSize: dec("40"), coin: dec("40") });
  expect(result.ok).toBe(true);
  if (!result.ok) return;
  expect(result.leg.avgPrice).toEqual(dec("99.875"));
  expect(result.leg.worstPrice).toEqual(dec("99.8"));
  expect(result.leg.touchPrice).toEqual(dec("99.9"));
  expect(result.leg.notional).toEqual(ratInt(3995));
  expect(result.leg.slippagePpm).toBe(251n);
  expect(result.leg.executionCostMicro).toBe(5_000_000n);
});

test("OKX-DERIV D2: book size in contracts and coin quantity are separate, notional uses coins", () => {
  // 40 contracts of 0.1 coin: the walk is over 40 book units but the notional is for 4 coins
  const result = priceLeg({ side: "buy", role: "taker", bids, asks, mid, bookSize: dec("40"), coin: dec("4") });
  expect(result.ok).toBe(true);
  if (!result.ok) return;
  expect(result.leg.avgPrice).toEqual(dec("100.125"));
  expect(result.leg.notional).toEqual(dec("400.5"));
  expect(result.leg.executionCostMicro).toBe(500_000n);
});

test("OKX-DERIV D3: a maker leg is assumed at the mid with no credit for the spread", () => {
  const buy = priceLeg({ side: "buy", role: "maker", bids, asks, mid, bookSize: dec("40"), coin: dec("40") });
  const sell = priceLeg({ side: "sell", role: "maker", bids, asks, mid, bookSize: dec("40"), coin: dec("40") });
  for (const result of [buy, sell]) {
    expect(result.ok).toBe(true);
    if (!result.ok) continue;
    expect(result.leg.avgPrice).toEqual(ratInt(100));
    expect(result.leg.worstPrice).toBeNull();
    expect(result.leg.notional).toEqual(ratInt(4000));
    expect(result.leg.slippagePpm).toBe(0n);
    expect(result.leg.executionCostMicro).toBe(0n);
  }
  if (buy.ok) expect(buy.leg.touchPrice).toEqual(dec("100.1"));
  if (sell.ok) expect(sell.leg.touchPrice).toEqual(dec("99.9"));
  // a maker leg does not need depth for its size
  expect(priceLeg({ side: "buy", role: "maker", bids, asks, mid, bookSize: dec("10000"), coin: dec("10000") }).ok).toBe(true);
});

test("OKX-DERIV D3: an execution better than the supplied mid is never credited as a negative cost", () => {
  // a mid of 105 is inconsistent with asks at 100.1 and bids at 99.9; the rule is that a leg never earns a credit versus the mid
  const buy = priceLeg({ side: "buy", role: "taker", bids, asks, mid: ratInt(105), bookSize: dec("40"), coin: dec("40") });
  const sell = priceLeg({ side: "sell", role: "taker", bids, asks, mid: ratInt(95), bookSize: dec("40"), coin: dec("40") });
  expect(buy.ok && buy.leg.executionCostMicro).toBe(0n);
  expect(sell.ok && sell.leg.executionCostMicro).toBe(0n);
});

test("OKX-DERIV D3: thin depth and a missing mid are distinct failures", () => {
  expect(priceLeg({ side: "buy", role: "taker", bids, asks, mid, bookSize: dec("71"), coin: dec("71") })).toEqual({ ok: false, reason: "depth" });
  expect(priceLeg({ side: "sell", role: "taker", bids, asks, mid, bookSize: dec("70.000000000000000001"), coin: dec("70") })).toEqual({ ok: false, reason: "depth" });
  expect(priceLeg({ side: "buy", role: "taker", bids, asks, mid: null, bookSize: dec("1"), coin: dec("1") })).toEqual({ ok: false, reason: "mid" });
  expect(priceLeg({ side: "buy", role: "maker", bids, asks, mid: null, bookSize: dec("1"), coin: dec("1") })).toEqual({ ok: false, reason: "mid" });
  // exactly the available depth is allowed
  expect(priceLeg({ side: "buy", role: "taker", bids, asks, mid, bookSize: dec("70"), coin: dec("70") }).ok).toBe(true);
});

test("OKX-DERIV D1: a sub-micro execution cost is rounded up so it never disappears", () => {
  const fineBids = levels([["99.9999996", "10"]]);
  const fineAsks = levels([["100.0000004", "10"]]);
  const buy = priceLeg({ side: "buy", role: "taker", bids: fineBids, asks: fineAsks, mid, bookSize: dec("1"), coin: dec("1") });
  const sell = priceLeg({ side: "sell", role: "taker", bids: fineBids, asks: fineAsks, mid, bookSize: dec("1"), coin: dec("1") });
  // 0.0000004 quote is 0.4 micro units, so one micro unit is charged
  if (buy.ok) expect(buy.leg.executionCostMicro).toBe(1n);
  if (sell.ok) expect(sell.leg.executionCostMicro).toBe(1n);
  expect(buy.ok && sell.ok).toBe(true);
});
