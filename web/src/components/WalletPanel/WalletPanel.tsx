"use client";

import { useEffect, useState } from "react";
import { useOkxWallet } from "@/lib/useOkxWallet";
import type { WalletSnapshot } from "@/lib/okx-wallet";
import {
  formatWalletObservationTime,
  getWalletBalanceFreshness,
  startWalletFreshnessTicker,
} from "@/lib/wallet-freshness";
import styles from "./WalletPanel.module.css";

export interface WalletPanelViewProps {
  available: boolean;
  ready: boolean;
  snapshot: WalletSnapshot;
  now?: number;
  connect(): Promise<void>;
  refresh(): Promise<void>;
  switchToMonad(): Promise<void>;
  switchToXLayer(): Promise<void>;
  disconnect(): void;
}

function statusLabel(snapshot: WalletSnapshot): string {
  switch (snapshot.status) {
    case "connecting":
      return "Aguardando autorização no OKX";
    case "connected":
      if (snapshot.chainId === "0x8f") return "Conectado à Monad";
      if (snapshot.chainId === "0xc4") return "Conectado à X Layer";
      return "Carteira conectada";
    case "wrong-network":
      return "Troque para uma rede suportada";
    case "reading":
      return "Consultando a carteira";
    case "error":
      return "Não foi possível concluir a consulta";
    default:
      return "Desconectado";
  }
}

function networkLabel(chainId: string | null): string {
  if (chainId === "0x8f") return "Monad (143)";
  if (chainId === "0xc4") return "X Layer (196)";
  if (!chainId) return "Não confirmada";
  return "Não suportada (" + chainId + ")";
}

function shortAddress(address: string): string {
  return address.slice(0, 6) + "…" + address.slice(-4);
}

function formatAge(ageMs: number): string {
  const seconds = Math.floor(ageMs / 1_000);
  if (seconds < 60) return `${seconds} s`;
  return `${Math.floor(seconds / 60)} min ${seconds % 60} s`;
}

function freshnessLabel(snapshot: WalletSnapshot, now?: number): string {
  const freshness = getWalletBalanceFreshness(snapshot.observedAtMs, now);
  const freshnessText = freshness.status === "unknown"
    ? "Atualidade dos saldos desconhecida."
    : freshness.status === "stale"
      ? `Saldos desatualizados: observados há ${formatAge(freshness.ageMs!)}.`
      : `Saldos recentes: observados há ${formatAge(freshness.ageMs!)}.`;
  const observedAt = formatWalletObservationTime(snapshot.observedAtMs);
  const observationText = observedAt
    ? `Última observação: ${observedAt}.`
    : "Horário da última observação indisponível.";
  return `${freshnessText} ${observationText}`;
}

