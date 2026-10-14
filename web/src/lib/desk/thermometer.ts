/**
 * The thermometer of the desk (INF, ASK): ONE reading that replaces the flow gauge, the derivatives strip and the loose indicators for a person who is not a
 * trader. It says three things in plain words and nothing else: who is in charge of the market right now (buyers or sellers), how far the price is from the
 * nearest zone where buyers or sellers were, and what the Inonu answered the last time it was asked, with a way to ask again.
 *
 * The code DESCRIBES (buyers, sellers, a zone, a distance); it never says what to do. The only words of an order on this panel are the Inonu's own answer,
 * which the model gave after a click and which is shown with its age. Everything here is pure: no clock, no network.
 */

import { planRows, type PlanRow } from "../veredito/lines";
import type { Veredito } from "../veredito/types";
import { profitLines, profitMath } from "./profit-math";
import { bandOf, type Band, type StableReading } from "./stabilize";

export type ThermoTone = "buy" | "sell" | "flat" | "none";

export interface ThermoZone {
  readonly lado: "demanda" | "oferta" | "neutra";
  readonly baixo: number;
  readonly alto: number;
  readonly estado: "ativa" | "testada";
}

export interface ThermoAnswer {
  readonly action: "buy" | "sell" | "hold";
  readonly atMs: number;
  /** The Veredito of that answer, when it had one: its reasons, its plan and, with the costs, what the plan is worth. */
  readonly veredito?: Veredito;
}

export interface ThermoInput {
  /** The 60 second imbalance of the aggressed volume, -1 (all sellers) to 1 (all buyers); null when the feed has not measured it. */
  readonly imbalance: number | null;
  /** How many trades the 60 seconds hold; null when unknown. A handful of trades says nothing about who is in charge. */
  readonly trades?: number | null;
  /** The reading after the steady hand (smoothed, with hysteresis); when it is given the words follow IT, not the raw second. Null: nothing steady yet. */
  readonly stable?: StableReading | null;
  /** The base currency of the instrument (BTC), for the size line of the plan. */
  readonly base?: string;
  /** How the hits of the Inonu are measured, in a sentence (the Placar), so the break even is read against it. */
  readonly measured?: string;
  readonly price: number | null;
  readonly zones: readonly ThermoZone[];
  readonly answer: ThermoAnswer | null;
  readonly nowMs: number;
  /** What the book says about the cost of moving money through it, from the market card; absent when it could not be read. */
  readonly market?: { readonly thickness: "fluido" | "normal" | "raso"; readonly text: string } | null;
}

/** One thing that has to line up before a question to the Inonu is worth its cost. `ok: null` means the code could not read it. */
export interface ThermoCondition {
  readonly id: "zona" | "fluxo" | "lado" | "mercado";
  readonly ok: boolean | null;
  readonly text: string;
}

export interface ThermoScenario {
  readonly conditions: readonly ThermoCondition[];
  /** How many of the conditions hold, of the `known` ones the code could read. */
  readonly aligned: number;
  readonly known: number;
  /** Enough of them line up AND the Inonu has no recent answer: a question now brings news. It describes the moment; it is not an order and it asks nothing. */
  readonly worthAsking: boolean;
  readonly headline: string;
}

export interface Thermometer {
  readonly scenario: ThermoScenario;
  readonly pressure: { readonly tone: ThermoTone; readonly word: string; /** -100 to 100, or null */ readonly pct: number | null };
  readonly zone: { readonly tone: "buy" | "sell" | "flat"; readonly text: string } | null;
  readonly answer: {
    readonly action: ThermoAnswer["action"];
    readonly word: string;
    readonly age: string;
    readonly fresh: boolean;
    /** The reasons in plain words (the Veredito's own, at most two); empty when the answer had none. */
    readonly reasons: readonly string[];
    /** Where to go in, where the idea fails and the target; only for a fresh answer that has a plan. */
    readonly plan: readonly PlanRow[] | null;
    /** What the plan is worth after the costs, in lines; null without a fresh plan. */
    readonly profit: readonly string[] | null;
  } | null;
}

