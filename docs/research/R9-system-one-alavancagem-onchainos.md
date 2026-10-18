# R9: System One do Jev: camada rapida de decisao de alavancagem sobre o ecossistema OKX Onchain OS

Data de acesso as fontes: 2026-10-11. Pesquisa publica e leitura de codigo: nenhum login, chave, chamada autenticada, assinatura ou transacao. Nao e recomendacao de investimento nem promessa de retorno. Estende R1 (capacidades), R3 (matematica da alavancagem, secoes 4 e 6), R6 (inventario), R7 (Agentic Wallet), a arquitetura da central de operacoes (decisoes D1 a D11) e a politica de limites (`src/policy/envelope.ts`). O que nao foi lido em pagina oficial da OKX ou em codigo do repositorio esta marcado como **nao verificado**.

Convencoes: `K4` = cabecalhos OK-ACCESS-KEY, OK-ACCESS-SIGN, OK-ACCESS-TIMESTAMP e OK-ACCESS-PASSPHRASE da Open API. "Sem rotulo" = a pagina esta publicada sem marca GA, beta ou waitlist. Decimais com virgula na prosa, ponto nas formulas e no JSON. Nenhum endpoint abaixo foi inventado: cada caminho vem de uma pagina lida (R1, R6, R7 ou esta pesquisa) ou do registro `src/onchainos/endpoints.ts` da branch `feature/onchainos-data-clients`.

**Definicao usada aqui.** "System One" e a camada rapida e barata que, a cada epoca de decisao, monta um brief numerico e pede ao Jev uma escolha entre candidatos ja elegiveis (cada um com a alavancagem que o envelope permitiu) ou `hold`. Ela nao e o laco de 300 ms do Kuru, que segue intocado com a chave local do Jev na Monad. "Rapida" significa segundos a minutos, na cadencia que as cotas das APIs permitem; nenhuma capacidade da OKX entra no bloco de 300 ms (R1, item 9).

## 1. Resumo executivo

1. **Onchain OS (home):** quatro produtos (Wallet com Agentic Wallet, Trade, Market, Payments) por Skills, Open API e MCP Server. Nenhuma palavra sobre alavancagem, margem, perpetuos, emprestimo, funding ou liquidacao. Oferece os dados e a execucao spot; nao oferece um produto de alavancagem.
2. **OKX.AI:** mercado de servicos entre agentes (Users, ASPs, Evaluators com stake de OKB, escrow A2A e liquidacao instantanea A2MCP). Nao tem sinais, analise de mercado nem suporte a decisao documentados. Para alavancagem nao oferece nada; e um canal de gasto, nao de dado.
3. **Wallet (produto e servico):** Agentic Wallet em TEE, 50 subcarteiras, gas zero na X Layer "adequado a alta frequencia" (afirmacao de marketing), Wallet API de saldo, broadcast (estimativa, simulacao, envio, rastreio) e historico. Nenhum campo de posicao alavancada, fator de saude ou preco de liquidacao.
4. **Payments:** Agent Payments Protocol sobre x402 e MPP, so X Layer 196, tokens USDG, USDC e USDT0, gas gratis por tempo limitado; o agente comprador assina sozinho. Serve para pagar servicos (por exemplo a Market API por chamada), nao para financiar ou mover posicoes entre cadeias.
5. **Trade:** Swap API (quote, approve, swap, 500 ou mais DEXs, 20 ou mais cadeias) e Onchain Gateway (simulacao e broadcast). A pagina de contratos lista, na X Layer, os contratos **Multiply** (`0x18a6704775570afA8dB0D3FC0242515D90d120C0`) e **Loop** (`0x714A871d3B471FF7Ee6A1896B16c5f55884fd910`) "usados para assinar transacoes de produtos de negociacao alavancada", sem API, sem guia e sem parametros. E a unica mencao oficial a alavancagem em todo o Onchain OS e nao e operavel por este projeto.
6. **Market:** preco, indice, candles, trades, token, Trenches (meme), Onchain Core Data, analise de endereco, social, Balance e historico. Sem funding, open interest, perpetuos ou liquidacao. Funding e mark price vem da API publica v5 da Exchange, ja coberta por `src/onchainos/public-okx.ts`.
7. **X Layer:** L2 em OP Stack, bloco de 1 s, gas em OKB, RPC publico a 100 req/s por IP, Flashblocks com preconfirmacao de 200 ms (exemplo oficial em testnet, mainnet nao verificado). Os protocolos com alavancagem (Aave v3 desde 2026-03-30, com seis eModes e ate 88% de LTV; RWAperp, perpetuos, desde 2026-09-03) vem de fontes de terceiros e de um press release: nao verificado nas docs da OKX.
8. **Consequencia:** o ecossistema entrega dados rapidos e execucao spot com gates; nao entrega um produto de alavancagem com API. O System One do Jev decide alavancagem no sentido de R3: escolhe, entre candidatos com alavancagem ja limitada pelo envelope (fase 0: 0x; fase 1: 1x; fase 2: no maximo 2x e 0,25 do limite inferior do Kelly), o candidato ou `hold`. A execucao de qualquer posicao alavancada continua fora do codigo ate a fase 2 e nunca sem o gate explicito do dono (D11).

## 2. O que cada referencia oferece para alavancagem

### 2.1 O que e o Onchain OS (home)

- Pagina lida: `https://web3.okx.com/pt-br/onchainos/dev-docs/home/what-is-onchainos` (mesmo conteudo da inglesa).
- Oferece: dois metodos de integracao (Skills em linguagem natural e Open API), capacidades "empacotadas como Skills e MCP Server, instalaveis com um comando"; quatro produtos: Wallet (Agentic Wallet), Trade, Market, Payments. Trade cobre "as principais cadeias EVM e Solana".
- Estado: sem rotulo GA, beta ou waitlist. Sem numeros de cadeias, ferramentas ou endpoints.
- Para alavancagem: nada. Nenhuma das palavras alavancagem, margem, perpetuo, emprestimo, loop, multiply, funding ou liquidacao aparece. OKX.AI e X Layer nao sao citados nesta pagina.
- Links seguidos: Wallet (`../wallet/product-and-service`), Trade (`../trade/dex-api-introduction`), Market (`../market/market-api-introduction`), Payments (`../payments/overview`): sao as outras referencias desta pesquisa.

### 2.2 OKX.AI

- Paginas lidas: `https://web3.okx.com/pt-br/onchainos/dev-docs/okxai/what-is-okxai` e `https://web3.okx.com/onchainos/dev-docs/okxai/agent-installation-guide`.
- O que e: ecossistema de "Agent Commerce". Papeis: User (constroi ou usa agentes e publica tarefas), ASP (Agent Service Provider, vende servicos A2A ou A2MCP), Evaluator (faz stake de OKB e resolve disputas; minimo de 5 avaliadores por caso, maioria decide). Fluxo A2A: tarefa, escrow em contrato, entrega, avaliacao, pagamento liberado "em segundos". A2MCP: servicos simples e repetiveis liquidam na hora sem escrow. Infraestrutura: Agentic Wallet (identidade e ativos do agente) e Agent Payments Protocol.
- Instalacao: frameworks OpenClaw, Hermes, Claude Code (modo Code) e Codex; instalador `npx -y @okxweb3/onchainos-installer install`; login no Agentic Wallet obrigatorio; hospedagem em nuvem de terceiro (Pieverse) com aviso de que a OKX nao responde por ela. Capacidades citadas: consulta de saldo, swap e dados de mercado por linguagem natural, virar ASP ou Evaluator.
- Nao documenta: cadeias (o CLI forca 196 no comando `agent`, R6), tarifas, estado GA ou beta, sinais de mercado, analise, suporte a decisao, alavancagem, perpetuos ou margem.
- Para alavancagem: nada de dado. Em tese um agente poderia contratar outro agente para "analise"; isso traria texto externo ao Jev (porta de injecao, R2) e gasto por escrow. Fora do escopo do System One; classe `never-automate` em R6.

