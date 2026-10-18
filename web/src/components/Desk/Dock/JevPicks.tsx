"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createInonuClient, type InonuStatus } from "@/lib/inonu/client";
import { sharedLedgerSignal } from "@/lib/inonu/ledger-signal";
import { fmtNumber } from "@/lib/desk/ui/format";
import { motivoText } from "@/lib/inonu/view";
import type { BalanceRead } from "@/lib/opportunity/balance";
import { type LastPicks, sharedLastPicks } from "@/lib/opportunity/last-picks";
import { balanceReadiness, balanceRequestFits, createManagementSession, type BalanceReadiness, type ManagementSession, type ManagementSnapshot } from "@/lib/opportunity/management-session";
import { decisionCards, excludedLine, PICKS_STALE_MS, type DecisionCard, type PickCard, type TokenCard, chainName, picksAgeText } from "@/lib/opportunity/picks";
import { useBalanceReader } from "@/lib/opportunity/useBalanceReader";
import type { UseOkxWalletResult } from "@/lib/useOkxWallet";
import { draftFromDecision, sharedTicket, ticketPlan } from "@/lib/wallet/ticket";
import { usdText } from "@/lib/wallet/holdings";
import { AssetIcon } from "../AssetIcon";
import styles from "./JevPicks.module.css";

/**
 * The best opportunities of the whole ecosystem the app reads (RAS-8), in the place the person looks first: up to three tokens the Inonu picked among the candidates the code measured on several
 * networks, each with the SIZE of the purchase worked out from the balance of the wallet, the family of evidence that weighed most and every measurement behind it. The code reads, measures and bounds
 * (it computes the ceiling of each purchase from cash, risk, pool liquidity and volume); the model only chooses among closed options and the code checks them, so no amount on this page was written by a
 * model. One click asks, and it is the only thing that ever asks. "Preparar compra" only FILLS the ticket of the Carteira tab: nothing is sent from here.
 */

export type PicksPhase = "idle" | "reading" | "ready" | "asking";

export interface JevPicksManagementProps {
  readonly hasAccount: boolean;
  readonly reading: BalanceRead | null;
  readonly readiness: BalanceReadiness;
  readonly consent: boolean;
  readonly onRead: () => void;
  readonly onConsent: (value: boolean) => void;
  readonly onAnalyzeMarket: () => void;
  readonly onAnalyzePortfolio: () => void;
}

export interface JevPicksViewProps {
  readonly phase: PicksPhase;
  readonly last: LastPicks | null;
  /** Why the last request gave nothing, in plain words; null when it went well. */
  readonly failure: string | null;
  /** What is missing from the balance (no account, partial read), in plain words; null when it is whole. */
  readonly balanceNote: string | null;
  /** Null until the status of the core is known. */
  readonly modelConfigured: boolean | null;
  /** The clock of the screen; 0 until mounted. */
  readonly nowMs: number;
  readonly management: JevPicksManagementProps;
  readonly canPrepare: (last: LastPicks) => boolean;
  readonly onCancel: () => void;
  readonly onOpen: (card: TokenCard) => void;
  readonly onPrepare: (card: PickCard, last: LastPicks) => void;
}

const HOW_LINES: readonly string[] = [
  "O codigo le, em cada rede, os tokens em alta e os que carteiras rastreadas compraram, e mede seis familias de evidencia: carteiras rastreadas, fluxo de compras, liquidez, distribuicao da oferta, tracao e seguranca. So entra quem tem pool de ao menos US$ 20 mil, 100 detentores e duas familias a favor; token que trava a saida (honeypot) sai antes.",
  "O Inonu responde so por escolha fechada: a postura de cada candidato, o que pesou mais e a ordem. Ele nao escreve numero nem valor; o que ele escolhe e conferido pelo codigo.",
  "O codigo calcula o teto de cada compra como o menor entre o caixa em moeda estavel na rede (depois de uma reserva de 20% da carteira, e no maximo 80% por rede), o risco que voce aceita perder numa operacao (padrao 1% da carteira), 1% da liquidez do pool e 2% do volume de 24 h. O Inonu so escolhe um terco, dois tercos ou o teto inteiro. Abaixo de US$ 10 nao ha compra.",
  "Ao modelo vao so percentuais do saldo; os dolares e o endereco da carteira ficam nesta maquina. Os limites sao escolhas conservadoras do codigo, nao calibradas, e a medicao no historico de precos nao achou vantagem firme: o resultado e uma leitura para decidir, nao uma promessa de ganho.",
];

