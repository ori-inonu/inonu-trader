"use client";

import { useEffect, useState } from "react";
import type { MarketRead } from "@/lib/desk/market-read";
import type { Thermometer as ThermometerModel } from "@/lib/desk/thermometer";
import type { DeskMetrics } from "@/lib/desk/types";
import { useThermometerModel } from "@/lib/desk/useThermometerModel";
import { createVereditoClient } from "@/lib/veredito/client";
import type { Placar } from "@/lib/veredito/parse";
import { PanelFrame } from "./PanelFrame";
import styles from "./Thermometer.module.css";

/**
 * The thermometer (INF, ASK): the one reading of the market for a person who is not a trader. Who is in charge right now (buyers or sellers), where the nearest
 * zone is, and what the Inonu answered, with the button that asks it again. It reads the same flow engine and the same saved answers as the chart (one poll
 * for the page) and calls nothing by itself: the model is asked only by the button, which opens the Inonu tab where the request is made and its cost is said.
 */

const signed = (n: number): string => (n > 0 ? `+${n}` : String(n));

/** How the hits of the Inonu are measured, in one sentence the account of the profit reads its break even against. */
export function measuredText(placar: Placar | null): string {
  if (placar === null) return "Acerto do Inonu: o Placar nao respondeu.";
  return placar.estado === "nao_medido" ? `Acerto do Inonu: ainda nao medido (${placar.medidas} de ${placar.minimo} respostas medidas).` : `Acerto do Inonu: ${placar.texto}`;
}

/** Where the mark sits on the bar, 0 (all sellers) to 100 (all buyers). */
const markAt = (pct: number | null): number => (pct === null ? 50 : Math.max(0, Math.min(100, 50 + pct / 2)));

export interface ThermometerViewProps {
  readonly instId: string;
  readonly model: ThermometerModel;
  /** How far the engine is from being ready, or null when it is ready (or unknown). */
  readonly warming: { readonly closed: number; readonly needed: number } | null;
  readonly stale?: boolean;
  readonly onAsk: () => void;
}

export function ThermometerView({ instId, model, warming, stale = false, onAsk }: ThermometerViewProps) {
  const { pressure, scenario, answer } = model;
  return (
    <PanelFrame title="Termometro" subtitle={instId} stale={stale} empty={pressure.tone === "none" && answer === null}>
      <div className={styles.root}>
        <div className={styles.block} data-tone={pressure.tone}>
          <p className={styles.label}>Quem manda agora</p>
          <div
            className={styles.bar}
            role="img"
            aria-label={pressure.pct === null ? "Quem manda no mercado: ainda lendo." : `Quem manda no mercado: ${pressure.word}, ${signed(pressure.pct)}%.`}
          >
            <span className={styles.end}>Vendedores</span>
            <span className={styles.track} aria-hidden="true">
              <span className={styles.center} />
              {pressure.pct === null ? null : <span className={styles.mark} style={{ left: `${markAt(pressure.pct).toFixed(1)}%` }} />}
            </span>
            <span className={styles.end}>Compradores</span>
          </div>
          <p className={styles.word}>
            {pressure.word}
            {pressure.pct === null ? "" : ` (${signed(pressure.pct)}%)`}
          </p>
          {warming !== null && pressure.tone === "none" ? <p className={styles.note}>{`Aquecendo: ${warming.closed} de ${warming.needed} minutos lidos.`}</p> : null}
        </div>

        <div className={styles.scenario} role="group" aria-label="Cenario" data-worth={scenario.worthAsking ? "true" : undefined}>
          <p className={styles.scenarioHead}>{scenario.headline}</p>
          {scenario.known < 2 ? null : (
            <ul className={styles.conditions}>
              {scenario.conditions.map((c) => (
                <li key={c.id} data-ok={c.ok === null ? "unknown" : String(c.ok)}>
                  <span className={styles.srOnly}>{c.ok === true ? "Sim: " : c.ok === false ? "Nao: " : "Sem leitura: "}</span>
                  {c.text}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className={styles.answer} data-action={answer?.action ?? "none"} data-fresh={answer?.fresh ? "true" : undefined}>
          {answer === null ? (
            <p className={styles.note}>O Inonu ainda nao respondeu para este ativo.</p>
          ) : (
            <p className={styles.said}>
              <span className={styles.saidWord}>{answer.word}</span>
              <span className={styles.age}>{answer.fresh ? `Inonu respondeu ${answer.age}` : `Resposta antiga do Inonu, ${answer.age}`}</span>
            </p>
          )}
          {answer === null || answer.reasons.length === 0 ? null : (
            <ul className={styles.reasons} aria-label="Por que">
              {answer.reasons.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
          )}
          {answer?.plan == null ? (
            answer !== null && answer.fresh ? <p className={styles.note}>Sem plano com alvo e stop agora: o Inonu so monta um quando ve uma entrada que paga depois dos custos.</p> : null
          ) : (
            <dl className={styles.plan} aria-label="Plano">
              {answer.plan.map((row) => (
                <div key={row.rotulo}>
                  <dt>{row.rotulo}</dt>
                  <dd>
                    {row.valor}
                    {row.dica === null ? null : <small>{row.dica}</small>}
                  </dd>
                </div>
              ))}
            </dl>
          )}
          {answer?.profit == null ? null : (
            <div className={styles.profit} role="group" aria-label="Conta do lucro">
              <p className={styles.profitTitle}>Conta do lucro, depois dos custos</p>
              {answer.profit.map((line) => (
                <p key={line} className={styles.profitLine}>
                  {line}
                </p>
              ))}
            </div>
          )}
          <button type="button" className={styles.ask} onClick={onAsk}>
            {answer === null ? "Pedir ao Inonu" : "Perguntar de novo"}
          </button>
        </div>
      </div>
    </PanelFrame>
  );
}

export default function ThermometerPanel({
  instId,
  metrics,
  price,
  stale = false,
  market = null,
  onAsk,
}: {
  readonly instId: string;
  readonly metrics: DeskMetrics;
  readonly price: number | null;
  readonly stale?: boolean;
  /** What the book says about the cost of moving money through it (the Mercado card's reading), when it could be read. */
  readonly market?: MarketRead | null;
  readonly onAsk: () => void;
}) {
  // the same engine reading and the same saved answers as the chart (and as its legend), on the simple layers; nothing here asks the model
  // the Placar, once a minute, so the break even of a plan is read against what is measured
  const [placar, setPlacar] = useState<Placar | null>(null);
  useEffect(() => {
    let alive = true;
    const client = createVereditoClient();
    const read = () => void client.placar().then((p) => alive && setPlacar(p));
    read();
    const timer = setInterval(() => {
      if (document.visibilityState !== "hidden") read();
    }, 60_000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, []);

  const { model, warming } = useThermometerModel({ instId, metrics, price, market, measured: measuredText(placar) });
  return <ThermometerView instId={instId} model={model} warming={warming} stale={stale} onAsk={onAsk} />;
}
