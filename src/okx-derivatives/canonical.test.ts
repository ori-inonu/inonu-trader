import { expect, test } from "bun:test";
import { canonicalJson, sha256Hex } from "./canonical.ts";

test("OKX-DERIV D14: canonical JSON sorts keys at every depth and is insensitive to input key order", () => {
  const first = { b: 1, a: { d: [3, { y: true, x: null }], c: "t" } };
  const second = { a: { c: "t", d: [3, { x: null, y: true }] }, b: 1 };
  expect(canonicalJson(first)).toBe('{"a":{"c":"t","d":[3,{"x":null,"y":true}]},"b":1}');
  expect(canonicalJson(second)).toBe(canonicalJson(first));
  expect(canonicalJson([])).toBe("[]");
  expect(canonicalJson({})).toBe("{}");
  expect(canonicalJson("a\"b")).toBe('"a\\"b"');
});

test("OKX-DERIV D14: canonical JSON refuses values that are not plain JSON", () => {
  for (const bad of [undefined, () => 1, Symbol("x"), 10n, Number.NaN, Number.POSITIVE_INFINITY, new Date(0), new Map(), { a: undefined }]) {
    expect(() => canonicalJson(bad)).toThrow(TypeError);
  }
});

test("OKX-DERIV D14: sha256Hex is the standard hex digest of the UTF-8 bytes", () => {
  expect(sha256Hex("")).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
  expect(sha256Hex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
});
