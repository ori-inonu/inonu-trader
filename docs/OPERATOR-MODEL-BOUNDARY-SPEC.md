# Operator R8 C5: decision identity at execution boundary

## Observed objective and scope

Continue the full active inonu-trader goal: central JEV operations integrated with Onchain OS and OKX Wallet, prioritizing pending operator security, independently verified local integration and localhost. Prior exposure acceptance was a bounded part, not the complete native objective. This next bounded delivery addresses R8 C5 only; C1-C4 and C6-C9, financial authorization, strategy measurements and full UI/integration remain separate pending work. No funds, signatures, approvals, external publishing or provider trading calls in implementation or tests.

Baseline: 4fe00c9fdbd01f2c9ef2d1933f79a3cd46d7d06b. Sources verified 2026-10-11:
- R8 docs/research/R8-re-revisao-operador-f1-f8-20261011.md SHA256 1b128ed5f136d4bd5d0b94f5fbf6ae61cfcdd582f0c86ed175d245df0b45de9f requires executePlan receive model and reject mock with a test.
- src/operator/executor.ts SHA256 53245d19076be7f193e5b7c9fc1ca86aeff06206ec567e959fabcc0f1b266454 accepts only plan/candidate/deps, with no decision identity check.
- src/operator/cycle.ts SHA256 77519f147edb47c13bcd373c537ed0af8b9eaa8faa22481efd6fab226bfd34d7 validates a decision but does not forward its context to executePlan.
- src/operator/jev-selector.ts SHA256 5b784de6051e5747363c47324f2ecd9d71b4c28d1d356701d195dd56dd80ace2 validates probabilities against the full eligible list, not only the chosen candidate.

## Requirements and immutable acceptance

- M1: qualified_live execution requires explicit model identity and a typed decision validated against the full eligible candidate set. Missing context, blank identity, mock identity (case-insensitive after trimming), invalid decision, decision/model identity mismatch, hold or choice/plan/candidate mismatch blocks before trade-client calls, signer calls or ledger writes. A caller-provided realModel gate alone never satisfies this requirement.
- M2: runOperatorCycle forwards the actual model identity, validated decision and full eligible list. With MockOperatorModel and all qualification gates open, execution is blocked with zero transaction/client side effects and no ledger mutation attributable to execution.
- M3: valid non-mock synthetic decisions with multiple eligible candidates preserve probability validation and reach existing execution safety checks; qualified_dry_run remains simulation without requiring live decision identity. Existing expiry, STOP, signer, allowlist, receipt and reconciliation guards remain effective.
- M4: all tests use synthetic external boundaries; no provider/API/financial execution. Root affected tests and typecheck pass. Independent SPEC and standards reviews bind exact candidate hashes before a local commit. No main merge approval is implied by this bounded delivery.

## Architecture and approved public seams

Separate optional execution context argument contains model identity, OperatorDecision and full eligible list; missing context fails closed for qualified_live. Persisted ExecutionPlan schema remains unchanged. Reuse validateOperatorDecision rather than infer keys from caller probabilities. Identity consistency is a necessary local control, not cryptographic proof of provider inference or user financial authorization. Model adapter selection and the separate live gates remain required.

Public executePlan and runOperatorCycle are the test seams; synthetic external clients/signers and public ledger outcomes establish whether side effects happened. approved_by=jev_delegated: actual evaluated receipt 0cfbec59-955c-4cf0-ae90-6d968f7f5e88 selected full_context (confidence .95) and executor_cycle (.83), model jev-1.13.0, input602/output94, billed cost unknown. Prior architecture receipt cef296fb-d573-4f66-85a1-82b4958da620 favored separate decision context over persisted plan migration. Advice grants no permissions.

## Execution plan

After independent cycle scope review and frozen acceptance: public missing/mock regression RED, minimal boundary GREEN; then invalid/mismatch and valid multi-candidate slices, cycle wiring and migration of existing synthetic live fixtures to explicit non-mock test identities without weakening their safety assertions. Verify affected module suite, root typecheck and broader suite proportionately; obtain isolated independent reviews and audit. Commit only reviewed source changes, preserve internal records outside staging. Full native goal remains active.
