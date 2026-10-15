"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createInonuClient, type AskAnswer } from "@/lib/inonu/client";
import { portfolioMatches, type PortfolioAnswer } from "@/lib/inonu/portfolio";
import { pctText, usdText, type BalanceRow } from "@/lib/wallet/holdings";
import type { OnchainFocus } from "@/lib/onchain/focus";
import { CONSULT_COST_TEXT, consultNetworks, consultReadingKey, type ConsultNetwork, type ConsultPrepared, PLAN_WORD, prepareConsult } from "@/lib/wallet/holdings-consult";
import { networkLabel } from "@/lib/wallet/network-label";
import styles from "./HoldingsPanel.module.css";

/**
 * "O que fazer com a minha carteira" (WAL-4, ASK): the Inonu looks at what the reading above holds, on the network the person picks, and says for each holding whether
 * to buy more, wait or sell. It asks nothing by itself: the model is asked by one button, after a consent that says what is sent (networks, contracts and balances; never
 * the address or position values; public market context is disclosed separately). Consultive: it never sends an order.
 */

const OUTCOMES: Readonly<Record<string, string>> = {
  sem_chave: "A chave do modelo nao foi detectada pelo servidor. Verifique Configuracoes.",
  cooldown: "Aguarde o intervalo entre consultas.",
  teto_atingido: "O limite de consultas foi atingido.",
  em_andamento: "Ja existe uma consulta em andamento.",
  cancelado: "Consulta cancelada.",
  erro: "A consulta nao produziu uma resposta verificavel.",
};
const GAPS: Readonly<Record<string, string>> = {
  native_market_unavailable: "Mercado do ativo nativo indisponivel",
  price_unavailable: "Preco indisponivel",
  risk_unavailable: "Risco indisponivel",
  no_credentials: "Credenciais OnchainOS ausentes",
  onchainos_credentials_unavailable: "Credenciais OnchainOS ausentes",
  market_unavailable: "Leitura de mercado indisponivel",
  market_identity_mismatch: "Identidade do ativo nao confirmada",
  fluxo: "Fluxo de negociacoes indisponivel",
  risco: "Avaliacao de risco indisponivel",
  liquidez: "Liquidez indisponivel",
  honeypot: "Verificacao de restricoes de negociacao indisponivel",
  regime: "Regime nao se aplica a esta consulta",
  clusters: "Concentracao entre carteiras",
  pools: "Detalhes dos pools",
  quote: "Cotacao de execucao",
  sentimento: "Sentimento",
  qualidade: "Historico dos participantes",
  sinais: "Sinais do mercado",
  risk_detail_omitted: "Detalhe de risco fora do limite do resumo",
  market_gap_detail_omitted: "Detalhe de lacuna fora do limite do resumo",
};
const OPTIONAL = new Set(["clusters", "pools", "quote", "regime", "sentimento", "qualidade", "sinais", "traders", "news", "social", "smartMoney"]);
const COLLECTION: Readonly<Record<string, string>> = {
  "price-info": "Leitura de preco e liquidez",
  "token-risk": "Avaliacao de risco",
  trades: "Fluxo de negociacoes",
};
const REASONS: Readonly<Record<string, string>> = {
  market_identity_mismatch: "identidade do ativo nao confirmada",
  dado_antigo: "dado antigo",
  nao_consultado: "nao consultado",
  nao_pedido: "fora desta coleta",
  no_credentials: "credenciais ausentes",
  incomplete_credentials: "credenciais incompletas",
  budget_exhausted: "limite de leituras atingido",
  pace_limited: "intervalo entre leituras",
  rate_limited: "limite do provedor atingido",
  provider_unauthorized: "acesso recusado pelo provedor",
  provider_payment_required: "acesso pago exigido pelo provedor",
  provider_error: "erro do provedor",
};
const clean = (text: string) => text.replace(/[\u00b7\u2013\u2014]/g, " / ");
const gapCode = (gap: string) => gap.replace(/^(essential|optional|not_applicable):/, "");
const gapKey = (gap: string) => gapCode(gap).split(":")[0]!;
const inapplicableGap = (gap: string) => gap.startsWith("not_applicable:") || gapKey(gap) === "regime";
const optionalGap = (gap: string) => !inapplicableGap(gap) && (gap.startsWith("optional:") || OPTIONAL.has(gapKey(gap)) || gapKey(gap).startsWith("trilha."));
const gapText = (gap: string) => {
  const code = gapCode(gap);
  const [key, ...reasons] = code.split(":");
  if (inapplicableGap(gap)) return GAPS[key!] ?? "Dado nao aplicavel a esta consulta";
  if (COLLECTION[key!]) return `${COLLECTION[key!]}: ${reasons.length ? reasons.map(reason => REASONS[reason] ?? "motivo nao detalhado").join(" / ") : "indisponivel"}`;
  return GAPS[key!] ?? (code.startsWith("risk_flag:") ? `Alerta do provedor: ${clean(code.slice(10))}` : code.startsWith("trilha.") ? "Componente complementar indisponivel" : code.startsWith("more_gaps:") || code.startsWith("additional_market_gaps:") ? "Outras lacunas fora do limite do resumo" : "Dado indisponivel");
};

