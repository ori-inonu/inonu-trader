# Revisão independente final Onchain: padrões e correção

Revisor: `audit_okx` (`/root/audit_okx`). Decisão: **approve**, restrita ao candidato congelado e ao eixo de padrões/correção offline. Data: 2026-10-13. Fontes somente leitura em `../review-interval-final-standards`; nenhuma implementação pelo revisor.

O preparo de `RequestInit`, URL e transporte acontece antes de `lastSentMs`, imediatamente seguido do despacho em `src/onchain-read/client.ts`, linhas 133 a 137, dentro de cada tentativa. A assinatura mantém os mesmos argumentos; `bind(deps)` preserva o receptor da antiga chamada `deps.fetch(...)`, confirmado por controle independente. O gateway permanece byte a byte igual ao candidato anterior.

**Violações documentadas: nenhuma encontrada.** Aplicados `AGENTS.md`/`CLAUDE.md` (Bun e Bun:test, fronteiras do backend e contrato do demo), SPEC congelada e a skill local `code-review`. O reparo conserva a fila, os envelopes, os gates e o prazo compartilhado. Não houve edição de áreas reservadas ou mudança dos critérios para obter green.

**Heurísticas Fowler: nenhuma recomendação obrigatória.** Os blocos de regressão em `client.test.ts:235` e `:263` repetem medição e asserts, mas expõem separadamente preparo de URL e leitura do transporte. Julguei a duplicação aceitável pela clareza causal. Os nomes explicam a responsabilidade e não há abstração adicional, delegação sem responsabilidade ou mudança lógica espalhada que justifique refatoração neste hunk.

A suíte independente passou **201 testes, 783 asserts, 11 arquivos**; tipos estritos dos quatro arquivos: exit 0. Nove controles públicos próprios passaram, **49 asserts**. A mesma contraprova de path que rejeitou a versão anterior agora mede 56 ms de parede e 56.2198 ms monotônicos. Preparo lento no retry conserva o intervalo até a próxima chamada e o receptor do transporte.

Limitação: temporizadores JavaScript não oferecem prazo rígido sob bloqueio síncrono ou suspensão do processo; `deps.now` continua sendo relógio de parede. Os getters sintéticos reproduzem etapas de preparo, sem atribuir esses getters à falha LIVE original. Esta aprovação não integra LIVE, não certifica provedor/carteira/ML, negociação ou regra de 300 ms. Integração por CAS e revisão SPEC distinta pertencem às etapas do integrador.

## Anexo: identidade, fontes e hashes

SPEC: `../review-interval-final-standards/docs/sdd/backend-audit-20261013/ONCHAIN-SPEC.md`, SHA256 `4ef3aadfbb0baec1c9fdd4fb262312fd425864d53718abad9d9ba6fe94735ec3`. Critérios OR-01 a OR-04 permaneceram congelados.

| Fonte | SHA256 antes e depois, idênticos |
| --- | --- |
| `src/onchain-read/client.ts` | `35b8862b67d448e4eb104fb5353825d95839e311c62d92e127ac17367aa08e93` |
| `src/onchain-read/client.test.ts` | `6b57c61efe134aec6d7b7f9afbb06c1b67c85ca36b483405547f0ba97efa6c65` |
| `src/onchain-read/gateway.ts` | `62b3a8110719f4896d7b08a8da86e6f71080c25fa76e26b0451db7c62f59be42` |
| `src/onchain-read/gateway.test.ts` | `9ad74d46714a5747432ffc812e8dab39c5f0f652aa02b5da304a4d006da61648` |
| `AGENTS.md` e `CLAUDE.md`, cada um | `17c63ea3c3328fbbd5cf0cf3934af0dd6ee142b9e4bf6e3b5b58724277dfdc34` |
| `ONCHAIN-INTERVAL-DIAGNOSIS.md` | `e9253abca718575cf16bfd85f005b357fa69789b93a65e2c7ca06f383506cdfe` |
| `ONCHAIN-INTERVAL-FINAL-VERIFICATION.md` | `e8f0451c0446ee176cea3f1aa73eb5c6547b2fb02f8b1c481b20277c2bc56f3a` |
| `evidence/onchain-interval-final-candidate.json` | `ce8ccd1ff91cfcad4d377f391bfec7c08ce3f8861a9a7785f31587e34e881318` |
| `src/onchain-read/catalog.ts` | `49819c3cedd833948ab409fb6ecf83dfc83ccd2165e275ad046b7417a7298a18` |
| `src/onchain-read/sign.ts` | `a77626f1b613a91ce574c6d9e609f3c0d10ee13140afb1746645b249556f4e5b` |

