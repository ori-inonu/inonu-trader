// Classifies every page of the OnchainOS docs mirror (API-6): one decision, requirement ids and task ids per page.
//
// generate: bun --no-env-file run docs/sdd/inonu-desktop-v1/tools/okx-coverage.ts --mirror <dir> [--date 2026-10-12]
// reclassify (no network, keeps every SHA-256): bun --no-env-file run docs/sdd/inonu-desktop-v1/tools/okx-coverage.ts --reclassify [--date 2026-10-13]
//   applies the current RULES to the pages already in onchainos-coverage.json, for a revision of the rules that does not need the docs again.
// check:    bun --no-env-file run docs/sdd/inonu-desktop-v1/tools/okx-coverage.ts --check [--mirror <dir>]
//   check needs no mirror: it validates onchainos-coverage.json and cross-checks ids against SPEC.md and TASKS.md.
//   with --mirror it also detects pages that appeared, vanished or changed (SHA-256) since generation.
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const HERE = import.meta.dir;
const ROOT = join(HERE, "..");
const JSON_PATH = join(ROOT, "onchainos-coverage.json");
const MD_PATH = join(ROOT, "onchainos-coverage.md");
const SOURCE = "https://web3.okx.com/pt-br/onchainos/dev-docs/";

export const DECISIONS = ["integrar-agora", "sob-demanda", "especificado-desligado", "depois", "fora", "referencia"] as const;
export type Decision = (typeof DECISIONS)[number];

type Rule = { id: string; re: RegExp; grupo: string; decisao: Decision; motivo: string; req: string[]; tarefas: string[] };

const r = (id: string, re: RegExp, grupo: string, decisao: Decision, motivo: string, req: string[], tarefas: string[] = []): Rule => ({ id, re, grupo, decisao, motivo, req, tarefas });

