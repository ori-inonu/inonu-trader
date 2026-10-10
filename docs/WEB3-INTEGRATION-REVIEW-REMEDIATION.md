# Exact-snapshot review remediation

Date: October 10, 2026. Parent goal remains incomplete.

## Fixed acceptance and authorization

The unchanged acceptance contract is `docs/WEB3-INTEGRATION-DELIVERY-SPEC.md` (I1-I7). I1 distinguishes implementation, local tests, observed integrations and financial qualification. I2 requires maintained tests, static checks and affected build/CLI execution. I3 requires explicit wallet authority, valid identity/network/amounts/freshness and race invalidation. I4 fails closed on unknown costs, stale evidence, missing inventory, unsupported execution and selector failure; hold remains available. I5 requires integer/idempotent capital evidence and no reinvestment of unobserved/unreconciled gains. I6 requires failing regressions before changes and independent review of the exact delivered files. I7 requires evidence/readiness/blockers and no parent completion without autonomous real-wallet integration.

Allowed: bounded local implementation, fixture-only tests/builds, public primary-documentation research and local evidence. Forbidden: reading `.env`, credentials, private wallet/account state or other chats; real wallet/provider authorization requests, RPC/provider/API calls, signatures, approvals, transfers, deposits, swaps, orders, leverage, paid inference/data with unknown budget, installs, deployment, staging, commits, push or history changes. Existing dirty/untracked files are the baseline, not disposable work. Do not edit the fixed SPEC or frozen review manifest. Do not relax safety to satisfy the conflicting original every-300ms real-Kuru-order claim.

## Review evidence and status

Batch `deleg_e97aab13` completed with all three bounded review verdicts `passed=false`. These are independent findings, not yet parent-verified fixes. Passing tests on the old snapshot do not override these findings. Reviewer source/config/spec checks matched the frozen snapshot; two reviewers denied manifest-byte identity because the supplied digest represented LF text instead of the Windows CRLF file.

The parent already reproduced and corrected only the checkpoint digest metadata: raw file SHA256 is `ff5a797afd959d221e6abe045d25fba215c9c0c4ec129739321c98850f403c16`; preserved LF-text SHA256 is `92345c4f2b92bf96b196795bd4003e90c6c70b0f03bf768cd2950dd874eb6e8b`. The frozen manifest itself was not changed. Parent verification checked its raw-byte digest, all 117 listed source/config files, the fixed SPEC and all three passing test/build/type receipts. Original reviewer verdicts and false manifest-verification flags are retained, not rewritten as approvals.

## Findings and observable regressions

- R1 / I3,I6: `web/src/lib/okx-wallet.ts` reads a rejected provider error's `code` accessor without a non-throwing boundary. A throwing getter must not reject session connect/switch/refresh promises or leave `connecting` stuck; only a generic safe error is published. Exercise sibling catches, hostile accessors/proxies and no leaking error text.
- R2 / I3,I6: the wallet quantity parser accepts a 257-bit native balance. Enforce documented local bounded numeric domains before BigInt conversion. Test zero, maximum supported values, over-range/oversized block and native-balance quantities, malformed quantities and final LF/CR/CRLF/U+2028. Preserve exact block-pinned reads and freshness invalidation; do not invent a balance.
- R3 / I4,I6: `JevModel` turns absent usage into zero and Trader silently omits it from the spend ledger. Missing/invalid/unresolved paid-model usage must remain explicitly unknown, stop or hold execution before a send, preserve the stop latch and outstanding-cost evidence, and never look like a zero bill. Explicitly known mock-free behavior remains distinct. Test missing and invalid metadata, late results/rejections, and known usage accounting without an SDK/network call.
- R4 / I4,I5,I6: a lost receipt becomes `gasMon: 0` and is charged/journaled as zero. Represent unavailable gas explicitly as unknown; retain pending exposure/reconciliation evidence, latch hold, and never make incomplete net accounting look complete. Trace related receipt, journal/replay, logging and rendered consumers; invalid/missing receipt cost fields must not become a fallback observed charge. All reproductions use injected transports or synthetic objects, never real transactions.
- R5 / I3,I4,I6: scanner API, scanner join keys and both opportunity normalizers lowercase every chain except 501. Reuse the existing shared chain-aware token identity policy. TRON/unknown-chain case mismatches must never join another asset's facts or produce a research candidate. Preserve existing EVM case-insensitive and Solana case-sensitive behavior. Do not expand the EVM allowlist or repair malformed source identifiers.
- R6 / I4,I6: round-trip behavior trusts caller `source` without binding it to the authenticated client. An authenticated or unqualified client cannot acquire known atomic-output semantics by being labeled synthetic. Coverage plus one bounded raw quote remains the authenticated maximum, with null atomic output/profit/net and unknown costs/units. Add an exported-API reproduction using the real client factory with an injected transport and a false synthetic label. Bind provenance through a minimal enforceable client/API boundary, keep fixture-only paired quote behavior clearly synthetic, and default unqualified provenance/units to the safe path. No second provider quote or profit math is permitted from unverified output. Preserve identity/security/sanitization gates and actual CLI behavior.

