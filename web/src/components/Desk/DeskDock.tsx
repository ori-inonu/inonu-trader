"use client";

import type { UseOkxWalletResult } from "@/lib/useOkxWallet";
import type { WalletSnapshot } from "@/lib/okx-wallet";
import type { CapabilityRow, JournalRow } from "@/lib/mesa/mesa-model";
import styles from "./DeskDock.module.css";

export interface DeskDockProps {
  wallet: UseOkxWalletResult;
  capabilities: readonly CapabilityRow[];
  journal: readonly JournalRow[];
}

const STATE_LABEL: Record<CapabilityRow["state"], string> = { live: "Ao vivo", late: "Atrasado", held: "Retido", blocked: "Bloqueado" };
const ACTION_TONE: Record<string, string> = { buy: "toneBuy", sell: "toneSell", hold: "toneHold", late: "toneLate", neutral: "toneNeutral" };

export function walletStatusLabel(snapshot: WalletSnapshot, available: boolean): string {
  if (!available) return "Extensao OKX Wallet nao encontrada";
  switch (snapshot.status) {
    case "connecting": return "Aguardando autorizacao na OKX Wallet";
    case "connected":
      if (snapshot.chainId === "0x8f") return "Conectada na Monad";
      if (snapshot.chainId === "0xc4") return "Conectada na X Layer";
      return "Carteira conectada";
    case "wrong-network": return "Troque para Monad ou X Layer";
    case "reading": return "Consultando a carteira";
    case "error": return "Nao foi possivel concluir a consulta";
    default: return "Desconectada";
  }
}

function shortAddress(address: string): string {
  return address.length > 12 ? `${address.slice(0, 6)}...${address.slice(-4)}` : address;
}

function balanceRows(snapshot: WalletSnapshot): { label: string; value: string }[] {
  const b = snapshot.balances;
  if (!b) return [];
  if (b.network === "monad") return [{ label: "MON", value: b.mon }, { label: "USDC", value: b.usdc }, { label: "Bloco", value: b.block }];
  return [{ label: "OKB", value: b.okb }, { label: "USDT", value: b.usdt }, { label: "USDC", value: b.nativeUsdc }, { label: "Bloco", value: b.block }];
}

function WalletModule({ wallet }: { wallet: UseOkxWalletResult }) {
  const { snapshot, available } = wallet;
  const rows = balanceRows(snapshot);
  const busy = snapshot.status === "connecting" || snapshot.status === "reading";
  const connected = snapshot.account !== null && snapshot.status !== "disconnected";
  return (
    <section className={styles.module} aria-label="Carteira OKX">
      <header className={styles.moduleHead}>
        <h3>Carteira OKX</h3>
        <span className={styles.badge} data-on={connected ? "true" : "false"}>{connected ? "Conectada" : "Desconectada"}</span>
      </header>
      <p className={styles.line}>{walletStatusLabel(snapshot, available)}</p>
      {snapshot.account ? <p className={styles.mono}>{shortAddress(snapshot.account)}</p> : null}
      {rows.length > 0 ? (
        <dl className={styles.balances} aria-label="Saldos observados">
          {rows.map((row) => (
            <div key={row.label} className={styles.balance}>
              <dt>{row.label}</dt>
              <dd>{row.value}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className={styles.muted}>{snapshot.error ?? "Sem saldos observados. Conecte para ler a carteira."}</p>
      )}
      <div className={styles.actions}>
        {!connected ? (
          <button type="button" className={styles.primary} disabled={!available || busy} onClick={() => void wallet.connect()}>
            {busy ? "Aguardando" : "Conectar"}
          </button>
        ) : (
          <>
            <button type="button" className={styles.secondary} disabled={busy} onClick={() => void wallet.refresh()}>Atualizar</button>
            <button type="button" className={styles.secondary} disabled={busy} onClick={() => void wallet.switchToXLayer()}>X Layer</button>
            <button type="button" className={styles.secondary} disabled={busy} onClick={() => void wallet.switchToMonad()}>Monad</button>
            <button type="button" className={styles.ghost} onClick={() => wallet.disconnect()}>Desconectar</button>
          </>
        )}
      </div>
      <p className={styles.note}>Leitura local no navegador. Conta e saldos nao vao ao backend nem ao Jev.</p>
    </section>
  );
}

function CapabilityModule({ rows }: { rows: readonly CapabilityRow[] }) {
  return (
    <section className={styles.module} aria-label="Ecossistema OKX e OnchainOS">
      <header className={styles.moduleHead}>
        <h3>Ecossistema OKX e OnchainOS</h3>
      </header>
      <ul className={styles.matrix}>
        {rows.map((row) => (
          <li key={row.id} className={styles.cap} data-state={row.state} title={row.next ?? row.detail}>
            <span className={styles.capState}>{STATE_LABEL[row.state]}</span>
            <span className={styles.capLabel}>{row.label}</span>
            <span className={styles.capDetail}>{row.state === "live" ? row.detail : (row.next ?? row.detail)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function JournalModule({ rows }: { rows: readonly JournalRow[] }) {
  return (
    <section className={styles.module} aria-label="Diario de decisoes do Jev">
      <header className={styles.moduleHead}>
        <h3>Diario do Jev</h3>
        <span className={styles.badge} data-on="false">Consultivo</span>
      </header>
      {rows.length === 0 ? (
        <p className={styles.muted}>Nenhuma leitura do Jev ainda.</p>
      ) : (
        <ol className={styles.journal}>
          {rows.map((row) => (
            <li key={row.id} className={styles.entry}>
              <span className={styles.time}>{row.time}</span>
              <span className={styles.inst}>{row.inst}</span>
              <span className={`${styles.action} ${styles[ACTION_TONE[row.tone] ?? "toneNeutral"]}`}>{row.action}</span>
              <span className={styles.weightText}>{row.weight}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

export default function DeskDock({ wallet, capabilities, journal }: DeskDockProps) {
  return (
    <div className={styles.dock}>
      <WalletModule wallet={wallet} />
      <CapabilityModule rows={capabilities} />
      <JournalModule rows={journal} />
    </div>
  );
}
