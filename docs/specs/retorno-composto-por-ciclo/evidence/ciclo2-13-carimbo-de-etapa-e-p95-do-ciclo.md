# Ciclo 2, ticket T13: Carimbo de etapa e p95 do ciclo

> Saida bruta de agentes Haiku 5.5 (esforco medio) do workflow wf_1930517d-e57, com o veredito do cetico. Material de proveniencia, NAO curado; onde divergir valem [../wayfinder.md](../wayfinder.md) e [../status.md](../status.md).

Type: research
Status: resolved
Blocked by: nenhum
Domain: operacao
Priority: 13

## Question

Qual o p50, p95 e p99 de cada etapa do ciclo (leitura do livro, fatos e graca, ecossistema, timing, momentum, modelo, ordem, fechamento e espera do agendador), medidos em pelo menos 1000 ciclos com inicio e fim, e quanto dos cerca de 15,6 s fora da chamada do modelo e espera do agendador (scheduler.ts:103 e :112)?

Por que importa: So o modelo (0,37 s) e o total de 37,5 s por ciclo estao medidos. Os tetos somam cerca de 170 s antes do modelo por grupos sequenciais (cycle.ts:793-839), e a mediana real e desconhecida. Ha indicio de 5 de 9 ciclos sem consulta entre 33,5 s e 33,65 s, sugerindo espera de leitura. Sem o carimbo nao se decide cadencia nem paralelizacao.
Evidencia a buscar: cycle.ts:440 (durationMs) e pontos de inicio e fim de cada etapa (cycle.ts:300-305, 479, 505, 813, 837); docs/sdd/hospedagem-24h/CADENCIA-20261014.md alem das 60 primeiras linhas; docs/sdd/agente-autonomo/VIABILIDADE-CICLO-1MIN-E-COTAS-20261015.md secao 2; registros de ciclo em data/ somente como agregados.

## Answer

Nao ha p50, p95 e p99 por etapa: nenhuma etapa grava o proprio tempo, so o total do ciclo (durationMs, cycle.ts:440), e o repo tem 21 ciclos distintos com esse total, nao 1000. Com esses 21: total p50 4,1 s, p95 34,6 s, p99 38,0 s. Ciclos que consultaram (n=14) tem p50 2,2 s; 7 sem consulta, e 5 deles ficam entre 33,5 e 33,65 s. O 15,6 s fora do modelo e do agendador nao esta verificado: vem de 135,6 s menos 120 s de uma auditoria anterior a correcao de 2026-10-16 que deduplica ciclos. Nos ciclos que consultaram, o nao-modelo mediano e cerca de 1,8 s (2,2 s menos 0,37 s), o que sugere que o grosso dos 15,6 s esta em before, after e espera do agendador, nao no ciclo. Para decidir cadencia ou paralelizacao falta o carimbo por etapa.

### Caminhos (Wayfinder)

