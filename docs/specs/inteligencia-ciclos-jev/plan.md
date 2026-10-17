# Plano: Inteligência e revisão dos ciclos JEV

Status: implementação aprovada pelo diretor; não é aprovação/retorno do JEV

## Arquitetura e contratos existentes

- `src/agent/model.ts`: `MarketContext` is a flat record; `boundedContext` currently accepts at most 32 validated keys and rejects the whole projection on invalid/overflow input. The 12KB Brief budget is a reference value verified by tests, not a runtime truncation/guard; the producer does not truncate oversized projections. Preserve this behavior and `boundedContext`; no new keys unless replacing/rebudgeting existing fields with equivalent coverage demonstrated. Existing `execucoes`, `memoria`, `exec`/`tokenTrips`/fees and HUD quota/session fields are not new capability.
- `src/agent/live.ts`: `createTimingReader` cacheia candles por 10 min (falha 2 min); hits precisam respeitar o cutoff existente de 3h pela `startMs` da última candle, não pelo instante do fetch. A idade compacta opcional `ageMin`/`ag` descreve só idade do início da barra 1h e não proveniência de preço/saldo/latência. `createMomentumReader` cacheia 5 min (falha 1 min) e aplica `agedMomentum` no hit.
- `src/agent/cycle.ts`: `ConsultRecord` guarda `briefHash`, meta/latência, `brief` entregue, candidatos, solicitado/aplicado, gates, resposta, fees/facts e detalhes macro/proveniência opcionais. O ciclo faz ledger antes de agir e mantém estado incerto sem retry automático. `src/agent/scoreboard.ts` separa decisões/inações/modos e não afirma sem dados/custos suficientes.
- `src/agent/analysis.ts`: `buildAnalysis(AnalysisInput)` é puro e read-only, consome briefs, últimas ordens, fills e scoreboard. Reutilizar; não criar segundo analisador. Ele calcula tranches/placar retrospectivos, mas não se deve confundir com registro contemporâneo do que foi conhecido no ciclo.
- `web/src/components/Agent/AgentView.tsx`: entrada ativa, polling status/análise a cada 6s; DEVELOPMENT é `readOnly`, bloqueia handlers/ações automáticas; importa HudGate/HudView e tipos Analysis de `web/src/lib/hud/types.ts`. `web/src/components/Hud/HudView.tsx` e `web/src/lib/hud/model.ts` são apresentação/modelagem existentes. UI já tem `HudResources/HudMeter` e campos de sessão/dias; não relatar como novidade.
- `src/onchainos/endpoints.ts`, `src/onchainos/http.ts`: catálogo distingue tier, endpoint/limites declarados e unknown; client exige credenciais e allowNetwork explícito, limita requests e retries; não assumir chamada ou cota disponíveis apenas por catálogo. `src/okx-wallet/portfolio.ts` é cliente read-only de balance/total value, rejeita requisições live sem opt-in; nenhum envio adicional de saldo ao JEV sem D2.
- System One autônomo é caminho separado: `src/system-one/readings.ts` (`readPublicMarket`, `syntheticReadings`), `src/system-one/brief.ts` (`buildLeverageCandidates`, `buildLeverageBrief`), `src/system-one/decide.ts` (`buildSystemOneState`, `validateLeverageDecision`) e `src/system-one/cycle.ts` (`runSystemOneCycle`). Faz dry-run/blocked e declara `system_one_never_executes`; não confundir com o ciclo de carteira em `src/agent/cycle.ts`.
- Última leitura S1 usada no contexto do agente: `src/agent/wire.ts` (`systemOneFile`, `createMarketContext`), `src/agent/live.ts` (`createMarketContext`) com frescor S1 de no máximo 30 min (`SYSTEM_ONE_MAX_AGE_MS`). Revisão/auditoria de ciclo já existe em `src/decision-review/context-evidence.ts` (`captureEventReviewBrief`) e `src/decision-review/review.ts`; os fatos registrados afirmam `executionProven: false` e distinguem recibos/relatos/não confirmados. Provar lacuna antes de propor mecanismo novo.

## Estratégia proposta

