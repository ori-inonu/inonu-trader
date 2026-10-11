/**
 * Registry of the endpoints this data layer implements. Specification: docs/OKX-ONCHAINOS-DADOS-SPEC.md sections 7 and 9.
 *
 * One source of truth for: the request path and method, the plan tier (from the Market plan page when it lists the
 * endpoint, "unknown" otherwise), the documentation page that was actually read, the per call limit, and the id of the
 * R6 catalog item (docs/research/R6-onchain-os-catalogo.json). The tests keep this list, the tables of the specification
 * and the catalog in agreement. Nothing here is a trade, signing or funds movement path.
 */

import type { HttpMethod, Tier } from "./http.ts";

export type EndpointFamily = "market-price" | "market-token" | "signals" | "social" | "gateway" | "defi" | "public-okx";

export interface EndpointSpec {
  readonly id: string;
  /** Id of the matching item of the R6 catalog, or null when the catalog has no item for it. */
  readonly catalogId: string | null;
  readonly family: EndpointFamily;
  readonly method: HttpMethod;
  readonly path: string;
  readonly tier: Tier;
  /** The page that was read to write the client. */
  readonly docUrl: string;
  /** Per call row limit: declared by the page, or a bound chosen by this client (see the specification). */
  readonly maxItems: number | null;
  /** Public API only: the documented limit in requests per 2 seconds. */
  readonly limitPer2s?: number;
}

const MIRROR = "https://raw.githubusercontent.com/okx/ai-builder-openapi-md/HEAD/skills/okx-v5-api/docs/okex/en/api/rest";

