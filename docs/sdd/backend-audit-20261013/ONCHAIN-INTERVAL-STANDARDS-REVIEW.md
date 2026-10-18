# Revisão independente: reparo do intervalo Onchain

Decisão: **reject** para o candidato reparado por um resíduo de correctness em OR-04. Padrões documentados: zero violações materiais. Heurísticas Fowler: zero achados que justifiquem refatoração. `reviewer_id=audit_okx`, conversa própria `01a13629-5b7c-7bf0-82c5-38d1b3b67c07`, 2026-10-13. Não implementei o candidato e não alterei suas fontes.

## Parecer, menos de 400 palavras

**Correctness, P2, preparo da URL após o marco:** `src/onchain-read/client.ts:134-135` grava `lastSentMs = deps.now()` antes de avaliar `BASE + request.path`. OR-04 exige preservar o intervalo global, e o comentário do hunk afirma medir o despacho depois de todo preparo síncrono. Uma entrada pública válida `ProviderRequest` (`catalog.ts:21-25`), com getter `path` que sempre retorna a mesma string e bloqueia 80 ms apenas na segunda leitura, ainda consome o intervalo depois do marco. Duas chamadas concorrentes retornaram sucesso e `sent=true`, mas os fetches ficaram separados por **2 ms de parede e 1,7491 ms monotônico**, contra o critério inalterado de pelo menos 38 ms para intervalo configurado em 40 ms. Fixture e saída exatas estão anexas. Preparar a URL antes do marco e adicionar essa regressão é a correção mínima recomendada; não a implementei.

O catálogo atual constrói objetos simples (`catalog.ts:115-123`). Logo, a contraprova demonstra incompletude do contrato público e do preparo, sem demonstrar ocorrência desse getter na integração real. Não atribuo esta entrada sintética à falha LIVE original. Trata-se de resíduo do mesmo defeito de ancoragem previamente diagnosticado, sem alegar regressão introduzida por este reparo.

**Padrões documentados:** Bun e `bun:test` atendem `AGENTS.md:10,29` e `CLAUDE.md`. O diff não introduz frameworks, I/O de arquivos ou texto renderizado; preserva a fronteira read-only e não alcança o contrato central de negociação em `AGENTS.md:113-125`. Regras já cobertas pelo compilador não foram repetidas como revisão manual.

**Heurísticas:** o `RequestInit` local organiza preparo exigido; não é Speculative Generality. O `test.each` reúne os três casos de credenciais, evitando duplicação relevante. Nenhum outro smell material no diff incremental. As heurísticas são julgamento, com prevalência do repositório.

Verificação própria: **199 testes/775 expects/11 arquivos, zero falhas**, tipos focados estritos exit 0; seis contraprovas adicionais/31 expects passaram. A sétima contraprova reprovou o intervalo. Os quatro hashes e a SPEC coincidem antes/depois. A revisão Spec separada e aprovações históricas não substituem esta decisão.

## Evidência comportamental e critérios

| Critério | Cobertura examinada neste candidato |
| --- | --- |
| OR-01 | Gateway e seus testes preservados por hash; a suíte própria executou cap concorrente, teto dinâmico, rollover UTC, enviados/recusados, contabilização por líder, histórico e stale. Não amplia o limite por instância para limite entre processos. |
| OR-02 | A suíte própria executou cooldown 429/50011, bloqueio 402 por camada, expiração e credenciais após espera. Contraprovas próprias confirmaram estes gates quando abertos pelo retry: queued `sent=false`, zero fetch extra em cooldown e camada free ainda elegível após 402 premium. |
| OR-03 | A suíte própria executou fetch/corpos 200/401/403 pendentes, rejeições e sucesso tardios. Contraprova própria reteve o corpo do retry até timeout de 90 ms: resultado `provider_error/sent=true`, próximo caller concluiu, signals do envio/retry iguais e abortados, corpo 50011 tardio não modificou status nem abriu cooldown. |
| OR-04 | HMAC, normalização, HTTP, cache, budget e intents mistos executados na suíte de 199. Regressões novas dos getters de credenciais passaram sem relaxar >=38 ms. Contraprova própria de secret lento no segundo preparo confirmou gap retry→fila de 50 ms/50,4351 ms. Passphrase lento em três envios confirmou gaps de 124/123,9221 e 139/138,9689 ms. A URL lenta após o marco permanece reprovada. |

O retry de clock skew continua limitado a uma tentativa na mesma operação, preservando o comportamento anterior. A medição acima verifica o intervalo entre o retry e a operação seguinte da fila, sem inventar um novo requisito de espera dentro da própria tentativa de retry.

