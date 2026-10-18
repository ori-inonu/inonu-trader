export function loadConfig(source: Record<string, string | undefined> = process.env) {
const env = (key: string, fallback?: string) => source[key] ?? fallback;
const number = (key: string, fallback: number, min = 0, max = Infinity, integer = false) => {
  const n = source[key] === undefined ? fallback : Number(source[key]);
  if (source[key]?.trim() === "" || !Number.isFinite(n) || n < min || n > max || (integer && !Number.isInteger(n))) throw new Error(`Invalid ${key}`);
  return n;
};
const num = (key: string) => source[key] === undefined ? undefined : number(key, 0, 21000, 30000000, true);
const bool = (key: string, fallback: boolean) => {
  if (source[key] === undefined) return fallback;
  if (source[key] !== "true" && source[key] !== "false") throw new Error(`Invalid ${key}: use true or false`);
  return source[key] === "true";
};
const model = env("MODEL", "mock");
if (model !== "mock" && model !== "jev") throw new Error("Invalid MODEL");
const privateKey = env("PRIVATE_KEY") || undefined;
if (privateKey && !/^0x[0-9a-fA-F]{64}$/.test(privateKey)) throw new Error("Invalid PRIVATE_KEY format");
const dryRun = bool("DRY_RUN", true);
for (const key of ["RPC_URL", "READ_RPC_URL"])
  if (env(key) && !/^https?:\/\//.test(env(key)!)) throw new Error(`Invalid ${key}`);
for (const key of ["MARKET", "MARGIN_ACCOUNT"])
  if (env(key) && !/^0x[0-9a-fA-F]{40}$/.test(env(key)!)) throw new Error(`Invalid ${key}`);
if (model === "jev" && !env("TYPESAFE_AI_API_KEY")) throw new Error("MODEL=jev requires TYPESAFE_AI_API_KEY");
if (!dryRun && (!privateKey || model !== "jev" || env("LIVE_ACK") !== "OWN_FUNDS_RISK")) throw new Error("Live requires PRIVATE_KEY, MODEL=jev, TYPESAFE_AI_API_KEY and LIVE_ACK=OWN_FUNDS_RISK");

const c = {
  rpcUrl: env("RPC_URL", "https://rpc.monad.xyz")!, // sends, receipts, nonce, gas estimation
  readRpcUrl: env("READ_RPC_URL", "https://rpc.monad.xyz")!, // book reads + eth_blockNumber polling + trade logs
  wsUrl: env("WS_URL"), // optional; polling backstop always runs
  chainId: 143,
  market: env("MARKET", "0x065C9d28E428A0db40191a54d33d5b7c71a9C394")!, // Kuru MON-USDC
  /** Kuru MarginAccount this market settles against (slot 73 of the OrderBook proxy; verifiedMarket(market) is true). */
  marginAccount: env("MARGIN_ACCOUNT", "0x2A68ba1833cDf93fa9Da1EEbd7F46242aD8E90c5")!,
  privateKey, dryRun, autoDeposit: bool("AUTO_DEPOSIT", false),
  tradeSizeMon: number("TRADE_SIZE_MON", 200, Number.MIN_VALUE),
  maxPositionMon: number("MAX_POSITION_MON", 1000, Number.MIN_VALUE),
  bankrollUsd: number("BANKROLL_USD", 100, Number.MIN_VALUE),
  /** Quote this many ticks inside the touch (0 = join the best bid/ask). Never crosses: clamps to the touch when the spread is too tight. */
  quoteInsideTicks: number("QUOTE_INSIDE_TICKS", 1, 0, 100, true),
  /** Startup deposits into the Kuru margin account, topped up to these balances. Limit orders draw from margin, not the wallet. */
  marginMon: number("MARGIN_MON", 200),
  marginUsdc: number("MARGIN_USDC", 20),
  // Monad charges gas on the LIMIT, so never estimate per block: estimate once at init (or override) and hardcode.
  gasLimit: num("GAS_LIMIT"),
  gasLimitFallback: 350_000, // batchUpdate: one cancel + one post-only place measured at ~282k for the place alone
  // EIP-1559 type-2 only. Effective price = base + priority, so a high static cap is free.
  maxFeeGwei: number("MAX_FEE_GWEI", 400, Number.MIN_VALUE),
  priorityFeeGwei: number("PRIORITY_FEE_GWEI", 2),
  pendingBlocks: 10, // give up on a tx with no receipt after this many blocks
  refreshBlocks: 200, // how often to refresh the fee estimate, margin balances and the vault check
  horizonBlocks: number("HORIZON_BLOCKS", 100, 1, 10000, true),
  model,
  jevModelId: env("JEV_MODEL_ID", "jev-latest")!,
  jevUsdPerMTok: number("JEV_USD_PER_MTOK", 0.042),
  inferenceBudgetTokens: number("INFERENCE_BUDGET_TOKENS", 2000, 1, 64000, true),
  minNetEdgeUsd: number("MIN_NET_EDGE_USD", 0.001, Number.MIN_VALUE),
  minConfidence: number("MIN_CONFIDENCE", 0.65, 0, 1),
  quoteIntervalBlocks: number("QUOTE_INTERVAL_BLOCKS", 100, 1, 100000, true),
  // Frozen readiness/profit contract (default). false = every-block operator mode: no economic pre-gate, decide on every block.
  economicGate: bool("ECONOMIC_GATE", true),
  maxDecisionMs: number("MAX_DECISION_MS", 1500, 1),
  maxLossUsd: number("MAX_LOSS_USD", 2, Number.MIN_VALUE), maxSpendUsd: number("MAX_SPEND_USD", 1, Number.MIN_VALUE),
  maxCapitalFraction: number("MAX_CAPITAL_FRACTION", 0.25, Number.MIN_VALUE, 1),
  makerFeeBps: number("MAKER_FEE_BPS", 0, 0, 10000), journalPath: env("JOURNAL_PATH", "data/session.jsonl")!,
  port: number("PORT", 3000, 1, 65535, true),
  historySize: 1000,
};
if (c.tradeSizeMon > c.maxPositionMon || c.marginMon > c.maxPositionMon || c.priorityFeeGwei > c.maxFeeGwei) throw new Error("Inconsistent size/fee limits");
return c;
}
export const config = loadConfig();
