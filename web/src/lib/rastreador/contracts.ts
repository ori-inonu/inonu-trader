/**
 * The size of one contract of each USDT perpetual (FLX-11). The exchange reports a perpetual's volume in CONTRACTS; in dollars it
 * is contracts times the size of one contract in coin (`ctVal` times `ctMult`) times the price. The size comes from the
 * exchange's own list of instruments, one free read for the whole page. Only linear USDT contracts are used; a coin margined
 * contract, another quote, or a row that does not say its size is left out, so its volume stays unknown instead of being guessed.
 */
export const CONTRACTS_URL = "https://www.okx.com/api/v5/public/instruments?instType=SWAP";

export interface FetchResponseLike {
  readonly ok: boolean;
  readonly status: number;
  text(): Promise<string>;
}

const positive = (v: unknown): number | null => {
  if (typeof v !== "string") return null;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
};

/** Coin per contract by instrument id, for the linear USDT perpetuals that state it. */
export function parseContracts(data: unknown): Map<string, number> {
  const sizes = new Map<string, number>();
  if (!Array.isArray(data)) return sizes;
  for (const item of data) {
    if (typeof item !== "object" || item === null) continue;
    const r = item as Record<string, unknown>;
    if (typeof r.instId !== "string" || !r.instId.endsWith("-USDT-SWAP") || r.ctType !== "linear" || r.settleCcy !== "USDT") continue;
    const ctVal = positive(r.ctVal);
    const ctMult = positive(r.ctMult);
    if (ctVal === null || ctMult === null) continue;
    sizes.set(r.instId, ctVal * ctMult);
  }
  return sizes;
}

export function createContractReader(options: { readonly fetch?: (url: string) => Promise<FetchResponseLike> } = {}) {
  const doFetch = options.fetch ?? ((url: string) => fetch(url) as unknown as Promise<FetchResponseLike>);
  return {
    /** The sizes, or null when they could not be read (the caller tries again at the next refresh). */
    async read(): Promise<Map<string, number> | null> {
      try {
        const res = await doFetch(CONTRACTS_URL);
        if (!res.ok) return null;
        const body: unknown = JSON.parse(await res.text());
        if (typeof body !== "object" || body === null || (body as { code?: unknown }).code !== "0") return null;
        return parseContracts((body as { data?: unknown }).data);
      } catch {
        return null;
      }
    },
  };
}

export type ContractReader = ReturnType<typeof createContractReader>;
