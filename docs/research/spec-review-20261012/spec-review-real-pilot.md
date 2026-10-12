# Revisão de especificações: cluster real-pilot (somente leitura)

Alvo: integ/consolidation 8d0611a (C:\Users\gabri\jev-trader-integ), main f7be047. Baseline do piloto e do PROXIMAS: f626a30 (ancestral de ambos). Data 2026-10-12. Nada foi escrito fora deste diretório; o `git status` do alvo ficou sem mudanças minhas.
Legenda: DONE, PARTIAL, MISSING, SUPERSEDED, N-A. Classes A (agora), B (dono), C (chave, serviço ou dinheiro), D (obsoleto). (L) verificado por leitura, (E) executado por mim. Itens A1 a A12, B1 a B10, C1 a C8 e D1 a D9 estão na seção 3.
Execuções pontuais (cwd temporário, `bun --no-env-file test <arquivos>`, sem rede e sem escrita no repositório): src/pilot 2 arquivos 19 pass; src/real 19 arquivos 162 pass; onchainos spec, isolation, archive e defi-read 7 arquivos 91 pass; scanners da raiz 3 arquivos 32 pass; okx-defi, signals, evidence, wallet, market e reports-server 15 arquivos 159 pass; web wallet, piloto e real-pipeline 9 arquivos 340 pass. Total 803 pass, 0 fail. Não rodei suíte completa, build nem testes que abrem subprocesso.

## 1. Tabelas por especificação

### 1.1 docs/real-integration/INSTRUCAO-DO-OBJETIVO.md (G01 a G17; meta nativa bloqueada após 3 turnos pela mesma dependência externa)
| ID | Status | Evidência | Falta e classe |
| --- | --- | --- | --- |
| G01 | DONE | CONSOLIDACAO-MAIN-20261011.md secs 1 a 3; 251 arquivos do okx-real comparados (sec 4) | - |
| G02 | PARTIAL | supervisor.ts + supervisor.test (3, E); real-console.ts:16-31; real-start.ts:44-59; CONSOLE-LIVE-R8.json | evidência é da árvore pré-integração; `/` agora é a mesa e o pipeline vive em `/console` (A8, A9) |
| G03 | PARTIAL | real-doctor.ts; config.ts:19-67; config.test.ts:12 (E) | credenciais Web3 ausentes (C1); scripts sem `--no-env-file` (A2) |
| G04 | PARTIAL | wallet-store.ts, useOkxWallet.ts; wallet-store.test, real-pipeline.test, runtime.test:94,115 (E) | conexão real do dono e consentimento (C2) |
| G05, G08 | PARTIAL | core.ts:277-391 (market, balance, quote, build); public-market.ts | zero chamada autenticada real (C1, C5) |
| G06, G07 | PARTIAL (impl DONE) | valuation.ts, rpc-read.ts, observation-integration.ts, transport-proof.ts, runtime.ts fresh(); valuation.test 9, rpc-read.test 11 (E) | inventário real da mesma carteira e núcleo real (C1, C2) |
| G09 | PARTIAL | jev.ts:13 `candidates: []`; jev.ts:23-28 só `hold`/`insufficient_evidence`; runtime.ts:100 rejeita escolha != hold | o runtime real nunca escolhe ID elegível: desenho (B1); credencial e consumo (C3) |
| G10 | PARTIAL | journal.ts, runtime.ts, journal.test (E): reinício, lock, cauda rasgada | 10 ciclos x 2 TTLs (C1); sem candidato nem plano por ciclo (B1) |
| G11 | PARTIAL | core.ts:202-222, preflight.ts:39-71 (`semanticChecksPassed:false` sempre), semantic-proof.ts (portas injetadas) | build autenticado, ABI e deployment verificados, decoder, simulação (C4) |
| G12 | PARTIAL | extensions.ts + extensions.test 12 (E); capabilities.ts:12-21 | extensões ficam sempre OFF: real-start.ts:39 não passa `enabledFamilies` nem `config` e não há carregador (B5) |
| G13, G14 | PARTIAL | BROWSER-EVIDENCE-R8.json, REVIEW-G14-CONTINUATION-1.md | refazer em `/console` (A8); toque e reduced-motion em runtime (C8) |
| G15 | DONE | src/real sem signer: core.ts:259, types.ts:159 `signed:false`; operator.test:161,439,616-622 (L) | - |
| G16 | PARTIAL | CONSOLIDACAO sec 5: raiz 2461 pass, 1 fail ETIMEDOUT; web 1241 pass | a falha já foi mitigada por a674233 (D2); refazer suíte e build na árvore final (A8) |
| G17 | MISSING | REVIEW-R8.md revisa r8c, não a integ | revisão independente da versão final (B10, C) |
Subespecificações: EXECUTION-SPEC E01 E02 E03 DONE, E04 E05 PARTIAL (mesmas causas de G09 e G13); INTEGRATION-SEAMS IS01 a IS06 DONE (semantic-integration.test, observation-integration.test, valuation.test, E); PUBLIC-CADENCE PC01 a PC04 DONE (public-runtime.test:6-59, server.test:19-27, E); RPC-READ R01 a R08 DONE (rpc-read.ts:73-74 limites padrão, E); SEMANTIC-PROOF S01 a S07 DONE só como framework com portas injetadas (semantic-proof.test 14, E; porta de produção MISSING, C4); EXTENSIONS EX01 a EX15 DONE (cabeçalho "sem implementação" desatualizado, A9). ESTADO-ATUAL.md (lacunas de 11/10): bootstrap, API e UI, carteira, multichain, OnchainOS e interface SUPERSEDED por src/real e `/console`; operador/Jev e proposta Web3 seguem PARTIAL (B1, C4).

