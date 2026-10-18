# Pesquisa independente: cobertura dos endpoints DeFi OKX

Data: 2026-10-11. Entrega de pesquisa/advice, sem implementação, aprovação, certificação live ou alteração dos critérios originais. O objetivo completo da central JEV/OKX continua incompleto.

## Escopo e método

Origem somente leitura por instrução: C:/Users/gabri/.codex/worktrees/inonu-system-one-safety/jev-trader. Todas as referências de código abaixo pertencem ao commit fixo 1f08e6edd589449a82eeb70638987a09572a3bd2, árvore 15b1fe6b2ac58c5821b9ab77723610d0afe780aa; não acompanhei HEAD móvel. SHA-256 do manifesto calculado sobre bytes dos blobs Git, não sobre normalização do terminal.

Exceção autorizada: leitura do arquivo concorrente não rastreado docs/research/OKX-RESOURCE-MATRIX-REFRESH-20261011.md; SHA-256 9dcbc0c2ceac2a9d23346b4581dfdc903828dfc2baade9e61e90183b510aca7f, inalterado nas verificações desta pesquisa. Leituras e buscas delimitadas de nomes de fábricas, imports e paths em src, scripts e web/src. Documentação pública primária consultada nesta data; não chamei os endpoints de serviço.

Contexto do harness da própria conversa recuperado em leitura; seus metadados preexistentes não qualificam esta entrega. Skills codex-desktop-harness e research aplicadas proporcionalmente; evidência de revisão separada de autorização. GPT-6.1 Sol/xhigh solicitado; modelo, esforço e tier efetivos não observáveis, portanto desconhecidos. Pasta de saída é cópia ordinária, sem garantia OSRO. Este pesquisador não executou testes, aplicações, feeds, providers, wallets, RPC ou signers, nem iniciou consulta Jev. Avisos consultivos automáticos apareceram nas ferramentas; não comprovam autorização, e sua execução/custo efetivos não foram qualificados. Nenhuma leitura de .env/credenciais, instalação ou agente filho.

## Resultado principal

A expressão “defi.ts” na matriz L10/L23 descreve corretamente apenas src/okx-wallet/defi.ts. Ela omite src/onchainos/defi-read.ts, que implementa os sete endpoints de descoberta, incluindo paginação limitada e os três grupos de produto. Eles também estão registrados em src/onchainos/endpoints.ts:61-67. Isso demonstra cobertura de biblioteca, sem demonstrar ligação à central ou qualificação live.

O catálogo R6 JSON já referencia o cliente amplo: L3131-3221 e L3243-3310. A tabela narrativa R6:84 ainda marca cinco desses endpoints como ausentes e R6:86 descreve detalhe apenas por fixture. É divergência documental comprovada, não motivo para ignorar o código ou declarar integração concluída. A central tem anotação manual status: "implemented" e resumo de Earn/lending/pool, mas refs apenas ao cliente menor e ao relatório offline (web/src/lib/central/ecosystem-catalog.ts:223-231).

## Contratos públicos e cobertura separada

