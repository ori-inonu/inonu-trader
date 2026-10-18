/**
 * Computes the FeatureVector v1 from closed bars, the flow engine's reading and the costs. Pure. The definitions follow the
 * Python analytics pack (`python/jev_analytics/features.py`) where one exists, so the model and the learner see the same
 * measures; those that exist only here (flow, zones, cost over one hour) are documented next to the code.
 *
 * A section that cannot be computed leaves its names `null` and writes the reason in `nulos`. Nothing is filled in.
 */
import { adx, atr, beta, bollinger, corr, donchian, efficiencyRatio, ema, logReturns, macd, rank, rollingStdev, rsi } from "../ta/indicators";
import { analyzeSmc, smcContext } from "../ta/smc";
import { FEATURE_NAMES, FEATURE_VERSION, INTERVALS, INTERVAL_MS, SMC_FIELD_NAMES, type Bar, type FeatureInput, type FeatureVector, type FlowInput, type Interval } from "./types";

const ADX_TREND_MIN = 25;
const STALE_BARS = 3;
const MIN_TREND_BARS = 60;
const MIN_EMA_BARS = 50;
const MIN_SMC_BARS = 40;
const SMC_PIVOT = 3;

type Values = Record<string, number | null>;

const finite = (v: number | null | undefined): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const round = (v: number | null, digits: number): number | null => {
  const f = finite(v);
  return f === null ? null : Math.round(f * 10 ** digits) / 10 ** digits + 0;
};

/** The bars that were closed at `asOfMs`, oldest first, one per open time. Anything else cannot reach a value. */
export function closedBars(bars: readonly Bar[] | undefined, interval: Interval, asOfMs: number): Bar[] {
  if (bars === undefined) return [];
  const ms = INTERVAL_MS[interval];
  const byTs = new Map<number, Bar>();
  for (const b of bars) {
    if (!b.confirmed || b.ts + ms > asOfMs) continue;
    if (![b.open, b.high, b.low, b.close].every((n) => Number.isFinite(n) && n > 0) || b.high < b.low) continue;
    byTs.set(b.ts, b);
  }
  return [...byTs.values()].sort((a, b) => a.ts - b.ts);
}

const cols = (bars: readonly Bar[]) => ({ o: bars.map((b) => b.open), h: bars.map((b) => b.high), l: bars.map((b) => b.low), c: bars.map((b) => b.close) });
const last = <T>(xs: readonly (T | null)[]): T | null => (xs.length === 0 ? null : (xs[xs.length - 1] ?? null));

function emaStack(closes: readonly number[]): number | null {
  const e20 = last(ema(closes, 20));
  const e50 = last(ema(closes, 50));
  if (e20 === null || e50 === null) return null;
  const c = closes[closes.length - 1]!;
  return c > e20 && e20 > e50 ? 1 : c < e20 && e20 < e50 ? -1 : 0;
}

