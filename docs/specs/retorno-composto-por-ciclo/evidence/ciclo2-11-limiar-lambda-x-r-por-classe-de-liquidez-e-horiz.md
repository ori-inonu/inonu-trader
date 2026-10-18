# Ciclo 2, ticket T11: Limiar lambda x R por classe de liquidez e horizonte

> Saida bruta de agentes Haiku 5.5 (esforco medio) do workflow wf_1930517d-e57, com o veredito do cetico. Material de proveniencia, NAO curado; onde divergir valem [../wayfinder.md](../wayfinder.md) e [../status.md](../status.md).

Type: research
Status: resolved
Blocked by: 06
Domain: edge
Priority: 11

## Question

Qual limiar define janela de oportunidade (movimento previsto liquido de atrito maior que quanto), por classe de liquidez (piso de 0,42% em ativo liquido, 1,8% a 2,1% em raso) e por horizonte K de 1, 5 ou 15 min, para entrar no protocolo de sombra?

Por que importa: G3 e G4 exigem operar so onde o movimento supera o atrito com margem. Sem limiar nao ha lambda (frequencia de janelas) nem R (retorno liquido por janela). A conta de 0,5% por minuto exige janela de cerca de 5% liquido a cada 10 minutos (calculo), que nenhuma fonte sustenta hoje. Vale como limiar de sombra, nao como regra de ordem.
Evidencia a buscar: validacao-e-baseline.md secoes 1 e 2; scripts/move-vs-friction.ts (movimento mediano de 1 min de 0,38%); matematica-da-meta.md para lambda e R; replay do feed de trades.

## Answer

1. O limiar de sombra compara o movimento absoluto previsto com o atrito de ida e volta (0,42% em ativo liquido, 1,8% a 2,1% em raso, so entrada medida). Com movimento mediano e sem margem, o equilibrio exige acerto de 83,3% em 5 min (0,63%) e de 70,4% em 15 min (1,03%); em 1 min (0,38%) nao ha acerto possivel. 2. Em raso (2,1%) so 60 min fecha no equilibrio (97%); em 1, 5 e 15 min nao fecha com mediana. 3. Recomendo rotular, sem filtrar nem ordenar, janelas de 5 e 15 min com movimento acima de 2 x atrito (0,84% liquido). 4. Calculo com premissas: cerca de 44% das janelas de 5 min passam 0,84%; com acerto de 70% e movimento condicional de 1,3% (nao medido), R e cerca de +0,10% por janela e lambda x R cerca de 0,009% por minuto, 57 vezes abaixo de 0,5%. 5. Nenhum limiar tem lucro comprovado; o limiar nao e regra de ordem.

### Caminhos (Wayfinder)

