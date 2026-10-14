"use client";

/**
 * The B1 on-chain surfaces of the dock: the DEX tape (Fita), the liquidity panel (Liquidez), the
 * Estrutura e risco card of Holders and the Noticias e sentimento section of Ecossistema. These
 * bodies only exist while their tab is mounted: the DockPanel renders the current tab alone and
 * only when open, and MesaView hands the off-screen dock copy a placeholder, so a provider call
 * from here always belongs to a tab on screen. The tape is the only one that polls (30 s,
 * background intent, only while the page is visible); everything else loads once per key and
 * again on Atualizar. Switching the token aborts the previous request (useOnchainResource).
 */
import { useEffect, useMemo } from "react";
import {
  createOnchainClient,
  type NewsPage,
  type OnchainClient,
  type SentimentRow,
  type VibeTimeline,
} from "@/lib/onchain/client";
import type { OnchainFocus } from "@/lib/onchain/focus";
import { useOnchainResource, type OnchainResourceState } from "@/lib/onchain/useOnchainResource";
import {
  kolRows,
  NEWS_SYMBOL,
  newsRows,
  poolRows,
  priceMetrics,
  sentimentModel,
  tradeTapeRows,
  vibeModel,
  windowRows,
  type KolRowModel,
  type NewsRowModel,
  type OnchainTradeRowModel,
  type PoolRowModel,
  type WindowRowModel,
} from "@/lib/mesa/onchain-desk-rows";
import { feedStateOfResource, onchainErrorText } from "@/lib/mesa/onchain-rows";
import type { PanelFeedState } from "../panels/PanelFrame";
import dockStyles from "./DockTabs.module.css";
import styles from "./OnchainTabs.module.css";
import { OnchainBody, OnchainError, OnchainHead, OnchainLoading, OnchainObjBody } from "./OnchainTabs";

interface FocusedProps {
  readonly focus: OnchainFocus;
  readonly client?: OnchainClient;
  readonly onFeedState?: (state: PanelFeedState) => void;
  readonly nowMs?: number;
}

/* ---------- Fita: the on-chain tape ---------- */

const TAPE_EMPTY = "Sem negociacoes na DEX para este token agora";

