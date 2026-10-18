# Revisão independente: endurecimentos de real, piloto e web (1e67f89..6a9e356)

Alvo: branch work/real-web-hardening, HEAD 6a9e356, 7 commits, 30 arquivos, +1577/-32, worktree C:\Users\gabri\jev-trader-rw. Sou revisor distinto do implementador e não corrigi nada.
No fim conferi: HEAD ainda 6a9e356, 0 entradas sujas, branch igual. Usei só git de leitura (diff, log, show, archive, ls-files, rev-parse, status, config --get).
Método: git archive de 6a9e356 (cópia n) e de 1e67f89 (cópia o) na minha pasta, node_modules por robocopy sem junção, `bun --no-env-file`, cwd temporário, portas efêmeras de loopback, só valores sintéticos. As cópias foram apagadas; ferramentas em tools\, logs na raiz desta pasta, dumps em evidence\.

## Veredito: APPROVE_WITH_NOTES. Gate afrouxado: NÃO.
Nenhum P1. Um P2 que não bloqueia o merge (a ligação dos controles novos não é fixada por teste). Nove P3. Reproduzi os totais do implementador e as promessas de D-A2, D-A3, D-A7, D-A11, C-A2, C-A4, C-A5 e C-A10 com execução própria, inclusive com um build real do Next.

## 1. Totais (cópia de 6a9e356)
| Verificação | Resultado |
| --- | --- |
| `test --timeout 60000` em src/real src/pilot src/okx-wallet scripts/real-env-isolation.test.ts src/verification-commands.test.ts | 304 pass, 0 fail, 33 arquivos, 4070 expect (src/real 192 + src/pilot 51 = 243 em 25 arquivos; okx-wallet 48; real-env-isolation 7; verification-commands 6) |
| web: `test --parallel=1 --timeout 15000 ./src/lib` | 1280 pass, 0 fail, 74 arquivos, 8356 expect |
| `run typecheck` na raiz e em web | exit 0 nos dois (2,8 s e 8,4 s) |
| extra: suíte inteira da raiz (`./src ./scripts`) | 2931 pass, 2 skip (recibos conhecidos), 0 fail, 174 arquivos, 150,7 s |
| extra: 5 repetições dos 8 arquivos com socket ou processo | 85 pass em cada rodada, sem oscilação |
| extra: `next build` real (Turbopack 16.3.4) e `next start` | build exit 0 em 7 a 18 s; start com o ambiente exato do console: `/` 200, `/console` 200, `/nope` 404 |
| extra: `scripts/real-console.ts` de ponta a ponta com filhos reais (backend `real-start.ts` com todo fetch barrado por preload meu; Next em produção), 3 cenários | sobem e encerram limpos: `resourcesClosed:true, forced:false, unexpectedExit:false`, exit 0 (seções 3 e 4) |

## 2. Fronteira e testes existentes
- Nenhum arquivo de src/operator, scripts/okx-operator*, src/jev-read, src/lab*, src/portfolio-evidence, src/system-one nem candidates.ts mudou (grep no `git diff --name-only`: 0). Cada commit toca só a sua tarefa (git show --stat).
- Linhas removidas em arquivos de teste: 7, nenhuma é asserção. Foram: o `handler =` trocado por `withHost(...)` em server.test.ts, 2 imports de verification-commands, 2 rótulos "Orden enviada" atualizados (order-state.test, command-center-render.test) e 2 imports do teste movido. Nenhum `expect` saiu ou foi afrouxado.
- Teste movido: 3 blocos `test` e 31 `expect(` idênticos; só 2 linhas de import diferem. Sozinho: 18 pass, 87 expect. O glob congelado o lista (junit: `src\lib\wallet-proposal-review-render.test.tsx` tests=18). Antes ficava fora de `./src/lib`.
- O teste original de server.test.ts continua útil depois do invólucro: os mutantes S01 (POST sem Origin) e S04 (corpo sem limite) são pegos por ele; S02 e S03 (Origin estranha, CORS `*`) pelo teste novo de CORS.
- RED reproduzido, testes novos contra a árvore antiga: real-env-isolation 6 fail e 1 pass (controle); server.test 5 fail e 3 pass; console-env e ports sem módulo; verification-commands 1 fail; ISO-REAL-8 falha; isolation do piloto (10) e trade (9) passam por desenho.
- 1577 linhas adicionadas varridas: 0 ocorrências de U+00B7, U+2014, U+2013 e parentes; 0 linhas com animation, keyframes, blink ou pulse; nenhum controle novo na página. "Orden" não existe mais no repositório; "Ordem enviada" aparece 3 vezes.

