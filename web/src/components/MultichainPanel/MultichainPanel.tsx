"use client";

import { useCallback, useState } from "react";
import { useOkxWallet } from "@/lib/useOkxWallet";
import { useOkxSolana } from "@/lib/useOkxSolana";
import { defaultEvmRpcFetch, readMultichainBalances, type MultichainSnapshot } from "@/lib/evm-multichain";
import { useOperatorFeed, type OperatorCycleView } from "@/lib/operator-feed";
import styles from "./MultichainPanel.module.css";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:3000";

function shortAddress(address: string): string {
  return address.length > 12 ? address.slice(0, 6) + "..." + address.slice(-4) : address;
}

function usd(value: number | null): string {
  return value === null ? "desconhecido" : `${value.toFixed(2)} USD`;
}

function kindLabel(kind: string): string {
  switch (kind) {
    case "dex_round_trip": return "ida e volta DEX";
    case "cross_chain_rebalance": return "bridge entre redes";
    case "kuru_spot_maker": return "maker Kuru MON/USDC";
    case "defi_yield": return "rendimento DeFi";
    case "perp_funding_carry": return "funding carry (OKX Exchange, pesquisa)";
    case "memepump_research": return "pesquisa Meme Pump";
    default: return kind;
  }
}

function executionLabel(status: string): string {
  switch (status) {
    case "sent": return "transação enviada";
    case "dry_run": return "simulado (dry run)";
    case "prepared": return "transação preparada, não enviada";
    case "failed": return "falhou";
    default: return "bloqueado";
  }
}

export interface MultichainPanelViewProps {
  evmAccount: string | null;
  evmAvailable: boolean;
  multichain: MultichainSnapshot | null;
  multichainBusy: boolean;
  multichainError: string | null;
  readMultichain(): void;
  solana: ReturnType<typeof useOkxSolana>;
  operator: { status: string; cycle: OperatorCycleView | null; error: string | null; reload(): void };
}

