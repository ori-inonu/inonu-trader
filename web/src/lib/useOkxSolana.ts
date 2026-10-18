"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createSolanaSession, discoverOkxSolanaProvider, type SolanaSession, type SolanaSnapshot } from "./okx-solana";

const initial: SolanaSnapshot = { status: "disconnected", account: null, balances: null, observedAtMs: null, error: null };

export interface UseOkxSolanaResult {
  available: boolean;
  ready: boolean;
  snapshot: SolanaSnapshot;
  connect(): Promise<void>;
  refresh(): Promise<void>;
  disconnect(): void;
}

/** Browser-only. Discovery never requests account access; `connect` does. */
export function useOkxSolana(): UseOkxSolanaResult {
  const sessionRef = useRef<SolanaSession | null>(null);
  const [available, setAvailable] = useState(false);
  const [ready, setReady] = useState(false);
  const [snapshot, setSnapshot] = useState(initial);

  useEffect(() => {
    if (typeof window === "undefined") return;
    let session: SolanaSession | null = null;
    let unsubscribe: (() => void) | null = null;
    const attach = () => {
      if (session) return true;
      const provider = discoverOkxSolanaProvider(window as unknown as { okxwallet?: unknown });
      if (!provider) return false;
      session = createSolanaSession(provider, { rpcUrl: process.env.NEXT_PUBLIC_SOLANA_RPC_URL });
      sessionRef.current = session;
      unsubscribe = session.subscribe(setSnapshot);
      setSnapshot(session.getSnapshot());
      setAvailable(true);
      return true;
    };
    const found = attach();
    const timer = found ? null : window.setTimeout(() => { attach(); setReady(true); }, 400);
    if (found) setReady(true);
    return () => {
      if (timer !== null) window.clearTimeout(timer);
      unsubscribe?.();
      session?.dispose();
      sessionRef.current = null;
    };
  }, []);

  const connect = useCallback(() => sessionRef.current?.connect() ?? Promise.resolve(), []);
  const refresh = useCallback(() => sessionRef.current?.refresh() ?? Promise.resolve(), []);
  const disconnect = useCallback(() => sessionRef.current?.disconnect(), []);
  return { available, ready, snapshot, connect, refresh, disconnect };
}