### 1.2 docs/gev-wallet-pilot/SPEC.md (P1 a P7, M1 a M3)
| ID | Status | Evidência | Falta e classe |
| --- | --- | --- | --- |
| P1, P3, P4, P5 | DONE | service.test:28-42,44-53,68-103,144-157; http.test:15-91 (E); plano com PlanGate todo false (service.ts:174); `execution:"disabled"` literal (protocol.ts:15) | - |
| P2 | PARTIAL | caminho completo só com fixture (testing-fixture.ts); entrypoint padrão devolve hold `inventory_access_unverified` (gev-wallet-pilot.ts) | adaptador real não existe; precisa de acesso, unidade da saída DEX e custo do modelo (C1, C3, C5; desenho B3) |
| P6 | PARTIAL | revisões e navegador foram feitos no worktree antigo (VERIFICATION.md); gev-pilot-client.test 9 e gev-pilot-protocol.test 2 passam (E) | painel agora em console/page.tsx:138, sem nova aquisição de navegador (A8) |
| P7 | DONE | consolidação 6208bea e 68befbd; 16 de 20 arquivos idênticos, 4 adaptados (sec 4) | - |
| M1 a M3 | DONE | wallet-store.ts, src/pilot, GevPilotPanel | porta 3021 fixa (A11) |

### 1.3 docs/PROXIMAS-ETAPAS-JEV-20261011-* (ACCEPTANCE.json PC1 a PC6; plano E0 a E6)
| ID | Status | Evidência | Falta e classe |
| --- | --- | --- | --- |
| PC1 a PC6 | DONE | os 6 hashes de artefato do ACCEPTANCE.json batem com os bytes da integ (E); 22 das 28 fontes do EVIDENCE.json ainda batem; mudaram README.md, package.json, JEV-LABORATORIO-DE-DECISAO.md, okx-operator.ts e .test.ts, jev-lab.ts | PC1 e PC2 valem para f626a30; rebaselinar (A8) |
| E0 baseline e cobertura | PARTIAL | cobertura do lock existe (okx-operator.test.ts:43-120, L); recibos: dois testes são `test.skip` (market.receipt.test.ts:10, trader.receipt.test.ts:16) | matriz de contratos de recibo inexistente, BUILD_ID da prévia não reconferido (A8, B10) |
| E1, E2 | PARTIAL | blocos existem: src/real (inventário exato), src/pilot (ciclo com id estável e hold), operator/cycle | system-one/readings.ts ainda usa capital configurado; E2 real depende de B1 |
| E3, E4, E6 | MISSING | src/paper-*.ts sem consumidor fora de testes; sem avaliação fora da amostra; sem dossiê | B7; E4 depende de captura real (C6) |
| E5 | N-A | interface (outro cluster) | - |

### 1.4 docs/DEFI-DISCOVERY-INTEGRATION-SPEC-DRAFT-20261011.md (G1 a G8; rascunho não congelado; escopo PASS em DEFI-DISCOVERY-SCOPE-REVIEW)
| ID | Status | Evidência | Falta e classe |
| --- | --- | --- | --- |
| G1 | PARTIAL | defi-read.ts:360 cliente; único consumidor não-teste extensions.ts:124 (supportedChains e detail, OFF) | search, searchPages, supportedPlatforms, rateChart, tvlChart, depthPriceChart sem consumidor; sem projeção pública nem os 3 grupos na central (B4) |
| G2, G3, G4 | PARTIAL | extensions.ts:187-190 bloqueia detalhe de outra rede; okx-defi/report.ts associação não verificada; unidade do detalhe desconhecida | candidates.ts:269-275 ignora identidade, :278 `quoteAgeMs: 0`, :272 custo completo só com taxa de entrada (A6) |
| G5 | PARTIAL | paging.ts, searchPages, defi-read.test (E) | não projetado (B4) |
| G6 | MISSING | sem entrada tipada de pesquisa para o Jev; plan.ts:16,51,62 mantém DeFi fora de qualified_live (guarda existente) | B4 |
| G7 | PARTIAL | capabilities.ts:17-21 mostra os 5 estágios por endpoint | sem rede, protocolo, ativo, taxa e unidade na central (B4) |
| G8 | MISSING | nenhum RED de fronteira (wrong_chain, wrong_token, 24 h, futuro, entrada isolada, cursor repetido) | A6 |

