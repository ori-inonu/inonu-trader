"use client";

import { memo, useMemo } from "react";
import type { BlockEvent } from "@/lib/types";
import { fmtPrice } from "@/lib/format";
import { buildDepthLevels, levelGeometry } from "@/lib/ladder";
import styles from "./DepthLadder.module.css";

const UNAVAILABLE = "Indisponivel";
const PLANE_DEPTH = 10;

export interface DepthLadderProps {
  latest: BlockEvent | null;
  window?: number;
  reducedMotion?: boolean;
}

interface Plane {
  price: number;
  size: number;
  arm: "bid" | "ask" | "mid";
  isLive: boolean;
  block: number | null;
  y: number;
  scale: number;
}

function project(price: number, index: number, total: number): number {
  const share = total <= 1 ? 0.5 : index / (total - 1);
  return share;
}

function iso(x: number, y: number, z: number): string {
  return `${(x - z).toFixed(1)},${(y - z * 0.5).toFixed(1)}`;
}

/**
 * Isometric depth view of the resting book.
 * A level is only ever drawn from a size the feed actually reported. A level with no resting size
 * renders at the minimum scale and says so, because a fabricated resting order would be a false
 * claim about the on-chain book.
 */
function DepthLadderView({ latest, window: windowSize = 9, reducedMotion = false }: DepthLadderProps) {
  const levels = useMemo(
    () => buildDepthLevels(latest ? [latest] : [], windowSize),
    [latest, windowSize],
  );

  const maxSize = useMemo(
    () => levels.reduce((peak, level) => Math.max(peak, level.bidSize, level.askSize), 0),
    [levels],
  );

  const planes: Plane[] = useMemo(() => levels.map((level, index) => {
    const size = level.arm === "bid" ? level.bidSize : level.arm === "ask" ? level.askSize : 0;
    return {
      price: level.price,
      size,
      arm: level.arm,
      isLive: level.isLive,
      block: level.block,
      y: project(level.price, index, levels.length),
      scale: levelGeometry(level, maxSize, size),
    };
  }), [levels, maxSize]);

  const width = 320;
  const height = 220;
  const baseline = 180;
  const span = 240;
  const reportedAny = planes.some((plane) => plane.size > 0);

  return (
    <section className={`${styles.panel} ${reducedMotion ? styles.still : ""}`} aria-labelledby="ladder-title">
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>LIVRO ON-CHAIN</p>
          <h2 className={styles.title} id="ladder-title">Profundidade Kuru</h2>
        </div>
        <span className={styles.badge}>Kuru</span>
      </header>

      <p className={styles.availability}>
        {latest
          ? `Ladder do bloco ${latest.block}. ${reportedAny ? "Tamanhos conforme informado no feed." : "Nenhum tamanho resting informado neste bloco."}`
          : "Aguardando dados do feed"}
      </p>

      <div className={styles.frame}>
        <svg
          className={styles.svg}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={
            latest
              ? `Profundidade do livro no bloco ${latest.block}. ${planes.length} niveis, dos quais ${planes.filter((plane) => plane.size > 0).length} com tamanho informado.`
              : "Profundidade do livro indisponivel."
          }
        >
          <polygon
            points={`${iso(40, baseline, 0)} ${iso(280, baseline, 0)} ${iso(280, baseline, PLANE_DEPTH * 2)} ${iso(40, baseline, PLANE_DEPTH * 2)}`}
            className={styles.deck}
          />

          {planes.map((plane, index) => {
            const y = 30 + plane.y * span * 0.5;
            const barWidth = plane.scale * 200;
            const depth = plane.arm === "mid" ? PLANE_DEPTH * 2 : PLANE_DEPTH;
            const animate = !reducedMotion && plane.isLive;
            return (
              <g
                key={`${plane.arm}-${plane.price}`}
                className={`${styles.plane} ${styles[plane.arm]} ${animate ? styles.planeIn : ""} ${!reducedMotion && plane.arm !== "mid" && plane.size > 0 ? styles.planeSettle : ""}`}
                style={{ animationDelay: `${Math.min(index, 8) * 26}ms` }}
              >
                <polygon
                  points={`${iso(40, y, 0)} ${iso(40 + barWidth, y, 0)} ${iso(40 + barWidth, y, depth)} ${iso(40, y, depth)}`}
                  className={styles.bar}
                />
                <polygon
                  points={`${iso(40, y, depth)} ${iso(40 + barWidth, y, depth)} ${iso(40 + barWidth, y - 12, depth)} ${iso(40, y - 12, depth)}`}
                  className={styles.cap}
                />
                <text className={styles.price} x={46 + barWidth} y={y + 4}>
                  {fmtPrice(plane.price)}
                </text>
                <text className={styles.size} x={46} y={y - 16}>
                  {plane.arm === "mid" ? "mid" : plane.size > 0 ? `${plane.size.toLocaleString("en-US", { maximumFractionDigits: 3 })} MON` : "sem tamanho informado"}
                </text>
              </g>
            );
          })}
        </svg>

        <div className="scanline" aria-hidden="true" />
      </div>

      <ul className={styles.legend}>
        {planes.length === 0 ? (
          <li className={styles.empty}>{latest ? "Nenhum nivel informado no feed." : UNAVAILABLE}</li>
        ) : (
          planes.map((plane) => (
            <li className={styles[plane.arm]} key={`legend-${plane.arm}-${plane.price}`}>
              {plane.arm === "bid" ? "Compra" : plane.arm === "ask" ? "Venda" : "Meio"}
              {": "}
              {fmtPrice(plane.price)}
              {plane.block !== null ? `, bloco ${plane.block}` : ""}
            </li>
          ))
        )}
      </ul>
    </section>
  );
}

export default memo(DepthLadderView);
export { DepthLadderView };