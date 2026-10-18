/**
 * The whole screen as one SVG string: the top bar with its tabs and, per tab, one of three shapes (layout.ts says which, for the window): the STAGE, a 1920 x 1080 placement that grows to the shape of the screen and
 * needs no scrolling; the BOARD, the compact 480 wide panels in two to four columns under the core, which scrolls down; and the COLUMN, one narrow canvas of the same panels. Pure: the model, the aspect ratio and the shape
 * come in, the markup comes out; the clock and the countdown are written by live.ts after it is on screen.
 */
import type { HudModel } from "../types";
import { createAnalysis } from "./analysis";
import { COMPACT_H, createCompact } from "./compact";
import { createCommand } from "./command";
import { board as boardOf, BOARD_GAP, BOARD_MARGIN, BOARD_MIN_FONT, boardWidth, COLUMN_MIN_FONT, layoutKey, legacyLayout, PANEL_W, stageSize, TALL_BELOW, type Layout } from "./layout";
import { pack, type PackItem } from "./pack";
import { createSystem, SYSTEM_WIDE } from "./system";
import { arc, at, COL, fx, minFont, pct, plain, resetIds } from "./h";

export { stageSize, TALL_BELOW };

export const TABS = [["comando", "COMANDO"], ["decisoes", "DECISOES"], ["carteira", "CARTEIRA"], ["resultado", "RESULTADO"], ["pulados", "PULADOS"], ["sistema", "SISTEMA"]] as const;
export type TabKey = (typeof TABS)[number][0];
export const isTab = (v: unknown): v is TabKey => TABS.some((t) => t[0] === v);

export interface Scene {
  readonly html: string;
  readonly width: number;
  readonly height: number;
  /** True when the scene is taller than the window and scrolls (the board and the column); false for the stage. */
  readonly tall: boolean;
  readonly layout: Layout;
  /** Changes with the shape and the number of columns: the page is drawn again from scratch only when it does. */
  readonly key: string;
}

const DEFS = `<defs>
    <radialGradient id="bgGlow" cx="50%" cy="46%" r="62%"><stop offset="0" stop-color="#06222e" stop-opacity=".78"/><stop offset=".55" stop-color="#03111a" stop-opacity=".5"/><stop offset="1" stop-color="#02070d" stop-opacity=".18"/></radialGradient>
    <radialGradient id="coreFill" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#bff6ff" stop-opacity=".95"/><stop offset=".35" stop-color="#2ee6ff" stop-opacity=".55"/><stop offset=".8" stop-color="#07586e" stop-opacity=".55"/><stop offset="1" stop-color="#03202b" stop-opacity=".9"/></radialGradient>
    <radialGradient id="coreHalo" cx="50%" cy="50%" r="50%"><stop offset=".55" stop-color="#2ee6ff" stop-opacity="0"/><stop offset=".8" stop-color="#2ee6ff" stop-opacity=".18"/><stop offset="1" stop-color="#2ee6ff" stop-opacity="0"/></radialGradient>
    <linearGradient id="sweepGrad" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#2ee6ff" stop-opacity="0"/><stop offset="1" stop-color="#2ee6ff" stop-opacity=".5"/></linearGradient>
    <linearGradient id="sweepV" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2ee6ff" stop-opacity="0"/><stop offset="1" stop-color="#2ee6ff" stop-opacity=".22"/></linearGradient>
    <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2ee6ff" stop-opacity=".45"/><stop offset="1" stop-color="#2ee6ff" stop-opacity="0"/></linearGradient>
    <filter id="glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="3.2" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
    <filter id="glow2" x="-80%" y="-80%" width="260%" height="260%"><feGaussianBlur stdDeviation="8" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
    <pattern id="grid" width="96" height="96" patternUnits="userSpaceOnUse"><path d="M96 0H0V96" fill="none" stroke="#0b3140" stroke-width=".8" opacity=".55"/><path d="M48 0V96M0 48H96" fill="none" stroke="#0b3140" stroke-width=".4" opacity=".35"/></pattern>
  </defs>`;


