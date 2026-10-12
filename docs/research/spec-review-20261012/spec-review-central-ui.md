# central-ui: revisão das especificações da interface e do painel (somente leitura)

Alvo: `integ/consolidation` 8d0611a (`C:\Users\gabri\jev-trader-integ`). Método: leitura de código e docs; `git merge-base --is-ancestor`; busca de bytes (`grep -P`) em `web/src`; sha256 (LF normalizado) dos arquivos sujos do primário e dos 7 Codex contra a integ; execução pontual com cwd temporário e `bun --no-env-file test` de 22 arquivos que só gravam em tmpdir (14 arquivos web: 165 pass; `src/dashboard/reports-server` + `src/system-one/http*`: 16 pass; `WalletProposalReview.render`: 18 pass; `src/operator` ledger.persistence, executor.expiry, executor.approval-identity: 87 pass; `src/system-one/readings-readiness`: 11 pass). O resto é "verificado por leitura". Status: D=DONE, P=PARTIAL, M=MISSING, S=SUPERSEDED, N=N-A. Caminhos relativos à raiz da integ. As pendências A1.., B1.., C1.. e D-a.. estão na seção 10. HTTP-PREVIEW-* e LOCALHOST-* ficam com o cluster operador.

## 1. CENTRAL-JEV-ACCEPTANCE (C1 a C6)
| ID | St | Evidência | Falta |
| --- | --- | --- | --- |
| C1 | D | 27 de 29 refs são ancestrais da integ; `docs/r10-operator-rereview` e `final/consolidation` 309fcf5 (integ + doc R10) fora; os 35 docs CENTRAL-JEV têm sha igual ao primário; todos os commits citados nas specs (16eb1ed, 51cfa77, 32fbaf8, 714e276, 2ed0324, 7bce1e8, 1c50fdf, d113f5f...) são ancestrais | ff de main e remoção de worktrees/branches (coordenador e dono) |
| C2 | P | Jev, System One, risco, limites e ecossistema existem, mas só em `/console` e dentro de `<details>` fechado (`web/src/app/console/page.tsx:56-60`); a raiz é a Mesa (`web/src/app/page.tsx:9`). Testes: `command-center-render.test.tsx`, `phase-limit-render.test.tsx:12-35`, `growth-deck.test.ts`, `system-one.test.ts:101-141`. Controles (abas `GrowthDeck.tsx:104`, presets) só foram exercitados à mão em 32fbaf8 | B1, A3 |
| C3 | P | CSS responsivo `console/page.module.css:150-201`, movimento reduzido global `globals.css:383-401` e em 25 módulos CSS, `motion.test.ts`. Evidência visual só de 32fbaf8: `final-ui-validation-32fbaf8.json` (sha a9fa2f1f confere); as capturas citadas em `CENTRAL-JEV-FINAL-VERIFICATION-32fbaf8.md:42` não existem em disco | A3, A8 |
| C4 | D | Registro `CONSOLIDACAO-MAIN-20261011.md:62-77` (web 1241 pass, raiz 2461 pass, 1 flake okx-defi D5/D7); reexecutei os 22 arquivos citados no cabeçalho, todos verdes | furo de descoberta de teste (A4) |
| C5 | P | Há revisões independentes do delta 32fbaf8 (`CENTRAL-JEV-CLOSURE-REVIEW-32fbaf8.md`); nenhuma da integ: RealPipeline, PublicMarket, GevPilotPanel, wallet-store, WalletProposalReview e o polimento de DepthLadder/KpiSurface/TelemetryStream/DecisionCenter do primário (`git diff 32fbaf8 integ`, 7 arquivos) | revisor distinto sobre a integ (esta revisão é só por leitura) |
| C6 | M | O preview 3005 serviu main 32fbaf8 (`CENTRAL-JEV-CONCLUSION-32fbaf8.md:16`); a integ não foi servida nem inspecionada | A3 |

