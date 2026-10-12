# JEV tape data F1–F4 — SPEC V2, 2026-10-11

**DRAFT REVISADO, NÃO ACEITO / NÃO CONGELADO.** Esta V2 responde ao REVISE de Turing. Não é implementação, GREEN, revisão independente do próprio documento, freeze, aprovação de ciclo/merge ou conclusão do objetivo inonu-trader. F1–F4 originais, M1–M6 e preview P1–P6 permanecem obrigatórios.

Autor de SPEC: CODEX_THREAD_ID observado 01a12ada-91d7-7ce0-b6ea-e1556d234224, distinto do integrador 01a12971-f941-7e42-8a42-fab6d44d4eb5 e de Turing 01a12adc-473d-7381-b067-c83af7ccda31. CODEX_SESSION_ID compartilhado não foi usado como identidade própria. GPT-6.1 Sol/xhigh solicitado; modelo, esforço e tier efetivos desconhecidos. Cópia ordinária exclusiva, sem sandbox OS somente leitura.

## 1. Baseline, autoridade e evidência

Fonte fixa: C:/Users/gabri/jev-trader-main, commit 14cbb7bd2878eed0a930b324b0c50610be7cdab8, tree 9698718595aa0c7c1b80021449f32d99eff26f92. HEAD e ausência de mudanças rastreadas foram observados na leitura; o conteúdo desta proposta vincula-se aos blobs fixos, não a alterações concorrentes posteriores. Leituras Git usaram stdout binário e não modificaram o repositório.

O baseline integra F5/F6 revisados, conforme atualização autoritativa do usuário. No delta 1f08e6e → 14cbb7b, os únicos arquivos JEV-read alterados são read.ts, decide.ts e read.test.ts. Feed/state/types/loop permanecem com os problemas F1–F4. Nenhuma aprovação anterior é reaplicada automaticamente a uma futura composição.

Entradas imutáveis reconferidas:

| Entrada | SHA256 |
|---|---|
| Draft original, exclusivo desta raiz | fe6b4bb777dd11643226a3cfaf5cbd7f2126e24ac2f6bcd18e0eb79d46413409 |
| Turing: jev-tape-data-f1-f4-independent-spec-review-20261011.md | f72813fc994c65ba2650fed6c1fd33ba5ced5f72bc138b3bfed12a48e2b97333 |
| Parecer original: jev-read-0541475-regression-review-20261011.md | 463a69063c76c32c9543c750b023788d68be7ff9f20113e7bc4ed894b884fae2 |
| Probe original: reviewer-boundary-probe.ts | a7a44e9482c1635bb73307e6bcc2a3c599591548442f1a0843953332c326091e |

Turing foi lido integralmente. Seus itens 1–3 e a matriz de aceitação, linhas 28–45, motivam os contratos e asserts obrigatórios abaixo. Draft, pareceres e probe não foram alterados. O resultado histórico original de 23 casos, 11 pass/12 fail pertence ao revisor original; não foi reexecutado nesta tarefa.

Políticas delegadas informadas pelo usuário:

- Receipt 9a716cb3-7bc5-461f-8f76-1ff37ad64d52: local120, default 120000ms, TTL inteiro positivo seguro, idade da fonte e do cache monotônico; confiança .8.
- Receipt d5654be0-ae0f-45e2-a032-0976b448dc90: opção do feed, um default no módulo, configuração inválida rejeitada explicitamente, registros estruturados validados no builder, nenhuma mudança de CLI; jev1.13.0, confiança .67, input774/output44, custo faturado desconhecido/null.

Proveniência dessas escolhas: mensagem autoritativa, não leitura dos recibos brutos. approved_by=jev_delegated refere-se somente ao aconselhamento técnico relatado; não é aprovação humana, aceite deste draft ou permissão financeira. Não houve nova chamada Jev/provider, teste, aplicação, instalação, leitura de .env/segredos, auxiliares, mutação de Git/harness ou fonte. A única escrita desta tarefa é esta V2.

O requisito central docs/JEV-DECISAO-ONCHAIN-OS.md:37–60 exige instante/origem, unknown em vez de zero e gates econômicos. Funding opcional null no TapeState consultivo não qualifica candidato econômico que dependa dele. Não alterar custos, sizing, estratégia, signing, operador ou qualified_live.

## 2. Lacunas atuais e seams concretos

