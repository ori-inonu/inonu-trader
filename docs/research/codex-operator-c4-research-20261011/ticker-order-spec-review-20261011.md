# Revisão independente parcial SPEC — ticker e ordenação

**PASS parcial, somente no snapshot fixo abaixo.** Nenhuma divergência reproduzida neste recorte; não constitui aceitação F1–F4, autorização de merge ou conclusão do objetivo. Não houve implementação do revisor.

| Critério imutável / evidência literal | Resultado e código examinado |
|---|---|
| SPEC L104: “Receipts não mudam ao copiar snapshot ou reavaliar estado.” L106 exige identidade REST e valida identidade WS declarada. | PASS: [snapshot](C:/Users/gabri/.codex/worktrees/inonu-operator-c4-research-20261011/ticker-order-spec-review-20261011-18f2e15adb10/src/jev-read/feed.ts:227), produtor REST L267–288 e WS L493–502; [builder](C:/Users/gabri/.codex/worktrees/inonu-operator-c4-research-20261011/ticker-order-spec-review-20261011-18f2e15adb10/src/jev-read/state.ts:52) valida identidade, enumeração, epoch/generation, domínios e TTL fonte/cache separadamente. |
| SPEC L152: “Resposta duplicada de mesmo ts/conteúdo não renova os tempos da captura armazenada; mesmo ts com conteúdo conflitante é inválido.” | PASS: [acceptTicker](C:/Users/gabri/.codex/worktrees/inonu-operator-c4-research-20261011/ticker-order-spec-review-20261011-18f2e15adb10/src/jev-read/feed.ts:508) preserva prova duplicada; conflito nos quatro valores invalida; replay igual/mais velho não recupera; fonte estritamente maior recupera. |
| SPEC L97 define captura por pedido REST/mensagem WS; L152: “Resposta mais antiga não substitui dado mais novo.” | PASS: captura pré-await L246/L271; [watermarks](C:/Users/gabri/.codex/worktrees/inonu-operator-c4-research-20261011/ticker-order-spec-review-20261011-18f2e15adb10/src/jev-read/feed.ts:509) e L525 avançam antes da comparação de fonte, permanecendo após conflito/duplicata/fonte antiga. Respostas atrasadas em fetch ou JSON não sobrescrevem captura posterior REST/WS, mesmo trazendo sourceTs maior. |

**Execução independente:** 135 pass, 0 fail, 2.537 expectativas, cinco arquivos; seis [probes próprios](C:/Users/gabri/.codex/worktrees/inonu-operator-c4-research-20261011/ticker-order-spec-review-20261011-18f2e15adb10/ticker-order-independent.test.ts:84). Incluem limites 0/15.000/15.001 ms independentes, domínios/identidades inválidos, snapshot sem alias, expiração sem renovação, conflitos, recuperação e 38 combinações de ordenação/captura. Negativos verificam razão específica, state/decision nulos e zero chamadas do modelo; positivos exigem uma chamada falsa válida, schema1/advisory=true/execution=never, sem fallback de modelo falho. Demais gates atuais são controlados.

**Limites:** transportes/modelo falsos; não qualifica OKX/live. Cópia ordinária, sem isolamento OS somente leitura; guards interceptados registraram fetch/socket/inference/provider=0, sem provar bloqueio universal de egress. Typecheck/REDs do integrador não foram repetidos. ages, candle/trade proof, F4 e composição/final-clock continuam pendentes; ack/trades da fixture não provam cobertura F4. Sem fontes compartilhadas, Git, harness global, contas, credenciais ou relatórios anteriores alterados. Modelo/effort/tier efetivos desconhecidos; Sol/xhigh apenas solicitado. Advice não é permissão.

## Metadados e proveniência

- Baseline contratual: `14cbb7bd2878eed0a930b324b0c50610be7cdab8`; não seguir HEAD móvel.
- Origem exata dos sete arquivos: `C:/Users/gabri/.codex/tmp/inonu-ticker-order-01a12971-20261011/src/jev-read`. Não é alegação de commit do candidato.
- Cópia exclusiva: `C:/Users/gabri/.codex/worktrees/inonu-operator-c4-research-20261011/ticker-order-spec-review-20261011-18f2e15adb10`. Hashes da origem antes/depois da cópia e novamente após execução coincidem; hashes da cópia antes/depois dos testes coincidem.
- [SPEC congelada copiada](C:/Users/gabri/.codex/worktrees/inonu-operator-c4-research-20261011/ticker-order-spec-review-20261011-18f2e15adb10/docs/JEV-TAPE-DATA-F1-F4-SPEC-V2-20261011.md:97): SHA256 `10cee5fe44e7dbde5a988d34822ee99061cb24b39341e2cefe77a4bae2439c97`. Requisitos e freeze não redefinidos.
- Revisor desta conversa, distinto do integrador/autor da SPEC. Identidade nativa previamente observada: thread `01a12adc-473d-7381-b067-c83af7ccda31`, session `01a12971-f941-7e42-8a42-fab6d44d4eb5`; identidade não comprova modelo/tier.
- Skills lidas: [codex-desktop-harness](C:/Users/gabri/.codex/skills/codex-desktop-harness/SKILL.md), [code-review](C:/Users/gabri/.agents/skills/code-review/SKILL.md); AGENTS fornecido e CONTRIBUTING copiado. Nenhum estado privado do harness copiado.
- Evidência do integrador, somente atribuída: RED d43cd1 → GREEN805c57; RED2d33b7 → GREEN2c1628; affected2b0ef4 129/0/1259; typee48f9f0. Não atestados novamente.

