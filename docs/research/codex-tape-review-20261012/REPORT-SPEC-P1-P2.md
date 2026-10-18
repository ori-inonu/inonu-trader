# REPORT-SPEC-P1-P2

**REQUEST_CHANGES, AXIS SPEC.** Re-review independente exclusivamente de A/B e regressões no snapshot fixo. A está corrigida: cap durante mono130000 conserva loss200000; ao retornar a200000 com core renovado, só `trades_unavailable`, state/decision null e zero chamadas adicionais. O reproduzível original de B também passa em book/ticker, REST/WS: fonte futura rejeitada não impede a próxima fonte válida. Não aprovei implementação própria ou correção prospectiva.

- **P2, regressão introduzida em B:** `src/jev-read/feed.ts:645` torna overflow permanente; `feed.ts:660` apaga o valor em toda avaliação. Após positivo completo, 257 observações válidas entre snapshots fazem `book_missing`/`ticker_missing`, mesmo após refresh válido. Com256 passa; o candidato anterior passa com257. SPEC:197 exige “refresh válido restaura”; SPEC:150 exige “ts do provedor e receipt/prova válidos”. Não existe contrato congelado que exija restart após256 observações. Corrigir recuperação limitada da fila sem confirmar observações inválidas nem perder conflitos/duplicatas.
- **P2, lacuna residual de B, preexistente:** `feed.ts:666` não valida `receivedAtMs` antes de confirmar fonte em `feed.ts:675`. Fonte E+100 com receipt NaN/Infinity/0.5 confirma watermark; depois, fonte válida E+1 é recusada em `feed.ts:673`, mantendo exclusivamente `book_stale`/`ticker_stale` e zero modelo. SPEC:51 exige “inteiro seguro não negativo”; SPEC:150 exige “receipt/prova válidos”. Validar o domínio completo antes de confirmar ordering, preservando clocks independentes e provas originais.

Evidência própria: manifesto11/11 antes e depois; 202 testes/0fail/2016 assertions, typecheck raiz0; 195 controles anteriores reimportados passam; A/B antigos agora exit0; probe novo36 casos públicos, exit1, com positivos completos e falhas específicas. Bytes antigos preservados. SPEC/PLAN/review e safety permanecem iguais.

**UNKNOWN:** VERIFY completo, composição pública restante, todas as bordas funding/defaultTTL com opção omitida e pareamento de identidades; replay original imutável contra este novo hash; modelo/effort/tier efetivos; build/full-suite/visual deste snapshot. Configuração informada GPT6.1Sol/xhigh não comprova execução. Cópia isolada ordinária, junction de dependências sob contrato de não escrita, sem sandbox readonly do SO. Nenhuma dependência impede entregar esta revisão. Aceitação depende das duas correções observadas e da evidência congelada restante. O objetivo nativo completo permanece incompleto.

## Matriz compacta de evidência de aceitação

SPEC:L significa `docs/JEV-TAPE-DATA-F1-F4-SPEC-V2-20261011.md:L`, SHA abaixo. PASS qualifica somente o comportamento exercitado; UNKNOWN não é falha funcional presumida. A matriz integral e seus limites do relatório anterior continuam vigentes. Nenhum requisito foi reduzido.

