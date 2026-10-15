/**
 * What the HTTP face and the screen know about the agent: one object, assembled by `wire.ts`, with nothing secret in it (addresses are public; keys, sessions and the CLI's own files never appear). The
 * HTTP handler is written against this interface only, so it is tested with a fake.
 */
import type { BudgetState, BudgetLimits } from "./budget";
import type { AnalysisView } from "./analysis";
import type { ResourceCapacity } from "../decision-review/resource-capacity";
import type { ExecutionGuards } from "./guards";
import type { ConfigHealth, ConfigPatch, ConfigUpdate, AgentConfig } from "./config";
import type { CycleReport } from "./cycle";
import type { EquityPoint } from "./equity-log";
import type { LedgerHealth, LedgerRecord, OrderRecord } from "./ledger";
import type { MarketContext } from "./model";
import type { PlanHealth, PlanView, PositionPlan } from "./plans";
import type { SchedulerStatus } from "./scheduler";
import type { ScoreboardSummary } from "./scoreboard";
import type { EffectiveSettings } from "./autopilot";
import type { AgentState, ConnectResult } from "./state";
import type { Mode, WalletKind } from "./types";

export interface PositionRow {
  readonly id: string;
  readonly symbol: string;
  readonly chainIndex: string;
  readonly wallet: WalletKind;
  readonly usd: number | null;
  /** Of the whole portfolio, percent; null when the portfolio or the value is unknown. */
  readonly sharePct: number | null;
  readonly isCash: boolean;
  readonly plan: PlanView | null;
}

export interface BookStatus {
  readonly atMs: number;
  readonly managedOk: boolean;
  readonly watchFailed: number;
  readonly flagged: number;
  readonly unpriced: number;
  readonly totalUsd: number | null;
  readonly agentUsd: number | null;
  readonly cashUsd: number;
  readonly positions: readonly PositionRow[];
}

/** What a mode still needs, as constant codes. Empty means the mode can be raised. */
export type Readiness = Readonly<Record<Exclude<Mode, "desligado">, readonly string[]>>;

export interface Evidence {
  readonly settled: number;
  readonly claimBasis: "liquido" | "bruto" | null;
  readonly claim: "acima_de_manter" | "nao_acima_de_manter" | null;
  readonly claimReason: string | null;
  readonly netUsd: number | null;
  readonly grossUsd: number;
}

/** Where the wallet the agent trades from stands, and the one next thing, if any, that only the person can do. */
export interface WalletSetupView {
  /** The signing tool: not there, or installed and its hash on record. */
  readonly cli: "ausente" | "instalado";
  /** The sign-in on OKX's page: not started, waiting for the person, done, or not known. */
  readonly login: "nao_iniciado" | "aguardando" | "logado" | "desconhecido";
  /** The page to open to sign in, while one is waiting. */
  readonly loginUrl: string | null;
  /** The wallet the agent manages is an Agentic Wallet it can sign for. */
  readonly agentic: boolean;
  /** The Agentic Wallet's address on EVM networks, public. */
  readonly address: string | null;
  /** The Agentic Wallet's address on Solana, public: where Solana assets are sent. */
  readonly solanaAddress: string | null;
  /** The owner's policy in the OKX portal: "ok" when at least one limit is on (an extra backstop), "ausente" when none is (the agent runs on its own caps), unknown when it could not be read. */
  readonly policy: "ausente" | "ok" | "desconhecida";
  /** What the wallet the agent trades from holds, in dollars; null when not read. */
  readonly fundsUsd: number | null;
  /** How long the session of the signed-in account still has, in milliseconds (zero or less: it ended); null when the tool has no session to read. The session key itself never leaves the tool's folder. */
  readonly sessionLeftMs: number | null;
  /** The next step, in a constant code: install, sign in, deposit, set the owner's limits in the portal (only while they are required), nothing (it trades), or none because the person's own wallet is only analysed. */
  readonly next: "instalar" | "entrar" | "depositar" | "definir_politica" | "operando" | "so_analise";
}

export type WalletAction = "install" | "login" | "poll";
export type WalletSetupResult = { readonly ok: true; readonly wallet: WalletSetupView } | { readonly ok: false; readonly reason: string };

/** What the agent runs on and why: nothing here was typed by a person. */
export interface AutopilotView {
  readonly auto: boolean;
  readonly settings: EffectiveSettings;
  /** When the model last changed the mandate; null while it is the starting one. */
  readonly mandateChangedAtMs: number | null;
  /** The measurement has earned the aggressive stance: without it the model may ask for it and the code keeps the moderate one. */
  readonly aggressiveOpen: boolean;
  /** The owner's risk profile in force: the bold one means the agent does not wait for the measurement to take the risk (see autopilot.ts). */
  readonly ownerProfile: "arrojado" | "livre";
  /** What the owner authorized (autopilot.ts `OWNER_AUTHORIZATIONS`): the leverage authorization and the instruments that exist to use it. */
  readonly authorizations: { readonly leverage: { readonly granted: boolean; readonly since: string; readonly instruments: readonly string[] } };
  /** What the code still refuses after the quote of an order (choices of the code, not of the owner): read from the constants the executor uses. */
  readonly guards: ExecutionGuards;
}

