/**
 * From recorded snapshots and their labels to the table a learner trains on (INT-3.1, ML-2): one row per snapshot and side, the
 * features as numbers (a null is NaN, never zero), the outcome as "did this side end above zero after costs at the horizon" and the
 * net return in bps for the economic test. Pure.
 *
 * Only snapshots whose label at the horizon is COMPLETE with a known cost enter; a click on "Pedir ao Inonu" does not, because a
 * person chose the moment and the clock did not (the table would learn the person, not the market). The rows are sorted by time and
 * carry their own timestamp so the walk-forward can purge by it.
 */
import { FEATURE_NAMES } from "../features/types";
import type { Horizon, Label, Snapshot } from "../../outcomes/types";

export type Side = "long" | "short";

export interface Sample {
  readonly id: string;
  readonly instId: string;
  readonly t: number;
  readonly x: Float64Array;
  /** Net return of the side at the horizon, in bps (after costs). */
  readonly net: number;
  readonly y: 0 | 1;
}

export interface Dataset {
  readonly side: Side;
  readonly horizon: Horizon;
  readonly names: readonly string[];
  /** Ascending by time, then by instrument. */
  readonly samples: readonly Sample[];
  /** Why rows were left out, by constant reason, so a small table can be explained. */
  readonly excluded: Readonly<Record<string, number>>;
}

export function buildDataset(snapshots: readonly Snapshot[], labels: readonly Label[], options: { readonly side: Side; readonly horizon: Horizon }): Dataset {
  const labelOf = new Map<string, Label>();
  for (const l of labels) if (l.horizonte === options.horizon) labelOf.set(l.snapshotId, l);
  const excluded: Record<string, number> = {};
  const skip = (why: string): void => {
    excluded[why] = (excluded[why] ?? 0) + 1;
  };
  const samples: Sample[] = [];
  for (const s of snapshots) {
    if (s.origem === "pedido") {
      skip("pedido_de_pessoa");
      continue;
    }
    const l = labelOf.get(s.id);
    if (l === undefined) {
      skip("sem_rotulo");
      continue;
    }
    const net = options.side === "long" ? l.liquidoLongBps : l.liquidoShortBps;
    if (!l.completo || net === null || net === undefined) {
      skip(l.completo ? "sem_custo" : (l.motivoIncompleto ?? "incompleto"));
      continue;
    }
    const x = new Float64Array(FEATURE_NAMES.length);
    FEATURE_NAMES.forEach((name, i) => {
      const v = s.features.values[name];
      x[i] = typeof v === "number" && Number.isFinite(v) ? v : Number.NaN;
    });
    samples.push({ id: s.id, instId: s.instId, t: s.asOfMs, x, net, y: net > 0 ? 1 : 0 });
  }
  samples.sort((a, b) => a.t - b.t || (a.instId < b.instId ? -1 : a.instId > b.instId ? 1 : 0));
  return { side: options.side, horizon: options.horizon, names: FEATURE_NAMES, samples, excluded };
}
