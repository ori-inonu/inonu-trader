"use client";

import { useEffect, useMemo, useRef } from "react";
import type { BlockEvent, ConnectionState, Meta } from "@/lib/types";
import type { OperatorCycleView } from "@/lib/operator-feed";
import {
  SATELLITES,
  actionWord,
  confidenceOf,
  conveyorTiles,
  depthPresence,
  haloArcs,
  operatorLine,
  positionLine,
  projectOrbit,
  sceneTone,
  signalsFor,
  type OrbitFrame,
  type Satellite,
  type SatelliteId,
  type Signal,
} from "@/lib/command-center";
import { feedFrameState } from "@/lib/feed-frame";
import { fmtInt, shortAddr } from "@/lib/format";
import { DUR, EASE } from "@/lib/motion";
import { orderStateFor } from "@/lib/order-state";
import { createRafLoop } from "@/lib/useRafLoop";
import styles from "./CommandCenter.module.css";

const UNAVAILABLE = "Indisponivel";

/** Logical scene frame. The SVG viewBox and the satellite layer share it. */
export const FRAME = { width: 1000, height: 520 } as const;
export const ORBIT: OrbitFrame = { cx: 500, cy: 250, rx: 352, ry: 142 };
const SWAY_DEG = 9;
const SWAY_PERIOD_MS = 22_000;
const TILT_LIMIT = 3.2;
const BELT_TILES = 26;

export interface CommandCenterProps {
  meta: Meta | null;
  latest: BlockEvent | null;
  events: readonly BlockEvent[];
  connection: ConnectionState;
  operatorCycle: OperatorCycleView | null;
  reducedMotion?: boolean;
}

interface SatelliteValue {
  value: string;
  tone: string;
}

function satelliteValues(latest: BlockEvent | null, operatorCycle: OperatorCycleView | null): Record<SatelliteId, SatelliteValue> {
  const order = orderStateFor(latest);
  const mid = latest && Number.isFinite(latest.mid) ? latest.mid.toFixed(6) : UNAVAILABLE;
  return {
    feed: { value: mid, tone: latest ? "neutral" : "unknown" },
    monad: { value: latest ? fmtInt(latest.block) : UNAVAILABLE, tone: latest ? "neutral" : "unknown" },
    operator: { value: operatorLine(operatorCycle), tone: operatorCycle?.decision ? "neutral" : "unknown" },
    kuru: { value: order ? order.label : "Sem ordem", tone: order ? order.tone : "unknown" },
    wallet: { value: positionLine(latest), tone: latest ? "neutral" : "unknown" },
  };
}

function restPoint(satellite: Satellite) {
  return projectOrbit(satellite.angleDeg, ORBIT);
}

function linkPath(x: number, y: number): string {
  // A gentle curve from the satellite into the core, bending toward the orbit plane.
  const mx = (x + ORBIT.cx) / 2;
  const my = (y + ORBIT.cy) / 2 + (y < ORBIT.cy ? -28 : 28);
  return `M${x.toFixed(1)} ${y.toFixed(1)} Q${mx.toFixed(1)} ${my.toFixed(1)} ${ORBIT.cx} ${ORBIT.cy}`;
}

function toneVar(tone: string): string {
  switch (tone) {
    case "buy":
    case "sell":
    case "hold":
    case "late":
      return `var(--${tone})`;
    default:
      return "var(--signal)";
  }
}

/**
 * The operations center. Jev sits in the middle of a tilted orbit; the inputs it reads hang on
 * the left, the outputs it drives on the right. Every new block sends a signal from the inputs
 * into the core and, when Jev quotes, from the core out to the Kuru book. Nothing that shows
 * state loops: the only continuous motion is the ambient sway of the orbit and the pointer tilt.
 */
