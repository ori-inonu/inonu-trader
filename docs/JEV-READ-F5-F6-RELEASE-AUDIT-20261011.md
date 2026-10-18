# Auditoria independente de prontidão F5/F6 — 2026-10-11

**APPROVE — prontidão delimitada para commit local somente dos três fontes vinculados abaixo.** Nenhum bloqueador novo identificado. O candidato é elegível para integração local autorizada; a árvore resultante de main não foi auditada aqui e sua aprovação final depende de verificar a integração. Não significa conclusão do objetivo amplo ou autorização financeira.

## Identidade e escopo

Reviewer nativo observado: `01a12ada-7b55-7fd2-8a20-c940f474c1a1`, distinto do implementador `codex-inonu-system-one-safety` / `01a12971-f941-7e42-8a42-fab6d44d4eb5`. Sou o autor da revisão independente técnica anterior, não um segundo revisor distinto; não implementei o candidato. Sol/xhigh solicitado/configurado por papel; modelo, esforço e tier efetivos desconhecidos.

Origem apenas lida: `C:/Users/gabri/.codex/worktrees/inonu-jev-read-safety-f5-f6/jev-trader`. Evidência exercitada na cópia exclusiva `jev-read-f5-f6-isolated-1f08e6-20261011-01a12ada` nesta pasta. Cópia ordinária, sem RO imposto pelo OS; ambiente danger-full-access. Este audit escreveu somente este arquivo. Não executou testes novamente, instalação, providers/inferência, rede, credenciais/.env, wallet/signers/fundos, auxiliares, Git mutação, merge/push/deploy ou alteração de goal/harness. Advice não confere autoridade.

Baseline/HEAD atual: `1f08e6edd589449a82eeb70638987a09572a3bd2`; tree `15b1fe6b2ac58c5821b9ab77723610d0afe780aa`. WIP contra baseline, não comparação three-dot vazia. `git status --porcelain --untracked-files=no` mostrou somente os três arquivos modificados; index vazio. Diff atual equivale byte a byte ao `candidate.diff` exercitado; `git diff --check` exit0. Feed/state/types/public-view permanecem equivalentes ao baseline. Não auditei main móvel.

## Aceitação e findings

SPEC V2:13–18 preservada; JEV-DECISAO-ONCHAIN-OS.md:56 exige hold para resposta indisponível/tardia/inválida.

| Critério | Verdict | Evidência lida nesta auditoria |
|---|---|---|
| M1 | PASS | read.ts:41–45; probe original zero chamadas/preabort hold/error, 0/0/1/null. Lifecycle preserva insuficiência e observe-only. |
| M2 | PASS | read.ts:55–77; lifecycle cancelamento com modelo nunca resolvido, late buy e late rejection sem aceitação/unhandled; listener e timer próprios 1/1, signal do caller preservado. |
| M3 | PASS | read.ts:50,59–74; retorno bloqueante ~25ms com prazo 1ms gera hold/timeout e aborto interno; pending timeout e thrown error passam. Rejeição quando JS retorna, sem preempção. |
| M4 | PASS | decide.ts:42–50; overflow MAX+MAX e underflow escolhido MIN/MAX rejeitados como hold/malformed pelo produtor e projeção; ambos controles 3:1, bare choice, pesos inválidos, identidade/uso preservados. |
| M5 | PASS | read.ts:31–44,65; projeção pública e schema/status/advisory/never preservados; timely válido e state copy cobertos. Public-view/types não alterados. |
| M6 | PASS delimitado | TDD documental:13–21 registra RED→GREEN por slice; revisão independente e replay original completos antes de commit, focused143/0/371 e backend tsc exit0. Logs/recibos/hashes conferidos; não replay de todos os RED históricos nem integração futura. |

Probe completo mantém **exit1, 14 PASS/9 FAIL em 23 casos**: F5/F6/TOKEN PASS; F1–F4 FAIL. Persistem candle futuro, receipt mascarando timestamps provider stale, funding incorreto/stale/sem timestamp e falsa cobertura/truncamento de janela de trades. Não foram resolvidos, dispensados ou reclassificados por este ciclo. Label antigo `candidate=2d00d8f` foi preservado; hashes físicos vinculam a execução atual.

Roundtrip economics, integrações/qualificação e parent preview P3/P6 permanecem pendentes. Separação independente altera agenda, não critérios. Nenhum escopo adicional de produção encontrado.

## Evidência exata e integridade

Todos os caminhos de logs abaixo estão na fixture exclusiva citada. Li os recibos e conteúdo bruto pertinentes, e recalculando os hashes confirmei os 22 artefatos de `final-integrity-check.json`; os três fontes exercitados equivalem byte a byte ao candidato atual. Histórico/probe original e relatório técnico anterior preservados.

| Execução anterior independente, não repetida | Resultado direto |
|---|---|
| Bun `--no-env-file --no-install --preload ./offline-guard.ts test ./src/jev-read` | `candidate-focused-exit.json` exit0; stderr:143 pass/0 fail/371 expects, 6 arquivos, 721ms. O filtro incluiu clock.test.ts; não confundir com coordinator118/337/5 arquivos. |
| Mesmo prefixo + `./reviewer-boundary-probe.ts` | `immutable-boundary-exit.json` exit1; stdout: F5/F6 PASS, nove falhas F1–F4. TOKEN135/135. |
| Mesmo prefixo + `./reviewer-lifecycle-probe.ts` | `lifecycle-exit.json` exit0; JSON83/83, M1–M5 PASS. |
| Mesmo prefixo + `./node_modules/typescript/bin/tsc --noEmit -p tsconfig.verification.json` | `independent-backend-tsc-exit.json` exit0; stdout/stderr vazios. Backend src/scripts; não frontend/global/browser. |

