# INONU TRADER: future profile-4 replay specification

Status: proposed/unfrozen, pending real delegated Choice and independent design review. This is a separate future version; original profile-3 criteria and failure evidence are unchanged.

## Objective and scope

Provide a deterministic offline memory replay suitable for later reproducible backtest work, preserving verified capture facts under a proven finite output limit. Correct acceptance of the observed capture producer and correct diagnostic disposition are required. This slice cannot establish authentic data compatibility, economics, trading permission, profitability or 24-hour operation.

Normative base: `inputs/old/contract/SPEC.md` SHA-256 44badcc7645af46cbddbeda37e8b4a70caa5e43d53c11493bff1e8c689fda92c and `inputs/old/contract/SCHEMA.md` SHA-256 e8cb9e46e084b65c8e2baeb1f02adb30888bc4698c2ae6132a0a2bb121adba6c. Those fixed R01-R12/S01-S08 contracts are adopted except for the explicit version, capacity, provenance and diagnostic amendments in the adjacent future SCHEMA. The original documents remain byte-identical evidence.

## Requirements

V4-R01: An explicit versioned API and synthetic-only CLI accept primitive in-memory input, with no filesystem/network/environment/wallet input. Preserve original R01/S01 and parser/cancellation behavior.

V4-R02: Once capture inventory, schema, hashes, count conservation, control and provenance have validated, retain all three original report strings, the terminal stop reason, and unobserved finalTiming exactly. Before validation, represent those facts as null. Admission cannot require equality of distinct terminal and persisted reasons. Preserve all remaining R02/S04/S05 gates.

V4-R03: Preserve original exact decoding/numeric/identity, metadata units, ordering, partitions and local book transitions from R03-R09/S03-S07. An invalid atomic event cannot mutate accepted history or produce a usable current book. Healthy immediate duplicates, linked empty heartbeats and downward resets retain the fixed semantics.

V4-R04: Every result obeys the future SCHEMA exact output key set, status and provenance domains. Qualification has exactly seven false fields; no financial/economic/execution output is added. Determinism and controlled-cancellation limitations remain explicit.

V4-R05: All unchanged input/member/parser/resource ceilings continue to apply. A finite 65536-byte mandatory summary and resultBytes floor preserve every legal verified annotation and bounded field. Default/maximum resultBytes stay 8388608. Invalid limits and pre-aborted calls perform zero bundle parsing/decoding/hashing. All rejected/cancelled results have no usable current books.

V4-R06: Diagnostic reason follows the validated event disposition. A valid accepted update must not be labelled invalid_update. Correct failure diagnostics do not relax transition or atomicity gates.

V4-R07: Future implementation follows actual TDD, scoped type/build/static/CLI checks, existing capture regressions and independent fixed-copy code review against all frozen future acceptance. Old synthetic runs or proofs do not count as fresh product implementation verification. Capture/wallet/UI/demo dependencies remain untouched by the replay writer.

## Immutable future acceptance, to freeze only after design review

V4-AC01: Versioned primitive-string API and default/synthetic CLI have zero filesystem/network/environment/wallet input. Objects, paths, coercion/getters and unsupported CLI modes reject. Exact input wrapper and parser invariants from original AC01/AC03 remain independently tested.

V4-AC02: All original inventory/schema/hash/count/control/provenance/conservation gates are exercised. Before a complete archive gate all five acquisition fields are null; after it all four strings and exact unobserved finalTiming persist through completed semantic rejection, no-books, result overflow and later controlled cancellation. Tampered members/unknown controls/invalid consumed fields never supply verified facts.

V4-AC03: A valid producer-profile fixture with different terminal and persisted report reasons passes archive integrity without invented equality. A source-observed disk finalTiming remains unobserved even if returned runtime timing is observed. Exact terminal count exception and every other mandatory count relationship remain tested.

V4-AC04: Original metadata identity/units/hash/retrieval/applicability, missing/later/changed/extensions and unknown-scope quarantine requirements remain. No USD conversion, retroactive applicability or metadata repair is inferred.

V4-AC05: Original combined ordinals, clock/origin identities, local connection versus provider connId, restart/gap/clock ambiguity and non-stitching rules remain. New provenance fields do not provide global time or admission.

V4-AC06: All original partition phases, ack/snapshot gates, terminal quarantine, healthy immediate payload duplicate, linked changed-time empty heartbeat and once-only downward reset cases remain, with deep immutable copies and no false usability.

V4-AC07: Original whole-event numeric/schema/alignment/duplicate-price validation, exact replacement/delete/no-op/sort/depth rules and four-field domains remain, including empty/crossed/locked observations and minSz metadata-only treatment.

V4-AC08: Valid accepted update diagnostics never say invalid_update; invalid mixed updates preserve previous historical values and quarantine current admission. Malformed/unassignable events keep stable bounded diagnostics and close all potentially affected books. Assertions for invalid events must not be changed to make valid-event tests pass.

V4-AC09: All original finite input/parser/member/node/message/level/diagnostic ceilings and cancellation/yield checkpoints remain exercised. Caller allocation, hard wall-clock interrupt, RSS and physical file origin remain unqualified. Pre-aborted calls do zero input work; controlled later cancellation has no current books and reproducible boundary.

V4-AC10: Exact mandatory summary schema, reason/stage enums, four 2048-unit annotation widths, 64-character hash, validated limits, cancellation/status alternatives and canonical UTF-8 length have an independent complete capacity proof below 65536. Actual regression fixtures include full-width ASCII, NUL and other escaped controls, quotes/backslashes, BMP and valid surrogate pairs, unpaired-surrogate rejection, invalid limits, and all seven qualification flags. No known annotation becomes null, truncated, abbreviated or hashed-only to fit.

V4-AC11: Boundary 65536 is accepted, 65535 is rejected before input work, 8388608 is accepted, 8388609 is rejected; normal output at the caller limit versus one byte beyond is tested. Both shared diagnostic/frame exhaustion and serialized full-result overflow produce the exact summary within resultBytes. Invalid-limit output uses limits=null and no caller object/extra property leak. Summary content/width is checked against the final actual API, not only a detached proof helper.

V4-AC12: All complete uncancelled identical inputs/validated limits/profile/model have identical full canonical material/hash. The hash includes every original retained acquisition field, excludes itself and host-only data, and differs for changed retained literals. Output is deeply immutable. Every branch has exactly seven false flags, globalAvailableAt=null and no forbidden economic/financial fields.

V4-AC13: Actual implementation red/green commands, scoped type/build/static and default/synthetic CLI checks, fresh replay suite and preserved capture regressions are recorded with exact runtime/exits/output hashes. Separate reviewers examine a fixed copy against these criteria and documented standards; integration reads back exact targets and verifies main baseline guards. No old version acceptance or failed candidate is certified by future success.

V4-AC14: Documentation identifies synthetic versus authentic evidence, the input domain and minimum output budget/version change, original acquisition failure, all unqualified market/economic/runtime claims, and absence of financial authorization. The original frozen task remains unchanged. A design-only delivery must explicitly leave V4-AC01-V4-AC13 implementation coverage pending.

## Exclusions and dependencies

No direct filesystem importer, credentials, provider access qualification, authentic historical feed, fill model, strategy selection, returns, leverage, orders, approvals, wallet signing, payments or deployment is introduced here. These are separate goal deliverables with their own evidence and authority requirements. The legacy Jev/Monad/Kuru demo and existing main changes are preserved.

The assessor's proof and a later design reviewer may qualify this specification as feasible; they cannot stand in for actual implementation tests or independently approve their own changes.
