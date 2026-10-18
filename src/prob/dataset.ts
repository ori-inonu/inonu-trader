/**
 * Montagem do conjunto rotulado a partir dos journals do agente já lidos (listas de objetos). Puro: nenhuma leitura de
 * disco, nenhum relógio. Quem lê os arquivos é o script; aqui só se transforma e se mede a cobertura.
 *
 * Unidade de análise: (cycleId, candidato de compra) de uma consulta ao Jev (briefs.jsonl). Cada unidade tem as
 * features do brief e as saídas do Jev (probabilidades por opção, facetas), e rótulos de retorno futuro por horizonte.
 *
 * Os rótulos vêm de TRÊS fontes, em ordem de confiança, e a fonte de cada rótulo é sempre registrada:
 *   1. scoreboard_exato: a decisão do placar com a mesma chave (cycleId + candidato): preço de entrada e preço da
 *      liquidação do horizonte. Só existe para uma fração pequena dos candidatos (o placar deduplica as decisões de
 *      não agir por token e hora e limita as consultas de preço).
 *   2. caminho_de_preco: o preço do MESMO token mais perto de t e de t + horizonte, entre todos os pontos de preço
 *      que os journals guardam (entradas e liquidações do placar de outras decisões, e a avaliação da carteira dos
 *      tokens mantidos), dentro de uma tolerância. Os pontos da própria decisão ficam de fora quando há rótulo exato,
 *      para a comparação entre fontes ser independente.
 *   3. brief_posterior: o retorno que um brief POSTERIOR do mesmo token declara (mo.r15 para 15 min, mo.r1 para 1 h,
 *      tm.r4 para 4 h), alinhado pelo fim da janela e pela idade do fechamento da última barra (mo.ag - 5 min). Não
 *      precisa de preço. No horizonte de 4 h ela não é usada como rótulo (tm.r4 vem de barras de 1 h, alinhamento
 *      incerto em até uma hora); só entra na tabela de concordância.
 * Retorno é sempre em pontos-base (bps) sobre o preço, bruto de custo.
 */

export type Row = Record<string, unknown>;

export const HORIZONS = [
  { id: "15m", ms: 15 * 60_000 },
  { id: "1h", ms: 60 * 60_000 },
  { id: "4h", ms: 4 * 60 * 60_000 },
] as const;
export type HorizonId = (typeof HORIZONS)[number]["id"];

/** Limiares de "subiu pelo menos X bps". 30 e um limiar exploratorio de movimento bruto, sem deducao de custos. */
export const THRESHOLDS_BPS = [0, 30, 100] as const;

const WINDOW_MS: Readonly<Record<string, number>> = { "15m": 15 * 60_000, "1h": 60 * 60_000, "4h": 4 * 60 * 60_000, "24h": 24 * 60 * 60_000 };

export type LabelSource = "scoreboard_exato" | "caminho_de_preco" | "brief_posterior";
const LABEL_SOURCES: readonly LabelSource[] = ["scoreboard_exato", "caminho_de_preco", "brief_posterior"];

export const isRecord = (v: unknown): v is Row => v !== null && typeof v === "object" && !Array.isArray(v);
export const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const str = (v: unknown): string | null => (typeof v === "string" && v.length > 0 ? v : null);

/** "buy:token:501:ENDERECO" ou "hold:token:501:ENDERECO@agente" vira "501:ENDERECO". Formato desconhecido: null. */
export function tokenKeyOf(candidateId: string): string | null {
  const parts = candidateId.split(":");
  if (parts.length < 4 || parts[1] !== "token") return null;
  const chain = parts[2] as string;
  const address = parts.slice(3).join(":").split("@")[0] as string;
  return chain.length > 0 && address.length > 0 ? `${chain}:${address}` : null;
}

/** Identificador anônimo estável (hash FNV-1a de 32 bits) para relatórios: nunca devolve o texto original. */
export function anonId(prefix: string, text: string, salt = "prob-cycle-v1"): string {
  let h = 0x811c9dc5;
  const input = `${salt}|${text}`;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return `${prefix}${(h >>> 0).toString(16).padStart(8, "0").slice(0, 6)}`;
}

