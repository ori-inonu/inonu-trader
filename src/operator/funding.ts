import type { OpportunityCandidate } from "./types";

/**
 * Perpetual funding carry as research: OKX public market data
 * (GET https://www.okx.com/api/v5/public/funding-rate?instId=BTC-USDT-SWAP, no
 * authentication) reports the current and next funding rate. A positive rate
 * pays shorts; a hedged spot-long plus perp-short collects it. Executing it
 * requires an OKX Exchange account with trade permission and margin, which the
 * Web3 wallet does not provide, so these candidates are research only and never
 * reach the executor. Leverage multiplies loss as well as gain; nothing here
 * sizes or opens a leveraged position.
 */
export interface FundingObservation {
  instId: string;
  fundingRate: number;
  nextFundingRate: number | null;
  fundingTimeMs: number | null;
  observedAtMs: number;
}

export interface FundingSource {
  fundingRates(instIds: string[]): Promise<FundingObservation[]>;
}

export const DEFAULT_FUNDING_INSTRUMENTS = ["BTC-USDT-SWAP", "ETH-USDT-SWAP", "SOL-USDT-SWAP", "OKB-USDT-SWAP"];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function num(value: unknown): number | null {
  if (typeof value !== "string" || !/^-?\d+(?:\.\d+)?$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function okxPublicFundingSource(fetcher: typeof fetch = fetch, now: () => number = Date.now, timeoutMs = 8_000): FundingSource {
  return {
    async fundingRates(instIds) {
      const observations: FundingObservation[] = [];
      for (const instId of instIds) {
        if (!/^[A-Z0-9]+-USDT-SWAP$/.test(instId)) throw new Error(`Invalid instrument ${instId}`);
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        try {
          const response = await fetcher(`https://www.okx.com/api/v5/public/funding-rate?instId=${instId}`, { signal: controller.signal });
          if (!response.ok) continue;
          const envelope = await response.json() as { code?: string; data?: unknown };
          if (envelope.code !== "0" || !Array.isArray(envelope.data) || !isRecord(envelope.data[0])) continue;
          const row = envelope.data[0];
          const fundingRate = num(row.fundingRate);
          if (fundingRate === null) continue;
          observations.push({ instId, fundingRate, nextFundingRate: num(row.nextFundingRate), fundingTimeMs: num(row.fundingTime), observedAtMs: now() });
        } catch {
          continue;
        } finally {
          clearTimeout(timer);
        }
      }
      return observations;
    },
  };
}

/** Annualized carry from an 8-hour funding rate, as a percent. */
export function annualizedFundingPercent(rate8h: number): number {
  return rate8h * 3 * 365 * 100;
}

export function buildFundingCandidates(observations: FundingObservation[], inferenceUsd: number): OpportunityCandidate[] {
  return observations.map((observation) => {
    const annual = annualizedFundingPercent(observation.fundingRate);
    const base = observation.instId.split("-")[0] ?? "?";
    return {
      id: `fund_${base.toLowerCase()}_usdt`,
      kind: "perp_funding_carry",
      title: `Funding carry ${observation.instId}: spot long plus perp short collects ${annual.toFixed(2)}% annualized at the current rate`,
      chainIndex: "0",
      from: { chainIndex: "0", tokenContractAddress: "", symbol: "USDT", decimals: null },
      to: { chainIndex: "0", tokenContractAddress: "", symbol: base, decimals: null },
      sizeUsd: null, sizeAtomic: "0", expectedOutAtomic: null, expectedLeg1OutAtomic: null, pairKey: `okx_exchange:${observation.instId}`,
      netUsd: null, priceImpactPercent: null,
      costs: { networkFeeUsd: null, tradingFeeUsd: null, inferenceUsd, complete: false },
      quoteAgeMs: null, quoteHash: null,
      notes: [
        `funding ${(observation.fundingRate * 100).toFixed(4)}% per 8h${observation.nextFundingRate === null ? "" : `, next ${(observation.nextFundingRate * 100).toFixed(4)}%`}`,
        "requires an OKX Exchange account with margin; not executable from the Web3 wallet",
        "funding changes every interval; carry is not guaranteed and leverage adds liquidation risk",
      ],
      researchOnly: true,
    };
  });
}
