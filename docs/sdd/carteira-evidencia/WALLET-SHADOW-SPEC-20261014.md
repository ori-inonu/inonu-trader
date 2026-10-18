# Wallet API, Jev e comparação em sombra

Conversa: 01a136cd-3af3-7361-bd23-c23a6aeece97. Pedido humano de 2026-10-14: integrar Wallet API ao Jev, corrigir patrimônio, completar risco, liquidez e concentração e testar no navegador em sombra comparando decisões após custos com manter a carteira. Nenhuma ordem, assinatura ou transmissão autorizada nesta entrega.

## Aprovação técnica e limites

approved_by=jev_delegated. Jev Workflows receipt 9e864ee5-e38d-4789-8df6-9413c999685d, input digest bcdfa639b9f301d5886fe921c311bd4ee2b9e737b72e96dcd92b292477778d40. Choice bounded-shadow=1; split-isolated=.99; modelo jev-1.13.0, 874 tokens de entrada, 122 de saída, custo faturado desconhecido. Isto aprova desenho técnico no escopo humano, sem conceder permissões financeiras. Reutilizar readers, projeções e UI existentes; sem novo executor, polling ou banco histórico.

Critérios WAL-01 a WAL-06 de CONNECTIVITY-SPEC-20261013.md continuam imutáveis (SHA256 1fb32f0a612e25bd6df3080167718b893aaec01123f5a4bb10d9d78e31fb2913). Preservar mudanças preexistentes e reservas em tasks.md.

## Critérios adicionais verificáveis

- SH-01: total e saldos consultam tokens na mesma rede e com o mesmo filtro de risco. UI distingue total informado, soma conhecida e posições sem preço; dados ausentes nunca viram zero nem patrimônio DeFi.
- SH-02: risco observado, concentração qualificada de holders e liquidez parcial dos pools chegam ao contexto compacto da consulta de carteira ao Jev, com gaps, frescor, identidade e orçamento. Risk 0 continua desconhecido; campos ambíguos não recebem unidade inventada. O modelo continua responsável por buy/hold/sell/abstain.
- SH-03: o cliente valida campos novos e exibe decisão concisa com evidência expansível. Endereço, preços da leitura de carteira e valores das posições permanecem locais; consultas continuam explícitas, até seis ativos, canceladas quando a sessão muda.
- SH-04: uma decisão pode produzir marca local de sombra preservada na atualização manual da mesma sessão. Tamanho hipotético e moeda comparadora são explícitos. Novas leituras válidas com identidade e preço permitem comparar variação bruta com manter a mesma quantidade; leitura repetida ou vencida não produz retorno.
- SH-05: cotações são somente leitura, limitadas a no máximo seis por clique. Network fee USD não é somada novamente a gas atômico, impacto não é descontado duas vezes, taxas ausentes não são zero. Precisão/unidade de saída não qualificada ou custos incompletos mantêm líquido desconhecido. Sem lucro realizado, promessa de retorno ou execução.
- SH-06: regressões red/green, typecheck/build pertinentes, revisão independente do candidato congelado e exercício no navegador. Evidência sintética não prova lucro nem consulta da carteira real. Bloqueio de conexão deve ser declarado precisamente, sem inventar resultado live.

## Entregas e propriedade

1. architecture_audit, cópia isolada: src/inonu/portfolio.ts, src/inonu/source-onchain.ts, src/inonu/jev-model.ts e respectivos testes de carteira/projeção. Propor contrato público ao integrador antes de finalizar.
2. okx_research, cópia isolada: src/onchain-read/catalog.ts, normalizadores/tests associados; web/src/lib/wallet/holdings.ts e testes; web/src/lib/wallet/quote.ts e testes. Somente token scope/filter, quote metadata/raw amounts e percent de pools.
3. Integrador: web/src/lib/inonu/portfolio.ts, módulos locais de reconciliação/sombra e UI HoldingsPanel/HoldingsConsult. Nenhum agent/**, assinatura ou gateway de broadcast.
4. settings_review: revisão independente somente leitura de SPEC, baseline e candidato congelado; não escreve implementação.

## Modelo da sombra

Marca ideal de posição em USD não é execução: buy simula exposição hipotética explícita; sell simula retirada desta exposição; hold conserva posição. Delta bruto versus HOLD usa apenas preços posteriores frescos do mesmo ativo. Cotação apresenta custo de rede e impacto conhecidos separadamente; líquido total continua null quando saída, custos ou preço da moeda comparadora não podem ser qualificados. Não transforma o sinal em posição real.

## Fontes

- https://web3.okx.com/onchainos/dev-docs/wallet/balance-api-total-value: assetType=1 tokens e excludeRiskToken boolean.
- https://web3.okx.com/onchainos/dev-docs/market/market-token-advanced-info: risco e concentração normalizados.
- https://web3.okx.com/onchainos/dev-docs/market/market-token-top-liquidity: até cinco pools, liquidez USD parcial e percentuais.
- https://web3.okx.com/onchainos/dev-docs/trade/dex-get-quote: tradeFee é taxa de rede USD, swapMode; unidade de saída não qualificada pelo contrato local.

Inventário privado e hashes de baseline: C:/Users/gabri/.codex/tmp/wallet-shadow-01a136cd. Nenhum estado de outra conversa importado.
