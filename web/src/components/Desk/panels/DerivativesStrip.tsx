"use client";

import { type CSSProperties, type ReactNode, useEffect, useState } from "react";
import {
  basisBps,
  fmtBps,
  fmtCompact,
  fmtCountdown,
  fmtFundingPct,
  fmtNumber,
  fundingToBps,
  priceDecimals,
  priceDecimalsForMagnitude,
  UNAVAILABLE,
} from "@/lib/desk/ui/format";
import { derivativesLayout } from "@/lib/desk/ui/derivatives-layout";
import { useElementSize } from "@/lib/desk/ui/useElementSize";
import type { DeskDerivatives, DeskInstrument, DeskMetrics } from "@/lib/desk/types";
import { PanelEmpty, PanelFrame } from "./PanelFrame";
import styles from "./DerivativesStrip.module.css";

const FALLBACK = { width: 360, height: 200 };
/** Keeps "US$ 8,1 bi" on one line when a note wraps. */
const NBSP = String.fromCharCode(0x00a0);

export interface DerivativesStripProps {
  derivatives: DeskDerivatives | null;
  metrics: DeskMetrics;
  /** When it is a spot instrument the panel says it has no derivatives instead of waiting for them. */
  instrument?: DeskInstrument | null;
  /** Reference clock for the funding countdown. Defaults to the system clock, ticking once a second. */
  nowMs?: number;
  /** OKX clock minus the browser clock (DeskState.clockSkewMs). The funding time is exchange time, so the countdown adds it to the local clock. */
  clockSkewMs?: number | null;
  stale?: boolean;
  reducedMotion?: boolean;
}

/** Wall clock that updates once a second. null until the first client tick, so server and client markup match. */
function useNow(override: number | undefined): number | null {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    if (override !== undefined) return;
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [override]);
  return override !== undefined ? override : now;
}

type Tone = "buy" | "sell" | "flat" | "none";

/** Tone of a signed value. Anything smaller than `eps` prints as zero and carries no color. */
function toneOf(v: number | null, eps: number): Tone {
  if (v === null || !Number.isFinite(v)) return "none";
  if (Math.abs(v) < eps) return "flat";
  return v > 0 ? "buy" : "sell";
}

function Cell({ label, value, sub, tone = "none", wide }: { label: string; value: ReactNode; sub?: ReactNode; tone?: Tone; wide?: boolean }) {
  return (
    <div className={styles.cell} data-tone={tone} data-wide={wide ? "true" : undefined}>
      <dt className={styles.label}>{label}</dt>
      <dd className={styles.value}>{value}</dd>
      {sub !== undefined && sub !== null ? <dd className={styles.note}>{sub}</dd> : null}
    </div>
  );
}

function Pair({ label, value, tone = "none", title }: { label: string; value: ReactNode; tone?: Tone; title?: string }) {
  return (
    <div className={styles.pair} data-tone={tone} title={title}>
      <dt className={styles.pairLabel}>{label}</dt>
      <dd className={styles.pairValue}>{value}</dd>
    </div>
  );
}

/**
 * Funding, countdown to the next funding, basis between mark and index, and open interest. A
 * number the exchange did not send reads "Indisponivel"; nothing is estimated.
 */
export function DerivativesStrip({ derivatives, metrics, instrument = null, nowMs, clockSkewMs = null, stale = false }: DerivativesStripProps) {
  const [ref, size] = useElementSize<HTMLDivElement>(FALLBACK);
  const now = useNow(nowMs);
  const spot = instrument?.instType === "SPOT";
  const hasData = derivatives !== null;
  const d = derivatives;

  const rate = d?.fundingRate ?? null;
  const bps = rate === null ? null : fundingToBps(rate);
  const payer = rate === null || rate === 0 ? null : rate > 0 ? "Longs pagam shorts" : "Shorts pagam longs";
  const next = d?.nextFundingTimeMs ?? null;
  const remaining = next !== null && now !== null ? next - (now + (clockSkewMs ?? 0)) : null;
  const basis = basisBps(d?.markPx ?? null, d?.indexPx ?? null);
  const markDec = priceDecimals(instrument?.tickSz, priceDecimalsForMagnitude(d?.markPx ?? d?.indexPx ?? null));
  const midVsMark = d !== null && d.markPx !== null && metrics.midPx !== null && d.markPx > 0
    ? ((metrics.midPx - d.markPx) / d.markPx) * 10_000
    : null;
  // Layout from the measured box: columns, whether the fifth cell fits, whether each cell has room for its note.
  const { inline, includeMid, cols, notes } = derivativesLayout(size.width, size.height, midVsMark !== null);
  const compact = !notes;
  const fundingText = fmtFundingPct(rate);
  const countdownText = next === null ? UNAVAILABLE : remaining === null ? "--:--" : fmtCountdown(remaining);

  let body: ReactNode;
  if (spot) {
    body = <PanelEmpty>Ativo a vista, sem derivativos</PanelEmpty>;
  } else if (!hasData || d === null) {
    body = <PanelEmpty />;
  } else if (inline) {
    // Short panel: the four numbers as inline label and value pairs, nothing dropped.
    body = (
      <dl className={styles.inline}>
        <Pair label="Funding" tone={toneOf(rate, 5e-7)} value={fundingText} />
        <Pair label="Proximo" value={countdownText} />
        <Pair label="Base" tone={toneOf(basis, 0.05)} value={fmtBps(basis)} />
        <Pair label="OI" title="Open interest" value={fmtCompact(d.openInterest)} />
      </dl>
    );
  } else {
    body = (
      <dl className={styles.grid} data-notes={notes ? "true" : "false"} style={{ "--cols": cols } as CSSProperties}>
        <Cell
          label="Funding"
          tone={toneOf(rate, 5e-7)}
          value={
            <>
              {fundingText}
              {compact && bps !== null ? <span className={styles.aside}> {fmtBps(bps)}</span> : null}
            </>
          }
          sub={rate === null ? UNAVAILABLE : `${fmtBps(bps)}, ${payer ?? "neutro"}`}
        />
        <Cell
          label="Proximo funding"
          value={countdownText}
          sub={next !== null && remaining !== null && remaining <= 0 ? "Aguardando liquidacao" : "Contagem regressiva"}
        />
        <Cell
          label="Base mark x indice"
          tone={toneOf(basis, 0.05)}
          value={fmtBps(basis)}
          sub={`Mark ${fmtNumber(d.markPx, markDec)}, indice ${fmtNumber(d.indexPx, markDec)}`}
        />
        <Cell
          label="Open interest"
          value={fmtCompact(d.openInterest)}
          sub={`Contratos, ${d.openInterestUsd === null ? "USD indisponivel" : `US$${NBSP}${fmtCompact(d.openInterestUsd).replace(" ", NBSP)}`}`}
        />
        {includeMid && midVsMark !== null ? <Cell label="Mid x mark" tone={toneOf(midVsMark, 0.05)} value={fmtBps(midVsMark)} sub="Livro contra mark" /> : null}
      </dl>
    );
  }

  return (
    <PanelFrame title="Derivativos" subtitle={instrument?.instId ?? d?.instId ?? null} stale={stale} empty={spot || !hasData}>
      <div ref={ref} className={styles.root}>
        {body}
      </div>
    </PanelFrame>
  );
}
