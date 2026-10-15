/**
 * The study of the decisions, from the files the agent already keeps (the consults, the orders, the fills and the Placar), for the screen of analysis. Pure and read only: nothing here reads a file or calls the network, and
 * a record that is not what is expected is skipped, never an error. Everything is counted from what was RECORDED: the funnel from the item of purchase to the order that went out, how much the model wanted to buy, the closed
 * round trips (cash that went out and came back, before the network fee, never a profit), and what the price did after each decision not to buy (a counterfactual, before cost and impact).
 */

export interface AnalysisInput {
  readonly nowMs: number;
  /** The consult records (briefs.jsonl), oldest first. */
  readonly briefs: readonly unknown[];
  /** The last record of each order (ledger). */
  readonly orders: readonly unknown[];
  /** The real fills (fills.jsonl). */
  readonly fills: readonly unknown[];
  /** The lines of the Placar (scoreboard.jsonl): decisions and settlements. */
  readonly scoreboard: readonly unknown[];
}

export interface WindowStats {
  readonly n: number;
  readonly up: number;
  readonly mean: number | null;
  readonly vals: readonly number[];
}
export type GroupStats = Readonly<{ "15m": WindowStats; "1h": WindowStats }>;

export interface AnalysisView {
  readonly atMs: number;
  readonly funnel: { readonly consults: number; readonly items: number; readonly closed: number; readonly open: number; readonly asked: number; readonly applied: number; readonly executed: number; readonly failed: number };
  readonly asks: readonly { readonly t: number; readonly s: string | null; readonly p: number; readonly ok: boolean }[];
  readonly hist: { readonly all: readonly number[]; readonly fresh: readonly number[] };
  readonly timeline: readonly { readonly t: number; readonly open: number; readonly asked: number; readonly applied: number }[];
  readonly trips: readonly { readonly s: string; readonly in: number; readonly out: number; readonly pct: number; readonly buyAt: number; readonly sellAt: number }[];
  readonly fees: { readonly lamports: number; readonly fills: number; readonly unmatchedSells: number };
  readonly placar: { readonly skipped: GroupStats; readonly closed: GroupStats; readonly gated: GroupStats };
  readonly recent: readonly { readonly t: number; readonly s: string | null; readonly kind: string; readonly m15: number | null; readonly m1h: number | null }[];
  /** How the orders ended (the last stage of each), why the failed ones failed, and the dollars sent today (UTC day, like the daily caps), by side. */
  readonly orders: { readonly outcomes: Readonly<Record<string, number>>; readonly reasons: Readonly<Record<string, number>>; readonly spentToday: { readonly buy: number; readonly sell: number } };
  /** What the running agent knows and the files do not: the tokens the model used today and the risk per operation in force. The pure study leaves them null; the service fills them. */
  readonly runtime: { readonly tokensToday: number | null; readonly riskPct: number | null };
}

const FUNNEL_CONSULTS = 25;
const TIMELINE_CONSULTS = 30;
const RECENT_KEPT = 40;
const BINS = 20;

const rec = (v: unknown): Record<string, unknown> | null => (v !== null && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null);
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const str = (v: unknown): string | null => (typeof v === "string" && v.length > 0 && v.length <= 80 ? v : null);
const round = (x: number, d: number): number => Math.round(x * 10 ** d) / 10 ** d;

interface Consult {
  readonly cycleId: string;
  readonly atMs: number;
  readonly fresh: boolean;
  readonly items: readonly { readonly id: string; readonly open: boolean; readonly symbol: string | null; readonly requested: string | null; readonly applied: string | null; readonly pBuy: number | null }[];
}

function consultOf(raw: unknown): Consult | null {
  const r = rec(raw);
  const cycleId = str(r?.cycleId), atMs = num(r?.atMs);
  if (r === null || cycleId === null || atMs === null || !Array.isArray(r.candidates)) return null;
  const compras = rec(rec(r.brief)?.compras);
  const verdicts = rec(r.verdicts), requested = rec(r.requested), stances = rec(r.stances);
  const items: Consult["items"][number][] = [];
  for (const c of r.candidates) {
    const cr = rec(c);
    const id = str(cr?.id);
    if (cr === null || id === null || cr.kind !== "buy" || !Array.isArray(cr.stances)) continue;
    const probs = rec(verdicts?.[id]);
    let pBuy: number | null = null;
    if (probs !== null) for (const [k, v] of Object.entries(probs)) if (k.startsWith("buy") && num(v) !== null) pBuy = Math.max(pBuy ?? 0, v as number);
    items.push({ id, open: cr.stances.length > 1, symbol: str(rec(compras?.[id])?.s), requested: str(requested?.[id]), applied: str(stances?.[id]), pBuy });
  }
  return { cycleId, atMs, fresh: r.criteria === "rank-v1", items };
}