1. Fechar inventário por código/documentação, separar endpoint implementado, planejado, usado pelo agente e quotas declaradas. Pesquisa externa e inventário oficiais estão no `research.md`/`inventory.md`; consolidar editorialmente sem bloquear melhorias sem fetch.
2. Corrigir gaps demonstrados no contexto do agente ativo: fatos já coletados e leitura separada mais recente de System One podem ser projetados no Brief enviado a Jev por `experimental_evaluate`; não são enviados ao subsistema `src/system-one`. Preservar `boundedContext` (32 chaves, validação all-or-nothing) e tratar 12.000 bytes como orçamento de referência verificado nos testes, sem prometer truncamento/guard em runtime. Campos calculados opcionais podem faltar para consumidores antigos. Sem fetches, dados privados de carteira adicionais, migração de schema/journal ou duplicação persistida.
3. Provar e reduzir duplicação/serialização/espera no caminho ativo, sem alterar polling/cadência/retries ou quotas declaradas. Comparar chamadas, bytes e latência em cenário isolado.
4. Incluir em `buildAnalysis` revisão por ciclo dos registros disponíveis, com hash/contexto congelado, solicitado vs aplicado, etapas disponíveis, ordem e resultados quando conhecidos, mais achados determinísticos acionáveis ancorados no ciclo (stale/ausência/custo desconhecido/divergência/incerteza/resultado ainda não medido). Não chamar LLM por review, autoajustar política ou trazer resultado posterior para contexto da decisão.
5. Expor revisão por ciclo na HUD ativa com componente dedicado e ponto mínimo de import/render; não editar estilos, handlers, readOnly ou teste HUD alheio. Reutilizar `decision-review` somente onde seus contratos se ajustam sem criar subsistema paralelo.
6. Limitar a review aos briefs realmente fornecidos pela retenção em runtime; não prometer retrospectiva completa.
7. Fazer smoke antes/depois em home temporária e executor paper isolado; browser UI real sem carregar sessão do usuário. Depois executar gates e atualizar docs/changelog.

## Paths e símbolos propostos

- Contexto/dados: `src/agent/model.ts` (`MarketContext`, `AgentBrief`, `BriefInput`, `boundedContext`, `agentBrief`, `timingBrief`), `src/agent/live.ts` (`createTimingReader`, `createMomentumReader`, `createMarketContext`, `createPriceLookup`), `src/agent/timing.ts` (`TimingFacts`), `src/agent/candidates.ts` (`withTiming`, `buyCandidates`), `src/agent/cycle.ts` (`ConsultRecord`, `CycleDeps`, `createCycleRunner`). Alterações condicionadas ao teste de comportamento e ao orçamento existente.
- Revisão: `src/agent/analysis.ts` (`AnalysisInput`, `AnalysisView`, `buildAnalysis`), `src/agent/scoreboard.ts` (`DecisionMark`, `Settlement`, `Scoreboard`). Reusar registro e dados disponíveis; sem novo journal/schema.
- API/catalog: `src/onchainos/endpoints.ts` (`ENDPOINTS`, `endpoint`), `src/onchainos/http.ts` (`TokenBucket`, `OnchainosHttp`), `src/okx-wallet/portfolio.ts` (`OkxPortfolioClient`, `allTokenBalances`, `totalValue`). Mudança de contratos/read scope fora de escopo.
- HUD ativa: `web/src/components/Agent/AgentView.tsx` (readOnly, status/analysis), `web/src/lib/hud/types.ts` (`Analysis`, `HudModel`), `web/src/lib/hud/parse-analysis.ts` (parser), `web/src/components/Hud/HudView.tsx` (integração mínima) e componente novo `web/src/components/Hud/CycleReviewPanel.tsx`. Arquivos HUD alheios: reler e preservar trecho.
- `research.md` é produzido por tarefa independente; este plano não replica pesquisas externas.

## Trade-offs e riscos

- 32 chaves/12 KB limitam o quanto pode caber; preservar `boundedContext` all-or-nothing. Se evidência opcional não couber, omitir/explicitar unknown sem relaxar guard ou cap.
- Cache deve respeitar frescor da candle no hit e nunca classificar fetchedAt como idade do mercado; acrescentar só idade derivada da startMs da barra 1h, se projeção ativa puder carregá-la.
- Briefs/logs atuais guardam percentuais/códigos, não balanço em USD/endereço completo. Não aumentar privacidade transmitida nem superfície de persistência.
- Owner HUD não identificado, mas integração mínima autorizada pelo diretor; reread do trecho estável e preservar alterações alheias.
- Contagem/latência dependem do cenário; limiares de rate não devem ser inferidos de README, catálogo incompleto ou estimativas documentais.
- Smokes da implementação devem usar somente home temporária + executor paper isolado. Captura histórica sanitizada read-only de registros em DataHome resolvido está descrita em `observations.md`; não é smoke nem execução da avaliação T13, que permanece não iniciada.

