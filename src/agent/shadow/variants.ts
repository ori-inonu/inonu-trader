/**
 * The four hypotheses to be tried in SHADOW against the version in force (ADENDO-G, docs/sdd/agente-autonomo/ADENDO-G-hipoteses-em-sombra-20261015.md), written as pure functions over what the cycle already builds.
 * Nothing here is imported by the live agent, none of it changes a stance, an order or the Brief the version in force sends: a B (the laboratory of docs/sdd/hospedagem-24h/AUTOEVOLUCAO-20261014.md, stage 3, not
 * built yet) would call these on the SAME snapshot as A, on its own simulated portfolio. Each hypothesis changes ONE thing, and keeps every option the A offers visible: an option is never hidden, a stance is marked
 * or reordered, because the owner's rule is that the Jev decides and the code only carries out. Every number is a registered CHOICE of the experiment, not a calibrated one. Pure: no clock, no network, no storage.
 */
import type { Verdict } from "../conviction";
import { planKey } from "../plans";
import type { Candidate, Position } from "../types";

/** The version in force when these hypotheses were registered (2026-10-15): the packaged release the live agent runs. B and its ancestor are compared against exactly these bytes. */
export const A_ANCESTOR = { artifact: "InonuTrader.exe", release: "release24-6dce963a", sha256: "6dce963a635865dfcfcb5c59348e1f1373c404da6cf07614ff04d30b9c04d60f" } as const;

export type HypothesisId = "H1" | "H2" | "H3" | "H4" | "H5" | "H6";

export interface Hypothesis {
  readonly id: HypothesisId;
  readonly name: string;
  /** What kind of change it is, in the vocabulary of the laboratory: criteria, the question asked, the data shown, or the order shown. */
  readonly kind: "criterio" | "pergunta" | "dados" | "ordem";
  /** The ONE main change against A. */
  readonly change: string;
}

export const HYPOTHESES: readonly Hypothesis[] = Object.freeze([
  { id: "H1", name: "segurar_ate_o_plano", kind: "criterio", change: "a holding under a plan is offered only `hold` until its own plan resolves, unless a fact of the thesis breaking is present" },
  { id: "H2", name: "entrar_nos_melhores", kind: "criterio", change: "when most of the cash is idle, the purchases with the highest preference of the Jev (its highest probability for an option that buys) are entered at the smallest size, up to N, even when the Jev's own answer was skip" },
  { id: "H3", name: "custo_total_de_entrada", kind: "dados", change: "the Brief shows, per purchase, what entering costs in total: the account of a token never held before, the quoted fee, as dollars and as a share of each size" },
  { id: "H4", name: "conta_existente_primeiro", kind: "ordem", change: "purchases of tokens whose account already exists in the wallet are listed first and marked, none is hidden" },
  { id: "H5", name: "carteira_de_n_posicoes_iguais", kind: "criterio", change: "the portfolio holds up to N positions of equal size (N registered by the owner for the round, no default), each open slot is filled with the open purchase the Jev prefers the most, exits stay as in A, and the result is judged on the total value managed" },
  { id: "H6", name: "alocacao_conjunta_escolhida_pelo_jev", kind: "pergunta", change: "the question is framed on the whole portfolio and on the cost of idle cash, the Brief carries the portfolio view, and the Jev states with a fixed code why cash stays unallocated; the Jev still chooses every stance and size and the code never turns a skip into a purchase" },
] as const satisfies readonly Hypothesis[]);

// ---- H1: hold until the plan --------------------------------------------------------------------------------------------------------------------------------------------------------

/** The facts that break the thesis of a purchase: the provider marks a risk, leaving would be hard, or the tracked wallets already sold half. Registered before any data; a holding with one of them keeps every stance. */
export const THESIS_BREAK = ["sinal_de_risco", "saida_dificil", "carteiras_venderam"] as const;
export const H1_TRIGGER = "segurando_ate_o_plano";

/** A holding the agent opened under a plan is offered only `hold`, with the trigger that says why, unless a fact of the thesis breaking is there. Anything else passes through untouched. The plan's own exits (target, stop, trailing, time) are the code's and never wait. */
export function holdUntilPlan(c: Candidate): Candidate {
  if (c.kind !== "holding" || c.plan === null) return c;
  if (THESIS_BREAK.some((t) => c.triggers.includes(t))) return c;
  if (c.stances.length === 1 && c.stances[0] === "hold") return c;
  return { ...c, stances: ["hold"], usdByStance: { hold: 0 }, triggers: c.triggers.includes(H1_TRIGGER) ? c.triggers : [...c.triggers, H1_TRIGGER] };
}

