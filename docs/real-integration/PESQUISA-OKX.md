# OKX: evidência oficial para integração em leitura/paper

Data de acesso: **2026-10-11**. Estado: pesquisa e proposta de critérios; sem implementação ou certificação. Workspace examinado: C:/Users/gabri/jev-trader. Identidade própria da pesquisa: CODEX_THREAD_ID=01a12b61-af3a-76d3-aed6-bba7f750c192; sessão raiz observada CODEX_SESSION_ID=01a12b5f-ca2a-7ff1-a131-07933705d3e8. Não houve leitura de .env, uso de credenciais, login, conexão de wallet, chamada de API financeira, assinatura ou publicação. O relatório fica somente no scratch privado atribuído.

A instrução concreta em consolidação é integração real de mercado e carteira observada, decisão Jev real e paper, com cotação e preparação/preflight de swap. Execução financeira permanece dependência separada. Esta pesquisa não atesta a instalação, credenciais, licença, disponibilidade regional, whitelist, saldo ou autorização existentes no projeto. Documentação não fornece esses fatos.

## Prioridade e contratos do núcleo

A primeira entrega deve qualificar um recorte explícito de redes/endpoints que exista no ambiente real. Cobertura da matriz geral não prova disponibilidade por método, token, plano ou usuário. Recomenda-se preço/candles, saldos por endereço, cotação e preparação de swap; portfolio analítico é complementar quando disponível. Simulador remoto, sinais, DeFi e Agentic Wallet não precisam bloquear um núcleo útil.

As APIs abaixo são documentadas sob https://web3.okx.com. “Leitura” descreve o efeito de negócio, não ausência de autenticação: K4 = OK-ACCESS-KEY, OK-ACCESS-SIGN, OK-ACCESS-TIMESTAMP e OK-ACCESS-PASSPHRASE. A assinatura HTTP é HMAC-SHA256/Base64 sobre timestamp + método + requestPath + body; GET inclui query; POST inclui body exato. Skew permitido de timestamp: 30 segundos. Developer Portal/projeto/chave constituem pré-requisito distinto de uma wallet extension. [O02](https://web3.okx.com/onchainos/dev-docs/home/api-access-and-usage)