const FAILURE_TEXT: Readonly<Record<string, string>> = {
  leitura_falhou: "Nao foi possivel ler a carteira agora",
  pedido_falhou: "Nao foi possivel pedir agora",
  sem_consentimento: "A analise da carteira precisa da autorizacao marcada",
  resposta_incompativel: "A resposta nao corresponde a leitura desta consulta. Analise de novo.",
};
const failureText = (code: string): string => FAILURE_TEXT[code] ?? motivoText(code);

function statusLine(p: JevPicksViewProps): string {
  if (p.phase === "reading") return "Lendo seu saldo";
  if (p.phase === "asking") return "Perguntando ao Inonu";
  if (p.failure !== null) return p.failure;
  if (p.last !== null) return `Inonu respondeu ${picksAgeText(p.last.atMs, p.nowMs)}`;
  if (p.phase === "ready") return "Leitura pronta: confira os dados antes de analisar";
  return "Sem pedido";
}

function coverageLine(read: BalanceRead, nowMs: number): string {
  const c = read.coverage;
  const parts: string[] = [`${c.requestedChains.length} ${c.requestedChains.length === 1 ? "rede consultada" : "redes consultadas"}`];
  if (read.saldo !== null) parts.push(`lido ${picksAgeText(read.saldo.observedAtMs, nowMs)}`);
  if (!c.networkListKnown) parts.push("a lista de redes do provedor nao veio");
  if (c.skippedChains.length > 0) parts.push(`${c.skippedChains.length} ${c.skippedChains.length === 1 ? "rede fora" : "redes fora"} da leitura`);
  if (read.missing.length > 0) parts.push(`sem resposta: ${read.missing.map(chainName).join(", ")}`);
  if (c.unpricedRows > 0) parts.push(`${c.unpricedRows} ${c.unpricedRows === 1 ? "ativo com saldo" : "ativos com saldo"} sem preco`);
  if (c.flaggedRows > 0) parts.push(`${c.flaggedRows} ${c.flaggedRows === 1 ? "marcado" : "marcados"} pelo provedor como risco`);
  if (c.truncated) parts.push("a lista foi cortada pelo provedor");
  if (c.stale) parts.push("copia antiga servida");
  return `${parts.join("; ")}.`;
}

function readinessLine(readiness: BalanceReadiness): string {
  switch (readiness) {
    case "ready":
      return "Leitura recente, sem lacunas detectadas nas redes consultadas.";
    case "partial":
      return "Leitura parcial: confira as lacunas antes da analise da carteira.";
    case "stale":
      return "Leitura vencida: leia a carteira de novo antes de analisar.";
    case "unavailable":
      return "Sem saldo lido: a analise da carteira fica indisponivel.";
  }
}