| Critério congelado | Evidência no novo hash | Estado e limite |
|---|---|---|
| Domínios/provenance, SPEC:51-112 | 195 controles reimportados; `state.ts:29-58` rejeita receipt Unix inválido, mas ordering confirma esse receipt. | FAIL residual B; prova do builder continua exigente. |
| F1, SPEC:146/196 | Controles público/builder +1/+5000/+5001, idade0/150000/150001, clocks/formas/tail, exchange fracionário, wall±180s. | PASS nos controles anteriores repetidos; fonte sem alteração. |
| F2 book, SPEC:150-152/197 | Repetidos TTL fonte/cache5000/5001, REST/WS, duplicata/antiga; futuro recupera em `future-watermark.ts`. | B original PASS; FAIL overflow novo e receipt inválido residual. Pareamento público completo de identidade/formato permanece UNKNOWN. |
| F2 ticker, SPEC:150-152/198 | Repetidos TTL fonte/cache15000/15001; mesmo probe público REST/WS e recuperação. | B original PASS; mesmos dois FAIL, isolados do book. |
| B clocks/ordering | `feed.test.ts:1583`, :1613, :1632: com/sem read intermediário, wall±180s, invalidmono, ordem invertida, prova duplicada e conflict tombstone. | PASS testes observados; não equivalem a toda a matriz pública. |
| F3 identidade/valor, SPEC:156-162/199 | Controles BTC/ETH, matching/quote, rate positivo/zero/negativo, metadata/ts/rate inválidos com core válido e1call. | PASS variantes repetidas; calendário equivalente antigo preservado, não reexecutado neste re-review. |
| F3 TTL default, SPEC:200 | Omissão propaga120000; controles de bordas fonte/cache usam política explícita120000. | PASS controles existentes; bordas públicas todas com opção omitida UNKNOWN. |
| F3 opção, SPEC:201 | 60000/180000, borda/+1/+fração; opções inválidas rejeitadas sem efeitos; builder sem política deixa funding null/core válido. | PASS controles repetidos. |
| F4 cobertura, SPEC:122-140/202 | Ack0/59999/60000, fração, quieto, lifecycle/generation, identidade, clocks, wall± nos controles. | PASS variantes repetidas; não atesta feed externo. |
| F4 cap/perda A, SPEC:128/136/203 | `rollback-cap.ts` e `feed.test.ts:360`: positivo5000, mono130000 cap, retorno200000/core fresco, loss200000, motivo único/0call. Flood6000,500 e fronteira60000/+fração nos controles repetidos. | A PASS; rollback intermediário não contado como negativo isolado, porque há outros gates inválidos naquele instante. |
| COMPOSITION, SPEC:174-182/204 | Três controles com feed real e fakes repetidos: book lento reavalia ticker, ticker lento expira book, funding isolado expira. | PASS parcial; candle expirando no await, refresh falho com feed real e todos os contextos anteriores UNKNOWN. |
| VERIFY, SPEC:186-217 | Probes negativos com motivo único, built=false, state/decision null/0call; controles built=true, buy/status ok/1call/schema1/advisory/never. Bypasses funding/proofs/coverage/loss repetidos. | Incompleto. Novos FAIL concretos acima; demais lacunas mantidas como UNKNOWN. Não aprovar grupo/objetivo por contagem da suite. |
| Ownership/safety, SPEC:223-231 | Apenas feed.ts/feed.test.ts diferem do snapshot anterior;9/11 entradas iguais. read.ts/decide.ts/public-view.ts, clock.ts, CLI e adapter iguais; read.test.ts hash igual. | PASS comparação de bytes; sem edição de candidato/testes/SPEC/Git/harness/dependências pelo revisor. |
| M1, SPEC:235 | Pré-abort,0calls/hold/error nos testes e controles repetidos. | PASS observado. |
| M2, SPEC:236 | Abort em voo, modelo ignorando signal, settle/cleanup, sem aceitação tardia. | PASS observado. |
| M3, SPEC:237 | Timeout e retorno síncrono tardio rejeitados por elapsed monotônico. | PASS observado; não implica preempção. |
| M4, SPEC:238 | Overflow/underflow escolhido/all-zero malformed; controles3:1 preservados. | PASS observado; sem rescale. |
| M5, SPEC:239 | Schema1/advisory true/execution never, projeção numérica e sem IDs/proofs nos195 controles/suite. | PASS observado; nenhuma execução financeira. |
| M6, SPEC:240 | Afetados/tipos e probes próprios repetidos. RED/GREEN A/B informados pelo integrador não têm logs próprios auditados aqui. | Replay original existia no snapshot antigo, exit1; replay imutável neste novo hash não observado. VERIFY/aceitação completos não aprovados. |

## Reproduções concretas e avaliação de mascaramento

Diretório exclusivo de probes: `C:/Users/gabri/.codex/tmp/spec-probes-01a12dc0-p1-p2-20261012`. Somente fakes offline: fetch/socket/clock/model local. Cada caso novo começa com31 candles contíguos, core válido e cobertura madura (ack140000, mono200000), builder positivo, leitura buy/status ok, exatamente1call/schema1/advisory true/execution never. Foi verificado o objeto decision real, não um campo ausente.

