"use client";

import type { Thermometer } from "@/lib/desk/thermometer";
import InstrumentHeader, { type InstrumentHeaderProps } from "../InstrumentHeader";
import styles from "./ChartLegend.module.css";

/**
 * The legend of the chart, the way a charting platform keeps it: the quote on the first line (price, 24h change, where the price sits in the 24h range) and, on the second, what the
 * code has READ for a person who does not trade for a living: who is in charge right now, how many of the conditions line up, and what the Inonu last said, with the one button that
 * asks it again. It replaces the old "Mercado em foco" card and reads the same model as the thermometer panel (one hook, one steady hand), so the two never disagree. Nothing here asks
 * the model: the button only calls `onAsk`, which opens the Inonu tab where the request is made and its cost is said.
 */

const signed = (n: number): string => (n > 0 ? `+${n}` : String(n));

/** Where the mark sits on the meter, 0 (all sellers) to 100 (all buyers). */
const markAt = (pct: number | null): number => (pct === null ? 50 : Math.max(0, Math.min(100, 50 + pct / 2)));

const OK_WORD = { true: "Sim", false: "Nao", null: "Sem leitura" } as const;

export function DecisionChips({ read, onAsk }: { readonly read: Thermometer; readonly onAsk: () => void }) {
  const { pressure, scenario, answer } = read;
  return (
    <div className={styles.chips} role="group" aria-label="Leitura do momento">
      <span className={styles.chip} data-kind="pressure" data-tone={pressure.tone} title="Quem manda agora, pelo fluxo de negocios do ultimo minuto">
        <span className={styles.meter} aria-hidden="true">
          <span className={styles.meterCenter} />
          {pressure.pct === null ? null : <span className={styles.meterMark} style={{ left: `${markAt(pressure.pct).toFixed(1)}%` }} />}
        </span>
        <span className={styles.text}>
          {pressure.word}
          {pressure.pct === null ? "" : ` ${signed(pressure.pct)}%`}
        </span>
      </span>

      {scenario.known < 2 ? null : (
        <span
          className={styles.chip}
          data-kind="scenario"
          data-worth={scenario.worthAsking ? "true" : undefined}
          title={scenario.conditions.map((c) => `${OK_WORD[c.ok === null ? "null" : c.ok ? "true" : "false"]}: ${c.text}`).join("\n")}
        >
          <span className={styles.pips} aria-hidden="true">
            {scenario.conditions.map((c) => (
              <span key={c.id} data-ok={c.ok === null ? "unknown" : String(c.ok)} />
            ))}
          </span>
          <span className={styles.text}>{`${scenario.aligned} de ${scenario.known} condicoes`}</span>
          <span className={styles.srOnly}>{scenario.headline}</span>
        </span>
      )}

      {answer === null ? null : (
        <span className={styles.chip} data-kind="answer" data-action={answer.action} data-fresh={answer.fresh ? "true" : undefined} title={answer.reasons.join("\n") || undefined}>
          <span className={styles.text}>{answer.fresh ? `Inonu: ${answer.word}, ${answer.age}` : `Inonu, resposta antiga: ${answer.word}, ${answer.age}`}</span>
        </span>
      )}

      <button type="button" className={styles.ask} data-worth={scenario.worthAsking ? "true" : undefined} onClick={onAsk}>
        {answer === null ? "Pedir ao Inonu" : "Perguntar de novo"}
      </button>
    </div>
  );
}

export interface ChartLegendProps {
  /** The quote of the instrument: the very slices the chart draws. */
  readonly header: InstrumentHeaderProps;
  /** The thermometer reading, or null where it does not apply (the complete desk, an on-chain token): the second line is then the two questions alone. */
  readonly read: Thermometer | null;
  /** Opens the Inonu tab to ask about this asset. */
  readonly onAsk: () => void;
  /** Opens the portfolio consultation. */
  readonly onPortfolio: () => void;
}

export function ChartLegend({ header, read, onAsk, onPortfolio }: ChartLegendProps) {
  return (
    <div className={styles.legend}>
      <InstrumentHeader {...header} variant="legend" />
      <div className={styles.under}>
        {read === null ? (
          <button type="button" className={styles.ask} onClick={onAsk}>
            Consultar ativo
          </button>
        ) : (
          <DecisionChips read={read} onAsk={onAsk} />
        )}
        <button type="button" className={styles.portfolio} onClick={onPortfolio}>
          Analisar carteira
        </button>
      </div>
    </div>
  );
}
