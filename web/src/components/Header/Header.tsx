"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { BlockEvent, ConnectionState, Meta } from "@/lib/types";
import { fmtInt, shortAddr } from "@/lib/format";
import { presentFeed } from "@/lib/presentation";
import BrandMark from "@/components/BrandMark/BrandMark";
import styles from "./Header.module.css";

export interface HeaderProps {
  meta: Meta | null;
  latest: BlockEvent | null;
  connection: ConnectionState;
}

export default function Header({ meta, latest, connection }: HeaderProps) {
  const [copyStatus, setCopyStatus] = useState("");
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wallet = meta?.wallet ?? null;

  useEffect(
    () => () => {
      if (copyTimer.current) clearTimeout(copyTimer.current);
    },
    [],
  );

  const onCopy = useCallback(async () => {
    if (!wallet) return;
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard indisponível");
      await navigator.clipboard.writeText(wallet);
      setCopyStatus("Copiado");
    } catch {
      setCopyStatus("Não foi possível copiar");
    }
    if (copyTimer.current) clearTimeout(copyTimer.current);
    copyTimer.current = setTimeout(() => setCopyStatus(""), 1800);
  }, [wallet]);

  const presentation = presentFeed(meta, connection);
  const model = meta?.model?.trim();

  return (
    <header className={styles.header}>
      <div className={styles.brandRow}>
        <div className={styles.brand}>
          <BrandMark decorative />
          <div className={styles.brandCopy}>
            <h1>INONU TRADER</h1>
            <p>Inteligência de mercado. Estado visível.</p>
          </div>
        </div>
        <div className={styles.block}>
          <span>Bloco observado</span>
          <strong>{latest ? fmtInt(latest.block) : "Aguardando"}</strong>
        </div>
      </div>

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
    </header>
  );
}