## 3. D-A2, ambiente dos filhos (tools\d2-driver.ts, d2-results-1..3.txt, evidence\)
Montei árvores mínimas (old e new) com o real-console.ts de cada commit e filhos-esboço que só gravam o ambiente. `.env` sintético com CANARY_FROM_DOTENV, PRIVATE_KEY, OPERATOR_PRIVATE_KEY, SOLANA_PRIVATE_KEY, LIVE_ACK e OPERATOR_EXECUTE, mais exports de shell (SHELL_CANARY, NODE_OPTIONS, NEXT_PUBLIC_SHELL_VAR).
- ANTIGO: backend e Next recebem 43 variáveis com todas as acima, inclusive no comando documentado `bun --no-env-file run real:console` (o `bun run` interno lê o `.env`). Com `--env-file=private.env`, as 4 credenciais chegam também ao Next.
- NOVO: backend 13 e Next 14 variáveis, nenhuma string vigiada (nome ou valor). Com `--env-file`: backend 18 (4 credenciais e REAL_JEV_MAX_CALLS), Next 14 sem credenciais. NEXT_PUBLIC_* do shell não chega ao Next (confirma o ponto 2).
- Outros caminhos: o único ponto de spawn em src/ e scripts/ fora de testes é scripts/real-console.ts (grep). real-start.ts e real-doctor.ts não criam filhos e só leem `process.env` por `loadRealConfig()`. Não há shell.
- Fatos medidos no Bun 1.3.14 do Windows (envload-probe.txt): o `.env` carregado pelo `bun` externo não é exportado ao script; o `bun` interno sem flag relê `.env`, `.env.local` e `.env.development`; `--no-env-file` bloqueia os três; `--env-file` explícito é propagado.
- Credenciais: só os 4 nomes, só ao backend, vindas do que o console tiver no ambiente (export de shell ou `--env-file`), nunca de `.env`. É lista por nome, não por proveniência. O desvio da lista estrita é razoável (o loader lê esses 4 nomes e o GUIA-LOCAL manda carregá-los por `--env-file`); falta o OK do dono.
- Ressalva P3: o runtime do Windows acrescenta 7 variáveis a qualquer filho com ambiente mínimo (HOMEDRIVE, HOMEPATH, LOGONSERVER, SYSTEMDRIVE, USERDOMAIN, USERNAME, USERPROFILE; tools\spawn-extras.ts, igual para bun e node). Não são sensíveis, mas "apenas SystemRoot, WINDIR, TEMP, TMP, PATH" vale só no nível do construtor.
- Ponto 2: o Next de produção sobe com o ambiente exato (7 nomes, 14 no processo): Ready em 253 ms. `next dev` não foi exercido (o HMR consulta o registro npm e as fontes pedem rede).
- Ponta a ponta com filhos reais (tools\console-e2e.ts, console-e2e.txt e console-e2e-creds.txt; `bun --no-env-file run scripts/real-console.ts`, que é o que o script do package expande, com `.env` sintético contendo REAL_INTERVAL_MS=5000 e REAL_JEV_MAX_CALLS=99): o backend responde `effectiveConfig.intervalMs=60000` e `jev.maxCalls=7` (o do shell). Logo o `.env` não chegou ao filho real e o REAL_* da allowlist chegou.
- Mesma execução com `--env-file=private-e2e.env` (3 credenciais OKX sintéticas): `services.onchainos.configured=true`. Só no `.env`: `configured=false`, faltando as 3. Ou seja, o `.env` não é fonte de credenciais e o `--env-file` explícito é (export de shell passa pelo mesmo caminho, provado no nível do construtor).