// ---- H2: enter the best -------------------------------------------------------------------------------------------------------------------------------------------------------------

export const H2_DEFAULTS = { n: 3, floor: 0.2, minIdleShare: 0.5 } as const;

/**
 * The preference of the Jev for buying a purchase: the highest probability its answer gives to an option that buys. It is the SAME definition the Placar (`analysis.ts`, `pBuy`), the closing of the purchase (`cycle.ts`,
 * `firstP`) and the screen use, so the 0.20 floor of H2 is the number the owner reads ("GTA 23 percent"), not a sum over the sizes. Null when the answer has no probabilities (unknown is never invented).
 */
export function preferenceOf(v: Verdict | undefined): number | null {
  if (v === undefined || v.probabilities === null) return null;
  let best: number | null = null;
  for (const [option, p] of Object.entries(v.probabilities)) {
    if (!Number.isFinite(p) || p < 0 || p > 1) return null;
    if (option.startsWith("buy")) best = Math.max(best ?? 0, p);
  }
  return best;
}

/** The smallest purchase on offer for a candidate, by dollars (the stance the shadow enters with). Null when nothing is on offer. */
function smallestBuy(c: Candidate): string | null {
  let best: { stance: string; usd: number } | null = null;
  for (const stance of c.stances) {
    const usd = c.usdByStance[stance];
    if (!stance.startsWith("buy") || usd === undefined || !(usd > 0)) continue;
    if (best === null || usd < best.usd) best = { stance, usd };
  }
  return best?.stance ?? null;
}

export interface TopNInput {
  /** What the Jev asked for, one stance per candidate. */
  readonly stances: Readonly<Record<string, string>>;
  readonly verdicts: Readonly<Record<string, Verdict>> | undefined;
  readonly candidates: readonly Candidate[];
  /** The share of the agent wallet that is idle, in dollar coins, 0 to 1. */
  readonly idleShare: number;
  readonly n?: number;
  readonly floor?: number;
  readonly minIdleShare?: number;
  /**
   * The target and stop profile every entry over a skip is opened with. A skipped candidate has no profile of the Jev's (`decision.ts` only gives one to a purchase it chose), and the profile decides the stop, the
   * target, the trailing, the horizon AND whether the entry survives the entry cost cap of the executor (`buyCostCapPct`). It is an owner parameter per round with NO default, like N: without it nothing is entered.
   * A candidate that does not offer the registered profile takes no entry (the validation of a decision would refuse it).
   */
  readonly profile?: string | null;
}

/**
 * The shadow's choice when most of the cash is idle: the purchases the Jev prefers the most, up to N counting the ones it already chose to buy, entered at the smallest size on offer. The Jev's own skip is
 * overridden ONLY for a purchase whose preference is at least the registered floor, and only while the idle share stays at or above the registered level. Ties break by id so the same answer gives the same choice.
 * The answer as the Jev gave it is not changed: this returns a new map and the list of what it moved.
 */
export function topNByPreference(input: TopNInput): { readonly stances: Record<string, string>; readonly entered: readonly string[]; readonly profile: string | null } {
  const n = input.n ?? H2_DEFAULTS.n;
  const floor = input.floor ?? H2_DEFAULTS.floor;
  const minIdle = input.minIdleShare ?? H2_DEFAULTS.minIdleShare;
  const out: Record<string, string> = { ...input.stances };
  const profile = typeof input.profile === "string" && input.profile !== "" ? input.profile : null;
  if (profile === null || !(input.idleShare >= minIdle)) return { stances: out, entered: [], profile };
  const already = input.candidates.filter((c) => c.kind === "buy" && out[c.id] !== undefined && out[c.id] !== "skip").length;
  const room = n - already;
  if (room <= 0) return { stances: out, entered: [], profile };
  const ranked = input.candidates
    .filter((c) => c.kind === "buy" && out[c.id] === "skip" && smallestBuy(c) !== null && c.profiles.includes(profile))
    .map((c) => ({ c, p: preferenceOf(input.verdicts?.[c.id]) }))
    .filter((r): r is { c: Candidate; p: number } => r.p !== null && r.p >= floor)
    .sort((a, b) => b.p - a.p || (a.c.id < b.c.id ? -1 : 1))
    .slice(0, room);
  for (const { c } of ranked) out[c.id] = smallestBuy(c)!;
  return { stances: out, entered: ranked.map((r) => r.c.id), profile };
}

