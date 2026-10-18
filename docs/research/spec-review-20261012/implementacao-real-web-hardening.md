# Implementação dos endurecimentos da integração real, do piloto e da interface web

Branch `work/real-web-hardening` (de `final/consolidation` 1e67f89), worktree `C:\Users\gabri\jev-trader-rw`, 2026-10-12.
Sete commits, um por tarefa, árvore limpa. Nenhum git fora do worktree, nenhum processo ou servidor alheio tocado, nenhuma rede, credencial ou `.env` real usados.
Nada liga execução, assinatura ou envio: src/real e src/pilot seguem só leitura e simulação, e agora têm teste estático.
Em cada tarefa o teste foi escrito e visto falhar antes do código (RED), exceto a D-A7, cujo teste passa sobre o código atual por desenho (item 3).

## Totais, medidos com os comandos congelados do projeto
| Escopo | Antes (1e67f89) | Depois (6a9e356) |
| --- | --- | --- |
| `bun --no-env-file test ./src/real ./src/pilot` | 181 pass, 21 arquivos | 243 pass, 25 arquivos |
| web `bun --no-env-file test --parallel=1 --timeout 15000 ./src/lib` | 1228 pass, 70 arquivos | 1280 pass, 74 arquivos (os 18 de WalletProposalReview entram) |
| outros arquivos tocados | verification-commands 5 | scripts/real-env-isolation 7, src/okx-wallet/trade 9, verification-commands 6 |
| suíte completa da raiz (`./src ./scripts`) | não medida | 2931 pass, 2 skip (recibos, conhecidos), 0 fail, 174 arquivos, 127 s |
| typecheck raiz e web | verdes | verdes |

Por tarefa (src/real+src/pilot / web lib): T1 192/1228, T2 199/1228, T3 221/1228, T4 243/1253, T5 243/1271, T6 243/1271, T7 243/1280.
Cinco repetições dos testes que abrem socket ou processo (59 testes): sem oscilação.

## 1. D-A2 ambiente dos filhos de real:console, commit 5085012
- RED, `scripts/real-env-isolation.test.ts`, 6 falhas: os três "real:console|start|doctor puts --no-env-file on the bun that runs the script"; "with the flags of the real:doctor script the .env of the working directory is ignored" (leu intervalMs 15000 e maxCalls 9 do `.env` sintético em temp, esperado 60000 e 10); "the documented explicit file keeps working..." (maxCalls 9 do `.env`); "scripts/real-console.ts hands its children an allowlisted environment...".
- Controle verde: sem a flag o `.env` é carregado, então o experimento enxerga o vazamento. `src/real/console-env.test.ts` falhou por módulo ausente.
- Código: `--no-env-file` nas três linhas de package.json (só essas); `src/real/console-env.ts` com `backendChildEnv` e `frontendChildEnv`; `scripts/real-console.ts` deixa de espalhar `process.env`.
- Lista: SystemRoot, WINDIR, TEMP, TMP, PATH; ao backend também as 11 REAL_* que `loadRealConfig` lê e as 4 credenciais da aplicação; ao Next só NEXT_PUBLIC_API_URL e NEXT_TELEMETRY_DISABLED.
- Prova: canário, PRIVATE_KEY, OPERATOR_PRIVATE_KEY, SOLANA_PRIVATE_KEY, LIVE_ACK etc. não chegam a nenhum filho (nem o nome, nem o valor); caixa mista do Windows; listas conferidas contra o loader e o real.env.example. O fluxo documentado `bun --no-env-file --env-file=<privado> run real:console` segue valendo (testado com o doctor).
- Desvio a confirmar: OKX_WEB3_API_KEY, OKX_WEB3_API_SECRET, OKX_WEB3_API_PASSPHRASE e TYPESAFE_AI_API_KEY passam ao backend (nunca ao Next), fora da lista literal pedida, porque o loader e o GUIA-LOCAL os tratam como entrada documentada via `--env-file`; sem eles esse fluxo quebraria em silêncio. Para a lista estrita, esvaziar `BACKEND_CREDENTIAL_ENV`.
- Fora: só o real-console monta ambiente de filhos (não há arquivo irmão). NEXT_PUBLIC_* exportadas no shell deixam de chegar ao Next por real:console (usar web/.env.local, dito no .env.example); o Next ainda lê web/.env* por conta própria.

