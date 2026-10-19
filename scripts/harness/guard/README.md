# Guarda PreToolUse

Hook do Claude Code que **nega os temas cercados** numa sessão sem supervisão (segredos, histórico git, dependências, billing, migrações, autoproteção) e lê regras do projeto como dados. Um processo `bun` por chamada, falha aberta, log sem texto de comando.

Arquivos: `guard.ts` (entrada, modo, log, promoção), `guard-core.ts` (`evaluate`, regras de projeto), `builtin-rules.ts` (regras universais), `shell.ts` (tokenizador Bash/PowerShell, caminhos, glob), `guard.test.ts`, `bench.ts`.

## Modos

`<GUARD_HOME>/mode` (padrão `GUARD_HOME` = `~/.claude/guard`) com `observe` ou `enforce`. Ausente, vazio ou com lixo = `observe`.

- `observe`: nunca nega. Registra `would-deny` no log.
- `enforce`: em regra casada escreve **uma** linha no stdout e sai com 0:
  `{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"[guarda:<id>] <motivo>. Registre o bloqueio (goal.ts blocked) e siga com outra tarefa; não pergunte ao dono."}}`
- Qualquer erro interno (JSON ruim, exceção, disco) = exit 0 sem stdout. Uma regra que lança é pulada; as outras continuam valendo e o erro vai ao log como `internal-error`.

## Regras universais

| id | tema | nega |
|---|---|---|
| `seg-leitura` | segredos | ler, copiar, imprimir ou enviar `.env`, `.env.*` (menos `.env.example`), `.credentials.json`, `.claude.json`, `.ssh`, `.aws`, `*.pem`, `*.key` |
| `seg-ambiente` | segredos | `printenv`, `env`, `export -p`, `Get-ChildItem Env:`, `[Environment]::GetEnvironmentVariables`, `echo $VAR` / `$env:VAR` com KEY, SECRET, TOKEN ou PASSWORD no nome |
| `git-historico` | histórico git | push forçado/`--mirror`/`--delete`/`:ref`/`+ref`, `branch -D/-d/-f`, `filter-branch`, `filter-repo`, `reset --hard`, `clean -f`, `checkout --`/`.`/`-f`/`<ref> <arquivo>`, `restore`, `stash drop/clear`, `commit --amend`, `rebase`, `reflog expire/delete`, `gc --prune`, `update-ref -d`, `tag -d/-f`, `worktree remove` |
| `dep-comando` | dependências | `bun add/remove/update/upgrade`, `bun install <pacote>`, `npm/pnpm/yarn` add/install `<pacote>`/remove/update, `pip/cargo/winget/choco/scoop...` install |
| `dep-lockfile` | dependências | Edit/Write (e escrita via shell) em `bun.lock`, `bun.lockb`, `package-lock.json`, `pnpm-lock.yaml`, `yarn.lock` |
| `dep-manifesto` | dependências | Edit/Write em `package.json` cujo texto (novo ou antigo) toca `dependencies`, `devDependencies`, `optionalDependencies`, `peerDependencies`, `overrides`, `resolutions`, `trustedDependencies` ou uma linha `"pacote": "versão"` |
| `bill-askjev` | billing | **executar** `ask-jev.ts` (ler, listar ou `git add` do arquivo passa) |
| `bill-worker` | billing | só com `agent_id`: `jev-consensus.ts ... run`, `--allow-paid-inference`, ferramenta MCP `*__consensus_run` |
| `mcp-migracao` | migrações | MCP por sufixo: `apply_migration`, `execute_sql` |
| `mcp-custo` | billing | MCP por sufixo: `create_project`, `create_branch`, `confirm_cost`, `deploy_edge_function`, `delete_branch`, `merge_branch`, `reset_branch`, `rebase_branch`, `pause_project`, `restore_project` |
| `autoprotecao` | autoproteção | Edit/Write/NotebookEdit e escrita via shell (`>`, `>>`, `tee`, `Set-Content`, `Add-Content`, `Out-File`, `rm`, `del`, `mv`, `sed -i`, `touch`, `cp`/`Copy-Item` só pelo destino...) em `**/.claude/settings*.json`, `**/.claude/guard-rules.json`, `**/.mcp.json`, `~/.claude/guard/**`, `<GUARD_HOME>/**`, `~/.claude/CLAUDE.md` |

Passam: `git commit/push origin <branch>/status/diff/log/add/switch/fetch/pull/show`, `git checkout <branch>`, `bun install`, `bun run`, `bun test`, `cat .env.example`, `cp .env.example .env`.

