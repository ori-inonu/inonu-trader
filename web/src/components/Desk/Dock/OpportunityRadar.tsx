"use client";

import { type CSSProperties, type ReactNode, useMemo, useState } from "react";
import { type AssetCatalog } from "@/lib/desk/useAssetCatalog";
import { RADAR_LENSES, RADAR_MIN_QUOTE_VOLUME, radarRows, type RadarLens, type RadarRow } from "@/lib/desk/ui/opportunity-radar";
import { type AskSubject, subjectKey } from "@/lib/inonu/ask-target";
import { instrumentIconSymbol } from "@/lib/onchain/icons";
import { CHOOSE_MAX, chosenIds, chosenLine, rankingSubjectOf, toggleChosen } from "@/lib/rastreador/choose";
import { AssetIcon } from "../AssetIcon";
import InonuAsk from "../InonuAsk";
import styles from "./OpportunityRadar.module.css";

export interface OpportunityRadarViewProps {
  readonly status: AssetCatalog["status"];
  readonly rows: readonly RadarRow[];
  readonly lens: RadarLens;
  /** The instrument the chart is on, marked on its card. */
  readonly focus: string;
  readonly chosen: readonly string[];
  /** A request is in flight: the choice is held until the answer, so a paid answer is not dropped by a change. */
  readonly locked: boolean;
  readonly onLens: (lens: RadarLens) => void;
  readonly onOpen: (instId: string) => void;
  readonly onToggle: (instId: string) => void;
  readonly onClear: () => void;
  /** The panel that asks the model to rank the chosen rows, put here by the owner once there are enough of them. */
  readonly rankingSlot?: ReactNode;
  /** The card of the network discovery, below the strip. */
  readonly networkSlot?: ReactNode;
}

const FILTER_LINE = `Filtro: pares a vista em USDT com pelo menos ${RADAR_MIN_QUOTE_VOLUME / 1_000_000} mi de volume em 24 h, sem moedas estaveis. Lista da OKX, atualiza a cada 5 min. Consultivo: nada aqui envia ordem.`;

function PickIcon({ on }: { readonly on: boolean }) {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      {on ? <path d="M2.5 6.3 5 8.8l4.5-5" /> : <path d="M6 2.5v7M2.5 6h7" />}
    </svg>
  );
}

/**
 * The radar of the Inonu tab, drawn: where to look first among the pairs of the exchange, ordered by something that was measured
 * (volume or change over 24 hours), as a strip of cards. A card opens the pair on the chart; its small round control ticks it for
 * the ranking that the model makes (two to five). The model alone says buy, hold or sell; this strip says what moved and how much
 * traded, and it says so on the screen. A pure component, so every state is rendered in tests without a server or a model.
 */
