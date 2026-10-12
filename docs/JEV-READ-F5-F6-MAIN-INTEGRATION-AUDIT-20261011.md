# Auditoria independente pós-integração F5/F6 — 2026-10-11

**PASS delimitado da integração local em `14cbb7bd2878eed0a930b324b0c50610be7cdab8`.** Nenhum bloqueador novo identificado em M1–M6. Objetivo amplo e F1–F4 permanecem incompletos.

## Findings e aceitação imutável

SPEC V2:13–18 preservada. JEV-DECISAO-ONCHAIN-OS.md:56: “Jev indisponível, atrasado ou com resposta inválida significa `hold`”.

| Critério | Verdict | Fonte / evidência independente preservada |
|---|---|---|
| M1 | PASS | read.ts:41–45; preabort zero chamadas, hold/error/null/0,0,1; insuficiência e observe-only preservados. |
| M2 | PASS | read.ts:55–77; settle com modelo eternamente pendente; late buy/rejection não muda resultado; listener/timer próprios 1/1, caller signal preservado. |
| M3 | PASS | read.ts:50,59–74; bloqueio ~25ms/prazo1ms gera hold/timeout e aborto interno; pending timeout/throw preservados. Sem preempção JS. |
| M4 | PASS | decide.ts:42–50; MAX+MAX e escolhido MIN/MAX rejeitados pelo produtor/projeção; ambos controles3:1, bare choice, pesos inválidos, identidade/uso preservados. |
| M5 | PASS | read.ts:31–44,65; public-view.ts:57–95; schema/statuses/advisory/never, state copy e timely válido preservados. |
| M6 | PASS delimitado | RED→GREEN documental, affected/backend tsc e replay independente precederam commit. Diff atual é idêntico ao revisado; somente três fontes autorizados, nenhum requisito dispensado. |

HEAD tem baseline como pai direto; status/index/untracked limpos. Diff completo contém somente read.ts, decide.ts e read.test.ts; diff check exit0. Main físico equivale byte a byte à fixture. Blobs Git são LF, checkout/fixture CRLF: conteúdo equivalente após normalização, hashes distintos explicitados abaixo.

Evidência independente anterior, relida e íntegra: focused143/0/371, exit0; lifecycle83/83, exit0; backend tsc exit0. Probe original intacto registra exit1,14PASS/9FAIL: F5/F6/TOKEN PASS; F1–F4 FAIL. Persistem candles futuros, provider stale mascarado por receipt, funding incorreto/stale/sem timestamp e falsa cobertura/truncamento de trades. Label histórico `candidate=2d00d8f` preservado; fontes/hashes vinculam a execução.

Main118/0/337 em5arquivos, exit0/chunk02b472, e tsc0/chunk0ea316 são resultados relatados pelo coordenador. Métricas lidas não contêm exit/argv/cwd/counts; `command_not_allowlisted`/`archive_id=null` não demonstram PASS nem stream arquivado. Não são reexecução independente. Evidência independente anterior aplica-se ao conteúdo integrado; nenhuma suíte repetida.

F1–F4, roundtrip economics, integrações e parent preview seguem pendentes. Sem qualificação global/frontend/browser/live ou autorização financeira/push/deploy. Guards offline não são sandbox OS; advice não é autoridade.

## Metadados / método / limitações

Reviewer nativo observado: `01a12ada-7b55-7fd2-8a20-c940f474c1a1`; implementador distinto: `codex-inonu-system-one-safety` / `01a12971-f941-7e42-8a42-fab6d44d4eb5`. Não implementei produção; sou o mesmo autor dos reviews anteriores, não um segundo reviewer distinto. Sol/xhigh solicitado/configurado por papel; modelo, effort/tier efetivos **desconhecidos**. Cópia ordinária exclusiva, RO OS não imposto; ambiente danger-full-access. Main/origem apenas lidos por instrução.

- Observação final UTC: `2026-10-11T21:26:54.171087+00:00`; branch observada: `main`.
- Main: `C:/Users/gabri/jev-trader-main`.
- Baseline/pai: `1f08e6edd589449a82eeb70638987a09572a3bd2`; tree `15b1fe6b2ac58c5821b9ab77723610d0afe780aa`.
- HEAD: `14cbb7bd2878eed0a930b324b0c50610be7cdab8`; tree `9698718595aa0c7c1b80021449f32d99eff26f92`.
- Fixture: `jev-read-f5-f6-isolated-1f08e6-20261011-01a12ada/` nesta pasta. Recalculados os 22 hashes de `final-integrity-check.json`: zero divergências. SPEC, relatórios e ambos exemplares do probe imutáveis.
- Comandos atuais somente leitura: `git show --no-patch --format=%H%n%P%n%T COMMIT`; `git diff --name-status BASE COMMIT`; `git diff --check BASE COMMIT`; `git rev-parse HEAD HEAD^{tree} BASE^{tree}`; `git --no-optional-locks status --porcelain=v1 --untracked-files=all`; `git show COMMIT:path`; `git symbolic-ref --short HEAD`; SHA256/comparação em memória. Comandos Git exit0; diff check/status vazios. Chunks pertinentes: `994c26`, `ed651e`, `ab97c2`, `de3ac5`, `0b62ea`, `ba01c6`, `5cbf02`, `a621f2`.
- Execuções anteriores via RTK/Headroom: Bun1.3.14 `--no-env-file --no-install --preload ./offline-guard.ts`, seguido de `test ./src/jev-read`, `./reviewer-boundary-probe.ts`, `./reviewer-lifecycle-probe.ts` ou `./node_modules/typescript/bin/tsc --noEmit -p tsconfig.verification.json`. Recibos registram argv/cwd/exits/streams. Focused143 inclui clock.test.ts pelo filtro; não confundir com main118 em5arquivos. Typecheck independente cobre backend src/scripts; RED por slice é documental do coordenador, não reexecução independente de todos os RED.
- Erro preservado desta auditoria: checagem inicial exigindo igualdade física/blob deu `AssertionError: src/jev-read/read.ts`, exit1/chunk882545, antes de escrever qualquer arquivo. Diagnóstico a621f2 demonstrou apenas CRLF versus LF: 80/120/270 CRLF nos três fontes, zero nos blobs; conteúdo igual normalizado. Nenhuma fonte/config alterada. Leituras extensas iniciais foram truncadas pelo transporte; leitura delimitada e hashes integrais resolveram a limitação, sem reconstruir saídas.
- Escrita exclusiva deste relatório; sem novos testes, fonte/index/config/goal/harness mutation, .env/segredos, instalações, rede/provider/modelo, wallet/signers/fundos, merge/push ou auxiliares. Estado limpo/hash-bound é observação pontual, não garantia contra escritores futuros.

