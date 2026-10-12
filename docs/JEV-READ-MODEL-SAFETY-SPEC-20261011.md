# JEV read — cancellation, elapsed deadline and finite decision weights

Status: proposed; independent scope review and next-cycle freeze pending. No implementation or tests changed by this proposal.

## Objective, sources and scope

The authorized operational JEV/OKX objective requires invalid or late model decisions to become hold. This delivery corrects independent findings F5 and F6; F1–F4, operator roundtrip economics, ecosystem integrations and strategy qualification remain required work, not exclusions from the full goal.

Baseline: 1f08e6edd589449a82eeb70638987a09572a3bd2, tree 15b1fe6b2ac58c5821b9ab77723610d0afe780aa. Source-backed acceptance: docs/JEV-DECISAO-ONCHAIN-OS.md:56, "Jev indisponível, atrasado ou com resposta inválida significa `hold`." Independent fixed-candidate review: C:/Users/gabri/.codex/worktrees/inonu-system-one-review-spec-20261011/jev-read-0541475-regression-review-20261011.md, SHA256 463a69063c76c32c9543c750b023788d68be7ff9f20113e7bc4ed894b884fae2. That review tested candidate 2d00d8f; read.ts and decide.ts are unchanged by the integrated preview delta. Verify exact blobs before implementing.

## Immutable acceptance proposed for independent review

- M1 — Already-cancelled external signal: runJevRead with otherwise eligible input must not invoke the model. It returns hold/error, confidence null, probabilities buy=0/sell=0/hold=1, advisory true and execution never. Insufficient-input and observe-only behavior remain unchanged.
- M2 — Cancellation during inference: external abort settles the read as hold/error even if the injected model ignores the signal or never settles. No later model resolution can become an accepted buy/sell. Remove owned abort listeners and timers when the read settles; do not modify the caller's signal.
- M3 — Elapsed deadline: a synchronous model that blocks the event loop beyond the configured deadline must yield hold/timeout even if the timer callback has not run before its promise resolves. Compare a monotonic elapsed deadline before accepting the raw response. Internal deadline abort remains propagated to the injected model; normal pending-model timeouts and thrown-model error behavior remain covered.
- M4 — Finite normalization: two finite Number.MAX_VALUE weights whose sum overflows must yield hold/malformed with confidence null and probabilities 0/0/1. A raw buy with all normalized weights zero is never status ok. Preserve ordinary 3:1 normalization (buy=.75, hold=.25), bare valid choice, zero-total rejection, negative/nonfinite weight rejection, model identity and unknown usage semantics. Do not silently rescale the overflow case to make it eligible.
- M5 — Public contract preservation: schema and existing statuses remain unchanged; every read remains advisory/execution never. Valid timely decisions still work. A model still receives its own state copy. Final verification covers the returned read and its public projection, not only HTTP hiding of an invalid read.
- M6 — Evidence and integration: one RED→minimal GREEN vertical slice at a time using the delegated public seams, followed by affected tests and backend typecheck. Independent reviewer replays the original F5/F6 boundaries and controls against an exact fixed candidate before scoped commit and local main integration. No external inference, credentials, wallet operations, funds, push or deployment; preserve concurrent and preexisting files.

## Seams, decisions and ownership

Delegated seam approval: approved_by=jev_delegated, receipt a751459b-350d-4c44-bcf9-072a379f77f6, model jev-1.13.0, input digest 43000e88e19729057efec0d955ae4fc913bd5fc87d073de7e980429ab5c7fd2d, persisted receipt true. The actual evaluated choices are public_read_validator (confidence 1) and external_error (.92). Tests observe runJevRead and validateTapeDecision; injected model is the external inference boundary. External cancellation is error; internal elapsed deadline is timeout. Usage 705 input/95 output; billed cost unknown. Advice is technical delegation within the existing scope, not a human response, independent review or financial authorization.

Integrator exclusively owns src/jev-read/read.ts, src/jev-read/decide.ts, src/jev-read/read.test.ts and this SPEC. Add a dedicated public-boundary test file only if independent scope review supports it; no feed.ts, state.ts, UI or other writer files in this delivery. Reviewers use isolated copies and exclusive evidence files.

## Plan and limitations

Close the independently audited HTTP preview cycle, obtain a source-bound next-cycle review and freeze these criteria before production edits. Then exercise preabort, in-flight cancellation, blocked-event-loop deadline and overflow in separate vertical slices, retain controls, and verify projection/typecheck. Do not alter the independent review probes or acceptance to get GREEN.

Synchronous JavaScript cannot be interrupted by a timer while blocking the event loop. This contract rejects its expired result once control returns; it does not claim preemption or OS isolation. Synthetic tests prove the bounded decision contract, not trading profitability, model calibration, live provider availability or Desktop runtime activation.
