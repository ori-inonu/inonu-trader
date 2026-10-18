"use client";

import { useCallback, useEffect, useLayoutEffect, useState, useSyncExternalStore } from "react";
import { flushSync } from "react-dom";
import { createWalletProposalReview, walletProposalReviewMessage, type WalletProposalReview, type WalletProposalReviewSnapshot } from "../../lib/wallet-proposal-review";
import styles from "./WalletProposalReview.module.css";
import type { UseOkxWalletResult } from "../../lib/useOkxWallet";

export interface WalletProposalReviewViewProps {
  snapshot: WalletProposalReviewSnapshot;
  canCheck: boolean;
  onEdit(value: string): void;
  onCheck(): void;
  onClear(): void;
}

const EMPTY: WalletProposalReviewSnapshot = Object.freeze({ status: "empty", text: "", reason: null, executionQualified: false, proposal: null, observedAtMs: null });

function LiveReview({ review, wallet }: { review: WalletProposalReview; wallet: UseOkxWalletResult }) {
  const current = useCallback(() => review.validateCurrent(false), [review]);
  const snapshot = useSyncExternalStore(review.subscribe, current, () => EMPTY);
  useLayoutEffect(() => {
    const gate = () => { flushSync(() => { review.validateCurrent(); }); };
    const visible = () => { if (document.visibilityState === "visible") gate(); };
    const unsubscribe = wallet.subscribeSessionInvalidation(gate);
    document.addEventListener("resume", gate);
    document.addEventListener("visibilitychange", visible);
    window.addEventListener("pageshow", gate);
    window.addEventListener("focus", gate);
    const timer = window.setInterval(visible, 1000);
    return () => {
      unsubscribe(); window.clearInterval(timer);
      document.removeEventListener("resume", gate);
      document.removeEventListener("visibilitychange", visible);
      window.removeEventListener("pageshow", gate);
      window.removeEventListener("focus", gate);
    };
  }, [review, wallet.subscribeSessionInvalidation]);
  const canCheck = wallet.available && wallet.snapshot.status === "connected";
  return <WalletProposalReviewView snapshot={snapshot} canCheck={canCheck}
    onEdit={(value) => review.edit(value)}
    onCheck={() => { review.validateCurrent(); if (canCheck) void review.check(); }}
    onClear={() => { review.validateCurrent(); review.clear(); }} />;
}

export default function WalletProposalReview({ wallet }: { wallet: UseOkxWalletResult }) {
  const [review, setReview] = useState<WalletProposalReview | null>(null);
  useEffect(() => {
    const next = createWalletProposalReview({ preflightTransaction: wallet.preflightTransaction, getSessionToken: wallet.getSessionToken, now: () => Date.now() });
    setReview(next);
    return () => next.dispose();
  }, [wallet.preflightTransaction, wallet.getSessionToken]);
  return review ? <LiveReview review={review} wallet={wallet} />
    : <WalletProposalReviewView snapshot={EMPTY} canCheck={false} onEdit={() => {}} onCheck={() => {}} onClear={() => {}} />;
}

export function WalletProposalReviewView({ snapshot, canCheck, onEdit, onCheck, onClear }: WalletProposalReviewViewProps) {
  const proposal = snapshot.status === "ready_for_review" ? snapshot.proposal : null;
  const message = snapshot.status === "blocked" ? walletProposalReviewMessage(snapshot.reason)
    : snapshot.status === "checking" ? "Consultando conta, rede e prazo…"
    : snapshot.status === "ready_for_review" ? "Conferida para revisão"
    : snapshot.status === "edited" ? "Proposta editada. Confira explicitamente na carteira."
    : "Informe uma proposta para revisão manual.";
  return <section className={styles.review} aria-labelledby="proposal-review-title" data-review-status={snapshot.status} data-execution-qualified="false">
    <h3 id="proposal-review-title">Revisar proposta</h3>
    <p id="proposal-review-description">Origem não verificada. Esta consulta confere formato, conta, rede e prazo; não comprova segurança, custo ou retorno.</p>
    <label htmlFor="proposal-review-input">Proposta em JSON</label>
    <textarea id="proposal-review-input" className={styles.input} aria-describedby="proposal-review-description proposal-review-connection" value={snapshot.text} spellCheck={false} onChange={(event) => onEdit(event.currentTarget.value)} />
    <p id="proposal-review-connection">{canCheck ? "Conferência manual disponível nesta sessão." : "Conecte a carteira OKX para conferir a proposta."}</p>
    <div className={styles.actions}>
      <button type="button" disabled={!canCheck || snapshot.status === "checking"} onClick={onCheck}>Conferir na carteira</button>
      <button type="button" onClick={onClear}>Limpar</button>
    </div>
    <p className={styles.status} role="status" aria-live="polite" aria-atomic="true">{message}</p>
    <p className={styles.notice}>Execução não habilitada</p>
    {proposal ? <div className={styles.captured}>
      <dl>
        <div><dt>Plano (não verificado)</dt><dd>{proposal.planId}</dd></div>
        <div><dt>Identificador da cotação (não autenticado)</dt><dd>{proposal.quoteHash}</dd></div>
        <div><dt>Rede da proposta</dt><dd>{proposal.chainId === "0xc4" ? "X Layer (196)" : "Monad (143)"}</dd></div>
        <div><dt>Origem</dt><dd>{proposal.from}</dd></div>
        <div><dt>Destino</dt><dd>{proposal.to}</dd></div>
        <div><dt>Valor em unidades atômicas nativas</dt><dd>{proposal.valueAtomic}</dd></div>
        <div><dt>Teto de gas em unidades atômicas nativas</dt><dd>{(BigInt(proposal.gasLimitAtomic) * BigInt(proposal.maxFeePerGasAtomic)).toString(10)}</dd></div>
        <div><dt>Observação (milissegundos Unix)</dt><dd>{snapshot.observedAtMs}</dd></div>
        <div><dt>Validade até (milissegundos Unix)</dt><dd>{proposal.expiresAtMs}</dd></div>
      </dl>
      <details><summary>Calldata completa ({(proposal.data.length - 2) / 2} bytes; {proposal.data.length} caracteres)</summary><pre className={styles.calldata}>{proposal.data}</pre></details>
      <p>Os horários indicam observação e validade, sem afirmar inclusão em blockchain. A conferência é revalidada ao retornar à página; a suspensão pode atrasar verificações.</p>
    </div> : null}
  </section>;
}
