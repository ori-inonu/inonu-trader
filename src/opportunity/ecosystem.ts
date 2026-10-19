/**
 * The decision of the ecosystem ("Pedir ao Inonu: as melhores oportunidades"): what the code puts in front of the model, what the model may answer, and what the code accepts of the answer.
 *
 * The CODE gathers, from the networks of the OnchainOS, the tokens that have the most independent descriptive support (`familiesOf`), measures each one (`EcoFacts`), bounds how much of the
 * person's balance each could take (`capFor`) and writes it all in a compact Brief. The MODEL, asked by a click, answers only closed choices: for each candidate a stance (skip, watch, or one of
 * three sizes that are fractions of the code's ceiling), which candidates come first, second and third, and which family of evidence weighed most for each. The code then checks that every answer is
 * one of the offered options, drops anything incoherent (a first place for a candidate it chose to skip), and turns the sizes into dollars with the cash of each network. The model never writes a
 * number, a name or an amount; the reasons the screen shows are the measurements the code took, with the family the model said weighed most marked among them.
 *
 * Nothing here sends an order. Pure: no clock of its own, no network, no storage.
 */
import { bearishFlags } from "./risk-tags";
import { allocate, BUY_SIZES, capFor, FRACTIONS, type Binding, type BuySize, type SizingCap, type SizingInput } from "./sizing";

/** The families of evidence a candidate can have in its favour. Independent: they do not share an input. */
const FAMILIES = ["carteiras", "fluxo", "liquidez", "distribuicao", "tracao", "seguranca"] as const;
export type Family = (typeof FAMILIES)[number];

export const FAMILY_LABEL: Readonly<Record<Family, string>> = {
 carteiras: "Carteiras rastreadas",
 fluxo: "Fluxo de compras",
 liquidez: "Liquidez",
 distribuicao: "Distribuicao",
 tracao: "Tracao",
 seguranca: "Seguranca",
};

/** The limit that puts a family in a candidate's favour. A choice of this code, not calibrated. */
const FAMILY_RULES = {
 carteiras: { minWallets: 2, maxSoldPct: 60 },
 fluxo: { minTxs: 100, minBuyShare: 0.55 },
 liquidez: { minUsd: 250_000 },
 distribuicao: { maxTop10Pct: 30, maxDevPct: 5, maxBundlePct: 10 },
 tracao: { minChangePct: 3, minVolumeUsd: 100_000 },
 seguranca: { maxRiskLevel: 1 },
} as const;

/** The limit that puts a mark of care on a candidate. */
const MARK_RULES = { top10Pct: 50, devPct: 10, bundlePct: 20, liquidityUsd: 50_000, holders: 300, riskLevel: 4 } as const;

/** What a candidate has to have to be offered at all: a pool people can leave, and enough holders. */
const ENTRY_RULES = { minLiquidityUsd: 20_000, minHolders: 100 } as const;

export type MarkId = "concentracao" | "criador" | "bundlers" | "liquidez_baixa" | "poucos_detentores" | "risco_alto" | "sinal_de_risco";

const MARK_LABEL: Readonly<Record<MarkId, string>> = {
 concentracao: "as 10 maiores carteiras tem muito da oferta",
 criador: "o criador tem muito da oferta",
 bundlers: "bundlers com muito da oferta",
 liquidez_baixa: "liquidez baixa",
 poucos_detentores: "poucos detentores",
 risco_alto: "nivel de risco alto na OKX",
 sinal_de_risco: "a OKX marca um sinal de risco",
};

