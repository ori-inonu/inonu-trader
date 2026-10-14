"use client";

import { type ReactNode, useEffect, useMemo, useState } from "react";
import { createOnchainClient, type ClusterOverview, type OnchainClient, type OnchainMeta, type SearchToken, type TokenRisk } from "@/lib/onchain/client";
import { chainChips, type ChainSupport } from "@/lib/onchain/chains";
import { useOnchainResource, type OnchainResourceState } from "@/lib/onchain/useOnchainResource";
import {
  feedStateOfResource,
  fmtAgeMs,
  fmtUsd,
  leaderboardRows,
  onchainErrorText,
  signalRows,
  TAG_FILTERS,
  walletRows,
  type LeaderboardRowModel,
  type SignalRowModel,
  type WalletRowModel,
} from "@/lib/mesa/onchain-rows";
import { fmtCompact, fmtNumber, UNAVAILABLE } from "@/lib/desk/ui/format";
import { clusterModel, riskCardModel } from "@/lib/mesa/onchain-desk-rows";
import type { OnchainViewState, WalletTypeId } from "@/lib/mesa/onchain-view";
import { type AskSubject, subjectKey } from "@/lib/inonu/ask-target";
import InonuAsk from "../InonuAsk";
import type { PanelFeedState } from "../panels/PanelFrame";
import dockStyles from "./DockTabs.module.css";
import styles from "./OnchainTabs.module.css";
import { ChainChips } from "./ChainChips";

/** A token the user picked in Smart money or the Holders search; shared by the three tabs. */
export interface SelectedToken {
  readonly chainIndex: string;
  readonly address: string;
  readonly symbol: string;
}

/** Props the three tabs share, assembled once by MesaView. */
export interface OnchainTabProps {
  readonly view: OnchainViewState;
  readonly patch: (p: Partial<OnchainViewState>) => void;
  /** Resolved network (the user's choice or the configured default); always a valid chainIndex. */
  readonly chainIndex: string;
  readonly client?: OnchainClient;
  readonly selectedToken?: SelectedToken | null;
  readonly onPickToken?: (token: SelectedToken | null) => void;
  /** Reports the feed state up so the dock chip mirrors this tab. */
  readonly onFeedState?: (state: PanelFeedState) => void;
  /** Runs beside Atualizar: the chart's tracked-wallet marks reload on the same button (SMC-10). */
  readonly onReloadExtra?: () => void;
  /** Overrides the clock in tests. */
  readonly nowMs?: number;
}

/* ---------- shared chrome ---------- */

const TIER_LABEL: Record<string, string> = { free: "Free", basic: "Basic", premium: "Premium" };

/** Origin line of every onchain tab: where the data came from, how old it is and what it cost. */
export function OnchainHead({ meta, onReload }: { readonly meta: OnchainMeta | null; readonly onReload?: () => void }) {
  return (
    <div className={styles.head} data-stale={meta?.stale === true ? "true" : undefined}>
      <span className={styles.source}>
        OKX OnchainOS{meta ? `, ${fmtAgeMs(meta.ageMs)}` : ""}
      </span>
      {meta ? <span className={styles.tierBadge} data-tier={meta.tier}>{TIER_LABEL[meta.tier] ?? meta.tier}</span> : null}
      {meta?.budget ? (
        <span className={styles.budget}>
          uso este mes {meta.budget.used}
          {meta.budget.cap !== null ? ` de ${meta.budget.cap}` : ""}
        </span>
      ) : null}
      {onReload ? (
        <button type="button" className={styles.reload} onClick={onReload}>
          Atualizar
        </button>
      ) : null}
    </div>
  );
}

/** Neutral loading state: a fact, not a spinner pretending to be data. */
export function OnchainLoading() {
  return <div className={dockStyles.empty} role="status">Carregando</div>;
}

/**
 * The error copy of a tab. Codes that allow a cache fallback render the rows under the message
 * with a "Dado velho" badge; the rest show only the text (and the settings link when it exists).
 */
export function OnchainError({ code, hasCache }: { readonly code: string; readonly hasCache: boolean }) {
  const e = onchainErrorText(code);
  return (
    <div className={styles.errorBox} role="status">
      <p className={styles.errorText}>{e.text}</p>
      {e.link ? (
        <a className={styles.errorLink} href={e.link.href}>
          {e.link.label}
        </a>
      ) : null}
      {hasCache && e.showCache ? <span className={styles.staleBadge}>Dado velho</span> : null}
    </div>
  );
}

