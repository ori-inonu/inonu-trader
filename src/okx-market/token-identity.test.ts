// T3.6, CHN-2, CHN-3: the identity of a token is the pair (network, address). An address is lower cased only on the networks that are EVM, because a Solana or a TON
// address is case sensitive and lower casing it would turn it into another address. CHN-2 names the seven EVM networks of the provider list that were missing:
// Monad (143), Robinhood (4663), Arc (5042), HyperEVM (999), Ink (57073), Pharos (1672) and Plasma (9745); a test for each. origin: synthetic_fixture, tests only.
import { describe, expect, test } from "bun:test";
import { normalizeTokenAddress, tokenAddressesEqual } from "./token-identity";

const MIXED = "0xAbCdEf0123456789aBcDeF0123456789AbCdEf01";
const MISSING: ReadonlyArray<readonly [string, string]> = [
  ["143", "Monad"], ["4663", "Robinhood"], ["5042", "Arc"], ["999", "HyperEVM"], ["57073", "Ink"], ["1672", "Pharos"], ["9745", "Plasma"],
];

describe("the networks whose addresses have no case", () => {
  for (const [chain, name] of MISSING) {
    test(`${name} (${chain}): the same token in two cases is one token`, () => {
      expect(normalizeTokenAddress(chain, MIXED)).toBe(MIXED.toLowerCase());
      expect(tokenAddressesEqual(chain, MIXED, MIXED.toLowerCase())).toBe(true);
    });
  }

  test("the networks that were already there still are", () => {
    for (const chain of ["1", "56", "196", "8453", "42161"]) expect(normalizeTokenAddress(chain, MIXED)).toBe(MIXED.toLowerCase());
  });

  test("a network that is not EVM keeps the address exactly as it is, and a mint that differs by case is another token", () => {
    for (const chain of ["501", "607", "784", "195", "0"]) expect(normalizeTokenAddress(chain, MIXED)).toBe(MIXED);
    expect(tokenAddressesEqual("501", "AbC1111111111111111111111111111111111111111", "abc1111111111111111111111111111111111111111")).toBe(false);
  });
});
