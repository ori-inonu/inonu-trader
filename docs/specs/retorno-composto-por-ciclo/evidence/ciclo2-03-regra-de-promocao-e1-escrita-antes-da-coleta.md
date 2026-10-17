# Ciclo 2, ticket T03: Regra de promocao E1 escrita antes da coleta

> Saida bruta de agentes Haiku 5.5 (esforco medio) do workflow wf_1930517d-e57, com o veredito do cetico. Material de proveniencia, NAO curado; onde divergir valem [../wayfinder.md](../wayfinder.md) e [../status.md](../status.md).

Type: research
Status: resolved
Blocked by: nenhum
Domain: medicao
Priority: 3

## Question

Qual regra, escrita antes de qualquer medicao, define o degrau E1 (retorno liquido medio por ciclo acima de zero com custo real): n minimo de ciclos nao sobrepostos, nivel de confianca, numero minimo de janelas de mercado distintas, holdout congelado e o que conta como falha de amostra?

Por que importa: A tabela de potencia pede 32 ciclos para 0,5% por ciclo (sigma 1%) e 784 para 0,1%. Sem regra previa, o tamanho da amostra vira escolha a posteriori e o resultado vira busca, o problema que o Deflated Sharpe corrige. A linha de base tem 7 voltas e 0 positivas.
Evidencia a buscar: docs/specs/retorno-composto-por-ciclo/matematica-da-meta.md secoes 7 e 9 (H1); validacao-e-baseline.md secao 3 (portao G2); efeito da autocorrelacao sobre o n efetivo, com fonte primaria de estatistica de series sobrepostas.

## Answer

Regra E1 proposta, a fixar antes de qualquer coleta: unidade = retorno liquido de janela nao sobreposta de H minutos (H fixo, a justificar); N minimo de 800 unidades (784 para delta de 0,1% com sigma de 1%, ajustado por autocorrelacao: N = teto(784 x (1+rho)/(1-rho))); E1 passa se o limite inferior do IC de 95% for maior que zero com custos reais decompostos (IC por Newey-West ou bootstrap estacionario de blocos); holdout cronologico final de 30% congelado antes da coleta e avaliado uma vez; ao menos 3 janelas de mercado distintas sem uma ter mais de 50% das unidades; falha de amostra (cobertura baixa, N efetivo abaixo do minimo, cadencia real diferente da declarada, variante nova nao registrada) vira INCONCLUSIVO, nunca confirmacao nem refutacao. Correcao ao spec: 784 ciclos sao 13 h so se o ciclo fosse de 1 min; com a cadencia medida de 135,6 s sao 29,5 h. Sigma de 1% por ciclo e premissa nao medida; rho de 0,3 multiplica N por 1,86.

### Caminhos (Wayfinder)

