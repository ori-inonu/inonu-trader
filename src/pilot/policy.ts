import type { OperatorPolicy } from "../operator/types";
import { PILOT_MAX_QUOTE_AGE_MS } from "./protocol";

/** Fixed research policy. No environment, wallet keys or execution config. */
export function pilotPolicy(inferenceUsdPerCandidate: number): OperatorPolicy {
  return {
    maxPlanUsd:5,maxCapitalFraction:0.05,minNetUsd:0.05,
    maxPriceImpactPercent:1,maxQuoteAgeMs:PILOT_MAX_QUOTE_AGE_MS,gasReserveNative:{"196":0.002},
    exitWindowMs: 0,
    inferenceUsdPerCandidate,planTtlMs:30_000,
    maxDailyNotionalUsd:20,maxDailyPlans:4,cooldownMs:900_000,
    killSwitchPath:"data/pilot/STOP",staleLegMs:900_000,
    routerAllowlist:{},spenderAllowlist:{},selectorAllowlist:{},
    maxFeeGwei:400,maxGasLimit:1_000_000,maxDailyLossUsd:2,
    maxWeeklyLossUsd:5,maxDrawdownUsd:10,stablecoinPriceBand:[0.97,1.03],
  };
}