Legenda: I = adaptador HTTP implementado; R = registro tipado endpoints.ts, salvo indicação “legado”; C = chamada encontrada em fonte, sem prova de execução; T = teste existente inspecionado, não executado; L = live qualificado. Prefixo dos paths: /api/v6/defi. Cada link é a referência oficial do respectivo contrato. A [visão geral OKX](https://web3.okx.com/onchainos/dev-docs/wallet/defi-api-overview) separa descoberta, transações e posições.

| Endpoint oficial: método/path | Contrato documentado e limites | I / R / C / T / L |
| --- | --- | --- |
| [Chains](https://web3.okx.com/onchainos/dev-docs/wallet/defi-product-supported-chains): GET /product/supported-chains | Sem paginação declarada; redes com produtos ativos; atualização descrita como aproximadamente horária, não heartbeat. | sim / sim / mock / mock :249 / desconhecido |
| [Platforms](https://web3.okx.com/onchainos/dev-docs/wallet/defi-product-supported-platforms): GET /product/supported-platforms | Sem paginação declarada; ID de protocolo e investmentCount em contagem. | sim / sim / mock / mock :255 / desconhecido |
| [Search](https://web3.okx.com/onchainos/dev-docs/wallet/defi-product-search): POST /product/search | tokenKeywordList obrigatório; filtros opcionais de plataforma/rede/grupo; pageNum desde 1, páginas fixas de 20. SINGLE_EARN padrão, DEX_POOL e LENDING. rate fração decimal; TVL USD. Keyword não prova contrato de token. | sim, dois clientes / sim / mock e ramo do operador / mock :17, :97 e wallet :20 / desconhecido |
| [Detail](https://web3.okx.com/onchainos/dev-docs/wallet/defi-product-detail): GET /product/detail | investmentId obrigatório; tokens, flags e taxas; página inspecionada não estabelece escala/base de rate, TVL, feeRate e utilizationRate. Sem paginação declarada. | sim / sim / mock / mock :116 / desconhecido |
| [Rate chart](https://web3.okx.com/onchainos/dev-docs/wallet/defi-product-rate-chart): GET /product/rate/chart | investmentId; WEEK padrão, MONTH/SEASON/YEAR; timestamp ms. Escalas de rate/bonusRate/totalReward não estabelecidas na descrição inspecionada. Sem cursor. | sim / sim / mock / mock :169 / desconhecido |
| [TVL chart](https://web3.okx.com/onchainos/dev-docs/wallet/defi-product-tvl-chart): GET /product/tvl/chart | Mesmos intervalos; chartVos, timestamp ms e TVL USD explícitos. Sem cursor. | sim / sim / mock / mock :192 / desconhecido |
| [Depth/price](https://web3.okx.com/onchainos/dev-docs/wallet/defi-product-depth-price-chart): GET /product/depth-price/chart | Apenas pools V3; DEPTH padrão; PRICE permite DAY/WEEK. PRICE tem timestamp ms; unidades de preços/liquidity não estabelecidas. Não é OHLC nem prova de saída executável. | sim / sim / mock / mock :206 / desconhecido |
| [Holdings list](https://web3.okx.com/onchainos/dev-docs/wallet/defi-user-asset-platform-list): POST /user/asset/platform/list | walletAddressList com rede/endereço; totais monetários USD. assetStatus=1 informa atualização concluída, sem estabelecer TTL. Sem parâmetro de paginação declarado. | ausente / ausente / não encontrada / não encontrado / desconhecido |
| [Holdings detail](https://web3.okx.com/onchainos/dev-docs/wallet/defi-user-asset-platform-detail): POST /user/asset/platform/detail | walletAddressList e platformList; posições/totais USD e quantidades de tokens. Sem paginação declarada; unidades de cada campo precisam de contrato próprio. | ausente / ausente / não encontrada / não encontrado / desconhecido |
| [Prepare](https://web3.okx.com/onchainos/dev-docs/wallet/defi-product-prepare): POST /product/detail/prepare | investmentId; inputs/receipt/yield tokens, rede/precisão; currencyAmount USD, coinAmount denominado quantidade de token sem base atômica explícita nessa página. | ausente / ausente / não encontrada / não encontrado / desconhecido |
| [Calculator](https://web3.okx.com/onchainos/dev-docs/wallet/defi-transaction-enter): POST /calculator/enter/info | Seção V3 da página Enter; inputAmount e coinAmount humanos, ticks e tokenDecimal; investWithTokenList auxilia os inputs. Não estabelece saída realizada. | ausente / ausente / não encontrada / não encontrado / desconhecido |
| [Enter](https://web3.okx.com/onchainos/dev-docs/wallet/defi-transaction-enter): POST /transaction/enter | Inputs em coinAmount humano; slippage fracionário, 0.01 = 1%; retorna calldata ordenada. Assinar/transmitir é etapa distinta. | ausente / ausente / não encontrada / não encontrado / desconhecido |
| [Exit](https://web3.okx.com/onchainos/dev-docs/wallet/defi-transaction-exit): POST /transaction/exit | coinAmount humano; slippage fracionário; redeemPercent "1" = 100%. Tabela chama este campo recomendado, notas o chamam obrigatório: preservar conflito. Retorna calldata, não saldo realizado. | ausente / somente legado / não encontrada / não encontrado / desconhecido |
| [Claim](https://web3.okx.com/onchainos/dev-docs/wallet/defi-transaction-claim): POST /transaction/claim | Endereço/rewardType e identificadores condicionais; prepara calldata de coleta. | ausente / ausente / não encontrada / não encontrado / desconhecido |

Linhas T sem nome de arquivo referem-se a src/onchainos/defi-read.test.ts; wallet = src/okx-wallet/defi.test.ts. Ausência é limitada aos clientes, registros e consumidores examinados, não declaração universal sobre todo software OKX. Sem paginação declarada não significa quantidade ilimitada.

Os sete adaptadores estão em defi-read.ts:379-418; grupos em :50, parsers em :166-303, interface pública em :348-357. A busca delimitada da fábrica createDefiReadClient encontrou somente o teste :5/:13 como consumidor direto. Não encontrei ligação desse cliente ao runtime central/operador nesse escopo; consumidores externos ou dinâmicos não foram demonstrados.

O outro cliente chama apenas Search, por símbolo, SINGLE_EARN, pageNum:1 (src/okx-wallet/defi.ts:41-47). O operador o constrói dentro do ramo live em scripts/okx-operator.ts:162-175, com DEFAULT_PAIRS. Isto é chamada possível em fonte, não execução observada. O path Exit existe apenas em TRADE_PATHS, src/okx-wallet/trade.ts:30, e o catálogo R6:3352-3368 reconhece registro; não é implementação de resgate.

Há uma terceira cobertura distinta: buildDefiReport em src/okx-defi/report.ts:137-167 e scripts/okx-defi.ts:78-92 processam captura sintética/importada offline de Search/Detail, sem buscar endpoints. Seus testes são sintéticos; scripts/okx-defi.test.ts:17/:33 usa ambiente allowlisted e --no-env-file. O relatório limita uma página a 20 e mantém partial_unverified, not_qualified, totalCosts/netReturn/executableExit nulos.

## Requisitos originais preservados e lacunas concretas

Texto congelado, docs/OKX-ONCHAINOS-DADOS-SPEC.md:52:

> DeFi leitura: busca em páginas de 20, detalhe, séries de APY, TVL e profundidade; rate é fração decimal na busca; o resultado se chama taxa anunciada e nunca retorno líquido

D19, :55:

> Paginação limitada: tetos de páginas e de linhas, parada em página vazia, cursor repetido ou sem progresso, indicação de truncamento

D23 (:59) exige pureza; D25 (:61) exige coerência de registro, SPEC e catálogo. :270 exclui endpoints de posições por privacidade; :275 exclui preparação/calculator/transações. isolation.test.ts:30-37 explicitamente proíbe esses paths. Posição HTTP read ainda envia endereço ao provedor; preparação de calldata não autoriza assinatura. Nenhuma ampliação dessas fronteiras foi autorizada.

1. **Identidade insuficiente para entrada verificada.** No cliente legado, chainIndex ausente ou não string não impede aceitação; chainIndex/tokenContractAddress de saída vêm do pedido (:25-32). No cliente amplo, Detail aceita investmentId omitido e devolve o pedido como ID (:193-198); token chainIndex não é preservado em underlyingTokens (:215-219). Teste :147-150 confirma mismatch rejeitado, omissão aceita. Isto não prova associação remota ao ativo exato.
2. **Paginação limitada existe, completude não demonstrada.** SearchPages (:386-399) soma quantidade de linhas e encerra por página curta ou total; collectPages (:35-60) limita páginas/linhas/cursor, sem deduplicar identidade. Páginas duplicadas, total mutante ou página curta contraditória podem parecer exhausted sem snapshot consistente. Não reclassifico o requisito existente como aprovado/reprovado nesta pesquisa; proponho evidência complementar.
3. **Proveniência por página e tempo.** mergeMeta, read.ts:39-44, conserva tempo inicial e metadados finais, sem vetor por página. Esses tempos são locais, não TTL do provedor. O ramo DeFi em candidates.ts:269-281 usa quoteAgeMs:0, hash de ID/APY/size e researchOnly:false; tais campos não demonstram freshness de produto. O executor permanece bloqueando kind diferente de dex_round_trip (:143-159), portanto isto não prova autorização ou execução DeFi.
4. **Unidades/custos incompletos.** values.ts:68-71 converte decimais para Number; o relatório offline preserva texto decimal (:25-27/:97-98). Flags de investimento/resgate e TVL não provam liquidez de retirada, prazo, taxa de entrada/saída, dívida ou risco. Gateway:5/:128-139 oferece gas price por unidade de rede, sem gas limit nem custo total. Custos desconhecidos continuam nulos; não deduzir lucro líquido, FX ou saldo realizado de exemplo, receipt ou calldata.
5. **Status/contrato de integração.** Não há consumidor amplo identificado, nem demonstração UI desses dados reais. O tier T0/T1 do catálogo central é classificação local; não equivale a plano comercial OKX. endpoints.ts usa tier:unknown para os sete. Publicação das páginas não prova serviço keyless/gratuito, disponibilidade regional, quotas, todas as redes ou qualificação live. O HTTP local só permite envio com credenciais válidas e allowNetwork:true (http.ts:515-524/:540-546), usando autenticação HMAC de API; nenhuma dessas chamadas foi exercitada.

## Próximo contrato mínimo: proposta, não SPEC aprovada

Prioridade recomendada: fechar identidade/proveniência/status do consumidor de descoberta antes de expandir posições ou execução. Entrada mínima: método/path e parâmetros canônicos; grupo; ID/rede solicitados separados dos reportados; identidade de token por rede quando disponível; decimais com unidade declarada ou unknown; fonte e hash de captura por página; tempos locais e timestamps de séries separados; total observado, limites, motivo de parada e parcialidade. Captura recente não passa a ser freshness remota. APY anunciado nunca se converte automaticamente em resultado líquido ou recomendação executável JEV.

Aceitação independente proposta, cumulativa a D16/D19/D23/D25:

- **Q1:** mocks dos três grupos demonstram bodies/20 linhas; tetos, duplicatas, total mutante e página curta contraditória deixam resultado explicitamente parcial. Nada afirma inventário completo do ecossistema.
- **Q2:** ausência de ID/rede/token remoto fica unknown; mismatch explícito rejeita a associação; valores copiados do pedido não recebem label verified.
- **Q3:** unidades preservadas por endpoint, sem extrapolar Search para Detail/chart; decimal original disponível para eventual aritmética exata. Timestamp ms de série não substitui TTL nem instante de leitura.
- **Q4:** evidência por página e hashes reproduzíveis; idade local, captura futura/stale e TTL desconhecido visíveis. Qualquer agregação de custo exige conjunto conhecido, unidade/base, timestamp e, se necessário, FX com fonte/hash/freshness; falta conserva custo/net desconhecidos.
- **Q5:** UI apresenta implemented/registered/called/tested/live-qualified separadamente e cobertura parcial. Fixture/mock/imported nunca recebem status live; chamadas em fonte não contam como sessão observada. Executor DeFi continua bloqueado.
- **Q6:** verificação offline com fetch injetado, sem ambiente herdado nem endpoints excluídos; revisão de candidato com hashes fixos e independência real antes de implementação integrada. Teste unitário não certifica credenciais, plano, acesso regional ou API live.

Alternativas reais: (A) projetar o cliente amplo existente para consumo readonly da central, começando por mocks e mantendo rede desligada; (B) apresentar primeiro o relatório offline existente de Search/Detail, com partial_unverified e unidades honestas; (C) manter o cliente legado com rótulo explícito SINGLE_EARN/primeira página. A cobre mais contratos; B minimiza dependências externas mas não adiciona séries/paginação; C tem menor alteração e não encerra o objetivo amplo. Nenhuma alternativa autoriza provider calls nesta tarefa.

Se elegível em ciclo separado, arquivos novos possíveis para posse exclusiva: src/okx-defi/discovery-input.ts e seu teste; web/src/lib/central/defi-coverage.ts e seu teste. São propostas de seams públicos, sem concessão de posse agora. Alterações em defi-read.ts, registro/catálogo, candidatos ou CLI devem ficar com integrador responsável, devido à concorrência. Os seams atuais são createDefiReadClient(http), searchPages(query, limits) e buildDefiReport(input); seus testes existentes oferecem base offline. Não implementar adaptador paralelo antes de decidir a associação desses contratos.

## Limitações e conclusão de pesquisa

Evidência estática mais documentação oficial, sem execução de testes ou serviços. Existem testes mock para os sete reads; seu status de passagem atual não foi verificado aqui. Não foi observada qualificação live de qualquer endpoint. TTL, custos totais, bases não declaradas, cobertura de protocolos/redes e permissões pessoais permanecem desconhecidos. Documentação web é versão observada nesta data, sem hash de bytes HTTP alegado. Nenhum código privado ou captura de carteira foi enviado a terceiros. Critérios originais, fronteiras econômicas/custódia e objetivo completo permanecem preservados.

## Manifesto SHA-256 dos blobs fixos

```text
491e629c515cf69267528de649f19bcb0b3f4425a133d070487d7d4647d402f6  CONTRIBUTING.md
2d86832b576554954ba77fab444aa69bb4cc44174f1dc6a59e0759ae5ae277e4  docs/OKX-ONCHAINOS-DADOS-SPEC.md
3ca018c1175d79faffefed1e82b12bcd3a3ace1a17c35a261ff9e46e1145b812  docs/research/R6-onchain-os-inventario.md
f50fe6be335340aab823cbad2e5668824b5bae68987fec60829087eb32934601  docs/research/R6-onchain-os-catalogo.json
3b9e10d3f1f53510710a8912d54ffe20e3e5cf5e6f8b62eabf656782fd992226  src/onchainos/endpoints.ts
fade562867add24b8c01d771e73e96499d1a3179470de0a5576d3617e83e7389  src/onchainos/defi-read.ts
f3867dd9d8d926f2e17274ab570f0e0ab5f182a1c8b0b5186e76cdf17458fd96  src/onchainos/defi-read.test.ts
9c8d3197d9e7eb01a136bb96ab1ff3dffe8a47f12b5377e29a52098e3d4831f4  src/onchainos/paging.ts
58b69017735e2ac88df086f0c6b8df2fe3404cd354b13930574e52a28ccaef4f  src/onchainos/read.ts
1a1806406d0d9c5218d4954abca6725a61be2e5835a282dfe9942661aee7e1a5  src/onchainos/http.ts
7dd37caea9e1c534bea5e2d77f60e86b08acef464cab412b76aa0b887eb9999e  src/onchainos/values.ts
21fe4721669ce1e4c8de668b29c73b407b0ef07d54b0503d55838ac53bca9279  src/onchainos/gateway.ts
ab7c00082d2d7f9e9930216383abe6659eb13d241e0107dad5c11400333e5234  src/onchainos/isolation.test.ts
28532158e98aee74c05decedfc96e669caa77e2bdaa2d1c152c640a9f52c7b63  src/okx-wallet/defi.ts
017ccc64ee213a2e0ea3d97308c871ddb7b8ee687040e39c4ee5c8ec5de68445  src/okx-wallet/defi.test.ts
1f55e3377bb178b585587ba064792e67b416f542e3ffaed4fe97f0f0c740522d  src/okx-wallet/trade.ts
6edfa00c5ca891bf0bc86c0cffcfdc7759902b587e878a2ddeab26ad9767efa7  src/operator/candidates.ts
4b413799c101eed60512376f6b02a84875f3a9d5b523e5090244a09cb1e819ef  src/operator/executor.ts
4be6328b584ac1655c764af4c822dbf178e1bf5d8a01d65939d2866d51598257  scripts/okx-operator.ts
8794362f0100b2a2942e316c328e9defa65a503f0f0bb6c8354844c3a8301ed0  src/okx-defi/report.ts
81f95dc634a03aba9ed1e07ba9ad8ec145065d537f7ae21b2d4b50d3485237a5  src/okx-defi/report.test.ts
a84e8585bb320ed61791141d92aa57d77eacacd84609199996c1aea84a0e5bcb  scripts/okx-defi.ts
39319e4e9fff7202d54a5bb2185c7b04c183ba5220f17ac9ffd9a4a0189dc82a  scripts/okx-defi.test.ts
408262cfdd3144d5e44ef9c16d50247bc1a11378df5ec7a30aca2f8d1681a5a5  web/src/lib/central/ecosystem-catalog.ts
```

Matriz concorrente, fora da árvore fixa: 9dcbc0c2ceac2a9d23346b4581dfdc903828dfc2baade9e61e90183b510aca7f.