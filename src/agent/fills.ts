/**
 * The REAL fills of the agent's orders, as the chain recorded them, and the round trips made of them. A planned order says how many dollars the code meant to move; the final transaction says what moved: the token that
 * came in or went out and the stablecoin that went the other way. From those, for each token, the amount that came back against the amount that went out IN THE SAME STABLECOIN, first in first out. This is the cash of
 * closed round trips in one currency, before the network fee (paid in SOL), never profit and never converted to dollars: two stablecoins are never added, a position still held is not in it, and a sale whose purchase the
 * agent never made has no entry and counts apart. What cannot be matched or valued stays unknown and is counted, never read as zero. The model reads a bounded summary of it in its Brief (`execBrief`), as percentages of
 * what went out, next to the measured record of its decisions. Pure apart from the store, whose file is injected.
 */
import type { SolanaReceiptEvidence } from "../server/solana-receipts";

/** The stablecoins whose movement counts as cash (Solana mainnet USDC and USDT), each its own currency. */
const STABLES: ReadonlySet<string> = new Set(["EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB"]);

export interface FillRecord {
  readonly kind: "fill";
  readonly orderKey: string;
  /** When it happened: the time of the block when the chain said it, else the time the ledger recorded (`atSource` says which). */
  readonly atMs: number;
  readonly atSource: "chain" | "ledger";
  readonly side: "buy" | "sell";
  readonly mint: string;
  readonly symbol: string;
  readonly signature: string;
  /** The token that moved, in its smallest unit, always positive. */
  readonly tokenMinor: string;
  readonly tokenDecimals: number;
  /** The stablecoin that moved the other way and how much of it, in its own units, positive. Both null when no stablecoin moved or two different ones did: unknown, never zero and never a sum of currencies. */
  readonly cashMint: string | null;
  readonly cashUnits: number | null;
  /** The fee of the whole transaction, the part this wallet paid (zero when another signer sponsored it) and the native movement of this wallet, in lamports as the chain gave them; null when the evidence did not say. */
  readonly feeLamports: string | null;
  readonly walletFeeLamports: string | null;
  readonly nativeDeltaLamports: string | null;
}

export interface FillSource {
  readonly orderKey: string;
  readonly atMs: number;
  readonly side: "buy" | "sell";
  readonly address: string;
  readonly symbol: string;
  readonly ref: string | null;
}

const abs = (v: bigint): bigint => (v < 0n ? -v : v);

/** The fill of one order from the final transaction it was sent under. Null unless the transaction succeeded and moved the token of the order the way the order says. */
export function fillFrom(order: FillSource, evidence: SolanaReceiptEvidence): FillRecord | null {
  if (order.ref === null || evidence.status !== "success" || evidence.tokenDeltas === null) return null;
  const moved = evidence.tokenDeltas.find((d) => d.mint === order.address);
  if (moved === undefined) return null;
  const delta = BigInt(moved.deltaMinor);
  if (order.side === "buy" ? delta <= 0n : delta >= 0n) return null;
  const stables = evidence.tokenDeltas.filter((d) => STABLES.has(d.mint) && (order.side === "buy" ? BigInt(d.deltaMinor) < 0n : BigInt(d.deltaMinor) > 0n));
  // one stablecoin moved: its amount, in its own units. None, or two different ones: unknown (a sum of two currencies is not an amount)
  const single = new Set(stables.map((d) => d.mint)).size === 1 ? stables[0]! : null;
  const chainTime = typeof evidence.blockTimeMs === "number" && Number.isSafeInteger(evidence.blockTimeMs) && evidence.blockTimeMs > 0 ? evidence.blockTimeMs : null;
  return {
    kind: "fill",
    orderKey: order.orderKey,
    atMs: chainTime ?? order.atMs,
    atSource: chainTime === null ? "ledger" : "chain",
    side: order.side,
    mint: order.address,
    symbol: order.symbol,
    signature: order.ref,
    tokenMinor: abs(delta).toString(),
    tokenDecimals: moved.decimals,
    cashMint: single === null ? null : single.mint,
    cashUnits: single === null ? null : Number(abs(BigInt(single.deltaMinor))) / 10 ** single.decimals,
    feeLamports: evidence.feeLamports,
    walletFeeLamports: evidence.walletFeeLamports ?? null,
    nativeDeltaLamports: evidence.nativeDeltaLamports,
  };
}