### SHA256 dos sete arquivos

| Arquivo na cópia | SHA256 |
|---|---|
| [feed.ts](C:/Users/gabri/.codex/worktrees/inonu-operator-c4-research-20261011/ticker-order-spec-review-20261011-18f2e15adb10/src/jev-read/feed.ts) | `533f7b580705ece1279c5f4cd30f76df17d735a7eaafb75738fd4630dd4810d5` |
| [feed.test.ts](C:/Users/gabri/.codex/worktrees/inonu-operator-c4-research-20261011/ticker-order-spec-review-20261011-18f2e15adb10/src/jev-read/feed.test.ts) | `d08d34e2713359c0ebc61ac643ce97d71d68314e93fc2f8887fe286ab1cda07a` |
| [state.ts](C:/Users/gabri/.codex/worktrees/inonu-operator-c4-research-20261011/ticker-order-spec-review-20261011-18f2e15adb10/src/jev-read/state.ts) | `623db0f37be0a3d5a8243e933eb1e1ba0c250f92ce64950a4b5c56f24390fbc0` |
| [state.test.ts](C:/Users/gabri/.codex/worktrees/inonu-operator-c4-research-20261011/ticker-order-spec-review-20261011-18f2e15adb10/src/jev-read/state.test.ts) | `9cb713aa5d2ee373dbe352c6e34e78482971c3870e4cad8881adf7b55e56c38e` |
| [types.ts](C:/Users/gabri/.codex/worktrees/inonu-operator-c4-research-20261011/ticker-order-spec-review-20261011-18f2e15adb10/src/jev-read/types.ts) | `43a97a6995cdb57a6c8f20b6f565f80405a59dd8bd8b2b6984b382d86510c482` |
| [read.test.ts](C:/Users/gabri/.codex/worktrees/inonu-operator-c4-research-20261011/ticker-order-spec-review-20261011-18f2e15adb10/src/jev-read/read.test.ts) | `a2140c01214923f66a0d4465c973b67dde968699c29353cccf15f70bbf9952a0` |
| [loop.test.ts](C:/Users/gabri/.codex/worktrees/inonu-operator-c4-research-20261011/ticker-order-spec-review-20261011-18f2e15adb10/src/jev-read/loop.test.ts) | `bcf11a4150f0852568fcdccf4c69c130f7eeb72a75f0cc5e7d86ecf719c83483` |

### Preservação de consumidores

[read.ts](C:/Users/gabri/.codex/worktrees/inonu-operator-c4-research-20261011/ticker-order-spec-review-20261011-18f2e15adb10/src/jev-read/read.ts:29) SHA256 `0422288919d60e969f76b21acee97802cda8ab9028fb73044c9817233b247b52`; [decide.ts](C:/Users/gabri/.codex/worktrees/inonu-operator-c4-research-20261011/ticker-order-spec-review-20261011-18f2e15adb10/src/jev-read/decide.ts:30) SHA256 `e46315754bafad687e25d39dc511fb6cba4e74af79bebe527e4605db1283358c`.

Comparação independente atual contra blobs do baseline preservados em [evidência anterior](C:/Users/gabri/.codex/worktrees/inonu-operator-c4-research-20261011/book-proof-spec-review-20261011-370fdfda88a3/baseline-evidence/metrics.json): conteúdo igual após normalização CRLF→LF; igualdade byte a byte não alegada. Blobs read.ts `c14a262dd08b3b60b7a1b0d9a1bf25dcdd9fea9cbcf86b74f86c6dec37febbea`, decide.ts `b8823b2dccb3c4c162ba27af530a47c1aca2fd8371e0e10d2e99af70c58c049a`. Não foi executado Git nesta comparação.

### Reprodução e evidência bruta

