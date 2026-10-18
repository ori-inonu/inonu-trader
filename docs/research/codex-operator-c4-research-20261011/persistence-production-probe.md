# Independent production persistence probe — P4

Observed Windows run, 2026-10-11: **eight recovery cases reproduced real held-reader EPERM and recovered complete replacement after external release during default synchronous retry**. Two intentionally late-release controls exhausted four attempts and preserved previous bytes. This is bounded fixture evidence, not implementation approval or an original-incident diagnosis.

## Authority and isolation

Only new probe code, raw logs and this report were written in `C:/Users/gabri/.codex/worktrees/inonu-operator-c4-research-20261011`. The candidate and all 49 prior files remained unchanged. Current conversation identity was retained; no borrowed conversation state, new native goal, agent spawn, or change to full central JEV scope/M1–M4 occurred. Requested GPT-6.1 Sol/xhigh; effective model/effort/tier unknown. Advice is not authority; no JEV payload was transmitted. No coordinator/reviewer edits, credential/.env/home inspection, installation, provider/network call, financial action or transaction occurred.

Isolation is explicit path discipline on an unrestricted Windows filesystem, not an enforced sandbox. This ordinary copy has no independently observed Git HEAD; supplied baseline `4fe00c9` is not certified. “Production” means the user-supplied copy: comparison against another checkout was outside this assignment.

## Frozen acceptance and exact source

Literal P4: “external worker/process holds read handle open on unique temporary ledger; prove rename EPERM while held, release from external worker during default synchronous retry, production helper recovers same complete replacement.” Previous bytes must survive the hold; public read follows success; no same-event-loop release timer; inability to reproduce release within 70 ms must be disclosed.

[ledgerFilePersister](C:/Users/gabri/.codex/worktrees/inonu-operator-c4-research-20261011/ledger-persistence-candidate.ts:237) defaults to native rename/lstat. [Wait](C:/Users/gabri/.codex/worktrees/inonu-operator-c4-research-20261011/ledger-persistence-candidate.ts:242) is `Atomics.wait(..., milliseconds)`; [retry gate](C:/Users/gabri/.codex/worktrees/inonu-operator-c4-research-20261011/ledger-persistence-candidate.ts:264) permits Windows EPERM/EBUSY/EACCES, stops at `attempt >= 3`, then waits `10 * 2 ** attempt` (line 265): four attempts, nominal 10/20/40 ms waits. Directory/symlink rejection remains EINVAL at line 251; that separate gate was not retested here.

| Source | Bytes | SHA-256 |
|---|---:|---|
| [ledger-persistence-candidate.ts](C:/Users/gabri/.codex/worktrees/inonu-operator-c4-research-20261011/ledger-persistence-candidate.ts) | 14721 | `3f56974ea89b86bbf0bea90061d0797463fc5deb1062f772d8cee9f536ee02ab` |
| [persistence-production-probe.mjs](C:/Users/gabri/.codex/worktrees/inonu-operator-c4-research-20261011/persistence-production-probe.mjs) | 11053 | `f55d0b4e8e8a6e633bbe27b4b2e189e9a02d8968aaceb5d2a8fb415e501eb7cb` |
| [persistence-production-worker.ps1](C:/Users/gabri/.codex/worktrees/inonu-operator-c4-research-20261011/persistence-production-worker.ps1) | 3045 | `dd3cae221abb6ad4acdb3899f7c41e509d779d8a101a382ab196fd098f7fc92e` |
| [persistence-production-runner.ps1](C:/Users/gabri/.codex/worktrees/inonu-operator-c4-research-20261011/persistence-production-runner.ps1) | 3267 | `68f89e0b6958feff9c90b41b07397a0c41b3803a5e3352474bb8f945dfa0e577` |

Candidate hash matched before import, after each runtime and at preservation verification. No candidate/SPEC changes.

## Method and close discipline

[External PowerShell worker](C:/Users/gabri/.codex/worktrees/inonu-operator-c4-research-20261011/persistence-production-worker.ps1:32) opens `FileStream(Open, Read, FileShare.Read)`, deliberately omitting write/delete sharing. It reports ready/PID/old hash before the parent starts. It independently polls a unique marker (1 ms sleep, 2 s bound), requests 15/40/120 ms sleep, reads/hashes previous bytes through its still-open handle, then explicitly Dispose()s it. UTC timestamps bracket Dispose; its Stopwatch records signal-to-close. A finally block closes on error. All ten workers exited 0; no parent-event-loop timer releases the handle.

