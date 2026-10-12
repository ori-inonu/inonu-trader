# Revisão independente de implementação F5/F6 — 2026-10-11

**Parecer: PASS delimitado para o candidato abaixo; nenhum defeito novo identificado em M1–M6.** Isto não aprova merge, preview, execução financeira ou conclusão do objetivo amplo.

## Identidade e limites

Autor/reviewer nativo: `01a12ada-7b55-7fd2-8a20-c940f474c1a1`, distinto do implementador `codex-inonu-system-one-safety` / conversa `01a12971-f941-7e42-8a42-fab6d44d4eb5`. Não implementei o candidato. Sol/xhigh solicitado; modelo, esforço e tier efetivos **desconhecidos**. Bun observado: 1.3.14; pacote do compilador copiado: TypeScript 7.0.2.

Origem apenas lida: `C:/Users/gabri/.codex/worktrees/inonu-jev-read-safety-f5-f6/jev-trader`. Revisão em cópia ordinary exclusiva, sem RO imposto pelo OS; o ambiente declara danger-full-access. Nenhum provider, inferência, credencial/.env, instalação, socket real, assinatura, fundos, Git mutation, push ou auxiliar usado. Guards locais de fetch/WebSocket e ambiente allowlist não constituem sandbox OS.

Baseline/HEAD confirmado: `1f08e6edd589449a82eeb70638987a09572a3bd2`; tree `15b1fe6b2ac58c5821b9ab77723610d0afe780aa`. Revisão do **WIP contra esse baseline**, somente três arquivos; não de um HEAD móvel. Os blobs baseline de read.ts/decide.ts coincidem com 2d00d8f, permitindo comparar o RED histórico independente.

## Findings e cobertura imutável

Contrato: SPEC V2:13–18, baseada em JEV-DECISAO-ONCHAIN-OS.md:56: “Jev indisponível, atrasado ou com resposta inválida significa `hold`”. Separação independente verificada altera somente a ordem do trabalho; parent preview P3/P6 segue pendente.

| Critério | Verdict | Evidência independente / fonte |
|---|---|---|
| M1 | PASS | read.ts:41–45: preabort não chama modelo; hold/error, null, 0/0/1. Insuficiência e observe-only preservados. |
| M2 | PASS | read.ts:55–78: cancelamento resolve mesmo com modelo pendente eterno; late buy e late rejection não mudam resultado nem geram unhandled rejection. Listener próprio adicionado/removido 1/1; timer criado/limpo 1/1 nos caminhos exercitados. Caller signal não é abortado internamente. |
| M3 | PASS | read.ts:50,59–74: modelo bloqueando ≈25ms, prazo 1ms, termina hold/timeout; signal interno abortado. Timeout pendente e throw/error preservados. Rejeição após retorno, não preempção. |
| M4 | PASS | decide.ts:42–50: MAX+MAX e MIN/MAX tornam-se hold/malformed/null/0,0,1 no produtor e projeção. Total/probabilidades finitos e peso escolhido positivo; ambos 3:1, bare choice, zero, negativos/NaN/Infinity, identidade e uso desconhecido preservados. |
| M5 | PASS | read.ts:31–44,65; public-view.ts:57–95: schema/statuses, advisory/never, state copy, decisões válidas e projeção observados. Não há dependência de ocultar um produtor inválido no HTTP. |
| M6 | PASS delimitado | Replay imutável F5/F6 passa; affected 143/0 e backend tsc exit0 independentes; diff check0. RED→GREEN por slice consta no documento do coordenador, não foi reexecutado integralmente neste review. RED independente anterior e novos GREEN estão preservados. |

O probe completo retorna **exit1: 14 PASS / 9 FAIL, 23 casos**. F5/F6 e TOKEN passam; F1–F4 continuam FAIL: candles futuros +1/+5000ms; timestamps stale WS/REST mascarados por receipt; funding incorreto/stale/sem timestamp; janela 60s não demonstrada e truncamento de trades sem flag. Não são corrigidos por este diff. O probe mantém literalmente seu label antigo `candidate=2d00d8f`; a execução atual é vinculada aos hashes físicos abaixo.