export default function CommandCenter({ meta, latest, events, connection, operatorCycle, reducedMotion = false }: CommandCenterProps) {
  const sceneRef = useRef<HTMLDivElement | null>(null);
  const satelliteRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const linkRefs = useRef<Record<string, SVGPathElement | null>>({});
  const particleLayerRef = useRef<SVGGElement | null>(null);
  const nucleusRef = useRef<HTMLDivElement | null>(null);
  const wordRef = useRef<HTMLDivElement | null>(null);
  const positions = useRef<Record<string, { x: number; y: number }>>({});
  const previousBlock = useRef<number | null>(null);
  const tiltTarget = useRef({ x: 0, y: 0 });
  const tiltCurrent = useRef({ x: 0, y: 0 });

  const frame = feedFrameState(connection);
  const stale = frame.held;
  const tone = sceneTone(latest);
  const decision = latest?.decision ?? null;
  const confidence = confidenceOf(decision);
  const arcs = haloArcs(decision && !decision.late ? decision.probabilities : null);
  const values = satelliteValues(latest, operatorCycle);
  const tiles = useMemo(() => conveyorTiles(events, BELT_TILES), [events]);
  const word = actionWord(latest);
  const latency = decision && !decision.late && Number.isFinite(decision.latencyMs) ? `${Math.round(decision.latencyMs)} ms` : UNAVAILABLE;
  // Keyed on the decision, not the block: the word swaps when Jev changes its mind, not on every block.
  const actionKey = latest?.decision ? `${latest.decision.action}:${latest.decision.late ? "late" : "on"}` : "waiting";

  for (const satellite of SATELLITES) {
    if (!positions.current[satellite.id]) {
      const p = restPoint(satellite);
      positions.current[satellite.id] = { x: p.x, y: p.y };
    }
  }

  // Ambient sway and pointer tilt, written straight to the DOM from one rAF loop.
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene || reducedMotion || stale || typeof window === "undefined") return;

    const started = performance.now();
    let last = started;

    const onMove = (event: PointerEvent) => {
      const rect = scene.getBoundingClientRect();
      const dx = (event.clientX - rect.left) / rect.width - 0.5;
      const dy = (event.clientY - rect.top) / rect.height - 0.5;
      tiltTarget.current = { x: dx * TILT_LIMIT * 2, y: -dy * TILT_LIMIT * 2 };
    };
    const onLeave = () => {
      tiltTarget.current = { x: 0, y: 0 };
    };

    const loop = createRafLoop(
      (now) => {
        const elapsed = now - started;
        const step = Math.min(1, (now - last) / 220);
        last = now;

        SATELLITES.forEach((satellite, index) => {
          const sway = SWAY_DEG * Math.sin((elapsed / SWAY_PERIOD_MS) * Math.PI * 2 + index * 1.3);
          const point = projectOrbit(satellite.angleDeg + sway, ORBIT);
          const presence = depthPresence(point.depth);
          positions.current[satellite.id] = { x: point.x, y: point.y };
          const node = satelliteRefs.current[satellite.id];
          if (node) {
            node.style.setProperty("--sx", `${((point.x / FRAME.width) * 100).toFixed(3)}%`);
            node.style.setProperty("--sy", `${((point.y / FRAME.height) * 100).toFixed(3)}%`);
            node.style.setProperty("--sscale", presence.scale.toFixed(3));
            node.style.setProperty("--sopacity", presence.opacity.toFixed(3));
            node.style.zIndex = String(10 + Math.round(point.depth * 10));
          }
          const link = linkRefs.current[satellite.id];
          if (link) link.setAttribute("d", linkPath(point.x, point.y));
        });

        const next = {
          x: tiltCurrent.current.x + (tiltTarget.current.x - tiltCurrent.current.x) * step,
          y: tiltCurrent.current.y + (tiltTarget.current.y - tiltCurrent.current.y) * step,
        };
        tiltCurrent.current = next;
        scene.style.setProperty("--tilt-x", `${next.x.toFixed(2)}deg`);
        scene.style.setProperty("--tilt-y", `${next.y.toFixed(2)}deg`);
      },
      () => document.visibilityState === "visible",
    );

    scene.addEventListener("pointermove", onMove);
    scene.addEventListener("pointerleave", onLeave);
    loop.start();
    const onVisible = () => loop.start();
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      scene.removeEventListener("pointermove", onMove);
      scene.removeEventListener("pointerleave", onLeave);
      document.removeEventListener("visibilitychange", onVisible);
      loop.stop();
    };
  }, [reducedMotion, stale]);

  // One burst of signals per new block: inputs into the core, the quote out to the book.
  useEffect(() => {
    const signals = signalsFor(previousBlock.current, latest);
    previousBlock.current = latest?.block ?? previousBlock.current;
    if (signals.length === 0 || reducedMotion || stale) return;
    const layer = particleLayerRef.current;
    if (!layer || typeof document === "undefined") return;

    signals.forEach((signal, index) => launchSignal(layer, signal, positions.current, nucleusRef.current, index));
  }, [latest, reducedMotion, stale]);

  // The word never fades out fully: a feed that flips between late and waiting on consecutive
  // blocks would otherwise leave the core blank more often than not.
  useEffect(() => {
    const element = wordRef.current;
    if (!element || reducedMotion || stale || typeof element.animate !== "function") return;
    element.animate(
      [
        { opacity: 0.35, transform: "translateY(4px)" },
        { opacity: 1, transform: "translateY(0)" },
      ],
      { duration: DUR.base, easing: EASE.outExpo },
    );
  }, [actionKey, reducedMotion, stale]);

  const cadence = "Um bloco a cada 300 ms";

  return (
    <section
      className={`${styles.center} ${styles[tone]} ${stale ? styles.stale : ""} ${reducedMotion ? styles.still : ""}`}
      aria-labelledby="command-center-title"
      data-block={latest ? String(latest.block) : "none"}
    >
      <header className={styles.head}>
        <div className={styles.headCopy}>
          <p className={styles.eyebrow}>Central de decisoes e operacoes</p>
          <h2 className={styles.title} id="command-center-title">Jev no comando</h2>
          <p className={styles.lede}>
            Le o feed de preco, decide entre compra e venda e coloca a ordem no livro on-chain da Kuru em cada bloco da Monad.
          </p>
        </div>
        <dl className={styles.headChips}>
          <div className={styles.chip}>
            <dt>Modelo</dt>
            <dd>{meta?.model ?? UNAVAILABLE}</dd>
          </div>
          <div className={styles.chip}>
            <dt>Cadencia</dt>
            <dd>{cadence}</dd>
          </div>
          <div className={styles.chip}>
            <dt>Mercado</dt>
            <dd title={meta?.market ?? undefined}>{meta?.market ? shortAddr(meta.market) : UNAVAILABLE}</dd>
          </div>
        </dl>
      </header>

      <div className={styles.scene} ref={sceneRef}>
        <div className={styles.floor} aria-hidden="true">
          <div className={styles.floorGrid} />
        </div>

        <svg
          className={styles.orbits}
          viewBox={`0 0 ${FRAME.width} ${FRAME.height}`}
          preserveAspectRatio="xMidYMid meet"
          aria-hidden="true"
          focusable="false"
        >
          <defs>
            <radialGradient id="cc-core-glow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="var(--signal)" stopOpacity="0.22" />
              <stop offset="60%" stopColor="var(--signal)" stopOpacity="0.05" />
              <stop offset="100%" stopColor="var(--signal)" stopOpacity="0" />
            </radialGradient>
          </defs>
          <ellipse className={styles.ringFar} cx={ORBIT.cx} cy={ORBIT.cy} rx={ORBIT.rx + 60} ry={ORBIT.ry + 24} />
          <ellipse className={styles.ring} cx={ORBIT.cx} cy={ORBIT.cy} rx={ORBIT.rx} ry={ORBIT.ry} />
          <ellipse className={styles.ringNear} cx={ORBIT.cx} cy={ORBIT.cy} rx={ORBIT.rx - 110} ry={ORBIT.ry - 44} />
          <circle cx={ORBIT.cx} cy={ORBIT.cy} r={230} fill="url(#cc-core-glow)" />
          <g className={styles.links}>
            {SATELLITES.map((satellite) => {
              const p = positions.current[satellite.id];
              return (
                <path
                  key={satellite.id}
                  ref={(node) => {
                    linkRefs.current[satellite.id] = node;
                  }}
                  className={`${styles.link} ${styles[`link_${satellite.role}`]}`}
                  d={linkPath(p.x, p.y)}
                />
              );
            })}
          </g>
          <g ref={particleLayerRef} className={styles.particles} />
        </svg>

        <div className={styles.satellites}>
          {SATELLITES.map((satellite) => {
            const p = positions.current[satellite.id];
            const rest = depthPresence(projectOrbit(satellite.angleDeg, ORBIT).depth);
            const value = values[satellite.id];
            return (
              <div
                key={satellite.id}
                ref={(node) => {
                  satelliteRefs.current[satellite.id] = node;
                }}
                className={`${styles.satellite} ${styles[`sat_${satellite.role}`]} ${styles[`satTone_${value.tone}`] ?? ""}`}
                style={{
                  ["--sx" as string]: `${((p.x / FRAME.width) * 100).toFixed(3)}%`,
                  ["--sy" as string]: `${((p.y / FRAME.height) * 100).toFixed(3)}%`,
                  ["--sscale" as string]: rest.scale.toFixed(3),
                  ["--sopacity" as string]: rest.opacity.toFixed(3),
                }}
                data-satellite={satellite.id}
              >
                <span className={styles.satRole}>{satellite.role === "input" ? "Entrada" : satellite.role === "output" ? "Saida" : "Operador"}</span>
                <span className={styles.satLabel}>{satellite.label}</span>
                <span className={styles.satValue}>{value.value}</span>
              </div>
            );
          })}
        </div>

        <div className={styles.nucleusWrap}>
          <div className={styles.nucleus} ref={nucleusRef} data-action-word-host="true">
            <span className={`${styles.layer} ${styles.layerShadow}`} aria-hidden="true" />
            <span className={`${styles.layer} ${styles.layerBody}`} aria-hidden="true" />
            <svg className={styles.halo} viewBox="0 0 100 100" aria-hidden="true" focusable="false">
              <circle className={styles.haloTrack} cx="50" cy="50" r="46" pathLength={1} />
              {arcs.map((arc) => (
                <circle
                  key={arc.key}
                  className={`${styles.haloArc} ${styles[`halo_${arc.key}`]}`}
                  cx="50"
                  cy="50"
                  r="46"
                  pathLength={1}
                  style={{ strokeDasharray: `${Math.max(0, arc.length - 0.012)} 1`, strokeDashoffset: -arc.offset }}
                />
              ))}
            </svg>
            <span className={`${styles.layer} ${styles.layerInner}`} aria-hidden="true" />
            <span className={styles.equator} aria-hidden="true" />
            <div className={styles.face}>
              <span className={styles.faceName}>Jev</span>
              <span className={styles.faceVendor}>TypeSafe AI</span>
              <div className={`${styles.word} ${word.length > 8 ? styles.wordLong : ""}`} ref={wordRef} data-action-word="true">
                {word}
              </div>
              <span className={styles.faceConfidence}>
                {confidence === null ? "Confianca indisponivel" : `Confianca ${Math.round(confidence * 100)}%`}
              </span>
            </div>
          </div>
        </div>

        <dl className={styles.readouts}>
          <div className={`${styles.readout} ${styles.readoutTl}`}>
            <dt>Bloco</dt>
            <dd>{latest ? fmtInt(latest.block) : UNAVAILABLE}</dd>
          </div>
          <div className={`${styles.readout} ${styles.readoutTr}`}>
            <dt>Latencia da decisao</dt>
            <dd>{latency}</dd>
          </div>
          <div className={`${styles.readout} ${styles.readoutBl}`}>
            <dt>Compra</dt>
            <dd>{decision && !decision.late ? `${Math.round(decision.probabilities.buy * 100)}%` : UNAVAILABLE}</dd>
          </div>
          <div className={`${styles.readout} ${styles.readoutBr}`}>
            <dt>Venda</dt>
            <dd>{decision && !decision.late ? `${Math.round(decision.probabilities.sell * 100)}%` : UNAVAILABLE}</dd>
          </div>
        </dl>

        {frame.notice ? <span className={styles.notice}>{frame.notice}</span> : null}
      </div>

      <div className={styles.belt} aria-label="Blocos recentes" role="list">
        <div className={styles.beltPlane}>
          {tiles.length === 0 ? (
            <span className={styles.beltEmpty}>Aguardando blocos</span>
          ) : (
            tiles.map((tile, index) => (
              <span
                key={tile.block}
                role="listitem"
                className={`${styles.tile} ${styles[`tile_${tile.tone}`]} ${tile.quoted ? styles.tileQuoted : ""} ${tile.filled ? styles.tileFilled : ""} ${index === tiles.length - 1 ? styles.tileNew : ""}`}
                title={`Bloco ${fmtInt(tile.block)}`}
              >
                <span className={styles.tileBar} aria-hidden="true" />
                <span className={styles.tileNumber}>{String(tile.block % 1000).padStart(3, "0")}</span>
              </span>
            ))
          )}
        </div>
      </div>
    </section>
  );
}

