# R4: revisao de seguranca do executor do operador (snapshot de 2026-10-10)

Escopo: leitura de `src/operator/{config,plan,executor,cycle}.ts`, `src/okx-wallet/trade.ts` e `scripts/okx-operator.ts`, como estavam na arvore de trabalho em 2026-10-10 por volta das 18h30 (arquivos ainda nao commitados por outra sessao, em evolucao). Nada foi executado, assinado ou enviado. Esta revisao nao altera esses arquivos nem certifica o executor.

## Pontos fortes observados

- Vários gates independentes: `OPERATOR_EXECUTE`, `DRY_RUN=false`, `LIVE_ACK=OWN_FUNDS_RISK`, `PRIVATE_KEY` e RPC por chain. O padrao e dry run.
- O Jev so escolhe entre ids de candidatos ja elegiveis, ou `hold`; o plano e derivado de forma deterministica, com validade, `quoteHash` e `idempotencyKey`.
- O executor so aceita `dex_round_trip` em EVM, bloqueia plano expirado e `minReceiveAmount` desconhecido, e nao envia a segunda perna as cegas.
- O estado persistido reduz o endereco da carteira.

## Achados (a tratar antes de qualquer uso live)

| # | Achado | Evidencia no codigo | Risco | Controle recomendado |
| --- | --- | --- | --- | --- |
| 1 | Sem limites acumulados | Nao ha teto diario de notional, perda diaria, drawdown, cooldown, exposicao total nem kill switch. So `maxPlanUsd` e `maxCapitalFraction` por plano. | Em `--loop`, cada ciclo pode executar um plano novo ate esgotar o saldo de origem. | Livro de orcamento persistente (notional por dia, perda por dia, drawdown a partir do pico da fatia), cooldown apos falha, kill switch lido antes de cada envio. |
| 2 | Idempotencia fraca | A chave em `plan.ts` inclui `Math.floor(nowMs / planTtlMs)` e o `Set executed` e criado em memoria no CLI. | A chave muda a cada janela de 30 s e some no restart: o mesmo candidato pode ser reenviado. | Chave por candidato e tamanho, persistida em disco, com janela de reuso explicita. |
| 3 | Ida e volta nao atomica | O executor envia aprovacao e primeira perna; a segunda "requer reconciliacao" e nada bloqueia novos planos. | A primeira perna vira posicao direcional no ativo intermediario, repetida a cada ciclo. | Maquina de estados persistente por plano (perna 1 enviada, recibo confirmado, perna 2 ou desfazer) que bloqueie novos planos do par ate reconciliar. Preferir execucao atomica quando existir. |
| 4 | Calldata remoto sem allowlist | `to` do swap e `approval.to/data` vem da API e so passam por validacao de hex. | Resposta adulterada ou erro do provedor pode levar a assinar chamada arbitraria ou aprovacao ilimitada. | Allowlist de router e spender por chain, decodificar o selector, exigir aprovacao de valor exato, nunca `MaxUint256`, e simular com `eth_call` ou estimativa antes de assinar. |
| 5 | Docstring maior que o codigo | O comentario diz que a tx preparada e conferida com a cotacao do candidato dentro do slippage; o codigo so checa `minReceiveAmount !== null` e a validade. | Cotacao mudou entre o candidato e a tx preparada. | Comparar `minReceiveAmount` com a saida cotada menos o slippage e abortar se for pior. |
| 6 | Endereco e custodia | Inventario e tamanho usam `OPERATOR_ADDRESS`; a execucao usa `evmSigner.address` da `PRIVATE_KEY`, sem checagem de igualdade. Gas: 120000 fixo no approve e 1,5x a estimativa no swap, sem teto de `maxFeePerGas`. | Dimensionar com o saldo de uma carteira e executar com outra; perda de gas em pico. | Exigir igualdade entre os dois enderecos, teto de taxa por tx e uma carteira dedicada com saldo maximo definido pelo dono, nunca a chave principal. |

## Condicao para qualificar

Os controles 1 a 6 sao pre-requisitos para o estagio 3 do plano de qualificacao (execucao limitada). Eles tambem se aplicam a qualquer futuro executor de futuros ou emprestimo. Sem eles, a execucao deve permanecer em dry run.
