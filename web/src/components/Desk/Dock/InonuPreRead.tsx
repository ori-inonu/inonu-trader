"use client";

import { useEffect, useMemo, useState } from "react";
import type { MarketRead } from "@/lib/desk/market-read";
import { thermometer } from "@/lib/desk/thermometer";
import { useSteadyFlow } from "@/lib/desk/useSteadyFlow";
import { preReadLines, type PreReadLine } from "@/lib/inonu/pre-read";
import { useInonuLayer } from "@/lib/inonu/useInonuLayer";
import styles from "./InonuPreRead.module.css";

/**
 * What the code already read for free, above the button that asks the Inonu (the Inonu tab of the simple desk): whether the moment lines up for a question, what the market costs to move
 * through and what the Inonu said last time. The person sees the ground the model will be asked about and decides whether a consult is worth its cost. It reads what the page already
 * holds and calls nothing: the model is asked only by the button below.
 */

export function InonuPreReadView({ lines }: { readonly lines: readonly PreReadLine[] }) {
  return (
    <section className={styles.root} aria-label="O que o codigo ja leu">
      <h3 className={styles.title}>O que ja foi lido, sem consultar o modelo</h3>
      <ul className={styles.list}>
        {lines.map((line) => (
          <li key={line.kind} data-kind={line.kind} data-tone={line.tone}>
            {line.text}
          </li>
        ))}
      </ul>
      <p className={styles.note}>O Inonu so e consultado quando voce pedir. O custo da consulta aparece depois da resposta.</p>
    </section>
  );
}

export interface InonuPreReadProps {
  readonly instId: string;
  readonly price: number | null;
  /** The raw reading of who is in charge (-1 all sellers, 1 all buyers) and how many trades the minute holds; the steady hand of the page turns them into the reading shown. */
  readonly imbalance: number | null;
  readonly trades: number | null;
  /** What the book says about the cost of moving money through it, when it could be read. */
  readonly market: MarketRead | null;
}

export default function InonuPreRead({ instId, price, imbalance, trades, market }: InonuPreReadProps) {
  // the same engine reading, the same saved answers and the same steady hand as the chart and the thermometer (one poll for the page); nothing here asks the model
  const { layer } = useInonuLayer(instId, true, true);
  const stable = useSteadyFlow(instId, () => imbalance);
  const [nowMs, setNowMs] = useState(0);
  useEffect(() => {
    setNowMs(Date.now());
    const timer = setInterval(() => setNowMs(Date.now()), 15_000);
    return () => clearInterval(timer);
  }, []);
  const overlay = layer?.overlay ?? null;
  const decision = layer?.decision ?? null;
  const lines = useMemo(() => {
    const model = thermometer({
      imbalance,
      trades,
      stable,
      price,
      zones: overlay?.zonas ?? [],
      market: market !== null && market.state === "ok" ? { thickness: market.thickness, text: market.thicknessText } : null,
      answer: decision === null ? null : { action: decision.action, atMs: decision.atMs, ...(decision.veredito === undefined ? {} : { veredito: decision.veredito }) },
      nowMs: nowMs === 0 ? Date.now() : nowMs,
    });
    return preReadLines({
      scenario: { headline: model.scenario.headline, worthAsking: model.scenario.worthAsking },
      market,
      answer: model.answer === null ? null : { word: model.answer.word, age: model.answer.age, fresh: model.answer.fresh },
    });
  }, [imbalance, trades, stable, price, overlay, decision, nowMs, market]);
  return <InonuPreReadView lines={lines} />;
}
