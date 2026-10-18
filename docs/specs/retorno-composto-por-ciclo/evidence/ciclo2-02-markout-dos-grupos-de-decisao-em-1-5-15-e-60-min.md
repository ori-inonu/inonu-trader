# Ciclo 2, ticket T02: Markout dos grupos de decisao em 1, 5, 15 e 60 min

> Saida bruta de agentes Haiku 5.5 (esforco medio) do workflow wf_1930517d-e57, com o veredito do cetico. Material de proveniencia, NAO curado; onde divergir valem [../wayfinder.md](../wayfinder.md) e [../status.md](../status.md).

Type: research
Status: resolved
Blocked by: nenhum
Domain: edge
Priority: 2

## Question

Qual o retorno liquido medio de 1, 5, 15 e 60 minutos apos a decisao para (a) as 38 compras pedidas, (b) as 10 mantidas, (c) as 411 candidatas fechadas antes do Jev e (d) as 268 puladas pelo modelo, descontado o atrito de 0,42% (ativo liquido) e de 1,8% a 2,1% (raso), usando so registros existentes em data/ e sem mudar schema de journal?

Por que importa: G1 e o maior gargalo: 57% dos candidatos fecham antes do Jev. Se as fechadas tiverem markout igual ou melhor que as escolhidas, o filtro atual descarta edge. A medida nao gasta cota do Jev. A amostra ainda nao e independente, entao o resultado e descritivo.
Evidencia a buscar: data/ (git-ignored) lido so como agregados, sem campos de carteira: decisions-meta.jsonl e audits.jsonl; src/agent/shadow/outcomes.ts para o calculo; preco publico de vela da bolsa no mesmo instante; citar arquivo:linha de cada agregado.

## Answer

Nao calculavel com os registros existentes. Nenhum markout de 1, 5, 15 ou 60 min pode ser medido: nao ha preco pos-decisao dos candidatos em data/ nem no diretorio de producao (answers.jsonl e prices.jsonl ausentes, recording-status.json ausente). O funil reproduz de data/decision-review/audits.jsonl: 717 entradas de compra em 103 ciclos unicos, 411 (57,3%) fechadas antes do modelo, 268 puladas pelo modelo, 10 mantidas e 28 trocadas pelo codigo (38 pedidas). As 717 entradas cobrem so 38 tokens distintos (8 deles pedidos), entao a amostra e muito dependente. O script existente usa janelas de 15 min, 1 h e 4 h, nao 1 e 5 min, e a tolerancia de saida de uma janela de 1 min aceita saida ate 5 min depois. Resultado: descritivo nulo, nenhuma conclusao de edge.

### Caminhos (Wayfinder)

