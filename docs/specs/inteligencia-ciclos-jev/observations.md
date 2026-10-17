# Observações dos ciclos capturados

## Escopo e proveniência

Captura somente de leitura em 2026-10-16, entre 13:03:26.346Z e 13:03:26.385Z. O caminho de dados foi resolvido usando `resolveHome` com o `DataHome` padrão documentado em `scripts/autostart/inonu-local-logon.ps1`; o caminho absoluto não é registrado aqui. O `INONU_HOME` do processo não estava definido e o destino padrão de `resolveHome` não existia. O DataHome documentado pelo watchdog existia. O watchdog declara esse DataHome como o diretório real e o passa ao supervisor, mas o próprio arquivo diz que está apenas preparado e não registrado; esta observação não prova que o supervisor estava ativo durante a captura.

`src/desktop/paths.ts` distingue `resolveHome` (resolução sem escrita) de `prepareHome` e `enterHome` (que criam diretórios e alteram o diretório atual). Não foram chamados `freeze-evidence.ts`, construtores de stores, reparadores de journal, watchdog, rotinas de inicialização, qualquer rota de escrita, nem chamadas de rede ou modelo. O `main` de `freeze-evidence.ts` cria e sobrescreve `scripts/autoresearch/fixtures/evidence.json`, portanto não foi executado. As únicas projeções em memória foram `buildAnalysis` e `parseAnalysis`, ambas sem I/O, sobre as linhas JSON estritamente analisadas.

Os quatro arquivos foram capturados sequencialmente, não como snapshot atômico. Cada leitura foi conferida por tipo de arquivo regular, sem symlink, dentro do home documentado, e por tamanho/mtime antes e depois da leitura. Todos permaneceram estáveis durante sua leitura individual, terminaram em newline, decodificaram como UTF-8 válido e passaram JSONL estrito com um objeto JSON por linha, sem linhas inválidas. O agente pode ter escrito entre arquivos ou depois da captura. Hashes abaixo identificam os bytes lidos, não autenticam sua origem. Nenhum conteúdo bruto, identificador, símbolo, endereço, e-mail, token, URL privada ou texto livre foi incluído neste relatório.

| Fonte | Linhas | Bytes | Leitura UTC | SHA-256 exato |
| --- | ---: | ---: | --- | --- |
| `briefs.jsonl` | 120 | 2,250,549 | 13:03:26.346Z | `23288bbe9d61d1b39d17f19eab7417ac8cdff70e8a0f2cc488e13bda1aa8d99e` |
| `ledger.jsonl` | 6,068 | 3,612,311 | 13:03:26.378Z | `5ebd9a88241e27fc84a7cbecdfa697d3f30af34e7021dc92518863081f1ff2bf` |
| `fills.jsonl` | 26 | 14,080 | 13:03:26.379Z | `2f1453299a11ae4336a2febd617108117a10d0165fc30090247378b3dc34ecf2` |
| `scoreboard.jsonl` | 2,629 | 808,409 | 13:03:26.385Z | `7c27415272a2b2acd28041ae7275d5800faa0fa09305f24242bb31bd3579ca5e` |

## Método de junção e capturas observadas

A primeira projeção, capturada em 2026-10-16 13:03, é o resultado histórico anterior à paginação. Ela considerou os 120 briefs daquela captura e retornou 120 ciclos aceitos pelo parser da UI. O intervalo dos briefs foi 2026-10-16 07:37:04.654Z a 12:58:33.892Z. Cada ciclo tinha 9 itens, 1,080 itens no total. Nenhum ID ou chave foi exportado. Esses bytes não são os da captura usada na prova final paginada abaixo.

O contrato de junção associa por `cycleId` e `candidateId`, exigindo a chave canônica exata `${cycleId}:${candidateId}`. A ordem precisa declarar o mesmo par e a mesma chave; as decisões do scoreboard precisam corresponder à chave canônica de ação ou à variante `|inacao`; fills entram somente quando seu `orderKey` canônico coincide exatamente com um desses pares. Símbolo e proximidade temporal não são usados como joins. A aceitação histórica dos 120 ciclos descreve apenas a primeira projeção. A prova final do parser com a resposta paginada está documentada a seguir.

## Prova final paginada e parser

A validação independente usou uma captura sequencial em 2026-10-16, entre 13:38:22.529Z e 13:38:22.653Z. Cada journal passou checagem individual de estabilidade durante leitura. A captura não foi atômica e não usou os mesmos bytes da projeção inicial. Os hashes de briefs, ledger e scoreboard diferem da captura das 13:03; o hash de fills é igual.

| Fonte | Linhas | Bytes | SHA-256 exato |
| --- | ---: | ---: | --- |
| `briefs.jsonl` | 120 | 2,245,473 | `65eab428a7508cb929dfd9cdeb07c70686db745618eecc7033eaf9cc6b6b673c` |
| `ledger.jsonl` | 6,192 | 3,685,846 | `acfa99d5f8a3dccf42d53081e3430fbbb9b72a6eb84b4cc5025e0d2af62dfcab` |
| `fills.jsonl` | 26 | 14,080 | `2f1453299a11ae4336a2febd617108117a10d0165fc30090247378b3dc34ecf2` |
| `scoreboard.jsonl` | 2,652 | 818,694 | `f0bc284ac22a88d897de07f206e1c2e35c7fe73835b184fb3a0dd5a542704edd` |

O caminho exercitado foi o envelope real do endpoint e do cliente: `buildAnalysis` recebeu a página selecionada, o resultado foi envolvido em `{ok:true,analysis:...}` e passado a `parseAnalysis(envelope)`. Foram aceitas as dez páginas, numeradas de 1 a 10, com `pageSize=12`, `total=120`, `totalPages=10` e 12 ciclos por página. O total foi 120 ciclos únicos e 120 reviews.

As arrays-fonte continham 1,076 itens candidatos únicos, todos aceitos e distribuídos em 116 ciclos com 9 itens e 4 ciclos com 8. Não foram observados itens inválidos, duplicados ou descartados pelo parser. Portanto, 1,080 itens era a expectativa da projeção inicial, mas a prova paginada desta captura confirma 1,076, não 1,080.

| Verificação | Observado |
| --- | ---: |
| Joins de ordem por chave canônica exata | 98 |
| Joins com chave inválida ou divergência de projeção | 0 / 0 |
| Estados finais dos 98 joins de ordem | 98 `falhou` |
| Códigos de falha | 93 `gas_station_pendente`, 4 `impacto_alto`, 1 `simulacao_falhou` |
| Decisões de ação / inação | 0 / 81 |
| Fills ligados por chave exata / chaves inválidas | 0 / 0 |

Esses resultados descrevem apenas os bytes capturados e a projeção sem I/O. Não são snapshot atômico, auditoria de carteira, prova independente de execução ou não execução, nem evidência de PnL, retorno ou causalidade.

## Resultado da captura inicial de 13:03

| Métrica | Observado |
| --- | ---: |
| Ciclos / itens | 120 / 1,080 |
| Itens com pedido / aplicação registrados | 1,080 / 1,080 |
| Divergências pedido-aplicação | 0 |
| Registros de gate / divergências entre pedido e aplicação do gate | 99 / 0 |
| Ordens ligadas por chave exata | 98, todas com último estágio registrado `falhou` |
| Marcas de decisão de ação / inação | 0 / 74 |
| Fills ligados aos 120 ciclos por chave exata | 0 |
| Janelas de ação / janelas de inação | 0 / 296 |
| Janelas de inação medidas / pendentes / não medidas | 123 / 143 / 30 |
| Achados `outcome_unmeasured` | 30: 16 em 15m, 12 em 1h, 2 em 4h |

Os 98 estágios `falhou` são apenas estados finais registrados no ledger. Os 26 registros existentes em `fills.jsonl` não produziram junção exata com os 120 ciclos selecionados. Ausência de fill ligado não demonstra ausência de operação on-chain; estes registros não constituem auditoria completa da carteira nem prova independente de execução ou não execução.

## Códigos de falha e evidência de execução

Os 98 joins exatos têm `reason` não vazio e correspondente a código conhecido no adaptador/ciclo. A classificação abaixo usa esses códigos e os campos estruturados capturados, nunca texto bruto:

| Código registrado | Ocorrências | Evidência e limite |
| --- | ---: | --- |
| `gas_station_pendente` | 93 | Os 93 registros têm fatos de quote. O adaptador registra esses fatos somente após uma quote bem-formada; neste código, o caminho restante é a resposta do comando `swap execute` com classe `exitCode=2` ou `confirming` e texto que contém `gas station`. O classificador-fonte é a regex não ancorada `/gas station/i`. O journal não guarda detalhe nem referência da transação. O código identifica a classificação do adaptador, não prova saldo insuficiente nem estado on-chain. |
| `impacto_alto` | 4 | Os 4 registros têm fatos de quote. `src/agent/cli.ts` rejeita impacto acima do limite configurado antes de chamar o comando `swap execute`. É uma regra de impacto da quote, não evidência de slippage executado. |
| `simulacao_falhou` | 1 | O único `detail` foi verificado em memória somente contra o prefixo literal `transaction simulation failed:`. O adaptador exige resposta Solana com código de saída 1 e envelope restrito para atribuir este código; o contrato-fonte da CLI diz que a simulação ocorre antes do broadcast. A captura não é prova on-chain independente. |

Todos os 98 têm referência nula e histórico de estágio `enviando`. No ciclo, esse estágio é persistido antes de invocar o executor, portanto não significa que houve broadcast. Nenhum desses 98 terminou como `executada` ou `transmitida`; nenhum fill se juntou por chave exata. Os 93 prompts Gas Station e a falha de simulação vieram do caminho do comando `swap execute`; os 4 impactos altos foram recusados antes desse comando. Estes são códigos/estágios do software, não confirmação de execução ou não execução na cadeia.

Não foi observado código específico de HTTP 429/quota, autenticação/permissão, mínimo/lote ou timeout entre esses 98. Isso não permite descartar essas causas subjacentes: o ledger conserva `reason` e um `detail` opcional limitado, mas não persiste fase, status HTTP, envelope de erro nem estado de broadcast. `taxa_sem_saldo` e `saldo_insuficiente` também não aparecem; `gas_station_pendente` é apenas a categoria emitida pelo adaptador. Seu comentário-fonte descreve um pedido de configuração que cabe ao proprietário, mas a captura não contém o texto original nem saldo e não prova falta de fundos. Nenhum código ausente ou desconhecido ocorreu entre os 98.

Fontes da interpretação: `src/agent/cycle.ts` persiste `enviando` antes do executor e registra estágio, `reason`, referência e quote; `src/agent/cli.ts` define os códigos, o caminho de Gas Station, a regra de impacto e a condição estrita de falha de simulação; `src/agent/ledger.ts` define `reason` e `detail` no registro.

### Prioridades de qualidade de dados

1. Persistir um campo de fase com enumeração estável, distinguindo preparação, quote, validação local, chamada `swap execute`, prompt de confirmação, simulação e recibo.
2. Persistir a classe segura da resposta externa, como classe de saída, status HTTP quando disponível e flags `confirming`/broadcast, sem texto bruto, endpoint, endereço ou segredo.
3. Separar no registro evidência positiva de broadcast, referência de transação e recibo de confirmação da classe de recusa pré-broadcast; não deduzir nenhum desses estados somente de `falhou` ou referência nula.
4. Tornar causas de API distinguíveis por códigos allowlisted, incluindo quota/rate limit, autenticação e saldo/gas, e manter `desconhecido` quando a fonte não fornecer código estruturado.
5. Preservar a chave canônica exata entre ordem, recibo, fill e scoreboard, com fase e timestamps de fonte suficientes para futuras junções sem símbolo ou proximidade temporal.

Não há decisão de ação registrada para estimar custo de ação neste conjunto. Não há fill ligado para observar fee realizada. Portanto, custos estimados e fees realizadas em USD permanecem desconhecidos; fee nativa, se algum registro futuro a contiver, não é USD sem conversão sustentada por fonte. Nenhum PnL, retorno, causalidade ou desempenho financeiro foi inferido. As janelas de inação são observações posteriores da marcação do scoreboard, não resultado causal nem lucro.

