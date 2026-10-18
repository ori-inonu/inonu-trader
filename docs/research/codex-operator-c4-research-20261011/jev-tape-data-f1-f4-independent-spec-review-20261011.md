# Revisão independente da SPEC F1–F4 — 2026-10-11

**Veredito: REVISE antes de congelar.** O draft de Locke cobre os quatro defeitos originais e preserva os controles. A política informada pelo usuário resolve a escolha de 120000ms como limite local; falta incorporá-la como contrato injetável verificável e fechar sua passagem até o builder. Este parecer é revisão semântica de proposta alheia, não autorização de implementação, evidência GREEN ou aprovação do objetivo completo.

## Escopo e identidade

Revisor: CODEX_THREAD_ID observado `01a12adc-473d-7381-b067-c83af7ccda31`, distinto do autor Locke `01a12ada-91d7-7ce0-b6ea-e1556d234224` e do revisor original `01a12ada-7b55-7fd2-8a20-c940f474c1a1`. CODEX_SESSION_ID observado `01a12971-f941-7e42-8a42-fab6d44d4eb5` não foi confundido com identidade da conversa. GPT-6.1 Sol/xhigh solicitado; modelo, esforço e tier efetivos desconhecidos.

Fonte fixa: `C:/Users/gabri/.codex/worktrees/inonu-system-one-safety/jev-trader`, commit `1f08e6edd589449a82eeb70638987a09572a3bd2`, tree conferida `15b1fe6b2ac58c5821b9ab77723610d0afe780aa`. Código foi lido por `git show <commit>:<path>`, sem seguir HEAD/WIP. Linhas abaixo são desse commit. Draft e probe foram lidos como arquivos e conferidos por SHA256. Aplicado codex-desktop-harness proporcionalmente; metadados privados não foram copiados ao relatório/repositório.

Somente este relatório foi escrito, na cópia ordinária exclusiva. Não houve execução de testes/aplicações, chamadas próprias a providers/modelos/Jev, instalação, signers, fundos, leitura de .env/credenciais ou mutação Git. Pareceres automáticos dos hooks são consultivos, não aceites. Isolamento é por disciplina/caminho; não há prova de sandbox OS somente leitura ou bloqueio de egress.

## Contratos examinados e evidência literal

Draft: [jev-tape-data-f1-f4-spec-draft-20261011.md](C:/Users/gabri/.codex/worktrees/inonu-system-one-review-standards-20261011/jev-tape-data-f1-f4-spec-draft-20261011.md:38). SHA256 `fe6b4bb777dd11643226a3cfaf5cbd7f2126e24ac2f6bcd18e0eb79d46413409`, reconferido. L44: “Qualquer avanço, inclusive +1ms e +5.000ms, rejeita”; L51: “Exigir idade da fonte entre zero e o TTL já existente”; L63: “Validar expiração em cada snapshot/construção”; L73: “Se o cap descartar um registro dentro da janela inclusiva de 60s, marcar incompletude”.

A regra central em `docs/JEV-DECISAO-ONCHAIN-OS.md:50` exige: “Cada valor traz instante de observação e origem.” L50/60 também preserva desconhecido e inelegibilidade econômica. O schema consultivo atual aceita funding null (`types.ts:57–58`, `state.ts:135`, `web/src/lib/jev-read.ts:93`); isso não libera um candidato econômico dependente desse dado.

| Critério congelado | Avaliação da proposta, não da implementação |
|---|---|
| F1: futuro +1/+5000 rejeita | Coberto em L44–47/86, com limite 150000ms inclusivo, +150001 rejeitado e relógio desconhecido. Corrigir explicitamente `state.test.ts:179–181`, hoje positivo para futuro. Não alterar tolerância global/clock. |
| F2: receipt não renova fonte velha | Coberto em L51–56/87–88: WS/REST, book/ticker separados, identidade quando reportada, REST book vinculado ao pedido sem identidade remota inventada, falha/out-of-order sem renovar dado anterior. Baseline perde ts em `feed.ts:198/213/364/373`; builder só olha receipt em `state.ts:88/92`. |
| F3: funding errado/velho/ausente desconhecido | Semântica coberta em L60–65/89: swap do par completo, ts distinto do calendário, zero/negativos válidos, fração ×100; **revisar injeção e prova independente de cache**, abaixo. Baseline guarda escalar sem identidade/ts (`feed.ts:240–250`). |
| F4: 6000→5000 não completo; ack não 60s | Coberto em L69–76/90–91: relógio monotônico, geração, reconexão/callback antigo, perda no limite inclusivo, recuperação quando perda sai estritamente da janela, quieto legítimo. Baseline usa apenas tradesLive (`state.ts:101`) e cap silencioso (`feed.ts:379–383`). |

## Revisões necessárias antes de congelar

