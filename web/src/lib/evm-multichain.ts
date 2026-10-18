/**
 * Multichain EVM balances for the connected OKX account, read directly from each
 * network's public JSON-RPC endpoint. The injected provider only answers for the
 * wallet's current network; this module never asks it to switch and never signs.
 * A chain that fails stays "error", never zero.
 */
import { isValidWalletTimestamp } from "./wallet-freshness";

export interface EvmTokenSpec {
  symbol: string;
  contract: string;
  decimals: number;
}

export interface EvmChainSpec {
  chainIdHex: string;
  chainIndex: string;
  name: string;
  nativeSymbol: string;
  rpcUrl: string;
  tokens: readonly EvmTokenSpec[];
}

/** Public token contracts per network; identity is (chain, contract), never the symbol. */
export const EVM_CHAINS: readonly EvmChainSpec[] = [
  { chainIdHex: "0x8f", chainIndex: "143", name: "Monad", nativeSymbol: "MON", rpcUrl: "https://rpc.monad.xyz", tokens: [
    { symbol: "USDC", contract: "0x754704Bc059F8C67012fEd69BC8A327a5aafb603", decimals: 6 },
  ] },
  { chainIdHex: "0xc4", chainIndex: "196", name: "X Layer", nativeSymbol: "OKB", rpcUrl: "https://rpc.xlayer.tech", tokens: [
    { symbol: "USDT", contract: "0x1E4a5963aBFD975d8c9021ce480b42188849D41d", decimals: 6 },
    { symbol: "USDT0", contract: "0x779Ded0c9e1022225f8E0630b35a9b54bE713736", decimals: 6 },
    { symbol: "USDC", contract: "0xB6CEceAB302E2E4948951eE7843FC24E92933061", decimals: 6 },
    { symbol: "USDC_Bridged", contract: "0x74b7F16337b8972027F6196A17a631aC6dE26d22", decimals: 6 },
    { symbol: "USDC.e", contract: "0xA8CE8aee21bC2A48a5EF670afCc9274C7bbbC035", decimals: 6 },
  ] },
  { chainIdHex: "0x1", chainIndex: "1", name: "Ethereum", nativeSymbol: "ETH", rpcUrl: "https://ethereum-rpc.publicnode.com", tokens: [
    { symbol: "USDT", contract: "0xdAC17F958D2ee523a2206206994597C13D831ec7", decimals: 6 },
    { symbol: "USDC", contract: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", decimals: 6 },
  ] },
  { chainIdHex: "0x38", chainIndex: "56", name: "BNB Chain", nativeSymbol: "BNB", rpcUrl: "https://bsc-rpc.publicnode.com", tokens: [
    { symbol: "USDT", contract: "0x55d398326f99059fF775485246999027B3197955", decimals: 18 },
    { symbol: "USDC", contract: "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d", decimals: 18 },
  ] },
  { chainIdHex: "0x2105", chainIndex: "8453", name: "Base", nativeSymbol: "ETH", rpcUrl: "https://base-rpc.publicnode.com", tokens: [
    { symbol: "USDC", contract: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", decimals: 6 },
  ] },
  { chainIdHex: "0xa4b1", chainIndex: "42161", name: "Arbitrum One", nativeSymbol: "ETH", rpcUrl: "https://arbitrum-one-rpc.publicnode.com", tokens: [
    { symbol: "USDT", contract: "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9", decimals: 6 },
    { symbol: "USDC", contract: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831", decimals: 6 },
  ] },
  { chainIdHex: "0x89", chainIndex: "137", name: "Polygon", nativeSymbol: "POL", rpcUrl: "https://polygon-bor-rpc.publicnode.com", tokens: [
    { symbol: "USDT", contract: "0xc2132D05D31c914a87C6611C10748AEb04B58e8F", decimals: 6 },
    { symbol: "USDC", contract: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359", decimals: 6 },
  ] },
  { chainIdHex: "0xa", chainIndex: "10", name: "Optimism", nativeSymbol: "ETH", rpcUrl: "https://optimism-rpc.publicnode.com", tokens: [
    { symbol: "USDT", contract: "0x94b008aA00579c1307B0EF2c499aD98a8ce58e58", decimals: 6 },
    { symbol: "USDC", contract: "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85", decimals: 6 },
  ] },
];

export interface EvmBalanceObservation {
  symbol: string;
  amount: string;
  rawRpc: string;
  rawUnits: string;
  decimals: number;
  decimalsSource: "configured";
}

export interface ChainBalanceResult {
  account: string;
  chainIndex: string;
  chainIdHex: string;
  name: string;
  status: "ok" | "error";
  block: string | null;
  rawBlock: string | null;
  source: "public-rpc-reported";
  rpcHost: string | null;
  observedAtMs: number | null;
  native: EvmBalanceObservation | null;
  tokens: (EvmBalanceObservation & { contract: string })[];
  error: string | null;
}

export interface MultichainSnapshot {
  account: string;
  observedAtMs: number | null;
  chains: ChainBalanceResult[];
}

export type EvmRpcFetch = (rpcUrl: string, body: string) => Promise<unknown>;

const HEX_QUANTITY = /^0x(?:0|[1-9a-fA-F][0-9a-fA-F]{0,63})$/;
const WORD = /^0x[0-9a-fA-F]{64}$/;

function matchesExactly(value: unknown, pattern: RegExp): value is string {
  return typeof value === "string" && pattern.exec(value)?.[0] === value;
}

function rpcResults(value: unknown): Map<number, unknown> | null {
  if (!Array.isArray(value)) return null;
  const results = new Map<number, unknown>();
  for (const row of value) {
    if (!isRecord(row) || !Number.isSafeInteger(row.id) || typeof row.id !== "number"
      || results.has(row.id) || "error" in row || !("result" in row)) return null;
    results.set(row.id, row.result);
  }
  return results;
}

function formatUnits(value: bigint, decimals: number): string {
  const scale = BigInt(10) ** BigInt(decimals);
  const whole = value / scale;
  const fraction = (value % scale).toString().padStart(decimals, "0").replace(/0+$/, "");
  return fraction ? `${whole.toString()}.${fraction}` : whole.toString();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function observationTime(now: () => number): number | null {
  try {
    const time = now();
    return isValidWalletTimestamp(time) ? time : null;
  } catch {
    return null;
  }
}

function rpcHostname(url: string): string | null {
  try { return new URL(url).hostname; } catch { return null; }
}

function balanceObservation(symbol: string, rawRpc: string, decimals: number): EvmBalanceObservation {
  const units = BigInt(rawRpc);
  return { symbol, rawRpc, rawUnits: units.toString(), decimals, decimalsSource: "configured", amount: formatUnits(units, decimals) };
}

export function defaultEvmRpcFetch(timeoutMs = 8_000): EvmRpcFetch {
  return async (rpcUrl, body) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(rpcUrl, { method: "POST", headers: { "content-type": "application/json" }, body, signal: controller.signal });
      if (!response.ok) throw new Error("rpc http error");
      return await response.json();
    } finally {
      clearTimeout(timer);
    }
  };
}

/**
 * RPC overrides from the build environment, one literal access per network of EVM_CHAINS. Next replaces only the literal
 * form NEXT_PUBLIC_NAME read as a property of the process environment object in the browser bundle, so that object handed
 * over whole, a computed key or a loop gives the panel an empty record and no override ever arrives. A network added to
 * EVM_CHAINS needs a line here and a line in web/.env.example; evm-rpc-overrides.test.ts fails until both exist.
 */
export function publicEvmRpcOverrides(): Record<string, string | undefined> {
  return {
    NEXT_PUBLIC_EVM_RPC_143: process.env.NEXT_PUBLIC_EVM_RPC_143,
    NEXT_PUBLIC_EVM_RPC_196: process.env.NEXT_PUBLIC_EVM_RPC_196,
    NEXT_PUBLIC_EVM_RPC_1: process.env.NEXT_PUBLIC_EVM_RPC_1,
    NEXT_PUBLIC_EVM_RPC_56: process.env.NEXT_PUBLIC_EVM_RPC_56,
    NEXT_PUBLIC_EVM_RPC_8453: process.env.NEXT_PUBLIC_EVM_RPC_8453,
    NEXT_PUBLIC_EVM_RPC_42161: process.env.NEXT_PUBLIC_EVM_RPC_42161,
    NEXT_PUBLIC_EVM_RPC_137: process.env.NEXT_PUBLIC_EVM_RPC_137,
    NEXT_PUBLIC_EVM_RPC_10: process.env.NEXT_PUBLIC_EVM_RPC_10,
  };
}

function rpcUrlFor(chain: EvmChainSpec, overrides: Record<string, string | undefined>): string {
  const override = overrides[`NEXT_PUBLIC_EVM_RPC_${chain.chainIndex}`];
  return override && /^https?:\/\//.test(override) ? override : chain.rpcUrl;
}

/** Batches one eth_chainId, eth_blockNumber, eth_getBalance and one balanceOf per token for a chain. */
export async function readChainBalances(account: string, chain: EvmChainSpec, rpc: EvmRpcFetch, overrides: Record<string, string | undefined> = {}, now: () => number = Date.now): Promise<ChainBalanceResult> {
  const url = rpcUrlFor(chain, overrides);
  const base: ChainBalanceResult = { account, chainIndex: chain.chainIndex, chainIdHex: chain.chainIdHex, name: chain.name, status: "error", block: null, rawBlock: null, source: "public-rpc-reported", rpcHost: rpcHostname(url), observedAtMs: null, native: null, tokens: [], error: null };
  if (!matchesExactly(account, /^0x[0-9a-fA-F]{40}$/)) return { ...base, error: "conta inválida" };
  const callData = "0x70a08231" + account.slice(2).toLowerCase().padStart(64, "0");
  try {
    const head = await rpc(url, JSON.stringify([
      { jsonrpc: "2.0", id: 1, method: "eth_chainId", params: [] },
      { jsonrpc: "2.0", id: 2, method: "eth_blockNumber", params: [] },
    ]));
    const results = rpcResults(head);
    const chainId = results?.get(1);
    const block = results?.get(2);
    if (!matchesExactly(chainId, HEX_QUANTITY) || `0x${BigInt(chainId).toString(16)}` !== chain.chainIdHex) return { ...base, error: "a RPC respondeu por outra rede" };
    if (!matchesExactly(block, HEX_QUANTITY)) return { ...base, error: "bloco inválido" };
    const atBlock = { ...base, block: BigInt(block).toString(), rawBlock: block };
    const requests = [
      { jsonrpc: "2.0", id: 10, method: "eth_getBalance", params: [account, block] },
      ...chain.tokens.map((token, index) => ({ jsonrpc: "2.0", id: 100 + index, method: "eth_call", params: [{ to: token.contract, data: callData }, block] })),
    ];
    const body = await rpc(url, JSON.stringify(requests));
    const rows = rpcResults(body);
    const native = rows?.get(10);
    if (!matchesExactly(native, HEX_QUANTITY)) return { ...atBlock, error: "saldo nativo inválido" };
    const tokens: ChainBalanceResult["tokens"] = [];
    for (const [index, token] of chain.tokens.entries()) {
      const raw = rows?.get(100 + index);
      if (!matchesExactly(raw, WORD)) return { ...atBlock, error: `saldo de ${token.symbol} inválido` };
      tokens.push({ ...balanceObservation(token.symbol, raw, token.decimals), contract: token.contract });
    }
    return { ...atBlock, status: "ok", observedAtMs: observationTime(now), native: balanceObservation(chain.nativeSymbol, native, 18), tokens, error: null };
  } catch {
    return { ...base, error: "a RPC pública não respondeu" };
  }
}

export async function readMultichainBalances(account: string, rpc: EvmRpcFetch, options: { chains?: readonly EvmChainSpec[]; now?: () => number; overrides?: Record<string, string | undefined> } = {}): Promise<MultichainSnapshot> {
  const now = options.now ?? Date.now;
  const chains = await Promise.all((options.chains ?? EVM_CHAINS).map((chain) => readChainBalances(account, chain, rpc, options.overrides, now)));
  return { account, observedAtMs: observationTime(now), chains };
}
