import { describe, expect, test } from "bun:test";
import { isOnchainFocus, parseOnchainFocus } from "./focus";

const GOOD = { chainIndex: "1", address: "0xabc123", symbol: "PEPE", name: "Pepe" };

describe("onchain focus validator", () => {
  test("accepts a well formed focus, name optional", () => {
    expect(isOnchainFocus(GOOD)).toBe(true);
    expect(isOnchainFocus({ ...GOOD, name: null })).toBe(true);
    expect(isOnchainFocus({ ...GOOD, name: undefined })).toBe(true);
    expect(parseOnchainFocus(GOOD)).toEqual(GOOD);
  });

  test("rejects each field rule independently", () => {
    expect(isOnchainFocus({ ...GOOD, chainIndex: "abc" })).toBe(false);
    expect(isOnchainFocus({ ...GOOD, chainIndex: "1".repeat(13) })).toBe(false);
    expect(isOnchainFocus({ ...GOOD, address: "" })).toBe(false);
    expect(isOnchainFocus({ ...GOOD, address: "0x with space" })).toBe(false);
    expect(isOnchainFocus({ ...GOOD, address: "x".repeat(129) })).toBe(false);
    expect(isOnchainFocus({ ...GOOD, address: "a\tb" })).toBe(false);
    expect(isOnchainFocus({ ...GOOD, symbol: "" })).toBe(false);
    expect(isOnchainFocus({ ...GOOD, symbol: "X".repeat(25) })).toBe(false);
    expect(isOnchainFocus({ ...GOOD, name: 7 })).toBe(false);
    expect(isOnchainFocus(null)).toBe(false);
    expect(isOnchainFocus("PEPE")).toBe(false);
    expect(isOnchainFocus([GOOD])).toBe(false);
  });

  test("parseOnchainFocus normalizes undefined name to null", () => {
    const parsed = parseOnchainFocus({ chainIndex: "501", address: "SoL", symbol: "WIF" });
    expect(parsed).toEqual({ chainIndex: "501", address: "SoL", symbol: "WIF", name: null });
    expect(parseOnchainFocus({ chainIndex: "x", address: "a", symbol: "s" })).toBeNull();
  });
});
