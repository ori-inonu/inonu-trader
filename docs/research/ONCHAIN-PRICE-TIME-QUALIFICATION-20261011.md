# Price observation time qualification

Research addendum, 2026-10-11. No implementation approval, schema change, provider request or financial authorization. Preserve the original operational objective and the pending independent CLI-lock review.

## Provider contracts rechecked

Official [Get Price](https://web3.okx.com/pt-br/onchainos/dev-docs/market/market-price) documents POST /api/v6/dex/market/price and a per-token `time` representing the price timestamp in Unix milliseconds. Its response table does not identify a quote-currency field. Do not infer USD from a numeric price.

Official [Get Token Index Price](https://web3.okx.com/pt-br/onchainos/dev-docs/market/index-price) documents POST /api/v6/dex/index/current-price, a maximum batch of 100, a price timestamp in milliseconds and an index assembled from multiple third-party sources. An empty token address queries the native asset. An aggregate index is not an exchange liquidation mark or an executable quote.

Only documentation was read; HMAC example headers do not prove configured account access or wallet signing permission. No authenticated market read was performed. Source reads: turn29view0/turn29view1, response tables lines109-116 and112-119 respectively.

## Local boundary inspected

- src/onchainos/market-price.ts SHA256 58f3c9020b6108aac598ae734c263cdb31e6af533936dc8413757a9d8b2a8a8a: both prices and indexPrices return PricesResult; PriceRow has timeMs of EpochMs or null. There is no separate index-price.ts in this checkout. The attempted path was an exact lookup failure, not a missing implementation.
- src/onchainos/capture-sources.ts SHA256 208038e8616efda3ef1cd4a72665822e6af128885d44d63662d9b664d56b97f1: lines448-467 retain price and optional index, discard both provider timestamps, and use the maximum local receipt timestamp of the two separate requests for record t. This preserves when both values became knowable, but cannot qualify their individual ages or temporal alignment.
- docs/OKX-ONCHAINOS-DADOS-SPEC.md SHA256 8a0755607de629b2e927413dbe7b61537c3d534ce7693c9f0c29aba3f184ef81 explicitly requires local-receipt t, unknown priceQuote, no fabricated currency, and capture/replay compatibility. These requirements must not be weakened.
- src/lab/capture-format.ts uses strict top-level and data-key validation. MarkData permits price and optional index only. Simply adding provider-time keys to JSONL would violate the existing public format; simply replacing t with provider time would violate the point-in-time contract and could leak information into replay.
- src/lab/candidates.ts freshQuote uses ticker receipt t, not mark. This bounded inspection does not establish an Onchain OS mark-to-live-decision consumer or a demonstrated live financial failure. Find the actual consumer before prescribing a production decision gate.

Local source/read evidence: b3502b and a3018c. Preserve candle confirmation plus local-close margin, duplicate-conflict rejection, missing-OHLC rejection, cursor filtering and explicit gaps.

## Resource matrix delta

| Resource | Current implementation evidence | Limitation / dependency | Required qualification |
| --- | --- | --- | --- |
| Token price | Typed parser retains nullable provider time; capture emits price | Capture loses observation time; currency unknown; account access untested | Distinguish observation and receipt time; unknown must remain unknown |
| Aggregate index | Uses the same typed PricesResult parser; optional capture index | Separate reads may represent different observation times; not an executable or liquidation price | Bind identities, separate timing and price semantics before comparisons |
| Capture / replay | Strict existing MarkData and local-receipt t | Extra fields are rejected; format change requires compatibility design | Source-backed scope review and tests at public parse/replay seams |
| Decision features | Inspected lab ticker freshness uses local receipt t | Actual Onchain mark consumer not established by this inspection | Locate consumer; do not claim financial qualification from parser tests |

## Next research dependency

Compare compatible versioned capture metadata with a separately bound qualification envelope only after locating actual consumers and file lifecycle. Either option must retain independent price/index provider timestamps, individual receipt provenance, null/unknown handling, immutable identity association and the existing replay cutoff. A sidecar without a verified content binding cannot establish provenance; accepting new fields without a version policy can break existing captures.

Proposed acceptance topics, not yet frozen: old/future/null timestamps; distinct price/index observation times; unqualified currency and asset identities; restart and replay binding; preservation of existing captures and candle protections. Obtain delegated technical choice and independent scope review before implementation. No paid feed, address egress, trading activation or relaxed safety allowlist is implied.
