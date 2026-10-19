/**
 * The arguments of a swap with the OKX CLI, built from an order the code worked out (AUT-7, AUT-14). Flags are the ones OKX documents in the CLI reference of its Agentic Wallet skill
 * (`swap quote|execute`: `--from --to --readable-amount|--amount --chain [--wallet] [--max-auto-slippage]`), and checked against the real tool's own help. Every amount is RAW units: a readable amount makes the tool
 * look up the decimals of the token at OKX, a call that has its own quota and can fail on it ("Failed to fetch token decimals"), and the code already knows the decimals of the coin it pays in. The chain is
 * written as the tool names it (ethereum, bsc, base...). The native coin has the aggregator's own address on each family. `--force` is never built, and an argument that could be read as a flag or carries a control character is refused here, before any
 * process exists. Pure.
 */
import { PROFILES, type ProfileId } from "./plans";
import type { Book, PlannedOrder } from "./types";

/** How the aggregator addresses the native coin (OKX DEX aggregation FAQ). */
export const NATIVE_EVM = "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";
export const NATIVE_SOLANA = "11111111111111111111111111111111";

export const swapAddress = (chainIndex: string, address: string): string => (address === "native" ? (chainIndex === "501" ? NATIVE_SOLANA : NATIVE_EVM) : address);

export interface SettlementCoin {
  readonly address: string;
  readonly symbol: string;
  /** The decimals of the coin, when they are known and checked; null makes the purchase fall back to the tool's own lookup. */
  readonly decimals: number | null;
}

/** The name the tool uses for each network (`--chain ethereum`). A network that is not here is passed as its number, which the tool also takes. */
export const CHAIN_NAME: Readonly<Record<string, string>> = { "1": "ethereum", "56": "bsc", "8453": "base", "42161": "arbitrum", "137": "polygon", "10": "optimism", "501": "solana", "196": "xlayer" };

