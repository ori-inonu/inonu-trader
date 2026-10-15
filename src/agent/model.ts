/**
 * The model of the agent (AUT-2): the Brief it reads, the closed questions it answers, and the adapter to Jev (`experimental_evaluate`, the same call System One and "Pedir ao Inonu" use). One evaluation
 * per cycle: a posture for the whole portfolio and one stance per candidate, each among the options the code offered. Only percentages and codes reach the model, never a balance in dollars and never the
 * address of a wallet; token symbols are cleaned because they come from the outside. The key is read from the vault getter at the moment of the call and handed to the provider explicitly. The real model is
 * NOT exercised by the tests: they inject a fake `evaluate`.
 */
import { createTypeSafeAi } from "@ai-sdk/typesafe-ai";
import { closingAnswerOf, closingQuestion, type ClosingAnswer, type ClosingBrief } from "./closing";
import { experimental_evaluate } from "ai";
import { briefItem, type EcoContext } from "../opportunity/ecosystem";
import { bearishFlags, bullishFlags } from "../opportunity/risk-tags";
import type { Verdict } from "./conviction";
import { facetQuestions, facetTexts, readFacets } from "./facets";
import { canonicalJson, sha256Hex } from "./decision-metadata";
import type { ExecBrief, TokenTripBrief } from "./fills";
import { CONCENTRATIONS, LOOKS, RESERVES, RISKS, parseMandate, type Mandate } from "./mandate";
import { MACRO_LEGEND, hasMacroKeys } from "./macro-keys";
import { BRIEF_MEMORY_LEGEND, type BriefMemory } from "./memory-hook";
import { POSTURES, type Book, type Candidate } from "./types";

/** The biggest Brief the model is sent: eight holdings and eight purchases measure about 10 KB, a real consultation about 10.2 KB (it was 9 KB before the executable maximum, the fourth size, the fourth profile, the fee and the tail of the record were added). It is enforced by the tests, not cut at run time. */
export const BRIEF_MAX_BYTES = 12_000;
const DEFAULT_MODEL_ID = "jev-latest";

/** What the code knows about the market around the portfolio, as short codes and numbers (never text from the outside). */
export type MarketContext = Readonly<Record<string, string | number | null>>;
/** The measured track record per family of evidence: how many decisions and the hit rate in percent, from the Placar. */
export type FamilyHistory = Readonly<Record<string, { readonly n: number; readonly acerto: number | null; readonly medio?: number; readonly melhor?: number; readonly pior?: number }>>;

export interface AgentBrief {
  readonly v: 1;
  readonly carteira: { readonly caixa: number | null; readonly agente: number | null; readonly principal: number | null; readonly posicoes: number };
  readonly chaves: Readonly<Record<string, string>>;
  readonly posicoes: Readonly<Record<string, Record<string, unknown>>>;
  readonly compras: Readonly<Record<string, Record<string, unknown>>>;
  readonly contexto: MarketContext | null;
  readonly historico: FamilyHistory | null;
  /** The real round trips of the agent (fills.ts), as percentages of what went out; null when there is nothing real to say yet. */
  readonly execucoes?: ExecBrief;
  /** The earlier choices made on these very items, from an explicit cohort of earlier cycles (the memory hook, OFF unless switched on): pending, inconclusive, never a recommendation or a result. The key exists only when the hook produced a value. */
  readonly memoria?: BriefMemory;
  /** The mandate in force, in the model's own words, and whether the aggressive stance is open to it: the measurement has to earn that. */
  readonly mandato: { readonly risco: string; readonly reserva: string; readonly concentracao: string; readonly olhar: string; readonly agressivo_liberado: boolean; readonly abertas: Readonly<Record<string, number>> | null } | null;
}

/** The legend of the real round trips: added to the Brief only when the key itself is. */
const EXEC_LEGEND =
  "your REAL trades as the chain recorded them, closed round trips only (bought, then sold): voltas how many, retorno what came back minus what went out as a percent of what went out, in the same stablecoin (cash before the network fee, not profit, not converted to dollars; null when the trips were settled in different stablecoins; what is still held is not in it), ultimas the latest ones with s symbol, m minutes held, p the same percent; sem_entrada sales of tokens the agent never bought, which have no entry and so no result; desconhecidas sales that could not be valued, never a result of zero. Fees and short trades cost real money: weigh it against the target of a plan";

const ULT_LEGEND =
  "your own closed round trips on THIS token: n how many, m minutes held in the last one, p its cash return percent in the same stablecoin before the network fee, ag minutes since that exit. Re-entering a token you just exited minutes ago without a material change in the facts repeats the round-trip spread and fee";

const EXTRA_COMPRA_LEGEND: Readonly<Record<string, string>> = {
  "compras.wu": "tracked wallets' total purchases of this token, thousands of dollars",
  "compras.sp": "current price against the USD-weighted average entry price paid by tracked wallets, percent (positive: price is above what smart money paid; negative: below)",
  "compras.inf": "net capital inflow into this token, thousands of dollars",
  "compras.ut": "number of unique traders in the hot-token window (compare with trades to judge real breadth vs wash trading)",
  "compras.lp": "burned share of the liquidity pool from token-risk, percent 0-100",
};

