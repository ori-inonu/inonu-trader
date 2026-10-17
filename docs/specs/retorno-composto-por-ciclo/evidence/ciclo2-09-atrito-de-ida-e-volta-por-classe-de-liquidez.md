# Ciclo 2, ticket T09: Atrito de ida e volta por classe de liquidez

> Saida bruta de agentes Haiku 5.5 (esforco medio) do workflow wf_1930517d-e57, com o veredito do cetico. Material de proveniencia, NAO curado; onde divergir valem [../wayfinder.md](../wayfinder.md) e [../status.md](../status.md).

Type: research
Status: resolved
Blocked by: 05
Domain: custo
Priority: 9

## Question

Quantos pares da interseccao (bolsa x Solana, validados por endereco) conseguem atrito de ida e volta medido por cotacao dentro de um orcamento de cotacoes que caiba no plano gratuito, e qual a distribuicao do atrito (mediana e p90) por faixa de liquidez?

Por que importa: O atrito de 0,42% vem de 6 pares de um ativo, e o raso ficou entre 1,8% e 2,1% com 1 a 2 pares. Sem distribuicao, a regra de operar so onde o movimento supera o atrito nao tem numero. O teto de 720 consultas por dia e do Jev, nao da OKX, e o limite de cotacao da OKX nao foi medido.
Evidencia a buscar: Contagem de requisicoes por rota e dia (scripts/api-budget.ts); intervalo minimo do cliente OKX (src/okx-market/okx-dex.ts:8); percentual de respostas com impacto nulo; lista de pares com endereco validado. Somente cotacao sintetica, sem assinar e sem enviar ordem.

## Answer

Interseccao: ate 104 pares candidatos (54 com tag estrita), nenhum com atrito de ida e volta medido por cotacao ainda. Atrito medido existe em tres grupos sem distribuicao: liquido 0,17% a 0,56% (media 0,42%, n=6, todos de um ativo), intermediario 1,82% (n=1) e raso pelo menos 2,1% (n=1). Mediana e p90 por classe nao podem ser calculados com esses dados. Orcamento: a cota Basic sustentavel e cerca de 5.953 por dia para todas as rotas; se 25% for para cotacao (2 chamadas por ida e volta), cabem 31 pares a cada hora ou os 104 a cada 3,4 h. Recomendacao: comecar com 10 pares, 24 rodadas por dia, cerca de 480 cotacoes por dia.

### Caminhos (Wayfinder)

- **Medir atrito em sombra com amostra de 10 pares estratificada**: Escolher 10 pares do conjunto de 104 (incluindo liquidos, intermediarios e rasos), cotar ida e volta 24 vezes ao dia e registrar impacto, nulos e tempo por perna. Sem decisao e sem execucao. | Restricao que prende: Classe da cota da rota de quote (A5) e formato da protecao (A10) nao confirmados; classe de liquidez dos pares ainda sem medida. | Experimento mais proximo: 10 pares x 24 rodadas x 7 dias = 1.680 ida e volta, 3.360 cotacoes em 7 dias, cerca de 480 por dia. | Ganho: Transforma a regra de operar so onde o movimento supera o atrito em numero por classe; ainda sem numero de retorno. | Esforco: baixo | Como medir: Mediana e p90 de atrito por classe, parcela de nulos, horario de cada rodada; alvo de 30 ou mais amostras independentes por classe.
- **Contador de cota por rota antes de qualquer medicao em lote**: Acrescentar contagem por rota de quote no gateway e registrar um dia sem chamadas extras para separar o consumo de cotacao do de decisao. | Restricao que prende: O contador so tem totais por tier (api-budget); a parcela de cotacao hoje e desconhecida. | Experimento mais proximo: Um dia de registro por rota com o cliente atual, sem nenhuma chamada adicional. | Ganho: Permite dimensionar a cadencia com base em numero, em vez de suposicao de 25% do sustentavel. | Esforco: baixo | Como medir: Parcela de cotacao no total Basic por dia, comparada com o total por tier de A6.
- **Expandir para 104 pares a cada 3,4 h depois de medir a cota real**: Se a parcela de cotacao ficar em torno de 25% do sustentavel, rodar a lista completa de candidatos a cada 3,4 h e medir o atrito por classe. | Restricao que prende: Basic ja projeta 160.451 contra teto de 100.000 no mes (A6); qualquer expansao disputa cota com a decisao do Jev. | Experimento mais proximo: Tres dias com 104 pares a cada 3,4 h, cerca de 1.470 cotacoes por dia, com parada automatica se o consumo passar do sustentavel de A6. | Ganho: Cobre o universo inteiro de candidatos com uma amostra por janela, depois do primeiro dado de classe. | Esforco: medio | Como medir: Cotacoes por dia reais, consumo Basic por dia contra o teto, distribuicao de atrito por classe com n por classe.
- **Medir a taxa de impacto nulo e confirmar o formato da protecao**: Antes de cotar em lote, confirmar no portal OKX o formato de priceImpactProtection aceito pela v6 e medir quantas respostas vem com impacto nulo em uma rodada de 10 pares. | Restricao que prende: Pagina v6 de quote retornou 404 e a v5 e leitura por resumo (A9, A10). | Experimento mais proximo: Duas cotacoes de um mesmo par com protecao no formato v5 e no formato v6 do repo, em volume de duas chamadas, sem assinar nem enviar. | Ganho: Evita que o atrito fique subestimado por respostas nulas bloqueadas como desconhecidas, e evita protecao desligada por engano. | Esforco: baixo | Como medir: Taxa de null em priceImpactPercent por rodada; diferenca de resposta entre os dois formatos; registro do limite confirmado pelo portal.
- **Adiar a medicao de atrito e usar so os 6 pares ja medidos**: Nao medir mais nada ate o contador por rota e o formato de protecao estarem confirmados; manter a regra de atrito como hipotese. | Restricao que prende: Sem distribuicao, a regra de operar so acima do atrito nao tem numero (A7, A8). | Experimento mais proximo: Nenhum; apenas revisar o dado existente (6 liquidos, 1 intermediario, 1 raso). | Ganho: Zero custo de cota; mantem a cota para a decisao do Jev. | Esforco: nenhum | Como medir: Nao se aplica; o risco e continuar sem distribuicao por classe.

