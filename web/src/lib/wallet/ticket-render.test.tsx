// T9.6, WAL-5, WAL-6, AC-WAL-4: the order ticket of the Carteira tab. It only SHOWS: the network and the token the answer of Inonu left, the coin to pay
// with, the size the person types, the limit of impact they set and the ladder of quotes the provider gives. There is no button that sends, no field
// for a key and nothing that prepares a transaction to be signed; what the gateway does not serve yet (the minimum received, the slippage, the approval
// step) is said as unavailable, never filled with a guess. Pure drawing, no network. origin: synthetic_fixture, tests only.
import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import DockWalletTab from "@/components/Desk/Dock/DockWalletTab";
import { TicketPanelView, type TicketPanelViewProps } from "@/components/Desk/Dock/TicketPanel";
import type { UseOkxWalletResult } from "@/lib/useOkxWallet";
import { ladderAmounts, type Quote, type Rung } from "./ladder";
import { draftFromDecision, ticketPlan } from "./ticket";

const TOKEN = "0x4ed4e862860bed51a9570b96d89af5e1b0efefed";
const draft = draftFromDecision({ candidateId: `token:8453:${TOKEN}`, action: "buy", briefHash: "h", symbol: "DEGEN", atMs: 1 })!;
const noop = () => {};
const side = (over: Partial<Quote["toToken"]> = {}): Quote["toToken"] => ({ address: "0xaaa", symbol: "DEGEN", decimals: 18, unitPriceUsd: 0.01, taxRate: 0, isHoneyPot: false, ...over });
const quote = (over: Partial<Quote> = {}): Quote => ({
  chainIndex: "8453", mode: "exactIn", fromAmount: 100_000_000, toAmount: 5000 * 1e18, priceImpactPct: -0.4, estimateGasFee: 120_000, tradeFee: 0.12,
  fromToken: side({ symbol: "USDC", decimals: 6, unitPriceUsd: 1 }), toToken: side(), ...over,
});
const meta = { tier: "basic" as const, cachedAtMs: 1, ageMs: 0, stale: false, budget: { tier: "basic" as const, used: 1, cap: null } };

const props = (over: Partial<TicketPanelViewProps> = {}): TicketPanelViewProps => ({
  draft, plan: ticketPlan(draft), payIndex: 0, size: "", impactLimit: "1", rungs: null, reading: false,
  onPay: noop, onSize: noop, onImpactLimit: noop, onQuote: noop, onCancel: noop, onClear: noop, ...over,
});
const draw = (over: Partial<TicketPanelViewProps> = {}) => renderToStaticMarkup(<TicketPanelView {...props(over)} />);

describe("the empty ticket", () => {
  test("it says how it gets filled and that nothing is sent, and it offers nothing to click", () => {
    const html = draw({ draft: null, plan: null });
    expect(html).toContain('aria-label="Ticket de ordem"');
    expect(html).toContain("Nenhum ticket. Aceite uma resposta do Inonu sobre um token para preencher este ticket");
    expect(html).toContain("Nenhuma ordem e enviada");
    expect(html).not.toContain("<button");
    expect(html).not.toContain("<input");
  });
});

