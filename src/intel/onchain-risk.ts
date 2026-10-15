/**
 * The risk side of a token for the Brief (fase-2 SPEC F2-DIG-1, F2-DIG-7, A-19). Pure.
 *
 * `riskControlLevel` is documented from 0 to 5 (0 undefined, 1 low, 2 medium, 3 medium high, 4 high, 5 high by manual
 * configuration) and measured at 1 and 2. The tags that may reach the model are the documented closed set and nothing else:
 * the provider's strings are third party text. The shares of developers, bundlers, snipers and suspicious wallets have no
 * measured scale yet (A-17), so no flag is derived from them and the skip is recorded.
 */
import { scaleOf } from "./onchain-adapt";

/** The tags of `market/token/advanced-info`, as documented. A word outside this set never reaches the Brief. */
export const RISK_TAGS: ReadonlySet<string> = new Set([
  "honeypot",
  "lowLiquidity",
  "communityRecognized",
  "devHoldingStatusSell",
  "devHoldingStatusSellAll",
  "devHoldingStatusBuy",
  "initialHighLiquidity",
  "smartMoneyBuy",
  "devAddLiquidity",
  "devBurnToken",
  "volumeChangeRateHoldersPlunge",
  "holdersChangeRateHoldersSurge",
  "dexScreenerTokenCommunityTakeOver",
  "dexScreenerPaid",
  "dexBoost",
  "rwaXstock",
  "rwaOndo",
  "rwaOndoStatusPreMarket",
  "rwaOndoStatusRegular",
  "rwaOndoStatusPostmarket",
  "rwaOndoStatusOvernight",
  "rwaOndoStatusClosed",
  "rwaOndoStatusPaused",
]);

/** The longest documented tag, dexScreenerTokenCommunityTakeOver, has 33 characters. */
const MAX_TAG_LENGTH = 40;

export interface RiskComponent {
  readonly value: number | null;
  readonly reason: "nivel_indefinido" | "sem_dado" | "fora_da_escala" | null;
}

/** `(5 - level) / 5` for levels 1 to 5. Level 0 is undefined at the provider and is absent, never the best score. */
export function riskComponent(level: number | null | undefined): RiskComponent {
  if (level === null || level === undefined) return { value: null, reason: "sem_dado" };
  if (!Number.isInteger(level) || level < 0 || level > 5) return { value: null, reason: "fora_da_escala" };
  if (level === 0) return { value: null, reason: "nivel_indefinido" };
  return { value: (5 - level) / 5, reason: null };
}

/** Documented tags only, deduplicated and sorted; everything else is dropped and counted. */
export function sanitizeTags(raw: readonly unknown[]): { flags: string[]; dropped: number } {
  const kept = new Set<string>();
  let dropped = 0;
  for (const tag of raw) {
    if (typeof tag === "string" && tag.length <= MAX_TAG_LENGTH && RISK_TAGS.has(tag)) kept.add(tag);
    else dropped += 1;
  }
  // a repeated documented tag is not a drop: it only collapses
  return { flags: [...kept].sort(), dropped };
}

export interface RiskInput {
  readonly top10HoldPct: number | null;
  readonly devHoldPct: number | null;
  readonly bundleHoldPct: number | null;
  readonly sniperHoldPct: number | null;
  readonly suspiciousHoldPct: number | null;
  readonly lpBurnedPct: number | null;
  readonly devRugCount: number | null;
}

/** Priors, configurable and recorded; they do not claim any performance. Percents are on the 0 to 100 scale. */
export interface RiskThresholds {
  readonly top10HoldPct: number;
  readonly devHoldPct: number;
  readonly bundleHoldPct: number;
  readonly sniperHoldPct: number;
  readonly suspiciousHoldPct: number;
  readonly lpBurnedPctBelow: number;
  readonly devRugCount: number;
}

export const DEFAULT_RISK_THRESHOLDS: RiskThresholds = {
  top10HoldPct: 50,
  devHoldPct: 10,
  bundleHoldPct: 20,
  sniperHoldPct: 10,
  suspiciousHoldPct: 10,
  lpBurnedPctBelow: 50,
  devRugCount: 0,
};

const present = (v: number | null): v is number => typeof v === "number" && Number.isFinite(v);

/** Flags computed from the numbers, on the scales that are measured; the shares with an ambiguous scale are skipped and said so. */
export function derivedRiskFlags(risk: RiskInput, overrides: Partial<RiskThresholds> = {}): { flags: string[]; skipped: Record<string, string> } {
  const t = { ...DEFAULT_RISK_THRESHOLDS, ...overrides };
  const flags: string[] = [];
  const skipped: Record<string, string> = {};

  const share = (field: string, value: number | null, limit: number, flag: string) => {
    if (!present(value)) return;
    if (scaleOf(`advanced-info.${field}`) !== "pct100") {
      skipped[flag] = "escala_ambigua";
      return;
    }
    if (value > limit) flags.push(flag);
  };
  share("top10HoldPct", risk.top10HoldPct, t.top10HoldPct, "top10_alto");
  share("devHoldPct", risk.devHoldPct, t.devHoldPct, "dev_alto");
  share("bundleHoldPct", risk.bundleHoldPct, t.bundleHoldPct, "bundlers_altos");
  share("sniperHoldPct", risk.sniperHoldPct, t.sniperHoldPct, "snipers_altos");
  share("suspiciousHoldPct", risk.suspiciousHoldPct, t.suspiciousHoldPct, "suspeitos_altos");
  if (present(risk.lpBurnedPct)) {
    if (scaleOf("advanced-info.lpBurnedPct") !== "pct100") skipped.lp_nao_queimado = "escala_ambigua";
    else if (risk.lpBurnedPct < t.lpBurnedPctBelow) flags.push("lp_nao_queimado");
  }
  if (present(risk.devRugCount) && risk.devRugCount > t.devRugCount) flags.push("dev_com_rug");
  return { flags: flags.sort(), skipped };
}

export interface QuoteHoneypot {
  readonly fromToken: { readonly isHoneyPot: boolean | null };
  readonly toToken: { readonly isHoneyPot: boolean | null };
}

/**
 * True on any sign (the tag, or a quote side flagged). False only when something answered cleanly: the tags were read, or
 * both quote sides said false. Null when nothing answered: unknown is never "safe".
 */
export function isHoneypot(input: { readonly tags: readonly string[] | null; readonly quote: QuoteHoneypot | null }): boolean | null {
  if (input.tags?.includes("honeypot")) return true;
  const sides = input.quote === null ? [] : [input.quote.fromToken.isHoneyPot, input.quote.toToken.isHoneyPot];
  if (sides.some((s) => s === true)) return true;
  if (input.tags !== null) return false;
  if (sides.length === 2 && sides.every((s) => s === false)) return false;
  return null;
}