### 1.5 Wallet: OKX-SPEC.md (O1 a O8) e WALLET-OPPORTUNITIES-SPEC.md (W1 a W8)
| ID | Status | Evidência | Falta e classe |
| --- | --- | --- | --- |
| O1, O3, O4, O6, O7, O8 e W1 a W8 (W2 é a regra vigente de redes) | DONE | okx-wallet.test.ts (E): descoberta ancorada, bloco único, bigint, eventos, timeouts; wallet-store.test:53 não chama `eth_sendTransaction` | - |
| O2 | SUPERSEDED em parte | texto diz só Monad 143; código aceita Monad e X Layer (teste "switches explicitly to X Layer") | A9 |
| O5 | PARTIAL | backend recebe endereço só após consentimento `web3-rpc-read-v2` (real-pipeline.ts:191, runtime.ts:55-62), em memória | OKX-SPEC não aponta esse fluxo aditivo (A9) |
| Conferência de propostas (WALLET-PROPOSAL-REVIEW, WALLET-TRANSACTION-PREFLIGHT) | PARTIAL | biblioteca DONE (wallet-transaction-preflight.test, wallet-proposal-review.test, E); preflight só `eth_accounts` e `eth_chainId`, `executionQualified:false` | a seção "Revisar proposta" não é renderizada: console/page.tsx:190 usa `WalletPanelView` sem `review`; o `WalletPanel` padrão (WalletPanel.tsx:391-401) não é usado; frescor de 60 s fica "desconhecida" (A4) |

### 1.6 Dados OKX: OKX-ONCHAINOS-DADOS-SPEC.md, escâneres e módulos v1
| Especificação | Status | Evidência | Falta e classe |
| --- | --- | --- | --- |
| DADOS D1 a D27 | DONE | os 27 têm teste com título "Dn:" (grep); spec.test, isolation.test (D23, D24, D25, D27) e 91 testes (E) | uso real e seção 14 (C1, C7); §15 cita `onchainos:capture:env` diferente de package.json:32 (A9) |
| ECOSYSTEM-SPEC E1 a E8 e okx-market-v1 E1 a E8 | DONE, duplicado | mesmo texto em duas especificações e duas pilhas: src/okx-market (okx:market-scan) e raiz src/okx-api.ts, okx-opportunities.ts, scripts/okx-scan.ts (32 testes, E; sem script de pacote; okx-evidence E3 declara o formato legado não suportado) | remover a pilha da raiz (B2, D3) |
| okx-defi-v1 D1 a D8 | DONE | src/okx-defi/report.ts; report.test (E); VERIFICACAO.md | cabeçalho "candidata" (A9); flake do CLI (D2) |
| okx-signals-v1 S1 a S8 | DONE | src/okx-signals; client.test e report.test (E) | modo `--live` sem prova (C1, C7) |
| okx-evidence-v1 E1 a E8 | DONE | src/okx-evidence/report.ts; report.test (E) | origem autenticada (C1) |
| okx-ecosystem-v1 EC1 a EC7 | MISSING | SPEC e GUIA aprovados; não há src/okx-ecosystem nem script `okx:ecosystem` | B7 (sem dependência externa, valor baixo) |
| okx-portfolio-v1 WVD1 a WVD6 | DONE | src/okx-wallet/valuation-diagnostics.ts + T01 a T11 (E); sem consumidor | docs dizem "não implementada" (A9, D5) |
| okx-derivatives D1 a D17 | DONE (L parcial) | src/okx-derivatives (18 arquivos de teste, incluindo isolation), GUIA | acesso, taxas, MMR desconhecidos (C7) |
| okx-dex-v2 D1 a D8 | DONE | okx-dex.test, round-trip.test (E); `outputUnit=unknown` no modo autenticado | segunda perna bloqueada (C5) |
| Arquivos históricos AD01 a AD10, AC01 a AC06 | PARTIAL | AD01 a AD08 e AC01 a AC05 em títulos de teste (E); nenhum download | AD09, AD10, AC06 sem texto no repositório (A9) |
| Qualificação L2 Q1 a Q6 | MISSING | OKX-HISTORICAL-DATA-QUALIFICATION.md | direitos, aquisição, schema, continuidade (C6) |
| WEB3-INTEGRATION-DELIVERY-SPEC I1 a I7 | DONE 5, PARTIAL 2 | I5 (capital só paper sintético, `realizedUsd:null`) e I7 (matriz de 10/10 desatualizada, D4); I2 em verification-commands.test | meta pai segue aberta |
| REPORTS-SERVER.md | DONE | src/dashboard/reports-server.ts; 8 + 4 testes (E parcial); loopback, Host e Origin exatos | porta 3000 colide com real:start (A11) |
| R7 Agentic Wallet e pesquisas (rewards, alpha-radar, leaderboard, exit-security, dex-units, payments, auth-custody) | N-A | pesquisa sem código; src/agentic-wallet proposto não existe | adoção é B/C (D8); catálogo de pagamentos (A10) |
| GOAL-* checkpoints | N-A | históricos; pendências migradas para 1.4, A6 e A10 | - |
| GOAL-INONU-TRADER.md (meta ampla) | PARTIAL | scanner, economia determinística, limites e paper existem offline; reinvestimento só de ganho realizado conciliado segue `realizedUsd:null` (CAPITAL-BOUNDARY-AUDIT.md) | supervisor 24 h, avaliação fora da amostra e paper reconciliado com o operador: MISSING (PROXIMAS E3, E4; C6); a meta não conclui |

