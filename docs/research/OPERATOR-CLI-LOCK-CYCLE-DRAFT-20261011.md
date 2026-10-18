# Proposed next operator concurrency cycle

Status: research proposal only; not frozen acceptance, independent approval or permission to start implementation. Full JEV operational goal remains unchanged. Current UI cycle must complete its required gates before a new harness cycle is opened.

## Problem and evidence

The occupied-lock initialization probe and exact current source hashes are recorded in OPERATOR-CLI-LOCK-PROBE-20261011.md. The CLI loads the ledger before acquiring the live lock, and initialization/reconciliation return before acquiring any lock. Existing ledger unit tests exercise exclusive lock acquisition, but bounded search found no CLI regression covering these paths. This is a command orchestration gap, not evidence that the exclusive-file lock primitive fails.

## Proposed observable requirements

L1: An occupied configured lock prevents initialization and reconciliation from changing the ledger or deleting/replacing another owner's lock. Rejection is a nonzero process result with a clear diagnostic.

L2: A live command acquires its configured lock before reading ledger state used by execution, so the ledger snapshot and subsequent writes belong to one exclusive interval. Tests must exercise ordering without constructing signers, contacting providers or activating paid inference.

L3: Lock ownership is released after successful initialization/reconciliation, validation errors and later failures once acquired. A failure to acquire ownership must never release another owner's lock.

L4: Valid initialization remains one-time, corrupt/missing ledger behavior remains fail closed, and reconciliation preserves every unrelated ledger field. No economic limits, live acknowledgement, model identity gate, signing or custody contract is weakened.

L5: Existing offline synthetic usage and read-only/help behavior remain usable; state and journal concurrency must be considered explicitly rather than silently assuming dry-run means no local writes.

L6: Subprocess regressions fail on the frozen baseline, pass on the candidate, and use validated temporary fixtures, an allowlisted environment, `--no-env-file`, no live/Jev flags or provider credentials. Source-order verification for the live path supplements these tests; it does not prove live execution qualification.

## Implementation decision still open

Compare a common exclusive interval for all commands that read/write operator files with a narrower ledger-only interval for initialization, reconciliation and live execution. The former can also serialize synthetic state/journal output; the latter preserves existing offline concurrency but needs a documented answer for stale state and journal races. Obtain source-grounded Jev advice and independent scope review before choosing. Do not clear occupied locks automatically or introduce a second incompatible lock.

## Scope and verification plan

Expected integrator-exclusive files: scripts/okx-operator.ts, a new scripts/okx-operator.test.ts, and necessary documentation. Change ledger.ts only if a verified contract requires it; primitive behavior is currently not disproved. First add actual failing subprocess regressions, then implement the smallest orchestration change that satisfies the independently frozen requirements. Run affected CLI/ledger/operator tests, relevant typecheck, independent exact-hash review and audit before scoped local commit/integration. Do not include concurrent user changes.

The second-leg quote amount discrepancy, runtime read-only qualification, complete ecosystem integrations and strategy evaluations remain separate required work. This proposed concurrency cycle cannot certify the whole goal.

## Current recovery checkpoint

Harness revision65, UI implementation phase. UI code review terminal limited PASS; Avicenna final audit and Turing held-lock reconciliation research submitted and last observed via a timeout, not terminal. Fresh focused UI stream: docs/research/UI-TRUTH-FOCUSED-20261011.log, SHA25612fc79a4107e3dc49234c2341e91f57268acd4a8a9bcab91deb5215207309cc4, 20pass/0fail/79assert, exit0. No production operator change, commit or merge in this continuation.
