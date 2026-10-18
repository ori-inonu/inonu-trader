/**
 * The polarity of the provider's tags on a token (`market/token/advanced-info`, the documented set). The list mixes warnings (a honeypot, little liquidity, the developer selling) with tags that say the opposite
 * (smart money is buying, the community recognises the token, the developer is buying, liquidity was added) and some that are only information (a paid promotion). Counting every tag as a "sign of risk" closed
 * exactly the tokens the tracked wallets were buying. A tag that is not known is a warning until someone says otherwise: an unknown word may be a new risk, and nothing here relaxes the unknown. Pure.
 */

/** Tags that are in favour of the token. */
const BULLISH: ReadonlySet<string> = new Set(["smartMoneyBuy", "communityRecognized", "devHoldingStatusBuy", "initialHighLiquidity", "devAddLiquidity", "devBurnToken", "holdersChangeRateHoldersSurge"]);

/** Tags that are only information (a paid promotion, an asset class): neither a warning nor a point in favour. */
const NEUTRAL: ReadonlySet<string> = new Set([
  "dexBoost",
  "dexScreenerPaid",
  "dexScreenerTokenCommunityTakeOver",
  // the names the token-risk read uses for the same kinds of fact: a paid promotion, and a surge of volume (which is activity, and can be either)
  "dsPaid",
  "volumeChangeRateVolumeSurge",
  "rwaXstock",
  "rwaOndo",
  "rwaOndoStatusPreMarket",
  "rwaOndoStatusRegular",
  "rwaOndoStatusPostmarket",
  "rwaOndoStatusOvernight",
  "rwaOndoStatusClosed",
  "rwaOndoStatusPaused",
]);

/** A tag warns unless it is known to be in favour or informational. */
export const isBearishTag = (tag: string): boolean => !BULLISH.has(tag) && !NEUTRAL.has(tag);

export const bearishFlags = (flags: readonly string[]): string[] => flags.filter(isBearishTag);

export const bullishFlags = (flags: readonly string[]): string[] => flags.filter((f) => BULLISH.has(f));
