export type Action = "buy" | "sell" | "hold";
export type Side = "buy" | "sell";
/** This block's post-only limit order. `sent` until its receipt lands, then `placed` or `reverted`. */
export interface Quote { side: Side; price: number; size: number; txHash: string | null; gasMon: number | null; gasEstimateMon: number | null; gasEvidence: "estimate" | "pending" | "observed" | "unknown"; cancel: number[]; status: "sent" | "placed" | "reverted" | "lost" | "sim"; orderId: number | null; capped: boolean }
/** A taker hit one of our resting orders. */
export interface Fill { side: Side; size: number; price: number; txHash: string | null; orderId: number; simulated: boolean }
export interface Decision { action: Action; probabilities: { buy: number; sell: number; hold: number }; upIn10: number; latencyMs: number; late: boolean }
export interface Position { side: "long" | "short" | "flat"; size: number; entryPrice: number | null; unrealizedUsd: number; unrealizedMon: number }
export interface Totals { blocks: number; decisions: number; quotes: number; fills: number; reverted: number; lateBlocks: number; jevUsd: number | null; jevCostBasis: "mock-free" | "configured-rate-estimate-not-invoice" | "unknown"; gasMon: number | null; gasUsd: number | null; estimatedGasMon: number; estimatedGasUsd: number; observedGasMon: number | null; observedGasUsd: number | null; costsComplete: boolean; unknownCosts: string[]; realizedUsd: number; pnlUsd: number | null; pnlMon: number | null; pnlPct: number | null }
export interface BlockEvent { block: number; ts: number; mid: number; bestBid: number; bestAsk: number; spreadBps: number; decision: Decision | null; quote: Quote | null; fill: Fill | null; resting: { bidMon: number; askMon: number }; position: Position; totals: Totals }
export interface Meta { model: string; wallet: string | null; dryRun: boolean; market: string; startedAt: number | null; mode?: string; dataSource?: string }
export type ConnectionState = "connecting" | "live" | "reconnecting";
export interface FeedState { meta: Meta | null; events: BlockEvent[]; latest: BlockEvent | null; connection: ConnectionState; avgLatencyMs: number }