/** An answer older than this is shown as old: the market it was about has moved on. */
export const FRESH_ANSWER_MS = 30 * 60_000;
/** A zone farther than this from the price is not a thing to look at now. */
export const NEAR_ZONE_PCT = 5;
/** A zone farther than this from the price does not count as "near" for the question to the Inonu. */
export const NEAR_ASK_PCT = 1;
/** A side that has been in charge for less than this is not yet a reading to count on. */
export const HOLD_MS = 60_000;
/** This many conditions of the ones that could be read must line up for a question to be worth asking. */
export const MIN_ALIGNED = 3;

/** Fewer trades than this in a minute and the reading is not given: one buyer alone would read as "all buyers". */
export const MIN_TRADES = 30;

const ANSWER_WORD = { buy: "Comprar", sell: "Vender", hold: "Esperar" } as const;

/**
 * The number of trades the guard reads: the count the window really holds. A page that just opened, a reconnect or a new instrument has seen a few seconds, and the rate over those
 * seconds times sixty looks like a busy minute (five trades in ten seconds read as thirty): the guard must not be fooled by it. A reading with no count falls back to the rate.
 */
export function guardTrades(m: { readonly tradesPerSecond60s: number | null; readonly tradeCount60s?: number | null }): number | null {
  if (m.tradeCount60s !== undefined) return m.tradeCount60s;
  return m.tradesPerSecond60s === null ? null : m.tradesPerSecond60s * 60;
}

const BAND_WORD: Readonly<Record<Band, { readonly tone: ThermoTone; readonly word: string }>> = {
  buy2: { tone: "buy", word: "Compradores no comando" },
  buy1: { tone: "buy", word: "Compradores um pouco a frente" },
  flat: { tone: "flat", word: "Equilibrado" },
  sell1: { tone: "sell", word: "Vendedores um pouco a frente" },
  sell2: { tone: "sell", word: "Vendedores no comando" },
};

/** The words of a band with the number to show, or "not enough trades" when the minute was too quiet to say who is in charge. */
export function pressureFromBand(band: Band, pct: number, trades: number | null = null): Thermometer["pressure"] {
  if (trades !== null && Number.isFinite(trades) && trades < MIN_TRADES) return { tone: "none", word: "Pouca negociacao agora", pct: null };
  return { ...BAND_WORD[band], pct };
}

export function pressureOf(imbalance: number | null, trades: number | null = null): Thermometer["pressure"] {
  if (imbalance === null || !Number.isFinite(imbalance)) return { tone: "none", word: "Ainda lendo o mercado", pct: null };
  const v = Math.max(-1, Math.min(1, imbalance));
  return pressureFromBand(bandOf(v), Math.round(v * 100), trades);
}

const pctText = (n: number): string => n.toFixed(1).replace(".", ",");

interface Nearest {
  readonly zone: ThermoZone;
  /** How far, in percent of the price, from the price to the near edge of the zone; zero inside it. */
  readonly gap: number;
  readonly where: "dentro" | "abaixo" | "acima";
}

/** The zone of buyers or sellers closest to the price, with the gap, whatever the gap is. */
function closestZone(price: number | null, zones: readonly ThermoZone[]): Nearest | null {
  if (price === null || !Number.isFinite(price) || price <= 0) return null;
  let best: Nearest | null = null;
  for (const zone of zones) {
    if (zone.lado === "neutra" || !Number.isFinite(zone.baixo) || !Number.isFinite(zone.alto) || zone.alto < zone.baixo) continue;
    const inside = price >= zone.baixo && price <= zone.alto;
    // "abaixo": the zone is below the price, so the gap runs from the price down to its top edge
    const where = inside ? "dentro" : zone.alto < price ? "abaixo" : "acima";
    const gap = inside ? 0 : where === "abaixo" ? ((price - zone.alto) / price) * 100 : ((zone.baixo - price) / price) * 100;
    if (best === null || gap < best.gap) best = { zone, gap, where };
  }
  return best;
}

