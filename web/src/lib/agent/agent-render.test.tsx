// The agent's page, every state in words: loading, a core that does not answer, not connected, the notice, connected and analysing, connected and trading, paused, the steps of the agent's own wallet, an order
// without an answer. Plain ASCII, nothing animated, and nothing on the page that is a field, a mode or an approval. origin: synthetic_fixture, tests only.
import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { AgentScreen, type AgentScreenProps } from "@/components/Agent/AgentScreen";
import { CONNECTED_STATE, DISCONNECTED_STATE, NOW, rawStatus, sampleStatus, WALLET_TRADING } from "./fixtures";

const noop = () => {};
const base = (over: Partial<AgentScreenProps> = {}): AgentScreenProps => ({
  load: "ready",
  error: null,
  status: sampleStatus(),
  nowMs: NOW,
  busy: null,
  notice: null,
  noticeOpen: false,
  onConnect: noop,
  onAccept: noop,
  onCancel: noop,
  onDisconnect: noop,
  onResolve: noop,
  onWallet: noop,
  ...over,
});
const draw = (over: Partial<AgentScreenProps> = {}) => renderToStaticMarkup(<AgentScreen {...base(over)} />);
const off = () => sampleStatus({ state: DISCONNECTED_STATE, mode: "desligado", last: null });
const visible = (html: string) => html.replace(/<style[\s\S]*?<\/style>/g, "").replace(/<[^>]*>/g, " ");

describe("while the app is not ready", () => {
  test("loading says so and shows no agent", () => {
    const html = draw({ load: "loading", status: null });
    expect(html).toContain("Lendo o estado do agente.");
    expect(html).toContain("Conectando ao servidor do agente");
    expect(html).not.toContain("Desconectar");
  });

  test("a core that does not answer is told in words, with what to check", () => {
    const html = draw({ load: "error", error: "sem_conexao", status: null });
    expect(html).toContain("O servidor do agente nao respondeu.");
    expect(html).toContain("Confira se o servidor do agente esta no ar");
  });

  test("an old core without the agent route is named as such", () => {
    expect(draw({ load: "error", error: "servidor_sem_rota", status: null })).toContain("O servidor do agente esta desatualizado e nao conhece o agente.");
  });
});

describe("before the wallet is connected the page has one action", () => {
  test("an invitation and one button, and nothing else to decide", () => {
    const html = draw({ status: off() });
    expect(html).toContain("Conecte a carteira. O resto e com o agente.");
    expect(html.match(/Conectar carteira/g)?.length).toBe(1);
    expect(html).not.toContain("<input");
    expect(html).not.toContain("<select");
    expect(html).not.toContain("<textarea");
    expect(html).not.toContain("Desconectar");
    expect(html).not.toContain("Capital sob gestao");
  });

  test("the notice is shown once, says what connecting means, and has two answers", () => {
    const html = draw({ status: off(), noticeOpen: true });
    expect(html).toContain('role="dialog"');
    expect(html).toContain("Voce vai entregar a gestao ao agente");
    expect(html).toContain("todas as decisoes e todas as configuracoes passam a ser do agente");
    expect(html).toContain("gerenciamento de risco");
    expect(html).toContain("alavancagem");
    expect(html).toContain("nao pede confirmacao");
    expect(html).toContain("instala o programa oficial da OKX");
    expect(html).toContain("risco de perder capital");
    expect(html).toContain("Entendo e conecto a carteira");
    expect(html).toContain("Cancelar");
    // it is not a form: nothing to type, no mode to choose
    expect(html).not.toContain("<input");
  });

  test("the connect button shuts while the connection is made, and a refusal is told", () => {
    expect(draw({ status: off(), busy: "connect" })).toMatch(/<button[^>]*disabled=""[^>]*>Conectar carteira<\/button>/);
    expect(draw({ status: off(), notice: { tone: "bad", text: "O aviso mudou. Leia de novo e conecte." } })).toContain("O aviso mudou. Leia de novo e conecte.");
  });
});

