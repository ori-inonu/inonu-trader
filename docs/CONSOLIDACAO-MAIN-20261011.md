# Consolidacao de branches e worktrees em main (2026-10-11)

Registro de evidencia da consolidacao pedida pelo usuario: verificar todo o trabalho feito em todas as branches e worktrees, terminar o que faltava, deixar main totalmente atualizado e, no fim, manter somente main. Este arquivo e o checkpoint da tarefa; os hashes abaixo sao os commits reais da branch `integ/consolidation` (worktree `C:/Users/gabri/jev-trader-integ`). A secao final sera completada quando a integ entrar em main.

## 1. Estado inicial

Inventario feito sobre `main` em `f7be047` (merge do R8 do operador):

| Fonte | Estado encontrado | Destino |
| --- | --- | --- |
| `feature/lab-real-jev` (worktree `jev-trader-jev`, sessao SDD) | 8 commits alem de main, arvore limpa | mesclada na integ (`3d60949`) |
| `docs/sdd-carteira-evidencia` (worktree `jev-trader-desk`) | 1 commit de docs, sessao dona encerrada | mesclada na integ (`d5c6ba0`) |
| Codex `inonu-jev-read-safety-f5-f6` | 16 arquivos de docs nao commitados | integ `34eb98f` |
| Codex `inonu-system-one-safety` | 98 arquivos de docs nao commitados | integ `b4fc762` |
| Codex `inonu-jev-tape-data-f1-f4` | 22 arquivos (src/jev-read e docs) nao commitados | integ `6a60659` |
| Codex `okx-real-integration` | 74 entradas nao commitadas, 248 arquivos de codigo, docs e web | integ `ce9e211` |
| Codex `gev-wallet-pilot` | 9 entradas nao commitadas (pilot, painel, docs) | integ `6208bea` e `68befbd` |
| Codex `gev-wallet-pilot-ui` | subconjunto mais antigo do gev-wallet-pilot | descartado (arquivado) |
| Codex `jev-panel-integration` | arvore limpa, HEAD contido em main | so remover |
| Checkout primario `C:/Users/gabri/jev-trader` (`feature/jev-command-center`) | 145 entradas nao commitadas de varias sessoes | overlay seletivo em `fe28f7f` |
| 17 branches locais restantes | todas contidas em main | so apagar |

Antes de qualquer alteracao, o estado nao commitado de cada worktree foi salvo em patch completo (tracked e untracked) em `C:/Users/gabri/jev-trader-archive-20261010/patches/`. O patch `primary-055a637-selected.patch` e exatamente o recorte do checkout primario que entrou na integ.

## 2. O que a integ/consolidation contem

Commits alem de main, na ordem em que entraram:

1. `34eb98f` e `b4fc762`: docs e checkpoints dos Codex read-safety e system-one-safety.
2. `d5c6ba0`: merge de `docs/sdd-carteira-evidencia` (SPEC, plano de 52 tarefas, decisoes D1 a D5 em aberto).
3. `6a60659`: `src/jev-read` com feed, loop, estado e tipos cobertos pelo trabalho F1 a F4 (170 testes do jev-read).
4. `ce9e211`: integracao real da OKX (src/real, scripts real-console, real-start, real-doctor, relatorio mobile, descoberta de arquivos historicos, RealPipeline e PublicMarket). A pagina raiz antiga ficou em `web/src/app/console/page.tsx`; a raiz de main continua sendo a mesa.
5. `7ef385b` e anteriores, via `3d60949`: laboratorio com o Jev real em sombra, chooser, testes de pureza, scripts `jev:lab:plan`, `jev:lab:real` e `test:lab`.
6. `fe28f7f`: overlay do checkout primario: servidor de relatorios (`src/dashboard`, `scripts/reports-server.ts`, script `reports:serve`), revisao de propostas da carteira (`WalletProposalReview`, `wallet-proposal-review.ts`), observacao de arquivos historicos da OKX, diagnosticos de valoracao, docs CENTRAL-JEV e PROXIMAS-ETAPAS, catalogos okx-ecosystem, okx-leaderboard e okx-portfolio.
7. `6208bea`: piloto gev-wallet-pilot (`src/pilot`, scripts `pilot` e `pilot:fixture`, `GevPilotPanel` no console).
8. `68befbd`: o cliente do piloto no browser deixou de importar `src/pilot/protocol` em tempo de execucao; `web/src/lib/gev-pilot-protocol.ts` espelha as constantes e funcoes e `gev-pilot-protocol.test.ts` mantem as duas copias iguais.