- **Medir com o gravador ja escrito**: Confirmar que answers e prices sao gravados no processo em uso, acumular amostra e so entao calcular markout com scripts/answers-outcomes.ts, sem mudar schema. | Restricao que prende: Os journals answers e prices nao existem no diretorio de producao, e o gravador so roda se o processo for uma release que o contem. | Experimento mais proximo: Verificar, sem alterar codigo, se recording-status.json aparece no diretorio de producao depois de um ciclo com o build atual. | Ganho: Permite o primeiro markout real dos 717 candidatos, sem gastar cota do Jev. | Esforco: baixo | Como medir: Contagem de linhas de answers e prices por hora e percentual de linhas com preco no instante da decisao e nas janelas.
- **Corrigir a janela de 1 min**: Acrescentar 1 min e 5 min a WINDOWS_MS e usar tolerancia de saida curta (ordem de segundos) para a janela de 1 min, em vez de max(5 min, janela/4). | Restricao que prende: A tolerancia atual de 5 min torna a medida de 1 min invalida; a fonte nao traz hora de observacao (recording.ts, obsAtMs null). | Experimento mais proximo: Teste unitario de forwardReturn com janela de 60 s: a saida a 5 min depois deve virar unknown com a tolerancia nova. | Ganho: Torna o 1 min mensuravel sem mudar schema; o valor da tolerancia e escolha de codigo, nao calibrada. | Esforco: baixo | Como medir: Contagem de unknown por janela antes e depois da troca, e distribuicao de lagMs das saidas aceitas.
- **Cotar ida e volta dos 38 tokens**: Para os 38 tokens distintos, cotar ida e volta no instante da decisao e em 1, 5, 15 e 60 min com a cotacao sintetica (RC-T3), sem enviar ordem. | Restricao que prende: Nao ha preco pos-decisao no repo; qualquer cotacao nova gasta cota de RPC ou Jupiter (Jupiter Free 60/min, RPC publico 100 req/10 s, fontes do repo). | Experimento mais proximo: Cotar 3 tokens dos 38 em 4 instantes e comparar com o movimento de A7. | Ganho: Medida de markout nao dependente do journal; n limitado a 38 tokens. | Esforco: medio | Como medir: Custo de ida e volta por cotacao (pool, impacto, rede) e numero de chamadas consumidas por token.
- **Reportar n por token, nao por entrada**: Tratar os 717 candidatos como 38 tokens e agrupar o markout por token e ciclo antes de dizer qualquer coisa sobre o funil. | Restricao que prende: Ha so 38 tokens e 8 pedidos; a amostra nao e independente (A6). | Experimento mais proximo: Recalcular o funil com n por token, sem janela de tempo. | Ganho: Evita falsa precisao de 717 observacoes. | Esforco: baixo | Como medir: Numero de tokens distintos, de ciclos e de entradas por grupo do funil.
- **Adiar e acumular amostra**: Nao mudar codigo nem gastar cota; esperar mais ciclos gravados com preco antes de qualquer markout. | Restricao que prende: O funil atual tem 38 tokens e nenhum preco pos-decisao. | Experimento mais proximo: Contar quantos ciclos novos com preco o gravador produz em 24 h. | Ganho: Nenhum imediato; reduz risco de conclusao errada. | Esforco: nenhum | Como medir: Ciclos com preco por dia e numero de tokens distintos com preco pos-decisao.

### Achados

- [A1|calculo|alta|VERIF=confirmado] Funil reproduzido de audits.jsonl (262 linhas, 103 ciclos unicos, dedup por cycleId): 717 entradas de compra; 411 closed_before_choice; 278 model_choice (268 skip e 10 buy_full); 28 code_adjusted; 38 pedidas = 10 + 28. Bate com validacao-e-baseline.md:11.
    fonte: data/decision-review/audits.jsonl (campo consultation.candidates, dedup por cycleId); docs/specs/retorno-composto-por-ciclo/validacao-e-baseline.md:11
- [A2|fato|alta|VERIF=parcial] Nao existe preco pos-decisao de candidatos: answers.jsonl e prices.jsonl ausentes em data/ e em C:/Users/gabri/AppData/Local/InonuTrader/data/agent (que tem decisions-meta.jsonl com 120 linhas, briefs.jsonl, scoreboard.jsonl, closings.jsonl, ledger.jsonl), e sem recording-status.json.
    fonte: listagem do diretorio de producao; scripts/answers-outcomes.ts:31 (nota: o core de 2026-10-15 nao contem o gravador)
    >> parcial: Confirmado: answers.jsonl, prices.jsonl e recording-status.json nao existem em data/decision-review nem em C:/Users/gabri/AppData/Local/InonuTrader/data/agent (listagem completa do diretorio). Refutado: a afirmacao 'nao existe preco pos-decisao de candidatos' e falsa. scoreboard.jsonl, no mesmo diretorio de producao, tem 3239 linhas kind settlement com priceUsd: 864 em 15m, 852 em 1h, 822 em 4h, 701 em 24h, 246 com reason sem_preco. Elas se ligam a 869 linhas kind decision, das quais 648 sao de candidatos de compra e cobrem os 38 ids de compra do audits. Fonte: src/agent/scoreboard.ts:9-13 (janelas 15m, 1h, 4h, 24h) e :310 (settlement com lookup(d, target)); src/agent/live.ts createPriceLookup (fechamento da barra de 5 min ou de 1 h ja fechada no instante alvo). | correcao: Nao existe preco de 1 min nem de 5 min. Existe placar com preco pos-decisao em 15m, 1h, 4h e 24h, em scoreboard.jsonl, por fechamento de barra (5 min para spans de ate 1 h, 1 h acima). O settledAtMs e o instante de gravacao, nao o instante do preco. validacao-e-baseline.md:63 ('markout que ainda nao existe') tambem precisa de correcao.
