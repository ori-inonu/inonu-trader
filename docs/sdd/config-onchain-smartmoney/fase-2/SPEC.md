# SPEC da Fase 2 on-chain: digest para o Inonu, medição, rotas novas e superfícies

Estado: **aprovada pelo usuário em 2026-10-13** ("Aprovar, seguir as próximas etapas do planejamento"); implementação em andamento, ver [TASKS.md](TASKS.md) e a seção 7. A rodada de planejamento foi só de documentos. Continua [config-onchain-smartmoney](../spec.md) e se apoia, sem redefinir, na SPEC do instalável ([inonu-desktop-v1](../../inonu-desktop-v1/SPEC.md), revisão r2): IDs dela aparecem em crases (`API-3`, `ASK-4`, `T3.8`). Fatos medidos estão em [ACHADOS.md](ACHADOS.md) (`A-nn`); as mudanças que esta SPEC pede à SPEC do instalável estão em [ADENDO-REV3.md](ADENDO-REV3.md) (`D3-nn`).

Regras que não mudam (CLAUDE.md e SPEC do instalável): o **modelo** decide comprar, vender ou manter e o código descreve (`ASK-4`, `FLX-10`); nenhuma camada nova decide ou executa; o caminho do Kuru não é tocado; texto exibido sem ponto médio, travessão ou meia-risca e sem animação piscante; dado sintético, vencido ou indisponível nunca aparece como ao vivo; na interface o assistente é o **Inonu** e "Jev" só aparece como proveniência do modelo (D-U1); nada paga, assina ou transmite (`API-10`, `WAL-8`).

## 1. Objetivo e prioridade

O primeiro resultado que o usuário quer ver funcionando é **"Pedir ao Inonu" com dados on-chain e sociais estruturados**: o modelo recebe um resumo pequeno e tratado (o Evidence Brief de até 2 KB, `ASK-3`), não milhares de dados. Por isso o grupo **F2-DIG** vem primeiro; **F2-MED** vem junto porque o orçamento do digest depende de camadas e limites medidos; **F2-OCX** completa as rotas que o digest e as telas ainda não têm; **F2-UI** só fixa onde cada rota aparece e como não gastar chamadas; **F2-GOV** guarda a evidência e as regras de convivência com a outra sessão.

## 2. Decisões e premissas

| ID | Decisão ou premissa | Origem |
| --- | --- | --- |
| D-F2-1 | O digest roda em **TypeScript** (`src/intel/`, instalável sem Python). O Python só gera vetores de ouro onde a matemática for sutil (percentis, composições com `log1p`), como `smc.py` e `smc.ts` | Resposta do usuário |
| D-F2-2 | O Evidence Brief **não ganha chave nova** nesta fase (`BriefInput` fixo, `src/intel/brief.ts:36`): o conteúdo on-chain entra em `fluxo`, `candidatos`, `trilha`, `risco`, `regime`, `idades`, `origens` e `nulos` | A-25 |
| D-F2-3 | O campo `onchain` do pacote Python do Jev (`python/jev_analytics/pack.py:73`) **continua nulo** nesta fase; o digest on-chain vive no Brief do Inonu | Premissa a confirmar na aprovação |
| D-F2-4 | Ritmo do gateway **1,1 s até medir**; o limite publicado no portal é teto superior (A-03) | Resposta do usuário |
| D-F2-5 | Camada de cobrança desconhecida conta como Basic até a medição com prints do portal | Resposta do usuário |
| D-F2-6 | Entram nesta fase, vindas de "depois" ou "fora": Trenches com detalhes, RWA, índice, velas históricas, clusters em detalhe, X Layer (baleias e saldos), explorer forense e saúde da rede | Resposta do usuário |
| D-F2-7 | Todas as rotas novas são **somente leitura**; Agentic Wallet, Payments, swaps e envio continuam fora (`ADR-5`, `ADR-6`) | SPEC do instalável |

## 3. Requisitos

### 3.1 Digest para o Inonu (F2-DIG, prioridade 1)

