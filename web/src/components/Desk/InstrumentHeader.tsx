"use client";

import { type CSSProperties, useRef } from "react";
import { AWAITING, UNAVAILABLE } from "@/lib/desk/ui/format";
import { instrumentHeaderModel, tickDirection, type TickDirection } from "@/lib/desk/ui/instrument-header";
import type { DeskDerivatives, DeskInstrument, DeskMetrics, DeskTicker } from "@/lib/desk/types";
import styles from "./InstrumentHeader.module.css";

export interface InstrumentHeaderProps {
  ticker: DeskTicker | null;
  metrics: DeskMetrics;
  instrument: DeskInstrument | null;
  derivatives: DeskDerivatives | null;
  /** The feed behind the ticker is silent past its freshness window: the figures dim and say so. */
  stale?: boolean;
  /** "bar" sits inside the decision bar of the wide desk; "compact" is the one line over the chart on a phone. */
  variant?: "bar" | "compact";
  /** Name the selected provider when its ticker has not arrived. */
  awaitingLabel?: string;
}

/**
 * The instrument header: the last price as the hero figure, coloured by the direction of the last
 * print (the way the platforms do it, with a single colour transition and never a blink), the 24h
 * change, where the price sits inside the 24h range, and the volume, spread and funding of the
 * instrument in focus. Every figure comes from the live desk slices; an unknown one says so.
 */
export default function InstrumentHeader({ ticker, metrics, instrument, derivatives, stale = false, variant = "bar", awaitingLabel = AWAITING }: InstrumentHeaderProps) {
  const model = instrumentHeaderModel({ ticker, metrics, instrument, derivatives });

  // The direction of the last print is the one piece of state the model cannot derive on its own: it
  // needs the previous print of the same instrument. A change of instrument starts over at flat.
  const memory = useRef<{ instId: string | null; last: number | null; dir: TickDirection }>({ instId: null, last: null, dir: "flat" });
  const instId = ticker?.instId ?? null;
  const last = ticker?.last ?? null;
  const prev = memory.current.instId === instId ? memory.current : { instId, last: null, dir: "flat" as const };
  const dir = tickDirection(prev.last, last, prev.dir);
  memory.current = { instId, last, dir };

  const rangeStyle = model.range.position === null ? undefined : ({ "--p": model.range.position.toFixed(4) } as CSSProperties);

  return (
    <div className={styles.root} data-variant={variant} data-stale={stale ? "true" : undefined} role="group" aria-label={model.label}>
      <div className={styles.quote}>
        {model.known ? (
          <span className={styles.price} data-dir={dir} title={model.asOf === null ? undefined : `Ultimo preco as ${model.asOf} UTC`}>
            {model.price}
            <span className="srOnly">{dir === "up" ? ", ultimo negocio acima do anterior" : dir === "down" ? ", ultimo negocio abaixo do anterior" : ""}</span>
          </span>
        ) : (
          <span className={styles.awaiting} role="status">{awaitingLabel}</span>
        )}
        <span className={styles.caption}>
          <span>Ultimo{model.quote ? ` em ${model.quote}` : ""}</span>
          {model.changeAbs !== null ? <span className={styles.captionAbs} data-tone={model.change.tone}>{model.changeAbs} em 24 h</span> : null}
          {stale ? <span className={styles.staleWord}>dado velho</span> : null}
        </span>
      </div>

      <span className={styles.pill} data-tone={model.change.tone} title="Variacao sobre a abertura de 24 horas">
        <span className={styles.pillMicro}>24h</span>
        {model.change.text}
      </span>

      <div className={styles.range} role="img" aria-label={model.range.label} title={model.range.label} style={rangeStyle}>
        <span className={styles.rangeEnd}>
          <span className={styles.micro}>Min 24h</span>
          <span className={styles.rangeValue} data-known={model.range.low === UNAVAILABLE ? "false" : "true"}>{model.range.low}</span>
        </span>
        <span className={styles.rangeTrack} aria-hidden="true">
          {model.range.position !== null ? <span className={styles.rangeMark} /> : null}
        </span>
        <span className={`${styles.rangeEnd} ${styles.rangeEndHigh}`}>
          <span className={styles.micro}>Max 24h</span>
          <span className={styles.rangeValue} data-known={model.range.high === UNAVAILABLE ? "false" : "true"}>{model.range.high}</span>
        </span>
      </div>

      <dl className={styles.stats} aria-label="Numeros do mercado em foco">
        {model.stats.map((stat) => (
          <div key={stat.id} className={styles.stat} data-stat={stat.id}>
            <dt className={styles.micro}>{stat.label}</dt>
            <dd className={styles.statValue} data-tone={stat.tone} data-known={stat.known ? "true" : "false"}>{stat.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
