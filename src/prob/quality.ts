/**
 * Auditoria da qualidade dos dados estruturados que chegam ao Jev. Puro: recebe linhas já lidas e devolve contagens e
 * agregados, nunca ids de ciclo, endereços de token ou valores ligados a um token específico.
 *
 * Para cada campo do brief: completude (ausente versus nulo versus zero), valores impossíveis pela legenda do próprio
 * brief, constância, outliers (por MAD), "congelamento" (quantas vezes o valor não muda entre duas consultas seguidas
 * do mesmo token, sinal de dado em cache) e deriva entre a primeira e a segunda metade do tempo.
 */

import { isRecord, num, type BriefItemRow, type PricePath, type Row } from "./dataset.ts";
import { median, quantile, quantileSorted } from "./intervals.ts";

export interface FieldSpec {
  readonly id: string;
  readonly unit: string;
  readonly min?: number;
  readonly max?: number;
  readonly integer?: boolean;
  /** Valor bruto do campo na linha: undefined = chave ausente, null = nulo explícito. */
  readonly get: (row: BriefItemRow) => unknown;
}

const item = (key: string) => (row: BriefItemRow): unknown => row.item[key];
const nested = (parent: string, key: string) => (row: BriefItemRow): unknown => {
  const p = row.item[parent];
  return isRecord(p) ? p[key] : p === null ? null : undefined;
};

/**
 * Os campos numéricos do item de compra do brief, com as faixas que a legenda do próprio brief (LEGEND em
 * src/agent/closing.ts e `chaves` do brief) permite. Faixa é a do domínio, não a observada: fora dela é erro de dado.
 */
export const BRIEF_FIELDS: readonly FieldSpec[] = [
  { id: "n", unit: "0 a 100", min: 0, max: 100, get: item("n") },
  { id: "w", unit: "carteiras", min: 0, integer: true, get: item("w") },
  { id: "p", unit: "% vendido pelas carteiras", min: 0, max: 100, get: item("p") },
  { id: "b", unit: "% das trocas", min: 0, max: 100, get: item("b") },
  { id: "l", unit: "mil US$", min: 0, get: item("l") },
  { id: "v", unit: "mil US$", min: 0, get: item("v") },
  { id: "c", unit: "% em 24 h", min: -100, get: item("c") },
  { id: "h", unit: "detentores", min: 0, integer: true, get: item("h") },
  { id: "t", unit: "% da oferta", min: 0, max: 100, get: item("t") },
  { id: "d", unit: "% da oferta", min: 0, max: 100, get: item("d") },
  { id: "u", unit: "% da oferta", min: 0, max: 100, get: item("u") },
  { id: "r", unit: "risco 0 a 5", min: 0, max: 5, integer: true, get: item("r") },
  { id: "x", unit: "% da carteira do agente", min: 0, max: 100, get: item("x") },
  { id: "y", unit: "% da carteira", min: 0, max: 100, get: item("y") },
  { id: "i", unit: "% da liquidez", min: 0, get: item("i") },
  { id: "k", unit: "US$ de taxa de rede", min: 0, get: item("k") },
  { id: "inf", unit: "mil US$ líquidos", get: item("inf") },
  { id: "ut", unit: "negociantes", min: 0, integer: true, get: item("ut") },
  { id: "lp", unit: "% da liquidez queimada", min: 0, max: 100, get: item("lp") },
  { id: "wu", unit: "mil US$", min: 0, get: item("wu") },
  { id: "sp", unit: "% contra a entrada média", min: -100, get: item("sp") },
  { id: "mo.r5", unit: "% em 5 min", min: -100, get: nested("mo", "r5") },
  { id: "mo.r15", unit: "% em 15 min", min: -100, get: nested("mo", "r15") },
  { id: "mo.r1", unit: "% em 1 h", min: -100, get: nested("mo", "r1") },
  { id: "mo.rg", unit: "% de amplitude", min: 0, get: nested("mo", "rg") },
  { id: "mo.vr", unit: "razão de volume", min: 0, get: nested("mo", "vr") },
  { id: "mo.ag", unit: "minutos desde a última barra", min: 0, get: nested("mo", "ag") },
  { id: "tm.rsi", unit: "0 a 100", min: 0, max: 100, get: nested("tm", "rsi") },
  { id: "tm.rp", unit: "0 a 100", min: 0, max: 100, get: nested("tm", "rp") },
  { id: "tm.r4", unit: "% em 4 h", min: -100, get: nested("tm", "r4") },
  { id: "tm.r24", unit: "% em 24 h", min: -100, get: nested("tm", "r24") },
  { id: "tm.up", unit: "% sobre a mínima de 2 dias", min: 0, get: nested("tm", "up") },
  { id: "tm.dd", unit: "% sob a máxima de 2 dias", min: 0, max: 100, get: nested("tm", "dd") },
  { id: "tm.sg", unit: "% de movimento horário normal", min: 0, get: nested("tm", "sg") },
];

