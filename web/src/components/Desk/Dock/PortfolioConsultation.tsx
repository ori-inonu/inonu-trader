"use client";

import { useEffect, useRef, useState } from "react";
import type { UseOkxWalletResult } from "@/lib/useOkxWallet";
import type { OnchainFocus } from "@/lib/onchain/focus";
import { createInonuClient, type AskAnswer } from "@/lib/inonu/client";
import { preparePortfolio, preparePortfolioSolana, portfolioMatches, type PortfolioAction } from "@/lib/inonu/portfolio";
import { useSolanaAccount } from "@/lib/useSolanaAccount";
import { createHoldingsReader, holdingsErrorText } from "@/lib/wallet/holdings";
import { readSolanaHoldings, type SolanaReading } from "@/lib/wallet/solana-reading";
import { solanaSideOf } from "@/lib/wallet/solana-account";
import { startWalletFreshnessTicker } from "@/lib/wallet-freshness";
import styles from "./PortfolioConsultation.module.css";

const actions: Record<PortfolioAction, string> = { buy: "Comprar", hold: "Manter", sell: "Vender", abstain: "Aguardar dados" };
const clean = (text: string) => text.replace(/[\u00b7\u2013\u2014]/g, " / ");
const reasons: Record<string, string> = { native_market_unavailable: "Mercado do ativo nativo indisponivel", price_unavailable: "Preco indisponivel", risk_unavailable: "Risco indisponivel", no_credentials: "Credenciais OnchainOS ausentes" };
const outcomes: Record<string, string> = { sem_chave: "A chave do modelo nao foi detectada pelo servidor. Verifique Configuracoes.", cooldown: "Aguarde o intervalo entre consultas.", teto_atingido: "O limite de consultas foi atingido.", em_andamento: "Ja existe uma consulta em andamento.", cancelado: "Consulta cancelada.", erro: "A consulta nao produziu uma resposta verificavel." };

type Family = "evm" | "solana";