export interface RoundTrip {
  readonly symbol: string;
  readonly mint: string;
  readonly cashMint: string;
  readonly openedAtMs: number;
  readonly closedAtMs: number;
  /** The amount that went out, in the units of the stablecoin, for the tokens that were sold. */
  readonly costUnits: number;
  /** The amount that came back for them. */
  readonly proceedsUnits: number;
  readonly netUnits: number;
  readonly minutes: number;
}

export interface RoundTrips {
  readonly trips: readonly RoundTrip[];
  /** Sales of tokens the agent never bought (or of more than it bought): no entry to measure them by. */
  readonly unmatchedSells: number;
  /** Sales that matched a purchase but could not be valued: an amount unknown, two currencies, or token decimals that disagree. */
  readonly unknownValue: number;
  /** What is still held of what was bought, by mint, in the smallest unit. */
  readonly heldMint: Readonly<Record<string, string>>;
}

interface Lot {
  tokens: bigint;
  cost: number | null;
  cashMint: string | null;
  atMs: number;
}

/** First in first out, per token. A sale takes the oldest lots first and their share of the cost; what no lot covers is a sale with no entry. */
export function roundTrips(fills: readonly FillRecord[]): RoundTrips {
  // a mint seen with two different token decimals: its raw amounts are not comparable, so its sales are unknown, not matched
  const decimalsOf = new Map<string, Set<number>>();
  for (const f of fills) (decimalsOf.get(f.mint) ?? decimalsOf.set(f.mint, new Set()).get(f.mint)!).add(f.tokenDecimals);
  const lots = new Map<string, Lot[]>();
  const trips: RoundTrip[] = [];
  let unmatchedSells = 0;
  let unknownValue = 0;
  for (const f of [...fills].sort((a, b) => a.atMs - b.atMs)) {
    const tokens = BigInt(f.tokenMinor);
    if (tokens <= 0n) continue;
    const conflicted = (decimalsOf.get(f.mint)?.size ?? 0) > 1;
    if (f.side === "buy") {
      const list = lots.get(f.mint) ?? [];
      list.push({ tokens, cost: f.cashUnits, cashMint: f.cashMint, atMs: f.atMs });
      lots.set(f.mint, list);
      continue;
    }
    const list = lots.get(f.mint) ?? [];
    let left = tokens;
    let consumed = 0n;
    let cost: number | null = 0;
    let currency: string | null = f.cashMint;
    let opened = f.atMs;
    while (left > 0n && list.length > 0) {
      const lot = list[0]!;
      const take = lot.tokens < left ? lot.tokens : left;
      if (consumed === 0n) opened = lot.atMs;
      if (lot.cost === null || lot.cashMint === null || cost === null || lot.cashMint !== f.cashMint) {
        cost = null;
        currency = null;
      } else cost += lot.cost * (Number(take) / Number(lot.tokens));
      if (lot.cost !== null) lot.cost -= lot.cost * (Number(take) / Number(lot.tokens));
      lot.tokens -= take;
      left -= take;
      consumed += take;
      if (lot.tokens === 0n) list.shift();
    }
    if (consumed === 0n) {
      unmatchedSells += 1;
      continue;
    }
    // the sale may be larger than what was bought: only the matched part is a trip, and the part with no entry counts apart
    if (left > 0n) unmatchedSells += 1;
    if (conflicted || cost === null || currency === null || f.cashUnits === null) {
      unknownValue += 1;
      continue;
    }
    const proceeds = f.cashUnits * (Number(consumed) / Number(tokens));
    trips.push({ symbol: f.symbol, mint: f.mint, cashMint: currency, openedAtMs: opened, closedAtMs: f.atMs, costUnits: cost, proceedsUnits: proceeds, netUnits: proceeds - cost, minutes: Math.round((f.atMs - opened) / 60_000) });
  }
  const heldMint: Record<string, string> = {};
  for (const [mint, list] of lots) {
    const held = list.reduce((s, l) => s + l.tokens, 0n);
    if (held > 0n) heldMint[mint] = held.toString();
  }
  return { trips, unmatchedSells, unknownValue, heldMint };
}

