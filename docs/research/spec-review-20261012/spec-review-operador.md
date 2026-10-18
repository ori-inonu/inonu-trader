# Revisão de especificações, cluster operador (somente leitura)

Alvo: integ/consolidation 8d0611a (jev-trader-integ). Base de comparação: main f7be047 e R10 (branch docs/r10-operator-rereview 1dfef8a). Data: 2026-10-12.
Método: leitura com arquivo:linha dos fontes de 8d0611a. Executei, em cwd temporário e com `bun --no-env-file test`, 17 arquivos de teste do operador e da carteira (inclui o CLI em subprocesso; conferi por grep que só gravam em os.tmpdir()): 197 pass, 0 fail. PoC offline de M1, M2 e B3 em diretório temporário (`poc-m1-m2.ts`, saída em `poc-m1-m2.out`) e PoC em memória de A1 (`poc-a1.ts`, `poc-a1.out`). `git status` do alvo limpo antes e depois. Sondas e as 96 mutações de R10 não foram reexecutadas ("verificado por leitura" quando não digo "executado").
Resultado central: `git diff f7be047 8d0611a -- src/operator scripts/okx-operator.ts` é vazio. Em src/okx-wallet só entrou valuation-diagnostics.ts e seu teste (módulo sem consumidor). Hashes de 10 hex de executor 9bfcda2c60, config b1e1a9eeb6, risk-gate 41ef5b5b3f, types 086005be2d, ledger 9bc7790194, cycle 77916ac342, script eb8c99d2e0, plan, candidates, jev-selector, http, server, portfolio, trade, solana-signer e .env.example são iguais aos de R10. Fora do código, só package.json (scripts de outros clusters; `okx:operator` mantém `--no-env-file`) e seções do README de outros clusters mudaram; a seção do operador no README, o guia, a auditoria e o .env.example são idênticos a f7be047. Todo veredito de R10 vale sem alteração; estágio 3 continua NÃO liberado e nada aqui o liga.
Aviso: as revisões independentes de CLI lock (script ed937480), persistência (ledger 3f56974e) e model boundary (executor 59659dd1) estão amarradas a hashes anteriores; o código atual diverge (9fd6f39, 8f08132, 4007541, merges). Só R10 revisa os hashes atuais.

## 1. OPERATOR-CLI-LOCK-SPEC.md (implementado em 2e704c7)
| ID | Status | Evidência | Falta |
| --- | --- | --- | --- |
| L1 | DONE | okx-operator.ts:136-137, ledger.ts:272-281; scripts/okx-operator.test.ts:43 (init) e :62 (reconcile): código 1, "Operator lock present", bytes do ledger e do lock intactos | nada |
| L2 | DONE | lock :137 antes de history e ledger :142-143; teste de ordem por texto :142-151; o caminho `--live` real nunca roda (exige chave) | nada |
| L3 | DONE | try/finally :141 e :265-269; handlers removidos :266-267; testes :77, :87, :102, :153 | kill duro deixa LOCK sem runbook [A-8] |
| L4 | DONE | testes :77-116 (init único, corrupto, ausente, campos preservados). O reconcile ganhou `--realized` depois (C3) | M1 e M2 (seção 6) |
| L5 | DONE | teste :118-140 (sintético serializa, `--help` livre); exceção `--routers` :136 só por leitura | nada |
| L6 | DONE | fixture :11-41 (tmp, env permitido, `--no-env-file`, preload sem rede); RED 3 pass/4 fail e GREEN 7/0 no review; hoje 8 testes passam (executado) | filho morto aos 10 s (:34) frágil sob carga [A-13] |
| Adendo | DONE | intervalo comum a todos os escritores :134-137; sem remoção automática; falha parcial de `acquireLock` (ledger.ts:277-282) sem evidência | nada |
| Cabeçalho | D | linhas 3 e 33-35 ("research proposal only", "Harness revision65") superadas por 2e704c7 e pelo review PASS | [A-2] |

## 2. OPERATOR-PERSISTENCE-SPEC.md (implementado em 703c626)
| ID | Status | Evidência | Falta |
| --- | --- | --- | --- |
| P1 | DONE | ledger.ts:237-269: 4 tentativas, esperas 10, 20 e 40 ms, só win32, EPERM/EBUSY/EACCES; ledger.persistence.test.ts:24, :49, :73 | nada |
| P2 | DONE | mesmo tmp reaproveitado, destino nunca removido (:256-267); testes :24-48, :120 | nada |
| P3 | DONE | lstat de diretório e link, revalidado a cada tentativa (:244-252, :259); testes :91, :107, :131, :147 | nada |
| P4 | PARTIAL | seam determinístico completo; o probe real de leitor retido fica fora do git (FINAL-EVIDENCE); R10 mediu resíduo 1/132 sob leitor em laço | nada obrigatório |
| P5 | DONE | processo: FINAL-AUDIT e checkpoints; testes reexecutados por mim, ledger.persistence.test.ts idêntico ao auditado (7dfa66ee) | nada |
| P6 (intenção R8 C6) | MISSING | `persistCycle` cycle.ts:219-227 usa `renameSync` direto (:225), sem retry e sem teste que o importe; o arquivo que o painel lê a cada GET (latest.json, http.ts:69) é justamente o desprotegido | [A-5] |
| Exclusões | N-A | rotação do journal, HTTP e lock ficam fora por desenho | D8 [B-8] |