1. **Incorporar a política delegada com seam e ownership explícitos.** A mensagem autoritativa informa receipt `9a716cb3-7bc5-461f-8f76-1ff37ad64d52`, escolha `local120`, confiança .8, modelo `jev-1.13.0`: limite local injetável, default 120000ms, inteiro positivo seguro, expiração por idade da fonte **e** idade monotônica do cache. Não é SLA OKX, aprovação humana ou permissão. O arquivo indicado `C:/Users/gabri/.codex/worktrees/inonu-system-one-safety/jev-trader/docs/JEV-FUNDING-POLICY-DECISION-20261011.md` não existia nas verificações delimitadas; seu SHA e recibo bruto não foram verificados. Draft L62 não especifica injeção/validação. `OkxTapeFeedOptions:32–41` não tem esse seam; `scripts/jev-read.ts:85` instancia só instIds. Antes do freeze, definir um único default e comportamento de configuração inválida, sem fallback que alongue validade. Alternativas reais: opção injetável com default único dentro do módulo, mantendo CLI intacto; ou política exigida e montada explicitamente no composition root, incluindo ligação mínima na CLI. A segunda requer ajustar a exclusão absoluta de CLI em L104; nenhuma precisa nova flag ou mudança de cadência.

2. **Fechar o contrato interno snapshot → builder.** L40 e L106 dão direção correta, mas a representação de cobertura permanece proposta (L110/137). Definir os campos obrigatórios e quem valida: identidade solicitada/reportada, origem enumerada, sourceTsMs, receipt, idade monotônica/ponto de captura e geração/cobertura/perda; funding ausente permanece null. `TapeInput:34–58` hoje permite escalar e tradesLive sem prova. Um valor de funding sem metadata não pode contornar o gate por chamada direta a `buildTapeState`; ausência de cobertura não pode virar completa por default. Escolher registro de proveniência validado pelo builder ou representação normalizada com prova temporal suficiente validada no mesmo limite; não só booleano “fresh/complete” sem base. Snapshot deve manter dados e proveniência correspondentes, sem renovar uma captura anterior. Separar timestamp Unix inteiro seguro de tempo monotônico finito, que pode ser fracionário: `correctedClock:101–105` usa performance.now; não arredondar futuro para fazê-lo passar.

3. **Tornar os controles contra mascaramento asserts obrigatórios.** O draft L82/94 identifica a armadilha correta. No [probe original](C:/Users/gabri/.codex/worktrees/inonu-system-one-review-spec-20261011/committed-jev-2d00d8f-schjw8q8/reviewer-boundary-probe.ts:38), L40 converte qualquer builder bloqueado em funding null; L53 aceita qualquer bloqueio no caso 6000. Novos casos F3 devem exigir `built.ok=true`, funding null e demais gates válidos; positivos conhecido/zero/negativo precisam estado válido e chamada local permitida. No flood, exigir especificamente trades_unavailable após cobertura válida; renovar book/ticker/candles ao avançar 60s para não passar por seu envelhecimento. Preservar os bytes do probe original.

## Aceitação independente a conservar/ampliar explicitamente

- F1/F2/F4 negativos: reason esperado, state null, decision null, contador model.decide = 0; controles equivalentes válidos = uma chamada falsa e outputs advisory true/execution never/schema 1. Separar book de ticker e WS de REST. Reter F1 forming candle, 31 barras, skew ±180s e clock desconhecido.
- Política funding: TTL 120000 inclusivo e 120001 expira; cada idade falha separadamente enquanto a outra passa; sem novo refresh, wall avançando/recuando, source futuro/ausente e metadata errada permanecem unknown. Mesma fonte recebida novamente não rejuvenece sourceTs. Cobrir injeção diferente válida e inválidos 0/negativo/fracionário/NaN/Infinity/unsafe integer conforme conduta fechada na SPEC. 0.004 fresco → 0.4%; calendário original não causa falso desconhecido.
- Cobertura F4: 59999/60000ms, ack duplicado/outro instrumento/pong, geração antiga, reconnect/restart, relógio wall sem fabricar duração; perda a 60000 ainda bloqueia e estritamente fora deixa de bloquear sem nova mensagem. Exatos 5000 sem perda passam; 500 registros 300buy/200sell mantêm .2/CVD100; 6000 com cap5000 nunca são completos. Isso prova observação local, não exactly-once nem ausência de perda externa.
- `readRound:102–105` captura após awaits, mas calcula ages antes deles. Exigir reavaliação final com relógios atuais: refresh demorado não libera funding/book/ticker expirados. Não alongar TTL para fazer composição passar.

## Consumidores, migração e concorrência

F1–F4: ownership proposto de `feed.ts/state.ts/types.ts`, ligação mínima `loop.ts` e seus testes; novo teste público offline exclusivo só após atribuição. Se necessário policy wiring na CLI, atribuí-lo expressamente. Não editar `read.ts/decide.ts/read.test.ts` de F5/F6 nem usar sua revisão para aceitar F1–F4.

