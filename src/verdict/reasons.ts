/**
 * Reasons in plain words (INT-1.2, VER-5): a fixed dictionary from measured numbers to short sentences, so that a person who has
 * never heard of an order block can read why the model's answer looks reasonable, and what could go against it. Pure. Every
 * sentence is plain ASCII with no dash and no middle dot, and states a measurement, never a prediction.
 *
 * A rule looks at the FeatureVector's values and may speak for the buy side, the sell side or both. The priorities are priors
 * (nothing measured says one reason matters more than another) and only order the sentences.
 */
export type Side = "compra" | "venda";

export interface Reason {
  readonly id: string;
  readonly side: Side;
  readonly text: string;
  readonly weight: number;
}

type Values = Readonly<Record<string, number | null | undefined>>;
type Rule = (v: Values) => Reason[];

const get = (v: Values, name: string): number | null => {
  const x = v[name];
  return typeof x === "number" && Number.isFinite(x) ? x : null;
};
const comma = (n: number, digits: number): string => n.toFixed(digits).replace(".", ",");
const SIDE_UP: Record<Side, string> = { compra: "de alta", venda: "de baixa" };

function both(id: string, weight: number, text: string): Reason[] {
  return [{ id, side: "compra", text, weight }, { id, side: "venda", text, weight }];
}

const RULES: readonly Rule[] = [
  // trend of the hour and of four hours
  (v) => {
    const h1 = get(v, "trend.ema1h");
    const h4 = get(v, "trend.ema4h");
    if (h1 === null && h4 === null) return [];
    const dir = (x: number | null): Side | null => (x === 1 ? "compra" : x === -1 ? "venda" : null);
    const a = dir(h1);
    const b = dir(h4);
    if (a !== null && a === b) return [{ id: "tendencia_1h_4h", side: a, text: `A tendencia de 1 hora e de 4 horas e ${SIDE_UP[a]}.`, weight: 0.9 }];
    if (a !== null && b === null) return [{ id: "tendencia_1h", side: a, text: `A tendencia de 1 hora e ${SIDE_UP[a]}.`, weight: 0.4 }];
    if (b !== null && a === null) return [{ id: "tendencia_4h", side: b, text: `A tendencia de 4 horas e ${SIDE_UP[b]}.`, weight: 0.4 }];
    return [];
  },
  (v) => {
    const regime = get(v, "trend.regime15m");
    const adx = get(v, "trend.adx15m");
    if (regime === null || regime === 0) return [];
    const side: Side = regime === 1 ? "compra" : "venda";
    return [{ id: "regime_15m", side, text: `Tendencia ${SIDE_UP[side]} de 15 minutos${adx === null ? "" : `, com forca (ADX ${comma(adx, 0)})`}.`, weight: 0.6 }];
  },
  // the structure: a break of the last swing, how long ago
  ...(["smc15", "smc1h"] as const).map((prefix): Rule => (v) => {
    const dir = get(v, `${prefix}.breakDir`);
    const age = get(v, `${prefix}.breakAge`);
    const choch = get(v, `${prefix}.breakChoch`);
    if (dir === null || age === null || age > 12) return [];
    const side: Side = dir === 1 ? "compra" : "venda";
    const frame = prefix === "smc15" ? "15 minutos" : "1 hora";
    const word = choch === 1 ? "virou" : "seguiu";
    return [{ id: `estrutura_${prefix}`, side, text: `A estrutura de ${frame} ${word} para ${side === "compra" ? "cima" : "baixo"} ha ${comma(age, 0)} ${age === 1 ? "vela" : "velas"}.`, weight: (choch === 1 ? 0.7 : 0.5) + (prefix === "smc1h" ? 0.1 : 0) }];
  }),
  // where the price sits inside the last range
  ...(["smc1h", "smc15"] as const).map((prefix): Rule => (v) => {
    const pos = get(v, `${prefix}.rangePos`);
    if (pos === null) return [];
    const frame = prefix === "smc15" ? "15 minutos" : "1 hora";
    const w = prefix === "smc1h" ? 0.5 : 0.3;
    if (pos <= 0.35) return [{ id: `faixa_${prefix}`, side: "compra", text: `O preco esta na parte barata da faixa de ${frame}.`, weight: w }];
    if (pos >= 0.65) return [{ id: `faixa_${prefix}`, side: "venda", text: `O preco esta na parte cara da faixa de ${frame}.`, weight: w }];
    return [];
  }),
  // liquidity taken and given back
  (v) => {
    const kind = get(v, "smc15.sweepKind");
    const age = get(v, "smc15.sweepAge");
    if (kind === null || age === null || age > 12) return [];
    return kind === 1
      ? [{ id: "varrida_15m", side: "compra", text: "O preco varreu as minimas recentes e voltou (retirada de liquidez).", weight: 0.6 }]
      : [{ id: "varrida_15m", side: "venda", text: "O preco varreu as maximas recentes e voltou (retirada de liquidez).", weight: 0.6 }];
  },
  // the flow
  (v) => {
    const side = get(v, "flow.absorbSide");
    if (side === 1) return [{ id: "absorcao", side: "compra", text: "Vendas agressivas foram absorvidas: o preco nao caiu apesar delas.", weight: 0.7 }];
    if (side === -1) return [{ id: "absorcao", side: "venda", text: "Compras agressivas foram absorvidas: o preco nao subiu apesar delas.", weight: 0.7 }];
    return [];
  },
  (v) => {
    const delta = get(v, "flow.deltaRatio");
    if (delta === null) return [];
    if (delta >= 0.2) return [{ id: "delta", side: "compra", text: `Mais compra do que venda agressiva no ultimo minuto (${comma(delta * 100, 0)}% a mais).`, weight: 0.4 }];
    if (delta <= -0.2) return [{ id: "delta", side: "venda", text: `Mais venda do que compra agressiva no ultimo minuto (${comma(-delta * 100, 0)}% a mais).`, weight: 0.4 }];
    return [];
  },
  // the nearest zone on each side
  (v) => {
    const out: Reason[] = [];
    const dNota = get(v, "zone.demandNota");
    const dBps = get(v, "zone.demandBps");
    if (dNota !== null && dBps !== null && dNota >= 40 && dBps <= 50) out.push({ id: "zona_demanda", side: "compra", text: `Ha uma zona de demanda logo abaixo do preco (forca ${comma(dNota, 0)}).`, weight: Math.min(0.8, dNota / 100) });
    const sNota = get(v, "zone.supplyNota");
    const sBps = get(v, "zone.supplyBps");
    if (sNota !== null && sBps !== null && sNota >= 40 && sBps <= 50) out.push({ id: "zona_oferta", side: "venda", text: `Ha uma zona de oferta logo acima do preco (forca ${comma(sNota, 0)}).`, weight: Math.min(0.8, sNota / 100) });
    return out;
  },
  // stretched price and the cost of holding a perpetual
  (v) => {
    const ext = get(v, "trend.extAtr15m");
    if (ext === null) return [];
    if (ext >= 2.5) return [{ id: "esticado", side: "venda", text: `O preco esta esticado acima da media de 15 minutos (${comma(ext, 1)} vezes o movimento tipico).`, weight: 0.3 }];
    if (ext <= -2.5) return [{ id: "esticado", side: "compra", text: `O preco esta esticado abaixo da media de 15 minutos (${comma(-ext, 1)} vezes o movimento tipico).`, weight: 0.3 }];
    return [];
  },
  (v) => {
    const rsi = get(v, "mom.rsi15m");
    if (rsi === null) return [];
    if (rsi >= 75) return [{ id: "rsi", side: "venda", text: `O RSI de 15 minutos esta em ${comma(rsi, 0)}: o preco subiu depressa demais.`, weight: 0.3 }];
    if (rsi <= 25) return [{ id: "rsi", side: "compra", text: `O RSI de 15 minutos esta em ${comma(rsi, 0)}: o preco caiu depressa demais.`, weight: 0.3 }];
    return [];
  },
  (v) => {
    const funding = get(v, "drv.fundingBps");
    if (funding === null) return [];
    if (funding >= 5) return [{ id: "funding", side: "venda", text: "Quem esta comprado paga caro para manter a posicao (funding alto).", weight: 0.3 }];
    if (funding <= -5) return [{ id: "funding", side: "compra", text: "Quem esta vendido paga caro para manter a posicao (funding negativo).", weight: 0.3 }];
    return [];
  },
  // the cost against the usual move: a reason to act at all, for either side
  (v) => {
    const ratio = get(v, "cost.moveToCost1h");
    return ratio !== null && ratio >= 3 ? both("custo_folgado", 0.3, `O movimento tipico de 1 hora e ${comma(ratio, 1)} vezes o custo de entrar e sair.`) : [];
  },
];