/** The measurements of one candidate. Numbers only: nothing the person typed, no wallet. A value the provider did not give is null. */
export interface EcoFacts {
 readonly candidateId: string;
 readonly chainIndex: string;
 readonly address: string;
 readonly symbol: string;
 /** The trail of the token among those of its network, 0 to 100; null without the purchases of tracked wallets. */
 readonly nota: number | null;
 readonly priceUsd: number | null;
 readonly changePct: number | null;
 readonly volumeUsd: number | null;
 readonly liquidityUsd: number | null;
 readonly marketCapUsd: number | null;
 readonly holders: number | null;
 /** Buys over buys plus sells of the transactions, 0 to 1. */
 readonly buyShare: number | null;
 readonly txs: number | null;
 readonly top10Pct: number | null;
 readonly devPct: number | null;
 readonly bundlePct: number | null;
 readonly riskLevel: number | null;
 /** Risk flags the OKX marked (plain tokens). */
 readonly riskFlags: readonly string[];
 readonly wallets: number | null;
 readonly walletsUsd: number | null;
 /** Share of what the tracked wallets bought that they already sold, 0 to 100. */
 readonly soldPct: number | null;
 /** USD-weighted average entry price paid by the tracked wallets in `/onchain/signals`; null when none or unknown. */
 readonly smartPriceUsd?: number | null;
 /** Net capital inflow in USD from `/onchain/hot-tokens`; null when unknown. */
 readonly inflowUsd?: number | null;
 /** Unique traders count from `/onchain/hot-tokens`; null when unknown. */
 readonly uniqueTraders?: number | null;
 /** Burned share of the liquidity pool (0 to 100) from `/onchain/token-risk`; null when unknown. */
 readonly lpBurnedPct?: number | null;
}

const num = (v: number | null): v is number => v !== null && Number.isFinite(v);

export function familiesOf(f: EcoFacts): Family[] {
 const R = FAMILY_RULES;
 const out: Family[] = [];
 if (num(f.wallets) && f.wallets >= R.carteiras.minWallets && (!num(f.soldPct) || f.soldPct <= R.carteiras.maxSoldPct)) out.push("carteiras");
 if (num(f.txs) && num(f.buyShare) && f.txs >= R.fluxo.minTxs && f.buyShare >= R.fluxo.minBuyShare) out.push("fluxo");
 if (num(f.liquidityUsd) && f.liquidityUsd >= R.liquidez.minUsd) out.push("liquidez");
 if (num(f.top10Pct) && f.top10Pct <= R.distribuicao.maxTop10Pct && (!num(f.devPct) || f.devPct <= R.distribuicao.maxDevPct) && (!num(f.bundlePct) || f.bundlePct <= R.distribuicao.maxBundlePct)) out.push("distribuicao");
 if (num(f.changePct) && num(f.volumeUsd) && f.changePct >= R.tracao.minChangePct && f.volumeUsd >= R.tracao.minVolumeUsd) out.push("tracao");
 if (num(f.riskLevel) && f.riskLevel <= R.seguranca.maxRiskLevel && bearishFlags(f.riskFlags).length === 0) out.push("seguranca");
 return out;
}

export function marksOf(f: EcoFacts): MarkId[] {
 const M = MARK_RULES;
 const out: MarkId[] = [];
 if (num(f.top10Pct) && f.top10Pct >= M.top10Pct) out.push("concentracao");
 if (num(f.devPct) && f.devPct >= M.devPct) out.push("criador");
 if (num(f.bundlePct) && f.bundlePct >= M.bundlePct) out.push("bundlers");
 if (num(f.liquidityUsd) && f.liquidityUsd < M.liquidityUsd) out.push("liquidez_baixa");
 if (num(f.holders) && f.holders < M.holders) out.push("poucos_detentores");
 if (num(f.riskLevel) && f.riskLevel >= M.riskLevel) out.push("risco_alto");
 // only a tag that WARNS is a sign of risk: smart money buying or a recognised community is not (risk-tags.ts)
 if (bearishFlags(f.riskFlags).length > 0) out.push("sinal_de_risco");
 return out;
}

/** Whether the candidate may be offered to the model at all. */
export function enters(f: EcoFacts): boolean {
 return num(f.liquidityUsd) && f.liquidityUsd >= ENTRY_RULES.minLiquidityUsd && num(f.holders) && f.holders >= ENTRY_RULES.minHolders;
}

/* ---------------------------------------------------------------- the balance the page reads at the click */

/** Balances are judged on the clock of the machine that read them; two minutes is as old as one may be. */
export const SALDO_MAX_AGE_MS = 120_000;

