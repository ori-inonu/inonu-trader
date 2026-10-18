# Operator persistence: bounded Windows atomic replacement

Status: implementado e integrado (CLI lock: 2e704c7, main f626a30; persistência: 703c626, main ff37327); os parágrafos de proposta e de checkpoint abaixo são históricos.

## Source-backed scope

Baseline 4fe00c9fdbd01f2c9ef2d1933f79a3cd46d7d06b; current C5 six-file candidate remains separate. R8 C6 includes rename reliability; this delivery addresses that part, not HTTP protection or journal rotation. Current ledger.ts SHA256 e1e6db9de5de1305e6d129387acd34b867b4b3df8d9d31eff168b3898bd21a7a writes a complete sibling temporary and calls renameSync without retry. Global suite1903pass/2skip/1fail contains EPERM; its incident cause remains unconfirmed.

Independent experiment in C:/Users/gabri/.codex/worktrees/inonu-operator-c4-research-20261011/persistence-experiment.md reproduces retained-reader EPERM in Node26.9.0 and Bun1.3.14, success after release, complete previous bytes preserved. Closed readers and ordinary replacement each100/100 successful. Directory rejection also produces EPERM: retryable error code alone does not prove a transient condition.

approved_by=jev_delegated architectural advice: evaluate_decisions receipt5c21cb94-54d9-4e7a-b6aa-f11e932d4667 selects bounded_sync, confidence0.77/probability0.83, jev-1.13.0, input604/output60, billed cost unknown. Prior local request skipped unsafe_candidate_id because insufficient_evidence is reserved; corrected request assessed successfully. Advice grants no implementation or financial authorization.

## Immutable acceptance proposal

- P1: Preserve synchronous ledgerFilePersister API and complete same-directory temporary replacement. On Windows only, rename EPERM/EBUSY/EACCES may retry at most four attempts with waits10,20,40ms (70ms total scheduled waits); other platforms/codes throw immediately. The bound excludes unavoidable OS syscall latency; no unbounded loop or async caller migration.
- P2: A transient injected rename failure followed by release succeeds using the same complete temporary; only successful rename changes destination. Never unlink or truncate destination and never report success after exhaustion.
- P3: Existing destination directory or symbolic/reparse-like link recognized by lstat is rejected without retry or mutation. Metadata errors other than ENOENT propagate. Exhausted retry preserves previous destination bytes and propagates the error. No claim of power-loss durability or comprehensive Windows reparse detection.
- P4: Public ledger persistence tests demonstrate initial failure, transient recovery, persistent failure, directory rejection, nonretryable error and exact attempt/wait bounds through a narrow filesystem seam. Real Windows retained-reader release probe exercises production replacement without financial calls. Existing intentional storage-failure, STOP, expiry, approval identity and reconciliation assertions remain unchanged and pass.
- P5: Affected tests, root typecheck and full root suite are exercised with durable exact logs; independent SPEC and standards reviews bind exact final hashes before local commit. Any remaining global failure is recorded, never erased by a narrow pass. No main merge until applicable integration gates pass.

## Implementation boundary and exclusions

Prefer one small replacement helper with an explicit injected filesystem/clock seam for deterministic tests; production defaults use actual synchronous operations. Shared ledger/executor/cycle files remain integrator-owned. Filesystem retries must not initiate additional trade/sign calls; operator guards continue to be rechecked by existing execution flow. No persistence schema change, journal rotation, lock redesign, HTTP change, live gate change or fsync certification in this delivery. These remain separate required work toward the full objective.

## Plan

Independently review scope and acceptance before starting the next harness cycle. Freeze criteria; add failing public regression; implement minimum bounded helper and ledger integration; verify deterministic and real filesystem behavior; run relevant regression/typecheck/full suite; obtain independent reviews and audit. Preserve historical failures and concurrent worktrees.
