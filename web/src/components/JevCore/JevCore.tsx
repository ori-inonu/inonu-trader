"use client";

import type { RefObject } from "react";
import { useEffect, useRef, useState } from "react";
import type { Action, BlockEvent, ConnectionState } from "@/lib/types";
import { fmtInt } from "@/lib/format";
import { orderStateFor } from "@/lib/order-state";
import { feedFrameState } from "@/lib/feed-frame";
import { createRafLoop } from "@/lib/useRafLoop";
import { playSwap } from "@/lib/motion";
import DecisionDial from "@/components/DecisionDial/DecisionDial";
import Disclosure from "@/components/Disclosure/Disclosure";
import styles from "./JevCore.module.css";

const UNAVAILABLE = "Indisponivel";
const TILT_LIMIT = 9;

export interface JevCoreProps {
  latest: BlockEvent | null;
  connection: ConnectionState;
  model: string | null;
  reducedMotion?: boolean;
}

export interface JevCoreViewProps {
  latest: BlockEvent | null;
  connection: ConnectionState;
  model: string | null;
  reducedMotion: boolean;
  still: boolean;
  actionKey: string;
  tone: string;
  orbRef: RefObject<HTMLDivElement | null>;
}

function validProbability(value: number | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1 ? value : null;
}

/**
 * Pure half. Takes primitives for everything animated so the effectful wrapper drives motion,
 * never render. Reserve sizes on every container so a null latest shifts nothing.
 */
export function JevCoreView({ latest, connection, model, reducedMotion, still, actionKey, tone, orbRef }: JevCoreViewProps) {
  const decision = latest?.decision ?? null;
  const probabilities = decision?.probabilities ?? null;
  const order = orderStateFor(latest);
  const frame = feedFrameState(connection);
  const stale = frame.held;

  const confidence = decision && !decision.late && probabilities
    ? validProbability(Math.max(probabilities.buy, probabilities.sell, probabilities.hold))
    : null;
  const latency = decision && !decision.late && Number.isFinite(decision.latencyMs)
    ? `${Math.round(decision.latencyMs)} ms`
    : UNAVAILABLE;

  const shaken = latest?.quote?.status === "reverted" || latest?.quote?.status === "lost";

  return (
    <section
      className={`${styles.core} ${styles[tone]} ${stale ? styles.stale : ""}`}
      aria-labelledby="core-title"
      data-block={latest ? String(latest.block) : "none"}
      data-still={still ? "true" : "false"}
    >
      <p className={styles.eyebrow}>LEITURA DO AGENTE</p>
      <h2 className={styles.title} id="core-title">Nucleo Jev</h2>

      <div className={styles.orbWrap}>
        <div className={styles.perspective}>
          <div className={`${styles.orb} ${reducedMotion ? styles.orbStill : ""}`} ref={orbRef}>
            {/* Re-keyed on the block so jev-core-turn replays once per new block. */}
            <span className={styles.ring} aria-hidden="true" key={latest ? `ring-${latest.block}` : "ring-none"} />
            <span className={styles.coreDisc} aria-hidden="true" />
          </div>
        </div>
        <DecisionDial
          probabilities={probabilities}
          action={(decision?.action ?? null) as Action | null}
          late={decision?.late === true}
          reducedMotion={reducedMotion}
        />
      </div>

      <div
        className={`${styles.actionWord} ${reducedMotion ? "" : styles.actionEnter} ${shaken && !reducedMotion ? styles.shake : ""}`}
        key={actionKey}
        data-action-word="true"
      >
        {decision ? (decision.late ? "Resposta tardia" : decision.action === "buy" ? "Compra" : decision.action === "sell" ? "Venda" : "Manter") : "Aguardando decisao"}
      </div>

      <dl className={styles.readouts}>
        <div className={styles.readout}>
          <dt>Confianca</dt>
          <dd>{confidence === null ? UNAVAILABLE : `${Math.round(confidence * 100)}%`}</dd>
        </div>
        <div className={styles.readout}>
          <dt>Latencia</dt>
          <dd>{latency}</dd>
        </div>
        <div className={styles.readout}>
          <dt>Bloco</dt>
          <dd>{latest ? fmtInt(latest.block) : UNAVAILABLE}</dd>
        </div>
        <div className={styles.readout}>
          <dt>Modelo</dt>
          <dd>{model ?? UNAVAILABLE}</dd>
        </div>
      </dl>

      <p className={`${styles.order} ${order ? styles[order.tone] : ""}`}>
        {order ? order.label : "Sem ordem ou execucao informada"}
      </p>

      {frame.notice ? <span className={styles.staleChip}>{frame.notice}</span> : null}

      <Disclosure summary="Como ler esta decisao">
        <p>
          O nucleo apresenta a acao, as probabilidades e o estado de ordem presentes no feed.
        </p>
        <p>
          Uma decisao nao comprova preenchimento; ordens pendentes, registradas, revertidas ou sem confirmacao mantem seus estados proprios.
        </p>
      </Disclosure>
    </section>
  );
}

