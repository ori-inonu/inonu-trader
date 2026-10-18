// The order panel of the Carteira tab and the Settings section of the orders, drawn: every state without a wallet, a server or a provider. The panel shows; the only way to the wallet is the button, and it is off until
// the gate finds no reason. origin: synthetic_fixture, tests only.
import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { OrderPanelView, type OrderPanelViewProps, type Review } from "@/components/Desk/Dock/OrderPanel";
import { TradeSettingsPanel } from "@/components/Settings/TradeSettings";
import { draftFromDecision, ticketPlan } from "../ticket";
import { orderPlan } from "./sell";
import { evaluateGate } from "./gate";
import { DEFAULT_TRADE_SETTINGS, type TradeSettings } from "./settings";
import { ACCOUNT, HASH_A, NOW, ROUTER, SPENDER, TOKEN, USDC, approval, approveData, order, settingsOn, swap } from "./fixtures";

const FORBIDDEN = new RegExp(`[${String.fromCharCode(0xb7, 0x2014, 0x2013)}]`);
const noop = () => {};
const plain = (html: string) => html.replace(/ class="[^"]*"/g, "");

const draft = draftFromDecision({ candidateId: `token:8453:${TOKEN}`, action: "buy", briefHash: "abc123", symbol: "AAA", atMs: NOW - 60_000, suggestUsd: 100 })!;
const plan = ticketPlan(draft);
const review = (over: Partial<Review> = {}): Review => ({ order: order(), swap: swap(), approval: approval(), needsApproval: false, fetchedAtMs: NOW - 5_000, ...over });

function props(over: Partial<OrderPanelViewProps> = {}): OrderPanelViewProps {
  const settings = over.settings ?? settingsOn();
  const rv = over.review === undefined ? null : over.review;
  const typed = over.typed ?? "";
  const gate = rv === null ? null : evaluateGate({
    settings, nowMs: NOW, spentLast24hUsd: 0, logDurable: true, order: rv.order, step: rv.needsApproval ? "approve" : "swap", swap: rv.swap, swapFetchedAtMs: rv.fetchedAtMs, approval: rv.needsApproval ? rv.approval : null,
    wallet: { account: ACCOUNT, chainIdHex: "0x2105" }, typed,
  });
  return {
    settings, draft, plan, payIndex: 0, size: "100", fraction: "metade", phase: "idle", review: rv, gate, typed, nowMs: NOW, spent24hUsd: 30, notice: null, sent: null, log: [], connected: true,
    onPay: noop, onSize: noop, onFraction: noop, onTyped: noop, onReview: noop, onSend: noop, onKill: noop, onCancel: noop, routerTyped: "", spenderTyped: "", onRouterTyped: noop, onSpenderTyped: noop, onTrustRouter: noop, onTrustSpender: noop, onClosePending: noop, closing: null, onAskClose: noop, ...over,
  };
}
const draw = (over: Partial<OrderPanelViewProps> = {}) => plain(renderToStaticMarkup(<OrderPanelView {...props(over)} />));

describe("when the option is off or stopped", () => {
  test("off: it says so, offers the way to Configuracoes, and has no field and no button that could open the wallet", () => {
    const html = draw({ settings: DEFAULT_TRADE_SETTINGS });
    expect(html).toContain("Desligado");
    expect(html).toContain("O envio pela carteira esta desligado");
    expect(html).toContain('<a href="/configuracoes">Ajustar em Configuracoes</a>');
    expect(html).not.toContain("<input");
    expect(html).not.toContain("Enviar pela minha carteira</button>");
    expect(html).not.toContain("Parar tudo</button>");
  });

  test("stopped: the stop stays until the person turns it back on, and it says how", () => {
    const html = draw({ settings: settingsOn({ killed: true }) });
    expect(html).toContain("Parado");
    expect(html).toContain("Parar tudo e so volta quando voce religar".replace("Parar tudo", "Parar tudo"));
    expect(html).not.toContain("<input");
  });
});

