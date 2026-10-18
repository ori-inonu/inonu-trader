"use client";

import { type ReactNode, useId } from "react";
import { AWAITING } from "@/lib/desk/ui/format";
import styles from "./PanelFrame.module.css";

export type PanelFeedState = "live" | "stale" | "empty";

export interface PanelFrameProps {
  /** Micro label in the header, shown in capitals. */
  title: string;
  /** Context next to the title, usually the instrument id. */
  subtitle?: string | null;
  /** Optional content at the right of the header, before the feed chip. */
  right?: ReactNode;
  /** Data is present but old: dims the body and labels the chip "Dado velho". */
  stale?: boolean;
  /** No data yet: the chip says so. The body is the panel's own empty state. */
  empty?: boolean;
  children: ReactNode;
}

const CHIP_LABEL: Record<PanelFeedState, string> = {
  live: "Ao vivo",
  stale: "Dado velho",
  empty: "Sem dados",
};

export function feedStateOf(stale: boolean | undefined, empty: boolean | undefined): PanelFeedState {
  if (empty) return "empty";
  return stale ? "stale" : "live";
}

/**
 * Shared chrome of every desk panel: a title micro label, an optional right slot and a feed chip.
 * It fills its parent, never scrolls, and is built to survive a CSS 3D tilt: no hairline borders
 * (edges are an inset shadow and a fill step), its own compositing layer and hidden backfaces.
 */
export function PanelFrame({ title, subtitle, right, stale, empty, children }: PanelFrameProps) {
  const titleId = useId();
  const state = feedStateOf(stale, empty);
  return (
    <section className={styles.frame} aria-labelledby={titleId} data-feed={state} data-stale={stale ? "true" : undefined}>
      <header className={styles.head}>
        <h3 className={styles.title} id={titleId}>
          {title}
        </h3>
        {subtitle ? <span className={styles.subtitle}>{subtitle}</span> : null}
        <span className={styles.spacer} />
        {right ? <div className={styles.right}>{right}</div> : null}
        <span className={styles.chip} data-state={state} title={CHIP_LABEL[state]} aria-label={CHIP_LABEL[state]}>
          <span className={styles.dot} aria-hidden="true" />
          <span className={styles.chipLabel}>{CHIP_LABEL[state]}</span>
        </span>
      </header>
      <div className={styles.body}>{children}</div>
    </section>
  );
}

/** Honest empty state: the input is null or empty, nothing is drawn in its place. */
export function PanelEmpty({ children = AWAITING }: { children?: ReactNode }) {
  return (
    <div className={styles.empty} role="status">
      {children}
    </div>
  );
}
