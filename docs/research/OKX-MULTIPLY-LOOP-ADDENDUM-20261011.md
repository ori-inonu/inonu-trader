# Multiply / Loop — resource matrix addendum

Observed 2026-10-11. Own conversation: 01a12971-f941-7e42-8a42-fab6d44d4eb5. Baseline integrator: f626a3026a524f61d7e9f7baf6ad6c54ebf89a6c. Research only; no implementation approval, signing, allowance or execution. This additive document preserves the prior independent matrix and frozen preview acceptance.

## Primary evidence

S1: [OKX Multiply guide](https://web3.okx.com/sv/learn/dex-multiply), published/updated 2026-09-08, read 2026-10-11. The guide describes Aave-backed long/short BTC, ETH and SOL positions on X Layer, with USDT input/settlement. Advertised launch caps differ by asset/direction and depend on funds, account Health Factor and pool capacity. Fees, borrowing rates, slippage and price impact affect returns. Health Factor aggregates account positions. Multiply requires E-Mode off; simultaneous Loop needs another wallet. Closing repays debt and leaves remaining assets supplied in Aave. Wallet-product gas coverage does not establish API gas sponsorship. Regional availability remains unknown.

S2: [OKX smart-contract documentation](https://web3.okx.com/onchainos/dev-docs/trade/dex-smart-contract), read 2026-10-11. Its leveraged-trading table lists X Layer Multiply `0x18a6704775570afA8dB0D3FC0242515D90d120C0` and Loop `0x714A871d3B471FF7Ee6A1896B16c5f55884fd910`. These are discovery evidence, not execution allowlists. The swap guidance requires API-returned router/approval addresses because documentation and responses may change at different times. Separate exactOut addresses also exist. No deployment/ABI correspondence has been verified here.

## Additive integration matrix

| Resource | Evidence level in this continuation | Missing integration proof | Next specification requirement |
| --- | --- | --- | --- |
| Multiply discovery | Official product guide and contract table | Supported programmable API/SDK; account eligibility; deployed bytecode/ABI; permissions; open/close receipts | Keep capability discovery separate from executable capability. Bind chain, account, deployment and exact payload. No inference from address presence. |
| Loop discovery | Contract table; E-Mode interaction described in Multiply guide | Loop-specific full behavior, rates, assets, leverage caps, programmable API and redemption | Research dedicated primary documentation before proposing adapter behavior. Never copy Multiply assumptions into Loop. |
| Account risk | Aggregate Health Factor and E-Mode constraints documented | Fresh onchain account state; oracle/unit/decimal provenance; liquidation parameters; debt/supply accrual | Evaluate all collateral/debt and proposed positions together, preserving source block/time. Treat missing risk fields as unknown. |
| Economics | Product advertises debt costs, service costs, slippage and price impact | API fee schedule; sponsorship applicability; execution gas; time horizon; exit liquidity | Calculate net outcomes across opening, holding and closing. Do not label gross leverage or supply APR as profit. |
| Wallet separation | Product requires distinct wallets for simultaneous Loop/Multiply | User-owned accounts, access policies, credential/custody support | Model wallet/account identity and E-Mode explicitly. Do not create wallets or authorize transfers from advisory decisions. |
| Exit and reconciliation | Product closing repays debt; remainder can stay in Aave | Receipt-confirmed debt repayment, residual collateral and redeemability | Distinguish position closed, debt settled, collateral supplied and wallet funds available; reconcile before attributing realized profit. |

## Implications for JEV, not a new execution grant

The above requirements are derived architecture hypotheses to specify and independently review, not delivered features. A typed assessment should identify capability status, observed account/network, source time/block, position direction, proposed notional, accrued debt, costs, liquidity and liquidation stress. Advisory decisions cannot substitute missing observations. An account-level risk gate remains deterministic and must run again against fresh data before any separately authorized handoff.

Continue the approved HTTP-preview cycle independently. Do not widen its files or frozen P1–P6 for this research. The wider operational goal still requires operator amount/router/cost corrections, live-data qualification, paired JEV/baseline evidence, reviewed integrations and visible localhost behavior. No provider inference, RPC, wallet connection, financial operation or installation occurred during this collection.
