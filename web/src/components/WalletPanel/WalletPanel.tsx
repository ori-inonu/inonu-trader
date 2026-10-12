"use client";

import { useEffect, useState } from "react";
import { useOkxWallet } from "@/lib/useOkxWallet";
import {
  MONAD_USDC_CONTRACT,
  XLAYER_TOKEN_CONTRACTS,
  type WalletReadObservation,
  type WalletSnapshot,
} from "@/lib/okx-wallet";
import {
  formatWalletObservationTime,
  getWalletBalanceFreshness,
  isValidWalletTimestamp,
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
  return address.length > 12 ? `${address.slice(0, 6)}…${address.slice(-4)}` : address;
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

function matchingObservation(snapshot: WalletSnapshot): WalletReadObservation | null {
  const observation = snapshot.observation;
  const balances = snapshot.balances;
  if (snapshot.status !== "connected" || snapshot.error || !snapshot.account || !observation || !balances ||
    observation.schemaVersion !== 1 || observation.source !== "okx-provider-reported" ||
    !/^0x[0-9a-fA-F]{40}(?![\s\S])/.test(snapshot.account) ||
    !/^0x(?:0|[1-9a-fA-F][0-9a-fA-F]{0,15})(?![\s\S])/.test(observation.block) ||
    observation.account !== snapshot.account || observation.chainId !== snapshot.chainId ||
    observation.network !== balances.network || observation.block !== balances.block ||
    observation.observedAtMs !== snapshot.observedAtMs || !isValidWalletTimestamp(observation.observedAtMs) ||
    snapshot.chainId !== (balances.network === "monad" ? "0x8f" : "0xc4")) return null;
  const expected = balances.network === "monad" ? [
    ["mon", "MON", null, 18, balances.mon],
    ["usdc", "USDC nativo", MONAD_USDC_CONTRACT, 6, balances.usdc],
  ] as const : [
    ["okb", "OKB", null, 18, balances.okb],
    ["usdt", "USDT", XLAYER_TOKEN_CONTRACTS[0].address, 6, balances.usdt],
    ["usdt0", "USDT0", XLAYER_TOKEN_CONTRACTS[1].address, 6, balances.usdt0],
    ["nativeUsdc", "USDC nativo", XLAYER_TOKEN_CONTRACTS[2].address, 6, balances.nativeUsdc],
    ["usdcBridged", "USDC_Bridged", XLAYER_TOKEN_CONTRACTS[3].address, 6, balances.usdcBridged],
    ["usdcE", "USDC.e", XLAYER_TOKEN_CONTRACTS[4].address, 6, balances.usdcE],
  ] as const;
  if (!Array.isArray(observation.assets) || observation.assets.length !== expected.length) return null;
  for (let index = 0; index < expected.length; index++) {
    const [id, symbol, contract, decimals, balance] = expected[index];
    const asset = observation.assets[index];
    if (!asset || asset.id !== id || asset.symbol !== symbol || asset.contract !== contract ||
      asset.native !== (contract === null) || asset.decimals !== decimals || asset.decimalsSource !== "configured" ||
      asset.formattedBalance !== balance || typeof asset.rawRpc !== "string" ||
      typeof asset.rawUnits !== "string" || asset.rawUnits.length > 78 ||
      !/^(?:0|[1-9][0-9]*)(?![\s\S])/.test(asset.rawUnits)) return null;
    const rawPattern = asset.native
      ? /^0x(?:0|[1-9a-fA-F][0-9a-fA-F]{0,63})(?![\s\S])/
      : /^0x[0-9a-fA-F]{64}(?![\s\S])/;
    if (!rawPattern.test(asset.rawRpc) || BigInt(asset.rawRpc).toString(10) !== asset.rawUnits) return null;
    const padded = asset.rawUnits.padStart(decimals + 1, "0");
    const whole = padded.slice(0, -decimals);
    const fraction = padded.slice(-decimals).replace(/0+$/, "");
    if ((fraction ? `${whole}.${fraction}` : whole) !== asset.formattedBalance) return null;
  }
  return observation;
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
  const observation = matchingObservation(snapshot);

  return (
    <section className={styles.panel} aria-labelledby="wallet-title">
      <header className={styles.header}>
        <div className={styles.headingGroup}>
          <p className={styles.eyebrow}>CARTEIRA</p>
          <h2 className={styles.title} id="wallet-title">
            Carteira OKX
          </h2>
          <p className={styles.description} title="Somente leitura. Conectar não habilita o executor.">
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
          <>
            <h3 className={styles.subtitle}>Conta e rede</h3>
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
          </>
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
          <>
            <h3 className={styles.subtitle}>Saldos na Monad</h3>
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
          </>
        ) : snapshot.balances?.network === "xlayer" ? (
          <>
            <h3 className={styles.subtitle}>Saldos na X Layer</h3>
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

        {observation ? (
          <details>
            <summary>Detalhes da leitura</summary>
            <p className={styles.note}>
              Informado pelo provedor OKX. Escala configurada no painel, sem consultar
              os decimais na rede. Estes dados não confirmam autenticidade nem finalização.
            </p>
            <dl className={styles.details}>
              <div className={styles.detailRow}>
                <dt>Conta completa</dt><dd>{observation.account}</dd>
              </div>
              <div className={styles.detailRow}>
                <dt>Rede</dt><dd>{networkLabel(observation.chainId)}</dd>
              </div>
              <div className={styles.detailRow}>
                <dt>Bloco consultado</dt><dd>{observation.block}</dd>
              </div>
              <div className={styles.detailRow}>
                <dt>Horário da leitura</dt><dd>{formatWalletObservationTime(observation.observedAtMs)}</dd>
              </div>
            </dl>
            {observation.assets.map((asset) => (
              <div key={asset.id}>
                <h4 className={styles.subtitle}>{asset.symbol}</h4>
                <dl className={styles.details}>
                  <div className={styles.detailRow}>
                    <dt>Contrato</dt><dd>{asset.native ? "Ativo nativo" : asset.contract}</dd>
                  </div>
                  <div className={styles.detailRow}>
                    <dt>Resposta RPC</dt><dd>{asset.rawRpc}</dd>
                  </div>
                  <div className={styles.detailRow}>
                    <dt>Unidades inteiras</dt><dd>{asset.rawUnits}</dd>
                  </div>
                  <div className={styles.detailRow}>
                    <dt>Decimais configurados</dt><dd>{asset.decimals}</dd>
                  </div>
                  <div className={styles.detailRow}>
                    <dt>Saldo convertido</dt><dd>{asset.formattedBalance}</dd>
                  </div>
                </dl>
              </div>
            ))}
          </details>
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
