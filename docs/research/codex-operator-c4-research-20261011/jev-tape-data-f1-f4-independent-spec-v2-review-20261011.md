# Revisão independente da SPEC F1–F4 V2 — 2026-10-11

**Veredito: APPROVE para suficiência semântica da SPEC V2 no SHA256 abaixo.** Os três itens do meu REVISE estão fechados como contratos verificáveis; não identifiquei requisito bloqueante ausente. Este parecer sobre a proposta de Locke não congela a SPEC, não autoriza implementação e não prova RED/GREEN, integração, readiness econômica ou conclusão do objetivo central. F1–F4, M1–M6 e P1–P6 continuam obrigatórios.

## Escopo, identidade e método

Revisor independente: CODEX_THREAD_ID observado `01a12adc-473d-7381-b067-c83af7ccda31`, distinto de Locke `01a12ada-91d7-7ce0-b6ea-e1556d234224` e do revisor do probe original `01a12ada-7b55-7fd2-8a20-c940f474c1a1`. CODEX_SESSION_ID observado `01a12971-f941-7e42-8a42-fab6d44d4eb5` não foi usado como identidade própria. GPT-6.1 Sol/xhigh solicitado; modelo, esforço e tier efetivos desconhecidos.

V2 revisada: [jev-tape-data-f1-f4-spec-v2-20261011.md](C:/Users/gabri/.codex/worktrees/inonu-system-one-review-standards-20261011/jev-tape-data-f1-f4-spec-v2-20261011.md:3), SHA256 `10cee5fe44e7dbde5a988d34822ee99061cb24b39341e2cefe77a4bae2439c97`.

Fonte fixa lida por blobs Git: `C:/Users/gabri/.codex/worktrees/inonu-jev-tape-data-f1-f4/jev-trader`, commit `14cbb7bd2878eed0a930b324b0c50610be7cdab8`, tree observada `9698718595aa0c7c1b80021449f32d99eff26f92`. HEAD conferido; não foi seguida fonte móvel. O delta delimitado desde 1f08e6e em src/jev-read/scripts modifica somente read.ts, decide.ts e read.test.ts. Nenhuma limpeza ou ausência de WIP é certificada por esta revisão.

Aplicado codex-desktop-harness proporcionalmente, recuperando somente o contexto desta conversa, sem transições/mutação. Leituras documentais e de código, busca delimitada de consumidores e conferência de hashes; nenhum teste, aplicação, instalação, agente filho, Git edit/stage, credencial/.env, signer, fundo ou chamada própria a provider/modelo/Jev. Hooks automáticos emitiram pareceres consultivos; não são autorização. A única escrita é este relatório exclusivo. Cópia ordinária e isolamento por disciplina/caminho, sem prova de sandbox OS somente leitura ou bloqueio de egress. Estado privado do harness não foi copiado ao relatório.

## Fechamento do REVISE e aceitação independente

| Exigência anterior | Evidência literal e avaliação |
|---|---|
| TTL explícito, injetável e inválidos | V2:58: “Somente opção omitida/undefined seleciona o default.” Opção fundingMaxAgeMs no feed, default único120000, inteiro seguro positivo, RangeError antes de fetch/socket/timer para null/string/zero/negativo/fração/NaN/Infinity/unsafe. L60/64–68 exige política na entrada e conjunção independente de idade de fonte e cache. L200–201 exige bordas inclusivas, excesso fracionário, TTL60000/180000 e ausência de defaults escondidos. **PASS semântico.** |
| Prova obrigatória até builder direto | V2:90: “Nenhum wrapper pode preencher proof ausente como fresco/completo.” L80–114 fecha contexto, identidade pedida/reportada, captura, origem enumerada, receipt, fonte, época e geração; L118–140 fecha cobertura/perda. L210–217 exige bypass direto e cadeia pública. Bool/scalar não substituem prova. **PASS semântico.** |
| Controles contra mascaramento | V2:192: “built.ok=true, insufficient vazio, fundingRatePct=null”. L188–190 exige demais dados válidos e reason específico; flood deve ter trades_unavailable, não expiração artificial de book/ticker/candles. Positivos exigem uma chamada falsa e saída schema1/advisory/never. **PASS semântico.** |

