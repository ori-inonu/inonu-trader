import { createHash } from "node:crypto";
import { OnchainosError } from "../onchainos/errors.ts";
import type { EndpointRef, HttpResult, OnchainosHttp } from "../onchainos/http.ts";
import { asArray, asRecord, readChainIndex, readEpochMsByExample, readTokenAddress, schemaFail } from "../onchainos/values.ts";
import { chainByIndex, isAddressForChain } from "../okx-wallet/chains.ts";
import { minimumOutputRaw, preparedProposalDigest, preflightUnsignedSwap } from "./preflight.ts";
import type { Candle, Capability, CoreReadInput, CoreSample, Inventory, MarketCandles, MarketPrices, NormalizedQuote, PairRequest, PreparedProposal, QuoteRoute, SanitizedCoreSample, SourceEnvelope, TokenMetadata, UnsignedTransaction } from "./types.ts";

const ENDPOINTS = {
  marketSupport: "/api/v6/dex/market/supported/chain",
  balanceSupport: "/api/v6/dex/balance/supported/chain",
  dexSupport: "/api/v6/dex/aggregator/supported/chain",
  balance: "/api/v6/dex/balance/all-token-balances-by-address",
  prices: "/api/v6/dex/market/price",
  candles: "/api/v6/dex/market/candles",
  quote: "/api/v6/dex/aggregator/quote",
  build: "/api/v6/dex/aggregator/swap",
} as const;

type EndpointKey = keyof typeof ENDPOINTS;
const NATIVE_EVM = "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";
function ref(key: EndpointKey): EndpointRef { return { path: ENDPOINTS[key], tier: key === "marketSupport" ? "free" : key === "prices" || key === "candles" ? "basic" : "unknown" }; }

function required<T>(value: T | null, label: string): T { if (value === null) schemaFail(label); return value; }
function chainIndexOf(value: unknown): string { return required(readChainIndex(value), "invalid chain identity"); }
function tokenAddressOf(value: unknown, allowNative = false): string { return required(readTokenAddress(value, { allowNative }), "invalid token identity"); }
function epochOf(value: unknown): number { return required(readEpochMsByExample(value), "invalid source time"); }

function decimal(value: unknown, signed = false): string | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || value.length > 120 || !(signed ? /^-?(?:0|[1-9]\d{0,77})(?:\.\d{1,36})?$/ : /^(?:0|[1-9]\d{0,77})(?:\.\d{1,36})?$/).test(value)) schemaFail("invalid exact decimal");
  return value as string;
}

function integer(value: unknown, required = false): string | null {
  if (!required && (value === undefined || value === null || value === "")) return null;
  if (typeof value !== "string" || !/^(?:0|[1-9]\d{0,77})$/.test(value)) schemaFail("invalid raw integer");
  return value as string;
}

function decimalParts(value: string): { coefficient: bigint; scale: number } {
  const [whole = "0", fraction = ""] = value.split(".");
  return { coefficient: BigInt(whole + fraction), scale: fraction.length };
}

function parseSupport(data: unknown): { supported: boolean; chainIndexes: string[] } {
  const chains = asArray(data, "support", 1000).map((value) => chainIndexOf(asRecord(value, "support").chainIndex));
  if (new Set(chains).size !== chains.length) schemaFail("duplicate chain");
  return { supported: false, chainIndexes: chains };
}