describe("when it is on", () => {
  test("with no order prepared it says how to prepare one", () => {
    const html = draw({ draft: null, plan: null });
    expect(html).toContain("Nenhuma ordem montada");
    expect(html).toContain("Preparar compra");
    expect(html).toContain("Parar tudo</button>");
  });

  test("an order the ticket cannot quote says why and offers nothing to type", () => {
    const html = draw({ plan: { ...plan, quotable: false, reason: "O app ainda nao tem uma moeda de pagamento conhecida para esta rede" } });
    expect(html).toContain("O app ainda nao tem uma moeda de pagamento conhecida para esta rede");
    expect(html).not.toContain("<input");
  });

  test("before the review: the token, the Inonu size, the coin and the size to type, the caps and what Revisar does", () => {
    const html = draw();
    expect(html).toContain("Ligado");
    expect(html).toContain("AAA 0xaaaa000000000000000000000000000000000001");
    expect(html).toContain("US$ 100, calculado pelo seu saldo");
    expect(html).toContain('aria-label="Pagar com"');
    expect(html).toContain('aria-label="Tamanho da ordem na moeda de pagamento"');
    expect(html).toContain("US$ 200 por ordem, US$ 500 por dia, e ja foram US$ 30 nas ultimas 24 horas");
    expect(html).toMatch(/<button[^>]*>Revisar ordem/);
    expect(html).not.toMatch(/<button[^>]*disabled=""[^>]*>Revisar ordem/);
    expect(html).not.toContain("Digite AAA");
  });

  test("without a connected wallet the review is off and the screen says why", () => {
    const html = draw({ connected: false });
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Revisar ordem/);
    expect(html).toContain("Conecte a carteira para revisar a ordem");
  });

  test("while it reviews: the state, the cancel and no way to change the order", () => {
    const html = draw({ phase: "reviewing" });
    expect(html).toContain("Buscando a transacao");
    expect(html).toContain(">Cancelar<");
    expect(html).toMatch(/<input[^>]*aria-label="Tamanho da ordem[^>]*disabled=""/);
  });
});

