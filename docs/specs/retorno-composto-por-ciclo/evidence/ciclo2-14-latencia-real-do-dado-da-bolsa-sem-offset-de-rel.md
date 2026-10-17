# Ciclo 2, ticket T14: Latencia real do dado da bolsa sem offset de relogio

> Saida bruta de agentes Haiku 5.5 (esforco medio) do workflow wf_1930517d-e57, com o veredito do cetico. Material de proveniencia, NAO curado; onde divergir valem [../wayfinder.md](../wayfinder.md) e [../status.md](../status.md).

Type: research
Status: resolved
Blocked by: nenhum
Domain: dados
Priority: 14

## Question

Qual atraso de rede e de fila, separado do offset do relogio local, separa o carimbo de origem da OKX da chegada em tickers e books5, e qual idade maxima torna um campo indisponivel para o Brief em vez de velho?

Por que importa: Tickers e books5 mediram de 1,3 a 1,6 s contra cerca de 121 ms em trades, sem separar relogio de atraso. Sem essa separacao nao se fixa o limite de frescor do Brief nem a janela de 5 min da materialidade.
Evidencia a buscar: pesquisa-t03 em evidence/; arquitetura-e-decisao.md secao 6, risco 4; relogio local sincronizado, carimbo de origem e recebimento monotonico por 24 h em trades, tickers e books5; mediana e p99 do atraso por canal.

## Answer

Nenhum atraso real foi medido nesta pesquisa, e o numero de 1,3 a 1,6 s nao e latencia: a amostra de tickers e books5 foi tirada das primeiras 2000 mensagens por canal, que na inscricao sao quase todas snapshots antigos (1965 instrumentos).
Trades, que sao eventos, deram 121 ms de mediana entre o carimbo da OKX e a chegada local. Esse valor e o limite superior do offset mais atraso de rede e fila, nao cada parcela separada.
O repo ja tem a separacao certa no codigo: relogio corrigido por ponto medio (clock.ts, incerteza de metade do RTT, ate 1,25 s pela regra de RTT de 2,5 s) e idade de origem separada da idade de cache monotonica (feed.ts:6, state.ts:32-69).
Limites vigentes: livro 5 s e ticker 15 s (types.ts:193-194), sem medida que os justifique. Sem offset medido, o estado vira clock_unknown e nao stale.
Para o Brief, a janela de 5 min pouco importa: 1,5 s e 0,5% dela. O que decide e o limite de segundos: 1,3 s e 26% de 5 s.
Falta o p50 e o p99 por canal em 24 h com relogio corrigido; sem isso nao se fixa o limite de frescor.

### Caminhos (Wayfinder)