/** A small drawing for each tab, in a 14 by 14 box centred on the origin: a target, a funnel, a ring, bars, a skip, a hexagon. Strokes only. */
const TAB_ICON: Readonly<Record<string, string>> = {
  comando: `<circle r="6"/><circle r="1.6"/>`,
  decisoes: `<path d="M-6 -5h12l-4.5 5.5v5.5h-3v-5.5z"/>`,
  carteira: `<path d="M0 -6a6 6 0 1 1 -6 6"/><path d="M0 -6v6h-6"/>`,
  resultado: `<path d="M-5 6v-4M0 6v-8M5 6v-6"/>`,
  pulados: `<path d="M-6 -5l5 5l-5 5M0 -5l5 5l-5 5"/>`,
  sistema: `<path d="M0 -6.5l5.6 3.25v6.5l-5.6 3.25l-5.6 -3.25v-6.5z"/><circle r="1.6"/>`,
};

const frame = (W: number, H: number): string => `<g fill="none" stroke="#17687f" stroke-width="1.6" opacity=".9">
      <path d="M24 118V40Q24 24 40 24H430"/><path d="M${W - 24} 118V40Q${W - 24} 24 ${W - 40} 24H${W - 430}"/>
      <path d="M24 ${H - 118}v78q0 16 16 16h390"/><path d="M${W - 24} ${H - 118}v78q0 16 -16 16h-390"/></g>`;

/** A link between two panels, with a small light travelling along it (the direction of the data). */
const link = (x0: number, y0: number, x1: number, y1: number, rev = false, dur = 4): string => {
  const xm = (x0 + x1) / 2;
  const d = `M${x0} ${y0}C${xm} ${y0} ${xm} ${y1} ${x1} ${y1}`;
  const back = `M${x1} ${y1}C${xm} ${y1} ${xm} ${y0} ${x0} ${y0}`;
  return `<path d="${d}" class="${rev ? "flow-rev" : "flow"}" stroke="#2ee6ff"/><circle r="2.8" fill="#bff6ff" class="glow"><animateMotion dur="${dur}s" repeatCount="indefinite" path="${rev ? back : d}"/></circle>`;
};

/** A ruler of ticks that slides along an edge, like the margin of an instrument. Geometry only: no number on it is a reading. */
const ruler = (x: number, y0: number, y1: number, mirror: boolean): string => {
  let ticks = "";
  for (let y = y0 - 70; y <= y1 + 70; y += 14) {
    const long = Math.round((y - y0) / 14) % 5 === 0;
    ticks += `<line x1="${x}" x2="${mirror ? x - (long ? 10 : 5) : x + (long ? 10 : 5)}" y1="${y}" y2="${y}"/>`;
  }
  const id = `rl${Math.round(x)}`;
  return `<clipPath id="${id}"><rect x="${x - 14}" y="${y0}" width="28" height="${y1 - y0}"/></clipPath><g clip-path="url(#${id})" stroke="#1c8aa3" stroke-width="1" opacity=".7"><g style="--h:70px;animation:hud-rise 6s linear infinite">${ticks}</g></g>`;
};

