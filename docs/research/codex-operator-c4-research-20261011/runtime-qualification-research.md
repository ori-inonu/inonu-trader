# Runtime qualification research — independent, advisory

Date: 2026-10-11. Integrator root: `C:/Users/gabri/.codex/worktrees/inonu-system-one-safety/jev-trader`; observed HEAD `ff37327264d904242c57c21c8acb548a05651e82`. Tracked status was clean on initial and final source checks; all 52 source hashes below matched rereads. Output root: `C:/Users/gabri/.codex/worktrees/inonu-operator-c4-research-20261011`, an ordinary isolated copy, not an independently observed Git checkout.

**Finding:** no existing complete backend/frontend startup command is qualified by this research as incapable of signing, spending funds or invoking paid inference. Therefore none is recommended or executed. Static dry-run safeguards are real; they are not evidence of a successful isolated runtime or browser integration.

## Scope, identity and authority

Own conversation: `01a12adc-473d-7381-b067-c83af7ccda31`; session: `01a12971-f941-7e42-8a42-fab6d44d4eb5`. Requested GPT-6.1 Sol/xhigh; effective model, effort and tier are **unknown**. Harness skill was read; own read-only SDD state/next returned revision 0, research/idle, without an objective or checkpoint. This metadata neither replaces the user's objective nor grants approval. No goals were created or changed.

Only exact-source reads, hashes, tracked Git status, installed manifests and runtime version commands were used. No application, tests, feed, account/provider request, wallet action, inference, installation or network consultation ran; no .env, credentials or home inventory were read. The OS sandbox is unrestricted: isolation here rests on explicit paths and command discipline, not enforced read-only permissions. No auxiliaries were spawned. Jev receipt `c1cdbe99` abstained at .4; it supplies neither permission nor an accepted technical choice. Other advisory notifications do not alter authorization.

## Actual runtime boundaries

All references below are relative to the exact integrator root above.

| Path:lines | Observed contract | Qualification consequence |
|---|---|---|
| `src/config.ts:14-24,53-54,71` | Defaults are MODEL=mock, DRY_RUN=true; Jev requires a key even in dry-run. Model ID defaults to `jev-latest`; .042 USD/MTok is a configured estimate. Configuration is loaded from process.env at import. | Dry-run is not a paid-inference prohibition. Credentials, inherited configuration, entitlement and invoice cost were not inspected. |
| `src/index.ts:12-18,43-46` | Market.init completes before HTTP starts; trade and block feeds then attach. | Backend startup depends on RPC initialization; no HTTP-only startup seam was found in the bounded src/scripts search. |
| `src/market.ts:84-109,153-159,222-240,320-350` | Dry-run creates no wallet; init throws “Live execution is not qualified” before its RPC calls when a wallet exists. Dry-run send returns sim before signing. Other branches contain signTransaction, sendRawTransaction, approval and deposit. | These guards must remain. A general application invocation is not a proof that the safe branch/configuration was selected. |
| `src/chain.ts:4-12,21-43`; `src/book.ts:70-91`; `src/trades.ts:90` | HTTP POST JSON-RPC reads; block polling defaults to 150 ms or optional newHeads subscription; book uses eth_call and trades use eth_getLogs. | POST does not itself mean trading. These still produce external traffic; RPC pricing, connectivity and shutdown behavior are unqualified. |
| `src/model.ts:70-86,92-119`; `src/trader.ts:109-119,148-170,266-302,642-644` | Jev executes experimental_evaluate; mock is local. Trader persists journal/events and labels paper data real-market-paper. Missing inference usage remains unknown; estimated cost is explicitly not an invoice. | Mock decision logic is not a real Jev evaluation, and paper execution is not read-only filesystem operation. No paid-provider behavior was exercised. |
| `src/system-one/readings.ts:119-148`; `scripts/system-one.ts:80-107` | Public market mode uses injected keyless mark/funding/candle reads; default CLI uses synthetic readings; --jev selects a real model. | Public market data, configured capital and synthetic data are separate sources. The offline generator is not a full runtime solution or qualification substitute. |
| `scripts/okx-operator.ts:156-190,199-212`; `src/onchainos/http.ts:119-120,543-546` | --live constructs authenticated portfolio/trade clients; signer creation additionally requires liveGate and ledgerReady. OKX request authentication uses HMAC signatures. --jev selects inference. | Authenticated read signatures differ from blockchain transaction signatures, but both are outside this task. --live is not a harmless public-read flag; fees/quotas are unknown. |