export function WalletPanelView({
  available,
  ready,
  snapshot,
  now,
  connect,
  refresh,
  switchToMonad,
  switchToXLayer,
  disconnect,
}: WalletPanelViewProps) {
  const busy = snapshot.status === "connecting" || snapshot.status === "reading";
  const showMonadSwitch = Boolean(snapshot.account) && snapshot.chainId !== "0x8f";
  const showXLayerSwitch = Boolean(snapshot.account) && snapshot.chainId !== "0xc4";

  return (
    <section className={styles.panel} aria-labelledby="wallet-title">
      <header className={styles.header}>
        <div>
          <h2 className={styles.title} id="wallet-title">
            Carteira OKX
          </h2>
          <p className={styles.description}>
            Somente leitura. Conectar não habilita o executor.
          </p>
        </div>
        <span className={styles.badge}>Web3</span>
      </header>

      <div className={styles.content}>
        <div className={styles.statusRow} aria-live="polite" aria-atomic="true">
          <span
            className={
              styles.statusDot +
              (snapshot.status === "connected" ? " " + styles.statusDotConnected : "")
            }
            aria-hidden="true"
          />
          <span>{statusLabel(snapshot)}</span>
        </div>

        {!ready ? (
          <p className={styles.note}>Verificando a extensão OKX neste navegador…</p>
        ) : !available && !snapshot.account ? (
          <p className={styles.note}>
            Extensão OKX não detectada. Abra este painel em um navegador com a extensão instalada.
          </p>
        ) : null}

        {snapshot.account ? (
          <dl className={styles.details}>
            <div className={styles.detailRow}>
              <dt>Conta</dt>
              <dd title={snapshot.account}>{shortAddress(snapshot.account)}</dd>
            </div>
            <div className={styles.detailRow}>
              <dt>Rede</dt>
              <dd>{networkLabel(snapshot.chainId)}</dd>
            </div>
          </dl>
        ) : null}

        {snapshot.chainId === "0x8f" ? (
          <p className={styles.note}>
            Para consultar USDT e as variantes de USDC deste painel, troque explicitamente para X Layer.
          </p>
        ) : null}

        <p className={styles.note}>
          Cobertura limitada: MON e USDC nativo na Monad; OKB, USDT, USDT0, USDC nativo,
          USDC_Bridged e USDC.e na X Layer.
        </p>

        {snapshot.balances?.network === "monad" ? (
          <dl className={styles.balances} aria-label="Saldos da carteira na Monad">
            <div className={styles.balanceRow}>
              <dt>MON</dt>
              <dd>{snapshot.balances.mon}</dd>
            </div>
            <div className={styles.balanceRow}>
              <dt>USDC nativo</dt>
              <dd>{snapshot.balances.usdc}</dd>
            </div>
            <div className={styles.blockRow}>
              <dt>Bloco consultado</dt>
              <dd>{snapshot.balances.block}</dd>
            </div>
          </dl>
        ) : snapshot.balances?.network === "xlayer" ? (
          <>
            <dl className={styles.balances} aria-label="Saldos da carteira na X Layer">
              <div className={styles.balanceRow}>
                <dt>OKB</dt>
                <dd>{snapshot.balances.okb}</dd>
              </div>
              <div className={styles.balanceRow}>
                <dt>USDT</dt>
                <dd>{snapshot.balances.usdt}</dd>
              </div>
              <div className={styles.balanceRow}>
                <dt>USDT0</dt>
                <dd>{snapshot.balances.usdt0}</dd>
              </div>
              <div className={styles.balanceRow}>
                <dt>USDC nativo</dt>
                <dd>{snapshot.balances.nativeUsdc}</dd>
              </div>
              <div className={styles.balanceRow}>
                <dt>USDC_Bridged</dt>
                <dd>{snapshot.balances.usdcBridged}</dd>
              </div>
              <div className={styles.balanceRow}>
                <dt>USDC.e</dt>
                <dd>{snapshot.balances.usdcE}</dd>
              </div>
              <div className={styles.blockRow}>
                <dt>Bloco consultado</dt>
                <dd>{snapshot.balances.block}</dd>
              </div>
            </dl>
            <p className={styles.note}>
              OKB é o ativo nativo usado para taxas na X Layer; USDT não paga gas.
            </p>
          </>
        ) : snapshot.status === "reading" ? (
          <p className={styles.note}>Saldos indisponíveis enquanto a consulta termina.</p>
        ) : snapshot.account && snapshot.status === "connected" ? (
          <p className={styles.note}>Saldos ainda não consultados. Atualize para ler.</p>
        ) : snapshot.account && snapshot.status === "wrong-network" ? (
          <p className={styles.note}>Saldos indisponíveis nesta rede.</p>
        ) : snapshot.account && snapshot.status === "error" ? (
          <p className={styles.note}>Saldos indisponíveis. Tente atualizar.</p>
        ) : null}

        {snapshot.balances ? (
          <p className={styles.note} aria-label="Atualidade dos saldos">
            {freshnessLabel(snapshot, now)}{" "}
            A idade mostra quando a leitura terminou. Ela não confirma finalização da rede nem a veracidade do provedor.
          </p>
        ) : null}

        {snapshot.error ? (
          <p className={styles.error} role="alert">
            {snapshot.error}
          </p>
        ) : null}

        <div className={styles.actions}>
          {snapshot.account ? (
            <>
              {showMonadSwitch ? (
                <button
                  className={styles.primaryButton}
                  type="button"
                  onClick={() => void switchToMonad()}
                  disabled={busy || !available}
                >
                  Trocar para Monad
                </button>
              ) : null}
              {showXLayerSwitch ? (
                <button
                  className={showMonadSwitch ? styles.secondaryButton : styles.primaryButton}
                  type="button"
                  onClick={() => void switchToXLayer()}
                  disabled={busy || !available}
                >
                  Trocar para X Layer
                </button>
              ) : null}
              <button
                className={styles.secondaryButton}
                type="button"
                onClick={() => void refresh()}
                disabled={busy || !available}
              >
                Atualizar saldo
              </button>
              <button
                className={styles.textButton}
                type="button"
                onClick={disconnect}
                disabled={busy}
              >
                Desconectar deste painel
              </button>
            </>
          ) : (
            <button
              className={styles.primaryButton}
              type="button"
              onClick={() => void connect()}
              disabled={!ready || !available || busy}
            >
              Conectar OKX
            </button>
          )}
        </div>
        <p className={styles.footer}>
          Este painel apenas consulta saldos. Nenhuma ordem ou transação é enviada.
        </p>
      </div>
    </section>
  );
}

export default function WalletPanel() {
  const wallet = useOkxWallet();
  const [now, setNow] = useState<number | undefined>(undefined);

  useEffect(() => {
    if (!wallet.snapshot.balances) {
      setNow(undefined);
      return;
    }
    return startWalletFreshnessTicker(setNow);
  }, [wallet.snapshot.balances]);

  return <WalletPanelView {...wallet} now={now} />;
}