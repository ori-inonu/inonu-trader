# Revisão SPEC independente do candidato final

`reviewer_id=audit_intelligence`; identidade `/root/audit_intelligence`, conversa `01a13629-d057-7821-a554-a42994564eb9`. Revisor distinto do implementador. Cópia somente leitura: `review-interval-final-spec`. **Decisão: approve para o candidato e comportamento OR-01–04 observado.** Integração futura, revisão Standards separada e conformidade integral histórica não estão certificadas.

## Avaliação (até 400 palavras)

**OR-01, SPEC:13: atendido nos casos exercitados.** `gateway.ts:102–109` mantém admissão serial, nova reserva após espera e contabilização somente do líder enviado. Testes cobrem três chaves/cap 1, teto dinâmico e mês UTC após espera. Controle próprio com clock retry, falha e seguidor contabilizou uma operação, duas chamadas físicas; seguidor e próxima chave ficaram `sent:false`. Sem defeito ou requisito ausente observado.

**OR-02, SPEC:14: atendido.** `client.ts:213–233` revalida gates antes/depois da espera e obtém credenciais no despacho. Controles próprios com retry seguido de fila confirmaram recusa não enviada para HTTP 429/50011, bloqueio restrito ao tier para HTTP 402 e camada livre utilizável; testes preservam expiração. Sem defeito observado.

**OR-03, SPEC:15: atendido nos transportes exercitados.** `client.ts:90–104,143,168,188` mantém prazo compartilhado de fetch/corpo/retry e barreiras de efeitos tardios. Controle próprio com resposta lenta e corpo pendente encerrou em 110,19 ms para prazo 100 ms, retornando `provider_error`, `sent:true`; fila progrediu, mesmo sinal cobriu retry e corpo tardio 50011 não alterou estado. Rejeições tardias/401/403 permanecem cobertas pela suíte.

**OR-04, SPEC:16: reparo aprovado no candidato.** `client.ts:133–137` prepara URL e `fetch.bind(deps)` antes da marca, em cada tentativa. Contraprovas próprias reproduziram ambos os resíduos no candidato anterior (0 ms) e confirmaram no final gaps wall/monotônico de **59/59,3032 ms** para path lento e **54/54,467 ms** para lookup lento, preservando limite `>=38` com configuração 40 ms. Receiver `deps` permaneceu correto em chamadas e retry. A suíte cobre assinatura, normalização, stale, intents mistos e histórico; controle retry/fila final mediu 47/47,6927 ms. Não houve relaxamento de assertions.

Verificação própria: **201 pass, 0 fail, 783 expects, 11 arquivos; tipos estritos exit 0; 13 controles, 67 expects, exit 0**. Não encontrei requisito funcional ausente, comportamento incorreto ou escopo extra na fatia. Comparação sem Git confirma somente preparo URL/transporte e duas regressões adicionais desde o candidato rejeitado; gateway/test são idênticos. A integração por hashes e Standards são gates posteriores, não realizados pelo revisor.

Operação desta revisão respeitou o limite sem Git, manteve candidato/documentos intactos e criou somente artefatos exclusivos. O desvio Git histórico permanece registrado no parecer anterior, sem reclassificação nem aprovação retroativa.

## Hashes antes/depois

SPEC congelada: `4ef3aadfbb0baec1c9fdd4fb262312fd425864d53718abad9d9ba6fe94735ec3`, igual antes/depois.

| Alvo | SHA256, idêntico antes/depois |
|---|---|
| `src/onchain-read/client.ts` | `35b8862b67d448e4eb104fb5353825d95839e311c62d92e127ac17367aa08e93` |
| `src/onchain-read/client.test.ts` | `6b57c61efe134aec6d7b7f9afbb06c1b67c85ca36b483405547f0ba97efa6c65` |
| `src/onchain-read/gateway.ts` | `62b3a8110719f4896d7b08a8da86e6f71080c25fa76e26b0451db7c62f59be42` |
| `src/onchain-read/gateway.test.ts` | `9ad74d46714a5747432ffc812e8dab39c5f0f652aa02b5da304a4d006da61648` |

- [Manifesto antes](onchain-interval-final-spec-review-before-hashes.json): SHA256 `b1c6d42cf3d99efef11240403f7d4199dd9cba844e74bae363e9d3eceb5bccd4`.
- [Manifesto depois](onchain-interval-final-spec-review-after-hashes.json): `f9ba0b3ef55b19cc16087354d5f738aae206a3e3ada8b1b3fe1b7ddbf083fb05`, todos os sete alvos/documentos iguais e os quatro logs fornecidos conferidos.
- [Comparações baseline e candidato rejeitado](onchain-interval-final-spec-review-comparisons.json), Python `difflib`, sem Git: `f43070bbdb43ff06d4b9a43bbaefd11bf46af800e3a20df46e6d5bd1afafb987`. Preserva diff literal e hashes das oito comparações.
- Documento de verificação final: `e8f0451c0446ee176cea3f1aa73eb5c6547b2fb02f8b1c481b20277c2bc56f3a`; manifesto fornecido: `ce8ccd1ff91cfcad4d377f391bfec7c08ce3f8861a9a7785f31587e34e881318`.

## Comandos e saídas reais

Executados em `C:/Users/gabri/.codex/tmp/backend-01a1361d-v2/review-interval-final-spec`, via runner exclusivo e adaptador RTK, Bun 1.3.14 (`0d9b296a`):