Registros exatos: [hashes-before](onchain-interval-final-standards-review-hashes-before.json), [hashes-after](onchain-interval-final-standards-review-hashes-after.json). O comando de comparação encerrou com exit 0 e `All source/SPEC/support hashes preserved`; os hashes dos três pontos anteriores também permaneceram iguais. Comparações locais, sem Git: [diff baseline](onchain-interval-final-standards-review-diff-baseline.log), [diff candidato inicialmente aprovado](onchain-interval-final-standards-review-diff-review-standards.log), [diff primeiro reparo rejeitado](onchain-interval-final-standards-review-diff-review-interval-standards.log).

Hunk incremental de produção, sem mudança no gateway:

```ts
const url = BASE + request.path;
const dispatch = deps.fetch.bind(deps);
// Measure dispatch after synchronous preparation, including URL and transport lookup.
lastSentMs = deps.now();
res = await dispatch(url, init);
```

Normas locais efetivamente usadas: `C:/Users/gabri/.agents/skills/code-review/SKILL.md`, SHA256 `47f4e52c21694def9c7c11cbfbf891ca35eac7a93e395797515be3c8a409ae50`; `C:/Users/gabri/.codex/skills/codex-desktop-harness/SKILL.md`, SHA256 `4d438885fe9c0646725bc82652cec4309baed5a1a570be73c0ed2b7141399b11`; playbook `C:/Users/gabri/.agents/sdd-multiagent/PLAYBOOK.md`, SHA256 `86f7b8f22e4eb2aa352ff8d021d5d8dfad1b4ba6a56156252807bce528d5c258`. Julgamento dos smells separado de regras obrigatórias; verificações de tooling não foram duplicadas como achados de estilo.

## Anexo: cobertura e controles públicos

| Critério | Evidência exercitada nesta cópia |
| --- | --- |
| OR-01 | `gateway.test.ts:75`, `:84`, `:93`, `:178`: contagem por líder, recusas sem consumo, teto concorrente/dinâmico e mês UTC; testes do ledger em `budget.test.ts` |
| OR-02 | `client.test.ts:42`, `:58`, `:163`, `:358`, `:373`: 402 por camada, credenciais após espera, cooldown 429/50011 e expiração; controles próprios para 429/50011/402 durante retry e pedidos enfileirados |
| OR-03 | `client.test.ts:77`, `:101`, `:121`, `:142`: fetch/corpo/401/403 e retry no mesmo deadline, abort ignorado e rejeições tardias; controle próprio com corpo pendente no retry, fila liberada, `sent=true`, mesmo sinal abortado e status imutável após corpo tardio 50011 |
| OR-04 | `client.test.ts:182`, `:196`, `:209`, `:235`, `:263`, `sign.test.ts`; `gateway.test.ts:121`, `:135`, `:145`, `:155`; contratos HTTP/leak/catalog/fixtures e contabilização mensal na suíte; hashes antes/depois. CAS na árvore integrada não executado pelo revisor |

Controles independentes em [counterexamples.test.ts](onchain-interval-final-standards-review-counterexamples.test.ts) e [url.test.ts](onchain-interval-final-standards-review-url.test.ts), sem tocar nos testes do candidato. Somente respostas fabricadas e credenciais sentinela `SYNTHETIC`, sem transporte real.

Resultados literais dos gaps (parede / monotônico, ms): preparo lento de secret no retry `51 / 51.365099999999984`; passphrase lenta em chamadas consecutivas `139 / 138.52370000000002` e `137 / 137.43170000000003`; deadline do corpo no retry e próxima chamada `103 / 102.99519999999995`; URL lenta no retry `56 / 56.4319999999999`; leitura lenta de transporte no retry `53 / 53.296100000000024`; path lento na contraprova anterior `56 / 56.21979999999999`. Asserts de parede e monotônico continuam `>=38` para intervalo de 40 ms; nenhuma tolerância foi relaxada.

Os dois controles de retry novos também verificaram quatro leituras do path do pedido inicial, três despachos e receptor `deps` em todos eles. Os controles de gates verificaram `sent=false` para pedidos recusados na fila e continuidade de free após 402. O teste de corpo tardio confirmou que a liberação posterior não altera status ou abre cooldown.