Bun1.3.14 observado na execução; allowlist de ambiente, dependências públicas já instaladas e guards fetch/WebSocket são evidência offline, não sandbox OS. RTK/Headroom preservou os streams originais, sem alegação de ganho. RED históricos são evidência documental do coordenador, não reexecução independente de cada slice. `TDD-EVIDENCE:28` ainda diz review pending; o relatório técnico lido e hash-bound resolve essa condição documental sem editar o histórico.

Leituras desta auditoria: chunks `cee9ef` (SPEC/reports/hashes), `3d4a79` (diff), `15ec89` (HEAD/tree), `1aea8d` (recibos, resultados, index/diff check), `f1dc8d` (integridade22/TDD/contratos), `eb26d2` (recuperação bounded dos checks e equivalência do diff): todos exit0. Uma saída extensa de leitura foi truncada; resumo bounded subsequente validou os 83 checks e os hashes dos brutos. Harness próprio recuperado sem mutação: rev0/research/idle; metadata não concede aprovação ou substitui o objetivo nativo.

## Hashes atuais SHA256

| Artefato | Hash |
|---|---|
| src/jev-read/read.ts | `0422288919d60e969f76b21acee97802cda8ab9028fb73044c9817233b247b52` |
| src/jev-read/decide.ts | `e46315754bafad687e25d39dc511fb6cba4e74af79bebe527e4605db1283358c` |
| src/jev-read/read.test.ts | `11c5ef9979fd9abedcdac42abfea43b36e1508ecc590983d9c65a44dbd957828` |
| SPEC V2 | `f16fce55851a50011239a11bbd8878c072c101035b3304e6fbba251128138262` |
| JEV-READ-SAFETY-SEPARATION-REVIEW-20261011.md | `f833964e750c5f7be86f04cfca4031434730d4699a4678ac17fbe219326c00d0` |
| jev-read-f5-f6-implementation-review-20261011.md | `f2cbd98c0456759e4d6964cd5f1255ebda2cbb369ce306e9553dfa9e08953121` |
| Relatório original jev-read-0541475-regression-review-20261011.md | `463a69063c76c32c9543c750b023788d68be7ff9f20113e7bc4ed894b884fae2` |
| Probe original e sua cópia exercitada | `a7a44e9482c1635bb73307e6bcc2a3c599591548442f1a0843953332c326091e` |
| candidate.diff atual/preservado | `87a0490221281664c0b0c1358f24dfb7a3e61bff0636447a2a8b64a07c4528a6` |
| JEV-READ-F5-F6-TDD-EVIDENCE-20261011.md | `fc1356df5a4161e50a2b533a37c17519be1dad4cb0db133c2e73edfe72c7c345` |
| final-integrity-check.json | `6c91c1eaa8082a2e050c5217e54a08c6e8759144d1794f307b21a043f775e18e` |
| candidate-focused-stderr.log | `712e7ceb2bf8d9f95499cae7c1e37781fdc3e031c6b905e85b4432253ee53b7c` |
| candidate-focused-exit.json | `6bbbfdbd666234efbf91ab6c35b6fb8b1c48dd522f685f45a0db04687d0ca060` |
| immutable-boundary-stdout.log | `9e0cca4ceb37d081fb36f530b6c111d08a4d35c96a0621f5291b39adcd4e1d7a` |
| immutable-boundary-exit.json | `578366d44c40c0ecd0c1d43e9a8a7af51b50d2bfd081daf6fd18651dc094fec4` |
| lifecycle-stdout.json | `f607d41c0e2ecf242e96c5c7a5f48f9ac8de1871872d7af79cf5210899d69d0b` |
| lifecycle-exit.json | `42f9c306ac9a1bfe5aa3ee8e66318d8e1a0ce700410c73bec221cd97f966b384` |
| independent-backend-tsc-exit.json | `6795e0a9a112d54bfdc2d67995878b619588d70de46eb396a94fcffead868547` |
| tsc stdout/stderr vazios, cada | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |

## Integração e terminal

Somente read.ts, decide.ts e read.test.ts podem compor o commit delimitado; SPEC, probes, relatórios, dependências e estados locais não fazem parte dele. Antes da integração, o coordenador deve conferir a identidade do commit/árvore alvo, preservar concorrência e eventuais resoluções, e verificar affected/typecheck e gates aplicáveis na árvore resultante. Alteração dos bytes/seams invalida a ligação automática deste parecer. Não verifiquei nem certifico a futura árvore main.

**Terminal: APPROVE da prontidão do candidato para commit local no escopo F5/F6; integração resultante ainda não certificada.** Autorização para commit/main merge provém do usuário, não deste relatório/JEV/harness. F1–F4 e o objetivo central completo continuam incompletos; nenhum gasto/trade/live, push ou deploy autorizado aqui.

Conferência final de hashes nesta auditoria (UTC): `2026-10-11T21:16:41.735522+00:00`.