| ID | Evento/condição e comportamento esperado | Fonte | Check |
| --- | --- | --- | --- |
| F2-DIG-1 | O digest on-chain de um token deve calcular as nove componentes da trilha (`src/intel/trail.ts`, `COMPONENTS`) **só** a partir das fontes da tabela 4.1. Componente cuja fonte não respondeu fica `null` e entra em `componentesAusentes`; um número ausente nunca vira zero. Em especial, `risco` usa `(5 - nivel) / 5` para nível 1 a 5 e o nível 0 (indefinido) fica ausente com motivo `nivel_indefinido`, nunca 1,0 | `SMT-4`, `T6.3`, A-18, A-19 | Teste por componente com a fonte presente, vazia, não consultada e com erro |
| F2-DIG-2 | O digest deve entrar no `BriefInput` pelas chaves existentes: `alvo` `{chainIndex, address}`; `candidatos` com `tokenCandidate` (id `token:<chainIndex>:<address>`); `trilha` `{nota, componentes, componentesAusentes}`; `risco` `{nivel, flags}` com `nivel` inteiro de 0 a 5 e `flags` do conjunto fechado de F2-DIG-7; `fluxo` com `aprox: true`; `regime: null` com motivo `nao_se_aplica_a_token`; `idades` e `origens` por campo (`origens` sempre `onchainos`). O rótulo de concentração `Low`, `Medium`, `High` do gateway é traduzido por **adaptador explícito** para `baixa`, `media`, `alta` antes de `concentrationComponent`; sem adaptador o componente ignora o rótulo e usa o fallback de `top10` (A-18). O adaptador também normaliza a escala de cada campo numérico (percentual 0 a 100 ou fração 0 a 1) conforme a tabela 4.1, e campo de escala ambígua (cluster) fica fora da nota até `F2-MED-8`. `fluxo` leva também `custo` `{sinaisBps, distribuicao, corroborado}`: o custo médio ponderado dos sinais contra o preço agora e a fração já vendida (`V-CUSTO-1`); `corroborado` fica falso enquanto o digest não tiver o ATR | `ASK-3`, `T7.1`, D-F2-2, A-18, A-25 | Teste de adaptador (3 rótulos, rótulo desconhecido, ausente); teste que falha se `trilha.componentes.concentracao` usar o fallback com rótulo presente |
| F2-DIG-3 | O desconhecido deve ter **três estados distintos** em `nulos`: `vazio_valido` (o provedor respondeu e não tem dado: lista vazia, `details: []`, `data: null`); `nao_consultado:<motivo>` com motivo em `sem_credencial`, `orcamento`, `cota_esgotada`, `rede_nao_suportada`, `familia_nao_habilitada`, `teto_de_chamadas`, `nao_pedido` (o plano não incluiu a fonte); e `erro:<codigo>` com o código do envelope. Mapa fixo: `ok` com `null` ou lista vazia, `vazio_valido`; `no_credentials` ou `incomplete_credentials`, `nao_consultado:sem_credencial`; `budget_exhausted` ou `pace_limited`, `nao_consultado:orcamento`; `provider_payment_required`, `nao_consultado:cota_esgotada`; `unsupported_chain`, `nao_consultado:rede_nao_suportada`; `rate_limited`, `provider_error`, `schema`, `clock_skew`, `provider_unauthorized`, `bad_request`, `erro:<codigo>`. Dado servido do cache `stale` mantém o valor com a idade verdadeira | `ASK-3`, `SRC-2`, `D3-02`, A-05 | Teste do mapa (um caso por código do envelope) e teste de que `stale` mantém idade |
| F2-DIG-4 | Cada pedido do modo token tem plano de **no máximo 13 chamadas** e o do modo descoberta de **no máximo 14**, ambos abaixo do teto de 15 (`API-3`), conforme as tabelas 4.2 e 4.3. `onchainosCalls` do resultado da fonte é o número de chamadas que **saíram para o provedor** (cache não conta); o corte vale sobre o plano antes de qualquer chamada. A soma por camada da tabela é conferida pelo verificador desta pasta | `API-3`, `ASK-5`, `ADR-6`, A-20, A-21 | Teste do plano por modo; teste de corte com plano de 16 itens; `tools/verify.ts` confere as somas |
| F2-DIG-5 | O Brief só é regerado quando um fator cruza limiar material (`ING-2`) e o digest não faz **nenhuma chamada em segundo plano** (`ASK-1`): só um clique inicia o plano. Cada campo carrega a idade; dado acima do TTL da rota é marcado vencido em `idades` e entra na regra de material | `ING-2`, `ASK-1`, `DAT-2` | Contador do ledger em 0 sem clique; teste de materialidade por idade |
| F2-DIG-6 | A componente `sentimento` (`sentiment/symbol`, `bullishRatio`) só entra quando o símbolo é inequívoco: ativo da OKX (por exemplo BTC, ETH, SOL, OKB) ou token on-chain marcado `communityRecognized` e único no resultado da busca da rede. Caso contrário fica ausente com motivo `simbolo_ambiguo`. Um símbolo sem cobertura (`details: []`) é `vazio_valido` | A-11, `SRC-5` | Teste com símbolo ambíguo, símbolo coberto e símbolo sem cobertura |
| F2-DIG-7 | Nenhum texto livre de terceiros chega ao Brief: notícias, resumos, nomes de KOL, apelidos, nomes de pool e de protocolo ficam fora. `risco.flags` só aceita o conjunto fechado das etiquetas documentadas de `advanced-info` (`honeypot`, `lowLiquidity`, `communityRecognized`, `devHoldingStatusSell`, `devHoldingStatusSellAll`, `devHoldingStatusBuy`, `initialHighLiquidity`, `smartMoneyBuy`, `devAddLiquidity`, `devBurnToken`, `volumeChangeRateHoldersPlunge`, `holdersChangeRateHoldersSurge`, `dexScreenerTokenCommunityTakeOver`, `dexScreenerPaid`, `dexBoost`, `rwaXstock`, `rwaOndo`, `rwaOndoStatusPreMarket`, `rwaOndoStatusRegular`, `rwaOndoStatusPostmarket`, `rwaOndoStatusOvernight`, `rwaOndoStatusClosed`, `rwaOndoStatusPaused`) mais as derivadas da tabela 4.1; etiqueta fora do conjunto é descartada e contada | A-19, A-04, `ASK-4` | Teste com etiqueta desconhecida, com texto injetado e com tamanho acima de 40 caracteres (a etiqueta documentada mais longa tem 33) |
| F2-DIG-8 | Os cálculos de F2-DIG-1 devem ter **vetores de ouro** com tolerância 1e-9: reaproveitar `V-CUSTO-1`, `V-TRAIL-1` (nota 69,47) e `V-PERC-1` do instalável e acrescentar `V-F2-RISCO-1` (nível 1 a 5 e nível 0), `V-F2-CONC-1` (adaptador e fallback), `V-F2-FLUXO-1` (`buyShare` por volume em USD) e `V-F2-LIQ-1` (P75 do conjunto). O Python gera os vetores que envolvem percentil e `log1p`; as fórmulas triviais têm vetor calculado à mão | D-F2-1, `T6.3`, `flow-engine.md` seção 6 | Teste TypeScript reproduz os vetores; gerador em `python/tools/` (tarefa, não escrito nesta fase) |
| F2-DIG-9 | Um Brief de exemplo de token deve ficar **abaixo de 2.048 bytes** com a ordem de descarte do instalável (`fatores` e `componentes` primeiro) preservada; o exemplo desta fase mede 1.124 bytes ([tamanho-do-brief-exemplo.txt](evidence/tamanho-do-brief-exemplo.txt), rótulo `synthetic_fixture`) | `ASK-3`, `T7.1` | Teste de tamanho com o exemplo; erro `BriefTooLarge` em vez de truncar |
| F2-DIG-10 | Esta fase não chama o modelo real; os testes usam modelo falso e o ledger registra `null` onde o custo é desconhecido (`ASK-6`, `T7.8` inalterados) | `ASK-5`, `ASK-6` | Contador de chamadas ao modelo igual a zero nos testes |
| F2-DIG-11 | Endereços completos de carteiras só existem no **servidor** (junção `qualidade` com o `leaderboard` e custo dos top traders); o Brief e o navegador nunca recebem endereço de carteira, só contagens e razões. O token do `alvo` é identidade pública e pode aparecer | `SMT-4`, A-26 | Varredura do Brief e das respostas HTTP por padrões de endereço de carteira |