F1–F4, roundtrip economics, integrações/qualificação, preview e gates de integração permanecem obrigatórios. Nenhuma aceitação foi enfraquecida; nenhum escopo adicional de produção identificado.

## Execuções reproduzíveis e registros

Fixture: `C:/Users/gabri/.codex/worktrees/inonu-system-one-review-spec-20261011/jev-read-f5-f6-isolated-1f08e6-20261011-01a12ada`.

Prefixo exato dos comandos: `C:/Users/gabri/.bun/bin/bun.exe --no-env-file --no-install --preload ./offline-guard.ts`. As linhas abaixo são os argumentos seguintes, executados pelo adapter RTK/Headroom, uma vez por comando, com stdout/stderr/exit JSON preservados.

| Argumentos | Resultado observado | Registros na fixture |
|---|---|---|
| `test ./src/jev-read` | exit0; 143 pass, 0 fail, 371 expect() calls; 6 arquivos, 721ms | `candidate-focused-{stdout.log,stderr.log,exit.json,metrics.json}` |
| `./reviewer-boundary-probe.ts` | exit1; 14/9, 23 casos; F5/F6 PASS; TOKEN 135/135 | `immutable-boundary-{stdout.log,stderr.log,exit.json,metrics.json}` |
| `./reviewer-lifecycle-probe.ts` | exit0; 83/83 checks; M1–M5 PASS | `lifecycle-{stdout.json,stderr.log,exit.json,metrics.json}` |
| `./node_modules/typescript/bin/tsc --noEmit -p tsconfig.verification.json` | exit0; stdout/stderr vazios; backend src/scripts | `independent-backend-tsc-{stdout.log,stderr.log,exit.json,metrics.json}` |

Bun incluiu clock.test.ts no filtro, devido ao nome da fixture: os 143/371 não devem ser confundidos com 118/337 em cinco arquivos relatados pelo coordenador. A suíte focused e os probes precederam a expansão pública para typecheck; fontes testadas permaneceram inalteradas. Não executei suíte global/frontend/browser nem modelo real. RTK retornou bytes originais (archive_id null); não há alegação de compressão/ganho.

Extração selecionou somente fontes/configurações públicas do baseline; três arquivos WIP copiados byte a byte. Dependências públicas já instaladas foram copiadas, sem instalar ou executar scripts de instalação. `snapshot-manifest.json` e `typecheck-snapshot-extension.json` registram origem/hashes; finais de linha CRLF de 61 arquivos de baseline previamente extraídos foram preservados, comparados por conteúdo e registrados. `final-integrity-check.json` confirma HEAD/tree, SPEC, fontes, probe original e relatório histórico intactos após os testes.

Erros de preparação, não regressões: `AssertionError: src/jev-read/feed.test.ts` decorreu de CRLF no Git archive versus git show; resolvido com override somente do processo, sem alteração de Git config. `FileNotFoundError: [Errno 2] No such file or directory` para dependência nested `@ethersproject/address/lib/_version.d.ts.map` excedia caminho tradicional Windows; recuperado com caminho extended-length, sem mudança de configuração OS. Erros exatos/path constam no manifesto de extensão. Uma leitura inicial com wildcard como path gerou `os error 123`; leitura posterior delimitada resolveu. Exibição Python cp1252 gerou `UnicodeEncodeError` em U+2192, corrigida somente na codificação stdout; SPEC não alterada. Transporte truncou uma leitura extensa de JSON; resumos seguintes e arquivos brutos preservados confirmaram os resultados.

## Hashes atuais (SHA256)