| Requisito | Evidência no blob fixo | Seam mínimo |
|---|---|---|
| F1 | state.ts:79–80,94–98 tolera candle +5000ms; state.test.ts:179–181 espera futuro aceito | buildTapeState e fixtures de candle |
| F2 | feed.ts:198,213,364,373 descarta ts; ages:179–184 e state.ts:87–92 olham receipt | ingestão REST/WS, ages, snapshot, builder |
| F3 | feed.ts:240–250 guarda escalar e escolhe base-USDT-SWAP; state.ts:135 só multiplica por 100 | opção validada do feed, captura estruturada, snapshot, builder |
| F4 | feed.ts:169 equipara ack a tradesLive; :379–383 descarta acima de 5000 sem perda; state.ts:100–101 aceita bool | geração/ack/perdas do feed, cobertura e fluxo no builder |
| Composição | loop.ts:102–105 calcula ages antes de awaits | reavaliação final em readRound, sem alterar read.ts |

Seam público offline: OkxTapeFeed com fetch/socket/clocks falsos → snapshot → buildTapeState → runJevRead com modelo falso contador; readRound verifica a ligação real. Não iniciar CLI ou usar modelos/providers reais para esses testes.

## 3. Relógios e política de validade

Separar explicitamente:

| Campo/domínio | Validação e uso |
|---|---|
| sourceTsMs; candle.tsMs; receivedAtMs; calendário funding | Número Unix em ms, inteiro seguro não negativo; parsing do provedor deve rejeitar ausência, vazio, unidade indevida, fração, NaN/Infinity/unsafe integer. String de timestamp aceita apenas dígitos decimais antes da conversão segura. Não sintetizar sourceTsMs a partir do receipt. |
| exchangeNowMs | Relógio corrigido final: número finito não negativo dentro da faixa segura de magnitude, ou null quando desconhecido. Pode ser fracionário: correctedClock em clock.ts:101–105 usa performance.now. Não exigir Number.isSafeInteger neste relógio nem arredondar para aceitar futuro. |
| monotonicNowMs; receivedAtMonoMs; tempos de ack/cobertura/perda | Número finito não negativo, podendo ser fracionário. Todos do mesmo domínio monotônico da instância/época do feed. Retrocesso do monotônico é inconsistência de prova, nunca idade zero por clamp. |
| nowMs | Receipt/diagnóstico Unix local, inteiro seguro não negativo. Salto de Date.now não fabrica duração; não comparar sourceTsMs diretamente ao wall bruto. |

receivedAtMs registra a chegada daquele valor. Em caso de salto wall, ele pode ficar à frente do wall posterior; isso não invalida sozinho uma prova monotônica coerente. O controle de idade de transporte/cache conserva seus limites usando receivedAtMonoMs. Não comparar números de domínios diferentes nem supor que sourceTsMs deve ser menor que Date.now local.

Funding TTL: acrescentar fundingMaxAgeMs?: number em OkxTapeFeedOptions (feed.ts:32–41). Default único DEFAULT_FUNDING_MAX_AGE_MS = 120000 dentro do módulo feed; não duplicar literal/default em builder, loop ou CLI. Somente opção omitida/undefined seleciona o default. Valor explicitamente fornecido deve satisfazer Number.isSafeInteger(value) && value > 0; null, string, 0, negativo, fracionário, NaN, Infinity e unsafe integer causam RangeError identificando fundingMaxAgeMs, antes de qualquer fetch/socket/timer. Não arredondar, clamp, converter string, ignorar ou alongar valor inválido.

A opção fica imutável por instância e segue obrigatoriamente no TapeInput. O builder revalida seu formato; ausência/invalidade torna funding desconhecido, sem fallback local. Uma entrada direta não pode obter funding conhecido sem a política e a prova. Como funding é opcional, isso não bloqueia os outros dados consultivos válidos.

Para funding conhecido, exigir simultaneamente:

0 ≤ exchangeNowMs − sourceTsMs ≤ fundingMaxAgeMs

0 ≤ monotonicNowMs − receivedAtMonoMs ≤ fundingMaxAgeMs

Os dois limites são inclusivos e independentes. Qualquer excesso real, inclusive fracionário no monotônico, expira sem epsilon. Um clock corrigido desconhecido bloqueia o estado pelo gate clock_unknown; não contar esse bloqueio como demonstração de normalização F3.

Book e ticker conservam TTL fonte/cache 5000ms e 15000ms, respectivamente; ambos os controles precisam passar. Candle conserva 150000ms para a idade de abertura da última barra. Funding120s é política local delegada, não SLA OKX. A cadência existente de refresh120s não garante resposta antes da fronteira e não justifica TTL maior.

Acrescentar monotonicNow?: () => number nas opções do feed, default performance.now. Captura, cobertura, pruning, ages e snapshot usam essa mesma função. A opção now existente continua wall/diagnóstico. Não alterar ClockKeeper/clock.ts, cadências, flags ou scripts/jev-read.ts:85/156/158.

## 4. Contrato obrigatório TapeInput → builder

