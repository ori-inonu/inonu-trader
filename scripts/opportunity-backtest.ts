/**
 * Measures the factors of the opportunity engine on history, the way the project asks a gain to be claimed: with the limits fixed beforehand, the first part of the time to look
 * and the last part to confirm, the cost of trading in the numbers and the biases of the sample written beside the result.
 *
 *   bun --no-env-file scripts/opportunity-backtest.ts [--refresh] [--pairs 200] [--days 420]
 *
 * Data: the free public OKX daily candles of the spot pairs against USDT, cached in `data/research/opportunity-daily.json` (git ignored) so a second run costs no request.
 *
 * Method (all of it can be read in `evaluate`):
 *  - a pair-day is in the sample when the pair has 91 days of history and traded at least US$ 1 mi a day on average over the 30 days before (the liquidity the board asks for);
 *  - the signal is read at the CLOSE of day t, so the entry is the OPEN of day t+1 and the exit the close of day t+H; a cost of 0.2% for the round trip is subtracted;
 *  - what is reported is the EXCESS over the mean of every pair in the sample on the same day, so the market going up or down in a period is not credited to a factor;
 *  - the t statistic is taken over days (one mean excess per day), divided by the square root of H because windows of H days overlap; it is a rough guard, not a proof;
 *  - the first 60% of the days is "to look", the last 40% "to confirm". A factor is only called to have an edge when both parts agree in sign and the confirming part is past 2.
 *
 * Biases, written here because they push the result UP: the pairs are the ones listed and liquid TODAY, so a pair that fell and was delisted is not in the sample (survivorship),
 * which flatters every "cheap" factor most; spreads and slippage beyond the 0.2% are not modelled; the sample is one market regime. A positive result is an upper bound.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { predictLogistic, trainLogistic } from "../src/intel/ml/logistic";
import { dirname } from "node:path";
import { OPPORTUNITY_RULES, readFactors, type DayCandle, type FactorRead, MIN_CANDLES } from "../src/opportunity/factors";
import { createOkxDaily } from "../src/opportunity/okx-daily";

const CACHE = "data/research/opportunity-daily.json";
const DAY = 86_400_000;
const COST = 0.002;
const MIN_MEAN_VOL = 1_000_000;
const STABLE = new Set(["USDC", "DAI", "TUSD", "FDUSD", "USDE", "PYUSD", "USDG", "USDD", "BUSD", "USDP", "EURT", "EUR", "USDT"]);

const arg = (name: string, fallback: number): number => {
  const i = process.argv.indexOf(`--${name}`);
  const n = i === -1 ? NaN : Number(process.argv[i + 1]);
  return Number.isFinite(n) ? n : fallback;
};

type Panel = Record<string, DayCandle[]>;

async function load(pairs: number, days: number, refresh: boolean): Promise<Panel> {
  if (!refresh && existsSync(CACHE)) {
    const cached = JSON.parse(readFileSync(CACHE, "utf8")) as { readonly asOf: number; readonly panel: Panel };
    console.log(`cache: ${Object.keys(cached.panel).length} pairs, as of ${new Date(cached.asOf).toISOString()}`);
    return cached.panel;
  }
  const okx = createOkxDaily();
  const { tickers } = await okx.tickers();
  const universe = tickers
    .filter((t) => !STABLE.has(t.instId.split("-")[0]!) && t.volQuote24h >= 300_000)
    .sort((a, b) => b.volQuote24h - a.volQuote24h)
    .slice(0, pairs);
  console.log(`universe: ${universe.length} pairs (of ${tickers.length} against USDT), reading ${days} days each`);
  const panel: Panel = {};
  let done = 0;
  for (const t of universe) {
    try {
      let { candles } = await okx.daily(t.instId);
      while (candles.length < days && candles.length > 0) {
        const older = await okx.history(t.instId, candles[0]!.ts);
        if (older.candles.length === 0) break;
        candles = [...older.candles, ...candles];
      }
      panel[t.instId] = candles;
    } catch (error) {
      console.log(`skipped ${t.instId}: ${(error as Error).message}`);
    }
    done += 1;
    if (done % 25 === 0) console.log(`  ${done}/${universe.length}`);
  }
  mkdirSync(dirname(CACHE), { recursive: true });
  writeFileSync(CACHE, JSON.stringify({ asOf: Date.now(), panel }));
  return panel;
}

interface Extras {
  /** Mean funding rate of the perpetual over the three days that ended at the close of the signal day, per 8 hours; null without a perpetual or with fewer than two readings. */
  funding: number | null;
  fundingPct: number;
  readonly ret7: number;
  readonly ret30: number;
  readonly aboveSma50: boolean;
  readonly aboveSma20: boolean;
  /** Position inside that day's sample, 0 to 1, filled once the day is complete. */
  ret7Pct: number;
  ret30Pct: number;
  liqTercile: number;
  atrTercile: number;
}

