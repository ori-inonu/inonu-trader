import { createHash } from "node:crypto";
import type { ChainInventory, InventoryAsset, InventorySnapshot } from "../okx-wallet/portfolio";
import { chainByIndex } from "../okx-wallet/chains";
import type { AssetRef, CostBreakdown, OperatorPolicy, OpportunityCandidate } from "./types";

/**
 * Candidate builders. Each adapter is injected so the same code runs on
 * synthetic fixtures, recorded quotes or the authenticated OKX client. A builder
 * that lacks evidence emits a candidate with null fields; the gate rejects it with
 * a reason instead of guessing.
 */

/** OKX DEX uses these placeholders for the native coin. */
export const EVM_NATIVE_PLACEHOLDER = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";
export const SOLANA_NATIVE_PLACEHOLDER = "11111111111111111111111111111111";

export interface TradingPair {
  chainIndex: string;
  /** The asset the plan starts and ends in (usually a stablecoin). */
  base: AssetRef;
  /** The asset bought and sold back inside the round trip. */
  counter: AssetRef;
}

/** Stablecoin to native coin pairs per chain; addresses are public token contracts. */
export const DEFAULT_PAIRS: readonly TradingPair[] = [
  { chainIndex: "143", base: { chainIndex: "143", tokenContractAddress: "0x754704Bc059F8C67012fEd69BC8A327a5aafb603", symbol: "USDC", decimals: 6 }, counter: { chainIndex: "143", tokenContractAddress: EVM_NATIVE_PLACEHOLDER, symbol: "MON", decimals: 18 } },
  { chainIndex: "196", base: { chainIndex: "196", tokenContractAddress: "0x1E4a5963aBFD975d8c9021ce480b42188849D41d", symbol: "USDT", decimals: 6 }, counter: { chainIndex: "196", tokenContractAddress: EVM_NATIVE_PLACEHOLDER, symbol: "OKB", decimals: 18 } },
  { chainIndex: "501", base: { chainIndex: "501", tokenContractAddress: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", symbol: "USDC", decimals: 6 }, counter: { chainIndex: "501", tokenContractAddress: SOLANA_NATIVE_PLACEHOLDER, symbol: "SOL", decimals: 9 } },
  { chainIndex: "1", base: { chainIndex: "1", tokenContractAddress: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", symbol: "USDC", decimals: 6 }, counter: { chainIndex: "1", tokenContractAddress: EVM_NATIVE_PLACEHOLDER, symbol: "ETH", decimals: 18 } },
  { chainIndex: "56", base: { chainIndex: "56", tokenContractAddress: "0x55d398326f99059fF775485246999027B3197955", symbol: "USDT", decimals: 18 }, counter: { chainIndex: "56", tokenContractAddress: EVM_NATIVE_PLACEHOLDER, symbol: "BNB", decimals: 18 } },
  { chainIndex: "8453", base: { chainIndex: "8453", tokenContractAddress: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", symbol: "USDC", decimals: 6 }, counter: { chainIndex: "8453", tokenContractAddress: EVM_NATIVE_PLACEHOLDER, symbol: "ETH", decimals: 18 } },
  { chainIndex: "42161", base: { chainIndex: "42161", tokenContractAddress: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831", symbol: "USDC", decimals: 6 }, counter: { chainIndex: "42161", tokenContractAddress: EVM_NATIVE_PLACEHOLDER, symbol: "ETH", decimals: 18 } },
  { chainIndex: "137", base: { chainIndex: "137", tokenContractAddress: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359", symbol: "USDC", decimals: 6 }, counter: { chainIndex: "137", tokenContractAddress: EVM_NATIVE_PLACEHOLDER, symbol: "POL", decimals: 18 } },
  { chainIndex: "10", base: { chainIndex: "10", tokenContractAddress: "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85", symbol: "USDC", decimals: 6 }, counter: { chainIndex: "10", tokenContractAddress: EVM_NATIVE_PLACEHOLDER, symbol: "ETH", decimals: 18 } },
];

export interface SwapQuote {
  fromAmountAtomic: string;
  toAmountAtomic: string;
  priceImpactPercent: number | null;
  /** Estimated network fee in USD as reported by the quote route. */
  tradeFeeUsd: number | null;
  receivedAtMs: number;
}

export interface SwapQuoter {
  /** True only when the provider's output unit is confirmed atomic; otherwise round trips stay research only. */
  readonly unitsQualified: boolean;
  quote(input: { chainIndex: string; fromTokenAddress: string; toTokenAddress: string; amountAtomic: string }): Promise<SwapQuote>;
}

export interface BridgeQuote {
  fromAmountAtomic: string;
  toAmountAtomic: string;
  /** Minimum the destination receives at the quoted slippage. */
  minimumReceivedAtomic: string | null;
  totalFeeUsd: number | null;
  estimatedMinutes: number | null;
  receivedAtMs: number;
}

export interface BridgeQuoter {
  /** True only when the cross-chain quote contract (path, units, slippage convention) is confirmed. */
  readonly qualified: boolean;
  quote(input: { fromChainIndex: string; toChainIndex: string; fromTokenAddress: string; toTokenAddress: string; amountAtomic: string }): Promise<BridgeQuote>;
}

export interface DefiProduct {
  id: string;
  name: string;
  chainIndex: string;
  tokenContractAddress: string;
  apyPercent: number | null;
  tvlUsd: number | null;
  /** Estimated subscribe network fee in USD when known. */
  subscribeFeeUsd: number | null;
}

export interface DefiSource {
  products(chainIndex: string, tokenContractAddress: string): Promise<DefiProduct[]>;
}

export interface CandidateContext {
  inventory: InventorySnapshot;
  policy: OperatorPolicy;
  nowMs: number;
  /** Live clock for quote age; defaults to the fixed nowMs. */
  now?: () => number;
  pairs?: readonly TradingPair[];
  swapQuoter?: SwapQuoter;
  bridgeQuoter?: BridgeQuoter;
  defiSource?: DefiSource;
  /** Chain where bridged stablecoins should land; usually the Kuru venue. */
  homeChainIndex?: string;
  yieldHorizonDays?: number;
  /** Research-only candidates from other sources (funding carry, memepump), appended as is. */
  extraCandidates?: OpportunityCandidate[];
}

function sameToken(chainIndex: string, left: string, right: string): boolean {
  return chainByIndex(chainIndex)?.kind === "evm" ? left.toLowerCase() === right.toLowerCase() : left === right;
}

function findAsset(chain: ChainInventory | undefined, ref: AssetRef): InventoryAsset | undefined {
  if (!chain) return undefined;
  const nativeRequested = ref.tokenContractAddress === EVM_NATIVE_PLACEHOLDER || ref.tokenContractAddress === SOLANA_NATIVE_PLACEHOLDER;
  return chain.assets.find((asset) => nativeRequested ? asset.native : sameToken(ref.chainIndex, asset.tokenContractAddress, ref.tokenContractAddress));
}

function atomicFromUsd(sizeUsd: number, priceUsd: number, decimals: number): string {
  const units = sizeUsd / priceUsd;
  const scaled = BigInt(Math.floor(units * 10 ** Math.min(decimals, 15))) * BigInt(10) ** BigInt(Math.max(0, decimals - 15));
  return scaled.toString();
}

function usdFromAtomic(atomic: string, decimals: number, priceUsd: number): number {
  return (Number(BigInt(atomic)) / 10 ** decimals) * priceUsd;
}

function hashQuotes(parts: unknown[]): string {
  return createHash("sha256").update(JSON.stringify(parts)).digest("hex").slice(0, 32);
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 24);
}

/** Capital one candidate may commit from an asset: policy caps and 90% of the asset's value. */
export function sizeFor(asset: InventoryAsset, inventory: InventorySnapshot, policy: OperatorPolicy): number | null {
  if (asset.valueUsd === null || asset.priceUsd === null || asset.priceUsd <= 0) return null;
  const capital = inventory.knownValueUsd > 0 ? inventory.knownValueUsd * policy.maxCapitalFraction : policy.maxPlanUsd;
  const size = Math.min(policy.maxPlanUsd, capital, asset.valueUsd * 0.9);
  return size > 0 ? Math.floor(size * 100) / 100 : null;
}

export async function buildRoundTripCandidates(context: CandidateContext): Promise<OpportunityCandidate[]> {
  const { inventory, policy, nowMs } = context;
  const pairs = context.pairs ?? DEFAULT_PAIRS;
  const quoter = context.swapQuoter;
  if (!quoter) return [];
  const candidates: OpportunityCandidate[] = [];
  for (const pair of pairs) {
    const chain = inventory.chains.find((entry) => entry.chainIndex === pair.chainIndex);
    const base = findAsset(chain, pair.base);
    if (!chain || !base || base.balance === null || base.balance <= 0) continue;
    const sizeUsd = sizeFor(base, inventory, policy);
    if (sizeUsd === null || pair.base.decimals === null) continue;
    const amountAtomic = atomicFromUsd(sizeUsd, base.priceUsd!, pair.base.decimals);
    if (amountAtomic === "0") continue;
    const id = `rt_${pair.chainIndex}_${slug(pair.base.symbol)}_${slug(pair.counter.symbol)}`;
    try {
      const leg1 = await quoter.quote({ chainIndex: pair.chainIndex, fromTokenAddress: pair.base.tokenContractAddress, toTokenAddress: pair.counter.tokenContractAddress, amountAtomic });
      const leg2 = await quoter.quote({ chainIndex: pair.chainIndex, fromTokenAddress: pair.counter.tokenContractAddress, toTokenAddress: pair.base.tokenContractAddress, amountAtomic: leg1.toAmountAtomic });
      const grossUsd = usdFromAtomic(leg2.toAmountAtomic, pair.base.decimals, base.priceUsd!) - sizeUsd;
      const networkFeeUsd = leg1.tradeFeeUsd !== null && leg2.tradeFeeUsd !== null ? leg1.tradeFeeUsd + leg2.tradeFeeUsd : null;
      const costs: CostBreakdown = { networkFeeUsd, tradingFeeUsd: 0, inferenceUsd: policy.inferenceUsdPerCandidate, complete: networkFeeUsd !== null };
      const impact = leg1.priceImpactPercent !== null && leg2.priceImpactPercent !== null ? Math.max(Math.abs(leg1.priceImpactPercent), Math.abs(leg2.priceImpactPercent)) : null;
      candidates.push({
        id, kind: "dex_round_trip", title: `Round trip ${pair.base.symbol} to ${pair.counter.symbol} and back on ${chain.chainName}`,
        chainIndex: pair.chainIndex, from: pair.base, to: pair.counter, sizeUsd, sizeAtomic: amountAtomic,
        expectedOutAtomic: leg2.toAmountAtomic, expectedLeg1OutAtomic: leg1.toAmountAtomic, pairKey: `${pair.chainIndex}:${pair.base.symbol}/${pair.counter.symbol}`,
        netUsd: costs.complete ? grossUsd - networkFeeUsd! - costs.inferenceUsd : null,
        priceImpactPercent: impact, costs,
        quoteAgeMs: (context.now ? context.now() : nowMs) - Math.min(leg1.receivedAtMs, leg2.receivedAtMs),
        quoteHash: hashQuotes([pair.chainIndex, amountAtomic, leg1.toAmountAtomic, leg2.toAmountAtomic, leg1.receivedAtMs, leg2.receivedAtMs]),
        notes: [`gross ${grossUsd.toFixed(6)} USD before network fees`, ...(quoter.unitsQualified ? [] : ["output unit of the quote not qualified; research only until OPERATOR_TRUST_QUOTE_UNITS=true"])],
        researchOnly: !quoter.unitsQualified,
      });
    } catch (error) {
      candidates.push({
        id, kind: "dex_round_trip", title: `Round trip ${pair.base.symbol} to ${pair.counter.symbol} on ${chain.chainName}`,
        chainIndex: pair.chainIndex, from: pair.base, to: pair.counter, sizeUsd, sizeAtomic: amountAtomic, expectedOutAtomic: null,
        expectedLeg1OutAtomic: null, pairKey: `${pair.chainIndex}:${pair.base.symbol}/${pair.counter.symbol}`,
        netUsd: null, priceImpactPercent: null,
        costs: { networkFeeUsd: null, tradingFeeUsd: null, inferenceUsd: policy.inferenceUsdPerCandidate, complete: false },
        quoteAgeMs: null, quoteHash: null, notes: [`quote_failed: ${error instanceof Error ? error.message : "unknown"}`], researchOnly: false,
      });
    }
  }
  return candidates;
}

export async function buildBridgeCandidates(context: CandidateContext): Promise<OpportunityCandidate[]> {
  const { inventory, policy, nowMs } = context;
  const quoter = context.bridgeQuoter;
  const home = context.homeChainIndex;
  if (!quoter || !home) return [];
  const pairs = context.pairs ?? DEFAULT_PAIRS;
  const homePair = pairs.find((pair) => pair.chainIndex === home);
  if (!homePair) return [];
  const candidates: OpportunityCandidate[] = [];
  for (const pair of pairs) {
    if (pair.chainIndex === home) continue;
    const chain = inventory.chains.find((entry) => entry.chainIndex === pair.chainIndex);
    const base = findAsset(chain, pair.base);
    if (!chain || !base || base.balance === null || base.balance <= 0) continue;
    const sizeUsd = sizeFor(base, inventory, policy);
    if (sizeUsd === null || pair.base.decimals === null || homePair.base.decimals === null) continue;
    const amountAtomic = atomicFromUsd(sizeUsd, base.priceUsd!, pair.base.decimals);
    if (amountAtomic === "0") continue;
    const id = `br_${pair.chainIndex}_${home}_${slug(pair.base.symbol)}`;
    try {
      const quote = await quoter.quote({ fromChainIndex: pair.chainIndex, toChainIndex: home, fromTokenAddress: pair.base.tokenContractAddress, toTokenAddress: homePair.base.tokenContractAddress, amountAtomic });
      const received = quote.minimumReceivedAtomic ?? quote.toAmountAtomic;
      const grossUsd = usdFromAtomic(received, homePair.base.decimals, 1) - sizeUsd;
      const costs: CostBreakdown = { networkFeeUsd: quote.totalFeeUsd, tradingFeeUsd: 0, inferenceUsd: policy.inferenceUsdPerCandidate, complete: quote.totalFeeUsd !== null };
      candidates.push({
        id, kind: "cross_chain_rebalance", title: `Bridge ${pair.base.symbol} from ${chain.chainName} to ${homePair.base.symbol} on ${chainByIndex(home)?.name ?? home}`,
        chainIndex: pair.chainIndex, toChainIndex: home, from: pair.base, to: homePair.base, sizeUsd, sizeAtomic: amountAtomic,
        expectedOutAtomic: received, expectedLeg1OutAtomic: received, pairKey: `${pair.chainIndex}->${home}:${pair.base.symbol}`,
        netUsd: costs.complete ? grossUsd - quote.totalFeeUsd! - costs.inferenceUsd : null,
        priceImpactPercent: 0, costs, quoteAgeMs: (context.now ? context.now() : nowMs) - quote.receivedAtMs,
        quoteHash: hashQuotes([pair.chainIndex, home, amountAtomic, received, quote.receivedAtMs]),
        notes: [quote.estimatedMinutes === null ? "arrival time unknown" : `arrival about ${quote.estimatedMinutes} min`, "stablecoin valued at 1 USD on arrival; not a guarantee", ...(quoter.qualified ? [] : ["cross-chain quote contract not qualified; research only until OPERATOR_TRUST_BRIDGE_API=true"])],
        researchOnly: !quoter.qualified,
      });
    } catch (error) {
      candidates.push({
        id, kind: "cross_chain_rebalance", title: `Bridge ${pair.base.symbol} from ${chain.chainName}`,
        chainIndex: pair.chainIndex, toChainIndex: home, from: pair.base, to: homePair.base, sizeUsd, sizeAtomic: amountAtomic, expectedOutAtomic: null,
        expectedLeg1OutAtomic: null, pairKey: `${pair.chainIndex}->${home}:${pair.base.symbol}`,
        netUsd: null, priceImpactPercent: null, costs: { networkFeeUsd: null, tradingFeeUsd: null, inferenceUsd: policy.inferenceUsdPerCandidate, complete: false },
        quoteAgeMs: null, quoteHash: null, notes: [`quote_failed: ${error instanceof Error ? error.message : "unknown"}`], researchOnly: false,
      });
    }
  }
  return candidates;
}

/** The existing every-block Kuru maker stays a mandate Jev can keep or hold back. */
export function buildKuruMandate(context: CandidateContext): OpportunityCandidate[] {
  const chain = context.inventory.chains.find((entry) => entry.chainIndex === "143");
  const pair = (context.pairs ?? DEFAULT_PAIRS).find((entry) => entry.chainIndex === "143");
  if (!chain || !pair) return [];
  const usdc = findAsset(chain, pair.base);
  const mon = chain.nativeBalance;
  if (!usdc || usdc.balance === null || mon === null) return [];
  return [{
    id: "kuru_mon_usdc_maker", kind: "kuru_spot_maker", title: "Keep inventory on the every-block Jev maker for MON/USDC on Kuru",
    chainIndex: "143", from: pair.base, to: pair.counter, pairKey: "143:kuru:MON/USDC",
    sizeUsd: usdc.valueUsd, sizeAtomic: "0", expectedOutAtomic: null, expectedLeg1OutAtomic: null, netUsd: null, priceImpactPercent: null,
    costs: { networkFeeUsd: null, tradingFeeUsd: null, inferenceUsd: context.policy.inferenceUsdPerCandidate, complete: false },
    quoteAgeMs: null, quoteHash: null,
    notes: [`MON ${mon} and USDC ${usdc.balanceText} observed on Monad`, "realized result comes from the trader journal, not from this candidate"],
    researchOnly: false,
  }];
}

export async function buildYieldCandidates(context: CandidateContext): Promise<OpportunityCandidate[]> {
  const { inventory, policy, nowMs } = context;
  const source = context.defiSource;
  if (!source) return [];
  const horizonDays = context.yieldHorizonDays ?? 7;
  const pairs = context.pairs ?? DEFAULT_PAIRS;
  const candidates: OpportunityCandidate[] = [];
  for (const pair of pairs) {
    const chain = inventory.chains.find((entry) => entry.chainIndex === pair.chainIndex);
    const base = findAsset(chain, pair.base);
    if (!chain || !base || base.balance === null || base.balance <= 0) continue;
    const sizeUsd = sizeFor(base, inventory, policy);
    if (sizeUsd === null || pair.base.decimals === null) continue;
    let products: DefiProduct[];
    try { products = await source.products(pair.chainIndex, pair.base.tokenContractAddress); } catch { continue; }
    for (const product of products.slice(0, 3)) {
      const expected = product.apyPercent === null ? null : sizeUsd * (product.apyPercent / 100) * (horizonDays / 365);
      const costs: CostBreakdown = { networkFeeUsd: product.subscribeFeeUsd, tradingFeeUsd: 0, inferenceUsd: policy.inferenceUsdPerCandidate, complete: product.subscribeFeeUsd !== null };
      candidates.push({
        id: `yl_${pair.chainIndex}_${slug(product.id)}`, kind: "defi_yield", title: `Subscribe ${pair.base.symbol} to ${product.name} on ${chain.chainName} for ${horizonDays} days`,
        chainIndex: pair.chainIndex, from: pair.base, to: pair.base, sizeUsd, sizeAtomic: atomicFromUsd(sizeUsd, base.priceUsd!, pair.base.decimals),
        expectedOutAtomic: null, expectedLeg1OutAtomic: null, pairKey: `${pair.chainIndex}:defi:${product.id}`,
        netUsd: expected !== null && costs.complete ? expected - product.subscribeFeeUsd! - costs.inferenceUsd : null,
        priceImpactPercent: 0, costs, quoteAgeMs: 0,
        quoteHash: hashQuotes([product.id, product.apyPercent, nowMs]),
        notes: [product.apyPercent === null ? "APY not advertised" : `advertised APY ${product.apyPercent}%; realized yield is not guaranteed`, product.tvlUsd === null ? "TVL unknown" : `TVL ${product.tvlUsd} USD`],
        researchOnly: false,
      });
    }
  }
  return candidates;
}

export async function buildCandidates(context: CandidateContext): Promise<OpportunityCandidate[]> {
  const [roundTrips, bridges, yields] = await Promise.all([
    buildRoundTripCandidates(context),
    buildBridgeCandidates(context),
    buildYieldCandidates(context),
  ]);
  return [...buildKuruMandate(context), ...roundTrips, ...bridges, ...yields, ...(context.extraCandidates ?? [])];
}
