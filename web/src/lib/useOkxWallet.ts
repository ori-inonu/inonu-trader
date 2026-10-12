"use client";

import { useEffect, useSyncExternalStore } from "react";
import type { OkxDiscoverySurface, WalletSnapshot } from "./okx-wallet";
import type { WalletTransactionPreflightResult } from "./wallet-transaction-preflight";
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
  preflightTransaction(input: unknown): Promise<WalletTransactionPreflightResult>;
  getSessionToken(): number;
  subscribeSessionInvalidation(listener: () => void): () => void;
}

/**
 * Discovery and connection remain local and are shared by every mounted consumer.
 * Sharing a session does not grant query consent, and the preflight never signs.
 */
export function useOkxWallet(): UseOkxWalletResult {
  const store = getBrowserWalletStore();
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot, () => walletServerSnapshot);
  useEffect(() => {
    if (typeof window === "undefined") return;
    return store.retain(window as unknown as OkxDiscoverySurface);
  }, [store]);
  return {
    ...state,
    connect: store.connect,
    refresh: store.refresh,
    switchToMonad: store.switchToMonad,
    switchToXLayer: store.switchToXLayer,
    disconnect: store.disconnect,
    preflightTransaction: store.preflightTransaction,
    getSessionToken: store.getSessionToken,
    subscribeSessionInvalidation: store.subscribeSessionInvalidation,
  };
}
