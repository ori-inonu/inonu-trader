# Sinais OKX no GEV

O GEV pode pesquisar compras observadas de Smart Money, Influencers e Whales pela API Market Signals do OnchainOS. O relatório preserva a identidade rede + contrato, o horário do evento, o horário de recebimento, valores históricos em USD, titulares e concentração quando disponíveis. É uma entrada de pesquisa para comparar oportunidades. O módulo não recomenda operações, não define tamanho de posição e não está conectado ao executor ou ao painel da carteira.

## Usar offline

Na raiz do projeto:

```powershell
bun --no-env-file run okx:signals
```

Sem flags, produz sempre o mesmo JSON sintético, sem rede ou leitura de credenciais. No Windows, se Bun não estiver no PATH, use o executável da instalação local. O modo sintético não mede rentabilidade nem confirma acesso à OKX. A fixture mostra um evento recente, outro vencido e outro incompleto.

## Consulta autenticada limitada

Somente após verificar acesso, quota e condições de cobrança da própria conta, configure `OKX_WEB3_API_KEY`, `OKX_WEB3_API_SECRET` e `OKX_WEB3_API_PASSPHRASE` no ambiente do processo. Não salve esses valores no relatório ou em arquivos versionados. Conectar a extensão Wallet não fornece autenticação dessa API. O comando não carrega `.env` quando executado como indicado.

```powershell
bun --no-env-file run okx:signals --live --chain 56 --wallet-types 1,2,3 --limit 10
```

`56` é um exemplo, sujeito à cobertura retornada pela OKX. `1` seleciona Smart Money; `2`, Influencer; `3`, Whale. Todas as opções são obrigatórias em live. O limite aceito é de 1 a 100. O cliente consulta cobertura e, se houver uma única entrada para a rede, uma página de sinais. Não faz paginação, repetição automática ou pagamentos. Cada consulta tem prazo total de 5 segundos, incluindo a leitura da resposta, e recusa redirecionamentos. Nunca envia ordens, claims, transferências ou assinaturas de carteira.