function PickItem({ card, last, stale, allowed, onOpen, onPrepare }: { readonly card: DecisionCard; readonly last: LastPicks; readonly stale: boolean; readonly allowed: boolean; readonly onOpen: () => void; readonly onPrepare: (card: PickCard) => void }) {
  const draft = card.action === "watch" ? null : draftFromDecision({ candidateId: card.candidateId, action: "buy", briefHash: last.briefHash, symbol: card.symbol, atMs: last.atMs });
  const plan = draft === null ? null : ticketPlan(draft);
  const preparable = !stale && card.action === "buy" && card.hasAmount && last.answer.saldo !== null && plan !== null && plan.quotable && allowed;
  const main = card.families.find((f) => f.main);
  return (
    <li className={styles.card} data-rank={card.rank} data-action={card.action}>
      <div className={styles.actionRow}>
        <span className={styles.actionLabel}>{card.action === "watch" ? "Acompanhar" : "Compra indicada pelo Inonu"}</span>
        {card.marks.length === 0 ? null : <span className={styles.careCount}>{card.marks.length} cuidados</span>}
      </div>
      <div className={styles.cardHead}>
        <span className={styles.rank} aria-label={`Posicao ${card.rank}`}>{card.rank}</span>
        <span className={styles.token}>
          <span className={styles.coin} aria-hidden="true">{card.symbol.slice(0, 2).toUpperCase()}</span>
          <span className={styles.tokenText}>
            <span className={styles.symbol}>{card.symbol}</span>
            <span className={styles.chain}>
              <AssetIcon ccy={null} chain={card.chainIndex} fallback={card.chain.slice(0, 2).toUpperCase()} size={14} />
              {card.chain}
            </span>
          </span>
        </span>
        <span className={styles.quote}>
          <span className={styles.price}>{card.price}</span>
          <span className={styles.change}>{card.change} em 24 h</span>
        </span>
      </div>

      {card.action === "watch" ? null : <div className={styles.size} data-has-amount={card.hasAmount ? "true" : "false"}>
        <span className={styles.sizeLabel}>{`Tamanho ${card.sizeLabel}`}</span>
        <span className={styles.amount}>{card.amount}</span>
        {card.share === null ? null : <span className={styles.share}>{card.share}</span>}
      </div>}

      <div className={styles.mainEvidence}>
        <span>{main?.label ?? "Sem fator principal escolhido"}</span>
        {main === undefined ? null : <strong>{main.text}</strong>}
      </div>
      <details className={styles.cardDetails}>
        <summary>Ver dados</summary>
        {card.action === "watch" ? null : <><p className={styles.cap}>{card.capNote}</p><p className={styles.sizeNote}>{card.sizeNote}</p></>}
        <div className={styles.why}>
        <p className={styles.whyHead}>
          {card.driver === null ? "Por que esta na lista" : <>Pesou mais: <strong>{card.driver.label}</strong></>}
        </p>
        <ul className={styles.families}>
          {card.families.map((f) => (
            <li key={f.id} data-main={f.main ? "true" : "false"}>
              <span className={styles.familyLabel}>{f.label}</span>
              <span className={styles.familyText}>{f.text}</span>
            </li>
          ))}
        </ul>
        {card.marks.length === 0 ? null : (
          <p className={styles.marks}>
            <span className={styles.marksHead}>Cuidados</span> {card.marks.join("; ")}
          </p>
        )}
        <p className={styles.support}>{card.supportLine}</p>
        </div>
        {plan === null || plan.quotable ? null : <p className={styles.sideNote}>{plan.reason}</p>}
      </details>

      <div className={styles.actions}>
        <button type="button" className={styles.ghost} onClick={onOpen}>
          Abrir no grafico
        </button>
        {card.action === "watch" ? null : <button type="button" className={styles.prepare} disabled={!preparable} onClick={() => onPrepare(card)} title={preparable ? "Preenche o ticket da aba Carteira. Nada e enviado." : stale ? "Atualize a decisao antes de preparar" : !allowed ? "A leitura ou a resposta mudou: leia a carteira e analise de novo antes de preparar" : !card.hasAmount || last.answer.saldo === null ? "Sem saldo elegivel para esta compra" : (plan?.reason ?? "Este token nao pode ser preparado")}>
          Preparar compra
        </button>}
      </div>
    </li>
  );
}

