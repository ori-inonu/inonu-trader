"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createInonuClient } from "@/lib/inonu/client";
import { sharedLedgerSignal } from "@/lib/inonu/ledger-signal";
import { type LedgerTail, tailOf, type Usage } from "@/lib/inonu/usage";
import styles from "./DockInonu.module.css";

/**
 * The latest requests of the ledger under the button that asks (T4.5): today's totals and up to five lines, newest first. Pure drawing;
 * the hook below reads the ledger. Nothing here asks the model.
 */
export function InonuLedgerTailView({ tail }: { readonly tail: LedgerTail }) {
  return (
    <section className={styles.tail} aria-label="Ultimos pedidos ao Inonu">
      <h3 className={styles.tailTitle}>Ultimos pedidos</h3>
      <p className={styles.tailHead}>{tail.headline}</p>
      {tail.recent.length > 0 ? <p className={styles.tailHead}>A lista inclui os pedidos recusados.</p> : null}
      {tail.recent.length > 0 ? (
        <ul className={styles.tailList}>
          {tail.recent.map((line, index) => (
            <li key={`${index}-${line}`}>{line}</li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

const POLL_MS = 60_000;

export default function InonuLedgerTail() {
  const client = useMemo(() => createInonuClient(), []);
  // undefined: not read yet. null: could not be read.
  const [usage, setUsage] = useState<Usage | null | undefined>(undefined);
  const [nowMs, setNowMs] = useState(0);

  const read = useCallback(() => {
    void client.usage().then((u) => {
      setUsage(u);
      setNowMs(Date.now());
    });
  }, [client]);

  useEffect(() => {
    read();
    const timer = setInterval(() => {
      setNowMs(Date.now());
      if (document.visibilityState !== "hidden") read();
    }, POLL_MS);
    const off = sharedLedgerSignal().subscribe(read);
    return () => {
      clearInterval(timer);
      off();
    };
  }, [read]);

  return <InonuLedgerTailView tail={tailOf(usage, nowMs)} />;
}