function parseInventory(data: unknown, input: CoreReadInput): Inventory {
  const seen = new Set<string>();
  const assets = asArray(data, "balance", 50).flatMap((value) => {
    const group = asRecord(value, "balance");
    return asArray(group.tokenAssets, "tokenAssets", 1000).map((item) => {
      const row = asRecord(item, "asset");
      const chainIndex = chainIndexOf(row.chainIndex);
      if (chainIndex !== input.chainIndex) schemaFail("unexpected asset chain");
      if (row.address !== undefined && (typeof row.address !== "string" || coreIdentityKey(chainIndex, row.address) !== coreIdentityKey(chainIndex, input.address))) schemaFail("unexpected asset wallet");
      const tokenContractAddress = tokenAddressOf(row.tokenContractAddress, true);
      if (tokenContractAddress !== "" && coreIdentityKey(chainIndex, tokenContractAddress) === coreIdentityKey(chainIndex, input.address)) schemaFail("wallet token identity unsupported");
      if (seen.has(tokenContractAddress)) schemaFail("duplicate asset");
      seen.add(tokenContractAddress);
      const balance = decimal(row.balance), rawBalance = integer(row.rawBalance), tokenPriceUsd = decimal(row.tokenPrice);
      const isRiskToken = typeof row.isRiskToken === "boolean" ? row.isRiskToken : null;
      const symbol = typeof row.symbol === "string" && /^[a-zA-Z0-9._$-]{1,24}$/.test(row.symbol) ? row.symbol : null;
      // Neither an unqualified balance unit nor matching raw fields prove token decimals.
      return { chainIndex, tokenContractAddress, symbol, balance, rawBalance, decimals: null,
        tokenPriceUsd, valueUsd: null, isRiskToken };
    });
  });
  if (assets.length > 1000) schemaFail("asset limit");
  return { assets, coverage: { observedAssets: assets.length, rawBalanceKnown: assets.filter((asset) => asset.rawBalance !== null).length,
    usdKnown: 0, scope: "observed-tokens-only" }, knownValueUsd: null,
    completeValueUsd: null, blockNumber: null };
}

function sourceTimestamp(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  return epochOf(value);
}

function parsePrices(data: unknown, input: CoreReadInput, tokens: string[], omittedTokens: string[], receivedAtMs: number): MarketPrices {
  const seen = new Set<string>();
  const prices = asArray(data, "prices", 100).map((value) => {
    const row = asRecord(value, "price");
    if (chainIndexOf(row.chainIndex) !== input.chainIndex) schemaFail("unexpected price chain");
    const tokenContractAddress = tokenAddressOf(row.tokenContractAddress);
    if (!tokens.includes(tokenContractAddress) || seen.has(tokenContractAddress)) schemaFail("unexpected or duplicate price token");
    seen.add(tokenContractAddress);
    const sourceAtMs = sourceTimestamp(row.time);
    if (sourceAtMs !== null && sourceAtMs > receivedAtMs + 5_000) schemaFail("future price time");
    return { tokenContractAddress, price: decimal(row.price), sourceAtMs, currency: "unknown" as const };
  });
  return { prices, missingTokens: tokens.filter((token) => !seen.has(token)), omittedTokens, currency: "unknown" };
}

function parseCandles(data: unknown, receivedAtMs: number): Candle[] {
  const seen = new Set<number>();
  const candles = asArray(data, "candles", 299).map((value) => {
    const row = asArray(value, "candle", 8);
    if (row.length !== 8) schemaFail("candle field count");
    const openedAtMs = epochOf(row[0]);
    if (openedAtMs > receivedAtMs + 5_000 || seen.has(openedAtMs)) schemaFail("future or duplicate candle");
    seen.add(openedAtMs);
    if (row[7] !== "0" && row[7] !== "1") schemaFail("candle confirmation");
    const confirmed = row[7] === "1";
    if (confirmed && openedAtMs + 60_000 > receivedAtMs + 5_000) schemaFail("future confirmed candle");
    return { openedAtMs, closedAtMs: openedAtMs + 60_000, open: decimal(row[1]), high: decimal(row[2]), low: decimal(row[3]),
      close: decimal(row[4]), volume: decimal(row[5]), volumeUsd: decimal(row[6]), confirmed };
  });
  return candles.filter((candle) => candle.confirmed).sort((left, right) => left.openedAtMs - right.openedAtMs);
}

function observedTokens(input: CoreReadInput, inventory: Inventory | null): string[] {
  const tokens = [...(input.pair ? [input.pair.fromToken, input.pair.toToken] : []), ...(inventory?.assets.map((asset) => asset.tokenContractAddress) ?? [])];
  const result: string[] = [];
  for (const value of tokens) {
    if (value === "" && chainByIndex(input.chainIndex)?.kind !== "evm") continue;
    const token = tokenAddressOf(value === "" ? NATIVE_EVM : value);
    if (!result.includes(token)) result.push(token);
  }
  return result;
}

