"use client";

/**
 * The on-chain body of the Rastreador (RAS-1 to RAS-4): the tokens of ONE network from the hot list of the OnchainOS gateway, with its three
 * views, its filters and a table. Pure drawing: the container holds the gateway client and the state. Nothing here reads the provider by itself;
 * the person chooses the network, opens the Smart money view or clicks "Ler de novo". Every value the provider did not give is a dash with the
 * reason, and the pressure is the measured ratio with a word that describes it, never an instruction (FLX-10).
 */
import type { ReactNode } from "react";
import {
  ONCHAIN_VIEWS, ONCHAIN_VIEW_ORDER, onchainCells,
  type OnchainFilters, type OnchainRow, type OnchainSort, type OnchainSortKey, type OnchainViewId,
} from "@/lib/rastreador/onchain-model";
import NumberFilter from "./NumberFilter";
import styles from "./RastreadorView.module.css";

export interface OnchainChainOption {
  readonly chainIndex: string;
  readonly name: string;
  readonly enabled: boolean;
  readonly reason: string | null;
}

export type OnchainSignalsState = "unread" | "loading" | "read" | { readonly error: string };

export interface OnchainBodyProps {
  readonly chains: readonly OnchainChainOption[];
  readonly chainIndex: string;
  readonly view: OnchainViewId;
  readonly filters: OnchainFilters;
  readonly sort: OnchainSort;
  readonly status: "idle" | "loading" | "ready" | "error";
  /** The reason of the last failure, already in words. With rows on screen it is a notice; without them it is the whole state. */
  readonly error: string | null;
  readonly errorLink: { readonly href: string; readonly label: string } | null;
  /** The rows to show, already filtered and sorted. */
  readonly rows: readonly OnchainRow[];
  /** The size of the network list before the filters. */
  readonly totalRows: number;
  readonly updatedAtMs: number | null;
  readonly nowMs: number;
  /** The gateway says the answer is older than its time to live. */
  readonly stale: boolean;
  readonly signals: OnchainSignalsState;
  /** When the signals were read, and whether the gateway says they are older than their time to live. */
  readonly signalsAtMs: number | null;
  /** How many records the read really returned. */
  readonly signalsCount: number | null;
  readonly signalsStale: boolean;
  readonly selectedId: string | null;
  /** The panel to ask Inonu about the selected token; null while nothing is selected. */
  readonly askPanel: ReactNode;
  /** A request about the selected token is running: the token and the network cannot change under it. */
  readonly locked: boolean;
  readonly onChain: (chainIndex: string) => void;
  readonly onView: (view: OnchainViewId) => void;
  readonly onFilters: (filters: OnchainFilters) => void;
  readonly onSort: (sort: OnchainSort) => void;
  readonly onSelect: (id: string | null) => void;
  readonly onReload: () => void;
}

function ageText(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  return s < 60 ? `${s} s` : `${Math.round(s / 60)} min`;
}

function gridOf(ids: readonly string[]): string {
  return ids.map((id) => (id === "ativo" ? "minmax(110px, 1.3fr)" : id === "pressao" ? "minmax(236px, 2fr)" : "minmax(84px, 1fr)")).join(" ");
}

function defaultDir(key: OnchainSortKey): OnchainSort["dir"] {
  return key === "ativo" || key === "rank" ? "asc" : "desc";
}

