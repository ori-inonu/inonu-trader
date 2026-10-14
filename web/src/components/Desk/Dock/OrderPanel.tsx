"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fmtNumber } from "@/lib/desk/ui/format";
import { discoverOkxProvider, type Eip1193Provider, type OkxDiscoverySurface } from "@/lib/okx-wallet";
import type { UseOkxWalletResult } from "@/lib/useOkxWallet";
import { LADDER_GAP_MS, toMinorUnits } from "@/lib/wallet/ladder";
import { createRunGuard } from "@/lib/wallet/run-guard";
import { confirmationWord, evaluateGate, type GateResult } from "@/lib/wallet/send/gate";
import { spentLast24hUsd, sharedTradeLog, type TradeLogEntry } from "@/lib/wallet/send/log";
import { explorerAddressUrl, sameAddress } from "@/lib/wallet/send/explorer";
import { formatMinor, orderUsd, selectorOf, type ApproveAnswer, type Order, type SwapAnswer } from "@/lib/wallet/send/order";
import { awaitReceipt, readAllowance, sendCleared } from "@/lib/wallet/send/send";
import { DEFAULT_FRACTION, FRACTIONS, fractionOf, isFractionId, orderPlan, readDecimals, readHolding, type FractionId } from "@/lib/wallet/send/sell";
import { DEFAULT_TRADE_SETTINGS, sharedTradeSettings, type TradeSettings } from "@/lib/wallet/send/settings";
import { permissionLine, resultText, tradeErrorText } from "@/lib/wallet/send/texts";
import { createTradeClient } from "@/lib/wallet/send/trade-client";
import { draftAgeText, sharedTicket, ticketPlan, type TicketDraft, type TicketPlan } from "@/lib/wallet/ticket";
import styles from "./OrderPanel.module.css";

/**
 * The order panel of the Carteira tab (WAL-10): where an order the Inonu prepared (or the person filled in) is REVIEWED against the real transaction the provider builds for it and, when the person has turned the
 * option on in Configuracoes and has set their caps, carried out THROUGH THEIR OWN WALLET with one confirmed click. The app never holds a key and the server never sends anything: the wallet extension opens its own
 * window, and the person approves there. Nothing is asked of the provider until the person clicks "Revisar ordem", and nothing is sent until the gate (`lib/wallet/send/gate.ts`) has found no reason against it
 * and the person has typed the symbol of the token. Withdrawals and transfers are not here, and never will be: they stay in the wallet.
 */

export type OrderPhase = "idle" | "reviewing" | "sending" | "waiting";

export interface Review {
  readonly order: Order;
  readonly swap: SwapAnswer;
  readonly approval: ApproveAnswer | null;
  readonly needsApproval: boolean;
  /** When the swap came back. */
  readonly fetchedAtMs: number;
  /** What the wallet held of the token to give, as it was read, for a sale; absent for a purchase. */
  readonly held?: string | null;
}

export interface SentState {
  readonly step: "approve" | "swap";
  readonly txHash: string;
  readonly state: "enviada" | "confirmada" | "revertida" | "sem_recibo";
}

export interface OrderPanelViewProps {
  readonly settings: TradeSettings;
  readonly draft: TicketDraft | null;
  readonly plan: TicketPlan | null;
  readonly payIndex: number;
  readonly size: string;
  /** For a sale: how much of what the wallet holds is given. */
  readonly fraction: FractionId;
  readonly phase: OrderPhase;
  readonly review: Review | null;
  readonly gate: GateResult | null;
  readonly typed: string;
  readonly nowMs: number;
  readonly spent24hUsd: number;
  readonly notice: string | null;
  readonly sent: SentState | null;
  readonly log: readonly TradeLogEntry[];
  /** Whether the wallet is connected at all; the review needs the account. */
  readonly connected: boolean;
  readonly onPay: (index: number) => void;
  readonly onSize: (text: string) => void;
  readonly onFraction: (id: FractionId) => void;
  readonly onTyped: (text: string) => void;
  readonly onReview: () => void;
  readonly onSend: () => void;
  readonly onKill: () => void;
  readonly onCancel: () => void;
  /** What the person typed to confirm the router, and the address of the approval: the last six characters of each, read off the table. */
  readonly routerTyped: string;
  readonly spenderTyped: string;
  readonly onRouterTyped: (text: string) => void;
  readonly onSpenderTyped: (text: string) => void;
  /** The person says the router of this review is right for this network, and (separately) the address that would be given the approval. */
  readonly onTrustRouter: () => void;
  readonly onTrustSpender: () => void;
  /** The person looked in the wallet and no window is open for this attempt: it stops counting against the day. */
  readonly onClosePending: (id: string) => void;
  /** The attempt the person is being asked to confirm closing; null when none. */
  readonly closing: string | null;
  readonly onAskClose: (id: string | null) => void;
}

