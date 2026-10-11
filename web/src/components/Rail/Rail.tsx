"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { BlockEvent, ConnectionState, Meta } from "@/lib/types";
import { fmtInt, shortAddr } from "@/lib/format";
import { presentFeed } from "@/lib/presentation";
import { feedFrameState } from "@/lib/feed-frame";
import { flashValue } from "@/lib/motion";
import BrandMark from "@/components/BrandMark/BrandMark";
import styles from "./Rail.module.css";

export interface RailProps {
  meta: Meta | null;
  latest: BlockEvent | null;
  connection: ConnectionState;
  uptimeText: string;
  reducedMotion?: boolean;
}

export default function Rail({ meta, latest, connection, uptimeText, reducedMotion = false }: RailProps) {
  const [copyStatus, setCopyStatus] = useState("");
  const copyTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const counterRef = useRef<HTMLSpanElement | null>(null);
  const wallet = meta?.wallet ?? null;
  const frame = feedFrameState(connection);
  const stale = frame.held;

  useEffect(
    () => () => {
      clearTimeout(copyTimer.current);
    },
    [],
  );

  const blockLabel = latest ? fmtInt(latest.block) : "Aguardando";
  const block = latest?.block ?? null;

  useEffect(() => {
    flashValue(counterRef.current, reducedMotion || stale);
  }, [block, reducedMotion, stale]);

  const onCopy = useCallback(async () => {
    if (!wallet) return;
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard indisponível");
      await navigator.clipboard.writeText(wallet);
      setCopyStatus("Copiado");
    } catch {
      setCopyStatus("Não foi possível copiar");
    }
    clearTimeout(copyTimer.current);
    copyTimer.current = setTimeout(() => setCopyStatus(""), 1800);
  }, [wallet]);

  const presentation = presentFeed(meta, connection);
  const model = meta?.model?.trim();

  return (
    <header className={`${styles.rail} ${stale ? styles.stale : ""}`}>
      <div className={styles.brandRow}>
        <div className={styles.brand}>
          <BrandMark decorative />
          <div className={styles.brandCopy}>
            <h1>INONU TRADER</h1>
            <p>Decisao do agente. Execucao real a cada bloco.</p>
          </div>
        </div>
        <div className={styles.digest}>
          <span className={styles.digestLabel}>Bloco observado</span>
          <span className={styles.digestValue} ref={counterRef}>{blockLabel}</span>
          <span className={styles.digestMeta}>{uptimeText} observado</span>
        </div>
      </div>

      <span className={styles.rule} aria-hidden="true" />

      <div className={styles.statusRow}>
        <span className={`${styles.statusBadge} ${presentation.executionLabel === "Simulação" ? styles.simulation : styles.unknown}`}>
          {presentation.executionLabel}
        </span>
        <span className={`${styles.statusBadge} ${styles.connection}`} aria-live="polite">
          {presentation.connectionLabel}
        </span>
        <span className={`${styles.statusBadge} ${styles.source}`}>{presentation.sourceLabel}</span>
        <span className={styles.context}>{model ? `Modelo: ${model}` : "Modelo não informado"}</span>
        <span className={styles.context}>{meta?.market || "Mercado não informado"}</span>
        <button
          type="button"
          className={styles.wallet}
          onClick={() => void onCopy()}
          disabled={!wallet}
          title={wallet ?? "Endereço da carteira não informado"}
          aria-label={wallet ? `Copiar endereço ${wallet}` : "Endereço da carteira não informado"}
        >
          {wallet ? shortAddr(wallet) : "Carteira não informada"}
        </button>
        <span className={styles.copyStatus} aria-live="polite">{copyStatus}</span>
      </div>

      {frame.notice ? <span className={styles.staleChip}>{frame.notice}</span> : null}
    </header>
  );
}
