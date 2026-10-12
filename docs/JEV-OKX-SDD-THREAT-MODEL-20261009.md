# SDD / Threat Model — JEV + OKX

**Status:** design-only; prepared 2026-10-09. **No account, key, wallet, or repository changes.**  
**Decision owner:** user / project maintainer. Implementation has not been dispatched.  
**Evidence boundary:** official OKX and TypeSafe documentation plus one bounded JEV Choice call. This is not a code audit, legal opinion, or trading recommendation.

## 1. Decision record

### Finite decision

What execution boundary should a future JEV integration use for OKX centralized-exchange (CEX) order-book activity, given that the exact key permissions and contracting entity are not verified?

### Jev Workflows Choice result

A single bounded Choice request was run through `hermes jev evaluate` on 2026-10-09. It contained only a summary of public documentation and design constraints—no credentials, balances, personal data, repository content, or account state.

- `ok: true`; model `jev-1.13.0`
- Choice: `readonly_until_scope_verified`
- Confidence: `0.81`; probability distribution: read-only `0.86`, brokered trade subaccount `0.14`, on-chain Agentic Wallet `0.00`, direct model key `0.00`; provider output marked `threshold_calibrated: false`
- `advisory_only: true`; `execution_authorized: false`

This is the recorded architecture choice for the current state: **read-only/public data only; no live orders until all gates in §10 pass.** A brokered trading subaccount is a conditional future candidate, not a current authorization. JEV’s score is a bounded model judgment, not proof that a design is safe or permission to execute; its confidence is not a calibrated probability of security correctness.

### Selected target if a later live-trading decision is approved

Use a deterministic execution broker between JEV and OKX. Keep the OKX credential outside JEV and any general-purpose LLM. The broker accepts only a narrow, typed order intent after deterministic policy checks, signs the permitted request, and connects from a fixed, allowlisted egress IP to a dedicated standard subaccount. No withdrawal permission. No master-account credential. No direct model-generated endpoint, URL, request body, account setting, or wallet signature.

This target remains **blocked** until the exact account/entity permission matrix proves the proposed scope can be constrained. OKX’s US FAQ and global API guide describe Trade permissions differently; see §4.

## 2. Scope, assumptions, and non-goals

### In scope

- Threats to a JEV-mediated automation path for OKX CEX order-book trading.
- API-key scope and IP binding, account/subaccount separation, withdrawal controls, order retries/idempotency, kill switch, key lifecycle, incident response, and documented OKX wallet-signing alternatives.
- A future SDD acceptance-test outline.

### Assumed design—not verified implementation

The proposed flow is: public/approved data → JEV returns a typed advisory judgment → deterministic policy gate → execution broker/signing boundary → OKX private API → order-state reconciliation and audit. The user’s actual repository, running services, account entity, account mode, key scopes, network topology, and logs were not inspected. Do not treat this diagram as a description of the current code.

### Explicitly out of scope

- Creating, editing, testing, or revoking OKX keys; changing account settings, subaccounts, withdrawal addresses, allowlists, or limits.
- Wallet creation/import, seed phrase or key handling, signing, transfers, withdrawals, orders, or other trades.
- Choosing a strategy, instruments, numeric risk budgets, leverage, or position sizing.
- Code changes, deployment, legal/regulatory determination, or proof of production readiness.

## 3. Target data flow and trust boundaries

```text
Untrusted market/news/tool inputs
              │ filtered, labeled, minimized
              ▼
      JEV / model provider
   (typed advisory output only;
    no exchange credentials)
              │ untrusted intent
              ▼
 Deterministic policy gate ───────► append-only, redacted audit
 (schema, freshness, allowlists,               │
  exposure and rate limits)                    │
              │ approved intent                 │
              ▼                                 │
 Execution broker + secret vault/HSM            │
 (fixed egress; endpoint allowlist;             │
  HMAC signing; idempotency ledger)             │
              │                                 │
              ▼                                 │
     OKX private CEX API ── order events/status ┘
              │
              ▼
 Dedicated standard subaccount; minimal funded balance

Human operator: account setup, key/permission review, withdrawal allowlist,
incident stop/revocation, and any account-security or terms changes.
Separate on-chain wallet path: not part of the CEX API signing path.
```

