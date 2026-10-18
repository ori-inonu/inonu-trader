/**
 * The model behind the decision center and the result meters: the arithmetic that turns the status into the numbers a screen draws (the curve of the wallet's value, the funnel of the last decision, how sure the
 * model was, what its narrow judgments said, how its decisions measured). Pure: no clock, no DOM, nothing animated; whatever moves on screen moves by a transition of the style, from one of these values to the next.
 */
import type { CandidateView, LedgerRecord, OrderOutcome, WindowId, WindowSummary } from "./types";
import { FAMILY_TEXT } from "./view";

/* ---------------------------------------------------------------- the curve of the wallet's value */

export interface ChartBox {
  readonly width: number;
  readonly height: number;
  readonly padX: number;
  readonly padTop: number;
  readonly padBottom: number;
}

export interface ChartPoint {
  readonly x: number;
  readonly y: number;
  readonly t: number;
  readonly v: number;
}

export interface ChartMarker {
  readonly x: number;
  readonly y: number;
  readonly atMs: number;
  readonly side: "buy" | "sell";
  readonly symbol: string;
  readonly usd: number;
}

export interface ChartModel {
  readonly box: ChartBox;
  readonly points: readonly ChartPoint[];
  /** The line as an SVG path. */
  readonly line: string;
  /** The same line closed at the bottom, to be filled. */
  readonly area: string;
  readonly markers: readonly ChartMarker[];
  readonly ticks: readonly { readonly y: number; readonly value: number }[];
  readonly first: number;
  readonly last: number;
  readonly deltaUsd: number;
  readonly deltaPct: number | null;
  readonly startMs: number;
  readonly endMs: number;
}

export const DEFAULT_BOX: ChartBox = { width: 640, height: 240, padX: 12, padTop: 16, padBottom: 16 };

const fix = (n: number): string => (Math.round(n * 100) / 100).toString();

/** The curve of the value of the agent wallet in a box, with the orders that were executed as markers on it. Null when there are fewer than two points to draw. */
export function equityChart(series: readonly { readonly t: number; readonly v: number }[], orders: readonly LedgerRecord[], box: ChartBox = DEFAULT_BOX): ChartModel | null {
  if (series.length < 2) return null;
  const t0 = series[0]!.t;
  const t1 = series[series.length - 1]!.t;
  if (!(t1 > t0)) return null;
  const values = series.map((p) => p.v);
  let lo = Math.min(...values);
  let hi = Math.max(...values);
  if (hi - lo < 1e-9) {
    lo -= 1;
    hi += 1;
  } else {
    const margin = (hi - lo) * 0.08;
    lo -= margin;
    hi += margin;
  }
  const innerW = box.width - 2 * box.padX;
  const innerH = box.height - box.padTop - box.padBottom;
  const x = (t: number): number => box.padX + ((t - t0) / (t1 - t0)) * innerW;
  const y = (v: number): number => box.padTop + (1 - (v - lo) / (hi - lo)) * innerH;
  const points: ChartPoint[] = series.map((p) => ({ x: x(p.t), y: y(p.v), t: p.t, v: p.v }));
  const line = points.map((p, i) => `${i === 0 ? "M" : "L"} ${fix(p.x)} ${fix(p.y)}`).join(" ");
  const bottom = box.height - box.padBottom;
  const area = `${line} L ${fix(points[points.length - 1]!.x)} ${fix(bottom)} L ${fix(points[0]!.x)} ${fix(bottom)} Z`;
  const markers: ChartMarker[] = [];
  for (const o of orders) {
    if (o.kind !== "order" || o.stage !== "executada" || (o.side !== "buy" && o.side !== "sell") || o.symbol === undefined || o.usd === undefined) continue;
    if (o.atMs < t0 || o.atMs > t1) continue;
    let i = points.findIndex((p) => p.t >= o.atMs);
    if (i <= 0) i = i === 0 ? 1 : points.length - 1;
    const a = points[i - 1]!;
    const b = points[i]!;
    const f = b.t === a.t ? 0 : (o.atMs - a.t) / (b.t - a.t);
    markers.push({ x: x(o.atMs), y: a.y + (b.y - a.y) * f, atMs: o.atMs, side: o.side, symbol: o.symbol, usd: o.usd });
  }
  const mid = (lo + hi) / 2;
  const ticks = [hi, mid, lo].map((value) => ({ y: y(value), value }));
  const first = series[0]!.v;
  const last = series[series.length - 1]!.v;
  return { box, points, line, area, markers, ticks, first, last, deltaUsd: Math.round((last - first) * 100) / 100, deltaPct: first > 0 ? (last / first - 1) * 100 : null, startMs: t0, endMs: t1 };
}

