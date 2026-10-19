# Adaptador de decisoes Jev

Execute com Bun e sem carregar `.env`:

```powershell
bun --no-env-file scripts/sdd-harness/cli.ts plan <spec.json>
bun --no-env-file scripts/sdd-harness/cli.ts run <spec.json>
bun --no-env-file scripts/sdd-harness/mcp.ts
```

`plan` valida a spec e calcula o custo maximo em chamadas/tokens, sem rede. `run` usa `TYPESAFE_AI_API_KEY` somente do ambiente herdado. `max_calls` no MCP e `--max-calls N` na CLI sao opcionais: omitidos, nao ha teto artificial de chamadas. Quando informado, o valor precisa ser inteiro positivo seguro e cobrir o plano antes de consultar o provedor. O consenso permanece em rodadas finitas; limites do provedor continuam aplicaveis.

O MCP usa JSON-RPC2.0, uma mensagem por linha, ate1MiB. Cada run exige um plano bem sucedido da mesma spec canonica na mesma conexao. O plano permite uma execucao. Notificacoes sao silenciosas e nao executam o provedor. IDs RPC aceitos: null,inteiros seguros ou strings de1 a40 caracteres em `[A-Za-z0-9_.:/-]`, sem padroes sensiveis reconhecidos. IDs e hashes validados preservam sua identidade; detalhes arbitrarios sao redigidos. Essa verificacao heuristica nao substitui a obrigacao de enviar somente fatos sanitizados.

A CLI nao persiste prova de planejamento entre processos: execute plan antes de run e confira sua estimativa. Specs seguem [o parser publico](../../src/consensus/spec.ts). Recibos sao recomendacoes; nenhuma ferramenta autoriza ordens,alteracao de risco ou ativacao live.

`checkpoint`, `status` e `next` mantem metadados legados em um diretorio de estado separado do repositorio. `--iterations` e `--minutes` sao anotacoes. A mensagem `autonomousRunner` e um ponteiro informativo para trabalho futuro; esses comandos nao iniciam um supervisor. A integracao do supervisor,cliente,schema,hook e instalador continua pendente e nao faz parte deste adaptador. Para o fluxo de engenharia, siga o Goal nativo e as instrucoes ativas do projeto.
