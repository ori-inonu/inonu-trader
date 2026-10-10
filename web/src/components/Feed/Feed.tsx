"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { BlockEvent } from "@/lib/types";
import { filterFeedEvents, type FeedSideFilter, type FeedTypeFilter } from "@/lib/presentation";
import { fmtInt, fmtPrice, shortTx, txUrl } from "@/lib/format";
import styles from "./Feed.module.css";

const ROW_H = 72;
const MAX_ROWS = 40;

type Kind = "buy" | "sell" | "hold" | "late" | "waiting";

function kindOf(event: BlockEvent): Kind {
  const decision = event.decision;
  if (!decision) return "waiting";
  if (decision.late) return "late";
  return decision.action;
}

const KIND_LABEL: Record<Kind, string> = {
  buy: "Compra",
  sell: "Venda",
  hold: "Manter",
  late: "Resposta tardia",
  waiting: "Sem decisão",
};

function fmtSize(size: number): string {
  return Number.isFinite(size) ? size.toLocaleString("en-US", { maximumFractionDigits: 2 }) : "Indisponível";
}

function confidence(event: BlockEvent): string {
  const probabilities = event.decision?.probabilities;
  if (!probabilities) return "Indisponível";
  const values = [probabilities.buy, probabilities.sell, probabilities.hold];
  if (values.some((value) => !Number.isFinite(value) || value < 0 || value > 1)) return "Indisponível";
  return `${Math.round(Math.max(...values) * 100)}%`;
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

export default function Feed({ events }: { events: BlockEvent[] }) {
  const listRef = useRef<HTMLDivElement | null>(null);
  const sideId = useId();
  const typeId = useId();
  const [capacity, setCapacity] = useState(MAX_ROWS);
  const [sideFilter, setSideFilter] = useState<FeedSideFilter>("all");
  const [typeFilter, setTypeFilter] = useState<FeedTypeFilter>("all");

  useEffect(() => {
    const element = listRef.current;
    if (!element) return;
    const measure = () => {
      const fits = Math.max(1, Math.min(MAX_ROWS, Math.floor(element.clientHeight / ROW_H)));
      setCapacity((previous) => (previous === fits ? previous : fits));
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const filtered = filterFeedEvents(events, sideFilter, typeFilter);
  const rows = filtered.slice(-capacity).reverse();
  const defaultSelection = sideFilter === "all" && typeFilter === "all";
  const emptyMessage = events.length === 0 && defaultSelection
    ? "Aguardando dados do feed"
    : "Nenhum evento para estes filtros";

  return (
    <section className={styles.feed} aria-labelledby="feed-title">
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>ATIVIDADE</p>
          <h2 id="feed-title" className={styles.title}>Feed de eventos</h2>
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

      <div className={styles.list} ref={listRef} role="list" aria-label="Eventos do feed">
        {rows.length === 0 ? (
          <p className={styles.empty}>{emptyMessage}</p>
        ) : rows.map((event) => {
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

          return (
            <article className={`${styles.row} ${styles[kind]}`} key={event.block} role="listitem">
              <div className={styles.rowTop}>
                <span className={styles.block}>Bloco {fmtInt(event.block)}</span>
                <span className={styles.kind}>{KIND_LABEL[kind]}</span>
                <span className={styles.meta}>
                  {decision ? `Confiança ${confidence(event)}` : "Confiança indisponível"}
                  {decision && !decision.late && Number.isFinite(decision.latencyMs) ? `, ${Math.round(decision.latencyMs)} ms` : ""}
                </span>
              </div>
              <div className={styles.rowBottom}>
                <span className={styles.detail}>{detail}</span>
                {status ? <span className={styles.status}>{status}</span> : null}
                {txHash ? (
                  <a href={txUrl(txHash)} target="_blank" rel="noreferrer" aria-label={`Abrir transação ${txHash}`}>
                    {shortTx(txHash)}
                  </a>
                ) : null}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