**Autoproteção desligada** se `HARNESS_ADMIN=1` no ambiente do processo do Claude Code **ou** se existir `<GUARD_HOME>/ADMIN` modificado nas últimas 2 horas (o próprio `ADMIN` é protegido). Só a regra `autoprotecao` é liberada; as demais continuam.

## Regras do projeto: `<CLAUDE_PROJECT_DIR ou cwd>/.claude/guard-rules.json`

Opcional. Esquema **versão 1**, todo-ou-nada (um erro invalida o arquivo inteiro; valem só as universais e há aviso no stderr):

```jsonc
{ "version": 1,
  "rules": [
    { "id": "B1-live-flags", "topic": "dinheiro", "tools": ["Bash", "PowerShell"],
      "commandRegex": ["DRY_RUN\\s*[=:]\\s*['\"]?false", "\\bLIVE_ACK\\b"],   // casa se QUALQUER casar; flag i
      "reason": "texto pt-BR" },
    { "id": "A11-risk", "topic": "limites", "tools": ["Edit", "Write", "NotebookEdit"],
      "pathGlobs": ["**/src/agent/equity.ts"],       // caminho normalizado: barras /, minúsculas
      "contentRegex": ["EQUITY_LIMITS"],             // opcional: só nega se new_string/content/new_source (ou old_string) casar
      "reason": "..." },
    { "id": "MCP-x", "topic": "billing", "tools": ["mcp"], "toolNameRegex": ["__apply_migration$"], "workerOnly": false, "reason": "..." } ],
  "protectedPaths": [ { "glob": "**/docs/_meta/cerebro/events.jsonl", "topic": "dados", "reason": "..." } ] }
```