| Prioridade | Contrato documentado | Entrada/unidade e saída relevantes | Qualificação |
| --- | --- | --- | --- |
| Núcleo: cobertura Market | GET /api/v6/dex/market/supported/chain | Sem parâmetros; lista específica do Market Price API | K4; obter evidência da família antes de anunciar rede. [O32](https://web3.okx.com/onchainos/dev-docs/market/market-price-chains) |
| Núcleo: preço | POST /api/v6/dex/market/price | Array de chainIndex + tokenContractAddress; EVM endereço minúsculo; time Unix ms; price string cuja denominação não é declarada na tabela | K4; registry local classifica Basic; unidade monetária precisa qualificação, sem presumir USD. [O31](https://web3.okx.com/onchainos/dev-docs/market/market-price) |
| Alternativa de preço | POST /api/v6/dex/index/current-price | chainIndex + tokenContractAddress; time Unix ms; price string sem denominação explícita | K4; R1 erra método GET, enquanto registry e fonte atual indicam POST. [O09](https://web3.okx.com/onchainos/dev-docs/market/index-price) |
| Núcleo: candles | GET /api/v6/dex/market/candles | [ts,o,h,l,c,vol,volUsd,confirm]; ts ms, vol em token base, volUsd USD; confirm 0 aberto/1 fechado; limite 299 | K4; registry Basic; paper/backtest deve distinguir barra finalizada e em formação. [O16](https://web3.okx.com/onchainos/dev-docs/market/market-candlesticks) |
| Núcleo: wallet observada | GET /api/v6/dex/balance/all-token-balances-by-address | address + chains separados por vírgula, até 50; tokenPrice USD; rawBalance pode vir vazio; balance não define unidade na tabela | K4; apenas consulta por endereço; excludeRiskToken=0 filtra por padrão, =1 não filtra; detecção limitada por rede. [O11](https://web3.okx.com/onchainos/dev-docs/market/balance-total-token-balances) |
| Complementar: análise da carteira | GET /api/v6/dex/market/portfolio/overview | chainIndex + walletAddress + timeFrame; realizedPnlUsd e tokenPnLUsd em USD | K4; PnL do provedor é métrica separada do ledger de paper; metodologia/fees e elegibilidade precisam validação. [O17](https://web3.okx.com/onchainos/dev-docs/market/market-portfolio-overview) |
| Núcleo: cobertura DEX | GET /api/v6/dex/aggregator/supported/chain | chainIndex opcional; retorna chainIndex/chainName/dexTokenApproveAddress | K4; família de swap single-chain; não reutilizar automaticamente lista Market ou Gateway. [O33](https://web3.okx.com/onchainos/dev-docs/trade/dex-get-aggregator-supported-chains) |
| Núcleo: quote | GET /api/v6/dex/aggregator/quote | chainIndex, fromTokenAddress, toTokenAddress, amount em menor unidade; exactIn padrão; exactOut restrito a Ethereum/Base/BSC/Arbitrum e protocolos compatíveis Uniswap V3; maxIn apenas Solana | K4; toTokenAmount é estimativa; tradeFee USD, estimateGasFee menor unidade; taxRate fração e priceImpactPercent percentual. [O12](https://web3.okx.com/onchainos/dev-docs/trade/dex-get-quote) |
| Núcleo: preparação | GET /api/v6/dex/aggregator/swap | userWalletAddress obrigatório; slippagePercent “0.5” = 0,5%; EVM 0–100, Solana menor que 100; approveAmount menor unidade; approveTransaction padrão false | K4; retorna material de transação, não comprova execução. Preparação requer alvo/token/valor/rede consistentes e deve permanecer não assinada. [O13](https://web3.okx.com/onchainos/dev-docs/trade/dex-swap) |
| Opcional: sinais | POST /api/v6/dex/market/signal/list | Uma chainIndex; walletType entrada 1/2/3; cursor e limite 100; price/amountUsd USD; soldRatioPercent percentual | K4; registry Premium; enum de resposta contradiz exemplo; timestamp sem unidade declarada. Não é comando de trade. [O10](https://web3.okx.com/onchainos/dev-docs/market/market-signal-list) |

Preço, saldo e cotação precisam preservar strings decimais/inteiros até conversão explícita. A referência de quote declara preço unitário recomendado e possivelmente null; decimals também podem mudar. Não usar number de JavaScript para quantidades em menor unidade. Estes são requisitos propostos de engenharia, não promessa fornecida pelo provedor.

## Autenticação, tarifas e categorias de acesso

| Superfície | Pode ser pública/anônima? | Pré-requisito ou efeito |
| --- | --- | --- |
| Documentação oficial e detecção de provider no browser | Sim para ler documentação/detectar objeto | Detecção não expõe conta automaticamente nem comprova consentimento |
| Dados públicos OKX Exchange CEX, por exemplo funding e open interest | Contratos públicos distintos dos endpoints privados; exemplos oficiais usam PublicAPI sem credenciais | Respeitar rate limit/região/instId e sem tratar dados de derivativos CEX como posições da wallet |
| OnchainOS Market/balance/portfolio/DEX/DeFi | Fontes mostram K4, inclusive chamadas somente de leitura | Chave de Developer Portal, plano/quota e habilitação do endpoint; free não significa anônimo |
| Wallet extension: acesso à conta | Não é Developer API auth | Aprovação de conexão da wallet pelo usuário, via provider de cada rede |
| Signing, approval, broadcast, Agentic transfer/swap | Não fazem parte do perfil leitura/paper | Capacidade financeira e autorização separadas, gates locais; HMAC HTTP não é consentimento para assinar |
| x402/pay-per-call ou assinatura de plano | Não equivale a leitura gratuita | HTTP 402 pode levar a pagamento; essa rota não deve ser habilitada por silêncio |

Market Free é US$0 com 100 mil chamadas Basic e 100 mil Premium por mês; WebSocket não incluído. Planos pagos adicionam quotas e WebSocket; existe auto-renovação e modalidade x402. Esses limites não atestam o plano ativo. [O03](https://web3.okx.com/onchainos/dev-docs/market/market-api-fee) Trade Trial documenta verificação email/telefone, validade de 60 dias, 1 RPS e aumento até 5 mediante aprovação; não autoriza contratação ou consumo pago. [O04](https://web3.okx.com/onchainos/dev-docs/trade/api-fee)

Credenciais privadas CEX usam os mesmos nomes K4, mas pertencem à conta Exchange e permissões próprias: Read/Trade/Withdraw. Não intercambiar identidade, segredo ou saldo CEX com Developer Portal ou wallet. A página CEX foi obtida por HTTP 200 via PowerShell; o leitor web recusou pelo tamanho acima de 4 MiB. Trechos de funding/OI foram comparados ao mirror oficial da organização OKX. [O24](https://www.okx.com/docs-v5/en/)

## Wallet extension, multichain e Agentic Wallet

- **EVM extension:** window.okxwallet é provider Ethereum; eth_requestAccounts deve partir de ação do usuário e abre aprovação; rejeição 4001. Observar accountsChanged/chainChanged e invalidar plano preso à conta/rede anterior. EIP-5792 depende de capacidades por cadeia, não deve ser presumido universal. [O05](https://web3.okx.com/onchainos/dev-docs/wallet/dapp-connect/chains/evm/provider)
- **Solana extension:** window.okxwallet.solana.connect() requer aprovação e pode rejeitar 4001; publicKey/isConnected e eventos connect/disconnect/accountChanged são contratos próprios. signTransaction/signAllTransactions/signAndSendTransaction são capacidades de assinatura, fora do núcleo leitura/paper. [O06](https://web3.okx.com/onchainos/dev-docs/wallet/dapp-connect/chains/solana/provider)
- **Multichain:** a matriz Dapp lista EVM, Bitcoin, Solana, TON, Sui, Aptos, Cosmos, Tron e Starknet em extension/mobile, com diferenças para outras redes; “mais de 100 redes” não implica uma única interface EVM em todas. Conexão e testes devem seguir provider específico. [O29](https://web3.okx.com/onchainos/dev-docs/wallet/dapp-connect/okx-wallet-integration-supported-networks)
- **Agentic Wallet:** chave gerada/armazenada e assinada em TEE; não é a mesma sessão da extensão. A introdução fala em quase 20 redes, enquanto a matriz geral afirma mais de 55; qualificar rede/capacidade concreta. [O07](https://web3.okx.com/onchainos/dev-docs/wallet/agentic-wallet) [O08](https://web3.okx.com/onchainos/dev-docs/home/supported-chain)
- Instalação oficial usa Node 18+ e onchainos-installer; login email/Google/Apple pode criar/restaurar wallet. Não executar isso para “detectar” uma wallet extension existente. [O28](https://web3.okx.com/onchainos/dev-docs/wallet/install-your-agentic-wallet) O quickstart anuncia assinatura/envio de swaps e transfers por conversa sem assinatura manual; esse fluxo exige controle de autorização local, não pode ser inserido silenciosamente em leitura/paper. [O30](https://web3.okx.com/onchainos/dev-docs/wallet/agentic-quickstart)

A presença do objeto provider, a conexão autorizada, o saldo lido, o teste de assinatura e uma execução confirmada são estados diferentes. Esta pesquisa constatou contratos, não os estados reais no Desktop.

## Preflight remoto e dependências opcionais

A referência do simulador exige whitelist, mas contém conflito de método: cabeçalho GET /api/v6/dex/pre-transaction/simulate e exemplo curl POST com body JSON. Também descreve extJson.inputData como base58 apesar de exemplo EVM hexadecimal. txAmount usa menor unidade nativa (por exemplo wei); EVM/Solana/Sui são mencionados. Não escolher método em produção somente por inferência; registrar não qualificado até confirmar o contrato aceito. [O25](https://web3.okx.com/onchainos/dev-docs/wallet/onchain-gateway-api-simulate-transaction)

Broadcast é POST /api/v6/dex/pre-transaction/broadcast-transaction e requer signedTx, address e chainIndex, com orderId/txHash de retorno; proteção MEV é experimental e tem redes limitadas. A referência atual não repete a restrição de whitelist, mas o guia oficial Solana a declara expressamente. Falta de texto numa página não comprova remoção da exigência. [O26](https://web3.okx.com/onchainos/dev-docs/wallet/onchain-gateway-api-broadcast-transaction) [O20](https://web3.okx.com/onchainos/dev-docs/trade/dex-use-swap-solana-quick-start) Gateway tem lista própria GET /api/v6/dex/pre-transaction/supported/chain. [O27](https://web3.okx.com/onchainos/dev-docs/wallet/onchain-gateway-api-chains)

O núcleo pode concluir **preflight local** com chain/account/amount/address/decimals/slippage/gas/route/risk/freshness validados, material não assinado e uma marca explícita “simulação remota não qualificada”. Não apresentar isso como simulação onchain realizada. Quando whitelist for comprovada e a ambiguidade de contrato resolvida, acrescentar simulação real como verificação adicional. Não incluir broadcast como condição de conclusão do objetivo leitura/paper.

## Correção material de DeFi e leverage

POST /api/v6/defi/product/search aceita productGroup=LENDING, além de SINGLE_EARN/DEX_POOL, paginação fixa de 20 e tokenKeywordList; rate é fração (0.02140 = 2,14%) e TVL é USD. [O14](https://web3.okx.com/onchainos/dev-docs/wallet/defi-product-search)

A afirmação ampla de R9 de que OnchainOS não oferece API de empréstimo/alavancagem está obsoleta. POST /api/v6/defi/transaction/enter documenta preparação para depositar **ou tomar empréstimo**, com exemplos Aave V3 USDC Borrow (investmentId 33901, chainIndex 43114), NAVI SUI Borrow (40047, 784) e Kamino USDC Borrow (29130, 501). coinAmount é humano; slippage usa fração (0.01 = 1%). Resposta dataList tem passos ordenados de assinatura/broadcast. Para Aave, enum WITHDRAW pode significar borrow e DEPOSIT pode significar repay; não deduzir negócio pelo enum isolado. [O15](https://web3.okx.com/onchainos/dev-docs/wallet/defi-transaction-enter)

Isso não comprova API completa de margem/perp, health factor, liquidation monitoring, crédito disponível, autorização financeira ou rentabilidade. A pesquisa registra capacidade documentada de preparação de borrow; operar borrow/loop e estratégia alavancada são escopo separado. O núcleo não precisa usar DeFi.

## Dados públicos CEX: complemento, com identidade própria

GET /api/v5/public/funding-rate: 10 requests/2 segundos por IP+instId, fundingRate refere-se ao próximo settlement; valor positivo significa long paga short. fundingTime/nextFundingTime são ms; intervalo não é invariavelmente 8 horas. nextFundingRate não é mais suportado/retorna vazio. [O21](https://raw.githubusercontent.com/okx/ai-builder-openapi-md/HEAD/skills/okx-v5-api/docs/okex/en/api/rest/public/fundingRate.md)

GET /api/v5/public/open-interest: 20 requests/2 segundos por IP+instId; instType obrigatório, com requisitos por instrumento; oi é contratos, oiCcy moedas, oiUsd USD e ts ms. Não somar contratos/coins/USD indistintamente ou relacioná-los automaticamente à wallet Web3. [O22](https://raw.githubusercontent.com/okx/ai-builder-openapi-md/HEAD/skills/okx-v5-api/docs/okex/en/api/rest/public/openInterest.md)

O mirror oficial usa HEAD; o arquivo sites.json documenta global/US/EEA/Turquia e geração 2026-09-23. Fonte mutável deve ser fixada por commit/hash antes de virar contrato reproduzível. Essas rotas não comprovam acesso/licenciamento no Brasil. [O23](https://raw.githubusercontent.com/okx/ai-builder-openapi-md/HEAD/skills/okx-v5-api/sites.json)

## Evidência literal curta e divergências

| Fonte | Evidência literal preservada | Implicação |
| --- | --- | --- |
| O09 | POST; /api/v6/dex/index/current-price | Corrigir a tabela GET de R1; registry local já usa POST |
| O31 | Latest token price | Tabela não declara USD; manter unidade desconhecida até evidência adicional |
| O12 | The amount must be specified in the token's smallest unit. | Testar quantidades com 6/18 decimals e limites, sem floating point |
| O13 | slippagePercent | Nome v6 e percentual; não reutilizar slippage v5 como fração |
| O15 | “Call this endpoint when a user wants to deposit assets into a DeFi protocol or borrow assets.” | Contradiz “somente spot/sem empréstimo API” de R9 |
| O20 | “The Broadcast API is available to our whitelisted customers only.” | Disponibilidade depende de qualificação; referência isolada é incompleta |
| O25 | GET; --request POST | Contradição do método simulador ainda não resolvida |
| O10 | SMART_MONEY; WHALE; INFLUENCER; "walletType": "2" | Tabela enum versus exemplo numérico; validar resposta real |
| R9 local | “nao entrega um produto de alavancagem com API.” | Conclusão ampla precisa revisão, sem converter documentação de borrow em aprovação |

Exemplos oficiais também contêm JSON malformado (vírgulas ausentes/trailing em alguns exemplos de index price e supported chains) e tipos incoerentes (investmentId String na tabela versus número no exemplo). Fixtures do projeto precisam representar contratos coerentes e registrar ambiguidades; copiar exemplos cegamente não é validação.

## Requisitos propostos e aceitação independente

Estes critérios são insumo para a SPEC congelada pelo integrador e avaliação independente; o autor deste relatório não os certifica.

| Requisito | Comportamento exigido | Aceitação proposta para revisor independente |
| --- | --- | --- |
| OKX-R1 Proveniência | Cada adapter do núcleo aponta fonte, método, versão, campo/unidade e hash; divergência vira estado explícito | Comparar registry/fixtures com fontes congeladas e contratos reais autorizados; GET/POST index corrigido; simulador não declarado qualificado com conflito pendente |
| OKX-R2 Separação de acesso | Leitura/paper permite apenas adapters e operações pré-definidos; credencial OnchainOS no backend; CEX auth e wallet independentes | Evidência de requisições e logs sem segredo; UI/rotas de paper não podem acionar assinatura, approval, broadcast, transferência, borrow ou pagamento x402 |
| OKX-R3 Unidades | Inteiros/decimais preservados; menor unidade, humano, fração, percentual, USD/coin/contracts e ms diferenciados | Casos independentes de 1 USDT=1000000, 1 DAI=1000000000000000000; 0.5 slippagePercent=0,5%; 0.01 DeFi slippage=1%; campo sem unidade continua desconhecido |
| OKX-R4 Qualificação real | Núcleo tem recorte de endpoint/rede/plano/conta observável; indisponível e desconhecido não viram zero/sucesso | Para o recorte autorizado, capturar requests readonly reais, status/código, schema, latency e lista de redes por família; credencial/entitlement ausente é dependência específica; optional indisponível não bloqueia todo núcleo |
| OKX-R5 Wallet observada | Detectar provider correto, conexão voluntária e endereço/rede atual; mudança invalida plano | Verificação independente no browser real para EVM/Solana incluídos no recorte; recusa 4001, disconnect e mudança de conta/rede exercitados; mock não certifica extension ativa |
| OKX-R6 Qualidade/freshness | Paper usa origem/instante/idade de dado, barra finalizada, estimativa de fees/slippage e risco; dado ausente/stale gera hold | Casos independentes para timestamp ambíguo, preço null, rawBalance vazio, barra aberta, quote antiga, impacto desconhecido, schema inesperado e falha/429; nenhuma ordem real |
| OKX-R7 Preparação/preflight | Plano de swap não assinado carrega conta/rede/tokens/valor/slippage/gas e hashes; simulação remota tem estado próprio | Revisar route/call target e invariantes; troca de qualquer parâmetro invalida plano; mostrar “local validado/remoto não qualificado” quando aplicável; não afirmar txHash/execução a partir de quote ou calldata |
| OKX-R8 Métrica honesta | Sem promessa de lucro ou 300ms; latência/custo e resultado de paper relatados com baseline | Medir p50/p95/p99 ponta a ponta no ambiente real, qualidade/retries/quota e resultados líquidos de fees estimadas; documentação ou benchmark sintético não prova ganho |
| OKX-R9 Capacidade DeFi | Catálogo reconhece LENDING/borrow documentado; execução fica fora do núcleo | Revisor verifica classificação Aave Borrow/WITHDRAW versus Repay/DEPOSIT pelo investmentId/contrato, sem qualquer transação; R9 não persiste o falso “sem borrow API” |
| OKX-R10 Jev real | A SPEC do integrador exige decisão real com entrada mínima sanitizada, opções finitas e recibo; advice não executa | Revisor confirma retorno real e receipt/uso conhecido, distingue preview/abstention, e constata gates locais. Pesquisa OKX não qualifica a integração Jev |

Não-goals: assinatura/envio financeiro; contratação de plano ou x402; login/criação de Agentic Wallet; instalar extensão/CLI; validar estratégia alavancada; garantir todos os endpoints/redes; inferir entitlement/credenciais/região; prometer lucros ou latência sem medições.

## Alternativas reais para o integrador

1. **OnchainOS server-side readonly + extensão EVM/Solana observada + paper e preparação:** cobre mercado/portfolio/DEX diretamente, com credencial Developer Portal/quota e provider específico. Melhor aderência ao objetivo completo quando acesso real existir; simulador remoto opcional e execução separada.
2. **RPC/provider-first + dados públicos CEX, com OnchainOS como dependência incremental:** permite detecção/conexão autorizada e carteira local sem Developer API; sinais/portfolio agregado/DEX router não estão qualificados até integrar acesso OnchainOS. Serve uma fatia observável, não prova toda integração solicitada.
3. **Watch-only por endereço + OnchainOS readonly, sem conexão inicialmente:** qualifica APIs/paper usando endereço autorizado, mas não comprova sessão da extension. Pode preceder opção 1 quando browser/provider ainda não qualificado.
4. **Agentic Wallet como adaptação futura separada:** TEE/CLI oferece assinatura automatizada, introduz identidade/login/capacidade financeira novos. Não é substituto silencioso da carteira browser observada e exige escopo/autorização próprios.

A escolha depende do estado real do projeto e deve seguir consulta Jev delegada já autorizada quando persistir ambiguidade técnica. Nenhuma alternativa autoriza operações financeiras. Não foi feita seleção por este pesquisador.

## Fontes locais examinadas e hashes SHA256

| Arquivo | SHA256 observado |
| --- | --- |
| docs/research/R1-onchain-os-capacidades.md | F850EB44F9413842DA01B3C67B2C9832C6DE8ADF1973FAD9F53F8D4DE8E6BBA6 |
| docs/research/R6-onchain-os-inventario.md | 2C861A47F88B1637AFE4118D9B8C4700226F5791852F9BE2C81572A2A061B717 |
| docs/research/R7-okx-agentic-wallet.md | AB0B9C4125F3EACC55A2E54EEA7232C8B8428522FA17A2DC2B16B12ADC8FB410 |
| docs/research/R9-system-one-alavancagem-onchainos.md | 33A5F3B69F877B4D7136DF6A974B820CAF3C7B9CFD136110BED6DA9DFA9C6F7F |
| src/onchainos/endpoints.ts | 23158BCD606D26A710723A55D18B5C4EDDD8C2C5F1273B3DE88182F4B73134B5 |
| C:/Users/gabri/.codex/skills/codex-desktop-harness/SKILL.md | 4D438885FE9C0646725BC82652CEC4309BAED5A1A570BE73C0ED2B7141399B11 |

Hashes referem-se aos arquivos observados antes de trabalho concorrente posterior. Não há edição de repository por este agente. A classificação Free/Basic/Premium do registry é evidência local; não prova entitlement real por conta.

## Manifesto de snapshots oficiais

Método: Invoke-WebRequest HTTP GET da documentação pública; SHA256 sobre UTF-8 de response.Content decodificado/re-encodificado, tamanho da mesma sequência. Isso não é hash dos bytes de transporte comprimidos. Não foram persistidas cópias integrais HTML; preservam-se URL, UTC, digest e evidência literal acima. HTML dinâmico pode mudar entre acessos sem mudança semântica (observado no index price); hash identifica snapshot observado, não garante refetch idêntico. HEAD do GitHub também é mutável.

| ID/fonte oficial | UTC | HTTP | bytes UTF-8 | SHA256 |
| --- | --- | --- | --- | --- |
| [O01](https://web3.okx.com/onchainos/dev-docs/home/what-is-onchainos) | 2026-10-11T14:39:29.9364811Z | 200 | 55771 | 6EA5DF70220F2263EF3D3386A33AAAFC4C21171959FEE8FF6D2CEF4923604693 |
| [O02](https://web3.okx.com/onchainos/dev-docs/home/api-access-and-usage) | 2026-10-11T14:39:30.4676481Z | 200 | 103686 | B7E5EFA6AC23132A6063C43E92FF08726A734527010BCB1E5C0760647B47F60E |
| [O03](https://web3.okx.com/onchainos/dev-docs/market/market-api-fee) | 2026-10-11T14:39:30.8800450Z | 200 | 79366 | 0948ACACDAEFF8CDBF56EC0F93B7F7FF4E63BF9AF3F47917F24572AEF53AA8DF |
| [O04](https://web3.okx.com/onchainos/dev-docs/trade/api-fee) | 2026-10-11T14:39:31.2858240Z | 200 | 61446 | C83D75B0E8427EF75829F6A9DEECB15F49D042029901AF0422300E82693E7506 |
| [O05](https://web3.okx.com/onchainos/dev-docs/wallet/dapp-connect/chains/evm/provider) | 2026-10-11T14:39:31.7383492Z | 200 | 147302 | 33DDE8054C327A241D1FEF8F9A2B24BF2DB8958E2398DBA42F2A6384A44C582F |
| [O06](https://web3.okx.com/onchainos/dev-docs/wallet/dapp-connect/chains/solana/provider) | 2026-10-11T14:39:32.2208811Z | 200 | 124909 | C38AB574AACC16064F964FC8605AB8FE874BF92E634818197E27946B21023E7D |
| [O07](https://web3.okx.com/onchainos/dev-docs/wallet/agentic-wallet) | 2026-10-11T14:39:32.6073887Z | 200 | 58083 | 5DB885062100A07B237728D4E3BC10AE018DE921896839BEE03397B4703BE566 |
| [O08](https://web3.okx.com/onchainos/dev-docs/home/supported-chain) | 2026-10-11T14:39:33.0208213Z | 200 | 60654 | 76D1BFED35D8AF7B6A7B025DE33DCC3442C534F2F1A3AADFCFAE4A4C6EED3326 |
| [O09](https://web3.okx.com/onchainos/dev-docs/market/index-price) | 2026-10-11T14:39:29.9824353Z | 200 | 69401 | 5AA866152BA6078414FEDCF537BED5AB1DE04CD12D6C639D4DFC68725BC05178 |
| [O10](https://web3.okx.com/onchainos/dev-docs/market/market-signal-list) | 2026-10-11T14:39:30.4910686Z | 200 | 79386 | 7994EFE642030E7DC9DD562C6CA524839096C2E8845C3197F999B217814F3166 |
| [O11](https://web3.okx.com/onchainos/dev-docs/market/balance-total-token-balances) | 2026-10-11T14:39:30.8983795Z | 200 | 126778 | D300A24473294A7B35DADF340D0980F21248D878B0411FF1E15CD9EE24B33276 |
| [O12](https://web3.okx.com/onchainos/dev-docs/trade/dex-get-quote) | 2026-10-11T14:39:31.3249200Z | 200 | 128667 | 9ACDC3DBC4AAB12C26ADF588EFE577B9D4528E5D799A7B080BAE17CAE3701469 |
| [O13](https://web3.okx.com/onchainos/dev-docs/trade/dex-swap) | 2026-10-11T14:39:31.7747604Z | 200 | 125744 | F1D0792EFE76B4CC19445BD66CAF7E6BCA0A1C0A1460B277A56C99A67A9E7E0F |
| [O14](https://web3.okx.com/onchainos/dev-docs/wallet/defi-product-search) | 2026-10-11T14:39:32.1777752Z | 200 | 79298 | 397D30895B1A51C0A4930E6A40555FDE2C937F0EF30EC169664D05E0DF84EB95 |
| [O15](https://web3.okx.com/onchainos/dev-docs/wallet/defi-transaction-enter) | 2026-10-11T14:39:32.5938563Z | 200 | 99648 | 578E8BDE752CED5F6D85B3F073D4677C13C23CAFE01DD12C4B4465B1B7109E11 |
| [O16](https://web3.okx.com/onchainos/dev-docs/market/market-candlesticks) | 2026-10-11T14:39:33.3833552Z | 200 | 71577 | F2752D0920E8B09CA43249BD91B8A3CD529B5284EA90227ABA52562F8BB8C24C |
| [O17](https://web3.okx.com/onchainos/dev-docs/market/market-portfolio-overview) | 2026-10-11T14:39:29.9426779Z | 200 | 76416 | 57B0F9028E9E1C6E22E2BCE0A85F025B6C68A528441AB3FC3D3DF2B4D29F4169 |
| [O18](https://web3.okx.com/onchainos/dev-docs/trade/onchain-gateway-api-broadcast-transaction) | 2026-10-11T14:39:30.4655629Z | 200 | 65730 | B5C97A40C3D39425F20B1F76FF221C249B7A831608188C5FDEEEFFBB34F9804A |
| [O20](https://web3.okx.com/onchainos/dev-docs/trade/dex-use-swap-solana-quick-start) | 2026-10-11T14:39:31.4275604Z | 200 | 520428 | 105744BDC3D4A2D53A23B1AF37AFC4A333EE476145115620ABD6C063B00B3416 |
| [O21](https://raw.githubusercontent.com/okx/ai-builder-openapi-md/HEAD/skills/okx-v5-api/docs/okex/en/api/rest/public/fundingRate.md) | 2026-10-11T14:39:31.6016291Z | 200 | 4778 | D19F414BD49B2BF8572E050D7AD5FD63ED7818A366611A3A7981256C0F2D9536 |
| [O22](https://raw.githubusercontent.com/okx/ai-builder-openapi-md/HEAD/skills/okx-v5-api/docs/okex/en/api/rest/public/openInterest.md) | 2026-10-11T14:39:31.7613999Z | 200 | 2570 | A1DCFA76644999E44C25F1E40FF5DDD31B26EC3DE995A58D8EEE41D0CD0A7950 |
| [O23](https://raw.githubusercontent.com/okx/ai-builder-openapi-md/HEAD/skills/okx-v5-api/sites.json) | 2026-10-11T14:39:31.9742857Z | 200 | 1092 | D6A7A35D29A397E993B677D1B3D60EBA25AF10BCE821020E56A0498D861342B0 |
| [O24](https://www.okx.com/docs-v5/en/) | 2026-10-11T14:41:02.2596739Z | 200 | 5247633 | 009D139C6386FAD226E43A47A346D00BE4CAC2FE8412779078D65C2CC9E50F0D |
| [O25](https://web3.okx.com/onchainos/dev-docs/wallet/onchain-gateway-api-simulate-transaction) | 2026-10-11T14:41:02.7703870Z | 200 | 71996 | 395A98F6B0EBA82B6F49F05E8EA395BB0E0B2809D9D7A418D890EB7F8E20F0CE |
| [O26](https://web3.okx.com/onchainos/dev-docs/wallet/onchain-gateway-api-broadcast-transaction) | 2026-10-11T14:41:03.1911794Z | 200 | 66856 | C78AFC945414F2A47255E0A5F6E47E9A93A4B944895BB50C6D5EA9EAFBEF5888 |
| [O27](https://web3.okx.com/onchainos/dev-docs/wallet/onchain-gateway-api-chains) | 2026-10-11T14:41:03.5964078Z | 200 | 64182 | 1EF4A5DD2E274056B5BD0589D028374FD1178ED2D078EE3614BD93B0F08845AF |
| [O28](https://web3.okx.com/onchainos/dev-docs/wallet/install-your-agentic-wallet) | 2026-10-11T14:41:54.8006720Z | 200 | 63684 | 85B08B554524BAB6955457E93AF2DD8C305FE063ED8FCB1B0D98A20774597CC5 |
| [O29](https://web3.okx.com/onchainos/dev-docs/wallet/dapp-connect/okx-wallet-integration-supported-networks) | 2026-10-11T14:41:55.2929039Z | 200 | 59003 | A3F0C7FDC0DFA70AD3D3F5C3E436924CB03431BF13FD782A993EF87B63E41ECC |
| [O30](https://web3.okx.com/onchainos/dev-docs/wallet/agentic-quickstart) | 2026-10-11T14:41:55.7165890Z | 200 | 57620 | C9B9304B458699E4DCEF2E715D58A0AF95D13223395121C186870BEE8293C5CE |
| [O31](https://web3.okx.com/onchainos/dev-docs/market/market-price) | 2026-10-11T14:46:13.4328872Z | 200 | 69123 | 9A4E4DDBE19FC4980962014EAA57E1E472B65470AA34594A0B28860DA281FE7A |
| [O32](https://web3.okx.com/onchainos/dev-docs/market/market-price-chains) | 2026-10-11T14:46:32.8588081Z | 200 | 68305 | 58B61BC963C32D1253DCA9EA53363CA568991EBDA46D36B42615AA60F0A2FB23 |
| [O33](https://web3.okx.com/onchainos/dev-docs/trade/dex-get-aggregator-supported-chains) | 2026-10-11T14:46:48.1362117Z | 200 | 63451 | C4646AEE7551116CAED0DCADDA955B1F1F77D413A5011C6DECA93F41E11E2F87 |

Lookup falhou para O19, URL suposta https://web3.okx.com/onchainos/dev-docs/trade/dex-onchain-gateway-api-simulate-transaction: “Response status code does not indicate success: 404 (Not Found).” O25 foi encontrado pelo link oficial e responde HTTP 200. Não usar O19 como contrato.