/** The authority in force RIGHT NOW, which is not what the derived mode says: `mode` is what the agent is ELIGIBLE to do with the money; this says what it is doing. */
export interface AuthorityView {
  /** `desligado` (nothing connected), `analise` (reads, decides and measures, moves nothing) or `dinheiro` (executes). */
  readonly level: "desligado" | "analise" | "dinheiro";
  /** A constant code for what keeps it in analysis, null when nothing does. */
  readonly blocked: string | null;
  /** Whether the owner's limits in the OKX portal are required before it moves money (the person's choice, saved), as the server applies it. */
  readonly ownerPolicy: "exigida" | "dispensada";
}

export interface AgentStatus {
  readonly state: AgentState;
  /** What the agent is doing with the money right now, which follows from what is ready and is not a switch: desligado (no wallet connected), sombra (analysing and measuring) or limitado (trading). */
  readonly mode: Mode;
  /** What is really in force now (see AuthorityView): honest where `mode` only says what the agent may do. */
  readonly authority: AuthorityView;
  /** New purchases are paused by the agent's own circuit breaker. */
  readonly paused: boolean;
  /** The STOP file of the agent exists: nothing runs until it is removed. */
  readonly stopFile: boolean;
  readonly config: AgentConfig;
  readonly health: { readonly ledger: LedgerHealth; readonly plans: PlanHealth; readonly config: ConfigHealth };
  readonly modelConfigured: boolean;
  readonly credentialsConfigured: boolean;
  readonly cli: { readonly configured: boolean };
  readonly readiness: Readiness;
  readonly autopilot: AutopilotView;
  readonly wallet: WalletSetupView;
  readonly budget: BudgetState & { readonly limits: BudgetLimits };
  /** The quota of the data provider as the core projects it (counters of the gateway, observed when the status was answered; the account's own reading is unreported). Null when the gateway does not count. */
  readonly resources: ResourceCapacity | null;
  readonly scheduler: SchedulerStatus & { readonly intervalMin: number };
  readonly last: CycleReport | null;
  readonly plans: readonly PositionPlan[];
  readonly scoreboard: ScoreboardSummary;
  /** What the shadow measured in 24 hours, in one line: the number that decides whether the money mode has earned anything. */
  readonly evidence: Evidence;
  readonly book: BookStatus | null;
  readonly context: MarketContext | null;
  readonly ledger: readonly LedgerRecord[];
  /** What the screen draws of the result: the value of the agent wallet over time (it includes deposits and withdrawals; it is the wallet's value, not a profit) and the measured record of the model's decisions. */
  readonly performance: { readonly series: readonly EquityPoint[]; readonly record: Readonly<Record<string, { readonly n: number; readonly acerto: number | null }>> };
  /** Orders sent and not settled: the person looks at their wallet history and says whether each one went out. */
  readonly inFlight: readonly OrderRecord[];
  /** This process holds the agent's folder; false means another process does and no cycle runs here. */
  readonly lock: boolean;
}

export type ConnectChange = ConnectResult | { readonly ok: false; readonly reason: "requisitos_pendentes" | "outra_instancia" | "carteira_invalida" };

export type ConfigChange = ConfigUpdate | { readonly ok: false; readonly reason: "parar_antes_de_trocar_carteira" | "parar_antes_de_subir_tetos" | "parar_antes_de_trocar_binario" | "politica_exigida_pelo_servidor" | "outra_instancia" };

export type ResolveResult = { readonly ok: true } | { readonly ok: false; readonly reason: "nao_esta_em_voo" | "nao_gravou" | "outra_instancia" };

export interface AgentService {
  status(): AgentStatus;
  /** The one authorization: the person connects a wallet, having read the notice (its version is the proof). The agent starts working. */
  connect(input: { readonly disclosure: string; readonly managed?: ConfigPatch["managed"] }): ConnectChange;
  /** The way back: the agent stops at once. Never fails. */
  disconnect(): void;
  /** Connecting the wallet the agent trades from: install the tool, start the sign-in on OKX's page, look whether it is done. */
  wallet(action: WalletAction): Promise<WalletSetupResult>;
  updateConfig(patch: ConfigPatch): ConfigChange;
  /** The person's word about an order in flight, after looking at their wallet history. */
  resolve(orderKey: string, outcome: "executada" | "falhou"): ResolveResult;
  /** One cycle now, through the same single-flight runner. */
  runNow(): Promise<CycleReport>;
  /** One pass of the watch over the positions now (what runs every 45 seconds between the cycles): the exits the plans demand, and nothing else. */
  guardNow?(): Promise<CycleReport>;
  ledgerTail(count: number): readonly LedgerRecord[];
  /** The study of the decisions for the screen of analysis (analysis.ts), read only, from the files the agent keeps. Optional: a service that has none answers the route with a named failure. */
  analysis?(): AnalysisView;
  /** Stops the chain of cycles and WAITS for the work in flight (an order sent and not answered, the Placar settling) before it lets go of the folder: another process may take the folder only after. Bounded by `timeoutMs`; when the time runs out with work still in flight it REJECTS with `close_timeout` and keeps the folder (the process that sees it should exit, which frees the folder, or close again). Harmless when called twice. */
  close(timeoutMs?: number): Promise<void>;
}
