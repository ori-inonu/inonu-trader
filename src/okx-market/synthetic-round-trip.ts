import type { RoundTripReport } from './round-trip';

/** Closed offline demo: fixed fixture data only, with no client, transport, or caller-controlled quote method. */
export function createSyntheticRoundTripReport(): RoundTripReport {
  const inputAtomic = '1000000';
  const firstOutputAtomic = '1010000';
  const outputAtomic = '995000';
  const startedAt = 1_791_504_000_000;
  return {
    source: 'synthetic',
    chainIndex: '1',
    tokenA: {
      address: '0x0000000000000000000000000000000000000001',
      decimals: 6,
      metadataSource: 'synthetic-fixture-only',
    },
    tokenB: {
      address: '0x0000000000000000000000000000000000000002',
      decimals: 6,
      metadataSource: 'synthetic-fixture-only',
    },
    inputAtomic,
    outputAtomic,
    quotedGrossDeltaAtomic: (BigInt(outputAtomic) - BigInt(inputAtomic)).toString(),
    status: 'quoted_gross_delta',
    reasons: ['synthetic_fixture_only', 'quoted_output_unit_inferred', 'total_cost_coverage_unknown'],
    legs: [
      {
        inputAtomic,
        outputAtomic: firstOutputAtomic,
        priceImpactPercent: -0.1,
        fromTaxFraction: 0,
        toTaxFraction: 0,
        networkEstimates: { tradeFeeUsd: null, estimateGasFeeNativeAtomic: null },
        requestedAt: startedAt + 3,
        receivedAt: startedAt + 4,
      },
      {
        inputAtomic: firstOutputAtomic,
        outputAtomic,
        priceImpactPercent: -0.1,
        fromTaxFraction: 0,
        toTaxFraction: 0,
        networkEstimates: { tradeFeeUsd: null, estimateGasFeeNativeAtomic: null },
        requestedAt: startedAt + 5,
        receivedAt: startedAt + 6,
      },
    ],
    execution: 'not_qualified',
    liveQualified: false,
    netAtomic: null,
    netStatus: 'net_not_evaluated',
    costsCoverage: 'unknown',
    costUsd: null,
    quotaRemaining: null,
    timing: {
      startedAt,
      completedAt: startedAt + 7,
      elapsedMs: 7,
      coverageRequestedAt: startedAt + 1,
      coverageReceivedAt: startedAt + 2,
    },
    policy: { maxElapsedMs: 5_000, maxImpactMagnitudePercent: 1 },
  };
}
