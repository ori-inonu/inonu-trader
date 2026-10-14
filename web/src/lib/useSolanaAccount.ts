"use client";

import { useEffect, useSyncExternalStore } from "react";
import type { SolanaAccountSnapshot } from "./wallet/solana-account";
import { getBrowserSolanaStore, solanaServerSnapshot } from "./wallet/solana-store";

export interface UseSolanaAccountResult {
  /** The Solana provider of the extension was found. Finding it asks for no access. */
  readonly available: boolean;
  /** The looking is over: if it is not available now, it is not there. */
  readonly ready: boolean;
  readonly snapshot: SolanaAccountSnapshot;
  /** Only the click of a person calls this. */
  connect(): Promise<void>;
  disconnect(): void;
}

/**
 * Browser only. The Solana account is one for the whole page: every screen that calls this sees the same session (see wallet/solana-store.ts), the way the EVM wallet is
 * shared by `useOkxWallet`. Mounting looks for the provider and asks the wallet for nothing.
 */
export function useSolanaAccount(): UseSolanaAccountResult {
  const store = getBrowserSolanaStore();
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot, () => solanaServerSnapshot);
  useEffect(() => {
    if (typeof window === "undefined") return;
    return store.retain(window as unknown as { okxwallet?: unknown });
  }, [store]);
  return { available: state.available, ready: state.ready, snapshot: state.snapshot, connect: store.connect, disconnect: store.disconnect };
}
