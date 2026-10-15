# Gateway OnchainOS: catálogo, custo e decisões por área da documentação

Parte da [spec](spec.md) (ONC-1 a ONC-8). Pesquisa de 2026-10-12 em fonte oficial (páginas de referência de cada endpoint em `web3.okx.com/onchainos/dev-docs`), depois **verificada ao vivo** na mesma data com credenciais do Dev Portal, somente leitura (ver `evidence/live-onchainos-20261012.md`). O inventário amplo anterior continua em `docs/research/R1`, `R6` e `R7` (não editados aqui).

## 1. O que cada área da documentação permite e o que esta entrega liga

| Área (link do pedido) | O que oferece | Estado nesta entrega | Motivo |
| --- | --- | --- | --- |
| Market API | Preço, velas, trades, busca e dados de token, hot tokens, ranking, holders, clusters, top traders, sinais e leaderboard de carteiras rastreadas, portfólio e PnL de endereço, notícias e sentimento, Trenches (meme pump) | **Ligado em leitura, por gateway com orçamento**: redes, hot tokens, busca, velas, preço, sinais, leaderboard, holders, top traders | É o que alimenta smart money, traders, holders e os gráficos on-chain; plano gratuito de 100 mil chamadas Basic e 100 mil Premium por mês |
| Trade API | Cotação e swap agregado em mais de 500 DEXs, aprovação, broadcast | **Não ligado** (execução); cotação já existe em `src/okx-market/okx-dex.ts` | Mexe em fundos; só com autorização do dono e os gates existentes |
| Wallet API e Balance | Saldos e histórico por endereço (gratuitos) | Adiado: precisa de endereço do usuário, que não sai do navegador por regra | A aba Carteira continua lendo a extensão no navegador |
| Agentic Wallet | Carteira em TEE, login no navegador, CLI e skills; sem API REST pública | **Não ligado**; a aba Carteira mostra o estado honesto | Sem API pública, assina e move fundos |
| Payments (x402, Agent Payments Protocol) | Pagamento por chamada ou assinatura, em USDG ou USDT na X Layer | **Não ligado** | Pagaria chamadas; o sistema não gasta |
| DApp Connect Wallet | Botão de conexão da OKX Wallet (app ou extensão) | Já existe por extensão (`web/src/lib/okx-wallet.ts`) | Nada a acrescentar agora |

## 2. Contrato de autenticação

Cabeçalhos `OK-ACCESS-KEY`, `OK-ACCESS-SIGN` = Base64(HMAC-SHA256(segredo, `timestamp + método + requestPath(+query) + body`)), `OK-ACCESS-TIMESTAMP` = ISO UTC com milissegundos, `OK-ACCESS-PASSPHRASE`. Tolerância do relógio: 30 s. POST assina o corpo bruto exatamente como enviado. A passphrase é obrigatória.

## 3. Catálogo de endpoints do gateway (lista de permissão)

Base `https://web3.okx.com`. Camada = a da tabela oficial de tarifas. Chamada gratuita: sem teto, só contada.

