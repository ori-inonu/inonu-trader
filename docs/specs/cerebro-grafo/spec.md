# Spec: Grafo documental do cerebro v2

Status: aprovada
Dono: usuario

## Contexto

O cerebro documental precisa de um grafo v2 com historico de eventos preservado e uma visao materializada que possa ser reconstruida. A versao 1 e seus dados existentes ficam intactos.

## Metas

- Manter `docs/_meta/cerebro/events.jsonl` como fonte autoritativa append-only e `graph.v2.json` como derivado materializado pelas mutacoes.
- Disponibilizar `bun scripts/cerebro.ts add-node <tipo> <id> <texto> [ids-link-com-virgula]`, `bun scripts/cerebro.ts link <origem> <destino>`, `bun scripts/cerebro.ts retract <id> <motivo>`, `bun scripts/cerebro.ts export` e `bun scripts/cerebro.ts verify`.
- O comando `export` usa `exportCompact`, que le apenas o log e o derivado e retorna um `DecisionSpec` compacto, sem reescrever `graph.v2.json`.

## Nao metas

- Alterar ou substituir o grafo v1 e seus artefatos.
- Fazer chamada paga ao JEV, operar live ou alterar risco.

## Criterios de aceitacao

- [x] `add-node`, `link` e `retract` registram eventos sem remover ou reescrever eventos anteriores e materializam o derivado v2.
- [x] `bun scripts/cerebro.ts export` retorna o `DecisionSpec` compacto usando apenas log e derivado, sem alteracao de arquivos; respeita maximo de 300 caracteres e filtro de segredo/endereco aplicado por `parseSpec`.
- [x] `bun scripts/cerebro.ts verify` confere a chain de eventos, o derivado contra a recomputacao e a retratacao, alem dos hashes dos artefatos v1.

## Restricoes

- Decisoes de design devem ser encaminhadas ao JEV; nao inventar convencoes locais.
- Retratar uma relacao ou no por evento `retract`; nunca apagar eventos.
- A exportacao e somente leitura, limitada a um `DecisionSpec` de ate 300 caracteres e passa pelo filtro de segredo/endereco de `parseSpec`.
- Nenhum recurso pago, dinheiro real ou segredos em arquivos.

## Plano de tasks (grafo quando houver tres ou mais passos dependentes)

| Task | Depende de | Criterio de done | Comando de verify |
|---|---|---|---|
| T1 | - | Mutacoes append-only materializam `graph.v2.json`; `retract` conserva o historico. | `bun --no-env-file test scripts/cerebro.test.ts` |
| T2 | T1 | `verify` confere chain, retratacao, derivado recomputado e hashes dos artefatos v1. | `bun --no-env-file test scripts/cerebro.test.ts` |
| T3 | T2 | `export` retorna `DecisionSpec` compacto de ate 300 caracteres, filtrado por `parseSpec`, sem gravar arquivos. | `bun --no-env-file test scripts/cerebro.test.ts` |

## Perguntas em aberto

- Nenhuma decisao de produto fica presumida; qualquer lacuna de design deve ser submetida ao JEV antes da implementacao.

## Status

- Fase atual: aprovada
- Aprovado em: 2026-10-16
