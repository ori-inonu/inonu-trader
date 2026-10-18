# Revisão independente parcial F1/F3 — 2026-10-11

**PASS PARCIAL da fatia solicitada: nenhuma regressão bloqueante reproduzida no candidato fixo. F1–F4 completos NÃO aceitos; merge NÃO autorizado.** O objetivo central permanece incompleto. Este parecer é evidência independente, não autorização financeira, de implantação ou de integração.

## Identidade, escopo e isolamento

Revisor desta conversa, distinto do integrador. Identidade nativa observada: CODEX_THREAD_ID `01a12adc-473d-7381-b067-c83af7ccda31`; CODEX_SESSION_ID `01a12971-f941-7e42-8a42-fab6d44d4eb5`. GPT-6.1 Sol/xhigh solicitado; modelo, esforço e tier efetivos **desconhecidos**.

Origem somente leitura: `C:/Users/gabri/.codex/worktrees/inonu-jev-tape-data-f1-f4/jev-trader`.
Baseline imutável: `14cbb7bd2878eed0a930b324b0c50610be7cdab8`.
Neste documento, **R** significa a cópia exclusiva:
`C:/Users/gabri/.codex/worktrees/inonu-operator-c4-research-20261011/partial-f1-f3-review-20261011-2eb133eaa560`.
Referências de linhas abaixo apontam para R, não para a origem móvel.

Cópia ordinária, sem garantia OSRO ou firewall. Não executei app, feeds reais, full suite, instalação, assinatura, RPC, ordens ou chamadas explícitas a Jev/provedor. Não li .env/credenciais; não executei comandos de mutação de Git/harness. Probes e logs novos somente em R; parecer somente no arquivo exclusivo solicitado. Avisos consultivos automáticos da plataforma não constituem aceitação.

## Standards

Nenhuma violação documentada confirmada na fatia. CONTRIBUTING.md:5 exige mudança delimitada e ausência de credenciais/capturas privadas; :18 exige fixtures explicitamente sintéticas e limites de execução declarados. Os probes usam dados inventados e transporte/modelo local. A adição de política interna não altera autoridade de execução.

Apliquei code-review e codex-desktop-harness proporcionalmente. PLAYBOOK não foi localizado nas buscas delimitadas da origem, cópia e referências explicitamente fornecidas; não afirmo conformidade com conteúdo indisponível. Não identifiquei smell de Fowler concreto que justifique finding; heurísticas não são violações documentadas. Não reporto questões exclusivamente de tooling.

## Spec

**PASS somente nos comportamentos abaixo**, observados por source inspection e limites públicos feed/snapshot/buildTapeState/runJevRead. Construtor rejeita TTL inválido com RangeError antes de fetch/socket/timer; omitted/undefined usa120000, opções explícitas permanecem no snapshot e mutação posterior não altera a política. Funding usa par completo, exige reported inst exato e ts decimal seguro obrigatório, limpando scalar anterior inválido. Candles rejeitam coerção e admitem zero; builder exige timestamps seguros não negativos, continuidade e idade final estrita sem tolerância futura.

Negativos core exigem reason específico, state/decision null e zero chamadas falsas; funding inválido isolado exige built.ok=true, insufficient vazio, funding null e uma chamada falsa. Positivos preservam schema1, advisory=true, execution=never, barra em formação, clock corrigido fracionário, wall±180s e funding0/negativo.

**Incompletos conforme declarados:** prova estruturada de funding, expiração real por idade source e monotonic cache, política/prova revalidadas no builder direto, F2, F4, geração/perda/recuperação, snapshot provenance e clocks finais após awaits. Em R/src/jev-read/state.ts:140, scalar finito ainda vira percentual sem TTL/prova. Esta lacuna impede aceitação integral, mas não é regressão nova desta fatia. O default120s é política local, não SLA OKX.

read.ts/decide.ts são os blobs baseline preservados; testes de cópia numérica, validação, timeout/abort e compactação permanecem GREEN. Não certifiquei readRound, integração dos demais consumidores, migração completa de fixtures ou typecheck próprio. O “99pass/types0” fornecido pelo integrador é evidência atribuída, não reproduzida neste checkout fixo.

## Matriz de evidência da fatia

