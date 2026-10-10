# Trading readiness and evidence specification

Observed request: 2026-10-09, own conversation 01a1216a-c46b-72f3-b3dc-24c79470308d.
Baseline: b587759e459ea049590102e54a0b07800864cdc3; clean working tree.

The user now wants usable configuration, honest risk/return analysis, a reproducible backtest and Brazil Pix funding/withdrawal guidance. This supersedes the original demo requirement to quote every block where that conflicts with capital protection. It does not authorize live orders, deposits, transfers, deployment or invented credentials. R$400 to R$4000 requires +900%; continuous capital growth is not an achievable acceptance condition.

## Immutable acceptance

- R1 Configuration rejects malformed/nonfinite/negative financial values and unknown model modes; absent credentials keep dry-run; live mode requires an explicit acknowledgement and Jev credentials. Default local configuration remains paper/mock. A read-only doctor reports readiness without printing secrets, signing, depositing or sending transactions.
- R2 Paper and recorded replay account for gas per quote, configured maker fees and actual modeled AI spend, disclose cost assumptions, and mark bankroll equity/drawdown. Mock inference spend is zero. Spot paper orders must respect funded cash and MON inventory; no uncollateralized short or fabricated leverage.
- R3 Trader honors hold/low confidence, quote interval, inference deadline, inventory/capital limits and a latched session loss or spend stop. Suppressed paper orders cannot remain resting. Live stop attempts cancellation of known resting orders, reports failures and never claims liquidation or guaranteed loss limits. No automatic startup deposits by default.
- R4 Jev instructions describe actual post-only maker execution and allow hold. Malformed decisions are rejected before any order. Probabilities are explicitly uncalibrated scores, never profit forecasts.
- R5 A reproducible offline recorded-session replay/backtest consumes individual block/fill/receipt journal events without double counting; measures net equity return, maximum drawdown, turnover, costs and fill counts. It rejects empty, malformed or economically impossible input. It must distinguish observed paper fills, synthetic fixtures and live fills. No future-data signals, fabricated executions, leverage, annualization or daily/weekly profit inference from a short sample.
- R6 Capture one bounded current real-market/mock paper session locally and evaluate it; record public deployment health separately. If data access fails or sample has no trades, state that outcome rather than fabricating a backtest. Save timestamps, source identifiers, data hash and limitations; demonstrate arithmetic for +900% and repeated per-block gas burden.
- R7 Portuguese operating guide/report identifies missing API/wallet/account dependencies, spot-versus-leverage limitations, verified primary-source wallet/on-off ramp network compatibility, Pix/Nubank path, fees/KYC uncertainty and safe exact setup commands. No transfer route is called verified solely because an exchange lists an asset.
- R8 A distinct reviewer independently inspects a fixed isolated candidate against R1-R7 and runs relevant tests/type checking. Report unresolved blockers and actual local versus deployed state. No self approval or unstated activation.

## Agreed test seams

Config parser/readiness CLI; Trader.onBlock observable order/event behavior using fake market/model; offline replay public function and CLI using independently hand-worked fixtures. Approved by actual Jev delegated assessment bb25f33a-4804-4ef8-ac0c-d267d7344eee, model jev-1.13.0, approved_by=jev_delegated, human_response=false. Advice supplies no authority.

## Implementation ownership

Coordinator owns src/config.ts, src/trader.ts, src/market.ts, src/model.ts, src/risk.ts, readiness/start/capture integration, root scripts/docs and their tests. Isolated implementer exclusively owns src/backtest.ts, scripts/backtest.ts and src/backtest.test.ts. Researcher writes outside the repository. Reviewer uses an isolated final copy. No pushes/commits.

## Evidence and exclusions

Baseline type checking passes with Bun 1.3.14 at C:/Users/gabri/.bun/bin/bun.exe. Local .env absent. Public deployment read on 2026-10-09: Jev label, wallet null, dryRun true, zero decisions/trades after 1,616,182 blocks; its 1000 records are sparse late holds rather than a successful strategy sample. Current Monad RPC chainId=143. Original paper gas is zero, P&L omits AI cost, model prompt describes IOC while executor is post-only, and startup automatically deposits assets when a key is supplied.

No derivatives integration, borrowing, guaranteed profitability, production deployment, credential recovery from another application's billing scope, wallet creation or unattended long-running execution in this delivery. A session loss stop is not an on-chain stop-loss. Paper matching omits queue priority, latency competition, adverse selection and transfer/tax costs; profitability qualification needs longer independent out-of-sample data and fill reconciliation.
