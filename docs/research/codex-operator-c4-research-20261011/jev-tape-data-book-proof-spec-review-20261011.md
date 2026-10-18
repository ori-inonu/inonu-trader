# Revisão independente parcial — book proof

**PASS parcial, somente dos sete hashes abaixo.** Nenhum bloqueador reproduzido nesta fatia; não aceita F1–F4 completos, main, merge ou conclusão do goal.

A SPEC exige “Não montar valores de um response com proof de outro, renovar receipt na cópia” ([108](C:/Users/gabri/.codex/worktrees/inonu-operator-c4-research-20261011/book-proof-spec-review-20261011-370fdfda88a3/docs/JEV-TAPE-DATA-F1-F4-SPEC-V2-20261011.md:108)) e “Resposta duplicada de mesmo ts/conteúdo não renova os tempos da captura armazenada” ([152](C:/Users/gabri/.codex/worktrees/inonu-operator-c4-research-20261011/book-proof-spec-review-20261011-370fdfda88a3/docs/JEV-TAPE-DATA-F1-F4-SPEC-V2-20261011.md:152)). Critérios mantidos, sem nova SPEC ou autorização.

| Critério desta fatia | Parecer e evidência |
|---|---|
| Captura REST/WS e cópia profunda | PASS: contexto, fonte e receipts históricos; bids, asks e proof independentes no snapshot. [feed:215](C:/Users/gabri/.codex/worktrees/inonu-operator-c4-research-20261011/book-proof-spec-review-20261011-370fdfda88a3/src/jev-read/feed.ts:215), [233](C:/Users/gabri/.codex/worktrees/inonu-operator-c4-research-20261011/book-proof-spec-review-20261011-370fdfda88a3/src/jev-read/feed.ts:233), [464](C:/Users/gabri/.codex/worktrees/inonu-operator-c4-research-20261011/book-proof-spec-review-20261011-370fdfda88a3/src/jev-read/feed.ts:464). Mutação de ambas as pontas e do response não altera cache. |
| Builder direto, identidade/domain/generation/TTL | PASS: [state:33](C:/Users/gabri/.codex/worktrees/inonu-operator-c4-research-20261011/book-proof-spec-review-20261011-370fdfda88a3/src/jev-read/state.ts:33). Fonte/cache separados: 0/5000 passam; 5001, futuro e domínio inválido bloqueiam. Clock desconhecido conserva clock_unknown. Negativos têm reason específico, state/decision null e zero modelo; positivos uma chamada falsa, schema1/advisory/never. |
| Ordenação por fonte e conflito | PASS: [feed:488](C:/Users/gabri/.codex/worktrees/inonu-operator-c4-research-20261011/book-proof-spec-review-20261011-370fdfda88a3/src/jev-read/feed.ts:488). REST↔WS velho/duplicado preserva captura; conflito limpa book, replay permanece book_missing; fonte estritamente nova recupera. Falha/malformação não renova prova expirada. |
| Fixtures e preservação do leitor | PASS: read/loop só migram metadata/funding fixtures; asserts abort/deadline/normalização/imutabilidade preservados, conforme [SPEC:229](C:/Users/gabri/.codex/worktrees/inonu-operator-c4-research-20261011/book-proof-spec-review-20261011-370fdfda88a3/docs/JEV-TAPE-DATA-F1-F4-SPEC-V2-20261011.md:229). read.ts/decide.ts iguais ao baseline após normalizar CRLF/LF. |

Execução independente: **129 pass/0 fail/1488 expects**, depois matriz WS suplementar **1 pass/0 fail/70 expects**. Seis probes novos usam feed.snapshot → buildTapeState → runJevRead; nenhum método privado. Logs íntegros e métricas abaixo. Typecheck0/124 pass do integrador são evidência atribuída; não executei typecheck/full suite.

Permanecem incompletos: request ordering, validação da identidade REST book quando declarada, ages, provas ticker/candle/trade, F4 e composição/final clocks. Os resultados não qualificam produção/feed live, fonte autenticada ou rentabilidade.

