/**
 * What the command centre screen draws. `HudModel` is built from the core's status and its analysis (model.ts) and holds only what the screen shows: every text that came from outside has been cleaned once, there, and every
 * number the core did not know is null. The analysis part is optional: an older core has none, and the screen then says so instead of drawing empty charts.
 */

export interface WindowStats {
 readonly n: number;
 readonly up: number;
 readonly mean: number | null;
 readonly vals: readonly number[];
}
export type GroupStats = Readonly<{ "15m": WindowStats; "1h": WindowStats }>;

/** The study of the decisions as `GET /agent/analysis` gives it (src/agent/analysis.ts); checked by `parseAnalysis`. */
export interface Analysis {
 readonly atMs: number;
 readonly funnel: { readonly consults: number; readonly items: number; readonly closed: number; readonly open: number; readonly asked: number; readonly applied: number; readonly executed: number; readonly failed: number };
 readonly asks: readonly { readonly t: number; readonly s: string | null; readonly p: number; readonly ok: boolean }[];
 readonly hist: { readonly all: readonly number[]; readonly fresh: readonly number[] };
 readonly timeline: readonly { readonly t: number; readonly open: number; readonly asked: number; readonly applied: number }[];
 readonly trips: readonly { readonly s: string; readonly in: number; readonly out: number; readonly pct: number; readonly buyAt: number; readonly sellAt: number }[];
 readonly fees: { readonly lamports: number; readonly fills: number; readonly unmatchedSells: number };
 readonly placar: { readonly skipped: GroupStats; readonly closed: GroupStats; readonly gated: GroupStats };
 readonly recent: readonly { readonly t: number; readonly s: string | null; readonly kind: string; readonly m15: number | null; readonly m1h: number | null }[];
 readonly orders: { readonly outcomes: Readonly<Record<string, number>>; readonly reasons: Readonly<Record<string, number>>; readonly spentToday: { readonly buy: number; readonly sell: number } };
 readonly runtime: { readonly tokensToday: number | null; readonly riskPct: number | null };
 readonly cycleReviews?: readonly CycleReview[];
 readonly cycleReviewPage?: CycleReviewPage;
}
export interface CycleReviewPage {
 readonly page: number;
 readonly pageSize: number;
 readonly total: number;
 readonly totalPages: number;
}
export type CycleReviewFindingCode = "input_unknown" | "data_stale" | "stance_diverged" | "estimated_cost_unknown" | "realized_fee_unknown" | "order_uncertain" | "outcome_unmeasured";
export type CycleReviewEvidenceValue = string | number | boolean | null | readonly (string | number | boolean | null)[] | Readonly<Record<string, string | number | boolean | null>>;
export interface CycleReviewFinding {
 readonly code: CycleReviewFindingCode;
 readonly source: "brief" | "context" | "order" | "fill" | "scoreboard";
 readonly candidateId: string | null;
 readonly decision: "action" | "inaction" | null;
 readonly orderKey: string | null;
 readonly window: string | null;
 readonly fields: readonly string[];
}
export interface CycleReviewFreshness {
 readonly status: "age_observed" | "data_stale" | "unknown";
 readonly source: string | null;
 readonly ageMin: number | null;
}
export interface CycleReviewWindow {
 readonly window: "15m" | "1h" | "4h" | "24h";
 readonly status: "pending" | "measured" | "unknown" | "unmeasured";
 readonly settledAtMs: number | null;
 readonly priceUsd: number | null;
 readonly movePct: number | null;
 readonly reason: string | null;
}
export interface CycleReviewDecision {
 readonly key: string;
 readonly orderKey: string;
 readonly side: "buy" | "sell";
 readonly stance: string | null;
 readonly atMs: number;
 readonly entryPriceUsd: number | null;
 readonly estimatedCostUsd: number | null;
}
export interface CycleReviewItem {
 readonly candidateId: string;
 readonly kind: "holding" | "buy";
 readonly frozen: { readonly steps: readonly string[] | null; readonly marks: readonly string[]; readonly families: readonly string[]; readonly triggers: readonly string[]; readonly evidence: Readonly<Record<string, CycleReviewEvidenceValue>> | null };
 readonly requested: string | null;
 readonly applied: string | null;
 readonly gate: { readonly asked: string; readonly applied: string; readonly conviction: number | null; readonly bar: number | null; readonly reason: string | null } | null;
 readonly freshness: CycleReviewFreshness;
 readonly decision: { readonly action: CycleReviewDecision | null; readonly inaction: CycleReviewDecision | null };
 readonly order: { readonly orderKey: string; readonly stage: string; readonly reason: string | null; readonly side: "buy" | "sell"; readonly stance: string | null; readonly atMs: number } | null;
 readonly results: {
  readonly postDecisionOnly: true;
  readonly fills: readonly { readonly orderKey: string; readonly atMs: number; readonly atSource: "chain" | "ledger" | null; readonly side: "buy" | "sell"; readonly walletFeeLamports: string | null }[];
  readonly fillsTruncated: boolean;
  readonly action: readonly CycleReviewWindow[];
  readonly inaction: readonly CycleReviewWindow[];
 };
 readonly findings: readonly CycleReviewFinding[];
}
export interface CycleReview {
 readonly cycleId: string;
 readonly atMs: number;
 readonly frozen: { readonly briefHash: string | null; readonly context: Readonly<Record<string, string | number | null>> | null; readonly history: Readonly<Record<string, Readonly<Record<string, number | null>>>> | null };
 readonly freshness: CycleReviewFreshness;
 readonly items: readonly CycleReviewItem[];
 readonly itemsTruncated: boolean;
 readonly findings: readonly CycleReviewFinding[];
}


