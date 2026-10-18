/**
 * OKX OnChain OS chain registry used by the multichain inventory and the operator.
 *
 * chainIndex values follow the OKX supported-chain table
 * (https://web3.okx.com/onchainos/dev-docs/home/supported-chain, read 2026-10-10).
 * Native symbols, decimals and EVM chain IDs are public network facts. Nothing here
 * proves that a given wallet holds assets on a chain or that an API tier covers it.
 */
export type ChainKind = "evm" | "solana" | "tron" | "sui" | "ton" | "bitcoin";

export interface ChainSpec {
  chainIndex: string;
  name: string;
  kind: ChainKind;
  nativeSymbol: string;
  nativeDecimals: number;
  /** Hex chain ID for EIP-155 networks; absent for non-EVM chains. */
  evmChainIdHex?: string;
  /** Which asset pays transaction fees; execution without it is impossible. */
  gasNote: string;
}

export const OKX_CHAINS: readonly ChainSpec[] = [
  { chainIndex: "143", name: "Monad", kind: "evm", nativeSymbol: "MON", nativeDecimals: 18, evmChainIdHex: "0x8f", gasNote: "Gas em MON" },
  { chainIndex: "196", name: "X Layer", kind: "evm", nativeSymbol: "OKB", nativeDecimals: 18, evmChainIdHex: "0xc4", gasNote: "Gas em OKB" },
  { chainIndex: "501", name: "Solana", kind: "solana", nativeSymbol: "SOL", nativeDecimals: 9, gasNote: "Taxas em SOL, inclusive rent de contas de token" },
  { chainIndex: "1", name: "Ethereum", kind: "evm", nativeSymbol: "ETH", nativeDecimals: 18, evmChainIdHex: "0x1", gasNote: "Gas em ETH" },
  { chainIndex: "56", name: "BNB Chain", kind: "evm", nativeSymbol: "BNB", nativeDecimals: 18, evmChainIdHex: "0x38", gasNote: "Gas em BNB" },
  { chainIndex: "8453", name: "Base", kind: "evm", nativeSymbol: "ETH", nativeDecimals: 18, evmChainIdHex: "0x2105", gasNote: "Gas em ETH" },
  { chainIndex: "42161", name: "Arbitrum One", kind: "evm", nativeSymbol: "ETH", nativeDecimals: 18, evmChainIdHex: "0xa4b1", gasNote: "Gas em ETH" },
  { chainIndex: "137", name: "Polygon", kind: "evm", nativeSymbol: "POL", nativeDecimals: 18, evmChainIdHex: "0x89", gasNote: "Gas em POL" },
  { chainIndex: "10", name: "Optimism", kind: "evm", nativeSymbol: "ETH", nativeDecimals: 18, evmChainIdHex: "0xa", gasNote: "Gas em ETH" },
  { chainIndex: "195", name: "Tron", kind: "tron", nativeSymbol: "TRX", nativeDecimals: 6, gasNote: "Energia e largura de banda em TRX" },
  { chainIndex: "784", name: "Sui", kind: "sui", nativeSymbol: "SUI", nativeDecimals: 9, gasNote: "Gas em SUI" },
  { chainIndex: "607", name: "TON", kind: "ton", nativeSymbol: "TON", nativeDecimals: 9, gasNote: "Taxas em TON" },
  { chainIndex: "0", name: "Bitcoin", kind: "bitcoin", nativeSymbol: "BTC", nativeDecimals: 8, gasNote: "Taxa de rede em BTC" },
] as const;

/** Chains queried by default for the wallet inventory; at most 50 are allowed per OKX request. */
export const DEFAULT_INVENTORY_CHAINS: readonly string[] = ["143", "196", "501", "1", "56", "8453", "42161", "137", "10"];

const byIndex = new Map(OKX_CHAINS.map((chain) => [chain.chainIndex, chain] as const));

export function chainByIndex(chainIndex: string): ChainSpec | undefined {
  return byIndex.get(chainIndex);
}

export function isKnownChainIndex(value: unknown): value is string {
  return typeof value === "string" && byIndex.has(value);
}

/** Validates a chain list for one OKX balance request: known, unique, 1..50 entries. */
export function validateChainList(chains: unknown): string[] {
  if (!Array.isArray(chains) || chains.length < 1 || chains.length > 50) throw new Error("Invalid chain list");
  const seen = new Set<string>();
  for (const chain of chains) {
    if (!isKnownChainIndex(chain) || seen.has(chain)) throw new Error("Invalid chain list");
    seen.add(chain);
  }
  return [...seen];
}

/** Address syntax per chain family. It proves format only, never ownership. */
export function isAddressForChain(chainIndex: string, address: unknown): address is string {
  if (typeof address !== "string") return false;
  const chain = byIndex.get(chainIndex);
  if (!chain) return false;
  switch (chain.kind) {
    case "evm":
      return /^0x[0-9a-fA-F]{40}$/.test(address);
    case "solana":
      return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address);
    case "tron":
      return /^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(address);
    case "sui":
      return /^0x[0-9a-fA-F]{64}$/.test(address);
    case "ton":
      return /^[A-Za-z0-9_-]{48}$/.test(address) || /^-?\d+:[0-9a-fA-F]{64}$/.test(address);
    case "bitcoin":
      return /^(bc1[02-9ac-hj-np-z]{11,87}|[13][1-9A-HJ-NP-Za-km-z]{25,34})$/.test(address);
  }
}
