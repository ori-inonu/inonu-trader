# Evidência TDD — scanner OKX Web3

Conversa: 01a1216a-c46b-72f3-b3dc-24c79470308d. Implementação isolada em C:/Users/gabri/.codex/tmp/jev-trader-01a1216a/okx-ecosystem. Bun 1.3.14. Não foram lidos arquivos .env ou executadas consultas autenticadas.

Baseline anterior ao código novo: 23 pass, 0 fail, 79 expect em 7 arquivos; typecheck exit 0. Interfaces públicas confirmadas por Jev Workflows no recibo d7fe122c-6c2f-43b2-9640-22f41c17e340. Critérios E1–E8 congelados na SPEC SHA-256 13ba216cca87b8fd139d95895cd84a30df536788602fa4679201b8307aa856cb, com correção factual de transporte em errata separada.

## Ciclos observados

Os testes usaram exclusivamente interfaces públicas. Falhas observadas antes da implementação ou correção:

- Normalização: módulo ausente; unidade percentual retornava null em vez de 1.2; identidade EVM com caixa diferente não correspondia. Implementação em etapas terminou com 3 testes passando.
- Triagem e custos: exports ausentes antes dos respectivos comportamentos; implementação terminou com 5 testes passando.
- Identidade de lista/advanced/pool: teste esperava null, recebeu símbolo WRONG de outra identidade. Correção terminou com 6 testes, 47 expect passando.
- Scanner público ausente: 0 pass, 1 fail, 1 error. Primeiro comportamento finito terminou com 1 teste, 7 expect passando.
- Preços duplicados: teste esperava null, recebeu 1; depois o estado desconhecido foi classificado bloqueado por correspondência ampla de texto. Lista de outra rede também produzia um item indevido. Correções terminaram com 3 testes, 25 expect passando.
- CLI offline ausente: processo esperado exit 0 recebeu exit 1. CLI implementada: 1 teste, 8 expect passando. Credenciais faltantes esperavam exit 1 e receberam exit 0 antes do gate; correção terminou com 2 testes, 44 expect passando.
- Lista duplicada: 3 pass, 1 fail, 26 expect; eram produzidos dois candidatos para uma identidade repetida. Correção rejeita todos os itens repetidos antes de enriquecer: 4 testes, 31 expect passando, incluindo advanced duplicado desconhecido.
- Política incompleta: 7 pass, 1 fail, 53 expect; ausência de maxPriceAgeMs ainda aprovava research_candidate. Validação explícita corrigida: 8 testes, 57 expect passando. Risco 0 e holders fracionários permanecem desconhecidos.

O cálculo de seis perdas percentuais, perda total e input de custo ausente foi verificado com valores literais independentes; não há alegação de RED para casos que passaram na primeira execução. Os ciclos do cliente HTTP foram executados pelo implementador isolado e estão no documento OKX-API-TDD-EVIDENCE.md, incluindo 8 pass/3 fail antes dos reparos e 11 pass/47 expect depois.

## Resultado atual executado

Comandos na cópia isolada:

```text
C:/Users/gabri/.bun/bin/bun.exe --no-env-file test ./src
48 pass, 0 fail, 258 expect, 11 files
C:/Users/gabri/.bun/bin/bun.exe --no-env-file run typecheck
$ tsc --noEmit
exit 0
```

A suíte inclui os testes existentes pertinentes. Os testes CLI lançam o script real com diretório temporário, ambiente reduzido, credenciais fictícias e fetch bloqueado antes da rede; verificam que falta de credenciais, flags inválidas e modo offline não fazem chamadas. Não há certificação de lucro, carteira conectada, APIs live, RPS ou cobrança real. Revisão independente e integração no checkout principal seguem como etapas separadas.

## Correções após revisão e layout final

F1 da revisão independente encontrou chain malformada chegando a fetch em uso direto de listMemePump. O implementador executou RED/GREEN para todas as entradas públicas de chain; agora 13 testes e 51 expectativas do cliente passam, com zero fetch para entradas inválidas. Relatório do implementador: OKX-API-TDD-EVIDENCE.md. O relatório da primeira revisão é evidência histórica, não aprovação da versão corrigida.

O integrador identificou um segundo defeito: bufferUsd omitido retornava cenário em vez de erro. O teste público de omissão de cada um dos 12 campos produziu 8 pass, 1 fail, 69 expect, exit 1, com mensagem Received function did not throw e netUsd 5.811000000000007. Após validar explicitamente todos os campos obrigatórios: 9 pass, 0 fail, 69 expect, exit 0. Nenhum campo ausente se torna custo zero.

Após mover os módulos próprios para src/okx-market e o script para scripts/okx-market-scan.ts, a suíte isolada foi exercitada novamente: 51 pass, 0 fail, 274 expect, 11 arquivos; typecheck exit 0. A SPEC congelada manteve o mesmo hash. O mapeamento está em OKX-SCANNER-LAYOUT-ADDENDUM.md. Este resultado ainda precede a segunda revisão independente e a integração principal.

## Correções de identidade após a segunda revisão

A segunda revisão independente exigiu rejeitar advanced-info sem identidade e conservar o bloqueio por identidade incompatível detectado pelo cliente HTTP. O teste público integrado entre HTTP e scanner produziu RED: 4 pass, 2 fail, 33 expect, exit 1. Um preço de outro ativo retornava unknown em vez de blocked; advanced-info sem identidade retornava blocked em vez de unknown. O reparo adicionou OkxIdentityMismatchError com endpoint tipado e mensagem fixa, validou identidades no cliente e propagou somente essa causa como bloqueio. Erros de schema, transporte e dados ausentes continuam unknown, sem incorporar texto externo ao resultado.

O implementador executou RED comportamental do cliente: 11 pass, 5 fail, 54 expect, exit 1; depois GREEN: 16 pass, 0 fail, 75 expect, exit 0. Registro separado: OKX-API-IDENTITY-FIX.md. As duas fontes foram copiadas pelos hashes informados, mantendo E1–E8 e o hash congelado da SPEC.

Verificação do candidato integrado no workspace isolado: bun --no-env-file test ./src terminou com 56 pass, 0 fail, 311 expect, 11 arquivos, exit 0. Typecheck terminou exit 0. O CLI real, executado com --no-env-file, terminou exit 0 e retornou source=synthetic, apiCalls=9, os estados research_candidate/blocked/unknown e execution=not_qualified em todos os itens; costUsd e quotaRemaining continuaram null. São chamadas da fixture, sem tráfego de API. Esta evidência precede a terceira revisão independente e a integração no checkout principal.