## 2. MOBILE-FIX (M1 a M3) e CONCURRENT-UI (CU1 a CU4)
| ID | St | Evidência | Falta |
| --- | --- | --- | --- |
| M1 | D | `console/page.module.css:160-192` (areas chart/ladder/stream em coluna única até 899px); sem teste automatizado por desenho da spec; geometria 351/281px só no JSON histórico | A3 confirma na integ |
| M2 | D | `console/page.module.css:35-44,92-102` (livro e eventos lado a lado, núcleo separado) | A3 |
| M3 | D | `GrowthDeck.tsx:104-117`, reduced motion global; `motion.test.ts` | A3 (emulação) |
| CU1 | D | `CommandCenter.tsx:218`; `command-center-render.test.tsx:22,31` | nada |
| CU2 | D | M1 a M3 e C1 a C6 preservados nos arquivos | nada |
| CU3 | N | processo histórico, cumprido em 32fbaf8 | nada |
| CU4 | M | porta 3005 servia o build antigo; integ não servida | A3 |

## 3. EXECUTION-COPY (EC1 a EC4) e UI-EXECUTION-TRUTH (U1 a U5)
| ID | St | Evidência | Falta |
| --- | --- | --- | --- |
| EC1 | D | `Rail.tsx:65`, `CommandCenter.tsx:231`, `app/layout.tsx:21`, `app/page.tsx:6` descrevem observação, sem promessa de ordem | nada |
| EC2 | D | `lib/order-state.ts:25-34`; `order-state.test.ts`; `telemetry-stream-render.test.tsx:45`; `command-center-render.test.tsx:7-24` | rótulo com erro de grafia "Orden enviada" (`order-state.ts:10`, travado nos testes `order-state.test.ts:14` e `command-center-render.test.tsx:8`): A2 |
| EC3 | D | `execution-copy-render.test.tsx:53,68` (8 casos), `rail-render.test.tsx:21-36`; executados: pass | nada |
| EC4 | D | `CENTRAL-JEV-COPY-REVIEW-714e276.md` | nada |
| U1 a U4 | D | matriz de 5 cenários `rail-render.test.tsx:21-36`; cadência `command-center-render.test.tsx:26-35`; 8 estados `:7-24` | nada |
| U5 | P | testes afetados passam; build, typecheck e navegador na integ não observados por mim | A3 |

## 4. REMOTE (RI1 a RI5), LEDGER (LI1 a LI5), OPERATOR (OI1 a OI5)
| ID | St | Evidência | Falta |
| --- | --- | --- | --- |
| RI1, RI2 | D | auditoria de 35 caminhos `CENTRAL-JEV-REMOTE-AUDIT-2ed0324.md`; proteções por `okx-wallet.test.ts:964-1086`, `wallet-freshness.test.ts`, `presentation.test.ts:39-98`, `useFeed.test.ts` | nada |
| RI3 a RI5 | N | processo de integração, cumprido (ancestrais verificados) | nada |
| LI1 a LI3 | D | `src/operator/ledger.ts:254-265` (4 tentativas, EPERM/EBUSY/EACCES); `ledger.persistence.test.ts:24-160`; `executor.expiry.test.ts:87-239`; os 3 arquivos de teste do operador passam (87 pass) | nada |
| LI4, LI5 | N | evidência de processo em `CENTRAL-JEV-LEDGER-REVIEW-16eb1ed.md` | nada |
| OI1, OI2 | D | `src/operator/executor.ts:128-151` (contexto live, mock, hold, modelo divergente) e `cycle.ts:183`; testes `executor.approval-identity.test.ts` (pass), `operator.test.ts` (não executado) | cluster operador |
| OI3 a OI5 | N | processo; revisão `CENTRAL-JEV-OPERATOR-REVIEW-7bce1e8.md` | nada |

