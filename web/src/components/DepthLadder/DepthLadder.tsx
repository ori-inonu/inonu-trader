"use client";

import { memo, useEffect, useMemo, useRef, useState } from "react";
import type { BlockEvent } from "@/lib/types";
import { fmtPrice } from "@/lib/format";
import { buildDepthLevels, levelGeometry } from "@/lib/ladder";
import styles from "./DepthLadder.module.css";

const UNAVAILABLE = "Indisponivel";
/** Isometric slab depth. Both the top face and the front face are drawn from it. */
const PLANE_DEPTH = 10;
const FRAME_PAD_X = 10;
const FRAME_PAD_Y = 12;
/** Both columns shrink on a narrow frame instead of eating the plot. */
const PRICE_COL = 92;
const PRICE_COL_MIN = 58;
const SIZE_COL = 140;
const SIZE_COL_MIN = 72;
const SIZE_COL_SHARE = 0.3;
/** Measured width of "sem tamanho informado" in the mono micro size. */
const SIZE_LABEL_FULL = 118;
/** Fallback for the first paint and for server rendering, before the frame has been measured. */
const FALLBACK = { w: 320, h: 220 };

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
  share: number;
  scale: number;
}

function iso(x: number, y: number, z: number): string {
  return `${(x - z).toFixed(1)},${(y - z * 0.5).toFixed(1)}`;
}

const SIDE_LABEL: Record<Plane["arm"], string> = {
  bid: "Compra",
  ask: "Venda",
  mid: "Meio",
};

/**
 * Isometric depth view of the resting book.
 *
 * Bids grow leftward from the mid spine and asks grow rightward, so the two sides are told apart
 * by where the slab sits and by the word beside it, never by hue alone. A level is only ever
 * drawn from a size the feed actually reported. A level with no resting size renders at the
 * minimum scale and says so, because a fabricated resting order would be a false claim about
 * the on-chain book.
 */
function DepthLadderView({ latest, window: windowSize = 9, reducedMotion = false }: DepthLadderProps) {
  const frameRef = useRef<HTMLDivElement | null>(null);
  const [measured, setMeasured] = useState(FALLBACK);

  useEffect(() => {
    const element = frameRef.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setMeasured((current) =>
        Math.abs(current.w - width) < 0.5 && Math.abs(current.h - height) < 0.5
          ? current
          : { w: Math.round(width), h: Math.round(height) },
      );
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const levels = useMemo(
    () => buildDepthLevels(latest ? [latest] : [], windowSize),
    [latest, windowSize],
  );

  const maxSize = useMemo(
    () => levels.reduce((peak, level) => Math.max(peak, level.bidSize, level.askSize), 0),
    [levels],
  );

  const planes = useMemo<Plane[]>(() => levels.map((level, index) => {
    const size = level.arm === "bid" ? level.bidSize : level.arm === "ask" ? level.askSize : 0;
    return {
      price: level.price,
      size,
      arm: level.arm,
      isLive: level.isLive,
      block: level.block,
      share: levels.length <= 1 ? 0.5 : index / (levels.length - 1),
      scale: levelGeometry(level, maxSize, size),
    };
  }), [levels, maxSize]);

  const width = Math.max(240, measured.w);
  const height = Math.max(180, measured.h);
  const priceX = FRAME_PAD_X;
  const sizeRight = width - FRAME_PAD_X;
  // Narrow frames give up column width before they give up plot width, so the two text columns
  // never collide with each other or with the bars.
  const priceCol = Math.min(PRICE_COL, Math.max(PRICE_COL_MIN, width * 0.22));
  const sizeCol = Math.min(SIZE_COL, Math.max(SIZE_COL_MIN, width * SIZE_COL_SHARE));
  const plotLeft = priceX + priceCol;
  const plotRight = Math.max(plotLeft + 60, sizeRight - sizeCol);
  const plotWidth = plotRight - plotLeft;
  const midX = plotLeft + plotWidth / 2;
  const halfWidth = plotWidth / 2 - 6;
  // "sem tamanho informado" is about 118px in the mono micro size. When the column is narrower
  // than that the visible text is shortened and the full wording stays on the element as a title.
  const compactSize = sizeCol < SIZE_LABEL_FULL;

  const rows = planes.length;
  const rowHeight = rows > 0 ? (height - FRAME_PAD_Y * 2) / rows : 0;
  const rowY = (index: number) => FRAME_PAD_Y + rowHeight * (index + 0.5);
  const reportedAny = planes.some((plane) => plane.size > 0);

  return (
    <section className={`${styles.panel} ${reducedMotion ? styles.still : ""}`} aria-labelledby="ladder-title">
      <header className={styles.header}>
        <div className={styles.heading}>
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

      <div className={styles.frame} ref={frameRef}>
        <svg
          className={styles.svg}
          viewBox={`0 0 ${width} ${height}`}
          preserveAspectRatio="xMidYMid meet"
          role="img"
          aria-label={
            latest
              ? `Profundidade do livro no bloco ${latest.block}. ${planes.length} niveis, dos quais ${planes.filter((plane) => plane.size > 0).length} com tamanho informado.`
              : "Profundidade do livro indisponivel."
          }
        >
          <line className={styles.spine} x1={midX} x2={midX} y1={FRAME_PAD_Y - 4} y2={height - FRAME_PAD_Y + 4} />

          {planes.map((plane, index) => {
            const y = rowY(index);
            const barWidth = Math.max(2, plane.scale * halfWidth);
            const depth = plane.arm === "mid" ? PLANE_DEPTH * 2 : PLANE_DEPTH;
            const from = plane.arm === "ask" ? midX : midX - barWidth;
            const to = plane.arm === "ask" ? midX + barWidth : midX;
            const capRise = 12;
            const sizeText = plane.arm === "mid"
              ? "mid"
              : plane.size > 0
                ? `${plane.size.toLocaleString("en-US", { maximumFractionDigits: 3 })} MON`
                : "sem tamanho informado";
            return (
              <g
                key={`${plane.arm}-${plane.price}`}
                className={`${styles.plane} ${styles[plane.arm]} ${!reducedMotion && plane.isLive ? styles.planeIn : ""}`}
                style={{ "--stagger-index": Math.min(index, 8) } as React.CSSProperties}
              >
                <polygon
                  points={`${iso(from, y, 0)} ${iso(to, y, 0)} ${iso(to, y, depth)} ${iso(from, y, depth)}`}
                  className={styles.bar}
                />
                <polygon
                  points={`${iso(from, y, depth)} ${iso(to, y, depth)} ${iso(to, y - capRise, depth)} ${iso(from, y - capRise, depth)}`}
                  className={styles.cap}
                />
                <text className={styles.price} x={priceX} y={y + 4}>
                  {fmtPrice(plane.price)}
                </text>
                <text className={styles.size} x={sizeRight} y={y + 4} textAnchor="end">
                  {compactSize && !sizeText.includes("MON") ? "sem tamanho" : sizeText}
                  <title>{sizeText}</title>
                </text>
                <text className={styles.side} x={plane.arm === "ask" ? plotRight : plotLeft} y={y - capRise - 6} textAnchor={plane.arm === "ask" ? "end" : "start"}>
                  {SIDE_LABEL[plane.arm]}
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
              {SIDE_LABEL[plane.arm]}
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