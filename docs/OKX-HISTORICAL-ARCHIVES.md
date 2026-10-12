# OKX historical archive metadata discovery

This additive client lists historical archive metadata for future INONU TRADER data evaluation. It does not download or extract files, qualify a strategy, authorize funds, or establish historical coverage. Existing captures and replay timestamps are unchanged.

## Run

Use `--no-env-file` so Bun does not automatically load a `.env` file. The script itself reads only arguments and uses no environment variables or credentials.

```powershell
bun --no-env-file scripts/okx-archive-discovery.ts --module 2 --inst-type SPOT --instruments BTC-USDT --aggregation daily --begin 1788192000000 --end 1788192000000
```

The default is a validated JSON dry run with zero requests. Adding `--public` enables exactly one unauthenticated GET to `https://www.okx.com/api/v5/public/market-data-history`. There are no retries or archive downloads. `--help` prints usage. No URL or positional argument is accepted; duplicate, missing and unknown flags fail.

Exit codes: `0` valid plan or metadata listing; `2` invalid usage/request; `1` provider, response schema, network, offline or other operational error. CLI errors contain only the error kind, without untrusted argument, provider or exception text.

## Request policy

| Input | Adapter behavior |
| --- | --- |
| Module | Exact strings `1` trades, `2` one-minute candles, `3` funding, `4` 400-level books, `5` 5000-level books, `6` 50-level books, `11` borrowing |
| Instrument type | `SPOT`, `FUTURES`, `SWAP`, `OPTION` |
| Selectors | SPOT uses `instIdList`; other types use `instFamilyList`. Exactly one applicable field, 1–10 distinct identities, supplied as comma-separated text or a plain dense list |
| `ANY` | A single selector, daily only, modules `1`, `2`, `3`, `11` |
| Funding | Daily requires non-SPOT family `ANY`; monthly permits explicit non-SPOT families. SPOT funding is conservatively excluded by this adapter |
| Module `6` | Monthly rejected; OPTION requires one family and exposes only the day specified by `end` |
| `begin`, `end` | Canonical decimal Unix milliseconds as strings, within the existing 1970–2100 adapter bound; begin ≤ end |
| Date buckets | Books (`4`, `5`, `6`) use UTC0; other modules use UTC8. Hours are ignored for effective date keys |
| Window | At most ten inclusive daily or calendar-month buckets, including leap days/month and year transitions. Original milliseconds remain in the actual query |
| Module `5` | Effective dates before `2025-11-01` rejected as an adapter bound |

Unknown fields, accessor fields, custom prototypes, sparse lists, symbols, duplicate selectors and unsupported parameter combinations fail before any request. Identities are uppercase alphanumeric groups separated by hyphens, at most 80 characters. A comma-separated selector value is bounded at 809 characters.

## Response and URL policy

The parser accepts exactly one `data` row, at most 100 groups and at most 2000 listed files overall. Both array bounds are checked before mapping file entries. Aggregation, required fields, selectors, group ranges and file date buckets must agree with the request. Duplicated group identities, file URLs or filenames fail. Exact nonnegative decimal MB strings, at most 128 characters without signs or exponents, remain strings; the adapter does not recompute rounded provider totals.

The official example uses `dateTs`, while its response table uses `dataTs`. The parser accepts either and records `timestampAlias: "dateTs" | "dataTs" | "both"`. Both are accepted only when identical valid decimal milliseconds. `dateTimestampText` preserves the text. Response `instType` is optional because the table omits it; when present, it must match the request.

URLs must be canonical HTTPS on `static.okx.com`, with no credentials, explicit port, query, fragment, percent escapes or backslashes. Filename length is at most 255 characters; URL length is at most 2048 characters. Traversal, empty path segments, confusable prefixes and URL normalization changes fail. The parser accepts two bounded locations:

- Legacy ZIP archives under `/cdn/okex/traderecords/`. Path segments use ASCII letters/digits/underscore/hyphen; the basename must exactly equal the filename, consisting of ASCII alphanumeric/underscore/hyphen followed by one `.zip` suffix. A safe basename directly under the prefix is accepted.
- Daily SPOT 400-level L2 archives, only for module `4`, at `/cdn/okx/match/orderbook/pro/L2/400lv/daily/YYYYMMDD/INST-L2orderbook-400lv-YYYY-MM-DD.tar.gz`. `INST` must equal the validated group `instId`; both dates must equal the validated UTC0 file date. Other tar paths, depths, aggregations and extensions are rejected.

