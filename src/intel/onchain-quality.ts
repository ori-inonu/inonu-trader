/**
 * The `qualidade` component of the trail (fase-2 SPEC tabela 4.1, F2-DIG-11): the mean win rate of the tracked wallets that
 * bought a token. It needs the FULL wallet addresses of the signals and of the leaderboard, which only the server process
 * has (`gateway.callInternal`); nothing of it leaves this function except one number. Pure.
 */
export interface WalletWin {
  readonly wallet: string;
  /** From 0 to 100, as the provider sends it (measured: 37.5). */
  readonly winRatePct: number | null;
}

export interface QualityResult {
  /** The mean win rate as a fraction from 0 to 1, or null. */
  readonly value: number | null;
  readonly matched: number;
  readonly reason: "sem_enderecos" | "sem_juncao" | null;
}

/** EVM addresses are case insensitive; the others (base58) are compared exactly. */
const key = (address: string): string => (/^0x[0-9a-fA-F]+$/.test(address) ? address.toLowerCase() : address);

export function qualityFromWallets(signalWallets: readonly string[], leaderboard: readonly WalletWin[]): QualityResult {
  const wallets = [...new Set(signalWallets.map(key))];
  if (wallets.length === 0) return { value: null, matched: 0, reason: "sem_enderecos" };
  const rates = new Map<string, number>();
  for (const row of leaderboard) {
    const rate = row.winRatePct;
    if (rate !== null && Number.isFinite(rate) && rate >= 0 && rate <= 100) rates.set(key(row.wallet), rate);
  }
  const found = wallets.flatMap((w) => (rates.has(w) ? [rates.get(w)!] : []));
  if (found.length === 0) return { value: null, matched: 0, reason: "sem_juncao" };
  return { value: found.reduce((a, b) => a + b, 0) / found.length / 100, matched: found.length, reason: null };
}
