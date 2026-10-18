"use client";

import { type CSSProperties, type KeyboardEvent, useMemo } from "react";
import {
  baseSymbol,
  fmtCompact,
  fmtFundingPct,
  fmtNumber,
  fmtPctSigned,
  isSwapId,
  priceDecimalsForMagnitude,
  UNAVAILABLE,
} from "@/lib/desk/ui/format";
import { type WatchlistLayout, watchlistLayout } from "@/lib/desk/ui/right-wing-layout";
import { sparkArea, sparkPath } from "@/lib/desk/ui/spark";
import { useElementSize } from "@/lib/desk/ui/useElementSize";
import type { AssetCatalogRow } from "@/lib/desk/useAssetCatalog";
import type { DeskWatchRow } from "@/lib/desk/types";
import type { WatchPins } from "@/lib/mesa/watch-pins";
import { instrumentIconSymbol } from "@/lib/onchain/icons";
import { AssetIcon } from "../AssetIcon";
import { PanelEmpty, PanelFrame } from "./PanelFrame";
import styles from "./Watchlist.module.css";

const SPARK_W = 60;
const SPARK_H = 22;
const FALLBACK = { width: 460, height: 260 };

export interface WatchlistProps {
  rows: readonly DeskWatchRow[];
  /** Instrument id of the row marked as the focus of the desk. */
  focus: string;
  onSelect?: (instId: string) => void;
  stale?: boolean;
  reducedMotion?: boolean;
  /** Star column of the pinned instruments; defaults show a filled star that never unpins. */
  pins?: WatchPins | null;
  /** Volume-ranked catalog rows under "Mais ativos por volume": no sparkline, never fabricated. */
  extras?: readonly AssetCatalogRow[];
}

/** Percent change of the last price against the 24h open, null when either is unknown. */
export function change24h(row: DeskWatchRow): number | null {
  const t = row.ticker;
  if (!t || t.open24h === null || !Number.isFinite(t.open24h) || t.open24h <= 0) return null;
  return ((t.last - t.open24h) / t.open24h) * 100;
}

function toneOf(v: number | null): "up" | "down" | "flat" | "none" {
  if (v === null) return "none";
  // A change that prints as 0,00% carries no color.
  if (Math.abs(v) < 0.005) return "flat";
  return v > 0 ? "up" : "down";
}

function trend(spark: readonly number[]): "up" | "down" | "flat" {
  if (spark.length < 2) return "flat";
  const first = spark[0];
  const last = spark[spark.length - 1];
  return last > first ? "up" : last < first ? "down" : "flat";
}

interface LineProps {
  row: DeskWatchRow;
  focused: boolean;
  maxVol: number;
  layout: WatchlistLayout;
  pins?: WatchPins | null;
  onSelect?: (instId: string) => void;
}

/** The star that pins a row: the five defaults are always pinned and their star never unpins. */
export function Star({ instId, pins }: { instId: string; pins: WatchPins }) {
  const pinned = pins.isPinned(instId);
  const removable = pins.canPin(instId);
  return (
    <button
      type="button"
      className={styles.star}
      aria-pressed={pinned}
      aria-label={pinned ? `Remover ${instId} da lista` : `Fixar ${instId} na lista`}
      title={pinned ? (removable ? "Remover da lista" : "Fixado na lista") : "Fixar na lista"}
      disabled={pinned && !removable}
      data-filled={pinned ? "true" : undefined}
      onClick={() => pins.toggle(instId)}
    >
      <svg viewBox="0 0 12 12" aria-hidden="true" className={styles.starIcon}>
        <path d="M6 1l1.5 3.1 3.4.5-2.5 2.4.6 3.4L6 8.7 3 10.4l.6-3.4L1.1 4.6l3.4-.5z" />
      </svg>
    </button>
  );
}

