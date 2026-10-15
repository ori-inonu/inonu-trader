const EVM_CHAIN_INDEXES = new Set([
  "1", "10", "56", "130", "146", "196", "137", "42161", "43114", "324", "1101", "8453",
  "59144", "250", "5000", "1030", "1088", "4200", "81457", "169", "534352", "25", "7000", "143", "4663", "5042", "999", "57073", "1672", "9745",
]);

/** Normalize only chain IDs explicitly documented by OKX as EVM. */
export function normalizeTokenAddress(chainIndex: string, address: string): string {
  return EVM_CHAIN_INDEXES.has(chainIndex) ? address.toLowerCase() : address;
}

export function tokenAddressesEqual(chainIndex: string, left: string, right: string): boolean {
  return normalizeTokenAddress(chainIndex, left) === normalizeTokenAddress(chainIndex, right);
}
