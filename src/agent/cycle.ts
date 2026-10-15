/**
 * One step of the autonomous agent (AUT-2, AUT-4, AUT-9, AUT-10): gate, observe, the exits that the plans of the positions demand, candidates, budget, Jev's choice, validation, ledger BEFORE acting, the
 * action of the mode, and the measurement. Every step that cannot finish well ends in "manter" with a constant reason, except that the plan of a position (stop, trailing stop, time, half at the target) is
 * carried out by the code even when the model is not asked or cannot answer. The decision is written to the ledger before anything is sent; an order is marked `enviando` before the signing tool is called; an
 * uncertain result is never retried; the person's stop (file or mode) is read again before every order. Everything outside is injected, so the tests run with a fake model and a fake executor and the real
 * ones only exist when the person turns the agent on.
 */
import { createHash } from "node:crypto";
import type { EcoContext, EcoFacts, Saldo } from "../opportunity/ecosystem";
import type { Budget } from "./budget";
import { verifyBook } from "./book";
import { describeAnswer, type GateDetail } from "./conviction";
import type { QuoteFacts } from "./quote-facts";
import { runClosing, type ClosingCandidate, type ClosingDeps } from "./closing-phase";
import type { ClosingRecord } from "./closing";
import { RISK_PCT } from "./autopilot";
import { buyCandidates, holdingCandidates, minBuyUsd, openByRisk, priceOnlyFacts, saldoOf, withMomentum, withTiming } from "./candidates";
import type { MomentumFacts } from "./momentum";
import { planOrders, validateDecision } from "./decision";
import { applyCaps, gate, type AgentCaps, type LimitedFacts, splitToPolicy } from "./gate";
import { halfDone, halfProgress } from "./exit";
import { orderKey, type AgentLedger, type OrderRecord, type OrderStage } from "./ledger";
import type { Mandate } from "./mandate";
import type { ExecBrief } from "./fills";
import { agentBrief, physicalRequestsOf, type AgentBrief, type AgentModel, type FamilyHistory, type MarketContext, type ModelAnswer } from "./model";
import { offeredProfiles, planKey, PROFILES, type PlanStore, type ProfileId } from "./plans";
import { pendingBuys } from "./pending-buys";
import { holdingId, protect } from "./protection";
import type { Scoreboard } from "./scoreboard";
import type { RunState } from "./state";
import type { TimingFacts } from "./timing";
import { AGENT_BUY_SIZES } from "./sizing-agent";
import type { Book, Candidate, Decision, HoldingFacts, Mode, PlannedOrder, Position, Posture } from "./types";

export type ExecResult =
  | { readonly status: "executada"; readonly ref: string; /** The price the order was filled at, when the signing tool reports it. */ readonly priceUsd?: number; /** What the order cost in dollars (fee and price impact), when the quote said both. */ readonly costUsd?: number }
  /** The transaction was broadcast and the tool printed its hash, but nobody has seen it settle (the tool does not wait for the swap's receipt): held in flight with the hash until a receipt says SUCCESS (executed) or ERROR and CANCELLED (failed). */
  | { readonly status: "transmitida"; readonly ref: string; /** What the order cost in dollars (fee and price impact), when the quote said both. */ readonly costUsd?: number }
  | { readonly status: "falhou"; readonly reason: string; /** What the tool said, cut and plain, when it refused with proof that nothing was sent. */ readonly detail?: string }
  | { readonly status: "incerta"; readonly reason: string; /** A reference to the transaction the answer carried, when it carried one: it lets the order be looked up. */ readonly ref?: string; /** What the tool said, cut and plain, when it refused without proving anything. */ readonly detail?: string };

/** The signing tool, behind a port: the only thing in the agent that can move money. Phase 1 puts the OKX CLI adapter here; until then there is none and the money mode cannot run. */
export interface Executor {
  execute(order: PlannedOrder, context: { readonly cycleId: string; readonly orderKey: string; readonly signal: AbortSignal; /** True once the person has stopped or lowered the mode: read again between the quote and the swap. */ readonly shouldStop?: () => boolean }): Promise<ExecResult>;
}

/** What one consultation of the model looked like, for the study of the decisions: no balance in dollars, no address, only what the model itself was given (percentages and codes). */
/** How long the whole closing phase may take in a cycle, whatever its steps are allowed. */
const CLOSING_PHASE_MS = 20_000;

/** The real clocks and the full hash of the Brief of one primary consultation, apart from its record (see `onConsult`). */
export interface ConsultMeta {
  readonly factAvailableAtMs: number;
  readonly askedAtMs: number;
  readonly answeredAtMs: number;
  /** SHA-256 of the exact Brief the model read (the record keeps the first 16 characters). */
  readonly briefHash: string;
  /** The model asked for, by name. */
  readonly model: string;
}

export interface ConsultRecord {
  readonly cycleId: string;
  readonly atMs: number;
  readonly mode: Mode;
  readonly briefBytes: number;
  readonly candidates: readonly { readonly id: string; readonly kind: "holding" | "buy"; readonly stances: readonly string[]; readonly marks: readonly string[]; readonly families: readonly string[]; readonly triggers: readonly string[]; readonly cap?: { readonly maxUsd: number; readonly binding: string; readonly sharePct: number | null; readonly riskPct?: number | null; readonly tightest?: string; readonly tightestUsd?: number } }[];
  /** The Brief entries the model read, whole (holdings, purchases and the split of the portfolio): percentages and codes only, so a decision can be rebuilt and its facts joined to what the price did later. */
  readonly brief: { readonly carteira: AgentBrief["carteira"]; readonly chaves: AgentBrief["chaves"]; readonly posicoes: AgentBrief["posicoes"]; readonly compras: AgentBrief["compras"]; readonly execucoes?: AgentBrief["execucoes"]; readonly mandato: AgentBrief["mandato"] };
  /** The version of the Brief's own layout: 1. The optional key `execucoes` (the real fills) is kept in `brief` when the model read it, in the place the hash saw it (after `historico`, before `mandato`). */
  readonly briefVersion: number;
  /** How many requests really went to the provider for this consultation: 2 when one was refused for its shape and asked again without the facets. */
  readonly physicalRequests: number;
  /** Which wording of the stance questions was in force (the description of a purchase size follows its rank among the sizes on offer), and which legend (every short key scoped to holdings or purchases): for comparing the answers before and after. */
  readonly criteria: string;
  readonly legend: string;
  /** The constant codes the rules left on the answer (the conviction took a purchase down or refused it, a sale moved to the median step). */
  readonly notes: readonly string[];
  /** Whether the answer became a valid decision, and when it did not, the reason: the record never has to guess why nothing was done. */
  readonly valid: boolean;
  readonly invalidReason: string | null;
  /** A short hash of the whole Brief the model read, to tell two consultations of the same facts from two of different ones. */
  readonly briefHash: string;
  /** What the model ASKED for per candidate, before the rules of the code (conviction, the median of a sale) touched it; `stances` is what was done. */
  readonly requested: Readonly<Record<string, string>>;
  /** The facets (narrow yes or no judgments) the model answered, by candidate id: recorded, read by nothing that decides. */
  readonly facets: Readonly<Record<string, Readonly<Record<string, number>>>>;
  readonly historico: unknown;
  readonly contexto: unknown;
  /** What the gate did to each purchase the model asked for: the size asked, the one carried on, the RAW conviction (six places) and the bar it was held against, and why a size changed. Absent when no purchase was asked for. */
  readonly gates?: Readonly<Record<string, GateDetail>>;
  /** How sure the model was: its probabilities per option for each candidate, rounded to two places; empty when the provider sent none. */
  readonly verdicts: Readonly<Record<string, Readonly<Record<string, number>>>>;
  readonly posture: string;
  /** How sure the model was of the posture, per option, rounded; absent when the provider sent none. */
  readonly postureProbs?: Readonly<Record<string, number>>;
  readonly stances: Readonly<Record<string, string>>;
  readonly profiles: Readonly<Record<string, string>>;
}

