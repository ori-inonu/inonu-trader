"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { BlockEvent } from "@/lib/types";
import { fmtInt, fmtMon, fmtPrice, fmtSigned, fmtSignedMon } from "@/lib/format";
import { presentDecision, sliceChartWindow, type ChartWindow } from "@/lib/presentation";
import { smoothPath } from "./smooth";
import styles from "./FlowChart.module.css";

const WINDOWS: ChartWindow[] = [32, 64, 128];
const PAD_TOP = 96;
const PAD_BOTTOM = 56;
const PLOT_RIGHT = 96;
const MIN_RANGE_PCT = 0.002;
const TAG_W = 68;

function cellFill(event: BlockEvent): string {
  if (event.decision?.late) return "var(--late)";
  const side = event.fill?.side ?? event.decision?.action;
  if (side === "buy") return "var(--buy)";
  if (side === "sell") return "var(--sell)";
  return "var(--muted)";
}

function confidence(event: BlockEvent): string {
  const decision = event.decision;
  if (!decision || decision.late) return "Indisponível";
  const values = [decision.probabilities?.buy, decision.probabilities?.sell, decision.probabilities?.hold];
  if (values.some((value) => typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1)) {
    return "Indisponível";
  }
  return `${Math.round(Math.max(...values as number[]) * 100)}%`;
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
  const scaleRef = useRef<{ lo: number; hi: number; block: number; window: ChartWindow } | null>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [windowSize, setWindowSize] = useState<ChartWindow>(64);
  const [selectedBlock, setSelectedBlock] = useState<number | null>(null);
  const gid = useId().replace(/[^a-zA-Z0-9]/g, "");

  useEffect(() => {
    const element = panelRef.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
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

  const model = useMemo(() => {
    const { w, h } = size;
    const plotHeight = h - PAD_TOP - PAD_BOTTOM;
    if (w < 180 || plotHeight < 52 || !windowEvents.length) return null;

    const first = windowEvents[0];
    const last = windowEvents[windowEvents.length - 1];
    const blockSpan = Math.max(1, last.block - first.block);
    const plotWidth = Math.max(1, w - PLOT_RIGHT);
    const fx = (block: number) => ((block - first.block) / blockSpan) * plotWidth;

    let lo = Infinity;
    let hi = -Infinity;
    let sum = 0;
    for (const event of windowEvents) {
      lo = Math.min(lo, event.mid);
      hi = Math.max(hi, event.mid);
      sum += event.mid;
    }
    const mean = sum / windowEvents.length;
    const floor = Math.max(mean * MIN_RANGE_PCT, 1e-9);
    if (hi - lo < floor) {
      lo = mean - floor / 2;
      hi = mean + floor / 2;
    }

    const previous = scaleRef.current;
    if (previous && previous.window === windowSize && previous.block !== last.block) {
      lo = previous.lo + (lo - previous.lo) * 0.1;
      hi = previous.hi + (hi - previous.hi) * 0.1;
      for (const event of windowEvents) {
        lo = Math.min(lo, event.mid);
        hi = Math.max(hi, event.mid);
      }
      if (hi - lo < floor) {
        const center = (hi + lo) / 2;
        lo = center - floor / 2;
        hi = center + floor / 2;
      }
    }
    scaleRef.current = { lo, hi, block: last.block, window: windowSize };

    const range = hi - lo || 1;
    const fy = (price: number) => PAD_TOP + (1 - (price - lo) / range) * plotHeight;
    const points = windowEvents.map((event) => [fx(event.block), fy(event.mid)] as const);
    const line = smoothPath(points);
    const base = h - PAD_BOTTOM;
    const area = `${line} L${points[points.length - 1][0].toFixed(1)} ${base} L${points[0][0].toFixed(1)} ${base} Z`;
    const byBlock = new Map(windowEvents.map((event) => [event.block, event]));
    const cells = windowEvents.map((event) => ({
      key: event.block,
      x: fx(event.block),
      fill: cellFill(event),
      late: event.decision?.late === true,
    }));
    const fills = windowEvents.filter((event) => event.fill).map((event) => ({
      key: event.block,
      x: fx(event.block),
      y: fy(event.mid),
      fill: event.fill!.side === "buy" ? "var(--buy)" : "var(--sell)",
    }));
    const ticks = [0.25, 0.5, 0.75].map((fraction) => ({
      y: PAD_TOP + plotHeight * fraction,
      label: fmtPrice(lo + (1 - fraction) * range),
    }));
    return { area, byBlock, cells, fills, fx, fy, last, line, plotWidth, ticks, base, shift: 0, endY: fy(last.mid) };
  }, [size, windowEvents, windowSize]);

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
    if (!model || !panelRef.current || !windowEvents.length) return;
    const rect = panelRef.current.getBoundingClientRect();
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
    setSelectedBlock(closest.block);
  }

  const selectedX = inspected && model ? model.fx(inspected.block) : null;
  const selectedY = inspected && model ? model.fy(inspected.mid) : null;

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
        onPointerLeave={() => {
          if (inspected) setSelectedBlock(inspected.block);
        }}
      >
        {!model || !shown ? (
          <div className={styles.empty}>Aguardando dados do feed</div>
        ) : (
          <>
            <svg className={styles.svg} viewBox={`0 0 ${size.w} ${size.h}`} width={size.w} height={size.h} aria-hidden="true">
              <defs>
                <linearGradient id={`area${gid}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#5FE1F5" stopOpacity="0.14" />
                  <stop offset="100%" stopColor="#5FE1F5" stopOpacity="0" />
                </linearGradient>
              </defs>
              {model.ticks.map((tick) => (
                <line key={tick.y} className={styles.grid} x1="0" x2={size.w} y1={tick.y} y2={tick.y} />
              ))}
              <path d={model.area} fill={`url(#area${gid})`} />
              <path className={styles.line} d={model.line} />
              {model.fills.map((fill) => (
                <circle key={fill.key} cx={fill.x} cy={fill.y} r="3.5" fill={fill.fill} />
              ))}
              {model.cells.map((cell) => (
                <rect
                  key={cell.key}
                  x={cell.x - 2.5}
                  y={size.h - 36}
                  width="5"
                  height="16"
                  rx="2"
                  fill={cell.fill}
                  stroke={inspected?.block === cell.key ? "#F3F7FC" : "none"}
                  strokeWidth="1.5"
                />
              ))}
              {selectedX !== null && selectedY !== null ? (
                <g>
                  <line className={styles.cross} x1={selectedX} x2={selectedX} y1={PAD_TOP - 8} y2={model.base + 4} />
                  <circle className={styles.crossDot} cx={selectedX} cy={selectedY} r="4.5" />
                </g>
              ) : null}
              {model.ticks.map((tick) => (
                <text key={`label-${tick.y}`} className={styles.tick} x={size.w - 8} y={tick.y - 5} textAnchor="end">
                  {tick.label}
                </text>
              ))}
              <g className={styles.tag} style={{ transform: `translateY(${model.endY.toFixed(1)}px)` }}>
                <line className={styles.guide} x1={size.w - 72} x2={size.w - TAG_W - 10} y1="0" y2="0" />
                <circle cx={size.w - 82} cy="0" r="4" fill="#E9C677" />
                <rect x={size.w - TAG_W - 8} y="-10" width={TAG_W} height="20" rx="999" fill="#5FE1F5" />
                <text className={styles.tagText} x={size.w - 8 - TAG_W / 2} y="4" textAnchor="middle">
                  {fmtPrice(model.last.mid)}
                </text>
              </g>
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

      {model && shown ? (
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
