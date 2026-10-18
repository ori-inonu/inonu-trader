/**
 * Adapter from the wallet evidence layer (src/portfolio-evidence, section `balances`) to the valued positions of
 * the portfolio risk. It is structural on purpose: it imports nothing from the evidence layer, so the two stay
 * decoupled and the evidence layer stays the single owner of what counts as a valued, included position.
 *
 * Unknown stays unknown: a position the evidence layer left out of the net worth, or that has no USD value in
 * state ok, becomes `valueUsd: null` with the reason, never zero. Positions are keyed by their identity (chain and
 * contract), never by symbol, because symbols repeat across contracts.
 *
 * Pure: no I/O, no clock, no randomness.
 */

import type { PositionInput } from "./portfolio";

export interface EvidencePositionLike {
  readonly identity: { readonly key: string };
  readonly display: { readonly symbol: string | null };
  readonly valuation: {
    readonly currency: string | null;
    readonly valueText: string | null;
    readonly state: { readonly kind: string; readonly code: string };
  };
  /** True when the evidence layer counts the position in the net worth. */
  readonly included: boolean;
  readonly state: { readonly kind: string; readonly code: string };
}

export interface EvidenceBalancesLike {
  /** `valid`, `incomplete`, `stale`, `divergent` or `unreconciled` in the evidence contract. */
  readonly status?: string;
  readonly positions: readonly EvidencePositionLike[];
}

export type UnvaluedReason = "not_included" | "no_usd_value" | "value_unreadable";

export interface EvidencePositions {
  readonly positions: PositionInput[];
  /** Identity key to display symbol, for presentation and for matching captures. */
  readonly symbols: Record<string, string | null>;
  /** The evidence layer's own verdict on the balances, carried so a report can be labelled. */
  readonly evidenceStatus: string | null;
  readonly unvalued: readonly { readonly key: string; readonly reason: UnvaluedReason }[];
}

const DECIMAL = /^\d+(?:\.\d+)?$/;

export function positionsFromEvidence(balances: EvidenceBalancesLike): EvidencePositions {
  const positions: PositionInput[] = [];
  const symbols: Record<string, string | null> = {};
  const unvalued: { key: string; reason: UnvaluedReason }[] = [];
  for (const p of balances.positions) {
    const key = p.identity.key;
    symbols[key] = p.display.symbol;
    let reason: UnvaluedReason | null = null;
    let value: number | null = null;
    if (!p.included) reason = "not_included";
    else if (p.valuation.currency !== "USD" || p.valuation.valueText === null || p.valuation.state.kind !== "ok") reason = "no_usd_value";
    else if (!DECIMAL.test(p.valuation.valueText) || !Number.isFinite(Number(p.valuation.valueText))) reason = "value_unreadable";
    else value = Number(p.valuation.valueText);
    positions.push({ key, valueUsd: value });
    if (reason !== null) unvalued.push({ key, reason });
  }
  return { positions, symbols, evidenceStatus: balances.status ?? null, unvalued };
}

export interface ReturnsKeyOptions {
  /** Which identities may be matched by symbol. Default: all. A wallet should allow only native assets. */
  readonly eligible?: (identityKey: string) => boolean;
  /** Identity key to capture key, stated by the user. It wins over uniqueness and eligibility but must name a capture that exists. */
  readonly explicit?: Readonly<Record<string, string>>;
}

/**
 * Identity key to the key of a captured return series, by symbol. A symbol maps only when exactly one position
 * carries it, a capture with that symbol exists and the identity is eligible; otherwise null. A repeated symbol, or
 * a contract that merely shares a ticker (a bridged, wrapped or fake token), would put the wrong asset's risk on the
 * position. The user can still state a mapping explicitly.
 */
export function returnsKeysBySymbol(symbols: Readonly<Record<string, string | null>>, available: ReadonlySet<string>, options: ReturnsKeyOptions = {}): Record<string, string | null> {
  const counts = new Map<string, number>();
  for (const symbol of Object.values(symbols)) {
    if (symbol === null) continue;
    const upper = symbol.toUpperCase();
    counts.set(upper, (counts.get(upper) ?? 0) + 1);
  }
  const out: Record<string, string | null> = {};
  for (const [key, symbol] of Object.entries(symbols)) {
    const stated = options.explicit !== undefined && Object.hasOwn(options.explicit, key) ? (options.explicit[key] as string).toUpperCase() : null;
    if (stated !== null) { out[key] = available.has(stated) ? stated : null; continue; }
    const upper = symbol === null ? null : symbol.toUpperCase();
    const allowed = options.eligible === undefined || options.eligible(key);
    out[key] = allowed && upper !== null && counts.get(upper) === 1 && available.has(upper) ? upper : null;
  }
  return out;
}