## Decisões

- Implementação aprovada pelo diretor em 2026-10-16; não requer aprovação do JEV.
- A pesquisa atualizada não indica necessidade de chamadas novas nem limites CLI/Basic/Premium publicados nas páginas revisadas. D2 e autorização paga continuam gates próprios.

## Addendum T8+: admissão por envio físico (aprovado pelo diretor; implementação concluída)

Esta alteração é delimitada ao transport DEX assinado `src/onchain-read`; não inclui o transport V5 público, Agentic CLI, criação de APIs, credenciais, pagamento, auth/HMAC, limites configurados, persistência, schema ou journals. O problema foi reproduzido sem rede com fetch/clock sintéticos e `createBudget` real em diretório temporário: retry 50102 saiu 17 ms após o primeiro fetch apesar do intervalo de 1100 ms, e um cap local Basic=1 terminou em dois envios/uso 2. A terceira observação demonstrou followers idênticas coalescidas (uma enviada, duas não enviadas); a correção deve preservar esse comportamento inclusive para followers que chegam depois de a líder consumir o cap.

### Contrato/API aprovados para implementação

Em `src/onchain-read/client.ts`, exportar tipo estrutural:

```ts
export type DispatchAdmission =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: "budget_exhausted" | "pace_limited" };
```

Substituir a chamada pública atual por um único contrato obrigatório, sem overload, shim nem callback opcional:

```ts
call(
  request: ProviderRequest,
  tier: OnchainTier,
  admitDispatch: () => DispatchAdmission,
): Promise<ClientResult>
```

`admitDispatch` é síncrono e invocado por tentativa, depois das validações, verificação de credenciais, refusal por cooldown/tier, preparo da assinatura e espera aplicável, imediatamente antes de cada invocação física de `fetch`. Não inserir `await` entre callback aprovado e invocação. Recusa retorna a razão local já existente e `sent` indica se esta operação já invocou `fetch` pelo menos uma vez. Gateway fornece a callback; `createOnchainClient`/server/desktop/cloud não recebem novo parâmetro de fábrica.

Em `src/onchain-read/gateway.ts`, remover somente a reserva que atualmente antecede `cache.coalesce`. Manter `serial` e o preflight atual que já roda dentro do líder coalescido, serializado e antes de `client.call`: é uma checagem síncrona não consumidora, permite recusar cap/pacing esgotados sem aguardar fila/intervalo, e não registra uso. Passar ao client callback da líder que revalida `budget.reserve(tier,intent)` no limite do dispatch e, somente quando admitido, chama `budget.record(tier)` exatamente uma vez. A fila gateway/client permanece; followers nunca fazem preflight ou callback próprios. Cache hit continua antes desse caminho.

- No client, mover/aplicar a espera do intervalo à tentativa de retry dentro do `sendBeforeDeadline`; calcular a espera pelo mesmo `lastSentMs + minIntervalMs`, não por novo parâmetro ou valor. A espera inicial e sua posição anterior ao início do deadline ficam intocadas. A espera do retry fica dentro do deadline já criado por `send()`, é interrompida/observa o `AbortSignal`, e após a espera há verificação de abort/deadline antes da callback obrigatória, seguida sem `await` pela invocação de `fetch`. Manter exatamente a regra de novo offset para 50102, no máximo um retry, HMAC/timestamp/Date-header, fila serial, cooldown global 429, block por tier 402 e restante do fluxo. Não iniciar despacho após timeout/abort durante a espera.

Com a contagem movida à fronteira de `fetch`, remover o contador de dispatches pós-resultado da API `ClientResult`, lógica de retorno, gateway, mocks/asserts e comentários. O retry continua a mesma operação lógica; só passa a precisar de um segundo dispatch admitido. Se cap=1, primeiro fetch consome uma unidade, e retry requerido é recusado localmente (sem segunda chamada), mantendo `sent:true` para o fetch inicial. Se cap=2, retry existente pode seguir e a segunda callback consome a segunda unidade. Sem cap disponível inicial (incluindo zero), o preflight recusa localmente antes de `client.call`; a callback ainda revalida para cobrir mudanças enquanto espera.

### Callers e testes a migrar

