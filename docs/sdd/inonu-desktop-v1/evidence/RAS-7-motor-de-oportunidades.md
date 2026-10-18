# RAS-7: motor de oportunidades e o que o histórico mediu (2026-10-13)

Pedido do usuário em 2026-10-13: o radar do painel de baixo mostrava "mais negociados, maiores altas e maiores quedas", dados e análises superficiais; ele quer o motor do sistema identificando **as melhores oportunidades de compra do ecossistema**, olhando liquidez, posicionamento e vários indicadores, para achar o que está barato, com liquidez e com chance de retorno. Esta entrega faz o motor e **mede se o que ele lê serve para isso**. A resposta medida é que **não serve, com os dados e os limites desta rodada**, e a tela diz isso.

## Requisitos fixados antes de implementar

| Id | Requisito | Aceitação independente |
| --- | --- | --- |
| OPP-1 | O motor só usa leituras públicas e gratuitas da OKX (tickers à vista e velas diárias). Nenhuma chamada ao modelo e nenhuma à cota da OnchainOS. | Varredura do código (`no-send-scan`, `animation-scan` com `src/opportunity`); teste do leitor (`okx-daily.test.ts`) |
| OPP-2 | Um par entra na lista só se tiver liquidez: volume de 24 h de pelo menos US$ 1 mi e spread de até 15 bps, sem moedas estáveis. Par sem leitura confiável (número quebrado, histórico curto) fica de fora e é contado. | `scan.test.ts` (quem é lido, quem falha) e `factors.test.ts` (série curta ou quebrada não é leitura) |
| OPP-3 | Cada leitura é uma **medida com limite escrito** em `OPPORTUNITY_RULES`, sem verbo de ordem. O código descreve; quem decide é o Inonu, ao clique. | Testes de texto na web (`engine.test.ts`, `engine-radar-render.test.tsx`): sem palavras de ordem, sem ponto médio, sem traço, sem número quebrado |
| OPP-4 | Os limites são fixados **antes** de medir no histórico; a medição separa uma parte para olhar e outra para confirmar, desconta custo, compara com a média dos pares no mesmo dia e escreve os vieses. Não se afirma ganho que a medição não mostrou. | `scripts/opportunity-backtest.ts` e este documento |
| OPP-5 | A tela diz o que a medição achou, e a ordem da lista não finge ser uma ordem de retorno esperado. | `engine-radar-render.test.tsx` ("nenhuma leitura do historico de precos teve vantagem firme", "nao o que vai subir") |
| OPP-6 | O motor roda em segundo plano quando alguém olha o quadro, uma varredura por vez, com cache (quadro 10 min, velas 30 min), e uma falha não derruba o quadro anterior. | `scan.test.ts` (uma varredura por vez, TTL, espera depois de erro) e `http.test.ts` (a rota) |

## O que foi feito

- **Núcleo** (`src/opportunity/`): `factors.ts` (puro: desconto frente ao próprio passado, virada, participação, geometria da faixa de 30 dias, RSI, oscilação, e "fora do normal"), `okx-daily.ts` (leitor estrito, com ritmo, tempo limite e códigos constantes), `scan.ts` (universo líquido, uma varredura por vez, cache, estados `idle`, `lendo`, `pronto`, `erro`). Rota `GET /inonu/opportunities` (`src/inonu/http.ts`, ligada em `src/desktop/handlers.ts`), somente leitura, sem modelo. Medido ao vivo: 427 pares contra USDT listados, 90 líquidos, 85 lidos e 5 sem leitura.
- **Tela** (`web/src/lib/opportunity/`, `EngineRadar.tsx`): o radar da aba Inonu passou a ser o quadro do motor, com para cada par o preço, a variação, **quão fora do normal ele está para o próprio normal** (movimento de 24 h em unidades da oscilação diária dele e volume contra a média dos 7 dias anteriores), as três leituras com o que cada uma mediu, o volume e as marcas de cuidado (oscilação alta, queda forte, spread). O botão "Escolher as 3 primeiras" leva ao pedido de ranking ao Inonu que já existia (o Inonu vê, de cada par, as zonas do motor de fluxo). Se o motor cair, a lista simples por volume aparece rotulada como o que é.
- **Vista "Ecossistema" do Radar** (`EcosystemTab.tsx`, `lib/onchain/opportunities.ts`, `ecosystem-scan.ts`): varredura de várias redes de uma vez (duas leituras da OnchainOS por rede, no clique, sem modelo): lista em alta cruzada com as compras das carteiras rastreadas, três leituras independentes (dinheiro esperto, fluxo, tração) e marcas de cuidado. **Esta vista não tem medição de histórico** (não há série de carteiras rastreadas para medir aqui) e a tela diz que os limites são escolhas do código, não calibradas.