- **Carimbo por fora, em script de sombra (wrapper de dependencias)**: Um script envolve as dependencias do ciclo (livro, fatos, ecossistema, timing, momentum, modelo e ordem) com cronometro, roda o agente em sombra com o modelo trocado por tempo fixo de 0,37 s e grava p50, p95 e p99 por etapa. Nao altera cycle.ts nem o journal. | Restricao que prende: O carimbo nao pode entrar no registro kind cycle do journal (schema de journal e vedado ao Jev) e o modelo nao pode ser chamado. | Experimento mais proximo: 200 ciclos em sombra com o wrapper, depois 1000 ciclos, sem chamar o Jev. | Ganho: Responde o p95 real por etapa e separa o 15,6 s do before, do after e da espera. Sem numero de ganho de lucro, so decisao de cadencia. | Esforco: baixo a medio, um script de teste e uma rodada de sombra. | Como medir: Percentis nearest-rank por etapa sobre 1000 ciclos, com contagem de ciclos que consultaram e dos que nao consultaram, separados.
- **Medir o intervalo real entre inicios com o relatorio deduplicado**: Usar scripts/observe-24h.ts com dedupeCycles sobre o journal que ja existe, sem codigo novo, para medir o intervalo real entre inicios e o silencio entre ciclos. Substitui o 135,6 s anterior. | Restricao que prende: O journal atual nao tem etapas, so atMs e outcome, e o dono tem o journal real fora do repo. | Experimento mais proximo: Rodar o relatorio sobre a janela de 24 h mais recente, em modo leitura. | Ganho: Mostra se o 15,6 s existe depois da deduplicacao. Pode mostrar que a cadencia efetiva e outra. | Esforco: baixo, so leitura. | Como medir: Intervalos entre atMs de cycleId distintos, mediana e p95, com a cadencia nominal de cada periodo.
- **Carimbo de etapas em memoria no relatorio do ciclo**: Acrescentar um campo opcional de etapas ao CycleReport, exposto so em runtime-latest e no relatorio em memoria, sem tocar o registro kind cycle do journal. | Restricao que prende: Mudanca de contrato do relatorio (tipo CycleReport em cycle.ts:245) e a exigencia de nao alterar o journal. | Experimento mais proximo: Campo opcional e teste de cada etapa com relogio injetado, depois rodada de 1000 ciclos em sombra. | Ganho: Mesmo resultado do wrapper, com menos codigo externo. Ganho de precisao maior, porque mede dentro do ciclo. | Esforco: medio, uma mudanca em cycle.ts e testes. | Como medir: Mesmo calculo do caminho 1, lido de runtime-latest.
- **Paralelizar leituras pos-livro, depois de medir**: O timing das posicoes (cycle.ts:813) nao depende do ecossistema, mas reusa o timing do ecossistema via timings.get. Trocar esse reuso permitiria rodar os dois juntos e cortar o teto pre-modelo de 170 s para 145 s no pior caso. | Restricao que prende: O timing das posicoes reusa o timing do ecossistema (cycle.ts:813), e o momentum depende dos dois. Sem p95 medido, o ganho e teorico. | Experimento mais proximo: Medir primeiro o p95 de cada grupo com o wrapper, e so depois mexer no paralelismo. | Ganho: Teto pre-modelo de 170 s para 145 s no pior caso (calculo). Ganho real nao medido. | Esforco: medio, muda a ordem de chamadas e precisa de testes de regressao. | Como medir: p95 do grupo pos-livro antes e depois, sobre 1000 ciclos em sombra.
- **Adiar a decisao de cadencia e medir so o que existe**: Nao instrumentar agora. Usar durationMs e o relatorio deduplicado, manter 2 min quente e 5 min frio e decidir cadencia so depois que houver p95 medido. | Restricao que prende: Sem carimbo, p95 por etapa e desconhecido, e o 15,6 s nao se decompoe. | Experimento mais proximo: Caminho 2, sem mudanca de codigo. | Ganho: Nenhum ganho direto. Evita decidir cadencia com dado errado. | Esforco: nenhum. | Como medir: Revisar a decisao quando o caminho 1 ou 3 tiver 1000 ciclos.

### Achados

- [A1|fato|alta|VERIF=confirmado] durationMs e calculado como now menos t0, e t0 e marcado dentro de cycle(), antes da leitura do livro. Assim o total nao inclui o before do agendador (teto 60 s) nem o after (teto 120 s), nem a espera do timer.
    fonte: src/agent/cycle.ts:421 (t0), cycle.ts:440 (durationMs); src/agent/scheduler.ts:103 (safely before, 60 s), scheduler.ts:112 (safely after, 120 s)
- [A2|fato|alta|VERIF=confirmado] Sequencia real de etapas dentro do ciclo, com teto de cada uma: leitura do livro (readMs 25 s), fatos das posicoes (factsMs 30 s mais 15 s de graca), saidas protetoras (orderMs 150 s), ecossistema (25 s), timing das moedas (25 s), timing das posicoes (25 s), momentum (25 s), modelo (modelMs 90 s), ordens (orderMs). Os grupos pos-livro sao sequenciais, com paralelismo interno.
    fonte: src/agent/cycle.ts:479 (livro), cycle.ts:505 (fatos), cycle.ts:732 e 780 (saidas), cycle.ts:793 (ecossistema), cycle.ts:800 (timing), cycle.ts:813 (timing das posicoes), cycle.ts:837 (momentum), cycle.ts:1005 (modelo), cycle.ts:1180 (ordens); wire.ts:146 TIMEOUTS; cycle.ts:344-348 withSoftDeadline; wire.ts:145 e cycle.ts:54 CLOSING_PHASE_MS 20 s
