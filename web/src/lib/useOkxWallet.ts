"use client";

import { useEffect, useSyncExternalStore } from "react";
import type { OkxDiscoverySurface, WalletSnapshot } from "./okx-wallet";
import { getBrowserWalletStore, walletServerSnapshot } from "./wallet-store";

export interface UseOkxWalletResult {
  available: boolean;
  ready: boolean;
  snapshot: WalletSnapshot;
  revision: number;
  identityKey: string | null;
  connect(): Promise<void>;
  refresh(): Promise<void>;
  switchToMonad(): Promise<void>;
  switchToXLayer(): Promise<void>;
  disconnect(): void;
}

/** Discovery and connection remain local. Sharing a session does not grant query consent. */
export function useOkxWallet(): UseOkxWalletResult {
  const store = getBrowserWalletStore();
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot, () => walletServerSnapshot);
  useEffect(() => {
    if (typeof window === "undefined") return;
    return store.retain(window as unknown as OkxDiscoverySurface);
  }, [store]);
  return { ...state, connect: store.connect, refresh: store.refresh, switchToMonad: store.switchToMonad, switchToXLayer: store.switchToXLayer, disconnect: store.disconnect };
}
