/**
 * Adapters between what the OnchainOS gateway emits and what the trail (`trail.ts`) and the Brief expect
 * (fase-2 SPEC F2-DIG-2, A-17, A-18). Pure.
 *
 * Two silent mismatches live here. The gateway emits the cluster concentration as `Low`, `Medium`, `High` and the trail only
 * knows `baixa`, `media`, `alta`: without the adapter the label is ignored and the top 10 share is used instead. And the
 * percent fields do not share a scale (A-17): each field has its registered scale, and a field whose scale is not settled
 * is `ambigua` and never enters a score.
 */
import { concentrationComponent } from "./trail";

export type Scale = "pct100" | "fracao" | "ambigua";

/**
 * Measured on 2026-10-12 (docs/sdd/config-onchain-smartmoney/fase-2/evidence/escalas-percentuais-2026-10-12.json). Anything
 * not listed is ambiguous until F2-MED-8 decides it.
 */
const FIELD_SCALE: Readonly<Record<string, Scale>> = {
  "advanced-info.top10HoldPct": "pct100",
  "advanced-info.lpBurnedPct": "pct100",
  "signals.soldRatioPct": "pct100",
  "signals.token.top10HoldPct": "pct100",
  "memepump.top10HoldingsPercent": "pct100",
  "advanced-info.devHoldPct": "ambigua",
  "advanced-info.bundleHoldPct": "ambigua",
  "advanced-info.sniperHoldPct": "ambigua",
  "advanced-info.suspiciousHoldPct": "ambigua",
  "cluster.top100HoldingsPct": "ambigua",
  "cluster-top-holders.holdingPct": "ambigua",
};

export function scaleOf(field: string): Scale {
  return FIELD_SCALE[field] ?? "ambigua";
}

/** A share as a fraction from 0 to 1. Null for an unknown value, an ambiguous scale or a value outside the scale. */
export function toFraction01(value: number | null | undefined, scale: Scale): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || scale === "ambigua") return null;
  const fraction = scale === "pct100" ? value / 100 : value;
  return fraction >= 0 && fraction <= 1 ? fraction : null;
}

/** A share as a percent from 0 to 100. Null for an unknown value, an ambiguous scale or a value outside the scale. */
export function toPct100(value: number | null | undefined, scale: Scale): number | null {
  const fraction = toFraction01(value, scale);
  return fraction === null ? null : scale === "pct100" ? (value as number) : fraction * 100;
}

const CLUSTER_LABELS: Readonly<Record<string, "baixa" | "media" | "alta">> = { low: "baixa", medium: "media", high: "alta" };

/** The provider's `Low`, `Medium`, `High` as the trail's `baixa`, `media`, `alta`; anything else is unknown. */
export function clusterLabelForTrail(label: string | null | undefined): "baixa" | "media" | "alta" | undefined {
  return typeof label === "string" ? CLUSTER_LABELS[label.trim().toLowerCase()] : undefined;
}

export interface ConcentrationSources {
  readonly cluster: { readonly concentration: string | null } | null;
  readonly risk: { readonly top10HoldPct: number | null } | null;
}

/** The concentration component and where it came from: the cluster label when recognised, else the top 10 share. */
export function concentrationFromGateway(sources: ConcentrationSources): { value: number | null; via: "cluster" | "top10" | null } {
  const label = clusterLabelForTrail(sources.cluster?.concentration);
  const top10 = sources.risk?.top10HoldPct;
  const top10Usable = typeof top10 === "number" && Number.isFinite(top10) && scaleOf("advanced-info.top10HoldPct") === "pct100";
  const value = concentrationComponent({
    ...(label !== undefined ? { cluster: label } : {}),
    ...(top10Usable ? { top10HolderPercent: top10 } : {}),
  });
  if (value === null) return { value: null, via: null };
  return { value, via: label !== undefined ? "cluster" : "top10" };
}