## 4. D-A3, allowlist de Host (tools\host-probe.ts, host-probe-new.txt, host-probe-old.txt)
Socket real (Bun.serve em porta efêmera), bytes crus, runtime-gravador com saldo canário: 78 formas de pedido.
- NOVO: 10 servidas (9 legítimas e 1 alvo absoluto hostil com Host bom), 63 recusadas com 421 sem corpo, sem Access-Control-Allow-Origin e com 0 chamadas ao runtime, 5 informativas (400 do próprio Bun para HTTP/1.1 sem Host; 403 e 204 das regras antigas de Origin).
- Recusados (421): porta errada, omitida ou com zero à esquerda; ponto final antes e depois da porta; userinfo em 3 formas; IPv6 alternativo ([0:0:0:0:0:0:0:1], [0::1], [::0001], [::ffff:127.0.0.1], zona); 127.0.0.1.nip.io; localtest.me; 127.1; IPv4 decimal, hexa e octal; %3A; l de largura total.
- Recusados (421), continuação: vazio, em branco, espaço interno; lista com vírgula; 8 KiB; Host duplicado nas 3 ordens (inclusive duas boas: o valor chega como lista); X-Forwarded-Host, Forwarded e X-Host bons com Host mau; alvo absoluto bom com Host mau; 9 rotas, HEAD e TRACE.
- Escrita e preflight com Origin permitida e Host de rebinding: OPTIONS, POST consent, DELETE consent, POST refresh e POST public-market/refresh dão 421 e o gravador fica vazio (nada foi executado).
- Aceitos por desenho: LOCALHOST/LocalHost, espaços ou tab em volta do valor, nome do cabeçalho em qualquer caixa, HTTP/1.0 com Host. Uma página de rebinding não forja nenhum deles.
- ANTIGO, mesma sonda: 60 anomalias; 37 pedidos hostis receberam 200 com o saldo canário; HTTP/1.0 sem Host deu 500.
- Ordem: a checagem é a primeira instrução do handler (antes de `new URL`, CORS, OPTIONS e rotas). `/api/real/latest` com Host indevido não devolve saldo (canário ausente nas 63 respostas).
- Ligação de produção, no real-console de ponta a ponta (backend `real-start.ts` verdadeiro): Host `rebind.example:P` dá 421 sem corpo em `/api/real/latest` e `/api/real/health`; Host sem porta dá 421; `127.0.0.1:P` e `localhost:P` dão 200; a Origin da porta da UI recebe o ACAO correto; Origin estranha dá 403. Ou seja, a allowlist e o CORS convivem na composição real.
- Compatibilidade (client-compat.txt): Bun fetch, node http, curl.exe 1.1 e `--http1.0`, PowerShell Invoke-WebRequest: 200. Só pedido deliberadamente sem Host falha (400 em 1.1, 421 em 1.0). O único consumidor de /api/real no repositório é o navegador da web.

## 5. D-A7, isolamento estático (tools\mutations.ts, mutate.ts, mutation-results-final.txt)
120 mutações aplicadas e revertidas numa cópia-sandbox (conferida idêntica à original no fim): 105 pegas, 15 sobreviveram.
| Área | Mutações | Pegas | Sobreviveram |
| --- | --- | --- | --- |
| src/real (ISO-REAL) | 40 | 34 | 6 |
| src/pilot (ISO-PILOT) | 22 | 19 | 3 |
| D-A2 ambiente | 11 | 11 | 0 |
| D-A3 Host | 10 | 10 | 0 |
| D-A11 portas | 7 | 7 | 0 |
| gate do trade.ts | 7 | 7 | 0 |
| web (C-A10, C-A2, C-A4) | 11 | 10 | 1 |
| regras antigas do server | 4 | 4 | 0 |
| ligação (wiring) | 8 | 3 | 5 |
- Pedidos do enunciado, todos pegos com o teste nomeado: import de ethers e Wallet em src/real (R01, R02, R03 por ISO-REAL-4) e em src/pilot (P01 por ISO-PILOT-3 e 4); sendTransaction (R04 por ISO-REAL-5, P02 por ISO-PILOT-4); fetch fora da lista (R06 por ISO-REAL-9; P03 e P12 por ISO-PILOT-4 e 7); process.env novo (R08 por ISO-REAL-5 e 8; P04 por ISO-PILOT-4 e 6).
- Também pegos: método eth_send*, flags para true, import do executor (arquivo novo, dinâmico, re-export, .ts explícito), child_process, node:net, Bun.write, 0.0.0.0, segundo createHmac, membro extra de ethers.utils, allowlist no policy.
- Sobreviventes que são evasões deliberadas: fetch para destino estranho dentro de um arquivo autorizado a chamar fetch (R07: o teste fixa os 4 arquivos, não o destino); `const { env } = process` (R09, P18); `new Worker(new URL(operator/executor.ts))` (R13, P17); `globalThis["fet"+"ch"]` e `Reflect.get(globalThis,"fetch")` (R26, R40, P22); `Function("return process")()` (R37); arquivo `_test.ts` fora de ./src/lib (W10). São armadilhas de regex, não sandbox.
- As exceções são as únicas (tools\closure.ts, com `Bun.Transpiler.scanImports`, independente da regex dos testes). src/real fecha em 42 arquivos, 15 fora da pasta, igual a ALLOWED_OUTSIDE; importações nuas: ai, @ai-sdk/typesafe-ai, ethers, node:crypto, node:fs, node:path.
- ethers aparece só como `{ utils }` em rpc-read.ts e semantic-proof.ts. src/pilot fecha em 15 arquivos, 6 fora em tempo de execução (chains, portfolio, candidates, jev-selector, plan, risk-gate) mais types.ts só de tipos: 5 do operator e 2 do okx-wallet. Nenhum import dinâmico nem require.