## Dados ausentes e freshness

O freshness de ciclo ficou `unknown` nos 120 ciclos. Nos 1,080 itens, 313 tinham simultaneamente fonte e idade registrada: 120 via `evidence.ag`, com idade calculada de fatos `price-info` de posição igual a 0 minutos, e 193 via `evidence.mo.ag`, com idades de 5 a 13 minutos para candles de 5 minutos. Os outros 767 itens tinham freshness `unknown`. Conforme `src/agent/live.ts:230-251,288-304`, a idade `evidence.ag` é o máximo entre idade do timestamp do provider, quando existe, e idade do cache do gateway somada ao tempo desde a leitura local. Ela não representa idade de carteira, saldo ou entrada. Sem timestamp do provider, a medida pode refletir apenas gateway/local e não comprova frescor na origem. As idades são valores gravados no brief, não medições no momento da captura.

Foram observados 2,144 achados `input_unknown`, contados como ocorrências de campo em ciclos/itens, não como registros únicos; 30 janelas não medidas; nenhum achado `data_stale` nos campos com idade, nenhum `stance_diverged`, `estimated_cost_unknown`, `realized_fee_unknown` ou `order_uncertain`. Ausências repetidas incluíram contexto `s1_escolha` e `s1_regime` (120 ocorrências cada), `s1_idade_min` (240), `historico` do brief (120), freshness de item (767), e campos de evidência `p` (695), `n` (575), `v` (240), `tm.r24` (179) e `d` (155). O subsistema local S1 é distinto e opcional; a ausência desses campos não demonstra falha do modelo JEV ativo. Nenhum `data_stale` nos campos com idade não comprova frescor ou qualidade total dos dados. Esses achados indicam lacunas nos registros projetáveis, não determinam por si só se a informação existia fora do registro capturado.

## Limites

Este relatório atribui somente as categorias explícitas acima aos códigos persistidos e à lógica-fonte correspondente. Não confirma execução on-chain, não identifica a causa original além desses códigos, não audita a carteira nem reconcilia operações fora dos journals. Os dados numéricos históricos de `evidence.json` não foram usados. Os gates finais e seus logs sanitizados estão registrados abaixo; as tentativas anteriores feitas pelo executor OMP são inválidas e não contam como gates.

## Gates finais

Execução final sequencial, uma vez cada, com Bun literal e `--no-env-file`, sem repetir gates após falha. Logs stdout/stderr preservados em `%TEMP%/jev-dispatch-gates-20261016T154929Z` (10 arquivos). Duração total observada: 666,529 ms.

| Comando | Exit | Resumo observado | Logs |
| --- | ---: | --- | --- |
| `bun --no-env-file run typecheck` | 0 | Concluído, 3,045 ms. | `typecheck.stdout.log`, `typecheck.stderr.log` |
| `bun --no-env-file run test` | 0 | `7859 pass`, `2 skip`, `0 fail`; 7.861 testes em 481 arquivos, 287.23 s. | `test.stdout.log`, `test.stderr.log` |
| `bun --no-env-file run test:lab` | 0 | `647 pass`, `0 fail`; 647 testes em 16 arquivos, 40.85 s. | `test-lab.stdout.log`, `test-lab.stderr.log` |
| `bun --no-env-file run typecheck:all` | 0 | Typecheck raiz e web concluídos, 10.445 ms. | `typecheck-all.stdout.log`, `typecheck-all.stderr.log` |
| `bun --no-env-file run test:all` | 1 | A etapa raiz terminou com `7855 pass`, `2 skip`, `4 fail` em 7.861 testes/481 arquivos, 324.09 s. Falharam `ignored abort cannot apply late fetch 402`, `ignored abort cannot apply late fetch reject` e dois casos `deadline covers stalled HTTP %s body and releases queued calls`. A parte web não foi alcançada. Duração total 324.489 s. | `test-all.stdout.log`, `test-all.stderr.log` |

Os quatro testes falhos constam no log sem causa diagnóstica adicional atribuível; não houve nova tentativa. T9 continua aberta. Resultados anteriores acima relativos a gates T7 permanecem históricos e não são esta execução.
## Smoke throwaway de resolução manual na HUD

`CycleReviewPanel.tsx` real foi renderizado via React SSR e aberto em Chromium isolado servindo página estática em localhost. Fixture da revisão: ordem `stage=executada`, `reason=resolvida_pelo_usuario`, `fills=[]`; review e item foram abertos no DOM. Observações: motivo exibido como local e explicitamente não prova resultado on-chain; nenhum fill vinculado por chave exata; sem texto de recibo confirmado, confirmação on-chain ou `txHash`. HTML renderizado: 2587 bytes. Não houve chamadas externas, autenticação nem operação. Aba liberada, servidor temporário parado. Log `%TEMP%/jev-agent-gates-bun-final-2026-10-16/manual-resolve-ui.log`.

## T8: admissão e contagem por dispatch físico no transport OnchainOS

A reprodução anterior, antes do cutover, observou dois fetches do retry 50102 separados por 17 ms apesar do `minIntervalMs=1100`; com cap Basic local 1, o gateway registrou `used=2`. Ela não evidencia quota oficial excedida. Após a correção, um smoke isolado executou `bun --no-env-file run src/onchain-read/.t8-real-smoke.tmp.ts` usando Bun, `createOnchainClient`, `createOnchainGateway` e `createBudget` reais; somente fetch/credenciais sintéticos, clock UTC sintético `2026-06-15`, caps injetados e diretório temporário sob Temp foram usados. O helper e seu armazenamento temporário foram removidos; nenhuma API, modelo, CLI, journal ou home operacional foi acessada.

| Cenário | Observação do smoke |
|---|---|
| Basic cap 0 | 0 fetch; `used=0`; `budget_exhausted`; `sent=false`. |
| Basic cap 1 + resposta 50102 que ensina offset | 1 fetch; `used=1`; retry recusado `budget_exhausted`; `sent=true`. |
| Basic cap 2 + mesmo erro de relógio | 2 fetches; `used=2`; sucesso; espaçamento `1105.0218 ms` com default local `1100 ms`. |
| Follower tardia e cache | follower idêntica iniciada depois de a líder consumir cap 1 compartilhou sucesso, sem novo fetch/cobrança (`leader.sent=true`, `follower.sent=false`); cache hit posterior também sem fetch/cobrança. |
| 429/cooldown | resposta inicial `rate_limited`, `sent=true`; chamada durante cooldown `rate_limited`, `sent=false`, sem segundo fetch; após avanço sintético de 30.001 ms ocorreu um envio bem-sucedido. |
| Deadline do retry | timeout de 50 ms durante a espera do retry: `provider_error`, `sent=true`, um fetch/`used=1` mesmo após esperar além do intervalo; nenhum retry tardio. |

`bun test src/onchain-read`: **329 pass**, **0 fail**, **1.310 `expect()` calls**, 18 arquivos. Estes dados descrevem admission/pacing e contagem **locais**; não definem quota do provedor, não alteram caps configurados, HMAC, auth, persistência ou schema. Os cinco gates T9 listados no `status.md` aguardam o integrador e não foram executados nesta fatia.


## T9: estabilização determinística dos testes de deadline

As quatro falhas da execução raiz `test:all` em 2026-10-16 tinham assertions da chamada enfileirada (`sent:false` em vez de `{ok:true,data:[],sent:true}`). A chamada seguinte só começa seu próprio timeout depois que a primeira expira e libera a fila; com timeout real de 20 ms, sob a carga da suíte o deadline monotônico pode vencer antes do guard de dispatch. O guard pré-fetch está correto e permanece; timeout e assertions de contrato não foram afrouxados.

Em `src/onchain-read/client.test.ts`, as famílias `ignored abort cannot apply late fetch` e `deadline covers stalled HTTP body and releases queued calls` usam `vi.useFakeTimers()` (confirmado em probe isolado que `performance.now()` acompanha `advanceTimersByTime`) e barreiras deferred de fetch/body. Mantêm `timeoutMs:20`, provam primeira chamada abortada, segunda chamada enviada/sucesso, efeito tardio ausente no status/tier/cooldown, contagem física e liberação da fila; timers reais são restaurados em `finally`.

Verificação exercitada após a alteração: `bun --no-env-file test src/onchain-read` - 329 pass, 0 fail, 1.320 `expect()` calls, 18 arquivos. Smoke sintético separado com `createOnchainClient` real: fetch/body HTTP 200 pendente expirou como `provider_error,sent:true`, abort signal ativo; a chamada de fila fez o segundo fetch e obteve sucesso; depois o body tardio com código 50011 foi resolvido sem alterar status. Total 2 fetches; arquivo throwaway limpo. Nenhuma rede, credencial real, CLI, serviço ou journal.

Essa correção dos testes não reexecutou os cinco gates. A execução T9 anterior e suas quatro falhas permanecem registradas na tabela de gates acima e nos logs sanitizados em Temp; T9 continua aberta até o integrador rodar novamente os cinco gates.

Atualização após a nova execução aprovada: ambas as famílias foram exercitadas com `bun --no-env-file test src/onchain-read/client.test.ts` (51 pass, 0 fail, 176 `expect()` calls) e a pasta focada completa passou com 329 pass, 0 fail, 1.316 `expect()` calls em 18 arquivos. O smoke throwaway foi ampliado para usar `createOnchainClient`, `createOnchainGateway` e `createBudget` reais, relógio fake, fetch e credenciais sintéticas: a primeira chamada expirou como `provider_error,sent:true`; a chamada enfileirada enviou e teve sucesso; houve exatamente dois fetches e duas unidades basic usadas; o sinal da primeira estava abortado e a resolução tardia do body não alterou status. O helper foi removido.

Os cinco comandos finais foram executados sequencialmente uma vez cada, todos com Bun literal e `--no-env-file`: `bun --no-env-file run typecheck` exit 0; `bun --no-env-file run test` exit 0, 7.859 pass/2 skip/0 fail (7.861 testes em 481 arquivos); `bun --no-env-file run test:lab` exit 0, 647 pass/0 fail (16 arquivos); `bun --no-env-file run typecheck:all` exit 0 (typecheck raiz e web); `bun --no-env-file run test:all` exit 0, raiz 7.859 pass/2 skip/0 fail e web 3.808 pass/0 fail (249 arquivos). Logs stdout/stderr estão em `%TEMP%/jev-dispatch-gates-final-20261016T154929Z`. A tentativa anterior reprovada não foi sobrescrita; seus quatro fails e logs seguem preservados no registro anterior.

Conclusão: T9 está concluída. A alteração foi apenas do harness temporal dos testes - fake clock/barreiras para não depender de 20 ms reais sob carga - sem mudar timeout, guard, produção ou comportamento de dispatch. `pt` segue bloqueado por autorização separada do usuário dono protegido.

## T11: perfil e equivalência da otimização de fills

O perfil pré-fix direto de `buildAnalysis` encontrou mediana de 211.687 ms com 10.000 fills do mesmo símbolo e 6.122 ms com 10.000 fills distribuídos por 100 símbolos. O custo observado era consistente com a cópia cumulativa do grupo a cada fill; a revisão selecionada continuou limitada a 12 ciclos por página.

Para comparação, a implementação anterior e a otimizada foram compiladas no mesmo formato com `bun build src/agent/analysis.ts --target=bun --outfile=...` em diretório exclusivo Temp. As versões compiladas foram importadas na mesma execução de Bun; cada caso teve warm-up e nove medições pareadas, com mediana registrada abaixo. A fixture de fills embaralhou deterministamente registros com timestamps empatados e incluiu vendas parciais, `tokenMinor` desconhecido, e registros incompletos/inválidos; distribuída alternou segmentos buy/sell por símbolo. Inputs foram deep-frozen e serializados antes/depois.

