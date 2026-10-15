/**
 * Read-only readers of the OKX wallet data families, over INJECTED ports (the signed client of src/onchainos or a fake).
 * This file never reads the environment, the global fetch, the clock or a file. A reader returns the rows exactly as the
 * provider sent them, with a locator; deciding what a row means belongs to the pure builders.
 *
 * Pagination reuses collectPages (src/onchainos/paging.ts): it stops on exhaustion, an empty page, a repeated cursor, the
 * page cap or the row cap, and says whether anything was left behind.
 */

import { OnchainosError } from "../../onchainos/errors.ts";
import type { GetPort, PostPort, ReadMeta } from "../../onchainos/http.ts";
import { collectPages, type StopReason as PagingStop } from "../../onchainos/paging.ts";
import { mergeMeta } from "../../onchainos/read.ts";
import { endpoint as marketEndpoint } from "../../onchainos/endpoints.ts";
import { asArray, asRecord, field } from "../../onchainos/values.ts";
import { isAddressForChain, validateChainList } from "../../okx-wallet/chains.ts";
import { boundedChainIndex, buildIdentity } from "../identity.ts";
import { decSum, decToText, parseDec } from "../decimal.ts";
import { OK, state } from "../state.ts";
import type { RawBalanceRow } from "../balances.ts";
import type { RawHistoryRow } from "../history.ts";
import type { RawDexTrade, RawLatestPnl, RawOverview, RawPnlRow } from "../address-analysis.ts";
import type { LiquidityEvidence, PriceEvidence, RiskEvidence, TokenInfoEvidence } from "../types.ts";
import { walletEndpoint } from "./okx-endpoints.ts";

export const MAX_GROUPS = 256;
export const MAX_ROWS_PER_ANSWER = 4096;
export const MAX_TOKENS_PER_MARKET_CALL = 100;
export const MAX_SPECIFIC_TOKENS = 20;

export interface Read<T> {
  readonly value: T;
  readonly meta: ReadMeta;
}

/** The provider keeps at most this many records for the PnL list and the DEX trade history. */
export const PROVIDER_RECORD_CEILING = 1000;

/** A cursor is a string, or nothing. Any other type is not understood, and guessing "no more pages" would read a cut walk as complete. */
function cursorOf(value: unknown): string | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value === "string") return value;
  throw new OnchainosError("schema", "cursor ilegível");
}

/** A walk that reached the provider's own ceiling may have more behind it, even when the last cursor is empty. */
function atCeiling<R>(collected: { rows: R[]; truncated: boolean; stopReason: PagingStop }): { truncated: boolean; stopReason: PagingStop | "provider_record_ceiling" } {
  if (collected.truncated || collected.rows.length < PROVIDER_RECORD_CEILING) return { truncated: collected.truncated, stopReason: collected.stopReason };
  return { truncated: true, stopReason: "provider_record_ceiling" };
}

export interface PagedRead<R> {
  readonly rows: R[];
  readonly pages: number;
  readonly truncated: boolean;
  readonly stopReason: PagingStop | "provider_record_ceiling";
  readonly meta: ReadMeta;
}

export interface TokenQuery {
  readonly chainIndex: string;
  readonly tokenContractAddress: string;
}

function invalid(detail: string): never {
  throw new OnchainosError("invalid_request", detail);
}

function checkAddress(address: string, chains: readonly string[]): void {
  if (typeof address !== "string" || !chains.some((chain) => isAddressForChain(chain, address))) invalid("endereço inválido para as redes pedidas");
}

function validChains(chains: readonly string[]): string[] {
  try {
    return validateChainList([...chains]);
  } catch {
    return invalid("lista de redes inválida (conhecidas, únicas, de 1 a 50)");
  }
}

/** The one group a single-object or single-element-array answer carries. More than one is ambiguous and fails closed. */
function singleGroup(data: unknown, label: string): Record<string, unknown> {
  if (Array.isArray(data)) {
    if (data.length !== 1) throw new OnchainosError("schema", `${label}: esperado exatamente um grupo, vieram ${data.length}`);
    return asRecord(data[0], label);
  }
  return asRecord(data, label);
}

