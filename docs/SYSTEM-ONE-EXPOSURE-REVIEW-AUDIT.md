# Exposure E1-E3 independent review checkpoint

Observed 2026-10-11. Bounded delivery only; the full central/Onchain OS goal remains active.

Baseline: 51edcbc5a17a6805675268ed8dd9703df2b8eebe.
Current brief SHA256: c40854380402c690afb29a603c670b6085c5f1012847cbc5df16073a364c1627.
Current test SHA256: 459912a3e7a69329dd57d6467eae0332743323a0f0415c023552d671ea96afa6.
Frozen SPEC SHA256: 5dfe24aa2de2ab2a7ed55cbe96509a6214ade3acf96603e170d20ae2bf92ad54.
Independent candidate.diff SHA256: 206d5155f03e56c07418eeccdad6d03649dccab4846bb95983f899433aaa8a1c.

## Independent findings received

SPEC reviewer Avicenna, thread 01a12ada-7b55-7fd2-8a20-c940f474c1a1: PASS E1-E3, no introduced blocking finding.
E1 PASS: decimal existing plus proposed notional respects exposureCapUsd without leverage multiplication; fractional equality accepted, true minimal excess rejected.
E2 PASS: excess yields exposure_cap_reached and exclusion from eligibleIds.
E3 PASS: public below/equal/above boundaries, both sides, 1x/2x and dry_run/blocked cycles without financial execution.
Independent probes: 22 boundaries, 489 micro comparisons, six exponent cases, seven invalid cases, existing gates and four cycles passed.
Preexisting finding: SYSTEM-ONE.md funding-unknown block requirement is not enforced by current code, which only notes it. Not resolved by this diff.

STANDARDS reviewer Locke, thread 01a12ada-91d7-7ce0-b6ea-e1556d234224: PASS E1-E3 and standards, no actionable introduced defect or smell in the requested twelve heuristics.
Independent probes: 384 assertions including 82 public boundaries, ten exponent cases, sixteen invalid cases and twelve supplemental cases; dry_run/blocked cycles preserved.
Both reviewers reconfirmed all four hashes above and the two-file diff. Each used an exclusive copy, distinct from implementer codex-inonu-system-one-safety; no edits, financial actions or provider calls.
Limitations: copies have no .git and partial archive provenance cannot certify the entire repository; ai dependency absent prevented original suite execution there. Actual model/effort/tier unknown; configured 6.1 Sol/xhigh does not prove runtime. Filesystem unrestricted, not an enforced read-only sandbox. Finite negative existing exposure and capital -Infinity normalization are preexisting behavior, unchanged.

## Integrator execution evidence

Current full suite session32211 terminal exit0: 1899 pass, 2 skip, 0 fail, 882563 expect calls; 1901 tests, 114 files, 140.01sec.
Module: 29 pass, 0 fail, 122 expect calls. Root typecheck exit0. Diff check exit0.
Web: 377 pass, 0 fail, 2870 expect calls, 36 files. Web typecheck session50802 terminal exit0.
Web build session68510 terminal exit0: compiled successfully in16.5sec, TypeScript8sec, four static pages generated2.6sec; routes / and /_not-found.
Raw execution logs remain outside repository in sibling inonu-system-one-review-spec-20261011: full-suite-decimal.log, web-baseline.log, web-build.log.
Reviewers' global-suite-pending statements describe their last supplied evidence. Integrator subsequently observed the current candidate suite terminal exit0; this is execution evidence, not an independent rerun.

## Boundaries and next work

Only src/system-one/brief.ts and src/system-one/system-one.test.ts are eligible for this local source commit. Internal SPEC/checkpoints excluded from staging. No main merge, push, deployment, signatures, approvals or live operations performed.
Current main51a4e54 and primary055a637 preserved; concurrent review-main-readiness advanced to4d3e9e7. Main does not yet include all System One prerequisites. The broader operator R8 safety, funding-unknown behavior, integration review and localhost flows remain pending.
Existing port3001 listener preserved; served checkout is not established. Build success is not browser-flow verification.
Jev recovery receipt5393d6f6-a75b-487e-9c8c-98522e8dba19, modeljev-1.13.0, selected recover, confidence1, input692/output44, cost unknown. Advice is not authorization.
