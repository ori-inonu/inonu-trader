# v0.0.2 release candidate

## Status

- Version `0.0.2` in the root and `web` manifests.
- Built on `main` at `b587759` from the `codex/inonu-trader-preparation` worktree state, plus the web format test from `hermes/release-v0.0.2-receipt-safety`.
- The receipt-safety hardening itself (strict receipt witness validation, quarantine after unverified or lost receipts, quote provenance) is NOT integrated. Its two test files are kept as an opt-in conformance suite (see Known limitations).
- Correction (2026-10-10): the first merge commit said the 18 receipt tests passed against the integrated code. That was wrong. They imported the code of a separate worktree by absolute path and never exercised `main`; once that worktree was removed they failed to load. They are now skipped unless `RECEIPT_SAFETY_SOURCE` points to a checkout of the receipt-safety branch.
- Divergent variants of the same files in `hermes/release-v0.0.2` and `hermes/release-v0.0.2-ready` are not admitted. They are preserved as snapshot commits on those branches.
- Local merge only. Not pushed, not tagged, not deployed.
- Paper by default (`DRY_RUN=true`). Live Kuru/Monad execution is blocked in code: `Market.init()` refuses to start with a wallet until execution is qualified.
- No financial authorization exists for this release. Nothing in building or verifying it placed an order, transferred funds, signed a transaction or approved a token.
- Passing tests are not evidence of profit, daily operation or live execution.

## Capability boundaries

| Capability | Status in v0.0.2 | Evidence boundary |
| --- | --- | --- |
| Jev decisions (`MODEL=jev`, TypeSafe AI SDK) | Implemented | Exercised with fake models in tests. No paid inference was run for this release; billed cost is unknown. |
| Paper trader on real Monad book reads (`DRY_RUN=true`) | Implemented | Exercised offline with fixtures. Live RPC behavior was not observed for this release. |
| Live Kuru/Monad orders | Code path present, startup blocked | Not exercised. Requires the qualification work and an explicit financial decision. |
| Receipt accounting and replay | Implemented with `main`'s own latches (pending, unknown and ambiguous receipts) | Covered by `src/trader.test.ts` and `src/market.test.ts`. The stricter receipt-safety hardening is not integrated. |
| Dashboard (`web`) | Implemented | Production build and 76 frontend tests pass. Browser interaction not re-run for this release. |
| OKX Wallet connection | Read-only, balances kept in browser memory | Connecting is not custody, a transfer or permission for the trader. Real extension behavior is unverified. |
| OKX market, DEX, signals, evidence, DeFi scanners | Offline synthetic demos | The five `okx:*` scripts exit 0 offline. Authenticated access, current quotes, costs and exit liquidity are not qualified. |
| Paper supervisor | Synthetic fixture lifecycle | Not a market adapter and not a 24-hour service. |
| 24-hour operation | Not qualified | No runtime observation exists. |
| Profitability and leverage | Not established | No out-of-sample evidence. Leverage is not implemented. |

## Open contract decision (operator)

Two contracts conflict and both are frozen in the repository:

1. The frozen readiness and profit acceptance (`docs/READINESS-SPEC.md`, `docs/PROFIT-SPEC.md`) governs this candidate. Defaults: `QUOTE_INTERVAL_BLOCKS=100`, `MIN_CONFIDENCE=0.65`, economic pre-gate on.
2. `CLAUDE.md` and the original `SPEC.md` require Jev to decide and quote on every ~300 ms block, and forbid deciding every N blocks.

This candidate keeps contract 1 as the default and does not silently weaken either one. The operator can select every-block evaluation with:

```bash
ECONOMIC_GATE=false
QUOTE_INTERVAL_BLOCKS=1
MIN_CONFIDENCE=0
```

Even in that mode, a block that arrives while an inference is still pending is recorded as `late` with no quote, as `SPEC.md` describes. Strict every-block confirmation within the same block is not qualified: it depends on Monad head semantics and on live receipt timing that has not been observed.

## Verification performed on this candidate

- Root `bun --no-env-file test --parallel=1 --timeout 15000 ./src ./scripts`: 484 pass, 2 skipped, 0 fail, 46 files. The 2 skipped are the opt-in receipt-safety conformance suites.
- Root typecheck (`tsconfig.verification.json`): passed.
- `web` tests (`bun test ./src`): 76 pass, 0 fail.
- `web` typecheck and production build (`next build`): passed.
- Frozen-lockfile installs in root and `web`: passed; lockfiles unchanged by the version bump.
- Offline OKX scripts (`okx:market-scan`, `okx:dex-quote`, `okx:signals`, `okx:evidence`, `okx:defi`): exit 0.

## Known limitations

- Receipt-safety hardening is not integrated: `Market` and `Trader` in `main` have no "unverified" receipt status, no quarantine of later sends after an unverified or lost receipt, and no quote provenance. `src/market.receipt.test.ts` and `src/trader.receipt.test.ts` are the conformance suites for porting it; run them alone against a checkout of branch `hermes/release-v0.0.2-receipt-safety` with `RECEIPT_SAFETY_SOURCE`. Porting it is pending work.
- A sent quote whose receipt is still pending blocks further quoting until the receipt is observed. Its effect on cadence has not been measured on live RPC.
- Authenticated OKX APIs, current OKX Wallet extension behavior, provider unit/cost coverage and exit liquidity remain unknown. Those dependencies block any OKX execution path.
- The recorded readiness journal has one unlinked fill that is preserved, not repaired. Replay of that journal is not claimed as passing.
- No independent Standards or Spec review was performed on this candidate.

## Excluded from Git (kept on disk)

`.omh/`, `.scratch/`, `docs/evidence/`, `NUL`, `.env` and `data/` are excluded. They hold internal agent records, captures and local runtime state. The `.env.example` files remain as setup examples.
