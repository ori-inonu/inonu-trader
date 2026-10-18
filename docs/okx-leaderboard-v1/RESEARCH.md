# Leaderboard de carteiras OKX — pesquisa de integração

Consulta documental em 11/10/2026. Esta entrega registra um contrato público; não implementa cliente, coleta autenticada ou estratégia de negociação. O acesso, a quota e os resultados da conta do usuário continuam desconhecidos.

## Contrato observado

`GET /api/v6/dex/market/leaderboard/list` retorna até 20 registros por consulta. Exige uma rede (`chainIndex`), janela e ordenação, todas strings. `timeFrame` usa códigos "1"=1D, "2"=3D, "3"=7D, "4"=1M e "5"=3M. `sortBy` usa "1"=PnL, "2"=acerto, "3"=transações, "4"=volume e "5"=ROI. Há filtros de PnL realizado, acerto, transações e volume. `walletType` permite uma categoria entre dez; exemplos: "1"=KOL, "2"=Developer, "3"=Smart Money e "4"=Whale. A resposta inclui endereço, PnL realizado em USD e percentual, acerto por tokens lucrativos, compra média, volume, transações e três tokens de maior PnL. A unidade de `lastActiveTimestamp` não é declarada. Também não são definidos paginação, denominador do percentual de PnL ou cobertura de todos os custos. [Referência oficial da lista](https://web3.okx.com/onchainos/dev-docs/market/market-signal-leaderboard-list).

`GET /api/v6/dex/market/leaderboard/supported/chain` não recebe parâmetros e fornece identificador, nome e logo da rede. Ethereum e Solana aparecem no exemplo, que não confirma cobertura atual. Os exemplos de requisição incluem cabeçalhos de autenticação. [Referência oficial de redes](https://web3.okx.com/onchainos/dev-docs/market/market-signal-leaderboard-supported-chain).

A tabela de preços classifica a consulta de redes como Free e a lista como Premium. Para Premium, documenta 100.000 chamadas gratuitas mensais e US$ 0,0002 por chamada excedente no modelo por chamada. Pagamento x402 exige assinatura. Isso não verifica acesso nem saldo de quota da conta e não autoriza pagamento. [Preços oficiais](https://web3.okx.com/onchainos/dev-docs/market/market-api-fee).

## Implicações propostas para o GEV

As decisões abaixo são inferências de engenharia; não são garantias do provedor nem critérios congelados de uma implementação aprovada.

| Aspecto | Tratamento proposto |
| --- | --- |
| Categoria da carteira | Criar contrato próprio do endpoint. O parser existente de Signals usa 1=Smart Money, 2=Influencer e 3=Whale; reutilizá-lo mudaria o significado dos dados. Ver [parser atual](../../src/okx-signals/report.ts) e [SPEC de Signals](../okx-signals-v1/SPEC.md). |
| Identidade e origem | Associar somente por rede e endereço validado. Conservar parâmetros da consulta, resposta bruta e origem alegada; símbolo ou posição no ranking não identifica uma carteira ou token. |
| Valores e tempo | Preservar valores originais e unidade documentada. Horário de captura local e horário declarado pelo provedor são evidências diferentes; não inferir unidade pela quantidade de dígitos. |
| Cobertura | Tratar a lista como seleção parcial. Registrar janela e filtros antes da avaliação, inclusive os resultados negativos disponíveis; posição favorável não demonstra consistência futura. |
| Avaliação econômica | Usar histórico para levantar candidatos de pesquisa. Exigir preço reproduzível, segurança, cotação de saída para o tamanho pretendido e custos completos para avaliar uma oportunidade atual. |

A proposta é confrontar carteiras pesquisadas com evidências atuais de Signals e Meme Pump, conservando a proveniência de cada observação. A avaliação de uma carteira pessoal precisaria reconciliar operações, aportes, retiradas e custos próprios; o PnL de outra carteira não substitui essa medição. Retorno líquido reproduzível, liquidez executável e crescimento por reinvestimento permanecem não demonstrados.

Este contrato não comprova equivalência com Alpha Radar. A pesquisa daquela interface e suas pendências continuam em [RESEARCH de Alpha Radar](../okx-alpha-radar-v1/RESEARCH.md). O relato de US$ 68 para US$ 6.700 não foi validado nesta pesquisa e não serve como critério de retorno esperado.

## Próximo passo e dependência

Um futuro adaptador local poderia validar capturas, preservar lacunas e produzir observações para pesquisa, antes de qualquer coleta autenticada. Essa proposta exige SPEC e aceitação próprias; não amplia os critérios já aprovados do [relatório combinado](../okx-ecosystem-v1/SPEC.md).

A implementação desse relatório ainda não começou: o harness rejeitou `begin_cycle` com `stale_evidence` na revisão 46. A revisão independente identificou referências antigas em três arquivos do ciclo anterior e nenhuma operação suportada para renovar cobertura de auditoria concluída. Resolver esse mecanismo com autorização própria é dependência para o novo ciclo; o bot e seus validadores permanecem preservados.