Campos abaixo definem o contrato proposto de tipos internos em types.ts. Não são implementação pronta. TapeState/modelo/projeção permanecem schemaVersion1, advisory true, execution never, campos numéricos atuais e fundingRatePct nullable.

### 4.1 Contexto final e prova por valor

TapeInput mantém instId, nowMs, exchangeNowMs e arrays/valores necessários; acrescenta, sem defaults no builder:

- feedId: identificador opaco local único da instância/domínio monotônico, nunca obtido do provedor;
- feedEpoch: inteiro seguro não negativo da sessão start/stop; uma nova sessão invalida callbacks/resultados da anterior;
- wsGeneration: inteiro seguro não negativo da tentativa/conexão corrente;
- monotonicNowMs: instante final de avaliação/captura;
- fundingMaxAgeMs: política validada da instância;
- coverage: registro descrito em 4.2, ou null;
- funding: FundingObservation ou null, substituindo o escalar fundingRate sem prova.

Book, ticker, cada candle e cada registro de trade contêm proof obrigatório. FundingObservation contém rate finito, fundingTimeMs/nextFundingTimeMs nullable e proof. Campos de receipt deixam de ser fontes independentes de verdade: receivedAtMs e receivedAtMonoMs pertencem ao proof daquele registro. Nenhum wrapper pode preencher proof ausente como fresco/completo.

ValueProof obrigatório:

| Campo | Origem e vínculo validado |
|---|---|
| feedId, feedEpoch | Capturados localmente; iguais ao contexto final. Prova de outra instância/época rejeitada. |
| captureId | Inteiro seguro positivo gerado pelo feed para o pedido REST ou mensagem WS; valor e prova são construídos/copied juntos. Em lote, uma captura pode conter vários registros; cada registro retém seu timestamp original. |
| forSpotInstId | Exatamente TapeInput.instId. Nenhum funding de outro spot ou moeda de cotação é reaproveitado. |
| requestedInstId | Instrumento efetivamente usado no pedido/subscrição. Spot para book/ticker/candle/trade; spot completo + "-SWAP" para funding. |
| reportedInstId | Identidade reportada pelo dado/arg quando existe. Deve ser exata; null só é permitido para linhas REST book/candle cujo contrato não devolve identidade. Não inventar identidade remota a partir do pedido. |
| source | Enum fechado: rest_book, ws_books5, rest_ticker, ws_tickers, rest_candles_1m, rest_funding, ws_trades. Não aceitar source arbitrário nem trocar tipo de dado com origem diferente. |
| wsGeneration | Geração local exata para sources WS, igual à corrente; null para REST. Callback antigo não pode atribuir a geração nova a uma mensagem velha. |
| sourceTsMs | ts real do provedor; para candle deve ser exatamente candle.tsMs (abertura), não hora de fetch/fechamento. Obrigatório também para funding. |
| receivedAtMs, receivedAtMonoMs | Capturados uma única vez na chegada/conclusão válida dessa captura, no domínio declarado. Receipts não mudam ao copiar snapshot ou reavaliar estado. |

Para WS, reportedInstId provém do arg da mensagem e deve corresponder à subscrição; se a linha também declara identidade, validar ambas antes de normalizar. Para REST ticker/funding, identidade da linha é obrigatória. Para REST book/candle, o feed precisa comprovar internamente pedido/endpoint fixo e forSpotInstId; o builder valida essa origem enumerada e o vínculo local, sem alegar identificação remota inexistente.

Book bids/asks, ticker seus valores, candle close/confirmed/ts e trade px/sz/side recebem prova da mesma captura que produziu esses valores. Não montar valores de um response com proof de outro, renovar receipt na cópia, nem compartilhar a prova BTC com o valor ETH. funding.rate e seu calendário seguem o mesmo registro. Parsing descarta texto livre; somente campos tipados atravessam o seam.

Validação no builder, inclusive em chamada direta: conferir campos/domínios, enum compatível, instância/época/geração, instrumento, sourceTsMs e ordering receivedAtMonoMs ≤ monotonicNowMs. Não exigir idade de 150s para cada candle histórico: o tail precisa de 31 barras, e somente sua última abertura determina o TTL de F1. Trades continuam fluxo de receipt local: ts do provedor é preservado/validado, não converte flow60s em janela de timestamp remoto ou prova de exactly-once.

Prova ausente, trocada ou inconsistente não ganha validade por um booleano, escalar ou wrapper normalizador. Com valor book/ticker existente mas prova inválida, usar book_stale/ticker_stale; valor ausente conserva book_missing/ticker_missing. Tail sem prova válida conserva candles_short; futuro/idade inválida da última barra válida é candles_stale. Funding sem prova válida é null. Clock de fonte desconhecido conserva clock_unknown. Não introduzir reasons que public-view.ts:9/91–97 elimina.