export default function PortfolioConsultation({ wallet, candidate }: { readonly wallet: UseOkxWalletResult; readonly candidate: OnchainFocus | null }) {
  const [now, setNow] = useState(Date.now);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [answer, setAnswer] = useState<AskAnswer | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const client = useRef(createInonuClient());
  const active = useRef<{ controller: AbortController; token: number; generation: number; requestId: string } | null>(null);
  const generation = useRef(0);

  // Solana (T9.1, T9.4): its own account, read through the local gateway when the person asks. The consultation takes one family at a time.
  const side = solanaSideOf(useSolanaAccount());
  const solanaKnown = side.available || side.account !== null;
  const evmConnected = wallet.snapshot.account !== null;
  const [picked, setPicked] = useState<Family | null>(null);
  const family: Family = picked === "solana" && solanaKnown ? "solana" : picked === "evm" ? "evm" : !evmConnected && side.account !== null ? "solana" : "evm";
  const [solRead, setSolRead] = useState<{ readonly account: string; readonly reading: SolanaReading } | null>(null);
  const [solBusy, setSolBusy] = useState(false);
  const [solError, setSolError] = useState<string | null>(null);
  const solanaReader = useRef(createHoldingsReader());
  const solController = useRef<AbortController | null>(null);
  const solAccount = useRef<string | null>(null);
  solAccount.current = side.account;
  const reading = solRead !== null && solRead.account === side.account ? solRead.reading : null;

  const notRead = { ok: false as const, reason: side.account === null ? "Conecte a Solana e atualize os saldos." : "Atualize a leitura da carteira Solana." };
  const prepareAt = (at: number) => {
    if (family === "solana") return reading === null ? notRead : preparePortfolioSolana(reading, at, candidate);
    const evm = preparePortfolio(wallet.snapshot, at, candidate);
    return evm.ok ? { ...evm, skipped: 0, beyond: 0 } : evm;
  };
  const identity = family === "solana" ? `solana:${side.account ?? ""}:${reading?.observedAtMs ?? ""}` : `${wallet.identityKey ?? ""}:${wallet.snapshot.observation?.observedAtMs ?? ""}`;
  const prepared = prepareAt(now);
  const requestKey = prepared.ok ? JSON.stringify(prepared.request) : "unavailable";

  const invalidate = () => {
    generation.current++;
    const pending = active.current;
    active.current = null;
    pending?.controller.abort();
    if (pending) void client.current.cancelRequest(pending.requestId);
    setAnswer(null); setBusy(false); setConsent(false);
  };

  useEffect(() => startWalletFreshnessTicker(setNow), []);
  useEffect(() => wallet.subscribeSessionInvalidation(() => { invalidate(); setNote("A conta ou a rede mudou. Faca uma nova leitura."); }), [wallet.subscribeSessionInvalidation]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { invalidate(); setNote(null); }, [identity, requestKey]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => { const pending = active.current; pending?.controller.abort(); if (pending) void client.current.cancelRequest(pending.requestId); active.current = null; generation.current++; solController.current?.abort(); }, []);
  // another Solana account is another subject: a read that was under way for the old one is dropped
  useEffect(() => { solController.current?.abort(); setSolBusy(false); setSolError(null); }, [side.account]);

  async function refreshSolana() {
    const account = side.account;
    if (account === null || solBusy) return;
    solController.current?.abort();
    const controller = new AbortController();
    solController.current = controller;
    setSolBusy(true);
    setSolError(null);
    try {
      const result = await readSolanaHoldings(solanaReader.current, account, Date.now(), controller.signal);
      if (controller.signal.aborted || solAccount.current !== account) return;
      if (result.ok) setSolRead({ account, reading: result.reading });
      else setSolError(holdingsErrorText(result.error));
    } finally {
      if (solController.current === controller) { solController.current = null; setSolBusy(false); }
    }
  }

  async function ask() {
    if (!consent || !prepared.ok || busy) return;
    const request = prepared.request;
    const pending = { controller: new AbortController(), token: wallet.getSessionToken(), generation: ++generation.current, requestId: crypto.randomUUID() };
    active.current = pending;
    setBusy(true); setAnswer(null); setNote(null);
    try {
      const result = await client.current.ask(request, pending.controller.signal, pending.requestId);
      if (active.current !== pending || pending.generation !== generation.current || pending.token !== wallet.getSessionToken() || !prepareAt(Date.now()).ok) return;
      if (result.carteira && portfolioMatches(result.carteira, request)) { setAnswer(result); }
      else setNote(outcomes[result.status] ?? "A resposta nao corresponde aos ativos enviados. Tente novamente com dados atuais.");
    } finally {
      if (active.current === pending) { active.current = null; setBusy(false); }
    }
  }

  const onSolana = family === "solana";
  const connected = onSolana ? side.account !== null : evmConnected;
  const refreshing = onSolana ? solBusy : wallet.snapshot.status === "reading";
  const portfolio = answer?.carteira;
  return (
    <section className={styles.root} aria-label="Gestao de carteira com Inonu">
      <div className={styles.heading}>
        <div><span className={styles.eyebrow}>DECISAO DE CARTEIRA</span><h2>Seu proximo movimento</h2></div>
        <span className={styles.badge}>Consulta manual</span>
      </div>
      <p className={styles.intro}>O Inonu compara os ativos lidos e o token em foco. Voce decide como agir.</p>
      {solanaKnown ? (
        <div className={styles.controls} role="group" aria-label="Carteira a consultar">
          <button type="button" className={styles.secondary} aria-pressed={!onSolana} disabled={busy} onClick={() => setPicked("evm")}>EVM (Monad ou X Layer)</button>
          <button type="button" className={styles.secondary} aria-pressed={onSolana} disabled={busy} onClick={() => setPicked("solana")}>Solana</button>
        </div>
      ) : null}
      <div className={styles.capabilities}>
        <span><b>Leitura</b> {connected ? "carteira conectada" : "aguarda conexao"}</span>
        <span><b>Cotacao</b> no ticket, com credenciais</span>
        <span><b>Operacao</b> indisponivel nesta interface</span>
      </div>
      {!connected ? (
        onSolana
          ? <button type="button" className={styles.primary} disabled={!side.available || side.connecting} onClick={side.onConnect}>Conectar Solana para leitura</button>
          : <button type="button" className={styles.primary} disabled={!wallet.available || wallet.snapshot.status === "connecting"} onClick={() => void wallet.connect()}>Conectar carteira para leitura</button>
      ) : null}
      <div className={styles.scope}>
        <span>Rede {onSolana ? "Solana" : wallet.snapshot.chainId === "0x8f" ? "Monad" : wallet.snapshot.chainId === "0xc4" ? "X Layer" : "aguarda leitura"}</span>
        <span>{prepared.ok ? `${prepared.request.carteira.assets.length} ativos nesta leitura` : onSolana ? "Leitura parcial da Solana" : "Leitura parcial de Monad ou X Layer"}</span>
        <span>Sem alavancagem</span><span>Patrimonio total indisponivel</span>
      </div>
      {prepared.ok
        ? <p className={styles.note}>{Math.floor(Math.max(0, now - prepared.request.carteira.observedAtMs) / 1_000)} s desde a leitura. Outros tokens e posicoes DeFi podem estar fora dela.{candidate && !prepared.candidateIncluded ? ` O token em foco nao foi incluido: ${onSolana ? "ele nao e da Solana, ja esta em outra posicao ou a lista tem 6 ativos" : "rede diferente ou limite de 6 ativos"}.` : ""}{prepared.skipped + prepared.beyond > 0 ? ` ${prepared.skipped + prepared.beyond} ${prepared.skipped + prepared.beyond === 1 ? "ativo ficou" : "ativos ficaram"} de fora: marcados como risco pelo provedor, sem simbolo verificavel, sem saldo ou acima de 6.` : ""}</p>
        : <p className={styles.note}>{prepared.reason}</p>}
      {connected ? <button type="button" className={styles.secondary} disabled={refreshing} onClick={() => (onSolana ? void refreshSolana() : void wallet.refresh())}>Atualizar leitura da carteira</button> : null}
      {onSolana && solError ? <p role="status" className={styles.note}>{solError}</p> : null}
      {onSolana && side.errorText ? <p role="status" className={styles.note}>{side.errorText}</p> : null}
      <label className={styles.consent}><input type="checkbox" checked={consent} disabled={!prepared.ok || busy} onChange={e => setConsent(e.target.checked)} /><span>Enviar redes, contratos e saldos desta leitura ao modelo (Jev). Endereco da carteira nao enviado. A consulta pode ter custo.</span></label>
      <div className={styles.controls}>
        <button type="button" className={styles.primary} disabled={!prepared.ok || !consent || busy} onClick={() => void ask()}>{busy ? "Inonu analisando a carteira" : "Consultar carteira com Inonu"}</button>
        {busy ? <button type="button" className={styles.secondary} onClick={() => { invalidate(); setNote("Consulta cancelada. Nenhum resultado sera aplicado."); }}>Cancelar</button> : null}
      </div>
      {note ? <p role="status" className={styles.note}>{note}</p> : null}
      {portfolio ? <>
        <div className={styles.resultHead}><h3>Plano por ativo</h3><span>{portfolio.positionsEmpty === true ? "Sem saldo nos ativos lidos" : portfolio.positionsEmpty === false ? "Posicoes identificadas" : "Cobertura insuficiente para confirmar saldo total"}</span></div>
        <div className={styles.cards}>{portfolio.assets.map(asset => <article key={asset.candidateId} className={styles.card}>
          <div className={styles.assetHead}><b>{clean(asset.symbol)}</b><span data-action={asset.action} className={styles.action}>{actions[asset.action]}</span></div>
          <p>Saldo {asset.balance === null ? "desconhecido" : asset.balance}</p>
          <p>Fonte {clean(asset.evidence.origin)}. Idade {asset.evidence.ageMs === null ? "desconhecida" : `${Math.floor(asset.evidence.ageMs / 1_000)} s`}.</p>
          {asset.evidence.flow ? <p>Fluxo comprador {asset.evidence.flow.buyShare === null ? "indisponivel" : `${Math.round(asset.evidence.flow.buyShare * 100)}%`}. Negocios {asset.evidence.flow.tradeCount ?? "indisponiveis"}.</p> : null}
          <p>Risco {asset.evidence.risk === null ? "indisponivel" : clean(String(asset.evidence.risk))}.</p>
          {asset.evidence.gaps.length ? <details><summary>{asset.evidence.gaps.length} lacunas nos dados</summary><ul>{asset.evidence.gaps.map((gap, i) => <li key={i}>{reasons[gap] ?? clean(gap)}</li>)}</ul></details> : null}
          <small>Modelo {clean(asset.model)}</small>
        </article>)}</div>
        <p className={styles.note}>Custo {answer.custo.usd === null ? "nao informado" : `US$ ${answer.custo.usd.toFixed(4)}`}. Tokens {answer.custo.tokens ?? "nao informados"}. Chamadas OnchainOS {answer.custo.chamadasOnchainos ?? "nao informadas"}.{answer.reutilizado ? " Resultado reutilizado para a mesma leitura." : ""} Nenhuma ordem enviada.</p>
      </> : null}
    </section>
  );
}
