"use client";

import { useId, useState, type ReactNode } from "react";
import styles from "./Disclosure.module.css";

export interface DisclosureProps {
  summary: string;
  badge?: string;
  defaultOpen?: boolean;
  children: ReactNode;
}

export default function Disclosure({ summary, badge, defaultOpen = false, children }: DisclosureProps) {
  const [open, setOpen] = useState(defaultOpen);
  const bodyId = useId();
  return (
    <details
      className={styles.disclosure}
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary className={styles.summary} aria-expanded={open} aria-controls={bodyId}>
        <span className={styles.label}>{summary}</span>
        {badge ? <span className={styles.badge}>{badge}</span> : null}
        <span className={styles.chevron} aria-hidden="true" />
      </summary>
      <div className={styles.body} id={bodyId}>{children}</div>
    </details>
  );
}