const LEGEND: Readonly<Record<string, string>> = {
  caixa: "share of the agent wallet in dollar coins, percent",
  agente: "share of the whole portfolio in the agent wallet, percent",
  principal: "share in the person's own wallet, which the agent only reads, percent",
  s: "symbol of the token",
  wl: "wallet: a agent, p principal",
  escopo: "a short key means what its scope says (posicoes.X a holding, compras.X a purchase): the same letter can differ (w p v m h t i); no scope means the same in both",
  "posicoes.w": "share of the whole portfolio, percent",
  "posicoes.p": "24h price change percent",
  "posicoes.v": "tracked wallets that already sold it, percent of what they bought",
  "posicoes.m": "number of tags the provider marks that WARN (honeypot, little liquidity, the developer selling)",
  "posicoes.g": "number of tags in favour (smart money buying, recognised community); only when present",
  "posicoes.h": "hours held",
  "posicoes.t": "triggers the code noticed (observations, not advice)",
  "compras.n": "trail of the tracked wallets, 0-100; null unknown",
  "compras.w": "number of tracked wallets that bought it",
  "compras.p": "percent of what the tracked wallets bought that they already sold",
  "compras.b": "buy transactions, percent of all trades",
  "compras.v": "24h trading volume, thousands of dollars",
  "compras.c": "24h price change, percent",
  "compras.h": "number of holders",
  "compras.t": "top 10 holders' share of the supply, percent",
  "compras.d": "creator share of the supply, percent",
  "compras.u": "bundlers' share of the supply, percent",
  "compras.m": "care codes, a list (supply concentration, creator or bundler supply, low liquidity, few holders, risk or a warning tag, entry moment, short history; soma_ao_plano: you already hold it under a plan, so a new purchase keeps that plan and only its profile is offered)",
  f: "families of positive evidence, a list (wallets, flow, liquidity, supply distribution, traction, security, pullback)",
  "compras.x": "executable maximum of a purchase, percent of the agent wallet: the cash the agent wallet holds on this token's network (and the limit per transaction of the OKX account, when it has one); every size is a fraction of it (buy_tenth 10 percent, buy_third 33, buy_two_thirds 67, buy_full 100); 0 cannot buy; null balance unknown",
  "compras.i": "the executable maximum as a percent of the pool liquidity: how much price the largest size would move; null when the liquidity is unknown",
  "compras.y": "already held of this token, percent of the portfolio",
  "compras.k": "network fee of one swap on this token's network, in dollars, from the last quote read there; absent when none was read (unknown, never zero)",
  l: "pool liquidity, thousands of dollars",
  "posicoes.i": "position as a percent of the pool liquidity: how hard it is to leave",
  r: "provider risk 0-5; null unknown",
  e: "percent since the agent bought it; null when the agent did not",
  o: "the stances you may choose",
  pl: "the plan of a holding the agent opened: pf profile, e percent since entry, a percent to the target, s percent to the stop, hl hours left, th target reached",
  c5: "price change in the last 5 minutes, percent; c1 in the last hour",
  n5: "number of trades in the last 5 minutes",
  ag: "age in minutes of the facts of this holding (how stale they may be)",
  mo: "the last hour in 5-minute bars: r5 r15 r1 percent change over 5 min, 15 min, 1 h; rg percent range of the hour (under 0.5 nothing moved); vr volume of the last 15 min over the 45 before; ag minutes since the last bar",
  tm: "moment of a purchase: rsi 0-100; rp position in the 2-day range 0-100; r4 r24 percent in 4 and 24 h; up percent from the 2-day low; dd percent below the 2-day high; sg normal hourly move percent",
  pf: "target and stop profiles offered for the purchase (pick one with the stance)",
  historico: "your own measured record one hour after each decision (n samples, acerto hit rate percent, null when n is under 5; medio, melhor and pior are the average, best and worst percent move of the TOKEN in that hour after those decisions, whatever the side, only when n is 5 or more: a hit rate counts signs and hides a tail, so read them together): comprar, your actual purchases that rose; pular, your skips where the token fell; manter, keeping a holding beat selling it; vender, selling beat keeping; per family of evidence, how often BUYING a candidate that had it beat keeping dollars (skipped purchases included); f_*, when you judged that facet >= 60 percent, how often the move agreed with it. A small n is not evidence",
  contexto: "the market around: btc_1h btc_4h btc_24h eth_24h percent (compare token mo.r1 and tm.r4 against btc_1h and btc_4h for relative strength or pricing lag); tendencia; vol_btc volatility regime; fund_btc_bps BTC perpetual funding in basis points (positive: longs pay shorts); oi_btc_1h percent change of its open interest in an hour (rising with price: leverage building); s1_* latest System One reading",
  mandato: "the mandate in force; agressivo_liberado false: the track record has not earned the aggressive stance yet, so asking for it changes nothing; abertas: how many of the purchase candidates have something to buy under each level of risk; the risk of the mandate no longer sizes a purchase, so the levels open the same, and 0 means no cash on the network of any candidate",
};

const r0 = (v: number | null): number | null => (v === null || !Number.isFinite(v) ? null : Math.round(v));
const r1 = (v: number | null): number | null => (v === null || !Number.isFinite(v) ? null : Math.round(v * 10) / 10);
const r2 = (v: number | null): number | null => (v === null || !Number.isFinite(v) ? null : Math.round(v * 100) / 100);
const thousands = (v: number | null): number | null => (v === null || !Number.isFinite(v) ? null : Math.round(v / 1000));

/** A symbol comes from a token anyone can create: it is cut down to a plain label or replaced. */
export const safeSymbol = (s: string): string => (/^[A-Za-z0-9$._-]{1,12}$/.test(s) ? s : "?");

const CODE = /^[a-z_]{1,20}$/;
const HEX64 = /^[a-f0-9]{64}$/;
/** The key of a measurement: a short plain code that may carry digits (btc_24h, oi_btc_1h, s1_regime). Only the VALUES that are text stay letters and underscores. */
const KEY = /^[a-z][a-z0-9_]{0,23}$/;
function boundedContext(raw: MarketContext | null): MarketContext | null {
  if (raw === null) return null;
  const entries = Object.entries(raw);
  // the bound grew from 12 to 32 with the macro context (ADENDO-E, E1): the hourly reads and the System One reading are eleven keys and the minute regime is ten per reference market, two markets: thirty-one
  if (entries.length > 32) return null;
  for (const [k, v] of entries) {
    if (!KEY.test(k)) return null;
    // a text value is a plain code; the only other text allowed is the SHA-256 of an observation, and only under a key that ends in _fh
    const text = typeof v === "string" && (CODE.test(v) || (k.endsWith("_fh") && HEX64.test(v)));
    if (v !== null && !(typeof v === "number" && Number.isFinite(v)) && !text) return null;
  }
  return Object.fromEntries(entries);
}

