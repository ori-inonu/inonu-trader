// Shared test values for the order modules. origin: synthetic_fixture, tests only: every address and amount is made up. Nothing outside the tests imports this file.
import type { ApproveAnswer, Order, RouteToken, SwapAnswer, Trust } from "./order";
import { DEFAULT_TRADE_SETTINGS, type TradeSettings } from "./settings";

export const ACCOUNT = "0xabcdef0123456789abcdef0123456789abcdef01";
export const OTHER_ACCOUNT = "0x1111111111111111111111111111111111111111";
export const USDC = "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913";
export const TOKEN = "0xaaaa000000000000000000000000000000000001";
export const ROUTER = "0x1111111254eeb25477b68fb85ed929f73a960582";
export const SPENDER = "0x40aa958dd87fc8305b97f2ba922cddca374bcd7f";
export const NOW = 2_000_000_000_000;
export const HASH_A = `0x${"a1".repeat(32)}`;

export const order = (over: Partial<Order> = {}): Order => ({
  dollarSide: "from",
  chainIndex: "8453",
  chainIdHex: "0x2105",
  side: "buy",
  from: { address: USDC, symbol: "USDC", decimals: 6 },
  to: { address: TOKEN, symbol: "AAA", decimals: 18 },
  amountMinor: "100000000",
  account: ACCOUNT,
  slippagePct: 1,
  briefHash: "abc123",
  ...over,
});

const token = (over: Partial<RouteToken> = {}): RouteToken => ({ address: USDC, symbol: "USDC", decimals: 6, unitPriceUsd: 1, taxRate: 0, isHoneyPot: false, ...over });

export const swap = (over: { tx?: Partial<SwapAnswer["tx"]>; route?: Partial<SwapAnswer["route"]>; chainIndex?: string | null; family?: SwapAnswer["family"] } = {}): SwapAnswer => ({
  chainIndex: over.chainIndex === undefined ? "8453" : over.chainIndex,
  family: over.family ?? "evm",
  tx: {
    from: ACCOUNT, to: ROUTER, data: "0x12aa3caf0000", value: "0", gas: "250000", gasPrice: "1000000", maxPriorityFeePerGas: "100000",
    minReceiveAmount: "247500000000000000000", slippagePercent: 1, ...over.tx,
  },
  route: {
    fromAmount: "100000000", toAmount: "250000000000000000000", priceImpactPct: 0.12, tradeFee: 0.4, estimateGasFee: 180000, dexNames: ["Uniswap V3"],
    fromToken: token(), toToken: token({ address: TOKEN, symbol: "AAA", decimals: 18, unitPriceUsd: 0.4 }), ...over.route,
  },
});

const word = (hex: string): string => hex.replace(/^0x/, "").toLowerCase().padStart(64, "0");
export const approveData = (spender: string, amount: bigint): string => `0x095ea7b3${word(spender)}${word(`0x${amount.toString(16)}`)}`;

export const approval = (over: Partial<ApproveAnswer> = {}): ApproveAnswer => ({ data: approveData(SPENDER, BigInt("100000000")), spender: SPENDER, gasLimit: "50000", gasPrice: "1000000", ...over });

/** What the person trusts on Base in most tests: the router of the swap fixture and the address of the approval fixture. */
export const TRUST: Trust = { routers: [ROUTER], spenders: [SPENDER] };

export const settingsOn = (over: Partial<TradeSettings> = {}): TradeSettings => ({
  ...DEFAULT_TRADE_SETTINGS, enabled: true, perOperationUsd: 200, dailyUsd: 500, trustedRouters: { "8453": [ROUTER] }, trustedSpenders: { "8453": [SPENDER] }, ...over,
});

/** A storage in memory, the way the browser keeps one: what one store writes another store on the same storage reads (the tabs of one browser). */
export function memoryStorage(initial: Record<string, string> = {}) {
  const map = new Map(Object.entries(initial));
  return { getItem: (k: string) => map.get(k) ?? null, setItem: (k: string, v: string) => void map.set(k, v), removeItem: (k: string) => void map.delete(k), map };
}