Limitações temporais: getters bloqueantes são injeção controlada de pausa síncrona, não telemetria do provedor. Timers JavaScript não interrompem trabalho síncrono nem garantem execução no instante nominal; suspensão do processo pode atrasar o timer ou ocorrer entre duas instruções adjacentes. `Date.now` também não é um relógio monotônico. Usamos `performance.now` como observação independente nos fixtures, sem substituir o clock do contrato. Estes limites não eliminam a contraprova: aqui há uma avaliação identificável e evitável entre o marco e o fetch. Não há evidência suficiente para atribuir a falha LIVE original a HMAC, GC, suspensão ou getters específicos.

Não houve .env real, credenciais reais, rede, modelo pago, servidor, carteira, ordem, assinatura de transação, operação Git, staging ou commit. O wrapper RTK executou apenas comandos locais com Bun `--no-env-file`. A revisão não certifica carteira live, crescimento de capital, desempenho ou regra de 300 ms. CAS e qualificação após integração são responsabilidades do integrador.

## Anexo: ponto fixo e hashes

Candidato somente leitura: `C:/Users/gabri/.codex/tmp/backend-01a1361d-v2/review-interval-standards`. Baseline original: pasta irmã `baseline`; comparação incremental: irmã `review-standards`. Sem commits novos ou operações Git. Diffs exatos produzidos por `difflib.unified_diff`, normalizando somente os finais de linha para leitura: `onchain-interval-standards-review-diff-{baseline,review-standards}.log`. Hashes usam os bytes originais, sem normalização.

SPEC imutável: `docs/sdd/backend-audit-20261013/ONCHAIN-SPEC.md`, SHA256 `4ef3aadfbb0baec1c9fdd4fb262312fd425864d53718abad9d9ba6fe94735ec3`, antes = depois. Os JSON `onchain-interval-standards-review-hashes-{before,after}.json` registram também os quatro hashes originais e do candidato anterior.

| Fonte em `src/onchain-read/` | Candidato reparado SHA256, antes = depois |
| --- | --- |
| client.ts | `4475897af74b7ffec9d28396f05ec669832438c2c0ee7e94431178e97034f999` |
| client.test.ts | `80cae12cdecfe2d914582e444c1a34d06d8393da97db254b16070c07a535785f` |
| gateway.ts | `62b3a8110719f4896d7b08a8da86e6f71080c25fa76e26b0451db7c62f59be42` |
| gateway.test.ts | `9ad74d46714a5747432ffc812e8dab39c5f0f652aa02b5da304a4d006da61648` |

Fontes locais consultadas:

- `AGENTS.md` e `CLAUDE.md`, ambos SHA256 `17c63ea3c3328fbbd5cf0cf3934af0dd6ee142b9e4bf6e3b5b58724277dfdc34`.
- `ONCHAIN-INTERVAL-DIAGNOSIS.md`, SHA256 `e9253abca718575cf16bfd85f005b357fa69789b93a65e2c7ca06f383506cdfe`, diagnóstico anterior independente. A falha LIVE relatada de 195 pass/1 fail e gap 1 ms é evidência histórica, não execução própria deste candidato.
- `ONCHAIN-INTERVAL-VERIFICATION.md`, SHA256 `82acb3e9332da6c05787e628125d2019697651f487efb0804f53000e248cb3d4`, e `evidence/onchain-interval-candidate.json`, SHA256 `e0941d26ea67987e07d2909536a0552779dcf4b4018e62a45d98e2f29283b317`. Foram lidos como evidência fornecida; seus red logs não são atribuídos a esta revisão.
- `catalog.ts`, SHA256 `49819c3cedd833948ab409fb6ecf83dfc83ccd2165e275ad046b7417a7298a18`; `sign.ts`, SHA256 `a77626f1b613a91ce574c6d9e609f3c0d10ee13140afb1746645b249556f4e5b`.
- Skill code-review `C:/Users/gabri/.agents/skills/code-review/SKILL.md`, SHA256 `47f4e52c21694def9c7c11cbfbf891ca35eac7a93e395797515be3c8a409ae50`, com baseline Fowler tratado como heurística. Harness `C:/Users/gabri/.codex/skills/codex-desktop-harness/SKILL.md` e playbook foram lidos nesta conversa. Não abri subagentes nem consultas externas.

Hunk reprovado, com linhas exatas do candidato:

