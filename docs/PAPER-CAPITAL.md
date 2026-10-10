# Paper capital accounting

`PaperCapital` is a synchronous, in-memory accounting state machine for synthetic paper activity. It tracks one fixed asset and venue per instance. It does not connect to a wallet, exchange, market feed, signer, or order route. The emitted mode and authorization fields are fixed to `synthetic-paper`, `strategyQualified: false`, and `financiallyAuthorized: false`.

## API

The module exports `PaperCapital`, `PaperAsset`, `PaperCapitalConfig`, `PaperPlan`, `PaperReceipt`, `PaperSnapshot`, and `PaperCheckpoint` types.

- `new PaperCapital(config)` creates an account with a fixed asset, initial cash, maximum active commitment, and maximum cash drawdown.
- `reserve(plan)` holds the plan's principal plus its cost budget against available cash and the account commitment cap.
- `start(planId)` moves a reserved plan to inflight.
- `cancel(planId)` releases a reserved plan. It cannot cancel an inflight plan.
- `settle(receipt)` applies a complete receipt for an inflight plan exactly once.
- `snapshot()` returns detached accounting and plan state.
- `checkpoint()` returns detached configuration and journal data with a SHA-256 integrity checksum.
- `PaperCapital.restore(checkpoint)` validates and semantically replays a checkpoint. Every restored inflight plan requires a complete receipt before new work can be reserved or started.

IDs must be nonempty trimmed strings. Records must have exactly the documented fields and use plain data properties. Invalid, unknown-cost, conflicting, or unfunded receipts fail closed. A rejected call does not consume a successful receipt ID. The first stop reason remains latched; existing inflight work may still be reconciled while stopped.

## Atomic amounts and cost responsibility

Every money amount is a canonical integer string in the asset's atomic units: unsigned values use `0` or a nonzero digit followed by digits; realized net may also be a canonical signed integer. Arithmetic uses `bigint`. No monetary value is converted to `Number`.

`PaperAsset` identifies the capital asset with `chainId`, `token`, `decimals`, and `venue`; all four fields must match for a receipt to settle. The caller supplies `returnedAtoms` in that same asset. It must already include route-embedded fees and taxes. `externalCostAtoms` is only for additional known costs, converted by the caller into the account's exact capital asset under a separately qualified conversion rule. This module performs no currency conversion and makes no peg assumptions. Unknown or incomplete cost data blocks settlement and stops new work.

For a completed receipt, balance changes by `returnedAtoms - inputAtoms - externalCostAtoms`. For a reverted receipt, principal must be fully returned (`returnedAtoms === inputAtoms`); known external cost is still deducted. A receipt that would produce negative cash is rejected atomically, preserving its reservation for a corrected receipt.

## Accounting example

With synthetic starting cash of `1000` atoms, reserve and start a plan with `inputAtoms: "100"` and `costBudgetAtoms: "5"`. After a complete receipt with `returnedAtoms: "140"` and `externalCostAtoms: "5"`, the account balance is `1035` atoms and realized net is `35` atoms. The plan's commitment is released only when the receipt settles, so later reservations can use the settled cash subject to the fixed caps.

## Limits and recovery

Available cash is `max(balance - committed, 0)`; deficit is `max(committed - balance, 0)`. Commitments include each reserved or inflight plan's principal plus budget. A successful known settlement is booked before risk checks: cost over budget, cash drawdown at or above the configured maximum, or a resulting reservation deficit latches a stop while retaining other commitments. The stop never clears through this API.

Drawdown is cash-only, measured from the highest settled cash balance. Open or projected results do not change balance, realized net, peak, or drawdown. The maximum commitment and drawdown amounts are fixed at construction and do not scale with gains.

Checkpoints contain successful reserve/start/cancel/settle operations and any standalone first stop caused by a rejected call. The checksum detects accidental alteration; it is not authentication. Restore replays and validates the journal rather than trusting stored derived balances. A restored inflight plan remains committed and sets `recoveryRequired` until every such plan has been settled with a complete receipt. Reserved-only plans do not require outcome reconciliation. The checkpoint is inert data, not a durable executor.

## Scope boundary

This accounting seam does not simulate market fills, qualify opportunities, establish strategy or live-route qualification, provide backtest or profit evidence, or run continuously. It does not authorize financial activity. Those capabilities and any financial authority remain outside this module.
