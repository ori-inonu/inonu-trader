"use client";

import { useEffect, useRef, useState } from "react";
import type { WalletSnapshot } from "../../lib/okx-wallet";
import { createGevPilotController, gevPilotStateForWallet, initialGevPilotState, type GevPilotController, type GevPilotState } from "../../lib/gev-pilot-client";
import styles from "./GevPilotPanel.module.css";

export interface GevPilotPanelProps { snapshot: WalletSnapshot }
export interface GevPilotPanelViewProps extends GevPilotPanelProps {
  state: GevPilotState;
  onEvaluate: () => void;
  nowMs?: number;
}
const labels: Record<GevPilotState["status"], string> = {
  blocked: "Aguardando carteira", ready: "Pronto para avaliar", evaluating: "Avaliando em simulação",
  hold: "Hold · risco bloqueado", simulated: "Simulação registrada", expired: "Ciclo expirado", error: "Avaliação bloqueada",
};
const reasons: Record<string, string> = {
  ready: "Observação recente de X Layer. A avaliação começa somente pelo botão abaixo.",
  wallet_disconnected: "Conecte a carteira no painel da página.", wallet_unavailable: "Aguarde uma observação recente e completa da carteira em X Layer.",
  wallet_reading: "Leitura da carteira em andamento. A decisão anterior foi invalidada.", wallet_stale: "Observação da carteira vencida. Atualize a leitura no painel da carteira.",
  network_outside_pilot: "Esta rede está fora do piloto. A simulação exige X Layer.",
  evaluating: "Consultando o serviço local; execução permanece desabilitada.", request_timeout: "O serviço excedeu o prazo. Nenhuma resposta tardia será aplicada.",
  invalid_response: "Resposta incompatível ou não qualificada. Nenhum plano foi ativado.", service_unavailable: "Serviço local indisponível. Tente uma nova avaliação manual.",
  inventory_access_unverified: "Acesso ao inventário não verificado", source_unavailable: "Fonte indisponível",
  no_eligible_candidate: "Nenhum candidato passou pelos gates", gev_chose_hold: "GEV escolheu aguardar",
  inference_cost_unknown: "Custo de inferência desconhecido", quote_units_unknown: "Unidades das cotações desconhecidas",
  quote_costs_unknown: "Custos das cotações desconhecidos", model_access_unverified: "Acesso ao modelo não verificado",
  inventory_coverage_unknown: "Cobertura do inventário não qualificada", cycle_expired: "Prazo encerrado. O ciclo permanece somente como registro.",
};
const reasonLabel = (code: string) => reasons[code] ?? code;
const usd = (v: number | null) => v === null ? "desconhecido" : new Intl.NumberFormat("pt-BR", { style: "currency", currency: "USD", maximumFractionDigits: 4 }).format(v);