describe("the filled ticket", () => {
  test("the network, the token and the side the model chose, in words, with the address as the provider gave it", () => {
    const html = draw();
    expect(html).toContain("Base");
    expect(html).toContain("DEGEN");
    expect(html).toContain(TOKEN);
    expect(html).toContain("Receber o token");
    expect(draw({ draft: { ...draft, acao: "sell" }, plan: ticketPlan({ ...draft, acao: "sell" }) })).toContain("Entregar o token");
  });

  test("the ticket says how old it is, so a draft of the morning does not read as new at night", () => {
    const html = draw({ nowMs: draft.atMs + 3 * 3_600_000 });
    expect(html).toContain("Preenchido");
    expect(html).toContain("ha 3 h");
    // without a clock there is nothing to compare with, and nothing is said
    expect(draw({ nowMs: undefined })).not.toContain("Preenchido");
  });

  test("the coin to pay with, the size and the limit of impact are typed or chosen by the person; nothing is filled for them", () => {
    const html = draw();
    expect(html).toContain('aria-label="Pagar com"');
    expect(html).toContain(">USDC<");
    expect(html).toContain('aria-label="Tamanho na moeda de pagamento"');
    expect(html).toMatch(/<input[^>]*aria-label="Tamanho na moeda de pagamento"[^>]*value=""/);
    expect(html).toContain('aria-label="Limite de impacto em percentual"');
    expect(html).toMatch(/<input[^>]*aria-label="Limite de impacto em percentual"[^>]*value="1"/);
  });

  test("the quote button waits for a valid size and a valid limit, and says how many reads it spends", () => {
    expect(draw()).toMatch(/<button[^>]*disabled=""[^>]*>Cotar<\/button>/);
    expect(draw({ size: "100" })).toMatch(/<button(?![^>]*disabled)[^>]*>Cotar<\/button>/);
    expect(draw({ size: "1.2345678" })).toMatch(/<button[^>]*disabled=""[^>]*>Cotar<\/button>/);
    expect(draw({ size: "100", impactLimit: "abc" })).toMatch(/<button[^>]*disabled=""[^>]*>Cotar<\/button>/);
    expect(draw({ size: "100", impactLimit: "0" })).toMatch(/<button[^>]*disabled=""[^>]*>Cotar<\/button>/);
    expect(draw({ size: "100" })).toContain("Cotar usa 3 leituras da OKX OnchainOS, uma por segundo");
  });

  test("when Cotar is disabled the screen says what is missing, and says nothing once it can quote", () => {
    const hint = "Para cotar: digite um tamanho valido, com no maximo as casas da moeda, e um limite de impacto maior que 0 e ate 100";
    expect(draw()).toContain(hint);
    expect(draw({ size: "1.2345678" })).toContain(hint);
    expect(draw({ size: "100", impactLimit: "x" })).toContain(hint);
    expect(draw({ size: "100" })).not.toContain(hint);
  });

  test("a quote left on the screen gets old with the clock: after 30 s it says so, without any new read", () => {
    const read: Rung[] = [{ label: "1x", amountMinor: "1", state: "cotado", quote: quote(), meta, receivedAtMs: 1_000_000 }];
    const soon = draw({ size: "100", rungs: read, nowMs: 1_010_000 });
    expect(soon).toContain("ha 10 s");
    expect(soon).not.toContain("cotacao velha");
    const later = draw({ size: "100", rungs: read, nowMs: 1_600_000 });
    expect(later).toContain("ha 10 min");
    expect(later).toContain("cotacao velha");
    expect(later).toContain('data-tom="alerta"');
  });

  test("a quote the gateway served from its cache is marked old, with its age", () => {
    const old = { ...meta, stale: true, ageMs: 187_000 };
    const html = draw({ size: "100", rungs: [{ label: "1x", amountMinor: "1", state: "cotado", quote: quote(), meta: old }] });
    expect(html).toContain("cotacao velha");
    expect(html).toContain("ha 3 min");
    expect(html).toContain('data-tom="alerta"');
  });

  test("while it reads, the button gives way to a cancel, and what is not quoted yet says it is being read", () => {
    const amounts = ladderAmounts("100", 6);
    const rungs: Rung[] = [
      { label: amounts[0]!.label, amountMinor: amounts[0]!.amountMinor, state: "cotado", quote: quote({ fromAmount: 50_000_000 }), meta },
      { label: amounts[1]!.label, amountMinor: amounts[1]!.amountMinor, state: "lendo" },
      { label: amounts[2]!.label, amountMinor: amounts[2]!.amountMinor, state: "lendo" },
    ];
    const html = draw({ size: "100", reading: true, rungs });
    expect(html).toContain(">Cancelar<");
    expect(html).not.toContain(">Cotar<");
    expect(html).toContain("lendo");
  });

  test("the ladder: one row per size with what is paid, what is received, the impact, the fees and the state; a limit that was passed is marked", () => {
    const amounts = ladderAmounts("100", 6);
    const rungs: Rung[] = [
      { label: "0,5x", amountMinor: amounts[0]!.amountMinor, state: "cotado", quote: quote({ fromAmount: 50_000_000, toAmount: 2500 * 1e18, priceImpactPct: -0.2 }), meta },
      { label: "1x", amountMinor: amounts[1]!.amountMinor, state: "cotado", quote: quote(), meta },
      { label: "2x", amountMinor: amounts[2]!.amountMinor, state: "cotado", quote: quote({ fromAmount: 200_000_000, toAmount: 9000 * 1e18, priceImpactPct: -4.1 }), meta },
    ];
    const html = draw({ size: "100", rungs });
    for (const label of ["Tamanho", "Paga", "Recebe", "Impacto", "Gas estimado (menor unidade)", "Taxa da rota (USD)", "Idade", "Estado"]) expect(html).toContain(label);
    expect(html).toContain("ha 0 s");
    expect(html.match(/role="row"/g)?.length).toBe(4);
    expect(html).toContain("100 USDC");
    expect(html).toContain("5.000 DEGEN");
    expect(html).toContain("-4,10%");
    expect(html).toContain("impacto fora do limite");
    expect(html).toContain('data-tom="alerta"');
    expect(html).toContain('data-tom="ok"');
  });

  test("a honeypot blocks the rung and the Trade API trial that ended is said, with nothing to buy a way around it", () => {
    const honey: Rung[] = [{ label: "1x", amountMinor: "1", state: "cotado", quote: quote({ toToken: side({ isHoneyPot: true }) }), meta }];
    expect(draw({ size: "100", rungs: honey })).toContain("bloqueada: honeypot");
    const ended: Rung[] = [{ label: "0,5x", amountMinor: "1", state: "erro", error: "provider_payment_required" }, { label: "1x", amountMinor: "1", state: "nao_pedido" }];
    const html = draw({ size: "100", rungs: ended });
    expect(html).toContain("A Trade API recusou: a cota gratuita ou o periodo de teste acabou");
    expect(html).toContain("nao pedida");
    expect(html).toContain("O sistema nao paga");
  });

  test("the ticket only shows quotes: it says it sends nothing, and that the minimum, the tolerance and the approval are in the order panel below", () => {
    const html = draw();
    expect(html).toContain("Minimo recebido, tolerancia de preco e etapa de aprovacao aparecem ao revisar a ordem");
    expect(html).toContain("Ordem pela minha carteira");
    expect(html).toContain("Nada e enviado a partir daqui: este ticket so mostra cotacoes");
  });

  test("a ticket that cannot be quoted says why, and offers no size to type", () => {
    const sell = { ...draft, acao: "sell" as const };
    const html = draw({ draft: sell, plan: ticketPlan(sell) });
    expect(html).toContain("A troca do token por dolar e conferida e enviada no painel Ordem pela minha carteira");
    expect(html).not.toContain('aria-label="Tamanho na moeda de pagamento"');
    const solana = draftFromDecision({ candidateId: "token:501:So11111111111111111111111111111111111111112", action: "buy", briefHash: null, symbol: null, atMs: 1 })!;
    const other = draw({ draft: solana, plan: ticketPlan(solana) });
    expect(other).toContain("O app ainda nao tem uma moeda de pagamento conhecida para esta rede");
    expect(other).toContain("Rede 501, fora da lista do app");
  });

  test("the ticket can be cleared, and that is the only thing besides quoting that it does", () => {
    const html = draw({ size: "100" });
    expect(html).toContain(">Limpar ticket<");
    const labels = [...html.matchAll(/<button[^>]*>([^<]*)<\/button>/g)].map((m) => m[1]);
    expect(labels.sort()).toEqual(["Cotar", "Limpar ticket"]);
  });
});

