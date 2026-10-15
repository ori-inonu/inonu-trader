// WAL-4, ASK: "O que fazer com a minha carteira". The Inonu looks at one network of the reading and decides holding by holding; it is asked by one button, after a consent
// that says what is sent. Pure drawing, no network. origin: synthetic_fixture, tests only.
import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { HoldingsConsultView, type HoldingsConsultViewProps } from "@/components/Desk/Dock/HoldingsConsult";
import type { AskAnswer } from "@/lib/inonu/client";
import type { PortfolioAnswer } from "@/lib/inonu/portfolio";
import { prepareConsult } from "./holdings-consult";
import type { BalanceRow } from "./holdings";

const USDC = "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48";
const row = (over: Partial<BalanceRow> = {}): BalanceRow => ({ chainIndex: "8453", symbol: "ETH", tokenAddress: null, balance: 0.5, priceUsd: 3000, valueUsd: 1500, flaggedRisk: false, ...over });
const rows = [row(), row({ symbol: "USDC", tokenAddress: USDC, balance: 40, valueUsd: 40 }), row({ chainIndex: "1", symbol: "ETH", valueUsd: 6000 }), row({ chainIndex: "56", symbol: "BNB", valueUsd: null, priceUsd: null })];
const noop = () => {};
const OBSERVED = 100_000;

const props = (over: Partial<HoldingsConsultViewProps> = {}): HoldingsConsultViewProps => ({
  networks: [{ chainIndex: "1", count: 1, valueUsd: 6000 }, { chainIndex: "8453", count: 2, valueUsd: 1540 }, { chainIndex: "56", count: 1, valueUsd: null }],
  chainIndex: "8453", prepared: prepareConsult(rows, "8453", OBSERVED, OBSERVED + 5_000), ageSeconds: 5, consent: false, busy: false, answer: null, note: null,
  onChain: noop, onConsent: noop, onAsk: noop, onCancel: noop, ...over,
});
const draw = (over: Partial<HoldingsConsultViewProps> = {}) => renderToStaticMarkup(<HoldingsConsultView {...props(over)} />);

const answer = (assets: Array<{ symbol: string; action: "buy" | "hold" | "sell" | "abstain"; balance: string | null; flow?: number | null; risk?: string | null; gaps?: string[] }>): AskAnswer => {
  const carteira: PortfolioAnswer = {
    chainIndex: "8453", observedAtMs: OBSERVED, coverage: "partial", profile: "conservative_no_leverage", netWorthUsd: null, positionsEmpty: false,
    assets: assets.map((a, i) => ({
      contract: i === 0 ? "native" : `0x${i.toString(16).padStart(40, "0")}`, symbol: a.symbol, balance: a.balance, candidateId: `token:8453:${i}`, action: a.action, model: "jev-latest",
      evidence: { origin: "OKX OnchainOS", ageMs: 1000, gaps: a.gaps ?? [], flow: a.flow === undefined || a.flow === null ? null : { buyShare: a.flow, tradeCount: 120 }, risk: a.risk ?? null },
    })),
  };
  return { ok: true, id: "x", status: "respondido", carteira, custo: { chamadasOnchainos: 6, tokens: 1700, usd: null }, briefHash: "h", advisory: true, execution: "never" };
};

