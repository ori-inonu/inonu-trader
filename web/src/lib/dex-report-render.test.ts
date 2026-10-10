import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
declare const require: (moduleName: "bun:test") => typeof import("bun:test");

const { describe, expect, test } = require("bun:test");

import DexReportPanel, { DexReportPanelView } from "../components/DexReportPanel/DexReportPanel";
import type { DexReportImportState } from "./dex-report-import";
import { parseDexReport, type NormalizedDexReport } from "./dex-report";
import { SYNTHETIC_DEX_REPORT } from "./dex-report-example";

const wallNow = 1_791_504_000_100;

function normalizedReport(source: "synthetic" | "okx_authenticated" = "synthetic"): NormalizedDexReport {
  return parseDexReport({ ...(SYNTHETIC_DEX_REPORT as Record<string, unknown>), source }, { nowWallMs: wallNow });
}

function normalizedPartialReport(): NormalizedDexReport {
  const raw = SYNTHETIC_DEX_REPORT as Record<string, unknown>;
  return parseDexReport({
    ...raw,
    status: "blocked",
    outputAtomic: null,
    quotedGrossDeltaAtomic: null,
    legs: [],
    timing: {
      startedAt: 1_791_504_000_000,
      completedAt: null,
      elapsedMs: null,
      coverageRequestedAt: null,
      coverageReceivedAt: null,
    },
  }, { nowWallMs: wallNow });
}

function normalizedRoundTripWithDifferentDecimals(): NormalizedDexReport {
  return parseDexReport({
    ...(SYNTHETIC_DEX_REPORT as Record<string, unknown>),
    tokenA: {
      address: "0x0000000000000000000000000000000000000001",
      decimals: 6,
      metadataSource: "synthetic-fixture-only",
    },
    tokenB: {
      address: "0x0000000000000000000000000000000000000002",
      decimals: 18,
      metadataSource: "synthetic-fixture-only",
    },
    inputAtomic: "1000000",
    outputAtomic: "995000",
    quotedGrossDeltaAtomic: "-5000",
    legs: [
      {
        inputAtomic: "1000000",
        outputAtomic: "1234567890123456789",
        priceImpactPercent: -0.1,
        fromTaxFraction: 0,
        toTaxFraction: 0,
        networkEstimates: { tradeFeeUsd: null, estimateGasFeeNativeAtomic: null },
        requestedAt: 1_791_504_000_003,
        receivedAt: 1_791_504_000_004,
      },
      {
        inputAtomic: "1234567890123456789",
        outputAtomic: "995000",
        priceImpactPercent: -0.1,
        fromTaxFraction: 0,
        toTaxFraction: 0,
        networkEstimates: { tradeFeeUsd: null, estimateGasFeeNativeAtomic: null },
        requestedAt: 1_791_504_000_005,
        receivedAt: 1_791_504_000_006,
      },
    ],
  }, { nowWallMs: wallNow });
}

function state(overrides: Partial<DexReportImportState> = {}): DexReportImportState {
  return {
    report: null,
    error: null,
    loading: false,
    isExample: false,
    ageSinceImportMs: null,
    ...overrides,
  };
}

function render(viewState: DexReportImportState): string {
  return renderToStaticMarkup(createElement(DexReportPanelView, {
    state: viewState,
    onSelectFile: () => undefined,
    onShowExample: () => undefined,
    onClear: () => undefined,
  }));
}

