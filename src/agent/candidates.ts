/**
 * What the agent puts in front of the model each cycle (AUT-2): the holdings it could trim or leave, and the purchases the ecosystem found, each with the stances the code can actually carry out and the
 * dollars the code worked out for each. Triggers are observations from measured facts, never advice. Every threshold here is a CHOICE of this code, conservative and not calibrated; the Placar is what will
 * say whether any of them earns its keep. Pure: no clock, no network, no storage.
 */
import { isEcoSourceFresh, parseSaldo, type EcoContext, type EcoFacts, type Saldo } from "../opportunity/ecosystem";
import { bearishFlags } from "../opportunity/risk-tags";
import { cleanSymbol } from "./book";
import { exitStancesOffered, sellPlan } from "./exit";
import type { MomentumFacts } from "./momentum";
import { offeredProfiles, PROFILE_IDS, wildProfile, type ProfileId } from "./plans";
import { executableCeiling, sizesFor } from "./sizing-agent";
import { timingFamilies, timingMarks, TIMING, type TimingFacts } from "./timing";
import type { Book, Candidate, HoldingFacts, MomentumViewLike, PlanViewLike, Position } from "./types";

export const HOLDING_RULES = {
 /** At most this many holdings go to the model in one cycle (the biggest first); the rest are counted. */
 maxHoldings: 8,
 /** Tracked wallets already sold at least this share of what they bought. */
 soldPct: 50,
 /** The position is at least this share of the liquidity of its pool: leaving moves the price. */
 exitImpactPct: 5,
 /** The provider's risk level, 0 to 5. */
 riskLevel: 4,
 /** Percent since the agent bought it. */
 lossPct: -15,
 gainPct: 50,
} as const;

/**
 * The smallest purchase the code will plan: none. The owner decided on 2026-10-14 that there is no fixed minimum order, and no minimum by network either (the 250 dollars of Ethereum mainnet was a judgment of the code
 * about gas): what a small order costs is a fact the Jev weighs, and the quote of the size it chooses says it. What remains is only that the amount is positive and representable (swap-args.ts).
 */
export const minBuyUsd = (_chainIndex: string): number => 0;

/** What is known of a position when nothing could be read about it but the price the balance came with. */
export const priceOnlyFacts = (priceUsd: number): HoldingFacts => ({ priceUsd, sinceEntryPct: null, changeH24Pct: null, liquidityUsd: null, exitImpactPct: null, volumeH24Usd: null, soldPct: null, riskLevel: null, riskFlags: [], heldHours: null });

export type TriggerId = "carteiras_venderam" | "saida_dificil" | "sinal_de_risco" | "queda_desde_a_entrada" | "ganho_a_proteger";

const TRIGGER_LABEL: Readonly<Record<TriggerId, string>> = {
 carteiras_venderam: "as carteiras rastreadas ja venderam metade ou mais",
 saida_dificil: "a posicao e grande para a liquidez do pool",
 sinal_de_risco: "a OKX marca risco alto ou um sinal de risco",
 queda_desde_a_entrada: "caiu muito desde a compra do agente",
 ganho_a_proteger: "subiu muito desde a compra do agente",
};

const num = (v: number | null): v is number => v !== null && Number.isFinite(v);

/** What the measurements say about a holding. A value that is null raises nothing: unknown is not a danger and not a safety. */
export function triggersOf(f: HoldingFacts): TriggerId[] {
 const R = HOLDING_RULES;
 const out: TriggerId[] = [];
 if (num(f.soldPct) && f.soldPct >= R.soldPct) out.push("carteiras_venderam");
 if (num(f.exitImpactPct) && f.exitImpactPct >= R.exitImpactPct) out.push("saida_dificil");
 if (bearishFlags(f.riskFlags).length > 0 || (num(f.riskLevel) && f.riskLevel >= R.riskLevel)) out.push("sinal_de_risco");
 if (num(f.sinceEntryPct) && f.sinceEntryPct <= R.lossPct) out.push("queda_desde_a_entrada");
 if (num(f.sinceEntryPct) && f.sinceEntryPct >= R.gainPct) out.push("ganho_a_proteger");
 return out;
}

export interface HoldingCandidates {
 readonly candidates: readonly Candidate[];
 /** Positions read and not offered, by reason, counted and never named. */
 readonly excluded: Readonly<Record<string, number>>;
}

/** A holding with the last hour of its token attached: the view, and its marks among the triggers (observations: never a sale by itself). */
export function withMomentum(c: Candidate, m: MomentumFacts | null): Candidate {
 if (m === null) return c;
 return { ...c, triggers: [...c.triggers, ...m.marks.filter((mark) => !c.triggers.includes(mark))], momentum: momentumView(m) };
}

