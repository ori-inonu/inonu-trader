# Revisão independente SPEC — identidade parcial

**PASS exclusivamente para os três guards de identidade nos hashes abaixo.** Nenhuma lacuna de correção encontrada nessa fatia. Parecer independente do integrador, conversa 01a12adc-473d-7381-b067-c83af7ccda31; Sol/xhigh solicitado, configuração efetiva/modelo/tier desconhecidos.

Baseline fixo: 14cbb7bd2878eed0a930b324b0c50610be7cdab8.

| Fonte revisada | SHA256 |
|---|---|
| src/jev-read/feed.ts | 22ba9fa95954a8711d3749d9ddc41595ed516fc0e8bb1c0c8d19d27fcae5a6ad |
| src/jev-read/feed.test.ts | 8ff11acedcc715caa3ad7cadda452d5532d3dcb61de35ab2764b2ca6a10efc5b |
| docs/JEV-TAPE-DATA-F1-F4-SPEC-V2-20261011.md | 10cee5fe44e7dbde5a988d34822ee99061cb24b39341e2cefe77a4bae2439c97 |

SPEC:98–108 exige instrumento completo, ticker REST com identidade obrigatória, WS vinculado ao arg e validação adicional quando a linha declara identidade; receipt não se renova no snapshot.

- REST ticker: feed.ts:257–261, “row.instId !== instId”: ausência/divergência falha, conserva captura anterior e emite código fixo.
- WS books5/tickers: feed.ts:452/462, “"instId" in row && row.instId !== arg.instId”: rejeita divergências declaradas; ausência continua permitida, vinculada ao arg rastreado (443–447).
- Snapshot/ages: feed.ts:210–223 conserva receipt original.

Cópia comum exclusiva: identity-spec-review-20261011-07c900d3274a; nenhuma garantia OS readonly/firewall. Hashes da origem/cópia conferidos antes/depois, todos inalterados. Nenhuma edição da origem ou Git/harness.

~~~text
bun --no-env-file --no-install test --parallel=1 --timeout 15000 --preload ./offline-guard.ts ./src/jev-read/feed.test.ts ./src/jev-read/identity-review.test.ts
~~~

Bun 1.3.14 / Node v26.9.0; wrapper allowlisted, timeout externo30s. Exit0: **72 pass / 0 fail / 683 expects**, 169ms; 53 testes existentes e 19 independentes. Mesmo probe no baseline e pré-identidade: ambos exit1, **7 pass / 12 fail**, 98ms. Reproduções: divergência populava cache vazio; linha inválida posterior substituía valor100 por998. Controles verificaram BTC-USDT/BTC-USDC, base/quote/SWAP/case/espaços/tipos inválidos, arg inválido ou outro par rastreado, lotes mistos, identidade WS ausente/exata, atualização válida e conservação de receipt/idade. Guards: zero fetch/WebSocket reais.

Tentativa inicial terminou antes dos testes, Bun3221226505, com SystemRoot malformado no wrapper próprio; logs preservados. Wrapper corrigido, causa do crash não demonstrada. Probe SHA256 fc49a7c6a1c264c04d99637619d28b59474a2074dc9f0bb030cf5465ceb8544c.

[Manifesto/logs/comandos/hashes](./identity-spec-review-20261011-07c900d3274a/evidence-manifest.json), SHA256 a5bad4e29f3489b00ca67e9bdd67ba64d2e750aa686f3a88853b808c81382e6d. Relatório lifecycle e probe original preservados.

121/0/925 e typecheck são evidência atribuída ao integrador; não reproduzidos integralmente. ValueProof/TTL/F4/COMPOSITION continuam incompletos; nenhuma aceitação integral, merge, qualificação live ou conclusão do objetivo.