- Chamadores de produção de `createOnchainGateway`: `src/server.ts:52-65`, `src/desktop/handlers.ts:111-124` e `src/server/cloud-runtime.ts:73-79`. Nenhuma mudança aos argumentos dos criadores; o gateway injeta callback quando chama client.
- Únicos caminhos de produção que chamam `OnchainClient.call` diretamente: gateway (`src/onchain-read/gateway.ts`) e teste de conexão (`src/onchain-read/probe.ts:19-25`). Gateway usa a admissão do orçamento; probe continua isolado e usa callback explícita que admite somente suas chamadas Free, sem criar novo budget/cap.
- Atualizar contrato e limites/tempo em `src/onchain-read/client.test.ts`; teste integrado gateway+client+budget real em `src/onchain-read/gateway.test.ts` deve validar fetches reais e orçamento, não contadores simulados no resultado. `src/onchain-read/probe.test.ts` cobre o comportamento do probe através do client.
- Atualizar implementações fake tipadas de `OnchainClient` em `src/onchain-read/gateway.test.ts`, `src/onchain-read/f2-routes.test.ts` e `src/onchain-read/routes/wallet-gateway.test.ts` para a assinatura obrigatória; os fakes devem modelar admissão quando afirmarem um envio. `src/onchain-read/leak.test.ts` usa client real através do gateway e deve continuar cobrindo ausência de vazamento/headers.
- Inspecionar todos os usos de contadores de dispatch pós-resultado e callsites de `OnchainClient.call` no cutover para nenhum consumidor interno ficar com contrato antigo. Migrar tudo junto; não manter shim/re-export alias.

### Matriz de prova da implementação

1. Cap zero: sem fetch, `budget_exhausted`, `sent:false`, sem esperar interval/deadline inicial; pacing de background usa `pace_limited`, intent user preserva semântica existente.
2. Cap um + primeira resposta 50102 com Date que habilita retry: um fetch, contador exatamente 1, retry negado `budget_exhausted`, `sent:true`; nunca dois fetches.
3. Cap dois + mesma resposta: dois fetches, contador exatamente 2, distância de dispatches pelo menos o intervalo configurado; segunda tentativa usa HMAC/offset corrente do comportamento atual.
4. Retry aguardando intervalo ultrapassado por timeout/abort: a operação retorna pelo deadline existente, não há segunda chamada tardia.
5. Cap um e líder coalescida suspensa: chamadas idênticas iniciais e seguidores tardios partilham resposta de sucesso mesmo após uso=1; uma callback aprovada/um fetch/uma unidade. Cache hit posterior não invoca callback.
6. Outra chave na fila: preflight recusa cedo se já sem allowance; se aguarda, callback revalida imediatamente antes do fetch. Serial admission/fila preservadas.
7. Controles: 429 mantém cooldown 30 s e não contabiliza followers rejeitados; 402 segue tier block de uma hora; rotas Free/sem credenciais, request validation e stale fallback mantêm resultado atual.

O teste de integração usa Bun, clock/fetch sintéticos e `createBudget` real com cap temporário em diretório exclusivo removido ao final; sem env/config/journal/home real, rede, wallet, CLI, modelo ou serviço. Não executar testes, builds ou gates durante a implementação. Após ambas as fatias de source/test aterrissarem, o integrador executa uma vez os gates T9: `bun run typecheck`, `bun run test`, `bun run test:lab`, `bun --no-env-file run typecheck:all` e `bun --no-env-file run test:all`.

## Addendum T11: otimização privada de agrupamento de fills

- Alvo único: `src/agent/analysis.ts:789-798`. Criar arrays de grupo uma vez e `push`; ordenar in-place os arrays privados. Não mudar mapas de scoreboard, agregação diária, validadores, semântica, inputs ou demais caminhos.
- Antes de editar, compilar o source atual via `bun build src/agent/analysis.ts --target=bun --outfile=<arquivo exclusivo em Temp>` e preservar o artefato até comparação com a compilação posterior usando as mesmas flags.
- Smoke comparativo somente com funções compiladas: JSON byte-idêntico em cada fixture e página; conferir todas as saídas e imutabilidade, inclusive entradas congeladas. Fixtures determinísticas abrangem páginas 1–10 com 120×15 candidates e históricos de 26/1.000/5.000/10.000 fills, único/distribuído, ordem embaralhada, timestamps iguais, parcial e quantidades desconhecidas.
- Perfil pareado (mesmo processo compilado, warm-up e mediana de nove) reporta resultados observados; sem projetar benchmark sintético para latência de produção.
- Sem fixture/teste permanente novo salvo edge semântico demonstrado e sem cobertura existente. Rodar apenas testes existentes de `src/agent/analysis.test.ts` e typecheck focado após smoke. Integrador executa os cinco gates globais depois.