export interface HudCandidate {
 readonly s: string;
 /** The largest preference for buying the model gave (any size), 0 to 1; null when it sent none. */
 readonly pbuy: number | null;
 /** Closed by the code before the model could choose. */
 readonly closed: boolean;
 readonly facets: Readonly<Record<string, number>>;
 readonly marks: readonly string[];
 /** What the model preferred (its most likely option), and what the cycle did with it. */
 readonly requested: string | null;
 readonly applied: string | null;
 /** Set when the Jev chose this purchase and the CODE did not turn it into an order (the core's `dropped`): the request was made and nothing was carried out. */
 readonly blocked: HudBlock | null;
}

/** Why the code did not carry out something the Jev chose: the core's own code (cleaned) and a short wording in capital letters without accents. */
export interface HudBlock {
 readonly code: string;
 readonly text: string;
}

/** One thing the Jev chose (a purchase or a sale) that the code dropped before it became an order, with the symbol it belongs to. */
export interface HudDropped extends HudBlock {
 readonly s: string;
 readonly side: "buy" | "sell";
}

/**
 * How long nothing went out. `exact` is true when the core's own record of each past cycle says the same request was dropped each time: `cycles` is then the number of consecutive cycles in which it was. When the record
 * of past cycles does not carry what was dropped, `exact` is false and `cycles` only counts the consecutive latest cycles that decided and sent no order (which includes the ones where the Jev chose to wait).
 */
export interface HudStreak {
 readonly cycles: number;
 readonly exact: boolean;
}

export interface HudPosition {
 readonly s: string;
 readonly usd: number | null;
 readonly share: number | null;
 readonly cash: boolean;
 readonly plan: { readonly profile: string; readonly sinceEntryPct: number | null; readonly toTargetPct: number | null; readonly toStopPct: number | null; readonly hoursHeld: number; readonly hoursLeft: number } | null;
}

export interface HudEvent {
 readonly t: number;
 readonly side: "buy" | "sell";
 readonly s: string;
 readonly usd: number;
 readonly stage: "executada" | "falhou" | "incerta";
 readonly src: string;
 readonly reason: string | null;
}

/** What the screen can ask of the core. The buttons of the Sistema tab raise these; the page that owns the connection carries them out. */
export type HudAction =
 | { readonly kind: "stop" }
 | { readonly kind: "resolve"; readonly key: string; readonly outcome: "executada" | "falhou" }
 | { readonly kind: "wallet"; readonly step: "install" | "login" }
 | { readonly kind: "open"; readonly url: string }
 | { readonly kind: "settings" };

/** What is going on around the screen: an action, the last answer, stop confirmation, and whether the latest status request failed while retaining its snapshot. */
export interface HudUi {
 readonly busy: "stop" | "resolve" | "wallet" | null;
 readonly notice: { readonly tone: "ok" | "bad"; readonly text: string } | null;
 readonly confirmStop: boolean;
 readonly walletPollFailed: boolean;
}
export const IDLE_UI: HudUi = { busy: null, notice: null, confirmStop: false, walletPollFailed: false };

export type WalletStepId = "instalar" | "entrar" | "depositar" | "definir_politica" | "operando";

/** An order the core sent and has no answer for. `needsWord` is true only when no transaction was ever seen (only the person can look): the others the core confirms by itself. */
export interface HudInFlight {
 readonly key: string;
 readonly symbol: string;
 readonly side: "buy" | "sell";
 readonly usd: number;
 readonly ageMin: number;
 readonly stage: "enviando" | "incerta";
 readonly needsWord: boolean;
 readonly source: "modelo" | "protecao";
 /** What the OKX program said when it refused without proving anything, cleaned, or null. */
 readonly said: string | null;
}

/** One line of what the agent did and what happened to it: a cycle, an order at one of its stages, the person's own connect and disconnect. */
export interface HudLogLine {
 readonly t: number;
 readonly text: string;
 readonly tone: "ok" | "warn" | "info";
}

/** What the code still refuses after the quote of an order, as the core says it (a choice of the code, not of the owner, under review): every number is the core's. Null when the core does not send it. */
export interface HudGuards {
 readonly impactPct: { readonly buy: number; readonly sell: number; readonly protecao: number };
 readonly taxPct: number;
 readonly slippagePct: { readonly buy: number; readonly sell: number; readonly protecao: number };
 /** A purchase accepts at most this share of the stop of its profile as price impact (0.33 is a third). */
 readonly buyCostShareOfStop: number;
 readonly nativeReserve: { readonly kind: "fixa" | "taxa_medida"; readonly usd: number | null };
}