function boundedHistory(raw: FamilyHistory | null): FamilyHistory | null {
  if (raw === null) return null;
  const entries = Object.entries(raw);
  if (entries.length > 20) return null;
  for (const [k, v] of entries) {
    if (!KEY.test(k) || v === null || typeof v !== "object" || !Number.isSafeInteger(v.n) || v.n < 0) return null;
    if (v.acerto !== null && (typeof v.acerto !== "number" || !Number.isFinite(v.acerto) || v.acerto < 0 || v.acerto > 100)) return null;
    // the move of the token after those decisions, in percent: a price cannot fall under minus 100 and a sane tail stays under a million percent
    for (const move of [v.medio, v.melhor, v.pior]) if (move !== undefined && (typeof move !== "number" || !Number.isFinite(move) || move < -100 || move > 1_000_000)) return null;
  }
  return Object.fromEntries(entries);
}

export interface BriefInput {
  readonly book: Book;
  readonly holdings: readonly Candidate[];
  readonly buys: readonly Candidate[];
  readonly eco: EcoContext;
  readonly context: MarketContext | null;
  readonly history: FamilyHistory | null;
  /** The real round trips (fills.ts `execBrief`), when the agent has any. */
  readonly exec?: ExecBrief | null;
  /** The memory block (memory-hook.ts), already projected; null or absent when the hook is off or produced nothing. */
  readonly memory?: BriefMemory | null;
  /** Closed round trips by token address (`tokenTripsBrief`), so each candidate shows its own recent round-trip history when any exists. */
  readonly tokenTrips?: Readonly<Record<string, TokenTripBrief>> | null;
  /** The last network fee quoted on a network (see fees.ts): what a swap costs there, in dollars; null when none was read. */
  readonly feeOf?: (chainIndex: string) => { readonly usd: number; readonly ageMin: number | null } | null;
  readonly mandate?: { readonly mandate: Mandate; readonly aggressiveOpen: boolean; /** How many purchases each level of risk would put on offer (see `openByRisk`). */ readonly openByRisk?: Readonly<Record<string, number>> } | null;
}

/** The fee of a swap with two significant digits: 3.4567 is 3.5 and 0.000512 is 0.00051, never rounded to a cent that would make a fee of a fraction of a cent look like zero. */
const feeUsd = (fee: { readonly usd: number } | null): number | null => (fee === null || !Number.isFinite(fee.usd) || fee.usd < 0 ? null : Number(fee.usd.toPrecision(2)));

const withoutMandate = (legend: Readonly<Record<string, string>>): Readonly<Record<string, string>> => Object.fromEntries(Object.entries(legend).filter(([k]) => k !== "mandato"));

/** The entries of an object that have a value. */
function present<T extends Record<string, unknown>>(o: T): Partial<T> {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== null && v !== undefined)) as Partial<T>;
}

/** The last hour in five-minute bars as short keys; null when there is none (the key then carries nothing). */
function momentumBrief(m: Candidate["momentum"]): Record<string, number | null> | null {
  if (m === undefined || m === null) return null;
  return { r5: r1(m.ret5mPct), r15: r1(m.ret15mPct), r1: r1(m.ret1hPct), rg: r1(m.rangeHourPct), vr: r1(m.volRatio), ag: r0(m.barAgeMin) };
}

/** The two-day hourly structure of a token as short keys; null when there is none. */
function timingBrief(t: Candidate["timing"]): Record<string, number | null> | null {
  if (t === undefined || t === null) return null;
  return { rsi: r0(t.rsi), rp: t.rangePos === null ? null : r0(t.rangePos * 100), r4: r1(t.ret4hPct), r24: r1(t.ret24hPct), up: r0(t.runUpPct), dd: r1(t.drawFromHighPct), sg: r2(t.sigmaHourPct) };
}

/** Hours held: to a tenth of an hour while under one hour (so a 2-minute position is 0.1, never 0), whole hours from one hour up. */
const heldHoursBrief = (v: number | null): number | null => (v === null || !Number.isFinite(v) ? null : v > 0 && v < 1 ? Math.max(0.1, r1(v) ?? 0.1) : r0(v));

