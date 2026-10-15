/**
 * A measuring tape for the drawing: reads the markup of a scene and says where every piece of text lands (in the canvas, after the groups that move and scale it), how wide it is (from the width of each letter in
 * Arial, the widest font the screen can fall back to, plus the letter spacing of its class) and which pieces cover each other or leave their canvas. Nothing here draws; tests and the checks made while the layout was
 * worked on use it, and nothing in the page imports it.
 */

import { approxWidth } from "./h";

/** The size, letter spacing (in em) and weight each class of text has in hud.css when the markup does not say. */
const CLASS_LOOK: Readonly<Record<string, { fs: number; ls: number; bold: boolean; mono: boolean }>> = {
  "t-title": { fs: 14, ls: 0.26, bold: false, mono: false },
  "t-sub": { fs: 11.5, ls: 0.14, bold: false, mono: false },
  "t-big": { fs: 38, ls: 0.02, bold: true, mono: false },
  "t-num": { fs: 22, ls: 0.02, bold: true, mono: false },
  "t-mono": { fs: 12.5, ls: 0.02, bold: false, mono: true },
};

export interface TextBox {
  readonly text: string;
  readonly x0: number;
  readonly x1: number;
  readonly y0: number;
  readonly y1: number;
  /** The size on screen of the canvas unit: the size of the type as the canvas draws it, after every scale above it. */
  readonly fs: number;
  readonly cls: string;
}

interface Frame {
  readonly s: number;
  readonly tx: number;
  readonly ty: number;
  /** A group that moves by itself (a list that scrolls inside a clip): what is inside it is not measured. */
  readonly moving: boolean;
}

const attr = (tag: string, name: string): string | null => {
  const m = new RegExp(`(?:^|\\s)${name}="([^"]*)"`).exec(tag);
  return m === null ? null : m[1]!;
};

const decode = (s: string): string => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&");

/** How wide a text is, in the units of the canvas it is drawn in. */
export const textWidth = approxWidth;

/** Every piece of text of a scene, placed in the canvas. */
export function textBoxes(html: string): TextBox[] {
  const out: TextBox[] = [];
  const stack: Frame[] = [{ s: 1, tx: 0, ty: 0, moving: false }];
  const re = /<(\/?)([a-zA-Z]+)([^>]*)>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const closing = m[1] === "/", name = m[2]!, rest = m[3]!;
    if (name === "defs") {
      const end = html.indexOf("</defs>", re.lastIndex);
      if (end > 0) re.lastIndex = end + 7;
      continue;
    }
    if (name === "g") {
      if (closing) { if (stack.length > 1) stack.pop(); continue; }
      if (rest.endsWith("/")) continue;
      const parent = stack[stack.length - 1]!;
      const tr = attr(rest, "transform") ?? "";
      const style = attr(rest, "style") ?? "";
      const t = /translate\(\s*(-?[\d.]+)[ ,]+(-?[\d.]+)\s*\)/.exec(tr);
      const sc = /scale\(\s*(-?[\d.]+)\s*\)/.exec(tr);
      const moving = parent.moving || /hud-(rise|scan|scany)/.test(style) || /rotate\(/.test(tr);
      const s = sc === null ? 1 : Number(sc[1]);
      stack.push({ s: parent.s * s, tx: parent.tx + parent.s * (t === null ? 0 : Number(t[1])), ty: parent.ty + parent.s * (t === null ? 0 : Number(t[2])), moving });
      continue;
    }
    if (name === "text" && !closing) {
      const end = html.indexOf("</text>", re.lastIndex);
      if (end < 0) break;
      const content = decode(html.slice(re.lastIndex, end).replace(/<[^>]*>/g, ""));
      re.lastIndex = end + 7;
      const f = stack[stack.length - 1]!;
      if (f.moving || content.trim() === "") continue;
      const cls = (attr(rest, "class") ?? "").split(/\s+/).find((c) => c in CLASS_LOOK) ?? "";
      const look = CLASS_LOOK[cls] ?? { fs: 16, ls: 0.06, bold: false, mono: false };
      const style = attr(rest, "style") ?? "";
      const fsIn = /font-size:\s*([\d.]+)px/.exec(style);
      const lsIn = /letter-spacing:\s*(-?[\d.]+)em/.exec(style);
      const fs = fsIn === null ? look.fs : Number(fsIn[1]);
      const ls = lsIn === null ? look.ls : Number(lsIn[1]);
      const w = textWidth(content, fs, ls, look.mono, look.bold);
      const x = Number(attr(rest, "x") ?? "0"), y = Number(attr(rest, "y") ?? "0");
      const anchor = attr(rest, "text-anchor") ?? "start";
      const left = anchor === "middle" ? x - w / 2 : anchor === "end" ? x - w : x;
      out.push({ text: content, x0: f.tx + f.s * left, x1: f.tx + f.s * (left + w), y0: f.ty + f.s * (y - 0.78 * fs), y1: f.ty + f.s * (y + 0.2 * fs), fs: f.s * fs, cls });
    }
  }
  return out;
}

