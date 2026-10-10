# Pesquisa de integração OKX — Inonu Trader

Data: 2026-10-09. Responsável: pesquisador `/root/okx_ecosystem_research`. Resultado: contratos documentados e proposta delimitada para revisão independente; nenhuma chamada autenticada, transação, assinatura de carteira ou qualificação de operação financeira foi realizada.

O próximo incremento elegível é um scanner de pesquisa somente leitura com cinco endpoints, identidade por chain e contrato, tratamento explícito de dados desconhecidos e execução financeira permanentemente não qualificada nessa entrega. Conectar uma Web3 Wallet, obter cotações e negociar futuros na Exchange são integrações diferentes. Os documentos consultados não demonstram lucro, acesso live do usuário nem disponibilidade de todos esses produtos na conta brasileira.

## 1. Proveniência e limites

Objetivo observado: expandir a tomada de decisão do JEV para oportunidades de cripto, arbitragem e eventual trading, integrando a OKX Web3 Wallet. O usuário deseja crescimento do capital; esta pesquisa não converte esse desejo em expectativa estatística de retorno nem autorização de ordens.

O coordenador informou a decisão Jev `d7fe122c-6c2f-43b2-9640-22f41c17e340`: scanner somente leitura com cinco endpoints e critérios E1–E8. É informação recebida do coordenador; este pesquisador não verificou diretamente esse recibo. A própria consulta de estratégia de pesquisa retornou `primary_docs`, recibo `2cc53a8f-d5f4-4d31-9658-c7da0d2ea503`, modelo jev-1.13.0, confiança 0,86, HTTP 200, uso informado de 688 tokens de entrada e 48 de saída, custo desconhecido. Advice é consultivo e não concede autorização.

Contrato de projeto lido como evidência: `C:/Users/gabri/jev-trader/docs/OKX-ECOSYSTEM-SPEC.md`, SHA-256 `C0C0CA088FED47C7E37D495134D53EBD1E63E7360BDADDBC2CE2F08235525946`. Ele fornece o baseline E1–E8; a versão final deve ser congelada pelo coordenador e revisada por outro agente.

Contexto nativo usado: CODEX_THREAD_ID `01a1226e-5de2-71b1-ae15-224eb0e5146d`; CODEX_SESSION_ID `01a1216a-c46b-72f3-b3dc-24c79470308d`. Estado privado do harness foi apenas consultado e não foi copiado para esta saída.

## 2. Contrato comum de autenticação