**TB-1 — untrusted input → JEV:** market text, news, external tools, and retrieved documents may carry prompt injection, stale data, or adversarial instructions.  
**TB-2 — JEV → policy gate:** a typed Choice/Score is still an untrusted proposal; it is not an authorization or a complete order.  
**TB-3 — policy gate → signing broker:** only a validated schema crosses this seam; the model cannot call arbitrary URLs or endpoints.  
**TB-4 — broker → OKX:** the broker holds the credential and can move value through any permission the key exposes; static IP binding and endpoint filtering reduce, but do not eliminate, compromise risk.  
**TB-5 — subaccount → main account/withdrawal:** standard subaccounts cannot withdraw externally, but a `Transfer`-privileged subaccount API key can transfer to the master account. The parent account can then withdraw. Do not treat the subaccount alone as a withdrawal barrier; deny Transfer and keep parent-account withdrawal controls human-owned.  
**TB-6 — CEX API → wallet/on-chain:** exchange API request signing and Web3 transaction signing are distinct systems. Do not conflate their keys, policies, or recovery paths.  
**TB-7 — JEV provider and logs:** only the minimum state needed for a judgment should leave the application. Secrets, raw signing material, and unnecessary personal/account data must not enter model prompts or logs.

## 4. Minimum permissions and account boundaries

### Current fail-closed posture

1. Allow public market-data and, only if needed, read-only account queries. No live trading credential is currently authorized by this document.
2. Do not attach the main-account API key to JEV, an LLM, a notebook, a desktop tool, or an untrusted execution host.
3. Do not grant `Withdraw`. Do not grant `Transfer`, `Loan`, or `Earn` when the account’s UI exposes them separately. Do not delegate key creation, key editing, whitelist editing, 2FA, KYC, terms acceptance, or further delegation to the agent.
4. If a dedicated, non-withdrawal trading scope cannot be demonstrated in the exact account/entity UI, retain read-only mode.

### Permission-documentation conflict — hard gate

The current US API FAQ lists basic `Read`, `Trade` (sending/canceling orders), and `Withdraw` scopes. A current EEA FAQ additionally describes `Transfer`, `Loan`, and `Earn` permissions. The global V5 guide overview describes Trade more broadly, including funding transfers and account settings, while the dedicated transfer API documents subaccount-to-master routes and transfer-out permission. These official descriptions vary by regional FAQ and API surface; this is a hard gate, not a safe assumption. Before any live design is approved, the maintainer must verify the actual current permission UI and permission record for the exact OKX contracting entity and subaccount. Do not infer “orders only” from a label, and do not reuse a key with grants that have not been rechecked.

Even if the key’s exchange-side permission is broader, the broker must allow only the exact required order/query/cancel endpoints and reject internal transfers, withdrawals, account settings, borrowing, Earn, key management, and all unneeded products. If the broker cannot enforce this at the network/API seam, do not deploy live automation.

### Account and product boundary

- Candidate account: one dedicated **standard subaccount** per bot/strategy, not the main account. Use it only for blast-radius/accounting separation, never to bypass jurisdiction, product, rate, or account restrictions. Fund only the agreed limited amount through a human-controlled main-account process.
- OKX’s US docs say standard-subaccount funds cannot be withdrawn directly; they must first be transferred to the main account. Separately, the global transfer API documents a subaccount-to-master transfer route that can move funds internally when the corresponding transfer permission is present. Therefore, a subaccount is not complete containment if the bot key can transfer internally; no Transfer capability is a hard gate.
- Account mode is a human-selected, pre-use control and the US FAQ says it cannot be changed through the API. Choose the narrowest eligible mode; default design target is spot/cash only, no margin, futures, perpetuals, options, borrow, or cross-collateral. Do not assume a subaccount is automatically spot-only.
- Fixed outbound IP allowlist is required for the candidate trade broker. OKX’s US FAQ supports up to 20 addresses; the global guide also describes IP binding and says unbound keys with trade/withdraw permissions can be deleted after 14 days of inactivity. Treat binding as mandatory, not as a substitute for endpoint restrictions or a reason to allow a dynamic IP.
- Confirm the registered OKX entity, local eligibility, and matching API domain before any future use. API domains/products vary by entity and jurisdiction; estimated physical location is not account-eligibility evidence.

## 5. Withdrawal, allowlist, and wallet-signing policy

