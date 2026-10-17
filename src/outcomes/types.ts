/**
 * Shared shapes of the recorder, the labeler and the scoreboard (INT-0.6 to INT-0.10, REC-1 to REC-6). Plain data that survives
 * JSON. `null` is UNKNOWN and is never read as zero.
 */
import type { FeatureVector } from "../intel/features/types";

export const HORIZONS = ["15m", "1h", "4h"] as const;
export type Horizon = (typeof HORIZONS)[number];
export const HORIZON_MS: Readonly<Record<Horizon, number>> = { "15m": 900_000, "1h": 3_600_000, "4h": 14_400_000 };

/** A zone as the labeler needs it to measure the reaction: limits and the level that ends the idea, in price. */
export interface ZoneRef {
  /** The engine's id of the zone (without the `zona:` prefix), so an answer that chose it can be joined to its limits. */
  readonly id?: string;
  readonly lado?: "demanda" | "oferta" | "neutra";
  readonly baixo: number;
  readonly alto: number;
  readonly invalidacao: number | null;
  readonly nota: number;
}

/** What is written when the market is looked at: no action, no side. */
export interface Snapshot {
  readonly id: string;
  readonly asOfMs: number;
  readonly instId: string;
  readonly market: "spot" | "perp";
  readonly price: number;
  /** Round-trip fees, slippage and the quoted spread, in bps of the price (from the lab cost table). Null when the spread is unknown. */
  readonly costRoundTripBps: number | null;
  /** One ATR(14) of the 15 minute bars, in price units; the barrier unit of the labels. */
  readonly atr15m: number | null;
  readonly zones: {
    /** The live zone of each side that is nearest to the price (what the labeler measures the reaction of). */
    readonly demanda: ZoneRef | null;
    readonly oferta: ZoneRef | null;
    /** Every zone the engine offered at that moment (at most six), with its id; absent in older records. */
    readonly todas?: readonly ZoneRef[];
  };
  readonly features: FeatureVector;
  /** What caused the record: the five minute clock, a click on "Pedir ao Inonu", or the backfill from the exchange's history (candle features only). */
  readonly origem: "relogio" | "pedido" | "historico";
}

export type Barrier = "alvo" | "parada" | "tempo";

export type IncompleteReason = "horizonte_alem_dos_dados" | "lacuna_de_velas" | "sem_preco_de_entrada";

export interface ZoneReaction {
  readonly tocou: boolean;
  /** Null when the zone was not touched inside the horizon. */
  readonly reagiu: boolean | null;
}

/** The outcome of one snapshot over one horizon, for both directions. All returns are bps of the entry price. */
export interface Label {
  readonly snapshotId: string;
  readonly horizonte: Horizon;
  readonly completo: boolean;
  readonly motivoIncompleto: IncompleteReason | null;
  readonly brutoLongBps: number | null;
  readonly liquidoLongBps: number | null;
  readonly liquidoShortBps: number | null;
  /** Largest excursion above and below the entry inside the horizon, never negative. */
  readonly maxAltaBps: number | null;
  readonly maxQuedaBps: number | null;
  /** Triple barrier with stop 1 ATR and target 1.5 ATR; null when the ATR is unknown. */
  readonly barreiraLong: Barrier | null;
  readonly barreiraShort: Barrier | null;
  readonly zonaDemanda: ZoneReaction | null;
  readonly zonaOferta: ZoneReaction | null;
}

/** One answer of "Pedir ao Inonu", kept so its outcome can be measured later. Only documented fields, never the model's text. */
export interface DecisionRecord {
  readonly id: string;
  readonly atMs: number;
  /** The instrument, or null for a ranking or a whole network. */
  readonly instId: string | null;
  readonly modo: string;
  readonly action: "buy" | "sell" | "hold";
  readonly candidateId: string | null;
  readonly briefHash: string | null;
  /** The snapshot written when the click happened, so labels join to the decision. */
  readonly snapshotId: string | null;
  readonly reutilizado: boolean;
  /** The probability of each question the model answered (JEV-4); null until the question set is decomposed. */
  readonly probabilidades: Readonly<Record<string, number>> | null;
  /** What the Veredito did with the answer: the seal shown and, when it forced "esperar", which gate did. */
  readonly veredito: { readonly selo: "comprar" | "vender" | "esperar"; readonly forcadoPor: string | null } | null;
}
