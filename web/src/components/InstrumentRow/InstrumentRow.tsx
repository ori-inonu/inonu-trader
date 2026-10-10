"use client";

import { memo } from "react";
import styles from "./InstrumentRow.module.css";

export interface InstrumentItem {
  id: string;
  label: string;
  value: string;
  tone?: "neutral" | "buy" | "sell" | "hold" | "late" | "unknown";
}

export interface InstrumentRowProps {
  items: InstrumentItem[];
}

function InstrumentRowView({ items }: InstrumentRowProps) {
  return (
    <div className={styles.row}>
      {items.map((item) => (
        <div className={`${styles.item} ${styles[item.tone ?? "neutral"]}`} key={item.id}>
          <span className={styles.label}>{item.label}</span>
          <span className={styles.value}>{item.value}</span>
        </div>
      ))}
    </div>
  );
}

export default memo(InstrumentRowView);
export { InstrumentRowView };