- **Rotulo de limiar em sombra com markout de 5 e 15 min**: Marca cada janela de 5 e 15 min como elegivel se o movimento previsto passar de 2 x atrito (0,84% liquido). Nao filtra, nao ordena. Registra markout de 1, 5 e 15 min com janelas nao sobrepostas. | Restricao que prende: E|m| condicional acima do gate nao foi medido; a serie de 5 e 15 min esta so em cache externo; o feed ao vivo guarda 60 s (A7, A11). | Experimento mais proximo: Em sombra, com candles publicos de 1 min da interseção bolsa x Solana (feed publico, sem chave), contar janelas elegiveis por classe e calcular lambda e R com intervalo de confianca. | Ganho: Primeiro numero de lambda e R do repo; transforma a meta em frequencia e retorno por janela. Nenhum ganho comprovado: calculo sobre premissas (A10). | Esforco: baixo a medio | Como medir: fracao elegivel por K e classe; lambda = fracao / K; R = (2p-1) x E|m| menos atrito; intervalo por bootstrap em blocos.
- **Cotacao sintetica de ida e volta por par e por classe**: Substitui o atrito fixo de 0,42% por cotacao em lote de ida e volta para cada par, com duas pernas, por classe de liquidez, sem ordem. | Restricao que prende: Nao existe limiar por classe no codigo (A8); saida em raso nao medida; cotacao so mede a entrada. | Experimento mais proximo: Cotar 30 pares em tres classes (liquido, intermediario, raso) com round-trip.ts, sem enviar nada, e comparar com o atrito realizado do repo. | Ganho: Atrito por classe em vez de constante; pode fechar o gap de 2,1% em raso. Valor nao medido. | Esforco: medio | Como medir: diferenca entre cotado e realizado por classe; tolerancia definida antes; saida em raso medida separadamente da entrada.
- **Acerto direcional do Jev contra o futuro, por janela**: Em sombra, guardar cada resposta do Jev com o rotulo futuro de 5 e 15 min, e medir o acerto direcional. Sem ordem, sem alterar decisao. | Restricao que prende: Acerto do Jev nao medido (G4); cota do Jev precisa de decisao antes de lote grande. | Experimento mais proximo: Lote de 100 a 200 respostas sombra ja previstas no protocolo, rotuladas com preco futuro, com acerto e intervalo de Wilson por janela. | Ganho: Converte o limiar em expectativa liquida, o unico criterio que vale para entrar. Sem ganho comprovado. | Esforco: medio | Como medir: acerto por janela com intervalo; comparacao com a precisao de equilibrio (83,3% em 5 min, 70,4% em 15 min).
- **Medir todas as janelas sem limiar e fechar o limiar depois**: Registra markout de 1, 5 e 15 min de toda janela, sem gate, e so depois escolhe o limiar pela distribuicao condicional de retorno liquido. | Restricao que prende: Janelas sobrepostas reduzem o n efetivo (A6); sem serie longa o limiar nao fecha. | Experimento mais proximo: Registrar markout de janelas ja geradas no feed publico durante uma semana em sombra; calcular E|m| condicional por classe quando houver janelas nao sobrepostas suficientes. | Ganho: Nenhum ganho direto; evita escolher limiar por premissa. Custo minimo. | Esforco: baixo | Como medir: E|m| condicional a m maior que cada gate candidato; numero de janelas nao sobrepostas por classe.
- **Limiar por percentil de cada token, com atrito**: Gate por token: movimento acima do percentil 75 dos movimentos absolutos de K minutos do proprio token, mais o atrito da classe. | Restricao que prende: Identidade por endereço entre bolsa e Solana e pre-requisito (research.md, secao 4); cache de candles fora do repo (A11). | Experimento mais proximo: Em 16 a 50 tokens da interseção, calcular o percentil 75 em uma janela de historico e medir a fracao de janelas futuras acima do gate. | Ganho: Adapta o gate a cada token; sem numero medido. | Esforco: medio | Como medir: fracao acima do gate por token; estabilidade entre metades da amostra.

### Achados

- [A1|fato|media|VERIF=confirmado] Movimento absoluto mediano de fechamento a fechamento: 0,38% em 1 min, 0,63% em 5 min, 1,03% em 15 min e 2,23% em 60 min, com 16 tokens e amostras sobrepostas.
    fonte: docs/specs/retorno-composto-por-ciclo/research.md:29; validacao-e-baseline.md (secao 2, G3 e G4)
- [A2|fato|media|VERIF=confirmado] Atrito de ida e volta: 0,42% media em ativo liquido (6 pares de um ativo, faixa 0,17% a 0,56%); intermediario 1,82% (1 par); raso pelo menos 2,1% so na entrada, igual para 2, 5 e 10 USDC. Saida em raso nao medida.
    fonte: docs/specs/retorno-composto-por-ciclo/validacao-e-baseline.md:19