Esses registros são evidência interna de um produtor confiável, não atestação criptográfica. O builder detecta ausência/inconsistência e aplica os relógios fornecidos; não pode provar a veracidade de uma entrada inteiramente forjada e coerente nem a completude externa do exchange. Não declarar um novo limite de segurança para chamadores maliciosos.

### 4.2 Prova estruturada de cobertura e perda

CoverageProof obrigatório para leitura de fluxo:

| Campo | Semântica |
|---|---|
| feedId, feedEpoch, instId, wsGeneration | Iguais ao contexto corrente; instId é o spot. |
| source | Literal ws_trades. |
| acknowledgedAtMonoMs | Primeiro ack trades correspondente à geração/instrumento corrente. |
| continuousSinceMonoMs | Início da observação contínua atual; inicialmente o ack, ou reinício após lacuna conhecida na mesma conexão ainda válida. Nunca anterior ao ack. |
| observedThroughMonoMs | Captura final síncrona da cobertura; exatamente TapeInput.monotonicNowMs. Prova parada em um instante anterior não pode alegar cobertura atual. |
| socketOpen | Estado observado do socket corrente na captura; false nunca passa. True sozinho não passa. |
| lostThroughMonoMs | Maior receipt monotônico de registro da janela conhecido como perdido; null somente se não há perda conhecida. Nunca futuro. |

Todos os tempos são finitos/não negativos e ordenados: ack ≤ continuousSince ≤ observedThrough; perda, quando presente, ≤ observedThrough. Exigir observedThrough − continuousSince ≥60000 e, para perda presente, observedThrough − lostThrough >60000. Igualdade60000 ainda bloqueia perda. Campos ausentes/invalidade, clock monotônico inconsistente, geração errada, socket fechado, cobertura curta ou perda na janela produzem trades_unavailable.

tradesLive pode continuar como diagnóstico derivado de socket+ack, mas não substitui CoverageProof. Builder não aceita tradesLive=true com coverage ausente, nem fresh/complete=true sem timestamps, identidade e geração.

Cada trade considerado usa receivedAtMonoMs da mesma instância/época/geração. A janela é inclusiva: 0 ≤ monotonicNowMs − receivedAtMonoMs ≤60000. Não recalcular receipt por ts remoto ou wall. Pruning conserva retenção120000ms e cap5000; cap é de registros normalizados, não alegação de número de execuções OKX.

Quando o cap remove registro ainda pertencente à janela, atualizar lostThroughMonoMs com o máximo dos receipts removidos, não com hora fictícia de snapshot. A prova fica insuficiente mesmo se os 5000 restantes parecem válidos. Remoção apenas fora da janela não fabrica perda atual. Malformação relevante do canal/instrumento que impede contabilizar dados registra lacuna/perda conservadora no instante de detecção e reinicia cobertura; não ignorá-la como mercado quieto.

Disconnect, stop/start, reconnect/recycle ou geração anterior invalidam cobertura. Nova geração exige novo ack e 60000ms contínuos. Ack duplicado, ack de outro instrumento, pong ou outro canal não inicia, amplia, encurta ou renova essa cobertura; pong continua servindo somente ao lifecycle existente. Callback antigo é descartado pelo vínculo de socket/geração capturado no registro do callback.

Snapshot/validator reavaliam perda e pruning pela hora monotônica atual, mesmo sem mensagem nova. Quando toda perda sai estritamente da janela e cobertura continua íntegra, a leitura pode recuperar; não bloquear para sempre nem apagar perda prematuramente no limite.

## 5. Comportamentos F1–F4 preservados

### F1 — candle futuro inelegível

Na última barra do tail contíguo, exigir 0 ≤ exchangeNowMs − tsMs ≤150000. +1ms, +5000ms e +5001ms são futuros e rejeitados, sem tolerância/rounding/epsilon. Preservar 31 barras de1min, preços positivos, ordenação e barra em formação; ts é abertura. Clock null/NaN/Infinity é clock_unknown. Não mudar FUTURE_TOLERANCE_MS global ou clock.ts para obter esse resultado.

### F2 — chegada recente não renova fonte velha

REST e WS de book/ticker exigem ts do provedor e receipt/prova válidos, ambos os TTLs e identidade aplicável. ts1, ausente, futuro, unidade/forma inválida ou identidade errada não se tornam novos porque chegaram agora.

Resposta mais antiga não substitui dado mais novo. Resposta duplicada de mesmo ts/conteúdo não renova os tempos da captura armazenada; mesmo ts com conteúdo conflitante é inválido. Erro/malformação pode preservar dado anterior apenas com sua prova original, até os limites originais; nunca reescrever receipt ou sourceTsMs. ages considera fonte e cache atuais ou sinaliza necessidade de refresh quando qualquer prova/clock é inválido. A segurança não depende de refresh bem sucedido: builder valida novamente antes do modelo.

