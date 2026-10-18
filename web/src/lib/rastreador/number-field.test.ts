// RAS-4: what a person types in a numeric filter. The box keeps the text as typed while they type, so a minus sign or a decimal point on its way is not
// thrown away by a box that shows the number again; the filter changes only when the text really is a number; and text that is only "like" a number (a
// hexadecimal, an exponent) is not one. origin: synthetic_fixture, tests only.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { invalidReason, isInvalidText, numberText, parseTyped } from "./number-field";

describe("what the text means", () => {
  test("a plain number, with a point or a comma and a minus sign, is that number; nothing is the absence of one", () => {
    expect(parseTyped("12")).toEqual({ ok: true, value: 12 });
    expect(parseTyped("-3")).toEqual({ ok: true, value: -3 });
    expect(parseTyped("1.5")).toEqual({ ok: true, value: 1.5 });
    expect(parseTyped("1,5")).toEqual({ ok: true, value: 1.5 });
    expect(parseTyped("-0.5")).toEqual({ ok: true, value: -0.5 });
    expect(parseTyped("0")).toEqual({ ok: true, value: 0 });
    expect(parseTyped("")).toEqual({ ok: true, value: null });
    expect(parseTyped("   ")).toEqual({ ok: true, value: null });
  });

  test("a number that starts with the point is a number, and a text that is a thousands separator in pt-BR is not read as a decimal", () => {
    expect(parseTyped(".5")).toEqual({ ok: true, value: 0.5 });
    expect(parseTyped("-,25")).toEqual({ ok: true, value: -0.25 });
    expect(parseTyped("0.500")).toEqual({ ok: true, value: 0.5 });
    expect(parseTyped("1.0000")).toEqual({ ok: true, value: 1 });
    // "1.000" is one thousand in pt-BR and one in en: it is not guessed, it is refused, and so is every grouped number
    for (const grouped of ["1.000", "12.345", "1.000.000", "999.999.999", "1,000", "12,345", "1,000,000"]) expect(parseTyped(grouped)).toEqual({ ok: false });
    // a comma with one, two or four digits after it is a decimal comma, and is a number
    for (const decimal of ["1,5", "1,50", "0,500", "1,0000"]) expect(parseTyped(decimal)).toMatchObject({ ok: true });
  });

  test("the box is marked invalid when the text is not a number, or is one the filter does not accept, and not while it is empty or on its way", () => {
    expect(isInvalidText("abc")).toBe(true);
    expect(isInvalidText("1.000")).toBe(true);
    expect(isInvalidText("12")).toBe(false);
    expect(isInvalidText("")).toBe(false);
    expect(isInvalidText("-")).toBe(false);
    expect(isInvalidText("0.")).toBe(false);
    expect(isInvalidText("-5", (n) => n >= 0)).toBe(true);
    // a text that is only digits but too long to be a number is invalid, not "on its way"
    expect(isInvalidText("9".repeat(40))).toBe(true);
    expect(isInvalidText("1,000")).toBe(true);
    expect(isInvalidText("5", (n) => n >= 0)).toBe(false);
  });

  test("a number on its way (a sign, a point, a comma at the end) is not a number yet and changes nothing", () => {
    for (const midway of ["-", ".", "-.", "0.", "1,", "-1.", ",", "-,"]) expect(parseTyped(midway)).toEqual({ ok: false });
    // a number on its way is not invalid: only the filter waits
    for (const midway of ["-", ".", "-.", "0.", "1,", "-1.", ",", "-,"]) expect(isInvalidText(midway)).toBe(false);
  });

  test("something that only looks like a number is not one: a hexadecimal, an exponent, a word, two points, a plus, a very long text", () => {
    for (const bad of ["0x10", "1e3", "abc", "1.2.3", "--1", "+1", "1 2", "Infinity", "NaN", "9".repeat(40)]) expect(parseTyped(bad)).toEqual({ ok: false });
  });
});

describe("an invalid box is marked in words and in colour", () => {
  test("the reason is a sentence for a text that is not a number and another for one the filter does not take, and nothing for a good or unfinished text", () => {
    expect(invalidReason("abc")).toBe("Nao e um numero: use so digitos, com ponto ou virgula decimal e sem separador de milhar");
    expect(invalidReason("1.000")).toContain("sem separador de milhar");
    expect(invalidReason("-5", (n) => n >= 0)).toBe("Este filtro nao aceita este valor");
    for (const fine of ["", "12", "-", "0.", "-3"]) expect(invalidReason(fine)).toBeNull();
    for (const text of [invalidReason("abc"), invalidReason("-5", (n) => n >= 0)]) expect(/^[\x20-\x7e]+$/.test(text!)).toBe(true);
  });

  test("the mark has a rule in the style sheet, so it is seen and not only announced", () => {
    const css = readFileSync(join(import.meta.dir, "../../components/Rastreador/RastreadorView.module.css"), "utf8");
    expect(css).toContain('.field input[aria-invalid="true"]');
    expect(css).toContain(".fieldHint");
  });
});

describe("what the box shows when the person is not typing", () => {
  test("the number as a text, and nothing for no number", () => {
    expect(numberText(null)).toBe("");
    expect(numberText(0)).toBe("0");
    expect(numberText(-3)).toBe("-3");
    expect(numberText(1.5)).toBe("1.5");
    expect(numberText(1_000_000)).toBe("1000000");
  });
});
