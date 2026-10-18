/**
 * The agent's page: the only page of the app besides the keys. Pure, so every state (loading, not connected, the notice open, connected and analysing, connected and trading, paused, an order without an answer) is
 * rendered in tests without a network. The default export of AgentView holds the hooks. There is no field, no mode and no approval here: the person connects a wallet (after reading one notice) and the agent does
 * the rest. What the page shows is what the person wants to know, which is whether the capital is growing and what the agent is doing about it. Nothing moves: state is told by colour and by words.
 */
import type { ReactNode } from "react";
import { AssetIcon } from "@/components/Desk/AssetIcon";
import {
 MODE_TEXT,
 POSTURE_TEXT,
 SOURCE_TEXT,
 STAGE_TEXT,
 POLICY_URL,
 WALLET_STEP,
 agoText,
 budgetText,
 chainName,
 contextRows,
 currentOrders,
 cycleSummary,
 eventLine,
 evidenceLines,
 effectiveMode,
 headline,
 modeLead,
 needsPersonWord,
 inFlightLine,
 inText,
 ledgerLine,
 moneyEvidence,
 pctText,
 planLine,
 planProgress,
 profileText,
 radarRows,
 reasonText,
 sessionText,
 shortAddress,
 stanceText,
 strategyRows,
 usdText,
} from "@/lib/agent/view";
import type { AgentStatus, OrderOutcome, PositionRow, WalletNext } from "@/lib/agent/types";
import { DecisionCenter, PerformanceDeck } from "./Deck";
import styles from "./AgentView.module.css";

export interface AgentScreenProps {
 readonly load: "loading" | "ready" | "error";
 /** The reason code of the last failed read. */
 readonly error: string | null;
 readonly status: AgentStatus | null;
 readonly nowMs: number;
 readonly busy: "connect" | "disconnect" | "wallet" | "resolve" | null;
 readonly notice: { readonly tone: "ok" | "bad"; readonly text: string } | null;
 /** The notice of what connecting means is open. */
 readonly noticeOpen: boolean;
 readonly onConnect: () => void;
 readonly onAccept: () => void;
 readonly onCancel: () => void;
 readonly onDisconnect: () => void;
 /** The person's word on an order sent without an answer, after looking at the wallet's own history. */
 readonly onResolve: (orderKey: string, outcome: "executada" | "falhou") => void;
 /** Runs a step of connecting the wallet the agent trades from. */
 readonly onWallet: (action: "install" | "login") => void;
}

/* ---------------------------------------------------------------- pieces */

function Card({ title, note, children }: { readonly title: string; readonly note?: string; readonly children: ReactNode }) {
 return (
  <section className={styles.card}>
   <div className={styles.cardHead}>
    <h2 className={styles.cardTitle}>{title}</h2>
    {note ? <span className={styles.cardNote}>{note}</span> : null}
   </div>
   {children}
  </section>
 );
}

function Stat({ label, value, note, big }: { readonly label: string; readonly value: string; readonly note?: string; readonly big?: boolean }) {
 return (
  <div className={styles.stat}>
   <span className={styles.statLabel}>{label}</span>
   <span className={big === true ? `${styles.statValue} ${styles.statValueBig}` : styles.statValue}>{value}</span>
   {note ? <span className={styles.statNote}>{note}</span> : null}
  </div>
 );
}