/**
 * Effectful half. The pointer tilt is written straight to the element from a rAF loop driven by
 * pointer events, never computed in render, so the server and client markup stay identical.
 */
export default function JevCore({ latest, connection, model, reducedMotion = false }: JevCoreProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const orbRef = useRef<HTMLDivElement | null>(null);
  const target = useRef({ x: 0, y: 0 });
  const current = useRef({ x: 0, y: 0 });
  const [still, setStill] = useState(true);
  const actionKey = latest?.decision
    ? `${latest.block}:${latest.decision.action}:${latest.decision.late ? "late" : "on"}`
    : "waiting";

  useEffect(() => {
    const element = orbRef.current;
    if (!element || reducedMotion || typeof window === "undefined") return;

    const onMove = (event: PointerEvent) => {
      const rect = element.getBoundingClientRect();
      const dx = (event.clientX - rect.left) / rect.width - 0.5;
      const dy = (event.clientY - rect.top) / rect.height - 0.5;
      target.current = { x: dx * TILT_LIMIT * 2, y: -dy * TILT_LIMIT * 2 };
    };
    const onLeave = () => {
      target.current = { x: 0, y: 0 };
    };

    let last = 0;
    const loop = createRafLoop(
      (now) => {
        const step = Math.min(1, (now - last) / 180);
        last = now;
        const next = {
          x: current.current.x + (target.current.x - current.current.x) * step,
          y: current.current.y + (target.current.y - current.current.y) * step,
        };
        current.current = next;
        element.style.setProperty("--tilt-x", `${next.x.toFixed(2)}deg`);
        element.style.setProperty("--tilt-y", `${next.y.toFixed(2)}deg`);
      },
      () => document.visibilityState === "visible",
    );

    element.addEventListener("pointermove", onMove);
    element.addEventListener("pointerleave", onLeave);
    loop.start();

    return () => {
      element.removeEventListener("pointermove", onMove);
      element.removeEventListener("pointerleave", onLeave);
      loop.stop();
    };
  }, [reducedMotion]);

  useEffect(() => {
    const host = hostRef.current;
    const element = host?.querySelector<HTMLElement>('[data-action-word="true"]') ?? null;
    playSwap(element, reducedMotion);
  }, [actionKey, reducedMotion]);

  useEffect(() => {
    setStill(false);
  }, [latest?.block]);

  const tone = !latest
    ? "unknown"
    : latest.decision?.late
      ? "late"
      : latest.decision?.action === "buy"
        ? "buy"
        : latest.decision?.action === "sell"
          ? "sell"
          : "hold";

  return (
    <div ref={hostRef} className={styles.orbHost}>
      <JevCoreView
        latest={latest}
        connection={connection}
        model={model}
        reducedMotion={reducedMotion}
        still={still}
        actionKey={actionKey}
        tone={tone}
        orbRef={orbRef}
      />
    </div>
  );
}