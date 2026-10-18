# Investigação independente: fronteira de candidatos DeFi

Autor/reviewer_id: `01a12ada-7b55-7fd2-8a20-c940f474c1a1`; implementador distinto: `codex-inonu-system-one-safety`. Não implementei o código examinado. Sol/xhigh solicitado; modelo, esforço e tier efetivos desconhecidos. Cópia ordinária exclusiva, sem RO imposto pelo sistema operacional. Origem somente leitura por instrução; escrita limitada ao relatório e à nova fixture/evidência nesta pasta. Aplicadas as skills codex-desktop-harness e code-review; sem auxiliares ou consultas de provedor.

Baseline/HEAD observado: `1f08e6edd589449a82eeb70638987a09572a3bd2`; tree: `15b1fe6b2ac58c5821b9ab77723610d0afe780aa`. Rechecagem final: 18 arquivos da origem e nove módulos copiados permanecem iguais aos hashes registrados. Os arquivos da origem usam CRLF; a fixture contém blobs Git exatos LF. Nenhuma diferença além dos finais de linha nesses 18 arquivos.

## Achados e critérios existentes

Três achados P2, condicionais a uma `DefiSource` que forneça taxa de entrada conhecida. São defeitos de elegibilidade consultiva; não foi estabelecido bypass financeiro atual.

| Fronteira | Resultado | Reprodução e contrato |
|---|---|---|
| Identidade | **FAIL** | `candidates.ts:269–275` ignora chain/token retornados e grava o par solicitado. `wrong_chain` (1 em vez de 196) e `wrong_token` passaram com `eligible=true`, sem razões; `risk-gate.ts:42–48` só vê a identidade substituída. Viola `OPPORTUNITY-ARCHITECTURE.md:69`: “mesma rede/contrato/tamanho”. |
| Frescor | **FAIL** | `DefiProduct` (`candidates.ts:69–78`) não contém timestamp; `:278` fixa `quoteAgeMs=0`, sem usar `nowMs`. A mesma fixture devolvida após 86.400.000 ms continuou elegível, embora o teto seja 15.000 ms. `JEV-DECISAO-ONCHAIN-OS.md:50` exige instante/origem e torna dado velho ou desconhecido inelegível. |
| Custos e líquido conservador | **FAIL** | `candidates.ts:271–281` usa APY anunciado, taxa de subscrição isolada, `tradingFeeUsd=0`, `complete=true` e `researchOnly=false`, sem evidência de saída/liquidez. Fixture: US$21,25, APY20%, sete dias, entrada US$0,001 → líquido US$0,08040684931506849, acima de US$0,05, elegível. Contratos: `JEV-DECISAO-ONCHAIN-OS.md:46–47,60` (“Custo desconhecido é indisponível, nunca zero”); `OPPORTUNITY-ARCHITECTURE.md:51,70–72`; `types.ts:31,54`. |

## Proteções realmente verificadas

| Proteção | Resultado | Evidência e alcance |
|---|---|---|
| Adaptador atual mantém custos desconhecidos | **PASS** | Parser público exercitado offline: `okx-wallet/defi.ts:35` retorna `subscribeFeeUsd=null`; candidato rejeitado com `costs_incomplete`/`net_unknown`. CLI usa esse adaptador (`scripts/okx-operator.ts:175`, leitura). Não houve consulta OKX. |
| Gate bloqueia desconhecido/stale/pesquisa | **PASS** | Controles explícitos: `quote_stale`, `quote_age_unknown`, `research_only`, `costs_incomplete`; APY nulo → `net_unknown`. Fonte ausente/erro → zero candidatos. |
| DeFi não recebe qualificação live | **PASS** | Set exclusivo `dex_round_trip` em `plan.ts:15–16,50–62`; os sete casos ficaram `qualified_dry_run`, mesmo com quatro flags simbólicos abertos. Flags de fixture não representam permissões reais. |
| Executor rejeita DeFi antes de cliente/ledger/signer | **PASS por leitura; execução não exercitada** | `executor.ts:122` retorna dry run; `:147` rejeita outros tipos antes de `:149,152,163`. |
| Comportamento do provedor real | **unknown** | Sem rede, assinatura, fundos ou observação de produto real. |

