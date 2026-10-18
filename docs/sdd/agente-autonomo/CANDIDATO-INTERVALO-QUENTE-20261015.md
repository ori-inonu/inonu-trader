# Candidato: intervalo quente de ate 1 minuto, limitado pelo teto de consultas (2026-10-15)

Pedido do dono no chat: preparar no repositorio um candidato com intervalo quente de 1 minuto, limitado pelo teto de consultas, com testes, sem ligar nada e sem reiniciar o core, para a Codex qualificar. Este documento e a passagem para a qualificacao. Nada aqui promete lucro: o candidato so acelera o RELOGIO do agente, e a medicao de hoje (31 consultas seguidas em que o Jev pediu `skip`) indica que o gargalo e a preferencia do Jev, nao o relogio.

## 1. Quatro estados, sem mistura

| Estado | Situacao |
| --- | --- |
| Valido como codigo | sim: 17 testes novos em `src/agent/hot-pace.test.ts` (incluindo a simulacao de um dia UTC inteiro com o orcamento real e o pace do dia), 1 teste de ponta a ponta novo em `wire.test.ts`; `bun test src/agent` 1329 passam, 0 falham; `bun run typecheck` sem erro fora de `src/local-host` |
| Carregado | NAO: o core vivo roda o `release24-6dce963a` empacotado; so vale num release novo |
| Ao vivo | NAO: nada foi ligado, reiniciado ou alterado no processo vivo |
| Ganho medido | NENHUM: sem medicao de efeito sobre decisoes, ordens ou resultado |

## 2. O que muda

Hoje o intervalo quente e a constante `HOT_INTERVAL_MIN = 2` (`autopilot.ts`): nao e configuracao, entao nenhuma configuracao a acelera. O candidato, so para o perfil ARROJADO do dono:

- `BOLD_HOT_FLOOR_MIN = 1` e `boldHotIntervalMin({ remainingConsults, remainingMs })` em `autopilot.ts`: o intervalo quente passa a ser o que a capacidade restante do dia paga, isto e, as consultas que sobram divididas pelo tempo que sobra do dia UTC (o dia do orcamento), nunca abaixo de 1 minuto e arredondado a 2 casas. Com a capacidade inteira (720) e o dia inteiro da exatamente os 2 minutos de hoje; com capacidade sobrando (como hoje, 463 consultas para 496 minutos: 1,07 min) e mais curto; sem capacidade o intervalo e ilimitado (vale o ritmo do mandato e o orcamento recusa o olhar).
- `effectiveIntervalMin(rhythmMin, hot, hotMin = HOT_INTERVAL_MIN)`: terceiro argumento opcional; sem ele o comportamento e o de antes.
- `wire.ts`: `hotIntervalNow()` (so o perfil `arrojado` usa `boldHotIntervalMin`; os outros seguem com `HOT_INTERVAL_MIN`) e `intervalNow` passa a usa-lo.

## 3. O que NAO muda (e por que o teto vale)

- O teto de consultas: a capacidade diaria continua `consultsForRhythm(min(intervalMin, HOT_INTERVAL_MIN))`, isto e, 720 (`rhythmMin` em `wire.ts` nao foi tocado). O candidato NAO eleva o teto, so o gasta de forma mais uniforme.
- O pace do dia do orcamento (`pace: true`): continua recusando um olhar que gastaria o dia antes do relogio UTC. A simulacao mostra que, com o intervalo adaptativo, nenhum olhar e recusado por `ritmo_do_dia` nem por `consultas_esgotadas` ate o fim do dia, e ha um olhar nos ultimos 10 minutos (sem fim de dia cego).
- A guarda de cota de dados (`hotWithinQuota`), os outros perfis, o executor, as travas fisicas, a vigia de 45 s, o intervalo minimo de 90 s entre ciclos por evento, o Brief e o que o Jev decide.

## 4. Efeito esperado, medido contra o estado de 2026-10-15 12:44 local

Hoje: 257 consultas usadas de 720, 463 restantes, cerca de 15,6 mil tokens por consulta (medido). O intervalo passaria de 2 para cerca de 1,07 minuto ate a meia-noite UTC, gastando as 463 restantes ate o fim do dia (cerca de 215 consultas e 3,4 milhoes de tokens a mais do que no ritmo de 2 minutos nesse trecho: 463 menos as 248 que 496 minutos pagariam a cada 2, vezes 15,6 mil tokens; estimativa a partir do consumo medido). Em dias normais, que comecam com 720 para 24 h, o intervalo comeca em 2 minutos e acelera so com a sobra.

## 5. Riscos e limites declarados

- Mais consultas por dia util custam tokens; o teto e o pace limitam, nao eliminam o gasto.
- Nao ha evidencia de que olhar mais vezes crie entradas: nos ultimos 75 minutos o Jev pediu `skip` em todas as consultas (preferencia maxima 28 por cento).
- Cosmetico: a tela mostra `intervalMin` como numero (por exemplo "1.07 MIN"); os parsers aceitam qualquer numero finito.
- Divergencia do manifesto v20: `autopilot.ts`, `wire.ts` e `wire.test.ts` mudam em relacao aos bytes qualificados (alem das divergencias das notas 177A a 177D); `hot-pace.test.ts` e novo.

## 6. Como qualificar e reverter

- Qualificar: `bun test src/agent/hot-pace.test.ts`, `bun test src/agent`, `bun run typecheck`; revisar a simulacao `simulate()` (dia UTC de 1440 minutos com o orcamento real) e os dois cenarios (do meio-dia zero e de 15:44 UTC com 257 usadas).
- Medicao proposta depois de ligar, em release novo: consultas por hora, intervalo real do status, `ritmo_do_dia` e `consultas_esgotadas` nos olhares, tokens por dia e, separadamente, se o numero de compras pedidas pelo Jev mudou.
- Reverter: trocar `hotIntervalNow()` por `HOT_INTERVAL_MIN` em `wire.ts` (uma linha) ou voltar ao release anterior; o teto nunca foi alterado, entao nao ha nada a restaurar.
