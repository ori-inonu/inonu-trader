/**
 * What the screen of the autonomous agent knows, as the core's `GET /agent/status` gives it (src/agent/service.ts). The web does not import the core, so the shape is written here and checked by `parseStatus`:
 * a body that is not what is expected is no status at all, never a half-filled one. Numbers the core did not know are null and stay null on screen. There is no mode to pick and no setting to change: the person
 * connects a wallet, and everything else is the agent's.
 */

/** What the agent is doing with the money right now. It follows from what is ready and is not a switch: desligado (no wallet connected), sombra (analysing and measuring), limitado (trading). */
export type Mode = "desligado" | "sombra" | "limitado";

export type WalletKind = "agente" | "principal";
export type OrderStage = "preparada" | "enviando" | "executada" | "falhou" | "incerta";

export interface PlannedOrder {
  readonly candidateId: string;
  readonly side: "buy" | "sell";
  readonly stance: string;
  readonly chainIndex: string;
  readonly symbol: string;
  readonly address: string;
  readonly usd: number;
  readonly wallet: WalletKind;
  readonly profile: string | null;
  readonly source: "modelo" | "protecao";
}

export interface OrderOutcome {
  readonly order: PlannedOrder;
  readonly stage: OrderStage;
  readonly ref: string | null;
  readonly reason: string | null;
}

/** One candidate the agent looked at in its last cycle and what the model chose for it. */
export interface CandidateView {
  readonly id: string;
  readonly kind: "holding" | "buy";
  readonly symbol: string;
  readonly chainIndex: string;
  readonly stance: string | null;
  readonly families: readonly string[];
  readonly marks: readonly string[];
  /** Why the CODE left a purchase only `skip`; null when the model could really choose. */
  readonly closed: string | null;
  /** How sure the model was of each option it was offered, in two places; null or absent when it sent none. */
  readonly probs?: Readonly<Record<string, number>> | null;
  /** What the model said to each narrow yes or no judgment about the candidate, in two places; null or absent when it sent none. */
  readonly facets?: Readonly<Record<string, number>> | null;
}

export interface CycleReport {
  readonly cycleId: string;
  readonly atMs: number;
  readonly durationMs: number;
  readonly mode: Mode;
  readonly outcome: "mantido" | "decidido" | "bloqueado" | "erro";
  readonly reason: string | null;
  readonly consulted: boolean;
  readonly modelo: string | null;
  readonly posture: "defensiva" | "neutra" | "ofensiva" | null;
  readonly stances: Readonly<Record<string, string>>;
  readonly orders: readonly OrderOutcome[];
  readonly dropped: readonly { readonly candidateId: string; readonly reason: string }[];
  readonly considered: { readonly holdings: number; readonly buys: number; readonly protected: number };
  readonly notes: readonly string[];
  readonly view: readonly CandidateView[];
  /** How many purchases each level of the mandate's risk would put on offer; null when the core did not say. */
  readonly opened?: Readonly<Record<string, number>> | null;
}

export interface PlanView {
  readonly profile: string;
  readonly sinceEntryPct: number | null;
  readonly toTargetPct: number | null;
  readonly toStopPct: number | null;
  readonly hoursHeld: number;
  readonly hoursLeft: number;
  readonly targetHit: boolean;
  readonly trimmed: boolean;
}