export interface Saldo {
 readonly observedAtMs: number;
 /** The portfolio counted, in dollars, cash included. */
 readonly totalUsd: number;
 /** Stable coins over every network. */
 readonly cashUsd: number;
 readonly chains: readonly { readonly chainIndex: string; readonly cashUsd: number }[];
 readonly holdings: readonly { readonly chainIndex: string; readonly address: string; readonly usd: number }[];
 /** The share of the portfolio the person accepts to lose in one operation; null for the default. */
 readonly riskPct: number | null;
 /** The cash never spent, as a share of the portfolio; absent or null for the default. */
 readonly reserveShare?: number | null;
}

const rec = (v: unknown): Record<string, unknown> | null => (v !== null && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null);
const exactKeys = (o: Record<string, unknown>, keys: readonly string[]): boolean => Object.keys(o).length === keys.length && keys.every((k) => Object.hasOwn(o, k));
const money = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 1e12;
const CHAIN = /^[1-9]\d{0,11}$/;
const EVM = /^0x[0-9a-fA-F]{40}$/;
const SOLANA = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const MAX_CHAINS = 16;
const MAX_HOLDINGS = 40;

/** The address of a holding as the code keeps it: hex in lower case, a Solana mint exactly as given, or `native`. */
function holdingAddress(chainIndex: string, raw: string): string | null {
 if (raw === "native") return raw;
 if (chainIndex === "501") return SOLANA.test(raw) ? raw : null;
 return EVM.test(raw) ? raw.toLowerCase() : null;
}

/** A closed schema: only numbers and public token addresses, never the address of the person's wallet. Null when anything is out of shape. */
export function parseSaldo(raw: unknown): Saldo | null {
 const o = rec(raw);
 const SALDO_KEYS = ["observedAtMs", "totalUsd", "cashUsd", "chains", "holdings", "riskPct"];
 if (o === null || !(exactKeys(o, SALDO_KEYS) || exactKeys(o, [...SALDO_KEYS, "reserveShare"]))) return null;
 if (o.reserveShare !== undefined && o.reserveShare !== null && (typeof o.reserveShare !== "number" || !Number.isFinite(o.reserveShare) || o.reserveShare < 0.05 || o.reserveShare > 0.6)) return null;
 if (!Number.isSafeInteger(o.observedAtMs) || (o.observedAtMs as number) <= 0 || !money(o.totalUsd) || !money(o.cashUsd) || o.cashUsd > o.totalUsd + 0.01) return null;
 if (o.riskPct !== null && (typeof o.riskPct !== "number" || !Number.isFinite(o.riskPct) || o.riskPct <= 0 || o.riskPct > 0.2)) return null;
 if (!Array.isArray(o.chains) || o.chains.length > MAX_CHAINS || !Array.isArray(o.holdings) || o.holdings.length > MAX_HOLDINGS) return null;
 const chains: { chainIndex: string; cashUsd: number }[] = [];
 for (const item of o.chains) {
  const c = rec(item);
  if (c === null || !exactKeys(c, ["chainIndex", "cashUsd"]) || typeof c.chainIndex !== "string" || !CHAIN.test(c.chainIndex) || !money(c.cashUsd) || chains.some((x) => x.chainIndex === c.chainIndex)) return null;
  chains.push({ chainIndex: c.chainIndex, cashUsd: c.cashUsd });
 }
 const holdings: { chainIndex: string; address: string; usd: number }[] = [];
 for (const item of o.holdings) {
  const h = rec(item);
  if (h === null || !exactKeys(h, ["chainIndex", "address", "usd"]) || typeof h.chainIndex !== "string" || !CHAIN.test(h.chainIndex) || typeof h.address !== "string" || !money(h.usd)) return null;
  const address = holdingAddress(h.chainIndex, h.address);
  if (address === null) return null;
  holdings.push({ chainIndex: h.chainIndex, address, usd: h.usd });
 }
 const sum = chains.reduce((s, c) => s + c.cashUsd, 0);
 // the cash of the networks cannot be more than the cash overall: a page that says otherwise is wrong, and sizing on it would spend what is not there
 if (sum > o.cashUsd + 0.01) return null;
 return { observedAtMs: o.observedAtMs as number, totalUsd: o.totalUsd, cashUsd: o.cashUsd, chains, holdings, riskPct: o.riskPct as number | null, ...(o.reserveShare === undefined ? {} : { reserveShare: o.reserveShare as number | null }) };
}

