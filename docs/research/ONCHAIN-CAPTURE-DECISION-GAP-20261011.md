# Capture to decision evidence gap

Research only; no new cycle approval or source modification. Full central goal remains incomplete. This document is internal and excluded from source staging.

Official overview re-read 2026-10-11: https://web3.okx.com/pt-br/onchainos/dev-docs/home/what-is-onchainos describes Wallet, Trade, Market, Payments, Skills and Open API. This is provider documentation, not proof of account access or local execution.

Verified local paths are docs/OKX-ONCHAINOS-DADOS-SPEC.md and src/onchainos/capture-sources.ts. Earlier attempted docs/ONCHAINOS-DATA-SPEC.md and src/collector/capture-sources.ts do not exist in this checkout; that lookup failure is not evidence of missing implementation.

Current src/onchainos/market-price.ts models PriceRow.timeMs as provider timestamp or null and price currency as unknown. src/onchainos/capture-sources.ts:448-467 collects both prices and indexes, uses the maximum local receipt time as record t, and writes price/index without the provider timestamps. Its describe() retains priceQuote unknown, but individual records have no provider-time field. This does not establish that a recent receipt contains a recent provider observation. A parser and a successful request do not qualify comparability with Kuru/USD or an exchange mark.

Existing candle protection must be preserved: confirmed flag plus local close margin, conflicting duplicate refusal, absent OHLC rejection, cursor filtering and reported gaps. Existing tests explicitly cover confirmed-but-not-locally-closed bars, conflicting duplicated timestamps and malformed closed OHLC. Those behaviors must not be replaced by generic missing-integration claims.

Candidate next requirement, pending scope review: preserve independently identifiable provider observation time and local receipt time through the data-to-decision boundary, retain null/unknown rather than fabricate freshness or currency, and reject unqualified comparisons in financial decisions. Determine existing replay schema compatibility and actual decision consumer before choosing an additive metadata field or a separate qualification envelope. Test old, future, null and mismatched timestamps at public seams; preserve existing capture/replay contracts. No new provider request, address egress, trading permission or automatic enabling is implied.

The existing SPEC section8 intentionally excludes gas-limit/transaction endpoints and several address-bearing or paid families. Do not remove those denials while resolving this separate market-data qualification gap. Full ecosystem coverage requires separate reviewed scopes and exact contracts.
