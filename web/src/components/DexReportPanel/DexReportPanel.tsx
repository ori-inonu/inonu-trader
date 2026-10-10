"use client";

import { useEffect, useRef, useState } from "react";
import { createDexReportController, type DexReportImportState } from "../../lib/dex-report-import";
import { SYNTHETIC_DEX_REPORT } from "../../lib/dex-report-example";
import { formatAtomicAmount, type DexReportLeg, type NormalizedDexReport } from "../../lib/dex-report";
import styles from "./DexReportPanel.module.css";

export interface DexReportPanelViewProps {
  state: DexReportImportState;
  onSelectFile(file: File | null): void;
  onShowExample(): void;
  onClear(): void;
}

function formatElapsed(ageMs: number | null): string {
  if (ageMs === null || !Number.isFinite(ageMs) || ageMs < 0) return "Tempo desde a importação: desconhecido";
  if (ageMs < 1_000) return "Tempo desde a importação: menos de um segundo";
  const seconds = Math.floor(ageMs / 1_000);
  const minutes = Math.floor(seconds / 60);
  if (minutes > 0) return "Tempo desde a importação: " + minutes + " min " + (seconds % 60) + " s";
  return "Tempo desde a importação: " + seconds + " s";
}

function statusText(report: NormalizedDexReport | null, loading: boolean): string {
  if (loading) return "Validando o relatório local…";
  if (report === null) return "Selecione um arquivo JSON local ou mostre o exemplo sintético.";
  if (report.status === "quoted_gross_delta") return "Relatório carregado. Resultado histórico, sem atualização de mercado.";
  if (report.status === "blocked") return "Relatório histórico bloqueado; nenhum retorno foi calculado.";
  return "Relatório histórico desconhecido; nenhum retorno foi calculado.";
}

function reasonText(reason: string): string {
  switch (reason) {
    case "quoted_output_unit_inferred":
      return "A unidade da saída cotada foi inferida pelo relatório.";
    case "total_cost_coverage_unknown":
      return "Cobertura total de custos desconhecida.";
    case "token_tax_fraction_unknown":
      return "Fração de imposto de token desconhecida.";
    default:
      return "Razão registrada: " + reason;
  }
}

function displayedAmount(value: string, decimals: number): string {
  return formatAtomicAmount(value, decimals) + " (valor declarado)";
}

function legView(leg: DexReportLeg, index: number, report: NormalizedDexReport) {
  const firstLeg = index === 0;
  const inputToken = firstLeg ? report.tokenA : report.tokenB;
  const outputToken = firstLeg ? report.tokenB : report.tokenA;
  const inputTokenName = firstLeg ? "A" : "B";
  const outputTokenName = firstLeg ? "B" : "A";
  return (
    <li className={styles.leg} key={index}>
      <h4 className={styles.subheading}>Perna {index + 1}</h4>
      <dl className={styles.details}>
        <div className={styles.detailRow}>
          <dt>Entrada atômica (token {inputTokenName}{firstLeg ? "" : ", unidade inferida"})</dt>
          <dd>{displayedAmount(leg.inputAtomic, inputToken.decimals)}</dd>
        </div>
        <div className={styles.detailRow}>
          <dt>Saída atômica (token {outputTokenName}, unidade inferida)</dt>
          <dd>{displayedAmount(leg.outputAtomic, outputToken.decimals)}</dd>
        </div>
        <div className={styles.detailRow}>
          <dt>Impacto de preço declarado</dt>
          <dd>{leg.priceImpactPercent === null ? "Desconhecido" : String(leg.priceImpactPercent) + "%"}</dd>
        </div>
        <div className={styles.detailRow}>
          <dt>Fração de imposto de origem</dt>
          <dd>{leg.fromTaxFraction === null ? "Desconhecida" : String(leg.fromTaxFraction)}</dd>
        </div>
        <div className={styles.detailRow}>
          <dt>Fração de imposto de destino</dt>
          <dd>{leg.toTaxFraction === null ? "Desconhecida" : String(leg.toTaxFraction)}</dd>
        </div>
        <div className={styles.detailRow}>
          <dt>Taxa de trade (USD)</dt>
          <dd>{leg.networkEstimates.tradeFeeUsd === null ? "Desconhecida" : leg.networkEstimates.tradeFeeUsd + " USD (declarada)"}</dd>
        </div>
        <div className={styles.detailRow}>
          <dt>Gas estimado (unidade nativa)</dt>
          <dd>
            {leg.networkEstimates.estimateGasFeeNativeAtomic === null
              ? "Desconhecido"
              : leg.networkEstimates.estimateGasFeeNativeAtomic + " unidades atômicas nativas (declaradas)"}
          </dd>
        </div>
      </dl>
    </li>
  );
}

