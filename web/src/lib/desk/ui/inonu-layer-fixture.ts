/**
 * FIXTURE HARNESS - NOT PRODUCTION. Bundled by `bun build` through inonu-layer-fixture-serve.ts and mounted on a standalone
 * page for screenshot evidence of the Inonu chart layer (T5.7, T6.4, T7.5). Everything below is synthetic by hand: the candles,
 * the measured flow and the answer of the model. The page shows the banner "FIXTURE SINTETICO" so no screenshot can be mistaken
 * for the real desk. It is never imported by the desk and never reaches the production bundle.
 */
import type { ChartOverlay } from "../../inonu/overlay";
import type { DeskCandle } from "../types";
import { DEFAULT_PALETTE } from "./canvas";
import { drawChart } from "./draw-chart";

const BAR = 60_000;
const COUNT = 90;
const NOW = Math.floor(Date.now() / BAR) * BAR;

let seed = 7;
const rand = (): number => {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
};

const candles: DeskCandle[] = [];
let px = 100;
for (let i = 0; i < COUNT; i += 1) {
  const open = px;
  px += (rand() - 0.46) * 0.35 + Math.sin(i / 9) * 0.05;
  const close = px;
  candles.push({
    tsMs: NOW - (COUNT - 1 - i) * BAR,
    open,
    close,
    high: Math.max(open, close) + rand() * 0.18,
    low: Math.min(open, close) - rand() * 0.18,
    volBase: 5 + rand() * 20,
    volQuote: 500 + rand() * 2000,
    confirmed: i < COUNT - 1,
  });
}
const lastClose = candles[candles.length - 1]!.close;
const STEP = 0.1;
const base = Math.round((lastClose - 1.6) / STEP) * STEP;

const niveis: ChartOverlay["niveis"] = Array.from({ length: 32 }, (_, i) => {
  const baixo = Math.round((base + i * STEP) * 100) / 100;
  const hump = Math.exp(-(((i - 15) / 7) ** 2));
  const c = Math.round((6 + rand() * 10) * (0.4 + hump * 3));
  const v = Math.round((6 + rand() * 10) * (0.4 + hump * 2.4));
  const buyHeavy = i >= 6 && i <= 9;
  const sellHeavy = i >= 22 && i <= 24;
  return {
    baixo,
    alto: Math.round((baixo + STEP) * 100) / 100,
    c: buyHeavy ? c * 3 : c,
    v: sellHeavy ? v * 3 : v,
    imb: buyHeavy ? ("c" as const) : sellHeavy ? ("v" as const) : i === 13 ? ("cv" as const) : null,
    volume: i === 15 ? ("c" as const) : i === 14 ? ("n" as const) : i === 23 ? ("v" as const) : null,
    alerta: i === 8 ? { c: true, v: false } : i === 23 ? { c: false, v: true } : null,
  };
});

const at = (i: number) => niveis[i]!;
const overlay: ChartOverlay = {
  instId: "BTC-USDT",
  asOfMs: NOW,
  fonte: "okx_ws_trades",
  price: lastClose,
  atr14: 0.4,
  tickSz: "0.1",
  step: STEP,
  binTicks: 1,
  aquecimento: { fechadas: 50, necessarias: 50, pronto: true, restaurado: 0 },
  niveis,
  corridas: {
    sequencial: [{ lado: "c", baixo: at(6).baixo, alto: at(9).alto, n: 4 }, { lado: "v", baixo: at(22).baixo, alto: at(24).alto, n: 3 }],
    progressao: [{ lado: "c", baixo: at(11).baixo, alto: at(14).alto, n: 3 }],
    exaustao: [{ extremo: "baixo", baixo: at(2).baixo, alto: at(4).alto, n: 3 }],
  },
  perfil: { poc: { baixo: at(15).baixo, alto: at(15).alto }, val: at(8).baixo, vah: at(23).alto, hvn: [{ baixo: at(15).baixo, alto: at(16).alto }], lvn: [{ baixo: at(19).baixo, alto: at(19).alto }] },
  absorcao: { lado: "v", razaoVolume: 1.8 },
  zonas: [
    { id: "a1b2c3d4e5f6", lado: "demanda", baixo: at(6).baixo, alto: at(9).alto, nota: 76.4, estado: "ativa", fatores: ["E2", "E3"], idadeBarras: 12, invalidacao: at(5).baixo, primeiroTs: NOW - 40 * BAR },
    { id: "f6e5d4c3b2a1", lado: "oferta", baixo: at(22).baixo, alto: at(25).alto, nota: 61.2, estado: "testada", fatores: ["E2"], idadeBarras: 25, invalidacao: at(26).alto, primeiroTs: NOW - 65 * BAR },
  ],
};

const host = document.getElementById("stage") as HTMLElement;
const canvas = document.createElement("canvas");
host.appendChild(canvas);
const dpr = Math.min(3, Math.max(1, window.devicePixelRatio || 1));
const width = host.clientWidth;
const height = host.clientHeight;
canvas.width = Math.round(width * dpr);
canvas.height = Math.round(height * dpr);
canvas.style.width = `${width}px`;
canvas.style.height = `${height}px`;
const ctx = canvas.getContext("2d")!;
ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

const answer = new URLSearchParams(location.search).get("answer");
const decision =
  answer === "none"
    ? null
    : { action: answer === "sell" ? ("sell" as const) : answer === "hold" ? ("hold" as const) : ("buy" as const), candidateId: answer === "spot" ? "spot:BTC-USDT" : answer === "hold" ? null : "zona:a1b2c3d4e5f6", atMs: NOW - 4 * 60_000, instId: "BTC-USDT", modelo: "jev-latest" };

drawChart(ctx, {
  width,
  height,
  dpr,
  candles,
  bar: "1m",
  decimals: 2,
  last: lastClose,
  vwap: null,
  hover: null,
  palette: DEFAULT_PALETTE,
  font: '10.5px "Segoe UI", sans-serif',
  indicators: ["volume"],
  inonu: {
    overlay,
    decision,
    trail: [
      { action: "buy", candidateId: null, atMs: NOW - 52 * BAR, instId: "BTC-USDT", modelo: "jev-latest" },
      { action: "sell", candidateId: null, atMs: NOW - 30 * BAR, instId: "BTC-USDT", modelo: "jev-latest" },
    ],
    show: { zones: true, flow: true, decision: true },
    nowMs: Date.now(),
  },
});
