# Status: Grafo documental do cerebro v2

- Fase atual: concluida
- Implementacao: script e teste unicos; 3 nos reais e 2 vinculos no seed; v1 preservada por hashes.
- Verificacao: `bun --no-env-file run typecheck` exit 0; `bun --no-env-file test scripts/cerebro.test.ts` 7 pass, 0 fail, incluindo checkout CRLF.
- `verify`: `ok seq=5 hash=f52dc9008a0d66e67b5f480d83e4b34d38964e1e6d021c1ac7f2ce914e77a105`.
- Limites: export compacto sem chamada paga ao JEV, operacao live ou mudanca de risco. A verificacao nao promete recuperacao apos perda simultanea do log e do derivado.