| Artefato | SHA256 |
|---|---|
| `src/jev-read/read.ts` | `0422288919d60e969f76b21acee97802cda8ab9028fb73044c9817233b247b52` |
| `src/jev-read/decide.ts` | `e46315754bafad687e25d39dc511fb6cba4e74af79bebe527e4605db1283358c` |
| `src/jev-read/read.test.ts` | `11c5ef9979fd9abedcdac42abfea43b36e1508ecc590983d9c65a44dbd957828` |
| `docs/JEV-READ-MODEL-SAFETY-SPEC-V2-20261011.md` | `f16fce55851a50011239a11bbd8878c072c101035b3304e6fbba251128138262` |
| `docs/JEV-READ-SAFETY-SEPARATION-REVIEW-20261011.md` | `f833964e750c5f7be86f04cfca4031434730d4699a4678ac17fbe219326c00d0` |
| `docs/JEV-READ-F5-F6-TDD-EVIDENCE-20261011.md` | `fc1356df5a4161e50a2b533a37c17519be1dad4cb0db133c2e73edfe72c7c345` |
| `docs/INONU-F5-F6-CHECKPOINT-20261011.md` | `6de47aadb0fcf280549ee78c8fca7b414884a8d8c1cf25335e32ecfe71c0919d` |
| `jev-read-0541475-regression-review-20261011.md` | `463a69063c76c32c9543c750b023788d68be7ff9f20113e7bc4ed894b884fae2` |
| `committed-jev-2d00d8f-schjw8q8/reviewer-boundary-probe.ts` | `a7a44e9482c1635bb73307e6bcc2a3c599591548442f1a0843953332c326091e` |
| `fixture/candidate.diff` | `87a0490221281664c0b0c1358f24dfb7a3e61bff0636447a2a8b64a07c4528a6` |
| `fixture/snapshot-manifest.json` | `233762c929e37c73e1f069eed1159f66302fd0eab2be1624cc80b99ff5c17591` |
| `fixture/typecheck-snapshot-extension.json` | `26e12beb1c89204b2e9dd43d3464952adfac8d9183fb6c2ce614993d8e353fd5` |
| `fixture/reviewer-lifecycle-probe.ts` | `06871530446ecd5a090fb17a6a8030650479c200b907fb1d683b79ed18d2bf00` |
| `fixture/offline-guard.ts` | `13e0b64a77c7cb8414db0325a00b259dbff30eea83eb4959110f0f62d31bd2a9` |
| `fixture/final-integrity-check.json` | `6c91c1eaa8082a2e050c5217e54a08c6e8759144d1794f307b21a043f775e18e` |

Hashes de todos os streams/recibos: `final-integrity-check.json`, incluindo stderr focused (Bun) `712e7c…` e stdout do boundary `9e0cca…`; consulte o manifesto para valores completos.

| Evidência direta | SHA256 |
|---|---|
| `candidate-focused-stderr.log` | `712e7ceb2bf8d9f95499cae7c1e37781fdc3e031c6b905e85b4432253ee53b7c` |
| `candidate-focused-exit.json` | `6bbbfdbd666234efbf91ab6c35b6fb8b1c48dd522f685f45a0db04687d0ca060` |
| `immutable-boundary-stdout.log` | `9e0cca4ceb37d081fb36f530b6c111d08a4d35c96a0621f5291b39adcd4e1d7a` |
| `immutable-boundary-exit.json` | `578366d44c40c0ecd0c1d43e9a8a7af51b50d2bfd081daf6fd18651dc094fec4` |
| `lifecycle-stdout.json` | `f607d41c0e2ecf242e96c5c7a5f48f9ac8de1871872d7af79cf5210899d69d0b` |
| `lifecycle-exit.json` | `42f9c306ac9a1bfe5aa3ee8e66318d8e1a0ce700410c73bec221cd97f966b384` |
| `independent-backend-tsc-exit.json` | `6795e0a9a112d54bfdc2d67995878b619588d70de46eb396a94fcffead868547` |

**Terminal do review:** PASS apenas da correção subordinada F5/F6 nestes hashes. Relatório independente, não autoaprovação, não autoridade para gastar/tradear; commit/integração seguem responsabilidade do coordenador e respectivos gates. Objetivo amplo permanece incompleto.
