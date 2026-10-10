# Web3 integration: second bounded follow-up repair cycle

Date: October 10, 2026. Parent: Hermes integrator. Fixed acceptance remains `docs/WEB3-INTEGRATION-DELIVERY-SPEC.md`, I1-I7. This is local implementation toward the already authorized standing goal, not financial permission or a revised profitability target.

## State recovered from this task

Independent read-only reviews in `deleg_a700a7a7` both returned `passed=false`. The actual reports were read from the task's own execution and identity/render scratch directories. Their 155-entry manifest is preserved: 154 entries match, while `package.json` changed to add `okx:defi`. Five DeFi source/test files appeared outside that old manifest; their origin is unknown and their production code is preserved. No other-chat state or private account data was imported.

The parent subsequently repaired only `scripts/okx-defi.test.ts`: the invalid prerequisite that the user's private `.env` must be absent was replaced with a scratch-only synthetic dotenv canary, executable negative controls, and the actual package-route assertions. The real `.env` was not read or changed. Fresh parent checks then passed: backend 469/0 across 44 files, frontend 70/0 across 8 files, both typechecks and production build exit 0, with all 160 selected source/config/instruction entries unchanged. This passing local baseline does not overturn the material independent findings below.

This is follow-up cycle 2 of the maximum two repair/review cycles in `WEB3-INTEGRATION-REVIEW-FOLLOWUP.md`. Cycle 1 was the delivered `deleg_f1bb3658`/replacement-render work followed by `deleg_a700a7a7`. At the end of this cycle, unresolved material findings must be preserved and escalated as concrete blockers, not hidden by another open-ended repair loop. Separate code-quality review remains gated on scoped fixed-SPEC compliance.

## Requirements and observable regression acceptance

| ID | Fixed requirements | Event/condition -> required behavior |
| --- | --- | --- |
| C2-RECEIPT-ID | I4/I5/I6, R4-02/R4-03 | A receipt missing a valid transaction hash, carrying malformed identity, or belonging to a different pending attempt cannot establish success, reversion, observed gas, created/canceled orders, or released capital/exposure. Keep the trusted pending-attempt identity, unknown cost, unresolved exposure and irreversible hold. Correlate before parsing status, price or logs. Matching late receipts still reconcile once; no resend, nonce reset or inferred success. Exercise quote and cancellation paths through the actual Market/Trader boundary, not only a rewritten report fixture. |
| C2-LEGACY-SOURCE | I1/I4/I6, I1-SCANNER-SOURCE | Arbitrary dependency-injected clients, copied/wrapped clients, caller labels and injected transports cannot become observed authenticated OKX access. Derive implementation provenance from internal factory identity where applicable, keep external-access observation separate and unknown/false without independent evidence. Preserve offline CLI behavior, exact token identity, screening and unknown cost/qualification gates. Invocation counts are not proof of network requests. |
| C2-DEX-ERROR | I4/I6, R6-PROXY-ERROR | A hostile rejected Proxy or accessor at either DEX fetch or response-body/classification catch cannot escape as the original object or expose provider text. Preserve safe HTTP/JSON/fetch/timeout errors, one deadline and no retry. Higher-level round-trip results remain unknown/raw-only with no dependent quote or execution/profit qualification. Cover sibling catch paths, not only the outer round-trip wrapper. |
| C2-FEED-PNL | I1/I4/I6, R4-04-FEED-TOTALS-NULL | A reachable feed event with `totals:null`, missing totals or invalid PnL fields must not crash the actual FlowChart or display fabricated zero. Finite known zero remains explicit. Add a real mounted regression, preserve native sizing effects, the existing `model && shown` gate, layout and text conventions. Trace sibling consumers/feed parsing before choosing the smallest safe correction; do not redesign or widen wallet authorization. |
| C2-EVIDENCE | I2/I6/I7 | Preserve original failed reports/manifests; bind a new full current-source manifest to actually run canonical tests/types/build and owned teardown observations. Do not treat 155 old entries as the current checkout. Record preexisting/concurrent changes separately from owner changes. Obtain fresh independent scoped SPEC review before quality review or the next integration stage. |

