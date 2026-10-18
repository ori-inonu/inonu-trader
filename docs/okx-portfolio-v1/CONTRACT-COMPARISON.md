# Comparação de contratos patrimoniais — rascunhos V e T

Preparação local a partir da pesquisa aprovada, lida em 10/10/2026 às 17:59:07.245230 UTC. **Nenhuma alternativa selecionada ou implementação aprovada.** Este documento propõe requisitos e verificações; não os certifica. Sem novas buscas, API, autenticação, leitura de código ou testes.

Fontes congeladas: [RESEARCH.md](/C:/Users/gabri/jev-trader/docs/okx-portfolio-v1/RESEARCH.md), SHA256 `3e15783a382e34a6017378064d91bcb4301e74a7eeaeac042c01a2d80092ca13`; [SOURCES.json](/C:/Users/gabri/jev-trader/docs/okx-portfolio-v1/SOURCES.json), SHA256 `eaeae2a59ca6a1bda12aeb64f3e1f11a121b3cf2d730d932dfe470e116572ef9`. Os links locais definitivos são os caminhos absolutos registrados no JSON; os hashes HTTP e locators são herdados dessa pesquisa, sem nova recuperação. Datas de publicação permanecem desconhecidas. Exemplos publicados não são respostas live.

| Dimensão | V — valuation/saldos | T — histórico parcial |
|---|---|---|
| Evidência | [S1: saldos](https://web3.okx.com/onchainos/dev-docs/wallet/balance-api-all-token-balances); grupos opcionais separados de [S3: posições agregadas](https://web3.okx.com/onchainos/dev-docs/wallet/defi-user-asset-platform-list) e [S4: detalhe](https://web3.okx.com/onchainos/dev-docs/wallet/defi-user-asset-platform-detail). | [S2: transações](https://web3.okx.com/onchainos/dev-docs/market/tx-history-transactions-by-address). |
| Utilidade documental | Observações de quantidade bruta e valores explicitamente USD informados pelo provedor. | Referências de eventos, clocks e estado técnico de transferências. |
| Identidade | Rede/token/endereço raw; protocolo e posição separados. Associação walletId/accountId e sobreposição wallet/DeFi desconhecidas. | chainIndex+txHash ancora a transação; não identifica unicamente cada movimento. |
| Unidades | tokenPrice S1 USD; alguns valores S3/S4 USD. Escalas de balance/rawBalance/coinAmount desconhecidas. | amount e txFee sem unidade/currency/payer qualificados. |
| Tempo | S1 sem clock de preço; S3 updateAt ms com conflito String/número; S4 settlementTime segundos, maturityTime desconhecido. | begin/end/txTime Unix ms; relógio local não prova frescor da fonte. |
| Cobertura | S1 até 50 redes solicitadas; seleção de risco e cobertura/protocolos incompletos devem ficar visíveis. | Seis meses; ordem descendente; padrão20, máximo20 uma rede/100 várias; cursor sem completude qualificada. |
| Retorno líquido | Não fornece custo-base, fluxos, realização e custos totais. | Não fornece ledger integral, classificação econômica de fluxos, custo-base ou custos totais. |

Os fatos da tabela referem-se às quatro fontes acima, conforme os contratos publicados arquivados; sua utilidade econômica é inferência de engenharia, não demonstração de retorno.

## Contrato comum proposto

**C1 — procedência/clocks:** um futuro relatório local identifica entrada documental ou sintética, digest, fonte/method/path, seletores raw, locator e clock local. Relógios do provedor ficam separados; nenhum dado desta preparação vira feed observado.

**C2 — fidelidade:** conservar tipos/valores originais, campo ausente ou vazio, unidade desconhecida e divergências. Nada de escalas inferidas pelo nome, tamanho numérico ou exemplo. Erro de envelope gera diagnóstico, não sucesso inventado.

**C3 — identidade/deduplicação:** digest+locator identifica uma observação local, sem certificar ativo ou movimento econômico. Repetição de payload pode ser anotada como transport_repeat, preservando procedência; não autoriza eliminar movimentos nem somar fontes.

**C4 — limites econômicos:** reportar grupos/páginas, cobertura parcial, falhas e unknowns. Patrimônio combinado, fluxo externo classificado, custos totais, PnL realizado e retorno líquido permanecem null; qualificação live/financeira permanece false.

**C5 — autorização:** os dois rascunhos não aprovam implementação, autenticação, egress, carteira, assinatura, operação, claim ou prioridade. Critérios futuros exigem revisão independente; aconselhamento Jev não concede autorização.

## V — observações de valuation/saldos

[S1](https://web3.okx.com/onchainos/dev-docs/wallet/balance-api-all-token-balances) publica GET `/api/v6/dex/balance/all-token-balances-by-address`, address e chains obrigatórios. chains diverge entre Array na tabela e descrição CSV; excludeRiskToken é String, 0 filtra/padrão publicado, 1 não filtra. Exemplo: code String “0”, data Array contendo tokenAssets. S3/S4 usam POST `/api/v6/defi/user/asset/platform/list` e `/api/v6/defi/user/asset/platform/detail`, corpo objeto; walletAddressList por rede, platformList obrigatório em S4. Exemplo S3: code numérico/data objeto; S4: code String/data Array. Esses exemplos não fixam comportamento autenticado. [S3](https://web3.okx.com/onchainos/dev-docs/wallet/defi-user-asset-platform-list), [S4](https://web3.okx.com/onchainos/dev-docs/wallet/defi-user-asset-platform-detail).

**V1 — saída:** grupos separados S1 e, opcionalmente, S3/S4, com endpoint/envelope/procedência. Grupo ausente não significa zero posições.

**V2 — seleção/associação:** conservar request, risco omitido/0/1 e conflito chains. Valores documentados por padrão não equivalem a estado observado. walletId/accountId, protocolo/rede/posição não ganham associação automática ao seletor.

**V3 — quantidades:** chainIndex/tokenContractAddress/address/symbol/balance/rawBalance/tokenPrice de S1 são strings; isRiskToken booleano. Manter balance/rawBalance raw; vazio não vira zero. coinAmount/tokenPrecision/tokenAddress em S4 são exemplares, sem escala formalizada. Proibidos saldo×preço e divisão por precisão presumida. [S1](https://web3.okx.com/onchainos/dev-docs/wallet/balance-api-all-token-balances), [S4](https://web3.okx.com/onchainos/dev-docs/wallet/defi-user-asset-platform-detail).

**V4 — valuation:** rotular somente USD explícito: tokenPrice S1; currencyAmount/totalAssets S3; totalAssert/totalValue/yieldYesterday/totalEarnings S4. Preservar totalAssert. Níveis agregados/detalhados e wallet/DeFi não são somados. currentPrice pode ser relação entre tokens; moeda de recompensas não explicitada. Earnings não se convertem em realizado líquido. [S1](https://web3.okx.com/onchainos/dev-docs/wallet/balance-api-all-token-balances), [S3](https://web3.okx.com/onchainos/dev-docs/wallet/defi-user-asset-platform-list), [S4](https://web3.okx.com/onchainos/dev-docs/wallet/defi-user-asset-platform-detail).

**V5 — relógios:** conservar os clocks/unidades da tabela e conflito updateAt; assetStatus1 atualizado/2 atualizando. Atualizado não prova fresh. Sem política/SLA aprovado, freshness=unknown; settlementTime não substitui price_as_of. [S3](https://web3.okx.com/onchainos/dev-docs/wallet/defi-user-asset-platform-list), [S4](https://web3.okx.com/onchainos/dev-docs/wallet/defi-user-asset-platform-detail).

**V6 — cobertura:** desconhecida além do recorte/seleção; exemplo DeFi parcial e ausência de paginação documentada não provam totalidade. Flags de suporte/claim não estabelecem elegibilidade pessoal. Variação entre observações não determina lucro/perda realizada. [S1](https://web3.okx.com/onchainos/dev-docs/wallet/balance-api-all-token-balances), [S3](https://web3.okx.com/onchainos/dev-docs/wallet/defi-user-asset-platform-list), [S4](https://web3.okx.com/onchainos/dev-docs/wallet/defi-user-asset-platform-detail).

## T — observações de histórico parcial

[S2](https://web3.okx.com/onchainos/dev-docs/market/tx-history-transactions-by-address) publica GET `/api/v6/dex/post-transaction/transactions-by-address`. Query String: address obrigatório; chains CSV até50, tokenContractAddress, begin/end, cursor, limit opcionais. Contrato vazio seleciona nativa; omitido, todos. Exemplo usa addresses; envelope code String “0”, data Array com cursor/transactionList; tabela nomeia transactions.

**T1 — seleção/saída:** páginas/eventos com origem, intervalo, cursor/caps da tabela; limites publicados separados do número observado. T é histórico parcial, não ledger completo.

**T2 — conflitos:** declarar variantes table_transactions/example_transactionList e contract_conflict. Não aliasar, concatenar ou escolher silenciosamente; arrays raw podem aparecer em grupos diagnósticos separados. addresses do exemplo não resolve address da tabela. Canonicalização depende de evidência adicional.

**T3 — identidade:** conservar chainIndex/txHash/tokenContractAddress/symbol/from/to/methodId/nonce. Um txHash pode estar em rede distinta ou conter vários movimentos; sem ID econômico documentado, nenhuma deduplicação por hash de transação. Locator local não supre esse ID.

**T4 — unidades/custos:** preservar amount/from/to.amount/txFee raw e unidades/currency/payer unknown. Taxa vazia/omitida não é zero; nem failure prova custo zero. Não somar taxas/quantidades nem converter USD.

**T5 — clocks:** begin/end/txTime Unix ms conforme fonte. Ausência/invalidez gera time_unverified; clock de importação não prova precisão ou frescor. Política de freshness permanece dependência.

**T6 — movimentos econômicos:** preservar success/fail/pending e estados desconhecidos; fail/pending não entram em realizado. itype String0 externa da moeda nativa/1 interna de contrato/2 token descreve técnica; não prova aporte externo. Depósito/saque/transferência própria exigem fronteira patrimonial verificável.

**T7 — cobertura/paginação:** seis meses não cobrem aquisição histórica integral. Guardar cursor/página/erro/repetição; cursor vazio, cap ou página final não provam completude econômica. Cursor repetido/falha posterior bloqueia alegação de montagem completa.

**T8 — resultado:** não calcular reconciliação/custo-base/PnL/retorno; faltam identidade de movimento, unidades, fronteira, realização, cobertura e custos totais. Todos os fatos de T1–T8 estão vinculados a [S2](https://web3.okx.com/onchainos/dev-docs/market/tx-history-transactions-by-address); os comportamentos fail-closed são requisitos candidatos de engenharia.

## Verificação independente proposta, não executada

O JSON liga 19 requisitos a 16 casos possíveis. Casos comuns: procedência sintética/documental, unidade/tipo ausente e coincidência de identidade entre fontes. V: envelopes heterogêneos; seleção/associação ambígua; rawBalance vazio/precisão exemplar; USD versus relação entre tokens; clocks s/ms e updating; cobertura parcial/variação temporal. T: caps20/100; cada variante e ambas listas; hashes iguais em redes ou movimentos distintos; taxas vazias; clocks inválidos; fail/pending/itype; cursor repetido, vazio ou página com erro.

Aceitação: valores raw e diagnósticos preservados; nenhum alias, scaling, união econômica ou retorno fabricado. Fixtures podem verificar estes comportamentos locais, sem provar contrato live. Falhas não autorizam enfraquecer requisitos.

## Dependências e superfície de mudanças

V depende de unidades/clock de valuation, associação e sobreposição de posições; T depende adicionalmente de variantes de schema, unicidade de movimento e cobertura histórica. Ambos precisam de fronteira patrimonial, aportes/saques, custo-base, realização e custos totais para qualquer cálculo econômico posterior. Algoritmo auth, acesso/tier, quota, preços e consumo não foram qualificados.

Superfície demonstrável atual: somente estes dois documentos privados. Parser/relatório/fixtures são responsabilidades futuras propostas; arquivos, comandos e seams do projeto não foram inspecionados, portanto não se afirma custo, tamanho ou reaproveitamento. A próxima escolha permanece aberta. Modelo/tier/sandbox efetivos desconhecidos; configuração exigida Sol6.1/xhigh.