## Addendum T13: avaliação retrospectiva local autorizada

O usuário autorizou, de forma limitada, uma avaliação retrospectiva usando somente os arquivos locais já existentes `answers.jsonl` e `prices.jsonl` e os segmentos rotacionados desses mesmos journals reconhecidos pelo helper existente `journalSegments`. A avaliação deve ser read-only e sanitizada; a única computação permitida é o avaliador determinístico de outcomes já existente, se ele puder cumprir todas as restrições. Não chamar APIs, modelos ou rede; não reiniciar serviços; não expor decisões brutas ou dados de carteira; não escrever journals/schema nem alterar comportamento de trade, execução ou risco.

Não iniciar a avaliação se qualquer arquivo-base estiver ausente/ilegível, se algum segmento identificado por `journalSegments` estiver ausente/ilegível/instável, ou se a ferramenta/procedimento tiver efeitos colaterais. Parar nessas condições, sem recuperar ou modificar os arquivos. Não ler qualquer outro journal/arquivo nem criar/modificar/rodar scripts alternativos. Relatar somente contagens/métricas agregadas e incerteza; não inferir rentabilidade. Esta inclusão documental não lê os arquivos nem executa qualquer ferramenta de avaliação.

## Addendum T14: normalização e frescor end-to-end

- Carteira: a interface consome o endpoint de status já existente, com polling/coalescência limitada e timeout recuperável. O core continua usando somente sua leitura/ciclo existente; não se cria caminho paralelo de polling da carteira.
- O snapshot associa timestamps e totais à mesma observação; atualização cancelada não publica decisão nem promove dados não verificados. Quando a leitura falha, conservar apenas valores confiáveis, qualidade e idade explícitas; nunca tratar dado antigo como atual.
- A camada de feed normaliza domínio/unidade e valida identidade, temporalidade e coerência antes da análise. Campo opcional fora do domínio fica nulo; linha sem identidade ou medida indispensável é descartada; conflito de chain/token rejeita a resposta. Para `/onchain/signals` request-scoped com `nowMs`, manter timestamps de `nowMs` até `nowMs - 6 horas` inclusive e descartar os anteriores e futuros; normalização direta/interna sem horário de requisição mantém a semântica atual.
- Montagem de candidatos, fatos e scores ignora hot-token/signal obsoleto, preservando outras fontes frescas. Dedupe usa a mesma equivalência de address do candidato, sem alterar comparação de IDs não-EVM.
- Limites: sem troca de fornecedor/API paga, credenciais, cadência de wallet reads, limites de risco, autorização live, schema/journal ou projeção nova de dados privados ao modelo. Nenhum teste deve usar home ou core operacional; HUD visual é exclusivamente sintético.
- Follow-up autorizado após prova sintética de deadline: aplicar guardas de deadline monotônico após cada await, leitura de body e parsing relevante nos consumidores de Onchain/Signals, rejeitando resposta expirada antes do sucesso/caching. Preservar deadlines configurados, retry, budget/cache compartilhado, limites de chamada e as alterações existentes de T8 `DispatchAdmission`; não aumentar timeout nem consultar APIs/modelos pagos.
- Remover somente a asserção temporal absoluta `<250 ms` do teste Signals, mantendo rejection/abort/call-count funcional; ampliar sua prova para que assertions posteriores sejam alcançadas. Gateway: controlar expiração fake determinística, verificar resposta atrasada não admitida/cacheada, conservar regras de cache/budget compartilhados e comprovar que a chamada subsequente com deadline default despacha e retorna dados novos.
- Integração verificada apenas depois das fatias de implementação: testes comportamentais existentes e cinco gates definidos em AGENTS.md, seguidos do smoke visual com dados artificiais e estados de erro/frescor.

## Addendum T15: prioridade de leituras existentes no limite do leitor

T14 cobre qualidade/frescor e preservação de posições geridas na apresentação, mas não especifica prioridade de seleção de leituras em disputa pelo limite. Não há owner/reserva registrada na tabela de tasks para esse subescopo; T15 é uma subtask adicional delimitada à prioridade no reader e deve preservar as alterações concorrentes de T14, sem duplicar seus contratos mais amplos.

