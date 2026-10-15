/**
 * The Placar of the agent for tokens (AUT-11): what each decision would have been worth 15 minutes, 1, 4 and 24 hours later, against NOT taking it (a purchase against keeping the dollars, a sale against
 * keeping the token). It is the only thing that can show that the agent earns anything, so it claims nothing it cannot support: a window still open, a sample under the minimum, or prices missing give NO
 * claim, with the reason. Net of cost exists only when every cost is known. The price at the end of a window comes from an injected lookup; this module touches no network. Shadow and real decisions are
 * kept apart by mode.
 */
import type { Mode, Posture, WalletKind } from "./types";

export const WINDOWS = [
  { id: "15m", ms: 15 * 60_000 },
  { id: "1h", ms: 60 * 60_000 },
  { id: "4h", ms: 4 * 60 * 60_000 },
  { id: "24h", ms: 24 * 60 * 60_000 },
] as const;
export type WindowId = (typeof WINDOWS)[number]["id"];

/** Under this many settled decisions no claim is made: a handful of wins is not evidence. */
export const MIN_SAMPLE = 30;
/** A price that cannot be found this long after the end of its window is settled as unknown. */
export const RETRY_LIMIT_MS = 6 * 60 * 60_000;
const MAX_LOOKUPS_PER_SETTLE = 50;
/** Under this many measured samples a hit rate is not given: the model is told it does not know yet. */
export const RECORD_MIN_N = 5;
/** Of those, at most this many are for decisions NOT to act: they are many (every cycle may mark several) and each costs a call to the price provider, whose monthly quota is shared with everything else. */
const MAX_INACTION_LOOKUPS_PER_SETTLE = 10;
/** A price that could not be found is not asked for again before this long. */
const LOOKUP_BACKOFF_MS = 15 * 60_000;
/** The same decision not to act (same token, side and stance), repeated by the next cycles, is one mark for this long. */
const INACTION_DEDUPE_MS = 60 * 60_000;
/** More than this share of unknown prices and the window makes no claim. */
const MAX_UNKNOWN_SHARE = 0.2;

export interface DecisionMark {
  readonly kind: "decision";
  /** The order key: one mark per order. */
  readonly key: string;
  readonly cycleId: string;
  readonly atMs: number;
  readonly mode: Mode;
  readonly side: "buy" | "sell";
  readonly candidateId: string;
  readonly chainIndex: string;
  readonly address: string;
  readonly symbol: string;
  readonly stance: string;
  readonly usd: number;
  /** The price at the decision; null when none was known, and then the decision cannot be measured. */
  readonly entryPriceUsd: number | null;
  /** The cost the quote announced for the order (network fee and price impact on the size), in dollars: an ESTIMATE, not what the chain charged; null while unknown. */
  readonly costUsd: number | null;
  readonly posture: Posture;
  /** The profile of target and stop of a purchase; null for a sale. */
  readonly profile: string | null;
  /** The model's choice or the plan of a position. */
  readonly source: "modelo" | "protecao";
  readonly families: readonly string[];
  readonly triggers: readonly string[];
  readonly wallet: WalletKind;
  /**
   * The decision was NOT to act (keep a holding, skip a purchase). It is measured against the alternative the model turned down, written as the side whose effect that is: keeping a holding is worth what holding
   * did (the sale it passed over would have lost that), so it is `buy`; not buying is worth what the purchase it passed over would have lost, so it is `sell`. These live in their own windows and never move
   * the board of the orders. Absent on records of before.
   */
  readonly inaction?: boolean;
}

export interface Settlement {
  readonly kind: "settlement";
  readonly key: string;
  readonly window: WindowId;
  readonly settledAtMs: number;
  readonly priceUsd: number | null;
  readonly reason: string | null;
}

