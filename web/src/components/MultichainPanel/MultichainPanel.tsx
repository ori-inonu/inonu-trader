"use client";

import { useCallback, useEffect, useState } from "react";
import { useOkxWallet } from "@/lib/useOkxWallet";
import { useOkxSolana } from "@/lib/useOkxSolana";
import { defaultEvmRpcFetch, publicEvmRpcOverrides, readMultichainBalances, type ChainBalanceResult, type MultichainSnapshot } from "@/lib/evm-multichain";
import { formatWalletObservationTime, getWalletBalanceFreshness, startWalletFreshnessTicker } from "@/lib/wallet-freshness";
import styles from "./MultichainPanel.module.css";

function shortAddress(address: string): string {
  return address.length > 12 ? `${address.slice(0, 6)}…${address.slice(-4)}` : address;
}

function ChainObservation({ chain, now }: { chain: ChainBalanceResult; now: number }) {
  const freshness = getWalletBalanceFreshness(chain.observedAtMs, now);
  const time = formatWalletObservationTime(chain.observedAtMs);
  const status = freshness.status === "fresh" ? "Leitura recente" : freshness.status === "stale" ? "Leitura desatualizada" : "Horário desconhecido";
  return (
    <li className={styles.chainRow}>
      <div className={styles.chainHead}>
        <span className={styles.chainName}>{chain.name}</span>
        <span className={chain.status === "ok" ? styles.chainMeta : `${styles.chainMeta} ${styles.chainMetaDown}`}>
          {chain.status === "ok" ? `bloco ${chain.block ?? "desconhecido"}` : `indisponível: ${chain.error ?? "sem resposta"}`}
        </span>
      </div>
      <p className={styles.note}>
        {status}. {time ? <time dateTime={time}>{time}</time> : "Sem horário de leitura."}
        {freshness.ageMs !== null ? ` Idade: ${Math.floor(freshness.ageMs / 1000)} s.` : " Idade desconhecida."}
      </p>
      {chain.status === "ok" && chain.native ? (
        <dl className={styles.balances}>
          <div className={styles.balanceRow}><dt>{chain.native.symbol}</dt><dd>{chain.native.amount}</dd></div>
          {chain.tokens.map((token) => (
            <div key={token.contract} className={styles.balanceRow}><dt>{token.symbol}</dt><dd>{token.amount}</dd></div>
          ))}
        </dl>
      ) : null}
      <details className={styles.note}>
        <summary>Detalhes da leitura</summary>
        <dl className={styles.balances}>
          <div className={styles.balanceRow}><dt>Conta</dt><dd>{chain.account}</dd></div>
          <div className={styles.balanceRow}><dt>Rede</dt><dd>{chain.name} ({chain.chainIndex}, {chain.chainIdHex})</dd></div>
          <div className={styles.balanceRow}><dt>Fonte</dt><dd>Informada pela RPC pública: {chain.rpcHost ?? "hostname desconhecido"}. A fonte não garante finalização do bloco.</dd></div>
          <div className={styles.balanceRow}><dt>Bloco decimal / RPC</dt><dd>{chain.block ?? "desconhecido"} / {chain.rawBlock ?? "desconhecido"}</dd></div>
          {chain.status === "ok" && chain.native ? (
            <div className={styles.balanceRow}><dt>{chain.native.symbol} nativo</dt><dd>rawRpc: {chain.native.rawRpc}; rawUnits: {chain.native.rawUnits}; Escala configurada: {chain.native.decimals}.</dd></div>
          ) : null}
          {chain.status === "ok" ? chain.tokens.map((token) => (
            <div key={token.contract} className={styles.balanceRow}><dt>{token.symbol}</dt><dd>Contrato: {token.contract}; rawRpc: {token.rawRpc}; rawUnits: {token.rawUnits}; Escala configurada: {token.decimals}; decimals() não consultado.</dd></div>
          )) : null}
        </dl>
      </details>
    </li>
  );
}

export interface MultichainPanelViewProps {
  evmAccount: string | null;
  evmAvailable: boolean;
  multichain: MultichainSnapshot | null;
  multichainBusy: boolean;
  multichainError: string | null;
  readMultichain(): void;
  solana: ReturnType<typeof useOkxSolana>;
  now?: number;
}

export function MultichainPanelView({ evmAccount, evmAvailable, multichain, multichainBusy, multichainError, readMultichain, solana, now = Number.NaN }: MultichainPanelViewProps) {
  const observedChains = multichain?.account === evmAccount ? multichain.chains.filter((chain) => chain.account === evmAccount) : null;
  return (
    <section className={styles.panel} aria-labelledby="multichain-title">
      <header className={styles.header}>
        <div className={styles.headingGroup}>
          <p className={styles.eyebrow}>REDES</p>
          <h2 className={styles.title} id="multichain-title">Saldos multichain</h2>
          <p className={styles.description} title="Somente leitura. Conectar não habilita o executor.">Somente leitura. Conectar não habilita o executor.</p>
        </div>
        <span className={styles.badge}>OKX OnChain OS</span>
      </header>

      <div className={styles.content}>
        <p className={styles.note}>Cobertura parcial: somente redes e ativos configurados. Outros ativos podem existir na carteira. As quantidades abaixo não representam total em USD nem capital disponível para operar.</p>
        <h3 className={styles.subtitle}>Redes EVM da conta conectada</h3>
        {!evmAccount ? (
          <p className={styles.note}>Conecte a carteira OKX no painel acima para consultar a mesma conta em Monad, X Layer, Ethereum, BNB Chain, Base, Arbitrum, Polygon e Optimism.</p>
        ) : (
          <>
            <p className={styles.note}>Conta {shortAddress(evmAccount)}. Ao consultar, o endereço desta conta e o seu IP são enviados às RPCs das oito redes configuradas. Uma falha aparece como indisponível, nunca como zero.</p>
            <button className={styles.primaryButton} type="button" onClick={readMultichain} disabled={multichainBusy || !evmAvailable}>
              {multichainBusy ? "Consultando redes" : "Consultar redes configuradas"}
            </button>
            {multichainError ? <p className={styles.error} role="alert">{multichainError}</p> : null}
            {observedChains ? (
              observedChains.length === 0 ? (
                <p className={styles.note}>A consulta não retornou nenhuma rede.</p>
              ) : (
              <ul className={styles.chainList} aria-label="Saldos por rede EVM">
                  {observedChains.map((chain) => <ChainObservation key={chain.chainIndex} chain={chain} now={now} />)}
                </ul>
              )
            ) : null}
          </>
        )}

        <h3 className={`${styles.subtitle} ${styles.subtitleDivided}`}>Solana pela OKX Wallet</h3>
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

        <p className={styles.footer}>Quantidades exibidas são leituras; lucro só conta quando realizado e reconciliado no journal.</p>
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
  const [now, setNow] = useState(Number.NaN);
  const account = wallet.snapshot.account;
  useEffect(() => startWalletFreshnessTicker(setNow), []);

  const readMultichain = useCallback(() => {
    if (!account || busy) return;
    setBusy(true);
    setError(null);
    readMultichainBalances(account, defaultEvmRpcFetch(), { overrides: publicEvmRpcOverrides() })
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
      now={now}
    />
  );
}