/** A holding with the two-day hourly history and positive families of its token attached, so the model keeps the same structural view after buying. */
export function withTiming(c: Candidate, tf: TimingFacts | null, extraFamilies: readonly string[] = []): Candidate {
 if (tf === null && extraFamilies.length === 0) return c;
 const tFamilies = tf === null ? [] : timingFamilies(tf);
 const families = [...c.families];
 for (const fam of [...extraFamilies, ...tFamilies]) if (!families.includes(fam)) families.push(fam);
 const timing: Candidate["timing"] =
  tf === null
   ? c.timing
   : { rsi: tf.rsi, rangePos: tf.rangePos, ret4hPct: tf.ret4hPct, ret24hPct: tf.ret24hPct, runUpPct: tf.runUpPct, drawFromHighPct: tf.drawFromHighPct, sigmaHourPct: tf.sigmaHourPct, ageMin: tf.ageMin ?? null };
 return { ...c, families, timing };
}

export function holdingCandidates(
 book: Book,
 factsOf: (position: Position) => HoldingFacts | null,
 planViewOf: (position: Position) => PlanViewLike | null = () => null,
 momentumOf: (position: Position) => MomentumFacts | null = () => null,
): HoldingCandidates {
 const excluded: Record<string, number> = {};
 const bump = (reason: string) => {
  excluded[reason] = (excluded[reason] ?? 0) + 1;
 };
 const eligible: Position[] = [];
 for (const p of book.positions) {
  if (p.isCash) continue;
  // a position with no value (unknown, or worth nothing) cannot be weighed; a small one can: there is no dust threshold (the owner's decision of 2026-10-14), the Jev sees its value and what leaving it costs
  if (p.usd === null || !Number.isFinite(p.usd) || p.usd <= 0) bump("sem_valor");
  else eligible.push(p);
 }
 eligible.sort((a, b) => (b.usd as number) - (a.usd as number) || (a.id + a.wallet < b.id + b.wallet ? -1 : 1));
 const offered = eligible.slice(0, HOLDING_RULES.maxHoldings);
 for (let i = HOLDING_RULES.maxHoldings; i < eligible.length; i++) bump("fora_do_limite");
 const candidates = offered.map((p): Candidate => {
  const facts = factsOf(p);
  const stances = exitStancesOffered(p);
  const usdByStance: Record<string, number> = {};
  for (const s of stances) usdByStance[s] = s === "hold" ? 0 : (sellPlan(p, s)?.usd ?? 0);
  const mm = momentumOf(p);
  return {
   id: `hold:${p.id}@${p.wallet}`,
   kind: "holding",
   symbol: p.symbol,
   chainIndex: p.chainIndex,
   address: p.address,
   heldUsd: p.usd as number,
   stances,
   usdByStance,
   facts,
   // what the token is doing in the last minutes joins what the code noticed (observations: a stagnant or falling holding is a fact for the model to weigh, never a sale by itself)
   triggers: [...(facts === null ? [] : triggersOf(facts)), ...(mm === null ? [] : mm.marks)],
   families: [],
   marks: [],
   wallet: p.wallet,
   profiles: [],
   plan: planViewOf(p),
   timing: null,
   ...(mm === null ? {} : { momentum: momentumView(mm) }),
  };
 });
 return { candidates, excluded };
}

const floorCents = (v: number): number => Math.floor(Number((v * 100).toFixed(6))) / 100;

/**
 * What purchases already sent have spent and the wallet does not show yet: in raw units of the coin each network pays in (what is taken off the balance of that coin, exactly) and, for a book that states cash with no coin
 * position behind it, in dollars.
 */
export interface PendingDebit {
 readonly byChain: Readonly<Record<string, number>>;
 readonly rawByChain: Readonly<Record<string, bigint>>;
}
const NO_PENDING: PendingDebit = { byChain: {}, rawByChain: {} };

/** Whole units of a coin that the wallet holds less `debitMinor` (never below zero), cut DOWN to the cent; null when the balance or its decimals are not known exactly. */
function unitsFloorCents(balanceMinor: string | null, decimals: number | null, debitMinor: bigint = 0n): number | null {
 if (balanceMinor === null || !/^\d+$/.test(balanceMinor) || decimals === null || !Number.isInteger(decimals) || decimals < 0 || decimals > 36) return null;
 const left = BigInt(balanceMinor) - debitMinor;
 const cents = ((left > 0n ? left : 0n) * 100n) / 10n ** BigInt(decimals);
 return cents > 100_000_000_000_000n ? 1e12 : Number(cents) / 100;
}

