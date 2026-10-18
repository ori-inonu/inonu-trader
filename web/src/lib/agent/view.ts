/**
 * The words and numbers of the agent's screen, pure (no clock but the one handed in, no network). Every code the core sends has a plain Portuguese sentence; a code nobody knows is "motivo nao reconhecido"
 * and never echoed. Text is written without accents and without the three characters the desk forbids. The screen never says the agent earned what the Placar did not measure.
 */
import { CHAIN_ORDER } from "../onchain/chains";
import type { AgentEvent, AgentStatus, CandidateView, CycleReport, InFlightOrder, LedgerRecord, Mandate, Mode, OrderOutcome, OrderStage, PlannedOrder, WalletNext, WindowId, WindowSummary } from "./types";
import { WINDOW_IDS } from "./types";

/** What the agent is doing with the money, in a word. It is not a switch: it follows from what is ready. */
export const MODE_TEXT: Readonly<Record<Mode, { readonly title: string; readonly does: string }>> = {
  desligado: { title: "Esperando a carteira", does: "Nada roda ate voce conectar uma carteira." },
  sombra: { title: "Analisando", does: "Le a carteira e o mercado, decide o que faria e mede se acertou. Ainda nao move dinheiro." },
  limitado: { title: "Operando", does: "Decide e executa sozinho na carteira do agente." },
};

