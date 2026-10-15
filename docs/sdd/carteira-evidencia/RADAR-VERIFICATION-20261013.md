# Radar: verificação da entrega local

Conversa 01a136cd-3af3-7361-bd23-c23a6aeece97. Critérios RAD-01 a RAD-05 congelados em RADAR-SPEC-20261013.md, SHA256 3685a004b8df9f809bd9a4724ef4ddf34b2c5ef7ea09c0bcd72ad2c27ff263a1. Estado atual: entrega local de radar verificada, revisão independente aprovada e consulta pública corretiva respondida. As seções anteriores preservam checkpoints históricos. Não é certificação de retorno financeiro nem conclusão de WAL-01 a WAL-06.

## Candidato integrado e verificações

Doze caminhos do manifesto privado C:/Users/gabri/.codex/tmp/radar-01a136cd/INTEGRATED-FREEZE.json foram integrados e congelados às 02:38:17 UTC de 2026-10-14. As seis fontes backend equivalem ao candidato isolado após normalização de CRLF/LF; os hashes reais compartilhados estão no manifesto. A interface preserva watch como Acompanhar, sem valor ou preparação de compra; ação, token e sinal são visíveis e os detalhes ficam recolhidos. O Brief mantém proveniência, ageMs, stale e timeFrame das leituras existentes. Ausência permanece null. Nenhuma nova fonte, polling, ordem, assinatura ou envio privado foi acrescentado.

- Backend integrado: 183 testes verdes, zero falhas, 1324 asserts em sete arquivos. Log integrado-backend.log e métricas no diretório privado acima.
- Contrato/render web: 36 testes verdes, zero falhas, 170 asserts em dois arquivos. Log integrated-web.log e métricas no mesmo diretório.
- Typecheck backend delimitado: exit 0. Bundle Bun do adaptador: exit 0, 124 módulos. Evidência integrated-static-checks.json.
- Typecheck web fresco após atualizações concorrentes: tsc --noEmit --pretty false, exit 0, sem diagnóstico. A etapa posterior Get-Content do wrapper tentou ler um log vazio que não foi criado; esse erro de leitura não é diagnóstico TypeScript.
- Build web anterior: primeira tentativa usou exportDir absoluto e falhou em caminho Windows duplicado; segunda compilou, mas encontrou fixtures/configuração de carteira em atualização concorrente fora destes doze caminhos. As fontes desse outro escopo mudaram depois. Build completo final ainda pendente.

Regressões web foram executadas vermelhas antes da alteração. No backend, o candidato executou regressões contra o baseline depois da implementação e preservou nove falhas demonstrativas; isso comprova a regressão, mas não um ciclo backend estritamente test-first. Revisão independente compara o candidato com os baselines dirty; a cópia não concede autoridade sobre trabalho concorrente.

## Consulta pública real e falha estrutural

Uma consulta manual de ecossistema foi feita no localhost:3001, com a carteira desconectada, entre 02:42:28 e 02:43:24 UTC de 2026-10-14. A interface retornou resposta inválida. O ledger registra resultado invalida:ecossistema_ordem_incoerente, modelo jev-latest, latência 15790 ms, 8962 tokens e 14 leituras OnchainOS; USD desconhecido/null. O delta do ledger é uma chamada ao modelo, de cinco para seis chamadas do dia. Logs privados live-ledger-before-final.json e live-ledger-after.json. Uma tentativa anterior interrompida por reload não incrementou o ledger.

A linha 308 do validador src/opportunity/ecosystem.ts identifica especificamente candidato skip incluído no ranking. O ledger não identifica o token nem contém a resposta bruta; não se atribui uma identidade inventada. O validador recusou a resposta corretamente e permanece obrigatório.

