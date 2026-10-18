"use client";

import { type KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { ChainChip } from "@/lib/onchain/chains";
import { chainIconSymbol } from "@/lib/onchain/icons";
import { AssetIcon } from "../AssetIcon";
import styles from "./OnchainTabs.module.css";

/**
 * The network selector of an onchain tab (CHN-1): one radio per network with its own logo and its name, arrows move the focus like a radio group, disabled
 * chips stay visible carrying the reason in the title. A few of the best known networks sit in the row, which stays on one line, and the network that is
 * selected is always in the row, even when it is not one of them. "Todas as redes" opens a panel with EVERY network the provider lists, a search box and the
 * logo of each one, so nothing is out of sight. The panel is drawn on the page itself (a portal, placed under the button), so a toolbar that scrolls or clips
 * never cuts it.
 */

/** How many networks sit in the row; the rest are one click away in the panel. */
export const INLINE_CHAINS = 6;

/** The networks whose name, short name or number contains what was typed. An empty search is every network, in the same order. */
export function filterChains(chips: readonly ChainChip[], query: string): readonly ChainChip[] {
  const q = query.trim().toLowerCase();
  if (q === "") return chips;
  return chips.filter((c) => c.name.toLowerCase().includes(q) || c.short.toLowerCase().includes(q) || c.chainIndex === q);
}

const PANEL_WIDTH = 560;

export function ChainChips({
  chips,
  value,
  onSelect,
  ariaLabel = "Rede",
}: {
  readonly chips: readonly ChainChip[];
  readonly value: string;
  readonly onSelect: (chainIndex: string) => void;
  readonly ariaLabel?: string;
}) {
  const first = chips.slice(0, INLINE_CHAINS);
  const selectedBeyond = chips.slice(INLINE_CHAINS).find((c) => c.chainIndex === value);
  const inline = selectedBeyond === undefined ? first : [...first, selectedBeyond];
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [anchor, setAnchor] = useState<{ readonly top: number; readonly left: number } | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const moreRef = useRef<HTMLButtonElement | null>(null);
  const matches = useMemo(() => filterChains(chips, query), [chips, query]);

  useEffect(() => {
    if (open) searchRef.current?.focus();
  }, [open]);

  const close = () => {
    setOpen(false);
    setQuery("");
  };
  const toggle = () => {
    if (open) return close();
    const rect = moreRef.current?.getBoundingClientRect();
    const width = Math.min(PANEL_WIDTH, window.innerWidth * 0.9);
    // under the button, kept inside the window on both sides
    setAnchor(rect === undefined ? { top: 40, left: 8 } : { top: rect.bottom + 4, left: Math.max(8, Math.min(rect.left, window.innerWidth - width - 8)) });
    setOpen(true);
  };

  const radios = () => Array.from(listRef.current?.querySelectorAll<HTMLButtonElement>("[role=radio]:not(:disabled)") ?? []);
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const { key } = event;
    if (key !== "ArrowLeft" && key !== "ArrowRight" && key !== "Home" && key !== "End") return;
    const items = radios();
    const at = items.indexOf(document.activeElement as HTMLButtonElement);
    if (at === -1) return;
    event.preventDefault();
    const next =
      key === "Home" ? 0 : key === "End" ? items.length - 1 : key === "ArrowRight" ? (at + 1) % items.length : (at - 1 + items.length) % items.length;
    items[next].focus();
    if (!items[next].disabled) onSelect(items[next].dataset.chain!);
  };

  // When the stored network is not in the list at all, the first enabled chip takes the tab stop.
  const valueKnown = inline.some((c) => c.chainIndex === value);
  const firstEnabled = inline.find((c) => c.enabled)?.chainIndex;
  const chipButton = (chip: ChainChip, inPanel = false) => (
    <button
      key={chip.chainIndex}
      type="button"
      role="radio"
      aria-checked={chip.chainIndex === value}
      aria-label={`${chip.name}${chip.enabled ? "" : `, ${chip.reason}`}`}
      title={chip.reason ?? chip.name}
      disabled={!chip.enabled}
      tabIndex={inPanel ? undefined : chip.chainIndex === value || (!valueKnown && chip.chainIndex === firstEnabled) ? 0 : -1}
      data-chain={chip.chainIndex}
      className={styles.chainChip}
      onClick={() => {
        onSelect(chip.chainIndex);
        if (inPanel) close();
      }}
    >
      <AssetIcon chain={chip.chainIndex} ccy={chainIconSymbol(chip.chainIndex, chip.short)} fallback={chip.short} size={16} lettersClassName={styles.chainShort} />
      <span className={styles.chainName}>{chip.name}</span>
    </button>
  );

  const panel =
    open && anchor !== null && typeof document !== "undefined"
      ? createPortal(
          <>
            <div className={styles.chainBackdrop} onClick={close} aria-hidden="true" />
            <div
              className={styles.chainPanel}
              style={{ top: anchor.top, left: anchor.left }}
              role="dialog"
              aria-label="Todas as redes"
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  event.preventDefault();
                  close();
                  moreRef.current?.focus();
                }
              }}
            >
              <input
                ref={searchRef}
                type="search"
                className={styles.chainSearch}
                aria-label="Buscar rede"
                placeholder="Buscar rede"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
              {matches.length === 0 ? (
                <p className={styles.chainEmpty}>Nenhuma rede com esse nome.</p>
              ) : (
                <div className={styles.chainGrid} role="radiogroup" aria-label={`${ariaLabel}, todas`}>
                  {matches.map((chip) => chipButton(chip, true))}
                </div>
              )}
            </div>
          </>,
          document.body,
        )
      : null;

  return (
    <div className={styles.chainWrap}>
      <div className={styles.chainRow} role="radiogroup" aria-label={ariaLabel} onKeyDown={onKeyDown} ref={listRef}>
        {inline.map((chip) => chipButton(chip))}
        {chips.length > inline.length ? (
          <button ref={moreRef} type="button" className={styles.chainMore} aria-expanded={open} aria-haspopup="dialog" onClick={toggle}>
            {`Todas as redes (${chips.length})`}
          </button>
        ) : null}
      </div>
      {panel}
    </div>
  );
}
