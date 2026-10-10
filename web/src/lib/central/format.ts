// pt-BR number formatting for the /central page.
//
// It does not use Intl on purpose: the server render and the browser render must produce exactly the same text, whatever
// the ICU data of the runtime. Decimals use a comma, thousands use a dot. Negative numbers use the ASCII hyphen-minus; the
// project forbids dashes and middle dots in rendered text.

export const UNAVAILABLE = "indisponível";

const HUGE = 1e9;
const HUGE_USD = 1e12;

const groupThousands = (integerDigits: string): string => integerDigits.replace(/\B(?=(\d{3})+(?!\d))/g, ".");

/** Fixed number of decimals, comma as separator, dots for thousands; never a negative zero. */
export function formatDecimal(value: number, fractionDigits: number): string {
  if (!Number.isFinite(value) || Math.abs(value) >= 1e21) return UNAVAILABLE;
  const fixed = Math.abs(value).toFixed(fractionDigits);
  const [integer = "0", fraction] = fixed.split(".");
  const negative = value < 0 && /[1-9]/.test(fixed);
  return `${negative ? "-" : ""}${groupThousands(integer)}${fraction ? `,${fraction}` : ""}`;
}

/** A number without trailing zeros, used inside messages ("1 e 1.000", "0,25"). */
export function formatCompact(value: number, maxFractionDigits = 4): string {
  const text = formatDecimal(value, maxFractionDigits);
  if (text === UNAVAILABLE || !text.includes(",")) return text;
  return text.replace(/0+$/, "").replace(/,$/, "");
}

export function formatPercent(fraction: number, fractionDigits: number): string {
  const text = formatDecimal(fraction * 100, fractionDigits);
  return text === UNAVAILABLE ? text : `${text}%`;
}

/** Probability as a percentage, with bounds instead of false precision at the extremes. */
export function formatProbability(probability: number): string {
  if (Number.isNaN(probability)) return UNAVAILABLE;
  if (probability <= 0) return "0%";
  if (probability >= 1) return "100%";
  if (probability < 0.0001) return "menos de 0,01%";
  if (probability > 0.9999) return "mais de 99,99%";
  return formatPercent(probability, probability < 0.01 ? 2 : 1);
}

/** A wealth multiple such as 0,81x, with more digits when the number is tiny. */
export function formatMultiple(multiple: number): string {
  if (Number.isNaN(multiple)) return UNAVAILABLE;
  if (multiple >= HUGE) return "mais de 1.000.000.000x";
  if (multiple < 0.00001) return "menos de 0,00001x";
  const digits = multiple < 0.001 ? 5 : multiple < 0.01 ? 4 : 2;
  return `${formatDecimal(multiple, digits)}x`;
}

/** Leverage such as 5x or 2,5x; trailing zeros are dropped. */
export function formatLeverage(leverage: number, fractionDigits = 1): string {
  const text = formatCompact(leverage, fractionDigits);
  return text === UNAVAILABLE ? text : `${text}x`;
}

/** US dollars: US$ 1.234,50, with four decimals when the amount is below one cent. */
export function formatUsd(value: number): string {
  if (Number.isNaN(value)) return UNAVAILABLE;
  const abs = Math.abs(value);
  if (abs >= HUGE_USD) return `${value < 0 ? "-" : ""}mais de US$ 1.000.000.000.000`;
  const digits = abs > 0 && abs < 0.01 ? 4 : 2;
  const text = formatDecimal(abs, digits);
  const negative = value < 0 && /[1-9]/.test(text);
  return `${negative ? "-" : ""}US$ ${text}`;
}
