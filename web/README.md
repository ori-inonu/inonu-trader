# Inonu Trader dashboard

A Next.js, React and TypeScript dashboard for the backend event feed, with an abstract circuit mark, deep blue surfaces, cyan controls and restrained gold accents. It uses the existing Inter and Geist Mono fonts and CSS Modules.

## Run

From the repository root:

```bash
bun install --frozen-lockfile
cd web
bun install
cp .env.example .env.local
bun run dev
```

Open http://localhost:3001. `NEXT_PUBLIC_API_URL` points to the backend, defaulting to `http://127.0.0.1:3000`; the dashboard connects to its `/events` endpoint. An unavailable feed remains visibly disconnected and does not receive invented market data.

## Dashboard

The chart offers windows of 32, 64 or 128 available blocks and keyboard controls for inspecting individual blocks. Activity filters apply before the display limit. Decision details explain the reported states; a hold decision remains distinct from a late response. Simulation, feed connection, data source and browser-wallet state are shown separately. A connected feed does not verify live order execution.

The OKX panel is read-only. It queries the confirmed account on Monad (chain 143), blocks balance reads on an unsupported or unknown network, and stays locally disconnected until the user reconnects. Connecting the wallet does not activate trading. See [OKX setup and limitations](OKX-WALLET.md).

## Verification

```bash
bun run test
bun run build --webpack
bun run typecheck
bun run start
```

Install the root dependencies too: the existing root package supplies the Bun test types. Webpack supports the local dependency junction used during development. Run typecheck after the build rather than simultaneously, because the build regenerates Next.js types. Provider fixtures and unit tests do not certify a native OKX extension, deposited funds or profitability. Do not place secrets in `NEXT_PUBLIC_*` variables.