/** What connecting means, said once, before the person connects. Its version is the proof they read it (DISCLOSURE). */
function NoticeDialog({ busy, onAccept, onCancel }: { readonly busy: boolean; readonly onAccept: () => void; readonly onCancel: () => void }) {
 return (
  <div className={styles.scrim} role="presentation">
   <div className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby="agent-notice-title">
    <h2 id="agent-notice-title" className={styles.dialogTitle}>
     Voce vai entregar a gestao ao agente
    </h2>
    <p className={styles.lead}>
     Ao conectar a carteira, todas as decisoes e todas as configuracoes passam a ser do agente: o gerenciamento de risco, o gerenciamento do capital, o crescimento do capital, a alavancagem, quando ele julgar que compensa e houver instrumento para isso, e a escolha do que comprar e do que vender.
    </p>
    <p className={styles.lead}>O agente trabalha sozinho, 24 horas por dia, e nao pede confirmacao. Voce nao configura nada e nao aprova nenhuma ordem.</p>
    <p className={styles.lead}>
     Para operar, ele instala o programa oficial da OKX e usa uma carteira propria, com a chave guardada no cofre da OKX. Ele so negocia o saldo que estiver nessa carteira, dentro dos limites que voce definir na sua conta OKX.
    </p>
    <p className={`${styles.warn}`}>Mercado envolve risco de perder capital. Ninguem garante lucro, e o agente tambem erra. Voce pode desconectar a qualquer momento.</p>
    <div className={styles.actions}>
     <button type="button" className={`${styles.button} ${styles.primary}`} disabled={busy} onClick={onAccept}>
      Entendo e conecto a carteira
     </button>
     <button type="button" className={styles.button} onClick={onCancel}>
      Cancelar
     </button>
    </div>
   </div>
  </div>
 );
}

function OrderRow({ outcome }: { readonly outcome: OrderOutcome }) {
 const o = outcome.order;
 const tone = o.side === "buy" ? styles.chipBuy : styles.chipSell;
 return (
  <li className={styles.row}>
   <span className={`${styles.chip} ${tone}`}>{o.side === "buy" ? "Compra" : "Venda"}</span>
   <span className={styles.rowMain}>
    <span className={styles.rowTitle}>
     {o.symbol} <span className={styles.rowNote}>{chainName(o.chainIndex)}</span>
    </span>
    <span className={styles.rowNote}>
     {stanceText(o.stance)}
     {o.profile !== null ? `, ${profileText(o.profile)}` : ""}. {SOURCE_TEXT[o.source]}.{outcome.reason !== null ? ` ${reasonText(outcome.reason)}` : ""}
    </span>
   </span>
   <span className={`${styles.right} ${styles.mono}`}>
    {usdText(o.usd, 0)}
    <br />
    <span className={styles.rowNote}>{STAGE_TEXT[outcome.stage]}</span>
   </span>
  </li>
 );
}

/* ---------------------------------------------------------------- the wallet the agent trades from */

