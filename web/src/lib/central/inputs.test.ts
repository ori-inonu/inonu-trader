import { describe, expect, test } from "bun:test";
import {
  DEFAULT_PHASE_DRAFT,
  DEFAULT_RISK_DRAFT,
  checkNumber,
  parseDecimalText,
  parsePhaseDraft,
  parseRiskDraft,
} from "./inputs";

describe("parseDecimalText", () => {
  test("empty text is absent, not zero", () => {
    expect(parseDecimalText("")).toBeNull();
    expect(parseDecimalText("   ")).toBeNull();
  });

  test("accepts one decimal separator, comma or dot", () => {
    expect(parseDecimalText("5")).toBe(5);
    expect(parseDecimalText("5.5")).toBe(5.5);
    expect(parseDecimalText("5,5")).toBe(5.5);
    expect(parseDecimalText(" 0,25 ")).toBe(0.25);
    expect(parseDecimalText(".5")).toBe(0.5);
    expect(parseDecimalText("-3")).toBe(-3);
    expect(parseDecimalText("+3")).toBe(3);
    expect(parseDecimalText("6,67")).toBe(6.67);
  });

  test("rejects thousands separators, exponents, words and non ASCII digits", () => {
    for (const bad of ["1.000,5", "1,000.5", "1.2.3", "1,2,3", "1e3", "abc", "1 000", "Infinity", "NaN", "0x10", "٣", "--1", "1-", "5,", ","]) {
      expect(Number.isNaN(parseDecimalText(bad))).toBe(true);
    }
  });

  test("a trailing separator with digits before it is read as a whole number only when nothing follows it", () => {
    expect(Number.isNaN(parseDecimalText("5,"))).toBe(true);
    expect(Number.isNaN(parseDecimalText("5."))).toBe(true);
  });
});

describe("checkNumber", () => {
  const rule = { label: "Capital", min: 1, max: 1000 };

  test("returns the value when it is inside the range", () => {
    expect(checkNumber("100", rule)).toEqual({ ok: true, value: 100 });
    expect(checkNumber("1000", rule)).toEqual({ ok: true, value: 1000 });
    expect(checkNumber("1", rule)).toEqual({ ok: true, value: 1 });
  });

  test("explains an empty field, invalid text and a value out of range in pt-BR", () => {
    expect(checkNumber("", rule)).toEqual({ ok: false, reason: "empty", message: "Informe um valor." });
    const invalid = checkNumber("abc", rule);
    expect(invalid.ok).toBe(false);
    if (!invalid.ok) {
      expect(invalid.reason).toBe("invalid");
      expect(invalid.message).toContain("separador decimal");
    }
    const range = checkNumber("1001", rule);
    expect(range).toEqual({ ok: false, reason: "range", message: "Informe um valor entre 1 e 1.000." });
  });

  test("supports exclusive lower bounds", () => {
    const exclusive = { label: "Sigma", min: 0, max: 50, minExclusive: true };
    expect(checkNumber("0", exclusive).ok).toBe(false);
    expect(checkNumber("0,1", exclusive)).toEqual({ ok: true, value: 0.1 });
    const message = checkNumber("0", exclusive);
    if (!message.ok) expect(message.message).toBe("Informe um valor maior que 0 e até 50.");
  });
});