Three cases/runtime observe the existing public `options.rename` seam ([native observer](C:/Users/gabri/.codex/worktrees/inonu-operator-c4-research-20261011/persistence-production-probe.mjs:94)): call real renameSync, retain native error, check destination and staged bytes, signal external release on first failure. No injected errno; default platform, lstat and **default wait remain untouched**. A fourth case calls `ledgerFilePersister(ledger)(next)` with **no options**, after real preflight EPERM. Its internal attempts are unobserved. Fifth case deliberately releases late.

Initial state is emptyLedger(); replacement changes only a synthetic executed-key label. [Public readLedgerFile](C:/Users/gabri/.codex/worktrees/inonu-operator-c4-research-20261011/ledger-persistence-candidate.ts:210) and exact byte equality verify the complete replacement. No financial-recording/execution function runs. Every observed failed rename retains identical staged replacement hash and previous destination. Common old-byte SHA-256: `397dc4e5e67edff6ce0191bea1fbed6e22e0a6e90aa759c34c0d7347821af600`.

## Observations

Node **v26.9.0**, `C:/Program Files/nodejs/node.exe`; Bun **1.3.14**, `C:/Users/gabri/.bun/bin/bun.exe` (Node compatibility v24.3.0). Worker Windows PowerShell **5.1.26100.9444**; runner PowerShell **7.6.5**; OS **Microsoft Windows NT 10.0.26300.0**. Five cases/runtime; elapsed Node **4838.2913 ms**, Bun **4156.3319 ms**, exit 0 each. Separate 28000 ms watchdogs did not fire. Child environments were cleared, then given literal SystemRoot plus unique own TEMP/TMP; Bun used --no-env-file.

Native failures: **EPERM, syscall rename; Node errno -4048, Bun errno -1**. Each runtime recorded 11 observed failures plus one preflight failure. Exact messages, paths, stacks and timestamps remain in raw JSON.

Milliseconds below: close/call = post-Dispose worker UTC minus call-start UTC; close/signal uses marker-creation UTC. Call duration is parent monotonic time.

| Runtime | Case | Requested sleep | Close/call | Close/signal | Call duration | Native sequence | Outcome |
|---|---|---:|---:|---:|---:|---|---|
| node | observed-1 | 15 | 60 | 57 | 104.5715 | EPERM → EPERM → EPERM → OK | complete replacement / read ready |
| node | observed-2 | 15 | 32 | 30 | 61.2176 | EPERM → EPERM → OK | complete replacement / read ready |
| node | observed-3 | 15 | 46 | 44 | 74.0451 | EPERM → EPERM → OK | complete replacement / read ready |
| node | default-1 | 40 | 55 | 57 | 102.0672 | EPERM preflight; internals unobserved | complete replacement / read ready |
| node | late-1 | 120 | 144 | 140 | 94.4266 | EPERM → EPERM → EPERM → EPERM | throws; old + staged bytes intact |
| bun | observed-1 | 15 | 42 | 36 | 65.8965 | EPERM → EPERM → OK | complete replacement / read ready |
| bun | observed-2 | 15 | 48 | 46 | 101.8632 | EPERM → EPERM → EPERM → OK | complete replacement / read ready |
| bun | observed-3 | 15 | 35 | 33 | 58.9899 | EPERM → EPERM → OK | complete replacement / read ready |
| bun | default-1 | 40 | 38 | 60 | 91.7419 | EPERM preflight; internals unobserved | complete replacement / read ready |
| bun | late-1 | 120 | 132 | 129 | 108.7625 | EPERM → EPERM → EPERM → EPERM | throws; old + staged bytes intact |

All eight recovery releases occurred inside the call, **32–60 ms after call start**. Old bytes remained intact through the held handle; destination became the exact complete replacement; production tmp disappeared; public read returned ready/full expected state. All six observed recovery cases preserved the identical staged hash on every failure. Fully default controls establish preflight denial and unmodified-helper recovery; they do not trace every internal production attempt.