export function agentBrief(input: BriefInput): AgentBrief {
  const { book } = input;
  const total = book.totalUsd !== null && book.totalUsd > 0 ? book.totalUsd : null;
  const share = (usd: number | null): number | null => (total === null || usd === null ? null : r1((usd / total) * 100));
  const cashUsd = Object.values(book.cashByChain).reduce((s, v) => s + v, 0);
  const posicoes: Record<string, Record<string, unknown>> = {};
  const byId = new Map(book.positions.map((p) => [`hold:${p.id}@${p.wallet}`, p]));
  for (const c of input.holdings) {
    const p = byId.get(c.id);
    const f = c.facts;
    posicoes[c.id] = {
      s: safeSymbol(c.symbol),
      wl: c.wallet === "agente" ? "a" : "p",
      w: share(p?.usd ?? null),
      p: r1(f?.changeH24Pct ?? null),
      l: thousands(f?.liquidityUsd ?? null),
      i: r2(f?.exitImpactPct ?? null),
      v: r0(f?.soldPct ?? null),
      r: f?.riskLevel ?? null,
      // the provider's tags that WARN, and apart from them the ones in favour (smart money buying, a recognised community): two numbers, not one "risk" count
      m: f === null ? null : bearishFlags(f.riskFlags).length,
      e: r1(f?.sinceEntryPct ?? null),
      h: heldHoursBrief(f?.heldHours ?? null),
      // what the token is doing right now, and how old what the facts say is: only the keys that have a value (a missing one is not a zero, and a null costs bytes)
      ...present({ g: f === null || bullishFlags(f.riskFlags).length === 0 ? null : bullishFlags(f.riskFlags).length, c5: r1(f?.change5mPct ?? null), c1: r1(f?.change1hPct ?? null), n5: r0(f?.txs5m ?? null), ag: r0(f?.dataAgeMin ?? null), mo: momentumBrief(c.momentum), tm: timingBrief(c.timing), f: c.families.length > 0 ? c.families : null, ult: input.tokenTrips?.[c.address] ?? null }),
      t: c.triggers,
      o: c.stances,
      pl: c.plan === null ? null : { pf: c.plan.profile, e: r1(c.plan.sinceEntryPct), a: r1(c.plan.toTargetPct), s: r1(c.plan.toStopPct), hl: r0(c.plan.hoursLeft), th: c.plan.targetHit },
    };
  }
  const ecoById = new Map(input.eco.candidates.map((c) => [`buy:${c.facts.candidateId}`, c]));
  const compras: Record<string, Record<string, unknown>> = {};
  for (const c of input.buys) {
    const e = ecoById.get(c.id);
    if (e === undefined) continue;
    const t = c.timing;
    const hasRichEco = e.facts.smartPriceUsd !== undefined || e.facts.inflowUsd !== undefined || e.facts.uniqueTraders !== undefined;
    const sp =
      e.facts.smartPriceUsd != null && e.facts.smartPriceUsd > 0 && e.facts.priceUsd !== null && e.facts.priceUsd > 0
        ? r1((e.facts.priceUsd / e.facts.smartPriceUsd - 1) * 100)
        : null;
    const wu = hasRichEco && e.facts.walletsUsd !== null && e.facts.walletsUsd > 0 ? thousands(e.facts.walletsUsd) : null;
    const inf = e.facts.inflowUsd !== undefined && e.facts.inflowUsd !== null ? thousands(e.facts.inflowUsd) : null;
    const ut = e.facts.uniqueTraders !== undefined && e.facts.uniqueTraders !== null ? r0(e.facts.uniqueTraders) : null;
    const lp = e.facts.lpBurnedPct !== undefined && e.facts.lpBurnedPct !== null ? r0(e.facts.lpBurnedPct) : null;
    compras[c.id] = {
      ...briefItem(e, book.agentUsd),
      // the ceiling the model can use is the biggest by profile (sized by each stop), not the plain one of the ecosystem screen
      ...(c.cap !== undefined && book.agentUsd !== null && book.agentUsd > 0 ? { x: Math.round((c.cap.maxUsd / book.agentUsd) * 1000) / 10 } : {}),
      ...(c.cap !== undefined && e.facts.liquidityUsd !== null && e.facts.liquidityUsd > 0 ? { i: r2((c.cap.maxUsd / e.facts.liquidityUsd) * 100) } : {}),
      s: safeSymbol(e.facts.symbol),
      // the care codes and the families include those of the moment of the entry, which the ecosystem alone does not know
      m: c.marks,
      f: c.families,
      o: c.stances,
      pf: c.profiles,
      ...present({ mo: momentumBrief(c.momentum), k: feeUsd(input.feeOf?.(c.chainIndex) ?? null), ult: input.tokenTrips?.[c.address] ?? null, wu, sp, inf, ut, lp }),
      tm: timingBrief(t),
    };
  }
  const hasUlt = [...input.holdings, ...input.buys].some((c) => input.tokenTrips?.[c.address] !== undefined);
  const extraCompraKeys: Record<string, string> = {};
  for (const item of Object.values(compras)) {
    for (const k of ["wu", "sp", "inf", "ut", "lp"] as const) {
      if (Object.hasOwn(item, k)) extraCompraKeys[`compras.${k}`] = EXTRA_COMPRA_LEGEND[`compras.${k}`]!;
    }
  }
  const contexto = boundedContext(input.context);
  return {
    v: 1,
    carteira: {
      caixa: book.agentUsd !== null && book.agentUsd > 0 ? r1((cashUsd / book.agentUsd) * 100) : null,
      agente: share(book.agentUsd),
      principal: total === null || book.agentUsd === null ? null : r1(((total - book.agentUsd) / total) * 100),
      posicoes: book.positions.filter((p) => !p.isCash && p.usd !== null && p.usd > 0).length,
    },
    chaves: { ...(input.mandate == null ? withoutMandate(LEGEND) : LEGEND), ...(input.exec == null ? {} : { execucoes: EXEC_LEGEND }), ...(input.memory == null ? {} : { memoria: BRIEF_MEMORY_LEGEND }), ...(hasMacroKeys(contexto) ? { contexto_macro: MACRO_LEGEND } : {}), ...(hasUlt ? { ult: ULT_LEGEND } : {}), ...extraCompraKeys },
    posicoes,
    compras,
    contexto,
    historico: boundedHistory(input.history),
    // the key exists only when there is something real to say: a Brief without fills is exactly the one it always was
    ...(input.exec == null ? {} : { execucoes: input.exec }),
    // the memory sits after the real fills and before the mandate, exactly where contract 121 puts it
    ...(input.memory == null ? {} : { memoria: input.memory }),
    mandato: input.mandate == null ? null : { risco: input.mandate.mandate.risk, reserva: input.mandate.mandate.reserve, concentracao: input.mandate.mandate.concentration, olhar: input.mandate.mandate.look, agressivo_liberado: input.mandate.aggressiveOpen, abertas: input.mandate.openByRisk === undefined ? null : { ...input.mandate.openByRisk, ...(input.mandate.aggressiveOpen || input.mandate.openByRisk.agressivo === undefined ? {} : { agressivo: 0 }) } },
  };
}

/* ---------------------------------------------------------------- the closed questions */

const POSTURE_CRITERIA: Readonly<Record<(typeof POSTURES)[number], string>> = {
  defensiva: "Your read of the market as defensive. Choose it only for a concrete reason: the market is falling hard or turning, or the data is stale or contradictory. A quiet or sideways market is not a reason, a thin track record is not either, and a holding that needs attention is handled by its own stance (sell it). The posture is recorded and measured and it limits nothing: what is bought or sold is decided by the stance you choose for each candidate.",
  neutra: "Your usual read of the market: nothing concrete to fear and nothing special to chase. Recorded and measured, it limits nothing: the stance of each candidate decides.",
  ofensiva: "Your read of the market as one to lean into: several candidates have a strong case and nothing gives pause. Recorded and measured, it limits nothing: the stance of each candidate decides.",
};