| Comportamento | Evidência literal/linha em R | Controle independente |
|---|---|---|
| TTL construtor e snapshot | feed.ts:122 valida formato e positividade antes de efeitos; :181 devolve política | reviewer-partial-v2.test.ts:172–188: null/string/0/negativo/fração/NaN/±Infinity/unsafe; efeitos0; default e60000/180000/MAX_SAFE; mutação das opções/snapshot |
| Fullpair funding | feed.ts:257: `/api/v5/public/funding-rate?instId=${instId}-SWAP` | probe v2:133–143: BTC-USDT e ETH-USDC; endpoint exato e .004→.4,0→0,−.004→−.4 |
| Identidade/ts e limpeza | feed.ts:260 verifica reported inst e `sourceTimestamp(row.ts) !== null`; :262 limpa no catch | probe v2:145–170: reported errado/ausente, ts inválido/ausente apesar de calendário válido, rate inválido e erro após scalar válido; core continua válido |
| Parsing candle sem coerção | feed.ts:87–89: string decimal, safe integer>=0; :242–245 verifica null, não falsiness | probe v2:116–129: firstts0/MAX_SAFE positivo; fração/expoente/hex/whitespace/newline/número/unsafe não sobrescrevem rows anteriores |
| F1 futuro/clock | state.ts:97–102: clock finito>=0<=MAX_SAFE; idade inclusiva0–150000, futuro estritamente rejeitado | probe v2:70–101: +1/+5000/+5001; idades0/150000 positivas, −.25/150000.25 negativas; clock fracionário e wall±180s |
| Domínio direto sem mascaramento | state.ts:41 exige safe integer>=0; :42 exige delta60000 | reviewer-domain-control.test.ts:43–54: todas as barras fracionárias ou negativas mantêm continuidade e idade0/1, clock válido; controles equivalentes passam |
| Preservação consultiva | read.ts:37–42 e :66; decide.ts:48/50/67; read.test.ts:119–125,148–200 | teste baseline read.test inalterado + probe v2:50–68: scalar esperado, counter exato, cópia/projeção, sem metadata TTL no state |

Hunks literais relevantes, na ordem feed.ts:122, feed.ts:87–89, feed.ts:260 e state.ts:102:

```typescript
if (!Number.isSafeInteger(fundingMaxAgeMs) || fundingMaxAgeMs <= 0) throw new RangeError("fundingMaxAgeMs must be a positive safe integer");

if (typeof value !== "string" || !/^\d+$/.test(value)) return null;
const timestamp = Number(value);
return Number.isSafeInteger(timestamp) && timestamp >= 0 ? timestamp : null;

memory.fundingRate = isRecord(row) && row.instId === `${instId}-SWAP` && sourceTimestamp(row.ts) !== null ? num(row.fundingRate) : null;

if (ageMs < 0 || ageMs > CANDLES_MAX_AGE_MS) reasons.push("candles_stale");
```

Os limites completos continuam os da SPEC: :51–52 domínio; :58–70 política e TTL; :146 F1; :156–162 F3; :186–214 anti-masking, composição e builders; :231 preservação de outputs. A matriz não substitui nem enfraquece esses critérios.

## Execução offline reproduzível

Runtime observado: Bun **1.3.14 (0d9b296a)**; Node **v26.9.0**. Wrappers usam Bun absoluto, ambiente filho allowlisted apenas SystemRoot/WINDIR/TEMP/TMP/BUN_NO_INSTALL; TEMP/TMP exclusivos. Não herdam demais variáveis. Timeout externo30s, testes15s. Preload bloqueia fetch/WebSocket globais e mocka ai/TypeSafe antes dos imports; transporte/socket dos probes são injetados. Isso é contenção da execução testada, não garantia universal de rede.

| Execução | Exit | Resultado literal | Bun / wrapper |
|---|---:|---|---|
| Candidato v2 | 0 | 83 pass,0 fail,4885 expect;3 files | 242ms /305.5743ms |
| Baseline v2, mesmos21 probes | 1 | 10 pass,11 fail,2456 expect;1 file | 97ms /153.4244ms |
| Candidato domínio adicional | 0 | 2 pass,0 fail,184 expect;1 file | 60ms /134.0628ms |
| Baseline domínio adicional | 1 | 0 pass,2 fail,170 expect;1 file | 62ms /112.8591ms |

Candidato v2 reúne34 testes do feed fixo,28 testes read baseline e21 controles independentes. A execução adicional é separada; não chamo esses85 testes de full suite. Todos os quatro runs finais registraram `signal:null,error:null,bytes_unchanged:true` e `OFFLINE_GUARD_COUNTERS {"fetch":0,"socket":0,"inference":0,"provider":0}`.

RED diferencial reproduziu aceitação baseline de futuros+1/+5000, substituição ETH-USDC→ETH-USDT-SWAP e falta de identidade/ts/validação TTL. Loops param na primeira falha; não afirmo que cada valor da matriz falhou no baseline. Domain RED reproduziu built.ok=true para cada tail inválido, preservando continuidade/idade; candidato rejeitou especificamente candles_short, sem chamada falsa.