export interface CycleDeps {
  readonly state: RunState;
  readonly ledger: AgentLedger;
  readonly budget: Budget;
  readonly scoreboard: Scoreboard;
  readonly plans: PlanStore;
  /** Null when the model key is not configured. A function is resolved at each cycle, because the key can be saved later in Settings. */
  readonly model: AgentModel | null | (() => AgentModel | null);
  readonly executor: Executor | null;
  readonly now: () => number;
  readonly newId: () => string;
  readonly stopFilePresent: () => boolean;
  /** A reason this process must not run cycles (another process holds the agent's folder); null when it may. */
  readonly canRun?: () => string | null;
  /** The price of a token right now (a fresh read), the reference of a plan and of the Placar. Optional: without it the scan's price is used. */
  readonly freshPrice?: (chainIndex: string, address: string, signal: AbortSignal) => Promise<number | null>;
  /** Our clock minus the exchange's, in ms; null when unknown. */
  readonly clockSkewMs: () => number | null;
  /** The wallets, read only. Null when they could not be read. */
  readonly readBook: (signal: AbortSignal) => Promise<Book | null>;
  readonly holdingFacts: (book: Book, signal: AbortSignal) => Promise<(position: Position) => HoldingFacts | null>;
  /** Called with the verified view of the wallets once it is known, so the screen and the executor see the same numbers the decision used. */
  readonly onBook?: (book: Book) => void;
  /** The highest price of a held token since the last look, when known (so a spike between two cycles is not missed). */
  readonly holdingHigh?: (position: Position) => number | null;
  readonly ecosystem: (saldo: Saldo | null, signal: AbortSignal) => Promise<EcoContext>;
  /** The hourly history of a candidate, for the quality of the entry. Null when it could not be read. */
  readonly timingOf: (facts: EcoFacts, signal: AbortSignal) => Promise<TimingFacts | null>;
  /** What a token is doing in the last hour in five-minute bars (momentum.ts). Not given: the cycle does without it. */
  readonly momentumOf?: (facts: EcoFacts, signal: AbortSignal) => Promise<MomentumFacts | null>;
  readonly context: () => MarketContext | null;
  readonly history: () => FamilyHistory | null;
  /**
   * The closing of the purchases the first answer leaned to (closing-phase.ts), in SHADOW: the entry is quoted (read only) and the model asked one closed question, inside the same budget, and what it would say is recorded; no stance
   * and no order is ever changed by it. Absent: off.
   */
  readonly closing?: {
    readonly quoter: ClosingDeps["quoter"];
    readonly record: (record: ClosingRecord) => void;
    readonly maxPerCycle: number;
    readonly timeouts: ClosingDeps["timeouts"];
    /** The whole phase is cut at this many milliseconds whatever the steps ask for (default 20 s): an extra look can cost its own measurement, never the order that waits behind it. */
    readonly phaseMs?: number;
    /** How many primary looks are still due today; the closing spends only what is left after them (closing-phase.ts). */
    readonly reserveForPrimaries?: () => number;
  };
  /** The allowlisted facts of the quote an order was made under, by order key (the executor hands them over as it reads the quote); null when none was read. Written on the order record from the executor's answer on. */
  readonly quoteOf?: (orderKey: string) => QuoteFacts | null;
  /** The real round trips of the agent (fills.ts), for the Brief; absent or null when there are none. */
  readonly execFacts?: () => ExecBrief | null;
  /** The share of the portfolio the person accepts to lose in one operation; null for the default. */
  readonly riskPct: () => number | null;
  /** The owner's bold profile is in force: a purchase is let through on a lean of the model, by rank of the size on offer (conviction.ts). Absent or false: the plain bars. */
  readonly boldConviction?: () => boolean;
  /** The cash never spent, as a share of the portfolio (the mandate's); null for the default. */
  readonly reserveShare?: () => number | null;
  /** The agent's own circuit breaker is open: no new purchase is offered to the model, and the exits, the stops and the management of what is held go on. */
  readonly buyingPaused?: () => boolean;
  /** Called once per consultation with what the model was shown (the candidates, with what was on offer and the marks of care) and what it answered: for whoever studies how the decisions can be improved. Never given a balance or an address. */
  /** Called with the record of each primary consultation and, apart from it, the real clocks and the full hash of the Brief (ADENDO-D, V2-4): what lets the study of the agent bind a decision to the moment it was asked and answered. */
  readonly onConsult?: (entry: ConsultRecord, meta?: ConsultMeta) => void;
  /** The last network fee quoted on a network (fees.ts), for the Brief: what a swap costs there. Absent: the Brief carries none. */
  readonly feeOf?: (chainIndex: string) => { readonly usd: number; readonly ageMin: number | null } | null;
  /** The book the guard read, raw: it gives the signing side the dollar coin to settle in when no full cycle has published a book yet (right after a start). Not shown anywhere. */
  readonly onGuardBook?: (book: Book) => void;
  /** Settles the orders in flight by what the wallet shows (reconcile.ts); the number settled. Called with every reading of the wallet, before the cycle looks at what is in flight. */
  readonly reconcile?: (book: Book) => number;
  /** Whether the owner's policy in the portal is a condition of the money mode. Not given: it is (the safe default). */
  readonly requireOwnerPolicy?: () => boolean;
  /** The mandate in force and whether the measurement has earned the aggressive stance, for the Brief. */
  readonly mandate?: () => { readonly mandate: Mandate; readonly aggressiveOpen: boolean } | null;
  /** What the model asked for as the mandate: the store moves one step toward it. */
  readonly onMandate?: (wanted: Mandate) => void;
  readonly caps: AgentCaps;
  readonly limitedFacts: () => Promise<LimitedFacts | null>;
  /** The smallest purchase worth making on a network (gas). Defaults to the table of the candidates module. */
  readonly minBuyUsd?: (chainIndex: string) => number;
  /** The same Brief is not asked again within this time. */
  readonly refreshMs: number;
  readonly timeouts: { readonly modelMs: number; readonly readMs: number; readonly orderMs: number; /** Soft deadline of the facts of the positions; defaults to readMs. */ readonly factsMs?: number; /** How long past the soft deadline a reader may take to hand back what it has. Default 15 s. */ readonly graceMs?: number };
}

export interface OrderOutcome {
  readonly order: PlannedOrder;
  readonly stage: OrderStage;
  readonly ref: string | null;
  readonly reason: string | null;
  /** What the tool said when it refused without proving anything: cut and plain; only on an unsettled order. */
  readonly detail?: string | null;
}

/** One candidate the agent looked at this cycle, for the screen: what it is, what the model chose, and the codes that explain the case. No amount, no address of a wallet. */
export interface CandidateView {
  readonly id: string;
  readonly kind: "holding" | "buy";
  readonly symbol: string;
  readonly chainIndex: string;
  /** What the model chose for it; null when the model was not asked. */
  readonly stance: string | null;
  readonly families: readonly string[];
  readonly marks: readonly string[];
  /** A purchase whose only option the CODE left was `skip`: why (`abaixo_do_minimo` when the cash of its network is there but even the smallest size is under the minimum order of the network, or `sem_tamanho` when that network has no cash at all); no mark closes a purchase any more, the marks are facts the model reads. Null for anything the model could really choose. */
  readonly closed: string | null;
  /** How sure the model was of each option it was offered, in two places; null when the model did not send them (never invented). */
  readonly probs: Readonly<Record<string, number>> | null;
  /** What the model said to each narrow yes or no judgment about the candidate (facets.ts), in two places; null when it sent none. */
  readonly facets: Readonly<Record<string, number>> | null;
}

export interface CycleReport {
  readonly cycleId: string;
  readonly atMs: number;
  readonly durationMs: number;
  readonly mode: Mode;
  readonly outcome: "mantido" | "decidido" | "bloqueado" | "erro";
  /** A constant code, never a message with a value in it. */
  readonly reason: string | null;
  readonly consulted: boolean;
  readonly modelo: string | null;
  readonly usage: { readonly inputTokens: number | null; readonly outputTokens: number | null } | null;
  readonly posture: Posture | null;
  readonly stances: Readonly<Record<string, string>>;
  readonly profiles: Readonly<Record<string, string>>;
  readonly orders: readonly OrderOutcome[];
  readonly dropped: readonly { readonly candidateId: string; readonly reason: string }[];
  readonly considered: { readonly holdings: number; readonly buys: number; readonly protected: number };
  /** What the agent looked at this cycle and what the model chose for each, for the screen. */
  readonly view?: readonly CandidateView[];
  /** Non-fatal things worth showing: a measurement that could not be saved, a source that was down. */
  readonly notes: readonly string[];
  /** How many purchases each level of the mandate's risk would put on offer, as the model was shown them; absent when the cycle did not build a mandate. */
  readonly opened?: Readonly<Record<string, number>>;
}

export interface CycleRunner {
  run(): Promise<CycleReport>;
  /**
   * The watch over the positions between the looks of the model: a light pass that reads the wallet (and settles what it can of the orders in flight) and carries out what the PLANS demand (stop, trailing stop,
   * time, the half at the target), never asking the model, the ecosystem or the facts of the tokens, and never choosing anything of its own. It leaves no record when nothing is demanded, and it does nothing
   * when there is no plan to watch or the agent is only analysing.
   */
  guard?(): Promise<CycleReport>;
  last(): CycleReport | null;
  running(): boolean;
}

