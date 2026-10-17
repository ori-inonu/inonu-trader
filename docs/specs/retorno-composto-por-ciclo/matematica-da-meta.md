# Matemática da meta: 0,5% a 1% por ciclo de 1 minuto

Data: 2026-10-17. Todos os cálculos abaixo foram refeitos por mim com `bun` e conferem com os dos agentes, salvo onde indicado. Cálculo é cálculo: não é previsão nem promessa de lucro.

## 1. Composição

Fator em n ciclos com retorno líquido médio r por ciclo: (1 + r) elevado a n.

| Retorno líquido por ciclo | Em 1 hora (60 ciclos) | Em 1 dia (1440 ciclos) | US$ 121 em 1 dia (sem custo de capacidade) |
| --- | --- | --- | --- |
| 0,01% | x1,006 | x1,15 | US$ 140 |
| 0,02% | x1,012 | x1,33 | US$ 161 |
| 0,05% | x1,030 | x2,05 | US$ 249 |
| 0,08% | x1,049 | x3,16 | US$ 383 |
| 0,10% | x1,062 | x4,22 | US$ 510 |
| **0,16%** | x1,101 | **x10,00** | US$ 1209 |
| 0,25% | x1,162 | x36,4 | US$ 4409 |
| **0,50%** | x1,349 | **x1315,6** | US$ 159 mil |
| **1,00%** | x1,817 | **x1,67 milhão** | US$ 202 milhões |

Tempo para dobrar: 139 minutos a 0,5% e 70 minutos a 1%. Em uma semana, 0,5% por minuto daria x6,8 vezes 10 elevado a 21. Em um ano, 1,005 elevado a 525600 é da ordem de 10 elevado a 1138. Nenhuma série de retorno observada nas fontes lidas chega perto disso, e o ponto não é esse: o ponto é que um único degrau (0,5%) é um mau instrumento de medida.

## 2. Escada de metas (em vez de um degrau)

O dono já usou "US$ 118 para US$ 1180 em 24 h" como alvo para forçar o raciocínio (`docs/sdd/agente-autonomo/ANALISE-10X-EM-24H-20261015.md`, seção 0): isso é o degrau de 0,16% líquido por ciclo em 1440 ciclos. A escada proposta, cada degrau com critério testável em sombra:

| Degrau | Retorno líquido médio por ciclo de 1 min | Efeito em 24 h | Evidência exigida para subir |
| --- | --- | --- | --- |
| E1 | maior que 0 com intervalo de confiança acima de zero, custos reais | positivo | amostra não sobreposta, holdout congelado |
| E2 | 0,02% a 0,05% | x1,3 a x2 | idem, em duas janelas de mercado distintas |
| E3 | 0,16% | x10 | idem, e capacidade verificada (seção 5) |
| E4 | 0,25% | x36 | idem |
| E5 | 0,5% a 1% | x1316 a x1,67 milhão | idem; é o objetivo declarado do dono |

A pesquisa não coloca teto na escada. O que ela exige é que cada degrau seja alcançado **com custo medido** antes do seguinte. O estado atual é abaixo do degrau E1.

## 3. Requisitos por trade e giro

Seja c o custo de ida e volta como fração do valor negociado, g o movimento bruto capturado por volta, k o giro (valor negociado por minuto sobre o capital) e t o retorno líquido por minuto. Então t = k (g - c), ou g = c + t / k.

Com c = 0,42% (média medida em ativo líquido, 6 pares de um só ativo):

| t (líquido por minuto) | k = 1 | k = 2 | k = 5 |
| --- | --- | --- | --- |
| 0,5% | g = 0,92% | g = 0,67% | g = 0,52% |
| 1,0% | g = 1,42% | g = 0,92% | g = 0,62% |

Se o sistema girasse o capital inteiro a cada minuto pagando 0,42%, só o atrito custaria 0,42% x 1440 = 605% ao dia. Logo a conta só fecha se o sistema **não** negociar em todo minuto: opera quando a expectativa bruta supera o custo.

