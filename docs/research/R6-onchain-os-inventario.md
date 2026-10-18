# R6: inventário de páginas e endpoints do OKX Onchain OS (nível de página)

Acesso às fontes: 2026-10-11. Pesquisa pública apenas: nenhuma conta, login, chave, chamada autenticada nem transação; nenhum arquivo `.env` lido. Não é recomendação de investimento nem promessa de retorno. Estende R1 (capacidades) e R2 (carteira). O catálogo legível por máquina é `docs/research/R6-onchain-os-catalogo.json` (444 itens, ids únicos, campos exigidos em todos).

## (a) Resumo executivo

1. **Escopo.** 444 itens em 18 famílias: Trade 35, Gateway 7, Wallet API e Balance 7, DeFi 15, Market 61 (price 5, index 2, token 14, signal 2, leaderboard 2, portfolio 5, tracker 1, social 9, trenches 7, WebSocket 11, planos 2, introdução 1), Onchain Data 29, Security 6, Agentic Wallet 16, Skills 20, CLI 24, MCP 111 (hospedado 22, local 89), Payments 13, SDKs 9, Exchange agent-trade-kit 18, Dapp Connect 5, OKX.AI 2, Acesso e operação 13, X Layer 53.
2. **Classe, segurança, prioridade.** 345 leitura, 22 preparam calldata ou dados para assinar, 77 escrevem ou movem fundos. Segurança: 344 automatizáveis só leitura, 50 exigem aprovação humana, 50 nunca automatizar. Prioridade: P0 7, P1 44, P2 75, P3 318.
3. **Versus R1.** 144 itens já estavam descritos no mesmo nível, 248 pertencem a famílias que R1 nomeou sem enumerar (MCP, CLI, Onchain Data, X Layer, Social), 49 são novos e 3 contradizem R1.
4. **Repositório.** O catálogo declara cobertura local para 48 itens (44 clientes somente leitura, 1 preparação de calldata, 1 fixture, 2 providers do navegador), 3 caminhos registrados e 393 sem integração. São contagens dos campos do JSON; a conferência de código desta revisão é delimitada aos 7 itens P0. Cliente ou adapter presente não comprova chamada real, saldo conciliado nem rentabilidade.
5. **Leitura.** Cerca de 250 das cerca de 590 páginas do índice `llms.txt` foram abertas (todas as de endpoint REST de Trade clássico e Intent, Market, Balance, Gateway, DeFi, Onchain Data e X Layer Data API); 154 itens têm como fonte o código oficial no GitHub (CLI, skills, kit da Exchange), onde não há página REST; 24 itens só foram listados (caminho e tier vêm de outras fontes), 7 foram lidos só por R1 ou R2 e 3 não foram lidos.
6. **Achado 1.** O Intent swap existe nas docs: o `quote` aceita `mode=intent|auto` e devolve typed data EIP-712, há 8 endpoints, solver e RFQ; só 5 cadeias (1, 56, 42161, 8453, 196), sem Monad. R1 dera a página como não localizada.
7. **Achado 2.** O CLI/skills v4.6.4 tem fluxo de cobrança próprio: o primeiro excesso de cada tier exige confirmação e configuração do pagamento padrão; só depois há assinatura automática. O código marca as cotas Basic 1 milhão e Premium 100 mil como placeholders; a mensagem publica Premium USD 0,005 por chamada, versus USD 0,0002 na página REST. Esses valores de fonte não comprovam franquia nem cobrança da conta conectada.
8. **Achado 3.** MCP local: 88 ferramentas (77 leitura, 5 calldata, 2 movem fundos, 1 transmite, 3 mudam configuração) sem modo somente leitura global; MCP hospedado: 21 ferramentas, autenticação só por cabeçalho de chave.
9. **Achado 4.** Correções a R1: o Social `vibe` é por cadeia e contrato (não só símbolo); o kit da Exchange declara 167 ferramentas, a tabela soma 155 e os docs por módulo somam 133; o `walletType` do leaderboard difere entre CLI e REST.
10. **Para o Jev.** Dão sinal: preço/índice/candles/trades, `price-info`, sinais e rastreio de carteiras, risco do token; só habilitam execução: swap, intent, ponte, DeFi, Agentic Wallet. Nenhum entra no laço de 300 ms. Os 7 itens P0 têm clientes locais: cotação, dois saldos, preço atual, candles, índice atual e `price-info`. Preço/candles/índice também têm adapter de captura em `src/onchainos/capture-sources.ts`. Isto não qualifica a cobertura de X Layer/Monad por endpoint, chamadas autenticadas, a carteira real nem estratégias.
11. **Bloqueios.** Monad aparece na matriz de Trade e Market, mas não nos exemplos de sinais, tracker, memepump, Intent, DeFi nem no CLI estático; tiers de Trade, Gateway, DeFi, Social e Security NAO CONFIRMADOS; Brasil NAO CONFIRMADO.

## Revisão delimitada de 2026-10-11

Contagens dos 444 registros foram recalculadas. Conferência independente de métodos, caminhos, limites críticos e unidades ficou restrita aos 7 itens P0 e às condições públicas de acesso/cobrança que os afetam. Os outros 437 contratos não foram revalidados. A cobertura local foi conferida no código apenas para P0; as demais células reproduzem declarações do JSON. Nenhuma chamada autenticada, pagamento, carteira real, operação contínua ou rentabilidade foi qualificada.

