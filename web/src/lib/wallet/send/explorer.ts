/**
 * Where a person can look at an address on the network, to check WHAT the contract is before trusting it (the name of a verified contract, who deployed it). Only the explorers of networks the app knows for
 * sure are listed; a network that is not here gets no link, and the panel then tells the person to look the address up wherever they trust. A link is only an address to open: the app never reads the page.
 */

const EXPLORERS: Readonly<Record<string, string>> = {
  "1": "https://etherscan.io",
  "10": "https://optimistic.etherscan.io",
  "56": "https://bscscan.com",
  "137": "https://polygonscan.com",
  "8453": "https://basescan.org",
  "42161": "https://arbiscan.io",
  "196": "https://www.oklink.com/x-layer",
};

/** The page of an address on the explorer of its network, or null when the network has no explorer in the list or the text is not an address. */
export function explorerAddressUrl(chainIndex: string, address: string): string | null {
  const base = EXPLORERS[chainIndex];
  if (base === undefined || !/^0x[0-9a-fA-F]{40}$/.test(address)) return null;
  return `${base}/address/${address}`;
}

/** Whether two addresses are the same one: an address has no case, and the person may paste it with spaces around. */
export function sameAddress(typed: string, address: string): boolean {
  const clean = typed.trim().toLowerCase();
  return /^0x[0-9a-f]{40}$/.test(clean) && clean === address.toLowerCase();
}
