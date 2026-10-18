import { describe, expect, test } from "bun:test";
import * as backend from "../../../src/pilot/protocol";
import * as browser from "./gev-pilot-protocol";

/** The browser bundle cannot import the backend module, so this test is what keeps the two copies equal. */
describe("gev pilot protocol browser copy", () => {
  test("constants match the backend protocol", () => {
    expect(browser.PILOT_MAX_AGE_MS).toBe(backend.PILOT_MAX_AGE_MS);
    expect(browser.PILOT_MAX_QUOTE_AGE_MS).toBe(backend.PILOT_MAX_QUOTE_AGE_MS);
  });

  test("context keys and nonce validation agree with the backend on the same inputs", () => {
    const requests = [
      { sessionId: "s-1", requestId: "r-1", account: "0xEd0C6079229E2d407672a117c22b62064f4a4312", chainId: "0xc4", observedAtMs: 1_700_000_000_000, block: "0x1a2b3c" },
      { sessionId: "s-2", requestId: "r-2", account: "0x0000000000000000000000000000000000000001", chainId: "0x8f", observedAtMs: 1, block: "0x0" },
    ];
    for (const request of requests) expect(browser.pilotContextKey(request)).toBe(backend.pilotContextKey(request));
    const nonces = ["abcdefgh", "short", "a".repeat(81), "ok_nonce-123", "ed0c6079229e2d407672a117c22b62064f4a4312", 42, null];
    for (const nonce of nonces) expect(browser.pilotNonceValid(nonce)).toBe(backend.pilotNonceValid(nonce));
  });
});
