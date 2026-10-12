import { expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { killSwitchPresent, parseRealizedUsd } from "./cli-guards";

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
