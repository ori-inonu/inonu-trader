"use client";

import { useOperatorCenter, rankCandidates, riskLabel, type OperatorInsightsView } from "@/lib/operator-center";
import type { OperatorCycleView } from "@/lib/operator-feed";
import styles from "./DecisionCenter.module.css";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:3000";

const KIND_LABELS: Record<string, string> = {
  dex_round_trip: "Ida e volta DEX",
  cross_chain_rebalance: "Bridge entre redes",
  kuru_spot_maker: "Maker Kuru MON/USDC",
  defi_yield: "Rendimento DeFi",
  perp_funding_carry: "Funding carry (pesquisa)",
  memepump_research: "Meme Pump (pesquisa)",
};

const REASON_LABELS: Record<string, string> = {
  research_only: "somente pesquisa",
  net_below_minimum: "líquido abaixo do mínimo",
  net_unknown: "líquido desconhecido",
  costs_incomplete: "custos incompletos",
  quote_stale: "cotação velha",
  quote_time_in_future: "relógio da cotação à frente",
  quote_age_unknown: "idade da cotação desconhecida",
  quote_hash_missing: "cotação sem hash",
  price_impact_unknown: "impacto desconhecido",
  price_impact_above_maximum: "impacto acima do máximo",
  size_usd_unknown: "tamanho desconhecido",
  size_above_max_plan: "acima do teto por plano",
  size_above_capital_fraction: "acima da fração do capital",
  inventory_value_unknown: "patrimônio sem valor",
  chain_not_in_inventory: "rede sem saldo observado",
  source_balance_unknown: "saldo de origem desconhecido",
  source_balance_insufficient: "saldo de origem insuficiente",
  gas_balance_unknown: "gas desconhecido",
  gas_below_reserve: "gas abaixo da reserva",
  gas_reserve_would_be_spent: "gastaria a reserva de gas",
  destination_chain_unknown: "rede de destino desconhecida",
};

function kindLabel(kind: string): string {
  return KIND_LABELS[kind] ?? kind;
}

function reasonLabel(reason: string): string {
  return REASON_LABELS[reason] ?? reason.replace(/_/g, " ");
}

function usd(value: number | null | undefined, digits = 2): string {
  return typeof value === "number" && Number.isFinite(value) ? `${value < 0 ? "-" : ""}${Math.abs(value).toFixed(digits)} USD` : "desconhecido";
}

function pct(value: number | null | undefined): string {
  return typeof value === "number" && Number.isFinite(value) ? `${Math.round(value * 100)}%` : "n/d";
}

function age(ms: number | null): string {
  if (ms === null || ms < 0) return "idade desconhecida";
  const seconds = Math.floor(ms / 1_000);
  if (seconds < 60) return `há ${seconds} s`;
  if (seconds < 3_600) return `há ${Math.floor(seconds / 60)} min`;
  return `há ${Math.floor(seconds / 3_600)} h ${Math.floor((seconds % 3_600) / 60)} min`;
}

function executionLabel(status: string): string {
  switch (status) {
    case "completed": return "concluída e reconciliada";
    case "sent": return "enviada, aguardando reconciliação";
    case "dry_run": return "simulada (dry run)";
    case "prepared": return "preparada, não enviada";
    case "failed": return "falhou";
    default: return "bloqueada";
  }
}

function sourceLabel(source: string): string {
  return source === "synthetic" ? "dados sintéticos de demonstração" : "API OKX OnChain OS";
}

function Gauge({ label, used, max, unit }: { label: string; used: number; max: number | null; unit: string }) {
  const ratio = max && max > 0 ? Math.min(1, used / max) : 0;
  return (
    <div className={styles.gauge}>
      <div className={styles.gaugeHead}>
        <span>{label}</span>
        <span className={styles.mono}>{used.toFixed(unit === "USD" ? 2 : 0)}{max !== null ? ` / ${max}` : ""} {unit}</span>
      </div>
      <div className={styles.track} role="img" aria-label={`${label}: ${Math.round(ratio * 100)}% usado`}>
        <span className={`${styles.fill} ${ratio >= 0.9 ? styles.fillHot : ""}`} style={{ transform: `scaleX(${ratio})` }} />
      </div>
    </div>
  );
}