Transparência: primeiro probe do revisor produziu64pass/19fail, por **duas falhas próprias da fixture**: snapshot chamou argumento exchange na posição now, deixando exchange null, e readId não tinha prefixo jr-. Corrigi somente a fixture para snapshot(instId,wall,exchange) e jr-synthetic-partial-review; assertions e candidato preservados. Logs iniciais retidos, não classificados como regressão nem RED do baseline. Probe v2:102–114 mistura domínio com continuidade; o teste adicional de domínio remove essa interferência para fração/negativo. Nenhum resultado do probe original foi alterado.

Reprodução, cwd R, sem full suite:

```powershell
& 'C:/Program Files/nodejs/node.exe' './run-offline-v2.mjs' candidate
& 'C:/Program Files/nodejs/node.exe' './run-offline-v2.mjs' baseline
& 'C:/Program Files/nodejs/node.exe' './run-domain-control.mjs' candidate
& 'C:/Program Files/nodejs/node.exe' './run-domain-control.mjs' baseline
```

Os wrappers conservam logs com flag wx e recusam sobrescrevê-los; repetir exige novo diretório exclusivo. Bun candidato v2 executou `--no-env-file --no-install test --preload ./offline-preload.ts --timeout 15000 ./src/jev-read/feed.test.ts ./src/jev-read/read.test.ts ./reviewer-partial-v2.test.ts`; baseline v2 executou somente o mesmo probe21. Os dois runs domínio executam somente reviewer-domain-control.test.ts.

## Hashes fixos e preservação

SHA256 dos bytes efetivamente revisados, verificados antes/depois:

| Arquivo em R | SHA256 |
|---|---|
| src/jev-read/feed.ts | 1b04d62372aff2a95b290afa810400d32664e0b46258f7fac8419b848023b411 |
| src/jev-read/feed.test.ts | 4178762e2eafe54092c21ac785f28f907361a8d2d399cce918065bc5e1e403f1 |
| src/jev-read/state.ts | 9d3a4fc07cb27a02537ea2c6c02d1b01e773aa041a218dc4597c9632057bc920 |
| src/jev-read/types.ts | 13c3f910894f8ce75c4aa1374ff02b68e1e2c78dfc8bcc51533ab63f668fef5c |
| docs/JEV-TAPE-DATA-F1-F4-SPEC-V2-20261011.md | 10cee5fe44e7dbde5a988d34822ee99061cb24b39341e2cefe77a4bae2439c97 |
| src/jev-read/read.ts, baseline LF | c14a262dd08b3b60b7a1b0d9a1bf25dcdd9fea9cbcf86b74f86c6dec37febbea |
| src/jev-read/decide.ts, baseline LF | b8823b2dccb3c4c162ba27af530a47c1aca2fd8371e0e10d2e99af70c58c049a |
| src/jev-read/public-view.ts, baseline LF | 8fa5323cb6772f2dacd7ad03dd929a27c8eea6e6ede246b08dbf53326dd62e81 |
| src/jev-read/read.test.ts, baseline LF | cd85d2b9e52008e02921d607f850f757e327b4771099b7379b00e5cad6168299 |
| CONTRIBUTING.md, baseline LF | 491e629c515cf69267528de649f19bcb0b3f4425a133d070487d7d4647d402f6 |

Baseline LF em R/baseline: feed.ts `0aae9ebe79414065d6459558314ab217084edace2c5acac483c34f37c88b435e`; feed.test.ts `439afd03d074c7394222a6ef860ca0c1119118c8bc78d98bac3656612b5e3539`; state.ts `7eee52fbdd4ad8b3a3b2eea23686a80236f571a21ada3f968149a8461b4bd333`; types.ts `c6966959aa9dd342d4bf83a11c0a7bcf9d95afba1a7d3b6a1ea7f54191e97c4f`.

Concurrência: hashes inicialmente coincidiram com os quatro fornecidos; origem avançou durante preparação. Guards interromperam cópia móvel. Reconstituí a versão fixa por blobs baseline + diff exato capturado + bytes CRLF, exigindo igualdade com os quatro hashes fornecidos. Captured patch/manifests e script permanecem em R. Fonte avançada não foi qualificada. read.ts/decide.ts físicos da origem mantiveram hashes `0422288919d60e969f76b21acee97802cda8ab9028fb73044c9817233b247b52` / `e46315754bafad687e25d39dc511fb6cba4e74af79bebe527e4605db1283358c`, iguais ao baseline após normalização CRLF→LF. Última verificação desses dois e SPEC:2026-10-11T22:39:56Z. Não afirmo que toda a origem permaneceu inalterada; read.test.ts concorrente não foi usado.