Late controls threw EPERM after four attempts, retaining old destination and complete staged tmp at return. Public read returned the old empty state. Worker release followed return: Node 144 ms, Bun 132 ms after call start. These intentional negative outcomes are not counted as recovery successes. No startup/probe failure or timeout occurred. The result facts were recomputed from raw fields, separately from the probe's own p4Evidence booleans; this is evidence checking, not independent implementation approval.

Timing anomaly preserved: Bun observed-2 attempt 3 began at epoch UTC ms **1791728582335** and failed EPERM despite worker post-Dispose timestamp **1791728582330** (5 ms earlier); attempt 4 succeeded. No handle-visibility/clock cause or antivirus attribution can be inferred from these timestamps.

## Exact logs and cleanup

[Run manifest](C:/Users/gabri/.codex/worktrees/inonu-operator-c4-research-20261011/persistence-production-raw-23f9afac193f4c45a208ea223c067e7c/run-manifest.json): SHA-256 `bba09112228c672cd5d19482fab960807e21d4f73963980adf6e5f0c7f05559c`. Contains exact command arguments, execution boundaries, source/stdout/stderr hashes. Entry point: [runner](C:/Users/gabri/.codex/worktrees/inonu-operator-c4-research-20261011/persistence-production-runner.ps1), launched with installed pwsh and -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File.

- [node exact stdout](C:/Users/gabri/.codex/worktrees/inonu-operator-c4-research-20261011/persistence-production-raw-23f9afac193f4c45a208ea223c067e7c/node.stdout.json): SHA-256 `5d575ae4e415da03d9fe9ea3aa3ced5b27209a8e5780d821aac49f4e535dad2d`.
- [node stderr](C:/Users/gabri/.codex/worktrees/inonu-operator-c4-research-20261011/persistence-production-raw-23f9afac193f4c45a208ea223c067e7c/node.stderr.txt): 0 bytes; SHA-256 `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`.
- [bun exact stdout](C:/Users/gabri/.codex/worktrees/inonu-operator-c4-research-20261011/persistence-production-raw-23f9afac193f4c45a208ea223c067e7c/bun.stdout.json): SHA-256 `f92a295ad19374761344dc5c64b7d7d9aa923456bb0f36095b1ba896512fe724`.
- [bun stderr](C:/Users/gabri/.codex/worktrees/inonu-operator-c4-research-20261011/persistence-production-raw-23f9afac193f4c45a208ea223c067e7c/bun.stderr.txt): 0 bytes; SHA-256 `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`.

Per-case worker stdout/stderr and case-result.json remain under `C:\Users\gabri\.codex\worktrees\inonu-operator-c4-research-20261011\persistence-production-node-wEnobt` and `C:\Users\gabri\.codex\worktrees\inonu-operator-c4-research-20261011\persistence-production-bun-IFPEmL` in each case-* directory; each batch retains runtime-result.json. **37** raw/derived files retained. Worker logs retain readiness/release PID, hashes, sharing flags and timestamps; all stderr files are empty. Main stdout hashes cover complete attempt/error/state/cleanup evidence.

[Cleanup](C:/Users/gabri/.codex/worktrees/inonu-operator-c4-research-20261011/persistence-production-probe.mjs:30) runs after worker exit and verifies canonical containment plus ordinary-file/non-symlink status before unlinking only the five exact known targets (ledger, production tmp, preflight tmp, go, done). No recursive deletion. Cleanup logs retain pre-delete hashes, including failed-control staged tmp. Final enumeration found **zero ledger/marker/tmp targets**. All **49 pre-existing file hashes and lengths matched**, including C4, previous experiments, terminal coverage report and candidate.

## Limits and advisory use

Real release within 70 ms was reproduced repeatedly. This does **not** establish a 70 ms return deadline: recovery calls ranged **58.9899–104.5715 ms**. Scheduling, nominal wait granularity, cross-process UTC resolution and instrumentation limit timing conclusions. Eight recoveries do not establish broad reliability/performance. Crash/power-loss durability, every share mode, live operator behavior and other frozen gates remain outside this probe. Finite old/complete-byte checks plus inspected native rename support this fixture's replacement behavior, not every interleaving.

An independent reviewer may evaluate these exact hashes/cases against unchanged acceptance. No remedy, merge authorization, implementation review approval, incident root cause or whole-goal completion is claimed. This is runtime evidence against frozen acceptance; no production implementation or fabricated TDD red/green cycle was performed.

