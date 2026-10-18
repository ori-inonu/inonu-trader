"use client";

import { type CSSProperties, type ReactNode, useMemo } from "react";
import { buildLadder } from "@/lib/desk/ui/book-model";
import {
  AWAITING,
  fmtBpsPlain,
  fmtCompact,
  fmtNumber,
  fmtShare,
  fmtSizeAt,
  fmtTimeMs,
  priceDecimals,
  priceDecimalsForMagnitude,
  columnSizeDecimals,
  UNAVAILABLE,
} from "@/lib/desk/ui/format";
import { buildTape } from "@/lib/desk/ui/tape-model";
import type { DeskBook, DeskInstrument, DeskMetrics, DeskTrade } from "@/lib/desk/types";
import type { UseOkxWalletResult } from "@/lib/useOkxWallet";
import type { CapabilityRow, JournalRow } from "@/lib/mesa/mesa-model";
import { CapabilityModule, JournalModule, WalletModule } from "../DeskDock";
import styles from "./DockTabs.module.css";

/** The dock keeps at most this many prints in the tape tab. */
const TAPE_MAX_ROWS = 100;
/** Levels of the resting book shown on each side of the book tab. */
const BOOK_LEVELS = 15;

function Empty({ children = AWAITING }: { children?: React.ReactNode }) {
  return (
    <div className={styles.empty} role="status">
      {children}
    </div>
  );
}

/**
 * The tape as a wide table: fixed column header, internal scroll, the value of each print in
 * quote currency and the taker side with colour and word, never colour alone. A print above
 * three times the median of the visible window is marked with weight, the same rule as before.
 */