export function OpportunityRadarView(p: OpportunityRadarViewProps) {
  const lens = RADAR_LENSES.find((l) => l.id === p.lens) ?? RADAR_LENSES[0]!;
  const atLimit = p.chosen.length >= CHOOSE_MAX;
  return (
    <section className={styles.root} aria-label="Radar de oportunidades">
      <div className={styles.head}>
        <div className={styles.titleBox}>
          <span className={styles.eyebrow}>Radar de oportunidades</span>
          <h3 className={styles.title}>Onde olhar agora</h3>
        </div>
        <div className={styles.lenses} role="group" aria-label="Criterio do radar">
          {RADAR_LENSES.map((l) => (
            <button key={l.id} type="button" className={styles.lens} aria-pressed={l.id === p.lens} onClick={() => p.onLens(l.id)}>{l.label}</button>
          ))}
        </div>
      </div>

      <p className={styles.hint}>{lens.hint}. Ordem por fato medido, nao previsao.</p>

      {p.status === "loading" ? <p className={styles.status} role="status">Lendo a lista da OKX</p> : null}
      {p.status === "error" ? <p className={styles.status} role="status">Lista da OKX indisponivel agora, e nada foi inventado para preencher o radar.</p> : null}
      {p.status === "ready" && p.rows.length === 0 ? <p className={styles.status} role="status">Nenhum par passa o filtro agora nesta lente.</p> : null}

      {p.rows.length > 0 ? (
        <ol className={styles.cards} aria-label={lens.label}>
          {p.rows.map((row) => {
            const focused = row.instId === p.focus;
            const picked = p.chosen.includes(row.instId);
            return (
              <li key={row.instId} className={styles.card} data-card="true" data-focus={focused ? "true" : undefined} data-chosen={picked ? "true" : undefined} style={{ "--v": row.volRatio.toFixed(3) } as CSSProperties}>
                <button type="button" className={styles.open} aria-label={`Abrir ${row.symbol} no grafico`} aria-current={focused ? "true" : undefined} onClick={() => p.onOpen(row.instId)}>
                  <span className={styles.top}>
                    <span className={styles.rank}>{String(row.rank).padStart(2, "0")}</span>
                    <AssetIcon ccy={instrumentIconSymbol(row.instId)} size={16} />
                    <span className={styles.symbol}>{row.symbol}</span>
                  </span>
                  <span className={styles.price}>{row.price}</span>
                  <span className={styles.meta}>
                    <span className={styles.chg} data-tone={row.change.tone}>{row.change.text}</span>
                    <span className={styles.vol}>{row.volume}</span>
                  </span>
                </button>
                <button
                  type="button"
                  className={styles.pick}
                  aria-pressed={picked}
                  aria-label={`Escolher ${row.symbol} para o ranking`}
                  title={picked ? "Tirar do ranking" : atLimit ? `Limite de ${CHOOSE_MAX} por pedido` : "Escolher para o ranking"}
                  disabled={p.locked || (atLimit && !picked)}
                  onClick={() => p.onToggle(row.instId)}
                >
                  <PickIcon on={picked} />
                </button>
                <span className={styles.bar} aria-hidden="true" />
              </li>
            );
          })}
        </ol>
      ) : null}

      <p className={styles.foot}>{FILTER_LINE}</p>

      {p.chosen.length > 0 || p.networkSlot ? (
        <div className={styles.lower}>
          {p.chosen.length > 0 ? (
            <div className={styles.picked}>
              <div className={styles.pickedHead}>
                <p className={styles.pickedLine}>{chosenLine(p.chosen.length)}</p>
                <button type="button" className={styles.clear} onClick={p.onClear} disabled={p.locked}>Limpar escolha</button>
              </div>
              {p.locked ? <p className={styles.pickedLine}>Pedido em andamento: a escolha fica travada ate a resposta</p> : null}
              {p.rankingSlot}
            </div>
          ) : null}
          {p.networkSlot}
        </div>
      ) : null}
    </section>
  );
}

/** The card of the network discovery: the whole network is the subject, and the one button inside is the only thing that reads it. */
function NetworkCard({ chainIndex, chainName }: { readonly chainIndex: string; readonly chainName: string }) {
  const subject: AskSubject = { kind: "descoberta", chainIndex, chainName };
  return (
    <div className={styles.network}>
      <span className={styles.eyebrow}>Ecossistema on-chain</span>
      <p className={styles.networkText}>
        Tokens com carteiras rastreadas comprando na rede {chainName}. Nada roda antes do clique: ele usa ate 15 leituras da OKX OnchainOS e uma consulta ao modelo.
      </p>
      <InonuAsk key={subjectKey(subject)} instId={`descoberta:${chainIndex}`} subject={subject} />
    </div>
  );
}

/**
 * The radar with its own state: the lens, the rows ticked for the ranking and whether a request holds them. Nothing here asks the
 * model by itself; the two buttons it can show (rank the chosen rows, the best entries of a network) are the only triggers.
 */
export default function OpportunityRadar({ catalog, focus, onOpen, network }: { readonly catalog: AssetCatalog; readonly focus: string; readonly onOpen: (instId: string) => void; readonly network?: { readonly chainIndex: string; readonly chainName: string } }) {
  const [lens, setLens] = useState<RadarLens>("volume");
  const [chosenRaw, setChosenRaw] = useState<readonly string[]>([]);
  const [locked, setLocked] = useState(false);

  const rows = useMemo(() => radarRows(catalog.spot, lens), [catalog.spot, lens]);
  // a pair the exchange no longer lists drops out of the choice; while the list has not arrived nothing is dropped
  const chosen = useMemo(() => chosenIds(chosenRaw, catalog.status === "ready" ? catalog.spot.map((r) => ({ id: r.instId })) : null), [chosenRaw, catalog.status, catalog.spot]);
  const subject = rankingSubjectOf(chosen);

  return (
    <OpportunityRadarView
      status={catalog.status}
      rows={rows}
      lens={lens}
      focus={focus}
      chosen={chosen}
      locked={locked}
      onLens={setLens}
      onOpen={onOpen}
      onToggle={(id) => setChosenRaw((c) => toggleChosen(chosenIds(c, catalog.status === "ready" ? catalog.spot.map((r) => ({ id: r.instId })) : null), id))}
      onClear={() => setChosenRaw([])}
      rankingSlot={subject === null ? null : <InonuAsk key={subjectKey(subject)} instId={subjectKey(subject)} subject={subject} onBusyChange={setLocked} />}
      networkSlot={network ? <NetworkCard chainIndex={network.chainIndex} chainName={network.chainName} /> : null}
    />
  );
}
