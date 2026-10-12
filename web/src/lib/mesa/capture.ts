import { captureFileName } from "./topbar-model";

export type CaptureResult = "saved" | "missing" | "failed";

/** The hero chart is one canvas inside the chart slot; the largest one wins in case a panel adds a small overlay. */
export function pickChartCanvas(root: ParentNode): HTMLCanvasElement | null {
  let best: HTMLCanvasElement | null = null;
  let bestArea = 0;
  for (const canvas of root.querySelectorAll<HTMLCanvasElement>('[data-slot="grafico"] canvas')) {
    const area = canvas.width * canvas.height;
    if (area > bestArea) {
      best = canvas;
      bestArea = area;
    }
  }
  return best;
}

/** The chart under a caption strip that says what it is, when and that nothing was sent. */
export function composeCapture(source: HTMLCanvasElement, caption: string, background: string): HTMLCanvasElement | null {
  const strip = Math.max(32, Math.round(source.height * 0.05));
  const out = source.ownerDocument.createElement("canvas");
  out.width = source.width;
  out.height = source.height + strip;
  const ctx = out.getContext("2d");
  if (!ctx) return null;
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, out.width, out.height);
  ctx.drawImage(source, 0, strip);
  ctx.fillStyle = "#b6c8dc";
  ctx.font = `${Math.round(strip * 0.42)}px sans-serif`;
  ctx.textBaseline = "middle";
  ctx.fillText(caption, Math.round(strip * 0.4), Math.round(strip / 2));
  return out;
}

/** Saves the chart as a PNG on the user's machine. A local action: no network, nothing leaves the browser. */
export async function captureChart(root: Document, instId: string, nowMs: number): Promise<CaptureResult> {
  const source = pickChartCanvas(root);
  if (!source || source.width < 40 || source.height < 40) return "missing";
  const stamp = new Date(nowMs).toISOString().slice(0, 19).replace("T", " ");
  const out = composeCapture(source, `INONU TRADER  ${instId}  ${stamp} UTC  decisao consultiva do Jev, nada foi enviado`, "#0a1018");
  if (!out) return "failed";
  const blob = await new Promise<Blob | null>((resolve) => out.toBlob(resolve, "image/png"));
  if (!blob) return "failed";
  const url = URL.createObjectURL(blob);
  const link = root.createElement("a");
  link.href = url;
  link.download = captureFileName(instId, nowMs);
  link.rel = "noopener";
  root.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return "saved";
}