/**
 * The cash a purchase can really use on each network (the independent review of 2026-10-15, SF-2 and SF-3): the order pays in ONE dollar coin, the biggest one the agent wallet holds on the network (`settlementFor`), and
 * sends dollars as units of that coin, so the cash offered is what THAT coin holds in whole units, cut down to the cent: never the sum of several coins, never the balance times a price above one, never a rounded-up cent.
 * A coin whose balance or decimals are not known exactly cannot pay (cash zero), and the native coin is never cash. What purchases already sent have spent and the wallet does not show yet comes off, never below zero.
 */
function executableCashByChain(book: Book, pending: PendingDebit = NO_PENDING): Record<string, number> {
 const best = new Map<string, Position>();
 for (const p of book.positions) {
  if (p.wallet !== "agente" || !p.isCash || p.address === "native" || p.usd === null || !(p.usd > 0)) continue;
  const current = best.get(p.chainIndex);
  if (current === undefined || p.usd > (current.usd as number)) best.set(p.chainIndex, p);
 }
 const out: Record<string, number> = {};
 // a book whose cash is stated for a network but holds no dollar coin position there (a hand-made book): the stated cash, cut down to the cent. A book made from a wallet reading always has the positions, and a coin that is there but cannot pay is cash zero, not this.
 const hasCoin = new Set(book.positions.filter((p) => p.wallet === "agente" && p.isCash && p.address !== "native").map((p) => p.chainIndex));
 for (const [chainIndex, usd] of Object.entries(book.cashByChain)) {
  if (best.has(chainIndex) || hasCoin.has(chainIndex) || !Number.isFinite(usd) || !(usd > 0)) continue;
  const spent = pending.byChain[chainIndex];
  out[chainIndex] = floorCents(spent !== undefined && Number.isFinite(spent) && spent > 0 ? Math.max(0, usd - spent) : usd);
 }
 for (const [chainIndex, coin] of best) {
  const units = unitsFloorCents(coin.balanceMinor, coin.decimals, pending.rawByChain[chainIndex] ?? 0n);
  out[chainIndex] = units === null ? 0 : Math.min(floorCents(coin.usd as number), units);
 }
 return out;
}

/**
 * The balance the sizing of purchases reads: the wallet the agent executes in, nothing else. The principal wallet is read for the picture of the whole portfolio, but the agent never buys with it. Null
 * when the value of the wallet is unknown or the numbers do not add up (the same strict schema the page balance goes through).
 */
export function saldoOf(book: Book, riskPct: number | null, reserveShare: number | null = null, pending: PendingDebit = NO_PENDING): Saldo | null {
 if (book.agentUsd === null) return null;
 const cashEntries = Object.entries(executableCashByChain(book, pending));
 const holdings = book.positions
  .filter((p) => p.wallet === "agente" && !p.isCash && p.usd !== null && p.usd > 0)
  .sort((a, b) => (b.usd as number) - (a.usd as number))
  .slice(0, 40)
  .map((p) => ({ chainIndex: p.chainIndex, address: p.chainIndex === "501" || p.address === "native" ? p.address : p.address.toLowerCase(), usd: p.usd as number }));
 return parseSaldo({
  observedAtMs: book.observedAtMs,
  totalUsd: book.agentUsd,
  cashUsd: cashEntries.reduce((s, [, usd]) => s + usd, 0),
  chains: cashEntries.map(([chainIndex, cashUsd]) => ({ chainIndex, cashUsd })),
  holdings,
  riskPct,
  ...(reserveShare === null ? {} : { reserveShare }),
 });
}

/** What the last hour of a token in five-minute bars says, for the Brief. */
function momentumView(m: MomentumFacts | null): MomentumViewLike | null {
 return m === null ? null : { ret5mPct: m.ret5mPct, ret15mPct: m.ret15mPct, ret1hPct: m.ret1hPct, rangeHourPct: m.rangeHourPct, volRatio: m.volRatio, barAgeMin: m.barAgeMin };
}

/**
 * The purchases the ecosystem found, each with the sizes the code can carry out and the profiles of target and stop it can be given. Nothing here closes a purchase by an economic judgment (the owner's decision of
 * 2026-10-14): a token with a short or no history, a volatility no stop fits, a price that is extended, parabolic, falling fast or stagnant, a thin pool, a mark of care: each is a FACT the Jev reads. What is left to
 * the code is what is physical: the executable maximum is the cash of the agent wallet on the token's network (and the limit of the OKX account per transaction, when it has one); the sizes are fractions of it; a purchase
 * with no cash on its network has nothing but `skip` and says why (`cap.binding`).
 */