- **Calibrar sigma, rho e cadencia antes de fixar N**: Dois dias de sombra so de medicao, em bloco disjunto e congelado, medindo desvio padrao, autocorrelacao lag 1 e cadencia real do retorno liquido por unidade. Com esses valores o N da regra E1 deixa de ser premissa. | Restricao que prende: Nao ha serie de retorno liquido por ciclo no repo; so agregados de 14 a 15/10 (linha de base). Sigma e rho sao desconhecidos. | Experimento mais proximo: Log de sombra por ciclo (mid, custo decomposto, intervalo real) sem ordens, por 48 h, em bloco separado do holdout. | Ganho: Transforma N de premissa em medida. Sem numero de ganho de retorno; ganho de confiabilidade da regra (A1, A5). | Esforco: baixo a medio (coleta de dado em sombra, sem mudar decisao) | Como medir: sigma e rho1 com IC; cadencia p50 e p95; custo por unidade; N = teto((2,8 x sigma/0,001)^2 x (1+rho)/(1-rho)).
- **Definir a unidade de amostra como janela nao sobreposta de H minutos**: Escolher H (1, 5 ou 15 min) com base na autocorrelacao medida e fixar a unidade antes da coleta. Cada unidade e um retorno liquido de janela, nao de ciclo, o que elimina a sobreposicao. | Restricao que prende: A cadencia real (135,6 s) difere do ciclo de 1 min da tabela, e o cache de velas que gerou os movimentos esta fora do repo e nao foi reproduzido. | Experimento mais proximo: Recalcular, em replay de velas de minuto ja existentes fora do repo, a autocorrelacao e o N efetivo para H = 1, 5 e 15 min. | Ganho: Horas necessarias para 800 unidades: 800 x H min; para H = 5, cerca de 67 h a 1 min de cadencia (calculo). | Esforco: medio (replay de dados, sem codigo de producao) | Como medir: N efetivo por H; horas por 800 unidades; autocorrelacao lag 1 e 2 dos retornos de janela.
- **IC por bootstrap de blocos com simulacao de cobertura**: Trocar o IC normal por bootstrap estacionario de blocos ou HAC, validados antes por simulacao com AR(1) e caudas gordas, para escolher o metodo que cobre 95% com o N minimo escolhido. | Restricao que prende: A regra de IC depende de sigma e de caudas que ainda nao foram medidas (A5); a literatura citada nao foi lida no texto primario (A7, A11). | Experimento mais proximo: Simulacao offline de cobertura de IC 95% para N = 800 com rho 0,3 e caudas t de 3 graus de liberdade, comparando normal, Newey-West e bootstrap de blocos. | Ganho: Reduz o risco de IC subcobrir e aprovar E1 por acaso. Sem numero de retorno. | Esforco: baixo (simulacao local, sem dinheiro) | Como medir: Cobertura empirica do IC em 10 mil simulacoes; largura media do IC; taxa de falso E1 com retorno zero.
- **Registrar N de tentativas antes da coleta**: Listar todas as variantes de estrategia ja testadas no repo e fixar o N de tentativas no registro da regra, antes do holdout, para que o DSR ou o PBO possa ser calculado depois. | Restricao que prende: Nenhum registro de tentativas foi feito; o numero de variantes e desconhecido (A10). Gravar em journal pode exigir mudanca de schema, que e bloqueada. | Experimento mais proximo: Contar variantes em scripts/autoresearch.ts e no historico de commits de autoresearch, e gravar a contagem na regra. | Ganho: Evita que a escolha do N ou da variante vire busca a posteriori. Sem numero de retorno. | Esforco: baixo (contagem e texto, sem migracao) | Como medir: Numero de variantes registradas antes do holdout; diferenca entre variantes registradas e contadas pelo git.

### Achados

- [A1|calculo|alta|VERIF=confirmado] A formula n = ((1,96 + 0,84) x sigma / delta)^2 reproduz 32 (sigma 1%, delta 0,5%), 126 (sigma 2%, delta 0,5%), 126 (sigma 1%, delta 0,25%), 502 (sigma 2%, delta 0,25%), 784 (sigma 1%, delta 0,1%) e 3136 (sigma 2%, delta 0,1%). A tabela esta aritmeticamente correta.
    fonte: docs/specs/retorno-composto-por-ciclo/matematica-da-meta.md:91-97; docs/specs/retorno-composto-por-ciclo/evidence/pesquisa-t11-validacao-e-risco.md:50
- [A2|calculo|alta|VERIF=confirmado] A tabela de potencia converte ciclos em horas assumindo 1 minuto por ciclo, o que contradiz a cadencia medida. A 135,6 s de mediana, 784 ciclos duram 29,5 h (nao 13 h), 32 ciclos duram 72 min e 3136 duram 118 h.
    fonte: matematica-da-meta.md:97 (784 = 13 h) contra docs/specs/retorno-composto-por-ciclo/validacao-e-baseline.md:21 (intervalo mediano 135,6 s)
