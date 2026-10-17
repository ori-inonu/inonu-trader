# Status: Grafo documental do cerebro v2

- Fase atual: concluida
- Implementacao: script e teste unicos; 3 nos reais e 2 vinculos no seed; v1 preservada por hashes.
- Verificacao: `bun --no-env-file run typecheck` exit 0; `bun --no-env-file test scripts/cerebro.test.ts` 7 pass, 0 fail, incluindo checkout CRLF.
- `verify`: `ok seq=5 hash=f52dc9008a0d66e67b5f480d83e4b34d38964e1e6d021c1ac7f2ce914e77a105`.
- Limites: export compacto sem chamada paga ao JEV, operacao live ou mudanca de risco. A verificacao nao promete recuperacao apos perda simultanea do log e do derivado.

## Integracao JEV (2026-10-17)

- Decisao real do JEV (`consenso`, lider `record_node`, 9 chamadas, 8142 tokens) sobre como registrar o recibo. Recibo em `docs/_meta/cerebro/receipts/cerebro-recibo-jev.json`, gravado por `bun scripts/cerebro.ts record <recibo.json>` como no `jev-cerebro-recibo-jev` ligado aos nos ativos.
- Limite: o recibo copiado nao e reverificado por `verify`; o hash esta no texto do no. Recomendacao do JEV nao autoriza nada.
- Causa das falhas anteriores: `TYPESAFE_AI_API_KEY` do processo era invalida (401) e a organizacao estava sem creditos (402). Com creditos, a chamada passa se `TYPESAFE_API_KEY` for usada; nenhum codigo de credencial foi alterado.
