/**
 * Unit labels and strict value readers of the Onchain OS data layer.
 * Specification: docs/OKX-ONCHAINOS-DADOS-SPEC.md sections 6 and 12.
 *
 * Two rules govern everything here:
 *  1. UNKNOWN NEVER BECOMES ZERO. An absent, empty, "--", "null", non numeric, NaN or infinite value is `null`. Only a
 *     value that really says "0" is 0.
 *  2. UNITS ARE A TRAP. The type aliases below carry what a number means. A field whose unit the documentation does not
 *     declare gets an alias that says so, and no reader ever converts anything.
 *
 * Readers never throw for a bad VALUE (they return null). Structural helpers (`asArray`, `asRecord`, `schemaFail`) throw
 * `OnchainosError` of kind "schema" with the row index, never echoing the content that failed.
 */

import { OnchainosError } from "./errors.ts";

// ---------------------------------------------------------------------------
// Unit labels (type aliases are erased at runtime; they document what a number means)
// ---------------------------------------------------------------------------

/** Milliseconds since the Unix epoch, declared by the documentation. */
export type EpochMs = number;
/** Milliseconds since the Unix epoch by EXAMPLE only (13 digits): the page does not declare the unit. */
export type EpochMsByExample = number;
/** US dollars, declared by the documentation. */
export type UsdAmount = number;
/** Percentage points, declared: 76.75 means 76.75 percent. */
export type PercentPoints = number;
/** Percentage points by NAME and EXAMPLE only: the page does not declare the scale. */
export type PercentByExample = number;
/** Ratio from 0 to 1 or decimal fraction, declared: 0.0214 means 2.14 percent. */
export type FractionOfOne = number;
/** Documented as a percent but the example looks like a 0..1 fraction: never compare or threshold without a live check. */
export type AmbiguousScale = number;
/** A non negative integer count. */
export type CountUnits = number;
/** A price in a quote currency the documentation does NOT declare. */
export type PriceQuoteUnknown = number;
/** A quantity or value whose unit or currency the documentation does NOT declare. */
export type AmountUnitUnknown = number;
/** Smallest unit of a gas token: wei (EVM) or SUN (Tron), declared by the Gateway page. */
export type WeiOrSun = number;
/** Solana priority fee per compute unit in micro-lamports, declared by the Gateway page. */
export type Microlamports = number;
/** A decimal text that passed the strict grammar of src/okx-derivatives/decimal.ts (kept as text for exact arithmetic). */
export type DecimalText = string;

export const MAX_EPOCH_MS = 4_102_444_800_000;
/** 2000-01-01T00:00:00Z: below this a "milliseconds" value of undeclared unit is more likely seconds. */
export const MIN_PLAUSIBLE_EPOCH_MS = 946_684_800_000;

// ---------------------------------------------------------------------------
// Numeric readers
// ---------------------------------------------------------------------------

const DECIMAL = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/;
const PERCENT = /^[+-]?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?%?$/;
const MAX_NUMBER_TEXT = 128;

function normalise(n: number): number | null {
  if (!Number.isFinite(n)) return null;
  return n === 0 ? 0 : n;
}

/** A finite JSON number, or text with a strict decimal grammar (exponent allowed, no plus, no spaces). Otherwise null. */
export function readDecimal(value: unknown): number | null {
  if (typeof value === "number") return normalise(value);
  if (typeof value !== "string" || value.length === 0 || value.length > MAX_NUMBER_TEXT || !DECIMAL.test(value)) return null;
  return normalise(Number(value));
}

export function readNonNegative(value: unknown): number | null {
  const n = readDecimal(value);
  return n !== null && n >= 0 ? n : null;
}

export function readPositive(value: unknown): number | null {
  const n = readDecimal(value);
  return n !== null && n > 0 ? n : null;
}

export function readCount(value: unknown): CountUnits | null {
  const n = readDecimal(value);
  return n !== null && Number.isSafeInteger(n) && n >= 0 ? n : null;
}

/** Milliseconds declared by the documentation: a safe integer from 0 to the year 2100. */
export function readEpochMs(value: unknown): EpochMs | null {
  const n = readDecimal(value);
  return n !== null && Number.isSafeInteger(n) && n >= 0 && n <= MAX_EPOCH_MS ? n : null;
}

