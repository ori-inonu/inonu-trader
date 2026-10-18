/**
 * What one click on "Pedir ao Inonu" may ask the OnchainOS gateway (fase-2 SPEC F2-DIG-4, tabelas 4.2 e 4.3). A plan is a list
 * of calls decided BEFORE any call leaves: the cap of 15 (API-3) is applied to it, the tier of each item is declared, and an
 * item that cannot be called (the route does not exist yet, the chain is not covered, an input is missing) says why instead of
 * silently disappearing. Pure.
 */
import { endpointFor } from "../onchain-read/catalog";

export const MAX_ONCHAIN_CALLS = 15;

export interface PlanItem {
  readonly id: string;
  readonly route: string;
  readonly params: Readonly<Record<string, string>>;
  readonly tier: "free" | "basic" | "premium";
  /** False when the portal does not publish the tier of the endpoint: it is counted as Basic until F2-MED-1 measures it. */
  readonly tierKnown: boolean;
  readonly available: boolean;
  readonly reason?: string;
}

export interface TierCounts {
  readonly free: number;
  readonly basic: number;
  readonly premium: number;
  readonly unknown: number;
}

export function tierCounts(items: readonly PlanItem[]): TierCounts {
  let free = 0;
  let basic = 0;
  let premium = 0;
  let unknown = 0;
  for (const item of items) {
    if (!item.tierKnown) unknown += 1;
    else if (item.tier === "free") free += 1;
    else if (item.tier === "basic") basic += 1;
    else premium += 1;
  }
  return { free, basic, premium, unknown };
}

/** The callable items up to the cap, in order; the rest is cut, and the items that cannot be called are listed apart. */
export function cutPlan(items: readonly PlanItem[], max = MAX_ONCHAIN_CALLS): { kept: PlanItem[]; cut: PlanItem[]; skipped: PlanItem[] } {
  const callable = items.filter((i) => i.available);
  return { kept: callable.slice(0, max), cut: callable.slice(max), skipped: items.filter((i) => !i.available) };
}

function item(id: string, route: string, params: Record<string, string>, tier: PlanItem["tier"], opts: { tierKnown?: boolean; blocked?: string } = {}): PlanItem {
  const reason = opts.blocked ?? (endpointFor(route) === undefined ? "rota_inexistente" : undefined);
  return { id, route, params, tier, tierKnown: opts.tierKnown ?? true, available: reason === undefined, ...(reason === undefined ? {} : { reason }) };
}

const SYMBOL = /^[A-Za-z0-9]{1,20}$/;

export interface TokenPlanInput {
  readonly chainIndex: string;
  /** The contract address the person is asking about. */
  readonly token: string;
  /** What the person typed when they gave a symbol and not an address: the only case that needs a search. */
  readonly symbolQuery?: string | undefined;
  /** The symbol of the token, for the sentiment (which is by symbol). */
  readonly symbol?: string | undefined;
  /** What to quote with: the token on the other side and a whole amount in its smallest unit. */
  readonly quote?: { readonly fromToken: string; readonly amount: string } | undefined;
}

/** T1 to T13: the plan of the token mode. */
export function planTokenMode(input: TokenPlanInput): PlanItem[] {
  const { chainIndex, token } = input;
  const base = { chainIndex, token };
  const query = input.symbolQuery;
  const symbolOk = input.symbol !== undefined && SYMBOL.test(input.symbol);
  return [
    item("T1", "/onchain/search", { chainIndex, q: query ?? "" }, "basic", query === undefined || query.length < 2 ? { blocked: "nao_pedido" } : {}),
    item("T2", "/onchain/price-info", base, "premium"),
    item("T3", "/onchain/candles", { ...base, bar: "1H", limit: "120" }, "basic"),
    item("T4", "/onchain/trades", { ...base, limit: "100" }, "basic"),
    item("T5", "/onchain/trades", { ...base, tagFilter: "3", limit: "100" }, "basic"),
    item("T6", "/onchain/signals", { ...base, limit: "50" }, "premium"),
    item("T7", "/onchain/top-traders", { ...base, tagFilter: "3", limit: "20" }, "premium"),
    item("T8", "/onchain/token-risk", base, "premium"),
    item("T9", "/onchain/pools", base, "basic"),
    item("T10", "/onchain/clusters", base, "premium"),
    item("T11", "/onchain/cluster-top-holders", { ...base, rangeFilter: "1" }, "premium"),
    item("T12", "/onchain/sentiment", { symbol: input.symbol ?? "" }, "basic", { tierKnown: false, ...(symbolOk ? {} : { blocked: "sem_simbolo" }) }),
    item(
      "T13",
      "/onchain/quote",
      { chainIndex, amount: input.quote?.amount ?? "", fromToken: input.quote?.fromToken ?? "", toToken: token },
      "basic",
      { tierKnown: false, ...(input.quote === undefined ? { blocked: "sem_par_de_cotacao" } : {}) },
    ),
  ];
}

/** Wallet consultations consume price windows and risk first, then flow when the per-token cap permits it. */
export function planPortfolioToken(input: Pick<TokenPlanInput, "chainIndex" | "token">): PlanItem[] {
  const base = { chainIndex: input.chainIndex, token: input.token };
  return [
    item("T2", "/onchain/price-info", base, "premium"),
    item("T8", "/onchain/token-risk", base, "premium"),
    item("T4", "/onchain/trades", { ...base, limit: "100" }, "basic"),
  ];
}

export interface DiscoveryPlanInput {
  readonly chainIndex: string;
  /** The best tokens of the first reads, best first; only the first three are deepened. */
  readonly leaders: readonly string[];
  /** Whether `memepump/supported/chainsProtocol` lists this chain. */
  readonly trenchesChain: boolean;
  /** Whether F2-OCX-11 found the address tracker family enabled for the key. */
  readonly trackerEnabled: boolean;
}

/** Until `price-info` accepts a list (F2-MED-2) the batch of the short list is not callable. */
const PRICE_INFO_BATCH = false;

/** D1 to D14: the plan of the discovery mode. Fewer than three leaders means fewer deepening calls. */
export function planDiscoveryMode(input: DiscoveryPlanInput): PlanItem[] {
  const { chainIndex } = input;
  const leaders = input.leaders.slice(0, 3);
  const items: PlanItem[] = [
    item("D1", "/onchain/hot-tokens", { chainIndex, limit: "50" }, "basic"),
    item("D2", "/onchain/signals", { chainIndex, limit: "50" }, "premium"),
    item("D3", "/onchain/address-tracker", { chainIndex }, "basic", { tierKnown: false, ...(input.trackerEnabled ? {} : { blocked: "familia_nao_habilitada" }) }),
    item("D4", "/onchain/trenches", { chainIndex, stage: "NEW" }, "premium", input.trenchesChain ? {} : { blocked: "rede_nao_suportada" }),
    item("D5", "/onchain/price-info", { chainIndex, token: leaders[0] ?? "" }, "premium", PRICE_INFO_BATCH ? {} : { blocked: "lote_nao_suportado" }),
  ];
  const deepen = (firstId: number, route: string, tier: PlanItem["tier"]) =>
    leaders.forEach((token, i) => items.push(item(`D${firstId + i}`, route, { chainIndex, token }, tier)));
  deepen(6, "/onchain/token-risk", "premium");
  deepen(9, "/onchain/clusters", "premium");
  deepen(12, "/onchain/pools", "basic");
  return items;
}