```ts
// client.ts:133-135
// Measure dispatch after all synchronous preparation, including credential access and signing.
lastSentMs = deps.now();
res = await deps.fetch(BASE + request.path, init);
```

## Anexo: comandos próprios e saídas literais

Runner: `research/onchain-interval-standards-review-run.py`. Para cada modo `suite`, `types`, `counterexamples`, `url`, executado:

Artefatos próprios: runner SHA256 `28b0e78b4c1367880403ccc6ee6a9cf84d3a6212e0c0dfa6fb8133603986ba57`; fixture positiva `onchain-interval-standards-review-counterexamples.test.ts` SHA256 `6cdc9dc2a12399a74637c0ebac2f0b563734a73fad6dce1383c46a1261ce517b`; fixture reprovada `onchain-interval-standards-review-url.test.ts` SHA256 `a10fb8b7f02d07d14c44389f4bcfc2046e6079e016134236832531726cd2c371`.

```powershell
& 'C:/Users/gabri/.codex/tools/rtk-headroom-20261010/venv/Scripts/python.exe' 'C:/Users/gabri/.codex/tmp/backend-01a1361d-v2/research/onchain-interval-standards-review-run.py' '<modo>'
```

O runner chama `adapter/adapter_cli.py run --cwd <candidato> --timeout 45 --profile test|build --rtk <runtime>/bin/rtk.exe --headroom-python <python> --store <prefixo>-store --metrics <prefixo>-<modo>-metrics.json -- <argv>`. Timeout externo 55 s. Arquivos JSON por modo preservam argv completo, exit code, tamanho e SHA256 de ambas as streams. O RTK preservou bytes sem compressão: `command_not_allowlisted` nas execuções bem-sucedidas, `command_unsuccessful` na contraprova reprovada, `archive_id=null`.

Suíte, argv `bun --no-env-file test ./src/onchain-read`, exit 0:

```text
 199 pass
 0 fail
 775 expect() calls
Ran 199 tests across 11 files. [2.09s]
```

Tipos, exit 0, stdout/stderr vazios:

```text
bun --no-env-file node_modules/typescript/lib/tsc.js --ignoreConfig --noEmit --strict --skipLibCheck --noUncheckedIndexedAccess --noImplicitOverride --noFallthroughCasesInSwitch --verbatimModuleSyntax --allowImportingTsExtensions --moduleResolution bundler --module preserve --moduleDetection force --target ESNext --lib ESNext --types bun ./src/onchain-read/client.ts ./src/onchain-read/client.test.ts ./src/onchain-read/gateway.ts ./src/onchain-read/gateway.test.ts
```

Contraprovas positivas, argv `bun --no-env-file test <research>/onchain-interval-standards-review-counterexamples.test.ts`, exit 0:

```text
 6 pass
 0 fail
 31 expect() calls
Ran 6 tests across 1 file. [830.00ms]
```

Contraprova da URL, argv `bun --no-env-file test <research>/onchain-interval-standards-review-url.test.ts`, exit 1. Sem patch de fonte, apenas import do cliente público e transporte fake:

```text
{"wall":2,"monotonic":1.7490999999999985,"reads":2}
Expected: >= 38
Received: 2
 0 pass
 1 fail
 3 expect() calls
Ran 1 test across 1 file. [234.00ms]
```

| Stream própria preservada | Bytes | SHA256 |
| --- | --- | --- |
| suite stdout | 28 | `d6684989b8dd63b37d2f1954270826fbe1bd89a8debd12bcacf03ed1c6140ef6` |
| suite stderr | 19701 | `133b6203d90eab527f8005b514b92c5381a6260bf23acdf78736b34e2319a052` |
| counterexamples stdout | 193 | `6fd0fee7df6b9bef8f0d88b6e0b2797a91f2e75abb74074a0b289d2cf6c9efec` |
| counterexamples stderr | 647 | `8957994fbf0ca68e4813d3b982e8e020297b54805de35d17473781650e9667dc` |
| url stdout | 80 | `b23e4c2221bf645fd0298f6d020937dd55ddf181d5569123f7a2cd69f9b292d7` |
| url stderr | 933 | `841ec41b4bb3b06a37ea966519fda1c826e220bcb80a5f0e31a541ec427838a7` |
| types stdout e stderr, cada | 0 | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |

Próximo passo prioritário: o integrador deve preparar a URL antes do marco, incorporar o red deste caso sem relaxar o intervalo, verificar um novo candidato e solicitar nova revisão por hash. Esta versão permanece reprovada, apesar da suíte existente verde.
