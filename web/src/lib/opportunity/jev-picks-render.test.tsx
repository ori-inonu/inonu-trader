// "Melhores oportunidades do ecossistema", drawn: every state of the panel without a server, a wallet or a model. The code reads, measures and bounds; the only way to the model is the click on
// the button, and "Preparar compra" only fills the ticket. origin: synthetic_fixture, tests only.
import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { JevPicksView, type JevPicksManagementProps, type JevPicksViewProps } from "@/components/Desk/Dock/JevPicks";
import type { BalanceRead } from "./balance";
import { createLastPicksStore, LAST_PICKS_KEY, type LastPicks } from "./last-picks";
import { parseEcoAnswer, type EcoAnswer } from "./picks";

const FORBIDDEN = new RegExp(`[${String.fromCharCode(0xb7, 0x2014, 0x2013)}]`);
const noop = () => {};
const NOW = 2_000_000_000_000;
const BASE_AAA = "0xaaaa000000000000000000000000000000000001";
const SOL_MINT = "So11111111111111111111111111111111111111112";

function facts(chainIndex: string, address: string, symbol: string, over: Record<string, unknown> = {}) {
  return {
    candidateId: `token:${chainIndex}:${address}`, chainIndex, address, symbol, nota: 70, priceUsd: 0.5, changePct: 8, volumeUsd: 3_000_000, liquidityUsd: 900_000, marketCapUsd: 20_000_000, holders: 4000,
    buyShare: 0.62, txs: 800, top10Pct: 20, devPct: 2, bundlePct: 3, riskLevel: 1, riskFlags: [], wallets: 4, walletsUsd: 60_000, soldPct: 20, ...over,
  };
}
function pick(rank: number, chainIndex: string, address: string, symbol: string, over: Record<string, unknown> = {}, factOver: Record<string, unknown> = {}) {
  return {
    rank, candidateId: `token:${chainIndex}:${address}`, chainIndex, address, symbol, size: "buy_two_thirds", fraction: 2 / 3, usd: 133, capUsd: 200, binding: "risco", scaled: false, driver: "carteiras",
    families: ["carteiras", "fluxo", "liquidez", "tracao"], marks: [], facts: facts(chainIndex, address, symbol, factOver), ...over,
  };
}
const wire = (picks: unknown[], over: Record<string, unknown> = {}) => ({ observedAtMs: NOW - 5_000, saldo: { totalUsd: 10_000, cashUsd: 5_000 }, picks, considered: 5, excluded: { honeypot: 1, pouco_apoio: 2 }, ...over });
const answer = (picks: unknown[], over: Record<string, unknown> = {}): EcoAnswer => {
  const parsed = parseEcoAnswer(wire(picks, over));
  if (parsed === null) throw new Error("fixture is not a valid answer");
  return parsed;
};
const kept = (a: EcoAnswer, over: Partial<LastPicks> = {}): LastPicks => ({ answer: a, atMs: NOW - 120_000, briefHash: "abc123", modelo: "jev-test", ...over });

const mgmt = (over: Partial<JevPicksManagementProps> = {}): JevPicksManagementProps => ({
  hasAccount: true, reading: null, readiness: "unavailable", consent: false,
  onRead: noop, onConsent: noop, onAnalyzeMarket: noop, onAnalyzePortfolio: noop, ...over,
});
const props = (over: Partial<JevPicksViewProps> = {}): JevPicksViewProps => ({
  phase: "idle", last: null, failure: null, balanceNote: null, modelConfigured: true, nowMs: NOW, management: mgmt(), onCancel: noop, onOpen: noop, onPrepare: noop, canPrepare: () => true, ...over,
});
const draw = (over: Partial<JevPicksViewProps> = {}) => renderToStaticMarkup(<JevPicksView {...props(over)} />);
/** bun gives css-module names as undefined: what is asserted is the words and the attributes, not the class names. */
const plain = (html: string) => html.replace(/ class="[^"]*"/g, "");