describe("before asking", () => {
  test("the question, the network to analyse with the count of holdings, and one button that stays closed until the consent", () => {
    const html = draw();
    expect(html).toContain("O que fazer com a minha carteira");
    expect(html).toContain('aria-label="Rede a analisar"');
    expect(html).toContain("Ethereum (1)");
    expect(html).toContain("Base (2)");
    expect(html).toContain("BNB Chain (1)");
    expect(html).toMatch(/<option value="8453" selected="">Base \(2\)<\/option>/);
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Pedir ao Inonu/);
    expect(html).toContain("So roda quando voce pedir.");
  });

  test("the consent says what goes to the model and what never does", () => {
    const html = draw();
    expect(html).toContain("Enviar a rede, os contratos e os saldos desta leitura ao modelo (Jev), com contexto publico de mercado da OKX.");
    expect(html).toContain("O endereco da carteira, os precos desta leitura e os valores das posicoes nao sao enviados.");
    expect(html).toMatch(/<input[^>]*type="checkbox"/);
  });

  test("with the consent given the button opens, and it says how many holdings, how old the reading is and what it costs", () => {
    const html = draw({ consent: true });
    expect(html).not.toMatch(/<button[^>]*disabled=""[^>]*>Pedir ao Inonu/);
    expect(html).toContain("2 ativos nesta consulta, lidos ha 5 s.");
    expect(html).toContain("Uma consulta ao modelo e leituras da OKX OnchainOS dos ativos escolhidos; o custo aparece depois da resposta.");
  });

  test("the consultation distinguishes selected holdings from ineligible ones", () => {
    const prepared = props().prepared;
    if (!prepared.ok) throw new Error("fixture must be eligible");
    expect(draw({ prepared: { ...prepared, skipped: 1 } })).toContain("1 ativo nao elegivel ficou de fora.");
  });

  test("a network that cannot be asked says why, and keeps the button and the consent closed", () => {
    const html = draw({ chainIndex: "56", prepared: prepareConsult([], "56", OBSERVED, OBSERVED + 5_000) });
    expect(html).toContain("ativos verificaveis");
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Pedir ao Inonu/);
    expect(html).toMatch(/<input[^>]*disabled=""[^>]*type="checkbox"|<input[^>]*type="checkbox"[^>]*disabled=""/);
  });

  test("a reading that went stale says to read again", () => {
    expect(draw({ prepared: prepareConsult(rows, "8453", OBSERVED, OBSERVED + 90_000) })).toContain("nova leitura");
  });

  test("an expired reading offers a direct refresh and preserves the completed decision as historical", () => {
    const html = draw({ ageSeconds: 90, onRefresh: noop, prepared: prepareConsult(rows, "8453", OBSERVED, OBSERVED + 90_000), answer: answer([{ symbol: "ETH", action: "sell", balance: "0.5" }]) });
    expect(html).toContain(">Atualizar para analisar</button>");
    expect(html).not.toMatch(/<button[^>]*disabled=""[^>]*>Atualizar para analisar/);
    expect(html).toContain('aria-label="Plano por ativo"');
    expect(html).toContain("Resultado da leitura anterior. Atualize antes de uma nova analise.");
  });

  test("the radar candidate is visibly connected to the prepared request", () => {
    const candidate = { chainIndex: "8453", address: "0x1111111111111111111111111111111111111111", symbol: "RADAR", name: null };
    const html = draw({ candidate, prepared: prepareConsult(rows, "8453", OBSERVED, OBSERVED + 5_000, candidate) });
    expect(html).toContain("RADAR do radar incluido na analise");
  });

  test("while it asks, the only button cancels and the select is closed", () => {
    const html = draw({ busy: true, consent: true });
    expect(html).toContain("Cancelar");
    expect(html).not.toContain("Pedir ao Inonu<");
    expect(html).toContain("O Inonu esta analisando a carteira.");
    expect(html).toMatch(/<select[^>]*disabled=""/);
  });
});