1. **A:** replay de `rollback-cap.ts`; imports apontam para NEW. Receipt descartado200000 é retido como loss apesar de idade negativa em130000 (`feed.ts:697-706`). Ao voltar200000,5000 registros retidos não bastam: `built={ok:false,reasons:["trades_unavailable"]}`, leitura state/decision null, calls0. O positivo completo com chamada efetiva também é exercitado pelo teste público `feed.test.ts:391-405`. O antigo stdout FAIL permanece intacto.
2. **B original:** `future-watermark.ts` executa book/ticker × REST/WS. Após positivo, fonte E+60000 bloqueia somente seu campo/0call; fonte E+1 restaura built=true, insufficient vazio, buy/status ok/1call. Não é GREEN mascarado por outro gate.
3. **Overflow introduzido:** `ordering-regressions-v2.ts:56-66`. E=2000000000000; corrected exchange/wall E+1000, mono200000. Entre snapshots receber257 fontes E+1..E+257, receipts válidos. Snapshot e refresh seguinte em E+1001/mono200001 falham somente com `<alvo>_missing`; state/decision null,0call. Em256, ambos passam/1call. No snapshot OLD,257 também passa/1call em todas as quatro combinações. Causa: overflow sem recuperação (`feed.ts:643-660`); somente stop/start limpa a flag (:162/:166/:184/:188), requisito novo não autorizado. Preservar limite de memória com recuperação válida, sem tornar proof inválida aceitável.
4. **Receipt residual:** `ordering-regressions-v2.ts:68-78`. Primeiro confirmar E. Em exchange E+200, receber fonte E+100 com `now()`=NaN, Infinity ou0.5, mono válido. Restaurar wall E+200 e avaliar: somente `<alvo>_stale`,0call. Receber fonte E+1 com receipt válido não restaura: stored source permanece E+100, mesmo motivo/0call. Todos12 casos NEW e12 OLD reproduzem; portanto não atribuir sua origem à correção B. O builder corretamente rejeita receipt inválido (`state.ts:38/58`); o defeito é confirmá-lo em ordering antes dessa validação. Não comparar source diretamente ao wall para reparar isto.

Novo probe:36 casos, exit1 esperado pela evidência de defeitos;8 controles overflow positivos passam,4 regressões novas e24 controles receipt falham como descrito. A primeira versão diagnóstica do probe também foi preservada, mas sua saída simplificava decision para `.choice`; somente v2 e a validação do objeto completo sustentam os efeitos da leitura. Não contar essa simplificação como prova de decision null.

Replay original histórico: SHA `a7a44e9482c1635bb73307e6bcc2a3c599591548442f1a0843953332c326091e`; stdout/stderr e `PROBE-ORIGINAL-REPLAY.json` permanecem na cópia antiga. Exit1: F1/F3/F4/F5/F6 FAIL, F2/TOKEN PASS. Fixtures sem provenance/cobertura e Socket sem avanço60s mascaravam o alvo: FAIL não demonstra necessariamente defeito daquele grupo e PASS não demonstra controle válido. Não alterei nem reinterpretei esse probe como aprovação. Seu replay byte-idêntico contra o novo hash continua pendente de evidência. Full backend2192pass2skip, web909pass, typecheck:all0, build físico0 e ausência de prova visual foram informados para o estado anterior; não transferir qualificação automaticamente a NEW.

## Comandos e preservação

Executados da nova cópia, sem carregar .env nem instalar:

```text
bun --no-env-file --no-install test --parallel=1 --timeout 15000 ./src/jev-read ./src/system-one/clock.test.ts
bun --no-env-file --no-install run typecheck
bun --no-env-file --no-install C:/Users/gabri/.codex/tmp/spec-probes-01a12dc0-p1-p2-20261012/rollback-cap.ts
bun --no-env-file --no-install C:/Users/gabri/.codex/tmp/spec-probes-01a12dc0-p1-p2-20261012/future-watermark.ts
bun --no-env-file --no-install C:/Users/gabri/.codex/tmp/spec-probes-01a12dc0-p1-p2-20261012/contract-controls.ts
bun --no-env-file --no-install C:/Users/gabri/.codex/tmp/spec-probes-01a12dc0-p1-p2-20261012/ordering-regressions-v2.ts
```

Saídas separadas no diretório de probes; testes202pass0fail/2016assertions, typecheck exit0, controles195/195, A exit0, B exit0, novo probe exit1. A primeira versão do novo probe também executou com exit1 e foi preservada. A/B/controles antigos foram copiados mudando apenas paths de imports e rótulo do candidato quando aplicável; nenhum assert anterior relaxado.

Identidade observada: CODEX_THREAD_ID `01a12dc0-af1f-7f63-ae3f-e9ac650798af`; SESSION_ID `01a12971-f941-7e42-8a42-fab6d44d4eb5` não substitui essa identidade. Baseline declarado/fixado no manifesto `14cbb7bd2878eed0a930b324b0c50610be7cdab8`; cópia sem aprovação de ancestry/Git/commit novo. Isolamento físico ordinário, não sandbox readonly do SO; junction node_modules para dependências da cópia antiga, sem escrita autorizada. Leitura das skills codex-desktop-harness/code-review, CONTRIBUTING, instruções AGENTS e critérios congelados; nenhuma consulta de provedor ou rede iniciada pelo revisor. Configuração/effective settings distinguem-se: efetivos UNKNOWN. Única escrita no snapshot: este relatório exclusivo. Probes e logs próprios estão fora do source.

## SHA256 de candidato e fontes congeladas

