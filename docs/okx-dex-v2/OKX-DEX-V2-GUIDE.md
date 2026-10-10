# Consultas DEX do Inonu Trader

Este módulo consulta cobertura de rede e duas cotações sequenciais A→B→A. Não envia transações. Uma diferença positiva entre quantidades cotadas não comprova arbitragem executável nem lucro: o mercado pode mudar entre as pernas, a unidade atômica do fornecedor ainda depende de qualificação, e custos externos permanecem desconhecidos.

## Uso local

`bun run okx:dex-quote` usa `bun --no-env-file` e apresenta um exemplo inteiramente sintético, sem rede nem leitura automática de `.env`. Os contratos fictícios não representam ativos de investimento. A entrada é 1.000.000 unidades, a saída cotada 995.000 e o delta bruto -5.000; `netAtomic=null`, `liveQualified=false` e `execution=not_qualified` em todos os relatórios de cotações.

`bun run okx:dex-quote --help` descreve as opções. A consulta autenticada exige `--live`, `--chain`, `--token-a`, `--token-b`, `--decimals-a`, `--decimals-b`, `--metadata-source-a`, `--metadata-source-b` e `--amount-atomic`. Os tokens são contratos públicos de ativos na mesma rede; não use endereço pessoal de carteira. A quantidade deve ser uma string inteira positiva em unidades atômicas, até 78 dígitos, e os decimais devem ser verificados em fonte explícita. Em Solana, a caixa do endereço é significativa.

As três variáveis do processo são `OKX_WEB3_API_KEY`, `OKX_WEB3_API_SECRET` e `OKX_WEB3_API_PASSPHRASE`. Não são a chave do JEV nem uma chave privada de carteira. O comando rejeita parâmetros incompletos, repetidos ou desconhecidos e credenciais incompletas antes da rede. Esta entrega não executou consulta autenticada: conta, permissão API, assinatura/plano e quota disponíveis não foram comprovados. Custos e quota desconhecidos são `null`.

## O que é validado

São no máximo três GETs para `web3.okx.com`: cobertura e duas quotes, com `swapMode=exactIn` e `singleRouteOnly=true`, assinatura HMAC, redirecionamentos recusados e sem retry. O cliente espaça inícios em 1.100 ms e limita HTTP e leitura JSON a 10 segundos por chamada. Isso não comprova o limite da conta. A análise aplica duração local total de 5 segundos e magnitude de impacto até 1%, incluindo impacto negativo válido. Esses parâmetros são controles técnicos locais, não recomendação de exposição financeira nem garantia de atualidade do preço.

Cada quote deve identificar rede, modo, contratos, decimais e quantidade de entrada exatos. A segunda entrada é exatamente a primeira saída, preservada com `BigInt`. Cobertura ausente/ambígua, resposta múltipla, identidade divergente, relógio inválido, honeypot ou impacto desconhecido impedem a análise dependente. Imposto ausente permanece desconhecido. Uma avaliação negativa de honeypot não garante que seja possível vender o token.

`tradeFee` é estimativa em USD; `estimateGasFee` é estimativa em unidade mínima do ativo nativo. São mantidas separadas, sem soma nem conversão. Não se deduzem impostos, LP, hooks ou infraestrutura novamente supondo que não estejam no output. O relatório não infere custos completos nem PnL realizado.

`hypotheticalRoundTripEconomics` é uma função separada para hipóteses manuais: entrada, saída, custos externos e buffer devem ser inteiros explícitos na mesma unidade A. Só marca `eligible` quando o resultado hipotético líquido excede estritamente o buffer. `coverageVerified=false`: a completude de custos é uma suposição do chamador. Não há ligação automática dessa hipótese com quotes autenticadas, JEV, ordens ou saldo.

## Identidade de rede e caixa do contrato

A identidade do contrato é normalizada para minúsculas somente nas redes que a documentação oficial da OKX enumera como EVM: `1`, `10`, `56`, `130`, `146`, `196`, `137`, `42161`, `43114`, `324`, `1101`, `8453`, `59144`, `250`, `5000`, `1030`, `1088`, `4200`, `81457`, `169`, `534352`, `25` e `7000`. Em TRON (`195`), Solana (`501`), SUI (`784`), TON (`607`) e qualquer chainIndex futuro ou desconhecido, o cliente preserva a string e compara a caixa exatamente. A validação de identidade não pretende validar checksum nem o formato completo de um contrato.

Essa política mantém, por exemplo, a grafia pública TRON `TJRabPrwbZy45sbavfcjinPJC18kjpRTv8`. A documentação TRON descreve endereços Base58Check; a grafia é parte do identificador. O CLI aplica a mesma regra ao detectar tokens duplicados, sem buscar credenciais ou rede para rejeitar um par idêntico.

Fontes oficiais: [redes suportadas pela OKX](https://web3.okx.com/onchainos/dev-docs-v5/dex-api/dex-supported-chain) e [codificação de endereços TRON](https://developers.tron.network/docs/encoding).

## Fontes e etapas seguintes

O contrato foi investigado nas páginas oficiais de [quote DEX](https://web3.okx.com/onchainos/dev-docs/trade/dex-get-quote), [redes suportadas](https://web3.okx.com/onchainos/dev-docs/trade/dex-get-aggregator-supported-chains) e [taxas API](https://web3.okx.com/onchainos/dev-docs/trade/api-fee). A pesquisa preservada identifica ambiguidades de unidade, custo, exemplos de rede e ausência de timestamp/TTL de mercado; os testes não eliminam essas dependências.

Próximas entregas precisam qualificar dados históricos e avaliação fora da amostra; futuros demo exigem integração própria com a conta da corretora e modelos de funding, margem e liquidação. OKX Web3 Wallet e conta OKX Exchange são superfícies distintas. Propostas de transação, aprovações, assinatura e envio permanecem uma etapa separada, com confirmação explícita na carteira e requisitos próprios. Nenhum endpoint financeiro é utilizado neste ciclo.

O relato de US$68 para US$6.700 em um dia continua não verificado: não recebemos histórico independente de transações, custos, perdas e exposição. Ele não é critério de desempenho. Esta entrega não demonstra retorno constante nem transforma rapidez de inferência em vantagem financeira comprovada.
