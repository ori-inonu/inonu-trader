# Public market capture

This module records a finite public Exchange observation experiment for INONU TRADER. It keeps application payloads and local reception evidence, checks documented sequence links, and reads partial captures without modifying them. It does not reconstruct a book, estimate fills, qualify a strategy or establish profit.

## Current runtime status

Execution is offline by default. The supplied raw Node HTTPS/WebSocket adapter reports `runtime_capability_unqualified` and refuses capture before directory creation, DNS or socket creation. Its installed runtime and TLS held-buffer allocation, physical I/O cancellation and shared deadline enforcement have not been qualified. There is no flag, receipt field or environment setting that enables it. A future qualification requires independent evidence and source review.

Tests use an explicitly synthetic external transport and clock with real temporary filesystem persistence. Those tests do not establish current endpoint access, regional permission, live transport bounds, data authenticity or a successful market experiment. Public data licenses and redistribution rights remain unknown.

## Offline commands

Run from the project root with the installed Bun runtime and environment file loading disabled:

```powershell
bun --no-env-file scripts/public-market-capture.ts
bun --no-env-file scripts/public-market-capture.ts --offline
bun --no-env-file scripts/public-market-capture.ts --help
bun --no-env-file scripts/public-market-capture.ts --inspect C:/captures/example
```

Default and `--offline` return a JSON `not_started` report with `stopReason: "offline"`, no experiment clock, zero attempted operations and no output directory. `--inspect` is read-only: it checks hashes, offsets, counts, identities and limits, salvages complete raw records where possible, and labels incomplete tails untrusted. It never repairs or resumes a capture. Inspection exits 2 when integrity errors or an untrusted tail are present; valid persistence can still have `failed_incomplete` because final timing remains unobserved on disk.

The explicit capture command accepts two local JSON files, each at most 64 KiB, with no unknown command-line flags:

```powershell
bun --no-env-file scripts/public-market-capture.ts --capture --plan C:/capture-input/plan.json --access C:/capture-input/access.json
```

This command currently refuses because the supplied runtime is unqualified. A capture refusal or incomplete failure exits 2. Plan or receipt contents cannot override the adapter gate. The CLI reads no credentials or environment secrets.

## Plan and preflight

`preflightCapture(plan, access, runtime, wallNow)` is a pure validation seam. It performs no filesystem lookup or network activity. The plan has exactly these fields:

| Field | Required value |
| --- | --- |
| `version`, `mode` | `1`, `"capture"` |
| `experimentId` | New identifier, 1–80 letters, digits, `_` or `-`; begins with a letter or digit |
| `parentExperimentId` | `null` or another valid identifier, different from this experiment |
| `outputRoot` | Explicit absolute existing directory; no symlink/reparse escape |
| `schema`, `region` | `"okx-public-v5-2026-10-10"`, `"global"` |
| `endpoints` | Exactly `rest: "https://www.okx.com"` and `websocket: "wss://ws.okx.com:8443/ws/v5/public"` |
| `instruments` | One or two explicit `{id, kind}` entries; at most one `SPOT` and one `SWAP` |
| `streams` | `{channel, instrument}` entries; one `books` stream for each instrument, optionally one `funding-rate` for the `SWAP` |
| `limits` | All fields below, each a positive safe integer at or below its ceiling |

| Limit | Ceiling |
| --- | ---: |
| `durationMs` | 300,000 |
| `messages` | 10,000 |
| `payloadBytes` | 1,048,576 |
| `persistedBytes` | 33,554,432 |
| `controlBytes` | 2,097,152 |
| `segments` | 32 |
| `connections` | 3 |
| `metadataRequests` | 3 |
| `attemptMs` | 10,000 |
| `ingressBytes` | 8,388,608 |
| `pending` | 16 |

`controlBytes` must be smaller than `persistedBytes`; the full configured control allowance is reserved from application storage. Base64, JSON and manifest/control bytes count toward persisted limits. Instrument count cannot exceed metadata request count. Duplicate identities, extra fields, nonfinite values and unsupported streams reject before creation or egress. Endpoint constants are pins, not evidence that access is permitted or available.