Runtime observado: Bun 1.3.14 (0d9b296a); Node v26.9.0. No diretório exclusivo:

```text
"C:/Program Files/nodejs/node.exe" run-offline.mjs ./src/jev-read/feed.test.ts ./src/jev-read/state.test.ts ./src/jev-read/read.test.ts ./src/jev-read/loop.test.ts ./ticker-order-independent.test.ts
```

O runner lança `C:/Users/gabri/.bun/bin/bun.exe` com:

```text
--no-env-file --no-install test --preload ./offline-preload.ts --timeout 15000 ./src/jev-read/feed.test.ts ./src/jev-read/state.test.ts ./src/jev-read/read.test.ts ./src/jev-read/loop.test.ts ./ticker-order-independent.test.ts
```

Ambiente do Bun substituído pela allowlist SystemRoot/WINDIR/PATH/TEMP/TMP/BUN_NO_INSTALL; TEMP/TMP próprios. Sem leitura de .env. Guards mockam somente módulos externos de inferência; feed/build/read e validador local permanecem reais. Limpeza dos temporários verificou destino real dentro de own-temp; nenhuma limpeza de outros checkouts.

Bun exit0 em 514 ms; runner status0, signal/error=null, 589 ms; unchanged=true. RTK adapter timeout45/profile=test entregou saída por passthrough `command_not_allowlisted`, archive_id=null; logs completos abaixo preservados. Não houve suíte ampla.

| Artefato exclusivo | SHA256 |
|---|---|
| [ticker-order-independent.test.ts](C:/Users/gabri/.codex/worktrees/inonu-operator-c4-research-20261011/ticker-order-spec-review-20261011-18f2e15adb10/ticker-order-independent.test.ts) | `cb5f6688f1182848ba69d4ea0ec955aec2ff81938b394a172dd65d9d662084e0` |
| [run-offline.mjs](C:/Users/gabri/.codex/worktrees/inonu-operator-c4-research-20261011/ticker-order-spec-review-20261011-18f2e15adb10/run-offline.mjs) | `9019f04444f4a9ec9decbf21b3b122128c360cd62c1fe0ff2f21b579304eb235` |
| [offline-preload.ts](C:/Users/gabri/.codex/worktrees/inonu-operator-c4-research-20261011/ticker-order-spec-review-20261011-18f2e15adb10/offline-preload.ts) | `a54687f3df02fe4cfd3b03f2810ee77106466a3a820cb62aec6e771547f4efe3` |
| [offline-tests.stdout.log](C:/Users/gabri/.codex/worktrees/inonu-operator-c4-research-20261011/ticker-order-spec-review-20261011-18f2e15adb10/offline-tests.stdout.log) | `89e178013e92670c29781abb1240c7ea994a9123891c087ad775330982de8906` |
| [offline-tests.stderr.log](C:/Users/gabri/.codex/worktrees/inonu-operator-c4-research-20261011/ticker-order-spec-review-20261011-18f2e15adb10/offline-tests.stderr.log) | `13c2c5d3dbc5824a884a871f0a99c80fc84506e24d13cde21d2ccc8d6217e244` |
| [offline-tests.metrics.json](C:/Users/gabri/.codex/worktrees/inonu-operator-c4-research-20261011/ticker-order-spec-review-20261011-18f2e15adb10/offline-tests.metrics.json) | `33f890b1bfe453c5af6094b81bffc73434158eec6fb2375c949f30266bda85ab` |
| [copy-manifest.json](C:/Users/gabri/.codex/worktrees/inonu-operator-c4-research-20261011/ticker-order-spec-review-20261011-18f2e15adb10/copy-manifest.json) | `6a78a0a2666106e49aa66d9f8531907c0bae7c8b487dc25794ee5aa7ca066550` |
| [support-manifest.json](C:/Users/gabri/.codex/worktrees/inonu-operator-c4-research-20261011/ticker-order-spec-review-20261011-18f2e15adb10/support-manifest.json) | `f988b8679f72fd864273014c8b1a863f1b8e8e886bb81b297316e13a3326c93e` |

### Preservação dos relatórios anteriores

Hashes atuais iguais aos já registrados: book `635bb266c59cd333a1efbdf4b705c52fdeedd4ae6ce4dd27b68d14e21df93e08`; lifecycle `d1169aaa3140396af2c35a75b88069c1b584dd793778b6a6776ab5de25f7b403`; identity `fe140936fa139075fcd52aeaa23ef1dc518a7d19fdbe311a0b18585a61a81f1f`; partial F1/F3 `d9e08600178487882960deb4a1d95037a028100b382be87baab9f88b0d3c3385`. Probe original não executado nem editado.

