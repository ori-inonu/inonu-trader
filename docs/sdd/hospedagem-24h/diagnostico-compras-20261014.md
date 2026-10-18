# Diagnostico de compras e retorno, 14 de outubro de 2026

Leitura do processo local e dos registros da carteira gerida. Horarios abaixo em America/Sao_Paulo. Nao e recomendacao de ativo nem prova de retorno futuro.

## Causa observada das compras que nao chegaram ao executor

Na janela retida de 12 consultas `limitado`, `rank-v1/scoped-v1`, o auditor contou 84 itens de compra: 48 fechados antes da escolha, 21 recusados pelo modelo e 15 pedidos de compra. Destes 15, 13 viraram `skip` depois da escolha e dois foram mantidos. Esse recorte nao representa todas as consultas do dia. O contador diario e outra medida.

O filtro de conviccao arrojado exigia confianca 0,2, equivalente a aproximadamente 60% da distribuicao em uma pergunta de duas opcoes. Houve compras preferidas pelo modelo com 51%, 54% e 59% que esse filtro cancelou. Isso comprova interferencia posterior do codigo, mas nao prova que as compras recusadas dariam lucro. A confianca resume a distribuicao das opcoes, sem calibracao financeira demonstrada. Fonte primaria: https://docs.typesafe.ai/confidence.

O processo tinha autoridade `dinheiro`, estava conectado, sem pausa de compras, com cota disponivel. O ritmo real era de dois minutos, enquanto o heartbeat de revisao e de cinco minutos. Portanto cota esgotada, perfil conservador e ausencia de autorizacao nao explicavam essas recusas recentes.

Outro bloqueio estrutural foi identificado: `src/opportunity/sizing.ts` define `minOrderUsd: 10` como escolha do aplicativo, com justificativa de custo ainda nao medida por candidato. Para tokens marcados, a perda assumida de 100% e o risco de 2% limitavam uma carteira de aproximadamente US$ 118 a cerca de US$ 2,36 por entrada, abaixo desse piso. O levantamento do Claude nas ultimas 25 consultas encontrou 86 candidatos com carteira rastreada sem alternativa e 89 liquidos sem esse sinal com alternativa. A origem do minimo e a viabilidade economica de tamanhos menores precisam de cotacao e simulacao, sem aumentar o risco por inferencia nem afirmar que o provedor exige US$ 10.

## Execucoes reais

Recibos finalizados, vinculados ao `orderKey` e assinatura exatos, comprovam dois pares integrais na janela do ledger:

| Ativo | Caixa da compra | Caixa da venda | Diferenca antes de SOL |
| --- | ---: | ---: | ---: |
| STONK | 12 USDC | 11,947276 USDC | -0,052724 USDC |
| HOTBOT | 11 USDC | 10,848506 USDC | -0,151494 USDC |

HOTBOT foi comprado as 20h28 e vendido integralmente as 20h32 pelo modelo. A tentativa de JEANPHIL falhou na simulacao, sem assinatura. Uma escolha mantida nao equivale a ordem executada. As sete vendas antigas sem entrada conhecida nao permitem calcular lucro. Custos em SOL e outros movimentos nativos permanecem separados; `netUsd` continua desconhecido.

Na entrada de HOTBOT, a preferencia de compra foi 0,62 e a faceta `fading` foi 0,79; na saida, a preferencia de venda integral foi 0,63, com postura defensiva e `fading` 0,77. Isso evidencia uma entrada e uma reversao rapida em contexto de perda de forca. Nao revela uma justificativa causal interna do modelo. O momentum gravado repetiu os mesmos valores e idade de oito minutos nas duas consultas, coerente com o defeito de cache reproduzido abaixo.

## Defeitos e lacunas de dados

- O cache de momentum congelava a idade durante cinco minutos. Testes independentes reproduziram dado de 19 minutos ainda apresentado como 19 quando ja tinha 21, acima da validade de 20. O ajuste envelhece o fato sem novo request e invalida quando vence.
- A cotacao executavel chega depois da escolha inicial. O fechamento informado por cotacao ainda precisa de contrato, chamadas contabilizadas no mesmo budget e qualificacao. Registrar custos depois da ordem melhora evidencia, mas sozinho nao corrige a decisao inicial.
- O produtor da telemetria aceitava numeros negativos para campos sem sinal e a releitura aceitava magnitudes rejeitadas na coleta. Dois testes independentes reproduziram e depois passaram com a correcao.
- A API informa imposto `taxRate` como fracao: 0,01 significa 1%. O executor comparava o bruto com o teto numerico 5, permitindo 6% onde o teto pretendido era 5%. Dois testes independentes reproduziram erro de escala no executor e no campo percentual da telemetria.

