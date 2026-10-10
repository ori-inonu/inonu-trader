# OKX API identity mismatch fix

## Scope

Implemented the targeted public-boundary correction for E1/E3/E4 in the isolated API client. The frozen acceptance source remains `docs/OKX-ECOSYSTEM-V1-SPEC.md`, SHA-256 `13BA216CCA87B8FD139D95895CD84A30DF536788602FA4679201B8307AA856CB`. The advanced-info source correction is applied: its successful `data` value is an identity-bearing object, normalized to the existing one-element array seam.

`OkxIdentityMismatchError` is exported with the endpoint discriminator `advanced | pools | prices` and the constant message `OKX API returned an identity mismatch.`. It contains no response fields, address, secret, URL, or provider detail. Malformed or absent identities remain generic schema errors. EVM addresses are normalized case-insensitively; chain `501` preserves case. Pool assets are checked only for the identity-bearing shape needed by this contract; optional fields remain untouched.

## TDD evidence

Commands ran in `C:/Users/gabri/.codex/tmp/jev-trader-01a1216a/okx-api-implementer` using fake credentials and injected fetches only. No real network, `.env`, wallet key, retry, or authenticated API call was used.

1. Initial RED, before exporting the new error type:
   `C:/Users/gabri/.bun/bin/bun.exe --no-env-file test ./src/okx-api.test.ts` — exit 1; Bun reported the missing `OkxIdentityMismatchError` export and ran 0 tests. This identified the minimum public type needed for behavior assertions.
2. Behavioral RED, after adding only that public type and before endpoint behavior changes:
   `C:/Users/gabri/.bun/bin/bun.exe --no-env-file test ./src/okx-api.test.ts` — exit 1; 11 passed, 5 failed, 54 expectations. The failures reproduced generic errors for valid price/pool mismatches, accepted advanced data without identity, accepted a valid advanced mismatch, and misclassified a Solana case mismatch.
3. GREEN after the endpoint fixes:
   `C:/Users/gabri/.bun/bin/bun.exe --no-env-file test ./src/okx-api.test.ts` — exit 0; 16 passed, 0 failed, 75 expectations. The same run also exercised previously present stale protocol-discovery and pending-JSON-body timeout regressions.
4. Typecheck:
   `C:/Users/gabri/.bun/bin/bun.exe --no-env-file run typecheck` — exit 0; `tsc --noEmit`.

## Final source hashes

| File | SHA-256 |
|---|---|
| `src/okx-api.ts` | `A0F454D1D7CD0AD13C8E6CCDE8FBE3C1B754945C08D420606A61EE1CE0053393` |
| `src/okx-api.test.ts` | `DA967F4F93CAB356EF996E612DF3A2326437D68DA8B08A4294326769BA9192A1` |

The integrator can copy these two source files and this report into the candidate namespace. This report does not certify live access, safety, profitability, or execution qualification.
