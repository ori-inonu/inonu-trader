/**
 * Display formatting for the desk panels, in pt-BR: "." groups thousands, "," is the decimal mark.
 *
 * Everything here is pure and SSR-safe, and none of it uses Intl, so the output is identical in
 * Bun, Node and every browser. A value that is not known (null, NaN, infinite) formats as
 * "Indisponivel", never as a made-up zero. Negative numbers use a plain hyphen-minus.
 */

export const UNAVAILABLE = "Indisponivel";
export const AWAITING = "Aguardando dados da OKX";

const MAX_DECIMALS = 12;

function isNum(v: number | null | undefined): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function pad3(n: number): string {
  return n < 10 ? `00${n}` : n < 100 ? `0${n}` : String(n);
}

/** Drops the sign of a result that rounded to zero: "-0.00" becomes "0.00". */
function dropNegativeZero(text: string): string {
  return /^-0(\.0+)?$/.test(text) ? text.slice(1) : text;
}

/** "1234567" -> "1.234.567" (integer digits only, no sign). */
export function groupDigits(digits: string): string {
  let out = "";
  for (let i = 0; i < digits.length; i += 1) {
    if (i > 0 && (digits.length - i) % 3 === 0) out += ".";
    out += digits[i];
  }
  return out;
}

/** Fixed decimals in pt-BR: (1234.5, 2) -> "1.234,50". Unknown values return "Indisponivel". */
export function fmtNumber(v: number | null | undefined, decimals: number): string {
  if (!isNum(v)) return UNAVAILABLE;
  const d = Math.min(MAX_DECIMALS, Math.max(0, Math.round(decimals)));
  const fixed = dropNegativeZero(v.toFixed(d));
  const negative = fixed.startsWith("-");
  const body = negative ? fixed.slice(1) : fixed;
  const dot = body.indexOf(".");
  const intPart = dot === -1 ? body : body.slice(0, dot);
  const frac = dot === -1 ? "" : body.slice(dot + 1);
  return `${negative ? "-" : ""}${groupDigits(intPart)}${frac ? `,${frac}` : ""}`;
}

/** Same as fmtNumber but forces a leading "+" on positive values. Zero stays unsigned. */
export function fmtSignedNumber(v: number | null | undefined, decimals: number): string {
  const text = fmtNumber(v, decimals);
  if (!isNum(v) || text.startsWith("-")) return text;
  return /[1-9]/.test(text) ? `+${text}` : text;
}

/**
 * Number of decimals implied by an exchange tick string: "0.1" -> 1, "0.00001" -> 5, "1" -> 0.
 * Also reads exponent notation ("1e-7" -> 7). Anything unreadable returns `fallback`.
 */