### 2.3 Wallet: produto e servico

- Pagina lida: `https://web3.okx.com/pt-br/onchainos/dev-docs/wallet/product-and-service`. Links seguidos: `wallet/balance-api-overview`, `wallet/onchain-gateway-api-overview`, `wallet/tx-history-api-overview` (conteudo ja em R1 e R7) e `wallet/install-your-agentic-wallet` (R7).
- Agentic Wallet: chaves geradas, guardadas e usadas em TEE; verificacao de identidade, bloqueio de enderecos em lista negra e alerta de token de risco antes de cada transacao; X Layer, Ethereum, Solana e outras cadeias; login por e-mail, Google ou Apple; ate 50 subcarteiras; "gas zero na X Layer, adequado a negociacao de alta frequencia" (afirmacao do produto, sem medida de latencia); negociacao em linguagem natural.
- Wallet API: Balance (valor total, saldos multichain, token especifico: `GET /api/v6/dex/balance/total-value-by-address`, `GET .../all-token-balances-by-address`, `POST .../token-balances-by-address`, tier Free, R1); Broadcast (estimativa de gas, simulacao, envio e rastreio de ordem: Gateway `gas-price`, `gas-limit`, `simulate` e `broadcast-transaction` sob whitelist, `post-transaction/orders`, R1); historico (`GET /api/v6/dex/post-transaction/transactions-by-address`, Free).
- Auth: K4 na Open API; JWT do CLI no canal privado do Agentic Wallet (R7). Limites de taxa do canal privado nao publicados; 429 sem backoff (R7).
- Estado: sem rotulo. Agentic Wallet lancado em 2026-03-18 (R7).
- Para alavancagem: a pagina nao cita margem, emprestimo, loop, multiply, perpetuos, funding, liquidacao, ordens limite ou Trader Mode. O que existe fora dela (R7): ordens limite no TEE (`strategy create-limit`: buy dip, take profit, stop loss, buy above; minimo US$1, 7 dias, slippage padrao 15, 6 redes sem Monad) sao gatilhos de codigo, nao decisao do Jev; `wallet contract-call` e a porta generica para qualquer contrato (inclusive Aave, Multiply ou Loop), sem allowlist de contrato ou seletor na politica do portal. A politica tem so quatro regras (limite por transacao, diario de transferencia, diario de trade, whitelist de destinos). Posicoes de lending ou perps: a Wallet API nao devolve fator de saude nem preco de liquidacao; a DeFi API devolve posicoes com `assetStatus` e `updateAt` (`POST /api/v6/defi/user/asset/platform/list` e `/detail`, R1), sem campos de liquidacao documentados.

### 2.4 Payments

- Paginas lidas: `https://web3.okx.com/pt-br/onchainos/dev-docs/payments/overview` e `https://web3.okx.com/onchainos/dev-docs/payments/supported-networks`.
- Oferece: Agent Payments Protocol (APP), padrao aberto compativel com x402 e MPP, sobre HTTP ou dialogo entre agentes; plataforma Onchain OS Payments com skills, MCP, Open API e SDK. Metodos: one-time (preco conhecido, entrega unica), batch (preco unitario minimo e alta frequencia), pay-as-you-go (relacao longa, vouchers), subscription (recorrente), escrow (terceiro garante). Papeis: vendedor DApp ou MCP (SDK ou middleware), vendedor agente (skill, sem IP publico), comprador (Agentic Wallet com skill de pagamento). Vendedores sem cadastro.
- Rede e tokens: so X Layer 196; USDG `0x4ae46a509f6b1d9056937ba4500cb143933d2dc8`, USDC `0xb6ceceab302e2e4948951ee7843fc24e92933061`, USDT0 `0x779ded0c9e1022225f8e0630b35a9b54be713736`; gas gratis "por tempo limitado" ao pagar com esses tokens. Solana, BNB e Base "Coming Soon" (R6). A pagina de contratos da X Layer lista outro USDC (`0x74b7F16337b8972027F6196A17a631aC6dE26d22`): conferir antes de usar (R6).
- Quem assina: "o agente do comprador assina pagamentos de forma autonoma pela Agentic Wallet". Tarifas, limites, estado GA ou beta: nao mencionados.
- Para alavancagem: nao e trilho de capital. Nao move fundos entre cadeias nem financia posicoes; move stablecoin de um agente comprador para um vendedor. O unico uso ligado a decisao seria pagar a Market API por chamada via x402 (R1: planos ou x402 em USDG ou USDT na X Layer) para dados Premium, e isso e um canal de gasto autonomo (R6, achado 2: o CLI assina x402 sozinho apos o login). Decisao mantida: nenhuma skill de pagamento no host do operador; `payment_pay` nunca chamado (R7).

### 2.5 Trade: DEX API

- Paginas lidas: `https://web3.okx.com/pt-br/onchainos/dev-docs/trade/dex-api-introduction`, `https://web3.okx.com/onchainos/dev-docs/trade/dex-swap-api-introduction`, `https://web3.okx.com/onchainos/dev-docs/trade/onchain-gateway-api-introduction` e `https://web3.okx.com/onchainos/dev-docs/trade/dex-smart-contract`.
- Oferece: Swap API (agregador de 500 ou mais DEXs, "20 ou mais cadeias", roteamento com divisao de ordem entre DEXs e PMMs; fluxo `/supported/chain`, `/aggregator/all-tokens`, `/quote`, `/approve-transaction`, `/swap`; caminhos completos em `/api/v6/dex/aggregator/*`, R1) e Transaction (Gateway) API: simulacao e broadcast com nos proprios e de terceiros, multi-broadcast e aceleracao de inclusao; "ETH, BNB Chain, Solana e mais". Casos de uso listados: dashboards, swaps nativos, bots multichain (arbitragem, mineracao de liquidez, gestao de ativos), "plataformas de lending DeFi" (rastreio de liquidez para estrategias de lending) e bots de arbitragem DEX e CEX-DEX.
- Auth e limites (R1): K4; Trial 60 dias a 1 RPS (ate 5 apos revisao), Start-up 2 a 50 RPS, Enterprise sob contrato; simulate e broadcast sob whitelist (dexapi@okx.com); MEV experimental so em ETH, BSC, SOL e BASE. Estado: sem rotulo; v6 desde 2025-09-25; Monad na Trade API desde 2025-11-21.
- Contratos (pagina `dex-smart-contract`, lida nesta pesquisa): roteador Monad `0xc1c76e784db8d68585fb608ce68fc5dcff14000e`, aprovacao Monad `0xf534A8a1CAD0543Cd6438f7534CA3486c01998d4`; roteador X Layer `0x7c5bee2a8091c3ef39072f64f18fac913060aeaf`, aprovacao X Layer `0x8b773D83bc66Be128c60e07E17C8901f7a64F000`; roteadores exactOut so em Ethereum, Base, BNB e Arbitrum. Secao "Leverage Trading": **Multiply** `0x18a6704775570afA8dB0D3FC0242515D90d120C0` e **Loop** `0x714A871d3B471FF7Ee6A1896B16c5f55884fd910`, ambos na X Layer, descritos apenas como "enderecos de contrato da OKX usados para assinar transacoes de produtos Multiply (ou Loop)". Orientacao da pagina: usar sempre os enderecos devolvidos pela API, nao fixar enderecos da documentacao, monitorar a pagina se houver allowlist. ABIs linkadas: `https://github.com/okxlabs/DEX-Router-EVM-V1/tree/main/DexRouterabi` e `https://github.com/okxlabs/Web3-DEX-EVM-PMM` (so do roteador, nao de Multiply ou Loop).
- Multiply e Loop: nenhuma pagina de API, guia, parametro, ABI, protocolo de lending subjacente, fator de saude ou limite de alavancagem foi localizada nas docs nem na busca. Fontes de terceiros descrevem um recurso "Loop investing" da OKX (emprestar, trocar e depositar em uma transacao, com contagem de voltas, retorno projetado, custo do emprestimo, preco de liquidacao e fator de saude) e a integracao do OKX Wallet com a Contango (2024, "camada de looping"): **nao verificado** (pagina da noticia bloqueada, so trecho de busca). Classe em R6: `never-automate`, P3.
- Para alavancagem: a Trade API entrega cotacao e calldata spot (unidade de `toTokenAmount` ainda nao declarada, R1), que o System One usa como custo de execucao e profundidade. Multiply e Loop existem como enderecos, nao como produto integravel. Nada muda a regra: nenhuma API da OKX assina ou envia sozinha; o executor e o gate continuam no repositorio.