function timingView(report: NormalizedDexReport) {
  const timing = report.timing;
  if (timing === undefined) return <p className={styles.note}>Instantes de aquisição não declarados.</p>;
  return (
    <dl className={styles.details}>
      <div className={styles.detailRow}>
        <dt>Início declarado (UTC epoch ms)</dt>
        <dd>{String(timing.startedAt)}</dd>
      </div>
      <div className={styles.detailRow}>
        <dt>Consulta de cobertura (UTC epoch ms)</dt>
        <dd>{timing.coverageRequestedAt === null ? "Desconhecida" : String(timing.coverageRequestedAt)}</dd>
      </div>
      <div className={styles.detailRow}>
        <dt>Resposta da cobertura (UTC epoch ms)</dt>
        <dd>{timing.coverageReceivedAt === null ? "Desconhecida" : String(timing.coverageReceivedAt)}</dd>
      </div>
      {report.legs.map((leg, index) => (
        <div className={styles.detailRow} key={index}>
          <dt>Perna {index + 1}: solicitação/recebimento (UTC epoch ms)</dt>
          <dd>{leg.requestedAt === undefined ? "Desconhecidos" : String(leg.requestedAt) + " / " + (leg.receivedAt === undefined ? "desconhecido" : String(leg.receivedAt))}</dd>
        </div>
      ))}
      <div className={styles.detailRow}>
        <dt>Conclusão/tempo declarado (UTC epoch ms / ms)</dt>
        <dd>{timing.completedAt === null ? "Conclusão desconhecida" : String(timing.completedAt) + " / " + (timing.elapsedMs === null ? "tempo desconhecido" : String(timing.elapsedMs))}</dd>
      </div>
    </dl>
  );
}

function reportView(state: DexReportImportState) {
  const report = state.report;
  if (report === null) return null;
  const grossDelta = report.quotedGrossDeltaAtomic === null
    ? "Desconhecido"
    : displayedAmount(report.quotedGrossDeltaAtomic, report.tokenA.decimals) + ". Unidade do token A inferida pelo round trip.";

  return (
    <div className={styles.report}>
      <div className={styles.badges}>
        <span className={styles.badge}>{state.isExample ? "Dados sintéticos: demonstração" : "Origem declarada pelo arquivo: " + report.source}</span>
        <span className={styles.badge}>Relatório histórico</span>
        <span className={styles.badge}>Frescor do mercado desconhecido</span>
      </div>

      <p className={styles.age}>{formatElapsed(state.ageSinceImportMs)}</p>

      <dl className={styles.details}>
        <div className={styles.detailRow}>
          <dt>Estado declarado</dt>
          <dd>{report.status === "quoted_gross_delta" ? "Delta bruto cotado" : report.status === "blocked" ? "Bloqueado" : "Desconhecido"}</dd>
        </div>
        <div className={styles.detailRow}>
          <dt>Rede declarada (chainIndex)</dt>
          <dd>{report.chainIndex}</dd>
        </div>
        <div className={styles.detailRow}>
          <dt>Token A: contrato declarado</dt>
          <dd>{report.tokenA.address}</dd>
        </div>
        <div className={styles.detailRow}>
          <dt>Token B: contrato declarado</dt>
          <dd>{report.tokenB.address}</dd>
        </div>
        <div className={styles.detailRow}>
          <dt>Entrada cotada (token A)</dt>
          <dd>{displayedAmount(report.inputAtomic, report.tokenA.decimals)}</dd>
        </div>
        <div className={styles.detailRow}>
          <dt>Saída cotada (token A, unidade inferida)</dt>
          <dd>{report.outputAtomic === null ? "Desconhecida" : displayedAmount(report.outputAtomic, report.tokenA.decimals)}</dd>
        </div>
        <div className={styles.detailRow + " " + styles.deltaRow}>
          <dt>Delta bruto cotado (token A)</dt>
          <dd>{grossDelta}</dd>
        </div>
        <div className={styles.detailRow}>
          <dt>Retorno líquido não avaliado</dt>
          <dd>Não avaliado</dd>
        </div>
        <div className={styles.detailRow}>
          <dt>Cobertura total de custos desconhecida</dt>
          <dd>Desconhecida</dd>
        </div>
        <div className={styles.detailRow}>
          <dt>Execução não qualificada</dt>
          <dd>Não qualificada</dd>
        </div>
        <div className={styles.detailRow}>
          <dt>Saldo da carteira</dt>
          <dd>Relatório não representa saldo da carteira</dd>
        </div>
      </dl>

      <section className={styles.subsection} aria-labelledby="dex-report-costs-title">
        <h3 className={styles.subheading} id="dex-report-costs-title">Custos declarados por perna</h3>
        <p className={styles.note}>Valores ausentes permanecem desconhecidos; nenhum custo zero ou retorno líquido é inferido.</p>
        {report.legs.length > 0 ? (
          <p className={styles.note}>A unidade associada a cada perna é inferida da sequência declarada de round trip; o arquivo não comprova a identidade externa de cada perna.</p>
        ) : null}
        {report.legs.length === 0 ? (
          <p className={styles.note}>Taxa de trade (USD): desconhecida. Gas estimado (unidade nativa): desconhecido. Nenhuma perna contém estimativas.</p>
        ) : <ol className={styles.legs}>{report.legs.map((leg, index) => legView(leg, index, report))}</ol>}
      </section>

      <section className={styles.subsection} aria-labelledby="dex-report-timing-title">
        <h3 className={styles.subheading} id="dex-report-timing-title">Instantes históricos declarados</h3>
        {timingView(report)}
      </section>

      <section className={styles.subsection} aria-labelledby="dex-report-reasons-title">
        <h3 className={styles.subheading} id="dex-report-reasons-title">Razões registradas pelo relatório</h3>
        <ul className={styles.reasons}>{report.reasons.map((reason, index) => <li key={index}>{reasonText(reason)}</li>)}</ul>
      </section>

      <p className={styles.safety}>
        Este relatório não é uma cotação atual, retorno líquido, execução qualificada ou saldo da carteira. A validação local não comprova a origem declarada.
      </p>
    </div>
  );
}

