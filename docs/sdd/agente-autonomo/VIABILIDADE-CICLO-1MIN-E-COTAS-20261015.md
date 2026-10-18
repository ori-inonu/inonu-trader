# Viabilidade do ciclo de 1 minuto e das cotas de API do plano gratuito (2026-10-15)

Pedido do dono no chat: calcular os limites de API por minuto, por dia e por mes (o dono acredita que a documentacao traz todos), aproveitar ao maximo o plano gratuito do OnchainOS e da OKX Wallet enquanto nao ha retorno financeiro (e so pagar um plano maior depois, com lucro), e dizer se da para baixar o ciclo de 2 minutos para 1 minuto, considerando taxas da corretora, gas e taxas das moedas. Este documento separa o que a DOCUMENTACAO diz, o que foi MEDIDO e o que e DESCONHECIDO. So leitura: nenhum codigo do caminho vivo mudou; nada foi ligado, carregado ou reiniciado; nenhum ganho foi medido.

## 1. O que a documentacao publica (lida em 2026-10-15)

Fonte: pagina de custos do provedor (`web3.okx.com/onchainos/dev-docs/market/market-api-fee`) e a pagina do endpoint `hot-token`.

| Plano | Preco por mes | Chamadas Basic por mes | Chamadas Premium por mes | WebSocket |
| --- | --- | --- | --- | --- |
| Free | US$ 0 | 100 mil | 100 mil | nao suportado |
| Starter | US$ 99 | 2 milhoes | 600 mil | todos os canais |
| Growth | US$ 199 | 5 milhoes | 2 milhoes | todos os canais |
| Pay per call (x402) | sem mensalidade | 100 mil gratis, depois US$ 0,0001 por chamada | 100 mil gratis, depois US$ 0,0002 por chamada | nao citado |

- As cotas reiniciam no dia 1 de cada mes. As rotas de "redes suportadas" e de varios catalogos sao gratuitas e sem cota.
- **Limites por segundo, por minuto ou por dia NAO estao publicados** nessas duas paginas; a propria pagina manda contatar o suporte para ajustar RPS. O que o projeto usa (1 requisicao por segundo, configuravel, `docs/OKX-ONCHAINOS-DADOS-SPEC.md`) e um piso conservador do cliente, NAO um limite medido. Limite do WebSocket nos planos pagos (indice local de cobertura): 3 conexoes por segundo e 480 inscricoes por hora.
- `hot-token`: no maximo 100 resultados por chamada e paginacao rasa (cursor ate 100).
- Pagar por chamada (x402) exige uma assinatura de pagamento a cada requisicao, e o projeto marcou isso como "fora" (a regra e que o app nunca assina sozinho): nao e opcao hoje.
- Faixas por rota (catalogo local, `src/onchain-read/catalog.ts`): Basic = `hot-tokens`, `candles`, `price`, `search`, `pools`, `trades`; Premium = `signals`, `token-risk`, `holders`, `top-traders`, `price-info`, `leaderboard`, `clusters`; gratis = redes suportadas. A pagina de custos confirma estas: hot token, candles, price, search e trades como Basic; signal list, token holders, price info, top trader e leaderboard como Premium. `token-risk`, `pools` e `clusters` seguem so a classificacao do catalogo (a pagina os nomeia por outros titulos), nao verifiquei cada um.

## 2. O que foi medido

### Cotas de dados (contador do gateway, `usage-2026-10.json`; `scripts/api-budget.ts`, 4 testes)

| | Basic | Premium |
| --- | --- | --- |
| Cota do plano Free por mes | 100000 | 100000 |
| Media por dia em mes de 31 dias | 3226 | 3226 |
| Media por minuto | 2,24 | 2,24 |
| Usado antes de hoje (dias 13 e 14) | 1791 | 1436 |
| Hoje, ate agora | 2625 | 722 |
| Projecao do dia pelo ritmo ate agora | 3533 | 972 |
| Mes cheio ao ritmo de hoje | 109514 (9514 acima) | 30122 |
| Pode usar por dia no resto de outubro | 5917 | 6100 |

- O ritmo atual do Basic, num mes de 31 dias, passa 9,5% do cap. Outubro so cabe porque o contador comecou no dia 13. A guarda `hotWithinQuota` (`autopilot.ts`) freia o ritmo quente por isso; nao foi testada contra um mes cheio.
- O Premium usa cerca de 30% do cap: ha folga grande ali, a ser gasta onde o dado e mais valioso.
- Se o excedente do Basic fosse pago por chamada, custaria cerca de US$ 0,95 por mes no ritmo de hoje (0,0001 por chamada), mas a opcao x402 esta fora (secao 1).

### Latencia do Jev (120 consultas, `decisions-meta.jsonl`: resposta menos pedido)