### 2.6 Market API

- Paginas lidas: `https://web3.okx.com/pt-br/onchainos/dev-docs/market/market-api-introduction` e `https://web3.okx.com/onchainos/dev-docs/market/market-scan-chain-api-reference` (Trenches). Referencias por familia ja lidas em R1 e R6.
- Oferece: REST JSON e canais WebSocket sobre "centenas de DEXs e CEXs"; nove referencias: Market price (`POST /api/v6/dex/market/price`, `GET .../market/candles` ate 299 por chamada e 1.440 velas de 1s a 3M, `/historical-candles`, `/trades` ate 500), Index price (`POST /api/v6/dex/index/current-price` ate 100 tokens, Free; `GET .../index/historical-price`), Token (`price-info`, `advanced-info`, `holder`, `top-liquidity`, `hot-token`, clusters), Strategy (na pratica a Trenches API: 7 endpoints `memepump/*`), Onchain Core Data, Address Analysis (portfolio, `address-tracker/trades`), Social (`social/sentiment/symbol`, `vibe/timeline`, `vibe/top-kols`), Balance e historico. Sinais e leaderboard (`POST .../signal/list`, `GET .../leaderboard/list`, Premium) vem de R1.
- Auth e limites (R1): K4; Free: 100 mil chamadas Basic e 100 mil Premium por mes (cerca de 2,3 por minuto cada), sem WebSocket; Starter US$99 a Pro US$599; excedente US$0,0001 (Basic) e US$0,0002 (Premium); WebSocket `wss://wsdex.okx.com/ws/v6/dex` so em plano pago, 3 req/s por chave, 480 operacoes por hora por conexao; RPS REST nao documentado. Estado: sem rotulo; Social desde 2026-05-15.
- Para alavancagem: a Market API nao tem funding, open interest, mark price, perpetuos, liquidacao ou derivativos (o nome de icone `okx-defi-perpetual` nas fichas e um rotulo de imagem, nao conteudo). Esses dados vem da API publica v5 da Exchange, sem autenticacao: `GET /api/v5/public/funding-rate` (10 req por 2 s), `/public/funding-rate-history` (ate 400 linhas), `/public/mark-price`, `/public/open-interest`, `/market/ticker`, `/market/candles` (40 req por 2 s), `/market/books` (ate 400 niveis), todos ja registrados em `src/onchainos/endpoints.ts` com os limites por 2 s do espelho oficial `okx/ai-builder-openapi-md`. Candles, indice, trades e `price-info` dao a volatilidade realizada (`sigma`) que alimenta o envelope; sinais, holders e social entram so como numeros.

### 2.7 X Layer

- Paginas lidas: `https://web3.okx.com/pt-br/onchainos/dev-docs/xlayer/developer/build-on-xlayer/about-xlayer`, `https://web3.okx.com/onchainos/dev-docs/xlayer/developer/rpc-endpoints/rpc-endpoints` e `https://web3.okx.com/onchainos/dev-docs/xlayer/developer/flashblocks/overview`.
- Rede: L2 da OKX em OP Stack "aprimorado" (op-node sequenciador com op-reth pela Engine API, cluster Conductor com 99,9% de uptime declarado), equivalencia EVM total, bloco de 1 s, ate 20.000 TPS, "gas insignificante" em OKB (oferta fixa de 21 milhoes), dados publicados na L1, janela de desafio de 7 dias, saques liquidados via AggLayer com prova pessimista (ZK). A pagina diz "finalidade imediata na L2" e, ao mesmo tempo, 7 dias de desafio: tratar como preconfirmacao do sequenciador, nao finalidade economica.
- RPC: chain ID 196 (`0xC4`), `https://rpc.xlayer.tech` e `https://xlayerrpc.okx.com`; testnet 1952; limite de 100 requisicoes por segundo por IP; `eth_subscribe` e `eth_unsubscribe` listados (WebSocket `wss://xlayerws.okx.com`, R6); `eth_getLogs`, `debug_trace*` e `txpool_content` (vazio) suportados; `eth_gasPrice` em OKB.
- Flashblocks: preconfirmacao de 200 ms em `https://rpc.xlayer.tech/flashblocks` com a tag `pending`; bloco flash e canonico compartilham numero e podem ter hashes diferentes; o exemplo oficial usa chain ID 195 e `testnet: true`, com explorer `xlayer-test`: disponibilidade em mainnet **nao verificado**.
- Protocolos DeFi com alavancagem (nenhum listado nas docs da OKX; tudo abaixo e terceiro ou press release): Aave v3 na X Layer desde 2026-03-30, acessivel pelo OKX Wallet sem ponte, supply de USDT0, USDG, GHO, xBTC, xETH, xSOL, xBETH e xOKSOL, borrow de USDT0, USDG, GHO, xBTC, xETH e xSOL, seis eModes com ate 88% de LTV em pares de liquid staking (The Block; R3 mediu Aave X Layer USDT0 a 2,94% na DefiLlama); RWAperp, venue de perpetuos de acoes, indices, commodities e cripto lancada em 2026-09-03 com 19 mercados, liquidacao em USDG (o texto tambem diz USDC), "Agent mode" por linguagem natural e sem mencao a API ou alavancagem maxima (press release "Presented by RWAperp": **nao verificado**); Dolomite anunciou lending em 2024 (estado atual **nao verificado**); Uniswap e Stargate presentes. TVL da X Layer: cerca de US$25 milhoes (mar/2026) contra "mais de US$100 milhoes" (press release de set/2026): numeros conflitantes, nao reconciliados.
- Para alavancagem: a X Layer e a unica cadeia do ecossistema com lending (Aave) e perpetuos (RWAperp) sobre os quais um loop ou uma posicao alavancada poderia existir, e e a cadeia de gas zero do Agentic Wallet. Mas a OKX nao documenta API para nenhum deles; fator de saude e preco de liquidacao teriam de vir do contrato (por exemplo `getUserAccountData` do Pool do Aave v3, funcao padrao do protocolo; endereco do Pool na X Layer **nao verificado**) via RPC proprio. Monad (143) nao tem nenhum desses produtos documentados no Onchain OS.