function WalletCard({ status, busy, onWallet }: { readonly status: AgentStatus; readonly busy: boolean; readonly onWallet: AgentScreenProps["onWallet"] }) {
 const w = status.wallet;
 if (w.next === "operando") return null;
 const step = WALLET_STEP[w.next];
 const order: readonly WalletNext[] = ["instalar", "entrar", "depositar", "definir_politica"];
 return (
  <Card title="Carteira do agente" note="o que falta para ele executar sozinho">
   <ol className={styles.walletSteps}>
    {order.map((id) => {
     const done = order.indexOf(id) < order.indexOf(w.next);
     const now = id === w.next;
     return (
      <li key={id} className={`${styles.walletStep} ${now ? styles.walletStepNow : ""} ${done ? styles.walletStepDone : ""}`}>
       <span className={styles.walletStepMark}>{done ? "Feito" : now ? "Agora" : "Depois"}</span>
       <span>{WALLET_STEP[id].title}</span>
      </li>
     );
    })}
   </ol>
   <p className={styles.lead}>{step.body}</p>
   {w.next === "entrar" && w.loginUrl !== null ? (
    <p>
     <a className={`${styles.button} ${styles.primary} ${styles.buttonLink}`} href={w.loginUrl} target="_blank" rel="noopener noreferrer">
      {step.action}
     </a>
     <span className={styles.rowNote}> Depois de entrar, volte aqui: esta tela percebe sozinha.</span>
    </p>
   ) : null}
   {w.next === "entrar" && w.loginUrl === null && w.cli === "instalado" ? (
    <button type="button" className={`${styles.button} ${styles.primary}`} disabled={busy} onClick={() => onWallet("login")}>
     {busy ? "Preparando a entrada" : "Preparar a entrada"}
    </button>
   ) : null}
   {w.next === "instalar" ? (
    <button type="button" className={`${styles.button} ${styles.primary}`} disabled={busy} onClick={() => onWallet("install")}>
     {busy ? "Instalando" : step.action}
    </button>
   ) : null}
   {w.next === "definir_politica" ? (
    <p>
     <a className={`${styles.button} ${styles.primary} ${styles.buttonLink}`} href={POLICY_URL} target="_blank" rel="noopener noreferrer">
      {step.action}
     </a>
    </p>
   ) : null}
   {(w.address !== null || w.solanaAddress !== null) && (w.next === "depositar" || w.next === "definir_politica") ? (
    <div className={styles.addressBox}>
     {w.solanaAddress !== null ? (
      <p>
       <span className={styles.rowNote}>Endereco da Solana (SOL, USDC e os outros ativos da Solana)</span>
       <br />
       <span className={styles.mono}>{w.solanaAddress}</span>
      </p>
     ) : null}
     {w.address !== null ? (
      <p>
       <span className={styles.rowNote}>Endereco das redes EVM (Ethereum, Base, BNB Chain e outras)</span>
       <br />
       <span className={styles.mono}>{w.address}</span>
      </p>
     ) : null}
     <p className={styles.rowNote}>
      Cada rede tem o seu endereco. Envie ativos da Solana so para o endereco da Solana e ativos das redes EVM so para o endereco EVM: o contrario costuma nao ter volta. Comece com um valor pequeno e confirme que chegou antes de enviar mais.
      {w.solanaAddress !== null ? " Para operar na Solana, envie tambem um pouco de SOL para as taxas da rede." : ""}
     </p>
     <p className={styles.rowNote}>{w.fundsUsd === null ? "Saldo ainda nao lido." : `Saldo lido: ${usdText(w.fundsUsd)}.`}</p>
    </div>
   ) : null}
  </Card>
 );
}

/** The session of the signed-in account in one line, whatever the stage: it is what lets the agent sign, and it ends (the tool keeps the key; only the time left is here). */
function SessionLine({ status }: { readonly status: AgentStatus }) {
 const w = status.wallet;
 if (w.login !== "logado") return null;
 const left = w.sessionLeftMs;
 const urgent = left !== null && left < 48 * 3_600_000;
 return <p className={`${styles.rowNote} ${urgent ? styles.verdictWait : ""}`} data-session={left === null ? "desconhecida" : urgent ? "perto_do_fim" : "ok"}>{sessionText(left)}</p>;
}

/* ---------------------------------------------------------------- what the agent decided, looked at and holds */

/** What the last cycle did, below the cards of the decision center: why it held, what it summed up to, the orders and the notes. */
function CycleDetails({ status }: { readonly status: AgentStatus }) {
 const last = status.last;
 if (last === null) return null;
 return (
  <div>
   {last.reason !== null ? <p className={styles.lead}>{reasonText(last.reason)}</p> : null}
   <p className={styles.rowNote}>{cycleSummary(last)}.</p>
   {last.orders.length > 0 ? (
    <ul className={styles.list}>
     {currentOrders(status).map((o) => (
      <OrderRow key={o.order.candidateId} outcome={o} />
     ))}
    </ul>
   ) : last.outcome === "decidido" ? (
    <p className={styles.empty}>Nenhuma ordem: com o que ve agora, manter e a melhor decisao.</p>
   ) : null}
   {last.notes.length > 0 ? (
    <ul className={styles.notes}>
     {last.notes.map((n) => (
      <li key={n}>{reasonText(n)}</li>
     ))}
    </ul>
   ) : null}
  </div>
 );
}