- [A3|calculo|alta|VERIF=confirmado] Acerto de equilibrio para movimento simetrico s e atrito c: p maior que (1 + c/s)/2. Com c = 0,42%: 1 min (s = 0,38%) impossivel (1,05); 5 min (s = 0,63%) 83,3%; 15 min (s = 1,03%) 70,4%; 60 min (s = 2,23%) 59,4%. Para alvo liquido de 0,5% em 15 min o acerto sobe para 94,7%, em linha com a conta de 95% do ticket T06.
    fonte: Formula sobre validacao-e-baseline.md:19 e research.md:29; forma em matematica-da-meta.md, secao 3
- [A4|calculo|alta|VERIF=refutado] O gargalo G4 diz 90% de acerto em 5 min com atrito de 0,5%. Esse numero so fecha se o movimento usado for cerca de 1,15% (0,92 / 0,8), e nao a mediana de 5 min (0,63%), para a qual nenhum acerto basta para 0,5% liquido. A fonte do movimento usado em G4 nao esta declarada.
    fonte: docs/specs/retorno-composto-por-ciclo/validacao-e-baseline.md:35 contra research.md:29
    >> refutado: validacao-e-baseline.md:35 (G4) declara atrito de 0,5%, nao 0,42%. Com atrito 0,5% e s = 0,63% (mediana de 5 min, research.md:29), (1 + 0,5/0,63)/2 = 89,7%, que e o '90%' de G4. A fonte esta declarada em evidence/pesquisa-t12-linha-de-base.md:45 ('movimento mediano de 0,63% em 5 min', formula a > 0,5 + atrito/(2 x movimento)). O valor 1,15% sai de g = 0,92 (atrito 0,42 mais alvo 0,5), que nao e o atrito de G4. | correcao: O 90% de G4 e break-even sem alvo liquido, com mediana de 5 min de 0,63%. A conclusao de que nenhum acerto basta para 0,5% liquido em 5 min continua valida: com c = 0,42, s = 0,63 e t = 0,5, p = 1,23. Corrigir a fonte do movimento e a leitura de 1,15%.
- [A5|fato|alta|VERIF=confirmado] O script mede magnitude e nao direcao: absMoves usa valor absoluto do retorno, entao a metrica nao diz se o lado certo venceu o custo. O limiar de sombra precisa, portanto, de acerto direcional do Jev medido separadamente.
    fonte: scripts/move-vs-friction.ts:4 (cabecalho) e :12-16 (absMoves com Math.abs)
- [A6|fato|alta|VERIF=parcial] As amostras consecutivas se sobrepõem e o script declara que nao sao independentes. A contagem de janelas por minuto (lambda) precisa usar janelas nao sobrepostas, ou seja, fracao acima do limiar dividida por K.
    fonte: scripts/move-vs-friction.ts:3 (cabecalho); matematica-da-meta.md:52 (amostras sobrepostas)
    >> parcial: Confirmado: as amostras se sobrepoem e o script declara que nao sao independentes (move-vs-friction.ts:3; matematica-da-meta.md:52). Nao confirmado: a regra 'fracao acima do limiar dividida por K' nao esta em nenhuma fonte do repo. E uma proposta de metodo, portanto INFERENCIA, nao fato. | correcao: Reclassificar a regra de K como inferencia. Amostras nao sobrepostas exigem amostrar a cada K minutos ou corrigir a autocorrelacao, e isso ainda nao existe no codigo.
- [A7|fato|alta|VERIF=refutado] O feed de trades ao vivo guarda so 60 s de fluxo (FLOW_WINDOW_MS = 60000). O replay do feed nao calibra janelas de 5 e 15 min; isso exige serie de preco por minuto de mais tempo, que hoje esta so em cache externo ao repo.
    fonte: src/jev-read/types.ts:196; src/jev-read/feed.ts:1-10
    >> refutado: src/jev-read/feed.ts:86-87: trades retidos por TRADE_RETAIN_MS = 120_000 e no maximo MAX_TRADES = 5000. FLOW_WINDOW_MS = 60_000 (src/jev-read/types.ts:196) e a janela de cobertura do fluxo, nao a retencao. feed.ts:350 busca 60 velas de 1 min por REST (bar=1m, limit=60) e as guarda em memoria (feed.ts:368). Isso cobre 60 minutos, suficiente para uma janela de 15 min, mas so em memoria e sem persistencia. | correcao: Trocar 'guarda so 60 s de fluxo' por '120 s de trades e 60 velas de 1 min em memoria, sem persistencia'. A parte 'nao calibra 5 e 15 min' e so parcialmente verdadeira: sobra historico curto e nenhum persistido.
