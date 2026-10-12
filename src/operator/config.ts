import { resolve } from "node:path";
import { DEFAULT_INVENTORY_CHAINS, validateChainList } from "../okx-wallet/chains";
import type { OperatorPolicy } from "./types";

/**
 * Policy profiles by phase. "micro" is the default: single plans of at most 5 USD
 * or 5% of the known inventory, 20 USD and 4 plans per day, 15 minute cooldown.
 * "standard" keeps the wider research limits. Explicit OPERATOR_* variables
 * override the profile value but never the hard ceilings below.
 */
export type OperatorProfile = "micro" | "standard";

const PROFILES: Record<OperatorProfile, { maxPlanUsd: number; maxCapitalFraction: number; maxDailyNotionalUsd: number; maxDailyPlans: number; cooldownMs: number; maxDailyLossUsd: number; maxWeeklyLossUsd: number; maxDrawdownUsd: number }> = {
  micro: { maxPlanUsd: 5, maxCapitalFraction: 0.05, maxDailyNotionalUsd: 20, maxDailyPlans: 4, cooldownMs: 15 * 60_000, maxDailyLossUsd: 2, maxWeeklyLossUsd: 5, maxDrawdownUsd: 10 },
  standard: { maxPlanUsd: 25, maxCapitalFraction: 0.25, maxDailyNotionalUsd: 100, maxDailyPlans: 10, cooldownMs: 120_000, maxDailyLossUsd: 5, maxWeeklyLossUsd: 15, maxDrawdownUsd: 30 },
};

/** Hard ceilings no environment variable can exceed (R5 B5). */
export const HARD_LIMITS = {
  maxPlanUsd: 100,
  maxCapitalFraction: 0.5,
  maxDailyNotionalUsd: 500,
  maxDailyPlans: 24,
  minCooldownMs: 60_000,
  maxDailyLossUsd: 25,
  maxGasLimit: 1_500_000,
} as const;

/** Repository root, so state paths never depend on the process working directory (R5 A3). */
export const REPO_ROOT = resolve(import.meta.dir, "..", "..");

export interface OperatorConfig {
  profile: OperatorProfile;
  policy: OperatorPolicy;
  chains: string[];
  /** Wallet address observed by the inventory. Never a private key. */
  address: string | null;
  statePath: string;
  journalPath: string;
  ledgerPath: string;
  lockPath: string;
  intervalMs: number;
  /** Explicit operator gate, separate from the Kuru trader's DRY_RUN and LIVE_ACK. */
  execute: boolean;
  /** OPERATOR_LIVE_ACK=OWN_FUNDS_RISK_OPERATOR; a second, operator-specific acknowledgement. */
  liveAck: boolean;
  /** Dedicated operator EVM key; never the trader's PRIVATE_KEY. */
  evmPrivateKey: string | null;
  /** Base58 Solana secret for a dedicated operator wallet. Solana live stays disabled (R5 C1). */
  solanaSecret: string | null;
  okx: { apiKey: string; secretKey: string; passphrase: string } | null;
  /** RPC per chainIndex for prepared transactions (OPERATOR_RPC_<chainIndex>); https only. */
  rpcByChain: Record<string, string>;
  /** Treat OKX toTokenAmount as atomic for live round trips; default false keeps them research only. */
  trustQuoteUnits: boolean;
  /** Treat the cross-chain quote contract as confirmed; default false keeps bridges research only. */
  trustBridgeApi: boolean;
}