Preservados: probe original `C:/Users/gabri/.codex/worktrees/inonu-system-one-review-spec-20261011/committed-jev-2d00d8f-schjw8q8/reviewer-boundary-probe.ts` SHA `a7a44e9482c1635bb73307e6bcc2a3c599591548442f1a0843953332c326091e`; relatório V2 anterior SHA `59181ab94d66489682f4d13947397c7d842a7d897eb15076a2446d4d0d589b49`; relatório REVISE anterior SHA `f72813fc994c65ba2650fed6c1fd33ba5ced5f72bc138b3bfed12a48e2b97333`. Nenhum sobrescrito.

## Scripts, probes e recibos locais exatos

Todos os caminhos abaixo relativos a R; stdout bruto dos quatro runs finais tem SHA comum `d03ad86cb4185124fa782f7a8fe9c5d3471eb67e7217e0e335ad4bd2e3f1314a`.

| Artefato | SHA256 |
|---|---|
| captured-pinned-candidate.patch | f6e5299a163331b0683c5ae3c8c873298e8c7f8359724752fa04a232491dca9f |
| copy-manifest.json | aacc3fefec01e2c0483f74b797bb0def9712258bc553959fa4fde3dfabcee7ec |
| reconstruct-fixed.mjs | e1aeff87911bce48e768d6ed1a35ff20a721797336faa2c2b83918ee52eed90c |
| prepare-probe-v2.mjs | 73996991b287750a8f67011e28055763e8b43ac6b62036d3695fa84bb7ac0533 |
| run-offline.mjs, wrapper inicial | 7964a24b86cc3d0182d5f337008f798964382b5fb436131f00ebb77268c2f497 |
| run-offline-v2.mjs | a87b1c758db34339761e6f7504b928361f5b3bad6350433b1bb4db5e696f1120 |
| offline-preload.ts | 9db9ce183e203dcefa297fb25408ec06b8a1bea1d12d55d01415aa64e81144ca |
| reviewer-partial.test.ts, fixture inicial | 0f184eeaf9c2144acb54d3c47857971d8744770af8a08abde9abd38c4514987a |
| reviewer-partial-v2.test.ts | 81bc28c40033734a2c4bea1ae6ace4d3c06e055d8a343d6d34e002ae6b6213bc |
| reviewer-domain-control.test.ts | c7a0e718b4f87db6c84fccf6f3e15aadb3cd88b8234cf1ace2998435a6d09a93 |
| run-domain-control.mjs | 5d3d9bbf5acc355f191c7cb31078da0f38860dc653a90f83804dbe87a94c0b20 |
| candidate.stderr.log, fixture inicial | 600fae485694ef06e5c6ed2e7b88acf42e971af01dff4b48e6e877bca58482ab |
| candidate.metrics.json, fixture inicial | 985a88e79d4287c7f1b07f9cb1cf1fdfda44b05ad3d5367d3fc293c0407530ce |
| candidate-v2.stderr.log | 65cad02231758367ed4bf58d0cd8443a49d9b883fc1d841f55c4f60b4884d4e3 |
| candidate-v2.metrics.json | f7883cf9ca899e2e9c335de235970c04eda7cb00e1ac0064e706ebb458f2d569 |
| baseline-v2.stderr.log | 77aa13177d8a48333ebe8230ad4010ebbb9f402f1088564a53a111d32f0838cd |
| baseline-v2.metrics.json | 983601cac352e212cc1b21a0d813ace40530461abd2daaa49c3cc3460c0457e5 |
| candidate-domain.stderr.log | 154ce5cfb1ab3d94abe96f5d84cdee4cdfa2347f9b547c715adae3675f218b77 |
| candidate-domain.metrics.json | e6713b4d1a921256918496c2bd886b09c186f949b7bbf3083870874d9905746c |
| baseline-domain.stderr.log | 5e0dda6f17655e8a918114ff54d3fe6867f6739e2899ea576fab15acd1a5366e |
| baseline-domain.metrics.json | afef29b998b0519f6b8b6c6a1344e819414e87d1f902380bd602396fdc86804a |

Não executei verificação financeira, provider live, UI fim a fim, performance real ou rentabilidade. Próxima aceitação exige implementação e evidência independente dos critérios completos congelados; este relatório não aprova essa implementação futura.

