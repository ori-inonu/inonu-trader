"use client";

import { useEffect } from "react";
import styles from "./ConsoleBackdrop.module.css";

export type BackdropTone = "neutral" | "buy" | "sell" | "hold" | "late";

export interface ConsoleBackdropProps {
  tone: BackdropTone;
}

/**
 * Static gradient field behind the console.
 * The oversized child layer rotates with jev-mesh-drift; the accent only ever transitions colour,
 * so nothing here touches background-position or a filtered layer.
 * Owns the visibilitychange listener that drives html[data-tab-hidden], which pauses the mesh.
 */
export default function ConsoleBackdrop({ tone }: ConsoleBackdropProps) {
  useEffect(() => {
    const root = document.documentElement;
    const sync = () => {
      if (document.visibilityState === "hidden") root.dataset.tabHidden = "true";
      else delete root.dataset.tabHidden;
    };
    sync();
    document.addEventListener("visibilitychange", sync);
    return () => {
      document.removeEventListener("visibilitychange", sync);
      delete root.dataset.tabHidden;
    };
  }, []);

  return (
    <div className={styles.backdrop} data-tone={tone} aria-hidden="true">
      <div className={`meshLayer ${styles.mesh}`}>
        <div className={`${styles.blob} ${styles.blobPrimary}`} />
        <div className={`${styles.blob} ${styles.blobSecondary}`} />
        <div className={`${styles.blob} ${styles.blobAccent}`} />
      </div>
      <div className="scanline" />
    </div>
  );
}