describe("the plan", () => {
  const plan = answer([
    { symbol: "ETH", action: "hold", balance: "0.5", flow: 0.62, risk: "baixo" },
    { symbol: "USDC", action: "buy", balance: "40", flow: null, risk: null, gaps: ["price_unavailable"] },
    { symbol: "DEGEN", action: "sell", balance: "1000" },
    { symbol: "NEW", action: "abstain", balance: null },
  ]);

  test("holding by holding, with the Inonu's decision in plain words and the reason it had", () => {
    const html = draw({ answer: plan });
    expect(html).toContain('aria-label="Plano por ativo"');
    expect(html).toContain("Plano por ativo, na rede Base:");
    for (const word of ["Esperar", "Comprar mais", "Vender", "Nenhuma acao indicada"]) expect(html).toContain(`>${word}<`);
    expect(html).toContain("compradores 62%; risco baixo");
    expect(html).toContain("Preco indisponivel");
    expect(html).toContain("Resumo de fluxo e risco indisponivel");
    expect(html).toContain("desconhecido");
  });

  test("each row carries its action for the colour, and the cost and the model are said, with no order sent", () => {
    const html = draw({ answer: plan });
    for (const action of ["buy", "hold", "sell", "abstain"]) expect(html).toContain(`data-action="${action}"`);
    expect(html).toContain("Modelo: jev-latest.");
    expect(html).toContain("Custo nao informado; tokens 1700; leituras OnchainOS 6.");
    expect(html).toContain("Consultivo: nenhuma ordem e enviada.");
  });

  test("market inputs are labeled as data, not a model rationale, and credential gaps use plain words", () => {
    const html = draw({ answer: answer([{ symbol: "ETH", action: "abstain", balance: "0.5", gaps: ["onchainos_credentials_unavailable"] }]) });
    expect(html).toContain(">Dados usados<");
    expect(html).not.toContain(">Por que<");
    expect(html).toContain("Credenciais OnchainOS ausentes");
    expect(html).not.toContain("onchainos_credentials_unavailable");
  });

  test("a wallet with no balance in the holdings read says so", () => {
    const empty = answer([{ symbol: "ETH", action: "hold", balance: "0" }, { symbol: "USDC", action: "hold", balance: "0" }]);
    (empty.carteira as { positionsEmpty: boolean | null }).positionsEmpty = true;
    expect(draw({ answer: empty })).toContain("Sem saldo nos ativos lidos.");
  });

  test("abstentions explain evidence limits without inventing a model rationale", () => {
    const html = draw({ answer: answer([{ symbol: "ETH", action: "abstain", balance: "0.5", gaps: ["fluxo", "risco", "clusters", "honeypot", "pools", "quote", "regime"] }]) });
    expect(html).toContain("Nenhuma acao indicada pelo Inonu nesta consulta.");
    expect(html).toContain("Lacunas da coleta, nao uma justificativa do modelo.");
    expect(html).toContain("Fluxo de negociacoes indisponivel");
    expect(html).toContain("Avaliacao de risco indisponivel");
    expect(html).toContain("Contexto complementar ausente");
    expect(html).toContain("Regime nao se aplica a esta consulta");
    expect(html).not.toContain("clusters, honeypot, pools, quote, regime");
    expect(html).toContain('data-evidence="details"');
  });

  test("abstention with available data does not claim the market is empty or request missing credentials", () => {
    const html = draw({ answer: answer([{ symbol: "ETH", action: "abstain", balance: "0.5", flow: 0.62, risk: "baixo", gaps: ["clusters", "quote"] }]) });
    expect(html).toContain("Dados disponiveis");
    expect(html).toContain("compradores 62%; risco baixo");
    expect(html).toContain("A abstencao nao identifica sozinha qual dado impediu a decisao.");
    expect(html).not.toContain("Credenciais OnchainOS ausentes");
    expect(html).not.toContain("sem dados do mercado");
    expect(html).not.toContain("Sem dados para decidir");
  });

  test("classified gaps distinguish essential, optional and inapplicable evidence without exposing codes", () => {
    const html = draw({ answer: answer([{ symbol: "ETH", action: "abstain", balance: "0.5", risk: "baixo", gaps: ["essential:fluxo", "optional:clusters", "optional:quote", "not_applicable:regime"] }]) });
    expect(html).toContain("Fluxo de negociacoes indisponivel");
    expect(html).toContain("Contexto complementar ausente (2)");
    expect(html).toContain("Regime nao se aplica a esta consulta");
    for (const prefix of ["essential:", "optional:", "not_applicable:"]) expect(html).not.toContain(prefix);
    expect(html).not.toContain("sem dados do mercado");
  });

  test("collection keys and their reasons are readable separately, without claiming a model rationale", () => {
    const html = draw({ answer: answer([{ symbol: "ETH", action: "abstain", balance: "0.5", gaps: ["essential:price-info:market_identity_mismatch", "essential:token-risk:dado_antigo", "optional:trades:nao_consultado:nao_pedido", "not_applicable:regime:nao_pedido"] }]) });
    expect(html).toContain("Leitura de preco e liquidez: identidade do ativo nao confirmada");
    expect(html).toContain("Avaliacao de risco: dado antigo");
    expect(html).toContain("Fluxo de negociacoes: nao consultado / fora desta coleta");
    expect(html).toContain("Contexto complementar ausente (1)");
    expect(html).toContain("Regime nao se aplica a esta consulta");
    expect(html).toContain("Lacunas da coleta, nao uma justificativa do modelo.");
    for (const code of ["price-info", "token-risk", "trades:", "market_identity_mismatch", "dado_antigo", "nao_consultado", "nao_pedido"]) expect(html).not.toContain(code);
  });

  const marketAnswer = (market: unknown) => {
    const result = answer([{ symbol: "TOKEN", action: "abstain", balance: "4" }]);
    Object.assign(result.carteira!.assets[0]!.evidence, { market });
    return result;
  };

  test("public market evidence preserves small prices, signed percentages, windows, origin and age", () => {
    const html = draw({ answer: marketAnswer({ priceUsd: 0.000001, liquidityUsd: 12000, changePct: { m5: -2, h1: 3, h4: 12, h24: 20 }, volumeUsd: { m5: 1, h1: 20, h4: 1200, h24: 4500 }, ageMs: 1200, stale: false }) });
    expect(html).toContain("Mercado consultado");
    expect(html).toContain("preco US$ 0,000001");
    expect(html).toContain("liquidez US$ 12.000,00");
    expect(html).toContain("Variacao: 5 min -2,00%; 1 h 3,00%; 4 h 12,00%; 24 h 20,00%");
    expect(html).toContain("Volume: 5 min US$ 1,00; 1 h US$ 20,00; 4 h US$ 1.200,00; 24 h US$ 4.500,00");
    expect(html).toContain("Origem: OKX OnchainOS. Idade na consulta: 2 s.");
    expect(html).not.toContain("Resumo de fluxo e risco indisponivel");
    expect(html).toContain("Nenhuma acao indicada");
  });

  test("unknown market evidence stays unavailable while actual zero remains zero", () => {
    const html = draw({ answer: marketAnswer({ priceUsd: null, liquidityUsd: 0, changePct: { m5: null, h1: 0 }, volumeUsd: { m5: null, h1: 0 }, ageMs: null, stale: false }) });
    expect(html).toContain("preco indisponivel; liquidez US$ 0,00");
    expect(html).toContain("5 min indisponivel; 1 h 0,00%; 4 h indisponivel; 24 h indisponivel");
    expect(html).toContain("5 min indisponivel; 1 h US$ 0,00; 4 h indisponivel; 24 h indisponivel");
    expect(html).toContain("Idade na consulta: desconhecida");
    expect(html).not.toContain("NaN");
  });

  test("old or malformed market numbers are never displayed as fresh evidence", () => {
    const html = draw({ answer: marketAnswer({ priceUsd: Infinity, liquidityUsd: -1, changePct: { m5: NaN }, volumeUsd: { m5: -1 }, ageMs: -1, stale: true }) });
    expect(html).toContain("preco indisponivel; liquidez indisponivel");
    expect(html).toContain("Leitura antiga");
    expect(html).toContain("Idade na consulta: desconhecida");
    for (const value of ["NaN", "Infinity", "US$ -1"]) expect(html).not.toContain(value);
    expect(draw({ answer: marketAnswer(null) })).not.toContain("Mercado consultado");
  });

  test("a note of the outcome (cancelled, refused) is shown under the button", () => {
    expect(draw({ note: "Consulta cancelada. Nenhum resultado sera aplicado." })).toContain("Consulta cancelada. Nenhum resultado sera aplicado.");
  });
});