## 5. REVIEW-FIX (F1 a F4), ZERO-CEILING (Z1), BRANCH-READINESS (S1 a S5), WEB3-DELIVERY (parte UI)
| ID | St | Evidência | Falta |
| --- | --- | --- | --- |
| F1, Z1 | D | `src/system-one/public-view.ts:29`, `web/src/lib/system-one.ts:121` (teto zero só na fase 0); `http-readiness.test.ts:59`, `http.test.ts` (pass) | nada |
| F2 | D | `src/system-one/readings-readiness.test.ts` (11 pass) | nada |
| F3, F4 | D | `web/src/lib/system-one.test.ts:117-141` (Decisao rejeitada, Elegivel/Bloqueado, 3 details); pass | nada |
| S3 | D | `system-one.test.ts:101-108`, `system-one-poll.test.ts` | nada |
| REVIEW (GrowthDeck) e FINANCIAL-REVIEW | D | `GrowthDeck.tsx:205` ("Cenario de referencia: 2x.") e `phase-limit-render.test.tsx:25-35`; ledger ausente ou não finito vira "desconhecido": `operator-center.test.ts:70-96` (pass) | nada |
| S1, S2, S4, S5 | N | backend System One (cluster system-one) | exclusão do primário justificada (seção 9) |
| I3, I4 | D | `okx-wallet.test.ts` (eventos invalidam), `wallet-store.test.ts:53`, `wallet-transaction-preflight.test.ts`; tipos `executionQualified: false` literais | nada |
| I2 | P | `src/verification-commands.test.ts:18-20` congela o glob web em `./src/lib`; `components/WalletProposalReview/WalletProposalReview.render.test.tsx` (18 testes) fica fora | A4 |
| I1, I5 a I7 | N | backend e processo; checklist de `WEB3-INTEGRATION-DELIVERY-SPEC.md:33-34` segue sem marcar | A12 |

## 6. INONU-DESIGN-SPEC (D1 a D8)
| ID | St | Evidência | Falta |
| --- | --- | --- | --- |
| D1 | D | `BrandMark.tsx` (24/32/48, SVG abstrato), LICENSE e crédito Jarrod Watts, `README.md:3`; wordmark em caixa alta "INONU TRADER" | nada |
| D2 | P | tokens trocados (`globals.css:1-30`, não os da spec); contraste calculado por mim: textos ink/ink-2/ink-3/signal/buy/sell/hold/late passam 4,5:1 (menor 4,88); `--ink-4` (3,0 a 3,5:1) usado como cor de texto em 10 seletores (DepthLadder.module.css:67,226; DeskDock.module.css:40; OrderBookLadder.module.css:47,212; PriceChart.module.css:73,99; Watchlist.module.css:130,155; TelemetryStream.module.css:53) contra a regra de `globals.css:15`; fontes de 8,5 a 10 px | A8, B3 |
| D3 | S | hero e 4 painéis substituídos por 4df9c05 (console), e3db011 (command center), e11305f (Mesa) | B3 |
| D4 | D | `presentation.test.ts:39-98`, `rail-render.test.tsx`, `useFeed.test.ts` | nada |
| D5 | P | filtros e janelas 32/64/128 `presentation.test.ts:80,109`, `FlowChart.tsx:10`; cópia de endereço (`Rail.tsx:42-53`) sem teste de sucesso e falha | A3 |
| D6 | P | alvos de 44 px ausentes na Mesa (DeskDock.module.css:52 = 28px), GrowthDeck `.tab`, WalletProposalReview; sem `aria-live` por bloco (ok); reduced motion global (ok) | B3, A3 |
| D7 | P | 65 pontos medianos em texto renderizado (seção 8, item 1); nenhuma lógica de execução alterada | A1 |
| D8 | P | sem revisão independente D1 a D8 da integ; typecheck e build ficam com o coordenador | revisor distinto (como em C5) |

