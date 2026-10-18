/* The result deck (the curve of the wallet's value and the meters of what the decisions earned) and the decision center (the funnel of the last decision, what each level of risk opens, and one card per candidate
   with how sure the model was and what its narrow judgments said). The numbers come from lib/agent/deck.ts. Whatever moves here moves by one transition of the style, started by a change of data or by the first paint. */
import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { constellation, cycleStrip, equityChart, facetMeters, funnelModel, hitRows, probBars, recordRows } from "@/lib/agent/deck";
import type { FacetMeter, HitTone } from "@/lib/agent/deck";
import { FAMILY_TEXT, POSTURE_TEXT, RISK_TEXT, agoText, chainName, currentOrders, pctText, signedPctText, signedUsdText, stanceText, usdText } from "@/lib/agent/view";
import type { AgentStatus, CandidateView, OrderOutcome } from "@/lib/agent/types";
import styles from "./Deck.module.css";

/** True after the first paint, so the bars start empty and grow into place; a test can force it. */
function useReveal(forced: boolean | undefined): boolean {
 const [shown, setShown] = useState(false);
 useEffect(() => {
  setShown(true);
 }, []);
 return forced ?? shown;
}

const cx = (...names: (string | false | null | undefined)[]): string => names.filter(Boolean).join(" ");

const TONE_CLASS: Readonly<Record<string, string>> = { good: styles.toneGood!, warn: styles.toneWarn!, mid: styles.toneMid!, dim: styles.toneDim!, calm: styles.toneCalm!, sell: styles.toneSell!, buy: styles.toneBuy! };
const TEXT_CLASS = (tone: HitTone | FacetMeter["tone"]): string => (tone === "good" ? styles.textGood! : tone === "warn" ? styles.textWarn! : tone === "dim" ? styles.textDim! : "");

function Panel({ title, note, children }: { readonly title: string; readonly note?: string; readonly children: ReactNode }) {
 return (
  <section className={styles.panel}>
   <div className={styles.panelHead}>
    <h2 className={styles.panelTitle}>{title}</h2>
    {note ? <span className={styles.panelNote}>{note}</span> : null}
   </div>
   {children}
  </section>
 );
}

