/**
 * "Perguntar ao Inonu" in the Rastreador (RAS-5): a sentence becomes a filter. The model is given the sentence and a CLOSED set of
 * questions, each with fixed options and a plain meaning for every option; it never writes a number or a field name. What comes
 * back is one option per question, and this code builds the filter from them. Anything that is not exactly one of the offered
 * options (an unknown option, a missing question, an extra key, a word of the model's own) is no filter at all.
 *
 * The state the model sees is the sentence and nothing else: no market data, no instrument, no key.
 */
export const MAX_QUESTION_CHARS = 300;

export interface FilterOption {
  readonly id: string;
  /** What the option means, in plain English for the model. */
  readonly meaning: string;
}

export interface FilterQuestion {
  readonly question: string;
  readonly options: readonly FilterOption[];
}

export type ScreenerChoices = {
  readonly mercado: "todos" | "spot" | "perp";
  readonly volume: "qualquer" | "1M" | "10M" | "100M" | "1B";
  readonly variacao: "qualquer" | "alta_forte" | "alta" | "queda" | "queda_forte" | "calmo";
  readonly posicao: "qualquer" | "top20" | "top50" | "top100" | "top200";
  readonly ordem: "volume" | "alta" | "queda" | "preco";
  readonly fixados: "nao" | "sim";
};

export const FILTER_QUESTIONS: Readonly<Record<keyof ScreenerChoices, FilterQuestion>> = {
  mercado: {
    question: "Which market does the person want to see?",
    options: [
      { id: "todos", meaning: "Both spot pairs and perpetual swaps. Choose this when the sentence names no market." },
      { id: "spot", meaning: "Only spot pairs." },
      { id: "perp", meaning: "Only perpetual swaps (futures without expiry)." },
    ],
  },
  volume: {
    question: "What is the minimum traded volume of the last 24 hours, in US dollars?",
    options: [
      { id: "qualquer", meaning: "No minimum. Choose this when the sentence says nothing about volume or liquidity." },
      { id: "1M", meaning: "At least 1 million dollars." },
      { id: "10M", meaning: "At least 10 million dollars." },
      { id: "100M", meaning: "At least 100 million dollars. Choose this for a request about the most traded or most liquid assets." },
      { id: "1B", meaning: "At least 1 billion dollars." },
    ],
  },
  variacao: {
    question: "What change of the last 24 hours does the person want to see?",
    options: [
      { id: "qualquer", meaning: "Any change. Choose this when the sentence says nothing about the price moving." },
      { id: "alta_forte", meaning: "Rose more than 10 percent." },
      { id: "alta", meaning: "Rose more than 3 percent." },
      { id: "queda", meaning: "Fell more than 3 percent." },
      { id: "queda_forte", meaning: "Fell more than 10 percent." },
      { id: "calmo", meaning: "Moved little: between minus 1 and plus 1 percent." },
    ],
  },
  posicao: {
    question: "How far down the list by 24 hour volume may an asset be?",
    options: [
      { id: "qualquer", meaning: "Anywhere in the list." },
      { id: "top20", meaning: "Among the 20 most traded." },
      { id: "top50", meaning: "Among the 50 most traded." },
      { id: "top100", meaning: "Among the 100 most traded." },
      { id: "top200", meaning: "Among the 200 most traded." },
    ],
  },
  ordem: {
    question: "In which order should the table be sorted?",
    options: [
      { id: "volume", meaning: "Most traded first. Default when the sentence names no order." },
      { id: "alta", meaning: "Biggest rise of the last 24 hours first." },
      { id: "queda", meaning: "Biggest fall of the last 24 hours first." },
      { id: "preco", meaning: "Highest price first." },
    ],
  },
  fixados: {
    question: "Should only the assets the person pinned be shown?",
    options: [
      { id: "nao", meaning: "No, show every asset that matches. Default." },
      { id: "sim", meaning: "Yes, only pinned assets (the sentence mentions favourites, pinned or watched assets)." },
    ],
  },
};

const QUESTION_KEYS = Object.keys(FILTER_QUESTIONS) as (keyof ScreenerChoices)[];

/** The sentence, cleaned and cut. It is the whole state the model sees. */
export function buildFilterState(text: string): { readonly tipo: "filtro_do_rastreador"; readonly pergunta: string } {
  // eslint-disable-next-line no-control-regex
  const cleaned = text.replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, "").replace(/\s+/g, " ").trim().slice(0, MAX_QUESTION_CHARS).trim();
  return { tipo: "filtro_do_rastreador", pergunta: cleaned };
}

export interface ScreenerFilter {
  readonly mercado: "todos" | "spot" | "perp";
  readonly volUsdMin: number | null;
  readonly varMin: number | null;
  readonly varMax: number | null;
  readonly rankMax: number | null;
  readonly apenasFixados: boolean;
  readonly ordenar: { readonly chave: "volUsd24h" | "var24hPct" | "preco"; readonly direcao: "asc" | "desc" };
}

export type FilterVerdict = { readonly ok: true; readonly filtro: ScreenerFilter } | { readonly ok: false; readonly reason: string };

const VOLUME: Record<ScreenerChoices["volume"], number | null> = { qualquer: null, "1M": 1e6, "10M": 1e7, "100M": 1e8, "1B": 1e9 };
const VARIATION: Record<ScreenerChoices["variacao"], { varMin: number | null; varMax: number | null }> = {
  qualquer: { varMin: null, varMax: null },
  alta_forte: { varMin: 10, varMax: null },
  alta: { varMin: 3, varMax: null },
  queda: { varMin: null, varMax: -3 },
  queda_forte: { varMin: null, varMax: -10 },
  calmo: { varMin: -1, varMax: 1 },
};
const RANK: Record<ScreenerChoices["posicao"], number | null> = { qualquer: null, top20: 20, top50: 50, top100: 100, top200: 200 };
const ORDER: Record<ScreenerChoices["ordem"], ScreenerFilter["ordenar"]> = {
  volume: { chave: "volUsd24h", direcao: "desc" },
  alta: { chave: "var24hPct", direcao: "desc" },
  queda: { chave: "var24hPct", direcao: "asc" },
  preco: { chave: "preco", direcao: "desc" },
};

/** The filter the choices describe, or the reason there is none. The model's own words never reach it. */
export function filterFromChoices(raw: unknown): FilterVerdict {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return { ok: false, reason: "resposta_invalida" };
  const input = raw as Record<string, unknown>;
  for (const key of Object.keys(input)) if (!(QUESTION_KEYS as string[]).includes(key)) return { ok: false, reason: `campo_desconhecido:${key}` };
  for (const key of QUESTION_KEYS) if (!(key in input)) return { ok: false, reason: `opcao_ausente:${key}` };
  for (const key of QUESTION_KEYS) {
    const value = input[key];
    if (typeof value !== "string" || !FILTER_QUESTIONS[key].options.some((o) => o.id === value)) return { ok: false, reason: `opcao_invalida:${key}` };
  }
  const c = input as unknown as ScreenerChoices;
  return {
    ok: true,
    filtro: { mercado: c.mercado, volUsdMin: VOLUME[c.volume], ...VARIATION[c.variacao], rankMax: RANK[c.posicao], apenasFixados: c.fixados === "sim", ordenar: ORDER[c.ordem] },
  };
}
