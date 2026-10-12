# Revisão independente — reconciliação remota

Baseline: `96d30cc387a6520aba23199e25d0d4ec71a7ad88`. Candidato: `2ed0324af1d539ea89e052b52309ec6365b4d2bb`. Remotos: `ed005440ff09b46fc5b10ae1d4ed74e94f70b494` e `0620787aae1ba2ef1b0cf217cbd65670463ac48a`; integração anterior: `c352f82755862f4a4619d5e0d4411e2194f8d6a8`.

**Parecer:** cobertura funcional dos remotos demonstrada, com um P2 de veracidade preexistente ainda aberto. Não há regressão de runtime introduzida pelo candidato documental. Não emito parecer incondicional de ausência de impedimentos nem certificação global C1–C6.

## Finding

**P2 — A substituição do Header perdeu a descrição neutra do estado.** `candidate/web/src/components/Rail/Rail.tsx:65` afirma “Execucao real a cada bloco” incondicionalmente; `candidate/web/src/app/layout.tsx:21` e `candidate/web/src/components/CommandCenter/CommandCenter.tsx:231` repetem a alegação. Com `meta.dryRun=true`, feed ausente, hold ou ordem sem recibo, esses textos continuam afirmando execução. O badge de simulação não condiciona a frase. O Header remoto (`remote/web/src/components/Header/Header.tsx:51`) dizia “Estado visível”; essa propriedade útil não foi preservada na apresentação atual. O audit em `candidate/docs/REMOTE-BRANCH-INTEGRATION-20261011.md:33` registra a distinção como preservada sem essa ressalva. Usar texto neutro ou condicionado à evidência e proteger simulação/ausência de feed com regressão. **Já existe no baseline; não foi causado por este merge.** Afeta C2/C5 e a afirmação de preservação integral RI1/RI2.

## Evidência e cobertura

Comparei os 556 arquivos preexistentes: candidato e main exportados são idênticos byte a byte. Único acréscimo: audit de 51 linhas. Verifiquei os 97 blobs presentes no manifesto após normalização CRLF→LF; nenhuma divergência. Critério congelado e cópia no candidato têm conteúdo idêntico após essa normalização.

Todos os 35 caminhos foram inspecionados: 7 iguais ao atual; 28 restantes abrangem 4 documentos/env, 2 packages, 4 identidade/layout/CSS, página, 8 componentes removidos, FlowChart/CSS, WalletPanel/CSS, wallet/teste e 3 contratos/helpers. DecisionPanel→JevCore/CommandCenter; Feed→TelemetryStream/inspector; Header→Rail; StatsRow→KpiSurface/InstrumentRow. Probabilidades, latência média, confiança por bloco, filtros, janelas 32/64/128, controles, saldos exatos, conexão explícita, X Layer, freshness e invalidação permanecem. As 23 asserções/nomes de apresentação foram preservadas; fixtures explicitam custos desconhecidos. Nenhuma outra capacidade remota útil ausente foi identificada.

Executei apenas três seams offline, extraídos dos testes atuais contra o módulo wallet do candidato, com provedor fictício: **3 pass / 0 fail / 25 asserções**. `okx-wallet.test.ts:964–1035` cobre os cinco eventos invalidadores e respostas atrasadas; `:1037–1063` cobre atualização agrupada sem nova permissão; `:1066–1086` cobre conta antes da rede conhecida. Comando: `bun --no-env-file --no-install test --timeout 5000 ./review-wallet-seams.test.ts`.

RI1/RI2: cobertura acima, ressalva P2. RI3/RI5: parentes/estado Git são fatos fornecidos, sem verificação independente de ancestry ou atualização main nos exports. RI4/C5: revisão independente realizada, P2 aberto. C2: preservação estática com ressalva. C1: inventário demonstrado; integração efetiva não certificada. C3: regras responsivas/reduced-motion inspecionadas, sem navegador. C4: igualdade dos inputs demonstrada; suites/tipos/build anteriores são evidência do integrador, logs não verificados nesta revisão. C6: preview/browser não executados; recusas respeitadas.

Identidade observada: thread `01a12ad1-04ba-75d1-b5a3-937bfb6d3a1c`, sessão `01a12971-f91a-7b01-befa-dfa93eb04425`. Configuração solicitada GPT-6.1 Sol/xhigh; modelo/tier efetivos desconhecidos. Isolamento por exports; sandbox OS read-only não comprovado. Sem rede, instalação, credenciais, navegador, servidor ou execução financeira; nenhuma fonte alterada.

## SHA256 verificados

| Artefato | SHA256 |
| --- | --- |
| CENTRAL-JEV-ACCEPTANCE.md (raiz congelada) | `20e1558da58ceae78332020f1e4f84277eacdb694748d28b9ea599dc30808054` |
| CENTRAL-JEV-REMOTE-INTEGRATION-SPEC.md | `f7395f11adfc236a90258f4d7a13587cbe480d84ef3b1d42980777ad1ca20cb7` |
| remote-paths.json | `8cc5b7b0d73cb3a423acd7fa02a48a82fb034a4336af2cd6fa3ca9fb40da4cae` |
| current-versus-remote.patch | `0ef93ce66d38db5e16003eb30708f876d1aaeaf5fa72bb667fa2e297f28f1b59` |
| prior-versus-remote.patch | `91908fc90d4d75ecc55d3d942881f873608061d7ddcaa228d99fe5bc7cb529a1` |
| CANDIDATE-FACTS.txt | `63b86cb9bf1c84c76f495d864ccc12b7a9a30485af1ee221bef597019873a22a` |
| candidate/docs/REMOTE-BRANCH-INTEGRATION-20261011.md | `05def869eec955a3324490054e008c4e8466489ebb04be3adde27733e5b4a5e8` |
| candidate/web/src/components/Rail/Rail.tsx | `8c43ad2aa5b111910c721c559816a46947b819f5d6c9f03865eeeed134efee8f` |
| candidate/web/src/app/layout.tsx | `150b4e1b84ae6edd658c24f35e874318ad3b4e97de4fa57c579f758913e7a4f8` |
| candidate/web/src/components/CommandCenter/CommandCenter.tsx | `36dc834244d9a4b3fa5eb1e1be4b37ce977f3d46d2f6127593699161d0642a58` |
| candidate/web/src/lib/okx-wallet.ts | `5f37cd832c52b3f4eab6f813acaeddee3dc4f823b4bfefbdab3d31f2a1f20e2f` |
| candidate/web/src/lib/okx-wallet.test.ts | `3f7c8516f0e80ad6bb95e52b75740e26bf44280ef94bb4f9188e3e2adc379baf` |
| review-wallet-seams.test.ts (probe próprio) | `0a8f0e601dc45f7107fc328b239f89453a2fbbef729bbb52e02bbb13f1445ed4` |
