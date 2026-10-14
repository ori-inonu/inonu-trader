"use client";

import { type KeyboardEvent, type PointerEvent, type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { decisionMarkers, decisionScore, remapMarkersToBricks } from "@/lib/desk/chart/decisions";
import {
  type ChartPrefs,
  defaultChartPrefs,
  type IndicatorId,
  loadChartPrefs,
  RENKO_PCT_OPTIONS,
  saveChartPrefs,
  SMC_N_OPTIONS,
} from "@/lib/desk/chart/prefs";
import { analyzeSmc, smcContext, type SmcResult } from "@/lib/desk/chart/smc";
import { type ChartDetail, SIMPLE_INDICATORS } from "@/lib/desk/chart/detail";
import { useChartDetail } from "@/lib/desk/chart/detail-store";
import { smcChips, SMC_CHIPS_TITLE } from "@/lib/desk/chart/smc-chips";
import { heikinAshi, renko, renkoBrickSize, type RenkoBrick } from "@/lib/desk/chart/transforms";
import { type ChartBar, type ChartKind, toChartBars } from "@/lib/desk/chart/types";
import { BAR_MS } from "@/lib/desk/okx-parse";
import { filterWalletMarks } from "@/lib/inonu/signals";
import { useInonuLayer } from "@/lib/inonu/useInonuLayer";
import { type AssetCatalog } from "@/lib/desk/useAssetCatalog";
import type { OnchainFocus } from "@/lib/onchain/focus";
import { isOnchainBar, ONCHAIN_NO_1D } from "@/lib/onchain/useOnchainCandles";
import type { WalletMark } from "@/lib/onchain/wallet-marks";
import { fmtAgeMs, fmtUsd, onchainErrorText, walletTypeWord } from "@/lib/mesa/onchain-rows";
import type { OnchainMeta } from "@/lib/onchain/client";
import { DEFAULT_PALETTE, type DeskPalette, readPalette } from "@/lib/desk/ui/canvas";
import { type ChartGeometry, computeGeometry, drawChart, type HoverPoint } from "@/lib/desk/ui/draw-chart";
import { readAgeMs, readFreshness, type JevReadBoardState, type JevReadView } from "@/lib/jev-read";
import {
  fmtCompact,
  fmtDayMonth,
  fmtClock,
  fmtNumber,
  fmtPctPlain,
  fmtPctSigned,
  priceDecimals,
  priceDecimalsForMagnitude,
} from "@/lib/desk/ui/format";
import { useElementSize } from "@/lib/desk/ui/useElementSize";
import type { DeskBar, DeskCandle, DeskInstrument, DeskMetrics, DeskTicker } from "@/lib/desk/types";
import { InonuSignalStrip } from "../InonuSignalStrip";
import { AssetPicker } from "./AssetPicker";
import { DecisionCard } from "./DecisionCard";
import { PanelEmpty, PanelFrame } from "./PanelFrame";
import styles from "./PriceChart.module.css";

export const CHART_BARS: readonly DeskBar[] = ["1m", "5m", "15m", "1H", "4H", "1D"];
const CHART_KINDS: readonly { kind: ChartKind; label: string }[] = [
  { kind: "candles", label: "Velas" },
  { kind: "heikin", label: "Heikin Ashi" },
  { kind: "ohlc", label: "Barras" },
  { kind: "line", label: "Linha" },
  { kind: "area", label: "Area" },
  { kind: "renko", label: "Renko" },
];

/** Labels of the indicator checkboxes in the popover, in the persisted id order. */
const INDICATOR_LABELS: Record<IndicatorId, string> = {
  smStructure: "Estrutura BOS e CHoCH",
  smBlocks: "Blocos de ordem",
  smGaps: "Imbalances FVG",
  smLiquidity: "Liquidez",
  smZones: "Premium e desconto",
  smWallets: "Carteiras rastreadas (OKX)",
  ema9: "EMA 9",
  ema21: "EMA 21",
  ema50: "EMA 50",
  ema200: "EMA 200",
  bb: "Bandas de Bollinger 20/2",
  vwap: "VWAP",
  supertrend: "Supertrend 10/3",
  rsi: "RSI 14",
  macd: "MACD 12/26/9",
  volume: "Volume",
  levels: "Niveis do Inonu",
};

/** Short names of the legend line, in the persisted id order. */
const LEGEND_NAMES: Record<IndicatorId, string> = {
  smStructure: "Estrutura",
  smBlocks: "Blocos",
  smGaps: "FVG",
  smLiquidity: "Liquidez",
  smZones: "Zonas",
  smWallets: "Carteiras rastreadas (OKX)",
  ema9: "EMA 9",
  ema21: "EMA 21",
  ema50: "EMA 50",
  ema200: "EMA 200",
  bb: "BB 20",
  vwap: "VWAP",
  supertrend: "ST 10/3",
  rsi: "RSI 14",
  macd: "MACD",
  volume: "Vol",
  levels: "Niveis do Inonu",
};

/** The indicator popover is grouped: smart money first, then Jev, volume and the classics. */
const INDICATOR_GROUPS: readonly { label: string; ids: readonly IndicatorId[] }[] = [
  { label: "Smart money", ids: ["smStructure", "smBlocks", "smGaps", "smLiquidity", "smZones", "smWallets"] },
  { label: "Inonu", ids: ["levels"] },
  { label: "Volume", ids: ["volume"] },
  { label: "Classicos", ids: ["ema9", "ema21", "ema50", "ema200", "bb", "vwap", "supertrend", "rsi", "macd"] },
];

/** Smart money ids, kept in a set so the classic legend loop can skip them (their chips replace them). */
const SM_IDS: ReadonlySet<IndicatorId> = new Set(["smStructure", "smBlocks", "smGaps", "smLiquidity", "smZones", "smWallets"]);

/** The grouped checkbox list inside the Indicadores popover. Exported for render tests. The
 * wallet marks option only exists while the chart shows an on-chain token. */
export function IndicatorOptions({
  prefs,
  onToggle,
  onPivot,
  onchain = false,
}: {
  prefs: ChartPrefs;
  onToggle: (id: IndicatorId) => void;
  onPivot: (n: number) => void;
  onchain?: boolean;
}) {
  return (
    <>
      {INDICATOR_GROUPS.map((group) => (
        <div key={group.label} className={styles.indGroup}>
          <div className={styles.indGroupTitle}>{group.label}</div>
          {group.ids
            .filter((id) => id !== "smWallets" || onchain)
            .map((id) => (
            <label key={id} className={styles.indOption}>
              <input type="checkbox" checked={prefs.indicators.includes(id)} onChange={() => onToggle(id)} />
              <span>{INDICATOR_LABELS[id]}</span>
            </label>
          ))}
          {group.label === "Smart money" ? (
            <label className={styles.indOption}>
              <span>Pivo</span>
              <select className={styles.indSelect} aria-label="Forca do pivo smart money" value={prefs.smc.n} onChange={(e) => onPivot(Number(e.target.value))}>
                {SMC_N_OPTIONS.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
        </div>
      ))}
    </>
  );
}

/** The smart money context chips inside the legend strip. Exported for render tests. */
export function SmcChipGroup({ chips }: { chips: readonly { id: string; text: string; title: string; tone: string }[] }) {
  return (
    <span className={styles.smcGroup} title={SMC_CHIPS_TITLE}>
      {chips.map((chip) => (
        <span key={chip.id} className={styles.smcChip} data-tone={chip.tone} title={chip.title}>
          {chip.text}
        </span>
      ))}
    </span>
  );
}

/** Renko size selector options: ATR plus the four percent sizes of the spec ("0,1%" .. "1%"). */
const RENKO_SIZE_OPTIONS: readonly { value: string; label: string; mode: "atr" | "pct"; pct: number }[] = [
  { value: "atr", label: "ATR", mode: "atr", pct: 0 },
  ...RENKO_PCT_OPTIONS.map((pct) => ({
    value: `pct:${pct}`,
    label: `${String(pct).replace(".", ",")}%`,
    mode: "pct" as const,
    pct,
  })),
];

const FALLBACK = { width: 480, height: 300 };
const FONT_SIZE = "10.5px";
const FALLBACK_FAMILY = "ui-monospace, SFMono-Regular, Menlo, monospace";
/** A pointer within this distance of a decision glyph opens its card. */
const MARKER_HIT_PX = 10;

/** Jev board slice the chart needs to anchor decisions and write the header line. */
export interface ChartJevInput {
  readonly board: JevReadBoardState["board"];
  readonly status: JevReadBoardState["status"];
  /** Exchange clock minus browser clock, or null when the exchange clock is unknown. */
  readonly browserSkewMs: number | null;
  /** Current instant on the exchange clock, or null when it cannot be estimated. */
  readonly nowExchangeMs: number | null;
  /** Reads with a real decision kept past the board's recent window. */
  readonly history?: readonly JevReadView[];
}

export interface PriceChartProps {
  /** Oldest first. The last one may still be forming. */
  candles: readonly DeskCandle[];
  bar: DeskBar;
  metrics: DeskMetrics;
  ticker: DeskTicker | null;
  /** Source of the price decimals. When null they are derived from the price magnitude. */
  instrument?: DeskInstrument | null;
  onBarChange?: (bar: DeskBar) => void;
  stale?: boolean;
  reducedMotion?: boolean;
  /** Instrument in focus, shown by the asset picker and used to anchor Jev reads. */
  focus?: string;
  onAssetSelect?: (instId: string) => void;
  /** Asset catalog for the picker; the picker renders only when provided. */
  catalog?: AssetCatalog | null;
  /** Jev board slice. When omitted the header reads that the reads are unavailable. */
  jev?: ChartJevInput | null;
  /** Test and fixture hook: initial prefs before localStorage is read on mount. */
  initialPrefs?: ChartPrefs;
  /** The first view: "simples" unless a test or a page asks for the whole chart. The saved choice of the person replaces it after mount. */
  initialDetail?: ChartDetail;
  /**
   * On-chain mode (CHN-2/3/4): the candles, ticker and metrics props then carry the token's
   * OnchainOS data, Jev markers and levels never draw, and the strip under the toolbar states the
   * origin, the age and that Jev does not read this asset.
   */
  onchain?: PriceChartOnchain | null;
  /**
   * The picker's on-chain capabilities, present in BOTH modes: without it the chain row never
   * renders and the user cannot reach on-chain mode from the chart toolbar at all.
   */
  onchainPicker?: OnchainPickerProps | null;
  /**
   * The legend of the chart: the quote of the instrument and, in the simple desk, what the code has read (who is in charge, how many conditions line up, what the Inonu last said).
   * It sits under the toolbar as one block with the chart, the way a charting platform keeps its legend, and replaces the old "Mercado em foco" card. The 24h change of the toolbar
   * gives way to it, since the legend already carries it.
   */
  legend?: ReactNode;
}

/**
 * The on-chain mode of the chart: the caller feeds the candles, ticker and metrics props with
 * values derived from the OnchainOS candles; this object only carries what the mode itself owns.
 */
export interface PriceChartOnchain {
  readonly focus: OnchainFocus;
  /** Display name of the network, e.g. "Ethereum". */
  readonly chainName: string;
  /** Feed state of the candle resource: drives the loading, error and empty copies. */
  readonly status: "idle" | "loading" | "ready" | "error";
  readonly error: string | null;
  readonly meta: OnchainMeta | null;
  /** Tracked-wallet marks indexed by candle, or null while the signals have not answered. */
  readonly wallets: ReadonlyMap<number, readonly WalletMark[]> | null;
  /** Extra props for the embedded asset picker (chains, token search and trending). */
  readonly picker?: OnchainPickerProps;
  readonly onBack?: () => void;
}

/** What the AssetPicker needs to offer networks, trending tokens and the search. */
export interface OnchainPickerProps {
  readonly client: import("@/lib/onchain/client").OnchainClient;
  /** Persisted network, or null when the user last chose the OKX source. */
  readonly chainIndex: string | null;
  readonly onChainSelect: (chainIndex: string) => void;
  readonly onSelectToken: (token: OnchainFocus) => void;
}

function candleTime(c: { tsMs: number }, bar: DeskBar): string {
  return bar === "1D" ? fmtDayMonth(c.tsMs) : `${fmtDayMonth(c.tsMs)} ${fmtClock(c.tsMs)}`;
}

function candleChangePct(c: { open: number; close: number }): number | null {
  return c.open > 0 ? ((c.close - c.open) / c.open) * 100 : null;
}

/** Color tone of a percent change. A change that prints as 0,00% carries no color. */
function toneOfPct(v: number | null): "up" | "down" | "none" {
  if (v === null || Math.abs(v) < 0.005) return "none";
  return v > 0 ? "up" : "down";
}

/** Every read held for one instrument: board recent, board latest and the persisted history, deduplicated. */
function jevReadsFor(board: ChartJevInput["board"], history: readonly JevReadView[] | undefined, instId: string): JevReadView[] {
  const seen = new Set<string>();
  const out: JevReadView[] = [];
  for (const read of board?.recent ?? []) {
    if (read.instId !== instId || seen.has(read.readId)) continue;
    seen.add(read.readId);
    out.push(read);
  }
  const latest = board?.reads[instId];
  if (latest !== undefined && !seen.has(latest.readId)) {
    seen.add(latest.readId);
    out.push(latest);
  }
  for (const read of history ?? []) {
    if (read.instId !== instId || seen.has(read.readId)) continue;
    seen.add(read.readId);
    out.push(read);
  }
  out.sort((a, b) => b.atMs - a.atMs);
  return out;
}

/**
 * The desk's hero chart: candles, OHLC bars, line or area on a DPR aware canvas, with volume,
 * VWAP, the last price and every real Jev decision drawn as a marker plus a lane under the
 * price pane. Hovering near a glyph or focusing it with the bracket keys opens the decision
 * card; the arrow keys keep the candle crosshair of before. Only reads with a real decision
 * become markers: an observe-mode read draws nothing.
 */
export function PriceChart({
  candles,
  bar,
  metrics,
  ticker,
  instrument = null,
  onBarChange,
  stale = false,
  focus,
  onAssetSelect,
  catalog = null,
  jev = null,
  initialPrefs,
  initialDetail,
  onchain = null,
  onchainPicker = null,
  legend = null,
}: PriceChartProps) {
  const [wrapRef, size] = useElementSize<HTMLDivElement>(FALLBACK);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const geomRef = useRef<ChartGeometry | null>(null);
  const paletteRef = useRef<DeskPalette>(DEFAULT_PALETTE);
  const familyRef = useRef(FALLBACK_FAMILY);
  const [hover, setHover] = useState<HoverPoint | null>(null);
  /** Index into `markers` of the decision whose card is open. */
  const [cardMarker, setCardMarker] = useState<number | null>(null);
  const [fontsReady, setFontsReady] = useState(0);
  const [storedPrefs, setPrefs] = useState(() => initialPrefs ?? defaultChartPrefs());
  const [prefsLoaded, setPrefsLoaded] = useState(false);
  // "simples" (the default) draws candles, volume, zones and the answer of the Inonu; "completo" draws what the person stored. The simple chart never
  // rewrites the stored choice: the preferences below are only what is drawn now.
  // one choice for the whole desk (the thermometer and the side panels read it too); a test or a page can force the first view
  const [storedDetail, setStoredDetail] = useChartDetail();
  const detail = initialDetail ?? storedDetail;
  const simple = detail === "simples";
  const prefs = useMemo(
    () => (simple ? { ...storedPrefs, kind: "candles" as const, indicators: [...SIMPLE_INDICATORS] as IndicatorId[] } : storedPrefs),
    [simple, storedPrefs],
  );
  const [indOpen, setIndOpen] = useState(false);
  const indButtonRef = useRef<HTMLButtonElement | null>(null);

  const hasData = candles.length > 0;
  const lastCandle = hasData ? candles[candles.length - 1] : null;
  const last = ticker?.last ?? lastCandle?.close ?? null;
  const decimals = priceDecimals(instrument?.tickSz, priceDecimalsForMagnitude(last));
  const vwap = metrics.vwap;
  const instId = focus ?? instrument?.instId ?? ticker?.instId ?? "";
  const kind = prefs.kind;
  // The Inonu layers (zones, flow, the model's answer) and the signal filters; OKX instruments only, never Renko bricks.
  const inonu = useInonuLayer(instId, onchain === null && kind !== "renko", simple);
  const walletMarks = useMemo(
    () => (onchain !== null && kind !== "renko" && prefs.indicators.includes("smWallets") && onchain.wallets ? filterWalletMarks(onchain.wallets, inonu.filters) : undefined),
    [onchain, kind, prefs.indicators, inonu.filters],
  );

  // Read persisted prefs only after mount so the SSR markup is always the default one.
  useEffect(() => {
    setPrefs(loadChartPrefs(typeof window === "undefined" ? null : window.localStorage));
    setPrefsLoaded(true);
  }, []);

  const timeMarkers = useMemo(
    () =>
      decisionMarkers({
        reads: jevReadsFor(jev?.board ?? null, jev?.history, instId),
        instId,
        candles,
        bar,
        browserSkewMs: jev?.browserSkewMs ?? null,
        nowExchangeMs: jev?.nowExchangeMs ?? null,
      }),
    [jev, instId, candles, bar],
  );

  /**
   * The drawn bar series, the h/l/c rows the indicators run on and the Renko bricks.
   * Heikin Ashi draws transformed bars but indicators and markers stay on the real candles;
   * Renko draws bricks on integer levels, indicators run on the bricks and markers remap.
   */
  const series = useMemo((): {
    bars: readonly ChartBar[];
    source: readonly { high: number; low: number; close: number }[];
    bricks: readonly RenkoBrick[] | null;
    renkoSize: number | null;
  } => {
    if (kind === "heikin") {
      const ha = heikinAshi(candles);
      return {
        bars: candles.map((c, i) => ({ tsMs: c.tsMs, open: ha[i]!.open, high: ha[i]!.high, low: ha[i]!.low, close: ha[i]!.close, volBase: c.volBase, confirmed: c.confirmed, sourceIndex: i })),
        source: candles,
        bricks: null,
        renkoSize: null,
      };
    }
    if (kind === "renko") {
      const size = renkoBrickSize(candles, prefs.renko.mode, prefs.renko.pct);
      if (size === null) return { bars: [], source: candles, bricks: null, renkoSize: null };
      let bricks: RenkoBrick[];
      try {
        bricks = renko(candles.map((c) => c.close), candles.map((c) => c.tsMs), size);
      } catch {
        return { bars: [], source: candles, bricks: null, renkoSize: null };
      }
      const bars = bricks.map<ChartBar>((b) => ({
        tsMs: b.tsMs,
        open: b.open,
        high: Math.max(b.open, b.close),
        low: Math.min(b.open, b.close),
        close: b.close,
        volBase: 0,
        confirmed: true,
        sourceIndex: b.sourceIndex,
      }));
      return { bars, source: bars, bricks, renkoSize: size };
    }
    return { bars: toChartBars(candles), source: candles, bricks: null, renkoSize: null };
  }, [kind, candles, prefs.renko]);

  // On-chain mode draws no Jev decision layer at all: Jev never reads this asset.
  const markers = useMemo(
    () => (onchain !== null ? [] : series.bricks !== null ? remapMarkersToBricks(timeMarkers, series.bricks, BAR_MS[bar]) : timeMarkers),
    [timeMarkers, series.bricks, bar, onchain],
  );

  // The smart money reading runs on the REAL confirmed candles of the focus, never on the Heikin
  // Ashi transform or the Renko bricks, and the forming bar stays out of the series. It recomputes
  // only when the confirmed series, the focus, the bar or the pivot strength changes, not per tick:
  // the price fed to analyzeSmc comes through a ref so live ticks do not invalidate the memo.
  const lastRef = useRef<number | null>(null);
  lastRef.current = last;
  const smcCacheRef = useRef<{ key: string; result: SmcResult | null; confirmed: number }>({ key: "", result: null, confirmed: 0 });
  // Cheap every render: a scan for the confirmed count and last confirmed timestamp. The heavy
  // analyzeSmc call only runs when that key changes (or n, focus or bar does).
  let confirmedCount = 0;
  let lastConfirmedTs = 0;
  for (const c of candles) {
    if (c.confirmed) {
      confirmedCount += 1;
      lastConfirmedTs = c.tsMs;
    }
  }
  const smcKey = `${instId}|${bar}|${prefs.smc.n}|${confirmedCount}|${lastConfirmedTs}`;
  if (smcCacheRef.current.key !== smcKey) {
    let result: SmcResult | null = null;
    if (confirmedCount > 0) {
      const conf = candles.filter((c) => c.confirmed);
      const price = lastRef.current ?? conf[conf.length - 1]!.close;
      result = analyzeSmc(
        conf.map((c) => c.open),
        conf.map((c) => c.high),
        conf.map((c) => c.low),
        conf.map((c) => c.close),
        prefs.smc.n,
        price,
      );
    }
    smcCacheRef.current = { key: smcKey, result, confirmed: confirmedCount };
  }
  const smc = smcCacheRef.current;

  const smcShow = useMemo(
    () => ({
      structure: prefs.indicators.includes("smStructure"),
      blocks: prefs.indicators.includes("smBlocks"),
      gaps: prefs.indicators.includes("smGaps"),
      liquidity: prefs.indicators.includes("smLiquidity"),
      zones: prefs.indicators.includes("smZones"),
    }),
    [prefs.indicators],
  );
  const smcAnyOn = smcShow.structure || smcShow.blocks || smcShow.gaps || smcShow.liquidity || smcShow.zones;
  const smcInput = useMemo(
    () => (kind !== "renko" && smc.result !== null ? { result: smc.result, show: smcShow } : undefined),
    [kind, smc, smcShow],
  );

  /** Context chips: the descriptive digest recomputed against the live last price (cheap). The
   * strip only exists while at least one smart money group is on. */
  const smcChipData = useMemo(() => {
    if (kind === "renko" || !smcAnyOn || smc.result === null || smc.confirmed < 10) return null;
    const px = last ?? lastCandle?.close ?? 0;
    return smcChips(smcContext(smc.result, px), bar);
  }, [kind, smcAnyOn, smc, last, lastCandle, bar]);

  /**
   * The focused read's Jev computed levels: drawn only while the read is fresh or merely late. A stale read or
   * an age that cannot be computed draws nothing, and the analysis itself is already validated by the parser.
   */
  const jevLevels = useMemo(() => {
    if (onchain !== null || !prefs.indicators.includes("levels")) return null;
    const read = jev?.board?.reads[instId];
    const levels = read?.state?.analysis?.structure?.levels;
    if (read === undefined || read === null || levels === undefined || levels.length === 0) return null;
    const freshness = readFreshness(readAgeMs(read, Date.now(), jev?.browserSkewMs ?? null));
    if (freshness === "stale" || freshness === "unknown") return null;
    const ageSec = read.state?.analysis?.ageSec ?? null;
    return { levels, ageSec };
  }, [jev, instId, prefs.indicators, onchain]);

  const jevLine = useMemo(() => {
    const board = jev?.board ?? null;
    const status = jev?.status ?? "idle";
    if (board === null || status === "idle" || status === "loading") return "Leituras do Inonu indisponiveis";
    const score = decisionScore(markers);
    if (markers.length > 0 || board.reads[instId]) return score.text;
    return "O Inonu nao le este mercado";
  }, [jev, instId, markers]);

  // Redraw once the web fonts are in, so the first canvas text does not stay in the fallback face.
  useEffect(() => {
    if (typeof document === "undefined" || !document.fonts) return;
    let live = true;
    void document.fonts.ready.then(() => {
      if (live) setFontsReady((n) => n + 1);
    });
    return () => {
      live = false;
    };
  }, []);

  // Hover and card indexes belong to one drawn series: drop them when it or the instrument changes.
  useEffect(() => {
    setHover((h) => (h && h.index < series.bars.length ? h : null));
  }, [series]);
  useEffect(() => {
    setHover(null);
    setCardMarker(null);
  }, [bar, instId, kind]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !hasData || size.width < 40 || size.height < 40) return;
    const id = requestAnimationFrame(() => {
      const dpr = Math.min(3, Math.max(1, window.devicePixelRatio || 1));
      const w = Math.round(size.width * dpr);
      const h = Math.round(size.height * dpr);
      if (canvas.width !== w) canvas.width = w;
      if (canvas.height !== h) canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      paletteRef.current = readPalette(canvas);
      const family = getComputedStyle(canvas).fontFamily;
      if (family) familyRef.current = family;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      geomRef.current = drawChart(ctx, {
        width: size.width,
        height: size.height,
        dpr,
        candles: series.bars,
        bar,
        decimals,
        last,
        vwap,
        hover,
        palette: paletteRef.current,
        font: `${FONT_SIZE} ${familyRef.current}`,
        kind,
        markers,
        indicators: prefs.indicators,
        indicatorSource: series.source,
        levels: jevLevels?.levels,
        smc: smcInput,
        // Renko bricks do not align 1:1 with the candles the marks were indexed against.
        wallets: walletMarks,
        inonu: inonu.layer ?? undefined,
      });
    });
    return () => cancelAnimationFrame(id);
  }, [series, bar, decimals, last, vwap, hover, size, hasData, fontsReady, kind, markers, prefs.indicators, jevLevels, smcInput, walletMarks, inonu.layer]);

  const geometry = useMemo(
    () =>
      computeGeometry({
        width: size.width,
        height: size.height,
        dpr: 1,
        candles: series.bars,
        bar,
        decimals,
        last,
        vwap,
        hover: null,
        palette: DEFAULT_PALETTE,
        font: "",
        kind,
        markers,
        indicators: prefs.indicators,
        indicatorSource: series.source,
        levels: jevLevels?.levels,
      }),
    [size, series, bar, decimals, last, vwap, kind, markers, prefs.indicators, jevLevels],
  );

  /** Glyph screen position of the decision whose card is open, or null. */
  const cardPoint = cardMarker === null ? null : (geometry.markerPoints.find((p) => p.markerIndex === cardMarker) ?? null);

  /** The nearest decision glyph to a pointer position, inside the hit radius, or null. */
  function markerAt(x: number, y: number): { markerIndex: number; x: number; y: number } | null {
    const geom = geomRef.current ?? geometry;
    let best: { markerIndex: number; x: number; y: number } | null = null;
    let bestD = MARKER_HIT_PX;
    for (const p of geom.markerPoints) {
      const d = Math.hypot(p.x - x, p.y - y);
      if (d <= bestD) {
        bestD = d;
        best = { markerIndex: p.markerIndex, x: p.x, y: p.y };
      }
    }
    return best;
  }

  function pointAt(event: PointerEvent<HTMLDivElement>): void {
    const geom = geomRef.current ?? geometry;
    const x = event.nativeEvent.offsetX;
    const y = event.nativeEvent.offsetY;
    const index = geom.indexAt(x);
    if (index === null) return;
    setHover((h) => (h && h.index === index && h.y !== null && Math.abs(h.y - y) < 1 ? h : { index, y }));
    const near = markerAt(x, y);
    if (near !== null) setCardMarker(near.markerIndex);
  }

  /** Jump to the next or previous visible decision glyph and open its card. */
  function stepMarker(direction: 1 | -1): void {
    const points = geometry.markerPoints;
    if (points.length === 0) return;
    const at = cardMarker === null ? -1 : points.findIndex((p) => p.markerIndex === cardMarker);
    const next = points[at === -1 ? (direction === 1 ? 0 : points.length - 1) : (at + direction + points.length) % points.length];
    if (!next) return;
    setCardMarker(next.markerIndex);
    const marker = markers[next.markerIndex];
    if (marker) setHover({ index: marker.barIndex, y: next.priceY });
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    if (!hasData) return;
    const geom = geomRef.current ?? geometry;
    const first = geom.firstIndex;
    const lastIndex = series.bars.length - 1;
    const current = hover?.index ?? lastIndex;
    let next: number | null = null;
    if (event.key === "ArrowLeft") next = Math.max(first, current - 1);
    else if (event.key === "ArrowRight") next = Math.min(lastIndex, current + 1);
    else if (event.key === "Home") next = first;
    else if (event.key === "End") next = lastIndex;
    else if (event.key === "[") {
      event.preventDefault();
      stepMarker(-1);
      return;
    } else if (event.key === "]") {
      event.preventDefault();
      stepMarker(1);
      return;
    } else if (event.key === "Escape") {
      if (cardMarker !== null) setCardMarker(null);
      else setHover(null);
      return;
    }
    if (next === null) return;
    event.preventDefault();
    setHover({ index: next, y: null });
  }

  function patchPrefs(patch: Partial<typeof prefs>): void {
    setPrefs((p) => {
      const updated = { ...p, ...patch };
      if (prefsLoaded) saveChartPrefs(typeof window === "undefined" ? null : window.localStorage, updated);
      return updated;
    });
  }

  function selectKind(next: ChartKind): void {
    patchPrefs({ kind: next });
  }

  function toggleIndicator(id: IndicatorId): void {
    const on = prefs.indicators.includes(id);
    patchPrefs({ indicators: on ? prefs.indicators.filter((i) => i !== id) : [...prefs.indicators, id] });
  }

  function selectRenkoSize(value: string): void {
    const option = RENKO_SIZE_OPTIONS.find((o) => o.value === value);
    if (!option) return;
    patchPrefs({ renko: option.mode === "atr" ? { mode: "atr", pct: prefs.renko.pct } : { mode: "pct", pct: option.pct } });
  }

  const isRenko = kind === "renko";
  // A computable size can still produce no brick on a flat series: same honest empty state.
  const renkoUnavailable = isRenko && (series.renkoSize === null || series.bars.length === 0);
  // The readout shows the REAL candle for time based kinds (Heikin Ashi included); for Renko the
  // hovered brick itself, whose open, close and completion time are what the spec asks for.
  const shownBar = hover && hover.index < series.bars.length ? series.bars[hover.index] : (series.bars[series.bars.length - 1] ?? null);
  const shown = isRenko ? shownBar : hover && hover.index < candles.length ? candles[hover.index] : lastCandle;
  const shownChange = shown ? candleChangePct(shown) : null;
  const forming = !isRenko && shown ? !shown.confirmed : false;
  const inspecting = Boolean(hover && shown);

  /** Tracked-wallet purchases of the candle under the cursor, in the exact readout words. */
  const walletNote = (() => {
    if (onchain === null || isRenko || hover === null) return null;
    const marks = onchain.wallets?.get(hover.index);
    if (!marks || marks.length === 0) return null;
    const parts = marks.map((m) => `${walletTypeWord(m.walletType)} x${fmtNumber(m.count, 0)}, ${fmtUsd(m.amountUsd)}, vendido ${fmtPctPlain(m.soldPct, 0)}`);
    return `Carteiras rastreadas compraram: ${parts.join("; ")}`;
  })();
  const card = cardPoint !== null && cardMarker !== null ? markers[cardMarker] ?? null : null;
  const summary = shown
    ? isRenko
      ? `${inspecting ? "Tijolo inspecionado" : "Ultimo tijolo"} ${candleTime(shown, bar)}: abertura ${fmtNumber(shown.open, decimals)}, fechamento ${fmtNumber(shown.close, decimals)}.`
      : `${inspecting ? "Vela inspecionada" : "Ultima vela"} ${candleTime(shown, bar)}: abertura ${fmtNumber(shown.open, decimals)}, maxima ${fmtNumber(shown.high, decimals)}, minima ${fmtNumber(shown.low, decimals)}, fechamento ${fmtNumber(shown.close, decimals)}, volume ${fmtCompact(shown.volBase)}${forming ? ", vela em formacao" : ""}.`
    : "Sem velas.";

  const selector = (
    <div className={styles.bars} role="group" aria-label="Intervalo das velas">
      {CHART_BARS.map((b) => {
        const noBar = onchain !== null && !isOnchainBar(b);
        return (
          <button
            key={b}
            type="button"
            className={styles.barButton}
            aria-pressed={b === bar}
            disabled={!onBarChange || noBar}
            title={noBar ? ONCHAIN_NO_1D : undefined}
            onClick={() => onBarChange?.(b)}
          >
            {b}
          </button>
        );
      })}
    </div>
  );

  const kinds = (
    <div className={styles.bars} role="group" aria-label="Tipo do grafico">
      {CHART_KINDS.map((t) => (
        <button
          key={t.kind}
          type="button"
          className={styles.barButton}
          aria-pressed={t.kind === kind}
          onClick={() => selectKind(t.kind)}
        >
          {t.label}
        </button>
      ))}
    </div>
  );

  const renkoSelectValue =
    prefs.renko.mode === "pct" && RENKO_SIZE_OPTIONS.some((o) => o.value === `pct:${prefs.renko.pct}`) ? `pct:${prefs.renko.pct}` : "atr";
  const renkoSizeLabel =
    series.renkoSize === null
      ? null
      : `Tijolo ${fmtNumber(series.renkoSize, decimals)} (${prefs.renko.mode === "atr" ? "ATR" : `${String(prefs.renko.pct).replace(".", ",")}%`})`;

  const renkoControls = isRenko ? (
    <div className={styles.renkoControls}>
      <select
        className={styles.renkoSelect}
        aria-label="Tamanho do tijolo Renko"
        value={renkoSelectValue}
        onChange={(e) => selectRenkoSize(e.target.value)}
      >
        {RENKO_SIZE_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {renkoSizeLabel !== null ? <span className={styles.renkoSize}>{renkoSizeLabel}</span> : null}
    </div>
  ) : null;

  const setDetail = (next: ChartDetail) => {
    setIndOpen(false);
    setStoredDetail(next);
  };
  // one switch between the chart for anyone and the chart with everything the specialist reads
  const detailButton = (
    <button
      type="button"
      className={styles.barButton}
      aria-pressed={!simple}
      title={simple ? "Mostrar tudo: estrutura, blocos, indicadores e outros tipos de grafico" : "Voltar ao grafico simples"}
      onClick={() => setDetail(simple ? "completo" : "simples")}
    >
      {simple ? "Detalhes" : "Simples"}
    </button>
  );
  const indicatorsButton = (
    <div className={styles.indicators}>
      <button
        ref={indButtonRef}
        type="button"
        className={styles.barButton}
        aria-haspopup="dialog"
        aria-expanded={indOpen}
        onClick={() => setIndOpen((o) => !o)}
      >
        Indicadores
      </button>
      {indOpen ? (
        <>
          <div className={styles.indBackdrop} onClick={() => setIndOpen(false)} aria-hidden="true" />
          <div
            className={styles.indPopover}
            role="dialog"
            aria-label="Indicadores"
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.preventDefault();
                setIndOpen(false);
                indButtonRef.current?.focus();
              }
            }}
          >
            <IndicatorOptions prefs={prefs} onToggle={toggleIndicator} onPivot={(n) => patchPrefs({ smc: { n } })} onchain={onchain !== null} />
          </div>
        </>
      ) : null}
    </div>
  );

  const jevReads = useMemo(() => new Set(Object.keys(jev?.board?.reads ?? {})), [jev?.board]);

  /** Value of one indicator at the bar under inspection, or at the newest bar without a hover. */
  const legendIndex = hover && hover.index < series.bars.length ? hover.index : series.bars.length - 1;
  const legendItems = useMemo(() => {
    if (legendIndex < 0) return [] as string[];
    const ind = geometry.indicators;
    const dash = "--";
    const px = (v: number | null | undefined): string => (typeof v === "number" && Number.isFinite(v) ? fmtNumber(v, decimals) : dash);
    const parts: string[] = [];
    for (const id of geometry.activeIndicators) {
      if (id === "smWallets") {
        // Tracked-wallet buys have no numeric value: the legend names the layer.
        if (onchain !== null) parts.push("Carteiras rastreadas (OKX)");
        continue;
      }
      // Smart money groups speak through the context chips, not a numeric value here.
      if (SM_IDS.has(id)) continue;
      if (id === "levels") {
        const age = jevLevels?.ageSec ?? null;
        const ago = age === null ? "" : age < 60 ? ` ha ${age} s` : ` ha ${Math.round(age / 60)} min`;
        parts.push(jevLevels === null ? "Niveis do Inonu --" : `Niveis do Inonu (calculados, nao sao decisao)${ago}`);
        continue;
      }
      let value = dash;
      if (id === "ema9") value = px(ind.ema9?.[legendIndex]);
      else if (id === "ema21") value = px(ind.ema21?.[legendIndex]);
      else if (id === "ema50") value = px(ind.ema50?.[legendIndex]);
      else if (id === "ema200") value = px(ind.ema200?.[legendIndex]);
      else if (id === "bb") value = px(ind.bb?.mid[legendIndex]);
      else if (id === "supertrend") value = px(ind.supertrend?.line[legendIndex]);
      else if (id === "rsi") value = px(ind.rsi?.[legendIndex]);
      else if (id === "macd") value = px(ind.macd?.macd[legendIndex]);
      else if (id === "vwap") value = px(vwap);
      else if (id === "volume") value = shown ? fmtCompact(shown.volBase) : dash;
      parts.push(`${LEGEND_NAMES[id]} ${value}`);
    }
    return parts;
  }, [geometry, legendIndex, decimals, vwap, shown, jevLevels, onchain]);

  return (
    <PanelFrame
      title={onchain !== null ? `Grafico on-chain ${onchain.focus.symbol}` : "Grafico"}
      subtitle={onchain !== null ? `(${onchain.chainName})` : instId || null}
      stale={stale || onchain?.meta?.stale === true}
      empty={!hasData}
    >
      <div className={styles.root}>
        <div className={styles.toolbar}>
          <div className={styles.toolbarLeft}>
            {catalog !== null && onAssetSelect ? (
              <AssetPicker
                focus={instId}
                catalog={catalog}
                jevReads={jevReads}
                onSelect={onAssetSelect}
                onchainFocus={onchain?.focus ?? null}
                onchain={onchainPicker ?? onchain?.picker ?? null}
              />
            ) : null}
            {selector}
          </div>
          <div className={styles.toolbarRight}>
            {simple ? null : renkoControls}
            {simple ? null : indicatorsButton}
            {simple ? null : kinds}
            {legend === null ? (
              <span className={styles.change} data-tone={toneOfPct(metrics.change24hPct)}>
                <span className={styles.micro}>24h</span> {fmtPctSigned(metrics.change24hPct)}
              </span>
            ) : null}
            {detailButton}
          </div>
        </div>
        {legend !== null ? <div className={styles.legendSlot}>{legend}</div> : null}
        {simple && !inspecting ? null : (
        <div className={styles.readout}>
          {onchain === null && !simple ? <span className={styles.jevLine}>{jevLine}</span> : null}
          {walletNote !== null ? <span className={styles.walletNote}>{walletNote}</span> : null}
          <span className={styles.ohlcv} aria-hidden={!hasData}>
            {shown ? (
              isRenko ? (
                <>
                  <span className={styles.when}>{candleTime(shown, bar)}</span>
                  <span><span className={styles.k}>O</span>{fmtNumber(shown.open, decimals)}</span>
                  <span><span className={styles.k}>C</span>{fmtNumber(shown.close, decimals)}</span>
                </>
              ) : (
              <>
                <span className={styles.when}>{candleTime(shown, bar)}</span>
                {kind === "heikin" ? <span className={styles.haTag}>HA</span> : null}
                <span><span className={styles.k}>O</span>{fmtNumber(shown.open, decimals)}</span>
                <span><span className={styles.k}>H</span>{fmtNumber(shown.high, decimals)}</span>
                <span><span className={styles.k}>L</span>{fmtNumber(shown.low, decimals)}</span>
                <span><span className={styles.k}>C</span>{fmtNumber(shown.close, decimals)}</span>
                <span><span className={styles.k}>Vol</span>{fmtCompact(shown.volBase)}</span>
                <span className={styles.delta} data-tone={toneOfPct(shownChange)}>
                  {fmtPctSigned(shownChange)}
                </span>
                {forming ? <span className={styles.forming}>em formacao</span> : null}
              </>
              )
            ) : (
              <span className={styles.when}>OHLCV indisponivel</span>
            )}
          </span>
        </div>
        )}
        {!simple && (legendItems.length > 0 || smcChipData !== null || (isRenko && smcAnyOn)) ? (
          <div className={styles.legend} aria-label="Indicadores ativos">
            {isRenko && smcAnyOn ? (
              <SmcChipGroup chips={[{ id: "renko", text: "Smart money indisponivel no Renko", title: SMC_CHIPS_TITLE, tone: "neutral" }]} />
            ) : smcChipData !== null && smcChipData.length > 0 ? (
              <SmcChipGroup chips={smcChipData} />
            ) : null}
            {legendItems.map((item) => (
              <span key={item} className={styles.legendItem}>
                {item}
              </span>
            ))}
          </div>
        ) : null}
        {!simple && hasData && (onchain !== null || !isRenko) ? (
          <InonuSignalStrip mode={onchain !== null ? "onchain" : "okx"} filters={inonu.filters} onChange={inonu.setFilters} feed={onchain !== null ? null : inonu.feed} />
        ) : null}
        <div
          ref={wrapRef}
          className={styles.plot}
          tabIndex={hasData ? 0 : -1}
          role="group"
          aria-label="Grafico. Setas inspecionam as velas, colchetes vao de decisao em decisao do Inonu."
          onPointerMove={(e) => {
            if (hasData) pointAt(e);
          }}
          onPointerDown={(e) => {
            if (!hasData) return;
            if (e.pointerType !== "mouse") pointAt(e);
            else if (markerAt(e.nativeEvent.offsetX, e.nativeEvent.offsetY) === null) setCardMarker(null);
          }}
          onPointerLeave={(e) => {
            if (e.pointerType === "mouse") {
              setHover(null);
              setCardMarker(null);
            }
          }}
          onPointerCancel={() => {
            setHover(null);
            setCardMarker(null);
          }}
          onKeyDown={onKeyDown}
        >
          {onchain !== null ? (
            <div className={styles.onchainStrip} role="note">
              <span className={styles.onchainBadge}>
                On-chain, via OnchainOS{onchain.meta ? `, ${fmtAgeMs(onchain.meta.ageMs)}` : ""}
              </span>
              {onchain.meta?.stale === true ? <span className={styles.staleBadge}>Dado velho</span> : null}
              <span className={styles.onchainNote}>Sem WebSocket no plano gratuito</span>
              {onchain.onBack ? (
                <button type="button" className={styles.onchainBack} onClick={onchain.onBack}>
                  Voltar para OKX
                </button>
              ) : null}
            </div>
          ) : null}
          {hasData && !renkoUnavailable ? (
            <canvas ref={canvasRef} className={styles.canvas} aria-hidden="true" />
          ) : (
            <PanelEmpty>
              {onchain !== null
                ? onchain.status === "error"
                  ? onchainErrorText(onchain.error ?? "bad_request").text
                  : onchain.status === "ready"
                    ? "Sem velas para este token nesta barra"
                    : "Carregando velas on-chain"
                : renkoUnavailable
                  ? "Renko indisponivel: poucas velas confirmadas"
                  : undefined}
            </PanelEmpty>
          )}
          {card !== null && cardPoint !== null ? (
            <DecisionCard marker={card} x={cardPoint.x} y={cardPoint.y} plotWidth={size.width} plotHeight={size.height} decimals={decimals} />
          ) : null}
          <p className="srOnly">{summary}</p>
        </div>
      </div>
    </PanelFrame>
  );
}