- **Medir atraso por canal em sombra antes de mexer em limites**: Instrumentar cada mensagem de tickers, books5 e trades com relogio corrigido (offset medido) e recebimento monotonico, descartar as primeiras mensagens apos a inscricao (snapshot) e gravar p50, p95 e p99 por canal em 24 h, com e sem snapshot. | Restricao que prende: Nao existe p99 de atraso medido; a amostra atual esta contaminada por snapshots. | Experimento mais proximo: Captura em sombra de 24 h pelo feed atual, separando snapshot de inscricao de evento de mudanca. | Ganho: Fixa com numero os limites de 5 s e 15 s; ganho qualitativo, sem numero previo. | Esforco: baixo | Como medir: Histograma de (recebimento corrigido menos ts) por canal, filtrando a primeira mensagem de cada instrumento; comparar com trades.
- **Reduzir a incerteza do offset com mais amostras de RTT minimo**: Aumentar amostras de /api/v5/public/time, guardar o RTT minimo e publicar a incerteza (metade do RTT minimo) junto do relogio, em vez de aceitar ate 1 250 ms. | Restricao que prende: Sem RTT real medido da maquina do dono; o RTT de 380 a 450 ms foi medido em outro endpoint. | Experimento mais proximo: Medir offset a cada 5 min por 1 h com 3 e com 7 amostras e comparar a dispersao entre rodadas. | Ganho: Incerteza de ate 1 250 ms caindo para a metade do RTT minimo medido (numero a obter). | Esforco: baixo | Como medir: Dispersao do offset entre rodadas e RTT minimo; incerteza reportada no Brief.
- **Limite de idade por campo derivado da incerteza**: Definir a idade indisponivel do livro e do ticker como incerteza do offset mais p99 do atraso mais folga, substituindo o 5 s e o 15 s por um valor medido. | Restricao que prende: Depende do p99 do caminho 1; o p99 ainda nao existe. | Experimento mais proximo: Replay em sombra das decisoes com limites de 2, 5 e 15 s, contando bloqueios por book_stale e ticker_stale. | Ganho: Evita bloqueio desnecessario de livro parado e evita decisao sobre dado velho. | Esforco: medio | Como medir: Fracao de ciclos bloqueados por limite e diferenca de decisao entre limites no mesmo replay.
- **Usar trades como relogio de referencia continuo**: Como trades sao eventos, usar seu ts para medir offset mais atraso continuamente e cruzar com livros, sem depender de snapshot. | Restricao que prende: Ativos ilíquidos quase nao tem trade, e o canal trades nao garante cobertura de todos os 1965 instrumentos. | Experimento mais proximo: Em sombra, comparar a mediana de trades com a mediana corrigida pelo ponto medio a cada minuto por 1 h. | Ganho: Relogio de referencia sem chamada REST extra; ganho sem numero previo. | Esforco: medio | Como medir: Diferenca entre a mediana de trades e o offset medido; instrumentos sem trade no minuto ficam fora.
- **Manter 5 s e 15 s como politica provisoria e documentar**: Nao mudar codigo; registrar que os limites sao politica local, sem medida, e revisar quando o caminho 1 tiver dados. | Restricao que prende: Sem atraso medido, qualquer limite novo e chute. | Experimento mais proximo: Nenhum; apenas registro no spec e no status. | Ganho: Nenhum ganho direto; evita mudanca sem base. | Esforco: baixo | Como medir: Revisao do limite apos 24 h de captura em sombra.

### Achados

- [t14-a1|inferencia|alta] O 1,3 a 1,6 s de tickers e books5 mistura snapshots de inscricao antigos com offset nao corrigido; a amostra foi limitada as 2000 primeiras mensagens por canal, com 1965 instrumentos inscritos.
    fonte: docs/specs/retorno-composto-por-ciclo/evidence/pesquisa-t03-okx-exchange-ws.md:30-31 (a7) e :26 (a6)
- [t14-a2|fato|media|VERIF=parcial] Trades tem lag mediano de 121 ms entre ts da OKX e chegada local; como trade e evento, isso limita offset mais atraso combinados, sem separa-los.
    fonte: pesquisa-t03-okx-exchange-ws.md:30 (a7), :26 (a6)
    >> parcial: O valor de 121 ms de mediana existe em pesquisa-t03:30 (fonte a7), e a amostra vem dos 2000 primeiros recebidos por canal (:31). Mas a7 esta marcada como fato de confianca baixa e o proprio texto diz que tickers e books5 misturam snapshots e offset. A frase 'trade e evento, isso limita offset mais atraso' e inferencia: a semantica do ts de trades nao foi lida em fonte primaria (ver d3). | correcao: Tratar 121 ms como medida de baixa confianca em um canal, sem tirar dela conclusao de limite. Antes de combinar offset mais atraso, fechar d3 com a doc oficial da OKX.
- [t14-a3|fato|media|VERIF=confirmado] A latencia HTTP medida em REST de tickers foi de 380 a 450 ms, e a idade mediana de tickers de 1,87 e 1,99 s nao foi reproduzida com a faixa de 0,6 a 1,8 s do relato anterior, com relogio local sem correcao.
    fonte: pesquisa-t03-okx-exchange-ws.md:14-15 (a2)