### 3.2 Medição e orçamento (F2-MED)

Todas dependem de autorização expressa de chamadas e, onde dito, dos prints do usuário. Nada nesta fase é executado: só especificado.

| ID | Evento/condição e comportamento esperado | Fonte | Check |
| --- | --- | --- | --- |
| F2-MED-1 | **Camada por família.** Para cada família de camada desconhecida (social, cotação e agregador, explorer v6, X Layer v5) executar um lote de cerca de 10 chamadas somente leitura com **parâmetros distintos** (sem cache) e **sem gateway** (cliente assinado direto), com o usuário lendo no Developer Portal os contadores Free, Basic e Premium antes e depois de cada lote (3 a 4 pares de prints, cerca de 30 a 40 chamadas) | `API-8`, A-07, D3-05 | Relatório `evidence/api-medicoes.md` com delta por camada e por lote, e os prints citados |
| F2-MED-2 | **Lote em `POST`.** Chamar `price-info` com 1 e com 5 tokens e `basic-info` com 1 e com 5 tokens, para ver se o contador sobe 1 ou N por chamada | `API-8`, A-07 | Mesmo relatório, seção lote |
| F2-MED-3 | **Limite de taxa.** Salva de chamadas gratuitas (`supported/chain`) em ritmos decrescentes de 1,1 s até no máximo 5 req/s, parando no primeiro HTTP 429 ou código 50011; o ritmo adotado é no máximo metade do ritmo seguro observado, com recuo exponencial; até lá permanece 1,1 s | `API-11`, A-03, D3-01 | Relatório com ritmo testado, primeira recusa e ritmo adotado |
| F2-MED-4 | **Tamanho e paginação.** Medir em bytes `all-tokens` (redes 1, 56 e 501), `all-token-balances-by-address` (endereço público), `cluster/list`, `memepump/tokenList` e `trades` com `limit=100`; definir teto de bytes por rota e o comportamento ao exceder: erro explícito, nunca truncar em silêncio | A-09 | Tabela de bytes por rota; teste do cliente com corpo acima do teto da rota |
| F2-MED-5 | **Contabilidade.** O catálogo ganha o campo `tierSource` (`portal`, `medido`, `assumido`) por rota; `assumido` conta como Basic; depois da medição a camada medida substitui o palpite e as projeções de orçamento são recalculadas | A-07, D-F2-5 | Teste do catálogo: toda rota tem `tierSource`; teste de contagem por camada |
| F2-MED-6 | **Reconciliação com o portal.** Depois dos lotes, comparar o contador local (`/onchain/budget`) com o do portal e registrar a diferença; os harnesses de teste usam pasta de orçamento temporária e por isso não entram no contador persistente | A-13 | Relatório com as duas contagens e a explicação da diferença |
| F2-MED-7 | **Arquivo da sonda.** A sonda de 2026-10-12 fica arquivada saneada ([probe-2026-10-12.json](evidence/probe-2026-10-12.json)); novas sondas seguem o mesmo formato (forma e código, nunca valores) e `origin: real_probe` | `API-9`, A-01, D3-06 | `tools/verify.ts` falha se o arquivo tiver campo de valor ou padrão de credencial |
| F2-MED-8 | **Escala dos percentuais ambíguos.** Comparar, para um token de cobertura boa, `cluster/overview.top100HoldingsPercent` com a soma dos `holdPercent` dos 100 primeiros de `token/holder`, e decidir se o campo é fração ou percentual; o mesmo para `bondingPercent` e `devHoldingPercent` de Trenches contra o filtro documentado de 0 a 100. Até lá os campos numéricos ambíguos **não entram na nota** (só o rótulo `Low`, `Medium`, `High`) | A-17, `D3-04` | Relatório com a conta e a decisão; vetor `V-F2-ESCALA-1` |

### 3.3 Rotas novas somente leitura (F2-OCX)

Contrato de cada rota na tabela 4.4. Toda rota nova segue o padrão do gateway e do catálogo: GET do lado local, lista de permissão fixa, validador estrito (chave extra é `bad_request`), linha com campo obrigatório quebrado é descartada (nunca zerada), campo opcional ausente é `null`, vazio válido é dado (`D3-02`), texto de terceiros passa por `cleanText`, URL só se for logo permitido (`D3-07`), nenhuma rota de escrita, assinatura ou pagamento.

