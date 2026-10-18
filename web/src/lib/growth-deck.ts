import { CATALOG, CATALOG_FAMILIES, catalogCounts, filterCatalog, type CatalogCounts, type CatalogFamily } from "./central/ecosystem-catalog";
import { formatMultiple, formatProbability, formatLeverage } from "./central/format";
import { COMPARISON_LEVERAGES, kellyLeverage, leverageComparison, riskVerdict, type ComparisonRow } from "./central/leverage-math";
import { PHASE_REFERENCE_SIGMAS } from "./central/phases";
import { TIERS, type PermissionTier } from "./central/permission-tiers";

/**
 * View model for the growth deck: the three central views (risk and leverage, permissions and
 * limits, ecosystem) folded into the console. Pure and deterministic; the component only lays
 * it out. Nothing here enables anything: it is arithmetic and display data from R2 and R3.
 */

export type DeckView = "risk" | "limits" | "ecosystem";

export const DECK_VIEWS: readonly { id: DeckView; label: string }[] = [
  { id: "risk", label: "Risco e alavancagem" },
  { id: "limits", label: "Permissoes e limites" },
  { id: "ecosystem", label: "Ecossistema OKX" },
];

export const HORIZONS: readonly number[] = [7, 30, 90];

export interface RiskParams {
  capitalUsd: number;
  sigma: number;
  mu: number;
  days: number;
}

export interface LeverageBar extends ComparisonRow {
  /** Bar height for the median multiple, 0 to 1, with 1x at BASELINE. */
  medianHeight: number;
  /** Bar height for the touch probability, 0 to 1. */
  touchHeight: number;
  medianText: string;
  touchText: string;
  leverageText: string;
  capitalText: number;
}

/** Where a 1x median sits on the bar scale: half way, so losses go down and gains go up. */
export const BASELINE = 0.5;

/** Log scale around 1x: 0.25x reaches the floor, 4x the ceiling. */
export function medianHeight(multiple: number): number {
  if (!Number.isFinite(multiple) || multiple <= 0) return 0;
  const log = Math.log2(multiple) / 2;
  return Math.min(1, Math.max(0, BASELINE + log * BASELINE));
}

export function leverageBars(params: RiskParams, leverages: readonly number[] = COMPARISON_LEVERAGES): LeverageBar[] {
  const rows = leverageComparison({ sigma: params.sigma, mu: params.mu, days: params.days }, leverages);
  return rows.map((row) => ({
    ...row,
    medianHeight: medianHeight(row.medianMultiple),
    touchHeight: Number.isFinite(row.touchProbability) ? Math.min(1, Math.max(0, row.touchProbability)) : 0,
    medianText: formatMultiple(row.medianMultiple),
    touchText: formatProbability(row.touchProbability),
    leverageText: formatLeverage(row.leverage),
    capitalText: params.capitalUsd * row.medianMultiple,
  }));
}

export interface RiskReading {
  kellyText: string;
  verdict: string;
}

/** The two plain sentences the deck shows for the chosen parameters. */
export function riskReading(params: RiskParams, leverage: number): RiskReading {
  const kelly = kellyLeverage(params.mu, params.sigma);
  const kellyText = kelly === null ? "Kelly indefinido: sem vantagem assumida" : `Kelly ${formatLeverage(kelly, 2)}`;
  const verdict = riskVerdict(params.mu, leverage, params.sigma);
  const text =
    verdict === "no-edge"
      ? "Sem vantagem assumida, qualquer alavancagem acima de zero encolhe a mediana: so o arrasto de volatilidade resta."
      : verdict === "edge-assumed-growth"
        ? "Com a vantagem assumida, a mediana cresce nesta alavancagem porque ela fica abaixo do dobro do Kelly."
        : "Mesmo com a vantagem assumida, esta alavancagem passa do dobro do Kelly e a mediana encolhe.";
  return { kellyText, verdict: text };
}

export interface SigmaChoice {
  id: string;
  label: string;
  sigma: number;
}

export const SIGMA_CHOICES: readonly SigmaChoice[] = PHASE_REFERENCE_SIGMAS.map((entry) => ({ id: entry.id, label: entry.label, sigma: entry.sigma }));

export function sigmaFor(id: string): number {
  return SIGMA_CHOICES.find((choice) => choice.id === id)?.sigma ?? SIGMA_CHOICES[SIGMA_CHOICES.length - 1]!.sigma;
}

export interface TierStep {
  tier: PermissionTier;
  index: number;
  stateLabel: string;
  stateTone: "active" | "viable" | "blocked";
}

export function tierSteps(tiers: readonly PermissionTier[] = TIERS): TierStep[] {
  return tiers.map((tier, index) => ({
    tier,
    index,
    stateLabel: tier.state === "active" ? "Ativo neste build" : tier.state === "viable_not_enabled" ? "Viavel, nao habilitado" : "Bloqueado pelo gate",
    stateTone: tier.state === "active" ? "active" : tier.state === "viable_not_enabled" ? "viable" : "blocked",
  }));
}

export interface FamilySummary {
  family: CatalogFamily;
  counts: CatalogCounts;
  /** Share of each status, 0 to 1, in the catalog order implemented, read_only, blocked, unconfirmed. */
  shares: { status: keyof Omit<CatalogCounts, "total">; share: number }[];
}

export function familySummaries(): FamilySummary[] {
  return CATALOG_FAMILIES.map((family) => {
    const counts = catalogCounts(filterCatalog(CATALOG, { status: "all", family: family.id }));
    const total = counts.total || 1;
    return {
      family,
      counts,
      shares: (["implemented", "read_only", "blocked", "unconfirmed"] as const).map((status) => ({ status, share: counts[status] / total })),
    };
  }).filter((summary) => summary.counts.total > 0);
}

export function ecosystemTotals(): CatalogCounts {
  return catalogCounts(CATALOG);
}
