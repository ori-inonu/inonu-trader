"use client";

import { useEffect, useRef } from "react";
import type { SystemOneCandidateView, SystemOneCycleView, SystemOneState } from "@/lib/system-one";
import styles from "./SystemOne.module.css";

const UNAVAILABLE = "Indisponivel";

export interface SystemOneProps {
  state: SystemOneState;
  reducedMotion?: boolean;
}

function pct(value: number | null, digits = 1): string {
  return value === null ? UNAVAILABLE : `${(value * 100).toFixed(digits)}%`;
}

function usd(value: number | null, digits = 2): string {
  return value === null ? UNAVAILABLE : `${value < 0 ? "-" : ""}${Math.abs(value).toFixed(digits)} USD`;
}

function age(ms: number | null): string {
  if (ms === null) return "";
  const seconds = Math.floor(ms / 1_000);
  if (seconds < 60) return `ha ${seconds} s`;
  if (seconds < 3_600) return `ha ${Math.floor(seconds / 60)} min`;
  return `ha ${Math.floor(seconds / 3_600)} h`;
}

const REASON: Record<string, string> = {
  phase_0_observes_only: "fase 0 so observa",
  phase_requires_spot: "fase 1 permite apenas spot",
  borrowing_not_allowed_in_phase: "sem emprestimo nesta fase",
  above_leverage_ceiling: "acima do teto",
  above_leverage_cap: "acima do cap",
  leverage_cap_undefined: "cap indefinido sem Kelly",
  below_liquidation_floor: "abaixo do piso de liquidacao",
  sigma_unknown: "sigma desconhecido",
  funding_unknown: "funding ou intervalo desconhecido",
  market_stale: "dados de mercado ausentes ou desatualizados",
  inventory_stale: "inventario ausente ou desatualizado",
  mark_price_unknown: "mark desconhecido",
  margin_zero: "margem zero",
  inventory_value_incomplete: "inventario incompleto",
  inventory_invalid: "inventario invalido",
  would_flip_open_position: "inverteria a posicao",
  exposure_cap_reached: "exposicao no limite",
  system_one_never_executes: "System One nunca envia ordens",
  no_eligible_candidate: "nenhum candidato elegivel",
  jev_not_asked: "Jev nao consultado",
  hold: "manter a posicao atual",
  decision_error: "erro na consulta ao modelo",
  decision_timeout: "prazo da consulta esgotado",
  decision_malformed: "resposta fora do formato esperado",
  "decision_invalid-choice": "escolha fora dos candidatos permitidos",
  decision_failed: "consulta sem decisao aceita",
};

const DECISION_STATUS: Record<string, string> = {
  error: "erro na consulta", timeout: "prazo esgotado", malformed: "resposta invalida", "invalid-choice": "escolha nao permitida",
};

const EXECUTION: Record<string, string> = {
  dry_run: "simulado, nada enviado",
  blocked: "bloqueado",
};

const PHASE: Record<string, string> = {
  "fase-0": "Fase 0, observar",
  "fase-1": "Fase 1, spot sem alavancagem",
  "fase-2": "Fase 2, alavancagem exige vantagem validada",
};

function sideWord(side: "long" | "short"): string {
  return side === "long" ? "Comprado" : "Vendido";
}

function choiceWord(cycle: SystemOneCycleView): string {
  if (!cycle.decision) return "Jev nao consultado";
  if (cycle.decision.status !== "ok") return "Decisao rejeitada";
  if (cycle.decision.choice === "hold") return "Manter";
  return cycle.chosen ? `${sideWord(cycle.chosen.side)} ${cycle.chosen.leverage}x` : cycle.decision.choice;
}

/**
 * The leverage ladder as a 2.5D row of slabs: one per side and leverage, lit when eligible, raised
 * and coloured when Jev chose it. The cap and the ceiling draw as walls the ladder cannot cross.
 */
