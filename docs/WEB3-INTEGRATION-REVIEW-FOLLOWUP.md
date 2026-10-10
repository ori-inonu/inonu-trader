# Post-remediation review follow-up

Date: October 10, 2026. Fixed acceptance: `docs/WEB3-INTEGRATION-DELIVERY-SPEC.md`, I1-I7. This supplement defines repairs, not weaker acceptance or financial permission.

## Observed baseline

Both reviewers in the completed own batch `deleg_f661778b` returned `passed=false`. Their complete reports have been recovered and copied byte-for-byte into `docs/evidence/web3-integration-20261010/review-followup-20261010/`. The parent reverified all 134 original source hashes and the unchanged SPEC hash. The current safe source inventory adds 18 public-market-capture files, for 152 source/config/instruction files. Their origin is unknown and they are preserved, not silently attributed or live-qualified.

Fresh canonical baseline: 423 backend/script test executions across 42 files, 69 frontend tests across 7 files, both typechecks and production build passed. Shared capture tests execute repeatedly in several files; the backend count is not a claim of 423 distinct scenarios. All 152 source hashes were unchanged across these runs and current-source adversarial probes.

The parent reproduced every listed finding with actual production code and injected local transports/signers. The PnL probe reproduces the formatter expression currently used by FlowChart; it is not mounted-browser evidence. No real signature, wallet request, financial action, Jev evaluation or paid API call was made. Old pass receipts and wallet pixel-review evidence do not overturn these failed reviews.

Baseline and proof: `docs/evidence/web3-integration-20261010/review-followup-20261010/{baseline.json,current-verification.json}`.

## Repair contract

| Finding | Requirement | Observable acceptance |
|---|---|---|
| R4-01 ambiguous order send | I4/I5/I6 | When an injected broadcast might have succeeded but its acknowledgement is lost, retain a correlatable attempt identity and exposure, journal uncertainty, keep gas/net PnL unknown, latch hold, and withhold complete replay until matching final evidence. Distinguish failure before broadcast from ambiguous broadcast. No automatic resend or inferred success. |
| R4-02 unidentified successful receipt | I4/I5/I6 | Status 1 alone, unrelated-owner logs, malformed or missing order identity do not establish tracked order placement. Preserve unresolved exposure/hold and prevent a further send. Actual cancellation receipts have their own evidence rules and cannot be broken by a blanket quote-order requirement. |
| R4-03 ambiguous cancellation send | I4/I5/I6 | Retain a stable correlatable attempt identity, null gas while unresolved, journal uncertainty, withhold complete replay, and reconcile matching late final evidence exactly once. A receipt for another transaction cannot clear the ambiguity. Keep the irreversible stop latch after reconciliation. |
| R4-05 history aliasing | I4/I6 | Mutation of an event delivered to a callback must not mutate stored history, its nested totals or unknown-cost arrays, or the accumulator. Preserve unknown values; avoid unrelated refactors. |
| R4-06 replay quote count | I5/I6 | Sent -> lost -> placed -> duplicate final evidence for one attempt counts one quote and one final receipt and charges observed gas once. Preserve complete legacy fixture accounting. |
| R4-04 nullable chart PnL | I1/I4/I6 | The actual FlowChart render with null, missing or nonfinite PnL fields shows the existing unavailable label, not signed numerical zero. Valid finite known zero remains an explicit zero. Cover the actual component rendering seam and preserve surrounding layout/text conventions. |
| R5-LEGACY-EVM-CASE | I3/I4/I6 | Both legacy API and scanner match allowlisted EVM address case using the existing shared chain-aware identity policy, including advanced-info matching and duplicate detection. Solana, TRON 195, unknown chains and different chains remain exact/fail-closed. Do not expand the chain allowlist. |
| R6-PROXY-ERROR | I4/I6 | Hostile rejected proxies and accessors cannot escape catch classification or expose provider text. Return sanitized unknown/unqualified raw-only reports, with no dependent atomic quote, net profit or qualification. Cover sibling rejection classifiers on the owned paths. |
| I1-SCANNER-SOURCE | I1/I4/I6 | A caller source label cannot present arbitrary/synthetic client data as observed authenticated access. Derive implementation provenance from nonforgeable factory identity where appropriate, distinguish it from live access, and retain unknown for arbitrary clients. Public registration, clones, wrappers, labels or injected transports cannot establish externally observed access. Preserve offline CLI safety and existing unknown cost/execution gates. |

## Exclusive ownership