function PositionLine({ p }: { readonly p: PositionRow }) {
 const progress = p.plan === null ? null : planProgress(p.plan.profile, p.plan.sinceEntryPct);
 return (
  <li className={styles.row}>
   <AssetIcon ccy={p.symbol} chain={p.chainIndex} fallback={p.symbol.slice(0, 3)} size={22} />
   <span className={styles.rowMain}>
    <span className={styles.rowTitle}>
     {p.symbol} <span className={styles.rowNote}>{chainName(p.chainIndex)}{p.wallet === "principal" ? ", so leitura" : ""}</span>
    </span>
    {p.plan !== null ? (
     <>
      <span className={styles.rowNote}>{planLine(p.plan)}</span>
      {progress !== null ? (
       <span className={styles.track} role="img" aria-label="Posicao entre a saida e o alvo">
        <span className={`${styles.trackFill} ${(p.plan.sinceEntryPct ?? 0) < 0 ? styles.trackLoss : ""}`} style={{ width: `${Math.round(progress * 100)}%` }} />
       </span>
      ) : null}
     </>
    ) : p.sharePct !== null ? (
     <span className={styles.share} aria-hidden="true">
      <span className={styles.shareFill} style={{ width: `${Math.min(100, p.sharePct)}%` }} />
     </span>
    ) : null}
   </span>
   <span className={`${styles.right} ${styles.mono}`}>
    {usdText(p.usd)}
    <br />
    <span className={styles.rowNote}>{p.sharePct === null ? "" : pctText(p.sharePct)}</span>
   </span>
  </li>
 );
}

/** What the managed wallet is made of, as one bar: the biggest pieces first, the rest together, and a legend that says in words what the colours show. */
function AllocationBar({ positions }: { readonly positions: readonly PositionRow[] }) {
 const mine = positions.filter((p) => p.wallet === "agente" && p.usd !== null && p.usd > 0);
 const total = mine.reduce((s, p) => s + (p.usd as number), 0);
 if (total <= 0) return null;
 const cash = mine.filter((p) => p.isCash).reduce((s, p) => s + (p.usd as number), 0);
 const others = mine.filter((p) => !p.isCash).sort((a, b) => (b.usd as number) - (a.usd as number));
 const parts: { readonly label: string; readonly usd: number; readonly kind: "cash" | "token" | "rest" }[] = [];
 if (cash > 0) parts.push({ label: "Caixa em dolares", usd: cash, kind: "cash" });
 for (const p of others.slice(0, 5)) parts.push({ label: p.symbol, usd: p.usd as number, kind: "token" });
 const rest = others.slice(5).reduce((s, p) => s + (p.usd as number), 0);
 if (rest > 0) parts.push({ label: "Outros", usd: rest, kind: "rest" });
 parts.sort((a, b) => b.usd - a.usd);
 const tone = (kind: "cash" | "token" | "rest", i: number): string => (kind === "cash" ? styles.allocCash : kind === "rest" ? styles.allocRest : (styles[`tone${Math.min(i, 5)}`] ?? ""));
 return (
  <div className={styles.alloc}>
   <div className={styles.allocBar} role="img" aria-label="Composicao da carteira">
    {parts.map((p, i) => (
     <span key={`${p.label}|${i}`} className={`${styles.allocSeg} ${tone(p.kind, i)}`} style={{ width: `${(p.usd / total) * 100}%` }} />
    ))}
   </div>
   <ul className={styles.allocLegend}>
    {parts.map((p, i) => (
     <li key={`${p.label}|${i}`} className={styles.allocItem}>
      <span className={`${styles.swatch} ${tone(p.kind, i)}`} aria-hidden="true" />
      <span>{p.label}</span>
      <span className={styles.mono}>{pctText((p.usd / total) * 100, 0)}</span>
     </li>
    ))}
   </ul>
  </div>
 );
}