`cycle.ts:159–184` envia elegíveis ao modelo antes da qualificação do plano; `jev-selector.ts:44–59,126–156` transmite idade/custos/líquido sem recuperar as evidências descartadas. Portanto, com outra fonte que preencha a taxa, o impacto demonstrado é seleção consultiva incorreta. As barreiras atuais de execução continuam presentes.

## Método e execução independente

Nova fixture exclusiva: `defi-boundary-offline-1f08e6-20261011-01d7f58f/`. Somente nove módulos públicos extraídos do commit exato; sem Git metadata, dependências instaladas, .env ou estado privado. Probe novo importa `buildYieldCandidates`, `gateCandidate`, `buildExecutionPlan` e `parseDefiSearch`, com `DefiSource` fake, inventário sintético, configuração por objeto literal e relógio fixo.

Execução em 2026-10-11T20:18:08.765887Z–20:18:09.191117Z, via RTK/Headroom, chunk `db0f15`: wrapper/adapter exit **0**, stderr vazio, **38 assertions de reprodução**. Esse exit confirma as observações esperadas do probe, não aprovação dos contratos: os três critérios acima falharam. Contadores: fetch/network attempts 0; modelo real 0; signer 0; executor 0. Fetch guard é controle do processo, não sandbox OS. RTK conservou os 19.807 bytes exatos (`command_not_allowlisted`, `archive_id=null`), sem uma segunda execução.

Comando interno reproduzível, na fixture:

```text
C:/Users/gabri/.bun/bin/bun.exe --no-env-file --no-install run defi-candidate-boundary-probe.ts
```

Comando completo, lista de variáveis permitidas, timestamps e status estão em `probe-result.json`; saída integral em `probe.stdout.json`. Sem suíte ampla, typecheck, startup ou testes de executor. Busca delimitada nos testes públicos de operator/okx-wallet encontrou apenas a expectativa de taxa nula em `defi.test.ts:15` entre os termos pesquisados; não demonstrou cobertura específica dessas três fronteiras. Não afirmo ausência universal de testes.

Leituras preliminares: `git show baseline:AGENTS.md` retornou fatal/path inexistente (Git128); aplicadas as instruções fornecidas. Um erro de codificação ao imprimir Σ foi recuperado com UTF-8; saídas truncadas foram recuperadas por leituras delimitadas. Não são falhas do candidato.

Próximo passo verificável: especificar evidência validável de identidade, observação e custos/saída, reproduzir rejeições no seam público e preservar os controles de taxa desconhecida e exclusão live. Nenhum critério foi alterado. Isto é investigação, sem implementação, aprovação de release, merge ou autorização financeira. A missão ampla permanece incompleta.

## Vínculo de hashes SHA256

Manifesto completo: `source-manifest.json` na fixture; hash `0ef99251bbcd5b1222ba56d532b658bc780937440d2b506891c028afdcda830b`. A coluna LF identifica os bytes do commit; origem identifica os bytes físicos atuais. Rechecagem independente, chunk `7eeb75`, exit0, nenhuma divergência.

