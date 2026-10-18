# Revisão independente SPEC — candidato imutável

Autor observado por `CODEX_THREAD_ID`: `01a12ada-7b55-7fd2-8a20-c940f474c1a1`; distinto do implementador `codex-inonu-system-one-safety`. Sol/xhigh solicitado; modelo, esforço e tier efetivos desconhecidos. Isolamento: cópia ordinária exclusiva, sem enforcement de filesystem somente leitura. Origem acessada somente para leituras Git e dependências públicas já instaladas; nenhum candidato, SPEC ou relatório anterior alterado. Sem delegação, instalações, segredos, rede/provedor/modelo real, signers, ordens ou mutações de objetivo.

Origem: `C:/Users/gabri/jev-trader-desk`. Baseline/merge-base: `f626a3026a524f61d7e9f7baf6ad6c54ebf89a6c`; candidato: `4a1d9e9500468ba566d377d6248d20834e932b4f`. Apenas `9f20eab8c2bff075fa6f55aa85dd629891b60acf` e `4a1d9e9`: 18 arquivos, +2192/−4 linhas. SHA256 do diff triple-dot exato: `c794bd06ec1f3be946c4729ee753903c034b2de48b8219f1a00b4ab2c0cc2ee1`. Avanço concorrente informado `001e6b8f1af249168e21436eae579dfcd355cd5b`, incluindo REST refresh/env exemplo/page console, expressamente fora desta revisão. Não sigo HEAD móvel nem avalio WIP.

## Findings (<400 palavras)

**FAIL — requer correções no candidato fixo.** Reproduções offline, sem inferência real:

1. **[P2] Relógio corrigido não governa a validade das velas.** `scripts/jev-read.ts:155` passa `Date.now()` ao snapshot; `read.ts:41` valida esse relógio local (`state.ts:92`). Com atraso local de 180s, vela de 300s passa pelo teto de 150s e chama o modelo; adiantamento de 180s rejeita vela válida de 60s. Vela futura de 120s também passa. Viola I4: “fail closed on ... stale evidence”.
2. **[P2] Dados WebSocket antigos tornam-se atuais pela chegada.** `feed.ts:252,262` ignora `ts` do provedor. Book/ticker com `ts="1"`, recebidos agora, produzem estado e `buy`. A SPEC exige: “Cada valor traz instante de observação e origem” e dado velho desconhecido (`JEV-DECISAO-ONCHAIN-OS.md:50`). Recebimento recente não comprova atualidade da observação.
3. **[P2] Funding aceita outro instrumento e idade desconhecida.** `feed.ts:174–180` usa a primeira taxa sem conferir identidade/timestamp; `state.ts:126` a transmite como conhecida. Resposta ETH-USDT-SWAP para pedido BTC-USDT-SWAP, `ts="1"`, vira funding BTC de 0,4%. Contraria identidade/freshness explícitas de I3 e SPEC:50; o prompt promete perpetual correspondente (`decide.ts:94`).
4. **[P2] Fluxo de 60s é truncado sem sinalização.** `feed.ts:258` conserva apenas 200 trades; `state.ts:52–75` apresenta esse subconjunto como janela completa (`decide.ts:94`). Com 300 compras seguidas de 200 vendas na mesma janela, imbalance esperado +0,2 vira −1. Sem qualquer trade observado, buy/sell/CVD viram zero sem distinguir cobertura ausente, contrariando SPEC:50: “não é preenchido com zero”.
5. **[P2] Resposta atrasada/cancelada pode continuar `buy`.** `read.ts:48–61` depende somente de corrida com timer. Modelo sintético que bloqueia 25ms retorna `buy` com deadline de 1ms; sinal previamente abortado também chama modelo e aceita `buy`. SPEC:56: “Jev indisponível, atrasado ou com resposta inválida significa `hold`.”
6. **[P2] Normalização aceita soma infinita.** `decide.ts:46–49` soma dois pesos finitos `Number.MAX_VALUE`; divisão por infinito produz três zeros, mantendo `buy/status=ok`. A projeção pública rejeita a leitura inteira, em vez do `hold` exigido para resposta inválida (SPEC:56).

## Cobertura e limites