const TWO = answer([
  pick(1, "8453", BASE_AAA, "AAA", { driver: "carteiras" }),
  pick(2, "8453", "0xbbbb000000000000000000000000000000000002", "BBB", { size: "buy_third", fraction: 1 / 3, usd: 33, capUsd: 100, driver: null, marks: ["concentracao", "sinal_de_risco"] }, { top10Pct: 55, riskFlags: ["lowLiq"] }),
]);

const WATCH = answer([], { considered: 2, saldo: null, decisions: TWO.picks.map((p, i) => ({ candidateId: p.candidateId, chainIndex: p.chainIndex, address: p.address, symbol: p.symbol, stance: "watch", rank: 2 - i, driver: p.driver, families: p.families, marks: p.marks, facts: p.facts })) });

describe("model watch priorities", () => {
  test("without a balance it shows the model's watch ranking and never offers a buy ticket", () => {
    const html = plain(draw({ last: kept(WATCH) }));
    expect(html).toContain("Acompanhar");
    expect(html.indexOf(">BBB<")).toBeLessThan(html.indexOf(">AAA<"));
    expect(html).not.toContain("Preparar compra</button>");
    expect(html).not.toContain("Tamanho ");
    expect(html).not.toContain("nao escolheu nenhum token");
  });

  test("measurements, exclusions and explanations are closed and only the main evidence is visible", () => {
    const html = plain(draw({ last: kept(WATCH) }));
    const visible = html.replace(/<details\b[^>]*>[\s\S]*?<\/details>/g, "");
    expect(html).toContain("<summary>Dados e limites</summary>");
    expect(html).not.toMatch(/<details[^>]*\bopen(?:=|>)/);
    expect(visible).not.toContain("Ficaram de fora");
    expect(visible).not.toContain("duas familias a favor");
    expect(visible).not.toContain("Fluxo de compras");
    expect(visible).toContain("Carteiras rastreadas");
  });

  test("a tab reload preserves watch decisions without creating buy picks", () => {
    const data = new Map<string, string>();
    const storage = { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v), removeItem: (k: string) => void data.delete(k) };
    createLastPicksStore({ storage }).set(kept(WATCH));
    expect(createLastPicksStore({ storage }).get()?.answer).toEqual(WATCH);
  });
});

describe("before the first request", () => {
  const html = plain(draw());

  test("it says what one click costs and that the dollars stay on this machine", () => {
    expect(html).toContain("Analisar mercado");
    expect(html).toContain("Analisar carteira");
    expect(html).toContain("Sem pedido");
    const visible = html.replace(/<details\b[^>]*>[\s\S]*?<\/details>/g, "");
    expect(visible).toContain("Ate 2 avaliacoes por consulta.");
    expect(html).not.toContain("faz 1 chamada ao modelo");
    expect(html).toContain("ao modelo vao so percentuais do saldo");
    expect(html).toContain("Como o Inonu decide");
  });

  test("there is no card and no list", () => {
    expect(html).not.toContain("Tokens escolhidos");
    expect(html).not.toContain(">Preparar compra</button>");
  });

  test("without a model key the way to configure it is a link", () => {
    expect(plain(draw({ modelConfigured: false }))).toContain('<a href="/configuracoes">Configure a chave do modelo em Configuracoes</a>');
    expect(html).not.toContain("Configure a chave do modelo");
  });
});

describe("while it works", () => {
  test("reading the balance and asking the Inonu are two different lines, the button is off and the cancel is there", () => {
    const reading = plain(draw({ phase: "reading" }));
    expect(reading).toContain("Lendo seu saldo");
    expect(reading).toMatch(/<button[^>]*disabled=""[^>]*>Analisar mercado/);
    expect(reading).toContain(">Cancelar<");
    expect(plain(draw({ phase: "asking" }))).toContain("Perguntando ao Inonu");
  });
});