const REASONS: Readonly<Record<string, string>> = {
  // the gate and the cycle
  desligado: "Nenhuma carteira conectada.",
  parado: "O agente foi parado.",
  recibo_sucesso: "Confirmada pelo historico da OKX.",
  recibo_erro: "O historico da OKX diz que a transacao nao saiu.",
  recibo_recuperado: "A OKX recusou sem provar nada e nao guardou o codigo da transacao. O agente a achou na rede publica pela carteira, pelo token e pelo valor, e ela foi confirmada. Nada foi enviado de novo.",
  conta_nao_lida: "Ainda nao li a conta da OKX. Em instantes o agente sabe se ja pode operar.",
  sem_login: "A conta da OKX nao esta com a sessao aberta. Entre de novo na conta.",
  carteira_agentica: "A carteira que o agente cuida ainda nao e a carteira do agente da OKX.",
  cli_instalado: "O programa da OKX ainda nao foi instalado.",
  credenciais_okx: "As chaves da OnchainOS ainda nao foram configuradas.",
  carteira_gerida: "Nenhuma carteira foi escolhida para o agente cuidar.",
  execucao_bloqueada: "O agente analisa e decide, mas nao executa ainda: falta algo do lado do dinheiro.",
  compras_pausadas: "As compras novas estao pausadas pelo proprio agente; as saidas e os stops continuam.",
  disjuntor_de_perda: "Pausa de compras gravada por uma versao antiga da regra, a partir de uma medicao que comparava decisoes com o que o preco fez depois. Isso nao e dinheiro perdido da carteira, e o agente reavalia essa pausa sozinho.",
  pausa_reavaliada: "A pausa de compras vinha de uma medicao que comparava vendas com manter o token. Isso nao e dinheiro perdido, so uma alternativa que nao aconteceu. O agente reavaliou a pausa com a regra atual e retomou as compras.",
  queda_do_dia: "A carteira perdeu mais de 5% de valor nas ultimas 24 horas, entao o agente pausou as compras novas.",
  queda_do_pico: "A carteira caiu mais de 12% desde o melhor momento da semana, entao o agente pausou as compras novas.",
  evidencia_perdida: "Pausa de compras gravada por uma versao antiga da regra, a partir da medicao da semana contra manter dolares (uma alternativa que nao aconteceu). O agente reavalia essa pausa sozinho.",
  token_marcado_risco: "A OKX marcou como risco um token que o agente mantem.",
  saida_do_plano_falhou: "Uma saida do plano nao saiu desta vez e sera tentada no proximo ciclo.",
  mandato_nao_gravou: "A estrategia escolhida pelo agente nao pode ser gravada.",
  retomou: "As compras novas voltaram.",
  conectou: "Carteira conectada.",
  desconectou: "Carteira desconectada.",
  aviso_desatualizado: "O aviso mudou. Leia de novo e conecte.",
  carteira_invalida: "Esse endereco de carteira nao e valido.",
  cli_ausente: "O programa da OKX ainda nao foi instalado.",
  sem_link_de_login: "O programa da OKX nao devolveu a pagina de entrada.",
  sem_enderecos: "A conta entrou, mas o programa da OKX nao devolveu os enderecos da carteira.",
  plataforma_nao_suportada: "Este computador ainda nao e suportado pelo instalador do programa da OKX.",
  download_falhou: "Nao foi possivel baixar o programa da OKX agora.",
  checksums_ilegivel: "A lista de verificacao da OKX nao trouxe esse programa.",
  hash_divergente: "O programa baixado nao confere com a assinatura publicada pela OKX, e foi descartado.",
  wallet_falhou: "Esse passo da carteira do agente nao deu certo.",
  cli_indisponivel: "O programa da OKX nao respondeu.",
  parar_antes_de_trocar_binario: "O programa da OKX nao troca enquanto o agente opera com ele.",
  valor_invalido: "O valor da ordem nao era um numero valido.",
  gasto_desconhecido: "O gasto de hoje nao pode ser somado, entao a ordem esperou.",
  ordem_em_voo: "Havia uma ordem enviada sem confirmacao para esse token.",
  arquivo_stop: "O arquivo STOP esta na pasta do agente. Apague-o para liberar.",
  ledger_corrompido: "O registro do agente esta corrompido, entao ele nao age.",
  ledger_nao_gravou: "Nao foi possivel gravar o registro, entao nada foi feito.",
  planos_ilegiveis: "Os planos de saida das posicoes nao puderam ser lidos.",
  relogio: "O relogio do computador esta fora de hora em relacao a OKX.",
  carteira_antiga: "Nao foi possivel ler a carteira agora.",
  ordens_em_voo: "Ha uma ordem enviada sem confirmacao. Nada novo sai desse token antes de voce conferir.",
  outra_instancia: "Outra janela do app esta com a pasta do agente. Os ciclos rodam so nela.",
  nao_conectado: "Conecte a carteira primeiro: o agente so instala e entra na conta depois que voce conecta.",
  conta_ilegivel: "A conta da OKX nao respondeu: o agente segue analisando e volta a operar quando ela responder.",
  politica_ausente: "Os limites da conta OKX nao estao ligados no portal. O agente segue em analise ate voce ligar os limites.",
  politica_frouxa: "Os limites da conta OKX estao frouxos demais para o app (acima do que ele aceita). O agente segue em analise ate voce apertar os limites no portal.",
  sessao_expirando: "A sessao da conta OKX esta perto de expirar.",
  endereco_divergente: "O endereco da subcarteira nao confere com o configurado.",
  binario_divergente: "O programa da OKX nao e o que foi verificado, entao nao foi executado.",
  sem_candidatos: "Nao havia o que decidir neste ciclo.",
  nada_a_decidir: "Nada tinha mais de uma opcao, entao o modelo nao foi consultado.",
  sem_modelo: "A chave do modelo nao esta configurada.",
  sem_mudanca: "Nada mudou desde a ultima consulta ao modelo.",
  consultas_esgotadas: "As consultas ao modelo de hoje acabaram.",
  tokens_esgotados: "Os tokens do modelo de hoje acabaram.",
  ritmo_do_dia: "As consultas ao modelo sao distribuidas ao longo do dia: esta ficou para a proxima, e as saidas por stop continuam.",
  orcamento_nao_gravou: "O contador de consultas nao pode ser gravado.",
  modelo_erro: "O modelo nao respondeu a tempo ou falhou.",
  agente_forma: "A resposta do modelo nao tinha o formato esperado.",
  agente_postura: "O modelo escolheu uma postura que nao existe.",
  agente_estados: "A resposta do modelo nao cobriu todos os candidatos.",
  agente_postura_invalida: "O modelo escolheu algo que nao foi oferecido.",
  agente_postura_incoerente: "O modelo quis comprar mais do que a postura permite.",
  agente_compra_e_venda: "O modelo quis comprar e vender o mesmo ativo.",
  agente_perfil_invalido: "A compra veio sem um alvo e uma saida validos.",
  ja_em_andamento: "Ja havia um ciclo em andamento.",
  excecao: "O ciclo falhou por um erro interno.",
  parado_no_ciclo: "Voce parou ou baixou o modo no meio do ciclo, e o resto foi cancelado.",
  sem_executor: "Nao ha programa de execucao configurado.",
  ordem_incerta: "Uma ordem ficou sem confirmacao e as outras foram seguradas.",
  ordem_falhou: "Uma ordem falhou e as outras foram seguradas.",
  // the signing tool
  carteira_nao_gerida: "A ordem era de uma carteira que o agente nao opera.",
  carteira_nao_agentica: "So a carteira da conta OKX conectada pode ser operada.",
  sem_endereco: "Falta o endereco da carteira nessa rede.",
  sem_moeda_de_liquidacao: "Nao ha moeda em dolar para pagar ou receber nessa rede.",
  ordem_invalida: "A ordem nao pode ser montada.",
  quote_demorou: "A cotacao demorou demais.",
  quote_recusada: "A cotacao foi recusada.",
  quote_ilegivel: "A cotacao veio ilegivel.",
  confirmando: "A OKX pediu confirmacao de risco. O agente nao confirma sozinho.",
  simulacao_falhou: "A rede recusou a simulacao da troca antes de enviar: nada saiu da carteira. O agente espera um tempo e tenta de novo sozinho.",
  gas_station_pendente: "A carteira do agente ficou com pouco SOL para pagar a taxa da rede. A OKX oferece pagar essa taxa em USDC (cerca de US$ 0,01 por operacao): e uma escolha sua e o agente nao ativa sozinho. Envie um pouco de SOL a carteira do agente ou ative o Gas Station na OKX.",
  honeypot: "O token parece uma armadilha de venda.",
  honeypot_desconhecido: "A cotacao nao garantiu que o token e seguro para vender, entao nao foi trocado.",
  cli_bloqueou: "O programa da OKX bloqueou a troca antes de assinar.",
  sessao_invalida: "A sessao da conta OKX nao esta valida: entre de novo na conta.",
  transmitida: "A transacao foi enviada a rede. O agente espera a confirmacao dela no historico da OKX.",
  recusa_sem_prova: "O programa da OKX respondeu que nao, mas nao ha prova de que nada saiu. Confira o historico da carteira.",
  quote_bloqueada: "A OKX bloqueou a troca.",
  quote_aviso: "A OKX avisou de risco na troca.",
  imposto_alto: "O token cobra um imposto alto na troca.",
  impacto_desconhecido: "O impacto no preco nao veio na cotacao.",
  impacto_alto: "O impacto no preco era alto demais.",
  saldo_insuficiente: "Faltou saldo na subcarteira.",
  taxa_sem_saldo: "Faltou moeda nativa para pagar a taxa da rede.",
  cli_recusou: "O programa da OKX recusou a troca.",
  tempo_esgotado: "A troca nao respondeu a tempo e pode ter sido enviada.",
  sem_resposta: "A troca ficou sem resposta e pode ter sido enviada.",
  sem_recibo: "A troca respondeu sem recibo e pode ter sido enviada.",
  // what was dropped
  sem_ordem: "A ordem nao podia ser montada.",
  limite_de_ordens: "Passou do maximo de ordens por ciclo.",
  sem_saldo: "Sem saldo lido para dimensionar a compra.",
  caixa_insuficiente: "O caixa nao cobria a compra.",
  teto_diario: "Passou do teto do dia.",
  // notes
  postura_limitou: "A postura do Jev limitou o tamanho de uma compra (ou segurou a segunda compra do ciclo).",
  topo_visto_pelo_jev: "O Jev avaliou que o preco ja estava no alto e preferiu nao comprar.",
  topo_sem_resposta: "O Jev nao respondeu se o preco estava no alto, e sem essa resposta o agente nao compra um preco esticado.",
  queda_vista_pelo_jev: "O Jev avaliou que o preco ainda estava caindo e preferiu esperar.",
  queda_sem_resposta: "O Jev nao respondeu se a queda tinha parado, e sem essa resposta o agente nao compra um preco em queda.",
  conviccao_reduziu: "O Jev nao estava seguro o bastante e a compra saiu menor.",
  conviccao_recusou: "O Jev nao estava seguro o bastante e a compra nao saiu.",
  conviccao_desconhecida: "O Jev nao disse o quanto estava seguro, entao a compra saiu no menor tamanho.",
  conviccao_moderou: "O Jev estava dividido sobre a venda e o agente vendeu o passo do meio.",
  fatos_indisponiveis: "Os dados de mercado das posicoes nao vieram.",
  ecossistema_indisponivel: "A varredura do ecossistema nao respondeu.",
  placar_nao_gravou: "A medicao de uma decisao nao foi gravada.",
  protecao_sem_preco: "Uma posicao com plano ficou sem preco, e o plano esperou.",
  protecao_sem_ordem: "Uma saida do plano nao pode ser montada.",
  plano_nao_gravou: "O plano de saida de uma compra nao foi gravado, e por isso a compra nao saiu.",
  plano_orfao: "O plano de uma posicao que ja saiu da carteira foi encerrado.",
  tokens_nao_comprovados: "Tokens sem liquidez que prove o valor ficaram de fora das contas.",
  // errors of the screen
  confirmacao_necessaria: "A frase digitada nao confere.",
  subir_um_nivel: "O modo sobe um degrau de cada vez.",
  nao_gravou: "Nao foi possivel gravar a mudanca.",
  modo_invalido: "Esse modo nao existe.",
  nao_esta_em_voo: "Essa ordem nao esta mais em voo. A tela vai se atualizar.",
  resolvida_pelo_usuario: "Resolvida por voce depois de conferir a carteira.",
  configuracao_invalida: "Algum valor da configuracao esta fora do permitido.",
  sem_conexao: "O servidor do agente nao respondeu.",
  servidor_sem_rota: "O servidor do agente esta desatualizado e nao conhece o agente.",
  origem_negada: "O servidor do agente recusou o pedido desta origem.",
  servidor_com_erro: "O servidor do agente respondeu com erro.",
  resposta_invalida: "O servidor do agente respondeu algo que nao se entende.",
};

