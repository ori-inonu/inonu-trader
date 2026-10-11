"use client";

import { useId, useMemo, useState } from "react";
import { buildPhaseTable, PHASE_LABELS, PHASE_PROMOTION_CRITERIA, type PhaseCell } from "@/lib/central/phases";
import { formatLeverage, formatPercent, formatUsd } from "@/lib/central/format";
import { STATUS_LABEL } from "@/lib/central/ecosystem-catalog";
import {
  BASELINE,
  DECK_VIEWS,
  HORIZONS,
  SIGMA_CHOICES,
  ecosystemTotals,
  familySummaries,
  leverageBars,
  riskReading,
  sigmaFor,
  tierSteps,
  type DeckView,
} from "@/lib/growth-deck";
import styles from "./GrowthDeck.module.css";

export interface GrowthDeckProps {
  reducedMotion?: boolean;
}

const CAPITAL_PRESETS: readonly number[] = [100, 500, 1_000, 5_000];
const MU_PRESETS: readonly { label: string; mu: number }[] = [
  { label: "0%", mu: 0 },
  { label: "0,1%", mu: 0.001 },
  { label: "0,3%", mu: 0.003 },
  { label: "0,5%", mu: 0.005 },
];

function phaseCellText(cell: PhaseCell): string {
  switch (cell.kind) {
    case "none":
      return "nao se aplica";
    case "text":
      return cell.text;
    case "leverage":
      return cell.max === 0 ? "sem alavancagem" : formatLeverage(cell.max);
    case "usd":
      return cell.fraction !== undefined ? `${formatUsd(cell.usd)} (${formatPercent(cell.fraction, 0)})` : formatUsd(cell.usd);
    case "position":
      return `${formatUsd(cell.position.usd)} (${formatPercent(cell.position.fraction, 1)})`;
    case "floor":
      return formatPercent(cell.fraction, 0);
  }
}

/**
 * The growth deck: what Jev may move, under which permission tier and with which limits. Three
 * views switch in place; the active one flips in once. Every number is arithmetic from R2 and
 * R3, shown for reading only. There is no control here that executes anything.
 */
