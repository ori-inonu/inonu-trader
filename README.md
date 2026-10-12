# INONU TRADER

INONU TRADER is a MIT-licensed fork of [Jev Trader](https://github.com/jarrodwatts/jev-trader), originally created by Jarrod Watts. Its dashboard uses an abstract circuit mark, deep blue surfaces, cyan controls and gold accents. See [contributing](docs/CONTRIBUICAO.md), [dashboard setup](web/README.md), and the [active engineering goal](docs/GOAL-INONU-TRADER.md).

Local MON-USDC maker research on Kuru/Monad, with real market reads and paper execution. This candidate adds cost accounting, funded spot inventory, risk/decision gates and reproducible journal replay. Live startup is blocked until wallet/margin balances, outstanding orders and restart equity are reconciled and execution is independently qualified. Borrowed leverage is not implemented.

The current strategy has no demonstrated profitable edge. A three-minute pre-filter mock capture lost $0.00369142 on a $100 paper example. Mock decisions and optimistic paper fills do not establish Jev profitability.

## Local setup

```powershell
# Only if .env does not exist:
Copy-Item .env.example .env
& C:/Users/gabri/.bun/bin/bun.exe install
& C:/Users/gabri/.bun/bin/bun.exe run doctor
$env:JOURNAL_PATH = 'data/my-paper-001.jsonl'
& C:/Users/gabri/.bun/bin/bun.exe run capture --seconds 180
& C:/Users/gabri/.bun/bin/bun.exe run backtest --journal data/my-paper-001.jsonl
& C:/Users/gabri/.bun/bin/bun.exe run test
& C:/Users/gabri/.bun/bin/bun.exe run typecheck
```

Doctor reads RPC state and reports missing credential booleans, costs and readiness. It never signs, deposits or prints secrets. Capture requires paper mode. Start serves the local dashboard on port 3000; use a fresh journal path each run.

The local Windows key is configured through the ignored .env and Jev has answered in paper mode; see [verified Windows configuration](docs/JEV-WINDOWS.md). Other installations need their own TYPESAFE_AI_API_KEY and MODEL=jev, retaining DRY_RUN=true and an empty PRIVATE_KEY. Consult current TypeSafe pricing before paid captures. The plugin credential is not transferred into this project.

## Local OKX Web3 panel

In a separate terminal, run the frontend on port 3001:

```powershell
Set-Location C:/Users/gabri/jev-trader/web
& C:/Users/gabri/.bun/bin/bun.exe run dev
```

Open http://localhost:3001 in the browser with the OKX Wallet extension, then choose **Conectar OKX**. The panel reads the authorized account on Monad (143) or X Layer (196), with exact amounts for a finite list of monitored assets. X Layer supports USDT and USDT0 and keeps USDC variants separate; an explicit network switch selects which balances are read. These amounts are not a consolidated portfolio or a USD valuation. See [wallet coverage and setup](web/OKX-WALLET.md). A wrong network requires an explicit switch; connecting never signs, transfers or enables the executor. The panel also works while the backend is offline. Its default feed is the local backend on port 3000; NEXT_PUBLIC_API_URL can explicitly override it.

Pix/BRL on OKX Exchange and assets in OKX Web3 are separate balances. The user-reported funds have not been observed by this application. Mobile-only wallets, native extension behavior and real account balances remain unqualified until used on the user's device. See [OKX investigation and trading routes](docs/OKX-INVESTIGACAO.md).

## Execution and accounting

Read book and earlier trade logs → enforce session limits/interval → screen hypothetical two-leg spread after gas, fees and estimated inference cost → ask model → validate action/confidence/deadline/funded inventory → quote or clear paper resting orders → journal individual events → replay net equity/drawdown.

The cost screen assumes two full fills at an unchanged book and charges two quote transactions, one inference allowance and maker fees. It is a feasibility filter: queue priority, adverse selection, actual inference/cancellation costs and fill probability can make realized results worse. Stops latch until restart; a transaction, model bill or market gap can exceed caps. These are not on-chain stop-loss orders.

Paper cash starts at BANKROLL_USD minus MARGIN_MON times firstMid. MARGIN_USDC is a legacy live funding target, not additional paper capital. Gas uses a disclosed limit/RPC price; mock inference cost is zero. Individual fills/costs are immutable in JSONL; the dashboard's aggregated mutable history is not valid replay input.

## Evidence and Brazil funding

- [Operating guide: Jev, OKX Wallet versus exchange, Pix/Nubank and blockers](docs/OPERACAO-BRASIL.md)
- [Risk, captured results and qualification](docs/RISCO-E-BACKTEST.md)
- [Primary-source funding research](docs/FUNDING-RESEARCH.md)
- [Frozen acceptance](docs/READINESS-SPEC.md) and [economic gate addendum](docs/PROFIT-SPEC.md)
- [v0.0.2 release status, boundaries and open decisions](docs/RELEASE-v0.0.2.md)
- [Live qualification plan and checklist](docs/LIVE-QUALIFICATION.md)
- [Portfolio evidence SDD](docs/sdd/carteira-evidencia/requirements.md): canonical requirements, design (real state of the code, evidence contract, concurrent-work map) and finite task plan for verifiable manual portfolio management. Spec only; nothing in it is implemented yet.
- Recorded pre-filter replay: kept in the local `docs/evidence` directory, which is not published.

Live qualification does not enable live. `bun run qualify:live` prints a read-only checklist of what must be true and evidenced before the owner decides to lift the live-execution gate: JSON on stdout and a short pt-BR summary on stderr. It reads the config like `doctor`, plus optional local `data/live-authorization.json` and `data/live-evidence.json`, and hashes the evidence files they name. It makes no network or RPC calls and never signs or sends anything. `readyForOwnerReview` only means the checklist is complete; it is not permission to trade, and the gate in `Market.init()` is unchanged. The assistant never fills the authorization record, supplies keys or runs a live session.

The original root SPEC.md/demo description is historical context. Frozen readiness acceptance/addendum govern this candidate. Local changes have not been deployed to Railway. The original every-300-ms-block real-order demo claim has not been requalified; the current protective hold/interval behavior is not equivalent to that claim. Setting `ECONOMIC_GATE=false`, `QUOTE_INTERVAL_BLOCKS=1` and `MIN_CONFIDENCE=0` selects every-block evaluation; it is an operator choice, not the default, and live execution stays blocked in code.

## Jev as financial operator (multichain OKX Wallet)

`bun run okx:operator` (for live, `bun --no-env-file --env-file=.env.operator run scripts/okx-operator.ts`, so the trader's keys are never inherited) runs one operator cycle: multichain inventory (OKX Balance API, chains 143, 196, 501, 1, 56, 8453, 42161, 137, 10), typed candidates (DEX round trips, cross-chain rebalances, the Kuru maker mandate, DeFi yield), deterministic gates, one Jev choice (candidate or hold) and one bounded plan. Without flags it is an offline synthetic demo; `--live` reads the real wallet through OKX OnChain OS credentials, `--jev` asks real Jev, `--loop` repeats. Plans stay dry run unless the operator's own gates are all set: OPERATOR_EXECUTE, OPERATOR_LIVE_ACK, a dedicated OPERATOR_PRIVATE_KEY, the real Jev model, an https RPC plus router, spender and selector allowlists per chainIndex, and a ledger created once with --init-ledger. The ledger caps daily notional and plans, stops on daily, weekly and drawdown losses, enforces a cooldown, blocks new plans while a leg is open, and the file data/operator/STOP is a kill switch checked before every send. Solana execution is disabled in code until a transaction policy exists. The R5 independent review and the fixes applied for its F1 to F8 conditions are recorded in docs/research and in the operator guide. DeFi products come from the OKX DeFi search and funding carry from the public OKX v5 funding-rate endpoint as research candidates. The backend serves the last cycle at `GET /operator` and the dashboard shows it, together with the connected account's balances on eight EVM networks and the Solana account from the OKX extension. See [the operator guide](docs/OKX-OPERADOR-JEV.md).

## Mesa de operacoes (the root page)

The root page `/` is a full-screen desk without page scroll: order book ladder and tape on the left wing, the Jev decision at the center with candles and an isometric liquidity surface, the watchlist, aggressor flow and perpetual funding on the right wing, and the OKX Wallet, the OKX and OnchainOS capability matrix and the Jev journal in the dock. The wings fold toward the Jev in CSS 3D (pointer parallax, off under reduced motion); on phones it becomes one section at a time with a tab bar. Market data comes straight from the keyless OKX public v5 WebSocket and REST in the browser, so nothing on the desk is a fixture: a value that is not known reads "Indisponivel", a feed that is silent is labelled old, and a blocked capability (for example OnchainOS without its Web3 credentials) says what it needs. The previous command center is kept at `/console`. Spec and run instructions: [docs/MESA-DE-OPERACOES.md](docs/MESA-DE-OPERACOES.md).

`bun run jev-read --jev --serve 3100` starts the producer behind the desk's Jev: it keeps the live OKX public feed in memory, builds a compact state only from real and fresh inputs, asks real Jev for buy, sell or hold over a 5 minute horizon, validates the answer (anything else is hold with a status) and publishes the board at `GET /jev-read` through an allowlisted projection and the same dashboard origins and optional token as `/operator`. It is advisory only: it never signs or sends, and without fresh data it records why and does not call the model. `--observe` records the state without any model. System One now evaluates freshness on the exchange-corrected clock (`src/system-one/clock.ts`), because a local clock behind OKX made every exchange stamp look like the future.

## Dashboard: the Jev command center

The dashboard opens on the command center: Jev sits at the middle of a tilted orbit, with the inputs it reads (price feed, Monad block) on the left, the outputs it drives (Kuru book, wallet) on the right and the OKX operator on top. Every new block sends a signal from the inputs into the core and, when Jev quotes, from the core out to the Kuru book in the decision colour; a late answer makes the core flinch once. A receding belt shows the last blocks. Below the stage, the growth deck folds the three central views into the console: risk and leverage (R3 arithmetic for a chosen capital, volatility, horizon and assumed edge), permissions and limits (tiers T0 to T2-C and the phase limit profile) and the OKX ecosystem map. All of it is reading only: no control on the page executes anything, the only looping motion is ambient and stateless, and reduced motion or a reconnecting feed holds everything still. Sources: `web/src/components/CommandCenter`, `web/src/components/GrowthDeck`, `web/src/lib/command-center.ts`, `web/src/lib/growth-deck.ts`, `web/src/lib/central`.

## Jev Decision Lab and risk tools (read only, shadow only)

`bun run jev:lab run --synthetic --epochs 400 --seed 7 --out ./lab-out` runs an edge discovery loop without executing anything: at every epoch it records what each policy (hold, random, buy and hold, momentum, carry and Jev) would choose, measures the point-in-time result net of conservative costs, and prints a report with honest statistics (Newey-West for overlapping horizons, Holm across policies, comparison against baselines, a Sharpe with its caveat and a 1x to 10x leverage counterfactual). `bun run jev:lab report --journal ./lab-out/journal.jsonl` rebuilds the report from the journal alone. The lab never signs, sends, uses the network, keys or environment variables; the default Jev is a mock chooser announced loudly, and the promotion gate can only recommend staying in fase-0. Synthetic data proves arithmetic and the statistics machinery, never profit. Spec, measured test size and power: [docs/JEV-LABORATORIO-DE-DECISAO.md](docs/JEV-LABORATORIO-DE-DECISAO.md).

The lab can also consult the real Jev, in shadow and under a hard cost cap (`src/lab-jev`, `scripts/jev-lab-real.ts`, [docs/JEV-LAB-JEV-REAL.md](docs/JEV-LAB-JEV-REAL.md)). `bun run jev:lab:plan --capture <capture.jsonl> --usd-per-mtok <price>` estimates, with no network and no key, how many consultations a window needs and what they would cost. `bun run jev:lab:real run --capture <capture.jsonl> --out <folder> --max-usd <n> --max-calls <n> --allow-paid-inference` asks the real Jev once per epoch (after one preflight call) and measures what its choices would have returned net of costs; it refuses without the flag, without both caps (hard maxima: 5 USD and 2000 calls), without the key or without the price. The three variables (`TYPESAFE_AI_API_KEY`, `JEV_MODEL_ID`, `JEV_USD_PER_MTOK`) live in `data/jev.env`, which git ignores, and the key is never printed or stored. Jev sees only numbers, opaque ids and closed vocabularies, and nothing is executed, signed or sent. Every summary ends with the leverage that the measured edge would justify (zero until there is out-of-sample evidence) and says that this is a diagnostic: lifting real execution needs the four conditions of decision D11.

`bun run policy:envelope --capital 80 --sigma 0.04` derives the per-phase limits (fase-0 to fase-2) from the research envelope and `--check <file> --phase fase-1` checks a settings file against a phase ([docs/POLITICA-DE-LIMITES.md](docs/POLITICA-DE-LIMITES.md)). `bun run okx:derivatives` evaluates perpetual-swap carry and leverage risk from a synthetic or imported snapshot ([docs/okx-derivatives-v1/GUIA.md](docs/okx-derivatives-v1/GUIA.md)). Both are offline and execute nothing. How Jev decides on top of the Onchain OS: [docs/JEV-DECISAO-ONCHAIN-OS.md](docs/JEV-DECISAO-ONCHAIN-OS.md); the page and endpoint inventory of the Onchain OS: [docs/research/R6-onchain-os-inventario.md](docs/research/R6-onchain-os-inventario.md).

Read-only data layer for the OKX Onchain OS (`src/onchainos`, spec in Portuguese at [docs/OKX-ONCHAINOS-DADOS-SPEC.md](docs/OKX-ONCHAINOS-DADOS-SPEC.md)). It reads market price, index, candles and trades, token statistics, signals and leaderboards, social numbers, gas price and DeFi products through one signed GET and POST transport (injected fetch, token bucket, bounded retries on 429 and 5xx only, per-tier quota counters, offline unless credentials and `allowNetwork` are both present), plus a keyless client for the public OKX Exchange v5 REST that feeds the derivatives evaluator. It never signs a transaction, never builds calldata, never calls a trade or security-scan endpoint and never pays per call. `bun run onchainos:capture plan` prints the calls and the quota cost of a capture without any network access; `bun run onchainos:capture run --source public-okx --out <folder> --max-epochs 60 --allow-network` records ticker, funding, mark price, candles, order book and open interest in the Jev Decision Lab capture format (JSONL, resumable, idempotent, one request per second by default). The `onchainos` source needs `--credentials-from-env` and `--allow-network`, and its credentials come from `data/onchainos.env` through `bun run onchainos:capture:env`: create that file with only `OKX_WEB3_API_KEY`, `OKX_WEB3_API_SECRET` and `OKX_WEB3_API_PASSPHRASE` (the `data/` folder is ignored by git), so your wallet keys are never loaded. Captured numbers prove parsing and data flow, not profit.

## System One: Jev's leverage decision layer

`bun run system-one` runs one leverage decision cycle: market reading (mark price, funding rate and candles of the perpetual from the keyless OKX public v5 API with `--public`, or a synthetic walk by default), realized daily volatility, the risk envelope of the phase (src/policy/envelope.ts), eight leverage candidates (long and short at 1x, 2x, 3x and 5x) with liquidation touch probability, volatility drag and funding carry, and one Jev choice among the eligible candidates or hold (`--jev`; the default mock announces itself). The cycle is written to `data/system-one/latest.json`, served at `GET /system-one` and shown on the dashboard under the command center as the leverage ladder. System One never signs or sends: every cycle ends as `dry_run` or `blocked`. See [SYSTEM-ONE.md](docs/SYSTEM-ONE.md) and research [R9](docs/research/R9-system-one-alavancagem-onchainos.md).

## OKX Web3 opportunity scanner

Run `bun --no-env-file run okx:market-scan` for the local synthetic report. It makes no live requests and cannot execute trades. See the [OKX Web3 integration guide](docs/okx-market-v1/OKX-WEB3-INTEGRATION.md) for the documented coverage, optional read-only access requirements and remaining limitations.

## Integration verification

Historical OKX buy observations are available with `bun --no-env-file run okx:signals` (synthetic by default). The [signals guide](docs/okx-signals-v1/GUIA.md) documents freshness, missing execution evidence and explicitly limited authenticated access.

Compare Signals and Meme Pump reports by network/contract with `bun --no-env-file run okx:evidence` (deterministic offline demo). The [comparison guide](docs/okx-evidence-v1/GUIA.md) explains explicit file imports, recalculated freshness, unverified provenance and remaining liquidity/cost evidence.

From the repository root, run `bun --no-env-file run test:all`, `bun --no-env-file run build`, then `bun --no-env-file run typecheck:all`. The backend command includes maintained script tests; frontend verification discovers all library regression tests, including the DEX importer/render suites. Run build before frontend typechecking because Next.js regenerates types. On this Windows installation use `C:/Users/gabri/.bun/bin/bun.exe` when Bun is not on PATH.

The wallet, scanners, Jev MON-USDC trader and bounded synthetic paper supervisor remain separate operational slices. Passing their tests does not prove an autonomous OKX wallet-to-Jev-to-reconciled-execution path, live access, profit or 24-hour operation. The active audit criteria are in [Web3 integration delivery](docs/WEB3-INTEGRATION-DELIVERY-SPEC.md). Authenticated DEX analysis now preserves one raw quote only and blocks dependent quotes while the provider output unit is unqualified; the two-leg example remains synthetic.

Inspect one local DeFi search capture and one product detail with `bun --no-env-file run okx:defi` (synthetic offline demo by default). The [DeFi guide](docs/okx-defi-v1/GUIA.md) distinguishes advertised yield, unknown units and costs, unverified provenance and unqualified execution.
