/** Normalized, exact, read-only contracts for the separate real OKX pipeline. */
export interface SourceEnvelope<T> {
  status: "ready" | "blocked" | "error";
  source: "onchainos-rest-v6";
  /** This injected adapter cannot certify whether its external transport was real. */
  mode: "unverified";
  endpoint: string;
  method: "GET" | "POST";
  chainIndex: string;
  correlationId: string;
  requestedAtMs: number;
  receivedAtMs: number;
  sourceAtMs: number | null;
  expiresAtMs: number;
  httpStatus: number | null;
  unit: string | null;
  error: string | null;
  data: T | null;
}

export interface Capability {
  id: string;
  family: "market" | "balance" | "dex" | "simulation" | "defi" | "signals" | "funding";
  chainIndex: string;
  endpoint: string | null;
  source: "onchainos-rest-v6" | "okx-public-v5";
  documented: boolean;
  implemented: boolean;
  exercisedReal: boolean;
  integrated: boolean;
  financiallyQualified: boolean;
  status: "ready" | "blocked" | "error" | "unsupported" | "not-implemented";
  reason: string | null;
  nextRequirement: string | null;
}

export interface PairRequest {
  fromToken: string;
  toToken: string;
  /** Exact-in quantity in the input token's smallest unit; never a floating point number. */
  amount: string;
  /** Decimal percentage, e.g. "0.5" means 0.5 percent. */
  slippagePercent: string;
}

export interface CoreReadInput {
  correlationId: string;
  chainIndex: string;
  address: string;
  revision: number;
  pair?: PairRequest;
}

export interface InventoryAsset {
  chainIndex: string;
  tokenContractAddress: string;
  symbol: string | null;
  /** Exact provider field; its token quantity unit is unqualified and cannot establish USD value. */
  balance: string | null;
  rawBalance: string | null;
  /** The balance endpoint does not document token decimals. */
  decimals: null;
  tokenPriceUsd: string | null;
  /** Unknown until quantity unit and token decimals have independent compatible evidence. */
  valueUsd: string | null;
  isRiskToken: boolean | null;
}

export interface Inventory {
  assets: InventoryAsset[];
  coverage: { observedAssets: number; rawBalanceKnown: number; usdKnown: number; scope: "observed-tokens-only" };
  knownValueUsd: string | null;
  completeValueUsd: string | null;
  blockNumber: null;
}

export interface MarketPrice {
  tokenContractAddress: string;
  price: string | null;
  sourceAtMs: number | null;
  currency: "unknown";
}

export interface MarketPrices {
  prices: MarketPrice[];
  missingTokens: string[];
  /** Observed tokens intentionally excluded by the bounded collection budget. */
  omittedTokens: string[];
  currency: "unknown";
}

export interface Candle {
  openedAtMs: number;
  closedAtMs: number;
  open: string | null;
  high: string | null;
  low: string | null;
  close: string | null;
  volume: string | null;
  volumeUsd: string | null;
  confirmed: boolean;
}

export interface MarketCandles {
  series: { tokenContractAddress: string; bar: "1m"; candles: Candle[] }[];
  missingTokens: string[];
  omittedTokens: string[];
  currency: "unknown";
}

export interface TokenMetadata {
  tokenContractAddress: string;
  decimals: number | null;
  /** OKX declares this value reference-only; this is not an independent decimals proof. */
  decimalsSource: "provider-reference";
  priceUsd: string | null;
  isHoneyPot: boolean | null;
  taxRate: string | null;
}

export interface QuoteRoute {
  fromToken: string;
  toToken: string;
  fromTokenIndex: string | null;
  toTokenIndex: string | null;
  dexName: string | null;
  percent: string | null;
}

export interface NormalizedQuote {
  chainIndex: string;
  swapMode: "exactIn";
  fromTokenAmount: string;
  toTokenAmount: string;
  fromToken: TokenMetadata;
  toToken: TokenMetadata;
  priceImpactPercent: string | null;
  estimatedNetworkFeeUsd: string | null;
  estimatedGasRaw: string | null;
  routeCount: number;
  mainRoute: string[] | null;
  routes: QuoteRoute[];
  /** Amount fields are documented base units; decimals are still reference-only. */
  amountUnit: "smallest-token-unit";
}

/** Ephemeral unsigned response. Persist only the sanitized hash view. */
export interface UnsignedTransaction {
  chainIndex: string;
  to: string;
  data: string;
  value: string;
  minReceiveAmount: string | null;
  gas: string | null;
  gasPrice: string | null;
  maxPriorityFeePerGas: string | null;
  slippagePercent: string;
  /** Always absent: neither financial signing nor broadcasting belongs to this adapter. */
  signed: false;
}

/** Canonical ephemeral output from the real core builder. */
export interface SwapBuild { quote: NormalizedQuote; transaction: UnsignedTransaction }

export interface PreflightResult {
  status: "blocked";
  checkedAtMs: number;
  executionEnabled: false;
  structuralChecksPassed: boolean;
  semanticChecksPassed: false;
  simulation: "not-exercised";
  reasons: string[];
  transactionHash: string;
}

export interface PreparedProposal {
  id: string;
  correlationId: string;
  identityKey: string;
  revision: number;
  chainIndex: string;
  fromToken: string;
  toToken: string;
  amountRaw: string;
  expectedOutputRaw: string;
  minReceiveAmountRaw: string | null;
  balanceRaw: string;
  slippagePercent: string;
  requestedAtMs: number;
  expiresAtMs: number;
  executionEnabled: false;
  transaction: UnsignedTransaction;
  preflight: PreflightResult;
}

export interface CoreSample {
  correlationId: string;
  chainIndex: string;
  identityKey: string;
  revision: number;
  observedAtMs: number;
  envelopes: Record<string, SourceEnvelope<unknown>>;
  capabilities: Capability[];
  proposal: PreparedProposal | null;
  holdReasons: string[];
  semanticProof?: import('./semantic-proof').SemanticProofResult;
  rpcObservation?: import('./rpc-read').RpcReadSnapshot;
  valuation?: import('./valuation').ObservedValuation;
}

export interface SanitizedProposal extends Omit<PreparedProposal, "transaction"> {
  transactionHash: string;
}

export interface SanitizedCoreSample extends Omit<CoreSample, "proposal"> {
  proposal: SanitizedProposal | null;
}