describe("the review", () => {
  test("an order in order: the conference says what goes out, what comes in, the minimum, the impact, the route, the token and the steps", () => {
    const html = draw({ review: review() });
    expect(html).toContain("Voce da");
    expect(html).toContain("100 USDC (US$ 100)");
    expect(html).toContain("250 AAA");
    expect(html).toContain("Minimo recebido");
    expect(html).toContain("247.5 AAA");
    expect(html).toContain("Impacto no preco");
    expect(html).toContain("0,12%");
    expect(html).toContain("Uniswap V3");
    expect(html).toContain("nao");
    expect(html).toContain("1: trocar");
    expect(html).toContain("ha 5 s (vale 30 s)");
    expect(html).not.toContain("O que impede o envio");
  });

  test("the button is off until the symbol is typed, and on when it is", () => {
    expect(draw({ review: review(), typed: "" })).toMatch(/<button[^>]*disabled=""[^>]*>Enviar pela minha carteira/);
    expect(draw({ review: review(), typed: "AAA" })).not.toMatch(/<button[^>]*disabled=""[^>]*>Enviar pela minha carteira/);
    expect(draw({ review: review(), typed: "AAA" })).toContain('aria-label="Digite AAA para confirmar"');
  });

  test("a reason against the order is listed and the button stays off even with the symbol typed", () => {
    const html = draw({ review: review({ swap: swap({ route: { priceImpactPct: 7 } }) }), typed: "AAA" });
    expect(html).toContain("O que impede o envio");
    expect(html).toContain("O impacto no preco e 7%, acima do seu limite de 1%");
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Enviar pela minha carteira/);
  });

  test("the conference shows the address the swap goes to, the function it calls and, when it needs one, the address that would be given the approval and for how much", () => {
    const html = draw({ review: review({ needsApproval: true }), typed: "AAA" });
    expect(html).toContain("Roteador da troca");
    expect(html).toContain(ROUTER);
    expect(html).toContain("Funcao chamada");
    expect(html).toContain("0x12aa3caf");
    expect(html).toContain("Aprovacao dada a");
    expect(html).toContain(`${SPENDER}, so de 100 USDC`);
    expect(draw({ review: review(), typed: "AAA" })).not.toContain("Aprovacao dada a");
  });

  test("a router the person has not confirmed on this network stops the order and offers the one thing that fixes it, with the way to check it", () => {
    const html = draw({ settings: settingsOn({ trustedRouters: {}, trustedSpenders: {} }), review: review(), typed: "AAA" });
    expect(html).toContain("O roteador desta transacao ainda nao foi confirmado por voce nesta rede");
    expect(html).toContain("Confiar neste roteador nesta rede");
    expect(html).toContain("web3.okx.com");
    // the address is written in the prompt, and the person types its last six characters before the button is on
    expect(html).toContain(ROUTER);
    expect(html).toContain("Cole o endereco INTEIRO abaixo");
    expect(html).toContain("Cole o endereco inteiro do roteador");
    // the prompt does not print the answer in the label of the field, and offers the page of the address on the explorer of the network
    expect(html).not.toContain("Digite os 6 ultimos");
    expect(html).toContain(`href="https://basescan.org/address/${ROUTER}"`);
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Confiar neste roteador nesta rede/);
    const withRouter = (typed: string) => plain(renderToStaticMarkup(<OrderPanelView {...props({ settings: settingsOn({ trustedRouters: {}, trustedSpenders: {} }), review: review(), typed: "AAA", routerTyped: typed })} />));
    // only the WHOLE address turns the button on, with any case and spaces around; a part of it, or the end of it, does not
    expect(withRouter(ROUTER)).not.toMatch(/<button[^>]*disabled=""[^>]*>Confiar neste roteador nesta rede/);
    expect(withRouter(`  ${ROUTER.toUpperCase().replace("0X", "0x")}  `)).not.toMatch(/<button[^>]*disabled=""[^>]*>Confiar neste roteador nesta rede/);
    expect(withRouter(ROUTER.slice(0, 30))).toMatch(/<button[^>]*disabled=""[^>]*>Confiar neste roteador nesta rede/);
    expect(withRouter(ROUTER.slice(-6))).toMatch(/<button[^>]*disabled=""[^>]*>Confiar neste roteador nesta rede/);
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Enviar pela minha carteira/);
    // with the router confirmed there is no offer
    expect(draw({ review: review(), typed: "AAA" })).not.toContain("Confiar neste roteador");
  });

  test("the approval address has its OWN prompt, separate from the router, with its own typed check", () => {
    const html = draw({ settings: settingsOn({ trustedSpenders: {} }), review: review({ needsApproval: true }), typed: "AAA" });
    expect(html).toContain("O endereco que receberia a aprovacao ainda nao foi confirmado por voce nesta rede");
    expect(html).toContain("Confiar neste endereco de aprovacao");
    expect(html).toContain("Cole o endereco inteiro da aprovacao");
    expect(html).toContain(`href="https://basescan.org/address/${SPENDER}"`);
    expect(html).not.toContain("Digite os 6 ultimos");
    // the router is trusted here, so there is no router prompt
    expect(html).not.toContain("Confiar neste roteador");
    expect(draw({ review: review({ needsApproval: true }), typed: "AAA" })).not.toContain("Confiar neste endereco de aprovacao");
  });

  test("the conference puts the price of one token in this order beside the other numbers, so a lowball answer shows", () => {
    const html = draw({ review: review(), typed: "AAA" });
    expect(html).toContain("Preco por AAA nesta ordem");
    expect(html).toContain("US$ 0,400000");
  });

  test("an attempt that stayed open can be closed by the person after looking in the wallet, and the history opens by itself when there is one", () => {
    const open = { id: "cccccccccccc", atMs: NOW - 120_000, chainIndex: "8453", side: "buy" as const, step: "swap" as const, symbol: "AAA", usd: 100, txHash: null, result: "pendente" as const, briefHash: null };
    const html = draw({ log: [open] });
    expect(html).toContain("Aberta na carteira: responda la. Enquanto isso ela conta no seu teto do dia");
    expect(html).toContain("Conferi na carteira: nao ha janela aberta");
    expect(html).toMatch(/<details open=""/);
    expect(draw({ log: [{ ...open, result: "enviada" }] })).not.toContain("Conferi na carteira");
  });

  test("closing an open attempt takes two steps and is not offered in the first thirty seconds: a window just opened is not one to close with a fast click", () => {
    const open = { id: "cccccccccccc", atMs: NOW - 120_000, chainIndex: "8453", side: "buy" as const, step: "swap" as const, symbol: "AAA", usd: 100, txHash: null, result: "pendente" as const, briefHash: null };
    const recent = draw({ log: [{ ...open, atMs: NOW - 5_000 }] });
    expect(recent).toContain("Espere 30 s antes de poder fechar esta tentativa");
    expect(recent).not.toContain("Conferi na carteira");
    const asking = draw({ log: [open], closing: "cccccccccccc" });
    expect(asking).toContain("Confirma que NAO ha janela aberta na carteira para esta ordem?");
    expect(asking).toContain("Sim, fechar");
    expect(asking).toContain(">Voltar<");
    // only the attempt that is being closed asks
    expect(draw({ log: [open], closing: "dddddddddddd" })).toContain("Conferi na carteira: nao ha janela aberta");
  });

  test("an open attempt older than the last five is still listed, because it counts against the day and has to be seen to be closed", () => {
    const entry = (n: number, result: "pendente" | "confirmada") => ({ id: `e${String(n).padStart(11, "0")}`, atMs: NOW - 3_600_000 + n * 1_000, chainIndex: "8453", side: "buy" as const, step: "swap" as const, symbol: `T${n}`, usd: 10, txHash: null, result, briefHash: null });
    const html = draw({ log: [entry(0, "pendente"), ...[1, 2, 3, 4, 5, 6].map((n) => entry(n, "confirmada"))] });
    expect(html).toContain("compra de T0");
    expect(html).toContain("compra de T6");
    expect(html).not.toContain("compra de T1 ");
  });

  test("when the coin is USDT and the approval is the step, the note about zeroing a previous approval is shown", () => {
    const usdt = order({ from: { address: USDC, symbol: "USDT", decimals: 6 } });
    const html = draw({ review: review({ order: usdt, needsApproval: true }), typed: "AAA" });
    expect(html).toContain("pode exigir zerar a aprovacao anterior");
    expect(draw({ review: review({ needsApproval: true }), typed: "AAA" })).not.toContain("pode exigir zerar");
  });

  test("a token the provider marks as a trap is shown in capitals and blocks", () => {
    const html = draw({ review: review({ swap: swap({ route: { toToken: { address: TOKEN, symbol: "AAA", decimals: 18, unitPriceUsd: 0.4, taxRate: 0, isHoneyPot: true } } }) }), typed: "AAA" });
    expect(html).toContain("SIM");
    expect(html).toContain("AAA esta marcado como honeypot");
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Enviar pela minha carteira/);
  });

  test("when the coin still needs the approval the first step is the approval, said as two steps", () => {
    const html = draw({ review: review({ needsApproval: true }), typed: "AAA" });
    expect(html).toContain("2: aprovar USDC para o roteador, depois trocar");
    expect(html).toMatch(/<button[^>]*>Aprovar USDC pela minha carteira/);
    expect(html).not.toMatch(/<button[^>]*disabled=""[^>]*>Aprovar USDC pela minha carteira/);
  });

  test("an old quote is stopped by the clock", () => {
    const html = draw({ review: review({ fetchedAtMs: NOW - 31_000 }), typed: "AAA" });
    expect(html).toContain("A cotacao tem mais de 30 s");
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Enviar pela minha carteira/);
  });
});