const STANCE_CRITERIA: Readonly<Record<string, string>> = {
  hold: "Keep the holding as it is: the entry thesis in tm and f still holds, or the position is inside its active plan pl (whose stop, target and time are enforced automatically by the code between looks) and no new material deterioration outweighs the round-trip spread and fee of selling.",
  trim_third: "Sell one third of what the wallet holds of it: take some risk off while keeping the position.",
  trim_half: "Sell half of what the wallet holds of it: the case against holding it has grown.",
  exit_all: "Sell everything the wallet holds of it: the entry thesis has broken down, new material risk appeared since entry, or the position is dead capital; do not exit a freshly opened plan (h under 1) over entry spread or noise alone when the facts in tm and f have not worsened.",
  skip: "Do not buy it: the evidence is thin, conflicting, the marks of care outweigh it, or ult shows you just exited this same token minutes ago without a material improvement in the facts.",
  buy_tenth: "Buy a tenth of the executable maximum of this candidate: a small first step, the case is worth a try.",
  buy_third: "Buy one third of the executable maximum of this candidate: the case is good but not strong.",
  buy_two_thirds: "Buy two thirds of the executable maximum of this candidate: the case is strong.",
  buy_full: "Buy the whole executable maximum of this candidate: the case is very strong and nothing gives pause.",
};

const GOAL =
  "You are the decision layer of an autonomous portfolio manager whose only measure of success is the net financial result of the portfolio, compounded cycle after cycle, against simply keeping dollars. The state lists the holdings and the purchase candidates, each with measured facts, " +
  "triggers the code noticed and the stances you may choose. Weigh all the facts together, not one. Protecting capital from a bad holding and finding a good purchase are equally your job: keeping dollars is also a position and it has an opportunity cost, which the track record measures too " +
  "(a purchase you skipped that then rose counts against you). The owner's profile is bold, and the purpose he gave this agent is to take fast decisions aimed at large asymmetric returns: a chance that could return 100 percent or more is exactly what it exists to find, short operations that leave with a gain are welcome, and idle cash is ammunition for the next chance, NOT something to lend out for a low rate. This is a purpose, not a promise: most chances fail, so the size you choose and the marks of care still matter, and a move that already ran is no chance. The work is growth and leverage of capital, the owner has AUTHORIZED the use of financial leverage, and the decision to take a good chance is yours, not the code's. The code has no leverage instrument yet (no borrow, margin or perpetual path is implemented), so none of the stances in this state uses it: do not invent one and do not treat the absence as a refusal of the owner. Do not wait for a perfect case: when a candidate on offer has several independent families of evidence in its favour (wallets buying, flow, liquidity, healthy distribution), " +
  "buy it in the size its evidence supports; when the evidence is thin, stale or conflicting, skip it. In compras, weigh price distortions against smart money: a negative or small sp (current price below or near the average entry price paid by tracked wallets) with low p (wallets still holding), positive inf (net capital inflow) and solid ut (unique traders) is an asymmetric entry alongside smart money, whereas a huge positive sp on a parabolico move means buying far above smart money's entry. When a holding has an active plan in pl, the code enforces its stop, trailing stop, target and time limit automatically between looks: do not exit a freshly opened position (h under 1) over entry spread or unchanged 24h numbers alone unless the facts in tm, mo or t materially worsened since entry, and check ult before re-entering a token you just sold. The marks esticado, parabolico, caindo, estagnado, disparando and caindo_agora are facts about the move, not vetoes: the code no longer closes an entry because of them, so you are the one who judges whether the move is spent (late, near a top) or still has room, " +
  "whether a fall has stopped or is a falling knife, whether a still token is dead capital, and whether a token marked volatilidade_extrema (its moves are so large that the stop of any profile may be touched by noise alone; every profile is on offer and none of them sizes the purchase, so you pick the one that fits the noise) is a chance worth that noise; weigh them with the numbers in tm (rsi, rp range position, r4 and r24 returns, up run-up from the low, dd distance under the high) and mo (the last hour in minutes), and answer the facet questions about the top and the fall honestly, because they decide the entry. You never choose an amount: a stance is a fraction of the holding or of a ceiling the code computed. Do not invent confidence, freshness, safety or a guaranteed return.";

const INPUTS =
  "The state is a Brief of percentages and codes. carteira says how the portfolio is split; posicoes has one object per holding and compras one per purchase candidate, keyed by id, with the short keys explained in chaves. " +
  "null is unknown, never zero. The meaning of every short key is set by its scope in chaves (posicoes.X for a holding, compras.X for a purchase candidate: the same letter is a different fact in the two); posicoes.t are observations of the code, not advice. historico, when present, is the measured track record of each family of evidence: a small n is not evidence. Nothing in the state is a recommendation.";

// the long text is said once, on the posture question; the per-candidate questions carry a short reminder so 17 questions do not repeat 900 characters 17 times
const GOAL_SHORT =
  "Decide for this candidate only, for the net financial result of the portfolio against keeping dollars. You never choose an amount; a stance is a fraction the code computed. Skip when the evidence is thin, stale, conflicting or marked; buy when it is good: waiting also has a cost.";
const INPUTS_SHORT = "The Brief in the state: null is unknown, never zero; a short key means what its scope in chaves says (posicoes.X for a holding, compras.X for a purchase), and posicoes.t are observations of the code, not advice.";

