# Integration coverage: next evidence after security

Research receipt, 2026-10-11. Coordinator root: `C:/Users/gabri/.codex/worktrees/inonu-system-one-safety/jev-trader`. All source/line references below resolve under this root. Output ownership: `C:/Users/gabri/.codex/worktrees/inonu-operator-c4-research-20261011/integration-coverage-next.md` only.

Native conversation previously observed: `01a12adc-473d-7381-b067-c83af7ccda31`; session `01a12971-f941-7e42-8a42-fab6d44d4eb5`. Requested/configured GPT6.1Sol/xhigh; effective model, effort and tier remain unknown. This is an auxiliary research delivery within the full central JEV goal; it neither changes M1-M4 nor qualifies their completion. No spawns. The output copy is ordinary, not a Git worktree; supplied baseline `4fe00c9` is not an independently observed HEAD. Isolation relies on scope discipline, not an enforced read-only sandbox.

## Observed source coverage

`implemented` here means a concrete source adapter; `registered` means an endpoint-list entry. Neither proves central wiring, credentials, account access or successful provider execution. The display catalog explicitly enables nothing (`web/src/lib/central/ecosystem-catalog.ts:1-12`).

| Resource | Registered / adapter | Exact evidence and display limitation |
| --- | --- | --- |
| `market.price.price` | Yes / yes, POST | `src/onchainos/endpoints.ts:34`; `market-price.ts:340-343`. |
| `market.index.current-price` | Yes / yes, POST | `endpoints.ts:35`; `market-price.ts:345-347`. |
| `market.price.candles` | Yes / yes, GET | `endpoints.ts:36`; `market-price.ts:332-350`, bounded backward walk/dedup at 353-365. All three already have capture planning/collection at `capture-sources.ts:378-469`; catalog item remains `blocked` at 81-90. Earlier adapter-absence claims do not describe this source snapshot. |
| Gateway chains and gas price | Yes / yes, GET | `endpoints.ts:59-60`; `gateway.ts:128-142`. `ecosystem-catalog.ts:199-208` combines these with a gas-limit claim, so its `read_only` status is not endpoint-level implementation evidence. |
| DeFi discovery | Seven registered / seven source methods | `endpoints.ts:61-67`; `defi-read.ts:348-420`: chains, platforms, search, detail, rate/TVL/depth-price charts; bounded `searchPages`. Catalog at 223-231 cites the older adapter, which fetches page 1, `SINGLE_EARN` only (`src/okx-wallet/defi.ts:41-47`). `src/okx-defi/report.ts:159-167` explicitly reports `partial_unverified`, `not_qualified`, null costs/exit/net return. |
| Gateway gas limit | Absent / absent, intentionally | `gateway.ts:12-13`; exhaustive registry at `endpoints.ts:32-77`; existing isolation denial at `isolation.test.ts:30-37`. Not an accidentally missing GET. |

Short filenames in this matrix are under `src/onchainos/` unless another path is supplied. Catalog statuses are display observations, not findings that gates can be accepted.

## Exact public contract verified

