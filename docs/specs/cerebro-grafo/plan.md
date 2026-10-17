# Plano: Grafo documental do cerebro v2

## Abordagem

- Registrar cada adicao, vinculo ou retratacao em `docs/_meta/cerebro/events.jsonl`, sem editar eventos anteriores; cada mutacao materializa `graph.v2.json`.
- `export` usa `exportCompact`, que apenas le o log e o derivado e retorna um `DecisionSpec` compacto. Nao reescreve `graph.v2.json`.
- Oferecer estes comandos em `scripts/cerebro.ts`: `bun scripts/cerebro.ts add-node <tipo> <id> <texto> [ids-link-com-virgula]`, `bun scripts/cerebro.ts link <origem> <destino>`, `bun scripts/cerebro.ts retract <id> <motivo>`, `bun scripts/cerebro.ts export` e `bun scripts/cerebro.ts verify`.
- A exportacao limita o texto a 300 caracteres e aplica o filtro de segredo/endereco de `parseSpec`.
- Isolar a implementacao de v2: `graph.json` v1, curadoria, fontes e `outputs.json` ficam byte a byte inalterados.

## Arquivos

- Alteracoes de implementacao previstas: `scripts/cerebro.ts`, `scripts/cerebro.test.ts`, `docs/_meta/cerebro/events.jsonl` e `docs/_meta/cerebro/graph.v2.json`.
- Controles v1 preservados: `graph.json`, curadoria, fontes e `outputs.json`.
- Esta entrega documental nao altera script, teste, log de eventos ou grafo.

## Trade-offs e riscos

- O log append-only preserva a historia; o derivado e materializado pelas mutacoes e conferido por recomputacao em `verify`.
- Uma retratacao conserva o evento anterior; apagar ou reescrever esconderia historico e nao e permitido.
- `export` e somente leitura: usa log e derivado, retorna `DecisionSpec` de ate 300 caracteres filtrado por `parseSpec`, sem reescrever arquivos.
- `verify` cobre a chain de eventos, retratacoes, igualdade do derivado recomputado e hashes v1.
- Nao fazer chamada paga ao JEV durante o trabalho. Encaminhar a ele cada decisao de design pendente antes de implementa-la.

A verificacao da implementacao deve usar `bun --no-env-file test scripts/cerebro.test.ts`, cobrindo comandos, chain de eventos, retratacao, derivado por recomputacao e hashes dos artefatos v1.