function normalizePair(input: CoreReadInput): PairRequest | null {
  if (!input.pair) return null;
  const fromToken = tokenAddressOf(input.pair.fromToken), toToken = tokenAddressOf(input.pair.toToken);
  if (fromToken === toToken || coreIdentityKey(input.chainIndex, fromToken) === coreIdentityKey(input.chainIndex, input.address) || coreIdentityKey(input.chainIndex, toToken) === coreIdentityKey(input.chainIndex, input.address)) schemaFail("invalid swap token pair");
  const amount = integer(input.pair.amount, true)!;
  if (BigInt(amount) === 0n) schemaFail("zero swap amount");
  const slippagePercent = decimal(input.pair.slippagePercent)!;
  if (slippagePercent === null) schemaFail("missing slippage");
  minimumOutputRaw("1", slippagePercent);
  return { fromToken, toToken, amount, slippagePercent };
}

function parseToken(value: unknown, expected: string): TokenMetadata {
  const row = asRecord(value, "quote token");
  const tokenContractAddress = tokenAddressOf(row.tokenContractAddress);
  if (tokenContractAddress !== expected) schemaFail("quote token mismatch");
  let decimals: number | null = null;
  if (row.decimal !== undefined && row.decimal !== null && row.decimal !== "") {
    if (typeof row.decimal !== "string" || !/^(?:0|[1-9]\d?)$/.test(row.decimal) || Number(row.decimal) > 36) schemaFail("invalid token decimals");
    decimals = Number(row.decimal);
  }
  const taxRate = decimal(row.taxRate);
  if (taxRate !== null) {
    const parts = decimalParts(taxRate); if (parts.coefficient > 10n ** BigInt(parts.scale)) schemaFail("invalid token tax");
  }
  return { tokenContractAddress, decimals, decimalsSource: "provider-reference", priceUsd: row.tokenUnitPrice === "null" ? null : decimal(row.tokenUnitPrice),
    isHoneyPot: typeof row.isHoneyPot === "boolean" ? row.isHoneyPot : null, taxRate };
}

function parseQuoteRow(value: unknown, input: CoreReadInput, pair: PairRequest): NormalizedQuote {
  const row = asRecord(value, "quote");
  if (chainIndexOf(row.chainIndex) !== input.chainIndex || row.swapMode !== "exactIn") schemaFail("quote chain or mode mismatch");
  const fromTokenAmount = integer(row.fromTokenAmount, true)!;
  const toTokenAmount = integer(row.toTokenAmount, true)!;
  if (fromTokenAmount !== pair.amount || BigInt(toTokenAmount) === 0n) schemaFail("quote amount mismatch");
  function routeToken(value: unknown): string {
    const token = tokenAddressOf(value);
    if (coreIdentityKey(input.chainIndex, token) === coreIdentityKey(input.chainIndex, input.address)) schemaFail("route contains wallet identity");
    if (chainByIndex(input.chainIndex)?.kind === "evm" && !/^0x[\da-f]{40}$/i.test(token)) schemaFail("route token family mismatch");
    return token;
  }
  const routes: QuoteRoute[] = asArray(row.dexRouterList ?? [], "routes", 100).map((value) => {
    const route = asRecord(value, "route"), protocol = asRecord(route.dexProtocol, "protocol");
    const percent = decimal(protocol.percent);
    if (percent !== null) minimumOutputRaw("1", percent);
    const name = protocol.dexName;
    const dexName = typeof name === "string" && /^[A-Za-z][A-Za-z0-9 ._()+/-]{0,47}$/.test(name) && !/0x[\da-f]{40}/i.test(name) ? name : null;
    const index = (value: unknown): string | null => {
      if (value === undefined || value === null || value === "") return null;
      if (typeof value !== "string" || !/^(?:0|[1-9]\d?)$/.test(value)) schemaFail("route index invalid");
      return value;
    };
    return { fromToken: routeToken(asRecord(route.fromToken, "route input").tokenContractAddress), toToken: routeToken(asRecord(route.toToken, "route output").tokenContractAddress),
      fromTokenIndex: index(route.fromTokenIndex), toTokenIndex: index(route.toTokenIndex), dexName, percent };
  });
  let mainRoute: string[] | null = null;
  if (row.router !== undefined && row.router !== null && row.router !== "") {
    if (typeof row.router !== "string" || row.router.length > 8192) schemaFail("main route invalid");
    const path = row.router.split("--");
    if (path.length < 2 || path.length > 50) schemaFail("main route length invalid");
    mainRoute = path.map(routeToken);
    if (mainRoute[0] !== pair.fromToken || mainRoute.at(-1) !== pair.toToken) schemaFail("main route pair mismatch");
  }
  return { chainIndex: input.chainIndex, swapMode: "exactIn", fromTokenAmount, toTokenAmount,
    fromToken: parseToken(row.fromToken, pair.fromToken), toToken: parseToken(row.toToken, pair.toToken),
    priceImpactPercent: decimal(row.priceImpactPercent, true), estimatedNetworkFeeUsd: decimal(row.tradeFee),
    estimatedGasRaw: integer(row.estimateGasFee), routeCount: routes.length, mainRoute, routes, amountUnit: "smallest-token-unit" };
}

