# Browser wallet and real pipeline implementation

Candidate date: 2026-10-11. This isolated implementation is subject to integration verification and independent review. It does not certify real provider access, a live wallet connection, financial qualification, or completion of G17.

## Ownership and integration

Workspace: `C:/Users/gabri/.codex/tmp/okx-real-ui-01a12b5f`.

Exclusive implementation files:

| File | Responsibility |
| --- | --- |
| `web/src/lib/useOkxWallet.ts` | Existing public hook backed by one shared browser session |
| `web/src/lib/wallet-store.ts` | Provider discovery, reference counting, identity revisions, SHA-256 identity key and cleanup |
| `web/src/lib/wallet-store.test.ts` | Public provider lifecycle and delayed-operation regression checks |
| `web/src/lib/real-pipeline.ts` | Browser HTTP client, consent serialization, polling, revocation and stale-result filtering |
| `web/src/lib/real-pipeline.test.ts` | Public HTTP/lifecycle regression checks |
| `web/src/lib/real-pipeline-render.test.tsx` | Rendered consent and unknown-value behavior |
| `web/src/components/RealPipeline/RealPipeline.tsx` | Client lifecycle and shared wallet integration |
| `web/src/components/RealPipeline/RealPipelineView.tsx` | Source-backed readiness, market, consent and history presentation |
| `web/src/components/RealPipeline/RealPipeline.module.css` | Responsive layout, focus, overflow and reduced-motion styles |
| `docs/real-integration/UI-IMPLEMENTATION.md` | This manifest and verification boundaries |

The integrator owns `page.tsx`, layout, package/configuration, backend/runtime and shared integration. This slice does not edit those files, either existing wallet panel, or `okx-wallet.ts`. No commit was created.

Import and render contract:

```tsx
import { RealPipeline } from "@/components/RealPipeline/RealPipeline";

<RealPipeline apiBase={API_URL} />
```

`apiBase` is required by the component and must point to the local backend. Production uses backend port 3000 and browser port 3001; the integrator may use isolated test ports. The client allows HTTP localhost/127.0.0.1 bases and appends `/api/real/health`, `/api/real/latest`, `/api/real/consent`, and `/api/real/refresh`. CORS/origin enforcement belongs to the backend. It does not infer Next same-origin routes.

The hook retains its existing fields and actions and additionally exposes `revision` and `identityKey`. The hash is lowercase SHA-256 hex over UTF-8 `${chainIndex}:${address.toLowerCase()}`, where X Layer is `196` and Monad is `143`.

## Frozen requirements and sources

This implementation follows the root-frozen harness revision 6 and the immutable objective G01–G17. Acceptance files were read without modification:

| Source | SHA-256 |
| --- | --- |
| `docs/real-integration/INSTRUCAO-DO-OBJETIVO.md` | `CFA90CAC735E9A838A0C4BC593276C83757905E7C5FEDCD2414E499B1DAD9E08` |
| `docs/real-integration/EXECUTION-SPEC.md` | `EEB6AB8D9E4ADF990600A8806BCEAEB7774A5EEFE1AE3BBE7DABA70E590290EF` |

Local `web/AGENTS.md`, Next 16.3.4 Server/Client Components and use-client guides, the TDD skill, and the RTK adapter guide were read. Frontend structural schemas follow the public core types in `C:/Users/gabri/.codex/tmp/okx-real-core-01a12b5f/src/real/types.ts`; there is no frontend import of backend implementation.

Approved TDD public seams: shared wallet lifecycle, HTTP client and rendered output, delegated receipt `7572e239-2232-41a6-b4a9-62d35395c549`.

The finite presentation decision selected a readiness-first layout through Jev Workflows, receipt `0aa4bdf9-0966-49c7-9e93-60371d06b9cb`, model `Jev1.13.0`, input tokens 512, output tokens 56, latency 492 ms. Billed cost remains unknown (`null`). Input digest: `32922054203c9bb8650124ee52e45d42c40f9c24938f6b35d217d8071fdfd7f9`. This advice was applied within the authorized UI scope and supplies no external-action authorization.