### Achados

- [A1|fato|media|VERIF=nao_verificavel] Premissa de T05: 104 ativos com mint unico verified na Jupiter (7 ambiguos excluidos, 54 com tag strict, major ou moonshot-verified). Nao reproduzida nesta sessao; a identidade e por lista verified da Jupiter, nenhum mint confirmado por emissor.
    fonte: Resposta de T05 (premissa do ticket); docs/specs/retorno-composto-por-ciclo/research.md (secao identidade)
    >> nao_verificavel: Os numeros 104 unicos, 54 com tag estrita e 7 ambiguos nao aparecem em docs/specs/retorno-composto-por-ciclo/research.md (busca por 104, verified e ambig sem resultado) e a secao de identidade citada nao existe com esse conteudo. O proprio spec diz que identidade por endereco e pre-requisito ainda nao atendido (fontes-de-edge.md:40) e que a comparacao da lista Jupiter foi feita so por simbolo, sem verificacao de identidade (evidence/pesquisa-t03-okx-exchange-ws.md:111). | correcao: Tirar 104/54/7 como fato da decisao ou marcar como nao verificado, citando a fonte real. Nao usar a lista da Jupiter como identidade confirmada.
- [A2|fato|alta|VERIF=confirmado] Intervalo minimo do cliente OKX DEX e 1.100 ms, ou cerca de 54,5 chamadas por minuto. Essa e configuracao local, nao limite publicado.
    fonte: src/okx-market/okx-dex.ts:8 (DEFAULT_MIN_REQUEST_INTERVAL_MS = 1_100)
- [A3|fato|media|VERIF=refutado] Uma ida e volta de cotacao usa duas chamadas de quote: a primeira perna em client.quote e a segunda no mesmo fluxo, com legs[] no relatorio. Cotacao nao assina nem envia ordem.
    fonte: src/okx-market/round-trip.ts:157 (perna 1) e interface RoundTripReport.legs em :28-30
    >> refutado: src/okx-market/round-trip.ts:157 e a unica chamada client.quote. Em :161-162 a funcao valida a primeira perna e para com stop('unknown','provider_output_unit_unverified'); nunca ha segunda perna. legs e inicializado como [] em :133 e nunca recebe itens; o comentario em :160 diz que nenhum transporte pode pedir perna dependente. As duas cotacoes existem apenas em src/operator/candidates.ts:158-159 (leg1 e leg2). | correcao: Citar candidates.ts:158-159 para as duas cotacoes. round-trip.ts faz uma cotacao e nao mede volta. A contagem de 2 por ida e volta vale para o caminho do operador, nao para o modulo de medicao.