/** The session of the signed-in account, in one sentence. The tool keeps the key; only the time left comes here. */
export function sessionText(leftMs: number | null): string {
  if (leftMs === null || !Number.isFinite(leftMs)) return "Sessao da conta OKX: nao foi possivel ler.";
  if (leftMs <= 0) return "Sessao da conta OKX: expirou. Entre de novo na conta.";
  const hours = leftMs / 3_600_000;
  if (hours >= 48) return `Sessao da conta OKX: vale por mais ${Math.floor(hours / 24)} dias.`;
  if (hours >= 1) return `Sessao da conta OKX: acaba em ${Math.floor(hours)} horas. Entre de novo na conta antes disso.`;
  return `Sessao da conta OKX: acaba em ${Math.max(1, Math.floor(leftMs / 60_000))} minutos. Entre de novo na conta antes disso.`;
}

export const reasonText = (code: string | null): string => (code === null ? "" : (REASONS[code] ?? "Motivo nao reconhecido."));

const READINESS: Readonly<Record<string, string>> = {
  carteira_gerida: "Informe o endereco da carteira que o agente vai gerir",
  credenciais_okx: "Cadastre as chaves da OKX nas configuracoes",
  chave_do_modelo: "Cadastre a chave do modelo nas configuracoes",
  cli_instalado: "Instale o programa da OKX e informe onde ele esta e o seu SHA256",
  carteira_agentica: "Use uma subcarteira do Agentic Wallet como carteira gerida",
};
export const readinessText = (code: string): string => READINESS[code] ?? "Requisito nao reconhecido";

export const STANCE_TEXT: Readonly<Record<string, string>> = {
  hold: "Manter",
  trim_third: "Vender um terco",
  trim_half: "Vender metade",
  exit_all: "Sair de tudo",
  skip: "Nao comprar",
  buy_tenth: "Comprar um decimo do maximo",
  buy_third: "Comprar um terco do maximo",
  buy_two_thirds: "Comprar dois tercos do maximo",
  buy_full: "Comprar o maximo",
};
export const stanceText = (stance: string): string => STANCE_TEXT[stance] ?? "Acao nao reconhecida";

export const PROFILE_TEXT: Readonly<Record<string, string>> = {
  alvo_2: "Alvo de 2%, saida se cair 1,5%, ate 24 horas",
  alvo_5: "Alvo de 5%, saida se cair 4%, ate 12 horas",
  alvo_10: "Alvo de 10%, saida se cair 6%, ate 36 horas",
  alvo_20: "Alvo de 20%, saida se cair 10%, ate 5 dias",
};
export const profileText = (profile: string | null): string => (profile === null ? "" : (PROFILE_TEXT[profile] ?? "Plano nao reconhecido"));