## Anexo: comandos e saídas preservadas

Runner [run.py](onchain-interval-final-standards-review-run.py), chamado com o Python instalado em `C:/Users/gabri/.codex/tools/rtk-headroom-20261010/venv/Scripts/python.exe`, modos `before`, `suite`, `types`, `counterexamples`, `url`, `after`. Cada execução usa `adapter/adapter_cli.py run`, cwd da cópia congelada, timeout 45 s, RTK `0.51.0`, Headroom `0.40.0`, capture binário e timeout externo 55 s. Os JSONs de cada modo preservam argv real, exit code, tamanho e SHA256 de stdout/stderr.

Comandos internos exatos:

```powershell
bun --no-env-file test ./src/onchain-read
bun --no-env-file node_modules/typescript/lib/tsc.js --ignoreConfig --noEmit --strict --skipLibCheck --noUncheckedIndexedAccess --noImplicitOverride --noFallthroughCasesInSwitch --verbatimModuleSyntax --allowImportingTsExtensions --moduleResolution bundler --module preserve --moduleDetection force --target ESNext --lib ESNext --types bun ./src/onchain-read/client.ts ./src/onchain-read/client.test.ts ./src/onchain-read/gateway.ts ./src/onchain-read/gateway.test.ts
bun --no-env-file test C:/Users/gabri/.codex/tmp/backend-01a1361d-v2/research/onchain-interval-final-standards-review-counterexamples.test.ts
bun --no-env-file test C:/Users/gabri/.codex/tmp/backend-01a1361d-v2/research/onchain-interval-final-standards-review-url.test.ts
```

| Execução | Resultado literal | stdout SHA256 | stderr SHA256 |
| --- | --- | --- | --- |
| suite | exit 0; `201 pass`, `0 fail`, `783 expect() calls`, `Ran 201 tests across 11 files. [2.21s]` | `d6684989b8dd63b37d2f1954270826fbe1bd89a8debd12bcacf03ed1c6140ef6` | `395f910e8ebbd663ee5465734152b74e4f57cbc6d4dc49d65c6f4a433a48aba5` |
| types | exit 0; stdout/stderr vazios | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |
| counterexamples | exit 0; `8 pass`, `0 fail`, `45 expect() calls`, `[1071.00ms]` | `ca618e7b583e882e846de7f9f90f654922203fdde7a34e892cdbef7bbbce1a11` | `432f92723d52ccb59c412a0e97ca22f4001b3a899a9c7a495fd48615bbb778ec` |
| url | exit 0; `1 pass`, `0 fail`, `4 expect() calls`, `[233.00ms]` | `e5c2dea4aa5b872f9dbd98c7ff6af2bb94320c5ee1b9b76e763a1cbc05420b68` | `47596acdc655051a9f80cb8304561d198d50cc390952d1920a4b706353e09f88` |

Streams completos preservados em `onchain-interval-final-standards-review-{suite,types,counterexamples,url}.{stdout,stderr}.log`, junto aos JSONs e métricas homônimos. [Hashes dos artefatos independentes](onchain-interval-final-standards-review-artifacts.json) fixam runner, fixtures, diffs e demais evidências. A integração RTK passou os bytes originais por `command_not_allowlisted`, com `archive_id=null`; o limite visual do tool não substitui os logs exatos guardados.

Evidência do autor, conferida por SHA256 sem inferir execução nossa: [author-evidence.json](onchain-interval-final-standards-review-author-evidence.json). Quatro hashes coincidem com o manifesto. Reds de URL e leitura de fetch registram literalmente `Expected: >= 38`, `Received: 0`, `0 pass`, `1 fail`; green do autor registra 201/783/11; types log vazio. Esses reds sustentam TDD junto ao histórico independente, sem equivaler a observação de provedor real.

O relatório histórico [onchain-interval-standards-review.md](onchain-interval-standards-review.md), SHA256 `3f68fac4086574e55660b12d1f16ab774a01e17766b913d5867532986bf0a2b5`, mantém **reject** para o primeiro reparo. Esta aprovação só vale para os hashes finais acima e não reescreve a rejeição.

Próximo passo delimitado: o integrador deve reunir esta revisão com a revisão SPEC distinta, executar comparação estrita de pré-imagem/candidato e verificar testes pertinentes na árvore efetivamente integrada. Sem credenciais, rede, modelos, ordens, publicação ou ampliação de escopo.