### 2.8 Sintese: dado, execucao e lacuna

| Necessidade do System One | Onde existe | Lacuna |
|---|---|---|
| Preco, indice, candles, trades por cadeia e contrato | Market API (K4, Basic e Free) | moeda de `price` nao declarada; cota Free de 2,3 chamadas por minuto por tier |
| Funding, mark, OI, livro, candles de perpetuos | API publica v5 da Exchange (sem auth, limites por 2 s) | nao e Onchain OS; elegibilidade de perps no Brasil nao confirmada (R3, 3.8) |
| Sinais, holders, clusters, sentimento | Market API (Premium na maioria) | Monad fora dos exemplos; sem janela temporal; so como numero |
| Taxas de lending e profundidade | DeFi API: `product/search` (LENDING), `detail`, `rate/chart`, `tvl/chart`, `depth-price/chart` | 143 e 196 nao confirmados; APY nao e retorno |
| Saldos e valor | Balance API (Free) | unidade de `balance` e relogio do preco nao declarados |
| Posicoes alavancadas (HF, preco de liquidacao) | nenhum endpoint do Onchain OS | so via contrato do protocolo por RPC; nao implementado |
| Execucao spot com calldata | Swap API mais executor do repositorio | unidade de `toTokenAmount`; whitelist de simulate e broadcast |
| Execucao alavancada | Multiply e Loop so como enderecos; `contract-call` do Agentic Wallet como porta generica | sem API, sem ABI, sem parametros: nao integravel |
| Pagamento de dados por chamada | Payments x402 na X Layer | canal de gasto autonomo; decisao de nao instalar |

## 3. Arquitetura do System One do Jev

Principios herdados e nao negociaveis: o Jev escolhe um id elegivel ou `hold` e nunca monta calldata, escolhe destino, aprova valor ou define alavancagem livre (D1); um unico pipeline (D2); alavancagem e um botao de risco por fase (D4); o teto esta no saldo, no contrato e no humano (D5 e D6); sem Jev, `hold` (D7); nada passa de dry run para execucao real sem os quatro itens de D11. A novidade do System One e so uma: **a alavancagem vira atributo do candidato, atribuida pelo envelope, e o Jev escolhe entre candidatos cujas alavancagens ja cabem na fase.** Assim "o Jev decide a alavancagem" e verdadeiro dentro do conjunto que o codigo permitiu, e nunca acima dele.

### 3.1 Camada 1: sinais rapidos

Fontes, todas somente leitura, com proveniencia (`ReadMeta`: instante, tentativas, endpoint) e valores numericos tipados (`null` para desconhecido, nunca zero):

| Sinal | Cliente (branch `feature/onchainos-data-clients`) | Endpoint | Cadencia sugerida no plano Free |
|---|---|---|---|
| Preco atual, indice, candles, trades | `src/onchainos/market-price.ts` (`createMarketPriceClient`, `parseCandles`, `BARS`) | `POST /api/v6/dex/market/price`, `POST /api/v6/dex/index/current-price`, `GET .../market/candles`, `GET .../market/trades` | candles 1m a cada 60 s por instrumento; indice a cada 60 s (Free) |
| Funding, mark, OI, livro, candles de perpetuos | `src/onchainos/public-okx.ts` (`createPublicOkxClient`, `buildDerivativesSnapshot`) | `GET /api/v5/public/funding-rate`, `/funding-rate-history`, `/public/mark-price`, `/public/open-interest`, `/market/ticker`, `/market/candles`, `/market/books` | a cada 30 a 60 s; teto interno de 5 req/s (`PUBLIC_MAX_REQUESTS_PER_SECOND`) |
| Sinais e leaderboard | `src/onchainos/signals.ts` | `POST .../signal/list`, `GET .../leaderboard/list` | a cada 5 a 15 min (Premium) |
| Sentimento e vibe | `src/onchainos/social.ts` | `GET .../social/sentiment/symbol`, `/vibe/timeline`, `/vibe/top-kols` | a cada 15 min; so numeros |
| Risco e liquidez do token | `src/onchainos/market-token.ts` | `POST .../price-info`, `GET .../advanced-info`, `/holder`, `/top-liquidity`, clusters | a cada 15 a 60 min |
| Taxas e profundidade de lending | `src/onchainos/defi-read.ts` | `POST /api/v6/defi/product/search` (LENDING), `GET .../detail`, `/rate/chart`, `/tvl/chart`, `/depth-price/chart` | a cada 15 min |
| Gas por cadeia | `src/onchainos/gateway.ts` | `GET /api/v6/dex/pre-transaction/gas-price` | a cada 60 s |
| Captura para replay | `src/onchainos/capture.ts`, `capture-sources.ts`, `scripts/onchainos-capture.ts` | grava `capture.jsonl` com ledger e manifest | continuo em sessao de captura |

A construir: `src/system-one/features.ts`, funcao pura que transforma uma janela ponto no tempo (candles, funding, livro, gas) em `FeatureMap` com `sigmaDaily` (realizada em 30 e 90 dias, `max` das duas como em R3 secao 6), retornos em 1, 5, 20 e 100 velas, razao de volume, funding anualizado e pior janela de 30 dias, profundidade em bps para o tamanho, custo fixo em USD; cada feature carrega `observedAtMs` e `staleAfterMs`. `src/system-one/sources.ts` agenda as leituras dentro das cotas (orcamento mensal por tier como configuracao, com parada ao atingir 90%). Latencia do Jev: nao medida ate hoje (R3, R13); o System One precisa medir p50, p95 e p99 antes de prometer qualquer cadencia.

### 3.2 Camada 2: estado da carteira e exposicao

- Existe: `src/okx-wallet/portfolio.ts` (`createOkxPortfolioClient`, `normalizeInventory`, `InventorySnapshot` com `knownValueUsd`, `valueComplete`, cadeias e ativos), `src/okx-wallet/chains.ts` (inclui 143 e 196), `src/okx-wallet/valuation.test.ts` (valuation finita), `src/operator/ledger.ts` (`OperatorLedgerState`, `CumulativeLimits`, chaves de dia e semana, pernas abertas), `src/operator/insights.ts`.
- A construir: `src/system-one/exposure.ts`, pura, que a partir de `InventorySnapshot` mais ledger devolve `ExposureState`: patrimonio em USD, fracao exposta por ativo (`f`), alavancagem corrente (`nocional / patrimonio`, 1 quando so spot financiado), PnL do dia e da semana como fracao do patrimonio de abertura (UTC), drawdown de pico a vale, cooldown ativo, kill switch (`data/operator/STOP`). Posicoes alavancadas: `null` ate existir leitor de posicao (DeFi `user/asset/platform/list` nao implementado; fator de saude de lending so via contrato do protocolo por RPC, nao verificado); `null` torna inelegivel qualquer candidato com alavancagem acima de 1.
- Regra: o Jev ve agregados e fracoes; nunca endereco, saldo bruto por carteira, credencial ou cotacao crua (`buildOperatorState` ja faz isso para o operador).