export interface ExecBrief {
  /** Closed round trips (bought and sold) that could be valued. */
  readonly voltas: number;
  /** What came back minus what went out over them, as a percent of what went out, in the SAME stablecoin: cash before the network fee, NOT profit and not dollars. Null when the trips were settled in different stablecoins (or there are none). */
  readonly retorno: number | null;
  /** The latest trips, newest first: symbol, minutes held, the same percent for that trip. */
  readonly ultimas: readonly { readonly s: string; readonly m: number; readonly p: number }[];
  /** Sales of tokens the agent never bought: no entry, so no result. */
  readonly sem_entrada: number;
  /** Sales that matched a purchase but could not be valued (an amount unknown, two currencies, token decimals that disagree): never read as a return of zero. */
  readonly desconhecidas: number;
}

const r2 = (v: number): number => Math.round(v * 100) / 100;
const cleanSymbol = (s: string): string => s.replace(/[^A-Za-z0-9]/g, "").slice(0, 12);

/** What the model reads of its real fills; null when there is nothing real to say yet. */
export function execBrief(fills: readonly FillRecord[]): ExecBrief | null {
  if (fills.length === 0) return null;
  const { trips, unmatchedSells, unknownValue } = roundTrips(fills);
  if (trips.length === 0 && unmatchedSells === 0 && unknownValue === 0) return null;
  const pct = (net: number, cost: number): number => (cost > 0 ? r2((100 * net) / cost) : 0);
  const latest = [...trips].sort((a, b) => b.closedAtMs - a.closedAtMs).slice(0, 3);
  const currencies = new Set(trips.map((t) => t.cashMint));
  const cost = trips.reduce((s, t) => s + t.costUnits, 0);
  return {
    voltas: trips.length,
    retorno: currencies.size === 1 ? pct(trips.reduce((s, t) => s + t.netUnits, 0), cost) : null,
    ultimas: latest.map((t) => ({ s: cleanSymbol(t.symbol), m: t.minutes, p: pct(t.netUnits, t.costUnits) })),
    sem_entrada: unmatchedSells,
    desconhecidas: unknownValue,
  };
}

export interface FillStore {
  has(orderKey: string): boolean;
  /** False when the order already has its fill, or another order already has the fill of the same transaction. */
  add(fill: FillRecord): boolean;
  all(): readonly FillRecord[];
}

const text = (v: unknown): v is string => typeof v === "string" && v.length > 0 && v.length <= 400;
const orNull = (v: unknown): v is string | null => v === null || text(v);

const isFill = (o: unknown): o is FillRecord => {
  const r = o as Record<string, unknown> | null;
  return (
    r !== null &&
    typeof r === "object" &&
    r.kind === "fill" &&
    text(r.orderKey) &&
    typeof r.atMs === "number" &&
    (r.atSource === "chain" || r.atSource === "ledger") &&
    (r.side === "buy" || r.side === "sell") &&
    text(r.mint) &&
    text(r.symbol) &&
    text(r.signature) &&
    typeof r.tokenMinor === "string" &&
    /^[1-9]\d{0,79}$/.test(r.tokenMinor) &&
    typeof r.tokenDecimals === "number" &&
    orNull(r.cashMint) &&
    (r.cashUnits === null || (typeof r.cashUnits === "number" && Number.isFinite(r.cashUnits) && r.cashUnits >= 0)) &&
    (r.cashMint === null) === (r.cashUnits === null) &&
    orNull(r.feeLamports) &&
    orNull(r.walletFeeLamports) &&
    orNull(r.nativeDeltaLamports)
  );
};

export function createFillStore(deps: { readonly read: () => readonly string[]; readonly append: (line: string) => void }): FillStore {
  const fills = new Map<string, FillRecord>();
  const signatures = new Set<string>();
  try {
    for (const line of deps.read()) {
      if (line.trim() === "") continue;
      try {
        const o = JSON.parse(line) as unknown;
        if (isFill(o) && !fills.has(o.orderKey) && !signatures.has(o.signature)) {
          fills.set(o.orderKey, o);
          signatures.add(o.signature);
        }
      } catch {
        // a measurement log tolerates a bad line
      }
    }
  } catch {
    // an unreadable file is an empty store
  }
  return {
    has: (orderKey) => fills.has(orderKey),
    add(fill) {
      // one transaction is one fill: the same signature under another order key is never a second one
      if (fills.has(fill.orderKey) || signatures.has(fill.signature)) return false;
      deps.append(JSON.stringify(fill));
      fills.set(fill.orderKey, fill);
      signatures.add(fill.signature);
      return true;
    },
    all: () => [...fills.values()],
  };
}
