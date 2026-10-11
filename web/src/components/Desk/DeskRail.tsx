"use client";

import BrandMark from "@/components/BrandMark/BrandMark";
import type { FeedChip } from "@/lib/mesa/mesa-model";
import styles from "./DeskRail.module.css";

export interface DeskRailProps {
  chips: readonly FeedChip[];
  /** Exchange clock minus browser clock, null until measured. */
  skewMs: number | null;
  /** Browser wall clock, ticked by the owner once per second. */
  nowMs: number;
}

const two = (n: number) => String(n).padStart(2, "0");

function utcClock(ms: number): string {
  const d = new Date(ms);
  return `${two(d.getUTCHours())}:${two(d.getUTCMinutes())}:${two(d.getUTCSeconds())} UTC`;
}

export function skewLabel(skewMs: number | null): { text: string; warn: boolean } {
  if (skewMs === null) return { text: "Relogio local nao comparado com a OKX", warn: false };
  const seconds = Math.round(Math.abs(skewMs) / 1000);
  if (Math.abs(skewMs) <= 5_000) return { text: "Relogio local sincronizado com a OKX", warn: false };
  return { text: `Relogio local ${seconds} s ${skewMs > 0 ? "atrasado" : "adiantado"} em relacao a OKX`, warn: true };
}

export function FeedChipList({ chips, className }: { chips: readonly FeedChip[]; className?: string }) {
  return (
    <ul className={`${styles.chips} ${className ?? ""}`} aria-label="Saude das fontes de dados">
      {chips.map((chip) => (
        <li key={chip.id} className={styles.chip} data-tone={chip.tone} title={chip.detail ?? undefined}>
          <span className={styles.dot} aria-hidden="true" />
          <span className={styles.chipText}>
            <span className={styles.chipLabel}>{chip.label}</span>
            <span className={styles.chipDetail}>{chip.tone === "live" ? "ao vivo" : (chip.detail ?? "sem dados")}</span>
          </span>
          <span className={styles.srOnly}>{chip.tone === "live" ? "ao vivo" : chip.tone === "late" ? "atrasado" : chip.tone === "down" ? "fora do ar" : "inativo"}</span>
        </li>
      ))}
    </ul>
  );
}

export default function DeskRail({ chips, skewMs, nowMs }: DeskRailProps) {
  const skew = skewLabel(skewMs);
  const exchangeNow = nowMs + (skewMs ?? 0);
  return (
    <header className={styles.rail}>
      <div className={styles.brand}>
        <BrandMark decorative size={32} />
        <div className={styles.brandCopy}>
          <h1>INONU TRADER</h1>
          <p>Mesa de decisao do Jev</p>
        </div>
      </div>

      <FeedChipList chips={chips} className={styles.railChips} />

      <div className={styles.clock}>
        <span className={styles.clockTime}>{skewMs === null ? "--:--:--" : utcClock(exchangeNow)}</span>
        <span className={`${styles.clockNote} ${skew.warn ? styles.warn : ""}`} title="O Jev e os feeds usam o relogio da OKX. Ajustar a hora do Windows evita leituras atrasadas.">{skew.text}</span>
      </div>
    </header>
  );
}