function CapitalCard({ status, nowMs }: { readonly status: AgentStatus; readonly nowMs: number }) {
 const book = status.book;
 if (book === null) {
  return (
   <Card title="Capital sob gestao">
    <p className={styles.empty}>A carteira ainda nao foi lida. Ela e lida no primeiro ciclo.</p>
   </Card>
  );
 }
 const cash = book.positions.filter((p) => p.isCash && p.wallet === "agente");
 const others = book.positions.filter((p) => !(p.isCash && p.wallet === "agente"));
 const qualityNote = book.quality === "current"
  ? null
  : book.quality === "partial"
   ? `${book.unpriced} posicao(oes) gerida(s) sem preco; os valores mostrados sao parciais.`
   : book.quality === "stale"
    ? `Leitura antiga: valores mantidos da observacao de ${book.observedAtMs === null ? "momento desconhecido" : agoText(book.observedAtMs, nowMs)}.`
    : "Sem leitura bem-sucedida da carteira gerida.";
 return (
  <Card title="Capital sob gestao" note={book.observedAtMs === null ? `ultima tentativa ${agoText(book.atMs, nowMs)}` : `observado ${agoText(book.observedAtMs, nowMs)}`}>
   {qualityNote === null ? null : <p className={styles.empty} role="status">{qualityNote}</p>}
   <div className={styles.actions}>
    <Stat label="Carteira gerida" value={usdText(book.agentUsd)} note={status.managed.kind === "agentica" ? "Carteira do agente" : "Sua carteira, so analise"} />
    <Stat label="Em dolares" value={usdText(book.cashUsd, 0)} note={book.agentUsd !== null && book.agentUsd > 0 && book.cashUsd !== null ? pctText((book.cashUsd / book.agentUsd) * 100, 0) : ""} />
    {book.totalUsd !== null && book.agentUsd !== null && book.totalUsd - book.agentUsd > 0.5 ? <Stat label="Outras carteiras, so leitura" value={usdText(book.totalUsd - book.agentUsd, 0)} /> : null}
   </div>
   <AllocationBar positions={book.positions} />
   <ul className={styles.list}>
    {cash.length > 0 ? (
     <li className={styles.row}>
      <span className={styles.chip}>USD</span>
      <span className={styles.rowMain}>
       <span className={styles.rowTitle}>Caixa em dolares</span>
       <span className={styles.rowNote}>{cash.map((p) => `${p.symbol} ${chainName(p.chainIndex)}`).join(", ")}</span>
      </span>
      <span className={`${styles.right} ${styles.mono}`}>{usdText(book.cashUsd)}</span>
     </li>
    ) : null}
    {others.map((p) => (
     <PositionLine key={`${p.id}|${p.wallet}`} p={p} />
    ))}
   </ul>
   {book.positions.length === 0 ? <p className={styles.empty}>A carteira gerida esta vazia.</p> : null}
   {book.flagged > 0 || book.unpriced > 0 || book.watchFailed > 0 || !book.managedOk ? (
    <ul className={styles.notes}>
     {book.flagged > 0 ? <li>{book.flagged} tokens marcados como risco pela OKX ficaram de fora.</li> : null}
     {book.unpriced > 0 ? <li>{book.unpriced} tokens sem preco nao entram nas contas.</li> : null}
     {book.watchFailed > 0 ? <li>Uma carteira so de leitura nao respondeu.</li> : null}
     {!book.managedOk ? <li>A carteira gerida nao respondeu na ultima leitura.</li> : null}
    </ul>
   ) : null}
  </Card>
 );
}