- **No withdrawal capability for JEV.** OKX’s current US withdrawal help says the page displays the user’s 24-hour available limit; it is account-specific, so this design does not invent or hardcode a universal amount. A daily cap in the account UI is defense in depth, not permission for the agent to withdraw.
- Enable the exchange withdrawal allowlist manually if available and keep the new-address withdrawal lock enabled. OKX documents that allowlist mode restricts withdrawals to saved recipients and the new-address lock delays use of a newly added recipient for 24 hours. This does not protect against misuse of an already approved address or a compromised account owner.
- Withdrawal-address changes are human-only. OKX’s API Agreement expressly excludes API-agent changes to API keys, 2FA, and withdrawal allowlists, along with KYC and accepting new terms.
- **CEX API signing:** OKX private REST requests use an API key, secret, passphrase, timestamp, and an HMAC-SHA256/Base64 signature. This is an exchange API credential, not a wallet private key. Keep all of it in the signing broker’s secret store; do not reveal it to JEV or log it.
- **OKX Agentic Wallet / OnchainOS:** OKX describes a separate on-chain agent wallet with TEE-based key generation/storage/signing, risk simulation/scoring, anomaly handling, and autonomous multi-chain transactions. These are OKX’s product claims, not independent assurance. The reviewed public docs did not establish a deterministic per-agent spend cap or make this the signing mechanism for CEX order-book API orders. Do not substitute it for CEX API scopes; evaluate separately only for an explicitly on-chain use case.
- **MPC wallet:** OKX documents three key shares: Share 1 generated by the MPC wallet, Share 2 generated/stored on the device, and Share 3 generated by the device and encrypted/backed up to its cloud; a transaction requires Shares 1 and 2, with Share 3 for recovery. This is a Web3 wallet custody/recovery model, not an OKX CEX API permission scope.
- **Hardware wallet:** OKX documents hardware-wallet connection through a device/QR flow (Keystone guide). This creates a human/device approval boundary and is not documented in the reviewed pages as an unattended JEV signer.
- **AA Smart Account:** OKX describes smart-contract account capabilities, but its US help page says creation of new AA Smart Accounts was discontinued on June 20, 2024; existing accounts may continue to be used. It is not a new-user default for this design and the reviewed page does not establish JEV-specific enforceable spend limits.

## 6. Threat register

