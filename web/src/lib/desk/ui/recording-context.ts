import type { Ctx2DLike } from "./canvas";

export interface RecordedCall {
  readonly op: string;
  readonly args: readonly (number | string)[];
  /** Style state at the moment of the call, for assertions on color, width and alpha. */
  readonly fillStyle: string;
  readonly strokeStyle: string;
  readonly lineWidth: number;
  readonly globalAlpha: number;
  readonly font: string;
  readonly dash: readonly number[];
}

/**
 * A 2D context double that records every call with the style it was made under. Tests only.
 * measureText is a fixed width per character, which is enough to test layout decisions.
 */
export class RecordingContext implements Ctx2DLike {
  fillStyle: string | CanvasGradient | CanvasPattern = "#000000";
  strokeStyle: string | CanvasGradient | CanvasPattern = "#000000";
  lineWidth = 1;
  font = "10px sans-serif";
  textAlign: CanvasTextAlign = "start";
  textBaseline: CanvasTextBaseline = "alphabetic";
  globalAlpha = 1;
  lineJoin: CanvasLineJoin = "miter";
  lineCap: CanvasLineCap = "butt";
  readonly calls: RecordedCall[] = [];
  private dash: number[] = [];
  private stack: Array<{ fillStyle: string; strokeStyle: string; lineWidth: number; globalAlpha: number; font: string; dash: number[] }> = [];

  constructor(private readonly charWidth = 6) {}

  private log(op: string, args: readonly (number | string)[] = []): void {
    this.calls.push({
      op,
      args,
      fillStyle: String(this.fillStyle),
      strokeStyle: String(this.strokeStyle),
      lineWidth: this.lineWidth,
      globalAlpha: this.globalAlpha,
      font: this.font,
      dash: [...this.dash],
    });
  }

  of(op: string): RecordedCall[] {
    return this.calls.filter((c) => c.op === op);
  }

  save(): void {
    this.stack.push({
      fillStyle: String(this.fillStyle),
      strokeStyle: String(this.strokeStyle),
      lineWidth: this.lineWidth,
      globalAlpha: this.globalAlpha,
      font: this.font,
      dash: [...this.dash],
    });
    this.log("save");
  }
  restore(): void {
    const top = this.stack.pop();
    if (top) {
      this.fillStyle = top.fillStyle;
      this.strokeStyle = top.strokeStyle;
      this.lineWidth = top.lineWidth;
      this.globalAlpha = top.globalAlpha;
      this.font = top.font;
      this.dash = top.dash;
    }
    this.log("restore");
  }
  beginPath(): void { this.log("beginPath"); }
  closePath(): void { this.log("closePath"); }
  moveTo(x: number, y: number): void { this.log("moveTo", [x, y]); }
  lineTo(x: number, y: number): void { this.log("lineTo", [x, y]); }
  quadraticCurveTo(cpx: number, cpy: number, x: number, y: number): void { this.log("quadraticCurveTo", [cpx, cpy, x, y]); }
  rect(x: number, y: number, w: number, h: number): void { this.log("rect", [x, y, w, h]); }
  clip(): void { this.log("clip"); }
  fill(): void { this.log("fill"); }
  stroke(): void { this.log("stroke"); }
  fillRect(x: number, y: number, w: number, h: number): void { this.log("fillRect", [x, y, w, h]); }
  strokeRect(x: number, y: number, w: number, h: number): void { this.log("strokeRect", [x, y, w, h]); }
  clearRect(x: number, y: number, w: number, h: number): void { this.log("clearRect", [x, y, w, h]); }
  setLineDash(segments: number[]): void {
    this.dash = [...segments];
    this.log("setLineDash", segments);
  }
  fillText(text: string, x: number, y: number): void { this.log("fillText", [text, x, y]); }
  measureText(text: string): { readonly width: number } {
    return { width: text.length * this.charWidth };
  }
}
