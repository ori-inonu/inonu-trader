# REPORT-SPEC
**REQUEST_CHANGES, AXIS SPEC.** Revisão independente do candidato atual; não aprovei implementação própria nem correção prospectiva. Manifesto verificado primeiro e novamente ao final: 11/11 arquivos iguais. Li integralmente SPEC congelada, PLAN e revisão independente, além de CONTRIBUTING e instruções AGENTS fornecidas. O rótulo histórico “draft” não reduz aceitação.

- **P1, perda de cobertura após retrocesso monotônico:** `src/jev-read/feed.ts:626` ignora receipts descartados com idade negativa. Depois de retornar o relógio, desaparecem 5.000 trades ainda na janela; o candidato declara fluxo zero e chama o modelo. SPEC:53: “Retrocesso do monotônico é inconsistência de prova”; SPEC:128: “null somente se não há perda conhecida”. Reprodução A abaixo.
- **P2, timestamp futuro envenena watermark:** `feed.ts:593/610` grava uma fonte futura; `feed.ts:585/601` recusa a próxima resposta válida como antiga. Confirmei book/ticker, REST/WS. SPEC:197 exige “refresh válido restaura”; SPEC:150 rejeita fonte futura. Reprodução B abaixo.
- **P2, VERIFY incompleto:** controles obrigatórios ainda não têm cobertura pública completa e pareada. Exemplos: funding no feed é assertado somente no snapshot em `feed.test.ts:806/821`; composição usa doubles em `loop.test.ts:175–220`, sem caso de candle expirando no await; `state.test.ts:505–510` contém controles somente do builder. SPEC:186 exige todos os casos e seam público; SPEC:188 exige pré-condições e positivo equivalente. Probes independentes cobrem parte dessas lacunas, não toda a matriz.

Verificação própria: 195 testes, zero falhas, 1.974 assertions; typecheck raiz exit0; 195 controles offline passam, mais calendário original equivalente passa. Dois probes adicionais reproduzem A/B com exit1. Logs integrais do integrador corroboram backend2192pass/2skip/0fail e web909pass/0fail; typecheck:all0 e build físico0 são informações do integrador.

Replay original byte-identificado cumprido, exit1 preservado. Seus FAIL e alguns PASS são mascarados por fixtures sem provenance/cobertura madura; não significam GREEN. Modelo/effort/tier efetivos e prova visual permanecem UNKNOWN. O objetivo nativo completo continua incompleto. Dependência concreta de aceitação: corrigir A/B e completar/reexecutar os controles congelados no novo hash. Nenhuma dependência impede entregar esta revisão.

## Matriz compacta de aceitação

**PASS** significa evidência observada descrita na linha; **FAIL** é violação concreta; **UNKNOWN** é comportamento/combinação não qualificado. Nenhum PASS parcial aprova um grupo inteiro ou o objetivo nativo. Referências “SPEC:L” apontam para `docs/JEV-TAPE-DATA-F1-F4-SPEC-V2-20261011.md`, SHA256 `10cee5fe44e7dbde5a988d34822ee99061cb24b39341e2cefe77a4bae2439c97`.