- [A3|fato|alta|VERIF=parcial] Cadencia do ciclo: 120 s nominais quentes e 300 s frios; intervalo mediano medido de 135,6 s em amostra minima. O ciclo de 1 min pedido pelo dono nao e o ritmo atual.
    fonte: docs/specs/retorno-composto-por-ciclo/validacao-e-baseline.md:21
    >> parcial: Confirmado: HOT_INTERVAL_MIN = 2 em src/agent/autopilot.ts:38, ou seja 120 s quentes. Nao confirmado no codigo lido: 300 s frios (vem de CADENCIA-20261014.md, nao reverificado). Os testes de autopilot mapeiam look rapido, normal e calmo para 5, 10 e 20 min (src/agent/autopilot.test.ts:82-84). O perfil arrojado tem piso de 1 min quando sobra capacidade (src/agent/autopilot.ts:45, boldHotIntervalMin). A cadencia depende do perfil e da capacidade, nao e fixa. | correcao: Trocar por: cadencia quente de 2 min (autopilot.ts:38), frio de 5 min segundo CADENCIA-20261014.md (nao verificado no codigo), perfil arrojado com piso de 1 min se a capacidade permitir. A mediana medida de 135,6 s e o ritmo efetivo. O ciclo de 1 min nao e o ritmo atual, mas nao e impossivel pelo codigo.
- [A4|fato|alta|VERIF=parcial] O spec exige amostras nao sobrepostas e holdout congelado, mas nao define a unidade de amostra (horizonte H, tipo de janela), nem o minimo de janelas de mercado, nem o que e falha de amostra. Esses quatro itens sao a lacuna do ticket T03.
    fonte: docs/specs/retorno-composto-por-ciclo/spec.md:43; validacao-e-baseline.md:51; matematica-da-meta.md:29 (grep de 'nao sobrepost' e 'holdout' nao encontra definicao operacional)
    >> parcial: Confirmado que spec.md:43 e validacao-e-baseline.md:51 nao definem a unidade de amostra H. Refutado em parte que nao ha minimo: validacao-e-baseline.md:51 fixa 800 a 3200 ciclos para 0,1%, mas em ciclos, nao em janelas de mercado. 'Holdout' tem definicao operacional no manifesto de backtest (docs/BACKTEST-EVIDENCE.md:40, heldOut com startTs e endTs e parametersFrozen), mas nao na regra de sombra. Falha de amostra nao tem criterio em nenhum arquivo da pasta retorno-composto-por-ciclo (busca por inconclusivo e falha de amostra sem resultado). | correcao: Reescrever a lacuna: faltam H (unidade), o minimo de janelas de mercado independentes, o criterio numerico de holdout para a regra de sombra (o manifesto de backtest existe mas nao e a regra) e o criterio de falha de amostra. O minimo de 800 a 3200 ciclos existe e deve ser citado.
- [A5|fato|media|VERIF=confirmado] Sigma por ciclo de 1% e 2% e premissa: nenhum arquivo do repo mede o desvio padrao do retorno liquido por ciclo. A unica medida de movimento e mediana de 0,38% em 1 min, de 16 tokens, com amostras sobrepostas e nao verificado pelo proprio agente.
    fonte: docs/specs/retorno-composto-por-ciclo/matematica-da-meta.md:52; research.md:29; evidence/pesquisa-t12-linha-de-base.md:38 (VERIF=nao_verificavel)
- [A6|calculo|media|VERIF=confirmado] Para um processo AR(1) com autocorrelacao lag 1 rho, a variancia da media cresce pelo fator (1+rho)/(1-rho): x1,22 para rho 0,1; x1,86 para rho 0,3; x3,0 para rho 0,5. Logo N = 784 vira cerca de 958, 1456 e 2352; N = 32 vira cerca de 40, 60 e 96.
    fonte: Identidade padrao de AR(1) (derivacao propria a partir da variancia de longo prazo). Texto primario de referencia para o estimador HAC: Newey e West 1987 (ver A7). Nao lido em fonte primaria nesta sessao.