/** An attempt that stayed open can be closed by the person only after this long: a window of the wallet that was just opened is not one to be closed by a fast click. */
const CLOSE_AFTER_MS = 30_000;

/** Text from a provider or from a draft, shown on the screen: only the characters a person can read as plain text, never a direction mark or a control. */
// eslint-disable-next-line no-control-regex
const safe = (text: string): string => text.replace(/[\u0000-\u001f\u007f-\u009f\u200B-\u200F\u202A-\u202E\u2066-\u2069]/g, "");

const usd = (v: number | null): string => (v === null ? "-" : `US$ ${fmtNumber(v, v < 10 ? 2 : 0)}`);
const pctText = (v: number | null): string => (v === null ? "-" : `${String(Math.round(v * 100) / 100).replace(".", ",")}%`);
const shortHash = (h: string): string => `${h.slice(0, 10)}...${h.slice(-6)}`;

function Row({ label, value, tone }: { readonly label: string; readonly value: string; readonly tone?: "bloqueio" }) {
  return (
    <div className={styles.line} data-tom={tone}>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function Summary({ review, p }: { readonly review: Review; readonly p: OrderPanelViewProps }) {
  const { order, swap } = review;
  const age = Math.max(0, Math.round((p.nowMs - review.fetchedAtMs) / 1000));
  const value = orderUsd(order, swap);
  // the token of the order is the one that is not a dollar coin
  const toToken = order.dollarSide === "to" ? swap.route.fromToken : swap.route.toToken;
  // what one unit of the token costs in this order, so the person can put it beside the price on the chart: the lowball answer of a provider shows here
  const tokenSide = order.dollarSide === "to" ? { amount: swap.route.fromAmount, decimals: order.from.decimals, symbol: order.from.symbol } : { amount: swap.route.toAmount, decimals: order.to.decimals, symbol: order.to.symbol };
  const tokenUnits = Number(formatMinor(tokenSide.amount, tokenSide.decimals, 12));
  const unitPrice = value !== null && Number.isFinite(tokenUnits) && tokenUnits > 0 ? value / tokenUnits : null;
  return (
    <dl className={styles.summary} aria-label="Conferencia da ordem">
      {review.held === undefined || review.held === null ? null : <Row label="Saldo do token na carteira" value={`${review.held} ${order.from.symbol}`} />}
      <Row label="Voce da" value={`${formatMinor(order.amountMinor, order.from.decimals)} ${order.from.symbol}${value === null ? "" : ` (${usd(value)})`}`} />
      <Row label="Voce recebe, estimado" value={`${formatMinor(swap.route.toAmount, order.to.decimals)} ${order.to.symbol}`} />
      <Row label="Minimo recebido" value={swap.tx.minReceiveAmount === null ? "-" : `${formatMinor(swap.tx.minReceiveAmount, order.to.decimals)} ${order.to.symbol}`} />
      <Row label={`Preco por ${tokenSide.symbol} nesta ordem`} value={unitPrice === null ? "-" : `US$ ${fmtNumber(unitPrice, unitPrice < 1 ? 6 : 2)}`} />
      <Row label="Tolerancia de preco" value={pctText(order.slippagePct)} />
      <Row label="Impacto no preco" value={pctText(swap.route.priceImpactPct)} />
      <Row label="Rota" value={swap.route.dexNames.length === 0 ? "-" : safe(swap.route.dexNames.join(", "))} />
      <Row label="Taxa de rota estimada" value={usd(swap.route.tradeFee)} />
      <Row label="Taxa do token" value={toToken.taxRate === null ? "nao informada" : pctText(toToken.taxRate * 100)} />
      <Row label="Armadilha de saida (honeypot)" value={toToken.isHoneyPot === null ? "o provedor nao informou" : toToken.isHoneyPot ? "SIM" : "nao"} tone={toToken.isHoneyPot === false ? undefined : "bloqueio"} />
      <Row label="Roteador da troca" value={swap.tx.to ?? "-"} />
      <Row label="Funcao chamada" value={selectorOf(swap.tx.data) ?? "-"} />
      {review.needsApproval && review.approval !== null ? <Row label="Aprovacao dada a" value={`${review.approval.spender}, so de ${formatMinor(order.amountMinor, order.from.decimals)} ${order.from.symbol}`} /> : null}
      <Row label="Etapas" value={review.needsApproval ? `2: aprovar ${order.from.symbol} para o roteador, depois trocar` : "1: trocar"} />
      <Row label="Cotacao" value={`ha ${age} s (vale ${30} s)`} />
    </dl>
  );
}

export function OrderPanelView(p: OrderPanelViewProps) {
  const { settings, draft, plan } = p;
  const off = !settings.enabled || settings.killed;
  const busy = p.phase !== "idle";
  const header = (
    <div className={styles.head}>
      <h3 className={styles.title}>Ordem pela minha carteira</h3>
      <span className={styles.state} data-on={!off && settings.perOperationUsd !== null && settings.dailyUsd !== null ? "true" : "false"}>{permissionLine(settings)}</span>
      {settings.enabled && !settings.killed ? (
        <button type="button" className={styles.stop} onClick={p.onKill}>
          Parar tudo
        </button>
      ) : null}
    </div>
  );

  if (off) {
    return (
      <section className={styles.root} aria-label="Ordem pela minha carteira">
        {header}
        <p className={styles.note}>
          {settings.killed ? "O envio foi parado com o botao Parar tudo e so volta quando voce religar." : "O envio pela carteira esta desligado: nada daqui abre a carteira."} <a href="/configuracoes">Ajustar em Configuracoes</a>
        </p>
      </section>
    );
  }
  if (draft === null || plan === null) {
    return (
      <section className={styles.root} aria-label="Ordem pela minha carteira">
        {header}
        <p className={styles.note}>Nenhuma ordem montada. Use "Preparar compra" em uma das melhores oportunidades para preencher o ticket.</p>
      </section>
    );
  }
  if (!plan.quotable) {
    return (
      <section className={styles.root} aria-label="Ordem pela minha carteira">
        {header}
        <p className={styles.note}>{plan.reason}</p>
      </section>
    );
  }

  const pay = plan.pay[p.payIndex] ?? plan.pay[0]!;
  const selling = draft.acao === "sell";
  // a purchase is sized by what the person types; a sale by the share of the balance, which is read at the review
  const sizeMinor = selling ? "share" : toMinorUnits(p.size, pay.decimals);
  const blocks = p.gate !== null && !p.gate.ok ? p.gate.blocks.filter((b) => b.code !== "confirmacao") : [];
  // a router (or an approval address) the person has not confirmed on this network yet: the one thing they can fix here, after checking the address
  const routerNew = blocks.some((b) => b.code === "roteador_novo");
  const spenderNew = blocks.some((b) => b.code === "gastador_novo");
  const cleared = p.gate !== null && p.gate.ok ? p.gate.cleared : null;
  const word = p.review === null ? null : confirmationWord(p.review.order);
  const stepText = p.review?.needsApproval ? `Aprovar ${p.review.order.from.symbol} pela minha carteira` : "Enviar pela minha carteira";

  return (
    <section className={styles.root} aria-label="Ordem pela minha carteira">
      {header}
      <dl className={styles.facts}>
        <div>
          <dt>Token</dt>
          <dd className={styles.mono}>{`${safe(draft.tokenSymbol ?? "token")} ${draft.tokenAddress}`}</dd>
        </div>
        <div>
          <dt>Lado</dt>
          <dd>{selling ? "Entregar o token e receber em dolar" : "Receber o token"}</dd>
        </div>
        <div>
          <dt>Preenchido</dt>
          <dd>{draftAgeText(draft.atMs, p.nowMs)}</dd>
        </div>
        {draft.sugestaoUsd === undefined || draft.sugestaoUsd === null ? null : (
          <div>
            <dt>Tamanho sugerido</dt>
            <dd>{`US$ ${fmtNumber(draft.sugestaoUsd, 0)}, calculado pelo seu saldo`}</dd>
          </div>
        )}
      </dl>

      <div className={styles.form}>
        <label className={styles.field}>
          <span>{selling ? "Receber em" : "Pagar com"}</span>
          <select aria-label={selling ? "Receber em" : "Pagar com"} value={String(p.payIndex)} disabled={busy} onChange={(e) => p.onPay(Number(e.target.value))}>
            {plan.pay.map((coin, index) => (
              <option key={coin.contract} value={String(index)}>
                {coin.symbol}
              </option>
            ))}
          </select>
        </label>
        {selling ? (
          <label className={styles.field}>
            <span>Quanto trocar do que voce tem</span>
            <select aria-label="Quanto trocar do saldo do token" value={p.fraction} disabled={busy} onChange={(e) => isFractionId(e.target.value) && p.onFraction(e.target.value)}>
              {FRACTIONS.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.label}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <label className={styles.field}>
            <span>Tamanho</span>
            <input type="text" inputMode="decimal" aria-label="Tamanho da ordem na moeda de pagamento" value={p.size} disabled={busy} onChange={(e) => p.onSize(e.target.value)} />
          </label>
        )}
        {busy && p.phase === "reviewing" ? (
          <button type="button" className={styles.button} onClick={p.onCancel}>
            Cancelar
          </button>
        ) : (
          <button type="button" className={styles.button} disabled={busy || sizeMinor === null || !p.connected} onClick={p.onReview}>
            Revisar ordem
          </button>
        )}
      </div>
      <p className={styles.note}>
        {`Revisar busca a transacao real no provedor (2 leituras da OnchainOS, uma por segundo) e confere se ela e a troca que voce pediu. Seus tetos: ${usd(settings.perOperationUsd)} por ordem, ${usd(settings.dailyUsd)} por dia, e ja foram ${usd(p.spent24hUsd)} nas ultimas 24 horas.`}
      </p>
      {!p.connected ? <p className={styles.note}>Conecte a carteira para revisar a ordem.</p> : null}
      {p.phase === "reviewing" ? <p className={styles.note} role="status">Buscando a transacao</p> : null}
      {p.notice === null ? null : (
        <p className={styles.notice} role="status">
          {p.notice}
        </p>
      )}

      {p.review === null ? null : (
        <>
          <Summary review={p.review} p={p} />
          {blocks.length === 0 ? null : (
            <ul className={styles.blocks} aria-label="O que impede o envio">
              {blocks.map((b) => (
                <li key={`${b.code}:${b.text}`}>{b.text}</li>
              ))}
            </ul>
          )}
          {!routerNew || p.review.swap.tx.to === null ? null : (
            <div className={styles.trust}>
              <p className={styles.note}>
                {`A transacao so pode ir para um roteador que voce confirmou nesta rede, e este e novo: ${p.review.swap.tx.to}. Abra o endereco no explorador da rede e confira que o contrato e da OKX (o nome do contrato) e, se puder, compare com o que a OKX publica na documentacao dela (web3.okx.com, Trade API). Cole o endereco INTEIRO abaixo. Depois disso, as trocas para o mesmo roteador passam sem pedir de novo.`}
              </p>
              {explorerAddressUrl(p.review.order.chainIndex, p.review.swap.tx.to) === null ? null : (
                <a className={styles.link} href={explorerAddressUrl(p.review.order.chainIndex, p.review.swap.tx.to)!} target="_blank" rel="noopener noreferrer">
                  Abrir o roteador no explorador da rede
                </a>
              )}
              <div className={styles.form}>
                <label className={styles.field}>
                  <span>Cole o endereco inteiro do roteador</span>
                  <input type="text" aria-label="Endereco inteiro do roteador" value={p.routerTyped} disabled={busy} autoComplete="off" spellCheck={false} onChange={(e) => p.onRouterTyped(e.target.value)} />
                </label>
                <button type="button" className={styles.button} disabled={busy || !sameAddress(p.routerTyped, p.review.swap.tx.to)} onClick={p.onTrustRouter}>
                  Confiar neste roteador nesta rede
                </button>
              </div>
            </div>
          )}
          {!spenderNew || p.review.approval === null ? null : (
            <div className={styles.trust}>
              <p className={styles.note}>
                {`A aprovacao seria dada ao endereco ${p.review.approval.spender}, so do valor desta ordem. Confira o endereco no explorador da rede e na documentacao da OKX (web3.okx.com, Trade API, endereco de aprovacao da rede) e cole o endereco INTEIRO abaixo.`}
              </p>
              {explorerAddressUrl(p.review.order.chainIndex, p.review.approval.spender) === null ? null : (
                <a className={styles.link} href={explorerAddressUrl(p.review.order.chainIndex, p.review.approval.spender)!} target="_blank" rel="noopener noreferrer">
                  Abrir o endereco da aprovacao no explorador da rede
                </a>
              )}
              <div className={styles.form}>
                <label className={styles.field}>
                  <span>Cole o endereco inteiro da aprovacao</span>
                  <input type="text" aria-label="Endereco inteiro da aprovacao" value={p.spenderTyped} disabled={busy} autoComplete="off" spellCheck={false} onChange={(e) => p.onSpenderTyped(e.target.value)} />
                </label>
                <button type="button" className={styles.button} disabled={busy || !sameAddress(p.spenderTyped, p.review.approval.spender)} onClick={p.onTrustSpender}>
                  Confiar neste endereco de aprovacao
                </button>
              </div>
            </div>
          )}
          <div className={styles.confirm}>
            <label className={styles.field}>
              <span>{`Digite ${word} para confirmar`}</span>
              <input type="text" aria-label={`Digite ${word} para confirmar`} value={p.typed} disabled={busy} autoComplete="off" spellCheck={false} onChange={(e) => p.onTyped(e.target.value)} />
            </label>
            <button type="button" className={styles.send} disabled={busy || cleared === null} onClick={p.onSend}>
              {stepText}
            </button>
          </div>
          <p className={styles.note}>A carteira vai abrir uma janela e voce aprova la. Nada sai se voce nao aprovar. Saques e transferencias nao passam por aqui.</p>
          {p.review.needsApproval && p.review.order.from.symbol.toUpperCase().startsWith("USDT") ? <p className={styles.note}>Se a carteira recusar a aprovacao, este token pode exigir zerar a aprovacao anterior antes (caso do USDT na Ethereum): faca isso na carteira.</p> : null}
        </>
      )}

      {p.sent === null ? null : (
        <p className={styles.notice} role="status">
          {`${p.sent.step === "approve" ? "Aprovacao" : "Troca"} ${shortHash(p.sent.txHash)}: ${resultText(p.sent.state)}`}
        </p>
      )}

      {p.log.length === 0 ? null : (
        <details className={styles.history} open={p.log.some((e) => e.result === "pendente")}>
          <summary>Ultimas ordens deste computador</summary>
          <ul>
            {/* the last five, and every attempt that is still open however old: an open one counts against the day and must be seen to be closed */}
            {[...p.log.filter((e, i, all) => e.result === "pendente" && i < all.length - 5), ...p.log.slice(-5)]
              .reverse()
              .map((e) => (
                <li key={e.id}>
                  {`${draftAgeText(e.atMs, p.nowMs)}: ${e.step === "approve" ? "aprovacao" : e.side === "buy" ? "compra" : "troca"} de ${e.symbol}${e.usd === null ? "" : ` (${usd(e.usd)})`}, ${resultText(e.result)}`}
                  {e.result !== "pendente" ? null : p.nowMs - e.atMs < CLOSE_AFTER_MS ? (
                    <> Espere 30 s antes de poder fechar esta tentativa.</>
                  ) : p.closing !== e.id ? (
                    <>
                      {" "}
                      <button type="button" className={styles.link} onClick={() => p.onAskClose(e.id)}>
                        Conferi na carteira: nao ha janela aberta
                      </button>
                    </>
                  ) : (
                    <>
                      {" Confirma que NAO ha janela aberta na carteira para esta ordem? Se voce a aprovar depois, ela nao contara no seu teto do dia. "}
                      <button type="button" className={styles.link} onClick={() => p.onClosePending(e.id)}>
                        Sim, fechar
                      </button>
                      {" "}
                      <button type="button" className={styles.link} onClick={() => p.onAskClose(null)}>
                        Voltar
                      </button>
                    </>
                  )}
                </li>
              ))}
          </ul>
        </details>
      )}
    </section>
  );
}

const plainSymbol = (s: string | null): string | null => (s !== null && /^[A-Za-z0-9]{1,20}$/.test(s) ? s : null);

export default function OrderPanel({ wallet }: { readonly wallet: UseOkxWalletResult }) {
  const client = useMemo(() => createTradeClient(), []);
  const [settings, setSettings] = useState<TradeSettings>(DEFAULT_TRADE_SETTINGS);
  const [log, setLog] = useState<readonly TradeLogEntry[]>([]);
  const [draft, setDraft] = useState<TicketDraft | null>(null);
  const [payIndex, setPayIndex] = useState(0);
  const [size, setSize] = useState("");
  const [fraction, setFraction] = useState<FractionId>(DEFAULT_FRACTION);
  const [typed, setTyped] = useState("");
  const [routerTyped, setRouterTyped] = useState("");
  const [spenderTyped, setSpenderTyped] = useState("");
  const [closing, setClosing] = useState<string | null>(null);
  const [phase, setPhase] = useState<OrderPhase>("idle");
  const [review, setReview] = useState<Review | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [sent, setSent] = useState<SentState | null>(null);
  const [nowMs, setNowMs] = useState(0);
  const [provider, setProvider] = useState<Eip1193Provider | null>(null);
  const guard = useRef(createRunGuard());
  const alive = useRef(true);

  // the page and the server render the same first paint: what is kept on this machine is read after mount
  useEffect(() => {
    alive.current = true;
    const store = sharedTradeSettings();
    const logStore = sharedTradeLog();
    const ticket = sharedTicket();
    setSettings(store.get());
    setLog(logStore.list());
    setDraft(ticket.get());
    setNowMs(Date.now());
    const offs = [store.subscribe(() => setSettings(store.get())), logStore.subscribe(() => setLog(logStore.list())), ticket.subscribe(() => setDraft(ticket.get()))];
    const stop = discoverOkxProvider(window as unknown as OkxDiscoverySurface, setProvider);
    return () => {
      alive.current = false;
      guard.current.invalidate();
      for (const off of offs) off();
      stop();
    };
  }, []);
  useEffect(() => {
    const timer = setInterval(() => setNowMs(Date.now()), review === null ? 5_000 : 1_000);
    return () => clearInterval(timer);
  }, [review]);

  // another draft is another order: what was typed, reviewed and confirmed for the old one never carries over
  const key = draft === null ? "" : `${draft.chainIndex}:${draft.tokenAddress}:${draft.acao}:${draft.atMs}`;
  // what the key was when a send began: a draft that changed while the wallet or the chain was answering is another order, and the answer of the old one never writes into the new one
  const keyRef = useRef(key);
  keyRef.current = key;
  const plan = useMemo(() => (draft === null ? null : orderPlan(draft, ticketPlan(draft))), [draft]);
  useEffect(() => {
    guard.current.invalidate();
    setPayIndex(0);
    setFraction(DEFAULT_FRACTION);
    setReview(null);
    setTyped("");
    setNotice(null);
    setSent(null);
    setPhase("idle");
    // the Inonu's size is offered when the coin to pay with is a dollar coin; the person can change it
    const first = plan?.quotable ? plan.pay[0] : undefined;
    setSize(first !== undefined && /^(USDC|USDT)/i.test(first.symbol) && draft?.sugestaoUsd ? String(draft.sugestaoUsd) : "");
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  // choosing another coin to pay with is another order too
  const onPay = (index: number) => {
    guard.current.invalidate();
    setPayIndex(index);
    setReview(null);
    setTyped("");
    setNotice(null);
    const coin = plan?.quotable ? plan.pay[index] : undefined;
    if (coin !== undefined && /^(USDC|USDT)/i.test(coin.symbol) && draft?.sugestaoUsd) setSize(String(draft.sugestaoUsd));
  };
  const onSize = (text: string) => {
    setSize(text);
    // a size that changed is not the size that was reviewed
    setReview(null);
    setTyped("");
  };

  const account = wallet.snapshot.account !== null && wallet.snapshot.status !== "disconnected" ? wallet.snapshot.account : null;
  const connected = account !== null && /^0x[0-9a-fA-F]{40}$/.test(account);

  const runReview = useCallback(async (): Promise<void> => {
    if (draft === null || plan === null || !plan.quotable || account === null || !connected) return;
    const coin = plan.pay[payIndex] ?? plan.pay[0];
    const current = sharedTradeSettings().get();
    if (coin === undefined) return;
    const selling = draft.acao === "sell";
    const run = guard.current.begin();
    setPhase("reviewing");
    setReview(null);
    // a confirmation typed for a quote that is gone does not carry over to the new one
    setTyped("");
    setRouterTyped("");
    setSpenderTyped("");
    setNotice(null);
    try {
      let amountMinor: string | null;
      let tokenDecimals: number | null = null;
      let held: string | null = null;
      if (selling) {
        // the balance is read from the token itself, now: what is given is a share of what is really there
        if (provider === null) {
          setNotice("A carteira nao respondeu. Conecte e tente de novo");
          return;
        }
        const holding = await readHolding(provider, draft.tokenAddress, account);
        if (!run.isCurrent()) return;
        if (holding === null) {
          setNotice("Nao foi possivel ler o saldo deste token na carteira. Nada foi pedido");
          return;
        }
        amountMinor = fractionOf(holding.balance, fraction);
        if (amountMinor === null) {
          setNotice("A carteira nao tem este token para trocar");
          return;
        }
        tokenDecimals = holding.decimals;
        held = formatMinor(holding.balance.toString(), holding.decimals);
      } else {
        amountMinor = toMinorUnits(size, coin.decimals);
        if (amountMinor === null) {
          setNotice("Digite um tamanho valido, com no maximo as casas da moeda");
          return;
        }
        // the decimals of the token that comes in are read from the token itself: the amounts on the screen and the value of the order do not depend on what the provider says they are
        if (provider === null) {
          setNotice("A carteira nao respondeu. Conecte e tente de novo");
          return;
        }
        tokenDecimals = await readDecimals(provider, draft.tokenAddress);
        if (!run.isCurrent()) return;
        if (tokenDecimals === null) {
          setNotice("Nao foi possivel ler as casas decimais deste token. Nada foi pedido");
          return;
        }
      }
      const fromToken = selling ? draft.tokenAddress : coin.contract;
      const toToken = selling ? coin.contract : draft.tokenAddress;
      const swapResult = await client.swap({ chainIndex: draft.chainIndex, amount: amountMinor, fromToken, toToken, slippagePct: current.slippagePct, account }, run.signal);
      if (!run.isCurrent()) return;
      const fetchedAtMs = Date.now();
      if (!swapResult.ok) {
        setNotice(tradeErrorText(swapResult.error));
        return;
      }
      // the Trade API of the trial answers one request a second
      await new Promise((resolve) => setTimeout(resolve, LADDER_GAP_MS));
      if (!run.isCurrent()) return;
      const approveResult = await client.approve({ chainIndex: draft.chainIndex, token: fromToken, amount: amountMinor }, run.signal);
      if (!run.isCurrent()) return;
      if (!approveResult.ok) {
        setNotice(`Nao foi possivel conferir a aprovacao do token. ${tradeErrorText(approveResult.error)}`);
        return;
      }
      const allowance = provider === null ? null : await readAllowance(provider, fromToken, account, approveResult.data.spender);
      if (!run.isCurrent()) return;
      const route = swapResult.data.route;
      // the name of the token comes from the draft the Inonu made, or from the end of its address: never from the provider's answer, because a name decides what the person types and what is read as money
      const tokenSymbol = plainSymbol(draft.tokenSymbol) ?? draft.tokenAddress.slice(-4).toUpperCase();
      const tokenDecimalsOut = tokenDecimals ?? 18;
      const order: Order = {
        // the coin to pay or to receive is always one of the dollar coins of the registry of the network: it is the structure of the order that says so
        dollarSide: selling ? "to" : "from",
        chainIndex: draft.chainIndex,
        chainIdHex: plan.chain?.chainIdHex ?? "",
        side: selling ? "sell" : "buy",
        from: selling ? { address: draft.tokenAddress, symbol: tokenSymbol, decimals: tokenDecimalsOut } : { address: coin.contract, symbol: coin.symbol, decimals: coin.decimals },
        to: selling ? { address: coin.contract, symbol: coin.symbol, decimals: coin.decimals } : { address: draft.tokenAddress, symbol: tokenSymbol, decimals: tokenDecimalsOut },
        amountMinor,
        account: account.toLowerCase(),
        slippagePct: current.slippagePct,
        briefHash: draft.briefHash,
      };
      // not knowing the allowance is the safe side: the approval is asked for
      const needsApproval = allowance === null || allowance < BigInt(amountMinor);
      setReview({ order, swap: swapResult.data, approval: approveResult.data, needsApproval, fetchedAtMs, held });
    } finally {
      if (run.isCurrent()) {
        guard.current.release(run);
        setPhase("idle");
      }
    }
  }, [account, client, connected, draft, fraction, payIndex, plan, provider, size]);

  const gateNow = useCallback(
    (at: number): GateResult | null => {
      if (review === null) return null;
      return evaluateGate({
        settings: sharedTradeSettings().get(),
        nowMs: at,
        spentLast24hUsd: spentLast24hUsd(sharedTradeLog().list(), at),
        logDurable: sharedTradeLog().durable,
        order: review.order,
        step: review.needsApproval ? "approve" : "swap",
        swap: review.swap,
        swapFetchedAtMs: review.fetchedAtMs,
        approval: review.needsApproval ? review.approval : null,
        wallet: { account, chainIdHex: wallet.snapshot.chainId },
        typed,
      });
    },
    [account, review, typed, wallet.snapshot.chainId],
  );
  // the gate on screen follows the clock, so the age of the quote blocks the button by itself; the one that decides is made again at the click
  const gate = useMemo(() => (nowMs === 0 ? null : gateNow(nowMs)), [gateNow, nowMs]);

  const onSend = async (): Promise<void> => {
    if (provider === null || review === null || phase !== "idle") return;
    const at = Date.now();
    const verdict = gateNow(at);
    if (verdict === null || !verdict.ok) {
      setNotice("A conferencia mudou e a ordem nao foi enviada. Veja os motivos abaixo");
      return;
    }
    const step = verdict.cleared.step;
    const myKey = keyRef.current;
    setPhase("sending");
    setNotice(null);
    let out: Awaited<ReturnType<typeof sendCleared>>;
    try {
      out = await sendCleared(provider, verdict.cleared, { log: sharedTradeLog(), nowMs: Date.now, settings: () => sharedTradeSettings().get(), spent24h: () => spentLast24hUsd(sharedTradeLog().list(), Date.now()) });
    } catch {
      // something broke inside the send: nothing is known about the wallet, so nothing is claimed; the attempt, if it was written, stays open in the log
      if (alive.current) {
        setNotice("O envio falhou por dentro do app. Confira a carteira antes de tentar de novo: se houver uma janela aberta, a ordem segue contada no seu teto do dia");
        setPhase("idle");
      }
      return;
    }
    if (!alive.current) return;
    if (keyRef.current !== myKey) {
      // the draft changed while the wallet was answering: the log has the attempt, and this screen belongs to another order
      if (out.ok) void awaitReceipt(provider, out.txHash, { log: sharedTradeLog() });
      return;
    }
    if (!out.ok) {
      setNotice(out.error.text);
      setPhase("idle");
      return;
    }
    setSent({ step, txHash: out.txHash, state: "enviada" });
    setPhase("waiting");
    const result = await awaitReceipt(provider, out.txHash, { log: sharedTradeLog() });
    if (!alive.current || keyRef.current !== myKey) return;
    setSent({ step, txHash: out.txHash, state: result });
    setPhase("idle");
    if (step === "approve" && result === "confirmada") {
      // the approval is in: the swap is asked for again, fresh, and the person clicks once more
      setReview(null);
      setTyped("");
      await runReview();
    } else if (step === "swap") {
      setReview(null);
      setTyped("");
    }
  };

  return (
    <OrderPanelView
      settings={settings}
      draft={draft}
      plan={plan}
      payIndex={payIndex}
      size={size}
      fraction={fraction}
      phase={phase}
      review={review}
      gate={gate}
      typed={typed}
      nowMs={nowMs}
      spent24hUsd={spentLast24hUsd(log, nowMs || Date.now())}
      notice={notice}
      sent={sent}
      log={log}
      connected={connected}
      onPay={onPay}
      onSize={onSize}
      onFraction={(id) => {
        guard.current.invalidate();
        setFraction(id);
        setReview(null);
        setTyped("");
      }}
      onTyped={setTyped}
      onReview={() => void runReview()}
      onSend={() => void onSend()}
      onKill={() => sharedTradeSettings().kill()}
      routerTyped={routerTyped}
      spenderTyped={spenderTyped}
      onRouterTyped={setRouterTyped}
      onSpenderTyped={setSpenderTyped}
      onTrustRouter={() => {
        // the person typed the end of the address they read on the table: only then is the router kept, and only the router
        if (review === null || review.swap.tx.to === null || !sameAddress(routerTyped, review.swap.tx.to)) return;
        if (!sharedTradeSettings().trust(review.order.chainIndex, review.swap.tx.to, null)) setNotice("Nao foi possivel guardar este roteador (a lista da rede esta cheia ou o navegador nao gravou). Nada foi confiado");
        else setRouterTyped("");
        setSettings(sharedTradeSettings().get());
      }}
      onTrustSpender={() => {
        if (review === null || review.approval === null || !sameAddress(spenderTyped, review.approval.spender)) return;
        if (!sharedTradeSettings().trust(review.order.chainIndex, null, review.approval.spender)) setNotice("Nao foi possivel guardar este endereco de aprovacao (a lista da rede esta cheia ou o navegador nao gravou). Nada foi confiado");
        else setSpenderTyped("");
        setSettings(sharedTradeSettings().get());
      }}
      closing={closing}
      onAskClose={setClosing}
      onClosePending={(id) => {
        sharedTradeLog().settle(id, { result: "falhou" });
        setClosing(null);
      }}
      onCancel={() => {
        guard.current.stop();
        setPhase("idle");
      }}
    />
  );
}
