"use client";

import { useMemo } from "react";
import { setChartDetail } from "@/lib/desk/chart/detail-store";
import { bpsText, costUsdText, marketRead, usdShort, type BookCost, type MarketRead } from "@/lib/desk/market-read";
import type { DeskBook } from "@/lib/desk/types";
import { useInonuLayer } from "@/lib/inonu/useInonuLayer";
import styles from "./MarketCard.module.css";

/**
 * The Mercado tab of the simple desk (MKT): the raw market (tape, book, liquidity) is what the machine reads; what a person needs from it is one card. What it costs to move an
 * amount through the book right now, how thick the market is, where the big queues wait near the price, and whether the cost the Inonu counted in its plan holds. It describes and
 * never says what to do; the tape, the book and the liquidity stay one click away, in the complete desk. It reads the book the page already holds: no call, no model.
 */

const sizeLabel = (c: BookCost): string => usdShort(c.sizeUsd);
const costOf = (bps: number | null): string => (bps === null ? "alem do livro" : bpsText(bps));

export interface MarketCardViewProps {
  readonly instId: string;
  readonly read: MarketRead;
  /** Where the data comes from and how old it is, or null when there is nothing to say. */
  readonly source: string | null;
  readonly onDetails: () => void;
}

export function MarketCardView({ instId, read, source, onDetails }: MarketCardViewProps) {
  return (
    <section className={styles.root} aria-label="Custo para negociar agora">
      <header className={styles.head}>
        <h3 className={styles.title}>Custo para negociar agora</h3>
        <span className={styles.subtitle}>{instId}</span>
        {read.state === "ok" ? (
          <span className={styles.pill} data-thickness={read.thickness}>
            {`Mercado ${read.thickness}`}
          </span>
        ) : null}
      </header>

      {read.state !== "ok" ? (
        <p className={styles.empty} role="status">
          {read.reason}
        </p>
      ) : (
        <div className={styles.body}>
          <div className={styles.left}>
          <p className={styles.headline}>{read.thicknessText}</p>

          <div className={styles.table} role="table" aria-label="Custo por quantia">
            <div className={`${styles.row} ${styles.headRow}`} role="row">
              {["Quantia", "Custo da ida e volta", "Em dolares"].map((label) => (
                <span key={label} className={styles.cell} role="columnheader">
                  {label}
                </span>
              ))}
            </div>
            {read.rows.map((row) => (
              <div key={row.sizeUsd} className={styles.row} role="row">
                <span className={styles.cell} role="rowheader">
                  {sizeLabel(row)}
                </span>
                <span className={`${styles.cell} ${styles.total}`} role="cell">
                  {costOf(row.roundTripBps)}
                </span>
                <span className={styles.cell} role="cell">
                  {row.roundTripBps === null ? "alem do livro" : costUsdText(row.sizeUsd, row.roundTripBps)}
                </span>
              </div>
            ))}
          </div>
          </div>

          <div className={styles.right}>
          {read.walls.length === 0 ? null : (
            <ul className={styles.walls} aria-label="Filas grandes perto do preco">
              {read.walls.map((wall) => (
                <li key={wall.side} data-side={wall.side}>
                  {wall.text}
                </li>
              ))}
            </ul>
          )}

          {read.vsPlan === null ? null : (
            <p className={styles.plan} data-kind={read.vsPlan.kind}>
              {read.vsPlan.text}
            </p>
          )}

          <p className={styles.note}>{read.note}</p>
          </div>
        </div>
      )}

      <footer className={styles.foot}>
        {source === null ? <span /> : <span className={styles.source}>{source}</span>}
        <button type="button" className={styles.details} onClick={onDetails}>
          Ver fita, livro e liquidez
        </button>
      </footer>
    </section>
  );
}

export interface MarketCardProps {
  readonly instId: string;
  readonly book: DeskBook | null;
  /** What one unit of book size is worth in the quote currency: 1 for spot, null for a contract. */
  readonly quoteMultiplier: number | null;
  readonly stale: boolean;
  /** The exchange's clock, the one the timestamp of the book is counted against. */
  readonly exchangeNowMs: number;
  readonly source: string | null;
}

export default function MarketCard({ instId, book, quoteMultiplier, stale, exchangeNowMs, source }: MarketCardProps) {
  // the plan the Inonu left for this instrument, read from the same saved answers as the chart and the thermometer (one poll for the page); nothing here asks the model
  const { layer } = useInonuLayer(instId, true, true);
  const plano = layer?.decision?.veredito?.plano ?? null;
  const plan = useMemo(() => (plano === null ? null : { custoBps: plano.custoBps, notionalUsd: plano.tamanho?.notionalUsd ?? null }), [plano]);
  // the book changes many times a second: the reading is made again as often, from the book already in memory
  const read = useMemo(() => marketRead({ book, quoteMultiplier, nowMs: exchangeNowMs, stale, plan }), [book, quoteMultiplier, exchangeNowMs, stale, plan]);
  return <MarketCardView instId={instId} read={read} source={source} onDetails={() => setChartDetail("completo")} />;
}
