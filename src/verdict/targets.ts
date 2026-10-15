/**
 * Where the idea could be taken off, as prices, from what a snapshot already measured (INT-1.1, VER-4): the near edge of the
 * opposing zones the engine offered, the profile levels of the window (the point of control and the edges of the value area)
 * and the pools of liquidity above (for a buy) or below (for a sell) on the 15 minute and 1 hour structure. Pure. The risk plan
 * picks the nearest one that is far enough; none of these is a forecast.
 */
import type { Snapshot } from "../outcomes/types";
import type { Side } from "./reasons";
import type { TargetCandidate } from "./types";

export function targetsFrom(snapshot: Pick<Snapshot, "price" | "zones" | "features">, side: Side): TargetCandidate[] {
  const { price } = snapshot;
  const v = snapshot.features.values;
  const at = (bps: number | null | undefined, sign: 1 | -1): number | null => (typeof bps === "number" && Number.isFinite(bps) ? price * (1 + (sign * bps) / 10_000) : null);
  const out: TargetCandidate[] = [];

  for (const zone of snapshot.zones.todas ?? []) {
    if (side === "compra" && zone.lado === "oferta") out.push({ preco: zone.baixo, tipo: "zona_oposta" });
    if (side === "venda" && zone.lado === "demanda") out.push({ preco: zone.alto, tipo: "zona_oposta" });
  }
  for (const name of ["flow.pocBps", "flow.vahBps", "flow.valBps"] as const) {
    const p = at(v[name], 1);
    if (p !== null) out.push({ preco: p, tipo: "perfil" });
  }
  for (const frame of ["smc15", "smc1h"] as const) {
    const p = side === "compra" ? at(v[`${frame}.poolAboveBps`], 1) : at(v[`${frame}.poolBelowBps`], -1);
    if (p !== null) out.push({ preco: p, tipo: "piscina" });
  }
  return out.filter((t) => t.preco > 0);
}