interface Obs {
  readonly pair: string;
  readonly closeMs: number;
  readonly day: number;
  readonly read: FactorRead;
  readonly x: Extras;
  /** Net return of entering at the open of the next day and leaving H days after the signal. */
  readonly ret: Record<number, number>;
}

const HORIZONS = [3, 7, 14] as const;

function observations(panel: Panel): Obs[] {
  const out: Obs[] = [];
  for (const [pair, all] of Object.entries(panel)) {
    // the last candle may still be forming: it is not a closed day
    const candles = all.slice(0, -1);
    for (let t = MIN_CANDLES - 1; t < candles.length - 1; t += 1) {
      const window = candles.slice(t - MIN_CANDLES + 1, t + 1);
      const read = readFactors(window);
      if (read === null || read.meanVol30 < MIN_MEAN_VOL) continue;
      const entry = candles[t + 1]!.open;
      const ret: Record<number, number> = {};
      for (const h of HORIZONS) {
        const exit = candles[t + h];
        if (exit !== undefined) ret[h] = exit.close / entry - 1 - COST;
      }
      if (Object.keys(ret).length === 0) continue;
      const closes = window.map((c) => c.close);
      const last = closes[closes.length - 1]!;
      const meanOf = (n: number) => closes.slice(-n).reduce((s, v) => s + v, 0) / n;
      const x: Extras = { funding: null, fundingPct: 0, ret7: last / closes[closes.length - 8]! - 1, ret30: last / closes[closes.length - 31]! - 1, aboveSma50: last > meanOf(50), aboveSma20: last > meanOf(20), ret7Pct: 0, ret30Pct: 0, liqTercile: 0, atrTercile: 0 };
      out.push({ pair, closeMs: candles[t]!.ts + DAY, day: Math.round(candles[t]!.ts / DAY), read, x, ret });
    }
  }
  return out;
}

interface Group {
  readonly name: string;
  readonly pick: (o: Obs) => boolean;
}

/** The position of each pair inside the day's sample: percentile of the returns, terciles of the liquidity and of the volatility. Only the SAME day is used, so nothing looks ahead. */
function crossSection(obs: Obs[]): void {
  const byDay = new Map<number, Obs[]>();
  for (const o of obs) byDay.set(o.day, [...(byDay.get(o.day) ?? []), o]);
  for (const list of byDay.values()) {
    const rank = (key: (o: Obs) => number) => {
      const sorted = [...list].sort((a, b) => key(a) - key(b));
      return new Map(sorted.map((o, i) => [o, list.length > 1 ? i / (list.length - 1) : 0.5]));
    };
    const r7 = rank((o) => o.x.ret7);
    const r30 = rank((o) => o.x.ret30);
    const liq = rank((o) => o.read.meanVol30);
    const atr = rank((o) => o.read.atrPct ?? 0);
    for (const o of list) {
      o.x.ret7Pct = r7.get(o)!;
      o.x.ret30Pct = r30.get(o)!;
      o.x.liqTercile = Math.min(2, Math.floor(liq.get(o)! * 3));
      o.x.atrTercile = Math.min(2, Math.floor(atr.get(o)! * 3));
    }
  }
}