export interface FieldAudit {
  readonly id: string;
  readonly unit: string;
  readonly n: number;
  /** Chave ausente (o campo nem existe no item). */
  readonly absent: number;
  /** Nulo explícito. */
  readonly nulls: number;
  readonly present: number;
  readonly presentShare: number | null;
  readonly nonNumeric: number;
  readonly zeros: number;
  readonly zeroShare: number | null;
  /** Fora da faixa que a legenda permite. */
  readonly impossible: number;
  readonly min: number | null;
  readonly p50: number | null;
  readonly max: number | null;
  readonly distinct: number;
  readonly constant: boolean;
  readonly outliers: number;
  /** Pares de consultas seguidas do mesmo token em que o valor não mudou, sobre os pares comparáveis. */
  readonly unchangedShare: number | null;
  readonly unchangedPairs: number;
  readonly drift: { readonly ksD: number; readonly ksCritical: number; readonly robustShift: number | null; readonly flagged: boolean } | null;
  readonly flags: readonly string[];
}

const MAD_SCALE = 1.4826;
/** Consultas do mesmo token separadas por mais que isto não são "seguidas". */
const CONSECUTIVE_MS = 10 * 60_000;

/** Estatística de Kolmogorov-Smirnov de duas amostras e o valor crítico a 5% (assume independência, que não vale aqui: é um alarme, não um teste). */
export function ksTwoSample(a: readonly number[], b: readonly number[]): { d: number; critical: number } | null {
  if (a.length < 5 || b.length < 5) return null;
  const sa = [...a].sort((x, y) => x - y);
  const sb = [...b].sort((x, y) => x - y);
  let i = 0;
  let j = 0;
  let d = 0;
  while (i < sa.length && j < sb.length) {
    const x = Math.min(sa[i] as number, sb[j] as number);
    while (i < sa.length && (sa[i] as number) <= x) i += 1;
    while (j < sb.length && (sb[j] as number) <= x) j += 1;
    d = Math.max(d, Math.abs(i / sa.length - j / sb.length));
  }
  return { d, critical: 1.358 * Math.sqrt((a.length + b.length) / (a.length * b.length)) };
}

function madOf(values: readonly number[], center: number): number {
  return median(values.map((v) => Math.abs(v - center))) ?? 0;
}