/** Well-known dollar coins, used only when the managed wallet holds none on the network. A network that is not here has no fallback: the order is dropped rather than settled in a guess. */
export const KNOWN_DOLLARS: Readonly<Record<string, SettlementCoin>> = {
  "1": { address: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48", symbol: "USDC", decimals: 6 },
  "56": { address: "0x55d398326f99059ff775485246999027b3197955", symbol: "USDT", decimals: 18 },
  "8453": { address: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913", symbol: "USDC", decimals: 6 },
  "42161": { address: "0xaf88d065e77c8cc2239327c5edb3a432268e5831", symbol: "USDC", decimals: 6 },
  "137": { address: "0x3c499c542cef5e3811e1192ce70d8cc03d5c3359", symbol: "USDC", decimals: 6 },
  "10": { address: "0x0b2c639c533813f4aa9d7837caf62653d097ff85", symbol: "USDC", decimals: 6 },
  "501": { address: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", symbol: "USDC", decimals: 6 },
};

/** The dollar coin a purchase is paid in and a sale settles in: the biggest one the managed wallet holds on that network, else the well-known one, else none. */
export function settlementFor(book: Book, chainIndex: string): SettlementCoin | null {
  let best: { readonly usd: number; readonly coin: SettlementCoin } | null = null;
  for (const p of book.positions) {
    if (!p.isCash || p.wallet !== "agente" || p.chainIndex !== chainIndex || p.usd === null || p.usd <= 0 || p.address === "native") continue;
    if (best === null || p.usd > best.usd) best = { usd: p.usd, coin: { address: p.address, symbol: p.symbol, decimals: p.decimals } };
  }
  return best?.coin ?? KNOWN_DOLLARS[chainIndex] ?? null;
}

/** The most slippage each kind of order accepts, in percent. Getting out of a position that the plan demands may accept the most. These are CHOICES of this code, not calibrated. */
export const SLIPPAGE_CAP_PCT = { buy: 2, sell: 3, protecao: 8 } as const;

/**
 * What a purchase may pay to get in, in percent, for the profile it opens: a third of that profile's stop, under the ceiling of the code. The slippage it accepts and the price impact it is quoted at are each held to it, so that
 * together they stay under the stop: a plan of "leave if it falls 1.5" must not be stopped out by the price its own order paid (which would sell at a loss, with fees, the minute after buying). A profile that is not
 * one of ours gets the ceiling.
 */
/** A purchase accepts as price impact and slippage at most the stop of its profile divided by this: a third. */
export const BUY_COST_STOP_DIVISOR = 3;
export function buyCostCapPct(profile: string | null, ceilingPct: number): number {
  const spec = profile !== null && Object.hasOwn(PROFILES, profile) ? PROFILES[profile as ProfileId] : null;
  return spec === null ? ceilingPct : Math.min(ceilingPct, Math.floor((spec.stopPct / BUY_COST_STOP_DIVISOR) * 100) / 100);
}

const ADDRESS = /^[A-Za-z0-9]{20,64}$/;
const CHAIN = /^[1-9]\d{0,11}$/;
const READABLE = /^\d+(\.\d{1,6})?$/;
const RAW = /^[1-9]\d*$/;

/**
 * A dollar amount as the digits it is written with, cut DOWN to `places` decimals (never rounded up: a rounded-up amount could be one unit above what the wallet holds). The shortest decimal the number prints as is
 * used, so 0.3 is 0.3 and not 0.29999999999999998; a number that prints with an exponent is expanded first. Null for anything that is not a positive finite amount or that is zero after the cut.
 */
function decimalDigits(usd: number, places: number): { readonly whole: string; readonly fraction: string } | null {
  if (!Number.isFinite(usd) || usd <= 0 || !Number.isInteger(places) || places < 0 || places > 30) return null;
  const printed = /e/i.test(String(usd)) ? usd.toFixed(Math.min(30, places + 6)) : String(usd);
  const [whole = "0", fraction = ""] = printed.split(".");
  const cut = fraction.slice(0, places);
  return /^0*$/.test(whole + cut) ? null : { whole, fraction: cut };
}

/** The raw units of a coin with `decimals` places for a dollar amount, cut down; null when that is not a positive whole number of units. */
export function usdToRaw(usd: number, decimals: number): bigint | null {
  const d = decimalDigits(usd, decimals);
  return d === null ? null : BigInt(d.whole + d.fraction.padEnd(decimals, "0"));
}

function checked(value: string, pattern: RegExp, what: string): string {
  if (!pattern.test(value)) throw new Error(`swap argument refused: ${what}`);
  return value;
}

export type SwapPhase = "quote" | "execute";

/** The command line after the binary. Throws on anything that cannot be a well-formed order. */
export function buildSwapArgs(phase: SwapPhase, order: PlannedOrder, settle: SettlementCoin, wallet: string): string[] {
  const chainIndex = checked(order.chainIndex, CHAIN, "chain");
  const chain = CHAIN_NAME[chainIndex] ?? chainIndex;
  const token = checked(swapAddress(order.chainIndex, order.address), ADDRESS, "token");
  const coin = checked(settle.address, ADDRESS, "settlement coin");
  const owner = checked(wallet, ADDRESS, "wallet");
  const args: string[] = ["swap", phase];
  if (order.side === "buy") {
    if (!Number.isFinite(order.usd) || order.usd <= 0) throw new Error("swap argument refused: amount");
    const decimals = settle.decimals;
    if (decimals !== null && Number.isInteger(decimals) && decimals >= 2 && decimals <= 24) {
      // raw units of the coin it pays in, at the precision of the coin and cut down (never to the cent, never up): nothing for the tool to look up
      const raw = usdToRaw(order.usd, decimals);
      if (raw === null) throw new Error("swap argument refused: amount");
      args.push("--from", coin, "--to", token, "--amount", checked(raw.toString(), RAW, "amount"));
    } else {
      const d = decimalDigits(order.usd, 6);
      if (d === null) throw new Error("swap argument refused: amount");
      args.push("--from", coin, "--to", token, "--readable-amount", checked(d.fraction === "" ? d.whole : `${d.whole}.${d.fraction}`, READABLE, "amount"));
    }
  } else {
    if (order.amountMinor === null) throw new Error("swap argument refused: amount");
    args.push("--from", token, "--to", coin, "--amount", checked(order.amountMinor, RAW, "amount"));
  }
  args.push("--chain", chain);
  if (phase === "execute") {
    const cap = order.source === "protecao" ? SLIPPAGE_CAP_PCT.protecao : order.side === "buy" ? buyCostCapPct(order.profile, SLIPPAGE_CAP_PCT.buy) : SLIPPAGE_CAP_PCT.sell;
    args.push("--wallet", owner, "--max-auto-slippage", String(cap));
  }
  return args;
}