/** How far the closest zone of buyers or sellers is, in percent of the price, or null when there is none (or no price). */
export function nearestZoneGapPct(price: number | null, zones: readonly ThermoZone[]): number | null {
  return closestZone(price, zones)?.gap ?? null;
}

/** The zone of buyers or sellers nearest to the price, in words, or null when none is near. */
export function nearestZone(price: number | null, zones: readonly ThermoZone[]): Thermometer["zone"] {
  const best = closestZone(price, zones);
  if (best === null || best.gap > NEAR_ZONE_PCT) return null;
  const who = best.zone.lado === "demanda" ? "compradores" : "vendedores";
  const tone = best.zone.lado === "demanda" ? "buy" : "sell";
  if (best.where === "dentro") return { tone, text: `Preco dentro de uma zona de ${who}${best.zone.estado === "testada" ? ", ja testada" : ""}` };
  // a gap that would print as 0,0% is not "0,0% away": the price is touching it
  if (best.gap < 0.05) return { tone, text: `Preco encostado numa zona de ${who}` };
  return { tone, text: `Zona de ${who} a ${pctText(best.gap)}% ${best.where === "abaixo" ? "abaixo" : "acima"} do preco` };
}

function ageText(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return "agora ha pouco";
  const m = Math.floor(s / 60);
  if (m < 60) return `ha ${m} min`;
  const h = Math.floor(m / 60);
  return h < 24 ? `ha ${h} h` : `ha ${Math.floor(h / 24)} d`;
}

/** The Veredito's reasons in plain words: a wait forced by a gate says its own message, any other answer gives its reasons, two at most. */
function reasonsOf(v: Veredito | undefined): string[] {
  if (v === undefined) return [];
  if (v.forcadoPor !== null) return [v.mensagem];
  return v.motivos.slice(0, 2);
}

/** The rows of the plan a person acts on, in the order they act: where to go in, the target, where the idea fails. */
const PLAN_ORDER = ["Entrada", "Alvo", "A ideia cai em"] as const;

/** How long a band has held, in words: under a minute is "menos de 1 min", then minutes and hours. */
function heldText(ms: number): string {
  if (!(ms >= 60_000)) return "ha menos de 1 min";
  const m = Math.floor(ms / 60_000);
  return m < 60 ? `ha ${m} min` : `ha ${Math.floor(m / 60)} h`;
}

/**
 * The scenario: four things that have to line up before a question to the Inonu is worth its cost, each said as a fact. A zone near the price, a side that has been in charge for a
 * while, the flow and the zone on the same side, and a market cheap enough to move money through. When enough of them hold and the Inonu has no recent answer, a question brings news.
 * It DESCRIBES the moment: it never says what to do, it never asks the model, and an unreadable condition is unknown, not "no".
 */