## 6. Demais itens
- D-A11/C-A5 portas, diferencial: handler antigo, novo sem portas e novo com `resolvePilotPorts({})` em 648 formas de pedido: 0 diferenças.
- Portas, scripts de verdade em portas efêmeras: 24 execuções inválidas (12 por script: abc, 0x10, 0, 65536, 03020, espaço, vazio, texto com ponto e vírgula, UI inválida, iguais, 3021 sozinho) recusadas nomeando a variável e sem ecoar o valor. Com portas válidas o CORS segue PILOT_UI_PORT (127.0.0.1 e localhost), recusa 3021, a porta do serviço e origem estranha, e o Host segue PILOT_PORT.
- Página: no bundle de produção o acesso literal virou `function(e){let a=e??"3020";...}("3123")`; `NEXT_PUBLIC_PILOT_PORT=abc` derruba o build (prerender de /console, invalid_pilot_port).
- C-A10: 8 acessos literais para as 8 redes de EVM_CHAINS, nenhum dinâmico; web/.env.example lista as mesmas 8 com os padrões da tabela.
- C-A10, build real: `NEXT_PUBLIC_EVM_RPC_196:"https://canary-rpc196..."` foi inlinado; as não definidas ficam como leitura de process.env (vazia no navegador).
- C-A10, controle com o MultichainPanel antigo: o bundle traz `{overrides:a.default.env}` e o canário está ausente, logo o defeito era real. Isso responde T-VERIFY-1 e DF-12 de docs/sdd/carteira-evidencia. A regra do Next fica provada no bundler, não só pela doc e pela simulação.

## 7. Achados
**P1:** nenhum.

**P2-1: a ligação dos controles novos não é fixada por teste.**
- Cenário: um refactor de scripts/real-start.ts troca `fetch: handle` por outro handler ou reescreve o Host (X02, X03); ou scripts/real-console.ts passa `{...backendEnv, ...}` ao Next (X07) ou tira `--no-env-file` do argv do filho backend (X01, que então leria o `.env` da raiz sozinho).
- Os 4 arquivos de teste de D-A2, D-A3 e ISO-REAL seguem verdes; só 2 testes citam real-console ou real-start (grep) e nenhum fixa a composição. Os testes provam o construtor, o handler e as flags do package.json.
- Sonda: `bun mutate.ts X` na sandbox deixa vivos X01, X02, X03, X07 e X04 (Next em 0.0.0.0, anterior ao diff).
- Sugestão: um teste de processo com filhos-esboço, como tools\d2-driver.ts, mais asserção estática de `fetch: handle`, `env: backendEnv` e `env: frontendEnv`. Hoje o código está correto (provado ponta a ponta nas seções 3 e 4).

