# Plano: contador de rota e projecao de cota (S2)

Modulo unico novo, sem ligacao com arquivo quente. Todo passo com teste antes da implementacao (TDD).

## Passo 1: tipos e tabela de planos
- Criar `src/onchain-read/route-counter.ts` apenas com `PLANOS`, `PlanoId`, `Plano`, `X402_USD_POR_CHAMADA` e a funcao `excedenteX402Usd`, sem contador ainda.
- Porta de saida: `bun --no-env-file test src/onchain-read/route-counter.test.ts` com os casos 12, 13 e 14 verdes.

## Passo 2: contador por rota
- Acrescentar `createRouteCounter`, `record`, `byRoute` e `janela`.
- Porta: casos 1 a 6 verdes.

## Passo 3: projecao linear de dia parcial
- Acrescentar `projectMonth` com o rotulo fixo, `chamadasPorMinuto` e a validacao de `dia`.
- Porta: casos 7 a 11 verdes.

## Portao de revisao
- Portao A: `bun --no-env-file test src/onchain-read/route-counter.test.ts` com 14 casos verdes.
- Portao B: `bun run typecheck` sem erro. Se houver erro em arquivo vizinho que ja existia antes, registrar em riscos e nao corrigir nesta fatia.
- Portao C: grep de pontuacao proibida sem saida.
- Portao D: `git status` mostra apenas os dois arquivos novos e nenhum arquivo quente alterado.

## Integracao proposta (fora desta fatia)
Veja integracao_proposta: o gateway chama `record` apos cada chamada com `cacheHit = !sent`, e `scripts/api-budget.ts` passa a usar `byRoute` e `projectMonth`.
