# Revisão independente do reparo de intervalo

Revisor: `audit_intelligence` (`/root/audit_intelligence`), independente da implementação. Conversa: `01a13629-d057-7821-a554-a42994564eb9`. Candidato somente leitura: `review-interval-spec`. Parecer funcional: **reject**. Conformidade operacional: **limited**. Candidato superado; aprovação histórica não certifica este reparo.

## Avaliação (até 400 palavras)

**OR-01, SPEC:13: coberto nos casos exercitados.** A admissão serial e a reserva após espera preservam cap/mês, contagem de falhas enviadas e seguidores coalescidos. Minha contraprova com cap 1, retry e seguidor resultou em duas chamadas físicas, uma operação contabilizada, seguidor `sent:false` e próxima chave bloqueada. Nenhum defeito adicional observado neste requisito.

**OR-02, SPEC:14: coberto nos casos exercitados.** Contraprovas de retry seguido de fila preservaram bloqueio global para HTTP 429/50011 e isolamento por tier para HTTP 402. Os testes mantêm leitura de credenciais depois da espera. Nenhum defeito adicional observado.

**OR-03, SPEC:15: coberto nos casos exercitados.** O retry compartilhou prazo/sinal; resposta lenta seguida de corpo pendente devolveu `provider_error`, `sent:true`, e liberou a fila. Corpo tardio 50011 não alterou o estado; rejeições tardias foram exercitadas pela suíte. Os 199 testes e tipos estritos passaram; oito contraprovas próprias passaram.

**OR-04, SPEC:16: parcial e incorreto.** O preparo de `RequestInit` antes de `lastSentMs` corrige os três getters de credencial e o retry exercitado. Porém `client.ts:135` ainda avalia `BASE + request.path` depois da marca (`:134`). Um getter público que retorna o mesmo path, mas bloqueia 80 ms na segunda leitura, produz dois fetches com intervalo de **0 ms wall / 0,2586 ms monotônico**, ambos com sucesso e `sent:true`. A regressão independente falhou: 0 pass, 1 fail, 3 expects, exit 1; limite preservado `>=38` para configuração 40 ms. O catálogo de objetos simples não reproduz este acesso lento, mas o contrato público o admite.

Reparação mínima elegível: o integrador prepara a URL junto de `RequestInit`, antes da marca, preserva assinatura/prazo/gates e obtém red/green desta contraprova; depois fornece nova cópia/hash para revisão independente. Nenhuma fonte foi corrigida pelo revisor.

Não encontrei escopo funcional extra; gateway/test permanecem idênticos ao candidato anterior. Integração/CAS futura e revisão Standards separada continuam fora deste parecer. Houve desvio operacional histórico: dois `git diff --no-index` somente leitura contrariaram o limite sem Git; não há aprovação operacional integral. Evidência literal e hashes estão preservados abaixo.

## Anexo: hashes e evidência literal

SPEC congelada, antes/depois: `4ef3aadfbb0baec1c9fdd4fb262312fd425864d53718abad9d9ba6fe94735ec3`.

| Alvo | SHA256 antes e após todas as execuções |
|---|---|
| `src/onchain-read/client.ts` | `4475897af74b7ffec9d28396f05ec669832438c2c0ee7e94431178e97034f999` |
| `src/onchain-read/client.test.ts` | `80cae12cdecfe2d914582e444c1a34d06d8393da97db254b16070c07a535785f` |
| `src/onchain-read/gateway.ts` | `62b3a8110719f4896d7b08a8da86e6f71080c25fa76e26b0451db7c62f59be42` |
| `src/onchain-read/gateway.test.ts` | `9ad74d46714a5747432ffc812e8dab39c5f0f652aa02b5da304a4d006da61648` |

Inventário completo baseline/anterior/candidato/documentos, após suíte/tipos/oito probes: [hashes](onchain-interval-spec-review-hashes.json), SHA256 `b2246639d8e8af02155e4a0bcd6e10c471eb1de36087b607e5d3a7772755cbb9`. Nova leitura após a contraprova red: [final-hashes](onchain-interval-spec-review-final-hashes.json). Os quatro hashes e SPEC continuam iguais; nenhum arquivo candidato foi editado.

Comandos internos reais, todos `bun --no-env-file`, execução via RTK em `review-interval-spec`:

```text
bun --no-env-file test ./src/onchain-read
bun --no-env-file node_modules/typescript/lib/tsc.js --ignoreConfig --noEmit --strict --skipLibCheck --noUncheckedIndexedAccess --noImplicitOverride --noFallthroughCasesInSwitch --verbatimModuleSyntax --allowImportingTsExtensions --moduleResolution bundler --module preserve --moduleDetection force --target ESNext --lib ESNext --types bun src/onchain-read/client.ts src/onchain-read/client.test.ts src/onchain-read/gateway.ts src/onchain-read/gateway.test.ts
bun --no-env-file test C:\Users\gabri\.codex\tmp\backend-01a1361d-v2\research\onchain-interval-spec-review-probes.test.ts
bun --no-env-file test C:\Users\gabri\.codex\tmp\backend-01a1361d-v2\research\onchain-interval-spec-review-residual.test.ts
```