| Rota local | Provedor | Método | Camada | TTL mínimo | Parâmetros aceitos (validados) |
| --- | --- | --- | --- | --- | --- |
| `/onchain/chains` | `/api/v6/dex/market/supported/chain` | GET | Free | 24 h | nenhum |
| `/onchain/signal-chains` | `/api/v6/dex/market/signal/supported/chain` | GET | Free | 24 h | nenhum |
| `/onchain/leaderboard-chains` | `/api/v6/dex/market/leaderboard/supported/chain` | GET | Free | 24 h | nenhum |
| `/onchain/hot-tokens` | `/api/v6/dex/market/token/hot-token` | GET | Basic | 5 min | `chainIndex`, `rankingType` 4 (fixo), `timeFrame` 1 a 4 (padrão 2), `limit` ≤ 100 (padrão 50) |
| `/onchain/search` | `/api/v6/dex/market/token/search` | GET | Basic | 10 min | `chainIndex` (uma rede; o provedor chama de `chains`), `q` 2 a 64 caracteres sem controle |
| `/onchain/candles` | `/api/v6/dex/market/candles` | GET | Basic | 1m: 60 s, 5m: 120 s, 15m: 300 s, 1H: 600 s, 4H: 900 s | `chainIndex`, `token` (endereço normalizado), `bar` em 1m, 5m, 15m, 1H, 4H, `limit` ≤ 299 (padrão 150) |
| `/onchain/price` | `/api/v6/dex/market/price` | conforme a página oficial | Basic | 30 s | `chainIndex`, `token` |
| `/onchain/signals` | `/api/v6/dex/market/signal/list` | POST | Premium | 5 min | `chainIndex`, `walletType` (subconjunto de 1,2,3), `token` opcional, `minAmountUsd` opcional, `limit` ≤ 100 (padrão 50) |
| `/onchain/leaderboard` | `/api/v6/dex/market/leaderboard/list` | GET | Premium | 30 min | `chainIndex`, `timeFrame` 1 a 5, `sortBy` 1 a 5, `walletType` 1 a 10 opcional (até 20 linhas por chamada) |
| `/onchain/holders` | `/api/v6/dex/market/token/holder` | GET | Premium | 15 min | `chainIndex`, `token`, `tagFilter` 1 a 9 opcional, `limit` ≤ 100 (padrão 50) |
| `/onchain/top-traders` | `/api/v6/dex/market/token/top-trader` | GET | Premium | 15 min | idem holders |
| `/onchain/price-info` | `/api/v6/dex/market/price-info` | POST | Premium | 60 s | `chainIndex`, `token`; corpo é uma lista de um objeto |
| `/onchain/token-risk` | `/api/v6/dex/market/token/advanced-info` | GET | Premium | 15 min | `chainIndex`, `token` |
| `/onchain/pools` | `/api/v6/dex/market/token/top-liquidity` | GET | Basic | 10 min | `chainIndex`, `token` |
| `/onchain/cluster-chains` | `/api/v6/dex/market/token/cluster/supported/chain` | GET | Free | 24 h | nenhum |
| `/onchain/clusters` | `/api/v6/dex/market/token/cluster/overview` | GET | Premium | 15 min | `chainIndex`, `token` |
| `/onchain/trades` | `/api/v6/dex/market/trades` | GET | Basic | 15 s | `chainIndex`, `token`, `limit` 1 a 100 (padrão 50) |
| `/onchain/news` | `/api/v6/dex/market/social/news/latest` ou `/social/news/by-symbol` | GET | Basic* | 5 min | `symbol` opcional (`/^[A-Za-z0-9]{1,20}$/`, enviado em maiúsculas), `limit` 1 a 20 (padrão 10) |
| `/onchain/sentiment` | `/api/v6/dex/market/social/sentiment/symbol` | GET | Basic* | 5 min | `symbol` (mesma regra) |
| `/onchain/sentiment-ranking` | `/api/v6/dex/market/social/sentiment/ranking` | GET | Basic* | 5 min | `limit` 1 a 20 (padrão 10) |
| `/onchain/vibe` | `/api/v6/dex/market/social/vibe/timeline` | GET | Basic* | 10 min | `chainIndex`, `token` (enviado como `tokenAddress`) |
| `/onchain/kols` | `/api/v6/dex/market/social/vibe/top-kols` | GET | Basic* | 10 min | `chainIndex`, `token` (enviado como `tokenAddress`), `limit` 1 a 20 (padrão 10) |
| `/onchain/budget` | local | GET | n/a | n/a | n/a |
| `/onchain/status` | local | GET | n/a | n/a | n/a |

\* Camada marcada com asterisco: o portal não declara a camada destes endpoints; por conservadorismo contam como `basic` no orçamento.