// ---- H3: the total cost of entering -------------------------------------------------------------------------------------------------------------------------------------------------

export interface EntryCostInput {
  /** True when the wallet never held this token (the first buy opens an account for it). */
  readonly firstTime: boolean;
  /** What opening that account cost, in dollars, as MEASURED on this wallet's first buys (the median native outflow of the first buys, in dollars); null when not measured. */
  readonly accountUsd: number | null;
  /** The network and trade fee the last quote read on that network announced, in dollars; null when none. */
  readonly feeUsd: number | null;
}

export interface EntryCostFact {
  readonly firstTime: boolean;
  readonly accountUsd: number | null;
  readonly feeUsd: number | null;
  /** The cost of getting in, in dollars: null when a part that applies is unknown (unknown is never zero). */
  readonly totalUsd: number | null;
  /** The same cost as a percent of each size on offer; null per size when the total is unknown. */
  readonly totalPctBySize: Readonly<Record<string, number | null>>;
}

const round2 = (v: number): number => Math.round(v * 100) / 100;

/** What entering a purchase costs in total, from the facts handed in. An account that applies (`firstTime`) with no measured cost, or a fee that was not read, makes the total unknown rather than smaller. */
export function entryCostOf(c: Candidate, input: EntryCostInput): EntryCostFact {
  const account = input.firstTime ? input.accountUsd : 0;
  const total = account === null || input.feeUsd === null ? null : account + input.feeUsd;
  const bySize: Record<string, number | null> = {};
  for (const [stance, usd] of Object.entries(c.usdByStance)) {
    if (!stance.startsWith("buy")) continue;
    bySize[stance] = total === null || !(usd > 0) ? null : round2((total / usd) * 100);
  }
  return { firstTime: input.firstTime, accountUsd: input.accountUsd, feeUsd: input.feeUsd, totalUsd: total === null ? null : Math.round(total * 10_000) / 10_000, totalPctBySize: bySize };
}

/** What the new Brief key says, for the legend of the variant. */
export const H3_LEGEND = "ce = what entering costs in total: ft true when the wallet never held the token (the first buy opens its account), ac dollars of that account as measured on this wallet, fe dollars of the quoted fee, t total dollars, pct percent of each size on offer; null is unknown, never zero";

/** The median of a list of numbers (null for an empty list): used to MEASURE the account cost from the wallet's own first buys. */
export function medianOf(values: readonly number[]): number | null {
  const v = values.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (v.length === 0) return null;
  const mid = Math.floor(v.length / 2);
  return v.length % 2 === 1 ? v[mid]! : (v[mid - 1]! + v[mid]!) / 2;
}

// ---- H4: existing accounts first ----------------------------------------------------------------------------------------------------------------------------------------------------

export const H4_MARK = "conta_existente";

/** Purchases of tokens whose account already exists come first and carry the mark; the order inside each group is kept, and nothing is removed. */
export function preferExistingAccounts(buys: readonly Candidate[], hasAccount: (c: Candidate) => boolean): Candidate[] {
  const marked = buys.map((c) => (c.kind === "buy" && hasAccount(c) ? { ...c, marks: c.marks.includes(H4_MARK) ? c.marks : [...c.marks, H4_MARK] } : c));
  return [...marked.filter((c) => c.marks.includes(H4_MARK)), ...marked.filter((c) => !c.marks.includes(H4_MARK))];
}

// ---- H5: N equal positions, rotated, judged on the total value ---------------------------------------------------------------------------------------------------------------------

/**
 * The floor of H5 is registered at zero: the owner asked to test entering the best available without a bar. It is a parameter of the round like N, and changing it after the data are seen voids the round. N has NO
 * default on purpose: how many positions to hold is the owner's choice, registered per round, and nothing in this code or in ADENDO-G recommends a value.
 */
export const H5_DEFAULTS = { floor: 0 } as const;

/**
 * What occupies a slot, registered before any data: every token position of the AGENT wallet that is not cash, not the native coin (that is the reserve) and has a known value above zero: the same population the
 * cycle offers to the Jev as holdings (an unpriced token is not managed and takes no slot; there is no dust threshold, the owner's decision of 2026-10-14). B starts from A's portfolio, so inherited positions occupy
 * their slots from the first look and keep them until they exit by the rules of A. B NEVER sells to get down to N and never rebalances: a position that doubles stays oversized. Pure.
 */