| Critério congelado | Evidência do candidato exato | Resultado / limite |
|---|---|---|
| Domínios numéricos, política TTL, provenance (SPEC:51–112) | `contract-controls.ts:58–111`; tests diretos de book/ticker/candle/proofs e construtor. Receipts originais, IDs/epoch/generation e TTL propagados. | PASS nos domínios/variantes exercitados; FAIL em retrocesso+cap (A). |
| F1, SPEC:146/196 | Feed e builder: futuro +1/+5000/+5001, idade150001, null/NaN/Infinity, timestamp ausente/fracionário/unsafe/tail quebrado; controles0/150000, 31 barras/forming, exchange fracionário e wall±180s. `contract-controls.ts:53–72`, `state.test.ts:459–510`. | PASS; negativos com reason próprio e zero modelo nos probes, positivos consultivos. |
| F2 book, SPEC:150–152/197 | REST/WS ts1, fonte/cache5000 e5001 independentemente, cache+fração, futuro; duplicação não renova, erro expirado e fonte anterior não rejuvenece. `contract-controls.ts:73–92`, `state.test.ts:65–118`. | FAIL recuperação após futuro (B). Formatos/identidades adicionais têm tests de feed/builder, mas pareamento público completo dessas variantes é UNKNOWN. |
| F2 ticker, SPEC:150–152/198 | Mesmo isolamento com limites15000/15001; fonte nova, duplicada/antiga e proofs inválidas. `contract-controls.ts:73–92`, `state.test.ts:229–283`. | FAIL recuperação após futuro (B); mesma limitação de cobertura pública de formatos/identidades. |
| F3 identidade/valor, SPEC:156–162/199 | BTC-USDT e ETH-USDC completos; .004→.4, zero e negativo; wrong ID, ts1/ausente/futuro, rate ausente/NaN/Infinity e erro deixam funding null com core válido/uma chamada. `contract-controls.ts:93–99`. Calendário original E−1000/E+8h preservado em `original-contract-calendar.ts:7–16`. | PASS controles observados; nenhuma alegação de disponibilidade econômica/live do swap. |
| F3 TTL default, SPEC:58/64–68/200 | Construtor omitido propaga120000 no controle base; fonte/cache120000 inclusivos,120001 e+fração isolados, duplicata/sem refresh; wall±. `state.test.ts:293–320/352–386`, `contract-controls.ts:100–105`. | PASS limites120000 exercitados; probe de bordas usa opção explícita120000. Todas as bordas públicas com opção omitida, separadamente, continuam UNKNOWN. |
| F3 opção, SPEC:58–60/201 | 60000/180000 em cada eixo, limite/+1/+fração;0/negativo/fração/NaN/±Infinity/unsafe/null/string rejeitados antes de efeitos; política ausente/inválida no builder mantém core/uma chamada/funding null. `contract-controls.ts:100–111`. | PASS. Não aplicar default silencioso ao builder. |
| F4 cobertura, SPEC:122–140/166/170/202 | ack0/59999 bloqueia,60000/60000.5 quieto passa; ack ausente/errado, duplicate/pong após gap, stop/start/socket antigo, nova geração somente após seu60s. `contract-controls.ts:113–124`; cobertura direta `state.test.ts:526–571`. | FAIL retrocesso+cap (A). Lifecycle/geração/prova avaliados; não atesta observação real de60s em feed externo. |
| F4 cap/perda, SPEC:134–140/168/203 | 5000 passa;500 com300buy/200sell dá imbalance.2/CVD100;6000 com4000buy/2000sell bloqueia especificamente, sem core artificialmente stale; perda exatamente60000 bloqueia e60000.5 recupera sem nova mensagem. `feed.test.ts:360–437/439`, `contract-controls.ts:115–121`. | PASS controles ordinários; FAIL perda apagada quando cap descarta receipts durante rollback (A). |
| COMPOSITION, SPEC:174–182/204 | Código `loop.ts:98–113`; clocks finais e thresholds3000/10000 mantidos. Três cenários com OkxTapeFeed real/fakes: book lento reavalia ticker, ticker lento expira book, somente funding expira com core renovado. `contract-controls.ts:141–151`. Falha de refresh também coberta no double `loop.test.ts:175`. | PASS cenários executados. UNKNOWN seam completo para candle expirando durante await, falha com feed real e todos os proofs/clocks de rodada anterior. |
| VERIFY, SPEC:186–206 | Probes assertam reason exato, state/decision null e0 calls; F3 isolado exige built.ok, insufficient vazio, funding null e1 call. Positivos schema1/advisory/never; outros caches renovados com source nova após avanço. | FAIL evidência pública completa obrigatória ainda ausente; comportamento não exercitado é UNKNOWN, não falha funcional presumida. Não relaxar matriz nem substituir por contagem global de testes. |
| Bypass direto funding, SPEC:210–212 | Prooffields/identidade/feed/epoch/source/receipt e TTL inválidos não bloqueiam core;1 call/funding null. `contract-controls.ts:106–111`, `state.test.ts:352–386`. | PASS variantes observadas; lista completa legacy/proof ausente pareada com todos os efeitos continua UNKNOWN. |
| Bypass book/ticker/candle, SPEC:213 | Proof errado/ausente, source antigo com receipt novo, IDs/generation e candle.ts/proof.ts inconsistentes: `state.test.ts:65–118/229–283/402–438`, probes:86–87. | PASS variantes diretas observadas; nenhuma aceitação por bool/cache-only. |
| Bypass coverage, SPEC:214 | Coverage ausente/bool-only, identidade/epoch/generation errados, campos ausentes/futuros/ordem/through antigo: `state.test.ts:526–550`; probe:123. | PASS negativos diretos com trades_unavailable/state+decision null/0 calls. |
| Bypass loss/trade, SPEC:215 | Fronteira60000,60000.5; trade de generation/proof inválida bloqueia em vez de removê-lo silenciosamente; array vazio com cobertura válida passa. `state.test.ts:184–222/551–571`, probes:113/124. | PASS nos casos exercitados; não corrige o produtor que apagou dados em A. |
| Ownership/safety, SPEC:223–231 | Patch limitado aos8 arquivos autorizados; `read.test.ts` contém migração de fixtures, sem relaxar assertions. Safety/CLI/ClockKeeper/web adapter têm hashes LF congelados iguais. | PASS inspeção do patch/hashes; nenhuma edição pelo revisor. |
| M1, SPEC:235 | Core válido, pré-abort:0 calls/hold/error. `contract-controls.ts:125`, affected tests. | PASS. |
| M2, SPEC:236 | Modelo ignora signal; abort em voo settle, listener add/remove balanceados, resolução posterior não aceita. Probe:126–133. | PASS. |
| M3, SPEC:237 | Timeout comum e retorno síncrono30ms em deadline5ms rejeitados; affected tests preservados. Probe:134–135. | PASS; não alegar preempção JavaScript. |
| M4, SPEC:238 | Soma finita individualmente mas overflow agregado, chosen underflow, all-zero dão hold/malformed;3:1 ordinário e controles originais preservados na suite. Probe:136–140, decide/read tests. | PASS; sem rescale. |
| M5, SPEC:239/231 | run/projeção schema1/advisory true/execution never; IDs/proofs não vazam; compactTapeState numérico intacto. Probe:41–50 e hashes safety. | PASS controles observados; nenhuma execução real. |
| M6, SPEC:240 | Manifesto/patch congelados, testes afetados e tipos próprios; replay original exato e logs do integrador examinados. | Replay obrigatório PRESENTE, exit1. GREEN completo FAIL por A/B/VERIFY; nenhuma inferência de fix/new hash/commit/merge. |
| Qualificação externa/full goal, SPEC:257 e exclusões | Sem chamadas externas, dados live, assinatura/fundos ou fornecedor. Build físico exit0 informado; CUA teve dois timeouts segundo integrador. | UNKNOWN prova visual, effective model/effort/tier e dependências live. Full native inonu-trader permanece incompleto. |