describe("connected and analysing", () => {
  test("the headline says what it is doing, and the mode is a word, not a switch", () => {
    const html = draw();
    expect(html).toContain("Analisando. Decidiu ha 3 min: postura neutra, 2 ordens seriam feitas");
    expect(html).toContain("Analisando");
    expect(html).not.toContain("aria-pressed");
    for (const gone of ["Sombra", "Limitado", "Assistido", "Desligado", "Parar tudo", "Rodar agora", "Salvar configuracao", "LIGAR"]) expect(html).not.toContain(gone);
  });

  test("the last decision, with who asked for each order", () => {
    const html = draw();
    expect(html).toContain("Vender um terco");
    expect(html).toContain("Alvo de 10%, saida se cair 6%, ate 36 horas");
    expect(html).toContain("Escolha do modelo.");
    expect(html).toContain("3 posicoes e 4 compras avaliadas");
    expect(html).toContain("Os dados de mercado das posicoes nao vieram.");
  });

  test("the opportunities the agent looked at, what it chose and why", () => {
    const html = draw();
    expect(html).toContain("Central de decisao do Jev");
    expect(html).toContain("BBB");
    expect(html).toContain("Nao comprar");
    // the signals of the code are one click away on each card that has them
    expect(html).toContain("Sinais do codigo");
    // the card that showed the market around is gone: it is not what the decision rests on that the person came to see
    expect(html).not.toContain("Mercado ao redor");
  });

  test("the strategy is the agent's, read-only, and says so", () => {
    const html = draw();
    expect(html).toContain("Estrategia do agente");
    expect(html).toContain("escolhida por ele, nada aqui e configurado por voce");
    expect(html).toContain("Moderado");
    expect(html).toContain("Olha o mercado a cada 10 minutos");
  });

  test("with the owner's bold profile the strategy card says the profile is the owner's, not the agent's choice", () => {
    const raw = rawStatus();
    (raw.status.autopilot as Record<string, unknown>).ownerProfile = "arrojado";
    const html = draw({ status: sampleStatus(raw.status) });
    expect(html).toContain("Estrategia do agente");
    expect(html).toContain("perfil arrojado, como voce definiu");
    expect(html).not.toContain("nada aqui e configurado por voce");
  });

  test("the capital, the positions with their plan, and the proof of return that claims only what was measured", () => {
    const html = draw();
    expect(html).toContain("Capital sob gestao");
    expect(html).toContain("US$ 1.010,00");
    expect(html).toContain("Alvo de 10%, saida se cair 6%, ate 36 horas");
    expect(html).toContain("Ainda sem evidencia medida de ganho");
    expect(html).toContain("Amostra pequena");
  });

  test("a wallet that is only the person's own is analysed, and says so", () => {
    expect(draw()).toContain("Sua carteira, so analise");
  });

  test("the way out is there and is the only control that is not a step of the wallet", () => {
    const html = draw();
    expect(html).toContain("Desconectar a carteira");
    expect(html).toContain("O agente para na hora");
    expect(html).not.toContain("<input");
  });
});