/** How the six tabs are drawn in a header: the width of a plate, the space between them, whether each carries its drawing, and the type of the label. */
interface TabLook {
  readonly plate: number;
  readonly gap: number;
  readonly icon: boolean;
  readonly fs: number;
  readonly ls: string;
  /** How many tabs sit in a row: all six, or three in two rows where the window is narrow (a phone) and one row would make them too small to touch. */
  readonly perRow: number;
}
/** The height of a row of tabs, the space between rows included. */
const TAB_ROW = 52;
const STAGE_TABS: TabLook = { plate: 132, gap: 8, icon: true, fs: 11, ls: ".13em", perRow: 6 };
const COLUMN_TABS: TabLook = { plate: 206, gap: 8, icon: true, fs: 13, ls: ".08em", perRow: 3 };
const boardTabs = (W: number): TabLook => ({ plate: Math.max(132, Math.min(170, Math.floor((W - 2 * BOARD_MARGIN - 5 * 8) / 6))), gap: 8, icon: true, fs: 12, ls: ".12em", perRow: 6 });
const tabsWidth = (k: TabLook): number => k.perRow * k.plate + (k.perRow - 1) * k.gap;
const tabsHeight = (k: TabLook): number => Math.ceil(TABS.length / k.perRow) * TAB_ROW;
/** The plate of a tab is as wide as `plate` and its label is centred on what is left of it after the drawing. */
const tabs = (x: number, y0: number, tab: TabKey, k: TabLook): string => TABS.map(([key, lab], i) => {
  const on = key === tab, tx = x + (i % k.perRow) * (k.plate + k.gap), P = k.plate;
  const y = y0 + Math.floor(i / k.perRow) * TAB_ROW;
  const outline = `M${tx} ${y + 14}l9 -12h${P - 18}l9 12v16l-9 12h-${P - 18}l-9 -12z`;
  const icon = k.icon ? `<g transform="translate(${tx + 22} ${y + 22})" class="tab-icon" fill="none">${TAB_ICON[key] ?? ""}</g>` : "";
  const cx = k.icon ? tx + (P + 25) / 2 : tx + P / 2;
  return `<g class="tab" data-tab="${key}" role="tab" tabindex="0" aria-selected="${on}" aria-label="${lab}"><path class="plate" d="${outline}" fill="${on ? "#0b4252" : "#041a23"}" stroke="${on ? "#2ee6ff" : "#17687f"}" stroke-width="${on ? 2 : 1.2}" ${on ? 'filter="url(#glow)"' : ""}/>
        <path class="tab-flow" d="${outline}" pathLength="100" fill="none" stroke-width="1.8"/>${icon}
        <text x="${fx(cx)}" y="${y + 26}" text-anchor="middle" class="t-sub" style="font-size:${k.fs}px;letter-spacing:${k.ls}">${lab}</text></g>`;
}).join("");

const logo = (x: number, y: number): string => `<circle cx="${x + 34}" cy="${y + 34}" r="26" fill="none" stroke="#2ee6ff" stroke-width="2"/>
      <g class="spin-c" style="transform-origin:${x + 34}px ${y + 34}px" fill="none" stroke="#2ee6ff" stroke-width="2"><path d="${arc(x + 34, y + 34, 18, 0, 90)}"/><path d="${arc(x + 34, y + 34, 18, 180, 270)}"/></g>
      <circle cx="${x + 34}" cy="${y + 34}" r="6" fill="#bff6ff" class="glow"/>
      <text x="${x + 76}" y="${y + 32}" class="t-big" style="font-size:24px;letter-spacing:.18em">INONU TRADER</text>
      <text x="${x + 78}" y="${y + 52}" class="t-sub">AGENTE AUTONOMO DE CARTEIRA</text>`;

/** The words of the top bar that say what the agent is: connected or only watched, the money it is on, the market, and anything that waits for the person. */
function status(D: HudModel): { state: string; dot: string; market: string; waiting: number } {
  // an agent that runs no cycles is not "connected" in the sense that matters: it is only being watched, and the bar says so
  const state = D.agent.cycling ? `${D.agent.paused ? "PAUSADO" : "CONECTADO"}  ${D.agent.authority.toUpperCase()}  ${D.agent.profile.toUpperCase()}  ${(D.agent.model ?? "").toUpperCase()}` : "ACOMPANHAMENTO, AGENTE PARADO";
  return {
    state,
    dot: !D.agent.cycling || D.agent.paused ? COL.amber : COL.green,
    market: `MERCADO 24H  BTC ${pct(D.context.btc, 1)}  ETH ${pct(D.context.eth, 1)}  ${plain(D.context.trend ?? "").toUpperCase()}`,
    // an order that never showed a transaction waits for the person's word: said on every tab, in the colour of attention, with the way to it
    waiting: D.system.inFlight.filter((o) => o.needsWord).length,
  };
}
const waitingText = (n: number): string => `${n} ORDEM(NS) ESPERAM A SUA PALAVRA: ABA SISTEMA`;