const isBuy = (s: string | null): boolean => s !== null && s.startsWith("buy");

function windowStats(vals: number[]): WindowStats {
  return { n: vals.length, up: vals.filter((v) => v > 0).length, mean: vals.length === 0 ? null : round(vals.reduce((a, b) => a + b, 0) / vals.length, 2), vals };
}

export function buildAnalysis(input: AnalysisInput): AnalysisView {
  const consults = input.briefs.map(consultOf).filter((c): c is Consult => c !== null);

  // ---- orders: the last stage of each key
  const orders = input.orders.map(rec).filter((o): o is Record<string, unknown> => o !== null && str(o.stage) !== null && num(o.atMs) !== null);

  // ---- the funnel over the last consults
  const window = consults.slice(-FUNNEL_CONSULTS);
  const funnel = { consults: window.length, items: 0, closed: 0, open: 0, asked: 0, applied: 0, executed: 0, failed: 0 };
  const asks: { t: number; s: string | null; p: number; ok: boolean }[] = [];
  for (const c of window) {
    for (const it of c.items) {
      funnel.items++;
      if (!it.open) { funnel.closed++; continue; }
      funnel.open++;
      if (it.requested !== null && it.requested !== "skip") {
        funnel.asked++;
        const ok = isBuy(it.applied);
        if (ok) funnel.applied++;
        asks.push({ t: c.atMs, s: it.symbol, p: it.pBuy ?? 0, ok });
      }
    }
  }
  const t0 = window[0]?.atMs ?? Number.POSITIVE_INFINITY;
  for (const o of orders) {
    if (o.side !== "buy" || (num(o.atMs) as number) < t0) continue;
    if (o.stage === "executada") funnel.executed++;
    else if (o.stage === "falhou") funnel.failed++;
  }

  // ---- the histogram of the buy preference over every open candidate of every consult
  const all = new Array<number>(BINS).fill(0), fresh = new Array<number>(BINS).fill(0);
  for (const c of consults) {
    for (const it of c.items) {
      if (!it.open || it.pBuy === null) continue;
      const bin = Math.min(BINS - 1, Math.floor(it.pBuy * BINS + 1e-9));
      all[bin]!++;
      if (c.fresh) fresh[bin]!++;
    }
  }

  // ---- the timeline of the last consults
  const timeline = consults.slice(-TIMELINE_CONSULTS).map((c) => {
    const open = c.items.filter((i) => i.open);
    const asked = open.filter((i) => i.requested !== null && i.requested !== "skip");
    return { t: c.atMs, open: open.length, asked: asked.length, applied: asked.filter((i) => isBuy(i.applied)).length };
  });

  // ---- the real fills: closed round trips and the network fees
  const fills = input.fills.map(rec).filter((f): f is Record<string, unknown> => f !== null && str(f.symbol) !== null && (f.side === "buy" || f.side === "sell") && num(f.cashUnits) !== null && num(f.atMs) !== null);
  const bySymbol = new Map<string, Record<string, unknown>[]>();
  for (const f of fills) { const k = f.symbol as string; bySymbol.set(k, [...(bySymbol.get(k) ?? []), f]); }
  const trips: { s: string; in: number; out: number; pct: number; buyAt: number; sellAt: number }[] = [];
  let unmatchedSells = 0;
  // one round trip is a stretch in which the token was held: it opens with the first purchase after the balance was empty and closes with the sale that leaves (almost) none. The same token bought and sold five times is
  // five trips, never one. Partial sales stay inside their trip; a trip not yet closed is not a result. Without the token amounts of a fill the sale is taken to close the trip (the old reading).
  const minor = (v: unknown): bigint | null => (typeof v === "string" && /^\d{1,30}$/.test(v) ? BigInt(v) : null);
  for (const [symbol, fs] of bySymbol) {
    let open: { cin: number; cout: number; buyAt: number; bal: bigint; peak: bigint; known: boolean } | null = null;
    for (const f of [...fs].sort((a, b) => (a.atMs as number) - (b.atMs as number))) {
      const cash = f.cashUnits as number, tm = minor(f.tokenMinor);
      if (f.side === "buy") {
        open ??= { cin: 0, cout: 0, buyAt: f.atMs as number, bal: 0n, peak: 0n, known: true };
        open.cin += cash;
        if (tm === null) open.known = false;
        else { open.bal += tm; open.peak += tm; }
      } else if (open === null) unmatchedSells += 1;
      else {
        open.cout += cash;
        if (tm === null) open.known = false;
        else open.bal = open.bal > tm ? open.bal - tm : 0n;
        // what is left after the sale is dust (5% of what was bought or less), so the trip is over
        if (!open.known || open.bal * 20n <= open.peak) {
          if (open.cin > 0) trips.push({ s: symbol, in: round(open.cin, 4), out: round(open.cout, 4), pct: round((open.cout / open.cin - 1) * 100, 2), buyAt: open.buyAt, sellAt: f.atMs as number });
          open = null;
        }
      }
    }
  }
  trips.sort((a, b) => a.sellAt - b.sellAt);
  let lamports = 0;
  for (const f of fills) {
    const fee = typeof f.walletFeeLamports === "string" && /^\d{1,18}$/.test(f.walletFeeLamports) ? Number(f.walletFeeLamports) : 0;
    lamports += fee;
  }

  // ---- the Placar: what the price did after a decision not to buy
  const dec = new Map<string, Record<string, unknown>>();
  const settled = new Map<string, Map<string, number>>();
  for (const line of input.scoreboard) {
    const r = rec(line);
    const key = str(r?.key);
    if (r === null || key === null) continue;
    if (r.kind === "decision") dec.set(key, r);
    else if (r.kind === "settlement" && typeof r.window === "string" && num(r.priceUsd) !== null) settled.set(key, new Map([...(settled.get(key) ?? []), [r.window, r.priceUsd as number]]));
  }
  const move = (key: string, w: string): number | null => {
    const d = dec.get(key), price = settled.get(key)?.get(w), entry = num(d?.entryPriceUsd);
    return d !== undefined && price !== undefined && entry !== null && entry > 0 ? (price / entry - 1) * 100 : null;
  };
  const gated: string[] = [], skipped: string[] = [], closed: string[] = [];
  for (const c of consults) {
    for (const it of c.items) {
      const key = `${c.cycleId}:${it.id}|inacao`;
      if (it.requested === "skip" && !isBuy(it.applied) && it.open) skipped.push(key);
      else if (it.requested !== null && it.requested !== "skip" && !isBuy(it.applied)) gated.push(key);
    }
  }
  for (const [key, d] of dec) if (key.endsWith("|inacao") && Array.isArray(d.triggers) && d.triggers.includes("fechada_pelo_codigo")) closed.push(key);
  const group = (keys: string[]): GroupStats => ({ "15m": windowStats(keys.map((k) => move(k, "15m")).filter((v): v is number => v !== null).map((v) => round(v, 2))), "1h": windowStats(keys.map((k) => move(k, "1h")).filter((v): v is number => v !== null).map((v) => round(v, 2))) });
  const kinds: [string, string[]][] = [["pedida e recusada", gated], ["puxada pelo codigo", closed], ["pulada pelo Jev", skipped]];
  const recent: { t: number; s: string | null; kind: string; m15: number | null; m1h: number | null }[] = [];
  for (const [kind, keys] of kinds) {
    for (const k of keys) {
      const d = dec.get(k);
      const t = num(d?.atMs);
      if (d === undefined || t === null) continue;
      const m15 = move(k, "15m"), m1h = move(k, "1h");
      recent.push({ t, s: str(d.symbol), kind, m15: m15 === null ? null : round(m15, 2), m1h: m1h === null ? null : round(m1h, 2) });
    }
  }
  recent.sort((a, b) => a.t - b.t);

  // ---- how the orders ended, and what went out today
  const outcomes: Record<string, number> = {};
  const reasons: Record<string, number> = {};
  const spentToday = { buy: 0, sell: 0 };
  const day = (t: number): string => new Date(t).toISOString().slice(0, 10);
  for (const o of orders) {
    const stage = o.stage as string;
    if (stage === "executada" || stage === "falhou" || stage === "incerta") outcomes[stage] = (outcomes[stage] ?? 0) + 1;
    if (stage === "falhou") { const why = str(o.reason) ?? "desconhecido"; reasons[why] = (reasons[why] ?? 0) + 1; }
    const usd = num(o.usd);
    if ((stage === "executada" || stage === "incerta" || stage === "enviando") && usd !== null && (o.side === "buy" || o.side === "sell") && day(o.atMs as number) === day(input.nowMs)) spentToday[o.side] += usd;
  }
  spentToday.buy = round(spentToday.buy, 2);
  spentToday.sell = round(spentToday.sell, 2);

  return {
    atMs: input.nowMs, funnel, asks, hist: { all, fresh }, timeline, trips, fees: { lamports, fills: fills.length, unmatchedSells },
    placar: { skipped: group(skipped), closed: group(closed), gated: group(gated) }, recent: recent.slice(-RECENT_KEPT), orders: { outcomes, reasons, spentToday },
    runtime: { tokensToday: null, riskPct: null },
  };
}