const R = OPPORTUNITY_RULES;
const GROUPS: readonly Group[] = [
  { name: "todos os pares-dia", pick: () => true },
  // the first hypothesis: cheap against itself (the thesis that was asked for)
  { name: "desconto", pick: (o) => o.read.held.desconto },
  { name: "virada", pick: (o) => o.read.held.virada },
  { name: "participacao", pick: (o) => o.read.held.participacao },
  { name: "contagem 3", pick: (o) => o.read.count === 3 },
  { name: "desconto e virada", pick: (o) => o.read.held.desconto && o.read.held.virada },
  { name: "rsi14 abaixo de 35", pick: (o) => o.read.rsi14 !== null && o.read.rsi14 < 35 },
  // the second round, written down BEFORE it was run: strength instead of discount (momentum and trend), liquidity and volatility
  { name: "M1 forca 30d (quintil superior)", pick: (o) => o.x.ret30Pct >= 0.8 },
  { name: "M2 forca 7d (quintil superior)", pick: (o) => o.x.ret7Pct >= 0.8 },
  { name: "M3 fraqueza 7d (quintil inferior)", pick: (o) => o.x.ret7Pct <= 0.2 },
  { name: "M4 perto da maxima de 30d", pick: (o) => o.read.pos30 >= 0.85 },
  { name: "M5 perto da maxima e participacao", pick: (o) => o.read.pos30 >= 0.85 && o.read.held.participacao },
  { name: "M6 acima da media de 50 dias", pick: (o) => o.x.aboveSma50 },
  { name: "M7 acima da media de 50 e participacao", pick: (o) => o.x.aboveSma50 && o.read.held.participacao },
  { name: "M8 liquidez alta (tercil)", pick: (o) => o.x.liqTercile === 2 },
  { name: "M9 liquidez baixa (tercil)", pick: (o) => o.x.liqTercile === 0 },
  { name: "M10 forca 30d e liquidez alta", pick: (o) => o.x.ret30Pct >= 0.8 && o.x.liqTercile === 2 },
  { name: "M11 volatilidade baixa (tercil)", pick: (o) => o.x.atrTercile === 0 },
  { name: "M12 forca 30d e acima da media de 50", pick: (o) => o.x.ret30Pct >= 0.8 && o.x.aboveSma50 },
];

interface Stat {
  readonly n: number;
  readonly days: number;
  readonly meanRaw: number;
  readonly meanExcess: number;
  readonly medianExcess: number;
  readonly hit: number;
  readonly t: number;
}

const mean = (xs: readonly number[]): number => xs.reduce((s, x) => s + x, 0) / xs.length;
const sd = (xs: readonly number[]): number => {
  const m = mean(xs);
  return Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / Math.max(1, xs.length - 1));
};
const median = (xs: readonly number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length === 0 ? NaN : s.length % 2 ? s[(s.length - 1) / 2]! : (s[s.length / 2 - 1]! + s[s.length / 2]!) / 2;
};

/** Mean return of every pair in the sample on each day, the benchmark the excess is taken against. */
function dayMeans(obs: readonly Obs[], h: number): Map<number, number> {
  const sums = new Map<number, { s: number; n: number }>();
  for (const o of obs) {
    const r = o.ret[h];
    if (r === undefined) continue;
    const e = sums.get(o.day) ?? { s: 0, n: 0 };
    e.s += r;
    e.n += 1;
    sums.set(o.day, e);
  }
  return new Map([...sums].map(([d, e]) => [d, e.s / e.n]));
}

function evaluate(obs: readonly Obs[], group: Group, h: number, bench: Map<number, number>): Stat | null {
  const picked = obs.filter((o) => o.ret[h] !== undefined && group.pick(o));
  if (picked.length === 0) return null;
  const excess = picked.map((o) => o.ret[h]! - bench.get(o.day)!);
  const perDay = new Map<number, number[]>();
  picked.forEach((o, i) => perDay.set(o.day, [...(perDay.get(o.day) ?? []), excess[i]!]));
  const dayExcess = [...perDay.values()].map(mean);
  const t = dayExcess.length > 2 ? (mean(dayExcess) / (sd(dayExcess) / Math.sqrt(dayExcess.length))) / Math.sqrt(h) : NaN;
  return { n: picked.length, days: perDay.size, meanRaw: mean(picked.map((o) => o.ret[h]!)), meanExcess: mean(excess), medianExcess: median(excess), hit: picked.filter((o) => o.ret[h]! > 0).length / picked.length, t };
}

const pct = (x: number): string => (Number.isFinite(x) ? `${(x * 100).toFixed(2)}%` : "-");

function report(obs: readonly Obs[], label: string, h: number): string[] {
  const bench = dayMeans(obs, h);
  const lines = [`\n### ${label}, horizonte ${h} dias (n = ${obs.filter((o) => o.ret[h] !== undefined).length} pares-dia)`, "| grupo | n | dias | media bruta | excesso medio | excesso mediano | acerto | t (ajustado) |", "| --- | --- | --- | --- | --- | --- | --- | --- |"];
  for (const g of GROUPS) {
    const s = evaluate(obs, g, h, bench);
    lines.push(s === null ? `| ${g.name} | 0 | 0 | - | - | - | - | - |` : `| ${g.name} | ${s.n} | ${s.days} | ${pct(s.meanRaw)} | ${pct(s.meanExcess)} | ${pct(s.medianExcess)} | ${(s.hit * 100).toFixed(0)}% | ${Number.isFinite(s.t) ? s.t.toFixed(2) : "-"} |`);
  }
  return lines;
}