- [A4|fato|alta|VERIF=confirmado] Impacto de preco nulo e tratado como desconhecido e bloqueia o relatorio (status unknown, price_impact_unknown). Percentual de nulos no quote nao foi medido.
    fonte: src/okx-market/round-trip.ts:107
- [A5|fato|media|VERIF=confirmado] O quote esta classificado como plano basic, com tierKnown false, ou seja, a classe de cota da rota de cotacao no plano nao esta confirmada.
    fonte: src/inonu/onchain-plan.ts:88-92 (item T13 /onchain/quote, tier basic, tierKnown: false)
- [A6|calculo|alta|VERIF=confirmado] Cota Basic em 17/10/2026 (cerca de 21 h UTC): 11.478 antes de hoje, 4.687 hoje, projecao mensal 160.451 contra teto de 100.000, sustentavel 5.953 por dia nos 14 dias restantes. Premium: 5.015 antes de hoje, sustentavel 6.647 por dia. O contador tem so totais por tier, sem rota.
    fonte: Execucao read-only de scripts/api-budget.ts (contador local do gateway, saida de 2026-10-17)
- [A7|fato|media|VERIF=confirmado] Atrito de ida e volta em ativo liquido: 0,17% a 0,56%, media 0,42%, 6 pares de um unico ativo (STONK). Sem mediana nem p90 publicados.
    fonte: docs/specs/retorno-composto-por-ciclo/evidence/pesquisa-t12-linha-de-base.md:35; validacao-e-baseline.md:19
- [A8|fato|baixa|VERIF=confirmado] Atrito intermediario 1,82% com 1 par (HOTBOT). Raso pelo menos 2,1% so na entrada, para 2, 5 e 10 USDC, em um pool de cerca de US$ 37 mil de liquidez. n=1 pool.
    fonte: docs/specs/retorno-composto-por-ciclo/evidence/pesquisa-t12-linha-de-base.md:35 e item a19 (liquidez)
- [A9|fato|media] Pagina v5 do quote: priceImpactProtectionPercentage e fracao de 0 a 1,0 (padrao 90%, 1,0 desliga) e o preco de impacto retorna null quando nao pode ser calculado. Pagina v6 citada no repo retornou 404 nesta pesquisa.
    fonte: https://web3.okx.com/onchainos/dev-docs-v5/dex-api/dex-get-quote (leitura por resumo de WebFetch); https://web3.okx.com/build/dev-docs/wallet-api/dex-get-quote (404)
- [A10|inferencia|media] Divergencia a resolver: o repo valida priceImpactProtectionPercent como percentual de 0 a menos de 100 e envia isso no /api/v6, enquanto a pagina v5 descreve fracao de 0 a 1,0. Qual formato a v6 aceita nao foi verificado.
    fonte: src/okx-market/okx-dex.ts:97-101 comparado com a pagina v5 (achado A9)
- [A11|fato|media] Nenhum limite por segundo do quote foi publicado na pagina de quote. O unico RPS publicado e do Trade: Trial 1 RPS (ate 5 sob aprovacao), Start-up 2 a 50; se vale para o quote nao foi confirmado. Market RPS nao publicado.
    fonte: docs/specs/retorno-composto-por-ciclo/research.md:53; api-limites-e-fontes.md:28-34; pagina v5 do quote (sem RPS)
- [A12|fato|media] Politica de retry do codigo 50102 pode disparar um segundo fetch 17 ms depois do primeiro, sem respeitar o minIntervalMs de 1.100 ms, gerando consumo de cota duplicado. Evidencia sintetica, nao prova violacao da cota oficial.
    fonte: docs/specs/retorno-composto-por-ciclo/validacao-e-baseline.md:72
- [A13|calculo|alta] Aritmetica do orcamento de cotacao: cotacoes por dia = 2 x pares x (24 / intervalo em horas). Com 25% do sustentavel (1.488 por dia): 31 pares a cada hora, 104 pares a cada 3,4 h. Com 50%: 104 pares a cada 1,7 h. Com 10%: 104 pares a cada 8,4 h. Nenhum desses cenarios assume a parcela real de cotacao, que nao e medida.
    fonte: Calculo sobre A6 (5.953 por dia) e A3 (2 chamadas por ida e volta)
- [A14|calculo|alta] Varredura completa de 104 pares (208 chamadas) leva cerca de 229 s no intervalo minimo de 1,1 s, ou 3,8 min. O intervalo nao e o gargalo; o gargalo e a cota diaria Basic.
    fonte: A2 e A3