/**
 * The one place that reads a resource state and picks what the tab shows: loading, error text,
 * error with cache under a stale badge, empty text or the table. `render` gets the parsed rows.
 */
export function OnchainBody<T>({
  state,
  emptyText,
  render,
  rows,
}: {
  readonly state: OnchainResourceState<T[]>;
  readonly emptyText: string;
  readonly render: (data: readonly T[], meta: OnchainMeta | null) => ReactNode;
  readonly rows: number;
}) {
  if (state.status === "loading" && state.data === null) return <OnchainLoading />;
  if (state.status === "idle") return <OnchainLoading />;
  if (state.status === "error") {
    const canShowCache = state.data !== null && onchainErrorText(state.error ?? "").showCache;
    return (
      <div className={dockStyles.fill}>
        <OnchainError code={state.error ?? "bad_request"} hasCache={canShowCache} />
        {canShowCache ? <div data-stale="true" className={styles.cached}>{render(state.data!, state.meta)}</div> : null}
      </div>
    );
  }
  if (rows === 0) {
    return (
      <div className={dockStyles.empty} role="status">
        {emptyText}
      </div>
    );
  }
  return <>{render(state.data ?? [], state.meta)}</>;
}

/**
 * Single-object payloads (token-risk, clusters, news, sentiment, vibe) through the same
 * vocabulary. A ready answer with data null is the provider saying "nothing for this selection":
 * the neutral emptyText line shows, never an error. `render` only ever sees a non-null payload.
 */
export function OnchainObjBody<T>({
  state,
  emptyText,
  render,
}: {
  readonly state: OnchainResourceState<T>;
  readonly emptyText: string;
  readonly render: (data: NonNullable<T>, meta: OnchainMeta | null) => ReactNode;
}) {
  if (state.status === "loading" && state.data === null) return <OnchainLoading />;
  if (state.status === "idle") return <OnchainLoading />;
  if (state.status === "error") {
    const canShowCache = state.data !== null && onchainErrorText(state.error ?? "").showCache;
    return (
      <div className={dockStyles.fill}>
        <OnchainError code={state.error ?? "bad_request"} hasCache={canShowCache} />
        {canShowCache ? (
          <div data-stale="true" className={styles.cached}>
            {render(state.data as NonNullable<T>, state.meta)}
          </div>
        ) : null}
      </div>
    );
  }
  if (state.data === null) {
    return (
      <div className={dockStyles.empty} role="status">
        {emptyText}
      </div>
    );
  }
  return <>{render(state.data as NonNullable<T>, state.meta)}</>;
}

/* ---------- Smart money ---------- */

const WALLET_TYPE_LABEL: Record<WalletTypeId, string> = { "1": "Smart money", "2": "KOL", "3": "Baleia" };
const SIGNAL_EMPTY = "Nenhuma compra de carteiras fortes nesta rede agora";