- [A3|fato|alta|VERIF=parcial] O gravador existe no codigo e e criado pelo wire com dir = dataDir/agent; ausencia dos journals indica que o processo em uso e anterior ou roda com recording desligado. Nao verificado qual.
    fonte: src/agent/wire.ts:413 e :161; src/agent/recording.ts:198-200
    >> parcial: Referencias confirmadas: src/agent/wire.ts:413 cria createRecorders com dir = dataDir/agent (wire.ts:161); wire.ts:109-110 diz que a gravacao e ligada por padrao, salvo recording false; src/agent/recording.ts:198 define createRecorders; recording.ts:207 e :214 gravam recording-status.json na primeira chamada de registro. Inferencia que o A3 deixou em aberto: o LOCK do agente (AppData/.../agent/LOCK) registra startedAtMs 2026-10-15T15:15:49Z. O primeiro commit que rastreia src/agent/recording.ts e 43960d8, de 2026-10-15 20:12 -0300, depois desse inicio. scripts/answers-outcomes.ts:31 diz que o core de 15/10 nao contem o gravador. Com o processo vivo (dados gravados ate 2026-10-17 21:23Z) e sem recording-status.json, a ausencia e quase certamente de build anterior ao gravador, nao de gravacao desligada. | correcao: Trocar 'nao verificado qual' por: o processo em uso iniciou em 2026-10-15T15:15:49Z, antes do gravador, e e provavel que rode sem ele; confirmar exige reinicio controlado, que nao esta na lista de restricoes.
- [A4|fato|alta|VERIF=confirmado] As janelas do calculo sao 15m, 1h e 4h. Faltam 1 min e 5 min, e o ticket pede 1, 5, 15 e 60 min.
    fonte: src/agent/shadow/outcomes.ts:13; scripts/answers-outcomes.ts:44
- [A5|calculo|alta|VERIF=confirmado] Tolerancia de saida = max(5 min, janela/4). Para a janela de 1 min vale 5 min, ou seja, o retorno de 1 min pode ser medido com saida ate 5 min depois, e a entrada tambem aceita preco de ate 5 min antes. A medida de 1 min nao sai do codigo atual.
    fonte: src/agent/shadow/outcomes.ts:18 (ENTRY_TOLERANCE_MS = 5 min) e :20 (exitToleranceMs)
- [A6|calculo|alta|VERIF=confirmado] Independencia: 717 entradas de compra correspondem a 38 tokens distintos (media de ~19 entradas por token); os 38 pedidos cobrem so 8 tokens e as 411 fechadas cobrem 27. Logo o n efetivo e muito menor que 717.
    fonte: data/decision-review/audits.jsonl, dedup por cycleId e id de candidato (ids nao reproduzidos)
- [A7|fato|media|VERIF=confirmado] Movimento absoluto mediano (sem direcao, 16 tokens, amostras sobrepostas): 0,38% (1 min), 0,63% (5 min), 1,03% (15 min), 2,23% (60 min). Nao diz se um lado vence o custo.
    fonte: docs/specs/retorno-composto-por-ciclo/research.md:29 (medido, frágil)
- [A8|fato|media|VERIF=parcial] Atrito medido: 0,42% de ida e volta em ativo liquido (media de 6 pares, faixa 0,17% a 0,56%); 1,82% em intermediario (1 par) e pelo menos 2,1% em raso, so na entrada. Comparado ao movimento mediano de 1 min (0,38%), o atrito liquido ja supera a mediana.
    fonte: docs/specs/retorno-composto-por-ciclo/research.md:26-27
    >> parcial: Numeros confirmados em evidence/pesquisa-t12-linha-de-base.md:35: liquido 0,17% a 0,56%, media 0,42%, 6 pares; intermediario 1,82%, 1 par; raso pelo menos 2,1% so na entrada. Research.md:26-27 reproduz esses valores. A inferencia e fraca: compara o custo de ida e volta de 6 pares liquidos com o movimento absoluto mediano de 16 outros tokens, sem direcao. A comparacao numerica (0,42 > 0,38) e verdadeira, mas nao testa edge. | correcao: Trocar 'o atrito ja supera a mediana' por: o atrito liquido medio (0,42%) fica acima do movimento absoluto mediano de 1 min (0,38%), o que nao diz que um lado vence o custo.
- [A9|inferencia|baixa] Inferencia: se o retorno bruto medio de 1 min estiver perto da mediana absoluta (0,38%), ele fica abaixo do atrito liquido (0,42%); em 60 min a mediana absoluta (2,23%) supera o raso (2,1%). Isso e so comparacao de magnitudes, sem sinal.
    fonte: A7 e A8 combinados