describe("risk draft", () => {
  test("the defaults describe a no edge example", () => {
    expect(DEFAULT_RISK_DRAFT).toEqual({ capital: "100", leverage: "5", sigmaPct: "4", days: "30", muPct: "0" });
    const parsed = parseRiskDraft(DEFAULT_RISK_DRAFT);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.value).toEqual({ capital: 100, leverage: 5, sigma: 0.04, days: 30, mu: 0 });
  });

  test("converts percent inputs to fractions", () => {
    const parsed = parseRiskDraft({ capital: "250,50", leverage: "2,5", sigmaPct: "3,5", days: "7", muPct: "0,1" });
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.value.capital).toBe(250.5);
      expect(parsed.value.leverage).toBe(2.5);
      expect(parsed.value.sigma).toBeCloseTo(0.035, 12);
      expect(parsed.value.days).toBe(7);
      expect(parsed.value.mu).toBeCloseTo(0.001, 12);
    }
  });

  test("a blank edge means zero, a negative edge is allowed", () => {
    const blank = parseRiskDraft({ ...DEFAULT_RISK_DRAFT, muPct: "" });
    expect(blank.ok && blank.value.mu).toBe(0);
    const negative = parseRiskDraft({ ...DEFAULT_RISK_DRAFT, muPct: "-0,05" });
    expect(negative.ok && negative.value.mu).toBeCloseTo(-0.0005, 12);
  });

  test("reports every invalid field with its own message", () => {
    const parsed = parseRiskDraft({ capital: "0", leverage: "200", sigmaPct: "abc", days: "", muPct: "60" });
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) {
      expect(Object.keys(parsed.errors).sort()).toEqual(["capital", "days", "leverage", "muPct", "sigmaPct"]);
      for (const message of Object.values(parsed.errors)) expect((message as string).length).toBeGreaterThan(5);
    }
  });

  test("bounds: leverage 0.1 to 100, sigma above 0 up to 50%, horizon 0.5 to 365 days", () => {
    expect(parseRiskDraft({ ...DEFAULT_RISK_DRAFT, leverage: "0,1" }).ok).toBe(true);
    expect(parseRiskDraft({ ...DEFAULT_RISK_DRAFT, leverage: "0,05" }).ok).toBe(false);
    expect(parseRiskDraft({ ...DEFAULT_RISK_DRAFT, leverage: "100" }).ok).toBe(true);
    expect(parseRiskDraft({ ...DEFAULT_RISK_DRAFT, sigmaPct: "50" }).ok).toBe(true);
    expect(parseRiskDraft({ ...DEFAULT_RISK_DRAFT, sigmaPct: "51" }).ok).toBe(false);
    expect(parseRiskDraft({ ...DEFAULT_RISK_DRAFT, days: "0,5" }).ok).toBe(true);
    expect(parseRiskDraft({ ...DEFAULT_RISK_DRAFT, days: "366" }).ok).toBe(false);
  });
});

describe("phase draft", () => {
  test("defaults to the example capital and the MON reference sigma", () => {
    expect(DEFAULT_PHASE_DRAFT).toEqual({ capital: "100", asset: "MON", customSigmaPct: "6,67" });
    const parsed = parsePhaseDraft(DEFAULT_PHASE_DRAFT);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.value.capital).toBe(100);
      expect(parsed.value.sigma).toBe(0.0667);
      expect(parsed.value.assetLabel).toBe("MON");
    }
  });

  test("a preset ignores the custom sigma text", () => {
    const parsed = parsePhaseDraft({ capital: "500", asset: "BTC", customSigmaPct: "garbage" });
    expect(parsed.ok && parsed.value.sigma).toBe(0.0196);
  });

  test("a custom asset uses the typed sigma in percent", () => {
    const parsed = parsePhaseDraft({ capital: "500", asset: "custom", customSigmaPct: "4,5" });
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.value.sigma).toBeCloseTo(0.045, 12);
      expect(parsed.value.assetLabel).toBe("Outro ativo");
    }
    const invalid = parsePhaseDraft({ capital: "500", asset: "custom", customSigmaPct: "" });
    expect(invalid.ok).toBe(false);
    if (!invalid.ok) expect(Object.keys(invalid.errors)).toEqual(["customSigmaPct"]);
  });

  test("capital must be positive", () => {
    const parsed = parsePhaseDraft({ capital: "-5", asset: "MON", customSigmaPct: "" });
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(Object.keys(parsed.errors)).toEqual(["capital"]);
  });
});
