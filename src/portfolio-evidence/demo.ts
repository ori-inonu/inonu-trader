/**
 * Offline demonstration of the acceptance cases over SYNTHETIC fixtures. It builds each scenario with the same pure
 * builders the collector uses and states, for each one, the expectation that the unit tests assert. Nothing here touches
 * the network, the environment or a file.
 */

import { buildAddressAnalysisSection } from "./address-analysis.ts";
import { buildBalanceSection, type BalanceBuildInput } from "./balances.ts";
import { buildWalletEvidence } from "./evidence.ts";
import { FIXTURE_ACCOUNT, FIXTURE_NOW_MS, FIXTURE_RISK_TOKEN, balanceRow, historyRow, pnlRow, syntheticBalanceRows } from "./fixtures.ts";
import { buildHistorySection } from "./history.ts";
import { ADAPTER_VERSION, type SourceInfo, type WalletEvidence } from "./types.ts";

const NOW = FIXTURE_NOW_MS;
const MAX_AGE = 60_000;
const SOURCE: SourceInfo = { id: "synthetic_fixture", endpoint: null, method: null, apiVersion: null, adapterVersion: ADAPTER_VERSION, tier: "not_applicable" };

export interface DemoScenario {
  readonly acceptance: string;
  readonly title: string;
  readonly evidence: WalletEvidence;
  /** What this scenario must show; each entry is checked by demo.test.ts. */
  readonly expectations: readonly { readonly claim: string; readonly holds: boolean }[];
}

function balances(rows = syntheticBalanceRows(), extra: Partial<BalanceBuildInput> = {}) {
  return buildBalanceSection({
    account: FIXTURE_ACCOUNT,
    requestedChains: ["1"],
    rows,
    source: SOURCE,
    excludeRiskToken: null,
    tokenDiscovery: "provider_all",
    fetchedAtMs: NOW - 1_000,
    sourceTimeMs: null,
    nowMs: NOW,
    maxAgeMs: MAX_AGE,
    ...extra,
  });
}

function history(declaredComplete = false) {
  return buildHistorySection({
    account: FIXTURE_ACCOUNT,
    requestedChains: ["1"],
    rows: [historyRow()],
    source: declaredComplete ? { ...SOURCE, id: "local_import" } : SOURCE,
    fetchedAtMs: NOW - 1_000,
    nowMs: NOW,
    maxAgeMs: MAX_AGE,
    requestedFromMs: null,
    requestedToMs: null,
    pagesRead: 1,
    truncated: false,
    stopReason: "exhausted",
    declaredComplete,
  });
}

function pnl() {
  return buildAddressAnalysisSection({
    chainIndex: "1",
    timeFrame: "4",
    overview: { realizedPnlUsd: "100000" },
    rows: [pnlRow()],
    source: SOURCE,
    fetchedAtMs: NOW - 1_000,
    nowMs: NOW,
    maxAgeMs: MAX_AGE,
    pagesRead: 1,
    truncated: false,
    stopReason: "exhausted",
  });
}

function wallet(input: Partial<Parameters<typeof buildWalletEvidence>[0]> & { balances: ReturnType<typeof balances> | null }): WalletEvidence {
  return buildWalletEvidence({ origin: "synthetic_fixture", nowMs: NOW, maxAgeMs: MAX_AGE, account: FIXTURE_ACCOUNT, ...input });
}