export function SignalTable({ rows, onPickToken, chainIndex }: { readonly rows: readonly SignalRowModel[]; readonly chainIndex: string; readonly onPickToken?: (t: SelectedToken) => void }) {
  return (
    <div className={dockStyles.table} role="table" aria-label="Sinais de carteiras rastreadas">
      <div className={dockStyles.scroll} role="rowgroup">
        <div className={`${styles.srow} ${dockStyles.thead}`} role="row">
          <span role="columnheader" className={styles.cellLeft}>Hora</span>
          <span role="columnheader" className={styles.cellLeft}>Token</span>
          <span role="columnheader">Carteiras</span>
          <span role="columnheader">Valor USD</span>
          <span role="columnheader">Ja venderam %</span>
          <span role="columnheader">Tamanho</span>
        </div>
        {rows.map((r) => (
          <div
            key={r.key}
            className={styles.srow}
            role="row"
            data-token={r.tokenAddress !== null ? "true" : undefined}
            tabIndex={r.tokenAddress !== null && onPickToken ? 0 : undefined}
            onClick={
              r.tokenAddress !== null && onPickToken
                ? () => onPickToken({ chainIndex: r.chainIndex ?? chainIndex, address: r.tokenAddress!, symbol: r.tokenSymbol })
                : undefined
            }
            onKeyDown={
              r.tokenAddress !== null && onPickToken
                ? (e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onPickToken({ chainIndex: r.chainIndex ?? chainIndex, address: r.tokenAddress!, symbol: r.tokenSymbol });
                    }
                  }
                : undefined
            }
          >
            <span role="cell" className={styles.cellLeft}>{r.ago}</span>
            <span role="cell" className={`${styles.cellLeft} ${styles.cellSymbol}`}>{r.tokenSymbol}</span>
            <span role="cell">{r.wallets}</span>
            <span role="cell">{r.amountUsd}</span>
            <span role="cell">{r.soldPct}</span>
            <span role="cell">{r.mcap}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * The decision of the Radar (ASK-12): where to look in this network. The table below only lists what the tracked wallets bought; this is where the Inonu
 * chooses among the tokens the code produced, once the person asks (nothing is read or asked before the click, and the click says what it costs).
 */
export function ChainDecision({ chainIndex, chainName }: { readonly chainIndex: string; readonly chainName: string }) {
  const subject: AskSubject = { kind: "descoberta", chainIndex, chainName };
  return (
    <section className={styles.decision} aria-label="Decisao do Inonu para esta rede">
      <p className={styles.decisionLead}>
        {`Onde comprar na rede ${chainName}? O Inonu cruza as carteiras que mais acertam, o risco e o tamanho de cada token e escolhe. So roda quando voce pedir.`}
      </p>
      <InonuAsk key={subjectKey(subject)} instId={`descoberta:${chainIndex}`} subject={subject} />
    </section>
  );
}

export function SmartMoneyTab({ view, patch, chainIndex, client, onPickToken, onFeedState, onReloadExtra, nowMs }: OnchainTabProps) {
  const onchain = useMemo(() => client ?? createOnchainClient(), [client]);
  const now = nowMs ?? Date.now();

  const apiChains = useOnchainResource("chains", (user, _s) => onchain.chains(user ? "user" : "background"));
  const supportChains = useOnchainResource("signal-chains", (user, _s) => onchain.signalChains(user ? "user" : "background"));

  const walletType = [...view.walletTypes].sort().join(",");
  const signals = useOnchainResource(`signals:${chainIndex}:${walletType}`, (user, _s) =>
    onchain.signals({ chainIndex, walletType, limit: 50 }, user ? "user" : "background"),
  );

  const rows = useMemo(() => signalRows(signals.state.data ?? [], now), [signals.state.data, now]);
  const chips = useMemo(
    () =>
      chainChips({
        apiChains: apiChains.state.data,
        resourceChains: supportChains.state.data,
        resourceLabel: "sinais",
      } satisfies ChainSupport),
    [apiChains.state.data, supportChains.state.data],
  );

  useEffect(() => {
    onFeedState?.(feedStateOfResource(signals.state.status, signals.state.meta?.stale ?? null, rows.length));
  }, [onFeedState, signals.state.status, signals.state.meta, rows.length]);

  return (
    <div className={dockStyles.fill}>
      <div className={styles.toolbar}>
        <ChainChips chips={chips} value={chainIndex} onSelect={(chainIndex) => patch({ chainIndex })} ariaLabel="Rede para sinais" />
        <div className={styles.chipRow} role="group" aria-label="Tipos de carteira">
          {(["1", "2", "3"] as const).map((id) => (
            <button
              key={id}
              type="button"
              className={styles.filterChip}
              aria-pressed={view.walletTypes.includes(id)}
              onClick={() => {
                const has = view.walletTypes.includes(id);
                // Multi-select with a floor of one: unchecking the last kind is refused.
                if (has && view.walletTypes.length === 1) return;
                patch({ walletTypes: has ? view.walletTypes.filter((w) => w !== id) : [...view.walletTypes, id] });
              }}
            >
              {WALLET_TYPE_LABEL[id]}
            </button>
          ))}
        </div>
        <OnchainHead
          meta={signals.state.meta}
          onReload={() => {
            signals.reload();
            onReloadExtra?.();
          }}
        />
      </div>
      <ChainDecision chainIndex={chainIndex} chainName={chips.find((c) => c.chainIndex === chainIndex)?.name ?? `Rede ${chainIndex}`} />
      <p className={styles.note}>Quem esta comprando agora nesta rede, segundo a OKX. A decisao e do Inonu, no pedido acima.</p>
      <OnchainBody
        state={signals.state}
        rows={rows.length}
        emptyText={SIGNAL_EMPTY}
        render={(_data, _meta) => <SignalTable rows={rows} chainIndex={chainIndex} onPickToken={onPickToken} />}
      />
    </div>
  );
}

/* ---------- Traders ---------- */

const TIME_FRAMES: readonly { readonly value: number; readonly label: string }[] = [
  { value: 1, label: "1D" },
  { value: 2, label: "3D" },
  { value: 3, label: "7D" },
  { value: 4, label: "1M" },
  { value: 5, label: "3M" },
];
const SORT_BY: readonly { readonly value: number; readonly label: string }[] = [
  { value: 1, label: "PnL" },
  { value: 2, label: "Taxa de acerto" },
  { value: 3, label: "Transacoes" },
  { value: 4, label: "Volume" },
  { value: 5, label: "ROI" },
];
const LEADERBOARD_EMPTY = "Sem traders nesta rede agora";

export function LeaderboardTable({ rows }: { readonly rows: readonly LeaderboardRowModel[] }) {
  return (
    <div className={dockStyles.table} role="table" aria-label="Leaderboard de carteiras">
      <div className={dockStyles.scroll} role="rowgroup">
        <div className={`${styles.lrow} ${dockStyles.thead}`} role="row">
          <span role="columnheader" className={styles.cellLeft}>Carteira</span>
          <span role="columnheader">PnL USD</span>
          <span role="columnheader">PnL %</span>
          <span role="columnheader">Acerto %</span>
          <span role="columnheader">Volume USD</span>
          <span role="columnheader">Txs</span>
          <span role="columnheader">Ultima atividade</span>
          <span role="columnheader" className={styles.cellLeft}>Principais tokens</span>
        </div>
        {rows.map((r) => (
          <div key={r.key} className={styles.lrow} role="row">
            <span role="cell" className={`${styles.cellLeft} ${styles.cellMono}`}>{r.wallet}</span>
            <span role="cell">{r.pnlUsd}</span>
            <span role="cell">{r.pnlPct}</span>
            <span role="cell">{r.winPct}</span>
            <span role="cell">{r.volumeUsd}</span>
            <span role="cell">{r.txs}</span>
            <span role="cell">{r.lastActive}</span>
            <span role="cell" className={styles.cellLeft}>{r.topTokens}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function TradersTab({ view, patch, chainIndex, client, onFeedState, nowMs }: OnchainTabProps) {
  const onchain = useMemo(() => client ?? createOnchainClient(), [client]);
  const now = nowMs ?? Date.now();

  const apiChains = useOnchainResource("chains", (user, _s) => onchain.chains(user ? "user" : "background"));
  const supportChains = useOnchainResource("leaderboard-chains", (user, _s) => onchain.leaderboardChains(user ? "user" : "background"));
  const board = useOnchainResource(`leaderboard:${chainIndex}:${view.timeFrame}:${view.sortBy}`, (user, _s) =>
    onchain.leaderboard({ chainIndex, timeFrame: view.timeFrame, sortBy: view.sortBy }, user ? "user" : "background"),
  );

  const rows = useMemo(() => leaderboardRows(board.state.data ?? [], now), [board.state.data, now]);
  const chips = useMemo(
    () =>
      chainChips({
        apiChains: apiChains.state.data,
        resourceChains: supportChains.state.data,
        resourceLabel: "leaderboard",
      } satisfies ChainSupport),
    [apiChains.state.data, supportChains.state.data],
  );

  useEffect(() => {
    onFeedState?.(feedStateOfResource(board.state.status, board.state.meta?.stale ?? null, rows.length));
  }, [onFeedState, board.state.status, board.state.meta, rows.length]);

  return (
    <div className={dockStyles.fill}>
      <div className={styles.toolbar}>
        <ChainChips chips={chips} value={chainIndex} onSelect={(chainIndex) => patch({ chainIndex })} ariaLabel="Rede para leaderboard" />
        <div className={styles.chipRow} role="group" aria-label="Periodo">
          {TIME_FRAMES.map((t) => (
            <button key={t.value} type="button" className={styles.filterChip} aria-pressed={view.timeFrame === t.value} onClick={() => patch({ timeFrame: t.value })}>
              {t.label}
            </button>
          ))}
        </div>
        <div className={styles.chipRow} role="group" aria-label="Ordenacao">
          {SORT_BY.map((s) => (
            <button key={s.value} type="button" className={styles.filterChip} aria-pressed={view.sortBy === s.value} onClick={() => patch({ sortBy: s.value })}>
              {s.label}
            </button>
          ))}
        </div>
        <OnchainHead meta={board.state.meta} onReload={board.reload} />
      </div>
      <OnchainBody state={board.state} rows={rows.length} emptyText={LEADERBOARD_EMPTY} render={() => <LeaderboardTable rows={rows} />} />
    </div>
  );
}

/* ---------- Holders ---------- */

const HOLDERS_EMPTY = "Sem holders para este filtro agora";

export function WalletTable({ rows, ariaLabel }: { readonly rows: readonly WalletRowModel[]; readonly ariaLabel: string }) {
  return (
    <div className={dockStyles.table} role="table" aria-label={ariaLabel}>
      <div className={dockStyles.scroll} role="rowgroup">
        <div className={`${styles.wrow} ${dockStyles.thead}`} role="row">
          <span role="columnheader" className={styles.cellLeft}>Carteira</span>
          <span role="columnheader">% do supply</span>
          <span role="columnheader">PnL realizado</span>
          <span role="columnheader">PnL nao realizado</span>
          <span role="columnheader">Compra media</span>
          <span role="columnheader">Quantidade</span>
        </div>
        {rows.map((r) => (
          <div key={r.key} className={styles.wrow} role="row">
            <span role="cell" className={`${styles.cellLeft} ${styles.cellMono}`}>{r.wallet}</span>
            <span role="cell">{r.holdPct}</span>
            <span role="cell">{r.realizedPnl}</span>
            <span role="cell">{r.unrealizedPnl}</span>
            <span role="cell">{r.avgBuy}</span>
            <span role="cell">{r.qty}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Search results as clickable rows: symbol, name, price, holders, liquidity. */
export function SearchResults({ tokens, onPickToken, chainIndex }: { readonly tokens: readonly SearchToken[]; readonly chainIndex: string; readonly onPickToken: (t: SelectedToken) => void }) {
  return (
    <div className={dockStyles.table} role="table" aria-label="Resultados da busca de token">
      <div className={dockStyles.scroll} role="rowgroup">
        <div className={`${styles.krow} ${dockStyles.thead}`} role="row">
          <span role="columnheader" className={styles.cellLeft}>Simbolo</span>
          <span role="columnheader" className={styles.cellLeft}>Nome</span>
          <span role="columnheader">Preco</span>
          <span role="columnheader">Holders</span>
          <span role="columnheader">Liquidez</span>
        </div>
        {tokens.map((t, i) => (
          <div
            key={`${t.address}-${i}`}
            className={styles.krow}
            role="row"
            tabIndex={0}
            onClick={() => onPickToken({ chainIndex: t.chainIndex ?? chainIndex, address: t.address, symbol: t.symbol })}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onPickToken({ chainIndex: t.chainIndex ?? chainIndex, address: t.address, symbol: t.symbol });
              }
            }}
          >
            <span role="cell" className={`${styles.cellLeft} ${styles.cellSymbol}`}>{t.symbol}</span>
            <span role="cell" className={styles.cellLeft}>{t.name ?? UNAVAILABLE}</span>
            <span role="cell">{fmtUsd(t.price)}</span>
            <span role="cell">{t.holders === null ? UNAVAILABLE : fmtNumber(t.holders, 0)}</span>
            <span role="cell">{t.liquidityUsd === null ? UNAVAILABLE : `US$ ${fmtCompact(t.liquidityUsd)}`}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function HoldersTab({ chainIndex, client, selectedToken, onPickToken, onFeedState, nowMs }: OnchainTabProps) {
  const onchain = useMemo(() => client ?? createOnchainClient(), [client]);
  const [sub, setSub] = useState<"holders" | "top-traders">("holders");
  const [tag, setTag] = useState<number | null>(null);
  const [query, setQuery] = useState("");
  const [submitted, setSubmitted] = useState<string | null>(null);

  const hasToken = selectedToken !== null && selectedToken !== undefined;
  const search = useOnchainResource(submitted === null || hasToken ? null : `search:${chainIndex}:${submitted}`, (user, _s) =>
    onchain.search({ chainIndex, q: submitted! }, user ? "user" : "background"),
  );

  const tableKey = hasToken ? `${sub}:${selectedToken.chainIndex}:${selectedToken.address}:${tag ?? "all"}` : null;
  const wallets = useOnchainResource(tableKey, (user, _s) => {
    const params = { chainIndex: selectedToken!.chainIndex, token: selectedToken!.address, tagFilter: tag ?? undefined, limit: 50 };
    return sub === "holders" ? onchain.holders(params, user ? "user" : "background") : onchain.topTraders(params, user ? "user" : "background");
  });

  const rows = useMemo(() => walletRows(wallets.state.data ?? []), [wallets.state.data]);

  const feed = hasToken
    ? feedStateOfResource(wallets.state.status, wallets.state.meta?.stale ?? null, rows.length)
    : feedStateOfResource("idle", null, 0);
  useEffect(() => {
    onFeedState?.(feed);
  }, [onFeedState, feed]);

  const submit = () => {
    const q = query.trim();
    if (q.length >= 2) setSubmitted(q);
  };

  if (!hasToken) {
    return (
      <div className={dockStyles.fill}>
        <div className={styles.holdersEmpty}>
          <p className={styles.note}>Escolha um token na vista Smart money ou busque abaixo</p>
          <form
            className={styles.searchForm}
            role="search"
            aria-label={`Buscar token na rede ${chainIndex}`}
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
          >
            <input
              className={styles.searchInput}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Simbolo ou nome, minimo 2 caracteres"
              aria-label="Buscar token"
              minLength={2}
            />
            <button type="submit" className={styles.reload} disabled={query.trim().length < 2}>
              Buscar
            </button>
          </form>
          {submitted !== null ? (
            <OnchainBody
              state={search.state}
              rows={search.state.data?.length ?? 0}
              emptyText="Nenhum token encontrado"
              render={(data) => <SearchResults tokens={data} chainIndex={chainIndex} onPickToken={onPickToken!} />}
            />
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className={dockStyles.fill}>
      <div className={styles.toolbar}>
        <span className={styles.tokenHead}>
          <span className={styles.cellSymbol}>{selectedToken.symbol}</span>
          <button type="button" className={styles.reload} onClick={() => onPickToken?.(null)}>
            Trocar token
          </button>
        </span>
        <div className={styles.chipRow} role="group" aria-label="Visao">
          <button type="button" className={styles.filterChip} aria-pressed={sub === "holders"} onClick={() => setSub("holders")}>
            Holders
          </button>
          <button type="button" className={styles.filterChip} aria-pressed={sub === "top-traders"} onClick={() => setSub("top-traders")}>
            Top traders do token
          </button>
        </div>
        <div className={styles.chipRow} role="group" aria-label="Etiqueta de carteira">
          {TAG_FILTERS.map((t) => (
            <button key={t.label} type="button" className={styles.filterChip} aria-pressed={tag === t.value} onClick={() => setTag(t.value)}>
              {t.label}
            </button>
          ))}
        </div>
        <OnchainHead meta={wallets.state.meta} onReload={wallets.reload} />
      </div>
      <RiskCard token={selectedToken} client={client} nowMs={nowMs} />
      <OnchainBody
        state={wallets.state}
        rows={rows.length}
        emptyText={HOLDERS_EMPTY}
        render={() => <WalletTable rows={rows} ariaLabel={sub === "holders" ? `Holders de ${selectedToken.symbol}` : `Top traders de ${selectedToken.symbol}`} />}
      />
    </div>
  );
}

/* ---------- Holders: Estrutura e risco ---------- */

export const CLUSTERS_UNSUPPORTED = "Grupos de carteiras indisponiveis nesta rede";

function StatGrid({ stats, label }: { readonly stats: readonly { label: string; value: string }[]; readonly label: string }) {
  return (
    <div className={styles.statGrid} role="table" aria-label={label}>
      {stats.map((s) => (
        <span key={s.label} role="row" className={styles.statCell}>
          <span role="cell" className={styles.metricLabel}>{s.label}</span>
          <span role="cell"><strong>{s.value}</strong></span>
        </span>
      ))}
    </div>
  );
}

/** The risk payload rendered as text, tags and two stat grids; percents keep the provider scale. */
export function RiskBody({ risk, nowMs }: { readonly risk: TokenRisk; readonly nowMs: number }) {
  const rm = riskCardModel(risk, nowMs);
  return (
    <div className={styles.riskBody}>
      <p className={styles.riskLine}>
        <span className={styles.metricLabel}>Nivel de risco</span> <strong>{rm.riskLevel}</strong>
        <span className={styles.metricLabel}>, escala do provedor</span>
        {rm.age !== "Indisponivel" ? <span className={styles.metricLabel}>, criado ha {rm.age}</span> : null}
      </p>
      {rm.tags.length > 0 ? (
        <div className={styles.tagRow} role="list" aria-label="Etiquetas do token">
          {rm.tags.map((t) => (
            <span key={t} role="listitem" className={styles.tagChip}>{t}</span>
          ))}
        </div>
      ) : null}
      <StatGrid stats={rm.stats} label="Percentuais de risco, como o provedor envia" />
      <p className={styles.metricLabel}>Percentuais como o provedor envia</p>
      <StatGrid stats={rm.devs} label="Historico do desenvolvedor" />
    </div>
  );
}

/**
 * The cluster overview below the risk card. The supported-chain list gates the call itself: a chain
 * outside the five covered ones renders the unavailable line without spending the clusters route,
 * and the unsupported_chain error lands on the same line.
 */
export function ClustersBlock({
  chainIndex,
  chainsData,
  clustersState,
}: {
  readonly chainIndex: string;
  readonly chainsData: readonly { chainIndex: string }[] | null;
  readonly clustersState: OnchainResourceState<ClusterOverview | null>;
}) {
  const supported = chainsData === null ? null : chainsData.some((c) => c.chainIndex === chainIndex);
  if (supported === false || (clustersState.status === "error" && clustersState.error === "unsupported_chain")) {
    return <p className={styles.note}>{CLUSTERS_UNSUPPORTED}</p>;
  }
  if (clustersState.status === "error" && clustersState.data === null) {
    return <OnchainError code={clustersState.error ?? "bad_request"} hasCache={false} />;
  }
  if (clustersState.status === "ready" && clustersState.data === null) {
    return <p className={styles.note}>Sem dados de grupos para este token</p>;
  }
  if (clustersState.data !== null) {
    const cm = clusterModel(clustersState.data);
    return (
      <div className={styles.riskBody} data-stale={clustersState.meta?.stale === true || clustersState.status === "error" ? "true" : undefined}>
        <p className={styles.riskLine}>
          <span className={styles.metricLabel}>Concentracao</span> <strong>{cm.concentration}</strong>
        </p>
        <StatGrid stats={cm.stats} label="Grupos de carteiras" />
      </div>
    );
  }
  return supported === true ? <OnchainLoading /> : null;
}

/**
 * Token-risk + cluster overview for the token the Holders tab already follows. Cluster chains are
 * read once so a chain the provider does not cover never spends the clusters call; the
 * unsupported_chain code renders the same "unavailable" line.
 */
export function RiskCard({ token, client, nowMs }: { readonly token: SelectedToken; readonly client?: OnchainClient; readonly nowMs?: number }) {
  const onchain = useMemo(() => client ?? createOnchainClient(), [client]);
  const now = nowMs ?? Date.now();
  const risk = useOnchainResource(`token-risk:${token.chainIndex}:${token.address}`, (user, _s) =>
    onchain.tokenRisk({ chainIndex: token.chainIndex, token: token.address }, user ? "user" : "background"),
  );
  const clusterChains = useOnchainResource("cluster-chains", (user, _s) => onchain.clusterChains(user ? "user" : "background"));
  const clusterSupported = clusterChains.state.data !== null && clusterChains.state.data.some((c) => c.chainIndex === token.chainIndex);
  const clusters = useOnchainResource(
    clusterSupported ? `clusters:${token.chainIndex}:${token.address}` : null,
    (user, _s) => onchain.clusters({ chainIndex: token.chainIndex, token: token.address }, user ? "user" : "background"),
  );

  return (
    <section className={styles.riskCard} aria-label="Estrutura e risco">
      <div className={styles.toolbar}>
        <span className={styles.tokenHead}>Estrutura e risco</span>
        <OnchainHead
          meta={risk.state.meta}
          onReload={() => {
            risk.reload();
            clusterChains.reload();
            if (clusterSupported) clusters.reload();
          }}
        />
      </div>
      <OnchainObjBody state={risk.state} emptyText="Sem dados de risco para este token" render={(r: TokenRisk) => <RiskBody risk={r} nowMs={now} />} />
      <ClustersBlock chainIndex={token.chainIndex} chainsData={clusterChains.state.data} clustersState={clusters.state} />
    </section>
  );
}