| Fonte pública | Blob LF fixo | Origem física CRLF |
|---|---|---|
| `src/operator/candidates.ts` | `6edfa00c5ca891bf0bc86c0cffcfdc7759902b587e878a2ddeab26ad9767efa7` | `3955e44992bba1a2a36a6382f3ad29fe50c2248300deb2646519f3c54dbdd219` |
| `src/operator/risk-gate.ts` | `1143378a6d5d8a46077ab6ca6b86f9832162e172d772f792b99d572cf1467cc7` | `7b916e9246c16e68cb6f007f687009f54e6237d54ae7297ce8c7a663daffbaa1` |
| `src/operator/types.ts` | `0be6bb6275b4b13bfce4714fe59bf15703d03dc9204b8a9fde9a798aa5ce97cb` | `f2a0476773571945cfced68768b90fc85e88914a95755b0e44d405c918408039` |
| `src/operator/config.ts` | `1c3ff5eeaf9c380c11e425b6c12242d5faa63b5e15fd9da820f4b1c3bc9b1ee6` | `1488d245dd30e449c8bdef7472651037ab3b68fd469ddde2f854362a2c4bc3e7` |
| `src/operator/plan.ts` | `f97aa1f2ef77ff9d2099865914c7960674984b5e2e4662d34704aec784b6e5a9` | `488159912f83980e4e0a642aac9cf3342533fc76c1eac6df3a19c0f3b4d8d9f4` |
| `src/okx-wallet/chains.ts` | `f92b23c2522f4868bf6997c9b17938382f905ff5424f91c755db155c61bbcf1f` | `ae6d302677ee81de852df25afdc4d7c70cdda6f6b3aa98d6f00398030c342abe` |
| `src/okx-wallet/portfolio.ts` | `aa1d1f7743c551574bf29e02ed46b1cfe4bcab24f833b2a7e373cc3de8aa5ac5` | `b07cfd5be8b74c65cadbc3c1874b9b377acf0bb568f15012423f4e5ec0dea544` |
| `src/okx-wallet/defi.ts` | `28532158e98aee74c05decedfc96e669caa77e2bdaa2d1c152c640a9f52c7b63` | `a00da33976075aaaa73b7f0b189f4d89540f31d6f646f32f81dc6eafc1fdb76e` |
| `src/okx-wallet/trade.ts` | `1f55e3377bb178b585587ba064792e67b416f542e3ffaed4fe97f0f0c740522d` | `24688d48572c9062be59910ac988c67ff7e1349d910eae1a9e1b5183ff9b7e86` |
| `src/operator/executor.ts` | `4b413799c101eed60512376f6b02a84875f3a9d5b523e5090244a09cb1e819ef` | `17db3012332584dce46ac712e0d48ebf71f59f13533ce40d8b12fa6667b6961a` |
| `src/operator/cycle.ts` | `77916ac342254494764d2402f73e692e13a5fb5a464926538908e436e49584bb` | `adcb20abbe449b458a1b69b80a9b9226e1919791b5ad8fa0b63de3cab644f3a2` |
| `src/operator/jev-selector.ts` | `f48e2ddda8c6a47ae1c97b86c85da7dbbd6d4094536c564e84125cdbef694c8d` | `5b784de6051e5747363c47324f2ecd9d71b4c28d1d356701d195dd56dd80ace2` |
| `src/operator/operator.test.ts` | `e7ca3a0e975c864057e97934287745a7b7e48f752eedee7e225ecb87e94813da` | `525c75c72a0ea7d84d7262f3fe31fe9d5f8b09e28d996ffb3ea486eb686b196a` |
| `src/okx-wallet/defi.test.ts` | `017ccc64ee213a2e0ea3d97308c871ddb7b8ee687040e39c4ee5c8ec5de68445` | `e2a74549651c216505fa0ec7dc8da4e7d38657e84e213d4f6b6d8f0dc71bf999` |
| `scripts/okx-operator.ts` | `4be6328b584ac1655c764af4c822dbf178e1bf5d8a01d65939d2866d51598257` | `ed937480a59c21d94deab87769ac4ae68cf10b7bdaaa743898df7039c03f5784` |
| `docs/JEV-DECISAO-ONCHAIN-OS.md` | `0e3819b054a0a231bbb74cb445cf5a8eab0339866c1bafa17e5b33eab7ddbbb6` | `46c9a77493ebe53c24e7f82fc02c6abe9ca9e823559fa1505a95c3cfb10635c4` |
| `docs/OPPORTUNITY-ARCHITECTURE.md` | `0846a394b945d7006a87393b099a50d0a31e34c722ec29b1c23c2bfb72a112c7` | `3ab1c3d166641afd3b2fbeda403b1006eb6aae77b3aa658cee2aa1fff8e14398` |
| `docs/GOAL-INONU-TRADER.md` | `968b888890679baa5b0d2d358c36d5bb7fc8ecce690e455fdcddf6da891a35fc` | `ddd733c3b9d51dc8e084a5acdd86ac5d8ac1674448fa0473aaf3266e2d90a04a` |

| Evidência nova, na fixture | SHA256 |
|---|---|
| `defi-candidate-boundary-probe.ts` | `a997c37033f9a15017f0efd7d85a908e3d2c1e174a75bc6e95f256318965a5df` |
| `probe.stdout.json` | `ba1a834b40ada7bd2f9809c6ab5f2e8f7e7f691acf9d6a0b20870d688862609f` |
| `probe.stderr.log` | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |
| `probe-result.json` | `656c191f86a08cc0dd38598035b4f2e2d123e1c22c3e1a724551ff871b4a8d7c` |
| `probe-rtk-metrics.json` | `1d3b6c8d73819ce3628dfedc9994a1a4cddc69d24a24b4abd775c560715a9541` |