A investigação fechada CONTRACT-AUDIT.md, SHA256 84fba03ae6e188e42357d8201be211018c42523fb9a1ecbc39c038687c1def22, confirma no SDK e em documentação primária que perguntas de uma avaliação são independentes: place_* não vê stance_*. Uma única Choice para todas as ordens de até três entre oito candidatos precisaria de 401 opções, além das 254 suportadas. Bandas atômicas e Score sem contrato explícito de empate não preservam o ranking congelado. Nenhuma dessas alternativas foi implementada.

A consulta técnica Jev Workflows sobre essas alternativas absteve: receipt 73ec3f7c-dbaa-42f1-8cbc-bc2ffd9c2e10, low_confidence, confiança 0,49, probabilidade da melhor opção 0,59. Policy conservadora preservada; 764 tokens de entrada, 72 de saída, custo desconhecido/null. Recibo real RADAR-CONTRACT-ABSTENTION-20261014.json no diretório privado. Não se registra aprovação por Jev nem resposta humana para esta abstenção.

## Reparo sequencial aprovado, implementação em curso

Nova evidência delimitada sustenta uma única prioridade depois das posturas, com no máximo nove escolhas. Em 2026-10-14T03:20:39.664Z o Jev Workflows escolheu `two_stage_one_priority`, receipt 107b31e3-53b5-4279-a77b-b189457c9768, confiança/probabilidade 1, modelo jev1.13.0, 836 tokens de entrada, 67 de saída e custo desconhecido/null. Recibo sanitizado real RADAR-SEQUENTIAL-DECISION-20261014.json. `approved_by=jev_delegated`, sem resposta humana inventada. A abstenção anterior foi preservada e não convertida em aprovação.

Critérios operacionais congelados em RADAR-SEQUENTIAL-ADDENDUM-20261014.md, SHA256 70c6d9164296ec0f98b41a3facee87bd5742679e3dbedc1cc5ac71566a56e73c. Os critérios RAD-01 a RAD-05 permanecem imutáveis. Parecer documental independente APPROVE com zero bloqueios concretos, ADDENDUM-REVIEW.md SHA256 4d6dee88c7048ab0c257f2b50e7844a2dd778c919fa079971d9ab6fbb07a46d8. Isto aprova o contrato, não certifica o código nem encerra o REQUEST_CHANGES anterior.

UI: regressão vermelha de divulgação 22 pass/1 fail antes da correção, UI-SEQUENTIAL-RED.log. Depois da correção, UI-SEQUENTIAL-GREEN-FINAL.log: 23 pass/0 fail, 106 asserts. A tela local mostrou `Ate 2 avaliacoes por consulta.` em 2026-10-14 UTC. As duas etapas devem reservar o pior caso antes da primeira e contabilizar avaliações reais e medições parciais, sem declarar custo desconhecido como zero.

Antes de concluir: testes do backend reparado, tipos/build, nova revisão dos hashes finais e uma consulta pública corretiva delimitada no navegador. Sem retries pagos para obter uma resposta desejada, enfraquecer gates, inventar rankings ou promover acompanhamento a compra. O runtime usado pela aba localhost:3001 é o servidor Bun watch em 127.0.0.1:3000; o processo antigo 47322 não atende essa aba. Nenhuma reinicialização foi necessária neste checkpoint.

## Projeção web da contabilização sequencial

O parser web mantém os campos legados e recebe opcionalmente chamadasModelo 0/1/2 e medições por etapa. Contagens, índices e números inválidos são recusados; um total desconhecido permanece null mesmo quando uma etapa tem medição. RED: USAGE-SEQUENTIAL-RED.log, 18 pass/3 fail/100 asserts. GREEN: USAGE-SEQUENTIAL-GREEN.log, 21 pass/0 fail/111 asserts. Parecer independente somente deste parser: APPROVE, Spec 0/Standards 0, REVIEW-usage.md SHA256 b956d074913ed5f63d16d274abeb8a47224a41995a7ea9c0c320bf304bc7fb99; teste independente 21/0/111 e typecheck limitado exit 0.