| Fills | Distribuição | Before ms | After ms | Trips before/after | Fees before/after | JSON igual / input imutável |
| ---: | --- | ---: | ---: | ---: | --- | --- |
| 26 | símbolo único | 0.062 | 0.052 | 7/7 | lamports 10,000; fills 26; unmatched sells 2 / idênticos | sim / sim |
| 26 | 100 símbolos | 0.041 | 0.037 | 0/0 | lamports 10,000; fills 26; unmatched sells 0 / idênticos | sim / sim |
| 1,000 | símbolo único | 5.172 | 1.237 | 234/234 | lamports 400,000; fills 1,000; unmatched sells 85 / idênticos | sim / sim |
| 1,000 | 100 símbolos | 1.617 | 1.232 | 375/375 | lamports 400,000; fills 1,000; unmatched sells 0 / idênticos | sim / sim |
| 5,000 | símbolo único | 103.805 | 5.971 | 1,138/1,138 | lamports 2,000,000; fills 5,000; unmatched sells 366 / idênticos | sim / sim |
| 5,000 | 100 símbolos | 8.189 | 6.263 | 1,827/1,827 | lamports 2,000,000; fills 5,000; unmatched sells 0 / idênticos | sim / sim |
| 10,000 | símbolo único | 486.545 | 17.272 | 2,268/2,268 | lamports 4,000,000; fills 10,000; unmatched sells 770 / idênticos | sim / sim |
| 10,000 | 100 símbolos | 26.732 | 17.249 | 3,641/3,641 | lamports 4,000,000; fills 10,000; unmatched sells 0 / idênticos | sim / sim |

Além das fixtures de fills, análise before/after com 120 briefs × 15 candidatos foi JSON byte-idêntica em `reviewPage=1..10`; o handler real read-only `GET /agent/analysis?reviewPage=n` também respondeu byte-idêntico para cada página. O teste existente `bun --no-env-file test src/agent/analysis.test.ts` passou (15 testes, 0 falhas, 43 assertions). Typecheck focado passou com `bun --no-env-file x tsc --ignoreConfig --noEmit --target ESNext --module ESNext --moduleResolution Bundler --strict --skipLibCheck src/agent/analysis.ts`. Os bundles Temp foram removidos após a comparação.

Este é benchmark sintético local; não demonstra latência JEV, financeira, de rede ou de produção. Não foram executados os cinco gates globais desta rodada; ficam para o integrador depois que todas as fontes forem congeladas.

## Brief atual, T15 e follow-ups globais

### Brief após compactação da legenda `ag`

No smoke throwaway atual, `LEGEND.ag` passou de 241 para 156 bytes, com texto: `holding price-info age min=max(provider-ts age if known, cache age+since read); 0 proves neither timestamp presence nor all-input freshness; not balance age`. `LEGEND.pt` permaneceu exatamente `price-info timestamp:1 reported/0 missing; omit=unknown; freshness unverified` (77 bytes ASCII). A compactação não removeu dados nem mudou o enum `pt`.

As funções reais de `agentBrief` foram exercitadas com fixtures sintéticas isoladas. Fixture completa atual: 11.989 bytes com 8 holdings `pt=1`, 7 buys e 32 context keys. Fixture mista atual: 11.948 bytes com os mesmos limites, `holding.h=0.1`, `buy.h=5000` e `pt=1/0/omit`. Valores medidos, não inferidos; ambos estão abaixo do orçamento de referência de 12.000 bytes, que não é guarda ou truncamento do runtime. Zero chamadas externas; helpers temporários removidos.

Após mutação concorrente em `model.test.ts`, foi feita reparação mínima somente de fixture tipada de teste, sem repinar texto nem alterar produção. O teste focused atual `model + analysis + wire` observou 164 testes, 0 falhas, 941 expects em 3 arquivos.

### T15: prioridade de leituras existentes

O algoritmo preserva elegibilidade, `max`, filtros e admissão; ordena plano elegível → posição managed → demais por USD decrescente dentro da prioridade, antes de `max`. No boundary com planos elegíveis acima do `max`, todos os planos continuam selecionados, como no algoritmo anterior que já os preservava; a nova ordem reserva slots e não lê watch adicional nesse caso.

Smoke sintético read-only `runNow → cycle → onBook/status`: com 30 watch-only de US$10.000 e AAA gerida (2,5 × US$4 = US$10), o estado anterior tinha `AAA.usd=null`, `agentUsd=1000`, total=201000. Após priorização, foram selecionadas 20 (AAA +19 watch), `AAA.usd=10`, `quality=current`, `managedOk=true`, `unpriced(managed)=0`, `agentUsd=1010`, total=191010 e 24 linhas. O total menor resulta de uma watch de US$10.000 perder o slot para AAA; não representa perda/redução real de carteira nem resultado financeiro. Foram 20 `price-info` +20 risk =40 chamadas ao gateway fake, sem chamadas externas, API real, CLI, env, modelo offline ou executor; helper removido. Não foi reportada comparação fresh antes/depois 40/40, portanto as 40 chamadas do smoke não provam esse controle.

Testes focados reportados para T15: `live.test.ts` 61 pass/0 fail/171 expects; expandido `bun --no-env-file test src/agent src/onchain-read web/src/lib/hud/hud.test.ts`: 1813 pass/0 fail/8909 expects, 78 arquivos, 35.12 s. São resultados exercitados antes dos follow-ups globais atuais, não substitutos destes.

### Rodada de cinco gates e cobertura afetada

O diretório de logs informado pelo integrador foi `C:/Users/gabri/AppData/Local/Temp/jev-final-gates-7uS1wb`. A rodada reportou: `typecheck` exit 0 (4.740 s); root test exit 0 (7.886 pass, 2 skip, 0 fail; 7.888 testes/480 arquivos, 510.37 s); lab exit 0 (647 pass/0 fail, 16 arquivos, 52.88 s); `typecheck:all` exit 0 (11.996 s); `test:all` exit 0 (root 7.886 pass, 2 skip, 0 fail; 7.888 testes/480 arquivos, 427.33 s; web 3.815 pass/0 fail, 249 arquivos, 39.38 s).

Cronologia informada: início 18:21:09Z; typecheck terminou 18:21:14Z; root terminou 18:29:45Z; lab 18:30:38Z; typecheck:all 18:30:50Z; `test:all` correu 18:30:50-18:38:38Z (root terminou aproximadamente 18:37:58Z; web até 18:38:38Z). `wire.test.ts` recebeu alteração externa de +714 bytes às 18:33:49.474Z durante o root, com ordem de carregamento incerta. `model.ts` recebeu +99 bytes às 18:38:04.562Z durante a etapa web, depois do root e do typecheck:all; por isso esses comandos anteriores não cobrem essa mutação. `model.test.ts` também sofreu mutação externa às 18:42:03Z: um follow-up typecheck:all falhou com TS2542 (Candidate[] readonly) e TS2353 (`favorableTags` ausente em Candidate). O fixture foi tipado/reparado somente em teste; a produção não mudou.

Os três follow-ups liberados inicialmente estavam pendentes no registro daquele checkpoint. Snapshots posteriores com falhas e reparos test-only estão registrados abaixo; a rodada exit 0 acima continua histórica e não demonstra cobertura integral do source/test atual. Não alegar freeze global. T13 permanece formalmente autorizada, mas bloqueada antes de qualquer leitura até confirmar que o avaliador determinístico existente não tem efeitos colaterais e cumpre os limites. Nenhum conteúdo de journal foi lido. A captura histórica read-only de DataHome é outra investigação e não amplia sua autorização.

### Snapshots posteriores e reparos de teste

O snapshot root seguinte de `test:all` reportou 7.885 pass, 2 skip, 3 fail (7.890 testes/480 arquivos; 484.07 s; 984.096 expects); web não executou nesse comando. Na mesma rodada `typecheck:all` teve exit 0 e `test:lab` 647 pass/0 fail, resultados intermediários, não fechamento final. Logs: `C:/Users/gabri/AppData/Local/Temp/jev-final-followup-qi7pwl`.

Falharam uma verificação estática de glob em `src/verification-commands.test.ts` (novos testes fora de `./src/lib`), `source-ecosystem.test.ts:289` (asserção de que `hot-tokens` estava ausente) e `catalog.test.ts:590` (expectativa de limite temporal mínimo). Reparos somente em testes: remoção do arquivo estático inteiro, que cobria seis pontos de script/config/wiring e fake-child mock echo; remoção da asserção inválida de `hot-tokens`, preservando a contagem real de orçamento usado 2→3 no background e sem assert de contagem mock; teste temporal corrigido para aceitar now−1/now e now, rejeitando futuro. Sem mudança de produção/script e sem inventar bug de produção.

Após as remoções, execução web separada reportou 3.824 pass/1 fail (3.825 testes/252 arquivos; 29.63 s; 59.687 expects). A falha foi `vi.advanceTimersByTimeAsync` não suportado pelo Bun 1.3.14 em `web/src/lib/agent/analysis-poll.test.ts:18`; adaptação test-only está em andamento para preservar as verificações de coalescing/publicação. Também foi removido `web/src/components/Agent/DevelopmentReviewView.test.tsx`, teste wording/SSR; nenhuma edição de componente/produção reportada. Logs: `C:/Users/gabri/AppData/Local/Temp/jev-web-wording-followup-qW7V4R`. Gates globais seguem pendentes.
## Fechamento dos gates e prova Chromium atual

Aggregate sequencial final em `C:/Users/gabri/AppData/Local/Temp/jev-final-aggregate-xiGIrS`:

- `typecheck:all`: exit 0, 14.287 s wall, 2026-10-16 19:10:10.615-19:10:24.902 UTC; root `tsc --noEmit -p tsconfig.verification.json` e web `tsc --noEmit`.
- `test:lab`: exit 0, 647 pass/0 fail/838.136 expects, 647 tests/16 files, 41.11 s (wall 41.249 s), 19:10:24.979-19:11:06.227 UTC.
- `test:all`: exit 0, wall 351.332 s, 19:11:06.280-19:16:57.612 UTC; root 7.882 pass/2 skip/0 fail, 7.884 tests/479 files/984.082 expects (328.31 s); web 3.825 pass/0 fail/59.692 expects, 3.825 tests/252 files (22.51 s).

Os três comandos executaram os cinco caminhos de verificação root/web requeridos; não foram cinco comandos standalone. Os dois skips root foram conformance receipt-safety Market/Trader: `RECEIPT_SAFETY_SOURCE` unset/hardening não integrado, portanto não qualificam live. Fallback de metadados cobriu 46 paths conhecidos, com 0 mudanças SHA/mtime/size entre baseline e final/durante os comandos; é observação desse conjunto, não freeze global do checkout. A rodada falha e os reparos somente de teste acima permanecem no histórico, não são o resultado atual.

Prova Chromium em harness Next temporário com AgentView/HUD e CSS reais, usando endpoints locais somente (`GET /agent/status`, `GET /agent/analysis`, `127.0.0.1`): page 1 analysis ficou pendente por dois status polls e publicou após resolução; depois, com page 1 pendente, navegação real à última página manteve page 10 e o marcador “Pagina 10 de 10” após resolução tardia da resposta antiga, sem marcador antigo. Nove status polls; requests de análise page 1=2 e page 10=3 (inclui polling da página atual, não somente requests causados pela paginação); zero erros de browser. Sem CLI de carteira, provider, modelo, journal ou acesso externo. Evidência JSON/screenshot: `C:/Users/gabri/AppData/Local/Temp/jev-agentview-chromium-20260418/evidence.json` e `evidence-page10.png`; o rótulo do diretório não é uma data UTC. Harness e app temporários parados/removidos; não é aplicação completa deployed nem daemon da usuária. Fixtures sintéticas, não saldo/conta real. T13 segue formalmente autorizada, não iniciada; T14 permanece tarefa concorrente.
 
## T16: legenda de `historico` e execuções incertas