/** What the person reads, a pure function of the state: every state is drawn in tests without a server, a wallet or a model. */
export function JevPicksView(p: JevPicksViewProps) {
  const busy = p.phase === "reading" || p.phase === "asking";
  const m = p.management;
  const cards = useMemo(() => (p.last === null ? [] : decisionCards(p.last.answer)), [p.last]);
  const stale = p.last !== null && p.nowMs > 0 && p.nowMs - p.last.atMs > PICKS_STALE_MS;
  const read = m.reading;
  const oversized = read !== null && !balanceRequestFits(read);
  const personal = read !== null && read.saldo !== null && m.readiness === "ready" && m.consent && p.modelConfigured !== false;
  return (
    <section className={styles.root} aria-label="Melhores oportunidades do ecossistema">
      <div className={styles.head}>
        <div className={styles.titleBox}>
          <span className={styles.eyebrow}>Inonu</span>
          <h3 className={styles.title}>Proximos movimentos</h3>
        </div>
        <span className={styles.spotBadge}>A vista / Sem margem</span>
      </div>
      <p className={styles.status} role="status" data-failed={p.failure !== null && !busy ? "true" : undefined}>
        {statusLine(p)}
      </p>

      <div className={styles.manage}>
        <ol className={styles.stages} aria-label="Etapas da analise da carteira">
          <li>1 Ler carteira</li>
          <li>2 Conferir dados</li>
          <li>3 Analisar com Inonu</li>
        </ol>
        <p className={styles.stepNote}>Cobertura limitada as redes e aos tokens retornados pela OKX; filtros do provedor podem omitir ativos.</p>

        <div className={styles.stageBody}>
          {m.hasAccount ? (
            <button type="button" className={styles.ghost} onClick={m.onRead} disabled={busy} aria-busy={p.phase === "reading" ? "true" : undefined}>
              Ler carteira
            </button>
          ) : (
            <p className={styles.stepNote}>Sem carteira conectada nem endereco acompanhado: conecte na aba Carteira. A analise de mercado segue disponivel.</p>
          )}
          <p className={styles.stepNote}>A leitura envia o endereco da carteira ao nucleo local, que consulta a OKX. So leitura: nada e assinado e nenhuma ordem sai daqui.</p>
        </div>

        {read === null ? (
          <p className={styles.stepNote}>Nenhuma leitura ainda: Ler carteira so consulta saldos e nunca chama o modelo.</p>
        ) : (
          <div className={styles.stageBody} data-readiness={m.readiness}>
            <p className={styles.stepNote}>
              {read.saldo === null ? "Saldo indisponivel nas redes consultadas." : `Valor conhecido estimado nas redes consultadas: ${usdText(read.saldo.totalUsd)} no total, ${usdText(read.saldo.cashUsd)} em moeda estavel.`}
            </p>
            <p className={styles.stepNote}>{coverageLine(read, p.nowMs)}</p>
            <p className={styles.stepNote} data-blocked={m.readiness === "ready" ? undefined : "true"}>
              {oversized && m.readiness === "partial" ? "Os dados excedem o limite desta consulta; a analise de mercado segue disponivel." : readinessLine(m.readiness)}
            </p>
          </div>
        )}

        <div className={styles.stageBody}>
          <div className={styles.controls}>
            <button type="button" className={styles.ghost} onClick={m.onAnalyzeMarket} disabled={busy || p.modelConfigured === false} aria-busy={p.phase === "asking" ? "true" : undefined}>
              Analisar mercado
            </button>
            <button type="button" className={styles.ask} onClick={m.onAnalyzePortfolio} disabled={busy || !personal} aria-busy={p.phase === "asking" ? "true" : undefined} title={personal ? "Analisa a carteira lida com o consentimento marcado" : "Precisa de uma leitura recente, sem lacunas detectadas, do consentimento marcado e do modelo configurado"}>
              Analisar carteira
            </button>
            {busy ? (
              <button type="button" className={styles.ghost} onClick={p.onCancel}>
                Cancelar
              </button>
            ) : null}
          </div>
          {read === null || read.saldo === null || m.readiness !== "ready" ? null : (
            <label className={styles.consent}>
              <input type="checkbox" checked={m.consent} disabled={busy} onChange={(e) => m.onConsent(e.currentTarget.checked)} />
              <span>Autorizo enviar ao nucleo local os valores em dolar e os contratos publicos dos tokens lidos; o modelo recebe so percentuais e o contexto publico de mercado, nunca o endereco nem os dolares da carteira.</span>
            </label>
          )}
          <p className={styles.stepNote}>A analise de mercado nao envia nada da carteira.</p>
        </div>
      </div>

      <p className={styles.hint}>Ate 2 avaliacoes por consulta.</p>
      {p.modelConfigured === false ? (
        <p className={styles.hint}>
          <a href="/configuracoes">Configure a chave do modelo em Configuracoes</a>
        </p>
      ) : null}

      {p.last === null ? null : (
        <div className={styles.result} data-stale={stale ? "true" : undefined}>
          {stale ? <p className={styles.staleNote}>Leitura velha: os precos mudam em minutos. Peca de novo antes de agir.</p> : null}
          {cards.length === 0 ? (
            <p className={styles.empty} role="status">
              {p.last.answer.decisions?.every((d) => d.stance === "skip") ? "Inonu descartou os candidatos desta leitura." : "O Inonu nao escolheu nenhum token agora."}
            </p>
          ) : (
            <ol className={styles.list} aria-label="Tokens escolhidos, do primeiro ao ultimo">
              {cards.map((card) => (
                <PickItem key={card.candidateId} card={card} last={p.last!} stale={stale} allowed={p.canPrepare(p.last!)} onOpen={() => p.onOpen(card)} onPrepare={(buy) => p.onPrepare(buy, p.last!)} />
              ))}
            </ol>
          )}
        </div>
      )}

      <details className={styles.how}>
        <summary>Dados e limites</summary>
        {p.balanceNote === null ? null : <p className={styles.howLine}>{p.balanceNote}</p>}
        {p.last === null ? null : <>
          <p className={styles.howLine}>
            {p.last.answer.saldo === null ? "Saldo nao lido neste pedido: sem valor de compra disponivel." : `Saldo lido: US$ ${fmtNumber(p.last.answer.saldo.totalUsd, 0)} no total, US$ ${fmtNumber(p.last.answer.saldo.cashUsd, 0)} em moeda estavel.`}
            {p.last.modelo === null ? "" : ` modelo: Jev (${p.last.modelo}).`}
          </p>
          <p className={styles.howLine}>{excludedLine(p.last.answer)}</p>
          {p.last.answer.decisions === undefined ? null : <p className={styles.howLine}>{p.last.answer.decisions.filter((d) => d.stance === "watch").length} para acompanhar, {p.last.answer.decisions.filter((d) => d.stance === "skip").length} descartados.</p>}
        </>}
        <p className={styles.howLine}>Como o Inonu decide: avalia os ativos e escolhe o proximo movimento; ao modelo vao so percentuais do saldo.</p>
        {HOW_LINES.map((line) => (
          <p key={line} className={styles.howLine}>
            {line}
          </p>
        ))}
        <p className={styles.howLine}>Consultivo: nada aqui envia ordem. Preparar compra so preenche o ticket da aba Carteira.</p>
        <p className={styles.howLine}>Nenhuma lista e inventada para preencher o espaco.</p>
      </details>
    </section>
  );
}

