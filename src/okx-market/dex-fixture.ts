import type { RoundTripInput, DexToken } from './round-trip';

export function createSyntheticRoundTrip(): RoundTripInput {
  const tokenA = { address: '0x0000000000000000000000000000000000000001', decimals: 6, metadataSource: 'synthetic-fixture-only' };
  const tokenB = { address: '0x0000000000000000000000000000000000000002', decimals: 6, metadataSource: 'synthetic-fixture-only' };
  let time = 1791504000000;
  function quote(from: DexToken, to: DexToken, input: string, output: string) {
    const token = (value: DexToken) => ({ tokenContractAddress: value.address, decimal: String(value.decimals), isHoneyPot: false, taxRate: '0' });
    return { chainIndex: '1', swapMode: 'exactIn', fromToken: token(from), toToken: token(to), fromTokenAmount: input,
      toTokenAmount: output, priceImpactPercent: '-0.10', tradeFee: null, estimateGasFee: null };
  }
  return { source: 'synthetic', chainIndex: '1', tokenA, tokenB, amountAtomic: '1000000',
    policy: { maxElapsedMs: 5000, maxImpactMagnitudePercent: 1 }, now: () => ++time,
    client: {
      async supportedChain() { return [{ chainIndex: '1', chainName: 'synthetic-only', dexTokenApproveAddress: '' }]; },
      async quote(request) {
        return request.fromTokenAddress === tokenA.address ? [quote(tokenA, tokenB, '1000000', '1010000')]
          : [quote(tokenB, tokenA, '1010000', '995000')];
      },
    } };
}
