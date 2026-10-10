"use client";

import type { ReactNode } from "react";
import styles from "./Disclosure.module.css";

export interface DisclosureProps {
  summary: string;
  badge?: string;
  defaultOpen?: boolean;
  children: ReactNode;
}

export default function Disclosure({ summary, badge, defaultOpen = false, children }: DisclosureProps) {
  return (
    <details className={styles.disclosure} open={defaultOpen}>
      <summary className={styles.summary}>
        <span className={styles.label}>{summary}</span>
        {badge ? <span className={styles.badge}>{badge}</span> : null}
        <span className={styles.chevron} aria-hidden="true" />
      </summary>
      <div className={styles.body}>{children}</div>
    </details>
  );
}