Mediana 371 ms, p90 406 ms, p99 1570 ms, maximo 8954 ms, minimo 330 ms. Ou seja, o Jev decide em menos de um segundo (a estimativa do dono de 80 a 300 ms esta um pouco abaixo do medido, mas a conclusao de que e rapido vale). O intervalo mediano entre olhares gravados e 135,6 s contra 120 s nominais: cerca de 15 s por ciclo ficam fora da chamada do modelo (nao decomposto aqui).

### Custo de operar (o que se mediu e o que e suposicao)

- Taxa de rede da Solana: US$ 0,0005144 por operacao (`fees.json`, medida na cotacao): desprezivel.
- Abertura de conta de um token que a carteira nunca teve: cerca de 1,7% de uma entrada de US$ 10 (medida anterior, `ADENDO-C`); zero para um token ja mantido.
- Taxa do pool e impacto: dependem da cotacao no tamanho; NAO medidos token a token. O atrito de ida e volta de 2% usado nas medicoes de hoje e SUPOSICAO.

### Movimento do preco contra o atrito (`scripts/move-vs-friction.ts`, 2 testes; 16 tokens que o Jev viu, velas publicas de minuto, amostras sobrepostas, atrito suposto de 2%)

| Janela | Movimento absoluto mediano | Parcela dos movimentos acima de 2% |
| --- | --- | --- |
| 1 minuto | 0,38% | 14% |
| 5 minutos | 0,63% | 25% |
| 15 minutos | 1,03% | 35% |
| 60 minutos | 2,23% | 53% |

Leitura: em janelas de 1 a 5 minutos o movimento tipico e menor que o atrito; so a partir de 15 a 60 minutos o movimento tipico chega perto dele. Isto e magnitude sem direcao: nao diz que ha lucro, so que girar o caixa em 1 minuto nao paga o atrito sem uma vantagem grande por operacao.

### O que o Jev ve contra o mercado no instante do olhar (`scripts/brief-freshness.ts`, 3 testes; 16 tokens; 811 pares; descritivo e ruidoso)

Comparando os retornos do Brief (`r5`: ultima barra de 5 min; `r15`: 15 min; `r1`: 1 hora, ver `momentum.ts`) com os das velas publicas no instante do olhar: diferenca mediana de 0,89 ponto (5 min), 1,01 (15 min) e 1,2 (1 hora); em 33%, 36% e 39% dos pares a diferenca passa de 2 pontos; o sinal difere em 29%, 15% e 11%. Lacunas de vela e pools diferentes somam ruido, entao e indicio de defasagem, nao medida exata.

## 3. Conta do ciclo de 1 minuto

1. Consultas ao Jev: 1 minuto o dia todo e 1440 consultas por dia, o dobro do teto LOCAL de 720 (uma configuracao, nao um limite contratual, ADENDO-E), e cerca de 22,5 milhoes de tokens por dia contra 11,2 milhoes (15,6 mil tokens por consulta, medido). A cota real da conta e DESCONHECIDA. Dentro de 720 por dia a media e de 2 minutos; 1 minuto cabe por cerca de 12 horas do dia, ou melhor, so quando houver motivo (janela quente ou evento).
2. Dados Basic: se TODA a leitura crescesse com os olhares, o dia iria de 3533 para 7984 (intervalo de 2,26 para 1 min); se so metade crescesse, 5758; o maximo sustentavel no resto de outubro e 5917. Cabe se no maximo cerca de 53% das leituras Basic crescerem com os olhares. A divisao entre leitura por olhar e leitura por relogio NAO esta medida (o contador so tem totais por faixa): falta um contador por rota. Num mes de 31 dias cheio o gratuito ja estoura no ritmo de hoje, entao um ciclo mais rapido exige cache mais agressivo nas leituras Basic.
3. Dados Premium: mesmo no pior caso (2196 por dia) cabe com folga; ha cerca de 5100 chamadas por dia de folga ao longo do mes. E aqui que cabe a inteligencia extra (sinais de carteiras rastreadas, risco do token, detentores, maiores traders, `price-info`), nao na faixa Basic que ja esta no limite.
4. Retorno por operacao: ver a tabela de movimento; mais olhares nao criam movimento, so reduzem o atraso para ver um que ja ocorreu.

## 4. Recomendacao (para decidir, nao autorizacao)

1. Nao ha como pagar 1 minuto o dia todo no plano gratuito. O desenho viavel e de DOIS RITMOS: relogio de 2 minutos como base; 1 minuto (ou evento) so em janela quente, limitado pelo teto de consultas e pela guarda de cota (candidato do item 3 + pulso, nota 177S).
2. Mover o enriquecimento para o Premium: usar as rotas Premium que o gateway ja tem, para poucos candidatos (os que o Jev preferiu mais e as posicoes), com cache e idade registrada; manter o Basic plano (cache nos candles e precos).
3. Antes de qualquer mudanca de leitura: contador de uso POR ROTA (hoje so por faixa), para trocar as faixas de projecao por numeros.
4. Manter o plano Free enquanto nao houver lucro realizado, como o dono decidiu. Regra sugerida para subir de plano (decisao do dono): so com lucro liquido realizado e medido ao longo de 30 dias maior que a diferenca de custo; o Starter custa US$ 99 por mes, quase todo o capital de hoje.
5. Nao subir consultas por dia antes de ler a cota real da conta e medir tokens e custo por tentativa (nota 187 da Codex).