- Execution/accounting owner: `src/market.ts`, `src/market.test.ts`, `src/trader.ts`, `src/trader.test.ts`, `src/backtest.ts`, `src/backtest.test.ts`; R4-01/R4-02/R4-03/R4-05/R4-06. `src/model.ts` is read-only: reviewed R3 behavior must remain intact.
- Identity/provenance owner: legacy `src/okx-api.ts` and its test, `scripts/okx-scan.ts` and its test; modern `src/okx-market/round-trip.ts` and its test, `okx-scan.ts` and its test, `okx-api.ts` and its test, `okx-fixture.ts` if strictly required; R5/R6/source findings. Do not edit `token-identity.ts`, providers outside this set, signals, evidence, public capture, package manifests or shared docs.
- Nullable-render owner: `web/src/components/FlowChart/FlowChart.tsx` and a dedicated test in `web/src/lib/flow-chart-render.test.ts`; R4-04. A new narrowly scoped helper in `web/src/lib/` is permitted only if needed. Existing format/presentation helpers, wallet, CSS and backend are read-only.
- Parent alone owns this document, readiness/checkpoint, evidence aggregation and final acceptance. No overlapping implementation writes. A needed cross-owner contract change is reported, not silently applied.

## Execution and evidence

1. Read local instructions, definitions/usages and relevant tests. Preserve the dirty baseline. No stash/reset, installs, staging, commit, push, deployment, external API access, backend startup, user-browser use, private state or `.env` reads. The denied `.hermes/environment.json` outcome must not be retried or bypassed.
2. For each behavior, add a failing maintained regression and capture its real RED output before minimal production edits. Then capture focused GREEN. Do not weaken tests or mask unknown with zero.
3. Use installed Bun with `--no-env-file --no-install`; clear financial/API credential aliases; use an exclusive Hermes scratch directory for all test temporary files. Inject transports and stub signers with nonfinancial fixture bytes. Do not create real signatures or run actual broadcast/approval/funding methods.
4. Child receipts contain exact changed paths, RED/GREEN commands and exit codes, log paths/hashes, observed limits and blockers. Their summaries are not independent acceptance. Do not rebuild frontend concurrently; only the parent performs the final integrated build.
5. Parent runs full canonical checks, validates changed-file ownership and source identity, freezes a fresh delivery manifest, then obtains independent fixed-SPEC review. Separate independent quality review follows only after SPEC compliance passes. Maximum two bounded follow-up fix/review cycles; preserve evidence and escalate a persistent root blocker rather than looping.
6. After material findings are closed, the next eligible integration work remains the missing wallet inventory -> risk -> Jev -> reservation -> bounded paper execution -> reconciliation seam. Do not route private wallet data to a model or fabricate an unavailable provider/budget.

## Unchanged parent gates

### Delivery checkpoint

Replacement render batch `deleg_498c88ac` subsequently delivered the three permitted frontend files. Parent full verification after delivery passed 449 backend and 70 frontend test executions, root/frontend typechecks and production build. All 155 safe entries including unchanged I1-I7 SPEC matched across the five stages. The parent actually remounted FlowChart and observed 15 passing cases with closed fixture/DevTools ports and exited owned Edge process. Nineteen observed baseline-delta paths stay within repair ownership. Frozen source, raw logs, receipts and PNGs are in `review-followup-20261010/post-followup-delivery-20261010/` under the evidence directory. Fresh independent fixed-SPEC review is pending; no quality review or full-goal acceptance is inferred.

One auxiliary blank-browser teardown-probe hash in the returned child receipt ends `14e`, while the actual file-byte digest ends `14b`. The receipt is preserved unchanged and that auxiliary claim is quarantined, not silently corrected or counted as verified. All primary render evidence/source hashes matched, and the parent separately exercised and verified mounted-test teardown. This evidence limitation is part of the next review context.

Original repair batch `deleg_f1bb3658` completed. Parent backend test/typecheck observations are 449/0 across 42 files and exit 0, respectively; all 152 safe-source hashes stayed unchanged during that wave. Observed baseline changes are confined to declared backend ownership, not inferred from shared modified-file notices. Full raw child receipts/logs and parent evidence are archived in `review-followup-20261010/backend-delivery-20261010/` under the evidence directory. These are not independent fixed-SPEC acceptance.

The old R4-04 owner returned `blocked_before_edit`: no product changes, no maintained regression, and no valid RED/GREEN because SSR size 0 hides the PnL branch. Fresh exclusive owner `deleg_498c88ac` must test the actual mounted FlowChart and fix R4-04, preserving the model gate and surrounding layout. A bounded loopback-only fixture server, scratch-only fixture bundle and isolated temporary headless Edge are allowed for this regression. Synthetic events only, cross-origin requests blocked, no user browser profile, wallet or trading backend; verify owned teardown. Parent alone performs the final integrated Next production build. This narrow test-runtime allowance does not bypass the denied environment recipe or grant financial authority.

`parent_complete=false`; `financial_execution_authorized=false`; `paid_api_budget=null`; native `hermes verify` not run; real wallet/execution/profitability/24-hour autonomy not qualified. The real-Kuru-order-every-300ms claim remains unqualified and conflicts with protective hold paths. This repair supplement does not resolve that conflict or certify exponential capital growth.
