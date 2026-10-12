# Operator CLI lock investigation

Conversation: 01a12971-f941-7e42-8a42-fab6d44d4eb5. Baseline: ff37327264d904242c57c21c8acb548a05651e82. This is research evidence, not permission for live execution or a completed fix.

## Confirmed observation

An isolated subprocess ran `bun --no-env-file scripts/okx-operator.ts --init-ledger` with an allowlisted environment, temporary operator paths, no live/Jev flags, and a 10-second timeout. The configured lock already contained `held-by-independent-probe\n`. The subprocess exited 0, created the ledger and left the occupied lock unchanged.

Result file: `C:/Users/gabri/AppData/Local/Temp/inonu-lock-probe-NrOJaX/result.json`. SHA256: `72e4b75c0d73543f6e06159b34b2104175f6fa804fc60c0de0fbd72c8a2a772f`.

Observed fields: exit=0; ledgerCreated=true; lockUnchanged=true; stderr empty. Created ledger SHA256: `397dc4e5e67edff6ce0191bea1fbed6e22e0a6e90aa759c34c0d7347821af600`. Exact stdout: `ledger criado em C:\Users\gabri\AppData\Local\Temp\inonu-lock-probe-NrOJaX\ledger.json` followed by a newline.

The probe did not access production state, use provider credentials, sign transactions or send orders. This proves initialization can write while the configured lock is occupied; it does not prove financial loss.

## Source explanation

`scripts/okx-operator.ts` SHA256 `b7ccf4b784d87df3306e04da79eaae648f8db06abf60843d4e04322fd00103ef`: `openLedger` is called before `acquireLock`; the initialization-only and reconciliation branches return before lock acquisition. Lock acquisition applies only to the later live branch. Existing ledger contents are also loaded before the live lock is acquired.

`src/operator/ledger.ts` SHA256 `3f56974ea89b86bbf0bea90061d0797463fc5deb1062f772d8cee9f536ee02ab`: the lock uses exclusive file creation. This investigation does not propose bypassing or deleting occupied locks.

## Remaining verification and next eligible work

Define a separately reviewed SDD cycle covering initialization, reconciliation and live ledger loading under mutual exclusion; add subprocess regression tests before implementation. Verify lock release on successful early returns and exceptions, and preservation of another owner's lock and ledger on rejection. Reconciliation under an occupied lock has not yet been exercised. The second-leg amount/quote consistency concern is separate and remains unconfirmed.

## Recovery and review status

On 2026-10-11 the prior turn was classified as no engineering progress (goal text only). Fresh recovery verified this result and current sources. Jev consultation `50c576df-a668-4b1c-90a9-464146fb86fe` selected `recover_evidence` (jev-1.13.0, confidence 1; input 671/output 51 tokens; billed cost unknown).

The existing UI reviewer returned a limited PASS with independent tests and explicit browser/build evidence limitations. Main is at 16eb1ed with overlapping copy changes; no merge is approved by that candidate review. Continue UI audit and reconcile current main before integration. The full operational goal remains active and incomplete.