/** The value change caused by taking the decision rather than not taking it. Null when a price is unknown: unknown is never zero. */
export function effectUsd(d: Pick<DecisionMark, "side" | "usd" | "entryPriceUsd">, priceAtEndUsd: number | null): number | null {
  const p0 = d.entryPriceUsd;
  if (p0 === null || !Number.isFinite(p0) || p0 <= 0 || priceAtEndUsd === null || !Number.isFinite(priceAtEndUsd) || priceAtEndUsd < 0) return null;
  const move = priceAtEndUsd / p0 - 1;
  return d.side === "buy" ? d.usd * move : d.usd * -move;
}

export type ClaimReason = "sem_decisoes" | "janela_incompleta" | "amostra_pequena" | "precos_faltando" | "modos_misturados" | "custo_desconhecido";

export interface WindowSummary {
  /** Decisions of the model that count: the measurable ones (they had an entry price) that are independent of each other (see `overlapping`), plus the ones with no entry price, which count as unknown. */
  readonly n: number;
  /** The dollars the settled decisions put at stake (their sizes added): the base the cost of acting is measured against. */
  readonly notionalUsd: number;
  /** Measurable decisions left out because the same side on the same token was already counted less than one window earlier: a model that repeats "buy X" every cycle has not made a new bet each time, and 30 repeats are not 30 samples. */
  readonly overlapping: number;
  readonly settled: number;
  readonly pending: number;
  readonly unknownPrice: number;
  readonly grossUsd: number;
  /** Null unless every settled decision has a known cost. */
  readonly netUsd: number | null;
  readonly hitRate: number | null;
  readonly claim: "acima_de_manter" | "nao_acima_de_manter" | null;
  readonly claimBasis: "liquido" | "bruto" | null;
  readonly claimReason: ClaimReason | null;
}

export interface ScoreboardSummary {
  /** The decisions NOT to act (keep, skip), apart from the orders: what they were worth against the alternative that was turned down. */
  readonly inaction: { readonly decisions: number; readonly windows: Readonly<Record<WindowId, WindowSummary>> };
  readonly decisions: number;
  /** The exits the plan of a position demanded: they measure the plan, not the model's judgment, and are not in the windows. */
  readonly protective: number;
  readonly noEntryPrice: number;
  readonly windows: Readonly<Record<WindowId, WindowSummary>>;
  readonly byMode: Readonly<Partial<Record<Mode, Readonly<Record<WindowId, WindowSummary>>>>>;
}

export type PriceLookup = (decision: DecisionMark, atMs: number) => Promise<number | null>;

export interface Scoreboard {
  /** Records a decision to be measured; a key already marked is ignored. Throws when it cannot be saved. */
  mark(decision: DecisionMark): void;
  settle(nowMs: number, lookup: PriceLookup): Promise<void>;
  /**
   * The track record of the model, which it reads in its Brief: for each family of evidence, how often BUYING a candidate that had it beat keeping dollars in the window (counted from the purchases it skipped too:
   * the price rose after), and `manter` and `vender` for how often keeping a holding and selling one beat the alternative. Only the model's own decisions, one sample per bet per window, only what the window
   * has already closed; a hit rate is null under RECORD_MIN_N samples. Nothing here moves money.
   */
  record(window: WindowId, nowMs: number, sinceMs?: number): Readonly<Record<string, { readonly n: number; readonly acerto: number | null; readonly medio?: number; readonly melhor?: number; readonly pior?: number }>>;
  /** The board; given `sinceMs`, only the decisions taken from then on (the autonomy of the agent reads the last days, not all of history). */
  summary(nowMs: number, sinceMs?: number): ScoreboardSummary;
}

export interface ScoreboardDeps {
  readonly read: () => readonly string[];
  readonly append: (line: string) => void;
}

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