Tamanho total sobre main: 465 arquivos, cerca de 101.900 linhas adicionadas e 389 removidas.

## 3. Exclusoes deliberadas

| Item do checkout primario ou dos Codex | Motivo |
| --- | --- |
| `src/system-one/brief.ts`, `system-one.test.ts`, `docs/SYSTEM-ONE.md` | A lista fechada de intervalos de funding do primario quebra dois testes do leitor publico que main ja revisou; main mantem a guarda `Number.isFinite(intervalMs) && intervalMs > 0`. |
| `web/src/app/layout.tsx`, `Rail.tsx`, `rail-render.test.tsx` | Main tem a versao revisada da marca; a do primario era anterior ao merge. |
| `web/src/app/page.module.css` | As duas correcoes (sticky so com altura minima, areas da grade colapsando) ja existem em `console/page.module.css`. |
| `src/onchainos/archive-discovery.test.ts` | Versao anterior a da integracao real. |
| `package.json` do primario | Voltaria `okx:operator` a carregar `.env`, regressao da condicao C4 do R8. |
| `src/portfolio-evidence/`, `docs/portfolio-evidence-v1/` | Trabalho em andamento da sessao "Work trees cleanup e merge para main"; aguarda resposta dessa sessao. |
| `undefined/contract/*`, `AGENTS.md`, `web/.uistub.js` | Artefatos soltos sem dono (spec de replay profile-4, template do bun, stub de UI). |
| Codex `gev-wallet-pilot-ui` | Subconjunto mais antigo do gev-wallet-pilot. |

## 4. Adaptacoes feitas durante a integracao

- Hook `useOkxWallet`: a integracao real trouxe a loja compartilhada (`wallet-store.ts`, com `revision` e `identityKey`) e o primario trouxe `preflightTransaction`, `getSessionToken` e `subscribeSessionInvalidation`. A loja agora carrega o token de sessao, os ouvintes de invalidacao e o preflight sem assinatura; o hook expoe as duas formas e o helper do teste da mesa constroi o resultado completo.
- `src/dashboard/reports-server.ts`: main valida o estado do System One pela projecao publica e exige Origin exato. O servidor passa as origens configuradas ao handler e, para chamadas sem Origin, encaminha a primeira origem permitida e remove o cabecalho CORS na resposta; o teste usa um ciclo valido gerado por `runSystemOneCycle`.
- `src/onchainos/archive-discovery.ts`: dois travessoes introduzidos pelo primario voltaram a hifens (teste D24 de tipografia).
- `src/pilot/policy.ts`: ganhou `exitWindowMs: 0`, campo que a politica do operador passou a exigir no R8 (janela de saida opcional).
- `web/src/app/console/page.tsx`: o painel do piloto e a `WalletPanelView` entraram no `LegacyConsole`, que e onde o feed e o operador vivem depois da integracao real.
- `console/page.module.css`: declaracao `grid-template-areas` duplicada removida.

## 5. Evidencia de verificacao na integ