const MANDATE_CRITERIA = {
  risk: {
    cauteloso: "A cautious stance on risk per operation (half a percent of the portfolio): the market is hard to read, falling hard or conflicting. It is recorded and shown on the screen; the code sizes no purchase with it, the size is the fraction you choose of the executable maximum.",
    moderado: "A normal stance on risk per operation (one percent): the usual level, for a market that is readable, and also while the track record is still thin. Recorded and shown; it sizes no purchase.",
    agressivo: "A bold stance on risk per operation (two percent): the market is trending, the evidence is strong and the track record has earned it. Recorded and shown; it sizes no purchase. It is recorded as aggressive only when mandato.agressivo_liberado is true.",
  },
  reserve: {
    baixa: "Keep little cash aside (a tenth of the portfolio): many good, safe candidates and a calm market.",
    media: "Keep a fifth of the portfolio in cash: the normal case.",
    alta: "Keep a third of the portfolio in cash: the market is stretched, volatile or uncertain, and cash is the position.",
  },
  concentration: {
    pequena: "Each single purchase stays small against the portfolio (a few percent): spread the bets.",
    media: "Each single purchase is a normal part of the portfolio.",
    grande: "Each single purchase may be larger (up to a tenth of the portfolio): a few candidates stand clearly above the rest.",
  },
  look: {
    rapido: "Look again soon (every five minutes): things are moving and positions need watching closely.",
    normal: "Look again at the normal pace (every ten minutes).",
    calmo: "Look again later (every twenty minutes): nothing is moving and every look costs a model consultation.",
  },
} as const;

const MANDATE_QUESTIONS = {
  mandate_risk: { options: RISKS, text: "Which stance on risk per operation do you take from now on? It is recorded and shown, it sizes no purchase.", criteria: MANDATE_CRITERIA.risk },
  mandate_reserve: { options: RESERVES, text: "How much cash do you mean to keep aside? It is recorded and shown, the code keeps none aside for you.", criteria: MANDATE_CRITERIA.reserve },
  mandate_concentration: { options: CONCENTRATIONS, text: "How large do you mean a single purchase to be against the portfolio? It is recorded and shown, the size is the fraction you choose of the executable maximum.", criteria: MANDATE_CRITERIA.concentration },
  mandate_look: { options: LOOKS, text: "How soon should the agent look at the market again?", criteria: MANDATE_CRITERIA.look },
} as const;

/** Every constant text the model reads in a consultation (the goal, the entries, the rules of each question, the legend of the Brief and the facet questions): the digest of these is part of the version of the decider. */
export function questionTexts(): Readonly<Record<string, unknown>> {
  return { goal: GOAL, goalShort: GOAL_SHORT, inputs: INPUTS, inputsShort: INPUTS_SHORT, posture: POSTURE_CRITERIA, stance: STANCE_CRITERIA, mandate: MANDATE_CRITERIA, mandateQuestions: MANDATE_QUESTIONS, profile: PROFILE_CRITERIA, legend: { ...LEGEND, ult: ULT_LEGEND, ...EXTRA_COMPRA_LEGEND }, execLegend: EXEC_LEGEND, facets: facetTexts() };
}
export const questionsDigestOf = (texts: Readonly<Record<string, unknown>>): string => sha256Hex(canonicalJson(texts));
export const questionsDigest = (): string => questionsDigestOf(questionTexts());

const PROFILE_CRITERIA: Readonly<Record<string, string>> = {
  alvo_2: "Small, patient trade for a calm, liquid token: aim for 2 percent, leave if it falls 1.5, give it at most 24 hours. Choose it when the token moves little and the case is steady, not explosive.",
  alvo_5: "Short trade: aim for 5 percent, leave if it falls 4, give it at most 12 hours. Choose it when the move is likely to be quick and small.",
  alvo_10: "Swing trade: aim for 10 percent, leave if it falls 6, give it at most 36 hours. Choose it when the case supports a bigger move.",
  alvo_20: "Longer trade: aim for 20 percent, leave if it falls 10, give it at most 5 days. Choose it only when the case is strong and the token is liquid.",
};

const BUY_SIZES_ASC = ["buy_tenth", "buy_third", "buy_two_thirds", "buy_full"] as const;
const BUY_PART: Readonly<Record<(typeof BUY_SIZES_ASC)[number], string>> = { buy_tenth: "a tenth of the executable maximum", buy_third: "one third of the executable maximum", buy_two_thirds: "two thirds of the executable maximum", buy_full: "the whole executable maximum" };

/**
 * What a purchase size asks of the case follows its RANK among the sizes the code put on offer, not its name: on a small wallet the ceiling is a little over the minimum order, and the only size on offer is called
 * `buy_full`. Described as "very strong and nothing gives pause" it would ask the most from the smallest purchase the code can carry out. The smallest on offer asks for a good case, the next for a strong one, and only the
 * largest of THREE for a very strong one with nothing giving pause (the descriptions of three sizes are the ones they always were). Every description still says how much of the ceiling the size is.
 */
function buyCriterion(stance: string, offered: readonly string[]): string {
  if (!(BUY_SIZES_ASC as readonly string[]).includes(stance)) return STANCE_CRITERIA[stance] ?? stance;
  const sizes = BUY_SIZES_ASC.filter((s) => offered.includes(s));
  const part = BUY_PART[stance as (typeof BUY_SIZES_ASC)[number]];
  const rank = sizes.indexOf(stance as (typeof BUY_SIZES_ASC)[number]);
  if (sizes.length === 1) return `Buy ${part} of this candidate: it is the only size the cash allows here. Weigh the numbers and the marks of care, and buy when the case is worth it.`;
  if (rank === 0) return `Buy ${part} of this candidate: the smallest step on offer, the case is worth a try.`;
  if (rank === sizes.length - 1) return `Buy ${part} of this candidate: the largest step on offer, the case is very strong and nothing gives pause.`;
  return `Buy ${part} of this candidate: a larger step, the case is good and gets stronger with each one.`;
}