## 7. MESA-DE-OPERACOES, ARQUITETURA D9/seção 7, PROXIMAS-ETAPAS E5, REPORTS-SERVER, carteira e piloto
| ID | St | Evidência | Falta |
| --- | --- | --- | --- |
| R1 a R5 | D | nulo vira "Indisponivel": `desk/ui/format.test.ts` (34), `mesa-render.test.tsx:46-57`; feed vivo/velho/falho: `desk-store.test.ts` (48), `panels-render.test.tsx` (51); fixture só em teste (grep: nenhum import de `lab-fixture`, `desk-test-kit`, `test-fixtures` em produção); bloqueio com motivo: `mesa-render.test.tsx:155-161`; nenhum assina ou envia | A15 (guarda automática da regra 3) |
| Layout, mobile, relógio | D | sem rolagem `MesaView.module.css:12`; abas em 820px `:85-105`; limiar de 5 s `DeskRail.tsx:25` com `mesa-render.test.tsx:98-102` | A3 mede |
| Como rodar | D | flags de `scripts/jev-read.ts:27-28` e `src/server.ts:36-38` batem com a doc; tabela de fontes (`MESA-DE-OPERACOES.md:9-14`) omite `/jev-read` | A12 |
| D9 (`/central`) | P | GrowthDeck (risco, limites/fases, ecossistema) vive em `/console`; rota `/central` e `components/central` não existem (`central-safety.test.ts:15-26` admite) | B2, A12 |
| Seção 7: construtor do registro de autorização | M | `lib/central/authorization-record.ts` (563 linhas, 35 testes) sem consumidor na UI | B2 |
| Seções 7 e 10: sem controle de execução | D | busca em `web/src`: só `eth_requestAccounts`, `wallet_switchEthereumChain`, `eth_call/getBalance/blockNumber/chainId/accounts`; tipos `executionEnabled: false` | nada |
| E5 (próximas etapas) | P | origem/idade, escolha, motivo de hold, limites existem em Mesa e SystemOne; faltam reservas, estado paper, último ciclo reconciliado e medição de custo da animação | A3 (parte), B1 |
| REPORTS-SERVER (8 requisitos) | D | `src/dashboard/reports-server.ts:46-77`; `reports-server.test.ts` (pass); `/jev-read` e `/api/real` não são servidos, doc silenciosa | A12 |
| WALLET-PROPOSAL-REVIEW e PREFLIGHT | D | `wallet-proposal-review.test.ts` (20), `wallet-transaction-preflight.test.ts` (31); recibos `evidence/` citados em `WALLET-PROPOSAL-REVIEW.md:27` não estão na árvore nem no primário (só um diretório vazio); `web/scripts/wallet-proposal-review-mounted.mjs:8-12` depende de caminho privado do Codex e grava em `<repo>/evidence` | A4, A12 |
| Piloto GEV (M3 UI) | P | `GevPilotPanel.tsx` + `gev-pilot-client.test.ts` (9): porta 3020 fixa (`gev-pilot-client.ts:5`) e origem 3021 fixa (`src/pilot/http.ts:3-4`) não casam com a UI em 3001 | A5, B4 |
| RealPipeline e PublicMarket (UI) | P | `real-pipeline-render.test.tsx` (7), `real-pipeline.test.ts` (8); pontos medianos; base de API única (`console/page.tsx:33`) | A1, A6, B5 |

## 8. Presença dos requisitos do CLAUDE.md (busca de bytes em `web/src`)
1. Ponto mediano U+00B7 em texto renderizado: 65 ocorrências em 4 arquivos de produção: `app/console/page.tsx:51-52` (3), `components/GevPilotPanel/GevPilotPanel.tsx` (10), `components/RealPipeline/PublicMarket.tsx` (10), `components/RealPipeline/RealPipelineView.tsx` (42). Cinco asserções exigem o ponto: `gev-pilot-client.test.ts:283,327`, `real-pipeline-render.test.tsx:84,85,135`. Travessão U+2014 e meia-risca U+2013: zero em texto renderizado (só a regex `mesa-model.ts:11` e um comentário em `format.ts:1`); parentes (U+2212, U+2015, U+2027, U+22C5, U+2219, U+30FB): zero. Guardas existentes cobrem só Mesa (`FORBIDDEN_TEXT`), GrowthDeck (`growth-deck.test.ts:93`), DecisionCenter (`operator-center.test.ts:64-65`), aviso de feed (`feed-frame.test.ts:25-26`) e `lib/central` (`central-safety.test.ts:106-130`); nada varre `components/` nem `app/`.
2. Nada pisca ou pulsa: animações infinitas só de rotação, translação e deslocamento de traço (`globals.css:349`, `CommandCenter.module.css:236,286,297,516`, `ConsoleBackdrop.module.css:32`, `JevStage.module.css:137-139`), sem opacidade em laço, paradas com `.stale`/`.still` e `@media (prefers-reduced-motion)`; `panels-render.test.tsx:481` e `motion.test.ts:56` guardam. Defeito latente: `globals.css:367` usa `ease-inout` (inválido), a varredura `.scanline` nunca anima.
3. Nenhum controle executa ordem: verificado por busca e leitura (exceto POST/DELETE de consentimento e refresh em `real-pipeline.ts:139,191,232`, POST de simulação do piloto `gev-pilot-client.ts:225`, JSON-RPC de leitura em `evm-multichain.ts:146` e `okx-solana.ts:108`). Não há guarda automática em todo `web/src` (só `lib/central`).
4. A demo é o painel ao vivo: a Mesa na raiz usa feed público da OKX no navegador e leituras do Jev (consultivas, `parseJevRead` exige `execution: "never"`); não cita Kuru nem 300 ms. Ver B1.