const SVG_NS = "http://www.w3.org/2000/svg";

function launchSignal(
  layer: SVGGElement,
  signal: Signal,
  positions: Record<string, { x: number; y: number }>,
  nucleus: HTMLDivElement | null,
  index: number,
): void {
  const from = signal.from === "core" ? { x: ORBIT.cx, y: ORBIT.cy } : positions[signal.from];
  const to = signal.to === "core" ? { x: ORBIT.cx, y: ORBIT.cy } : positions[signal.to];
  if (!from || !to) return;
  const color = toneVar(signal.tone);
  const delay = index * 70;

  if (signal.from === "core" && signal.to === "core") {
    // A late answer never leaves the core: the core itself flinches once.
    if (nucleus && typeof nucleus.animate === "function") {
      nucleus.animate(
        [
          { transform: "translateZ(0) scale(1)" },
          { transform: "translateZ(0) scale(0.97)", offset: 0.4 },
          { transform: "translateZ(0) scale(1)" },
        ],
        { duration: DUR.slow, easing: EASE.outBack, delay },
      );
    }
    return;
  }

  const particle = document.createElementNS(SVG_NS, "circle");
  particle.setAttribute("r", signal.from === "core" ? "7" : "5");
  particle.setAttribute("fill", color);
  particle.style.transform = `translate(${from.x}px, ${from.y}px)`;
  layer.appendChild(particle);

  const trail = document.createElementNS(SVG_NS, "line");
  trail.setAttribute("x1", String(from.x));
  trail.setAttribute("y1", String(from.y));
  trail.setAttribute("x2", String(to.x));
  trail.setAttribute("y2", String(to.y));
  trail.setAttribute("stroke", color);
  trail.setAttribute("stroke-width", "1.5");
  trail.setAttribute("stroke-linecap", "round");
  trail.setAttribute("pathLength", "1");
  trail.style.strokeDasharray = "1 1";
  layer.appendChild(trail);

  if (typeof particle.animate !== "function") {
    particle.remove();
    trail.remove();
    return;
  }

  const bendY = (from.y + to.y) / 2 + (from.y < ORBIT.cy && to.y < ORBIT.cy ? -24 : 20);
  const flight = particle.animate(
    [
      { transform: `translate(${from.x}px, ${from.y}px)`, opacity: 0 },
      { transform: `translate(${(from.x + to.x) / 2}px, ${bendY}px)`, opacity: 1, offset: 0.45 },
      { transform: `translate(${to.x}px, ${to.y}px)`, opacity: 0.9 },
    ],
    { duration: DUR.cinematic, easing: EASE.outExpo, delay, fill: "forwards" },
  );
  trail.animate(
    [
      { strokeDashoffset: 1, opacity: 0.9 },
      { strokeDashoffset: 0, opacity: 0.55, offset: 0.6 },
      { strokeDashoffset: 0, opacity: 0 },
    ],
    { duration: DUR.cinematic + 260, easing: EASE.outExpo, delay, fill: "forwards" },
  );

  flight.onfinish = () => {
    particle.animate([{ opacity: 0.9 }, { opacity: 0 }], { duration: DUR.fast, fill: "forwards" }).onfinish = () => particle.remove();
    window.setTimeout(() => trail.remove(), 320);
    if (signal.to === "core" && nucleus && typeof nucleus.animate === "function") {
      nucleus.animate(
        [
          { transform: "translateZ(0) scale(1)" },
          { transform: "translateZ(0) scale(1.025)", offset: 0.35 },
          { transform: "translateZ(0) scale(1)" },
        ],
        { duration: DUR.base, easing: EASE.outBack },
      );
    }
  };
}
