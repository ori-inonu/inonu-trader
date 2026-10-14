"use client";

/**
 * The Rastreador (RAS-1 to RAS-4): a table of the exchange's own pairs (USDT spot and USDT perpetuals) with five views, filters,
 * a sort, saved screens and the keys of a trading screen. Everything here works with no model call. The pressure of the flow
 * and the change of the last hours are measured only for the rows in the window the person is looking at. The drawing part,
 * `RastreadorScreen`, is pure so each state is rendered in tests without a network; the default export holds the hooks.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { AssetIcon } from "@/components/Desk/AssetIcon";
import InonuAsk from "@/components/Desk/InonuAsk";
import { subjectKey } from "@/lib/inonu/ask-target";
import { createOkxRest } from "@/lib/desk/okx-rest";
import { createContractReader } from "@/lib/rastreador/contracts";
import { createInonuClient, type AskAnswer, type AskFilter } from "@/lib/inonu/client";
import { costLine, motivoText } from "@/lib/inonu/view";
import { DESK_DEFAULT_WATCHLIST } from "@/lib/desk/types";
import { useWatchPins } from "@/lib/mesa/watch-pins";
import { applyChips, chipsOf, type ChipId } from "@/lib/rastreador/ask";
import { cellsFor, type CellContext, type CellId } from "@/lib/rastreador/cells";
import { CHOOSE_MAX, chosenIds, chosenLine, rankingSubjectOf, toggleChosen } from "@/lib/rastreador/choose";
import { DEFAULT_UNIVERSE, enterUniverse, loadUniverse, saveUniverse, type Universe, type UniverseState } from "@/lib/rastreador/onchain-state";
import { applyOnchainFilters, buildOnchainRows, sortOnchain } from "@/lib/rastreador/onchain-model";
import { chainChips } from "@/lib/onchain/chains";
import { createOnchainClient } from "@/lib/onchain/client";
import { useOnchainResource } from "@/lib/onchain/useOnchainResource";
import { onchainErrorText } from "@/lib/mesa/onchain-rows";
import NumberFilter from "./NumberFilter";
import { OnchainBody, type OnchainChainOption, type OnchainSignalsState } from "./OnchainBody";
import { createFlowReader } from "@/lib/rastreador/flow";
import { EMPTY_MEASURES, createMeasureLoop, type MeasureLoop, type MeasureState } from "@/lib/rastreador/measures";
import {
  VIEWS, VIEW_ORDER, applyFilters, buildRows, sortRows,
  type Column, type Filters, type Measures, type RastreadorRow, type Sort, type SortKey, type ViewId,
} from "@/lib/rastreador/model";
import { createPerformanceReader } from "@/lib/rastreador/performance";
import { openUrl } from "@/lib/rastreador/open";
import { loadScreens, loadWork, removeScreen, saveScreens, saveWork, upsertScreen, type Screen, type WorkState } from "@/lib/rastreador/screens";
import styles from "./RastreadorView.module.css";

const ROW_H = 30;
const OVERSCAN = 6;
const WINDOW_MAX = 30;
const ON_CHAIN_ONLY = "So para tokens on-chain";

/** The state of "Perguntar ao Inonu": the sentence, then the filter the model chose as chips the person can take off. */
export type AskPanelState =
  | { readonly phase: "idle"; readonly text: string }
  | { readonly phase: "asking"; readonly text: string }
  | { readonly phase: "proposal"; readonly text: string; readonly filtro: AskFilter; readonly keep: readonly ChipId[]; readonly modelo: string; readonly custo: AskAnswer["custo"]; readonly reutilizado: boolean }
  | { readonly phase: "failed"; readonly text: string; readonly motivo: string };