Root `package.json:21-44` does not suppress Bun environment files for the normal application or operator startup scripts; its test/System One scripts do. Suppression alone would not clear inherited process variables. Installed Next itself calls `loadEnvConfig` (`web/node_modules/next/dist/server/config.js:1404`), independently of Bun. No clean-environment startup proof exists.

## API/UI evidence and concrete gaps

Current `src/server.ts:14-49` wires both operator and System One handlers, unlike the older diagnosis `docs/LOCALHOST-INTEGRATION-DIAGNOSIS-20261010.md:20`. That historical routing gap is superseded; a current successful runtime is not established. Bun.serve has no explicit hostname here. Read origins default to localhost/127.0.0.1:3001; read tokens are optional configuration.

`src/operator/http.ts:29-75` enforces GET/token/origin rules, bounded journal reads, but returns the parsed state without the System One projection contract. `src/system-one/http.ts:15-44` validates origin/token, limits the file to 2 MB, projects the public schema and closes its descriptor in finally. Missing cycle yields 404, malformed data 500; `src/system-one/public-view.ts:22-62` preserves rejection/source semantics. Root snapshot/history/SSE use a separate wildcard CORS contract (`src/server.ts:10,45-49`).

The frontend consumes NEXT_PUBLIC_API_URL, defaulting to http://127.0.0.1:3000 (`web/src/app/page.tsx:29,42-44`). Its package uses port 3001; Next config has no API proxy/rewrite. A blank origin is not rejected centrally. The operator and System One fetches supply no Authorization header (`web/src/lib/operator-center.ts:82-109`; `web/src/lib/system-one.ts:195-209`): a configured read token currently prevents those direct browser reads. Do not resolve this by embedding a secret in NEXT_PUBLIC configuration or weakening authentication.

Three truthful-status gaps deserve priority:

1. `web/src/lib/useFeed.ts:243-288` marks transport live on open/ping; ping can keep the transport alive without fresh market blocks. Server metadata (`src/server.ts:8`; `src/index.ts:18-20`) lacks a data-source/freshness contract. `web/src/lib/presentation.ts:33-59` correctly distinguishes unverified execution/source, but transport liveness alone is insufficient.
2. `web/src/lib/operator-center.ts:88-125` retains ready after a failed fetch if a previous cycle exists; overlapping/late requests lack the System One generation/disposal protection. Its shallow parser (`web/src/lib/operator-feed.ts:54-57`) does not validate the full render contract. DecisionCenter can keep its green dot while separately showing an error (`web/src/components/DecisionCenter/DecisionCenter.tsx:155-180`). The System One loader already provides a reusable single-flight/abort/disposal seam (`web/src/lib/system-one.ts:188-224`).
3. Static page description literally claims “Execucao real no livro on-chain da Kuru.” (`web/src/app/layout.tsx:19-22`). DecisionCenter's absent-state instructions recommend --live --jev --loop (`DecisionCenter.tsx:172`), combining authenticated reads and possible paid inference without conveying these boundaries. The System One UI already labels synthetic/configured wallet data, mock decisions, stale/error cycles and rejected-choice fallback (`web/src/components/SystemOne/SystemOne.tsx:136-186`).