describe("offline DEX report panel SSR view", () => {
  test("renders a deterministic empty state with a visible file label and unique heading", () => {
    const html = render(state());
    expect(html).toContain("Relatório DEX offline");
    expect(html).toContain('id="dex-report-title"');
    expect(html).toContain("Selecionar relatório JSON local");
    expect(html).toContain("Selecione um arquivo JSON local");
    expect(html).not.toContain("wallet-title");
  });

  test("renders the actual client entry as an empty SSR state without reading window", () => {
    const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      get() { throw new Error("window read during SSR render"); },
    });
    try {
      const html = renderToStaticMarkup(createElement(DexReportPanel));
      expect(html).toContain("Relatório DEX offline");
      expect(html).toContain("Selecione um arquivo JSON local");
    } finally {
      if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow);
      else Reflect.deleteProperty(globalThis, "window");
    }
  });

  test("renders synthetic history, exact amounts, unknown costs, and fixed safety labels", () => {
    const html = render(state({ report: normalizedReport(), isExample: true, ageSinceImportMs: 0 }));
    expect(html).toContain("Dados sintéticos: demonstração");
    expect(html).toContain("Relatório histórico");
    expect(html).toContain("Delta bruto cotado");
    expect(html).toContain("-0.005");
    expect(html).toContain("Retorno líquido não avaliado");
    expect(html).toContain("Cobertura total de custos desconhecida");
    expect(html).toContain("Execução não qualificada");
    expect(html).toContain("Relatório não representa saldo da carteira");
    expect(html).toContain("Taxa de trade (USD)");
    expect(html).toContain("Desconhecida");
    expect(html).toContain("Gas estimado (unidade nativa)");
    expect(html).toContain("Desconhecido");
    expect(html).toContain("Instantes históricos declarados");
    expect(html).toContain("1791504000000");
    expect(html).toContain("1791504000007 / 7");
    expect(html).not.toContain("Lucro");
    expect(html).not.toContain("saldo atual");
  });

  test("treats an uploaded synthetic source as a declared value, not the built-in demo", () => {
    const html = render(state({ report: normalizedReport("synthetic"), isExample: false }));
    expect(html).toContain("Origem declarada pelo arquivo: synthetic");
    expect(html).not.toContain("Dados sintéticos: demonstração");
    expect(html).toContain("Frescor do mercado desconhecido");
    expect(html).toContain("não é uma cotação atual");
    expect(html).toContain("validação local não comprova a origem declarada");
  });

  test("keeps rendered DEX report text free of prohibited punctuation", () => {
    const builtInExample = render(state({ report: normalizedReport("synthetic"), isExample: true }));
    const uploadedReport = render(state({ report: normalizedReport("synthetic"), isExample: false }));
    expect(builtInExample + uploadedReport).not.toMatch(/[\u00b7\u2013\u2014]/u);
  });

  test("formats each round-trip leg and gross delta in the inferred A/B token units", () => {
    const html = render(state({ report: normalizedRoundTripWithDifferentDecimals() }));
    expect(html).toContain("Entrada atômica (token A)");
    expect(html).toContain("Saída atômica (token B, unidade inferida)");
    expect(html).toContain("Entrada atômica (token B, unidade inferida)");
    expect(html).toContain("Saída atômica (token A, unidade inferida)");
    expect(html).toContain("1.234567890123456789 (valor declarado)");
    expect(html).toContain("0.995 (valor declarado)");
    expect(html).toContain("-0.005 (valor declarado)");
    expect(html).toContain("Delta bruto cotado (token A)");
    expect(html).toContain("A unidade associada a cada perna é inferida");
    expect(html).not.toContain("1234567890123.456789");
    expect(html).not.toContain("0.000000000000000995");
    expect(html).not.toContain("-0.000000000000005");
  });

  test("renders partial reports without inventing output, elapsed time, or missing costs", () => {
    const html = render(state({ report: normalizedPartialReport() }));
    expect(html).toContain("Relatório histórico bloqueado");
    expect(html).toContain("Delta bruto cotado (token A)</dt><dd>Desconhecido");
    expect(html).toContain("Saída cotada (token A, unidade inferida)</dt><dd>Desconhecida");
    expect(html).toContain("Taxa de trade (USD): desconhecida");
    expect(html).toContain("Gas estimado (unidade nativa): desconhecido");
    expect(html).toContain("Conclusão desconhecida");
    expect(html).toContain("Tempo desde a importação: desconhecido");
  });

  test("escapes bounded declared identities as text and does not claim authenticated source", () => {
    const report = normalizedReport("okx_authenticated");
    const withMarkup = {
      ...report,
      tokenA: { ...report.tokenA, address: "<img/src=x/onerror=alert(1)>" },
    };
    const html = render(state({ report: withMarkup }));
    expect(html).toContain("Origem declarada pelo arquivo");
    expect(html).toContain("&lt;img/src=x/onerror=alert(1)&gt;");
    expect(html).not.toContain("<img/src=x/onerror=alert(1)>");
    expect(html).not.toContain("Autenticado pela OKX");
  });

  test("announces loading and generic errors through the expected live regions", () => {
    const loading = render(state({ loading: true }));
    expect(loading).toContain('role="status"');
    expect(loading).toContain('aria-live="polite"');
    const failed = render(state({ error: "Não foi possível validar o relatório DEX." }));
    expect(failed).toContain('role="alert"');
    expect(failed).toContain("Não foi possível validar o relatório DEX.");
  });
});
