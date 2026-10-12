# Independent Standards review v1

Status: changes requested. I did not implement this candidate. Review was confined to the isolated copy; candidate and acceptance files remain unchanged.

Baseline: `055a637f27f28cbf357cfb492534f7ed33d9b68f`. Candidate digest: `b7883b31273801e0dcc613892f24ebd42c17960bb08c314f6938a7fc4e65478a`. All 23 listed hashes and byte counts match before and after review, including SPEC SHA `7fdb9f0f49ef469fb05e3d101e93f9bf2a454d84d716481f4f66b65fa97ea10b`.

- **P2, documented rule: sanitize prohibited punctuation at the HTML display boundary.** Human-supplied AGENTS.md requires: "No middle dots, em dashes or en dashes in any rendered text." `src/mobile-decision-report/export.ts:3` escapes HTML metacharacters but preserves these codepoints; line 61 places accepted metadataSource into visible text. Reproducer: create `syntheticMobileInput('fresh')`, set `input.dex_report.tokenA.metadataSource = 'Fonte\u00b7secundaria\u2013curta\u2014longa'`, then call `exportMobileDecisionHtml(input, { now_ms: SYNTHETIC_NOW_MS })`. It succeeds and contains all three forbidden characters in the metadata paragraph. The punctuation assertion at `export.test.ts:23` exercises only the default fixture. Normalize display punctuation and cover imported text while preserving original JSON values.

Independent Bun 1.3.14 execution with `--no-env-file`: 17 tests passed, 0 failed, 166 assertions. Exact output and reproducer are preserved in the JSON report. Source inspection found Bun APIs, explicit clocks, allowlisted projection, static CSP, escaped text, exact financial strings/nulls, and clear unverified/unqualified labels. No other Standards breach or actionable heuristic smell was identified.

Limits: Standards axis only; another reviewer owns M01-M10 acceptance coverage. No independent browser or type-check reproduction; their records are integrator evidence. The minimal copy has no Git metadata or all 697 baseline files, so HEAD and full preservation remain supplied evidence. Digest is the manifest's declared identifier; listed file hashes were independently recomputed. No network, environment/secret access, install, live financial qualification, or G01-G17 approval occurred.