/**
 * The learner, the way the project accepts one: a regularised logistic regression on the same daily features, trained only on what came BEFORE each block of time (with the 7 day label
 * window and one more day purged), and judged only on the blocks it never saw. If it cannot beat a coin on those blocks, the screen is not told it can.
 */
const FEATURE_NAMES = ["pos30", "drawdown90", "rsi14", "logVolRatio", "ret7", "ret30", "aboveSma50", "atrPct", "logMeanVol30", "room", "gap"] as const;

function featuresOf(o: Obs): number[] {
  const r = o.read;
  return [r.pos30, r.drawdown90, (r.rsi14 ?? 50) / 100, Math.log(Math.max(0.05, r.volRatio ?? 1)), o.x.ret7, o.x.ret30, o.x.aboveSma50 ? 1 : 0, r.atrPct ?? 0.05, Math.log(Math.max(1, r.meanVol30)), Math.min(r.roomToHigh30, 2), Math.min(r.gapToLow30, 2)];
}

function auc(scores: readonly number[], labels: readonly number[]): number {
  const idx = scores.map((s, i) => i).sort((a, b) => scores[a]! - scores[b]!);
  let rankSum = 0;
  let positives = 0;
  idx.forEach((original, rank) => {
    if (labels[original] === 1) {
      rankSum += rank + 1;
      positives += 1;
    }
  });
  const negatives = labels.length - positives;
  return positives === 0 || negatives === 0 ? NaN : (rankSum - (positives * (positives + 1)) / 2) / (positives * negatives);
}

function learner(obs: readonly Obs[], h: number): string[] {
  const bench = dayMeans(obs, h);
  const rows = obs.filter((o) => o.ret[h] !== undefined).map((o) => ({ o, x: featuresOf(o), excess: o.ret[h]! - bench.get(o.day)! }));
  const days = [...new Set(rows.map((r) => r.o.day))].sort((a, b) => a - b);
  const start = Math.floor(days.length * 0.5);
  const folds = 5;
  const size = Math.ceil((days.length - start) / folds);
  const test: { day: number; prob: number; excess: number; y: number; fold: number }[] = [];
  for (let f = 0; f < folds; f += 1) {
    const from = days[start + f * size];
    const until = days[Math.min(days.length - 1, start + (f + 1) * size - 1)];
    if (from === undefined || until === undefined) break;
    const train = rows.filter((r) => r.o.day <= from - h - 1);
    const block = rows.filter((r) => r.o.day >= from && r.o.day <= until);
    if (train.length < 500 || block.length === 0) continue;
    const p = FEATURE_NAMES.length;
    const mu = Array.from({ length: p }, (_, j) => mean(train.map((r) => r.x[j]!)));
    const sigma = Array.from({ length: p }, (_, j) => sd(train.map((r) => r.x[j]!)) || 1);
    const clip = (v: number) => Math.max(-4, Math.min(4, v));
    const X = new Float64Array(train.length * p);
    train.forEach((r, i) => r.x.forEach((v, j) => (X[i * p + j] = clip((v - mu[j]!) / sigma[j]!))));
    const model = trainLogistic(X, Uint8Array.from(train.map((r) => (r.excess > 0 ? 1 : 0))), train.length, p, { l2: 50 });
    for (const r of block) test.push({ day: r.o.day, prob: predictLogistic(model, r.x.map((v, j) => clip((v - mu[j]!) / sigma[j]!))), excess: r.excess, y: r.excess > 0 ? 1 : 0, fold: f });
  }
  const lines = [`
### Aprendizado: regressao logistica, caminhada para frente, horizonte ${h} dias (n = ${test.length} pares-dia fora da amostra, ${folds} blocos)`];
  if (test.length === 0) return [...lines, "sem dados suficientes"];
  const all = auc(test.map((t) => t.prob), test.map((t) => t.y));
  lines.push(`AUC fora da amostra: ${all.toFixed(3)} (0,500 e uma moeda). Taxa de acerto da base: ${(mean(test.map((t) => t.y)) * 100).toFixed(1)}%.`);
  const sorted = [...test].sort((a, b) => a.prob - b.prob);
  const q = (i: number, n: number) => sorted.slice(Math.floor((i * sorted.length) / n), Math.floor(((i + 1) * sorted.length) / n));
  lines.push("| quintil da probabilidade | n | excesso medio | acerto |", "| --- | --- | --- | --- |");
  for (let i = 0; i < 5; i += 1) {
    const g = q(i, 5);
    lines.push(`| ${i + 1}${i === 4 ? " (mais alta)" : i === 0 ? " (mais baixa)" : ""} | ${g.length} | ${pct(mean(g.map((t) => t.excess)))} | ${(mean(g.map((t) => t.y)) * 100).toFixed(0)}% |`);
  }
  const top = q(4, 5);
  const perDay = new Map<number, number[]>();
  for (const t of top) perDay.set(t.day, [...(perDay.get(t.day) ?? []), t.excess]);
  const dayEx = [...perDay.values()].map(mean);
  const tstat = dayEx.length > 2 ? (mean(dayEx) / (sd(dayEx) / Math.sqrt(dayEx.length))) / Math.sqrt(h) : NaN;
  lines.push(`Quintil mais alto: excesso medio ${pct(mean(top.map((t) => t.excess)))}, t ajustado ${Number.isFinite(tstat) ? tstat.toFixed(2) : "-"} (dias: ${perDay.size}).`);
  for (let f = 0; f < folds; f += 1) {
    const inFold = test.filter((t) => t.fold === f);
    if (inFold.length === 0) continue;
    const thr = [...inFold].sort((a, b) => a.prob - b.prob)[Math.floor(inFold.length * 0.8)]!.prob;
    const topFold = inFold.filter((t) => t.prob >= thr);
    lines.push(`- bloco ${f + 1}: n = ${inFold.length}, AUC ${auc(inFold.map((t) => t.prob), inFold.map((t) => t.y)).toFixed(3)}, excesso do quintil mais alto ${pct(mean(topFold.map((t) => t.excess)))}`);
  }
  return lines;
}