function Line({ row, focused, maxVol, layout, pins, onSelect }: LineProps) {
  const t = row.ticker;
  const change = change24h(row);
  const tone = toneOf(change);
  const vol = t?.volQuote24h ?? null;
  const volRatio = vol !== null && maxVol > 0 ? Math.min(1, vol / maxVol) : 0;
  const line = layout.spark ? sparkPath(row.spark, SPARK_W, SPARK_H, 2) : "";
  const area = layout.spark ? sparkArea(row.spark, SPARK_W, SPARK_H, 2) : "";
  const swap = isSwapId(row.instId);
  const sym = baseSymbol(row.instId);
  return (
    <li className={styles.li}>
      <div className={styles.lineWrap}>
        {pins ? <Star instId={row.instId} pins={pins} /> : null}
        <button
        type="button"
        className={styles.item}
        data-row="true"
        aria-current={focused ? "true" : undefined}
        data-focus={focused ? "true" : undefined}
        data-tone={tone}
        data-trend={trend(row.spark)}
        onClick={() => onSelect?.(row.instId)}
      >
        <span className={styles.sym}>
          <AssetIcon ccy={instrumentIconSymbol(row.instId)} size={14} />
          <span className={styles.symName}>{sym}</span>
          {swap ? <span className={styles.tag}>PERP</span> : null}
          <span className="srOnly">{swap ? ", contrato perpetuo" : ", a vista"}{focused ? ", ativo em foco" : ""}</span>
        </span>
        <span className={styles.px}>
          {t ? fmtNumber(t.last, priceDecimalsForMagnitude(t.last)) : <span className={styles.na} title={UNAVAILABLE}>-<span className="srOnly">{UNAVAILABLE}</span></span>}
        </span>
        <span className={styles.chg}>
          {change === null ? <span className={styles.na} title={UNAVAILABLE}>-<span className="srOnly">{UNAVAILABLE}</span></span> : fmtPctSigned(change)}
        </span>
        {layout.spark ? (
          <span className={styles.spark} aria-hidden={line === "" ? true : undefined}>
            {line ? (
              <svg viewBox={`0 0 ${SPARK_W} ${SPARK_H}`} preserveAspectRatio="none" role="img" aria-label={`Tendencia de ${sym}`}>
                <path className={styles.sparkFill} d={area} />
                <path className={styles.sparkLine} d={line} vectorEffect="non-scaling-stroke" />
              </svg>
            ) : null}
          </span>
        ) : null}
        {layout.vol ? (
          <span className={styles.vol} style={{ "--v": volRatio.toFixed(3) } as CSSProperties}>
            <span className={styles.volBar} aria-hidden="true" />
            <span className={styles.volText}>{vol === null ? <span className={styles.na}>-<span className="srOnly">{UNAVAILABLE}</span></span> : fmtCompact(vol)}</span>
          </span>
        ) : null}
        {layout.fund ? (
          <span className={styles.fund}>
            {row.fundingRate === null ? null : (
              <>
                <span className="srOnly">funding </span>
                {fmtFundingPct(row.fundingRate, 3)}
              </>
            )}
          </span>
        ) : null}
        </button>
      </div>
    </li>
  );
}

/**
 * A volume-ranked catalog row under the separator: last price, 24h change and volume are real
 * REST values, but there is no WebSocket sparkline so the trend column stays honestly empty.
 */
function ExtraLine({ row, focused, layout, pins, onSelect }: { row: AssetCatalogRow; focused: boolean; layout: WatchlistLayout; pins?: WatchPins | null; onSelect?: (instId: string) => void }) {
  const change = row.change24hPct;
  const tone = toneOf(change);
  const swap = isSwapId(row.instId);
  const sym = baseSymbol(row.instId);
  return (
    <li className={styles.li}>
      <div className={styles.lineWrap}>
        {pins ? <Star instId={row.instId} pins={pins} /> : null}
        <button
          type="button"
          className={styles.item}
          data-row="true"
          aria-current={focused ? "true" : undefined}
          data-focus={focused ? "true" : undefined}
          data-tone={tone}
          onClick={() => onSelect?.(row.instId)}
        >
          <span className={styles.sym}>
            <AssetIcon ccy={instrumentIconSymbol(row.instId)} size={14} />
            <span className={styles.symName}>{sym}</span>
            {swap ? <span className={styles.tag}>PERP</span> : null}
            <span className="srOnly">{swap ? ", contrato perpetuo" : ", a vista"}{focused ? ", ativo em foco" : ""}</span>
          </span>
          <span className={styles.px}>
            {row.last === null ? <span className={styles.na} title={UNAVAILABLE}>-<span className="srOnly">{UNAVAILABLE}</span></span> : fmtNumber(row.last, priceDecimalsForMagnitude(row.last))}
          </span>
          <span className={styles.chg}>
            {change === null ? <span className={styles.na} title={UNAVAILABLE}>-<span className="srOnly">{UNAVAILABLE}</span></span> : fmtPctSigned(change)}
          </span>
          {layout.spark ? <span className={styles.spark} aria-hidden="true" /> : null}
          {layout.vol ? (
            <span className={styles.vol}>
              <span className={styles.volBar} aria-hidden="true" />
              <span className={styles.volText}>{row.volQuote24h === null ? <span className={styles.na}>-<span className="srOnly">{UNAVAILABLE}</span></span> : fmtCompact(row.volQuote24h)}</span>
            </span>
          ) : null}
          {layout.fund ? <span className={styles.fund} /> : null}
        </button>
      </div>
    </li>
  );
}

