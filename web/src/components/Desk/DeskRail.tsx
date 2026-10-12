"use client";

import { useEffect, useRef, type ReactNode } from "react";
import BrandMark from "@/components/BrandMark/BrandMark";
import type { FeedChip } from "@/lib/mesa/mesa-model";
import { ageLabel, shortcutFor, skewBadge, summarizeFeeds, toneWord, walletBadge, walletHint } from "@/lib/mesa/topbar-model";
import TopbarPopover from "./TopbarPopover";
import { CaptureButton, FullscreenButton, PreferencesMenu, toggleFullscreen } from "./TopbarTools";
import styles from "./DeskRail.module.css";

export interface DeskRailProps {
  chips: readonly FeedChip[];
  /** Exchange clock minus browser clock, null until measured. */
  skewMs: number | null;
  /** Browser wall clock, ticked by the owner once per second. */
  nowMs: number;
  /** The symbol search: the owner passes the asset picker, so the bar and the chart share one catalog and one behaviour. */
  symbolPicker?: ReactNode;
  /** The instrument in focus, only to name the chart capture. */
  instId?: string | null;
  /** How long ago each source spoke, by chip id. A source without an entry has no timing and shows no line. */
  ages?: Readonly<Record<string, number | null>>;
  /** The connected account, only to show its short form on the wallet chip. The bar never connects or signs. */
  account?: string | null;
}

const two = (n: number) => String(n).padStart(2, "0");

function utcClock(ms: number): string {
  const d = new Date(ms);
  return `${two(d.getUTCHours())}:${two(d.getUTCMinutes())}:${two(d.getUTCSeconds())}`;
}

export function skewLabel(skewMs: number | null): { text: string; warn: boolean } {
  if (skewMs === null) return { text: "Relogio local nao comparado com a OKX", warn: false };
  const seconds = Math.round(Math.abs(skewMs) / 1000);
  if (Math.abs(skewMs) <= 5_000) return { text: "Relogio local sincronizado com a OKX", warn: false };
  return { text: `Relogio local ${seconds} s ${skewMs > 0 ? "atrasado" : "adiantado"} em relacao a OKX`, warn: true };
}

export function FeedChipList({ chips, className, ages }: { chips: readonly FeedChip[]; className?: string; ages?: Readonly<Record<string, number | null>> }) {
  return (
    <ul className={`${styles.chips} ${className ?? ""}`} aria-label="Saude das fontes de dados">
      {chips.map((chip) => {
        const age = ages ? ageLabel(ages[chip.id]) : null;
        return (
          <li key={chip.id} className={styles.chip} data-tone={chip.tone} title={chip.detail ?? undefined}>
            <span className={styles.dot} aria-hidden="true" />
            <span className={styles.chipText}>
              <span className={styles.chipLabel}>{chip.label}</span>
              <span className={styles.chipDetail}>{chip.tone === "live" ? "ao vivo" : (chip.detail ?? "sem dados")}</span>
            </span>
            {age ? <span className={styles.chipAge}>{age}</span> : null}
            <span className={styles.srOnly}>{toneWord(chip.tone)}</span>
          </li>
        );
      })}
    </ul>
  );
}

export default function DeskRail({ chips, skewMs, nowMs, symbolPicker = null, instId = null, ages, account = null }: DeskRailProps) {
  const symbolRef = useRef<HTMLDivElement | null>(null);
  const skew = skewLabel(skewMs);
  const badge = skewBadge(skewMs);
  const exchangeNow = nowMs + (skewMs ?? 0);
  const wallet = walletBadge(chips.find((chip) => chip.id === "okx-wallet"), account);
  // The wallet has its own chip, so the sources pill counts only the sources the panel lists.
  const feeds = chips.filter((chip) => chip.id !== "okx-wallet");
  const summary = summarizeFeeds(feeds);

  // "/" opens the symbol search and "F" the full screen, as on the platforms this bar learns from.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const action = shortcutFor(event);
      if (action === "search") {
        const trigger = symbolRef.current?.querySelector<HTMLButtonElement>('button[aria-haspopup="dialog"]');
        if (!trigger) return;
        event.preventDefault();
        trigger.click();
      } else if (action === "fullscreen") {
        event.preventDefault();
        toggleFullscreen();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <header className={styles.rail}>
      <div className={styles.brand}>
        <BrandMark decorative size={32} />
        <div className={styles.brandCopy}>
          <h1>INONU TRADER</h1>
          <p>Mesa de decisao do Jev</p>
        </div>
      </div>

      <nav className={styles.nav} aria-label="Secoes do app">
        <a className={styles.navLink} href="/" aria-current="page">Mesa</a>
        <a className={styles.navLink} href="/console">Central</a>
      </nav>

      {symbolPicker ? (
        <div ref={symbolRef} className={styles.symbol} role="group" aria-label="Buscar ativo">
          <svg className={styles.searchIcon} width="14" height="14" viewBox="0 0 16 16" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
            <circle cx="7" cy="7" r="4.5" />
            <path d="m10.5 10.5 3 3" />
          </svg>
          {symbolPicker}
          <kbd className={styles.kbd} aria-hidden="true">/</kbd>
        </div>
      ) : null}

      <div className={styles.spacer} />

      <div className={styles.tools}>
        <TopbarPopover
          label="Fontes de dados"
          tone={summary.tone}
          face={
            <>
              <span className={styles.dot} data-tone={summary.tone} aria-hidden="true" />
              <span className={styles.chipText}>
                <span className={styles.chipLabel}>Fontes</span>
                <span className={styles.chipDetail}>{summary.short}</span>
              </span>
              <span className={styles.srOnly}>{`${summary.text}, ${toneWord(summary.tone)}`}</span>
            </>
          }
        >
          <p className={styles.panelText}>{summary.text}</p>
          <FeedChipList chips={feeds} className={styles.panelList} ages={ages} />
          <p className={styles.panelNote}>A carteira e o relogio ficam nos controles ao lado.</p>
          <a className={styles.panelLink} href="/console">Abrir a Central de observacao</a>
        </TopbarPopover>

        <TopbarPopover
          label="Carteira OKX"
          tone={wallet.tone}
          face={
            <>
              <span className={styles.dot} data-tone={wallet.tone} aria-hidden="true" />
              <span className={styles.chipText}>
                <span className={styles.chipLabel}>{wallet.label}</span>
                <span className={styles.chipDetail}>{wallet.detail}</span>
              </span>
            </>
          }
        >
          <p className={styles.panelText}>{walletHint(wallet.detail)}</p>
        </TopbarPopover>

        <div className={styles.clock}>
          <span className={styles.clockTime}>
            {skewMs === null ? "--:--:--" : utcClock(exchangeNow)}
            <span className={styles.clockZone}> UTC</span>
          </span>
          <span className={`${styles.clockNote} ${skew.warn ? styles.warn : ""}`} title="O Jev e os feeds usam o relogio da OKX. Ajustar a hora do Windows evita leituras atrasadas.">
            <span aria-hidden="true">{badge.text}</span>
            <span className={styles.srOnly}>{skew.text}</span>
          </span>
        </div>

        <div className={styles.toolGroup} role="group" aria-label="Ferramentas">
          <PreferencesMenu />
          <CaptureButton instId={instId} />
          <FullscreenButton />
        </div>
      </div>
    </header>
  );
}