- Prova do defeito no código: `cycle.ts:737-752` guarda transmitida como incerta, não marca falha terminal, e chama `mark(o)` para incerta; `mark` grava só campos de `DecisionMark` (`cycle.ts:645-670`); `scoreboard.ts:320-381` classifica toda decisão de compra no grupo `comprar` por mudança do token, sem exigir receipt/fill. A legenda anterior de `model.ts:104` dizia “your actual purchases that rose”. Não inferir que qualquer ordem real capturada ficou sem execução.
- Smoke pré-fix: o `evaluate` fake recebeu das funções reais `agentBrief` e `createJevAgentModel` legenda `your own measured record ... comprar, your actual purchases that rose`. Placar sintético com cinco compras independentes e cinco settlements de +10% produziu `comprar`, `alvo_5` e `fluxo`, cada `{n:5, acerto:100, medio:10, melhor:10, pior:10}`. Fixture completa (8 holdings, 7 compras, 32 context keys) teve 11.113 bytes; SHA-256 da serialização entregue `09bb464d7de2bdcda503ff0b182f997f0ecf0e3737eb926e9d0c1bec46751b1f`.
- Alteração: somente string `LEGEND.historico` em `src/agent/model.ts`; agora explicita scored decisions, not receipts or PnL, que execução pode estar unresolved, e `execucoes` para trips fechadas registradas na chain. Nenhum valor, métrica, fluxo, limite, campo de dados ou risco foi alterado.
- Smoke pós-fix repetiu os mesmos módulos/factories, fake evaluate, scoreboard, settlements, inputs e candidatos. A resposta recebida teve mesmos valores de histórico, 8 holdings/7 compras/32 context keys e mesmas IDs; SHA-256 da fixture sem a legenda `806613132430e5d399a2ee7db72b20ac5c3676fa954df06bd85e9e146cd74641`. Brief final: 11.017 bytes; SHA-256 total `739078a22a4267443291615ee2b0848b10d3566987106894987b76445319bcaa`. Reconstituindo somente a legenda antiga na resposta pós-fix obtém-se exatamente o SHA pré-fix. Descida de 96 bytes; ambos sob referência 12.000, sem truncamento.
- O `evaluate` recebeu state/answers fake local; nenhum modelo real, API, rede, CLI, execução, credencial, `.env`, home privada ou journal foi usado. Sem helper persistente. Esta evidência valida apenas a fixture sintética, não input real nem deploy.

## T16: evidência dos cinco gates finais (2026-10-16)

- Evidências preservadas em `C:\Users\gabri\AppData\Local\Temp\jev-historico-verification`: `summary-2026-10-16T19-58-50-070Z.json`, correção clerical de atribuição root/web em `correction.json`, e logs corretos `typecheck-all-2026-10-16T19-58-50-070Z.log`, `test-lab-2026-10-16T19-58-50-070Z.log`, `test-all-2026-10-16T19-58-50-070Z.log`. Os comandos não foram repetidos.
- `bun --no-env-file run typecheck:all`: exit 0, 8087 ms; root `tsc --noEmit -p tsconfig.verification.json`, web `tsc --noEmit`.
- `bun --no-env-file run test:lab`: exit 0, 34449 ms; 647 pass, 0 fail, 838.136 expect calls, 16 files [34.31 s].
- `bun --no-env-file run test:all`: exit 0, 330790 ms; ROOT 7.882 pass, 2 skip, 0 fail, 984.082 expect calls, 7.884 tests/479 files [306.54 s]; WEB 3.825 pass, 0 fail, 59.692 expect calls, 3.825 tests/252 files [23.70 s]. Os dois skips root: conformance receipt-safety Market/Trader com `RECEIPT_SAFETY_SOURCE` ausente; não qualificam live/integração do hardening.
- Janela UTC: 2026-10-16T19:58:51.118Z-20:05:04.450Z. SHA-256 de 1.730 arquivos selecionados (910 `src`, 138 `scripts`, 678 `web/src`, mais `package.json`, `bun.lock`, `tsconfig.json`, `tsconfig.verification.json`) comparado em 19:58:51.115Z e 20:05:05.066Z: delta 0. O hash de `src/agent/model.ts` permaneceu `5e785adcc2eb00d72795b02872ea3a4f8aecf887ba54ec4b4302b1746620c668`. Isso não demonstra freeze global do repositório/configuração operacional.
- A fonte T16 segue qualificada, não deployed; o binário/API-only anteriormente qualificado precede a mudança da legenda e não qualifica esta versão. Ativação/deploy real continua pendente. T13 permanece autorizada e não iniciada; T14 permanece em execução.

## T17: admissão prévia do fallback 400/413/422

O defeito observado era admissão primária antes do primeiro `evaluate`, seguida de contagem física adicional pós-fato: o fallback manual elegível podia começar sem admitir previamente a segunda chamada sob os limites locais existentes. T17 moveu a admissão para uma callback síncrona obrigatória antes do segundo `evaluate`. O ciclo persiste a segunda admissão antes de finalizar o ticket primário sem usage, gira o ticket ativo após sucesso e não inicia a segunda avaliação se admission/persistência falha. `countExtra` e callers obsoletos foram removidos; `maxRetries: 0` e metadado de `physicalRequests` do sucesso foram preservados.

Prova throwaway standalone pós-fix executada fora do Bun test runner: `C:\Users\gabri\.bun\bin\bun.exe --no-env-file run C:\Users\gabri\AppData\Local\Temp\smoke-t17-cycle.ts`. O script importou diretamente `createCycleRunner`, `createJevAgentModel` e `createBudget` reais e copiou somente fixtures inertes de ciclo (book sintético, posição/cash, facts, bars/timing, limited facts); evaluator e provider fake, API key sintética, persistência em memória. O executor lança se chamado e `executions=0` em todos os casos. Estimate=1000 e usage=11 são valores totalmente sintéticos, não tokens faturados, modelo real ou inferência de quota oficial.

| Caso | evaluateCalls | consults | committedTokens | measuredTokens | unmeasuredCalls | executions | result |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| Cap local 1 consulta | 1 | 1 | 1000 | 0 | 1 | 0 | `modelo_erro` |
| Cap local 2 consultas | 2 | 2 | 1011 | 11 | 1 | 0 | `decidido` |
| Token cap 1000 = estimate 1000 | 1 | 1 | 1000 | 0 | 1 | 0 | `modelo_erro` |
| Falha persistindo begin secundário | 1 | 1 | 1000 | 0 | 1 | 0 | `modelo_erro` |

Stdout JSON observado:

```json
{
  "cap1": {
    "evaluateCalls": 1,
    "consults": 1,
    "committedTokens": 1000,
    "measuredTokens": 0,
    "unmeasuredCalls": 1,
    "executions": 0,
    "result": "modelo_erro"
  },
  "cap2": {
    "evaluateCalls": 2,
    "consults": 2,
    "committedTokens": 1011,
    "measuredTokens": 11,
    "unmeasuredCalls": 1,
    "executions": 0,
    "result": "decidido"
  },
  "tokenEstimate1000": {
    "evaluateCalls": 1,
    "consults": 1,
    "committedTokens": 1000,
    "measuredTokens": 0,
    "unmeasuredCalls": 1,
    "executions": 0,
    "result": "modelo_erro"
  },
  "persistSecond": {
    "evaluateCalls": 1,
    "consults": 1,
    "committedTokens": 1000,
    "measuredTokens": 0,
    "unmeasuredCalls": 1,
    "executions": 0,
    "result": "modelo_erro"
  }
}
```

Em cada caso o resultado hold/erro não disparou executor. Cap1/token cap negaram a segunda avaliação antes de iniciá-la; cap2 admitiu fallback e mediu usage sintético de 11; persistência falha antes da chamada 2 e o único ticket primário foi finalizado com null usage. A prova não altera nem recomenda valores de limites.

- Verificação focada final: `C:\Users\gabri\.bun\bin\bun.exe --no-env-file test src/agent/budget.test.ts src/agent/model.test.ts src/agent/cycle.test.ts src/decision-review/model-retry-review.test.ts` - 238 pass, 0 fail, 882 expect calls, 4 files, 1.070 s. Uma execução anterior teve 237 pass/1 fail: a expectativa incorreta de `mantido` foi corrigida para `decidido` após a resposta válida hold/skip. A regressão `cycle.test.ts` adicional usou fake timers: abort da deadline depois que evaluator iniciou e antes de resolver a recusa 400 resultou em evaluate=1, consults=1, committed=1000, measured=0, unmeasured=1, `modelo_erro`, executions=0. Controle adapter testou 429 sem retry e pre-abort sem evaluate; também abort durante erro 400 não tentou fallback. Smoke temporário removido após execução; nenhum provider/API real, rede, `.env`, CLI, wallet, journal, serviço operacional ou execução de ordem foi usado. Naquele ponto os gates globais ainda estavam pendentes; evidência posterior está abaixo.
- Main executou `C:\Users\gabri\.bun\bin\bun.exe` e confirmou sequencialmente: `typecheck:all` exit 0, 20:28:21.108Z-20:28:28.274Z (7.1681912 s); `test:lab` exit 0, 20:28:28.277Z-20:29:00.511Z (32.2354853 s), 647 pass/0 fail, 838,136 expects, 647 tests/16 files; `test:all` exit 0, 20:29:00.514Z-20:34:21.846Z (321.3342767 s), root 7,878 pass/2 skip/0 fail, 984,091 expects, 7,880 tests/479 files, web 3,825 pass/0 fail, 59,692 expects, 3,825 tests/252 files. Os três comandos agregados cobrem cinco caminhos root/web/lab, não cinco comandos standalone. Dois skips root são casos receipt-safety e não qualificam live.
- Evidência: `C:\Users\gabri\AppData\Local\Temp\jev-admissao-verification-2026-10-16T20-28-20.001Z-543facbb`. Selected-hash monitorou 1.730 paths; hash antes/depois igual e `changed: []`, limitado ao conjunto e sem prova de freeze global. Aviso React `Invalid value prop className` permaneceu nos logs web, não suprimido nem corrigido. Fonte não deployed; serviços intactos. Gates não provam live/PnL/gain, tokens faturados, quota vendor ou deployment.

## T18: smokes e gates da consolidação (2026-10-16)

### Carteira periódica e retenção ecológica

- Smoke standalone do refresh de carteira com `createAgentService` e `createAgentHandler` reais, Temp isolado, `recording:false`, gateway/model/source fakes, relógio/scheduler controlados e runner/CLI configurado para falhar se invocado. Observado: timer 30 s publica antes de GET/ciclo; requests de status apenas leem, sem modelo/execução; um ciclo em 29.999 ms reutiliza o cache; no limite de 30 s é lido valor novo; falha conserva o último valor e horário original como stale; troca de configuração e resultado atrasado não sobrescrevem geração atual; close cancela timers. Fixtures sintéticas, sem API, conta ou execução reais.
- Smoke de produtores reais com fontes públicas fake, `C:/Users/gabri/AppData/Local/Temp/t18-producer-stale-current-kbCxU9/evidence.json`: `synthetic:true`, `providerCalls=0`, `modelCalls=0`, `executionCalls=0`. `createHoldingFactsReader` manteve facts frescos e tornou medições stale desconhecidas (idade preservada); as rotas sintéticas de discovery registraram cinco chamadas nas rotas já usadas (`hot-tokens`, `signals`, `token-risk`, `clusters`, `pools`), com proveniência stale e sem hot-token stale ofertável.
- `createEcosystemSource` com entradas sintéticas frescas/stale mostrou hot fresco validável; sinais stale não preencheram métricas; risco stale deixou o risco sem conferência, sem flags positivas. Na cadeia real `createEcosystemReader`→validação/consumidores: fresh teve candidato, buy candidate, timing e `priceRow`; stale reteve `observedAtMs=1800000000000`, mas 0 candidatos/buys/timing, `openByRisk` baixo/médio 0, Brief stale sem compras, `priceRow:null` e validação `ecossistema_indisponivel`; recovery virou fresh em `1800000000003`. Sem scan: `unavailable`, `observedAtMs:null`, 0 candidatos. Tudo sintético.
- O caminho conjunto de consumidor onchain-read wallet→candidates/risk/price não era injetável pelos fixtures existentes sem construir outro harness/provider; a evidência registra apenas normalizadores individuais read-only. Portanto esse consumidor integrado permanece uma limitação explícita, não uma cobertura inferida.
- Trade-off: guard mantém cadência 45 s e usa o último snapshot do reader compartilhado; movimento em t=31 s pode não ser visto no guard t=45 s com snapshot t=30 s. Refresh t=60 s permite observação no guard t=90 s; leitura expirada nesse limite é compartilhada/coalescida quando concorrente. Não se garante freshness da quote do provedor, latência máxima de JEV ou quota oficial. A leitura periódica 30 s foi aprovada e pode aumentar consumo frente ao ciclo anterior; nenhuma alteração de política, endpoint/cap ou leitura de mercado sem cache foi adicionada.