- [A15|inferencia|baixa] Para estimar p90 por classe com alguma estabilidade e preciso de dezenas de amostras independentes por classe, nao de rodadas repetidas no mesmo minuto. Regra pratica sem verificacao numerica no repo.
    fonte: Raciocinio estatistico geral; contraste com n=6, 1 e 1 de A7 e A8

### Decisao para o Jev

Pergunta: Qual amostra e cadencia de cotacao de ida e volta usar para medir o atrito por classe de liquidez, sem tirar cota das decisoes do Jev?
Reversivel: true

- so-medir-10-pares (Medir 10 pares, 24 rodadas por dia): Cotar ida e volta de 10 pares escolhidos por classe, 24 vezes ao dia, sem decisao e sem execucao. Cerca de 480 cotacoes por dia, perto de 8% do sustentavel. | Evidencia: 480 por dia = 2 x 10 x 24; sustentavel 5.953 por dia
- estrat-54-por-hora (54 pares estritos a cada hora): Cotar os 54 pares com tag estrita de hora em hora, sem decisao. Cerca de 2.592 cotacoes por dia, perto de 44% do sustentavel, que pode disputar com o Jev. | Evidencia: 2.592 por dia = 2 x 54 x 24; 44% de 5.953
- 104-pares-a-cada-3-4h (104 pares a cada 3,4 horas): Cobrir o conjunto inteiro de candidatos a cada 3,4 h, cerca de 1.470 cotacoes por dia, perto de 25% do sustentavel, com parada se o consumo passar do sustentavel. | Evidencia: 1.470 por dia = 2 x 104 x 24 / 3,4; 25% de 5.953
- adiar-ate-contador-por-rota (Adiar a medicao ate o contador por rota): Nao cotar em lote ate existir contagem por rota de quote e a protecao estar confirmada. Mantem os 6, 1 e 1 pares ja medidos como hipotese, sem gastar cota. | Evidencia: api-budget so tem totais por tier; A9 e A10 sem confirmacao

Recomendacao sem Jev: so-medir-10-pares - Usa cerca de 8% do sustentavel de cota Basic, nao muda decisao, execucao nem configuracao, e pode ser parado a qualquer momento. Gera a primeira distribuicao por classe (mediana, p90 e nulos) que hoje nao existe. Antes de expandir, resolver a classe da cota e o formato da protecao (A9, A10).
Cetico: decisao_ok=false; problemas: Conta de cota errada para as opcoes 2 e 3: a decisao mede cada opcao em percentual do sustentavel de 5.953 por dia, mas o consumo Basic atual ja e de 4.753 (15/10), 4.934 (16/10) e 4.694 (17/10 ate agora) por dia (usage-2026-10.json). Sobram cerca de 1.000 a 1.250 por dia. A opcao 1 (480/dia) cabe; a opcao 3 (1.470/dia) passa do sustentavel; a opcao 2 (2.592/dia) passa em cerca de 2.100 por dia. A projecao mensal ja esta em 160.451 contra o teto de 100.000, entao as opcoes 2 e 3 pioram um excesso que existe hoje. | Opcoes 2 e 3 levam o consumo acima do teto do plano gratuito. O que acontece depois (falha de chamadas ou cobranca por chamada, x402 que o projeto marcou como fora) e decisao de billing ou servico pago, que o Jev nao decide. A opcao 3 dizer 'com parada se passar do sustentavel' nao resolve: o consumo ja passa do sustentavel no primeiro dia. | A ferramenta de medicao nunca retorna atrito: quoteRoundTrip (round-trip.ts:162) para sempre em stop('unknown','provider_output_unit_unverified'), e failure() zera outputAtomic e quotedGrossDeltaAtomic. Cada chamada gasta uma cotacao e so sobra rawQuote.outputRaw com outputUnit 'unknown'. As opcoes 1 a 3 pedem medir com um instrumento que nao mede ainda, e a decisao nao diz que isso precisa ser corrigido antes. | Desconhecidos escritos como perguntas ao dono ('No console OKX ou no portal, em qual classe...', 'Qual percentual...?', 'O cliente deve bloquear...?'). Isso viola a regra de nao perguntar ao dono. Os itens devem virar pesquisa (docs oficiais) ou decisao estruturada para o Jev. | formato-protecao-v6 nao esta fechado: a pagina v5 (web3.okx.com/onchainos/dev-docs-v5/dex-api/dex-get-quote, lida nesta sessao) descreve priceImpactProtectionPercentage como fracao de 0 a 1,0 com padrao 90% (0,9), e nenhuma leitura primaria confirmou o v6. A pagina de docs v6 que tentei (web3.okx.com/build/dev-docs/wallet-api/dex-get-quote) devolveu 404. O repo usa percentual de 0 a 100 em v6 (okx-dex.ts:99). Isso e pesquisa resolvivel, nao pergunta ao dono. | A decisao trata a cota da cotacao como mensal (Basic, 100k), mas o caminho de cotacao usado pelo codigo e o produto Trade da OKX (okx-dex.ts:5-6), cujo limite publicado e por segundo (trial 1 RPS, Start-up 2 a 50, segundo o ticket). O limite binding pode ser por segundo, e a ordem de grandeza das opcoes muda. | Premissa A1 (104 mints unicos verified) conflita com o spec, que diz que identidade por endereco ainda e pre-requisito (fontes-de-edge.md:40). A decisao usa 104/54/7 como fato. | Opcao 4 cita 'A9 e A10 sem confirmacao', que nao existem na lista de afirmacoes (A1 a A8). Referencia quebrada. | A decisao nao diz como tratar o excesso ja existente (projecao 160k contra 100k): nenhuma opcao reduz o consumo atual antes de ampliar a amostra. | A fatia 'cotacoes_por_ida_e_volta 2 (round-trip.ts:157)' cita o arquivo errado: as duas cotacoes estao em src/operator/candidates.ts:158-159 (A3 refutado).