export const isSaldoFresh = (saldo: Saldo, nowMs: number): boolean => Number.isFinite(nowMs) && saldo.observedAtMs <= nowMs + 5_000 && nowMs - saldo.observedAtMs <= SALDO_MAX_AGE_MS;

/* ---------------------------------------------------------------- the candidates and their ceilings */

export interface EcoCandidate {
 readonly facts: EcoFacts;
 readonly families: readonly Family[];
 readonly marks: readonly MarkId[];
 readonly cap: SizingCap;
 /** What the person already holds of it, in dollars. */
 readonly heldUsd: number;
}

export type EcoSourceState = "fresh" | "stale" | "unavailable";

/** Freshness of the scan held by the agent reader; age is measured from EcoContext.observedAtMs. */
export interface EcoSourceQuality {
 readonly state: EcoSourceState;
 readonly ageMs: number | null;
}

export interface EcoContext {
 readonly observedAtMs: number | null;
 readonly saldo: Saldo | null;
 readonly candidates: readonly EcoCandidate[];
 /** Candidates that were read and not offered, by reason (a honeypot, a pool too small), counted and never named. */
 readonly excluded: Readonly<Record<string, number>>;
 /** Optional for existing contexts which do not use the cached ecosystem reader. */
 readonly sourceQuality?: EcoSourceQuality;
}

/** Contexts created outside the cached reader retain their historic fresh behavior. */
export const isEcoSourceFresh = (eco: EcoContext): boolean => eco.sourceQuality === undefined || eco.sourceQuality.state === "fresh";

/** The ceiling of each candidate and the families and marks, from the facts and the balance. */
export function candidateOf(facts: EcoFacts, saldo: Saldo | null): EcoCandidate {
 const families = familiesOf(facts);
 const marks = marksOf(facts);
 const held = saldo?.holdings.filter((h) => h.chainIndex === facts.chainIndex && h.address === (facts.chainIndex === "501" ? facts.address : facts.address.toLowerCase())).reduce((s, h) => s + h.usd, 0) ?? 0;
 const cap: SizingCap = saldo === null ? { maxUsd: 0, binding: "sem_dado", sharePct: null } : capFor(capInput(facts, saldo, marks, held));
 return { facts, families, marks, cap, heldUsd: held };
}

/** What the ceiling of a candidate is computed from. Exposed so the limit that held a ceiling down can be named after the fact (see `tightestLimit`). */
function capInput(facts: EcoFacts, saldo: Saldo, marks: readonly string[], heldUsd: number): SizingInput {
 return {
  portfolioUsd: saldo.totalUsd,
  cashOnChainUsd: saldo.chains.find((c) => c.chainIndex === facts.chainIndex)?.cashUsd ?? 0,
  totalCashUsd: saldo.cashUsd,
  heldUsd,
  liquidityUsd: facts.liquidityUsd,
  volume24hUsd: facts.volumeUsd,
  marked: marks.length > 0,
  riskPct: saldo.riskPct,
  reserveShare: saldo.reserveShare ?? null,
 };
}

/* ---------------------------------------------------------------- what the model may answer */

const STANCES = ["skip", "watch", ...BUY_SIZES] as const;
export type Stance = (typeof STANCES)[number];
export const NO_FAMILY = "nenhuma";
/** The ranks the model fills: first, second and third. */
const RANKS = 3;

/** The stances offered for a candidate: a size only where the code found a ceiling to take a fraction of. */
export function offeredStances(c: EcoCandidate): readonly Stance[] {
 return c.cap.maxUsd > 0 ? STANCES : ["skip", "watch"];
}

/** What the model answered, as the adapter hands it over (untrusted). */
export interface EcoAnswer {
 /** candidate id -> stance id */
 readonly stances?: unknown;
 /** The ids for first, second and third place, or "none". */
 readonly order?: unknown;
 /** candidate id -> the family that weighed most, or "nenhuma" */
 readonly drivers?: unknown;
}

