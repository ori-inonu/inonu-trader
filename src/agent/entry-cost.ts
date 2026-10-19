/**
 * What a purchase costs to get in, known BEFORE the model is asked (the owner's request of 2026-10-15, after 8 of 13 failed orders of the day were refused by the executor for price impact: BOTTLE quoted 2.1 to 2.8 percent
 * against the 2 percent its profile pays, MANIFEST 1 percent against 0.5). The pool liquidity the Brief carries does NOT predict this (BOTTLE: 51 thousand dollars of pool, 2.1 percent for 11 dollars; MANIFEST: 484 thousand,
 * 1 percent), so the only honest source is a quote, or a quote the executor already took.
 *
 * Nothing here loosens a guard: the executor's rule (cli.ts) is unchanged and checked again when an order is sent. This only stops OFFERING what that same rule is certain to refuse, so the Jev chooses among plans that
 * can be carried out. The rule is the executor's own, imported, so the two can never drift apart: a purchase pays at most `buyCostCapPct(profile, IMPACT_CAP_PCT.buy)` of price impact, in absolute value. The quote is read at
 * the SMALLEST size offered, which is a lower bound for every larger one: a profile that fails there fails at every size, and one that passes may still be refused at a larger size by the executor. Nothing is hidden: a
 * purchase left with no profile is shown to the Jev closed (`skip` only) with a mark that says why; a profile removed from the list is a fact the mark states. A quote that could not be read changes nothing (unknown is not
 * a danger and not a safety). Pure but for the probe handed in: no clock, no storage.
 */
import { IMPACT_CAP_PCT } from "./cli";
import type { OrderRecord } from "./ledger";
import { planKey } from "./plans";
import { AGENT_BUY_SIZES } from "./sizing-agent";
import { buyCostCapPct } from "./swap-args";
import type { Candidate, PlannedOrder } from "./types";

/** Every profile of the purchase was refused by the entry cost: only `skip` is left. */
export const ENTRY_COST_CLOSED = "custo_de_entrada_alto";
/** Some profiles of the purchase were taken off the list because their entry cost cap is below what the quote costs. */
export const ENTRY_COST_NARROWED = "custo_de_entrada_limita_plano";
/** The executor could not quote the purchase because Gas Station setup is pending. */
export const ENTRY_COST_GAS_STATION = "gas_station_pendente";
/** What the model reads when its sale was refused for price impact and the larger sizes are not offered again for a while. */
export const SALE_REFUSED_TRIGGER = "venda_recusada_por_impacto";

/** How long a refusal for price impact keeps the same purchase narrowed and the same size of a sale off the list: the same half hour a failing sale already waits (cycle.ts). */
const IMPACT_BACKOFF_MS = 30 * 60_000;

/** The probe: at most this many open purchases are quoted in one cycle, one at a time (the tool shares its home folder with the executor), each for at most `perMs` and all of them for at most `totalMs`; an answer is kept `ttlMs`, a failure `failTtlMs`. CHOICES of this code, not calibrated. */
export const ENTRY_PROBE = { maxPerCycle: 3, perMs: 8_000, totalMs: 15_000, ttlMs: 5 * 60_000, failTtlMs: 60_000 } as const;

/** The smallest purchase on offer (by dollars): the quote of it is the lower bound of the entry cost of every size offered. Null when none is offered. */
function smallestOffered(c: Candidate): { readonly stance: string; readonly usd: number } | null {
  let best: { stance: string; usd: number } | null = null;
  for (const stance of AGENT_BUY_SIZES) {
    const usd = c.usdByStance[stance];
    if (c.stances.includes(stance) && usd !== undefined && usd > 0 && (best === null || usd < best.usd)) best = { stance, usd };
  }
  return best;
}

/** The same rule the executor applies (cli.ts): a purchase accepts at most `buyCostCapPct` of price impact for its profile, whichever way the price moves. */
export const entryCostFits = (profile: string, impactPct: number): boolean => Math.abs(impactPct) <= buyCostCapPct(profile, IMPACT_CAP_PCT.buy);

const withMark = (marks: readonly string[], mark: string): string[] => (marks.includes(mark) ? [...marks] : [...marks, mark]);

