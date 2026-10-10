/** Demonstration values are invented; they are not observations of a provider. */
export const DEFI_DEMO_NOW_MS = 1800000000000;
export const DEFI_DEMO_MAX_AGE_MS = 60000;

export function syntheticDefiCaptures() {
  return {
    search: {
      schema: "okx_defi_capture_v1",
      endpoint: "search",
      sourceClaim: "synthetic",
      capturedAtMs: DEFI_DEMO_NOW_MS - 1000,
      response: {
        code: 0,
        data: {
          total: 12,
          list: [
            { investmentId: "demo-a", chainIndex: "1", name: "Produto sintético A", platformName: "Plataforma sintética", rate: "0.042000", tvl: "1000000.00", feeRate: null },
            { investmentId: "demo-b", chainIndex: "137", name: "Produto sintético B", platformName: "Outra plataforma sintética", rate: "0.021000", tvl: "250000.00", feeRate: "0" },
          ],
        },
      },
    },
    detail: {
      schema: "okx_defi_capture_v1",
      endpoint: "detail",
      sourceClaim: "synthetic",
      capturedAtMs: null,
      response: {
        code: 0,
        data: { investmentId: "demo-a", chainIndex: "1", investmentName: "Produto sintetico A detalhe", platformName: "Plataforma sintética", analysisPlatformId: "demo-platform", network: "Rede sintética", rate: "0.042000", rateTypeDesc: "APY", tvl: "1000000.00", feeRate: null, isInvestable: true, isSupportRedeem: true, isSupportClaim: false },
      },
    },
  };
}