## Reproduções e ação necessária

**A: `src/jev-read/feed.ts:619–628`, especialmente626.** Fonte/clock corrigido E=2000000000000; ack mono140000. Avançar a200000, renovar book/ticker/31candles e comprovar built.ok=true. Receber5000 buys no mono200000. Retroceder a130000 e receber mais5000; cap descarta os5000 receipts200000, mas age=−70000 impede registrar perda. O bloqueio durante rollback é observado e não conta como reprodução final. Retornar a200000 e renovar core com source nova: nenhum gate core inválido. Actual: lostThrough=null, retained5000 com receipt130000, flow count/buy/sell/CVD0, built.ok=true, insufficient=[], decisão buy/statusok, calls1. Os5000 removidos têm idade0 e não podem desaparecer da prova.

Requisito exato SPEC:130: “clock monotônico inconsistente” e “perda na janela produzem trades_unavailable”; SPEC:136: “A prova fica insuficiente mesmo se os 5000 restantes parecem válidos.” Expected na captura final: built.ok=false/reasons=[trades_unavailable], state/decision=null, calls0. Conservar a inconsistência/perda até cobertura completa novamente comprovada; adicionar RED público combinado rollback+cap com todos os demais gates frescos e controle equivalente. Isto usa clock injetado explicitamente exigido por SPEC:202, não afirma rollback de performance.now em operação real.

