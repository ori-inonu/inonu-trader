"use client";

import { useEffect, useRef, useState } from "react";
import { DEFAULT_PALETTE, type DeskPalette, readPalette } from "@/lib/desk/ui/canvas";
import { DEPTH_WINDOW_S, drawLiquiditySurface, halfSpanLabel, sideTotals, viewWindow } from "@/lib/desk/ui/draw-liquidity";
import { fmtCompact, priceDecimals, priceDecimalsForMagnitude } from "@/lib/desk/ui/format";
import { useElementSize } from "@/lib/desk/ui/useElementSize";
import { createRafLoop } from "@/lib/useRafLoop";
import type { DeskInstrument, DeskLiquiditySlice } from "@/lib/desk/types";
import { PanelEmpty, PanelFrame } from "./PanelFrame";
import styles from "./LiquiditySurface.module.css";

const FALLBACK = { width: 480, height: 320 };
const FONT_SIZE = "10.5px";
const FALLBACK_FAMILY = "ui-monospace, SFMono-Regular, Menlo, monospace";
/** Frame budget of the animated wall: about 20 frames per second. */
const FRAME_MS = 48;

export interface LiquiditySurfaceProps {
  /** Oldest first, about one slice per second. */
  liquidity: readonly DeskLiquiditySlice[];
  midPx: number | null;
  /** Source of the mid price decimals. When null they are derived from the price magnitude. */
  instrument?: DeskInstrument | null;
  stale?: boolean;
  /** Draws a single still frame per data update instead of a continuously moving wall. */
  reducedMotion?: boolean;
}

/**
 * The liquidity wall in 2.5D: price across, time receding (newest slice in front, older ones
 * fading away), resting quote depth rising. Bids are green, asks red and the mid line is the signal
 * color. In motion mode the wall slides back at 20 frames per second as the clock runs, so a feed
 * that stalls is visible as a wall that keeps receding. With reduced motion it is one static frame
 * per new slice.
 */
export function LiquiditySurface({ liquidity, midPx, instrument = null, stale = false, reducedMotion = false }: LiquiditySurfaceProps) {
  const [wrapRef, size] = useElementSize<HTMLDivElement>(FALLBACK);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const paletteRef = useRef<DeskPalette>(DEFAULT_PALETTE);
  const familyRef = useRef(FALLBACK_FAMILY);
  const [fontsReady, setFontsReady] = useState(0);

  const newest = liquidity.length ? liquidity[liquidity.length - 1] : null;
  const hasData = newest !== null && newest.bins.length >= 2;
  const reference = midPx ?? newest?.midPx ?? null;
  const midDecimals = priceDecimals(instrument?.tickSz, priceDecimalsForMagnitude(reference));
  const newestTs = newest?.tsMs ?? null;

  // The latest props, read by the frame loop without restarting it on every data update.
  const live = useRef({ liquidity, midPx: reference, midDecimals, size, reducedMotion });
  live.current = { liquidity, midPx: reference, midDecimals, size, reducedMotion };
  // Clock anchor: the newest slice's own timestamp, advanced by the local clock. It makes the depth
  // axis independent of any skew between the exchange clock and this machine.
  const anchor = useRef<{ ts: number; perf: number } | null>(null);
  if (newestTs !== null && (anchor.current === null || anchor.current.ts !== newestTs)) {
    anchor.current = { ts: newestTs, perf: typeof performance !== "undefined" ? performance.now() : 0 };
  }
  if (newestTs === null) anchor.current = null;

  useEffect(() => {
    if (typeof document === "undefined" || !document.fonts) return;
    let alive = true;
    void document.fonts.ready.then(() => {
      if (alive) setFontsReady((n) => n + 1);
    });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !hasData) return;

    const paint = (): void => {
      const state = live.current;
      const { width, height } = state.size;
      if (width < 40 || height < 40) return;
      const dpr = Math.min(3, Math.max(1, window.devicePixelRatio || 1));
      const w = Math.round(width * dpr);
      const h = Math.round(height * dpr);
      if (canvas.width !== w) canvas.width = w;
      if (canvas.height !== h) canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const a = anchor.current;
      const elapsed = state.reducedMotion || !a ? 0 : performance.now() - a.perf;
      const nowMs = (a ? a.ts : Date.now()) + elapsed;
      drawLiquiditySurface(ctx, {
        width,
        height,
        slices: state.liquidity,
        nowMs,
        midPx: state.midPx,
        midDecimals: state.midDecimals,
        palette: paletteRef.current,
        font: `${FONT_SIZE} ${familyRef.current}`,
      });
    };

    paletteRef.current = readPalette(canvas);
    const family = getComputedStyle(canvas).fontFamily;
    if (family) familyRef.current = family;

    if (reducedMotion) {
      // One still frame now, and another on every new slice or resize (this effect re-runs).
      const id = requestAnimationFrame(paint);
      return () => cancelAnimationFrame(id);
    }

    let last = 0;
    const loop = createRafLoop(
      (now) => {
        if (now - last < FRAME_MS) return;
        last = now;
        paint();
      },
      () => document.visibilityState === "visible",
    );
    paint();
    loop.start();
    const onVisible = (): void => loop.start();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      loop.stop();
    };
    // The mid price is read from `live`, not listed here: a mid change must not restart the loop or repaint a still frame.
  }, [hasData, reducedMotion, newestTs, size, fontsReady]);

  const totals = newest && hasData ? sideTotals(newest) : null;
  const win = newest && hasData ? viewWindow(newest) : null;
  const span = win ? halfSpanLabel(win.halfBps) : "";
  const label = hasData && totals && win
    ? `Superficie de liquidez${instrument ? ` de ${instrument.instId}` : ""}: ${liquidity.length} amostras dos ultimos ${DEPTH_WINDOW_S} segundos, janela de ${span} de cada lado do preco medio${win.limited ? ", limitada pelo alcance do livro da OKX" : ""}. Profundidade atual, compra ${fmtCompact(totals.bid)}, venda ${fmtCompact(totals.ask)}.`
    : "Superficie de liquidez indisponivel.";

  return (
    <PanelFrame title="Liquidez" subtitle={instrument?.instId ?? null} stale={stale} empty={!hasData}>
      <div className={styles.root}>
        <div ref={wrapRef} className={styles.stage} data-empty={hasData ? undefined : "true"} role="img" aria-label={label}>
          {hasData ? <canvas ref={canvasRef} className={styles.canvas} aria-hidden="true" /> : <PanelEmpty />}
        </div>
        {hasData && totals ? (
          <div className={styles.legend} aria-hidden="true">
            <span className={styles.buy}>Compra {fmtCompact(totals.bid)}</span>
            <span className={styles.meta}>{liquidity.length} amostras</span>
            <span className={styles.sell}>Venda {fmtCompact(totals.ask)}</span>
          </div>
        ) : null}
      </div>
    </PanelFrame>
  );
}