describe("an answer", () => {
  const html = plain(draw({ last: kept(TWO) }));

  test("the cards come in the order of the ranking, each with the network, the price and the change", () => {
    expect(html.indexOf(">AAA<")).toBeGreaterThan(-1);
    expect(html.indexOf(">AAA<")).toBeLessThan(html.indexOf(">BBB<"));
    expect(html).toContain("Base");
    expect(html).toContain("US$ 0,50");
    expect(html).toContain("em 24 h");
  });

  test("the size is the label, the dollars from the balance and the share of the portfolio", () => {
    expect(html).toContain("Tamanho Medio");
    expect(html).toContain("US$ 133");
    expect(html).toContain("1,3% da carteira");
    expect(html).toContain("dois tercos do teto");
    expect(html).toContain("Tamanho Pequeno");
    expect(html).toContain("US$ 33");
  });

  test("why: the family that weighed most is named, and every family in favour has its measurement", () => {
    expect(html).toContain("Pesou mais: <strong>Carteiras rastreadas</strong>");
    expect(html).toContain("4 carteiras rastreadas compraram");
    expect(html).toContain("Fluxo de compras");
    expect(html).toContain("Liquidez");
    expect(html).toContain("4 de 6 familias de evidencia a favor, nenhuma marca de cuidado");
  });

  test("the marks of care are written as measurements, not as a verdict", () => {
    expect(html).toContain("as 10 maiores carteiras tem 55% da oferta");
    expect(html).toContain("a OKX marca um alerta de risco: lowLiq");
    expect(html).toContain("4 de 6 familias de evidencia a favor, 2 marcas de cuidado");
  });

  test("the answer says which balance sized it, who answered and what the code left out before the Inonu", () => {
    expect(html).toContain("Saldo lido: US$ 10.000 no total, US$ 5.000 em moeda estavel.");
    expect(html).toContain("modelo: Jev (jev-test).");
    expect(html).toContain("5 candidatos chegaram ao Inonu. Ficaram de fora antes dele: 1 a OKX marca como honeypot, token que trava a saida; 2 com menos de 2 familias de evidencia a favor.");
    expect(html).toContain("Inonu respondeu ha 2 min");
  });

  test("on a Base token Preparar compra is on, and the title says it only fills the ticket", () => {
    expect(html).toMatch(/<button[^>]*title="Preenche o ticket da aba Carteira\. Nada e enviado\."[^>]*>Preparar compra/);
    expect(html).not.toMatch(/<button[^>]*disabled=""[^>]*>Preparar compra/);
    expect(html).toContain("Abrir no grafico");
  });

  test("an answer more than fifteen minutes old is flagged and a new request is asked for", () => {
    const old = plain(draw({ last: kept(TWO, { atMs: NOW - 16 * 60_000 }) }));
    expect(old).toContain("Leitura velha: os precos mudam em minutos. Peca de novo antes de agir.");
    expect(old).toContain("Inonu respondeu ha 16 min");
    expect(old).toMatch(/<button[^>]*disabled=""[^>]*>Preparar compra/);
    expect(old).not.toMatch(/<button(?![^>]*disabled)[^>]*>Preparar compra/);
    expect(html).not.toContain("Leitura velha");
  });
});

describe("a pick the ticket cannot quote", () => {
  const sol = answer([pick(1, "501", SOL_MINT, "WSOL", { driver: "fluxo" })]);
  const html = plain(draw({ last: kept(sol) }));

  test("Preparar compra is off and the reason is written, never a button that does nothing in silence", () => {
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Preparar compra/);
    expect(html).toContain("O app ainda nao tem uma moeda de pagamento conhecida para esta rede");
    expect(html).toContain("Abrir no grafico");
  });
});