function ProbabilityBars({ cycle }: { cycle: OperatorCycleView }) {
  if (!cycle.decision) return <p className={styles.note}>Jev não foi consultado neste ciclo: nenhum candidato passou nos gates, então não houve custo de inferência.</p>;
  const labelFor = (key: string) => key === "hold" ? "Manter (hold)" : kindLabel(cycle.candidates.find((candidate) => candidate.id === key)?.kind ?? key) + " " + (cycle.candidates.find((candidate) => candidate.id === key)?.from.symbol ?? "");
  const rows = Object.entries(cycle.decision.probabilities).sort((a, b) => b[1] - a[1]).slice(0, 6);
  return (
    <div className={styles.rows}>
      {rows.map(([key, value]) => (
        <div key={key} className={styles.row}>
          <span className={styles.rowLabel}>{labelFor(key)}</span>
          <div className={styles.track} role="img" aria-label={`${labelFor(key)}: ${Math.round(value * 100)}%`}>
            <span className={`${styles.fill} ${key === cycle.decision!.choice ? styles.fillChosen : ""}`} style={{ transform: `scaleX(${value})` }} />
          </div>
          <span className={styles.mono}>{Math.round(value * 100)}%</span>
        </div>
      ))}
    </div>
  );
}

function Sparkline({ insights }: { insights: OperatorInsightsView }) {
  const points = insights.series.slice(-40);
  if (points.length < 2) return null;
  const values = points.map((point) => point.knownValueUsd);
  const min = Math.min(...values), max = Math.max(...values);
  const span = max - min || 1;
  const width = 320, height = 64;
  const path = points.map((point, index) => `${index === 0 ? "M" : "L"}${(index / (points.length - 1)) * width},${height - ((point.knownValueUsd - min) / span) * (height - 8) - 4}`).join(" ");
  return (
    <svg className={styles.spark} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Patrimônio conhecido nos últimos ${points.length} ciclos, de ${min.toFixed(2)} a ${max.toFixed(2)} USD`}>
      <path d={path} fill="none" stroke="currentColor" strokeWidth="2" />
      {points.map((point, index) => point.choice && point.choice !== "hold" ? (
        <circle key={index} cx={(index / (points.length - 1)) * width} cy={height - ((point.knownValueUsd - min) / span) * (height - 8) - 4} r="3" fill={point.execution === "completed" ? "var(--buy)" : "var(--hold)"} />
      ) : null)}
    </svg>
  );
}

export interface DecisionCenterViewProps {
  state: ReturnType<typeof useOperatorCenter>;
}

export function DecisionCenterView({ state }: DecisionCenterViewProps) {
  const cycle = state.cycle;
  const chosen = cycle?.decision && cycle.decision.choice !== "hold" ? cycle.candidates.find((candidate) => candidate.id === cycle.decision!.choice) ?? null : null;
  const ranked = cycle ? rankCandidates(cycle) : [];
  const eligibleCount = cycle?.eligibleIds.length ?? 0;
  const insights = state.insights;

  return (
    <section className={styles.center} aria-labelledby="center-title">
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>CENTRAL DE DECISÕES</p>
          <h2 id="center-title" className={styles.title}>Operador Jev sobre a carteira OKX</h2>
          <p className={styles.description}>
            Inventário em todas as redes, candidatos com risco e retorno, escolha do Jev e execução com gates. Atualiza sozinho a cada 5 segundos.
          </p>
        </div>
        <div className={styles.status}>
          <span className={`${styles.statusDot} ${state.status === "ready" && state.ageMs !== null && state.ageMs < 120_000 ? styles.statusLive : ""}`} aria-hidden="true" />
          <span>
            {state.status === "absent" ? "sem ciclo registrado" : state.status === "error" && !cycle ? `backend sem resposta (${state.error})` : cycle ? `ciclo ${cycle.cycleId.slice(0, 8)} ${age(state.ageMs)}` : "carregando"}
          </span>
        </div>
      </header>

      {!cycle ? (
        <div className={styles.body}>
          <p className={styles.note}>
            {state.status === "absent"
              ? "Rode bun run okx:operator no backend. Sem flags ele usa dados sintéticos; com --live --jev --loop ele lê a carteira pela API OKX e pergunta ao Jev real a cada intervalo."
              : "Aguardando o backend na porta configurada."}
          </p>
        </div>
      ) : (
        <div className={styles.body}>
          <div className={styles.kpis}>
            <div className={styles.kpi}><span className={styles.kpiLabel}>Patrimônio conhecido</span><span className={styles.kpiValue}>{usd(cycle.inventory.knownValueUsd)}</span><span className={styles.kpiMeta}>{cycle.inventory.valueComplete ? "cobertura completa" : "parcial: ativos sem preço"}</span></div>
            <div className={styles.kpi}><span className={styles.kpiLabel}>Candidatos</span><span className={styles.kpiValue}>{eligibleCount} / {cycle.candidates.length}</span><span className={styles.kpiMeta}>elegíveis / avaliados</span></div>
            <div className={styles.kpi}><span className={styles.kpiLabel}>Decisão do Jev</span><span className={styles.kpiValue}>{cycle.decision ? (cycle.decision.choice === "hold" ? "Manter" : chosen ? kindLabel(chosen.kind) : cycle.decision.choice) : "não consultado"}</span><span className={styles.kpiMeta}>{cycle.decision ? `${cycle.decision.model}, ${Math.round(cycle.decision.latencyMs)} ms, peso ${pct(cycle.decision.probabilities[cycle.decision.choice])}` : "sem elegíveis"}</span></div>
            <div className={styles.kpi}><span className={styles.kpiLabel}>Resultado realizado hoje</span><span className={`${styles.kpiValue} ${(cycle.ledger?.dayRealizedUsd ?? 0) < 0 ? styles.neg : (cycle.ledger?.dayRealizedUsd ?? 0) > 0 ? styles.pos : ""}`}>{usd(cycle.ledger?.dayRealizedUsd ?? 0, 4)}</span><span className={styles.kpiMeta}>só planos concluídos e reconciliados</span></div>
            <div className={styles.kpi}><span className={styles.kpiLabel}>Execução</span><span className={styles.kpiValue}>{executionLabel(cycle.execution.status)}</span><span className={styles.kpiMeta}>{cycle.execution.reasons.map(reasonLabel).join("; ") || "sem motivos"}</span></div>
            <div className={styles.kpi}><span className={styles.kpiLabel}>Fonte</span><span className={styles.kpiValue}>{cycle.inventory.source === "synthetic" ? "sintética" : "OKX"}</span><span className={styles.kpiMeta}>{sourceLabel(cycle.inventory.source)}</span></div>
          </div>

          <div className={styles.columns}>
            <div className={styles.block}>
              <h3 className={styles.subtitle}>Pesos da decisão</h3>
              <ProbabilityBars cycle={cycle} />
              {chosen ? (
                <p className={styles.note}>
                  Escolhido: {chosen.title}. Tamanho {usd(chosen.sizeUsd)}, líquido estimado {usd(chosen.netUsd, 4)}, risco {riskLabel(chosen)}.
                  {cycle.plan ? ` Plano ${cycle.plan.planId} (${cycle.plan.executionQualification}) com ${cycle.plan.steps.length} passo(s), expira ${new Date(cycle.plan.expiresAtMs).toLocaleTimeString("pt-BR")}.` : ""}
                  {cycle.execution.txHash ? ` Transação ${cycle.execution.txHash}.` : ""}
                  {cycle.execution.realizedUsd !== undefined ? ` Resultado realizado ${usd(cycle.execution.realizedUsd, 4)}.` : ""}
                </p>
              ) : null}
              {cycle.warnings.length ? <p className={styles.warn}>Avisos: {cycle.warnings.map(reasonLabel).join("; ")}.</p> : null}
            </div>

            <div className={styles.block}>
              <h3 className={styles.subtitle}>Limites do dia</h3>
              {cycle.ledger ? (
                <>
                  <Gauge label="Capital comprometido" used={cycle.ledger.dayNotionalUsd} max={null} unit="USD" />
                  <Gauge label="Planos executados" used={cycle.ledger.dayPlans} max={null} unit="planos" />
                  <p className={styles.note}>
                    Pernas abertas: {cycle.ledger.openLegs.length === 0 ? "nenhuma" : cycle.ledger.openLegs.map((leg) => `${leg.pairKey} ${leg.status}`).join(", ")}.
                    {cycle.ledger.killSwitch ? " Kill switch ativo: nada executa até remover data/operator/STOP." : " Kill switch inativo."}
                  </p>
                </>
              ) : <p className={styles.note}>Ledger indisponível neste ciclo.</p>}
              {insights ? (
                <p className={styles.note}>
                  Histórico: {insights.cycles} ciclos, Jev consultado {insights.decisions.asked} vezes (manter {insights.decisions.hold}, escolha {insights.decisions.chosen}); planos concluídos {insights.realized.plans}, acerto {pct(insights.realized.hitRate)}, realizado total {usd(insights.realized.totalUsd, 4)}, inferência {usd(insights.inferenceUsd, 4)}.
                </p>
              ) : null}
              {insights ? <Sparkline insights={insights} /> : null}
            </div>
          </div>

          <h3 className={styles.subtitle}>Candidatos avaliados neste ciclo</h3>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr><th>Oportunidade</th><th>Rede</th><th>Tamanho</th><th>Líquido</th><th>Retorno</th><th>Impacto</th><th>Cotação</th><th>Risco</th><th>Peso Jev</th><th>Gate</th></tr>
              </thead>
              <tbody>
                {ranked.map((candidate) => (
                  <tr key={candidate.id} className={candidate.eligible ? styles.rowEligible : styles.rowRejected}>
                    <td><span className={styles.cellTitle}>{kindLabel(candidate.kind)}</span><span className={styles.cellMeta}>{candidate.from.symbol} para {candidate.to.symbol}</span></td>
                    <td className={styles.mono}>{candidate.kind === "perp_funding_carry" ? "OKX Exchange" : candidate.toChainIndex ? `${candidate.chainIndex} para ${candidate.toChainIndex}` : candidate.chainIndex}</td>
                    <td className={styles.mono}>{usd(candidate.sizeUsd)}</td>
                    <td className={`${styles.mono} ${candidate.netUsd !== null ? (candidate.netUsd >= 0 ? styles.pos : styles.neg) : ""}`}>{usd(candidate.netUsd, 4)}</td>
                    <td className={styles.mono}>{candidate.netBps === null ? "n/d" : `${candidate.netBps.toFixed(1)} bps`}</td>
                    <td className={styles.mono}>{candidate.priceImpactPercent === null ? "n/d" : `${candidate.priceImpactPercent.toFixed(2)}%`}</td>
                    <td className={styles.mono}>{candidate.quoteAgeMs === null ? "n/d" : `${(candidate.quoteAgeMs / 1_000).toFixed(1)} s`}</td>
                    <td><span className={`${styles.risk} ${styles[`risk_${riskLabel(candidate)}`]}`}>{riskLabel(candidate)}</span></td>
                    <td className={styles.mono}>{candidate.weight === null ? "n/d" : pct(candidate.weight)}</td>
                    <td className={styles.cellMeta}>{candidate.eligible ? "elegível" : candidate.reasons.map(reasonLabel).join(", ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className={styles.columns}>
            <div className={styles.block}>
              <h3 className={styles.subtitle}>Patrimônio por rede</h3>
              <ul className={styles.chains}>
                {cycle.inventory.chains.map((chain) => (
                  <li key={chain.chainIndex} className={styles.chain}>
                    <div className={styles.chainHead}><span className={styles.cellTitle}>{chain.chainName}</span><span className={styles.mono}>{usd(chain.knownValueUsd)}{chain.valueComplete ? "" : " parcial"}</span></div>
                    <div className={styles.assets}>
                      {chain.assets.map((asset, index) => <span key={index} className={styles.asset}><span className={styles.cellMeta}>{asset.symbol}</span><span className={styles.mono}>{asset.balanceText}</span></span>)}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
            <div className={styles.block}>
              <h3 className={styles.subtitle}>Risco e retorno por tipo (histórico)</h3>
              {insights && insights.byKind.length ? (
                <div className={styles.tableWrap}>
                  <table className={styles.table}>
                    <thead><tr><th>Tipo</th><th>Vistos</th><th>Elegíveis</th><th>Escolhidos</th><th>Retorno médio</th><th>Impacto médio</th><th>Motivo mais comum</th></tr></thead>
                    <tbody>
                      {insights.byKind.map((kind) => (
                        <tr key={kind.kind}>
                          <td className={styles.cellTitle}>{kindLabel(kind.kind)}</td>
                          <td className={styles.mono}>{kind.seen}</td>
                          <td className={styles.mono}>{kind.eligible} ({pct(kind.eligibleRate)})</td>
                          <td className={styles.mono}>{kind.chosen}{kind.chosenRate === null ? "" : ` (${pct(kind.chosenRate)})`}</td>
                          <td className={`${styles.mono} ${kind.avgNetBps !== null ? (kind.avgNetBps >= 0 ? styles.pos : styles.neg) : ""}`}>{kind.avgNetBps === null ? "n/d" : `${kind.avgNetBps.toFixed(1)} bps`}</td>
                          <td className={styles.mono}>{kind.avgPriceImpactPercent === null ? "n/d" : `${kind.avgPriceImpactPercent.toFixed(2)}%`}</td>
                          <td className={styles.cellMeta}>{kind.topReasons[0] ? `${reasonLabel(kind.topReasons[0].reason)} (${kind.topReasons[0].count})` : "nenhum"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : <p className={styles.note}>Sem histórico suficiente ainda.</p>}
              <h3 className={styles.subtitle}>Ciclos recentes</h3>
              <ul className={styles.timeline}>
                {[...state.history].reverse().slice(0, 8).map((entry) => (
                  <li key={entry.cycleId} className={styles.timelineRow}>
                    <span className={styles.mono}>{new Date(entry.startedAtMs).toLocaleTimeString("pt-BR")}</span>
                    <span>{entry.decision ? (entry.decision.choice === "hold" ? "manter" : kindLabel(entry.candidates.find((candidate) => candidate.id === entry.decision!.choice)?.kind ?? entry.decision.choice)) : "sem consulta"}</span>
                    <span className={styles.cellMeta}>{executionLabel(entry.execution.status)}</span>
                    <span className={styles.mono}>{usd(entry.inventory.knownValueUsd)}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <p className={styles.footer}>
            Probabilidades são pesos de decisão, não taxas de acerto. Líquido estimado deduz taxas de rede, custos e inferência uma única vez; o resultado realizado só conta após reconciliação do saldo. A execução real exige os gates do operador e uma carteira dedicada.
          </p>
        </div>
      )}
    </section>
  );
}

export default function DecisionCenter() {
  const state = useOperatorCenter(API_URL);
  return <DecisionCenterView state={state} />;
}
