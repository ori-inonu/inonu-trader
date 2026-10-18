// Map of the OKX Onchain OS ecosystem: what this build really has, what is only readable, what is stopped and what the
// evidence does not confirm.
//
// Source: docs/research/R1-onchain-os-capacidades.md (table b), R2-carteira-permissoes-delegacao.md (sections b to d)
// and docs/ARQUETURA-CENTRAL-DE-OPERACOES.md section 7. This file is data for display. It enables nothing: the execution
// gate in Market.init() (src/market.ts) is unchanged and no item here can be reported as executing or enabled.
//
// The four statuses mean exactly this:
//   implemented  wired in this repository as a read only observer, tier T0, nothing signed and nothing sent.
//   read_only    reachable and read only, but with a known limit that keeps it out of the trading loop.
//   blocked      the repository gate, the readiness contract or the missing permission stops it today.
//   unconfirmed  the research found no primary source or did not confirm the claim.

/** The complete set of statuses. There is deliberately no executing, enabled, active or running state. */
export const CATALOG_STATUSES = ["implemented", "read_only", "blocked", "unconfirmed"] as const;

export type CatalogStatus = (typeof CATALOG_STATUSES)[number];

export const STATUS_LABEL: Readonly<Record<CatalogStatus, string>> = {
  implemented: "Implementado",
  read_only: "Somente leitura",
  blocked: "Bloqueado",
  unconfirmed: "Não confirmado",
};

/** The permission tier an item would need. T0 observes; T1 and T2 need a signature or a delegated executor. */
export const TIER_NEEDED_VALUES = ["T0", "T1", "T2-A", "T2-B", "T2-C"] as const;

export type TierNeeded = (typeof TIER_NEEDED_VALUES)[number];

export const TIER_NEEDED_LABEL: Readonly<Record<TierNeeded, string>> = {
  T0: "T0, observar",
  T1: "T1, o humano assina",
  "T2-A": "T2-A, agente dedicado",
  "T2-B": "T2-B, Safe com Roles ou Allowance",
  "T2-C": "T2-C, Agentic Wallet da OKX",
};

export interface CatalogFamily {
  id: string;
  name: string;
  summary: string;
}

/** The capability families of table (b) of R1 plus the permission models of R2 section (d). */
export const CATALOG_FAMILIES: readonly CatalogFamily[] = [
  { id: "market", name: "Mercado", summary: "Preço, token, canais em tempo real, planos e cotas de leitura." },
  { id: "dex", name: "DEX e bridge", summary: "Cotação, calldata de swap e travessia entre cadeias." },
  { id: "portfolio", name: "Portfólio", summary: "Saldos, valuation, histórico e PnL por endereço." },
  { id: "gateway", name: "Gateway", summary: "Gás, simulação, transmissão e consulta de ordens." },
  { id: "defi", name: "DeFi e Earn", summary: "Descoberta de produtos e as operações que devolvem calldata." },
  { id: "discovery", name: "Descoberta e segurança", summary: "Sinais, memes, sentimento, radar e scans de risco." },
  { id: "wallet", name: "Carteira", summary: "Provedor da carteira, Agentic Wallet e Trader Mode." },
  { id: "permissions", name: "Permissões", summary: "Modelos de permissão de R2, do mais seguro ao menos seguro." },
  { id: "tooling", name: "Ferramentas", summary: "Skills, CLI, servidores MCP, plugins e SDKs." },
  { id: "payments", name: "Pagamentos", summary: "Canais de pagamento que movem fundos sem o dono no laço." },
  { id: "access", name: "Acesso", summary: "Matriz de cadeias, autenticação e portal do desenvolvedor." },
];

export interface CatalogItem {
  id: string;
  name: string;
  family: string;
  tier: TierNeeded;
  summary: string;
  status: CatalogStatus;
  /** Why the item is not implemented today. Empty only for the implemented read only observers. */
  blocker: string;
  /** Primary documentation literally present in R1, R2 or R3. Empty when no public source exists. */
  sources: readonly string[];
  /** Why there is no public source. Only set when sources is empty. */
  noSourceReason?: string;
  /** Where inside the research this row comes from. */
  refs: string;
}