## 5. Limites desta analise

Amostra de 16 tokens e algumas horas; as velas sao do pool mais fundo e nao executaveis; os movimentos sobrepostos nao sao independentes; o atrito e suposto; a cota real do modelo e os limites por segundo e por minuto da API sao desconhecidos; nada aqui prova lucro. Estado: valido como calculo e codigo de leitura; nada carregado, nada ao vivo, ganho medido nenhum.

## 6. Correção posterior (nota 177W): o atrito não é fixo em 2%

Depois de ler os documentos de orientação da Codex (`diagnostico-compras`, `CADENCIA`), corrijo duas premissas deste documento:

1. **O atrito depende da liquidez.** Execuções reais (`fills.jsonl`, taxa de rede convertida com o preço do SOL do registro de patrimônio do agente, US$ 105,48, aproximação): ativo líquido (STONK) custou de 0,17% a 0,56% de ida e volta com tudo incluído (6 pares, média cerca de 0,42%), HOTBOT 1,82% (1 par), e a cotação de entrada de um candidato com cerca de US$ 37 mil de liquidez foi de −2,09% a −2,14% só na entrada. A frase da seção 2 "girar o caixa a cada minuto não paga o atrito" vale para ativos rasos; para os líquidos, com atrito de 0,5%, 43% dos movimentos de 1 minuto e 57% dos de 5 minutos o superam, e o obstáculo é prever a direção (ver `ANALISE-10X-EM-24H-20261015.md`, seção 1.3). A taxa de rede cotada (`k`, US$ 0,0005) é cerca de 20 vezes menor que a medida no recibo (97.859 lamports, cerca de US$ 0,0103).
2. **Tokens do modelo não são o custo que importa.** A entrada do Jev é publicada a US$ 0,042 por milhão de tokens e a saída é grátis (registrado pela Codex em 2026-10-14; a aplicação à conta não foi confirmada): 1.440 consultas por dia de 15,6 mil tokens custariam cerca de US$ 0,94 por dia. O limite real é a cota da conta, ainda desconhecida, e o teto local de 720.

## 7. Correção do auditor e interpretação da cadência (2026-10-16)

Um `cycleId` pode gerar mais de uma linha `kind: cycle`: o agente persiste a fase protetora antes das ordens e pode persistir depois a decisão do modelo com o mesmo ID e instante de início. Contar essas linhas como decisões distintas infla o total e introduz intervalos artificiais na cadência. Isso, isoladamente, não prova concorrência, reenvio ou colisão de IDs.

`scripts/observe-24h.ts` agora usa `dedupeCycles` para a contagem, os outcomes, a cadência, os silêncios e a recuperação. A última fase válida de cada ID define o resultado; registros futuros são excluídos antes dessa seleção. IDs diferentes no mesmo instante continuam sendo ciclos diferentes. Linhas legadas sem ID são preservadas separadamente, sem inventar uma identidade pelo timestamp.

O relatório distingue `total`, `rows`, `uniqueIds`, `duplicateRows`, `legacyRows` e `future`. Os três primeiros significam, respectivamente, ciclos canônicos incluindo observações legadas, linhas válidas na janela e IDs distintos conhecidos. Portanto `total` não prova consultas ao JEV: um ciclo pode manter, bloquear, proteger a carteira ou não consultar o modelo.

A correção foi exercitada com um snapshot real do journal, sem chamadas ao JEV nem transações. A regressão está em `scripts/observe-24h.test.ts`. Isso não atualiza o artefato instalado nem corrige retroativamente relatórios antigos.

Para o objetivo de um minuto, separar três demandas: 1.440 observações locais em 24 horas, 1.440 consultas principais se houver uma consulta por observação e uma quantidade independente de ordens. Fechamentos e fallback podem consumir chamadas adicionais. Um timer encadeado após o trabalho anterior não garante inícios igualmente espaçados.

O limite salvo em configuração não é necessariamente o efetivo sob `auto`; o código deriva capacidade a partir do ritmo e do perfil. Não apresentar 144 ou 720 consultas como a cota contratual ou o limite vigente do artefato sem evidência. Preço publicado, tokens comprometidos e fatura real também são grandezas distintas.

Observar a cada 60 segundos não autoriza aumentar gasto, assinar ordens, financiar gas ou alterar risco. Manter resultado incerto como desconhecido, nunca como falha presumida para reenvio. Patrimônio marcado, cash flow e markouts contrafactuais não comprovam lucro líquido; preços ausentes, taxas atribuíveis, câmbio e fluxos externos precisam de cobertura explícita.