- [A3|calculo|alta|VERIF=parcial] O teto somado antes do modelo e 170 s (25 de livro, 45 de fatos com graca, 25 cada em ecossistema, timing, timing das posicoes e momentum). Esse e um teto de codigo, nao um tempo medido, e o total real observado e muito menor.
    fonte: cycle.ts:479, 505, 793, 800, 813, 837 e limites de wire.ts:146; confirmado em docs/specs/retorno-composto-por-ciclo/evidence/pesquisa-t07-velocidade-de-decisao.md (a3)
    >> parcial: A soma de 170 s esta certa para as leituras (25 livro + 45 fatos + 4 x 25 em ecossistema, timing, timing das posicoes e momentum), mas o teto pre-modelo nao inclui as saidas protetoras: cycle.ts:780 chama executeRows(protective) no modo limitado antes da leitura do ecossistema (cycle.ts:793), e cada ordem tem orderMs 150 s (cycle.ts:732). O teto real depende do numero de ordens. Alem disso, pesquisa-t07-velocidade-de-decisao.md marca o proprio a3 como VERIF=parcial, nao como confirmado. | correcao: Dizer: o teto de leituras pre-modelo e 170 s; com saidas protetoras no modo limitado, o teto pre-modelo cresce em 150 s por ordem de saida. Citar a t07 como parcial.
- [A4|calculo|media|VERIF=confirmado] Sobre 21 ciclos distintos (dedupe por cycleId, campo runtime.last) em data/decision-review/runtime-observations.jsonl: durationMs p50 4.111 ms, p95 34.552 ms, p99 38.026 ms, minimo 766 ms, maximo 38.026 ms. A amostra e de observacoes espacadas, nao de ciclos consecutivos, e nao substitui 1000 ciclos.
    fonte: data/decision-review/runtime-observations.jsonl (33 linhas, dia 2026-10-14; agregado calculado com Bun, nenhum dado bruto copiado)
- [A5|calculo|media|VERIF=parcial] Dos 21 ciclos, 14 consultaram o modelo (p50 2.212 ms, maximo 38.026 ms) e 7 nao consultaram (1.062, 1.158, 11.508, 33.537, 33.615, 33.635 e 33.646 ms). Os cinco valores entre 33,5 e 33,65 s sao o mesmo padrao que a pesquisa anterior registrou.
    fonte: data/decision-review/runtime-observations.jsonl (campos runtime.last.durationMs e consulted)
    >> parcial: A lista dos 14 consultados e dos 7 sem consulta confere (1062, 1158, 11508, 33537, 33615, 33635, 33646). Mas na faixa de 33,5 a 33,65 s ha quatro valores (33537, 33615, 33635, 33646), nao cinco. O p50 de 2212 ms e posto mais proximo; a mediana aritmetica dos 14 e (2212+2900)/2 = 2556 ms, e pesquisa-lacuna-g3.md (linha 7) reporta 2,9 s. A afirmacao de que o padrao coincide com a pesquisa anterior nao tem fonte citada. | correcao: Trocar cinco por quatro e declarar o metodo do p50 (posto mais proximo 2212 ms; mediana aritmetica 2556 ms). Citar a fonte do padrao anterior ou marcar como nao verificado.
- [A6|hipotese|baixa] Os ciclos sem consulta de 33,5 a 33,65 s coincidem com o corte do factsMs (30 s) mais cerca de 3,5 s de acabamento. Isso e uma hipotese: nao ha carimbo por etapa para confirmar, e pode ser outra leitura lenta.
    fonte: cycle.ts:505 e cycle.ts:344-348 (corte suave em 30 s, graca de 15 s); padrao em runtime-observations.jsonl