describe("rules of the interface", () => {
  test("plain ASCII, no middle dot, em dash or en dash, nothing that blinks, in every state", () => {
    const amounts = ladderAmounts("100", 6);
    const states = [
      draw({ draft: null, plan: null }),
      draw(),
      draw({ size: "100", reading: true, rungs: amounts.map((a) => ({ label: a.label, amountMinor: a.amountMinor, state: "lendo" as const })) }),
      draw({ size: "100", rungs: [{ label: "1x", amountMinor: "1", state: "cotado", quote: quote({ priceImpactPct: -9, toToken: side({ taxRate: 0.1 }) }), meta }] }),
      draw({ size: "100", rungs: [{ label: "1x", amountMinor: "1", state: "erro", error: "network" }] }),
    ];
    for (const html of states) {
      const text = html.replace(/<[^>]*>/g, " ");
      expect(/^[\x20-\x7e\s]*$/.test(text)).toBe(true);
      expect(html).not.toMatch(/animation|blink|pulse/i);
    }
  });

  test("no word of an order on the screen, and no way to send: no field for a key, no signing, no send button", () => {
    const amounts = ladderAmounts("100", 6);
    const rungs: Rung[] = [{ label: "1x", amountMinor: amounts[1]!.amountMinor, state: "cotado", quote: quote(), meta }];
    const html = draw({ size: "100", rungs });
    const text = html.replace(/<[^>]*>/g, " ");
    for (const word of ["comprar", "compre", "vender", "venda", "buy", "sell", "hold", "action", "signal", "recommend", "vote", "sinal"]) expect(new RegExp(`\\b${word}\\b`, "i").test(text)).toBe(false);
    expect(html).not.toMatch(/type="password"|assinar e enviar|enviar pela|confirmar ordem/i);
  });
});

describe("the Carteira tab", () => {
  test("the ticket is part of the on-screen copy of the tab, with the switch, and the other copy holds neither", () => {
    const wallet = {} as UseOkxWalletResult;
    const names = (withSwitch: boolean) => JSON.stringify(DockWalletTab({ wallet, withSwitch }), (key, value) => (key === "type" && typeof value === "function" ? value.name : value));
    expect(names(true)).toContain("TicketPanel");
    expect(names(false)).not.toContain("TicketPanel");
  });
});