| ID | Evento/condição e comportamento esperado | Fonte | Check |
| --- | --- | --- | --- |
| F2-OCX-1 | `token/toplist`: rota `/onchain/toplist` com `chains`, `sortBy` e `timeFrame` obrigatórios (`timeFrame` é exigido quando `sortBy=1`), até 100 linhas, marcada `nao_documentado` (a página não existe no índice; os parâmetros foram descobertos ao vivo) | A-04 | Fixture real saneada, validador, normalizador, vazio válido e 1 chamada ao vivo |
| F2-OCX-2 | `rwa/tokens`: rota `/onchain/rwa` com `category` obrigatório na prática, `issuer` (36 ou 37), `chainIndex`, `limit` até 100 e `cursor`; campos de ação tokenizada (`stockCode`, `stockPrice`, `peRatioTTM`) opcionais e `null` quando vazios | A-04 | idem |
| F2-OCX-3 | Trenches: `memepump/supported/chainsProtocol` (grátis, 24 h), `tokenList` (`stage` NEW, MIGRATING ou MIGRATED, até 30 por chamada), `tokenDetails`, `tokenDevInfo`, `tokenBundleInfo`, `similarToken` e `apedWallet`. `tokenDetails` exige `walletAddress` na página: o gateway envia um valor **neutro** (o próprio contrato do token) e **nunca o endereço do usuário**. Só sob demanda, só nas redes que a lista devolver | A-04, A-12 | Teste de que o endereço do usuário nunca vai ao provedor; fixtures e chamadas ao vivo |
| F2-OCX-4 | Índice e velas: `index/current-price` (POST, grátis), `index/historical-price` (GET, grátis, `cursor`) e `market/historical-candles` (Premium, até 299 por chamada) | `T3.15` | idem |
| F2-OCX-5 | Clusters em detalhe: `cluster/list` (até 100 grupos, payload grande, só sob clique) e `cluster/top-holders` (`rangeFilter` 1, 2 ou 3 para 10, 50 ou 100 detentores) | A-12, A-21 | idem |
| F2-OCX-6 | `token/basic-info` (POST em lote de até 100, TTL 24 h) para nome, decimais e marca de comunidade | A-21 | idem |
| F2-OCX-7 | X Layer v5: `chainShortName` fixo `XLAYER`, paginação `page` e `limit` (não `cursor`): `transaction/large-transaction-list`, `token/token-list`, `address/information-evm`, `address/token-balance` (`protocolType` obrigatório), `address/transaction-list` e `log/by-address`. `tz/*` e escrita no explorador ficam fora | A-04 | idem |
| F2-OCX-8 | Explorer v6 (`chainIndex`, `cursor`): `address/address-active-chain`, `address/information-evm`, `info/summary`, `info/address`, `info/transaction`, `info/stats`, `block/block-list`, `transaction/transaction-multi`, `log/by-transaction`, mais `supported-chains` por módulo. Transação confirmada tem TTL de 24 h | A-01, `T3.14` | idem |
| F2-OCX-9 | Cotação somente leitura: rota `/onchain/quote` sobre `aggregator/quote`, com no máximo 5 tamanhos por ticket (`WAL-5`) e os campos medidos (`isHoneyPot`, `taxRate`, `priceImpactPercent`, `tradeFee`, `estimateGasFee`). Nenhum botão e nenhum caminho de envio; `swap`, `approve-transaction`, `swap-instruction` e `broadcast` não entram | A-10, `API-14`, `WAL-5` | Teste de varredura sem rotas de execução; fixture e 1 chamada ao vivo |
| F2-OCX-10 | `pre-transaction/gas-price`: rota `/onchain/gas-price` (TTL 30 s), sob demanda, para o custo do ticket | `WAL-6` | idem |
| F2-OCX-11 | **Sondagem única** das famílias ausentes da lista do portal (`address-tracker/trades`, `security/*`, `defi/*`, `cross-chain/*`): uma chamada de cada, registrando `habilitada` ou `nao_habilitada` com o código; nada é presumido e rota dependente de família `nao_habilitada` fica `bloqueada` nas tarefas | A-08, `T3.8` | Tabela em `evidence/api-medicoes.md` |
| F2-OCX-12 | Regras gerais: lista de permissão fixa; nenhuma rota fora do catálogo sai da máquina; fixture **real-shaped** saneada (sem logo, URL ou endereço pessoal, endereços trocados por marcadores); teste de validador (chave extra, cadeia inválida, token inválido, limite fora da faixa); teste de normalizador com vazio válido, linha descartada e nulos; teste de que nenhuma saída contém campo de URL que não seja logo permitido | `API-4`, `API-5`, D3-07 | Os testes acima, por rota |
| F2-OCX-13 | `/onchain/trades` passa a aceitar `tagFilter` (1 a 9, os tipos de carteira de `API-5`) além de `chainIndex`, `token` e `limit`, para o fluxo de carteiras inteligentes do modo token | A-20, `API-5` | Teste de validador (tagFilter válido e inválido) e fixture |
| F2-OCX-14 | O gateway deve oferecer ao motor, **só no processo do servidor**, uma saída interna (sem rota HTTP) que devolve os sinais e os holders com endereços completos de carteira para a junção `qualidade` e o custo dos top traders; a rota HTTP continua encurtando. Implementada como `gateway.callInternal`, que também diz se aquela chamada saiu para o provedor (`sent`), base do `onchainosCalls` de `F2-DIG-4`; o formato interno de holders e top traders leva `soldAmount` e `avgSellPrice`, que o formato do navegador nunca teve (A-28) | A-26, `SMT-4` | Teste: a saída interna tem endereço completo, a rota HTTP nunca; varredura das respostas HTTP |

### 3.4 Superfícies (F2-UI)

A implementação é do integrador do instalável (zona Z8, `DOC-4`); esta SPEC só fixa onde e como não gastar.

| ID | Evento/condição e comportamento esperado | Fonte | Check |
| --- | --- | --- | --- |
| F2-UI-1 | Cada rota nova tem destino declarado na tabela 4.4 e a mesma política de chamadas de `ECO-6`: aba inativa, dock recolhido ou cópia fora de tela nunca chamam o provedor; só a fita on-chain faz poll (30 s, visível, segundo plano); tudo mais carrega uma vez por chave e de novo em Atualizar. O gráfico não pode colapsar quando uma linha da grade fica vazia (A-06) | `ECO-6`, A-06, `D3-08` | Testes de política (inativa, fora de tela, aborto por troca de chave); teste de layout com `/jev-read` fora do ar |
| F2-UI-2 | O seletor de ativos on-chain ganha a categoria RWA (filtros de emissor e categoria) e Trenches por estágio (NEW, MIGRATING, MIGRATED), cada um com rótulo de origem e idade | D-F2-6, `CHN-2` | Teste de render por estado; captura |
| F2-UI-3 | Tokens de RWA e de Trenches entram nos candidatos do "Pedir ao Inonu" como `tipo: token` (sem tipo novo) | `ASK-4`, `T7.2` | Teste de candidatos |
| F2-UI-4 | Nulo é "Indisponivel", vazio válido tem linha neutra própria e erro tem texto por código; nenhum número sem origem e idade | `DAT-2`, A-05 | Teste de render por estado, varredura tipográfica |
| F2-UI-5 | Em qualquer redimensionamento da janela o estado de layout segue a mudança e o foco on-chain não é perdido (A-22) | A-22, `D3-08` | Teste de redimensionamento nos 4 tamanhos; captura antes e depois |