## 9. Exclusões deliberadas (`CONSOLIDACAO-MAIN-20261011.md` seção 3) e adaptações (seção 4)
| Item | Veredito | Verificação |
| --- | --- | --- |
| `brief.ts`, `system-one.test.ts`, `SYSTEM-ONE.md` | justificada | integ já bloqueia funding desconhecido (`brief.ts` reason `funding_unknown`, `fundingCarryPerDay` com guarda); resíduo útil: seção "Projeção de funding" e nota "projeção de taxa constante" (A17) |
| `layout.tsx`, `Rail.tsx`, `rail-render.test.tsx` | justificada | o primário só reescreve o texto ("Decisoes do agente. Execucao sujeita a verificacao."); main tem a matriz U1/U3 |
| `page.module.css` | justificada | as duas correções estão em `console/page.module.css:73-90,182-191` |
| `archive-discovery.test.ts`, `package.json` | justificada | `okx:operator` do primário voltaria a carregar `.env`; integ mantém `--no-env-file` |
| `portfolio-evidence`, `undefined/contract/*`, `AGENTS.md`, `web/.uistub.js` | justificada | `.uistub.js` foi commitado de propósito (fa72351); `undefined/contract` é spec "profile-4 replay" não congelada; `AGENTS.md` é modelo do bun |
| gev-wallet-pilot-ui | justificada | falta as linhas de cobertura do inventário de `GevPilotPanel.tsx:53-54` |
| Adaptações (`useOkxWallet`, `reports-server`, `archive-discovery`, `policy.ts`, `console/page.tsx`) | corretas | `reports-server.test.ts` passa com ciclo gerado por `runSystemOneCycle`; hook expõe preflight, token e invalidação |