### 3.3 Camada 3: envelope de risco

Existe e e puro: `src/policy/envelope.ts` com `PHASES` (fase-0: 0x; fase-1: 1x, ordem ate 1%, DLL 2%, semanal 5%, drawdown 10%, cooldowns 15 min, 24 h e 72 h; fase-2: `min(2, 0.25 * kellyLowerBound)`, ordem ate 2%, piso de distancia de liquidacao), `deriveLimits`, `checkSettings`, `kellyLeverage`, `kellyLowerBound`, `touchLiquidationProbability`, `medianWealthNoEdge`, `maxExposureFraction` (`DLL/(2*sigma)`), `liquidationDistanceFloor` (`max(0.35, 2.5*sigma*sqrt(7))`).

A construir: `src/system-one/envelope-bridge.ts`, pura: recebe `phase`, `ExposureState`, `sigmaDaily` por instrumento e, na fase 2, o `kellyLowerBound` medido pelo laboratorio; devolve, por instrumento, o conjunto de alavancagens permitidas (fase 0: nenhum candidato com exposicao; fase 1: `{1}`; fase 2: `{1, 2}` cortado por `0.25 * kellyLowerBound` e pelo piso de liquidacao), o teto de ordem em USD, a fracao maxima `f` e o orcamento diario restante. Cada alavancagem permitida gera um candidato distinto (secao 3.4). Nada aqui e autorizacao: `ok=true` do envelope significa que a configuracao cabe na fase (POLITICA-DE-LIMITES, secao 0).

### 3.4 Camada 4: o brief de decisao de alavancagem

O brief e o unico objeto que o Jev recebe. So numeros, enumeracoes e ids opacos; nenhum texto externo (nome de token, noticia, mensagem de API). Dado ausente, velho ou com unidade incerta vem como `null` e torna o candidato inelegivel antes do brief (R2, secao f; JEV-DECISAO-ONCHAIN-OS, secao 5). Forma exata proposta (`src/system-one/brief.ts`, a construir, com `LeverageBrief` validado por `checkBrief` antes de qualquer chamada ao modelo):

```json
{
  "version": "system-one-brief/1",
  "observedAtMs": 1760140800000,
  "phase": "fase-1",
  "horizonHours": 24,
  "account": {
    "equityUsd": 80.0,
    "exposureFraction": 0.0,
    "leverageNow": 1.0,
    "dayPnlFraction": 0.0,
    "weekPnlFraction": -0.004,
    "drawdownFraction": 0.012,
    "cooldownActive": false,
    "killSwitch": false
  },
  "envelope": {
    "maxLeverage": 1.0,
    "maxOrderUsd": 0.8,
    "maxExposureFraction": 0.1499,
    "liquidationDistanceFloor": null,
    "dailyLossBudgetRemainingFraction": 0.02,
    "kellyLowerBound": null
  },
  "candidates": [
    {
      "key": "c1",
      "modality": "funding-carry",
      "side": "neutral",
      "chainIndex": "exchange",
      "leverage": 1,
      "sizeUsd": 0.8,
      "features": {
        "fundingAprPercent": 5.57,
        "fundingWorst30dPercent": 0.37,
        "sigmaDaily": 0.0196,
        "ret1": 0.0012,
        "ret20": -0.0041,
        "depthBpsForSize": 1.2,
        "basisAprPercent": 4.4
      },
      "costs": {
        "feeBps": 30,
        "spreadBps": 4,
        "slippageBps": 2,
        "fixedUsd": 0.0,
        "inferenceUsd": 0.000084,
        "complete": true
      },
      "risk": {
        "liquidationDistance": null,
        "touchProbability7d": 0.0,
        "medianNoEdge30d": 0.994,
        "volatilityDragPerDay": 0.000192
      },
      "freshness": { "oldestFeatureAgeMs": 42000, "validUntilMs": 1760141100000 },
      "provenance": { "sources": ["public.funding-rate", "public.candles", "public.books"] }
    },
    {
      "key": "c2",
      "modality": "spot-momentum",
      "side": "long",
      "chainIndex": "143",
      "leverage": 1,
      "sizeUsd": 0.8,
      "features": { "sigmaDaily": 0.0667, "ret1": 0.004, "ret5": 0.011, "ret20": 0.03, "ret100": -0.12, "volumeRatio": 1.4, "depthBpsForSize": 9.0, "signalCount1h": 0, "sentimentRatio24h": null },
      "costs": { "feeBps": 0, "spreadBps": 12.5, "slippageBps": 5, "fixedUsd": 0.0018, "inferenceUsd": 0.000084, "complete": true },
      "risk": { "liquidationDistance": null, "touchProbability7d": 0.0, "medianNoEdge30d": 0.947, "volatilityDragPerDay": 0.00222 },
      "freshness": { "oldestFeatureAgeMs": 15000, "validUntilMs": 1760141100000 },
      "provenance": { "sources": ["market.price.candles", "market.token.top-liquidity", "gateway.gas-price"] }
    }
  ]
}
```

Regras do brief: `phase` e sempre explicita; `candidates` contem so os elegiveis, com `leverage` ja fixado pelo envelope (na fase 2 o mesmo instrumento aparece como `c3` com `leverage: 2` se o envelope permitir, com `risk.liquidationDistance` e `touchProbability7d` recalculados para 2x); `sizeUsd` vem do perfil da fase, nunca do modelo; `risk.touchProbability7d` e `medianNoEdge30d` sao calculados por `envelope.ts`; o brief inteiro e gravado no journal antes da chamada; se nao houver candidato elegivel, o Jev nao e consultado e nao ha custo de inferencia. Resposta esperada (mesmo contrato de `validateOperatorDecision` e de `validateChooserAnswer` do laboratorio): `{ "choice": "c1" | "hold", "probabilities": { "hold": 0.3, "c1": 0.5, "c2": 0.2 }, "confidence": 0.4, "latencyMs": 812, "inputTokens": 1900 }`. Pesos nao sao probabilidade de lucro; a calibracao e medida no laboratorio (Brier e tabela de confiabilidade), nunca presumida.

### 3.5 Camada 5: a escolha do Jev

- Existe: `src/operator/jev-selector.ts` (`JevOperatorModel` sobre `experimental_evaluate` do SDK `ai` com `@ai-sdk/typesafe-ai`, `buildOperatorState`, `validateOperatorDecision`, `decisionFromEvaluation`, `MockOperatorModel`), contrato de prazo e cancelamento em `docs/OPERATOR-DECISION-BOUNDARY.md` (padrao 10.000 ms, `maxRetries: 0`, `abortSignal`, resposta tardia recusada, custo `null` quando desconhecido), e no laboratorio `src/lab/policies.ts` (`JevPolicy`, `LabChooser`, `ChooserState` com chaves opacas `c1, c2, ...`, `validateChooserAnswer`, `MockJevChooser` sempre marcado `isMock`).
- A construir: `src/system-one/jev-leverage-selector.ts`, um `LabChooser` real que recebe o `LeverageBrief` (nao `ChooserState`) e devolve `ChooserAnswer`, reutilizando o adaptador TypeSafe de `jev-selector.ts` e a validacao existente. O modelo real e o unico que decide; nenhuma regra de codigo escolhe por ele (as regras `momentumRulePolicy` e `carryRulePolicy` do laboratorio sao linhas de base para comparacao, nunca o decisor). Falha, timeout, resposta invalida ou chave desconhecida: `hold`, com `decision_failed`, `decision_timeout` ou `decision_invalid` no journal e sem retry.
- O prompt de sistema descreve o esquema e os limites; nao contem noticias nem texto de API. O custo de inferencia por decisao (hoje cerca de US$0,000084 com 2.000 tokens, R3) e um campo do candidato (`costs.inferenceUsd`) e entra no teto de custos por sessao.