### HUD isolada

- Chromium abriu `http://127.0.0.1:3017/` com Next/CSS reais e fixtures sintéticas passadas diretamente ao `HudView`; captura `C:/Users/gabri/AppData/Local/Temp/t18-hud-smoke-20261016/evidence/after3-states.json`, 2026-10-16T21:49:03.807Z. Quatro estados consumer-visible preservaram limite independente US$303: missing e failure `SEM DADO DO NUCLEO`; zero `COMPRAS DO DIA US$0`; positive `COMPRAS DO DIA US$7`. Erros do browser: entries 0, dropped 0; console seq1-2 apenas logs React DevTools/HMR. Não é transição HTTP/AgentView completa nem estado de conta real.
- O histórico de smoke anterior contém tentativa POST para `127.0.0.1:3000/agent/wallet` com erro de rede; não se sabe se alcançou o serviço ou alterou estado. Os smokes isolados atuais não usaram 3000/3001 nem reiniciaram/deployaram serviços; isso não determina os efeitos daquela tentativa anterior.

### Regressões e histórico de gates

- Focado scan/backend reportado após as correções: 385 pass/0 fail/1.494 expect calls. A regressão de clocks para o cache/guard manteve as cadências de produção e usou `Date.now` real controlado/restaurado no fixture; grupo final de wallet-change/guard/fence: 5 pass/0 fail/31 expects. LJ23 focado após adicionar `one.code===0` e `pendingEpochs===0`: `C:/Users/gabri/.bun/bin/bun.exe --no-env-file test ./scripts/jev-lab-real.test.ts --test-name-pattern 'LJ23 resuming with larger caps never consults an epoch twice, and the journal is the one a single run would have written'` - 1 pass, 67 filtered, 0 fail, 7 expects, 1.055 s. As igualdades de journal/stdout e accounting foram mantidas.
- Histórico do `test:all`: primeiro worker parou sem footer após 1.625 pass, 0 fail rows; a execução terminou exit 1 após interrupção diagnóstica autorizada, sem web e sem resultado conclusivo. A investigação identificou que o fixture aguardava nova leitura enquanto o snapshot compartilhado ainda estava fresco; o relógio de serviço usado não avançava `Date.now`. Após fixture correto com mock/restauração global do relógio, o focado `t11` teve 2 pass/94 filtered/0 fail/14 expects/928 ms.
- A rodada subsequente teve quatro falhas de asserção wire por fixtures que esperavam nova observação antes do cache 30 s; corrigidas apenas as fixtures para representar snapshots observados sem alterar cache, cadência guard, thresholds ou política. Outra rodada (`pO4dof`) reportou 17 falhas porque o PATH temporário do runner não incluía `powershell.exe`; não é classificada como regressão de produto.
- Aggregate `ccddb48b`: `typecheck:all` 0; `test:all` root 7.905 pass/2 skip/0 fail e web 3.826 pass/0 fail; `test:lab` 646 pass/1 fail. A única falha LJ23 comparou journal recebido com seis epochs completas adicionais (90 linhas) além do single-run esperado até epoch 22. Os arquivos originais do caso estão indisponíveis: o `afterAll` do próprio `scripts/jev-lab-real.test.ts` remove `SCRATCH` e o Temp também foi limpo por Fast; não é possível atribuir exclusivamente a Fast nem confirmar conteúdo além do raw diff preservado. Causa raiz histórica permanece indeterminada; não se afirma que os asserts novos a corrigiram.
- Harness diagnóstico sintético, `C:/Users/gabri/AppData/Local/Temp/t18-lj23-diagnostic-ccddb48b/evidence.json`, executou cap6→resume e single run com a implementação/CLI reais e Jev/captura sintéticos; 29 epochs/436 linhas observadas, bytes de journal e relatórios iguais nos pares comparados. Isso não reproduziu nem explica a discrepância histórica. O scaffold foi removido.

### Aggregate atual fornecido pelo Main

- Evidência: `C:/Users/gabri/AppData/Local/Temp/jev-trader-final-gates-t18-ceeb1aae-4ed9-4db1-8911-aada10e8b722`. Janela 22:55:34.083-23:01:56.764 UTC; launcher exit 0. `typecheck:all` 0 (22:55:36.126-22:55:45.373 UTC, 9.246 s); `test:lab` 0 (22:55:45.378-22:56:21.669, 36.291 s; 647 pass/0 fail, 838.138 expects, 647 tests/16 files); `test:all` 0 (22:56:21.673-23:01:55.845, 334.172 s; root 7.905 pass/2 skip/0 fail, 984.329 expects, 7.907 tests/479 files; web 3.826 pass/0 fail, 59.722 expects, 3.826 tests/252 files). Dois skips root não qualificam live.
- Snapshot raw de hashes: 1.731 paths antes/depois, delta 0 (adicionados/removidos/alterados 0). `hash-scope-adjustment.json` explica inclusão extra de `web/bun.lock` pela regra aplicada ao lockfile root; derivação consistente 1.730/1.730 também delta 0. Nenhuma causa foi inferida para diferença com contagens antigas além desse ajuste documentado; contagem raw fica preservada.

T18 fica qualificada somente para os comportamentos sintéticos exercitados. Sem deploy/live, sem inferência de PnL ou desempenho de decisão. T13 não iniciada; T14 continua em execução.

## T14: proteção contra overflow numérico na carteira

- Correção em `src/agent/book.ts`: conversão decimal não finita vira valor desconhecido; multiplicação/mescla/soma não finitas também viram `usd=null`; arredondamento não escala números acima de `Number.MAX_VALUE / 100`; totais overflowados ficam desconhecidos e `cashByChain` omite a chain indisponível. `balanceMinor` continua sendo somado em `BigInt` e preservado exatamente. Não se alterou a política de liquidez (inclusive zero sem liquidez).
- `C:\Users\gabri\.bun\bin\bun.exe --no-env-file test src/agent/book.test.ts`: exit 0, 30 pass, 0 fail, 95 expect calls, 1 arquivo, 214 ms.
- Smoke throwaway percorreu `createOkxPortfolioClient` real com um fetch sintético, `bookFromAssets` e `verifyBook`; credenciais eram constantes falsas e nenhum header foi impresso. `fetchCalls=1`. No build, ETH/SAFE/SAFE2 tiveram `usd=1e+308` finito; produto `OVER` ficou unknown com preço finito 2; `UNKNOWN` sem preço ficou unknown e manteve raw `"1"`. O total/agentUsd foram `null` pois a soma de valores `1e+308` excederia o domínio finito. Após verificação sem liquidez, ETH permaneceu `1e+308`, tokens não nativos ficaram desconhecidos e totais permaneceram finitos (`1e+308`). A saída original está em `C:\Users\gabri\AppData\Local\Temp\t14-wallet-overflow-smoke-output.json`; os flags `finite`/`totalFinite=true` significam `null OR Number.isFinite(value)`, não `Number.isFinite(null)`, conforme nota separada `t14-wallet-overflow-smoke-output.metadata.json`. O smoke registrou os valores monetários por `String(number)`; JSON sozinho poderia mascarar `Infinity` como `null`. Raw balances extensos permaneceram idênticos. Helper removido; smoke apenas sintético, sem rede, API ou conta.
- Evidência pré-fix coletada por worker anterior em `C:\Users\gabri\AppData\Local\Temp\t14-wallet-overflow-evidence.json` registrava `Infinity` no ativo native de 309 dígitos, totais e verificação. O rótulo anterior de “evidência pré-fix do integrador” atribuía incorretamente sua autoria; esta correção registra a origem conhecida sem reescrever o raw original. O smoke sintético acima não é saldo real nem prova de produção. Nenhum gate global foi executado nesta fatia.
### T14: prova do polling real de AgentView

- Evidência preservada em `C:/Users/gabri/AppData/Local/Temp/t14-agentview-poll-20261016/evidence/agentview-polling.json`, `02-503-stale.png` e `04-recovery.png`. No harness temporário Next, AgentView e o hook de polling foram reais; cinco polls HTTP locais foram interceptados por fixtures: 200 com `managed=1234.56`, 503, timeout pendente por 13 s (timeout configurado de 10 s), e dois 200 de recovery. As duas respostas de recovery mantiveram o mesmo `observedAt`.
- Após 503, a UI conservou US$ 1.234,56, mostrou banner de falha e idade 0 min; durante o timeout, conservou o valor e mostrou idade 1 min; no recovery, o banner foi removido, mas o `observedAt` inalterado não prova um Book novo. Portanto a evidência demonstra preservação/apresentação de estado stale e recuperação do polling, não atualização de snapshot.
- O harness serviu cópia dos bytes de `web/src` (a junction original não funcionou), com AgentView/HudView/hooks reais e wrappers mínimos de app/layout; não exercitou layout/app de produto nem alterou fonte. Erros do browser foram consultados somente após o load, não ao final; não se declara ausência de erros durante toda a sessão. Screenshot `02-503-stale.png` ainda mostra o indicador benigno `Compiling...`.
- O servidor Next isolado usou `127.0.0.1:43189`; nenhum serviço em 3000/3001 foi iniciado/reiniciado. Harness, tab, cópias e configuração/cache temporários foram limpos; apenas as evidências listadas foram preservadas. Sem consulta a carteira/credenciais/rede/serviço JEV, execução ou dados reais.
- Limite adicional do smoke: os cinco polls foram fixture HTTP da UI e não mediram a quantidade de leituras no `BalanceSource`. Um poll de status a cada 6 s não é uma leitura de carteira 1:1; a rota pode iniciar/compartilhar o refresh de Book de 30 s. Timer/cache/single-flight não provam ausência de chamada inicial nem volume geral menor. Não foi autorizado nem realizado GET de produção.

### T14: identidade da resposta de carteira

- Worker exercitou `createOkxPortfolioClient` real com fetch sintético; evidências antes/depois em `C:/Users/gabri/AppData/Local/Temp/t14-wallet-identity-before.json` e `.../t14-wallet-identity-after.json`. Antes, resposta request chain 8453/wallet A com item chain 1/wallet B era admitida e produzia Book `usd=2`; depois, mismatch de chain ou identidade explícita é rejeitado (`Wallet balance response does not match request identity`).
- Resposta de chain 8453 com address EVM equivalente por casing continua admitida e produz `usd=2`. Variante de casing não-EVM é rejeitada, preservando igualdade case-sensitive nesse formato. Address vazio na resposta continua admitido e não é tratado como mismatch; chain/address válidos continuam aceitos. Evidência synthetic, 1 fetch por caso; sem consulta de carteira ou rede reais.
- Focado final com Bun 1.3.14: `C:/Users/gabri/.bun/bin/bun.exe --no-env-file test src/okx-wallet/portfolio.test.ts` - exit 0, 9 pass, 0 fail, 49 expects, 1 arquivo. A contagem 45 expects anterior era intermediária, substituída pelo resultado final.
  Evidência adicional `C:/Users/gabri/AppData/Local/Temp/t14-wallet-identity-independent-regression.json`: mismatch apenas de chain com wallet correta e apenas de wallet com chain correta são rejeitados independentemente (1 fake fetch cada); controle válido permanece admitido com `bookUsd=2`. Arquivo do teste e ownership conferidos; `portfolio.ts` não precisou de reedição.

### T14: deduplicação no caminho de source e consumo