Taxa de acerto necessária com movimento simétrico de tamanho s e g = c + t com k = 1: p maior ou igual a (1 + g / s) / 2. Com g = 0,92%: s = 1% exige p de 0,96; s = 2%, p de 0,73; s = 3%, p de 0,65. Com s igual à mediana de 1 minuto (0,38%) não há solução. Conclusão operacional: o edge precisa vir de **janelas de movimento grande**, não de qualquer minuto.

Fração dos movimentos absolutos acima de um limiar (16 tokens vistos pelo Jev, amostras sobrepostas, sem direção): 1 min: 43% acima de 0,5%, 26% acima de 1%, 14% acima de 2%. 5 min: 57%, 38%, 25%. Movimento não é direção: nada aqui diz que um lado vence o custo. O cache de velas de minuto que gerou esses números fica fora do repositório e não foi reproduzido.

## 4. Decomposição em janelas

Retorno médio por minuto = lambda (janelas capturadas por minuto) x R (retorno líquido médio por janela, já com todos os custos).

| lambda | R necessário para 0,5% por minuto | R necessário para 1% por minuto |
| --- | --- | --- |
| 1 janela a cada 2 min (0,5) | 1,0% | 2,0% |
| 1 a cada 5 min (0,2) | 2,5% | 5,0% |
| 1 a cada 10 min (0,1) | 5,0% | 10,0% |
| 1 a cada 30 min (0,033) | 15% | 30% |

Isso dá o que medir: a **distribuição de retorno líquido por janela** e a **frequência** de janelas com expectativa positiva. É a mesma definição de "oportunidade" do E0 do ADENDO-E, estendida da distorção entre venues a qualquer janela.

## 5. Capacidade: onde o crescimento geométrico para

Em pool de produto constante com TVL L, um trade de tamanho s na moeda de cotação tem impacto médio de cerca de s / x, com x = L / 2 a reserva de cotação, ou seja cerca de 2 s / L (sem taxa). Para impacto de 0,1%: L de cerca de 2000 s.

| Trade | TVL para 0,1% de impacto |
| --- | --- |
| US$ 121 | US$ 242 mil |
| US$ 1 mil | US$ 2 milhões |
| US$ 10 mil | US$ 20 milhões |

Correção: o pesquisador escreveu impacto de cerca de s / (2 x profundidade), o que dá 4 vezes menos (US$ 60 mil para US$ 121). Refiz pela invariante do produto constante. Vale como ordem de grandeza; pools concentrados (CLMM, DLMM) se comportam diferente perto do preço ativo.

Consequência: a 0,5% por minuto, US$ 121 passaria de US$ 10 mil em cerca de 885 minutos (14,8 h). Em torno daí, o tamanho do trade já exigiria pools de dezenas de milhões de dólares de TVL para o mesmo impacto. O crescimento composto vira linear quando o tamanho encosta na profundidade das pools negociáveis. **Implicação de arquitetura**: o sistema precisa escolher pools por profundidade relativa ao capital, e a meta em % deve vir acompanhada de uma meta em dólares por minuto.

Observação sobre o raso: no pool de cerca de US$ 37 mil, as cotações de 2, 5 e 10 USDC deram o mesmo custo de cerca de -2,1%. Por esta fórmula, o impacto de 10 USDC seria de cerca de 0,05%. Custo igual para tamanhos diferentes sugere custo percentual fixo (imposto do token ou taxa do pool), não impacto. É inferência: a decomposição ainda não existe.

## 6. Em dólares