export function auditField(rows: readonly BriefItemRow[], spec: FieldSpec): FieldAudit {
  let absent = 0;
  let nulls = 0;
  let nonNumeric = 0;
  let zeros = 0;
  let impossible = 0;
  const values: number[] = [];
  const timed: Array<{ atMs: number; value: number }> = [];
  const byToken = new Map<string, Array<{ atMs: number; value: number | null }>>();
  for (const row of rows) {
    const raw = spec.get(row);
    let value: number | null = null;
    if (raw === undefined) absent += 1;
    else if (raw === null) nulls += 1;
    else if (typeof raw === "number" && Number.isFinite(raw)) {
      value = raw;
      values.push(raw);
      timed.push({ atMs: row.atMs, value: raw });
      if (raw === 0) zeros += 1;
      if ((spec.min !== undefined && raw < spec.min) || (spec.max !== undefined && raw > spec.max) || (spec.integer === true && !Number.isInteger(raw))) impossible += 1;
    } else nonNumeric += 1;
    const list = byToken.get(row.tokenKey);
    const entry = { atMs: row.atMs, value };
    if (list === undefined) byToken.set(row.tokenKey, [entry]);
    else list.push(entry);
  }
  const present = values.length;
  const sorted = [...values].sort((x, y) => x - y);
  const med = quantileSorted(sorted, 0.5);
  const distinct = new Set(values).size;
  let outliers = 0;
  if (med !== null && present >= 8) {
    const mad = madOf(values, med);
    if (mad > 0) outliers = values.filter((v) => Math.abs(v - med) > 8 * MAD_SCALE * mad).length;
  }
  let pairs = 0;
  let unchanged = 0;
  for (const list of byToken.values()) {
    list.sort((x, y) => x.atMs - y.atMs);
    for (let i = 1; i < list.length; i += 1) {
      const a = list[i - 1] as { atMs: number; value: number | null };
      const b = list[i] as { atMs: number; value: number | null };
      if (a.value === null || b.value === null || b.atMs - a.atMs > CONSECUTIVE_MS || b.atMs === a.atMs) continue;
      pairs += 1;
      if (a.value === b.value) unchanged += 1;
    }
  }
  let drift: FieldAudit["drift"] = null;
  if (timed.length >= 20) {
    timed.sort((x, y) => x.atMs - y.atMs);
    const half = Math.floor(timed.length / 2);
    const first = timed.slice(0, half).map((t) => t.value);
    const second = timed.slice(half).map((t) => t.value);
    const ks = ksTwoSample(first, second);
    if (ks !== null && med !== null) {
      const mad = madOf(values, med);
      const m1 = median(first);
      const m2 = median(second);
      const robustShift = mad > 0 && m1 !== null && m2 !== null ? (m2 - m1) / (MAD_SCALE * mad) : null;
      drift = { ksD: ks.d, ksCritical: ks.critical, robustShift, flagged: ks.d > ks.critical && (robustShift === null || Math.abs(robustShift) >= 0.25) };
    }
  }
  const presentShare = rows.length === 0 ? null : present / rows.length;
  const flags: string[] = [];
  if (presentShare !== null && presentShare < 0.5) flags.push("mais_da_metade_ausente");
  if (impossible > 0) flags.push("valor_impossivel");
  if (present >= 2 && distinct === 1) flags.push("constante");
  if (pairs >= 20 && unchanged / pairs > 0.9) flags.push("congelado_entre_consultas");
  if (present > 0 && zeros / present > 0.5) flags.push("zero_domina");
  if (outliers > 0) flags.push("outliers");
  if (drift?.flagged === true) flags.push("deriva");
  if (nonNumeric > 0) flags.push("tipo_inesperado");
  return {
    id: spec.id,
    unit: spec.unit,
    n: rows.length,
    absent,
    nulls,
    present,
    presentShare,
    nonNumeric,
    zeros,
    zeroShare: present === 0 ? null : zeros / present,
    impossible,
    min: sorted.length === 0 ? null : (sorted[0] as number),
    p50: med,
    max: sorted.length === 0 ? null : (sorted[sorted.length - 1] as number),
    distinct,
    constant: present >= 2 && distinct === 1,
    outliers,
    unchangedShare: pairs === 0 ? null : unchanged / pairs,
    unchangedPairs: pairs,
    drift,
    flags,
  };
}

export function auditBriefFields(rows: readonly BriefItemRow[]): FieldAudit[] {
  return BRIEF_FIELDS.map((spec) => auditField(rows, spec));
}

// ---------------------------------------------------------------------------
// Campos de lista do item
// ---------------------------------------------------------------------------

export interface ListFieldAudit {
  readonly id: string;
  readonly n: number;
  readonly absent: number;
  readonly empty: number;
  readonly distinctCodes: number;
  readonly meanLength: number | null;
}