- [t14-a4|fato|alta|VERIF=parcial] A regra de dado da fonte e idade de origem = relogio da OKX menos ts do campo; a idade de cache usa relogio monotonico do recebimento; a idade e o maximo das duas, e sem offset conhecido o estado vira clock_unknown, nunca velho nem zero.
    fonte: src/jev-read/feed.ts:6 (cabecalho), :266-287 (ages); src/jev-read/state.ts:46-49 e :65-69; src/jev-read/types.ts:87-88
    >> parcial: Confirmados: feed.ts:6 (cabecalho), feed.ts:266-287 (idade = maximo entre idade de origem e idade de cache; retorna null sem relogio em :278) e types.ts:87-88. Incorreto: state.ts:47 e state.ts:67 retornam verdadeiro quando exchangeNowMs e nulo, ou seja, book e ticker passam pela checagem de idade de cache e nao viram clock_unknown. O unico ponto que emite clock_unknown e state.ts:192, no ramo de candles. state.test.ts:489 e consistente com isso. | correcao: Sem offset, candles viram clock_unknown. Book e ticker nao viram: passam so com a idade monotonica de recebimento. Isso e uma lacuna a decidir, nao a regra descrita.
- [t14-a5|fato|alta|VERIF=confirmado] Limites de frescor vigentes: livro 5 000 ms, ticker 15 000 ms e candles 150 000 ms; nao ha comentario de medida que os justifique.
    fonte: src/jev-read/types.ts:193-195; src/jev-read/state.ts:32-69
- [t14-a6|fato|alta|VERIF=confirmado] O refresh REST entra por idade: livro apos 3 000 ms e ticker apos 10 000 ms, para quiet markets em que books5 so muda com evento.
    fonte: src/jev-read/loop.ts:17-19 e :104-110
- [t14-a7|fato|alta|VERIF=confirmado] O offset e medido pelo ponto medio do request (offset = ts do servidor menos (requisicao mais RTT/2)); a amostra com menor RTT vence; RTT acima de 2 500 ms e descartado; offset acima de 1 h e descartado. A incerteza maxima por amostra aceita e de 1 250 ms.
    fonte: src/system-one/clock.ts:9-12, :17, :20, :38-43
- [t14-a8|fato|media|VERIF=parcial] O relogio e medido uma vez na partida do script e depois em refresh; o intervalo de re-medicao nao foi lido, e o script avisa que sem offset o Jev nao e consultado.
    fonte: scripts/jev-read.ts:85-100; src/jev-read/loop.ts:30-31 e :51-76 (ClockKeeper, MAX_SAMPLE_AGE_MS 30 min em :22)
    >> parcial: A primeira parte confere: medicao na partida em scripts/jev-read.ts:150 e aviso de ausencia de offset em :97-98. A afirmacao de que o intervalo de re-medicao nao foi lido esta errada: scripts/jev-read.ts:163 tem every(600_000, measureClock), ou seja re-medicao a cada 10 minutos. A referencia de MAX_SAMPLE_AGE_MS esta errada: o valor de 30 minutos esta em loop.ts:16, nao em :22 (linha 22 e campo da interface). | correcao: Re-medicao a cada 10 min (scripts/jev-read.ts:163), medicao inicial em :150, amostra descartada apos 30 min sem sucesso em loop.ts:16. O desconhecido d4 e respondido pelo codigo.
- [t14-a9|calculo|alta|VERIF=parcial] Para o Brief, 1,3 s de erro equivale a 0,5% da janela de 5 min (300 s) e a 26% do limite de 5 s do livro e 9% do limite de 15 s do ticker; a janela de materialidade nao e o limite critico.
    fonte: aritmetica sobre src/jev-read/types.ts:193-194 e a7 (1,3 s de mediana)
    >> parcial: Aritmetica: 1,3 s sobre 300 s da 0,43%, nao 0,5%; 1,3 s sobre 5 s da 26%; 1,3 s sobre 15 s da 8,7%. A premissa e fraca: 1,3 s nao e latencia isolada. E uma mediana de 1,257 a 1,571 s de tickers e books5 que pesquisa-t03:30 diz misturar snapshots de inscricao e offset de relogio. Nao existe medida de atraso por canal que sustente o erro de 1,3 s. | correcao: Recalcular com o erro real apos a medida de p50 e p99 em sombra. Enquanto isso, nao usar 1,3 s como erro de referencia nem concluir que a janela de 5 min nao e o limite critico.