Origem documentada: `https://web3.okx.com`. Cabeçalhos: `OK-ACCESS-KEY`, `OK-ACCESS-SIGN`, `OK-ACCESS-PASSPHRASE`, `OK-ACCESS-TIMESTAMP`. Assinatura: Base64 de HMAC-SHA256 usando o secret sobre `timestamp + METHOD + requestPath + body`. Método em maiúsculas; GET inclui a query exata em requestPath; POST inclui o corpo bruto exato enviado. Timestamp UTC ISO 8601 e diferença máxima documentada de 30 segundos. Reordenar query ou reserializar JSON após assinatura invalida a correspondência. [Acesso OKX, S01](https://web3.okx.com/onchainos/dev-docs/home/api-access-and-usage)

As credenciais pertencem ao projeto de desenvolvedor OKX, distintas da chave JEV e da conexão da extensão Wallet. Requisito proposto: secret apenas no processo servidor/CLI; assinatura determinística local; sem cookies, chaves privadas de carteira ou credenciais no browser, JEV, recibos públicos ou logs. As cinco rotas abaixo devem ser uma allowlist fixa. Envelope bem sucedido exige `code === "0"`, sem transformar erro do provedor em lista vazia.

## 3. Cinco endpoints para a primeira entrega

### 3.1 Descobrir chains e protocolos

`GET /api/v6/dex/market/memepump/supported/chainsProtocol`; sem parâmetros. Envelope: `{code, msg, data: Array<{chainIndex, chainName, protocolList: Array<{protocolId, protocolName}>}>}`; campos de identidade são strings. Essa resposta deve determinar quais protocolos existem na chain selecionada. Exemplos mostram 501/Solana e 56/BSC, mas não constituem cobertura permanente. Não há timestamp de atualização nem RPS específico documentado nesta página. [Chains/protocolos, S02](https://web3.okx.com/onchainos/dev-docs/market/market-memepump-get-supported-chains-and-protocols)

Requisito proposto: cadeia única explícita, presente na descoberta, com IDs retornados pelo provedor. Nenhum ID de protocolo deduzido por nome ou fixado a partir de exemplo.

### 3.2 Descobrir tokens Meme Pump

`GET /api/v6/dex/market/memepump/tokenList`. Tabela: `chainIndex` e `stage` obrigatórios; stage é `NEW | MIGRATING | MIGRATED`; `protocolIdList` opcional com IDs separados por vírgula. Omitir `walletAddress`. Resposta: `data: {cursor, items: Array<token>}`, com identidade `chainIndex + tokenContractAddress`, protocolo, quoteTokenAddress, nome/símbolo/logo, createdTimestamp, market, bondingPercent, tags e social. `createdTimestamp` usa Unix em milissegundos. [Lista Meme Pump, S03](https://web3.okx.com/onchainos/dev-docs/market/market-memepump-get-token-list)

Divergência relevante: máximo anunciado de 30 itens e cursor na resposta; a tabela não documenta parâmetros limit/cursor/sort/order. O curl usa `protocolId=1&sort=createdTimestamp&order=desc&limit=30` e omite stage, divergindo da tabela. Usar tabela, cap local de 30 e nenhuma paginação inventada. IDs ilustrativos de protocolos também divergem entre páginas: descobrir dinamicamente.

Tags de concentração são descritas como percentuais, mas exemplos usam “0.12” e “0.10”. Preservar essa ambiguidade; não multiplicar por 100 por suposição. Idade de criação/migração não comprova frescor de preço ou segurança.

### 3.3 Preço e métricas em lote

`POST /api/v6/dex/market/price-info`; corpo JSON é um array de `{chainIndex, tokenContractAddress}`, máximo documentado de 100; limite da entrega proposta: 30. Envelope `data` é array de resultados identificados, incluindo price, time, liquidity, holders, marketCap, volumes e variações de preço de 5M/1H/4H/24H, contagens de transações. EVM: contrato em minúsculas; Solana: preservar caixa. `time` é Unix em milissegundos para o preço. Valores quantitativos são frequentemente strings. [Preço/métricas, S04](https://web3.okx.com/onchainos/dev-docs/market/market-token-price-info)

Requisito proposto: fazer join por identidade, nunca posição do array. Identidade divergente, duplicatas conflitantes, preço ausente/inválido ou timestamp futuro/stale produzem desconhecido ou bloqueio explícito. Preço/liquidez não admitem negativos; variação de preço negativa é válida. Não rotular liquidity como USD sem unidade comprovada no campo/contrato; `liquidityUsd` dos pools é separado. Preço indicativo não é cotação executável.

### 3.4 Informações avançadas e tags de risco

`GET /api/v6/dex/market/token/advanced-info`; `chainIndex` e `tokenContractAddress` obrigatórios. `data` é objeto identificado. `riskControlLevel` é string: 0 indefinido, 1 baixo, 2 médio, 3 médio/alto, 4 alto, 5 alto configurado manualmente. `tokenTags` pode incluir honeypot e lowLiquidity; concentrações incluem top10HoldPercent, devHoldingPercent e bundleHoldingPercent. Valores podem ser strings vazias. [Informações avançadas, S05](https://web3.okx.com/onchainos/dev-docs/market/market-token-advanced-info)

Requisito proposto: 0 significa risco desconhecido; ausência de tag não prova segurança. `createTime` é criação, não instante de inspeção do risco. Não existe garantia documentada de freshness da inspeção nessa resposta. `totalFee` inclui priority/tip, mas não fornece aqui unidade suficiente para tratá-lo como custo futuro da operação. Preservar campo bruto e status desconhecido; não substituir por zero.

### 3.5 Pools com maior liquidez

`GET /api/v6/dex/market/token/top-liquidity`; mesmos parâmetros obrigatórios de identidade. `data` é array dos cinco pools principais. Campos: `liquidityUsd`, `liquidityAmount[{tokenAmount,tokenSymbol,tokenContractAddress}]`, pool, protocolName, poolAddress, poolCreator e taxas. O exemplo não repete chainIndex/tokenContractAddress no topo de cada pool: preservar o vínculo da requisição e conferir pertencimento do contrato em liquidityAmount, sem inventar identidade ecoada. [Pools/liquidez, S06](https://web3.okx.com/onchainos/dev-docs/market/market-token-top-liquidity)

`liquidityProviderFeePercent` usa percentual explícito, por exemplo “0.7%”, aplicado em compra/venda. `hookFeePercent` e `sniperTaxPercent` têm buy/sell; string vazia é desconhecido. Exemplos mostram poolBasicFeePercent e sniperTaxInfo nulos e diferenças de nome de logo em relação à tabela: não criar aliases silenciosos. Curl ilustrado com cookies não substitui o contrato global de assinatura.

Liquidez em USD não garante saída, slippage ou ausência de taxas adicionais.

### Limites comuns, chamadas e custos

A Market API anuncia franquias mensais de 100 mil Basic e 100 mil Premium, depois US$0,0001/Basic e US$0,0002/Premium. Descoberta é classificada como gratuita; top-liquidity Basic; tokenList, price-info e advanced-info Premium. Franquia efetiva, consumo e elegibilidade do projeto do usuário permanecem desconhecidos. Não presumir custo zero. O mecanismo x402 exige assinatura de pagamento: erro de cobrança/402 deve ser reportado, sem pagar ou tentar assinatura. [Tarifas Market, S07](https://web3.okx.com/onchainos/dev-docs/market/market-api-fee)

Proposta local: 1 descoberta + 1 lista + 1 preço em lote + 2 chamadas por token, até 63 chamadas para N=30. Esse orçamento é derivado do fluxo proposto, não uma franquia do provedor. Sem retries automáticos, com timeout finito, abort e contador. RPS específico dos cinco endpoints não foi comprovado; a configuração deve distinguir limite local e limite contratual desconhecido.

## 4. Contratos das próximas integrações

### DEX: cotação de ida e volta, sem swap

`GET /api/v6/dex/aggregator/quote`: chainIndex, amount, fromTokenAddress, toTokenAddress obrigatórios. Amount e resultados são inteiros na menor unidade do token; usar BigInt/decimal exato. `data` é array com identidade de chain/tokens, decimais, fromTokenAmount/toTokenAmount e rota. `tradeFee` estima taxa de rede em USD; `estimateGasFee` usa unidade mínima da chain. Somá-los como custos separados pode contar a mesma taxa duas vezes. `taxRate` usa fração 0–1; `priceImpactPercent` usa percentual. Impacto null desativa a proteção do provedor: bloquear avaliação dependente. Não há timestamp/TTL de cotação documentado. [Cotação, S10](https://web3.okx.com/onchainos/dev-docs/trade/dex-get-quote)

Próxima SPEC: quote A→B e B→A usando saída inteira da primeira perna, mesma chain, receivedAt local e idade máxima declarada. Saída é estimativa, não fill. Não adicionar novamente impostos/LP/slippage já embutidos; atribuição desconhecida deixa resultado não avaliado. Cobertura deve vir de `GET /api/v6/dex/aggregator/supported/chain`; esta rota descreve swaps de uma chain, sem qualificar bridges. [Chains do agregador, S11](https://web3.okx.com/onchainos/dev-docs/trade/dex-get-aggregator-supported-chains)

Trial DEX documenta 60 dias desde criação da chave, verificação de email/telefone e 1 RPS padrão; ampliação depende de elegibilidade/aprovação. Slippage positivo pode ser retido como tarifa de infraestrutura, limitado a 10% do valor; isso não significa taxa fixa de 10% em todo trade. Tier real é desconhecido. [Tarifas/limites DEX, S12](https://web3.okx.com/onchainos/dev-docs/trade/api-fee)

A API anuncia casos de arbitragem, mas não demonstra oportunidade rentável específica. Suporte geral por categoria de chain não comprova suporte de cada endpoint/protocolo. [Introdução DEX, S09](https://web3.okx.com/onchainos/dev-docs/trade/dex-api-introduction), [Cobertura, S08](https://web3.okx.com/onchainos/dev-docs/home/supported-chain)

### Carteira: patrimônio e PnL

`GET /api/v6/dex/balance/total-value-by-address`: address e chains obrigatórios (até 50); assetType opcional; `excludeRiskToken=true` filtra. `data` é array com totalValueUSD. Filtragem de honeypot é indicada para ETH/BSC/SOL/BASE, não universal. [Valor total, S13](https://web3.okx.com/onchainos/dev-docs/market/balance-total-value)

`GET /api/v6/dex/balance/all-token-balances-by-address`: address/chains obrigatórios; **excludeRiskToken string “0” filtra, “1” não filtra**, diferente do boolean anterior. `data` contém tokenAssets com chainIndex, tokenContractAddress, balance, rawBalance, tokenPriceUSD, isRiskToken. rawBalance vazio significa informação indisponível. Contrato vazio pode representar ativo nativo: não reutilizar o validador de contrato Meme Pump sem um tipo explícito. [Saldos, S14](https://web3.okx.com/onchainos/dev-docs/market/balance-total-token-balances)

`GET /api/v6/dex/market/portfolio/overview`: chainIndex, walletAddress, timeFrame obrigatórios; timeFrame 1=1D, 2=3D, 3=7D, 4=1M, 5=3M. `data` é objeto com realizedPnlUsd, winRate e métricas de compra/venda. Introdução menciona PnL não realizado, mas a tabela não oferece unrealizedPnlUsd: não inventá-lo. A página não comprova reconciliação completa de gas, impostos e custo de todas as entradas. [Portfolio, S15](https://web3.okx.com/onchainos/dev-docs/market/market-portfolio-overview)

Esses endpoints enviariam endereço ao provedor. Não foram chamados; uso de endereço, redes e dados financeiros do usuário é dependência separada. Conexão de extensão e permissões de API não equivalem a patrimônio verificado.

### Exchange spot/futuros/demo

A Exchange apresenta spot, margin e contratos em produto separado da Wallet. Demo requer chave própria criada no ambiente de demonstração; disponibilidade depende de região/conta. [API Exchange, S16](https://www.okx.com/pt-br/okx-api)

V5 usa `GET /api/v5/public/instruments` para metadados públicos e `POST /api/v5/trade/order` para ordens. Demo requer `x-simulated-trading: 1`. Contratos usam lotes, lotSz/minSz/tickSz/ctVal/ctType; não assumir tamanho em moedas. Modos de conta/posição e funding exigem uma SPEC separada com documentação atual e testes de demonstração, antes de execução. A leitura integral via ferramenta web excedeu o limite: `(400) Content length is too large: 4194305+`; trechos pesquisados e captura pública HTML apoiam os pontos delimitados, não uma implementação completa de ordens. [V5, S17](https://www.okx.com/docs-v5/en/)

Permissões Read, Trade e Withdraw são distintas; o FAQ também descreve permissões adicionais historicamente ativadas em chaves Trade. Inventariar escopo efetivo, sem presumir mínimos. Exigência de saldo para criar API é restrita a certas áreas, não prova necessidade de novo depósito. [FAQ, S18](https://www.okx.com/en-us/help/api-faq)

O próprio repositório OKX documenta diferenças de domínio e demo por site; são resultados do fornecedor, não testes desta conta. Nada foi instalado ou executado. [Compatibilidade oficial, S22](https://raw.githubusercontent.com/okx/agent-trade-kit/github-main/docs/site-compatibility.md)

### Pix e Nubank

Depósito BRL por Pix é fluxo da conta custodial OKX, com CPF/nome correspondentes; não foi documentado Pix diretamente para um endereço Web3. Destinatário e condições devem vir da UI autenticada atual, não de exemplos fixos. O depósito de R$400 é relato do usuário, não saldo verificado. [Depósito BRL, S19](https://www.okx.com/pt-br/help/how-do-i-deposit-brl)

Saque BRL por Pix exige conta bancária com CPF/nome próprios; há verificação de conta e mínimo documental de R$5. Nubank não foi especificamente comprovado nas fontes consultadas. Limites, taxas e elegibilidade reais continuam dependentes da conta/UI. Um possível percurso Wallet→Exchange→BRL→Pix exige validar redes, ativos, conversão, taxas e requisitos separadamente; não executado nem incorporado ao scanner. [Saque BRL, S20](https://www.okx.com/pt-br/help/how-do-i-withdraw-brl)

## 5. Evidência de retorno e o caso US$68 → US$6.700

O material oficial TypeSafe/Jev apresenta decisões estruturadas rápidas e demonstrações como Doom/Wikiracing; não encontrei ali evidência auditável do japonês de 19 anos, capital inicial US$68 e resultado US$6.700 em um dia. Buscas delimitadas nas fontes oficiais não localizaram histórico de ordens, endereço verificável ou metodologia. Status: **não verificado nas fontes consultadas**, sem concluir que o relato seja falso. [Apresentação oficial Jev, S21](https://typesafe.ai/blog/introducing-system-one-models-and-jev)

Inferência de engenharia: latência baixa reduz tempo de decisão, mas não cria vantagem econômica por si só; confiança de um classificador não estima retorno. Mock pode verificar aritmética e comportamento, não rentabilidade de mercado. Um backtest defensável precisa universo point-in-time, preços executáveis, custos, latência, sobrevivência dos tokens, OOS e comparador fixo. Nenhuma dessas avaliações reais foi executada nesta pesquisa. Crescimento exponencial e reinvestimento também amplificam perdas; nenhum requisito deve garantir lucro constante.

## 6. Proposta de requisitos e aceitação independente

Esta tabela prepara a SPEC do coordenador. Não constitui aprovação nem certificação pelo pesquisador.

| Critério do baseline | Comportamento observável proposto | Evidência exigida ao implementador/revisor |
|---|---|---|
| E1 | Allowlist origem/rotas, assinatura exata, limite 1–30, timeout finito, erro seguro, code “0” e shape por endpoint | Vetores HMAC GET/POST independentes; recusa de origem/path extra; schema objeto/array correto; nenhuma repetição automática |
| E2 | CLI offline sintética por padrão; live exige gate explícito e conjunto completo de credenciais próprias; chain única | Teste com spy de rede: default/missing credentials fazem zero chamadas; limite efetivo e contador 63 para N=30 |
| E3 | Identity join; caixa conforme chain; decimais exatos; vazio/ausente/inválido desconhecidos; três relógios separados | Fixtures com ordem trocada, identidade errada, duplicatas, strings vazias, Solana case, percentuais ambíguos e fees com unidades explícitas |
| E4 | Honeypot/low-liquidity/concentração conhecida/stale/future/identity mismatch bloqueiam; faltas críticas não passam | Casos independentes de triagem; riskControlLevel 0 não seguro; máximo status research_candidate; execution = not_qualified |
| E5 | Economia hipotética tem duas pernas e custos identificados; desconhecido não equivale a zero | Ledger com ponto de equilíbrio e perdas; teste contra dupla contagem; resultado positivo rotulado como cenário, sem ordem |
| E6 | Credenciais e dados privados não chegam ao browser/Jev/logs; nenhuma private key/wallet transaction | Revisão de fluxos/fixtures com marcadores de segredo; zero rotas de swap/order/withdraw; preservar loop/wallet preexistentes |
| E7 | Guia em português distingue interface documentada, acesso live e informação não comprovada | Revisão textual: Pix/Exchange/Wallet separados, anedota não verificada, quota/custo reais null, sem promessa de retorno |
| E8 | Verificação local pertinente e revisão por agente independente em baseline fixo | Resultado real de testes/typecheck/regressão; revisor recebe SPEC/hash; mocks não apresentados como acesso live ou ganho |

Não objetivos desta entrega: API de ordens/swap, aprovação de ERC-20, assinatura/broadcast, bridge, futuros reais, custódia de chave, Pix automatizado, cobrança/x402, endereço ou saldo do usuário enviado ao JEV/provedor, novas instalações, publicação, fork/push/PR. O escopo de redes fica explícito e não é ampliado automaticamente por catálogo genérico.

## 7. Alternativas reais e próximos incrementos

| Alternativa | Valor mensurável | Dependência ou limite |
|---|---|---|
| Scanner cinco endpoints, escolhido pelo coordenador/Jev | Validar discovery, identidade, risco e custos desconhecidos; gera candidatos de pesquisa | Credenciais/quota/rate reais ainda desconhecidos; não mede lucro executável |
| Portfolio read-only | Reconciliação do capital e PnL observado | Endereço/chain e autorização de egress; API PnL não substitui ledger reconciliado |
| DEX ida/volta read-only | Medir spread estimado após custos de duas pernas | Tier/RPS, unidades, freshness local, impostos embutidos e executabilidade ainda sem prova |
| Exchange demo independente | Validar lotes, modos e ciclo de ordens simuladas sem capital real | Credencial demo, domínio/região/conta elegível; Wallet não fornece acesso Exchange |

Sequência proposta: concluir scanner com revisão independente; depois congelar SPEC para DEX ida/volta read-only e coleta point-in-time; somente após dados suficientes avaliar política JEV contra comparador determinístico em OOS. Portfolio e Exchange demo são seams próprios. Critérios congelados não podem ser relaxados para mostrar resultado positivo.

Dependências factuais não resolvidas: credenciais OKX Web3 completas e quota/tier atual; limite contratual de RPS Market; discrepâncias de tokenList/pool schema/percentuais; idade real de inspeção de risco; chain/ativo/local dos R$400; elegibilidade brasileira para derivados e domínio; verificação Nubank; direitos/licença e histórico point-in-time; confirmação auditável da anedota. Esses fatos permanecem desconhecidos até evidência direta; JEV não pode inventá-los.

## 8. Manifesto de fontes e hashes

As fontes são primárias oficiais OKX ou TypeSafe. Hashes SHA-256 abaixo identificam **os bytes públicos recuperados em uma captura HTTP 200**, não uma versão imutável do site; páginas dinâmicas/redirects podem produzir outro hash numa leitura futura. Nenhuma API autenticada foi chamada. Não foram persistidas páginas brutas devido ao contrato de saída de um único arquivo. S16 redirecionou para pt-br; o marcador inglês inicialmente buscado não apareceu no corpo capturado. Em S08 o marcador chainIndex também não apareceu; nenhuma presença literal desses dois marcadores é afirmada.

| ID/fonte | Recuperação UTC | Bytes | SHA-256 dos bytes recuperados |
|---|---|---:|---|
| S01 [Acesso e assinatura](https://web3.okx.com/onchainos/dev-docs/home/api-access-and-usage) | 2026-10-09T20:56:42.002Z | 103608 | `6fa07f7461ca709c0e156b98cb69678b2f48cbc849a4ea66f0e7e46b3acc5594` |
| S02 [Chains e protocolos Meme Pump](https://web3.okx.com/onchainos/dev-docs/market/market-memepump-get-supported-chains-and-protocols) | 2026-10-09T20:56:42.000Z | 71092 | `02e382f6545ee1a4beb92ded09853eb4b98ed32065bf294931cf642f6f0c2f9e` |
| S03 [Lista de tokens Meme Pump](https://web3.okx.com/onchainos/dev-docs/market/market-memepump-get-token-list) | 2026-10-09T20:56:42.000Z | 89099 | `9a7d47fdc1b0957027b333d317f760d34dfaa5362b85847bb12667f2d42e98eb` |
| S04 [Preço e métricas](https://web3.okx.com/onchainos/dev-docs/market/market-token-price-info) | 2026-10-09T20:56:42.003Z | 82034 | `87d22c3229aa43fc47e228b1a793534880930fcded3a695298b2bd619ea94a56` |
| S05 [Informações avançadas](https://web3.okx.com/onchainos/dev-docs/market/market-token-advanced-info) | 2026-10-09T20:56:41.996Z | 86685 | `4507bba88863c64510330426779d44e3dd851522282487026d0545b9143d1877` |
| S06 [Pools com maior liquidez](https://web3.okx.com/onchainos/dev-docs/market/market-token-top-liquidity) | 2026-10-09T20:56:42.377Z | 92296 | `9115439a4cb7a72e5b3098c3d1d050fe73367dc5a300cfdb107eb4ff36d1a9e9` |
| S07 [Tarifas Market API](https://web3.okx.com/onchainos/dev-docs/market/market-api-fee) | 2026-10-09T20:56:42.369Z | 79288 | `75f93b3f02b0fdde2fa74c13744e84d2bba703a80de59ca0818428821f487907` |
| S08 [Cobertura por categoria](https://web3.okx.com/onchainos/dev-docs/home/supported-chain) | 2026-10-09T20:56:42.382Z | 60576 | `3b3e973249ea16359e2ca16e595466bc1d88438ef7d47f4e1c4b0d34564e032b` |
| S09 [Introdução DEX](https://web3.okx.com/onchainos/dev-docs/trade/dex-api-introduction) | 2026-10-09T20:56:42.368Z | 57476 | `de64b48b429997548637ad20d50ab3e331978a44448c190cf5a2f9e03dc6918d` |
| S10 [Cotação DEX](https://web3.okx.com/onchainos/dev-docs/trade/dex-get-quote) | 2026-10-09T20:56:42.390Z | 128588 | `d17c6adb35644f939ba9cfad98d1e848a79ede1e5039c7e549a46d1966844ddb` |
| S11 [Chains do agregador](https://web3.okx.com/onchainos/dev-docs/trade/dex-get-aggregator-supported-chains) | 2026-10-09T20:56:42.765Z | 63371 | `ef84258bfc4a0fbf292e5a1370bc32742bdb06cc2ad2de1ab559f1a4763d42cf` |
| S12 [Tarifas e limites DEX](https://web3.okx.com/onchainos/dev-docs/trade/api-fee) | 2026-10-09T20:56:42.767Z | 61366 | `56d8f3e3434d2abbf54e14afdf8cc819ab79400b1b32673f3966feb91dd57971` |
| S13 [Valor total de carteira](https://web3.okx.com/onchainos/dev-docs/market/balance-total-value) | 2026-10-09T20:56:42.760Z | 68577 | `ab58b88d0371577fc2cfe0b170d460a517fd21248fe2f458fe199c09fac81ae5` |
| S14 [Saldos de tokens](https://web3.okx.com/onchainos/dev-docs/market/balance-total-token-balances) | 2026-10-09T20:56:42.757Z | 126699 | `52157e3b6e8a807d7311b457ae166231e57605de8892ec63857ee4f278c2637f` |
| S15 [Desempenho de carteira](https://web3.okx.com/onchainos/dev-docs/market/market-portfolio-overview) | 2026-10-09T20:56:42.769Z | 76337 | `ea29971feb497cf8c19e6c287c65a81563fe963b9378ab82b0a98c1c2f70f9cf` |
| S16 [API Exchange](https://www.okx.com/pt-br/okx-api) | 2026-10-09T20:56:43.493Z | 85897 | `2cbe337019db9ea0f484cf902805cd7fd22c93d56a29f9dfda39f2865849e714` |
| S17 [Contrato Exchange V5](https://www.okx.com/docs-v5/en/) | 2026-10-09T20:56:44.195Z | 5247633 | `009d139c6386fad226e43a47a346d00be4cac2fe8412779078d65c2cc9e50f0d` |
| S18 [FAQ Exchange API](https://www.okx.com/en-us/help/api-faq) | 2026-10-09T20:56:43.213Z | 120912 | `810ba8bd8ff43ee22c0effc17903bb72b1930c2bf078374d4c14169dbdd776af` |
| S19 [Depósito BRL/Pix](https://www.okx.com/pt-br/help/how-do-i-deposit-brl) | 2026-10-09T20:56:43.184Z | 100934 | `c69be78376965d7acb0de31446c73e291fd1e632e7b6c1fd04889c9f887f43ad` |
| S20 [Saque BRL/Pix](https://www.okx.com/pt-br/help/how-do-i-withdraw-brl) | 2026-10-09T20:56:43.208Z | 105664 | `8f5457c24c726c68c92596419c3033dcc02bdcf3ef94b0953732aa55af663280` |
| S21 [Apresentação oficial Jev](https://typesafe.ai/blog/introducing-system-one-models-and-jev) | 2026-10-09T20:56:44.305Z | 270133 | `8022e1b2b9e97d842ee1f1432c312c27e3124ce1a65ae94d1ca1fbf7bf1e1e2e` |
| S22 [Compatibilidade de sites OKX](https://raw.githubusercontent.com/okx/agent-trade-kit/github-main/docs/site-compatibility.md) | 2026-10-09T20:56:44.448Z | 2877 | `c18c8da93dd93d5effbd80feb049ca775943c64dcd1513410f432a6f4da7e1ad` |

Evidência literal curta, encontrada nos corpos públicos acima; o total de citação literal permanece limitado por fonte:

| Fonte | Trecho literal verificado |
|---|---|
| S01 | “POST requests must include the raw request body in the signature calculation.” |
| S02 | “chainsProtocol” |
| S03 | “maximum limit of 30 entries” |
| S04 | “Unix Millisecond” |
| S05 | “riskControlLevel” |
| S06 | “Returns an empty string if the value cannot be determined” |
| S07 | “payment signature” |
| S09 | “arbitrage” |
| S10 | “smallest unit” |
| S11 | “single-chain swap” |
| S12 | “1 request per second” |
| S13 | “total-value-by-address” |
| S14 | “all-token-balances-by-address” |
| S15 | “realizedPnlUsd” |
| S17 | “x-simulated-trading” |
| S18 | “Trade permission” |
| S19 | “CPF” |
| S20 | “CPF” |
| S21 | “Doom” |
| S22 | “x-simulated-trading” |

Hashes dos contratos locais lidos:

| Arquivo | SHA-256 |
|---|---|
| codex-desktop-harness/SKILL.md | `C77CD3459817B09970A7B8BCEDEEFD9F8383DB78DBA44E0B3AB42C471924E475` |
| research/SKILL.md | `985569F15739C713D6784887C3D186D4EF9AC85BEC5AD9C068D25BF0739928E4` |
| jev-workflows/classify-decision/SKILL.md | `56DD387F8ED2BB1C4EC041927E0374274E491EFF02B9D96A6940881AE26C94C5` |
| docs/OKX-ECOSYSTEM-SPEC.md (baseline lido) | `C0C0CA088FED47C7E37D495134D53EBD1E63E7360BDADDBC2CE2F08235525946` |

Próximo responsável: coordenador congela SPEC, entrega baseline/contratos/critério E1–E8 ao implementador e agenda revisão por agente independente. Esta pesquisa não implementou o scanner nem aprovou seu próprio contrato.

