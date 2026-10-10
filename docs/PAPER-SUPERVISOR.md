# Offline paper supervisor

The supervisor runs a bounded synthetic paper strategy against a local fixture adapter. Its persisted identity is always `synthetic-paper`; `strategyQualified` and `financiallyAuthorized` are always `false`. The fixture uses a synthetic native asset on chain `31337`, with an initial balance of 1,000 atoms, a 400 atom commitment limit, and a 100 atom drawdown limit. These values are test data, not a market feed or financial authorization.

The supervisor owns the durable sequence from plan reservation through adapter intent, fixture execution or reconciliation, receipt validation, capital settlement, and owner release. It checks each persisted transition against the canonical envelope and SQLite row. A pending or unknown result remains held for reconciliation. A receipt with incomplete or invalid cost accounting is not accepted; the capital stop and adapter hold are persisted while the committed principal remains reserved.

## Run the local CLI

Use the repository's installed Bun runtime without loading environment files or installing packages:

```text
bun --no-env-file --no-install src/paper-supervisor-runner.ts --help
```

The runner accepts `--mode create|resume`, an absolute `--state-dir`, and one fixture selector: `gain`, `loss`, `pending`, `unknown`, or `incomplete-cost`. It rejects unknown, duplicate, malformed, and out-of-range arguments before opening state. A state directory must be outside the repository, have an existing real local parent, and contain no linked path components. Resume requires the same fixture identity and the existing state files.

Optional integer limits are:

| Flag | Default | Allowed range |
| --- | ---: | ---: |
| `--max-ticks` | 3 | 1-20 |
| `--max-duration-ms` | 2,000 | 1-10,000 |
| `--cadence-ms` | 20 | 1-1,000 |
| `--adapter-timeout-ms` | 250 | 1-2,000 |
| `--drain-timeout-ms` | 250 | 1-2,000 |

The process writes one JSON result line and then exits. Exit `0` means the run and closure completed without a held result; exit `2` reports a held result, active owner, or incomplete bounded drain; exit `1` reports invalid input or another run error. The JSON reports fixture results, capital/status, close state, and stable error codes. Incomplete closure reports `resourcesClosed: false`; `ownerReleased` preserves the last acknowledged release result, even when later resource closure is uncertain. It does not claim that an uncooperative adapter stopped.

## Local state and recovery

The state directory contains `supervisor.sqlite` for the canonical supervisor envelope and `fixture.sqlite` for the fixture adapter's durable synthetic effects. SQLite uses DELETE journaling, FULL synchronous writes, and a zero busy timeout. The runner verifies the schema, identity, canonical state, checksums, row ownership, and file-size limits before using saved data. Keep both files together when resuming.

Only one owner may operate on a state directory at a time. A concurrent or unproven owner is reported as busy. Recovery of a recorded owner requires proof tied to that exact token and process ID; the public CLI does not infer that a process is stale and does not automatically replace an owner after an ambiguous interruption. A host power loss, universal stale-owner recovery, service availability, profitability, and 24-hour operation have not been qualified.

The generation counter is capped at 1,000,000. Fresh creation, resume, current owner work, and release reserve enough capacity for required accounting and closure transitions before mutating state or invoking the adapter. If the mandatory transitions cannot fit, the run fails with `generation_capacity_exhausted`; it does not reset or wrap the counter.

## Scope

All CLI fixtures and effects are local and synthetic. The supervisor does not read credentials or environment configuration, contact a network or RPC endpoint, inspect a wallet, submit an order or signature, connect to a market, or publish a result. Importing the modules and requesting help do not create supervisor or fixture state. The in-memory supervisor/store interfaces support deterministic tests; they do not turn the CLI into a live trading adapter.
