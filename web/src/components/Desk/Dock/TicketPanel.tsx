"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { LADDER_GAP_MS, ladderAmounts, readLadder, rungText, toMinorUnits, type LadderReader, type Rung } from "@/lib/wallet/ladder";
import { createQuoteReader } from "@/lib/wallet/quote";
import { useChartDetail } from "@/lib/desk/chart/detail-store";
import { createRunGuard } from "@/lib/wallet/run-guard";
import { draftAgeText, sharedTicket, ticketPlan, type TicketDraft, type TicketPlan } from "@/lib/wallet/ticket";
import styles from "./TicketPanel.module.css";

/**
 * The order ticket of the Carteira tab (T9.6, WAL-5, WAL-6, WAL-7). It only SHOWS: the network and the token that an accepted answer of Inonu left, the coin
 * to pay with, the size the person types, the limit of impact they set, and the ladder of quotes the provider gives for a few sizes around it. There is no
 * button that sends, no field for a key, and nothing that prepares a transaction to be signed; what the gateway does not serve yet (the minimum received,
 * the slippage, the approval step) is said as unavailable and never filled with a guess.
 */

const RUNGS = 3;

export interface TicketPanelViewProps {
  readonly draft: TicketDraft | null;
  readonly plan: TicketPlan | null;
  readonly payIndex: number;
  readonly size: string;
  readonly impactLimit: string;
  /** Null until the person asked for a quote. */
  readonly rungs: readonly Rung[] | null;
  readonly reading: boolean;
  /** The clock of the screen: a quote on it gets old with the time. */
  readonly nowMs?: number;
  readonly onPay: (index: number) => void;
  readonly onSize: (text: string) => void;
  readonly onImpactLimit: (text: string) => void;
  readonly onQuote: () => void;
  readonly onCancel: () => void;
  readonly onClear: () => void;
}

/** The limit of impact the person typed, in percent: a number above zero and at most one hundred, or null. */
export function parseImpactLimit(text: string): number | null {
  const clean = text.trim().replace(",", ".");
  if (!/^\d+(?:\.\d+)?$/.test(clean)) return null;
  const value = Number(clean);
  return Number.isFinite(value) && value > 0 && value <= 100 ? value : null;
}

const SIDE_TEXT = { buy: "Receber o token", sell: "Entregar o token" } as const;