export const POSTURE_TEXT: Readonly<Record<string, string>> = { defensiva: "Defensiva", neutra: "Neutra", ofensiva: "Ofensiva" };

export const STAGE_TEXT: Readonly<Record<OrderStage, string>> = {
  preparada: "Preparada",
  enviando: "Enviando",
  executada: "Executada",
  falhou: "Falhou",
  incerta: "Sem confirmacao",
};

export const SOURCE_TEXT: Readonly<Record<string, string>> = { modelo: "Escolha do modelo", protecao: "Plano da posicao" };

/* ---------------------------------------------------------------- numbers and time */

/** Dollars as a Brazilian reads them: US$ 1.234,56. A null is a dash-free "sem valor". */
export function usdText(value: number | null, digits = 2): string {
  if (value === null || !Number.isFinite(value)) return "sem valor";
  const sign = value < 0 ? "-" : "";
  const fixed = Math.abs(value).toFixed(digits);
  const [whole, fraction] = fixed.split(".");
  return `${sign}US$ ${whole!.replace(/\B(?=(\d{3})+(?!\d))/g, ".")}${fraction === undefined ? "" : `,${fraction}`}`;
}

export function signedUsdText(value: number): string {
  return `${value > 0 ? "+" : ""}${usdText(value)}`;
}

export const pctText = (value: number | null, digits = 1): string => (value === null || !Number.isFinite(value) ? "sem valor" : `${value.toFixed(digits).replace(".", ",")}%`);
export const signedPctText = (value: number | null, digits = 1): string => (value === null || !Number.isFinite(value) ? "sem valor" : `${value > 0 ? "+" : ""}${pctText(value, digits)}`);

/** "agora", "ha 4 min", "ha 3 h", "ha 2 d". */
export function agoText(atMs: number | null, nowMs: number): string {
  if (atMs === null) return "nunca";
  const s = Math.max(0, Math.round((nowMs - atMs) / 1000));
  if (s < 45) return "agora";
  if (s < 3600) return `ha ${Math.max(1, Math.round(s / 60))} min`;
  if (s < 86400) return `ha ${Math.round(s / 3600)} h`;
  return `ha ${Math.round(s / 86400)} d`;
}

/** "em 7 min", "em 1 h 20 min", "agora". */
export function inText(atMs: number | null, nowMs: number): string {
  if (atMs === null) return "sem data";
  const s = Math.round((atMs - nowMs) / 1000);
  if (s <= 30) return "agora";
  if (s < 3600) return `em ${Math.max(1, Math.round(s / 60))} min`;
  const h = Math.floor(s / 3600);
  const m = Math.round((s % 3600) / 60);
  return m === 0 ? `em ${h} h` : `em ${h} h ${m} min`;
}

export function shortAddress(address: string | null): string {
  if (address === null) return "nao informado";
  return address.length <= 12 ? address : `${address.slice(0, 6)}...${address.slice(-4)}`;
}

/* ---------------------------------------------------------------- what the agent says about itself */

/** The one sentence at the top: what the agent is doing, or why it is not. */
/**
 * What the agent is really doing, which is not always what it may do: the derived mode says what it may do with the money, the last cycle says what it did, and a step still waiting on the person (the limits
 * in the OKX portal) means it is not trading yet. The page never says it is operating when it is only analysing.
 */
export function effectiveMode(status: AgentStatus): Mode {
  // the server says what is in force; the derived mode only says what the agent is ELIGIBLE to do
  return status.authority.level === "dinheiro" ? "limitado" : status.authority.level === "analise" ? "sombra" : "desligado";
}

/** The sentence under the headline: what the agent does with the money now, and whose limits hold. */
export function modeLead(status: AgentStatus): string {
  const mode = effectiveMode(status);
  if (mode === "limitado") {
    return status.authority.ownerPolicy === "dispensada"
      ? "Decide e executa sozinho na carteira do agente, dentro dos tetos do proprio app. Os limites do portal da OKX estao dispensados, por escolha sua."
      : "Decide e executa sozinho na carteira do agente, dentro dos limites da conta OKX.";
  }
  if (mode === "sombra") return `${MODE_TEXT.sombra.does}${status.authority.blocked === null ? "" : ` ${reasonText(status.authority.blocked)}`}`;
  return MODE_TEXT.desligado.does;
}

/**
 * What the model saw in a cycle that ended with no order, in a sentence: how many purchases it could really choose, and how close it came to the nearest one (the share of its answer that was for buying). Null when it
 * was not asked, or nothing was open for it. The page says what the model did and how sure it was; it never says the purchase was good.
 */
export function consultLine(last: CycleReport): string | null {
  if (!last.consulted) return null;
  const open = last.view.filter((v) => v.kind === "buy" && v.closed === null);
  if (open.length === 0) return null;
  const count = `${open.length} ${open.length === 1 ? "compra aberta" : "compras abertas"}`;
  let best: { readonly symbol: string; readonly lean: number } | null = null;
  for (const v of open) {
    const lean = Object.entries(v.probs ?? {}).reduce((sum, [key, p]) => (key.startsWith("buy_") && Number.isFinite(p) ? sum + p : sum), 0);
    if (lean > 0 && (best === null || lean > best.lean)) best = { symbol: v.symbol.slice(0, 12), lean };
  }
  if (best === null) return `o Jev olhou ${count} e preferiu esperar`;
  const pct = Math.round(best.lean * 100);
  if (best.lean >= 0.5 && last.notes.includes("conviccao_recusou")) return `o Jev olhou ${count}, inclinou para comprar ${best.symbol} (${pct}% a favor), mas a confianca nao bastou`;
  return `o Jev olhou ${count} e preferiu esperar; a mais perto de comprar foi ${best.symbol}, com ${pct}% a favor`;
}

