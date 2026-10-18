/**
 * The glue between the agent's wallet and the equity series (equity.ts): a reading of the wallet in the form the series wants (the agent's own wallet only, quantities in whole units, the price each was valued
 * at), the orders the agent sent as the trades that explain a change of quantities, and the question the circuit breaker asks of them. A reading that could not be valued honestly (a balance not read exactly, a
 * holding with no value) is kept but marked unvalued, so the series skips it instead of guessing. Pure: the wire reads and writes the file.
 */
import { buildSeries, judgeEquity, type EquityPause, type Holding, type Snapshot, type Trade } from "./equity";
import type { OrderRecord } from "./ledger";
import { planKey } from "./plans";
import type { Book } from "./types";

const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/**
 * `previous` is the reading before this one, if there is one: a token the provider flagged leaves the book altogether, and without it the vanished units would be told apart as money taken out of the wallet
 * (a loss hidden as a withdrawal). It is carried at price zero instead, so its disappearance is a loss.
 */
export function snapshotOf(book: Book, atMs: number, previous: Snapshot | null = null): Snapshot {
  let valued = finite(book.agentUsd);
  const holdings: Holding[] = [];
  for (const p of book.positions) {
    if (p.wallet !== "agente") continue;
    const exact = p.balanceMinor !== null && /^\d{1,60}$/.test(p.balanceMinor) && p.decimals !== null && Number.isInteger(p.decimals) && p.decimals >= 0 && p.decimals <= 36;
    if (!exact) {
      valued = false;
      continue;
    }
    const units = Number(p.balanceMinor) / 10 ** (p.decimals as number);
    if (!p.isCash && !finite(p.usd)) {
      // a value nobody proved (no price, or a price no pool could pay) is out of the wallet's value (book.agentUsd already leaves it out), and it is carried at price zero: a claimed price is a claim, and an airdrop
      // of a token that claims any price must not look like money put in. A wallet whose rug removed the pool shows the loss, instead of a reading that cannot be valued and is skipped.
      holdings.push({ id: planKey(p.chainIndex, p.address), units, priceUsd: 0 });
      continue;
    }
    // the price the balance came with; else what the position was valued at over its units; else none (unknown, never zero)
    const price = finite(p.priceUsd) && p.priceUsd >= 0 ? p.priceUsd : finite(p.usd) && units > 0 ? p.usd / units : null;
    holdings.push({ id: planKey(p.chainIndex, p.address), units, priceUsd: price });
  }
  if (previous !== null) {
    const kept = new Set(holdings.map((h) => h.id));
    for (const key of book.flaggedKeys ?? []) {
      const at = key.indexOf(":");
      if (at <= 0) continue;
      const id = planKey(key.slice(0, at), key.slice(at + 1));
      const was = previous.holdings.find((h) => h.id === id);
      if (was !== undefined && !kept.has(id)) {
        holdings.push({ id, units: was.units, priceUsd: 0 });
        kept.add(id);
      }
    }
  }
  return { atMs, usd: valued ? (book.agentUsd as number) : null, holdings };
}

/** A line of the readings file as a reading, or null when it is not one (a measurement log tolerates a bad line). */
export function parseSnapshotLine(line: string): Snapshot | null {
  let o: unknown;
  try {
    o = JSON.parse(line);
  } catch {
    return null;
  }
  if (o === null || typeof o !== "object" || Array.isArray(o)) return null;
  const r = o as { atMs?: unknown; usd?: unknown; holdings?: unknown };
  if (!finite(r.atMs) || !(r.usd === null || finite(r.usd)) || !Array.isArray(r.holdings)) return null;
  const holdings: Holding[] = [];
  for (const h of r.holdings) {
    if (h === null || typeof h !== "object") return null;
    const x = h as { id?: unknown; units?: unknown; priceUsd?: unknown };
    if (typeof x.id !== "string" || x.id.length === 0 || x.id.length > 200 || !finite(x.units) || x.units < 0 || !(x.priceUsd === null || finite(x.priceUsd))) return null;
    holdings.push({ id: x.id, units: x.units, priceUsd: x.priceUsd });
  }
  return { atMs: r.atMs, usd: r.usd, holdings };
}

/** What the agent sent, one trade per order: the last record of an order tells whether it left (executed, or sent and unanswered) or not (prepared, failed). The person's own wallet is not the agent's trade. */
export function tradesOf(records: readonly OrderRecord[]): Trade[] {
  const last = new Map<string, OrderRecord>();
  for (const r of records) if (r.wallet === "agente") last.set(r.orderKey, r);
  return [...last.values()].filter((r) => r.stage === "executada" || r.stage === "incerta" || r.stage === "enviando").map((r) => ({ atMs: r.atMs, usd: r.usd }));
}

/** The reason to pause new purchases from what the wallet really did, or null to go on. */
export function equityPause(snapshots: readonly Snapshot[], trades: readonly Trade[], nowMs: number): EquityPause | null {
  return judgeEquity(buildSeries(snapshots, trades), nowMs);
}

/** One point of the value of the agent wallet over time, for the screen: the instant and the dollars, to the cent. */
export interface EquityPoint {
  readonly t: number;
  readonly v: number;
}

/**
 * The value of the agent wallet at each reading of the file: the sum of what the reading counted, units over price (a holding with no price is left out of that reading). It includes deposits and withdrawals, and says
 * so on the screen; it is the wallet's value, not a profit. Thinned evenly to at most `maxPoints`, keeping the first and the last. Pure.
 */
export function equitySeries(lines: readonly string[], maxPoints = 160): EquityPoint[] {
  const points: EquityPoint[] = [];
  for (const line of lines) {
    const snapshot = parseSnapshotLine(line);
    if (snapshot === null) continue;
    let sum = 0;
    let counted = 0;
    for (const h of snapshot.holdings) {
      if (h.priceUsd === null || !Number.isFinite(h.priceUsd) || !Number.isFinite(h.units)) continue;
      sum += h.units * h.priceUsd;
      counted++;
    }
    if (counted === 0 || !(sum > 0)) continue;
    points.push({ t: snapshot.atMs, v: Math.round(sum * 100) / 100 });
  }
  points.sort((a, b) => a.t - b.t);
  if (points.length <= maxPoints || maxPoints < 2) return points;
  const out: EquityPoint[] = [];
  for (let i = 0; i < maxPoints; i++) out.push(points[Math.round((i * (points.length - 1)) / (maxPoints - 1))]!);
  return out.filter((p, i) => i === 0 || p.t > out[i - 1]!.t);
}
