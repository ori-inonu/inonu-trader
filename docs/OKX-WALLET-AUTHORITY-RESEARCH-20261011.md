# OKX wallet authority — research checkpoint

Research only; no wallet login, signer activation, installation or financial permission granted.

## Agentic Wallet documented capabilities

Official skills page inspected 2026-10-11: https://web3.okx.com/pt-br/onchainos/dev-docs/wallet/agentic-wallet-skills

The page documents authentication/status/logout, subwallet management, portfolio queries, security scans, approval inspection, transfers and paginated history. It describes a gas/simulation/security/execution/tracking workflow. Address portfolio queries can be unauthenticated, despite the broader introductory prerequisite statement. The inspected page does not establish a machine-enforced spend cap, delegated-session expiry or granular revocation contract. These remain unproven dependencies for autonomous authority, not unsupported assumptions to fill with a UI label. Documented commands are not locally exercised capabilities or guarantees of safety/profit.

## Current repository evidence

Baseline main1f08e6edd589449a82eeb70638987a09572a3bd2, clean on inspection. web/src/lib/okx-wallet.ts SHA2565f37cd832c52b3f4eab6f813acaeddee3dc4f823b4bfefbdab3d31f2a1f20e2f contains eth_requestAccounts at576 and wallet_switchEthereumChain at687. src/operator/executor.ts SHA25617db3012332584dce46ac712e0d48ebf71f59f13533ce40d8b12fa6667b6961a contains the separate signer sendTransaction path at293–301. Static evidence only; neither path was executed. Account discovery does not itself demonstrate delegated execution authority (inference).

## Documentation recovery limits

Earlier same-conversation research examined broadcast signedTx and EVM account permission documents. Fresh web rechecks of the following URLs returned Internal Error / not accessible via this tool; no new verification claimed:

- https://web3.okx.com/pt-br/onchainos/dev-docs/wallet/onchain-gateway-api-broadcast-transaction
- https://web3.okx.com/pt-br/onchainos/dev-docs/wallet/dapp-connect/chains/evm/web-access-user-accounts

Before a permission adapter is specified, revalidate the exact provider signing/broadcast contract and authority lifecycle from primary sources. Keep API authentication, account visibility, token allowance, signer authority and session revocation as separate states. This research does not replace strategy, cost, risk, simulation or financial authorization gates.
