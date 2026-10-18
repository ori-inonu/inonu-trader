"use client";

import { useEffect, useMemo, useState } from "react";
import { CHAIN_ORDER } from "@/lib/onchain/chains";
import { createOnchainClient } from "@/lib/onchain/client";
import { DEFAULT_SCAN_CHAINS, loadChains, SCAN_MAX_CHAINS, saveChains, useEcosystemScan, type EcosystemState } from "@/lib/onchain/ecosystem-scan";
import { EVIDENCE_LABEL, EVIDENCE_ORDER, opportunityBoard, type ChainStatus, type OpportunityRow } from "@/lib/onchain/opportunities";
import { fmtAgeMs } from "@/lib/mesa/onchain-rows";
import { AssetIcon } from "../AssetIcon";
import type { PanelFeedState } from "../panels/PanelFrame";
import dockStyles from "./DockTabs.module.css";
import { type OnchainTabProps, type SelectedToken } from "./OnchainTabs";
import styles from "./EcosystemTab.module.css";

/**
 * "Ecossistema" of the Radar: where to look across SEVERAL networks at once, beyond what the person already holds. One click reads, for each chosen network, the hot list and the purchases of
 * the wallets the provider tracks (two reads of the OnchainOS gateway, no model), and the board shows the tokens with more than one independent reading in their favour, each with its marks of
 * care. The code DESCRIBES: the readings and the marks are measurements with limits this code chose (written in `lib/onchain/opportunities.ts` and not calibrated), the order is how many hold,
 * and what is worth doing is the Inonu's call, asked by a click on the token (it opens its chart and its holders). Nothing here sends an order.
 */

const SHORT = new Map(CHAIN_ORDER.map((c) => [c.chainIndex, c.short]));

const PROBLEMS = (chains: readonly ChainStatus[]): readonly ChainStatus[] => chains.filter((c) => c.state !== "ok");

