/**
 * The reading of the Solana account that feeds the manual consultation (T9.4, WAL-4): one free read of the balances through the local gateway, when the person asks, on
 * network 501 and nothing else. Its moment is when the gateway observed the balances (the time of its answer minus the age it reports), so a cached answer cannot pass for
 * a fresh one in the 60 second window the consultation allows. It never signs, sends or talks to a wallet.
 */
import type { SolanaHolding } from "../inonu/portfolio";
import { isSolanaAddress, SOLANA_CHAIN_INDEX, type HoldingsError, type HoldingsReader } from "./holdings";

export interface SolanaReading {
  /** When the gateway observed the balances, in the clock of this page. */
  readonly observedAtMs: number;
  /** The largest first, as the gateway gives them. */
  readonly rows: readonly SolanaHolding[];
  /** How many holdings there were before the gateway kept the largest ones. */
  readonly total: number;
}

export async function readSolanaHoldings(
  reader: Pick<HoldingsReader, "balances">,
  account: string,
  nowMs: number,
  signal?: AbortSignal,
): Promise<{ readonly ok: true; readonly reading: SolanaReading } | { readonly ok: false; readonly error: HoldingsError }> {
  // the reader checks the request again; a request that is not a Solana account is not even handed to it
  if (!isSolanaAddress(account)) return { ok: false, error: "bad_request" };
  const result = await reader.balances({ address: account, chains: [SOLANA_CHAIN_INDEX] }, signal);
  if (!result.ok) return { ok: false, error: result.error };
  // an age that makes no sense (negative, or older than the epoch) never moves the reading into the future or before zero
  const observedAtMs = Math.min(nowMs, Math.max(0, nowMs - Math.max(0, result.meta.ageMs)));
  const rows = result.data.rows.map((r) => ({ symbol: r.symbol, tokenAddress: r.tokenAddress, balance: r.balance, valueUsd: r.valueUsd, flaggedRisk: r.flaggedRisk }));
  return { ok: true, reading: { observedAtMs, rows, total: result.data.total } };
}
