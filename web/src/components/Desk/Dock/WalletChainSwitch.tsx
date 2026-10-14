"use client";

import { useEffect, useRef, useState } from "react";
import { discoverOkxProvider, type Eip1193Provider, type OkxDiscoverySurface } from "@/lib/okx-wallet";
import { SWITCHABLE_CHAINS, switchChain, type SwitchableChain } from "@/lib/wallet/chains";
import { solanaSideOf, type SolanaSide } from "@/lib/wallet/solana-account";
import { useSolanaAccount } from "@/lib/useSolanaAccount";
import type { UseOkxWalletResult } from "@/lib/useOkxWallet";
import type { HoldingsScope } from "@/lib/wallet/holdings-session";
import styles from "./WalletChainSwitch.module.css";

/**
 * "Trocar rede" in the Carteira tab (T9.2, WAL-2): the networks the app lists, one click, and the wallet asks the person to confirm. A
 * network the wallet does not know is added with that same confirmation. Nothing here signs or sends: the three requests it can make
 * are the two that change the network and the read that confirms it (see lib/wallet/chains.ts).
 *
 * Solana (T9.1, WAL-1) is in the same list but is not a network to switch to: the extension keeps its account apart, so choosing it and clicking connects the Solana
 * account, with the same confirmation in the wallet, and the panel "Minha carteira" then reads it.
 */
const SOLANA_VALUE = "solana";

export interface WalletChainSwitchViewProps {
  readonly chains: readonly SwitchableChain[];
  readonly connected: boolean;
  readonly currentChainIdHex: string | null;
  readonly selected: string;
  readonly busy: boolean;
  readonly message: { readonly tone: "ok" | "erro"; readonly text: string } | null;
  readonly onSelect: (chainIdHex: string) => void;
  readonly onSwitch: () => void;
  /** The Solana side of the wallet; absent where the page has none. */
  readonly solana?: SolanaSide;
}

interface Choice {
  readonly value: string;
  readonly label: string;
  readonly disabled: boolean;
}

export function WalletChainSwitchView(p: WalletChainSwitchViewProps) {
  const current = p.currentChainIdHex === null ? null : p.currentChainIdHex.toLowerCase();
  const listed = current !== null && p.chains.some((c) => c.chainIdHex === current);
  const sol = p.solana;
  const solanaUsable = sol !== undefined && (sol.available || sol.account !== null);
  const choices: Choice[] = [
    ...(p.connected ? p.chains.map((c) => ({ value: c.chainIdHex, label: c.chainIdHex === current ? `${c.name} (atual)` : c.name, disabled: false })) : []),
    ...(sol === undefined
      ? []
      : [{ value: SOLANA_VALUE, label: sol.account !== null ? "Solana (conectada)" : sol.ready && !sol.available ? "Solana (nao encontrada)" : "Solana", disabled: !solanaUsable && sol.ready }]),
  ];
  const selected = choices.some((c) => c.value === p.selected && !c.disabled) ? p.selected : (choices.find((c) => !c.disabled)?.value ?? p.selected);
  const onSolana = sol !== undefined && selected === SOLANA_VALUE;
  const hasControls = p.connected || solanaUsable;
  return (
    <section className={styles.root} aria-label="Trocar rede da carteira">
      <h3 className={styles.title}>Trocar rede</h3>
      {!hasControls ? (
        <p className={styles.muted}>Conecte a carteira para trocar de rede</p>
      ) : (
        <>
          {!p.connected ? <p className={styles.muted}>Para trocar entre as redes EVM, conecte a carteira EVM.</p> : null}
          {p.connected && current !== null && !listed ? <p className={styles.muted}>{`Rede atual da carteira: ${current}, fora da lista do app`}</p> : null}
          <div className={styles.row}>
            <select className={styles.select} aria-label="Rede da carteira" value={selected} disabled={p.busy} onChange={(e) => p.onSelect(e.target.value)}>
              {choices.map((c) => (
                <option key={c.value} value={c.value} disabled={c.disabled}>
                  {c.label}
                </option>
              ))}
            </select>
            {onSolana ? (
              sol.account !== null ? (
                <button type="button" className={styles.button} disabled>
                  Solana conectada
                </button>
              ) : (
                <button type="button" className={styles.button} disabled={p.busy || sol.connecting || !sol.available} onClick={sol.onConnect}>
                  {sol.connecting ? "Aguardando a carteira" : "Conectar Solana"}
                </button>
              )
            ) : (
              <button type="button" className={styles.button} disabled={p.busy || selected === current} onClick={p.onSwitch}>
                {p.busy ? "Aguardando a carteira" : "Trocar rede"}
              </button>
            )}
          </div>
          {onSolana ? (
            <p className={styles.note}>
              A Solana tem conta propria na carteira: nao ha rede para trocar, so a conexao da conta Solana, que pede a sua confirmacao. Nenhuma transacao e enviada.
            </p>
          ) : null}
          {onSolana && sol.errorText !== null ? (
            <p className={styles.status} role="status" data-tone="erro">
              {sol.errorText}
            </p>
          ) : null}
          {onSolana && sol.notice !== null ? <p className={styles.status}>{sol.notice}</p> : null}
        </>
      )}
      {p.message !== null ? (
        <p className={styles.status} role="status" data-tone={p.message.tone}>
          {p.message.text}
        </p>
      ) : null}
      <p className={styles.note}>
        A troca pede a sua confirmacao na carteira. Se a carteira nao conhecer a rede, ela so e adicionada com a sua confirmacao. A leitura cobre as redes da lista e a conta Solana separadamente. Nenhuma transacao e enviada.
      </p>
    </section>
  );
}