**P3-1** "apenas 5 nomes" (real.env.example, testes, relatório do implementador) vale no construtor; no processo o Windows soma 7 variáveis do sistema (seção 3). Ajustar o texto.
**P3-2** As armadilhas estáticas têm as 10 evasões da seção 5; documentar como limite conhecido ou acrescentar padrões para Worker, `Reflect.get`, `globalThis[` e desestruturação de process.
**P3-3** client-env-scan.test.ts usa `new URL("..", import.meta.url).pathname`; com espaço no caminho do repositório 2 de 3 testes falham (%20 no pathname; sonda copiando web/src para "with space"). O mesmo padrão já existe em typography-scan.test.ts. Usar `fileURLToPath` ou `import.meta.dir`.
**P3-4** ISO-PILOT-2 e 3 fixam o fechamento dos 5 módulos do operator. Qualquer import novo em candidates.ts, jev-selector.ts, plan.ts ou risk-gate.ts (por exemplo na pendência A6 do operador) os aciona no merge, por desenho. Quem resolver deve revisar o import e não alargar ALLOWED_OUTSIDE por reflexo.
**P3-5** ports.test.ts obtém portas com bind, release e novo bind (`freePorts`): janela rara de corrida. 5 repetições limpas.
**P3-6** Credenciais por nome, não por proveniência (seção 3): export de shell também chega ao backend. Aceitável; pedir o OK do dono ao desvio da lista estrita.
**P3-7** 421 no lugar do 403 da especificação A3, e Host ausente recusado. Documentado no GUIA-LOCAL; clientes comuns não afetados (seção 4).
**P3-8** C-A10 ativa um override que antes era letra morta: se algum NEXT_PUBLIC_EVM_RPC_* existir no projeto da Vercel ou em web/.env.local, passa a valer e o endereço conectado vai a essa URL. Conferir que nenhuma é autenticada ou privada.
**P3-9** O guarda de glob do verification-commands cobre `.test.` e `.spec.`, não `_test.ts` nem `_spec.ts`, que o bun também descobre (W10).

## 8. Incidentes e limites desta revisão
- Incidente meu: a primeira tentativa de `next build` usou resposta de fonte simulada só para o CSS; o Turbopack ainda buscou os 6 arquivos .woff2 em fonts.gstatic.com (6 GET, todos 404, caminhos falsos, sem dado nem credencial). Percebi pelo log (next-build.log) e refiz com servidor de fontes em loopback; todos os builds seguintes foram sem rede.
- Um comando meu esperou stdin (`python -`) e foi encerrado pelo próprio handle com TaskStop; nenhum outro processo foi tocado.
- O backend real só rodou com todo fetch rejeitado por um preload meu (tools\review-nofetch.ts, ligado por bunfig na cópia): ele tentou 4 URLs públicas de www.okx.com (time, instruments, mark-price, funding-rate) e todas foram barradas localmente. Não executei `next dev` (consulta o registro npm) nem `--live` (nunca). Nenhum .env ou credencial reais; chaves e valores são sintéticos.
- Os arquivos extraídos vieram com CRLF (autocrlf); as âncoras da minha ferramenta de mutação normalizam o fim de linha.

## 9. Reprodução
Reextrair: `git archive 6a9e356` em n, `git archive 1e67f89` em o, node_modules por robocopy, m = cópia de n. Depois, de um cwd vazio:
- `bun --no-env-file tools\d2-driver.ts old|new A|B|C`, `host-probe.ts <árvore>`, `mutate.ts [prefixo]`, `closure.ts <árvore>`, `pilot-diff.ts`, `pilot-scripts.ts`.
- `next-build2.ts <árvore> turbopack [porta]`, `next-start.ts`, `client-compat.ts`, `envload-probe.ts`, `spawn-extras.ts`.
- `console-e2e.ts [file|dotenv]` exige, na cópia, `review-nofetch.ts` na raiz e `preload = ["./review-nofetch.ts"]` no topo do bunfig.toml, além do build da web.
- Resultados guardados: d2-results-1..3.txt, host-probe-new.txt, host-probe-old.txt, mutation-results-final.txt, closure-report.txt, pilot-diff.txt, pilot-scripts.txt, next-build2-turbopack.log, next-start.txt, client-compat.txt, console-e2e.txt, console-e2e-creds.txt, run-*.txt, batch1-junit.xml, web-lib-junit.xml, full.diff.