export function auditListFields(rows: readonly BriefItemRow[]): ListFieldAudit[] {
  return ["m", "f", "o", "pf"].map((id) => {
    let absent = 0;
    let empty = 0;
    let total = 0;
    let count = 0;
    const codes = new Set<string>();
    for (const row of rows) {
      const raw = row.item[id];
      if (!Array.isArray(raw)) {
        absent += 1;
        continue;
      }
      count += 1;
      total += raw.length;
      if (raw.length === 0) empty += 1;
      for (const c of raw) codes.add(String(c));
    }
    return { id, n: rows.length, absent, empty, distinctCodes: codes.size, meanLength: count === 0 ? null : total / count };
  });
}

// ---------------------------------------------------------------------------
// Probabilidades do Jev
// ---------------------------------------------------------------------------

export interface VerdictAudit {
  readonly rows: number;
  readonly withoutVerdict: number;
  /** Soma das probabilidades distante de 1 por mais que o arredondamento explica. */
  readonly sumOff: number;
  /** Todas as probabilidades são múltiplos de 0,01: a resolução é de 1 ponto percentual. */
  readonly onHundredthsGrid: boolean;
  readonly pBuyDistinct: number;
  /** Fração das linhas cujo pBuy coincide com o de outra linha: efeito do arredondamento sobre o AUC (muitos empates). */
  readonly pBuyTieShare: number | null;
  readonly pBuyQuantiles: { readonly p10: number | null; readonly p50: number | null; readonly p90: number | null; readonly p99: number | null };
  /** O pBuy do fechamento (probabilidade só de buy_tenth) difere da soma de buy_* por mais de 0,02 nesta fração das linhas com buy_*. */
  readonly buyTenthDiffersFromSum: number | null;
}

export function auditVerdicts(rows: readonly BriefItemRow[]): VerdictAudit {
  const withVerdict = rows.filter((r) => r.verdict !== null);
  let sumOff = 0;
  let onGrid = true;
  const counts = new Map<number, number>();
  let differs = 0;
  let withBuy = 0;
  for (const r of withVerdict) {
    if (r.verdictSum !== null && Math.abs(r.verdictSum - 1) > 0.015) sumOff += 1;
    for (const p of Object.values(r.verdict as Record<string, number>)) if (Math.abs(p * 100 - Math.round(p * 100)) > 1e-6) onGrid = false;
    if (r.pBuy !== null) {
      const key = Math.round(r.pBuy * 1000);
      counts.set(key, (counts.get(key) ?? 0) + 1);
      if (r.pBuy > 0 && r.pBuyTenth !== null) {
        withBuy += 1;
        if (Math.abs(r.pBuy - r.pBuyTenth) > 0.02) differs += 1;
      }
    }
  }
  let tied = 0;
  for (const c of counts.values()) if (c > 1) tied += c;
  const pBuys = withVerdict.map((r) => r.pBuy).filter((v): v is number => v !== null);
  return {
    rows: rows.length,
    withoutVerdict: rows.length - withVerdict.length,
    sumOff,
    onHundredthsGrid: onGrid,
    pBuyDistinct: counts.size,
    pBuyTieShare: pBuys.length === 0 ? null : tied / pBuys.length,
    pBuyQuantiles: { p10: quantile(pBuys, 0.1), p50: quantile(pBuys, 0.5), p90: quantile(pBuys, 0.9), p99: quantile(pBuys, 0.99) },
    buyTenthDiffersFromSum: withBuy === 0 ? null : differs / withBuy,
  };
}

// ---------------------------------------------------------------------------
// Alinhamento de tempo e vazamento (decisions-meta, briefs, placar)
// ---------------------------------------------------------------------------

export interface DistSummary {
  readonly n: number;
  readonly min: number;
  readonly p50: number;
  readonly p90: number;
  readonly p99: number;
  readonly max: number;
}

export function distOf(values: readonly number[]): DistSummary | null {
  const finite = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (finite.length === 0) return null;
  return {
    n: finite.length,
    min: finite[0] as number,
    p50: quantileSorted(finite, 0.5) as number,
    p90: quantileSorted(finite, 0.9) as number,
    p99: quantileSorted(finite, 0.99) as number,
    max: finite[finite.length - 1] as number,
  };
}

