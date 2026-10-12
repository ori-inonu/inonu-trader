import { SYNTHETIC_DEX_REPORT } from "../../web/src/lib/dex-report-example";

export const SYNTHETIC_NOW_MS = 1_791_504_000_100;
export type SyntheticCase = "fresh" | "missing" | "stale" | "future" | "contradiction" | "invalid" | "known_costs";

/** Sanitized synthetic data only; clocks and costs are illustrative, never live evidence. */
export function syntheticMobileInput(caseName: SyntheticCase = "missing") {
  const value = {
    schema: "mobile_decision_input_v1",
    snapshot_id: `synthetic-mobile-${caseName}`,
    revision: "1",
    origin: "synthetic_fixture",
    dex_report: structuredClone(SYNTHETIC_DEX_REPORT),
    source_time_ms: SYNTHETIC_NOW_MS - 200 as number | null,
    fetched_at_ms: SYNTHETIC_NOW_MS - 50 as number | null,
    max_age_ms: 60_000,
    api_cost_usd: null as string | null,
    jev: null,
  };
  if (caseName === "missing") value.source_time_ms = value.fetched_at_ms = null;
  if (caseName === "stale") value.source_time_ms = SYNTHETIC_NOW_MS - 60_001;
  if (caseName === "future") { value.source_time_ms = SYNTHETIC_NOW_MS + 1; value.fetched_at_ms = SYNTHETIC_NOW_MS + 2; }
  if (caseName === "contradiction") { value.source_time_ms = SYNTHETIC_NOW_MS - 25; value.fetched_at_ms = SYNTHETIC_NOW_MS - 200; }
  if (caseName === "invalid") value.max_age_ms = 0;
  if (caseName === "known_costs") value.api_cost_usd = "0.000000000000000000000001";
  return value;
}
