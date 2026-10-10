# Sinais OKX: observações históricas para pesquisa

Objetivo autorizado: ampliar o GEV usando evidências do ecossistema OKX para comparar oportunidades, liquidez, risco e retorno líquido. Esta entrega adiciona uma fonte de observações; não conclui o objetivo completo nem demonstra rentabilidade.

Baseline: cópia isolada dos arquivos TypeScript, scripts e configuração atuais. O manifesto de hashes acompanha esta SPEC. Nenhuma alteração preexistente pode ser revertida. Novos arquivos pertencem ao integrador em `src/okx-signals/`, `scripts/okx-signals.ts`, `docs/okx-signals-v1/`; somente uma entrada de comando em package.json e uma referência no README são seams compartilhados permitidos.

Fontes primárias: [REST sinais](https://web3.okx.com/onchainos/dev-docs/market/market-signal-list), [chains](https://web3.okx.com/onchainos/dev-docs/market/market-signal-chains), [cliente oficial em commit fixo](https://github.com/okx/onchainos-skills/blob/cfbb0bafa71898e50762cd9fa77f026b4a8caa1b/cli/src/commands/signal.rs#L133) e [schema CLI](https://github.com/okx/onchainos-skills/blob/cfbb0bafa71898e50762cd9fa77f026b4a8caa1b/skills/okx-dex-market/references/signal-cli-reference.md#L111). Corpo objeto segue o cliente oficial; o exemplo REST array é uma divergência registrada. Nenhuma compatibilidade autenticada foi comprovada.

## Critérios de aceitação

- S1: Sem flags, CLI produz relatório JSON determinístico, marcado synthetic, sem rede, leitura de credenciais ou .env. O comando usa Bun --no-env-file.
- S2: Modo autenticado só ocorre com --live, chain, wallet-types e limit explícitos e válidos, credenciais completas no ambiente do processo, destino fixo OKX, dois endpoints permitidos, no máximo uma consulta de cobertura e uma página de sinais. GET /api/v6/dex/market/signal/supported/chain; POST /api/v6/dex/market/signal/list, corpo objeto {chainIndex,walletType,limit}, todos strings. HMAC SHA256 Base64 de timestamp ISO + método + path + corpo exato. Sem retries, pagamentos, ordens, assinaturas de carteira, claims ou paginação automática.
- S3: Cobertura é consultada antes da página; ausência/ambiguidade da chain interrompe antes de consultar sinais. Resposta deve ter code=0 e data array; registros de outra chain, contrato inválido, categoria conhecida fora do filtro solicitado ou cardinalidade acima do limite solicitado interrompem a página. Normalização só ignora caixa em chains EVM explicitamente conhecidas; Solana e desconhecidas preservam caixa.
- S4: Normalizador admite apenas campos necessários de contrato, symbol/name, horário observado e do evento, categoria de carteira, preço/volume históricos USD, concentração e número de titulares. Não exporta endereço de carteira acionadora, cursor, logo, campos arbitrários ou resposta bruta. Valores financeiros preservam texto decimal válido; desconhecidos continuam null.
- S5: Timestamp inteiro seguro é interpretado como Unix ms pela referência oficial explícita. Mapeamento 1=Smart Money,2=Influencer,3=Whale segue a referência CLI; também aceitar SMART_MONEY/INFLUENCER/WHALE da tabela REST. Tipo inesperado permanece unknown. Timestamp inválido permanece unknown, sem inferência pela quantidade de dígitos ou substituição pelo recebimento local. Eventos vencidos e futuros não podem parecer atuais. Filtro de liquidez não demonstra liquidez de saída.
- S6: Todo registro é buy_observation histórica e execution=not_qualified. Não gera recomendação de compra/venda, lucro esperado ou decisão de alocação. Liquidez atual/saída, risco do contrato, cotação executável, custos e possibilidade de venda são evidências pendentes explícitas. Quota, acesso e custo efetivo da conta são desconhecidos; preço público não representa custo observado.
- S7: Cada request e leitura do corpo compartilham prazo de 5s por padrão, limite configurável de teste de 1..30000ms, redirect=error, erros sanitizados, sem corpo/URL externa/header/segredo em mensagens. Sem retry em 402/429 ou outros erros. Testes cobrem assinatura e métodos, timeout/corpo pendente, ausência de cobertura, schema/identidade, erro do provedor e entradas inválidas antes de fetch.
- S8: Guia em português mostra execução offline, comando live explicitamente limitado, fontes e divergências, estado das demais integrações OKX e limites financeiros reais. Verificar testes existentes e novos, typecheck estrito, CLI offline; revisões independentes de especificação e padrões sem acesso a credenciais; integrar só arquivos próprios e seams mínimos após revalidar hashes.

## Seams de teste

1. `collectSignals` recebe um cliente somente leitura e produz relatório público sanitizado.
2. `createSignalsClient` recebe fetch injetado e credenciais de teste; observa requests e respostas via fronteira HTTP.
3. Processo `scripts/okx-signals.ts`, ambiente de teste mínimo e --no-env-file; observa stdout/stderr/exit status.

Política local de atualidade: janela explícita de 60 segundos e tolerância futura zero, parâmetros de pesquisa não calibrados. Página única e até 100 registros; exemplo live usa 10. Nenhuma soma de retorno/juros compostos nesta fonte.

TDD: um comportamento falhando, implementação mínima, verificação, próximo comportamento. Sem alterar critérios independentes para aceitar um teste. Design e seams requerem a decisão delegada real antes de escrever testes.