/** The purchase as the Jev should see it once the entry observation is known: profiles that can pay it, or closed when none can. Unknown leaves it exactly as it was. */
export function narrowByEntryCost(c: Candidate, observation: EntryQuoteObservation | null): Candidate {
  if (c.kind !== "buy" || observation === null) return c;
  if (observation.refusal === ENTRY_COST_GAS_STATION) return { ...c, stances: ["skip"], usdByStance: { skip: 0 }, profiles: [], capByProfile: {}, marks: withMark(c.marks, ENTRY_COST_GAS_STATION) };
  const impactPct = observation.impactPct;
  if (impactPct === null || !Number.isFinite(impactPct) || c.profiles.length === 0) return c;
  const kept = c.profiles.filter((p) => entryCostFits(p, impactPct));
  if (kept.length === c.profiles.length) return c;
  if (kept.length === 0) return { ...c, stances: ["skip"], usdByStance: { skip: 0 }, profiles: [], capByProfile: {}, marks: withMark(c.marks, ENTRY_COST_CLOSED) };
  return { ...c, profiles: kept, capByProfile: Object.fromEntries(Object.entries(c.capByProfile ?? {}).filter(([p]) => kept.includes(p))), marks: withMark(c.marks, ENTRY_COST_NARROWED) };
}

type RefusalRecord = Pick<OrderRecord, "atMs" | "side" | "stage" | "reason" | "chainIndex" | "address" | "stance" | "usd" | "wallet" | "source" | "quote">;

/**
 * The price impact the executor itself quoted for each purchase it refused for it within the window (the latest one per token, with the dollars it was for): the quote is already in the ledger, so nothing is asked
 * again and a restart forgets nothing. It says something about the sizes on offer only when it was for the smallest of them or less (a larger one failing says nothing about a smaller one): see `narrowBuysByEntryCost`.
 */
export function recentBuyImpacts(records: readonly RefusalRecord[], nowMs: number, windowMs: number = IMPACT_BACKOFF_MS): Map<string, { readonly impactPct: number; readonly usd: number }> {
  const latest = new Map<string, { atMs: number; impactPct: number; usd: number }>();
  for (const r of records) {
    if (r.side !== "buy" || r.wallet !== "agente" || r.stage !== "falhou" || r.reason !== "impacto_alto") continue;
    const impact = r.quote?.impactPct;
    if (impact === null || impact === undefined || !Number.isFinite(impact) || nowMs - r.atMs >= windowMs || r.atMs > nowMs) continue;
    const key = planKey(r.chainIndex, r.address);
    const seen = latest.get(key);
    if (seen === undefined || r.atMs >= seen.atMs) latest.set(key, { atMs: r.atMs, impactPct: impact, usd: r.usd });
  }
  return new Map([...latest].map(([k, v]) => [k, { impactPct: v.impactPct, usd: v.usd }]));
}

const SALE_RANK: Readonly<Record<string, number>> = { trim_third: 1, trim_half: 2, exit_all: 3 };

/**
 * The smallest sale (by rank) the executor refused for price impact within the window, per token, for sales the MODEL asked for: a refusal says that size and every larger one cost too much, not that a smaller slice
 * would. A stop or any exit a plan demands (`source: protecao`) is never counted: those are carried out by the code and never wait.
 */
export function recentSaleRefusals(records: readonly RefusalRecord[], nowMs: number, windowMs: number = IMPACT_BACKOFF_MS): Map<string, number> {
  const out = new Map<string, number>();
  for (const r of records) {
    if (r.side !== "sell" || r.wallet !== "agente" || r.source !== "modelo" || r.stage !== "falhou" || r.reason !== "impacto_alto") continue;
    const rank = SALE_RANK[r.stance];
    if (rank === undefined || nowMs - r.atMs >= windowMs || r.atMs > nowMs) continue;
    const key = planKey(r.chainIndex, r.address);
    out.set(key, Math.min(out.get(key) ?? rank, rank));
  }
  return out;
}

/** The holding without the sales the executor just refused for price impact (the one refused and every larger): keep it, or a smaller slice. The model is told why. */
export function withoutRefusedSales(c: Candidate, refusedFromRank: number | undefined): Candidate {
  if (c.kind !== "holding" || refusedFromRank === undefined) return c;
  const stances = c.stances.filter((s) => (SALE_RANK[s] ?? 0) < refusedFromRank || SALE_RANK[s] === undefined);
  if (stances.length === c.stances.length) return c;
  return { ...c, stances, usdByStance: Object.fromEntries(Object.entries(c.usdByStance).filter(([s]) => stances.includes(s))), triggers: c.triggers.includes(SALE_REFUSED_TRIGGER) ? c.triggers : [...c.triggers, SALE_REFUSED_TRIGGER] };
}