// ---------------------------------------------------------------------------
// Balances
// ---------------------------------------------------------------------------

export function parseBalanceRows(data: unknown): RawBalanceRow[] {
  const groups = asArray(data, "data", MAX_GROUPS);
  const rows: RawBalanceRow[] = [];
  groups.forEach((rawGroup, groupIndex) => {
    const group = asRecord(rawGroup, "grupo", groupIndex);
    const assets = asArray(field(group, "tokenAssets"), "tokenAssets", MAX_ROWS_PER_ANSWER);
    if (rows.length + assets.length > MAX_ROWS_PER_ANSWER) throw new OnchainosError("schema", `mais de ${MAX_ROWS_PER_ANSWER} linhas na resposta`);
    assets.forEach((rawRow, rowIndex) => {
      const row = asRecord(rawRow, "linha", rowIndex);
      rows.push({
        locator: `/data/${groupIndex}/tokenAssets/${rowIndex}`,
        chainIndex: field(row, "chainIndex"),
        tokenContractAddress: field(row, "tokenContractAddress"),
        address: field(row, "address"),
        symbol: field(row, "symbol"),
        balance: field(row, "balance"),
        rawBalance: field(row, "rawBalance"),
        tokenPrice: field(row, "tokenPrice"),
        isRiskToken: field(row, "isRiskToken"),
      });
    });
  });
  return rows;
}

export interface BalanceArgs {
  readonly address: string;
  readonly chains: readonly string[];
  /** `0` filters risky tokens, `1` does not. Omitted: the provider default, which filters. */
  readonly excludeRiskToken?: "0" | "1";
}

export async function readAllTokenBalances(port: GetPort, args: BalanceArgs): Promise<Read<RawBalanceRow[]>> {
  const chains = validChains(args.chains);
  checkAddress(args.address, chains);
  const spec = walletEndpoint("balance.all");
  const result = await port.get(spec, { address: args.address, chains: chains.join(","), excludeRiskToken: args.excludeRiskToken });
  return { value: parseBalanceRows(result.data), meta: result.meta };
}

export type AssetType = "all" | "tokens" | "defi";
const ASSET_TYPE_CODE: Readonly<Record<AssetType, string>> = { all: "0", tokens: "1", defi: "2" };

export interface TotalValueArgs extends BalanceArgs {
  readonly assetType: AssetType;
}

/**
 * The total-value call types `excludeRiskToken` as a Boolean where the balance call uses the String 0 or 1, and the
 * meaning is the same: true filters. "0" (filter) therefore becomes true and "1" (do not filter) becomes false.
 */
export function totalValueRiskParam(value: "0" | "1" | undefined): boolean | undefined {
  return value === undefined ? undefined : value === "0";
}

export async function readTotalValue(port: GetPort, args: TotalValueArgs): Promise<Read<{ valueText: string | null }>> {
  const chains = validChains(args.chains);
  checkAddress(args.address, chains);
  const spec = walletEndpoint("balance.total");
  const result = await port.get(spec, { address: args.address, chains: chains.join(","), assetType: ASSET_TYPE_CODE[args.assetType], excludeRiskToken: totalValueRiskParam(args.excludeRiskToken) });
  const group = singleGroup(result.data, "total");
  const value = field(group, "totalValue");
  return { value: { valueText: typeof value === "string" ? value : null }, meta: result.meta };
}

export interface SpecificArgs {
  readonly address: string;
  readonly tokens: readonly TokenQuery[];
  readonly excludeRiskToken?: "0" | "1";
}