### F3 — funding desconhecido sem identidade/frescor comprovados

Mapear o par spot completo para seu swap correspondente: BTC-USDT → BTC-USDT-SWAP; ETH-USDC → ETH-USDC-SWAP. Não substituir quote por USDT nem inventar disponibilidade do produto. Se matching swap não for retornado/provado, funding é null.

Exigir rate finito, identidade exata, rest_funding, timestamp de observação, receipt/cache e política válidos. fundingTime/nextFundingTime, quando válidos, são calendário nullable da captura, não relógio de frescor; não exigir que nextFundingTime já tenha ocorrido. O controle original BTC/0.004/ts fresco, fundingTime=exchangeNow−1000 e nextFundingTime=exchangeNow+8h deve produzir exatamente fundingRatePct=0.4.

Taxa zero comprovada é zero conhecido; negativa comprovada conserva sinal e ×100. Metadata ausente/errada, resposta inválida ou erro deixa funding desconhecido; não usar valor anterior para mascarar a resposta inválida. Pode-se conservar informação de captura para ordenar respostas, sem expô-la como conhecida. Fonte idêntica recebida de novo não muda sourceTsMs nem renova a captura duplicada; expiração é reavaliada sem refresh.

Funding inválido isolado não bloqueia uma leitura consultiva que tem os outros dados válidos. Não atestar elegibilidade econômica por built.ok ou por uma chamada ao modelo falso.

### F4 — quieto completo só após cobertura real

Ack imediato e 59999ms são insuficientes; 60000ms contínuos sem perda permitem quieto. Quieto válido: count/buyBase/sellBase/cvdBase zero, imbalance/vwap/lastPx/lastSide null.

6000 registros com cap5000 não são fluxo completo. Bloquear especificamente por trades_unavailable em vez de reportar o subconjunto com imbalance.2/CVD1000 como verdadeiro fluxo6000. Manter cap5000 e retenção120s; não introduzir agregação, aumentar cap ou afirmar exactly-once. A alternativa de agregação exata do achado original não é a implementação proposta nesta V2.

Salto wall positivo/negativo não fabrica cobertura, apaga prints ou expira cache monotônico. Warmup CLI8s/0 não satisfaz cobertura; gate suprime chamadas até a prova real, sem alterar CLI/cadência. Conexão sem ack nunca passa.

## 6. Ligação final após awaits

readRound deve usar ages com clocks atuais para decidir refresh, mas não congelar validade nesses valores. Após cada await potencialmente demorado, uma avaliação subsequente usa clocks novos; após o último await de refresh, capturar wall local, exchangeNow do ClockKeeper e monotônico atual do feed para snapshot final. Nenhum await entre essa captura final e o gate síncrono buildTapeState dentro de runJevRead.

Seam concreto de ages: ages(instId: string, wallNowMs: number, exchangeNowMs: number | null) continua retornando { bookAgeMs: number | null; tickerAgeMs: number | null }. Captura o monotônico corrente pela função da instância. Para cada valor com prova coerente e clocks válidos, retorna o máximo entre idade da fonte corrigida e idade monotônica do cache; prova/clock ausente, futuro ou incoerente retorna null, exigindo refresh, sem clamp para zero. wallNowMs é diagnóstico, não idade substituta. Atualizar somente o caller readRound e seus doubles/fixtures sob ownership; os thresholds atuais de refresh3000/10000 permanecem.

Contrato do seam: snapshot(instId, finalWallNowMs, finalExchangeNowMs) captura uma única vez a função monotonicNow da instância, grava esse valor em TapeInput.monotonicNowMs e CoverageProof.observedThroughMonoMs, preserva receipts históricos e propaga fundingMaxAgeMs. Builder avalia fonte/cache/cobertura contra esse contexto final, não contra clocks do pedido REST ou de ages anterior.

Se refreshBook demorar, reavaliar ages antes de decidir refreshTicker; mesmo quando não há novo refresh, o snapshot final não libera ticker/funding que expiraram durante o await. Se o último refreshTicker demorar até book/funding/candle expirarem, bloquear core expirado ou emitir funding null, conforme o campo. Falha de refresh não elimina o gate final. Não alongar TTL, repuxar timestamps ou usar cache booleano “valid” de uma rodada anterior.

Não alterar runJevRead/read.ts ou deadlines/abort de F5/F6. O gate descrito garante frescor no instante de admissão, não promete que dados permanecem frescos durante inferência. Clock desconhecido segue sem liberar leitura; sem rede real os relógios são fakes determinísticos.

