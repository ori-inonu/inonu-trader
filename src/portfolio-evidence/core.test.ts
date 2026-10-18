import { describe, expect, test } from "bun:test";
import { canonicalJson, hashOf } from "./canonical.ts";
import { atomsToDec, decAdd, decCmp, decMul, decRound, decSub, decSum, decToAtoms, decToText, deriveDecimals, parseAtoms, parseDec, ratioBps } from "./decimal.ts";
import { buildIdentity, canonicalAccount, sanitizeDisplay } from "./identity.ts";
import { freshnessOf, freshnessReport, statusOfState, worstStatus } from "./state.ts";

const text = (value: string, signed = false) => decToText(parseDec(value, signed)!);

describe("decimal text", () => {
  test("only plain decimal text is read", () => {
    for (const bad of ["", " 1", "1 ", "1e5", "0x10", "1,5", ".5", "5.", "+1", "-1", "NaN", "Infinity", "1.2.3", "１２"]) expect(parseDec(bad)).toBeNull();
    expect(parseDec(5 as unknown)).toBeNull();
    expect(parseDec(null)).toBeNull();
    expect(parseDec("-1.5", true)).not.toBeNull();
    expect(parseDec("1".repeat(81))).toBeNull();
    expect(parseDec(`0.${"1".repeat(61)}`)).toBeNull();
  });

  test("canonical text drops trailing zeros and never prints a negative zero", () => {
    expect(text("0002.5000")).toBe("2.5");
    expect(text("0.000")).toBe("0");
    expect(text("-0.00", true)).toBe("0");
    expect(text("-0.5", true)).toBe("-0.5");
    expect(text("100")).toBe("100");
    expect(text("0.000000000000000001")).toBe("0.000000000000000001");
  });

  test("arithmetic is exact beyond double precision", () => {
    const a = parseDec("0.1")!;
    const b = parseDec("0.2")!;
    expect(decToText(decAdd(a, b))).toBe("0.3");
    expect(decToText(decSub(parseDec("1")!, parseDec("0.999999999999999999")!))).toBe("0.000000000000000001");
    expect(decToText(decMul(parseDec("123456789012345678901234567890")!, parseDec("1000000000000000000")!))).toBe("123456789012345678901234567890000000000000000000");
    expect(decCmp(parseDec("1.10")!, parseDec("1.1")!)).toBe(0);
    expect(decSum([])).toBeNull();
  });

  test("atoms: exact conversion, never a silent truncation", () => {
    expect(decToAtoms(parseDec("2.5")!, 6)).toBe(2_500_000n);
    expect(decToAtoms(parseDec("2.5000000")!, 6)).toBe(2_500_000n);
    expect(decToAtoms(parseDec("2.5000001")!, 6)).toBeNull();
    expect(decToAtoms(parseDec("1")!, 37)).toBeNull();
    expect(decToText(atomsToDec(1_500_000_000_000_000_000n, 18))).toBe("1.5");
    expect(parseAtoms("007")).toBe(7n);
    expect(parseAtoms("1.5")).toBeNull();
    expect(parseAtoms("")).toBeNull();
  });

  test("decimals are verified from the ratio, never guessed", () => {
    expect(deriveDecimals(parseDec("2.5")!, 2_500_000n)).toBe(6);
    expect(deriveDecimals(parseDec("1")!, 1_000_000_000_000_000_000n)).toBe(18);
    expect(deriveDecimals(parseDec("1")!, 1n)).toBe(0);
    expect(deriveDecimals(parseDec("0")!, 0n)).toBeNull();
    expect(deriveDecimals(parseDec("1.5")!, 1234n)).toBeNull();
  });

  test("rounding is declared and only for display", () => {
    expect(decToText(decRound(parseDec("2.345")!, 2, "half_even"))).toBe("2.34");
    expect(decToText(decRound(parseDec("2.355")!, 2, "half_even"))).toBe("2.36");
    expect(decToText(decRound(parseDec("2.349")!, 2, "floor"))).toBe("2.34");
    expect(decToText(decRound(parseDec("-2.341", true)!, 2, "floor"))).toBe("-2.35");
    expect(ratioBps(parseDec("1")!, parseDec("200")!)).toBe(50n);
    expect(ratioBps(parseDec("1")!, parseDec("0")!)).toBeNull();
  });
});

describe("canonical json and hashing", () => {
  test("key order does not change the hash; content does", () => {
    expect(canonicalJson({ b: 1, a: [2, { d: 4, c: 3 }] })).toBe('{"a":[2,{"c":3,"d":4}],"b":1}');
    expect(hashOf({ a: 1, b: 2 })).toBe(hashOf({ b: 2, a: 1 }));
    expect(hashOf({ a: 1 })).not.toBe(hashOf({ a: 2 }));
  });

  test("values with no canonical form are refused", () => {
    expect(() => canonicalJson({ a: undefined })).toThrow();
    expect(() => canonicalJson({ a: Number.NaN })).toThrow();
    expect(() => canonicalJson({ a: 1n })).toThrow();
  });
});