- [A7|fato|media|VERIF=confirmado] O modelo mede 0,37 s no caminho do ciclo: mediana 371 ms, p90 406 ms, p99 1,57 s, em 120 consultas. A mediana de 0,37 s e o valor citado nos documentos e nao pode ser refeito aqui, porque decisions-meta.jsonl nao esta no repo.
    fonte: docs/sdd/agente-autonomo/VIABILIDADE-CICLO-1MIN-E-COTAS-20261015.md secao 2 (linhas 41-43); docs/sdd/agente-autonomo/ANALISE-10X-EM-24H-20261015.md:73
- [A8|fato|alta|VERIF=refutado] Nenhuma etapa grava tempo: o unico carimbo de duracao e durationMs, e o registro kind cycle do journal leva atMs e outcome, sem duracao por etapa. Portanto p50, p95 e p99 por etapa so existem depois de instrumentar.
    fonte: grep de durationMs em src/agent/cycle.ts (apenas cycle.ts:245 e cycle.ts:440); ledger.append em cycle.ts:460 e cycle.ts:620; docs/specs/retorno-composto-por-ciclo/evidence/pesquisa-lacuna-g3.md linha 7
    >> refutado: Falso que nenhuma etapa grava tempo. src/agent/cycle.ts:1004 e 1016 gravam askedAtMs e answeredAtMs; cycle.ts:1076 passa factAvailableAtMs, askedAtMs e answeredAtMs para o registro; src/agent/decision-metadata.ts:33-34 os tipa; src/agent/wire.ts:803 e 847 gravam decisions-meta.jsonl. Logo o tempo do modelo ja e persistido por decisao, e p50 e p95 do modelo podem sair desse arquivo sem instrumentar. Verdadeiro: o registro kind cycle (cycle.ts:460 e 620) nao tem duracao por etapa, e as demais etapas nao gravam tempo. | correcao: Reescrever: somente o modelo grava tempo (askedAtMs, answeredAtMs, factAvailableAtMs) em decisions-meta.jsonl; as outras etapas nao gravam tempo, e o registro kind cycle nao tem duracao por etapa.
- [A9|fato|baixa|VERIF=confirmado] O 15,6 s fora do modelo e do agendador vem de 135,6 s (intervalo mediano entre olhares gravados) menos 120 s nominais. Esse intervalo e de auditoria anterior a correcao de 2026-10-16, que mostrou que linhas kind cycle duplicadas por cycleId criam intervalos artificiais; a correcao usa dedupeCycles. O arquivo de intervalos nao esta no repo, entao o 135,6 s nao foi recalculado.
    fonte: docs/sdd/agente-autonomo/VIABILIDADE-CICLO-1MIN-E-COTAS-20261015.md linha 43 e secao 7 (2026-10-16); scripts/observe-24h.ts:373 (dedupeCycles); pesquisa-t07-velocidade-de-decisao.md linha 16
- [A10|fato|alta] O agendador e encadeado: o proximo tick so e armado depois de before, do ciclo e do after terminarem. O periodo entre inicios e before mais durationMs mais after mais o intervalo nominal, nao um inicio a cada intervalo. Por isso o 2 min nominal nao e o periodo medido.
    fonte: src/agent/scheduler.ts:127-128 (arm, intervalo nominal), scheduler.ts:161-175 (tick: await cycle() e depois arm()), scheduler.ts:103 e :112
- [A11|fato|alta] Mistura de cadencias: os docs citam 120 s (quente, 2 min) e 5 min (frio). O runtime observado em 2026-10-14 tinha intervalMin 5, e o 135,6 s foi comparado com 120 s. Comparar com a cadencia errada invalida a conta de 15,6 s.
    fonte: data/decision-review/runtime-observations.jsonl (scheduler.intervalMin 5); pesquisa-t07-velocidade-de-decisao.md linha 16 (quente de 2 min, frio de 5 min)