- [A7|fato|alta|VERIF=confirmado] Citacao do estimador HAC que serve de IC para retornos sobrepostos: Newey, W. K. e West, K. D. (1987), A Simple, Positive Semi-Definite, Heteroskedasticity and Autocorrelation Consistent Covariance Matrix, Econometrica 55(3), p. 703 a 708, DOI 10.2307/1913610. Conteudo do artigo nao lido; citacao conferida em listagens bibliograficas.
    fonte: https://www.econometricsociety.org/publications/econometrica/1987/05/01/notes-and-comments-simple-positive-semi-definite
- [A8|fato|media|VERIF=parcial] Hansen e Hodrick (1980), Journal of Political Economy 88(5), p. 829 a 853: contratos sobrepostos observados em frequencia maior que o horizonte induzem erro de media movel. Segundo fonte secundaria, HAC de Newey-West e de Hansen-Hodrick tendem a viés para baixo em regressao sobreposta.
    fonte: https://warwick.ac.uk/fac/soc/wbs/subjects/finance/faculty1/anthony_neuberger/improved.pdf (fonte secundaria; artigo original nao lido)
    >> parcial: Bibliografia confirmada: Hansen e Hodrick, Journal of Political Economy 88(5), 829-853, 1980, DOI 10.1086/260910 (busca em ideas.repec e outros indices). A afirmacao de que Newey-West e Hansen-Hodrick tendem a vies para baixo em regressao sobreposta nao foi verificada: o PDF do Warwick nao e legivel pelo WebFetch (conteudo comprimido). A fonte e secundaria. Esse vies, se real, pesa na opcao regra_hac_n800, que usa Newey-West. | correcao: Acrescentar o DOI 10.1086/260910. Marcar o vies como nao verificado. Se a afirmacao for confirmada, a opcao regra_hac_n800 fica com IC possivelmente estreito demais para a regra E1.
- [A9|inferencia|baixa] Lo (2002) corrige o Sharpe anualizado por autocorrelacao com eta(q) = q / raiz(q + 2 x soma de (q-k) rho_k): autocorrelacao positiva infla o Sharpe naive. Formula de fonte secundaria, nao verificada no texto primario.
    fonte: https://traders.studentorg.berkeley.edu/papers/The-Statistics-of-Sharpe-Ratios.pdf (PDF nao legivel nesta sessao)
- [A10|fato|media] Deflated Sharpe Ratio (Bailey e Lopez de Prado 2014): o N do DSR e o numero de tentativas independentes; tentativas correlacionadas tornam esse N dificil de estimar, por isso o repo pede registrar cada variante desde o inicio.
    fonte: https://www.davidhbailey.com/dhbpapers/deflated-sharpe.pdf (PDF nao legivel; afirmacao vinda de resumos secundarios) e docs/specs/retorno-composto-por-ciclo/validacao-e-baseline.md:55
- [A11|fato|media] Bootstrap estacionario de blocos (Politis e Romano 1994): blocos de comprimento aleatorio para estimar erro padrao e regioes de confianca em series fracamente dependentes, sem assumir normalidade. Citacao conferida: JASA 89(428), p. 1303 a 1313, DOI 10.1080/01621459.1994.10476870.
    fonte: https://www.rdocumentation.org/packages/monotonicity/versions/1.3.1/topics/statBootstrap (citacao); texto primario nao lido
- [A12|calculo|alta] Linha de base atual: 7 voltas, 0 positivas, -0,41% bruto. Sao 7 de 800 unidades minimas propostas, cerca de 0,9% do N minimo, portanto a sombra atual nao decide E1 em nenhum criterio.
    fonte: docs/specs/retorno-composto-por-ciclo/validacao-e-baseline.md:14 e calculo 7/800

### Decisao para o Jev

Pergunta: Qual regra de promocao E1 fixar antes da coleta: unidade de amostra, N minimo, IC, holdout e falha de amostra?
Reversivel: true