export function EcosystemBoardTable({ rows, onPick }: { readonly rows: readonly OpportunityRow[]; readonly onPick?: (token: SelectedToken) => void }) {
  return (
    <div className={dockStyles.table} role="table" aria-label="Oportunidades no ecossistema">
      <div className={dockStyles.scroll} role="rowgroup">
        <div className={`${styles.row} ${dockStyles.thead}`} role="row">
          <span role="columnheader" className={styles.left}>Token</span>
          <span role="columnheader" className={styles.left}>Leituras a favor</span>
          <span role="columnheader">24 h</span>
          <span role="columnheader">Volume 24 h</span>
          <span role="columnheader">Liquidez</span>
          <span role="columnheader" className={styles.left}>Marcas de cuidado</span>
        </div>
        {rows.map((r) => (
          <div key={r.key} className={styles.row} role="row" data-marked={r.marks.length > 0 ? "true" : undefined}>
            <span role="cell" className={`${styles.left} ${styles.token}`}>
              <AssetIcon ccy={null} chain={r.chainIndex} fallback={SHORT.get(r.chainIndex) ?? "?"} size={18} />
              <span className={styles.tokenText}>
                {onPick === undefined ? (
                  <span className={styles.symbol}>{r.symbol}</span>
                ) : (
                  <button type="button" className={styles.pick} onClick={() => onPick({ chainIndex: r.chainIndex, address: r.address, symbol: r.symbol })} aria-label={`Abrir ${r.symbol} em ${r.chainName}`}>
                    {r.symbol}
                  </button>
                )}
                <small>{`${r.chainName}, ${r.price}`}</small>
              </span>
            </span>
            <span role="cell" className={`${styles.left} ${styles.evidence}`}>
              {EVIDENCE_ORDER.map((id) => {
                const found = r.evidence.find((e) => e.id === id);
                return (
                  <span key={id} className={styles.pill} data-on={found === undefined ? "false" : "true"} title={found?.text ?? `${EVIDENCE_LABEL[id]}: sem leitura a favor`}>
                    {EVIDENCE_LABEL[id]}
                    <span className={styles.srOnly}>{found === undefined ? ", sem leitura a favor" : `: ${found.text}`}</span>
                  </span>
                );
              })}
            </span>
            <span role="cell" className={styles.num} data-tone={r.change.tone}>{r.change.text}</span>
            <span role="cell" className={styles.num}>{r.volume}</span>
            <span role="cell" className={styles.num}>{r.liquidity}</span>
            <span role="cell" className={`${styles.left} ${styles.marks}`}>
              {r.marks.length === 0 ? <span className={styles.none}>nenhuma</span> : r.marks.slice(0, 2).join("; ") + (r.marks.length > 2 ? `; mais ${r.marks.length - 2}` : "")}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export interface EcosystemViewProps {
  readonly state: EcosystemState;
  readonly chosen: readonly string[];
  readonly nowMs: number;
  readonly onToggle: (chainIndex: string) => void;
  readonly onScan: () => void;
  readonly onPick?: (token: SelectedToken) => void;
}

/** What the person reads, a pure function of the state: every state of the tab is drawn in tests without a server. */
export function EcosystemView({ state, chosen, nowMs, onToggle, onScan, onPick }: EcosystemViewProps) {
  const board = useMemo(() => opportunityBoard(state.scans, 12), [state.scans]);
  const scanning = state.status === "scanning";
  const reads = chosen.length * 2;
  const problems = PROBLEMS(board.chains);
  const tokensRead = board.chains.reduce((sum, c) => sum + c.tokens, 0);
  const age = state.finishedAtMs === null ? null : fmtAgeMs(Math.max(0, nowMs - state.finishedAtMs));
  return (
    <div className={dockStyles.fill}>
      <div className={styles.toolbar}>
        <div className={styles.chains} role="group" aria-label="Redes da varredura">
          {CHAIN_ORDER.map((c) => {
            const on = chosen.includes(c.chainIndex);
            const full = !on && chosen.length >= SCAN_MAX_CHAINS;
            return (
              <button key={c.chainIndex} type="button" className={styles.chain} aria-pressed={on} disabled={scanning || full} title={full ? `No maximo ${SCAN_MAX_CHAINS} redes por varredura` : c.name} onClick={() => onToggle(c.chainIndex)}>
                <AssetIcon ccy={null} chain={c.chainIndex} fallback={c.short} size={14} />
                {c.name}
              </button>
            );
          })}
        </div>
        <button type="button" className={styles.scan} onClick={onScan} disabled={scanning || chosen.length === 0}>
          {scanning ? `Lendo ${state.scans.length + 1} de ${state.targets.length}` : state.status === "ready" ? "Varrer de novo" : "Varrer o ecossistema"}
        </button>
      </div>

      <p className={styles.note}>
        {state.status === "idle"
          ? `Le ${chosen.length} ${chosen.length === 1 ? "rede" : "redes"}, ate ${reads} leituras da OnchainOS, sem consultar o modelo. Nada roda antes do clique.`
          : scanning
            ? `Lendo as redes uma de cada vez: ${state.scans.length} de ${state.targets.length} prontas.`
            : `Lido ${age ?? "agora"}: ${tokensRead} tokens em ${board.chains.length} ${board.chains.length === 1 ? "rede" : "redes"}, ${board.total} com leituras a favor${board.total > board.rows.length ? `, mostrando ${board.rows.length}` : ""}.`}
      </p>

      {board.rows.length > 0 ? (
        <EcosystemBoardTable rows={board.rows} {...(onPick === undefined ? {} : { onPick })} />
      ) : (
        <div className={dockStyles.empty} role="status">
          {state.status === "idle"
            ? "Escolha as redes e varra: o quadro mostra os tokens com mais de uma leitura a favor, e o que pede cuidado em cada um."
            : scanning
              ? "Lendo..."
              : "Nenhum token das redes lidas tem leituras a favor agora."}
        </div>
      )}

      {problems.length > 0 ? (
        <p className={styles.problems} role="note">
          {problems.map((c) => `${c.chainName}: ${c.state === "falhou" ? "nao foi lida" : "lida em parte"} (${c.note ?? "sem detalhe"})`).join("; ")}
        </p>
      ) : null}
      <p className={styles.caveat}>Leituras e marcas sao medidas com limites escolhidos pelo codigo, ainda nao calibrados, e nao sao recomendacao. Abra o token e peca ao Inonu.</p>
    </div>
  );
}

export function EcosystemTab({ client, onPickToken, onFeedState, nowMs }: OnchainTabProps) {
  const onchain = useMemo(() => client ?? createOnchainClient(), [client]);
  const { state, scan } = useEcosystemScan();
  const [chosen, setChosen] = useState<readonly string[]>(DEFAULT_SCAN_CHAINS);
  const [clock, setClock] = useState(nowMs ?? 0);

  // the saved choice is read only after mount, so the first markup is always the default one
  useEffect(() => setChosen(loadChains()), []);
  useEffect(() => {
    if (nowMs !== undefined) return;
    setClock(Date.now());
    const timer = setInterval(() => setClock(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, [nowMs]);

  const toggle = (chainIndex: string) => {
    setChosen((current) => {
      const next = current.includes(chainIndex) ? current.filter((c) => c !== chainIndex) : [...current, chainIndex].slice(0, SCAN_MAX_CHAINS);
      saveChains(next);
      return next;
    });
  };

  const rows = useMemo(() => opportunityBoard(state.scans, 12).rows.length, [state.scans]);
  const feed: PanelFeedState = state.status === "idle" ? "empty" : rows === 0 ? "empty" : state.finishedAtMs !== null && (nowMs ?? clock) - state.finishedAtMs > 10 * 60_000 ? "stale" : "live";
  useEffect(() => {
    onFeedState?.(feed);
  }, [onFeedState, feed]);

  return <EcosystemView state={state} chosen={chosen} nowMs={nowMs ?? clock} onToggle={toggle} onScan={() => scan(chosen, onchain)} {...(onPickToken === undefined ? {} : { onPick: onPickToken })} />;
}