## 3. OPERATOR-MODEL-BOUNDARY-SPEC.md (R8 C5, dd1ae31)
| ID | Status | Evidência |
| --- | --- | --- |
| M1 | DONE | executor.ts:128-152 (contexto obrigatório, `mock` com trim e caixa, validação contra a lista elegível completa, modelo igual ao da decisão, escolha igual a plano e candidato); operator.test.ts:29-45, :47-86, :283-303, :305-326, :328-349 |
| M2 | DONE | cycle.ts:183 repassa `deps.model.name`, decisão e elegíveis; operator.test.ts:351-374 (mock com todos os gates abertos: 0 chamadas, 0 envios, 0 escritas) |
| M3 | DONE | operator.test.ts:47-86 (distribuição completa chega a `evm_signer_missing`; `qualified_dry_run` segue simulação sem efeitos) |
| M4 | DONE | fronteiras sintéticas; testes executados por mim. Resíduo R10-B4 (guarda por nome, rótulo `jev-latest` em decisão mock passa): D, informativo |

## 4. Contratos de decisão, valuation e integração
| Spec e ID | Status | Evidência |
| --- | --- | --- |
| DECISION-BOUNDARY: pesos exatos, 0 a 1, soma 0,02, cópia, leitura única | DONE | jev-selector.ts:74-96, :99-116; decision-boundary.test.ts:37, :56, :65, :80, :90 (D01 a D03) |
| DECISION-BOUNDARY: tabela de resultados (sem elegível, inválida, falha, timeout, hold) | DONE | cycle.ts:167-176, :198; decision-boundary.test.ts:121-228 (D04 a D06), operator.test.ts:511 |
| DECISION-BOUNDARY: prazo 10 s e abort | DONE com ressalva | cycle.ts:36-65, :153-154, jev-selector.ts:161; o CLI nunca passa `decisionTimeoutMs` (okx-operator.ts:233-238), então o padrão é fixo [A-14] |
| WALLET-FINITE-VALUATION: produto que estoura vira null; soma que estoura lança "Inventory USD total is not representable"; zero e vazio preservados | DONE | portfolio.ts:270-274, :284-296; valuation.test.ts F01 a F07 (executado). Lançar derruba o ciclo por contrato (R8 N22): D |
| VALUATION-DIAGNOSTICS-SPEC (okx-portfolio-v1) WVD1 a WVD6, T01 a T11 | DONE | valuation-diagnostics.ts e .test.ts, T01 a T11 todos presentes (executado); sem consumidor em produção por desenho; o cabeçalho da spec ainda diz "não foi implementado" [A-2] |
| CENTRAL-JEV-OPERATOR-INTEGRATION-SPEC (OI1 a OI5) e LEDGER-INTEGRATION-SPEC (LI1 a LI5) | DONE | dd1ae31 e 703c626 são ancestrais de 8d0611a; LI2 e LI3 = P1 a P3 e executor.expiry.test.ts:87, :135, :148 |

## 5. OPERATOR-ROUNDTRIP-AMOUNT-SPEC.md (proposta, nunca congelada; 3 arquivos novos previstos não existem: roundtrip-contract.ts, roundtrip-contract.test.ts e trade.roundtrip-binding.test.ts)
| ID | Status | Evidência | Falta |
| --- | --- | --- | --- |
| A1 vínculo por perna | MISSING | candidates.ts:158-159 cota a perna 2 sobre a saída cheia da perna 1 (a spec manda cotar o mínimo conservador); o plano guarda só `quoteHash` (plan.ts:59); não existe roundtrip-contract.ts | [B-10] |
| A2 economia conservadora antes do handoff | MISSING | candidates.ts:160-168 e risk-gate.ts:72-76 usam saída cheia e `tradingFeeUsd: 0` sem evidência (:162); Number em vez de racionais | [B-10] |
| A3 revalidação e execução parcial | PARTIAL | STOP e prazo em `beforeSubmit` (executor.ts:213-220, :319); só o mínimo é vendido; piso proporcional (:88-92, :269) é exatamente o "scale proportionally" que a spec proíbe; sem requote antes do primeiro handoff | [B-9] |
| A4 cobertura pública | PARTIAL | operator.test.ts:569-588 (haircut nas duas pernas, perna 2 abaixo do piso recusada); faltam zero slippage, 1 unidade, 6 e 18 decimais, eco errado, custo ausente, quote velha ou futura | [A-6] (parte) e [B-10] |
| A5 controles preservados | DONE | mock, STOP, allowlists, prazos e limites seguem testados (seções 3 e 6) | nada |
| A6 evidência e integração | MISSING | sem RED, sem congelamento; a spec diz "not frozen" (linha 3), coerente | [B-10] |
| R1 slippage comum | PARTIAL | 0 a 5% validado em trade.ts:227; o eco `tx.slippagePercent` é lido (:246) e nunca comparado | [C-5] exige amostra autenticada |
| R2 mínimos exatos | PARTIAL | executor.ts:95-99 equivale a floor(q*(S-k)/S) com S=1e6, k=5000, mas via `Math.round` em float | [B-10] |
| R3 custos tipados | MISSING | `tradingFeeUsd: 0` presumido; sem fonte, unidade ou validade | [B-10] |
| R4 racionais e digest | MISSING | usdFromAtomic converte BigInt em Number (candidates.ts:117-119) | [B-10] |
| R5 revalidação assíncrona | PARTIAL | STOP e prazo ok; economia completa não é revalidada após prepares | [B-9] |
| R6 prova do calldata | MISSING | = C2: executor.ts:105-120 e trade.ts:223-249 não decodificam receiver nem minReturn | [B-11] e [C-4] |
Decisão aberta da própria spec: quote-first ou prepare-first (Jev abstém 0,52, linha 71). Nenhum dos 5 hashes citados na spec vale hoje.