## 10. Pendências por classe
**A (implementável agora, sem chave, serviço externo nem dinheiro)**, por valor:
- A1 Tipografia: trocar o ponto mediano nos 4 arquivos (vírgula, dois pontos ou hífen), inverter as 5 asserções e criar `web/src/lib/typography-scan.test.ts` que lê bytes de `app/`, `components/` e `lib/` (sem testes) e reaproveita `central/scan-helpers.ts`; allowlist só `mesa-model.ts:11`, `format.ts:1`. Aceite: o teste novo falha hoje (4 arquivos) e passa depois.
- A2 `order-state.ts:10` "Orden" para "Ordem" e as duas asserções. Aceite: 3 testes verdes.
- A3 Verificar a integ no navegador (reports-server com fixture + `next start`): `/` e `/console` aberto em 1280, 390, 320; livro e eventos (M1/M2); controles e teclado do GrowthDeck; console sem erro; emular `prefers-reduced-motion` por CDP (`Emulation.setEmulatedMedia`; cliente CDP já existe em `flow-chart-render.test.ts:85,445`) e exigir zero animações infinitas. Aceite: JSON de evidência em `docs/`. Fecha C3, C6, CU4, M1 a M3, U5.
- A4 Mover `WalletProposalReview.render.test.tsx` para `web/src/lib/` (ou ampliar `web/package.json:9` e `verification-commands.test.ts:18-20`). Aceite: `bun run --cwd web test` lista os 18 testes.
- A5 Piloto: portas e origens por env (`gev-pilot-client.ts:5`, `src/pilot/http.ts:3-4`, `scripts/gev-wallet-pilot*.ts:8-9`), padrão que case com a UI em 3001. Aceite: teste de CORS com origem 3001.
- A6 `NEXT_PUBLIC_REAL_URL` para RealPipeline e PublicMarket (padrão igual a `API_URL`).
- A7 `real:console`, `real:start`, `real:doctor` (`package.json:49-51`) sem `--no-env-file`: o `.env` do repositório entraria no ambiente repassado a backend e Next (padrão da condição C4 do R8). Acrescentar `--no-env-file` e uma asserção em `verification-commands.test.ts`.
- A8 Contraste: `--ink-4` para `--ink-3` nos 10 seletores de texto; teste de CSS que proíbe `--ink-4` em `color:` de texto (exceto `:disabled`).
- A9 Teste montado dos controles (GrowthDeck, filtros, janelas, cópia) reaproveitando o harness CDP; pode ser feito junto com A3.
- A10 DF-12: `MultichainPanel.tsx:160` passa `process.env` inteiro; o Next só inlina leituras literais (`web/node_modules/next/dist/docs/01-app/02-guides/environment-variables.md:182`), então `NEXT_PUBLIC_EVM_RPC_*` (documentado em `web/.env.example:9`) nunca chega ao navegador. Ler `process.env.NEXT_PUBLIC_EVM_RPC_143/196` literalmente.
- A11 Copy "Atualiza sozinho a cada 5 segundos" (`DecisionCenter.tsx:150-151`): dizer que é a consulta do navegador e destacar a idade do ciclo (pedido em `UI-TRUTH-MAIN-CHECKPOINT-20261011.md:15`); `RealPipelineView.tsx:127` já mostra o horário da última sincronização.
- A12 Docs: `README.md:73-75` e `web/README.md:17` (a raiz é a Mesa; `/console`); seção "como subir o painel integrado" (real:console, reports:serve, jev-read, pilot); `ARQUITETURA...:30,102-108`; `central-safety.test.ts:15-26` (arquivos inexistentes); links absolutos ao primário em `CENTRAL-JEV-CONCLUSION-32fbaf8.md:22-25`; tabela de `MESA-DE-OPERACOES.md:9-14`; `REPORTS-SERVER.md` dizer que não serve `/jev-read` nem `/api/real`.
- A13 `/operator`: criar `createOperatorLoader` com AbortController e uma requisição por vez como `createSystemOneLoader`; validar `inventory.chains` em `operator-feed.ts:54` (`DecisionCenter.tsx:273` desreferencia); `app/error.tsx`; apagar `useOperatorFeed` (`operator-feed.ts:59`, sem uso). Aceite: teste como `system-one-poll.test.ts`.
- A14 Limpeza: `ease-inout` (`globals.css:367`), dois `ConsoleBackdrop` e dois `<h1>` quando o details abre (`console/page.tsx:48,51`, `Rail.tsx:64`).
- A15 Guarda automática: nenhum arquivo de produção importa `lab-fixture`, `desk-test-kit`, `test-fixtures`.
- A16 Arquivar `docs/evidence/` do primário (322 arquivos, 6,6 MB, ignorado pelo git; citado por `WEB3-INTEGRATION-READINESS.md`) antes de remover o primário.
- A17 Reaproveitar do primário a seção de funding de `docs/SYSTEM-ONE.md` e a nota de `brief.ts` (cluster system-one).

**B (decisão do dono)**
- B1 Rota e narrativa do demo. Hoje `/` é a Mesa (e11305f), sem Kuru nem 300 ms; a Central Jev aceita em C2 a C6 está em `/console`, sem link de entrada e fechada. A mensagem central do CLAUDE.md fala de ordem na book da Kuru por bloco, bloqueada por D11; `README.md:60` já registra a precedência da prontidão; `ENCERRAMENTO-BRANCHES-WORKTREES-20261011.md:94` deixou a decisão para o dono. Alternativas: (a) Mesa na raiz, link visível para `/console` e uma linha honesta sobre a Kuru (bloqueada pelos gates, cadência não verificada); (b) Central na raiz e Mesa em `/mesa`; (c) página única com abas. Recomendo (a): cabe em A, não afirma execução.
- B2 `/central` e construtor do registro: construir, adiar ou descartar. Recomendo adiar (live bloqueado) e reescrever D9 apontando o GrowthDeck em `/console`.
- B3 Aplicabilidade de D2/D3/D6 ao desenho atual (8,5 a 10 px, alvos de 28 px na Mesa): (a) declarar superada em layout e tokens, manter 4,5:1 e alvo de 24 px (WCAG 2.5.8); (b) exigir 12 px e 44 px. Recomendo (a) mais A8.
- B4 Piloto: manter como simulação em `/console`, tornar configurável, ou aposentar; e o nome "GEV" na UI (`GevPilotPanel.tsx:26,41,43,59`) contra "Jev". Recomendo manter, configurável, chamar de Jev e tirar o jargão interno de texto de interface ("P2" em `GevPilotPanel.tsx:59`, "R2" e "R3" em `GrowthDeck.tsx:89`).
- B5 Um servidor para `/events`, `/operator`, `/system-one`, `/jev-read` e `/api/real`, ou bases separadas no frontend. Recomendo A6 e servidores separados.
- B6 Produtor do Jev contínuo (cerca de US$ 0,27 por dia segundo `ENCERRAMENTO...:74`): hoje roda só `--observe` (PID 15792, provavelmente em jev-trader-main, onde `data/jev-read/latest.json` mudou às 08:34). Manter observe até decidir.
- B7 Inspeção humana (leitor de tela, toque real em celular) que `CENTRAL-JEV-CLOSURE-REVIEW-32fbaf8.json` (limitations) e a etapa E5 pedem e nenhum agente cumpre: o dono decide se exige antes de dar a interface por encerrada. Recomendo exigir só para `/` e `/console` aberto, depois de A1 e A3.