export interface MetaAudit {
  readonly rows: number;
  /** Briefs sem linha em decisions-meta com o mesmo ciclo, e o inverso. */
  readonly briefsWithoutMeta: number;
  readonly metaWithoutBrief: number;
  /** O fato mais novo do brief é POSTERIOR ao instante da pergunta: vazamento de futuro no brief. */
  readonly factAfterAsk: number;
  readonly factAgeMs: DistSummary | null;
  readonly modelLatencyMs: DistSummary | null;
  /** Início do ciclo (atMs do brief) até a pergunta ao modelo. */
  readonly cycleStartToAskMs: DistSummary | null;
  readonly duplicateCycles: number;
}

export function auditMeta(meta: readonly Row[], briefs: readonly Row[]): MetaAudit {
  const briefStart = new Map<string, number>();
  for (const b of briefs) if (typeof b.cycleId === "string" && num(b.atMs) !== null) briefStart.set(b.cycleId, b.atMs as number);
  const metaCycles = new Set<string>();
  let duplicates = 0;
  let factAfterAsk = 0;
  const age: number[] = [];
  const latency: number[] = [];
  const toAsk: number[] = [];
  for (const m of meta) {
    const cycleId = typeof m.cycleId === "string" ? m.cycleId : null;
    if (cycleId !== null) {
      if (metaCycles.has(cycleId)) duplicates += 1;
      metaCycles.add(cycleId);
    }
    const md = isRecord(m.metadata) ? m.metadata : null;
    if (md === null) continue;
    const asked = num(md.askedAtMs);
    const answered = num(md.answeredAtMs);
    const fact = num(md.factAvailableAtMs);
    if (asked !== null && fact !== null) {
      if (fact > asked) factAfterAsk += 1;
      age.push(asked - fact);
    }
    if (asked !== null && answered !== null) latency.push(answered - asked);
    const start = cycleId === null ? undefined : briefStart.get(cycleId);
    if (asked !== null && start !== undefined) toAsk.push(asked - start);
  }
  let briefsWithout = 0;
  for (const id of briefStart.keys()) if (!metaCycles.has(id)) briefsWithout += 1;
  let metaWithout = 0;
  for (const id of metaCycles) if (!briefStart.has(id)) metaWithout += 1;
  return {
    rows: meta.length,
    briefsWithoutMeta: briefsWithout,
    metaWithoutBrief: metaWithout,
    factAfterAsk,
    factAgeMs: distOf(age),
    modelLatencyMs: distOf(latency),
    cycleStartToAskMs: distOf(toAsk),
    duplicateCycles: duplicates,
  };
}

// ---------------------------------------------------------------------------
// Placar
// ---------------------------------------------------------------------------

export interface ScoreboardAudit {
  readonly decisions: number;
  readonly settlements: number;
  readonly byStance: Readonly<Record<string, number>>;
  readonly duplicateDecisionKeys: number;
  readonly orphanSettlements: number;
  readonly entryPriceMissing: number;
  /** Liquidações tentadas e sem preço, por janela, sobre as liquidações da janela. */
  readonly settledWithoutPrice: Readonly<Record<string, { readonly n: number; readonly withoutPrice: number; readonly share: number | null }>>;
  /** Liquidação gravada antes do fim da janela: preço do futuro ainda não existia. */
  readonly settledBeforeWindowEnd: number;
  /** Atraso entre o fim da janela e a gravação da liquidação, em minutos. */
  readonly settlementLagMin: DistSummary | null;
  /** Retorno exatamente zero entre entrada e liquidação (preço repetido: suspeita de cache). */
  readonly zeroReturnShare: Readonly<Record<string, number | null>>;
  /** Retorno de 1 h acima de 5000 bps em módulo (suspeita de pool ou unidade errada). */
  readonly extremeReturn1h: { readonly n: number; readonly beyond5000bps: number; readonly beyond10000bps: number };
  readonly retBps1h: DistSummary | null;
  /** Decisões de não agir marcadas uma só vez por token, lado e postura por hora: o placar é uma amostra, não o universo. */
  readonly inactionShare: number | null;
  /** Decisões cujo candidato o código fechou (o Jev só podia pular). */
  readonly codeClosedShare: number | null;
  /** Instante gravado na decisão menos o início do ciclo (0: grava o início, não o instante da decisão). */
  readonly decisionTimeIsCycleStart: boolean | null;
}

