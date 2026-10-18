/**
 * The on-chain asset the chart can focus (spec CHN-2): a token picked in the asset picker or in a
 * dock tab. It is session state, never persisted, and always validated defensively because part of
 * it (the symbol) comes from the provider and part (the address) goes back into requests.
 */

export interface OnchainFocus {
  /** Decimal chain index as the API reports it, digits only, at most 12 chars. */
  readonly chainIndex: string;
  /** Token contract address: printable, no spaces, 1 to 128 chars. */
  readonly address: string;
  /** Ticker text for headers and the picker trigger: printable, 1 to 24 chars. */
  readonly symbol: string;
  /** Display name when the provider gave one (search rows carry it, hot rows do not). */
  readonly name: string | null;
}

const CHAIN_RE = /^\d{1,12}$/;
const ADDRESS_RE = /^[^\s]{1,128}$/;
const SYMBOL_RE = /^[ -~]{1,24}$/;

/** C0 or DEL anywhere, written without a control-character literal in the source. */
function hasControl(s: string): boolean {
  for (let i = 0; i < s.length; i += 1) {
    const c = s.charCodeAt(i);
    if (c < 32 || c === 127) return true;
  }
  return false;
}

export function isOnchainFocus(v: unknown): v is OnchainFocus {
  if (typeof v !== "object" || v === null || Array.isArray(v)) return false;
  const r = v as Record<string, unknown>;
  return (
    typeof r.chainIndex === "string" &&
    CHAIN_RE.test(r.chainIndex) &&
    typeof r.address === "string" &&
    ADDRESS_RE.test(r.address) &&
    !hasControl(r.address) &&
    typeof r.symbol === "string" &&
    SYMBOL_RE.test(r.symbol) &&
    (r.name === null || r.name === undefined || (typeof r.name === "string" && r.name.length <= 128 && !hasControl(r.name)))
  );
}

/** Parse a loose value into a focus or null: every field must individually pass. */
export function parseOnchainFocus(v: unknown): OnchainFocus | null {
  if (!isOnchainFocus(v)) return null;
  return { chainIndex: v.chainIndex, address: v.address, symbol: v.symbol, name: v.name ?? null };
}