- [t14-a10|fato|media] O canal books5 empurra a cada 100 ms somente com mudanca, e tickers no maximo a cada 100 ms; por isso idade de origem alta num livro parado e normal, nao dado morto.
    fonte: pesquisa-t03-okx-exchange-ws.md:32 (a8, citando a documentacao OKX; verificacao parcial)
- [t14-a11|hipotese|baixa] O significado exato do campo ts nos canais tickers e books5 nao foi verificado em fonte primaria: a busca na web nao trouxe a documentacao oficial da OKX, e a inferencia de geracao do dado vem de memoria, nao de fonte lida.
    fonte: WebSearch sem resultado primario (2026-10-17); pesquisa-t03 secao NAO LIDO (linha 106)
- [t14-a12|fato|media] Nenhum p50 ou p99 de atraso por canal existe no repo para 24 h; o unico dado de cadeia e o de 15 ciclos do Jev (mediana 371 ms), que nao decompoe o atraso do dado.
    fonte: docs/specs/retorno-composto-por-ciclo/arquitetura-e-decisao.md:56 e :63-65; pesquisa-t08 a23

### Decisao para o Jev

Pergunta: Qual politica de idade e de offset o Brief usa enquanto o atraso por canal nao e medido?
Reversivel: true

- medir_sombra_24h (Medir 24 h antes de mudar): Manter 5 s e 15 s e capturar em sombra p50 e p99 por canal, separando snapshot de evento, antes de qualquer mudanca. | Evidencia: Nao ha p99 medido; a7 contaminada por snapshots (t03:31).
- manter_5s_15s (Manter limites atuais): Seguir com livro 5 s, ticker 15 s e offset de 3 amostras, sem medida nova, registrando como politica local. | Evidencia: types.ts:193-194; clock.ts:18 (3 amostras).
- limite_pela_incerteza (Limite pela incerteza do offset): Trocar o limite fixo por incerteza do offset mais folga, usando o RTT minimo medido, e revisar com dado real. | Evidencia: clock.ts:9-12 (incerteza de RTT/2) e a2 (RTT 380 a 450 ms).
- mais_amostras_offset (Mais amostras de offset): Subir de 3 para 7 amostras de /public/time e publicar o RTT minimo com a idade, reduzindo a incerteza do offset antes de mexer em limite. | Evidencia: clock.ts:18 (3) e :67 (teto 7 amostras).
- relogio_local_sem_offset (Relogio local sem offset): Usar o relogio local como referencia quando o offset falhar, sem corrigir. | Evidencia: Proibida pela regra de clock_unknown em state.ts:192.

