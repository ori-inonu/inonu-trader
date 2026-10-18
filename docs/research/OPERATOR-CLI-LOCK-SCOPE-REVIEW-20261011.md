# Independent operator CLI lock scope review

**Verdict: APPROVE the bounded L1–L6 scope.** Implementation, cycle start, merge and live qualification remain unapproved; the full central objective remains incomplete.

Reviewer: `01a12ada-91d7-7ce0-b6ea-e1556d234224`, distinct from implementer `01a12971-f941-7e42-8a42-fab6d44d4eb5`; no implementation authorship. Requested GPT-6.1 Sol/xhigh; effective model/effort/tier unknown. Ordinary isolated copy, no OS read-only sandbox. Probe baseline: `ff37327264d904242c57c21c8acb548a05651e82`; latest observed origin HEAD: `d113f5fe52f7d281ae0ad9be98d7f37fc253b916`. Reviewed sources unchanged.

Evidence copies: `operator-cli-lock-scope-fixture-20261011`. SHA256 verified against origin and isolated bytes:

| Artifact | Hash |
|---|---|
| Draft | `4530c955690b66823f5984b3b6f1e66be5837f4e5f088cbe68e696463edd337d` |
| Probe report | `33b6cc68d3f39459ef31a66975cbc7acff85893c8859de8432192ea12858ff74` |
| scripts/okx-operator.ts | `b7ccf4b784d87df3306e04da79eaae648f8db06abf60843d4e04322fd00103ef` |
| src/operator/ledger.ts | `3f56974ea89b86bbf0bea90061d0797463fc5deb1062f772d8cee9f536ee02ab` |
| src/operator/cycle.ts | `adcb20abbe449b458a1b69b80a9b9226e1919791b5ad8fa0b63de3cab644f3a2` |
| src/operator/config.ts | `1488d245dd30e449c8bdef7472651037ab3b68fd469ddde2f854362a2c4bc3e7` |
| Raw probe result.json | `72e4b75c0d73543f6e06159b34b2104175f6fa804fc60c0de0fbd72c8a2a772f` |

**Coverage and required implementation constraints:**

- **L1:** Genuine defect: initialization/reconciliation precede locking (CLI:128–144). Raw receipt confirms init exit0, ledger creation, occupied lock unchanged. Reconciliation lacks runtime evidence here; require its actual baseline RED.
- **L2:** Lock must precede execution's ledger read (CLI:94,128), covering snapshot through writes. Source ordering supplements offline tests, never live qualification.
- **L3:** Put all post-acquisition paths inside cleanup, including early returns/validation and model/gate construction currently outside try (CLI:144–158). Cover partial acquisition write/close failure (ledger:277–282); change primitive only upon demonstrated contract need. Failed acquisition must preserve another owner's bytes.
- **L4:** Test one-time initialization, corrupt-byte preservation, missing-ledger execution denial, and every unrelated reconciliation field. Preserve offline report-only missing-ledger behavior (CLI:101–106) and existing financial guards.
- **L5:** Recommend **common-all-filewriters within operator CLI**: synthetic runs persist state/journal (CLI:214; cycle:219–226). Cost: shared-path loops block other writers. Keep help/read-only consumers usable; document coherent file/lock configuration. Minimal-ledger-writers preserves offline concurrency but leaves stale snapshots and state/journal races. Common locking does not make two-file persistence transactional.
- **L6:** Require real subprocess RED/GREEN, validated temporary paths, explicit allowlist without inherited credential environment, `--no-env-file`, no live/Jev flags, providers or signers. Raw receipt lacks argv/environment capture; the report alone attests those details.

CONTRIBUTING reviewed; CLI/test/docs scope is proportionate. No additional actionable heuristic smell identified. No tests, implementation or external operations performed. Prior reports and source bytes preserved.