export function buyCandidates(
 eco: EcoContext,
 timingOf: (facts: EcoFacts) => TimingFacts | null,
 minBuy: (chainIndex: string) => number = minBuyUsd,
 momentumOf: (facts: EcoFacts) => MomentumFacts | null = () => null,
 /** The limit per transaction the owner switched on in the OKX portal, when the signing tool reported one: the provider's restriction that bounds what can be offered; null when there is none. */
 providerPerTxUsd: number | null = null,
 /** The profile of the plan a position the agent already holds is under, when there is one: buying more of it keeps that plan, so it is the only profile offered (SF-5 of the review of 2026-10-15). */
 planProfileOf: (chainIndex: string, address: string) => ProfileId | null = () => null,
): Candidate[] {
 if (!isEcoSourceFresh(eco)) return [];
 return eco.candidates.map((c): Candidate => {
  const tf = timingOf(c.facts);
  const tMarks = timingMarks(tf);
  const mm = momentumOf(c.facts);
  const sigma = tf?.sigmaHourPct ?? null;
  const wild = wildProfile(sigma);
  // every profile of target and stop is on offer for every purchase: whether a stop is noise for this token's volatility is a fact the Jev weighs (the marks and `tm.sg` say how it moves), not a closure
  const fitting = offeredProfiles(sigma);
  const planProfile = planProfileOf(c.facts.chainIndex, c.facts.address);
  const profiles: ProfileId[] = planProfile === null ? [...PROFILE_IDS] : [planProfile];
  const young = tf !== null && tf.bars < TIMING.fullBars;
  const cashOnChain = eco.saldo === null ? null : (eco.saldo.chains.find((x) => x.chainIndex === c.facts.chainIndex)?.cashUsd ?? 0);
  const ceiling = executableCeiling({ cashOnChainUsd: cashOnChain, providerPerTxUsd });
  const minOrder = minBuy(c.facts.chainIndex);
  const usdByStance: Record<string, number> = { skip: 0 };
  const stances: string[] = ["skip"];
  for (const [size, usd] of Object.entries(sizesFor(ceiling.usd))) {
   if (usd < minOrder) continue;
   stances.push(size);
   usdByStance[size] = usd;
  }
  const cap: NonNullable<Candidate["cap"]> = {
   maxUsd: ceiling.usd,
   binding: ceiling.binding,
   sharePct: eco.saldo === null || eco.saldo.totalUsd <= 0 ? null : ceiling.usd / eco.saldo.totalUsd,
   riskPct: eco.saldo?.riskPct ?? null,
  };
  return {
   id: `buy:${c.facts.candidateId}`,
   kind: "buy",
   symbol: cleanSymbol(c.facts.symbol),
   chainIndex: c.facts.chainIndex,
   address: c.facts.address,
   heldUsd: c.heldUsd,
   stances,
   usdByStance,
   facts: null,
   triggers: [],
   families: [...c.families, ...timingFamilies(tf)],
   marks: [
    ...c.marks,
    ...tMarks,
    ...(young ? ["historico_curto"] : []),
    ...(tf === null ? ["sem_historico"] : []),
    ...(wild === null ? [] : ["volatilidade_extrema"]),
    ...(tf !== null && wild === null && fitting.length === 0 ? ["sem_perfil_que_caiba"] : []),
    ...(mm === null ? [] : mm.marks),
    ...(planProfile === null ? [] : ["soma_ao_plano"]),
   ],
   wallet: "agente",
   profiles,
   plan: null,
   timing:
    tf === null
     ? null
     : { rsi: tf.rsi, rangePos: tf.rangePos, ret4hPct: tf.ret4hPct, ret24hPct: tf.ret24hPct, runUpPct: tf.runUpPct, drawFromHighPct: tf.drawFromHighPct, sigmaHourPct: tf.sigmaHourPct, ageMin: tf.ageMin ?? null },
   ...(mm === null ? {} : { momentum: momentumView(mm) }),
   cap,
   // every profile has the same executable maximum: the stop of a profile no longer sizes the purchase
   capByProfile: Object.fromEntries(profiles.map((id) => [id, ceiling.usd])),
  };
 });
}

/**
 * How many purchases each level of the mandate's risk would put on offer. The risk of the mandate no longer sizes a purchase (the owner's decision of 2026-10-14), so every level opens the same: the number of purchases
 * with something to buy. Kept so the mandate view of the Brief keeps its shape.
 */
export function openByRisk(eco: EcoContext, timingOf: (facts: EcoFacts) => TimingFacts | null, minBuy: (chainIndex: string) => number, risks: Readonly<Record<string, number>>, momentumOf: (facts: EcoFacts) => MomentumFacts | null = () => null, providerPerTxUsd: number | null = null): Record<string, number> {
 const open = !isEcoSourceFresh(eco) || eco.saldo === null ? 0 : buyCandidates(eco, timingOf, minBuy, momentumOf, providerPerTxUsd).filter((c) => c.stances.length > 1).length;
 return Object.fromEntries(Object.keys(risks).map((name) => [name, open]));
}