## SHA256 atuais e referências duráveis

`fixture/` refere-se à fixture exclusiva acima. SPEC/separação: `C:/Users/gabri/.codex/worktrees/inonu-jev-read-safety-f5-f6/jev-trader/docs/`. Métricas main: `C:/Users/gabri/.codex/`.

| Fonte | Checkout main / fixture SHA256 (CRLF) | Blob commitado SHA256 (LF) |
|---|---|---|
| `src/jev-read/read.ts` | `0422288919d60e969f76b21acee97802cda8ab9028fb73044c9817233b247b52` | `c14a262dd08b3b60b7a1b0d9a1bf25dcdd9fea9cbcf86b74f86c6dec37febbea` |
| `src/jev-read/decide.ts` | `e46315754bafad687e25d39dc511fb6cba4e74af79bebe527e4605db1283358c` | `b8823b2dccb3c4c162ba27af530a47c1aca2fd8371e0e10d2e99af70c58c049a` |
| `src/jev-read/read.test.ts` | `11c5ef9979fd9abedcdac42abfea43b36e1508ecc590983d9c65a44dbd957828` | `cd85d2b9e52008e02921d607f850f757e327b4771099b7379b00e5cad6168299` |

| Artefato | SHA256 |
|---|---|
| `JEV-READ-MODEL-SAFETY-SPEC-V2-20261011.md` | `f16fce55851a50011239a11bbd8878c072c101035b3304e6fbba251128138262` |
| `JEV-READ-SAFETY-SEPARATION-REVIEW-20261011.md` | `f833964e750c5f7be86f04cfca4031434730d4699a4678ac17fbe219326c00d0` |
| `jev-read-f5-f6-implementation-review-20261011.md` | `f2cbd98c0456759e4d6964cd5f1255ebda2cbb369ce306e9553dfa9e08953121` |
| `jev-read-f5-f6-release-audit-20261011.md` | `98d57b006f64706a5c8721171570a3d82971223dc44fd238f86736ccc8a22625` |
| `jev-read-0541475-regression-review-20261011.md` | `463a69063c76c32c9543c750b023788d68be7ff9f20113e7bc4ed894b884fae2` |
| original e fixture `reviewer-boundary-probe.ts` | `a7a44e9482c1635bb73307e6bcc2a3c599591548442f1a0843953332c326091e` |
| committed diff / `fixture/candidate.diff` | `87a0490221281664c0b0c1358f24dfb7a3e61bff0636447a2a8b64a07c4528a6` |
| `fixture/final-integrity-check.json` | `6c91c1eaa8082a2e050c5217e54a08c6e8759144d1794f307b21a043f775e18e` |
| `fixture/candidate-focused-stderr.log` | `712e7ceb2bf8d9f95499cae7c1e37781fdc3e031c6b905e85b4432253ee53b7c` |
| `fixture/candidate-focused-exit.json` | `6bbbfdbd666234efbf91ab6c35b6fb8b1c48dd522f685f45a0db04687d0ca060` |
| `fixture/immutable-boundary-stdout.log` | `9e0cca4ceb37d081fb36f530b6c111d08a4d35c96a0621f5291b39adcd4e1d7a` |
| `fixture/immutable-boundary-exit.json` | `578366d44c40c0ecd0c1d43e9a8a7af51b50d2bfd081daf6fd18651dc094fec4` |
| `fixture/lifecycle-stdout.json` | `f607d41c0e2ecf242e96c5c7a5f48f9ac8de1871872d7af79cf5210899d69d0b` |
| `fixture/lifecycle-exit.json` | `42f9c306ac9a1bfe5aa3ee8e66318d8e1a0ce700410c73bec221cd97f966b384` |
| `fixture/independent-backend-tsc-exit.json` | `6795e0a9a112d54bfdc2d67995878b619588d70de46eb396a94fcffead868547` |
| `main-f5f6-test-20261011-2119.json` | `98591a2ae3274f8f6086942a9f66bca030614b2c69b316ac2583cc19e5b6cb61` |
| `main-f5f6-tsc-20261011-2119.json` | `0362c5d9bcdb184020f0b7a923bc687edc59fa2fbed783c64c2565024d13a277` |

**Terminal: PASS somente da integração local F5/F6 nestes hashes; F1–F4 e objetivo amplo incompletos.**
