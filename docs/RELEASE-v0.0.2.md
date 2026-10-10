# v0.0.2 integration candidate

## Status

Version metadata is `0.0.2` in the backend and frontend manifests. This is an integration candidate, not a released, deployed or financially qualified system. Local `main` has not been updated by this integration. Passing tests must not be reported as evidence of actual trades, daily operation or profitability.

The integration uses an isolated release worktree so the active Codex checkout and its ongoing work are not staged, reset or replaced. Source was frozen on 2026-10-10 at 03:03:22 UTC-03:00 against baseline `b587759e459ea049590102e54a0b07800864cdc3`. Additional isolated candidates from all three parent sessions require explicit accounting, stability checks and review before admission.

## Capability boundaries

| Capability | Candidate scope | Evidence boundary |
| --- | --- | --- |
| Dashboard | Local frontend, wallet view and historical DEX report panel | Production build, types and 56 frontend tests passed after remediation. An earlier HTTP 200 does not prove the running port 3001 process serves the newest build. Browser wallet interaction is not thereby qualified. |
| OKX Wallet | Explicit user connection and read-only finite asset balances | Connecting is not signer custody, a consolidated portfolio, a transfer or permission for the trader. Real extension/account behavior remains unverified in this integration. |
| OKX market and DEX research | Synthetic defaults, explicit optional read-only API adapters | Fake-transport and local fixture tests do not establish authenticated service access, current quotes, net profit or execution qualification. |
| Accounting replay | Reconstruction of supplied journal events, with order-linked fills and fail-closed unknown receipts | Not a causal strategy evaluation. External authenticity cannot be inferred from a self-declared source. A synthetic RPC regression exercises the public paper producer through journal replay; it does not prove market execution. |
| Paper capital and supervisor | Synthetic funded ledger and bounded fixture lifecycle/recovery | Not a live market adapter, unattended 24-hour service or custody system. |
| Jev | Typed directional model integration is present; mock is a disclosed offline stand-in | The integration has not run a paid market-decision capture or proved profitable Jev trading. Plugin credentials are not copied into the application. |
| Kuru / Monad real orders | Signing and executor code exists, but startup is deliberately blocked | No real wallet, order, deposit, transfer or reconciliation was exercised. Do not remove the gate merely to satisfy a demo claim. |

## Contract conflict and merge gate

`CLAUDE.md` and the original `SPEC.md` require Jev decisions and real orders on every approximately 300 ms block. `docs/READINESS-SPEC.md` requires default paper/mock operation, capital protection, hold, quote intervals and no financial authorization. The candidate currently defaults to a 100-block quote interval and rejects live startup. Those facts do not satisfy the original live/every-block claim.

The integration acceptance contract requires investigating this conflict without silently weakening either requirement. The current disposition is to correct independent software defects, preserve the real executor source and safety gate, and keep the unresolved requirements explicit in the final independent Standards and Spec review. No advisory decision, version bump, suite result or local merge can grant financial authorization.

Regression coverage exercises the public replay function/CLI, paper producer journal, report render view and scanner CLI/fake-transport boundary. Passing those interfaces is not release approval, a contract change or evidence of live application trading.

## Verification recorded before this remediation cycle

- Root command: `bun --no-env-file run test`, 260 passing tests, zero failures, across 29 files. Bun's `src scripts` filters also discovered all 54 frontend tests; these counts are not additive.
- Frontend command: `bun --no-env-file run test`, 54 passing tests, zero failures, across six files.
- Root and frontend TypeScript checks and frontend production build passed.
- Root and frontend frozen-lockfile installs and dependency-import checks passed.
- Managed production frontend smoke returned HTTP 200. A separate localhost server was then started on port 3001 and returned HTTP 200 with the INONU, OKX connect and DEX report panels present.

These are pre-remediation results, not approval of a later source tree. Full tests, types, build, behavioral checks and independent review must be repeated for the exact final candidate.

## Packaging correction

The initial standalone review snapshot omitted some unchanged baseline files. The actual Git release worktree retains `bunfig.toml`, `SPEC.md`, the Bun rule, the root entry point and `.dockerignore`. The Dockerfile's current copy prerequisites are present; the missing-snapshot-file finding must not be applied uncritically to the worktree.

Environment variants and local runtime/evidence artifacts are excluded from Git staging eligibility. Captures, internal decision/review/coordination records and screenshots under `docs/evidence` are excluded from publication. Documentation JSON records, generated root review/verification artifacts, checkpoints, baseline diaries and internal tool plans are likewise excluded. Their local files and immutable review snapshots are preserved; historical reports and hashes are not rewritten. Documentation may refer to these archived local artifacts, which are not installation/test dependencies or bundled proof of financial qualification. Environment variants, Git metadata and local tool/build material are denied by Docker-context patterns. Both `.env.example` files remain eligible as setup examples. Static checks passed; Docker is not installed in the reviewed host, so an image build was not executed and is not claimed.

## Remediation and reconciliation observed on 2026-10-10

- Root full suite: 275 tests passed, zero failed, across 29 files. This root count includes the frontend tests and is not additive with the frontend count. Root TypeScript passed.
- Frontend: 56 tests passed, zero failed, across six files. Production build and TypeScript passed in a fresh verification.
- Replay rejects fills without an eligible matching order, incompatible source/status, side/price mismatches, premature fills and excess cumulative volume. Unknown transaction outcomes are not zero-cost confirmed receipts.
- The paper producer now records the same negative order ID on the emitted quote and its later fill. The public producer-to-replay regression failed before this fix and passed afterward. Historical journals lacking linked identities are not repaired or reinterpreted.
- Imported DEX reports display declared, unverified provenance; their own `synthetic` flag cannot award a verified-looking origin badge. Forbidden rendered punctuation is covered by render regressions.
- Legacy OKX scanning fails closed instead of bypassing the newer support/coverage contract. Scanner/API tests include deduplication, supplied-chain coverage and bounded selection behavior.
- All three parent sessions were accounted for. Parent 2 supervisor sources match the frozen input. Divergent causal-backtest, OKX and UI source variants are deferred because of documented regressions, competing versions or missing independent qualification. They were not deleted or admitted to this candidate.
- A repaired causal v3 variant was outside the scoped reconciliation paths and remains unreviewed; there is no claim that every later author edit was imported.

These checks qualify specific offline software behavior, not the live/every-block promise. Final independent reviews must target an immutable copy of this candidate before any release commit or merge is considered.

## Remaining obligations

Independent Standards and Spec reviews both rejected the preceding fixed candidate. Standards also identified internal agent records contrary to `CONTRIBUTING.md`. Publication exclusions address the identified record families without deleting local evidence, but that correction is not independent approval of a new source tree. The live/every-block conflict still blocks the main gate. Historical reviews remain preserved outside the public source set.

1. Preserve remediation evidence and deferred-source accounting without modifying author work.
2. Freeze the final candidate and obtain independent Standards and Spec reviews against its exact hashes.
3. Resolve the live/every-block contract conflict without removing safety controls, weakening the immutable criteria or inferring financial permission.
4. Commit only explicitly inventoried and qualified source in the release worktree. Merge local `main` only if the independent gate passes. If material requirements remain unmet, retain the candidate and report the blocker instead of merging.
5. Verify the resulting refs/tree if a merge occurs. No remote push, deployment, financial operation or exponential-growth claim is included.
