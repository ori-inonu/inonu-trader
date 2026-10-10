# INONU TRADER

INONU TRADER is a MIT-licensed fork of [Jev Trader](https://github.com/jarrodwatts/jev-trader), originally created by Jarrod Watts. Its dashboard uses an abstract circuit mark, deep blue surfaces, cyan controls and gold accents. See [contributing](docs/CONTRIBUICAO.md), [dashboard setup](web/README.md), and the [active engineering goal](docs/GOAL-INONU-TRADER.md).

Local MON-USDC maker research on Kuru/Monad, with real market reads and paper execution. This candidate adds cost accounting, funded spot inventory, risk/decision gates and reproducible journal replay. Live startup is blocked until wallet/margin balances, outstanding orders and restart equity are reconciled and execution is independently qualified. Borrowed leverage is not implemented.

The current strategy has no demonstrated profitable edge. A three-minute pre-filter mock capture lost $0.00369142 on a $100 paper example. Mock decisions and optimistic paper fills do not establish Jev profitability.

Version `0.0.2` is an isolated integration candidate, not a live-trading release. See [the release status and exact capability boundaries](docs/RELEASE-v0.0.2.md). Independent review and unresolved live/cadence requirements still gate the local `main` merge; this integration has not pushed, deployed or executed financial operations.

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
- [Recorded pre-filter replay](docs/evidence/backtest-20261009.json)

The original root SPEC.md and CLAUDE.md live/every-block requirements remain binding and are not superseded by the readiness acceptance/addendum. Their conflict with the paper-first candidate is unresolved, so passing offline checks does not qualify a live release or the local main merge. Local changes have not been deployed to Railway.

## OKX Web3 opportunity scanner

Run `bun --no-env-file run okx:market-scan` for the local synthetic report. It makes no live requests and cannot execute trades. See the [OKX Web3 integration guide](docs/okx-market-v1/OKX-WEB3-INTEGRATION.md) for the documented coverage, optional read-only access requirements and remaining limitations.