**C (bloqueado por chave, serviço externo, dinheiro ou execução ao vivo)**
- C1 `OKX_WEB3_API_KEY/SECRET/PASSPHRASE` para o painel OnchainOS e dados do RealPipeline. C2 Extensão OKX Wallet e conta real para conferir saldos e `WalletProposalReview` fora de fixture. C3 `TYPESAFE_AI_API_KEY` e gasto para decisões vivas do Jev. C4 Ordem real na Kuru por bloco e qualquer execução (D11). C5 Publicar na Vercel (push e deploy não autorizados; a Vercel não alcança `127.0.0.1`). C6 Qualificação G01 a G17 do pipeline real e P2 do piloto.

**D (obsoleto ou superado)**
- D-a INONU-DESIGN-SPEC (tokens e layout) por 4df9c05, e3db011, e11305f. D-b `UI-EXECUTION-TRUTH-CHECKPOINT/VERIFICATION` e `UI-TRUTH-*` intermediários por `UI-TRUTH-MAIN-CHECKPOINT-20261011.md` (99523e4). D-c Specs de processo CENTRAL-JEV (CU, RI, LI, OI, EC, F): cumpridas, arquivar sem alterar bytes (hashes citados). D-d `WEB3-INTEGRATION-REVIEW-*`: história. D-e Cópias do primário (layout, Rail, rail-render, SystemOne.tsx, useOkxWallet.ts, page.module.css, reports-server*) e do Codex (okx-real 10 arquivos, gev-wallet-pilot 4, gev-wallet-pilot-ui 6 entradas): mais antigas que a integ.

## 11. Trabalho solto que não está na integ
- Primário (145 entradas): 95 idênticas à integ, 13 divergentes, 36 ausentes, 1 remoção. Ausentes: `web/src/app/page.module.css` (a6552fe985, descartar: D), `AGENTS.md` (46ffcfbaa0, descartar), `undefined/contract/{ACCEPTANCE.json,PLAN.md,SPEC.md}` (d307aee534, 8c08e85574, 9db2cf3acc; arquivar, spec profile-4 não congelada), `src/portfolio-evidence/` (28 arquivos) e `docs/portfolio-evidence-v1/` (3; entrar ou arquivar é decisão do cluster carteira, nunca descartar; hoje também sem rastreio em `jev-trader-fin`). Divergentes de web: layout 8029e8d1fa, Rail e1216a3c07, SystemOne 70bf15b522, rail-render ae9be67218, useOkxWallet 0b62e0b754 (todas superadas). Em `src/dashboard`: `reports-server.ts` 9297037394 e `.test.ts` 241a1f46ba divergem; a integ (8e601183b9, 911536a690) é a versão adaptada (Origin exato e projeção pública) e passa nos testes.
- Ignorados só no primário: `docs/evidence/` (322 arquivos, 6,6 MB) e `data/` (456 MB; `jev-trader-main/data` tem seus próprios arquivos). Arquivar o primeiro (A16).
- okx-real-integration: 6322 entradas, 6071 em `node_modules.partial-copy` (descartar); das 251 reais, 240 idênticas, 10 mais antigas que a integ, 1 ausente (`page.module.css` antigo). Nada a trazer.
- gev-wallet-pilot (20): 16 idênticas, 4 mais antigas. gev-wallet-pilot-ui (6): 2 idênticas, 4 mais antigas. inonu-system-one-safety (98) e inonu-jev-read-safety (16): idênticas. jev-panel-integration, desk, jev, vf, main: limpos.
- Fora do meu cluster, mas encontrado: `inonu-jev-tape-data-f1-f4` tem `src/jev-read/feed.ts`, `feed.test.ts` e 4 docs `JEV-TAPE-*-20261012` (editados 23:27 a 23:55 de 11/10) que não estão na integ nem no patch das 22:44. Não remover esse worktree antes de o cluster jev-read decidir.