export interface EcoPick {
 readonly rank: number;
 readonly candidateId: string;
 readonly chainIndex: string;
 readonly address: string;
 readonly symbol: string;
 readonly size: BuySize;
 readonly fraction: number;
 /** Dollars to put in, whole dollars, from the cash of its network; 0 when the cash could not cover the minimum order. */
 readonly usd: number;
 readonly capUsd: number;
 readonly binding: Binding;
 readonly scaled: boolean;
 /** The family the model said weighed most, or null. */
 readonly driver: Family | null;
 readonly families: readonly Family[];
 readonly marks: readonly MarkId[];
 readonly facts: EcoFacts;
}

export interface EcoDecision {
 readonly candidateId: string;
 readonly chainIndex: string;
 readonly address: string;
 readonly symbol: string;
 readonly stance: Stance;
 /** The exact global slot chosen by the model; unranked candidates have no priority. */
 readonly rank: 1 | 2 | 3 | null;
 readonly driver: Family | null;
 readonly families: readonly Family[];
 readonly marks: readonly MarkId[];
 readonly facts: EcoFacts;
}

export interface EcoResult {
 readonly observedAtMs: number;
 readonly saldo: { readonly totalUsd: number; readonly cashUsd: number } | null;
 /** Up to three, in the order the model ranked them. Empty is a valid answer: nothing is worth it now. */
 readonly picks: readonly EcoPick[];
 /** Additive for legacy readers. Every candidate retains its stance, including unranked watch/skip. */
 readonly decisions?: readonly EcoDecision[];
 /** How many candidates the model looked at, and how many it put aside. */
 readonly considered: number;
 readonly excluded: Readonly<Record<string, number>>;
}

export type EcoVerdict = { readonly ok: true; readonly result: EcoResult } | { readonly ok: false; readonly reason: string };

const isStance = (v: unknown): v is Stance => typeof v === "string" && (STANCES as readonly string[]).includes(v);
const isFamily = (v: unknown): v is Family => typeof v === "string" && (FAMILIES as readonly string[]).includes(v);

export function validateEcosystem(raw: unknown, ctx: EcoContext): EcoVerdict {
 if (ctx.observedAtMs === null || !isEcoSourceFresh(ctx)) return { ok: false, reason: "ecossistema_indisponivel" };
 const answer = rec(raw);
 const stances = rec(answer?.stances);
 const drivers = rec(answer?.drivers);
 if (answer === null || stances === null || drivers === null || !Array.isArray(answer.order) || answer.order.length !== RANKS) return { ok: false, reason: "ecossistema_forma" };
 const byId = new Map(ctx.candidates.map((c) => [c.facts.candidateId, c]));
 if (Object.keys(stances).length !== byId.size) return { ok: false, reason: "ecossistema_estados" };
 for (const [id, candidate] of byId) {
  const stance = stances[id];
  if (!isStance(stance) || !offeredStances(candidate).includes(stance)) return { ok: false, reason: "ecossistema_postura_invalida" };
 }
 const ranked: string[] = [];
 const ranks = new Map<string, 1 | 2 | 3>();
 for (const [index, entry] of answer.order.entries()) {
  if (entry === "none" || entry === null) continue;
  if (typeof entry !== "string" || !byId.has(entry) || ranked.includes(entry)) return { ok: false, reason: "ecossistema_ordem_invalida" };
  if (stances[entry] === "skip") return { ok: false, reason: "ecossistema_ordem_incoerente" };
  ranked.push(entry);
  ranks.set(entry, (index + 1) as 1 | 2 | 3);
 }
 const decisions: EcoDecision[] = [];
 for (const [id, c] of byId) {
  const driver = drivers[id];
  // An explanation is checked even for an unranked candidate; no invented positive family survives.
  if (driver !== NO_FAMILY && driver !== undefined && driver !== null && (!isFamily(driver) || !c.families.includes(driver))) return { ok: false, reason: "ecossistema_motivo_invalido" };
  decisions.push({ candidateId: id, chainIndex: c.facts.chainIndex, address: c.facts.address, symbol: c.facts.symbol, stance: stances[id] as Stance, rank: ranks.get(id) ?? null, driver: isFamily(driver) ? driver : null, families: c.families, marks: c.marks, facts: c.facts });
 }
 const chosen = ranked.filter((id) => (BUY_SIZES as readonly string[]).includes(stances[id] as string)).map((id) => {
  const c = byId.get(id)!;
  const driver = drivers[id];
  return { c, size: stances[id] as BuySize, family: isFamily(driver) ? driver : null };
 });

 const saldo = ctx.saldo;
 const allocations =
  saldo === null
   ? chosen.map((x) => ({ candidateId: x.c.facts.candidateId, chainIndex: x.c.facts.chainIndex, capUsd: 0, size: x.size, usd: 0, scaled: false }))
   : allocate(
    chosen.map((x) => ({ candidateId: x.c.facts.candidateId, chainIndex: x.c.facts.chainIndex, capUsd: x.c.cap.maxUsd, size: x.size })),
    Object.fromEntries(saldo.chains.map((c) => [c.chainIndex, c.cashUsd])),
    saldo.cashUsd,
    saldo.totalUsd,
   );
 const picks: EcoPick[] = chosen.map((x, i) => {
  const a = allocations[i]!;
  return {
   rank: i + 1,
   candidateId: x.c.facts.candidateId,
   chainIndex: x.c.facts.chainIndex,
   address: x.c.facts.address,
   symbol: x.c.facts.symbol,
   size: x.size,
   fraction: FRACTIONS[x.size],
   usd: a.usd,
   capUsd: x.c.cap.maxUsd,
   binding: x.c.cap.binding,
   scaled: a.scaled,
   driver: x.family as Family | null,
   families: x.c.families,
   marks: x.c.marks,
   facts: x.c.facts,
  };
 });
 return { ok: true, result: { observedAtMs: ctx.observedAtMs, saldo: saldo === null ? null : { totalUsd: saldo.totalUsd, cashUsd: saldo.cashUsd }, picks, decisions, considered: ctx.candidates.length, excluded: ctx.excluded } };
}