**B: `src/jev-read/feed.ts:581–611`, especialmente585/593 e601/610.** Coverage madura e core válido alcançam1 chamada. Para cada book/ticker×REST/WS, aceitar resposta ts=E+60000: gate rejeita especificamente o alvo,0 calls. Depois exchange=E+1 e resposta válida ts=E+1. Actual: snapshot mantém sourceTs=E+60000, built.ok=false com book_stale/ticker_stale, state/decision=null,0 calls. Expected: resposta realmente fresca restaura built.ok=true e1 chamada consultiva. O monotônico não retrocede neste probe.

SPEC:150: “ts1, ausente, futuro, unidade/forma inválida ou identidade errada não se tornam novos porque chegaram agora.” SPEC:197: “refresh válido restaura”. Impedir amostra temporalmente inválida de se tornar watermark permanente, preservando ordenação legítima/duplicatas. O seam deve usar o domínio corrigido congelado (SPEC:52/54/176/178), sem comparar provider ts ao wall bruto, alterar ClockKeeper ou relaxar TTL. A escolha/fix em discussão com Bohr não foi revisada nem aprovada.

**VERIFY:** completar casos públicos faltantes com assert de pré-condições, reason próprio, efeito de modelo e positivo pareado. F3 não pode usar `built.ok ? funding : null`; doubles isolados não substituem validação do feed e builder. As falhas de evidência acima não afirmam que os comportamentos UNKNOWN falham em produção.

## Replay original e mascaramento

`reviewer-boundary-probe.ts` ficou intacto. Examinei fonte, resumo e stdout/stderr byte-identificados do replay do integrador; não executei novamente o original, que também escreve tokenboard em seu diretório. Resultado: exit1,23 casos,11 PASS/12 FAIL; F1/F3/F4/F5/F6 FAIL, F2/TOKEN PASS. Isto cumpre presença/identidade do replay, não converte seu resultado em aprovação.

| Linhas do original | Precondição ou masking observado | Controle equivalente atual |
|---|---|---|
|9–21 | Fixture legacy omite provenance/mono/coverage. F1 positivos e clock_unknown não chegam isoladamente ao alvo; negativas podem passar por gate anterior. | Probe:53–72, clock conhecido/unknown com core completo; positivo1 call. |
|26–35 | Socket não injeta/avança monotônico60s. F2 PASS não exige reason exclusivo, aceita bloqueio adicional de coverage. | Probe:73–92 separa book/ticker,REST/WS,source/cache e renova os outros campos. |
|38–40 | Matching funding não chega a estado válido; ternário mascara wrong/stale/missing como null mesmo com core bloqueado. | Probe:93–111 e calendário exato suplementar: built.ok=true, funding .4/null, insufficient=[],1 call. |
|47–53 |500 imprime sem coverage madura. Flood PASS aceita qualquer !ok, inclusive janela curta. | Probe:113–124/feed.test:360;500⇒.2/CVD100,6000⇒somente trades_unavailable. |
|54–62 | F5/F6 reutilizam input legacy; gate impede modelo/decision, logo FAIL não prova regressão de abort/deadline/overflow. | Probe:125–140 preserva core válido, mede calls e decisão/status/cleanup. |
|TOKEN,65–73 | Matriz direta passou; label de candidate embutido é histórico, não autentica estes bytes. | Vincular a manifesto/patch efetivos abaixo. Nenhuma alteração de TokenBoard em escopo. |

## Execução, proveniência e hashes

Reviewer conversation `01a12dc0-af1f-7f63-ae3f-e9ac650798af`; SESSION_ID compartilhado `01a12971-f941-7e42-8a42-fab6d44d4eb5` não foi usado como identidade de revisão. Papel configurado informado: harness_reviewer/GPT6.1Sol/xhigh; **effective model, reasoning effort e tier UNKNOWN**. Cópia ordinária isolada, sem garantia OS readonly; nenhum Git/harness/dependency/prod/test/SPEC modificado. Única gravação na cópia: este relatório. Probes/saídas próprios estão fora da source tree. Não houve implementação própria nem chamadas de rede/provedor/modelo externo, credenciais, fundos, assinaturas, push ou deploy.