### 1.7 Replay "profile-4" (C:\Users\gabri\jev-trader\undefined\contract\SPEC.md, PLAN.md, ACCEPTANCE.json)
| ID | Status | Evidência | Falta e classe |
| --- | --- | --- | --- |
| V4-R01 a V4-R07, V4-AC01 a V4-AC14 (21) | MISSING | `proposed_unfrozen`, `approved_by: null`, `implementationVerified:false` em todos; nada em src/ ou scripts/ implementa | B6 |
Pede: reducer em memória (entrada primitiva, sem fs, rede, env) sobre pacotes de captura do public-market-capture, com resumo obrigatório de 65536 bytes, resultBytes 8388608, hash canônico e sete flags false. Já existe: validação de esquema e sequência do livro (public-market-capture/observations.ts:81-91), `readCapture` local, ReplaySource do laboratório (lab/source.ts:220) e gravador no formato do laboratório (onchainos/capture.ts); não existe: reducer de níveis de preço, admissão do pacote nem ponte captura -> laboratório. Não é implementável hoje: os normativos `inputs/old/contract/SPEC.md` (sha 44badcc7...) e SCHEMA.md (e8cb9e46...) e o "SCHEMA futuro" não estão no repositório, no arquivo morto nem nos patches (os hashes só aparecem na própria SPEC); faltam a Escolha Jev real e a revisão de desenho; o transporte real de captura é `runtime_capability_unqualified` (PUBLIC-MARKET-CAPTURE.md), então só haveria dados sintéticos. Recomendação: arquivar como proposta em docs/sdd/book-replay/ (SPEC, PLAN, ACCEPTANCE, sem o nome `undefined`); implementar depois em src/public-market-capture/replay/ + scripts/book-replay.ts (versão no campo `profile`, não no caminho) e só após captura qualificada (C6).