describe("after the click", () => {
  test("sending and waiting lock the form, and the result is said with the short hash", () => {
    const html = draw({ review: review(), typed: "AAA", phase: "waiting", sent: { step: "swap", txHash: HASH_A, state: "enviada" } });
    expect(html).toContain("Troca 0xa1a1a1a1...a1a1a1: Enviada, esperando a rede confirmar");
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Enviar pela minha carteira/);
    for (const state of ["confirmada", "revertida", "sem_recibo"] as const) {
      expect(draw({ sent: { step: "approve", txHash: HASH_A, state } })).toContain("Aprovacao 0xa1a1a1a1...a1a1a1:");
    }
    expect(draw({ sent: { step: "swap", txHash: HASH_A, state: "revertida" } })).toContain("nada foi trocado e a taxa de rede foi paga");
  });

  test("a notice from the wallet is shown as it is said by the app, never as the wallet wrote it", () => {
    expect(draw({ notice: "Voce recusou o pedido na carteira. Nada foi alterado" })).toContain("Voce recusou o pedido na carteira. Nada foi alterado");
  });

  test("the last orders of this computer are listed, newest first, with what each one cost", () => {
    const html = draw({ log: [
      { id: "aaaaaaaaaaaa", atMs: NOW - 3_600_000, chainIndex: "8453", side: "buy", step: "approve", symbol: "USDC", usd: null, txHash: HASH_A, result: "confirmada", briefHash: null },
      { id: "bbbbbbbbbbbb", atMs: NOW - 60_000, chainIndex: "8453", side: "buy", step: "swap", symbol: "AAA", usd: 100, txHash: HASH_A, result: "enviada", briefHash: null },
    ] });
    expect(html).toContain("Ultimas ordens deste computador");
    expect(html.indexOf("compra de AAA")).toBeLessThan(html.indexOf("aprovacao de USDC"));
    expect(html).toContain("ha 1 min: compra de AAA (US$ 100), Enviada, esperando a rede confirmar");
  });
});

