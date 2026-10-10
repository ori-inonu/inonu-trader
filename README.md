# jev-trader

The original demo contract is one Jev price-feed decision and a real Kuru post-only replacement limit order every Monad block, approximately 300 ms, with a live dashboard. The v0.0.2 foundation increment preserves the dashboard and evaluation scheduling, aligns the inherited Jev question metadata and fixes an inherited directional override: code no longer turns a model buy into a sell, or the reverse. A blocked model direction is rejected rather than replaced. It adds separate offline engineering tools, not a replacement trading strategy.

This increment has not independently established live execution, confirmed accounting, profitability or continuous operation. A post-only placement does not guarantee a fill or a positive net result. See [the release scope](docs/RELEASE-v0.0.2.md) for implemented and deferred capabilities.

## Run

    cp .env.example .env
    bun install
    bun run start

Without `PRIVATE_KEY`, the inherited backend uses real book data with simulated fills. Set `MODEL=jev` and `TYPESAFE_AI_API_KEY` to select Jev; the default `mock` is a momentum heuristic stand-in and does not satisfy the Jev demo contract. The commands above can contact providers and, with real credentials, operate financially; they are not part of offline release verification and do not grant that authority.

## Offline verification and tools

    bun --no-env-file install --frozen-lockfile --ignore-scripts
    bun --no-env-file run test:all
    bun --no-env-file run typecheck:all
    bun --no-env-file run build
    bun --no-env-file --no-install src/paper-supervisor-runner.ts --help

Install the frontend's frozen dependencies separately in `web/` before the aggregate commands. The synthetic [capital accounting](docs/PAPER-CAPITAL.md) and [bounded supervisor](docs/PAPER-SUPERVISOR.md) do not connect to wallets or providers. The supervisor requires explicit create/resume arguments and an external local state directory. Its fixture outcomes are not market evidence.

## Endpoints

Inherited example endpoint, not queried or qualified by this increment: https://jev-trader-production.up.railway.app

- `GET /` snapshot: model, wallet, dryRun, latest block event
- `GET /history` last 1000 block events
- `GET /events` SSE: `snapshot` on connect, `block` events for processed blocks, `quote` events for order updates and `fill` events for detected trade fills

Every event (see `src/trader.ts` for types):

    {
      "block": 105488269, "ts": 1789593630676,
      "mid": 0.022636, "bestBid": 0.022628, "bestAsk": 0.022644, "spreadBps": 7.07,
      "decision": { "action": "buy", "probabilities": { "buy": 0.77, "sell": 0.23, "hold": 0 }, "upIn10": 0.77, "latencyMs": 81, "late": false },
      "quote": { "side": "buy", "price": 0.022629, "size": 200, "txHash": "0x…", "gasMon": 0.0357, "cancel": [100295801], "status": "sent", "orderId": null, "capped": false },
      "fill": null,
      "resting": { "bidMon": 200, "askMon": 200 },
      "position": { "side": "short", "size": 200, "entryPrice": 0.022633, "unrealizedUsd": -0.0006, "unrealizedMon": -0.027 },
      "totals": { "blocks": 3, "decisions": 3, "quotes": 3, "fills": 1, "reverted": 0, "lateBlocks": 0, "jevUsd": 0.000004, "gasMon": 0.107, "gasUsd": 0.0024, "realizedUsd": 0, "pnlUsd": -0.003, "pnlMon": -0.13, "pnlPct": -0.003 }
    }

On each non-busy block attempt, the model is asked about the move over `HORIZON_BLOCKS` (default 100, ~30 s), a forecast horizon rather than an inference interval. An eligible `buy` or `sell` is submitted unchanged: a post-only limit order of `TRADE_SIZE_MON`, `QUOTE_INSIDE_TICKS` inside the touch (clamped to the touch when the spread is too tight), in one `batchUpdate` that also cancels known resting orders (`cancel`). If the selected direction fails the existing position or margin checks, or output is hold/non-directional, no new quote is submitted; code does not pick the opposite direction or rewrite the model's call. Quotes submitted by this executor have `capped: false`. Busy blocks are emitted as late holds. The inherited feed coalesces head bursts; every-block real placement/confirmation remains an unmet verification obligation, not a guarantee established by this release. `resting` is our size known to be on the book. `upIn10` equals the buy probability.

The inherited live path broadcasts asynchronously, so the `block` event carries the **intent**, not confirmed placement: `status: "sent"`. At that point `gasMon` is derived from a configured gas limit and fee estimate. This increment has not qualified actual billing, complete receipt/reorg accounting or wallet-balance reconciliation. A subsequent receipt uses its own SSE event:

    event: quote
    data: { "block": 105488269, "quote": { …, "status": "placed", "orderId": 100295812, "gasMon": 0.0357 } }

`status` becomes `placed` (with the order id) or `reverted` (the book moved through the price before the tx landed, or a cancelled order had already filled). No receipt after 10 blocks gives `lost`. Fills are not in our own transactions: someone else's taker order hits our resting one, and the Trade log for it arrives via the same `eth_getLogs` poll that feeds the model. Each block with fills gets its own SSE event, and `position`, `realizedUsd` and `fills` update then:

    event: fill
    data: { "block": 105488271, "fill": { "side": "buy", "size": 200, "price": 0.022629, "txHash": "0x…", "orderId": 100295812, "simulated": false } }

`txHash` is the taker's transaction. In a dry run the quote is `status: "sim"`: the order rests for one block and a real print crossing its price fills it (`simulated: true`).

## Layout

    src/config.ts   env
    src/chain.ts    block feed (WebSocket newHeads + polling backstop, newest block only), raw RPC
    src/book.ts     one-eth_call order book reader (decodes getL2Book, merges the AMM vault)
    src/market.ts   Kuru: read book, hand-encoded batchUpdate (cancel + post-only place), margin deposits, local nonce, async confirmation
    src/model.ts    Model interface, JevModel (AI SDK experimental_evaluate), MockModel
    src/trader.ts   the loop: one in flight, hold when late, position and P&L accounting
    src/server.ts   Bun.serve: snapshot, history, SSE

## The 300 ms budget

A decision and an order have to fit in one block, so the hot loop makes exactly two RPC round trips:
one `eth_call` for the book (~18 ms on the public RPC, `READ_RPC_URL`) and one `eth_sendRawTransaction`
(`RPC_URL`), which returns as soon as the tx is accepted. Nothing else is on the path — no
`eth_estimateGas` (the inherited implementation configures or derives the limit once at
startup), no `eth_sendRawTransactionSync` (it uses asynchronous broadcast), no gas price lookup
(static type-2 fees: `MAX_FEE_GWEI` cap, 2 gwei priority; the effective price is base + priority).
Receipts, the fee estimate and the vault check run off the hot path on later blocks. Historical
mock dry-run numbers from the original README were read p50 18 ms and whole loop p50 100 ms
(80 ms of mock inference delay). They were not remeasured here and are not Jev or live-trading evidence.

    bun run scripts/bench-read.ts     # book reader vs the SDK: exactness and latency
    bun run scripts/dry-encode.ts     # signs a buy and a sell offline, asserts the calldata matches the SDK
