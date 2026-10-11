import type { Action, BlockEvent, Decision } from "./types";
import type { OperatorCycleView } from "./operator-feed";

/**
 * Pure geometry and state for the Jev command center: the orbital scene that puts Jev at the
 * middle of the inputs it reads (price feed, Monad blocks) and the outputs it drives (Kuru book,
 * wallet, OKX operator). Everything here is deterministic so the server and client markup match
 * and the effectful component only writes transforms.
 */

export type SceneTone = "neutral" | "buy" | "sell" | "hold" | "late" | "unknown";

export type SatelliteId = "feed" | "monad" | "kuru" | "wallet" | "operator";

export interface Satellite {
  id: SatelliteId;
  label: string;
  role: "input" | "output" | "operator";
  /** Resting angle on the orbit, degrees, 0 at the right and growing clockwise on screen. */
  angleDeg: number;
}

/** Inputs sit on the left half of the orbit, outputs on the right, the operator on top. */
export const SATELLITES: readonly Satellite[] = [
  { id: "feed", label: "Feed de preco", role: "input", angleDeg: 160 },
  { id: "monad", label: "Bloco Monad", role: "input", angleDeg: 215 },
  { id: "operator", label: "Operador OKX", role: "operator", angleDeg: 270 },
  { id: "kuru", label: "Livro Kuru", role: "output", angleDeg: 330 },
  { id: "wallet", label: "Carteira", role: "output", angleDeg: 30 },
];

export interface OrbitPoint {
  x: number;
  y: number;
  /** 0 at the far side of the orbit, 1 at the near side. */
  depth: number;
}

export interface OrbitFrame {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
}

/**
 * Projects an angle on a tilted circular orbit to screen space. The orbit is an ellipse whose
 * vertical radius is the tilt; depth follows the sine so the near side (bottom) reads closest.
 */
export function projectOrbit(angleDeg: number, frame: OrbitFrame): OrbitPoint {
  const rad = (angleDeg * Math.PI) / 180;
  const sin = Math.sin(rad);
  return {
    x: frame.cx + frame.rx * Math.cos(rad),
    y: frame.cy + frame.ry * sin,
    depth: (sin + 1) / 2,
  };
}

/** Scale and opacity for a satellite at a given depth: far side small and faint, near side full. */
export function depthPresence(depth: number): { scale: number; opacity: number } {
  const d = Math.min(1, Math.max(0, depth));
  return {
    scale: 0.82 + d * 0.26,
    opacity: 0.58 + d * 0.42,
  };
}

/** Orbit phase in degrees for a given elapsed time: one slow lap per period, ambient only. */
export function orbitPhase(elapsedMs: number, periodMs = 96_000): number {
  if (!Number.isFinite(elapsedMs) || elapsedMs <= 0 || periodMs <= 0) return 0;
  return ((elapsedMs / periodMs) * 360) % 360;
}

export function sceneTone(latest: BlockEvent | null): SceneTone {
  if (!latest) return "unknown";
  const decision = latest.decision;
  if (!decision) return "neutral";
  if (decision.late) return "late";
  return decision.action;
}

export function confidenceOf(decision: Decision | null): number | null {
  if (!decision || decision.late) return null;
  const p = decision.probabilities;
  const max = Math.max(p.buy, p.sell, p.hold);
  return Number.isFinite(max) && max >= 0 && max <= 1 ? max : null;
}

export interface Signal {
  id: string;
  from: SatelliteId | "core";
  to: SatelliteId | "core";
  tone: SceneTone;
}

/**
 * The signals a new block sets in motion, in order. The feed always reaches the core; a quote
 * leaves the core for the Kuru book in the decision's colour; a fill flows from the book to the
 * wallet. Same block or no block means nothing moves.
 */
export function signalsFor(previousBlock: number | null, latest: BlockEvent | null): Signal[] {
  if (!latest) return [];
  if (previousBlock !== null && latest.block <= previousBlock) return [];
  const signals: Signal[] = [
    { id: `${latest.block}:feed`, from: "feed", to: "core", tone: "neutral" },
    { id: `${latest.block}:monad`, from: "monad", to: "core", tone: "neutral" },
  ];
  const decision = latest.decision;
  if (decision && !decision.late && latest.quote) {
    signals.push({ id: `${latest.block}:quote`, from: "core", to: "kuru", tone: decision.action });
  } else if (decision?.late) {
    signals.push({ id: `${latest.block}:late`, from: "core", to: "core", tone: "late" });
  }
  if (latest.fill) {
    signals.push({ id: `${latest.block}:fill`, from: "kuru", to: "wallet", tone: latest.fill.side });
  }
  return signals;
}

export interface ConveyorTile {
  block: number;
  tone: SceneTone;
  quoted: boolean;
  filled: boolean;
}

/** The last `count` blocks as belt tiles, oldest first, so the newest sits at the near end. */
export function conveyorTiles(events: readonly BlockEvent[], count: number): ConveyorTile[] {
  if (count <= 0) return [];
  return events.slice(-count).map((event) => ({
    block: event.block,
    tone: sceneTone(event),
    quoted: event.quote !== null,
    filled: event.fill !== null,
  }));
}

export interface HaloArc {
  key: Action;
  /** Fraction of the ring, 0 to 1. */
  length: number;
  /** Fraction of the ring where the arc starts. */
  offset: number;
}

/** Three arcs around the core, buy then sell then hold, summing to at most one lap. */
export function haloArcs(probabilities: Decision["probabilities"] | null): HaloArc[] {
  const keys: Action[] = ["buy", "sell", "hold"];
  if (!probabilities) return keys.map((key) => ({ key, length: 0, offset: 0 }));
  let offset = 0;
  return keys.map((key) => {
    const raw = probabilities[key];
    const length = Number.isFinite(raw) && raw > 0 ? Math.min(1, raw) : 0;
    const arc = { key, length, offset: Math.min(1, offset) };
    offset += length;
    return arc;
  });
}

export const ACTION_WORD: Record<Action, string> = {
  buy: "Compra",
  sell: "Venda",
  hold: "Manter",
};

export function actionWord(latest: BlockEvent | null): string {
  const decision = latest?.decision ?? null;
  if (!decision) return "Aguardando decisao";
  if (decision.late) return "Resposta tardia";
  return ACTION_WORD[decision.action];
}

const KIND_SHORT: Record<string, string> = {
  dex_round_trip: "Ida e volta DEX",
  cross_chain_rebalance: "Bridge entre redes",
  kuru_spot_maker: "Maker Kuru",
  defi_yield: "Rendimento DeFi",
  perp_funding_carry: "Funding carry",
  memepump_research: "Meme Pump",
};

/** One line for the operator satellite: what Jev chose on the last OKX cycle, or why nothing ran. */
export function operatorLine(cycle: OperatorCycleView | null): string {
  if (!cycle) return "Sem ciclo";
  const decision = cycle.decision;
  if (!decision) return "Sem elegiveis";
  if (decision.choice === "hold") return "Manter";
  const chosen = cycle.candidates.find((candidate) => candidate.id === decision.choice);
  return chosen ? (KIND_SHORT[chosen.kind] ?? chosen.kind) : decision.choice;
}

export function positionLine(latest: BlockEvent | null): string {
  const position = latest?.position;
  if (!position) return "Sem posicao";
  if (position.side === "flat") return "Zerada";
  const side = position.side === "long" ? "Comprada" : "Vendida";
  return `${side} ${position.size} MON`;
}
