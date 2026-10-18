# Adendo: proposta de revisão 3 da SPEC do instalável

Este arquivo **não edita** nada em [inonu-desktop-v1](../../inonu-desktop-v1/README.md). A SPEC e os ADRs estão congelados na revisão **r2** (2026-10-13, 13 arquivos; ver [README](README.md#baseline-contra-a-spec-do-instalável) e [baseline-hashes.json](evidence/baseline-hashes.json)). Cada delta abaixo traz o alvo, o motivo (achado de [ACHADOS.md](ACHADOS.md)), o texto proposto pronto para colar e o impacto em tarefas e critérios. Aceitar um delta é decisão do usuário (ou da sessão dona, c38db1) seguida de nova revisão congelada com histórico (`tools/freeze.ts --freeze --revision r3`). Se o baseline mudar, reler antes de usar.

Itens que mexem em `PLAN.md`, `TASKS.md`, `OWNERSHIP.md` e `CHECKPOINT.md` (não congelados) podem ser aplicados direto pela sessão dona; os que mexem na SPEC, nos ADRs ou na cobertura exigem a nova revisão.

## D3-01 Ritmo e recuo do limitador (`API-11`)

- **Motivo:** A-03. O portal publica 3 req/s (Trade) e 5 req/s (Market, explorer, X Layer v5), e o requisito atual diz "cerca de 1 por segundo até medir". O gateway hoje só tem espera fixa de 30 s em 429 (`src/onchain-read/client.ts`).
- **Texto atual:** "O limitador deve manter cerca de 1 requisição por segundo por chave com recuo exponencial em 50011 até a medição de limite real".
- **Texto proposto:** "O limitador deve manter, por chave, no máximo 1 requisição a cada 1,1 s enquanto o limite real não for medido (`F2-MED-3`). O limite publicado no portal (Trade 3 req/s; Market, explorer e X Layer v5 5 req/s) é teto superior e nunca meta. Em 50011 ou HTTP 429 o limitador recua de forma exponencial (base 1,1 s, dobrando até 30 s) e responde `rate_limited`. Depois da medição o ritmo adotado é no máximo metade do ritmo seguro observado, registrado em `evidence/api-medicoes.md`."
- **Impacto:** `T3.4` (recuo exponencial no lugar da espera fixa), `T3.8` (medição), `AC-API-3`. Nenhuma mudança de ritmo antes da medição.

## D3-02 Envelope e vazio válido (`API-12`, `SRC-2`)

- **Motivo:** A-02 e A-05. `clock_skew` já existe no gateway e na web; o vazio legítimo do provedor virava `schema`.
- **Texto atual (`API-12`):** "O envelope do gateway deve acrescentar aos códigos existentes (...) apenas `backend_sem_rota` e `origem_negada` (...)".
- **Texto proposto (`API-12`):** "O envelope do gateway deve acrescentar aos códigos existentes `backend_sem_rota`, `origem_negada` e `clock_skew` (50102 que persiste depois de uma nova tentativa com o desvio de relógio aprendido), reusando os existentes para cota e taxa e nunca repassando mensagem bruta do provedor."
- **Texto proposto (acrescentar a `SRC-2`):** "Uma resposta do provedor com envelope válido e conteúdo legitimamente vazio (lista vazia, `details: []`, objeto sem dados) nunca é 'fora do contrato': sai como `ok` com lista vazia ou `data: null`, entra no cache e a interface mostra uma linha neutra ('Sem sentimento para este simbolo'). 'Fora do contrato' só para envelope que não é objeto, tipo errado ou linha com campo obrigatório quebrado, e registra rota e campo no diagnóstico."
- **Nota de nomes (A-27):** a implementação de `T4.1` em `web/src/lib/onchain/client.ts:354` e `web/src/lib/onchain/client.ts:355` usa `backend_stale` (404 sem envelope) e `origin_denied` (403) como códigos do **cliente**, não do envelope, porque o gateway nunca responde em nome de uma rota que não existe. Proposta: manter os nomes do cliente e **remover** `backend_sem_rota` e `origem_negada` do texto de `API-12`, deixando no envelope só `clock_skew` como código novo.
- **Impacto:** `T4.1`, `AC-API-1`, `AC-SRC-1`. Já coberto por testes em `src/onchain-read/catalog.test.ts` e `web/src/lib/onchain/client.test.ts` para as rotas atuais.

## D3-03 Relógio assinado e desvio bruto (`API-2`, `WIN-8`)

- **Motivo:** A-14. Dois mecanismos corrigem a assinatura e, com `now` injetado, o `clockOffsetMs` do gateway tende a 0, escondendo o aviso de Configurações.
- **Texto proposto (acrescentar a `API-2`):** "O relógio assinado é sempre o corrigido (`okxNowMs()` ou o desvio aprendido pelo gateway pelo cabeçalho `Date`). O desvio **bruto** da máquina é diagnóstico e tem um único dono: o Doctor (`WIN-8`) mede e exibe o aviso 'sincronize o horario do Windows'. Quando o núcleo desktop injeta um `now` já corrigido, Configurações lê o desvio bruto de `okxClockStatus().offsetMs` (exposto pelo núcleo) e não de `clockOffsetMs` do gateway. Um 50102 que persiste depois da nova tentativa vira `clock_skew`, nunca 'credencial recusada'."
- **Impacto:** `T3.2` (nota), `T1.8`, `T2.3` (tela de Configurações), `AC-API-2`, `AC-WIN-5`. Código novo: leitura do desvio bruto em Configurações (tarefa do integrador).

## D3-04 Divergências medidas (`API-5`)

- **Motivo:** A-04, A-17 e A-18.
- **Texto proposto (acrescentar a `API-5`):** "Divergências adicionais medidas ao vivo em 2026-10-12: a chave `ClusterConcentration` (resposta real) contra `clusterConcentration` (exemplo da página); `rwa/tokens` exige `category` na prática; `market/token/toplist` exige `chains`, `sortBy` e `timeFrame` e não tem página no índice; `memepump/tokenList` identifica o token por `tokenAddress` e `tokenDetails` exige `walletAddress`; X Layer v5 usa `chainShortName=XLAYER` com `page` e `limit`, e o explorer v6 usa `chainIndex` com `cursor`; a escala dos percentuais difere por endpoint (`advanced-info.top10HoldPercent` e `memepump tags.top10HoldingsPercent` em percentual 0 a 100, `cluster/overview.top100HoldingsPercent` parece fração 0 a 1) e cada campo carrega `escala` (`pct100`, `fracao` ou `ambigua`); o rótulo de concentração do provedor é `Low`, `Medium`, `High` e o componente da trilha usa `baixa`, `media`, `alta` (adaptador explícito); `riskControlLevel` e `riskLevelControl` usam a mesma escala documentada de 0 a 5."
- **Impacto:** `T3.3` (um teste por divergência), `AC-API-4`, `T6.3` (a nota "escala de `riskControlLevel` não verificada" passa a "documentada, medida em 1 e 2").

## D3-05 Procedimento de medição (`API-8`, `T3.8`)

- **Motivo:** A-07 e A-13. O consumo por camada só aparece no portal.
- **Texto proposto (acrescentar a `API-8`):** "A medição segue `F2-MED-1` a `F2-MED-6` da SPEC da Fase 2: lotes de cerca de 10 chamadas somente leitura por família, com parâmetros distintos e sem cache, e o usuário lê os contadores Free, Basic e Premium do Developer Portal antes e depois de cada lote. Camada não medida continua contada como Basic (`tierSource: assumido`)."
- **Impacto:** `T3.8` (dependência nova: prints do usuário), `AC-API-6`.

## D3-06 Arquivo das sondas reais (`API-9`)

- **Motivo:** A-01. A evidência original estava em `.scratch/` (ignorada pelo git).
- **Texto proposto (acrescentar a `API-9`):** "Cada sonda real é arquivada em `evidence/` com forma e código, nunca valores de dados (modelo: [probe-2026-10-12.json](evidence/probe-2026-10-12.json)), rótulo `origin: real_probe` e o plano em uso."
- **Impacto:** `T3.9` a `T3.15`; nada a refazer: o arquivo de 2026-10-12 cobre 124 chamadas.

## D3-07 Política de logos (`ICO-2`)

- **Motivo:** A-24. O catálogo descarta URLs e os testes do gateway afirmam "sem http".
- **Estado atual (A-24):** `src/inonu/icons.ts` já serve ícones de moeda por símbolo (`T3.5` e `T4.3` "parcial"); o que falta é o gateway encaminhar logos de token e de rede.
- **Texto proposto (acrescentar a `ICO-2`):** "A decisão vale **só para logos** (`tokenLogoUrl`, `chainLogoUrl`, `logoUrl`, `logo`). Links de notícia, avatares de KOL, URLs de tweet e qualquer outro campo de URL continuam descartados. O gateway passa a repassar logos sanitizados (`https` e host em `static.okx.com`, `static.oklink.com` ou `static.coinall.ltd`, que foram os hosts vistos nas respostas reais); os testes que hoje afirmam 'sem http' passam a afirmar que todo campo de URL na saída é um logo permitido e que `cleanText` nunca carrega URL."
- **Impacto:** `T3.5`, testes de `src/onchain-read/catalog.test.ts` (asserções de `http`), `AC-ICO-2`.

## D3-08 Mapa de realocação das superfícies (`DOC-3`, `DOC-4`)

- **Motivo:** A-06, A-22 e a [RECONCILIACAO](RECONCILIACAO.md) seção 4. O painel de 9 abas ganhou superfícies on-chain que a SPEC quer em 5 abas.
- **Texto proposto (acrescentar a `info-diet.md` seção 3 ou a `DOC-4`):**

| Superfície atual (componente) | Destino nas 5 abas | Observação |
| --- | --- | --- |
| Smart money, Traders e Holders (`SmartMoneyTab`, `TradersTab`, `HoldersTab`) | **Radar**, lista curta ordenada por nota | já respeitam a política de chamadas por aba ativa |
| Cartão Estrutura e risco (`RiskCard`) | **Radar**, detalhe do token selecionado | usa `token-risk` e `clusters` |
| Janelas e Pools (`OnchainLiquidityTab`) | **Radar** (métricas do token) e **Mercado bruto** (Liquidez) | só com foco on-chain |
| Fita on-chain (`OnchainTapeTab`) | **Mercado bruto**, aba Fita em modo on-chain | único que faz poll (30 s) |
| Notícias e sentimento (`EcoNewsSection`) | **Radar**, gaveta "Noticias e sentimento" | a aba Ecossistema deixa de existir (`DOC-3`); a linha de estado do orçamento vai para o Doctor |

- **Texto proposto (acrescentar a `DOC-4`):** "Em qualquer redimensionamento da janela o estado de layout (`narrow`) segue a mudança e o foco on-chain não é perdido; teste de redimensionamento cobre os dois." 
- **Impacto:** `T4.4`, `T4.6`, `T10.4`, `AC-DOC-2`, `AC-INF-1`. A realocação é trabalho do integrador (zona Z8).

## D3-09 Troca de "Jev" por "Inonu" nas telas novas (`ASK-10`)

- **Motivo:** A-23.
- **Texto proposto (acrescentar a `ASK-10`):** "A varredura inclui as telas das rotas `ECO` (Fita, Liquidez e Holders on-chain, Ecossistema, gráfico on-chain) e os testes fixados correspondentes. Ocorrências conhecidas: `web/src/components/Desk/Dock/OnchainDeskTabs.tsx:306` ('o Jev nao le esta aba'), `web/src/components/Desk/Dock/OnchainTabs.tsx:292` ('Nao e decisao do Jev'), `web/src/components/Desk/panels/PriceChart.tsx:487` e `:938` ('O Jev nao le este mercado' e 'O Jev nao le este ativo'), e os testes `web/src/lib/desk/ui/onchain-desk-render.test.tsx:236` e `web/src/lib/desk/ui/panels-render.test.tsx:747`. A proveniência 'modelo: Jev' do cartão de decisão não muda."
- **Impacto:** `T7.9`.

## D3-10 Promoção de decisões na matriz de cobertura (`API-6`)

- **Motivo:** A-01, A-04, A-12. A sonda mostrou que estes caminhos respondem com a chave do projeto. A matriz do instalável (`onchainos-coverage.*`) é gerada por regras em `tools/okx-coverage.ts`.
- **Mudanças propostas nas regras (gerar de novo com a revisão r3):**

| Regra atual | Decisão atual | Decisão proposta | Motivo |
| --- | --- | --- | --- |
| `mkt-meme` | sob-demanda, só Solana e BNB | sob-demanda, nas redes que `memepump/supported/chainsProtocol` listar (7 medidas) | A-12 |
| `mkt-rwa` | depois | sob-demanda (`rwa/tokens` responde com `category`) | A-04 |
| `mkt-token-cluster` | depois | sob-demanda para `cluster/list` e `cluster/top-holders`, só sob clique | A-12 |
| `mkt-od-info` | fora | sob-demanda para `info/summary`, `info/address`, `info/transaction`, `info/stats` | A-01 |
| `mkt-od-later` | depois | sob-demanda para `block-list`, `block-fills`, `transaction-list`, `log/by-transaction`; o resto continua depois | A-01 |
| `xl-data-unique` | depois | sob-demanda para `large-transaction-list`, `token-list`, `address/information-evm`, `address/token-balance`, `address/transaction-list`, `log/by-address` | A-01, A-04 |
| `xl-tz` | fora | fora (50038 medido para `tz/*`) | A-01 |
| `xl-out` | fora | fora para escrita no explorador (`contract/verify-*`) | n/a |

- **Impacto:** `AC-API-5` (`okx-coverage.ts --check` continua com 0 páginas sem decisão), `T3.1`.

## D3-11 Estado das tarefas (`TASKS.md`)

- **Texto proposto:** atualizar a coluna Estado, sem mudar critério: `T3.3` "normalizadores existem no catálogo; falta teste por divergência de `API-5`"; `T3.9` parcial (falta `basic-info`); `T3.10` parcial (faltam `cluster/top-holders` e `cluster/list`); `T3.11` parcial (falta `address-tracker/trades`, A-08); `T3.13` feito; `T3.15` feito (sem `tagFilter`, A-20); `T4.4` feito com capturas LIVE; `T5.6` elegível (rotas existem); `T4.7` busca já responde ao vivo. Tabela completa em [RECONCILIACAO.md](RECONCILIACAO.md) seção 2.
- **Impacto:** nenhum critério; só status. Aplicável direto pela sessão dona (arquivo não congelado).

## D3-12 Riscos novos (`SPEC` seção 4)

- **Texto proposto (acrescentar à tabela de riscos):**

| Risco | Impacto | Mitigação |
| --- | --- | --- |
| Resposta vazia legítima lida como erro ou como sinal | Mensagem falsa ou decisão sobre dado ausente | Vazio é dado (`D3-02`); `nulos` do Brief distingue vazio, não consultado e erro (`F2-DIG-3`) |
| Símbolo diferente de contrato | Sentimento ou notícia de outro token | Sentimento só com símbolo inequívoco (`F2-DIG-6`) |
| Resposta maior que o teto do gateway (2 MB) | Chamada recusada em silêncio | Teto por rota e erro explícito (`F2-MED-4`) |
| Família do provedor não habilitada para a chave | Tarefa que depende de rota inexistente | Sondagem única registrada (`F2-OCX-11`) |
| Escala de percentual ambígua | Nota da trilha errada | Campo com `escala` e vetor de ouro (`F2-DIG-2`, `F2-DIG-8`) |

## D3-13 `CHECKPOINT.md`: estados de evidência do que veio desta sessão

- **Texto proposto (acrescentar à tabela de evidência):**

| Estado | Item | Resultado |
| --- | --- | --- |
| Configuração válida | Gateway e configurações | 181 testes sem falha; web 1863 aprovados e 1 erro de módulo ausente do teste `inonu-layer.test.ts` da sessão do instalável; `typecheck` da raiz limpo e do web com um erro TS2307 nesse mesmo arquivo (executados pelo lead em 2026-10-13 às 08:00); build isolado passou (relatório do implementador, 2026-10-13 de manhã) |
| Funcionando ao vivo | 22 rotas do gateway e as abas Fita, Liquidez, Holders e Ecossistema | credencial real, harness em 127.0.0.1:3055 e build isolado em 127.0.0.1:3056, 134 chamadas ao provedor na interface ([INDEX.md](../evidence/INDEX.md)) |
| Carregado em sessão nova | n/a | não verificado dentro do instalável: estas abas foram vistas em harness, não no executável compilado |
| Ganho medido | n/a | nenhum |
