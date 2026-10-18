import { describe, expect, test } from "bun:test";
import { bearishFlags, bullishFlags, isBearishTag } from "./risk-tags";

describe("the provider's tags are not all warnings: a tag that says smart money is buying is not a risk", () => {
  test("the tags that warn are bearish; the unknown ones too, because an unknown word may be a new warning", () => {
    for (const tag of ["honeypot", "lowLiquidity", "devHoldingStatusSell", "devHoldingStatusSellAll", "volumeChangeRateHoldersPlunge", "someNewTagOfTheProvider"]) expect(isBearishTag(tag)).toBe(true);
  });

  test("the tags that are in favour or only informational are not warnings", () => {
    for (const tag of ["smartMoneyBuy", "communityRecognized", "devHoldingStatusBuy", "initialHighLiquidity", "devAddLiquidity", "devBurnToken", "holdersChangeRateHoldersSurge", "dexBoost", "dexScreenerPaid", "dexScreenerTokenCommunityTakeOver"]) expect(isBearishTag(tag)).toBe(false);
  });

  test("the tags the token-risk read really sends are classified: a paid promotion (dsPaid) and a surge of volume are information, not warnings; they marked 10 of 12 live candidates as risky and a held token the agent had just bought as a reason to sell it", () => {
    for (const tag of ["dsPaid", "volumeChangeRateVolumeSurge"]) expect(isBearishTag(tag)).toBe(false);
    // a surge of volume is information, not a point in favour: only the clearly favourable tags count as that
    expect(bullishFlags(["dsPaid", "volumeChangeRateVolumeSurge"])).toEqual([]);
    expect(bearishFlags(["smartMoneyBuy", "dsPaid", "devHoldingStatusSellAll"])).toEqual(["devHoldingStatusSellAll"]);
  });

  test("a list is split by polarity, and only the clearly favourable tags count as in favour", () => {
    const flags = ["smartMoneyBuy", "lowLiquidity", "dexBoost", "communityRecognized"];
    expect(bearishFlags(flags)).toEqual(["lowLiquidity"]);
    expect(bullishFlags(flags)).toEqual(["smartMoneyBuy", "communityRecognized"]);
    expect(bearishFlags([])).toEqual([]);
  });
});