function scenarioOf(input: ThermoInput, pressure: Thermometer["pressure"], answer: Thermometer["answer"]): ThermoScenario {
  const closest = closestZone(input.price, input.zones);
  const near = closest !== null && closest.gap <= NEAR_ASK_PCT ? closest : null;
  const nearText = nearestZone(input.price, input.zones)?.text;
  const zona: ThermoCondition =
    closest === null
      ? { id: "zona", ok: input.price === null ? null : false, text: input.price === null ? "Zona perto do preco: ainda sem preco" : "Nenhuma zona de compradores ou vendedores perto do preco" }
      : near === null
        ? { id: "zona", ok: false, text: `A zona mais perto esta a ${pctText(closest.gap)}% do preco, longe` }
        : { id: "zona", ok: true, text: nearText ?? "Zona perto do preco" };

  const sided = pressure.tone === "buy" || pressure.tone === "sell";
  const heldMs = input.stable == null ? null : Math.max(0, input.nowMs - input.stable.sinceMs);
  const fluxo: ThermoCondition =
    pressure.tone === "none"
      ? { id: "fluxo", ok: null, text: pressure.word }
      : !sided
        ? { id: "fluxo", ok: false, text: "Ninguem manda no momento: compradores e vendedores equilibrados" }
        : heldMs === null
          ? { id: "fluxo", ok: null, text: `${pressure.word}, sem saber ha quanto tempo` }
          : heldMs >= HOLD_MS
            ? { id: "fluxo", ok: true, text: `${pressure.word} ${heldText(heldMs)}` }
            : { id: "fluxo", ok: false, text: `${pressure.word}, mas ${heldText(heldMs)}: ainda cedo para contar com isso` };

  const lado: ThermoCondition =
    near === null || !sided
      ? { id: "lado", ok: null, text: "Fluxo e zona do mesmo lado: falta uma das duas leituras" }
      : (near.zone.lado === "demanda" ? "buy" : "sell") === pressure.tone
        ? { id: "lado", ok: true, text: "Fluxo e zona estao do mesmo lado" }
        : { id: "lado", ok: false, text: "Fluxo e zona estao de lados opostos" };

  const mercado: ThermoCondition =
    input.market == null
      ? { id: "mercado", ok: null, text: "Custo do mercado: sem leitura agora" }
      : { id: "mercado", ok: input.market.thickness !== "raso", text: input.market.text };

  const conditions = [zona, fluxo, lado, mercado];
  const known = conditions.filter((c) => c.ok !== null).length;
  const aligned = conditions.filter((c) => c.ok === true).length;
  const recent = answer !== null && answer.fresh;
  const worthAsking = known >= MIN_ALIGNED && aligned >= MIN_ALIGNED && !recent;
  const headline =
    known < MIN_ALIGNED
      ? `Ainda lendo o mercado: ${known} de ${conditions.length} condicoes puderam ser lidas.`
      : worthAsking
        ? `Vale perguntar ao Inonu agora: ${aligned} de ${known} condicoes alinhadas e sem resposta recente.`
        : known >= MIN_ALIGNED && aligned >= MIN_ALIGNED && answer !== null
          ? `Cenario alinhado (${aligned} de ${known}) e o Inonu ja respondeu ${answer.age}.`
          : `Cenario ainda nao alinhado: ${aligned} de ${known} condicoes.`;
  return { conditions, aligned, known, worthAsking, headline };
}

export function thermometer(input: ThermoInput): Thermometer {
  const answer =
    input.answer === null || !Number.isFinite(input.answer.atMs) || !Number.isFinite(input.nowMs)
      ? null
      : (() => {
          const a = input.answer;
          const age = Math.max(0, input.nowMs - a.atMs);
          const fresh = age <= FRESH_ANSWER_MS;
          const plano = a.veredito?.plano ?? null;
          // an old plan is not shown: the price it was made for has moved on
          const showPlan = fresh && plano !== null && a.veredito?.selo !== "esperar";
          const rows = showPlan ? planRows(plano, input.base ?? "") : null;
          return {
            action: a.action,
            word: ANSWER_WORD[a.action],
            age: ageText(age),
            fresh,
            reasons: fresh ? reasonsOf(a.veredito) : [],
            plan: rows === null ? null : PLAN_ORDER.flatMap((label) => rows.filter((r) => r.rotulo === label)),
            profit: showPlan ? profitLines(profitMath(plano), input.measured ?? "") : null,
          };
        })();
  const pressure =
    input.stable === undefined ? pressureOf(input.imbalance, input.trades ?? null) : input.stable === null ? pressureOf(null) : pressureFromBand(input.stable.band, input.stable.pct, input.trades ?? null);
  return { pressure, zone: nearestZone(input.price, input.zones), answer, scenario: scenarioOf(input, pressure, answer) };
}