### 3.6 Camada 6: plano e execucao com gates

- Existe: `src/operator/plan.ts` (`buildExecutionPlan` com `quoteHash`, `idempotencyKey`, validade, `planIsFresh`), `src/operator/risk-gate.ts` (`gateCandidate`, `gateCandidates`, `validateOperatorPolicy`), `src/operator/ledger.ts` (orcamento diario e semanal, pernas abertas, `data/operator/STOP`), `src/operator/executor.ts` (`EvmSigner`, approve exato, allowlist de roteador, `minReceiveMatchesQuote`), `src/operator/config.ts` (perfis `micro`: plano ate US$5 ou 5%, US$20 e 4 planos por dia, cooldown 15 min, perdas diaria US$2, semanal US$5, drawdown US$10; `standard`), `scripts/okx-operator.ts` (`OPERATOR_EXECUTE`, `DRY_RUN`, `LIVE_ACK=OWN_FUNDS_RISK`), `scripts/qualify-live.ts`, `docs/LIVE-QUALIFICATION.md`.
- Niveis (arquitetura, secao 4): T0 observar (padrao, unico implementado); T1 o Jev propoe e o humano confere e assina na extensao; T2-A carteira de agente dedicada com saldo como teto; T2-B Safe com Roles na Monad (nao confirmado); T2-C Agentic Wallet com limites baixos no portal, so para swaps pontuais fora do laco do Kuru, como segundo signatario atras do mesmo `ExecutionPlan` (R7, secao 5: `src/agentic-wallet/cli.ts`, `session.ts`, `policy-mirror.ts`, `signer.ts`, `receipts.ts`, `audit.ts`, todos a construir; `AGENTIC_ALLOW_FORCE=false` fixo; `tx-scan` antes de cada `contract-call`; aviso 81362 tratado como recusa).
- Para o System One: na fase 0 o plano e sempre `shadow` (registrado, nunca enviado). Na fase 1 um candidato spot 1x escolhido pelo Jev vira `ExecutionPlan` e segue os gates atuais; qualquer execucao real exige `OPERATOR_EXECUTE=true`, `DRY_RUN=false`, `LIVE_ACK=OWN_FUNDS_RISK`, checklist `qualify:live` completo, registro de autorizacao do dono com limites, revisao independente e commit separado que levante o gate (D11). Na fase 2 um candidato com `leverage: 2` so pode virar plano se existir um executor de posicao alavancada com leitor de fator de saude e preco de liquidacao, reconciliacao e kill switch proprio; esse executor nao existe, Multiply e Loop nao tem API, e esta pesquisa nao propoe construi-lo antes de a fase 2 ser alcancada por evidencia fora da amostra. O dry run e o padrao em todas as fases e nenhuma camada deste documento executa sozinha.
- Kill switch em quatro camadas (R7, 5.5): arquivo `data/operator/STOP`; `onchainos wallet logout` (revogacao no servidor nao verificada); limites zerados no portal; `strategy cancel --all` se alguma ordem limite existir (o aplicativo nunca cria). Mais os gatilhos de R3 secao 6: dado velho, divergencia de reconciliacao, gas acima de 2x a mediana, desvio de oraculo, incidente da venue, falha de assinatura.

### 3.7 Camada 7: journal e avaliacao no laboratorio

- Existe: `src/lab/types.ts` (`LabCandidate` com `features`, `costs`, `validUntilMs`, `provenance`; `LAB_MODALITIES` = funding-carry, perp-directional, spot-momentum, yield-allocation, dex-signal, kuru-maker; `LEVERAGES` = 1, 2, 3, 5, 10; `LeverageOutcome` com `liquidated` e `equityMultiple`; `PolicyDecision`; `Outcome` liquido de custos; `LabReport`, `GateResult`), `src/lab/journal.ts` (`FileJournal` append-only com digest), `src/lab/outcomes.ts` (`COST_TABLE`), `src/lab/stats.ts`, `src/lab/policies.ts` (roster com `hold`, aleatoria, buy-and-hold, momentum, carry e Jev), `src/lab/run.ts` (`runEpochs`, `buildReport`, `renderSummaryPt`, portao que so recomenda permanecer na fase-0), `scripts/jev-lab.ts`.
- A construir: `src/system-one/replay-source.ts` que transforma `capture.jsonl` do `src/onchainos/capture.ts` em `RecordStore` do laboratorio (`buildReplaySpec`), com digest do arquivo no manifesto; mapeamento do `LeverageBrief` para `LabCandidate` (um candidato por alavancagem permitida; a modalidade `lending-loop` exigiria nova entrada em `LAB_MODALITIES` e resultados a partir de `rate/chart` e `depth-price/chart`, nao verificado como suficiente); `scripts/system-one-shadow.ts`, CLI que roda o laco em sombra com o Jev real injetado (`isMock: false`) e grava brief, decisao, latencia e custo por epoca. O relatorio responde "as decisoes de alavancagem do Jev tem vantagem?" com o teste de media contra `hold` e contra as linhas de base, correcao de testes multiplos, calibracao e o contrafactual de 1x a 10x (quantas vezes a escolha teria sido liquidada em cada alavancagem). So esse relatorio pode sustentar a promocao de fase, e ele nunca concede permissao.

### 3.8 Sequencia de uma epoca de decisao (modo sombra, padrao)

```mermaid
sequenceDiagram
  participant S as Fontes (onchainos clients, public-okx)
  participant F as features.ts
  participant X as exposure.ts (portfolio, ledger)
  participant E as envelope-bridge.ts (policy/envelope)
  participant B as brief.ts
  participant J as Jev (jev-leverage-selector)
  participant G as risk-gate, plan, ledger
  participant L as lab journal
  S->>F: candles, funding, livro, gas (com ReadMeta)
  F->>B: FeatureMap por instrumento, sigmaDaily, custos
  X->>E: ExposureState (equity, f, L atual, PnL, drawdown, STOP)
  E->>B: alavancagens permitidas, teto de ordem, f max, orcamento
  B->>B: elegibilidade deterministica; checkBrief
  B->>L: grava brief (antes de consultar o Jev)
  alt nenhum candidato elegivel
    B->>L: epoca sem consulta, custo 0
  else ha candidatos
    B->>J: LeverageBrief (so numeros e ids)
    J-->>B: choice, probabilities, latencyMs, inputTokens (ou timeout = hold)
    B->>L: decisao, latencia, custo
    B->>G: candidato escolhido com leverage fixado
    G->>G: gate, plano, limites da fase, kill switch
    G->>L: plano em shadow (fase 0) ou dry run; execucao real so com D11
  end
  L->>L: resultado ponto no tempo, contrafactual 1x a 10x, estatistica
```

### 3.9 O que existe e o que construir