Pontos que a página oficial deixava ambíguos, agora resolvidos por verificação ao vivo (sonda somente leitura de 2026-10-12; ver `evidence/live-onchainos-20261012.md` e os arquivos `probe-results*.json` em `.scratch/devportal/`): as 9 rotas originais e as 11 novas respondem ponta a ponta com os formatos esperados pelos normalizadores. O corpo de `signal/list` como lista de um objeto funciona ao vivo; `market/price` usa POST com o mesmo corpo de lista; `cursor` é texto opaco repassado sem conversão.

## 4. Campos que o gateway devolve

Números do provedor vêm como texto; o gateway converte e **descarta a linha** que não converter (nunca vira zero). Logos e URLs de imagem do provedor não são repassados (o navegador não carrega imagem de terceiro; a mesa usa um selo com as iniciais).

- hot-tokens: `chainIndex`, `symbol`, `address`, `price`, `marketCap`, `volumeUsd`, `changePct`, `liquidityUsd`, `holders`, `uniqueTraders`, `txsBuy`, `txsSell`, `inflowUsd`, `riskLevel` (0 a 5), `top10HoldPct`, `devHoldPct`, `bundleHoldPct`, `firstTradeMs`.
- search: `chainIndex`, `name`, `symbol`, `address`, `decimals`, `price`, `changePct`, `holders`, `liquidityUsd`, `marketCap`, `communityRecognized`.
- candles: `{ts, open, high, low, close, volume, volumeUsd, confirmed}` do mais antigo ao mais novo; barra com campos inconsistentes (máxima abaixo da mínima ou do fechamento) é recusada com `schema`.
- signals: `tsMs`, `chainIndex`, `walletType` (`smart_money`, `kol`, `whale`), `walletCount`, `amountUsd`, `priceUsd`, `soldRatioPct`, `token{address, symbol, marketCap, holders, top10HoldPct}`. Os endereços das carteiras que dispararam **não** são repassados ao navegador.
- leaderboard: `wallet` (resumido: 4 primeiros e 4 últimos caracteres), `realizedPnlUsd`, `realizedPnlPct`, `winRatePct`, `avgBuyUsd`, `txVolumeUsd`, `txs`, `lastActiveMs`, `topTokens[{symbol, pnlUsd}]`.
- holders e top-traders: `wallet` resumido, `holdPct`, `boughtAmount`, `avgBuyPrice`, `realizedPnlUsd`, `unrealizedPnlUsd`.
- price-info (lista de 1): `chainIndex`, `address`, `tsMs`, `price`, `marketCap`, `liquidityUsd`, `holders`, `circSupply`, `high24h`, `low24h`, `tradeNum`, `change{m5,h1,h4,h24}`, `volume{m5,h1,h4,h24}`, `txs{m5,h1,h4,h24}`.
- token-risk (um objeto): `chainIndex`, `address`, `riskLevel` (inteiro 0 a 5), `tags` (até 12, `/^[A-Za-z0-9_-]{1,32}$/`), `top10HoldPct`, `devHoldPct`, `bundleHoldPct`, `sniperHoldPct`, `suspiciousHoldPct`, `lpBurnedPct`, `devCreateCount`, `devLaunchedCount`, `devRugCount`, `createdMs`, `progressPct`. Percentuais mantêm a escala do provedor, sem conversão. `creatorAddress` é descartado.
- pools: `pool`, `protocol`, `liquidityUsd`, `address` (resumido), `feePct` (`liquidityProviderFeePercent`, senão `poolBasicFeePercent`).
- cluster-chains: mesma forma de `chains`. clusters (um objeto): `concentration` (`Low`, `Medium`, `High` ou nulo), `top100HoldPct`, `newAddressPct`, `sameFundSourcePct`, `sameCreationTimePct`, `rugPullPct`; `"--"` e `""` viram nulo.
- trades (mais novo primeiro): `id`, `tsMs`, `side` (`buy` ou `sell`), `priceUsd`, `volumeUsd`, `dex`, `wallet` resumido, `tx` resumido.
- news (objeto `{articles, cursor}`): `id`, `title`, `summary`, `source`, `tsMs`, `importance` (`high`, `medium`, `low` ou nulo), `symbols` (até 8), `sentiments` (até 8 de `{symbol,label}`). `content` e `sourceUrl` nunca são repassados. Este texto é de terceiro e não é confiável: serve só para exibição como texto puro e nunca chega ao Jev.
- sentiment (um objeto de `details[0]`) e sentiment-ranking (lista): `symbol`, `period`, `tsMs`, `mentions`, `newsMentions`, `xMentions`, `label` (`bullish`, `bearish`, `neutral` ou nulo), `bullishRatio`, `bearishRatio`, `bullishCount`, `bearishCount`, `neutralCount`. Verificado ao vivo: símbolo sem cobertura responde envelope válido com `details: []` - o gateway devolve `data: null`, não `schema`.
- vibe (um objeto): `score`, `scoreChangeRate`, `mentions`, `mentionsChangeRate`, `impressions`, `engagement`, `points[{tsMs,score}]` (até 48); as listas `kols` do provedor são descartadas. Token sem cobertura social responde sem `summary` (ausente ou nulo): `data: null`.
- kols: `handle` (`/^[A-Za-z0-9_]{1,32}$/`, obrigatório), `nickname`, `followers`, `mentions`, `impressions`, `engagement`, `firstMentionMs`. Avatar e URL de post nunca são repassados.