Parecer independente da divulgação curta de duas avaliações: REVIEW-ui2.md SHA256 c3758b11c34378ca39bc4a4b4484da34a4f3f5e3625b4a63af16b4e6166f277f, APPROVE somente dos dois caminhos de UI, teste independente 23/0/106. Typecheck web completo posterior: exit 0, duração registrada 60843 ms, sem diagnóstico, FINAL-WEB-TYPES.metrics.json. O build final está em execução neste checkpoint. Estes resultados não aprovam a reserva/contabilização backend nem substituem a consulta pública corretiva.

O teste composto público source-ecosystem.test.ts foi adaptado pelo integrador para exigir duas avaliações sequenciais, dados de origem/frescor preservados, prioridade limitada aos candidatos elegíveis e watch sem saldo. RED contra o adaptador anterior: SOURCE-SEQUENTIAL-RED.log, 20 pass/1 fail/104 asserts. GREEN composto permanece pendente da integração dos seis caminhos backend.

## Freeze integrado do reparo

Os seis caminhos do backend foram integrados depois de conferir exatamente os baselines compartilhados e os candidatos privados, sem divergência. Manifesto de implementação SEQUENTIAL-MANIFEST.json SHA256 b2bc8f7293e88724b3fdd8beff1c5dba51d13632014f46f3d51f06f692de8760. Freeze atual dos dezoito caminhos: FINAL-INTEGRATED-FREEZE.json SHA256 6523d0133c0d613096bead0a78e8a268ac8afdca570b5ab954050aa60b5e468b, no diretório privado desta conversa. O validador de oportunidades permanece no hash 25b335a64391afaa58bf97974c62b595d40878afc7b7ac49516ff66b6ccf9dd0.

Verificação executada sobre os arquivos compartilhados: backend cinco suítes, 162 pass/0 fail/1313 asserts; inclui o seam composto antes vermelho. Web quatro suítes, 72 pass/0 fail/342 asserts, incluindo parser, render, picks e cliente Inonu. Typecheck backend delimitado aos dez caminhos afetados: exit 0. Bundle Bun de modelo/ask/ledger: exit 0, 125 módulos. Typecheck web completo: exit 0. Build web completo em export isolado out-radar-seq-01a136cd: exit 0, todas as oito páginas geradas, duração 107821 ms. Logs FINAL-BACKEND, FINAL-WEB-ALL, FINAL-BACKEND-TYPES, FINAL-WEB-TYPES e FINAL-WEB-BUILD com métricas no mesmo diretório privado. A primeira seleção web omitiu picks.test.ts por caminho incorreto; a suíte final usou o caminho real e passou.

Revisão independente final e uma consulta pública corretiva manual permanecem pendentes. Os testes usam provider simulado; não provam resposta real, lucro ou custo faturado. A interface confirmou carteira desconectada antes da consulta, preservando o limite de dados públicos.

## Tipagem dos fixtures e freeze final

A revisão independente encontrou TS2769 em dois fixtures de usage.test.ts ao incluir explicitamente os tipos Bun. A configuração padrão web havia passado sem expor esse diagnóstico. A correção limita-se a importar EvaluationUsage e anotar os dois arrays válidos; parser e runtime não mudaram. RED independente: FINAL-WEB-TYPES.log no diretório privado review, exit 2. GREEN do integrador: FINAL-USAGE-TYPED.log, 21 pass/0 fail/111 asserts, e FINAL-WEB-BUN-TYPES.log, exit 0 com a configuração delimitada tsconfig.shared-web-bun.json. A confirmação independente GREEN permanece pendente neste checkpoint.

Freeze FINAL-TYPED-FREEZE.json SHA256 3993cd2617d7dc5316e428918234a479721e5761ed1ad2b4fd94df62c8ad349d. Comparação com o freeze anterior confirmou somente a alteração de usage.test.ts, novo SHA256 1eb1f0164f94ef5dffe806bb44bdebeb0d3f9b0d543d7bcb5f575bc1dd7da0b2; os outros dezessete caminhos e os dois critérios congelados continuam iguais. Build e testes de runtime anteriores continuam pertinentes porque esta última alteração é exclusivamente de tipos em teste.