export function runDemo(): DemoScenario[] {
  const scenarios: DemoScenario[] = [];

  const omitted = wallet({ balances: balances(syntheticBalanceRows(), { expectedAssets: [{ chainIndex: "1", tokenContractAddress: FIXTURE_RISK_TOKEN }] }) });
  const omittedPosition = omitted.balances!.positions.find((position) => position.origin === "expected_not_returned")!;
  scenarios.push({
    acceptance: "A1",
    title: "Token omitido pelo filtro de risco",
    evidence: omitted,
    expectations: [
      { claim: "o token omitido tem estado omitted_by_filter e nenhuma quantidade", holds: omittedPosition.quantity.state.kind === "omitted_by_filter" && omittedPosition.quantity.atoms === null && omittedPosition.quantity.displayText === null },
      { claim: "o patrimonio nao o conta como zero nem como valor", holds: omitted.netWorth.valueText === "50" && !omittedPosition.included },
      { claim: "o status geral nao e valido", holds: omitted.status !== "valid" },
    ],
  });

  const zeroActive = wallet({ balances: balances([balanceRow({ balance: "0", rawBalance: "0" })]), addressAnalysis: pnl() });
  const rc2 = zeroActive.reconciliation.findings.find((item) => item.rule === "RC2");
  scenarios.push({
    acceptance: "A2 e A3",
    title: "Quantidade historica com saldo ativo zerado, e PnL grande ao lado",
    evidence: zeroActive,
    expectations: [
      { claim: "exige reconciliacao: historical_quantity_active_zero", holds: rc2?.code === "historical_quantity_active_zero" && zeroActive.status === "unreconciled" },
      { claim: "o PnL de 100000 USD nao entra no patrimonio", holds: zeroActive.netWorth.valueText === "0" && zeroActive.addressAnalysis!.statements.some((statement) => statement.valueText === "100000") },
    ],
  });

  const gap = wallet({ balances: balances(syntheticBalanceRows(), { reportedTotal: { valueText: "75", assetType: "all", chains: ["1"], excludeRiskToken: null, fetchedAtMs: NOW - 1_000 } }) });
  scenarios.push({
    acceptance: "A4",
    title: "Total reportado 75 contra soma das posicoes 50",
    evidence: gap,
    expectations: [
      { claim: "a diferenca exata 25 e reportada, nao fechada por arredondamento", holds: gap.reconciliation.totalVsSum?.deltaText === "25" },
      { claim: "as causas candidatas aparecem sem serem quantificadas", holds: (gap.reconciliation.totalVsSum?.candidateCauses.length ?? 0) >= 2 && gap.reconciliation.totalVsSum?.state.kind === "unreconciled" },
    ],
  });

  const sixMonths = wallet({ balances: balances(), history: history() });
  const imported = wallet({ balances: balances(), history: history(true) });
  scenarios.push({
    acceptance: "A5",
    title: "Historico de seis meses nao e custo historico",
    evidence: sixMonths,
    expectations: [
      { claim: "a janela e parcial de seis meses e o custo nao e calculado", holds: sixMonths.history!.window.completeness === "partial_six_months" && sixMonths.costBasis[0]?.basisText === null && sixMonths.costBasis[0]?.coverage === "partial_window" },
      { claim: "so uma importacao local pode declarar historico completo, e ainda assim o metodo de custo nao esta implementado", holds: imported.history!.window.completeness === "complete_declared" && imported.costBasis[0]?.basisText === null },
    ],
  });

  const wrong = wallet({
    balances: balances(
      [
        balanceRow({ locator: "/ok" }),
        balanceRow({ locator: "/bsc", chainIndex: "56" }),
        balanceRow({ locator: "/mint", tokenContractAddress: "FixtureMint111111111111111111111111111111" }),
        balanceRow({ locator: "/dup-a", tokenContractAddress: "0x00000000000000000000000000000000000b0002", symbol: "FIXB" }),
        balanceRow({ locator: "/dup-b", tokenContractAddress: "0x00000000000000000000000000000000000b0002", symbol: "FIXB", balance: "9", rawBalance: "9000000" }),
      ],
      { fetchedAtMs: NOW - 10 * MAX_AGE },
    ),
  });
  scenarios.push({
    acceptance: "A6",
    title: "Rede errada, contrato errado, duplicidade conflitante e dado antigo",
    evidence: wrong,
    expectations: [
      { claim: "rede nao pedida e contrato invalido para a rede sao rejeitados", holds: wrong.balances!.rejected.map((row) => row.code).join(",") === "network_mismatch,contract_invalid_for_network" },
      { claim: "duplicata conflitante fica divergente e fora da soma", holds: wrong.balances!.positions.some((position) => position.state.code === "duplicate_identity_conflict" && !position.included) && wrong.netWorth.valueText === "10" },
      { claim: "captura antiga e vencida", holds: wrong.balances!.freshness.capture === "stale" },
    ],
  });

  const nothing = wallet({ balances: null });
  scenarios.push({
    acceptance: "A7",
    title: "Nada coletado: a ausencia nao e mascarada",
    evidence: nothing,
    expectations: [
      { claim: "sem saldos o patrimonio e desconhecido, nao zero e nao exemplo", holds: nothing.netWorth.valueText === null && nothing.status === "incomplete" },
      { claim: "o dado sintetico se declara sintetico", holds: nothing.origin === "synthetic_fixture" && nothing.realData === false },
    ],
  });

  return scenarios;
}