A origem avançou concorrentemente nos sete arquivos; não segui esse estado. Cópia fixada permaneceu byte a byte igual antes/depois dos testes. Relatórios anteriores preservados.

## Metadados e hashes verificáveis

Revisor independente SPEC-axis desta conversa, distinto do integrador; thread observado `01a12adc-473d-7381-b067-c83af7ccda31`, sessão `01a12971-f941-7e42-8a42-fab6d44d4eb5`. Solicitado GPT-6.1 Sol/xhigh; **modelo/effort/tier efetivos desconhecidos**. Skills codex-desktop-harness/code-review aplicadas proporcionalmente; nenhuma escrita no harness, Git ou origem. Advice não é autorização.

Origem: `C:/Users/gabri/.codex/worktrees/inonu-jev-tape-data-f1-f4/jev-trader`.
Baseline fixo: `14cbb7bd2878eed0a930b324b0c50610be7cdab8`.
Cópia exclusiva: `C:/Users/gabri/.codex/worktrees/inonu-operator-c4-research-20261011/book-proof-spec-review-20261011-370fdfda88a3`.

| Arquivo relativo | SHA256 fixado, conferido origem antes/cópia/origem após copiar e cópia após testes |
|---|---|
| src/jev-read/feed.ts | 1402c6f902d129006e5f4f81decd12c1ad6d56e2d45eab7bbf53e8ec44ab7b6b |
| src/jev-read/feed.test.ts | 797c9a491d55800403b789baaf3f3e3b71eb3c3d3d7b18691a1ea3883e982fc9 |
| src/jev-read/state.ts | 381e0916bb28a850565143d3d0911ad3fefac9371ec9b71925a569ebd4473039 |
| src/jev-read/state.test.ts | 714280b4ac7d27cd7785c093bd0ce4fdb98199fe7ca581e33f95d9bb23d5eea7 |
| src/jev-read/types.ts | 2263fbed262a8c2b52d039be3ac261c379653ad89f7fb339c7e03cb2100da9e4 |
| src/jev-read/read.test.ts | 14e8fb4ba04380ab566481601d2d44b5e1fc7bb19807bd308e391cd87723c4d8 |
| src/jev-read/loop.test.ts | fc34786c84c41ed5d45637da74c5162a9cd34acb8fd38b8cb23f29be0ec3cc19 |
| docs/JEV-TAPE-DATA-F1-F4-SPEC-V2-20261011.md | 10cee5fe44e7dbde5a988d34822ee99061cb24b39341e2cefe77a4bae2439c97 |

[copy-manifest.json](C:/Users/gabri/.codex/worktrees/inonu-operator-c4-research-20261011/book-proof-spec-review-20261011-370fdfda88a3/copy-manifest.json) SHA256 `f5672ed83484c93d2f5c111d83bc150f2dfd9a72b4904f99f06d168d16a36282`.
[support-manifest.json](C:/Users/gabri/.codex/worktrees/inonu-operator-c4-research-20261011/book-proof-spec-review-20261011-370fdfda88a3/support-manifest.json) SHA256 `87a95550e0bf9702dd63eb9a8d3e66efb169096275b17088b3256e102e526b3a`.
[baseline-evidence/metrics.json](C:/Users/gabri/.codex/worktrees/inonu-operator-c4-research-20261011/book-proof-spec-review-20261011-370fdfda88a3/baseline-evidence/metrics.json) contém hashes Git blob versus bytes CRLF; SHA256 `a59f481a3a0a4f5795de8bbd2f94c05f6d5b479035c3dc9727a9aa6e47853c45`.
[final-pin-audit.json](C:/Users/gabri/.codex/worktrees/inonu-operator-c4-research-20261011/book-proof-spec-review-20261011-370fdfda88a3/final-pin-audit.json) registra hashes concorrentes não revisados e preservação dos três relatórios anteriores; SHA256 `22159e357a503a2c253030a70ed4a18630a4685dcf069b61096b59c73dcafd37`.