## 6. R10 sobre f7be047: algo mudou em 8d0611a?
| Cond. | R10 | Mudou? | Re-verificação em 8d0611a | Pendência |
| --- | --- | --- | --- | --- |
| C1 / A1 alto | PARTIAL | não | piso da perna 2 sem tolerância: executor.ts:261-271 com minReceiveMatchesQuote :95-99; vende só `leg1.minReceiveAmount`. PoC em memória executado (poc-a1.ts): sem deriva `completed` (3 envios); 1 bp adverso só na perna 2 e queda de 0,01% no intermediário terminam `sent`, `leg2_blocked: min_receive_below_quote`, perna `failed` (2 envios, posição presa); alta de 0,01% é barrada antes de qualquer envio; resíduo de 0,5% no intermediário | [B-9] |
| C2 | OPEN | não | sem decodificação (executor.ts:105-120, trade.ts:223-249) | [B-11], [C-4] |
| C3 / M1 / M2 | PARTIAL | não | lock antes do ledger ok (:136-143); PoC executado: `closed` sem `--realized` sai 0 e destrava sem lançar; `--realized 9999` aceito (teto 10000, :156); `failed --realized -1.5` duas vezes soma -3 (:159-168); `--realized` sem `--reconcile` roda ciclo e ignora | [A-3], [A-4], [C-3] |
| C4 | PARTIAL | não | ack vazio ok (config.ts:129); chave igual recusada só no mesmo ambiente (:120-121); package.json:46 mantém `--no-env-file`; NOVO: `.env.operator` não é ignorado pelo git | [A-1], [A-7], [B-6] |
| C5 | CLOSED | não | executor.ts:128-152, cycle.ts:183, operator.test.ts:283-374 | nada |
| C6 | OPEN | não | server.ts:48-50 (sem hostname), :12 CORS `*`, :61 `GET /` devolve a carteira do trader; http.ts:40-44, :66; cycle.ts:225-226 | [A-5], [A-12], [B-3], [B-4], [B-8] |
| C7 | PARTIAL | não | 13 mutantes sobreviventes sem teste; .github só tem PULL_REQUEST_TEMPLATE.md | [A-6], [C-6] |
| C8 | OWNER-ONLY | não | config.ts:171 (`OPERATOR_TRUST_QUOTE_UNITS` falso) | [C-1] |
| C9 | PARTIAL | não | config.ts:142 (janela 0), executor.ts:211, :216, :256, okx-operator.ts:233-238 | [B-2], [A-14], [C-2] |
| N23 | CLOSED | não | executor.approval-identity.test.ts:17-24, :47-48 usa os.tmpdir() | nada |
| B1 a B4 | baixos | não | B1 [A-7]; B2 [A-8]; B3 [A-9]; B4 D | ver listas |
Nota A1: a perna 1 só passa quando o intermediário ficou igual ou mais barato (executor.ts:203) e é exatamente esse movimento que reprova a perna 2 (piso :269-271), então a seleção é adversa por construção. O plano já carrega `maxLossUsd` (plan.ts:60) e ninguém o aplica. Os testes não veem porque os fakes de operator.test.ts:546-558 só variam a perna 2 para "1" (extremo, :585).