Wallet hooks discover/subscribe at mount rather than invoking connect (`web/src/lib/useOkxWallet.ts:32-70`; `web/src/lib/useOkxSolana.ts:17-52`). EVM connect requests accounts; switching changes wallet chain (`web/src/lib/okx-wallet.ts:576,635-637,687`). Multichain RPC reads follow an explicit callback (`web/src/components/MultichainPanel/MultichainPanel.tsx:124-141`). No wallet or extension runtime was tested.

## Dependencies and unavailable evidence

Observed runtimes: Node v26.9.0 at C:/Program Files/nodejs/node.exe; Bun 1.3.14 at C:/Users/gabri/.bun/bin/bun.exe. Installed manifests show ethers 5.8.0, Kuru SDK 0.0.95, ai 7.0.103, @ai-sdk/typesafe-ai 3.0.0, Next 16.3.4, React/ReactDOM 19.2.8; TypeScript 7.0.2 at root and 5.9.3 in web. No inspected package was missing. web/.next/BUILD_ID exists; its freshness/content and runnable build were not inspected.

Unavailable: current RPC availability/quota/cost; provider plans; extension/session state; actual read-token/origin configuration; current reconciled public cycles; clean startup logs; mounted browser/desktop/mobile behavior; independent runtime receipts. SDK getMarketParams uses a provider Contract, not a passed signer (`node_modules/@kuru-labs/kuru-sdk/dist/market/marketParams.js:18-20`); this is not a complete dependency side-effect audit.

The old missing absolute receipt-checkout claim (`docs/LIVE-QUALIFICATION.md:32,359`) is also superseded in current test source: `src/market.receipt.test.ts:3-13` and `src/trader.receipt.test.ts:9-16` require RECEIPT_SAFETY_SOURCE and otherwise skip. That optional checkout/dependencies were not inspected; skipped tests cannot establish receipt-safety integration.

## Proposed next contract — advice, not implementation approval

Frozen C1–C6 and S1–S5 remain unchanged (`docs/CENTRAL-JEV-REVIEW-FIX-SPEC.md:4`). C6 requires integrated local serving/inspection; the acceptance document literally prohibits “status de execução inventado” (`docs/CENTRAL-JEV-ACCEPTANCE.md:7-18`). R1/R2/R6/R8 (`docs/READINESS-SPEC.md:10-17`), M1–M4 (`docs/OPERATOR-MODEL-BOUNDARY-SPEC.md:15-18`) and the exposure ceiling (`docs/SYSTEM-ONE-EXPOSURE-SPEC.md:9-13`) cannot be relaxed.

Candidate independent acceptance, to freeze against the next exact source hashes before implementation:

- Q1: An explicit local read-only runtime profile uses allowlisted process configuration, prevents environment-file loading, binds loopback and cannot construct transaction signers, deposits, broadcasts, authenticated OKX transports or paid models. Prove exclusions at public seams and in an isolated process; a label/config default is insufficient.
- Q2: Real existing handlers expose only validated public records. Absence, malformed data, unknown costs and configured capital remain absent/error/unknown/configured. State the execution mode, actual model, source, observation/completion timestamps and upstream health separately from HTTP/SSE connection.
- Q3: Validate/canonicalize API origin; test both allowed origins and rejected/missing/blank/mismatched origins. Preserve read-token enforcement through a reviewed server-side bridge or an explicitly approved local deployment contract, never a browser-bundled secret.
- Q4: Both cycle loaders prevent overlap, time out, reject malformed responses, discard previous-origin/late responses and clear absent cycles. Errors/staleness cannot retain a healthy indicator. Rejected hold must never display an accepted model weight or a real Jev consultation.
- Q5: Independently test backend unavailable, 404, 401/403, invalid/oversized cycle, stale cycle, empty snapshot with ongoing SSE ping, reconnect, origin change and delayed response. Check labels/accessibility on desktop/mobile, keyboard and reduced motion. Controlled fixtures qualify logic only.
- Q6: After runtime/public-read authorization, demonstrate an actual validated source → current handler → mounted UI path with timestamp/hash evidence, complete transport/error states and no prohibited calls. An HTTP 200, synthetic generator, old screenshot or mock model does not satisfy the full native central JEV integration.