- regra_hac_n800 (Regra com IC HAC e N de 800 unidades): Unidade: retorno liquido de janela nao sobreposta de H min, com H fixado antes. N = teto(784 x (1+rho)/(1-rho)), piso 800. IC 95% por Newey-West; E1 so se o limite inferior for maior que zero com custos reais. | Evidencia: Formula n=((1,96+0,84) sigma/delta)^2 em matematica-da-meta.md:91; fator AR(1) calculo
- bootstrap_blocos_n800 (Mesma regra com IC por bootstrap de blocos): Mesma unidade e mesmo N, mas IC por bootstrap estacionario de blocos (Politis e Romano 1994), que nao assume normalidade e respeita dependencia. E1 se o limite inferior de 95% for maior que zero. | Evidencia: Politis e Romano 1994, JASA 89(428) (citacao verificada, texto nao lido)
- calibrar_antes (Calibrar sigma e rho antes de fixar N): Antes de fixar N: 2 dias de sombra so de medicao (sigma, rho lag 1, cadencia, custo) em bloco disjunto e congelado. A regra e escrita depois desse bloco e antes do holdout. Nenhuma promocao nesse periodo. | Evidencia: Sigma e cadencia nao medidos; cadencia 135,6 s em validacao-e-baseline.md:21
- n126_efeito_grande (N de 126 para efeito grande de 0,5%): N de 126 unidades para efeito de 0,5% com sigma 2%. Serve so para confirmar ou refutar o degrau E5. Nao testa E1, que pede efeito de 0,1% ou menos, e por isso nao serve como regra de promocao E1. | Evidencia: Conta correta: n=126 para sigma 2% (pesquisa-t11-validacao-e-risco.md:50)
- adiar_so_medir (Adiar a regra e so medir em sombra): Conservadora: nenhuma regra de promocao agora. Apenas registrar retorno liquido por ciclo, custo e cadencia em sombra, sem decidir E1, ate a regra ser revisada no proximo ciclo de pesquisa. | Evidencia: G4 exige decisao escrita do dono; nenhum degrau medido (validacao-e-baseline.md:43-53)

Recomendacao sem Jev: calibrar_antes - E a unica opcao que fixa sigma e rho a partir de dado antes de travar N, sem tocar holdout nem dinheiro. Continua reversivel ate o holdout ser congelado, e nao promove nada. Adiar sem calibrar deixa N como premissa.
Cetico: decisao_ok=false; problemas: Opcoes quase identicas: regra_hac_n800 e bootstrap_blocos_n800 compartilham unidade e N e diferem so no metodo de IC. A diferenca real precisa estar explicita e justificada. | n126_efeito_grande nao e regra E1 (a propria descricao diz). Deve sair das opcoes de E1 ou virar regra do degrau E5. | O horizonte H da unidade nao tem valor em nenhuma opcao. A restricao exige H fixo antes da coleta, mas nenhuma opcao o fixa nem compara alternativas (por exemplo 5 min e 15 min, alinhados a cadencia de 135,6 s e a decomposicao de matematica-da-meta.md secao 4). | A restricao de holdout cronologico de 30 por cento nao tem fonte no repo. validacao-e-baseline.md:52-55 exige holdout congelado sem fracao. O unico holdout operacional e o de docs/BACKTEST-EVIDENCE.md:40, que se refere ao manifesto de backtest, nao a regra de sombra. | regra_hac_n800 usa IC de Newey-West. Se a afirmacao A8 sobre vies para baixo for real, o IC fica estreito e E1 pode dar falso positivo. O bootstrap e a protecao, mas a opcao nao justifica isso. | Nenhuma opcao corrige a familia de cinco degraus E1 a E5. Cinco testes com alfa de 5 por cento cada inflam o erro tipo I. Falta regra de correcao (Holm, Bonferroni ou alfa gasto). | Falha de amostra aparece so como restricao (veredito INCONCLUSIVO), sem criterio numerico (por exemplo fracao de ciclos sem preco, minimo de janelas independentes atingido). | Custo real em sombra sem enviar ordem nao tem metodo na decisao. O caminho e a cotacao sintetica em lote (spec.md:40), que deveria aparecer como condicao da regra, pois sigma e rho dependem dela. | Fatos com rotulo impreciso: 'rho lag 1 de 0,3' e cenario, nao medido. 'delta_E1 0,1 por cento' e premissa de H1 (matematica-da-meta.md:107), nao definicao de E1 (matematica-da-meta.md:29). 'Cadencia 120 s e 300 s' e parcial (ver A3). | Os desconhecidos estao em forma de pergunta ('Quantas variantes...', 'ou o ciclo de 1 min sera restaurado?'). 'variantes' se responde no log do repo, pois validacao-e-baseline.md:55 manda registrar cada variante. 'cadencia' e decisao de produto para o Jev, nao pergunta ao dono.