/**
 * The orders of the last cycle as they stand NOW. The cycle freezes each order at the stage it had when the cycle ended (a swap is `transmitida` for the seconds before its receipt), and the receipt settles it later in
 * the ledger: the page shows the newest stage of the order in the ledger tail (same cycle, same side, same token), so a confirmed sale is not left reading "sem confirmacao".
 */
export function currentOrders(status: AgentStatus): readonly OrderOutcome[] {
  const last = status.last;
  if (last === null) return [];
  return last.orders.map((o) => {
    let latest: LedgerRecord | null = null;
    for (const r of status.ledger) {
      if (r.kind !== "order" || r.stage === undefined || r.cycleId !== last.cycleId || r.side !== o.order.side || r.symbol !== o.order.symbol) continue;
      if (latest === null || r.atMs >= latest.atMs) latest = r;
    }
    return latest === null || latest.stage === undefined || latest.stage === o.stage ? o : { ...o, stage: latest.stage, reason: latest.reason };
  });
}

/** What each order of a cycle is, in a sentence: who asked for it (the model or the plan of the position), what and how much. At most two are named, the rest counted. Empty when there is none. */
export function cycleOrdersLine(orders: readonly OrderOutcome[]): string {
  if (orders.length === 0) return "";
  const phrase = (o: OrderOutcome): string => {
    const { side, stance, symbol, usd } = o.order;
    const what = side === "buy" ? "comprar" : stance === "exit_all" ? "sair de" : stance === "trim_half" ? "vender metade de" : stance === "trim_third" ? "vender um terco de" : "vender";
    return `${what} ${symbol.slice(0, 12)} (US$ ${Math.round(usd)})`;
  };
  const byPlan = orders.every((o) => o.order.source === "protecao");
  const who = byPlan ? "o plano de protecao mandou" : "o Jev mandou";
  const named = orders.slice(0, 2).map(phrase);
  const rest = orders.length - named.length;
  const list = rest > 0 ? `${named.join(", ")} e mais ${rest}` : named.join(" e ");
  return `${orders.length === 1 ? "Ordem" : "Ordens"}: ${who} ${list}.`;
}

export function headline(status: AgentStatus, nowMs: number): string {
  if (!status.connected) return "Conecte a carteira e o agente comeca a trabalhar.";
  if (status.stopFile) return "O arquivo STOP esta na pasta do agente. Apague-o para liberar.";
  if (status.managed.evm === null && status.managed.solana === null) return "Conectado. O agente espera uma carteira para cuidar: entre com a conta OKX.";
  const last = status.last;
  const mode = effectiveMode(status);
  const waitingLimits = status.authority.blocked === "politica_ausente" || status.authority.blocked === "politica_frouxa" ? " Falta ligar os limites da carteira no portal da OKX, ou dispensa-los, para ele passar a executar." : "";
  const pause = status.paused ? ` Compras novas pausadas${status.pausedUntilMs === null ? "" : ` ${inText(status.pausedUntilMs, nowMs)}`}: ${reasonText(status.pauseReason).toLowerCase()}` : "";
  if (last === null) return `${MODE_TEXT[mode].title}. O primeiro ciclo ${inText(status.scheduler.nextAtMs, nowMs)}.${waitingLimits}${pause}`;
  const when = agoText(last.atMs, nowMs);
  if (last.outcome === "bloqueado") return `Esperando ${when}. ${reasonText(last.reason)}${pause}`;
  if (last.outcome === "erro") return `Erro ${when}. ${reasonText(last.reason)}${pause}`;
  const nowOrders = currentOrders(status);
  const orders = nowOrders.length;
  const executed = nowOrders.filter((o) => o.stage === "executada").length;
  if (last.outcome === "decidido") {
    const posture = last.posture === null ? "" : `postura ${POSTURE_TEXT[last.posture]!.toLowerCase()}, `;
    if (orders === 0) {
      const saw = consultLine(last);
      return `${MODE_TEXT[mode].title}. Decidiu ${when}: ${saw === null ? `${posture}nada a fazer agora` : saw}.${pause}`;
    }
    const sent = cycleOrdersLine(nowOrders);
    if (mode === "limitado") return `Operando. Decidiu ${when}: ${posture}${executed} de ${orders} ${orders === 1 ? "ordem executada" : "ordens executadas"}.${sent === "" ? "" : ` ${sent}`}${pause}`;
    return `Analisando. Decidiu ${when}: ${posture}${orders} ${orders === 1 ? "ordem seria feita" : "ordens seriam feitas"} quando a carteira do agente estiver pronta.${sent === "" ? "" : ` ${sent}`}${waitingLimits}${pause}`;
  }
  return `${MODE_TEXT[mode].title}. Ciclo ${when}: ${reasonText(last.reason) || "nada a fazer"}${pause}`;
}

export function windowLabel(id: WindowId): string {
  return id === "15m" ? "15 minutos" : id === "1h" ? "1 hora" : id === "4h" ? "4 horas" : "24 horas";
}