### 3.5 Governança (F2-GOV)

| ID | Evento/condição e comportamento esperado | Fonte | Check |
| --- | --- | --- | --- |
| F2-GOV-1 | Toda evidência fica arquivada nesta pasta (`evidence/`), saneada, nunca só em `.scratch/` (ignorada pelo git) | A-01 | `tools/verify.ts` confere a existência dos arquivos citados |
| F2-GOV-2 | Nenhum segredo, valor de credencial ou endereço de carteira pessoal em documento, fixture ou captura; endereços de exemplo são públicos e conhecidos ou marcadores; o bundle de produção é varrido por padrões das três credenciais | `API-1`, `CFG-3` | `tools/verify.ts` varre os documentos; varredura do bundle é teste de `AC-API-1` |
| F2-GOV-3 | Credenciais: a ordem segura é cofre, depois remoção do texto puro (`T2.4`), depois chave nova no portal; esta SPEC não executa nenhum passo e recomenda a rotação porque chave, segredo e passphrase passaram por conversa e imagens | A-15 | Registro no CHECKPOINT quando o usuário fizer |
| F2-GOV-4 | Antes de cada onda registrar a linha de base de testes com a lista de falhas intermitentes sob carga (`wallet-transaction-preflight`, fila de `client.test.ts`, `okx-defi` D5 e D7, `okx-signals` sintético); falha nova roda isolada antes de ser acusada; os testes de pureza do bundle (`DAT-1`) e de contrato contra servidor real (`SRC-4`) entram na linha de base | A-16, `T0.5` | Saída guardada por onda |
| F2-GOV-5 | Antes de qualquer tarefa de código: `git status --short -- <caminho>` nas duas árvores e leitura de [OWNERSHIP.md](../../inonu-desktop-v1/OWNERSHIP.md); arquivo de zona quente só pelo integrador; commit só dos caminhos próprios, nunca `git add -A`; visibilidade do repositório e commits continuam decisão do usuário | `QLT-7` | Log de `git status` por tarefa |

## 4. Tabelas de contrato e orçamento

### 4.1 Fonte de cada componente da trilha (F2-DIG-1)

Componentes em 0 a 1; `null` quando a fonte não respondeu. Fórmulas de [flow-engine.md](../../inonu-desktop-v1/flow-engine.md) seção 4, com as adaptações medidas.

| Componente | Fonte (rota local) | Cálculo | Escala e cuidado |
| --- | --- | --- | --- |
| `compra` | `/onchain/signals` do token | `boughtComponent(soma(amountUsd x (1 - soldRatioPct/100)), conjunto)` | `soldRatioPct` em percentual 0 a 100 (A-17); `conjunto` são os mesmos valores dos outros tokens em cache da rede (`hot-tokens`); sem conjunto, ausente com motivo `sem_conjunto` |
| `carteiras` | `/onchain/signals` | `walletsComponent(soma de walletCount)` | limite superior, porque uma carteira pode aparecer em vários sinais; endereços só no servidor (F2-DIG-11) |
| `naoVendida` | `/onchain/signals` | `unsoldComponent(lista de soldRatioPct)` | percentual 0 a 100 |
| `qualidade` | `/onchain/leaderboard` junto da saída interna de F2-OCX-14 | média de `winRatePct` / 100 das carteiras do token que estão no leaderboard em cache | só no servidor; sem junção, ausente com motivo `sem_enderecos` |
| `concentracao` | `/onchain/clusters` e `/onchain/token-risk` | `concentrationComponent({cluster: adaptador(concentration), top10HolderPercent: top10HoldPct})` | adaptador `Low` para `baixa`, `Medium` para `media`, `High` para `alta`; `top10HoldPct` em percentual 0 a 100; campos numéricos de cluster ficam fora da nota até `F2-MED-8` |
| `risco` | `/onchain/token-risk` e `/onchain/quote` | `(5 - nivel) / 5` para nível 1 a 5; nível 0 (indefinido) fica ausente com motivo `nivel_indefinido`; `honeypot` verdadeiro (etiqueta `honeypot` ou `isHoneyPot` da cotação) zera a nota inteira | escala documentada de 0 a 5 (A-19); as flags derivadas usam limiares configuráveis e registrados (priors, não alegam desempenho): topo 10 acima de 50, LP queimado abaixo de 50, devs com rug acima de 0; dev acima de 10, bundlers acima de 20, snipers acima de 10 e suspeitos acima de 10 **só valem depois de `F2-MED-8`** (a escala desses quatro não foi medida): até lá nenhuma flag sai deles e `nulos` registra `escala_ambigua` |
| `liquidez` | `/onchain/price-info` e `/onchain/pools` | `min(1, liquidityUsd / P75 do conjunto)` | `liquidityUsd` do `price-info`; se ausente, soma dos pools |
| `fluxo` | `/onchain/trades` (volume em USD por lado, com e sem `tagFilter=3`) e, na falta, `txsBuy` e `txsSell` do `hot-tokens` | `buyShare = compra / (compra + venda)` | rotulado aproximação (`FLX-9`, `aprox: true`) |
| `sentimento` | `/onchain/sentiment` | `bullishRatio` | só com símbolo inequívoco (F2-DIG-6); razão em fração 0 a 1 (`"0.40"`) |

### 4.2 Plano do modo token (F2-DIG-4)

Cada linha é uma chamada planejada. "Camada" é a do gateway (`Basic*` é camada desconhecida contada como Basic até `F2-MED-1`). "Hoje" diz se a rota já existe no gateway.