- Evidência `C:/Users/gabri/AppData/Local/Temp/t14-ecosystem-proof-20261016/evidence/sourcepath-dedupe.json`: `createEcosystemSource.build/readChain` e caminho real de candidato/Brief, com gateway fake em memória e dados sintéticos fresh. Quatro hot rows reportadas; um par EVM 8453 com casing diferente colapsou em um candidato; IDs não-EVM chain 501 com `AbC`/`abc` permaneceram distintos. Candidate IDs, Brief IDs e item keys formaram o mesmo conjunto exato de três IDs. Foram 7 chamadas ao gateway fake com `sent:false`, `onchainosCalls=0`; sem modelo, carteira, CLI, journal, API externa ou serviço operacional.
- O harness inicial falhou apenas na serialização de evidência (`built.candidates[].facts`); foi corrigido para serializar `built.ecosystem.candidates` e executado novamente. JSON final registra todas as checks como true. Esta prova usa resultado `InternalGatewayResult` normalizado fake e não exercita normalização do payload HTTP em `src/onchain-read/catalog.ts`; esse limite não qualifica parser bruto.

### T14: normalização de risco e frescor temporal do parser

- Fonte quiescente em `src/onchain-read/catalog.ts`, `src/agent/model.ts`, `src/agent/timing.ts` e `src/agent/live.ts`, com regressões em `catalog.test.ts`, `live.test.ts` e `model.test.ts`. Valores `riskControlLevel: 0` e `riskLevelControl: 0` agora normalizam para `null`; níveis 1-5 permanecem. A legenda do modelo usa “provider risk 1-5; null unknown”.
- Smoke sintético raw-parser→HoldingFacts/agentBrief/ecosystem e timing/momentum, usando a última entrada (`commands[-1]`, oitava execução) do aggregate: zero e campo ausente resultam em risco desconhecido (`null`), sem família de segurança no ecosystem; nível 1 continua numérico e produz a evidência correspondente. Mudança 24h independente (`-3.5`) sobrevive quando risco é desconhecido. Valores raw de LP 74.36 e top-10 13.68 são preservados; top-10 inválido 101 vira null, sem descartar a mudança independente. `agentBrief` foi apenas composto; não houve chamada Jev/modelo, cálculo de score ou alteração de fórmula/limites. Índice 5 (6ª execução) é tentativa incompleta marcada superseded; índice 6 (7ª) é intermediário válido; índice 7 (8ª) é a evidência final. 
- Prova complementar atual de consumer path (2026-10-17): `C:/Users/gabri/AppData/Local/Temp/t14-current-source-consumer-20261017/{evidence.json,smoke.json}`. `riskLevel=0` virou `null`, nível 1 permaneceu 1; risco fresco independente permaneceu disponível quando `/price-info` estava stale por 7 min, enquanto as métricas de preço ficaram `null`; futures foram descartados. LP burn 74.36 e top-10 13.68 permaneceram em unidades percentuais; concentração top-10 101 virou `null`, sem confundir com return-percent 101. Focado `live.test.ts` + `catalog.test.ts`: 169 pass/0 fail/579 expectativas; janela de hashes estáveis limitada a 8 arquivos, zero externas. Esta prova sintética não implica cobertura de todos os providers nem taxa/quota. Nenhuma consulta paga JEV.
- Barras horárias/5m positivas e coerentes geram fatos. Alterar apenas o timestamp da barra mais recente para `NOW+1ms`, após normalização real de candles, faz timing e momentum não produzirem fatos; regressão de relógio não serve nem rejuvenesce cache (o retorno ao relógio original conserva a idade original, com uma leitura do gateway). Candle mais recente OHLC incoerente é rejeitado pelo normalizador e não produz fato temporal; limiares técnicos não mudaram.
- Focado: `C:/Users/gabri/.bun/bin/bun.exe --no-env-file test src/onchain-read/catalog.test.ts src/agent/live.test.ts src/agent/model.test.ts` - exit 0, 232 pass/0 fail/911 expectativas. Smoke sintético em `C:/Users/gabri/AppData/Local/Temp/t14-risk-timing-smoke.ts` - exit 0, `Bun.version=1.3.14`; nenhum acesso externo.
- Aggregate preservado em `C:/Users/gabri/AppData/Local/Temp/t14-parser-smoke-evidence.json`, incluindo o JSON histórico sem sobrescrita. O rótulo antigo `Bun v24.3.0` veio de `process.version` (compatibilidade Node), não `Bun.version`; a execução corrigida é Bun 1.3.14. A evidência overflow pré-fix foi coletada por worker anterior, não fornecida pelo usuário. Ambos os erros de atribuição estão anotados sem reescrever o registro raw.
- O teste focused e o smoke não substituem os gates globais. A rodada global posterior ao GO está documentada abaixo; sem inferência de cobertura de todos os providers, comportamento live ou produção.

### T14: rodada global e correção da asserção de identidade

- Runner sequencial com Bun físico e `--no-env-file`: `typecheck:all` exit 0; `test:lab` exit 0 (647 pass/0 fail, 838.138 expectativas, 16 arquivos, 35.34 s); `test:all` exit 1 (7.913 pass, 2 skip, 1 fail, 7.916 testes/479 arquivos, 984.373 expectativas, 458.59 s). Root falhou; web não foi alcançada, embora `typecheck:all` root/web tenha passado. Detalhes e horários completos em `status.md`.
- O raw `test-all.log` registra a asserção antiga esperando `Wallet balance response does not match request identity`, contra mensagem recebida `Balance response does not match request identity`. Após essa execução, o editor autorizado trocou a asserção textual por `.rejects.toMatchObject({ kind: "schema" })`. O focused citado (Bun 1.3.14, 9 pass/0 fail/49 expectativas, 229 ms) é anterior e não foi repetido após a edição; não é validação do novo assert. Não houve rerun do aggregate.
- Smoke sintético posterior com `createOkxPortfolioClient`→Book real e fetch fake: `C:/Users/gabri/AppData/Local/Temp/t14-identity-contract-smoke-evidence.json`. Executável Bun físico/Bun.version 1.3.14; `process.version=v24.3.0` é a versão de compatibilidade Node do Bun, não execução de Node. 6 fetches injetados, `externalRequests=0`, credenciais falsas. EVM case variant e address vazio tiveram `bookAgentUsd=2`; chain não solicitada, wallet errada na mesma chain, casing não-EVM e resposta mista foram rejeitados com `kind=schema`, e a mista foi rejeitada antes da criação do Book. Nenhuma rede real.
- Evidências do runner original em `C:/Users/gabri/AppData/Local/Temp/t14-final-gates-20261016/run/`, com abort de preflight inicial em `preflight-abort.json`. A rodada subsequente do executor designado está registrada abaixo; o delta zero vale somente para os 1.730 paths selecionados durante essa janela, não cobre o repositório todo nem alterações posteriores.

### T14: aggregate após correção da asserção de identidade (2026-10-17; não verde)

- Sequência com Bun físico e `--no-env-file`: `typecheck:all` exit 0; `test:lab` exit 0 (647 pass, 0 fail, 838.138 expectativas, 16 arquivos, 40,58 s); `test:all` exit 1 (7.913 pass, 2 skip, 1 fail, 7.916 testes/479 arquivos, 984.374 expectativas, 370,61 s). O typecheck root/web passou; os testes web não foram alcançados após a falha root. Horários e caminhos em `status.md`.
- A falha única foi o teste money-mode de fechamento de compra em `src/agent/wire.test.ts:1303:40`, no assert de `typeof lines[0].quoteFailure`: esperado `"string"`, recebido `"object"`. Causa desconhecida pelo log. O teste `wallet response identity matches requested chain and address with network-specific casing` passou na rodada completa (`test-all.log:4821`), já com o assert por `kind: "schema"`.
- Saída isolada em `C:/Users/gabri/AppData/Local/Temp/t14-final-gates-20261016/run-after-identity-contract/`. O resumo registra 1.730 caminhos selecionados, sem add/remove/exclusões sensíveis e delta de hash 0 apenas nesse escopo/janela. Aggregate não verde; T14 permanece aberta. Nenhuma inferência de providers globais, live ou produção.

### T14: regressão focalizada do fechamento e smoke limitado (2026-10-17)

- Correção do handoff: o focused final usa `const svc = make()` e as fixtures module-level normais, sem `fixedNow` ou retiming de rows/gateway/source/`options.now`. Bun 1.3.14: 1 pass, 96 filtrados, 0 fail, 8 expectativas, 1,87 s. Preserva orçamento de teste existente `maxConsultsPerDay: 720`/`maxTokensPerDay: null` (o 300 do handoff anterior estava desatualizado), `incerta`/`transmitida` e exatamente uma execução fake; sem alteração de produção reportada. A reserva calculada (144) e margem (575 após uma consulta) são do orçamento de teste, não quota oficial de provider.
- `C:/Users/gabri/AppData/Local/Temp/t14-wire-identity-isolation/wire-reserve-smoke-evidence.json` documenta apenas o consumidor sintético `runClosing` com Budget/clock injetados: zero chamadas de rede; com budget default 144/null, 00:00 UTC pula sem quote, enquanto 14:10 UTC emite uma quote bound com `quoteFailure` e `wouldReason` `quote_identity_mismatch`. Não executa `createAgentService` inteiro: `localNow` em `wire.ts` lê `Date.now`; `options.now` só afeta a assinatura de exchange.
- O executor concluiu a rodada sequencial em `run-after-wire-contract/`; resultados e logs preservados abaixo. Nenhum gate adicional foi executado por este integrador; a suíte `test:all` não ficou verde.

### T14: aggregate após a alteração final do caso wire (2026-10-17; não verde)

- Com Bun físico e `--no-env-file`, `typecheck:all` exit 0 (root/web); `test:lab` exit 0 (647 pass/0 fail, 838.138 expectativas, 16 arquivos, 42,48 s); `test:all` exit 1. Root: 7.914 pass, 2 skip, 0 fail (7.916 testes/479 arquivos, 984.375 expectativas, 399,18 s). Web: 3.825 pass, 1 fail (3.826 testes/252 arquivos, 59.722 expectativas, 38,61 s). A web suite foi executada; horários em `status.md`.
- Os skips root são os dois testes `receipt-safety` (Market e Trader), dependentes de `RECEIPT_SAFETY_SOURCE` e descritos no raw como hardening não integrado ao main. A falha web foi `mounted FlowChart reports unavailable PnL for every non-finite or missing field`, timeout do DevToolsActivePort loopback-only do Edge (último valor null), `web/src/lib/flow-chart-render.test.ts:486`→`:180`, 12,13 s. O stdio da falha original foi ignorado, portanto seu stderr/exit reason não foi preservado; não há causa estabelecida.
- O teste de identidade da carteira passou (`test-all.log:4816`) e o fechamento money-mode wire passou (`:1872`). Resumo/logs em `C:/Users/gabri/AppData/Local/Temp/t14-final-gates-20261016/run-after-wire-contract/`. Preflight: 1.730 paths selecionados, sem add/remove/exclusões sensíveis e hash delta 0 somente no escopo/janela; não é freeze global. Aggregate exit 1; T14 aberta.

### T14: correção de leitura documental da identidade de carteira (2026-10-17)