export function computeFeatures(input: FeatureInput): FeatureVector {
  const values: Values = {};
  const nulos: Record<string, string> = {};
  const idades: Record<string, number> = {};
  for (const name of FEATURE_NAMES) values[name] = null;

  const set = (name: string, value: number | null, reason: string): void => {
    const v = finite(value);
    values[name] = v;
    if (v === null) nulos[name] = reason;
  };
  const section = (names: readonly string[], reason: string): void => {
    for (const n of names) if (values[n] === null && nulos[n] === undefined) nulos[n] = reason;
  };

  const { asOfMs, price } = input;
  if (!(price > 0) || !Number.isFinite(price)) throw new RangeError("price must be a positive number");

  // bars closed at asOfMs, and whether each interval is fresh enough to say anything
  const bars: Record<Interval, Bar[]> = { "5m": [], "15m": [], "1h": [], "4h": [] };
  for (const interval of INTERVALS) {
    const closed = closedBars(input.bars[interval], interval, asOfMs);
    const tail = closed[closed.length - 1];
    if (tail !== undefined) {
      const age = asOfMs - (tail.ts + INTERVAL_MS[interval]);
      idades[`bars${interval}`] = age;
      bars[interval] = age > STALE_BARS * INTERVAL_MS[interval] ? [] : closed;
      if (age > STALE_BARS * INTERVAL_MS[interval]) nulos[`bars${interval}`] = "velas_velhas";
    } else {
      nulos[`bars${interval}`] = "sem_velas";
    }
  }
  const b5 = bars["5m"];
  const b15 = bars["15m"];
  const b1h = bars["1h"];
  const b4h = bars["4h"];

  // ---- trend (15m for the regime, 1h and 4h for the stack)
  const trendNames = ["trend.regime15m", "trend.adx15m", "trend.eff15m", "trend.ema15m", "trend.extAtr15m"];
  if (b15.length >= MIN_TREND_BARS) {
    const { h, l, c } = cols(b15);
    const a = adx(h, l, c, 14);
    const adxV = last(a.adx);
    const pdi = last(a.plusDi);
    const mdi = last(a.minusDi);
    const atrV = last(atr(h, l, c, 14));
    const e50 = last(ema(c, 50));
    const eff = efficiencyRatio(c, 20);
    if (adxV !== null && pdi !== null && mdi !== null) {
      set("trend.regime15m", adxV >= ADX_TREND_MIN && pdi > mdi ? 1 : adxV >= ADX_TREND_MIN && mdi > pdi ? -1 : 0, "");
      set("trend.adx15m", round(adxV, 2), "adx_indisponivel");
    }
    set("trend.eff15m", round(eff, 3), "serie_plana");
    set("trend.ema15m", emaStack(c), "poucas_velas");
    if (atrV !== null && atrV > 0 && e50 !== null) set("trend.extAtr15m", round((price - e50) / atrV, 2), "atr_indisponivel");
  }
  section(trendNames, b15.length >= MIN_TREND_BARS ? "indisponivel" : "poucas_velas_15m");
  if (b1h.length >= MIN_EMA_BARS) set("trend.ema1h", emaStack(b1h.map((b) => b.close)), "poucas_velas");
  else nulos["trend.ema1h"] = "poucas_velas_1h";
  if (b4h.length >= MIN_EMA_BARS) set("trend.ema4h", emaStack(b4h.map((b) => b.close)), "poucas_velas");
  else nulos["trend.ema4h"] = "poucas_velas_4h";

  // ---- momentum
  const rsiOf = (series: Bar[], name: string, interval: string): void => {
    if (series.length >= 30) set(name, round(last(rsi(series.map((b) => b.close), 14)), 1), "serie_plana");
    else nulos[name] = `poucas_velas_${interval}`;
  };
  rsiOf(b5, "mom.rsi5m", "5m");
  rsiOf(b15, "mom.rsi15m", "15m");
  rsiOf(b1h, "mom.rsi1h", "1h");
  if (b15.length >= 60) {
    const { h, l, c } = cols(b15);
    const atrV = last(atr(h, l, c, 14));
    const hist = last(macd(c, 12, 26, 9).hist);
    if (atrV !== null && atrV > 0 && hist !== null) set("mom.macdAtr15m", round(hist / atrV, 3), "indisponivel");
  }
  section(["mom.macdAtr15m"], b15.length >= 60 ? "indisponivel" : "poucas_velas_15m");

  // ---- volatility
  let atrBps1h: number | null = null;
  if (b15.length >= 30) {
    const { h, l, c } = cols(b15);
    const v = last(atr(h, l, c, 14));
    if (v !== null) set("vol.atrBps15m", round((v / price) * 10_000, 1), "indisponivel");
    const bb = bollinger(c, 20, 2);
    set("vol.bbPctB15m", round(last(bb.percentB), 2), "serie_plana");
    const widths = bb.width.filter((w): w is number => w !== null).slice(-100);
    if (widths.length >= 30) set("vol.bbWidthRank15m", round(rank(widths[widths.length - 1]!, widths), 3), "indisponivel");
  }
  section(["vol.atrBps15m", "vol.bbPctB15m", "vol.bbWidthRank15m"], b15.length >= 30 ? "historico_curto" : "poucas_velas_15m");
  if (b1h.length >= 30) {
    const { h, l, c } = cols(b1h);
    const v = last(atr(h, l, c, 14));
    if (v !== null) {
      atrBps1h = round((v / price) * 10_000, 1);
      set("vol.atrBps1h", atrBps1h, "indisponivel");
    }
  }
  section(["vol.atrBps1h"], "poucas_velas_1h");
  if (b5.length >= 60) {
    const closes = b5.slice(-289).map((b) => b.close);
    const windows = rollingStdev(logReturns(closes), 12);
    if (windows.length >= 40) set("vol.rank24h", round(rank(windows[windows.length - 1]!, windows), 3), "indisponivel");
  }
  section(["vol.rank24h"], "poucas_velas_5m");

  // ---- structure: position in the 24 hour range, and the smart money digests
  if (b1h.length >= 24) {
    const { h, l } = cols(b1h);
    const d = donchian(h, l, 24);
    const up = last(d.upper);
    const lo = last(d.lower);
    if (up !== null && lo !== null && up > lo) set("str.donchianPos1h", round((price - lo) / (up - lo), 3), "indisponivel");
  }
  section(["str.donchianPos1h"], "poucas_velas_1h");
  const smcBlock = (prefix: "smc15" | "smc1h", series: Bar[]): void => {
    const names = SMC_FIELD_NAMES.map((f) => `${prefix}.${f}`);
    if (series.length < MIN_SMC_BARS) {
      section(names, "poucas_velas");
      return;
    }
    const { o, h, l, c } = cols(series);
    const ctx = smcContext(analyzeSmc(o, h, l, c, SMC_PIVOT, price), price);
    const put = (field: (typeof SMC_FIELD_NAMES)[number], value: number | null, reason: string, digits = 1): void => set(`${prefix}.${field}`, round(value, digits), reason);
    put("demandBps", ctx.demandBlockBps, "sem_bloco_aberto");
    put("supplyBps", ctx.supplyBlockBps, "sem_bloco_aberto");
    put("gapsUp", ctx.gapsUp, "indisponivel", 0);
    put("gapsDown", ctx.gapsDown, "indisponivel", 0);
    put("gapNearestBps", ctx.gapNearestBps, "sem_lacuna_aberta");
    put("rangePos", ctx.rangePos, "sem_faixa", 3);
    put("breakDir", ctx.lastBreak === null ? null : ctx.lastBreak.dir === "up" ? 1 : -1, "sem_quebra", 0);
    put("breakChoch", ctx.lastBreak === null ? null : ctx.lastBreak.kind === "CHoCH" ? 1 : 0, "sem_quebra", 0);
    put("breakAge", ctx.lastBreak === null ? null : ctx.lastBreak.ageBars, "sem_quebra", 0);
    put("poolAboveBps", ctx.poolAboveBps, "sem_piscina");
    put("poolBelowBps", ctx.poolBelowBps, "sem_piscina");
    put("sweepKind", ctx.lastSweep === null ? null : ctx.lastSweep.kind === "lows" ? 1 : -1, "sem_varrida", 0);
    put("sweepAge", ctx.lastSweep === null ? null : ctx.lastSweep.ageBars, "sem_varrida", 0);
  };
  smcBlock("smc15", b15);
  smcBlock("smc1h", b1h);

  // ---- derivatives (a perpetual only)
  if (input.regime === undefined || input.regime === null) section(["drv.fundingBps", "drv.oiVar1hPct"], "so_existe_para_perpetuos");
  else {
    set("drv.fundingBps", round(input.regime.funding, 3), "funding_indisponivel");
    set("drv.oiVar1hPct", round(input.regime.oiVar, 3), "aquecimento");
  }

  // ---- cross asset: against BTC on 15 minute closes (48 hours aligned by open time), and the 24 hour relative move
  const btc = input.btc15m === undefined || input.btc15m === null ? [] : closedBars(input.btc15m, "15m", asOfMs);
  if (/^BTC-/.test(input.instId)) section(["x.corrBtc48h", "x.betaBtc48h", "x.relStr24hBps"], "e_o_proprio_btc");
  else if (btc.length === 0 || b15.length === 0) section(["x.corrBtc48h", "x.betaBtc48h", "x.relStr24hBps"], btc.length === 0 ? "btc_nao_lido" : "poucas_velas_15m");
  else {
    const mine = new Map(b15.map((b) => [b.ts, b.close]));
    const aligned = btc.filter((b) => mine.has(b.ts)).slice(-192);
    if (aligned.length >= 100) {
      const a = logReturns(aligned.map((b) => mine.get(b.ts)!));
      const m = logReturns(aligned.map((b) => b.close));
      set("x.corrBtc48h", round(corr(a, m), 3), "serie_plana");
      set("x.betaBtc48h", round(beta(a, m), 3), "serie_plana");
    }
    if (aligned.length >= 97) {
      const n = aligned.length;
      const own = mine.get(aligned[n - 1]!.ts)! / mine.get(aligned[n - 97]!.ts)! - 1;
      const ref = aligned[n - 1]!.close / aligned[n - 97]!.close - 1;
      set("x.relStr24hBps", round((own - ref) * 10_000, 1), "indisponivel");
    }
    section(["x.corrBtc48h", "x.betaBtc48h", "x.relStr24hBps"], "poucas_velas_alinhadas");
  }

  // ---- cost: the spread crossed once on the way in and once out is the quoted spread; fees and slippage come from the lab table
  set("cost.spreadBps", round(input.spreadBps, 2), "spread_desconhecido");
  if (input.spreadBps !== null && Number.isFinite(input.spreadBps) && input.spreadBps >= 0) {
    const roundTrip = input.feeAndSlippageRoundTripBps + input.spreadBps;
    set("cost.roundTripBps", round(roundTrip, 2), "indisponivel");
    if (atrBps1h !== null && roundTrip > 0) set("cost.moveToCost1h", round(atrBps1h / roundTrip, 2), "indisponivel");
  }
  section(["cost.roundTripBps"], "spread_desconhecido");
  section(["cost.moveToCost1h"], atrBps1h === null ? "poucas_velas_1h" : "spread_desconhecido");

  // ---- flow and zones (from the engine; only OKX instruments with a live feed have them)
  flowBlock(input.flow ?? null, input.flowReason ?? "sem_motor_de_fluxo", price, values, nulos, idades);

  const ordered: Values = {};
  for (const name of FEATURE_NAMES) ordered[name] = values[name] ?? null;
  const orderedNulos: Record<string, string> = {};
  for (const key of Object.keys(nulos).sort()) orderedNulos[key] = nulos[key]!;
  return { v: FEATURE_VERSION, instId: input.instId, asOfMs, values: ordered, nulos: orderedNulos, idades };
}