Minimal existing test seams: loadConfig (`src/config.test.ts:4-19`), mocked provider evaluation/unknown usage (`src/model-adapter.test.ts:5-38`), injected HTTP filesystem/auth handlers (`src/operator/http.test.ts:13-53`; `src/system-one/http-readiness.test.ts:14-59`), clean allowlisted CLI subprocess pattern (`scripts/system-one.test.ts:8-34`), single-flight/disposed loader (`web/src/lib/system-one-poll.test.ts:4-28`). Current useFeed tests validate metadata, and operator-center tests cover parsing/ranking/rendering rather than mounted polling (`web/src/lib/useFeed.test.ts:4-40`; `web/src/lib/operator-center.test.ts:35-100`). None was run here. A future TDD cycle must first show meaningful failing behavior; this report does not certify its own proposed acceptance.

Real alternatives: a local reader serving actual existing public records is the smallest no-provider qualification step, but leaves market/feed integration incomplete; an explicitly isolated mock/paper runtime exercises real public-market transport, but needs bounded outbound authorization and does not qualify Jev inference; full real-Jev integration requires separate entitlement/spend evidence and remains outside this research. No alternative is approved here.

Future writers could own new runtime-profile/entrypoint and regression-test files exclusively after a frozen SPEC. Integrator alone should edit shared index/config/server, API clients and page/status components; these are concurrency hotspots. A source change after the recorded hashes requires renewed review, not an automatic patch/rebase. No implementation, review approval, qualification or profitability claim is issued. The broad goal remains incomplete.

## Exact SHA-256 source manifest

Paths resolve only under the integrator root declared above. These are read evidence, not private runtime-state exports.

