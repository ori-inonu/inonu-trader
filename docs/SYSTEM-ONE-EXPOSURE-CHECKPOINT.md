# Local verification checkpoint — 2026-10-11

Local evidence only; exclude this checkpoint and the frozen SPEC from commits.
Full operational-central goal remains active. No main merge or live financial action.

Candidate baseline: 51edcbc5a17a6805675268ed8dd9703df2b8eebe.
Candidate brief SHA256: c237f81971e87971f2ffbca424eb9670493c4d9e3bf0413a4db0c15fcb7b8c92.
Candidate tests SHA256: 95f50648da320e35d4d01c0b17bd45696e55edf7a27a374d427540a35c252238.
Frozen SPEC SHA256: 5dfe24aa2de2ab2a7ed55cbe96509a6214ade3acf96603e170d20ae2bf92ad54.

E1/E2: comparison removes both the leverage multiplier and the 1e-9 tolerance.
E3: public buildLeverageBrief tests below/equal/above ceilings at 1x/2x,
including open notional 230.0000000005 and 210.0000000005.
The added precision regressions observed red: 24 pass, 2 fail (eligibleIds incorrectly included).
After removing tolerance: 26 pass, 0 fail, 107 expect calls, exit 0.
Command: bun --no-env-file test src/system-one/system-one.test.ts.
Typecheck: bun --no-env-file run typecheck; exit 0.
git diff --check: exit 0.

Full suite on previous candidate: 1889 pass, 2 skip, 5 fail across 114 files,
307.60 seconds, exit 1. Three child_handshake_timeout failures in
paper-supervisor-runner; two 15000ms timeouts in derivatives/qualify-live.
Full suite is not certified passing and has not run on the precision fix.
Isolated derivatives and qualify-live rerun: 33 pass, 0 fail, 533 expect calls,
45.60 seconds, exit 0; same configured 15000ms test timeout. Root cause unproven.
Isolated supervisor run ongoing when this checkpoint was written.
Raw logs outside repository, under sibling inonu-system-one-review-spec-20261011.

Independent standards reviewer found tolerance breach and internal records in SPEC.
Tolerance fixed through red/green. SPEC remains local, immutable and unstaged.
Updated candidate sent to two independent isolated-copy reviewers; final review pending.
No candidate approvals inferred from prior reviews or passing tests.

Researcher verified price/candles/current-index clients and endpoint registration
already present in baseline. R6 inventory text stale; JSON already indicates coverage.
Capture source discards individual provider timestamps and candle volUsd; quote
unit remains unknown. Research does not certify authenticated live availability.
Next eligible work: finish isolated failure investigation, obtain current independent
review, record SDD coverage; complete remaining System One/operator findings before
broader main integration; refresh resource inventory and specify capture provenance.
