/**
 * Onchain OS Market: smart money signals and the wallet leaderboard.
 * Specification: docs/OKX-ONCHAINOS-DADOS-SPEC.md section 7.3 (criterion D13).
 *
 * Read only. Two documented divergences are handled explicitly:
 *  1. BODY SHAPE of `signal/list`. The parameter table does not say if the body is an array or an object; the example of
 *     the REST page is an ARRAY with one object of strings, and the official CLI sends an OBJECT of strings (R1). Both are
 *     built from the same fields and chosen by the `bodyShape` option (default "array", the REST example). Which one the
 *     server accepts has NOT been verified: it needs an authorized call.
 *  2. `walletType`. The REST meaning is used and stated here. Signal list: 1 smart money, 2 KOL, 3 whales. Leaderboard:
 *     1 KOL, 2 developer, 3 smart money, 4 whale, 5 new wallet, 6 insider, 7 sniper, 8 suspected phishing, 9 bundled
 *     trader, 10 pump smart money. The official CLI numbers the leaderboard differently (smartMoney=1, sniper=3, R6).
 *     The two REST enums are separate types, so one can never be passed as the other.
 *
 * Wallet addresses, token names, symbols and logos are dropped; observed flow is a feature, never proof of an edge.
 */

import { OnchainosError } from "./errors.ts";
import type { OnchainosHttp, QueryInput } from "./http.ts";
import { readGet, readPost, type Read } from "./read.ts";
import {
  asArray,
  asRecord,
  field,
  readChainIndex,
  readChainRows,
  readCount,
  readDecimal,
  readEpochMsByExample,
  readNonNegative,
  readOpaqueId,
  readPercent,
  readPositive,
  readTokenAddress,
  schemaFail,
  type ChainRow,
  type CountUnits,
  type EpochMsByExample,
  type PercentByExample,
  type PercentPoints,
  type UsdAmount,
} from "./values.ts";

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export type SignalWalletKind = "smart_money" | "kol" | "whale";
/** REST numbering of `signal/list`. */
export const SIGNAL_WALLET_TYPES: Readonly<Record<SignalWalletKind, number>> = Object.freeze({ smart_money: 1, kol: 2, whale: 3 });

export type LeaderboardWalletKind =
  | "kol"
  | "developer"
  | "smart_money"
  | "whale"
  | "new_wallet"
  | "insider"
  | "sniper"
  | "suspected_phishing"
  | "bundled_trader"
  | "pump_smart_money";
/** REST numbering of `leaderboard/list`. It is NOT the numbering of `signal/list` and NOT the one of the official CLI. */
export const LEADERBOARD_WALLET_TYPES: Readonly<Record<LeaderboardWalletKind, number>> = Object.freeze({
  kol: 1,
  developer: 2,
  smart_money: 3,
  whale: 4,
  new_wallet: 5,
  insider: 6,
  sniper: 7,
  suspected_phishing: 8,
  bundled_trader: 9,
  pump_smart_money: 10,
});

export type LeaderboardTimeFrame = "1d" | "3d" | "7d" | "1m" | "3m";
export const LEADERBOARD_TIME_FRAMES: Readonly<Record<LeaderboardTimeFrame, number>> = Object.freeze({ "1d": 1, "3d": 2, "7d": 3, "1m": 4, "3m": 5 });
export type LeaderboardSort = "pnl" | "win_rate" | "tx_count" | "volume" | "roi";
export const LEADERBOARD_SORTS: Readonly<Record<LeaderboardSort, number>> = Object.freeze({ pnl: 1, win_rate: 2, tx_count: 3, volume: 4, roi: 5 });

const MAX_SIGNALS_PER_CALL = 100;
const MAX_LEADERBOARD_ROWS = 20;
const MAX_TOP_TOKENS = 3;

export type SignalBodyShape = "array" | "object";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SignalRow {
  /** Undeclared unit (13 digits in the example); null when it does not look like milliseconds. */
  readonly timestampMs: EpochMsByExample | null;
  readonly cursor: string | null;
  readonly chainIndex: string;
  readonly tokenAddress: string;
  readonly marketCapUsd: UsdAmount | null;
  readonly holders: CountUnits | null;
  readonly top10HolderPercent: PercentByExample | null;
  /** Declared: token price when the signal triggered, in USD. */
  readonly priceUsd: UsdAmount | null;
  readonly walletKind: SignalWalletKind | null;
  readonly triggerWalletCount: CountUnits | null;
  readonly amountUsd: UsdAmount | null;
  readonly soldRatioPercent: PercentPoints | null;
}

