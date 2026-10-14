"use client";

/**
 * "Pedir ao Inonu" (ASK-2, ASK-7, ASK-9, ASK-10): the ONLY way to consult the model. The button is the only trigger; nothing
 * on the desk asks on its own. The state line replaces the old System One sentence ("Sem pedido", "Perguntando ao Inonu",
 * "Inonu respondeu ha N min"); the answer is a card with Aceitar, Ignorar and Silenciar tipo, and shows the model as
 * provenance only ("modelo: Jev"). The desk is advisory: Aceitar writes a line in the local journal and sends no order.
 * The drawing part is a pure component, so every state is rendered in tests without a server or a model.
 */
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { type AcceptResult, acceptNote, acceptOutcome } from "@/lib/inonu/accept";
import { sharedTicket } from "@/lib/wallet/ticket";
import { sharedLedgerSignal } from "@/lib/inonu/ledger-signal";
import { type AskSubject, askButtonLabel, askRequestFor, journalInstId, subjectKey, subjectLabel } from "@/lib/inonu/ask-target";
import { sharedAskTrigger, takeAndAsk } from "@/lib/inonu/ask-trigger";
import { createInonuClient, type AskAnswer, type InonuStatus } from "@/lib/inonu/client";
import { sharedDecisionStore } from "@/lib/inonu/decision-store";
import { askReducer, createInonuJournal, type StorageLike } from "@/lib/inonu/journal";
import { candidateKind, costLine, decisionHeadline, stateLine, type AskViewState, type CandidateKind } from "@/lib/inonu/view";
import PerfilInline from "@/components/Veredito/PerfilInline";
import PlacarLine from "@/components/Veredito/PlacarLine";
import { VereditoBody } from "@/components/Veredito/VereditoBody";
import styles from "./InonuAsk.module.css";

export interface InonuAskPanelProps {
  readonly state: AskViewState;
  readonly nowMs: number;
  readonly instId: string;
  /** What the request is about when it is an on-chain token ("SOL na rede 501"); null for an OKX instrument. */
  readonly targetLabel?: string | null;
  /** The words of the button; the answer is always a click away, whatever it says. Default "Pedir ao Inonu". */
  readonly askLabel?: string;
  readonly status: InonuStatus | null;
  readonly mutedKinds: ReadonlySet<CandidateKind>;
  /** What the person already did with the current answer. */
  readonly note: AcceptResult | null;
  readonly onAsk: () => void;
  readonly onCancel: () => void;
  readonly onAccept: () => void;
  readonly onIgnore: () => void;
  readonly onMute: (kind: CandidateKind) => void;
  readonly onUnmute: (kind: CandidateKind) => void;
}

const FEED_WORD: Readonly<Record<string, string>> = { idle: "parado", connecting: "conectando", reconnecting: "reconectando", error: "com erro", closed: "encerrado" };

/** One line about the live flow of this instrument: how far the warm-up is, or that it is ready. */
export function engineLine(status: InonuStatus | null, instId: string): string | null {
  if (status === null || status.engine.feedState === null) return null;
  if (status.engine.feedState !== "live") return `Fluxo ao vivo: ${FEED_WORD[status.engine.feedState] ?? status.engine.feedState}`;
  const own = status.engine.instruments.find((i) => i.instId === instId);
  if (own === undefined) return null;
  return own.closedCandles < own.needed ? `Aquecendo o fluxo: ${own.closedCandles} de ${own.needed} min` : "Fluxo pronto";
}