- Escopo de source/test previsto exclusivamente: `src/agent/live.ts` e `src/agent/live.test.ts`; reler os trechos atuais antes da implementação e integrar preservando alterações concorrentes.
- Preservar as regras atuais de elegibilidade, `max`, filtros e admissão. Entre as posições elegíveis, ordenar: plano elegível primeiro, depois posição já gerida, depois demais; USD decrescente dentro de cada grupo, com desempates determinísticos já existentes.
- Priorizar antes de aplicar `max`; para o mesmo book/planos/max, selected count não pode superar o algoritmo anterior. Não usar managed-first de forma que aumente a contagem.
- T3/T4 continuam vedando consultas adicionais, novos endpoints ou aumento de frequência. A exceção T15 é exclusivamente semântica: reordena leituras existentes sob o mesmo teto/admissão, sem quota nova. Não prometer igualdade geral do número físico de chamadas porque composição de cache pode mudá-lo.
- Prova comportamental do serviço/read path com posição watch-only de USD alto e posição gerida elegível, além de posições planejadas acima de `max` e caso managed-versus-watch sem plano. Validar prioridade e limite usando a mesma entrada; contabilizar leituras por posição sem adicionar chamadas.
- Medir controle fresh determinístico antes/depois (40 leituras antes e depois, se reproduzível com a entrada/cache controlados); reportar como cenário observado, não como garantia geral. Smoke read-only sintético; preservar T14. Após prova T15, o integrador executa os cinco gates globais; documentar apenas resultados observados.

### Resultado focado T15 e aggregate final

Implementação e smoke sintético observados: ordenação planned → managed → watch/USD decrescente, antes de `max`, preservando eligibility, max, filtros e admissão. Caso boundary com planos >max manteve todos os planos como o algoritmo anterior já fazia; a prioridade reserva slots e não lê watch extra. Smoke `runNow → cycle → onBook/status` selecionou 20 (AAA gerida +19 watch), fez 20 `price-info` +20 risk por gateway fake; AAA passou de `usd=null` para `usd=10`, `quality=current`, `managedOk=true`, `unpriced(managed)=0`. `agentUsd` 1.000→1.010; total 201.000→191.010 porque uma watch de US$10.000 foi deslocada por AAA de US$10—não é perda de carteira. Fixture sintética; zero API real, CLI, env, modelo offline ou executor. Não se relatou controle fresh 40/40 antes/depois; 40 chamadas deste smoke não o substituem.

## Addendum T17: admissão local antes do fallback do modelo

- Alteração delimitada a `src/agent/model.ts`, `src/agent/cycle.ts`, `src/agent/budget.ts` e seus testes de contrato/consumidor; migrar todos os callers de `AgentModel.choose` e usos de `countExtra`/`physicalRequestsOf` antes de remover APIs/helpers.
- `AgentModel.choose` recebe callback síncrona obrigatória `admitFallback`. Adapter chama-a somente para o fallback 400/413/422 elegível, após verificar abort e antes do segundo `evaluate`; mantém `maxRetries: 0`, sem retry 429. Não há fallback se admissão ou persistência falha.
- Cycle começa a consulta primária como hoje. Callback inicia/persiste ticket secundário; em caso de sucesso encerra primário com null usage e troca ticket ativo. Em callback abortado/erro, catch encerra o ticket primário uma vez. Depois de callback bem-sucedido, todo caminho finaliza apenas o ticket atual uma vez, com null em falha ou usage da última resposta em sucesso. A avaliação secundária só conta como física quando começa.
- Remover o incremento posterior `countExtra`; migrar/remover API e testes obsoletos somente após busca de todos os usos. Manter `physicalRequests` de respostas de sucesso e metadado de consulta; erro não precisa de tagging/helper sem consumidores.
- Provas: smoke throwaway antes/depois da composição model+budget, depois regressões comportamentais consumer `runCycle` real + model adapter real + budget real com evaluator sintético. Cap local 1 bloqueia fallback; cap 2 admite; token estimate por consulta bloqueia; falha persist impede segunda; abort entre primeira rejeição e fallback não começa segunda; controles 429/pre-abort. Valores sintéticos não descrevem usage faturado.
- Nenhum teste permanente de source/wiring/mock-echo; testes de consumo verificam limite e invocações observáveis. Sem mudanças a valores configurados, quotas oficiais, estado/persistência v1, pacing, fechamento, schema/journal, credenciais, risco, API/model provider, CLI, rede ou operação.
- Testes focados executados após smoke; Main executou sequencialmente os gates finais após fonte estável. SDD atualizado com evidência observada, preservando T13/T14/T16.

### Evidência T17 local (gates finais concluídos)