## Execução reproduzível e limites de isolamento

Bun `1.3.14 (0d9b296a)`, Node `v26.9.0`. Na cópia:

```powershell
& 'C:/Program Files/nodejs/node.exe' ./run-offline.mjs ./src/jev-read/feed.test.ts ./src/jev-read/state.test.ts ./src/jev-read/read.test.ts ./src/jev-read/loop.test.ts ./book-independent.test.ts
& 'C:/Program Files/nodejs/node.exe' ./run-ws-offline.mjs ./ws-admission-independent.test.ts
```

Cada wrapper inicia Bun com `--no-env-file --no-install test --preload ./offline-preload.ts --timeout 15000`, timeout externo 30000ms, ambiente allowlisted exclusivamente SystemRoot/WINDIR/PATH/TEMP/TMP/BUN_NO_INSTALL. Saídas exit0; duração externa 426ms e 185ms, sem inferir desempenho. TEMP/TMP próprios; guard valida caminho absoluto/real dentro deles antes de limpeza recursiva dos testes. Não removi origem nem relatórios.

Cópia comum, sem proteção OS readonly nem sandbox de rede comprovado. Guards de fetch/WebSocket e mocks apenas dos imports externos ai/typesafe-ai abortam chamadas reais; contadores fetch/socket/inference/provider **todos zero** nas duas execuções. Builder/leitor/validador locais reais; modelos e transportes falsos. Preload de timeout do projeto preservado; stacks podem incluir duas linhas adicionadas pelo loader, referências acima são linhas dos bytes copiados. Nenhum .env/credencial/provider real, app, assinatura ou fundo utilizado.

Primeira extração de baseline falhou ENOENT (-4058) por caminho presumido de git.exe; nenhum Git foi executado nessa tentativa. Corrigido somente o wrapper próprio usando Get-Command git, e comparação read-only por git show/diff --no-index concluiu. Erro registrado em [path-resolution-error.json](C:/Users/gabri/.codex/worktrees/inonu-operator-c4-research-20261011/book-proof-spec-review-20261011-370fdfda88a3/baseline-evidence/path-resolution-error.json); não é falha do candidato.

| Evidência própria | SHA256 |
|---|---|
| book-independent.test.ts | eedd56627c11b98f57002b82d72b3a65ee0be4dda24293f349a5cd1ed3bb620c |
| ws-admission-independent.test.ts | 0add52f16419d3d7aded0dc65ad5b9c53d7b4731ef82ce351b7a169a7e599648 |
| offline-preload.ts | a54687f3df02fe4cfd3b03f2810ee77106466a3a820cb62aec6e771547f4efe3 |
| offline-tests.stdout.log | 3ba8f38d289286fa8278b84e94b7aa73d4aad29a9f33b2c22564e3ca17691cba |
| offline-tests.stderr.log | e7c6678d86bf2fb670c124ad8978445ae7b3ed179019a3c19813b5f9093caf5e |
| offline-tests.metrics.json | 882d18e8c926de7b03511c13a79f96f4ce3f6f7d2225952a887b506ed99b90ad |
| ws-tests.stdout.log | 2a0f182751b81272a1d5a224add563413192549e08857b249358734658da2710 |
| ws-tests.stderr.log | 5f4288893dad834d740adc3ac8704126caca461b683892eae1fafb4948dce49f |
| ws-tests.metrics.json | 1a96c437d3c1b8ebf1bf2add551434bd743c41ef8335fefb959817bba01d42ad |

Índice completo de scripts/logs/diffs: [evidence-sha256.json](C:/Users/gabri/.codex/worktrees/inonu-operator-c4-research-20261011/book-proof-spec-review-20261011-370fdfda88a3/evidence-sha256.json), SHA256 `3e589f013b91ab2f9f1e8e13dd811446a630403c188aa2b5d9bc5ab7c60e5862`. Probes independentes são fixtures de revisão, não implementação proposta nem evidência live.