export function slotKeysOf(positions: readonly Position[]): Set<string> {
  const keys = new Set<string>();
  for (const p of positions) if (p.wallet === "agente" && !p.isCash && p.address !== "native" && typeof p.usd === "number" && Number.isFinite(p.usd) && p.usd > 0) keys.add(planKey(p.chainIndex, p.address));
  return keys;
}

export interface EqualSlotsInput {
  /** The total value managed, in dollars. */
  readonly totalUsd: number;
  /**
   * What is kept out of the allocation, in dollars: ONLY the fixed native-coin reserve (US$ 5 in the settings of 2026-10-15). The `reserveShare` of A (0.1) is NOT applied to the slots of B; that is a registered
   * parameter of the round together with N, and the physical limits of the executor still apply to every entry.
   */
  readonly reserveUsd: number;
  /** The cash the agent wallet can pay in right now, in dollars. Slots are filled in the order of preference until it runs out, and the rest stay cash. */
  readonly cashUsd: number;
  /** The number of positions, registered by the owner for the round. */
  readonly n: number;
  /** Plan keys of the tokens the portfolio already holds: a held token occupies a slot and is not bought again. */
  readonly heldKeys: ReadonlySet<string>;
  readonly candidates: readonly Candidate[];
  readonly verdicts: Readonly<Record<string, Verdict>> | undefined;
  readonly floor?: number;
  /** The target and stop profile of every entry: an owner parameter per round with NO default (see `TopNInput.profile`). Without it nothing is entered. */
  readonly profile?: string | null;
}

/**
 * The size of one slot and the purchases that fill the open ones. A slot is an equal share of what is managed less the reserve, cut down to the cent: the size comes from the rule the owner asked to test, not from a
 * choice of the Jev, which is a registered exception to the options the code normally offers (ADENDO-G, H5). The Jev still decides WHICH tokens, by its preference (the highest probability it gave to an option that
 * buys, `preferenceOf`), and when to leave. A purchase the code left closed, a token already held and a purchase whose preference is unknown take no slot. An N that is not a positive whole number gives no size and no
 * entry. The physical limits of the executor (impact, minimum representable amount, fee balance) still apply to each entry when it is simulated, and a slot that cannot be filled stays cash. Pure.
 */
export function equalSlotEntries(input: EqualSlotsInput): { readonly targetUsd: number | null; readonly entries: readonly string[]; readonly open: number; readonly affordable: number; readonly profile: string | null } {
  const { n } = input;
  const profile = typeof input.profile === "string" && input.profile !== "" ? input.profile : null;
  const usable = input.totalUsd - input.reserveUsd;
  const targetUsd = Number.isFinite(usable) && usable > 0 && Number.isInteger(n) && n >= 1 ? Math.floor((usable / n) * 100) / 100 : null;
  if (targetUsd === null || !(targetUsd > 0)) return { targetUsd: null, entries: [], open: 0, affordable: 0, profile };
  const open = Math.max(0, n - input.heldKeys.size);
  const affordable = Number.isFinite(input.cashUsd) && input.cashUsd > 0 ? Math.floor(input.cashUsd / targetUsd) : 0;
  if (profile === null) return { targetUsd, entries: [], open, affordable, profile };
  const floor = input.floor ?? H5_DEFAULTS.floor;
  const ranked = input.candidates
    .filter((c) => c.kind === "buy" && c.stances.some((s) => s.startsWith("buy")) && c.profiles.includes(profile) && !input.heldKeys.has(planKey(c.chainIndex, c.address)))
    .map((c) => ({ c, p: preferenceOf(input.verdicts?.[c.id]) }))
    .filter((r): r is { c: Candidate; p: number } => r.p !== null && r.p >= floor)
    .sort((a, b) => b.p - a.p || (a.c.id < b.c.id ? -1 : 1))
    .slice(0, Math.min(open, affordable));
  return { targetUsd, entries: ranked.map((r) => r.c.id), open, affordable, profile };
}

// ---- H6: joint allocation chosen by the Jev (ADENDO-H, section 3) ------------------------------------------------------------------------------------------------------------------

/**
 * The fixed codes the Jev may give for cash it leaves unallocated: what it STATES, not a cause the records prove. The code that really stops an allocation (a quote that does not fit the size, a missing balance, the provider,
 * the execution) is a fact of the cycle and is recorded by it, never by the Jev. A free text is never a code.
 */
