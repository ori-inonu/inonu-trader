# Schema regression comparison

This report records a retrospective, isolated differential run. It does not establish the historical order of edits, the identity of an author, or that RED was run before a V4 implementation was written.

## Inputs and copies

- V2 snapshot: `C:\Users\gabri\.codex\tmp\jev-trader-01a1216a\okx-dex-review-v2`.
- V2 enumerator: `REVIEW-MANIFEST.json`, SHA-256 `03872978d081fff48b00da2762a1385cb02f5c991e3a39711124f9760e831223`; 52 entries. Every listed file matched its declared hash before copying and still matched after both test runs (0 mismatches). The manifest itself was copied unchanged into both variants.
- Frozen V4 recovery snapshot: `C:\Users\gabri\.codex\tmp\jev-trader-01a1216a\okx-dex-review-v4-recovery`; its 53 manifest entries matched before and after the runs (0 mismatches).
- Evidence root: `C:\Users\gabri\.codex\tmp\jev-trader-01a1216a\okx-dex-schema-regression-evidence`.
- `v2-red` is the 52-file V2 manifest copy with only `src/okx-market/okx-dex.test.ts` and `src/okx-market/round-trip.test.ts` replaced by the V4 recovery tests. V2 implementations were retained.
- `v4-green` starts from the same 52-file V2 manifest; it uses the same two V4 tests plus V4 `src/okx-market/okx-dex.ts` and `src/okx-market/round-trip.ts`. No other V4 file was substituted. In particular, V2 `dex-fixture.ts` remains in both copies; the two tests do not import that fixture.
- Both copies use a `node_modules` junction to `C:\Users\gabri\jev-trader\node_modules`; dependencies were not copied. No `.env` file was copied or loaded.

| File | V2 SHA-256 | V4 SHA-256 | Used in |
|---|---|---|---|
| `src/okx-market/okx-dex.ts` | `4a5d86acad7c4efb806b4fda0bd74e9f4835c2456fdf521bfb047a64cb0959bb` | `f2005d5fd3c81b8adc72ceba8f06bec9e0afd021e69095a818c8c5f020097394` | V2 RED / V4 GREEN |
| `src/okx-market/round-trip.ts` | `e3d349e3e34f1e12eda2916937e5e3aa599ef2e01fe67ba9599e83bbfefa7d0e` | `1b4c142c47f3cc3bb20da1d50b47a813461773c7e5b1f20309c04805cb846fb8` | V2 RED / V4 GREEN |
| `src/okx-market/okx-dex.test.ts` (V4 test) | — | `8187560d6cb6d029f4ba8eefbf0ea3b26277509cdfaefd69a880edf5a8bc94e8` | Both |
| `src/okx-market/round-trip.test.ts` (V4 test) | — | `10514623993a9f34c6baf55e22bf47ff2d2c3612d576052a5507e28e3b7bf4fa` | Both |

The V4 tests exercise the response envelope's required string `msg` and reject malformed supported-chain metadata before dependent quotes. The tests use injected fetch/client fixtures and synthetic data; these runs made no public API call.

## Commands and observed results

Both commands were executed from their variant directory with Bun `1.3.14`, using the same arguments:

```powershell
& 'C:\Users\gabri\.bun\bin\bun.exe' --no-env-file test ./src/okx-market/okx-dex.test.ts ./src/okx-market/round-trip.test.ts
```

### `v2-red`

Observed process exit code: **1**. The two targeted regressions failed: the V2 client resolved an envelope with absent/non-string `msg`, and V2 round-trip logic returned `quoted_gross_delta` for malformed coverage metadata instead of `unknown`.

Combined command output as captured:

```text
bun test v1.3.14 (0d9b296a)

src\okx-market\okx-dex.test.ts:
(pass) OKX DEX read-only client > signs the exact supported-chain GET path and returns data [3.15ms]
(pass) OKX DEX read-only client > uses only the fixed exact-in quote query and lowercases EVM token addresses [1.34ms]
(pass) OKX DEX read-only client > preserves Solana token address case [0.60ms]
(pass) OKX DEX read-only client > validates chain, addresses, atomic amount and protection before fetch [0.62ms]
(pass) OKX DEX read-only client > rejects an invalid clock before fetch [0.55ms]
(pass) OKX DEX read-only client > rejects invalid credentials and timing bounds at construction [0.31ms]
(pass) OKX DEX read-only client > spaces concurrent request starts by the configured interval [0.86ms]
(pass) OKX DEX read-only client > applies the timeout across the JSON body and does not retry [10.66ms]
(pass) OKX DEX read-only client > sanitizes invalid JSON [1.45ms]
(pass) OKX DEX read-only client > sanitizes network and HTTP/API failures without retrying or exposing bodies [1.13ms]
(pass) OKX DEX read-only client > rejects malformed data arrays without exposing response content [0.33ms]
274 |       const client = createOkxDexReadOnlyClient({
275 |         credentials,
276 |         minRequestIntervalMs: 0,
277 |         fetch: async () => new Response(JSON.stringify(payload)),
278 |       });
279 |       await expect(client.supportedChain("1")).rejects.toThrow("OKX API returned an unexpected response schema.");
                                                             ^
error: 

Expected promise that rejects
Received promise that resolved: Promise { <resolved> }

      at <anonymous> (C:\Users\gabri\.codex\tmp\jev-trader-01a1216a\okx-dex-schema-regression-evidence\v2-red\src\okx-market\okx-dex.test.ts:279:56)
(fail) OKX DEX read-only client > requires a string message in the documented response envelope [5.51ms]

src\okx-market\round-trip.test.ts:
(pass) paired public quotes preserve exact atomic amounts and expose only a gross quantity delta [2.46ms]
(pass) invalid caller scope and atomic units fail before any provider method [0.55ms]
(pass) missing or ambiguous network coverage suppresses dependent quotes without fabricating a delta [1.86ms]
 98 |     [{ chainIndex: '1', chainName: 'Ethereum' }],
 99 |   ];
100 |   for (const coverage of malformedCoverage) {
101 |     const fixture = wireScenario({ coverage });
102 |     const result = await quoteRoundTrip(fixture.input);
103 |     expect(result.status).toBe('unknown');
                                ^
error: expect(received).toBe(expected)

Expected: "unknown"
Received: "quoted_gross_delta"

      at <anonymous> (C:\Users\gabri\.codex\tmp\jev-trader-01a1216a\okx-dex-schema-regression-evidence\v2-red\src\okx-market\round-trip.test.ts:103:27)
(fail) malformed supported-chain metadata suppresses dependent quotes [4.60ms]
(pass) global quote identity, exact input and decimals gate every dependent amount [2.43ms]
(pass) honeypot and signed impact uncertainty prevent dependent quotes on either leg [3.21ms]
(pass) decimal impact above the policy cannot pass through binary rounding on either leg [0.93ms]
(pass) a decimal tax above one remains unknown instead of rounding into the valid interval [0.68ms]
(pass) exact decimal boundaries work when the numeric policy renders with an exponent [0.83ms]
(pass) missing taxes and network estimates remain unknown without deducting them twice [1.22ms]
(pass) local timing includes coverage and rejects stale or invalid clocks before dependent requests [1.56ms]
(pass) reports discard caller extras and never expose a provider error payload [0.59ms]
(pass) Solana preserves contract case and valid negative deltas remain gross quoted losses [0.41ms]
(pass) manual complete-cost hypotheses use exact integers and require net strictly above buffer [0.54ms]
(pass) manual economics rejects incomplete, negative or non-atomic hypotheses [0.54ms]
(pass) the real read-only adapter composes with the quote validator using an injected transport [1.65ms]

2 tests failed:
(fail) OKX DEX read-only client > requires a string message in the documented response envelope [5.51ms]
(fail) malformed supported-chain metadata suppresses dependent quotes [4.60ms]

 26 pass
 2 fail
 489 expect() calls
Ran 28 tests across 2 files. [126.00ms]
```

### `v4-green`

Observed process exit code: **0**.

Combined command output as captured:

```text
bun test v1.3.14 (0d9b296a)

src\okx-market\okx-dex.test.ts:
(pass) OKX DEX read-only client > signs the exact supported-chain GET path and returns data [4.83ms]
(pass) OKX DEX read-only client > uses only the fixed exact-in quote query and lowercases EVM token addresses [3.03ms]
(pass) OKX DEX read-only client > preserves Solana token address case [1.36ms]
(pass) OKX DEX read-only client > validates chain, addresses, atomic amount and protection before fetch [1.19ms]
(pass) OKX DEX read-only client > rejects an invalid clock before fetch [1.08ms]
(pass) OKX DEX read-only client > rejects invalid credentials and timing bounds at construction [0.76ms]
(pass) OKX DEX read-only client > spaces concurrent request starts by the configured interval [1.81ms]
(pass) OKX DEX read-only client > applies the timeout across the JSON body and does not retry [18.71ms]
(pass) OKX DEX read-only client > sanitizes invalid JSON [1.50ms]
(pass) OKX DEX read-only client > sanitizes network and HTTP/API failures without retrying or exposing bodies [2.39ms]
(pass) OKX DEX read-only client > rejects malformed data arrays without exposing response content [0.98ms]
(pass) OKX DEX read-only client > requires a string message in the documented response envelope [2.05ms]

src\okx-market\round-trip.test.ts:
(pass) paired public quotes preserve exact atomic amounts and expose only a gross quantity delta [4.01ms]
(pass) invalid caller scope and atomic units fail before any provider method [1.17ms]
(pass) missing or ambiguous network coverage suppresses dependent quotes without fabricating a delta [2.88ms]
(pass) malformed supported-chain metadata suppresses dependent quotes [0.79ms]
(pass) global quote identity, exact input and decimals gate every dependent amount [3.37ms]
(pass) honeypot and signed impact uncertainty prevent dependent quotes on either leg [4.00ms]
(pass) decimal impact above the policy cannot pass through binary rounding on either leg [0.93ms]
(pass) a decimal tax above one remains unknown instead of rounding into the valid interval [0.81ms]
(pass) exact decimal boundaries work when the numeric policy renders with an exponent [1.94ms]
(pass) missing taxes and network estimates remain unknown without deducting them twice [2.24ms]
(pass) local timing includes coverage and rejects stale or invalid clocks before dependent requests [2.73ms]
(pass) reports discard caller extras and never expose a provider error payload [1.01ms]
(pass) Solana preserves contract case and valid negative deltas remain gross quoted losses [0.76ms]
(pass) manual complete-cost hypotheses use exact integers and require net strictly above buffer [0.54ms]
(pass) manual economics rejects incomplete, negative or non-atomic hypotheses [1.05ms]
(pass) the real read-only adapter composes with the quote validator using an injected transport [2.03ms]

 28 pass
 0 fail
 505 expect() calls
Ran 28 tests across 2 files. [197.00ms]
```

## Interpretation and limits

This differential run demonstrates the observed behavior of the exact copied sources at these paths and hashes: the V2 implementation fails the two added assertions and the V4 implementation passes them. It is retrospective test evidence only. It does not prove who made either implementation, when the tests were authored relative to implementation, whether a particular coordinator action modified these paths, or whether the full D1–D8 candidate was approved. No full suite, typecheck, live API, credentials, external network, or financial operation was used in this task.