/** Balance of up to 20 named tokens. The page leaves the placement of `excludeRiskToken` unspecified: it goes in the body. */
export async function readSpecificBalances(port: PostPort, args: SpecificArgs): Promise<Read<RawBalanceRow[]>> {
  if (args.tokens.length < 1 || args.tokens.length > MAX_SPECIFIC_TOKENS) invalid(`de 1 a ${MAX_SPECIFIC_TOKENS} tokens`);
  const chains = validChains([...new Set(args.tokens.map((token) => token.chainIndex))]);
  checkAddress(args.address, chains);
  for (const token of args.tokens) if (!buildIdentity(token.chainIndex, token.tokenContractAddress).ok) invalid("token com rede ou contrato inválido");
  const spec = walletEndpoint("balance.specific");
  const body: Record<string, unknown> = { address: args.address, tokenContractAddresses: args.tokens.map((token) => ({ chainIndex: token.chainIndex, tokenContractAddress: token.tokenContractAddress })) };
  if (args.excludeRiskToken !== undefined) body.excludeRiskToken = args.excludeRiskToken;
  const result = await port.post(spec, body);
  return { value: parseBalanceRows(result.data), meta: result.meta };
}

// ---------------------------------------------------------------------------
// History
// ---------------------------------------------------------------------------

export interface HistoryArgs {
  readonly address: string;
  readonly chains: readonly string[];
  readonly beginMs?: number;
  readonly endMs?: number;
  readonly maxPages: number;
}

export type HistoryShape = "transactionList" | "transactions";

export function historyPageSize(chainCount: number): number {
  return chainCount === 1 ? 20 : 100;
}

export function parseHistoryPage(data: unknown, page: number): { rows: RawHistoryRow[]; cursor: string | null; shape: HistoryShape } {
  const group = singleGroup(data, "histórico");
  const list = field(group, "transactionList");
  const table = field(group, "transactions");
  if (list !== undefined && table !== undefined) throw new OnchainosError("schema", "histórico: transactionList e transactions presentes ao mesmo tempo (contrato ambíguo)");
  const shape: HistoryShape = table !== undefined ? "transactions" : "transactionList";
  const items = asArray(list ?? table, shape, 200);
  const cursor = cursorOf(field(group, "cursor"));
  const rows = items.map((raw, index): RawHistoryRow => {
    const row = asRecord(raw, "transação", index);
    return {
      locator: `/page/${page}/${shape}/${index}`,
      chainIndex: field(row, "chainIndex"),
      txHash: field(row, "txHash"),
      itype: field(row, "itype"),
      methodId: field(row, "methodId"),
      nonce: field(row, "nonce"),
      txTime: field(row, "txTime"),
      from: field(row, "from"),
      to: field(row, "to"),
      tokenContractAddress: field(row, "tokenContractAddress"),
      amount: field(row, "amount"),
      symbol: field(row, "symbol"),
      txFee: field(row, "txFee"),
      txStatus: field(row, "txStatus"),
      hitBlacklist: field(row, "hitBlacklist"),
    };
  });
  return { rows, cursor, shape };
}

export async function readTransactions(port: GetPort, args: HistoryArgs): Promise<PagedRead<RawHistoryRow> & { shapes: HistoryShape[] }> {
  const chains = validChains(args.chains);
  checkAddress(args.address, chains);
  const limit = historyPageSize(chains.length);
  const spec = walletEndpoint("history.byAddress");
  const metas: ReadMeta[] = [];
  const shapes = new Set<HistoryShape>();
  const collected = await collectPages<RawHistoryRow>(
    async (cursor, page) => {
      const result = await port.get(spec, {
        address: args.address,
        chains: chains.join(","),
        begin: args.beginMs === undefined ? undefined : String(args.beginMs),
        end: args.endMs === undefined ? undefined : String(args.endMs),
        limit: String(limit),
        cursor: cursor ?? undefined,
      });
      metas.push(result.meta);
      const parsed = parseHistoryPage(result.data, page);
      shapes.add(parsed.shape);
      return { rows: parsed.rows, nextCursor: parsed.cursor };
    },
    { maxPages: args.maxPages, maxRows: limit * args.maxPages },
  );
  return { rows: collected.rows, pages: collected.pages, truncated: collected.truncated, stopReason: collected.stopReason, meta: mergeMeta(metas), shapes: [...shapes] };
}