/** Pure view also exercises invalidation before effects during shared-prop changes. */
export function GevPilotPanelView({ snapshot, state: supplied, onEvaluate, nowMs = Date.now() }: GevPilotPanelViewProps) {
  const state = gevPilotStateForWallet(supplied, snapshot, nowMs);
  const cycle = state.cycle;
  const account = snapshot.account && /^0x[0-9a-fA-F]{40}$/.test(snapshot.account) ? snapshot.account.slice(0, 6) + "..." + snapshot.account.slice(-4) : "não conectada";
  const source = cycle?.source === "fixture" ? "Fixture de teste" : cycle?.source === "real" ? "Fonte real · declarada pelo serviço" : "Fonte indisponível";
  const selected = cycle?.candidates.find(c => c.id === cycle.decision?.choice);
  return <section className={styles.panel} aria-label="Piloto GEV em simulação" aria-busy={state.status === "evaluating"}>
    <header className={styles.header}>
      <div><p className={styles.eyebrow}>GEV · piloto local</p><h2 className={styles.title}>Carteira → decisão</h2></div>
      <span className={styles.badge}>Só simulação</span>
    </header>
    <div className={styles.content}>
      <p className={styles.status} role="status" aria-live="polite">{labels[state.status]}</p>
      <p className={styles.note}>{reasonLabel(state.reason)}</p>
      <dl className={styles.details}>
        <div><dt>Conta observada</dt><dd>{account}</dd></div>
        <div><dt>Rede</dt><dd>{snapshot.chainId === "0xc4" ? "X Layer · 196" : snapshot.chainId ?? "desconhecida"}</dd></div>
        <div><dt>Fonte</dt><dd>{source}</dd></div>
        <div><dt>Cobertura do inventário</dt><dd>{cycle?.coverage.status === "qualified" ? `X Layer · ${cycle.coverage.assetCount} ativos · valor completo na fonte` : "desconhecida"}</dd></div>
        <div><dt>Unidades e custos das cotações</dt><dd>{cycle?.coverage.status === "qualified" ? "qualificados na fonte" : "desconhecidos"}</dd></div>
        <div><dt>Valor conhecido na fonte</dt><dd>{usd(cycle?.knownValueUsd ?? null)}</dd></div>
        <div><dt>Lucro real</dt><dd>desconhecido</dd></div>
      </dl>
      {cycle?.source === "fixture" && <p className={styles.notice}>Dados de teste explícitos. Fixture não comprova acesso real nem P2.</p>}
      <p className={styles.note}>Acesso real ainda não certificado neste piloto. P2 depende de fontes e acesso GEV verificáveis.</p>
      {cycle && <>
        <div className={styles.reasons}><h3>Gates e risco</h3>
          {cycle.reasons.length > 0 ? <ul>{cycle.reasons.map((r, i) => <li key={`${i}-${r}`}>{reasonLabel(r)}</li>)}</ul> : <p>Gates registrados no ciclo; nenhuma execução habilitada.</p>}
        </div>
        <div className={styles.candidates}><h3>Candidatos · {cycle.candidates.length}</h3>
          {cycle.candidates.length === 0 ? <p>Nenhum candidato construído.</p> : <ul>{cycle.candidates.map(c => {
            const verdict = cycle.verdicts.find(v => v.candidateId === c.id);
            return <li key={c.id}><strong>{c.title}</strong><span>{verdict?.eligible ? "Elegível em simulação" : "Rejeitado"} · líquido hipotético {usd(c.netUsd)}</span>
              {verdict?.reasons.map((r, i) => <span key={`${i}-${r}`}>{reasonLabel(r)}</span>)}</li>;
          })}</ul>}
        </div>
        <dl className={styles.details}>
          <div><dt>Decisão registrada</dt><dd>{cycle.decision?.choice ?? "sem inferência"}</dd></div>
          <div><dt>Confiança do modelo</dt><dd>{cycle.decision?.confidence == null ? "desconhecida" : `${(cycle.decision.confidence * 100).toFixed(1)}%`}</dd></div>
          <div><dt>Inferência estimada</dt><dd>{usd(cycle.inferenceCostUsd)}</dd></div>
          <div><dt>Faturamento confirmado</dt><dd>desconhecido</dd></div>
        </dl>
        <p className={styles.note}>Confiança não é probabilidade de ganho. Valores e resultados de simulação são hipotéticos.</p>
        {state.activePlan && <div className={styles.plan}><h3>Plano hipotético ativo</h3>
          <p>Resultado líquido hipotético: {usd(selected?.netUsd ?? null)} · limite de perda hipotético: {usd(state.activePlan.maxLossUsd)}</p>
          <ol>{state.activePlan.steps.map((step, i) => <li key={i}>{step.description}</li>)}</ol>
          <p>Validade até {new Date(Math.min(state.activePlan.expiresAtMs, cycle.validUntilMs)).toLocaleTimeString("pt-BR")}.</p>
        </div>}
        {state.status === "expired" && <p className={styles.notice}>Ciclo expirado. Plano removido; apenas evidência histórica abaixo.</p>}
        <details className={styles.trace}><summary>Rastreio operacional · {cycle.cycleId}</summary>
          <dl className={styles.details}>
            <div><dt>Sessão</dt><dd>{cycle.sessionId}</dd></div><div><dt>Requisição</dt><dd>{cycle.requestId}</dd></div>
            <div><dt>Contexto</dt><dd>{cycle.contextKey}</dd></div><div><dt>Bloco observado</dt><dd>{state.observation?.block}</dd></div>
            <div><dt>Versão dos dados</dt><dd>{cycle.dataVersion ?? "indisponível"}</dd></div>
            <div><dt>Idade dos dados na renderização</dt><dd>{cycle.observedAtMs === null ? "desconhecida" : `${Math.floor((nowMs - cycle.observedAtMs) / 1000)} s`}</dd></div>
            <div><dt>Modelo</dt><dd>{cycle.decision?.model ?? "não consultado"}</dd></div>
            <div><dt>Plano registrado</dt><dd>{cycle.plan?.planId ?? "nenhum"}</dd></div>
          </dl>
          <p>Carteira → fonte → {cycle.candidates.length} candidatos → {cycle.verdicts.filter(v => v.eligible).length} elegíveis → {cycle.decision ? "decisão registrada" : "sem inferência"} → {state.activePlan ? "plano hipotético" : "sem plano ativo"} → registro {cycle.cycleId}.</p>
        </details>
      </>}
      <button type="button" className={styles.button} disabled={!state.canEvaluate} onClick={onEvaluate}>Avaliar em simulação</button>
      <p className={styles.footer}>Execução desabilitada. Sem assinatura, envio ou ações na carteira.</p>
    </div>
  </section>;
}

export function GevPilotPanel({ snapshot }: GevPilotPanelProps) {
  const controller = useRef<GevPilotController | null>(null);
  const [state, setState] = useState(initialGevPilotState);
  useEffect(() => {
    const local = createGevPilotController();
    controller.current = local;
    const unsubscribe = local.subscribe(() => setState(local.getSnapshot()));
    setState(local.getSnapshot());
    return () => { unsubscribe(); local.dispose(); if (controller.current === local) controller.current = null; };
  }, []);
  useEffect(() => { controller.current?.setWallet(snapshot); }, [snapshot]);
  return <GevPilotPanelView snapshot={snapshot} state={state} onEvaluate={() => {
    const local = controller.current;
    if (local) { local.setWallet(snapshot); void local.evaluate(); }
  }} />;
}

export default GevPilotPanel;
