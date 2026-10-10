import { expect, test } from "bun:test";
import { checkSize, coinQuantity, isMultipleOf, notionalOf } from "./contract.ts";
import { parseDecimal, ratInt } from "./decimal.ts";

function dec(text: string) {
  const value = parseDecimal(text);
  if (value === null) throw new Error(`test decimal did not parse: ${text}`);
  return value;
}

test("OKX-DERIV D2: contracts convert to coins and then to quote notional", () => {
  const coin = coinQuantity(dec("0.1"), dec("1"), dec("400"));
  expect(coin).toEqual(ratInt(40));
  expect(notionalOf(coin, dec("1001.1"))).toEqual(ratInt(40044));
  // the contract multiplier scales the coin quantity
  expect(coinQuantity(dec("0.01"), dec("10"), dec("150"))).toEqual(dec("15"));
  // a fractional number of contracts stays exact
  expect(coinQuantity(dec("0.01"), dec("1"), dec("0.07"))).toEqual(dec("0.0007"));
  expect(notionalOf(dec("0.0007"), dec("65000.5"))).toEqual(dec("45.50035"));
});

test("OKX-DERIV D2: lot size and minimum size validation use exact decimals", () => {
  expect(checkSize(dec("3"), dec("1"), dec("1"))).toBe("ok");
  expect(checkSize(dec("1.5"), dec("1"), dec("1"))).toBe("lot");
  expect(checkSize(dec("0.5"), dec("0.5"), dec("1"))).toBe("min");
  expect(checkSize(dec("0.07"), dec("0.01"), dec("0.01"))).toBe("ok");
  expect(checkSize(dec("0.075"), dec("0.01"), dec("0.01"))).toBe("lot");
  expect(checkSize(dec("0"), dec("1"), dec("1"))).toBe("invalid");
  expect(checkSize(dec("-2"), dec("1"), dec("1"))).toBe("invalid");
  // exact decimals: 0.3 is a multiple of 0.1, which binary floats get wrong
  expect(isMultipleOf(dec("0.3"), dec("0.1"))).toBe(true);
  expect(0.3 % 0.1 === 0).toBe(false);
  expect(isMultipleOf(dec("0.35"), dec("0.1"))).toBe(false);
});