function stageHeader(D: HudModel, tab: TabKey, W: number): string {
  const S = status(D);
  const attention = S.waiting === 0 ? "" : `<text class="t-mono" x="1345" y="102" style="fill:${COL.amber};font-size:11px">${waitingText(S.waiting)}</text>`;
  return `${logo(40, 24)}<g role="tablist" aria-label="Telas">${tabs(470, 40, tab, STAGE_TABS)}</g>
        <circle cx="1345" cy="54" r="5" fill="${S.dot}"/>
        <text class="t-mono" x="1360" y="58" style="fill:#bfefff;font-size:12.5px">${S.state}</text>
        <text class="t-sub" x="1345" y="82" style="font-size:10.5px">${S.market}</text>${attention}
        <text class="clock t-big" x="${W - 40}" y="64" text-anchor="end" style="font-size:34px">--:--:--</text>
        <text class="date t-sub" x="${W - 40}" y="86" text-anchor="end">--</text>`;
}

/** What a scene that scrolls puts above its panels: the part that scrolls away, the tabs (which keep to the top of the window while the rest goes by) and the height the panels start at. */
interface Header {
  readonly top: string;
  readonly sticky: string;
  readonly height: number;
}

/** The tabs that follow the person down the page: a plate behind them (shown only once they have left their own place) and the six tabs. `data-top` is where the plate starts, for the script that moves the group. */
const stickyTabs = (W: number, y: number, tab: TabKey, k: TabLook): string => {
  const top = y - 6;
  const x = Math.round((W - tabsWidth(k)) / 2);
  const bottom = y + tabsHeight(k);
  return `<g class="sticky-head" data-top="${top}"><rect class="sticky-plate" x="0" y="${top}" width="${W}" height="${bottom - top}" fill="#02070d"/><line class="sticky-plate" x1="0" x2="${W}" y1="${bottom}" y2="${bottom}" stroke="#17687f" stroke-width="1.2"/><g role="tablist" aria-label="Telas">${tabs(x, y, tab, k)}</g></g>`;
};

function boardHeader(D: HudModel, tab: TabKey, W: number): Header {
  const S = status(D);
  const x0 = 380;
  const attention = S.waiting === 0 ? "" : `<text class="t-mono" x="${x0}" y="88" style="fill:${COL.amber};font-size:11px">${waitingText(S.waiting)}</text>`;
  const top = `${logo(BOARD_MARGIN, 14)}
      <circle cx="${x0 + 5}" cy="42" r="5" fill="${S.dot}"/><text class="t-mono" x="${x0 + 18}" y="46" style="fill:#bfefff;font-size:12px">${S.state}</text>
      <text class="t-sub" x="${x0}" y="68" style="font-size:10.5px">${S.market}</text>${attention}
      <text class="clock t-big" x="${W - BOARD_MARGIN}" y="52" text-anchor="end" style="font-size:30px">--:--:--</text><text class="date t-sub" x="${W - BOARD_MARGIN}" y="74" text-anchor="end" style="font-size:10.5px">--</text>`;
  return { top, sticky: stickyTabs(W, 96, tab, boardTabs(W)), height: 166 };
}

