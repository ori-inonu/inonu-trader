// Parsing and validation of the text fields of the /central page.
//
// Fields are plain text (a decimal keypad on phones, comma or dot as decimal separator). Nothing is read from the network,
// from the wallet or from storage: the values live in React state and disappear on reload.

import { formatCompact } from "./format";
import { PHASE_REFERENCE_SIGMAS } from "./phases";

const DECIMAL_PATTERN = /^[+-]?(?:\d+(?:[.,]\d+)?|[.,]\d+)$/;

/**
 * Decimal text to number. Returns null for empty text (absent) and NaN for text that is not a plain decimal number.
 * Exactly one separator is accepted, comma or dot; thousands separators, exponents and words are rejected on purpose, since
 * "1.000" would be ambiguous between 1 and one thousand.
 */
export function parseDecimalText(text: string): number | null {
  const trimmed = text.trim();
  if (trimmed === "") return null;
  if (!DECIMAL_PATTERN.test(trimmed)) return Number.NaN;
  const value = Number(trimmed.replace(",", "."));
  if (!Number.isFinite(value)) return Number.NaN;
  return value === 0 ? 0 : value;
}

export interface NumberRule {
  label: string;
  min: number;
  max: number;
  /** When true the minimum itself is not accepted. */
  minExclusive?: boolean;
}

export type FieldCheck =
  | { ok: true; value: number }
  | { ok: false; reason: "empty" | "invalid" | "range"; message: string };

export function checkNumber(text: string, rule: NumberRule): FieldCheck {
  const parsed = parseDecimalText(text);
  if (parsed === null) return { ok: false, reason: "empty", message: "Informe um valor." };
  if (Number.isNaN(parsed)) {
    return { ok: false, reason: "invalid", message: "Use apenas números, com vírgula ou ponto como separador decimal, sem separador de milhar." };
  }
  const aboveMin = rule.minExclusive ? parsed > rule.min : parsed >= rule.min;
  if (!aboveMin || parsed > rule.max) {
    const message = rule.minExclusive
      ? `Informe um valor maior que ${formatCompact(rule.min)} e até ${formatCompact(rule.max)}.`
      : `Informe um valor entre ${formatCompact(rule.min)} e ${formatCompact(rule.max)}.`;
    return { ok: false, reason: "range", message };
  }
  return { ok: true, value: parsed };
}

export type ParseResult<T, K extends string> = { ok: true; value: T } | { ok: false; errors: Partial<Record<K, string>> };

// ---------------------------------------------------------------------------
// Risk calculator
// ---------------------------------------------------------------------------

export interface RiskDraft {
  capital: string;
  leverage: string;
  /** Daily volatility in percent, for example "4" for 4%. */
  sigmaPct: string;
  days: string;
  /** Assumed daily edge in percent; empty means zero. */
  muPct: string;
}

export interface RiskInputs {
  capital: number;
  leverage: number;
  sigma: number;
  days: number;
  mu: number;
}

export type RiskField = keyof RiskDraft;

export const DEFAULT_RISK_DRAFT: RiskDraft = { capital: "100", leverage: "5", sigmaPct: "4", days: "30", muPct: "0" };

export const RISK_RULES: Readonly<Record<RiskField, NumberRule>> = {
  capital: { label: "Capital", min: 0, max: 1e9, minExclusive: true },
  leverage: { label: "Alavancagem", min: 0.1, max: 100 },
  sigmaPct: { label: "Volatilidade diária", min: 0, max: 50, minExclusive: true },
  days: { label: "Horizonte", min: 0.5, max: 365 },
  muPct: { label: "Vantagem diária assumida", min: -50, max: 50 },
};

export function parseRiskDraft(draft: RiskDraft): ParseResult<RiskInputs, RiskField> {
  const errors: Partial<Record<RiskField, string>> = {};
  const values: Partial<Record<RiskField, number>> = {};
  for (const field of ["capital", "leverage", "sigmaPct", "days", "muPct"] as const) {
    if (field === "muPct" && draft.muPct.trim() === "") {
      values.muPct = 0;
      continue;
    }
    const check = checkNumber(draft[field], RISK_RULES[field]);
    if (check.ok) values[field] = check.value;
    else errors[field] = check.message;
  }
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return {
    ok: true,
    value: {
      capital: values.capital as number,
      leverage: values.leverage as number,
      sigma: (values.sigmaPct as number) / 100,
      days: values.days as number,
      mu: (values.muPct as number) / 100,
    },
  };
}

// ---------------------------------------------------------------------------
// Phase limits
// ---------------------------------------------------------------------------

export type PhaseAsset = "BTC" | "ETH" | "SOL" | "MON" | "custom";

export interface PhaseDraft {
  capital: string;
  asset: PhaseAsset;
  /** Used only when the asset is "custom". */
  customSigmaPct: string;
}

export interface PhaseInputs {
  capital: number;
  sigma: number;
  assetLabel: string;
}

export type PhaseField = "capital" | "customSigmaPct";

export const DEFAULT_PHASE_DRAFT: PhaseDraft = { capital: "100", asset: "MON", customSigmaPct: "6,67" };

export const PHASE_CAPITAL_RULE: NumberRule = { label: "Capital operacional", min: 0, max: 1e9, minExclusive: true };
export const PHASE_SIGMA_RULE: NumberRule = { label: "Volatilidade diária", min: 0, max: 50, minExclusive: true };

export function parsePhaseDraft(draft: PhaseDraft): ParseResult<PhaseInputs, PhaseField> {
  const errors: Partial<Record<PhaseField, string>> = {};
  const capital = checkNumber(draft.capital, PHASE_CAPITAL_RULE);
  if (!capital.ok) errors.capital = capital.message;

  let sigma = 0;
  let assetLabel = "Outro ativo";
  if (draft.asset === "custom") {
    const custom = checkNumber(draft.customSigmaPct, PHASE_SIGMA_RULE);
    if (custom.ok) sigma = custom.value / 100;
    else errors.customSigmaPct = custom.message;
  } else {
    const preset = PHASE_REFERENCE_SIGMAS.find((entry) => entry.id === draft.asset);
    if (preset) {
      sigma = preset.sigma;
      assetLabel = preset.label;
    } else {
      errors.customSigmaPct = "Ativo de referência desconhecido.";
    }
  }
  if (Object.keys(errors).length > 0 || !capital.ok) return { ok: false, errors };
  return { ok: true, value: { capital: capital.value, sigma, assetLabel } };
}
