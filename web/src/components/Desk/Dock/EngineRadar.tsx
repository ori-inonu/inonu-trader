"use client";

import { type CSSProperties, type ReactNode, useEffect, useMemo, useState } from "react";
import { type AssetCatalog } from "@/lib/desk/useAssetCatalog";
import { instrumentIconSymbol } from "@/lib/onchain/icons";
import { fmtAgeMs } from "@/lib/mesa/onchain-rows";
import { type EngineRow, engineRows, MEASURED_LINE, READING_LABEL, READING_ORDER, READING_RULE } from "@/lib/opportunity/engine";
import { type EngineView, useEngineBoard } from "@/lib/opportunity/useEngineBoard";
import { type AskSubject, subjectKey } from "@/lib/inonu/ask-target";
import { CHOOSE_MAX, chosenIds, chosenLine, rankingSubjectOf, toggleChosen } from "@/lib/rastreador/choose";
import { AssetIcon } from "../AssetIcon";
import InonuAsk from "../InonuAsk";
import OpportunityRadar from "./OpportunityRadar";
import styles from "./EngineRadar.module.css";

/**
 * The radar of the Inonu tab, now behind an engine: where to look first among the liquid pairs of the exchange. The core reads the daily history of EACH pair (free, no model) and the page shows
 * how far out of the ordinary each one is for its own normal (the move of 24 hours in units of its usual range, its volume against its own week), three readings of its history (cheap against
 * itself, the fall seems to have stopped, more money than usual) and the marks that give pause. The person ticks the pairs and the Inonu, asked by a click, ranks them (it also sees the flow
 * engine's zones for each one). Nothing here is a recommendation or a promise of profit: the readings were measured on history and the page says what that measurement found, which is that none
 * of them beat the average firmly, so the order is where to look and never what to buy.
 */

const LIQUIDITY_LINE = "Pares a vista em USDT com pelo menos 1 mi de volume em 24 h e spread de ate 15 bps, sem moedas estaveis. Leitura do historico diario de cada par, feita pelo nucleo local com dados publicos da OKX.";

const SORT_LINE = "Ordem: o que esta mais fora do normal para o proprio par, pelo tamanho do movimento de 24 h em unidades da oscilacao diaria dele e pelo volume contra a media dos 7 dias anteriores; depois, mais volume. Nao e uma ordem de retorno esperado.";

function PickIcon({ on }: { readonly on: boolean }) {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      {on ? <path d="M2.5 6.3 5 8.8l4.5-5" /> : <path d="M6 2.5v7M2.5 6h7" />}
    </svg>
  );
}

export interface EngineRadarViewProps {
  readonly view: EngineView;
  readonly nowMs: number;
  readonly focus: string;
  readonly chosen: readonly string[];
  readonly locked: boolean;
  readonly onOpen: (instId: string) => void;
  readonly onToggle: (instId: string) => void;
  readonly onChooseTop: (instIds: readonly string[]) => void;
  readonly onClear: () => void;
  /** The panel that asks the model to rank the chosen rows, put here by the owner once there are enough of them. */
  readonly rankingSlot?: ReactNode;
  /** The card of the network discovery, below the table. */
  readonly networkSlot?: ReactNode;
  /** The plain list by volume, shown only when the engine could not read anything at all. */
  readonly fallback?: ReactNode;
  /** A line about what the history measured, when there is one (the backtest of the core). */
  readonly measuredLine?: string;
}

function statusLine(view: EngineView, nowMs: number): string {
  const s = view.state;
  if (s === null) return view.reason === null ? "Chamando o motor" : reasonText(view.reason);
  if (s.state === "idle") return "O motor ainda nao leu";
  if (s.state === "lendo") return s.of === 0 ? "Lendo a lista de pares da OKX" : `Lendo o historico de cada par: ${s.done} de ${s.of}`;
  if (s.state === "erro") return s.board === null ? "A OKX nao respondeu ao motor agora" : "A OKX nao respondeu agora, a leitura abaixo e a anterior";
  const age = fmtAgeMs(Math.max(0, nowMs - s.board.asOfMs));
  return `Lido ${age}: ${s.board.universe.read} de ${s.board.universe.liquid} pares liquidos${s.board.universe.failed > 0 ? `, ${s.board.universe.failed} sem leitura` : ""}`;
}

function reasonText(reason: NonNullable<EngineView["reason"]>): string {
  switch (reason) {
    case "sem_conexao":
      return "O servidor local nao respondeu ao motor";
    case "servidor_sem_rota":
      return "O servidor local e mais antigo que o motor: reinicie-o";
    case "origem_negada":
      return "O servidor local nao aceita esta origem";
    default:
      return "O motor respondeu fora do contrato";
  }
}