| # | Rota local | Camada | Hoje |
| --- | --- | --- | --- |
| T1 | `/onchain/search` (só se o pedido trouxer símbolo) | Basic | sim |
| T2 | `/onchain/price-info` (o token pedido; o lote com BTC, ETH, SOL e o nativo da rede espera a rota aceitar lista, `F2-MED-2`) | Premium | sim |
| T3 | `/onchain/candles` (barra 1H) | Basic | sim |
| T4 | `/onchain/trades` (sem filtro) | Basic | sim |
| T5 | `/onchain/trades` (`tagFilter=3`) | Basic | não (F2-OCX-13) |
| T6 | `/onchain/signals` (por token) | Premium | sim |
| T7 | `/onchain/top-traders` (`tagFilter=3`) | Premium | sim |
| T8 | `/onchain/token-risk` | Premium | sim |
| T9 | `/onchain/pools` | Basic | sim |
| T10 | `/onchain/clusters` | Premium | sim |
| T11 | `/onchain/cluster-top-holders` | Premium | não (F2-OCX-5) |
| T12 | `/onchain/sentiment` | Basic* | sim |
| T13 | `/onchain/quote` | Basic* | não (F2-OCX-9) |

Totais modo token: 13 chamadas, 5 Basic, 6 Premium, 2 desconhecida.

Diferença frente ao `ADR-6`: a lista do ADR-6 tem 12 itens (5 Basic, 6 Premium e o sentimento, de camada desconhecida) e aqui ganha uma 13ª chamada, `T13` (`aggregator/quote`, camada desconhecida), para trazer `isHoneyPot` e `taxRate` ao componente `risco` (`F2-OCX-9`, `WAL-5`). Sem a cotação o plano volta a 12 chamadas.

### 4.3 Plano do modo descoberta (F2-DIG-4)

| # | Rota local | Camada | Hoje |
| --- | --- | --- | --- |
| D1 | `/onchain/hot-tokens` (por entrada líquida) | Basic | sim |
| D2 | `/onchain/signals` (por rede) | Premium | sim |
| D3 | `address-tracker/trades` (só se `F2-OCX-11` achar a família habilitada) | Basic* | não |
| D4 | `/onchain/trenches` (só nas redes listadas por `chainsProtocol`) | Premium | não (F2-OCX-3) |
| D5 | `/onchain/price-info` (lote da lista curta) | Premium | sim |
| D6 | `/onchain/token-risk` (melhor 1) | Premium | sim |
| D7 | `/onchain/token-risk` (melhor 2) | Premium | sim |
| D8 | `/onchain/token-risk` (melhor 3) | Premium | sim |
| D9 | `/onchain/clusters` (melhor 1) | Premium | sim |
| D10 | `/onchain/clusters` (melhor 2) | Premium | sim |
| D11 | `/onchain/clusters` (melhor 3) | Premium | sim |
| D12 | `/onchain/pools` (melhor 1) | Basic | sim |
| D13 | `/onchain/pools` (melhor 2) | Basic | sim |
| D14 | `/onchain/pools` (melhor 3) | Basic | sim |

Totais modo descoberta: 14 chamadas, 4 Basic, 9 Premium, 1 desconhecida.

**Capacidade por mês** (só estes pedidos, a 100 por cento do teto e sem nenhum outro uso): com o teto padrão de 50.000 por camada e a camada desconhecida contada como Basic, o modo token comporta 7.142 pedidos (7 Basic efetivos por pedido; o Premium comportaria 8.333) e o modo descoberta 5.555 (9 Premium por pedido; o Basic efetivo comporta 10.000). Com a cota gratuita inteira de 100.000, o dobro. Tempo mínimo por pedido sem cache: a primeira chamada sai na hora e as seguintes a cada 1,1 s, ou seja cerca de 13,2 s no modo token (12 intervalos) e 14,3 s no modo descoberta (13 intervalos), mais a latência de cada resposta.

### 4.4 Contrato das rotas novas (F2-OCX) e destino (F2-UI)

`Camada` é a do catálogo de pesquisa `docs/research/R6-onchain-os-catalogo.json` ou, onde ele não diz, `Basic*` (desconhecida, conta como Basic). `TTL` é proposta, a confirmar na medição. Obrigatórios e opcionais saem das páginas arquivadas em [docs-params-2026-10-12.json](evidence/docs-params-2026-10-12.json), salvo `toplist`, descoberto ao vivo.