| Source path | SHA-256 |
|---|---|
| `package.json` | `f20dcbb49539fc32e0de83bb0ad9abd5b10c3425519e3ab5241b15a84ec634c6` |
| `src/index.ts` | `7275a80b361e5d9a9700a4196518cc3d64d2244bfa7e23b25052a3e73336ecfa` |
| `src/config.ts` | `8383abb4a2e6a3bf913dcd12b809c1ad5ad2e5e765b97de78f2aba09242154d5` |
| `src/market.ts` | `0635221348c1acda1ed277c0f5ef69eb37c0d74063e5c34a8fa1dd4161ebffe7` |
| `src/model.ts` | `2c076f42e33261619a7e791479fe9200ed6865213406314344ea0772a657185d` |
| `src/server.ts` | `0fb67e5b65f58ad6ebcad5157d1b8daa75df59a794dfa458f77ae2d375f0678d` |
| `src/chain.ts` | `b94a062562b5b6b018fb58c8f9987681e2bbaf8437b7abae0e514b175da22cb5` |
| `src/trader.ts` | `a2ec56b8be8ff1046222248e098da495885cea903e49e34665b0137a9bd751be` |
| `src/book.ts` | `3c737c7a51d208296d6d4542a49b69cb4f45d17c4637e122099f28514c1834c5` |
| `src/trades.ts` | `1ff0dfd30c7f7bdaaa59569957eec6870c5aa2aaf37c824c24101d5f657cc962` |
| `src/operator/http.ts` | `d392a77915fc48448d76ccc608ba4f57d7069fc0ba67c0820feaba3ed55d6cd1` |
| `src/system-one/http.ts` | `2dd44642babda63e0a41d935d329afdb07ed5d1578a0f68688291ef150cc5e85` |
| `src/system-one/public-view.ts` | `62b3682bef7325798f3dcb40bab00609026cb07f4dd57b87485daf90b88f312c` |
| `src/system-one/readings.ts` | `d7e656126a64339fef09a6c72b0240c80c13313f8dcb4b4c5cf228c1dee9c667` |
| `src/onchainos/http.ts` | `24ceb40932010edaf189a228313feca214afac3faae13ffd2d435a3b0e23b3f4` |
| `scripts/system-one.ts` | `dd64a9c7375d8839eb7957d007aa151f97eb06765ee12a3d89f7206c57fbdbd4` |
| `scripts/okx-operator.ts` | `b7ccf4b784d87df3306e04da79eaae648f8db06abf60843d4e04322fd00103ef` |
| `web/AGENTS.md` | `ec1b6e023814ae1a510b02ea62229e5eb035d75e39e3335d5ea7f5ce5654d567` |
| `web/package.json` | `947d9a16e9b95b9f094bf97d09c834e68e988011bad0bdbf9e76c3e1bb7cec40` |
| `web/next.config.ts` | `32593a30fead04d7bfb42a6aab567c70e691985b83a72859a596e326e09d04b4` |
| `web/src/app/page.tsx` | `d60c2ca7f4e3fb4a483478ee3b69fd4c33aa59ef456af6324022726f531ac12d` |
| `web/src/app/layout.tsx` | `150b4e1b84ae6edd658c24f35e874318ad3b4e97de4fa57c579f758913e7a4f8` |
| `web/src/lib/useFeed.ts` | `7a71639374b68f4192a9b31bb58e3164bbe12f051299bd00695bdd779d465328` |
| `web/src/lib/system-one.ts` | `0d351804f7bef1f607d1c546d189e0f642d8dd0a2b99b9793f40062f3aaa5a96` |
| `web/src/lib/operator-feed.ts` | `1586b04e3b05052a6338bce2e83fc0a63c9932a60cfe0e97f365c7eda94af56b` |
| `web/src/lib/operator-center.ts` | `1b446f8f865586e245af59b3ad859b2d43f0bcda0b524ace30ba3f3f874e1336` |
| `web/src/lib/presentation.ts` | `1560d361d0af3b3e092a33cf1d238adc07b5ad91d288a6d9df760ed7a926b339` |
| `web/src/lib/useOkxWallet.ts` | `65d589b2f624ff4f04b651ce516f2f4f1bb306e4f9aa9d34ebc292b7383c7f7d` |
| `web/src/lib/useOkxSolana.ts` | `bad3d8533bce348b91052f193ff5c6bd2c74c04453fb05fbe7ee8dcb1ddb50ec` |
| `web/src/lib/okx-wallet.ts` | `5f37cd832c52b3f4eab6f813acaeddee3dc4f823b4bfefbdab3d31f2a1f20e2f` |
| `web/src/components/DecisionCenter/DecisionCenter.tsx` | `67c730bd7f67c76a5bd5c5ea5a240c204108b4258d0baa5a385d18eff79d1171` |
| `web/src/components/SystemOne/SystemOne.tsx` | `1cfee5317750316083a99b71b89dab592872792d7bee124baf36ec7e170488e2` |
| `web/src/components/MultichainPanel/MultichainPanel.tsx` | `73d61b0e559cb62596baaeed2e22c6e97509725af04ff7fc95229f5278d948b6` |
| `src/config.test.ts` | `170648c1eff4d9af2289321a8b3881b0ecba628c52f59d7e0200c55385df5847` |
| `src/model-adapter.test.ts` | `cd4d88576e04c887e90353d08868a08655ac0bac03dacd565d828e1db6f63ed1` |
| `src/operator/http.test.ts` | `bec004209159966458fbebb7287b20451efd4f6e74b8a3e8ad043e5040063215` |
| `src/system-one/http-readiness.test.ts` | `28bfb4d110e4126b547111dd3eca94bef3002775962058941c90bc0721d77773` |
| `scripts/system-one.test.ts` | `03faa32d86667a11dc5aac90eb3a8d1eec63d96e015b85415bc08b6c16b60be6` |
| `web/src/lib/useFeed.test.ts` | `c71338c3adf34b20dbf191a742364ded62ded45516d7db255c516e2a6d24cc4b` |
| `web/src/lib/operator-center.test.ts` | `aafee29d90aa584334125cb56ef84a173a96047e81201fcde603f063886987d7` |
| `web/src/lib/system-one-poll.test.ts` | `8abf48eed408313c14a5ee1192220f0cd5b47afe8c15b11d3fd06f94ac49b4f5` |
| `src/market.receipt.test.ts` | `195e45703516dfbaf992d16a59e6e1f30a22d6c59dbbb79e38c008cf019c2357` |
| `src/trader.receipt.test.ts` | `9416870c75f41b073083f2d3eb73f05df8e03171acd660e2af0b065f5c84a782` |
| `docs/CENTRAL-JEV-ACCEPTANCE.md` | `90af0c3fc5db11e44e953069414c4addd3385d561982cc7a658b2c9dab1cdbaa` |
| `docs/CENTRAL-JEV-REVIEW-FIX-SPEC.md` | `7295bc0ddb4e2aa59433fa80b02f5831ce74c2db512a4e94226b2291c156841c` |
| `docs/READINESS-SPEC.md` | `0983bdadc494e50038ac2ab21caec6c539af03c07bdfe9e019308723b711ba78` |
| `docs/OPERATOR-MODEL-BOUNDARY-SPEC.md` | `7cd7c31a2e9af8d04e807aaf63faa26ef90af2f1c99881f33a04f21c6cf0f701` |
| `docs/SYSTEM-ONE-EXPOSURE-SPEC.md` | `5dfe24aa2de2ab2a7ed55cbe96509a6214ade3acf96603e170d20ae2bf92ad54` |
| `docs/LOCALHOST-INTEGRATION-DIAGNOSIS-20261010.md` | `5939750a36db4ec61f87865bf66ec68efa3b088722c4b314004413fafb6544d9` |
| `docs/LIVE-QUALIFICATION.md` | `90775aa469b370de2213607b02de71a5dd73142507aab344296aa8cb889e008a` |
| `web/node_modules/next/dist/server/config.js` | `6440d483228c8a856cd4040a28b4b57efcbb270133fedec716a0001312ecbb05` |
| `node_modules/@kuru-labs/kuru-sdk/dist/market/marketParams.js` | `6beabf0e873b20559398d8a2e4aefe71d08511484db03d12cb6aa40ccff5a1fa` |
| `node_modules/ethers/package.json` | `d22d04ecd8c6a6a0faf019db35732c403d121d176e05b0fcd0c7658a5ea7b7f0` |
| `node_modules/@kuru-labs/kuru-sdk/package.json` | `78b43cf434b25cd3bfb2087355c08c625858a2a617b707b92e076e52f6fb70cb` |
| `node_modules/ai/package.json` | `e591d6528643fb53a0ad765ac0447bba43a85f30cb9244f621528e87463c42b0` |
| `node_modules/@ai-sdk/typesafe-ai/package.json` | `2f34fe347d4ee545634d52aed1b5d7b92222cc84ca7689930db7f6861457f6c8` |
| `web/node_modules/next/package.json` | `c4ef8a1c8da320a162485f96d35df7745da90e6becc36882d6e81be9df66eec1` |
| `web/node_modules/react/package.json` | `e40c3ed9b633c9ecf188e09a4be309780a1ea0a9c068278a30ff6a27e7b2dbb6` |
| `web/node_modules/react-dom/package.json` | `7c82f0967114d4b5d38b1f07e543af87c9919e8d3243f9604004819319cb2200` |
| `node_modules/typescript/package.json` | `3722b30210616a13a3213ded11575ba6b2dbab10c32a5ef67afca8513e27017e` |
| `web/node_modules/typescript/package.json` | `822ef7ca6452205657b6288b066481ecf508bfbf43455d715cf7d3ec457561e6` |

