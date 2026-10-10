import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { DEFAULT_POLICY } from "./snapshot.ts";
import { INELIGIBLE_REASON_CODES, UNAVAILABLE_REASON_CODES } from "./types.ts";

// The documentation is part of the contract: these checks keep the SPEC and the guide in step with the code.

const spec = readFileSync(fileURLToPath(new URL("../../docs/OKX-DERIVATIVES-SPEC.md", import.meta.url)), "utf8");
const guide = readFileSync(fileURLToPath(new URL("../../docs/okx-derivatives-v1/GUIA.md", import.meta.url)), "utf8");

test("OKX-DERIV D17: the SPEC defines the acceptance criteria D1 to D17, each exactly once", () => {
  const ids = [...spec.matchAll(/^\| D(\d+) \|/gm)].map((match) => Number(match[1]));
  expect(ids).toEqual(Array.from({ length: 17 }, (_, index) => index + 1));
});

test("OKX-DERIV D17: every primary source page used is recorded with its address, and what was not confirmed", () => {
  expect([...spec.matchAll(/^\| S(\d+) \|/gm)].map((match) => match[1])).toEqual(["1", "2", "3", "4", "5", "6", "7", "8", "9"]);
  for (const address of [
    "https://www.okx.com/docs-v5/en/",
    "https://www.okx.com/docs-v5/trick_en/",
    "https://www.okx.com/docs-v5/log_en/",
    "https://www.okx.com/docs-v5/en/#trading-account-rest-api-get-fee-rates",
    "https://www.okx.com/en-us/help/perps-funding-fee-mechanism",
    "https://www.okx.com/help/okx-to-optimize-funding-rate-calculation",
    "https://www.okx.com/en-us/help/forced-liquidation-faq",
    "https://www.okx.com/en-us/help/trading-fee-rules-faq",
    "https://www.okx.com/en-us/help/adjustment-of-usdt-margined-futures-perpetual-swap-tiered-maintenance-margin-ratio-schedule",
  ]) {
    expect(spec, address).toContain(address);
  }
  expect(spec).toContain("O que NÃO foi confirmado");
  expect(spec).toContain("trunca antes da seção Public Data");
  expect(spec).toContain("2026-10-10");
});

test("OKX-DERIV D17: every reason code of the closed vocabulary appears in the SPEC with its class", () => {
  const section = spec.slice(spec.indexOf("## 8. Veredito"), spec.indexOf("## 9. Entrada"));
  for (const code of INELIGIBLE_REASON_CODES) expect(section, code).toContain(`\`${code}\``);
  for (const code of UNAVAILABLE_REASON_CODES) expect(section, code).toContain(`\`${code}\``);
  const rows = section.split("\n").filter((line) => line.startsWith("| `"));
  expect(rows.filter((line) => line.includes("| inelegível |")).length).toBeGreaterThanOrEqual(6);
  expect(rows.filter((line) => line.includes("| indisponível |")).length).toBeGreaterThanOrEqual(9);
});

test("OKX-DERIV D17: the policy defaults documented in the SPEC are the defaults in the code", () => {
  const section = spec.slice(spec.indexOf("## 7. Política"), spec.indexOf("## 8. Veredito"));
  for (const [key, value] of Object.entries(DEFAULT_POLICY)) {
    if (typeof value === "number") expect(section, key).toMatch(new RegExp(`\\| \`${key}\`[^|]*\\| ${value}\\b`));
  }
  expect(section).toContain("| `stressMovesPpm` | [100000, 250000] |");
  expect(section).toContain("`maxLeverage` | 3 |");
});

test("OKX-DERIV D17: the SPEC and the guide state the limits of the model and what is not qualified", () => {
  // booleans on purpose: a failure then prints the missing phrase, not the whole document
  for (const phrase of ["não é a fórmula exata da OKX", "DESCONHECIDO", "## 11. Não objetivos", "Alavancagem não cria vantagem econômica", "contra o trader", "liveQualified: false", "financiallyAuthorized: false", "Fixtures são sintéticas"]) {
    expect(spec.includes(phrase), `SPEC lacks: ${phrase}`).toBe(true);
  }
  for (const phrase of [
    "bun --no-env-file run scripts/okx-derivatives.ts", "okx:derivatives", "--snapshot", "--now-ms", "inteiramente sintética", "modelo simplificado de margem isolada",
    "não é a fórmula exata da OKX", "não é autorização financeira", "sem confirmação", "somente como risco", "carry.comparison", "unknownInputs", "OKX-DERIVATIVES-SPEC.md",
  ]) {
    expect(guide.includes(phrase), `GUIA lacks: ${phrase}`).toBe(true);
  }
  // the guide never presents a synthetic number as a promise
  expect(/garantid|garantia de|promete|lucro certo|retorno garantido/i.test(guide.replace(/nenhum retorno é garantido|não .{0,40}garant/gi, ""))).toBe(false);
});
