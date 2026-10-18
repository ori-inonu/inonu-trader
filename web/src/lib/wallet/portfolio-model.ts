/**
 * The portfolio as numbers and plain facts (PF-2, PF-3): what the reading holds, added over every network, and how it is spread. The code DESCRIBES and never says what to do:
 * the facts are measurements ("77% of the value is in ETH"), and what to do about them is the Inonu's answer, asked by a click, never a sentence written here.
 *
 * The total is the sum of what has a price and is not marked as risk by the provider; what is marked, and what has no price, are kept apart and named, because a balance with no price
 * is not worth zero and a token that was dropped on a wallet can carry a price no market pays. The provider's own "total value" is not used: this one is the sum of the rows on the screen.
 */
import type { BalanceRow } from "./holdings";

/** Stable coins by symbol, in the spellings the networks use (case and dots do not matter). */
const STABLE: ReadonlySet<string> = new Set([
  "USDT", "USDC", "DAI", "USDE", "FDUSD", "TUSD", "USDD", "PYUSD", "USDG", "USDS", "FRAX", "LUSD", "USD0", "USDB", "BUSD", "GUSD", "USDP", "CRVUSD", "GHO", "EURC", "USDT0", "USDCE", "USDBC", "USDTE", "DAIE",
]);

const normalize = (symbol: string): string => symbol.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
export const isStable = (symbol: string): boolean => STABLE.has(normalize(symbol));

export interface PositionGroup {
  /** As the provider writes it (the first row's spelling). */
  readonly symbol: string;
  readonly balance: number;
  /** The sum of the priced rows; null when none of them has a price. */
  readonly valueUsd: number | null;
  /** Of the total; null when the position is not counted in it. */
  readonly sharePct: number | null;
  /** The networks it is on, the largest value first. */
  readonly chains: readonly string[];
  readonly stable: boolean;
  readonly rows: readonly BalanceRow[];
}

export interface NetworkShare {
  readonly chainIndex: string;
  readonly valueUsd: number;
  readonly sharePct: number;
  /** How many of the counted holdings are on it. */
  readonly count: number;
}

export interface PortfolioView {
  /** The sum of the counted holdings; null when none has a price. */
  readonly totalUsd: number | null;
  /** The counted positions, the largest value first. */
  readonly groups: readonly PositionGroup[];
  /** Positions with no price: kept, not valued. */
  readonly unpriced: readonly PositionGroup[];
  /** Positions the provider marks as risk: out of the total. */
  readonly flagged: readonly PositionGroup[];
  readonly byNetwork: readonly NetworkShare[];
  readonly stableSharePct: number | null;
  /** Plain measurements, in the order a person reads them. */
  readonly facts: readonly string[];
}

const MONEY = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const DUST_USD = 1;

function group(rows: readonly BalanceRow[], total: number | null): PositionGroup[] {
  const by = new Map<string, BalanceRow[]>();
  for (const r of rows) {
    const key = normalize(r.symbol) || r.symbol;
    by.set(key, [...(by.get(key) ?? []), r]);
  }
  const out: PositionGroup[] = [];
  for (const list of by.values()) {
    const priced = list.filter((r) => r.valueUsd !== null);
    const valueUsd = priced.length === 0 ? null : priced.reduce((sum, r) => sum + (r.valueUsd ?? 0), 0);
    const perChain = new Map<string, number>();
    for (const r of list) perChain.set(r.chainIndex, (perChain.get(r.chainIndex) ?? 0) + (r.valueUsd ?? 0));
    out.push({
      symbol: list[0]!.symbol,
      balance: list.reduce((sum, r) => sum + r.balance, 0),
      valueUsd,
      sharePct: total !== null && total > 0 && valueUsd !== null ? (valueUsd / total) * 100 : null,
      chains: [...perChain.entries()].sort((a, b) => b[1] - a[1]).map(([chain]) => chain),
      stable: isStable(list[0]!.symbol),
      rows: list,
    });
  }
  return out.sort((a, b) => (b.valueUsd ?? -1) - (a.valueUsd ?? -1));
}

const plural = (n: number, one: string, many: string): string => (n === 1 ? one : many);