/** What a window of the Placar may be said to show. It never claims what the measurement does not support. */
export function evidenceText(w: WindowSummary): string {
  if (w.claim === "acima_de_manter" || w.claim === "nao_acima_de_manter") {
    // the cost of an order is the one its quote announced (network fee and price impact on the size): an estimate, never what the chain charged, and the text says so
    const basis = w.claimBasis === "bruto" ? " (bruto, custo ainda nao medido)" : w.claimBasis === "liquido" ? " (liquido do custo estimado pela cotacao)" : "";
    const value = w.claimBasis === "liquido" && w.netUsd !== null ? w.netUsd : w.grossUsd;
    const verdict = w.claim === "acima_de_manter" ? "Acima de manter em dolares" : "Nao acima de manter em dolares";
    return `${verdict}: ${signedUsdText(value)} em ${w.settled} decisoes, acerto de ${pctText(w.hitRate === null ? null : w.hitRate * 100, 0)}${basis}.`;
  }
  switch (w.claimReason) {
    case "sem_decisoes":
      return "Ainda sem decisoes para medir.";
    case "janela_incompleta":
      return `Janela ainda aberta: ${w.pending} decisoes esperando o preco.`;
    case "amostra_pequena":
      return `Amostra pequena: ${w.settled} decisoes medidas, e menos de 30 nao prova nada.${w.overlapping > 0 ? ` ${w.overlapping} repeticoes da mesma aposta nao contam.` : ""}`;
    case "precos_faltando":
      return "Faltaram precos para medir a janela.";
    case "modos_misturados":
      return "Sombra, assistido e limitado misturados: cada modo e medido sozinho.";
    default:
      return "Sem afirmacao possivel.";
  }
}

export interface EvidenceLine {
  readonly id: WindowId;
  readonly label: string;
  readonly settled: number;
  readonly pending: number;
  readonly grossUsd: number;
  readonly hitRate: number | null;
  readonly text: string;
  readonly claim: WindowSummary["claim"];
}

export function evidenceLines(windows: AgentStatus["windows"]): EvidenceLine[] {
  return WINDOW_IDS.map((id) => ({ id, label: windowLabel(id), settled: windows[id].settled, pending: windows[id].pending, grossUsd: windows[id].grossUsd, hitRate: windows[id].hitRate, text: evidenceText(windows[id]), claim: windows[id].claim }));
}

/** Whether the measurement supports putting money to work. Advisory: the person decides, and the screen says so. */
export function moneyEvidence(windows: AgentStatus["windows"]): { readonly supported: boolean; readonly text: string } {
  const day = windows["24h"];
  if (day.claim === "acima_de_manter") return { supported: true, text: `A sombra mediu ${signedUsdText(day.claimBasis === "liquido" && day.netUsd !== null ? day.netUsd : day.grossUsd)} acima de manter em dolares em 24 horas.` };
  return { supported: false, text: `Ainda sem evidencia medida de ganho: ${evidenceText(day)}` };
}

export function orderLine(o: OrderOutcome | PlannedOrder): string {
  const order = "order" in o ? o.order : o;
  const verb = order.side === "buy" ? "Comprar" : "Vender";
  const who = order.wallet === "principal" ? " (carteira principal, so com a sua mao)" : "";
  return `${verb} ${usdText(order.usd, 0)} de ${order.symbol}, ${stanceText(order.stance).toLowerCase()}${who}`;
}

export function ledgerLine(r: LedgerRecord, nowMs: number): string {
  const when = agoText(r.atMs, nowMs);
  if (r.kind === "cycle") {
    const base = r.outcome === "decidido" ? "Decidiu" : r.outcome === "mantido" ? "Manteve" : r.outcome === "bloqueado" ? "Bloqueado" : "Erro";
    const why = r.reason === null ? "" : `: ${reasonText(r.reason)}`;
    return `${when}. ${base}${why}`;
  }
  const verb = r.side === "buy" ? "Compra" : "Venda";
  const stage = r.stage === undefined ? "" : STAGE_TEXT[r.stage].toLowerCase();
  const who = r.source === "protecao" ? " (plano da posicao)" : "";
  const why = r.reason === null ? "" : `: ${reasonText(r.reason)}`;
  return `${when}. ${verb} de ${r.symbol ?? "?"}, ${r.usd === undefined ? "" : `${usdText(r.usd, 0)}, `}${stage}${who}${why}`;
}

const SOLANA_SIGNATURE = /^[1-9A-HJ-NP-Za-km-z]{64,90}$/;
const EVM_HASH = /^0x[0-9a-fA-F]{64}$/;

/** Whether the order carries the transaction hash of its own network, the one thing the agent's receipt lookup can search by: a Solana signature on Solana, a 0x hash on an EVM network. An id, a short or malformed text, or the hash of another network is not it. */
export function hasTxRef(o: InFlightOrder): boolean {
  const ref = o.ref;
  return typeof ref === "string" && (o.chainIndex === "501" ? SOLANA_SIGNATURE : EVM_HASH).test(ref);
}

/**
 * Whether the person's word is asked about an order sent without an answer. Only when it has NO hash the agent can look up: with one, the agent searches the OKX history by it (and, for Solana, the public chain
 * when the history does not know it) by itself, as many times as it takes (the service down, the transaction pending, the app restarted in between), whatever the reason the order was left open for and however old
 * it is. Without a hash there is nothing to search by.
 */
export function needsPersonWord(o: InFlightOrder): boolean {
  return !hasTxRef(o);
}

/** A wait this long is said in plain words, still without a question. */
const LONG_WAIT_MS = 60 * 60_000;