## 7. Regressões obrigatórias e controles contra mascaramento

Todos os casos abaixo são necessários para uma futura aceitação. Não são testes executados nesta autoria. Usar public feed/snapshot/buildTapeState/runJevRead/readRound, fetch/socket/clocks falsos e contador de modelo local. Não depender somente de helpers privados. Não enfraquecer o probe original.

Pré-condições comuns: identidade/prova/cobertura válidas, 31 barras contíguas, book/ticker frescos e clock corrigido válido, salvo a única variável sob teste. Ao avançar60s para F4, renovar book/ticker/candles depois do avanço, sem renovar indevidamente o alvo negativo. Assertar explicitamente as pré-condições e o controle positivo equivalente.

**F1/F2/F4 negativos:** reason esperado específico (não “qualquer bloqueio”), built.ok=false, leitura state=null, decision=null, model.calls=0. Em flood, insufficient deve conter trades_unavailable e não falhas artificiais de book/ticker/candles. Controles completos equivalentes: built.ok=true, uma chamada falsa, schema1/advisory true/execution never. Não substituir esse resultado por hold devido a modelo falho.

**F3 negativos isolados:** built.ok=true, insufficient vazio, fundingRatePct=null, outros valores/gates preservados e exatamente uma chamada falsa consultiva permitida. Não usar expressão built.ok ? funding : null como assert: ela mascara bloqueio total. Positivos funding conhecido/zero/negativo exigem built.ok=true, valor exato, uma chamada falsa e outputs consultivos preservados. Casos de clock global desconhecido têm gate core próprio e não contam como prova F3 isolada.

| Grupo | Negativos/bordas obrigatórios | Controles obrigatórios |
|---|---|---|
| F1 | +1/+5000/+5001ms; idade150001; clock null/NaN/Infinity; ts ausente/fracionário/unsafe; tail quebrado | idade0/150000; exchange fracionário sem arredondar; 31 contíguas/forming; wall±180s com clock corrigido |
| F2 book, separado | REST e WS ts1 recebido agora; fonte5001/cache5001 com outro limite passando; futuro/ausente/inválido; erro após expirar; identidade WS errada | idades0/5000 fonte e cache; REST book vínculo local sem identidade remota inventada; resposta velha/duplicada conserva prova anterior; refresh válido restaura |
| F2 ticker, separado | REST e WS ts1; fonte15001/cache15001 independentemente; identidade errada; ts futuro/ausente/inválido | idades0/15000; fonte realmente nova recebida em período quieto; response fora de ordem não rejuvenece anterior |
| F3 identidade/valor | ETH no pedido BTC; quote USDC convertido indevidamente; ts1/ausente/futuro; rate ausente/NaN/Infinity; erro/metadata trocada | matching BTC 0.004→0.4; zero→0; negativa preservada; calendário original; quote correspondente ou null sem inventar swap |
| F3 TTL default | source120000/cache120000 passam; source120001 com cache válido; cache120001 com source válida; cache120000+fração expira; sem novo refresh; mesma fonte repetida não renova | exatamente120000 inclusivo em ambos; clocks source/mono variados separadamente; wall± enquanto mono e exchange corretos preservados |
| F3 opção injetada | construtor rejeita0/negativo/fração/NaN/±Infinity/unsafe integer/null/string sem efeitos; builder política ausente/inválida não conhece funding | opção omitida usa120000; TTL60000 e180000 respeitam suas próprias bordas inclusive/+1, sem constante escondida/default do builder |
| F4 cobertura | ack0/59999; ausente/outro instrumento; duplicate ack/pong/outro canal não amadurecem; socket antigo/generation/epoch errados; reconnect/restart/gap; retrocesso mono | 60000 inclusivo; mono fracionário válido; quieto completo; nova geração só recupera após seu próprio60s; wall± não fabrica/elimina cobertura |
| F4 cap/perda | 6000(4000buy/2000sell), todos na janela, cap5000 com cobertura já madura; perda ainda exatamente60000; registro relevante malformado | exatamente5000 sem perda; 500(300buy/200sell) imbalance.2/CVD100; perda estritamente fora60000 (incluindo +fração) recupera sem mensagem nova; descarte fora da janela não bloqueia |
| Composição após await | refresh lento expira book/ticker/funding; refresh falho; clocks/prova de rodada anterior | book/ticker expirados bloqueiam/zero modelo; funding expirado isolado null com estado válido/uma chamada; recaptura de relógios final verificada |

Testes source-only/cache-only usam relógios injetados independentes para provar a conjunção dos limites, sem exigir relação com wall bruto. O teste de repetição de fonte usa sourceTs realmente igual, não um response com timestamp novo. Fluxo/cobertura avançam apenas no domínio monotônico.