```text
bun --no-env-file test ./src/onchain-read
bun --no-env-file node_modules/typescript/lib/tsc.js --ignoreConfig --noEmit --strict --skipLibCheck --noUncheckedIndexedAccess --noImplicitOverride --noFallthroughCasesInSwitch --verbatimModuleSyntax --allowImportingTsExtensions --moduleResolution bundler --module preserve --moduleDetection force --target ESNext --lib ESNext --types bun src/onchain-read/client.ts src/onchain-read/client.test.ts src/onchain-read/gateway.ts src/onchain-read/gateway.test.ts
bun --no-env-file test C:\Users\gabri\.codex\tmp\backend-01a1361d-v2\research\onchain-interval-final-spec-review-probes.test.ts
```

Comando externo real para cada modo `suite`, `types`, `probes`:

```powershell
& 'C:/Users/gabri/.codex/tools/rtk-headroom-20261010/venv/Scripts/python.exe' 'C:/Users/gabri/.codex/tmp/backend-01a1361d-v2/research/onchain-interval-final-spec-review-runner.py' suite
```

| Evidência | Resultado / SHA256 |
|---|---|
| [suite-execution](onchain-interval-final-spec-review-suite-execution.json) | 201 pass, 0 fail, 783 expects, 11 arquivos, 2,06 s, exit 0; `dfc2dbf2def319e51be64530e3e821924f90f4d3558280a0db7dbd3ea4aeda3f` |
| [types-execution](onchain-interval-final-spec-review-types-execution.json) | stdout/stderr vazios, exit 0; `2afeb0b074b723f79436b9ea7f937fa479b197c02c55b25256d1241068f7963e` |
| [probes-execution](onchain-interval-final-spec-review-probes-execution.json) | 13 pass, 0 fail, 67 expects, 1 arquivo, 1,68 s, exit 0; `5fef225fef17a8722d83e5ed097f3b2bc5b83f0f1625dd219fc2659fcfc39017` |
| [Controles independentes](onchain-interval-final-spec-review-probes.test.ts) | `1c9960a2a34c78a23af4c5d4472abdba3f1aff628d21d7ba337ae6f7d5c336b8` |
| [Observações literais](onchain-interval-final-spec-review-probe-observations-1a40fb13-e863-48bf-80f0-b6c79c6c5a52.json) | `50eb8262688ede32a6b4c21291625d76a5cef188efb3aaaca4c4d000760a1ee7` |
| [Runner](onchain-interval-final-spec-review-runner.py) | `4ad3e4a6c456e30d15b98a12df1d9865fa510294cbf0d80946fb15d5f3d3ba32` |
| [Inspeção sem Git](onchain-interval-final-spec-review-inspect.py) | `6952e7a5fa1443380da888f0945db6f81cc7846680864c94d28940c8309484fd` |

Bytes completos preservados pelo runner `shell=False`:

- [suite.stdout](onchain-interval-final-spec-review-suite.stdout.log): 28 bytes, `d6684989b8dd63b37d2f1954270826fbe1bd89a8debd12bcacf03ed1c6140ef6`; [suite.stderr](onchain-interval-final-spec-review-suite.stderr.log): 19893 bytes, `1492c91742ba2e953297b45bbe0c7f86c5abb807962ba03336451b7b56a6bcb0`.
- [probes.stdout](onchain-interval-final-spec-review-probes.stdout.log): 192 bytes, `9f8b5671a6ad69a5ddf57eb196a39ac068a653d958005d416c56525c0fcb6226`; [probes.stderr](onchain-interval-final-spec-review-probes.stderr.log): 1258 bytes, `c91064eda87dc31a34c3476e77d9e5e8569f4d085eaa8fb6a9a010bd19623343`.
- Tipos: ambos os streams 0 bytes, `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`.

RTK fez passthrough `command_not_allowlisted` para Bun com `--no-env-file`; `archive_id:null`. Métricas e argv exatos estão nos registros; não há alegação de compressão destes logs.

Logs fornecidos, hashes conferidos: URL red `a803b027ffc035c7e637f9f3afc2603903ed2ed39898802fa4b30f99aebed0f0`, lookup red `ef96f69b8a461a8ac797ca133df78989503f25307a1f23d47ec164b8bddfc2a9`, suíte green `a82ed66f8b38e1a354496842235eaa4279a48d42b054b5bc30ff041190999ebc`, tipos green `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`. As comparações próprias contra o candidato rejeitado afirmam a presença esperada do defeito antigo; os seus testes pass não significam conformidade daquele candidato.

## Limites e preservação operacional

Esta revisão distinta não executou Git, não editou fonte/docs candidatos nem parecer histórico. [Parecer histórico rejeitado](onchain-interval-spec-review.md), SHA256 `77d3139a57a5512fe836a4b029aa4d1050b4705f2877f1a949b41f6e77fc81bb`, mantém o desvio operacional de comparação Git somente leitura. Aprovação funcional presente não regulariza aquele evento.

Timers são cooperativos e sujeitos ao event loop; wall clock pode sofrer ajustes. A tolerância existente de 2 ms não foi alterada. Os controles cobrem espaçamento entre operações da fila e entre o último retry e a operação seguinte; o retry rápido dentro do slot mantém a semântica preexistente, sem nova espera intra-slot. Não há certificação de garantia temporal produtiva. Prazo total do coletor e limite de alocação por streaming permanecem excluídos (SPEC:29/31).

Não foram examinados .env, credenciais reais nem dados de mercado; transportes são mocks com literais sintéticos públicos. Sem rede, servidor, modelo real, ordem, assinatura de transação, publicação, staging ou commit. Não executei suíte global e não declaro green global de áreas concorrentes. Este parecer não certifica integração LIVE, operação real do provedor, trading, ganhos financeiros, aprendizagem ML ou ativação Desktop, nem concede aprovação humana/autorização externa. Próximo gate elegível: revisão Standards independente e integração CAS pelo integrador dos quatro hashes exatos, seguida de verificação offline da árvore integrada.
