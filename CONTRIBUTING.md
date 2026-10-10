# Contributing to Inonu Trader

Inonu Trader is an MIT-licensed fork of [jev-trader](https://github.com/jarrodwatts/jev-trader). Preserve the original license and credit when contributing.

Create a branch for one bounded change and explain its observable behavior. Keep credentials, wallet keys, personal balances, captures of real accounts and internal agent records out of the diff. Do not combine a visual change with live trading or a financial permission change.

For frontend changes, install the existing root dependencies first (they supply Bun test types), then verify the frontend. Start from the repository root:

```sh
bun install --frozen-lockfile
cd web
bun install
bun run test
bun run build --webpack
bun run typecheck
```

Check the affected interactions at desktop and small mobile widths. Describe fixture data explicitly as synthetic, and distinguish a passing provider test from a connection to a real extension. State any browser, accessibility or execution limitation in the pull request.

Open a draft pull request against this fork for Inonu-specific changes. A general improvement can be proposed separately to the upstream project. Each maintainer decides whether to merge; a submitted pull request does not itself establish contributor status.

The dashboard's OKX connection reads balances in browser memory. It does not enable the inherited backend executor. See [wallet setup](web/OKX-WALLET.md) before changing that boundary.