| Requisito/contrato aplicável | Parecer | Evidência e limite |
|---|---|---|
| Relógio corrigido em System One | PASS limitado | Helper e 21 testes de clock passaram; `scripts/system-one.ts` usa o relógio corrigido. Sem acesso real à exchange. Caminho novo de leitura falha no finding 1. |
| Inputs atuais, identificados e desconhecidos explícitos — I3/I4, SPEC:50 | FAIL | Findings 1–4 reproduzidos no seam público. |
| Decisão tipada, inválida/atrasada → hold — SPEC:56 | FAIL | Findings 5–6; testes existentes cobrem outros casos de timeout/malformed, mas não esses limites. |
| Conselho sem autorização financeira — arquitetura D1/D5/D11 | PASS limitado | `runJevRead` fixa `advisory:true/execution:"never"`; publicação/HTTP não chamam executor. Compra/venda aqui é conselho; não satisfaz contrato de candidato elegível para execução. |
| Verificação proporcional/independência — I1/I6 | partial | 93 testes independentes e sondas sintéticas; cronologia RED pré-implementação não certificada. Nenhuma suíte ampla, typecheck/build ou aplicação executada por este revisor. |
| Objetivo central — GOAL/I2/I5/I7 | partial, fora desta entrega | Custos reais (prompt assume cerca de 20bps), elegibilidade financeira, OOS/shadow, integração de carteira e operação real permanecem não qualificados; não os invento como aceites novos deste diff. |

Não identifiquei autorização ampliada ou operação financeira introduzida neste diff. O escopo consultivo é compatível com o pedido, porém a entrega de inputs verificados e atuais não está satisfeita. Parecer bounded: rejeitar como entrega conforme até corrigir/revalidar findings; nenhuma aprovação de merge, trades ou conclusão do objetivo amplo.

## Execução independente preservada

Snapshot Git exclusivo: `committed-jev-4a1d9e9-wc7jcew7/`; `snapshot-manifest.json` registra os bytes extraídos. Recomparação final dos 18 candidatos, quatro SPECs e dependências de teste contra `git show 4a1d9e9:path`: zero divergências. Quatro SPECs têm diff vazio contra baseline.

Comando direto na cópia, Bun 1.3.14, ambiente allowlist sem credenciais, TEMP/TMP exclusivos:

```text
bun.exe test --no-env-file --no-install --preload ./offline-guard.ts ./src/jev-read/state.test.ts ./src/jev-read/read.test.ts ./src/jev-read/feed.test.ts ./src/jev-read/publish.test.ts ./src/system-one/clock.test.ts
```

Resultado observado: **93 pass / 0 fail / 250 expects / 5 arquivos**, exit0, 4,32s; tool chunk `8749b2`, sessão `13706`. Logs `focused-peer.stdout.log`, `focused-peer.stderr.log`, métricas RTK `focused-peer-metrics.json`. RTK manteve stream exato, `command_not_allowlisted`; não houve ganho de compressão presumido.

Tentativa inicial: 146 pass / 2 fail / 2 errors, exit1, por peer público `zod/v4` ausente na extração e invocação que duplicou suites via script de package. Logs `focused.*` preservados. Copiei apenas o peer zod 4.6.5 já instalado e usei invocação direta; não houve instalação nem correção de candidato.

Sondas: `bun.exe --no-env-file --no-install --preload ./offline-guard.ts ./boundary-probe.ts`; `repros-peer.stdout.json` e `repros-peer-exit.json`, exit0 significa reprodução bem-sucedida dos defeitos, não aceitação. Mock de modelo, fetch e socket; guard local de fetch/WebSocket não é sandbox OS. Caso deadline observou 26,2755ms para 1ms. O campo `scriptSha256` do recibo é digest de texto normalizado LF (`17612c5fae5bc43cc1889337e0b0caed0794b8f7a922ac28b59f98936d3daa49`); bytes CRLF atuais do helper têm hash abaixo. Essa diferença foi conferida independentemente, sem reescrever recibo.

## Hashes SHA256 — metadados

