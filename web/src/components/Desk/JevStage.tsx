"use client";

import { donutSegments } from "@/lib/mesa/arcs";
import type { JevStageModel } from "@/lib/mesa/mesa-model";
import { baseSymbol, fmtPctSigned, fmtPx, priceDecimals, quoteSymbol, UNAVAILABLE } from "@/lib/desk/ui/format";
import styles from "./JevStage.module.css";

export interface JevStageProps {
  model: JevStageModel;
  last: number | null;
  tickSz: string | null;
  change24hPct: number | null;
  /** One honest line about the leverage layer, null when there is nothing to say. */
  systemOneLine: string | null;
}

const RADIUS = 21;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
const KEY_CLASS = { buy: "arcBuy", sell: "arcSell", hold: "arcHold" } as const;

/**
 * The compact Jev strip (spec G9): one row, about 96 px tall, that keeps the market in focus,
 * the decision headline and weights, the freshness line and a small decision donut. What the Jev
 * saw stays in the DOM for assistive tech; the advisory note lives in the section title.
 */
export default function JevStage({ model, last, tickSz, change24hPct, systemOneLine }: JevStageProps) {
  const segments = donutSegments(model.probabilities.map((p) => p.p), CIRCUMFERENCE, 3);
  const known = segments.some((s) => s.length > 0);
  const decimals = priceDecimals(tickSz);
  const change = change24hPct;
  const gaugeLabel = known
    ? model.probabilities.map((p) => `${p.label} ${p.p === null ? UNAVAILABLE : Math.round(p.p * 100) + "%"}`).join(", ")
    : "Pesos do Inonu indisponiveis";

  return (
    <section className={styles.stage} data-tone={model.tone} data-dimmed={model.dimmed ? "true" : "false"} aria-label="Decisao do Inonu" title={model.advisoryNote}>
      <div className={styles.market}>
        <span className={styles.micro}>Mercado em foco</span>
        <h2 className={styles.pair}>
          {baseSymbol(model.instId)}
          <span className={styles.quote}>/{quoteSymbol(model.instId)}</span>
        </h2>
        <div className={styles.quoteBox}>
          <span className={styles.price}>{fmtPx(last, decimals)}</span>
          <span className={`${styles.change} ${change === null ? "" : change >= 0 ? styles.up : styles.down}`}>
            {change === null ? UNAVAILABLE : `${fmtPctSigned(change, 2)} em 24 h`}
          </span>
        </div>
      </div>

      <div className={styles.decision}>
        <span className={styles.micro}>Inonu decide</span>
        <strong className={styles.headline}>{model.headline}</strong>
        <span className={styles.confidence}>{model.confidenceText === UNAVAILABLE ? "Peso indisponivel" : `${model.confidenceText} de peso`}</span>
      </div>

      <ul className={styles.weights} aria-label="Pesos de decisao">
        {model.probabilities.map((p) => (
          <li key={p.key} className={styles.weight} data-key={p.key}>
            <span className={styles.weightLabel}>{p.label}</span>
            <span className={styles.weightTrack}>
              <span className={styles.weightFill} style={{ width: p.p === null ? "0%" : `${Math.round(p.p * 100)}%` }} />
            </span>
            <span className={styles.weightValue}>{p.p === null ? UNAVAILABLE : `${Math.round(p.p * 100)}%`}</span>
          </li>
        ))}
      </ul>

      <div className={styles.meta}>
        <p className={styles.status} title={model.statusLine}>
          {model.statusLine}
        </p>
        {model.seen.length > 0 ? (
          <dl className={styles.seen} aria-label="O que o Inonu viu" title={model.seen.map((item) => `${item.label}: ${item.value}`).join(", ")}>
            {model.seen.map((item) => (
              <div key={item.label} className={styles.seenItem}>
                <dt>{item.label}</dt>
                <dd>{item.value}</dd>
              </div>
            ))}
          </dl>
        ) : (
          <p className={styles.muted}>O Inonu ainda nao tem uma leitura para mostrar o que viu.</p>
        )}
        <p className={styles.foot}>
          {model.model ? <span className={styles.modelTag}>{model.model}{model.latencyMs !== null ? `, ${Math.round(model.latencyMs)} ms` : ""}</span> : null}
          {systemOneLine ? <span className={styles.systemOne}>{systemOneLine}</span> : null}
        </p>
      </div>

      <svg className={styles.gauge} viewBox="0 0 56 56" role="img" aria-label={gaugeLabel}>
        <circle className={styles.track} cx="28" cy="28" r={RADIUS} />
        {model.probabilities.map((p, i) => {
          const s = segments[i]!;
          if (s.length <= 0) return null;
          return (
            <circle
              key={p.key}
              className={`${styles.arc} ${styles[KEY_CLASS[p.key]]}`}
              cx="28"
              cy="28"
              r={RADIUS}
              strokeDasharray={`${s.length} ${CIRCUMFERENCE}`}
              strokeDashoffset={-s.offset - 1.5}
            />
          );
        })}
      </svg>
    </section>
  );
}
