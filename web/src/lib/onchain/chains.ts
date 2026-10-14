/**
 * Static metadata of the networks the desk knows by name (spec CHN-1) and the pure function that
 * turns the two API lists into the chips of a dock tab. The display order is fixed by the user's
 * request: X Layer, Robinhood, Arc, Bitcoin, Ethereum, Solana and Tron first; then Base, BNB Chain
 * and SUI; then every other network the API reported, in the API's own order and name.
 *
 * A chip is disabled only with a stated reason, and only after the corresponding list actually
 * answered: before the lists arrive nothing is disabled, because a missing answer is not a fact.
 */

/** Known networks: chainIndex, display name and the 2-4 letter badge of the chip. */
export interface ChainMeta {
  readonly chainIndex: string;
  readonly name: string;
  readonly short: string;
}

export const CHAIN_ORDER: readonly ChainMeta[] = [
  { chainIndex: "196", name: "X Layer", short: "XL" },
  { chainIndex: "4663", name: "Robinhood", short: "RH" },
  { chainIndex: "5042", name: "Arc", short: "ARC" },
  { chainIndex: "0", name: "Bitcoin", short: "BTC" },
  { chainIndex: "1", name: "Ethereum", short: "ETH" },
  { chainIndex: "501", name: "Solana", short: "SOL" },
  { chainIndex: "195", name: "Tron", short: "TRX" },
  { chainIndex: "8453", name: "Base", short: "BASE" },
  { chainIndex: "56", name: "BNB Chain", short: "BNB" },
  { chainIndex: "784", name: "SUI", short: "SUI" },
];

export interface ChainChip {
  readonly chainIndex: string;
  readonly name: string;
  readonly short: string;
  readonly enabled: boolean;
  readonly reason: string | null;
}

export interface ApiChainLike {
  readonly chainIndex: string;
  readonly name: string | null;
}

/** What disables a chip once its lists have answered. */
export interface ChainSupport {
  /** Null until `market/supported/chain` answered; then the list it returned (possibly empty). */
  readonly apiChains: readonly ApiChainLike[] | null;
  /** Null until the resource's supported/chain list answered; otherwise that list. */
  readonly resourceChains: readonly ApiChainLike[] | null;
  /** The resource in words, used inside the reason, e.g. "sinais" or "leaderboard". */
  readonly resourceLabel: string;
}

/** Letters for an unknown chain: the first alphanumerics of the name, uppercased, 2-4 chars. */
function shortOf(name: string): string {
  const clean = name.replace(/[^A-Za-z0-9]/g, "");
  if (clean.length === 0) return "?";
  return clean.slice(0, 4).toUpperCase();
}

/**
 * The chip order: the ten known networks in CHAIN_ORDER, then the API extras. Disabled chips keep
 * their place and carry the reason; nothing is hidden just because it is unsupported.
 */
export function chainChips(support: ChainSupport): ChainChip[] {
  const apiSet = support.apiChains === null ? null : new Set(support.apiChains.map((c) => c.chainIndex));
  const resSet = support.resourceChains === null ? null : new Set(support.resourceChains.map((c) => c.chainIndex));
  const known = new Set(CHAIN_ORDER.map((c) => c.chainIndex));

  const state = (chainIndex: string): { enabled: boolean; reason: string | null } => {
    if (apiSet !== null && !apiSet.has(chainIndex)) return { enabled: false, reason: "Nao listada pela API do OnchainOS" };
    if (resSet !== null && !resSet.has(chainIndex)) return { enabled: false, reason: `Sem suporte a ${support.resourceLabel} nesta rede` };
    return { enabled: true, reason: null };
  };

  const chips: ChainChip[] = CHAIN_ORDER.map((c) => ({ ...c, ...state(c.chainIndex) }));
  for (const api of support.apiChains ?? []) {
    if (known.has(api.chainIndex)) continue;
    const name = api.name ?? `Rede ${api.chainIndex}`;
    chips.push({ chainIndex: api.chainIndex, name, short: shortOf(name), ...state(api.chainIndex) });
  }
  return chips;
}