function parseQuote(data: unknown, input: CoreReadInput, pair: PairRequest): NormalizedQuote {
  const rows = asArray(data, "quote response", 1);
  if (rows.length !== 1) schemaFail("missing quote");
  return parseQuoteRow(rows[0], input, pair);
}

function parseBuild(data: unknown, input: CoreReadInput, pair: PairRequest, sampledQuote: NormalizedQuote): { quote: NormalizedQuote; transaction: UnsignedTransaction } {
  const rows = asArray(data, "swap response", 1);
  if (rows.length !== 1) schemaFail("missing swap build");
  const row = asRecord(rows[0], "swap");
  const quote = parseQuoteRow(row.routerResult, input, pair);
  // A repriced or rerouted build requires a new sample; it cannot revise the sampled proposal implicitly.
  if (JSON.stringify(quote) !== JSON.stringify(sampledQuote)) schemaFail("quote build changed");
  const tx = asRecord(row.tx, "transaction");
  if (typeof tx.from !== "string" || coreIdentityKey(input.chainIndex, tx.from) !== coreIdentityKey(input.chainIndex, input.address)) schemaFail("swap wallet mismatch");
  if ((row.signatureData !== undefined && asArray(row.signatureData, "signatureData", 10).length > 0) || (tx.signatureData !== undefined && asArray(tx.signatureData, "signatureData", 10).length > 0)) schemaFail("additional signing unsupported");
  if (tx.chainIndex !== undefined && chainIndexOf(tx.chainIndex) !== input.chainIndex) schemaFail("swap transaction chain mismatch");
  const to = tokenAddressOf(tx.to);
  if (!/^0x[\da-f]{40}$/i.test(to) || coreIdentityKey(input.chainIndex, to) === coreIdentityKey(input.chainIndex, input.address)) schemaFail("invalid swap router");
  if (typeof tx.data !== "string" || !/^0x(?:[\da-f]{2}){4,65536}$/i.test(tx.data)) schemaFail("invalid swap calldata");
  const slippagePercent = decimal(tx.slippagePercent);
  if (slippagePercent !== pair.slippagePercent) schemaFail("swap slippage mismatch");
  const transaction: UnsignedTransaction = { chainIndex: input.chainIndex, to, data: tx.data.toLowerCase(), value: integer(tx.value, true)!,
    minReceiveAmount: integer(tx.minReceiveAmount), gas: integer(tx.gas), gasPrice: integer(tx.gasPrice),
    maxPriorityFeePerGas: integer(tx.maxPriorityFeePerGas), slippagePercent, signed: false };
  return { quote, transaction };
}