### Bypass direto ao builder — obrigatório

Montar fixture válida completa e variar um campo por vez, chamando buildTapeState diretamente, depois runJevRead para os efeitos:

1. Funding escalar legacy, proof ausente, source errado, requested/reportedInstId incorreto, feedId/epoch de outra instância, receipt mono futuro, sourceTs inválido ou TTL ausente/inválido: built.ok=true e funding null. Não passar esses casos apenas pelo normalizador de feed.
2. book/ticker com receipt novo e source velho, proof ausente ou proof de outro instrumento/generation: reason próprio e zero modelo; candle proof.ts diferente de candle.ts/identidade errada não passa como candle válido.
3. tradesLive=true sem coverage; bool-only complete/fresh; coverage de outro instrumento/geração/domínio; acknowledgedAt/continuousSince/observedThrough ausentes/futuros/ordenados incorretamente; observedThrough anterior ao instante final: trades_unavailable, zero modelo.
4. Coverage válida com loss na fronteira inclusiva e trades individuais de geração errada ou sem proof: bloquear, não remover silenciosamente o registro e declarar quieto. Coverage completa sem perda e array realmente vazio é controle positivo.

Fixtures podem declarar os campos concretos para testes puros; não são prova de producer live. Testar também o encadeamento público para provar que o feed fornece os mesmos campos e não oferece um caminho alternativo scalar/bool.

## 8. Ownership, migração e gates preservados

| Arquivos | Responsabilidade proposta; não execução/atribuição nova |
|---|---|
| feed.ts/state.ts/types.ts; ligação mínima loop.ts | Escritor F1–F4 autorizado pelo integrador, opções/prova/validação/relógios. |
| feed.test.ts/state.test.ts/loop.test.ts; novo teste público exclusivo se atribuído | Regressões desta matriz e controles migrados, sem editar o probe imutável. |
| read.ts/decide.ts | Exclusivos do integrador/safety F5/F6; nenhum ajuste de lógica desta tarefa. |
| read.test.ts | Já contém leitor e validator; não existe decide.test.ts no inventário. Migração de fixtures de TapeInput/proof exclusivamente pelo integrador, depois da auditoria safety existente, antes da verificação de composição. |
| CLI/clock/UI/HTTP/operador/economia/SPECs congeladas | Fora da implementação proposta; nenhuma mudança de cadência, flag ou gates. |

Migrar positivamente metadata/cobertura de state.test.ts:11–27, loop.test.ts:68–89, feed.test.ts:246–293 e read.test.ts:14–25/119–145. Não apagar ou relaxar asserts de abort/deadline/normalização/imutabilidade. O positivo atual de candle futuro em state.test.ts:179–181 deve virar negativo porque contradiz F1 original, com controle equivalente não futuro preservado.

TapeInput interno pode mudar; outputs modelo/projeção não recebem proof, IDs internos ou JSON/texto do provedor. Preservar as reasons fechadas, funding null e cópia numérica fornecida ao modelo em read.ts:65. Observar que compactTapeState no read.test.ts:120 usa funding escalar hoje; a fixture deve ganhar registro válido, mantendo sua expectativa0.012346.

| Safety congelado | Preservação exigida na futura composição |
|---|---|
| M1 | Pré-abortado: zero chamadas e hold/error. |
| M2 | Abort em voo: settle mesmo se modelo ignora signal, cleanup e nenhuma aceitação tardia. |
| M3 | Deadline monotônico/elapsed rejeita retorno síncrono tardio, sem prometer preempção JavaScript. |
| M4 | Overflow/underflow escolhido: hold/malformed sem rescale; ambos controles3:1 permanecem. |
| M5 | Producer/projeção, schema1, advisory/never e controles válidos intactos. |
| M6 | RED/GREEN público, afetados/tipos e replay original independente antes de commit/merge, sem inferir cobertura de outro hash. |

read.test.ts do baseline contém as regressões safety integradas em linhas48–69,148–203; isso é leitura de fonte, não execução nem reaprovação. Registrar hashes após migração e comparar asserts/propósitos ao baseline. A nova matriz F1–F4 não substitui M1–M6.

## 9. Resposta ao REVISE e condição de próxima elegibilidade