export function InonuAskPanel(p: InonuAskPanelProps) {
  const asking = p.state.phase === "asking";
  const answered = p.state.phase === "answered" ? p.state : null;
  const decision = answered?.answer.decisao;
  const kind = decision === undefined ? null : candidateKind(decision.candidateId);
  const muted = kind !== null && kind !== "manter" && p.mutedKinds.has(kind);
  // the flow of the engine is about OKX instruments; for an on-chain token there is none to tell
  const flow = p.targetLabel ? null : engineLine(p.status, p.instId);
  // when the request itself failed for lack of a key, the state line says it (as the link) and the hint would only repeat it
  const noKey = p.state.phase === "failed" && p.state.answer.motivo === "sem_chave";

  return (
    <section className={styles.root} aria-label="Pedir ao Inonu">
      <div className={styles.head}>
        <button type="button" className={styles.ask} onClick={p.onAsk} disabled={asking} aria-busy={asking ? "true" : undefined}>
          {p.askLabel ?? "Pedir ao Inonu"}
        </button>
        {asking ? <button type="button" className={styles.ghost} onClick={p.onCancel}>Cancelar</button> : null}
        <span className={styles.state} role="status">
          {noKey ? <a href="/configuracoes">{stateLine(p.state, p.nowMs)}</a> : stateLine(p.state, p.nowMs)}
        </span>
      </div>

      {p.status !== null && !p.status.modelConfigured && !noKey ? (
        <p className={styles.hint}>
          <a href="/configuracoes">Configure a chave do modelo em Configuracoes</a>
        </p>
      ) : null}
      {p.targetLabel ? <p className={styles.hint}>Pergunta sobre {p.targetLabel}</p> : null}
      {flow !== null ? <p className={styles.hint}>{flow}</p> : null}

      {answered && decision && !muted ? (
        <div className={styles.card}>
          {answered.answer.veredito ? (
            <VereditoBody veredito={answered.answer.veredito} instId={p.instId} perfilSlot={<PerfilInline />} placarSlot={<PlacarLine />} />
          ) : (
            <>
              <p className={styles.headline}>{decisionHeadline(decision)}</p>
              <p className={styles.reason}>{decision.razao}</p>
            </>
          )}
          <p className={styles.meta}>
            modelo: Jev ({decision.modelo}). {costLine(answered.answer.custo)}
          </p>
          {answered.answer.veredito ? null : <p className={styles.meta}>Consultivo: nenhuma ordem e enviada.</p>}
          {p.note === null ? (
            <div className={styles.actions}>
              <button type="button" className={styles.action} onClick={p.onAccept}>Aceitar</button>
              <button type="button" className={styles.ghost} onClick={p.onIgnore}>Ignorar</button>
              {kind !== null && kind !== "manter" ? (
                <button type="button" className={styles.ghost} onClick={() => p.onMute(kind)}>Silenciar {kind}</button>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      {answered && decision && muted && kind !== null ? (
        <p className={styles.hint}>
          Respostas de {kind} silenciadas.{" "}
          <button type="button" className={styles.link} onClick={() => p.onUnmute(kind)}>Reativar {kind}</button>
        </p>
      ) : null}

      {p.note !== null ? <p className={styles.note}>{acceptNote(kind ?? "manter", p.note)}</p> : null}
    </section>
  );
}

function safeStorage(): StorageLike | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

const REFRESH_MS = 30_000;

export default function InonuAsk({ instId, subject, onBusyChange }: { readonly instId: string; readonly subject?: AskSubject; readonly onBusyChange?: (busy: boolean) => void }) {
  // the subject is what the desk has in focus: an OKX instrument, or an on-chain token picked on the Smart money view or the asset picker
  const target: AskSubject = subject ?? { kind: "okx", instId };
  const key = subjectKey(target);
  const client = useMemo(() => createInonuClient(), []);
  const journal = useMemo(() => createInonuJournal(safeStorage()), []);
  const [state, dispatch] = useReducer(askReducer, { phase: "idle" } as AskViewState);
  const [status, setStatus] = useState<InonuStatus | null>(null);
  const [muted, setMuted] = useState<ReadonlySet<CandidateKind>>(new Set());
  const [note, setNote] = useState<AcceptResult | null>(null);
  const [nowMs, setNowMs] = useState(0);
  const controller = useRef<AbortController | null>(null);
  const alive = useRef(true);
  // the screen that holds the panel can lock what the request is about while it runs (a rows change would drop a paid answer)
  const busyRef = useRef(onBusyChange);
  busyRef.current = onBusyChange;
  const asking = state.phase === "asking";
  useEffect(() => {
    busyRef.current?.(asking);
  }, [asking]);
  useEffect(() => () => busyRef.current?.(false), []);
  /** When the answer on screen was published to the chart, so Aceitar and Ignorar find it. */
  const publishedAt = useRef<number | null>(null);

  const refreshStatus = useCallback(() => {
    void client.status().then((s) => {
      if (alive.current) setStatus(s);
    });
  }, [client]);

  useEffect(() => {
    alive.current = true;
    setNowMs(Date.now());
    setMuted(journal.mutedKinds());
    refreshStatus();
    const timer = setInterval(() => {
      setNowMs(Date.now());
      refreshStatus();
    }, REFRESH_MS);
    return () => {
      alive.current = false;
      clearInterval(timer);
    };
  }, [journal, refreshStatus]);

  // an answer is about one instrument: when the desk moves to another, the card goes away
  useEffect(() => {
    dispatch({ type: "dismiss" });
    setNote(null);
  }, [key]);

  const ask = () => {
    if (state.phase === "asking") return;
    dispatch({ type: "ask" });
    setNote(null);
    controller.current = new AbortController();
    void client.ask(askRequestFor(target), controller.current.signal).then((answer: AskAnswer) => {
      // the ledger has a new line whichever panel is on screen now: the tail of the Inonu tab reads it again
      sharedLedgerSignal().notify();
      if (!alive.current) return;
      setNowMs(Date.now());
      dispatch({ type: "answer", answer, nowMs: Date.now() });
      publishToChart(answer);
      refreshStatus();
    });
  };

  // the chart draws the answer of the model for this instrument; a reused answer (same Brief) is not a new one
  const publishToChart = (answer: AskAnswer) => {
    const decision = answer.status === "respondido" ? answer.decisao : undefined;
    publishedAt.current = null;
    // a ranking is about several instruments at once: the chart of one of them is not where it is drawn
    if (decision === undefined || target.kind === "ranking") return;
    const store = sharedDecisionStore();
    const known = store.list().some((d) => d.instId === key && d.action === decision.action && d.candidateId === decision.candidateId && d.status !== "ignorada");
    if (answer.reutilizado === true && known) return;
    const atMs = Date.now();
    publishedAt.current = atMs;
    store.publish({ action: decision.action, candidateId: decision.candidateId, atMs, instId: key, modelo: decision.modelo, kind: candidateKind(decision.candidateId) ?? "manter", status: "nova", ...(answer.veredito === undefined ? {} : { veredito: answer.veredito }) });
  };

  // the button of an alert leaves a request for this subject; the panel, which owns the guards and the call, asks once when it sees it
  const askRef = useRef(ask);
  askRef.current = ask;
  useEffect(() => {
    const check = () => void takeAndAsk(sharedAskTrigger(), key, () => askRef.current());
    check();
    return sharedAskTrigger().subscribe(check);
  }, [key]);

  const cancel = () => {
    void client.status().then(async (s) => {
      if (s?.running) await client.cancel(s.running.id);
    });
    controller.current?.abort();
    dispatch({ type: "cancelled" });
  };

  const record = (accepted: boolean) => {
    if (state.phase !== "answered" || !state.answer.decisao) return;
    const { decisao } = state.answer;
    // what is written depends on the family of the candidate (ASK-14); in none of them is an order sent
    const outcome = acceptOutcome({ instId: journalInstId(target, decisao.candidateId), decisao, briefHash: state.answer.briefHash, symbol: target.kind === "token" ? target.symbol : null, accepted, atMs: Date.now() });
    journal.add(outcome.entry);
    // an accepted answer about a token only FILLS the draft of the ticket of the Carteira tab: no amount, nothing sent
    if (outcome.draft !== null) sharedTicket().fill(outcome.draft);
    setNote(outcome.note);
    if (publishedAt.current !== null) sharedDecisionStore().resolve(key, publishedAt.current, accepted);
  };

  return (
    <InonuAskPanel
      state={state}
      nowMs={nowMs}
      instId={key}
      targetLabel={target.kind === "okx" ? null : subjectLabel(target)}
      askLabel={askButtonLabel(target)}
      status={status}
      mutedKinds={muted}
      note={note}
      onAsk={ask}
      onCancel={cancel}
      onAccept={() => record(true)}
      onIgnore={() => record(false)}
      onMute={(kind) => {
        journal.mute(kind);
        setMuted(journal.mutedKinds());
        sharedDecisionStore().touch();
      }}
      onUnmute={(kind) => {
        journal.unmute(kind);
        setMuted(journal.mutedKinds());
        sharedDecisionStore().touch();
      }}
    />
  );
}
