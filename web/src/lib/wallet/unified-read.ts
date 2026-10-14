/**
 * "Minha carteira" read ONCE across both kinds of account (T9.4, WAL-4): the EVM address on its networks and the Solana account on network 501, put together in one reading
 * with one total, one list of holdings and one history.
 *
 * Why it is not one request: an EVM address and a Solana account are different families (the gateway takes an address with the networks of its family and no other), and the provider
 * refuses a request for many networks at once when the address holds a lot of tokens (seen live: four networks answer, six do not). So the EVM networks go in groups of four for each
 * route, a group that is refused is asked again network by network, and the Solana account is a read of its own. A network, a route or a whole account that does not answer is NAMED in
 * `missing`: the total is then what the rest adds up to, and the screen says it is partial. Nothing is ever turned into zero, and an error that holds for every request (the quota,
 * the credentials, the clock, an old server) stops that side instead of being asked again.
 *
 * Reading is free of charge (the free layer of the gateway), never talks to the model, never signs and never sends.
 */
import type { OnchainMeta } from "../onchain/client";
import {
  holdingsErrorText, MAX_CHAINS, SOLANA_CHAIN_INDEX,
  type BalanceRow, type BalancesData, type HistoryData, type HistoryRow, type HoldingsError, type HoldingsReader, type HoldingsResult, type ValueData,
} from "./holdings";
import { networkLabel } from "./network-label";

export interface UnifiedTarget {
  /** The EVM address and the networks to read for it, or null when there is none. */
  readonly evm: { readonly address: string; readonly networks: readonly string[] } | null;
  /** The Solana account, read on network 501 alone, or null when there is none. */
  readonly solana: { readonly address: string } | null;
}

/** What to read, or null when there is no account of either family. */
export function unifiedTarget(from: { readonly evmAccount: string | null; readonly solanaAccount: string | null; readonly evmNetworks: readonly string[] }): UnifiedTarget | null {
  const evm = from.evmAccount !== null && from.evmNetworks.length > 0 ? { address: from.evmAccount, networks: from.evmNetworks } : null;
  const solana = from.solanaAccount !== null ? { address: from.solanaAccount } : null;
  return evm === null && solana === null ? null : { evm, solana };
}

export type MissingWhat = "valor" | "saldos" | "historico";

/** One thing the reading could not get: which network or account, which block, and why in our words. */
export interface MissingPart {
  readonly label: string;
  readonly what: MissingWhat;
  readonly reason: string;
}

export interface UnifiedReadout {
  /** The moment on this screen when the last answer arrived. */
  readonly receivedAtMs: number;
  /** The networks that were asked: the EVM ones, then Solana. */
  readonly networks: readonly string[];
  readonly value: HoldingsResult<ValueData>;
  readonly balances: HoldingsResult<BalancesData>;
  readonly history: HoldingsResult<HistoryData>;
  readonly missing: readonly MissingPart[];
}

export interface UnifiedReadOptions {
  readonly now: () => number;
  readonly signal?: AbortSignal;
  /** How many EVM networks go in one request. Default four. */
  readonly chunk?: number;
}

type Reader = Pick<HoldingsReader, "value" | "balances" | "history">;

interface Answer<T> {
  readonly data: T;
  readonly meta: OnchainMeta;
  /** When it arrived on this page. */
  readonly at: number;
}

/** What one side (the EVM address or the Solana account) got for one route: some answers (perhaps none, when every one was "no data") and the networks that would not answer. */
type Part<T> =
  | { readonly ok: true; readonly answers: readonly Answer<T>[]; readonly unanswered: readonly { readonly chain: string; readonly error: HoldingsError }[] }
  | { readonly ok: false; readonly error: HoldingsError };

/** The refusals of one network or one group that are the provider's alone: asking the networks one by one is the way on. Everything else holds for all of them. */
const PER_GROUP: ReadonlySet<HoldingsError> = new Set<HoldingsError>(["provider_error", "schema", "unsupported_chain"]);

type Step = { readonly kind: "ok" | "empty" } | { readonly kind: "refused" | "fatal"; readonly error: HoldingsError };

/** Reads the networks of one side for one route, in groups; null when the reading was cancelled. */
async function readGrouped<T>(
  chains: readonly string[],
  size: number,
  options: UnifiedReadOptions,
  ask: (chains: readonly string[]) => Promise<HoldingsResult<T>>,
): Promise<Part<T> | null> {
  const answers: Answer<T>[] = [];
  const unanswered: { chain: string; error: HoldingsError }[] = [];
  let empty = 0;

  async function step(group: readonly string[]): Promise<Step | null> {
    const result = await ask(group);
    if (options.signal?.aborted) return null;
    if (result.ok) {
      answers.push({ data: result.data, meta: result.meta, at: options.now() });
      return { kind: "ok" };
    }
    if (result.error === "cancelled") return null;
    // the provider has nothing for this address on these networks: an answer, not a refusal
    if (result.error === "sem_dados") {
      empty += 1;
      return { kind: "empty" };
    }
    return PER_GROUP.has(result.error) ? { kind: "refused", error: result.error } : { kind: "fatal", error: result.error };
  }

  for (let i = 0; i < chains.length; i += size) {
    if (options.signal?.aborted) return null;
    const group = chains.slice(i, i + size);
    const first = await step(group);
    if (first === null) return null;
    if (first.kind === "fatal") return { ok: false, error: first.error };
    if (first.kind !== "refused") continue;
    if (group.length === 1) {
      unanswered.push({ chain: group[0]!, error: first.error });
      continue;
    }
    // a group the provider refuses is asked again one network at a time
    for (const chain of group) {
      if (options.signal?.aborted) return null;
      const one = await step([chain]);
      if (one === null) return null;
      if (one.kind === "fatal") return { ok: false, error: one.error };
      if (one.kind === "refused") unanswered.push({ chain, error: one.error });
    }
  }
  if (answers.length === 0 && empty === 0) return { ok: false, error: unanswered[0]?.error ?? "provider_error" };
  return { ok: true, answers, unanswered };
}