**Vazio não é violação de contrato.** Resposta legitima vazia não é `schema`: nas rotas de objeto único (sentiment, vibe, clusters, token-risk) `data` nulo ou `[]` do provedor sai como `data: null`; nas de lista (kols, sentiment-ranking, news) sai a lista vazia (`news` mantém `{articles: []}`). O cache guarda e serve `null` como qualquer resposta, então uma abertura repetida não gasta chamada. A web trata `ok` com `data: null` como estado neutro ("Sem sentimento para este simbolo", "Sem dados sociais para este token", "Sem dados de grupos para este token"), sem estilo de erro. Segue sendo `schema`: envelope que não é objeto, `details` ausente ou não-lista, `summary` de tipo errado, e linha de `details` presente mas quebrada.

Todo texto do provedor passa por `cleanText` antes de sair do gateway: remove caracteres de controle e de bidi (U+202A a U+202E, U+2066 a U+2069, U+2028, U+2029), converte U+2014 e U+2013 em `-` e U+00B7 em espaço, colapsa espaços e trunca no tamanho do campo.

Fixtures em `src/onchain-read/fixtures/`: as com `origin: "real_probe_2026-10-12"` (price-info, token-risk, pools, cluster-chains, clusters, trades, news, sentiment, sentiment-ranking, vibe, kols) foram aparadas das respostas reais gravadas em 2026-10-12, com endereços trocados por placeholders e sem logos nem URLs; todas as demais são `origin: "synthetic_fixture"`.

## 5. Orçamento e ritmo

Custo mensal máximo no plano gratuito: 100 mil Basic e 100 mil Premium; teto padrão do sistema 50 mil e 50 mil, ajustável em Configurações até 100 mil. Média sustentável com o teto padrão: cerca de 1.600 chamadas por dia de cada camada. Estimativa de uso típico com a aba aberta: sinais de 1 rede a cada 5 minutos = 288 por dia; hot tokens de 1 rede a cada 5 minutos = 288 por dia; velas de 1 token a cada 60 s por 3 horas = 180 por dia. Sem chamada em segundo plano por padrão (ONC-4): o navegador só pede quando a aba está aberta e visível, e pausa quando a página fica oculta.

Um aviso de pagamento do provedor (HTTP 402) é tratado como cota esgotada: o gateway não tenta pagar, serve o cache marcado como antigo e mostra o estado em Configurações.