export function loadOperatorConfig(source: Record<string, string | undefined> = process.env, repoRoot = REPO_ROOT): OperatorConfig {
  const number = (key: string, fallback: number, min = 0, max = Infinity) => {
    const raw = source[key];
    if (raw === undefined) return fallback;
    const n = Number(raw);
    if (raw.trim() === "" || !Number.isFinite(n) || n < min || n > max) throw new Error(`Invalid ${key}`);
    return n;
  };
  const bool = (key: string, fallback: boolean) => {
    const raw = source[key];
    if (raw === undefined) return fallback;
    if (raw !== "true" && raw !== "false") throw new Error(`Invalid ${key}: use true or false`);
    return raw === "true";
  };
  const path = (key: string, fallback: string) => {
    const raw = source[key] ?? fallback;
    if (!raw.trim() || /[\u0000-\u001f]/.test(raw)) throw new Error(`Invalid ${key}`);
    return resolve(repoRoot, raw);
  };
  const profileRaw = source.OPERATOR_PROFILE ?? "micro";
  if (profileRaw !== "micro" && profileRaw !== "standard") throw new Error("Invalid OPERATOR_PROFILE: use micro or standard");
  const profile = PROFILES[profileRaw];
  const chains = source.OPERATOR_CHAINS === undefined
    ? [...DEFAULT_INVENTORY_CHAINS]
    : validateChainList(source.OPERATOR_CHAINS.split(",").map((value) => value.trim()).filter(Boolean));
  const gasReserveNative: Record<string, number> = {};
  for (const chain of chains) gasReserveNative[chain] = number(`OPERATOR_GAS_RESERVE_${chain}`, defaultGasReserve(chain));
  const rpcByChain: Record<string, string> = {};
  const routerAllowlist: Record<string, string[]> = {};
  const spenderAllowlist: Record<string, string[]> = {};
  const selectorAllowlist: Record<string, string[]> = {};
  const addressList = (key: string): string[] | undefined => {
    const raw = source[key];
    if (raw === undefined) return undefined;
    const list = raw.split(",").map((value) => value.trim()).filter(Boolean);
    if (list.length === 0 || list.some((value) => !/^(0x[0-9a-fA-F]{40}|[1-9A-HJ-NP-Za-km-z]{32,44})$/.test(value))) throw new Error(`Invalid ${key}`);
    return list;
  };
  for (const chain of chains) {
    const rpc = source[`OPERATOR_RPC_${chain}`];
    if (rpc !== undefined) {
      if (!/^https:\/\/[^\s/?#]+/.test(rpc)) throw new Error(`Invalid OPERATOR_RPC_${chain}: https only`);
      rpcByChain[chain] = rpc;
    }
    const routers = addressList(`OPERATOR_ROUTER_${chain}`);
    if (routers) routerAllowlist[chain] = routers;
    const spenders = addressList(`OPERATOR_SPENDER_${chain}`);
    if (spenders) spenderAllowlist[chain] = spenders;
    const selectors = source[`OPERATOR_SELECTORS_${chain}`];
    if (selectors !== undefined) {
      const list = selectors.split(",").map((value) => value.trim().toLowerCase()).filter(Boolean);
      if (list.length === 0 || list.some((value) => !/^0x[0-9a-f]{8}$/.test(value))) throw new Error(`Invalid OPERATOR_SELECTORS_${chain}`);
      selectorAllowlist[chain] = list;
    }
  }
  const solanaSecret = source.SOLANA_PRIVATE_KEY?.trim() || null;
  if (solanaSecret !== null && !/^[1-9A-HJ-NP-Za-km-z]{43,90}$/.test(solanaSecret)) throw new Error("Invalid SOLANA_PRIVATE_KEY format");
  const evmPrivateKey = source.OPERATOR_PRIVATE_KEY?.trim() || null;
  if (evmPrivateKey !== null && !/^0x[0-9a-fA-F]{64}$/.test(evmPrivateKey)) throw new Error("Invalid OPERATOR_PRIVATE_KEY format");
  // The operator wallet is dedicated: reusing the Kuru trader key is refused outright (R8 C4).
  const traderKey = source.PRIVATE_KEY?.trim();
  if (evmPrivateKey !== null && traderKey && evmPrivateKey.toLowerCase() === traderKey.toLowerCase()) throw new Error("OPERATOR_PRIVATE_KEY must differ from the trader PRIVATE_KEY");
  const address = source.OPERATOR_ADDRESS?.trim() || null;
  const credentials = { apiKey: source.OKX_WEB3_API_KEY, secretKey: source.OKX_WEB3_API_SECRET, passphrase: source.OKX_WEB3_API_PASSPHRASE };
  const credentialValid = (value: string | undefined): value is string => typeof value === "string" && value.trim().length > 0 && !/[\u0000-\u001f\u007f]/.test(value);
  const okx = credentialValid(credentials.apiKey) && credentialValid(credentials.secretKey) && credentialValid(credentials.passphrase)
    ? { apiKey: credentials.apiKey, secretKey: credentials.secretKey, passphrase: credentials.passphrase }
    : null;
  // An empty value (as shipped in .env.example) is the same as absent (R8 C4).
  const liveAckRaw = source.OPERATOR_LIVE_ACK?.trim() || undefined;
  if (liveAckRaw !== undefined && liveAckRaw !== "OWN_FUNDS_RISK_OPERATOR") throw new Error("Invalid OPERATOR_LIVE_ACK");
  return {
    profile: profileRaw,
    policy: {
      maxPlanUsd: number("OPERATOR_MAX_PLAN_USD", profile.maxPlanUsd, Number.MIN_VALUE, HARD_LIMITS.maxPlanUsd),
      maxCapitalFraction: number("OPERATOR_MAX_CAPITAL_FRACTION", profile.maxCapitalFraction, Number.MIN_VALUE, HARD_LIMITS.maxCapitalFraction),
      minNetUsd: number("OPERATOR_MIN_NET_USD", 0.05, 0),
      maxPriceImpactPercent: number("OPERATOR_MAX_PRICE_IMPACT_PERCENT", 1, 0, 5),
      maxQuoteAgeMs: number("OPERATOR_MAX_QUOTE_AGE_MS", 15_000, 1, 120_000),
      gasReserveNative,
      inferenceUsdPerCandidate: number("OPERATOR_INFERENCE_USD_PER_CANDIDATE", 0.0001, 0),
      planTtlMs: number("OPERATOR_PLAN_TTL_MS", 30_000, 1, 600_000),
      exitWindowMs: number("OPERATOR_EXIT_WINDOW_MS", 0, 0, 600_000),
      maxDailyNotionalUsd: number("OPERATOR_MAX_DAILY_NOTIONAL_USD", profile.maxDailyNotionalUsd, Number.MIN_VALUE, HARD_LIMITS.maxDailyNotionalUsd),
      maxDailyPlans: number("OPERATOR_MAX_DAILY_PLANS", profile.maxDailyPlans, 1, HARD_LIMITS.maxDailyPlans),
      cooldownMs: number("OPERATOR_COOLDOWN_MS", profile.cooldownMs, HARD_LIMITS.minCooldownMs),
      killSwitchPath: path("OPERATOR_KILL_SWITCH_PATH", "data/operator/STOP"),
      staleLegMs: number("OPERATOR_STALE_LEG_MS", 15 * 60_000, 1),
      routerAllowlist,
      spenderAllowlist,
      selectorAllowlist,
      maxFeeGwei: number("OPERATOR_MAX_FEE_GWEI", 400, Number.MIN_VALUE),
      maxGasLimit: number("OPERATOR_MAX_GAS_LIMIT", 1_000_000, 21_000, HARD_LIMITS.maxGasLimit),
      maxDailyLossUsd: number("OPERATOR_MAX_DAILY_LOSS_USD", profile.maxDailyLossUsd, Number.MIN_VALUE, HARD_LIMITS.maxDailyLossUsd),
      maxWeeklyLossUsd: number("OPERATOR_MAX_WEEKLY_LOSS_USD", profile.maxWeeklyLossUsd, Number.MIN_VALUE),
      maxDrawdownUsd: number("OPERATOR_MAX_DRAWDOWN_USD", profile.maxDrawdownUsd, Number.MIN_VALUE),
      stablecoinPriceBand: [0.97, 1.03],
    },
    chains,
    address,
    statePath: path("OPERATOR_STATE_PATH", "data/operator/latest.json"),
    journalPath: path("OPERATOR_JOURNAL_PATH", "data/operator/cycles.jsonl"),
    ledgerPath: path("OPERATOR_LEDGER_PATH", "data/operator/ledger.json"),
    lockPath: path("OPERATOR_LOCK_PATH", "data/operator/LOCK"),
    intervalMs: number("OPERATOR_INTERVAL_MS", 60_000, 1_000),
    execute: bool("OPERATOR_EXECUTE", false),
    liveAck: liveAckRaw === "OWN_FUNDS_RISK_OPERATOR",
    evmPrivateKey,
    solanaSecret,
    okx,
    rpcByChain,
    trustQuoteUnits: bool("OPERATOR_TRUST_QUOTE_UNITS", false),
    trustBridgeApi: bool("OPERATOR_TRUST_BRIDGE_API", false),
  };
}

/**
 * Live execution needs every operator-specific gate at once: the explicit
 * execute flag, the operator acknowledgement, the real Jev model and a signer
 * built from the operator's own key. The Kuru trader's DRY_RUN, LIVE_ACK and
 * PRIVATE_KEY are not consulted (R5 A4, F5).
 */
export function operatorLiveGate(config: Pick<OperatorConfig, "execute" | "liveAck" | "evmPrivateKey">, modelName: string): { live: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (!config.execute) reasons.push("OPERATOR_EXECUTE is not true");
  if (!config.liveAck) reasons.push("OPERATOR_LIVE_ACK is not OWN_FUNDS_RISK_OPERATOR");
  if (modelName === "mock") reasons.push("live requires the real Jev model (--jev)");
  if (!config.evmPrivateKey) reasons.push("OPERATOR_PRIVATE_KEY is not set");
  return { live: reasons.length === 0, reasons };
}

function defaultGasReserve(chainIndex: string): number {
  switch (chainIndex) {
    case "143": return 0.5; // MON
    case "196": return 0.002; // OKB
    case "501": return 0.01; // SOL
    case "56": return 0.002; // BNB
    case "137": return 0.5; // POL
    default: return 0.0005; // ETH family
  }
}