export default function WalletChainSwitch({ wallet, scope, onScope }: { readonly wallet: UseOkxWalletResult; readonly scope?: HoldingsScope; readonly onScope?: (scope: HoldingsScope) => void }) {
  const [provider, setProvider] = useState<Eip1193Provider | null>(null);
  const [selected, setSelected] = useState<string>(SWITCHABLE_CHAINS[0]!.chainIdHex);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<WalletChainSwitchViewProps["message"]>(null);
  const alive = useRef(true);
  const solana = useSolanaAccount();

  useEffect(() => {
    alive.current = true;
    const stop = discoverOkxProvider(window as unknown as OkxDiscoverySurface, setProvider);
    return () => {
      alive.current = false;
      stop();
    };
  }, []);

  const { snapshot } = wallet;
  useEffect(() => {
    setSelected((value) => scope === "solana" ? SOLANA_VALUE : value === SOLANA_VALUE ? (snapshot.chainId ?? SWITCHABLE_CHAINS[0]!.chainIdHex) : value);
  }, [scope, snapshot.chainId]);
  const connected = provider !== null && snapshot.account !== null && snapshot.status !== "disconnected";

  const onSwitch = () => {
    if (provider === null || busy || selected === SOLANA_VALUE) return;
    const target = SWITCHABLE_CHAINS.find((c) => c.chainIdHex === selected);
    setBusy(true);
    setMessage(null);
    void switchChain(provider, selected).then((result) => {
      if (!alive.current) return;
      setBusy(false);
      if (result.ok) setMessage({ tone: "ok", text: result.added ? `Rede ${target?.name ?? selected} adicionada e selecionada` : `Rede trocada para ${target?.name ?? selected}` });
      else setMessage({ tone: "erro", text: result.error.text });
    });
  };

  return (
    <WalletChainSwitchView
      chains={SWITCHABLE_CHAINS}
      connected={connected}
      currentChainIdHex={snapshot.chainId}
      selected={selected}
      busy={busy}
      message={message}
      onSelect={(value) => {
        setSelected(value);
        onScope?.(value === SOLANA_VALUE ? "solana" : "todas");
        setMessage(null);
      }}
      onSwitch={onSwitch}
      solana={solanaSideOf(solana)}
    />
  );
}