An access receipt has exactly `version`, `id`, `evidence`, `issuedAt`, `expiresAt`, `schema`, `region`, `endpoints`, `terms`, `regionAssessment`, and `authority`. It must be current at preflight, pin both endpoints and the schema/region, and identify explicit authority provenance. Its `evidence` is `factual` for a qualified runtime or `synthetic` for synthetic verification. `terms` and `regionAssessment` require factual qualification; filling in the word `qualified` does not create that evidence. Technical advice cannot supply factual access or human authority. No example factual receipt is provided.

Runtime capabilities must explicitly establish incremental encoded and decoded limits, aggregate held-buffer accounting, interruption and shared deadlines. Synthetic capability declarations only pair with synthetic access evidence. The supplied actual adapter declares these capabilities unknown or unsupported and is refused.

## Library seams

The separate `src/public-market-capture` namespace exports:

- `preflightCapture`: validates the finite plan and gates.
- `runCapture(plan, dependencies)`: runs one experiment with external transport/clock seams and optional cancellation signal.
- `readCapture(directory)`: checks local persistence without writing.
- `BoundedIngress` and `IngressBudget`: incrementally parse identity HTTP bodies and raw RFC 6455 frames with shared byte/unit accounting.

The transport supplies initial metadata and a connection with an interruptible signal, complete application/control events, and a closed promise. Raw callback fixtures cannot qualify a real transport. The protocol adapter offers no arbitrary URL, redirect following, proxy, authenticated headers, private route or automatic metadata refresh. HTTP nonidentity content encoding and WebSocket compression are refused before decoded allocation. No decompression is implemented.

## Evidence and continuity

Each retained application record stores the received bytes as base64, byte length, SHA-256, encoding label, source and identities. A string callback is `runtime_text_utf8`; binary application bytes are `application_binary`. These are application bytes at the runtime callback boundary. Compressed wire bytes and physical arrival are not measured.

The runner owns a copy of admitted callback bytes and identity before deferred decoding. A transport may reuse its original mutable buffer after the callback returns; that reuse cannot change the retained raw record or its admission decision. The source buffer, owned copy and base64 representation share ingress admission before allocation, and their reservation is released when the record drains or fails.

Wall Unix milliseconds, exact monotonic nanoseconds, increasing arrival ordinal, process/session/connection identities and clock sample identity are recorded before payload decoding. Provider event and funding times remain separate exact strings. Unknown clock offset and uncertainty are `null`; global publication/availability is unknown. Wall regression closes a physical evidence segment and quarantines later observations. Invalid/backward monotonic time stops the experiment. No ordering between process clocks is inferred.

Protocol ping, pong and close callbacks participate in wall-regression checks. Their boundary is applied after previously admitted raw callbacks and before subsequent observations, including when raw decoding is deferred. A terminal regressing control closes the prior interval even without a later application callback. Earlier reception records are never reordered or assigned the later clock sample.

Book admission requires an exact subscription acknowledgement, current initial metadata and a fresh snapshot with `prevSeqId=-1`. Linked updates, downward resets, immediate byte-identical repeats and empty linked heartbeats retain explicit diagnostics. A reset begins a new sequence epoch. Duplicate state never crosses connection, segment or epoch boundaries. Wrong predecessors, conflicting sequence content, malformed integers and unsolicited snapshots quarantine the stream until a fresh connection and snapshot. Reconnects always declare a gap. Checksums fixed at zero do not qualify book integrity. No price-level reducer, order, fill or account query exists here.

Metadata records retain raw content/hash, retrieval interval, instrument units and an exact receipt link. Historical effective time remains unknown. Missing, changed or unexpectedly refreshed metadata closes qualification. Funding prediction, settlement state and realized-rate interpretation are separate; interval is derived from exact source times, never fixed to eight hours. Entitlement, fees, margin, liquidation and account credit remain unknown.