/** An order sent without an answer, in one sentence: what it was, how long ago, and why nobody knows. */
export function inFlightLine(o: InFlightOrder, nowMs: number): string {
  const verb = o.side === "buy" ? "Compra" : "Venda";
  const who = o.source === "protecao" ? " do plano da posicao" : "";
  const state = o.stage === "enviando" ? "enviada, sem resposta" : "sem confirmacao";
  const why = o.reason === null ? "" : ` ${reasonText(o.reason)}`;
  const said = o.detail === null || o.detail === undefined ? "" : ` A OKX disse: ${o.detail}`;
  const long = hasTxRef(o) && nowMs - o.atMs >= LONG_WAIT_MS ? " A confirmacao esta demorando; o agente continua procurando sozinho e nao precisa de nenhum clique." : "";
  return `${verb}${who} de ${usdText(o.usd, 0)} em ${o.symbol} na rede ${chainName(o.chainIndex)}, ${state} ${agoText(o.atMs, nowMs)}.${why}${said}${long}`;
}

export function budgetText(b: AgentStatus["budget"]): string {
  return `${b.consults} de ${b.maxConsultsPerDay} consultas ao modelo hoje`;
}

export const CONTEXT_LABEL: Readonly<Record<string, string>> = {
  btc_24h: "BTC em 24 horas",
  eth_24h: "ETH em 24 horas",
  tendencia: "Tendencia do mercado",
  vol_btc: "Volatilidade do BTC",
  fund_btc_bps: "Funding do BTC perpetuo (pontos-base)",
  oi_btc_1h: "Posicoes abertas do BTC em 1 hora",
  s1_escolha: "Leitura do System One",
  s1_regime: "Regime do System One",
  s1_idade_min: "Idade da leitura do System One",
};

export function contextRows(context: AgentStatus["context"]): { readonly label: string; readonly value: string }[] {
  if (context === null) return [];
  const rows: { label: string; value: string }[] = [];
  for (const [key, label] of Object.entries(CONTEXT_LABEL)) {
    const v = context[key];
    if (v === undefined || v === null) continue;
    rows.push({ label, value: typeof v === "number" ? (key.endsWith("_min") ? `${v} min` : signedPctText(v)) : v });
  }
  return rows;
}

export function cycleSummary(c: CycleReport): string {
  const parts: string[] = [];
  if (c.consulted) parts.push(c.modelo === null ? "modelo consultado" : `consultou ${c.modelo}`);
  parts.push(`${c.considered.holdings} posicoes e ${c.considered.buys} compras avaliadas`);
  if (c.considered.protected > 0) parts.push(`${c.considered.protected} pelo plano`);
  return parts.join(", ");
}

export const chainName = (chainIndex: string): string => CHAIN_ORDER.find((c) => c.chainIndex === chainIndex)?.name ?? `Rede ${chainIndex}`;

/* ---------------------------------------------------------------- the plan of a position */

export const PROFILE_SPEC: Readonly<Record<string, { readonly target: number; readonly stop: number }>> = { alvo_2: { target: 2, stop: 1.5 }, alvo_5: { target: 5, stop: 4 }, alvo_10: { target: 10, stop: 6 }, alvo_20: { target: 20, stop: 10 } };

/** Where a position stands between its stop (0) and its target (1), from the percent since the entry. Null when the price or the profile is unknown. */
export function planProgress(profile: string, sinceEntryPct: number | null): number | null {
  const spec = PROFILE_SPEC[profile];
  if (spec === undefined || sinceEntryPct === null || !Number.isFinite(sinceEntryPct)) return null;
  return Math.min(1, Math.max(0, (sinceEntryPct + spec.stop) / (spec.target + spec.stop)));
}

export function planLine(plan: NonNullable<AgentStatus["book"]>["positions"][number]["plan"]): string {
  if (plan === null) return "";
  const parts = [profileText(plan.profile)];
  if (plan.sinceEntryPct !== null) parts.push(`${signedPctText(plan.sinceEntryPct)} desde a entrada`);
  if (plan.targetHit) parts.push(plan.trimmed ? "metade ja realizada, o resto segue o recuo maximo" : "alvo atingido");
  else if (plan.toTargetPct !== null && plan.toTargetPct > 0) parts.push(`faltam ${pctText(plan.toTargetPct)} para o alvo`);
  parts.push(`${Math.round(plan.hoursLeft)} h restantes`);
  return parts.join(", ");
}

/* ---------------------------------------------------------------- the strategy the agent chose, and where its wallet stands */

export const RISK_TEXT: Readonly<Record<Mandate["risk"], string>> = { cauteloso: "Cauteloso", moderado: "Moderado", agressivo: "Agressivo" };
export const RESERVE_TEXT: Readonly<Record<Mandate["reserve"], string>> = { baixa: "Pouco caixa guardado", media: "Caixa normal", alta: "Muito caixa guardado" };
export const CONCENTRATION_TEXT: Readonly<Record<Mandate["concentration"], string>> = { pequena: "Apostas pequenas", media: "Apostas medias", grande: "Apostas grandes" };
export const LOOK_TEXT: Readonly<Record<Mandate["look"], string>> = { rapido: "Olha o mercado a cada 5 minutos", normal: "Olha o mercado a cada 10 minutos", calmo: "Olha o mercado a cada 20 minutos" };

