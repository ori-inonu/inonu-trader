"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { createRealPipelineClient, initialRealPipelineSnapshot, type PipelineWallet } from "../../lib/real-pipeline";
import { useOkxWallet } from "../../lib/useOkxWallet";
import { getBrowserWalletStore, walletChainIndex, type SharedWalletSnapshot } from "../../lib/wallet-store";
import { RealPipelineView } from "./RealPipelineView";
import { createObservationClock } from "../../lib/observation-clock";

function queryWallet(wallet: SharedWalletSnapshot): PipelineWallet | null {
  const chainIndex = walletChainIndex(wallet.snapshot);
  return wallet.snapshot.account && wallet.identityKey && chainIndex && wallet.snapshot.status === "connected" ? { address: wallet.snapshot.account, identityKey: wallet.identityKey, chainIndex, revision: wallet.revision } : null;
}

/** Browser-only observation UI. Connecting does not grant or persist query consent. */
export function RealPipeline({ apiBase }: { apiBase: string }) {
  const wallet = useOkxWallet();
  const walletStore = getBrowserWalletStore();
  const client = useMemo(() => createRealPipelineClient({ apiBase }), [apiBase]);
  const state = useSyncExternalStore(client.subscribe, client.getSnapshot, () => initialRealPipelineSnapshot);
  const [acknowledgedIdentity, setAcknowledgedIdentity] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(0);
  const identity = `${wallet.identityKey}:${wallet.revision}`;
  const acknowledged = acknowledgedIdentity === identity;

  useEffect(() => {
    const update = () => { void client.setWallet(queryWallet(walletStore.getSnapshot())); };
    update();
    return walletStore.subscribe(update);
  }, [client, walletStore]);
  useEffect(() => client.start(), [client]);
  useEffect(() => {
    const clock = createObservationClock();
    setNowMs(clock());
    const timer = setInterval(() => setNowMs(clock()), 1000);
    return () => clearInterval(timer);
  }, []);

  // A wallet event clears rendered samples in the same render, before effects run.
  const current = queryWallet(wallet);
  const consentMatches = state.consent && current && state.consent.identityKey === current.identityKey && state.consent.chainIndex === current.chainIndex && state.consent.revision === current.revision;
  const visibleState = state.consent && !consentMatches ? { ...state, consent: null, latest: null } : state;
  const grant = async () => {
    if (!acknowledged || !current) return;
    await client.grantConsent();
    if (client.getSnapshot().consent) await client.refresh();
  };

  return <RealPipelineView state={visibleState} wallet={wallet} nowMs={nowMs} acknowledged={acknowledged}
    onAcknowledged={(value) => setAcknowledgedIdentity(value ? identity : null)}
    onConsent={() => { void grant(); }}
    onRevoke={() => { setAcknowledgedIdentity(null); void client.revokeConsent(); }}
    onRefresh={() => { void client.refresh(); }}
    onRetry={() => { void client.sync(); }}
    onConnect={() => { void wallet.connect(); }} />;
}

export default RealPipeline;