export function priceDecimals(tickSz: string | null | undefined, fallback = 2): number {
  if (typeof tickSz !== "string") return fallback;
  const text = tickSz.trim().toLowerCase();
  if (!/^(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/.test(text)) return fallback;
  const [mantissa, exponent = "0"] = text.split("e");
  const value = Number(text);
  if (!Number.isFinite(value) || value <= 0) return fallback;
  const dot = mantissa.indexOf(".");
  const fraction = dot === -1 ? "" : mantissa.slice(dot + 1).replace(/0+$/, "");
  const decimals = fraction.length - Number(exponent);
  return Math.min(MAX_DECIMALS, Math.max(0, decimals));
}

/** Five significant digits for a price when no tick is known: 67432.1 -> 0, 3250.5 -> 1, 0.0123 -> 6. */
export function priceDecimalsForMagnitude(px: number | null | undefined): number {
  if (!isNum(px) || px === 0) return 2;
  const magnitude = Math.floor(Math.log10(Math.abs(px)));
  return Math.min(8, Math.max(0, 4 - magnitude));
}

const MAX_SIZE_DECIMALS = 8;
/** What a size smaller than the 8 decimal cap prints as, so a non-zero value never reads as zero. */
export const TINY_SIZE = "<0,00000001";

/** Decimals the size rule asks for: three significant digits for anything below 1, fewer as the number grows. */
function sizeRuleDecimals(abs: number): number {
  if (abs >= 1e5) return 0;
  if (abs >= 100) return 1;
  if (abs >= 10) return 2;
  if (abs >= 1) return 3;
  const leadingZeros = Math.max(0, -Math.floor(Math.log10(abs)) - 1);
  return Math.min(MAX_SIZE_DECIMALS, leadingZeros + 3);
}

/** Drops trailing zeros of the fraction of a pt-BR number but keeps at least `min` decimals. */
function trimFraction(text: string, min: number): string {
  const comma = text.indexOf(",");
  if (comma === -1) return text;
  let fraction = text.slice(comma + 1).replace(/0+$/, "");
  while (fraction.length < min) fraction += "0";
  return `${text.slice(0, comma)},${fraction}`;
}

/**
 * A size that never prints a non-zero value as zero. Below 1 it keeps three significant digits and
 * trims the zeros after them (0,00004 stays "0,00004", 0,0012 stays "0,0012"); from 1 up it uses
 * 3, 2, 1 or 0 decimals as the number grows (12,5 is "12,50", 1234,5 is "1.234,5"). The cap is 8
 * decimals, and anything smaller than that prints as "<0,00000001". Exact zero is "0,00".
 */
export function fmtSizeSig(v: number | null | undefined): string {
  if (!isNum(v)) return UNAVAILABLE;
  if (v === 0) return "0,00";
  const abs = Math.abs(v);
  const sign = v < 0 ? "-" : "";
  if (abs < 1) {
    const full = fmtNumber(abs, sizeRuleDecimals(abs));
    if (!/[1-9]/.test(full)) return `${sign}${TINY_SIZE}`;
    return `${sign}${trimFraction(full, 2)}`;
  }
  return fmtNumber(v, sizeRuleDecimals(abs));
}

/** Fixed decimals for a size column, falling back to fmtSizeSig for a value those decimals would print as zero. */
export function fmtSizeAt(v: number | null | undefined, decimals: number): string {
  if (!isNum(v)) return UNAVAILABLE;
  const text = fmtNumber(v, decimals);
  return v !== 0 && !/[1-9]/.test(text) ? fmtSizeSig(v) : text;
}

/**
 * One decimal count for a whole size column, so the decimal commas line up. It follows the lower
 * quartile of the visible non-zero values, so most rows show at least three significant digits,
 * and the exchange lot step caps it so the column never shows precision the venue does not trade.
 * A value smaller than the quartile still prints non-zero through fmtSizeAt.
 */
export function columnSizeDecimals(values: readonly number[], lotSz?: string | null): number {
  const sorted = values.filter((v) => Number.isFinite(v) && v !== 0).map((v) => Math.abs(v)).sort((a, b) => a - b);
  if (!sorted.length) return 2;
  const typical = sorted[Math.floor((sorted.length - 1) / 4)];
  const text = fmtSizeSig(typical);
  const wanted = text.startsWith("<") ? MAX_SIZE_DECIMALS : text.includes(",") ? text.length - text.indexOf(",") - 1 : 0;
  return Math.min(wanted, priceDecimals(lotSz ?? null, MAX_SIZE_DECIMALS));
}

/** Price with the given decimals. */
export function fmtPx(px: number | null | undefined, decimals: number): string {
  return fmtNumber(px, decimals);
}

const UNITS: ReadonlyArray<{ readonly value: number; readonly label: string }> = [
  { value: 1e12, label: "tri" },
  { value: 1e9, label: "bi" },
  { value: 1e6, label: "mi" },
  { value: 1e3, label: "mil" },
];

/**
 * Compact quantity in pt-BR: 1234 -> "1,2 mil", 1.2e6 -> "1,2 mi", 3.4e9 -> "3,4 bi".
 * One decimal below 100 of the unit, none above. Rounding up to 1000 promotes to the next unit.
 */
export function fmtCompact(v: number | null | undefined): string {
  if (!isNum(v)) return UNAVAILABLE;
  const abs = Math.abs(v);
  const sign = v < 0 ? "-" : "";
  if (abs < 1000) {
    // A fraction keeps its significant digits: a quantity of 0,00004 must not read as 0,00.
    if (abs > 0 && abs < 1) return fmtSizeSig(v);
    const d = abs >= 100 ? 0 : abs >= 10 ? 1 : 2;
    const text = fmtNumber(abs, d);
    return /[1-9]/.test(text) ? `${sign}${text}` : text;
  }
  let index = UNITS.findIndex((unit) => abs >= unit.value);
  if (index === -1) index = UNITS.length - 1;
  let scaled = abs / UNITS[index].value;
  if (Number(scaled.toFixed(1)) >= 1000 && index > 0) {
    index -= 1;
    scaled = abs / UNITS[index].value;
  }
  const d = scaled >= 100 ? 0 : 1;
  return `${sign}${fmtNumber(scaled, d)} ${UNITS[index].label}`;
}

/** Percent with an explicit sign: (1.234) -> "+1,23%", (-0.4) -> "-0,40%", (0) -> "0,00%". */
export function fmtPctSigned(pct: number | null | undefined, decimals = 2): string {
  if (!isNum(pct)) return UNAVAILABLE;
  return `${fmtSignedNumber(pct, decimals)}%`;
}

/** Percent without a sign: (61.5) -> "61,5%". */
export function fmtPctPlain(pct: number | null | undefined, decimals = 0): string {
  if (!isNum(pct)) return UNAVAILABLE;
  return `${fmtNumber(pct, decimals)}%`;
}

/** A fraction from 0 to 1 as a percent: 0.615 -> "62%". */
export function fmtShare(fraction: number | null | undefined, decimals = 0): string {
  if (!isNum(fraction)) return UNAVAILABLE;
  return fmtPctPlain(fraction * 100, decimals);
}

/** Time of day in UTC with milliseconds, the same clock the desk rail shows: "13:05:09.042". */
export function fmtTimeMs(tsMs: number | null | undefined): string {
  if (!isNum(tsMs)) return UNAVAILABLE;
  const d = new Date(tsMs);
  return `${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}:${pad2(d.getUTCSeconds())}.${pad3(d.getUTCMilliseconds())}`;
}

/** Hour and minute in UTC: "13:05". */
export function fmtClock(tsMs: number | null | undefined): string {
  if (!isNum(tsMs)) return UNAVAILABLE;
  const d = new Date(tsMs);
  return `${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}`;
}

/** Day and month in UTC: "09/05". */
export function fmtDayMonth(tsMs: number | null | undefined): string {
  if (!isNum(tsMs)) return UNAVAILABLE;
  const d = new Date(tsMs);
  return `${pad2(d.getUTCDate())}/${pad2(d.getUTCMonth() + 1)}`;
}

/** Countdown: 65000 -> "01:05". An hour or more switches to "hh:mm:ss". Negative clamps to "00:00". */
export function fmtCountdown(ms: number | null | undefined): string {
  if (!isNum(ms)) return UNAVAILABLE;
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0 ? `${pad2(h)}:${pad2(m)}:${pad2(s)}` : `${pad2(m)}:${pad2(s)}`;
}

/** A funding fraction in basis points: 0.0001 -> 1. */
export function fundingToBps(rate: number): number {
  return rate * 10_000;
}

/** Funding rate as a signed percent: 0.0001 -> "+0,0100%". */
export function fmtFundingPct(rate: number | null | undefined, decimals = 4): string {
  if (!isNum(rate)) return UNAVAILABLE;
  return `${fmtSignedNumber(rate * 100, decimals)}%`;
}

/** Basis points with a sign: 1.04 -> "+1,0 bps". */
export function fmtBps(bps: number | null | undefined, decimals = 1): string {
  if (!isNum(bps)) return UNAVAILABLE;
  return `${fmtSignedNumber(bps, decimals)} bps`;
}

/** Basis points without a sign, for spreads: 0.84 -> "0,8 bps". */
export function fmtBpsPlain(bps: number | null | undefined, decimals = 1): string {
  if (!isNum(bps)) return UNAVAILABLE;
  return `${fmtNumber(bps, decimals)} bps`;
}

/** Basis between two prices in bps: (mark - index) / index. Null when either side is unknown or the index is not positive. */
export function basisBps(mark: number | null | undefined, index: number | null | undefined): number | null {
  if (!isNum(mark) || !isNum(index) || index <= 0) return null;
  return ((mark - index) / index) * 10_000;
}

/** "BTC-USDT-SWAP" -> "BTC". */
export function baseSymbol(instId: string): string {
  const dash = instId.indexOf("-");
  return dash === -1 ? instId : instId.slice(0, dash);
}

/** "BTC-USDT-SWAP" -> "USDT". Empty when the id has no quote part. */
export function quoteSymbol(instId: string): string {
  const parts = instId.split("-");
  return parts.length > 1 ? parts[1] : "";
}

/** True when the id names a perpetual swap. */
export function isSwapId(instId: string): boolean {
  return instId.toUpperCase().endsWith("-SWAP");
}