/** Everything the dictionary has to say about these numbers, strongest first. */
export function allReasons(values: Values): Reason[] {
  return RULES.flatMap((rule) => rule(values)).sort((a, b) => b.weight - a.weight || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/** Up to `max` reasons in favour of the side, strongest first. */
export function prosFor(values: Values, side: Side, max = 3): Reason[] {
  return allReasons(values).filter((r) => r.side === side).slice(0, max);
}

/** The strongest reason against the side, with the volatility caution when the numbers ask for one. */
export function riskSentence(values: Values, side: Side): string | null {
  const against = allReasons(values).find((r) => r.side !== side && r.id !== "custo_folgado");
  if (against !== undefined) return `Contra: ${lowerFirst(against.text)}`;
  const rank = get(values, "vol.rank24h");
  if (rank !== null && rank >= 0.9) return "A volatilidade esta entre as mais altas das ultimas 24 horas: movimentos bruscos sao mais comuns.";
  const ratio = get(values, "cost.moveToCost1h");
  if (ratio !== null && ratio < 2) return `O custo de entrar e sair pesa: o movimento tipico de 1 hora e so ${comma(ratio, 1)} vezes ele.`;
  return null;
}

/** Why nothing is the answer: the numbers point both ways, or they point nowhere. */
export function whyWait(values: Values): string {
  const strong = (side: Side) => allReasons(values).filter((r) => r.side === side && r.weight >= 0.5).length;
  return strong("compra") > 0 && strong("venda") > 0 ? "Os sinais apontam para os dois lados." : "Nao ha sinal claro nos numeros de agora.";
}

const lowerFirst = (s: string): string => (s.length === 0 ? s : s[0]!.toLowerCase() + s.slice(1));

/** Every feature a reason reads must exist, so renaming one in the FeatureVector breaks a test instead of silencing a reason. */
export const FEATURES_READ: readonly string[] = [
  "trend.ema1h", "trend.ema4h", "trend.regime15m", "trend.adx15m", "smc15.breakDir", "smc15.breakAge", "smc15.breakChoch", "smc1h.breakDir", "smc1h.breakAge", "smc1h.breakChoch",
  "smc1h.rangePos", "smc15.rangePos", "smc15.sweepKind", "smc15.sweepAge", "flow.absorbSide", "flow.deltaRatio", "zone.demandNota", "zone.demandBps", "zone.supplyNota", "zone.supplyBps",
  "trend.extAtr15m", "mom.rsi15m", "drv.fundingBps", "cost.moveToCost1h", "vol.rank24h",
];