describe("the steps of the agent's own wallet", () => {
  const step = (wallet: Record<string, unknown>) => sampleStatus({ wallet: { cli: "ausente", login: "nao_iniciado", loginUrl: null, agentic: false, address: null, solanaAddress: null, policy: "desconhecida", fundsUsd: null, next: "instalar", ...wallet } });

  test("install comes first, and the card lists what is left in order", () => {
    const html = draw({ status: step({}) });
    expect(html).toContain("o que falta para ele executar sozinho");
    expect(html).toContain("Instalando o programa da OKX");
    expect(html).toContain("assinatura de integridade que a propria OKX publica");
    expect(html).toContain("Instalar agora");
    const order = ["Instalando o programa da OKX", "Entrar na conta OKX", "Saldo na carteira do agente", "Ligar os limites de seguranca no portal da OKX"];
    const positions = order.map((t) => html.indexOf(t));
    expect(positions.every((p) => p >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
  });

  test("signing in is a link to OKX's own page, opened in a new tab without a referrer", () => {
    const url = "https://web3.okx.com/account/sociallogin?authSessionId=abc&tempPubKey=xyz";
    const html = draw({ status: step({ cli: "instalado", login: "aguardando", loginUrl: url, next: "entrar" }) });
    expect(html).toContain("Abrir a pagina de entrada");
    expect(html).toContain(`href="${url.replace(/&/g, "&amp;")}"`);
    expect(html).toContain('target="_blank"');
    expect(html).toContain("noopener noreferrer");
  });

  test("after signing in, the address to deposit to and what the wallet holds", () => {
    const html = draw({ status: step({ cli: "instalado", login: "logado", agentic: true, address: "0x2222222222222222222222222222222222222222", next: "depositar", fundsUsd: 0 }) });
    expect(html).toContain("Saldo na carteira do agente");
    expect(html).toContain("0x2222222222222222222222222222222222222222");
    expect(html).toContain("Saldo lido: US$ 0,00.");
  });

  test("a person holding Solana assets is shown the Solana address, apart from the EVM one, and told not to mix them", () => {
    const solana = "38xPrzDyePKyg4ghstcLWTHBm7jG6ti2Q495yady3pYV";
    const html = draw({ status: step({ cli: "instalado", login: "logado", agentic: true, address: "0x2222222222222222222222222222222222222222", solanaAddress: solana, next: "depositar", fundsUsd: 0 }) });
    expect(html).toContain(solana);
    expect(html).toContain("Endereco da Solana");
    expect(html).toContain("Endereco das redes EVM");
    expect(html).toContain("so para o endereco da Solana");
    expect(html).toContain("um pouco de SOL");
    expect(html).toContain("nao ha nada para enviar");
    expect(html).toContain("como estao, sem vender");
    expect(html).toMatch(/Comece com um valor pequeno/);
  });

  test("with no Solana address read yet, only the EVM address is offered and the page does not invent one", () => {
    const html = draw({ status: step({ cli: "instalado", login: "logado", agentic: true, address: "0x2222222222222222222222222222222222222222", solanaAddress: null, next: "depositar", fundsUsd: 0 }) });
    expect(html).toContain("Endereco das redes EVM");
    expect(html).not.toContain("Endereco da Solana");
  });

  test("the policy in the portal is the last step while it is required: the page says why, offers OKX's page and keeps the addresses", () => {
    const html = draw({ status: step({ cli: "instalado", login: "logado", agentic: true, address: "0x2222222222222222222222222222222222222222", solanaAddress: "38xPrzDyePKyg4ghstcLWTHBm7jG6ti2Q495yady3pYV", next: "definir_politica", fundsUsd: 500 }) });
    expect(html).toContain("Ligar os limites de seguranca no portal da OKX");
    expect(html).toContain("nem este app consegue desfazer");
    expect(html).toContain("https://web3.okx.com/portfolio/agentic-wallet-policy");
    expect(html).toContain("Abrir os limites na OKX");
    expect(html).toContain("38xPrzDyePKyg4ghstcLWTHBm7jG6ti2Q495yady3pYV");
  });

  test("when the policy is not required a funded wallet is operating, and no step about the policy exists", () => {
    const html = draw({ status: step({ cli: "instalado", login: "logado", agentic: true, address: "0x2222222222222222222222222222222222222222", next: "operando", policy: "ausente", fundsUsd: 500 }) });
    expect(html).not.toContain("Ligar os limites de seguranca");
    expect(html).not.toContain("o que falta para ele executar sozinho");
  });

  test("the portfolio is drawn as one bar of what it is made of, biggest first, with a legend that reads the same in words", () => {
    const html = draw({ status: sampleStatus() });
    expect(html).toContain("Composicao da carteira");
    // the legend names what the bar shows, with its share
    expect(html).toMatch(/Caixa em dolares[^<]*<\/span><span[^>]*>79%/);
    expect(html).toContain("AAA");
  });

  test("the decisions NOT to act (keep, do not buy) are shown with their own measurement, apart from the orders, and say what they are measured against", () => {
    const html = draw({ status: sampleStatus() });
    expect(html).toContain("Quando o agente decide nao agir");
    expect(html).toContain("manter e nao comprar");
    expect(html).toContain("medidas contra a alternativa que o Jev recusou");
    // 40 decisions of inaction are counted
    expect(html).toContain("40");
  });

  test("with no decision of inaction measured yet the card of the orders says nothing about it", () => {
    const html = draw({ status: sampleStatus({ scoreboard: { decisions: 0, protective: 0, noEntryPrice: 0, windows: Object.fromEntries(["15m", "1h", "4h", "24h"].map((id) => [id, { n: 0, overlapping: 0, notionalUsd: 0, settled: 0, pending: 0, unknownPrice: 0, grossUsd: 0, netUsd: null, hitRate: null, claim: null, claimBasis: null, claimReason: "sem_decisoes" }])), byMode: {}, inaction: { decisions: 0, windows: {} } } }) });
    expect(html).not.toContain("Quando o agente decide nao agir");
  });

  test("an order that went unanswered says the agent looks for its receipt by itself, and that the person's word is only the way out when the history cannot tell", () => {
    const inflight = [{ cycleId: "c1", atMs: NOW - 600_000, orderKey: "c1:x", stage: "incerta", candidateId: "x", side: "buy", stance: "buy_third", chainIndex: "501", symbol: "BBB", address: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", wallet: "agente", usd: 10, amountMinor: null, ref: "5Ksig11111111111", reason: "recusa_sem_prova", profile: "alvo_5", source: "modelo" }];
    const html = draw({ status: sampleStatus({ inFlight: inflight }) });
    expect(html).toContain("confirma sozinho");
    expect(html).toContain("nenhum codigo de transacao");
  });

  test("the state of the agent has a badge that names it, and the number the person came for is the biggest on the page", () => {
    const html = draw({ status: sampleStatus() });
    expect(html).toContain('data-mode="sombra"');
    expect(html).toContain("Analisando");
    expect(html).toContain("Patrimonio gerido");
  });

  test("when it all holds the card is gone and the agent is trading", () => {
    const s = sampleStatus({ mode: "limitado", authority: { level: "dinheiro", blocked: null, ownerPolicy: "exigida" }, wallet: WALLET_TRADING, last: null, config: { ...(rawStatus().status.config as object), managed: { kind: "agentica", evm: "0x2222222222222222222222222222222222222222", solana: null } } });
    const html = draw({ status: s });
    expect(html).not.toContain("o que falta para ele executar sozinho");
    expect(html).toContain("Operando");
    expect(html).toContain("Carteira 0x2222...2222");
  });

  test("the buttons of the steps shut while one runs", () => {
    expect(draw({ status: step({}), busy: "wallet" })).toMatch(/<button[^>]*disabled=""[^>]*>Instalando<\/button>/);
  });
});

describe("the agent holds itself back", () => {
  test("a pause of new purchases is shown, with its reason, and the exits are said to go on", () => {
    const s = sampleStatus({ paused: true, state: { ...CONNECTED_STATE, pausedUntilMs: NOW + 3_600_000, pauseReason: "disjuntor_de_perda" } });
    const html = draw({ status: s });
    expect(html).toContain("compras novas pausadas");
    expect(html).toContain("pausa de compras gravada por uma versao antiga da regra");
  });
});

describe("a cycle that waited", () => {
  test("the reason in a sentence", () => {
    const last = { ...(rawStatus().status.last as object), outcome: "bloqueado", reason: "relogio", orders: [], posture: null, consulted: false, view: [] };
    const html = draw({ status: sampleStatus({ last }) });
    expect(html).toContain("Esperando ha 3 min. O relogio do computador esta fora de hora em relacao a OKX.");
    expect(html).toContain("Nada foi avaliado neste ciclo.");
  });

  test("nothing to do is said as a decision, not as silence", () => {
    const last = { ...(rawStatus().status.last as object), orders: [], dropped: [], notes: [] };
    expect(draw({ status: sampleStatus({ last }) })).toContain("Nenhuma ordem: com o que ve agora, manter e a melhor decisao.");
  });

  test("a cycle that never ran says what to expect", () => {
    expect(draw({ status: sampleStatus({ last: null }) })).toContain("O agente ainda nao completou um ciclo");
  });
});

describe("the orders that were sent without an answer", () => {
  const stuck = [
    { orderKey: "cy-2:hold:token:1:0xabc@agente", atMs: NOW - 4 * 60_000, stage: "incerta", side: "sell", symbol: "AAA", chainIndex: "1", usd: 40, source: "modelo", reason: "tempo_esgotado" },
    { orderKey: "cy-3:buy:x@agente", atMs: NOW - 60_000, stage: "enviando", side: "buy", symbol: "BBB", chainIndex: "56", usd: 20, source: "modelo", reason: null },
  ];

  test("nothing in flight, no card", () => {
    expect(draw()).not.toContain("Ordens sem confirmacao");
  });

  test("each one is told, with the two ways to answer after the person looked at the wallet's history", () => {
    const html = draw({ status: sampleStatus({ inFlight: stuck }) });
    expect(html).toContain("Ordens sem confirmacao");
    expect(html).toContain("nunca manda a mesma ordem duas vezes");
    expect(html).toContain("Venda de US$ 40 em AAA");
    expect(html).toContain("sem confirmacao ha 4 min");
    expect(html).toContain("A troca nao respondeu a tempo e pode ter sido enviada.");
    expect(html.match(/Conferi: saiu/g)?.length).toBe(2);
    expect(html.match(/Conferi: nao saiu/g)?.length).toBe(2);
  });

  test("an order already TRANSMITTED to the network confirms itself at ANY age: no buttons and no need to click, the agent keeps looking for its receipt (the service down, the transaction pending, the app restarted), and only an order with no transaction hash asks for the person's word", () => {
    const sent = (ageMin: number) => ({ orderKey: "cy-9:hold:token:501:x@agente", atMs: NOW - ageMin * 60_000, stage: "incerta", side: "sell", symbol: "Chonk", chainIndex: "501", usd: 12, source: "modelo", reason: "transmitida", detail: null, ref: "5".repeat(88) });
    const fresh = draw({ status: sampleStatus({ inFlight: [sent(1)] }) });
    expect(fresh).toContain("Ordens sem confirmacao");
    expect(fresh).toContain("foi enviada a rede");
    expect(fresh).toContain("confirma sozinho");
    expect(fresh).not.toContain("Conferi: saiu");
    // the passing of time never turns it into a question: ten minutes, an hour, three days
    for (const age of [11, 90, 3 * 24 * 60]) {
      const late = draw({ status: sampleStatus({ inFlight: [sent(age)] }) });
      expect(late).not.toContain("Conferi: saiu");
      expect(late).not.toContain("Conferi: nao saiu");
      expect(late).toContain("confirma sozinho");
    }
    expect(draw({ status: sampleStatus({ inFlight: [sent(90)] }) })).toContain("continua procurando");
    // a refusal or a timeout that kept the hash is looked up by the agent too: no buttons either
    for (const reason of ["recusa_sem_prova", "tempo_esgotado"]) expect(draw({ status: sampleStatus({ inFlight: [{ ...sent(1), reason }] }) })).not.toContain("Conferi: nao saiu");
    // an unsettled order with NO hash (nothing the agent can search by) is the only one that asks for the person's word
    const refused = draw({ status: sampleStatus({ inFlight: [{ ...sent(1), reason: "recusa_sem_prova", ref: null }] }) });
    expect(refused).toContain("Conferi: nao saiu");
  });

  test("the answer buttons shut while something else is being done", () => {
    const html = draw({ status: sampleStatus({ inFlight: stuck }), busy: "resolve" });
    expect(html.match(/<button[^>]*disabled=""[^>]*>Conferi: saiu<\/button>/g)?.length).toBe(2);
  });

  test("another window holding the folder is announced at the top", () => {
    expect(draw({ status: sampleStatus({ lock: false }) })).toContain("Outra janela do app esta com a pasta do agente.");
    expect(draw()).not.toContain("Outra janela do app");
  });
});

describe("the page obeys the rules of the desk", () => {
  test("no middle dot, no dash, no accent, no animation word in anything it draws, in any state", () => {
    const states = [
      draw(),
      draw({ status: off() }),
      draw({ status: off(), noticeOpen: true }),
      draw({ status: sampleStatus({ paused: true, state: { ...CONNECTED_STATE, pausedUntilMs: NOW + 3_600_000, pauseReason: "disjuntor_de_perda" } }) }),
      draw({ status: sampleStatus({ wallet: { cli: "instalado", login: "aguardando", loginUrl: "https://web3.okx.com/account/sociallogin?a=1", agentic: false, address: null, solanaAddress: null, policy: "desconhecida", fundsUsd: null, next: "entrar" }, lock: false }) }),
      draw({ load: "loading", status: null }),
    ];
    for (const html of states) {
      const text = visible(html);
      expect(text).not.toMatch(/[·–—]/);
      expect(text).toMatch(/^[\x20-\x7e\s]+$/);
      expect(html).not.toMatch(/blink|pulse|animation/i);
    }
  });

  test("the page has no field at all, whatever the state", () => {
    for (const html of [draw(), draw({ status: off() }), draw({ status: off(), noticeOpen: true })]) {
      expect(html).not.toMatch(/<(input|select|textarea)/);
    }
  });
});