## Observable behavior

- Both existing wallet consumers use a single lazy browser store and local OKX session. Retaining a consumer discovers the provider without requesting accounts. Last-consumer release removes discovery listeners, timers and provider subscriptions and disposes the session.
- Late injection, provider replacement/loss and account/chain/disconnect events invalidate the identity revision immediately. Supported identities receive an asynchronous hash only if their revision is still current. Switch/disconnect also invalidate before delayed provider work can return.
- Local connect performs wallet discovery and local reads only. It does not contact the real backend, transmit an address to Jev, sign, approve, or trade.
- An additional unchecked acknowledgement identifies the local backend and OKX Web3 as recipients, the public address/network/revision as fields, and balance/quote as the purpose. An explicit action grants consent; the acknowledgement cannot carry across an identity revision.
- Consent POST and DELETE are serialized. An already-sent POST is allowed to settle before compensating DELETE, so a delayed grant cannot land after its queued revocation. An incompatible/failed grant also queues a compensating DELETE. Refresh requests do not block revocation.
- Wallet/revision changes, revocation and unmount abort polling/refresh and clear locally visible samples. Delayed replies are generation-checked. Server-reported consent is never treated as new local consent, and cycle/history core data is visible only for the exact currently consented identity/network/revision.
- Health and latest cycle poll every five seconds with abort cleanup. Retry, update and revoke controls invoke the real HTTP endpoints. Unmount uses a keepalive DELETE when consent or a pending grant exists. A network failure cannot prove remote revocation; the UI exposes a retryable error.
- The browser keeps state in memory. This slice writes no localStorage, consent file, raw-address log, or persistent raw-address record.
- The readiness area identifies the next dependency, including provider configuration/access, local identity, separate query consent, Jev authorization, missing or expired sample data and hold reasons.
- Inventory uses observed-token coverage and preserves unknown total value, decimals, block number and units. Quote input/output retain exact smallest-unit strings and source reference decimals; fees, impact and gas remain unknown when absent. Market currency is shown as unknown where the schema provides no currency proof.
- Source cards show endpoint, source, response/source times, TTL, HTTP status and units. Expired ready envelopes are marked expired and excluded from displayed market values. Decision/history cost and paper PnL are shown as unknown when null, rather than zero.
- Capability documentation, implementation, integration, real exercise and financial qualification remain distinct. A ready envelope or injected adapter is not real-exercise evidence. Only the explicit `exercisedReal` field controls that column; missing proof is unknown. UI history and test fixtures do not establish real exercise.
- The sanitized proposal shows transaction hash and preflight reasons only. No transaction payload, execution action, signature or trade control is presented.

## Red-to-green evidence

Tests were added in short public-behavior cycles. Observed failing cases included the initially absent shared-store/client/render implementations, switch revision not invalidating before a delayed provider reply, incompatible consent lacking compensating DELETE, revocation waiting behind delayed refresh, and unmount failing to abort refresh. Each was corrected and the targeted behavior rerun.

The 11 final targeted tests cover:

1. Shared wallet connection and last-consumer cleanup, with exact independently computed identity hash.
2. Immediate revision invalidation and ignored delayed switch/disconnect results.
3. Local wallet identity causing no HTTP call, followed by explicit grant and revoke.
4. Delayed grant followed by identity change and ordered revocation.
5. Incompatible grant followed by compensating DELETE.
6. Revocation reaching the backend while a refresh is still pending.
7. Unmount aborting a delayed refresh and preventing sample restoration.
8. Real health/latest HTTP polling with server consent not auto-granted locally.
9. Identity change aborting polling and ignoring delayed responses.
10. Explicit refresh HTTP action and stale core filtering in latest/history.
11. Rendered disclosure, explicit grant control and unknown paper PnL/cost semantics.