| Execução | Saída observada | Registro exato / SHA256 |
|---|---|---|
| Suíte | 199 pass, 0 fail, 775 expects, 11 arquivos, 2,04 s, exit 0 | [suite-execution](onchain-interval-spec-review-suite-execution.json) `66b4d463494e322a84a048f6a65ad3ecea10079844a86460751a2e68ef88a662` |
| Tipos focados | stdout/stderr vazios, exit 0 | [types-execution](onchain-interval-spec-review-types-execution.json) `107f5ee3bdafaf77c8396535aa035c1e18b215200d82a8c64607ba0344ad54b6` |
| Oito contraprovas | 8 pass, 0 fail, 41 expects, 1 arquivo, 1158 ms, exit 0 | [probes-execution](onchain-interval-spec-review-probes-execution.json) `f3d465971ccb9245fcfff1065c7476710d79ffe55713dafa0de3d5076a45e1d8` |
| Path residual | 0 pass, 1 fail, 3 expects, 150 ms, exit 1 | [residual-execution](onchain-interval-spec-review-residual-execution.json) `3150cc32b4f0afbcf4d3ca5e6ad34f2389f3276f422f1a44aeee29fb8a6425de` |

RTK fez passthrough `command_not_allowlisted` para Bun com `--no-env-file`; `archive_id:null`. O runner preserva stdout/stderr em bytes e registra argv/cwd/exit. Nenhum teste usou transporte real. Logs completos:

- [suite.stdout](onchain-interval-spec-review-suite.stdout.log), SHA256 `d6684989b8dd63b37d2f1954270826fbe1bd89a8debd12bcacf03ed1c6140ef6`; [suite.stderr](onchain-interval-spec-review-suite.stderr.log), `57c1f0604a13e657622f897fc2435e06bfeb599f0735c56ffba07dd1651ab573`.
- [probes.stdout](onchain-interval-spec-review-probes.stdout.log), `130d8150247e99e8096810ad05f044f10d6275d76fb5be519b2e179dd8571da6`; [probes.stderr](onchain-interval-spec-review-probes.stderr.log), `775c69ad13518b911dbbb3d0e31243f8f99b2cafd0c341dd1f2f9735070a643f`.
- [residual.stdout](onchain-interval-spec-review-residual.stdout.log), `7fb327057bc86c47a7da65f0e4c7dd593ec74e2b720d36ce4ca775e2e3681d56`; [residual.stderr](onchain-interval-spec-review-residual.stderr.log), `5550cbf6ef633c2838126937f8b0678b8d93c0cddae77fa711842f23965ae771`.
- [observações das oito contraprovas](onchain-interval-spec-review-probe-observations-232954d4-1f6d-46ca-8e2d-08c5269758d6.json), `06878edaeb101c455918fdb5e39337ebe28807e09b93492e23981c99c0c35270`.
- [regressão residual independente](onchain-interval-spec-review-residual.test.ts), `f7bb099687e6d20bf5925cd739be598272a9261403e2eef9b3f0fca7fa8af2b2`.

A contraprova controlada anterior → reparado para resposta lenta, retry e fila registrou gaps wall/monotônico de 0/0,4325 ms → 55/55,3389 ms. A prova residual retornou literalmente:

```json
{"reviewer_id":"audit_intelligence","probe":"remaining-path-preparation","reads":4,"starts":[{"wall":1791916994324,"mono":143.3553},{"wall":1791916994324,"mono":143.6139}],"wall_gap_ms":0,"monotonic_gap_ms":0.2586000000000013,"results":[{"ok":true,"data":[],"sent":true},{"ok":true,"data":[],"sent":true}]}
```

## Anexo: desvio operacional e limites

Na inspeção inicial executei as duas comparações abaixo, proibidas pelo limite desta tarefa, e não executei Git novamente:

```text
git diff --no-index C:/Users/gabri/.codex/tmp/backend-01a1361d-v2/review-spec/src/onchain-read/client.ts C:/Users/gabri/.codex/tmp/backend-01a1361d-v2/review-interval-spec/src/onchain-read/client.ts
git diff --no-index C:/Users/gabri/.codex/tmp/backend-01a1361d-v2/review-spec/src/onchain-read/client.test.ts C:/Users/gabri/.codex/tmp/backend-01a1361d-v2/review-interval-spec/src/onchain-read/client.test.ts
```

[Retornos originais de ferramentas](onchain-interval-spec-review-initial-tool-returns.json), SHA256 `000196707b4338159f3e45b86f63b017b9b57a9450795a39184bceff93434a47`, preservam diff, avisos LF/CRLF e hashes iniciais. O comando composto retornou exit 0 após a leitura final; não atribuo esse exit individualmente aos diffs. Foram comparações somente leitura; não houve staging, commit, índice ou edição da cópia. Os hashes finais demonstram ausência de mutação dos quatro alvos e SPEC. Este registro não apaga o descumprimento sem Git.

Os hashes das evidências fornecidas foram conferidos: `onchain-live-tests.log` `9db21bf243246facca5737ce690bdca65192a23d7ca5a0e42d73fc741d87f70a`, red `e5a225f07dae9dc2ceb7e1fba50648c383c261d54c14ea2f8b20685ba39bcbd1`, green `d4e73cfbed99af998f322583eb3f491f88360bc9b057c364fec5cdf9c1bef398`, full `eb2fa5984c4ead0f5fce811e7931d882959dd0297a30eb270b4b47165477c324`. “LIVE” designa execução offline na árvore integrada, sem certificar chamadas ao provedor. A causa específica da primeira falha histórica de 1 ms continua não demonstrada; contraprovas demonstram a classe preexistente de preparo síncrono após marca.

Timers dependem de agendamento cooperativo e atraso do event loop; `Date.now` pode sofrer ajuste de relógio. Testes medem wall e monotônico em condições controladas e preservam tolerância existente de 2 ms. Não são garantia temporal em produção. Timeout do coletor inteiro e limite de alocação durante streaming estão excluídos pela SPEC:29. Não foram exercitados credenciais reais, rede, modelos, ordens, servidor, lucratividade, ML ou ativação nativa. Nenhuma aprovação humana ou autorização externa é conferida.