## O que foi medido

`bun --no-env-file scripts/opportunity-backtest.ts` (dados públicos da OKX em cache local, `data/research/`, fora do git). **170 pares** líquidos hoje (volume de 24 h acima de US$ 300 mil; na amostra, média de 30 dias acima de US$ 1 mi), **27.263 pares-dia**, de **2025-08-31 a 2026-10-10**. Sinal lido no **fechamento** do dia t; entrada na **abertura** do dia t+1; saída no fechamento de t+H; custo de 0,2% na ida e volta. O que se reporta é o **excesso sobre a média de todos os pares da amostra no mesmo dia**, para não creditar a um fator o mercado subir ou cair no período. O t é tomado sobre dias (um excesso médio por dia) e dividido por √H porque as janelas de H dias se sobrepõem; é um aviso aproximado, não prova. Os primeiros 60% dos dias (até 2026-04-30) são "para olhar" e os últimos 40% (de 2026-05-01) "para confirmar". Um fator só teria vantagem se as duas partes concordassem no sinal e a de confirmação passasse de 2.

**Limites fixados antes** (`OPPORTUNITY_RULES`): desconto = posição na faixa de 30 dias até 0,35 e pelo menos 25% abaixo da máxima de 90 dias; virada = sem mínima nova nos 3 últimos dias frente aos 10 anteriores e fechamento acima da média de 5 dias; participação = volume do dia pelo menos 1,3 vez a média dos 7 dias anteriores.

### Primeira rodada: a tese pedida (barato, com a queda parando e com mais dinheiro entrando), horizonte de 7 dias

| grupo | olhar: n, excesso médio, t | confirmar: n, excesso médio, t |
| --- | --- | --- |
| desconto | 8.152, -0,02%, -0,53 | 3.190, **-0,53%**, -1,73 |
| virada | 5.515, +0,08%, 0,00 | 4.074, -0,10%, +0,12 |
| participação | 3.598, -0,13%, -0,80 | 2.370, -0,01%, -0,49 |
| contagem 3 (as três juntas) | 257, -0,30%, -0,41 | 132, **-3,43%**, -2,02 |
| desconto e virada | 1.544, +0,18%, +0,21 | 629, -2,02%, -1,58 |
| RSI abaixo de 35 | 3.670, +0,03%, -0,99 | 829, -1,13%, -1,80 |

A 14 dias o quadro é o mesmo ou pior (as três juntas: -6,47% de excesso na confirmação). **O que o usuário esperava, barato com liquidez e a queda parando, ficou abaixo da média dos pares, e as três leituras juntas ficaram muito abaixo.** Por isso a ordem da lista **não** é a contagem de leituras.

### Segunda rodada: força, tendência, liquidez e volatilidade (escritas antes de rodar), 7 dias

| grupo | olhar | confirmar |
| --- | --- | --- |
| M1 força de 30 dias (quintil superior) | -0,16% | +0,45% |
| M2 força de 7 dias (quintil superior) | +0,47% | -0,47% |
| M3 fraqueza de 7 dias (quintil inferior) | -0,69% | -0,18% |
| M4 perto da máxima de 30 dias | +0,73% | +0,16% |
| M6 acima da média de 50 dias | +0,36% | +0,22% |
| M8 liquidez alta (tercil) | +0,33% (t 1,25) | +0,35% (t 1,08) |
| M9 liquidez baixa (tercil) | -0,49% (t -2,04) | -0,10% |
| M11 volatilidade baixa (tercil) | **+1,03% (t 2,61)** | **-0,61%** |

**Nenhum grupo passa nas duas partes.** O único que parecia forte ao olhar (volatilidade baixa) **virou de sinal** na confirmação: com 18 grupos testados, um passar de 2 por acaso é esperado. Duas tendências têm o mesmo sinal nas duas partes mas são pequenas e sem significância: liquidez alta (cerca de +0,3%) e acima da média de 50 dias (+0,2% a +0,4%); liquidez baixa tem o sinal oposto.

### Um aprendiz (regressão logística, só com o passado)