export function TicketPanelView(p: TicketPanelViewProps) {
  if (p.draft === null || p.plan === null) {
    return (
      <section className={styles.root} aria-label="Ticket de ordem">
        <h3 className={styles.title}>Ticket de ordem</h3>
        <p className={styles.muted}>Nenhum ticket. Aceite uma resposta do Inonu sobre um token para preencher este ticket.</p>
        <p className={styles.note}>Nenhuma ordem e enviada.</p>
      </section>
    );
  }
  const { draft, plan } = p;
  const pay = plan.pay[p.payIndex] ?? plan.pay[0] ?? null;
  const sizeOk = pay !== null && toMinorUnits(p.size, pay.decimals) !== null;
  const limit = parseImpactLimit(p.impactLimit);
  const rows = p.rungs === null ? null : p.rungs.map((r) => rungText(r, { impactLimitPct: limit ?? 1, ...(p.nowMs === undefined ? {} : { nowMs: p.nowMs }) }));
  const trialEnded = p.rungs !== null && p.rungs.some((r) => r.state === "erro" && r.error === "provider_payment_required");
  return (
    <section className={styles.root} aria-label="Ticket de ordem">
      <h3 className={styles.title}>Ticket de ordem</h3>
      <dl className={styles.facts}>
        <div>
          <dt>Rede</dt>
          <dd>{plan.chain === null ? `Rede ${draft.chainIndex}, fora da lista do app` : plan.chain.name}</dd>
        </div>
        <div>
          <dt>Token</dt>
          <dd className={styles.mono}>{`${draft.tokenSymbol ?? "token"} ${draft.tokenAddress}`}</dd>
        </div>
        <div>
          <dt>Lado do modelo</dt>
          <dd>{SIDE_TEXT[draft.acao]}</dd>
        </div>
        {p.nowMs === undefined ? null : (
          <div>
            <dt>Preenchido</dt>
            <dd>{draftAgeText(draft.atMs, p.nowMs)}</dd>
          </div>
        )}
      </dl>

      {plan.quotable ? (
        <>
          <div className={styles.form}>
            <label className={styles.field}>
              <span>Pagar com</span>
              <select aria-label="Pagar com" value={String(p.payIndex)} disabled={p.reading} onChange={(e) => p.onPay(Number(e.target.value))}>
                {plan.pay.map((coin, index) => (
                  <option key={coin.contract} value={String(index)}>
                    {coin.symbol}
                  </option>
                ))}
              </select>
            </label>
            <label className={styles.field}>
              <span>Tamanho</span>
              <input type="text" inputMode="decimal" aria-label="Tamanho na moeda de pagamento" value={p.size} disabled={p.reading} onChange={(e) => p.onSize(e.target.value)} />
            </label>
            <label className={styles.field}>
              <span>Limite de impacto (%)</span>
              <input type="text" inputMode="decimal" aria-label="Limite de impacto em percentual" value={p.impactLimit} disabled={p.reading} onChange={(e) => p.onImpactLimit(e.target.value)} />
            </label>
            {p.reading ? (
              <button type="button" className={styles.button} onClick={p.onCancel}>
                Cancelar
              </button>
            ) : (
              <button type="button" className={styles.button} disabled={!sizeOk || limit === null} onClick={p.onQuote}>
                Cotar
              </button>
            )}
          </div>
          <p className={styles.note}>{`Cotar usa ${RUNGS} leituras da OKX OnchainOS, uma por segundo (${String(LADDER_GAP_MS / 1000).replace(".", ",")} s entre elas). O tamanho do meio e o que voce digitou.`}</p>
          {!p.reading && (!sizeOk || limit === null) ? (
            <p className={styles.note}>Para cotar: digite um tamanho valido, com no maximo as casas da moeda, e um limite de impacto maior que 0 e ate 100.</p>
          ) : null}
        </>
      ) : (
        <p className={styles.muted}>{plan.reason}</p>
      )}

      {rows !== null ? (
        <div className={styles.table} role="table" aria-label="Escada de cotacoes">
          <div className={`${styles.row} ${styles.head}`} role="row">
            {["Tamanho", "Paga", "Recebe", "Impacto", "Gas estimado (menor unidade)", "Taxa da rota (USD)", "Idade", "Estado"].map((label) => (
              <div key={label} className={styles.cell} role="columnheader">
                {label}
              </div>
            ))}
          </div>
          {rows.map((row, index) => (
            <div key={`${row.rotulo}-${index}`} className={styles.row} role="row" data-tom={row.tom}>
              <div className={styles.cell} role="cell">{row.rotulo}</div>
              <div className={styles.cell} role="cell">{row.paga}</div>
              <div className={styles.cell} role="cell">{row.recebe}</div>
              <div className={styles.cell} role="cell">{row.impacto}</div>
              <div className={styles.cell} role="cell">{row.taxaRede}</div>
              <div className={styles.cell} role="cell">{row.taxaTroca}</div>
              <div className={styles.cell} role="cell">{row.idade}</div>
              <div className={styles.cell} role="cell" data-tom={row.tom}>{row.estado}</div>
            </div>
          ))}
        </div>
      ) : null}
      {trialEnded ? <p className={styles.notice}>Estado degradado: a cotacao depende da Trade API da OKX, gratis por 60 dias a partir da criacao da chave. O sistema nao paga.</p> : null}

      <p className={styles.note}>Minimo recebido, tolerancia de preco e etapa de aprovacao aparecem ao revisar a ordem, no painel Ordem pela minha carteira logo abaixo.</p>
      <p className={styles.note}>Nada e enviado a partir daqui: este ticket so mostra cotacoes. O impacto e (recebido - pago) / pago; uma variacao para qualquer lado alem do limite e marcada.</p>
      <div className={styles.form}>
        <button type="button" className={styles.button} onClick={p.onClear}>
          Limpar ticket
        </button>
      </div>
    </section>
  );
}