Recomendacao sem Jev: medir_sombra_24h - E a opcao mais reversivel: nao muda codigo de decisao, nao muda limites e nao toca dinheiro, ordens ou chaves. Os limites atuais continuam como politica local ate existir p99 medido. Qualquer mudanca de limite sem esse dado seria chute.
Cetico: decisao_ok=false; problemas: A opcao 'relogio_local_sem_offset' aparece em opcoes e tambem em proibidas. Uma opcao vedada nao pode ser oferecida ao Jev como escolha: remover de opcoes e manter so na lista de proibidas. | Premissa falsa: a decisao e a evidencia de 'relogio_local_sem_offset' dizem que a regra clock_unknown (state.ts:192) cobre o caso sem offset. Essa regra so cobre candles. Book e ticker passam pela checagem de idade (state.ts:47 e :67) e nao viram clock_unknown. A decisao deve descrever o comportamento real antes de o Jev escolher. | Desconhecido d4 ja respondido pelo codigo: a re-medicao do relogio e de 10 minutos (scripts/jev-read.ts:163). Remover d4 de desconhecidos e corrigir a afirmacao de que o intervalo nao foi lido. | Fatos com confianca baixa tratados como base: 'trades_lag 121 ms' (pesquisa-t03:30, marcado baixa confianca) e 'erro de 1,3 s' (nao e latencia isolada, pesquisa-t03:30). Rotular como baixa confianca ou tirar do conjunto de fatos da decisao. | Fato 'rtt_http_medido' (380 a 450 ms) foi medido uma vez e nao foi recheckado (pesquisa-t03:15). Rotular assim. | Classificacao de risco: a decisao afirma que os limites de frescor nao sao limite de risco. Eles decidem se um campo entra no Brief e, por consequencia, se o Jev recebe dado para decidir ordens. Se o dono considerar esses limites como limite de risco, o assunto e vedado ao Jev e deve ser registrado em bloqueios_do_dono, nao decidido. A decisao precisa dizer explicitamente qual das duas leituras vale. | O campo ts (semantica: hora de geracao ou de envio) nao foi verificado na fonte primaria da OKX. A pagina oficial foi lida ate 100 mil de 406 mil caracteres e nao chegou as secoes de tickers e books5. O resultado de busca (espelho de terceiros) indica 'ticker data generation time' para o REST de tickers, mas isso nao e fonte primaria. Manter d3 como desconhecido, com a ressalva. | Nenhuma opcao toca diretamente dinheiro real, carteira, ordens, saques, segredos, migracao de schema, historico ou dependencias de producao. A opcao 'limite_pela_incerteza' mexe em limite de frescor, o ponto da classificacao de risco acima.

### Novos tickets revelados

- Confirmar a semantica do ts na OKX: Na documentacao primaria da OKX, o ts de tickers e books5 e a hora de geracao do dado ou a de envio? A busca nao trouxe a fonte.
- Cadencia de re-medicao do offset: Com que intervalo scripts/jev-read.ts chama keeper.refresh() em producao, e o que acontece quando a re-medicao falha por mais de 30 min?
- Idade por campo no Brief: O Brief deve carregar idade de origem e idade de cache por campo? Isso toca src/decision-review, zona do Codex.
- Snapshot de inscricao como evento separado: Filtrar a primeira mensagem de cada instrumento no feed muda as contagens de staleness de forma relevante?

### Nao lido

- Documentacao primaria da OKX sobre o campo ts de tickers e books5 (busca web sem fonte primaria).
- Medicao viva: nenhuma chamada foi feita, por restricao da pesquisa; os numeros vem so dos arquivos do repo e da evidencia pesquisa-t03.
- scripts/jev-read.ts alem das linhas 85-112 (intervalo de re-medicao do offset).
- src/intel/brief.ts e a montagem do Brief (idade por campo na pratica).
- src/decision-review/** (zona do Codex, nao lida de proposito).
- docs/specs/retorno-composto-por-ciclo/evidence/pesquisa-t03-okx-exchange-ws.md: os dados brutos da a7 nao estao no repo; so o resumo.

### Resumo do cetico

Reverifiquei as oito afirmacoes t14-a2 a t14-a9 contra arquivo:linha e contra a pesquisa T03. Quatro estao confirmadas (a3, a5, a6, a7) e quatro sao parciais (a2, a4, a8, a9). Nenhuma foi refutada por inteiro, mas a4 e a8 tem correcoes materiais. A decisao nao pode ir ao Jev como esta: lista a opcao "relogio_local_sem_offset" que ela mesma marca como proibida, parte da premissa de que sem offset book e ticker viram clock_unknown (so candles viram), e trata como desconhecido o intervalo de re-medicao do relogio, que o codigo informa (10 min em scripts/jev-read.ts:163). Os numeros de rede e de relogio conferem, mas o 121 ms e o 1,3 s sao medidas fracas e nao devem servir de base a limites. Nao verificado na fonte primaria da OKX: a semantica do campo ts (pagina oficial truncada; so um espelho de terceiros diz "ticker data generation time" para o REST).

## Comments