## 2. D-A3 allowlist de Host em src/real/server.ts, commit a0867d6
- RED, 5 falhas: "any other Host is refused with 421 and an empty body, even for the GET that has no Origin" (evil.example:3000 lia /api/real/latest com 200), "a request without a Host header is refused", "the server port decides which Host is valid...", "port 80 is served by the bare host names...", "on a real socket a rebinding Host and a missing Host get 421...".
- Três verdes de guarda no mesmo arquivo: Host loopback servido, CORS/Origin inalterado, teste original.
- Código: Host precisa ser localhost, 127.0.0.1 ou [::1] com a porta do servidor (REAL_PORT; nomes sem porta se for 80), sem distinguir caixa. Qualquer outro, vazio ou ausente recebe 421 sem corpo, antes de qualquer rota (OPTIONS inclusive).
- Host ausente (HTTP/1.0) antes quebrava em `new URL` com URL relativa; agora é recusado.
- Testes: 20 Hosts hostis x 9 rotas, REAL_PORT diferente, socket real (Bun.serve) com Host de rebinding, loopback e sem Host. O teste original só ganhou um invólucro que acrescenta Host; nenhuma asserção mudou. Doc: uma frase no GUIA-LOCAL.
- Fora: a variável opcional de hosts extras não foi criada (o servidor só escuta em 127.0.0.1).

## 3. D-A7 isolamento estático, commit 3106c60
- `src/real/isolation.test.ts` (12) e `src/pilot/isolation.test.ts` (10), no estilo de lab-jev/purity: seguem os imports relativos de cada arquivo de produção e dos scripts de entrada, sobre o código sem comentários.
- Fixam: arquivos alcançados fora da pasta (lista exata), imports nus, ausência de sign/send/broadcast/chaves/gates do trader/sockets/código dinâmico, todo `executionEnabled`, `signed` e `approveTransaction` igual a `false` (piloto: `execution: "disabled"`, `mode: "simulation"`, allowlists vazias), os 5 métodos JSON-RPC de leitura, leitura de ambiente só onde permitido, rede em 4 pontos nomeados, só o journal toca disco.
- `src/okx-wallet/trade.test.ts` (9), pedido no A7 do relatório: `allowLiveRequests` precisa ser exatamente `true`, com e sem fetcher injetado.
- RED: passam sobre o código atual, como pedido. Prova de que podem falhar: 48 mutantes temporários aplicados e revertidos (19 em src/real, 16 no piloto, 4 no trade, 9 na web), 0 sobreviveram; cada padrão tem sonda positiva e negativa; um teste do percorredor acha violação a dois arquivos de distância.
- Violação real: nenhuma. Desvios literais do enunciado, marcados como exceção com motivo no teste:
  (a) src/real importa `ethers` só como `{ utils }` em rpc-read.ts e semantic-proof.ts (keccak256, Interface, id, FormatTypes; sem provider, signer ou contract).
  (b) src/pilot importa 5 módulos de src/operator (candidates, jev-selector, plan, risk-gate, types) e 2 de okx-wallet (chains, portfolio) por exigência da SPEC M2, pelos nomes exatos; executor, config, ledger e as classes do SDK ficam de fora.
- `process.env`: só `config.ts` (argumento padrão de `loadRealConfig`) e `real-console.ts` (3 nomes seus e as duas chamadas aos construtores); nada em src/pilot.