## Exclusive write ownership

- Receipt implementer: `src/market.ts`, `src/market.test.ts`, `src/trader.test.ts`. `src/trader.ts` is read-only unless a proved class-level boundary fix strictly requires it, in which case report the dependency before writing. Backtest, model, chain transport and all other files are read-only.
- Legacy provenance implementer: `src/okx-api.ts`, `src/okx-api.test.ts`, `scripts/okx-scan.ts`, `scripts/okx-scan.test.ts`. Existing modern factory-provenance contracts are read-only references. No modern-source, provider/chain policy, signals/evidence/DeFi/capture, package or shared-document writes.
- DEX rejection implementer: `src/okx-market/okx-dex.ts`, `src/okx-market/okx-dex.test.ts`. Round-trip/report/client implementations outside this pair are read-only; existing round-trip regressions may be run with injected transports.
- Feed/PnL implementer: `web/src/components/FlowChart/FlowChart.tsx`, `web/src/lib/flow-chart-render.test.ts`, `web/src/lib/flow-chart-browser-fixture.tsx`. A proved boundary change may also use `web/src/lib/useFeed.ts` and `web/src/lib/useFeed.test.ts`, preserving existing public semantics; other components, types, wallet and CSS are read-only. Inspect sibling consumers and report a cross-owner dependency rather than editing outside this set.
- Parent alone: this supplement, readiness/checkpoint, aggregation, manifests, verification scripts and final acceptance. Nobody edits the immutable I1-I7 SPEC or original review receipts.

## Execution limits and evidence

Read applicable CLAUDE/AGENTS and definitions/usages before edits. Use installed Bun `C:/Users/gabri/.bun/bin/bun.exe` with `--no-env-file --no-install`, deterministic injected transports and nonfinancial fixture bytes. Clear inherited financial/API credential aliases without printing their values. All generated test files use an exclusive Hermes scratch directory. Test-first: capture real maintained RED, make the minimal production correction, capture focused GREEN, then stop all writes and return exact paths, commands/exits, log hashes and limitations. Do not weaken the independent criteria or existing tests to mask uncertainty.

No private `.env`/credential/account/wallet state, other-chat transcripts, external API calls, paid inference, install, backend startup, real wallet request/signature/broadcast, financial operation, staging, commit, push or deployment. Synthetic dotenv canaries are scratch-only fixtures, never the user's `.env`. The protected `.hermes/environment.json` denial is unchanged and must not be retried or bypassed. Public documentation may be researched only if necessary and without transmitting repository, wallet or secrets.

Only the feed owner may run the existing narrowly bounded loopback mounted fixture in a fresh isolated headless Edge profile, with synthetic events and cross-origin blocking. Do not use/copy/close the user's browser profile. Verify only owned browser/process/server teardown. No production frontend build in any child: the parent alone builds after all owners stop. Children run focused suites only; shared canonical full checks and final types/build are parent-owned after delivery.

## Completion boundary

Complete this subtask only when the four code findings, fresh snapshot identity, regression evidence and independent scoped SPEC acceptance are established. The next integration seam remains read-only inventory -> eligible candidates -> bounded Jev selection -> integer reservation -> bounded paper execution -> idempotent reconciliation, subject to separate integration SPEC and privacy/cost controls. Preparing a repair or passing fixture tests does not establish that chain.

`parent_complete=false`; `financial_execution_authorized=false`; `paid_api_budget=null`; no real wallet, live provider/execution, profitable edge, exponential growth or 24-hour autonomy qualification. The original real Kuru order in every 300 ms Monad block claim remains unqualified and conflicts with protective hold paths; neither requirement is silently relaxed.
