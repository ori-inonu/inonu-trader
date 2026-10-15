/** Drawing helpers shared by every panel of the command centre. Only drawing here: no data, no clock. */

export const rad = (a: number): number => (a * Math.PI) / 180;
export const fx = (n: number): string => Number(n).toFixed(2);
/** A point on a circle, the angle in degrees clockwise from 12 o'clock. */
export const pt = (cx: number, cy: number, r: number, a: number): [number, number] => [cx + r * Math.sin(rad(a)), cy - r * Math.cos(rad(a))];
export const arc = (cx: number, cy: number, r: number, a0: number, a1: number): string => {
  const [x0, y0] = pt(cx, cy, r, a0);
  const [x1, y1] = pt(cx, cy, r, a1);
  return `M${fx(x0)} ${fx(y0)}A${r} ${r} 0 ${(a1 - a0) % 360 > 180 ? 1 : 0} 1 ${fx(x1)} ${fx(y1)}`;
};
export const ticks = (cx: number, cy: number, r1: number, r2: number, n: number, extra = ""): string => {
  let s = "";
  for (let i = 0; i < n; i++) {
    const a = (360 * i) / n;
    const [x0, y0] = pt(cx, cy, r1, a);
    const [x1, y1] = pt(cx, cy, r2, a);
    s += `<line x1="${fx(x0)}" y1="${fx(y0)}" x2="${fx(x1)}" y2="${fx(y1)}" ${extra}/>`;
  }
  return s;
};
export const hex = (cx: number, cy: number, r: number): string => {
  let p = "";
  for (let i = 0; i < 6; i++) {
    const [x, y] = pt(cx, cy, r, 60 * i + 30);
    p += (i ? "L" : "M") + fx(x) + " " + fx(y);
  }
  return p + "Z";
};
export const fmt = (n: number | null | undefined, d = 2): string => (n === null || n === undefined || Number.isNaN(n) ? "-" : Number(n).toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d }));
export const pct = (n: number | null | undefined, d = 2): string => (n === null || n === undefined ? "-" : (n > 0 ? "+" : "") + fmt(n, d) + "%");
export const hhmm = (t: number): string => new Date(t).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
/** What the screen says in the place of the countdown and of the state under it when the core runs no cycles (the arithmetic of the countdown in live.ts says the same). */
export const STOPPED_COUNT = "PARADO";
export const STOPPED_STATE = "ACOMPANHAMENTO: NENHUMA ORDEM SAI";
/** What the screen says in place of a wallet figure the core has no reading for: the hour of the last reading it recorded, or only that there is none when there never was one. */
export const readNote = (lastReadMs: number | null): string => (lastReadMs === null ? "SEM LEITURA" : `SEM LEITURA DA CARTEIRA, ULTIMA LEITURA ${hhmm(lastReadMs)}`);
/** Text without accents: the screen writes its labels that way. */
export const plain = (s: string): string => s.normalize("NFD").replace(/[̀-ͯ]/g, "");
export const clamp = (v: number, a: number, b: number): number => Math.max(a, Math.min(b, v));
let uid = 0;
/** Ids of clip paths and the like: numbered in the order they are asked for, from zero for each scene, so that the same data always draws the same markup. */
export const id = (p: string): string => p + uid++;
export const resetIds = (): void => {
  uid = 0;
};

/** A panel title: a bracket line, the title and a quiet sub line under it. The content starts at y = 62. */
export const title = (w: number, text: string, sub?: string): string => `
    <path class="draw" pathLength="1" d="M0 38V12Q0 5 7 5H${w - 44}l14 14H${w}" fill="none" stroke="#2ee6ff" stroke-width="1.4"/>
    <text class="t-title" x="14" y="29">${text}</text>
    ${sub ? `<text class="t-sub" x="14" y="48" style="font-size:10.5px">${sub}</text>` : ""}`;

/** Advance widths of Arial in thousandths of an em for what the screen writes (the widest font the screen can fall back to, so a measure made with it is never short): capitals, digits and signs (lower case is there for the few words that are not capitals). */
const ARIAL: Readonly<Record<string, number>> = {
  A: 667, B: 667, C: 722, D: 722, E: 667, F: 611, G: 778, H: 722, I: 278, J: 500, K: 667, L: 556, M: 833, N: 722, O: 778, P: 667, Q: 778, R: 722, S: 667, T: 611, U: 722, V: 667, W: 944, X: 667, Y: 667, Z: 611,
  a: 556, b: 556, c: 500, d: 556, e: 556, f: 278, g: 556, h: 556, i: 222, j: 222, k: 500, l: 222, m: 833, n: 556, o: 556, p: 556, q: 556, r: 333, s: 500, t: 278, u: 556, v: 500, w: 722, x: 500, y: 500, z: 500,
  " ": 278, ".": 278, ",": 278, ":": 278, ";": 278, "%": 889, $: 556, "+": 584, "-": 333, "(": 333, ")": 333, "/": 278, "=": 584, ">": 584, "<": 584, _: 556, "#": 556, "@": 1015, "|": 260,
};
const MONO = 550;

