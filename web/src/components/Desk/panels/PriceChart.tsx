"use client";

import { type KeyboardEvent, type PointerEvent, useEffect, useMemo, useRef, useState } from "react";
import { DEFAULT_PALETTE, type DeskPalette, readPalette } from "@/lib/desk/ui/canvas";
import { type ChartGeometry, computeGeometry, drawCandleChart, type HoverPoint } from "@/lib/desk/ui/draw-candles";
import {
  fmtCompact,
  fmtDayMonth,
  fmtClock,
  fmtNumber,
  fmtPctSigned,
  priceDecimals,
  priceDecimalsForMagnitude,
} from "@/lib/desk/ui/format";
import { useElementSize } from "@/lib/desk/ui/useElementSize";
import type { DeskBar, DeskCandle, DeskInstrument, DeskMetrics, DeskTicker } from "@/lib/desk/types";
import { PanelEmpty, PanelFrame } from "./PanelFrame";
import styles from "./PriceChart.module.css";

export const CHART_BARS: readonly DeskBar[] = ["1m", "5m", "15m", "1H", "4H", "1D"];

const FALLBACK = { width: 480, height: 300 };
const FONT_SIZE = "10.5px";
const FALLBACK_FAMILY = "ui-monospace, SFMono-Regular, Menlo, monospace";

export interface PriceChartProps {
  /** Oldest first. The last one may still be forming. */
  candles: readonly DeskCandle[];
  bar: DeskBar;
  metrics: DeskMetrics;
  ticker: DeskTicker | null;
  /** Source of the price decimals. When null they are derived from the price magnitude. */
  instrument?: DeskInstrument | null;
  onBarChange?: (bar: DeskBar) => void;
  stale?: boolean;
  reducedMotion?: boolean;
}

function candleTime(c: DeskCandle, bar: DeskBar): string {
  return bar === "1D" ? fmtDayMonth(c.tsMs) : `${fmtDayMonth(c.tsMs)} ${fmtClock(c.tsMs)}`;
}

function candleChangePct(c: DeskCandle): number | null {
  return c.open > 0 ? ((c.close - c.open) / c.open) * 100 : null;
}

/** Color tone of a percent change. A change that prints as 0,00% carries no color. */
function toneOfPct(v: number | null): "up" | "down" | "none" {
  if (v === null || Math.abs(v) < 0.005) return "none";
  return v > 0 ? "up" : "down";
}

/**
 * Candlesticks, volume, VWAP and the last price on a DPR aware canvas. The candle still forming is
 * drawn hollow. Hovering, touching or using the arrow keys opens a crosshair and shows the OHLCV of
 * that candle; without it the readout shows the newest candle.
 */