/* ---------------------------------------------------------------- the funnel of the last decision */

export const CLOSED_LABEL: Readonly<Record<string, string>> = {
  entrada_esticada: "Preco esticado",
  sem_historico: "Sem historico",
  sem_perfil: "Sem alvo e stop",
  estagnado: "Parado",
  sem_tamanho: "Sem caixa",
  abaixo_do_minimo: "Abaixo do minimo",
};

export interface FunnelStep {
  readonly key: "vistas" | "fechadas" | "abertas" | "escolhidas" | "executadas";
  readonly label: string;
  readonly count: number;
  /** Width of the bar against the first step, in percent: a step with something in it is never thinner than a sliver. */
  readonly widthPct: number;
}

export interface FunnelModel {
  readonly steps: readonly FunnelStep[];
  readonly reasons: readonly { readonly code: string; readonly label: string; readonly count: number }[];
}

export function funnelModel(view: readonly CandidateView[], orders: readonly OrderOutcome[]): FunnelModel {
  const seen = view.length;
  const closed = view.filter((v) => v.closed !== null);
  const open = view.filter((v) => v.closed === null);
  const chosen = open.filter((v) => v.stance !== null && v.stance !== "hold" && v.stance !== "skip");
  const executed = orders.filter((o) => o.stage === "executada");
  const width = (n: number): number => (n <= 0 || seen === 0 ? 0 : Math.max(4, Math.round((n / seen) * 100)));
  const steps: FunnelStep[] = [
    { key: "vistas", label: "Avaliadas", count: seen, widthPct: seen === 0 ? 0 : 100 },
    { key: "fechadas", label: "Fechadas pelo codigo", count: closed.length, widthPct: width(closed.length) },
    { key: "abertas", label: "Abertas ao Jev", count: open.length, widthPct: width(open.length) },
    { key: "escolhidas", label: "Escolhidas para agir", count: chosen.length, widthPct: width(chosen.length) },
    { key: "executadas", label: "Executadas", count: executed.length, widthPct: width(executed.length) },
  ];
  const counts = new Map<string, number>();
  for (const v of closed) counts.set(v.closed!, (counts.get(v.closed!) ?? 0) + 1);
  const reasons = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([code, count]) => ({ code, label: CLOSED_LABEL[code] ?? code.replace(/_/g, " "), count }));
  return { steps, reasons };
}

/* ---------------------------------------------------------------- how sure the model was */

const HOLDING_OPTIONS: readonly (readonly [string, string, "calm" | "sell" | "buy"])[] = [
  ["hold", "Manter", "calm"],
  ["trim_third", "Vender 1/3", "sell"],
  ["trim_half", "Vender metade", "sell"],
  ["exit_all", "Vender tudo", "sell"],
];
const BUY_OPTIONS: readonly (readonly [string, string, "calm" | "sell" | "buy"])[] = [
  ["skip", "Nao comprar", "calm"],
  ["buy_tenth", "Comprar 1/10", "buy"],
  ["buy_third", "Comprar 1/3", "buy"],
  ["buy_two_thirds", "Comprar 2/3", "buy"],
  ["buy_full", "Comprar tudo", "buy"],
];

export interface ProbBar {
  readonly key: string;
  readonly label: string;
  readonly pct: number;
  readonly chosen: boolean;
  readonly tone: "calm" | "sell" | "buy";
}

/** The model's probability for each option it was offered, as bars in the order of the ladder. Null when there is nothing to compare (no numbers, or one option only). */
export function probBars(kind: "holding" | "buy", probs: Readonly<Record<string, number>> | null | undefined, chosen: string | null): ProbBar[] | null {
  if (probs === null || probs === undefined) return null;
  const options = kind === "holding" ? HOLDING_OPTIONS : BUY_OPTIONS;
  const bars: ProbBar[] = [];
  for (const [key, label, tone] of options) {
    const p = probs[key];
    if (typeof p !== "number" || !Number.isFinite(p) || p < 0 || p > 1) continue;
    bars.push({ key, label, pct: Math.round(p * 100), chosen: key === chosen, tone });
  }
  return bars.length >= 2 ? bars : null;
}

/* ---------------------------------------------------------------- the narrow judgments */

