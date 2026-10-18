"use client";

import { memo, useEffect, useId, useMemo, useRef, useState } from "react";
import type { BlockEvent } from "@/lib/types";
import { fmtInt, fmtMon, fmtPrice, fmtSigned, fmtSignedMon } from "@/lib/format";
import { presentDecision, sliceChartWindow, type ChartWindow } from "@/lib/presentation";
import { smoothPath } from "./smooth";
import styles from "./FlowChart.module.css";

const WINDOWS: ChartWindow[] = [32, 64, 128];
/** Right gutter reserved for the price scale: tick labels and the live price pill. */
const PLOT_RIGHT = 96;
/** Bottom band reserved for the block strip and the block axis. */
const PAD_BOTTOM = 52;
/** Left with the overlays clear of the plot. */
const PAD_TOP_WIDE = 96;
const PAD_TOP_SHORT = 72;
const MIN_RANGE_PCT = 0.002;
const TAG_W = 68;
/** A tick label is dropped when the live price pill would sit on top of it. */
const TAG_CLEARANCE = 12;

type Tone = "buy" | "sell" | "hold" | "late" | "idle";

interface ChartScale {
  lo: number;
  hi: number;
  block: number;
  window: ChartWindow;
}

interface ChartModel {
  w: number;
  h: number;
  padTop: number;
  base: number;
  plotWidth: number;
  plotHeight: number;
  lo: number;
  hi: number;
  mean: number;
  line: string;
  area: string;
  cells: Array<{ key: number; x: number; tone: Tone }>;
  fills: Array<{ key: number; x: number; y: number; tone: "buy" | "sell" }>;
  ticks: Array<{ y: number; label: string }>;
  blockTicks: Array<{ x: number; label: string; anchor: "start" | "middle" | "end" }>;
  cellY: number;
  cellH: number;
  endY: number;
  first: BlockEvent;
  last: BlockEvent;
  fx: (block: number) => number;
  fy: (price: number) => number;
}

function cellTone(event: BlockEvent): Tone {
  if (event.decision?.late) return "late";
  const side = event.fill?.side ?? event.decision?.action;
  if (side === "buy") return "buy";
  if (side === "sell") return "sell";
  return "idle";
}

function confidence(event: BlockEvent): string {
  const decision = event.decision;
  if (!decision || decision.late) return "Indisponível";
  const buy = decision.probabilities?.buy;
  const sell = decision.probabilities?.sell;
  const hold = decision.probabilities?.hold;
  const values = [buy, sell, hold];
  if (values.some((value) => typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1)) {
    return "Indisponível";
  }
  let peak = 0;
  for (const value of values) {
    if (typeof value === "number" && value > peak) peak = value;
  }
  return `${Math.round(peak * 100)}%`;
}

function statusFor(event: BlockEvent): string {
  const decision = presentDecision(event.decision);
  if (event.fill?.simulated || event.quote?.status === "sim") return "Simulado";
  if (event.fill) return "Execução informada pelo feed";
  if (event.quote?.status === "sent") return "Ordem pendente";
  if (event.quote?.status === "placed") return "Ordem registrada";
  if (event.quote?.status === "reverted") return "Ordem revertida";
  if (event.quote?.status === "lost") return "Ordem sem confirmação";
  return decision.label;
}

/**
 * Everything that depends only on the plotted geometry. Pointer moves re-render the chart for the
 * crosshair alone, so the plot itself is memoized and never reconciles again while the pointer
 * travels the same series.
 */