## 7. Resíduos de R4, R5 e R8 (estado por código em 8d0611a)
R4 #1 a #6, K1 a K3 e os itens de R5 estão corrigidos ou superados, exceto: N1 PARTIAL [B-9]; N2 OPEN [B-11]; N3 DONE no lock e no init, resta saldo por RPC [C-3] e teste de `--accept-history` [A-6]; N4 OPEN [B-4]; N5 PARTIAL [A-1], [A-7]; N6 DONE; N7 PARTIAL [A-3], [A-4]; N8 PARTIAL [B-2]; N9 PARTIAL (ledger sim, ciclo não) [A-5]; N10 OPEN [B-8]; N11 OPEN (diagnóstico sempre nulo no CLI real: cycle.ts:106 exige riskTokensExcluded=false e okx-operator.ts:193 passa true) [B-14]; N12 OPEN [A-11]; N13, N14, N24 OPEN [A-16]; N15 OPEN [A-10]; N16 PARTIAL [A-8]; N17 OPEN [A-12]; N19 PARTIAL [A-2]; N20 OPEN [B-8]; N21 OPEN [A-14], [C-2]; N22 D; N23 DONE; N25 OPEN [B-3]. R5 B5 (tetos duros de semanal e drawdown, config.ts:154-155) OPEN [B-5]. R3 sugere 1% do capital por ordem; o perfil micro usa 5% (config.ts:14) [B-13].