// ---------------------------------------------------------------------------
// Linhas do brief
// ---------------------------------------------------------------------------

export interface BriefItemRow {
  readonly cycleId: string;
  readonly candidateId: string;
  readonly tokenKey: string;
  /** Início do ciclo (o brief). */
  readonly atMs: number;
  /** O item de `compras` do brief, em chaves curtas. */
  readonly item: Row;
  readonly offered: readonly string[];
  readonly requested: string | null;
  /** Probabilidade de cada opção devolvida pelo Jev (arredondada a duas casas pelo agente). */
  readonly verdict: Readonly<Record<string, number>> | null;
  /** Soma das probabilidades das opções buy_*: o "pBuy" do Jev (NÃO é chance de lucro). */
  readonly pBuy: number | null;
  readonly pSkip: number | null;
  /** Probabilidade só de buy_tenth: é o que o registro de fechamento chama de pBuy. */
  readonly pBuyTenth: number | null;
  readonly verdictSum: number | null;
  /** Maior probabilidade menos a segunda maior. Perto de zero: o Jev hesita entre duas opções. */
  readonly topMargin: number | null;
  readonly facets: Readonly<Record<string, number>> | null;
  /** Só `skip` estava na oferta: o código fechou a compra e o Jev não escolheu. */
  readonly codeClosed: boolean;
  readonly context: Row | null;
}

function numericRecord(v: unknown): Record<string, number> | null {
  if (!isRecord(v)) return null;
  const out: Record<string, number> = {};
  for (const [k, x] of Object.entries(v)) {
    const n = num(x);
    if (n !== null) out[k] = n;
  }
  return Object.keys(out).length === 0 ? null : out;
}

