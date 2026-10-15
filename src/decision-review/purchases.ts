import type { ConsultAudit } from "./audit";

interface PurchaseGroup {
  mode: ConsultAudit["mode"];
  criteriaVersion: string | null;
  legendVersion: string | null;
  consultations: number;
  purchaseCandidates: number;
  closedBeforeChoice: number;
  modelSkipped: number;
  requestedBuys: number;
  retainedBuys: number;
  buysChangedToSkip: number;
  unattributed: number;
}

/** Diagnoses the retained consultation window, never the entire trading day or investment performance. A retained buy is not a fill. */
export function summarizePurchases(consultations: readonly ConsultAudit[]) {
  const cycles = new Map(consultations.map(c => [c.cycleId, c]));
  const groups = new Map<string, PurchaseGroup>();
  for (const r of cycles.values()) {
    const criteriaVersion = r.criteriaVersion ?? null, legendVersion = r.legendVersion ?? null;
    const key = JSON.stringify([r.mode, criteriaVersion, legendVersion]);
    const g = groups.get(key) ?? { mode: r.mode, criteriaVersion, legendVersion, consultations: 0, purchaseCandidates: 0, closedBeforeChoice: 0, modelSkipped: 0, requestedBuys: 0, retainedBuys: 0, buysChangedToSkip: 0, unattributed: 0 };
    g.consultations++;
    for (const c of r.candidates.filter(c => c.kind === "buy")) {
      g.purchaseCandidates++;
      if (!c.selectableAlternative) { g.closedBeforeChoice++; continue; }
      if (r.decisionValid !== true || !["model_choice", "code_adjusted"].includes(c.source)) { g.unattributed++; continue; }
      if (c.requested === "skip" && c.selected === "skip") { g.modelSkipped++; continue; }
      if (!c.requested?.startsWith("buy_") || c.selected === null || !c.offered.includes(c.selected)) { g.unattributed++; continue; }
      g.requestedBuys++;
      if (c.selected === "skip") g.buysChangedToSkip++;
      else if (c.selected.startsWith("buy_")) g.retainedBuys++;
    }
    groups.set(key, g);
  }
  return { scope: "retained_consultation_window" as const, consultations: cycles.size, groups: [...groups.values()], execution: "not_inferred" as const, financialPerformance: "not_evaluated" as const };
}