export interface LeaderboardToken {
  readonly tokenContractAddress: string | null;
  readonly tokenPnlUsd: UsdAmount | null;
  readonly tokenPnlPercent: PercentPoints | null;
}

export interface LeaderboardRow {
  readonly realizedPnlUsd: UsdAmount | null;
  readonly realizedPnlPercent: PercentPoints | null;
  readonly winRatePercent: PercentPoints | null;
  readonly avgBuyValueUsd: UsdAmount | null;
  readonly topPnlTokens: LeaderboardToken[];
  readonly txVolumeUsd: UsdAmount | null;
  readonly txs: CountUnits | null;
  readonly lastActiveTimestampMs: EpochMsByExample | null;
}

export interface SignalQuery {
  chainIndex: string;
  walletTypes?: readonly SignalWalletKind[];
  minAmountUsd?: number;
  maxAmountUsd?: number;
  minAddressCount?: number;
  maxAddressCount?: number;
  tokenAddress?: string;
  minMarketCapUsd?: number;
  maxMarketCapUsd?: number;
  minLiquidityUsd?: number;
  maxLiquidityUsd?: number;
  cursor?: string;
  limit?: number;
}

export interface LeaderboardQuery {
  chainIndex: string;
  timeFrame: LeaderboardTimeFrame;
  sortBy: LeaderboardSort;
  walletType?: LeaderboardWalletKind;
  minRealizedPnlUsd?: number;
  maxRealizedPnlUsd?: number;
  minWinRatePercent?: number;
  maxWinRatePercent?: number;
  minTxs?: number;
  maxTxs?: number;
  minTxVolume?: number;
  maxTxVolume?: number;
}

// ---------------------------------------------------------------------------
// Parsers (pure)
// ---------------------------------------------------------------------------

function readSignalWalletKind(value: unknown): SignalWalletKind | null {
  if (value === "1" || value === 1 || value === "SMART_MONEY") return "smart_money";
  if (value === "2" || value === 2 || value === "INFLUENCER" || value === "KOL") return "kol";
  if (value === "3" || value === 3 || value === "WHALE") return "whale";
  return null;
}

export interface SignalsContext {
  chainIndex: string;
  maxRows: number;
}

export function parseSignals(data: unknown, context: SignalsContext): SignalRow[] {
  return asArray(data, "data", context.maxRows).map((raw, index) => {
    const record = asRecord(raw, "linha", index);
    const chainIndex = readChainIndex(field(record, "chainIndex"));
    if (chainIndex !== context.chainIndex) return schemaFail("cadeia fora do pedido", { rowIndex: index });
    const tokenValue = field(record, "token");
    if (typeof tokenValue !== "object" || tokenValue === null || Array.isArray(tokenValue)) return schemaFail("token ausente", { rowIndex: index });
    const token = tokenValue as Record<string, unknown>;
    const tokenAddress = readTokenAddress(field(token, "tokenAddress"));
    if (tokenAddress === null) return schemaFail("endereço do token ilegível", { rowIndex: index });
    return {
      timestampMs: readEpochMsByExample(field(record, "timestamp")),
      cursor: readOpaqueId(field(record, "cursor")),
      chainIndex,
      tokenAddress,
      marketCapUsd: readNonNegative(field(token, "marketCapUsd")),
      holders: readCount(field(token, "holders")),
      top10HolderPercent: readPercent(field(token, "top10HolderPercent"), { min: 0, max: 100 }),
      priceUsd: readPositive(field(record, "price")),
      walletKind: readSignalWalletKind(field(record, "walletType")),
      triggerWalletCount: readCount(field(record, "triggerWalletCount")),
      amountUsd: readNonNegative(field(record, "amountUsd")),
      soldRatioPercent: readPercent(field(record, "soldRatioPercent"), { min: 0, max: 100 }),
    };
  });
}

