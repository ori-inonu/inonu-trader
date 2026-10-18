# Revisão independente SPEC — lifecycle parcial

**PASS somente para lifecycle nos bytes fixos abaixo.** Nenhuma lacuna de correção encontrada nessa fatia; isto não aceita F1–F4 completos nem autoriza merge.

Revisor distinto do integrador; conversa `01a12adc-473d-7381-b067-c83af7ccda31`. Sol/xhigh solicitado; modelo, esforço e tier efetivos desconhecidos. Isolamento por cópia comum, sem garantia OS readonly.

Baseline: `14cbb7bd2878eed0a930b324b0c50610be7cdab8`.
SHA256 revisados:

| Arquivo | Hash |
|---|---|
| src/jev-read/feed.ts | `63940f13756cfdfae83e3ed4efd2c61a644d6f4ae4795d21b75160e730850ff0` |
| src/jev-read/feed.test.ts | `2f2ffe3c8840a9cb26b4a98ac6629fcb6fe53e2e279f22013329cdc1682f9935` |
| docs/JEV-TAPE-DATA-F1-F4-SPEC-V2-20261011.md | `10cee5fe44e7dbde5a988d34822ee99061cb24b39341e2cefe77a4bae2439c97` |
| docs/JEV-TAPE-DATA-EPOCH-CHECKPOINT-20261011.md | `3a99684ea407fce002fde7ef88b28a403c661445de4cfb410bda8022738f9f89` |

SPEC:83,102,138,186–202 exige invalidar sessões/callbacks antigos e controles positivos. `feed.ts:134–167` limpa caches em start/stop; `228–262` descarta sucessos/erros REST de outra época; `351–383` exige socket e época atuais para todos os handlers; `394–400` acrescenta identidade do timer: `this.reconnectTimer !== timer`. REST legítimo permanece aplicável durante reconnect na mesma época.

Execução independente em `lifecycle-spec-review-20261011-270c41827a14`, Bun 1.3.14 / Node v26.9.0:

```text
bun --no-env-file --no-install test --parallel=1 --timeout 15000 --preload ./offline-guard.ts ./src/jev-read/feed.test.ts ./src/jev-read/lifecycle-review.test.ts
```

Wrapper `run-isolated.cjs`: ambiente allowlisted, timeout externo 30s. Candidato: exit0, **76 pass / 0 fail / 347 expects**, 125ms. Probe idêntico no baseline: exit1, **4 pass / 22 fail**, 77ms. Os 26 probes próprios cobrem pending fetch/json, rejeições tardias, stop/start, reconnect na mesma época, recycle, mensagens/open/error/close antigos e timers antigos diante de novo timer pendente, com captura válida e controles atuais. Guards: zero fetch/WebSocket reais em ambas execuções. Nenhuma suíte completa/typecheck executada; resultados históricos do checkpoint não são nossa execução.

Hashes conferidos antes/depois da cópia e dos testes. A origem avançou concorrentemente para feed `22ba9fa95954a8711d3749d9ddc41595ed516fc0e8bb1c0c8d19d27fcae5a6ad` / testes `8ff11acedcc715caa3ad7cadda452d5532d3dcb61de35ab2764b2ca6a10efc5b`; esses novos bytes não integram este parecer. Cópias, relatório anterior e probe original preservados.

Manifesto, comandos exatos, fixtures e logs brutos: [evidence-manifest.json](./lifecycle-spec-review-20261011-270c41827a14/evidence-manifest.json), SHA256 `8ac0c528b1444ccbda54650a1ffdf3d6f69199a83820146aafb0572266990e4e`.

ValueProof/TTL, cobertura F4, demais provenance e composição continuam incompletos; nenhuma qualificação live ou conclusão do objetivo amplo.
