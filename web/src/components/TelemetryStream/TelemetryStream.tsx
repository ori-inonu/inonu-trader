"use client";

import { memo, useEffect, useId, useRef, useState } from "react";
import type { BlockEvent, ConnectionState } from "@/lib/types";
import { filterFeedEvents, type FeedSideFilter, type FeedTypeFilter } from "@/lib/presentation";
import { fmtInt, fmtPrice, shortTx, txUrl } from "@/lib/format";
import { feedFrameState } from "@/lib/feed-frame";
import { telemetryEmptyMessage, telemetryStaggerDelay } from "@/lib/telemetry-state";
import styles from "./TelemetryStream.module.css";

/** Must match the row block-size in TelemetryStream.module.css: calc(var(--s9) + var(--s5)). */
const ROW_H = 76;
const MAX_ROWS = 40;
/** The first row is the newest one. It carries the marker; nothing animates to signal it. */
const NEWEST = "mais recente";

type Kind = "buy" | "sell" | "hold" | "late" | "waiting";

const KIND_LABEL: Record<Kind, string> = {
  buy: "Compra",
  sell: "Venda",
  hold: "Manter",
  late: "Resposta tardia",
  waiting: "Sem decisão",
};

function kindOf(event: BlockEvent): Kind {
  if (!event.decision) return "waiting";
  if (event.decision.late) return "late";
  return event.decision.action;
}

function fmtSize(size: number): string {
  return Number.isFinite(size) ? size.toLocaleString("en-US", { maximumFractionDigits: 2 }) : "Indisponível";
}

function orderStatus(status: NonNullable<BlockEvent["quote"]>["status"]): string {
  switch (status) {
    case "sent": return "Pendente";
    case "placed": return "Registrada";
    case "reverted": return "Revertida";
    case "lost": return "Sem confirmação";
    case "sim": return "Simulado";
  }
}

export interface TelemetryStreamProps {
  events: BlockEvent[];
  connection: ConnectionState;
  capacity?: number;
  reducedMotion?: boolean;
}

/**
 * Restyled successor to Feed.
 * Side filter, type filter, filterFeedEvents, the ResizeObserver capacity measurement and both
 * empty-state strings are carried over unchanged. Only the presentation differs: a two-line entry
 * with a tone rail instead of coloured text.
 */
function TelemetryStreamView({ events, connection, capacity: capacityProp, reducedMotion = false }: TelemetryStreamProps) {
  const listRef = useRef<HTMLDivElement | null>(null);
  const sideId = useId();
  const typeId = useId();
  const [measured, setMeasured] = useState<number | null>(null);
  const [sideFilter, setSideFilter] = useState<FeedSideFilter>("all");
  const [typeFilter, setTypeFilter] = useState<FeedTypeFilter>("all");

  useEffect(() => {
    const element = listRef.current;
    if (!element) return;
    const measure = () => {
      const fits = Math.max(1, Math.min(MAX_ROWS, Math.floor(element.clientHeight / ROW_H)));
      setMeasured((previous) => (previous === fits ? previous : fits));
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const capacity = capacityProp ?? measured ?? MAX_ROWS;
  const filtered = filterFeedEvents(events, sideFilter, typeFilter);
  const rows = filtered.slice(-capacity).reverse();
  const emptyMessage = telemetryEmptyMessage(events.length, sideFilter, typeFilter);
  const frame = feedFrameState(connection);
  const stale = frame.held;

  return (
    <section className={`${styles.stream} ${stale ? styles.stale : ""}`} aria-labelledby="stream-title">
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>TELEMETRIA</p>
          <h2 className={styles.title} id="stream-title">Fluxo de eventos</h2>
        </div>
        <span className={styles.count}>{filtered.length} encontrados</span>
      </header>

      <div className={styles.filters}>
        <label className={styles.filter} htmlFor={sideId}>
          <span>Lado</span>
          <select id={sideId} value={sideFilter} onChange={(event) => setSideFilter(event.target.value as FeedSideFilter)}>
            <option value="all">Todos</option>
            <option value="buy">Compra</option>
            <option value="sell">Venda</option>
            <option value="hold">Manter</option>
          </select>
        </label>
        <label className={styles.filter} htmlFor={typeId}>
          <span>Tipo</span>
          <select id={typeId} value={typeFilter} onChange={(event) => setTypeFilter(event.target.value as FeedTypeFilter)}>
            <option value="all">Todos</option>
            <option value="orders">Ordens</option>
            <option value="fills">Execuções</option>
          </select>
        </label>
      </div>

      {filtered.length > rows.length ? (
        <p className={styles.range}>Exibindo os {rows.length} eventos mais recentes de {filtered.length} correspondências.</p>
      ) : null}

      {rows.length === 0 ? <p className={styles.empty}>{emptyMessage}</p> : null}

      <div className={styles.list} ref={listRef} role="list" aria-label="Eventos do feed">
        {rows.map((event, index) => {
          const kind = kindOf(event);
          const decision = event.decision;
          const quote = event.quote;
          const fill = event.fill;
          const detail = fill
            ? `${fill.simulated ? "Simulado" : "Execução informada"}: ${fmtSize(fill.size)} @ ${fmtPrice(fill.price)}`
            : quote
              ? `${quote.side === "buy" ? "Compra" : "Venda"} ${fmtSize(quote.size)} @ ${fmtPrice(quote.price)}${quote.capped ? " com limite" : ""}`
              : "Sem ordem ou execução informada";
          const status = fill?.simulated || quote?.status === "sim"
            ? "Simulado"
            : quote
              ? orderStatus(quote.status)
              : null;
          const txHash = fill && !fill.simulated ? fill.txHash : quote && quote.status !== "sim" ? quote.txHash : null;
          const latency = decision && !decision.late && Number.isFinite(decision.latencyMs)
            ? `${Math.round(decision.latencyMs)} ms`
            : "Indisponível";

          return (
            <article
              className={`${styles.row} ${styles[kind]} ${index === 0 ? styles.newest : ""}`}
              key={event.block}
              role="listitem"
              style={reducedMotion ? undefined : { animationDelay: `${telemetryStaggerDelay(index)}ms` }}
            >
              <div className={styles.rowTop}>
                <span className={styles.block}>[{fmtInt(event.block)}]</span>
                <span className={styles.kind}>{KIND_LABEL[kind]}</span>
                {index === 0 ? <span className={styles.newestTag}>{NEWEST}</span> : null}
                <span className={styles.latency}>{latency}</span>
              </div>
              <div className={styles.rowBottom}>
                <span className={styles.detail}>{detail}</span>
                {status ? <span className={styles.status}>{status}</span> : null}
                {txHash ? (
                  <a className={styles.tx} href={txUrl(txHash)} target="_blank" rel="noreferrer" aria-label={`Abrir transação ${txHash}`}>
                    {shortTx(txHash)}
                  </a>
                ) : null}
              </div>
            </article>
          );
        })}
      </div>

      {frame.notice ? <span className={styles.staleChip}>{frame.notice}</span> : null}
    </section>
  );
}

export default memo(TelemetryStreamView);
export { TelemetryStreamView };