// Optional response extension: old backend responses remain readable during rollout.
const object = (value: unknown): Record<string, unknown> | null => value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
const finite = (value: unknown, nonnegative = false): number | null => typeof value === "number" && Number.isFinite(value) && (!nonnegative || value >= 0) ? value : null;
const WINDOWS = [["m5", "5 min"], ["h1", "1 h"], ["h4", "4 h"], ["h24", "24 h"]] as const;
function MarketEvidence({ market, origin }: { market: Record<string, unknown>; origin: string }) {
  const price = finite(market.priceUsd, true);
  const liquidity = finite(market.liquidityUsd, true);
  const age = finite(market.ageMs, true);
  const windowText = (value: unknown, usd: boolean) => {
    const values = object(value);
    return WINDOWS.map(([key, label]) => {
      const number = finite(values?.[key], usd);
      return `${label} ${number === null ? "indisponivel" : usd ? usdText(number) : pctText(number)}`;
    }).join("; ");
  };
  return <>
    <p><span className={styles.evidenceLabel}>Mercado consultado</span>{`preco ${price === null ? "indisponivel" : usdText(price)}; liquidez ${liquidity === null ? "indisponivel" : usdText(liquidity)}`}</p>
    <details><summary>Variacao, volume e origem</summary>
      <p>{`Variacao: ${windowText(market.changePct, false)}`}</p>
      <p>{`Volume: ${windowText(market.volumeUsd, true)}`}</p>
      <p>{`Origem: ${clean(origin)}. Idade na consulta: ${age === null ? "desconhecida" : `${Math.ceil(age / 1000)} s`}.${market.stale === true ? " Leitura antiga." : ""}`}</p>
    </details>
  </>;
}

export interface HoldingsConsultViewProps {
  readonly networks: readonly ConsultNetwork[];
  readonly chainIndex: string;
  readonly prepared: ConsultPrepared;
  /** Seconds since the reading, or null when unknown. */
  readonly ageSeconds: number | null;
  readonly consent: boolean;
  readonly busy: boolean;
  readonly answer: AskAnswer | null;
  readonly note: string | null;
  readonly onChain: (chainIndex: string) => void;
  readonly onConsent: (value: boolean) => void;
  readonly onAsk: () => void;
  readonly onCancel: () => void;
  readonly onRefresh?: () => void;
  readonly candidate?: OnchainFocus | null;
}