export function DockTape({ trades, instrument, stale = false, note = null }: { trades: readonly DeskTrade[]; instrument: DeskInstrument | null; stale?: boolean; note?: string | null }) {
  const rows = useMemo(() => buildTape(trades, TAPE_MAX_ROWS), [trades]);
  const noteEl = note !== null ? <p className={styles.note} role="note">{note}</p> : null;
  if (rows.length === 0) return <>{noteEl}<Empty /></>;
  const pxDec = priceDecimals(instrument?.tickSz, priceDecimalsForMagnitude(rows[0]?.trade.px));
  const szDec = columnSizeDecimals(rows.map((r) => r.trade.sz), instrument?.lotSz);
  return (
    <>
      {noteEl}
      <div className={styles.fill} data-stale={stale ? "true" : undefined}>
      <div className={styles.table} role="table" aria-label={`Fita de negocios${instrument ? ` de ${instrument.instId}` : ""}`}>
        <div className={styles.scroll} role="rowgroup">
          <div className={`${styles.trow} ${styles.thead}`} role="row">
            <span role="columnheader" className={styles.cellTime}>Hora UTC</span>
            <span role="columnheader">Preco</span>
            <span role="columnheader">Tamanho</span>
            <span role="columnheader">Valor</span>
            <span role="columnheader" className={styles.cellSide}>Lado</span>
          </div>
          {rows.map(({ trade, large }) => (
            <div key={trade.id} className={styles.trow} role="row" data-side={trade.side} data-large={large ? "true" : undefined}>
              <span role="cell" className={styles.cellTime}>{fmtTimeMs(trade.tsMs)}</span>
              <span role="cell">{fmtNumber(trade.px, pxDec)}</span>
              <span role="cell">
                {fmtSizeAt(trade.sz, szDec)}
                {large ? <span className="srOnly"> negocio grande</span> : null}
              </span>
              <span role="cell">{fmtCompact(trade.px * trade.sz)}</span>
              <span role="cell" className={styles.cellSide}>
                <span className={styles.sideLetter} aria-hidden="true">{trade.side === "buy" ? "C" : "V"}</span>
                <span className={styles.sideWord}>{trade.side === "buy" ? "Compra" : "Venda"}</span>
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
    </>
  );
}

interface DockBookRowProps {
  side: "ask" | "bid";
  row: { px: number; sz: number; cum: number };
  cumMax: number;
  pxDec: number;
  szDec: number;
  cumDec: number;
}

function DockBookLine({ side, row, cumMax, pxDec, szDec, cumDec }: DockBookRowProps) {
  const ratio = cumMax > 0 ? Math.min(1, row.cum / cumMax) : 0;
  return (
    <div className={styles.brow} role="row" data-side={side} style={{ "--d": ratio.toFixed(4) } as CSSProperties}>
      <span className={styles.depth} aria-hidden="true" />
      <span role="cell">{fmtNumber(row.px, pxDec)}</span>
      <span role="cell">{fmtSizeAt(row.sz, szDec)}</span>
      <span role="cell">{fmtSizeAt(row.cum, cumDec)}</span>
    </div>
  );
}

function DockBookSide({ side, rows, cumMax, pxDec, szDec, cumDec }: { side: "ask" | "bid"; rows: readonly { px: number; sz: number; cum: number }[]; cumMax: number; pxDec: number; szDec: number; cumDec: number }) {
  return (
    <div className={styles.bside} role="rowgroup" aria-label={side === "bid" ? "Ofertas de compra" : "Ofertas de venda"}>
      <div className={styles.scroll}>
        <div className={`${styles.brow} ${styles.bhead}`} role="row">
          <span role="columnheader">Preco</span>
          <span role="columnheader">Tamanho</span>
          <span role="columnheader">Acumulado</span>
        </div>
        {rows.map((row, i) => (
          <DockBookLine key={`${side}${i}`} side={side} row={row} cumMax={cumMax} pxDec={pxDec} szDec={szDec} cumDec={cumDec} />
        ))}
      </div>
    </div>
  );
}

/**
 * The resting book as two columns of levels: bids on the left, asks on the right, each with a
 * depth bar grown by the running total. The header carries mid price, spread and imbalance.
 */
export function DockBook({ book, instrument, metrics, stale = false, note = null }: { book: DeskBook | null; instrument: DeskInstrument | null; metrics: DeskMetrics; stale?: boolean; note?: string | null }) {
  const model = useMemo(() => buildLadder(book, BOOK_LEVELS), [book]);
  const hasData = model.asks.length > 0 || model.bids.length > 0;
  const anchor = model.bestBid ?? model.bestAsk;
  const pxDec = priceDecimals(instrument?.tickSz, priceDecimalsForMagnitude(anchor));
  const szDec = columnSizeDecimals([...model.asks, ...model.bids].map((r) => r.sz), instrument?.lotSz);
  const cumDec = columnSizeDecimals([...model.asks, ...model.bids].map((r) => r.cum), instrument?.lotSz);
  const cumBid = model.bids.length ? model.bids[model.bids.length - 1].cum : 0;
  const cumAsk = model.asks.length ? model.asks[model.asks.length - 1].cum : 0;
  const mid = metrics.midPx ?? null;
  const spreadBps = metrics.spreadBps ?? null;
  const share = metrics.depthBidShare10bps;
  const imbKnown = share !== null && Number.isFinite(share);
  const noteEl = note !== null ? <p className={styles.note} role="note">{note}</p> : null;
  if (!hasData) return <>{noteEl}<Empty /></>;
  return (
    <>
      {noteEl}
    <div className={styles.fill} data-stale={stale ? "true" : undefined}>
      <div className={styles.bookHead}>
        <span className={styles.bookStat}>
          <span className={styles.micro}>Preco medio</span> {fmtNumber(mid, pxDec)}
        </span>
        <span className={styles.bookStat}>
          <span className={styles.micro}>Spread</span> {spreadBps !== null && spreadBps < 0 ? "Cruzado" : fmtBpsPlain(spreadBps)}
        </span>
        <span className={styles.bookStat}>
          <span className={styles.micro}>Desequilibrio 10 bps</span>{" "}
          {imbKnown ? `${fmtShare(share)} compra, ${fmtShare(1 - share)} venda` : UNAVAILABLE}
        </span>
      </div>
      <div className={styles.bookCols} role="table" aria-label={`Livro de ofertas${instrument ? ` de ${instrument.instId}` : ""}`}>
        <DockBookSide side="bid" rows={model.bids} cumMax={cumBid} pxDec={pxDec} szDec={szDec} cumDec={cumDec} />
        <DockBookSide side="ask" rows={model.asks} cumMax={cumAsk} pxDec={pxDec} szDec={szDec} cumDec={cumDec} />
      </div>
    </div>
    </>
  );
}

/**
 * The wallet tab: the OKX Wallet module of the browser next to the honest state of the Agentic
 * Wallet, which only the owner signs into through the onchainos CLI. The desk stores no token.
 */
export function DockWallet({ wallet }: { wallet: UseOkxWalletResult }) {
  return (
    <div className={`${styles.fill} ${styles.walletGrid}`}>
      <WalletModule wallet={wallet} />
      <section className={styles.module} aria-label="Agentic Wallet">
        <header className={styles.moduleHead}>
          <h3>Agentic Wallet</h3>
          <span className={styles.badge}>Nao conectada</span>
        </header>
        <p className={styles.line}>Nao conectada. O login e feito pelo dono, no CLI onchainos, e a mesa nao guarda token nem chave.</p>
        <p className={styles.muted}>Documentacao: web3.okx.com/onchainos</p>
      </section>
    </div>
  );
}

/** The Jev journal as a wide table, newest first, clearly marked advisory. */
export function DockJournal({ rows }: { rows: readonly JournalRow[] }) {
  return (
    <div className={styles.fill}>
      <div className={styles.journalBar}>
        <span className={styles.badge}>Consultivo</span>
        <span className={styles.muted}>O Inonu decide; a mesa so registra o que ele leu.</span>
      </div>
      {rows.length === 0 ? (
        <Empty>Nenhuma leitura do Inonu ainda</Empty>
      ) : (
        <div className={styles.table} role="table" aria-label="Diario de decisoes do Inonu">
          <div className={styles.scroll} role="rowgroup">
            <div className={`${styles.jrow} ${styles.thead}`} role="row">
              <span role="columnheader" className={styles.cellTime}>Hora</span>
              <span role="columnheader">Ativo</span>
              <span role="columnheader">Acao</span>
              <span role="columnheader">Peso</span>
            </div>
            {rows.map((row) => (
              <div key={row.id} className={styles.jrow} role="row" data-tone={row.tone}>
                <span role="cell" className={styles.cellTime}>{row.time}</span>
                <span role="cell" className={styles.jinst}>{row.inst}</span>
                <span role="cell" className={styles.jaction}>{row.action}</span>
                <span role="cell">{row.weight}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/** The capability matrix in several columns, the same rows the old dock module showed. */
export function DockEcosystem({ rows, top = null }: { rows: readonly CapabilityRow[]; top?: ReactNode }) {
  return (
    <div className={`${styles.fill} ${styles.eco}`}>
      {top}
      <CapabilityModule rows={rows} wide />
    </div>
  );
}