// ---------------------------------------------------------------------------
// Address Analysis (provider PnL)
// ---------------------------------------------------------------------------

export function parseOverview(data: unknown): RawOverview {
  const group = singleGroup(data, "overview");
  return { realizedPnlUsd: field(group, "realizedPnlUsd") };
}

export async function readPortfolioOverview(port: GetPort, args: { chainIndex: string; address: string; timeFrame: "1" | "2" | "3" | "4" | "5" }): Promise<Read<RawOverview>> {
  const chains = validChains([args.chainIndex]);
  checkAddress(args.address, chains);
  const result = await port.get(walletEndpoint("portfolio.overview"), { chainIndex: args.chainIndex, walletAddress: args.address, timeFrame: args.timeFrame });
  return { value: parseOverview(result.data), meta: result.meta };
}

export function parsePnlPage(data: unknown, page: number): { rows: RawPnlRow[]; cursor: string | null } {
  const group = singleGroup(data, "pnl");
  const list = asArray(field(group, "pnlList"), "pnlList", 1000);
  const cursor = cursorOf(field(group, "cursor"));
  const rows = list.map((raw, index): RawPnlRow => {
    const row = asRecord(raw, "linha", index);
    return {
      locator: `/page/${page}/pnlList/${index}`,
      chainIndex: field(row, "chainIndex"),
      tokenContractAddress: field(row, "tokenContractAddress"),
      tokenSymbol: field(row, "tokenSymbol"),
      lastActiveTimestamp: field(row, "lastActiveTimestamp"),
      unrealizedPnlUsd: field(row, "unrealizedPnlUsd"),
      realizedPnlUsd: field(row, "realizedPnlUsd"),
      totalPnlUsd: field(row, "totalPnlUsd"),
      tokenBalanceUsd: field(row, "tokenBalanceUsd"),
      tokenBalanceAmount: field(row, "tokenBalanceAmount"),
      tokenPositionDuration: field(row, "tokenPositionDuration"),
    };
  });
  return { rows, cursor };
}

export async function readRecentPnl(port: GetPort, args: { chainIndex: string; address: string; maxPages: number }): Promise<PagedRead<RawPnlRow>> {
  const chains = validChains([args.chainIndex]);
  checkAddress(args.address, chains);
  const spec = walletEndpoint("portfolio.recentPnl");
  const metas: ReadMeta[] = [];
  const collected = await collectPages<RawPnlRow>(
    async (cursor, page) => {
      const result = await port.get(spec, { chainIndex: args.chainIndex, walletAddress: args.address, limit: "100", cursor: cursor ?? undefined });
      metas.push(result.meta);
      const parsed = parsePnlPage(result.data, page);
      return { rows: parsed.rows, nextCursor: parsed.cursor };
    },
    { maxPages: args.maxPages, maxRows: 100 * args.maxPages },
  );
  return { rows: collected.rows, pages: collected.pages, ...atCeiling(collected), meta: mergeMeta(metas) };
}

// ---------------------------------------------------------------------------
// Market: price, token decimals, liquidity, risk (decimal TEXT, never a number)
// ---------------------------------------------------------------------------

function identityOf(token: TokenQuery) {
  const built = buildIdentity(token.chainIndex, token.tokenContractAddress);
  if (!built.ok || built.identity.asset.kind !== "contract") invalid("o endpoint de mercado exige um contrato; a moeda nativa não é aceita");
  return built.identity;
}

/**
 * The contract the market pages want on the wire: the market-price page says "for EVM chains use all-lowercase addresses", and
 * the canonical form of an EVM contract IS lowercase (other families keep their case). The identity decides, not the caller.
 */
function wireContract(token: TokenQuery): string {
  const identity = identityOf(token);
  return identity.asset.kind === "contract" ? identity.asset.address : token.tokenContractAddress;
}