| Gate | Resultado |
| --- | --- |
| `bun run typecheck` (raiz) | sem erros |
| `tsc --noEmit` em `web/` | sem erros |
| `next build` em `web/` | ok, rotas `/`, `/_not-found`, `/console` |
| `bun test` em `web/` | 1241 pass, 0 fail |
| `bun run test` (raiz, em `68befbd`) | 2461 pass, 2 skip, 1 fail, 352 s |
| `bun run test:lab` (apos o merge do lab) | 647 pass, 0 fail |
| `src/system-one` | 102 pass |
| `src/pilot` e testes web do piloto | 19 + 64 pass |
| `src/dashboard`, `scripts/reports-server.test.ts`, `src/system-one/http.test.ts` | 15 pass |
| `src/onchainos/isolation.test.ts` (D24) | 12 pass |

A unica falha da suite raiz e `scripts/okx-defi.test.ts` "D5/D7: real CLI demo is deterministic synthetic JSON without execution qualification", com `spawnSync bun.exe ETIMEDOUT`. O arquivo sozinho passa 9 de 9 em 8 s; a sessao SDD viu a mesma falha nas suas duas suites completas sobre o lab e uma suite de controle em `f7be047` sob a mesma carga passou limpa. As suites rodaram ao mesmo tempo que outra suite completa e um `next build` na mesma maquina. Tratado como carga, nao como regressao; segue listado como pendencia.

## 6. Pendencias que esta consolidacao nao resolve

- Execucao ao vivo continua bloqueada pelos gates (nenhuma alteracao de gate, chave ou politica entrou aqui).
- R10 (re-revisao independente de C1 a C9 sobre `f7be047`, sessao SDD, relatorio em `docs/research/R10-re-revisao-operador-c1-c9-20261011.md` na branch `docs/r10-operator-rereview`): estagio 3 nao liberado; A1 alto (perna 2 com tolerancia zero contra a cotacao e venda so do minimo garantido), M1 e M2 medios (`--realized` opcional e sem faixa ou trava de duplo lancamento), C2 e C6 abertos, C8 e a medicao em sombra de C9 sao do dono. `docs/OKX-OPERADOR-JEV.md` (linhas 55 e 73) e `docs/AUDITORIA-OBJETIVOS.md` (linha 27) dizem que o realizado vem do inventario; o codigo nao faz isso.
- Decisoes do dono D1 a D8 do R8 e D1 a D5 da carteira com evidencia.
- `src/portfolio-evidence` e `docs/portfolio-evidence-v1` do checkout primario (sessao de limpeza).
- Flake `okx-defi` D5/D7 sob carga.
- Nenhum push para o remoto; so o usuario autoriza publicar.

## 7. Limpeza planejada depois do merge em main

Branches a apagar (todas contidas em main apos o merge): `codex/inonu-jev-read-safety-f5-f6`, `codex/inonu-jev-tape-data-f1-f4`, `codex/inonu-system-one-safety`, `codex/inonu-trader-preparation`, `codex/jev-panel-integration`, `feature/central-ui`, `feature/derivatives-and-live-qualification`, `feature/jev-command-center`, `feature/jev-decision-lab`, `feature/jev-trading-desk`, `feature/onchainos-data-clients`, `feature/onchainos-inventory`, `feature/policy-envelope`, `hermes/release-v0.0.2`, `hermes/release-v0.0.2-ready`, `hermes/release-v0.0.2-receipt-safety`, `integration/v0.0.2`, `docs/sdd-carteira-evidencia`, `feature/lab-real-jev`, `integ/consolidation` e, quando a sessao SDD terminar, `docs/r10-operator-rereview`.

Worktrees a remover (todas arquivadas em patch): os sete Codex em `C:/Users/gabri/.codex/worktrees/`, `jev-trader-desk`, `jev-trader-jev`, `jev-trader-integ`, `jev-trader-vf` (da sessao SDD, so depois do aviso dela). `jev-trader-main` continua servindo main nas portas 3020 e 3021 ate o usuario decidir qual diretorio fica com main; o checkout primario `C:/Users/gabri/jev-trader` e o diretorio de trabalho das sessoes e precisa ficar limpo antes de trocar para main.

## 8. Resultado final

A completar apos o merge em main: hash do merge, verificacao em `jev-trader-main` e lista do que foi removido.