/** Undeclared unit: accepted only when it looks like milliseconds (year 2000 to 2100). Seconds are null, never scaled. */
export function readEpochMsByExample(value: unknown): EpochMsByExample | null {
  const n = readEpochMs(value);
  return n !== null && n >= MIN_PLAUSIBLE_EPOCH_MS ? n : null;
}

export interface PercentRange {
  min?: number;
  max?: number;
}

/** A percentage as documented, kept as it is: "0.7%" is 0.7, "+15.3" is 15.3. A range turns out of range values into null. */
export function readPercent(value: unknown, range: PercentRange = {}): number | null {
  let n: number | null = null;
  if (typeof value === "number") n = normalise(value);
  else if (typeof value === "string" && value.length <= MAX_NUMBER_TEXT && PERCENT.test(value)) n = normalise(Number(value.endsWith("%") ? value.slice(0, -1) : value));
  if (n === null) return null;
  if (range.min !== undefined && n < range.min) return null;
  if (range.max !== undefined && n > range.max) return null;
  return n;
}

/** A ratio between 0 and 1 inclusive. Anything outside is unknown, never clamped. */
export function readFraction(value: unknown): FractionOfOne | null {
  const n = readDecimal(value);
  return n !== null && n >= 0 && n <= 1 ? n : null;
}

// ---------------------------------------------------------------------------
// Flags, enumerations and identities
// ---------------------------------------------------------------------------

/** "0" or "1" (also the numbers 0 and 1). Anything else is null. */
export function readFlag01(value: unknown): boolean | null {
  if (value === "0" || value === 0) return false;
  if (value === "1" || value === 1) return true;
  return null;
}

/** A JSON boolean or the exact text "true" or "false". */
export function readBoolean(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  if (value === "true") return true;
  if (value === "false") return false;
  return null;
}

/** A value of a closed vocabulary, matched exactly. Anything else is null: never "the closest". */
export function readEnum<T extends string>(value: unknown, allowed: readonly T[]): T | null {
  return typeof value === "string" && (allowed as readonly string[]).includes(value) ? (value as T) : null;
}

/** A short digit string (or a safe integer number) normalised to text. */
export function readChainIndex(value: unknown): string | null {
  if (typeof value === "number") return Number.isSafeInteger(value) && value >= 0 && value <= 999_999_999_999 ? String(value) : null;
  return typeof value === "string" && /^\d{1,12}$/.test(value) ? value : null;
}

const EVM_ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const HEX_OBJECT_ID = /^0x[0-9a-fA-F]{64}$/;
const MOVE_TYPE = /^0x[0-9a-fA-F]{1,64}::[A-Za-z_][A-Za-z0-9_]{0,63}::[A-Za-z_][A-Za-z0-9_]{0,63}$/;
const BASE58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const BASE64_URL_48 = /^[A-Za-z0-9_-]{48}$/;

export interface TokenAddressOptions {
  /** The empty string is the chain's native token (documented by the index price page). */
  allowNative?: boolean;
}

/** A token or contract identity with a strict shape per address family. EVM style addresses are lowercased. */
export function readTokenAddress(value: unknown, options: TokenAddressOptions = {}): string | null {
  if (typeof value !== "string") return null;
  if (value === "") return options.allowNative === true ? "" : null;
  if (EVM_ADDRESS.test(value) || HEX_OBJECT_ID.test(value)) return value.toLowerCase();
  if (MOVE_TYPE.test(value) || BASE58.test(value) || BASE64_URL_48.test(value)) return value;
  return null;
}

/** An opaque identifier: printable ascii without spaces, 1 to 128 characters; a safe integer becomes its text. */
export function readOpaqueId(value: unknown): string | null {
  if (typeof value === "number") return Number.isSafeInteger(value) && value >= 0 ? String(value) : null;
  return typeof value === "string" && /^[\x21-\x7e]{1,128}$/.test(value) ? value : null;
}

/** A numeric identifier (for example a DeFi investmentId that the documentation types as text and the example as number). */
export function readNumericId(value: unknown): string | null {
  if (typeof value === "number") return Number.isSafeInteger(value) && value >= 0 ? String(value) : null;
  return typeof value === "string" && /^\d{1,20}$/.test(value) ? value : null;
}