const OKX_DEX = "https://web3.okx.com/onchainos/dev-docs";

export const CATALOG: readonly CatalogItem[] = [
  {
    id: "market-price-candles",
    name: "Preço, índice, candles e trades",
    family: "market",
    tier: "T0",
    summary: "Leitura de preço, índice, candles e trades do mercado, com a moeda de referência declarada pela API.",
    status: "blocked",
    blocker:
      "R1 não declara a moeda do campo price nem a do índice, e o operador usa o livro da Kuru como fonte de preço, então a cotação do OKX não entra no laço.",
    sources: [`${OKX_DEX}/market/market-price-reference`],
    refs: "R1, tabela (b), linha de mercado",
  },
  {
    id: "market-token-data",
    name: "Dados de token",
    family: "market",
    tier: "T0",
    summary: "Busca, preço, informação avançada, liquidez e ranking de token, tudo somente leitura.",
    status: "implemented",
    blocker: "",
    sources: [`${OKX_DEX}/market/market-token-reference`],
    refs: "R1, tabela (b); src/okx-api.ts",
  },
  {
    id: "market-realtime-channels",
    name: "Canais em tempo real",
    family: "market",
    tier: "T0",
    summary: "Canais de trades e Books em tempo real por conexão, com cota por chave e por conexão.",
    status: "blocked",
    blocker:
      "Os canais em tempo real exigem plano pago e a cota documentada é de 3 req/s por chave e 480 operações por hora por conexão, muito abaixo do laço de 300 ms.",
    sources: [`${OKX_DEX}/market/websocket`, `${OKX_DEX}/market/websocket-trades-channel`],
    refs: "R1, tabela (b), linha de planos e canais",
  },
  {
    id: "market-plans-quota",
    name: "Planos e cotas do mercado",
    family: "market",
    tier: "T0",
    summary: "Cotas por plano e preço do excedente, o que define a cadência possível de cada família.",
    status: "read_only",
    blocker:
      "A cota real da conta não é confirmada e o excedente é cobrado por chamada, então a cadência do operador não pode ser derivada da tabela de planos.",
    sources: [`${OKX_DEX}/market/market-api-fee`, `${OKX_DEX}/trade/api-fee`],
    refs: "R1, tabela (b), linha de planos e limites",
  },
  {
    id: "dex-quote",
    name: "Cotação do agregador DEX",
    family: "dex",
    tier: "T0",
    summary: "Cotação de swap na mesma cadeia, com taxa, gás estimado e impacto de preço.",
    status: "read_only",
    blocker:
      "A unidade de saída de toTokenAmount não é declarada pela OKX, então o ida e volta por API fica somente leitura e nunca entra como valor de ordem.",
    sources: [`${OKX_DEX}/trade/dex-get-quote`, `${OKX_DEX}/trade/dex-get-tokens`],
    refs: "R1, tabela (b), linha de cotação; arquitetura, seção 9",
  },
  {
    id: "dex-swap-calldata",
    name: "Swap e aprovação por calldata",
    family: "dex",
    tier: "T1",
    summary: "O agregador devolve calldata de swap e de aprovação, com slippage e proteção de impacto.",
    status: "blocked",
    blocker:
      "A API só prepara a escrita: quem assina e transmite é o cliente, e este build não habilitou T1, então nenhum calldata é assinado aqui.",
    sources: [`${OKX_DEX}/trade/dex-swap`, `${OKX_DEX}/trade/dex-approve-transaction`, `${OKX_DEX}/trade/dex-solana-swap-instruction`],
    refs: "R1, tabela (b), linha de swap e aprovação; R2, seção (e) T1",
  },
  {
    id: "cross-chain-bridge",
    name: "Bridge e swap entre cadeias",
    family: "dex",
    tier: "T1",
    summary: "Travessia entre cadeias com cotação, aprovação, execução e consulta de status.",
    status: "blocked",
    blocker:
      "A página REST do cross-chain não foi localizada nos docs atuais e a travessia não é atômica, então ela exigiria T1 com o humano assinando e ainda não está habilitada.",
    sources: ["https://github.com/okx/onchainos-skills/blob/main/skills/okx-agentic-wallet/references/bridge.md"],
    refs: "R1, tabela (b), linha de bridge; R2, seção (c)",
  },
  {
    id: "trade-plans-limits",
    name: "Planos e limites da Trade",
    family: "dex",
    tier: "T0",
    summary: "Planos do Developer Portal, RPS por plano e retenção de slippage positivo pela OKX.",
    status: "read_only",
    blocker:
      "O preço do plano Start-up, as cotas do Gateway e o RPS real da conta não são confirmados, então a tabela só informa e não dimensiona cadência.",
    sources: [`${OKX_DEX}/trade/api-fee`],
    refs: "R1, tabela (b), linha de planos e limites",
  },
  {
    id: "portfolio-balances",
    name: "Saldos e valuation",
    family: "portfolio",
    tier: "T0",
    summary: "Saldos por token e valuation em USD de um endereço, em até 50 cadeias.",
    status: "implemented",
    blocker: "",
    sources: [`${OKX_DEX}/market/balance-total-value`, `${OKX_DEX}/market/balance-total-token-balances`, `${OKX_DEX}/market/balance-specific-token-balance`],
    refs: "R1, tabela (b); src/okx-wallet/portfolio.ts",
  },
  {
    id: "portfolio-history-pnl",
    name: "Histórico, PnL e tracker",
    family: "portfolio",
    tier: "T0",
    summary: "Histórico de transações, resumo de portfólio, PnL recente e rastreador de endereço.",
    status: "read_only",
    blocker:
      "O histórico cobre seis meses e o PnL de overview depende de plano pago, então serve para conciliação manual e não como fonte de lucro realizado do laço.",
    sources: [`${OKX_DEX}/market/market-portfolio-reference`, `${OKX_DEX}/market/tx-history-transactions-by-address`, `${OKX_DEX}/market/market-portfolio-address-tracker-trades`],
    refs: "R1, tabela (b), linha de carteira",
  },
  {
    id: "gateway-gas",
    name: "Gás pelo Gateway",
    family: "gateway",
    tier: "T0",
    summary: "Preço de gás, limite por pré-execução e a lista de cadeias suportadas.",
    status: "read_only",
    blocker:
      "A frequência de atualização do preço do gás não é documentada e o limite por pré-execução vem sem unidade declarada, então o valor entra só como estimativa de custo do candidato.",
    sources: [`${OKX_DEX}/wallet/onchain-gateway-api-gas-price`, `${OKX_DEX}/wallet/onchain-gateway-api-gas-limit`, `${OKX_DEX}/trade/onchain-gateway-api-chains`],
    refs: "R1, tabela (b), linha de gás",
  },
  {
    id: "gateway-simulate-broadcast",
    name: "Simulação, transmissão e ordens",
    family: "gateway",
    tier: "T1",
    summary: "Simulação de transação, transmissão de transação já assinada e consulta de ordens.",
    status: "blocked",
    blocker:
      "Simulação e transmissão exigem inclusão em whitelist pela OKX e a transmissão é escrita pura, o que exige T1 com assinatura humana e hoje não está habilitado.",
    sources: [`${OKX_DEX}/wallet/onchain-gateway-api-simulate-transaction`, `${OKX_DEX}/wallet/onchain-gateway-api-broadcast-transaction`, `${OKX_DEX}/wallet/onchain-gateway-api-orders`],
    refs: "R1, tabela (b), linha de simulação e envio",
  },
  {
    id: "defi-discovery",
    name: "Descoberta de DeFi e Earn",
    family: "defi",
    tier: "T0",
    summary: "Busca de produtos de Earn, de lending e de pool, com APY, TVL e a base da taxa informada.",
    status: "implemented",
    blocker: "",
    sources: [`${OKX_DEX}/wallet/defi-product-search`, `${OKX_DEX}/wallet/defi-api-overview`],
    refs: "R1, tabela (b); src/okx-wallet/defi.ts e src/okx-defi/report.ts",
  },
  {
    id: "defi-enter-exit-claim",
    name: "Depositar, resgatar e coletar",
    family: "defi",
    tier: "T1",
    summary: "Entrar, sair e coletar em DeFi, devolvendo calldata em passos sequenciais de aprovar e depositar.",
    status: "blocked",
    blocker:
      "A API só devolve calldata e o slippage de DeFi é fração, oposto ao do swap, então o uso exigiria T1 assinado pelo dono e não está habilitado neste build.",
    sources: [`${OKX_DEX}/wallet/defi-transaction-enter`, `${OKX_DEX}/wallet/defi-transaction-claim`],
    refs: "R1, tabela (b) e mapa de unidades (b2)",
  },
  {
    id: "signals-leaderboard",
    name: "Sinais e leaderboard",
    family: "discovery",
    tier: "T0",
    summary: "Lista de sinais e ranking de carteiras por smart money, KOL e baleias, somente leitura.",
    status: "implemented",
    blocker: "",
    sources: [`${OKX_DEX}/market/market-signal-list`, `${OKX_DEX}/market/market-signal-leaderboard-list`],
    refs: "R1, tabela (b); src/okx-signals",
  },
  {
    id: "meme-pump",
    name: "Meme Pump (Trenches)",
    family: "discovery",
    tier: "T0",
    summary: "Lista de tokens por estágio, com filtros de dev, insiders, bundlers, snipers e idade em minutos.",
    status: "implemented",
    blocker: "",
    sources: [`${OKX_DEX}/market/market-memepump-get-token-list`],
    refs: "R1, tabela (b); src/okx-api.ts",
  },
  {
    id: "social-sentiment",
    name: "Sentimento e notícias",
    family: "discovery",
    tier: "T0",
    summary: "Sentimento por símbolo, notícias, ranking de sentimento e os KOLs mais citados.",
    status: "unconfirmed",
    blocker:
      "R1 marca o tier como não confirmado, a consulta é por símbolo sem contrato e a frequência de atualização não é documentada, o que viola a identidade de cadeia mais contrato.",
    sources: [`${OKX_DEX}/market/market-social-sentiment-symbol`, `${OKX_DEX}/market/market-social-news-reference`],
    refs: "R1, tabela (b), linha de social",
  },
  {
    id: "alpha-radar",
    name: "Alpha Radar",
    family: "discovery",
    tier: "T0",
    summary: "Radar de endereços apresentado na interface web, sem equivalente oficial na API.",
    status: "unconfirmed",
    blocker:
      "R1 registra que não existe endpoint com esse nome, que só há a interface web e que o mapeamento oficial da interface para a API não foi confirmado.",
    sources: [],
    noSourceReason:
      "sem fonte pública: só existe a interface web address-radar e nenhum endpoint oficial com esse nome foi localizado nos docs atuais.",
    refs: "R1, tabela (b), linha do Alpha Radar",
  },
  {
    id: "security-scans",
    name: "Scans de segurança de token",
    family: "discovery",
    tier: "T0",
    summary: "Scan de token, de dapp e de transação, com nível de risco e ação calculados no servidor.",
    status: "read_only",
    blocker:
      "A cobertura por rede e a autenticação REST não são confirmadas e um scan que falha não é aprovação, então o resultado entra como insumo e nunca substitui a leitura da cadeia.",
    sources: ["https://github.com/okx/onchainos-skills/blob/main/skills/okx-agentic-wallet/references/security.md"],
    refs: "R1, tabela (b), linha de segurança",
  },
  {
    id: "wallet-provider-evm",
    name: "Provedor EVM da carteira",
    family: "wallet",
    tier: "T0",
    summary: "Conta, cadeia e saldos da carteira conectada, lidos sem assinar nada e sem enviar dado a servidor.",
    status: "implemented",
    blocker: "",
    sources: [`${OKX_DEX}/wallet/dapp-connect/chains/evm/provider`, `${OKX_DEX}/sdks/okx-wallet-integration-introduction`],
    refs: "R2, seções (b) e (e) T0; arquitetura, seção 4",
  },
  {
    id: "agentic-wallet",
    name: "Agentic Wallet da OKX",
    family: "wallet",
    tier: "T2-C",
    summary: "Carteira para agentes com chave em TEE do fornecedor, subcarteiras e limites definidos no portal.",
    status: "blocked",
    blocker:
      "A política de quatro regras é definida só no portal, não filtra contrato nem seletor, e onde e como é aplicada e revogada não é documentado, então fica fora até revisão do instalador e da CLI.",
    sources: [`${OKX_DEX}/wallet/agentic-wallet`, `${OKX_DEX}/wallet/agentic-wallet-skills`, `${OKX_DEX}/wallet/install-your-agentic-wallet`, "https://web3.okx.com/learn/agentic-wallet"],
    refs: "R1, tabela (b); R2, seção (d) modelo 3; arquitetura, seção 4",
  },
  {
    id: "trader-mode",
    name: "Trader Mode da conta principal",
    family: "wallet",
    tier: "T2-C",
    summary: "Cópia de ordens na conta principal, com a chave da conta de seed sob custódia do fornecedor.",
    status: "blocked",
    blocker:
      "O Trader Mode envia a chave da conta principal ao TEE do fornecedor, o que contradiz a decisão de nunca operar com a chave principal e de dar ao Jev no máximo uma fatia designada.",
    sources: ["https://web3.okx.com/onchainos/dev-docs/wallet/agentic-wallet"],
    refs: "R2, seções (a), (d) modelo 8 e (e) revogação",
  },
  {
    id: "dedicated-agent-wallet",
    name: "Carteira de agente dedicada",
    family: "permissions",
    tier: "T2-A",
    summary: "Chave nova fora da carteira principal, com o saldo da conta de agente como teto duro do que se perde.",
    status: "blocked",
    blocker:
      "Market.init() recusa chave em modo live até qualificação, reconciliação e revisão independente, e o gate só é levantado por um commit separado com registro de autorização do dono.",
    sources: [`${OKX_DEX}/wallet/dapp-connect/chains/evm/provider`],
    refs: "R2, seção (d) modelo 1; arquitetura, seções 4 e 2 (D11)",
  },
  {
    id: "safe-roles-allowance",
    name: "Safe com Roles ou Allowance",
    family: "permissions",
    tier: "T2-B",
    summary: "Safe do dono com um módulo de limites ou papéis que restringe alvo e seletor dentro da própria cadeia.",
    status: "blocked",
    blocker:
      "A X Layer não tem Allowance Module nem Roles oficial e a versão corrigida e auditada do Roles ainda não está confirmada, então falta teste em fork, revisão e contrato maker aceito.",
    sources: ["https://github.com/okxlabs/okx-smart-wallet-evm", "https://raw.githubusercontent.com/okxlabs/okx-smart-wallet-evm/main/README.md"],
    refs: "R2, seção (d) modelo 2; arquitetura, seção 4",
  },
  {
    id: "erc4337-session",
    name: "ERC-4337 com chaves de sessão",
    family: "permissions",
    tier: "T2-B",
    summary: "Contas abstratas com chaves de sessão de duração curta, delegadas por um validador instalado.",
    status: "blocked",
    blocker:
      "A cobertura do bundler na X Layer não foi confirmada, o custo de gás e a latência do UserOp não foram medidos e o procedimento exato de revogação não é descrito na fonte lida.",
    sources: ["https://eips.ethereum.org/EIPS/eip-4337", "https://eips.ethereum.org/EIPS/eip-7579"],
    refs: "R2, seção (d) modelo 5 e mapa de revogação",
  },
  {
    id: "eip7702-delegated-eoa",
    name: "EIP-7702 com delegado próprio",
    family: "permissions",
    tier: "T2-B",
    summary: "Conta externa que delega a execução a um contrato por autorização na própria carteira.",
    status: "blocked",
    blocker:
      "O OKX Wallet só documenta o upgrade para o delegado dele e um delegado customizado não está confirmado, e revogar exige uma transação nova com a conta do dono presente.",
    sources: ["https://eips.ethereum.org/EIPS/eip-7702", "https://web3.okx.com/help/okx-wallet-to-support-eip-7702", "https://web3.okx.com/learn/eip-sdk-implementation"],
    refs: "R2, seções (a) e (d) modelo 6",
  },
  {
    id: "erc7715-erc7710",
    name: "ERC-7715 e ERC-7710",
    family: "permissions",
    tier: "T2-B",
    summary: "Permissões executáveis padronizadas, com solicitação e revogação pelo próprio usuário da carteira.",
    status: "blocked",
    blocker:
      "As duas especificações seguem em rascunho e o suporte do OKX Wallet não está documentado, então não há caminho de permissão hoje para esta carteira.",
    sources: ["https://eips.ethereum.org/EIPS/eip-7715", "https://eips.ethereum.org/EIPS/eip-7710", "https://raw.githubusercontent.com/ethereum/ERCs/master/ERCS/erc-7715.md"],
    refs: "R2, seções (a) e (d) modelo 7",
  },
  {
    id: "human-signed-t1",
    name: "T1 com assinatura humana",
    family: "permissions",
    tier: "T1",
    summary: "O Jev propõe um plano e o humano confere e assina na extensão, com aprovação de valor exato.",
    status: "blocked",
    blocker:
      "É viável e não exige mudar o signatário, mas segue não habilitado neste build: o pacote do painel não contém chamadas de assinatura nem de envio.",
    sources: ["https://eips.ethereum.org/EIPS/eip-1193", "https://eips.ethereum.org/EIPS/eip-6963"],
    refs: "R2, seções (d) modelo 4 e (e) T1; arquitetura, seção 4",
  },
  {
    id: "skills-cli",
    name: "Skills e CLI onchainos",
    family: "tooling",
    tier: "T0",
    summary: "Repositório de skills e instalador da CLI, um canal de autenticação diferente da Open API.",
    status: "read_only",
    blocker:
      "O canal da CLI usa sessão própria ou modo anônimo, com limites, custo e backend não confirmados, então serve só como referência de leitura e a saída é tratada como dado não confiável.",
    sources: ["https://github.com/okx/onchainos-skills", "https://github.com/okx/onchainos-skills/security"],
    refs: "R1, tabela (b), linha de skills e CLI",
  },
  {
    id: "mcp-servers",
    name: "Servidores MCP",
    family: "tooling",
    tier: "T1",
    summary: "Servidor MCP hospedado, que consulta e devolve calldata, e servidor local, que também transmite.",
    status: "blocked",
    blocker:
      "O servidor local registra ferramentas que movem fundos e não mostra modo somente leitura global, o que exigiria T1 para qualquer uso e hoje não está habilitado.",
    sources: [`${OKX_DEX}/market/market-ai-tools-mcp-server`, `${OKX_DEX}/trade/dex-ai-tools-mcp-server`],
    refs: "R1, tabela (b), linha de MCP",
  },
  {
    id: "plugins-exchange-kit",
    name: "Plugins e kit da Exchange",
    family: "tooling",
    tier: "T1",
    summary: "Loja de plugins com modo ao vivo e kit da Exchange com muitas ferramentas e flag de somente leitura.",
    status: "blocked",
    blocker:
      "Plugins de estratégia decidem por conta própria e o catálogo afirma revisão de segurança sem descrevê-la, o que contradiz a decisão de que é o Jev quem escolhe o plano.",
    sources: ["https://web3.okx.com/onchainos/plugins", "https://github.com/okx/plugin-store", "https://github.com/okx/agent-trade-kit"],
    refs: "R1, tabela (b), linha de plugins e Exchange",
  },
  {
    id: "sdk-libraries",
    name: "SDKs e bibliotecas DEX",
    family: "tooling",
    tier: "T0",
    summary: "SDK DEX e biblioteca de API da DEX, com broadcast e simulação sob whitelist no primeiro.",
    status: "read_only",
    blocker:
      "O README do SDK imprime toTokenAmount sem converter e os exemplos têm erros de sintaxe, então o repositório mantém cliente próprio e usa o SDK só como referência.",
    sources: ["https://github.com/okx/okx-dex-sdk", "https://github.com/okx/dex-api-library"],
    refs: "R1, tabela (b), linha de SDKs",
  },
  {
    id: "payments-x402",
    name: "Pagamentos x402 e MPP",
    family: "payments",
    tier: "T2-A",
    summary: "Canal de pagamento que a carteira de agente assina de forma autônoma para mover fundos.",
    status: "blocked",
    blocker:
      "Os pagamentos saem da Agentic Wallet sem tetos descritos e só existem na X Layer, o que é um canal de saída extra a bloquear antes de qualquer T2.",
    sources: [`${OKX_DEX}/payments/overview`, `${OKX_DEX}/payments/supported-networks`, `${OKX_DEX}/payments/app`],
    refs: "R1, tabela (b), linha de pagamentos; R2, seção (c)",
  },
  {
    id: "chain-matrix",
    name: "Matriz de cadeias",
    family: "access",
    tier: "T0",
    summary: "Famílias disponíveis por cadeia, com Monad e X Layer como as duas redes usadas pelo Jev.",
    status: "read_only",
    blocker:
      "As contagens divergem entre as páginas oficiais e a matriz não define a legenda, então a cobertura real de cada família tem de ser lida do endpoint de cadeia de cada uma.",
    sources: [`${OKX_DEX}/home/supported-chain`, `${OKX_DEX}/home/change-log`],
    refs: "R1, tabela (b), linha de matriz de cadeias",
  },
  {
    id: "api-auth-portal",
    name: "Autenticação, portal e erros",
    family: "access",
    tier: "T0",
    summary: "Assinatura da requisição, regras do Developer Portal e a tabela de códigos de erro por família.",
    status: "read_only",
    blocker:
      "A tolerância de relógio é de 30 s e o portal limita projetos e chaves por conta, então a credencial serve para leitura e não abre nenhuma permissão de escrita por si só.",
    sources: [`${OKX_DEX}/home/api-access-and-usage`, `${OKX_DEX}/home/developer-portal`, `${OKX_DEX}/trade/dex-error-code`],
    refs: "R1, tabela (b), última linha",
  },
];

export interface CatalogCounts {
  total: number;
  implemented: number;
  read_only: number;
  blocked: number;
  unconfirmed: number;
}

/** How many items the catalog has in total and in each status. */
export function catalogCounts(items: readonly CatalogItem[]): CatalogCounts {
  const counts: CatalogCounts = { total: items.length, implemented: 0, read_only: 0, blocked: 0, unconfirmed: 0 };
  for (const item of items) counts[item.status] += 1;
  return counts;
}

export type CatalogStatusFilter = CatalogStatus | "all";

export interface CatalogFilter {
  status: CatalogStatusFilter;
  family: string;
}

/** Filters without touching the input array: the catalog order is always preserved. */
export function filterCatalog(items: readonly CatalogItem[], filter: CatalogFilter): CatalogItem[] {
  return items.filter(
    (item) => (filter.status === "all" || item.status === filter.status) && (filter.family === "all" || item.family === filter.family),
  );
}