function checkTokens(tokens: readonly TokenQuery[]): TokenQuery[] {
  if (tokens.length < 1 || tokens.length > MAX_TOKENS_PER_MARKET_CALL) invalid(`de 1 a ${MAX_TOKENS_PER_MARKET_CALL} tokens`);
  const seen = new Set<string>();
  return tokens.map((token) => {
    const identity = identityOf(token);
    if (seen.has(identity.key)) invalid("token repetido");
    seen.add(identity.key);
    return { chainIndex: identity.chainIndex, tokenContractAddress: wireContract(token) };
  });
}

function rowsByIdentity(data: unknown, requested: readonly TokenQuery[]) {
  const wanted = new Set(requested.map((token) => identityOf(token).key));
  const seen = new Set<string>();
  const rows = asArray(data, "data", requested.length).map((raw, index) => {
    const record = asRecord(raw, "linha", index);
    const built = buildIdentity(field(record, "chainIndex"), field(record, "tokenContractAddress"));
    if (!built.ok) throw new OnchainosError("schema", "identidade do token ilegível", { rowIndex: index });
    if (!wanted.has(built.identity.key)) throw new OnchainosError("schema", "identidade fora do pedido", { rowIndex: index });
    if (seen.has(built.identity.key)) throw new OnchainosError("schema", "identidade repetida", { rowIndex: index });
    seen.add(built.identity.key);
    return { identity: built.identity, record };
  });
  return { rows, missing: requested.map((token) => identityOf(token)).filter((identity) => !seen.has(identity.key)) };
}

/**
 * Milliseconds as 13 plain digits without a leading zero, which is 2001-09-09 or later, and not after 2100-01-01. Seconds (10
 * digits) and microseconds (16 digits) are NOT milliseconds, and neither is anything with an exponent, sign, space or fraction.
 */
const MAX_EPOCH_MS = 4_102_444_800_000;
function epoch(value: unknown): number | null {
  const text = typeof value === "number" && Number.isSafeInteger(value) ? String(value) : value;
  if (typeof text !== "string" || !/^[1-9]\d{12}$/.test(text)) return null;
  const parsed = Number(text);
  return parsed <= MAX_EPOCH_MS ? parsed : null;
}

export async function readPrices(port: PostPort, tokens: readonly TokenQuery[]): Promise<Read<{ prices: PriceEvidence[]; missing: string[] }>> {
  const refs = checkTokens(tokens);
  const result = await port.post(marketEndpoint("market.price.price"), refs);
  const { rows, missing } = rowsByIdentity(result.data, refs);
  const prices = rows.map(({ identity, record }): PriceEvidence => {
    const price = field(record, "price");
    const parsed = parseDec(price);
    const evidenceState = parsed === null ? state("unverified", "price_unreadable") : parsed.units === 0n ? state("unverified", "price_zero_unverified") : OK;
    return { identity, priceText: parsed === null ? null : (price as string), currency: null, timeMs: epoch(field(record, "time")), fetchedAtMs: result.meta.receivedAtMs, state: evidenceState };
  });
  return { value: { prices, missing: missing.map((identity) => identity.key) }, meta: result.meta };
}

export async function readTokenDecimals(port: PostPort, tokens: readonly TokenQuery[]): Promise<Read<{ tokenInfo: TokenInfoEvidence[]; missing: string[] }>> {
  const refs = checkTokens(tokens);
  const result = await port.post(marketEndpoint("market.token.basic-info"), refs);
  const { rows, missing } = rowsByIdentity(result.data, refs);
  const tokenInfo = rows.map(({ identity, record }): TokenInfoEvidence => {
    const raw = field(record, "decimal");
    const text = typeof raw === "number" && Number.isSafeInteger(raw) ? String(raw) : raw;
    const decimals = typeof text === "string" && /^\d{1,2}$/.test(text) && Number(text) <= 36 ? Number(text) : null;
    return { identity, decimals, state: decimals === null ? state("unverified", "decimals_unreadable") : OK };
  });
  return { value: { tokenInfo, missing: missing.map((identity) => identity.key) }, meta: result.meta };
}