- `C:\Users\gabri\.bun\bin\bun.exe --no-env-file test src/agent/budget.test.ts src/agent/model.test.ts src/agent/cycle.test.ts src/decision-review/model-retry-review.test.ts`: 238 pass, 0 fail, 882 expect calls, 4 arquivos, 1.070 s.
- Smoke throwaway chamou o `runCycle` real (helper de fixture), adapter e budget reais; evaluate/provider fake e persistência em memória. Cap1: evaluate=1, consults=1, committed=1000, measured=0, unmeasured=1, executions=0, `modelo_erro`. Cap2: evaluate=2, consults=2, committed=1011, measured=11, unmeasured=1, executions=0, `decidido`. Token cap=estimate=1000: evaluate=1, consults=1, committed=1000, measured=0, unmeasured=1, executions=0, `modelo_erro`. Falha de persistência do segundo begin: evaluate=1, consults=1, committed=1000, measured=0, unmeasured=1, executions=0, `modelo_erro`.
- Regressão runCycle com fake deadline timer: abort entre evaluator primário e retorno da recusa 400, evaluate=1/consults=1/committed=1000/measured=0/unmeasured=1/executions=0, `modelo_erro`. Controles adapter: 429 uma chamada; abort preexistente zero evaluate; abort durante resposta 400 sem fallback.
- Estimate 1000 e usage 11 são números sintéticos do fake; não são observações de `runCycle` faturado, tokens faturados, modelo/SDK real ou quota oficial. Smoke não usou rede, `.env`, wallet, CLI, processo operacional, journal, API provider real ou executor com efeitos.
- Gating global pelo Main: `typecheck:all` exit 0 (20:28:21.108Z–20:28:28.274Z; 7.1681912 s); `test:lab` exit 0 (20:28:28.277Z–20:29:00.511Z; 32.2354853 s; 647 pass/0 fail, 838,136 expects, 647 tests/16 files); `test:all` exit 0 (20:29:00.514Z–20:34:21.846Z; 321.3342767 s; root 7,878 pass/2 skip/0 fail, 984,091 expects, 7,880 tests/479 files; web 3,825 pass/0 fail, 59,692 expects, 3,825 tests/252 files). Os três comandos agregados cobrem os cinco caminhos root/web/lab, não cinco comandos standalone. Dois skips não qualificam live; nenhum deploy, PnL, billing ou quota vendor inferidos. Evidência e warning web em `observations.md`.

Aggregate final sequencial concluído: `typecheck:all`, `test:lab`, `test:all` exit 0; juntos executaram os cinco caminhos root/web requeridos (não cinco comandos standalone). Contagens, timestamps, skips de receipt-safety e monitoramento limitado a 46 paths conhecidos estão em `status.md`. A verificação Chromium de concorrência da UI em harness temporário está descrita em `observations.md`; não é app deployed nem prova de daemon/conta real. Não afirmar freeze global. T13 formalmente autorizada e não iniciada; T14 concorrente, preservada.
## Addendum T18: carteira periódica e qualidade dos dados ativos

- Implementação delimitada aos contratos ativos: `src/agent/live.ts`/`src/agent/wire.ts` para leitura/caching/publicação; seus testes de comportamento; `src/inonu/source-ecosystem.ts`, `source-discovery.ts` e `source-onchain.ts` para consumidores de dados stale e seus testes; HUD ativa e testes nos módulos realmente montados pela rota principal; inventário/status para evidência e distinção entre fonte ativa, catálogo e regra estática. Reler cada trecho no momento da alteração para preservar diffs concorrentes.
- Integrar refresh ao mesmo `BookReader`, não ao handler de status: iniciar somente com o serviço iniciado, reutilizar resultado recente do reader por 30 s, sequenciar refreshes e cancelar timer no `close`. Ciclo e refresh compartilham cache por endereço/configuração; trocar carteira invalida leitura anterior. Leitura sem configuração/sem carteira não faz chamada.
- A cada refresh, executar o percurso existente de facts e `verifyBook`, publicar somente livro verificado no estado em memória; não gravar equity além do limitador já existente, nem registrar um ciclo. Não atribuir a `observedAtMs` semântica de timestamp upstream. Falha não substitui último livro verificado.
- Stale em chamadas de gateway elimina o resultado antes de formar `Info`/`Risk`, digest, ranking ou flags de segurança; `token-risk` stale não marca candidato como `checked` nem empresta flags de segurança. Manter TTLs atuais e admissão; nenhuma fonte extra.
- `createEcosystemReader` conserva o scan retido e `observedAtMs`, mas projeta `fresh`/`stale`/`unavailable`; `buyCandidates`/`openByRisk` e `agentBrief` não oferecem métricas stale; `priceRowFromEco` não grava scan stale como preço atual. TTL e chamadas do provedor permanecem inalterados.
- UI: usar `analysisOk` existente para não renderizar métricas do `EMPTY_ANALYSIS` como zero; preservar valores reais e limites vindos do status. Incluir estado indisponível coerente com o vocabulário local.
- Medir chamadas em fixtures: no máximo uma chamada de balance por endereço por janela do cache; ciclo dentro da janela não duplica; após 30 s atualiza; trocar configuração descarta resultado antigo e conclusão atrasada não substitui leitura posterior; stale/unavailable não atualizam preço/risco nem se tornam oportunidade/observação atual. Testar sem esperar 30 s com relógio/scheduler injetados.
- Smoke backend usa serviço com fixtures; smoke visual abre HUD real em localhost com status/analysis sintéticos, sem chaves, APIs externas ou operação. G5 inclui suites root/web/lab; todas sequenciais pelo integrador após slices.
- Riscos registrados: o intervalo pedido não confirma limite do provedor; cada atualização pode ler até os endereços managed/watch configurados, e rotas/quotas fora do reader ativo não são alteradas. Não afirmar cobertura literal de todos os endpoints do registry: só fontes que alimentam o agente ativo ou tela montada foram normalizadas; demais itens permanecem inventário/catálogo.

