/**
 * The vocabulary of the autonomous agent (AUT-1 to AUT-16, docs/sdd/agente-autonomo). The agent manages a portfolio: the code reads, measures and limits, and the model (Jev) chooses among closed options that the
 * code put forward; the code then checks the choice and works out every amount. Nothing in this file talks to a network, a disk or a model.
 */

import type { Mandate } from "./mandate";

/** The three levels of power over the money. The agent is born `desligado`; the person starts it and gives it, once, the permission to trade; from then on the agent moves between sombra and limitado by the rules of autonomy.ts. */
export const MODES = ["desligado", "sombra", "limitado"] as const;
export type Mode = (typeof MODES)[number];

/** What each mode lets the agent do with the money. `sombra` reads, decides, records and measures, moving nothing; `limitado` carries the decisions out inside the owner's policy. There is no mode in which the person approves each order: that is manual work, and the agent is the one that decides. */
const MODE_RANK: Readonly<Record<Mode, number>> = { desligado: 0, sombra: 1, limitado: 2 };

/**
 * The posture of the portfolio, the one strategic choice the model makes about the whole book. The model never writes a number: the code turns the posture into limits (reserve, how much new risk), always inside
 * the envelope the owner and the app set.
 */
export const POSTURES = ["defensiva", "neutra", "ofensiva"] as const;
export type Posture = (typeof POSTURES)[number];

/** Whose wallet a position is in. The agent only ever EXECUTES in `agente`; the `principal` wallet is read, and a decision about it becomes an order prepared for the person. */
export type WalletKind = "agente" | "principal";

export interface Position {
 /** `token:<chain>:<address>`, the same id the rest of the app uses. */
 readonly id: string;
 readonly chainIndex: string;
 readonly address: string;
 readonly symbol: string;
 readonly wallet: WalletKind;
 /** What the position is worth, in dollars; null when the provider gave no price. */
 readonly usd: number | null;
 /** The balance in the token's smallest unit, whole digits; null when it was not read exactly. */
 readonly balanceMinor: string | null;
 readonly decimals: number | null;
 /** A dollar coin: it is the cash of the portfolio, never a position to manage. */
 readonly isCash: boolean;
 /** The price per unit the provider reported with the balance, in dollars; null or absent when it gave none. */
 readonly priceUsd?: number | null;
}

/** The balance of the portfolio as the agent sees it, from reads only. */
export interface Book {
 readonly observedAtMs: number;
 readonly positions: readonly Position[];
 /** Dollar coins, by network, in the wallet the agent executes in. */
 readonly cashByChain: Readonly<Record<string, number>>;
 /** The portfolio counted, in dollars, cash included, both wallets; null when it could not be counted. */
 readonly totalUsd: number | null;
 /** The part of it in the wallet the agent executes in. */
 readonly agentUsd: number | null;
 /** Plan keys (`chain:address`) of tokens in the agent's wallet that the provider flags as risk: left out of `positions`, but still held, so a plan for one of them is not an orphan. */
 readonly flaggedKeys?: readonly string[];
}

/** The ways a holding can be managed, as fractions of what the wallet holds NOW. */
export const EXIT_STANCES = ["hold", "trim_third", "trim_half", "exit_all"] as const;
export type ExitStance = (typeof EXIT_STANCES)[number];

export const EXIT_FRACTION: Readonly<Record<Exclude<ExitStance, "hold">, { readonly num: number; readonly den: number }>> = {
 trim_third: { num: 1, den: 3 },
 trim_half: { num: 1, den: 2 },
 exit_all: { num: 1, den: 1 },
};

/** The sizes a purchase can have, as fractions of the ceiling the code computed. Same words as the ecosystem mode, so the two modes speak one language. */
export const BUY_STANCES = ["skip", "buy_tenth", "buy_third", "buy_two_thirds", "buy_full"] as const;
export type BuyStance = (typeof BUY_STANCES)[number];

/** A candidate the model can choose about: a holding to manage, or a token to buy. */
export type CandidateKind = "holding" | "buy";

/**
 * What the code measured about a holding, the evidence the model weighs to hold, trim or exit. Every field is a measurement; null is unknown, never zero. None of it is a recommendation.
 */
export interface HoldingFacts {
 readonly priceUsd: number | null;
 /** Percent since the agent bought it, when the ledger knows the entry; null for a holding the agent did not buy. */
 readonly sinceEntryPct: number | null;
 readonly changeH24Pct: number | null;
 readonly liquidityUsd: number | null;
 /** The position as a share of the liquidity of its pool: how hard it would be to leave. */
 readonly exitImpactPct: number | null;
 readonly volumeH24Usd: number | null;
 /** The last five minutes and the last hour (change in percent, trades, volume): what the token is doing now. Null (or absent) when the provider gave none. */
 readonly change5mPct?: number | null;
 readonly change1hPct?: number | null;
 readonly volume5mUsd?: number | null;
 readonly txs5m?: number | null;
 readonly txs1h?: number | null;
 /** Whether an observed normalized price-info row reported a finite numeric timestamp. */
 readonly priceInfoTimestampReported?: boolean;
 /** How old what was read is, in minutes: the provider's stamp when it gave one, else the time since it was asked. */
 readonly dataAgeMin?: number | null;
 /** The share of the tracked wallets that already sold it, 0 to 100. */
 readonly soldPct: number | null;
 readonly riskLevel: number | null;
 readonly riskFlags: readonly string[];
 readonly heldHours: number | null;
}