describe("a sale", () => {
  const sellDraft = draftFromDecision({ candidateId: `token:8453:${TOKEN}`, action: "sell", briefHash: "abc123", symbol: "AAA", atMs: NOW - 60_000 })!;
  const sellPlan = orderPlan(sellDraft, ticketPlan(sellDraft));
  const sellOrder = order({ dollarSide: "to", side: "sell", from: { address: TOKEN, symbol: "AAA", decimals: 18 }, to: { address: USDC, symbol: "USDC", decimals: 6 }, amountMinor: "250000000000000000000" });
  const sellSwap = swap({
    route: {
      fromAmount: "250000000000000000000", toAmount: "100000000",
      fromToken: { address: TOKEN, symbol: "AAA", decimals: 18, unitPriceUsd: 0.4, taxRate: 0, isHoneyPot: false }, toToken: { address: USDC, symbol: "USDC", decimals: 6, unitPriceUsd: 1, taxRate: 0, isHoneyPot: false },
    },
    tx: { minReceiveAmount: "99000000" },
  });

  test("it asks how much of what the wallet holds is given and in which dollar coin it is received, and has no size to type", () => {
    const html = draw({ draft: sellDraft, plan: sellPlan });
    expect(html).toContain("Entregar o token e receber em dolar");
    expect(html).toContain('aria-label="Receber em"');
    expect(html).toContain('aria-label="Quanto trocar do saldo do token"');
    for (const label of ["Um terco", "Metade", "Dois tercos", "Tudo"]) expect(html).toContain(`>${label}<`);
    expect(html).toMatch(/<option value="metade" selected="">Metade/);
    expect(html).not.toContain('aria-label="Tamanho da ordem');
    expect(html).toMatch(/<button[^>]*>Revisar ordem/);
  });

  test("the review shows what the wallet held, the share given, and the symbol to type is the token that is given", () => {
    const html = draw({ draft: sellDraft, plan: sellPlan, review: review({ order: sellOrder, swap: sellSwap, held: "500" }), typed: "AAA" });
    expect(html).toContain("Saldo do token na carteira");
    expect(html).toContain("500 AAA");
    expect(html).toContain("250 AAA (US$ 100)");
    expect(html).toContain("100 USDC");
    expect(html).toContain('aria-label="Digite AAA para confirmar"');
    expect(html).not.toMatch(/<button[^>]*disabled=""[^>]*>Enviar pela minha carteira/);
  });

  test("when the token to give needs the approval the button says which token is approved", () => {
    const html = draw({ draft: sellDraft, plan: sellPlan, review: review({ order: sellOrder, swap: sellSwap, needsApproval: true, approval: approval({ data: approveData(SPENDER, BigInt("250000000000000000000")) }) }), typed: "AAA" });
    expect(html).toContain("Aprovar AAA pela minha carteira");
  });

  test("a token the network has no plan for says why", () => {
    const html = draw({ draft: { ...sellDraft, chainIndex: "999" }, plan: orderPlan({ ...sellDraft, chainIndex: "999" }, ticketPlan({ ...sellDraft, chainIndex: "999" })) });
    expect(html).toContain("O app ainda nao tem uma moeda para receber conhecida para esta rede");
    expect(html).not.toContain("<select");
  });
});