Fixtures `state.test.ts:11–27`, `loop.test.ts:68–89`, `read.test.ts:13–24/95–109` precisam metadata/cobertura válidas sem remover seus asserts originais; `read.test.ts` exige migração pelo proprietário/integrador. `feed.test.ts:246–293` usa funding sem metadata e book ts1: enriquecer controles positivos, acrescentar negativos separados. Public-view tem reasons fechadas (`public-view.ts:9/91–97`); manter reasons/schema numérico e funding null dispensa nova UI para este contrato. Modelo recebe cópia numérica (`read.ts:59–60`), não JSON/texto livre do provider. Integração F5/F6 exigirá hashes então atuais, verificação e revisão próprias.

## Manifesto exato e limites

SHA256 abaixo é dos **bytes do blob Git fixo** capturados por stdout binário, não hash físico CRLF do checkout concorrente. Os hashes LF declarados no draft para os arquivos comuns coincidem. Nenhum hash deste quadro afirma que WIP foi revisado.

| Caminho relativo à fonte fixa | SHA256 |
|---|---|
| src/jev-read/feed.ts | 0aae9ebe79414065d6459558314ab217084edace2c5acac483c34f37c88b435e |
| src/jev-read/state.ts | 7eee52fbdd4ad8b3a3b2eea23686a80236f571a21ada3f968149a8461b4bd333 |
| src/jev-read/types.ts | c6966959aa9dd342d4bf83a11c0a7bcf9d95afba1a7d3b6a1ea7f54191e97c4f |
| src/jev-read/loop.ts | c790a335c6bfeddba8a30926137931221ebc27520d74347eff6e2745ff0624fe |
| src/jev-read/read.ts | 100651d19f065279331b897b0134c715d23e4e07953677ba0ff3fc1180623629 |
| src/jev-read/decide.ts | 8ae4caeaec7955e811245c7af9e830ffea63c01e7c3ec59ced693c041d9b8cf0 |
| src/jev-read/public-view.ts | 8fa5323cb6772f2dacd7ad03dd929a27c8eea6e6ede246b08dbf53326dd62e81 |
| src/jev-read/feed.test.ts | 439afd03d074c7394222a6ef860ca0c1119118c8bc78d98bac3656612b5e3539 |
| src/jev-read/state.test.ts | bd868c76e60e264c25b80b35123b75f6468823f700c1017a5d6415e004f85303 |
| src/jev-read/loop.test.ts | 2feecbf9cc533ae87e78ab6a5ad1e70d6e4a45a6c80614a1b91905c861ecf0c3 |
| src/jev-read/read.test.ts | 1e8122cd66fb3eb2b6cd59d9c36c8bc12fa396936ec40025520bca9059b19e32 |
| scripts/jev-read.ts | 315e8c1dbbed5f5c277d4a0331506f79bac4bf91ac940f0b8526ffe10e051fe5 |
| src/system-one/clock.ts | 5e20f8e8ab92e7e4a4bdd524f4be8c1fc63eea264feb3dda74136f23db7105f1 |
| web/src/lib/jev-read.ts | 2f852d4f218cca82c5473641d769e64e93d950984187b9b13e217d1432fb2e84 |
| docs/JEV-DECISAO-ONCHAIN-OS.md | 0e3819b054a0a231bbb74cb445cf5a8eab0339866c1bafa17e5b33eab7ddbbb6 |
| CONTRIBUTING.md | 491e629c515cf69267528de649f19bcb0b3f4425a133d070487d7d4647d402f6 |

Parecer original `C:/Users/gabri/.codex/worktrees/inonu-system-one-review-spec-20261011/jev-read-0541475-regression-review-20261011.md`: `463a69063c76c32c9543c750b023788d68be7ff9f20113e7bc4ed894b884fae2`. Probe original: `a7a44e9482c1635bb73307e6bcc2a3c599591548442f1a0843953332c326091e`. Seus 23 casos/11pass/12fail são resultado histórico, não execução nesta revisão. Draft/probe/parecer foram reconferidos sem alteração.

Documentação pública citada pelo draft: [referência OKX](https://app.okx.com/docs-v5/en/), [changelog](https://www.okx.com/docs-v5/log_en/), [market-data guide](https://www.okx.com/docs-v5/trick_en/). Não houve nova consulta pública nesta revisão; a política 120s não depende de alegar SLA nessas páginas. Cadência baseline `scripts/jev-read.ts:156` é refresh local, não validade oficial nem garantia de resposta. Limitações permanecem: resposta real/provider coverage, relógio físico, integração concorrente e comportamento executado não qualificados. Não há certificação de profit, readiness econômica ou conclusão do objetivo central.

Saída única: `C:/Users/gabri/.codex/worktrees/inonu-operator-c4-research-20261011/jev-tape-data-f1-f4-independent-spec-review-20261011.md`. Relatórios anteriores preservados; nenhuma SPEC foi congelada ou implementada. Próximo passo elegível é revisar o draft e fixar o contrato/ownership acima pelo fluxo autorizado, mantendo F1–F4 e M1–M6 intactos.