- [A10|fato|alta] Nenhum registro de candidato em audits.jsonl traz preco: as chaves sao id, kind, selected, offered, source, observedBlocks, missingBasis, choiceConcentration. Os bloqueios de fechamento sao 288 so minimo, 87 minimo mais sem_historico, 12 entrada_esticada mais minimo, 10 so entrada_esticada, 10 so sem_historico, 4 sem bloqueio. O significado de minimo nao foi verificado no codigo.
    fonte: data/decision-review/audits.jsonl (campo observedBlocks das 411 fechadas, dedup)
- [A11|fato|baixa] Fonte publica de velas da OKX: nao verificada. O WebFetch leu so os primeiros 100 mil de 406 mil caracteres da documentacao e nao alcancou o endpoint de velas, entao barras disponiveis e limite de linhas por chamada ficam em aberto. Os tokens do funil sao Solana, provavelmente fora da bolsa.
    fonte: https://www.okx.com/docs-v5/en/ (leitura truncada)
- [A12|fato|media] Janelas de tempo divergem: audits tem atMs de 2026-10-14 18:34 a 2026-10-15 00:49 UTC, enquanto validacao-e-baseline.md:... cita 19:13 a 00:52 UTC para a mesma janela. Nao conciliado.
    fonte: data/decision-review/audits.jsonl (campo atMs); docs/specs/retorno-composto-por-ciclo/validacao-e-baseline.md:... (secao 1, linha da janela auditada)

### Decisao para o Jev

Pergunta: Qual caminho o ticket T02 deve adotar para medir o markout de 1, 5, 15 e 60 min antes de qualquer decisao de design?
Reversivel: true

- medir-gravador (Medir com o gravador existente): Confirmar que answers e prices sao gravados no processo em uso, esperar amostra e so depois rodar o script de markout, sem mudar codigo ou schema. | Evidencia: wire.ts:413 grava; data sem answers.jsonl e sem recording-status.json
- janela-1min (Corrigir tolerancia para a janela de 1 min): Acrescentar 1 min e 5 min a WINDOWS_MS e usar tolerancia de saida curta para a janela de 1 min, em vez de 5 min. Mudanca de codigo, sem schema. | Evidencia: outcomes.ts:13 tem 15m, 1h, 4h; outcomes.ts:20 aceita 5 min de atraso
- cotacao-propria (Cotar ida e volta dos 38 tokens): Cotar os 38 tokens na decisao e em 1, 5, 15 e 60 min com a cotacao sintetica, sem ordem. Gasta cota de RPC ou Jupiter e precisa de validacao de custo. | Evidencia: 38 tokens distintos; Jupiter Free 60/min (research.md)
- adiar (Adiar e acumular amostra): Nao mudar codigo nem gastar cota; esperar ciclos com preco antes de qualquer markout e de qualquer decisao de design. | Evidencia: validacao-e-baseline.md:63 pede markout que ainda nao existe

