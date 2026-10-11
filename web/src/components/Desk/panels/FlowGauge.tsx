"use client";

import { type CSSProperties, useMemo } from "react";
import { flowWord, imbalanceAngle, polar, tickPath, valueArc, arcPath } from "@/lib/desk/ui/gauge";
import {
  baseSymbol,
  fmtCompact,
  fmtNumber,
  fmtPctSigned,
  fmtShare,
  UNAVAILABLE,
} from "@/lib/desk/ui/format";
import { flowLayout } from "@/lib/desk/ui/right-wing-layout";
import { cumulative, sparkArea, sparkPath, sparkZeroY } from "@/lib/desk/ui/spark";
import { useElementSize } from "@/lib/desk/ui/useElementSize";
import type { DeskFlowBucket, DeskInstrument, DeskMetrics } from "@/lib/desk/types";
import { PanelEmpty, PanelFrame } from "./PanelFrame";
import styles from "./FlowGauge.module.css";

const FALLBACK = { width: 320, height: 340 };

/** Gauge drawing space. The SVG scales to its box, so these are only proportions. */
const VB_W = 200;
const VB_H = 112;
const CX = 100;
const CY = 100;
const R = 78;
const TRACK = 9;

const SPARK_W = 200;
const SPARK_H = 44;

export interface FlowGaugeProps {
  metrics: DeskMetrics;
  /** Per second buckets of taker flow, oldest first. */
  flow: readonly DeskFlowBucket[];
  /** Used only to name the unit of the volumes. */
  instrument?: DeskInstrument | null;
  stale?: boolean;
  reducedMotion?: boolean;
}

function toneOf(v: number | null): "buy" | "sell" | "flat" | "none" {
  if (v === null || !Number.isFinite(v)) return "none";
  if (v > 0.15) return "buy";
  if (v < -0.15) return "sell";
  return "flat";
}

/**
 * Aggressor flow: a semicircular gauge from the 60 second buy against sell imbalance (sell at the
 * left end, buy at the right), the buy and sell volumes, trades per second, and the cumulative
 * volume delta of the per second buckets as a sparkline. The marker eases to a new value in a
 * short transition and never jitters.
 */