## 8. Contradições entre spec, docs e código (texto exato proposto, classe A-2)
Sem ponto médio, travessão ou meia-risca. Linhas de tabela do guia levam `\|` dentro do código.
```
OKX-OPERADOR-JEV.md:55 (FALSO: cycle.ts:185-196 e okx-operator.ts:167) substituir por:
- Reconciliação: depois de um plano `completed` o ciclo marca a perna como `reconciliation_required`, o que bloqueia qualquer novo plano, relê o inventário e informa a variação observada (`observedBalanceDeltaUsd`) só como diagnóstico, sem atribuí-la ao plano; `realizedUsd` fica `null` e o ledger não recebe nada automaticamente. Só `--reconcile <planId> <closed|failed> --realized <usd>` lança o resultado assinado (gás incluído, conferido no explorer) no dia, na semana e no drawdown, e é isso que alimenta as paradas por perda (`OPERATOR_MAX_DAILY_LOSS_USD`, `OPERATOR_MAX_WEEKLY_LOSS_USD`, `OPERATOR_MAX_DRAWDOWN_USD`).
OKX-OPERADOR-JEV.md:73 (FALSO: executor.ts:222-227, :284 só acumulam `gasCostNative` no resultado do ciclo):
| F6 Reconciliação | o gás dos recibos é somado em `gasCostNative` no resultado do ciclo, só como informação, e não é deduzido de nada; as paradas diária, semanal e de drawdown ficam no ledger e só recebem dados de `--reconcile <planId> <closed\|failed> --realized <usd>` (o valor informado deve incluir o gás) | `executor.ts`, `ledger.ts`, CLI |
OKX-OPERADOR-JEV.md:85 (acrescentar ao fim da segunda célula, "Aplicado", da linha C1; R10-A1 está aberto):
 ... O piso da perna 2 não tem tolerância contra a cotação do candidato: uma queda de 0,01% no ativo intermediário, ou 1 ponto base adverso só na perna 2, recusa a saída depois da perna 1 e deixa a posição presa até a reconciliação manual; cerca de 0,5% do ativo intermediário fica na carteira.
OKX-OPERADOR-JEV.md:86 (hoje o código trata `--realized` como opcional; texto verdadeiro AGORA):
| C3 (N3, N7) ledger e reconcile | `--init-ledger` recusa quando já há histórico (exige `--accept-history`); `--reconcile <planId> <closed\|failed>` sem `--realized` só troca o estado e a nota da perna e destrava o operador sem registrar resultado (as paradas não veem o plano); com `--realized <usd>` registra o resultado assinado, com gás. O valor aceito vai de -10000 a 10000 USD e o mesmo plano pode ser lançado de novo enquanto a perna ficar `failed` | `scripts/okx-operator.ts` |
 (depois de A-3 e A-4 trocar a segunda frase por: "`--realized <usd>` é obrigatório, aceita no máximo 2 vezes `OPERATOR_MAX_PLAN_USD` em valor absoluto e registra o resultado uma única vez por plano"; usage okx-operator.ts:85 e .env.example:92-93 já dizem assim)
OKX-OPERADOR-JEV.md:87 (verdadeiro só no mesmo ambiente):
| C4 (N5) gates | `OPERATOR_LIVE_ACK` vazio vale como ausente; `OPERATOR_PRIVATE_KEY` igual à `PRIVATE_KEY` do trader é recusada somente quando as duas estão no mesmo ambiente (no modo `--env-file=.env.operator` que o guia manda usar a `PRIVATE_KEY` do trader não existe e nada é comparado; confirme você mesmo que a chave é de uma carteira dedicada); o script `okx:operator` roda com `--no-env-file` | `config.ts`, `package.json` |
OKX-OPERADOR-JEV.md:122 (com `--no-env-file` o comando escrito só funciona com as variáveis exportadas no shell; trocar por): bun --no-env-file --env-file=.env.operator run scripts/okx-operator.ts --live --jev --loop
OKX-OPERADOR-JEV.md:26: - EVM: `OPERATOR_PRIVATE_KEY` de uma carteira dedicada ao operador (nunca a `PRIVATE_KEY` do trader), com saldo limitado ao capital aceito para perda; o endereço derivado dela deve ser igual a `OPERATOR_ADDRESS`, o que é verificado antes de cada envio.
OKX-OPERADOR-JEV.md:27: - Solana: `SOLANA_PRIVATE_KEY` (base58) e `OPERATOR_RPC_501` só alimentam o signatário de `src/okx-wallet/solana-signer.ts` (ed25519 com `node:crypto`, usado em testes); a execução Solana está desligada no executor (`SOLANA_LIVE_ENABLED=false`) até existir política de transação.
OKX-OPERADOR-JEV.md:51 (de "execução EVM via ethers e Solana" até o fim da linha): execução EVM via ethers, só quando `OPERATOR_EXECUTE=true`, `OPERATOR_LIVE_ACK=OWN_FUNDS_RISK_OPERATOR`, `OPERATOR_PRIVATE_KEY`, o modelo real (`--jev`), um ledger criado e, por chainIndex, `OPERATOR_RPC_` e as allowlists `OPERATOR_ROUTER_`, `OPERATOR_SPENDER_` e `OPERATOR_SELECTORS_` existem; `DRY_RUN`, `LIVE_ACK` e `PRIVATE_KEY` do trader não são consultados e a execução Solana está desligada. O executor conduz as duas pernas: approve de valor exato, com calldata local, para o spender que a OKX informa e que precisa estar na allowlist (nunca `signatureData` remoto), perna 1, recibo, perna 2 com o mínimo garantido da perna 1, recibo.
OKX-OPERADOR-JEV.md:52 e .env.example:52: trocar "20 USD e 4 planos por dia" por "20 USD de notional por dia contando as duas pernas (até 2 planos de 5 USD) e no máximo 4 planos por dia" (executor.ts:164 e :230 contam sizeUsd*2).
OKX-OPERADOR-JEV.md:53: incluir `reconciliation_required` na lista de estados (ledger.ts:25) e dizer que ele, como `failed`, bloqueia todo plano (ledger.ts:161-162).
AUDITORIA-OBJETIVOS.md:27 (FALSO) substituir por:
6. **Reconciliação manual com diagnóstico por saldo**: depois de um plano concluído o ciclo relê o inventário e informa a variação observada só como diagnóstico (`observedBalanceDeltaUsd`), sem atribuí-la ao plano; o resultado realizado fica desconhecido e o operador fica bloqueado até `--reconcile <planId> <closed|failed> --realized <usd>`, que alimenta as paradas diária, semanal e de drawdown.
README.md:65: "stops on daily, weekly and drawdown losses" -> "stops on daily, weekly and drawdown losses, fed only by the result you record with `--reconcile <planId> <closed|failed> --realized <usd>` (each completed plan blocks the operator until you reconcile it)".
.env.example:79: comentar `SOLANA_PRIVATE_KEY=` (a execução Solana está desligada; R8 F1 já pedia).
R7-okx-agentic-wallet.md:196-199: nota dizendo que os gates são OPERATOR_EXECUTE, OPERATOR_LIVE_ACK e OPERATOR_PRIVATE_KEY (não DRY_RUN, LIVE_ACK e PRIVATE_KEY do trader) e que o signatário Solana "integrado" só existe em testes.
VALUATION-DIAGNOSTICS-SPEC.md:3: "O módulo descrito abaixo ainda não foi implementado." -> "O módulo foi implementado em src/okx-wallet/valuation-diagnostics.ts (testes T01 a T11); não tem consumidor em produção por desenho."
OPERATOR-CLI-LOCK-SPEC.md:3 e :33-35, OPERATOR-PERSISTENCE-SPEC.md:3: "Status: implementado e integrado (CLI lock: 2e704c7, main f626a30; persistência: 703c626, main ff37327); os parágrafos de proposta e de checkpoint abaixo são históricos."
```
Outras divergências: CAPITAL-BOUNDARY-AUDIT.md (okx-portfolio-v1) já descreve o comportamento correto (cycle.ts:185-196, ledger.ts:159-163) e contradiz OKX-OPERADOR-JEV.md:55. ROUNDTRIP-AMOUNT-SPEC ("não escalar proporcionalmente") contradiz a correção C1 já em código (executor.ts:88-92, :269).