export function parseLeaderboard(data: unknown, maxRows: number = MAX_LEADERBOARD_ROWS): LeaderboardRow[] {
  return asArray(data, "data", maxRows).map((raw, index) => {
    const record = asRecord(raw, "linha", index);
    const tokens = field(record, "topPnlTokenList");
    const topPnlTokens = tokens === undefined || tokens === null
      ? []
      : asArray(tokens, "topPnlTokenList", MAX_TOP_TOKENS).map((item, tokenIndex): LeaderboardToken => {
          const entry = asRecord(item, "token", tokenIndex);
          return {
            tokenContractAddress: readTokenAddress(field(entry, "tokenContractAddress")),
            tokenPnlUsd: readDecimal(field(entry, "tokenPnlUsd")),
            tokenPnlPercent: readPercent(field(entry, "tokenPnlPercent")),
          };
        });
    return {
      realizedPnlUsd: readDecimal(field(record, "realizedPnlUsd")),
      realizedPnlPercent: readPercent(field(record, "realizedPnlPercent")),
      winRatePercent: readPercent(field(record, "winRatePercent"), { min: 0, max: 100 }),
      avgBuyValueUsd: readNonNegative(field(record, "avgBuyValueUsd")),
      topPnlTokens,
      txVolumeUsd: readNonNegative(field(record, "txVolume")),
      txs: readCount(field(record, "txs")),
      lastActiveTimestampMs: readEpochMsByExample(field(record, "lastActiveTimestamp")),
    };
  });
}

// ---------------------------------------------------------------------------
// Request validation
// ---------------------------------------------------------------------------

function decimalText(value: unknown, name: string, options: { integer?: boolean } = {}): string {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || (options.integer === true && !Number.isInteger(value))) {
    throw new OnchainosError("invalid_request", `${name} deve ser um número finito não negativo${options.integer === true ? " inteiro" : ""}`);
  }
  const text = String(value);
  if (/[eE]/.test(text)) throw new OnchainosError("invalid_request", `${name} fora da faixa representável em texto decimal`);
  return text;
}

function pair(minimum: unknown, maximum: unknown, name: string, options: { integer?: boolean } = {}): { min: string | undefined; max: string | undefined } {
  const min = minimum === undefined ? undefined : decimalText(minimum, `min${name}`, options);
  const max = maximum === undefined ? undefined : decimalText(maximum, `max${name}`, options);
  if (min !== undefined && max !== undefined && Number(min) > Number(max)) throw new OnchainosError("invalid_request", `min${name} não pode ser maior que max${name}`);
  return { min, max };
}

