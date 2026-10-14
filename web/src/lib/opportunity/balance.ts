/**
 * Reading the balance at the moment of the click, to size the picks: what the person's wallet (the connected one, or the public address they follow) holds on the networks where it is
 * likely to hold cash, as the payload the core accepts. It is the same free read of balances the Carteira tab makes, through the local gateway, and it never talks to the model, never signs
 * and never sends. A network that does not answer leaves the balance PARTIAL (the cash it holds is not counted, which only makes the ceilings smaller), and no account at all is no balance:
 * the picks then come without dollars, and the screen says so.
 */
import { evmNetworksToRead, readPortfolioBalances } from "../wallet/portfolio-read";
import { SOLANA_CHAIN_INDEX, type BalanceRow, type HoldingsReader } from "../wallet/holdings";
import { saldoFromRows, type SaldoPayload } from "./saldo";

/** How many EVM networks are read: the ones most people hold on. The cash on any other network is not counted, and a pick there gets no ceiling. */
export const BALANCE_EVM_NETWORKS = 14;

export interface BalanceAccounts {
  /** The 0x address, connected or followed, or null. */
  readonly evm: string | null;
  /** The Solana account, connected or followed, or null. */
  readonly solana: string | null;
}

export interface BalanceCoverage {
  readonly requestedChains: readonly string[];
  readonly skippedChains: readonly string[];
  readonly networkListKnown: boolean;
  readonly stale: boolean;
  readonly unpricedRows: number;
  readonly flaggedRows: number;
  readonly truncated: boolean;
}

export interface BalanceRead {
  readonly saldo: SaldoPayload | null;
  /** The networks that did not answer, by number. */
  readonly missing: readonly string[];
  readonly coverage: BalanceCoverage;
}

export async function readBalance(
  reader: Pick<HoldingsReader, "balances" | "networks">,
  accounts: BalanceAccounts,
  options: { readonly now: () => number; readonly signal?: AbortSignal; readonly riskPct?: number | null; readonly scope?: "initial" | "all" },
): Promise<BalanceRead> {
  if (accounts.evm === null && accounts.solana === null) {
    return { saldo: null, missing: [], coverage: { requestedChains: [], skippedChains: [], networkListKnown: true, stale: false, unpricedRows: 0, flaggedRows: 0, truncated: false } };
  }
  const rows: BalanceRow[] = [];
  const missing: string[] = [];
  const requested: string[] = [];
  const skipped: string[] = [];
  let stale = false;
  let truncated = false;
  let networkListKnown = true;
  let observedAtMs = Number.POSITIVE_INFINITY;

  if (accounts.evm !== null) {
    const list = await reader.networks(options.signal);
    networkListKnown = list.ok;
    const all = evmNetworksToRead(list.ok ? list.data : null);
    const networks = options.scope === "all" ? all : all.slice(0, BALANCE_EVM_NETWORKS);
    requested.push(...networks);
    skipped.push(...all.slice(networks.length));
    const read = await readPortfolioBalances(reader as HoldingsReader, { address: accounts.evm, networks, now: options.now, ...(options.signal ? { signal: options.signal } : {}) });
    if (read.ok) {
      rows.push(...read.reading.rows);
      missing.push(...read.reading.unanswered);
      stale = stale || read.reading.stale;
      truncated = truncated || read.reading.total > read.reading.rows.length;
      observedAtMs = Math.min(observedAtMs, read.reading.observedAtMs);
    } else missing.push(...networks);
  }
  if (accounts.solana !== null) {
    requested.push(SOLANA_CHAIN_INDEX);
    const result = await reader.balances({ address: accounts.solana, chains: [SOLANA_CHAIN_INDEX] }, options.signal);
    if (result.ok) {
      rows.push(...result.data.rows);
      stale = stale || result.meta.stale;
      truncated = truncated || result.data.total > result.data.rows.length;
      observedAtMs = Math.min(observedAtMs, options.now() - Math.max(0, result.meta.ageMs));
    } else missing.push(SOLANA_CHAIN_INDEX);
  }
  const unpricedRows = rows.filter((r) => !r.flaggedRisk && r.balance > 0 && (r.valueUsd === null || !Number.isFinite(r.valueUsd) || r.priceUsd === null || !Number.isFinite(r.priceUsd) || r.priceUsd <= 0)).length;
  const flaggedRows = rows.filter((r) => r.flaggedRisk && r.balance > 0).length;
  const coverage: BalanceCoverage = { requestedChains: [...new Set(requested)], skippedChains: [...new Set(skipped)], networkListKnown, stale, unpricedRows, flaggedRows, truncated };
  const answered = [...new Set(missing)];
  if (options.signal?.aborted || !Number.isFinite(observedAtMs)) return { saldo: null, missing: answered, coverage };
  return { saldo: saldoFromRows(rows, Math.round(observedAtMs), options.riskPct ?? null), missing: answered, coverage };
}