## 2. Assinatura, envio e aprovação: onde existe, gate padrão e teste
| Local | O que faz | Gate padrão | Teste |
| --- | --- | --- | --- |
| src/pilot/** e scripts/gev-wallet-pilot*.ts | nada assina ou envia; plano hipotético; HTTP só aceita observação; escuta 127.0.0.1:3020 | sem gate para abrir: tipos literais `simulation` e `disabled`; policy sem allowlists (policy.ts:13) | service.test:28-42; http.test:28-33,74-91 (E) |
| src/real/** e scripts/real-*.ts | sem signer; swap com `approveTransaction:false`, proposta `executionEnabled:false`, Jev só hold; consulta Web3 só após consentimento | sem caminho de execução; credenciais não habilitam envio | core.test:111, semantic-proof.test:293, runtime.test:94, config.test:12 (E); sem teste estático de importação (A7) |
| web okx-wallet.ts, okx-solana.ts | `eth_requestAccounts` e `wallet_switchEthereumChain` só por clique; leituras `eth_*`; Solana `connect()` e RPC público de leitura | sem assinatura nem envio | okx-wallet.test, wallet-store.test:53, wallet-transaction-preflight.test (E) |
| src/operator/executor.ts:312-320 e okx-wallet/solana-signer.ts:170-180 | ethers `sendTransaction`, approve exato, Solana `signAndSend` | fechado: OPERATOR_EXECUTE=false, LIVE_ACK, modelo não mock, chave própria, plano `qualified_live` só dex_round_trip (plan.ts:16,51), allowlists vazias bloqueiam; SOLANA_LIVE_ENABLED=false (executor.ts:21) | operator.test:161-162,270,439,616-622 (L) |
| src/market.ts:159-161,225-240,327 (Kuru) | assina cotação, `eth_sendRawTransaction`, depósito de margem | DRY_RUN=true padrão (config.ts:18); `init()` lança com carteira (market.ts:104) | config.test:5-7; live-qualification.test:1020,1071 (L) |
| src/okx-wallet/trade.ts | só monta calldata por GET assinado | `allowLiveRequests` falso (trade.ts:77) | sem teste dedicado ao gate de trade.ts; análogos em okx-api.test:65 e portfolio.test:34 (E); incluir em A7 |

## 3. Pendências por classe
**A (implementável agora; ordem de valor; nenhuma exige chave, serviço externo ou dinheiro)**
- A1 Antes de remover worktrees, arquivar o que só existe em `data/` ignorado e não está no patch de arquivo morto: gev-wallet-pilot `data/pilot/evidence/` (20 arquivos, 183 KB; ANALISE-PROXIMO-OBJETIVO.md sha 8faf1e25 é a fonte de aceitação da SPEC; AUDIT-FINAL.md 036cd181; REVIEW-SPEC.md 2cc20c50; REVIEW-STANDARDS.md 08994e34; FINAL-CHECKPOINT.md 380f3b57) mais 6 jornais de data/pilot, e okx-real `data/real/` (15 arquivos) e `data/events.jsonl` (805 KB). Destino: jev-trader-archive-20261010\evidencia-pilot-real\ com manifesto sha256; aceite: manifesto confere.
- A2 Isolamento de ambiente (reproduzido em temp): `bun --no-env-file run real:console` NÃO impede o `bun run` interno de carregar `.env`. package.json:49-51 sem `--no-env-file` e real-console.ts:13 repassa `...process.env` ao backend e ao Next, inclusive PRIVATE_KEY, OPERATOR_PRIVATE_KEY, SOLANA_PRIVATE_KEY e TYPESAFE_AI_API_KEY se houver `.env`. Passos: `--no-env-file` nos três scripts; env mínimo por lista de nomes; teste unitário da função de env (novo scripts/real-console.test.ts ou src/real/env.test.ts).
- A3 Host allowlist em src/real/server.ts (hoje só valida Origin quando presente; GET de `/api/real/latest`, com saldos, é legível por DNS rebinding porque o navegador não envia Origin em GET de mesma origem): aceitar `127.0.0.1:porta` e `localhost:porta`; teste em server.test.ts (Host hostil -> 403 também em GET).
- A4 console/page.tsx:190: trocar `<WalletPanelView {...wallet} />` pelo `<WalletPanel />` padrão (traz `WalletProposalReview` e o ticker de frescor); teste de renderização (novo web/src/lib/console-wallet-dock.test.tsx) exigindo "Revisar proposta" e o rótulo "desatualizados" após 60 s.
- A5 Regra congelada do CLAUDE.md: 65 pontos medianos em texto renderizado de `/console` (console/page.tsx:51-52; GevPilotPanel.tsx 10; PublicMarket.tsx 10; RealPipelineView.tsx 42); trocar por vírgula ou dois pontos e estender a varredura de central-safety.test.ts (ou novo console-typography.test.ts) a esses arquivos.
- A6 Fronteira legada de candidatos DeFi (3 P2 de DEFI-CANDIDATE-BOUNDARY-FINDINGS): candidates.ts:255-286 deve carregar rede, token e instante do produto, exigir igualdade com o pedido, calcular `quoteAgeMs` (null, futuro ou acima do teto bloqueia) e manter `complete:false` e `researchOnly:true` sem custo de saída (okx-wallet/defi.ts:35 já devolve taxa nula). RED: as sondas wrong_chain, wrong_token, 86.400.000 ms e entrada 0,001 USD como testes em src/operator. Coordenar com o cluster operador.
- A7 Testes estáticos de isolamento src/real/isolation.test.ts e src/pilot/isolation.test.ts (modelo onchainos/isolation.test.ts): proibir import de operator/executor, operator/config, trader, market, config, solana-signer, `Wallet`, `sendTransaction`, `eth_sendRawTransaction`, `personal_sign` e `process.env` fora de real/config.ts. Hoje o gate é só leitura. O pilot importa jev-selector, que importa `ai` e typesafe-ai (sem uso de rede, mas permitir de propósito). Incluir um teste do gate `allowLiveRequests` de okx-wallet/trade.ts, hoje sem teste dedicado.
- A8 Rebaselinar o PROXIMAS (E0) e a verificação final: checkpoint novo com main f7be047 e integ 8d0611a; `bun run test`, `test:all`, typecheck e build na árvore final; subir `real:console` e refazer a aquisição de navegador em `/console` (1440, 390, 360); matriz dos dois skips de recibo contra o ramo hermes/release-v0.0.2-receipt-safety.
- A9 Lote de documentação: GUIA-LOCAL.md:7 (caminho do worktree) e URL `/console`; real-console.ts:28 imprimir `/console`; 5 links quebrados (baseline-fontes.json, status-checkout.txt, runtime-observado.json, decisao-escopo.json, REVISAO-INDEPENDENTE.md em ESTADO-ATUAL.md e INSTRUCAO-DO-OBJETIVO.md; não existem nem no worktree original); cabeçalhos "sem implementação" de EXTENSIONS-SPEC e VALUATION-DIAGNOSTICS-SPEC, "candidata" de okx-defi-v1/SPEC, linhas de INVENTARIO; OKX-SPEC O2 e O5; README sem pilot, pilot:fixture, real:*, reports:serve, okx:dex-quote; DADOS-SPEC §15; texto AD01 a AD10 e AC01 a AC06; CONSOLIDACAO secs 3, 5 e 6. Aceite: varredura de links relativos sem quebra.
- A10 Catálogo de pagamentos: ecosystem-catalog.ts:468 "sem tetos descritos" contradiz APP `upto`; corrigir só o texto, manter `blocked` e `T2-A` (APPROVE em PAYMENTS-MATRIX-DELTA-INDEPENDENT-REVIEW-20261011.md) e congelar em teste.
- A11 Mapa de portas: 3000 compartilhado por real:start, reports:serve e servidor do operador; piloto fixo em 3020 com UI em 3021 (pilot/http.ts:3-4, gev-pilot-client.ts:5) colide com jev-trader-main em 3020 e 3021 e rejeita a UI de `real:console` em 3001 (origin_rejected). Documentar; configuração é B8.
- A12 docs/real-integration/research/*.ts: base fixa no worktree okx-real, fazem GET e POST de rede e Bun.write; marcar como evidência histórica não executável.

**B (decisão do dono)**
- B1 Escopo do Jev no runtime real: (i) aceitar hold-only e emendar G09 e G10; (ii) ligar núcleo real -> candidatos do operador -> seletor -> plano em sombra (exige C5); (iii) aposentar o console real e reaproveitar só core, rpc-read e valuation no operador. Recomendo (i) agora e (ii) depois de C5.
- B2 Pilha duplicada de scanner: manter src/okx-market, remover src/okx-api.ts, src/okx-opportunities.ts, scripts/okx-scan.ts e testes. Há 7 assinadores HMAC independentes (okx-api, okx-market/okx-api, okx-dex, okx-signals/client, portfolio, trade, onchainos/http); unificar só depois.
- B3 Adaptador real do piloto: reaproveitar src/real/core.ts e rpc-read como `PilotDeps.source` (recomendado, após C5) ou manter o piloto só como demo de simulação.
- B4 Rascunho DeFi: congelar G1 a G8 inteiro ou a fatia mínima (A6 mais projeção G1 e G5 com transporte falso); recomendo a fatia mínima e adiar G7.
- B5 Como as extensões DeFi e leaderboard recebem `qualifiedChainIndexes` (hoje nada liga): arquivo local de recibos com validade por flag explícita, variável de ambiente, ou manter OFF. Recomendo OFF até C1.
- B6 Replay profile-4: arquivar como proposta (recomendado), congelar e implementar, ou descartar.
- B7 PROXIMAS E1 a E6 e okx:ecosystem (EC1 a EC7): iniciar ou não; recomendo só E0 (A8).
- B8 Portas definitivas do piloto e do console, e link de `/` para `/console` (hoje nenhuma página liga a `/console`).
- B9 Volume de evidência: docs/real-integration tem 100 arquivos e 5,6 MB (2,6 MB de capturas); manter ou mover o excesso para o arquivo morto.
- B10 Portar ou não o endurecimento de recibos do ramo receipt-safety (market.ts e trader.ts de main diferem do ramo em 561 inserções e 207 remoções); sem decisão, G17 e E0 não fecham.

**C (bloqueado)**
- C1 Credenciais Web3 próprias do app (OKX_WEB3_API_KEY, API_SECRET, API_PASSPHRASE) e acesso por família Market, Balance e DEX: G03, G05, G08, G10, signals live, DADOS-SPEC sec 14.
- C2 Conexão real da OKX Wallet pelo dono e consentimento `web3-rpc-read-v2`: G04, G06, G13.
- C3 Consumo Jev do app autorizado (TYPESAFE_AI_API_KEY, REAL_JEV_CONSUMPTION_AUTHORIZED, orçamento): G09, G10, P2 do piloto.
- C4 G11: build autenticado do swap, ABI e fonte verificados com vínculo a deployment e codehash, decoder packed e aninhado, simulação com whitelist. Execução ao vivo continua bloqueada (D11).
- C5 Unidade da saída DEX (`outputUnit=unknown`): destrava segunda perna, `unitsQualified` do piloto e E3.
- C6 Históricos L2 (Q1 a Q6) e transporte de captura pública `runtime_capability_unqualified`.
- C7 Entitlement e tier de DeFi, leaderboard, signals premium.
- C8 Emulação de toque e reduced-motion no navegador; Agentic Wallet e pagamentos x402 (R7): conta, região, custódia.

**D (obsoleto ou superado)**
- D1 Worktree gev-wallet-pilot-ui: subconjunto estrito antigo (protocol.ts sem PilotCoverage, PILOT_MAX_QUOTE_AGE_MS e pilotNonceValid; client sem coverage e quoteObservedAtMs; teste com hash de 64 em vez de 32 hex); nada se perde.
- D2 Flake okx-defi D5/D7 ETIMEDOUT: mitigado por a674233 (timeouts 45 s e 60 s), mesclado em 3d60949; ainda consta como pendência em CONSOLIDACAO sec 6.
- D3 Pilha de scanner da raiz e a especificação OKX-ECOSYSTEM-SPEC duplicada por okx-market-v1 (B2).
- D4 GOAL-* checkpoints, CHECKPOINT-BLOCKED-CONTINUATION-2, checkpoints e REVIEW do PROXIMAS, WEB3-INTEGRATION-READINESS e REVIEW-*: históricos; blockers 2 e 4 da matriz WEB3 foram em parte superados por observation-integration.ts e jev-selector.ts.
- D5 INVENTARIO-ESPECIFICACOES: WVD e EXTENSIONS aparecem como não implementados (fe28f7f e ce9e211).
- D6 SPEC do piloto M2 com portas 3010 e 3011: substituídas por 3020 e 3021 (IMPLEMENTATION-NOTES).
- D7 OKX-DEX-V2-SPEC "preparada para congelamento": coberta pelo GUIDE e pela barreira de unidade.
- D8 Pesquisas sem código esperado (R7, rewards, alpha-radar, leaderboard, exit-security, dex-units, payments, auth-custody): manter como fonte.
- D9 node_modules.partial-copy e web/.next do worktree okx-real: descartar.

## 4. Trabalho não commitado fora da árvore alvo (sha256 curto, CRLF normalizado)
| Origem e item | sha curto | Decisão e motivo |
| --- | --- | --- |
| gev-wallet-pilot, 20 arquivos | 16 idênticos; adaptados (original -> integ): package.json e26868d6 -> 4b744704, page.tsx 36a67987 -> 11ebf399, policy.ts 321f6f03 -> b70071e4 (+exitWindowMs:0), gev-pilot-client.ts 2ab3918c -> 5234d90e (import espelhado, 68befbd) | já está na integ (6208bea, 68befbd); nada a fazer |
| gev-wallet-pilot `data/pilot/evidence/` (ignorado) | 8faf1e25, 036cd181, 2cc20c50, 08994e34, 380f3b57 | ARQUIVAR (A1): única cópia da fonte de aceitação e dos pareceres independentes citados por SPEC e VERIFICATION |
| gev-wallet-pilot-ui, 6 arquivos | SPEC bd35eb16 e CSS 5c44133e iguais ao piloto; protocol.ts 64232e06, Panel 8562e669, client 2b5844d6, client.test c42880bd antigos | DESCARTAR (D1): subconjunto estrito |
| okx-real-integration, 251 arquivos (sem node_modules.partial-copy) | 240 idênticos; 11 adaptados: package.json, app/page.tsx e page.module.css (movidos para app/console, nenhuma linha perdida), WalletPanel.tsx (+review), useOkxWallet.ts e wallet-store.ts (+preflight, token de sessão, invalidação), wallet-transaction-preflight.test.ts (versão mais robusta), CENTRAL-JEV-CHECKPOINT.md, OKX-HISTORICAL-ARCHIVES.md, OKX-SESSION-READINESS (versões posteriores do primário), archive-discovery.ts (superconjunto com L2 observado; hifens por D24) | já está na integ (ce9e211 e fe28f7f); nada a fazer |
| okx-real `data/real/` e `data/events.jsonl` (ignorado) | 16 arquivos, 805 KB | ARQUIVAR junto com A1 (os resumos estão em CONSOLE-LIVE-R8.json); descartar se o dono não quiser auditar ciclos |
| okx-real `node_modules.partial-copy/`, `web/.next/` | n/a | DESCARTAR (D9) |
| C:\Users\gabri\.codex\tmp\okx-real-* e jev-trader-01a1216a\okx-ecosystem\ | recibos RED/GREEN, V98 e V101 | ARQUIVAR só se o dono quiser rastreabilidade (citados por CORE-IMPLEMENTATION.md e OKX-SESSION-READINESS); senão descartar |
| inonu-system-one-safety, 98 arquivos | 98 idênticos | nada a fazer |
| Primário `undefined/contract/ACCEPTANCE.json`, `PLAN.md`, `SPEC.md` | d307aee534, 8c08e85574, 9db2cf3acc | ARQUIVAR como proposta em docs/sdd/book-replay/ (B6); a pasta `undefined` é artefato de caminho com variável indefinida e precisa sair do checkout primário, que o registro exige limpo antes de trocar para main |
| Primário `src/portfolio-evidence/**` (28) e `docs/portfolio-evidence-v1/**` (3: SPEC 6bb9710a, REPORT a75e531b) | GOAL 2 do SDD carteira (leitura pura) | ENTRAR depois de testes, quando a sessão de limpeza responder (fora do meu cluster) |
| Primário `AGENTS.md` 46ffcfbaa0; `web/.uistub.js` apagado | template do Bun; stub de UI | DESCARTAR (sem dono, sem uso) |
Primário: 145 entradas, 95 idênticas, 13 adaptadas ou excluídas de propósito (System One, layout, Rail, rail-render, package.json, useOkxWallet, reports-server, archive-discovery), 36 ausentes (linhas acima mais page.module.css movido).

## 5. Contradições entre especificação, documentos e código
1. INSTRUCAO G09 e G10 pedem escolha de ID elegível e plano; src/real/jev.ts e runtime.ts só aceitam hold e não têm candidatos (B1).
2. WALLET-PROPOSAL-REVIEW.md afirma a seção no painel; ela não é montada em nenhuma página (A4). O frescor do saldo no `/console` fica "desconhecida" (WalletPanelView sem `now`).
3. Regra congelada sem ponto mediano: 65 ocorrências renderizadas em `/console` (A5).
4. GUIA-LOCAL manda `bun --no-env-file run real:console`; o script interno carrega `.env` (A2). Aponta worktree que será removido e a UI em `/`, que agora é a mesa.
5. OKX-SPEC O2 (só Monad) e O5 (nada ao backend) contra W2 e o fluxo de consentimento aditivo (E02); VALUATION-DIAGNOSTICS-SPEC, EXTENSIONS-SPEC, INVENTARIO e okx-defi-v1/SPEC com status ultrapassado.
6. okx-ecosystem-v1/GUIA é coerente (não implementado), mas OKX-ECOSYSTEM-SPEC e OKX-ECOSYSTEM-V1-SPEC repetem E1 a E8 para duas pilhas de código.
7. ecosystem-catalog.ts:468 contradiz a documentação `upto` de pagamentos (A10).
8. CONSOLIDACAO secs 5 e 6 mantêm como pendente o flake que a674233 já mitigou (D2); a sec 3 chama o archive-discovery.test.ts do primário de "versão anterior", mas ele só difere do que entrou por 3 travessões em títulos.
9. SPEC do piloto (3010 e 3011) contra código (3020 e 3021); ambos colidem com jev-trader-main (A11).
10. O plano PROXIMAS aponta main f626a30; main atual f7be047 e integ 8d0611a; 6 das 28 âncoras de fonte mudaram.
11. O rascunho DeFi descreve candidates.ts com os três defeitos; a integ ainda os tem (A6), embora o adaptador real okx-wallet/defi.ts mantenha taxa nula e bloqueie na prática.
12. R7 propõe src/agentic-wallet; não existe e a matriz de recursos mantém T2-C bloqueado.

## 6. Riscos de segurança e de gate (resumo)
Gates: nada em src/pilot e src/real assina, envia ou aprova; o Kuru ao vivo é recusado por código (market.ts:104); o executor do operador fica fechado por padrão e não é alcançável do piloto nem do runtime real. Riscos abertos: A2 (segredos do `.env` chegam aos filhos do console), A3 (leitura de saldos por DNS rebinding), A7 (gate sem teste estático), sete assinadores HMAC duplicados (B2), consentimento envia endereço a três destinatários (backend local, OKX Web3, RPC público) por escolha explícita do dono, e sondas de pesquisa em docs com rede e escrita (A12).