export function coreIdentityKey(chainIndex: string, address: string): string {
  const normalized = /^0x[\da-fA-F]{40}(?:[\da-fA-F]{24})?$/.test(address) ? address.toLowerCase() : address;
  return createHash("sha256").update(`${chainIndex}:${normalized}`).digest("hex");
}

function blocked(input: CoreReadInput, endpoint: string, now: number, reason: string): SourceEnvelope<unknown> {
  return { status: "blocked", source: "onchainos-rest-v6", mode: "unverified", endpoint, method: endpoint === ENDPOINTS.prices ? "POST" : "GET", chainIndex: input.chainIndex,
    correlationId: input.correlationId, requestedAtMs: now, receivedAtMs: now, sourceAtMs: null,
    expiresAtMs: now, httpStatus: null, unit: null, error: reason, data: null };
}

function initial(input: CoreReadInput, now: number, reason: string): CoreSample {
  const envelopes = Object.fromEntries(Object.entries(ENDPOINTS).map(([key, path]) => [key, blocked(input, path, now, reason)]));
  const capabilities: Capability[] = (["market", "balance", "dex"] as const).map((family) => ({
    id: family, family, chainIndex: input.chainIndex, endpoint: ENDPOINTS[`${family}Support`],
    source: "onchainos-rest-v6", documented: true, implemented: true, exercisedReal: false,
    integrated: true, financiallyQualified: false, status: "blocked", reason,
    nextRequirement: "real-authenticated-read-and-independent-qualification",
  }));
  capabilities.push(...([
    { family: "simulation", endpoint: "/api/v6/dex/pre-transaction/simulate", source: "onchainos-rest-v6", implemented: false,
      reason: "simulation-whitelist-and-method-contract-unqualified", nextRequirement: "provider-whitelist-confirmed-method-chain-and-ABI" },
    { family: "defi", endpoint: "/api/v6/defi/product/search", source: "onchainos-rest-v6", implemented: true,
      reason: "existing-defi-read-not-integrated", nextRequirement: "explicit-supported-chain-and-lending-risk-policy" },
    { family: "signals", endpoint: "/api/v6/dex/market/signal/list", source: "onchainos-rest-v6", implemented: true,
      reason: "existing-signal-read-not-integrated", nextRequirement: "independent-signal-chain-support-and-premium-entitlement" },
    { family: "funding", endpoint: "/api/v5/public/funding-rate", source: "okx-public-v5", implemented: true,
      reason: "existing-funding-read-not-integrated", nextRequirement: "configured-derivative-instrument-and-separate-position-collateral" },
  ] as const).map((dependency) => ({ ...dependency, id: dependency.family, chainIndex: input.chainIndex, documented: true,
    integrated: false, exercisedReal: false, financiallyQualified: false, status: dependency.implemented ? "blocked" as const : "not-implemented" as const })));
  return { correlationId: input.correlationId, chainIndex: input.chainIndex,
    identityKey: coreIdentityKey(input.chainIndex, input.address), revision: input.revision,
    observedAtMs: now, envelopes, capabilities, proposal: null, holdReasons: [reason] };
}