describe("how it is written", () => {
  test("plain ASCII with no middle dot, dash or accent, and no word of an order outside the Inonu's own answer", () => {
    const states = [draw(), draw({ consent: true }), draw({ busy: true }), draw({ prepared: prepareConsult(rows, "56", OBSERVED, OBSERVED + 5_000) })];
    for (const html of states) {
      const visible = html.replace(/<[^>]*>/g, " ");
      expect(visible).not.toMatch(/[^\x20-\x7e]/);
      for (const word of ["comprar", "compre", "vender", "venda", "buy", "sell", "hold", "action", "signal", "recommend", "vote", "sinal"]) expect(new RegExp(`\\b${word}\\b`, "i").test(visible)).toBe(false);
    }
  });

  test("the only buttons are the ask and the cancel: nothing here sends, signs or prepares a transaction", () => {
    for (const html of [draw(), draw({ consent: true }), draw({ busy: true }), draw({ answer: answer([{ symbol: "ETH", action: "sell", balance: "1" }, { symbol: "USDC", action: "buy", balance: "1" }]) })]) {
      for (const m of html.matchAll(/<button[^>]*>([^<]*)<\/button>/g)) expect(m[1]).toMatch(/^(Pedir ao Inonu|Cancelar)$/);
    }
  });
});
