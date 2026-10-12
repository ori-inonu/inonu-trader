/**
 * Read-only OKX endpoints used by the wallet evidence layer. Pages read on 2026-10-11 (see docs/portfolio-evidence-v1/SPEC.md).
 *
 * These paths live HERE and not in src/onchainos/endpoints.ts on purpose: src/onchainos/isolation.test.ts forbids the
 * balance, portfolio and history families inside that library. Every entry is a GET or a POST that only READS.
 *
 * Tier is `unknown` for all of them: none of the pages declares a plan tier, so the quota cost of a call is unknown
 * (QuotaCounters reports `costKnown: false`). Rate limits and error codes are not declared either.
 */

import type { EndpointRef } from "../../onchainos/http.ts";

export interface WalletEndpoint extends EndpointRef {
  readonly id: "balance.all" | "balance.total" | "balance.specific" | "history.byAddress" | "portfolio.overview" | "portfolio.recentPnl";
  readonly method: "GET" | "POST";
  readonly docUrl: string;
  /** Rows per call that the documentation states, or null. */
  readonly pageLimit: number | null;
  readonly note: string;
}

const DOCS = "https://web3.okx.com/onchainos/dev-docs/market";

export const WALLET_ENDPOINTS: readonly WalletEndpoint[] = Object.freeze([
  { id: "balance.all", method: "GET", path: "/api/v6/dex/balance/all-token-balances-by-address", tier: "unknown", docUrl: `${DOCS}/balance-total-token-balances`, pageLimit: null, note: "up to 50 chains; excludeRiskToken String 0 filters (default) and 1 does not; no decimals, no price clock, no pagination" },
  { id: "balance.total", method: "GET", path: "/api/v6/dex/balance/total-value-by-address", tier: "unknown", docUrl: `${DOCS}/balance-total-value`, pageLimit: null, note: "assetType 0 all, 1 tokens, 2 DeFi; excludeRiskToken is a Boolean here (true filters), unlike the balance call; totalValue in USD" },
  { id: "balance.specific", method: "POST", path: "/api/v6/dex/balance/token-balances-by-address", tier: "unknown", docUrl: `${DOCS}/balance-specific-token-balance`, pageLimit: 20, note: "the page example calls /token-balances; the page does not reconcile the two paths; excludeRiskToken placement is unspecified" },
  { id: "history.byAddress", method: "GET", path: "/api/v6/dex/post-transaction/transactions-by-address", tier: "unknown", docUrl: `${DOCS}/tx-history-transactions-by-address`, pageLimit: 100, note: "six months, descending, limit 20 for one chain and 100 for several; table says transactions, example says transactionList; amount and txFee have no unit" },
  { id: "portfolio.overview", method: "GET", path: "/api/v6/dex/market/portfolio/overview", tier: "unknown", docUrl: `${DOCS}/market-portfolio-overview`, pageLimit: null, note: "one chain per call; timeFrame 1 to 5 (1D, 3D, 7D, 1M, 3M); no pagination; no completeness statement" },
  { id: "portfolio.recentPnl", method: "GET", path: "/api/v6/dex/market/portfolio/recent-pnl", tier: "unknown", docUrl: `${DOCS}/market-portfolio-recent-pnl`, pageLimit: 100, note: "1000 records at most, 100 per call; descending; no cost basis and no accounting method" },
] as const satisfies readonly WalletEndpoint[]);

const BY_ID = new Map(WALLET_ENDPOINTS.map((entry) => [entry.id, entry] as const));

export function walletEndpoint(id: WalletEndpoint["id"]): WalletEndpoint {
  const found = BY_ID.get(id);
  if (found === undefined) throw new Error(`endpoint desconhecido: ${id}`);
  return found;
}