/** A short identifier made of letters, digits, underscore or hyphen (for example a network code). */
export function readCode(value: unknown, maxLength = 24): string | null {
  return typeof value === "string" && value.length >= 1 && value.length <= maxLength && /^[A-Za-z0-9_-]+$/.test(value) ? value : null;
}

// ---------------------------------------------------------------------------
// Structural helpers (these throw)
// ---------------------------------------------------------------------------

export function schemaFail(reason: string, init: { rowIndex?: number | null; endpoint?: string } = {}): never {
  throw new OnchainosError("schema", reason, { rowIndex: init.rowIndex ?? null, ...(init.endpoint === undefined ? {} : { endpoint: init.endpoint }) });
}

/** The value must be a list with at most `maxRows` rows. The message names `label`, never the content. */
export function asArray(value: unknown, label: string, maxRows: number): unknown[] {
  if (!Array.isArray(value)) return schemaFail(`esperada uma lista em ${label}`);
  if (value.length > maxRows) return schemaFail(`mais de ${maxRows} linhas em ${label}`);
  return value;
}

/** The value must be a plain object. `rowIndex` is carried into the error when the row is rejected. */
export function asRecord(value: unknown, label: string, rowIndex: number | null = null): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return schemaFail(`esperado um objeto em ${label}`, { rowIndex });
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return schemaFail(`esperado um objeto simples em ${label}`, { rowIndex });
  return value as Record<string, unknown>;
}

/** First OWN property found among the aliases (documented names that differ between table and example). */
export function field(record: Record<string, unknown>, ...names: string[]): unknown {
  for (const name of names) {
    if (Object.hasOwn(record, name)) return record[name];
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Request side: token references and chain lists
// ---------------------------------------------------------------------------

export interface TokenRef {
  readonly chainIndex: string;
  readonly tokenContractAddress: string;
}

export interface TokenRefOptions {
  /** Largest list accepted in one call. */
  max: number;
  /** The empty address means the chain's native token (documented by the index price page only). */
  allowNative?: boolean;
}

export function tokenKey(ref: TokenRef): string {
  return `${ref.chainIndex}|${ref.tokenContractAddress}`;
}

/** Validates ONE token reference from the caller and normalises the address (EVM style in lower case). */
export function normaliseTokenRef(token: unknown, allowNative = false): TokenRef {
  if (typeof token !== "object" || token === null || Array.isArray(token)) throw new OnchainosError("invalid_request", "referência de token deve ser um objeto com chainIndex e tokenContractAddress");
  const record = token as Record<string, unknown>;
  const chainIndex = readChainIndex(record.chainIndex);
  if (chainIndex === null) throw new OnchainosError("invalid_request", "chainIndex inválido");
  const tokenContractAddress = readTokenAddress(record.tokenContractAddress, { allowNative });
  if (tokenContractAddress === null) throw new OnchainosError("invalid_request", "tokenContractAddress inválido");
  return { chainIndex, tokenContractAddress };
}

/** Validates a list of token references from the caller: not empty, bounded, no duplicates after normalisation. */
export function normaliseTokenRefs(tokens: unknown, options: TokenRefOptions): TokenRef[] {
  if (!Array.isArray(tokens) || tokens.length < 1 || tokens.length > options.max) {
    throw new OnchainosError("invalid_request", `a lista de tokens deve ter de 1 a ${options.max} itens`);
  }
  const seen = new Set<string>();
  return tokens.map((token) => {
    const ref = normaliseTokenRef(token, options.allowNative === true);
    const key = tokenKey(ref);
    if (seen.has(key)) throw new OnchainosError("invalid_request", "token repetido na lista");
    seen.add(key);
    return ref;
  });
}

export interface ChainRow {
  readonly chainIndex: string;
}

/** A list of supported chains reduced to chainIndex. Names, symbols and logos are text from the provider and are dropped. */
export function readChainRows(data: unknown, maxRows = 500): ChainRow[] {
  const rows = asArray(data, "data", maxRows);
  const seen = new Set<string>();
  return rows.map((raw, index) => {
    const record = asRecord(raw, "linha", index);
    const chainIndex = readChainIndex(field(record, "chainIndex"));
    if (chainIndex === null) return schemaFail("chainIndex ilegível", { rowIndex: index });
    if (seen.has(chainIndex)) return schemaFail("cadeia repetida", { rowIndex: index });
    seen.add(chainIndex);
    return { chainIndex };
  });
}