Fontes exatas dos P0: [quote](https://web3.okx.com/onchainos/dev-docs/trade/dex-get-quote), [total-value](https://web3.okx.com/onchainos/dev-docs/market/balance-total-value), [all-token-balances](https://web3.okx.com/onchainos/dev-docs/market/balance-total-token-balances), [price](https://web3.okx.com/onchainos/dev-docs/market/market-price), [candles](https://web3.okx.com/onchainos/dev-docs/market/market-candlesticks), [current-price](https://web3.okx.com/onchainos/dev-docs/market/index-price) e [price-info](https://web3.okx.com/onchainos/dev-docs/market/market-token-price-info). A página de preço não declara máximo remoto de lote; o teto local de 100 não é um limite oficial comprovado. Moedas/unidades não declaradas continuam desconhecidas.

Acesso e custo: [tabela REST](https://web3.okx.com/onchainos/dev-docs/market/market-api-fee), [pagamento REST](https://web3.okx.com/onchainos/dev-docs/market/how-to-finish-api-payment), [erros de pagamento](https://web3.okx.com/onchainos/dev-docs/market/payment-error-handling) e [acesso](https://web3.okx.com/onchainos/dev-docs/home/api-access-and-usage). CLI/skills v4.6.4 fixado ao commit `cfbb0bafa71898e50762cd9fa77f026b4a8caa1b`: [notificações](https://github.com/okx/onchainos-skills/blob/cfbb0bafa71898e50762cd9fa77f026b4a8caa1b/skills/okx-dex-market/_shared/payment-notifications.md), [constantes e carência](https://github.com/okx/onchainos-skills/blob/cfbb0bafa71898e50762cd9fa77f026b4a8caa1b/cli/src/payment_notify.rs) e [estado de cobrança](https://github.com/okx/onchainos-skills/blob/cfbb0bafa71898e50762cd9fa77f026b4a8caa1b/cli/src/client.rs).

## (b) Legenda

- Não contam como integração o catálogo de exibição `web/src/lib/central/ecosystem-catalog.ts` (33 itens de capacidade, só dados) nem os documentos em `docs/`. O campo repo das tabelas reproduz a cobertura declarada no catálogo JSON; apenas os 7 itens P0 foram conferidos no código nesta revisão, e presença local não comprova operação.
- Colunas: `id` estável do JSON (padrões `a.b.*` agrupam itens, com a contagem no fim da descrição); **tier** free, basic, prem (premium), wl (whitelist), pago (plano de assinatura, extensão da lista pedida), `?` = unknown = NAO CONFIRMADO, n/a; **cl** R leitura, C prepara calldata ou dados para assinar, W escreve ou move fundos; **P** prioridade; **seg** A automatizável somente leitura, H exige aprovação humana, N nunca automatizar; **R1** cov (mesmo nível em R1), par (família citada sem o item), new, CTR (contradiz R1); **repo** RO cliente somente leitura, CD preparação de calldata, FX fixture, PR provider do navegador, REG caminho registrado nunca chamado, `-` nenhum.
- K4 (R1): cabeçalhos OK-ACCESS-KEY, SIGN, TIMESTAMP e PASSPHRASE (HMAC SHA256 em Base64). CLI e MCP local: login JWT ou modo anônimo. MCP hospedado: só OK-ACCESS-KEY. WebSocket: login K4 no canal. Exchange: chaves da Exchange.
- Prioridade: P0 leitura de alto valor para decisão com caminho viável; P1 leitura de valor médio ou que habilita o operador (inventário, reconciliação, custo, risco); P2 útil depois, dependente de plano pago ou de cobertura por cadeia; P3 baixo valor, lado do provedor, execução ou fora do escopo. Em grupos, vale o menor P e o pior seg.
- docRead no JSON: sim, codigo oficial (GitHub), parcial, sim_R1, sim_R2, so_listado, 404, nao_lido_nesta_pesquisa. As páginas foram lidas por uma ferramenta que resume o texto: reconferir números, endereços e unidades antes de usar. A variante `.md` de cada página devolve o Markdown original em `web3.okx.com`.

## (c) Tabelas por família

Cabeçalho comum: `| id | item (método e caminho) | tier | cl | P | seg | R1 | repo |`

### Trade (35)

| id | item | tier | cl | P | seg | R1 | repo |
|---|---|---|---|---|---|---|---|
| `trade.supported-chains` | GET /api/v6/dex/aggregator/supported/chain | ? | R | P1 | A | cov | RO |
| `trade.all-tokens` | GET /api/v6/dex/aggregator/all-tokens | ? | R | P2 | A | cov | - |
| `trade.get-liquidity` | GET /api/v6/dex/aggregator/get-liquidity | ? | R | P3 | A | cov | - |
| `trade.approve-transaction` | GET /api/v6/dex/aggregator/approve-transaction | ? | C | P2 | H | cov | REG |
| `trade.quote` | GET /api/v6/dex/aggregator/quote | ? | R | P0 | A | par | RO |
| `trade.quote-intent` | GET .../aggregator/quote (mode=intent ou auto), typed data EIP-712 | ? | C | P3 | H | new | - |
| `trade.swap` | GET /api/v6/dex/aggregator/swap | ? | C | P1 | H | cov | CD |
| `trade.swap-instruction` | GET /api/v6/dex/aggregator/swap-instruction (Solana) | ? | C | P3 | H | cov | - |
| `trade.history` | GET /api/v6/dex/aggregator/history | ? | R | P1 | A | new | - |
| `trade.check-approvals` | POST /api/v6/dex/pre-transaction/check-approvals (só no CLI) | ? | R | P2 | A | new | - |
| `trade.intent.*` | Intent: cadeias, approve, order-list, order-status, cancel-signdata, auction-info (6) | ? | RC | P3 | H | new | - |
| `trade.intent.create/cancel` | Intent: POST create-order e cancel-order (2) | ? | W | P3 | H | new | - |
| `trade.solver/rfq` | Solver Intent e RFQ de market makers, lado do provedor (3) | wl | W | P3 | N | new | - |
| `trade.api-fee` | Planos e limites da Trade API (Trial, Start-up, Enterprise) | ? | R | P1 | A | cov | - |
| `trade.smart-contract` | Endereços de roteador e aprovação por cadeia (143 e 196 incluídas) | ? | R | P1 | A | par | - |
| `trade.leveraged-contracts` | Contratos Multiply e Loop na X Layer, sem doc de API | ? | W | P3 | N | new | - |
| `trade.docs` | Guias, introdução, erros, FAQ, segurança e taxas de parceiro (5) | ?/n/a | R | P2 | A | cov/par | - |
| `trade.xchain.*(leitura)` | Ponte: supported/tokens, supported/bridges, status (3) | ? | R | P2 | A | cov | - |
| `trade.xchain.quote` | GET /api/v6/dex/cross-chain/quote (slippage em fração; repo usa caminho v5) | ? | R | P2 | A | cov | RO |
| `trade.xchain.approve/swap` | Ponte: approve-tx e swap (calldata) (2) | ? | C | P3 | H | cov | -/REG |

Nota: sem página REST para a ponte, os 6 caminhos vêm de `cross_chain.rs`; a unidade de `toTokenAmount` e `minReceiveAmount` segue sem declaração em qualquer página.

### Gateway (7)

| id | item | tier | cl | P | seg | R1 | repo |
|---|---|---|---|---|---|---|---|
| `gateway.supported-chains` | GET /api/v6/dex/pre-transaction/supported/chain | ? | R | P3 | A | cov | RO |
| `gateway.gas-price` | GET /api/v6/dex/pre-transaction/gas-price | ? | R | P1 | A | cov | RO |
| `gateway.gas-limit` | POST /api/v6/dex/pre-transaction/gas-limit | ? | R | P2 | A | cov | - |
| `gateway.simulate` | GET (página) ou POST (curl e CLI) .../pre-transaction/simulate | wl | R | P2 | A | cov | - |
| `gateway.broadcast` | POST /api/v6/dex/pre-transaction/broadcast-transaction | ? | W | P3 | H | par | - |
| `gateway.orders` | GET /api/v6/dex/post-transaction/orders | ? | R | P2 | A | cov | - |
| `gateway.overview` | Onchain Gateway: visão geral | n/a | R | P3 | A | cov | - |

### Wallet API e Balance (7)

| id | item | tier | cl | P | seg | R1 | repo |
|---|---|---|---|---|---|---|---|
| `balance.chains/tokens` | visão geral, cadeias e saldo de tokens específicos (3) | ?/free | R | P1 | A | cov | - |
| `balance.total-value` | GET /api/v6/dex/balance/total-value-by-address | free | R | P0 | A | cov | RO |
| `balance.all-token-balances` | GET /api/v6/dex/balance/all-token-balances-by-address | free | R | P0 | A | cov | RO |
| `history.transactions-by-address` | GET /api/v6/dex/post-transaction/transactions-by-address | free | R | P1 | A | cov | - |
| `history.transaction-detail` | GET /api/v6/dex/post-transaction/transaction-detail-by-txhash | free | R | P1 | A | cov | - |

### DeFi (15)

| id | item | tier | cl | P | seg | R1 | repo |
|---|---|---|---|---|---|---|---|
| `defi.product.*(leitura)` | GET /api/v6/defi/product/{supported-chains, supported-platforms, rate/chart, tvl/chart, depth-price/chart} (5) | ? | R | P1 | A | new | RO |
| `defi.product.search` | POST /api/v6/defi/product/search | ? | R | P1 | A | cov | RO |
| `defi.product.detail` | GET /api/v6/defi/product/detail | ? | R | P1 | A | cov | RO |
| `defi.prepare/calculator` | POST product/detail/prepare e calculator/enter/info (2) | ? | R | P3 | A | new | - |
| `defi.transaction.*` | POST enter, exit e claim (calldata; exit só registrado) (3) | ? | C | P3 | H | cov | -/REG |
| `defi.user.*` | POST user/asset/platform/list e detail (2) | ? | R | P2 | A | cov | - |
| `defi.error-codes` | Códigos de erro 84000 a 84999 | ? | R | P3 | A | par | - |

### Market (61)

Tiers da página de planos: Free 20 endpoints (cadeias suportadas, índice, Balance, History, supported-chains do Onchain Data), Basic 33, Premium 19; Trade, Gateway, DeFi, Social, tracker e Security ficam fora da tabela.

| id | item | tier | cl | P | seg | R1 | repo |
|---|---|---|---|---|---|---|---|
| `market.price.supported-chains` | GET /api/v6/dex/market/supported/chain | free | R | P2 | A | par | RO |
| `market.price.price` | POST /api/v6/dex/market/price | basic | R | P0 | A | cov | RO |
| `market.price.trades` | GET /api/v6/dex/market/trades | basic | R | P1 | A | cov | RO |
| `market.price.candles` | GET /api/v6/dex/market/candles | basic | R | P0 | A | cov | RO |
| `market.price.historical-candles` | GET /api/v6/dex/market/historical-candles | prem | R | P1 | A | cov | RO |
| `market.index.current-price` | POST /api/v6/dex/index/current-price | free | R | P0 | A | cov | RO |
| `market.index.historical-price` | GET /api/v6/dex/index/historical-price | free | R | P1 | A | cov | RO |
| `market.token.search` | GET /api/v6/dex/market/token/search | basic | R | P1 | A | cov | RO |
| `market.token.basic-info` | POST /api/v6/dex/market/token/basic-info | basic | R | P1 | A | cov | RO |
| `market.token.advanced-info` | GET /api/v6/dex/market/token/advanced-info | prem | R | P1 | A | cov | RO |
| `market.token.top-liquidity` | GET /api/v6/dex/market/token/top-liquidity | basic | R | P1 | A | cov | RO |
| `market.token.price-info` | POST /api/v6/dex/market/price-info | prem | R | P0 | A | cov | RO |
| `market.token.hot/holder/top-trader` | hot-token (basic), holder e top-trader (prem) (3) | basic/prem | R | P2 | A | cov | RO |
| `market.token.cluster.*` | clusters: supported-chain, overview, list, top-holders (4) | free/prem | R | P2 | A | cov | RO |
| `market.token.rwa/ranking` | rwa/tokens (Premium) e ranking (página 404) (2) | prem/? | R | P3 | A | par/cov | - |
| `market.signal.supported-chain` | GET /api/v6/dex/market/signal/supported/chain | free | R | P1 | A | cov | RO |
| `market.signal.list` | POST /api/v6/dex/market/signal/list | prem | R | P1 | A | cov | RO |
| `market.leaderboard.*` | supported-chain e list (walletType em conflito CLI x REST) (2) | free/prem | R | P2 | A | par/cov | RO |
| `market.portfolio.*` | supported-chain, overview, recent-pnl, latest-pnl, dex-history (5) | free/prem/basic | R | P2 | A | cov | - |
| `market.tracker.trades` | GET /api/v6/dex/market/address-tracker/trades | ? | R | P1 | A | cov | - |
| `market.social.news-*` | GET social/news: latest, by-symbol, search, detail, platforms (5) | ? | R | P3 | A | par | - |
| `market.social.sentiment-*` | GET social/sentiment: symbol e ranking (2) | ? | R | P2 | A | cov/par | RO/- |
| `market.social.vibe-*` | GET social/vibe: timeline e top-kols (por cadeia e contrato) (2) | ? | R | P2 | A | CTR | RO |
| `market.trenches.chains-protocols` | GET .../memepump/supported/chainsProtocol | free | R | P3 | A | par | RO |
| `market.trenches.token-list` | GET .../memepump/tokenList (37 filtros) | prem | R | P2 | A | par | RO |
| `market.trenches.detalhes` | tokenDetails, tokenDevInfo, similarToken, tokenBundleInfo, apedWallet (5) | prem/basic | R | P3 | A | par | - |
| `market.ws.connection` | wss://wsdex.okx.com/ws/v6/dex (login, subscribe, unsubscribe) | pago | R | P1 | A | cov | - |
| `market.ws.channel.(price,price-info,candles,trades)` | canais de preço, métricas, candles (27 granularidades) e trades (4) | pago | R | P1 | A | cov | - |
| `market.ws.channel.(outros)` | token-update, signal, memepump-new, address-tracker, kol-smartmoney (5) | pago | R | P2 | A | cov | - |
| `market.ws.error-codes` | Códigos de erro do WebSocket (só listado) | ? | R | P3 | A | cov | - |
| `market.plan.api-fee` | Planos Free a Pro, quotas, x402 e tiers por endpoint | ? | R | P1 | A | cov | - |
| `market.plan.x402-payment` | Pagamento por chamada x402 (USDG ou USDT na X Layer) | ? | W | P3 | N | par | - |
| `market.intro` | Market API: introdução (9 famílias) | n/a | R | P2 | A | cov | - |

### Onchain Data (29), Security (6)

| id | item | tier | cl | P | seg | R1 | repo |
|---|---|---|---|---|---|---|---|
| `onchaindata.info.*` | GET explorer/info: detail, summary, transaction, block, address, stats, hashes (7) | basic | R | P3 | A | par | - |
| `onchaindata.block.*` | GET explorer/block: lista, fills, tx-list, height-by-time, stats, address-balance-history (Premium) (6) | basic/prem | R | P2 | A | par | - |
| `onchaindata.transaction.*` | GET explorer/transaction: multi (3), listas por endereço (2) (5) | basic | R | P3 | A | par | - |
| `onchaindata.log.*` | GET explorer/log: by-block-and-address, by-address-and-topic, by-address, by-transaction (4) | basic | R | P2 | A | par | - |
| `onchaindata.address.*` | GET explorer/address: address-active-chain e information-evm (2) | basic | R | P3 | A | par | - |
| `onchaindata.supported-chains.*` | GET explorer/*/supported-chains (5 módulos) (5) | free | R | P2 | A | par | - |
| `security.token-scan` | POST /api/v6/security/token-scan (até 50 tokens; código do CLI) | ? | R | P1 | A | cov | - |
| `security.approval-mng` | POST /api/v6/security/approval-mng | ? | R | P1 | A | cov | - |
| `security.*(outros)` | dapp-scan, transaction-scan evm e sol, sign-message-check (4) | ? | R | P2 | A | cov | - |

Nota: o Onchain Data é `/api/v6/explorer/<módulo>/<endpoint>`, sempre GET; o suporte por cadeia é por módulo e endpoint (erro 50038 = não suportado) e Monad e X Layer não aparecem nos exemplos. Security não tem página REST localizada.

### Agentic Wallet (16)

| id | item | tier | cl | P | seg | R1 | repo |
|---|---|---|---|---|---|---|---|
| `agentic.overview/policy` | produto em TEE e política de limites no portal (2) | ? | R | P2 | H | cov | - |
| `agentic.login/balance/history` | login, contas, saldos e histórico (CLI com JWT) (3) | ? | WR | P2 | H | cov | - |
| `agentic.send/contract-call/sign-message` | envio, chamada de contrato e assinatura (movem fundos) (3) | ? | W | P3 | N | cov | - |
| `agentic.strategy/trader-mode` | ordens limite autônomas e Trader Mode (2) | ? | W | P3 | N | cov | - |
| `agentic.gas-station/utxo/mev` | Gas Station (Solana), UTXO e BRC-20 (Bitcoin), MEV (3) | ? | WR | P3 | N | cov | - |
| `agentic.audit-log/priapi/geoblock` | log local, API privada priapi e checagem de geoblock (3) | ? | RW | P2 | N | cov/new | - |

### Skills (20)

| id | item | tier | cl | P | seg | R1 | repo |
|---|---|---|---|---|---|---|---|
| `skill.okx-agentic-wallet` | Skill okx-agentic-wallet (27 referências) | ? | W | P3 | N | cov | - |
| `skill.okx-dex-market` | Skill okx-dex-market (Token, Market, Signal, Social, Trenches, WS) | ? | R | P1 | A | cov | - |
| `skill.okx-agent-payments-protocol` | Skill okx-agent-payments-protocol | ? | W | P3 | N | cov | - |
| `skill.okx-defi` | Skill okx-defi | ? | C | P3 | H | cov | - |
| `skill.okx-ai` | Skill okx-ai (OKX.AI: identidade, tarefas, A2MCP) | ? | W | P3 | N | cov | - |
| `skill.okx-guide` | Skill okx-guide | ? | R | P3 | A | cov | - |
| `skill.okx-dapp-discovery` | Skill okx-dapp-discovery (roteador de 20 plugins) | ? | W | P3 | H | cov | - |
| `skill.installer` | npx @okxweb3/onchainos-installer install | ? | W | P2 | H | cov | - |
| `workflow.*` | 5 workflows com comando CLI e 3 só documentados (8) | ? | R | P2 | A | par | - |
| `plugins.*` | Plugin Store: 63 entradas; plugins de estratégia e de dApps (3) | ? | W | P3 | N | par | - |
| `skills.docs-pages` | Páginas de Skills nas docs (Trade, Market, Agentic Wallet) | n/a | R | P3 | A | cov | - |

### CLI (24)

| id | item | tier | cl | P | seg | R1 | repo |
|---|---|---|---|---|---|---|---|
| `cli.(market,token,signal,tracker,portfolio,security)` | grupos de leitura usados em dados (6) | ? | R | P1 | A | par | - |
| `cli.(leaderboard,social,memepump,ws,workflow)` | grupos de leitura de descoberta (5) | ? | R | P2 | A | par | - |
| `cli.defi` | onchainos defi (15 subcomandos; deposit, redeem e claim devolvem só calldata) | ? | C | P2 | H | par | - |
| `cli.(swap,cross-chain,gateway)` | leitura mais calldata mais execute e broadcast (3) | ? | W | P3 | N | par | - |
| `cli.(wallet,strategy,payment,agent)` | carteira TEE, ordens limite, pagamentos e agentes (4) | ? | W | P3 | N | par | - |
| `cli.(mcp,upgrade,preflight,global)` | servidor MCP, upgrade, preflight e flags globais (4) | ? | WR | P3 | N | par | - |
| `cli.payment-quota` | Cota do CLI e pagamento x402 após confirmação inicial por tier | ? | W | P2 | N | new | - |

### MCP (111)

| id | item | tier | cl | P | seg | R1 | repo |
|---|---|---|---|---|---|---|---|
| `mcp.hosted.server` | https://web3.okx.com/api/v1/onchainos-mcp, chave no cabeçalho, 21 ferramentas | ? | C | P2 | H | cov | - |
| `mcp.hosted.trade(leitura)` | supported-chains, liquidity e quote de Trade (3) | ? | R | P3 | A | par | - |
| `mcp.hosted.trade(calldata)` | approve, swap e solana-swap-instruction (3) | ? | C | P3 | H | par | - |
| `mcp.hosted.market` | 15 ferramentas de Market, índice e Balance | free/basic/prem/? | R | P3 | A | par | - |
| `mcp.local.server` | onchainos mcp (stdio): 88 ferramentas, sem modo somente leitura global | ? | W | P3 | N | par | - |
| `mcp.local.(leitura)` | preço, token, sinais, social, portfolio, DeFi, ponte e workflows (77) | ? | R | P3 | A | par | - |
| `mcp.local.(calldata)` | swap_swap, swap_approve, defi_invest, defi_withdraw, defi_collect (5) | ? | C | P3 | H | par | - |
| `mcp.local.(fundos)` | payment_pay, payment_session, gateway_broadcast (3) | ? | W | P3 | N | cov/par | - |
| `mcp.local.gas_station_*` | 3 ferramentas que mudam configuração do backend | ? | W | P3 | H | par | - |

### Payments (13)

| id | item | tier | cl | P | seg | R1 | repo |
|---|---|---|---|---|---|---|---|
| `payments.docs` | visão geral, APP, conceitos e redes (X Layer 196; USDG, USDC, USDT0) (4) | ? | R | P3 | A | cov | - |
| `payments.method.*` | one-time, batch, pay-as-you-go, subscription, escrow (5) | ? | W | P3 | N | cov | - |
| `payments.api.*` | HTTP API (vendedor) e Agent API (payment link), subpáginas não lidas (2) | ? | W | P3 | N | cov | - |
| `payments.buyer/seller` | agente comprador (sem tetos de gasto) e guias do vendedor (2) | ? | WR | P3 | N | cov | - |

### SDKs (9)

| id | item | tier | cl | P | seg | R1 | repo |
|---|---|---|---|---|---|---|---|
| `sdk.dex-*` | okx-dex-sdk, dex-api-library, dex-widget e intent-sdk (4) | ? | W | P3 | H | cov/new | - |
| `sdk.wallet-*` | js/go-wallet-sdk (assinatura offline) e smart wallet EVM (2) | ? | W | P3 | H | new/cov | - |
| `sdk.payments-repo` | okx/payments (x402 e MPP em 5 linguagens) | ? | W | P3 | N | new | - |
| `sdk.connect-kit` | @okxweb3/connect-kit e @okxconnect/universal-provider | ? | W | P3 | H | cov | - |
| `sdk.python-okx` | okx/python-okx (Exchange v5), só listado | ? | W | P3 | H | new | - |

### Exchange agent-trade-kit (18)

| id | item | tier | cl | P | seg | R1 | repo |
|---|---|---|---|---|---|---|---|
| `exchange.kit.mcp/cli` | okx-trade-mcp e okx-trade-cli v1.4.8 (167 no README, 155 na tabela, 133 nos docs) (2) | ? | W | P3 | N | CTR/par | - |
| `exchange.kit.module.(market,news,smartmoney)` | 13 + 9 + 10 ferramentas somente leitura (market sem chave) (3) | ? | R | P1 | A | par | - |
| `exchange.kit.module.account` | 12 leitura e 2 escritas de configuração (modo de posição, alavancagem) | ? | W | P2 | H | par | - |
| `exchange.kit.module.(spot,swap,futures,option,event,earn,bot)` | ordens, alavancagem, earn e bots (7) | ? | W | P3 | N | par | - |
| `exchange.agent-skills/api-md` | 9 skills CEX e espelho Markdown da API v5 (2) | ? | WR | P3 | N | par/new | - |
| `exchange.v5.*/derivatives` | funding-rate, instruments, WS público e adaptador offline (3) | free/? | R | P1 | A | new | RO/FX |

### Outras famílias: Dapp Connect (5), OKX.AI (2), Acesso e operação (13), X Layer (53)

| id | item | tier | cl | P | seg | R1 | repo |
|---|---|---|---|---|---|---|---|
| `dapp.evm-provider` | window.okxwallet (EIP-1193), usado só para leitura | ? | R | P1 | A | cov | PR |
| `dapp.solana-provider` | window.okxwallet.solana (repo usa connect, disconnect, accountChanged) | ? | W | P2 | H | cov | PR |
| `dapp.(overview,app-connect,other-chains)` | redes (14 famílias), conexão pelo app, providers de outras cadeias (3) | ? | R | P2 | A | mix | - |
| `okxai.*` | OKX.AI: visão geral e guias de papéis (19 páginas, 1 lida) (2) | ? | W | P3 | N | par | - |
| `home.(what-is,skills-mcp,agentic,install,support)` | páginas introdutórias, guias e suporte (5) | n/a | R | P2 | A | cov | - |
| `home.(supported-chain,api-access,developer-portal)` | matriz de cadeias, assinatura K4 e portal (3) | n/a | R | P1 | A | cov | - |
| `home.(change-log,llms-txt,error-codes,v5-legacy,user-agreement)` | histórico, índice llms.txt, erros, árvore v5 e acordo de uso (5) | n/a | R | P1 | A | cov/new | - |
| `xlayer.(network,websocket,flashblocks)` | RPC 196, WebSocket e Flashblocks de 200 ms (3) | ? | R | P2 | A | par/new | - |
| `xlayer.(builder-codes,contracts,bridge,data-api)` | Builder Codes, contratos e tokens, ponte e ferramentas, visão do Data API (4) | ? | R | P2 | A | new/par | - |
| `xlayer.data.{block,address,transaction,token,log}.*` | GET /api/v5/xlayer/<módulo>/* com chainShortName XLAYER (29) | ? | R | P3 | A | par | - |
| `xlayer.data.contract.*` | POST e GET /api/v5/xlayer/contract/* (verificação de contrato) (5) | ? | WR | P3 | H | par | - |
| `xlayer.tz.*` | GET /api/v5/xlayer/tz/* (Trade Zone: bloco, tx, endereço, cross) (12) | ? | R | P3 | A | new | - |

## (d) O que muda para a tomada de decisão do Jev

**Dão sinal de decisão (somente leitura; entram no Jev como números ou enums, nunca como texto).**
- Preço, índice, candles e trades (`market.price.*`, `market.index.*`) e `market.token.price-info`: referência cruzada do MON/USDC e regime em segundos (candles de 1 s; variação, volume e transações de 5 min a 24 h). Free cobre o índice; preço e candles são Basic; `price-info` e `historical-candles` são Premium. Moeda de `price` e dos candles NAO declarada. Cobertura de Monad por endpoint NAO CONFIRMADA (a matriz marca 143, os exemplos não).
- Fluxo e posicionamento (`market.signal.*`, `market.tracker.trades`, `market.leaderboard.*` e canais WS): cadeias de exemplo 1, 196, 501, 8453 e 56, sem Monad; compra agregada não prova vantagem e não há avaliação fora da amostra. Servem como feature do candidato, como em R1.
- Risco e qualidade do ativo (`advanced-info`, `top-liquidity`, `cluster.*`, `security.token-scan`, `security.approval-mng`): úteis aos candidatos de cauda longa do operador, quase irrelevantes para MON/USDC; resultado "sem ação" significa nada detectado.
- Custo e inventário (`gateway.gas-price`, `trade.quote`, `balance.*`, `history.*`, `trade.history`): alimentam custo líquido, saldo e reconciliação, não o sinal.
- Contexto fraco: Social (sentimento por símbolo, `vibe` por contrato; texto de terceiros é dado não confiável), APY e TVL do DeFi (custo de oportunidade), Onchain Data (eventos como alternativa à RPC, Monad NAO CONFIRMADO) e, se o par existir na Exchange (NAO CONFIRMADO), os dados públicos e o módulo `market` do kit (sem chave); o repo já captura a v5 pública da Exchange.

**Cadência e custo.** O laço da Kuru é de 300 ms por bloco; nenhuma família OKX foi qualificada para ele. A página REST publica no plano Free 100 mil chamadas Basic e 100 mil Premium por mês (cerca de 3.333 por dia ou 2,3 por minuto cada), com excedentes de USD 0,0001 e USD 0,0002, respectivamente; WebSocket começa no Starter de USD 99. Os limites de WebSocket e de Trade descritos neste inventário não foram revalidados nesta revisão P0. No CLI v4.6.4, as cotas de 1 milhão Basic e 100 mil Premium estão marcadas como placeholders; a mensagem de cobrança publica USD 0,0001 Basic e USD 0,005 Premium. O primeiro excesso por tier exige confirmação, escolha do ativo quando houver alternativas, configuração via `payment default set --tier` e nova execução. Uma única opção também exige confirmação. O cliente só pré-assina automaticamente depois do estado `charging_confirmed`. A carência encontrada é histórica e inconsistente: o fallback da skill cita 2026.5.31, enquanto o código usa corte em 2026-05-30T00:00:00Z; não demonstra carência vigente. Plano, franquia, preço efetivo e disponibilidade regional da conta permanecem NAO CONFIRMADOS. Usar o CLI em laço pode gastar fundos.

**Só habilitam execução (nenhum sinal).** `trade.swap`, `approve`, `swap-instruction`, `quote-intent` e ordens Intent, `trade.xchain.*` (approve e swap), `gateway.broadcast`, `defi.transaction.*`, `agentic.*` de envio e ordens, ferramentas MCP de calldata e de fundos, Payments. Ficam no operador, em cadência própria, com o Jev escolhendo entre candidatos elegíveis ou hold.

**Aprovação humana (H, 50 itens).** Calldata de swap, approve, DeFi e ponte; assinatura de ordens Intent e cancelamentos; broadcast de transação já assinada; instalador e upgrade do CLI; política do portal; Gas Station; verificação de contrato; providers de assinatura no navegador; SDKs com chave local.

**Nunca automatizar (N, 50 itens).** Enviar, chamar contrato e assinar mensagens pelo Agentic Wallet; ordens gatilho no TEE e Trader Mode; pagamentos x402, APP e MPP (inclui a cota do CLI e o x402 por chamada do Market); `payment_pay`, `payment_session` e `gateway_broadcast` do MCP local; contratos Multiply e Loop (alavancagem); módulos de ordens, earn e bots do kit da Exchange; plugins de estratégia; OKX.AI (escrow); API privada priapi.

**Monad (143) por família.** Matriz: Wallet API, Trade, Market e Dapp Connect marcados; Payments não. Nas docs: roteador e approval listados; sem MEV no Gateway (só 1, 56, 501, 8453); Intent sem 143; CLI estático de 17 cadeias sem 143; exemplos de sinais, tracker, memepump e DeFi sem 143; Onchain Data, gas do Gateway e leaderboard NAO CONFIRMADOS.

## (e) Deltas versus R1

- **Novo:** Intent swap completo e solver/RFQ; `aggregator/history`; `check-approvals` (só no CLI); 7 endpoints DeFi (cadeias, protocolos, prepare, gráficos de APY, TVL e profundidade, cálculo de entrada V3); `rwa/tokens`; Onchain Core Data (29 endpoints `/api/v6/explorer`); X Layer Data API (34 endpoints `/api/v5/xlayer`, erro 50047 por país) e Trade Zone (12); 22 grupos do CLI e 88 + 21 ferramentas MCP; Flashblocks de 200 ms e Builder Codes; contratos Multiply e Loop; `okx/payments`; `okx/agent-skills`.
- **Corrige R1:** Social `vibe` é por cadeia e contrato; kit da Exchange não tem 167 ferramentas de forma consistente; Memepump no CLI cobre 501, 56, 196 e 195; o texto de autenticação resolve a dúvida de R1: os exemplos JS e Postman incluem a query no `requestPath` do GET; "broadcast é whitelist" diverge entre páginas (o guia de dApp cita só Simulate, o SDK cita os 4 métodos do Gateway).
- **Detalha:** tabela de tiers com caminhos exatos (20 Free, 33 Basic, 19 Premium); cota do CLI em vez de "NAO CONFIRMADO"; `walletType` do leaderboard (CLI: smartMoney=1, sniper=3; REST: 1 KOL, 3 Smart Money); MCP hospedado autentica só com `OK-ACCESS-KEY` e as páginas publicam uma chave de exemplo (não usar).
- **Sem mudança desde R1:** o change log termina em 2026-09-10 (Arc); CLI v4.6.4 de 2026-10-09; slippage v5 em fração e v6 em percentual; unidade de `toTokenAmount` NAO declarada.

## (f) Lacunas e NAO LIDO

- **Páginas só listadas (cerca de 340 de 590):** árvore v5 (89, exceto o SDK de assinatura), Dapp Connect por cadeia (cerca de 70; o provider EVM veio de R2), X Layer ferramentas, AA, oráculos e nós (cerca de 60), OKX.AI (18 de 19), Payments subpáginas (`api-http-*`, `api-agent-onetime`, guias do vendedor, SDKs), Trade RFQ e solver (pricing, firm-order, erros), páginas de erro de Market, Balance, Gateway e History, `dex-swap-api-introduction`, `onchain-gateway-api-introduction`, `llms-full.txt`. As páginas legadas de WaaS continuam em 404 ou redirecionam para a visão geral (verificado hoje).
- **Código do CLI:** `wallet_api.rs` foi lido só até 100 mil caracteres; subcomandos `agent`, `payment` e `wallet` além das referências, `ws.rs`, `sink.rs` e `risk_classify.rs` não foram lidos; as 88 ferramentas MCP foram contadas por ferramenta de resumo sobre `mcp/mod.rs`.
- **Tier NAO CONFIRMADO:** Trade, Gateway, DeFi, Social, tracker, Security, Intent, X Layer Data API, CLI e MCP local.
- **Unidades NAO CONFIRMADAS:** `toTokenAmount`, `minReceiveAmount`, moeda de `price`, candles e índice, `balance` e `rawBalance`, `gasLimit`, `amount` e `txFee` do histórico, moeda de `tvl`, base de `feeRate`, decimais dos tokens de Payments.
- **Cobertura de Monad por endpoint:** Onchain Data, gas do Gateway, leaderboard, DeFi e Social; `onchainos wallet chains` não foi executado.
- **Brasil:** o acordo de uso não nomeia países; os códigos 50125, 50047 e 50030 e o geoblock do CLI (`/priapi/v5/wallet/agentic/geoblock/check`, decidido no servidor) indicam restrição por região, mas a resposta real só vem de chamada autorizada ou do suporte.
- **Sem chamadas autenticadas:** RPS, latência, esquemas reais e cota restante não foram medidos; muitos exemplos das docs têm JSON inválido ou nomes de campo diferentes da tabela.
- **Extração por resumo:** reconferir endereços (roteadores, tokens, contratos Multiply e Loop), contagens e tabelas antes de usar; versões de pacotes npm não verificadas; o README do `onchainos-skills` diz MIT e os metadados do GitHub não detectam licença.
- **Terceiros:** três consultas de busca web serviram só de pista; nada deste inventário depende delas.

## (g) Fontes (todas acessadas em 2026-10-11)

Oficiais, docs Onchain OS (prefixo `https://web3.okx.com/onchainos/dev-docs/`; sufixo `.md` devolve o Markdown):
- Índice e entrada: `https://web3.okx.com/llms.txt` (`/sitemap.xml` e `/onchainos/llms.txt` dão 404); `https://web3.okx.com/pt-br/onchainos/dev-docs/home/what-is-onchainos`; `home/{supported-chain, api-access-and-usage, developer-portal, agentic-wallet-overview, skills-mcp-services, install-your-agentic-wallet, run-your-first-ai-agent, run-your-first-dapp, how-to-install-openclaw, support, change-log}`.
- Trade: `trade/{dex-api-introduction, dex-get-aggregator-supported-chains, dex-get-tokens, dex-get-liquidity, dex-approve-transaction, dex-get-quote, dex-solana-swap-instruction, dex-swap, dex-swap-history, dex-intent-reference, dex-intent-get-quote, dex-intent-create-order, dex-intent-order-list, dex-intent-order-status, dex-intent-cancel-sign, dex-intent-cancel-order, dex-intent-auction-info, intent-swap-quickstart, dex-api-intent-solver, dex-api-market-maker, solana-rfq-integration, dex-smart-contract, dex-aggregation-faq, smart-contract-safety, dex-widget, dex-sdk-introduction, dex-use-swap, dex-ai-tools-{introduction, skills, mcp-server}, api-fee, dex-error-code}`.
- Market: `market/{market-api-introduction, market-api-fee, how-to-finish-api-payment, payment-error-handling, market-ai-tools-*, *-reference, market-price*, market-candlesticks*, market-trades, index-price*, historical-index-price, market-token-*, market-rwa-token, market-signal-*, market-memepump-*, market-portfolio-*, market-social-*, balance-*, tx-history-*, websocket*, onchaindata-*}`.
- Wallet: `wallet/{product-and-service, supported-networks, wallet-api-introduction, agentic-wallet, agentic-wallet-skills, agentic-quickstart, balance-api-*, tx-history-api-overview, onchain-gateway-api-*, defi-*, dapp-connect/{okx-wallet-integration-introduction, okx-wallet-integration-supported-networks, chains/solana/provider}}`.
- Payments: `payments/{overview, app, core-concept, supported-networks, methods-*, pay-as-you-go, subscription, api-overview, api-http, api-a2a, payment-use-buyer, sdk-overview}`.
- X Layer e outros: `xlayer/developer/{build-on-xlayer/network-information, build-on-xlayer/contracts, rpc-endpoints/rpc-endpoints, websockets-endpoints/websocket-endpoints, flashblocks/overview, builder-codes/overview, bridge/overview, data/*}` (46 páginas de endpoints do Data API e da Trade Zone, mais as de introdução e erros); `okxai/what-is-okxai`; `dev-docs-v5/dex-api/private-key-wallet-javascript-sdk`; `https://web3.okx.com/help/okx-web3-build-user-agreement`.

Código oficial (GitHub, rótulo "codigo oficial"; não são páginas de documentação):
- `okx/onchainos-skills` v4.6.4 de 2026-10-09: `README.md`, `SECURITY.md`, `cli/src/{main.rs, endpoints.rs, chains.rs, wallet_api.rs, mcp/mod.rs, commands/*.rs}`, `skills/*/SKILL.md`, `skills/*/references/*`, `skills/okx-dex-market/_shared/payment-notifications.md`; listagens e releases em `https://api.github.com/repos/okx/onchainos-skills`.
- `okx/agent-trade-kit` (ramo `github-main`, v1.4.8): README, `docs/modules/*.md`, `CHANGELOG.md`; `okx/plugin-store`: README, `registry.json` (parcial) e listagens; `okx/okx-dex-sdk`: README; `okx/dex-api-library`, `okx/agent-skills`, `okx/payments`, `okx/ai-builder-openapi-md`, `okx/go-wallet-sdk` e listas das organizações `okx` e `okxlabs`.

Terceiros (só pista): resultados de WebSearch sobre Agentic Wallet, contratos Multiply e Loop e cota do CLI; sem uso como prova.

Nota final: nenhum item deste inventário autoriza execução. Toda ação com fundos, assinatura, aprovação, ponte, pagamento x402 ou chamada autenticada continua dependendo de qualificação e autorização separadas, com a decisão do Jev limitada a escolher entre candidatos já elegíveis ou hold.