type Polarity = "bad" | "good";
const BUY_FACETS: readonly (readonly [string, string, Polarity])[] = [
  ["late_entry", "Entrada esticada", "bad"],
  ["still_falling", "Ainda caindo", "bad"],
  ["accumulating", "Carteiras ainda comprando", "good"],
  ["exit_easy", "Saida facil", "good"],
  ["distribution", "Vendedores no topo", "bad"],
  ["fading", "Forca acabando", "bad"],
];
const HOLDING_FACETS: readonly (readonly [string, string, Polarity])[] = [
  ["distribution", "Vendedores no topo", "bad"],
  ["fading", "Forca acabando", "bad"],
  ["late_in_run", "Ja subiu demais", "bad"],
  ["risk_rising", "Risco subindo", "bad"],
];

export interface FacetMeter {
  readonly key: string;
  readonly label: string;
  readonly pct: number;
  /** warn: a bad thing that is high; calm: a bad thing that is low; good: a good thing that is high; dim: a good thing that is low; mid: in between. */
  readonly tone: "warn" | "calm" | "good" | "dim" | "mid";
}

export function facetMeters(kind: "holding" | "buy", facets: Readonly<Record<string, number>> | null | undefined): FacetMeter[] {
  if (facets === null || facets === undefined) return [];
  const out: FacetMeter[] = [];
  for (const [key, label, polarity] of kind === "holding" ? HOLDING_FACETS : BUY_FACETS) {
    const p = facets[key];
    if (typeof p !== "number" || !Number.isFinite(p) || p < 0 || p > 1) continue;
    const pct = Math.round(p * 100);
    const tone = pct >= 66 ? (polarity === "bad" ? "warn" : "good") : pct <= 33 ? (polarity === "bad" ? "calm" : "dim") : "mid";
    out.push({ key, label, pct, tone });
  }
  return out;
}

/* ---------------------------------------------------------------- the meters of the result */

export type HitTone = "warn" | "mid" | "good" | "dim";

/** Under four tenths a hit rate is a warning, six tenths or more is good, in between is neutral, and unknown is dim. */
export function toneOfHit(pct: number | null): HitTone {
  if (pct === null) return "dim";
  return pct < 40 ? "warn" : pct >= 60 ? "good" : "mid";
}

export interface HitRow {
  readonly id: WindowId;
  readonly label: string;
  readonly n: number;
  readonly settled: number;
  readonly hitPct: number | null;
  readonly netUsd: number | null;
  /** Some decisions of this window are still waiting for the price of its end. */
  readonly open: boolean;
  readonly tone: HitTone;
}

const WINDOW_LABEL: Readonly<Record<WindowId, string>> = { "15m": "15 minutos", "1h": "1 hora", "4h": "4 horas", "24h": "24 horas" };

export function hitRows(windows: Readonly<Record<WindowId, WindowSummary>>): HitRow[] {
  return (["15m", "1h", "4h", "24h"] as const).map((id) => {
    const w = windows[id];
    const hitPct = w.hitRate === null ? null : Math.round(w.hitRate * 100);
    return { id, label: WINDOW_LABEL[id], n: w.n, settled: w.settled, hitPct, netUsd: w.netUsd, open: w.pending > 0, tone: toneOfHit(hitPct) };
  });
}

export interface RecordRow {
  readonly key: string;
  readonly label: string;
  readonly n: number;
  readonly acertoPct: number | null;
  /** Enough measured decisions to read the rate (the same five the model itself needs). */
  readonly enough: boolean;
  readonly tone: HitTone;
}

const RECORD_MIN_N = 5;

/** The model's own measured record: selling and keeping first, then each family of evidence by how many decisions it has. */
export function recordRows(record: Readonly<Record<string, { readonly n: number; readonly acerto: number | null }>>): RecordRow[] {
  const row = (key: string, label: string): RecordRow | null => {
    const r = record[key];
    if (r === undefined) return null;
    const enough = r.acerto !== null && r.n >= RECORD_MIN_N;
    return { key, label, n: r.n, acertoPct: r.acerto, enough, tone: enough ? toneOfHit(r.acerto) : "dim" };
  };
  const head = [row("vender", "Quando vende"), row("manter", "Quando mantem")].filter((r): r is RecordRow => r !== null);
  const families = Object.keys(record)
    .filter((k) => k !== "vender" && k !== "manter")
    .sort((a, b) => record[b]!.n - record[a]!.n)
    .map((k) => row(k, FAMILY_TEXT[k] ?? k.replace(/_/g, " ")))
    .filter((r): r is RecordRow => r !== null);
  return [...head, ...families];
}

/* ---------------------------------------------------------------- the map of the decision */

export interface MapBox {
  readonly width: number;
  readonly height: number;
}