export default function GrowthDeck({ reducedMotion = false }: GrowthDeckProps) {
  const [view, setView] = useState<DeckView>("risk");
  const [capital, setCapital] = useState<number>(100);
  const [sigmaId, setSigmaId] = useState<string>("MON");
  const [days, setDays] = useState<number>(30);
  const [mu, setMu] = useState<number>(0);
  const baseId = useId();

  const sigma = sigmaFor(sigmaId);
  const params = useMemo(() => ({ capitalUsd: capital, sigma, mu, days }), [capital, sigma, mu, days]);
  const bars = useMemo(() => leverageBars(params), [params]);
  const reading = useMemo(() => riskReading(params, 2), [params]);
  const phaseRows = useMemo(() => buildPhaseTable(capital, sigma), [capital, sigma]);
  const steps = useMemo(() => tierSteps(), []);
  const families = useMemo(() => familySummaries(), []);
  const totals = useMemo(() => ecosystemTotals(), []);

  return (
    <section className={`${styles.deck} ${reducedMotion ? styles.still : ""}`} aria-labelledby={`${baseId}-title`}>
      <header className={styles.head}>
        <div className={styles.headCopy}>
          <p className={styles.eyebrow}>Alavancagem e crescimento</p>
          <h2 className={styles.title} id={`${baseId}-title`}>O que o Jev pode mover</h2>
          <p className={styles.lede}>
            A aritmetica de risco de R3, os niveis de permissao de R2 e o mapa do ecossistema OKX, lado a lado. Leitura apenas: nada aqui executa.
          </p>
        </div>
        <div className={styles.switch} role="tablist" aria-label="Visoes da central">
          {DECK_VIEWS.map((entry) => (
            <button
              key={entry.id}
              type="button"
              role="tab"
              id={`${baseId}-tab-${entry.id}`}
              aria-selected={view === entry.id}
              aria-controls={`${baseId}-panel-${entry.id}`}
              className={`${styles.tab} ${view === entry.id ? styles.tabActive : ""}`}
              onClick={() => setView(entry.id)}
            >
              {entry.label}
            </button>
          ))}
        </div>
      </header>

      <div className={styles.stage}>
        {view === "risk" ? (
          <div key="risk" className={styles.panel} role="tabpanel" id={`${baseId}-panel-risk`} aria-labelledby={`${baseId}-tab-risk`}>
            <div className={styles.controls}>
              <fieldset className={styles.group}>
                <legend className={styles.legend}>Capital</legend>
                <div className={styles.segment}>
                  {CAPITAL_PRESETS.map((value) => (
                    <button key={value} type="button" className={`${styles.seg} ${capital === value ? styles.segActive : ""}`} aria-pressed={capital === value} onClick={() => setCapital(value)}>
                      {formatUsd(value)}
                    </button>
                  ))}
                </div>
              </fieldset>
              <fieldset className={styles.group}>
                <legend className={styles.legend}>Volatilidade diaria</legend>
                <div className={styles.segment}>
                  {SIGMA_CHOICES.map((choice) => (
                    <button key={choice.id} type="button" className={`${styles.seg} ${sigmaId === choice.id ? styles.segActive : ""}`} aria-pressed={sigmaId === choice.id} onClick={() => setSigmaId(choice.id)}>
                      {choice.label} {formatPercent(choice.sigma, 2)}
                    </button>
                  ))}
                </div>
              </fieldset>
              <fieldset className={styles.group}>
                <legend className={styles.legend}>Horizonte</legend>
                <div className={styles.segment}>
                  {HORIZONS.map((value) => (
                    <button key={value} type="button" className={`${styles.seg} ${days === value ? styles.segActive : ""}`} aria-pressed={days === value} onClick={() => setDays(value)}>
                      {value} dias
                    </button>
                  ))}
                </div>
              </fieldset>
              <fieldset className={styles.group}>
                <legend className={styles.legend}>Vantagem diaria assumida</legend>
                <div className={styles.segment}>
                  {MU_PRESETS.map((preset) => (
                    <button key={preset.label} type="button" className={`${styles.seg} ${mu === preset.mu ? styles.segActive : ""}`} aria-pressed={mu === preset.mu} onClick={() => setMu(preset.mu)}>
                      {preset.label}
                    </button>
                  ))}
                </div>
              </fieldset>
            </div>

            <div className={styles.chartWrap}>
              <div className={styles.chart} role="img" aria-label={`Mediana do patrimonio e chance de tocar a liquidacao por alavancagem, capital ${formatUsd(capital)}, ${days} dias`}>
                <span className={styles.baseline} style={{ bottom: `${BASELINE * 100}%` }} aria-hidden="true">
                  <span className={styles.baselineLabel}>1x, capital preservado</span>
                </span>
                {bars.map((bar) => (
                  <div key={bar.leverage} className={styles.column}>
                    <div className={styles.columnBars}>
                      <span
                        className={`${styles.bar} ${styles.barMedian} ${bar.medianMultiple < 1 ? styles.barLoss : styles.barGain}`}
                        style={{ ["--h" as string]: bar.medianHeight.toFixed(4) }}
                        aria-hidden="true"
                      >
                        <span className={styles.barFace} />
                        <span className={styles.barTop} />
                      </span>
                      <span className={`${styles.bar} ${styles.barTouch}`} style={{ ["--h" as string]: bar.touchHeight.toFixed(4) }} aria-hidden="true">
                        <span className={styles.barFace} />
                        <span className={styles.barTop} />
                      </span>
                    </div>
                    <span className={styles.columnLeverage}>{bar.leverageText}</span>
                    <span className={styles.columnMedian}>{bar.medianText}</span>
                    <span className={styles.columnTouch}>liquida {bar.touchText}</span>
                  </div>
                ))}
              </div>
              <ul className={styles.legendRow} aria-hidden="true">
                <li><span className={`${styles.swatch} ${styles.swatchGain}`} /> mediana do patrimonio acima de 1x</li>
                <li><span className={`${styles.swatch} ${styles.swatchLoss}`} /> mediana abaixo de 1x</li>
                <li><span className={`${styles.swatch} ${styles.swatchTouch}`} /> chance de tocar a liquidacao no horizonte</li>
              </ul>
            </div>

            <div className={styles.reading}>
              <p className={styles.readingKelly}>{reading.kellyText}</p>
              <p className={styles.readingVerdict}>{reading.verdict}</p>
              <p className={styles.note}>
                Modelo de R3 4.1: movimento browniano geometrico sem saltos, rebalanceamento continuo, sem custos. Subestima as caudas. E aritmetica, nao previsao e nao recomendacao.
              </p>
            </div>
          </div>
        ) : null}

        {view === "limits" ? (
          <div key="limits" className={styles.panel} role="tabpanel" id={`${baseId}-panel-limits`} aria-labelledby={`${baseId}-tab-limits`}>
            <div className={styles.stairs} aria-label="Niveis de permissao" role="list">
              {steps.map((step) => (
                <article key={step.tier.id} role="listitem" className={`${styles.step} ${styles[`step_${step.stateTone}`]}`} style={{ ["--i" as string]: String(step.index) }}>
                  <span className={styles.stepId}>{step.tier.id}</span>
                  <span className={styles.stepName}>{step.tier.name}</span>
                  <span className={styles.stepState}>{step.stateLabel}</span>
                  <p className={styles.stepSummary}>{step.tier.summary}</p>
                  {step.tier.blockers.length ? <p className={styles.stepBlocker}>{step.tier.blockers[0]}</p> : <p className={styles.stepBlocker}>{step.tier.allows}</p>}
                </article>
              ))}
            </div>

            <div className={styles.phaseHead}>
              <h3 className={styles.subtitle}>Perfil de limites por fase</h3>
              <p className={styles.note}>
                Para {formatUsd(capital)} de capital e volatilidade diaria de {formatPercent(sigma, 2)} ({sigmaId}). Troque os valores na visao de risco.
              </p>
            </div>
            <div className={styles.tableWrap} tabIndex={0} role="region" aria-label="Tabela de limites por fase">
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th scope="col">Limite</th>
                    <th scope="col">{PHASE_LABELS[0].short}</th>
                    <th scope="col">{PHASE_LABELS[1].short}</th>
                    <th scope="col">{PHASE_LABELS[2].short}</th>
                  </tr>
                </thead>
                <tbody>
                  {phaseRows.map((row) => (
                    <tr key={row.id}>
                      <th scope="row">
                        <span className={styles.rowLabel}>{row.label}</span>
                        <span className={styles.rowBasis}>{row.basis}</span>
                      </th>
                      {row.cells.map((cell, index) => (
                        <td key={index} className={styles.num}>{phaseCellText(cell)}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <ul className={styles.criteria}>
              {PHASE_PROMOTION_CRITERIA.map((criterion) => (
                <li key={criterion}>{criterion}</li>
              ))}
            </ul>
          </div>
        ) : null}

        {view === "ecosystem" ? (
          <div key="ecosystem" className={styles.panel} role="tabpanel" id={`${baseId}-panel-ecosystem`} aria-labelledby={`${baseId}-tab-ecosystem`}>
            <div className={styles.totals}>
              <span className={styles.total}><strong>{totals.total}</strong> capacidades mapeadas</span>
              <span className={`${styles.total} ${styles.total_implemented}`}><strong>{totals.implemented}</strong> {STATUS_LABEL.implemented.toLowerCase()}</span>
              <span className={`${styles.total} ${styles.total_read_only}`}><strong>{totals.read_only}</strong> {STATUS_LABEL.read_only.toLowerCase()}</span>
              <span className={`${styles.total} ${styles.total_blocked}`}><strong>{totals.blocked}</strong> {STATUS_LABEL.blocked.toLowerCase()}</span>
              <span className={`${styles.total} ${styles.total_unconfirmed}`}><strong>{totals.unconfirmed}</strong> {STATUS_LABEL.unconfirmed.toLowerCase()}</span>
            </div>
            <div className={styles.families}>
              {families.map((summary, index) => (
                <article key={summary.family.id} className={styles.family} style={{ ["--i" as string]: String(index) }}>
                  <span className={styles.familyName}>{summary.family.name}</span>
                  <span className={styles.familyCount}>{summary.counts.total}</span>
                  <p className={styles.familySummary}>{summary.family.summary}</p>
                  <span className={styles.stack} role="img" aria-label={`${summary.family.name}: ${summary.counts.implemented} implementado, ${summary.counts.read_only} somente leitura, ${summary.counts.blocked} bloqueado, ${summary.counts.unconfirmed} nao confirmado`}>
                    {summary.shares.map((share) => (
                      <span key={share.status} className={`${styles.stackPart} ${styles[`stack_${share.status}`]}`} style={{ flexGrow: Number(share.share.toFixed(4)) }} />
                    ))}
                  </span>
                </article>
              ))}
            </div>
            <p className={styles.note}>
              Implementado quer dizer ligado neste repositorio como observador somente leitura, nivel T0. Nada aqui esta habilitado para executar.
            </p>
          </div>
        ) : null}
      </div>
    </section>
  );
}