- [A8|fato|alta|VERIF=parcial] Nao existe no codigo um limiar de atrito por classe de liquidez. O atrito de 0,42% e constante de documento e o raso aparece so como premissa (sizing.ts mantem a suposicao antiga para pool rasa). A cotacao sintética de ida e volta existe, mas e economia hipotetica, sem medida por classe.
    fonte: src/opportunity/sizing.ts:28; src/okx-market/round-trip.ts:4-5 (hypotheticalRoundTripEconomics)
    >> parcial: Confirmado: nao ha limiar de atrito por classe de liquidez no codigo (grep sem resultado) e src/opportunity/sizing.ts:28 mantem a suposicao antiga para pool rasa. Confirmado: src/okx-market/round-trip.ts:4-5 marca hypothetical true, execution not_qualified, coverageVerified false. Refutado a parte 'constante de 0,42%': o codigo tem custo de ida e volta por instrumento, src/outcomes/wire.ts:66 (2 x taxa taker + 2 x slippage, 22 bps em spot, src/outcomes/wire.test.ts:40) e src/intel/features/compute.ts:224-226 (custo = taxa + slippage + spread cotado, e cost.moveToCost1h = ATR 1h / custo de ida e volta). | correcao: Acrescentar que o repo ja calcula cost.moveToCost1h por instrumento (compute.ts:226) e um custo constante de 22 bps em spot (wire.ts:66). Esses sao precedentes do limiar, e nenhum deles e classe de liquidez.
- [A9|inferencia|baixa] Fracao de janelas de 5 min acima de 0,84% (2 x atrito liquido) fica perto de 44%, interpolando 57% (acima de 0,5%) e 38% (acima de 1%) do documento. Para 15 min, mais de 50% ficam acima de 0,84%, porque a mediana (1,03%) ja e maior.
    fonte: matematica-da-meta.md:52 (fracoes de 5 min); validacao-e-baseline.md:35 e research.md:29 (mediana de 15 min)
- [A10|calculo|baixa] Com acerto de 70% e movimento condicional de 1,3% em janelas de 5 min acima de 0,84% (premissa, nao medida), R fica perto de +0,10% por janela, e lambda x R perto de 0,009% por minuto (44% de 5 min / 5 = 0,088 por minuto). Isso fica cerca de 57 vezes abaixo de 0,5% por minuto.
    fonte: Calculo com A3 e A9; E|m| condicional e premissa
- [A11|fato|alta] O cache de candles por minuto que alimenta move-vs-friction fica fora do repo (brief-freshness --cache). Nao ha candles em data/ e o script nao foi reproduzido nesta pesquisa.
    fonte: scripts/brief-freshness.ts:66-68; scripts/move-vs-friction.ts:1-6
- [A12|inferencia|media] Pelo menos 1 par raso e 1 par intermediario sustentam o atrito de 2,1%; a diferenca entre 2, 5 e 10 USDC sugere custo percentual fixo (taxa ou imposto do token), nao impacto, e isso precisa de decomposicao antes de usar o limiar em raso.
    fonte: docs/specs/retorno-composto-por-ciclo/matematica-da-meta.md, secao 5 (observacao sobre o raso)

### Decisao para o Jev

Pergunta: Qual limiar de sombra separa janela de oportunidade (movimento previsto liquido de atrito maior que o atrito) por classe de liquidez e horizonte K de 1, 5 ou 15 min, antes de entrar no protocolo de sombra?
Reversivel: true