/** The choices of the agent, each in a plain line, with the reason when the measurement keeps one from being honoured. */
export function strategyRows(a: AgentStatus["autopilot"]): { readonly label: string; readonly value: string; readonly note: string }[] {
  const risk = a.mandate.risk === a.riskTaken ? RISK_TEXT[a.riskTaken] : `${RISK_TEXT[a.riskTaken]} (pediu ${RISK_TEXT[a.mandate.risk].toLowerCase()}, falta medir mais)`;
  return [
    { label: "Risco por operacao", value: risk, note: a.ownerProfile === "arrojado" ? "Perfil arrojado, definido por voce: o agente nao espera a medicao para assumir o risco. Os tetos, o stop de cada posicao e a parada do dia continuam valendo." : a.aggressiveOpen ? "O historico medido liberou o perfil agressivo." : "O perfil agressivo so entra quando a medicao provar vantagem." },
    { label: "Caixa guardado", value: `${RESERVE_TEXT[a.mandate.reserve]} (${Math.round(a.reserveShare * 100)}%)`, note: "" },
    { label: "Tamanho de cada compra", value: a.caps.maxBuyUsd === null ? "O Jev escolhe, sem teto fixo" : `${CONCENTRATION_TEXT[a.mandate.concentration]}, ate ${usdText(a.caps.maxBuyUsd, 0)}`, note: a.capsSource === "politica_do_dono" ? "Limitado pela politica da sua conta OKX." : a.caps.maxBuyUsd === null ? "Sem teto diario nem por compra, por decisao sua. A trava da sua conta OKX continua valendo." : "" },
    { label: "Ritmo", value: LOOK_TEXT[a.mandate.look], note: "" },
  ];
}

/** The page of the OKX portal where the owner turns the limits of the Agentic Wallet on. */
export const POLICY_URL = "https://web3.okx.com/portfolio/agentic-wallet-policy";

export const WALLET_STEP: Readonly<Record<WalletNext, { readonly title: string; readonly body: string; readonly action: string | null }>> = {
  instalar: { title: "Instalando o programa da OKX", body: "O agente baixa o programa oficial da OKX e confere a assinatura de integridade que a propria OKX publica. Sem ele o agente analisa, mas nao executa.", action: "Instalar agora" },
  entrar: { title: "Entrar na conta OKX", body: "A entrada acontece na pagina da propria OKX. O agente passa a gerir a carteira da conta em que voce entrar, com a chave guardada no cofre da OKX: se voce ja usa a carteira da OKX com essa conta, e a mesma carteira, com os mesmos ativos.", action: "Abrir a pagina de entrada" },
  depositar: { title: "Saldo na carteira do agente", body: "O agente negocia o que estiver na carteira da conta OKX em que voce entrou, nos enderecos abaixo. Se voce ja usa a carteira da OKX com esta conta, os seus ativos ja estao aqui e nao ha nada para enviar. Ativos que estiverem em outra carteira (outro aplicativo ou extensao) so entram se voce os transferir para estes enderecos, como estao, sem vender: escolha o quanto.", action: null },
  definir_politica: {
    title: "Ligar os limites de seguranca no portal da OKX",
    body: "Para executar, o agente exige que os limites da carteira dele estejam ligados no portal da OKX. E uma trava da propria OKX que nem este app consegue desfazer: mesmo que algo de errado aconteca aqui, a carteira nao passa dos limites. Abra a pagina, entre com a mesma conta e ligue os tres limites: por transacao (sugestao US$ 25), por dia em compras e vendas (sugestao US$ 100) e por dia em transferencias (sugestao US$ 1, ja que o agente nunca transfere para fora). Depois volte aqui: esta tela percebe sozinha.",
    action: "Abrir os limites na OKX",
  },
  operando: { title: "Operando", body: "A carteira do agente esta pronta e ele executa sozinho.", action: null },
};

export function eventLine(e: AgentEvent, nowMs: number): string {
  const what = e.kind === "conectou" ? "Carteira conectada" : e.kind === "desconectou" ? "Carteira desconectada" : e.kind === "pausou" ? "Compras novas pausadas" : "Compras novas voltaram";
  return `${agoText(e.atMs, nowMs)}. ${what}${e.kind === "pausou" ? `: ${reasonText(e.reason).toLowerCase()}` : ""}`;
}

export const FAMILY_TEXT: Readonly<Record<string, string>> = {
  carteiras: "carteiras rastreadas comprando",
  fluxo: "fluxo comprador",
  liquidez: "liquidez boa",
  tracao: "tracao de volume",
  distribuicao: "distribuicao saudavel",
  retracao: "retracao dentro da alta",
  alta_com_folego: "alta com folego",
};

/** Why the code closed a purchase (the model was offered only to skip it). */
const CLOSED_TEXT: Readonly<Record<string, string>> = {
  entrada_esticada: "preco esticado, entrar agora seria comprar no alto",
  sem_historico: "sem historico de preco suficiente",
  sem_perfil: "volatilidade sem alvo e stop que se sustentem",
  estagnado: "parado ha horas, prenderia o capital a toa",
  sem_tamanho: "sem caixa nessa rede para uma ordem minima",
  abaixo_do_minimo: "o caixa dessa rede existe, mas nem a menor fatia chega na ordem minima da rede",
};

/** The opportunities the agent looked at in its last cycle, one line each: what it is, what it chose, and why in a few words. */
export function radarRows(view: readonly CandidateView[]): { readonly id: string; readonly symbol: string; readonly chain: string; readonly kind: "holding" | "buy"; readonly verdict: string; readonly why: string }[] {
  return view.map((v) => {
    const closed = v.kind === "buy" && v.closed !== null && v.closed !== undefined;
    const verdict = v.stance === null ? "Avaliando" : closed ? "Fechada pelo codigo" : v.kind === "buy" && v.stance === "skip" ? "Nao comprar" : stanceText(v.stance);
    const reasons = [...(closed ? [CLOSED_TEXT[v.closed!] ?? v.closed!.replace(/_/g, " ")] : []), ...v.families.map((f) => FAMILY_TEXT[f] ?? f.replace(/_/g, " ")), ...v.marks.map((m) => m.replace(/_/g, " "))].slice(0, 3);
    return { id: v.id, symbol: v.symbol, chain: chainName(v.chainIndex), kind: v.kind, verdict, why: reasons.join(", ") };
  });
}
