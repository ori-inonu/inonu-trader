import type { DefiProduct, DefiSource } from "../operator/candidates";
import { TRADE_PATHS, type OkxTradeClient } from "./trade";

/**
 * DeFi product discovery through OKX OnChain OS
 * (POST /api/v6/defi/product/search; body {tokenKeywordList, chainIndex, pageNum,
 * productGroup}; `rate` is a decimal fraction, `tvl` is USD). Subscribe fees are
 * not published by the search, so candidates built from this source stay
 * cost-incomplete until a subscribe calldata estimate is attached.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function decimalOrNull(value: unknown): number | null {
  if (typeof value !== "string" || !/^\d+(?:\.\d+)?$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function parseDefiSearch(data: unknown, chainIndex: string, tokenContractAddress: string): DefiProduct[] {
  if (!isRecord(data) || !Array.isArray(data.list)) throw new Error("Unexpected DeFi search schema");
  const products: DefiProduct[] = [];
  for (const entry of data.list) {
    if (!isRecord(entry) || (typeof entry.investmentId !== "string" && typeof entry.investmentId !== "number") || typeof entry.name !== "string") continue;
    if (typeof entry.chainIndex === "string" && entry.chainIndex !== chainIndex) continue;
    const rate = decimalOrNull(typeof entry.rate === "number" ? String(entry.rate) : entry.rate);
    products.push({
      id: String(entry.investmentId),
      name: typeof entry.platformName === "string" ? `${entry.platformName} ${entry.name}` : entry.name,
      chainIndex,
      tokenContractAddress,
      apyPercent: rate === null ? null : rate * 100,
      tvlUsd: decimalOrNull(entry.tvl),
      subscribeFeeUsd: null,
    });
  }
  return products;
}

export function okxDefiSource(client: OkxTradeClient, symbolFor: (chainIndex: string, tokenContractAddress: string) => string | null): DefiSource {
  return {
    async products(chainIndex, tokenContractAddress) {
      const symbol = symbolFor(chainIndex, tokenContractAddress);
      if (!symbol) return [];
      const data = await client.post(TRADE_PATHS.defiProductSearch, { tokenKeywordList: [symbol], chainIndex, pageNum: 1, productGroup: "SINGLE_EARN" });
      return parseDefiSearch(data, chainIndex, tokenContractAddress);
    },
  };
}