| Exigência Turing | Contrato V2 |
|---|---|
| TTL injetável/default único/rejeição explícita | Seção3: opção do feed, RangeError antes de efeitos, sem CLI/fallback; matriz default/custom/invalid. |
| Prova estruturada e relógios distintos | Seções3–4: registros por valor, identidade/captura/geração/receipt e coverage temporal obrigatórios, builder e bypass direto. |
| Não mascarar F3/flood | Seção7: built.ok obrigatório em F3, chamadas falsas positivas, trades_unavailable específico no flood e atualização dos outros feeds após60s. |
| Limites e recuperação | Seções3/4.2/7: duas idades independentes, perda60000 inclusive, saída estrita sem mensagem, zero/negativo/500/5000 e wall/mono. |
| Reavaliação após await | Seção6 e testes de composição, sem alongar TTL ou modificar safety reader. |
| Fixtures/ownership e reasons | Seção8: integrador migra read.test após safety audit, lógica read/decide preservada, sem nova reason/projeção livre. |

Próximo elegível: revisão independente desta V2 e resolução de eventuais lacunas, antes de congelar contratos pelo fluxo autorizado. Depois, reserva explícita de arquivos/fixture migration, RED offline por requisito, implementação mínima autorizada, GREEN afetado/tipos/safety/projeção, revisão independente e audit. Este documento não executa nenhuma dessas transições e não declara acceptance completa.

Preview P1–P6 conserva todas as obrigações e eventuais pendências atuais, sem reinterpretação da evidência visual anterior. Objetivo central, live qualification, economia, identidade/custos externos e resposta real do exchange não são certificados por esta SPEC. Cobertura local não garante ausência de perdas externas, exatamente uma execução por trade agregado ou verdade física do relógio.

Não houve pesquisa pública nova nesta V2: contratos de ts/calendário/origem vêm das fontes e pesquisa oficial citadas no draft original; 120s não é atribuído a documentação externa. Incerteza operacional real permanece para verificação própria, sem provider calls neste trabalho.

## 10. Manifesto exato do baseline atualizado

SHA256 dos bytes de blobs Git fixos, capturados por stdout binário. Não são hashes físicos CRLF do checkout e não se afirma revisão de WIP posterior.

| Arquivo relativo ao commit14cbb7b | SHA256 |
|---|---|
| src/jev-read/feed.ts | 0aae9ebe79414065d6459558314ab217084edace2c5acac483c34f37c88b435e |
| src/jev-read/state.ts | 7eee52fbdd4ad8b3a3b2eea23686a80236f571a21ada3f968149a8461b4bd333 |
| src/jev-read/types.ts | c6966959aa9dd342d4bf83a11c0a7bcf9d95afba1a7d3b6a1ea7f54191e97c4f |
| src/jev-read/loop.ts | c790a335c6bfeddba8a30926137931221ebc27520d74347eff6e2745ff0624fe |
| src/jev-read/read.ts | c14a262dd08b3b60b7a1b0d9a1bf25dcdd9fea9cbcf86b74f86c6dec37febbea |
| src/jev-read/decide.ts | b8823b2dccb3c4c162ba27af530a47c1aca2fd8371e0e10d2e99af70c58c049a |
| src/jev-read/public-view.ts | 8fa5323cb6772f2dacd7ad03dd929a27c8eea6e6ede246b08dbf53326dd62e81 |
| src/jev-read/feed.test.ts | 439afd03d074c7394222a6ef860ca0c1119118c8bc78d98bac3656612b5e3539 |
| src/jev-read/state.test.ts | bd868c76e60e264c25b80b35123b75f6468823f700c1017a5d6415e004f85303 |
| src/jev-read/loop.test.ts | 2feecbf9cc533ae87e78ab6a5ad1e70d6e4a45a6c80614a1b91905c861ecf0c3 |
| src/jev-read/read.test.ts | cd85d2b9e52008e02921d607f850f757e327b4771099b7379b00e5cad6168299 |
| scripts/jev-read.ts | 315e8c1dbbed5f5c277d4a0331506f79bac4bf91ac940f0b8526ffe10e051fe5 |
| src/system-one/clock.ts | 5e20f8e8ab92e7e4a4bdd524f4be8c1fc63eea264feb3dda74136f23db7105f1 |
| src/system-one/clock.test.ts | e6056f2fe025f2c829799a25ed5b911f0f308fcb4cb6e9ad15012dd4d05e9e44 |
| web/src/lib/jev-read.ts | 2f852d4f218cca82c5473641d769e64e93d950984187b9b13e217d1432fb2e84 |
| docs/JEV-DECISAO-ONCHAIN-OS.md | 0e3819b054a0a231bbb74cb445cf5a8eab0339866c1bafa17e5b33eab7ddbbb6 |
| CONTRIBUTING.md | 491e629c515cf69267528de649f19bcb0b3f4425a133d070487d7d4647d402f6 |

Saída exclusiva: jev-tape-data-f1-f4-spec-v2-20261011.md nesta raiz de revisão. Originais preservados; hash da nova saída entregue separadamente após a gravação. Nenhum source/test/aceite foi editado, nenhuma implementação própria aprovada.