function flowBlock(flow: FlowInput | null, missingReason: string, price: number, values: Values, nulos: Record<string, string>, idades: Record<string, number>): void {
  const flowNames = ["flow.warm", "flow.deltaRatio", "flow.imbC", "flow.imbV", "flow.seqN", "flow.prgN", "flow.exhN", "flow.absorbSide", "flow.absorbRatio", "flow.pocBps", "flow.valBps", "flow.vahBps"];
  const zoneNames = ["zone.demandBps", "zone.demandNota", "zone.demandTested", "zone.demandFamilies", "zone.supplyBps", "zone.supplyNota", "zone.supplyTested", "zone.supplyFamilies", "zone.count"];
  if (flow === null) {
    for (const n of [...flowNames, ...zoneNames]) nulos[n] = missingReason;
    return;
  }
  const put = (name: string, value: number | null, reason: string): void => {
    const v = finite(value);
    values[name] = v;
    if (v === null) nulos[name] = reason;
  };
  const bps = (level: number | null): number | null => (level === null ? null : round(((level - price) / price) * 10_000, 1));
  if (flow.ageMs !== null) idades.flow = flow.ageMs;
  values["flow.warm"] = flow.warm ? 1 : 0;
  put("flow.deltaRatio", round(flow.deltaRatio, 3), "sem_negocios");
  put("flow.pocBps", bps(flow.poc), "sem_negocios");
  put("flow.valBps", bps(flow.val), "sem_negocios");
  put("flow.vahBps", bps(flow.vah), "sem_negocios");
  // everything that needs a learned threshold says so while the engine is warming up
  const why = "aquecimento";
  put("flow.imbC", flow.warm && flow.imb !== null ? flow.imb.c : null, why);
  put("flow.imbV", flow.warm && flow.imb !== null ? flow.imb.v : null, why);
  put("flow.seqN", flow.warm ? flow.seqCount : null, why);
  put("flow.prgN", flow.warm ? flow.prgCount : null, why);
  put("flow.exhN", flow.warm ? flow.exhCount : null, why);
  // absorption of selling is described as demand being absorbed: +1; absorption of buying: -1; none while warm: 0
  if (flow.warm) {
    values["flow.absorbSide"] = flow.absorption === null ? 0 : flow.absorption.side === "v" ? 1 : -1;
    put("flow.absorbRatio", flow.absorption === null ? 0 : round(flow.absorption.volumeRatio, 2), why);
  } else {
    nulos["flow.absorbSide"] = why;
    nulos["flow.absorbRatio"] = why;
  }

  const live = flow.zones.filter((z) => z.estado === "ativa" || z.estado === "testada");
  const nearest = (side: "demanda" | "oferta") => {
    const list = live.filter((z) => z.lado === side);
    const distance = (z: (typeof list)[number]): number => (side === "demanda" ? Math.max(0, price - z.alto) : Math.max(0, z.baixo - price));
    return list.sort((a, b) => distance(a) - distance(b) || b.nota - a.nota)[0] ?? null;
  };
  const describe = (prefix: "demand" | "supply", zone: ReturnType<typeof nearest>): void => {
    if (zone === null) {
      for (const f of ["Bps", "Nota", "Tested", "Families"]) nulos[`zone.${prefix}${f}`] = "sem_zona";
      return;
    }
    const gap = prefix === "demand" ? Math.max(0, price - zone.alto) : Math.max(0, zone.baixo - price);
    values[`zone.${prefix}Bps`] = round((gap / price) * 10_000, 1);
    values[`zone.${prefix}Nota`] = round(zone.nota, 1);
    values[`zone.${prefix}Tested`] = zone.estado === "testada" ? 1 : 0;
    values[`zone.${prefix}Families`] = zone.families;
  };
  describe("demand", nearest("demanda"));
  describe("supply", nearest("oferta"));
  values["zone.count"] = live.length;
}
