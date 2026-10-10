# OKX Read-only Integration Implementation Plan

> **For agentic workers:** Use the authorized isolated harness implementation and independent review workflow. Execute one public behavior per TDD cycle. No staging or commits are authorized.

**Goal:** Connect the locally installed OKX Web3 provider for exact Monad balances without enabling trading.

**Architecture:** A browser-only session owns provider requests/events and publishes immutable snapshots. Discovery uses documented `window.okxwallet` as its anchor; EIP-6963 cannot establish identity through metadata. A React hook/panel consumes the session without sending wallet data to the backend.

**Tech Stack:** Bun 1.3.14, TypeScript, Next 16.3.4, React 19.2.8, EIP-1193, EIP-6963; no new dependencies.

**Spec:** `docs/OKX-SPEC.md`, immutable O1-O8. Sources/research and baseline manifest travel with the copy.

## Global constraints

- Only explicit account authorization, reads and explicit `wallet_switchEthereumChain` for Monad `0x8f`.
- No orders, signatures, approval, transfer, API secrets, seed/private key, address persistence or backend wallet data.
- USDC `0x754704Bc059F8C67012fEd69BC8A327a5aafb603`, decimals 6; MON decimals 18. No Number money conversion. ES2017 target requires BigInt constructors rather than bigint literals.
- Invalid/partial responses and timeout produce unavailable balances; account/network events invalidate stale responses. No automatic retries or authorization prompts.
- Integrator alone edits existing files. Isolated implementer owns five new files, not alone in the codebase and must preserve other changes.
- Synthetic evidence is explicitly identified. Real wallet/native balances and profit remain unqualified.

## Review focus

- Non-OKX EIP-6963 announcement with plausible name/rdns must not be selected; discovery test.
- Extension may return an empty account list or malformed chainId; session tests must clear all prior balances.
- Accounts/network can change while balance RPC is pending; delayed old result must never reappear.
- Unknown-chain rejection during explicit switch must leave a manual guidance path, not add/switch automatically.
- Frontend can connect while backend is absent; UI must still show read-only limits and must never imply R$400 is onchain.

## Task 1: Public session and discovery (isolated implementer)

Files: create `web/src/lib/okx-wallet.ts` and `web/src/lib/okx-wallet.test.ts`.

Interfaces: export `Eip1193Provider` (`request`, `on`, `removeListener`), `createWalletSession(provider, {timeoutMs?})`, `discoverOkxProvider(surface, onProvider)` returning cleanup. Session exposes `getSnapshot()`, `subscribe(listener)` returning unsubscribe, `connect()`, `refresh()`, `switchToMonad()` returning Promise<void>, `disconnect()` and `dispose()`. Snapshot contains `status`, `account`, `chainId`, `balances` (MON/USDC decimal strings and block hex, or null), and `error`; exact statuses may be exported as a union but consumers never infer successful balances from account alone.

- [ ] Test discovery causes zero account RPC and rejects a metadata-only impostor. Run `bun test src/lib/okx-wallet.test.ts`, observe red; implement anchor/discovery cleanup, observe green.
- [ ] Test `connect()` prompts only on invocation and handles rejection/empty/invalid account; implement minimal session and rerun.
- [ ] Test wrong chain suppresses all balance reads and explicit switch rechecks chain; implement and rerun.
- [ ] Test MON/USDC balances share a block tag, including a value beyond safe Number precision. Assert exact decimal strings, correct contract and `balanceOf` encoding. Implement and rerun.
- [ ] Test invalid RPC values/timeout yield null balances and a readable error; implement and rerun.
- [ ] Test pending old balance resolution after accountsChanged/chainChanged/disconnect/local disconnect/dispose. Assert old results never publish, listeners detach and refresh does not prompt. Implement and rerun.
- [ ] Return source files, actual red/green log and read-only method coverage. No commits.

## Task 2: Hook and panel (same isolated owner)

Files: create `web/src/lib/useOkxWallet.ts`, `web/src/components/WalletPanel/WalletPanel.tsx`, and `WalletPanel.module.css`.

Consumes Task 1 session/snapshot/discovery. Produces default-exported `<WalletPanel />`, no props or backend access. Hook subscribes only after mount; cleans up discovery and session on unmount/provider replacement.

- [ ] Add explicit Connect OKX, refresh, local disconnect and wrong-network switch actions. Show missing-extension guidance, current account/network, exact MON/USDC and errors without raw provider messages/HTML.
- [ ] Show this is Web3 read-only; connected wallet does not enable the robot. Explain Pix belongs to exchange account and mobile-only wallet needs a supported browser provider. Use keyboard-accessible buttons and status text.
- [ ] Run `bunx --no-install tsc --noEmit` in `web` and wallet tests. Respect bundled Next guides and existing warm-neutral CSS. No new animations.

## Task 3: Local integration and research (root integrator)

Files: modify `web/src/app/page.tsx`, `web/src/app/page.module.css` if needed, `web/package.json`, README and `docs/OPERACAO-BRASIL.md`; create `web/.env.example`, `docs/OKX-INVESTIGACAO.md` and verification evidence.

- [ ] Import panel into left column above chart. Default feed `http://127.0.0.1:3000`; dev/start use port 3001, add wallet test/typecheck scripts. Public env example contains no secrets.
- [ ] Document official Pix/Web3, network assets, spot/demo/perps/margin routes, eligibility/costs, +900% target and qualification dependencies. Fix stale Jev key statement by linking verified Windows report.
- [ ] Run frontend tests/typecheck/build and root tests/typecheck. Verify desktop/mobile and missing-provider/rejection/wrong-network/connected/disconnect states via a clearly synthetic fixture or manual UI. Do not interact with actual money.

## Task 4: Independent verification and audit

- [ ] Freeze candidate hashes, copy without ignored credentials into independent workspace. Reviewer receives current baseline and immutable SPEC, runs tests/typechecks and covers O1-O8 with exact references. Do not approve own implementation.
- [ ] Fix evidence-backed findings using regression red/green; request focused re-review. Preserve acceptance and archived histories.
- [ ] Record coverage, limitations, own-conversation checkpoint and next eligible dependency. Do not claim native wallet activation, live execution or profit from synthetic tests.