- medir-sem-limiar (Medir todas as janelas sem limiar e fixar depois): Registra markout de 1, 5 e 15 min de toda janela, sem gate, e fixa o limiar depois, com a distribuicao condicional de retorno liquido por classe. | Evidencia: Sem E|m| condicional medido; 57% dos candidatos ja fecham antes do Jev (validacao G1).
- limiar-2x-atrito-rotulo (Rotulo de 2 x atrito em 5 e 15 min, sem filtro): Marca janelas de 5 e 15 min elegiveis se o movimento previsto passar de 2 x atrito (0,84% liquido). Rotula e nao bloqueia nada nem envia ordem. | Evidencia: Atrito 0,42% (validacao-e-baseline.md:19); mediana 5 min 0,63%, 15 min 1,03% (research.md:29).
- limiar-por-classe-cotado (Limiar por classe com atrito cotado por par): Troca o atrito fixo por cotacao sintetica de ida e volta em lote por par e classe, com margem de 2 x. Somente sombra, sem ordem. | Evidencia: Atrito fixo em 6 pares; raso so com entrada medida (validacao-e-baseline.md:19); round-trip.ts e hipotetico.
- expectativa-liquida-p-hat (Entrar so com expectativa liquida positiva estimada): Em sombra, entra so se (2p-1) x movimento esperado menos atrito der margem, com p calibrado pelo Jev contra o futuro. Exige calibracao ainda nao medida. | Evidencia: Acerto do Jev nao medido (G4); equilibrio 70,4% em 15 min e 83,3% em 5 min (calculo).
- quantil-historico-token (Limiar pelo percentil 75 de cada token): Gate por token: movimento acima do percentil 75 dos movimentos absolutos de K minutos do proprio token, mais o atrito da classe. | Evidencia: move-vs-friction.ts:12 exige cache externo; nenhum candle no repo (data/).
- gate-como-regra-de-ordem (Usar o limiar como regra de compra real): Dispararia ordem quando o limiar passa. Vedada: o limiar e so de sombra e ordem real depende de autorizacao do dono. | Evidencia: Ticket T11: vale como limiar de sombra, nao como regra de ordem.

Recomendacao sem Jev: medir-sem-limiar - E a opcao mais reversivel: nao escolhe gate, nao altera decisao nem executor, e so acumula markout. O limiar de 2 x atrito e uma premissa sem E|m| condicional medido; o rotulo de 2 x atrito vira candidato apos as janelas nao sobrepostas existirem.
Cetico: decisao_ok=false; problemas: A opcao 'gate-como-regra-de-ordem' esta em opcoes, embora marcada como proibida. Regra de ordem e liberacao de live sao assuntos vedados e devem ir a bloqueios_do_dono, nunca a opcoes de decisao. Remover. | O fato 'lambda_R_5min_premissas' (cerca de 0,009% por minuto, 57 vezes abaixo de 0,5%) nao tem fonte no repo. Busca por '0,009', '57 vezes' e 'lambda_R' em docs/specs/retorno-composto-por-ciclo nao acha a conta. Citar a conta com premissas explicitas ou remover. | O fato 'feed_ao_vivo_janela_fluxo' esta incompleto: a retencao de trades e 120 s (src/jev-read/feed.ts:86) e ha 60 velas de 1 min em memoria (feed.ts:350). Corrigir para evitar que o Jev decida sobre historico que nao existe. | A pergunta e as opcoes 'limiar-por-classe-cotado' e 'quantil-historico-token' usam classes de liquidez que nao estao definidas em lugar nenhum do codigo. Sem definir as classes (corte por TVL ou volume), nao ha como medir o limiar por classe. | A opcao 'expectativa-liquida-p-hat' diz 'entra so se', o que pode ser lido como entrada real. Deve dizer 'registra entrada simulada em sombra', para ficar dentro da restricao de limiar so de sombra. | A opcao 'quantil-historico-token' exige serie de candles por token que nao existe em persistencia (data/ sem candles). Ela exige nova persistencia de dados, o que precisa ser declarado como custo e checado contra a regra de schema dos journals. | A restricao 'lambda usa fracao dividida por K' e uma proposta de metodo (inferencia), apresentada como restricao. Rotular como INFERENCIA. | Verificar a escrita de todas as opcoes: as que dizem 'sem ordem' estao corretas, mas nenhuma opcao deve sugerir uso do limiar como criterio de execucao.