describe("no balance", () => {
  const unread = answer([pick(1, "8453", BASE_AAA, "AAA", { usd: 0, capUsd: 0, binding: "sem_dado", size: "buy_third", fraction: 1 / 3 })], { saldo: null });
  const html = plain(draw({ last: kept(unread), balanceNote: "Nenhuma carteira conectada nem endereco acompanhado: o Inonu escolhe os tokens, mas os tamanhos vem sem valor em dolar. Conecte a carteira na aba Carteira." }));

  test("the tokens are there, the size has no dollars, and the screen says why", () => {
    expect(html).toContain("Saldo nao lido: sem valor");
    expect(html).toContain("O saldo nao foi lido");
    expect(html).toContain("Saldo nao lido neste pedido: sem valor de compra disponivel.");
    expect(html).toContain("Nenhuma carteira conectada nem endereco acompanhado");
    expect(html).not.toContain("da carteira<");
  });
});

describe("an answer with no pick", () => {
  const html = plain(draw({ last: kept(answer([], { considered: 3, excluded: { honeypot: 3 } })) }));

  test("it is said as it is, with what was left out, and no list is invented", () => {
    expect(html).toContain("O Inonu nao escolheu nenhum token agora.");
    expect(html).toContain("3 candidatos chegaram ao Inonu. Ficaram de fora antes dele: 3 a OKX marca como honeypot, token que trava a saida.");
    expect(html).toContain("Nenhuma lista e inventada para preencher o espaco.");
    expect(html).not.toContain(">Preparar compra</button>");
  });
});

describe("a failure", () => {
  test("the reason is the line of the state, the last picks stay with their age, and nothing is cleared", () => {
    const html = plain(draw({ last: kept(TWO), failure: "Limite de custo do dia atingido. Nada foi enviado ao modelo" }));
    expect(html).toContain("Limite de custo do dia atingido. Nada foi enviado ao modelo");
    expect(html).toContain('data-failed="true"');
    expect(html).toContain(">AAA<");
  });
});

const READY_READ: BalanceRead = {
  saldo: { observedAtMs: NOW - 10_000, totalUsd: 1_234, cashUsd: 500, chains: [{ chainIndex: "8453", cashUsd: 500 }], holdings: [], riskPct: null },
  missing: [],
  coverage: { requestedChains: ["1", "8453", "501"], skippedChains: [], networkListKnown: true, stale: false, unpricedRows: 0, flaggedRows: 0, truncated: false },
};
const PARTIAL_READ: BalanceRead = {
  ...READY_READ,
  missing: ["501"],
  coverage: { ...READY_READ.coverage, unpricedRows: 2 },
};
const EMPTY_READ: BalanceRead = { ...READY_READ, saldo: null };