export function MultichainPanelView({ evmAccount, evmAvailable, multichain, multichainBusy, multichainError, readMultichain, solana, operator }: MultichainPanelViewProps) {
  const cycle = operator.cycle;
  const chosen = cycle?.decision && cycle.decision.choice !== "hold" ? cycle.candidates.find((candidate) => candidate.id === cycle.decision!.choice) ?? null : null;
  return (
    <section className={styles.panel} aria-labelledby="multichain-title">
      <header className={styles.header}>
        <div>
          <h2 className={styles.title} id="multichain-title">Patrimônio multichain e operador Jev</h2>
          <p className={styles.description}>Leitura por rede sem trocar a rede da extensão. O operador decide; a execução tem gate próprio.</p>
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

        <h3 className={styles.subtitle}>Operador Jev</h3>
        {operator.status === "absent" ? (
          <p className={styles.note}>Nenhum ciclo do operador registrado. Rode <code>bun run okx:operator</code> no backend; com <code>--live</code> ele lê a carteira pela API OKX.</p>
        ) : operator.status === "error" && !cycle ? (
          <p className={styles.error} role="alert">Backend sem resposta para o operador ({operator.error}).</p>
        ) : !cycle ? (
          <p className={styles.note}>Carregando o último ciclo do operador.</p>
        ) : (
          <>
            <p className={styles.note}>
              Ciclo {cycle.cycleId} em {new Date(cycle.startedAtMs).toLocaleString("pt-BR")}. Fonte {cycle.inventory.source === "synthetic" ? "sintética (demonstração)" : "API OKX"}.
              Patrimônio conhecido {usd(cycle.inventory.knownValueUsd)}{cycle.inventory.valueComplete ? "" : " (parcial: há ativos sem preço)"}.
            </p>
            <ul className={styles.chainList} aria-label="Patrimônio por rede visto pelo operador">
              {cycle.inventory.chains.map((chain) => (
                <li key={chain.chainIndex} className={styles.chainRow}>
                  <div className={styles.chainHead}>
                    <span className={styles.chainName}>{chain.chainName}</span>
                    <span className={styles.chainMeta}>{usd(chain.knownValueUsd)}{chain.valueComplete ? "" : " parcial"}</span>
                  </div>
                  <dl className={styles.balances}>
                    {chain.assets.map((asset, index) => (
                      <div key={index} className={styles.balanceRow}><dt>{asset.symbol}</dt><dd>{asset.balanceText}</dd></div>
                    ))}
                  </dl>
                </li>
              ))}
            </ul>
            <ul className={styles.candidateList} aria-label="Candidatos avaliados">
              {cycle.candidates.map((candidate) => {
                const verdict = cycle.verdicts.find((entry) => entry.candidateId === candidate.id);
                const probability = cycle.decision?.probabilities[candidate.id];
                return (
                  <li key={candidate.id} className={verdict?.eligible ? styles.candidateEligible : styles.candidateRejected}>
                    <div className={styles.chainHead}>
                      <span className={styles.chainName}>{kindLabel(candidate.kind)}: {candidate.from.symbol} para {candidate.to.symbol}</span>
                      <span className={styles.chainMeta}>{verdict?.eligible ? "elegível" : "rejeitado"}</span>
                    </div>
                    <p className={styles.candidateMeta}>
                      Tamanho {usd(candidate.sizeUsd)}; líquido estimado {candidate.netUsd === null ? "desconhecido" : `${candidate.netUsd.toFixed(4)} USD`}
                      {probability !== undefined ? `; peso Jev ${(probability * 100).toFixed(0)}%` : ""}
                      {verdict && verdict.reasons.length ? `; motivos: ${verdict.reasons.join(", ")}` : ""}
                    </p>
                  </li>
                );
              })}
            </ul>
            <p className={styles.decision}>
              {cycle.decision
                ? `Jev (${cycle.decision.model}) escolheu ${cycle.decision.choice === "hold" ? "manter (hold)" : chosen ? kindLabel(chosen.kind) : cycle.decision.choice} em ${cycle.decision.latencyMs.toFixed(0)} ms com peso ${(cycle.decision.probabilities[cycle.decision.choice] * 100).toFixed(0)}%.`
                : "Jev não foi consultado: nenhum candidato passou nos gates."}
            </p>
            <p className={styles.note}>
              {cycle.plan ? `Plano ${cycle.plan.planId}: ${cycle.plan.executionQualification}; ` : ""}
              execução {executionLabel(cycle.execution.status)} ({cycle.execution.reasons.join("; ")}).
              {cycle.execution.txHash ? ` tx ${cycle.execution.txHash}` : ""}
              {cycle.execution.realizedUsd !== undefined ? ` Resultado realizado: ${cycle.execution.realizedUsd === null ? "desconhecido" : cycle.execution.realizedUsd.toFixed(4) + " USD"}.` : ""}
            </p>
            {cycle.ledger ? (
              <p className={styles.note}>
                Ledger de hoje: {cycle.ledger.dayPlans} planos, {cycle.ledger.dayNotionalUsd.toFixed(2)} USD comprometidos, resultado realizado {(cycle.ledger.dayRealizedUsd ?? 0).toFixed(4)} USD; pernas abertas {cycle.ledger.openLegs.length}
                {cycle.ledger.openLegs.length ? ` (${cycle.ledger.openLegs.map((leg) => `${leg.pairKey} ${leg.status}`).join(", ")})` : ""}.
                {cycle.ledger.killSwitch ? " Kill switch ativo: nenhuma execução até remover data/operator/STOP." : ""}
              </p>
            ) : null}
            <button className={styles.secondaryButton} type="button" onClick={operator.reload}>Atualizar operador</button>
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
  const operator = useOperatorFeed(API_URL);
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
      operator={operator}
    />
  );
}
