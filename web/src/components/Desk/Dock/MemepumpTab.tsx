"use client";

import { useEffect, useMemo, useState } from "react";
import { createOnchainClient } from "@/lib/onchain/client";
import { chainChips } from "@/lib/onchain/chains";
import { LAUNCH_SORTS, launchRows, MEME_STAGES, type LaunchRow, type LaunchSort, type MemeStage } from "@/lib/onchain/memepump";
import { useOnchainResource } from "@/lib/onchain/useOnchainResource";
import { feedStateOfResource } from "@/lib/mesa/onchain-rows";
import { ChainChips } from "./ChainChips";
import dockStyles from "./DockTabs.module.css";
import { OnchainBody, OnchainHead, type OnchainTabProps, type SelectedToken } from "./OnchainTabs";
import styles from "./MemepumpTab.module.css";

/**
 * "Lancamentos" of the Radar (RAS-2): the tokens being launched on a chain, at one stage of their life, with what a person weighs before putting money in one: how old it is, what its market
 * does in the last hour, how far along the launch curve it is, and who holds it (the marks of care). The code DESCRIBES and keeps no ranking of "best": the person chooses the order
 * (volume, buys, newest), and what is worth doing is the Inonu's call, asked by a click on the token (it opens the holders and the chart of that token). One read per choice, no polling.
 */

const EMPTY = "Nenhum lancamento nesta etapa e nesta rede agora";

export function LaunchTable({ rows, total, onPick }: { readonly rows: readonly LaunchRow[]; readonly total: number; readonly onPick?: (token: SelectedToken) => void }) {
  return (
    <>
      <div className={dockStyles.table} role="table" aria-label="Lancamentos de tokens">
        <div className={dockStyles.scroll} role="rowgroup">
          <div className={`${styles.row} ${dockStyles.thead}`} role="row">
            <span role="columnheader" className={styles.left}>Token</span>
            <span role="columnheader">Idade</span>
            <span role="columnheader">Valor de mercado</span>
            <span role="columnheader">Volume 1 h</span>
            <span role="columnheader">Negocios na ultima hora</span>
            <span role="columnheader">Curva</span>
            <span role="columnheader">Detentores</span>
            <span role="columnheader" className={styles.left}>Marcas de cuidado</span>
          </div>
          {rows.map((r) => (
            <div key={r.key} className={styles.row} role="row" data-marked={r.marks.length > 0 ? "true" : undefined}>
              <span role="cell" className={`${styles.left} ${styles.token}`}>
                {onPick === undefined ? (
                  <span>{r.symbol}</span>
                ) : (
                  <button type="button" className={styles.pick} onClick={() => onPick({ chainIndex: r.chainIndex, address: r.address, symbol: r.symbol })} aria-label={`Abrir ${r.symbol}`}>
                    {r.symbol}
                  </button>
                )}
                {r.name === null || r.name === r.symbol ? null : <small>{r.name}</small>}
              </span>
              <span role="cell">{r.age}</span>
              <span role="cell">{r.marketCap}</span>
              <span role="cell">{r.volume}</span>
              <span role="cell">{r.trades}</span>
              <span role="cell">{r.curve}</span>
              <span role="cell">{r.holders}</span>
              <span role="cell" className={`${styles.left} ${styles.marks}`}>
                {r.marks.length === 0 ? <span className={styles.none}>nenhuma</span> : r.marks.slice(0, 3).join("; ") + (r.marks.length > 3 ? `; mais ${r.marks.length - 3}` : "")}
              </span>
            </div>
          ))}
        </div>
      </div>
      <p className={styles.count}>{total > rows.length ? `Mostrando ${rows.length} de ${total} lancamentos lidos, na ordem escolhida.` : `${total} ${total === 1 ? "lancamento lido" : "lancamentos lidos"}.`}</p>
    </>
  );
}

export function MemepumpTab({ patch, chainIndex, client, onPickToken, onFeedState, nowMs }: OnchainTabProps) {
  const onchain = useMemo(() => client ?? createOnchainClient(), [client]);
  const now = nowMs ?? Date.now();
  const [stage, setStage] = useState<MemeStage>("NEW");
  const [sort, setSort] = useState<LaunchSort>("volume");

  const apiChains = useOnchainResource("chains", (user, _s) => onchain.chains(user ? "user" : "background"));
  const launches = useOnchainResource(`memepump:${chainIndex}:${stage}`, (user, _s) => onchain.memepump({ chainIndex, stage }, user ? "user" : "background"));
  const model = useMemo(() => launchRows(launches.state.data ?? [], now, sort, 12), [launches.state.data, now, sort]);
  const chips = useMemo(() => chainChips({ apiChains: apiChains.state.data, resourceChains: null, resourceLabel: "lancamentos" }), [apiChains.state.data]);

  useEffect(() => {
    onFeedState?.(feedStateOfResource(launches.state.status, launches.state.meta?.stale ?? null, model.rows.length));
  }, [onFeedState, launches.state.status, launches.state.meta, model.rows.length]);

  return (
    <div className={dockStyles.fill}>
      <div className={styles.toolbar}>
        <ChainChips chips={chips} value={chainIndex} onSelect={(next) => patch({ chainIndex: next })} ariaLabel="Rede para lancamentos" />
        <div className={styles.chipRow} role="group" aria-label="Etapa do lancamento">
          {MEME_STAGES.map((s) => (
            <button key={s.id} type="button" className={styles.chip} aria-pressed={stage === s.id} onClick={() => setStage(s.id)}>
              {s.label}
            </button>
          ))}
        </div>
        <div className={styles.chipRow} role="group" aria-label="Ordem dos lancamentos">
          {LAUNCH_SORTS.map((s) => (
            <button key={s.id} type="button" className={styles.chip} aria-pressed={sort === s.id} onClick={() => setSort(s.id)}>
              {s.label}
            </button>
          ))}
        </div>
        <OnchainHead meta={launches.state.meta} onReload={launches.reload} />
      </div>
      <p className={styles.note}>Tokens recem lancados na rede, segundo a OKX. As marcas de cuidado sao medidas (quem segura a oferta, quem comprou cedo, se ha rede social), nao um veredito: abra o token e peca ao Inonu.</p>
      <OnchainBody state={launches.state} rows={model.rows.length} emptyText={EMPTY} render={() => <LaunchTable rows={model.rows} total={model.total} {...(onPickToken === undefined ? {} : { onPick: onPickToken })} />} />
    </div>
  );
}
