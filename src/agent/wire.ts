/**
 * The real agent, assembled (AUT-12): the files under `<data>/agent`, the readers of the wallets and the market, the model, the signing tool behind its guard, the cycle, the scheduler, and the status the
 * screen reads. Everything outside the process (the exchange, the OnchainOS gateway, the model, the CLI) enters through an option, so the tests run the whole thing on fakes; the launcher passes the real
 * ones. Nothing starts by itself: the scheduler runs only when `start` is set, and even then a cycle does nothing while the agent is off.
 */
import { appendFileSync, chmodSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { BriefSource } from "../inonu/ask";
import type { OnchainGatewayInternal } from "../onchain-read/gateway";
import { okxClockStatus, okxNowMs, syncOkxClock } from "../okx-clock";
import { createOkxPortfolioClient } from "../okx-wallet/portfolio";
import type { SettingsStore } from "../settings/store";
import { consultsForRhythm, createBudget, type BudgetLimits, type BudgetState } from "./budget";
import { createHash } from "node:crypto";
import { equityPause, equitySeries, parseSnapshotLine, snapshotOf, tradesOf } from "./equity-log";
import type { Snapshot } from "./equity";
import { halfDone } from "./exit";
import { createFillStore, execBrief, fillFrom, tokenTripsBrief } from "./fills";
import { newReconcileMemory, settleByReceipts, type RefRecovery } from "./reconcile";
import { installCli, PINNED_SHA256, pollLogin, readAddresses, startLogin, type InstallResult } from "./agent-wallet";
import { createSolanaReceiptReader, createSolanaSwapFinder, withSolanaReceiptFallback } from "../server/solana-receipts";
import { binaryMatches, resolveCliPath, createCliExecutor, createEntryQuoter, createReceiptLookup, readAccountStatus, type AccountStatus, createGuardedRunner, createLimitedFactsReader, createProcessRunner, createVerifiedRunner, readTextFile, sha256File as realSha256File, type CliRunner } from "./cli";
import { configFile, createConfigStore, type ConfigPatch } from "./config";
import { capRaised, type PolicyMirror } from "./gate";
import { createCycleRunner, type CycleReport, type Executor } from "./cycle";
import { cachedEntryQuoteReader, impactOfQuote } from "./entry-cost";
import { createRecorders } from "./recording";
import { createFileAgentLedger } from "./ledger";
import { createBookReader, createEcosystemReader, createHoldingFactsReader, createMarketContext, createMomentumReader, createPriceLookup, createTimingReader, okxPublicCandles, okxPublicDerivatives, type BalanceSource, type PublicCandles, type PublicDerivatives } from "./live";
import { createJevAgentModel, questionsDigest, type AgentModel } from "./model";
import { createPlanStore, planFileStore, planKey, planView } from "./plans";
import { createScheduler, type Scheduler } from "./scheduler";
import { createScoreboard } from "./scoreboard";
import { createOpportunityDispatcher } from "../decision-review/events";
import { resourceView } from "./resources";
import { executionGuards } from "./guards";
import { createFeeMemory } from "./fees";
import { decisionMetadata, decisionVersionOf, placarEvaluatorHash } from "./decision-metadata";
import { buildMemoryBrief, effectiveLegend, type MemoryHookDeps } from "./memory-hook";
import { createContextOpportunityDispatcher } from "../decision-review/context-events";
import type { PulseReading } from "../pulse/pulse";
import { createMacroBridge, createMacroContext, type MacroBridge, type MacroContext } from "./macro-context";
import { buildAnalysis, type AnalysisView } from "./analysis";
import { eventsAllowed, priceMoveEvents, pricesOf } from "./event-source";
import type { QuoteFacts } from "./quote-facts";
import { acquireAgentLock } from "./lock";
import { agentStateFile, createAgentState, DISCLOSURE, isPaused, type RunState } from "./state";

/** The first line of the stop file THIS APP writes when it disconnects and cannot be sure the disconnection was saved. A stop file without it was placed by a person, and connecting does not remove it. */
export const STOP_MARK = "inonu-agent: stop file written by the app when it disconnected";
import { DISCIPLINE, lapsedPause } from "./autonomy";
import { boldHotIntervalMin, deriveSettings, effectiveIntervalMin, HOT_INTERVAL_MIN, hotWithinQuota, OWNER_AUTHORIZATIONS, OWNER_PROFILE, type EffectiveSettings, type OwnerProfile } from "./autopilot";
import { createMandateStore, mandateFileStore } from "./mandate";
import type { AgentService, AgentStatus, AuthorityView, BookStatus, ConfigChange, ConnectChange, PositionRow, Readiness, ResolveResult, WalletAction, WalletSetupResult, WalletSetupView } from "./service";
import type { Book, Mode } from "./types";

/** How often the guard looks over the positions between the cycles: the stop of a plan does not wait for the next look of the model. */
const GUARD_EVERY_MS = 45_000;
/** The least time between two readings of the wallet's value kept for the equity series. */
const EQUITY_EVERY_MS = 4 * 60_000;
/** How many consultations of the model are kept in `briefs.jsonl` for the study of the decisions. */
const BRIEFS_KEPT = 120;
/** How many closings (closing.ts) are kept in `closings.jsonl` for the study of the second look. */
const CLOSINGS_KEPT = 240;
/** How soon after a start the first cycle comes when the last one is old or unknown. */
const FIRST_CYCLE_MS = 20_000;
/** A cycle asked by an event comes at least this long after the last one: the guard looks every 45 s and a fact must not become a look of the model each time. */
const EVENT_MIN_GAP_MS = 90_000;
/** How long an answer of the analysis is kept: the screen asks every few seconds and the files change at the pace of the cycles. */
const ANALYSIS_MEMO_MS = 5_000;
/** The tokens a look of the model is assumed to need for the pre-check of the budget (the cycle itself checks with the real estimate of the model). */
const EVENT_TOKEN_ESTIMATE = 4_000;
/** How long the facts of the money side are reused (the guard asks every few seconds). */
const LIMITED_FACTS_TTL_MS = 60_000;

/** How many ledger records the cohort of the memory hook is searched in (the ledger keeps this many in memory). */
const MEMORY_TAIL_FOR_COHORT = 500;
/** How often the pulse is read for material facts between the looks, in ms, and how old an observation may be when it is told to the queue (the macro context's own bound: three minutes). */
const MACRO_POLL_MS = 5_000;
const MACRO_EVENT_MAX_AGE_MS = 180_000;

export interface AgentServiceOptions {
  /** How often the guard looks over the positions between the cycles, in ms; 0 turns it off. Default 45 s. */
  readonly guardEveryMs?: number;
  /** The data root of the app; the agent keeps everything under `<dataDir>/agent`. */
  readonly dataDir: string;
  /** The owner's policy in the OKX portal (per-transaction, daily trade and daily transfer limits, all on) is a condition of the money mode. The default is true, as it always was: only the person can relax it, by choosing it, and the agent then runs on the caps it derives itself. */
  readonly requireOwnerPolicy?: boolean;
  readonly store: SettingsStore;
  readonly gateway: OnchainGatewayInternal;
  /** The ecosystem source of "Pedir ao Inonu", reused for the candidates of purchase. */
  readonly source: BriefSource;
  /** The clock the exchange signature is stamped with. */
  readonly now: () => number;
  readonly fetch?: typeof fetch;
  /** The owner's risk profile (the bold one by default): see autopilot.ts. */
  readonly ownerProfile?: OwnerProfile;
  /** The read-only reader of a Solana signature on the public chain, the fallback of the receipt lookup; the real one by default. */
  readonly solanaReceipts?: ReturnType<typeof createSolanaReceiptReader>;
  /** The read-only finder of the Solana transaction of an order that never carried a signature (the tool refused after the broadcast); the real one by default. */
  readonly solanaSwaps?: ReturnType<typeof createSolanaSwapFinder>;
  /** The shortest time between the end of a cycle and a cycle asked by an event (a fact the guard saw), in ms; 90 s by default. */
  readonly eventMinGapMs?: number;
  /** The closing of the purchases the model leaned to (closing.ts), in shadow: on by default, `false` turns it off. */
  readonly closing?: boolean;
  /** The durable record of what the Jev answered and of the prices the cycle already reads, for the laboratory of the autoevolution (recording.ts): on by default, `false` turns it off. */
  readonly recording?: boolean;
  /** Starts the scheduler. The launcher turns it on; tests leave it off. */
  readonly start?: boolean;
  readonly schedule?: (ms: number, fn: () => void) => () => void;
  /** Test seams. */
  readonly model?: AgentModel | null | (() => AgentModel | null);
  readonly balances?: BalanceSource;
  readonly publicCandles?: PublicCandles;
  readonly publicDerivatives?: PublicDerivatives;
  readonly processRunner?: CliRunner;
  readonly sha256File?: (path: string) => Promise<string | null>;
  readonly syncClock?: () => Promise<unknown>;
  readonly clockSkewMs?: () => number | null;
  /** This machine's clock minus the exchange's, as measured (not corrected). */
  readonly localSkewMs?: () => number | null;
  /** The price of a token right now; defaults to the gateway's price route. */
  readonly freshPrice?: (chainIndex: string, address: string, signal: AbortSignal) => Promise<number | null>;
  readonly newId?: () => string;
  /** The smallest purchase worth making on a network (gas); defaults to the table of the agent. */
  readonly minBuyUsd?: (chainIndex: string) => number;
  /** Where the latest reading of System One is kept. */
  readonly systemOneFile?: string;
  /** The pulse of the market (src/pulse, ADENDO-E E1): the minute-level regime of BTC and SOL from one live feed. With it the Brief carries the macro context (ten fields per market, from snapshots captured once by hash) and a material move can ask for a look through the SAME flight of the scheduler; the proof of what the Brief carried is the only acknowledgement. OFF unless the host builds one. */
  readonly pulse?: { read(): PulseReading };
  /**
   * The memory hook of the Brief (memory-hook.ts), OFF by default: it exists only when this is given AND `enabled` is true. `read` is the batch reader of the captured experiences, bound by the host to a read-only store (the agent
   * never opens a writer on it); `cohortSize` is how many of the latest cycles of the ledger make the explicit cohort (default 24); `maxBytes` is the room the Brief leaves for the block (a block that does not fit is left out, never cut).
   */
  readonly memory?: { readonly enabled: boolean; readonly read: MemoryHookDeps["read"]; readonly arm?: "A" | "B"; readonly cohortSize?: number; readonly maxBytes?: number; readonly clock?: () => number };
  /** Test seam: installs the signing tool. The default downloads OKX's release and checks it against the checksums published beside it. */
  readonly installCli?: (dir: string) => Promise<InstallResult>;
}

const STATUS_LEDGER = 30;
/** The whole second look of a cycle is cut at this many milliseconds (cycle.ts). */
const CLOSING_PHASE_MS = 20_000;
const TIMEOUTS = { modelMs: 90_000, readMs: 25_000, factsMs: 30_000, orderMs: 150_000 } as const;

const jsonIo = <T>(path: string) => ({
  read: (): unknown => (existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : null),
  write: (value: T): void => {
    mkdirSync(dirname(path), { recursive: true });
    const tmp = `${path}.${process.pid}.tmp`;
    writeFileSync(tmp, `${JSON.stringify(value)}\n`);
    renameSync(tmp, path);
  },
});

const linesOf = (path: string): string[] => (existsSync(path) ? readFileSync(path, "utf8").split("\n") : []);

export function createAgentService(options: AgentServiceOptions): AgentService & { readonly scheduler: Scheduler; guardNow(): Promise<CycleReport> } {
  const dir = join(options.dataDir, "agent");
  const stopPath = join(dir, "STOP");
  const fetchImpl = options.fetch ?? fetch;
  const localNow = (): number => Date.now();
  // one agent per data folder: a second process refuses to run cycles while the first is alive
  const lock = acquireAgentLock(join(dir, "LOCK"));
  // the owner's limits are required unless the person chose otherwise (saved in the configuration); a server that was told to require them always does
  const policyRequired = (): boolean => (options.requireOwnerPolicy !== undefined ? options.requireOwnerPolicy : configStore.get().ownerPolicy !== "dispensada");
  // a reading of the wallet's value each cycle, kept in a file: the series the circuit breaker reads (equity.ts). Not more often than every few minutes.
  const equityPath = join(dir, "equity.jsonl");
  let lastEquityAtMs = 0;
  // the reading before this one (the last line of the file after a restart): what a token that left the book is carried from
  let lastSnapshot: Snapshot | null | undefined;
  const recordEquity = (book: Book): void => {
    const now = localNow();
    if (now - lastEquityAtMs < EQUITY_EVERY_MS) return;
    try {
      mkdirSync(dir, { recursive: true });
      if (lastSnapshot === undefined) lastSnapshot = linesOf(equityPath).filter((l) => l.trim() !== "").slice(-1).map(parseSnapshotLine)[0] ?? null;
      const snapshot = snapshotOf(book, now, lastSnapshot);
      appendFileSync(equityPath, `${JSON.stringify(snapshot)}\n`);
      lastSnapshot = snapshot;
      lastEquityAtMs = now;
    } catch {
      // a measurement that could not be saved is skipped; nothing depends on it being there
    }
  };
  /** Writes the settlement of an order in flight; false when it is not in flight. Whoever settles it (the person's word, or the wallet's balance) leaves the same trace. */
  const settleOrder = (orderKey: string, outcome: "executada" | "falhou", reason?: string, ref?: string): boolean => {
    const record = ledger.inFlightRecords().find((r) => r.orderKey === orderKey);
    if (!ledger.resolve(orderKey, outcome, localNow(), reason, ref)) return false;
    // the half the plan takes at the target, said to have gone out: it is not taken again
    if (outcome === "executada" && record !== undefined && record.source === "protecao" && record.stance === "trim_half" && halfDone(ledger.orderRecords(), planKey(record.chainIndex, record.address), plans.get(planKey(record.chainIndex, record.address))?.entryAtMs ?? 0)) plans.markTrimmed(planKey(record.chainIndex, record.address));
    return true;
  };
  let analysisMemo: { readonly at: number; readonly value: AnalysisView } | null = null;
  // set by close(): the cycle in flight sends nothing more, and no new one begins
  let closing = false;
  let closed: Promise<void> | null = null;

  const state = createAgentState({ ...agentStateFile(join(dir, "state.json")), now: localNow });
  const configStore = createConfigStore(configFile(join(dir, "config.json")));
  const ledger = createFileAgentLedger(join(dir, "ledger.jsonl"));
  const mandateStore = createMandateStore(mandateFileStore(join(dir, "mandate.json")));
  const plans = createPlanStore(planFileStore(join(dir, "plans.json")));
  // the last network fee quoted on each network (ADENDO-C, FEE-1): what the Jev is shown as the cost of a swap there
  const fees = createFeeMemory(planFileStore(join(dir, "fees.json")));
  const scoreboardPath = join(dir, "scoreboard.jsonl");
  const scoreboard = createScoreboard({
    read: () => linesOf(scoreboardPath),
    append: (line) => {
      mkdirSync(dir, { recursive: true });
      appendFileSync(scoreboardPath, `${line}\n`);
    },
  });
  // the limits are read from the configuration at every check, so a change applies at once. With the autopilot on, the daily capacity of consultations also follows the rhythm the agent keeps (a look every five
  // minutes is 288 a day): a capacity under what the rhythm needs would make the agent look half as often as it says it does. It is never taken BELOW what was configured, and the count used is not touched.
  // the rhythm is known only once the settings are built, a little further down; until then (the budget reads its limits when it is created) the capacity is the configured one
  let rhythmMin: () => number = () => Number.NaN;
  const limits: BudgetLimits = {
    get maxConsultsPerDay() {
      const configured = configStore.get().budget.maxConsultsPerDay;
      return configStore.get().auto ? Math.max(configured, consultsForRhythm(rhythmMin())) : configured;
    },
    get maxTokensPerDay() {
      return configStore.get().budget.maxTokensPerDay;
    },
  };
  const budgetIo = jsonIo<BudgetState>(join(dir, "budget.json"));
  const budget = createBudget({ limits, now: localNow, load: budgetIo.read, persist: budgetIo.write, pace: true });

  // the wallets
  const balances: BalanceSource =
    options.balances ?? {
      async balances(address, chains) {
        const credentials = options.store.credentials().okx;
        if (credentials === null) throw new Error("sem_credenciais");
        const client = createOkxPortfolioClient({ credentials: { apiKey: credentials.apiKey, secretKey: credentials.secret, passphrase: credentials.passphrase }, fetcher: fetchImpl as never, now: () => new Date(options.now()), allowLiveRequests: true });
        return client.allTokenBalances(address, [...chains]);
      },
    };
  let lastBook: Book | null = null;
  /** The owner's policy as the signing tool last reported it: the autopilot never plans to spend what it would refuse. */
  let lastPolicy: PolicyMirror | null = null;

  /** The shadow has measured an edge over keeping dollars in the last days: only then is the aggressive stance open to the model. */
  const aggressiveOpen = (): boolean => {
    // the owner's bold profile opens it: the agent does not wait to be measured
    if (ownerProfile === "arrojado") return true;
    const now = localNow();
    const week = scoreboard.summary(now, now - DISCIPLINE.evidenceDays * 24 * 3_600_000);
    // either experiment may open it: a shadow window that has no claim yet (a small sample) must not hide a real one that has
    return week.byMode.sombra?.["24h"]?.claim === "acima_de_manter" || week.byMode.limitado?.["24h"]?.claim === "acima_de_manter";
  };
  // the settings are worked out from what is known and from the mandate the model chose; they are kept for a few seconds because a cycle asks for them many times
  let settingsCache: { readonly atMs: number; readonly value: EffectiveSettings; readonly open: boolean } | null = null;
  const ownerProfile: OwnerProfile = options.ownerProfile ?? OWNER_PROFILE;
  // the interval between looks: the rhythm, shortened to two minutes while the market is hot (only with the autopilot on: a manual configuration keeps its own)
  // the quick rhythm is paid in calls to the data provider: it lasts while the day's use stays under the fair burn of the day (autopilot.ts `hotWithinQuota`)
  const withinQuota = (): boolean => {
    // a gateway that does not count (a stand-in) has no quota to respect
    if (typeof options.gateway.budget !== "function") return true;
    try {
      const tiers = options.gateway.budget().tiers;
      return hotWithinQuota({ basic: tiers.basic, premium: tiers.premium }, localNow());
    } catch {
      return false;
    }
  };
  // under the owner's bold profile the hot interval is the fastest the day's capacity of consultations can pay (autopilot.ts `boldHotIntervalMin`): what is left of the capacity over what is left of the UTC day, never under one minute.
  // The capacity itself still covers one look every `HOT_INTERVAL_MIN` minutes (`rhythmMin` below), so the cap is the limit; every other profile keeps the two minutes.
  const hotIntervalNow = (): number => {
    if (ownerProfile !== "arrojado") return HOT_INTERVAL_MIN;
    const s = budget.status();
    const now = localNow();
    return boldHotIntervalMin({ remainingConsults: s.limits.maxConsultsPerDay - s.consults, remainingMs: 86_400_000 - (((now % 86_400_000) + 86_400_000) % 86_400_000) });
  };
  const intervalNow = (): number => (configStore.get().auto ? effectiveIntervalMin(settings().intervalMin, marketHot() && withinQuota(), hotIntervalNow()) : settings().intervalMin);
  const settings = (): EffectiveSettings => {
    const now = localNow();
    if (settingsCache !== null && now - settingsCache.atMs < 10_000) return settingsCache.value;
    const open = aggressiveOpen();
    const value = deriveSettings(configStore.get(), { capitalUsd: lastBook?.agentUsd ?? null, policy: lastPolicy, evidenceOk: open }, mandateStore.get().mandate, ownerProfile);
    settingsCache = { atMs: now, value, open };
    return value;
  };
  const forgetSettings = (): void => {
    settingsCache = null;
  };
  // the capacity covers the fastest rhythm the agent may keep: under the bold profile that is the hot interval, because the agent looks every two minutes while the market has something to offer
  rhythmMin = () => (ownerProfile === "arrojado" ? Math.min(settings().intervalMin, HOT_INTERVAL_MIN) : settings().intervalMin);
  const bookReader = createBookReader({ config: () => ({ ...configStore.get(), chains: settings().chains }), source: balances, now: localNow });

  // what is read about them and the market
  const factsReader = createHoldingFactsReader({ gateway: options.gateway, plans, now: localNow });
  const timingReader = createTimingReader({ gateway: options.gateway, now: localNow });
  const momentumReader = createMomentumReader({ gateway: options.gateway, now: localNow, ttlMs: 2 * 60_000 });
  // the market is HOT while a position plan is open, or while the last cycle found a purchase open or a level of risk that would open one: the scan is then read every five minutes (matching the gateway TTL) and the agent looks every two minutes
  const marketHot = (): boolean => {
    if (plans.all().length > 0) return true;
    const last = cycles.last();
    if (last === null) return false;
    return (last.view ?? []).some((v) => v.kind === "buy" && v.closed === null) || Object.values(last.opened ?? {}).some((n) => n > 0);
  };
  const ecosystemReader = createEcosystemReader({ source: options.source, now: localNow, hot: marketHot, hotTtlMs: 5 * 60_000 });
  const systemOneFile = options.systemOneFile ?? join(options.dataDir, "system-one", "latest.json");
  const marketContext = createMarketContext({
    candles: options.publicCandles ?? okxPublicCandles(fetchImpl),
    derivatives: options.publicDerivatives ?? okxPublicDerivatives(fetchImpl),
    systemOne: () => {
      try {
        return existsSync(systemOneFile) ? (JSON.parse(readFileSync(systemOneFile, "utf8")) as unknown) : null;
      } catch {
        return null;
      }
    },
    now: localNow,
  });
  const priceLookup = createPriceLookup({ gateway: options.gateway });

  // the signing tool, behind its guard and its hash
  const home = join(dir, "onchainos-home");
  const sha256 = options.sha256File ?? realSha256File;
  // the path in the configuration may not resolve for this process (another view of the profile folder): the same file in the agent's own folder is used then, and the hash of the person still decides
  const cliPath = (): string | null => resolveCliPath(configStore.get().cli.path, dir);
  const binary = {
    get path() {
      return cliPath();
    },
    get expectedSha256() {
      return configStore.get().cli.sha256;
    },
    sha256File: sha256,
  };
  const lazy: CliRunner = {
    run: (args, o) => {
      const path = cliPath();
      if (path === null) throw new Error("binario_divergente");
      return (options.processRunner ?? createProcessRunner({ binary: path, home })).run(args, o);
    },
  };
  const runner = createGuardedRunner(createVerifiedRunner(lazy, binary));
  // the session of the tool is looked at again before each order, not only once per cycle: a cycle can last minutes and the session keeps running out
  const sessionLeftMs = (): number | null => {
    const text = readTextFile(join(home, "session.json"));
    if (text === null) return null;
    try {
      const raw = Number((JSON.parse(text) as { sessionKeyExpireAt?: unknown }).sessionKeyExpireAt);
      if (!Number.isFinite(raw) || raw <= 0) return null;
      return (raw < 1e12 ? raw * 1000 : raw) - localNow();
    } catch {
      return null;
    }
  };
  // the book the executor settles in: the one a full cycle published, else the one the guard read (right after a start the guard may be the first to look)
  let guardBook: Book | null = null;
  // the allowlisted facts of the quote of each order (quote-facts.ts), handed over by the executor as it reads the quote and written on the order record by the cycle; the newest few hundred are kept, in memory only
  const quotes = new Map<string, QuoteFacts>();
  // the read-only quote of an entry, for the closing: the same tool and the same guard as the executor, asked for the quote only
  // the durable record of the answers and of the price path, for the laboratory (recording.ts): append only, derived, no new request, best effort
  const recorders = options.recording === false ? null : createRecorders({ dir, now: localNow });
  const entryQuoter = createEntryQuoter({ runner, config: () => configStore.get(), book: () => lastBook ?? guardBook, timeoutMs: 30_000, now: localNow });
  const executor: Executor = createCliExecutor({
    runner,
    config: () => configStore.get(),
    book: () => lastBook ?? guardBook,
    timeouts: { quoteMs: 30_000, executeMs: 90_000 },
    sessionLeftMs,
    onQuote: (key, facts, order) => {
      quotes.delete(key);
      quotes.set(key, facts);
      while (quotes.size > 300) quotes.delete(quotes.keys().next().value!);
      fees.observe(order.chainIndex, facts, order.side === "buy" ? "cotacao_de_compra" : "cotacao_de_venda");
    },
    now: localNow,
  });
  // an order whose answer never came is looked up in the tool's own history and settled ONLY by a receipt bound to it (reconcile.ts): a balance and a clock prove nothing
  const reconcileMemory = newReconcileMemory();
  // when the tool's history does not know a Solana hash the agent already holds (the service down, or behind), the public chain is asked for exactly that signature, read only (src/server/solana-receipts.ts)
  const solanaReader = options.solanaReceipts ?? createSolanaReceiptReader({ fetch: fetchImpl });
  const receiptLookup = withSolanaReceiptFallback(
    createReceiptLookup({ runner, walletOf: (chainIndex) => (chainIndex === "501" ? configStore.get().managed.solana : configStore.get().managed.evm) }),
    solanaReader,
    () => configStore.get().managed.solana,
  );
  // what really moved in each executed Solana order (the token and the dollars of stablecoin that went the other way), read once from the final transaction and kept: the model reads the round trips as percentages of what went out
  const fillsPath = join(dir, "fills.jsonl");
  const fills = createFillStore({
    read: () => linesOf(fillsPath),
    append: (line) => {
      mkdirSync(dir, { recursive: true });
      appendFileSync(fillsPath, `${line}
`);
    },
  });
  const fillTries = new Map<string, number>();
  const FILL_RETRY_MS = 5 * 60_000;
  const FILL_WINDOW_MS = 7 * 24 * 3_600_000;
  const captureFills = async (signal: AbortSignal): Promise<void> => {
    const wallet = configStore.get().managed.solana;
    if (wallet === null) return;
    const now = localNow();
    let asked = 0;
    for (const o of ledger.orderRecords()) {
      if (asked >= 2 || signal.aborted) break;
      if (o.stage !== "executada" || o.wallet !== "agente" || o.chainIndex !== "501" || o.ref === null || fills.has(o.orderKey) || now - o.atMs > FILL_WINDOW_MS) continue;
      if (now - (fillTries.get(o.orderKey) ?? 0) < FILL_RETRY_MS) continue;
      fillTries.set(o.orderKey, now);
      asked += 1;
      try {
        const evidence = await solanaReader({ signature: o.ref, wallet }, signal);
        const fill = evidence === null ? null : fillFrom(o, evidence);
        if (fill !== null) fills.add(fill);
      } catch {
        // an outage or a file that did not take it: it is asked again later, and nothing is invented
      }
    }
  };
  // an order the tool refused after the broadcast and printed no signature for: the wallet's own transaction that moved exactly what the order moved, if exactly one did, found read only on the public chain
  const swapFinder = options.solanaSwaps ?? createSolanaSwapFinder({ fetch: fetchImpl });
  const recoverRef: RefRecovery = async (order, signal) => {
    const wallet = configStore.get().managed.solana;
    if (order.chainIndex !== "501" || wallet === null) return null;
    // the record of an uncertain order is the one written after the tool returned, up to a minute and a half after the send: the window starts well before it
    const found = await swapFinder({ wallet, sinceMs: order.atMs - 180_000, side: order.side, mint: order.address, amountMinor: order.amountMinor, usd: order.usd }, signal);
    return found === null ? null : { ref: found.signature };
  };
  const reconcileReceipts = async (signal: AbortSignal): Promise<void> => {
    if (!lock.held() || !state.get().connected) return;
    const inFlight = ledger.inFlightRecords();
    if (inFlight.length > 0) {
      try {
        for (const r of await settleByReceipts(inFlight, receiptLookup, localNow(), reconcileMemory, signal, recoverRef)) settleOrder(r.orderKey, r.outcome, r.reason, r.ref);
      } catch {
        // the ledger could not take the settlement: the order stays in flight and is looked up again
      }
    }
    await captureFills(signal);
  };
  const readLimitedFacts = createLimitedFactsReader({
    runner,
    config: () => configStore.get(),
    home,
    readText: readTextFile,
    binaryOk: async () => (binary.path === null || binary.expectedSha256 === null ? null : binaryMatches(binary)),
    now: localNow,
    cycleBudgetMs: TIMEOUTS.orderMs + 30_000,
    localSkewMs:
      options.localSkewMs ??
      ((): number | null => {
        const s = okxClockStatus();
        return s.offsetMs === null ? null : -s.offsetMs;
      }),
  });

  // the facts of the money side cost two runs of the tool and a hash of the binary: the guard asks every few seconds, so what was read less than a minute ago is reused. An unread or unusable result is never kept.
  let limitedCache: { readonly atMs: number; readonly value: NonNullable<Awaited<ReturnType<typeof readLimitedFacts>>> } | null = null;
  const limitedFacts = async () => {
    if (limitedCache !== null && localNow() - limitedCache.atMs < LIMITED_FACTS_TTL_MS) return limitedCache.value;
    const facts = await readLimitedFacts();
    if (facts?.policy != null) lastPolicy = facts.policy;
    // only facts that are all there are kept: a read that timed out in one place (no policy, no session, an address or a binary that did not check) is asked again at the next look
    const usable = facts !== null && facts.binaryOk === true && facts.addressMatches === true && facts.sessionExpiresAtMs !== null && (facts.policy !== null || !policyRequired());
    limitedCache = usable ? { atMs: localNow(), value: facts } : null;
    return facts;
  };

  // the Agentic Wallet the agent trades from: what is known of it, and the steps that connect it
  let loginUrl: string | null = null;
  let loginWaiting = false;
  let account: { readonly atMs: number; readonly value: AccountStatus | null } | null = null;
  let accountReading = false;
  const refreshAccount = async (): Promise<void> => {
    if (accountReading || configStore.get().cli.path === null) return;
    accountReading = true;
    try {
      const value = await readAccountStatus(runner, AbortSignal.timeout(25_000));
      account = { atMs: localNow(), value };
      if (value?.loggedIn === true) {
        loginWaiting = false;
        // signed in but the Agentic Wallet was never adopted (the person was faster than the page's poll, or the app restarted in between): the agent adopts it by itself, for a person who connected
        if (state.get().connected && configStore.get().managed.kind !== "agentica") void adoptAccount();
      }
    } catch {
      account = { atMs: localNow(), value: null };
    } finally {
      accountReading = false;
    }
  };
  let adopting: Promise<WalletSetupResult> | null = null;
  /** The account's Agentic Wallet becomes the wallet the agent manages, and the person's own wallet, if it was the managed one, stays in the picture as a wallet that is only read. One at a time: a second caller gets the answer of the first. */
  const adoptAccount = (): Promise<WalletSetupResult> => {
    if (adopting !== null) return adopting;
    const work = adoptNow();
    adopting = work;
    const done = (): void => {
      if (adopting === work) adopting = null;
    };
    work.then(done, done);
    return work;
  };
  const adoptNow = async (): Promise<WalletSetupResult> => {
    {
      const found = await readAddresses(runner, AbortSignal.timeout(25_000));
      if (found === null) return { ok: false, reason: "sem_enderecos" };
      const current = configStore.get();
      const same = current.managed.kind === "agentica" && current.managed.evm === found.evm && current.managed.solana === found.solana;
      if (modeNow() === "limitado" && !same) return { ok: false, reason: "parar_antes_de_trocar_carteira" };
      const previous = current.managed;
      const watch = previous.kind === "propria" && (previous.evm !== null || previous.solana !== null) && current.watch.evm === null && current.watch.solana === null ? { evm: previous.evm, solana: previous.solana } : current.watch;
      const changed = configStore.update({ managed: { kind: "agentica", evm: found.evm, solana: found.solana }, watch });
      loginWaiting = false;
      loginUrl = null;
      forgetSettings();
      account = null;
      return changed.ok ? { ok: true, wallet: walletView() } : { ok: false, reason: "carteira_invalida" };
    }
  };
  const walletView = (): WalletSetupView => {
    const c = configStore.get();
    const cli = c.cli.path !== null && c.cli.sha256 !== null ? "instalado" : "ausente";
    // the tool is asked in the background, at most every half minute: the status never waits for a process
    if (cli === "instalado" && (account === null || localNow() - account.atMs > 30_000)) void refreshAccount();
    const status = account?.value ?? null;
    const login: WalletSetupView["login"] = cli === "ausente" ? "nao_iniciado" : status === null ? (loginWaiting ? "aguardando" : "desconhecido") : status.loggedIn === true ? "logado" : loginWaiting ? "aguardando" : "nao_iniciado";
    const agentic = c.managed.kind === "agentica";
    const fundsUsd = agentic ? (lastBook?.agentUsd ?? null) : null;
    // "ok" means the owner set at least one limit in the portal: an extra backstop. None set is a fact, not a fault: the agent runs on its own caps.
    const policy: WalletSetupView["policy"] = status === null ? "desconhecida" : status.policy !== null && (status.policy.perTxUsd !== null || status.policy.dailyTradeUsd !== null) ? "ok" : "ausente";
    let next: WalletSetupView["next"];
    if (cli === "ausente") next = "instalar";
    else if (!agentic || login !== "logado") next = "entrar";
    // an unread wallet is not an empty one: only a reading that came back small asks for a deposit
    else if (fundsUsd !== null && fundsUsd < 10) next = "depositar";
    else if (policyRequired() && !(status !== null && status.policy !== null && status.policy.perTxUsd !== null && status.policy.dailyTradeUsd !== null && status.policy.dailyTransferUsd !== null)) next = "definir_politica";
    else next = "operando";
    // (only the time left leaves the folder of the tool: the session key never does)
    return { cli, login, loginUrl: login === "aguardando" ? loginUrl : null, agentic, address: agentic ? c.managed.evm : null, solanaAddress: agentic ? c.managed.solana : null, policy, fundsUsd, sessionLeftMs: cli === "instalado" ? sessionLeftMs() : null, next };
  };
  const defaultInstall = (cliDir: string): Promise<InstallResult> =>
    installCli({
      fetch: (url) => fetchImpl(url),
      platform: process.platform,
      arch: process.arch,
      dir: cliDir,
      sha256: (bytes) => createHash("sha256").update(bytes).digest("hex"),
      pinned: PINNED_SHA256,
      makeExecutable: (path) => chmodSync(path, 0o755),
      write: (path, bytes) => {
        mkdirSync(dirname(path), { recursive: true });
        const tmp = `${path}.${process.pid}.tmp`;
        writeFileSync(tmp, bytes);
        renameSync(tmp, path);
      },
      join,
    });

  const freshPrice =
    options.freshPrice ??
    (async (chainIndex: string, address: string, signal: AbortSignal): Promise<number | null> => {
      if (signal.aborted) return null;
      const result = await options.gateway.callInternal("/onchain/price", { chainIndex, token: address }, "background");
      if (!result.ok || !Array.isArray(result.data)) return null;
      const price = (result.data[0] as { price?: unknown } | undefined)?.price;
      return typeof price === "number" && Number.isFinite(price) && price > 0 ? price : null;
    });

  // the model: Jev, through the key in the vault; none without it
  const jev = createJevAgentModel({ apiKey: () => options.store.credentials().typesafeAiApiKey });
  const modelFor = (): AgentModel | null => {
    if (options.model !== undefined) return typeof options.model === "function" ? options.model() : options.model;
    return options.store.credentials().typesafeAiApiKey === null ? null : jev;
  };

  let seq = 0;
  const newId = options.newId ?? (() => `cy-${localNow().toString(36)}-${(++seq).toString(36)}`);
  const clockSkewMs =
    options.clockSkewMs ??
    ((): number | null => {
      const s = okxClockStatus();
      return s.offsetMs === null ? null : okxNowMs() - (Date.now() + s.offsetMs);
    });

  /** What the agent may do with the money right now: nothing while no wallet is connected; analysing and measuring once one is; trading as soon as the money side is ready. There is no switch. */
  const runState: RunState = {
    get: () => ({ mode: modeNow(), stopped: closing }),
  };

  // a fact the guard sees between two cycles (a held token that moved by half of its plan's stop distance since the price the model last read) asks for another look through the SAME flight of the scheduler; the dispatcher is
  // the Codex's (decision-review/events.ts) and only carries facts. It never decides anything and never opens a purchase by itself: the cycle it asks for is the ordinary one, with the ordinary budget, pacing and caps.
  /** The price of each held token at the last look of the model, and the one a cycle is reading right now (it becomes the former only if the model was really consulted). */
  let lookedAt: ReadonlyMap<string, number> = new Map();
  let lookingAt: ReadonlyMap<string, number> = new Map();
  const eventMinGapMs = options.eventMinGapMs ?? EVENT_MIN_GAP_MS;
  // readiness only (event-source.ts `eventsAllowed`): a day whose budget is already spent does not pay a sweep of the wallet and the market for a look the model cannot take
  const eventAdmission = (): boolean =>
    eventsAllowed({
      connected: state.get().connected,
      lockHeld: lock.held(),
      closing,
      auto: configStore.get().auto,
      lastCycleAtMs: scheduler.status().lastAtMs,
      nowMs: localNow(),
      minGapMs: eventMinGapMs,
      budgetOk: budget.check(EVENT_TOKEN_ESTIMATE).ok,
    });
  const events = createOpportunityDispatcher({
    now: localNow,
    allowed: eventAdmission,
    request: () => scheduler.requestCycle(),
  });
  // the macro market context (OFF unless the host gives a pulse): the SAME admission, the SAME flight of the scheduler, and an acknowledgement that is only ever the proof of the look that was made
  let macroEvents: ReturnType<typeof createContextOpportunityDispatcher> | null = null;
  const macro: MacroContext | null =
    options.pulse === undefined
      ? null
      : createMacroContext({ pulse: options.pulse, now: localNow, maxAgeMs: MACRO_EVENT_MAX_AGE_MS, notify: (event) => macroEvents?.notify(event) });
  const macroBridge: MacroBridge | null = macro === null ? null : createMacroBridge({ macro, requestCycle: () => scheduler.requestCycle() });
  if (macroBridge !== null) macroEvents = createContextOpportunityDispatcher({ now: localNow, maxAgeMs: MACRO_EVENT_MAX_AGE_MS, allowed: eventAdmission, request: (batch) => macroBridge.request(batch) });

  const cycles = createCycleRunner({
    state: runState,
    ledger,
    budget,
    scoreboard,
    plans,
    model: modelFor,
    executor,
    now: localNow,
    newId,
    stopFilePresent: () => existsSync(stopPath),
    canRun: () => (lock.held() ? null : "outra_instancia"),
    freshPrice,
    clockSkewMs,
    buyingPaused: () => isPaused(state.get(), localNow()),
    requireOwnerPolicy: policyRequired,
    onGuardBook: (b) => {
      guardBook = b;
      recorders?.recordBook(b, "guard");
      for (const e of priceMoveEvents({ looked: lookedAt, book: b, plans, nowMs: localNow() })) events.notify(e);
    },

    readBook: (signal) => bookReader.read(signal),
    // only the verified view is shown and used to pick a settlement coin: a claimed value nobody could pay is never displayed as capital
    onBook: (book) => {
      lastBook = book;
      recorders?.recordBook(book, "look");
      lookingAt = pricesOf(book);
      recordEquity(book);
    },
    holdingFacts: (book, signal) => factsReader.read(book, signal),
    ecosystem: async (saldo, signal) => {
      const eco = await ecosystemReader.read(saldo, signal);
      recorders?.recordEco(eco);
      return eco;
    },
    timingOf: (facts, signal) => timingReader.read(facts, signal),
    momentumOf: (facts, signal) => momentumReader.read(facts, signal),
    context: () => marketContext.get(),
    ...(macroBridge === null ? {} : { macro: macroBridge.port }),
    // the model reads its own measured record: how often each kind of decision beat the alternative one hour later, from the last two weeks
    execFacts: () => execBrief(fills.all()),
    ...(options.memory === undefined || !options.memory.enabled
      ? {}
      : {
          memoryHook: (ask: { readonly asOfMs: number; readonly cycleId: string; readonly itemIds: readonly string[] }) => {
            const memory = options.memory!;
            // the cohort is explicit: the latest cycles of the ledger before this one, never the whole history
            const cohortCycleIds = ledger.tail(MEMORY_TAIL_FOR_COHORT).flatMap((r) => (r.kind === "cycle" && r.cycleId !== ask.cycleId ? [r.cycleId] : [])).slice(-(memory.cohortSize ?? 24));
            return buildMemoryBrief(
              { enabled: true, asOfMs: ask.asOfMs, cycleId: ask.cycleId, arm: memory.arm ?? "A", cohortCycleIds, itemIds: ask.itemIds, ...(memory.maxBytes === undefined ? {} : { maxBytes: memory.maxBytes }) },
              { read: memory.read, clock: memory.clock ?? (() => performance.now()) },
            );
          },
        }),
    tokenTrips: () => tokenTripsBrief(fills.all(), localNow()),
    feeOf: (chainIndex) => {
      const fee = fees.get(chainIndex);
      return fee === undefined ? null : { usd: fee.tradeFeeUsd, ageMin: fees.ageMinutes(chainIndex, localNow()) };
    },
    quoteOf: (key) => quotes.get(key) ?? null,
    history: () => {
      const briefsPath = join(dir, "briefs.jsonl");
      const facetsByCycle = new Map<string, Record<string, Record<string, number>>>();
      for (const l of linesOf(briefsPath)) {
        if (l.trim() === "") continue;
        try {
          const parsed = JSON.parse(l) as { cycleId?: unknown; facets?: unknown };
          if (typeof parsed.cycleId === "string" && parsed.facets !== null && typeof parsed.facets === "object" && !Array.isArray(parsed.facets)) {
            facetsByCycle.set(parsed.cycleId, parsed.facets as Record<string, Record<string, number>>);
          }
        } catch {
          // ignore malformed line
        }
      }
      const record = scoreboard.record("1h", localNow(), localNow() - 14 * 24 * 3_600_000, (cId, candId) => facetsByCycle.get(cId)?.[candId]);
      return Object.keys(record).length === 0 ? null : record;
    },
    onConsult: (entry, meta) => {
      recorders?.recordConsult(entry, meta);
      let line = "";
      try {
        const path = join(dir, "briefs.jsonl");
        mkdirSync(dir, { recursive: true });
        const kept = linesOf(path).filter((l) => l.trim() !== "").slice(-(BRIEFS_KEPT - 1));
        line = JSON.stringify(entry);
        writeFileSync(path, [...kept, line].join("\n") + "\n");
      } catch {
        // a record that could not be kept costs nothing
        return;
      }
      // the metadata of the decision, in a journal of its own and never inside the record that is hashed (ADENDO-D, V2-4): the hash of that exact line, the full hash of the Brief, the clocks as they were read
      if (meta === undefined) return;
      try {
        const metadata = decisionMetadata({
          recordLine: line,
          snapshotHash: meta.briefHash,
          decisionVersion: decisionVersionOf({ criteria: entry.criteria, legend: effectiveLegend(entry.legend, entry.brief.memoria), briefVersion: entry.briefVersion, model: meta.model, questions: questionsDigest() }),
          evaluatorHash: placarEvaluatorHash(),
          factAvailableAtMs: meta.factAvailableAtMs,
          askedAtMs: meta.askedAtMs,
          answeredAtMs: meta.answeredAtMs,
          recordedAtMs: localNow(),
        });
        if (metadata === null) return;
        const path = join(dir, "decisions-meta.jsonl");
        const kept = linesOf(path).filter((l) => l.trim() !== "").slice(-(BRIEFS_KEPT - 1));
        writeFileSync(path, [...kept, JSON.stringify({ cycleId: entry.cycleId, atMs: entry.atMs, metadata })].join("\n") + "\n");
      } catch {
        // metadata that could not be kept costs nothing
      }
    },
    // the closing of the purchases the model leaned to (closing-phase.ts), in shadow: the entry is quoted read only and the model asked one closed question, in the same budget; what it would say is kept in `closings.jsonl`
    ...(options.closing === false
      ? {}
      : {
          closing: {
            quoter: entryQuoter,
            record: (record) => {
              try {
                const path = join(dir, "closings.jsonl");
                mkdirSync(dir, { recursive: true });
                const kept = linesOf(path).filter((l) => l.trim() !== "").slice(-(CLOSINGS_KEPT - 1));
                writeFileSync(path, `${[...kept, JSON.stringify(record)].join("\n")}\n`);
              } catch {
                // a record that could not be kept costs nothing
              }
            },
            maxPerCycle: 2,
            timeouts: { quoteMs: 30_000, modelMs: TIMEOUTS.modelMs },
            phaseMs: CLOSING_PHASE_MS,
            // the primary looks the rest of the UTC day still needs at the cadence in force: the second look spends only what is left after them
            reserveForPrimaries: () => {
              const now = localNow();
              const intervalMs = Math.max(60_000, intervalNow() * 60_000);
              const untilMidnight = 86_400_000 - (((now % 86_400_000) + 86_400_000) % 86_400_000);
              return Math.ceil(untilMidnight / intervalMs);
            },
          },
        }),
    riskPct: () => settings().riskPct,
    // the price impact of the entry quote, read before the model is asked so that it is not offered plans the executor will refuse (entry-cost.ts): the same read-only quote of the closing, never signed, never sent
    ...(options.closing === false
      ? {}
      : {
        entryCost: cachedEntryQuoteReader(async (order, signal) => {
            const read = await entryQuoter.read(order, { cycleId: "sonda", requestId: `sonda-${localNow()}`, signal });
          return read.ok ? { impactPct: impactOfQuote(read.raw), refusal: null } : { impactPct: null, refusal: read.reason === "gas_station_pendente" ? "gas_station_pendente" : null };
          }, localNow),
        }),
    boldConviction: () => ownerProfile === "arrojado",
    reserveShare: () => settings().reserveShare,
    mandate: () => ({ mandate: settings().mandate, aggressiveOpen: settingsCache?.open ?? aggressiveOpen() }),
    onMandate: (wanted) => {
      mandateStore.apply(wanted, localNow());
      forgetSettings();
    },
    get caps() {
      return settings().caps;
    },
    limitedFacts,
    ...(options.minBuyUsd === undefined ? {} : { minBuyUsd: options.minBuyUsd }),
    get refreshMs() {
      return settings().refreshMin * 60_000;
    },
    timeouts: TIMEOUTS,
  });

  // the watch between the cycles looks the history up too (reconcile.ts paces the lookups): a stop held back by an order in flight is freed by the next look at the receipt, not by the next full cycle
  const watch = {
    ...cycles,
    async guard(): Promise<CycleReport> {
      await reconcileReceipts(AbortSignal.timeout(30_000));
      const out = await cycles.guard();
      // a fact held back (the gap since the last cycle was not gone, the budget not ready) is looked at again after each pass of the guard, which is when the same fact is seen again; no await: this pass never waits for the
      // cycle it may start (that cycle waits for THIS pass instead, in the scheduler)
      events.wake();
      macroEvents?.wake();
      return out;
    },
  };

  const scheduler = createScheduler({
    runner: watch,
    guardEveryMs: options.guardEveryMs ?? GUARD_EVERY_MS,
    // after a start: soon if the last cycle is older than an interval (the screen should not wait to see the wallet), later if one just ran (a restart does not repeat it)
    firstDelayMs: () => {
      const intervalMs = intervalNow() * 60_000;
      const lastCycle = [...ledger.tail(50)].reverse().find((r) => r.kind === "cycle");
      if (lastCycle === undefined) return FIRST_CYCLE_MS;
      return Math.min(intervalMs, Math.max(FIRST_CYCLE_MS, lastCycle.atMs + intervalMs - localNow()));
    },
    state: runState,
    config: () => ({ ...configStore.get(), intervalMin: intervalNow() }),
    now: localNow,
    schedule: options.schedule ?? ((ms, fn) => {
      const timer = setTimeout(fn, ms);
      return () => clearTimeout(timer);
    }),
    before: async () => {
      await reconcileReceipts(AbortSignal.timeout(30_000));
      // the default measurement goes through the fetch this service was given (never the global one); a host `syncClock` still replaces it whole
      await (options.syncClock ?? (() => syncOkxClock({ fetch: (url, init) => fetchImpl(url, init) })))().catch(() => null);
      await marketContext.refresh(AbortSignal.timeout(20_000));
    },
    after: async () => {
      // the prices the model read become the baseline of the facts only when it really read them
      if (cycles.last()?.consulted === true) lookedAt = lookingAt;
      await scoreboard.settle(localNow(), priceLookup);
      disciplineStep();
      // a fact that could not be reviewed for want of readiness is looked at again now that a cycle has ended
      events.wake();
      macroEvents?.wake();
    },
  });
  if (options.start === true) scheduler.start();
  // the pulse is read every few seconds for material facts, with the scheduler's own timer; a closed service reads nothing more
  let cancelMacroPoll: (() => void) | null = null;
  const armMacroPoll = (): void => {
    const timerOf =
      options.schedule ??
      ((ms: number, fn: () => void) => {
        const timer = setTimeout(fn, ms);
        return () => clearTimeout(timer);
      });
    cancelMacroPoll = timerOf(MACRO_POLL_MS, () => {
      if (closing) return;
      macro?.poll();
      armMacroPoll();
    });
  };
  if (options.start === true && macro !== null) armMacroPoll();

  /**
   * The agent's own discipline (AUT-31), after each cycle and its measurements: a pause that has run its time is lifted, and a loss or a measurement that turned against the trading opens the circuit breaker, which
   * pauses the NEW purchases for a day (exits and stops go on). Only the process that holds the folder decides.
   */
  const disciplineStep = (): void => {
    if (!lock.held()) return;
    const now = localNow();
    const s = state.get();
    if (s.pausedUntilMs !== null && !isPaused(s, now)) state.resume("retomou");
    if (!state.get().connected) return;
    // a pause the first version of the rule wrote from the Placar (a measurement against an alternative that did not happen) is looked at again: lifted by the agent itself, with the event on the record and its reason
    if (isPaused(state.get(), now) && lapsedPause(state.get().pauseReason, modeNow() === "limitado")) {
      state.resume("pausa_reavaliada");
      forgetSettings();
    }
    let reason: string | null = null;
    // what the wallet REALLY lost, costs and failed exits included, is the only thing the breaker reads (the Placar measures decisions against alternatives that did not happen and is never a trigger)
    if (modeNow() === "limitado" && !isPaused(state.get(), now)) {
      try {
        const readings = linesOf(equityPath).slice(-3000).map(parseSnapshotLine).filter((r): r is NonNullable<typeof r> => r !== null);
        const orders = ledger.tail(500).filter((r): r is Extract<typeof r, { kind: "order" }> => r.kind === "order");
        reason = equityPause(readings, tradesOf(orders), now);
      } catch {
        // a series that cannot be read says nothing: the breaker does not trip on it
      }
    }
    if (reason !== null) {
      state.pause(now + DISCIPLINE.pauseMs, reason);
      forgetSettings();
    }
  };

  const modeNow = (): Mode => {
    if (!state.get().connected) return "desligado";
    return readiness().limitado.length === 0 ? "limitado" : "sombra";
  };

  const readiness = (): Readiness => {
    const c = configStore.get();
    const credentials = options.store.credentials();
    const base: string[] = [];
    if (c.managed.evm === null && c.managed.solana === null) base.push("carteira_gerida");
    if (credentials.okx === null) base.push("credenciais_okx");
    // the model is what ANALYSES: without it the agent has nothing to decide, but what it holds is still protected by the plans' stops, which need no model, so the key is no part of the money mode
    const noModel = modelFor() === null;
    return {
      sombra: noModel ? [...base, "chave_do_modelo"] : base,
      limitado: [...base, ...(c.cli.path === null || c.cli.sha256 === null ? ["cli_instalado"] : []), ...(c.managed.kind === "agentica" ? [] : ["carteira_agentica"])],
    };
  };

  /** What is really in force now, which is not what the derived mode says (the mode is what the agent is ELIGIBLE to do): off, analysis with the reason, or money. */
  const authorityView = (): AuthorityView => {
    const ownerPolicy: AuthorityView["ownerPolicy"] = policyRequired() ? "exigida" : "dispensada";
    if (!state.get().connected) return { level: "desligado", blocked: null, ownerPolicy };
    const missing = readiness().limitado;
    if (missing.length > 0) return { level: "analise", blocked: missing[0]!, ownerPolicy };
    const wallet = walletView();
    // (before the account has been read once, "not signed in" would be a claim nobody checked)
    const byStep: Partial<Record<WalletSetupView["next"], string>> = { instalar: "cli_ausente", entrar: wallet.login === "desconhecido" ? "conta_nao_lida" : "sem_login", definir_politica: "politica_ausente" };
    const stepBlock = byStep[wallet.next];
    if (stepBlock !== undefined) return { level: "analise", blocked: stepBlock, ownerPolicy };
    // the last cycle's gate may have found what the static view cannot see (the session about to end, an address that does not match, the tool that is not the one verified)
    const last = cycles.last();
    const at = last === null || last.mode !== "sombra" ? -1 : last.notes.indexOf("execucao_bloqueada");
    const why = last !== null && at >= 0 ? (last.notes[at + 1] ?? "desconhecido") : null;
    // (a reason about the owner's limits that the person has since waived is old news: the next cycle will not repeat it)
    if (why !== null && !(ownerPolicy === "dispensada" && why.startsWith("politica_"))) return { level: "analise", blocked: why, ownerPolicy };
    return { level: "dinheiro", blocked: null, ownerPolicy };
  };

  const positionRows = (book: Book): PositionRow[] => {
    const total = book.totalUsd !== null && book.totalUsd > 0 ? book.totalUsd : null;
    return [...book.positions]
      .sort((a, b) => (b.usd ?? -1) - (a.usd ?? -1))
      .slice(0, 24)
      .map((p) => {
        const plan = plans.get(planKey(p.chainIndex, p.address));
        return {
          id: p.id,
          symbol: p.symbol,
          chainIndex: p.chainIndex,
          wallet: p.wallet,
          usd: p.usd,
          sharePct: total === null || p.usd === null ? null : Math.round((p.usd / total) * 1000) / 10,
          isCash: p.isCash,
          plan: plan === undefined || p.wallet !== "agente" ? null : planView(plan, p.priceUsd ?? null, localNow()),
        };
      });
  };

  const bookStatus = (): BookStatus | null => {
    const info = bookReader.last();
    if (info === null) return null;
    const book = lastBook;
    return {
      atMs: info.atMs,
      managedOk: info.managedOk,
      watchFailed: info.watchFailed,
      flagged: info.flagged,
      unpriced: info.unpriced,
      totalUsd: book?.totalUsd ?? null,
      agentUsd: book?.agentUsd ?? null,
      cashUsd: book === null ? 0 : Object.values(book.cashByChain).reduce((s, v) => s + v, 0),
      positions: book === null ? [] : positionRows(book),
    };
  };

  return {
    scheduler,
    status(): AgentStatus {
      const config = configStore.get();
      const summary = scoreboard.summary(localNow());
      const day = summary.windows["24h"];
      const credentials = options.store.credentials();
      return {
        state: state.get(),
        mode: modeNow(),
        authority: authorityView(),
        paused: isPaused(state.get(), localNow()),
        stopFile: existsSync(stopPath),
        config,
        health: { ledger: ledger.health(), plans: plans.health(), config: configStore.health() },
        modelConfigured: modelFor() !== null,
        credentialsConfigured: credentials.okx !== null,
        cli: { configured: config.cli.path !== null && config.cli.sha256 !== null },
        readiness: readiness(),
        wallet: walletView(),
        autopilot: { auto: config.auto, settings: settings(), mandateChangedAtMs: mandateStore.get().changedAtMs, aggressiveOpen: settingsCache?.open ?? aggressiveOpen(), ownerProfile, authorizations: { leverage: { ...OWNER_AUTHORIZATIONS.leverage, instruments: [...OWNER_AUTHORIZATIONS.leverage.instruments] } }, guards: executionGuards() },
        budget: budget.status(),
        resources: resourceView({ budget: typeof options.gateway.budget === "function" ? () => options.gateway.budget() : undefined, now: localNow }),
        scheduler: { ...scheduler.status(), intervalMin: intervalNow() },
        last: cycles.last(),
        plans: plans.all(),
        scoreboard: summary,
        evidence: { settled: day.settled, claimBasis: day.claimBasis, claim: day.claim, claimReason: day.claimReason, netUsd: day.netUsd, grossUsd: day.grossUsd },
        book: bookStatus(),
        context: marketContext.get(),
        ledger: ledger.tail(STATUS_LEDGER),
        performance: { series: equitySeries(linesOf(equityPath).slice(-4000)), record: scoreboard.record("1h", localNow(), localNow() - 14 * 24 * 3_600_000) },
        inFlight: ledger.inFlightRecords(),
        lock: lock.held(),
      };
    },
    connect(input): ConnectChange {
      // another window holds the folder: what is changed here would never reach the agent that runs
      if (!lock.held()) return { ok: false, reason: "outra_instancia" };
      // the notice first: a connection under a notice that is not the current one changes NOTHING, not even the wallet it came with
      if (input.disclosure !== DISCLOSURE) return { ok: false, reason: "aviso_desatualizado" };
      const wasConnected = state.get().connected;
      if (input.managed !== undefined) {
        const current = configStore.get();
        // the Agentic Wallet is never replaced from here (its positions keep their stops only while it is the managed wallet): the wallet the browser brings is a wallet that is only read
        const patch: ConfigPatch =
          current.managed.kind === "agentica"
            ? current.watch.evm === null && current.watch.solana === null
              ? { watch: { evm: input.managed.evm, solana: input.managed.solana } }
              : {}
            : { managed: input.managed };
        const changed = configStore.update(patch);
        forgetSettings();
        if (!changed.ok) return { ok: false, reason: "carteira_invalida" };
      }
      // the wallet is not needed to connect: the agent's own wallet comes with the sign-in that follows, and until a wallet is there the agent waits
      if (readiness().sombra.some((r) => r !== "carteira_gerida")) return { ok: false, reason: "requisitos_pendentes" };
      const result = state.connect(input.disclosure);
      if (!result.ok) return result;
      // a stop file the person placed is theirs: only the one THIS APP wrote when it disconnected goes, and only when the person is connecting (a second click while connected touches nothing)
      if (!wasConnected) {
        try {
          if (readFileSync(stopPath, "utf8").startsWith(STOP_MARK)) rmSync(stopPath, { force: true });
        } catch {
          // no file, or one that cannot be read: the status shows it, and the gate keeps blocking until it is gone
        }
      }
      // the agent starts working now, not at the next tick
      if (options.start === true) void scheduler.runNow().catch(() => null);
      return result;
    },
    async wallet(action: WalletAction): Promise<WalletSetupResult> {
      if (!lock.held()) return { ok: false, reason: "outra_instancia" };
      // installing the tool, signing in and adopting the wallet are the first things the agent does AFTER the person connected under the notice: nothing is downloaded or run before
      if (!state.get().connected) return { ok: false, reason: "nao_conectado" };
      if (action === "install") {
        // the tool that signs does not change under an agent that is trading with it
        if (modeNow() === "limitado") return { ok: false, reason: "parar_antes_de_trocar_binario" };
        const result = await (options.installCli ?? defaultInstall)(join(dir, "cli"));
        if (!result.ok) return { ok: false, reason: result.reason };
        const changed = configStore.update({ cli: { path: result.path, sha256: result.sha256 } });
        forgetSettings();
        account = null;
        return changed.ok ? { ok: true, wallet: walletView() } : { ok: false, reason: "configuracao_invalida" };
      }
      if (configStore.get().cli.path === null) return { ok: false, reason: "cli_ausente" };
      if (action === "login") {
        const started = await startLogin(runner, AbortSignal.timeout(25_000));
        if (!started.ok) return { ok: false, reason: started.reason };
        loginUrl = started.url;
        loginWaiting = true;
        return { ok: true, wallet: walletView() };
      }
      const polled = await pollLogin(runner, AbortSignal.timeout(25_000));
      if (!polled.ok) return { ok: false, reason: polled.reason };
      if (polled.state === "aguardando") return { ok: true, wallet: walletView() };
      // signed in: the account's Agentic Wallet becomes the wallet the agent manages
      return adoptAccount();
    },
    disconnect() {
      state.disconnect();
      // a window that does not hold the folder cannot reach the agent that runs: the stop file is what that agent reads before every cycle and every order
      // (and so is a disk that could not write the disconnection: the next start would read "connected" from the file, and the stop file is what it reads first)
      // (a stop file that is already there is the person's or an earlier one of this app's, and is left as it is)
      if ((!lock.held() || state.persistFailed()) && !existsSync(stopPath)) {
        try {
          mkdirSync(dir, { recursive: true });
          writeFileSync(stopPath, `${STOP_MARK}${"\n"}`);
        } catch {
          // the state already says disconnected; the file is the second layer
        }
      }
    },
    updateConfig(patch: ConfigPatch): ConfigChange {
      if (!lock.held()) return { ok: false, reason: "outra_instancia" };
      const current = configStore.get();
      // the hosted server keeps the owner's limits required whatever is asked
      if (patch.ownerPolicy === "dispensada" && options.requireOwnerPolicy === true) return { ok: false, reason: "politica_exigida_pelo_servidor" };
      // the tool that signs does not change under a running money mode
      if (patch.cli !== undefined && modeNow() === "limitado" && JSON.stringify(patch.cli) !== JSON.stringify(current.cli)) return { ok: false, reason: "parar_antes_de_trocar_binario" };
      if (patch.managed !== undefined && modeNow() === "limitado" && JSON.stringify(patch.managed) !== JSON.stringify(current.managed)) return { ok: false, reason: "parar_antes_de_trocar_carteira" };
      // raising what the agent may spend is not done while it can spend: lower the mode first (the typed phrase guards the mode, and the ceilings are part of what that phrase accepted)
      if (modeNow() === "limitado") {
        const caps = patch.caps;
        const raisesCaps = caps !== undefined && (capRaised(caps.maxBuyUsd, current.caps.maxBuyUsd) || capRaised(caps.maxDailyBuyUsd, current.caps.maxDailyBuyUsd) || capRaised(caps.maxDailySellUsd, current.caps.maxDailySellUsd));
        const raisesBudget = patch.budget !== undefined && patch.budget.maxConsultsPerDay > current.budget.maxConsultsPerDay;
        if (raisesCaps || raisesBudget) return { ok: false, reason: "parar_antes_de_subir_tetos" };
      }
      const changed = configStore.update(patch);
      forgetSettings();
      return changed;
    },
    resolve(orderKey, outcome): ResolveResult {
      if (!lock.held()) return { ok: false, reason: "outra_instancia" };
      try {
        return settleOrder(orderKey, outcome) ? { ok: true } : { ok: false, reason: "nao_esta_em_voo" };
      } catch {
        return { ok: false, reason: "nao_gravou" };
      }
    },
    runNow: (): Promise<CycleReport> => scheduler.runNow(),
    guardNow: (): Promise<CycleReport> => watch.guard(),
    ledgerTail: (n) => ledger.tail(n),
    analysis: (): AnalysisView => {
      // read only, from the files the agent keeps; the same answer is kept for a few seconds because the screen asks every few seconds
      const now = localNow();
      if (analysisMemo !== null && now - analysisMemo.at < ANALYSIS_MEMO_MS) return analysisMemo.value;
      const parsed = (path: string): unknown[] => linesOf(path).filter((l) => l.trim() !== "").map((l) => { try { return JSON.parse(l) as unknown; } catch { return null; } });
      const value = buildAnalysis({ nowMs: now, briefs: parsed(join(dir, "briefs.jsonl")), orders: ledger.orderRecords(), fills: fills.all(), scoreboard: parsed(scoreboardPath) });
      const used = budget.status().committedTokens;
      const withRuntime: AnalysisView = { ...value, runtime: { tokensToday: Number.isFinite(used) ? used : null, riskPct: Number.isFinite(settings().riskPct) ? settings().riskPct : null } };
      analysisMemo = { at: now, value: withRuntime };
      return withRuntime;
    },
    close(timeoutMs = 180_000): Promise<void> {
      // the lock is let go only when the work in flight is over: the swap of an order already sent finishes (it cannot be called back) and its answer is written, then the folder is free
      if (closed !== null) return closed;
      closing = true;
      events.stop();
      macroEvents?.stop();
      cancelMacroPoll?.();
      cancelMacroPoll = null;
      scheduler.stop();
      // eslint-disable-next-line prefer-const
      let attempt: Promise<void> | null = null;
      attempt = (async () => {
        let timer: ReturnType<typeof setTimeout> | undefined;
        const limit = new Promise<boolean>((resolve) => {
          timer = setTimeout(() => resolve(false), timeoutMs);
        });
        const clean = await Promise.race([scheduler.idle().then(() => true), limit]);
        if (timer !== undefined) clearTimeout(timer);
        if (!clean) {
          // work is still in flight (an order sent and not answered): the folder stays this process's, so no other process can take it and send the same thing. A later close() waits again.
          if (closed === attempt) closed = null;
          throw new Error("close_timeout");
        }
        lock.release();
      })();
      closed = attempt;
      return attempt;
    },
  };
}
