# Onchain OS: atualização da matriz de recursos

Pesquisa em 2026-10-11. Esta matriz complementa as pesquisas anteriores; presença na documentação não demonstra integração, disponibilidade da conta ou autorização para operar. Não altera gates de execução.

## Fontes e cobertura examinada

| Família | Recursos documentados | Evidência local examinada | Próxima qualificação necessária |
| --- | --- | --- | --- |
| Wallet | Agentic Wallet, consulta de saldos, histórico, simulação e transmissão; conexão DApp | `src/okx-wallet/portfolio.ts`, `trade.ts` e catálogo central existem; existência não demonstra funcionamento live | Contratos por cadeia, timestamps, estado de transação e permissões reais. Custódia TEE descrita pelo fornecedor não certifica a segurança desta integração. |
| DeFi | Descoberta, posições, entrada/saída, empréstimo/repagamento e recompensas | `defi.ts` consulta SINGLE_EARN por símbolo, primeira página; retorna taxa e TVL, deixando custo de entrada desconhecido | Paginação, identidade exata do ativo, holdings, custos de entrada/saída, retirada, dívida e risco por protocolo. APY não equivale a retorno garantido. |
| Trade clássico | Rotas e infraestrutura de swaps | `trade.ts` possui caminhos de quote/swap e gateway; catálogo diferencia consulta e execução bloqueada | Resolver vinculação de quantidade, mínimo recebido, calldata, destinatário, router, custos e recibos antes de delegação financeira. |
| Trade por intenção | Redes, cotação, aprovação, criação, listagem, status e cancelamento de ordens | Não há caminho de intent no `trade.ts` examinado; cobertura global ainda não certificada | Adaptador separado e máquina de estados com validade, liquidação e cancelamento verificáveis. Cotação/consulta podem ser T0; criação, aprovação e cancelamento assinado exigem autorização própria. |
| Mercado | Preços, índices, tokens, sinais, Trenches, social e análise de endereço | Catálogo possui famílias de mercado e social, com limites declarados; ainda não revalidado contra todos os clientes atuais | Proveniência, moeda, freshness, cobertura temporal, plano/cota e falhas parciais. Não usar sinais sociais como execução direta. |
| Core Data | Informações de cadeias, blocos, transações, logs e endereços | Cobertura dos adaptadores deste conjunto ainda não inventariada | Suporte por módulo e endpoint; cursor completo, limites de lote, deduplicação e suporte parcial explícito. |
| Pagamentos APP | Pagamento único, batch, por uso e assinatura; integrações HTTP/Agent e SDKs | Catálogo agrupa x402/MPP; integração efetiva das modalidades ainda não demonstrada | Ledger separado de custos de serviços, destinatário/valor, teto e autorização. Compra automática de serviços não está autorizada nesta missão. Escrow aparece como Coming soon, não recurso disponível certificado. |

## Contratos que afetam a arquitetura

Core Data exige descoberta de suporte específica ao módulo e ao par `apiName`/`chainIndex`; suporte em outra família não basta. O guia usa identificação numérica de cadeia, timestamps em milissegundos e assinatura por requisição. Cursores devem voltar sem transformação, inclusive quando uma página de logs vazia tem cursor não vazio. A integração deve distinguir unsupported, falha e resultado vazio. São regras do guia, ainda não evidência de implementação local.

Pagamentos APP são uma camada de despesas e receitas por serviços, não uma estratégia de arbitragem. A avaliação do JEV deve contabilizar seus custos conhecidos junto aos demais custos operacionais, sem assumir zero quando desconhecidos. Assinaturas renováveis exigem controle próprio e não decorrem da conexão da wallet.

Descoberta DeFi é parcial no adaptador examinado: `symbolFor` sem resultado produz lista vazia; `pageNum: 1` não prova cobertura completa; a seleção SINGLE_EARN não representa todos os produtos. O parser não qualifica o custo de subscribe. Preservar esse desconhecido ao classificar elegibilidade.

## Fontes primárias consultadas

- [Wallet overview](https://web3.okx.com/pt-br/onchainos/dev-docs/wallet/product-and-service)
- [DeFi overview](https://web3.okx.com/pt-br/onchainos/dev-docs/wallet/defi-api-overview)
- [Trade overview](https://web3.okx.com/pt-br/onchainos/dev-docs/trade/dex-api-introduction)
- [Intent Swap API Reference](https://web3.okx.com/pt-br/onchainos/dev-docs/trade/dex-intent-reference)
- [Market overview](https://web3.okx.com/pt-br/onchainos/dev-docs/market/market-api-introduction)
- [Core Data usage guide](https://web3.okx.com/pt-br/onchainos/dev-docs/market/onchaindata-usage-guide)
- [Address Analysis reference index](https://web3.okx.com/pt-br/onchainos/dev-docs/market/market-portfolio-reference): índice encontrado; schemas individuais não examinados nesta atualização.
- [Payments overview](https://web3.okx.com/pt-br/onchainos/dev-docs/payments/overview)

Esta atualização examina introduções, índices e o guia Core Data, não todos os endpoints ou uma integração live. A próxima ampliação da matriz deve vincular cada contrato ao cliente, teste e estado de qualificação correspondente, preservando as lacunas acima.