export function PriceChart({
  candles,
  bar,
  metrics,
  ticker,
  instrument = null,
  onBarChange,
  stale = false,
}: PriceChartProps) {
  const [wrapRef, size] = useElementSize<HTMLDivElement>(FALLBACK);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const geomRef = useRef<ChartGeometry | null>(null);
  const paletteRef = useRef<DeskPalette>(DEFAULT_PALETTE);
  const familyRef = useRef(FALLBACK_FAMILY);
  const [hover, setHover] = useState<HoverPoint | null>(null);
  const [fontsReady, setFontsReady] = useState(0);

  const hasData = candles.length > 0;
  const lastCandle = hasData ? candles[candles.length - 1] : null;
  const last = ticker?.last ?? lastCandle?.close ?? null;
  const decimals = priceDecimals(instrument?.tickSz, priceDecimalsForMagnitude(last));
  const vwap = metrics.vwap;

  // Redraw once the web fonts are in, so the first canvas text does not stay in the fallback face.
  useEffect(() => {
    if (typeof document === "undefined" || !document.fonts) return;
    let live = true;
    void document.fonts.ready.then(() => {
      if (live) setFontsReady((n) => n + 1);
    });
    return () => {
      live = false;
    };
  }, []);

  // A hover index belongs to one series. Drop it when the bar changes or the series shrinks.
  useEffect(() => {
    setHover((h) => (h && h.index < candles.length ? h : null));
  }, [candles.length]);
  useEffect(() => {
    setHover(null);
  }, [bar]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !hasData || size.width < 40 || size.height < 40) return;
    const id = requestAnimationFrame(() => {
      const dpr = Math.min(3, Math.max(1, window.devicePixelRatio || 1));
      const w = Math.round(size.width * dpr);
      const h = Math.round(size.height * dpr);
      if (canvas.width !== w) canvas.width = w;
      if (canvas.height !== h) canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      paletteRef.current = readPalette(canvas);
      const family = getComputedStyle(canvas).fontFamily;
      if (family) familyRef.current = family;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      geomRef.current = drawCandleChart(ctx, {
        width: size.width,
        height: size.height,
        dpr,
        candles,
        bar,
        decimals,
        last,
        vwap,
        hover,
        palette: paletteRef.current,
        font: `${FONT_SIZE} ${familyRef.current}`,
      });
    });
    return () => cancelAnimationFrame(id);
  }, [candles, bar, decimals, last, vwap, hover, size, hasData, fontsReady]);

  const geometry = useMemo(
    () =>
      computeGeometry({
        width: size.width,
        height: size.height,
        dpr: 1,
        candles,
        bar,
        decimals,
        last,
        vwap,
        hover: null,
        palette: DEFAULT_PALETTE,
        font: "",
      }),
    [size, candles, bar, decimals, last, vwap],
  );

  function pointAt(event: PointerEvent<HTMLDivElement>): void {
    const geom = geomRef.current ?? geometry;
    const index = geom.indexAt(event.nativeEvent.offsetX);
    if (index === null) return;
    const y = event.nativeEvent.offsetY;
    setHover((h) => (h && h.index === index && h.y !== null && Math.abs(h.y - y) < 1 ? h : { index, y }));
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    if (!hasData) return;
    const geom = geomRef.current ?? geometry;
    const first = geom.firstIndex;
    const lastIndex = candles.length - 1;
    const current = hover?.index ?? lastIndex;
    let next: number | null = null;
    if (event.key === "ArrowLeft") next = Math.max(first, current - 1);
    else if (event.key === "ArrowRight") next = Math.min(lastIndex, current + 1);
    else if (event.key === "Home") next = first;
    else if (event.key === "End") next = lastIndex;
    else if (event.key === "Escape") {
      setHover(null);
      return;
    }
    if (next === null) return;
    event.preventDefault();
    setHover({ index: next, y: null });
  }

  const shown = hover && hover.index < candles.length ? candles[hover.index] : lastCandle;
  const shownChange = shown ? candleChangePct(shown) : null;
  const forming = shown ? !shown.confirmed : false;
  const inspecting = Boolean(hover && shown);
  const summary = shown
    ? `${inspecting ? "Vela inspecionada" : "Ultima vela"} ${candleTime(shown, bar)}: abertura ${fmtNumber(shown.open, decimals)}, maxima ${fmtNumber(shown.high, decimals)}, minima ${fmtNumber(shown.low, decimals)}, fechamento ${fmtNumber(shown.close, decimals)}, volume ${fmtCompact(shown.volBase)}${forming ? ", vela em formacao" : ""}.`
    : "Sem velas.";

  const selector = (
    <div className={styles.bars} role="group" aria-label="Intervalo das velas">
      {CHART_BARS.map((b) => (
        <button
          key={b}
          type="button"
          className={styles.barButton}
          aria-pressed={b === bar}
          disabled={!onBarChange}
          onClick={() => onBarChange?.(b)}
        >
          {b}
        </button>
      ))}
    </div>
  );

  return (
    <PanelFrame title="Grafico" subtitle={instrument?.instId ?? ticker?.instId ?? null} stale={stale} empty={!hasData}>
      <div className={styles.root}>
        <div className={styles.toolbar}>
          {selector}
          <span className={styles.change} data-tone={toneOfPct(metrics.change24hPct)}>
            <span className={styles.micro}>24h</span> {fmtPctSigned(metrics.change24hPct)}
          </span>
        </div>
        <div className={styles.readout} aria-hidden={!hasData}>
          {shown ? (
            <>
              <span className={styles.when}>{candleTime(shown, bar)}</span>
              <span><span className={styles.k}>O</span>{fmtNumber(shown.open, decimals)}</span>
              <span><span className={styles.k}>H</span>{fmtNumber(shown.high, decimals)}</span>
              <span><span className={styles.k}>L</span>{fmtNumber(shown.low, decimals)}</span>
              <span><span className={styles.k}>C</span>{fmtNumber(shown.close, decimals)}</span>
              <span><span className={styles.k}>Vol</span>{fmtCompact(shown.volBase)}</span>
              <span className={styles.delta} data-tone={toneOfPct(shownChange)}>
                {fmtPctSigned(shownChange)}
              </span>
              {forming ? <span className={styles.forming}>em formacao</span> : null}
            </>
          ) : (
            <span className={styles.when}>OHLCV indisponivel</span>
          )}
        </div>
        <div
          ref={wrapRef}
          className={styles.plot}
          tabIndex={hasData ? 0 : -1}
          role="group"
          aria-label="Grafico de velas. Use as setas para inspecionar as velas."
          onPointerMove={(e) => {
            if (hasData) pointAt(e);
          }}
          onPointerDown={(e) => {
            if (hasData && e.pointerType !== "mouse") pointAt(e);
          }}
          onPointerLeave={(e) => {
            if (e.pointerType === "mouse") setHover(null);
          }}
          onPointerCancel={() => setHover(null)}
          onKeyDown={onKeyDown}
        >
          {hasData ? <canvas ref={canvasRef} className={styles.canvas} aria-hidden="true" /> : <PanelEmpty />}
          <p className="srOnly">{summary}</p>
        </div>
      </div>
    </PanelFrame>
  );
}
