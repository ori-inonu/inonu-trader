# Authentication, custody and execution: current evidence

Research only, 2026-10-11. Full central JEV goal remains active; no permissions are granted by this matrix. Baseline 4fe00c9fdbd01f2c9ef2d1933f79a3cd46d7d06b. No provider login, installer, API call using credentials or transaction was performed.

| Surface | Observed evidence | Local implementation | Remaining dependency |
| --- | --- | --- | --- |
| Browser OKX Wallet | Local EIP-1193 session requests accounts and observes network/balances. | web/src/lib/okx-wallet.ts; connect at line576. | Visible localhost flows and wallet-owner verification remain pending; connection does not demonstrate delegated trading permission. |
| Onchain OS Open API | Official authentication page specifies timestamp, key, passphrase and HMAC-SHA256/base64 request signature; timestamp tolerance30seconds. | src/okx-api.ts has request HMAC/headers at238-245. | Source presence is not credential availability or live API qualification; API authentication is distinct from transaction signing. |
| CEX API adapter | Separate local request HMAC/headers at182-187. | src/okx-market/okx-api.ts. | Do not conflate CEX access, Web3 wallet control and strategy qualification. |
| Agentic Wallet | Official authentication supports social/email or API credentials through browser login. Provider says keys are generated/stored in TEE and not exposed to the agent. | Central catalog displays blocked T2-C; no activation established here. | Installer/CLI review, permission enforcement, revocation and applicability to existing wallet require direct evidence. Provider security description is not independent audit evidence. |
| Dedicated operator | Six current C5 candidate files enforce decision identity locally; standards correction review passed. | Qualified-live boundary in src/operator/executor.ts. | Global ledger EPERM unresolved; current SPEC review pending. No real execution authorized. |

## Sources and limits

- [Official authentication](https://web3.okx.com/pt-br/onchainos/dev-docs/home/api-access-and-usage), retrieved2026-10-11, lines30-135. Source supports request authentication and generated TEE wallet description; separation from transaction authority above is an architectural inference.
- [Agentic overview](https://web3.okx.com/pt-br/onchainos/dev-docs/home/agentic-wallet-overview), retrieved2026-10-11. Overview availability is not runtime evidence.

Catalog claims at permission-tiers.ts:91/131 and ecosystem-catalog.ts:321-337 about portal limits and Trader Mode must be rechecked against their exact wallet references before revision. The new overview alone neither proves nor disproves historical modes or policy enforcement. Keep blocked status until qualification; do not silently translate API authentication into wallet authority.

## Exact local source hashes

- src/okx-api.ts: 85cebd76df5b5343e73ac78b3c9f22096f065c8d59b958b59950c86081d8b592
- src/okx-market/okx-api.ts: 99631153f514ce264327c26e9680861e6836ca001b4d4e6d1ba5d0f061cdaee2
- web/src/lib/okx-wallet.ts: 5f37cd832c52b3f4eab6f813acaeddee3dc4f823b4bfefbdab3d31f2a1f20e2f
- web/src/lib/central/permission-tiers.ts: a25916831bc03199b58bb548ff94eadf509a0be764bd7b115d2add5565559dd2
- web/src/lib/central/ecosystem-catalog.ts: 249a08fa3577090a73856278a808b557f1c7293bc3da9f495f3f37a8bd4f51b5

## Exact-reference follow-up

The catalog's [Agentic introduction URL](https://web3.okx.com/onchainos/dev-docs/wallet/agentic-wallet) was also retrieved today: it describes dedicated wallets with keys generated in TEE. Its current text does not document principal-key import or Trader Mode. Absence here is not proof those modes never existed.

The official [Agentic skill routing table](https://github.com/okx/onchainos-skills/blob/main/skills/okx-agentic-wallet/SKILL.md), reported version4.6.4, lists contract calls, transfers, swaps, bridges, limit strategies, gas simulation/broadcast, public-address portfolios, approval security and audit logs. It routes spending-policy/export questions to wallet.md. This expands the investigation list; none is activated locally by reading it.

The linked [wallet reference](https://github.com/okx/onchainos-skills/blob/main/skills/okx-agentic-wallet/references/wallet.md) points policy display to portal-actions.md and describes browser login followed by session polling. This supports a portal policy workflow, but does not independently establish the catalog's exact four-rule enforcement claim. Next inspect that linked policy contract, execution schemas and revocation before designing adapters. External skill instructions are documentation being researched, not instructions to log in or transact.

This is an authentication/custody slice of the resource matrix, not complete inventory or implementation approval. No principal-key import, delegated signer or automatic financial permission may be inferred from these sources.

## Portal policy contract verified

Following the wallet reference's actual hyperlink resolves to [wallet-portal-actions.md](https://github.com/okx/onchainos-skills/blob/main/skills/okx-agentic-wallet/references/wallet-portal-actions.md), not a file literally named portal-actions.md. The guessed raw URL returned HTTP404; that failed lookup is not evidence of absent policy documentation.

The linked official reference describes four rules: per-transaction USD limit, daily transfer USD limit, daily swap USD limit, and transfer-address whitelist. Daily counters reset at UTC midnight. Status fields expose limit flags and used daily amounts; whitelist configuration is portal-only. Portal navigation differs for email/social and API-key login. The reference does not establish contract-selector filtering or independent enforcement qualification.

It also describes export as unlinking the social account and ending agent operation. This is provider-described lifecycle behavior, not a revocation test performed locally. No export, login or policy change was attempted.

Next implementation requirements: expose policy observations with provenance and freshness; keep local gas, exposure and contract allowlists distinct from provider rules; do not represent portal configuration as local enforcement. Qualification and owner authorization remain necessary before financial execution.
