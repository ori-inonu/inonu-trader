// The Solana tokens the older reader looks for are identified by their mint, never by their symbol. A wrong mint matches no token account, so the reader would show that token as zero
// for everybody, silently. The two mints below are the canonical ones on Solana mainnet; the USDT one was also seen in a live read of a real wallet through the local gateway
// (2026-10-13). origin: synthetic_fixture, tests only.
import { describe, expect, test } from "bun:test";
import { SOLANA_TOKENS } from "./okx-solana";

const BASE58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

describe("the mints of the older Solana reader", () => {
  test("USDC and USDT are the canonical mainnet mints, with six decimals", () => {
    expect(SOLANA_TOKENS.find((t) => t.symbol === "USDC")).toEqual({ symbol: "USDC", mint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", decimals: 6 });
    expect(SOLANA_TOKENS.find((t) => t.symbol === "USDT")).toEqual({ symbol: "USDT", mint: "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB", decimals: 6 });
  });

  test("every listed mint is a base58 address of the length of a mint, and no mint is listed twice", () => {
    for (const token of SOLANA_TOKENS) expect(BASE58.test(token.mint)).toBe(true);
    expect(new Set(SOLANA_TOKENS.map((t) => t.mint)).size).toBe(SOLANA_TOKENS.length);
    // a mint is 44 characters for these two: a 43 character one is a truncated copy
    for (const token of SOLANA_TOKENS) expect(token.mint.length).toBe(44);
  });
});
