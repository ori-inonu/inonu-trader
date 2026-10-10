# v0.0.2 foundation release scope

## Implemented

- Standalone synthetic paper capital accounting with canonical atomic amounts, explicit cost responsibility, fixed commitment/drawdown limits, fail-closed settlement and replay-validated checkpoints.
- A bounded offline supervisor, durable SQLite ownership/state and local fixture CLI. Pending/unknown outcomes remain held for reconciliation; synthetic gain fixtures are not profit evidence.
- Default and aggregate verification commands covering both packages and maintained script regressions. The root build wrapper executes the child build rather than returning successful CLI help.
- Strict hexadecimal RPC-result parsing and diagnostic type corrections. The diagnostics themselves were not run against a provider.
- The inherited Jev goal/timing/inputs descriptions now match post-only attempts and direction preservation. The model's state inputs, evaluator invocation, calculations, criteria and factory remain unchanged.
- The executor no longer changes a model buy into a code-selected sell, or vice versa. It submits that exact valid direction only if existing cap/balance checks permit it; hold, non-directional output and blocked directions create no substitute quote. Existing scheduling, eligibility limits, cancellation/receipt/accounting methods and startup permissions remain unchanged. The console explains rejection without claiming both sides were blocked.
- Both package versions are 0.0.2; baseline identities and dependencies are retained. Non-example environment files, local state, internal records and generated output are excluded from source packaging.

The production dashboard, feed interfaces and real wallet/Kuru/Monad submission path remain in place. Direction validation is the bounded executor correction; scheduling, busy-block handling and head coalescing are unchanged. The paper modules are not imported by that executor or dashboard. The original Jev/real-order/every-block demo requirements remain binding, not replaced by offline tools or certified by preserved code.

## Exercised locally

- 83 backend/script tests and 6 separate frontend formatter tests, with zero failures.
- Both package TypeScript checks, including maintained diagnostics, and a production frontend build.
- Public Jev model regressions with mocked configuration/provider/evaluator: the price feed is supplied to the model, its question describes per-block post-only behavior, and buy/sell output is taken from the evaluator. No genuine inference or trading occurs in those tests.
- Public executor regressions reproduced the old buy-to-sell override before repair, then passed unchanged after repair. Mirrored sell rejection, eligible buy/sell and hold/malformed output were exercised with fake market/model boundaries. Test journals were isolated and cleaned up; the focused tests also passed without a Hermes-specific TMPDIR variable.
- The supervisor CLI help, synthetic gain creation and resume completed; a synthetic unknown outcome exited with the documented held-result code. Resource closure was verified.
- The built frontend returned HTTP 200 on an isolated loopback server; its server-rendered text contained no prohibited punctuation. That owned test server was closed. This was not a browser, wallet or live-feed interaction check.
- Frozen dependency installation with lifecycle scripts disabled, without adding dependencies.

These are local engineering checks, not financial qualification. The gain/resume fixture does not show a profitable strategy, authentic market fills or a growing real wallet.

## Deferred and unqualified

The separately evolving author work is preserved outside this increment: wallet/read-only dashboard panels, DEX reports/scanning/signals and unit research, execution/readiness variants, accounting/replay and broader model adapters. It needs a fresh admitted snapshot, an additive scope where necessary and its own exact review. It is not silently included or declared complete by the version change.

The inherited backend defaults to a mock unless explicitly configured for Jev. A mock or synthetic fixture does not satisfy the Jev demo contract. Actual funded-wallet operations, real receipts and complete accounting, risk/edge qualification, continuous availability, portfolio growth and the broader autonomous-Web3 objective remain unverified. No signing, order, transfer, wallet connection, authenticated exchange call, remote push or deployment was performed for this increment.

Docker image execution was not verified; the existing Docker implementation is not established by the frontend build. Credentials, captures and local state are not supplied with this release. Installation or a saved checkpoint does not create a durable executor.

## Use

See the README aggregate commands and the [paper capital](PAPER-CAPITAL.md) and [offline supervisor](PAPER-SUPERVISOR.md) guides. Create/resume state must be explicitly supplied in a real external local directory. Treat all fixture output as synthetic. The existing trading entry point is separate and requires its own financial authorization and qualification; offline verification never grants those rights.
