/**
 * What is kept of a `swap quote` (the telemetry of the cost, read-only): a small allowlist of numbers and codes, the hour the quote was read and which of those fields the quote carried at all. Never the raw answer, the route,
 * the quote id, the signing data or any text from outside. A field the quote did not carry is ABSENT, not zero; one it carried and that could not be read is present and null.
 * UNITS come from the provider's documented contract (Quote v6, https://web3.okx.com/onchainos/dev-docs/trade/dex-get-quote, passed through unchanged by `onchainos swap quote` v4.6.4, `fetch_quote` in cli/src/commands/swap.rs of
 * commit cfbb0baf): `tradeFee` is the estimated network fee in USD, `estimateGasFee` is in the smallest unit of the chain's native coin (never added to the USD fee), `taxRate` is a FRACTION from 0 to 1 (0.01 is one percent) and
 * is kept here as a percent, `priceImpactPercent` is a signed percent. The announced fee and the impact are what the quote promised: the cost an order really had is another thing, read from its receipt (fills.ts).
 */

const QUOTE_ACTIONS = ["ok", "warn", "block"] as const;
export type QuoteAction = (typeof QUOTE_ACTIONS)[number];
/** The fields read from a quote, in this order. */
const QUOTE_FIELDS = ["impact", "tradeFee", "gas", "slot", "taxFrom", "taxTo", "fromAmount", "toAmount"] as const;
export type QuoteField = (typeof QUOTE_FIELDS)[number];

export interface QuoteFacts {
  /** When the quote was read, by the clock of this machine. */
  readonly atMs: number;
  readonly action: QuoteAction | null;
  /** `priceImpactPercent`, signed, in percent. */
  readonly impactPct: number | null;
  /** `tradeFee`: the estimated network fee in USD (`feeUnit`). */
  readonly tradeFee: number | null;
  /** `estimateGasFee`: in the smallest unit of the native coin of the chain (`gasUnit`); never a dollar amount. */
  readonly gasEstimate: number | null;
  /** `contextSlot`: the chain state the quote was made against (Solana). */
  readonly slot: number | null;
  /** The tax of each token as a percent (the provider's `taxRate` is a fraction from 0 to 1, times one hundred); null when absent, unreadable or outside that range. */
  readonly taxFromPct: number | null;
  readonly taxToPct: number | null;
  /** The amounts the quote was made for, in the smallest unit, digits only: what ties it to a quantity. */
  readonly fromAmountMinor: string | null;
  readonly toAmountMinor: string | null;
  readonly feeUnit: "usd";
  readonly gasUnit: "native_minor";
  /** The allowlisted fields the quote carried (readable or not), in the order of `QUOTE_FIELDS`. */
  readonly present: readonly QuoteField[];
}

const MAX_ABS = 1e9;
const rec = (v: unknown): Record<string, unknown> | null => (v !== null && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null);
const carried = (v: unknown): boolean => v !== undefined && v !== null && v !== "";
/** The one range rule of the facts, for what is read from a quote and for what is read back from the ledger: finite, within the sane magnitude, and not negative when the field is unsigned. */
const inRange = (n: unknown, signed: boolean): n is number => typeof n === "number" && Number.isFinite(n) && Math.abs(n) <= MAX_ABS && (signed || n >= 0);
const number = (v: unknown, signed: boolean): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" && (signed ? /^-?\d+(\.\d+)?$/ : /^\d+(\.\d+)?$/).test(v.trim()) ? Number(v) : Number.NaN;
  return inRange(n, signed) ? n : null;
};
/** A provider tax: a fraction from 0 to 1, kept as a percent. A value outside the range is not a rate. */
const taxPct = (v: unknown): number | null => {
  const fraction = number(v, false);
  return fraction === null || fraction > 1 ? null : Number((fraction * 100).toPrecision(12));
};
const slotOf = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" && /^\d{1,15}$/.test(v.trim()) ? Number(v) : Number.NaN;
  return Number.isSafeInteger(n) && n >= 0 ? n : null;
};
const digits = (v: unknown): string | null => (typeof v === "string" && /^\d{1,40}$/.test(v.trim()) ? v.trim() : typeof v === "number" && Number.isSafeInteger(v) && v >= 0 ? String(v) : null);

/** The facts of one quote record, read at `atMs`. Pure. */
export function quoteFactsOf(q: Record<string, unknown>, atMs: number): QuoteFacts {
  const from = rec(q.fromToken);
  const to = rec(q.toToken);
  const present = QUOTE_FIELDS.filter((f) => {
    switch (f) {
      case "impact": return carried(q.priceImpactPercent);
      case "tradeFee": return carried(q.tradeFee);
      case "gas": return carried(q.estimateGasFee);
      case "slot": return carried(q.contextSlot);
      case "taxFrom": return carried(from?.taxRate);
      case "taxTo": return carried(to?.taxRate);
      case "fromAmount": return carried(q.fromTokenAmount);
      case "toAmount": return carried(q.toTokenAmount);
    }
  });
  return {
    atMs,
    action: (QUOTE_ACTIONS as readonly unknown[]).includes(q.action) ? (q.action as QuoteAction) : null,
    impactPct: number(q.priceImpactPercent, true),
    tradeFee: number(q.tradeFee, false),
    gasEstimate: number(q.estimateGasFee, false),
    slot: slotOf(q.contextSlot),
    taxFromPct: taxPct(from?.taxRate),
    taxToPct: taxPct(to?.taxRate),
    fromAmountMinor: digits(q.fromTokenAmount),
    toAmountMinor: digits(q.toTokenAmount),
    feeUnit: "usd",
    gasUnit: "native_minor",
    present,
  };
}

const KEYS = ["atMs", "action", "impactPct", "tradeFee", "gasEstimate", "slot", "taxFromPct", "taxToPct", "fromAmountMinor", "toAmountMinor", "feeUnit", "gasUnit", "present"];
const numOrNull = (v: unknown, signed: boolean): boolean => v === null || inRange(v, signed);
const strOrNull = (v: unknown): boolean => v === null || (typeof v === "string" && /^\d{1,40}$/.test(v));

/** The facts as the ledger wrote them, or null when the value is not exactly that shape (the record is then read without them, never refused). */
export function parseQuoteFacts(raw: unknown): QuoteFacts | null {
  const o = rec(raw);
  if (o === null) return null;
  const keys = Object.keys(o);
  if (keys.length !== KEYS.length || !KEYS.every((k) => Object.hasOwn(o, k))) return null;
  if (typeof o.atMs !== "number" || !Number.isSafeInteger(o.atMs) || o.atMs < 0) return null;
  if (o.action !== null && !(QUOTE_ACTIONS as readonly unknown[]).includes(o.action)) return null;
  if (!numOrNull(o.impactPct, true) || ![o.tradeFee, o.gasEstimate, o.taxFromPct, o.taxToPct].every((v) => numOrNull(v, false))) return null;
  if ([o.taxFromPct, o.taxToPct].some((v) => v !== null && (v as number) > 100)) return null;
  if (o.slot !== null && !(typeof o.slot === "number" && Number.isSafeInteger(o.slot) && o.slot >= 0)) return null;
  if (!strOrNull(o.fromAmountMinor) || !strOrNull(o.toAmountMinor) || o.feeUnit !== "usd" || o.gasUnit !== "native_minor") return null;
  if (!Array.isArray(o.present) || o.present.some((f) => !(QUOTE_FIELDS as readonly unknown[]).includes(f)) || new Set(o.present).size !== o.present.length) return null;
  return o as unknown as QuoteFacts;
}
