/**
 * Plain text summary of a wallet evidence, for the terminal and the report. Pure.
 * Rendered text uses no middle dot, em dash or en dash (project rule). A synthetic evidence always says so on the first line.
 */

import { FIXTURE_LABEL } from "./fixtures.ts";
import type { Status, WalletEvidence } from "./types.ts";

const STATUS_PT: Readonly<Record<Status, string>> = {
  valid: "valido",
  incomplete: "incompleto",
  stale: "vencido",
  divergent: "divergente",
  unreconciled: "nao reconciliado",
};

export function statusLabel(status: Status): string {
  return STATUS_PT[status];
}

export function summarizeEvidence(evidence: WalletEvidence): string[] {
  const lines: string[] = [];
  lines.push(evidence.realData ? "DADO REAL de leitura OKX (origem okx_web3_api), sem reproducao ou promessa de resultado" : FIXTURE_LABEL);
  lines.push(`Evidencia ${evidence.evidenceId} revisao ${evidence.revision}, status geral: ${statusLabel(evidence.status)}`);
  const net = evidence.netWorth;
  lines.push(
    net.valueText === null
      ? `Patrimonio (so saldos ativos avaliados): desconhecido, ${net.valuedCount} posicoes avaliadas e ${net.unvaluedCount} sem valor`
      : `Patrimonio (so saldos ativos avaliados): ${net.valueText} USD, ${net.valuedCount} posicoes avaliadas e ${net.unvaluedCount} sem valor`,
  );
  if (net.caveats.length > 0) lines.push(`Ressalvas do patrimonio: ${net.caveats.join(", ")}`);
  lines.push("Fora do patrimonio: PnL, custo de aquisicao, historico e posicoes DeFi");
  for (const [name, status] of Object.entries(evidence.sections)) lines.push(`Secao ${name}: ${status === "not_collected" ? "nao coletada" : status === "failed" ? "falhou" : statusLabel(status)}`);
  const balances = evidence.balances;
  if (balances !== null) {
    lines.push(`Cobertura de saldos: ${balances.coverage.observed.length} de ${balances.coverage.requested.length} redes com linhas, ${balances.coverage.notReported.length} sem linhas (nao e saldo zero), descoberta ${balances.coverage.tokenDiscovery}, ${balances.coverage.status === "complete_claimed" ? "completa declarada" : "parcial"}`);
    lines.push(`Filtro de risco: pedido ${balances.filters.riskToken.requested}, efeito ${balances.filters.riskToken.effect}`);
    lines.push(`Captura em ${balances.timing.fetchedAtMs}, relogio da fonte ${balances.timing.sourceTimeMs ?? "desconhecido"}, frescor captura ${balances.freshness.capture} e fonte ${balances.freshness.source}`);
  }
  const total = evidence.reconciliation.totalVsSum;
  if (total !== null) lines.push(`Total reportado ${total.reportedText ?? "?"} contra soma ${total.sumText ?? "?"}: diferenca ${total.deltaText ?? "?"}, estado ${total.state.kind}${total.candidateCauses.length > 0 ? `, causas candidatas ${total.candidateCauses.join(",")}` : ""}`);
  for (const item of evidence.reconciliation.findings.filter((finding) => finding.state.kind !== "ok")) lines.push(`Achado ${item.rule} ${item.code} (${item.state.kind})${item.identityKey === null ? "" : ` em ${item.identityKey}`}`);
  if (evidence.history !== null) lines.push(`Historico: ${evidence.history.entries.length} movimentos, janela ${evidence.history.window.completeness}, limite do provedor ${evidence.history.window.providerLimitMonths} meses`);
  for (const basis of evidence.costBasis) lines.push(`Custo de aquisicao ${basis.identity.key}: ${basis.basisText ?? "nao calculado"} (${basis.coverage}, ${basis.state.code})`);
  if (evidence.addressAnalysis !== null) lines.push(`Address Analysis: ${evidence.addressAnalysis.statements.length} declaracoes de PnL, todas ${evidence.addressAnalysis.statements[0]?.basis ?? "sem dados"}, fora do patrimonio`);
  const collection = evidence.collection;
  if (collection !== null) {
    lines.push(`Coleta sob demanda: ${collection.callsMade} chamadas de ${collection.callBudget}${collection.stoppedBy === null ? "" : `, encerrada por ${collection.stoppedBy}`}`);
    for (const error of collection.errors) lines.push(`Erro em ${error.section}: ${error.code}${error.httpStatus === null ? "" : ` (HTTP ${error.httpStatus})`}`);
    for (const skip of collection.skipped) lines.push(`Nao lido: ${skip.what} (${skip.reason})`);
  }
  return lines;
}
