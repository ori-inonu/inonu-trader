"use client";

import { useCallback, useState } from "react";
import { useOkxWallet } from "@/lib/useOkxWallet";
import { useOkxSolana } from "@/lib/useOkxSolana";
import { defaultEvmRpcFetch, readMultichainBalances, type MultichainSnapshot } from "@/lib/evm-multichain";
import styles from "./MultichainPanel.module.css";

function shortAddress(address: string): string {
  return address.length > 12 ? address.slice(0, 6) + "..." + address.slice(-4) : address;
}




export interface MultichainPanelViewProps {
  evmAccount: string | null;
  evmAvailable: boolean;
  multichain: MultichainSnapshot | null;
  multichainBusy: boolean;
  multichainError: string | null;
  readMultichain(): void;
  solana: ReturnType<typeof useOkxSolana>;
}

export function MultichainPanelView({ evmAccount, evmAvailable, multichain, multichainBusy, multichainError, readMultichain, solana }: MultichainPanelViewProps) {
  return (
    <section className={styles.panel} aria-labelledby="multichain-title">
      <header className={styles.header}>
        <div>
          <h2 className={styles.title} id="multichain-title">Patrimônio multichain</h2>
          <p className={styles.description}>Somente leitura. Conectar não habilita o executor.</p>
        </div>
        <span className={styles.badge}>OKX OnChain OS</span>
      </header>

      <div className={styles.content}>
        <h3 className={styles.subtitle}>Redes EVM da conta conectada</h3>
        {!evmAccount ? (
          <p className={styles.note}>Conecte a carteira OKX no painel acima para consultar a mesma conta em Monad, X Layer, Ethereum, BNB Chain, Base, Arbitrum, Polygon e Optimism.</p>
        ) : (
          <>
            <p className={styles.note}>Conta {shortAddress(evmAccount)}. Cada rede responde pela sua própria RPC pública; uma falha aparece como indisponível, nunca como zero.</p>
            <button className={styles.primaryButton} type="button" onClick={readMultichain} disabled={multichainBusy || !evmAvailable}>
              {multichainBusy ? "Consultando redes" : "Consultar todas as redes"}
            </button>
            {multichainError ? <p className={styles.error} role="alert">{multichainError}</p> : null}
            {multichain ? (
              <ul className={styles.chainList} aria-label="Saldos por rede EVM">
                {multichain.chains.map((chain) => (
                  <li key={chain.chainIndex} className={styles.chainRow}>
                    <div className={styles.chainHead}>
                      <span className={styles.chainName}>{chain.name}</span>
                      <span className={styles.chainMeta}>{chain.status === "ok" ? `bloco ${chain.block}` : `indisponível: ${chain.error}`}</span>
                    </div>
                    {chain.status === "ok" ? (
                      <dl className={styles.balances}>
                        <div className={styles.balanceRow}><dt>{chain.native!.symbol}</dt><dd>{chain.native!.amount}</dd></div>
                        {chain.tokens.map((token) => (
                          <div key={token.contract} className={styles.balanceRow}><dt>{token.symbol}</dt><dd>{token.amount}</dd></div>
                        ))}
                      </dl>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : null}
          </>
        )}

        <h3 className={styles.subtitle}>Solana pela OKX Wallet</h3>
        {!solana.ready ? (
          <p className={styles.note}>Verificando o provider Solana da extensão.</p>
        ) : !solana.available ? (
          <p className={styles.note}>Provider Solana não detectado. A extensão OKX expõe okxwallet.solana quando a rede Solana está habilitada.</p>
        ) : (
          <>
            {solana.snapshot.account ? (
              <p className={styles.note}>Conta Solana {shortAddress(solana.snapshot.account)}.</p>
            ) : (
              <p className={styles.note}>A conta Solana é separada da conta EVM. Conectar apenas lê saldos; nada é assinado.</p>
            )}
            {solana.snapshot.balances ? (
              <dl className={styles.balances} aria-label="Saldos na Solana">
                <div className={styles.balanceRow}><dt>SOL</dt><dd>{solana.snapshot.balances.sol}</dd></div>
                {solana.snapshot.balances.tokens.map((token) => (
                  <div key={token.mint} className={styles.balanceRow}><dt>{token.symbol}</dt><dd>{token.amount}</dd></div>
                ))}
                <div className={styles.balanceRow}><dt>Slot</dt><dd>{solana.snapshot.balances.slot}</dd></div>
              </dl>
            ) : null}
            {solana.snapshot.error ? <p className={styles.error} role="alert">{solana.snapshot.error}</p> : null}
            <div className={styles.actions}>
              {solana.snapshot.account ? (
                <>
                  <button className={styles.secondaryButton} type="button" onClick={() => void solana.refresh()} disabled={solana.snapshot.status === "reading"}>Atualizar Solana</button>
                  <button className={styles.textButton} type="button" onClick={solana.disconnect}>Desconectar Solana</button>
                </>
              ) : (
                <button className={styles.primaryButton} type="button" onClick={() => void solana.connect()} disabled={solana.snapshot.status === "connecting"}>Conectar Solana (OKX)</button>
              )}
            </div>
          </>
        )}

        <p className={styles.footer}>Patrimônio exibido é leitura; lucro só conta quando realizado e reconciliado no journal.</p>
      </div>
    </section>
  );
}

export default function MultichainPanel() {
  const wallet = useOkxWallet();
  const solana = useOkxSolana();
  const [multichain, setMultichain] = useState<MultichainSnapshot | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const account = wallet.snapshot.account;

  const readMultichain = useCallback(() => {
    if (!account || busy) return;
    setBusy(true);
    setError(null);
    readMultichainBalances(account, defaultEvmRpcFetch(), { overrides: process.env as Record<string, string | undefined> })
      .then((snapshot) => setMultichain(snapshot))
      .catch(() => setError("Não foi possível consultar as redes."))
      .finally(() => setBusy(false));
  }, [account, busy]);

  return (
    <MultichainPanelView
      evmAccount={account}
      evmAvailable={wallet.available}
      multichain={multichain && multichain.account === account ? multichain : null}
      multichainBusy={busy}
      multichainError={error}
      readMultichain={readMultichain}
      solana={solana}
    />
  );
}