export interface Candidate {
 readonly id: string;
 readonly kind: CandidateKind;
 readonly symbol: string;
 readonly chainIndex: string;
 /** The token's address on its network (a public identifier; never the address of a wallet). */
 readonly address: string;
 /** What the person already holds of it, in dollars. */
 readonly heldUsd: number;
 /** The stances this candidate is offered with (the code decides which, by what is possible). */
 readonly stances: readonly string[];
 /** Per stance, the dollars the code worked out; the model never sees or writes them. */
 readonly usdByStance: Readonly<Record<string, number>>;
 /** Measured facts of a holding; null for a purchase (its facts live in the ecosystem candidate). */
 readonly facts: HoldingFacts | null;
 /** What the code noticed (a trigger of a holding, a family of evidence or a mark of care of a purchase), as codes. Observations, never advice. */
 readonly triggers: readonly string[];
 readonly families: readonly string[];
 readonly marks: readonly string[];
 /** Whose wallet it is in: a holding of the principal wallet can only become an order prepared for the person. */
 readonly wallet: WalletKind;
 /** For a purchase: the target and stop profiles the code offers for this token (empty: it cannot be bought with a plan). */
 readonly profiles: readonly string[];
 /** For a holding the agent opened: where it stands against its plan. */
 readonly plan: PlanViewLike | null;
 /** For a purchase: how the moment of the entry looks (RSI, range, run-up). Measurements only. */
 readonly timing: TimingViewLike | null;
 /** What the token is doing in the last hour, in five-minute bars: facts of now, null when the bars do not support them (or absent from a candidate built without them). */
 readonly momentum?: MomentumViewLike | null;
 /** For a purchase: the ceiling in dollars the code worked out and which limit was the smallest (cash, reserve, risk, liquidity, volume, minimum), for the study of why a purchase was or was not on offer. */
 readonly cap?: { readonly maxUsd: number; readonly binding: string; readonly sharePct: number | null; readonly riskPct?: number | null; readonly tightest?: string; readonly tightestUsd?: number };
 /** For a purchase: the ceiling in dollars for each profile on offer, sized by the stop of that profile (a worse stop, a smaller ceiling). The order is sized with the ceiling of the profile the model picks. */
 readonly capByProfile?: Readonly<Record<string, number>>;
}

/** The last hour in five-minute bars as the Brief carries it (see momentum.ts). */
export interface MomentumViewLike {
 readonly ret5mPct: number;
 readonly ret15mPct: number;
 readonly ret1hPct: number;
 readonly rangeHourPct: number;
 readonly volRatio: number | null;
 readonly barAgeMin: number;
}

/** The plan of a position as the Brief carries it (see plans.ts). */
export interface PlanViewLike {
 readonly profile: string;
 readonly sinceEntryPct: number | null;
 readonly toTargetPct: number | null;
 readonly toStopPct: number | null;
 readonly hoursHeld: number;
 readonly hoursLeft: number;
 readonly targetHit: boolean;
 readonly trimmed: boolean;
}

/** The moment of an entry as the Brief carries it (see timing.ts). */
export interface TimingViewLike {
 readonly rsi: number | null;
 readonly rangePos: number | null;
 readonly ret4hPct: number | null;
 readonly ret24hPct: number | null;
 readonly runUpPct: number | null;
 readonly drawFromHighPct: number | null;
 readonly sigmaHourPct: number | null;
 /** Age in minutes since the start of the newest 1h candle; absent on older producers, never inferred from fetch time. */
 readonly ageMin?: number | null;
}

/** What the model chose, validated: the posture, one stance per candidate offered, a profile for each purchase and the mandate (how much risk, how much reserve, how big a bet, how soon to look again). */
export interface Decision {
 readonly posture: Posture;
 /** The standing choices of the strategy; null when the model did not state them in this answer (the mandate in force then stays). */
 readonly mandate: Mandate | null;
 readonly stances: Readonly<Record<string, string>>;
 /** candidate id -> profile, only for the purchases that are not skipped. */
 readonly profiles: Readonly<Record<string, string>>;
 /** The purchases whose size the posture brought down (or skipped, for the second purchase of a defensive cycle); absent when the posture touched none. */
 readonly limited?: readonly string[];
}

/** An order the code worked out from the decision, in the order they would be carried out: the exits free the cash that the purchases then use. */
export interface PlannedOrder {
 readonly candidateId: string;
 readonly side: "buy" | "sell";
 readonly stance: string;
 readonly chainIndex: string;
 readonly symbol: string;
 /** The token's address on its network. */
 readonly address: string;
 readonly usd: number;
 /** A sale: the amount in the token's smallest unit, whole digits, worked out by the code. A purchase: null (it is made in dollars). */
 readonly amountMinor: string | null;
 readonly wallet: WalletKind;
 /** A purchase: the target and stop profile the model chose. A sale: null. */
 readonly profile: string | null;
 /** Who asked for it: the model's choice, or the plan of a position (stop, trailing stop, time, half at the target), which the code carries out on its own. */
 readonly source: "modelo" | "protecao";
}