Comandos independentes:
```text
bun --no-env-file --no-install test --parallel=1 --timeout 15000 ./src/jev-read ./src/system-one/clock.test.ts
# exit0;195pass/0fail;1974 expect() calls;6files;Bun1.3.14(0d9b296a)
bun --no-env-file --no-install run typecheck
# exit0;tsc --noEmit -p tsconfig.verification.json
bun --no-env-file --no-install C:/Users/gabri/.codex/tmp/spec-probes-01a12dc0-20261012/contract-controls.ts
# exit0;195/195
bun --no-env-file --no-install C:/Users/gabri/.codex/tmp/spec-probes-01a12dc0-20261012/original-contract-calendar.ts
# exit0;calendário original/0.4/core válido/1call
bun --no-env-file --no-install C:/Users/gabri/.codex/tmp/spec-probes-01a12dc0-20261012/rollback-cap.ts
# exit1;A reproduzido
bun --no-env-file --no-install C:/Users/gabri/.codex/tmp/spec-probes-01a12dc0-20261012/future-watermark.ts
# exit1;B reproduzido em4casos
```

`FULL-TEST.stderr.bin:2457–2461/3492–3495` corrobora2192pass/2skip/0fail backend e909pass/0fail web; logs são do integrador, não execução própria. typecheck:all0 e build físico0 foram informados pelo integrador, sem raw desses comandos conferido nesta revisão. Ausência de prova visual é UNKNOWN, não falha UI demonstrada.

Baseline fixo declarado no manifesto: `14cbb7bd2878eed0a930b324b0c50610be7cdab8`. A cópia não contém .git: baseline é vínculo declarado do snapshot/patch, não commit local novamente inspecionado. Todos os11 hashes do manifesto foram confirmados antes de ler implementação e ao encerrar; source permanece byte-idêntica ao candidato recebido.

| Arquivo na cópia | SHA256 verificado |
|---|---|
|CANDIDATE-MANIFEST.json|b61c666f272a9ee02c1a8af7ffe3d5b9b4b31cd29325731cf6e907d18d76b90a|
|CANDIDATE-DIFF.patch|ebe9a78a8f3cc7b545da29a1c3f72b28f96d89313f1d38aaf4cd67aac2479597|
|src/jev-read/feed.ts|c93e4a28ec0eae634e181928c20af7888d4b0ba4cdb04b5e86b02224b3e4bcce|
|src/jev-read/state.ts|f6cd210039391b23f2f93b6103de5efdeeb85cfb9e735cf4a0604b32eef580cc|
|src/jev-read/loop.ts|0699bd853d802fad0f55afbc7f0ed771e79f7ef8d20978dbdee8f0ebc5532d86|
|src/jev-read/types.ts|79d4193ae455f74d0792c1a04b363453284bea0a401d98e0b1ab2c7671626962|
|src/jev-read/feed.test.ts|080d0df37968436093d72ef62412ba7c4d1626ab223e786e4544413657bb2a98|
|src/jev-read/loop.test.ts|a92f751c2708a368d33f451558c75da27ae4f5777e36303dcccf2a60e169b902|
|src/jev-read/state.test.ts|a6e0c015dc29f9621b4a06c94068d9b2a1a7772f97d131de2ad3d1e403fe43e5|
|src/jev-read/read.test.ts|9cd7f421249514902fea7ae82fe84ce1b693ebada11b481eeef57ab954512bf9|
|docs/JEV-TAPE-DATA-F1-F4-SPEC-V2-20261011.md|10cee5fe44e7dbde5a988d34822ee99061cb24b39341e2cefe77a4bae2439c97|
|docs/JEV-TAPE-DATA-F1-F4-PLAN-20261011.md|9a48752fdd015bf52221810915b536598b4643257bcad4f0b6e201c84398c14e|
|docs/JEV-TAPE-DATA-F1-F4-INDEPENDENT-SPEC-V2-REVIEW-20261011.md|59181ab94d66489682f4d13947397c7d842a7d897eb15076a2446d4d0d589b49|
|reviewer-boundary-probe.ts|a7a44e9482c1635bb73307e6bcc2a3c599591548442f1a0843953332c326091e|
|PROBE-ORIGINAL.stdout.bin|965f6a2aa06471c1b1ddeec85c36cecb1f7d5c48f3635f91631e412b19e3b95b|
|PROBE-ORIGINAL.stderr.bin (0bytes)|e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855|
|PROBE-ORIGINAL-REPLAY.json|247da6f7870dbd5b605d0ed3a39e7a2fc3b5f920ffed570eba3d8884ba27f56b|
|FULL-TEST.stdout.bin|973de49f7ff2d2c242e32b62008dfa2cc256c5e20860157f43d73eeb04339b62|
|FULL-TEST.stderr.bin|cfc3413f9145d2b0a9a64af68e1573debd683ed1e573c4badec15235e148296f|