| Camada | Existe (caminho) | Construir (caminho proposto) | Dependencia externa |
|---|---|---|---|
| 1 Sinais | `src/onchainos/{market-price,public-okx,signals,social,market-token,defi-read,gateway,capture,capture-sources,endpoints,http}.ts` (branch `feature/onchainos-data-clients`); `src/operator/funding.ts`; `scripts/onchainos-capture.ts` | `src/system-one/features.ts`, `src/system-one/sources.ts` | chave K4 do portal; plano Market (Free ou pago); elegibilidade regional nao confirmada |
| 2 Carteira | `src/okx-wallet/{portfolio,chains}.ts`; `src/operator/{ledger,insights}.ts` | `src/system-one/exposure.ts`; leitor de posicao de lending via RPC (nao verificado) | endereco da fatia designada; Balance API Free |
| 3 Envelope | `src/policy/envelope.ts`; `scripts/policy-envelope.ts`; `docs/POLITICA-DE-LIMITES.md` | `src/system-one/envelope-bridge.ts` | `kellyLowerBound` medido pelo laboratorio (fase 2) |
| 4 Brief | `buildOperatorState` em `src/operator/jev-selector.ts`; `ChooserState` em `src/lab/policies.ts` | `src/system-one/brief.ts` (`LeverageBrief`, `checkBrief`) | nenhuma |
| 5 Jev | `src/operator/jev-selector.ts`; `src/lab/policies.ts` (`JevPolicy`, `validateChooserAnswer`); `docs/OPERATOR-DECISION-BOUNDARY.md` | `src/system-one/jev-leverage-selector.ts` | chave do modelo; medicao de latencia |
| 6 Execucao | `src/operator/{plan,risk-gate,ledger,executor,config,cycle}.ts`; `scripts/okx-operator.ts`; `scripts/qualify-live.ts` | `src/agentic-wallet/*` (R7); executor de posicao alavancada: nao proposto nesta fase | gate do dono (D11); whitelist da OKX; Multiply e Loop sem API |
| 7 Laboratorio | `src/lab/*`; `scripts/jev-lab.ts`; `docs/JEV-LABORATORIO-DE-DECISAO.md` | `src/system-one/replay-source.ts`; `scripts/system-one-shadow.ts`; modalidade `lending-loop` em `src/lab/types.ts` | capturas longas e fora da amostra |

## 4. Plano de implementacao em fases

Cada fase so comeca quando a anterior passou nos criterios. Nenhuma fase executa sem o gate explicito do dono; as fases 0 a 2 abaixo sao fases de construcao e medicao, nao as fases de risco 0, 1 e 2 do envelope (estas continuam valendo como estao).

**Fase A: dados e brief em sombra (sem Jev real).**
Entregas: `features.ts`, `exposure.ts`, `envelope-bridge.ts`, `brief.ts`, `replay-source.ts`, `scripts/system-one-shadow.ts` com `MockJevChooser`. Criterios de aceitacao: (A1) funcoes puras sem acesso a rede, ambiente, relogio ou aleatoriedade, com teste estatico de pureza como em `src/lab/purity.test.ts`; (A2) brief gerado a partir de um `capture.jsonl` real reproduz byte a byte em duas execucoes; (A3) toda feature ausente, velha (acima de `staleAfterMs`) ou com unidade incerta aparece como `null` e torna o candidato inelegivel (teste por campo); (A4) o envelope nunca emite candidato com `leverage` acima do teto da fase e, na fase 0, nunca emite candidato com exposicao; (A5) `checkBrief` rejeita texto livre, enderecos e chaves fora de `c<n>`; (A6) nenhum byte de travessao, meia-risca ou ponto mediano em codigo, testes e saidas; (A7) nenhum caminho de import de `src/system-one` para `src/operator/executor.ts`, `src/market.ts` ou `src/trader.ts`.

**Fase B: Jev real em sombra e medicao de latencia.**
Entregas: `jev-leverage-selector.ts`, roster com Jev real e linhas de base, 30 dias de capturas continuas (candles 1m, funding, livro) nas cotas do plano Free. Criterios: (B1) p50, p95 e p99 de latencia do Jev registrados por epoca e publicados no relatorio; p99 acima do prazo configurado conta como `hold` e nunca como erro silencioso; (B2) custo de inferencia por decisao e por dia dentro do teto de 1% do capital por sessao; (B3) relatorio do laboratorio com teste de media contra `hold`, correcao de testes multiplos, Brier e tabela de confiabilidade; (B4) contrafactual de 1x a 10x com fracao liquidada por alavancagem; (B5) o portao recomenda permanecer na fase-0 a menos que `t >= 2` no retorno liquido diario, o que com 30 dias so e possivel para Sharpe muito alto (R3, 4.7), e o texto do relatorio diz isso.

**Fase C: janela fora da amostra e decisao do dono.**
Entregas: 90 dias adicionais congelados antes de serem lidos; relatorio comparando System One com as linhas de base; proposta de `kellyLowerBound` por instrumento. Criterios: (C1) janela de avaliacao registrada antes dos dados existirem (hash do manifesto no journal); (C2) limite inferior do retorno liquido diario acima de zero com `t >= 2` para ao menos uma modalidade, ou conclusao explicita de ausencia de vantagem; (C3) `kellyLowerBound` calculado por `envelope.ts` e documentado; (C4) o relatorio continua terminando com o aviso de que nao concede permissao.

**Fase D: operacao spot 1x (fase 1 do envelope), so com autorizacao.**
Entregas: integracao do candidato escolhido ao `ExecutionPlan`, qualificacao `qualify:live`, carteira dedicada com saldo minimo, ensaio cronometrado do kill switch, revisao independente; opcionalmente T2-C com o Agentic Wallet como segundo signatario (R7, 5.5, ordem de qualificacao 1 a 6). Criterios: (D1) todos os quatro itens de D11 registrados em commit separado; (D2) fills reais conciliados pelo recibo na cadeia; (D3) paradas diaria, semanal e de drawdown aplicadas a partir de PnL realizado e conciliado; (D4) nenhuma decisao por contagem fixa de blocos e o laco do Kuru intocado.

**Fase E: alavancagem ate 2x (fase 2 do envelope).**
Pre-requisitos, todos: C2 atendido no mesmo instrumento; leitor de posicao com fator de saude e preco de liquidacao (contrato do protocolo por RPC, nao verificado) com teste de reconciliacao; executor de posicao alavancada revisado de forma independente; piso de distancia de liquidacao conferido antes de cada plano; elegibilidade regional de perps e lending confirmada (R3, 3.8). Multiply e Loop ficam fora ate a OKX publicar API, ABI e parametros. Esta pesquisa nao recomenda iniciar a fase E e registra que, com os dados de R3, nenhuma modalidade a alcanca hoje.

## 5. Riscos e perguntas abertas

**Riscos**