export interface RastreadorScreenProps {
  readonly status: "loading" | "ready" | "error";
  /** Why the last load failed. With rows on screen it is a notice; without them it is the whole state. */
  readonly error: string | null;
  /** The list that did not arrive, when the other one did. */
  readonly partial: "spot" | "perp" | null;
  readonly updatedAtMs: number | null;
  readonly nowMs: number;
  /** The size of the universe before the filters. */
  readonly totalRows: number;
  /** The rows to show, already filtered and sorted. */
  readonly rows: readonly RastreadorRow[];
  readonly view: ViewId;
  readonly filters: Filters;
  readonly sort: Sort;
  readonly cellContext: CellContext;
  readonly pins: ReadonlySet<string>;
  /** Pins that cannot be removed (the desk's default list). */
  readonly lockedPins: ReadonlySet<string>;
  readonly screens: readonly Screen[];
  readonly selectedId: string | null;
  /** The ids ticked to be ranked together by Inonu (RAS-6), in the order they were ticked. */
  readonly chosen: readonly string[];
  /** A request is running: the rows, the chips and the universe cannot change under it, or its paid answer would be dropped. */
  readonly chosenLocked: boolean;
  /** The panel of the ranking request, the same one the other requests use; null until two rows are chosen. */
  readonly rankingPanel: ReactNode;
  readonly onChoose: (id: string) => void;
  readonly onClearChosen: () => void;
  /** The universe of the table: the exchange pairs or the tokens of one network on-chain (RAS-1). */
  readonly universe: Universe;
  readonly onUniverse: (universe: Universe) => void;
  /** The on-chain body; when it is not null it takes the place of the filters and of the table of the exchange. */
  readonly onchainBody: ReactNode;
  readonly ask: AskPanelState;
  readonly onAskText: (text: string) => void;
  readonly onAsk: () => void;
  readonly onCancelAsk: () => void;
  readonly onToggleChip: (id: ChipId) => void;
  readonly onApplyProposal: () => void;
  readonly onDiscardProposal: () => void;
  readonly onView: (view: ViewId) => void;
  readonly onFilters: (filters: Filters) => void;
  readonly onSort: (sort: Sort) => void;
  readonly onPin: (id: string) => void;
  readonly onOpen: (id: string) => void;
  readonly onSelect: (id: string | null) => void;
  readonly onSaveScreen: (name: string) => void;
  readonly onApplyScreen: (name: string) => void;
  readonly onRemoveScreen: (name: string) => void;
  /** The ids of the rows in the calculation window, as the person scrolls. */
  readonly onWindow: (ids: readonly string[]) => void;
}

function ageText(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  return s < 60 ? `${s} s` : `${Math.round(s / 60)} min`;
}

function gridOf(columns: readonly Column[]): string {
  const widths = columns.map((c) => (c.id === "ativo" ? "minmax(130px, 1.4fr)" : c.id === "pressao" ? "minmax(190px, 1.7fr)" : "minmax(88px, 1fr)"));
  // the pin, then the box that chooses the row for the ranking
  return `30px 30px ${widths.join(" ")}`;
}

function defaultDir(key: SortKey): Sort["dir"] {
  return key === "ativo" || key === "rank" ? "asc" : "desc";
}