/** How wide a text is, in the units of the canvas it is drawn in: the width of each letter plus the letter spacing, which is what the panels use to keep labels from running into each other. */
export function approxWidth(text: string, fs: number, ls: number, mono: boolean, bold: boolean): number {
  let w = 0;
  for (const ch of text) w += (mono ? MONO : (ARIAL[ch] ?? 556)) * (bold && !mono ? 1.06 : 1);
  return (w / 1000) * fs + ls * fs * text.length;
}

/**
 * Which labels of a row of points can be written without running into each other: the last ones are kept first (the newest is what is looked at), and each one needs the room its text takes. `xs` are the centres,
 * `widths` the widths, in the same unit; the answer says, for each label, whether to draw it.
 */
export function thinLabels(xs: readonly number[], widths: readonly number[], gap = 6): boolean[] {
  const keep = new Array<boolean>(xs.length).fill(false);
  let edge = Number.POSITIVE_INFINITY;
  for (let i = xs.length - 1; i >= 0; i--) {
    const right = xs[i]! + widths[i]! / 2;
    if (right + gap <= edge) { keep[i] = true; edge = xs[i]! - widths[i]! / 2; }
  }
  return keep;
}

/** Raises every inline font size below `floor` to it: the narrow scenes draw the 480 wide panels and promise that nothing on them is written smaller than this. */
export const minFont = (svg: string, floor: number): string => svg.replace(/font-size:(\d+(?:\.\d+)?)px/g, (m, n: string) => (Number(n) < floor ? `font-size:${floor}px` : m));

export const at = (x: number, y: number, s: number, body: string): string => `<g transform="translate(${fx(x)} ${fx(y)}) scale(${s})">${body}</g>`;

export const text = (x: number, y: number, s: string, cls = "t-sub", style = "", anchor = "start"): string => `<text class="${cls}" x="${fx(x)}" y="${fx(y)}" text-anchor="${anchor}" style="${style}">${s}</text>`;

/** A number that counts up to its value when the scene is drawn (hud-live.ts runs it); the text already holds the final value, so nothing depends on the count. */
export const countText = (x: number, y: number, value: number | null, d: number, prefix = "", suffix = "", cls = "t-num", style = "", anchor = "start"): string =>
  value === null || !Number.isFinite(value)
    ? text(x, y, "-", cls, style, anchor)
    : `<text class="${cls}" x="${fx(x)}" y="${fx(y)}" text-anchor="${anchor}" style="${style}" data-count="${value}" data-dec="${d}" data-pre="${prefix}" data-suf="${suffix}">${prefix}${fmt(value, d)}${suffix}</text>`;

/** A sentence split into lines of at most `n` characters, at the spaces. */
export function wrap(s: string, n: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of s.split(" ")) {
    if (line !== "" && (line + " " + word).length > n) { lines.push(line); line = word; } else line = line === "" ? word : line + " " + word;
  }
  if (line !== "") lines.push(line);
  return lines;
}

/** A ceiling as the screen writes it: the dollars, "SEM TETO" for none, "SEM DADO" when the core did not say. */
export const capText = (cap: number | null | undefined): string => (cap === undefined ? "SEM DADO" : cap === null ? "SEM TETO" : "US$ " + fmt(cap, 0));
/** How much of a ceiling is used, 0 to 1; null when there is no ceiling to measure against. */
export const capUse = (spent: number, cap: number | null | undefined): number | null => (typeof cap === "number" && cap > 0 ? Math.min(1, spent / cap) : null);

/** What the screen says of leverage: what the owner authorized and whether anything can really use it. The authorization is the owner's; an instrument is something the code has, and today it has none. */
export const leverageText = (l: { readonly granted: boolean; readonly instruments: number } | null | undefined, short = false): string => {
  if (l === null || l === undefined) return "SEM DADO DO NUCLEO";
  if (!l.granted) return "NAO AUTORIZADA";
  if (l.instruments === 0) return short ? "AUTORIZADA, SEM INSTRUMENTO" : "AUTORIZADA POR VOCE, SEM INSTRUMENTO LIGADO";
  return `AUTORIZADA, ${l.instruments} INSTRUMENTO(S) LIGADO(S)`;
};

export const COL = { cy: "#2ee6ff", soft: "#7df3ff", amber: "#ffb23e", green: "#38ffb4", mute: "#5fa3b5", white: "#e9fbff", dim: "#0b2c38", grid: "#0e3948", red: "#ff6048" } as const;

/** A panel that has nothing to show because the core could not give its data: it says so, in the place the data would be. */
export const unavailable = (w: number, h: number, name: string, why: string): string => `${title(w, name, why)}
    <rect x="0" y="70" width="${w}" height="${Math.max(40, h - 90)}" fill="#031820" stroke="#124c5f" stroke-dasharray="4 6"/>
    ${text(w / 2, 70 + Math.max(40, h - 90) / 2 + 4, "SEM DADOS DO NUCLEO NESTA VERSAO", "t-sub", "font-size:11px;fill:#5fa3b5", "middle")}`;