function chainOf(value: string): string {
  const chainIndex = readChainIndex(value);
  if (chainIndex === null) throw new OnchainosError("invalid_request", "chainIndex inválido");
  return chainIndex;
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

export interface SignalsClientOptions {
  bodyShape?: SignalBodyShape;
}

export interface SignalsClient {
  signalChains(): Promise<Read<ChainRow[]>>;
  signals(query: SignalQuery): Promise<Read<SignalRow[]>>;
  leaderboardChains(): Promise<Read<ChainRow[]>>;
  leaderboard(query: LeaderboardQuery): Promise<Read<LeaderboardRow[]>>;
}

export function createSignalsClient(http: OnchainosHttp, options: SignalsClientOptions = {}): SignalsClient {
  const bodyShape: SignalBodyShape = options.bodyShape ?? "array";
  if (bodyShape !== "array" && bodyShape !== "object") throw new OnchainosError("invalid_request", "bodyShape deve ser array ou object");

  return {
    signalChains: () => readGet(http, "market.signal.supported-chain", undefined, (data) => readChainRows(data)),
    leaderboardChains: () => readGet(http, "market.leaderboard.supported-chain", undefined, (data) => readChainRows(data)),

    signals: async (query) => {
      const chainIndex = chainOf(query.chainIndex);
      let walletType: string | undefined;
      if (query.walletTypes !== undefined) {
        if (!Array.isArray(query.walletTypes) || query.walletTypes.length < 1 || query.walletTypes.length > 3) throw new OnchainosError("invalid_request", "walletTypes deve ter de 1 a 3 itens");
        const numbers = query.walletTypes.map((kind) => {
          const number = (SIGNAL_WALLET_TYPES as Record<string, number | undefined>)[kind as string];
          if (number === undefined) throw new OnchainosError("invalid_request", "walletTypes aceita smart_money, kol e whale");
          return number;
        });
        walletType = [...new Set(numbers)].join(",");
      }
      const amount = pair(query.minAmountUsd, query.maxAmountUsd, "AmountUsd");
      const addresses = pair(query.minAddressCount, query.maxAddressCount, "AddressCount", { integer: true });
      const marketCap = pair(query.minMarketCapUsd, query.maxMarketCapUsd, "MarketCapUsd");
      const liquidity = pair(query.minLiquidityUsd, query.maxLiquidityUsd, "LiquidityUsd");
      let tokenAddress: string | undefined;
      if (query.tokenAddress !== undefined) {
        const address = readTokenAddress(query.tokenAddress);
        if (address === null) throw new OnchainosError("invalid_request", "tokenAddress inválido");
        tokenAddress = address;
      }
      let cursor: string | undefined;
      if (query.cursor !== undefined) {
        const id = readOpaqueId(query.cursor);
        if (id === null) throw new OnchainosError("invalid_request", "cursor inválido");
        cursor = id;
      }
      let limit: string | undefined;
      let maxRows = MAX_SIGNALS_PER_CALL;
      if (query.limit !== undefined) {
        if (!Number.isInteger(query.limit) || query.limit < 1 || query.limit > MAX_SIGNALS_PER_CALL) throw new OnchainosError("invalid_request", `limit deve ser um inteiro de 1 a ${MAX_SIGNALS_PER_CALL}`);
        limit = String(query.limit);
        maxRows = query.limit;
      }
      const fields: Record<string, string | undefined> = {
        chainIndex,
        walletType,
        minAmountUsd: amount.min,
        maxAmountUsd: amount.max,
        minAddressCount: addresses.min,
        maxAddressCount: addresses.max,
        tokenAddress,
        minMarketCapUsd: marketCap.min,
        maxMarketCapUsd: marketCap.max,
        minLiquidityUsd: liquidity.min,
        maxLiquidityUsd: liquidity.max,
        cursor,
        limit,
      };
      const present = Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== undefined));
      const body = bodyShape === "array" ? [present] : present;
      return readPost(http, "market.signal.list", body, (data) => parseSignals(data, { chainIndex, maxRows }));
    },

    leaderboard: async (query) => {
      const chainIndex = chainOf(query.chainIndex);
      const timeFrame = (LEADERBOARD_TIME_FRAMES as Record<string, number | undefined>)[query.timeFrame as string];
      if (timeFrame === undefined) throw new OnchainosError("invalid_request", "timeFrame aceita 1d, 3d, 7d, 1m e 3m");
      const sortBy = (LEADERBOARD_SORTS as Record<string, number | undefined>)[query.sortBy as string];
      if (sortBy === undefined) throw new OnchainosError("invalid_request", "sortBy aceita pnl, win_rate, tx_count, volume e roi");
      let walletType: number | undefined;
      if (query.walletType !== undefined) {
        walletType = (LEADERBOARD_WALLET_TYPES as Record<string, number | undefined>)[query.walletType as string];
        if (walletType === undefined) throw new OnchainosError("invalid_request", "walletType do leaderboard não documentado");
      }
      const pnl = pair(query.minRealizedPnlUsd, query.maxRealizedPnlUsd, "RealizedPnlUsd");
      const winRate = pair(query.minWinRatePercent, query.maxWinRatePercent, "WinRatePercent");
      const txs = pair(query.minTxs, query.maxTxs, "Txs", { integer: true });
      const volume = pair(query.minTxVolume, query.maxTxVolume, "TxVolume");
      const params: QueryInput = {
        chainIndex,
        timeFrame,
        sortBy,
        walletType,
        minRealizedPnlUsd: pnl.min,
        maxRealizedPnlUsd: pnl.max,
        minWinRatePercent: winRate.min,
        maxWinRatePercent: winRate.max,
        minTxs: txs.min,
        maxTxs: txs.max,
        minTxVolume: volume.min,
        maxTxVolume: volume.max,
      };
      return readGet(http, "market.leaderboard.list", params, (data) => parseLeaderboard(data));
    },
  };
}
