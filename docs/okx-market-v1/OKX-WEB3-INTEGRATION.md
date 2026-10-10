# Inonu Trader — integrações OKX Web3

Estado em 9 de outubro de 2026: scanner local de pesquisa e cenários de custos implementados e testados com dados sintéticos. Não foi feita consulta autenticada neste ciclo, nem assinatura, ordem ou transferência. A conexão da extensão OKX, acesso à Open API e execução de swaps são capacidades distintas. O saldo informado pelo usuário não foi consultado.

## Executar a demonstração

No diretório do projeto, com Bun instalado:

```powershell
bun --no-env-file run okx:market-scan
bun --no-env-file run scripts/okx-market-scan.ts --help
```

Sem argumentos, a saída JSON usa exclusivamente uma fixture sintética, com horário fixo e três ativos fictícios. Ela exemplifica `research_candidate`, `blocked` e `unknown`. Não representa preços atuais nem oportunidades reais. Todos os resultados têm `execution: "not_qualified"` e `liveQualified: false`.

O comando não lê arquivos `.env`. As variáveis do processo são usadas somente quando `--live` é informado. A configuração do trader existente e sua chave privada não são usadas pelo scanner.

## Acesso à API e consulta opcional

São necessárias credenciais próprias de projeto no portal de desenvolvimento OKX Web3: `OKX_WEB3_API_KEY`, `OKX_WEB3_API_SECRET` e `OKX_WEB3_API_PASSPHRASE`. A chave JEV e as credenciais da OKX Exchange não substituem estas credenciais. O [contrato de autenticação](https://web3.okx.com/onchainos/dev-docs/home/api-access-and-usage) exige timestamp e assinatura HMAC da requisição exata. O exemplo `OKX-WEB3-ENV.example` contém apenas nomes vazios; configure os valores no ambiente local do processo, sem colocá-los em Git, logs, frontend ou prompts.

Antes de pesquisar, obtenha a cobertura real com a interface pública `createOkxReadOnlyClient(...).protocols()`. Esse método consulta apenas [redes e protocolos Meme Pump](https://web3.okx.com/onchainos/dev-docs/market/market-memepump-get-supported-chains-and-protocols), com autenticação local. Escolha um `chainIndex` e um `protocolId` presentes nessa resposta. Não reutilize o ID `fixture` da demonstração nem suponha suporte a Monad ou X Layer. A CLI não escolhe protocolo ou rede automaticamente.

Com credenciais, acesso e protocolo verificados, a forma do comando é:

```text
bun --no-env-file run scripts/okx-market-scan.ts --live --chain CHAIN_INDEX --stage NEW --protocol PROTOCOL_ID --limit 1
```

Substitua os dois identificadores pela cobertura consultada. `stage` aceita `NEW`, `MIGRATING` ou `MIGRATED`; `limit` aceita 1–30 e limita o enriquecimento local. Não há `limit`, `cursor` ou endereço de carteira enviados à lista, pois estes parâmetros não constam do contrato usado. A [lista de tokens](https://web3.okx.com/onchainos/dev-docs/market/market-memepump-get-token-list) é filtrada por uma rede, um estágio e um protocolo explícitos.

Credenciais incompletas ou flags ausentes, repetidas ou inválidas encerram a CLI antes da rede. Um relatório `source: "okx_authenticated"` identifica a origem das respostas; não comprova permissão de execução, vendabilidade ou rentabilidade. Falha de cobertura interrompe a pesquisa, sem trocar de rede. Não há retry, paginação, polling contínuo ou pagamento automático.

Uma rodada não vazia faz até `3 + 2 × limit` chamadas (cobertura, lista, preços e dois enriquecimentos por ativo), no máximo 63. Com lista vazia, faz duas. O contador é local e não é uma medição de cobrança. `costUsd` e `quotaRemaining` permanecem `null`: quota, nível contratado, RPS e custo faturado da conta não foram verificados. Endpoints podem consumir créditos segundo a [tabela de custos Market](https://web3.okx.com/onchainos/dev-docs/market/market-api-fee); não habilitamos reposição ou pagamentos x402. Evite chamadas repetidas sem verificar o plano da conta.

## O que a triagem mede

O relatório mostra a política aplicada: preço com até 60 segundos, pool mínimo de US$100.000, pelo menos 1.000 holders, concentração top10 até 20% e risco máximo 2. São filtros de pesquisa configuráveis pela interface pública, sem definição de tamanho de posição ou alavancagem.

Dados de redes ou contratos diferentes não se misturam; caixa de endereços Solana é preservada. Campos ausentes, vazios, inválidos e risco 0 permanecem desconhecidos. O horário do preço vem de [price-info](https://web3.okx.com/onchainos/dev-docs/market/market-token-price-info); criação do token não comprova segurança atual. [Advanced-info](https://web3.okx.com/onchainos/dev-docs/market/market-token-advanced-info) retorna um objeto identificado, conforme a errata da SPEC congelada. Honeypot, pouca liquidez, concentração excessiva e preço antigo/futuro bloqueiam a pesquisa.

A liquidez exibida é a do maior pool válido da resposta, em USD, com associação ao token verificada. Não é profundidade vendável consolidada. Pools vazios não significam liquidez zero; percentuais de taxas desconhecidos não viram taxas gratuitas. O [endpoint de pools](https://web3.okx.com/onchainos/dev-docs/market/market-token-top-liquidity) não prova uma rota de saída para o tamanho pretendido. Mesmo um candidato exige segurança atual, saída vendável e custos reais antes de qualquer proposta financeira.

## Cenários líquidos e crescimento composto

`scenarioEconomics` recebe capital hipotético em USD, retorno bruto de saída informado pelo chamador, taxas, impostos e slippage nas duas pernas, custos fixos de rede, IA e outros, e uma margem mínima em USD. Não estima retorno a partir do preço ou da confiança JEV. As seis perdas percentuais são aplicadas sequencialmente; o valor da posição não usa o saldo da carteira.

Exemplo puramente matemático: US$100, valorização bruta de 10%, taxa de 1% na entrada e 1% na saída, impostos/slippage explicitamente zero e US$2 de custos fixos. O resultado líquido é US$5,811; custo total US$4,189 e retorno bruto de equilíbrio aproximadamente 4,071%. Com as mesmas taxas e custos, mas valorização bruta zero, a perda é US$3,99. Ausência de custo não equivale a custo zero. Os números são hipóteses, não previsão, backtest histórico ou cotação executável.

Só um líquido estritamente maior que a margem passa o filtro do cenário; ainda assim `execution` continua `not_qualified`. Crescimento composto deve contabilizar resultados realizados após todas as despesas, perdas, posições abertas, depósitos e saques. Multiplicar cenários positivos ou reinvestir lucro hipotético não demonstra crescimento da conta. O relato US$68 → US$6.700 em um dia não foi verificado; velocidade de decisão não comprova vantagem de mercado.

## Mapa do ecossistema e próximas entregas

| Recurso | Base oficial | Situação e requisito seguinte |
| --- | --- | --- |
| Meme Pump | [Lista e cobertura](https://web3.okx.com/onchainos/dev-docs/market/market-memepump-get-token-list) | Scanner e triagem disponíveis localmente; acesso real e quota ainda não qualificados. Estágio e momentum não são previsão de lucro. |
| Alpha Radar | [Descrição do produto](https://web3.okx.com/learn/onchain-weekly-22) | Ajuda a observar tokens e carteiras influentes. Não inferimos endpoint próprio ou autorização para coletar endereços pessoais a partir da interface. Integração ainda não implementada. |
| Sinais e leaderboard | [Signal API Reference](https://web3.okx.com/onchainos/dev-docs/market/market-signal-reference) | APIs documentadas de cobertura, sinais e leaderboard; requerem contrato próprio, deduplicação e avaliação fora da amostra antes de usar como estratégia. Não implementadas aqui. |
| Rewards e DeFi | [DeFi API](https://web3.okx.com/onchainos/dev-docs/wallet/defi-api-overview) | Descoberta, posições e resgate de recompensas DeFi são documentados. Campanhas/airdrops têm termos e elegibilidade próprios: não são equivalentes a uma API universal de Rewards. Exigem custos, risco de contrato e confirmação de cada assinatura; não implementados. |
| Cotações DEX | [Quote API](https://web3.okx.com/onchainos/dev-docs/trade/dex-get-quote) | Próxima entrega: ida/volta somente leitura, quantidades atômicas, rede, identidade, impostos e taxas sem dupla contagem. Sem swap ou approve automático. |
| Portfólio | [Total de ativos](https://web3.okx.com/onchainos/dev-docs/market/balance-total-token-balances) | Requer endereço autorizado e reconciliação de saldos, recibos e custos. Valores estimados/PnL da API não substituem um livro de resultados realizados. Não consultado. |
| Arbitragem | [Quote API](https://web3.okx.com/onchainos/dev-docs/trade/dex-get-quote) | Depende de rotas comparáveis, saída cotada para a quantidade comprada, custos completos, frescor e risco de execução entre pernas. Diferença entre preços não é lucro. Simulação futura separada. |
| Futuros | [OKX Exchange API V5](https://www.okx.com/docs-v5/en/) | Serviço separado da Web3 Wallet, com credenciais de Exchange, contratos/lotes, margem, funding e demo próprios. Nenhuma posição ou acesso regional foi qualificado. |
| Pix e saque BRL | [Depósito BRL](https://www.okx.com/pt-br/help/how-do-i-deposit-brl) | Fluxo da conta custodial Exchange, sujeito a cadastro e requisitos. Wallet Web3 não vira conta Pix por conexão. Depósito/saque e recebimento específico no Nubank precisam ser verificados no serviço aplicável; não automatizados. |

O Jev Workflows orienta escolhas técnicas com fatos mínimos sanitizados e recibos persistidos. Não recebe automaticamente código, transcrição, endereço ou saldo. Gates de identidade, custos, frescor, autorização e limites ficam no código local; uma recomendação JEV não libera uma transação. Wayfinder orienta a próxima melhoria dentro do objetivo já autorizado. Nenhuma API de decisão consegue garantir lucro contínuo ou eliminar risco de perda.

## Verificação reproduzível

```powershell
bun --no-env-file test ./src
bun --no-env-file run typecheck
```

Há testes da requisição HMAC, schemas, deadline incluindo o corpo HTTP, limites, normalização, triagem, custos e processos CLI sem acesso à rede. Ver detalhes em `OKX-API-TDD-EVIDENCE.md` e `OKX-SCANNER-TDD-EVIDENCE.md`. Dados sintéticos validam comportamento do software; não certificam latência em produção, lucro ou ativação financeira.