| ID | Threat / consequence | Required control | Evidence that the control holds |
|---|---|---|---|
| T1 | Prompt injection in news, market text, tool output, or retrieved docs steers an order or reveals data. | Treat all external text as untrusted. JEV returns only a typed, bounded proposal. Deterministic allowlist and policy code owns execution; no model-provided URL or raw API payload. | Adversarial prompt tests cannot produce an order outside schema, policy, symbols, or size caps; all invalid/ambiguous outputs fail closed. |
| T2 | API key/secret/passphrase leaks through prompt, source, terminal, logs, crash dumps, or a compromised JEV host. | Credential never enters JEV. Store encrypted in a dedicated secret manager/HSM boundary; inject only into the broker; redact headers/bodies; MFA on account; restrict host and operator access. | Secret-scanning and log tests on synthetic credentials; runtime test confirms the JEV process cannot read the secret; revoke drill succeeds. |
| T3 | Overbroad or misread Trade/Transfer scope lets an agent move funds, change settings, borrow, use Earn, or access unwanted products. | Read-only now. Exact per-key permission readback is a pre-live gate; no unreviewed legacy key. Broker endpoint allowlist denies every nonessential API family; subaccount and product restrictions contain blast radius. | Negative tests call each forbidden endpoint through the broker and prove rejection before network transmission; exact UI/key scope is reviewed by a human. |
| T4 | Duplicate order after timeout, retry, reconnect, or ambiguous acknowledgement. | Durable intent ledger/outbox; one locally unique `intent_id` and `clOrdId` per logical intent; query exchange state before retry; reconcile fills and open orders. Use `expTime` where supported and server-time sync. | Inject a lost response after exchange acceptance; restart/replay the worker; prove no second order is sent and status converges from OKX readback. |
| T5 | Stale/cancelled order is assumed canceled, or key revocation is mistaken for a kill switch. | Do not equate cancel acknowledgement with final cancellation. Use order-channel/query reconciliation. `Cancel All After` is a dead-man timer only; independent broker/network disable and operator key revocation are separate controls. | Demo drill with missed heartbeat verifies pending-order cancellation; a second test confirms positions are still monitored separately and key revocation does not substitute for order reconciliation. |
| T6 | Withdrawal/destination abuse following account or administrator compromise. | No Withdraw key. Human-owned allowlist and new-address lock; 2FA; account-specific 24h cap observed in UI; minimize subaccount balance; freeze/support runbook. | Permission and gateway negative tests; operator rehearses allowlist review, account freeze, and limit visibility without exposing secrets. |
| T7 | Unintended margin, derivatives, cross-collateral, or account mode expands loss beyond expected spot exposure. | Human selects the narrowest supported mode; code allowlists `instId`, `tdMode`, order type, and side; deny leverage/margin/derivatives unless separately specified and approved. Set hard max order notional, daily turnover, inventory, price deviation, and loss stops in deterministic code; values remain operator-owned and unspecified here. | Test suite proves mode/product mismatches, missing limits, stale prices, and over-limit intents reject before signing. |
| T8 | JEV/LLM service or its logs receive private balances, strategy data, or PII unnecessarily. | Minimize state to the fields needed for the judgment; no secrets; avoid sending balances/history unless essential; review applicable provider terms, data processing, region, and retention. TypeSafe’s public page says zero-data-retention is an enterprise option, not a default assumption. | Data-flow review and synthetic request capture show only approved fields cross the provider boundary; account-specific retention terms are recorded. |
| T9 | On-chain wallet path is confused with CEX trading, or an autonomous wallet signs a malicious token approval/transfer. | Keep wallet tooling and keys out of the CEX executor. No seed phrase/private key in JEV. Any future on-chain scope requires its own threat model, chain/token allowlists, spending caps verified in product docs, and separate approval. | Build-time boundary test and tool catalog review prove no wallet-signing tool is reachable from the CEX JEV workflow. |
| T10 | Clock drift, API outage, rate limit, or WebSocket reconnect causes stale execution or unsafe retries. | Sync clock to OKX server; reject expired intents; use `expTime` for order/amend where supported; bounded rate limiter; idempotency ledger; fail closed on disconnect/unknown state. | Simulated 50102/time drift, 503, 429/rate-limit, reconnect, and partial-fill tests do not cause blind resubmission. |
| T11 | Unauthorized account-management or legal action is taken by an agent. | No endpoints/tools for key changes, whitelist edits, 2FA, KYC, terms acceptance, or further delegation. Human-only approvals remain separate. | Permission/tool tests prove those capabilities are absent or rejected; audit records the human principal for account-level changes. |
| T12 | Audit evidence is missing, mutable, or itself leaks secrets. | Append-only access-controlled logs for intent ID, policy version, JEV model/version and judgment, redacted request metadata, OKX order IDs/statuses, and operator actions. Never log secrets, signatures, passphrases, auth headers, or unnecessary raw account data. | Tamper/retention test; replay a synthetic incident from audit records; verify redaction and access controls. |

## 7. Idempotency and order-state rules

OKX’s `clOrdId` helps query, cancel, and amend an order, but the documentation says uniqueness is enforced among currently pending orders; an ID can be reused after terminal state, and a query may return only the latest order when IDs are reused. Therefore, **`clOrdId` is not an exactly-once/idempotency guarantee**.

Required local state machine: `created → policy_approved → submitted → acknowledged/unknown → live/partial → terminal`. Persist the intent and unique client ID before sending. On timeout or unknown acknowledgement, query by `ordId`/`clOrdId`, inspect the order channel and fills, and reconcile before any retry. Never retry merely because the client did not receive a response. Keep local client IDs non-reusable even where OKX permits reuse. Treat a cancel response as accepted—not proof the order is canceled—until the order state confirms it.

Where supported, send OKX `expTime` for place/amend requests so stale requests are rejected after their deadline. Synchronize UTC time; OKX documents request rejection when the timestamp differs from server time by more than 30 seconds. `expTime` limits stale submission; it does not solve duplicate delivery or ambiguous acknowledgements.

## 8. Kill switch and incident response

### Operational stop design

1. An independent operator control disables new order intents and broker egress without calling JEV.
2. Use OKX `Cancel All After` as an additional dead-man timer. It requires Trade permission on the API key, so it is not independent of that credential. The documented `timeOut` range is 10–120 seconds (or 0 to disable); OKX recommends a heartbeat each second and notes that triggered cancellations may take a few seconds. It cancels pending order-book orders (not Spread orders); it is not a position-closing or account-freeze control.
3. Maintain an operator-only path to revoke the key and, if account compromise is suspected, freeze the account/contact official OKX support.
4. After stop/revocation, read back open orders, fills, positions, account activity, and transfer history. Do not infer that key revocation or agreement termination canceled previously submitted orders; OKX states open orders may remain live unless the user or OKX cancels them.
5. Position handling is a separate human/risk-policy decision; never auto-market-close on a vague “kill” signal without a separately approved and tested rule.