## 4. D-A11 e C-A5 portas do piloto, commit 868cd16
- RED: `ports.test.ts` sem módulo; com o módulo e o código antigo, 5 falhas: "with PILOT_UI_PORT=3001 the page of real:console is allowed...", "the handler refuses ports that could not be a loopback listener", os dois "gev-wallet-pilot*.ts listens on PILOT_PORT and allows the page on PILOT_UI_PORT", "an invalid PILOT_PORT stops the script before it listens". Web: `gev-pilot-endpoint.test.ts` sem `pilotEndpoint`.
- Código: `src/pilot/ports.ts` (PILOT_PORT 3020, PILOT_UI_PORT 3021; decimal de 1 a 65535, diferentes entre si; recebe o ambiente e só lê esses dois nomes); `createPilotHandler(deps, ports)`; os dois scripts chamam `resolvePilotPorts(process.env)`.
- Página: `pilotEndpoint()` e `NEXT_PUBLIC_PILOT_PORT` (padrão 3020) por acesso literal; valor inválido derruba o build. Padrões iguais aos de antes.
- Testes: padrão e substituição, inválidos, CORS com origem 3001, os dois scripts de fato escutando na porta configurada (loopback, diretório temporário), paridade serviço x página. Docs: web/.env.example e IMPLEMENTATION-NOTES.
- Fora: o padrão não foi trocado para casar com a UI em 3001 (o enunciado manda manter 3020/3021).

## 5. C-A4 commit ccad018
- RED: "every frontend test file sits inside the ./src/lib glob that the default frontend verification runs" (novo, em verification-commands.test.ts) listou `web/src/components/WalletProposalReview/WalletProposalReview.render.test.tsx`.
- `git mv` para `web/src/lib/wallet-proposal-review-render.test.tsx` (nome do padrão `*-render.test.tsx` da pasta). Só 2 linhas de import mudaram, nenhuma asserção. O comando congelado roda os 18 (arquivo isolado: 18 pass; glob: 1253 para 1271).

## 6. C-A2 commit 8ece4c4
- "Orden enviada" é erro de digitação: veio com a primeira versão de order-state.ts ao lado de quatro rótulos "Ordem ...", nenhum documento define "Orden" (as 3 linhas são as únicas ocorrências do repositório) e a interface é em português.
- Os dois testes foram trocados primeiro e falharam ("orderStateFor > covers every quote status" e "preserves individual observed order and fill states (0)"); depois order-state.ts:10.

## 7. C-A10 NEXT_PUBLIC_EVM_RPC_*, commit 6a9e356
- RED: "no source of web/src hands on, indexes or aliases the environment" apontou só `MultichainPanel.tsx:160`; "the multichain panel gets its RPC overrides from publicEvmRpcOverrides..."; o teste do helper sem o export.
- Código: `publicEvmRpcOverrides()` em evm-multichain.ts, um acesso literal para cada uma das 8 redes de `EVM_CHAINS` (o .env.example listava 1); o painel chama o helper. web/.env.example documenta as 8, com os padrões.
- Testes: unitário do helper (uma chave por rede, valores por nome, nada além, chega ao caminho de leitura), simulação do bundler (acesso literal trocado pelo valor, `process.env` vazio) e varredura de todo web/src. 9 mutantes da web mortos.
- A regra vem da doc do Next instalado (web/node_modules/next/dist/docs/01-app/02-guides/environment-variables.md, "dynamic lookups will not be inlined"). Não rodei `next build` (baixa fontes do Google): a prova é a simulação da regra mais a varredura.

## Para o revisor olhar
1. Credenciais da aplicação passam ao backend (item 1, desvio).
2. O Next sobe com 7 variáveis. Offline, node, `next --version` e o binding SWC funcionam com esse ambiente exato; o servidor não foi subido (fontes do Google, rede). Conferir uma vez com `bun --no-env-file run real:console`.
3. 421 em vez de 403 para Host errado; Host ausente passa a ser recusado.
4. Testes novos abrem processos bun e sockets em portas efêmeras de loopback (cinco repetições limpas).
5. Comentários e títulos de teste em inglês, como os arquivos vizinhos; docs, exemplos de env e este relatório em português, sem ponto médio, travessão ou meia-risca (1577 linhas adicionadas varridas, 0 ocorrências).