### Bloqueios do dono

- Transformar qualquer limiar em regra de compra ou venda real, com tamanho, stop ou ordem: liberacao de live e decisao do dono (B5 e G4).
- Estender os journals (fills, decisions) para gravar markout de 5 e 15 min: mudanca de schema de journal (B5).
- Plano pago de candles ou WebSocket da OnchainOS (Starter a US$ 99 por mes, cerca de 82% do capital): cobranca (B1).
- Ordens reais de calibracao para medir atrito de saida em tokens rasos: dinheiro real (B4).
- Limites de tamanho por janela e parada por drawdown derivados do limiar: limite de risco, decisao do dono.
- Raspagem de candles do site da OKX para obter 1 min e 5 min: risco de termos (B2).

### Novos tickets revelados

- E|m| condicional por classe e horizonte: Qual o movimento absoluto medio condicional a passar 0,84% em 5 e 15 min, por classe de liquidez, com janelas nao sobrepostas e cache de candles fora do repo?
- Atrito de saida em token raso: Qual o custo de saida de token raso (hoje so a entrada tem 2,1%), e a diferenca entre 2, 5 e 10 USDC e taxa fixa ou impacto?
- Origem do 90% do gargalo G4: Qual movimento de 5 min foi usado para o 90% de G4 (implica cerca de 1,15%), e ele deve ser corrigido para a mediana de 0,63%?
- Identidade por endereco da interseção: Quais tokens da bolsa e da Solana sao o mesmo contrato, pela identidade por endereco, antes de qualquer gate por classe?
- Serie de preco alem de 60 s: O markout de 5 e 15 min precisa de serie propria de preco, ja que o feed ao vivo guarda so 60 s de fluxo (FLOW_WINDOW_MS)?

### Nao lido

- Cache de candles de 1 min usado por scripts/move-vs-friction.ts: fica fora do repo e nao foi acessado; a fracao de 5 min foi interpolada de valores do documento, nao reproduzida.
- Replay do feed de trades: o repo so tem feed ao vivo (60 s de fluxo); nao ha historico de trades para replay de 5 e 15 min.
- data/decision-review/audits.jsonl e runtime-observations.jsonl nao foram lidos (contem dados de execucao e carteira; nao eram necessarios para o limiar).
- Nenhuma fonte web foi consultada nesta rodada: o ticket e interno ao repo e a literatura de limiar de janela nao foi buscada (nao verificado).
- Movimento condicional acima do gate (E|m|) nao existe em nenhum documento; os valores de R e lambda x R usam premissa de 1,3% e acerto de 70%.

### Resumo do cetico

Reverifiquei as 8 afirmacoes contra o repo e refiz as contas. A1, A2, A3 e A5 confirmam. A4 esta refutada: o 90% de G4 e break-even com atrito de 0,5% e mediana de 5 min de 0,63%, nao um alvo de 1,15%. A7 esta refutada na retencao (trades 120 s, nao 60 s, e 60 velas de 1 min em memoria). A6 e A8 estao parciais. A decisao nao pode ir ao Jev como esta: contem uma opcao de regra de ordem (assunto vedado), um fato sem fonte no repo e usa classes de liquidez que nao estao definidas em lugar nenhum do codigo. Nada foi escrito no repo nem chamado servico pago.

## Comments