Safety físico/LF normalizado foi verificado separadamente, não confundido com hashes de byte:
| Arquivo | SHA256 físico | SHA256 LF igual à baseline da SPEC |
|---|---|---|
|read.ts|0422288919d60e969f76b21acee97802cda8ab9028fb73044c9817233b247b52|c14a262dd08b3b60b7a1b0d9a1bf25dcdd9fea9cbcf86b74f86c6dec37febbea|
|decide.ts|e46315754bafad687e25d39dc511fb6cba4e74af79bebe527e4605db1283358c|b8823b2dccb3c4c162ba27af530a47c1aca2fd8371e0e10d2e99af70c58c049a|
|public-view.ts|9eea06df480ac9b5c647522e1213e5ce803c183fc345b2681289dcb206bc377d|8fa5323cb6772f2dacd7ad03dd929a27c8eea6e6ede246b08dbf53326dd62e81|

CLI, clock e web adapter também conferidos contra hashes LF congelados: scripts/jev-read.ts `315e8c1dbbed5f5c277d4a0331506f79bac4bf91ac940f0b8526ffe10e051fe5`; src/system-one/clock.ts `5e20f8e8ab92e7e4a4bdd524f4be8c1fc63eea264feb3dda74136f23db7105f1`; web/src/lib/jev-read.ts `2f852d4f218cca82c5473641d769e64e93d950984187b9b13e217d1432fb2e84`.

Artefatos independentes preservados em `C:/Users/gabri/.codex/tmp/spec-probes-01a12dc0-20261012`:
| Arquivo | SHA256 |
|---|---|
|contract-controls.ts|12fbdb8e3299f19aa093027685165af43172429071a48ec43f99d62efe2de14c|
|controls.stdout.json|9507a7a63adf3d42948db0a119d969079ab91a9b20c242dd26fe4be06a25cf37|
|controls.stderr.txt (0bytes)|e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855|
|original-contract-calendar.ts|f8b54bd0417eb4e2f1b5d129e423ae47ed01bd3dc3771341749be3e93877b7ad|
|original-contract-calendar.stdout.json|81cbd7e13b2bc54866cb4f4ef5b38aa7dcce00302b65a1cc1910c185d948b5b2|
|original-contract-calendar.stderr.txt (0bytes)|e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855|
|rollback-cap.ts|a3bf5a6069b09de2ffd4fbdc807aa887365d727f05b219b0a98059efd7151b58|
|rollback-cap.stdout.json|f20acc0d8e4fa1aa79a17d4d3673caba8c2f875ef1be170ca47a9dec780f0e8a|
|rollback-cap.stderr.txt (0bytes)|e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855|
|future-watermark.ts|16815f810256a2ba6993935bb097a1e81d6ca3208f05a9e9a67aca4eeecb0574|
|future-watermark.stdout.json|c0d4f844a01094a57e685c3266569c4577c28896c4da78d996662ba6af576f94|
|future-watermark.stderr.txt (0bytes)|e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855|
|contract-controls-v1.ts|f51a811f16653c6702f3efe9b3aa8dac60d3c30994dbed64ff4cfbaf6397b56b|
|controls-v1.stdout.json|7a9d0992063a10701dd7103e01e2df29f51a1a76a3f00d3853221b4fe6109d2b|

V1 independente teve95pass/100fail por fixtures próprias (readId sem prefixo jr- rejeitado na projeção e fontes duplicadas impedindo renovar outros caches). Corrigi somente fixtures do probe; candidato, aceitação e assertions ficaram intactos. Import incorreto de função pública também foi corrigido antes da execução JSON. V1 permanece para auditoria e não constitui falha do candidato. Os outputs dos probes próprios são arquivos redirecionados por PowerShell, sem alegação de replay byte-identical do original.
