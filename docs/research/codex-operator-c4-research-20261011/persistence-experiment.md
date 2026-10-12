# Independent Windows persistence experiment — 2026-10-11

Fact: retaining a reader reproduced EPERM in both runtimes; synchronous readers closed before rename did not reproduce it. The original incident's cause remains unconfirmed. Full-goal scope and M1–M4 remain unchanged. This research authorizes no implementation or acceptance weakening. Desired GPT6.1Sol/xhigh; effective model/effort/tier unknown. Conversation: `01a12adc-473d-7381-b067-c83af7ccda31`.

Source snapshots, SHA256:

| Source | Hash |
|---|---|
| [Coordinator ledger.ts:229](../inonu-system-one-review-spec-20261011/src/operator/ledger.ts) | `e1e6db9de5de1305e6d129387acd34b867b4b3df8d9d31eff168b3898bd21a7a` |
| [Avicenna persistence-diagnosis.md:11–22](../inonu-system-one-review-spec-20261011/persistence-diagnosis.md) | `d12b5dc7535e953d5269911c9bbf282c199ce9a87e5920bf0741f9cc79a7109f` |

Literal ledger:235–236 evidence: `writeFileSync(tmp, JSON.stringify(state, null, 2));` then `renameSync(tmp, path);`. Line234 uses `${path}.${process.pid}.tmp`; no retry. Avicenna:13 reports no retained descriptor in the original failing path; :20 proposes bounded retry, not approval. Its historical log and candidate tests were not rerun here.

Observed runtimes: Node **v26.9.0** (`C:/Program Files/nodejs/node.exe`), Bun **1.3.14** (`C:/Users/gabri/.bun/bin/bun.exe`); Windows NT **10.0.26300.0**, win32/x64. Complete component versions are in raw JSON. Runs: 13:42:18.996–13:42:20.592 UTC; release controls: 13:43:57.821–13:43:58.024 UTC.

Synthetic JSON only, fresh exclusive fixtures, same-directory PID temporary. `writeFileSync` completes/closes before rename. Closed-reader: `openSync(r)`/`readSync`/`closeSync` before write+rename. Open-reader: retain descriptor through rename and verification, close in `finally`. Each reader case opened/closed 100/100; zero unclosed handles. No retained reader in baseline.

| Case | Node success/failure | Bun success/failure |
|---|---:|---:|
| Simple replacement, 100 iterations | 100/0 | 100/0 |
| Closed reader, 100 iterations | 100/0 | 100/0 |
| Deliberately open reader, 100 iterations | 0/100 | 0/100 |
| Nonempty directory destination, 1 iteration | 0/1 expected | 0/1 expected |

All failures: syscall `rename`, code `EPERM`, message prefix `EPERM: operation not permitted, rename`; errno **−4048 Node**, **−1 Bun**. Exact paths/messages for every failure remain in `persistence-results/{node,bun}-{scenario}.stdout.json`. All eight initial cases had zero invariant failures: complete previous destination and temporary survived failure; successful replacement was complete; directory and sentinel survived intentional rejection. Open-reader exit1 records observed failures; other cases exit0.

Release control, one iteration/two attempts per runtime: held-reader rename failed; close reader; rename **same temporary** succeeded. Previous/temporary bytes survived before close, replacement was complete afterward; opened/closed 1/1, exit0.

Limits: maximum 100 iterations/case; 25s internal deadline checked between iterations, 28s external watchdog. No timeout; longest process 251.9319ms. Sequential child processes had cleared environments, literal SystemRoot and exclusive TEMP/TMP; Bun used `--no-env-file`. Isolation is path guards/exclusive copy, **not an OS sandbox or separate host**. No credentials/env/home inspection, network/providers, transactions, candidate/SPEC edits, or private-state copying. No crash/durability, concurrent observer, ACL, reparse, antivirus, or original-suite tracing; atomic visibility and fsync durability are not certified. EPERM alone cannot distinguish held-reader failure from directory rejection.

Advice, unapproved: if a retained application handle is identified, correct its close lifecycle; otherwise evaluate bounded Windows rename-only retry separately. Preserve complete same-directory temporary, never unlink/truncate destination; directory/reparse rejection and exhausted errors must remain failures. EBUSY/EACCES were not observed. Future independent acceptance should require TDD red/green evidence for release-then-success, permanent failure, directory rejection, preserved previous bytes, unchanged STOP/expiry/reconciliation and no extra sends, followed by separate review. Timing limits must respect existing execution gates; no retry policy is established here.

Exact experiment-script SHA256:

| Script | Hash |
|---|---|
| [persistence-probe.mjs](persistence-probe.mjs) | `ea18656a1db57bc5fadd4dfc30da72d21ed64caff57130456eb2c86dc4470e83` |
| [persistence-runner.ps1](persistence-runner.ps1) | `5203b8bcddf8532c4f006dcb321ec82ef14811891f25e5afea5f2e0bd9f5696d` |
| [persistence-release-probe.mjs](persistence-release-probe.mjs) | `368ae6d2339e5781500664abe582d0d599b43ecb4011955d255273446f1a90d4` |
| [persistence-release-runner.ps1](persistence-release-runner.ps1) | `6b347dbb7744bfe1f810f6751919fbd32fc6a2835362cae0927d591e6b948e4d` |

Retained artifacts: `persistence-fixtures/`, ten stdout JSONs and empty stderr files. [Initial manifest](persistence-results/run-manifest.json) SHA256 `0c0c527d1bf27a9efcdd87abcbff44026b87d91fd4f692fb49191e7c48780afa`; [release manifest](persistence-results/release-manifest.json) SHA256 `471cc815caf99ea1978244d3a71338ec1c99b53684abd4214cad6b9d45e869e3`.

Prior [C4 report](c4-research.md) unchanged: `531288ed77dfcfcd5a88ccdf235d782894b8d84236b251b4d9897830e81a1a98`; all five preexisting source/report hashes also match their prior snapshot. Own copy has no Git metadata; supplied baseline `4fe00c9` is not independently established by HEAD.