| Critério original | Contrato e controles suficientes na V2; execução ainda pendente |
|---|---|
| **F1 — futuro +1/+5000 rejeitado** | L146/196 exige idade0..150000 inclusiva, +1/+5000/+5001 rejeitados sem epsilon/rounding, 31 barras contíguas e forming. Relógio corrigido fracionário é válido; clock desconhecido bloqueia. Positivo antigo state.test.ts:179–181 deve mudar, conservando equivalente não futuro (L229). |
| **F2 — receipt não renova fonte velha** | L150–152/197–198 separa REST/WS e book/ticker; fonte/cache têm limites independentes5000/15000. Identidade, ts ausente/futuro/inválido, resposta velha, duplicata e conflito têm comportamento fechado; prova anterior não é rejuvenescida. REST book/candle conserva vínculo local pedido/endpoint sem inventar identidade remota (L100/106). |
| **F3 — errado/velho/ausente desconhecido** | L156–162 exige swap do par completo, fonte rest_funding, ts de observação e rate finito, distinguindo calendário. 0.004→0.4, zero e negativos têm controles conhecidos; desconhecido isolado mantém core válido e uma chamada consultiva (L192/199–201). TTL fonte/cache expira sem refresh; erro/metadata inválida não usa valor anterior para mascarar. |
| **F4 — ACK não é60s; 6000→5000 incompleto** | L124–140/166–170/202–203 exige geração/época correntes, primeiro ACK correspondente,60000 contínuos, socket aberto e prova final. ACK duplicado/pong/outro canal não amadurece nem renova cobertura; callback antigo não ganha geração nova. Cap5000 conserva perda conhecida: idade60000 ainda bloqueia, estritamente fora recupera sem mensagem nova. Quieto completo,5000 sem perda e500(300buy/200sell) .2/CVD100 são positivos obrigatórios. |

Os casos negativos F1/F2/F4 exigem built.ok=false, state/decision null, reason específico e zero chamadas falsas. Funding inválido isolado exige built.ok=true, demais gates preservados, funding null e uma chamada. A distinção fecha o falso positivo “qualquer bloqueio basta”.

## Relógios finais, proveniência e consumidores

V2:51–56 distingue Unix inteiro seguro de exchange/monotônico finitos potencialmente fracionários; regressão monotônica não vira idade zero. Salto wall não invalida sozinho cache monotônico coerente nem fabrica cobertura. SourceTs de candle é sua abertura; somente a última barra define o TTL, sem eliminar31 barras históricas.

V2:174–180 exige reavaliar ages depois de refreshBook e capturar clocks finais depois do último await. Snapshot captura monotônico uma vez, igual a CoverageProof.observedThroughMonoMs; nenhum await antes do builder síncrono. Slow refresh que expira core bloqueia; funding expirado isolado fica null. Não se promete frescor durante inferência. Isso corrige o seam atual loop.ts:102–105 sem alterar deadlines/abort do reader.

No baseline, feed.ts:198/213/364/373 descarta ts; :240–250 guarda funding escalar; :169 e state.ts:101 equiparam ACK a disponibilidade; :379–383 perde registros silenciosamente. state.ts:80/98 admite futuro pela tolerância atual. São constatações de fonte, não bugs corrigidos pela proposta.

Ownership V2:223–229 delimita feed/state/types/loop e testes ao integrador, com arquivo público novo somente após atribuição. read.ts/decide.ts permanecem sob owner safety; read.test.ts permite apenas migração coordenada de fixtures depois da auditoria safety. Fixtures state:11–27, loop:68–89, feed:246–293/311–319 e read:14–25/119–145 precisam prova/cobertura e clocks válidos; não apagar asserts de safety. O compact funding0.012346 deve conservar sua expectativa.

A busca delimitada confirmou os seams de snapshot/ages/TapeInput em feed/state/read/loop e fixtures. V2:231–242 conserva schema1, reasons fechadas (public-view.ts:9/91–98), funding nullable (web/src/lib/jev-read.ts:93), cópia numérica ao modelo e M1–M6. read.test.ts:48–69/148–203 contém controles F5/F6; ler esses testes não os reexecuta ou reaproveita sua aprovação para a futura composição.

## Limites de evidência e condições de próximo ciclo

O probe original permanece byte-identical. Seus L10/26/28 usam fixtures legadas sem proof e ACK imediato; L40 mascara builder bloqueado como funding null e L53 aceita qualquer bloqueio no flood. Assim, seu replay bruto não demonstra a matriz nova nem pode, sozinho, ser denominado GREEN. Conservar resultado bruto e separar incompatibilidade/precondição legada de regressão semântica; os controles equivalentes migrados e a matriz independente V2:186–217 são necessários. Não modificar os bytes nem reinterpretar warmup como prova de F2/F3/flood. O histórico23casos/11pass/12fail pertence ao relatório original, não a esta revisão.

120000ms é política local delegada informada pelo usuário, não SLA OKX. Receipt9a716cb3-7bc5-461f-8f76-1ff37ad64d52 foi recebido como fato do usuário; receiptd5654be0-ae0f-45e2-a032-0976b448dc90 é relato do autor V2, não recibo bruto verificado por mim. A verificação delimitada não encontrou docs/JEV-FUNDING-POLICY-DECISION-20261011.md no caminho antes indicado. Isso limita a comprovação documental do aconselhamento, sem tornar ambíguo o contrato explícito V2. Não houve nova pesquisa pública; não atribuo TTL/garantia externa à documentação.

Alternativas reais anteriores têm consequências explícitas: policy wiring obrigatório no composition root incluiria CLI; a V2 usa opção/default único do feed e deixa CLI intacto. Agregação exata substituiria a estratégia de cap, mas V2 exige bloquear perda e mantém5000/120s. Nenhuma alternativa autoriza abandonar unknown, ampliar TTL/cap ou aceitar cobertura parcial.