| Rota local | Provedor e método | Obrigatórios | Opcionais aceitos | Camada | TTL | Teto | Destino |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `/onchain/toplist` | `market/token/toplist` GET | `chains`, `sortBy`, `timeFrame` | nenhum | Basic* | 5 min | 100 linhas | seletor de ativos, universo do Radar |
| `/onchain/rwa` | `market/rwa/tokens` GET | `category` (na prática) | `issuer`, `chainIndex`, `limit`, `cursor` | Premium | 5 min | 100 | seletor RWA, Radar |
| `/onchain/trenches-chains` | `memepump/supported/chainsProtocol` GET | nenhum | nenhum | Free | 24 h | n/a | Radar |
| `/onchain/trenches` | `memepump/tokenList` GET | `chainIndex`, `stage` | `protocolIdList` e filtros min/max (0 a 100) | Premium | 2 min | 30 | Radar |
| `/onchain/trench-details` | `memepump/tokenDetails` GET | `chainIndex`, `token` (envia valor neutro em `walletAddress`) | nenhum | Premium | 5 min | 1 | Radar, cartão do token |
| `/onchain/trench-dev` | `memepump/tokenDevInfo` GET | `chainIndex`, `token` | nenhum | Premium | 5 min | 1 | Radar, cartão do token |
| `/onchain/trench-bundle` | `memepump/tokenBundleInfo` GET | `chainIndex`, `token` | nenhum | Premium | 5 min | 1 | Radar, cartão do token |
| `/onchain/trench-similar` | `memepump/similarToken` GET | `chainIndex`, `token` | nenhum | Basic | 10 min | lista curta | Radar, cartão do token |
| `/onchain/trench-aped` | `memepump/apedWallet` GET | `chainIndex`, `token` | nenhum (sem `walletAddress` do usuário) | Premium | 5 min | lista | Radar, cartão do token |
| `/onchain/index-price` | `index/current-price` POST | `chainIndex`, `token` | lote | Free | 30 s | 100 por lote | gráfico on-chain |
| `/onchain/index-history` | `index/historical-price` GET | `chainIndex` | `token`, `limit`, `cursor`, `begin`, `end`, `period` | Free | 10 min | 200 | gráfico on-chain |
| `/onchain/candles-history` | `market/historical-candles` GET | `chainIndex`, `token` | `after`, `before`, `bar`, `limit` | Premium | 15 min | 299 | gráfico on-chain |
| `/onchain/cluster-list` | `cluster/list` GET | `chainIndex`, `token` | nenhum | Premium | 15 min | 100 grupos | Radar, sob clique |
| `/onchain/cluster-top-holders` | `cluster/top-holders` GET | `chainIndex`, `token`, `rangeFilter` (1 a 3) | nenhum | Premium | 15 min | 1 | digest, Radar |
| `/onchain/token-info` | `token/basic-info` POST | `chainIndex`, `token` | lote | Basic | 24 h | 100 por lote | seletor, ícones (`ICO-4`) |
| `/onchain/xlayer/large-transfers` | `xlayer/transaction/large-transaction-list` GET | (`chainShortName` fixo) | `type`, `height`, `page`, `limit` | Basic* | 1 min | 100 | Radar, fluxo de baleias |
| `/onchain/xlayer/tokens` | `xlayer/token/token-list` GET | (fixo) | `protocolType`, `tokenContractAddress`, `orderBy`, `page`, `limit` | Basic* | 10 min | 100 | seletor X Layer |
| `/onchain/xlayer/address` | `xlayer/address/information-evm` GET | `address` | nenhum | Basic* | 5 min | 1 | Carteira em 196 |
| `/onchain/xlayer/address-balance` | `xlayer/address/token-balance` GET | `address`, `protocolType` | `tokenContractAddress`, `page`, `limit` | Basic* | 5 min | 100 | Carteira em 196 |
| `/onchain/xlayer/address-txs` | `xlayer/address/transaction-list` GET | `address` | filtros de bloco, `page`, `limit` | Basic* | 5 min | 100 | Carteira em 196 |
| `/onchain/xlayer/logs` | `xlayer/log/by-address` GET | `address` | nenhum | Basic* | 5 min | n/a | forense sob demanda |
| `/onchain/explorer/active-chains` | `explorer/address/address-active-chain` GET | `address` | nenhum | Basic | 5 min | 1 | Carteira |
| `/onchain/explorer/address` | `explorer/address/information-evm` GET | `chainIndex`, `address` | nenhum | Basic | 5 min | 1 | forense sob demanda |
| `/onchain/explorer/chain-summary` | `explorer/info/summary` GET | nenhum | `chainIndex` | Basic | 5 min | n/a | Doctor, Radar (saúde da rede) |
| `/onchain/explorer/chain-activity` | `explorer/info/address`, `info/transaction`, `info/stats` GET | `chainIndex` | `startTime`, `endTime`, `cursor`, `limit` (stats) | Basic | 5 min a 1 h | n/a | Radar (saúde da rede) |
| `/onchain/explorer/blocks` | `explorer/block/block-list` GET | `chainIndex` | `height`, `cursor`, `limit` | Basic | 1 min | 100 | forense sob demanda |
| `/onchain/explorer/tx` | `explorer/transaction/transaction-multi` GET | `chainIndex`, `txId` | nenhum | Basic | 24 h | lote | forense sob demanda |
| `/onchain/explorer/tx-logs` | `explorer/log/by-transaction` GET | `chainIndex`, `txId` | nenhum | Basic | 24 h | 1 | forense sob demanda |
| `/onchain/quote` | `aggregator/quote` GET | `chainIndex`, `amount`, `fromTokenAddress`, `toTokenAddress` | nenhum (sem `dexIds`, `feePercent`) | Basic* | 15 s | 5 tamanhos por ticket | Carteira (ticket), digest |
| `/onchain/gas-price` | `pre-transaction/gas-price` GET | `chainIndex` | nenhum | Basic* | 30 s | 1 | Carteira (ticket) |
| `/onchain/trades` (extensão) | `market/trades` GET | `chainIndex`, `token` | `limit`, `tagFilter` (1 a 9) | Basic | 15 s | 100 | Fita, digest |

## 5. Aceitação independente

Cada AC é verificável por quem não implementou. Evidência exigida é execução real, leitura do alvo ou captura; "documento escrito" nunca fecha um AC de código. O estado de evidência exigido (configuração válida, sessão nova, ao vivo, ganho medido) está na terceira coluna.