function StrategyCard({ status }: { readonly status: AgentStatus }) {
 const rows = strategyRows(status.autopilot);
 return (
  <Card title="Estrategia do agente" note={status.autopilot.ownerProfile === "arrojado" ? "perfil arrojado, como voce definiu; o resto e do agente" : "escolhida por ele, nada aqui e configurado por voce"}>
   <dl className={styles.kv}>
    {rows.map((r) => (
     <div key={r.label} style={{ display: "contents" }}>
      <dt>{r.label}</dt>
      <dd>
       {r.value}
       {r.note ? <span className={styles.rowNote}> {r.note}</span> : null}
      </dd>
     </div>
    ))}
   </dl>
  </Card>
 );
}

function EvidenceCard({ status }: { readonly status: AgentStatus }) {
 const lines = evidenceLines(status.windows);
 const money = moneyEvidence(status.windows);
 return (
  <Card title="Prova de retorno" note="contra manter em dolares">
   <p className={`${styles.verdict} ${money.supported ? styles.verdictGood : styles.verdictWait}`}>{money.text}</p>
   <table className={styles.table}>
    <thead>
     <tr>
      <th scope="col">Depois de</th>
      <th scope="col">Medidas</th>
      <th scope="col">Resultado</th>
      <th scope="col">O que se pode dizer</th>
     </tr>
    </thead>
    <tbody>
     {lines.map((l) => (
      <tr key={l.id}>
       <td>{l.label}</td>
       <td className={styles.mono}>
        {l.settled}
        {l.pending > 0 ? ` +${l.pending}` : ""}
       </td>
       <td className={styles.mono}>{l.settled > 0 ? usdText(l.grossUsd) : "sem valor"}</td>
       <td>{l.text}</td>
      </tr>
     ))}
    </tbody>
   </table>
   {status.inaction !== null && status.inaction.decisions > 0 ? (
    <>
     <h3 className={styles.subTitle}>Quando o agente decide nao agir</h3>
     <p className={styles.hint}>
      {status.inaction.decisions} decisoes de manter e nao comprar, medidas contra a alternativa que o Jev recusou (vender o que ficou, comprar o que passou). Aparece separado das ordens e so afirma algo com amostra e janela fechada.
     </p>
     <table className={styles.table}>
      <thead>
       <tr>
        <th scope="col">Depois de</th>
        <th scope="col">Medidas</th>
        <th scope="col">Resultado</th>
        <th scope="col">O que se pode dizer</th>
       </tr>
      </thead>
      <tbody>
       {evidenceLines(status.inaction.windows).map((l) => (
        <tr key={l.id}>
         <td>{l.label}</td>
         <td className={styles.mono}>
          {l.settled}
          {l.pending > 0 ? ` +${l.pending}` : ""}
         </td>
         <td className={styles.mono}>{l.settled > 0 ? usdText(l.grossUsd) : "sem valor"}</td>
         <td>{l.text}</td>
        </tr>
       ))}
      </tbody>
     </table>
    </>
   ) : null}
   <p className={styles.hint}>Cada decisao do agente e comparada com o preco 15 minutos, 1, 4 e 24 horas depois. O app so afirma ganho com 30 decisoes medidas ou mais, e nunca antes da janela fechar.</p>
  </Card>
 );
}