### Incident runbook (human-owned)

- Declare incident; isolate the JEV host and disable broker egress using the independent switch.
- Immediately revoke the affected API key/agent authorization in OKX’s account controls; use account freeze and official support if credentials or login are compromised.
- Cancel and verify pending orders; reconcile executions and positions; preserve redacted audit evidence.
- Inspect key permissions, IP binding, account and withdrawal settings, model/provider changes, and recent API use. Rotate/reissue only after containment and review; keep the old credential revoked.
- Notify OKX as required by the API Agreement: immediate notice on suspected/confirmed compromise; prompt notice, no later than 24 hours, for anomalous agent behavior, an AI/security incident, or a material model/provider change.
- Never paste keys, passphrases, seed phrases, one-time codes, or full unredacted auth requests into chat or incident tickets.

## 9. Key policy and governance

- **Ownership:** named human owner and backup; one key per bot/environment/account purpose. Separate demo from production. No shared personal/master key and no key reuse across applications.
- **Permissions:** read-only by default; a live key is a separate approval. No withdrawal. Disable separate Transfer/Loan/Earn scopes. Validate the current entity-specific permission record and legacy migration status. The API Agreement’s minimum-scope requirement is the floor, not a complete design.
- **Network:** fixed egress allowlist only. Changes to the allowlist require a human change record and verification. Do not put an API key on a host with broad outbound access if the broker can be isolated.
- **Storage:** encrypted secret manager/HSM or equivalent; secrets are never in source control, plaintext config, prompts, telemetry, screenshots, crash dumps, or logs. The model receives no credential material or signing oracle.
- **Lifecycle:** record purpose, owner, account/subaccount, environment, granted scopes, bound IP, creation/review/revocation status (not secret values). Review scope and usage periodically. OKX explicitly requires prompt rotation on suspected/confirmed compromise; this design does not invent a provider-mandated calendar rotation interval.
- **Changes:** account mode, funding, withdrawal limit/allowlist, API scopes, model/provider, policy limits, and endpoints require a human-reviewed change. A model/provider change triggers revalidation before live access.
- **JEV governance:** use Choice/Noul/Score only for bounded semantic judgments. Keep exact quantities, constraints, authorization, and risk checks deterministic. Treat every output as untrusted advisory data; probabilities are not permissions. TypeSafe’s agreement warns that outputs may be inaccurate and remain the customer’s responsibility to evaluate; its AUP prohibits manipulative/deceptive activity such as spoofing. Send only the minimum state to TypeSafe and check the applicable AUP, service agreement, privacy, and retention terms before any live-finance integration.
- **Exchange governance:** OKX’s API Agreement permits bounded agent access to read data, place/manage orders, and reduce/close positions, but excludes key/2FA/whitelist changes, KYC, accepting terms, and further delegation; it also bars using accounts/subaccounts to bypass restrictions and prohibits manipulative conduct. OKX does not validate the agent’s logic and attributes API calls to the user. Review the current contracting entity’s terms and eligibility before design approval.

## 10. Readiness gates and acceptance tests

Do not move from read-only to live execution unless every gate is evidenced:

- **G1 — Entity/product:** human verifies contracting OKX entity, jurisdiction/state eligibility, approved API domain, and supported products/account mode.
- **G2 — Exact scopes:** human reads back the new key’s actual permissions and subaccount binding; no Withdraw and no unneeded Transfer/Loan/Earn. Resolve the official-doc mismatch in §4. If trade-only cannot be shown, remain read-only.
- **G3 — Architecture:** test proves JEV cannot read the secret or call OKX private endpoints; only the broker can sign, and the broker endpoint allowlist denies all unneeded operations before network egress.
- **G4 — Deterministic limits:** operator supplies and approves numeric limits for symbols, order size/notional, inventory, turnover, daily loss, slippage/price deviation, rates, and stale data; tests cover boundaries. This document assigns no numeric trading limits.
- **G5 — Order state:** duplicate/replay, lost response, partial fill, cancel-ack, reconnect, expired `expTime`, and delayed order-event tests prove no blind duplicate order and correct reconciliation.
- **G6 — Stop/incident:** in demo, verify CAA timeout, independent egress disable, key revocation procedure, account-freeze route, order readback, and human escalation. Prove open orders and positions are separately checked.
- **G7 — Privacy/provider:** approve data fields sent to JEV, retention/region/contract, and current TypeSafe/OKX terms for the precise use case; do not assume enterprise-only zero retention is active.
- **G8 — Withdrawal boundary:** test that the agent/broker cannot invoke withdrawal, transfer, Earn/Loan, whitelist, or security settings; human confirms the account-specific withdrawal limit and allowlist settings separately.
- **G9 — Audit:** verify redacted append-only logs can reconstruct an order intent through final exchange state without containing any credential or signature.
- **G10 — Change authorization**: Separate human approval to configure a test/demo integration, and later a separate explicit approval for any live account/action. This threat model grants neither.

