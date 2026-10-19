# Decisoes Jev e supervisor de engenharia

Execute com Bun e sem carregar `.env`:

```powershell
bun --no-env-file scripts/sdd-harness/cli.ts plan <spec.json>
bun --no-env-file scripts/sdd-harness/cli.ts run <spec.json>
bun --no-env-file scripts/sdd-harness/mcp.ts
```

`plan` valida a spec e calcula o custo maximo em chamadas/tokens, sem rede. `run` usa `TYPESAFE_AI_API_KEY` somente do ambiente herdado. `max_calls` no MCP e `--max-calls N` na CLI sao opcionais: omitidos, nao ha teto artificial de chamadas. Quando informado, o valor precisa ser inteiro positivo seguro e cobrir o plano antes de consultar o provedor. O consenso permanece em rodadas finitas; limites do provedor continuam aplicaveis.

O MCP usa JSON-RPC2.0, uma mensagem por linha, ate1MiB. Cada run exige um plano bem sucedido da mesma spec canonica na mesma conexao. O plano permite uma execucao. Notificacoes sao silenciosas e nao executam o provedor. IDs RPC aceitos: null,inteiros seguros ou strings de1 a40 caracteres em `[A-Za-z0-9_.:/-]`, sem padroes sensiveis reconhecidos. IDs e hashes validados preservam sua identidade; detalhes arbitrarios sao redigidos. Essa verificacao heuristica nao substitui a obrigacao de enviar somente fatos sanitizados.

A CLI nao persiste prova de planejamento entre processos: execute plan antes de run e confira sua estimativa. Specs seguem [o parser publico](../../src/consensus/spec.ts). Recibos sao recomendacoes; nenhuma ferramenta autoriza ordens,alteracao de risco ou ativacao live.

`checkpoint`, `status` e `next` da CLI de decisoes mantem metadados legados em um diretorio de estado separado do repositorio. `--iterations` e `--minutes` sao anotacoes. Esses comandos nao iniciam um supervisor. O Goal nativo continua sendo a primeira opcao quando disponivel.

## Supervisor em primeiro plano

O runner executa um grafo de tarefas de engenharia explicitamente autorizado. Ele usa o Codex CLI local e autenticado como worker;este pacote nao instala o CLI,nem configura autenticacao ou inicializacao automatica. Use os comandos abaixo somente com um plano autorizado. Os testes automatizados usam executores e stdio falsos;nao qualificam uma sessao autenticada real.

```powershell
bun --no-env-file scripts/sdd-harness/runner.ts start --project <repo> --objective-id <id> --objective "<objetivo>" --tasks <tarefas.json>
bun --no-env-file scripts/sdd-harness/runner.ts status --project <repo> --objective-id <id>
bun --no-env-file scripts/sdd-harness/runner.ts pause --project <repo> --objective-id <id>
bun --no-env-file scripts/sdd-harness/runner.ts resume --project <repo> --objective-id <id>
bun --no-env-file scripts/sdd-harness/runner.ts cancel --project <repo> --objective-id <id>
```

O [parser do plano](scheduler.ts) exige version1,id,objective,authorizedScope e tasks. Cada tarefa declara id,title,dependsOn,writePaths,acceptance,verifyArgv,risk e reversible. Objetivo e ID da chamada start precisam coincidir com o plano. Verificadores Bun incluem --no-env-file. A fonte do plano precisa ser um arquivo regular e exclusivo no projeto,validado antes da leitura;corpo e hash usam os mesmos bytes observados. WritePaths em .env,data e .git sao recusados. Tarefas marcadas fenced no plano ficam bloqueadas. O plano autorizado e as instrucoes do worker devem preservar as demais cercas financeiras,de credenciais,migracao,billing,dependencias e Git destrutivo;nao ha classificacao semantica automatica de qualquer tarefa. Uma tarefa explicitamente preconcluida no plano pode usar initialStatus done.

O coordenador seleciona tarefas elegiveis,chama Jev quando ha decisao e executa os verificadores antes de marcar done. Workers recebem o [protocolo proprio do harness](../../tooling/sdd-harness/shared/WORKFLOW.md),o plano e o [schema de resultado](runner-result.schema.json). Nao chamam Jev,nem escolhem tarefas,publicam ou movimentam dinheiro. O protocolo e autocontido;nenhum pacote de skills upstream e copiado ou instalado.

Estado e controles ficam fora do repo,em .sdd-harness/projects no home do usuario. O runner confere projeto esperado,plano,identidade e claims antes de reusar estado. Um lease impede coordenadores concorrentes;start nao sobrescreve um objetivo existente. A existencia de um PID ainda ativo recusa duplicacao,sem assumir propriedade de outro processo. Pause/cancel interrompem somente o handle do subprocesso atual. Cancelamento e terminal;retomada exige resume explicito.

Todo retorno passa por controles e conferencia de scope,inclusive continuacoes. Resultado decodificado e codigo de saida observado sao persistidos antes de atender uma pausa;resume os processa sem repetir a execucao. Um baseline vazio valido permanece vazio na retomada. Arquivos de resultado ficam retidos e nao recebem limpeza automatica. Arquivo antigo sem saida observada zero nao comprova completed nem autoriza outra chamada Jev. A spec sanitizada acompanha o journal da decisao,com fingerprint e opcoes permitidas conferidos antes da retomada. Uma consulta interrompida usa o fallback reversivel permitido,sem repetir a consulta paga;journal antigo sem essa prova bloqueia a tarefa.

Completed exige todos os verificadores declarados aprovados,cobertura individual dos criterios e evidencias validas antes e depois dos verificadores. O detector de scope compara status,tamanho e mtime depois do worker e de cada verificador;nao oferece isolamento de escrita por caminho nem detecta toda adulteracao possivel. Uma falha de verificacao bloqueia dependentes e preserva tarefas independentes elegiveis;desvio de scope encerra o objetivo bloqueado e preserva arquivos. O processo e de primeiro plano e termina com o host;nao sobrevive a desligamento.

O ambiente do worker e filtrado e o CLI recebe --ignore-user-config. Essa flag nao elimina autenticacao em CODEX_HOME. Nenhuma operacao live,limite de risco,conta ou credencial e liberada pelo supervisor. Hook,instalador e promocao operacional exigem seus proprios trabalhos e verificacoes.
