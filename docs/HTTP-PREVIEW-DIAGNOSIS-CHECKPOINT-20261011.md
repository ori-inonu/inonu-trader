# Preview diagnosis and concurrent review checkpoint

Conversation: 01a12971-f941-7e42-8a42-fab6d44d4eb5. Native full JEV/OKX goal remains active and incomplete. This checkpoint supplements, without rewriting, the integrated runtime checkpoint.

## Current state

Integrator and main observed at 42e19fba7654b84e4c24e4260ae22867896712a3. Main status was clean. Loopback listeners remain API PID36960 on3008 and frontend PID36488 on3009. No production, provider, wallet, signing or orders were invoked. The desk branch advanced to317bc18; previous reviews are strictly bound to4a1d9e9500468ba566d377d6248d20834e932b4f and do not qualify its moving HEAD. Concurrent changes were preserved.

## Failed test and bounded diagnosis

Original main focused run:2pass/1fail,64assertions,16.40s. First HTTP root JSON read failed with `SyntaxError: Unexpected end of JSON input` after status200 and accepted origin. Private metrics C:/Users/gabri/.codex/http-preview-main-check-20261011-1846.json retain stderr SHA256 fc47b94e03fd170b045fcdc4f7dd04bd26d4f740568467bfbb5aa340c9cd404c. The failure remains unexplained; passing reruns do not establish a correction.

Diagnostic private copy instruments only response consumption and keeps the actual committed CLI. Five repetitions passed with179-byte JSON, child alive, request signal not aborted. Adding only250ms delay before consuming the body passed three times with179-byte JSON even after the signal aborted. Thus a simple delayed-consumption explanation was not reproduced. Original unchanged first test repeated20times:20pass/0fail,720assertions,5.12s. Original full focused file rerun:3pass/0fail,97assertions,2.62s. No implementation or acceptance criterion was changed.

Private paths: C:/Users/gabri/.codex/tmp/jev-preview-integrated-20261011/{prepare-diagnostic.py,body-diagnostic.test.ts,body-delayed.test.ts}. These are explicitly temporary diagnosis artifacts outside the repository, not shipped tests. Metrics: C:/Users/gabri/.codex/http-preview-body-diagnostic-1856.json, http-preview-body-delayed-1858.json, http-preview-original-repeat-1900.json, http-preview-main-full-1902.json. RTK preserved same-run output; no compression gain or saved full stdout archive is asserted.

Jev recovery recommendation receipt da5ab714-d287-470d-82b2-338d9f5ed2c6, modeljev-1.13.0, confidence1, usage662input/55output; billed cost unknown. Advice grants no authority. Harness lease renewed revision103.

## Independent concurrent candidate findings

Copied exact reviewer outputs into docs/JEV-READ-INDEPENDENT-SPEC-REVIEW-4a1d9e9.md (SHA2562217029cb005373c79d24aa480a67f5c655abd6c1aacecb201fa060173666cc2) and docs/JEV-READ-INDEPENDENT-STANDARDS-REVIEW-4a1d9e9.md (SHA256475d77b1e4d37c050e6abbfd99732d14871c167b46cbcb52b92f47e99045d95b).

SPEC reviewer reproduced six defects despite93existing tests passing: local/exchange clock mismatch and future candles; provider timestamps ignored for book/ticker; funding identity/age unchecked; truncated trade-window coverage and absent data represented as zero; late/pre-aborted model responses accepted as buy; finite probability weights summing toInfinity normalized to allzero. Standards review independently reproduced clock-domain defect and identified token-normalization divergence. Do not integrate the reviewed candidate as conforming until corrections are independently validated. New desk commits require their own fixed review scope.

## Next eligible work

Await existing Locke integrated preview audit; its live handle was polled with timeout, not terminal. Preserve intermittent failure as open reliability evidence. Complete verification/review/audit only with current criterion coverage and reviewer conclusion. Then pursue operator amount/cost/router-proof cycle and isolated fixes for independently demonstrated JEV input/response defects; avoid modifying the concurrently written desk checkout. No overall completion, push or external deployment is claimed.
