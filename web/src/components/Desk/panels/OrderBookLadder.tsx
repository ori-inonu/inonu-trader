"use client";

import { type CSSProperties, useMemo } from "react";
import { buildLadder, type LadderRow, rowsPerSide, topOfBook } from "@/lib/desk/ui/book-model";
import {
  fmtBpsPlain,
  fmtNumber,
  fmtShare,
  priceDecimals,
  priceDecimalsForMagnitude,
  columnSizeDecimals,
  fmtSizeAt,
  UNAVAILABLE,
} from "@/lib/desk/ui/format";
import { useElementSize } from "@/lib/desk/ui/useElementSize";
import type { DeskBook, DeskInstrument, DeskMetrics } from "@/lib/desk/types";
import { PanelEmpty, PanelFrame } from "./PanelFrame";
import styles from "./OrderBookLadder.module.css";

/** What the server and the first paint assume before the panel has been measured. */
const FALLBACK = { width: 320, height: 420 };

export interface OrderBookLadderProps {
  book: DeskBook | null;
  instrument: DeskInstrument | null;
  metrics: DeskMetrics;
  stale?: boolean;
  reducedMotion?: boolean;
}

interface RowProps {
  side: "ask" | "bid";
  row: LadderRow;
  top: boolean;
  pxDec: number;
  szDec: number;
  cumDec: number;
}

function LadderLine({ side, row, top, pxDec, szDec, cumDec }: RowProps) {
  const style = { "--w": row.ratio.toFixed(4), "--a": `${Math.round(row.alpha * 100)}%` } as CSSProperties;
  return (
    <div className={styles.row} data-side={side} data-top={top ? "true" : undefined} data-wall={row.ratio >= 0.6 ? "true" : undefined} role="row" style={style}>
      <span className={styles.heat} aria-hidden="true" />
      <span className={styles.px} role="cell">{fmtNumber(row.px, pxDec)}</span>
      <span className={styles.sz} role="cell">{fmtSizeAt(row.sz, szDec)}</span>
      <span className={styles.cum} role="cell">{fmtSizeAt(row.cum, cumDec)}</span>
    </div>
  );
}

function ImbalanceBar({ share }: { share: number | null }) {
  const known = share !== null && Number.isFinite(share);
  const bid = known ? Math.min(1, Math.max(0, share)) : 0.5;
  const label = known
    ? `Desequilibrio de profundidade a 10 bps: ${fmtShare(bid)} compra, ${fmtShare(1 - bid)} venda`
    : "Desequilibrio de profundidade indisponivel";
  return (
    <div className={styles.imb} role="img" aria-label={label}>
      <div className={styles.imbLabels} aria-hidden="true">
        <span className={styles.imbBuy}>{known ? `Compra ${fmtShare(bid)}` : UNAVAILABLE}</span>
        <span className={styles.imbTitle}>Profundidade 10 bps</span>
        <span className={styles.imbSell}>{known ? `${fmtShare(1 - bid)} Venda` : ""}</span>
      </div>
      <div className={styles.imbTrack} data-known={known ? "true" : "false"} aria-hidden="true">
        <span className={styles.imbFill} style={{ width: `${(bid * 100).toFixed(2)}%` }} />
      </div>
    </div>
  );
}

/**
 * Vertical ladder of the resting book. Asks sit above the spread row and bids below it, each row
 * carries price, size and the running total, and a heat bar behind it shows the size against the
 * largest visible level. Rows adapt to the height of the panel. Nothing here blinks: a changed
 * value only eases its heat bar for a moment.
 */
export function OrderBookLadder({ book, instrument, metrics, stale = false, reducedMotion = false }: OrderBookLadderProps) {
  const [ref, size] = useElementSize<HTMLDivElement>(FALLBACK);
  const perSide = rowsPerSide(size.height);
  const model = useMemo(() => buildLadder(book, perSide), [book, perSide]);
  const hasData = model.asks.length > 0 || model.bids.length > 0;

  const top = useMemo(() => topOfBook(book), [book]);
  const mid = metrics.midPx ?? top?.mid ?? null;
  const spreadBps = metrics.spreadBps ?? top?.spreadBps ?? null;
  const anchor = model.bestBid ?? model.bestAsk;
  const pxDec = priceDecimals(instrument?.tickSz, priceDecimalsForMagnitude(anchor));
  const lotSz = instrument?.lotSz;
  const szDec = columnSizeDecimals([...model.asks, ...model.bids].map((r) => r.sz), lotSz);
  const cumDec = columnSizeDecimals([...model.asks, ...model.bids].map((r) => r.cum), lotSz);
  const crossed = spreadBps !== null && spreadBps < 0;

  const asksFarFirst = useMemo(() => [...model.asks].reverse(), [model.asks]);
  const label = `Livro de ofertas${instrument ? ` de ${instrument.instId}` : ""}`;

  return (
    <PanelFrame title="Livro de ofertas" subtitle={instrument?.instId ?? book?.instId ?? null} stale={stale} empty={!hasData}>
      <div ref={ref} className={`${styles.root} ${reducedMotion ? styles.still : ""}`}>
        {hasData ? (
          <div className={styles.table} role="table" aria-label={label}>
            <ImbalanceBar share={metrics.depthBidShare10bps} />
            <div className={styles.cols} role="row">
              <span role="columnheader">Preco</span>
              <span role="columnheader">Tamanho</span>
              <span role="columnheader">Acumulado</span>
            </div>
            <div className={styles.side} data-side="ask" role="rowgroup" aria-label="Ofertas de venda">
              {asksFarFirst.map((row, i) => (
                <LadderLine key={`a${i}`} side="ask" row={row} top={i === asksFarFirst.length - 1} pxDec={pxDec} szDec={szDec} cumDec={cumDec} />
              ))}
            </div>
            <div className={styles.spread} role="row" data-crossed={crossed ? "true" : undefined}>
              <span className={styles.spreadCell} role="cell">
                <span className={styles.micro}>Spread</span>
                <span className={styles.spreadValue}>{crossed ? "Cruzado" : fmtBpsPlain(spreadBps, spreadBps !== null && spreadBps < 1 ? 2 : 1)}</span>
              </span>
              <span className={styles.mid} role="cell" aria-label={`Preco medio ${fmtNumber(mid, pxDec)}`}>
                {fmtNumber(mid, pxDec)}
              </span>
              <span className={`${styles.spreadCell} ${styles.spreadRight}`} role="cell">
                <span className={styles.micro}>Micro</span>
                <span className={styles.spreadValue}>{fmtNumber(metrics.microPx, pxDec)}</span>
              </span>
            </div>
            <div className={styles.side} data-side="bid" role="rowgroup" aria-label="Ofertas de compra">
              {model.bids.map((row, i) => (
                <LadderLine key={`b${i}`} side="bid" row={row} top={i === 0} pxDec={pxDec} szDec={szDec} cumDec={cumDec} />
              ))}
            </div>
          </div>
        ) : (
          <PanelEmpty />
        )}
      </div>
    </PanelFrame>
  );
}