Não há decisão semântica bloqueante restante identificada. Ainda dependem do ciclo próprio: freeze pelo fluxo autorizado, ownership efetivamente reservado, RED por requisito, autorização de implementação, hashes da composição, GREEN afetado/tipos/safety/projeção, review e audit independentes. Provas internas são de produtor confiável, não atestação criptográfica, completude externa, exactly-once ou verdade física do relógio. Funding consultivo null não qualifica economia/custos, e APPROVE desta SPEC não certifica profit/live/full goal.

## Manifesto reconferido

Entradas físicas SHA256:

| Entrada | SHA256 |
|---|---|
| Locke V2 | 10cee5fe44e7dbde5a988d34822ee99061cb24b39341e2cefe77a4bae2439c97 |
| Meu REVISE anterior | f72813fc994c65ba2650fed6c1fd33ba5ced5f72bc138b3bfed12a48e2b97333 |
| Draft original Locke | fe6b4bb777dd11643226a3cfaf5cbd7f2126e24ac2f6bcd18e0eb79d46413409 |
| Parecer original jev-read-0541475-regression-review-20261011.md | 463a69063c76c32c9543c750b023788d68be7ff9f20113e7bc4ed894b884fae2 |
| reviewer-boundary-probe.ts original | a7a44e9482c1635bb73307e6bcc2a3c599591548442f1a0843953332c326091e |

SHA256 abaixo é dos bytes de blobs Git do commit14cbb7bd, capturados por stdout binário, não CRLF físico/WIP. Os17 hashes coincidem com o manifesto V2.

| Caminho relativo ao commit fixo | SHA256 |
|---|---|
| src/jev-read/feed.ts | 0aae9ebe79414065d6459558314ab217084edace2c5acac483c34f37c88b435e |
| src/jev-read/state.ts | 7eee52fbdd4ad8b3a3b2eea23686a80236f571a21ada3f968149a8461b4bd333 |
| src/jev-read/types.ts | c6966959aa9dd342d4bf83a11c0a7bcf9d95afba1a7d3b6a1ea7f54191e97c4f |
| src/jev-read/loop.ts | c790a335c6bfeddba8a30926137931221ebc27520d74347eff6e2745ff0624fe |
| src/jev-read/read.ts | c14a262dd08b3b60b7a1b0d9a1bf25dcdd9fea9cbcf86b74f86c6dec37febbea |
| src/jev-read/decide.ts | b8823b2dccb3c4c162ba27af530a47c1aca2fd8371e0e10d2e99af70c58c049a |
| src/jev-read/public-view.ts | 8fa5323cb6772f2dacd7ad03dd929a27c8eea6e6ede246b08dbf53326dd62e81 |
| src/jev-read/feed.test.ts | 439afd03d074c7394222a6ef860ca0c1119118c8bc78d98bac3656612b5e3539 |
| src/jev-read/state.test.ts | bd868c76e60e264c25b80b35123b75f6468823f700c1017a5d6415e004f85303 |
| src/jev-read/loop.test.ts | 2feecbf9cc533ae87e78ab6a5ad1e70d6e4a45a6c80614a1b91905c861ecf0c3 |
| src/jev-read/read.test.ts | cd85d2b9e52008e02921d607f850f757e327b4771099b7379b00e5cad6168299 |
| scripts/jev-read.ts | 315e8c1dbbed5f5c277d4a0331506f79bac4bf91ac940f0b8526ffe10e051fe5 |
| src/system-one/clock.ts | 5e20f8e8ab92e7e4a4bdd524f4be8c1fc63eea264feb3dda74136f23db7105f1 |
| src/system-one/clock.test.ts | e6056f2fe025f2c829799a25ed5b911f0f308fcb4cb6e9ad15012dd4d05e9e44 |
| web/src/lib/jev-read.ts | 2f852d4f218cca82c5473641d769e64e93d950984187b9b13e217d1432fb2e84 |
| docs/JEV-DECISAO-ONCHAIN-OS.md | 0e3819b054a0a231bbb74cb445cf5a8eab0339866c1bafa17e5b33eab7ddbbb6 |
| CONTRIBUTING.md | 491e629c515cf69267528de649f19bcb0b3f4425a133d070487d7d4647d402f6 |

[Meu parecer anterior](C:/Users/gabri/.codex/worktrees/inonu-operator-c4-research-20261011/jev-tape-data-f1-f4-independent-spec-review-20261011.md:28); [parecer original](C:/Users/gabri/.codex/worktrees/inonu-system-one-review-spec-20261011/jev-read-0541475-regression-review-20261011.md:15); [probe preservado](C:/Users/gabri/.codex/worktrees/inonu-system-one-review-spec-20261011/committed-jev-2d00d8f-schjw8q8/reviewer-boundary-probe.ts:40).

Única saída nova: C:/Users/gabri/.codex/worktrees/inonu-operator-c4-research-20261011/jev-tape-data-f1-f4-independent-spec-v2-review-20261011.md. Relatórios/originais preservados; SHA256 desta saída entregue separadamente após leitura de confirmação.

