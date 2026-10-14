/**
 * How much the chart shows: "simples" (the default) or "completo". The product is for anyone who wants to make money in the crypto market, not only for
 * people who read market structure: the simple chart has the candles, the volume, the zones where buyers and sellers were and the answer of the Inonu,
 * and nothing else. Everything the expert reads (structure marks, order blocks, gaps, liquidity, flow factors, indicators, other chart kinds) is one click
 * away under "Detalhes", kept exactly as the person left it. localStorage key `inonu.chart.detail.v1`; anything that is not exactly one of the two words
 * is the default, so a hand edited or older payload never changes what a new person sees.
 */
export const CHART_DETAIL_KEY = "inonu.chart.detail.v1";

export type ChartDetail = "simples" | "completo";

export const DEFAULT_DETAIL: ChartDetail = "simples";

export function parseDetail(raw: string | null): ChartDetail {
  return raw === "completo" ? "completo" : DEFAULT_DETAIL;
}

interface Store {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function loadDetail(storage: Store | null): ChartDetail {
  if (storage === null) return DEFAULT_DETAIL;
  try {
    return parseDetail(storage.getItem(CHART_DETAIL_KEY));
  } catch {
    return DEFAULT_DETAIL;
  }
}

export function saveDetail(storage: Store | null, detail: ChartDetail): void {
  if (storage === null) return;
  try {
    storage.setItem(CHART_DETAIL_KEY, detail);
  } catch {
    // storage full or blocked: the choice lasts for the session only
  }
}

/**
 * The indicators the simple chart draws: the volume bars and nothing else. The smart money groups, the averages, the bands, the panes and the levels of the
 * old reading wait behind "Detalhes". The stored choice of the person is never rewritten by the simple chart.
 */
export const SIMPLE_INDICATORS: readonly ["volume"] = ["volume"];

/** The layers of the Inonu on the simple chart: the zones and the answer, never the flow factors (sequences, progressions, imbalances). */
export const SIMPLE_LAYERS = { zones: true, flow: false, decision: true } as const;