export function HoldingsConsultView(p: HoldingsConsultViewProps) {
  const plan = p.answer?.carteira?.chainIndex === p.chainIndex ? p.answer.carteira : null;
  const needsRefresh = !p.prepared.ok && p.ageSeconds !== null && p.ageSeconds > 60 && p.onRefresh !== undefined;
  return (
    <section className={styles.decision} aria-label="O que fazer com a minha carteira">
      <h4 className={styles.subtitle}>O que fazer com a minha carteira</h4>
      <p className={styles.note}>O Inonu analisa os ativos desta rede com a evidencia disponivel. So roda quando voce pedir.</p>
      <div className={styles.form}>
        <label className={styles.field}>
          <span>Rede a analisar</span>
          <select aria-label="Rede a analisar" value={p.chainIndex} disabled={p.busy} onChange={(e) => p.onChain(e.target.value)}>
            {p.networks.map((n) => (
              <option key={n.chainIndex} value={n.chainIndex}>
                {`${networkLabel(n.chainIndex)} (${n.count})`}
              </option>
            ))}
          </select>
        </label>
        {p.busy ? (
          <button type="button" className={styles.button} onClick={p.onCancel}>
            Cancelar
          </button>
        ) : needsRefresh ? (
          <button type="button" className={styles.button} onClick={p.onRefresh}>Atualizar para analisar</button>
        ) : (
          <button type="button" className={styles.button} disabled={!p.prepared.ok || !p.consent} onClick={p.onAsk}>
            Pedir ao Inonu
          </button>
        )}
      </div>
      <label className={styles.consent}>
        <input type="checkbox" checked={p.consent} disabled={!p.prepared.ok || p.busy} onChange={(e) => p.onConsent(e.target.checked)} />
        <span>Enviar a rede, os contratos e os saldos desta leitura ao modelo (Jev), com contexto publico de mercado da OKX. O endereco da carteira, os precos desta leitura e os valores das posicoes nao sao enviados.</span>
      </label>
      {p.prepared.ok && !p.consent && !p.busy ? <p className={styles.note}>Autorize os dados acima para habilitar a analise.</p> : null}
      {p.candidate == null ? null : (
        <p className={styles.note}>
          {p.candidate.chainIndex !== p.chainIndex
            ? `${clean(p.candidate.symbol)} do radar esta em ${networkLabel(p.candidate.chainIndex)}. Selecione essa rede para inclui-lo.`
            : p.prepared.ok && p.prepared.candidateIncluded
              ? `${clean(p.candidate.symbol)} do radar incluido na analise.`
              : `${clean(p.candidate.symbol)} do radar fora desta consulta. Limite de seis ativos e contratos verificaveis.`}
        </p>
      )}
      {p.prepared.ok ? (
        <p className={styles.note}>
          {`${p.prepared.assets} ativos nesta consulta${p.ageSeconds === null ? "" : `, lidos ha ${p.ageSeconds} s`}. ${CONSULT_COST_TEXT}${p.prepared.beyond > 0 ? ` Mais ${p.prepared.beyond} ativos menores ficaram de fora.` : ""}${p.prepared.skipped > 0 ? ` ${p.prepared.skipped} ${p.prepared.skipped === 1 ? "ativo nao elegivel ficou" : "ativos nao elegiveis ficaram"} de fora.` : ""}`}
        </p>
      ) : (
        <p className={styles.note}>{p.prepared.reason}</p>
      )}
      {p.busy ? <p className={styles.note}>O Inonu esta analisando a carteira.</p> : null}
      {p.note === null ? null : <p className={styles.note}>{p.note}</p>}
      {plan === null ? null : (
        <>
          {!p.prepared.ok ? <p className={styles.note}>Resultado da leitura anterior. Atualize antes de uma nova analise.</p> : null}
          <p className={styles.note}>{plan.positionsEmpty === true ? "Sem saldo nos ativos lidos." : "Plano por ativo, na rede " + networkLabel(plan.chainIndex) + ":"}</p>
          {plan.assets.every((asset) => asset.action === "abstain") ? <p className={styles.analysisLimit} role="status">Nenhuma acao indicada pelo Inonu nesta consulta. A abstencao nao identifica sozinha qual dado impediu a decisao.</p> : null}
          {plan.assets.some((asset) => asset.evidence.gaps.length > 0) ? <p className={styles.note}>Lacunas da coleta, nao uma justificativa do modelo. Contexto complementar ausente nao prova, por si so, risco no ativo.</p> : null}
          <div className={styles.table} role="table" aria-label="Plano por ativo">
            <div className={`${styles.row} ${styles.plan} ${styles.head}`} role="row">
              {["Ativo", "Saldo", "O Inonu decidiu", "Dados usados"].map((label) => (
                <div key={label} className={styles.cell} role="columnheader">
                  {label}
                </div>
              ))}
            </div>
            {plan.assets.map((asset) => {
              const market = object((asset.evidence as { market?: unknown }).market);
              const available = [
                asset.evidence.flow?.buyShare === null || asset.evidence.flow === null ? null : `compradores ${Math.round((asset.evidence.flow.buyShare ?? 0) * 100)}%`,
                asset.evidence.risk === null ? null : `risco ${clean(String(asset.evidence.risk))}`,
              ].filter((value): value is string => value !== null);
              const gaps = asset.evidence.gaps.filter((gap) => !optionalGap(gap) && !inapplicableGap(gap));
              const optional = asset.evidence.gaps.filter(optionalGap);
              const inapplicable = asset.evidence.gaps.filter(inapplicableGap);
              return (
              <div key={asset.candidateId} className={`${styles.row} ${styles.plan}`} role="row" data-action={asset.action}>
                <div className={styles.cell} role="cell">{clean(asset.symbol)}</div>
                <div className={styles.cell} role="cell">{asset.balance === null ? "desconhecido" : asset.balance}</div>
                <div className={`${styles.cell} ${styles.verdict}`} role="cell">{asset.action === "abstain" ? "Nenhuma acao indicada" : PLAN_WORD[asset.action]}</div>
                <div className={`${styles.cell} ${styles.evidence}`} role="cell" data-evidence="details">
                  <details><summary>Evidencia</summary>
                  {available.length > 0 ? <p><span className={styles.evidenceLabel}>Dados disponiveis</span>{available.join("; ")}</p> : market === null ? <p>Resumo de fluxo e risco indisponivel</p> : null}
                  {market === null ? null : <MarketEvidence market={market} origin={asset.evidence.origin} />}
                  {asset.evidence.riskDetails ? <p>{`Risco: ${asset.evidence.riskDetails.level ?? "desconhecido"}; alertas: ${asset.evidence.riskDetails.tags.join(", ") || "nenhum informado"}; LP queimada: ${pctText(asset.evidence.riskDetails.lpBurnedPct)}`}</p> : null}
                  {asset.evidence.concentration ? <p>{`Concentracao: top 10 ${pctText(asset.evidence.concentration.top10HoldPct)}; desenvolvedor ${pctText(asset.evidence.concentration.devHoldPct)}; bundles ${pctText(asset.evidence.concentration.bundleHoldPct)}${asset.evidence.concentration.stale ? "; leitura antiga" : ""}`}</p> : null}
                  {asset.evidence.poolLiquidity ? <p>{`Pools consultados: ${asset.evidence.poolLiquidity.poolCount}; liquidez parcial ${usdText(asset.evidence.poolLiquidity.topPoolsLiquidityUsd)}; maior pool nesta amostra ${pctText(asset.evidence.poolLiquidity.largestPoolSharePct)}`}</p> : null}
                  {gaps.length > 0 ? <p><span className={styles.evidenceLabel}>Lacunas da coleta</span>{gaps.map(gapText).join("; ")}</p> : null}
                  {optional.length > 0 ? <details><summary>Contexto complementar ausente ({optional.length})</summary><p>{[...new Set(optional.map(gapText))].join("; ")}</p></details> : null}
                  {inapplicable.length > 0 ? <p>{[...new Set(inapplicable.map(gapText))].join("; ")}</p> : null}
                  </details>
                </div>
              </div>
              );
            })}
          </div>
          <p className={styles.note}>
            {`Modelo: ${clean(plan.assets[0]?.model ?? "desconhecido")}. Custo ${p.answer?.custo.usd === null || p.answer === null ? "nao informado" : `US$ ${p.answer.custo.usd.toFixed(4)}`}; tokens ${p.answer?.custo.tokens ?? "nao informados"}; leituras OnchainOS ${p.answer?.custo.chamadasOnchainos ?? "nao informadas"}. Consultivo: nenhuma ordem e enviada.`}
          </p>
        </>
      )}
    </section>
  );
}