export function createScoreboard(deps: ScoreboardDeps): Scoreboard {
  const decisions = new Map<string, DecisionMark>();
  const settlements = new Map<string, Settlement>();
  const slot = (key: string, window: WindowId) => `${key}|${window}`;
  /** When each (decision, window) may be looked up again after a price was not found. In memory only: a restart asks again. */
  const retryAt = new Map<string, number>();
  /** The last time each decision not to act was marked, by token, side and stance. */
  const lastInaction = new Map<string, number>();
  const inactionBet = (d: Pick<DecisionMark, "chainIndex" | "address" | "side" | "stance">) => `${d.chainIndex}|${d.address}|${d.side}|${d.stance}`;

  try {
    for (const line of deps.read()) {
      if (line.trim().length === 0) continue;
      let o: Record<string, unknown>;
      try {
        o = JSON.parse(line) as Record<string, unknown>;
      } catch {
        continue; // a measurement log tolerates a bad line: it is not the safety record
      }
      if (o.kind === "decision" && typeof o.key === "string" && isNum(o.atMs) && isNum(o.usd)) {
        const d = o as unknown as DecisionMark;
        decisions.set(o.key, d);
        if (d.inaction === true) lastInaction.set(inactionBet(d), Math.max(lastInaction.get(inactionBet(d)) ?? 0, d.atMs));
      }
      else if (o.kind === "settlement" && typeof o.key === "string" && WINDOWS.some((w) => w.id === o.window)) settlements.set(slot(o.key, o.window as WindowId), o as unknown as Settlement);
    }
  } catch {
    // an unreadable file is an empty board, never a crash
  }

  const measurable = (d: DecisionMark) => d.entryPriceUsd !== null && Number.isFinite(d.entryPriceUsd) && d.entryPriceUsd > 0;

  /** The decisions of the model that can be measured, in time order, and how many repeats of the same bet were left out for this window length. */
  const independent = (marks: readonly DecisionMark[], window: (typeof WINDOWS)[number]): { readonly counted: DecisionMark[]; readonly overlapping: number; readonly unmeasurable: number } => {
    const counted: DecisionMark[] = [];
    const lastAt = new Map<string, number>();
    let overlapping = 0;
    let unmeasurable = 0;
    for (const d of [...marks].sort((a, b) => a.atMs - b.atMs)) {
      if (d.source !== "modelo") continue;
      // a decision with no price to measure it by is not hidden: it counts as unknown, so a claim cannot be built from the winners alone
      if (!measurable(d)) {
        unmeasurable++;
        continue;
      }
      const bet = `${d.chainIndex}|${d.address}|${d.side}`;
      const before = lastAt.get(bet);
      if (before !== undefined && d.atMs - before < window.ms) {
        overlapping++;
        continue;
      }
      lastAt.set(bet, d.atMs);
      counted.push(d);
    }
    return { counted, overlapping, unmeasurable };
  };

  const windowSummary = (marks: readonly DecisionMark[], window: (typeof WINDOWS)[number], nowMs: number): WindowSummary => {
    let n = 0;
    let settled = 0;
    /** Counted decisions whose window has not ended yet, and the ones whose window ended and whose price is still missing. */
    let notDue = 0;
    let dueOpen = 0;
    let unknown = 0;
    let gross = 0;
    let net = 0;
    let notional = 0;
    let costsKnown = true;
    let hits = 0;
    const { counted, overlapping, unmeasurable } = independent(marks, window);
    n += unmeasurable;
    unknown += unmeasurable;
    // shadow, assisted and real decisions are different experiments: one verdict over a mix of them says nothing about any
    const mixed = new Set(counted.map((d) => d.mode)).size > 1;
    for (const d of counted) {
      n++;
      const s = settlements.get(slot(d.key, window.id));
      if (s === undefined) {
        if (nowMs < d.atMs + window.ms) notDue++;
        else dueOpen++;
        continue;
      }
      const effect = effectUsd(d, s.priceUsd);
      if (effect === null) {
        unknown++;
        continue;
      }
      settled++;
      notional += d.usd;
      gross += effect;
      if (d.costUsd === null) costsKnown = false;
      else net += effect - d.costUsd;
      if (effect > 0) hits++;
    }
    const pending = n - settled - unknown;
    const netUsd = settled > 0 && costsKnown ? net : null;
    let claim: WindowSummary["claim"] = null;
    let claimBasis: WindowSummary["claimBasis"] = null;
    let claimReason: ClaimReason | null = null;
    // a rolling agent always has recent decisions whose window is still open: they are not evidence yet, and they do not take the claim away from the ones that were measured. A decision whose window ENDED and has no price
    // yet does hold it back (the ones measured so far may be only the winners), and so does a board where nothing has closed at all.
    if (n === 0) claimReason = "sem_decisoes";
    else if (dueOpen > 0 || (settled === 0 && unknown === 0 && notDue > 0)) claimReason = "janela_incompleta";
    else if (unknown > MAX_UNKNOWN_SHARE * (n - notDue)) claimReason = "precos_faltando";
    else if (settled < MIN_SAMPLE) claimReason = "amostra_pequena";
    else if (mixed) claimReason = "modos_misturados";
    // real money pays fees and gas: a claim over decisions that moved money needs the cost of each, or it could call a loss a gain
    else if (counted.some((d) => d.mode === "limitado" && d.costUsd === null)) claimReason = "custo_desconhecido";
    else {
      claimBasis = netUsd !== null ? "liquido" : "bruto";
      claim = (netUsd ?? gross) > 0 ? "acima_de_manter" : "nao_acima_de_manter";
    }
    return { n, overlapping, notionalUsd: notional, settled, pending, unknownPrice: unknown, grossUsd: gross, netUsd, hitRate: settled > 0 ? hits / settled : null, claim, claimBasis, claimReason };
  };

  const allWindows = (marks: readonly DecisionMark[], nowMs: number): Record<WindowId, WindowSummary> => Object.fromEntries(WINDOWS.map((w) => [w.id, windowSummary(marks, w, nowMs)])) as Record<WindowId, WindowSummary>;

  return {
    mark(decision) {
      if (decisions.has(decision.key)) return;
      if (decision.inaction === true) {
        // the cycles repeat the same opinion every few minutes: one mark per token, side and stance per hour is the decision, the rest is the same decision seen again (and a price lookup each)
        const before = lastInaction.get(inactionBet(decision));
        if (before !== undefined && Math.abs(decision.atMs - before) < INACTION_DEDUPE_MS) return;
      }
      deps.append(JSON.stringify(decision));
      decisions.set(decision.key, decision);
      if (decision.inaction === true) lastInaction.set(inactionBet(decision), decision.atMs);
    },
    async settle(nowMs, lookup) {
      let lookups = 0;
      let inactionLookups = 0;
      let orderLookups = 0;
      // the orders first, then the decisions not to act: they are many, and a pile of them must not leave the orders for later
      const all = [...decisions.values()];
      for (const d of [...all.filter((x) => x.inaction !== true), ...all.filter((x) => x.inaction === true)]) {
        if (!measurable(d)) continue;
        for (const w of WINDOWS) {
          const at = slot(d.key, w.id);
          if (settlements.has(at)) continue;
          const target = d.atMs + w.ms;
          if (nowMs < target) continue;
          if ((retryAt.get(at) ?? 0) > nowMs) continue;
          if (lookups >= MAX_LOOKUPS_PER_SETTLE) return;
          if (d.inaction === true) {
            if (inactionLookups >= MAX_INACTION_LOOKUPS_PER_SETTLE) continue;
            inactionLookups++;
          } else {
            // the orders go first but not alone: a backlog of them must not take the share of the decisions not to act, or the purchases the agent skipped would never be priced
            if (orderLookups >= MAX_LOOKUPS_PER_SETTLE - MAX_INACTION_LOOKUPS_PER_SETTLE) continue;
            orderLookups++;
          }
          lookups++;
          let price: number | null = null;
          try {
            price = await lookup(d, target);
          } catch {
            price = null;
          }
          const found = price !== null && Number.isFinite(price) && price >= 0;
          if (!found && nowMs - target < RETRY_LIMIT_MS) {
            retryAt.set(at, nowMs + LOOKUP_BACKOFF_MS);
            continue;
          }
          const settlement: Settlement = { kind: "settlement", key: d.key, window: w.id, settledAtMs: nowMs, priceUsd: found ? price : null, reason: found ? null : "sem_preco" };
          try {
            deps.append(JSON.stringify(settlement));
          } catch {
            continue; // not saved, so not settled: it is tried again
          }
          settlements.set(slot(d.key, w.id), settlement);
        }
      }
    },
    record(windowId, nowMs, sinceMs) {
      const window = WINDOWS.find((w) => w.id === windowId)!;
      const groups = new Map<string, DecisionMark[]>();
      const add = (key: string, d: DecisionMark) => {
        const list = groups.get(key);
        if (list === undefined) groups.set(key, [d]);
        else list.push(d);
      };
      for (const d of decisions.values()) {
        if (d.source !== "modelo" || (sinceMs !== undefined && d.atMs < sinceMs)) continue;
        // a purchase the code closed (the model could only skip) is not the model's choice: it never counts toward a family
        if (d.triggers.includes("fechada_pelo_codigo")) continue;
        if (d.inaction === true) {
          if (d.stance === "hold") add("manter", d);
          else for (const f of d.families) add(f, d);
        } else if (d.side === "sell") add("vender", d);
        else for (const f of d.families) add(f, d);
      }
      const out: Record<string, { n: number; acerto: number | null; medio?: number; melhor?: number; pior?: number }> = {};
      for (const [key, list] of groups) {
        let n = 0;
        let hits = 0;
        // what the TOKEN did in the window after each decision, whatever the side (a hit rate counts signs and hides a tail: selling five winners that rose 199 percent at best still reads as a rate)
        const moves: number[] = [];
        for (const d of independent(list, window).counted) {
          // only a window that has CLOSED and been priced counts (nowMs is the clock the closing is judged on)
          if (nowMs < d.atMs + window.ms) continue;
          const s = settlements.get(slot(d.key, window.id));
          const effect = s === undefined ? null : effectUsd(d, s.priceUsd);
          if (effect === null) continue;
          n++;
          // a family is about BUYING: a skipped purchase is a hit for the family when the price rose (the skip's effect is negative); a real purchase when it earned. Keeping and selling are hits when they earned.
          const hit = d.inaction === true && d.stance === "skip" ? effect < 0 : effect > 0;
          if (hit) hits++;
          const p0 = d.entryPriceUsd;
          if (s !== undefined && s.priceUsd !== null && p0 !== null && Number.isFinite(p0) && p0 > 0 && Number.isFinite(s.priceUsd)) moves.push((s.priceUsd / p0 - 1) * 100);
        }
        if (n > 0) {
          const measured = n >= RECORD_MIN_N && moves.length > 0;
          const one = (v: number): number => Math.round(v * 10) / 10;
          out[key] = { n, acerto: n >= RECORD_MIN_N ? Math.round((100 * hits) / n) : null, ...(measured ? { medio: one(moves.reduce((a, b) => a + b, 0) / moves.length), melhor: one(Math.max(...moves)), pior: one(Math.min(...moves)) } : {}) };
        }
      }
      return out;
    },
    summary(nowMs, sinceMs) {
      const all = [...decisions.values()].filter((d) => sinceMs === undefined || d.atMs >= sinceMs);
      // the decisions not to act are a different experiment from the orders: they have their own windows and the board of the orders does not see them
      const inactionMarks = all.filter((d) => d.inaction === true);
      const marks = all.filter((d) => d.inaction !== true);
      const byMode: Partial<Record<Mode, Record<WindowId, WindowSummary>>> = {};
      for (const mode of new Set(marks.map((d) => d.mode))) byMode[mode] = allWindows(marks.filter((d) => d.mode === mode), nowMs);
      return { inaction: { decisions: inactionMarks.length, windows: allWindows(inactionMarks, nowMs) }, decisions: marks.length, protective: marks.filter((d) => d.source === "protecao").length, noEntryPrice: marks.filter((d) => !measurable(d)).length, windows: allWindows(marks, nowMs), byMode };
    },
  };
}