- [A12|calculo|alta] Custo de tempo para medir 1000 ciclos: 33,3 h a 2 min, 16,7 h a 1 min e 83,3 h a 5 min. Ciclos sem consulta nao gastam a cota do Jev, mas gastam leituras de OKX e Solana, cujo consumo nao foi medido aqui.
    fonte: aritmetica sobre 1000 ciclos; cota local de 720 consultas em wire.ts e docs/sdd/agente-autonomo/VIABILIDADE-CICLO-1MIN-E-COTAS-20261015.md linha 68
- [A13|fato|alta] O relogio do ciclo e injetado (deps.now) e cada leitura passa por deps, o que permite medir por fora, envolvendo as dependencias, sem alterar a logica do ciclo. Os testes ja movem o tempo por injecao.
    fonte: src/agent/cycle.ts:421 (deps.now), cycle.ts:479, 505, 793, 800, 813, 837, 1005 (deps chamadas); src/agent/scheduler.ts:2 (timers injetados)

### Decisao para o Jev

Pergunta: Como medir o p50, p95 e p99 de cada etapa do ciclo antes de decidir cadencia ou paralelizacao?
Reversivel: true

- adiar_sem_carimbo (Adiar: nao instrumentar agora): Nao muda codigo. Usa durationMs e o relatorio deduplicado para intervalos; cadencia segue 2 min quente e 5 min frio ate existir p95 medido por etapa. | Evidencia: cycle.ts:440 so durationMs; VIABILIDADE secao 7 (dedupeCycles)
- wrapper_de_deps (Carimbo por fora, em script de sombra): Script envolve as dependencias com cronometro e roda sombra com modelo fixo em 0,37 s. Nao altera cycle.ts nem o journal. Mede 1000 ciclos. | Evidencia: cycle.ts:479,505,793,800,813,837,1005,1180 sao os pontos de chamada
- carimbo_em_memoria (Campo de etapas no relatorio do ciclo): Campo opcional de etapas no CycleReport, exposto so em memoria e runtime-latest, sem tocar o registro kind cycle do journal. Mede dentro do ciclo. | Evidencia: cycle.ts:245 tipo CycleReport; journal cycle.ts:460 fica de fora
- paralelizar_apos_medir (Paralelizar leituras pos-livro, depois de medir): Rodar timing das posicoes junto com ecossistema, trocando o reuso em cycle.ts:813. Teto pre-modelo cai de 170 s para 145 s no pior caso. So depois do p95 medido. | Evidencia: cycle.ts:793-837 grupos sequenciais; teto 170 s (pesquisa-t07 a3)

Recomendacao sem Jev: wrapper_de_deps - Mede todas as etapas sem alterar cycle.ts, o journal, a cadencia nem o modelo; e reversivel por apagar um script, nao toca nenhum dado de producao e nao gasta cota de Jev nem de servico pago. Se o wrapper nao cobrir a espera interna, o campo em memoria vira o passo seguinte.
Cetico: decisao_ok=false; problemas: O fato carimbo_por_etapa diz 'inexistente: so durationMs e atMs no journal'. Para o modelo isso e falso: askedAtMs e answeredAtMs sao gravados em decisions-meta.jsonl (cycle.ts:1076, wire.ts:803). Corrigir o fato para 'so o modelo tem carimbo, em decisions-meta.jsonl; demais etapas nao'. | O fato total_p50_p95_p99 e a opcao adiar nao dizem que o p50 e de posto mais proximo; a mediana aritmetica do subconjunto consultado difere (2212 contra 2556 ms). Declarar o metodo. | O fato sem_consulta diz '5 entre 33,5 e 33,65 s'. Sao quatro (33537, 33615, 33635, 33646). Corrigir. | Falta a opcao de usar decisions-meta.jsonl que o dono ja tem (askedAtMs, answeredAtMs) para p50, p95 e p99 do modelo, com o relatorio observe-24h, sem codigo novo. Essa opcao responde parte da pergunta antes de qualquer instrumentacao. | A opcao wrapper_de_deps manda rodar 1000 ciclos de sombra com leituras reais, mas nao proibe gastar cota de API paga ou limitada. ANALISE-10X-EM-24H-20261015.md:70-72 projeta 109,5 mil chamadas por mes no Basic, acima do teto de 100 mil. Falta restricao: as leituras da sombra nao podem consumir cota paga ou limitada sem decisao do dono; usar briefs gravados ou leitura sem rede como alternativa. | O bloco desconhecidos traz campos 'ask' redigidos como perguntas ao dono. Pelas regras do owner, esses itens devem ir para bloqueios_do_dono e nao como perguntas. | A referencia observe-24h.ts:373 aponta para o fim do comentario; dedupeCycles esta em :374. Trocar a citacao. | A numeracao das afirmacoes pula de A5 para A7 (nao ha A6). Se A6 foi removida, a decisao deve dizer isso.