## Revisão independente final

REVIEW-FINAL.md SHA256 3be737cac70ef6d1d05511ba0955002895880898868f46ba661a27380c49133c: APPROVE de fonte/testes/tipos, Standards 0 e Spec 0 achados remanescentes. Revisão em cópia isolada por settings_review, com segundo examinador Standards separado. Independente: 162 testes backend/1313 asserts e 66 web/318 asserts, todos verdes; bundle e tipos backend verdes. A mesma configuração Bun que encontrou TS2769 passou GREEN com a fixture tipada, e seus 21 testes foram repetidos sem serem contados como cobertura distinta. Nenhum build adicional foi necessário para essa alteração exclusiva de tipos de teste.

Os dezoito hashes compartilhados e o hash do parecer foram conferidos imediatamente antes da prova pública. Consulta corretiva única iniciada no botão Atualizar decisoes às 04:19:54 UTC de 2026-10-14, carteira desconectada; a interface confirmou Perguntando ao Inonu. Baseline de ledger fresco live-sequential-corrective-before.json: dez avaliações no dia, 50668 tokens, 77 leituras, USD null. Esse total contém atividade concorrente e não é atribuído integralmente a esta entrega. Resultado live ainda pendente neste checkpoint.

## Resultado público final e limites

Às 04:20:30 UTC de 2026-10-14, a mesma aba localhost:3001 confirmou resposta concluída: `Inonu descartou os candidatos desta leitura.` O ledger registra `respondido`, modelo jev-latest, latência 15166 ms, 6811 tokens e 14 leituras OnchainOS. O delta fresco foi uma avaliação, de dez para onze, compatível com a primeira etapa sem candidatos elegíveis para prioridade. Custo faturado permanece desconhecido/null. Evidência privada live-sequential-corrective-after.json, SHA256 fd2fdea3b2d71641a1b2b9c8c07393b75104dd68eb9e103cbc1cf1d15254d8f4. Não houve repetição paga para tentar obter uma compra.

A inspeção manual de Dados e limites às 04:24 UTC confirmou cinco candidatos recebidos pelo Inonu, zero para acompanhar e cinco descartados, com carteira desconectada. O texto distingue os 89 excluídos por menos de duas famílias de evidência a favor e os 15 excluídos por pool/detentores antes do modelo. Os detalhes foram recolhidos ao terminar. Captura final C:/Users/gabri/.codex/tmp/radar-01a136cd/radar-final-20261014.png mostra a resposta e a interface compacta.

Esta prova live cobre o ramo de uma avaliação e a resposta pública válida. O ramo de duas avaliações, acompanhamento sem caixa, validação da prioridade, limites e contabilização parcial foram exercitados em testes com provider simulado, não em uma segunda consulta real. A projeção HTTP legada de uso recente omite as medições por etapa; o delta observado e o resultado não são apresentados como essas medições. Os testes de composição conferem o Brief efetivamente entregue ao adaptador, inclusive origem/frescor; a consulta live não capturou o payload bruto transmitido ao provedor.

RAD-01 a RAD-05 e SEQ-01 a SEQ-06 têm as evidências delimitadas acima: 234 testes distintos verdes no integrador, types e build verdes, revisão isolada APPROVE e uma consulta corretiva pública. A correção elimina a dependência impossível entre escolhas independentes, preserva os gates e não força uma recomendação. Não demonstra oportunidade de compra nesta leitura, acerto financeiro, ML treinado, lucro, nem automação de ordens. Nenhum novo envio privado de carteira, assinatura ou trade foi realizado. Próximo passo útil: medir as decisões em simulação com dados verificáveis e custos, antes de ampliar a execução financeira.
