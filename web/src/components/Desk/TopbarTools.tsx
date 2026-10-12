"use client";

import { useEffect, useState } from "react";
import { captureChart, type CaptureResult } from "@/lib/mesa/capture";
import { applyPalette, PALETTES, readStoredPalette, type PaletteId } from "@/lib/mesa/preferences";
import { SHORTCUTS } from "@/lib/mesa/topbar-model";
import TopbarPopover from "./TopbarPopover";
import styles from "./TopbarTools.module.css";

const ICON = { width: 16, height: 16, viewBox: "0 0 16 16", "aria-hidden": true, focusable: "false", fill: "none", stroke: "currentColor", strokeWidth: 1.5, strokeLinecap: "round", strokeLinejoin: "round" } as const;

export function toggleFullscreen(): void {
  const request = document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen();
  request.catch(() => undefined);
}

export function FullscreenButton() {
  const [supported, setSupported] = useState(true);
  const [on, setOn] = useState(false);

  useEffect(() => {
    setSupported(document.fullscreenEnabled === true);
    const sync = () => setOn(document.fullscreenElement !== null);
    sync();
    document.addEventListener("fullscreenchange", sync);
    return () => document.removeEventListener("fullscreenchange", sync);
  }, []);

  if (!supported) return null;
  const label = on ? "Sair da tela cheia" : "Tela cheia";
  return (
    <button type="button" className={styles.iconButton} data-tool="fullscreen" aria-pressed={on} aria-label={label} title={`${label} (F)`} onClick={toggleFullscreen}>
      <svg {...ICON}>{on ? <path d="M6 2v4H2M10 2v4h4M6 14v-4H2M10 14v-4h4" /> : <path d="M2 6V2h4M14 6V2h-4M2 10v4h4M14 10v4h-4" />}</svg>
    </button>
  );
}

const CAPTURE_NOTE: Record<CaptureResult, string> = {
  saved: "Grafico salvo como imagem",
  missing: "Grafico indisponivel para captura",
  failed: "A captura falhou",
};

/** The camera of a charting platform: saves the chart as a PNG on the user's machine. */
export function CaptureButton({ instId }: { instId: string | null }) {
  const [note, setNote] = useState("");
  const onClick = async () => {
    const result = await captureChart(document, instId ?? "grafico", Date.now());
    setNote(CAPTURE_NOTE[result]);
  };
  return (
    <>
      <button type="button" className={styles.iconButton} aria-label="Salvar o grafico como imagem" title="Salvar o grafico como imagem (PNG)" onClick={onClick}>
        <svg {...ICON}>
          <path d="M2 5.5h2.5l1-1.5h5l1 1.5H14V13H2z" />
          <circle cx="8" cy="8.8" r="2.2" />
        </svg>
      </button>
      <span className={styles.srOnly} role="status" aria-live="polite">{note}</span>
    </>
  );
}

/** Preferences, as the colour menu of a wallet: which colour is a rise and which is a fall, plus the keys and the fixed facts. */
export function PreferencesMenu() {
  const [palette, setPalette] = useState<PaletteId>("padrao");
  useEffect(() => setPalette(readStoredPalette()), []);
  const choose = (id: PaletteId) => {
    applyPalette(id);
    setPalette(id);
  };
  return (
    <TopbarPopover
      label="Preferencias"
      variant="icon"
      face={
        <>
          <svg {...ICON}>
            <path d="M2 4.5h7M12 4.5h2M2 11.5h2M7 11.5h7" />
            <circle cx="10.5" cy="4.5" r="1.5" />
            <circle cx="5.5" cy="11.5" r="1.5" />
          </svg>
          <span className={styles.srOnly}>Preferencias</span>
        </>
      }
    >
      <section className={styles.section} aria-label="Cores de alta e baixa">
        <h2 className={styles.heading}>Cores de alta e baixa</h2>
        <div className={styles.options} role="group" aria-label="Cores de alta e baixa">
          {PALETTES.map((option) => (
            <button key={option.id} type="button" className={styles.option} aria-pressed={palette === option.id} onClick={() => choose(option.id)}>
              <span className={styles.swatch} aria-hidden="true">
                <span style={{ background: option.up }} />
                <span style={{ background: option.down }} />
              </span>
              <span className={styles.optionText}>
                <span className={styles.optionLabel}>{option.label}</span>
                <span className={styles.optionHint}>{option.hint}</span>
              </span>
            </button>
          ))}
        </div>
        <p className={styles.note}>Vale para a mesa inteira, inclusive o grafico, e fica salvo neste navegador.</p>
      </section>

      <section className={styles.section} aria-label="Atalhos de teclado">
        <h2 className={styles.heading}>Atalhos</h2>
        <ul className={styles.keys}>
          {SHORTCUTS.map((shortcut) => (
            <li key={shortcut.keys}>
              <kbd className={styles.kbd}>{shortcut.keys}</kbd>
              <span>{shortcut.action}</span>
            </li>
          ))}
        </ul>
      </section>

      <dl className={styles.facts}>
        <div><dt>Idioma</dt><dd>Portugues (Brasil)</dd></div>
        <div><dt>Moeda de exibicao</dt><dd>USD</dd></div>
        <div><dt>Relogio</dt><dd>UTC, hora da OKX</dd></div>
      </dl>
    </TopbarPopover>
  );
}