O corpo enviado é objeto `{chainIndex,walletType,limit}`, com valores string, conforme o [cliente oficial fixado neste commit](https://github.com/okx/onchainos-skills/blob/cfbb0bafa71898e50762cd9fa77f026b4a8caa1b/cli/src/commands/signal.rs#L133). O [exemplo REST](https://web3.okx.com/onchainos/dev-docs/market/market-signal-list) mostra um array contendo um objeto. Essa divergência permanece registrada: os testes locais verificam o contrato escolhido, mas nenhuma compatibilidade autenticada com a conta real foi comprovada. Acesso, quota restante e custo observado permanecem desconhecidos no relatório, inclusive após uma resposta válida.

## Interpretar o relatório

Cada item é `buy_observation`, uma compra histórica agregada observada pelo provedor, e sempre `execution=not_qualified`. Preço e volume históricos não são cotação executável atual. Capitalização fica fora da lista de campos exportados desta versão. Não há projeção de lucro, APY ou valor sugerido para investir.

O timestamp é Unix em milissegundos, conforme a [referência oficial CLI](https://github.com/okx/onchainos-skills/blob/cfbb0bafa71898e50762cd9fa77f026b4a8caa1b/skills/okx-dex-market/references/signal-cli-reference.md#L111). A tabela REST não explicita essa unidade e descreve categorias textuais; o módulo admite as categorias numéricas documentadas no CLI e `SMART_MONEY`, `INFLUENCER`, `WHALE`. Tipos inesperados continuam `unknown`. Timestamp inválido continua null; não é substituído pelo recebimento local.

Atualidade é julgada no recebimento: até 60 segundos, `fresh`; mais antigo, `stale`; posterior ao recebimento, `future`; inválido, `unknown`. Essa janela é uma regra de pesquisa local sem calibração empírica e não indica probabilidade de lucro. Mesmo um sinal fresh continua sem autorização para execução. A latência da API e os relógios locais podem limitar essa avaliação.

O relatório exclui carteiras acionadoras, cursor, logos e campos arbitrários da resposta. Preserva texto decimal financeiro válido sem conversão para ponto flutuante; dados ausentes ou inválidos continuam null. Identidades EVM usam a lista explícita de redes do projeto; Solana e redes desconhecidas preservam caixa. Endereços Solana devem decodificar em exatamente 32 bytes, conforme a [documentação oficial](https://solana.com/docs/core/accounts). O formato de um endereço não prova existência, autenticidade ou segurança do contrato.

Uma única página não é histórico completo. Não demonstra taxa de acerto, saída de posições, retorno realizado ou ausência de viés. `top10HolderPercent` e titulares são contexto descritivo; não medem sozinhos controle dos insiders, manipulação ou possibilidade de vender. Um filtro de liquidez da API, mesmo quando disponível, não prova liquidez executável de saída.

## O que falta para uma decisão financeira

Para cada rede e contrato, o projeto ainda precisa unir dados atuais e verificáveis de liquidez, segurança, cotação de compra e venda, impacto de preço, slippage, gas, taxas, latência e inventário. A saída deve ser exercitada com custos completos em simulação e reconciliada com resultados observados. Juros compostos só podem usar patrimônio e ganhos líquidos reconciliados, incluindo perdas e custos; somar retornos hipotéticos de sinais não faz esse cálculo.

O caso relatado de US$68 para US$6.700 não foi verificado e não serve como baseline, expectativa ou critério de aceitação. Crescimento exponencial não é resultado demonstrado por esta integração.

| Recurso do ecossistema | Estado no projeto e próxima evidência necessária |
| --- | --- |
| Meme Pump | Scanner separado já existe para pesquisa. Estágio do token precisa ser combinado com pools, segurança e saída executável; um pump observado não comprova oportunidade restante. |
| Smart Money / Influencer / Whale | Este módulo acrescenta observações agregadas de compra. Histórico, causalidade, saídas e desempenho líquido continuam sem qualificação. |
| Alpha Radar e filtros da Wallet | A tela e os filtros não demonstram uma API pública equivalente. É necessário identificar fontes e contratos documentados antes de automatizar essas funções. |
| Arbitragem / DEX | A análise DEX existente preserva a resposta bruta de uma cotação e bloqueia cálculos dependentes quando a unidade de saída está desconhecida. Dois preços indicativos não demonstram duas pernas executáveis com lucro. |
| Rewards / campanhas | Elegibilidade da conta, regras, prazo, custos e risco do contrato precisam ser verificados por campanha. Não há automação de claims ou transações nesta entrega. |
| Carteira / portfólio | O painel lê uma lista limitada de ativos por rede. Isso não é portfólio consolidado nem patrimônio líquido reconciliado em USD. |
| Pools e estratégias de rendimento | APY anunciado requer análise de perda de capital, liquidez de resgate, variação de taxas e custos; não há integração qualificada aqui. |

## Fontes e verificação

Contrato e cobertura: [Market Signal List](https://web3.okx.com/onchainos/dev-docs/market/market-signal-list), [Supported Chains](https://web3.okx.com/onchainos/dev-docs/market/market-signal-chains). Autenticação: [API Access and Usage](https://web3.okx.com/onchainos/dev-docs/home/api-access-and-usage). A [tabela pública de taxas](https://web3.okx.com/onchainos/dev-docs/market/market-api-fee) classifica a consulta de sinais como Premium e a cobertura como gratuita. Essa tabela não comprova entitlement, quota ou cobrança efetiva da conta; o módulo não estima faturamento real.

```powershell
bun --no-env-file test ./src/okx-signals ./scripts/okx-signals.test.ts
bun --no-env-file run test
bun --no-env-file run typecheck
```

Os testes verificam a fronteira HTTP com credenciais fictícias, assinatura, erros sanitizados, prazo total, cobertura, identidade, filtros, valores e comando offline. Nenhum teste requer carteira ou conta real. O objetivo completo de integrar o ecossistema e medir resultados continua aberto.