export function FlowGauge({ metrics, flow, instrument = null, stale = false, reducedMotion = false }: FlowGaugeProps) {
  const [ref, size] = useElementSize<HTMLDivElement>(FALLBACK);
  const imbalance = metrics.flowImbalance60s;
  const known = imbalance !== null && Number.isFinite(imbalance);
  const hasData = known || flow.length > 0 || metrics.buyVolBase60s !== null || metrics.sellVolBase60s !== null;
  const tone = toneOf(imbalance);
  const angle = imbalanceAngle(known ? imbalance : 0);
  const unit = instrument ? baseSymbol(instrument.instId) : "";

  const deltas = useMemo(() => cumulative(flow.map((b) => b.buyBase - b.sellBase)), [flow]);
  const sparkLine = useMemo(() => sparkPath(deltas, SPARK_W, SPARK_H, 2), [deltas]);
  const sparkFill = useMemo(() => sparkArea(deltas, SPARK_W, SPARK_H, 2), [deltas]);
  const zeroY = useMemo(() => sparkZeroY(deltas, SPARK_H, 2), [deltas]);
  const lastDelta = deltas.length ? deltas[deltas.length - 1] : null;
  const sparkTone = lastDelta === null ? "none" : lastDelta >= 0 ? "buy" : "sell";

  const buyShare = known ? (imbalance + 1) / 2 : null;
  const layout = flowLayout(size.width, size.height);
  const compact = layout.mode !== "full";
  const bias = known ? Math.min(1, Math.max(-1, imbalance)) : 0;

  const needleStyle = { transform: `rotate(${(angle - 90).toFixed(2)}deg)` } as CSSProperties;
  const gaugeLabel = known
    ? `Fluxo agressor em 60 segundos: ${fmtPctSigned(imbalance * 100, 0)}, ${flowWord(imbalance)}. Compradores ${fmtShare(buyShare, 0)}, vendedores ${fmtShare(1 - (buyShare ?? 0.5), 0)}.`
    : "Fluxo agressor indisponivel.";

  return (
    <PanelFrame title="Fluxo agressor" subtitle={instrument?.instId ?? null} right={hasData ? <span className={styles.window}>60 s</span> : undefined} stale={stale} empty={!hasData}>
      {/* The measured box is the unpadded frame, so the layout thresholds are body heights. */}
      <div ref={ref} className={styles.frame}>
      <div
        className={`${styles.root} ${reducedMotion ? styles.still : ""}`}
        data-mode={layout.mode}
        data-compact={compact ? "true" : undefined}
        style={{ "--stat-cols": layout.statCols } as CSSProperties}
      >
        {hasData ? (
          <>
            {layout.mode === "bar" ? (
              <div className={styles.biasBox} data-tone={tone} role="img" aria-label={gaugeLabel}>
                <div className={styles.biasHead}>
                  <span className={known ? styles.biasRead : styles.biasOff}>{known ? fmtPctSigned(imbalance * 100, 0) : UNAVAILABLE}</span>
                  <span className={styles.biasWord}>{flowWord(imbalance)}</span>
                </div>
                <div className={styles.biasRow} aria-hidden="true">
                  <span className={styles.biasEnd}>Venda</span>
                  <span className={styles.biasTrack}>
                    {known ? (
                      <span
                        className={styles.biasFill}
                        style={{ left: `${(bias >= 0 ? 50 : 50 + bias * 50).toFixed(2)}%`, width: `${(Math.abs(bias) * 50).toFixed(2)}%` }}
                      />
                    ) : null}
                    <span className={styles.biasCenter} />
                    {known ? <span className={styles.biasMark} style={{ left: `${(50 + bias * 50).toFixed(2)}%` }} /> : null}
                  </span>
                  <span className={styles.biasEnd}>Compra</span>
                </div>
              </div>
            ) : (
            <div className={styles.gaugeBox} data-tone={tone} role="img" aria-label={gaugeLabel}>
              <svg className={styles.gauge} viewBox={`0 0 ${VB_W} ${VB_H}`} preserveAspectRatio="xMidYMax meet" aria-hidden="true">
                <path className={styles.track} d={arcPath(CX, CY, R, 0, 180)} strokeWidth={TRACK} />
                {known ? <path className={styles.value} d={valueArc(CX, CY, R, imbalance)} strokeWidth={TRACK} /> : null}
                {[-1, -0.5, 0, 0.5, 1].map((v) => (
                  <path key={v} className={styles.tick} d={tickPath(CX, CY, R + TRACK / 2 + 2, R + TRACK / 2 + (v === 0 || Math.abs(v) === 1 ? 7 : 4), imbalanceAngle(v))} />
                ))}
                <text className={styles.end} x={polar(CX, CY, R, 0).x} y={CY + 11} textAnchor="middle">Venda</text>
                <text className={styles.end} x={polar(CX, CY, R, 180).x} y={CY + 11} textAnchor="middle">Compra</text>
                {known ? (
                  <g className={styles.needle} style={needleStyle}>
                    <path className={styles.needleLine} d={`M${CX} ${CY - R + TRACK / 2 + 3} L${CX} ${CY - R - TRACK / 2 - 3}`} />
                  </g>
                ) : null}
                <text className={known ? styles.read : styles.readOff} x={CX} y={CY - 24} textAnchor="middle">
                  {known ? fmtPctSigned(imbalance * 100, 0) : UNAVAILABLE}
                </text>
                <text className={styles.word} x={CX} y={CY - 8} textAnchor="middle">
                  {flowWord(imbalance)}
                </text>
              </svg>
            </div>
            )}

            <dl className={styles.stats}>
              <div className={styles.stat} data-tone="buy">
                <dt>{compact ? "Compra" : "Compra 60s"}</dt>
                <dd>{fmtCompact(metrics.buyVolBase60s)}{!compact && unit && metrics.buyVolBase60s !== null ? <span className={styles.unit}> {unit}</span> : null}</dd>
              </div>
              <div className={styles.stat} data-tone="sell">
                <dt>{compact ? "Venda" : "Venda 60s"}</dt>
                <dd>{fmtCompact(metrics.sellVolBase60s)}{!compact && unit && metrics.sellVolBase60s !== null ? <span className={styles.unit}> {unit}</span> : null}</dd>
              </div>
              <div className={styles.stat}>
                <dt>{compact ? "Neg/s" : "Negocios/s"}</dt>
                <dd>{fmtNumber(metrics.tradesPerSecond60s, 1)}</dd>
              </div>
              <div className={styles.stat} data-tone={metrics.cvd === null ? undefined : metrics.cvd >= 0 ? "buy" : "sell"}>
                <dt>CVD</dt>
                <dd>{metrics.cvd === null ? UNAVAILABLE : `${metrics.cvd > 0 ? "+" : ""}${fmtCompact(metrics.cvd)}`}</dd>
              </div>
            </dl>

            {layout.spark ? (
              <div className={styles.spark} data-tone={sparkTone}>
                <div className={styles.sparkHead}>
                  <span className={styles.sparkTitle}>Delta acumulado {flow.length > 1 ? `${flow.length} s` : ""}</span>
                  <span className={styles.sparkValue}>
                    {lastDelta === null ? UNAVAILABLE : `${lastDelta > 0 ? "+" : ""}${fmtCompact(lastDelta)}`}
                  </span>
                </div>
                <div className={styles.sparkBox}>
                  {sparkLine ? (
                    <svg className={styles.sparkSvg} viewBox={`0 0 ${SPARK_W} ${SPARK_H}`} preserveAspectRatio="none" role="img" aria-label={`Delta de volume acumulado em ${flow.length} segundos, termina em ${lastDelta === null ? UNAVAILABLE : fmtCompact(lastDelta)}.`}>
                      {zeroY !== null ? <line className={styles.zero} x1="0" x2={SPARK_W} y1={zeroY} y2={zeroY} /> : null}
                      <path className={styles.sparkFill} d={sparkFill} />
                      <path className={styles.sparkLine} d={sparkLine} vectorEffect="non-scaling-stroke" />
                    </svg>
                  ) : (
                    <span className={styles.sparkEmpty}>Coletando fluxo</span>
                  )}
                </div>
              </div>
            ) : null}
          </>
        ) : (
          <PanelEmpty />
        )}
      </div>
      </div>
    </PanelFrame>
  );
}