Com US$ 121, 0,5% é US$ 0,61 por ciclo e 1% é US$ 1,21; sem compor, US$ 871 a US$ 1742 por dia. Como escala de referência (fonte **secundária**, blog da Helius com dados do detector de arbitragem da Jito, "último ano", sem datas): 90,4 milhões de arbitragens bem-sucedidas, lucro médio de US$ 1,58 por arbitragem e US$ 142,8 milhões no total, ou cerca de 172 arbitragens e US$ 272 por minuto no ecossistema inteiro. Em dólares, a meta para o capital atual equivale a capturar uma arbitragem média a cada 1 a 3 minutos. Isso mostra que, com US$ 121, o que limita **não é a capacidade**, é a vantagem de latência e de atomicidade que o executor spot atual não tem (ADENDO-E, seção 1). Em contrapartida, a escala não se aplica a edge direcional.

Referência de fundos (anual, não por minuto): o fundo Medallion aparece com cerca de 39% em 2020 antes das taxas (CNBC), com 66% citado por fontes secundárias e com a estimativa de que o composto anualizado antes das taxas fica abaixo de 35% (arXiv 2405.10917, lido só pelo resumo). Servem para situar a escala, não como teto.

## 7. Amostra necessária para falsificar ou confirmar

Teste bilateral de média, alfa de 5%, poder de 80%, retornos por ciclo independentes e aproximadamente normais: n = ((1,96 + 0,84) x sigma / delta) ao quadrado.

| Efeito a detectar (delta) | sigma de 1% por ciclo | sigma de 2% por ciclo |
| --- | --- | --- |
| 0,5% | 32 ciclos | 126 ciclos |
| 0,25% | 126 | 502 |
| 0,1% | 784 (13 h) | 3136 (52 h) |

Autocorrelação e amostras sobrepostas reduzem o n efetivo; caudas gordas pioram. A conta dá o **piso**. O ponto prático: a hipótese "média líquida de 0,5% por ciclo" pode ser refutada em poucas horas de sombra com custos reais, e hipóteses de efeito menor, em um a dois dias.

## 8. Dimensionamento (Kelly): o que a conta diz e o que não diz

Kelly contínuo: f* = mu / sigma ao quadrado. Com mu = 0,5% e sigma = 2% por minuto, f* = 12,5 (1250% do capital); com sigma = 0,5%, f* = 200. O agente t11 leu isso como "incompatível com risco de ruína", leitura que eu não adoto. Com esses insumos, f* maior que 1 significa que, **se** mu fosse real e conhecido, o ótimo seria alavancado; a conta não diz que mu existe. O risco concreto é o erro de estimação de mu: Kelly cheio superaposta quando mu é superestimado, e por isso a prática é Kelly fracionado e encolhimento de mu. Limite de risco e dimensionamento são decisões do dono; aqui só ficam registradas as opções (Kelly fracionado de 0,1 a 0,25, teto por trade, parada por drawdown).

## 9. Hipóteses testáveis que decorrem desta matemática

- H1: a média líquida por ciclo, com custo decomposto e amostras não sobrepostas, é maior que zero (degrau E1). Teste em sombra, amostra mínima de 800 ciclos para efeito de 0,1%.
- H2: existem janelas de movimento de 1 a 5 minutos com expectativa bruta maior que 0,92% (custo medido mais 0,5%) em pools com TVL de pelo menos 2000 vezes o trade. Medir frequência (lambda) e R.
- H3: a precisão direcional do Jev em janelas de 5 minutos supera o piso exigido (cerca de 90% com atrito de 0,5%, pela fórmula de `ANALISE-10X-EM-24H-20261015.md` seção 1.3). Medir acerto por janela com intervalo de confiança.
- H4: o custo de ida e volta cotado em lote (cotação sintética, sem ordens) prevê o custo realizado dentro de uma tolerância a definir.

Fontes e estado de verificação por afirmação: [evidence/pesquisa-t01-matematica-da-meta.md](evidence/pesquisa-t01-matematica-da-meta.md), [evidence/pesquisa-t11-validacao-e-risco.md](evidence/pesquisa-t11-validacao-e-risco.md), [evidence/pesquisa-t12-linha-de-base.md](evidence/pesquisa-t12-linha-de-base.md).