/** No keys, environment reads, signing, persistence or broadcast are owned by this adapter. */
export function createRealCore(options: { http: OnchainosHttp; now: () => number }) {
  async function capture<T>(input: CoreReadInput, key: EndpointKey, operation: () => Promise<HttpResult>, parse: (data: unknown, receivedAtMs: number) => T, ttl: number, unit: string | null, getSourceTime?: (data: T) => number | null): Promise<SourceEnvelope<T>> {
    const requestedAtMs = options.now();
    let response: HttpResult | undefined;
    try {
      const result = response = await operation();
      const data = parse(result.data, result.meta.receivedAtMs);
      const sourceAtMs = getSourceTime?.(data) ?? null;
      return { status: "ready", source: "onchainos-rest-v6", mode: "unverified", endpoint: ENDPOINTS[key], method: key === "prices" ? "POST" : "GET", chainIndex: input.chainIndex,
        correlationId: input.correlationId, requestedAtMs: result.meta.requestedAtMs, receivedAtMs: result.meta.receivedAtMs,
        sourceAtMs, expiresAtMs: Math.min(result.meta.receivedAtMs + ttl, sourceAtMs === null ? Infinity : sourceAtMs + ttl), httpStatus: result.meta.httpStatus, unit, error: null, data };
    } catch (error) {
      const kind = error instanceof OnchainosError ? error.kind : "schema";
      return { ...blocked(input, ENDPOINTS[key], requestedAtMs, `onchainos-${kind}`), status: "error",
        receivedAtMs: response?.meta.receivedAtMs ?? options.now(), httpStatus: response?.meta.httpStatus ?? (error instanceof OnchainosError ? error.httpStatus ?? null : null), unit, data: null };
    }
  }
  return { async read(input: CoreReadInput): Promise<CoreSample> {
    const sample = initial(input, options.now(), "web3-credentials-unavailable");
    if (!options.http.info.ready) return sample;
    if (!isAddressForChain(input.chainIndex, input.address) || !Number.isSafeInteger(input.revision) || input.revision < 0 || !/^[a-zA-Z0-9._:-]{1,96}$/.test(input.correlationId)) return initial(input, options.now(), "invalid-core-input");
    let pair: PairRequest | null;
    try { pair = normalizePair(input); } catch { return initial(input, options.now(), "invalid-swap-pair"); }
    input = { ...input, ...(pair ? { pair } : {}) };
    sample.holdReasons = [];
    for (const key of ["marketSupport", "balanceSupport", "dexSupport"] as const) {
      sample.envelopes[key] = await capture(input, key, () => options.http.get(ref(key)), (data) => {
        const support = parseSupport(data); support.supported = support.chainIndexes.includes(input.chainIndex); return support;
      }, 60_000, "chain-index");
    }
    for (const capability of sample.capabilities) {
      if (capability.family !== "market" && capability.family !== "balance" && capability.family !== "dex") continue;
      const support = sample.envelopes[`${capability.family}Support`]!;
      const supported = support.status === "ready" && (support.data as { supported: boolean }).supported;
      capability.status = support.status === "error" ? "error" : supported ? "ready" : "unsupported";
      capability.reason = supported ? null : support.error ?? `${capability.family}-chain-unsupported`;
      if (!supported) sample.holdReasons.push(capability.reason!);
    }
    const balanceSupport = sample.envelopes.balanceSupport!;
    if (balanceSupport.status === "ready" && (balanceSupport.data as { supported: boolean }).supported) {
      sample.envelopes.balance = await capture(input, "balance", () => options.http.get(ref("balance"), { address: input.address, chains: input.chainIndex, excludeRiskToken: "0" }), (data) => parseInventory(data, input), 60_000, "balance-unit-unknown");
      if (sample.envelopes.balance.status !== "ready") sample.holdReasons.push(sample.envelopes.balance.error!);
    } else sample.envelopes.balance = blocked(input, ENDPOINTS.balance, options.now(), "balance-chain-unavailable");
    const inventory = sample.envelopes.balance.status === "ready" ? sample.envelopes.balance.data as Inventory : null;
    let tokens: string[] = [], omittedTokens: string[] = [];
    try { const observed = observedTokens(input, inventory); tokens = observed.slice(0, 4); omittedTokens = observed.slice(4); } catch { sample.holdReasons.push("invalid-market-token"); }
    if (omittedTokens.length > 0) sample.holdReasons.push("market-token-coverage-limited");
    const marketSupport = sample.envelopes.marketSupport!;
    if (marketSupport.status === "ready" && (marketSupport.data as { supported: boolean }).supported && tokens.length > 0) {
      sample.envelopes.prices = await capture(input, "prices", () => options.http.post(ref("prices"), tokens.map((tokenContractAddress) => ({ chainIndex: input.chainIndex, tokenContractAddress }))),
        (data, receivedAtMs) => parsePrices(data, input, tokens, omittedTokens, receivedAtMs), 60_000, "quote-currency-unknown", (data) => {
          const times = data.prices.flatMap((price) => price.sourceAtMs === null ? [] : [price.sourceAtMs]);
          return times.length === data.prices.length && times.length > 0 ? Math.min(...times) : null;
        });
      const reads: SourceEnvelope<Candle[]>[] = [];
      for (const tokenContractAddress of tokens) reads.push(await capture(input, "candles", () => options.http.get(ref("candles"), { chainIndex: input.chainIndex, tokenContractAddress, bar: "1m", limit: "30" }),
        parseCandles, 60_000, "quote-currency-unknown", (data) => data.length > 0 ? Math.max(...data.map((candle) => candle.closedAtMs)) : null));
      const failed = reads.find((read) => read.status !== "ready");
      if (failed) sample.envelopes.candles = { ...failed, data: null };
      else {
        const data: MarketCandles = { series: reads.map((read, index) => ({ tokenContractAddress: tokens[index]!, bar: "1m", candles: read.data! })), missingTokens: tokens.filter((_, index) => reads[index]!.data!.length === 0), omittedTokens, currency: "unknown" };
        const times = reads.flatMap((read) => read.sourceAtMs === null ? [] : [read.sourceAtMs]);
        sample.envelopes.candles = { ...reads[0]!, requestedAtMs: Math.min(...reads.map((read) => read.requestedAtMs)), receivedAtMs: Math.max(...reads.map((read) => read.receivedAtMs)),
          sourceAtMs: times.length === reads.length ? Math.min(...times) : null, expiresAtMs: Math.min(...reads.map((read) => read.expiresAtMs)), data };
      }
      for (const key of ["prices", "candles"] as const) {
        const read = sample.envelopes[key]!;
        if (read.status !== "ready") sample.holdReasons.push(read.error!);
        else if ((read.data as MarketPrices | MarketCandles).missingTokens.length > 0) sample.holdReasons.push(`market-${key}-incomplete`);
        else if (read.sourceAtMs === null) sample.holdReasons.push(`market-${key}-source-time-unavailable`);
        else if (read.expiresAtMs <= options.now()) sample.holdReasons.push(`market-${key}-stale`);
      }
      sample.holdReasons.push("market-price-currency-unqualified");
    } else {
      const reason = tokens.length === 0 ? "no-observed-market-tokens" : "market-chain-unavailable";
      sample.envelopes.prices = blocked(input, ENDPOINTS.prices, options.now(), reason);
      sample.envelopes.candles = blocked(input, ENDPOINTS.candles, options.now(), reason);
      sample.holdReasons.push(reason);
    }
    const dexSupport = sample.envelopes.dexSupport!;
    const dexAvailable = dexSupport.status === "ready" && (dexSupport.data as { supported: boolean }).supported;
    const asset = inventory?.assets.find((asset) => asset.tokenContractAddress === pair?.fromToken || asset.tokenContractAddress === "" && pair?.fromToken === NATIVE_EVM);
    const pairBlocked = !pair ? "swap-pair-unconfigured" : !dexAvailable ? "dex-chain-unavailable" : !asset || asset.rawBalance === null ? "input-balance-unavailable" :
      asset.isRiskToken !== false ? "input-token-risk-unqualified" : BigInt(asset.rawBalance) === 0n || BigInt(asset.rawBalance) < BigInt(pair.amount) ? "input-balance-insufficient" : sample.envelopes.balance.expiresAtMs <= options.now() ? "inventory-stale" : null;
    if (pairBlocked) {
      sample.envelopes.quote = blocked(input, ENDPOINTS.quote, options.now(), pairBlocked);
      sample.envelopes.build = blocked(input, ENDPOINTS.build, options.now(), pairBlocked);
      sample.holdReasons.push(pairBlocked);
    } else if (pair && asset?.rawBalance !== null && asset?.rawBalance !== undefined) {
      const query = { chainIndex: input.chainIndex, amount: pair.amount, fromTokenAddress: pair.fromToken, toTokenAddress: pair.toToken, swapMode: "exactIn" };
      const quote = sample.envelopes.quote = await capture(input, "quote", () => options.http.get(ref("quote"), query), (data) => parseQuote(data, input, pair), 15_000, "smallest-token-unit");
      if (quote.status !== "ready" || quote.expiresAtMs <= options.now()) {
        const reason = quote.error ?? "quote-stale"; sample.holdReasons.push(reason);
        sample.envelopes.build = blocked(input, ENDPOINTS.build, options.now(), reason);
      } else if (chainByIndex(input.chainIndex)?.kind !== "evm") {
        sample.envelopes.build = blocked(input, ENDPOINTS.build, options.now(), "unsigned-build-encoding-unqualified");
        sample.holdReasons.push("unsigned-build-encoding-unqualified");
      } else {
        const build = sample.envelopes.build = await capture(input, "build", () => options.http.get(ref("build"), { ...query, slippagePercent: pair.slippagePercent,
          userWalletAddress: input.address, approveTransaction: false, autoSlippage: false }), (data) => parseBuild(data, input, pair, quote.data!), 15_000, "unsigned-evm-transaction");
        if (build.status !== "ready") sample.holdReasons.push(build.error!);
        else {
          const expiresAtMs = Math.min(quote.expiresAtMs, build.expiresAtMs, sample.envelopes.balance.expiresAtMs);
          const expectedOutputRaw = build.data!.quote.toTokenAmount;
          const preflight = preflightUnsignedSwap({ transaction: build.data!.transaction, pair, expectedOutputRaw,
            balanceRaw: asset.rawBalance, chainIndex: input.chainIndex, expiresAtMs, now: options.now() });
          const proposal: PreparedProposal = { id: "",
            correlationId: input.correlationId, identityKey: sample.identityKey, revision: input.revision, chainIndex: input.chainIndex,
            fromToken: pair.fromToken, toToken: pair.toToken, amountRaw: pair.amount, expectedOutputRaw,
            minReceiveAmountRaw: build.data!.transaction.minReceiveAmount, balanceRaw: asset.rawBalance, slippagePercent: pair.slippagePercent,
            requestedAtMs: quote.requestedAtMs, expiresAtMs, executionEnabled: false, transaction: build.data!.transaction, preflight };
          proposal.id = preparedProposalDigest(proposal);
          sample.proposal = proposal;
          sample.holdReasons.push(...preflight.reasons);
        }
      }
    }
    sample.observedAtMs = options.now();
    for (const capability of sample.capabilities) {
      if (capability.status !== "ready") continue;
      const keys: EndpointKey[] = capability.family === "market" ? ["prices", "candles"] : capability.family === "balance" ? ["balance"] : capability.family === "dex" ? ["quote", "build"] : [];
      const reads = keys.map((key) => sample.envelopes[key]!);
      const unavailable = reads.find((read) => read.status === "error") ?? reads.find((read) => read.status === "blocked");
      if (unavailable) { capability.status = unavailable.status; capability.reason = unavailable.error; }
      else if (reads.some((read) => read.expiresAtMs <= sample.observedAtMs)) { capability.status = "blocked"; capability.reason = `${capability.family}-data-stale`; }
      else if (capability.family === "market" && (omittedTokens.length > 0 || reads.some((read) => (read.data as MarketPrices | MarketCandles).missingTokens.length > 0 || read.sourceAtMs === null))) {
        capability.status = "blocked"; capability.reason = omittedTokens.length > 0 ? "market-token-coverage-limited" : "market-observation-incomplete";
      }
    }
    sample.holdReasons = [...new Set(sample.holdReasons)];
    return sample;
  } };
}

/** Use this view for logs, journal, browser and model inputs. Calldata is ephemeral. */
export function sanitizeCoreSample(sample: CoreSample): SanitizedCoreSample {
  const copy = structuredClone(sample);
  // build.data includes calldata and can encode the wallet recipient inside it.
  if (copy.envelopes.build) copy.envelopes.build.data = null;
  if (!copy.proposal) return { ...copy, proposal: null };
  const { transaction: _transaction, ...proposal } = copy.proposal;
  return { ...copy, proposal: { ...proposal, transactionHash: proposal.preflight.transactionHash } };
}