export function briefRowsFrom(briefs: readonly Row[]): BriefItemRow[] {
  const out: BriefItemRow[] = [];
  for (const brief of briefs) {
    const cycleId = str(brief.cycleId);
    const atMs = num(brief.atMs);
    const inner = isRecord(brief.brief) ? brief.brief : null;
    const compras = inner !== null && isRecord(inner.compras) ? inner.compras : null;
    if (cycleId === null || atMs === null || compras === null || !Array.isArray(brief.candidates)) continue;
    const requested = isRecord(brief.requested) ? brief.requested : {};
    const verdicts = isRecord(brief.verdicts) ? brief.verdicts : {};
    const facets = isRecord(brief.facets) ? brief.facets : {};
    const context = isRecord(brief.contexto) ? brief.contexto : null;
    for (const candidate of brief.candidates) {
      if (!isRecord(candidate) || candidate.kind !== "buy") continue;
      const candidateId = str(candidate.id);
      if (candidateId === null) continue;
      const tokenKey = tokenKeyOf(candidateId);
      const item = compras[candidateId];
      if (tokenKey === null || !isRecord(item)) continue;
      const offered = Array.isArray(candidate.stances) ? candidate.stances.filter((s): s is string => typeof s === "string") : [];
      const verdict = numericRecord(verdicts[candidateId]);
      let pBuy: number | null = null;
      let sum: number | null = null;
      let margin: number | null = null;
      if (verdict !== null) {
        pBuy = 0;
        sum = 0;
        for (const [k, p] of Object.entries(verdict)) {
          sum += p;
          if (k.startsWith("buy_")) pBuy += p;
        }
        const sorted = Object.values(verdict).sort((a, b) => b - a);
        margin = sorted.length >= 2 ? (sorted[0] as number) - (sorted[1] as number) : null;
      }
      out.push({
        cycleId,
        candidateId,
        tokenKey,
        atMs,
        item,
        offered,
        requested: str(requested[candidateId]),
        verdict,
        pBuy,
        pSkip: verdict !== null && "skip" in verdict ? (verdict.skip as number) : null,
        pBuyTenth: verdict !== null && "buy_tenth" in verdict ? (verdict.buy_tenth as number) : null,
        verdictSum: sum,
        topMargin: margin,
        facets: numericRecord(facets[candidateId]),
        codeClosed: offered.length <= 1,
        context,
      });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Fechamentos
// ---------------------------------------------------------------------------

export interface ClosingRow {
  readonly cycleId: string;
  readonly candidateId: string;
  readonly tokenKey: string;
  readonly atMs: number;
  /** pBuy da primeira resposta como o fechamento o grava (probabilidade de buy_tenth). */
  readonly firstP: number | null;
  /** Probabilidade de comprar na segunda olhada; null se não houve segunda olhada. */
  readonly secondBuy: number | null;
  readonly would: string | null;
  readonly wouldReason: string | null;
  readonly quoted: boolean;
  /** Pedido da cotação até a resposta, em ms. */
  readonly quoteMs: number | null;
  /** Pergunta ao modelo até a resposta, em ms. */
  readonly modelMs: number | null;
  /** Início do fechamento até a última resposta, em ms (0 quando nada foi gasto). */
  readonly spentMs: number;
  /** Custo parcial de entrada declarado na cotação, em % do tamanho. */
  readonly entryCostPct: number | null;
  readonly impactPct: number | null;
  readonly facets: Readonly<Record<string, number>> | null;
  readonly item: Row | null;
}

export function closingRowsFrom(closings: readonly Row[]): ClosingRow[] {
  const out: ClosingRow[] = [];
  for (const c of closings) {
    const cycleId = str(c.cycleId);
    const candidateId = str(c.candidateId);
    const atMs = num(c.atMs);
    if (cycleId === null || candidateId === null || atMs === null) continue;
    const tokenKey = tokenKeyOf(candidateId);
    if (tokenKey === null) continue;
    const first = isRecord(c.first) ? c.first : null;
    const answer = isRecord(c.answer) ? c.answer : null;
    const quote = isRecord(c.quote) ? c.quote : null;
    const brief = isRecord(c.brief) ? c.brief : null;
    const asked = num(c.askedAtMs);
    const answered = num(c.answeredAtMs);
    const quoteStart = quote === null ? null : num(quote.startedAtMs);
    const quoteEnd = quote === null ? null : num(quote.receivedAtMs);
    const cot = brief !== null && isRecord(brief.cot) ? brief.cot : null;
    const sua = brief !== null && isRecord(brief.sua) ? brief.sua : null;
    const lastEnd = Math.max(answered ?? Number.NEGATIVE_INFINITY, quoteEnd ?? Number.NEGATIVE_INFINITY);
    const spent = Number.isFinite(lastEnd) ? Math.max(0, lastEnd - atMs) : 0;
    const facets: Record<string, number> = {};
    if (sua !== null && isRecord(sua.f)) for (const [k, v] of Object.entries(sua.f)) if (num(v) !== null) facets[k] = (v as number) / 100;
    out.push({
      cycleId,
      candidateId,
      tokenKey,
      atMs,
      firstP: first === null ? null : num(first.pBuy),
      secondBuy: answer === null ? null : num(answer.buy),
      would: str(c.would),
      wouldReason: str(c.wouldReason),
      quoted: quote !== null,
      quoteMs: quoteStart !== null && quoteEnd !== null ? quoteEnd - quoteStart : null,
      modelMs: asked !== null && answered !== null ? answered - asked : null,
      spentMs: spent,
      entryCostPct: cot === null ? null : num(cot.entra),
      impactPct: cot === null ? null : num(cot.imp),
      facets: Object.keys(facets).length === 0 ? null : facets,
      item: brief !== null && isRecord(brief.cand) ? brief.cand : null,
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Preços e rótulos
// ---------------------------------------------------------------------------

export interface PricePoint {
  readonly atMs: number;
  readonly price: number;
  readonly src: "entrada" | "liquidacao" | "patrimonio";
  /** Chave da decisão do placar de onde o ponto veio; null para a avaliação da carteira. */
  readonly ownKey: string | null;
}

export type PricePath = Map<string, PricePoint[]>;

/** Todos os pontos de preço (tempo, preço) por token que os journals guardam. Ordenados por tempo. */
export function buildPricePath(scoreboard: readonly Row[], equity: readonly Row[]): PricePath {
  const path: PricePath = new Map();
  const add = (token: string, point: PricePoint): void => {
    const list = path.get(token);
    if (list === undefined) path.set(token, [point]);
    else list.push(point);
  };
  const decisions = new Map<string, { token: string; atMs: number }>();
  for (const r of scoreboard) {
    if (r.kind !== "decision") continue;
    const key = str(r.key);
    const chain = str(r.chainIndex);
    const address = str(r.address);
    const atMs = num(r.atMs);
    if (key === null || chain === null || address === null || atMs === null) continue;
    const token = `${chain}:${address}`;
    decisions.set(key, { token, atMs });
    const price = num(r.entryPriceUsd);
    if (price !== null && price > 0) add(token, { atMs, price, src: "entrada", ownKey: key });
  }
  for (const r of scoreboard) {
    if (r.kind !== "settlement") continue;
    const key = str(r.key);
    const window = str(r.window);
    const decision = key === null ? undefined : decisions.get(key);
    const price = num(r.priceUsd);
    if (key === null || window === null || decision === undefined || price === null || !(price > 0) || WINDOW_MS[window] === undefined) continue;
    add(decision.token, { atMs: decision.atMs + (WINDOW_MS[window] as number), price, src: "liquidacao", ownKey: key });
  }
  for (const r of equity) {
    const atMs = num(r.atMs);
    if (atMs === null || !Array.isArray(r.holdings)) continue;
    for (const h of r.holdings) {
      if (!isRecord(h)) continue;
      const id = str(h.id);
      const price = num(h.priceUsd);
      if (id !== null && price !== null && price > 0) add(id, { atMs, price, src: "patrimonio", ownKey: null });
    }
  }
  for (const list of path.values()) list.sort((a, b) => a.atMs - b.atMs);
  return path;
}

/** O ponto de menor distância ao instante, dentro da tolerância; os pontos cujo `ownKey` está em `exclude` ficam de fora. */
export function nearestPoint(list: readonly PricePoint[] | undefined, atMs: number, tolMs: number, exclude?: ReadonlySet<string>): PricePoint | null {
  if (list === undefined) return null;
  let best: PricePoint | null = null;
  let bestGap = Number.POSITIVE_INFINITY;
  for (const p of list) {
    if (p.atMs < atMs - tolMs) continue;
    if (p.atMs > atMs + tolMs) break;
    if (exclude !== undefined && p.ownKey !== null && exclude.has(p.ownKey)) continue;
    const gap = Math.abs(p.atMs - atMs);
    if (gap < bestGap) {
      best = p;
      bestGap = gap;
    }
  }
  return best;
}

export interface ScoreboardIndex {
  readonly decisions: Map<string, Row>;
  /** chave da decisão -> janela -> preço (null: a liquidação foi tentada e o preço não foi achado). */
  readonly settlements: Map<string, Map<string, number | null>>;
}

export function buildScoreboardIndex(scoreboard: readonly Row[]): ScoreboardIndex {
  const decisions = new Map<string, Row>();
  const settlements = new Map<string, Map<string, number | null>>();
  for (const r of scoreboard) {
    const key = str(r.key);
    if (key === null) continue;
    if (r.kind === "decision") decisions.set(key, r);
    else if (r.kind === "settlement") {
      const window = str(r.window);
      if (window === null) continue;
      const map = settlements.get(key) ?? new Map<string, number | null>();
      const price = num(r.priceUsd);
      map.set(window, price !== null && price > 0 ? price : null);
      settlements.set(key, map);
    }
  }
  return { decisions, settlements };
}

/** Barras de momento têm 5 min. `mo.ag` é o tempo desde que a última barra COMEÇOU: o fechamento dela tem max(0, ag - 5) min de idade. */
const BAR_MIN = 5;
export const barAgeMin = (value: unknown): number | null => {
  const age = num(value);
  return age !== null && age >= 0 ? age : null;
};
export const dataAgeMs = (agMin: number): number => Math.max(0, agMin - BAR_MIN) * 60_000;

export interface LaterBriefPoint {
  readonly atMs: number;
  /** Minutos desde que a última barra de 5 min começou, no brief (mo.ag); null quando desconhecido. */
  readonly agMin: number | null;
  readonly r15: number | null;
  readonly r1: number | null;
  readonly r4: number | null;
}

export type LaterBriefIndex = Map<string, LaterBriefPoint[]>;

export function buildLaterBriefIndex(rows: readonly BriefItemRow[]): LaterBriefIndex {
  const index: LaterBriefIndex = new Map();
  for (const row of rows) {
    const mo = isRecord(row.item.mo) ? row.item.mo : null;
    const tm = isRecord(row.item.tm) ? row.item.tm : null;
    const point: LaterBriefPoint = {
      atMs: row.atMs,
      agMin: barAgeMin(mo?.ag),
      r15: mo === null ? null : num(mo.r15),
      r1: mo === null ? null : num(mo.r1),
      r4: tm === null ? null : num(tm.r4),
    };
    if (point.r15 === null && point.r1 === null && point.r4 === null) continue;
    const list = index.get(row.tokenKey);
    if (list === undefined) index.set(row.tokenKey, [point]);
    else list.push(point);
  }
  for (const list of index.values()) list.sort((a, b) => a.atMs - b.atMs);
  return index;
}

export interface HorizonLabel {
  /** Retorno em bps da fonte escolhida; null quando nenhuma fonte tem rótulo. */
  readonly retBps: number | null;
  readonly source: LabelSource | null;
  /** O retorno de cada fonte disponível, para a comparação entre fontes. */
  readonly bySource: Readonly<Partial<Record<LabelSource, number>>>;
}

export interface LabelContext {
  readonly scoreboard: ScoreboardIndex;
  readonly path: PricePath;
  readonly later: LaterBriefIndex;
  /** Tolerância máxima de alinhamento no tempo. Padrão 5 min (e no máximo 25% do horizonte). */
  readonly tolMs?: number;
}

export interface LabelQuery {
  readonly cycleId: string;
  readonly candidateId: string;
  readonly tokenKey: string;
  readonly atMs: number;
  /** mo.ag desta linha (minutos desde que a última barra começou); null quando desconhecido. */
  readonly agMin?: number | null;
}

const toBps = (ratio: number): number => (ratio - 1) * 1e4;

export function labelRow(query: LabelQuery, ctx: LabelContext): Record<HorizonId, HorizonLabel> {
  const base = query.cycleId + ":" + query.candidateId;
  const exactKeys = [`${base}|inacao`, base];
  const exactKey = exactKeys.find((k) => ctx.scoreboard.decisions.has(k));
  const exclude = exactKey === undefined ? undefined : new Set(exactKeys);
  const out = {} as Record<HorizonId, HorizonLabel>;
  for (const h of HORIZONS) {
    const tol = Math.min(ctx.tolMs ?? 5 * 60_000, h.ms * 0.25);
    const bySource: Partial<Record<LabelSource, number>> = {};
    // 1. placar exato
    if (exactKey !== undefined) {
      const decision = ctx.scoreboard.decisions.get(exactKey) as Row;
      const p0 = num(decision.entryPriceUsd);
      const p1 = ctx.scoreboard.settlements.get(exactKey)?.get(h.id) ?? null;
      if (p0 !== null && p0 > 0 && p1 !== null && p1 > 0) bySource.scoreboard_exato = toBps(p1 / p0);
    }
    // 2. caminho de preço do mesmo token
    const list = ctx.path.get(query.tokenKey);
    const a = nearestPoint(list, query.atMs, tol, exclude);
    const b = nearestPoint(list, query.atMs + h.ms, tol, exclude);
    if (a !== null && b !== null && b.atMs > a.atMs && Math.abs(b.atMs - a.atMs - h.ms) <= 2 * tol) bySource.caminho_de_preco = toBps(b.price / a.price);
    // 3. brief posterior do mesmo token
    const laterList = ctx.later.get(query.tokenKey);
    const queryAge = barAgeMin(query.agMin);
    if (laterList !== undefined && queryAge !== null) {
      const startMs = query.atMs - dataAgeMs(queryAge);
      let best: { gap: number; value: number } | null = null;
      for (const l of laterList) {
        const age = barAgeMin(l.agMin);
        if (l.atMs <= query.atMs || age === null) continue;
        const value = h.id === "15m" ? l.r15 : h.id === "1h" ? l.r1 : l.r4;
        if (value === null) continue;
        const endMs = l.atMs - dataAgeMs(age);
        const gap = Math.abs(endMs - startMs - h.ms);
        if (gap <= tol && (best === null || gap < best.gap)) best = { gap, value };
      }
      if (best !== null) bySource.brief_posterior = best.value * 100;
    }
    // tm.r4 vem de barras de 1 h (timing.ts): o alinhamento é incerto em até uma hora e a concordância com as outras fontes é fraca,
    // então no horizonte de 4 h o brief posterior é medido (para a tabela de concordância) mas nunca escolhido como rótulo
    const source = LABEL_SOURCES.find((s) => bySource[s] !== undefined && !(h.id === "4h" && s === "brief_posterior")) ?? null;
    out[h.id] = { retBps: source === null ? null : (bySource[source] as number), source, bySource };
  }
  return out;
}

export interface LabeledBriefRow {
  readonly row: BriefItemRow;
  readonly labels: Record<HorizonId, HorizonLabel>;
}

export function labelBriefRows(rows: readonly BriefItemRow[], scoreboard: readonly Row[], equity: readonly Row[], tolMs?: number): LabeledBriefRow[] {
  const ctx: LabelContext = { scoreboard: buildScoreboardIndex(scoreboard), path: buildPricePath(scoreboard, equity), later: buildLaterBriefIndex(rows), tolMs };
  return rows.map((row) => {
    const mo = isRecord(row.item.mo) ? row.item.mo : null;
    return { row, labels: labelRow({ cycleId: row.cycleId, candidateId: row.candidateId, tokenKey: row.tokenKey, atMs: row.atMs, agMin: barAgeMin(mo?.ag) }, ctx) };
  });
}

export interface CoverageCell {
  readonly rows: number;
  readonly labeled: number;
  readonly share: number | null;
  readonly bySource: Readonly<Record<LabelSource, number>>;
  /** Linhas com alguma fonte, por fonte disponível (não só a escolhida). */
  readonly availableBySource: Readonly<Record<LabelSource, number>>;
  readonly tokens: number;
  readonly tokensLabeled: number;
}

export function coverageOf(labeled: ReadonlyArray<{ tokenKey: string; labels: Record<HorizonId, HorizonLabel> }>, horizon: HorizonId): CoverageCell {
  const bySource: Record<LabelSource, number> = { scoreboard_exato: 0, caminho_de_preco: 0, brief_posterior: 0 };
  const available: Record<LabelSource, number> = { scoreboard_exato: 0, caminho_de_preco: 0, brief_posterior: 0 };
  const tokens = new Set<string>();
  const tokensLabeled = new Set<string>();
  let count = 0;
  for (const r of labeled) {
    tokens.add(r.tokenKey);
    const label = r.labels[horizon];
    for (const s of LABEL_SOURCES) if (label.bySource[s] !== undefined) available[s] += 1;
    if (label.source !== null) {
      count += 1;
      bySource[label.source] += 1;
      tokensLabeled.add(r.tokenKey);
    }
  }
  return { rows: labeled.length, labeled: count, share: labeled.length === 0 ? null : count / labeled.length, bySource, availableBySource: available, tokens: tokens.size, tokensLabeled: tokensLabeled.size };
}

/** Rótulo binário "subiu pelo menos X bps"; null sem retorno. */
export function upLabel(retBps: number | null, thresholdBps: number): 0 | 1 | null {
  if (retBps === null || !Number.isFinite(retBps)) return null;
  return retBps >= thresholdBps ? 1 : 0;
}

// ---------------------------------------------------------------------------
// Linhas do placar (janela longa, só rótulo exato)
// ---------------------------------------------------------------------------

export interface ScoreRow {
  readonly key: string;
  readonly cycleId: string;
  readonly candidateId: string;
  readonly tokenKey: string;
  readonly atMs: number;
  readonly stance: string;
  readonly inaction: boolean;
  /** O código fechou a compra: o Jev só podia pular, então a linha não mede o julgamento dele. */
  readonly codeClosed: boolean;
  readonly facets: Readonly<Record<string, number>> | null;
  readonly families: readonly string[];
  readonly triggers: readonly string[];
  readonly posture: string | null;
  /** Retorno em bps por horizonte, só com preço de entrada e preço de liquidação achados; null senão. */
  readonly retBps: Readonly<Record<HorizonId, number | null>>;
  /** Liquidação tentada e sem preço (reason sem_preco), por horizonte. */
  readonly settledWithoutPrice: Readonly<Record<HorizonId, boolean>>;
}

/** Decisões de COMPRA do placar (candidatos `buy:`) com o retorno exato por horizonte. */
export function scoreRowsFrom(scoreboard: readonly Row[]): ScoreRow[] {
  const index = buildScoreboardIndex(scoreboard);
  const out: ScoreRow[] = [];
  for (const [key, r] of index.decisions) {
    const cycleId = str(r.cycleId);
    const candidateId = str(r.candidateId);
    const atMs = num(r.atMs);
    const stance = str(r.stance);
    if (cycleId === null || candidateId === null || atMs === null || stance === null || !candidateId.startsWith("buy:")) continue;
    const tokenKey = tokenKeyOf(candidateId);
    if (tokenKey === null) continue;
    const p0 = num(r.entryPriceUsd);
    const retBps = {} as Record<HorizonId, number | null>;
    const missing = {} as Record<HorizonId, boolean>;
    for (const h of HORIZONS) {
      const settlement = index.settlements.get(key);
      const has = settlement?.has(h.id) === true;
      const p1 = settlement?.get(h.id) ?? null;
      retBps[h.id] = p0 !== null && p0 > 0 && p1 !== null && p1 > 0 ? toBps(p1 / p0) : null;
      missing[h.id] = has && p1 === null;
    }
    const triggers = Array.isArray(r.triggers) ? r.triggers.filter((t): t is string => typeof t === "string") : [];
    out.push({
      key,
      cycleId,
      candidateId,
      tokenKey,
      atMs,
      stance,
      inaction: r.inaction === true,
      codeClosed: triggers.includes("fechada_pelo_codigo"),
      facets: numericRecord(r.facets),
      families: Array.isArray(r.families) ? r.families.filter((f): f is string => typeof f === "string") : [],
      triggers,
      posture: str(r.posture),
      retBps,
      settledWithoutPrice: missing,
    });
  }
  return out.sort((a, b) => a.atMs - b.atMs);
}

// ---------------------------------------------------------------------------
// Leitura de texto JSONL (pura: recebe o texto, não o arquivo)
// ---------------------------------------------------------------------------

/** Linhas JSON de um journal. Linha vazia é ignorada; linha que não é um objeto JSON é contada como malformada. */
export function parseJsonl(text: string): { rows: Row[]; malformed: number } {
  const rows: Row[] = [];
  let malformed = 0;
  for (const line of text.split("\n")) {
    if (line.trim() === "") continue;
    try {
      const parsed: unknown = JSON.parse(line);
      if (isRecord(parsed)) rows.push(parsed);
      else malformed += 1;
    } catch {
      malformed += 1;
    }
  }
  return { rows, malformed };
}
