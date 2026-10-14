/**
 * What a person types in a numeric filter of the Rastreador (RAS-4). The box keeps the text as typed while the person types, so a minus sign or a decimal point
 * on its way is not thrown away; the filter changes only when the text really is a number, a comma counts as a point, and text that only looks like a number
 * (a hexadecimal, an exponent, a word) is not one. Pure.
 */
export type Typed = { readonly ok: true; readonly value: number | null } | { readonly ok: false };

const PLAIN = /^-?(?:\d+(?:[.,]\d+)?|[.,]\d+)$/;
/** "1.000" and "12.345.678" are thousands in pt-BR and decimals elsewhere: it is not guessed, it is refused. */
const GROUPED = /^-?[1-9]\d{0,2}(?:[.,]\d{3})+$/;
/** A number on its way: only a sign, a point or a comma, or digits and a point or a comma at the end. */
const MIDWAY = /^-?(?:[.,]|\d+[.,]?)?$/;

export function parseTyped(text: string): Typed {
  const clean = text.trim();
  if (clean === "") return { ok: true, value: null };
  if (clean.length > 30 || !PLAIN.test(clean) || GROUPED.test(clean)) return { ok: false };
  const value = Number(clean.replace(",", "."));
  return Number.isFinite(value) ? { ok: true, value } : { ok: false };
}

/** The box is marked invalid when what is typed is not a number, or is a number the filter does not accept; a number on its way is not invalid yet. */
export function isInvalidText(text: string, accept?: (value: number) => boolean): boolean {
  const result = parseTyped(text);
  if (result.ok) return result.value !== null && accept !== undefined && !accept(result.value);
  const clean = text.trim();
  // a text that is only digits but too long to be a number is not "on its way"
  return clean.length > 30 || !MIDWAY.test(clean);
}

/** What to tell the person about a box that is invalid: that it is not a number, or that this filter does not take it. */
export function invalidReason(text: string, accept?: (value: number) => boolean): string | null {
  if (!isInvalidText(text, accept)) return null;
  return parseTyped(text).ok ? "Este filtro nao aceita este valor" : "Nao e um numero: use so digitos, com ponto ou virgula decimal e sem separador de milhar";
}

/** The number as the box shows it when nobody is typing. */
export const numberText = (value: number | null): string => (value === null ? "" : String(value));