/** The simple desk shows the ticket only when an answer of the Inonu left one to fill; an empty ticket is a panel with nothing to decide from. */
export default function TicketPanel() {
  const [detail] = useChartDetail();
  const [draft, setDraft] = useState<TicketDraft | null>(null);
  const [payIndex, setPayIndex] = useState(0);
  const [size, setSize] = useState("");
  const [impactLimit, setImpactLimit] = useState("1");
  const [rungs, setRungs] = useState<readonly Rung[] | null>(null);
  const [reading, setReading] = useState(false);
  // only the clock: the age of a quote on the screen grows with it, and nothing is asked of the network
  const [nowMs, setNowMs] = useState(0);
  useEffect(() => {
    setNowMs(Date.now());
    const timer = setInterval(() => setNowMs(Date.now()), 5_000);
    return () => clearInterval(timer);
  }, []);
  // one run at a time: a run that was replaced or invalidated can no longer write into the screen, and the moment of the last request is kept so a ladder
  // that follows a cancelled one still waits out the gap the Trade API asks for
  const guard = useRef(createRunGuard());
  const lastRequestAt = useRef(0);
  const reader = useMemo<LadderReader>(() => {
    const inner = createQuoteReader();
    return { read: (params, signal) => ((lastRequestAt.current = Date.now()), inner.read(params, signal)) };
  }, []);

  useEffect(() => {
    const store = sharedTicket();
    setDraft(store.get());
    return store.subscribe(() => setDraft(store.get()));
  }, []);
  useEffect(() => {
    const own = guard.current;
    return () => own.invalidate();
  }, []);

  // another draft is another subject: what was typed and quoted for the old one does not carry over
  const key = draft === null ? "" : `${draft.chainIndex}:${draft.tokenAddress}:${draft.acao}:${draft.atMs}`;
  useEffect(() => {
    guard.current.invalidate();
    setPayIndex(0);
    setSize("");
    setRungs(null);
    setReading(false);
  }, [key]);

  const plan = useMemo(() => (draft === null ? null : ticketPlan(draft)), [draft]);

  const quote = () => {
    if (draft === null || plan === null || !plan.quotable || reading) return;
    const pay = plan.pay[payIndex] ?? plan.pay[0];
    if (pay === undefined || parseImpactLimit(impactLimit) === null) return;
    const amounts = ladderAmounts(size, pay.decimals, RUNGS);
    if (amounts.length === 0) return;
    const run = guard.current.begin();
    setReading(true);
    const initialDelayMs = Math.max(0, lastRequestAt.current + LADDER_GAP_MS - Date.now());
    void readLadder(reader, { chainIndex: draft.chainIndex, fromToken: pay.contract, toToken: draft.tokenAddress }, amounts, {
      signal: run.signal,
      initialDelayMs,
      onProgress: (now) => {
        if (run.isCurrent()) setRungs(now);
      },
    })
      .catch(() => undefined)
      .finally(() => {
        if (run.isCurrent()) {
          guard.current.release(run);
          setReading(false);
        }
      });
  };

  if (detail === "simples" && draft === null) return null;
  return (
    <TicketPanelView
      draft={draft}
      plan={plan}
      payIndex={payIndex}
      size={size}
      impactLimit={impactLimit}
      rungs={rungs}
      reading={reading}
      nowMs={nowMs}
      onPay={setPayIndex}
      onSize={setSize}
      onImpactLimit={setImpactLimit}
      onQuote={quote}
      onCancel={() => guard.current.stop()}
      onClear={() => sharedTicket().clear()}
    />
  );
}