const Plot = memo(function Plot({ model, gradientId }: { model: ChartModel; gradientId: string }) {
  const { w, h, padTop, base, plotWidth, plotHeight, cells, fills, ticks, blockTicks, cellY, cellH, endY, last } = model;
  return (
    <>
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop className={styles.areaTop} offset="0%" />
          <stop className={styles.areaBase} offset="100%" />
        </linearGradient>
      </defs>

      <rect className={styles.floor} x="0" y={padTop - 12} width={w} height={base - padTop + 12} />
      <g className={styles.corners} aria-hidden="true">
        <path d={`M0 ${padTop - 12} L14 ${padTop - 12} M0 ${padTop - 12} L0 ${padTop + 2}`} />
        <path d={`M${plotWidth} ${padTop - 12} L${plotWidth - 14} ${padTop - 12} M${plotWidth} ${padTop - 12} L${plotWidth} ${padTop + 2}`} />
        <path d={`M0 ${base} L14 ${base} M0 ${base} L0 ${base - 14}`} />
        <path d={`M${plotWidth} ${base} L${plotWidth - 14} ${base} M${plotWidth} ${base} L${plotWidth} ${base - 14}`} />
      </g>

      {ticks.map((tick) => (
        <line key={tick.y} className={styles.grid} x1="0" x2={plotWidth} y1={tick.y} y2={tick.y} />
      ))}

      <path d={model.area} fill={`url(#${gradientId})`} />
      <path className={styles.line} d={model.line} />

      <line
        className={styles.reference}
        x1="0"
        x2={plotWidth}
        y1={model.fy(model.mean)}
        y2={model.fy(model.mean)}
      />

      {fills.map((fill) => (
        <circle key={fill.key} className={styles[fill.tone]} cx={fill.x} cy={fill.y} r="3.5" />
      ))}

      {cells.map((cell) => (
        <rect key={cell.key} className={`${styles.blockCell} ${styles[cell.tone]}`} x={cell.x - 2.5} y={cellY} width="5" height={cellH} rx="2" />
      ))}

      <text className={styles.tick} x={plotWidth + 8} y={model.fy(model.mean) + 4}>
        média
      </text>

      {ticks.map((tick) => (
        <text key={`label-${tick.y}`} className={styles.tick} x={w - 8} y={tick.y - 5} textAnchor="end">
          {tick.label}
        </text>
      ))}

      {blockTicks.map((tick) => (
        <text key={`block-${tick.x}`} className={styles.blockTick} x={tick.x} y={h - 6} textAnchor={tick.anchor}>
          {tick.label}
        </text>
      ))}

      <g className={styles.tag} style={{ transform: `translateY(${endY.toFixed(1)}px)` }}>
        <line className={styles.guide} x1={plotWidth} x2={w - TAG_W - 12} y1="0" y2="0" />
        <circle className={styles.guideDot} cx={w - TAG_W - 8} cy="0" r="4" />
        <rect className={styles.tagBox} x={w - TAG_W - 4} y="-10" width={TAG_W} height="20" rx="999" />
        <text className={styles.tagText} x={w - 4 - TAG_W / 2} y="4" textAnchor="middle">
          {fmtPrice(last.mid)}
        </text>
      </g>
    </>
  );
});