/** The identity of a holding as the reader of the market moment wants it: only the token's network and address count, everything else is unknown. */
function identityOf(c: Candidate): EcoFacts {
  return { candidateId: `token:${c.chainIndex}:${c.address}`, chainIndex: c.chainIndex, address: c.address, symbol: c.symbol, nota: null, priceUsd: null, changePct: null, volumeUsd: null, liquidityUsd: null, marketCapUsd: null, holders: null, buyShare: null, txs: null, top10Pct: null, devPct: null, bundlePct: null, riskLevel: null, riskFlags: [], wallets: null, walletsUsd: null, soldPct: null };
}

const RISK_LEVELS = ["cauteloso", "moderado", "agressivo"] as const;

/** Whether a level of risk ABOVE the one in force (the aggressive one counts only when the measurement has earned it) would put on offer more purchases than the one in force does. */
function mandateWouldOpenMore(opened: Readonly<Record<string, number>> | null, mandate: { readonly mandate: { readonly risk: string }; readonly aggressiveOpen: boolean } | null): boolean {
  if (opened === null || mandate === null) return false;
  const inForce = mandate.mandate.risk === "agressivo" && !mandate.aggressiveOpen ? "moderado" : mandate.mandate.risk;
  const at = RISK_LEVELS.indexOf(inForce as (typeof RISK_LEVELS)[number]);
  if (at < 0) return false;
  return RISK_LEVELS.slice(at + 1).some((level) => (level !== "agressivo" || mandate.aggressiveOpen) && (opened[level] ?? 0) > (opened[inForce] ?? 0));
}

/** How many purchases and how many holdings have the last hour read in five-minute bars in one cycle. */
const MOMENTUM_READS = 3;
/** How many purchases the model is shown: up to MAX_OPEN_BUYS the code left open, and closed ones only to fill, MAX_BUYS_SHOWN in all. */
const MAX_OPEN_BUYS = 5;
/** After a sale whose simulation failed before it was sent, the token is only kept for this long: the route is not working and asking again every cycle repeats the failure. */
const SELL_RETRY_BACKOFF_MS = 30 * 60_000;
/** How long after its confirmation a purchase still counts as spent while the wallet has not shown its token: the provider's balances can lag a transaction by minutes. */
const PENDING_SETTLE_MS = 15 * 60_000;
const MAX_BUYS_SHOWN = 7;
/** After the model sold part of a token, its partial sales are not offered again for this long. */
const TRIM_COOLDOWN_MS = 60 * 60_000;

class Deadline extends Error {}