### Bloqueios do dono

- Alterar o registro kind cycle do journal ou qualquer schema de journal para incluir etapas (vedado: migracao de journal).
- Mudar intervalMin, TIMEOUTS ou a cota de consultas do Jev para 1440 por dia (impacta servico pago e cota da conta; a cota real so o dono le no console).
- Ler ou ampliar o uso do WebSocket ou do plano pago da OnchainOS (servico pago a partir de US$ 99 por mes) para medir cadencia.
- Usar o feed da OKX para medicao continua: o OKX API Agreement 9.4 proibe raspagem, decisao de risco ja reservada ao dono.
- Qualquer saida da sombra para live, ou qualquer ordem de teste, assinatura ou transferencia durante a medicao.

### Novos tickets revelados

- Causa dos ciclos de 33,5 s sem consulta: O corte suave de 30 s dos fatos (cycle.ts:505) explica os 5 ciclos sem consulta entre 33,5 e 33,65 s, ou outra leitura lenta? Medir com o wrapper.
- Cadencia efetiva sobre o journal deduplicado: Qual o intervalo real entre inicios de ciclos distintos (dedupeCycles) em 24 h, e o 15,6 s sobrevive a deduplicacao?
- Paralelismo do timing das posicoes: Quanto cai o p95 pos-livro se o timing das posicoes deixar de reusar o do ecossistema (cycle.ts:813)?
- Consumo de leituras em sombra sem consulta: Quantas leituras OKX e Solana por minuto um ciclo de 1 min sem consulta gasta, frente aos limites publicos de RPS?

### Nao lido

- docs/sdd/agente-autonomo/VIABILIDADE-CICLO-1MIN-E-COTAS-20261015.md secao 2 lida so nas linhas 22 a 44 e secao 7; o arquivo decisions-meta.jsonl citado nao esta no repo, entao as 120 consultas e o 135,6 s nao foram refeitos.
- Arquivo de intervalos de cadencia citado em pesquisa-t07 nao esta no repo.
- data/decision-review/runtime-observations.jsonl tem so 33 linhas; nao ha 1000 ciclos com etapas. Nenhum registro bruto de ciclo foi copiado.
- scripts/observe-24h.ts lido so na assinatura de dedupeCycles (linha 373), nao na logica completa.
- CADENCIA-20261014.md lido por inteiro (44 linhas, o pedido dizia 60 primeiras).
- Nao li .env, chaves ou enderecos de carteira; nao chamei o Jev, nem OKX, nem OnchainOS; nao editei arquivos do repo.

### Resumo do cetico

Reverifiquei A1 a A9 contra o repo e os agregados do runtime. A1, A2, A4, A7 e A9 conferem nas linhas citadas. A3 tem aritmetica certa mas omite as saidas protetoras que rodam antes do ecossistema. A5 erra a contagem (quatro valores na faixa de 33,5 s, nao cinco) e o metodo de p50. A8 esta refutada em parte: o modelo ja grava askedAtMs e answeredAtMs em decisions-meta.jsonl, entao "nenhuma etapa grava tempo" e falso para o modelo. A decisao nao deve ir ao Jev como esta: o fato "carimbo_por_etapa inexistente" e incorreto para o modelo, a contagem de 5 valores esta errada, falta a opcao de usar decisions-meta.jsonl existente, e a opcao de sombra com 1000 ciclos reais nao tem restricao de cota paga. Nada foi alterado no repo.

## Comments