export interface JevPicksProps {
  readonly wallet: UseOkxWalletResult;
  /** Opens the token on the chart of the desk. */
  readonly onOpen: (card: TokenCard) => void;
  /** Called after the ticket was filled, to take the person to the Carteira tab. */
  readonly onPrepared: () => void;
}

const REFRESH_MS = 30_000;
const EMPTY_SNAPSHOT: ManagementSnapshot = { phase: "idle", reading: null, consent: false, last: null, failure: null };

export default function JevPicks({ wallet, onOpen, onPrepared }: JevPicksProps) {
  const client = useMemo(() => createInonuClient(), []);
  const reader = useBalanceReader(wallet);
  const readerRef = useRef(reader);
  readerRef.current = reader;
  const key = JSON.stringify([reader.accounts.evm?.toLowerCase() ?? null, reader.accounts.solana ?? null]);
  const contextRef = useRef(key);
  contextRef.current = key;
  const sessionRef = useRef<ManagementSession | null>(null);
  const [binding, setBinding] = useState<{ readonly key: string; readonly session: ManagementSession; readonly snapshot: ManagementSnapshot } | null>(null);
  const [status, setStatus] = useState<InonuStatus | null>(null);
  const [nowMs, setNowMs] = useState(0);

  useEffect(() => {
    const s = createManagementSession({
      hasAccount: reader.accounts.evm !== null || reader.accounts.solana !== null,
      read: (signal) => readerRef.current.read(signal),
      ask: (request, signal, requestId) => client.ask(request, signal, requestId),
      cancelRequest: (requestId) => client.cancelRequest(requestId),
      now: () => Date.now(),
      requestId: () => crypto.randomUUID(),
      isCurrent: () => contextRef.current === key,
      onAnswer: (last) => sharedLastPicks().set(last),
      // the ledger has a new line whichever panel is on screen now: the tail of the Inonu tab reads it again
      onLedger: () => sharedLedgerSignal().notify(),
    });
    sessionRef.current = s;
    const sync = () => {
      setBinding({ key, session: s, snapshot: s.get() });
      setNowMs(Date.now());
    };
    const off = s.subscribe(sync);
    sync();
    return () => {
      off();
      if (sessionRef.current === s) sessionRef.current = null;
      s.dispose();
    };
  }, [key, client]);

  // the page and the server render the same first paint: the clock and the status of the core are read after mount
  useEffect(() => {
    let live = true;
    setNowMs(Date.now());
    const refresh = () => void client.status().then((s) => live && setStatus(s));
    refresh();
    const timer = setInterval(() => {
      setNowMs(Date.now());
      refresh();
    }, REFRESH_MS);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [client]);

  const bound = binding !== null && binding.key === key && binding.session === sessionRef.current ? binding : null;
  const snap = bound === null ? EMPTY_SNAPSHOT : bound.snapshot;

  const prepare = useCallback(
    (card: PickCard, kept: LastPicks) => {
      if (bound === null || !bound.session.canPrepare(kept)) return;
      if (!card.hasAmount || kept.answer.saldo === null || Date.now() - kept.atMs > PICKS_STALE_MS) return;
      const draft = draftFromDecision({ candidateId: card.candidateId, action: "buy", briefHash: kept.briefHash, symbol: card.symbol, atMs: Date.now(), suggestUsd: card.hasAmount ? card.usd : null });
      if (draft === null) return;
      sharedTicket().fill(draft);
      onPrepared();
    },
    [bound, onPrepared],
  );

  const readiness = balanceReadiness(snap.reading, nowMs);

  return (
    <JevPicksView
      phase={snap.phase}
      last={snap.last}
      failure={snap.failure === null ? null : failureText(snap.failure)}
      balanceNote={null}
      modelConfigured={status === null ? null : status.modelConfigured}
      nowMs={nowMs}
      management={{
        hasAccount: reader.hasAccount,
        reading: snap.reading,
        readiness,
        consent: snap.consent,
        onRead: () => void sessionRef.current?.read(),
        onConsent: (value) => sessionRef.current?.consent(value),
        onAnalyzeMarket: () => void sessionRef.current?.analyze("market"),
        onAnalyzePortfolio: () => void sessionRef.current?.analyze("portfolio"),
      }}
      canPrepare={(last) => bound !== null && bound.session.canPrepare(last)}
      onCancel={() => sessionRef.current?.cancel()}
      onOpen={onOpen}
      onPrepare={prepare}
    />
  );
}