`CANDIDATE-MANIFEST.json` SHA `c4960ef32c6a1c0e2bc5ba22927725de3d5b2f1f98f5c06e3789308166b26f54`;11/11 entradas verificadas primeiro, após execução e após gravação. Manifesto preservado. Os9 outros arquivos do manifesto são byte-idênticos ao snapshot anterior.

| Arquivo | SHA256 |
|---|---|
| src/jev-read/feed.ts | 5fbfd8f21bcd43a37329da5aa679dd7b7ca4580a5d590e18a569e3b187d9cb52 |
| src/jev-read/feed.test.ts | 34aa7e33c916f43ac2b126f7d83df241277e2c4e6ec89f40c9c439bef4025d91 |
| SPEC congelada | 10cee5fe44e7dbde5a988d34822ee99061cb24b39341e2cefe77a4bae2439c97 |
| PLAN congelado | 9a48752fdd015bf52221810915b536598b4643257bcad4f0b6e201c84398c14e |
| Independent SPEC review | 59181ab94d66489682f4d13947397c7d842a7d897eb15076a2446d4d0d589b49 |
| read.ts, bytes físicos | 0422288919d60e969f76b21acee97802cda8ab9028fb73044c9817233b247b52 |
| decide.ts, bytes físicos | e46315754bafad687e25d39dc511fb6cba4e74af79bebe527e4605db1283358c |
| public-view.ts, bytes físicos | 9eea06df480ac9b5c647522e1213e5ce803c183fc345b2681289dcb206bc377d |
| REPORT-SPEC.md antigo, preservado | f54a1a427bc7a9a2baafa3cffb260d76e199991f66786ccad9ba09bfbdc3f0a8 |

## SHA256 de probes/saídas próprios preservados

Todos relativos a `C:/Users/gabri/.codex/tmp/spec-probes-01a12dc0-p1-p2-20261012`. Stderr vazio e typecheck stdout vazio têm SHA `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`.

| Arquivo | SHA256 |
|---|---|
| rollback-cap.ts | 6521a980a4a18fa57bd9d76773e4d82db5087c9288f1e3b8bfc3cc85971222cd |
| rollback-cap.stdout.json | cae9d49dc1e7206b8bdac3d3b4eede5ab77ee1d0bda22273865e2ebb8222d4b4 |
| future-watermark.ts | 6854b289d288a98b573808afbbd3542f76cf75485ea84a830e9352d3103ece64 |
| future-watermark.stdout.json | 7c5299e073b654acda9f6499cd7a0cc5813980fa6482c8940f50db1e8dcebb56 |
| contract-controls.ts | fcde313356e0fc3fbcacb7ee1383d0914e2078df3fc1a9e519707189f2f6158d |
| contract-controls.stdout.json | 35accff2b2077c40c5b1334823d8505bd4355c7a81885011b992b33a8167ebbc |
| ordering-regressions-v2.ts | 60c5787a302d3011b749b373c0218ce47261ad4680abc07779a30369355dc503 |
| ordering-regressions-v2.stdout.json | 41716ddafe47994083b40f56833c056c6ef4b0f4f7390de01247c0d0182f813b |
| ordering-regressions.ts, diagnóstico preservado | 27bf9952ae94d8779b9ec5937d6c7bb49685dac4d97f615d86c633427b3766d1 |
| ordering-regressions.stdout.json, diagnóstico preservado | 900b3c45420f198eda7c4d82df0cd04c502f93954126297f7dbd7bf156c9e310 |
| affected-tests.stdout.txt | d886683af1dd09dc7ae60f846f4cc5371d01e0a0f5b3152e2dfaff76cd66a052 |
| affected-tests.stderr.txt | 09392f6f028b754c685ad37d1a70ab255d0ff364564a784b50b494bd1c0df904 |
| typecheck.stderr.txt | 27c1f71f1597c81ed3a1974cc8ece11a676a1665e53368561f671be9728bc324 |

Antigos em `C:/Users/gabri/.codex/tmp/spec-probes-01a12dc0-20261012`, hashes rechecados iguais: rollback-cap.ts `a3bf5a6069b09de2ffd4fbdc807aa887365d727f05b219b0a98059efd7151b58`; stdout `f20acc0d8e4fa1aa79a17d4d3673caba8c2f875ef1be170ca47a9dec780f0e8a`; future-watermark.ts `16815f810256a2ba6993935bb097a1e81d6ca3208f05a9e9a67aca4eeecb0574`; stdout `c0d4f844a01094a57e685c3266569c4577c28896c4da78d996662ba6af576f94`; contract-controls.ts `12fbdb8e3299f19aa093027685165af43172429071a48ec43f99d62efe2de14c`; controls.stdout.json `9507a7a63adf3d42948db0a119d969079ab91a9b20c242dd26fe4be06a25cf37`. Nenhum probe antigo reescrito.
