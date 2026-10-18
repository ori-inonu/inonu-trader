/**
 * Which currency icon belongs to what the desk draws (ICO-1 to ICO-3). The picture is fetched and cached by the local core
 * (`/inonu/icon/<symbol>`, see src/inonu/icons.ts), so the browser only ever asks its own origin. A network is drawn with the
 * icon of its NATIVE currency, which is what OKX's public icon host has; a network's own brand logo and an on-chain token's
 * logo need the provider's logo url through the gateway and are a separate task.
 */
export const ICON_PATH = "/inonu/icon/";

const SYMBOL = /^[a-z0-9]{1,15}$/;

/** `base` is the origin of the core: "" in the installed app (same origin). */
export function iconUrl(symbol: string, base: string = process.env.NEXT_PUBLIC_API_URL ?? ""): string | null {
  const clean = symbol.trim().toLowerCase();
  if (clean === "" || clean.length > 15) return null;
  return `${base}${ICON_PATH}${encodeURIComponent(clean)}`;
}

/** The logo of a network itself (ICO-2), served by the local core from the provider's own list of networks: only a number is accepted. */
export const CHAIN_ICON_PATH = "/inonu/chain-icon/";

export function chainIconUrl(chainIndex: string, base: string = process.env.NEXT_PUBLIC_API_URL ?? ""): string | null {
  return /^\d{1,12}$/.test(chainIndex) ? `${base}${CHAIN_ICON_PATH}${chainIndex}` : null;
}

/** `BTC-USDT`, `ETH-USDT-SWAP`, `SOL-USD-250627` -> the base currency, lowercase. */
export function instrumentIconSymbol(instId: string): string | null {
  const base = /^([A-Z0-9]{1,15})-[A-Z0-9]{1,15}(?:-(?:SWAP|\d{6}))?$/.exec(instId)?.[1];
  return base === undefined ? null : base.toLowerCase();
}

/** chainIndex -> the symbol of the currency the network pays gas in. Only what is certain: a guess could show another coin. */
const NATIVE: Readonly<Record<string, string>> = {
  "0": "btc",
  "1": "eth",
  "10": "eth",
  "56": "bnb",
  "137": "pol",
  "195": "trx",
  "196": "okb",
  "324": "eth",
  "501": "sol",
  "607": "ton",
  "637": "apt",
  "784": "sui",
  "1101": "eth",
  "8453": "eth",
  "42161": "eth",
  "43114": "avax",
  "59144": "eth",
  "81457": "eth",
  "534352": "eth",
};

/** The badge letters of a network are NOT tried as a symbol: Arc the network is not ARC the token. */
export function chainIconSymbol(chainIndex: string, _short: string): string | null {
  return NATIVE[chainIndex] ?? null;
}