## Independent implementation ownership

1. Wallet owner: only `web/src/lib/okx-wallet.ts` and `web/src/lib/okx-wallet.test.ts`. Other frontend files are read-only unless ownership is explicitly extended.
2. Cost owner: model/trader/market and their tests; related journal/replay evidence, backend logging and existing frontend cost/quote consumers as needed. Exact permitted paths are provided in the task contract. No wallet or DEX/scanner writes. No config changes or enabling live paths.
3. Identity/provenance owner: both scanner/opportunity paths, DEX read-only client/round-trip and their tests, DEX CLI and minimal new DEX provenance/fixture helpers under `src/okx-market`. No model/trader/wallet or frontend changes. No dependency/config/SPEC changes.

The parent alone owns shared docs, evidence manifests and checkpoints. Each child must trace definitions/usages first, load the relevant TDD skill, run a deterministic RED reproduction, implement the smallest correction, then run focused GREEN tests. Use Bun, `--no-env-file`, cleared financial/API credentials, and Windows-native TEMP/TMP/TMPDIR under `C:/Users/gabri/AppData/Local/hermes/cache/scratch`. Do not run global builds while other writers are active. No global mock should contaminate other tests. Return absolute evidence-log paths, executed commands/exit codes, files changed, remaining seams and self-review; this is not independent approval.

## Gates and continuation

After all implementers return: verify exclusive ownership and real evidence, integrate any explicitly reported contract seams, run focused regressions then full backend/frontend tests, both typechecks and production build. Observe any affected rendered states in isolated synthetic desktop/mobile QA; prior screenshots qualify only their old snapshot. Freeze the new exact source/config/SPEC/receipt identity using file-byte hashes. Obtain fresh independent SPEC-compliance review, then independent code-quality review. Fix remaining material findings with bounded cycles. Do not reuse failed old reviews or old passing receipts as approval for changed sources.

Known integration gaps retained: read-only wallet inventory is disconnected from scanner/risk/Jev/executor/capital management; authenticated raw DEX reports are rejected by the current importer; native extension/provider access, cost coverage, strategy edge, durable market-backed reconciliation, real-wallet operation and 24-hour runtime remain unqualified. These fixes do not establish profitability or autonomous financial readiness.

Open technical alternatives that genuinely cannot be resolved from the fixed contract require a sanitized bounded JEV decision under an already authorized budget. No such paid budget is established here: do not call JEV or a provider to manufacture an approval; return the dependency/alternatives and continue independent deterministic work.

## Public primary-reference evidence

The URL extractor was unavailable in the configured search-only backend. Site-restricted searches returned primary excerpts for Monad gas pricing and the OKX SDK chain table, not full-document extraction. Ethereum/EIP searches returned no results and are not claimed as consulted protocol evidence. The local quantity bound must be explicit rather than falsely attributed to a verified RPC schema.

- Monad gas pricing: https://docs.monad.xyz/developer-essentials/gas-pricing . Its observed primary search excerpt describes gas-limit charging. That does not turn a missing receipt into an observed zero or known fee.
- OKX's SDK chain table: https://github.com/okx/okx-dex-sdk . Its observed primary search excerpt lists TRON 195 separately from EVM. Public SDK support does not establish this project's entitlement or live qualification.

## Concurrent-work boundary

The pre-remediation check found `package.json` had changed since the frozen review: the current file adds `okx:signals` pointing to `scripts/okx-signals.ts`. The signals subtree and CLI/tests also exist outside the original listed snapshot. This is concurrent work, not a change made or qualified by this remediation. Preserve it, do not import another chat's state or overwrite its files, and do not present the old receipts as full verification of the evolving checkout. Every implementer must compare its own existing owned files to the frozen baseline before edits and stop on unexplained owned-file drift; the parent integrates against a freshly captured full source scope after the wave.