const WINDOWS = new Map<string, number>([["15m", 15 * 60_000], ["1h", 3_600_000], ["4h", 4 * 3_600_000], ["24h", 24 * 3_600_000]]);

export function auditScoreboard(scoreboard: readonly Row[], briefs: readonly Row[]): ScoreboardAudit {
  const decisions = new Map<string, Row>();
  let duplicates = 0;
  let settlements = 0;
  let orphans = 0;
  let before = 0;
  const lag: number[] = [];
  const byStance: Record<string, number> = {};
  const perWindow = new Map<string, { n: number; without: number }>();
  const decisionRows: Row[] = [];
  for (const r of scoreboard) if (r.kind === "decision") decisionRows.push(r);
  for (const r of decisionRows) {
    const key = typeof r.key === "string" ? r.key : null;
    if (key === null) continue;
    if (decisions.has(key)) duplicates += 1;
    decisions.set(key, r);
    const known = ["skip", "hold", "buy_tenth", "buy_third", "buy_two_thirds", "buy_full", "sell_tenth", "sell_third", "sell_two_thirds", "sell_full"];
    const stance = typeof r.stance === "string" && known.includes(r.stance) ? r.stance : "outra_postura";
    byStance[stance] = (byStance[stance] ?? 0) + 1;
  }
  const entry = new Map<string, number | null>();
  for (const [key, r] of decisions) entry.set(key, num(r.entryPriceUsd));
  const returns = new Map<string, number[]>();
  const ret1h: number[] = [];
  for (const r of scoreboard) {
    if (r.kind !== "settlement") continue;
    settlements += 1;
    const key = typeof r.key === "string" ? r.key : null;
    const window = typeof r.window === "string" ? (WINDOWS.has(r.window) ? r.window : "outra_janela") : null;
    const d = key === null ? undefined : decisions.get(key);
    if (key === null || window === null || d === undefined) {
      orphans += 1;
      continue;
    }
    const price = num(r.priceUsd);
    const cell = perWindow.get(window) ?? { n: 0, without: 0 };
    cell.n += 1;
    if (price === null || !(price > 0)) cell.without += 1;
    perWindow.set(window, cell);
    const windowMs = WINDOWS.get(window);
    const at = num(d.atMs);
    const settled = num(r.settledAtMs);
    if (windowMs !== undefined && at !== null && settled !== null) {
      if (settled < at + windowMs) before += 1;
      lag.push((settled - (at + windowMs)) / 60_000);
    }
    const p0 = entry.get(key) ?? null;
    if (price !== null && price > 0 && p0 !== null && p0 > 0) {
      const bps = (price / p0 - 1) * 1e4;
      const list = returns.get(window) ?? [];
      list.push(bps);
      returns.set(window, list);
      if (window === "1h") ret1h.push(bps);
    }
  }
  const zero: Record<string, number | null> = {};
  for (const [window, list] of returns) zero[window] = list.length === 0 ? null : list.filter((v) => v === 0).length / list.length;
  const settledWithoutPrice: Record<string, { n: number; withoutPrice: number; share: number | null }> = {};
  for (const [window, c] of perWindow) settledWithoutPrice[window] = { n: c.n, withoutPrice: c.without, share: c.n === 0 ? null : c.without / c.n };
  const briefStart = new Map<string, number>();
  for (const b of briefs) if (typeof b.cycleId === "string" && num(b.atMs) !== null) briefStart.set(b.cycleId, b.atMs as number);
  let comparable = 0;
  let equalStart = 0;
  for (const r of decisionRows) {
    const start = typeof r.cycleId === "string" ? briefStart.get(r.cycleId) : undefined;
    const at = num(r.atMs);
    if (start !== undefined && at !== null) {
      comparable += 1;
      if (at === start) equalStart += 1;
    }
  }
  const inaction = decisionRows.filter((r) => r.inaction === true).length;
  const closed = decisionRows.filter((r) => Array.isArray(r.triggers) && r.triggers.includes("fechada_pelo_codigo")).length;
  return {
    decisions: decisions.size,
    settlements,
    byStance,
    duplicateDecisionKeys: duplicates,
    orphanSettlements: orphans,
    entryPriceMissing: [...entry.values()].filter((p) => p === null || !(p > 0)).length,
    settledWithoutPrice,
    settledBeforeWindowEnd: before,
    settlementLagMin: distOf(lag),
    zeroReturnShare: zero,
    extremeReturn1h: { n: ret1h.length, beyond5000bps: ret1h.filter((v) => Math.abs(v) > 5000).length, beyond10000bps: ret1h.filter((v) => Math.abs(v) > 10000).length },
    retBps1h: distOf(ret1h),
    inactionShare: decisionRows.length === 0 ? null : inaction / decisionRows.length,
    codeClosedShare: decisionRows.length === 0 ? null : closed / decisionRows.length,
    decisionTimeIsCycleStart: comparable === 0 ? null : equalStart === comparable,
  };
}