Funding data accepts only the pinned `instId`, `fundingRate`, `fundingTime`, `nextFundingTime`, `settState`, `settFundingRate` and `ts` fields, with exact nonnegative event time and all required fields present. Its envelope cannot borrow the book `action` field. Unknown data extensions retain their raw evidence, mark the affected instrument's metadata qualification unknown and close its prior segment; no metadata refresh is issued. Synthetic unknown-field regressions are not claims about current provider messages.

## Limits, cancellation and persistence

One monotonic clock starts immediately before experiment directory creation. Setup, requests, connections, retries, writes, finalization and shutdown share its deadline. Attempts are bounded by the earlier of their own limit and the global deadline. Only connection I/O and connect attempt timeout can retry, with interruptible 1-second and 2-second waits, at most three attempts. Authority/schema/access/refusal/throttling/storage failures do not retry.

HTTP bodies, WebSocket frames and assembled application messages are limited incrementally to the configured payload size. Assemblies, queued ready payloads, preparation buffers and protocol control buffers share the 8 MiB/16-unit ceiling. This accounting does not bound general runtime, TLS, OS or total heap memory. Oversized or incomplete input produces bounded size evidence tagged `observed_complete`, `observed_lower_bound` or `source_declared`; an incomplete assembly has no invented complete callback time or complete payload hash.

Cancellation aborts requests, connects, waits and streams and rejects new payloads. Queue drain and finalization may use only the earlier of cancellation plus five seconds and the original global deadline. No new I/O starts with zero time. An observed overshoot is `failed_incomplete` with the actual duration. Physical cancellation of already issued OS I/O is not claimed.

The store creates a new target exclusively, appends segment/control files, and writes a versioned manifest exclusively after segment verification. It preserves existing captures. Records have encoded offsets/lengths/hashes; finalized segments have byte hashes, counts, ranges, source/clock identities and termination evidence. Recovery enforces bounds and verifies complete records before accepting them. Hashes establish local integrity, not provider authenticity. There is no fsync or power-loss qualification.

Each finalized segment records `checkedObservations`, `rejectedObservations` and a conservative `continuityStatus`. A mixed segment is `contains_rejected_observations`; otherwise a checked book/funding observation yields `contains_checked_observations`, or `no_continuity_observation` when none exists. Acknowledgements and metadata alone do not count as checked continuity observations. Recovery recomputes these fields and the segment's sources from verified raw records. These local counts do not qualify the whole physical segment or upgrade its final timing.

Disk final timing is explicitly `unobserved`: the manifest cannot observe completion of its own final write. Its outcome stays `failed_incomplete`, with a separate `provisionalOutcome`. The running process can return actual post-write timing and a stronger runtime outcome after finalization, timed readback and checks. A later `readCapture` does not upgrade provisional timing to checked continuity. No post-deadline invalidation write is attempted.

## Counters and outcomes

`completeReceived` counts complete application callbacks, including acknowledgement/error envelopes and malformed content. WebSocket protocol control frames and collector control records are counted separately. `accepted` and `rejected` partition those callbacks; rejected raw payloads can still be persisted. `persistedRaw` includes only raw records verified in finalized segments, not successful appends awaiting finalization.

For known terminal counts:

```text
completeReceived = accepted + rejected = rawPrepared + completeRejectedWithoutRaw
rawPrepared = persistedRaw + unpersistedRaw
dropped = unpersistedRaw + completeRejectedWithoutRaw + incompleteTransportAssemblies
completeReceived + incompleteTransportAssemblies = persistedRaw + dropped
```

Unknown crash counts stay `null` in recovery; no conservation claim uses unknown values. Outcome precedence is `not_started` before creation; then `failed_incomplete` for persistence/integrity/deadline failure, missing required evidence, unpersisted raw or no complete persisted payload; then `captured_with_gaps` for retained evidence with missing acknowledgement/observation/snapshot/metadata, rejected input, quarantine, reconnect or clock ambiguity; otherwise `captured_with_checked_continuity` for the observed local interval. Clean cancellation can qualify only its actual recorded interval.

Every runtime report keeps `strategyQualified`, `executionQualified` and `profitEvidence` false. A checked sequence link, funding rate, hash or synthetic run cannot establish executable profit, a 24-hour result, ROI or compounding.
