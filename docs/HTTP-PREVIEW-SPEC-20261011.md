# HTTP preview — specification and cycle proposal

Status: proposed; independent scope review and typed cycle approval pending. No production changes or new tests yet.

## Objective and baseline

The authorized goal includes making the integrated main visible on localhost without financial execution. Baseline main/integrator: f626a3026a524f61d7e9f7baf6ad6c54ebf89a6c. Prior CLI lock acceptance remains immutable. Roundtrip amount/cost/proof specification remains pending in parallel, not superseded.

Independent startup research: docs/LOCALHOST-MAIN-STARTUP-RESEARCH-20261011.md. Runtime evidence: docs/LOCALHOST-ORIGIN-DIAGNOSIS-20261011.md. The existing temporary listener is not a main entrypoint: it allows only frontend 3005 and reads legacy worktree state. Preserve it until ownership, replacement and rollback are verified; do not widen its allowlist to expose that state.

## Requirements and acceptance

- P1: A dedicated HTTP-only CLI starts a loopback listener from the integrated source, using the existing public read handlers. It must not import/run trader, Market, model evaluator, chain/feed producers, signer, executor or operator loop. The root application startup behavior and execution gates remain unchanged. A real isolated subprocess integration test observes the HTTP boundary; import/source inspection supplements it and is not OS-level egress certification.
- P2: Preview initialization uses explicit validated port, exact HTTP loopback dashboard origins and absolute isolated state directory. Reject wildcard/non-loopback origins and invalid inputs before binding. Do not use legacy default data paths or credentials to populate preview. Missing operator/System One snapshots remain truthful 404s. No snapshot, journal, ledger, order, key or approval is created by initialization/requests.
- P3: Root/history/SSE report empty history/latest, wallet null, model none, mode read_only and dataSource identifying preview without producer. A connected SSE transport is not a trading feed or proof of simulation/qualification. Browser shows execution unverified and explicit source; unavailable panels remain unavailable. Do not manufacture financial decisions or balances.
- P4: GET/OPTIONS from the configured frontend origins work across root/history/events/operator/System One; unlisted origins receive 403 and no permissive CORS. Mutation methods receive 405. Retain existing read-handler token and projections for normal startup; preview has no inherited token/state-path fallback. Verify actual response status/header behavior, not source defaults.
- P5: Listener and heartbeat can be explicitly closed for tests/replacement; startup failure does not orphan a timer or kill an unrelated process. Existing startServer callers and broadcasts remain compatible. Default production behavior cannot silently become a preview or have its gates weakened.
- P6: Obtain new RED through the agreed public CLI/subprocess HTTP seam before implementation, GREEN plus relevant existing HTTP/frontend presentation tests and typecheck. Independently review exact source/spec/test evidence before scoped commit and local main integration. Verify visible integrated UI with a clean browser, no wallet connection/signing/API inference and known process ownership. Record exact running entry/API URL/port/baseline and limitations. No push/deployment or actual financial operation.

## Proposed ownership and sequence

Integrator owns src/server.ts, scripts/http-preview.ts, scripts/http-preview.test.ts, package.json and this SPEC; relevant server test addition only if subprocess evidence requires it. No frontend behavior change unless current presentation fails P3, which would require explicit source-backed amendment and review before expanding these files.

Reuse public handlers and startServer; add explicit preview options and lifecycle without duplicating HTTP implementation. Tests observe startup/meta/SSE, origin boundaries, unavailable state, mutation refusal and clean closure, with sanitized env and absent isolated state. Test isolation must exclude .env loading and automatic dependency installation and must record the limits of instrumentation. No fake provider success.

Runtime rollout happens after independent review and local integration. First start at an unused loopback port with known owned PID; do not stop old listeners based merely on their port. Connect frontend to the proven API URL using an exact public main copy/build with explicit environment. Replacing an owned temporary listener requires executable/source identity revalidation and preserving rollback. Check browser evidence afterward; a transport-only preview does not complete the broader JEV/OKX objective.

## Decisions and exclusions

Jev task sequencing receipt a5a260af-c4ab-4a11-9303-6660f2582537: assessed preview_cycle, confidence .8; model jev-1.13.0, usage 784 input/51 output, billed cost unknown. Advice within existing authorization, not independent review or financial authorization.

No real balances, snapshots from unreviewed private state, model calls, quotes, RPC, orders, signatures or transaction approvals. Missing live credentials/producer evidence remain dependencies; safe preview is one delivery, not a substitute for the final operational system.