export function RastreadorScreen(p: RastreadorScreenProps) {
  const view = VIEWS[p.view];
  const columns = view.columns;
  const scroller = useRef<HTMLDivElement | null>(null);
  const search = useRef<HTMLInputElement | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewport, setViewport] = useState(WINDOW_MAX * ROW_H);
  const [screenName, setScreenName] = useState("");
  const [chosenScreen, setChosenScreen] = useState("");

  const first = Math.max(0, Math.floor(scrollTop / ROW_H) - OVERSCAN);
  const last = Math.min(p.rows.length, Math.ceil((scrollTop + viewport) / ROW_H) + OVERSCAN);
  const shown = p.rows.slice(first, last);
  const windowIds = useMemo(() => {
    const from = Math.floor(scrollTop / ROW_H);
    return p.rows.slice(from, from + Math.min(WINDOW_MAX, Math.ceil(viewport / ROW_H) + 1)).map((r) => r.id);
  }, [p.rows, scrollTop, viewport]);
  const windowKey = windowIds.join(",");
  useEffect(() => {
    p.onWindow(windowIds);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the key is the content of windowIds
  }, [windowKey]);

  useEffect(() => {
    const el = scroller.current;
    if (el === null) return;
    const measure = () => setViewport(el.clientHeight || WINDOW_MAX * ROW_H);
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const move = useCallback(
    (delta: number) => {
      if (p.rows.length === 0) return;
      const at = p.selectedId === null ? -1 : p.rows.findIndex((r) => r.id === p.selectedId);
      const next = Math.min(p.rows.length - 1, Math.max(0, at + delta));
      p.onSelect(p.rows[next]!.id);
      const el = scroller.current;
      if (el !== null) {
        const top = next * ROW_H;
        if (top < el.scrollTop + ROW_H) el.scrollTop = Math.max(0, top - ROW_H);
        else if (top + ROW_H * 2 > el.scrollTop + el.clientHeight) el.scrollTop = top + ROW_H * 2 - el.clientHeight;
      }
    },
    [p],
  );

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "ArrowDown") (event.preventDefault(), move(1));
    else if (event.key === "ArrowUp") (event.preventDefault(), move(-1));
    else if (event.key === "Enter" && p.selectedId !== null) (event.preventDefault(), p.onOpen(p.selectedId));
    else if ((event.key === "p" || event.key === "P") && p.selectedId !== null) (event.preventDefault(), p.onPin(p.selectedId));
    else if (event.key === "/") (event.preventDefault(), search.current?.focus());
  };

  const setFilter = (patch: Partial<Filters>) => p.onFilters({ ...p.filters, ...patch });
  const sortBy = (key: SortKey) => p.onSort(p.sort.key === key ? { key, dir: p.sort.dir === "asc" ? "desc" : "asc" } : { key, dir: defaultDir(key) });
  const template = gridOf(columns);
  const atLimit = p.chosen.length >= CHOOSE_MAX;
  const unavailable = VIEW_ORDER.map((id) => VIEWS[id]).find((v) => v.id === p.view && !v.available);

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>INONU TRADER</p>
          <h1 className={styles.title}>Rastreador</h1>
        </div>
        <nav className={styles.nav} aria-label="Secoes do app">
          <a className={styles.navLink} href="/">Mesa</a>
          <a className={styles.navLink} href="/rastreador" aria-current="page">Rastreador</a>
        </nav>
      </header>

      <div className={styles.tabs} role="radiogroup" aria-label="Universo">
        {(["corretora", "onchain"] as const).map((id) => (
          <button key={id} type="button" role="radio" aria-checked={p.universe === id} disabled={p.chosenLocked} className={styles.tab} onClick={() => p.onUniverse(id)}>
            {id === "corretora" ? "Corretora OKX" : "On-chain"}
          </button>
        ))}
      </div>

      {p.onchainBody !== null ? (
        p.onchainBody
      ) : (
        <>
      <div className={styles.tabs} role="tablist" aria-label="Visoes">
        {VIEW_ORDER.map((id) => {
          const v = VIEWS[id];
          return (
            <button key={id} type="button" role="tab" aria-selected={p.view === id} title={v.reason ?? undefined} disabled={!v.available} className={styles.tab} onClick={() => p.onView(id)}>
              {v.label}
            </button>
          );
        })}
      </div>
      {unavailable?.reason ? <p className={styles.viewReason}>{unavailable.reason}</p> : null}

      <section className={styles.askPanel} aria-label="Perguntar ao Inonu">
        <div className={styles.askRow}>
          <label className={styles.field}>
            <span>Perguntar ao Inonu</span>
            <input
              type="text"
              className={styles.askInput}
              aria-label="Pergunta ao Inonu"
              maxLength={300}
              placeholder="Ex.: perpetuos grandes que subiram hoje"
              value={p.ask.text}
              onChange={(e) => p.onAskText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") (e.preventDefault(), p.onAsk());
              }}
            />
          </label>
          <button type="button" className={styles.button} disabled={p.ask.phase === "asking" || p.ask.text.trim() === ""} onClick={p.onAsk}>
            Perguntar
          </button>
          {p.ask.phase === "asking" ? (
            <button type="button" className={styles.button} onClick={p.onCancelAsk}>
              Cancelar
            </button>
          ) : null}
        </div>
        <p className={styles.askStatus} role="status">
          {p.ask.phase === "idle" ? "O Inonu le so a sua frase, nunca os dados do mercado" : null}
          {p.ask.phase === "asking" ? "Perguntando ao Inonu" : null}
          {p.ask.phase === "proposal" ? "Inonu respondeu. Tire o que nao quer e aplique" : null}
          {p.ask.phase === "failed" ? motivoText(p.ask.motivo) : null}
        </p>
        {p.ask.phase === "proposal" ? (
          <>
            <div className={styles.chips}>
              {chipsOf(p.ask.filtro).map((chip) => (
                <button key={chip.id} type="button" className={styles.chip} aria-pressed={p.ask.phase === "proposal" && p.ask.keep.includes(chip.id)} onClick={() => p.onToggleChip(chip.id)}>
                  {chip.label}
                </button>
              ))}
              <button type="button" className={styles.button} onClick={p.onApplyProposal}>
                Aplicar filtro
              </button>
              <button type="button" className={styles.button} onClick={p.onDiscardProposal}>
                Descartar
              </button>
            </div>
            <p className={styles.footnote}>
              modelo: Jev ({p.ask.modelo}). {costLine(p.ask.custo)}.
            </p>
          </>
        ) : null}
      </section>

      <section className={styles.filters} aria-label="Filtros">
        <label className={styles.field}>
          <span>Buscar</span>
          <input ref={search} type="text" aria-label="Buscar ativo" placeholder="Simbolo" value={p.filters.busca} onChange={(e) => setFilter({ busca: e.target.value.replace(/[^A-Za-z0-9-]/g, "").slice(0, 24) })} />
        </label>
        <label className={styles.field}>
          <span>Mercado</span>
          <select aria-label="Mercado" value={p.filters.mercado} onChange={(e) => setFilter({ mercado: e.target.value as Filters["mercado"] })}>
            <option value="todos">Todos</option>
            <option value="spot">Spot</option>
            <option value="perp">Perpetuos</option>
          </select>
        </label>
        <NumberFilter label="Vol USD minimo" ariaLabel="Volume minimo em USD" inputMode="decimal" value={p.filters.volUsdMin} onChange={(volUsdMin) => setFilter({ volUsdMin })} accept={(n) => n >= 0} />
        <NumberFilter label="Var minima" ariaLabel="Variacao minima em 24 horas, em percentual" inputMode="decimal" value={p.filters.varMin} onChange={(varMin) => setFilter({ varMin })} />
        <NumberFilter label="Var maxima" ariaLabel="Variacao maxima em 24 horas, em percentual" inputMode="decimal" value={p.filters.varMax} onChange={(varMax) => setFilter({ varMax })} />
        <NumberFilter label="Rank ate" ariaLabel="Rank maximo" inputMode="numeric" value={p.filters.rankMax} onChange={(rankMax) => setFilter({ rankMax })} accept={(n) => Number.isInteger(n) && n >= 1} />
        <label className={styles.check}>
          <input type="checkbox" checked={p.filters.apenasFixados} onChange={(e) => setFilter({ apenasFixados: e.target.checked })} />
          <span>Meus fixados</span>
        </label>
        <details className={styles.onchainFilters}>
          <summary title={ON_CHAIN_ONLY}>Filtros de tokens on-chain: valem no universo On-chain</summary>
          <div className={styles.onchainRow}>
            {["Liquidez minima", "Holders minimos", "Carteiras minimas", "Risco maximo"].map((label) => (
              <label key={label} className={styles.field} title={ON_CHAIN_ONLY}>
                <span>{label}</span>
                <input type="text" disabled aria-label={`${label}. ${ON_CHAIN_ONLY}`} title={ON_CHAIN_ONLY} />
              </label>
            ))}
          </div>
        </details>
        <div className={styles.screens}>
          {p.screens.length > 0 ? (
            <label className={styles.field}>
              <span>Telas salvas</span>
              <select
                aria-label="Telas salvas"
                value={chosenScreen}
                onChange={(e) => {
                  setChosenScreen(e.target.value);
                  if (e.target.value !== "") p.onApplyScreen(e.target.value);
                }}
              >
                <option value="">Escolher</option>
                {p.screens.map((s) => (
                  <option key={s.nome} value={s.nome}>
                    {s.nome}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <label className={styles.field}>
            <span>Nome</span>
            <input type="text" aria-label="Nome da tela" maxLength={40} value={screenName} onChange={(e) => setScreenName(e.target.value)} />
          </label>
          <button type="button" className={styles.button} disabled={screenName.trim() === ""} onClick={() => (p.onSaveScreen(screenName), setChosenScreen(screenName.trim()), setScreenName(""))}>
            Salvar tela
          </button>
          {p.screens.length > 0 ? (
            <button type="button" className={styles.button} disabled={chosenScreen === ""} onClick={() => (p.onRemoveScreen(chosenScreen), setChosenScreen(""))}>
              Remover tela
            </button>
          ) : null}
        </div>
      </section>

      <p className={styles.status} role="status">
        <span>{p.rows.length} de {p.totalRows} ativos</span>
        {p.updatedAtMs !== null ? <span>Atualizado ha {ageText(p.nowMs - p.updatedAtMs)}, fonte OKX</span> : null}
      </p>
      {p.partial === "perp" ? <p className={styles.notice}>A lista de perpetuos nao chegou da OKX; so os pares spot aparecem.</p> : null}
      {p.partial === "spot" ? <p className={styles.notice}>A lista de pares spot nao chegou da OKX; so os perpetuos aparecem.</p> : null}
      {p.status === "error" ? <p className={styles.notice} role="alert">{p.error ?? "Nao foi possivel ler a lista da OKX"}</p> : null}
      {p.status === "ready" && p.error !== null ? <p className={styles.notice}>Nao foi possivel atualizar agora ({p.error}). Mostrando a ultima leitura.</p> : null}
      {p.status === "loading" ? <p className={styles.notice}>Carregando a lista da OKX</p> : null}

      {p.chosen.length > 0 ? (
        <section className={styles.askPanel} aria-label="Ranking pelo Inonu">
          <p className={styles.askStatus}>{chosenLine(p.chosen.length)}</p>
          {p.chosenLocked ? <p className={styles.askStatus}>Pedido em andamento: a escolha fica travada ate a resposta</p> : null}
          <div className={styles.chips}>
            {p.chosen.map((id) => (
              <button key={id} type="button" className={styles.chip} aria-label={`Tirar ${id} do ranking`} disabled={p.chosenLocked} onClick={() => p.onChoose(id)}>
                {id} x
              </button>
            ))}
            <button type="button" className={styles.button} disabled={p.chosenLocked} onClick={p.onClearChosen}>
              Limpar escolha
            </button>
          </div>
          {p.rankingPanel}
        </section>
      ) : null}

      {p.status === "ready" || p.rows.length > 0 ? (
        <div className={styles.table}>
          <div ref={scroller} className={styles.scroller} role="table" aria-label="Ativos" aria-rowcount={p.rows.length + 1} tabIndex={0} onKeyDown={onKeyDown} onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}>
            <div role="row" className={`${styles.row} ${styles.head}`} style={{ gridTemplateColumns: template }}>
              <div className={styles.cell} role="columnheader" aria-label="Fixar" />
              <div className={styles.cell} role="columnheader" aria-label="Escolher para o ranking" title="Escolher para o ranking" />
              {columns.map((c) => (
                <div key={c.id} className={styles.cell} role="columnheader" data-numeric={c.numeric} title={c.tip} aria-sort={c.sortKey === null ? undefined : p.sort.key === c.sortKey ? (p.sort.dir === "asc" ? "ascending" : "descending") : "none"}>
                  {c.sortKey === null ? c.label : <button type="button" className={styles.sort} onClick={() => sortBy(c.sortKey!)}>{c.label}</button>}
                </div>
              ))}
            </div>
            {p.rows.length === 0 ? (
              <p className={styles.empty}>Nenhum ativo com estes filtros</p>
            ) : (
              <>
                <div style={{ height: first * ROW_H }} aria-hidden="true" />
                {shown.map((row, offset) => {
                  const cells = cellsFor(row, p.cellContext);
                  const pinned = p.pins.has(row.id);
                  const picked = p.chosen.includes(row.id);
                  return (
                    <div key={row.id} role="row" className={styles.row} data-id={row.id} aria-selected={p.selectedId === row.id} aria-rowindex={first + offset + 2} style={{ gridTemplateColumns: template }} onClick={() => p.onSelect(row.id)} onDoubleClick={() => p.onOpen(row.id)}>
                      <div className={styles.cell} role="cell">
                        <button type="button" className={styles.pin} aria-pressed={pinned} aria-label={pinned ? `Fixado: ${row.id}` : `Fixar ${row.id}`} disabled={p.lockedPins.has(row.id)} onClick={(e) => (e.stopPropagation(), p.onPin(row.id))}>
                          {pinned ? "*" : "+"}
                        </button>
                      </div>
                      <div className={styles.cell} role="cell">
                        <input
                          type="checkbox"
                          className={styles.choose}
                          aria-label={`Escolher ${row.id} para o ranking`}
                          checked={picked}
                          disabled={p.chosenLocked || (!picked && atLimit)}
                          onChange={() => p.onChoose(row.id)}
                          onClick={(e) => e.stopPropagation()}
                          onDoubleClick={(e) => e.stopPropagation()}
                        />
                      </div>
                      {columns.map((c) => {
                        const cell = cells[c.id as CellId];
                        return (
                          <div key={c.id} className={styles.cell} role="cell" data-numeric={c.numeric} data-tone={cell.tone} data-stale={cell.stale ? "true" : undefined} title={cell.title}>
                            {c.id === "ativo" ? (
                              <span className={styles.symbol}>
                                <AssetIcon ccy={row.base} fallback={row.base.slice(0, 2)} size={16} />
                                <span>{cell.text}</span>
                              </span>
                            ) : (
                              cell.text
                            )}
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
                <div style={{ height: Math.max(0, p.rows.length - last) * ROW_H }} aria-hidden="true" />
              </>
            )}
          </div>
        </div>
      ) : null}

      <p className={styles.footnote}>Setas escolhem, Enter abre na mesa, P fixa, / busca. Clique no titulo da coluna para ordenar.</p>
      <p className={styles.footnote}>Marque de 2 a 5 linhas para pedir o ranking ao Inonu. Nada vai ao modelo antes do clique no botao do ranking.</p>
      <p className={styles.footnote}>Pares em USDT: spot e perpetuos da OKX. Volume de perpetuo e aproximado (~): contratos vezes o tamanho do contrato vezes o ultimo preco. A pressao de fluxo e medida so para as linhas na tela.</p>
        </>
      )}
    </main>
  );
}

// ---------------------------------------------------------------------------------------------- container

type TickerState = {
  readonly status: "loading" | "ready" | "error";
  readonly rows: readonly RastreadorRow[];
  readonly partial: "spot" | "perp" | null;
  readonly updatedAtMs: number | null;
  readonly error: string | null;
};

const REFRESH_MS = 60_000;

function useTickers(rest: ReturnType<typeof createOkxRest>): TickerState {
  const [state, setState] = useState<TickerState>({ status: "loading", rows: [], partial: null, updatedAtMs: null, error: null });
  const contracts = useMemo(() => createContractReader(), []);
  const contractSizes = useRef<ReadonlyMap<string, number> | null>(null);
  useEffect(() => {
    let alive = true;
    const controller = new AbortController();
    async function load(): Promise<void> {
      const [spot, swap, sizes] = await Promise.all([rest.tickers("SPOT", controller.signal), rest.tickers("SWAP", controller.signal), contractSizes.current !== null ? Promise.resolve(contractSizes.current) : contracts.read()]);
      if (!alive) return;
      if (sizes !== null) contractSizes.current = sizes; // the sizes do not change within a session: read once, tried again until it works
      const reason = !spot.ok ? spot.error.message : !swap.ok ? swap.error.message : null;
      if (!spot.ok && !swap.ok) {
        setState((s) => (s.rows.length > 0 ? { ...s, error: reason } : { status: "error", rows: [], partial: null, updatedAtMs: null, error: reason }));
        return;
      }
      setState({
        status: "ready",
        rows: buildRows(spot.ok ? spot.value : null, swap.ok ? swap.value : null, contractSizes.current),
        partial: !spot.ok ? "spot" : !swap.ok ? "perp" : null,
        updatedAtMs: Date.now(),
        error: null,
      });
    }
    void load();
    const timer = setInterval(() => {
      if (document.visibilityState !== "hidden") void load();
    }, REFRESH_MS);
    const onVisible = (): void => {
      if (document.visibilityState === "visible") void load();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      alive = false;
      controller.abort();
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [rest]);
  return state;
}

function storage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

const measuresMaps = (m: MeasureState): Measures => {
  const pressao = new Map<string, number | null>();
  for (const [id, read] of m.pressure) if (read !== "lendo") pressao.set(id, read.ok && read.pressure !== null ? read.pressure.valor : null);
  const var1h = new Map<string, number | null>();
  const var4h = new Map<string, number | null>();
  for (const [id, read] of m.performance) {
    if (read === "lendo") continue;
    var1h.set(id, read.ok ? read.var1h : null);
    var4h.set(id, read.ok ? read.var4h : null);
  }
  return { pressao, var1h, var4h };
};

export default function RastreadorView() {
  const rest = useMemo(() => createOkxRest(), []);
  const tickers = useTickers(rest);
  const [work, setWork] = useState<WorkState>(() => loadWork(null));
  const [screens, setScreens] = useState<readonly Screen[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // the rows ticked for the ranking (RAS-6): kept in memory only, a moment of work and not a saved screen
  const [chosenRaw, setChosenRaw] = useState<readonly string[]>([]);
  // the universe of the table (RAS-1): the exchange pairs or the tokens of one network; the token selected on-chain is a moment of work too
  const [uni, setUni] = useState<UniverseState>(DEFAULT_UNIVERSE);
  const [selectedToken, setSelectedToken] = useState<string | null>(null);
  const [signalsChain, setSignalsChain] = useState<string | null>(null);
  // a request of the Inonu panel under the table is running: what it is about cannot change until it answers
  const [askBusy, setAskBusy] = useState(false);
  const [windowIds, setWindowIds] = useState<readonly string[]>([]);
  const [measures, setMeasures] = useState<MeasureState>(EMPTY_MEASURES);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const pinsHook = useWatchPins(DESK_DEFAULT_WATCHLIST);
  const loop = useRef<MeasureLoop | null>(null);
  const inonu = useMemo(() => createInonuClient(), []);
  const [ask, setAsk] = useState<AskPanelState>({ phase: "idle", text: "" });
  const asking = useRef<AbortController | null>(null);

  // the saved choices are read only after mount, so the first markup is always the default one
  useEffect(() => {
    setWork(loadWork(storage()));
    setScreens(loadScreens(storage()));
    setUni(loadUniverse(storage()));
    setLoaded(true);
  }, []);
  useEffect(() => {
    if (loaded) saveWork(storage(), work);
  }, [work, loaded]);
  useEffect(() => {
    if (loaded) saveUniverse(storage(), uni);
  }, [uni, loaded]);

  useEffect(() => {
    const timer = setInterval(() => setNowMs(Date.now()), 5000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    loop.current = createMeasureLoop({ flow: createFlowReader(), perf: createPerformanceReader({ rest }), onChange: setMeasures });
    return () => loop.current?.stop();
  }, [rest]);
  const windowKey = windowIds.join(",");
  useEffect(() => {
    // while the table is on-chain nothing of the exchange table is on screen, so nothing of it is measured
    loop.current?.setTarget(work.visao, uni.universo === "onchain" ? [] : windowIds);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the key is the content of windowIds
  }, [work.visao, windowKey, uni.universo]);

  const pins = useMemo(() => new Set([...DESK_DEFAULT_WATCHLIST, ...pinsHook.pins]), [pinsHook.pins]);
  const lockedPins = useMemo(() => new Set(DESK_DEFAULT_WATCHLIST), []);
  const filtered = useMemo(() => applyFilters(tickers.rows, work.filtros, pins), [tickers.rows, work.filtros, pins]);
  const maps = useMemo(() => measuresMaps(measures), [measures]);
  const rows = useMemo(() => sortRows(filtered, work.ordenacao, maps), [filtered, work.ordenacao, maps]);
  const cellContext = useMemo<CellContext>(() => ({ windowIds: new Set(windowIds), pressure: measures.pressure, performance: measures.performance, nowMs }), [windowIds, measures, nowMs]);

  // checked against the whole universe, so a filter that hides a ticked row keeps it; while the list has not arrived nothing is dropped
  const universe = tickers.rows.length > 0 ? tickers.rows : null;
  const chosen = useMemo(() => chosenIds(chosenRaw, universe, tickers.partial), [chosenRaw, universe, tickers.partial]);
  const rankingSubject = rankingSubjectOf(chosen);
  const rankingPanel = rankingSubject === null ? null : <InonuAsk key={subjectKey(rankingSubject)} instId={subjectKey(rankingSubject)} subject={rankingSubject} onBusyChange={setAskBusy} />;

  // ---- on-chain universe: one read of the hot list when the network is chosen, signals only when the Smart money view is opened,
  // and a new read only when the person asks. Nothing here polls the provider.
  const onchainClient = useMemo(() => createOnchainClient(), []);
  const onchainOn = uni.universo === "onchain";
  const hotKey = onchainOn ? `hot:${uni.chainIndex}` : null;
  const chainsRes = useOnchainResource(onchainOn ? "chains" : null, (user) => onchainClient.chains(user ? "user" : "background"));
  const hotRes = useOnchainResource(hotKey, (user) => onchainClient.hotTokens({ chainIndex: uni.chainIndex, timeFrame: 4, limit: 100 }, user ? "user" : "background"));
  useEffect(() => {
    if (onchainOn && uni.visao === "smart") setSignalsChain(uni.chainIndex);
    else if (!onchainOn || signalsChain !== uni.chainIndex) setSignalsChain(null);
  }, [onchainOn, uni.visao, uni.chainIndex, signalsChain]);
  const signalsKey = onchainOn && signalsChain === uni.chainIndex ? `signals:${uni.chainIndex}` : null;
  const signalsRes = useOnchainResource(signalsKey, (user) => onchainClient.signals({ chainIndex: uni.chainIndex, walletType: "1,2,3", limit: 100 }, user ? "user" : "background"));
  const signalData = signalsKey !== null && signalsRes.state.key === signalsKey && signalsRes.state.status === "ready" ? signalsRes.state.data : null;
  const signalsState: OnchainSignalsState =
    signalsKey === null ? "unread" : signalsRes.state.status === "error" ? { error: onchainErrorText(signalsRes.state.error ?? "network").text } : signalsRes.state.status === "ready" ? "read" : "loading";
  const hotData = hotKey !== null && hotRes.state.key === hotKey ? hotRes.state.data : null;
  const onchainAll = useMemo(() => buildOnchainRows(hotData ?? [], signalData), [hotData, signalData]);
  const onchainRows = useMemo(() => sortOnchain(applyOnchainFilters(onchainAll, uni.filtros), uni.ordenacao), [onchainAll, uni.filtros, uni.ordenacao]);
  const chainOptions = useMemo<readonly OnchainChainOption[]>(
    () => chainChips({ apiChains: chainsRes.state.data, resourceChains: null, resourceLabel: "tokens em alta" }).map((c) => ({ chainIndex: c.chainIndex, name: c.name, enabled: c.enabled, reason: c.reason })),
    [chainsRes.state.data],
  );
  // an answer belongs to the key it was asked for: while the key has changed and the new answer has not come, the screen is loading, not showing the old one
  const hotCurrent = hotKey !== null && hotRes.state.key === hotKey;
  const hotStatus = hotCurrent ? hotRes.state.status : "loading";
  const hotError = hotCurrent && hotRes.state.status === "error" && hotRes.state.error !== null ? onchainErrorText(hotRes.state.error) : null;
  const selectedRow = selectedToken === null ? null : onchainAll.find((r) => r.id === selectedToken) ?? null;
  const tokenPanel =
    selectedRow === null ? null : (
      <InonuAsk
        key={`token:${selectedRow.chainIndex}:${selectedRow.address}`}
        instId={`token:${selectedRow.chainIndex}:${selectedRow.address}`}
        subject={{ kind: "token", chainIndex: selectedRow.chainIndex, address: selectedRow.address, symbol: selectedRow.symbol }}
        onBusyChange={setAskBusy}
      />
    );
  const onchainBody = !onchainOn ? null : (
    <OnchainBody
      chains={chainOptions}
      chainIndex={uni.chainIndex}
      view={uni.visao}
      filters={uni.filtros}
      sort={uni.ordenacao}
      status={hotStatus}
      error={hotError === null ? null : hotError.text}
      errorLink={hotError === null ? null : hotError.link}
      rows={onchainRows}
      totalRows={onchainAll.length}
      updatedAtMs={hotRes.state.meta === null || hotData === null ? null : hotRes.state.meta.cachedAtMs}
      nowMs={nowMs}
      stale={hotRes.state.meta?.stale === true}
      signals={signalsState}
      signalsAtMs={signalData === null || signalsRes.state.meta === null ? null : signalsRes.state.meta.cachedAtMs}
      signalsCount={signalData === null ? null : signalData.length}
      signalsStale={signalsRes.state.meta?.stale === true}
      selectedId={selectedToken}
      askPanel={tokenPanel}
      locked={askBusy}
      onChain={(chainIndex) => (setSelectedToken(null), setUni((u) => ({ ...u, chainIndex })))}
      onView={(visao) => setUni((u) => ({ ...u, visao }))}
      onFilters={(filtros) => setUni((u) => ({ ...u, filtros }))}
      onSort={(ordenacao) => setUni((u) => ({ ...u, ordenacao }))}
      onSelect={setSelectedToken}
      onReload={() => {
        hotRes.reload();
        if (signalsKey !== null) signalsRes.reload();
      }}
    />
  );

  const updateScreens = useCallback((next: readonly Screen[]) => {
    setScreens(next);
    saveScreens(storage(), next);
  }, []);

  return (
    <RastreadorScreen
      status={tickers.status}
      error={tickers.error}
      partial={tickers.partial}
      updatedAtMs={tickers.updatedAtMs}
      nowMs={nowMs}
      totalRows={tickers.rows.length}
      rows={rows}
      view={work.visao}
      filters={work.filtros}
      sort={work.ordenacao}
      cellContext={cellContext}
      pins={pins}
      lockedPins={lockedPins}
      screens={screens}
      selectedId={selectedId}
      chosen={chosen}
      chosenLocked={askBusy}
      rankingPanel={rankingPanel}
      onChoose={(id) => setChosenRaw((c) => toggleChosen(chosenIds(c, universe, tickers.partial), id))}
      onClearChosen={() => setChosenRaw([])}
      universe={uni.universo}
      onUniverse={(universo) => {
        // choosing the universe that is already open changes nothing
        if (universo === uni.universo) return;
        setSelectedToken(null);
        setUni((u) => enterUniverse(u, universo));
      }}
      onchainBody={onchainBody}
      onView={(visao) => setWork((w) => ({ ...w, visao }))}
      onFilters={(filtros) => setWork((w) => ({ ...w, filtros }))}
      onSort={(ordenacao) => setWork((w) => ({ ...w, ordenacao }))}
      onPin={(id) => pinsHook.toggle(id)}
      onOpen={(id) => window.location.assign(openUrl(id))}
      onSelect={setSelectedId}
      onSaveScreen={(name) => updateScreens(upsertScreen(screens, { nome: name, filtros: work.filtros, visao: work.visao, ordenacao: work.ordenacao }))}
      onApplyScreen={(name) => {
        const found = screens.find((s) => s.nome === name);
        if (found) setWork({ visao: found.visao, filtros: found.filtros, ordenacao: found.ordenacao });
      }}
      onRemoveScreen={(name) => updateScreens(removeScreen(screens, name))}
      onWindow={setWindowIds}
      ask={ask}
      onAskText={(text) => setAsk((a) => (a.phase === "asking" ? a : { phase: "idle", text }))}
      onAsk={() => {
        const text = ask.text.trim();
        if (text === "" || ask.phase === "asking") return;
        setAsk({ phase: "asking", text });
        const controller = new AbortController();
        asking.current = controller;
        void inonu.ask({ modo: "filtro", textoLivre: text }, controller.signal).then((answer) => {
          if (controller.signal.aborted) return;
          if (answer.status === "respondido" && answer.filtro !== undefined) {
            setAsk({ phase: "proposal", text, filtro: answer.filtro, keep: chipsOf(answer.filtro).map((c) => c.id), modelo: answer.modelo ?? "modelo", custo: answer.custo, reutilizado: answer.reutilizado === true });
          } else {
            setAsk({ phase: "failed", text, motivo: answer.motivo ?? answer.status });
          }
        });
      }}
      onCancelAsk={() => {
        asking.current?.abort();
        void inonu.status().then(async (status) => {
          if (status?.running) await inonu.cancel(status.running.id);
        });
        setAsk((a) => ({ phase: "idle", text: a.text }));
      }}
      onToggleChip={(id) =>
        setAsk((a) => (a.phase === "proposal" ? { ...a, keep: a.keep.includes(id) ? a.keep.filter((k) => k !== id) : [...a.keep, id] } : a))
      }
      onApplyProposal={() => {
        if (ask.phase !== "proposal") return;
        const next = applyChips(ask.filtro, new Set(ask.keep));
        setWork((w) => ({ ...w, filtros: next.filters, ordenacao: next.sort }));
        setAsk({ phase: "idle", text: ask.text });
      }}
      onDiscardProposal={() => setAsk((a) => ({ phase: "idle", text: a.text }))}
    />
  );
}