### Bloqueios do dono

- Liberacao de operacao real ou live, e qualquer veredito que autorize dinheiro (G4, validacao-e-baseline.md:53).
- Limites de risco, Kelly fracionado, teto por trade e parada por drawdown (matematica-da-meta.md:103).
- Gravar N de tentativas e variantes em journal, ou qualquer mudanca de schema ou de journal, que e migracao bloqueada.
- Qualquer ordem, assinatura ou transferencia em Solana, inclusive para coletar dado de execucao.

### Novos tickets revelados

- T03b: unidade de amostra e horizonte H: Qual horizonte H (1, 5 ou 15 min) define a unidade nao sobreposta, dado a autocorrelacao medida em replay?
- T03c: medir sigma, rho e cadencia em sombra: Quais sao sigma, rho lag 1 e a cadencia real do retorno liquido por unidade num bloco de 48 h em sombra?
- T03d: contar variantes para o N do DSR: Quantas variantes de estrategia foram testadas no repo, e qual e o N de tentativas independentes?
- T03e: corrigir a conversao de ciclos em horas no spec: O spec matematica-da-meta.md:97 deve trocar 13 h por 29,5 h, ou o ciclo de 1 min sera restaurado antes?

### Nao lido

- Lo (2002) The Statistics of Sharpe Ratios: PDF nao legivel por WebFetch; formula eta(q) e apenas de fonte secundaria (A9).
- Bailey e Lopez de Prado (2014) Deflated Sharpe Ratio: PDF nao legivel; definicao de N apenas de resumo (A10).
- Hansen e Hodrick (1980) JPE: artigo original nao lido, so fonte secundaria (A8).
- Newey e West (1987): citacao conferida, conteudo do estimador nao lido (A7).
- Bailey, Borwein, Lopez de Prado e Zhu (2017), probabilidade de overfitting (PBO): busca nao retornou fonte; nao verificado.
- Politis e Romano (1994): citacao conferida via rdocumentation, texto nao lido (A11).
- Cache de velas de minuto que gerou a fracao de movimentos (fora do repo): nao reproduzido.
- evidence/pesquisa-t11-validacao-e-risco.md e pesquisa-t12-linha-de-base.md foram lidos so por busca de trechos (grep), nao na integra.
- Nenhuma escrita no repo foi feita; nenhuma chamada ao Jev ou servico pago; nenhum .env, chave ou endereco de carteira foi lido.

### Resumo do cetico

Reverifiquei as 8 afirmacoes contra arquivo:linha, codigo e fontes primarias: 5 confirmadas (A1, A2, A5, A6, A7), 3 parciais (A3, A4, A8) e nenhuma refutada. A aritmetica da tabela de amostra e a formula de AR(1) conferem. A cadencia tem nuance por perfil, a lacuna da unidade de amostra e o criterio de falha sao reais, mas o holdout e o minimo de ciclos estao parcialmente definidos no repo. A decisao nao pode ir ao Jev como esta: a opcao regra_hac_n800 depende de um IC Newey-West cujo vies nao foi verificado, nao fixa o horizonte H, nao corrige a familia de cinco degraus E1 a E5 e a restricao de holdout de 30 por cento nao tem fonte. Os ajustes sao reversiveis e nao tocam assunto vedado.

## Comments

