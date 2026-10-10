"use client";

import { memo, useEffect, useRef } from "react";
import type { KpiCell } from "@/lib/kpi";
import type { ConnectionState } from "@/lib/types";
import { flashValue } from "@/lib/motion";
import { feedFrameState } from "@/lib/feed-frame";
import styles from "./KpiSurface.module.css";

export interface KpiSurfaceProps {
  cells: KpiCell[];
  reducedMotion?: boolean;
  connection: ConnectionState;
}

interface KpiCellViewProps {
  cell: KpiCell;
  reducedMotion: boolean;
}

const KpiCellView = memo(function KpiCellView({ cell, reducedMotion }: KpiCellViewProps) {
  const valueRef = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    flashValue(valueRef.current, reducedMotion);
  }, [cell.value, reducedMotion]);

  return (
    <div className={`${styles.cell} ${styles[cell.tone]} ${cell.hero ? styles.hero : ""}`}>
      <span className={styles.label}>{cell.label}</span>
      <span className={`${styles.value} ${cell.hero ? `${styles.heroValue} clippedText` : ""}`} ref={valueRef}>
        {cell.value}
      </span>
      {cell.meta ? <span className={styles.meta}>{cell.meta}</span> : null}
    </div>
  );
});

function KpiSurfaceView({ cells, reducedMotion = false, connection }: KpiSurfaceProps) {
  const frame = feedFrameState(connection);
  const stale = frame.held;
  return (
    <section className={`${styles.surface} ${stale ? styles.stale : ""}`} aria-label="Métricas do feed">
      {cells.map((cell) => (
        <KpiCellView key={cell.id} cell={cell} reducedMotion={reducedMotion || stale} />
      ))}
      {frame.notice ? <span className={styles.staleChip}>{frame.notice}</span> : null}
    </section>
  );
}

export default memo(KpiSurfaceView);
export { KpiSurfaceView };