export function agentQuestions(candidates: readonly Candidate[]): Record<string, unknown> {
  const questions: Record<string, unknown> = {
    posture: {
      type: "choice",
      instructions: { question: "What posture should the portfolio take now?", goal: GOAL, inputs: INPUTS },
      criteria: { ...POSTURE_CRITERIA },
    },
  };
  // the strategy itself is the model's to set, one choice at a time, among options the code turns into numbers inside its ceilings
  for (const [key, q] of Object.entries(MANDATE_QUESTIONS)) {
    questions[key] = { type: "choice", instructions: { question: q.text, goal: GOAL_SHORT, inputs: INPUTS_SHORT }, criteria: { ...q.criteria } };
  }
  candidates.forEach((c, index) => {
    const criteria: Record<string, string> = {};
    for (const stance of c.stances) criteria[stance] = c.kind === "buy" ? buyCriterion(stance, c.stances) : (STANCE_CRITERIA[stance] ?? stance);
    const verb = c.kind === "holding" ? "What do you do with the holding" : "What is your stance on buying";
    questions[`stance_${index}`] = { type: "choice", instructions: { question: `${verb} ${safeSymbol(c.symbol)} (${c.id})?`, goal: GOAL_SHORT, inputs: INPUTS_SHORT }, criteria };
    // a holding the agent did not open is asked which protection fits it from now on (a plan the code then carries out by itself, between the looks of the model)
    if (c.kind === "holding" && c.profiles.length > 0) {
      const options: Record<string, string> = {};
      for (const profile of c.profiles) options[profile] = PROFILE_CRITERIA[profile] ?? profile;
      questions[`profile_${index}`] = {
        type: "choice",
        instructions: { question: `If you keep ${safeSymbol(c.symbol)} (${c.id}), which target and stop should protect it from now on?`, goal: "Pick the profile whose target is realistic for this token's recent moves and whose stop is not noise. It only applies if you keep the holding. Answer even if you would rather sell.", inputs: INPUTS_SHORT },
        criteria: options,
      };
    }
    // a purchase also needs the target and stop it is entered with, among the profiles the code offered for it
    if (c.kind === "buy" && c.profiles.length > 0) {
      const options: Record<string, string> = {};
      for (const profile of c.profiles) options[profile] = PROFILE_CRITERIA[profile] ?? profile;
      questions[`profile_${index}`] = {
        type: "choice",
        instructions: { question: `If you buy ${safeSymbol(c.symbol)} (${c.id}), which target and stop profile fits it?`, goal: "Pick the profile whose target is realistic for this token's recent moves and whose stop is not noise. Answer even if you will skip it; the code only uses it when you buy.", inputs: INPUTS_SHORT },
        criteria: options,
      };
    }
  });
  return questions;
}

/* ---------------------------------------------------------------- the adapter */

export interface ModelAnswer {
  /** Untrusted: the code validates it against the candidates. */
  readonly raw: {
    readonly posture: string;
    readonly mandate?: Mandate;
    readonly stances: Readonly<Record<string, string>>;
    readonly profiles: Readonly<Record<string, string>>;
    /** How sure the model was of each stance: its probabilities per option, when the provider sent them. Present (even empty) from an adapter that reads them, and then the conviction is applied; absent from one that does not (fakes). */
    readonly verdicts?: Readonly<Record<string, Verdict>>;
    /** How sure the model was of its posture: a probability per option, rounded to two places. Recorded for the study of the decisions. Absent when the provider sent none. */
    readonly postureProbs?: Readonly<Record<string, number>>;
    /** Narrow yes or no judgments per candidate (facets.ts), by candidate id: recorded for the study of the decisions; only `late_entry` and `still_falling` are read by the decision (conviction.ts). Absent when none came back. */
    readonly facets?: Readonly<Record<string, Readonly<Record<string, number>>>>;
  };
  readonly usage: { readonly inputTokens: number | null; readonly outputTokens: number | null };
  /** How many requests really went to the provider for this choice: 2 when one was refused for its shape and asked again without the facets. Absent means 1. The usage above is that of the last one; the budget counts the others. */
  readonly physicalRequests?: number;
}

export interface AgentModel {
  readonly name: string;
  /** A conservative reservation of the tokens one choice will use, for the budget. Not a claim about the bill. */
  estimateTokens(brief: AgentBrief, candidates: readonly Candidate[]): number;
  choose(input: { readonly brief: AgentBrief; readonly candidates: readonly Candidate[]; readonly signal: AbortSignal }): Promise<ModelAnswer>;
  /** The closing question of a purchase (closing.ts), one physical request to the provider. Optional: a model that has none is never asked, and the closing records why. */
  close?(input: { readonly brief: ClosingBrief; readonly symbol: string; readonly signal: AbortSignal }): Promise<{ readonly answer: ClosingAnswer | null; readonly usage: ModelAnswer["usage"] }>;
}

/** A conservative reservation of the tokens one closing will use, for the budget. Not a claim about the bill. */
export function estimateClosingTokens(brief: ClosingBrief): number {
  return Math.ceil(new TextEncoder().encode(JSON.stringify({ state: brief })).length / 3) + 700;
}

export function estimateTokens(brief: AgentBrief, candidates: readonly Candidate[]): number {
  const bytes = new TextEncoder().encode(JSON.stringify({ state: brief, questions: agentQuestions(candidates) })).length;
  return Math.ceil(bytes / 3) + 700 + 200 + 40 * candidates.length;
}

export interface JevAgentModelOptions {
  /** The model key from the vault, or null when it is not configured. */
  readonly apiKey: () => string | null;
  readonly modelId?: string;
  readonly createProvider?: (apiKey: string) => { evaluationModel(modelId: string): never };
  readonly evaluate?: typeof experimental_evaluate;
  /** The clock, for the hour the facets stay off after a provider refused a call that carried them. */
  readonly now?: () => number;
  /** Ask the facets next to the stances (default true). */
  readonly facets?: boolean;
}

/** The provider refused the request itself, not the moment: invalid (400), too large (413) or unprocessable (422). */
const refusedForShape = (error: unknown): boolean => {
  const status = error !== null && typeof error === "object" ? (error as { statusCode?: unknown }).statusCode : undefined;
  return status === 400 || status === 413 || status === 422;
};

/** How many requests really went to the provider before this failure: an adapter that asked twice says so on the error it throws, and any other failure is one request. */
export const physicalRequestsOf = (error: unknown): number => {
  const n = error !== null && typeof error === "object" ? (error as { physicalRequests?: unknown }).physicalRequests : undefined;
  return typeof n === "number" && Number.isSafeInteger(n) && n >= 1 ? n : 1;
};

/** After a call that carried the facets failed and the same call without them worked, the facets are left out for this long. */
const FACETS_OFF_MS = 60 * 60_000;

const token = (value: unknown): number | null => (typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null);

