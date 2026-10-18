"use client";

import { useMemo } from "react";
import {
  fmtClockSec,
  fmtNumber,
  fmtTimeMs,
  priceDecimals,
  priceDecimalsForMagnitude,
  columnSizeDecimals,
  fmtSizeAt,
} from "@/lib/desk/ui/format";
import { buildTape, tapeRowCount } from "@/lib/desk/ui/tape-model";
import { useElementSize } from "@/lib/desk/ui/useElementSize";
import type { DeskInstrument, DeskTrade } from "@/lib/desk/types";
import { PanelEmpty, PanelFrame } from "./PanelFrame";
import styles from "./TimeAndSales.module.css";

const FALLBACK = { width: 320, height: 420 };

export interface TimeAndSalesProps {
  /** Newest first, as the desk state delivers them. */
  trades: readonly DeskTrade[];
  instrument: DeskInstrument | null;
  stale?: boolean;
  reducedMotion?: boolean;
}

/**
 * The tape: one row per print, newest at the top. A print above three times the median size of the
 * visible window is marked with weight and a tinted row, which is a static style, not an animation.
 * The number of rows follows the height of the panel.
 */
export function TimeAndSales({ trades, instrument, stale = false }: TimeAndSalesProps) {
  const [ref, size] = useElementSize<HTMLDivElement>(FALLBACK);
  const count = tapeRowCount(size.height);
  const rows = useMemo(() => buildTape(trades, count), [trades, count]);
  const hasData = rows.length > 0;

  const pxDec = priceDecimals(instrument?.tickSz, priceDecimalsForMagnitude(rows[0]?.trade.px));
  const szDec = columnSizeDecimals(rows.map((r) => r.trade.sz), instrument?.lotSz);
  const label = `Fita de negocios${instrument ? ` de ${instrument.instId}` : ""}`;
  // In a narrow wing the millisecond stamp does not fit the column: seconds are kept,
  // milliseconds stay out only until the panel grows again.
  const narrowTime = size.width < 245;

  return (
    <PanelFrame title="Fita de negocios" subtitle={instrument?.instId ?? null} stale={stale} empty={!hasData}>
      <div ref={ref} className={styles.root}>
        {hasData ? (
          <div className={styles.table} role="table" aria-label={label}>
            <div className={styles.cols} role="row">
              <span role="columnheader" className={styles.left}>Hora UTC</span>
              <span role="columnheader">Preco</span>
              <span role="columnheader">{narrowTime ? "Tam" : "Tamanho"}</span>
              <span role="columnheader" className={styles.center}>Lado</span>
            </div>
            <div className={styles.rows} role="rowgroup">
              {rows.map(({ trade, large }) => (
                <div
                  key={trade.id}
                  className={styles.row}
                  data-side={trade.side}
                  data-large={large ? "true" : undefined}
                  role="row"
                >
                  <span className={`${styles.time} ${styles.left}`} role="cell">{narrowTime ? fmtClockSec(trade.tsMs) : fmtTimeMs(trade.tsMs)}</span>
                  <span className={styles.px} role="cell">{fmtNumber(trade.px, pxDec)}</span>
                  <span className={styles.sz} role="cell">
                    {fmtSizeAt(trade.sz, szDec)}
                    {large ? <span className="srOnly"> negocio grande</span> : null}
                  </span>
                  <span className={`${styles.side} ${styles.center}`} role="cell">
                    <span aria-hidden="true">{trade.side === "buy" ? "C" : "V"}</span>
                    <span className="srOnly">{trade.side === "buy" ? "Compra" : "Venda"}</span>
                  </span>
                </div>
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
