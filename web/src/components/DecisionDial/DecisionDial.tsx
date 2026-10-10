"use client";

import { memo, useId } from "react";
import { arcDash, needleAngle } from "@/lib/dial-geometry";
import type { Action, Decision } from "@/lib/types";
import styles from "./DecisionDial.module.css";

const UNAVAILABLE = "Indisponivel";
const WAITING = "Aguardando decisao";

const ACTION_LABEL: Record<Action, string> = {
  buy: "Compra",
  sell: "Venda",
  hold: "Manter",
};

const ARMS: Array<{ key: Action; token: string }> = [
  { key: "buy", token: "var(--buy)" },
  { key: "sell", token: "var(--sell)" },
  { key: "hold", token: "var(--hold)" },
];

function clampProbability(value: number | undefined): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.min(1, value) : 0;
}

function percent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

export interface DecisionDialProps {
  probabilities: Decision["probabilities"] | null;
  action: Action | null;
  late: boolean;
  size?: number;
  reducedMotion?: boolean;
}

/**
 * Three concentric probability arcs and one weighted needle.
 * Takes primitives only, so React.memo actually holds: a fresh probabilities object every render
 * would defeat it. The arc is never the only representation, a hidden text sibling carries the
 * same three percentages for screen readers.
 */
function DecisionDialView({ probabilities, action, late, size = 220, reducedMotion = false }: DecisionDialProps) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const centre = size / 2;

  const values = {
    buy: clampProbability(probabilities?.buy),
    sell: clampProbability(probabilities?.sell),
    hold: clampProbability(probabilities?.hold),
  };

  const hasData = probabilities !== null;
  const word = !hasData
    ? WAITING
    : late
      ? "Resposta tardia"
      : action
        ? ACTION_LABEL[action]
        : UNAVAILABLE;

  const tone = !hasData ? "unknown" : late ? "late" : action ?? "unknown";
  const angle = hasData ? needleAngle(values, action ?? "hold") : -120;
  const description = hasData
    ? `Compra ${percent(values.buy)}, venda ${percent(values.sell)}, manter ${percent(values.hold)}. Decisao ${word}.`
    : "Probabilidades indisponiveis. Aguardando decisao.";

  const radii = [size * 0.44, size * 0.36, size * 0.28];

  return (
    <div className={`${styles.dial} ${styles[tone]}`} style={{ width: size, height: size }}>
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        role="img"
        aria-label={description}
        className={styles.svg}
      >
        <defs>
          <linearGradient id={`dialArc${uid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--signal)" stopOpacity="0.55" />
            <stop offset="100%" stopColor="var(--signal-deep)" stopOpacity="0.12" />
          </linearGradient>
        </defs>

        <circle cx={centre} cy={centre} r={radii[0]} className={styles.bed} />

        {ARMS.map((arm, index) => (
          <circle
            key={arm.key}
            cx={centre}
            cy={centre}
            r={radii[index]}
            pathLength="100"
            fill="none"
            stroke={arm.token}
            strokeWidth={size * 0.055}
            strokeLinecap="round"
            className={reducedMotion ? styles.arcStatic : styles.arc}
            strokeDasharray={arcDash(values[arm.key])}
            strokeDashoffset={-size * 0.09 * index}
            transform={`rotate(-90 ${centre} ${centre})`}
          />
        ))}

        <circle
          cx={centre}
          cy={centre}
          r={size * 0.19}
          fill={`url(#dialArc${uid})`}
          className={styles.bowl}
        />

        <line
          x1={centre}
          y1={centre}
          x2={centre}
          y2={centre - size * 0.34}
          stroke="var(--ink)"
          strokeWidth={2}
          strokeLinecap="round"
          className={reducedMotion ? styles.needleStatic : styles.needle}
          style={{ transform: `rotate(${angle}deg)` }}
        />
        <circle cx={centre} cy={centre} r={size * 0.035} fill="var(--ink)" />
      </svg>

      <span className={`${styles.word} clippedText`}>{word}</span>
      <span className="srOnly">{description}</span>
    </div>
  );
}

export default memo(DecisionDialView);
export { DecisionDialView };