/** Ordered, first match wins. Every page must match one rule (the generator throws otherwise). */
export const RULES: Rule[] = [
  // ---- home
  r("home-auth", /^home\/api-access-and-usage$/, "Autenticacao", "integrar-agora", "assinatura HMAC-SHA256, 4 cabecalhos, tolerancia de 30 s", ["API-2", "API-3", "API-11"], ["T3.2", "T3.4"]),
  r("home-portal", /^home\/developer-portal$/, "Portal", "integrar-agora", "3 projetos por conta, 3 chaves por projeto, passphrase", ["CFG-5", "WIN-8"], ["T0.3", "T2.3"]),
  r("home-chains", /^home\/supported-chain$/, "Redes", "integrar-agora", "lista de redes por familia", ["CHN-1", "CHN-3"], ["T3.6"]),
  r("home-changelog", /^home\/change-log$/, "Referencia", "referencia", "monitorar mudancas do provedor", ["API-6"], ["T3.1"]),
  r("home-intro", /^home\/(what-is-onchainos|support)$/, "Referencia", "referencia", "apresentacao e contato", ["API-6"]),
  r("home-agentic", /^home\/(agentic-wallet-overview|install-your-agentic-wallet|run-your-first-ai-agent)$/, "Agentic Wallet", "fora", "carteira em TEE que negocia sozinha: viola o app nunca assina sozinho", ["WAL-8"]),
  r("home-mcp", /^home\/skills-mcp-services$/, "MCP e Skills", "fora", "perde controle de chamadas e formato compacto (ADR-6)", ["API-1"]),
  r("home-dapp-demo", /^home\/run-your-first-dapp$/, "Demo", "fora", "demo usa chave privada e SDK de execucao", ["WAL-8"]),

  // ---- market: cost, payment, tools
  r("mkt-fee", /^market\/market-api-fee$/, "Custo", "integrar-agora", "cota gratuita, camadas Basic e Premium, x402", ["API-3"], ["T3.4"]),
  r("mkt-x402", /^market\/(how-to-finish-api-payment|payment-error-handling)$/, "x402", "fora", "pagamento exige assinatura por chamada; 402 vira cota esgotada", ["API-10"]),
  r("mkt-intro", /^market\/(market-api-introduction|support)$/, "Referencia", "referencia", "introducao e suporte", ["API-6"]),
  r("mkt-ai-tools", /^market\/market-ai-tools-/, "MCP e Skills", "fora", "ferramentas de agente; REST direto da controle de chamadas", ["API-1"]),

  // ---- market: websocket (paid plan only)
  r("mkt-ws-err", /^market\/websocket-error-code$/, "WebSocket", "referencia", "codigos do WebSocket", ["API-7"], ["T3.7"]),
  r("mkt-ws", /^market\/websocket/, "WebSocket", "especificado-desligado", "exige plano pago; 3 conexoes por segundo, 480 inscricoes por hora", ["API-7"], ["T3.7"]),

  // ---- market: error codes, references, chains
  r("mkt-errors", /^market\/(balance-error-code|market-price-error-code|market-portfolio-error-code|market-scan-chain-error-code|market-social-news-error-code|market-token-error-code|onchaindata-error-code|tx-history-error-code|index-price-error-code)$/, "Codigos de erro", "integrar-agora", "tabela de erros mapeada no normalizador (50011, 50038, 81001, 81104)", ["API-5", "API-12"], ["T3.3"]),
  r("mkt-refs", /^market\/(balance-reference|index-price-reference|market-portfolio-reference|market-price-reference|market-signal-reference|market-social-news-reference|market-token-reference|tx-history-reference|market-scan-chain-api-reference|onchaindata-[a-z]+-reference)$/, "Referencia", "referencia", "indice de referencia da familia", ["API-6"]),
  r("mkt-chains", /^market\/(balance-chains|index-price-chains|market-price-chains|market-signal-chains|market-signal-leaderboard-supported-chain|market-portfolio-supported-chain|market-token-cluster-supported-chain|market-memepump-get-supported-chains-and-protocols|tx-history-chains|onchaindata-[a-z]+-supported-chains)$/, "Redes por familia", "integrar-agora", "descoberta da capacidade por familia (gratuito)", ["CHN-3"], ["T3.6"]),

  // ---- market: price and candles
  r("mkt-price", /^market\/(market-price|index-price|historical-index-price)$/, "Preco", "integrar-agora", "preco atual e indice de referencia (indice e gratuito)", ["API-4"], ["T3.3"]),
  r("mkt-candles", /^market\/market-candlesticks$/, "Velas", "integrar-agora", "velas de tokens on-chain (ate 299 por chamada, 1440 mais recentes)", ["API-4", "FLX-9"], ["T3.3"]),
  r("mkt-candles-hist", /^market\/market-candlesticks-history$/, "Velas", "sob-demanda", "historico confirmado (Premium), profundidade nao documentada", ["API-4"], ["T3.3"]),
  r("mkt-trades", /^market\/market-trades$/, "Fluxo", "integrar-agora", "negocios com lado compra ou venda e valor em USD (ate 500 por chamada)", ["FLX-9"], ["T3.3", "T5.6"]),

  // ---- market: token intelligence
  r("mkt-token-core", /^market\/market-token-(search|hot-token|basic-info|price-info|top-liquidity)$/, "Token", "integrar-agora", "busca, tendencia, logos, janelas de preco e liquidez", ["API-4", "SRC-5", "ICO-4", "RAS-2"], ["T3.3", "T3.5", "T8.2"]),
  r("mkt-token-adv", /^market\/market-token-advanced-info$/, "Token", "sob-demanda", "risco do token (Premium)", ["API-4", "SMT-4"], ["T3.3", "T6.3"]),
  r("mkt-token-smart", /^market\/market-token-(holder|top-trader|cluster-overview|cluster-top-holders)$/, "Token", "sob-demanda", "carteiras inteligentes, custo medio e concentracao (Premium)", ["SMT-3", "SMT-4", "DOC-2"], ["T3.3", "T6.2", "T6.3", "T4.4"]),
  r("mkt-token-cluster", /^market\/market-token-cluster-list$/, "Token", "sob-demanda", "cluster/list responde (medido em 2026-10-12); payload pesado, so sob clique na interface", ["API-4", "SMT-4"], ["T3.3"]),

  // ---- market: signals, leaderboard, portfolio
  r("mkt-signal", /^market\/market-signal-(list|leaderboard-list)$/, "Smart money", "integrar-agora", "sinais de carteiras rastreadas e leaderboard (Premium, cache)", ["SMT-3", "SMT-4", "DOC-2"], ["T3.3", "T4.4", "T6.2"]),
  r("mkt-portfolio-basic", /^market\/market-portfolio-(latest-pnl|dex-history)$/, "Portfolio", "integrar-agora", "PnL por token e historico de DEX do usuario (Basic)", ["WAL-4"], ["T9.4"]),
  r("mkt-portfolio-prem", /^market\/market-portfolio-(overview|recent-pnl)$/, "Portfolio", "sob-demanda", "visao geral e PnL recente do endereco (Premium)", ["WAL-4"], ["T9.4"]),
  r("mkt-tracker", /^market\/market-portfolio-address-tracker-trades$/, "Smart money", "sob-demanda", "tape de carteiras rastreadas; camada de cobranca desconhecida (medir)", ["API-8", "ASK-2"], ["T3.8"]),

  // ---- market: memepump, rwa, social
  r("mkt-meme", /^market\/market-memepump-get-token-(list|details|developer-info|bundle-details|aped-wallet-details)$/, "Memepump", "sob-demanda", "nas redes que memepump/supported/chainsProtocol listar (7 medidas em 2026-10-12); risco de dev, bundlers e carteiras", ["RAS-2", "SMT-4"], ["T8.2"]),
  r("mkt-meme-sim", /^market\/market-memepump-get-similar-tokens$/, "Memepump", "depois", "aviso de copia; valor baixo na v1", ["API-6"]),
  r("mkt-rwa", /^market\/market-rwa-token$/, "RWA", "sob-demanda", "rwa/tokens responde com category (medido em 2026-10-12); so sob pedido", ["API-4"], ["T3.3"]),
  r("mkt-social-core", /^market\/market-social-(sentiment-symbol|vibe-timeline)$/, "Social", "sob-demanda", "sentimento e hype por simbolo; camada desconhecida (medir)", ["RAS-2", "SMT-4", "API-8"], ["T3.8", "T6.3"]),
  r("mkt-social-later", /^market\/market-social-/, "Social", "depois", "noticias e ranking de texto nao vao ao modelo; aba opcional", ["API-6"]),

  // ---- market: balance and history (free)
  r("mkt-balance", /^market\/balance-(total-value|total-token-balances|specific-token-balance)$/, "Saldo", "integrar-agora", "saldos do endereco conectado (gratuito, isRiskToken)", ["WAL-4"], ["T9.4"]),
  r("mkt-txhist", /^market\/tx-history-(transactions-by-address|specific-transaction-detail-by-txhash)$/, "Historico", "integrar-agora", "historico de 6 meses do endereco conectado (gratuito)", ["WAL-4"], ["T9.4"]),

  // ---- market: onchain data explorer (v6)
  r("mkt-od-guide", /^market\/onchaindata-usage-guide$/, "Dados on-chain", "integrar-agora", "lotes, paginacao, limites e recuo", ["API-3", "API-5"], ["T3.3", "T3.4"]),
  r("mkt-od-forensic", /^market\/onchaindata-(address-address-active-chain|address-information-evm|transaction-[a-z-]+|log-by-transaction|block-block-height-by-time)$/, "Dados on-chain", "sob-demanda", "forense de endereco e transacao, em lote", ["API-4"], ["T3.3"]),
  r("mkt-od-block-demand", /^market\/onchaindata-block-(block-list|block-fills|transaction-list)$/, "Dados on-chain", "sob-demanda", "blocos e transacoes de um bloco respondem com a chave do projeto (medido em 2026-10-12); so sob pedido", ["API-4"], ["T3.3"]),
  r("mkt-od-later", /^market\/onchaindata-(log|block)-/, "Dados on-chain", "depois", "varredura de logs e blocos e historico de saldo (Premium, ponto unico)", ["API-6"]),
  r("mkt-od-info-demand", /^market\/onchaindata-info-(summary|address|transaction|stats)$/, "Dados on-chain", "sob-demanda", "estatisticas de cadeia respondem (medido em 2026-10-12); so sob pedido", ["API-4"], ["T3.3"]),
  r("mkt-od-info", /^market\/onchaindata-info-/, "Dados on-chain", "fora", "estatisticas de cadeia que o app nao usa (block, detail, hashes)", ["API-6"]),

  // ---- trade
  r("trade-fee", /^trade\/api-fee$/, "Custo", "integrar-agora", "trial de 1 requisicao por segundo (ate 5 sob aprovacao)", ["API-3", "WAL-5"], ["T3.4", "T9.5"]),
  r("trade-ref", /^trade\/(dex-api-introduction|dex-swap-api-introduction|dex-api-reference|dex-aggregation-faq|dex-intent-reference|onchain-gateway-reference|onchain-gateway-api-introduction|smart-contract-safety|dex-smart-contract|support|dex-use-swap)$/, "Referencia", "referencia", "introducao, FAQ e enderecos (usar os que a API devolve)", ["API-6"]),
  r("trade-mcp", /^trade\/dex-ai-tools-/, "MCP e Skills", "fora", "ferramentas de agente", ["API-1"]),
  r("trade-read", /^trade\/dex-(get-aggregator-supported-chains|get-tokens|get-liquidity|get-quote)$/, "Cotacao", "integrar-agora", "cotacao somente leitura: impacto, rota, honeypot, taxa", ["WAL-5"], ["T9.5"]),
  r("trade-prepare", /^trade\/(dex-swap|dex-approve-transaction|dex-solana-swap-instruction)$/, "Ticket", "sob-demanda", "devolve calldata nao assinado; so exibir no ticket", ["WAL-6"], ["T9.6"]),
  r("trade-history", /^trade\/dex-swap-history$/, "Ticket", "depois", "reconciliacao de trocas", ["API-6"]),
  r("trade-examples", /^trade\/dex-use-swap-/, "Referencia", "referencia", "exemplos usam chave privada; nao copiar", ["WAL-8"]),
  r("trade-sdk", /^trade\/dex-sdk-/, "SDK", "fora", "SDK assina com chave do ambiente", ["WAL-8"]),
  r("trade-widget", /^trade\/dex-widget$/, "Widget", "fora", "iframe opaco que o app nao consegue barrar", ["WAL-8"]),
  r("trade-fee-partner", /^trade\/dex-api-addfee$/, "Parceiro", "fora", "taxa de parceiro", ["API-6"]),
  r("trade-intent", /^trade\/(intent-swap-quickstart|dex-intent-)/, "Intent Swap", "depois", "EIP-712 assinado pelo usuario; especificado para depois", ["WAL-9"]),
  r("trade-solver", /^trade\/(dex-api-intent-solver|dex-api-market-maker|solana-rfq-)/, "Solver e market maker", "fora", "paginas para solvers e market makers", ["API-6"]),
  r("trade-errors", /^trade\/(dex-error-code|onchain-gateway-error-code)$/, "Codigos de erro", "integrar-agora", "tabela de erros do agregador", ["API-5", "API-12"], ["T3.3"]),
  r("trade-gw-chains", /^trade\/onchain-gateway-api-chains$/, "Redes por familia", "integrar-agora", "redes do gateway", ["CHN-3"], ["T3.6"]),
  r("trade-gw-gas", /^trade\/onchain-gateway-api-(gas-price|gas-limit)$/, "Gateway", "sob-demanda", "custo e prazo no ticket", ["WAL-6"], ["T9.5"]),
  r("trade-gw-sim", /^trade\/onchain-gateway-api-simulate-transaction$/, "Gateway", "depois", "simulacao exige lista de clientes autorizados", ["WAL-9"]),
  r("trade-gw-send", /^trade\/onchain-gateway-api-(broadcast-transaction|orders)$/, "Gateway", "fora", "o servidor nunca difunde transacao", ["WAL-8"]),

  // ---- wallet: references and agentic wallet
  r("wal-ref", /^wallet\/(product-and-service|wallet-api-introduction|defi-api-overview|defi-product-api-reference|defi-transaction-api-reference|defi-user-asset-api-reference|balance-api-reference|tx-history-api-reference|onchain-gateway-api-reference|onchain-gateway-api-overview|balance-api-overview|tx-history-api-overview|onchain-gateway-error-code)$/, "Referencia", "referencia", "introducao e indices da familia", ["API-6"]),
  r("wal-agentic", /^wallet\/(agentic-quickstart|agentic-wallet-skills|agentic-wallet|install-your-agentic-wallet|run-your-first-ai-agent)$/, "Agentic Wallet", "fora", "carteira em TEE que negocia sozinha", ["WAL-8"]),
  r("wal-networks", /^wallet\/supported-networks$/, "Redes", "integrar-agora", "redes do Wallet API", ["CHN-1"], ["T3.6"]),
  r("wal-balance", /^wallet\/balance-api-(all-token-balances|token-balances|total-value)$/, "Saldo", "integrar-agora", "saldos do endereco conectado (gratuito)", ["WAL-4"], ["T9.4"]),
  r("wal-chains", /^wallet\/(balance-api-chains|tx-history-api-chains|onchain-gateway-api-chains|defi-product-supported-chains)$/, "Redes por familia", "integrar-agora", "descoberta da capacidade por familia", ["CHN-3"], ["T3.6"]),
  r("wal-errors", /^wallet\/(balance-error-code|tx-history-error-code|defi-error-code)$/, "Codigos de erro", "integrar-agora", "tabela de erros mapeada no normalizador", ["API-5", "API-12"], ["T3.3"]),
  r("wal-txhist", /^wallet\/tx-history-api-(history|detail)$/, "Historico", "integrar-agora", "historico do endereco conectado (gratuito)", ["WAL-4"], ["T9.4"]),
  r("wal-defi-assets", /^wallet\/defi-user-asset-/, "DeFi", "sob-demanda", "posicoes DeFi do endereco; camada a medir", ["WAL-4", "API-8"], ["T9.4", "T3.8"]),
  r("wal-defi-later", /^wallet\/defi-(product|transaction)-/, "DeFi", "depois", "descoberta de produtos e calldata de entrada, saida e coleta", ["WAL-9"]),
  r("wal-gw-gas", /^wallet\/onchain-gateway-api-(gas-price|gas-limit)$/, "Gateway", "sob-demanda", "custo e prazo no ticket", ["WAL-6"], ["T9.5"]),
  r("wal-gw-sim", /^wallet\/onchain-gateway-api-simulate-transaction$/, "Gateway", "depois", "simulacao exige lista de clientes autorizados", ["WAL-9"]),
  r("wal-gw-send", /^wallet\/onchain-gateway-api-(broadcast-transaction|orders)$/, "Gateway", "fora", "o servidor nunca difunde transacao", ["WAL-8"]),

  // ---- wallet: dapp-connect
  r("dc-intro", /^wallet\/dapp-connect\/(okx-wallet-integration-introduction|okx-wallet-integration-supported-networks|web-detect-okx-wallet)$/, "Conexao da carteira", "integrar-agora", "deteccao de window.okxwallet e redes suportadas", ["WAL-1"], ["T1.1", "T9.1"]),
  r("dc-icon", /^wallet\/dapp-connect\/web-display-dapp-icon$/, "Conexao da carteira", "referencia", "icone do app no OKX Connect", ["WAL-3"]),
  r("dc-send", /^wallet\/dapp-connect\/chains\/(evm|solana)\/web-send-transaction$/, "Envio", "especificado-desligado", "envio assinado pela carteira, desligado ate autorizacao (WAL-9)", ["WAL-9"]),
  r("dc-evm-sol", /^wallet\/dapp-connect\/chains\/(evm|solana)\/(introduce|provider|web-access-user-accounts|web-add-network|web-detect-user-network|web-solana-detect-user-network|web-solana-switch-network)$/, "Conexao da carteira", "integrar-agora", "conta, rede, troca e adicao de rede por clique (EVM e Solana)", ["WAL-1", "WAL-2"], ["T9.1", "T9.2"]),
  r("dc-evm-later", /^wallet\/dapp-connect\/chains\/(evm|solana)\//, "Conexao da carteira", "depois", "exibir tokens e interagir com contratos", ["WAL-9"]),
  r("dc-qr", /^wallet\/dapp-connect\/(app-connect-faq|app-connect-preparation|app-connect-(evm|solana)(-sdk|-ui)?)$/, "OKX Connect por QR", "especificado-desligado", "reserva sem extensao (validar no export estatico)", ["WAL-3"], ["T9.3"]),
  r("dc-other", /^wallet\/dapp-connect\//, "Outras redes", "depois", "Bitcoin, Sui, Tron, TON, Aptos, Cosmos, Starknet, NEAR, Stacks, Cardano, Nostr e WAX ficam fora do escopo EVM e Solana da v1", ["WAL-1"]),

  // ---- payments, okx.ai
  r("pay-buyer", /^payments\/payment-use-buyer$/, "x402", "depois", "fluxo do comprador; exige carteira para assinar, fora na v1", ["API-10"]),
  r("pay-ref", /^payments\/(overview|core-concept|methods-overview|quickstart-overview|supported-networks|app|pay-as-you-go|subscription)$/, "x402", "referencia", "conceitos de pagamento do provedor", ["API-10"]),
  r("pay-out", /^payments\//, "x402", "fora", "lado vendedor, SDKs e APIs de corretor; pagamento nao e do app", ["API-10"]),
  r("ai-ref", /^okxai\/what-is-okxai$/, "OKX.AI", "referencia", "apresentacao do mercado de agentes", ["API-6"]),
  r("ai-out", /^okxai\//, "OKX.AI", "fora", "mercado de agentes com custodia e assinatura; saida nao auditavel", ["WAL-8"]),

  // ---- x layer
  r("xl-const", /^xlayer\/developer\/build-on-xlayer\/(network-information|contracts|address-format)$/, "X Layer", "integrar-agora", "constantes da rede 196, tokens e formato de endereco", ["CHN-1", "CHN-2"], ["T3.6"]),
  r("xl-ref", /^xlayer\/developer\/(build-on-xlayer\/(about-xlayer|safe-wallet)|data\/(xlayer-introduction|error|overview))$/, "X Layer", "referencia", "apresentacao e erros", ["API-6"]),
  r("xl-rpc", /^xlayer\/developer\/(rpc-endpoints|websockets-endpoints)\//, "X Layer", "depois", "RPC sem cota (100 requisicoes por segundo por IP) para logs e saldos em 196", ["API-6"]),
  r("xl-data-demand", /^xlayer\/developer\/data\/(large-transaction-list|token-list|address-information|token-balance-details-by-address|address-transaction-list|logs-by-address)$/, "X Layer", "sob-demanda", "endpoints v5 de 196 que respondem com a chave do projeto (medido em 2026-10-12); cobranca nao documentada, so sob pedido", ["API-4"], ["T3.3"]),
  r("xl-data-unique", /^xlayer\/developer\/data\/(token-holder-list|native-token-holder-addresses)$/, "X Layer", "depois", "endpoints v5 exclusivos de 196; cobranca nao documentada", ["API-6"]),
  r("xl-tz", /^xlayer\/developer\/data\/tz-/, "X Layer", "fora", "order book L2 da Trade Zone, que nao e uma praca do app (50038 medido para tz/*)", ["API-6"]),
  r("xl-out", /^xlayer\//, "X Layer", "fora", "duplica a v6, escrita no explorador (contract/verify-*), ferramentas de terceiros e deploy de contratos", ["API-6"]),
];

type Page = { path: string; titulo: string; chars: number; sha256: string; familia: string; grupo: string; regra: string; decisao: Decision; req: string[]; tarefas: string[] };

export function classify(path: string): Rule {
  const hit = RULES.find((rule) => rule.re.test(path));
  if (!hit) throw new Error(`no rule matches ${path}`);
  return hit;
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

type Index = Record<string, { title: string; chars: number; status: number }>;

function loadMirror(dir: string): { index: Index; text: (p: string) => string } {
  const index = JSON.parse(readFileSync(join(dir, "_index.json"), "utf8")) as Index;
  return { index, text: (p) => readFileSync(join(dir, `${p}.txt`), "utf8") };
}

const sha = (s: string) => createHash("sha256").update(s).digest("hex");

function generate(mirror: string, date: string) {
  const { index, text } = loadMirror(mirror);
  const paginas: Page[] = Object.keys(index).sort().map((path) => {
    const rule = classify(path);
    return { path, titulo: index[path]!.title.split(" | ")[0] ?? "", chars: index[path]!.chars, sha256: sha(text(path)), familia: path.split("/")[0]!, grupo: rule.grupo, regra: rule.id, decisao: rule.decisao, req: rule.req, tarefas: rule.tarefas };
  });
  const porDecisao = Object.fromEntries(DECISIONS.map((d) => [d, paginas.filter((p) => p.decisao === d).length]));
  const body = { geradoEm: date, fonte: SOURCE, total: paginas.length, porDecisao, regras: RULES.map(({ re: _re, ...rest }) => ({ ...rest, padrao: RULES.find((x) => x.id === rest.id)!.re.source })), paginas };
  writeFileSync(JSON_PATH, JSON.stringify(body, null, 1) + "\n");
  writeFileSync(MD_PATH, renderMd(body.geradoEm, paginas, porDecisao));
  console.log(`wrote ${paginas.length} pages`, porDecisao);
}

/** Applies the current RULES to the pages already in the JSON: no network, every SHA-256, title and size kept. */
function reclassify(date: string) {
  const data = JSON.parse(readFileSync(JSON_PATH, "utf8")) as { paginas: Page[] };
  const paginas: Page[] = data.paginas.map((p) => {
    const rule = classify(p.path);
    return { ...p, grupo: rule.grupo, regra: rule.id, decisao: rule.decisao, req: rule.req, tarefas: rule.tarefas };
  });
  const porDecisao = Object.fromEntries(DECISIONS.map((d) => [d, paginas.filter((p) => p.decisao === d).length]));
  const body = { geradoEm: date, fonte: SOURCE, total: paginas.length, porDecisao, regras: RULES.map(({ re: _re, ...rest }) => ({ ...rest, padrao: RULES.find((x) => x.id === rest.id)!.re.source })), paginas };
  writeFileSync(JSON_PATH, JSON.stringify(body, null, 1) + "\n");
  writeFileSync(MD_PATH, renderMd(body.geradoEm, paginas, porDecisao));
  console.log(`reclassified ${paginas.length} pages`, porDecisao);
}

function renderMd(date: string, paginas: Page[], porDecisao: Record<string, number>): string {
  const lines: string[] = [];
  lines.push("# Cobertura da documentacao OnchainOS (499 paginas)", "");
  lines.push(`Gerado por \`tools/okx-coverage.ts\` em ${date} a partir do espelho de ${SOURCE} (\`tools/mirror-okx-docs.ts\`). Cada pagina tem **uma decisao**, requisitos do [SPEC](SPEC.md) e tarefas de [TASKS](TASKS.md). O espelho nao e versionado; o JSON guarda o SHA-256 de cada pagina para detectar mudancas.`, "");
  lines.push("Decisoes: **integrar-agora** (escopo v1, leitura), **sob-demanda** (integra, so quando o usuario pede ou a tela correspondente esta aberta, e conta no orcamento), **especificado-desligado** (especificado e desligado por padrao; inclui a reserva OKX Connect, que so liga sem extensao), **depois** (valido, fora da v1), **fora** (excluido, com motivo), **referencia** (pagina de apoio sem integracao).", "");
  lines.push("## Resumo", "", "| Familia | " + DECISIONS.join(" | ") + " | Total |", "| --- | " + DECISIONS.map(() => "---").join(" | ") + " | --- |");
  const families = [...new Set(paginas.map((p) => p.familia))];
  for (const f of families) {
    const sub = paginas.filter((p) => p.familia === f);
    lines.push(`| ${f} | ${DECISIONS.map((d) => sub.filter((p) => p.decisao === d).length).join(" | ")} | ${sub.length} |`);
  }
  lines.push(`| **Total** | ${DECISIONS.map((d) => porDecisao[d]).join(" | ")} | ${paginas.length} |`, "");
  lines.push("## Regras (primeira que casa vence)", "", "| Regra | Grupo | Decisao | Motivo | Requisitos | Tarefas | Paginas |", "| --- | --- | --- | --- | --- | --- | --- |");
  for (const rule of RULES) {
    lines.push(`| ${rule.id} | ${rule.grupo} | ${rule.decisao} | ${rule.motivo} | ${rule.req.join(", ")} | ${rule.tarefas.join(", ") || "n/a"} | ${paginas.filter((p) => p.regra === rule.id).length} |`);
  }
  lines.push("", "## Pagina a pagina", "", "| Pagina | Decisao | Regra | Requisitos | Tarefas |", "| --- | --- | --- | --- | --- |");
  for (const p of paginas) lines.push(`| \`${p.path}\` | ${p.decisao} | ${p.regra} | ${p.req.join(", ")} | ${p.tarefas.join(", ") || "n/a"} |`);
  return lines.join("\n") + "\n";
}

function ids(file: string, re: RegExp): Set<string> {
  return new Set(readFileSync(join(ROOT, file), "utf8").match(re) ?? []);
}

function check(mirror?: string): number {
  const problems: string[] = [];
  if (!existsSync(JSON_PATH)) {
    console.error("onchainos-coverage.json missing: run generate first");
    return 1;
  }
  const data = JSON.parse(readFileSync(JSON_PATH, "utf8")) as { total: number; paginas: Page[] };
  if (data.total !== data.paginas.length) problems.push(`total ${data.total} != ${data.paginas.length} paginas`);
  const reqIds = ids("SPEC.md", /\b(?:WIN|CFG|API|SRC|DOC|CHN|ICO|DAT|FLX|SMT|ING|ASK|RAS|WAL|INF|QLT)-\d+\b/g);
  const taskIds = ids("TASKS.md", /\bT\d+\.\d+\b/g);
  const seen = new Set<string>();
  for (const p of data.paginas) {
    if (seen.has(p.path)) problems.push(`duplicate ${p.path}`);
    seen.add(p.path);
    if (!(DECISIONS as readonly string[]).includes(p.decisao)) problems.push(`${p.path}: invalid decision ${p.decisao}`);
    if (!p.regra || !p.req.length) problems.push(`${p.path}: no rule or requirement`);
    for (const q of p.req) if (!reqIds.has(q)) problems.push(`${p.path}: requirement ${q} not in SPEC.md`);
    for (const t of p.tarefas) if (!taskIds.has(t)) problems.push(`${p.path}: task ${t} not in TASKS.md`);
    if (classify(p.path).id !== p.regra) problems.push(`${p.path}: rule ${p.regra} no longer first match`);
  }
  if (mirror) {
    const { index, text } = loadMirror(mirror);
    for (const path of Object.keys(index)) if (!seen.has(path)) problems.push(`new page not in JSON: ${path}`);
    for (const p of data.paginas) {
      if (!(p.path in index)) problems.push(`page vanished: ${p.path}`);
      else if (sha(text(p.path)) !== p.sha256) problems.push(`page changed: ${p.path}`);
    }
  }
  if (problems.length) {
    console.error(problems.slice(0, 60).join("\n"), `\n${problems.length} problem(s)`);
    return 1;
  }
  console.log(`ok: ${data.paginas.length} pages, 0 without decision, ids cross-checked${mirror ? ", mirror compared" : ""}`);
  return 0;
}

if (import.meta.main) {
  const mirror = arg("--mirror");
  if (process.argv.includes("--check")) process.exit(check(mirror));
  else if (process.argv.includes("--reclassify")) reclassify(arg("--date") ?? new Date().toISOString().slice(0, 10));
  else if (!mirror) throw new Error("generate needs --mirror <dir>");
  else generate(mirror, arg("--date") ?? new Date().toISOString().slice(0, 10));
}