| AC | Requisitos | Estado de evidência exigido | Resultado observável |
| --- | --- | --- | --- |
| AC-F2-DIG-1 | F2-DIG-1, F2-DIG-2, F2-DIG-3, F2-DIG-11 | configuração válida | Cada componente da trilha calcula com a fonte presente, vazia, não consultada e com erro; o adaptador de concentração traduz os três rótulos; o mapa dos três estados cobre todo código do envelope; o Brief não tem endereço de carteira |
| AC-F2-DIG-2 | F2-DIG-4, F2-DIG-5, F2-DIG-10 | configuração válida | O plano do modo token tem 13 chamadas e o do modo descoberta 14; um plano de 16 é cortado; `onchainosCalls` conta só chamadas enviadas; nenhum pedido sai sem clique; o modelo real não é chamado |
| AC-F2-DIG-3 | F2-DIG-6, F2-DIG-7 | configuração válida | Símbolo ambíguo deixa `sentimento` ausente; etiqueta desconhecida e texto injetado são descartados e contados; nenhuma notícia, apelido ou nome de pool entra no Brief |
| AC-F2-DIG-4 | F2-DIG-8, F2-DIG-9 | configuração válida | O TypeScript reproduz os vetores de ouro com tolerância 1e-9; o Brief de exemplo mede menos de 2.048 bytes e o excesso vira erro, não truncamento |
| AC-F2-MED-1 | F2-MED-1, F2-MED-2, F2-MED-6 | funcionando ao vivo | Relatório com deltas por camada e por lote e os prints do usuário; contador local comparado ao do portal. Sem os prints o AC fica **aberto** |
| AC-F2-MED-2 | F2-MED-3, F2-MED-4 | funcionando ao vivo | Ritmo testado e primeira recusa registrados; bytes por rota medidos; teto por rota com erro explícito |
| AC-F2-MED-3 | F2-MED-5, F2-MED-8 | configuração válida e ao vivo | Toda rota tem `tierSource`; a escala dos percentuais ambíguos foi decidida por conta registrada |
| AC-F2-MED-4 | F2-MED-7, F2-GOV-1 | configuração válida | O arquivo da sonda existe, é saneado e passa na varredura do verificador |
| AC-F2-OCX-1 | F2-OCX-1, F2-OCX-2, F2-OCX-4, F2-OCX-6 | configuração válida e ao vivo | Cada rota tem fixture real-shaped, teste de validador, de normalizador (com vazio válido) e uma chamada ao vivo registrada |
| AC-F2-OCX-2 | F2-OCX-3, F2-OCX-5, F2-OCX-14 | configuração válida e ao vivo | O endereço do usuário nunca chega ao provedor em Trenches; a saída interna tem endereço completo e a rota HTTP nunca |
| AC-F2-OCX-3 | F2-OCX-7, F2-OCX-8, F2-OCX-9, F2-OCX-10, F2-OCX-11, F2-OCX-12, F2-OCX-13 | configuração válida e ao vivo | X Layer e explorer respondem com a paginação correta de cada um; a cotação não tem caminho de execução; a sondagem das famílias ausentes está registrada; `trades` aceita `tagFilter` |
| AC-F2-UI-1 | F2-UI-1, F2-UI-4, F2-UI-5 | configuração válida e ao vivo | Aba inativa ou fora de tela não chama; redimensionar não perde foco nem layout; gráfico não colapsa com `/jev-read` fora do ar; capturas nos 4 tamanhos sem corte |
| AC-F2-UI-2 | F2-UI-2, F2-UI-3 | configuração válida | RWA e Trenches aparecem no seletor e nos candidatos como `token` |
| AC-F2-GOV-1 | F2-GOV-2, F2-GOV-3, F2-GOV-4, F2-GOV-5 | configuração válida | Varredura sem segredo; linha de base de testes registrada por onda; log de `git status` por tarefa |
| AC-F2-DOC-1 | todos | configuração válida | `tools/verify.ts` sai com 0; os hashes dos 13 arquivos congelados do instalável são os do baseline; parecer independente sem bloqueador aberto |

## 6. Exclusões, riscos e decisões

**Exclusões:** pagamento x402 e assinatura do provedor; difusão de transação; Agentic Wallet; MCP e Skills em runtime; `swap`, `approve-transaction`, `swap-instruction`, `broadcast-transaction`, `intent/*`; verificação de contrato no explorador; rede `tz` da X Layer (50038); `address-tracker`, `security`, `defi` e `cross-chain` enquanto `F2-OCX-11` não achar a família habilitada; chamada ao modelo real (`T7.8`); sincronização do relógio do Windows (ação do usuário); commit e push.

| Risco | Impacto | Mitigação |
| --- | --- | --- |
| Outra sessão muda a SPEC, as TASKS ou o catálogo enquanto isto é lido | Adendo desatualizado | Baseline de hashes no README e em `evidence/`; reler antes de usar |
| Camada de cobrança diferente da assumida | Orçamento errado | `F2-MED-1` e `tierSource`; teto mensal e ritmo diário protegem a cota até lá |
| Escala ambígua de percentuais | Nota da trilha errada | `F2-MED-8` e campos ambíguos fora da nota |
| Símbolo de outro token | Sentimento errado | `F2-DIG-6` |
| Resposta maior que o teto do cliente (2 MB) | Chamada recusada sem aviso | `F2-MED-4` |
| Família não habilitada para a chave | Tarefa bloqueada | `F2-OCX-11` |
| Texto de terceiros no modelo | Injeção de instrução | `F2-DIG-7` |
| Endereço de carteira exposto | Privacidade | `F2-DIG-11`, `F2-OCX-14` |

## 7. Histórico de mudanças desta SPEC

| Data | Mudança | Motivo |
| --- | --- | --- |
| 2026-10-13 | Aprovada pelo usuário | Resposta "Aprovar, seguir as próximas etapas do planejamento" |
| 2026-10-13 | `F2-DIG-3` ganha o motivo `nao_pedido` | O digest precisa distinguir a fonte que o plano não pediu da que foi cortada pelo teto |
| 2026-10-13 | `F2-DIG-7`: o limite de tamanho da etiqueta passa de 32 para 40 | Achado A-30: `dexScreenerTokenCommunityTakeOver` tem 33 caracteres e era descartada pelo gateway |
| 2026-10-13 | Tabela 4.1, `risco`: as flags de dev, bundlers, snipers e suspeitos esperam `F2-MED-8` | Achado A-17: a escala desses quatro campos não foi medida; derivar flag de um número de escala incerta seria inventar |
| 2026-10-13 | `F2-DIG-2`: `fluxo.custo` | A chamada de top traders (T7) e o preço (T2) não alimentavam nada; o custo dos sinais contra o preço agora é o que elas já pagam |
| 2026-10-13 | Tabela 4.2, T2: só o token pedido | A rota `price-info` aceita um token por chamada; o lote espera `F2-MED-2` |
| 2026-10-13 | `F2-OCX-14`: `callInternal` e o aviso `sent` | A contagem de `onchainosCalls` precisa saber se aquela chamada saiu, e um contador de orçamento compartilhado não sabe |

Congelamento: esta pasta não se congela por si; o adendo só passa a valer como revisão r3 da SPEC do instalável depois da decisão do usuário e de `freeze.ts --freeze --revision r3`.