function Row({ row, rank, focused, picked, locked, atLimit, onOpen, onToggle }: { readonly row: EngineRow; readonly rank: number; readonly focused: boolean; readonly picked: boolean; readonly locked: boolean; readonly atLimit: boolean; readonly onOpen: () => void; readonly onToggle: () => void }) {
  return (
    <div className={styles.row} role="row" data-focus={focused ? "true" : undefined} data-chosen={picked ? "true" : undefined}>
      <span role="cell" className={styles.rank}>{String(rank).padStart(2, "0")}</span>
      <span role="cell" className={`${styles.left} ${styles.pair}`}>
        <AssetIcon ccy={instrumentIconSymbol(row.instId)} size={16} />
        <button type="button" className={styles.open} aria-label={`Abrir ${row.symbol} no grafico`} aria-current={focused ? "true" : undefined} onClick={onOpen}>
          {row.symbol}
        </button>
      </span>
      <span role="cell" className={styles.num}>{row.price}</span>
      <span role="cell" className={styles.num} data-tone={row.change.tone}>{row.change.text}</span>
      <span role="cell" className={`${styles.left} ${styles.unusual}`} title="Movimento de 24 h em unidades da oscilacao diaria do par, e volume de 24 h contra a media dos 7 dias anteriores">
        <span className={styles.unusualText}>{`mov. ${row.unusual.move}, vol. ${row.unusual.volume}`}</span>
        <span className={styles.meter} aria-hidden="true" style={{ "--v": row.unusual.level.toFixed(3) } as CSSProperties} />
      </span>
      <span role="cell" className={`${styles.left} ${styles.readings}`}>
        {READING_ORDER.map((id) => {
          const r = row.readings.find((x) => x.id === id)!;
          return (
            <span key={id} className={styles.pill} data-on={r.on ? "true" : "false"} title={`${READING_LABEL[id]}: ${r.text}`}>
              {r.label}
              <span className="srOnly">{`: ${r.on ? "a favor" : "nao"}, ${r.text}`}</span>
            </span>
          );
        })}
      </span>
      <span role="cell" className={styles.num}>{row.volume}</span>
      <span role="cell" className={`${styles.left} ${styles.marks}`}>
        {row.marks.length === 0 ? <span className={styles.none}>nenhuma</span> : row.marks.join("; ")}
      </span>
      <span role="cell" className={styles.pickCell}>
        <button
          type="button"
          className={styles.pick}
          aria-pressed={picked}
          aria-label={`Escolher ${row.symbol} para o ranking`}
          title={picked ? "Tirar do ranking" : atLimit ? `Limite de ${CHOOSE_MAX} por pedido` : "Escolher para o ranking"}
          disabled={locked || (atLimit && !picked)}
          onClick={onToggle}
        >
          <PickIcon on={picked} />
        </button>
      </span>
    </div>
  );
}