describe("identity is network plus contract", () => {
  test("EVM contracts are case-insensitive, Solana mints are not", () => {
    const lower = buildIdentity("1", "0x00000000000000000000000000000000000a0001");
    const upper = buildIdentity("1", "0x00000000000000000000000000000000000A0001");
    expect(lower.ok && upper.ok && lower.identity.key === upper.identity.key).toBe(true);
    const a = buildIdentity("501", "FixtureMint111111111111111111111111111111");
    const b = buildIdentity("501", "fixturemint111111111111111111111111111111");
    expect(a.ok).toBe(true);
    expect(b.ok).toBe(true);
    expect(a.ok && b.ok && a.identity.key !== b.identity.key).toBe(true);
  });

  test("the same contract on two networks is two assets; the symbol never matters", () => {
    const one = buildIdentity("1", "0x00000000000000000000000000000000000a0001");
    const base = buildIdentity("8453", "0x00000000000000000000000000000000000a0001");
    expect(one.ok && base.ok && one.identity.key !== base.identity.key).toBe(true);
  });

  test("the native coin has an explicit marker per network", () => {
    const eth = buildIdentity("1", "");
    expect(eth.ok && eth.identity.key).toBe("1:native");
    expect(eth.ok && eth.identity.asset).toEqual({ kind: "native_marker" });
    const sol = buildIdentity("501", "");
    expect(sol.ok && sol.identity.key).toBe("501:native");
  });

  test("wrong network and wrong contract syntax fail with closed codes", () => {
    expect(buildIdentity("999999", "")).toEqual({ ok: false, code: "unknown_network" });
    expect(buildIdentity(1, "")).toEqual({ ok: false, code: "unknown_network" });
    expect(buildIdentity("1", 5)).toEqual({ ok: false, code: "invalid_contract_type" });
    expect(buildIdentity("1", "FixtureMint111111111111111111111111111111")).toEqual({ ok: false, code: "invalid_contract_for_network" });
    expect(buildIdentity("501", "0x00000000000000000000000000000000000a0001")).toEqual({ ok: false, code: "invalid_contract_for_network" });
  });

  test("Sui coin types are accepted and normalized", () => {
    const built = buildIdentity("784", "0xABC::coin::COIN");
    expect(built.ok && built.identity.key).toBe("784:contract:0xabc::coin::COIN");
  });

  test("display text is bounded and stripped, and is not part of identity", () => {
    expect(sanitizeDisplay("  US\u0000DC\n").symbol).toBe("US DC");
    expect(sanitizeDisplay("x".repeat(100)).symbol?.length).toBe(32);
    expect(sanitizeDisplay("​​").symbol).toBeNull();
    expect(sanitizeDisplay(42).symbol).toBeNull();
  });

  test("account addresses compare canonically per network family", () => {
    expect(canonicalAccount("1", "0x00000000000000000000000000000000000F1401")).toBe("0x00000000000000000000000000000000000f1401");
    expect(canonicalAccount("1", "not-an-address")).toBeNull();
    expect(canonicalAccount("999999", "0x00000000000000000000000000000000000f1401")).toBeNull();
  });
});

describe("states and freshness", () => {
  test("freshness boundaries", () => {
    expect(freshnessOf(null, 1000, 10)).toBe("unknown");
    expect(freshnessOf(990, 1000, 10)).toBe("fresh");
    expect(freshnessOf(989, 1000, 10)).toBe("stale");
    expect(freshnessOf(1000 + 5_000, 1000, 10)).toBe("fresh");
    expect(freshnessOf(1000 + 5_001, 1000, 10)).toBe("future");
  });

  test("a measured offset moves the provider clock onto the local timeline", () => {
    expect(freshnessOf(1_000_000 + 120_000, 1_000_000, 60_000, 120_000)).toBe("fresh");
    expect(freshnessOf(1_000_000 + 120_000, 1_000_000, 60_000, null)).toBe("future");
  });

  test("capture and source clocks are independent", () => {
    expect(freshnessReport({ fetchedAtMs: 990, sourceTimeMs: null, clockOffsetMs: null }, 1000, 100)).toEqual({ capture: "fresh", source: "unknown" });
    expect(freshnessReport({ fetchedAtMs: 990, sourceTimeMs: 100, clockOffsetMs: null }, 1000, 100)).toEqual({ capture: "fresh", source: "stale" });
    expect(freshnessReport({ fetchedAtMs: null, sourceTimeMs: null, clockOffsetMs: null }, 1000, 100)).toEqual({ capture: "unknown", source: "unknown" });
  });

  test("states map to the five statuses and the worst wins", () => {
    expect(statusOfState("ok")).toBe("valid");
    expect(statusOfState("omitted_by_filter")).toBe("incomplete");
    expect(statusOfState("future")).toBe("stale");
    expect(worstStatus(["valid", "stale", "unreconciled"])).toBe("unreconciled");
    expect(worstStatus(["unreconciled", "divergent"])).toBe("divergent");
    expect(worstStatus([])).toBe("incomplete");
  });
});