/**
 * The instrument list: base symbol, last price, 24h change, a sparkline, the 24h quote volume
 * against the largest in the list and the funding rate when the instrument has one. Each row is a
 * button, so Enter and Space select it, and ArrowUp/ArrowDown move between rows. The focus row
 * carries aria-current.
 *
 * Every row it is given is always shown. When the panel is short the column header goes first, then
 * the sparkline and the volume bar, and the rows themselves only get thinner. The list scrolls
 * inside the panel only when even rows of 15px could not fit.
 */
export function Watchlist({ rows, focus, onSelect, stale = false, pins = null, extras = [] }: WatchlistProps) {
  const [ref, size] = useElementSize<HTMLDivElement>(FALLBACK);
  const maxVol = useMemo(() => rows.reduce((m, r) => Math.max(m, r.ticker?.volQuote24h ?? 0), 0), [rows]);
  const hasRows = rows.length > 0 || extras.length > 0;
  const hasData = rows.some((row) => row.ticker !== null) || extras.some((row) => row.last !== null);
  const layout = watchlistLayout(size.width, size.height, rows.length, pins ? 20 : 0);

  function onKeyDown(event: KeyboardEvent<HTMLUListElement>): void {
    const { key } = event;
    if (key !== "ArrowDown" && key !== "ArrowUp" && key !== "Home" && key !== "End") return;
    const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>("button[data-row]"));
    if (!buttons.length) return;
    const at = buttons.findIndex((b) => b === document.activeElement);
    let next = at;
    if (key === "ArrowDown") next = Math.min(buttons.length - 1, at + 1);
    else if (key === "ArrowUp") next = Math.max(0, at <= 0 ? 0 : at - 1);
    else if (key === "Home") next = 0;
    else next = buttons.length - 1;
    event.preventDefault();
    buttons[next]?.focus();
  }

  const vars = {
    "--wl-cols": layout.template,
    "--wl-min-w": `${layout.minW}px`,
    "--wl-pad": `${layout.padX}px`,
    "--row-h": `${layout.rowH}px`,
    "--spark-h": `${layout.sparkH}px`,
    "--vol-h": `${layout.volH}px`,
  } as CSSProperties;

  return (
    <PanelFrame title="Ativos" subtitle={null} stale={stale} empty={!hasData}>
      <div ref={ref} className={styles.root} style={vars} data-level={layout.level} data-scroll={layout.scroll ? "true" : undefined}>
        {hasRows ? (
          <>
            {layout.header ? (
              <div className={styles.cols} aria-hidden="true">
                <span>Ativo</span>
                <span>Ultimo</span>
                <span>24h</span>
                {layout.spark ? <span>Tend.</span> : null}
                {layout.vol ? <span>Vol 24h</span> : null}
                {layout.fund ? <span className={styles.colFund}>Funding</span> : null}
              </div>
            ) : null}
            <ul className={styles.list} aria-label="Lista de ativos" onKeyDown={onKeyDown}>
              {rows.map((row) => (
                <Line key={row.instId} row={row} focused={row.instId === focus} maxVol={maxVol} layout={layout} pins={pins} onSelect={onSelect} />
              ))}
              {extras.length > 0 ? <li className={styles.extraSep} aria-hidden="true">Mais ativos por volume</li> : null}
              {extras.map((row) => (
                <ExtraLine key={row.instId} row={row} focused={row.instId === focus} layout={layout} pins={pins} onSelect={onSelect} />
              ))}
            </ul>
          </>
        ) : (
          <PanelEmpty />
        )}
      </div>
    </PanelFrame>
  );
}