/**
 * Positioning, the factor the person asked for: the funding rate of the perpetual (what the longs pay the shorts, or the opposite). The public history reaches only the last three months, so this
 * is a SHORT window of one regime and says little: it is written down with that limit. The hypotheses were fixed before looking: the lowest quintile of the day (shorts crowded, they pay the
 * longs) should do better than the average, and the highest quintile (longs crowded) worse.
 */
type Funding = Record<string, { readonly t: number; readonly rate: number }[]>;
const FUNDING_CACHE = "data/research/opportunity-funding.json";

async function loadFunding(pairs: readonly string[], refresh: boolean): Promise<Funding> {
  if (!refresh && existsSync(FUNDING_CACHE)) return JSON.parse(readFileSync(FUNDING_CACHE, "utf8")) as Funding;
  const out: Funding = {};
  let n = 0;
  for (const pair of pairs) {
    const swap = pair + "-SWAP";
    const rows: { t: number; rate: number }[] = [];
    let after = "";
    for (let page = 0; page < 4; page += 1) {
      const url = "https://www.okx.com/api/v5/public/funding-rate-history?instId=" + swap + "&limit=100" + (after === "" ? "" : "&after=" + after);
      type FundingBody = { code?: string; data?: { fundingRate: string; fundingTime: string }[] };
      const body: FundingBody | null = await (async (): Promise<FundingBody | null> => {
        try {
          return (await (await fetch(url)).json()) as FundingBody;
        } catch {
          return null;
        }
      })();
      await new Promise((r) => setTimeout(r, 140));
      if (body === null || body.code !== "0" || !Array.isArray(body.data) || body.data.length === 0) break;
      for (const d of body.data) {
        const rate = Number(d.fundingRate);
        const t = Number(d.fundingTime);
        if (Number.isFinite(rate) && Number.isFinite(t)) rows.push({ t, rate });
      }
      after = body.data[body.data.length - 1]!.fundingTime;
      if (body.data.length < 100) break;
    }
    if (rows.length > 0) out[pair] = rows.sort((a, b) => a.t - b.t);
    n += 1;
    if (n % 25 === 0) console.log("  funding " + n + "/" + pairs.length);
  }
  writeFileSync(FUNDING_CACHE, JSON.stringify(out));
  return out;
}