Public browsing reached [OKX Get Gas Limit](https://web3.okx.com/onchainos/dev-docs/wallet/onchain-gateway-api-gas-limit). It specifies POST `/api/v6/dex/pre-transaction/gas-limit`, requiring `chainIndex`, `fromAddress`, `toAddress`; optional `txAmount` defaults to zero and uses native base units, with optional `extJson.inputData`. Response `gasLimit` is a string estimate. The page does not specify its unit, response timestamp, freshness, access plan, rate limit or pagination. Its authenticated request example was documentation, not a request executed here. This would introduce address/transaction-data egress even without signing or broadcasting. Only this exact web contract was reverified; other provider claims below are local evidence.

## Proposed requirements and independent acceptance

Advice only; no implementation or specification approval:

1. First reuse the existing T0 clients/capture seam, then establish comparable units, identity, provenance, receipt/provider times, freshness and bounded coverage before feeding decisions. The local contract explicitly labels market quote currency unknown (`market-price.ts:94-120`, `capture-sources.ts:390`); do not equate it to Kuru/USD or an exchange mark. Capture uses local receipts, closed-bar checks and missing-value skips (`capture-sources.ts:7-16,419-444,451-463`). Registry price/candle tiers are Basic and index Free; actual account availability/cost remains unqualified.
2. The first concrete absent adapter with an exact public request contract is gas-limit. Keep it excluded in this cycle. A separate scope/SPEC decision must account for transaction-data privacy, allowed chains/destinations, native amount units, unknown result units, clocks, response errors and quota evidence before any provider use. Do not remove the current denial to make a new test pass: SPEC `docs/OKX-ONCHAINOS-DADOS-SPEC.md:59` requires purity, and 274 explicitly excludes it.
3. DeFi needs field-level cost/exit evidence, not another discovery client. Search rate is an advertised fraction; detail rates/fees have unknown bases; redemption queues/liquidity remain undocumented locally (`defi-read.ts:6-15`; SPEC:239-245). Unknown cost, eligibility or executable exit must stay unknown. Portal-policy observations likewise need provenance/freshness and independent enforcement/revocation evidence. The auth matrix's 40-46 corrects a guessed 404 and documents four rules; it does not certify selector filtering or local enforcement. Preserve custody/execution blocks.

Independent acceptance should exercise synthetic malformed/missing identities, real zero versus absent values, future/old timestamps, conflicting duplicate candles, confirmed-but-not-closed bars, cursor gaps and bounded/truncated pagination. Assert no invented currency, zeros, net return, credential/environment reads or outbound calls. Public seams already exist: injected `readGet/readPost` ports (`read.ts:27-36`), market/capture clients, and gateway/DeFi methods. Existing static test cases: `market-price.test.ts:19-37`, `capture-sources.test.ts:344-397`, `gateway.test.ts:17-98`, `defi-read.test.ts:17-249`. No tests were executed here; these are test seams, not passing TDD evidence. Future implementation needs recorded red/green evidence against frozen requirements and independent review of current hashes.

Real alternatives: qualify existing T0 capture contracts first; separately research gas-limit; or research custody-policy observation contracts. The first has the least new data-egress surface. This ranking is advice, not approval. R8 security remains a dependency: the recheck at line 13 proposes rejecting mock/invalid decision identity before live side effects; this pass did not recertify that gate.

## Limits and source receipts

Bounded source reads and one public documentation page only; no secrets, environment, credentials, installations, authenticated APIs, trades or private payloads sent to JEV. No coordinator edits, financial authorization, runtime/profit qualification or review of this report by another reviewer. Historical R6 totals and access/pricing claims were not recertified (`ONCHAIN-OS-RECHECK-20261011.md:3,13`). Concurrent changes require rereading changed sources; hashes below, rather than a borrowed baseline, identify this observation.

| Coordinator source | SHA-256 |
| --- | --- |
| `src/onchainos/endpoints.ts` | `23158bcd606d26a710723a55d18b5c4eddd8c2c5f1273b3de88182f4b73134b5` |
| `src/onchainos/defi-read.ts` | `23b50cc9ba14b28932601b4b6ce17e2d5731c20728db681ed598d607f5af6432` |
| `src/onchainos/gateway.ts` | `5a0a40b26430db03973ab458be61b240b2e59d6ce811db1cbdff7e6147dc2751` |
| `web/src/lib/central/ecosystem-catalog.ts` | `249a08fa3577090a73856278a808b557f1c7293bc3da9f495f3f37a8bd4f51b5` |
| `docs/research/OKX-AUTH-CUSTODY-MATRIX-20261011.md` | `3a70fe5d726891cf82a212b266bef637588cee70531ecf771ccaea6106efa133` |
| `docs/research/ONCHAIN-OS-RECHECK-20261011.md` | `5757a343607cdef187b3af28ea92a24a577404e0baf4d42109c6e48e2433d53e` |
| `docs/OKX-ONCHAINOS-DADOS-SPEC.md` | `8a0755607de629b2e927413dbe7b61537c3d534ce7693c9f0c29aba3f184ef81` |
| `src/onchainos/market-price.ts` | `58f3c9020b6108aac598ae734c263cdb31e6af533936dc8413757a9d8b2a8a8a` |
| `src/onchainos/capture-sources.ts` | `208038e8616efda3ef1cd4a72665822e6af128885d44d63662d9b664d56b97f1` |
| `src/onchainos/read.ts` | `cc7d8a73b2b9ebacb5ec2298c2cc929d4acdb0262e7567b465b7ae3a6eba6b15` |
| `src/onchainos/isolation.test.ts` | `cefcfd8d82ab2a8f161931341bec7ca33ae14be6446366a1034061c1124b3fe4` |
| `src/onchainos/gateway.test.ts` | `4a16e0c281ca72d73accee25ce1592e53ad6d35441f40146f49be4eef9d36d76` |
| `src/onchainos/defi-read.test.ts` | `7e7a5f7e684621513164382cc9ca740395e5df2a2a392b78a82f96e6a0667c1c` |
| `src/onchainos/market-price.test.ts` | `57917f273a6d59f8fa544675e4c0fb0815d6d70df2b481390ba5eadad905afb2` |
| `src/onchainos/capture-sources.test.ts` | `5e0035064b7a6efcb4265bf4968f411d05ff6b5feb8e965c92f7756e25fcece9` |
| `src/okx-wallet/defi.ts` | `a00da33976075aaaa73b7f0b189f4d89540f31d6f646f32f81dc6eafc1fdb76e` |
| `src/okx-defi/report.ts` | `1b7942412b0d733629be71af1e6ec0e7ae04ccce0c024a554e8f8ea86eadd73d` |

Previous C4 and persistence artifacts retained. Their report hashes before this output: `c4-research.md` = `531288ed77dfcfcd5a88ccdf235d782894b8d84236b251b4d9897830e81a1a98`; `persistence-experiment.md` = `28daee20fb5b5d48b63f5c68808dbd62b14ee6c2f5c66b1d21e043bb59ead71d`. Existing scripts, raw results, fixtures and copied source inputs are also included in the local pre-write preservation check; none are assigned for modification.

Post-write verification observed: all 17 cited coordinator source hashes and all 47 prior artifact hashes matched the pre-write snapshot; the saved report matched its intended text. These checks are preservation evidence, not independent acceptance. No raw-byte hash or immutable revision of the public web page was captured.