function columnHeader(D: HudModel, tab: TabKey, W: number): Header {
  const S = status(D);
  // the logo and the clock, then the tabs (two rows of three), then the words of the bar under them
  const below = 88 + tabsHeight(COLUMN_TABS) + 22;
  const attention = S.waiting === 0 ? "" : `<text class="t-mono" x="30" y="${below + 42}" style="fill:${COL.amber};font-size:11px">${waitingText(S.waiting)}</text>`;
  const top = `${logo(30, 14)}<text class="clock t-big" x="${W - 30}" y="52" text-anchor="end" style="font-size:30px">--:--:--</text><text class="date t-sub" x="${W - 30}" y="74" text-anchor="end" style="font-size:10px">--</text>
      <circle cx="40" cy="${below}" r="5" fill="${S.dot}"/><text class="t-mono" x="54" y="${below + 4}" style="fill:#bfefff;font-size:11.5px">${S.state}</text>
      <text class="t-sub" x="30" y="${below + 26}" style="font-size:10.5px">${S.market}</text>${attention}`;
  return { top, sticky: stickyTabs(W, 88, tab, COLUMN_TABS), height: below + (S.waiting === 0 ? 50 : 66) };
}

export function buildScene(D: HudModel, tab: TabKey, aspect: number, layout: Layout = legacyLayout(aspect)): Scene {
  resetIds();
  const C = createCommand(D);
  const A = createAnalysis(D);
  const N = createCompact(D);
  const Y = createSystem(D);
  const key = layoutKey(layout);

  if (layout.kind === "stage") {
    const { w: W, h: Hh } = stageSize(aspect);
    const ox = (W - 1920) / 2, oy = (Hh - 1080) / 2;
    const wide: Record<TabKey, () => string> = {
      comando: () => `
        <g fill="none" stroke="#2ee6ff" stroke-width="1.3" opacity=".6">
          ${link(520, 250, 650, 440, false, 4.2)}${link(520, 500, 640, 520, true, 5)}${link(520, 780, 660, 640, false, 4.6)}
          ${link(1400, 270, 1290, 440, true, 4.4)}${link(1400, 560, 1290, 520, false, 5.2)}${link(1400, 800, 1280, 640, true, 4.8)}
          <path d="M960 112V166" class="flow-fast"/></g>
        ${at(610, 112, 1, C.core())}
        ${at(40, 128, 1, C.results())}${at(40, 396, 1, C.positions())}${at(40, 646, 1, C.placar())}
        ${at(1400, 128, 1, C.decision())}${at(1400, 450, 1, C.facets())}${at(1400, 706, 1, C.health())}
        ${at(40, 928, 1, C.cycles())}${at(610, 912, 1, C.command())}${at(1400, 890, 1, C.feed())}`,
      decisoes: () => `${at(40, 128, 1, A.funnel())}${at(1180, 128, 1, A.hist())}${at(40, 548, 1, A.matrix())}${at(1180, 548, 1, A.preferences())}${at(40, 982, 1, A.timeline())}`,
      carteira: () => `${at(40, 128, 1, A.allocation())}${at(980, 128, 1, A.equityMarks())}${at(40, 640, 1, A.tripCards())}${at(980, 640, 1, A.limits())}`,
      resultado: () => `${at(40, 140, 1, A.kpis())}${at(40, 310, 1, A.cumulative())}${at(980, 310, 1, A.outcomes())}${at(40, 760, 1, A.activity())}`,
      pulados: () => `${at(40, 128, 1, A.moves("15m"))}${at(980, 128, 1, A.moves("1h"))}${at(40, 596, 1, A.recent())}`,
      sistema: () => {
        // an agent that runs no cycles says so across the top, in the gap between the top bar and the panels, so nothing under it has to move
        const banner = D.agent.cycling ? "" : at(40, 97, 1, Y.stopped(1840, true));
        // three columns of panels 580 wide, each panel under the shortest column and in the order that matters (the wallet, the orders without a receipt, the actions, the limits and the choices of the code, the
        // resources, the log); the log is the one that is left out when the stage has no room for it, because the stage does not scroll
        const top = 128, w = 580, gap = 30, xs = [40, 670, 1300];
        const parts: { name: string; h: number; draw: () => string }[] = [
          { name: "wallet", h: Y.walletH(w), draw: () => Y.wallet(w) },
          { name: "inflight", h: Y.inflightH(w), draw: () => Y.inflight(w) },
          { name: "actions", h: Y.actionsH(w), draw: () => Y.actions(w) },
          { name: "limits", h: Y.limitsH(w), draw: () => Y.limits(w) },
          { name: "resources", h: Y.resourcesH(w), draw: () => Y.resources(w) },
          { name: "log", h: Y.logH(w), draw: () => Y.log(w) },
        ];
        let placed = pack(parts, 3, top, gap);
        if (placed.bottom > SYSTEM_WIDE.bottom) placed = pack(parts.filter((p) => p.name !== "log"), 3, top, gap);
        return `${banner}${placed.placed.map((p) => at(xs[p.col]!, p.y, 1, parts.find((x) => x.name === p.name)!.draw())).join("")}`;
      },
    };
    const html = `${DEFS}<rect width="${fx(W)}" height="${fx(Hh)}" fill="url(#bgGlow)"/><g style="overflow:hidden"><rect class="drift" width="${fx(W + 400)}" height="${fx(Hh + 400)}" fill="url(#grid)"/></g>
      <g transform="translate(${fx(ox)} ${fx(oy)})">${frame(1920, 1080)}${ruler(10, 140, 940, false)}${ruler(1910, 140, 940, true)}${stageHeader(D, tab, 1920)}<g class="enter">${wide[tab]()}</g></g>
      <g style="--w:${fx(W + 480)}px" class="boot-sweep"><rect x="-240" y="0" width="240" height="${fx(Hh)}" fill="url(#sweepGrad)" opacity=".5"/><line x1="0" x2="0" y1="0" y2="${fx(Hh)}" stroke="#bff6ff" stroke-width="1.5" opacity=".6"/></g>`;
    return { html, width: W, height: Hh, tall: false, layout, key };
  }

  // the panels that are 480 wide in the compact drawing, by name; the board and the column choose, order and place them
  const panel: Record<string, () => string> = {
    reading: C.reading, results: C.results, positions: C.positions, decision: C.decision, health: C.health, placar: C.placar, facets: C.facets, feed: C.feed, cycles: C.cycles, counters: C.counters,
    funnel: N.funnel, hist: N.hist, matrix: N.matrix, preferences: N.preferences, timeline: N.timeline, allocation: N.allocation, equityMarks: N.equityMarks, tripCards: N.tripCards, limits: N.limits,
    kpis: N.kpis, cumulative: N.cumulative, outcomes: N.outcomes, activity: N.activity, moves15: () => N.moves("15m"), moves1h: () => N.moves("1h"), recent: N.recent,
    sysStopped: () => Y.stopped(PANEL_W), sysWallet: () => Y.wallet(PANEL_W), sysInflight: () => Y.inflight(PANEL_W), sysActions: () => Y.actions(PANEL_W), sysLimits: () => Y.limits(PANEL_W), sysResources: () => Y.resources(PANEL_W), sysLog: () => Y.log(PANEL_W),
  };
  // the height each one needs: the ones whose rows depend on the data say so themselves
  const heights = (): Record<string, number> => ({
    reading: C.readingH(), results: 250, positions: 232, decision: 310, health: C.healthH(), placar: 270, facets: 256, feed: 150, cycles: 124, counters: 100,
    funnel: COMPACT_H.funnel, hist: COMPACT_H.hist, matrix: COMPACT_H.matrix, preferences: COMPACT_H.preferences, timeline: COMPACT_H.timeline, allocation: COMPACT_H.allocation, equityMarks: COMPACT_H.equityMarks, tripCards: COMPACT_H.tripCards, limits: COMPACT_H.limits,
    kpis: COMPACT_H.kpis, cumulative: COMPACT_H.cumulative, outcomes: COMPACT_H.outcomes, activity: COMPACT_H.activity, moves15: COMPACT_H.moves, moves1h: COMPACT_H.moves, recent: COMPACT_H.recent,
    sysStopped: Y.stoppedH(PANEL_W), sysWallet: Y.walletH(PANEL_W), sysInflight: Y.inflightH(PANEL_W), sysActions: Y.actionsH(PANEL_W), sysLimits: Y.limitsH(PANEL_W), sysResources: Y.resourcesH(PANEL_W), sysLog: Y.logH(PANEL_W),
  });
  const names: Record<TabKey, readonly string[]> = {
    comando: ["decision", "results", "positions", "reading", "facets", "placar", "health", "feed", "cycles", "counters"],
    decisoes: ["funnel", "hist", "matrix", "preferences", "timeline"],
    carteira: ["allocation", "equityMarks", "tripCards", "limits"],
    resultado: ["kpis", "cumulative", "outcomes", "activity"],
    pulados: ["moves15", "moves1h", "recent"],
    sistema: ["sysWallet", "sysInflight", "sysActions", "sysLimits", "sysResources", "sysLog"],
  };

  if (layout.kind === "board") {
    const n = layout.columns;
    const W = boardWidth(n);
    const head = boardHeader(D, tab, W);
    const h = heights();
    let y = head.height;
    let hero = "";
    if (tab === "comando") {
      // the core on top, at the middle of the board: the first thing seen, and the one drawing that has no compact form
      const k = n === 2 ? 0.85 : 0.9;
      hero = at((W - 700 * k) / 2, y - 22 * k, k, C.core(1.25));
      y += 770 * k + BOARD_GAP;
    }
    if (tab === "sistema" && !D.agent.cycling) {
      const inner = W - 2 * BOARD_MARGIN;
      hero = at(BOARD_MARGIN, y, 1, Y.stopped(inner));
      y += Y.stoppedH(inner) + BOARD_GAP;
    }
    const items: PackItem[] = names[tab].map((name) => ({ name, h: h[name]! }));
    const { placed, bottom } = pack(items, n, y, BOARD_GAP);
    const panels = placed.map((p) => at(BOARD_MARGIN + p.col * (PANEL_W + BOARD_GAP), p.y, 1, minFont(panel[p.name]!(), BOARD_MIN_FONT))).join("");
    const H = bottom + BOARD_GAP + 8;
    const html = `${DEFS}<rect width="${W}" height="${fx(H)}" fill="url(#bgGlow)"/><rect width="${W}" height="${fx(H)}" fill="url(#grid)" opacity=".6"/>${head.top}<g class="enter">${hero}${panels}</g>${head.sticky}`;
    return { html, width: W, height: H, tall: true, layout: boardOf(n), key };
  }

  // the narrow column: a 720 wide canvas, the panels one under the other at 640 wide (scaled from their 480), the core at its own size
  const W = 720;
  const head = columnHeader(D, tab, W);
  const h = heights();
  let y = head.height;
  let panels = "";
  // in the column the system tab keeps the order it always had (what the person can do first), with the line that says the agent is stopped above it
  const order = tab === "sistema" ? [...(D.agent.cycling ? [] : ["sysStopped"]), "sysActions", "sysInflight", "sysWallet", "sysLimits", "sysResources", "sysLog"] : [...(tab === "comando" ? ["core"] : []), ...names[tab]];
  for (const name of order) {
    const core = name === "core";
    const s = core ? 1 : 640 / PANEL_W;
    panels += at(core ? 10 : 40, y, s, core ? C.core(1.3) : minFont(panel[name]!(), COLUMN_MIN_FONT));
    y += (core ? 820 : h[name]!) * s + 34;
  }
  const html = `${DEFS}<rect width="${W}" height="${fx(y)}" fill="url(#bgGlow)"/><rect width="${W}" height="${fx(y)}" fill="url(#grid)" opacity=".6"/>${head.top}<g class="enter">${panels}</g>${head.sticky}`;
  return { html, width: W, height: y, tall: true, layout, key };
}