export function DexReportPanelView({ state, onSelectFile, onShowExample, onClear }: DexReportPanelViewProps) {
  return (
    <section className={styles.panel} aria-labelledby="dex-report-title">
      <header className={styles.header}>
        <div className={styles.headingGroup}>
          <h2 className={styles.title} id="dex-report-title">Relatório DEX offline</h2>
          <p className={styles.description}>Leitura local de arquivo histórico; nenhuma conexão ou ação de carteira.</p>
        </div>
        <span className={styles.badge}>Somente leitura local</span>
      </header>

      <div className={styles.content}>
        <p className={styles.status} role="status" aria-live="polite" aria-atomic="true">
          {statusText(state.report, state.loading)}
        </p>
        <p className={styles.note}>Frescor do mercado desconhecido. Este painel não representa saldo da carteira.</p>

        <div className={styles.controls}>
          <label className={styles.fileLabel} htmlFor="dex-report-file">Selecionar relatório JSON local</label>
          <input
            className={styles.fileInput}
            id="dex-report-file"
            type="file"
            accept=".json,application/json"
            aria-describedby="dex-report-file-help"
            onChange={(event) => {
              const file = event.currentTarget.files?.[0] ?? null;
              event.currentTarget.value = "";
              onSelectFile(file);
            }}
          />
          <p className={styles.help} id="dex-report-file-help">JSON local de até 65.536 bytes. O nome do arquivo não é exibido nem guardado.</p>
          <button className={styles.primaryButton} type="button" onClick={onShowExample}>Mostrar exemplo sintético</button>
          <button className={styles.secondaryButton} type="button" onClick={onClear}>Limpar relatório</button>
        </div>

        {state.loading ? <p className={styles.loading} role="status" aria-live="polite">Lendo e validando o arquivo local…</p> : null}
        {state.error ? <p className={styles.error} role="alert">{state.error}</p> : null}
        {reportView(state)}
      </div>
    </section>
  );
}

const INITIAL_STATE: DexReportImportState = {
  report: null,
  error: null,
  loading: false,
  isExample: false,
  ageSinceImportMs: null,
};

export default function DexReportPanel() {
  const [state, setState] = useState<DexReportImportState>(INITIAL_STATE);
  const controllerRef = useRef<ReturnType<typeof createDexReportController> | null>(null);

  useEffect(() => {
    const controller = createDexReportController({ onChange: setState });
    controllerRef.current = controller;
    const timer = window.setInterval(() => controller.tick(), 1_000);
    return () => {
      window.clearInterval(timer);
      controller.unmount();
      controllerRef.current = null;
    };
  }, []);

  const selectFile = (file: File | null) => {
    if (file !== null) void controllerRef.current?.selectFile(file);
  };
  const showExample = () => controllerRef.current?.showExample(SYNTHETIC_DEX_REPORT);
  const clear = () => controllerRef.current?.clear();

  return <DexReportPanelView state={state} onSelectFile={selectFile} onShowExample={showExample} onClear={clear} />;
}
