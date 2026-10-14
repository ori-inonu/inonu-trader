/**
 * Reading the whole portfolio (PF-1): what an address holds on EVERY network the provider reads for an 0x address, through the local gateway, in small groups of networks.
 *
 * Why groups: the provider refuses a request for many networks at once when the address holds a lot of tokens (seen live: four networks answer, six do not), so the networks go
 * in groups of four, and a group that is refused is asked again network by network: one network that still will not answer is counted and named, and the others stay. An error that
 * holds for every network (the quota, the credentials, the clock, an old server) stops the reading, because asking again would only repeat it.
 *
 * Reading is free of charge (the free layer of the gateway), never talks to the model, never signs and never sends: it is the same balances route "Ler minha carteira" always used.
 */
import { SWITCHABLE_CHAINS } from "./chains";
import type { OnchainMeta } from "../onchain/client";
import { MAX_CHAINS, SOLANA_CHAIN_INDEX, type BalanceRow, type BalancesData, type HoldingsError, type HoldingsReader, type HoldingsResult, type NetworkRow } from "./holdings";

/** Networks of the provider's list that do not use an 0x address (their holder has another kind of address), and the test networks: an 0x address has nothing to read there. */
const NOT_FOR_AN_EVM_ADDRESS: ReadonlySet<string> = new Set([
  "0", // Bitcoin
  "2", // Litecoin
  "3", // Dogecoin
  "5", // Dash
  "145", // Bitcoin Cash
  "195", // TRON
  "607", // TON
  "637", // Aptos
  "784", // SUI
  SOLANA_CHAIN_INDEX,
  "11155111", // Sepolia
]);

/** The networks most people hold on come first, so the screen has something to show after the first group. */
const MOST_USED: readonly string[] = ["1", "8453", "42161", "10", "137", "56", "196", "143", "43114", "59144", "324", "534352", "81457", "5000"];

/** The networks to read for an 0x address, from the provider's own list (or, when the list did not come, from the registry of the app). Each number once, the most used first. */
export function evmNetworksToRead(list: readonly NetworkRow[] | null): string[] {
  const offered = list === null ? SWITCHABLE_CHAINS.map((c) => c.chainIndex) : list.map((n) => n.chainIndex);
  const usable = [...new Set(offered)].filter((c) => !NOT_FOR_AN_EVM_ADDRESS.has(c));
  const first = MOST_USED.filter((c) => usable.includes(c));
  return [...first, ...usable.filter((c) => !first.includes(c))];
}

export interface PortfolioReading {
  /** When the last answer arrived on this page. */
  readonly receivedAtMs: number;
  /** When the oldest answer was observed by the gateway, on the clock of this page: the moment it arrived minus the age the gateway reported. */
  readonly observedAtMs: number;
  /** The networks that were asked. */
  readonly networks: readonly string[];
  /** The networks the provider would not answer for even alone. */
  readonly unanswered: readonly string[];
  /** Every holding, the largest value first; one with no price after every priced one. */
  readonly rows: readonly BalanceRow[];
  /** Some answer was served from an old copy because the provider failed. */
  readonly stale: boolean;
  /** How many holdings the provider had before the gateway kept the largest of each answer: the sum over the answers. */
  readonly total: number;
  /** What the screen says about how old and from where it is: the oldest age the gateway reported, any copy served after a failure, the oldest moment it cached. */
  readonly meta: OnchainMeta;
}

export type PortfolioReadResult = { readonly ok: true; readonly reading: PortfolioReading } | { readonly ok: false; readonly error: HoldingsError };

export interface PortfolioReadOptions {
  readonly address: string;
  readonly networks: readonly string[];
  /** How many networks go in one request. */
  readonly chunk?: number;
  readonly signal?: AbortSignal;
  readonly now: () => number;
  /** Called after each group with what was read so far: `done` of `total` networks have been asked. */
  readonly onProgress?: (reading: PortfolioReading, done: number, total: number) => void;
}

/** The refusals of one network or one group that are the provider's alone: asking the networks one by one is the way on. Everything else holds for all of them. */
const PER_GROUP: ReadonlySet<HoldingsError> = new Set<HoldingsError>(["provider_error", "schema", "unsupported_chain"]);