function positioning(obs: Obs[], funding: Funding): string[] {
  const lines = ["### Posicionamento: funding do perpetuo (janela curta, ultimos 3 meses)"];
  const used: Obs[] = [];
  for (const o of obs) {
    const rows = funding[o.pair];
    if (rows === undefined) continue;
    const window = rows.filter((r) => r.t <= o.closeMs && r.t > o.closeMs - 3 * DAY);
    if (window.length < 2) continue;
    o.x.funding = mean(window.map((r) => r.rate));
    used.push(o);
  }
  // the quintile of the day, among the pairs that have a perpetual
  const byDay = new Map<number, Obs[]>();
  for (const o of used) byDay.set(o.day, [...(byDay.get(o.day) ?? []), o]);
  for (const list of byDay.values()) {
    const sorted = [...list].sort((a, b) => a.x.funding! - b.x.funding!);
    sorted.forEach((o, i) => (o.x.fundingPct = list.length > 1 ? i / (list.length - 1) : 0.5));
  }
  if (used.length === 0) return [...lines, "sem dados"];
  const days = [...new Set(used.map((o) => o.day))].sort((a, b) => a - b);
  lines.push("Amostra: " + used.length + " pares-dia, " + days.length + " dias, de " + fmtDay(days[0]!) + " a " + fmtDay(days[days.length - 1]!) + ".");
  const groups: Group[] = [
    { name: "todos com perpetuo", pick: () => true },
    { name: "P1 funding no quintil mais baixo", pick: (o) => o.x.fundingPct <= 0.2 },
    { name: "P2 funding no quintil mais alto", pick: (o) => o.x.fundingPct >= 0.8 },
    { name: "P3 funding negativo (3 dias)", pick: (o) => o.x.funding! < 0 },
  ];
  const mid = days[Math.floor(days.length / 2)]!;
  for (const h of [3, 7] as const) {
    for (const [label, subset] of [["primeira metade", used.filter((o) => o.day < mid)], ["segunda metade", used.filter((o) => o.day >= mid)]] as const) {
      const bench = dayMeans(subset, h);
      lines.push("#### " + label + ", horizonte " + h + " dias (n = " + subset.filter((o) => o.ret[h] !== undefined).length + ")", "| grupo | n | dias | excesso medio | acerto | t (ajustado) |", "| --- | --- | --- | --- | --- | --- |");
      for (const g of groups) {
        const s = evaluate(subset, g, h, bench);
        lines.push(s === null ? "| " + g.name + " | 0 | 0 | - | - | - |" : "| " + g.name + " | " + s.n + " | " + s.days + " | " + pct(s.meanExcess) + " | " + (s.hit * 100).toFixed(0) + "% | " + (Number.isFinite(s.t) ? s.t.toFixed(2) : "-") + " |");
      }
    }
  }
  return lines;
}

const panel = await load(arg("pairs", 200), arg("days", 420), process.argv.includes("--refresh"));
const obs = observations(panel);
crossSection(obs);
const days = [...new Set(obs.map((o) => o.day))].sort((a, b) => a - b);
const cut = days[Math.floor(days.length * 0.6)]!;
const first = obs.filter((o) => o.day < cut);
const last = obs.filter((o) => o.day >= cut);
const fmtDay = (d: number) => new Date(d * DAY).toISOString().slice(0, 10);

const out: string[] = [
  `# Medicao dos fatores do motor de oportunidades`,
  `Gerado por scripts/opportunity-backtest.ts. Limites fixados antes da medicao: ${JSON.stringify(R)}.`,
  `Amostra: ${Object.keys(panel).length} pares, ${obs.length} pares-dia, de ${fmtDay(days[0]!)} a ${fmtDay(days[days.length - 1]!)}; olhar = ate ${fmtDay(cut - 1)}, confirmar = de ${fmtDay(cut)}. Custo de ${COST * 100}% na ida e volta.`,
];
for (const h of HORIZONS) {
  out.push(...report(first, "Primeiros 60% dos dias (para olhar)", h));
  out.push(...report(last, "Ultimos 40% dos dias (para confirmar)", h));
}
if (process.argv.includes("--funding")) out.push(...positioning(obs, await loadFunding(Object.keys(panel), process.argv.includes("--refresh-funding"))));
out.push(...learner(obs, 7));
out.push(...learner(obs, 14));
console.log(out.join("\n"));
writeFileSync("data/research/opportunity-backtest.md", out.join("\n"));
