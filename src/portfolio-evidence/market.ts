/**
 * Market evidence: price, token decimals, liquidity and risk per token. Pure assembly.
 *
 * The documentation does not declare the currency of the market price, so it is evidence of a price CLOCK and a cross
 * check, never the price a value is computed from (that is the USD `tokenPrice` of the balance answer).
 * Liquidity lists at most five pools: the figure is a lower bound. Risk level 0 is "undefined", not "safe".
 */

import { parseDec } from "./decimal.ts";
import { freshnessReport, statusOfFreshness, statusOfState, worstStatus } from "./state.ts";
import type { DecimalsHint, PriceHint } from "./balances.ts";
import type { Issue, LiquidityEvidence, MarketSection, PriceEvidence, RiskEvidence, SourceInfo, TokenInfoEvidence } from "./types.ts";

export interface MarketBuildInput {
  readonly source: SourceInfo;
  readonly fetchedAtMs: number;
  readonly nowMs: number;
  readonly maxAgeMs: number;
  readonly prices?: readonly PriceEvidence[];
  readonly tokenInfo?: readonly TokenInfoEvidence[];
  readonly liquidity?: readonly LiquidityEvidence[];
  readonly risk?: readonly RiskEvidence[];
  readonly missing?: MarketSection["missing"];
  readonly issues?: readonly Issue[];
}

export function assembleMarketSection(input: MarketBuildInput): MarketSection {
  const timing = { fetchedAtMs: input.fetchedAtMs, sourceTimeMs: null, clockOffsetMs: null };
  const freshness = freshnessReport(timing, input.nowMs, input.maxAgeMs);
  const prices = input.prices ?? [];
  const tokenInfo = input.tokenInfo ?? [];
  const liquidity = input.liquidity ?? [];
  const risk = input.risk ?? [];
  const missing = input.missing ?? [];
  const status = worstStatus([
    statusOfFreshness(freshness),
    ...[...prices, ...tokenInfo, ...liquidity, ...risk].map((row) => statusOfState(row.state.kind)),
    ...(missing.length > 0 ? (["incomplete"] as const) : []),
  ]);
  return { kind: "market", source: input.source, timing, freshness, prices, tokenInfo, liquidity, risk, missing, issues: input.issues ?? [], status };
}

/** Decimals the provider reports for a token, keyed by identity key. Only readable, in-range values. */
export function decimalsHintsOf(section: MarketSection | null): Map<string, DecimalsHint> {
  const hints = new Map<string, DecimalsHint>();
  if (section === null) return hints;
  for (const row of section.tokenInfo) {
    if (row.state.kind === "ok" && row.decimals !== null) hints.set(row.identity.key, { decimals: row.decimals, source: "provider_token_info" });
  }
  return hints;
}

export function priceHintsOf(section: MarketSection | null): Map<string, PriceHint> {
  const hints = new Map<string, PriceHint>();
  if (section === null) return hints;
  for (const row of section.prices) {
    if (row.state.kind === "ok" && row.priceText !== null && parseDec(row.priceText) !== null) hints.set(row.identity.key, { priceText: row.priceText, timeMs: row.timeMs, fetchedAtMs: row.fetchedAtMs });
  }
  return hints;
}
