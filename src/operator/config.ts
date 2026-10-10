import { DEFAULT_INVENTORY_CHAINS, validateChainList } from "../okx-wallet/chains";
import type { OperatorPolicy } from "./types";

/**
 * Policy profiles by phase. "micro" is the default: single plans of at most 5 USD
 * or 5% of the known inventory, 20 USD and 4 plans per day, 15 minute cooldown.
 * "standard" keeps the wider research limits. Explicit OPERATOR_* variables
 * override the profile value.
 */
export type OperatorProfile = "micro" | "standard";

const PROFILES: Record<OperatorProfile, { maxPlanUsd: number; maxCapitalFraction: number; maxDailyNotionalUsd: number; maxDailyPlans: number; cooldownMs: number; maxDailyLossUsd: number }> = {
  micro: { maxPlanUsd: 5, maxCapitalFraction: 0.05, maxDailyNotionalUsd: 20, maxDailyPlans: 4, cooldownMs: 15 * 60_000, maxDailyLossUsd: 2 },
  standard: { maxPlanUsd: 25, maxCapitalFraction: 0.25, maxDailyNotionalUsd: 100, maxDailyPlans: 10, cooldownMs: 120_000, maxDailyLossUsd: 5 },
};

export interface OperatorConfig {
  profile: OperatorProfile;
  policy: OperatorPolicy;
  chains: string[];
  /** Wallet address observed by the inventory. Never a private key. */
  address: string | null;
  statePath: string;
  journalPath: string;
  intervalMs: number;
  /** Explicit, separate gate; DRY_RUN and LIVE_ACK from the trader are also required for live. */
  execute: boolean;
  okx: { apiKey: string; secretKey: string; passphrase: string } | null;
  /** RPC per chainIndex for prepared transactions (OPERATOR_RPC_<chainIndex>); 501 is the Solana RPC. */
  rpcByChain: Record<string, string>;
  ledgerPath: string;
  /** Base58 Solana secret for a dedicated operator wallet; never the user's main key. */
  solanaSecret: string | null;
  /** Treat OKX toTokenAmount as atomic (SDK evidence) for live round trips; default false keeps them research only. */
  trustQuoteUnits: boolean;
  /** Treat the cross-chain quote contract as confirmed; default false keeps bridges research only. */
  trustBridgeApi: boolean;
}

export function loadOperatorConfig(source: Record<string, string | undefined> = process.env): OperatorConfig {
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
  for (const chain of chains) {
    const rpc = source[`OPERATOR_RPC_${chain}`];
    if (rpc !== undefined) {
      if (!/^https?:\/\//.test(rpc)) throw new Error(`Invalid OPERATOR_RPC_${chain}`);
      rpcByChain[chain] = rpc;
    }
    const routers = source[`OPERATOR_ROUTER_${chain}`];
    if (routers !== undefined) {
      const list = routers.split(",").map((value) => value.trim()).filter(Boolean);
      if (list.length === 0 || list.some((value) => !/^(0x[0-9a-fA-F]{40}|[1-9A-HJ-NP-Za-km-z]{32,44})$/.test(value))) throw new Error(`Invalid OPERATOR_ROUTER_${chain}`);
      routerAllowlist[chain] = list;
    }
  }
  const solanaSecret = source.SOLANA_PRIVATE_KEY?.trim() || null;
  if (solanaSecret !== null && !/^[1-9A-HJ-NP-Za-km-z]{43,90}$/.test(solanaSecret)) throw new Error("Invalid SOLANA_PRIVATE_KEY format");
  const address = source.OPERATOR_ADDRESS?.trim() || null;
  const credentials = { apiKey: source.OKX_WEB3_API_KEY, secretKey: source.OKX_WEB3_API_SECRET, passphrase: source.OKX_WEB3_API_PASSPHRASE };
  const credentialValid = (value: string | undefined): value is string => typeof value === "string" && value.trim().length > 0 && !/[\u0000-\u001f\u007f]/.test(value);
  const okx = credentialValid(credentials.apiKey) && credentialValid(credentials.secretKey) && credentialValid(credentials.passphrase)
    ? { apiKey: credentials.apiKey, secretKey: credentials.secretKey, passphrase: credentials.passphrase }
    : null;
  return {
    profile: profileRaw,
    policy: {
      maxPlanUsd: number("OPERATOR_MAX_PLAN_USD", profile.maxPlanUsd, Number.MIN_VALUE),
      maxCapitalFraction: number("OPERATOR_MAX_CAPITAL_FRACTION", profile.maxCapitalFraction, Number.MIN_VALUE, 1),
      minNetUsd: number("OPERATOR_MIN_NET_USD", 0.05, 0),
      maxPriceImpactPercent: number("OPERATOR_MAX_PRICE_IMPACT_PERCENT", 1, 0, 100),
      maxQuoteAgeMs: number("OPERATOR_MAX_QUOTE_AGE_MS", 15_000, 1),
      gasReserveNative,
      inferenceUsdPerCandidate: number("OPERATOR_INFERENCE_USD_PER_CANDIDATE", 0.0001, 0),
      planTtlMs: number("OPERATOR_PLAN_TTL_MS", 30_000, 1),
      maxDailyNotionalUsd: number("OPERATOR_MAX_DAILY_NOTIONAL_USD", profile.maxDailyNotionalUsd, Number.MIN_VALUE),
      maxDailyPlans: number("OPERATOR_MAX_DAILY_PLANS", profile.maxDailyPlans, 1),
      cooldownMs: number("OPERATOR_COOLDOWN_MS", profile.cooldownMs, 0),
      killSwitchPath: source.OPERATOR_KILL_SWITCH_PATH ?? "data/operator/STOP",
      staleLegMs: number("OPERATOR_STALE_LEG_MS", 15 * 60_000, 1),
      routerAllowlist,
      maxFeeGwei: number("OPERATOR_MAX_FEE_GWEI", 400, Number.MIN_VALUE),
      maxDailyLossUsd: number("OPERATOR_MAX_DAILY_LOSS_USD", profile.maxDailyLossUsd, Number.MIN_VALUE),
    },
    chains,
    address,
    statePath: source.OPERATOR_STATE_PATH ?? "data/operator/latest.json",
    journalPath: source.OPERATOR_JOURNAL_PATH ?? "data/operator/cycles.jsonl",
    intervalMs: number("OPERATOR_INTERVAL_MS", 60_000, 1_000),
    execute: bool("OPERATOR_EXECUTE", false),
    okx,
    rpcByChain,
    ledgerPath: source.OPERATOR_LEDGER_PATH ?? "data/operator/ledger.json",
    solanaSecret,
    trustQuoteUnits: bool("OPERATOR_TRUST_QUOTE_UNITS", false),
    trustBridgeApi: bool("OPERATOR_TRUST_BRIDGE_API", false),
  };
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