Recomendacao sem Jev: medir-gravador - Nao muda codigo nem schema, nao gasta cota e e reversivel. Sem preco pos-decisao nenhuma janela e medivel, entao acumular a amostra gravada e o passo de menor risco. A correcao da janela de 1 min pode vir depois, como codigo separado.
Cetico: decisao_ok=false; problemas: A premissa central da decisao esta errada em parte. As opcoes 'medir-gravador' e 'adiar' tratam o markout como inexistente, mas scoreboard.jsonl ja mede 15m, 1h, 4h e 24h para os candidatos de compra. Calculo meu, bruto e contrafactual, sobre as linhas de compra do placar (inclui qualquer stance, n efetivo baixo, linhas nao independentes): mediana de retorno bruto a partir do preco de decisao de -0,23% em 15m (n=647), -0,75% em 1h (n=638), -2,74% em 4h (n=611) e -13,98% em 24h (n=494); fracao positiva de 45%, 43%, 36% e 25%. As 648 linhas vem de 112 ids de candidato, uma marca por token, lado e stance por hora. Nao e resultado nem decisao. | A opcao 'janela-1min' nao resolve o problema. O lookup de preco le so barras de 5 min e de 1 h (src/agent/live.ts createPriceLookup). Mudar WINDOWS_MS em outcomes.ts nao gera preco de 1 min. A opcao precisa dizer de qual fonte vem o preco de 1 min e se essa fonte existe; isso nao foi verificado. | A opcao 'cotacao-propria' pode tocar servico pago. O OnchainOS Basic ja projeta cerca de 157.614 chamadas no mes contra 100 mil do plano gratuito (evidence/pesquisa-t02-limites-onchainos.md:6), e o excedente exige assinatura de pagamento por requisicao (x402), que o projeto nao faz. A opcao so pode usar rotas gratuitas (Jupiter Free 60 por minuto; RPC publico 100 requisicoes por 10 s) com teto fixo, e isso precisa estar escrito. O placar ja chama a rota /onchain/candles do gateway a cada janela; a cota dessa rota nao foi verificada. | A opcao 'medir-gravador' exige reiniciar o agente vivo (LOCK com inicio em 2026-10-15T15:15:49Z) e passa a gravar answers.jsonl e prices.jsonl. Isso pode ser 'estender journals', que e o bloqueio B5 (docs/specs/retorno-composto-por-ciclo/tasks.md:28). A decisao afirma que nao toca B5, o que nao esta demonstrado. Deve ser registrado como bloqueio do dono, nao como opcao, ate que se prove o contrario. | A referencia 'ticket T02' nao existe em tasks.md. O markout do spec e RC-T6 (tasks.md:15), que pede 1, 5 e 15 min, sem 60 min. A janela de 60 min vem do placar (1h), nao do ticket. Ajustar a referencia. | O restante das restricoes e coerente: sem Jev, sem ordem, sem carteira e sem mudanca de schema, mas a restricao 'Sem chamada ... a servico pago' conflita com a opcao cotacao-propria, como descrito acima.

### Bloqueios do dono

- B5: estender journals, mudar schema ou ativar uma release com o gravador em producao exige decisao do dono.
- B1: qualquer provedor pago de candles ou cotacao historica fica com o dono.
- B2: raspar o site da OKX para velas viola os termos de API (OKX API Agreement 9.4); so API publica oficial, se o dono aceitar.

### Novos tickets revelados

- T02b tolerancia de 1 min: Qual tolerancia de saida em segundos mantem a janela de 1 min valida sem perder amostra demais?
- T02c gravador em producao: Por que answers.jsonl e prices.jsonl nao existem no diretorio de producao se wire.ts:413 cria o gravador?
- T02d n efetivo do funil: Qual n efetivo por token e por ciclo sustenta algum teste do funil com 38 tokens?
- T02e janela divergente: Por que a janela de audits (18:34 a 00:49 UTC) diverge da citada na validacao (19:13 a 00:52 UTC)?

### Nao lido

- Velas publicas da OKX: o WebFetch leu so 100 mil de 406 mil caracteres e nao alcancou o endpoint de velas; limites de linhas e barras nao verificados.
- data/events.jsonl (425 MB) lido so por chaves: traz posicao e preco da carteira, nao preco por candidato.
- scoreboard.jsonl, ledger.jsonl e closings.jsonl lidos so por contagem de chaves e tipos; contem campos de carteira, nao lidos por regra.
- Conteudo de marks e families dos candidatos em briefs.jsonl: nao verificado.
- Nenhuma fonte de preco por token Solana foi acessada; nenhuma chamada de rede ao vivo foi feita.

### Resumo do cetico

Reverifiquei as oito afirmacoes contra o codigo, os dados e a evidencia. A1, A4, A5 e A6 batem com a fonte. A2 esta parcialmente errada: os journals answers, prices e recording-status estao ausentes, mas existe o placar scoreboard.jsonl com precos pos-decisao em 15m, 1h, 4h e 24h, o que muda o diagnostico do T02. A3 e um achado de fato, com inferencia forte de que o processo em uso e anterior ao gravador. A7 e A8 tem numeros corretos, mas a inferencia de A8 e fraca. A decisao nao pode ir ao Jev como esta: a premissa de A2 esta errada, falta a opcao de usar o placar existente, a opcao janela-1min nao resolve a falta de preco de 1 min, e cotacao-propria e medir-gravador tocam restricoes vedadas ou nao listadas. Nada foi editado no repo, nenhuma chamada ao Jev ou a servico pago foi feita, e so leitura local e calculo foram usados.

## Comments

