/**
 * The decision about the wallet (WAL-4, ASK): what to do with what the person holds, on ANY network the provider lists. The holdings come from the reading that
 * "Minha carteira" already made (the same rows, through the local gateway); the Inonu is asked about one network at a time, up to six holdings of it, once the
 * person clicks and consents. This file is the pure part: which networks the reading has, which request one of them makes, how old it is, and the words of the plan.
 */
import { preparePortfolioChain, preparePortfolioSolana, type PortfolioAction, type PortfolioRequest, type SolanaHolding } from "../inonu/portfolio";
import type { OnchainFocus } from "../onchain/focus";
import type { BalanceRow } from "./holdings";

export interface ConsultNetwork {
  readonly chainIndex: string;
  readonly count: number;
  /** The value of what the reading holds there, or null when none of it has a price. */
  readonly valueUsd: number | null;
}

/** The networks a reading holds something on, the one with the most value first (a network with no priced holding goes last, in the order it came). */
export function consultNetworks(rows: readonly BalanceRow[]): readonly ConsultNetwork[] {
  const by = new Map<string, { count: number; value: number | null }>();
  for (const r of rows) {
    const at = by.get(r.chainIndex) ?? { count: 0, value: null };
    at.count += 1;
    if (r.valueUsd !== null) at.value = (at.value ?? 0) + r.valueUsd;
    by.set(r.chainIndex, at);
  }
  return [...by.entries()]
    .map(([chainIndex, v]) => ({ chainIndex, count: v.count, valueUsd: v.value }))
    .sort((a, b) => (b.valueUsd ?? -1) - (a.valueUsd ?? -1));
}

/** When the gateway observed the balances, in the clock of this page: the moment of its answer minus the age it reports, never in the future and never before zero. */
export function observedAt(receivedAtMs: number, ageMs: number): number {
  return Math.min(receivedAtMs, Math.max(0, receivedAtMs - Math.max(0, ageMs)));
}

/** Local subject identity, never sent to the model. Clock ticks affect eligibility, not an already requested analysis. */
export function consultReadingKey(rows: readonly BalanceRow[], chainIndex: string, receivedAtMs: number, ageMs: number, candidate: OnchainFocus | null): string {
  return JSON.stringify([chainIndex, receivedAtMs, ageMs, rows, candidate]);
}

const asHoldings = (rows: readonly BalanceRow[], chainIndex: string): SolanaHolding[] =>
  rows.filter((r) => r.chainIndex === chainIndex).map((r) => ({ symbol: r.symbol, tokenAddress: r.tokenAddress, balance: r.balance, valueUsd: r.valueUsd, flaggedRisk: r.flaggedRisk }));

export type ConsultPrepared =
  | { readonly ok: true; readonly request: PortfolioRequest; readonly assets: number; readonly skipped: number; readonly beyond: number; readonly candidateIncluded: boolean }
  | { readonly ok: false; readonly reason: string };

/** The request for one network of the reading: the family of the network decides the rules (a mint on Solana, a hex contract anywhere else). */
export function prepareConsult(rows: readonly BalanceRow[], chainIndex: string, observedAtMs: number, nowMs: number, candidate: OnchainFocus | null = null): ConsultPrepared {
  const reading = { observedAtMs, rows: asHoldings(rows, chainIndex) };
  const prepared = chainIndex === "501" ? preparePortfolioSolana(reading, nowMs, candidate) : preparePortfolioChain(chainIndex, reading, nowMs, candidate);
  return prepared.ok
    ? { ok: true, request: prepared.request, assets: prepared.request.carteira.assets.length, skipped: prepared.skipped, beyond: prepared.beyond, candidateIncluded: prepared.candidateIncluded }
    : prepared;
}

/** The words of the plan for one holding: the Inonu's own, in plain Portuguese. */
export const PLAN_WORD: Readonly<Record<PortfolioAction, string>> = { buy: "Comprar mais", hold: "Esperar", sell: "Vender", abstain: "Sem dados para decidir" };

/** What the click costs in words, said before it is made: one question to the model and the provider reads for each holding, at most what the server allows. */
export const CONSULT_COST_TEXT = "Uma consulta ao modelo e leituras da OKX OnchainOS dos ativos escolhidos; o custo aparece depois da resposta.";