export type HudTier = "free" | "basic" | "premium";

/** One counter of the data provider's quota: what this machine sent (local) or what the account says (account). Unknown is null, never zero. */
export interface HudMeter {
 readonly status: "valid" | "unreported" | "corrupt" | "unreadable" | "month_mismatch" | "invalid";
 readonly capEvidence: "local_configuration" | "provider_reported" | "unknown";
 readonly used: number | null;
 readonly monthlyCap: number | null;
 readonly remaining: number | null;
 /** How long ago it was observed, advanced by the screen's own clock (never taken from a cache); null when it never was. */
 readonly ageMs: number | null;
}

/** The quota of the data provider by tier, as the core projects it. Null in the model when the core does not send it. */
export interface HudResources {
 readonly monthKey: string;
 readonly days: number;
 readonly rate: { readonly requestsPerSecond: number | null; readonly tokensPerSecond: number | null };
 readonly tiers: Readonly<Record<HudTier, { readonly local: HudMeter; readonly account: HudMeter }>>;
}

export interface HudSystem {
 readonly wallet: {
  readonly next: WalletStepId;
  readonly cli: "ausente" | "instalado";
  readonly login: string;
  /** An https address on the OKX's own page where the person signs in; null when the core has none. */
  readonly loginUrl: string | null;
  readonly policy: string;
  readonly sessionDays: number | null;
  readonly evm: string | null;
  readonly solana: string | null;
 };
 readonly inFlight: readonly HudInFlight[];
 /** The newest records of the agent, the newest first. */
 readonly log: readonly HudLogLine[];
 /** The mode the core is in and what it is allowed to do (the words the core gave, cleaned). */
 readonly mode: string;
 readonly authority: string;
 readonly profile: string;
}

export interface HudModel {
 readonly snapshotAtMs: number;
 /** False when the core has no analysis route (an older one) or it could not be read: the analysis panels say so. */
 readonly analysisOk: boolean;
 readonly agent: {
  readonly mode: string;
  readonly authority: string;
  readonly paused: boolean;
  readonly pauseReason: string | null;
  readonly profile: string;
  readonly model: string | null;
  /** The ceilings the core says are in force; a number is a ceiling, null is no ceiling, and the whole thing null is a core that did not say. */
  readonly caps: { readonly maxBuyUsd: number | null; readonly maxDailyBuyUsd: number | null; readonly maxDailySellUsd: number | null } | null;
  readonly riskPct: number | null;
  readonly reserveShare: number;
  /** The leverage the owner authorized and the instruments that exist to use it; null when the core does not say. */
  readonly leverage: { readonly granted: boolean; readonly instruments: number } | null;
  /** True when the core runs its cycles (the scheduler is started). False is an agent that is only being watched: connected, maybe, but nothing decides and no order leaves. */
  readonly cycling: boolean;
 };
 readonly wallet: {
  readonly total: number | null;
  /** Idle dollars of the cached reading; null when there is no successful book. */
  readonly cash: number | null;
  readonly lastReadMs: number | null;
  readonly observedAtMs: number | null;
  readonly positions: readonly HudPosition[];
  readonly unpriced: number;
  readonly readAtMs: number | null;
  readonly quality: "current" | "partial" | "stale" | "unavailable";
 };
 readonly equity: readonly { readonly t: number; readonly v: number }[];
 readonly rhythm: { readonly lastAtMs: number | null; readonly nextAtMs: number | null; readonly intervalMin: number };
 readonly budget: { readonly consults: number; readonly max: number; readonly tokens: number | null };
 readonly context: { readonly btc: number | null; readonly eth: number | null; readonly trend: string | null };
 readonly last: {
  readonly atMs: number | null;
  readonly posture: string | null;
  /** What the Jev chose in the last cycle and the code dropped before it became an order, each with the code's reason. */
  readonly dropped: readonly HudDropped[];
  /** Null when nothing was dropped in the last cycle (or the agent only watches: no order could have gone out). */
  readonly streak: HudStreak | null;
 };
 readonly candidates: readonly HudCandidate[];
 readonly events: readonly HudEvent[];
 readonly cycles: readonly { readonly t: number; readonly o: string; readonly p: number }[];
 readonly health: { readonly login: string; readonly sessionDays: number | null; readonly modelOk: boolean; readonly ledgerOk: boolean; readonly plansOk: boolean; readonly lock: boolean; readonly inFlight: number };
 readonly a: Analysis;
 readonly system: HudSystem;
 /** The code's own refusals after the quote of an order, or null from a core that does not say. */
 readonly guards: HudGuards | null;
 /** The quota of the data provider, or null from a core that does not send it. */
 readonly resources: HudResources | null;
 readonly ui: HudUi;
}