/** The hypothetical order of the smallest size of a purchase, for the quote only: it is never sent. Null when the purchase has no size to quote. */
export function smallestOrderOf(c: Candidate): PlannedOrder | null {
  const smallest = c.kind === "buy" ? smallestOffered(c) : null;
  if (smallest === null) return null;
  return { candidateId: c.id, side: "buy", stance: smallest.stance, chainIndex: c.chainIndex, symbol: c.symbol, address: c.address, usd: smallest.usd, amountMinor: null, wallet: "agente", profile: c.profiles[0] ?? null, source: "modelo" };
}

/** The price impact a quote says, as a signed percent (the provider writes a number or a string); null when it is not a finite number, which is unknown and changes nothing. */
export function impactOfQuote(raw: Readonly<Record<string, unknown>>): number | null {
  const v = raw.priceImpactPercent;
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : Number.NaN;
  return Number.isFinite(n) ? n : null;
}

/** A read-only observation of the quote probe: a finite impact if one was read and only an explicit executor gas refusal. */
export interface EntryQuoteObservation {
  readonly impactPct: number | null;
  readonly refusal: "gas_station_pendente" | null;
}

/** Reads the price impact of a quote, or an explicit gas-station refusal; other failures are unknown. It never signs and never sends. */
export type EntryQuoteReader = (order: PlannedOrder, signal: AbortSignal) => Promise<EntryQuoteObservation>;

/** The reader with a short memory per token and size, so a purchase that stays on the list is not quoted again every cycle. A failure is remembered for less. */
export function cachedEntryQuoteReader(read: EntryQuoteReader, now: () => number): EntryQuoteReader {
  const memory = new Map<string, { atMs: number; observation: EntryQuoteObservation }>();
  return async (order, signal) => {
    const key = `${planKey(order.chainIndex, order.address)}:${order.usd}`;
    const seen = memory.get(key);
    if (seen !== undefined && now() - seen.atMs < (seen.observation.refusal === null && seen.observation.impactPct !== null && Number.isFinite(seen.observation.impactPct) ? ENTRY_PROBE.ttlMs : ENTRY_PROBE.failTtlMs)) return seen.observation;
    let observation: EntryQuoteObservation;
    try {
      observation = await read(order, signal);
    } catch {
      observation = { impactPct: null, refusal: null };
    }
    memory.set(key, { atMs: now(), observation });
    return observation;
  };
}

/**
 * The purchases of a cycle as the Jev should see them: first what the executor itself quoted when it refused the same token within the window, then, for the best open ones still unknown (at most `maxPerCycle`, in the order
 * `quality` ranks them), a quote read one at a time. A purchase already closed is never quoted. Never throws and never waits past its own time limit: whatever could not be read is left as it was.
 */
export async function narrowBuysByEntryCost(input: {
  readonly buys: readonly Candidate[];
  readonly quality: (c: Candidate) => number;
  readonly records: readonly RefusalRecord[];
  readonly nowMs: number;
  /** Null: no quote is taken (shadow mode, buying paused, a stop file, no reader wired). The ledger part still applies. */
  readonly probe: EntryQuoteReader | null;
  readonly clock: () => number;
}): Promise<Candidate[]> {
  const recent = recentBuyImpacts(input.records, input.nowMs);
  const out = new Map<string, Candidate>();
  const known = new Set<string>();
  for (const c of input.buys) {
    // a refusal at a size no larger than the smallest on offer now is a lower bound for every size on offer: the cost cannot be less than it was
    const seen = recent.get(planKey(c.chainIndex, c.address));
    const smallest = smallestOffered(c);
    const applies = seen !== undefined && smallest !== null && seen.usd <= smallest.usd;
    if (applies) known.add(c.id);
    out.set(c.id, narrowByEntryCost(c, applies ? { impactPct: seen.impactPct, refusal: null } : null));
  }
  if (input.probe === null) return input.buys.map((c) => out.get(c.id)!);
  const unknown = [...out.values()]
    .filter((c) => c.stances.length > 1 && !known.has(c.id))
    .sort((a, b) => input.quality(b) - input.quality(a))
    .slice(0, ENTRY_PROBE.maxPerCycle);
  const started = input.clock();
  for (const c of unknown) {
    if (input.clock() - started >= ENTRY_PROBE.totalMs) break;
    const order = smallestOrderOf(c);
    if (order === null) continue;
    try {
      out.set(c.id, narrowByEntryCost(c, await input.probe(order, AbortSignal.timeout(ENTRY_PROBE.perMs))));
    } catch {
      // the quote is lost, the cycle is not
    }
  }
  return input.buys.map((c) => out.get(c.id)!);
}