export function OnchainBody(p: OnchainBodyProps) {
  const view = ONCHAIN_VIEWS[p.view];
  const columns = view.columns;
  const template = gridOf(columns.map((c) => c.id));
  const setFilter = (patch: Partial<OnchainFilters>) => p.onFilters({ ...p.filters, ...patch });
  const sortBy = (key: OnchainSortKey) => p.onSort(p.sort.key === key ? { key, dir: p.sort.dir === "asc" ? "desc" : "asc" } : { key, dir: defaultDir(key) });
  const hasRows = p.rows.length > 0;
  const smartOpen = p.view === "smart";

  return (
    <>
      <div className={styles.tabs} role="tablist" aria-label="Visoes on-chain">
        {ONCHAIN_VIEW_ORDER.map((id) => (
          <button key={id} type="button" role="tab" aria-selected={p.view === id} className={styles.tab} onClick={() => p.onView(id)}>
            {ONCHAIN_VIEWS[id].label}
          </button>
        ))}
      </div>

      <section className={styles.askPanel} aria-label="Filtros on-chain">
        <div className={styles.filters}>
          <label className={styles.field}>
            <span>Rede</span>
            <select aria-label="Rede" value={p.chainIndex} disabled={p.locked} onChange={(e) => p.onChain(e.target.value)}>
              {p.chains.map((c) => (
                <option key={c.chainIndex} value={c.chainIndex} disabled={!c.enabled}>
                  {c.enabled || c.reason === null ? c.name : `${c.name}, ${c.reason}`}
                </option>
              ))}
            </select>
          </label>
          <label className={styles.field}>
            <span>Buscar</span>
            <input type="text" aria-label="Buscar token" placeholder="Simbolo ou endereco" value={p.filters.busca} onChange={(e) => setFilter({ busca: e.target.value })} />
          </label>
          <NumberFilter label="Vol USD minimo" ariaLabel="Volume minimo em USD" inputMode="decimal" value={p.filters.volUsdMin} onChange={(volUsdMin) => setFilter({ volUsdMin })} accept={(n) => n >= 0} />
          <NumberFilter label="Liquidez minima" ariaLabel="Liquidez minima em USD" inputMode="decimal" value={p.filters.liquidezMin} onChange={(liquidezMin) => setFilter({ liquidezMin })} accept={(n) => n >= 0} />
          <NumberFilter label="Holders minimos" ariaLabel="Holders minimos" inputMode="numeric" value={p.filters.holdersMin} onChange={(holdersMin) => setFilter({ holdersMin })} accept={(n) => n >= 0} />
          <NumberFilter label="Carteiras minimas" ariaLabel="Carteiras minimas" inputMode="numeric" value={p.filters.carteirasMin} onChange={(carteirasMin) => setFilter({ carteirasMin })} accept={(n) => n >= 0} />
          <NumberFilter label="Var minima" ariaLabel="Variacao minima em 24 horas, em percentual" inputMode="decimal" value={p.filters.varMin} onChange={(varMin) => setFilter({ varMin })} />
          <NumberFilter label="Var maxima" ariaLabel="Variacao maxima em 24 horas, em percentual" inputMode="decimal" value={p.filters.varMax} onChange={(varMax) => setFilter({ varMax })} />
          <NumberFilter label="Risco maximo" ariaLabel="Nivel de risco maximo, de 0 a 5" inputMode="numeric" value={p.filters.riscoMax} onChange={(riscoMax) => setFilter({ riscoMax })} accept={(n) => Number.isInteger(n) && n >= 0 && n <= 5} />
          {/* a new list could take the selected token from under a request that is running */}
          <button type="button" className={styles.button} onClick={p.onReload} disabled={p.status === "loading" || p.locked}>
            Ler de novo
          </button>
        </div>
        <p className={styles.askStatus}>A OKX OnchainOS so e consultada quando voce escolhe a rede, abre a visao Smart money ou clica em Ler de novo.</p>
        {p.signals === "unread" ? <p className={styles.askStatus}>Carteiras minimas: vale depois de ler a visao Smart money.</p> : null}
      </section>

      <p className={styles.status} role="status">
        <span>{`${p.rows.length} de ${p.totalRows} tokens`}</span>
        {p.updatedAtMs !== null ? <span>{`Lido ha ${ageText(p.nowMs - p.updatedAtMs)}, fonte OKX OnchainOS`}</span> : null}
        {p.stale ? <span>Dado velho</span> : null}
        {p.signals === "read" && p.signalsAtMs !== null ? <span>{`Carteiras: ${p.signalsCount ?? 0} registros lidos ha ${ageText(p.nowMs - p.signalsAtMs)} (uma pagina de ate 100, na ordem do provedor)`}</span> : null}
        {p.signals === "read" && p.signalsStale ? <span>Dado velho nos registros de carteiras</span> : null}
      </p>
      {p.status === "loading" ? <p className={styles.notice}>Lendo os tokens da rede escolhida</p> : null}
      {p.error !== null && p.status !== "loading" ? (
        <p className={styles.notice} role="alert">
          {p.error}
          {p.errorLink !== null ? (
            <>
              {" "}
              <a className={styles.navLink} href={p.errorLink.href}>{p.errorLink.label}</a>
            </>
          ) : null}
        </p>
      ) : null}
      {smartOpen && p.signals === "unread" ? <p className={styles.notice}>Os registros de carteiras rastreadas ainda nao foram lidos.</p> : null}
      {smartOpen && p.signals === "loading" ? <p className={styles.notice}>Lendo os registros de carteiras rastreadas da rede</p> : null}
      {smartOpen && typeof p.signals === "object" ? <p className={styles.notice} role="alert">{p.signals.error}</p> : null}

      {p.status !== "idle" && (p.status !== "loading" || hasRows) && (hasRows || p.status === "ready" || p.status === "error") ? (
        <div className={styles.table}>
          <div className={styles.scroller} role="table" aria-label="Tokens" aria-rowcount={p.rows.length + 1}>
            <div role="row" className={`${styles.row} ${styles.head}`} style={{ gridTemplateColumns: template }}>
              {columns.map((c) => (
                <div key={c.id} className={styles.cell} role="columnheader" data-numeric={c.numeric} title={c.tip} aria-sort={c.sortKey === null ? undefined : p.sort.key === c.sortKey ? (p.sort.dir === "asc" ? "ascending" : "descending") : "none"}>
                  {c.sortKey === null ? c.label : <button type="button" className={styles.sort} onClick={() => sortBy(c.sortKey!)}>{c.label}</button>}
                </div>
              ))}
            </div>
            {!hasRows ? (
              // the empty sentence is a statement about what was read: it is made only when something was read and nothing failed
              p.status === "ready" && p.error === null ? <p className={styles.empty}>{p.totalRows === 0 ? "A OKX nao devolveu tokens em alta nesta rede" : "Nenhum token com estes filtros"}</p> : null
            ) : (
              p.rows.map((row, index) => {
                const cells = onchainCells(row);
                return (
                  <div
                    key={row.id}
                    role="row"
                    className={styles.row}
                    data-id={row.id}
                    tabIndex={0}
                    aria-selected={p.selectedId === row.id}
                    aria-rowindex={index + 2}
                    style={{ gridTemplateColumns: template }}
                    onClick={() => (p.locked ? undefined : p.onSelect(p.selectedId === row.id ? null : row.id))}
                    onKeyDown={(e) => {
                      if (e.key !== "Enter" && e.key !== " ") return;
                      e.preventDefault();
                      if (!p.locked) p.onSelect(p.selectedId === row.id ? null : row.id);
                    }}
                  >
                    {columns.map((c) => {
                      const cell = cells[c.id];
                      return (
                        <div key={c.id} className={styles.cell} role="cell" data-numeric={c.numeric} data-tone={cell.tone} title={cell.title}>
                          {c.id === "ativo" ? <span className={styles.symbol}>{cell.text}</span> : cell.text}
                        </div>
                      );
                    })}
                  </div>
                );
              })
            )}
          </div>
        </div>
      ) : null}

      {p.askPanel !== null ? (
        <section className={styles.askPanel} aria-label="Pedir ao Inonu sobre o token escolhido">
          {p.locked ? <p className={styles.askStatus}>Pedido em andamento: a escolha do token e da rede fica travada ate a resposta</p> : null}
          {p.askPanel}
        </section>
      ) : null}

      <p className={styles.footnote}>Clique em uma linha para pedir ao Inonu sobre o token; no teclado, Enter ou espaco escolhe a linha. Clique no titulo da coluna para ordenar. Linhas sem o dado de um filtro ficam de fora.</p>
      <p className={styles.footnote}>Tokens em alta da rede escolhida, pela OKX OnchainOS. Valor de mercado, liquidez e risco sao os da OKX. Carteiras e a soma dos registros: um limite superior, porque a mesma carteira pode aparecer em mais de um.</p>
    </>
  );
}