/** Top pools of a token (at most five). The sum is a LOWER BOUND of the liquidity, never the total. */
export async function readLiquidity(port: GetPort, token: TokenQuery): Promise<Read<LiquidityEvidence>> {
  const identity = identityOf(token);
  const result = await port.get(marketEndpoint("market.token.top-liquidity"), { chainIndex: identity.chainIndex, tokenContractAddress: wireContract(token) });
  const pools = asArray(result.data, "data", 5);
  const values = pools.map((raw, index) => parseDec(field(asRecord(raw, "pool", index), "liquidityUsd")));
  const readable = values.filter((value): value is NonNullable<typeof value> => value !== null);
  const sum = decSum(readable);
  const evidenceState = pools.length === 0 ? state("missing", "no_pools_listed") : readable.length < pools.length ? state("unverified", "pool_liquidity_unreadable") : OK;
  return { value: { identity, poolsRead: pools.length, liquidityUsdLowerBoundText: sum === null ? null : decToText(sum), scope: "top_pools_lower_bound", state: evidenceState }, meta: result.meta };
}

export async function readRisk(port: GetPort, token: TokenQuery): Promise<Read<RiskEvidence>> {
  const identity = identityOf(token);
  const result = await port.get(marketEndpoint("market.token.advanced-info"), { chainIndex: identity.chainIndex, tokenContractAddress: wireContract(token) });
  const record = singleGroup(result.data, "advanced-info");
  const rawLevel = field(record, "riskControlLevel");
  const text = typeof rawLevel === "number" && Number.isSafeInteger(rawLevel) ? String(rawLevel) : rawLevel;
  const level = typeof text === "string" && /^[0-5]$/.test(text) ? Number(text) : null;
  const rawTags = field(record, "tokenTags");
  const tags = Array.isArray(rawTags) ? rawTags.filter((tag): tag is string => typeof tag === "string" && /^[A-Za-z0-9]{1,48}$/.test(tag)).slice(0, 32) : [];
  return { value: { identity, riskControlLevel: level, tags, state: level === null ? state("unverified", "risk_level_unreadable") : OK }, meta: result.meta };
}

// ---------------------------------------------------------------------------
// Address Analysis, the rest of the family: latest PnL of a token, DEX trade history, supported chains
// ---------------------------------------------------------------------------

/** Latest PnL of ONE token of one chain. The answer carries no identity: the caller keeps the token it asked for. */
export async function readLatestPnl(port: GetPort, args: { chainIndex: string; address: string; tokenContractAddress: string }): Promise<Read<RawLatestPnl>> {
  const chains = validChains([args.chainIndex]);
  checkAddress(args.address, chains);
  const identity = identityOf({ chainIndex: args.chainIndex, tokenContractAddress: args.tokenContractAddress });
  const result = await port.get(walletEndpoint("portfolio.latestPnl"), { chainIndex: identity.chainIndex, walletAddress: args.address, tokenContractAddress: args.tokenContractAddress });
  const group = singleGroup(result.data, "latest-pnl");
  return {
    value: { totalPnlUsd: field(group, "totalPnlUsd"), unrealizedPnlUsd: field(group, "unrealizedPnlUsd"), realizedPnlUsd: field(group, "realizedPnlUsd"), isPnlSupported: field(group, "isPnlSupported") },
    meta: result.meta,
  };
}

const MIN_WINDOW_MS = 946_684_800_000;
const MAX_WINDOW_MS = 4_102_444_800_000;

export interface DexHistoryArgs {
  readonly chainIndex: string;
  readonly address: string;
  readonly beginMs: number;
  readonly endMs: number;
  /** Comma separated trade types: 1 buy, 2 sell, 3 transfer in, 4 transfer out. Omitted: all. */
  readonly types?: string;
  readonly tokenContractAddress?: string;
  readonly maxPages: number;
}

