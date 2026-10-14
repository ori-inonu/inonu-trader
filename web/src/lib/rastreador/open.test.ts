// RAS-1: the Rastreador opens an asset on the desk through /?ativo=SYMBOL. The desk reads that once and accepts only a plain OKX
// instrument id: anything else in the address is ignored, never trusted. origin: synthetic_fixture, tests only.
import { describe, expect, test } from "bun:test";
import { focusFromSearch, openUrl } from "./open";

describe("openUrl", () => {
  test("is the desk with the instrument in the query", () => {
    expect(openUrl("SOL-USDT")).toBe("/?ativo=SOL-USDT");
    expect(openUrl("BTC-USDT-SWAP")).toBe("/?ativo=BTC-USDT-SWAP");
  });

  test("an id that is not an instrument opens the desk with nothing in the query", () => {
    expect(openUrl("a b")).toBe("/");
    expect(openUrl("<script>")).toBe("/");
    expect(openUrl("")).toBe("/");
  });
});

describe("focusFromSearch", () => {
  test("reads the instrument back", () => {
    expect(focusFromSearch("?ativo=SOL-USDT")).toBe("SOL-USDT");
    expect(focusFromSearch("?x=1&ativo=BTC-USDT-SWAP&y=2")).toBe("BTC-USDT-SWAP");
  });

  test("anything that is not a plain OKX instrument id is nothing", () => {
    for (const bad of ["", "?", "?ativo=", "?ativo=btc-usdt", "?ativo=BTC", "?ativo=<script>", "?ativo=BTC-USDT%20x", "?ativo=A-B-C-D", "?ativo=" + "A".repeat(80) + "-USDT", "?outro=BTC-USDT"]) {
      expect(focusFromSearch(bad)).toBeNull();
    }
  });

  test("the first value wins when the parameter is repeated", () => {
    expect(focusFromSearch("?ativo=ETH-USDT&ativo=BTC-USDT")).toBe("ETH-USDT");
  });
});