## 11. Source-trust ceiling and unresolved items

- OKX API documentation, API Agreement, and OKX Help Center are primary sources for the published product controls and contractual language, but the precise account entity, feature availability, and UI permission matrix remain unobserved.
- OKX Wallet/OnchainOS pages are first-party descriptions of their products. TEE/risk-scoring statements are vendor-described controls, not independently verified by this review.
- TypeSafe’s public Acceptable Use Policy and Master Customer Agreement are primary sources for TypeSafe’s stated terms, but the specific customer plan/order and whether a fully automated trading use case is permitted require current account/contract review. The public AUP does not itself settle that question.
- JEV’s Choice result is advisory evidence only. It is not a control test, code review, security certification, or execution evidence.

**Open questions:** exact OKX contracting entity/domain and eligibility; current key scope UI for the target account; actual JEV/data/executor topology; operator-selected numerical limits; provider-specific retention/contract; whether any separate on-chain wallet use case is intended. Until resolved, preserve the `readonly_until_scope_verified` decision.

## 12. Official primary-source register

Consulted 2026-10-09; titles below identify first-party sources. Citations to the pages are in the accompanying chat response.

- **[S1]** OKX API Agreement (United States; published 2026-03-26, last updated 2026-07-28): permitted and excluded agent functions, user responsibility, third-party AI terms, security, incident notification, account/subaccount restrictions, and open orders after termination. `okx.com` Help Center.
- **[S2]** OKX API guide V5 (English): key/secret/passphrase, Read/Trade/Withdraw scope descriptions, Trade overview, IP binding, inactivity, HMAC signing, timestamps, `clOrdId`, `expTime`, Cancel All After, and Transfer endpoint behavior. `okx.com/docs-v5`.
- **[S3]** OKX API FAQ (United States; consulted 2026-10-09): key creation/management, basic Read/Trade/Withdraw scopes, and IP binding. `okx.com` Help Center.
- **[S4]** Subaccounts, Account Mode, and API Connections FAQ (United States; consulted 2026-10-09): subaccount use, main-account transfers, account mode, API permissions. `okx.com` Help Center.
- **[S5]** Why can’t I withdraw funds? (United States; updated 2026-08-05): account-specific 24-hour limit display and subaccount withdrawal handling. `okx.com` Help Center.
- **[S6]** How do I enable or disable the withdrawal Allowlist? (United States; updated 2026-08-14): allowlist and new-address 24-hour lock. `okx.com` Help Center.
- **[S7]** OKX OnchainOS Agentic Wallet introduction and installation documentation: TEE, autonomous on-chain execution, and risk-simulation/scoring claims. `web3.okx.com` OnchainOS documentation.
- **[S8]** How do I secure my MPC wallet? (OKX; updated 2026-08-11): three-share and recovery description. `okx.com` Help Center.
- **[S9]** How do I connect my Keystone Hardware Wallet to OKX Wallet? (United States; updated 2026-08-11): device/QR connection flow. `okx.com` Help Center.
- **[S10]** What is AA Smart Account? (United States; consulted 2026-10-09): features and discontinuation of new-account creation on 2024-06-20. `okx.com` Help Center.
- **[S11]** TypeSafe API ReDoc: typed Choice/Noul/Score judgments and request/response interface. `api.typesafe.ai`.
- **[S12]** TypeSafe Acceptable Use Policy and Master Customer Agreement (both last updated 2026-09-23): usage and service terms. `typesafe.ai/legal`.
- **[S13]** TypeSafe enterprise page: states zero-data-retention is available for enterprise customers by arrangement. `typesafe.ai`.
- **[S14]** OKX API FAQ (EEA; consulted 2026-10-09): separate Transfer, Loan, and Earn permission descriptions; regional-specific scope reference only. `okx.com` Help Center.