## 9. Pendências por classe
### A (implementável agora, sem dono, chave, serviço externo ou dinheiro; ordem de valor; nenhuma toca `operatorLiveGate`, `executePlan` ou `checkBeforeExecute`)
| ID | Menor passo e arquivos | Teste de aceitação |
| --- | --- | --- |
| A-1 | `.gitignore`: acrescentar `.env.*` e `!.env.example` (hoje `.env.operator`, onde o guia manda pôr a chave, NÃO é ignorado: `git check-ignore` não casa; só `.env` e `data/`) | `git check-ignore -q .env.operator` sai 0 e `git check-ignore -q .env.example` sai 1; `git ls-files` ainda lista .env.example |
| A-2 | Textos da seção 8 (OKX-OPERADOR-JEV.md, AUDITORIA-OBJETIVOS.md, README.md, .env.example, R7, cabeçalhos de 3 specs) | grep sem as frases antigas; grep por bytes (E2 80 94, E2 80 93 e C2 B7) nos arquivos alterados sem ocorrência; não há teste de tipografia para docs (o D24 de src/onchainos/isolation.test.ts só cobre aquela entrega) |
| A-3 | M1: em okx-operator.ts:152-170 exigir `--realized` (UsageError se ausente; a exceção "perna que já tem resultado lançado" só existe depois de A-4); apagar o ramo :162-166; ajustar o teste :87-100, que hoje fixa o comportamento oposto, e o usage :85. Reverte 4007541 | `--reconcile fixture-plan closed` sem `--realized`: código 1, stderr cita `--realized`, ledger igual byte a byte, lock liberado; com `--realized -0.25` o teste :153 continua |
| A-4 | M2: ledger.ts novo `reconcileLeg(planId, status, realizedUsd, nowMs, note)` com UMA escrita, campo opcional `realizedUsd` na perna validado em `parseLedger`, recusa de segundo valor diferente; okx-operator.ts:154-169 chama o método; limite `abs(valor) <= 2 x operator.policy.maxPlanUsd` no lugar de 10000 (o capital por plano é no máximo maxPlanUsd, teto duro 100; o dobro cobre gás e as duas pernas) | `--realized 42` com plano máx 5: código 1 e ledger igual; `failed --realized -1.5` duas vezes: segunda recusa e dia = -1.5; persist injetado é chamado 1 vez por reconcile; `closed` depois de `failed --realized` sem valor novo passa |
| A-5 | C6: extrair ledger.ts:244-267 para `replaceFileBounded(tmp, path, options)` (ledgerFilePersister passa a chamá-lo); cycle.ts:219-227 recebe `options` opcional e usa o helper; gravar o journal ANTES de trocar o estado | novo cycle.persist.test.ts: rename com EPERM 2x em `platform:"win32"` dá 3 tentativas, esperas [10,20], latest.json novo e 1 linha no journal; falha persistente lança após 4 e latest.json antigo fica intacto; linux lança na 1ª |
| A-6 | C7: só testes para os sobreviventes de R10 | R03 `scaleExpectedOut("1001","999","1000")` = "999"; R06 `exitWindowMs: 1` com `now()` que avança 2 ms a cada chamada ainda completa a perna 2 (prazo = max(plano, agora+janela), executor.ts:256); R07 janela 60000 com o recibo do approve1 (hash 0x1) avançando o relógio além do TTL bloqueia a perna 1 com `plan_expired_before_leg1`; R13 chave "0x"+"ab"x32 contra PRIVATE_KEY "0x"+"AB"x32 recusada; R16 `validateOperatorPolicy` com exitWindowMs -1 e 1.5 lança; R17/R18 CLI com journal e sem ledger: `--init-ledger` sai 1 citando `--accept-history`, com a flag sai 0 e cria; R33/R34 plano com operatorExecute=false e com operatorLiveAck=false é `qualified_dry_run`; M29 `encodeApprove(SPENDER, (2n**256n).toString())` lança e `2n**256n-1n` não |
| A-7 | C4: helper puro que deriva o endereço de `OPERATOR_PRIVATE_KEY` e de `config.privateKey` do trader (ethers local, sem rede) e recusa igualdade, chamado em okx-operator.ts:212. Valor baixo: só cobre o mesmo ambiente | chaves sintéticas "11"x32 contra "11"x32 recusa, contra "22"x32 passa |
| A-8 | Runbook (R10-B2, N16) no guia: se aparecer "Operator lock present", abra o LOCK, leia o pid, confira com `tasklist /FI "PID eq <pid>"`; processo inexistente (queda, console fechado, kill) => apague o LOCK à mão, nunca com processo vivo; depois confira o ledger e rode `--reconcile` se houver perna aberta | leitura; o texto cita só comandos que existem |
| A-9 | R10-B3: `--realized` sem `--reconcile` e `--accept-history` sem `--init-ledger` viram UsageError; `number()` de config.ts:61-67 ganha opção inteira para PLAN_TTL, EXIT_WINDOW, STALE_LEG, MAX_QUOTE_AGE, COOLDOWN, MAX_GAS_LIMIT, MAX_DAILY_PLANS | CLI sai 1 nos dois casos; `loadOperatorConfig({OPERATOR_EXIT_WINDOW_MS:"1.5"})` lança "Invalid OPERATOR_EXIT_WINDOW_MS" |
| A-10 | N15: `killSwitchExists` (okx-operator.ts:173) trata qualquer erro diferente de ENOENT como STOP presente (helper com stat injetável) | ENOENT => false; existente, EACCES e EPERM => true |
| A-11 | N12: `parseLedger` (ledger.ts:96-121) rejeita contagens e notional negativos ou fracionários e planId duplicado | ledger.test.ts:31 estendido com `dailyPlans:{d:-1}`, `1.5`, planId repetido |
| A-12 | N17: http.ts:66 compara o token em tempo constante | http.test.ts:13 com token errado de mesmo tamanho => 401 |
| A-13 | scripts/okx-operator.test.ts:34 filho de 10 s para 45 s e 120 s por teste, como 0f8afc1 fez nos CLIs irmãos | 8 testes passam sob carga |
| A-14 | `OPERATOR_DECISION_TIMEOUT_MS` (padrão 10000, 1 a 30000) em config.ts e repassado em okx-operator.ts:233 | padrão 10000; "0" e "30001" lançam |
| A-15 | R8 F1 ainda aberto: comentar `SOLANA_PRIVATE_KEY=` em .env.example:79 (a execução Solana está desligada e a chave não é lida por ninguém em produção, config.ts:115 só a valida) | `loadOperatorConfig` com o exemplo descomentado sem a linha carrega sem erro; grep não acha a linha ativa |
| A-16 | TOCA GATE (aperta; só com revisão distinta): N13 teto de gás aplicado ao valor enviado (executor.ts:116 contra :221, 1,5x); N14 checar RPC antes de `recordExecution` (:230); N24 uma só escrita final da perna concluída (executor.ts:282 e cycle.ts:186) | N13 `gas` 700000 com teto 1000000 (enviado 1050000) bloqueia; N14 sem RPC bloqueia sem consumir o plano; N24 persist injetado vê 1 escrita |
| A-17 | Fora do cluster: mesmo `renameSync` sem retry em scripts/system-one.ts:123, src/jev-read/store.ts:50, src/lab/journal.ts:512 e src/onchainos/capture.ts:75; reutilizar o helper de A-5 | idem A-5 por arquivo |
### B (decisão do dono; alternativas e recomendação)
B-1 D1 política do repo (OPERACAO-BRASIL.md:43): operador como exceção com gates próprios, ou herda o bloqueio até revisão independente + D11. Recomendo herdar o bloqueio e registrar que `OPERATOR_EXECUTE` só abre com os 4 itens de D11.
B-2 D2/C9 STOP e prazo no meio do plano: parar tudo (hoje) ou parar entradas e permitir desfazer com janela própria (`OPERATOR_EXIT_WINDOW_MS`, padrão 0). Recomendo janela de 60000 e STOP bloqueando só approve1 e perna 1.
B-3 D3 (a): `GET /` do trader devolve `wallet` com CORS `*` (server.ts:12, :61): remover o campo ou restringir a origem. Recomendo remover.
B-4 D3 (b): `/operator*` público por desenho (bind 127.0.0.1 e CORS) ou privado (proxy do Next com token). Recomendo bind 127.0.0.1 já e proxy com token em qualquer deploy. A checagem de Host e o rate limit de C6 dependem desta decisão (num proxy autenticado o Host muda).
B-5 D6 tetos duros de semanal, drawdown, fee e custo por tx (hoje sem teto). Recomendo usar o perfil standard (15 e 30 USD) como teto.
B-6 D4 carteira dedicada: teto de patrimônio, chave só em `.env.operator` (A-1) com `OPERATOR_PRIVATE_KEY` e o ack saindo do `.env.example` compartilhado (.env.example:68-70) para um `.env.operator.example`, quem cria o STOP. Recomendo recusar live acima de 100 USD no estágio 3 e mover o template.
B-7 D5 autonomia: manter um plano por intervenção (reconcile manual) ou reconciliação on-chain antes. Recomendo manter manual no estágio 3. D7 origem de routers e spenders: conferência no explorer (hoje) ou codehash fixado (rede). Recomendo explorer agora.
B-8 D8 rotação do journal e separação sintético/live (sintético grava em data/operator, okx-operator.ts:239): rotação para `.1` abaixo dos 8 MiB do handler, como src/jev-read/store.ts:58-69, e pastas distintas. Recomendo ambas.
B-9 A1/N1 perna 2: orçamento de perda por plano com `plan.maxLossUsd` (plan.ts:60, hoje ignorado), tolerância em pontos base, ou nova cotação e venda do saldo recebido (saldo por RPC). Recomendo o orçamento mais pré-verificação da perna 2 antes de qualquer envio.
B-10 ROUNDTRIP: adotar a spec (requote da perna 2 pelo mínimo, economia no pior caso, racionais) ou aceitar a mitigação proporcional com perda limitada. Recomendo quote-first com requote e perda máxima limitada, sem exigir pior caso não negativo (com 0,5% de slippage por perna exigiria edge acima de 1%).
B-11 C2: decodificar `uniswapV3SwapToWithBaseRequest` e `unxswapToWithBaseRequest` (ABI okxlabs commit 1fc1508, ROUTER-PROOF-RESEARCH) e excluir rotas opacas, ou simular variação de saldo. Recomendo decodificar.
B-12 M1 variante: `--realized` obrigatório ou flag explícita de resultado desconhecido que mantém o bloqueio. Recomendo obrigatório (A-3).
B-13 perfil micro 5% contra 1% de R3. B-14 N11: manter ou retirar o diagnóstico `observedBalanceDeltaUsd` (nulo no CLI real).
### C (bloqueada por chave, rede, dinheiro ou live)
C-1 C8 teste autenticado de menor valor (unidades, `minReceiveAmount`, `dexContractAddress`) antes de `OPERATOR_TRUST_QUOTE_UNITS`. C-2 C9 medição em shadow de latência e pesos do Jev contra 10 s. C-3 C3 saldo por RPC no reconcile. C-4 C2/R6 bytecode e implementação dos routers. C-5 R1 eco de slippage exige resposta real. C-6 CI no GitHub (exige push) e reconciliação on-chain automática. C-7 o estágio 3 em si (D11).
### D (obsoleto ou superado)
D-1 cabeçalhos "Proposed/Draft" e parágrafos de checkpoint das 3 specs, CYCLE-*.json e checkpoints: implementados por 2e704c7, 703c626, dd1ae31. D-2 R4 #1 a #6, K1 a K3 e itens de R5 fechados por 12d081c, 9fd6f39, 8f08132 (seção 7). D-3 N22 (soma que estoura lança) é contrato. D-4 R8 M37, M52, R32 e R10-B4 (guarda por nome) equivalentes. D-5 falha parcial de `acquireLock`: sem evidência.