export function TapeTable({ rows }: { readonly rows: readonly OnchainTradeRowModel[] }) {
  return (
    <div className={dockStyles.table} role="table" aria-label="Negociacoes na DEX">
      <div className={dockStyles.scroll} role="rowgroup">
        <div className={`${styles.trowOc} ${dockStyles.thead}`} role="row">
          <span role="columnheader" className={styles.cellLeft}>Hora</span>
          <span role="columnheader" className={styles.cellSide}>Lado</span>
          <span role="columnheader">Preco USD</span>
          <span role="columnheader">Valor USD</span>
          <span role="columnheader">DEX</span>
          <span role="columnheader" className={styles.cellLeft}>Carteira</span>
        </div>
        {rows.map((r) => (
          <div key={r.key} className={styles.trowOc} role="row" data-side={r.side}>
            <span role="cell" className={styles.cellLeft}>{r.hora}</span>
            <span role="cell" className={styles.cellSide}>{r.sideWord}</span>
            <span role="cell">{r.priceUsd}</span>
            <span role="cell">{r.volumeUsd}</span>
            <span role="cell">{r.dex}</span>
            <span role="cell" className={`${styles.cellLeft} ${styles.cellMono}`}>{r.wallet}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** The DEX tape is the only onchain surface that polls: every 30 s while visible, background. */
export const ONCHAIN_TAPE_POLL_MS = 30_000;

export function OnchainTapeTab({ focus, client, onFeedState, nowMs }: FocusedProps) {
  const onchain = useMemo(() => client ?? createOnchainClient(), [client]);
  const now = nowMs ?? Date.now();
  const trades = useOnchainResource(
    `trades:${focus.chainIndex}:${focus.address}`,
    (user, _s) => onchain.trades({ chainIndex: focus.chainIndex, token: focus.address, limit: 50 }, user ? "user" : "background"),
    { refreshMs: ONCHAIN_TAPE_POLL_MS },
  );
  const rows = useMemo(() => tradeTapeRows(trades.state.data ?? [], now), [trades.state.data, now]);

  useEffect(() => {
    onFeedState?.(feedStateOfResource(trades.state.status, trades.state.meta?.stale ?? null, rows.length));
  }, [onFeedState, trades.state.status, trades.state.meta, rows.length]);

  return (
    <div className={dockStyles.fill}>
      <div className={styles.toolbar}>
        <span className={styles.tokenHead}>
          <strong>{focus.symbol}</strong> DEX
        </span>
        <OnchainHead meta={trades.state.meta} onReload={trades.reload} />
      </div>
      <p className={styles.note}>Negociacoes na DEX via OnchainOS, nao e a fita da OKX</p>
      <OnchainBody state={trades.state} rows={rows.length} emptyText={TAPE_EMPTY} render={() => <TapeTable rows={rows} />} />
    </div>
  );
}

/* ---------- Liquidez on-chain ---------- */

const POOLS_EMPTY = "Sem pools para este token nesta rede";
const INFO_EMPTY = "Sem preco para este token nesta rede";

export function OnchainLiquidityTab({ focus, client, onFeedState }: FocusedProps) {
  const onchain = useMemo(() => client ?? createOnchainClient(), [client]);
  const info = useOnchainResource(`price-info:${focus.chainIndex}:${focus.address}`, (user, _s) =>
    onchain.priceInfo({ chainIndex: focus.chainIndex, token: focus.address }, user ? "user" : "background"),
  );
  const pools = useOnchainResource(`pools:${focus.chainIndex}:${focus.address}`, (user, _s) =>
    onchain.pools({ chainIndex: focus.chainIndex, token: focus.address }, user ? "user" : "background"),
  );

  const m = useMemo(() => priceMetrics(info.state.data?.[0] ?? null), [info.state.data]);
  const wins = useMemo(() => windowRows(info.state.data?.[0] ?? null), [info.state.data]);
  const poolList = useMemo(() => poolRows(pools.state.data ?? []), [pools.state.data]);

  useEffect(() => {
    const count = (info.state.data?.length ?? 0) + (pools.state.data?.length ?? 0);
    const stale = info.state.meta?.stale === true || pools.state.meta?.stale === true;
    const status =
      info.state.status === "error" && pools.state.status === "error"
        ? "error"
        : info.state.status === "ready" || pools.state.status === "ready"
          ? "ready"
          : info.state.status;
    onFeedState?.(feedStateOfResource(status, stale, count));
  }, [onFeedState, info.state.status, info.state.meta, info.state.data, pools.state.status, pools.state.meta, pools.state.data]);

  const reload = () => {
    info.reload();
    pools.reload();
  };

  return (
    <div className={dockStyles.fill}>
      <div className={styles.toolbar}>
        <span className={styles.tokenHead}>
          <strong>{focus.symbol}</strong> on-chain
        </span>
        <OnchainHead meta={info.state.meta ?? pools.state.meta} onReload={reload} />
      </div>
      <OnchainObjBody
        state={info.state}
        emptyText={INFO_EMPTY}
        render={() => (
          <div className={styles.metricLine} role="group" aria-label="Metricas do token">
            <span className={styles.metric}><span className={styles.metricLabel}>Preco</span> {m.price}</span>
            <span className={styles.metric}><span className={styles.metricLabel}>Liquidez total</span> {m.liquidity}</span>
            <span className={styles.metric}><span className={styles.metricLabel}>Cap. mercado</span> {m.marketCap}</span>
            <span className={styles.metric}><span className={styles.metricLabel}>Holders</span> {m.holders}</span>
            <span className={styles.metric}><span className={styles.metricLabel}>Minima 24h</span> {m.low24h}</span>
            <span className={styles.metric}><span className={styles.metricLabel}>Maxima 24h</span> {m.high24h}</span>
          </div>
        )}
      />
      <div className={styles.split}>
        <div className={styles.splitCol} aria-label="Janelas">
          <p className={styles.note}>Janelas</p>
          <WindowsTable wins={wins} />
        </div>
        <div className={styles.splitCol} aria-label="Pools">
          <p className={styles.note}>Pools</p>
          {pools.state.status === "error" && pools.state.data === null ? (
            <OnchainError code={pools.state.error ?? "bad_request"} hasCache={false} />
          ) : pools.state.status === "loading" || pools.state.status === "idle" ? (
            <OnchainLoading />
          ) : poolList.length === 0 ? (
            <div className={dockStyles.empty} role="status">{POOLS_EMPTY}</div>
          ) : (
            <PoolsTable pools={poolList} stale={pools.state.meta?.stale === true || pools.state.status === "error"} />
          )}
        </div>
      </div>
    </div>
  );
}

export function WindowsTable({ wins }: { readonly wins: readonly WindowRowModel[] }) {
  return (
    <div className={dockStyles.table} role="table" aria-label="Variacao por janela">
      <div className={dockStyles.scroll} role="rowgroup">
        <div className={`${styles.winRow} ${dockStyles.thead}`} role="row">
          <span role="columnheader" className={styles.cellLeft}>Janela</span>
          <span role="columnheader">Variacao %</span>
          <span role="columnheader">Volume USD</span>
          <span role="columnheader">Transacoes</span>
        </div>
        {wins.map((w) => (
          <div key={w.key} className={styles.winRow} role="row">
            <span role="cell" className={styles.cellLeft}>{w.label}</span>
            <span role="cell" data-tone={w.changeTone ?? undefined}>{w.changePct}</span>
            <span role="cell">{w.volumeUsd}</span>
            <span role="cell">{w.txs}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function PoolsTable({ pools, stale = false }: { readonly pools: readonly PoolRowModel[]; readonly stale?: boolean }) {
  return (
    <div className={dockStyles.table} role="table" aria-label="Pools de liquidez" data-stale={stale ? "true" : undefined}>
      <div className={dockStyles.scroll} role="rowgroup">
        <div className={`${styles.poolRow} ${dockStyles.thead}`} role="row">
          <span role="columnheader" className={styles.cellLeft}>Pool</span>
          <span role="columnheader" className={styles.cellLeft}>Protocolo</span>
          <span role="columnheader">Liquidez USD</span>
          <span role="columnheader">Taxa %</span>
        </div>
        {pools.map((p) => (
          <div key={p.key} className={styles.poolRow} role="row">
            <span role="cell" className={styles.cellLeft}>{p.pool}</span>
            <span role="cell" className={styles.cellLeft}>{p.protocol}</span>
            <span role="cell">{p.liquidityUsd}</span>
            <span role="cell">{p.feePct}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------- Ecossistema: noticias e sentimento ---------- */

const NEWS_EMPTY = "Sem noticias para este simbolo agora";

export interface EcoNewsProps {
  /** The symbol the section follows (instrument base or on-chain token symbol), validated here. */
  readonly symbol: string;
  /** Set only under an on-chain focus: adds social heat and KOLs for that token. */
  readonly focus: OnchainFocus | null;
  readonly client?: OnchainClient;
  readonly onFeedState?: (state: PanelFeedState) => void;
  readonly nowMs?: number;
}

export function EcoNewsSection({ symbol, focus, client, onFeedState, nowMs }: EcoNewsProps) {
  const onchain = useMemo(() => client ?? createOnchainClient(), [client]);
  const now = nowMs ?? Date.now();
  const symbolOk = NEWS_SYMBOL.test(symbol);
  const symKey = symbolOk ? symbol.toUpperCase() : null;

  const news = useOnchainResource(symKey !== null ? `eco-news:${symKey}` : null, (user, _s) =>
    onchain.news({ symbol: symKey!, limit: 10 }, user ? "user" : "background"),
  );
  const sentiment = useOnchainResource(symKey !== null ? `eco-sent:${symKey}` : null, (user, _s) =>
    onchain.sentiment({ symbol: symKey! }, user ? "user" : "background"),
  );
  const vibe = useOnchainResource(focus !== null ? `eco-vibe:${focus.chainIndex}:${focus.address}` : null, (user, _s) =>
    onchain.vibe({ chainIndex: focus!.chainIndex, token: focus!.address }, user ? "user" : "background"),
  );
  const kols = useOnchainResource(focus !== null ? `eco-kols:${focus.chainIndex}:${focus.address}` : null, (user, _s) =>
    onchain.kols({ chainIndex: focus!.chainIndex, token: focus!.address, limit: 10 }, user ? "user" : "background"),
  );

  const articles = news.state.data?.articles ?? [];
  const list = useMemo(() => newsRows(articles, now), [articles, now]);
  const kolList = useMemo(() => kolRows(kols.state.data ?? []), [kols.state.data]);

  useEffect(() => {
    if (!symbolOk && focus === null) {
      onFeedState?.("empty");
      return;
    }
    const stale = news.state.meta?.stale === true || sentiment.state.meta?.stale === true;
    const status =
      news.state.status === "error" && sentiment.state.status === "error"
        ? "error"
        : news.state.status === "ready" || sentiment.state.status === "ready"
          ? "ready"
          : news.state.status;
    onFeedState?.(feedStateOfResource(status, stale, list.length));
  }, [onFeedState, symbolOk, focus, news.state, sentiment.state, list.length]);

  const reload = () => {
    news.reload();
    sentiment.reload();
    vibe.reload();
    kols.reload();
  };

  const meta = news.state.meta ?? sentiment.state.meta;
  return (
    <section className={styles.ecoNews} aria-label="Noticias e sentimento">
      <div className={styles.toolbar}>
        <span className={styles.tokenHead}>
          Noticias e sentimento {symbolOk ? <strong>{symbol.toUpperCase()}</strong> : null}
        </span>
        <OnchainHead meta={meta} onReload={reload} />
      </div>
      <p className={styles.note}>Texto de terceiros, o Inonu nao le esta aba</p>
      {focus !== null ? (
        <p className={styles.note}>Busca por simbolo, nao por contrato: outros tokens podem usar o mesmo simbolo</p>
      ) : null}
      {!symbolOk ? (
        <div className={dockStyles.empty} role="status">Simbolo sem noticias</div>
      ) : (
        <>
          <EcoSentimentLine state={sentiment.state} />
          <NewsBlock state={news.state} list={list} />
          {focus !== null ? (
            <div className={styles.split}>
              <div className={styles.splitCol} aria-label="Calor social">
                <p className={styles.note}>Calor social</p>
                <EcoVibeBlock state={vibe.state} />
              </div>
              <div className={styles.splitCol} aria-label="Top KOLs">
                <p className={styles.note}>Top KOLs</p>
                {kols.state.status === "error" && kols.state.data === null ? (
                  <OnchainError code={kols.state.error ?? "bad_request"} hasCache={false} />
                ) : kols.state.status === "ready" && kolList.length === 0 ? (
                  <div className={dockStyles.empty} role="status">Sem KOLs para este token</div>
                ) : kols.state.status === "ready" ? (
                  <KolsTable kols={kolList} stale={kols.state.meta?.stale === true} />
                ) : (
                  <OnchainLoading />
                )}
              </div>
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}

/**
 * The sentiment line of the section. A ready answer with data null is the provider saying the
 * symbol has no coverage: the neutral sentence shows, never an error; an error with a cached row
 * still renders the row under the stale meta.
 */
export function EcoSentimentLine({ state }: { readonly state: OnchainResourceState<SentimentRow | null> }) {
  if (state.status === "error" && state.data === null) {
    return <OnchainError code={state.error ?? "bad_request"} hasCache={false} />;
  }
  if (state.data !== null) {
    const m = sentimentModel(state.data);
    return (
      <p className={styles.riskLine}>
        <span className={styles.metricLabel}>Sentimento</span>{" "}
        <strong data-tone={m.tone ?? undefined}>{m.label}</strong>{" "}
        <span className={styles.metricLabel}>
          {m.ratios}; {m.counts}
          {state.data.period !== null ? ` (${state.data.period})` : ""}
        </span>
      </p>
    );
  }
  if (state.status === "loading" || state.status === "idle") return <OnchainLoading />;
  return <p className={styles.note}>Sem sentimento para este simbolo</p>;
}

/** Social heat: same vocabulary; a null summary is a token without social data. */
export function EcoVibeBlock({ state }: { readonly state: OnchainResourceState<VibeTimeline | null> }) {
  if (state.status === "error" && state.data === null) {
    return <OnchainError code={state.error ?? "bad_request"} hasCache={false} />;
  }
  if (state.data !== null) {
    const m = vibeModel(state.data);
    return (
      <p className={styles.riskLine}>
        <span className={styles.metricLabel}>Calor</span>{" "}
        <strong data-tone={m.scoreTone ?? undefined}>{m.score} de 100</strong>{" "}
        <span className={styles.metricLabel}>
          {m.change}; {m.counts}
        </span>
      </p>
    );
  }
  if (state.status === "loading" || state.status === "idle") return <OnchainLoading />;
  return <div className={dockStyles.empty} role="status">Sem dados sociais para este token</div>;
}

export function NewsTable({ rows, stale = false }: { readonly rows: readonly NewsRowModel[]; readonly stale?: boolean }) {
  return (
    <div className={dockStyles.table} role="table" aria-label="Noticias do simbolo" data-stale={stale ? "true" : undefined}>
      <div className={dockStyles.scroll} role="rowgroup">
        <div className={`${styles.newsRow} ${dockStyles.thead}`} role="row">
          <span role="columnheader" className={styles.cellLeft}>Hora</span>
          <span role="columnheader">Importancia</span>
          <span role="columnheader" className={styles.cellLeft}>Titulo</span>
          <span role="columnheader">Fonte</span>
        </div>
        {rows.map((n) => (
          <div key={n.key} className={styles.newsRow} role="row" title={n.titleAttr}>
            <span role="cell" className={styles.cellLeft}>{n.ago}</span>
            <span role="cell">{n.importance}</span>
            <span role="cell" className={styles.cellLeft}>{n.title}</span>
            <span role="cell">{n.source}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function KolsTable({ kols, stale = false }: { readonly kols: readonly KolRowModel[]; readonly stale?: boolean }) {
  return (
    <div className={dockStyles.table} role="table" aria-label="Top KOLs do token" data-stale={stale ? "true" : undefined}>
      <div className={dockStyles.scroll} role="rowgroup">
        <div className={`${styles.kolRow} ${dockStyles.thead}`} role="row">
          <span role="columnheader" className={styles.cellLeft}>Conta</span>
          <span role="columnheader">Seguidores</span>
          <span role="columnheader">Mencoes</span>
          <span role="columnheader">Impressoes</span>
          <span role="columnheader">Engajamento</span>
        </div>
        {kols.map((k) => (
          <div key={k.key} className={styles.kolRow} role="row">
            <span role="cell" className={`${styles.cellLeft} ${styles.cellMono}`}>{k.conta}</span>
            <span role="cell">{k.seguidores}</span>
            <span role="cell">{k.mencoes}</span>
            <span role="cell">{k.impressoes}</span>
            <span role="cell">{k.engajamento}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function NewsBlock({ state, list }: { readonly state: OnchainResourceState<NewsPage>; readonly list: readonly NewsRowModel[] }) {
  return (
    <OnchainObjBody
      state={state}
      emptyText={NEWS_EMPTY}
      render={(p: NewsPage) =>
        p.articles.length === 0 ? (
          <div className={dockStyles.empty} role="status">{NEWS_EMPTY}</div>
        ) : (
          <NewsTable rows={list} stale={state.meta?.stale === true || state.status === "error"} />
        )
      }
    />
  );
}