export default function FlowChart({
  events,
  latest,
  market,
}: {
  events: BlockEvent[];
  latest: BlockEvent | null;
  market: string;
}) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const rectRef = useRef<DOMRect | null>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [windowSize, setWindowSize] = useState<ChartWindow>(64);
  const [selectedBlock, setSelectedBlock] = useState<number | null>(null);
  const [scale, setScale] = useState<ChartScale | null>(null);
  const gid = useId().replace(/[^a-zA-Z0-9]/g, "");

  useEffect(() => {
    const element = panelRef.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      // The pointer mapping is derived from this rect, so it is captured with the size and
      // never re-read on every pointer move.
      rectRef.current = element.getBoundingClientRect();
      setSize((current) =>
        Math.abs(current.w - width) < 0.5 && Math.abs(current.h - height) < 0.5
          ? current
          : { w: Math.round(width), h: Math.round(height) },
      );
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const eventSeries = useMemo(() => {
    const byBlock = new Map(events.map((event) => [event.block, event]));
    if (latest) byBlock.set(latest.block, latest);
    return [...byBlock.values()].sort((a, b) => a.block - b.block);
  }, [events, latest]);
  const windowEvents = useMemo(() => sliceChartWindow(eventSeries, windowSize), [eventSeries, windowSize]);

  useEffect(() => {
    if (!windowEvents.length) {
      setSelectedBlock(null);
      return;
    }
    setSelectedBlock((current) =>
      current !== null && windowEvents.some((event) => event.block === current)
        ? current
        : windowEvents[windowEvents.length - 1].block,
    );
  }, [windowEvents]);

  const bounds = useMemo(() => {
    if (!windowEvents.length) return null;
    let lo = Infinity;
    let hi = -Infinity;
    let sum = 0;
    for (const event of windowEvents) {
      lo = Math.min(lo, event.mid);
      hi = Math.max(hi, event.mid);
      sum += event.mid;
    }
    return { lo, hi, mean: sum / windowEvents.length, block: windowEvents[windowEvents.length - 1].block };
  }, [windowEvents]);

  // The scale eases toward each new block instead of snapping. It lives in state, not in a ref
  // written during render, so React can render the same block twice without shifting the scale.
  useEffect(() => {
    if (!bounds) {
      setScale(null);
      return;
    }
    const previous = scale;
    if (!previous || previous.window !== windowSize || previous.block === bounds.block) {
      setScale({ lo: bounds.lo, hi: bounds.hi, block: bounds.block, window: windowSize });
      return;
    }
    let lo = previous.lo + (bounds.lo - previous.lo) * 0.1;
    let hi = previous.hi + (bounds.hi - previous.hi) * 0.1;
    for (const event of windowEvents) {
      lo = Math.min(lo, event.mid);
      hi = Math.max(hi, event.mid);
    }
    const floor = Math.max(bounds.mean * MIN_RANGE_PCT, 1e-9);
    if (hi - lo < floor) {
      const center = (hi + lo) / 2;
      lo = center - floor / 2;
      hi = center + floor / 2;
    }
    setScale({ lo, hi, block: bounds.block, window: windowSize });
    // `scale` is read as the previous value only, so it is intentionally not a dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bounds, windowSize, windowEvents]);

  const model = useMemo<ChartModel | null>(() => {
    const { w, h } = size;
    const padTop = h < 280 ? PAD_TOP_SHORT : PAD_TOP_WIDE;
    const plotHeight = h - padTop - PAD_BOTTOM;
    if (!bounds || w < 180 || plotHeight < 40 || !windowEvents.length) return null;

    const first = windowEvents[0];
    const last = windowEvents[windowEvents.length - 1];
    const blockSpan = Math.max(1, last.block - first.block);
    const plotWidth = Math.max(1, w - PLOT_RIGHT);
    const fx = (block: number) => ((block - first.block) / blockSpan) * plotWidth;

    const active = scale ?? bounds;
    let lo = active.lo;
    let hi = active.hi;
    const floor = Math.max(bounds.mean * MIN_RANGE_PCT, 1e-9);
    if (hi - lo < floor) {
      const center = (hi + lo) / 2;
      lo = center - floor / 2;
      hi = center + floor / 2;
    }
    const range = hi - lo || 1;
    const fy = (price: number) => padTop + (1 - (price - lo) / range) * plotHeight;
    const base = h - PAD_BOTTOM;

    const points = windowEvents.map((event) => [fx(event.block), fy(event.mid)] as const);
    const line = smoothPath(points);
    const area = `${line} L${points[points.length - 1][0].toFixed(1)} ${base} L${points[0][0].toFixed(1)} ${base} Z`;
    const cells = windowEvents.map((event) => ({ key: event.block, x: fx(event.block), tone: cellTone(event) }));
    const fills = windowEvents.flatMap((event) =>
      event.fill
        ? [{ key: event.block, x: fx(event.block), y: fy(event.mid), tone: event.fill.side === "buy" ? "buy" as const : "sell" as const }]
        : [],
    );
    const endY = fy(last.mid);
    const ticks = [0.25, 0.5, 0.75]
      .map((fraction) => ({ y: padTop + plotHeight * fraction, label: fmtPrice(lo + (1 - fraction) * range) }))
      .filter((tick) => Math.abs(tick.y - endY) > TAG_CLEARANCE);

    const lastIndex = windowEvents.length - 1;
    const blockTicks = [
      { index: 0, anchor: "start" as const },
      { index: Math.round(lastIndex / 2), anchor: "middle" as const },
      { index: lastIndex, anchor: "end" as const },
    ]
      .filter((tick, at, all) => all.findIndex((other) => other.index === tick.index) === at)
      .map((tick) => ({ x: fx(windowEvents[tick.index].block), label: fmtInt(windowEvents[tick.index].block), anchor: tick.anchor }));

    return {
      w, h, padTop, base, plotWidth, plotHeight, lo, hi, mean: bounds.mean, line, area,
      cells, fills, ticks, blockTicks, cellY: base + 8, cellH: 14, endY, first, last, fx, fy,
    };
  }, [size, scale, bounds, windowEvents]);

  const selectedIndex = windowEvents.findIndex((event) => event.block === selectedBlock);
  const inspected = selectedIndex >= 0 ? windowEvents[selectedIndex] : windowEvents[windowEvents.length - 1] ?? null;
  const shown = inspected ?? latest;
  const decision = presentDecision(shown?.decision ?? null);
  const orderStatus = shown ? statusFor(shown) : "Aguardando dados do feed";
  const pnl = shown?.totals;
  const hasFinitePnl = typeof pnl === "object"
    && pnl !== null
    && !Array.isArray(pnl)
    && typeof pnl.pnlMon === "number"
    && Number.isFinite(pnl.pnlMon)
    && typeof pnl.pnlPct === "number"
    && Number.isFinite(pnl.pnlPct);

  function selectAt(clientX: number) {
    if (!model || !windowEvents.length) return;
    const rect = rectRef.current;
    if (!rect) return;
    const x = clientX - rect.left;
    let closest = windowEvents[0];
    let distance = Infinity;
    for (const event of windowEvents) {
      const nextDistance = Math.abs(model.fx(event.block) - x);
      if (nextDistance < distance) {
        closest = event;
        distance = nextDistance;
      }
    }
    setSelectedBlock((current) => (current === closest.block ? current : closest.block));
  }

  const selectedX = inspected && model ? model.fx(inspected.block) : null;
  const selectedY = inspected && model ? model.fy(inspected.mid) : null;

  // Rebuilt only when the plotted numbers change, never on a pointer move.
  const chartLabel = useMemo(() => {
    if (!model || !shown) return "Gráfico de preço por bloco. Aguardando dados do feed.";
    return `Gráfico de preço médio por bloco para ${market || "o mercado informado"}. `
      + `${windowEvents.length} blocos, do ${fmtInt(model.first.block)} ao ${fmtInt(model.last.block)}. `
      + `Preço mínimo ${fmtPrice(model.lo)}, preço máximo ${fmtPrice(model.hi)}, `
      + `média da janela ${fmtPrice(model.mean)}, último preço ${fmtPrice(model.last.mid)}.`;
  }, [model, shown, market, windowEvents.length]);

  return (
    <section className={styles.wrap} aria-labelledby="chart-title">
      <div className={styles.toolbar}>
        <div className={styles.heading}>
          <p className={styles.eyebrow}>FLUXO OBSERVADO</p>
          <h2 id="chart-title" className={styles.title}>{market || "Mercado não informado"}</h2>
        </div>
        <div className={styles.windows} role="group" aria-label="Janela de blocos do gráfico">
          {WINDOWS.map((count) => (
            <button
              key={count}
              type="button"
              className={styles.windowButton}
              aria-pressed={windowSize === count}
              onClick={() => setWindowSize(count)}
            >
              {count}
            </button>
          ))}
        </div>
      </div>

      <p className={styles.availability}>
        {windowEvents.length} de {windowSize} blocos disponíveis
      </p>

      <div
        ref={panelRef}
        className={styles.panel}
        onPointerMove={(event) => {
          if (event.pointerType === "mouse") selectAt(event.clientX);
        }}
        onPointerDown={(event) => {
          if (event.pointerType !== "mouse") selectAt(event.clientX);
        }}
      >
        {!shown ? (
          <div className={styles.empty}>Aguardando dados do feed</div>
        ) : !model ? (
          <div className={styles.empty}>Espaço insuficiente para desenhar o gráfico</div>
        ) : (
          <>
            <svg className={styles.svg} viewBox={`0 0 ${size.w} ${size.h}`} role="img" aria-label={chartLabel}>
              <Plot model={model} gradientId={`area${gid}`} />
              {selectedX !== null && selectedY !== null ? (
                <g>
                  <line className={styles.cross} x1={selectedX} x2={selectedX} y1={model.padTop - 8} y2={model.base + 4} />
                  <circle className={styles.crossDot} cx={selectedX} cy={selectedY} r="4.5" />
                  <rect
                    className={styles.cellMarker}
                    x={selectedX - 3.5}
                    y={model.cellY - 1}
                    width="7"
                    height={model.cellH + 2}
                    rx="3"
                  />
                </g>
              ) : null}
            </svg>

            <div className={styles.priceOverlay}>
              <strong>{fmtPrice(shown.mid)}</strong>
              <span>Preço informado</span>
            </div>
            <div className={styles.statusOverlay}>
              <strong className={`${styles.action} ${styles[decision.status]}`}>{decision.label}</strong>
              <span>{shown.decision && !shown.decision.late ? `${Math.round(shown.decision.latencyMs)} ms` : "Latência indisponível"}</span>
            </div>
          </>
        )}
      </div>

      {shown ? (
        <div className={styles.positionSummary}>
          <span>{shown.position?.side && shown.position.side !== "flat"
            ? `${shown.position.side === "long" ? "Comprada" : "Vendida"}: ${fmtMon(shown.position.size, Number.isInteger(shown.position.size) ? 0 : 3)}`
            : "Posição informada: sem posição"}</span>
          <span>{hasFinitePnl && pnl ? `PnL informado ${fmtSignedMon(pnl.pnlMon, 3)} (${fmtSigned(pnl.pnlPct, 2)}%)` : "PnL indisponível"}</span>
        </div>
      ) : null}

      <div className={styles.inspector}>
        <button
          className={styles.inspectButton}
          type="button"
          onClick={() => setSelectedBlock(windowEvents[Math.max(0, selectedIndex - 1)]?.block ?? null)}
          disabled={!windowEvents.length || selectedIndex <= 0}
          aria-label="Inspecionar bloco anterior"
        >
          Anterior
        </button>
        <div className={styles.inspectSummary}>
          <strong>{shown ? `Bloco ${fmtInt(shown.block)}` : "Aguardando bloco"}</strong>
          <span>{shown ? `${fmtPrice(shown.mid)}. ${orderStatus}. Confiança: ${confidence(shown)}.` : "Sem bloco disponível para inspeção."}</span>
        </div>
        <button
          className={styles.inspectButton}
          type="button"
          onClick={() => setSelectedBlock(windowEvents[Math.min(windowEvents.length - 1, selectedIndex + 1)]?.block ?? null)}
          disabled={!windowEvents.length || selectedIndex >= windowEvents.length - 1}
          aria-label="Inspecionar próximo bloco"
        >
          Próximo
        </button>
      </div>
    </section>
  );
}