- Conferidos os docs oficiais [Get Total Value](https://web3.okx.com/es-es/onchainos/dev-docs/market/balance-total-value) e [Get Total Token Balances](https://web3.okx.com/cs/onchainos/dev-docs/market/balance-total-token-balances): ambos exigem `address` e `chains` (até 50 IDs; a primeira página define `chains` como String separada por vírgulas, a segunda como Array com valores separados por vírgulas). Em `all-token-balances`, `chainIndex` é resposta em `tokenAssets`, não campo de request; `excludeRiskToken` default `0` filtra, `1` não filtra.
- A página de saldos mostra request EVM mixed-case (`0xEd0C6079229E2d407672a117c22b62064f4a4312`) e `tokenAssets.address` lowercase (`0xed0c6079229e2d407672a117c22b62064f4a4312`); `rawBalance` pode ser vazio em chains não suportadas. Leitura documental apenas; nenhuma chamada ao provider.

### T14: diagnóstico focalizado posterior do bootstrap Edge (2026-10-17)

- O worker acrescentou apenas captura de diagnóstico do bootstrap em `web/src/lib/flow-chart-render.test.ts`; os 6 s de espera e assertions/teardown de PnL, resize, console e network permaneceram. Não houve novo aggregate.
- Evidence `run-after-wire-contract/edge-inert-env-bootstrap-evidence.json`: builder/env do runner, profile novo, Bun 1.3.14 físico `--no-env-file`, mesmos Edge flags e caminhos inertes/keys allowlisted; DevToolsActivePort visto 637 ms após spawn (53978), `/json/version` 200 (`Edg/155.0.4283.45`), ack `Browser.close`, PID próprio exit 0, porta fechada. O stderr registra `Edge LLM catalog update failed:5`, mas nenhum vínculo com o timeout. O summary reteve só `PATHPrefix`, sem PATH herdado completo, então não prova ambiente byte-a-byte do aggregate; a execução avulsa prévia com home herdado também não provava causa.
- O wrapper esperado `flowchart-expected-launch-failure.json` usou Bun como `EDGE_PATH`; o filho saiu 1 com `error: Script not found "about:blank"`, e o teardown fechou o fixture server/porta e encerrou o PID. Este é um diagnóstico-falha esperado, não resultado positivo de PnL.
- `flowchart-focused-mounted-evidence.json` registra o focused real imediatamente após: 2 pass/0 fail (caso mounted + helper PID), exatamente 18 `.evidence.observations` e todas `passed === true`, console/network vazios; Edge spawn 00:38:45.481Z, port 00:38:46.138Z, `Browser.close` ack, PID exit 0 e duas portas fechadas. É prova focalizada, não rerun do aggregate; a causa da falha original segue desconhecida e T14 permanece aberta.

### T14: focused mounted com metadados v5 (2026-10-17)

- `run-after-wire-contract/flowchart-focused-mounted-metadata-v5.json`: Bun físico 1.3.14 (`Bun.version=1.3.14`, `--no-env-file`; `process.version=v24.3.0` é a versão de compatibilidade Node do Bun); Edge identificado após `/json/version` como `Edg/155.0.4283.45`. A evidência registra PnL observado no DOM do FlowChart montado e callback nativo de ResizeObserver via `Runtime.evaluate` por observer de teste, sem instrumentação do observer de produção. Resultado 2 pass/0 fail, 18 observações todas passed, sem erros de console ou requests cross-origin. `Browser.close` ack, processo Edge próprio exit 0, fixture server parado e ambas portas próprias fechadas.
- É prova de fixture sintética de componente, sem carteira/provider/serviço de produção ou dados vivos. `flowchart-metadata-interpretation-correction-v5.json` explicita que browserLaunch é intenção/configuração, browserVersion só aparece após `/json/version`, `mountedActualFlowChart` depende da observação DOM e `resizeObserverObservation` do callback nativo do observer de teste. Raw anterior preservado, não sobrescrito.
- `flowchart-expected-launch-failure-metadata-v5.json`: diagnóstico esperado com Bun em `EDGE_PATH`, filho exit 1 (`Script not found "about:blank"`), nenhum mount/browserVersion/observer ou observação, `Browser.close` ack null, processo próprio exit 1; fixture server parado e porta fechada. O wrapper também saiu 1 depois de gravar ambos os JSON por `EACCES` na limpeza automática do scaffold; o worker removeu os scaffolds inertes v2-v5 e runners v3-v5 próprios e preservou evidências/logs.
- v3 registrou falhas distintas de app-data/bootstrap; v4 chegou ao bootstrap/versão do Edge, mas a avaliação assíncrona do observer falhou; v5 usou observação síncrona e passou. Esses diagnósticos não identificam a causa da falha aggregate original, cujo stderr/exit reason segue desconhecido.

### T14: aggregate autorizado após diagnóstico do browser (2026-10-17; não verde)

- Uma rodada sequencial autorizada com Bun físico 1.3.14 (`--no-env-file`), 00:57:58.724Z-01:04:21.322Z: `typecheck:all` exit 1 por TS2352 em `src/local-host/service.test.ts:25:26` (mock→`AgentService` sem métodos obrigatórios); o typecheck web foi curto-circuitado. `test:lab` exit 0, 647 pass/0 fail/838.138 expectativas/37,11 s. `test:all` exit 1, root 7.914 pass/2 skip/0 fail (7.916 testes/479 arquivos/984.376 expectativas/315,62 s), web 3.822 pass/5 fail (3.827 testes/252 arquivos/59.722 expectativas/24,24 s).
- Cinco falhas web: `agent-render` esperava rótulo de carteira ausente; `deck-render` wording divergente; `parse-book` esperava estado parcial, recebeu stale; dois casos HUD esperavam `readAtMs`/`lastReadMs=1791989760000`, mas receberam null/stale (cash 800 e total 1010 presentes). Evidência mounted FlowChart consta no raw, mas não elimina as falhas web. Causas não inferidas.
- Evidências `C:/Users/gabri/AppData/Local/Temp/t14-final-gates-20261016/run-after-browser-diagnostics/{summary.json,typecheck-all.log,test-lab.log,test-all.log,scope-preflight.json}`. 1.730 caminhos selecionados, hash delta zero apenas nesse escopo; não é freeze global. Sem source edits durante a rodada; outputs de falha preservados, sem rerun. T14 não pode fechar.

### T14: focused de cinco regressões após aggregate não verde (2026-10-17)

- Alterações posteriores ao aggregate restritas a `src/local-host/service.test.ts`, `web/src/lib/agent/agent-render.test.tsx`, `web/src/lib/agent/deck-render.test.tsx`, `web/src/lib/agent/parse-book.test.ts` e `web/src/lib/hud/hud.test.ts`. Cobertura: composição de service com `createDesktopHandlers`/`AgentService` e fechamento real, fixture observada para identidade wallet, comportamento no-curve mantido sem comparar wording deck por cópia exata, partial parse com observação e estados HUD legacy/never-read null/stale mantidos.
- Comando focused, cwd raiz: `C:/Users/gabri/.bun/bin/bun.exe --no-env-file test --parallel=1 --timeout 15000` mais os cinco arquivos acima - 159 pass/0 fail/2.736 expectativas. Typecheck root e web passaram separadamente; evidências `C:/Users/gabri/AppData/Local/Temp/t14-six-failures-typecheck.json` e `.../t14-six-failures-web-typecheck.json`.
- `C:/Users/gabri/AppData/Local/Temp/t14-six-failures-final-evidence.json` não é evidência integral all-pass: subitem `consumerSmoke.code=1` registra eval executado do cwd raiz e falha de resolução de React. O smoke válido separado `C:/Users/gabri/AppData/Local/Temp/t14-six-failures-consumer-smoke.json` foi executado no cwd web, exit 0; observou timestamp HUD, comportamento legacy null/stale e never-read null. O smoke de cwd incorreto continua preservado; não houve alteração de fonte/dependência para corrigi-lo. Nada disso reroda nem muda o aggregate não verde.

### T14: aggregate após fixtures de regressão (2026-10-17; não verde)

- Rodada sequencial com Bun físico 1.3.14 (`--no-env-file`): `typecheck:all` exit 0 (root/web); `test:lab` exit 0 (647 pass/0 fail/838.138 expectativas/16 arquivos/35,58 s); `test:all` exit 1 na suíte root (7.913 pass/2 skip/1 fail; 7.916 testes/479 arquivos/984.349 expectativas/519,12 s). Web não foi alcançada porque `test:all` é root seguido de web.
- Falha única: `scripts/reports-server.test.ts: invalid flags and occupied ports fail with controlled messages without echoing arguments` excedeu 10 s (10.004,15 ms); o log informa `killed 1 dangling process`. Summary e logs preservados em `C:/Users/gabri/AppData/Local/Temp/t14-final-gates-20261016/run-after-current-fixtures/{summary.json,typecheck-all.log,test-lab.log,test-all.log}`. Sem rerun.
- Preflight: 1.730 paths, sem mudança de paths ou exclusão sensível, hash delta 5 (`src/agent/live.test.ts`, `src/agent/live.ts`, `src/onchain-read/catalog.test.ts`, `src/onchain-read/catalog.ts`, `web/src/lib/hud/hud.test.ts`). Origem do delta desconhecida; executor reporta não ter editado fonte durante a execução. Escopo não implica freeze global; T14 não verde.
### T14: focused de isolamento CLI e consumidores da fonte atual (2026-10-17; sem novo aggregate)

- Após o aggregate não verde, `scripts/reports-server.test.ts` foi reorganizado em 18 cenários CLI nomeados separadamente, sem aumentar o watchdog de 2,5 s, retry, skip ou alteração de produção. Focado físico Bun 1.3.14 (`--no-env-file test --parallel=1`): exit 0, 21 pass/0 fail/97 expectativas/3,62 s. Smoke throwaway da CLI real: 18/18 encerraram code 1 sem timeout, stdout vazio ou vazamento de `SECRET_TEST_MARKER`; 159-257 ms/caso. No caso de porta ocupada, health HTTP 200 e estado read-only (`executionEnabled:false`, `liveFeedEnabled:false`) foram preservados. Evidência `C:/Users/gabri/AppData/Local/Temp/t14-reports-server-case-isolation-20261017/evidence.json`. Isto não determina a causa do timeout histórico do aggregate.
- Prova independente do consumer atual: focused em `src/agent/live.test.ts` e `src/onchain-read/catalog.test.ts`, Bun 1.3.14, exit 0, 169 pass/0 fail/579 expectativas/839 ms. Smoke sintético com respostas e `Date.now` atuais percorreu normalizers `endpointFor` → `createHoldingFactsReader`/`createEcosystemSource` → candidate e Brief, sem chamadas externas, provider ou modelo; risco 0 permaneceu desconhecido e risco 1 foi mantido; preço 2.25 sobreviveu a métricas opcionais inválidas; preços stale/futuros não viraram fatos frescos, sinais stale/futuros não pontuaram e sinal fresh chegou a candidate/Brief. Evidências `C:/Users/gabri/AppData/Local/Temp/t14-current-source-consumer-20261017/{evidence.json,smoke.json}`.
- Naquele checkpoint não havia novo aggregate; round5 era a rodada mais recente. O aggregate final autorizado, executado depois, está documentado abaixo. A prova não cobre `web/src/lib/hud/hud.test.ts`, que continua ausente e não foi recriado.

### T14: aggregate anterior à correção de deadlines (2026-10-17; não verde)

- Uma única rodada autorizada com Bun físico 1.3.14 e `--no-env-file`, 01:41:06.220Z-01:52:29.577Z: `typecheck:all` exit 0 (root `tsc --noEmit -p tsconfig.verification.json`; web `tsc --noEmit`); `test:lab` exit 0, 647 pass/0 fail/838.138 expectativas/16 arquivos/64,38 s; `test:all` exit 1 na suíte root, 7.931 pass/2 skips/2 fails (7.935 testes/479 arquivos/984.352 expectativas/587,64 s). A suíte web não foi executada porque a etapa root falhou e o script encadeia `&& bun --cwd web test`.
- Falha Signals: `uses one deadline for headers and body, aborting even when a transport ignores the signal` perdeu somente a asserção elapsed `<250 ms` (325,58 ms; `client.test.ts:56`); a rejeição por deadline anterior passou e as asserções posteriores de abort/calls não foram alcançadas. Falha gateway `late fetch success does not populate gateway cache`: `Expected true / Received false` em `gateway.test.ts:83`; mapping de fonte/posição Bun é ambíguo e o boolean não estabelece qual semântica falhou. Não inferir cache leak ou causa; a segunda request também usa deadline 20 ms.
- Summary/preflight/logs preservados em `C:/Users/gabri/AppData/Local/Temp/t14-final-gates-20261016/run-after-cli-case-isolation/`. Comparação com baseline T18: 1.729 paths físicos, `added=[]`, `removed=[web/src/lib/hud/hud.test.ts]`; `web/bun.lock` excluído e sem paths sensíveis selecionados. Hash delta 0 apenas no escopo selecionado; não é freeze global. Bun 1.3.14, ambiente HOME/etc inerte com allowlist e PATH completo constam no summary.
- Sem rerun ou diagnóstico daquela rodada; seu web não foi coberto. O aggregate posterior está registrado após as provas de deadline abaixo. T14 continua aberta; não alegar fechamento dos consumidores atuais ou cobertura HUD atual.

### T14: smoke sintético de deadline sob bloqueio do event loop (2026-10-17)

- Evidência `C:/Users/gabri/AppData/Local/Temp/t14-root-deadline-gap-smoke-20261016.json` (início 2026-10-17T01:58:36.916Z), Bun físico 1.3.14, `--no-env-file`, credenciais/fetch fake, `externalRequests=0`. Com deadline de 20 ms e fetch síncrono bloqueando por ~109,89 ms, Onchain retornou sucesso aos 126,51 ms (`sent=true`), populou cache (`cacheSizeAfterFirst=1`) e a chamada seguinte foi cache-hit (`sent=false`, calls=1); Signals retornou sucesso aos 105,42 ms após bloqueio de ~103,93 ms.
- Esta evidência registra o gap pré-correção sob bloqueio síncrono, não causa de falha histórica. O follow-up foi implementado depois; nenhum resultado deste JSON representa a fonte atual ou substitui aggregate.
- Follow-up implementado em cinco arquivos: `src/onchain-read/client.ts`, `src/onchain-read/client.test.ts`, `src/onchain-read/gateway.test.ts`, `src/okx-signals/client.ts`, `src/okx-signals/client.test.ts`. Preservou T8 `DispatchAdmission` e não alterou limites, retry ou auth. Onchain revalida `isAbortedOrTimedOut()` após fetch/text/JSON e em catches; Signals revalida deadline monotônica após fetch/JSON, aborta e lança `SignalsError('deadline')`.
- Regressões determinísticas cobrem fetch/body/JSON tardios em Onchain; fetch/JSON tardios em Signals; gateway sem cache do resultado expirado e follow-up pelo cliente/gateway/budget reais, com deadline default 8 s e dado normalizado distinto. Focused físico Bun 1.3.14 (`--no-env-file`), ambiente inerte: exit 0, 85 pass/0 fail/336 expectativas/3 arquivos/1,75 s. A asserção Signals `<250 ms` já estava ausente no teste quando relido; origem/proveniência desconhecida, não atribuir ao follow-up.
- Smoke sintético pós-correção `C:/Users/gabri/AppData/Local/Temp/t14-deadline-gap-smoke-after-20261017.json`: cliente/gateway/Signals reais com fetch fake, status pass, zero externas. Onchain deadline 8.000 ms + stall 8.059,794 ms retornou `provider_error` sem cachear (`sent=true`, budget 1); request seguinte dispatchou Base novo (`sent=true`, budget 2, 2 sends). Signals deadline 30 ms + stall 81,465 ms resultou em código deadline, signal abortado e 1 envio. Bun 1.3.14; `process.version=v24.3.0` é compatibilidade Node. Hashes before/after iguais nos cinco arquivos cobertos, não freeze global.
- Ao concluir o focused ainda não havia GO/aggregate posterior; a execução final autorizada está registrada abaixo. A causa histórica dos failures permanece desconhecida. T14 aberta.

### T14: aggregate final após correção monotônica de deadlines (2026-10-17; não verde)

- Uma execução autorizada, 2026-10-17T02:20:06.029Z-02:26:55.612Z: `typecheck:all` exit 0; `test:lab` exit 0 (647 pass/0 fail/838.138 expectativas); `test:all` exit 1. Root: 7.938 pass/2 skips/0 fail, 984.374 expectativas, 7.940 testes/479 arquivos. Web executada: 3.738 pass/1 fail, 57.272 expectativas, 3.739 testes/251 arquivos. Evidências em `C:/Users/gabri/AppData/Local/Temp/t14-final-gates-20261016/run-after-monotonic-deadlines/{summary.json,scope-preflight.json,typecheck-all.log,test-lab.log,test-all.log}`.
- A única falha web foi `mounted FlowChart reports unavailable PnL for every non-finite or missing field`, antes do mount: bootstrap DevTools Edge não gerou `DevToolsActivePort` dentro da espera limitada. PID próprio 41208 permaneceu `exitCode=null`; stderr capturou erros de caminho AppData e mensagem Edge sobre remote debugging exigir user-data-dir não padrão. Não classificar como falha da assertion PnL nem afirmar causa para incidente histórico.
- Preflight: 1.729 paths versus baseline T18 1.730; sem additions, único removed `web/src/lib/hud/hud.test.ts`, hash delta 0 no escopo selecionado. Entre o primeiro status targeted e o preflight, `C:/Users/gabri/.codex/worktrees/jev-executable-delivery-20261016/jev-trader` mudou de HEAD `c8df5f5805062ce32d8c897855206d785bdcf3f6` (`fix/autoresearch-real-online-20261016`) para `c5c7d34243e0aeab2b2313a725a2bdf7e47655b9` (`main`); o status targeted dos paths selecionados naquela worktree estava vazio. Proveniência desconhecida e não atribuída ao executor; hash delta restrito não é freeze global.
- Footers do focused deadline foram recuperados do transcript em `C:/Users/gabri/AppData/Local/Temp/t14-deadline-focused-20261017-before-failures-recovered.log` e `C:/Users/gabri/AppData/Local/Temp/t14-deadline-focused-20261017-final-pass-recovered.log`; nenhum rerun para recaptura. Não houve outro aggregate após esta única execução. T14 permanece aberta: `test:all` exit 1.
### T14: revalidação temporal de cache e persistência best-effort (2026-10-17)

- Revisão encontrou cenário reproduzível no cache normalizado de `/onchain/signals`: um timestamp exatamente em `nowMs - 6 horas` é aceito; após avanço de `nowMs` de 1 ms, a janela da próxima requisição deve removê-lo mesmo com a entrada dentro do TTL. O hook opcional do endpoint revalida projeções de cache em cache hit/fallback stale; a entrada e seu TTL permanecem intactos e nenhum dispatch/budget extra ocorre. Normalização de request/internal continua vinculada e não mudou.
- Regression test determinístico em `src/onchain-read/gateway.test.ts`: primeira chamada retém o sinal no limite inclusivo; tick +1 ms retorna lista vazia em cache, `sent=false`, um dispatch total e orçamento premium sem alteração. Smoke de execução com `createOnchainGateway`, `createOnchainCache` e budget reais e fetch sintético confirmou `firstRows=1`, `secondRows=0`, `dispatches=1`, `premiumBudget=1`, `externalRequests=0`; exit lógico `pass`.
- O smoke de persistência criou arquivo regular no caminho sintético esperado para diretório `onchain`; `createBudget` aceitou record/flush sem lançar, preservou `used=1` em memória e manteve `dirty=true` para persistência posterior. Nenhum provider foi invocado.
- Focused executado após ambas as alterações: `bun --no-env-file test src/onchain-read/budget.test.ts src/onchain-read/client.test.ts src/onchain-read/gateway.test.ts src/onchain-read/catalog.test.ts src/okx-signals/client.test.ts src/inonu/source-ecosystem.test.ts`; Bun 1.3.14, 228 pass/0 fail/932 expectativas/6 arquivos.
- Reviewer independente leu os caminhos atuais de cache, request/internal normalization, deadline e admission/budget; conclusão: nenhuma falha acionável, confiança 0,91. Revisão somente estática; evidência dinâmica é o focused e os smokes acima.
- Aggregate subsequente está em `status.md`: os cinco gates atuais passaram, incluindo o bootstrap FlowChart/Edge e suíte web; isso não transforma as fixtures sintéticas em evidência live/produtiva nem prova ganho financeiro.

### T20: funding após a última barra em `scanLiquidation`

- Reprodução sintética antes da correção: uma barra não liquidante com `endMs=10` e settlements em 5/15 produziu `fundingPaid=0.03`, embora o contrato do helper limite a soma ao fim da última barra; valor esperado `0.01`. Nenhum dado de mercado foi usado.
- Correção restrita a `src/lab/outcomes.ts` e `src/lab/outcomes.test.ts`: removida a soma residual após o loop das barras. A regressão cobre settlements em 5, 10 e 15, preserva o settlement exatamente no limite e exclui o posterior; exige `liquidated=false`, `atMs=null`, `fundingPaid=0.015`.
- Focado Bun 1.3.14 (`bun --no-env-file test src/lab/outcomes.test.ts`): 51 pass/0 fail/612 expectativas.
- Smoke offline pós-correção: `{"liquidated":false,"atMs":null,"fundingPaid":0.01}`; exit 0. `bun run typecheck` também terminou exit 0.
- Limite: a revisão do caminho canônico indicou que `computeOutcome` restringe funding à janela do holding e não consome `fundingPaid` em scans sem liquidação. Isso corrige o contrato do helper; não estabelece mudança nos relatórios canônicos, decisões do agente ou resultado financeiro. Nenhum endpoint, modelo, wallet, RPC ou journal foi acessado.
- Gates root sequenciais: `bun run test` exit 0, 7.941 pass/2 skips/0 fail, 984.385 expectativas; `bun run test:lab` exit 0, 648 pass/0 fail/838.141 expectativas/16 arquivos. Sem gate web. `bun run typecheck` exit 0.

### T21: distâncias temporais da inferência HAC

- Pesquisa estática: `PolicyInputs.results` mantém slots `null`; a política e os deltas pareados eram compactados antes de Newey-West. O relatório canônico deriva `flagged`/gate da inferência.
- Reprodução pré-correção com 16 epochs, 8 retornos alternados: oracle direto por distância original t `0.6279858256227586`, report compactado `0.7200823`. O focused `bun --no-env-file test src/lab/stats.test.ts` terminou exit 1, 58 pass/6 fail/64 tests; as seis assertions atualizadas falharam no baseline. Alteração de fonte ainda não estava aplicada na reprodução.
- Correção é somente para a inferência offline. LRV também alimenta Sharpe e limites calculados offline, mas fórmulas, schema e qualquer política live permanecem inalterados. Curva observada/bootstrap excluídos; gaps podem ser informativos, então isto não prova vantagem. Nenhuma API, modelo, wallet, provider ou journal foi usado.
- Implementação passa slots com gaps à inferência HAC, mantendo somente os valores observados para média/contagem e usando o lag em epochs originais para policy, contribuição por modalidade e diferenças pareadas. Teste sintético preserva também equivalência do report denso.
- Foco: `bun --no-env-file test src/lab/stats.test.ts src/lab/run.test.ts` - 103 pass/0 fail/3.085 expectativas/2 arquivos; `bun --no-env-file test src/lab/lab.integration.test.ts` - 3 pass/0 fail/37 expectativas. Diagnósticos LSP finais sem erros em `src/lab/stats.ts` e `src/lab/stats.test.ts`.
- Smoke CLI com semente fixa, 16 epochs sintéticas e output exclusivo em Temp saiu 0. Relatório `jev-lab-report-v1`, `mode=synthetic`, `realJevCalled=false`, `pendingEpochs=0`; não sinalizou política, manteve fase-0 e alavancagem permitida em 0x. Diretório e journal do smoke foram removidos.
- Gates root executados em sequência: `bun run typecheck` 0; `bun run test` 0 (7.942 pass, 2 skips, 0 fail; 984.402 expectativas; 479 arquivos); `bun run test:lab` 0 (649 pass, 0 fail; 838.158 expectativas; 16 arquivos). Reviewer fez leitura estática independente e não encontrou achados acionáveis (confidence 0,95), sem rodar gates.
- O ajuste muda inferência do laboratório e pode mudar estatísticas/portão offline; não prova vantagem, lucro ou desempenho do agente real. Curvas observadas/bootstrap não foram alterados; dados ausentes informativos ainda podem introduzir viés. Sem rede, API, modelo, wallet, provider, RPC ou journal operacional; nenhum commit, deploy ou restart.