Final verification:

| Check | Observed result |
| --- | --- |
| Targeted wallet/client/render tests | 11 pass, 0 fail, 37 expectations |
| Full web regression, `bun --no-env-file run test` | 574 pass, 0 fail, 42 files, 6.50 seconds, exit 0 |
| `bun --no-env-file run typecheck` | `tsc --noEmit`, exit 0 |

The full suite ran through the configured RTK + Headroom adapter. Bun is not allowlisted, so the adapter passed output through; this establishes no compression or performance gain. Exact capture and hashes:

| Evidence file | SHA-256 |
| --- | --- |
| `C:/Users/gabri/.codex/tmp/okx-real-ui-evidence-01a12b5f/web-tests-final.log` | `EC1BEC5551C645DFDF1A3FA7419B13BE822ABE6AD46F3A822B734257C1F802F8` |
| `C:/Users/gabri/.codex/tmp/okx-real-ui-evidence-01a12b5f/typecheck-final.log` | `5A3973F79ED9BECD5F23C4FEFF467513814DE7EA381D75A4D2E339AA8B8EDCA9` |

Adapter metrics: `C:/Users/gabri/.codex/rtk-headroom-wallet-ui-01a12b5f-final.json`. Raw stdout digest: `8f1f9ef732ba33469e276c899b9b5d0241bc0982ae2572cdd765fa558b4f25b8`; raw stderr digest: `19f0dccf042317ddcbb64f6c579eaf495d65118ef9e0eaa679761d069d6182d0`.

## Candidate source hashes

| File | SHA-256 |
| --- | --- |
| `web/src/lib/useOkxWallet.ts` | `276217E07D3EE939C3CC4BBFA87082FC3B35F764FC39E0A8106F1EADEA30FC7F` |
| `web/src/lib/wallet-store.ts` | `AFEBE3979635879F115A9D7A340EFD77B46E68DD2487B54ED2E344C8BCD1C7E1` |
| `web/src/lib/wallet-store.test.ts` | `6957B4A085EE0BDF68130AF82A5E11D1EB3E00FE33D61D0FAE73654601CA239B` |
| `web/src/lib/real-pipeline.ts` | `D54C236DDA656FC9F13DE099DFD915A77EAAF8A84589366725F1314E629FF438` |
| `web/src/lib/real-pipeline.test.ts` | `BE2BEBDA186AF3DCA444D726286A9AFB8B1CF5CA26264CC2037064867A5DBD0E` |
| `web/src/lib/real-pipeline-render.test.tsx` | `0C7D2815A54357A47021742D2A4D78E1BAEAE36E144CBE13CC153EF880796CFA` |
| `web/src/components/RealPipeline/RealPipeline.tsx` | `A593028CDA5B90CB1BF92DF3CF0C4F3DE9C77574974C71FC870F6777BCC0497C` |
| `web/src/components/RealPipeline/RealPipelineView.tsx` | `B61E4C250762B358BA3FC0A05EDCCDC12A076D7ECAE8F45DD4586E919D913E0C` |
| `web/src/components/RealPipeline/RealPipeline.module.css` | `4565A0F358EF21EB93B769C7D39746EEF6B9E8AE40C1E8C8161723D1AD043F79` |

## Required remaining integration evidence

The integrator must exercise the mounted component with the real backend contract and independently review this fixed candidate. Browser checks are required at 1440×900, 390×844 and 360×800, including keyboard focus, overflow, reduced motion, visible failures, consent/revoke, delayed replies and account/network invalidation. CSS and local render tests support these behaviors but do not establish that visual evidence.

No live OKX provider or real wallet was exercised by this worker. Provider access, actual source freshness, market/quote qualification, live Jev decision/cost and durable backend behavior require their own matching execution receipts. Build and page integration belong to the integrator. Test fixtures are deterministic seam tests, not production-network evidence.