const LIST = [
  { id: "market.price.supported-chains", catalogId: "market.price.supported-chains", family: "market-price", method: "GET", path: "/api/v6/dex/market/supported/chain", tier: "free", docUrl: "https://web3.okx.com/onchainos/dev-docs/market/market-price-chains", maxItems: null },
  { id: "market.price.price", catalogId: "market.price.price", family: "market-price", method: "POST", path: "/api/v6/dex/market/price", tier: "basic", docUrl: "https://web3.okx.com/onchainos/dev-docs/market/market-price", maxItems: 100 },
  { id: "market.index.current-price", catalogId: "market.index.current-price", family: "market-price", method: "POST", path: "/api/v6/dex/index/current-price", tier: "free", docUrl: "https://web3.okx.com/onchainos/dev-docs/market/index-price", maxItems: 100 },
  { id: "market.price.candles", catalogId: "market.price.candles", family: "market-price", method: "GET", path: "/api/v6/dex/market/candles", tier: "basic", docUrl: "https://web3.okx.com/onchainos/dev-docs/market/market-candlesticks", maxItems: 299 },
  { id: "market.price.historical-candles", catalogId: "market.price.historical-candles", family: "market-price", method: "GET", path: "/api/v6/dex/market/historical-candles", tier: "premium", docUrl: "https://web3.okx.com/onchainos/dev-docs/market/market-candlesticks-history", maxItems: 299 },
  { id: "market.price.trades", catalogId: "market.price.trades", family: "market-price", method: "GET", path: "/api/v6/dex/market/trades", tier: "basic", docUrl: "https://web3.okx.com/onchainos/dev-docs/market/market-trades", maxItems: 500 },
  { id: "market.index.historical-price", catalogId: "market.index.historical-price", family: "market-price", method: "GET", path: "/api/v6/dex/index/historical-price", tier: "free", docUrl: "https://web3.okx.com/onchainos/dev-docs/market/historical-index-price", maxItems: 200 },
  { id: "market.token.search", catalogId: "market.token.search", family: "market-token", method: "GET", path: "/api/v6/dex/market/token/search", tier: "basic", docUrl: "https://web3.okx.com/onchainos/dev-docs/market/market-token-search", maxItems: 100 },
  { id: "market.token.basic-info", catalogId: "market.token.basic-info", family: "market-token", method: "POST", path: "/api/v6/dex/market/token/basic-info", tier: "basic", docUrl: "https://web3.okx.com/onchainos/dev-docs/market/market-token-basic-info", maxItems: 100 },
  { id: "market.token.price-info", catalogId: "market.token.price-info", family: "market-token", method: "POST", path: "/api/v6/dex/market/price-info", tier: "premium", docUrl: "https://web3.okx.com/onchainos/dev-docs/market/market-token-price-info", maxItems: 100 },
  { id: "market.token.advanced-info", catalogId: "market.token.advanced-info", family: "market-token", method: "GET", path: "/api/v6/dex/market/token/advanced-info", tier: "premium", docUrl: "https://web3.okx.com/onchainos/dev-docs/market/market-token-advanced-info", maxItems: null },
  { id: "market.token.holder", catalogId: "market.token.holder", family: "market-token", method: "GET", path: "/api/v6/dex/market/token/holder", tier: "premium", docUrl: "https://web3.okx.com/onchainos/dev-docs/market/market-token-holder", maxItems: 100 },
  { id: "market.token.top-liquidity", catalogId: "market.token.top-liquidity", family: "market-token", method: "GET", path: "/api/v6/dex/market/token/top-liquidity", tier: "basic", docUrl: "https://web3.okx.com/onchainos/dev-docs/market/market-token-top-liquidity", maxItems: 5 },
  { id: "market.token.hot-token", catalogId: "market.token.hot-token", family: "market-token", method: "GET", path: "/api/v6/dex/market/token/hot-token", tier: "basic", docUrl: "https://web3.okx.com/onchainos/dev-docs/market/market-token-hot-token", maxItems: 100 },
  { id: "market.token.top-trader", catalogId: "market.token.top-trader", family: "market-token", method: "GET", path: "/api/v6/dex/market/token/top-trader", tier: "premium", docUrl: "https://web3.okx.com/onchainos/dev-docs/market/market-token-top-trader", maxItems: 100 },
  { id: "market.token.cluster.supported-chain", catalogId: "market.token.cluster.supported-chain", family: "market-token", method: "GET", path: "/api/v6/dex/market/token/cluster/supported/chain", tier: "free", docUrl: "https://web3.okx.com/onchainos/dev-docs/market/market-token-cluster-supported-chain", maxItems: null },
  { id: "market.token.cluster.overview", catalogId: "market.token.cluster.overview", family: "market-token", method: "GET", path: "/api/v6/dex/market/token/cluster/overview", tier: "premium", docUrl: "https://web3.okx.com/onchainos/dev-docs/market/market-token-cluster-overview", maxItems: null },
  { id: "market.token.cluster.list", catalogId: "market.token.cluster.list", family: "market-token", method: "GET", path: "/api/v6/dex/market/token/cluster/list", tier: "premium", docUrl: "https://web3.okx.com/onchainos/dev-docs/market/market-token-cluster-list", maxItems: 100 },
  { id: "market.token.cluster.top-holders", catalogId: "market.token.cluster.top-holders", family: "market-token", method: "GET", path: "/api/v6/dex/market/token/cluster/top-holders", tier: "premium", docUrl: "https://web3.okx.com/onchainos/dev-docs/market/market-token-cluster-top-holders", maxItems: null },
  { id: "market.signal.supported-chain", catalogId: "market.signal.supported-chain", family: "signals", method: "GET", path: "/api/v6/dex/market/signal/supported/chain", tier: "free", docUrl: "https://web3.okx.com/onchainos/dev-docs/market/market-signal-chains", maxItems: null },
  { id: "market.signal.list", catalogId: "market.signal.list", family: "signals", method: "POST", path: "/api/v6/dex/market/signal/list", tier: "premium", docUrl: "https://web3.okx.com/onchainos/dev-docs/market/market-signal-list", maxItems: 100 },
  { id: "market.leaderboard.supported-chain", catalogId: "market.leaderboard.supported-chain", family: "signals", method: "GET", path: "/api/v6/dex/market/leaderboard/supported/chain", tier: "free", docUrl: "https://web3.okx.com/onchainos/dev-docs/market/market-signal-leaderboard-supported-chain", maxItems: null },
  { id: "market.leaderboard.list", catalogId: "market.leaderboard.list", family: "signals", method: "GET", path: "/api/v6/dex/market/leaderboard/list", tier: "premium", docUrl: "https://web3.okx.com/onchainos/dev-docs/market/market-signal-leaderboard-list", maxItems: 20 },
  { id: "market.social.sentiment-symbol", catalogId: "market.social.sentiment-symbol", family: "social", method: "GET", path: "/api/v6/dex/market/social/sentiment/symbol", tier: "unknown", docUrl: "https://web3.okx.com/onchainos/dev-docs/market/market-social-sentiment-symbol", maxItems: 20 },
  { id: "market.social.vibe-timeline", catalogId: "market.social.vibe-timeline", family: "social", method: "GET", path: "/api/v6/dex/market/social/vibe/timeline", tier: "unknown", docUrl: "https://web3.okx.com/onchainos/dev-docs/market/market-social-vibe-timeline", maxItems: null },
  { id: "market.social.vibe-top-kols", catalogId: "market.social.vibe-top-kols", family: "social", method: "GET", path: "/api/v6/dex/market/social/vibe/top-kols", tier: "unknown", docUrl: "https://web3.okx.com/onchainos/dev-docs/market/market-social-vibe-top-kols", maxItems: 50 },
  { id: "gateway.supported-chains", catalogId: "gateway.supported-chains", family: "gateway", method: "GET", path: "/api/v6/dex/pre-transaction/supported/chain", tier: "unknown", docUrl: "https://web3.okx.com/onchainos/dev-docs/wallet/onchain-gateway-api-chains", maxItems: null },
  { id: "gateway.gas-price", catalogId: "gateway.gas-price", family: "gateway", method: "GET", path: "/api/v6/dex/pre-transaction/gas-price", tier: "unknown", docUrl: "https://web3.okx.com/onchainos/dev-docs/wallet/onchain-gateway-api-gas-price", maxItems: null },
  { id: "defi.product.supported-chains", catalogId: "defi.product.supported-chains", family: "defi", method: "GET", path: "/api/v6/defi/product/supported-chains", tier: "unknown", docUrl: "https://web3.okx.com/onchainos/dev-docs/wallet/defi-product-supported-chains", maxItems: null },
  { id: "defi.product.supported-platforms", catalogId: "defi.product.supported-platforms", family: "defi", method: "GET", path: "/api/v6/defi/product/supported-platforms", tier: "unknown", docUrl: "https://web3.okx.com/onchainos/dev-docs/wallet/defi-product-supported-platforms", maxItems: null },
  { id: "defi.product.search", catalogId: "defi.product.search", family: "defi", method: "POST", path: "/api/v6/defi/product/search", tier: "unknown", docUrl: "https://web3.okx.com/onchainos/dev-docs/wallet/defi-product-search", maxItems: 20 },
  { id: "defi.product.detail", catalogId: "defi.product.detail", family: "defi", method: "GET", path: "/api/v6/defi/product/detail", tier: "unknown", docUrl: "https://web3.okx.com/onchainos/dev-docs/wallet/defi-product-detail", maxItems: null },
  { id: "defi.product.rate-chart", catalogId: "defi.product.rate-chart", family: "defi", method: "GET", path: "/api/v6/defi/product/rate/chart", tier: "unknown", docUrl: "https://web3.okx.com/onchainos/dev-docs/wallet/defi-product-rate-chart", maxItems: null },
  { id: "defi.product.tvl-chart", catalogId: "defi.product.tvl-chart", family: "defi", method: "GET", path: "/api/v6/defi/product/tvl/chart", tier: "unknown", docUrl: "https://web3.okx.com/onchainos/dev-docs/wallet/defi-product-tvl-chart", maxItems: null },
  { id: "defi.product.depth-price-chart", catalogId: "defi.product.depth-price-chart", family: "defi", method: "GET", path: "/api/v6/defi/product/depth-price/chart", tier: "unknown", docUrl: "https://web3.okx.com/onchainos/dev-docs/wallet/defi-product-depth-price-chart", maxItems: null },
  { id: "public.instruments", catalogId: "exchange.v5.instruments-and-ws", family: "public-okx", method: "GET", path: "/api/v5/public/instruments", tier: "public", docUrl: `${MIRROR}/public/instruments.md`, maxItems: null, limitPer2s: 20 },
  { id: "public.funding-rate", catalogId: "exchange.v5.funding-rate", family: "public-okx", method: "GET", path: "/api/v5/public/funding-rate", tier: "public", docUrl: `${MIRROR}/public/fundingRate.md`, maxItems: null, limitPer2s: 10 },
  { id: "public.funding-rate-history", catalogId: null, family: "public-okx", method: "GET", path: "/api/v5/public/funding-rate-history", tier: "public", docUrl: `${MIRROR}/public/fundingRateHistory.md`, maxItems: 400, limitPer2s: 10 },
  { id: "public.mark-price", catalogId: null, family: "public-okx", method: "GET", path: "/api/v5/public/mark-price", tier: "public", docUrl: `${MIRROR}/public/markPrice.md`, maxItems: null, limitPer2s: 10 },
  { id: "public.open-interest", catalogId: null, family: "public-okx", method: "GET", path: "/api/v5/public/open-interest", tier: "public", docUrl: `${MIRROR}/public/openInterest.md`, maxItems: null, limitPer2s: 20 },
  { id: "public.ticker", catalogId: null, family: "public-okx", method: "GET", path: "/api/v5/market/ticker", tier: "public", docUrl: `${MIRROR}/market/ticker.md`, maxItems: null, limitPer2s: 20 },
  { id: "public.candles", catalogId: null, family: "public-okx", method: "GET", path: "/api/v5/market/candles", tier: "public", docUrl: `${MIRROR}/market/candles.md`, maxItems: 300, limitPer2s: 40 },
  { id: "public.history-candles", catalogId: null, family: "public-okx", method: "GET", path: "/api/v5/market/history-candles", tier: "public", docUrl: `${MIRROR}/market/historyCandles.md`, maxItems: 300, limitPer2s: 20 },
  { id: "public.books", catalogId: null, family: "public-okx", method: "GET", path: "/api/v5/market/books", tier: "public", docUrl: `${MIRROR}/market/books.md`, maxItems: 400, limitPer2s: 40 },
] as const satisfies readonly EndpointSpec[];

export type EndpointId = (typeof LIST)[number]["id"];

export const ENDPOINTS: readonly EndpointSpec[] = LIST;

const BY_ID: ReadonlyMap<string, EndpointSpec> = new Map(LIST.map((entry): [string, EndpointSpec] => [entry.id, entry]));

export function endpoint(id: EndpointId): EndpointSpec {
  const found = BY_ID.get(id);
  if (found === undefined) throw new Error(`endpoint desconhecido: ${id}`);
  return found;
}
