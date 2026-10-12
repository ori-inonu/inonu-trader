import { expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { assertOperatorKeyIsDedicated, killSwitchPresent, parseRealizedUsd } from "./cli-guards";

test("parseRealizedUsd accepts a plain signed decimal inside twice the plan size limit, boundaries included", () => {
  expect(parseRealizedUsd("-0.25", 5)).toBe(-0.25);
  expect(parseRealizedUsd("0", 5)).toBe(0);
  expect(parseRealizedUsd("10", 5)).toBe(10);
  expect(parseRealizedUsd("-10", 5)).toBe(-10);
  expect(parseRealizedUsd("9.999", 5)).toBe(9.999);
  // A negative zero is stored as a plain zero.
  expect(Object.is(parseRealizedUsd("-0", 5), 0)).toBe(true);
});

test("parseRealizedUsd refuses values beyond twice the plan size limit and the limit follows the policy", () => {
  expect(() => parseRealizedUsd("10.01", 5)).toThrow("--realized exige");
  expect(() => parseRealizedUsd("-10.01", 5)).toThrow("--realized exige");
  expect(() => parseRealizedUsd("42", 5)).toThrow("--realized exige");
  expect(parseRealizedUsd("2", 1)).toBe(2);
  expect(() => parseRealizedUsd("2.5", 1)).toThrow("--realized exige");
  expect(parseRealizedUsd("200", 100)).toBe(200);
  expect(() => parseRealizedUsd("201", 100)).toThrow("--realized exige");
  // The message names the limit that applies, so the operator can tell a typo from a real loss.
  expect(() => parseRealizedUsd("42", 5)).toThrow("-10 e 10");
});

test("parseRealizedUsd refuses anything that is not a plain decimal number", () => {
  for (const raw of [undefined, "", " ", "lots", "1e1", "+5", ".5", "5.", "--live", "NaN", "Infinity", "-Infinity", "0x10", " 5", "5 ", "1,5", "--5"]) {
    expect(() => parseRealizedUsd(raw, 5)).toThrow("--realized exige");
  }
});

function failingStat(code?: string): () => never {
  return () => { throw Object.assign(new Error("synthetic stat failure"), code === undefined ? {} : { code }); };
}

test("killSwitchPresent: only a clear ENOENT means the STOP file is absent (R8 N15)", () => {
  const path = "C:/data/operator/STOP";
  expect(killSwitchPresent(path, failingStat("ENOENT"))).toBe(false);
  expect(killSwitchPresent(path, () => ({}))).toBe(true);
  // Anything else is a filesystem that cannot answer; a kill switch that cannot be read counts as set.
  for (const code of ["EACCES", "EPERM", "EIO", "EBUSY", "ENOTDIR", "ELOOP", "EMFILE"]) expect(killSwitchPresent(path, failingStat(code))).toBe(true);
  expect(killSwitchPresent(path, failingStat())).toBe(true);
  expect(killSwitchPresent(path, () => { throw "not even an Error"; })).toBe(true);
  expect(killSwitchPresent(path, () => { throw null; })).toBe(true);
});

test("killSwitchPresent asks the stat function about the exact path and, by default, the real filesystem", () => {
  const asked: string[] = [];
  expect(killSwitchPresent("C:/data/operator/STOP", (path) => { asked.push(path); return {}; })).toBe(true);
  expect(asked).toEqual(["C:/data/operator/STOP"]);

  const dir = mkdtempSync(join(tmpdir(), "inonu-stop-"));
  try {
    const stop = join(dir, "STOP");
    expect(killSwitchPresent(stop)).toBe(false);
    writeFileSync(stop, "");
    expect(killSwitchPresent(stop)).toBe(true);
    rmSync(stop);
    mkdirSync(stop);
    expect(killSwitchPresent(stop)).toBe(true);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

// Synthetic keys only: repeated bytes, never a funded account.
const KEY_11 = "0x" + "11".repeat(32);
const KEY_22 = "0x" + "22".repeat(32);
const CURVE_ORDER = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141n;
const hex32 = (value: bigint) => "0x" + value.toString(16).padStart(64, "0");

test("assertOperatorKeyIsDedicated refuses a key that derives the trader's address and lets different keys through (R8 C4, R10 B1)", async () => {
  await expect(assertOperatorKeyIsDedicated(KEY_11, KEY_11)).rejects.toThrow("same address");
  await expect(assertOperatorKeyIsDedicated(KEY_11, KEY_22)).resolves.toBeUndefined();
  await expect(assertOperatorKeyIsDedicated(KEY_22, KEY_11)).resolves.toBeUndefined();
});

test("assertOperatorKeyIsDedicated compares addresses, so letter case and a second spelling of one key are caught", async () => {
  await expect(assertOperatorKeyIsDedicated("0x" + "ab".repeat(32), "0x" + "AB".repeat(32))).rejects.toThrow("same address");
  await expect(assertOperatorKeyIsDedicated("0x" + "AB".repeat(32), "0x" + "ab".repeat(32))).rejects.toThrow("same address");
  // k and k + n (n = the order of the curve) are two different 32 byte strings for the same public key and account.
  const small = 0xc0ffeen;
  const other = hex32(CURVE_ORDER + small);
  expect(other).not.toBe(hex32(small));
  await expect(assertOperatorKeyIsDedicated(hex32(small), other)).rejects.toThrow("same address");
  await expect(assertOperatorKeyIsDedicated(other, hex32(small))).rejects.toThrow("same address");
  await expect(assertOperatorKeyIsDedicated(hex32(small), hex32(small + 1n))).resolves.toBeUndefined();
});

test("assertOperatorKeyIsDedicated has nothing to compare without a trader key", async () => {
  await expect(assertOperatorKeyIsDedicated(KEY_11, undefined)).resolves.toBeUndefined();
  await expect(assertOperatorKeyIsDedicated(KEY_11, "")).resolves.toBeUndefined();
});

test("assertOperatorKeyIsDedicated fails closed on a key it cannot derive and never echoes key material or addresses", async () => {
  const zero = "0x" + "00".repeat(32);
  for (const [operatorKey, traderKey] of [[zero, KEY_22], [KEY_11, zero]] as const) {
    const error = await assertOperatorKeyIsDedicated(operatorKey, traderKey).then(() => null, (caught: unknown) => caught as Error);
    expect(error).toBeInstanceOf(Error);
    expect(error!.message).toContain("Cannot derive an address");
    expect(error!.message).not.toContain("1111");
    expect(error!.message).not.toContain("2222");
  }
  const refusal = await assertOperatorKeyIsDedicated(KEY_11, KEY_11).then(() => null, (caught: unknown) => caught as Error);
  expect(refusal!.message).not.toContain("1111");
  expect(refusal!.message).not.toMatch(/0x[0-9a-fA-F]{8}/);
});