function Ladder({ cycle, reducedMotion }: { cycle: SystemOneCycleView; reducedMotion: boolean }) {
  const sides: Array<"long" | "short"> = ["long", "short"];
  const ceiling = cycle.brief.limits.leverageCeiling;
  const cap = cycle.brief.limits.leverageCap;
  return (
    <div className={`${styles.ladder} ${reducedMotion ? styles.still : ""}`} role="list" aria-label="Escada de alavancagem">
      {sides.map((side) => (
        <div key={side} className={styles.ladderRow}>
          <span className={`${styles.ladderSide} ${styles[`side_${side}`]}`}>{sideWord(side)}</span>
          <div className={styles.ladderSlabs}>
            {cycle.brief.candidates.filter((candidate) => candidate.side === side).map((candidate, index) => (
              <Slab key={candidate.id} candidate={candidate} chosen={cycle.chosen?.id === candidate.id} index={index} ceiling={ceiling} cap={cap} modelLabel={cycle.decision?.model === "mock" ? "MOCK" : "Jev"} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function Slab({ candidate, chosen, index, ceiling, cap, modelLabel }: { candidate: SystemOneCandidateView; chosen: boolean; index: number; ceiling: number; cap: number | null; modelLabel: string }) {
  const wall = candidate.leverage > ceiling ? "ceiling" : cap !== null && candidate.leverage > cap ? "cap" : null;
  const title = candidate.eligible
    ? `${candidate.id}: toque de liquidacao ${pct(candidate.touchProbability)}, mediana sem vantagem ${candidate.medianMultipleNoEdge === null ? UNAVAILABLE : candidate.medianMultipleNoEdge.toFixed(3) + "x"}, carry ${usd(candidate.fundingCarryUsd, 4)}`
    : `${candidate.id}: ${candidate.reasons.map((reason) => REASON[reason] ?? reason).join(", ")}`;
  return (
    <div
      role="listitem"
      className={`${styles.slab} ${candidate.eligible ? styles.slabEligible : styles.slabRejected} ${chosen ? styles.slabChosen : ""} ${wall ? styles[`wall_${wall}`] : ""} ${styles[`slabTone_${candidate.side}`]}`}
      style={{ ["--i" as string]: String(index) }}
      title={title}
    >
      <span className={styles.slabTop} aria-hidden="true" />
      <span className={styles.slabLeverage}>{candidate.leverage}x</span>
      <span className={styles.slabTouch}>{candidate.touchProbability === null ? "n/d" : pct(candidate.touchProbability, 0)}</span>
      <span className={styles.slabStatus}>{candidate.eligible ? "Elegivel" : "Bloqueado"}</span>
      <details className={styles.slabDetails}>
        <summary>Detalhes {candidate.id}</summary>
        <p>{title}</p>
      </details>
      {chosen ? <span className={styles.slabFlag}>{modelLabel}</span> : null}
    </div>
  );
}

export function SystemOneView({ state, reducedMotion = false }: SystemOneProps) {
  const cycle = state.cycle;
  const mock = cycle?.decision?.model === "mock";
  const historical = state.status === "error" || (state.ageMs !== null && state.ageMs > 120_000);
  const wordRef = useRef<HTMLSpanElement | null>(null);
  const word = cycle ? choiceWord(cycle) : state.status === "absent" ? "Sem ciclo" : state.status === "error" ? "Backend sem resposta" : "Carregando";

  useEffect(() => {
    const element = wordRef.current;
    if (!element || reducedMotion || typeof element.animate !== "function") return;
    element.animate([{ opacity: 0.35, transform: "translateY(4px)" }, { opacity: 1, transform: "translateY(0)" }], { duration: 260, easing: "cubic-bezier(0.16, 1, 0.3, 1)" });
  }, [word, reducedMotion]);

  const market = cycle?.brief.market ?? null;
  const limits = cycle?.brief.limits ?? null;
  const rejected = cycle?.decision !== null && cycle?.decision !== undefined && cycle.decision.status !== "ok";
  const tone = !cycle || !cycle.decision || rejected ? "unknown" : cycle.decision.choice === "hold" ? "hold" : cycle.chosen?.side === "long" ? "buy" : "sell";

  return (
    <section className={`${styles.strip} ${styles[tone]}`} aria-labelledby="system-one-title">
      <header className={styles.head}>
        <div>
          <p className={styles.eyebrow}>System One</p>
          <h3 className={styles.title} id="system-one-title">{mock ? "Simulacao de alavancagem com MOCK" : "Central de decisao de alavancagem"}</h3>
          <p className={styles.sub}>
            {cycle
              ? `${PHASE[cycle.brief.phase] ?? cycle.brief.phase}. ${cycle.brief.market.instId}, ${cycle.brief.market.source === "synthetic" ? "dados sinteticos" : cycle.brief.market.source === "okx_public_v5" ? "API publica OKX v5" : "origem de mercado desconhecida"}, ciclo ${cycle.cycleId.slice(0, 10)} ${age(state.ageMs)}.`
              : state.status === "absent"
                ? "Rode bun run system-one no backend. Sem flags e um demo sintetico; com --public le o perpetuo na API publica da OKX e com --jev pergunta ao Jev real."
                : "Aguardando o backend."}
          </p>
        </div>
        <div className={styles.choice}>
          <span className={styles.choiceLabel}>{rejected ? "Consulta rejeitada" : historical ? "Ultima escolha registrada" : "Escolha"}</span>
          <span className={styles.choiceWord} ref={wordRef} data-system-one-word="true">{word}</span>
          <span className={styles.choiceMeta}>
            {cycle?.decision ? `${cycle.decision.model}, ${Math.round(cycle.decision.latencyMs)} ms, ${rejected ? DECISION_STATUS[cycle.decision.status] ?? "status desconhecido" : `peso ${pct(cycle.decision.probabilities[cycle.decision.choice] ?? null, 0)}`}` : cycle ? "nenhum candidato elegivel" : ""}
          </span>
        </div>
      </header>
      {state.error ? <p role="status" className={styles.note}>Atualizacao indisponivel. Os dados exibidos sao do ultimo ciclo recebido.</p> : historical ? <p role="status" className={styles.note}>Ciclo desatualizado. Aguardando nova leitura.</p> : null}
      {cycle ? <p className={styles.note}>Carteira: {cycle.brief.wallet.source === "configured" ? "capital configurado, saldo nao consultado" : cycle.brief.wallet.source === "synthetic" ? "capital sintetico" : cycle.brief.wallet.source === "okx_balance_api" ? "leitura de saldo" : "origem de carteira desconhecida"}. {mock ? "MOCK deterministico, sem consulta ao Jev." : ""}</p> : null}
      {rejected ? <p role="status" className={styles.note}>Manter por seguranca: nenhuma escolha aceita. O peso do fallback nao representa uma decisao do modelo.</p> : null}

      {cycle ? (
        <div className={styles.body}>
          <dl className={styles.readouts}>
            <div className={styles.readout}><dt>Mark</dt><dd>{market && market.markPrice !== null ? market.markPrice.toFixed(6) : UNAVAILABLE}</dd></div>
            <div className={styles.readout}><dt>Funding por liquidacao</dt><dd>{market && market.fundingRate !== null ? pct(market.fundingRate, 4) : UNAVAILABLE}</dd></div>
            <div className={styles.readout}><dt>Sigma diario realizado</dt><dd>{market ? pct(market.realizedSigmaDaily, 2) : UNAVAILABLE}</dd></div>
            <div className={styles.readout}><dt>Teto e cap</dt><dd>{limits ? `${limits.leverageCeiling}x, ${limits.leverageCap === null ? "cap indefinido" : `cap ${limits.leverageCap}x`}` : UNAVAILABLE}</dd></div>
            <div className={styles.readout}><dt>Margem por ordem</dt><dd>{limits ? usd(limits.orderCapUsd) : UNAVAILABLE}</dd></div>
            <div className={styles.readout}><dt>Execucao</dt><dd>{EXECUTION[cycle.execution.status] ?? cycle.execution.status}</dd></div>
          </dl>
          <p className={styles.note}>Motivos da execucao: {cycle.execution.reasons.map(reason => REASON[reason] ?? reason).join("; ") || "nenhum motivo informado"}.</p>
          <Ladder cycle={cycle} reducedMotion={reducedMotion} />
          <p className={styles.note}>
            Probabilidades sao pesos de decisao, nao taxas de acerto. O toque de liquidacao assume deriva zero no horizonte de {cycle.brief.horizonDays} dias. O System One nunca executa: a execucao fica atras dos gates do operador e da autorizacao do dono.
            {cycle.warnings.length ? ` Avisos: ${cycle.warnings.join("; ")}.` : ""}
          </p>
        </div>
      ) : null}
    </section>
  );
}

export default SystemOneView;