A primeira suspeita sobre `tradeFee` foi corrigida antes da ativacao: a documentacao define USD e a fonte CLI v4.6.4 repassa esse campo. O vermelho que pressupunha unidade desconhecida nao comprova bug e foi substituido por verificacao do contrato comprovado. Gas permanece em unidade minima nativa. Fontes: https://web3.okx.com/onchainos/dev-docs/trade/dex-get-quote e `cli/src/commands/swap.rs` no commit oficial `cfbb0bafa71898e50762cd9fa77f026b4a8caa1b`.

As correcoes na fonte nao devem ser descritas como ativas antes de nova copia isolada, testes, build, selftest do executavel e substituicao por dreno normal. A atividade do agente e os resultados financeiros precisam continuar sendo medidos separadamente.

## Ativacao da revisao 17

Ativada em 2026-10-14T23:43:12.543Z, depois da saida normal da 16 e verificacao de porta livre. A copia isolada tinha 1535 arquivos sem divergencia, 1836 testes de backend e 121 do frontend do agente verdes, tipos limpos, build e selftest compilado aprovados. Configuracao, conexao e contador 109 de 720 preservados. O agente capturou 11 recibos e dois pares negativos. A correcao de frescor, registro dos gates, unidades/impostos, telemetria de cotacao e integracao dos eventos pertencem a essa versao. Eventos observam posicoes com plano; descoberta de compras por evento, decisao final informada por cotacao e mudanca do piso de US$ 10 continuam pendentes. Testes nao demonstram beneficio financeiro. A observacao de cotacao precisa ser confirmada nos registros novos.

Primeira consulta natural confirmada: `cy-mv8rdah7-4`, 2026-10-14T23:46:01Z, resposta valida, 8544 bytes, `rank-v1/scoped-v1`, hash correspondente e feedback dos dois pares negativos. O proprio modelo escolheu `skip` nas compras abertas; nenhuma ordem foi criada nesse ciclo. Contador avancou para 110 de 720 e ritmo voltou a dois minutos. Ausencia de gate de compra ou quote nessa consulta e coerente com nao haver pedido de compra; ainda nao comprova captura desses campos em uma nova operacao. Nao houve novo lucro comprovado.

Depois, a telemetria de um gate foi confirmada no ciclo `cy-mv8rjk28-c`: pedido de compra de HOTBOT alterado para skip, confianca bruta 0,02 contra barra 0,20, motivo abaixo_do_limiar, hash correspondente. Cotacao nova numa ordem e consulta antecipada por evento ainda nao foram observadas.

Em 15/10/2026 00:19 UTC (21h19 local de 14/10), o ciclo `cy-mv8sj368-1o` comprou STONK por 11 USDC. O Jev pediu `buy_full` com massa 0,91 contra 0,09 de `skip`; o gate manteve a compra, com conviccao 0,82 contra barra 0,20. A assinatura `TimJ78UmMLRJv8sa8chHRgneNmNc4MQh8dngnxQkifLpsWJDJUztdZhrQVDxb6rHnCsYSSnfGXHxJLF4KnRXiDu` foi finalizada no slot 457035329, creditou 98340913086 unidades minimas (9 decimais) e debitou exatamente 11 USDC. Taxa de rede medida: 97859 lamports. A cotacao registrada nas etapas incerta e executada informou impacto -0,01%, taxa estimada 0,0005211 USD e impostos zero. Isso confirma a telemetria nova numa ordem real e a conciliacao automatica. O valor estimado da quote nao substitui o custo medido no recibo. A posicao nao tinha saida pareada nessa observacao; nao e lucro comprovado. O caminho por evento continua sem prova de consulta antecipada.

A revisao independente do fechamento informado por cotacao, ainda em trabalho na fonte, reproduziu tres falhas: idade congelada desde o bind, taxa pequena positiva arredondada a zero e diferenca favoravel de valor tratada como custo adverso. Os tres testes independentes estao em `src/decision-review/closing-review.test.ts`. Essa fase nao esta no executavel17; corrigir os dados e registrar o Brief exato sao condicoes de qualificacao da proxima integracao.

Os tres testes passaram apos o ajuste do Claude, com seis verificacoes, em `CLOSING-REVIEW-AFTER.log`. A fonte tambem passou a guardar o Brief inteiro e o criterio, declarar cobertura parcial de custos e carregar os fatos originais do candidato. A integracao ainda esta em trabalho; isso nao comprova ativacao ou melhora financeira.

## Recompras rapidas observadas na revisao 17

Recibos finalizados consultados em 15/10/2026 00:26 UTC confirmam mais dois pares completos de STONK:

| Entrada UTC | Compra | Saida UTC | Venda | Diferenca antes de SOL | Taxa de rede do par |
| --- | ---: | --- | ---: | ---: | ---: |
| 00:19 | 11 USDC | 00:21 | 10,968904 USDC | -0,031096 USDC | 165404 lamports |
| 00:23 | 11 USDC | 00:25 | 10,982110 USDC | -0,017890 USDC | 355935 lamports |

As quatro pernas foram escolhidas pelo modelo, com preferencia de compra 0,91/0,88 e de venda integral 0,77/0,80. Nao foram saidas obrigatorias do stop. O feedback da recompra ja incluia a perda da volta de dois minutos anterior. Ha agora quatro pares completos na janela do ledger, todos negativos antes de SOL, somando -0,253204 USDC. Mais execucoes nao demonstraram melhor retorno.

Os Briefs revelam uma assimetria: na compra, STONK tinha lista de marcas vazia e familia seguranca; na manutencao seguinte, tinha uma marca de risco e dois sinais positivos. O scan de compra fica em cache por dez minutos quando quente ou trinta normalmente, podendo ser servido por ate duas horas se a atualizacao falhar. A fonte produz estado de risco conferido/nao conferido e metadados por candidato, mas o leitor do agente conserva somente os fatos, perdendo essa qualidade. Logo, lista vazia nao permite concluir que o risco foi conferido e estava ausente.

Uma leitura atual pelo gateway, as 00:27 UTC, encontrou `dev_com_rug` entre sinais positivos, em resposta em cache havia cerca de seis minutos. Isso e compativel com a marca apresentada na manutencao, mas nao reconstrui os flags historicos nem prova causalidade da venda. Sao necessarios dados de risco, idade, qualidade e memoria de decisao coerentes por ativo antes de decidir a reentrada. Nao foi criado veto por ativo, bloqueio de tempo ou operacao manual.

Atualizacao as 00:35 UTC: mais um par confirmado acrescentou perda de 0,031507 USDC e 256126 lamports de taxa de rede. O total passou a 17 fills e cinco pares completos, todos negativos antes de SOL, somando -0,284711 USDC. A revisao17 seguia conectada, sem pausa ou ordem pendente, com 16 consultas de 720 no dia UTC e ritmo de dois minutos. O fechamento novo permanecia na fonte em trabalho.

## Medicao do piso de compra e continuidade diaria

Em 2026-10-14T23:59:48Z, tres leituras de cotacao pelo gateway existente aceitaram entradas de 2, 5 e 10 USDC para o mesmo candidato com 12 carteiras rastreadas e liquidez registrada de aproximadamente US$ 37 mil. Rede, par, quantidade de entrada e decimais conferiram; respostas sem cache antigo. Isso contraria um minimo universal de US$ 10 na API de cotacao para esse caso, sem demonstrar execucao nem viabilidade economica de uma ordem menor.

As taxas anunciadas foram 0,0005206 USD nos tres tamanhos, mas a diferenca percentual de valor cotada na entrada foi -2,09%, -2,11% e -2,14%. Saida, aluguel de contas, custo total e retorno permanecem desconhecidos. A quantidade de saida continua com unidade nao qualificada; nenhuma perna reversa, simulacao ou ordem foi enviada. O piso nao foi alterado.

Na virada de 15 de outubro em UTC (21h do dia 14 no horario local), o processo reiniciou automaticamente o contador para 0 de 720. A consulta natural `cy-mv8rx88v-u`, 00:01:31Z, consumiu 1 de 720 sem interromper conexao, autoridade ou o ritmo de dois minutos. Isso verifica uma virada real, sem provar 24 horas sem falhas.

Uma simulacao offline da politica real de budget mostrou que 720 chamadas cobrem 720 consultas simples de dois minutos. Se todos esses ciclos pedissem tambem uma ou duas fases extras, o mesmo budget aceitaria 685 consultas primarias e 35 extras, com recusas das demais pela politica de distribuicao diaria. Trata-se de um cenario sem falhas ou duracao de ciclo, nao previsao do uso real. O fechamento precisa contabilizar cada request no mesmo budget, inclusive fallback; nenhum limite real foi aumentado.

Leituras publicas de contas em 15 de outubro UTC encontraram 0,00629483 SOL na carteira e nenhuma conta de token dessa carteira para o candidato pequeno estudado. O mint e Token-2022, portanto nao foi aplicado um aluguel de conta legacy de 165 bytes. O custo da conta e da rota continua sem medida. Os mints do candidato cotado, de uma tentativa que falhou e de HOTBOT, que foi negociado com recibos confirmados, compartilham o programa Token-2022 e as extensoes de metadados observadas. Isso nao permite atribuir a falha ao programa nem criar veto por esse tipo. Esses fatos ainda nao alimentam o modelo. [Layout e extensoes oficiais](https://www.solana-program.com/docs/token-2022).
