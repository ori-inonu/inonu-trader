/**
 * The parts of the screen that move with the clock and not with the data: the countdown to the next look, the clock, the candidate shown in the flower of facets, the numbers that count up when a scene is drawn. The
 * arithmetic is pure (`countdownAt`, `easeOut`, `formatCount`) so a test can pin it; the functions that touch the document only copy those results into the elements the scene marked.
 */
import { FACET_META } from "./draw/command";
import { arc, fx, plain, pt, STOPPED_COUNT, STOPPED_STATE } from "./draw/h";
import type { HudModel } from "./types";

/** The centre and the radius of the countdown ring in the core (draw/command.ts `core`). */
const CX = 350;
const CY = 380;
const RING = 170;

export interface Countdown {
  /** Milliseconds to the next look; null when the core did not say when it is. */
  readonly leftMs: number | null;
  /** How much of the interval has passed, 0.002 to 1. */
  readonly frac: number;
  readonly label: string;
  readonly state: string;
}

/** The moment of the next look: the core's own, moved forward by whole intervals when the screen outlived it. */
export function nextLook(model: HudModel, nowMs: number): number | null {
  const next = model.rhythm.nextAtMs;
  const interval = model.rhythm.intervalMin * 60_000;
  if (next === null || !(interval > 0)) return null;
  return next >= nowMs ? next : next + Math.ceil((nowMs - next) / interval) * interval;
}

export function countdownAt(model: HudModel, nowMs: number): Countdown {
  // a core that runs no cycles has no next look: counting to a stale time would say the agent is about to act
  if (!model.agent.cycling) return { leftMs: null, frac: 0.002, label: STOPPED_COUNT, state: STOPPED_STATE };
  const target = nextLook(model, nowMs);
  const interval = model.rhythm.intervalMin * 60_000;
  if (target === null) return { leftMs: null, frac: 0.002, label: "--:--", state: "SEM HORA DO PROXIMO OLHAR" };
  const left = target - nowMs;
  const s = Math.max(0, Math.round(left / 1000));
  return {
    leftMs: left,
    frac: Math.min(1, Math.max(0.002, 1 - left / interval)),
    label: `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`,
    state: left < 6000 ? "MONTANDO O BRIEF" : "AGUARDANDO O PROXIMO OLHAR",
  };
}

export const easeOut = (t: number): number => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);

/** The text of a number that is counting: the same notation as the final text, so the last frame is the written value. */
export const formatCount = (value: number, decimals: number, prefix: string, suffix: string): string =>
  prefix + value.toLocaleString("pt-BR", { minimumFractionDigits: decimals, maximumFractionDigits: decimals }) + suffix;

const all = (svg: SVGSVGElement, selector: string): Element[] => Array.from(svg.querySelectorAll(selector));

/** Writes the countdown ring, the state line and the clock into the elements the scene marked. */
export function tickLive(svg: SVGSVGElement, model: HudModel, nowMs: number): void {
  const c = countdownAt(model, nowMs);
  const sweep = c.frac * 359.5;
  const [hx, hy] = pt(CX, CY, RING, sweep);
  for (const n of all(svg, ".countArc")) n.setAttribute("d", arc(CX, CY, RING, 0, sweep));
  for (const n of all(svg, ".countHead")) { n.setAttribute("cx", fx(hx)); n.setAttribute("cy", fx(hy)); }
  for (const n of all(svg, ".coreCount")) n.textContent = c.label;
  for (const n of all(svg, ".coreState")) n.textContent = c.state;
  const d = new Date(nowMs);
  for (const n of all(svg, ".clock")) n.textContent = d.toLocaleTimeString("pt-BR");
  for (const n of all(svg, ".date")) n.textContent = plain(d.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" })).toUpperCase();
}

/** Shows one candidate in the flower of facets and marks its blip on the radar. */
export function showCandidate(svg: SVGSVGElement, model: HudModel, index: number): void {
  const c = model.candidates[index];
  if (c === undefined) return;
  for (const n of all(svg, ".flowerName")) n.textContent = c.s;
  for (const n of all(svg, ".flowerSub")) n.textContent = c.pbuy === null ? (c.closed ? "FECHADO" : "SEM PREFERENCIA") : "P COMPRA " + Math.round(c.pbuy * 100) + "%";
  for (const [k] of FACET_META) {
    const v = c.facets[k];
    const has = typeof v === "number";
    for (const n of all(svg, `.hexfill[data-k="${k}"]`)) {
      n.setAttribute("opacity", has ? (0.12 + 0.85 * v).toFixed(2) : "0.05");
      n.setAttribute("fill", k === "accumulating" || k === "exit_easy" ? "#38ffb4" : "#ffb23e");
    }
    for (const n of all(svg, `[data-v="${k}"]`)) n.textContent = has ? String(Math.round(v * 100)) : "-";
  }
  for (const b of all(svg, ".blip")) {
    const on = Number(b.getAttribute("data-i")) === index;
    b.setAttribute("r", on ? "9" : "5.5");
    b.setAttribute("stroke-width", on ? "2.6" : "1.5");
  }
}

/** The candidates that have facets to show, in the order the radar lists them. */
export const withFacets = (model: HudModel): number[] => model.candidates.map((c, i) => [c, i] as const).filter(([c]) => Object.keys(c.facets).length > 0).map(([, i]) => i);

/** Counts every marked number from zero to its value over about a second. Returns a function that stops it. */
export function startCountUp(svg: SVGSVGElement, durationMs = 1100): () => void {
  const items = all(svg, "[data-count]").map((el) => ({ el, value: Number(el.getAttribute("data-count")), dec: Number(el.getAttribute("data-dec") ?? "0"), pre: el.getAttribute("data-pre") ?? "", suf: el.getAttribute("data-suf") ?? "" })).filter((x) => Number.isFinite(x.value));
  if (items.length === 0 || typeof requestAnimationFrame !== "function") return () => {};
  const t0 = performance.now();
  let raf = 0;
  const step = (now: number): void => {
    const k = easeOut((now - t0) / durationMs);
    for (const x of items) x.el.textContent = formatCount(x.value * k, x.dec, x.pre, x.suf);
    if (now - t0 < durationMs) raf = requestAnimationFrame(step);
  };
  raf = requestAnimationFrame(step);
  return () => cancelAnimationFrame(raf);
}