## 10. Trabalho solto que NÃO está em 8d0611a
Comparação por caminho e sha256 curto (10 hex; SAME, CRLF_ONLY, CONTENT_DIFF, MISSING) de todos os arquivos sujos de 6 worktrees e do checkout primário contra a integ: `compare-norm.tsv` (310 linhas) nesta pasta; as diferenças de CRLF vêm da cópia de trabalho em Windows e não alteram conteúdo.
| Origem | Item (sha curto) | Destino |
| --- | --- | --- |
| docs/r10-operator-rereview 1dfef8a | R10 (1 arquivo, 104 linhas); o coordenador já o mesclou em final/consolidation 309fcf5 | entrar; evidência (probes, 96 mutações) em jev-trader-archive-20261010\r10-evidencia fica arquivada |
| .codex\worktrees\inonu-operator-c4-research-20261011 (pasta comum, não worktree git) | operator-second-leg-amount-research.md 056d280d61 (citado em ROUNDTRIP-AMOUNT-SPEC:7), persistence-experiment.md 28daee20fb, persistence-production-probe.md 35a6259b7d, c4-research.md 531288ed77, full-suite-failure-research.md e2704c4e29, pasta operator-second-leg-20261011-d113f5f-v2 (run-receipt 30a8db03, probe-result f68a8e26) | arquivar; o de segunda perna entra em docs/research se o ROUNDTRIP seguir (B-10) |
| .codex\worktrees\inonu-system-one-review-spec/standards-20261011 | 14 pareceres .md e 19 resultados .json intermediários de persistência e model boundary (persistence-integration-review.md eec6a4ec0e e operator-getter-standards-review.md 539211bb8e são citados por checkpoints); os finais já estão em docs/ | arquivar, não entrar |
| checkout primário (055a637) | package.json modificado: `okx:operator` SEM `--no-env-file` (regressão de C4); AGENTS.md e undefined/contract | descartar |
| checkout primário | src/portfolio-evidence (28 arquivos) e docs/portfolio-evidence-v1 (3), sem equivalente na integ; fora do cluster, aguarda a sessão de limpeza | decisão do cluster carteira |
| inonu-system-one-safety (98), okx-real-integration, gev-wallet-pilot(-ui), checkout primário | todo arquivo do cluster (OPERATOR-*, CENTRAL-JEV-OPERATOR-*, LEDGER-*, WALLET-*, okx-portfolio-v1, valuation-diagnostics) está na integ, idêntico ou só com CRLF; os package.json desses worktrees também trazem o `okx:operator` regredido | nada; descartar os package.json |

## 11. Segurança e gates
Nenhum gate de execução foi alterado e nenhuma proposta liga execução. Com os padrões, sem env: execute false, ack ausente, sem chave, TRUST falso, Solana desligada (config.ts:165-172, executor.ts:21), sem caminho de perda de fundos. Riscos vivos: (1) `.env.operator` não ignorado pelo git (A-1); (2) gate de reconcile enfraquecido (M1) e sem faixa nem trava de duplo lançamento (M2), reproduzidos; (3) posição presa na perna 2 por construção (seleção adversa, A1); (4) C2 sem decodificação; (5) `/operator*` em 0.0.0.0 com CORS `*` e `GET /` expondo a carteira do trader (server.ts:12, :61); (6) `persistCycle` sem retry; (7) OPERATOR_PRIVATE_KEY e SOLANA_PRIVATE_KEY no template compartilhado (.env.example:70, :79).