/** What the person reads, a pure function of the state: every state of the radar is drawn in tests without a server or a model. */
export function EngineRadarView(p: EngineRadarViewProps) {
  const board = p.view.state === null || p.view.state.state === "idle" ? null : p.view.state.board;
  const { rows, total } = useMemo(() => engineRows(board, 12), [board]);
  const atLimit = p.chosen.length >= CHOOSE_MAX;
  const reading = p.view.state?.state === "lendo";
  const noBoard = board === null;
  const down = noBoard && (p.view.reason !== null || p.view.state?.state === "erro");
  return (
    <section className={styles.root} aria-label="Radar de oportunidades">
      <div className={styles.head}>
        <div className={styles.titleBox}>
          <span className={styles.eyebrow}>Radar de oportunidades</span>
          <h3 className={styles.title}>O que esta fora do normal agora</h3>
        </div>
        <p className={styles.status} role="status" data-busy={reading ? "true" : undefined}>{statusLine(p.view, p.nowMs)}</p>
        {rows.length >= 2 ? (
          <button type="button" className={styles.top} disabled={p.locked} onClick={() => p.onChooseTop(rows.slice(0, 3).map((r) => r.instId))}>
            Escolher as 3 primeiras
          </button>
        ) : null}
      </div>

      {rows.length > 0 ? (
        <div className={styles.table} role="table" aria-label="Pares liquidos, do mais fora do normal ao menos">
          <div className={styles.scroll} role="rowgroup">
            <div className={`${styles.row} ${styles.thead}`} role="row">
              <span role="columnheader">#</span>
              <span role="columnheader" className={styles.left}>Par</span>
              <span role="columnheader">Preco</span>
              <span role="columnheader">24 h</span>
              <span role="columnheader" className={styles.left}>Fora do normal</span>
              <span role="columnheader" className={styles.left}>Leituras do historico</span>
              <span role="columnheader">Vol. 24 h</span>
              <span role="columnheader" className={styles.left}>Marcas de cuidado</span>
              <span role="columnheader" className="srOnly">Escolher</span>
            </div>
            {rows.map((row, i) => (
              <Row
                key={row.instId}
                row={row}
                rank={i + 1}
                focused={row.instId === p.focus}
                picked={p.chosen.includes(row.instId)}
                locked={p.locked}
                atLimit={atLimit}
                onOpen={() => p.onOpen(row.instId)}
                onToggle={() => p.onToggle(row.instId)}
              />
            ))}
          </div>
        </div>
      ) : board !== null && p.view.state?.state !== "lendo" ? (
        <p className={styles.empty} role="status">Nenhum par liquido foi lido agora. O motor nao inventa uma lista para preencher o radar.</p>
      ) : null}

      {total > rows.length ? <p className={styles.count}>{`Mostrando ${rows.length} dos ${total} pares lidos, na ordem acima.`}</p> : null}

      {down && p.fallback !== undefined ? (
        <div className={styles.fallback}>
          <p className={styles.empty} role="status">Sem a leitura do motor, so a lista simples por volume, que nao e uma leitura de oportunidade.</p>
          {p.fallback}
        </div>
      ) : null}

      <div className={styles.legend}>
        <p className={styles.line}>{p.measuredLine ?? MEASURED_LINE}</p>
        <details className={styles.how}>
          <summary>Como o motor le</summary>
          <p className={styles.line}>{READING_ORDER.map((id) => READING_RULE[id]).join(". ")}.</p>
          <p className={styles.line}>{SORT_LINE}</p>
          <p className={styles.line}>{LIQUIDITY_LINE}</p>
          <p className={styles.line}>Consultivo: nada aqui envia ordem, e uma leitura nao e promessa de ganho.</p>
        </details>
      </div>

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

/**
 * The radar with its own state: the board from the engine, the rows ticked for the ranking and whether a request holds them. Nothing here asks the model by itself; the one button that asks
 * (rank the chosen pairs) is the only trigger, and the card of the network discovery only moves the person to the view that already holds that question.
 */
export default function EngineRadar({
  catalog,
  focus,
  onOpen,
  network,
  measuredLine,
}: {
  readonly catalog: AssetCatalog;
  readonly focus: string;
  readonly onOpen: (instId: string) => void;
  readonly network?: { readonly chainName: string; readonly onOpen: () => void };
  readonly measuredLine?: string;
}) {
  const view = useEngineBoard(true);
  const [nowMs, setNowMs] = useState(0);
  useEffect(() => {
    setNowMs(Date.now());
    const timer = setInterval(() => setNowMs(Date.now()), 15_000);
    return () => clearInterval(timer);
  }, []);
  const [chosenRaw, setChosenRaw] = useState<readonly string[]>([]);
  const [locked, setLocked] = useState(false);

  const known = useMemo(() => (catalog.status === "ready" ? catalog.spot.map((r) => ({ id: r.instId })) : null), [catalog.status, catalog.spot]);
  // a pair the exchange no longer lists drops out of the choice; while the list has not arrived nothing is dropped
  const chosen = useMemo(() => chosenIds(chosenRaw, known), [chosenRaw, known]);
  const subject: AskSubject | null = rankingSubjectOf(chosen);

  return (
    <EngineRadarView
      view={view}
      nowMs={nowMs}
      focus={focus}
      chosen={chosen}
      locked={locked}
      onOpen={onOpen}
      onToggle={(id) => setChosenRaw((c) => toggleChosen(chosenIds(c, known), id))}
      onChooseTop={(ids) => setChosenRaw(chosenIds(ids, known).slice(0, CHOOSE_MAX))}
      onClear={() => setChosenRaw([])}
      rankingSlot={subject === null ? null : <InonuAsk key={subjectKey(subject)} instId={subjectKey(subject)} subject={subject} onBusyChange={setLocked} />}
      networkSlot={network ? <NetworkCard chainName={network.chainName} onOpen={network.onOpen} /> : null}
      fallback={<OpportunityRadar catalog={catalog} focus={focus} onOpen={onOpen} />}
      {...(measuredLine === undefined ? {} : { measuredLine })}
    />
  );
}

/** The door to the on-chain side of the market: it asks nothing, it only takes the person to the view that holds the reads and the question. */
function NetworkCard({ chainName, onOpen }: { readonly chainName: string; readonly onOpen: () => void }) {
  return (
    <div className={styles.network}>
      <span className={styles.eyebrow}>Ecossistema on-chain</span>
      <p className={styles.networkText}>
        Tokens com carteiras rastreadas comprando na rede {chainName}, e a varredura de varias redes de uma vez. A leitura e a pergunta ao modelo ficam no Radar, e so rodam quando voce pedir.
      </p>
      <button type="button" className={styles.networkOpen} onClick={onOpen}>Abrir o Radar</button>
    </div>
  );
}