## Addendum T20: limitar funding à última barra varrida

- Alvo restrito a `src/lab/outcomes.ts` e `src/lab/outcomes.test.ts`; os arquivos foram observados limpos no status direcionado antes da edição. `scanLiquidation` já acumula payments cujo settlement ocorreu até `bar.endMs`; o defeito é a soma posterior dos payments restantes depois que as barras acabam.
- Remover apenas a acumulação dos settlements que ficaram após a última barra. Manter o sort, a validação de `paid`, o uso de `settleMs <= bar.endMs`, cálculos de liquidação e o shape de `ScanResult`.
- Teste comportamental usa uma barra não liquidante com `endMs=10` e payments `settleMs=5, paid=0.01`, `settleMs=10, paid=0.005` e `settleMs=15, paid=0.02`; prova que `fundingPaid=0.015` inclui o limite final e exclui o pagamento posterior.
- Reproduzir antes com `bun --no-env-file -e` e depois executar `bun --no-env-file test src/lab/outcomes.test.ts`, smoke sintético e os gates root definidos em `AGENTS.md`. Nenhuma rede, captura operacional, credencial, wallet ou modelo.
- A correção torna o helper exportado coerente com sua documentação; a avaliação canônica já limita funding à janela do holding e só usa `fundingPaid` em caminho liquidado. Não atribuir mudanças em relatórios padrão, estratégia ou performance financeira.

## Addendum T21: preservar distâncias entre epochs válidos

- Escopo restrito à inferência HAC de `src/lab/stats.ts`, seus testes e documentação do laboratório. `PolicyInputs.results` já mantém um slot por época; não compactar antes de calcular a variância.
- Manter o conjunto utilizável para média/desvio-padrão. Para `n` valores observados e posição original `t`, calcular cada autocovariância em lag `j` somente dos pares observados em `(t, t-j)`, dividida pelo mesmo `n`; aplicar Bartlett por lag em unidades de época. Preservar `defaultLag(n, overlap)` e o fator pequeno-amostra atuais, sem redefinir thresholds.
- Usar séries esparsas para policy e contribuição por modalidade; decisões completas de outras modalidades continuam como zero e resultados incompletos ficam ausentes. Construir diferenças pareadas no slot temporal original, ausente se qualquer lado faltar.
- Preservar `meanTest`/`neweyWestLrv` exportados e densos, seus resultados sem lacunas, schema de report e completude. Inferência gap-aware deve propagar sua LRV às fórmulas existentes de Sharpe/limites e à sinalização do relatório, sem alterar essas fórmulas ou risco operacional.
- Reproduzir antes com oracle determinístico. Testar policy, modalidade e comparação pareada, mantendo testes densos; rodar foco, smoke e gates root após implementação. Não executar APIs, wallet, modelo ou journal real.
- Não alterar curvas observadas nem bootstrap de alavancagem: esses consumidores têm contratos próprios e não são considerados corrigidos por T21. Missingness pode ser informativa; não inferir performance financeira ou melhoria live.