- Alavancagem sem vantagem reduz a mediana para todo `L > 0` (R3, 4.5 e 4.7); o System One pode produzir decisoes "boas" por sobrevivencia em janelas curtas. Mitigacao: portao estatistico com testes multiplos e janelas congeladas; nunca promover por relato.
- Latencia e cadencia: o Jev nao foi medido; as cotas Free dao 2,3 chamadas por minuto por tier na Market API; o WebSocket exige plano pago; o RPC da X Layer limita 100 req/s por IP. "Rapido" aqui e minutos, nao blocos.
- Unidades: `price` e `toTokenAmount` sem moeda ou unidade declarada (R1); tres convencoes de slippage. Feature com unidade incerta e `null`.
- Dados de terceiros sobre X Layer (Aave, RWAperp, Dolomite, TVL) vem de noticia e press release; nenhum tem API documentada pela OKX. Monad nao tem lending nem perps no Onchain OS.
- Multiply e Loop: enderecos sem ABI, sem parametros, sem protocolo subjacente, com classe `never-automate`; `contract-call` do Agentic Wallet permitiria chama-los sem allowlist de contrato no portal. Mitigacao: allowlist de alvo no aplicativo (ja existe para o roteador) e nunca adicionar esses enderecos.
- Canais de gasto autonomo: x402 no CLI e nas skills de pagamento, OKX.AI com escrow. Mitigacao: nao instalar skills de pagamento no host do operador; `payment_pay` e `agent` nunca chamados.
- Injecao por texto: nomes de token, mensagens do CLI e noticias nunca entram no brief; `checkBrief` rejeita strings fora das enumeracoes.
- Custodia e regiao: Agentic Wallet em TEE da OKX com politica so no portal; disponibilidade no Brasil, perps para residentes e tributacao nao confirmadas (R3, 3.8; R7).
- Divergencias nas docs da X Layer: "finalidade imediata" contra 7 dias de desafio; Flashblocks com chain ID 195 em exemplo de testnet; dois contratos USDC em paginas diferentes.
- Mensagem central do demo: nada aqui muda a cadencia, o modelo, a carteira ou o painel do Kuru; o System One e um laco separado e nunca decide a cada N blocos.

**Perguntas abertas**

1. O que sao, por baixo, os contratos Multiply e Loop na X Layer (protocolo de lending, parametros, alavancagem maxima, liquidacao) e se a OKX publicara API ou ABI.
2. Qual e a latencia p50, p95 e p99 do Jev com o brief proposto, e qual o custo mensal de inferencia na cadencia de 1 epoca por minuto.
3. A Market API cobre 143 e 196 em candles, trades e `price-info` com a mesma frescura das cadeias dos exemplos.
4. Existe endpoint do Onchain OS que devolva fator de saude ou preco de liquidacao de posicao de lending (a DeFi `user/asset` documenta so `assetStatus` e `updateAt`), ou o leitor precisa ir ao contrato por RPC.
5. Flashblocks esta disponivel em mainnet 196 e com que garantia; faz diferenca para um laco em minutos.
6. Elegibilidade no Brasil para perps da Exchange, Aave na X Layer, Agentic Wallet e Developer Portal.
7. Onde a politica do Agentic Wallet e aplicada (API ou TEE) e se `contract-call` entra no limite diario de trade (R7).
8. Se vale pagar plano Starter (US$99 por mes) pelo WebSocket para reduzir a idade das features, dado que o capital de referencia e de cerca de US$80 (R3).
9. Qual modalidade entra primeiro no laboratorio com dados reais: funding e basis (dados publicos, ja capturados) parece a unica com serie longa e barata.

## 6. Fontes

Todas acessadas em 2026-10-11. Pagina em `/pt-br/` e inglesa tem o mesmo conteudo onde conferido.

Paginas indicadas pelo dono (lidas):
- https://web3.okx.com/pt-br/onchainos/dev-docs/home/what-is-onchainos
- https://web3.okx.com/pt-br/onchainos/dev-docs/okxai/what-is-okxai
- https://web3.okx.com/pt-br/onchainos/dev-docs/wallet/product-and-service
- https://web3.okx.com/pt-br/onchainos/dev-docs/payments/overview
- https://web3.okx.com/pt-br/onchainos/dev-docs/trade/dex-api-introduction
- https://web3.okx.com/pt-br/onchainos/dev-docs/market/market-api-introduction
- https://web3.okx.com/pt-br/onchainos/dev-docs/xlayer/developer/build-on-xlayer/about-xlayer

Links de um nivel (lidos):
- https://web3.okx.com/onchainos/dev-docs/trade/dex-smart-contract (roteadores, aprovacao, exactOut, Multiply e Loop)
- https://web3.okx.com/onchainos/dev-docs/trade/dex-swap-api-introduction
- https://web3.okx.com/onchainos/dev-docs/trade/onchain-gateway-api-introduction
- https://web3.okx.com/onchainos/dev-docs/market/market-scan-chain-api-reference (Trenches)
- https://web3.okx.com/onchainos/dev-docs/payments/supported-networks
- https://web3.okx.com/onchainos/dev-docs/okxai/agent-installation-guide
- https://web3.okx.com/onchainos/dev-docs/xlayer/developer/flashblocks/overview
- https://web3.okx.com/onchainos/dev-docs/xlayer/developer/rpc-endpoints/rpc-endpoints
- https://github.com/okxlabs/DEX-Router-EVM-V1/tree/main/DexRouterabi e https://github.com/okxlabs/Web3-DEX-EVM-PMM (so listados, nao abertos)

Terceiros (pista ou alegacao; nada foi afirmado so com base neles):
- https://www.theblock.co/post/395594/aave-goes-live-okx-x-layer (Aave na X Layer, 2026-03-30; lido)
- https://thedefiant.io/news/markets/rwaperp-launches-ai-perpetuals-venue-okx-x-layer (press release RWAperp, 2026-09-03; lido)
- https://tradersunion.com/news/brokers-news/show/3244684-okx-launches-loop-investing-feature/ (recurso "Loop investing"; bloqueado, so trecho de busca; nao verificado)
- https://www.fintechfutures.com/press-releases/okx-wallet-now-integrated-with-contango (integracao Contango, 2024; so trecho de busca; nao verificado)
- https://cointelegraph.com/news/uniswap-xlayer-okx-defi-push-evm (404 na leitura; so trecho de busca)
- https://thedefiant.io/news/cefi/okx-launches-100-million-x-layer-fund-introduces-dex-fees-70479e65 e https://governance.aave.com/t/arfc-deploy-aave-v3-on-x-layer/23175/6 (so trechos de busca)

Repositorio (lidos nesta pesquisa): `docs/research/R1-onchain-os-capacidades.md`, `R3-estrategias-e-alavancagem.md`, `R6-onchain-os-inventario.md` e `R6-onchain-os-catalogo.json`, `R7-okx-agentic-wallet.md`; `docs/ARQUITETURA-CENTRAL-DE-OPERACOES.md`, `docs/POLITICA-DE-LIMITES.md`, `docs/JEV-DECISAO-ONCHAIN-OS.md`, `docs/JEV-LABORATORIO-DE-DECISAO.md`, `docs/OPERATOR-DECISION-BOUNDARY.md`, `docs/OKX-DERIVATIVES-SPEC.md`; `src/policy/envelope.ts`, `src/operator/{jev-selector,risk-gate,types,config,plan,ledger,candidates,funding}.ts`, `src/lab/{types,policies,run,journal,candidates,outcomes}.ts`, `src/okx-wallet/*`; na branch `feature/onchainos-data-clients`: `src/onchainos/{read,endpoints,market-price,public-okx,signals,social,market-token,defi-read,gateway,capture,capture-sources}.ts`.

Nota final: nada aqui autoriza execucao, assinatura, aprovacao, emprestimo, posicao alavancada, pagamento x402 ou chamada autenticada. O System One e um laco de medicao com o Jev escolhendo entre candidatos ja limitados; qualquer passagem de dry run para execucao real depende dos quatro itens da decisao D11 e da decisao do dono.
