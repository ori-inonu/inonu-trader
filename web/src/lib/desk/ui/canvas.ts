/**
 * The smallest slice of the 2D canvas API the desk drawing functions use. A real
 * CanvasRenderingContext2D satisfies it structurally, and tests run the same code against a
 * recording fake (see recording-context.ts), so geometry is tested without pixels.
 */
export interface Ctx2DLike {
  fillStyle: string | CanvasGradient | CanvasPattern;
  createLinearGradient(x0: number, y0: number, x1: number, y1: number): CanvasGradient;
  strokeStyle: string | CanvasGradient | CanvasPattern;
  lineWidth: number;
  font: string;
  textAlign: CanvasTextAlign;
  textBaseline: CanvasTextBaseline;
  globalAlpha: number;
  lineJoin: CanvasLineJoin;
  lineCap: CanvasLineCap;
  save(): void;
  restore(): void;
  beginPath(): void;
  closePath(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  quadraticCurveTo(cpx: number, cpy: number, x: number, y: number): void;
  rect(x: number, y: number, w: number, h: number): void;
  clip(): void;
  fill(): void;
  stroke(): void;
  fillRect(x: number, y: number, w: number, h: number): void;
  strokeRect(x: number, y: number, w: number, h: number): void;
  clearRect(x: number, y: number, w: number, h: number): void;
  setLineDash(segments: number[]): void;
  fillText(text: string, x: number, y: number): void;
  measureText(text: string): { readonly width: number };
}

/** Resolved colors for canvas drawing. Canvas cannot read CSS variables, so they are copied once. */
export interface DeskPalette {
  readonly bg: string;
  readonly well: string;
  readonly edge: string;
  readonly edgeStrong: string;
  readonly ink: string;
  readonly ink2: string;
  readonly ink3: string;
  readonly ink4: string;
  readonly signal: string;
  readonly buy: string;
  readonly sell: string;
  readonly hold: string;
}

/** Same values as globals.css. Used on the server, in tests and when a variable cannot be read. */
export const DEFAULT_PALETTE: DeskPalette = {
  bg: "#0d1622",
  well: "#070c14",
  edge: "#1e2c3f",
  edgeStrong: "#2a3d55",
  ink: "#e9f1fa",
  ink2: "#b6c8dc",
  ink3: "#7f95ac",
  ink4: "#55697e",
  signal: "#4fd6e8",
  buy: "#3ddc97",
  sell: "#ff6b81",
  hold: "#f2c14e",
};

const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

/** "#3ddc97" at 0.4 alpha becomes "rgba(61,220,151,0.4)". A color that is not hex is returned as is. */
export function withAlpha(color: string, alpha: number): string {
  const text = color.trim();
  if (!HEX.test(text)) return color;
  const hex = text.slice(1);
  const full = hex.length === 3 ? hex.split("").map((c) => c + c).join("") : hex;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  const a = Math.min(1, Math.max(0, alpha));
  return `rgba(${r},${g},${b},${Number(a.toFixed(3))})`;
}

const VARIABLES: ReadonlyArray<readonly [keyof DeskPalette, string]> = [
  ["bg", "--bg-deck"],
  ["well", "--bg-well"],
  ["edge", "--edge"],
  ["edgeStrong", "--edge-strong"],
  ["ink", "--ink"],
  ["ink2", "--ink-2"],
  ["ink3", "--ink-3"],
  ["ink4", "--ink-4"],
  ["signal", "--signal"],
  ["buy", "--buy"],
  ["sell", "--sell"],
  ["hold", "--hold"],
];

/** Reads the design tokens from an element. Falls back per token when one is missing or not hex. */
export function readPalette(el: Element): DeskPalette {
  if (typeof getComputedStyle !== "function") return DEFAULT_PALETTE;
  const style = getComputedStyle(el);
  const next: Record<string, string> = { ...DEFAULT_PALETTE };
  for (const [key, name] of VARIABLES) {
    const raw = style.getPropertyValue(name).trim();
    if (HEX.test(raw)) next[key] = raw;
  }
  return next as unknown as DeskPalette;
}

/** Rounds a CSS pixel coordinate to the nearest device pixel so a 1px line lands on whole pixels. */
export function snap(v: number, dpr: number): number {
  return Math.round(v * dpr) / dpr;
}

/**
 * Center position for a crisp line of `lineWidth` CSS px. A line that covers an odd number of
 * device pixels must be centered on a pixel middle, an even one on a pixel boundary.
 */
export function snapLine(v: number, dpr: number, lineWidth = 1): number {
  const device = Math.max(1, Math.round(lineWidth * dpr));
  return device % 2 === 1 ? (Math.floor(v * dpr) + 0.5) / dpr : Math.round(v * dpr) / dpr;
}