/** How old the oldest answer is, measured when the reading ended: a slow group does not make an earlier answer look fresher than it is. */
function mergeMeta(answers: readonly Answer<unknown>[], receivedAtMs: number): OnchainMeta {
  const first = answers[0]!;
  return {
    tier: first.meta.tier,
    cachedAtMs: Math.min(...answers.map((a) => a.meta.cachedAtMs)),
    ageMs: Math.max(...answers.map((a) => Math.max(0, receivedAtMs - a.at) + Math.max(0, a.meta.ageMs))),
    stale: answers.some((a) => a.meta.stale),
    budget: answers.map((a) => a.meta.budget).reduce((most, b) => (b.used > most.used ? b : most)),
  };
}

const byValue = (a: BalanceRow, b: BalanceRow): number => (b.valueUsd ?? -1) - (a.valueUsd ?? -1);

/** Puts what the sides got for one block together, and says what is missing. */
function mergeBlock<T>(
  sides: readonly { readonly label: string; readonly part: Part<T> | undefined }[],
  what: MissingWhat,
  combine: (answers: readonly Answer<T>[]) => T,
  receivedAtMs: number,
  missing: MissingPart[],
): HoldingsResult<T> {
  const asked = sides.flatMap((s) => (s.part === undefined ? [] : [{ label: s.label, part: s.part }]));
  for (const { label, part } of asked) {
    if (!part.ok) missing.push({ label, what, reason: holdingsErrorText(part.error) });
    else for (const u of part.unanswered) missing.push({ label: networkLabel(u.chain), what, reason: holdingsErrorText(u.error) });
  }
  const answers = asked.flatMap(({ part }) => (part.ok ? part.answers : []));
  if (answers.length === 0) {
    // every side that answered had no data: that is "no data"; otherwise the first thing that went wrong
    if (asked.some(({ part }) => part.ok)) return { ok: false, error: "sem_dados" };
    const error = asked.map(({ part }) => (part.ok ? null : part.error)).find((e): e is HoldingsError => e !== null) ?? "provider_error";
    return { ok: false, error };
  }
  return { ok: true, data: combine(answers), meta: mergeMeta(answers, receivedAtMs) };
}

/** The reading of the target as one: null when it was cancelled (nothing of it must be applied). */
export async function readUnified(reader: Reader, target: UnifiedTarget, options: UnifiedReadOptions): Promise<UnifiedReadout | null> {
  if (options.signal?.aborted) return null;
  const size = Math.max(1, Math.min(options.chunk ?? 4, MAX_CHAINS));
  const { evm, solana } = target;
  const sol = solana === null ? null : { address: solana.address, chains: [SOLANA_CHAIN_INDEX] as const };
  const signal = options.signal;

  const [evmValue, evmBalances, evmHistory, solValue, solBalances, solHistory] = await Promise.all([
    evm === null ? undefined : readGrouped(evm.networks, size, options, (chains) => reader.value({ address: evm.address, chains }, signal)),
    evm === null ? undefined : readGrouped(evm.networks, size, options, (chains) => reader.balances({ address: evm.address, chains }, signal)),
    evm === null ? undefined : readGrouped(evm.networks, size, options, (chains) => reader.history({ address: evm.address, chains }, signal)),
    sol === null ? undefined : readGrouped(sol.chains, 1, options, (chains) => reader.value({ address: sol.address, chains }, signal)),
    sol === null ? undefined : readGrouped(sol.chains, 1, options, (chains) => reader.balances({ address: sol.address, chains }, signal)),
    sol === null ? undefined : readGrouped(sol.chains, 1, options, (chains) => reader.history({ address: sol.address, chains }, signal)),
  ]);
  if (options.signal?.aborted || [evmValue, evmBalances, evmHistory, solValue, solBalances, solHistory].some((p) => p === null)) return null;

  const receivedAtMs = options.now();
  const missing: MissingPart[] = [];
  const evmLabel = "Redes EVM";
  const solanaLabel = networkLabel(SOLANA_CHAIN_INDEX);

  const value = mergeBlock<ValueData>(
    [{ label: evmLabel, part: evmValue ?? undefined }, { label: solanaLabel, part: solValue ?? undefined }],
    "valor",
    (answers) => ({ totalValueUsd: answers.reduce((sum, a) => sum + a.data.totalValueUsd, 0) }),
    receivedAtMs,
    missing,
  );
  const balances = mergeBlock<BalancesData>(
    [{ label: evmLabel, part: evmBalances ?? undefined }, { label: solanaLabel, part: solBalances ?? undefined }],
    "saldos",
    (answers) => ({ rows: answers.flatMap((a) => a.data.rows).sort(byValue), total: answers.reduce((sum, a) => sum + a.data.total, 0) }),
    receivedAtMs,
    missing,
  );
  const history = mergeBlock<HistoryData>(
    [{ label: evmLabel, part: evmHistory ?? undefined }, { label: solanaLabel, part: solHistory ?? undefined }],
    "historico",
    (answers) => ({ cursor: null, rows: answers.flatMap((a) => a.data.rows).sort((x: HistoryRow, y: HistoryRow) => y.atMs - x.atMs) }),
    receivedAtMs,
    missing,
  );

  return { receivedAtMs, networks: [...(evm?.networks ?? []), ...(sol === null ? [] : [SOLANA_CHAIN_INDEX])], value, balances, history, missing };
}