/* ---------------------------------------------------------------- the Brief the model reads */

const k = (v: number | null): number | null => (v === null || !Number.isFinite(v) ? null : Math.round(v / 1000));
const r1 = (v: number | null): number | null => (v === null || !Number.isFinite(v) ? null : Math.round(v * 10) / 10);
const r0 = (v: number | null): number | null => (v === null || !Number.isFinite(v) ? null : Math.round(v));

/** The legend the model reads once: what each short key of an item means. */
export const BRIEF_KEYS: Readonly<Record<string, string>> = {
 s: "symbol",
 n: "tracked-wallet trail 0-100 relative to its chain; null unknown",
 w: "tracked wallets that bought it",
 p: "tracked purchases already sold %",
 b: "buy transactions %",
 l: "pool liquidity, USD thousands",
 v: "24h volume, USD thousands",
 c: "24h price change %",
 h: "holders",
 t: "top10 supply %",
 d: "creator supply %",
 u: "bundlers supply %",
 r: "provider risk 0-5; null unknown",
 m: "care codes",
 f: "positive evidence family codes",
 x: "buy ceiling, portfolio %; 0 cannot buy; null balance unknown",
 y: "already held, portfolio %",
 q: "token-risk [ageMs,stale]; null unknown/unavailable; origin=fontes.origem; no window",
 fontes: "redes[chain]=[hot-tokens[ageMs,stale,timeFrame],signals[ageMs,stale]]; origin=origem; null unknown/unavailable; signals has no window",
};

export function briefItem(c: EcoCandidate, portfolioUsd: number | null): Record<string, unknown> {
 const f = c.facts;
 const buys = f.buyShare === null ? null : Math.round(f.buyShare * 100);
 return {
  s: f.symbol,
  n: r0(f.nota),
  w: f.wallets,
  p: r0(f.soldPct),
  b: buys,
  l: k(f.liquidityUsd),
  v: k(f.volumeUsd),
  c: r1(f.changePct),
  h: f.holders,
  t: r0(f.top10Pct),
  d: r0(f.devPct),
  u: r0(f.bundlePct),
  r: f.riskLevel,
  m: c.marks,
  f: c.families,
  x: c.cap.sharePct === null ? null : Math.round(c.cap.sharePct * 1000) / 10,
  y: portfolioUsd === null || portfolioUsd <= 0 ? null : r1((c.heldUsd / portfolioUsd) * 100),
 };
}