describe("the read, review and analysis steps", () => {
  test("the three steps and the spot posture are named, and the two kinds of analysis are told apart", () => {
    const html = plain(draw());
    expect(html).toContain("1 Ler carteira");
    expect(html).toContain("2 Conferir dados");
    expect(html).toContain("3 Analisar com Inonu");
    expect(html).toContain("A vista / Sem margem");
    expect(html).toContain(">Analisar mercado<");
    expect(html).toContain(">Analisar carteira<");
    expect(html).toContain('aria-label="Etapas da analise da carteira"');
    expect(html).toContain("Cobertura limitada as redes e aos tokens retornados pela OKX");
  });

  test("before any click nothing was read or asked, and the personal analysis stays off", () => {
    const html = plain(draw());
    expect(html).toContain(">Ler carteira</button>");
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Analisar carteira/);
    expect(html).not.toMatch(/<button[^>]*disabled=""[^>]*>Analisar mercado/);
    expect(html).not.toContain(">Preparar compra</button>");
  });

  test("without an account it says where to connect, keeps the market analysis and shows no zero", () => {
    const html = plain(draw({ management: mgmt({ hasAccount: false }) }));
    expect(html).toContain("aba Carteira");
    expect(html).toContain(">Analisar mercado<");
    expect(html).not.toContain(">Ler carteira</button>");
    expect(html).not.toContain("US$ 0");
    expect(html).not.toContain("patrimonio");
  });

  test("a fresh complete read shows the known value of the consulted networks and the consent, off by default", () => {
    const html = plain(draw({ management: mgmt({ reading: READY_READ, readiness: "ready" }) }));
    expect(html).toContain("Valor conhecido estimado nas redes consultadas: US$ 1.234,00 no total, US$ 500,00 em moeda estavel");
    expect(html).toContain("Leitura recente, sem lacunas detectadas nas redes consultadas.");
    expect(html).toContain("3 redes consultadas");
    expect(html).toContain('type="checkbox"');
    expect(html).not.toContain("checked");
    expect(html).toContain("nucleo local");
    expect(html).toContain("percentuais");
    expect(html).toContain("nunca o endereco");
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Analisar carteira/);
  });

  test("with consent marked the personal analysis can be clicked", () => {
    const html = plain(draw({ management: mgmt({ reading: READY_READ, readiness: "ready", consent: true }) }));
    expect(html).toMatch(/<input[^>]*checked=""[^>]*type="checkbox"|type="checkbox"[^>]*checked=""/);
    expect(html).not.toMatch(/<button[^>]*disabled=""[^>]*>Analisar carteira/);
  });

  test("a partial read names what is missing and never claims the whole wallet", () => {
    const html = plain(draw({ management: mgmt({ reading: PARTIAL_READ, readiness: "partial" }) }));
    expect(html).toContain("Leitura parcial: confira as lacunas antes da analise da carteira.");
    expect(html).toContain("Solana");
    expect(html).toContain("sem preco");
    expect(html).toContain("redes consultadas");
    expect(html).not.toContain('type="checkbox"');
    expect(html).not.toContain("patrimonio");
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Analisar carteira/);
  });

  test("a stale read and an unavailable one block the personal analysis with their own reasons", () => {
    const stale = plain(draw({ management: mgmt({ reading: READY_READ, readiness: "stale" }) }));
    expect(stale).toContain("vencida");
    expect(stale).toMatch(/<button[^>]*disabled=""[^>]*>Analisar carteira/);
    const empty = plain(draw({ management: mgmt({ reading: EMPTY_READ, readiness: "unavailable" }) }));
    expect(empty).toContain("Saldo indisponivel");
    expect(empty).not.toContain("US$ 0");
    expect(empty).toMatch(/<button[^>]*disabled=""[^>]*>Analisar carteira/);
  });

  test("while something runs the buttons are off and the consent cannot change", () => {
    const html = plain(draw({ phase: "reading", management: mgmt({ reading: READY_READ, readiness: "ready", consent: true }) }));
    for (const label of ["Ler carteira", "Analisar mercado", "Analisar carteira"]) expect(html).toMatch(new RegExp(`<button[^>]*disabled=""[^>]*>${label}`));
    expect(html).toMatch(/<input[^>]*disabled=""[^>]*type="checkbox"|type="checkbox"[^>]*disabled=""/);
    expect(html).toContain(">Cancelar<");
  });

  test("a read too large for the request says so and keeps the market analysis, and a model that is not configured invites no ask", () => {
    const big: BalanceRead = {
      ...READY_READ,
      saldo: {
        observedAtMs: NOW - 10_000,
        totalUsd: 1_060,
        cashUsd: 400,
        chains: [{ chainIndex: "8453", cashUsd: 400 }],
        holdings: Array.from({ length: 22 }, (_, i) => ({ chainIndex: i === 0 ? "1" : "8453", address: `0x${(i + 1).toString(16).padStart(40, "0")}`, usd: 30 })),
        riskPct: null,
      },
    };
    const html = plain(draw({ management: mgmt({ reading: big, readiness: "partial", consent: true }) }));
    expect(html).toContain("Os dados excedem o limite desta consulta; a analise de mercado segue disponivel.");
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Analisar carteira/);
    expect(html).not.toMatch(/<button[^>]*disabled=""[^>]*>Analisar mercado/);
    const off = plain(draw({ modelConfigured: false, management: mgmt({ reading: READY_READ, readiness: "ready", consent: true }) }));
    for (const label of ["Analisar mercado", "Analisar carteira"]) expect(off).toMatch(new RegExp(`<button[^>]*disabled=""[^>]*>${label}`));
  });
});