/** The decision about one reading: the holdings of the last "Ler minha carteira", the moment the gateway observed them, and the clock of the screen. */
export default function HoldingsConsult({ rows, receivedAtMs, ageMs, nowMs, candidate = null, onRefresh, onDecision }: { readonly rows: readonly BalanceRow[]; readonly receivedAtMs: number; readonly ageMs: number; readonly nowMs: number; readonly candidate?: OnchainFocus | null; readonly onRefresh?: () => void; readonly onDecision?: (plan: PortfolioAnswer) => void }) {
  const networks = useMemo(() => consultNetworks(rows), [rows]);
  const [picked, setPicked] = useState<string | null>(null);
  const preferred = candidate !== null && networks.some((n) => n.chainIndex === candidate.chainIndex) ? candidate.chainIndex : (networks[0]?.chainIndex ?? "");
  const chainIndex = picked !== null && networks.some((n) => n.chainIndex === picked) ? picked : preferred;
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [answer, setAnswer] = useState<AskAnswer | null>(null);
  const [answerKey, setAnswerKey] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const client = useRef(createInonuClient());
  const active = useRef<{ controller: AbortController; requestId: string; generation: number } | null>(null);
  const generation = useRef(0);

  const observedAtMs = Math.min(receivedAtMs, Math.max(0, receivedAtMs - Math.max(0, ageMs)));
  const prepared = useMemo(() => prepareConsult(rows, chainIndex, observedAtMs, nowMs, candidate), [rows, chainIndex, observedAtMs, nowMs, candidate]);
  const requestKey = consultReadingKey(rows, chainIndex, receivedAtMs, ageMs, candidate);

  const stop = () => {
    generation.current++;
    const pending = active.current;
    active.current = null;
    pending?.controller.abort();
    if (pending) void client.current.cancelRequest(pending.requestId);
  };
  // another reading, another network or another request is another subject: what was asked and answered does not carry over
  useEffect(() => {
    stop();
    setAnswer(null);
    setAnswerKey(null);
    setBusy(false);
    setConsent(false);
    setNote(null);
  }, [requestKey]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => stop, []);

  const ask = () => {
    if (!prepared.ok || !consent || busy) return;
    const request = prepared.request;
    const pending = { controller: new AbortController(), requestId: crypto.randomUUID(), generation: ++generation.current };
    active.current = pending;
    setBusy(true);
    setAnswer(null);
    setNote(null);
    void client.current
      .ask(request, pending.controller.signal, pending.requestId)
      .then((result) => {
        if (active.current !== pending || pending.generation !== generation.current) return;
        if (result.carteira && portfolioMatches(result.carteira, request)) {
          setAnswer(result);
          setAnswerKey(requestKey);
          onDecision?.(result.carteira);
        }
        else setNote(OUTCOMES[result.status] ?? "A resposta nao corresponde aos ativos enviados. Tente de novo com uma leitura nova.");
      })
      .catch(() => {
        if (active.current === pending) setNote("A consulta nao produziu uma resposta verificavel.");
      })
      .finally(() => {
        if (active.current === pending) {
          active.current = null;
          setBusy(false);
        }
      });
  };

  return (
    <HoldingsConsultView
      networks={networks}
      chainIndex={chainIndex}
      prepared={prepared}
      ageSeconds={Number.isFinite(nowMs) && nowMs >= observedAtMs ? Math.floor((nowMs - observedAtMs) / 1000) : null}
      consent={consent}
      busy={busy}
      answer={answerKey === requestKey ? answer : null}
      note={note}
      onChain={setPicked}
      onConsent={setConsent}
      onAsk={ask}
      onRefresh={onRefresh}
      candidate={candidate}
      onCancel={() => {
        stop();
        setBusy(false);
        setNote("Consulta cancelada. Nenhum resultado sera aplicado.");
      }}
    />
  );
}