export interface Clash {
  readonly a: TextBox;
  readonly b: TextBox;
}

/** The pairs of texts that cover each other by more than a hair. */
export function clashes(boxes: readonly TextBox[], slackX = 1.5, slackY = 2): Clash[] {
  const out: Clash[] = [];
  for (let i = 0; i < boxes.length; i++) {
    const a = boxes[i]!;
    for (let j = i + 1; j < boxes.length; j++) {
      const b = boxes[j]!;
      const ix = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0);
      const iy = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0);
      if (ix > slackX && iy > slackY) out.push({ a, b });
    }
  }
  return out;
}

/** The texts that leave the canvas (a piece of the type cut off by the edge of the screen). */
export function outside(boxes: readonly TextBox[], width: number, height: number, slack = 1): TextBox[] {
  return boxes.filter((b) => b.x0 < -slack || b.x1 > width + slack || b.y0 < -slack || b.y1 > height + slack);
}

/** The smallest type of a scene, as the canvas draws it. */
export const smallestFont = (boxes: readonly TextBox[]): number => boxes.reduce((m, b) => Math.min(m, b.fs), Number.POSITIVE_INFINITY);

export const describeClash = (c: Clash): string => `"${c.a.text}" (${c.a.x0.toFixed(0)}..${c.a.x1.toFixed(0)}, ${c.a.y0.toFixed(0)}) over "${c.b.text}" (${c.b.x0.toFixed(0)}..${c.b.x1.toFixed(0)}, ${c.b.y0.toFixed(0)})`;

export interface RectBox {
  readonly x0: number;
  readonly x1: number;
  readonly y0: number;
  readonly y1: number;
  readonly cls: string;
}

/**
 * The rectangles that move by themselves (the faint bars that rise and fall, the bars of the cycles that sway), as far as they go while they move: the swaying ones can rise 4 units. A bar must never sit behind a letter,
 * so a test lays these over the boxes of the text.
 */
export function animatedRects(html: string): RectBox[] {
  const out: RectBox[] = [];
  const stack: (Frame & { readonly wave: boolean })[] = [{ s: 1, tx: 0, ty: 0, moving: false, wave: false }];
  const re = /<(\/?)([a-zA-Z]+)([^>]*)>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const closing = m[1] === "/", name = m[2]!, rest = m[3]!;
    if (name === "defs") {
      const end = html.indexOf("</defs>", re.lastIndex);
      if (end > 0) re.lastIndex = end + 7;
      continue;
    }
    if (name === "g") {
      if (closing) { if (stack.length > 1) stack.pop(); continue; }
      if (rest.endsWith("/")) continue;
      const parent = stack[stack.length - 1]!;
      const tr = attr(rest, "transform") ?? "";
      const t = /translate\(\s*(-?[\d.]+)[ ,]+(-?[\d.]+)\s*\)/.exec(tr);
      const sc = /scale\(\s*(-?[\d.]+)\s*\)/.exec(tr);
      const s = sc === null ? 1 : Number(sc[1]);
      const wave = parent.wave || (attr(rest, "class") ?? "").split(/\s+/).includes("wave");
      stack.push({ s: parent.s * s, tx: parent.tx + parent.s * (t === null ? 0 : Number(t[1])), ty: parent.ty + parent.s * (t === null ? 0 : Number(t[2])), moving: parent.moving, wave });
      continue;
    }
    if (name === "rect" && !closing) {
      const f = stack[stack.length - 1]!;
      const cls = attr(rest, "class") ?? "";
      if (!f.wave && !cls.split(/\s+/).includes("bar")) continue;
      const x = Number(attr(rest, "x") ?? "0"), y = Number(attr(rest, "y") ?? "0"), w = Number(attr(rest, "width") ?? "0"), h = Number(attr(rest, "height") ?? "0");
      const sway = f.wave ? 4 : 0;
      out.push({ x0: f.tx + f.s * x, x1: f.tx + f.s * (x + w), y0: f.ty + f.s * (y - sway), y1: f.ty + f.s * (y + h), cls: f.wave ? "wave" : "bar" });
    }
  }
  return out;
}

/** The animated rectangles that touch the box of a text, with the text: the pairs a letter must never be part of. */
export function barsBehindText(texts: readonly TextBox[], rects: readonly RectBox[], slack = 0.5): { text: TextBox; rect: RectBox }[] {
  const out: { text: TextBox; rect: RectBox }[] = [];
  for (const t of texts) for (const r of rects) if (Math.min(t.x1, r.x1) - Math.max(t.x0, r.x0) > slack && Math.min(t.y1, r.y1) - Math.max(t.y0, r.y0) > slack) out.push({ text: t, rect: r });
  return out;
}
