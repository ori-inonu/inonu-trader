"use client";

/**
 * The accounts whose balance sizes the picks, resolved the way the Carteira tab resolves them (a connected wallet always wins over a public address that is only followed), and the function
 * that reads that balance when the person clicks. Nothing is read until `read` is called, and `read` is called by a click.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import type { UseOkxWalletResult } from "../useOkxWallet";
import { useSolanaAccount } from "../useSolanaAccount";
import { createHoldingsReader } from "../wallet/holdings";
import { loadWatch, type WatchFamily } from "../wallet/watch";
import { type BalanceAccounts, type BalanceRead, readBalance } from "./balance";

const EVM_ADDRESS = /^0x[0-9a-fA-F]{40}$/;

/** The accounts from what the page knows: the connected EVM account, the Solana one, and the address that is followed. Pure. */
export function resolveAccounts(input: {
  readonly connectedEvm: string | null;
  readonly solana: string | null;
  readonly watched: { readonly address: string; readonly family: WatchFamily } | null;
}): BalanceAccounts {
  const evm = input.connectedEvm !== null && EVM_ADDRESS.test(input.connectedEvm) ? input.connectedEvm : input.watched?.family === "evm" ? input.watched.address : null;
  const solana = input.solana ?? (input.watched?.family === "solana" ? input.watched.address : null);
  return { evm, solana };
}

export interface BalanceReader {
  readonly accounts: BalanceAccounts;
  readonly hasAccount: boolean;
  /** Reads the balance now. Free, and only the click of a person calls it. */
  readonly read: (signal?: AbortSignal) => Promise<BalanceRead>;
}

export function useBalanceReader(wallet: UseOkxWalletResult): BalanceReader {
  const solana = useSolanaAccount();
  // the followed address is read after mount, so the first paint is always the same
  const [watched, setWatched] = useState<{ readonly address: string; readonly family: WatchFamily } | null>(null);
  useEffect(() => {
    try {
      setWatched(loadWatch(window.localStorage));
    } catch {
      setWatched(null);
    }
  }, []);
  const connected = wallet.snapshot.account !== null && wallet.snapshot.status !== "disconnected" ? wallet.snapshot.account : null;
  const accounts = useMemo(() => resolveAccounts({ connectedEvm: connected, solana: solana.snapshot.account, watched }), [connected, solana.snapshot.account, watched]);
  const read = useCallback((signal?: AbortSignal) => readBalance(createHoldingsReader(), accounts, { now: Date.now, scope: "all", ...(signal ? { signal } : {}) }), [accounts]);
  return { accounts, hasAccount: accounts.evm !== null || accounts.solana !== null, read };
}