- `tools`: `Bash`, `PowerShell`, `Edit`, `Write`, `NotebookEdit`, `MultiEdit`, `Read` ou `mcp` (qualquer ferramenta `mcp__*`). Cada ferramenta exige o seu campo: shell -> `commandRegex`; arquivo -> `pathGlobs`; `mcp` -> `toolNameRegex`. `contentRegex` só com `pathGlobs`. Chaves desconhecidas são erro.
- `commandRegex` roda no texto cru **e** no texto com `\` trocado por `/`. `id`: letras, dígitos e `. _ : -`, único, e diferente dos ids universais. Regex inválida ou que casa a cadeia vazia (negaria tudo) é erro.
- `workerOnly: true` só nega se a entrada tem `agent_id` (subagente).
- Glob: `**` (qualquer coisa, inclusive `/`), `**/` (zero ou mais diretórios), `/**` no fim (o diretório e tudo abaixo), `*` (sem `/`), `?` (um caractere sem `/`). Casa o caminho inteiro normalizado **ou** o caminho relativo ao projeto; globs relativos que valem em qualquer worktree precisam do prefixo `**/`.
- `protectedPaths`: nega Edit/Write/NotebookEdit no glob **e** escrita via shell cujo alvo case o glob (cópia só pelo destino; ler passa). Id no log: `protected-path-<n>`. `HARNESS_ADMIN` **não** libera.
- Ordem: universais primeiro, depois as do projeto; a primeira que casa nega.

Validar: `bun guard.ts --validate-rules <arquivo>` (exit 0 e `ok: ...`, ou exit 1 com um `erro:` por problema no stderr).

## Log

`<GUARD_HOME>/log.jsonl`, uma linha por chamada, rotaciona a 5 MB para `log.1.jsonl`:
`{ts, tool, mode, permission_mode, worker, session, decision, rule, topic, head2, ms}`.

- `decision`: `allow`, `would-deny` (observe) ou `deny` (enforce). `session` = 8 primeiros hex do sha1 de `session_id`.
- **Nunca** grava comando, caminho nem conteúdo. `head2` = primeira palavra do comando (se for `/^[a-z][a-z0-9.-]*$/i`, até 20 caracteres) e, **só** quando a segunda palavra esta na tabela de verbos conhecidos daquela ferramenta (`git push`, `bun test`), esse verbo; senão apenas a primeira palavra. Palavra inicial fora do formato vira `?`. Nomes de scripts e argumentos desconhecidos nao entram como subcomandos. Edit, Write, NotebookEdit e MCP: `-`. Desvio consciente da spec: `echo segredo` grava `echo`, não `echo segredo`.
- `ms` = milissegundos do início do processo até gravar o log (não inclui a partida do Bun).

## Promoção

- `bun guard.ts --promote-check` imprime `promote` ou `wait: <motivo>`. Promove se o log tem >= 7 dias, >= 200 chamadas e **zero** recusas (`would-deny`/`deny`) com `head2` benigno (`git status|diff|log|add|commit|push|switch|fetch|pull|show|branch|stash|worktree`, `bun test|run|install|x|build`, `rg`, `ls`, `dir`, `cat`, `type`, `node`, `tsc`, `python`, `pwsh`, `powershell`).
- `bun guard.ts --promote` faz o mesmo e, se promove, grava `enforce` em `<GUARD_HOME>/mode`.
- `bun guard.ts --status`: modo, nº de chamadas, recusas por regra, latência interna (p50/p95/máx), ADMIN.
- Um `git push --force` real no período de observação conta como recusa benigna e adia a promoção até revisar e limpar o log.

## Testes e latência

`bun test scripts/harness/guard` (raiz do worktree). `bun scripts/harness/guard/bench.ts 100` mede o processo real. A partida do Bun depende do **caminho** do script: numa pasta cujo diretório pai tem dezenas de milhares de arquivos (como `%TEMP%`) um script vazio custa ~270 ms; dentro do repo ~100 ms. Meça depois de instalar em `~/.claude/guard`.

## Limites conhecidos

Mudancas literais de diretorio sao avaliadas com um conjunto conservador que inclui o diretorio inicial e os possiveis destinos de `cd`/`Set-Location`, pois o comando pode falhar ou estar em um escopo separado. O limite e64 candidatos; se for excedido, escritas posteriores sao recusadas conservadoramente, enquanto leituras continuam permitidas. Copias avaliam o destino literal e o nome criado ao combinar destino e basename de cada origem, mesmo sem barra final. Isso pode recusar um destino que seria um arquivo, caso sua interpretacao como pasta crie um nome protegido. A analise permanece sem E/S e nao comprova a semantica completa do shell.

A guarda lê texto, não executa nada. Contornos sabidos: caminho montado em variável ou subshell que a análise não resolve (`cat $(echo .e)$(echo nv)`), script em arquivo (`bun x.ts`, `bash script.sh`), alias de git no `.gitconfig`, `find -exec`, `xargs` com lista em arquivo, base64/`eval` dinâmico, aninhamento de invólucros acima de 4 níveis, `grep -r`/`rg --hidden` sobre pasta que contém `.env`, programas que o `bun`/`python` executam e que leem segredos por conta própria, `gh`/`curl` apagando branch remota. `permissions.deny` de Read/Edit nos mesmos caminhos continua necessário. Falsos positivos esperados: `echo "$KEYBOARD"` (nome com KEY), `git branch -d` rotineiro, `rg --glob '*.key'`, qualquer comando com `< .env`.

## Instalação (descrição, nada é executado por este diretório)

1. Copiar `guard.ts`, `guard-core.ts`, `builtin-rules.ts` e `shell.ts` de `scripts/harness/guard/` para `~/.claude/guard/` (`C:\Users\<usuario>\.claude\guard\`). Não copiar `guard.test.ts` nem `bench.ts`. Fazer isso numa sessão de manutenção (`HARNESS_ADMIN=1`), pois `~/.claude/guard/**` é protegido.
2. Criar `~/.claude/guard/mode` com a palavra `observe`.
3. Fazer backup de `~/.claude/settings.json` (`settings.json.bak-AAAAMMDD`) e registrar o hook, em forma exec (sem shell):
   ```json
   { "hooks": { "PreToolUse": [
     { "matcher": "Bash|PowerShell|Edit|Write|NotebookEdit",
       "hooks": [ { "type": "command", "command": "C:\\Users\\<usuario>\\.bun\\bin\\bun.exe",
                    "args": ["--no-env-file", "C:\\Users\\<usuario>\\.claude\\guard\\guard.ts"], "timeout": 10 } ] },
     { "matcher": "mcp__.*",
       "hooks": [ { "type": "command", "command": "C:\\Users\\<usuario>\\.bun\\bin\\bun.exe",
                    "args": ["--no-env-file", "C:\\Users\\<usuario>\\.claude\\guard\\guard.ts"], "timeout": 10 } ] } ] } }
   ```
4. Conferir com `bun ~/.claude/guard/guard.ts --status` e com `claude --debug-file <arquivo>` (linhas `Hooks: ... (ms)`). Depois de 7 dias: `--promote-check`, `--promote`, e só então `onFailure: "block"` no hook.
5. Reversão: remover as duas entradas de `hooks.PreToolUse`, ou `claude --settings '{"disableAllHooks": true}'`, ou restaurar o backup com `HARNESS_ADMIN=1`.

Premissa a confirmar na instalação: o hook herda o ambiente do processo do Claude Code (`HARNESS_ADMIN`); se não herdar, vale o arquivo `~/.claude/guard/ADMIN` (2 horas).