For the second request shape, the group may contain `ccy: ""` or omit `ccy`. Nonempty or nonstring values and all other additional fields remain rejected. This field does not replace instrument identity. No listed URL is fetched.

Empty `details` is valid and means no files listed for that query. It does not prove that historical data is absent. Provider timestamp is kept separate from the local request and receipt clocks. Metadata timestamps do not establish when an archive was published or historically available to a trading decision.

## API seams

`src/onchainos/archive-discovery.ts` exports:

```typescript
normalizeArchiveRequest(input: unknown): NormalizedArchiveRequest
parseArchiveResponse(data: unknown, request: NormalizedArchiveRequest): ArchiveListing
createArchiveDiscoveryClient(options: ArchiveDiscoveryOptions): ArchiveDiscoveryClient
```

Client options are injected `fetch`, `now` and `sleep`, optional `allowNetwork` (default false) and optional `onCall`. There is no origin, endpoint, credential, retry or signing override. `client.discover(input)` returns validated files/groups, original query and effective date policy, provider timestamp, transport `ReadMeta`, schema version `okx_archive_discovery_v1` and qualification. `info` exposes fixed limits; `quota` uses the existing local `QuotaCounters`. Its `costKnown` field is the inherited tier accounting convention, not a billing measurement or rights statement.

Transport uses the existing `createTransport` and `TokenBucket`: one request/second, burst one, 10-second timeout, zero retries, `redirect: "error"`, empty headers and a 1,000,000-character response parsing bound. The existing transport reads `response.text()` before enforcing that bound; it does not bound streamed bytes or memory used while receiving the body. No account or trade endpoint is exposed.

`scripts/okx-archive-discovery.ts` exports `runArchiveDiscoveryCli(argv, ports): Promise<number>`, with injected `stdout`, `stderr`, `fetch`, `now`, `sleep`. Importing the module performs no IO or network operation; the real entry point is guarded by `import.meta.main`.

Every plan/listing explicitly keeps `historicalCoverage`, `rights`, `fileAccess`, `fileSchema`, `executionAvailability` as `"unknown"`, `strategyQualified: false`, and `financiallyAuthorized: false`. Archive contents, licensing, liquidity, fees, fills, borrowing rights, funding forecasts and strategy profitability require separate evidence.

## Offline checks

```powershell
bun --no-env-file test src/onchainos/archive-discovery.test.ts src/onchainos/archive-observed.test.ts scripts/okx-archive-discovery.test.ts scripts/okx-archive-observed.test.ts src/onchainos/http.test.ts src/onchainos/errors.test.ts src/onchainos/values.test.ts
```

Tests inject network, time and output. No real probe or archive download is part of the unit suite. A single separately authorized public availability query is evidence only for its instrument/date; real access and coverage remain unqualified until that observation is recorded.

## Contract provenance

This implementation follows archive discovery acceptance AD01–AD10 and the bounded observed-L2 compatibility criteria AC01 through AC06. The official [OKX historical market data documentation](https://www.okx.com/docs-v5/en/#public-data-rest-api-get-historical-market-data) describes metadata; its ZIP example is for trades and does not define the internal L2 archive format. The original retained contract was observed on 2026-10-11 with SHA256 `d4304e750303c66c87d8b6e49c539f002835ee88cfb1eebd2299327d31e99667`. Documentation describes variable backfill and typical T+2/T+3 schedules; these are not completeness or release guarantees.

The compatibility regression retains an intact 511-byte public metadata response for BTC-USDT, module 4, SPOT, daily, 2026-10-01. Its SHA256 is `a24a9109e655754aebd047d42f403ce4de8afaa34adbdf9423c69d8627c4f85a`; the declared file size is `109.26` MB. This is metadata evidence for that query; neither the archive nor its expanded content was obtained. Tests replay the retained bytes through injected fetch ports and explicitly label adversarial variants as synthetic. They do not repeat the public query.

See [historical data qualification](./OKX-HISTORICAL-DATA-QUALIFICATION.md) for primary sources and remaining dependencies. Historical archive schema, units, sequences/checksum behavior, actual coverage, historical availability, usage rights, and fill/cost assumptions still need their own qualification. Live WebSocket documentation supplies a separate contract; equivalence to historical files has not been demonstrated. This correction does not establish a verified wallet balance, profitable backtests, continuous operation or completion of the broader INONU TRADER goal.