## 12. Contradições entre spec, docs e código
1. Docs `CENTRAL-JEV-CONCLUSION/CHECKPOINT-32fbaf8` e `README.md:75` ("o dashboard abre no centro de comando") dizem que a Central é a página inicial; no código a raiz é a Mesa e `/console` abre em RealPipeline com o console legado recolhido (`console/page.tsx:49-60`). O próprio README se contradiz: `:69` diz que a raiz é a Mesa.
2. `CLAUDE.md` do projeto proíbe ponto mediano em texto renderizado; 65 ocorrências em 4 arquivos e 5 testes que as exigem.
3. `ARQUITETURA...:30` descreve a rota `/central`; ela não existe, e `central-safety.test.ts:15-26` guarda arquivos inexistentes (`Header.tsx`, `docs/okx-central-v1/GUIA.md`, `app/central`).
4. `globals.css:15` diz que `--ink-4` nunca é texto; 10 seletores o usam como cor de texto.
5. `gev-wallet-pilot/SPEC.md:16` fixa 3010/3011; código e notas usam 3020/3021; a UI padrão está em 3001 (`web/package.json:6`, `real-console.ts:6`) e o piloto só aceita 3021.
6. `web/.env.example:9` documenta `NEXT_PUBLIC_EVM_RPC_196`, mas `MultichainPanel.tsx:160` impede o efeito (Next `environment-variables.md:182`).
7. `docs/real-integration/GUIA-LOCAL.md:15` sobe backend real em 3000 e UI em 3001, mas `/console` e a Mesa leem `/operator`, `/system-one`, `/jev-read`, `/events` no mesmo `API_URL`, que o servidor real não serve; o `bun run start` e o reports-server servem partes diferentes na mesma porta padrão.
8. `UI-TRUTH-MAIN-CHECKPOINT-20261011.md:15` pede distinguir polling de frescor; `DecisionCenter.tsx:150-151` mantém "Atualiza sozinho a cada 5 segundos".
9. `CENTRAL-JEV-FINAL-VERIFICATION-32fbaf8.md:42` cita capturas que não existem; `WALLET-PROPOSAL-REVIEW.md:27` cita recibos `evidence/` ausentes; `WEB3-INTEGRATION-DELIVERY-SPEC.md:33-34` segue desmarcado.
10. `INONU-DESIGN-SPEC` pede wordmark "Inonu Trader"; o código usa "INONU TRADER" (decisão posterior, sem registro na spec).
11. `MESA-DE-OPERACOES.md:56` oferece `OPERATOR_READ_TOKEN`, mas nenhum hook web envia `Authorization` (`useOperatorCenter`, `useSystemOne`, `useJevRead`); com o token definido, Mesa e `/console` leem 403. `LOCALHOST-MAIN-STARTUP-RESEARCH-20261011.md:41` já avisa e proíbe o token em `NEXT_PUBLIC_*`; falta dizer isso na doc da Mesa (A12).

## 13. Riscos de segurança e de gate
- Nenhuma alteração de gate, chave ou política neste cluster; nenhum caminho de assinatura ou envio em `web/src`, `src/dashboard`, `src/real`, `src/pilot`.
- A7: scripts `real:*` sem `--no-env-file` (ambiente do `.env` herdado por backend e Next).
- Sem guarda global de execução e tipografia em `web/src` (A1 e item 3 da seção 8).
- `useOperatorCenter` sem abort, sem teste e sem validação interna; sem error boundary no app (A13).
- Herdado de outros clusters e ainda aberto: flake `child_handshake_timeout` (`src/paper-supervisor-runner.test.ts:476`, causa desconhecida), 2 skips `RECEIPT_SAFETY_SOURCE`, flake okx-defi D5/D7.
- Operacional: 22 processos `next start` do primário (portas 3411 a 4177 e 3001) mantêm `web/.next` aberto; não encerrar sem o dono. `jev-read --observe` roda (PID 15792; sem modelo, sem custo; provável jev-trader-main).
