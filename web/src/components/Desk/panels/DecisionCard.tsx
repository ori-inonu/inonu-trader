"use client";

import type { DecisionMarker } from "@/lib/desk/chart/decisions";
import { fmtBps, fmtClockSec, fmtNumber, UNAVAILABLE } from "@/lib/desk/ui/format";
import styles from "./DecisionCard.module.css";

export interface DecisionCardProps {
  readonly marker: DecisionMarker;
  /** Glyph position inside the plot box, in CSS px. */
  readonly x: number;
  readonly y: number;
  /** Plot box size, so the card stays inside it. */
  readonly plotWidth: number;
  readonly plotHeight: number;
  readonly decimals: number;
}

const ACTION_WORD: Record<DecisionMarker["action"], string> = { buy: "Comprar", sell: "Vender", hold: "Manter" };
const WEIGHT_WORD: Record<DecisionMarker["action"], string> = { buy: "Comprar", sell: "Vender", hold: "Manter" };

const CARD_W = 232;
/** Conservative height guess used only to pick above or below the glyph; real height flexes. */
const CARD_H = 200;

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

function outcomeText(marker: DecisionMarker): string | null {
  const o = marker.outcome;
  if (o.kind === "none") return null;
  if (o.kind === "pending") return `Resultado apos ${marker.horizonMinutes} min: em andamento`;
  if (o.kind === "not_measured") return "Resultado nao medido nesta escala";
  return `Resultado apos ${marker.horizonMinutes} min: ${fmtBps(o.bps)} ${o.favourable ? "a favor" : "contra"}, bruto`;
}

/**
 * The decision card that opens near a marker glyph (G5): what the Inonu decided, with which
 * weights, what the model cost, the price it saw and what happened after the horizon - always
 * with the fixed advisory line. It is a live region: opening or switching markers announces it.
 */
export function DecisionCard({ marker, x, y, plotWidth, plotHeight, decimals }: DecisionCardProps) {
  const left = clamp(x - CARD_W / 2, 6, Math.max(6, plotWidth - CARD_W - 6));
  const below = y + 18 + CARD_H <= plotHeight;
  const top = below ? y + 14 : y - 14;
  const outcome = outcomeText(marker);
  const weights = (["buy", "sell", "hold"] as const).map((key) => ({ key, label: WEIGHT_WORD[key], p: marker.weights[key] }));
  return (
    <div
      className={styles.card}
      role="status"
      data-action={marker.action}
      style={{ left, top, transform: below ? "none" : "translateY(-100%)" }}
      aria-label={`Decisao do Inonu: ${ACTION_WORD[marker.action]}`}
    >
      <header className={styles.head}>
        <span className={styles.action} data-action={marker.action}>{ACTION_WORD[marker.action]}</span>
        <span className={styles.when}>{fmtClockSec(marker.anchorMs)}</span>
      </header>
      <ul className={styles.weights}>
        {weights.map((w) => (
          <li key={w.key} className={styles.weight} data-key={w.key}>
            <span>{w.label}</span>
            <span className={styles.weightValue}>{Number.isFinite(w.p) ? `${Math.round(w.p * 100)}%` : UNAVAILABLE}</span>
          </li>
        ))}
      </ul>
      <dl className={styles.facts}>
        <div className={styles.fact}>
          <dt>Preco na decisao</dt>
          <dd>{fmtNumber(marker.price, decimals)}</dd>
        </div>
        <div className={styles.fact}>
          <dt>Modelo</dt>
          <dd>{marker.model}</dd>
        </div>
        <div className={styles.fact}>
          <dt>Latencia</dt>
          <dd>{marker.latencyMs === null ? UNAVAILABLE : `${Math.round(marker.latencyMs)} ms`}</dd>
        </div>
      </dl>
      {outcome !== null ? <p className={styles.outcome} data-tone={marker.outcome.kind === "measured" ? (marker.outcome.favourable ? "up" : "down") : "none"}>{outcome}</p> : null}
      <p className={styles.note}>Decisao consultiva do Inonu, nada foi enviado</p>
    </div>
  );
}