Os 11 números do histórico de cada par-dia, treinados em janelas que terminam antes do bloco testado (purga de 7 dias mais um de embargo, 5 blocos), julgados só nos blocos que nunca viu: **AUC de 0,518 a 7 dias e 0,524 a 14 dias** (0,500 é uma moeda). O quintil de maior probabilidade rendeu **-0,22%** de excesso a 7 dias (t -0,22) e **-0,49%** a 14 dias; o sinal do melhor quintil troca de um bloco para outro (+0,67%, -0,59%, +0,16%, +1,29%, -1,80%).

### Posicionamento: funding dos perpétuos (o usuário pediu), janela curta

A OKX pública só entrega o histórico de funding dos **últimos 3 meses**, então esta medição tem **89 dias** (de 2026-07-14 a 2026-10-10), **5.044 pares-dia** dos pares que têm perpétuo, **um só regime**, e vale pouco. Hipóteses escritas antes de olhar: funding no **quintil mais baixo** do dia (média de 3 dias, curtos pagando aos longos, posição vendida lotada) deveria render **acima** da média, e no quintil mais alto **abaixo**. Excesso médio sobre a média dos pares com perpétuo no mesmo dia:

| grupo | 7 dias, 1ª metade | 7 dias, 2ª metade | 3 dias, 1ª metade | 3 dias, 2ª metade |
| --- | --- | --- | --- | --- |
| P1 funding no quintil mais baixo | -2,15% (t -0,99) | -1,58% (t -1,45) | -1,21% | -0,48% |
| P2 funding no quintil mais alto | -0,08% | +0,24% | +0,62% | -0,06% |
| P3 funding negativo (3 dias) | -2,72% (t -0,85) | -2,27% (t -1,62) | -1,33% | -0,70% |

**A hipótese saiu ao contrário:** onde o funding estava mais baixo ou negativo, o par rendeu **menos** que a média nas duas metades e nos dois horizontes (de -0,5% a -2,7%), em vez de "espremer" os vendidos. O sinal é o mesmo nas duas partes, mas o t fica abaixo de 2 em todas as células e a janela é de três meses: **não é vantagem provada, nem em sentido contrário**. O que se pode dizer é que **funding negativo não foi motivo para olhar um par com otimismo**, e que o quintil mais alto não mostrou nada. O motor **não** lê funding hoje (custaria mais uma leitura por par a cada varredura); fica como marca de cuidado candidata, a medir com uma janela maior quando houver.

### Vieses (todos empurram o resultado PARA CIMA)

- **Sobrevivência:** os pares são os listados e líquidos **hoje**; o que caiu e foi retirado não está, e isso favorece mais os fatores "barato". Um resultado positivo seria um teto, e o que saiu foi negativo.
- Spread e derrapagem além dos 0,2% não são modelados; a amostra é um regime só (de queda até abril de 2026 e de alta depois: a média bruta em 7 dias foi -2,7% e +0,9%).
- Apenas fatores de preço e volume diários da OKX à vista: **não medem** posicionamento em derivativos, carteiras rastreadas na cadeia, microestrutura do livro nem o motor de fluxo, que são onde o sistema pode ter vantagem e onde ainda não há medição.

## Conclusão honesta e o que isso muda na tela

1. **Não existe, nesta medição, uma leitura de preço e volume diários que ache "as melhores compras".** Dizer o contrário seria inventar ganho (a regra do projeto é só afirmar o que foi medido).
2. O quadro, então, **aponta onde olhar** (o que está fora do normal para o próprio par, entre pares líquidos) e **deixa a escolha ao Inonu**, que vê o motor de fluxo de cada par escolhido. A tela escreve o resultado da medição ao lado da lista e não ordena por retorno esperado.
3. O caminho que pode ter vantagem real é **medir para frente**: o Placar já mede o que o mercado fez depois de cada resposta do Inonu; quando houver respostas suficientes, ele diz se escolher entre estes candidatos ajuda. Até lá, é "não medido".

## O que não está feito

- **Posicionamento além do funding** (interesse aberto, razão de contas compradas e vendidas): a OKX pública só guarda janelas curtas; o funding foi medido (acima) e não ajudou. O motor ainda não lê funding.
- Passar os fatos do motor (liquidez, faixa, volume contra a semana) ao Brief do ranking do Inonu: hoje o Inonu vê as zonas e o fluxo do motor de fluxo, não estas leituras.
- Medir "dinheiro esperto" e fluxo on-chain no tempo: exige guardar as leituras e esperar o preço.
- Os limites das marcas de cuidado (oscilação de 8% ao dia, queda de 10% em 24 h, spread de 8 bps) são escolha do código, sem calibração.