describe("the words on the screen", () => {
  test("no middle dot, em dash or en dash, and no order word the code writes, in any state", () => {
    const states = [
      draw({ settings: DEFAULT_TRADE_SETTINGS }), draw({ settings: settingsOn({ killed: true }) }), draw(), draw({ review: review(), typed: "AAA" }), draw({ review: review({ needsApproval: true }) }),
      draw({ review: review({ swap: swap({ route: { priceImpactPct: 9 } }) }) }), draw({ draft: null, plan: null }), draw({ sent: { step: "swap", txHash: HASH_A, state: "sem_recibo" } }),
    ];
    for (const html of states) {
      const text = html.replace(/<[^>]+>/g, " ");
      expect(FORBIDDEN.test(text)).toBe(false);
      expect(text.toLowerCase()).not.toMatch(/\b(comprar|compre|vender|venda|sinal|sinais|recomend\w*|aconselh\w*|garant\w*)\b/);
      expect(html).not.toMatch(/animation|blink|pulse/i);
    }
  });
});

describe("the Settings section", () => {
  const draw2 = (settings: TradeSettings, saved: string | null = null) => plain(renderToStaticMarkup(<TradeSettingsPanel settings={settings} saved={saved} onSave={() => true} onKill={noop} onUntrust={noop} />));

  test("it starts OFF and unchecked, with no cap, and says that without both caps nothing is sent", () => {
    const html = draw2(DEFAULT_TRADE_SETTINGS);
    expect(html).toContain("Enviar pela minha carteira");
    expect(html).toContain("DESLIGADO");
    expect(html).toMatch(/<input type="checkbox"(?![^>]*checked)[^>]*\/?>/);
    expect(html).toContain("Sem os dois tetos nada e enviado");
    expect(html).not.toContain("Parar tudo agora");
  });

  test("on, it shows the caps and the stop; stopped, it shows the way back", () => {
    const on = draw2(settingsOn());
    expect(on).toContain("LIGADO");
    expect(on).toContain('value="200"');
    expect(on).toContain('value="500"');
    expect(on).toContain("Parar tudo agora");
    const stopped = draw2(settingsOn({ killed: true }));
    expect(stopped).toContain("PARADO");
    expect(stopped).toContain("Religar o envio");
  });

  test("the routers the person confirmed are listed by network, with the way to take one back", () => {
    const none = draw2(settingsOn({ trustedRouters: {}, trustedSpenders: {} }));
    expect(none).toContain("Roteadores confirmados");
    expect(none).toContain("Nenhum ainda");
    const some = draw2(settingsOn());
    expect(some).toContain(ROUTER);
    expect(some).toContain(SPENDER);
    expect(some).toContain("Remover");
  });

  test("it tells the person what is at stake in plain words", () => {
    const html = draw2(DEFAULT_TRADE_SETTINGS);
    expect(html).toContain("O app nunca guarda a sua chave");
    expect(html).toContain("o servidor nunca envia nada");
    expect(html).toContain("saques e");
    expect(html).toContain("dinheiro de verdade");
    expect(FORBIDDEN.test(html.replace(/<[^>]+>/g, " "))).toBe(false);
    expect(USDC.length).toBe(42);
  });
});