export interface PositionRow {
  readonly id: string;
  readonly symbol: string;
  readonly chainIndex: string;
  readonly wallet: WalletKind;
  readonly usd: number | null;
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

export const WINDOW_IDS = ["15m", "1h", "4h", "24h"] as const;
export type WindowId = (typeof WINDOW_IDS)[number];

export interface WindowSummary {
  readonly n: number;
  /** Repeats of a bet already counted less than one window earlier: left out, so 30 repeats are not 30 samples. */
  readonly overlapping: number;
  readonly settled: number;
  readonly pending: number;
  readonly unknownPrice: number;
  readonly grossUsd: number;
  readonly netUsd: number | null;
  readonly hitRate: number | null;
  readonly claim: "acima_de_manter" | "nao_acima_de_manter" | null;
  readonly claimBasis: "liquido" | "bruto" | null;
  readonly claimReason: string | null;
}

export type ResourceTierId = "free" | "basic" | "premium";
export interface ResourceMeterView {
  readonly scope: "local_gateway" | "account_reported";
  readonly status: "valid" | "unreported" | "corrupt" | "unreadable" | "month_mismatch" | "invalid";
  readonly capEvidence: "local_configuration" | "provider_reported" | "unknown";
  /** When this source was observed; null when it never was. */
  readonly observedAtMs: number | null;
  readonly used: number | null;
  readonly monthlyCap: number | null;
  readonly remainingAtObservation: number | null;
  readonly extrapolatedMonthUse: number | null;
}
export interface ResourceView {
  readonly asOfMs: number;
  readonly month: { readonly key: string; readonly startAtMs: number; readonly localNextMonthUtcMs: number; readonly days: number };
  readonly accountRateLimits: { readonly requestsPerSecond: number | null; readonly tokensPerSecond: number | null };
  readonly tiers: Readonly<Record<ResourceTierId, { readonly local: ResourceMeterView; readonly account: ResourceMeterView }>>;
}

export interface LedgerRecord {
  readonly kind: "cycle" | "order";
  readonly cycleId: string;
  readonly atMs: number;
  readonly outcome?: string;
  readonly reason: string | null;
  readonly mode?: Mode;
  readonly posture?: string | null;
  readonly stage?: OrderStage;
  readonly side?: "buy" | "sell";
  readonly symbol?: string;
  readonly usd?: number;
  readonly stance?: string;
  readonly source?: string;
  /** On a cycle record: what the Jev chose and the code did not turn into an order, each with its reason. Absent when the record does not say. */
  readonly dropped?: readonly { readonly candidateId: string; readonly reason: string }[];
}

export interface Plan {
  readonly key: string;
  readonly symbol: string;
  readonly profile: string;
  readonly entryPriceUsd: number;
  readonly entryAtMs: number;
  readonly targetHit: boolean;
  readonly trimmed: boolean;
}

/** An order the core sent, or may have sent, and has no answer for. Nothing new goes out for that token until it is settled. */
export interface InFlightOrder {
  readonly orderKey: string;
  readonly atMs: number;
  readonly stage: "enviando" | "incerta";
  readonly side: "buy" | "sell";
  readonly symbol: string;
  readonly chainIndex: string;
  readonly usd: number;
  readonly source: "modelo" | "protecao";
  readonly reason: string | null;
  /** What the OKX program said when it refused without proving anything: plain text for the person to judge, null when nothing was said. */
  readonly detail: string | null;
  /** The transaction hash (or Solana signature) the order was sent under, when it carried one: it is what lets the agent look the order up by itself. */
  readonly ref?: string | null;
}

export type WalletNext = "instalar" | "entrar" | "depositar" | "definir_politica" | "operando";

/** Where the wallet the agent trades from stands, and the one next thing, if any, that only the person can do. */
export interface WalletSetup {
  readonly cli: "ausente" | "instalado";
  readonly login: "nao_iniciado" | "aguardando" | "logado" | "desconhecido";
  readonly loginUrl: string | null;
  readonly agentic: boolean;
  /** The agent wallet's address on the EVM networks. */
  readonly address: string | null;
  /** The agent wallet's address on Solana: the one Solana assets are sent to. */
  readonly solanaAddress: string | null;
  readonly policy: "ausente" | "ok" | "desconhecida";
  readonly fundsUsd: number | null;
  /** How long the session of the account still has, in milliseconds; zero or less: it ended; null: not read. */
  readonly sessionLeftMs: number | null;
  readonly next: WalletNext;
}

export interface Mandate {
  readonly risk: "cauteloso" | "moderado" | "agressivo";
  readonly reserve: "baixa" | "media" | "alta";
  readonly concentration: "pequena" | "media" | "grande";
  readonly look: "rapido" | "normal" | "calmo";
}

/** What the agent runs on and why. Nothing here was typed by a person. */
export interface Autopilot {
  readonly mandate: Mandate;
  /** The risk actually taken: the model may ask for more than the measurement has earned. */
  readonly riskTaken: Mandate["risk"];
  /** A ceiling in dollars, or null: no ceiling (the owner's decision of 2026-10-14: the Jev manages the size and the risk). */
  readonly caps: { readonly maxBuyUsd: number | null; readonly maxDailyBuyUsd: number | null; readonly maxDailySellUsd: number | null };
  readonly intervalMin: number;
  readonly reserveShare: number;
  readonly aggressiveOpen: boolean;
  /** The owner's risk profile in force: arrojado means the agent does not wait for the measurement to take the risk. A core that does not say is read as free. */
  readonly ownerProfile: "arrojado" | "livre";
  /** What the owner authorized: the leverage authorization, and how many leverage instruments the core can really operate (none yet). Null from a core that does not say. */
  readonly leverage: { readonly granted: boolean; readonly instruments: number } | null;
  readonly mandateChangedAtMs: number | null;
  readonly capsSource: string;
  /** What the code still refuses after the quote of an order (a choice of the code, not the owner's): null from a core that does not say. */
  readonly guards: ExecutionGuards | null;
}

export interface ExecutionGuards {
  readonly impactPct: { readonly buy: number; readonly sell: number; readonly protecao: number };
  readonly taxPct: number;
  readonly slippagePct: { readonly buy: number; readonly sell: number; readonly protecao: number };
  /** A purchase accepts at most this share of the stop of its profile as price impact. */
  readonly buyCostShareOfStop: number;
  /** What stays of the native coin for the fee of the next transactions: a fixed dollar amount, or the measured fee of the network (usd null while none was measured). */
  readonly nativeReserve: { readonly kind: "fixa" | "taxa_medida"; readonly usd: number | null };
}

export interface AgentEvent {
  readonly atMs: number;
  readonly kind: "conectou" | "desconectou" | "pausou" | "retomou";
  readonly reason: string;
}

export interface Authority {
  readonly level: "desligado" | "analise" | "dinheiro";
  /** A constant code for what keeps the agent in analysis; null when nothing does. */
  readonly blocked: string | null;
  /** Whether the owner's limits in the OKX portal are required before it moves money (the person's own choice, saved). */
  readonly ownerPolicy: "exigida" | "dispensada";
}

export interface AgentStatus {
  readonly connected: boolean;
  readonly connectedAtMs: number | null;
  readonly mode: Mode;
  /** What is really in force now: the derived mode only says what the agent MAY do with the money. */
  readonly authority: Authority;
  /** New purchases are paused by the agent's own circuit breaker. */
  readonly paused: boolean;
  readonly pausedUntilMs: number | null;
  readonly pauseReason: string | null;
  readonly events: readonly AgentEvent[];
  readonly managed: { readonly kind: "propria" | "agentica"; readonly evm: string | null; readonly solana: string | null };
  readonly stopFile: boolean;
  readonly health: { readonly ledgerOk: boolean; readonly plansOk: boolean; readonly configOk: boolean };
  readonly modelConfigured: boolean;
  readonly credentialsConfigured: boolean;
  readonly readiness: { readonly sombra: readonly string[]; readonly limitado: readonly string[] };
  readonly wallet: WalletSetup;
  readonly autopilot: Autopilot;
  readonly budget: { readonly consults: number; readonly maxConsultsPerDay: number };
  /** The quota of the data provider as the core projected it; null when the core does not report it (an older core, or a gateway that does not count). The age of a reading is the screen's to advance from `observedAtMs`. */
  readonly resources: ResourceView | null;
  readonly scheduler: { readonly started: boolean; readonly nextAtMs: number | null; readonly lastAtMs: number | null; readonly intervalMin: number };
  readonly last: CycleReport | null;
  readonly plans: readonly Plan[];
  readonly windows: Readonly<Record<WindowId, WindowSummary>>;
  /** The decisions NOT to act (keep, do not buy), measured apart from the orders against the alternative the model turned down; null when the core does not report them. */
  readonly inaction: { readonly decisions: number; readonly windows: Readonly<Record<WindowId, WindowSummary>> } | null;
  readonly decisions: number;
  /** Exits the plan of a position demanded: counted apart from the model's decisions. */
  readonly protective: number;
  readonly inFlight: readonly InFlightOrder[];
  /** False when another process of the app holds the agent's folder: cycles do not run here. */
  readonly lock: boolean;
  readonly book: BookStatus | null;
  readonly context: Readonly<Record<string, string | number | null>> | null;
  readonly ledger: readonly LedgerRecord[];
  /** The value of the agent wallet over time (it includes deposits and withdrawals: the wallet's value, not a profit) and the measured record of the model's own decisions. */
  readonly performance: { readonly series: readonly { readonly t: number; readonly v: number }[]; readonly record: Readonly<Record<string, { readonly n: number; readonly acerto: number | null }>> };
}