## 5.1 Relógio, códigos novos e teste de conexão

**Desvio de relógio.** O provedor exige o `OK-ACCESS-TIMESTAMP` a menos de 30 s do relógio dele; quando a máquina atrasa ou adianta mais, endpoints das famílias Wallet, Balance, Index e Gateway respondem HTTP 401 com `{"code":"50102","msg":"Timestamp request expired"}` (a família Market tolera mais). O cliente aprende o desvio a partir do cabeçalho `Date` de **toda** resposta: `skew = horaDoServidor - pontoMédioLocal` do envio e do recebimento (o cabeçalho tem resolução de 1 s). Desvios de 10 s ou mais passam a ser somados ao timestamp da assinatura; o último desvio bruto medido aparece em `status().clockOffsetMs` e em `/onchain/status` (nulo antes da primeira resposta). Ao receber `50102`, se o desvio aprendido naquela mesma resposta diferir em 5 s ou mais do usado na assinatura, o cliente refaz a chamada **uma única vez** dentro do mesmo lugar na fila (sem dobrar a contagem de orçamento) com o timestamp corrigido; um segundo `50102`, ou resposta sem `Date` legível, devolve o código `clock_skew`. Demais 401/403 e os códigos de credencial `50103`, `50104`, `50105`, `50111` a `50114` continuam `provider_unauthorized`. O corpo do `50102` em HTTP 200 não se aplica (o código só é honrado em 401/403). O código `50038` ("This chain does not currently support", HTTP 200) vira `unsupported_chain`. **Regra prática:** o gateway mascara desvios até o offset aprendido; a correção de verdade é sincronizar o relógio do Windows.

**Teste de conexão.** `createProbeOnchainos` faz duas chamadas gratuitas em duas famílias (`/api/v6/dex/market/supported/chain` e `/api/v6/dex/balance/supported/chain`) com um cliente dedicado que compartilha todos os guardas mas não toca a fila compartilhada. O resultado é `ok` só se as duas responderem; senão devolve o código da primeira falha (`clock_skew` incluído).

**Camadas não declaradas.** Endpoints cuja camada o portal não declara contam como `basic` no orçamento, por conservadorismo (marcados com `*` na tabela da seção 3).

## 6. Fontes

- [Market API Fee](https://web3.okx.com/onchainos/dev-docs/market/market-api-fee) (camadas, cotas, pagamento)
- [Authentication](https://web3.okx.com/onchainos/dev-docs/home/api-access-and-usage) (assinatura, passphrase, tolerância)
- [Supported Networks](https://web3.okx.com/onchainos/dev-docs/home/supported-chain) (chainIndex)
- [Get Latest Signal List](https://web3.okx.com/onchainos/dev-docs/market/market-signal-list), [Leaderboard](https://web3.okx.com/onchainos/dev-docs/market/market-signal-leaderboard-list), [Token Holder](https://web3.okx.com/onchainos/dev-docs/market/market-token-holder), [Top Trader](https://web3.okx.com/pt-br/onchainos/dev-docs/market/market-token-top-trader), [Hot Tokens](https://web3.okx.com/pt-br/onchainos/dev-docs/market/market-token-hot-token), [Token Search](https://web3.okx.com/pt-br/onchainos/dev-docs/market/market-token-search), [Candlesticks](https://web3.okx.com/onchainos/dev-docs/market/market-candlesticks), [Supported chains](https://web3.okx.com/onchainos/dev-docs/market/market-price-chains)
- [Trade API](https://web3.okx.com/pt-br/onchainos/dev-docs/trade/dex-api-introduction), [Payments](https://web3.okx.com/pt-br/onchainos/dev-docs/payments/overview), [Agentic Wallet](https://web3.okx.com/pt-br/onchainos/dev-docs/wallet/agentic-wallet), [DApp Connect](https://web3.okx.com/pt-br/onchainos/dev-docs/wallet/dapp-connect/okx-wallet-integration-introduction)