### Bloqueios do dono

- Pagar o excedente de cota por x402 (US$ 0,0001 por chamada Basic apos o gratis, estimativa de US$ 6,05 por mes em A6) ou assinar Starter ou Growth: billing e servico pago.
- Trocar ou subir o plano OKX/OnchainOS para ampliar RPS ou cota: billing e contrato.
- Obter ou usar credencial da API OKX (chave, segredo, passphrase) para o painel de cota ou para cotacao autenticada: segredo.
- Qualquer cotacao assinada, envio de ordem ou transferencia para validar atrito real: dinheiro real e ordens, fora de escopo deste ticket.

### Novos tickets revelados

- Classe de cota do endpoint de quote: O /dex/aggregator/quote conta como Basic ou Premium no plano, e qual o RPS vigente da conta?
- Formato de priceImpactProtection na v6: A v6 aceita percentual de 0 a 100 ou fracao de 0 a 1,0, e o que acontece com o parametro quando o impacto nao pode ser calculado?
- Contador de cota por rota: Como registrar a contagem por rota de quote no gateway, sem chamadas extras, para separar cotacao de decisao?
- Classe de liquidez dos 104 pares: Qual liquidez tem cada um dos 104 pares, medida por cotacao sintetica de 1 unidade, e quais 10 pares representam cada classe?
- Taxa de impacto nulo: Qual percentual de cotacoes volta com impacto nulo e qual a distribuicao por classe de liquidez?

### Nao lido

- Pagina v6 do quote (web3.okx.com/build/dev-docs/wallet-api/dex-get-quote) retornou 404; a leitura usada foi a v5 por resumo de WebFetch, nao texto bruto.
- Secao Market Data REST da OKX com limites por endpoint: nao lida nesta pesquisa (N em api-limites-e-fontes.md).
- Limite por segundo do quote do OnchainOS: nao publicado nas paginas lidas.
- Nenhuma cotacao enviada: a distribuicao de atrito e a taxa de impacto nulo nao foram medidas.
- Liquidez por par e lista de pares com endereco validado: nao reabertas; a premissa de T05 (104 unicos) nao foi reproduzida (Jupiter HTTP 000 naquela sessao).
- Candles usados por scripts/move-vs-friction.ts nao estao no repo (pesquisa-t12-linha-de-base.md, item a10).

### Resumo do cetico

Verifiquei as 8 afirmacoes (A1 a A8) e a decisao do T09 contra o repo e fontes primarias. Confirmei A2, A4, A5, A6, A7 e A8; A1 nao tem fonte no repo; A3 esta refutada (round-trip.ts faz uma unica cotacao e para em :162). A decisao NAO pode ir ao Jev como esta: as opcoes 2 e 3 estouram a cota Basic ja projetada acima do teto, a ferramenta de medicao cai sempre em status unknown, a cota da rota de cotacao pode nao ser a mensal (produto Trade, limite por segundo), e ha 4 desconhecidos escritos como perguntas ao dono. Recomendo acrescentar caminhos sem gastar cota OKX e corrigir o instrumento antes de ampliar amostra.

## Comments