export function parseDexHistoryPage(data: unknown, page: number): { rows: RawDexTrade[]; cursor: string | null } {
  const group = singleGroup(data, "dex-history");
  const list = asArray(field(group, "transactionList"), "transactionList", 200);
  const cursor = cursorOf(field(group, "cursor"));
  const rows = list.map((raw, index): RawDexTrade => {
    const row = asRecord(raw, "negociação", index);
    return {
      locator: `/page/${page}/transactionList/${index}`,
      type: field(row, "type"),
      chainIndex: field(row, "chainIndex"),
      tokenContractAddress: field(row, "tokenContractAddress"),
      tokenSymbol: field(row, "tokenSymbol"),
      valueUsd: field(row, "valueUsd"),
      amount: field(row, "amount"),
      price: field(row, "price"),
      marketCap: field(row, "marketCap"),
      pnlUsd: field(row, "pnlUsd"),
      time: field(row, "time"),
    };
  });
  return { rows, cursor };
}

/**
 * DEX trade history of one chain in a REQUIRED window. The provider keeps at most 1000 records (100 per call) and declares no
 * completeness, so a walk that ends is complete only for the window it was asked, never for the wallet's history.
 */
export async function readDexHistory(port: GetPort, args: DexHistoryArgs): Promise<PagedRead<RawDexTrade>> {
  const chains = validChains([args.chainIndex]);
  checkAddress(args.address, chains);
  if (!Number.isSafeInteger(args.beginMs) || !Number.isSafeInteger(args.endMs) || args.beginMs < MIN_WINDOW_MS || args.endMs > MAX_WINDOW_MS || args.beginMs >= args.endMs) invalid("janela begin e end inválida");
  if (args.types !== undefined) {
    const parts = args.types.split(",");
    if (!/^[1-4](,[1-4])*$/.test(args.types) || new Set(parts).size !== parts.length) invalid("tipos de negociação inválidos (1 a 4, sem repetição)");
  }
  if (args.tokenContractAddress !== undefined) identityOf({ chainIndex: args.chainIndex, tokenContractAddress: args.tokenContractAddress });
  if (!Number.isInteger(args.maxPages) || args.maxPages < 1 || args.maxPages > 10) invalid("maxPages de 1 a 10 (o provedor guarda no máximo 1000 registros)");
  const spec = walletEndpoint("portfolio.dexHistory");
  const metas: ReadMeta[] = [];
  const collected = await collectPages<RawDexTrade>(
    async (cursor, page) => {
      const result = await port.get(spec, {
        chainIndex: args.chainIndex,
        walletAddress: args.address,
        begin: String(args.beginMs),
        end: String(args.endMs),
        tokenContractAddress: args.tokenContractAddress,
        type: args.types,
        limit: "100",
        cursor: cursor ?? undefined,
      });
      metas.push(result.meta);
      const parsed = parseDexHistoryPage(result.data, page);
      return { rows: parsed.rows, nextCursor: parsed.cursor };
    },
    { maxPages: args.maxPages, maxRows: 100 * args.maxPages },
  );
  return { rows: collected.rows, pages: collected.pages, ...atCeiling(collected), meta: mergeMeta(metas) };
}

/** Chains the provider lists for the portfolio family. The page example shows two; whether that is the whole list is not stated. */
export async function readPortfolioSupportedChains(port: GetPort): Promise<Read<string[]>> {
  const result = await port.get(walletEndpoint("portfolio.supportedChain"));
  const rows = asArray(result.data, "data", 500);
  const chains: string[] = [];
  rows.forEach((raw, index) => {
    const chainIndex = boundedChainIndex(field(asRecord(raw, "cadeia", index), "chainIndex"));
    if (chainIndex === null) throw new OnchainosError("schema", "chainIndex ilegível", { rowIndex: index });
    if (!chains.includes(chainIndex)) chains.push(chainIndex);
  });
  return { value: chains, meta: result.meta };
}