export function buildPortfolio(rows: readonly BalanceRow[], unanswered: readonly string[]): PortfolioView {
  const counted = rows.filter((r) => !r.flaggedRisk && r.valueUsd !== null);
  const unpricedRows = rows.filter((r) => !r.flaggedRisk && r.valueUsd === null);
  const flaggedRows = rows.filter((r) => r.flaggedRisk);
  const totalUsd = counted.length === 0 ? null : counted.reduce((sum, r) => sum + (r.valueUsd ?? 0), 0);

  const groups = group(counted, totalUsd);
  const unpriced = group(unpricedRows, null);
  const flagged = group(flaggedRows, null);

  const netValue = new Map<string, { value: number; count: number }>();
  for (const r of counted) {
    const at = netValue.get(r.chainIndex) ?? { value: 0, count: 0 };
    at.value += r.valueUsd ?? 0;
    at.count += 1;
    netValue.set(r.chainIndex, at);
  }
  const byNetwork: NetworkShare[] = [...netValue.entries()]
    .map(([chainIndex, v]) => ({ chainIndex, valueUsd: v.value, sharePct: totalUsd !== null && totalUsd > 0 ? (v.value / totalUsd) * 100 : 0, count: v.count }))
    .sort((a, b) => b.valueUsd - a.valueUsd);

  const stableValue = groups.filter((g) => g.stable).reduce((sum, g) => sum + (g.valueUsd ?? 0), 0);
  const stableSharePct = totalUsd !== null && totalUsd > 0 ? (stableValue / totalUsd) * 100 : null;

  const facts: string[] = [];
  const top = groups[0];
  if (totalUsd !== null && top !== undefined && top.sharePct !== null) facts.push(`A maior parte e ${top.symbol}, com ${Math.round(top.sharePct)}% do valor.`);
  if (stableSharePct !== null) {
    const names = groups.filter((g) => g.stable).slice(0, 3).map((g) => g.symbol);
    facts.push(stableSharePct > 0 ? `${Math.round(stableSharePct)}% do valor esta em moedas estaveis (${names.join(", ")}).` : "Nenhuma parte do valor esta em moedas estaveis.");
  }
  if (byNetwork.length > 0) facts.push(byNetwork.length === 1 ? "Todo o valor esta em uma rede." : `O valor esta em ${byNetwork.length} redes.`);
  const small = groups.filter((g) => (g.valueUsd ?? 0) < DUST_USD);
  if (small.length >= 2) facts.push(`${small.length} posicoes pequenas (menos de US$ ${DUST_USD}) somam US$ ${MONEY.format(small.reduce((sum, g) => sum + (g.valueUsd ?? 0), 0))}.`);
  if (unpriced.length > 0) facts.push(`${unpriced.length} ${plural(unpriced.length, "token sem preco ficou", "tokens sem preco ficaram")} fora do total.`);
  if (flagged.length > 0) facts.push(`${flagged.length} ${plural(flagged.length, "token marcado como risco pelo provedor ficou", "tokens marcados como risco pelo provedor ficaram")} fora do total.`);
  if (unanswered.length > 0) facts.push(`${unanswered.length} ${plural(unanswered.length, "rede nao respondeu", "redes nao responderam")}.`);

  return { totalUsd, groups, unpriced, flagged, byNetwork, stableSharePct, facts };
}

export interface AllocationSegment {
  readonly label: string;
  readonly sharePct: number;
  readonly valueUsd: number;
}

/** The bar of the allocation: the largest positions each with its share, the rest together as "Outros". */
export function allocationSegments(view: PortfolioView, max = 5): AllocationSegment[] {
  const valued = view.groups.filter((g) => g.valueUsd !== null && g.sharePct !== null);
  if (valued.length === 0) return [];
  const head = valued.slice(0, max).map((g) => ({ label: g.symbol, sharePct: g.sharePct ?? 0, valueUsd: g.valueUsd ?? 0 }));
  const rest = valued.slice(max);
  if (rest.length === 0) return head;
  return [...head, { label: "Outros", sharePct: rest.reduce((sum, g) => sum + (g.sharePct ?? 0), 0), valueUsd: rest.reduce((sum, g) => sum + (g.valueUsd ?? 0), 0) }];
}