function InFlightCard({ status, nowMs, busy, onResolve }: { readonly status: AgentStatus; readonly nowMs: number; readonly busy: boolean; readonly onResolve: AgentScreenProps["onResolve"] }) {
 if (status.inFlight.length === 0) return null;
 return (
  <Card title="Ordens sem confirmacao" note="o app nao sabe se saiu">
   <p className={`${styles.verdict} ${styles.verdictWait}`}>
    O agente enviou estas ordens e ainda nao sabe se foram concluidas. As que foram transmitidas a rede ele confirma sozinho, pelo recibo no historico da OKX, quanto tempo for preciso. So pede a sua palavra quando a ordem nao tem nenhum codigo de transacao para procurar. Ele nunca manda a mesma ordem duas vezes e nao mexe nesse token ate saber.
   </p>
   <ul className={styles.list}>
    {status.inFlight.map((o) => (
     <li key={o.orderKey} className={styles.row}>
      <span className={`${styles.chip} ${o.side === "buy" ? styles.chipBuy : styles.chipSell}`}>{o.side === "buy" ? "Compra" : "Venda"}</span>
      <span className={styles.rowMain}>
       <span className={styles.rowTitle}>{o.symbol}</span>
       <span className={styles.rowNote}>{inFlightLine(o, nowMs)}</span>
      </span>
      {!needsPersonWord(o) ? (
       <span className={styles.rowNote}>A transacao foi enviada a rede. O agente confirma sozinho; nao precisa clicar.</span>
      ) : (
       <span className={styles.actions}>
        <button type="button" className={styles.button} disabled={busy} onClick={() => onResolve(o.orderKey, "executada")}>
         Conferi: saiu
        </button>
        <button type="button" className={styles.button} disabled={busy} onClick={() => onResolve(o.orderKey, "falhou")}>
         Conferi: nao saiu
        </button>
       </span>
      )}
     </li>
    ))}
   </ul>
  </Card>
 );
}

function FeedCard({ status, nowMs }: { readonly status: AgentStatus; readonly nowMs: number }) {
 const records = [...status.ledger].reverse().slice(0, 12);
 const events = [...status.events].reverse().slice(0, 4);
 return (
  <Card title="Registro do agente" note="gravado antes de cada acao">
   {records.length === 0 && events.length === 0 ? (
    <p className={styles.empty}>Nada registrado ainda.</p>
   ) : (
    <ul className={styles.notes}>
     {events.map((e) => (
      <li key={`e-${e.atMs}-${e.kind}`}>{eventLine(e, nowMs)}</li>
     ))}
     {records.map((r, i) => (
      <li key={`${r.cycleId}-${r.kind}-${i}`}>{ledgerLine(r, nowMs)}</li>
     ))}
    </ul>
   )}
  </Card>
 );
}

/* ---------------------------------------------------------------- the screen */