export function createJevAgentModel(options: JevAgentModelOptions): AgentModel {
  const modelId = options.modelId ?? DEFAULT_MODEL_ID;
  const createProvider = options.createProvider ?? ((apiKey: string) => createTypeSafeAi({ apiKey }) as never);
  const evaluate = options.evaluate ?? experimental_evaluate;
  const clock = options.now ?? Date.now;
  let facetsOffUntil = 0;
  return {
    name: modelId,
    estimateTokens,
    async close({ brief, symbol, signal }) {
      const apiKey = options.apiKey();
      if (apiKey === null || apiKey.length === 0) throw new Error("the model key is not configured");
      if (signal.aborted) throw new Error("aborted");
      const model = createProvider(apiKey).evaluationModel(modelId);
      const result = await evaluate({ model, state: brief as never, questions: { closing: closingQuestion(symbol) } as never, maxRetries: 0, abortSignal: signal });
      const answers = (result as { answers?: Record<string, { choice?: unknown; probabilities?: unknown }> }).answers;
      const usage = (result as { usage?: { inputTokens?: unknown; outputTokens?: unknown } }).usage;
      return { answer: closingAnswerOf(answers?.closing), usage: { inputTokens: token(usage?.inputTokens), outputTokens: token(usage?.outputTokens) } };
    },
    async choose({ brief, candidates, signal }) {
      const apiKey = options.apiKey();
      if (apiKey === null || apiKey.length === 0) throw new Error("the model key is not configured");
      if (signal.aborted) throw new Error("aborted");
      const plain = agentQuestions(candidates);
      const model = createProvider(apiKey).evaluationModel(modelId);
      const wantFacets = options.facets !== false && clock() >= facetsOffUntil;
      let result;
      let requests = 1;
      try {
        result = await evaluate({ model, state: brief as never, questions: (wantFacets ? { ...plain, ...facetQuestions(candidates) } : plain) as never, maxRetries: 0, abortSignal: signal });
      } catch (error) {
        // the facets are an experiment: when the provider REFUSED a call that carried them for its shape (a request it finds invalid or too large), the same call without them is asked once, so the decision is not lost
        // for a record. Any other failure (a rate limit, the service down, a timeout, a network error) is not about the questions, and asking again at once only adds load: it is the failure.
        if (!wantFacets || signal.aborted || !refusedForShape(error)) throw error;
        // two requests have now gone to the provider for this one choice: the budget must see both, whether the second works or not
        requests = 2;
        try {
          result = await evaluate({ model, state: brief as never, questions: plain as never, maxRetries: 0, abortSignal: signal });
        } catch (second) {
          throw Object.assign(second !== null && typeof second === "object" ? second : new Error(String(second)), { physicalRequests: 2 });
        }
        facetsOffUntil = clock() + FACETS_OFF_MS;
      }
      const answers = (result as { answers?: Record<string, { choice?: unknown; probabilities?: unknown }> }).answers;
      const usage = (result as { usage?: { inputTokens?: unknown; outputTokens?: unknown } }).usage;
      const failed = (message: string): Error => Object.assign(new Error(message), { physicalRequests: requests });
      const posture = answers?.posture?.choice;
      if (typeof posture !== "string" || !Object.hasOwn(POSTURE_CRITERIA, posture)) throw failed("Invalid agent answers");
      const mandate = parseMandate({ risk: answers?.mandate_risk?.choice, reserve: answers?.mandate_reserve?.choice, concentration: answers?.mandate_concentration?.choice, look: answers?.mandate_look?.choice });
      if (mandate === null) throw failed("Invalid agent answers");
      const stances: Record<string, string> = {};
      const profiles: Record<string, string> = {};
      const verdicts: Record<string, Verdict> = {};
      candidates.forEach((c, index) => {
        const choice = answers?.[`stance_${index}`]?.choice;
        if (typeof choice !== "string" || !c.stances.includes(choice)) throw failed("Invalid agent answers");
        stances[c.id] = choice;
        // how sure it was: the probabilities the provider sent, exactly as sent (whether they are a distribution is judged where they are used); nothing is made up when it sent none
        const sent = answers?.[`stance_${index}`]?.probabilities;
        if (sent !== null && typeof sent === "object" && !Array.isArray(sent)) {
          const entries = Object.entries(sent as Record<string, unknown>);
          if (entries.length > 0 && entries.every(([, v]) => typeof v === "number")) verdicts[c.id] = { choice, probabilities: Object.fromEntries(entries) as Record<string, number>, confidence: null };
        }
        if (c.kind === "holding" && c.profiles.length > 0) {
          // an answer that is missing or not offered only means no plan for this holding
          const profile = answers?.[`profile_${index}`]?.choice;
          if (typeof profile === "string" && c.profiles.includes(profile)) profiles[c.id] = profile;
        }
        if (c.kind === "buy" && c.profiles.length > 0) {
          const profile = answers?.[`profile_${index}`]?.choice;
          // the profile is only used when the purchase is not skipped, so a skipped one may leave it unanswered
          if (typeof profile === "string" && c.profiles.includes(profile)) profiles[c.id] = profile;
          else if (choice !== "skip") throw failed("Invalid agent answers");
        }
      });
      const facets = readFacets(answers as Record<string, unknown> | undefined, candidates);
      const sentPosture = answers?.posture?.probabilities;
      const postureEntries = sentPosture !== null && typeof sentPosture === "object" && !Array.isArray(sentPosture) ? Object.entries(sentPosture as Record<string, unknown>).filter((e): e is [string, number] => typeof e[1] === "number" && Number.isFinite(e[1])) : [];
      const postureProbs = postureEntries.length === 0 ? undefined : Object.fromEntries(postureEntries.map(([k, v]) => [k, Math.round(v * 100) / 100]));
      return { raw: { posture, mandate, stances, profiles, verdicts, ...(postureProbs === undefined ? {} : { postureProbs }), ...(Object.keys(facets).length === 0 ? {} : { facets }) }, usage: { inputTokens: token(usage?.inputTokens), outputTokens: token(usage?.outputTokens) }, physicalRequests: requests };
    },
  };
}