const byValue = (a: BalanceRow, b: BalanceRow): number => (b.valueUsd ?? -1) - (a.valueUsd ?? -1);

export async function readPortfolioBalances(reader: HoldingsReader, options: PortfolioReadOptions): Promise<PortfolioReadResult> {
  const networks = [...new Set(options.networks)];
  const size = Math.max(1, Math.min(options.chunk ?? 4, MAX_CHAINS));
  if (networks.length === 0) return { ok: false, error: "bad_request" };

  const rows: BalanceRow[] = [];
  const unanswered: string[] = [];
  let answered = 0;
  let stale = false;
  let total = 0;
  let maxAgeMs = 0;
  let oldestCachedMs = Number.POSITIVE_INFINITY;
  let lastMeta: OnchainMeta | null = null;
  let receivedAtMs = 0;
  let observedAtMs = Number.POSITIVE_INFINITY;
  let done = 0;
  let firstError: HoldingsError | null = null;

  const snapshot = (): PortfolioReading => ({
    receivedAtMs,
    observedAtMs: Number.isFinite(observedAtMs) ? observedAtMs : receivedAtMs,
    networks,
    unanswered: [...unanswered],
    rows: [...rows].sort(byValue),
    stale,
    total,
    // before any answer there is no meta to speak of: the first answer sets it, and a reading is only handed out after one
    meta: { ...(lastMeta ?? { tier: "free", cachedAtMs: receivedAtMs, ageMs: 0, stale: false, budget: { tier: "free", used: 0, cap: null } }), ageMs: maxAgeMs, stale, cachedAtMs: Number.isFinite(oldestCachedMs) ? oldestCachedMs : receivedAtMs },
  });

  /** One request; true when it answered, false when the provider refused it alone, and a thrown value for an error that holds for every network. */
  async function ask(chains: readonly string[]): Promise<boolean> {
    const result = await reader.balances({ address: options.address, chains }, options.signal);
    if (!result.ok) {
      if (PER_GROUP.has(result.error)) {
        firstError ??= result.error;
        return false;
      }
      throw result.error;
    }
    const at = options.now();
    answered += 1;
    stale = stale || result.meta.stale;
    total += result.data.total;
    maxAgeMs = Math.max(maxAgeMs, Math.max(0, result.meta.ageMs));
    oldestCachedMs = Math.min(oldestCachedMs, result.meta.cachedAtMs);
    lastMeta = result.meta;
    receivedAtMs = Math.max(receivedAtMs, at);
    observedAtMs = Math.min(observedAtMs, at - Math.max(0, result.meta.ageMs));
    rows.push(...result.data.rows);
    return true;
  }

  try {
    for (let i = 0; i < networks.length; i += size) {
      if (options.signal?.aborted) return { ok: false, error: "cancelled" };
      const group = networks.slice(i, i + size);
      if (!(await ask(group))) {
        if (group.length === 1) unanswered.push(group[0]!);
        // a group the provider refuses is asked again one network at a time
        else {
          for (const chain of group) {
            if (options.signal?.aborted) return { ok: false, error: "cancelled" };
            if (!(await ask([chain]))) unanswered.push(chain);
          }
        }
      }
      done += group.length;
      options.onProgress?.(snapshot(), done, networks.length);
    }
  } catch (error) {
    return { ok: false, error: error as HoldingsError };
  }
  if (options.signal?.aborted) return { ok: false, error: "cancelled" };
  // every request was refused: that is the provider's error, not a wallet with nothing in it
  if (answered === 0) return { ok: false, error: firstError ?? "provider_error" };
  return { ok: true, reading: snapshot() };
}

/** The reading of the portfolio in the shape the "Minha carteira" panel already draws for its balances: the rows, how many there were, and where and how old they are. */
export function balancesResultOf(result: PortfolioReadResult): HoldingsResult<BalancesData> {
  if (!result.ok) return { ok: false, error: result.error };
  return { ok: true, data: { rows: result.reading.rows, total: Math.max(result.reading.total, result.reading.rows.length) }, meta: result.reading.meta };
}