export function AgentScreen(props: AgentScreenProps) {
 const { status, nowMs, busy, notice } = props;
 return (
  <main className={styles.page}>
   <header className={styles.header}>
    <div className={styles.brand}>INONU TRADER</div>
    <nav className={styles.nav} aria-label="Secoes do app">
     <a className={styles.navLink} href="/" aria-current="page">Agente</a>
     <a className={styles.navLink} href="/configuracoes">Configuracoes</a>
    </nav>
    <div className={styles.spacer} />
    <span className={styles.connection}>{props.load === "ready" ? "Servidor do agente conectado" : props.load === "loading" ? "Conectando ao servidor do agente" : reasonText(props.error)}</span>
   </header>

   <div className={styles.content}>
    {status === null ? (
     <section className={styles.hero}>
      <div>
       <p className={styles.eyebrow}>Agente autonomo</p>
       <h1 className={styles.headline}>{props.load === "loading" ? "Lendo o estado do agente." : reasonText(props.error)}</h1>
       {props.load === "error" ? <p className={styles.lead}>Confira se o servidor do agente esta no ar. Quando ele responder, esta tela se atualiza sozinha.</p> : null}
      </div>
     </section>
    ) : !status.connected ? (
     <section className={`${styles.hero} ${styles.connectHero}`} aria-label="Conectar a carteira">
      <div>
       <p className={styles.eyebrow}>Agente autonomo</p>
       <h1 className={styles.headline}>Conecte a carteira. O resto e com o agente.</h1>
       <p className={styles.lead}>
        O agente le todos os seus criptoativos, rastreia o mercado da OKX atras das melhores oportunidades e decide sozinho o que manter, comprar e vender para fazer o capital crescer, com stop e alvo em cada operacao.
       </p>
       <div className={styles.actions}>
        <button type="button" className={`${styles.button} ${styles.primary} ${styles.bigButton}`} disabled={busy !== null} onClick={props.onConnect}>
         Conectar carteira
        </button>
       </div>
       {notice ? <p className={`${styles.notice} ${notice.tone === "bad" ? styles.noticeBad : styles.noticeOk}`} role="status">{notice.text}</p> : null}
      </div>
     </section>
    ) : (
     <>
      <section className={styles.hero} aria-label="Estado do agente">
       <div>
        <p className={styles.eyebrow}>
         <span className={styles.modeBadge} data-mode={effectiveMode(status)}>
          <span className={styles.modeDot} aria-hidden="true" />
          {MODE_TEXT[effectiveMode(status)].title}
         </span>
         {status.paused ? <span className={styles.pausedTag}>compras novas pausadas</span> : null}
        </p>
        <h1 className={styles.headline}>{headline(status, nowMs)}</h1>
        <p className={styles.lead}>{modeLead(status)}</p>
        {!status.health.ledgerOk || !status.health.plansOk || !status.health.configOk ? (
         <p className={`${styles.notice} ${styles.noticeBad}`}>
          {!status.health.ledgerOk ? reasonText("ledger_corrompido") : !status.health.plansOk ? reasonText("planos_ilegiveis") : "A configuracao salva nao pode ser lida, e os valores padrao estao em uso."}
         </p>
        ) : null}
        {!status.lock ? <p className={`${styles.notice} ${styles.noticeBad}`}>{reasonText("outra_instancia")}</p> : null}
        {notice ? <p className={`${styles.notice} ${notice.tone === "bad" ? styles.noticeBad : styles.noticeOk}`} role="status">{notice.text}</p> : null}
       </div>
       <div className={styles.side}>
        <Stat big label="Patrimonio gerido" value={status.book === null ? "lendo" : usdText(status.book.agentUsd)} note={status.book === null || status.book.quality === "current" ? (status.managed.kind === "agentica" ? `Carteira ${shortAddress(status.managed.evm)}` : "Sua carteira, so analise") : status.book.quality === "partial" ? `${status.book.unpriced} posicao(oes) sem preco; patrimonio parcial` : status.book.quality === "stale" ? `Valor antigo; observado ${status.book.observedAtMs === null ? "em momento desconhecido" : agoText(status.book.observedAtMs, nowMs)}` : "Sem leitura bem-sucedida da carteira gerida"} />
        <Stat label="Proximo ciclo" value={inText(status.scheduler.nextAtMs, nowMs)} note={`A cada ${status.scheduler.intervalMin} min, ultimo ${agoText(status.scheduler.lastAtMs, nowMs)}`} />
        <Stat label="Modelo hoje" value={`${status.budget.consults} de ${status.budget.maxConsultsPerDay}`} note={budgetText(status.budget)} />
       </div>
      </section>

      <PerformanceDeck status={status} />
      <DecisionCenter status={status} nowMs={nowMs} orders={<CycleDetails status={status} />} />

      <div className={styles.grid}>
       <div className={styles.column}>
        <WalletCard status={status} busy={busy === "wallet"} onWallet={props.onWallet} />
        <SessionLine status={status} />
        <InFlightCard status={status} nowMs={nowMs} busy={busy !== null} onResolve={props.onResolve} />
        <CapitalCard status={status} nowMs={nowMs} />
       </div>
       <div className={styles.column}>
        <StrategyCard status={status} />
        <EvidenceCard status={status} />
        <FeedCard status={status} nowMs={nowMs} />
       </div>
      </div>

      <footer className={styles.footer}>
       <button type="button" className={`${styles.button} ${styles.danger}`} disabled={busy !== null} onClick={props.onDisconnect}>
        Desconectar a carteira
       </button>
       <span className={styles.hint}>O agente para na hora. As posicoes abertas continuam na carteira.</span>
      </footer>
     </>
    )}
   </div>

   {status !== null && props.noticeOpen ? <NoticeDialog busy={busy !== null} onAccept={props.onAccept} onCancel={props.onCancel} /> : null}
  </main>
 );
}
