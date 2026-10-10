"use client";

import type { Action, BlockEvent, Decision } from "@/lib/types";
import { presentDecision } from "@/lib/presentation";
import styles from "./DecisionPanel.module.css";

export interface DecisionPanelProps {
  latest: BlockEvent | null;
}

const ACTIONS: Action[] = ["buy", "sell", "hold"];
const ACTION_LABELS: Record<Action, string> = {
  buy: "Compra",
  sell: "Venda",
  hold: "Manter",
};

function validProbability(value: number | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1
    ? value
    : null;
}

function orderState(decision: Decision | null, latest: BlockEvent | null): string | null {
  const quote = latest?.quote;
  const fill = latest?.fill;
  if (fill?.simulated || quote?.status === "sim") return "Simulado";
  if (fill) return "Execução informada pelo feed";
  if (!quote) return null;
  if (quote.status === "sent") return "Ordem pendente";
  if (quote.status === "placed") return "Ordem registrada";
  if (quote.status === "reverted") return "Ordem revertida";
  if (quote.status === "lost") return "Ordem sem confirmação";
  return decision?.action === "hold" ? "Sem ordem informada" : "Estado informado pelo feed";
}

function BarRow({ action, value, active }: { action: Action; value: number | null; active: boolean }) {
  return (
    <div className={styles.row}>
      <span className={styles.label}>{ACTION_LABELS[action]}</span>
      <div
        className={styles.track}
        role="img"
        aria-label={`${ACTION_LABELS[action]}: ${value === null ? "Indisponível" : `${Math.round(value * 100)}%`}`}
      >
        {value !== null ? (
          <span className={`${styles.fill} ${styles[action]} ${active ? styles.active : ""}`} style={{ width: `${value * 100}%` }} />
        ) : null}
      </div>
      <span className={styles.pct}>{value === null ? "Indisponível" : `${Math.round(value * 100)}%`}</span>
    </div>
  );
}

export default function DecisionPanel({ latest }: DecisionPanelProps) {
  const decision = latest?.decision ?? null;
  const presentation = presentDecision(decision);
  const probabilities = decision?.probabilities;
  const order = orderState(decision, latest);
  const confidence = decision && !decision.late && probabilities
    ? validProbability(Math.max(probabilities.buy, probabilities.sell, probabilities.hold))
    : null;

  return (
    <section className={styles.panel} aria-labelledby="decision-title">
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>LEITURA DO FEED</p>
          <h2 id="decision-title" className={styles.title}>Decisão observada</h2>
        </div>
        {latest ? <span className={styles.block}>Bloco {latest.block.toLocaleString("en-US")}</span> : null}
      </header>

      <div className={styles.content}>
        <div className={`${styles.headline} ${styles[presentation.status]}`}>
          <span>{presentation.label}</span>
          {decision && !decision.late && confidence !== null ? (
            <span className={styles.headlinePct}>{Math.round(confidence * 100)}%</span>
          ) : null}
        </div>
        {order ? <p className={styles.orderState}>{order}</p> : null}

        <div className={styles.rows}>
          {ACTIONS.map((action) => {
            const value = validProbability(probabilities?.[action]);
            return (
              <BarRow
                key={action}
                action={action}
                value={value}
                active={decision !== null && !decision.late && decision.action === action}
              />
            );
          })}
        </div>
        <p className={styles.disclaimer}>
          {decision ? "Ação e probabilidades conforme os dados recebidos." : "Nenhuma decisão disponível no feed."}
          {decision ? ` Latência informada: ${Number.isFinite(decision.latencyMs) ? `${Math.round(decision.latencyMs)} ms` : "Indisponível"}.` : ""}
        </p>

        <details className={styles.details}>
          <summary>Como ler esta decisão</summary>
          <p>
            O painel apresenta a ação, as probabilidades e o estado de ordem presentes no feed. Uma decisão não comprova preenchimento; ordens pendentes, registradas, revertidas ou sem confirmação mantêm seus estados próprios.
          </p>
        </details>
      </div>
    </section>
  );
}
