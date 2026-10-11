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

const RADIUS = 78;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
const KEY_CLASS = { buy: "arcBuy", sell: "arcSell", hold: "arcHold" } as const;

export default function JevStage({ model, last, tickSz, change24hPct, systemOneLine }: JevStageProps) {
  const segments = donutSegments(model.probabilities.map((p) => p.p), CIRCUMFERENCE, 4);
  const known = segments.some((s) => s.length > 0);
  const decimals = priceDecimals(tickSz);
  const change = change24hPct;
  const gaugeLabel = known
    ? model.probabilities.map((p) => `${p.label} ${p.p === null ? UNAVAILABLE : Math.round(p.p * 100) + "%"}`).join(", ")
    : "Pesos do Jev indisponiveis";

  return (
    <section className={styles.stage} data-tone={model.tone} data-dimmed={model.dimmed ? "true" : "false"} aria-label="Decisao do Jev">
      <header className={styles.head}>
        <div className={styles.market}>
          <span className={styles.micro}>Mercado em foco</span>
          <h2 className={styles.pair}>
            {baseSymbol(model.instId)}
            <span className={styles.quote}>/{quoteSymbol(model.instId)}</span>
          </h2>
        </div>
        <div className={styles.quoteBox}>
          <span className={styles.price}>{fmtPx(last, decimals)}</span>
          <span className={`${styles.change} ${change === null ? "" : change >= 0 ? styles.up : styles.down}`}>
            {change === null ? UNAVAILABLE : `${fmtPctSigned(change, 2)} em 24 h`}
          </span>
        </div>
      </header>

      <div className={styles.body}>
        <div className={styles.side}>
          <ul className={styles.weights} aria-label="Pesos de decisao">
            {model.probabilities.map((p) => (
              <li key={p.key} className={styles.weight} data-key={p.key}>
                <span className={styles.weightLabel}>{p.label}</span>
                <span className={styles.weightValue}>{p.p === null ? UNAVAILABLE : `${Math.round(p.p * 100)}%`}</span>
                <span className={styles.weightTrack}>
                  <span className={styles.weightFill} style={{ width: p.p === null ? "0%" : `${Math.round(p.p * 100)}%` }} />
                </span>
              </li>
            ))}
          </ul>
          <p className={styles.status}>{model.statusLine}</p>
        </div>

        <div className={styles.orbitCell}>
        <div className={styles.orbit}>
          <div className={styles.rig} aria-hidden="true">
            <span className={`${styles.ring} ${styles.ringA}`} />
            <span className={`${styles.ring} ${styles.ringB}`} />
            <span className={`${styles.ring} ${styles.ringC}`} />
            <span className={styles.floor} />
          </div>
          <svg className={styles.gauge} viewBox="0 0 200 200" role="img" aria-label={gaugeLabel}>
            <circle className={styles.track} cx="100" cy="100" r={RADIUS} />
            {model.probabilities.map((p, i) => {
              const s = segments[i]!;
              if (s.length <= 0) return null;
              return (
                <circle
                  key={p.key}
                  className={`${styles.arc} ${styles[KEY_CLASS[p.key]]}`}
                  cx="100"
                  cy="100"
                  r={RADIUS}
                  strokeDasharray={`${s.length} ${CIRCUMFERENCE}`}
                  strokeDashoffset={-s.offset - 2}
                />
              );
            })}
          </svg>
          <div className={styles.core}>
            <span className={styles.micro}>Jev decide</span>
            <strong className={`${styles.headline} ${model.headline.length > 8 ? styles.headlineLong : ""}`}>{model.headline}</strong>
            <span className={styles.confidence}>{model.confidenceText === UNAVAILABLE ? "Peso indisponivel" : `${model.confidenceText} de peso`}</span>
          </div>
        </div>
        </div>

        <div className={styles.side}>
          {model.seen.length > 0 ? (
            <dl className={styles.seen} aria-label="O que o Jev viu">
              {model.seen.map((item) => (
                <div key={item.label} className={styles.seenItem}>
                  <dt>{item.label}</dt>
                  <dd>{item.value}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <p className={styles.muted}>O Jev ainda nao tem uma leitura para mostrar o que viu.</p>
          )}
        </div>
      </div>

      <footer className={styles.foot}>
        <span>{model.advisoryNote}</span>
        {model.model ? <span className={styles.modelTag}>{model.model}{model.latencyMs !== null ? `, ${Math.round(model.latencyMs)} ms` : ""}</span> : null}
        {systemOneLine ? <span className={styles.systemOne}>{systemOneLine}</span> : null}
      </footer>
    </section>
  );
}