function clock(ms: number): string {
 return new Date(ms).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

/* ---------------------------------------------------------------- the curve of the wallet's value */

function ValueCurve({ status, shown }: { readonly status: AgentStatus; readonly shown: boolean }) {
 const chart = equityChart(status.performance.series, status.ledger);
 const book = status.book;
 const value = book?.agentUsd ?? null;
 const note = book === null || book.quality === "current"
  ? chart === null
   ? "a curva aparece com duas leituras da carteira"
   : `de ${clock(chart.startMs)} ate ${clock(chart.endMs)}, inclui depositos e saques`
  : book.quality === "partial"
   ? `${book.unpriced} posicao(oes) sem preco; patrimonio parcial`
   : book.quality === "stale"
    ? `valor da ultima leitura bem-sucedida, observada ${book.observedAtMs === null ? "em momento desconhecido" : agoText(book.observedAtMs, Date.now())}`
    : "sem leitura bem-sucedida da carteira gerida";
 const delta = chart === null ? null : chart.deltaUsd;
 const tone = delta === null || delta === 0 ? styles.deltaFlat : delta > 0 ? styles.deltaUp : styles.deltaDown;
 return (
  <Panel title="Patrimonio gerido" note={note}>
   <div className={styles.bigRow}>
    <span className={styles.bigValue}>{usdText(value)}</span>
    {delta !== null ? (
     <span className={cx(styles.delta, tone)} title="Variacao do valor da carteira no periodo da curva. Nao e lucro: inclui depositos e saques.">
      {signedUsdText(delta)} {chart!.deltaPct === null ? "" : `(${signedPctText(chart!.deltaPct)})`}
     </span>
    ) : null}
   </div>
   {chart === null ? (
    <p className={styles.empty}>O agente guarda uma leitura do valor da carteira a cada poucos minutos. Com duas leituras, a curva e as ordens executadas aparecem aqui.</p>
   ) : (
    <div className={styles.chartWrap}>
     <svg className={styles.chart} viewBox={`0 0 ${chart.box.width} ${chart.box.height}`} role="img" aria-label="Curva do valor da carteira do agente, com as ordens executadas marcadas">
      <defs>
       <linearGradient id="deckArea" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="var(--signal)" stopOpacity="0.32" />
        <stop offset="100%" stopColor="var(--signal)" stopOpacity="0" />
       </linearGradient>
      </defs>
      {chart.ticks.map((t) => (
       <g key={t.y}>
        <line className={styles.grid} x1={chart.box.padX} x2={chart.box.width - chart.box.padX} y1={t.y} y2={t.y} />
        <text className={styles.axisText} x={chart.box.padX + 2} y={t.y - 4}>
         {usdText(t.value, 0)}
        </text>
       </g>
      ))}
      <path className={cx(styles.areaFill, shown && styles.areaShown)} d={chart.area} fill="url(#deckArea)" />
      <path className={cx(styles.curve, shown && styles.curveShown)} d={chart.line} pathLength={1} />
      {chart.markers.map((m, i) => (
       <circle key={`${m.atMs}-${m.symbol}`} className={cx(styles.marker, m.side === "buy" ? styles.markerBuy : styles.markerSell, shown && styles.markerShown)} cx={m.x} cy={m.y} r={5} style={{ transitionDelay: `${500 + i * 90}ms` }}>
        <title>{`${m.side === "buy" ? "Compra" : "Venda"} de ${m.symbol}, ${usdText(m.usd, 0)}, ${clock(m.atMs)}`}</title>
       </circle>
      ))}
     </svg>
     <div className={styles.legend}>
      <span className={styles.legendItem}>
       <span className={styles.swatch} style={{ borderColor: "var(--buy)" }} aria-hidden="true" />
       Compra executada
      </span>
      <span className={styles.legendItem}>
       <span className={styles.swatch} style={{ borderColor: "var(--sell)" }} aria-hidden="true" />
       Venda executada
      </span>
      <span className={styles.legendItem}>{chart.markers.length === 0 ? "Nenhuma ordem executada neste periodo" : `${chart.markers.length} ordens executadas neste periodo`}</span>
     </div>
    </div>
   )}
  </Panel>
 );
}

/* ---------------------------------------------------------------- the meters */

function CashMeter({ status, shown }: { readonly status: AgentStatus; readonly shown: boolean }) {
 const book = status.book;
 const total = book?.agentUsd ?? null;
 if (book === null || total === null || total <= 0) return null;
 const qualityNote = book.quality === "current"
  ? undefined
  : book.quality === "partial"
   ? `${book.unpriced} posicao(oes) sem preco; valores parciais.`
   : book.quality === "stale"
    ? `Valores antigos; observados ${book.observedAtMs === null ? "em momento desconhecido" : agoText(book.observedAtMs, Date.now())}.`
    : "Sem leitura bem-sucedida da carteira gerida.";
 if (book.cashUsd === null) {
  return <Panel title="Caixa e posicoes" note={qualityNote}><p>Valor do caixa indisponivel.</p></Panel>;
 }
 const cashPct = Math.min(100, Math.max(0, (book.cashUsd / total) * 100));
 return (
  <Panel title="Caixa e posicoes" note={qualityNote}>
   <div className={styles.stack} role="img" aria-label={`Caixa em dolares ${pctText(cashPct, 0)} da carteira do agente`}>
    <div className={styles.stackPart} style={{ width: shown ? `${cashPct}%` : "0%", background: "var(--signal)" }} />
    <div className={styles.stackPart} style={{ width: shown ? `${100 - cashPct}%` : "0%", background: "var(--hold)" }} />
   </div>
   <div className={styles.legend}>
    <span className={styles.legendItem}>
     <span className={styles.swatch} style={{ borderColor: "var(--signal)" }} aria-hidden="true" />
     Caixa em dolares {usdText(book.cashUsd, 0)} ({pctText(cashPct, 0)})
    </span>
    <span className={styles.legendItem}>
     <span className={styles.swatch} style={{ borderColor: "var(--hold)" }} aria-hidden="true" />
     Em ativos {usdText(total - book.cashUsd, 0)} ({pctText(100 - cashPct, 0)})
    </span>
   </div>
  </Panel>
 );
}

function ResultMeters({ status, shown }: { readonly status: AgentStatus; readonly shown: boolean }) {
 const rows = hitRows(status.windows);
 const none = rows.every((r) => r.n === 0);
 return (
  <Panel title="Resultado das decisoes" note="contra manter em dolares">
   {none ? (
    <p className={styles.empty}>Nenhuma decisao com ordem foi medida ainda.</p>
   ) : (
    <div className={styles.metric}>
     {rows.map((r, i) => (
      <div key={r.id} className={styles.metricRow} title={r.open ? "Parte das decisoes desta janela ainda espera o preco do fim dela." : undefined}>
       <span className={styles.metricLabel}>{r.label}</span>
       <span className={styles.track}>
        <span className={cx(styles.fill, TONE_CLASS[r.tone])} style={{ width: shown ? `${r.hitPct ?? 0}%` : "0%", transitionDelay: `${i * 70}ms` }} />
       </span>
       <span className={cx(styles.metricValue, r.netUsd === null ? styles.textDim : r.netUsd > 0 ? styles.textGood : r.netUsd < 0 ? styles.textWarn : "")}>{r.netUsd === null ? "sem valor" : signedUsdText(r.netUsd)}</span>
      </div>
     ))}
     <p className={styles.fine}>
      A barra e a taxa de acerto, o valor e o resultado liquido. Decisoes medidas: {rows.map((r) => `${r.label} ${r.settled}`).join(", ")}. Menos de 30 medidas nao prova nada.
     </p>
    </div>
   )}
  </Panel>
 );
}

function RecordMeters({ status, shown }: { readonly status: AgentStatus; readonly shown: boolean }) {
 const rows = recordRows(status.performance.record);
 if (rows.length === 0) return null;
 return (
  <Panel title="Historico do Jev" note="o que ele mesmo mediu das proprias decisoes">
   <div className={styles.metric}>
    {rows.slice(0, 6).map((r, i) => (
     <div key={r.key} className={styles.metricRow}>
      <span className={styles.metricLabel}>{r.label}</span>
      <span className={styles.track}>
       <span className={cx(styles.fill, TONE_CLASS[r.tone])} style={{ width: shown ? `${r.acertoPct ?? 0}%` : "0%", transitionDelay: `${i * 70}ms` }} />
      </span>
      <span className={cx(styles.metricValue, TEXT_CLASS(r.tone))}>{r.acertoPct === null ? "sem dado" : `${r.acertoPct}%`}</span>
     </div>
    ))}
    <p className={styles.fine}>Acerto uma hora depois de cada decisao. Menos de 5 decisoes medidas aparece apagado: ainda nao diz nada.</p>
   </div>
  </Panel>
 );
}

export function PerformanceDeck({ status, revealed }: { readonly status: AgentStatus; readonly revealed?: boolean }) {
 const shown = useReveal(revealed);
 return (
  <div className={styles.deck} aria-label="Resultado do agente">
   <ValueCurve status={status} shown={shown} />
   <div className={styles.column}>
    <ResultMeters status={status} shown={shown} />
    <RecordMeters status={status} shown={shown} />
    <CashMeter status={status} shown={shown} />
   </div>
  </div>
 );
}

/* ---------------------------------------------------------------- the map of the decision and the strip of the cycles */

const NODE_CLASS: Readonly<Record<string, string>> = { sell: styles.nodeSell!, buy: styles.nodeBuy!, hold: styles.nodeHold!, open: styles.nodeOpen!, closed: styles.nodeClosed! };
const NODE_TEXT: Readonly<Record<string, string>> = { sell: "Venda decidida", buy: "Compra decidida", hold: "Mantida", open: "Avaliada e recusada pelo Jev", closed: "Fechada pelo codigo" };

function DecisionMap({ view, shown }: { readonly view: readonly CandidateView[]; readonly shown: boolean }) {
 const m = constellation(view);
 if (m.nodes.length === 0) return null;
 return (
  <div className={styles.mapWrap}>
   <svg className={styles.mapSvg} viewBox={`0 0 ${m.box.width} ${m.box.height}`} role="img" aria-label="Mapa do ciclo: o Jev no centro e cada ativo avaliado ao redor, com a cor do que foi decidido">
    {[56, 92, 124].map((r) => (
     <ellipse key={r} className={styles.mapRing} cx={m.center.x} cy={m.center.y} rx={r * 2.1} ry={r} />
    ))}
    {m.links.map((l, i) => (
     <line key={l.id} className={styles.mapLink} x1={m.center.x} y1={m.center.y} x2={l.x} y2={l.y} style={{ opacity: shown ? 0.12 + l.strength * 0.5 : 0, transitionDelay: `${300 + i * 50}ms` }} />
    ))}
    <g className={styles.mapCore} transform={`translate(${m.center.x} ${m.center.y})`}>
     <circle r={21} className={styles.mapCoreRing} />
     <circle r={14} className={styles.mapCoreDot} />
     <text className={styles.mapCoreText} textAnchor="middle" dy={3.5}>
      Jev
     </text>
    </g>
    {m.nodes.map((n, i) => (
     <g key={n.id} className={cx(styles.mapNode, NODE_CLASS[n.tone], shown && styles.mapNodeShown)} style={{ transform: shown ? `translate(${n.x}px, ${n.y}px)` : `translate(${m.center.x}px, ${m.center.y}px)`, transitionDelay: `${i * 45}ms` }}>
      <title>{`${n.symbol}, ${NODE_TEXT[n.tone]}${n.stance !== null && n.tone !== "closed" ? ` (${stanceText(n.stance)}${n.sure === null ? "" : `, o Jev deu ${n.sure}%`})` : ""}`}</title>
      <circle r={n.r} className={styles.mapDot} />
      {n.tone !== "closed" ? (
       <text className={styles.mapLabel} y={n.r + 11} textAnchor="middle">
        {n.symbol}
       </text>
      ) : null}
     </g>
    ))}
   </svg>
   <div className={styles.legend}>
    {(["sell", "buy", "hold", "open", "closed"] as const).map((t) => (
     <span key={t} className={styles.legendItem}>
      <span className={cx(styles.legendDot, NODE_CLASS[t])} aria-hidden="true" />
      {NODE_TEXT[t]}
     </span>
    ))}
   </div>
  </div>
 );
}

const BAR_TEXT: Readonly<Record<string, string>> = { act: "enviou ordens", calm: "olhou e manteve", wait: "esperou", bad: "erro" };

function CycleStrip({ ledger, nowMs, shown }: { readonly ledger: AgentStatus["ledger"]; readonly nowMs: number; readonly shown: boolean }) {
 const bars = cycleStrip(ledger, 36);
 if (bars.length < 2) return null;
 return (
  <div className={styles.strip}>
   <span className={styles.panelTitle}>Ultimos ciclos</span>
   <div className={styles.stripBars} role="img" aria-label={`Ultimos ${bars.length} ciclos do agente, do mais antigo ao mais novo, coloridos pelo que fizeram`}>
    {bars.map((b, i) => (
     <span
      key={b.cycleId}
      className={cx(styles.stripBar, b.tone === "act" && styles.stripAct, b.tone === "wait" && styles.stripWait, b.tone === "bad" && styles.stripBad)}
      style={{ height: shown ? `${b.heightPct}%` : "0%", transitionDelay: `${i * 18}ms` }}
      title={`${agoText(b.atMs, nowMs)}: ${BAR_TEXT[b.tone]}${b.orders > 0 ? `, ${b.orders} ${b.orders === 1 ? "ordem" : "ordens"}` : ""}${b.reason !== null ? `, ${b.reason.replace(/_/g, " ")}` : ""}`}
     />
    ))}
   </div>
   <div className={styles.legend}>
    <span className={styles.legendItem}>
     <span className={cx(styles.legendDot, styles.stripAct)} aria-hidden="true" />
     Enviou ordens
    </span>
    <span className={styles.legendItem}>
     <span className={styles.legendDot} style={{ background: "var(--signal-deep)" }} aria-hidden="true" />
     Olhou e manteve
    </span>
    <span className={styles.legendItem}>
     <span className={cx(styles.legendDot, styles.stripWait)} aria-hidden="true" />
     Esperou
    </span>
   </div>
  </div>
 );
}

/* ---------------------------------------------------------------- the decision center */

function Funnel({ view, orders, shown }: { readonly view: readonly CandidateView[]; readonly orders: readonly OrderOutcome[]; readonly shown: boolean }) {
 const f = funnelModel(view, orders);
 return (
  <div className={styles.funnel}>
   {f.steps.map((s, i) => (
    <div key={s.key} className={styles.funnelRow}>
     <span>{s.label}</span>
     <span className={styles.funnelBar}>
      <span className={cx(styles.funnelFill, s.key === "fechadas" && styles.funnelFillClosed, (s.key === "escolhidas" || s.key === "executadas") && styles.funnelFillAct)} style={{ width: shown ? `${s.widthPct}%` : "0%", transitionDelay: `${i * 90}ms` }} />
     </span>
     <span className={styles.metricValue}>{s.count}</span>
    </div>
   ))}
   {f.reasons.length > 0 ? (
    <div className={styles.reasons} aria-label="Por que o codigo fechou compras">
     {f.reasons.map((r) => (
      <span key={r.code} className={styles.reason}>
       {r.label} <b>{r.count}</b>
      </span>
     ))}
    </div>
   ) : null}
  </div>
 );
}

const LEVELS = ["cauteloso", "moderado", "agressivo"] as const;

function RiskLevels({ status }: { readonly status: AgentStatus }) {
 const opened = status.last?.opened ?? null;
 const taken = status.autopilot.riskTaken;
 return (
  <div className={styles.risk}>
   <span className={styles.panelTitle}>O que cada nivel de risco abriria</span>
   <div className={styles.riskLevels}>
    {LEVELS.map((level) => {
     const n = opened?.[level] ?? null;
     const locked = level === "agressivo" && !status.autopilot.aggressiveOpen;
     return (
      <div key={level} className={cx(styles.riskLevel, level === taken && styles.riskLevelOn)}>
       <span className={styles.riskName}>{RISK_TEXT[level]}</span>
       <span className={cx(styles.riskCount, (n === null || n === 0) && styles.riskCountZero)}>{n === null ? "sem dado" : n}</span>
       <span className={styles.riskHint}>{level === taken ? "em uso" : locked ? "bloqueado" : n === null ? "" : n === 1 ? "compra aberta" : "compras abertas"}</span>
      </div>
     );
    })}
   </div>
   <p className={styles.fine}>Uma compra so abre quando a perda que o codigo supoe para ela (o dobro da distancia do stop, uma hipotese e nao um pior caso garantido) cabe no risco por operacao, e nenhuma passa de um decimo da carteira. O Jev escolhe o nivel; o codigo mostra o que cada um abre.</p>
  </div>
 );
}

function CandidateCard({ v, index, shown, chosen }: { readonly v: CandidateView; readonly index: number; readonly shown: boolean; readonly chosen: string | null }) {
 const [open, setOpen] = useState(false);
 const bars = probBars(v.kind, v.probs, chosen);
 const facets = facetMeters(v.kind, v.facets);
 const closed = v.closed !== null;
 return (
  <article className={cx(styles.cand, shown && styles.candShown)} style={{ transitionDelay: `${Math.min(index, 8) * 60}ms` }}>
   <div className={styles.candTop}>
    <span className={styles.candName}>{v.symbol}</span>
    <span className={styles.candChain}>{chainName(v.chainIndex)}</span>
    <span className={cx(styles.role, v.kind === "buy" ? styles.roleBuy : styles.roleHold)}>{v.kind === "buy" ? "Compra" : "Posicao"}</span>
    <span className={cx(styles.verdict, closed && styles.verdictClosed)}>{closed ? "Fechada pelo codigo" : v.stance === null ? "sem decisao" : stanceText(v.stance)}</span>
   </div>
   {bars !== null ? (
    <div>
     <div className={styles.probRow} role="img" aria-label={`Probabilidades do Jev: ${bars.map((b) => `${b.label} ${b.pct} por cento`).join(", ")}`}>
      {bars.map((b, i) => (
       <span key={b.key} className={cx(styles.probSeg, TONE_CLASS[b.tone], b.chosen && styles.probSegChosen)} style={{ width: shown ? `${b.pct}%` : "0%", transitionDelay: `${i * 80}ms` }} title={`${b.label}: ${b.pct}%`}>
        {b.pct >= 14 ? `${b.pct}%` : ""}
       </span>
      ))}
     </div>
     <div className={styles.probLegend}>
      {bars.map((b) => (
       <span key={b.key} className={b.chosen ? styles.probLegendChosen : undefined}>
        {b.label} {b.pct}%
       </span>
      ))}
     </div>
    </div>
   ) : closed ? (
    <p className={styles.closedWhy}>O codigo deixou so "nao comprar" nesta compra, entao o Jev nao teve o que escolher.</p>
   ) : null}
   {facets.length > 0 ? (
    <div className={styles.facets} aria-label="O que o Jev achou de cada ponto">
     {facets.map((f, i) => (
      <div key={f.key} className={styles.facetRow}>
       <span>{f.label}</span>
       <span className={styles.track}>
        <span className={cx(styles.fill, TONE_CLASS[f.tone])} style={{ width: shown ? `${f.pct}%` : "0%", transitionDelay: `${i * 60}ms` }} />
       </span>
       <span className={styles.facetValue}>{f.pct}%</span>
      </div>
     ))}
    </div>
   ) : null}
   {v.families.length > 0 || v.marks.length > 0 ? (
    <>
     <button type="button" className={styles.expand} aria-expanded={open} onClick={() => setOpen(!open)}>
      Sinais do codigo
      <span className={cx(styles.chev, open && styles.chevOpen)} aria-hidden="true">
       &gt;
      </span>
     </button>
     {open ? (
      <div className={styles.tags}>
       {v.families.map((f) => (
        <span key={`f-${f}`} className={styles.tag}>
         {FAMILY_TEXT[f] ?? f.replace(/_/g, " ")}
        </span>
       ))}
       {v.marks.map((m) => (
        <span key={`m-${m}`} className={cx(styles.tag, styles.tagMark)}>
         {m.replace(/_/g, " ")}
        </span>
       ))}
      </div>
     ) : null}
    </>
   ) : null}
  </article>
 );
}

/** What order of the cards: what is held first, then what the model could really choose, then what the code closed. */
function ordered(view: readonly CandidateView[]): CandidateView[] {
 const rank = (v: CandidateView): number => (v.kind === "holding" ? 0 : v.closed === null ? 1 : 2);
 return [...view].sort((a, b) => rank(a) - rank(b));
}

export function DecisionCenter({ status, nowMs, orders, revealed }: { readonly status: AgentStatus; readonly nowMs: number; readonly orders: ReactNode; readonly revealed?: boolean }) {
 const shown = useReveal(revealed);
 const last = status.last;
 if (last === null) {
  return (
   <Panel title="Central de decisao do Jev">
    <p className={styles.empty}>O agente ainda nao completou um ciclo. Quando completar, o que ele viu, o que o Jev achou de cada ativo e o que foi feito aparecem aqui.</p>
   </Panel>
  );
 }
 const cards = ordered(last.view);
 return (
  <Panel title="Central de decisao do Jev" note={`ultimo ciclo ${agoText(last.atMs, nowMs)}`}>
   <div className={styles.center}>
    <div className={styles.centerHead}>
     {last.posture !== null ? <span className={cx(styles.badge, last.posture === "defensiva" ? styles.badgeDefensiva : last.posture === "ofensiva" ? styles.badgeOfensiva : styles.badgeNeutra)}>Postura {POSTURE_TEXT[last.posture]!.toLowerCase()}</span> : null}
     {last.consulted ? <span className={styles.badge}>Consultou {last.modelo ?? "o modelo"}</span> : <span className={styles.badge}>Sem nova consulta ao modelo</span>}
     <span className={styles.spacer} />
     <span className={styles.panelNote}>
      {last.considered.holdings} posicoes e {last.considered.buys} compras olhadas
     </span>
    </div>
    <div className={styles.mapRow}>
     <DecisionMap view={last.view} shown={shown} />
     <CycleStrip ledger={status.ledger} nowMs={nowMs} shown={shown} />
    </div>
    <div className={styles.flowGrid}>
     <Funnel view={last.view} orders={currentOrders(status)} shown={shown} />
     <RiskLevels status={status} />
    </div>
    {cards.length === 0 ? (
     <p className={styles.empty}>Nada foi avaliado neste ciclo.</p>
    ) : (
     <div className={styles.cards}>
      {cards.map((v, i) => (
       <CandidateCard key={v.id} v={v} index={i} shown={shown} chosen={v.stance} />
      ))}
     </div>
    )}
    {orders}
   </div>
  </Panel>
 );
}