export interface MapNode {
  readonly id: string;
  readonly symbol: string;
  readonly kind: "holding" | "buy";
  /** What became of it: a sale, a keep, a purchase, a purchase the model passed over, or one the code closed. */
  readonly tone: "sell" | "hold" | "buy" | "open" | "closed";
  readonly x: number;
  readonly y: number;
  readonly r: number;
  /** What the model chose, as the card says it; null when it was not asked. */
  readonly stance: string | null;
  /** The probability the model gave the option that was taken, in percent, when it said. */
  readonly sure: number | null;
}

export interface MapLink {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  /** From 0.2 to 1: how sure the model was of its pick. */
  readonly strength: number;
}

export interface MapModel {
  readonly box: MapBox;
  readonly center: { readonly x: number; readonly y: number };
  readonly nodes: readonly MapNode[];
  readonly links: readonly MapLink[];
}

export const MAP_BOX: MapBox = { width: 640, height: 300 };

const RINGS = { holding: 56, open: 92, closed: 124 } as const;
const RING_TURN = { holding: 0.4, open: 1.1, closed: 0 } as const;
const RING_STRETCH = 2.1;

/**
 * The candidates of the last cycle around the Jev: what is held on the inner ring, what the model could really weigh on the middle one, what the code closed on the outer one. Nodes are spread evenly on their ring in
 * the order of their ids, so the same set always lands in the same places; a line joins the Jev to what the model weighed, as strong as it was sure of its pick. Pure geometry.
 */
export function constellation(view: readonly CandidateView[], box: MapBox = MAP_BOX): MapModel {
  const center = { x: box.width / 2, y: box.height / 2 };
  const rings: Record<"holding" | "open" | "closed", CandidateView[]> = { holding: [], open: [], closed: [] };
  for (const v of view) rings[v.kind === "holding" ? "holding" : v.closed !== null ? "closed" : "open"].push(v);
  const nodes: MapNode[] = [];
  const links: MapLink[] = [];
  for (const ring of ["holding", "open", "closed"] as const) {
    const members = [...rings[ring]].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    members.forEach((v, i) => {
      const angle = RING_TURN[ring] + (i * 2 * Math.PI) / members.length;
      const x = center.x + RINGS[ring] * RING_STRETCH * Math.cos(angle);
      const y = center.y + RINGS[ring] * Math.sin(angle);
      const stance = v.stance;
      const tone: MapNode["tone"] =
        v.kind === "holding" ? (stance === null || stance === "hold" ? "hold" : "sell") : v.closed !== null ? "closed" : stance !== null && stance.startsWith("buy") ? "buy" : "open";
      const top = v.probs === null || v.probs === undefined ? null : Math.max(...Object.values(v.probs));
      const acted = tone === "sell" || tone === "buy";
      const given = stance === null || v.probs === null || v.probs === undefined ? undefined : v.probs[stance];
      nodes.push({ id: v.id, symbol: v.symbol, kind: v.kind, tone, x, y, r: acted ? 11 : tone === "closed" ? 4.5 : 8, stance, sure: typeof given === "number" && Number.isFinite(given) ? Math.round(given * 100) : null });
      if (tone !== "closed") links.push({ id: v.id, x, y, strength: Math.min(1, Math.max(0.2, top === null || !Number.isFinite(top) ? 0.35 : top)) });
    });
  }
  return { box, center, nodes, links };
}

/* ---------------------------------------------------------------- the strip of the last cycles */

export interface CycleBar {
  readonly atMs: number;
  readonly cycleId: string;
  readonly outcome: string;
  /** act: put orders out; calm: looked and held; wait: could not look (a reason); bad: failed. */
  readonly tone: "act" | "calm" | "wait" | "bad";
  /** Orders this cycle sent: executed, or in flight. One that failed or was only prepared is not an order sent. */
  readonly orders: number;
  readonly heightPct: number;
  readonly reason: string | null;
}

export function cycleStrip(ledger: readonly LedgerRecord[], max = 36): CycleBar[] {
  const sent = new Map<string, number>();
  for (const r of ledger) if (r.kind === "order" && (r.stage === "executada" || r.stage === "incerta")) sent.set(r.cycleId, (sent.get(r.cycleId) ?? 0) + 1);
  const cycles = ledger.filter((r) => r.kind === "cycle").sort((a, b) => a.atMs - b.atMs).slice(-max);
  return cycles.map((c) => {
    const orders = sent.get(c.cycleId) ?? 0;
    const outcome = c.outcome ?? "mantido";
    const tone: CycleBar["tone"] = outcome === "erro" ? "bad" : outcome === "bloqueado" ? "wait" : outcome === "decidido" && orders > 0 ? "act" : "calm";
    return { atMs: c.atMs, cycleId: c.cycleId, outcome, tone, orders, heightPct: 22 + Math.min(orders, 4) * 18, reason: c.reason };
  });
}