export const H6_CASH_REASONS = ["sem_candidato_que_valha", "custo_de_entrada_alto", "dado_insuficiente", "aguardando_evento", "risco_da_carteira", "outro"] as const;
export type CashReason = (typeof H6_CASH_REASONS)[number];
export const isCashReason = (v: unknown): v is CashReason => typeof v === "string" && (H6_CASH_REASONS as readonly string[]).includes(v);

/**
 * The wording of the variant, in the vocabulary of the Choice contract (the options stay the stances the code offers). It frames the decision on the whole portfolio and on what idle cash costs; it never says to buy and
 * never gives a number of positions, a size or a bar: quantity, sizes and allocation are the Jev's (ADENDO-H, section 1). Versioned by this registration: a change after the data are seen voids the round.
 */
export const H6_FRAME = {
  goal: "Decide for the whole portfolio, not for one candidate alone: for each holding and each purchase, weigh what it adds to or takes from the whole portfolio, the cost of getting in and out at that size, and the cost of leaving cash idle, because idle cash earns nothing. Choose among the options offered and skip what does not earn its place.",
  cashQuestion: "If part of the cash stays unallocated after your choices, say why with one of the codes offered.",
} as const;

export interface PortfolioView {
  /** Cash in dollar coins plus the token positions of the agent wallet, in dollars; the native coin (the fee reserve) is apart and the other wallet is not tradable here. */
  readonly totalUsd: number;
  readonly cashUsd: number;
  readonly nativeUsd: number;
  readonly cashSharePct: number | null;
  readonly positions: readonly { readonly key: string; readonly usd: number; readonly sharePct: number }[];
  /** Concentration over the cash and each position, as the measurement of the 24 hours counts it (a portfolio of 90 percent cash and one position of 10 is 0.82); null when empty. */
  readonly hhi: number | null;
  /** Per network: the cash, what pending orders already committed, and what is left to allocate. */
  readonly byChain: Readonly<Record<string, { readonly cashUsd: number; readonly committedUsd: number; readonly availableUsd: number }>>;
  /** What is not known stays unknown: nothing measures how these positions move together, so this is always null and never a made-up diversification. */
  readonly correlation: null;
}

const usdOf = (p: Position): number => (typeof p.usd === "number" && Number.isFinite(p.usd) && p.usd > 0 ? p.usd : 0);

/** The portfolio as the variant's Brief would show it: exposure by asset, free, committed and available cash by network, with the unknown left unknown. Pure. */
export function portfolioView(input: { readonly positions: readonly Position[]; readonly pendingUsd?: Readonly<Record<string, number>> }): PortfolioView {
  const mine = input.positions.filter((p) => p.wallet === "agente");
  const nativeUsd = mine.filter((p) => p.address === "native").reduce((s, p) => s + usdOf(p), 0);
  const cash = mine.filter((p) => p.isCash && p.address !== "native");
  const tokens = mine.filter((p) => !p.isCash && p.address !== "native" && usdOf(p) > 0);
  const cashUsd = cash.reduce((s, p) => s + usdOf(p), 0);
  const totalUsd = cashUsd + tokens.reduce((s, p) => s + usdOf(p), 0);
  const share = (usd: number): number => Math.round((usd / totalUsd) * 1000) / 10;
  const byChain: Record<string, { cashUsd: number; committedUsd: number; availableUsd: number }> = {};
  for (const p of cash) {
    const prev = byChain[p.chainIndex]?.cashUsd ?? 0;
    const committed = input.pendingUsd?.[p.chainIndex] ?? 0;
    const cashOnChain = prev + usdOf(p);
    byChain[p.chainIndex] = { cashUsd: cashOnChain, committedUsd: committed, availableUsd: Math.max(0, cashOnChain - committed) };
  }
  const positions = tokens.map((p) => ({ key: planKey(p.chainIndex, p.address), usd: usdOf(p), sharePct: totalUsd > 0 ? share(usdOf(p)) : 0 })).sort((a, b) => b.usd - a.usd);
  const hhi = totalUsd > 0 ? Math.round([cashUsd, ...tokens.map(usdOf)].reduce((s, usd) => s + (usd / totalUsd) ** 2, 0) * 100) / 100 : null;
  return { totalUsd, cashUsd, nativeUsd, cashSharePct: totalUsd > 0 ? share(cashUsd) : null, positions, hhi, byChain, correlation: null };
}