// ---------------------------------------------------------------------------
// Consistência de preço entre fontes
// ---------------------------------------------------------------------------

export interface PriceConsistency {
  /** Pares de pontos de preço do mesmo token a até 2 min um do outro, de fontes ou decisões diferentes. */
  readonly pairs: number;
  readonly absDiffBps: DistSummary | null;
  readonly beyond100bps: number | null;
  readonly beyond500bps: number | null;
  /** Avaliação da carteira: pares seguidos (a até 10 min) em que o preço é idêntico, sobre os pares. */
  readonly equityUnchangedShare: number | null;
  readonly equityPairs: number;
}

export function auditPriceConsistency(path: PricePath): PriceConsistency {
  const diffs: number[] = [];
  let equityPairs = 0;
  let equityUnchanged = 0;
  for (const list of path.values()) {
    for (let i = 0; i < list.length; i += 1) {
      const a = list[i] as { atMs: number; price: number; src: string; ownKey: string | null };
      const b = nearestFrom(list, i, 2 * 60_000);
      if (b !== null) diffs.push(Math.abs(b.price / a.price - 1) * 1e4);
    }
    const eq = list.filter((p) => p.src === "patrimonio");
    for (let i = 1; i < eq.length; i += 1) {
      const a = eq[i - 1] as { atMs: number; price: number };
      const b = eq[i] as { atMs: number; price: number };
      if (b.atMs - a.atMs > 10 * 60_000 || b.atMs === a.atMs) continue;
      equityPairs += 1;
      if (a.price === b.price) equityUnchanged += 1;
    }
  }
  return {
    pairs: diffs.length,
    absDiffBps: distOf(diffs),
    beyond100bps: diffs.length === 0 ? null : diffs.filter((v) => v > 100).length / diffs.length,
    beyond500bps: diffs.length === 0 ? null : diffs.filter((v) => v > 500).length / diffs.length,
    equityUnchangedShare: equityPairs === 0 ? null : equityUnchanged / equityPairs,
    equityPairs,
  };
}

/** Ponto de outra decisão ou fonte mais perto de list[i], dentro da tolerância; ignora pares da mesma decisão. */
function nearestFrom(list: readonly { atMs: number; price: number; src: string; ownKey: string | null }[], i: number, tolMs: number): { price: number } | null {
  const a = list[i] as { atMs: number; price: number; src: string; ownKey: string | null };
  let best: { price: number } | null = null;
  let bestGap = Number.POSITIVE_INFINITY;
  for (let j = i + 1; j < list.length; j += 1) {
    const b = list[j] as { atMs: number; price: number; src: string; ownKey: string | null };
    if (b.atMs - a.atMs > tolMs) break;
    if (a.ownKey !== null && a.ownKey === b.ownKey) continue;
    if (b.atMs === a.atMs && a.src === b.src && a.price === b.price) continue;
    const gap = b.atMs - a.atMs;
    if (gap < bestGap) {
      best = b;
      bestGap = gap;
    }
  }
  return best;
}