| Arquivo candidato (bytes Git = cópia) | SHA256 |
|---|---|
| `package.json` | `c8f32e0e403886b7a0c105e5286c320303b4822c2d4f8358ff798a6601a0d7b7` |
| `scripts/jev-read.ts` | `9af91ad58a3f7b5d08d29392851f9bcf2bef8b675cb3c7964dce9a1786aa7e4c` |
| `scripts/system-one.ts` | `a492e9446aa6830a8735dd5cf0e5f3d6e90ab3d25d31afaf6d0285918c6e56dd` |
| `src/jev-read/decide.ts` | `8ae4caeaec7955e811245c7af9e830ffea63c01e7c3ec59ced693c041d9b8cf0` |
| `src/jev-read/feed.test.ts` | `ac323f8703c83ab78c135506f98700bba97b0c5ffb9171eb2a0e423f75330119` |
| `src/jev-read/feed.ts` | `6f320ef9c8b8fb8affc68e0a75c2b52ec390377644f1dba8adc3d2416312919b` |
| `src/jev-read/http.ts` | `79ca77898708ea7ba92923f4f2208bcd8ad3ffe4c00d6a97357c97657730a98e` |
| `src/jev-read/public-view.ts` | `257e87a515aa57f6bca4802bb6c0bb7f37e96a8823c65fa0457c899af22c0855` |
| `src/jev-read/publish.test.ts` | `7389f5945c6ab773d1dcaa4a34828e511b6113672ee98f3da9d971bedee4c2a5` |
| `src/jev-read/read.test.ts` | `8d7d94e5f6ab9b54b83d5e18201128b11e18cbb3086b24b807b092224029c106` |
| `src/jev-read/read.ts` | `100651d19f065279331b897b0134c715d23e4e07953677ba0ff3fc1180623629` |
| `src/jev-read/state.test.ts` | `1215752703bb6372031d79568e61cd6f1cd3b2224740c2659e9c4aa7a56dd4a6` |
| `src/jev-read/state.ts` | `f69f539a348c795375daec2aafceadfc10bec1c04de5f76e31ce1016d2d4080c` |
| `src/jev-read/store.ts` | `87e859f8d84c78bac8bba553275f68c7657cf4800016771738f871ddd806da2e` |
| `src/jev-read/types.ts` | `c084aad88c1406e9f9b0d2be8041f8b6071610025ce0fb9fb3f932551c3697a8` |
| `src/server.ts` | `073d79f969a8e2f96a931d1687e68ce24a2ef2b522d52d31d360d9aff01c1453` |
| `src/system-one/clock.test.ts` | `940007818ee6a3520cfef897473175b633727270b7067587474f7942e817a548` |
| `src/system-one/clock.ts` | `53c327ecdcf6f35f90a0a78105e7be180efc4f5e93f0964234a4d8344df6056a` |

| SPEC comprometida, inalterada | SHA256 |
|---|---|
| `docs/GOAL-INONU-TRADER.md` | `968b888890679baa5b0d2d358c36d5bb7fc8ecce690e455fdcddf6da891a35fc` |
| `docs/WEB3-INTEGRATION-DELIVERY-SPEC.md` | `dce6610f5fdaffbe98cadd2de35f1bf84cd8a274566657e3a5d163a1d9431515` |
| `docs/ARQUITETURA-CENTRAL-DE-OPERACOES.md` | `e9518e61eec50582099c5e9a15ef9845520ccf0df833adac93fcb8b24a786468` |
| `docs/JEV-DECISAO-ONCHAIN-OS.md` | `0e3819b054a0a231bbb74cb445cf5a8eab0339866c1bafa17e5b33eab7ddbbb6` |

| Evidência no snapshot | SHA256 dos bytes |
|---|---|
| `snapshot-manifest.json` | `6051bc8610198be7bf739c7e63ee3a87f38941a9148642755671c8e93af02d3a` |
| `focused-peer.stdout.log` | `d6684989b8dd63b37d2f1954270826fbe1bd89a8debd12bcacf03ed1c6140ef6` |
| `focused-peer.stderr.log` | `4a379a42d1feeb6a6910600eb035da14cb117d6ad2ecbd4fd5b2564cad5efd72` |
| `focused-peer-metrics.json` | `8b3a5e2dcc2c22239a8fbfca0a1a50ea8b81634869ab1e2a932dbccc1b6d929d` |
| `repros-peer.stdout.json` | `c93016a2284c048e3c8de22206cab2ca5b7321b815e60392ebd511a46f7e6e29` |
| `repros-peer-exit.json` | `42f791ed39eb1351cbe82957b156a3079d08536900181795b89e237b364be4ac` |
| `boundary-probe.ts` | `7917756c2c2454476f57965194fd70a34327ebcd97202d563f6fb100f75ae71e` |
| `offline-guard.ts` | `13e0b64a77c7cb8414db0325a00b259dbff30eea83eb4959110f0f62d31bd2a9` |