async function withDeadline<T>(ms: number, run: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new Deadline("deadline"));
    }, ms);
  });
  try {
    return await Promise.race([run(controller.signal), timeout]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Like a deadline, but the work is asked to stop at `ms` and trusted to hand back what it has (a reader that warmed part of its cache returns that part). Only if it does not return within a grace period
 * after that does the step fail. A cold start reads dozens of positions through a rate-limited provider: all-or-nothing would throw the whole reading away every cycle and never warm up.
 */
async function withSoftDeadline<T>(ms: number, run: (signal: AbortSignal) => Promise<T>, graceMs = 15_000): Promise<T> {
  const controller = new AbortController();
  const soft = setTimeout(() => controller.abort(), ms);
  try {
    return await withDeadline(ms + graceMs, () => run(controller.signal));
  } finally {
    clearTimeout(soft);
  }
}

const hashOf = (value: unknown): string => createHash("sha256").update(JSON.stringify(value)).digest("hex");

type Mutable<T> = { -readonly [K in keyof T]: T[K] };
type OutcomeRow = Mutable<OrderOutcome> & { costUsd?: number | null };

type Asked =
  | { readonly ok: false; readonly reason: string; readonly extra: Partial<CycleReport> }
  | { readonly ok: true; readonly decision: Decision; readonly extra: Partial<CycleReport> };

/** The reasons a cycle that would trade can still run without trading: they are about the money side, not about reading and deciding. */
const MONEY_SIDE_REASONS: ReadonlySet<string> = new Set(["conta_ilegivel", "politica_ausente", "politica_frouxa", "sessao_expirando", "endereco_divergente", "binario_divergente", "planos_ilegiveis"]);

export function createCycleRunner(deps: CycleDeps): CycleRunner & { guard(): Promise<CycleReport> } {
  let busy = false;
  let lastReport: CycleReport | null = null;
  let lastConsult: { readonly hash: string; readonly atMs: number } | null = null;

  const emptyReport = (mode: Mode, reason: string, outcome: CycleReport["outcome"]): CycleReport => ({
    cycleId: "-",
    atMs: deps.now(),
    durationMs: 0,
    mode,
    outcome,
    reason,
    consulted: false,
    modelo: null,
    usage: null,
    posture: null,
    stances: {},
    profiles: {},
    orders: [],
    dropped: [],
    considered: { holdings: 0, buys: 0, protected: 0 },
    notes: [],
  });

  async function cycle(guardOnly = false): Promise<CycleReport> {
    const t0 = deps.now();
    const cycleId = deps.newId();
    const initial = deps.state.get();
    // what the agent may do with the money this cycle: it follows from what is ready (wire.ts), and it comes down to the shadow, never to blindness, when the money side is not ready
    let runMode: Mode = initial.mode;
    const notes: string[] = [];
    const base = { cycleId, atMs: t0 };
    const outcomes: OutcomeRow[] = [];
    const dropped: { candidateId: string; reason: string }[] = [];
    let decision: Decision | null = null;
    let answered: Partial<CycleReport> = {};
    let looked: readonly CandidateView[] = [];
    // how sure the model was and what its narrow judgments said, kept for the screen
    const shown: { verdicts: Record<string, Record<string, number>>; facets: Record<string, Record<string, number>> } = { verdicts: {}, facets: {} };
    let considered = { holdings: 0, buys: 0, protected: 0 };
    let openedNow: Record<string, number> | null = null;
    const report = (over: Partial<CycleReport> & Pick<CycleReport, "outcome">): CycleReport => ({
      ...base,
      mode: runMode,
      durationMs: Math.max(0, deps.now() - t0),
      reason: null,
      consulted: false,
      modelo: null,
      usage: null,
      posture: null,
      stances: {},
      profiles: {},
      orders: [],
      dropped: [],
      considered: { holdings: 0, buys: 0, protected: 0 },
      notes,
      view: looked,
      ...(openedNow === null ? {} : { opened: openedNow }),
      ...over,
    });
    /** A cycle that ended without orders is written to the ledger like any other; when even that fails the report still says so. The watch leaves no record of its own. */
    const finish = (r: CycleReport): CycleReport => {
      if (guardOnly) return r;
      try {
        deps.ledger.append({ kind: "cycle", cycleId, atMs: t0, mode: r.mode, outcome: r.outcome, reason: r.reason, posture: r.posture, stances: r.stances, planned: r.orders.length, dropped: r.dropped, modelo: r.modelo });
      } catch {
        notes.push("ledger_nao_gravou");
      }
      return r;
    };
    /** What the cycle did so far, whatever it was: the protective exits, the model's orders, both. */
    const result = (over: Partial<CycleReport>): CycleReport =>
      report({ outcome: "decidido", posture: decision?.posture ?? null, stances: decision?.stances ?? {}, profiles: decision?.profiles ?? {}, orders: outcomes, dropped, considered, ...answered, ...over });

    // off or stopped: nothing is read, asked or written
    if (initial.stopped || initial.mode === "desligado") return report({ outcome: "bloqueado", reason: initial.stopped ? "parado" : "desligado" });
    // the watch has nothing to do without a plan to watch or when the agent does not move money: it does not even read
    if (guardOnly && (initial.mode !== "limitado" || deps.plans.all().length === 0)) return report({ outcome: "mantido", reason: "sem_vigilancia" });
    // the person's STOP file and another process holding the agent's folder are read before anything else is read or asked
    if (deps.stopFilePresent()) return finish(report({ outcome: "bloqueado", reason: "arquivo_stop" }));
    const refused = deps.canRun?.() ?? null;
    if (refused !== null) return report({ outcome: "bloqueado", reason: refused });

    const book = await withDeadline(deps.timeouts.readMs, (signal) => deps.readBook(signal)).catch(() => null);
    const limited = runMode === "limitado" ? await deps.limitedFacts().catch(() => null) : null;
    const gateInputs = {
      stopFilePresent: deps.stopFilePresent(),
      clockSkewMs: deps.clockSkewMs(),
      bookAgeMs: book === null ? null : deps.now() - book.observedAtMs,
      ledger: deps.ledger.health(),
      plans: deps.plans.health(),
      requireOwnerPolicy: deps.requireOwnerPolicy?.() ?? true,
    };
    let verdict = gate({ ...gateInputs, state: { mode: runMode, stopped: initial.stopped }, limited });
    if (!verdict.ok && runMode === "limitado" && MONEY_SIDE_REASONS.has(verdict.reason)) {
      // the money side is not ready (the owner's policy, the session, the address, the tool): the agent goes on reading, deciding and measuring in the shadow instead of going blind, and says why it is not trading
      notes.push("execucao_bloqueada", verdict.reason);
      runMode = "sombra";
      verdict = gate({ ...gateInputs, state: { mode: runMode, stopped: initial.stopped }, limited: null });
    }
    if (!verdict.ok) return finish(report({ outcome: "bloqueado", reason: verdict.reason }));
    if (book === null) return finish(report({ outcome: "bloqueado", reason: "carteira_antiga" }));
    // the watch sends only what the plans demand, and only when the money side is ready: a cycle that fell to the shadow has nothing for it to do
    if (guardOnly && runMode !== "limitado") return report({ outcome: "mantido", reason: "sem_vigilancia" });
    if (guardOnly) deps.onGuardBook?.(book);

    const factsOf = guardOnly
      ? // the watch needs prices and nothing else: the one the balance came with is a price
        (p: Position): HoldingFacts | null => (p.priceUsd != null && Number.isFinite(p.priceUsd) && p.priceUsd > 0 ? priceOnlyFacts(p.priceUsd) : null)
      : await withSoftDeadline(deps.timeouts.factsMs ?? deps.timeouts.readMs, (signal) => deps.holdingFacts(book, signal), deps.timeouts.graceMs).catch(() => {
      notes.push("fatos_indisponiveis");
      // the stop of a position needs a price: when the read fails the price the balance came with is still a price
      return (p: Position): HoldingFacts | null => (p.priceUsd != null && Number.isFinite(p.priceUsd) && p.priceUsd > 0 ? priceOnlyFacts(p.priceUsd) : null);
    });
    const priceOf = (p: Position): number | null => factsOf(p)?.priceUsd ?? null;
    const positionOf = new Map(book.positions.map((p) => [holdingId(p), p]));
    // held = there is a balance, or the balance is unknown (the same rule as the orphan cleanup: a position we cannot see the size of is not a position that left)
    const heldKeys = new Set(book.positions.filter((p) => p.wallet === "agente" && !p.isCash && (p.balanceMinor === null || /[1-9]/.test(p.balanceMinor))).map((p) => planKey(p.chainIndex, p.address)));

    // a price is a claim: a token's value counts only if a pool could pay it (airdropped spam can claim any price). Everything below sees the verified view; the plans of positions the agent bought use the real one.
    // (the watch does not verify values against pools and does not publish the book: it only protects what is held)
    const verified = guardOnly ? { book, unverified: 0 } : verifyBook(book, factsOf);
    const view = verified.book;
    if (verified.unverified > 0) notes.push("tokens_nao_comprovados");
    if (!guardOnly) deps.onBook?.(view);

    // the plans of the positions the agent opened speak first: stop, trailing stop, time and the half at the target
    const protection = protect({ book, plans: deps.plans, priceOf, highOf: deps.holdingHigh ?? (() => null), nowMs: deps.now() });
    for (const n of protection.notes) if (!notes.includes(n)) notes.push(n);
    // the half at the target is a fixed AMOUNT (half of what the wallet held when the first part went out): a later look sells what is LEFT of it, never half of what is left, and once receipts confirmed all of it the plan says so
    const protectionOrders: PlannedOrder[] = [];
    for (const o of protection.orders) {
      const pk = planKey(o.chainIndex, o.address);
      const plan = deps.plans.get(pk);
      const progress = o.stance === "trim_half" && plan !== undefined ? halfProgress(deps.ledger.orderRecords(), pk, plan.entryAtMs) : null;
      if (progress === null) {
        protectionOrders.push(o);
        continue;
      }
      const left = progress.targetMinor - progress.soldMinor;
      if (left <= 0n) {
        deps.plans.markTrimmed(pk);
        continue;
      }
      const held = book.positions.find((p) => p.wallet === "agente" && !p.isCash && planKey(p.chainIndex, p.address) === pk);
      const balance = held?.balanceMinor != null && /^[1-9]\d*$/.test(held.balanceMinor) ? BigInt(held.balanceMinor) : null;
      if (held === undefined || balance === null) {
        protectionOrders.push(o);
        continue;
      }
      const amount = left < balance ? left : balance;
      const usd = held.usd !== null && Number.isFinite(held.usd) && held.usd > 0 ? Number((BigInt(Math.round(held.usd * 100)) * amount) / balance) / 100 : 0;
      protectionOrders.push({ ...o, amountMinor: amount.toString(), usd: Math.floor(usd) });
    }

    // an order whose answer never came is settled by what the wallet shows now: its token is free again, or the order is known to have gone out
    const settled = deps.reconcile?.(book) ?? 0;
    if (settled > 0) notes.push("ordens_conciliadas");
    // an order that stays in flight (what the wallet shows does not tell) must not stop the stops of OTHER tokens
    const inflightTokens = new Set(deps.ledger.inFlightRecords().map((r) => planKey(r.chainIndex, r.address)));
    // what purchases already sent have spent and the wallet does not show yet comes off the cash of the look (and their tokens are not offered as new ideas): the same dollars are never spent twice
    const pending = pendingBuys({ records: deps.ledger.orderRecords(), book: view, nowMs: deps.now(), settleWindowMs: PENDING_SETTLE_MS });
    if (Object.keys(pending.byChain).length > 0 && !notes.includes("compras_pendentes")) notes.push("compras_pendentes");
    const saldo = saldoOf(view, deps.riskPct(), deps.reserveShare?.() ?? null, pending.byChain);
    const exiting = new Set(protectionOrders.map((o) => planKey(o.chainIndex, o.address)));

    // what is read after the plans' exits (the ecosystem, the moment of each entry) is filled in below, once the exits are on their way
    const timings = new Map<string, TimingFacts | null>();
    let ecoById = new Map<string, EcoFacts>();
    let byCandidate = new Map<string, Candidate>();
    considered = { holdings: 0, buys: 0, protected: protection.handled.size };
    /** What the agent's wallet held of the token of this order when the cycle read it: what settles the order if its answer never comes. "0" when it held none; null when the balance was not read exactly. */
    const balanceBefore = (order: PlannedOrder): string | null => {
      const key = planKey(order.chainIndex, order.address);
      if (order.wallet !== "agente") return null;
      if ((book.flaggedKeys ?? []).includes(key)) return null;
      const held = book.positions.find((p) => p.wallet === "agente" && !p.isCash && planKey(p.chainIndex, p.address) === key);
      return held === undefined ? "0" : held.balanceMinor;
    };
    const record = (o: OutcomeRow): OrderRecord => ({
      kind: "order",
      cycleId,
      atMs: deps.now(),
      orderKey: orderKey(cycleId, o.order.candidateId),
      ...(o.stage === "preparada" || o.stage === "enviando" ? {} : quoteSpread(orderKey(cycleId, o.order.candidateId))),
      stage: o.stage,
      candidateId: o.order.candidateId,
      side: o.order.side,
      stance: o.order.stance,
      chainIndex: o.order.chainIndex,
      symbol: o.order.symbol,
      address: o.order.address,
      wallet: o.order.wallet,
      usd: o.order.usd,
      amountMinor: o.order.amountMinor,
      ref: o.ref,
      reason: o.reason,
      ...(o.detail === undefined || o.detail === null ? {} : { detail: o.detail }),
      profile: o.order.profile,
      source: o.order.source,
      balanceBeforeMinor: balanceBefore(o.order),
    });
    /** The facts of the quote, for a record written after the executor answered; nothing when none was read. */
    const quoteSpread = (key: string): { quote?: QuoteFacts } => {
      try {
        const facts = deps.quoteOf?.(key) ?? null;
        return facts === null ? {} : { quote: facts };
      } catch {
        return {};
      }
    };
    /** Appends one record; false when the ledger could not take it (the caller stops: it never acts on what it could not record). */
    const append = (o: OutcomeRow): boolean => {
      try {
        deps.ledger.append(record(o));
        return true;
      } catch {
        notes.push("ledger_nao_gravou");
        return false;
      }
    };
    /** The decision and the orders are on disk BEFORE anything is done with them. */
    const persist = (rows: readonly OutcomeRow[], reason: string | null): boolean => {
      try {
        deps.ledger.append({ kind: "cycle", cycleId, atMs: t0, mode: runMode, outcome: "decidido", reason, posture: decision?.posture ?? null, stances: decision?.stances ?? {}, planned: rows.length, dropped, modelo: answered.modelo ?? null });
        for (const o of rows) deps.ledger.append(record(o));
        return true;
      } catch {
        notes.push("ledger_nao_gravou");
        return false;
      }
    };

    /** The price at the decision: a fresh read of the token when there is one, else what the facts or the scan said; for a purchase, the last hourly close when the provider gave none. */
    const scanPriceOf = (order: PlannedOrder): number | null => {
      if (order.side === "sell") {
        const p = positionOf.get(order.candidateId);
        return p === undefined ? null : priceOf(p);
      }
      const facts = ecoById.get(order.candidateId);
      return facts?.priceUsd ?? timings.get(facts?.candidateId ?? "")?.lastClose ?? null;
    };
    const entryPriceOf = async (order: PlannedOrder): Promise<number | null> => {
      if (deps.freshPrice !== undefined && order.address !== "native") {
        const fresh = await withDeadline(8_000, (signal) => deps.freshPrice!(order.chainIndex, order.address, signal)).catch(() => null);
        if (fresh !== null && Number.isFinite(fresh) && fresh > 0) return fresh;
      }
      return scanPriceOf(order);
    };
    const mark = async (o: OutcomeRow): Promise<void> => {
      const c = byCandidate.get(o.order.candidateId);
      try {
        deps.scoreboard.mark({
          kind: "decision",
          key: orderKey(cycleId, o.order.candidateId),
          cycleId,
          atMs: t0,
          mode: runMode,
          side: o.order.side,
          candidateId: o.order.candidateId,
          chainIndex: o.order.chainIndex,
          address: o.order.address,
          symbol: o.order.symbol,
          stance: o.order.stance,
          usd: o.order.usd,
          entryPriceUsd: await entryPriceOf(o.order),
          costUsd: o.costUsd ?? null,
          posture: decision?.posture ?? "neutra",
          profile: o.order.profile,
          source: o.order.source,
          families: c?.families ?? [],
          triggers: c?.triggers ?? [],
          wallet: o.order.wallet,
        });
      } catch {
        if (!notes.includes("placar_nao_gravou")) notes.push("placar_nao_gravou");
      }
    };

    /**
     * The money mode, one order at a time. The person's stop is read again before each. A purchase writes the plan of its position BEFORE the swap (a fresh price is its entry): if the plan cannot be saved the
     * order is not sent. A failed order never stops the others (a stop-loss behind a failed one must still go out); only an uncertain one does, because it may have gone out. A plan is closed by the book, not by a
     * transaction hash: the position leaving the wallet closes it.
     */
    const executeRows = async (rows: readonly OutcomeRow[]): Promise<{ readonly stop: string; readonly error: boolean } | null> => {
      const executor = deps.executor;
      if (executor === null) return { stop: "sem_executor", error: false };
      let failed = false;
      const shouldStop = (): boolean => {
        const s = deps.state.get();
        // disconnected, or the money side lost its readiness in the middle of the cycle: the orders left in it are not sent
        return s.stopped || s.mode !== "limitado" || deps.stopFilePresent();
      };
      for (const o of rows) {
        if (o.order.wallet !== "agente") continue; // the principal wallet is only ever prepared for the person
        if (shouldStop()) return { stop: "parado_no_ciclo", error: false };
        const key = orderKey(cycleId, o.order.candidateId);
        const pk = planKey(o.order.chainIndex, o.order.address);
        const refuse = (reason: string): boolean => {
          o.stage = "falhou";
          o.reason = reason;
          failed = true;
          return append(o);
        };
        let openedHere = false;
        if (o.order.side === "buy") {
          const entry = await entryPriceOf(o.order);
          if (o.order.profile === null || !Object.hasOwn(PROFILES, o.order.profile)) {
            if (!refuse("perfil_invalido")) return { stop: "ledger_nao_gravou", error: true };
            continue;
          }
          if (entry === null) {
            if (!refuse("sem_preco_de_entrada")) return { stop: "ledger_nao_gravou", error: true };
            continue;
          }
          // a plan whose position is gone is an orphan of an earlier trade; one whose position is still held is the plan this purchase adds to
          if (deps.plans.get(pk) !== undefined && !heldKeys.has(pk)) deps.plans.close(pk);
          if (deps.plans.get(pk) === undefined) {
            const opened = deps.plans.open({ key: pk, chainIndex: o.order.chainIndex, address: o.order.address, symbol: o.order.symbol, profile: o.order.profile as ProfileId, entryPriceUsd: entry, entryAtMs: deps.now(), peakPriceUsd: entry, targetHit: false, trimmed: false, cycleId });
            if (!opened) {
              notes.push("plano_nao_gravou");
              if (!refuse("plano_nao_gravou")) return { stop: "ledger_nao_gravou", error: true };
              continue;
            }
            openedHere = true;
          }
        }
        o.stage = "enviando";
        if (!append(o)) {
          o.stage = "preparada";
          if (openedHere) deps.plans.close(pk);
          return { stop: "ledger_nao_gravou", error: true };
        }
        let outcome: ExecResult;
        try {
          outcome = await withDeadline(deps.timeouts.orderMs, (signal) => executor.execute(o.order, { cycleId, orderKey: key, signal, shouldStop }));
        } catch (error) {
          // we do not know whether it went out: it stays in flight and is never sent again
          outcome = { status: "incerta", reason: error instanceof Deadline ? "tempo_esgotado" : "excecao" };
        }
        // a transmitted order is recorded as unsettled (`incerta`, reason `transmitida`) with its hash: it is in flight, the token is held, and the receipt settles it
        o.stage = outcome.status === "transmitida" ? "incerta" : outcome.status;
        o.ref = outcome.status === "executada" || outcome.status === "transmitida" ? outcome.ref : outcome.status === "incerta" ? (outcome.ref ?? null) : null;
        o.costUsd = outcome.status === "executada" || outcome.status === "transmitida" ? (outcome.costUsd ?? null) : null;
        o.reason = outcome.status === "executada" ? null : outcome.status === "transmitida" ? "transmitida" : outcome.reason;
        o.detail = outcome.status === "incerta" || outcome.status === "falhou" ? (outcome.detail ?? null) : null;
        if (!append(o)) return { stop: "ledger_nao_gravou", error: true };
        if (outcome.status === "falhou") {
          failed = true;
          if (openedHere) deps.plans.close(pk); // nothing was bought, so there is no position to protect
          continue;
        }
        // the half taken at the target is marked on the plan BEFORE the mark of the Placar (which may wait on a price): a crash in between must not take the half a second time
        if (outcome.status === "executada" && o.order.side === "sell" && o.order.source === "protecao" && o.order.stance === "trim_half" && halfDone(deps.ledger.orderRecords(), pk, deps.plans.get(pk)?.entryAtMs ?? 0)) deps.plans.markTrimmed(pk);
        await mark(o);
        if (outcome.status === "incerta") return { stop: "ordem_incerta", error: false };
        if (outcome.status === "executada" && o.order.side === "buy" && openedHere && outcome.priceUsd !== undefined) deps.plans.reprice(pk, outcome.priceUsd);
      }
      return failed ? { stop: "ordem_falhou", error: false } : null;
    };

    // ---- 1. the plans' exits: carried out BEFORE the model is asked, with or without it
    const spent = () => deps.ledger.spentTodayUsd(deps.now());
    const protective: OutcomeRow[] = [];
    {
      const allowed = protectionOrders.filter((o) => {
        if (!inflightTokens.has(planKey(o.chainIndex, o.address))) return true;
        // an order whose answer never came is NOT sent again, not even by the stop of its own token and not after any time: no receipt is not proof that the first one ended, and a second swap is a second transaction (its own
        // fee, its own financial intent), not an idempotent resend. The token stays held until a receipt of the tool's history proves the outcome (the guard looks it up every pass) or the person says what happened; the other tokens go on.
        dropped.push({ candidateId: o.candidateId, reason: "ordem_em_voo" });
        return false;
      });
      const capped = applyCaps(allowed, deps.caps, spent());
      dropped.push(...capped.dropped);
      // an exit worth more than the owner's per-transaction limit goes in parts (the account would refuse it whole); the part is in flight until its receipt and the next look cuts the next from the balance it reads then
      const fitted = splitToPolicy(capped.orders, limited?.policy?.perTxUsd ?? null);
      protective.push(...fitted.map((order): OutcomeRow => ({ order, stage: "preparada", ref: null, reason: null })));
    }
    if (protective.length > 0) {
      outcomes.push(...protective);
      if (!persist(protective, "protecao")) return report({ outcome: "erro", reason: "ledger_nao_gravou", considered, ...answered });
      if (runMode !== "limitado") for (const o of protective) await mark(o);
      else {
        const stop = await executeRows(protective);
        // a clean failure leaves that exit for the next cycle and the rest of this one goes on (the token stays out of what the model is offered); only an uncertain order, a ledger that
        // cannot be written or a stop from the person ends the cycle here
        if (stop !== null && stop.stop === "ordem_falhou") {
          if (!notes.includes("saida_do_plano_falhou")) notes.push("saida_do_plano_falhou");
        } else if (stop !== null) return result({ outcome: stop.error ? "erro" : "decidido", reason: stop.stop });
      }
    }

    // the watch ends here: the exits the plans demanded are what it was for
    if (guardOnly) return protective.length === 0 ? report({ outcome: "mantido", reason: "vigilancia", considered }) : result({ reason: "vigilancia" });

    // ---- what the model will be asked about: read after the exits, so they never wait for these reads
    const eco: EcoContext = await withDeadline(deps.timeouts.readMs, (signal) => deps.ecosystem(saldo, signal)).catch(() => {
      notes.push("ecossistema_indisponivel");
      return { observedAtMs: deps.now(), saldo, candidates: [], excluded: {} };
    });
    await Promise.all(
      eco.candidates.map(async (c) => {
        timings.set(c.facts.candidateId, await withDeadline(deps.timeouts.readMs, (signal) => deps.timingOf(c.facts, signal)).catch(() => null));
      }),
    );
    // the agent decides about the wallet it manages; the other wallets it reads are part of the picture and nothing can be done about them
    const holdingsBase = holdingCandidates(view, factsOf, (p) => protection.views.get(holdingId(p)) ?? null).candidates.filter((c) => c.wallet === "agente" && !protection.handled.has(c.id) && !inflightTokens.has(planKey(c.chainIndex, c.address)));
    // every holding that can be kept gets its two-day hourly structure read (reusing the ecosystem timing when the same token is in both), and a holding with no plan is offered the profiles that fit its volatility
    const holdingTimings = new Map<string, TimingFacts | null>();
    await Promise.all(
      holdingsBase
        .filter((c) => c.stances.includes("hold") && c.address !== "native")
        .map(async (c) => {
          const ecoKey = `token:${c.chainIndex}:${c.address}`;
          const existing = timings.get(ecoKey);
          holdingTimings.set(c.id, existing !== undefined ? existing : await withDeadline(deps.timeouts.readMs, (signal) => deps.timingOf(identityOf(c), signal)).catch(() => null));
        }),
    );
    const ecoFamiliesByKey = new Map(eco.candidates.map((e) => [planKey(e.facts.chainIndex, e.facts.address), e.families]));
    const holdingsPlain = holdingsBase.map((c) => {
      const tf = holdingTimings.get(c.id) ?? null;
      const ecoFams = ecoFamiliesByKey.get(planKey(c.chainIndex, c.address)) ?? [];
      const withT = tf !== null || ecoFams.length > 0 ? withTiming(c, tf, ecoFams) : c;
      return c.plan === null && holdingTimings.has(c.id) ? { ...withT, profiles: offeredProfiles(tf?.sigmaHourPct ?? null) } : withT;
    });
    // what the plan is selling this very cycle is not bought back by the model in the same cycle; a token with an order in flight is not touched by the model at all
    const paused = deps.buyingPaused?.() ?? false;
    if (paused) notes.push("compras_pausadas");
    // what the few tokens that matter are doing in the last hour (five-minute bars): at most three purchases that are still open and three holdings, so the quota goes where the decisions are
    const momentum = new Map<string, MomentumFacts | null>();
    if (deps.momentumOf !== undefined) {
      const open = paused ? [] : buyCandidates(eco, (f) => timings.get(f.candidateId) ?? null, deps.minBuyUsd ?? minBuyUsd, undefined, limited?.policy?.perTxUsd ?? null).filter((c) => c.stances.length > 1).slice(0, MOMENTUM_READS);
      await Promise.all(
        [...open, ...holdingsPlain.slice(0, MOMENTUM_READS)].map(async (c) => {
          momentum.set(c.id, await withDeadline(deps.timeouts.readMs, (signal) => deps.momentumOf!(identityOf(c), signal)).catch(() => null));
        }),
      );
    }
    // a token the model has already sold part of is not sold in slices again within the hour: every slice pays the network fee and the price impact once more, and the measured record says the model's partial sales
    // have not beaten keeping. It can still keep the token or leave it whole. (A sale that failed cleanly or was never sent does not count.)
    const lastSaleAt = new Map<string, number>();
    for (const r of deps.ledger.orderRecords()) {
      if (r.side !== "sell" || r.source !== "modelo" || r.wallet !== "agente" || !(r.stage === "executada" || r.stage === "incerta" || r.stage === "enviando")) continue;
      const k = planKey(r.chainIndex, r.address);
      lastSaleAt.set(k, Math.max(lastSaleAt.get(k) ?? 0, r.atMs));
    }
    const lastSimFail = new Map<string, number>();
    for (const r of deps.ledger.orderRecords()) {
      if (r.side !== "sell" || r.wallet !== "agente" || r.stage !== "falhou" || r.reason !== "simulacao_falhou") continue;
      const k = planKey(r.chainIndex, r.address);
      lastSimFail.set(k, Math.max(lastSimFail.get(k) ?? 0, r.atMs));
    }
    const cooled = (c: Candidate): Candidate => {
      const failedAt = lastSimFail.get(planKey(c.chainIndex, c.address));
      if (c.kind === "holding" && failedAt !== undefined && deps.now() - failedAt < SELL_RETRY_BACKOFF_MS) {
        return { ...c, stances: ["hold"], usdByStance: { hold: 0 }, triggers: [...c.triggers, "venda_falhando"] };
      }
      const at = lastSaleAt.get(planKey(c.chainIndex, c.address));
      if (c.kind !== "holding" || at === undefined || deps.now() - at >= TRIM_COOLDOWN_MS) return c;
      const stances = c.stances.filter((s) => s === "hold" || s === "exit_all");
      return { ...c, stances, usdByStance: Object.fromEntries(Object.entries(c.usdByStance).filter(([s]) => (stances as readonly string[]).includes(s))) };
    };
    const holdings = holdingsPlain.map((c) => cooled(momentum.has(c.id) ? withMomentum(c, momentum.get(c.id) ?? null) : c));
    const buys = paused ? [] : buyCandidates(eco, (f) => timings.get(f.candidateId) ?? null, deps.minBuyUsd ?? minBuyUsd, (f) => momentum.get(`buy:${f.candidateId}`) ?? null, limited?.policy?.perTxUsd ?? null, (chainIndex, address) => (heldKeys.has(planKey(chainIndex, address)) ? (deps.plans.get(planKey(chainIndex, address))?.profile ?? null) : null)).filter((c) => !exiting.has(planKey(c.chainIndex, c.address)) && !inflightTokens.has(planKey(c.chainIndex, c.address)) && !pending.tokens.has(planKey(c.chainIndex, c.address)));
    // the model is shown the purchases the code left OPEN first (up to MAX_OPEN_BUYS), and closed ones only to fill (up to MAX_BUYS_SHOWN in all): a wide pool is no use if the few shown are all closed
    const openBuys = buys.filter((c) => c.stances.length > 1).slice(0, MAX_OPEN_BUYS);
    const closedBuys = buys.filter((c) => c.stances.length <= 1).slice(0, Math.max(0, MAX_BUYS_SHOWN - openBuys.length));
    const shownBuys = [...openBuys, ...closedBuys];
    // what each level of the mandate would open, counted from the same candidates and the same sizing: the model chooses its own risk, so it is shown what the choice buys
    const mandateNow = deps.mandate?.() ?? null;
    const mandateView = mandateNow === null ? null : { ...mandateNow, openByRisk: paused ? { cauteloso: 0, moderado: 0, agressivo: 0 } : openByRisk(eco, (f) => timings.get(f.candidateId) ?? null, deps.minBuyUsd ?? minBuyUsd, RISK_PCT, (f) => momentum.get(`buy:${f.candidateId}`) ?? null) };
    openedNow = mandateView === null ? null : { ...mandateView.openByRisk, ...(mandateNow!.aggressiveOpen || mandateView.openByRisk.agressivo === undefined ? {} : { agressivo: 0 }) };
    const candidates: Candidate[] = [...holdings, ...shownBuys];
    considered = { holdings: holdings.length, buys: buys.length, protected: protection.handled.size };
    ecoById = new Map(eco.candidates.map((c) => [`buy:${c.facts.candidateId}`, c.facts]));
    byCandidate = new Map(candidates.map((c) => [c.id, c]));
    looked = candidates.slice(0, 16).map((c): CandidateView => ({ id: c.id, kind: c.kind, symbol: c.symbol, chainIndex: c.chainIndex, stance: null, families: c.families.slice(0, 4), marks: c.marks.slice(0, 4), closed: c.kind === "buy" && c.stances.length <= 1 ? (c.cap !== undefined && c.cap.maxUsd > 0 ? "abaixo_do_minimo" : "sem_tamanho") : null, probs: null, facets: null }));

    /** The closing phase of this cycle (shadow). Never throws: a failure here costs the measurement, never the cycle. */
    const closingPhase = async (from: { readonly first: ModelAnswer["raw"]; readonly gated: Readonly<Record<string, string>>; readonly brief: AgentBrief } | null, saldoNow: Saldo | null, book: Book, placed: "antes" | "depois"): Promise<void> => {
      const cfg = deps.closing;
      if (cfg === undefined || from === null || deps.stopFilePresent()) return;
      try {
        const model = typeof deps.model === "function" ? deps.model() : deps.model;
        if (model === null) return;
        // the purchases the first answer leaned to, at the size it asked: the same planning as for a real order, on the answer BEFORE the gate (these orders are never sent)
        const first = validateDecision(from.first, candidates);
        if (!first.ok) return;
        const hypothetical = planOrders(first.decision, candidates, book, saldoNow, deps.minBuyUsd ?? minBuyUsd).orders.filter((o) => o.side === "buy" && o.source === "modelo");
        if (hypothetical.length === 0) return;
        const itemLegend = Object.fromEntries(Object.entries(from.brief.chaves).filter(([k]) => k.startsWith("compras.")));
        const list: ClosingCandidate[] = [];
        for (const o of hypothetical) {
          const c = candidates.find((x) => x.id === o.candidateId);
          if (c === undefined) continue;
          const probs = from.first.verdicts?.[c.id]?.probabilities ?? null;
          const firstP = probs === null ? null : Math.max(...Object.entries(probs).filter(([k]) => k.startsWith("buy")).map(([, v]) => Number(v)), -1);
          const sizes = AGENT_BUY_SIZES.filter((size) => c.stances.includes(size));
          list.push({
            id: c.id, order: o, symbol: c.symbol, portfolioUsd: book.totalUsd, liquidityUsd: ecoById.get(c.id)?.liquidityUsd ?? null,
            profile: ((first.decision.profiles[c.id] ?? c.profiles[0]) as ProfileId | undefined) ?? "alvo_5", smallest: sizes[0] === o.stance, firstP: firstP === null || firstP < 0 ? null : firstP,
            facets: from.first.facets?.[c.id] ?? {}, item: from.brief.compras[c.id] ?? null, itemLegend, appliedByGate: from.gated[c.id] ?? "skip",
          });
        }
        const phase = Math.min((cfg.timeouts.quoteMs + cfg.timeouts.modelMs) * Math.max(1, cfg.maxPerCycle), cfg.phaseMs ?? CLOSING_PHASE_MS);
        // the phase is cut at its limit by a timer of our own (one that keeps the process alive) and the cycle does not wait for a step that ignores the cut: the extra look can cost its measurement, never the order behind it
        const cut = new AbortController();
        const timer = setTimeout(() => cut.abort(), phase);
        const released = new Promise<void>((resolve) => cut.signal.addEventListener("abort", () => resolve(), { once: true }));
        try {
          await Promise.race([
            runClosing({
              deps: { mode: () => "shadow", quoter: cfg.quoter, model, budget: deps.budget, now: deps.now, newId: deps.newId, record: cfg.record, maxPerCycle: cfg.maxPerCycle, timeouts: cfg.timeouts, ...(cfg.reserveForPrimaries === undefined ? {} : { reserveForPrimaries: cfg.reserveForPrimaries }) },
              cycleId, candidates: list, signal: cut.signal, exec: deps.execFacts?.() ?? null, placed,
            }),
            released,
          ]);
        } finally {
          clearTimeout(timer);
        }
      } catch {
        // the measurement is lost, the cycle is not
      }
    };

    // what the closing needs of the primary answer: the answer as it came (before the gate), what the gate left, and the brief the model read
    let closingFrom: { readonly first: ModelAnswer["raw"]; readonly gated: Readonly<Record<string, string>>; readonly brief: AgentBrief } | null = null;

    // ---- 2. the model's choice
    const ask = async (): Promise<Asked> => {
      const no = (reason: string, extra: Partial<CycleReport> = {}): Asked => ({ ok: false, reason, extra });
      if (candidates.length === 0) return no(inflightTokens.size > 0 ? "ordens_em_voo" : "sem_candidatos");
      // a candidate whose only stance is hold or skip has nothing to decide; with none to decide, the model is not asked, EXCEPT when a higher level of risk would open purchases the one in force does not:
      // the mandate is the model's own and only a consultation can move it (one step at a time), so a mandate that opens nothing must not keep the model from being asked about it
      if (candidates.every((c) => c.stances.length <= 1) && !mandateWouldOpenMore(openedNow, mandateNow)) return no("nada_a_decidir");
      const model = typeof deps.model === "function" ? deps.model() : deps.model;
      if (model === null) return no("sem_modelo");
      const brief = agentBrief({ book: view, holdings, buys: shownBuys, eco, context: deps.context(), history: deps.history(), exec: deps.execFacts?.() ?? null, mandate: mandateView, ...(deps.feeOf === undefined ? {} : { feeOf: deps.feeOf }) });
      const hash = hashOf(brief);
      // the Brief is ready: no fact in it is later than this instant
      const briefReadyAtMs = deps.now();
      if (lastConsult !== null && lastConsult.hash === hash && deps.now() - lastConsult.atMs < deps.refreshMs) return no("sem_mudanca");
      const estimate = model.estimateTokens(brief, candidates);
      const budgetCheck = deps.budget.check(estimate);
      if (!budgetCheck.ok) return no(budgetCheck.reason);
      let ticket;
      try {
        ticket = deps.budget.begin(estimate);
      } catch {
        return no("orcamento_nao_gravou");
      }
      let answer;
      let askedAtMs = 0;
      let answeredAtMs = 0;
      try {
        askedAtMs = deps.now();
        answer = await withDeadline(deps.timeouts.modelMs, (signal) => model.choose({ brief, candidates, signal }));
        answeredAtMs = deps.now();
      } catch (error) {
        deps.budget.finish(ticket, null);
        // a request that went out before the one that failed (refused for its shape, then asked again) is a consultation too
        for (let i = 1; i < physicalRequestsOf(error); i++) deps.budget.countExtra(estimate);
        return no("modelo_erro", { consulted: true, modelo: model.name });
      }
      deps.budget.finish(ticket, answer.usage);
      // two physical requests for one choice: the refused one has no usage to report, so it counts as a consultation of unknown usage
      for (let i = 1; i < (answer.physicalRequests ?? 1); i++) deps.budget.countExtra(estimate);
      lastConsult = { hash, atMs: deps.now() };
      const extra = { consulted: true, modelo: model.name, usage: answer.usage };
      // what the Jev chose is the decision: no bar of conviction, no smaller size, no veto of the code stands between its choice and the order (the owner's decision of 2026-10-14). How sure it was is recorded next to it.
      const raw = answer.raw;
      const requested = answer.raw.stances;
      const gatedNotes: string[] = [];
      const gateDetails: Readonly<Record<string, GateDetail>> = raw.verdicts === undefined ? {} : describeAnswer(raw.stances, raw.verdicts, candidates);
      shown.verdicts = Object.fromEntries(Object.entries(raw.verdicts ?? {}).map(([id, v]) => [id, Object.fromEntries(Object.entries(v.probabilities ?? {}).map(([option, p]) => [option, Math.round(p * 100) / 100]))]));
      shown.facets = Object.fromEntries(Object.entries(answer.raw.facets ?? {}).map(([id, f]) => [id, Object.fromEntries(Object.entries(f).map(([name, p]) => [name, Math.round(p * 100) / 100]))]));
      const decided = validateDecision(raw, candidates);
      closingFrom = { first: answer.raw, gated: raw.stances, brief };
      // for the study of the decisions: what the model saw and what it answered (never a balance or an address)
      try {
        deps.onConsult?.({
          cycleId,
          atMs: t0,
          mode: runMode,
          briefBytes: JSON.stringify(brief).length,
          candidates: candidates.map((c) => ({ id: c.id, kind: c.kind, stances: c.stances, marks: c.marks.slice(0, 8), families: c.families, triggers: c.triggers.slice(0, 8), ...(c.cap === undefined ? {} : { cap: c.cap }) })),
          brief: { carteira: brief.carteira, chaves: brief.chaves, posicoes: brief.posicoes, compras: brief.compras, ...(brief.execucoes === undefined ? {} : { execucoes: brief.execucoes }), mandato: brief.mandato },
          briefHash: hash.slice(0, 16),
          briefVersion: brief.v,
          physicalRequests: answer.physicalRequests ?? 1,
          criteria: "rank-v1",
          legend: "scoped-v1",
          notes: [...gatedNotes, ...(decided.ok && decided.decision.limited !== undefined && decided.decision.limited.length > 0 ? ["postura_limitou"] : [])],
          valid: decided.ok,
          invalidReason: decided.ok ? null : decided.reason,
          requested,
          ...(Object.keys(gateDetails).length === 0 ? {} : { gates: gateDetails }),
          facets: answer.raw.facets ?? {},
          historico: brief.historico,
          contexto: brief.contexto,
          verdicts: Object.fromEntries(Object.entries(raw.verdicts ?? {}).map(([id, v]) => [id, Object.fromEntries(Object.entries(v.probabilities ?? {}).map(([option, p]) => [option, Math.round(p * 100) / 100]))])),
          posture: raw.posture,
          ...(raw.postureProbs === undefined ? {} : { postureProbs: raw.postureProbs }),
          // what was DONE: the stances and profiles after the posture limited the sizes (what the model asked for is `requested`)
          stances: decided.ok ? decided.decision.stances : raw.stances,
          profiles: decided.ok ? decided.decision.profiles : raw.profiles,
        }, { factAvailableAtMs: briefReadyAtMs, askedAtMs, answeredAtMs, briefHash: hash, model: model.name });
      } catch {
        // a record that could not be kept costs nothing
      }
      return decided.ok ? { ok: true, decision: decided.decision, extra } : no(decided.reason, extra);
    };

    const asked = await ask();
    answered = asked.extra;
    // nothing to carry out and nothing decided: the cycle holds
    if (!asked.ok && outcomes.length === 0) return finish(report({ outcome: "mantido", reason: asked.reason, considered, ...asked.extra }));
    if (!asked.ok) return result({ reason: asked.reason });

    decision = asked.decision;
    if (decision.limited !== undefined && decision.limited.length > 0 && !notes.includes("postura_limitou")) notes.push("postura_limitou");
    const chosen = asked.decision.stances;
    looked = looked.map((v) => ({ ...v, stance: chosen[v.id] ?? null, probs: shown.verdicts[v.id] ?? null, facets: shown.facets[v.id] ?? null }));
    // the protection the model chose for a holding it keeps becomes a plan, with the price of this moment as its entry: from now on the stop, the target and the time are the code's, between the looks of the model
    let adopted = 0;
    for (const c of candidates) {
      if (c.kind !== "holding" || c.wallet !== "agente") continue;
      const profile = asked.decision.profiles[c.id];
      if (profile === undefined || chosen[c.id] === "exit_all" || !(profile in PROFILES)) continue;
      const key = planKey(c.chainIndex, c.address);
      if (deps.plans.get(key) !== undefined) continue;
      const held = positionOf.get(c.id);
      const price = held === undefined ? null : priceOf(held);
      if (price === null || !Number.isFinite(price) || price <= 0) continue;
      if (deps.plans.open({ key, chainIndex: c.chainIndex, address: c.address, symbol: c.symbol, profile: profile as ProfileId, entryPriceUsd: price, entryAtMs: deps.now(), peakPriceUsd: price, targetHit: false, trimmed: false, cycleId })) adopted++;
      else if (!notes.includes("plano_nao_gravou")) notes.push("plano_nao_gravou");
    }
    if (adopted > 0) notes.push("planos_adotados");
    // choosing NOT to act is a decision too: every hold and every skip is measured against the alternative that was turned down, in windows of their own
    for (const c of candidates) {
      const stance = chosen[c.id];
      const kept = c.kind === "holding" && stance === "hold";
      const passed = c.kind === "buy" && stance === "skip";
      if (!kept && !passed) continue;
      // a purchase passed over is measured by the smallest order it could have been, even when NO size was on offer (no cash on its network, or the code closed it): otherwise the agent learns nothing from exactly the
      // moments it has nothing to spend, which is when most of its skips happen
      const offered = c.usdByStance.buy_third ?? Object.values(c.usdByStance).find((v) => v > 0);
      const size = kept ? c.heldUsd : (offered ?? (deps.minBuyUsd ?? minBuyUsd)(c.chainIndex));
      if (!(size > 0)) continue;
      const price = kept ? ((): number | null => { const p = positionOf.get(c.id); return p === undefined ? null : priceOf(p); })() : (ecoById.get(c.id)?.priceUsd ?? null);
      try {
        deps.scoreboard.mark({
          kind: "decision",
          key: `${orderKey(cycleId, c.id)}|inacao`,
          cycleId,
          atMs: t0,
          mode: runMode,
          side: kept ? "buy" : "sell",
          candidateId: c.id,
          chainIndex: c.chainIndex,
          address: c.address,
          symbol: c.symbol,
          stance: kept ? "hold" : "skip",
          usd: size,
          entryPriceUsd: price,
          costUsd: null,
          posture: decision?.posture ?? "neutra",
          profile: null,
          source: "modelo",
          families: c.families,
          // a purchase the code itself closed (only `skip` on offer) is marked as such: it measures the code's rule, not the model's judgment
          triggers: passed && c.stances.length <= 1 ? [...c.triggers, "fechada_pelo_codigo"] : c.triggers,
          wallet: c.wallet,
          inaction: true,
        });
      } catch {
        if (!notes.includes("placar_nao_gravou")) notes.push("placar_nao_gravou");
      }
    }
    // the strategy is the model's to set: what it asked for moves the mandate one step, for the cycles that follow
    if (decision.mandate !== null) {
      try {
        deps.onMandate?.(decision.mandate);
      } catch {
        notes.push("mandato_nao_gravou");
      }
    }
    const plan = planOrders(decision, candidates, view, saldo, deps.minBuyUsd ?? minBuyUsd);
    // the closing of the purchases the model leaned to, in shadow: it measures and records, and nothing below depends on it. The orders come first: with a sale in the plan the look waits until every order of the
    // cycle has gone out, so an extra look can never hold back an exit already chosen; with only purchases it is the measurement of the entry, before it, and the phase is cut at a fixed time
    const sells = runMode === "limitado" && plan.orders.some((o) => o.side === "sell");
    let closingRan = false;
    const closeOnce = async (placed: "antes" | "depois"): Promise<void> => {
      if (closingRan) return;
      closingRan = true;
      await closingPhase(closingFrom, saldo, view, placed);
    };
    if (!sells) await closeOnce("antes");
    const capped = applyCaps(splitToPolicy(plan.orders, limited?.policy?.perTxUsd ?? null), deps.caps, spent());
    dropped.push(...plan.dropped, ...capped.dropped);
    const rows = capped.orders.map((order): OutcomeRow => ({ order, stage: "preparada", ref: null, reason: null }));
    outcomes.push(...rows);
    if (!persist(rows, null)) return result({ outcome: "erro", reason: "ledger_nao_gravou" });

    if (runMode !== "limitado") {
      for (const o of rows) await mark(o);
      await closeOnce("antes");
      return result({});
    }
    const stop = await executeRows(rows);
    await closeOnce("depois");
    return stop === null ? result({}) : result({ outcome: stop.error ? "erro" : "decidido", reason: stop.stop });
  }

  return {
    async run() {
      if (busy) return emptyReport(deps.state.get().mode, "ja_em_andamento", "bloqueado");
      busy = true;
      try {
        lastReport = await cycle();
        return lastReport;
      } catch {
        lastReport = emptyReport(deps.state.get().mode, "excecao", "erro");
        return lastReport;
      } finally {
        busy = false;
      }
    },
    async guard() {
      if (busy) return emptyReport(deps.state.get().mode, "ja_em_andamento", "bloqueado");
      busy = true;
      try {
        const out = await cycle(true);
        // the last cycle the person sees is the model's, unless the watch actually sent something
        if (out.orders.length > 0) lastReport = out;
        return out;
      } catch {
        return emptyReport(deps.state.get().mode, "excecao", "erro");
      } finally {
        busy = false;
      }
    },
    last: () => lastReport,
    running: () => busy,
  };
}

