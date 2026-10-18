/**
 * Connecting the wallet from the browser: the one click the person makes. The OKX extension injects `window.okxwallet` (an EIP-1193 provider for the EVM networks, and `okxwallet.solana` for Solana). The
 * addresses it gives are public; nothing here signs anything or asks for a signature. Pure over the window it is handed, so the tests run without a browser. An absent extension is not an error of the
 * connection: the agent's own wallet comes with the sign-in that follows, and the extension only adds the person's own wallet to the picture.
 */

export interface Eip1193Like {
  request(args: { readonly method: string; readonly params?: readonly unknown[] }): Promise<unknown>;
}

export interface SolanaLike {
  connect?: () => Promise<unknown>;
  publicKey?: { toString(): string } | null;
}

export interface WalletWindow {
  readonly okxwallet?: (Eip1193Like & { readonly solana?: SolanaLike }) | undefined;
}

export interface BrowserWallet {
  readonly evm: string | null;
  readonly solana: string | null;
}

export type BrowserWalletResult =
  | { readonly ok: true; readonly wallet: BrowserWallet }
  | { readonly ok: false; readonly reason: "sem_extensao" | "recusada" | "sem_conta" };

const EVM = /^0x[0-9a-fA-F]{40}$/;
const SOLANA = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

/** Asks the extension for the accounts of the person (it opens its own window to approve) and returns the public addresses. */
export async function connectBrowserWallet(win: WalletWindow | undefined): Promise<BrowserWalletResult> {
  const provider = win?.okxwallet;
  if (provider === undefined || typeof provider.request !== "function") return { ok: false, reason: "sem_extensao" };
  let evm: string | null = null;
  try {
    const accounts = await provider.request({ method: "eth_requestAccounts" });
    const first = Array.isArray(accounts) ? accounts.find((a): a is string => typeof a === "string" && EVM.test(a)) : undefined;
    evm = first === undefined ? null : first.toLowerCase();
  } catch {
    return { ok: false, reason: "recusada" };
  }
  let solana: string | null = null;
  try {
    const sol = provider.solana;
    if (sol !== undefined && typeof sol.connect === "function") {
      const answer = (await sol.connect()) as { publicKey?: { toString(): string } | null } | undefined;
      const key = (answer?.publicKey ?? sol.publicKey)?.toString();
      solana = key !== undefined && SOLANA.test(key) ? key : null;
    }
  } catch {
    // Solana is optional: a refusal there does not undo the EVM connection
    solana = null;
  }
  return evm === null && solana === null ? { ok: false, reason: "sem_conta" } : { ok: true, wallet: { evm, solana } };
}