describe("the words on the screen", () => {
  const all = [
    draw(),
    draw({ phase: "asking" }),
    draw({ phase: "reading", management: mgmt({ reading: READY_READ, readiness: "ready", consent: true }) }),
    draw({ management: mgmt({ hasAccount: false }) }),
    draw({ management: mgmt({ reading: PARTIAL_READ, readiness: "partial" }) }),
    draw({ management: mgmt({ reading: READY_READ, readiness: "ready", consent: true }), last: kept(TWO) }),
    draw({ last: kept(TWO) }),
    draw({ last: kept(TWO, { atMs: NOW - 20 * 60_000 }) }),
    draw({ last: kept(answer([])) }),
    draw({ last: kept(answer([pick(1, "501", SOL_MINT, "WSOL")])) }),
  ];

  test("no middle dot, em dash or en dash anywhere, and no order word written by the code", () => {
    for (const html of all) {
      const text = plain(html).replace(/<[^>]+>/g, " ");
      expect(FORBIDDEN.test(text)).toBe(false);
      expect(text.toLowerCase()).not.toMatch(/\b(comprar|compre|vender|venda|sinal|sinais|recomend\w*|aconselh\w*|deve|garant\w*|certeza)\b/);
    }
  });

  test("nothing blinks or pulses, and no free text can reach the page through the answer", () => {
    for (const html of all) {
      expect(html).not.toMatch(/animation|blink|pulse/i);
      expect(html).not.toContain("<script");
    }
  });
});

describe("the last picks kept for the tab", () => {
  const memory = () => {
    const data = new Map<string, string>();
    return { data, storage: { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v), removeItem: (k: string) => void data.delete(k) } };
  };

  test("an answer is kept and read back by the next page of the tab, exactly", () => {
    const { storage } = memory();
    createLastPicksStore({ storage }).set(kept(TWO));
    const again = createLastPicksStore({ storage }).get();
    expect(again?.answer.picks.map((p) => p.symbol)).toEqual(["AAA", "BBB"]);
    expect(again).toMatchObject({ atMs: NOW - 120_000, briefHash: "abc123", modelo: "jev-test" });
  });

  test("anything that is not exactly an answer is dropped, never trusted", () => {
    const { data, storage } = memory();
    data.set(LAST_PICKS_KEY, JSON.stringify({ answer: { picks: [] }, atMs: 1, briefHash: null, modelo: null }));
    expect(createLastPicksStore({ storage }).get()).toBeNull();
    data.set(LAST_PICKS_KEY, JSON.stringify({ ...kept(TWO), extra: 1 }));
    expect(createLastPicksStore({ storage }).get()).toBeNull();
    data.set(LAST_PICKS_KEY, JSON.stringify({ ...kept(TWO), briefHash: "not a hash!" }));
    expect(createLastPicksStore({ storage }).get()).toBeNull();
    data.set(LAST_PICKS_KEY, "{not json");
    expect(createLastPicksStore({ storage }).get()).toBeNull();
  });

  test("a storage that refuses leaves the answer in memory, and clear forgets it", () => {
    const blocked = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("full"); }, removeItem: () => { throw new Error("blocked"); } };
    const store = createLastPicksStore({ storage: blocked });
    expect(store.get()).toBeNull();
    let heard = 0;
    store.subscribe(() => (heard += 1));
    store.set(kept(TWO));
    expect(store.get()?.briefHash).toBe("abc123");
    store.clear();
    expect(store.get()).toBeNull();
    expect(heard).toBe(2);
  });
});
