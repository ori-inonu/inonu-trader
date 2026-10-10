# Qualificação para execução real em Kuru/Monad

Redigido em 2026-10-10 sobre o commit `62b6453` (v0.0.2). Este documento é a especificação do pacote de qualificação; o verificador (`src/live-qualification.ts` e `scripts/qualify-live.ts`) e seus testes seguem o que está escrito aqui.

## 0. Avisos que não mudam

- Este pacote **não habilita** execução real. O bloqueio em `Market.init()` (`src/market.ts`) e a exigência de `LIVE_ACK` em `src/config.ts` continuam exatamente como estavam. Nada neste pacote os remove, enfraquece ou contorna.
- O verificador **não envia, não assina, não aprova e não deposita nada**. Não usa rede nem RPC. Ele só lê a configuração, dois arquivos JSON locais opcionais e, para conferir hashes, arquivos locais citados no manifesto.
- `readyForOwnerReview=true` significa apenas que **a checklist está completa**. Não é autorização, não é permissão para operar e não substitui a decisão do dono. O bloqueio do código é separado e só um commit revisado do dono o levanta (seção 12).
- **O agente/assistente nunca preenche o registro de autorização, nunca fornece chaves e nunca executa uma sessão live.** O dono dos fundos preenche e assina o registro por conta própria, fora de qualquer sessão do assistente. O assistente também não deve receber `PRIVATE_KEY` no ambiente.
- Nenhum item aqui afirma lucratividade. A sessão limitada do Estágio 3 é uma qualificação técnica, com custo esperado (gas) e perda possível.

## 1. O que este pacote é e o que não é

É uma lista objetiva do que precisa ser verdade e estar evidenciado antes de o dono decidir, por conta própria, levantar o bloqueio. Torna visível cada item que falta: item sem evidência fica `unknown`, item com evidência que não satisfaz fica `unmet`, e só evidência explícita e válida produz `met`.

Não é: um certificado, um parecer de segurança, uma garantia de ausência de bugs, uma estimativa de retorno nem um substituto da revisão independente.

Termos: **gate** é o bloqueio no código. **Dono** é o humano titular dos fundos. **Operador** é quem roda os comandos (normalmente o dono). **Manifesto** é `data/live-evidence.json`. **Registro** é `data/live-authorization.json`.

## 2. Estágio 0: estado atual

| Aspecto | Estado em `62b6453` |
| --- | --- |
| Gate em `Market.init()` | Ligado: com carteira, `init()` lança "Live execution is not qualified..." antes de qualquer RPC |
| Modo padrão | Paper (`DRY_RUN=true`), `AUTO_DEPOSIT=false`, sem `PRIVATE_KEY` |
| Jev | Chave configurada na máquina do dono; sessão observada teve 3 decisões `hold` e nenhum fill (`docs/JEV-WINDOWS.md`). Não é soak |
| Resultado em paper | Três capturas curtas com `mock` (`docs/RISCO-E-BACKTEST.md`). Não há evidência de lucro |
| Operação 24 h | Nunca executada |
| Autorização financeira | Inexistente |
| Revisão independente | Não realizada para este candidato (`docs/RELEASE-v0.0.2.md`) |
| Testes | A referência do release é 502 aprovados. Ao rodar a suíte em um worktree em 2026-10-10, `src/market.receipt.test.ts` e `src/trader.receipt.test.ts` não carregaram porque apontam para o caminho absoluto `C:/Users/gabri/jev-trader-release-v0.0.2-receipt-safety`, que não existe mais: 484 aprovados e 2 arquivos com erro de carregamento (18 testes de recibo não rodaram). É problema de ambiente, anterior a este pacote, e precisa ser corrigido em mudança separada |

- **Entrada:** nenhuma. **Evidências exigidas:** nenhuma. **Abortar ou reverter:** não se aplica, nada está ao vivo. **Kill switch:** o próprio bloqueio de `Market.init()`, que permanece ligado. **Quem decide:** o dono, ao optar por iniciar o Estágio 1.
- **Leitura do verificador neste estado:** tudo que depende de registro, manifesto ou estágios sai `unknown`; os itens do modo live saem `unmet` (por exemplo `config.live-requested`, `config.model-jev`, `config.signer-key-present`); só dois fatos da configuração padrão saem `met`: o instantâneo é válido (`config.snapshot-valid`) e `AUTO_DEPOSIT=false` (`config.auto-deposit-off`). `readyForOwnerReview` é `false`.

## 3. Mapa: condição de gate no código para a evidência que a satisfaz

| Condição no código | Onde | Itens do verificador que a evidenciam |
| --- | --- | --- |
| `if (this.wallet) throw new Error("Live execution is not qualified: ...")`, primeira instrução de `Market.init()`. `wallet` só existe com `DRY_RUN=false` | `src/market.ts` | Gate separado e inalterado. Só o commit da seção 12 o muda. Não é item da checklist |
| Mensagem do gate: "reconcile existing orders" | `src/market.ts` | `reconciliation.existing-orders` |
| Mensagem do gate: "wallet/margin balances" | `src/market.ts` | `reconciliation.balances`, `stage2.margin-and-vault-read`, `stage2.nonce-unchanged`, `stage2.gas-estimated` |
| Mensagem do gate: "restart capital baseline" | `src/market.ts` | `reconciliation.restart-baseline` |
| `DRY_RUN=false` explícito | `src/config.ts` (`bool("DRY_RUN", true)`) | `config.live-requested` |
| `!privateKey` ou formato fora de `/^0x[0-9a-fA-F]{64}$/` | `src/config.ts` | `config.signer-key-present`, `authorization.wallet-matches-signer`, `stage2.rehearsal-wallet` |
| `model !== "jev"` | `src/config.ts` | `config.model-jev`, `config.model-id-pinned`, `stage1.soak-real-jev`, `authorization.model-matches-config` |
| `MODEL=jev` sem `TYPESAFE_AI_API_KEY` | `src/config.ts` | `config.jev-key-present` |
| `env("LIVE_ACK") !== "OWN_FUNDS_RISK"` | `src/config.ts` | `config.live-ack`, `authorization.fields-valid` (texto de reconhecimento) |
| `tradeSizeMon > maxPositionMon`, `marginMon > maxPositionMon`, `priorityFeeGwei > maxFeeGwei` | `src/config.ts` | `config.snapshot-valid` |
| `if (config.autoDeposit) await this.ensureMargin()` (approve e depósitos na partida) | `src/market.ts` | `config.auto-deposit-off` |
| `resyncNonce()` e `initGasLimit()` | `src/market.ts` | `stage2.nonce-unchanged`, `stage2.gas-estimated` |
| `riskStop`: `session-loss`, `session-spend`, `unknown-receipt-gas`, `unknown-transaction`, `model-decision-timeout`, `unknown-inference-cost`, `cancel-failed`, `data-or-decision-error` | `src/trader.ts` | `stage1.soak-uninterrupted`, `stage1.costs-complete`, `authorization.tiny-caps`, `authorization.limits-within-config-caps`, `authorization.config-within-authorized-limits` |
| `pendingReceiptCosts.size > 0` bloqueia novas cotações | `src/trader.ts` (`riskStop`) | `stage1.pending-receipt-cadence`, `risk.pending-receipt-halts-quotes` |
| Replay recusa fill sem vínculo, custo desconhecido, recibo pendente e execução não resolvida | `src/backtest.ts` | `stage1.replay-reconciled` |
| Diário novo por sessão (`existsSync(config.journalPath)`) | `src/index.ts` | Procedimento dos estágios (seções 4 a 6) |

O que o código **não** faz hoje e que a mensagem do gate pressupõe: reconciliar ordens já abertas, saldos de carteira/margem e a base de capital no reinício. A `Trader` só conhece ordens que ela mesma viu em recibos, e o `SpotLedger` nasce de `BANKROLL_USD` e `MARGIN_MON`, não de saldos on-chain. Remover o `throw` sem tratar isso tornaria a mensagem falsa (lacunas G4 e G6, seção 14).

## 4. Estágio 1: soak em paper com leituras de RPC reais e Jev real

**Objetivo.** Observar o sistema inteiro, sem assinatura possível, por pelo menos 24 horas contínuas, com o modelo real e versão fixa, e medir o que hoje é desconhecido.

**Entrada.**
- Dono decidiu gastar crédito Jev na conta dele. Estimativa de teto, com `INFERENCE_BUDGET_TOKENS=2000` e US$ 0,042 por milhão de tokens de entrada: cerca de US$ 0,24 por dia com decisão a cada 100 blocos e cerca de US$ 24,19 por dia com decisão a cada bloco. A única medição disponível (3 respostas em `docs/JEV-WINDOWS.md`) indica cerca de 1,1 mil tokens por decisão. Fatura real não foi reconciliada.
- `DRY_RUN=true`, `MODEL=jev`, `JEV_MODEL_ID` com **versão exata** (por exemplo `jev-1.13.0`, nunca `jev-latest`), `AUTO_DEPOSIT=false`, **`PRIVATE_KEY` vazio** (nenhum signatário existe no Estágio 1).
- `JOURNAL_PATH` novo, em `data/`. Cada reinício exige arquivo novo.
- Perfil de cadência escolhido e anotado (seção 10).

**Procedimento (comandos do dono).**

```powershell
$env:DRY_RUN = 'true'; $env:MODEL = 'jev'; $env:JEV_MODEL_ID = 'jev-1.13.0'
$env:AUTO_DEPOSIT = 'false'; $env:PRIVATE_KEY = ''
$env:JOURNAL_PATH = 'data/soak-AAAAMMDD.jsonl'
bun run doctor
bun run start          # deixar rodando por 24 h ou mais; Ctrl+C encerra
bun run backtest --journal data/soak-AAAAMMDD.jsonl | Out-File -Encoding utf8 data/soak-AAAAMMDD.replay.json
Get-FileHash -Algorithm SHA256 data/soak-AAAAMMDD.jsonl, data/soak-AAAAMMDD.replay.json
```

`capture` limita cada sessão a 3600 s e cada sessão tem diário próprio, então não serve para uma janela de 24 h. O soak usa `start` em paper.

**O que medir e critérios de aprovação.** Limiares são **propostas** (política padrão do verificador, `DEFAULT_QUALIFICATION_POLICY`); o dono pode ajustá-los apenas em commit revisado.

| Medida | Como obter | Item | Critério proposto |
| --- | --- | --- | --- |
| Duração contínua | `result.durationMs` da saída do `backtest`, em horas | `stage1.soak-duration` | `paperSoakHours >= 24` |
| Sem parada travada | Log do console (`block N: ...`), totais do diário, ausência de `session-loss`/`session-spend` | `stage1.soak-uninterrupted` | `paperSoakLatchedStop = false`. Qualquer parada encerra a janela; reiniciar com diário novo zera a contagem |
| RPC real | `dataSource` do cabeçalho do diário | `stage1.soak-real-rpc` | `real-market-paper` |
| Jev real e versão exata | `model` do cabeçalho do diário | `stage1.soak-real-jev` | igual a `JEV_MODEL_ID` da configuração e diferente de `mock` |
| Latência de decisão vs. bloco de 300 ms | Contagem de decisões e percentis de `decision.latencyMs` nas linhas `kind=block` com `late=false` | `stage1.latency-distribution` | `decisionSampleCount >= 100` (com menos, p95 e p99 não descrevem nada: a única amostra real de Jev até aqui tem 3 respostas), p50 <= p95 <= p99 e p95 <= 300 ms no perfil `every-block`, p95 <= 1500 ms no perfil `gated` |
| Taxa de blocos atrasados | `totals.lateBlocks / totals.blocks` da última linha `block` | `stage1.late-block-rate` | `lateBlockRate <= 0.05` |
| Efeito do recibo pendente na cadência | Sonda somente leitura (abaixo) | `stage1.pending-receipt-cadence` | medido; `receiptLagBlocksP95` menor que o intervalo no perfil `gated`; `quoteBlockFraction >= 0.95` no perfil `every-block` |
| Replay reconciliado | `bun run backtest` devolve `ok: true` | `stage1.replay-reconciled` | `replayReconciled = true` e `paperSoakFillCount >= 1` |
| Custos completos | `totals.costsComplete = true` e `totals.unknownCosts` vazio na última linha | `stage1.costs-complete` | `noUnknownCosts = true` e totais de gas, Jev e taxa maker finitos |

Observações de medição:
- "Atrasado" (`late`) é todo bloco que chega com o laço anterior ainda ocupado: leitura do livro, poll de trades, decisão e envio. Não é só a latência do modelo. O tempo de laço (`loopMs`) só é impresso no console por `start`; **não é gravado no diário** (lacuna G1).
- O efeito do recibo pendente **não pode ser medido em paper**, pois paper não envia transações. A sonda do Estágio 1 mede, em leitura, quantos blocos depois da inclusão o RPC passa a devolver recibo para transações de **outras** contas no mesmo mercado (lacuna G2). É uma aproximação. A medição definitiva só ocorre no Estágio 3.
- Os fills do paper são simulados com prints que cruzam o preço, sem fila. O caminho de fills reais (`TradeFeed` com endereço maker) só roda no Estágio 3.
- `start` não grava nem expõe `Trader.stopReason` (só `capture` o grava, no resumo final). Paradas de risco (`session-loss`, `session-spend`) não imprimem nada. A declaração `paperSoakLatchedStop` depende, portanto, do log do console e dos totais do diário (lacuna G1).
- Com um mesmo RPC público há limite de requisições (o comentário de `scripts/bench-read.ts` cita 50 req/s). Qualquer erro de dado trava a sessão com `data-or-decision-error`.

**Arquivos de evidência (em `data/`, ignorados pelo Git).** `soak-AAAAMMDD.jsonl`, `soak-AAAAMMDD.replay.json`, resumo do console, `live-evidence.json` com os hashes SHA-256.

**Abortar quando.** Parada travada (`stopReason`), `costsComplete=false`, fill sem vínculo no replay, crédito Jev acima do que o dono aceitou, processo morto, ou qualquer segredo aparecendo em log. Reverter: encerrar o processo; não há ordem nem fundos envolvidos. Preservar os diários, inclusive os que falharam.

**Kill switch.** Ctrl+C no processo `bun`, ou `Stop-Process` pelo PID. Conferir que `PRIVATE_KEY` estava vazio.

**Quem decide.** Só o dono. Passar ao Estágio 2 exige os itens `stage1.*` em `met` e revisão humana dos arquivos citados.

## 5. Estágio 2: ensaio com signatário presente, sem enviar

**Objetivo.** Provar, só com leituras, que o endereço dedicado, o nonce, a estimativa de gas e o estado de margem e do vault são os esperados, sem emitir nenhuma transação.

**Entrada.** Estágio 1 aprovado; carteira operacional **dedicada** (nunca a carteira principal), financiada somente com o capital que o dono aceita arriscar mais gas; `PRIVATE_KEY` presente apenas no ambiente do verificador para derivar o endereço público. `DRY_RUN` permanece `true`, então `Market` nunca cria carteira.

**Procedimento.** As leituras usam só o endereço público (nada é assinado nem enviado): `eth_getTransactionCount` antes e depois, `eth_estimateGas` do `batchUpdate` post-only como em `initGasLimit`, `getBalance` da conta de margem para MON e USDC como em `marginBalance`, parâmetros do vault como em `readVaultParams`, e a consulta de ordens abertas do endereço no mercado (método a definir, lacuna G3). Assinar localmente com a chave real **não** faz parte do ensaio; o teste de calldata (`scripts/dry-encode.ts`) usa carteira descartável.

**Critérios de aprovação.**

| Item | Critério |
| --- | --- |
| `stage2.rehearsal-wallet` | endereço do ensaio igual ao do registro e ao derivado da chave configurada |
| `stage2.rehearsal-fresh` | ensaio feito há no máximo 24 h e não no futuro |
| `stage2.nonce-unchanged` | `rehearsalNonceBefore = rehearsalNonceAfter` (nenhuma transação saiu da carteira) |
| `stage2.gas-estimated` | `rehearsalGasLimit` inteiro positivo, registrado (Monad cobra sobre o limite) |
| `stage2.margin-and-vault-read` | saldos de margem MON e USDC finitos e `rehearsalVaultStateRead = true` |
| `stage2.wallet-dedicated` | o dono declara que a carteira só tem o capital autorizado e gas |
| `reconciliation.existing-orders` | `existingOrdersReconciled = true` e `openOrdersAtStart = 0` |
| `reconciliation.balances` | `balancesReconciled = true` |
| `reconciliation.restart-baseline` | `restartBaselineReconciled = true` (saldos on-chain batem com `BANKROLL_USD` e `MARGIN_MON` da base do `SpotLedger`) |

**Arquivos de evidência (em `data/`).** `rehearsal-AAAAMMDD.json` com o resultado das leituras (nonce antes e depois, limite de gas, saldos de margem, estado do vault, ordens abertas) e seu SHA-256, e a atualização de `live-evidence.json`.

**Abortar quando.** O nonce mudou (trate como incidente: a chave pode estar comprometida; abandone a carteira), qualquer método de escrita aparecer nas chamadas, saldos divergirem do esperado, ou a carteira não for dedicada.

**Kill switch.** Fechar o shell do ensaio. Nada foi enviado, então não há ordem a cancelar.

**Quem decide.** Só o dono.

## 6. Estágio 3: execução real limitada

Só começa **depois** do commit que levanta o bloqueio (seção 12), que só existe depois da assinatura do registro e da revisão independente. Este documento descreve o estágio; o assistente não o executa.

**Entrada.**
1. `qualify-live` com a configuração candidata a live devolve `readyForOwnerReview=true` (isso não é autorização).
2. Registro assinado (seção 7), válido e dentro da validade, com limites **iguais** aos da configuração.
3. Itens `stage3.*` em `met`: `stage3.kill-switch-drilled`, `stage3.emergency-cancel-drilled` (parar o processo **não** remove ordens que já estão no livro; é preciso um caminho testado para cancelá-las, lacuna G5) e `stage3.independent-review`.
4. Diário novo, `AUTO_DEPOSIT=false` e margem financiada manualmente, com os saldos anotados antes e depois da sessão.

**Arquivos de evidência exigidos antes (em `data/`).** `live-authorization.json` (assinado pelo dono), `live-evidence.json` completo, `soak-AAAAMMDD.jsonl` e `.replay.json`, `rehearsal-AAAAMMDD.json` e `review-AAAAMMDD.md` (relatório da revisão independente), todos com SHA-256 conferido pelo verificador.

**Limites.** Os do registro: perda máxima e gasto máximo em USD, tamanho da ordem e posição máxima em MON, fração máxima do capital, duração em minutos, modelo exato, validade. Valores de referência da política do verificador (não são recomendação de investimento): perda e gasto até 5% da banca, sessão de até 60 minutos, registro válido por até 168 horas.

**Durante.** Observar o console e o painel. Cada `AmbiguousBroadcastError`, recibo `lost`, `cancel-failed` ou `unknown-transaction` trava a sessão e exige reconciliação on-chain antes de qualquer nova sessão.

**Abortar quando (qualquer um).** Perda ou gasto no limite (a latch para o robô); parada travada de qualquer motivo; execução desconhecida; fill sem vínculo; saldo on-chain diferente do livro-razão do diário; registro expirado ou duração esgotada; qualquer divergência com o que o dono autorizou; decisão manual do dono a qualquer momento. O código atual **não impõe** duração nem expiração (lacuna G6); o dono encerra manualmente no prazo ou o commit da seção 12 inclui um prazo rígido.

**Kill switch (nesta ordem).**
1. Ctrl+C no processo (para novas ordens; **não** cancela as que já estão no livro).
2. Executar o cancelamento de emergência já ensaiado e conferir no explorador que não há ordens abertas.
3. Retirar o saldo restante da margem para a carteira principal do dono.
4. Reaplicar o bloqueio: reverter o commit de levantamento (`git revert`) e remover `PRIVATE_KEY` do ambiente.

**Evidência pós-sessão.** Diário da sessão, hashes, conciliação manual contra o explorador (transações, fills, gas), saldos antes e depois, e relatório do dono. Só essa reconciliação mede, pela primeira vez, o efeito real do recibo pendente e a confirmação no mesmo bloco.

**Quem decide.** Só o dono: iniciar, continuar, abortar e encerrar. Uma sessão não autoriza a seguinte.

## 7. Registro de autorização

O dono preenche e assina por conta própria. O assistente **nunca** o preenche, nunca fornece chaves e nunca roda sessão live. O código só verifica forma e coerência; ele não prova autoria humana. Por isso o campo `authorizationSigned` do manifesto é a declaração do dono de que assinou a versão impressa ou arquivada fora do repositório.

Arquivo: `data/live-authorization.json` (ignorado pelo Git). O modelo abaixo **falha de propósito** na validação enquanto houver `null` ou texto vazio.

### Modelo do registro (JSON)

```json
{
  "schemaVersion": 1,
  "owner": "",
  "date": "",
  "walletAddress": "",
  "maxLossUsd": null,
  "maxSpendUsd": null,
  "tradeSizeMon": null,
  "maxPositionMon": null,
  "maxCapitalFraction": null,
  "sessionDurationMinutes": null,
  "allowedModelId": "",
  "expiry": "",
  "acknowledgement": ""
}
```

Regras estritas de validação:
- Todos os campos acima presentes e nenhum campo desconhecido.
- `owner`: nome do dono, texto não vazio. `date` e `expiry`: data e hora ISO 8601 com fuso (`2026-10-11T14:30:00Z`). `date` não pode estar no futuro (tolerância de 5 minutos), `expiry` precisa ser posterior a `date`, estar no futuro e distar no máximo 168 horas de `date`.
- `walletAddress`: `0x` mais 40 hexadecimais, diferente do endereço zero, igual ao derivado de `PRIVATE_KEY` e ao do ensaio.
- `maxLossUsd`, `maxSpendUsd`, `tradeSizeMon`, `maxPositionMon`: números finitos maiores que zero; `tradeSizeMon <= maxPositionMon`. `maxCapitalFraction`: maior que 0 e até 1. `sessionDurationMinutes`: positivo e até 60.
- Limites **não maiores** que os da configuração e, no sentido inverso, a configuração não pode permitir mais do que o registro autoriza (na prática, valores iguais). Perda e gasto até 5% da banca.
- `allowedModelId`: igual a `JEV_MODEL_ID`, versão exata (não `jev-latest`).
- `acknowledgement`: texto próprio do dono, com pelo menos 40 caracteres, contendo o termo `OWN_FUNDS_RISK` (o mesmo termo de `LIVE_ACK`). Exemplo de redação, a ser reescrito pelo dono: "OWN_FUNDS_RISK: assumo a perda possível dos fundos autorizados e sei que o código não garante limite de perda."

Antes de assinar, o dono confere: banca separada do patrimônio principal, perda que aceita ver, validade curta, e que ninguém além dele definiu os números.

## 8. Manifesto de evidências

Arquivo: `data/live-evidence.json` (ignorado pelo Git), preenchido pelo operador. Valores ausentes ou `null` contam como **sem evidência** (`unknown`). Valor presente e inválido, ou que não satisfaz o critério, conta como `unmet`. Campos desconhecidos tornam o manifesto inválido.

### Modelo do manifesto (JSON)

```json
{
  "schemaVersion": 1,
  "paperSoakHours": null,
  "paperSoakDataSource": null,
  "paperSoakModelId": null,
  "paperSoakLatchedStop": null,
  "paperSoakFillCount": null,
  "decisionSampleCount": null,
  "decisionLatencyP50Ms": null,
  "decisionLatencyP95Ms": null,
  "decisionLatencyP99Ms": null,
  "lateBlockRate": null,
  "pendingReceiptCadenceMeasured": null,
  "receiptLagBlocksP95": null,
  "quoteBlockFraction": null,
  "replayReconciled": null,
  "noUnknownCosts": null,
  "soakGasUsd": null,
  "soakJevUsd": null,
  "soakMakerFeeUsd": null,
  "rehearsalAt": null,
  "rehearsalWalletAddress": null,
  "rehearsalNonceBefore": null,
  "rehearsalNonceAfter": null,
  "rehearsalGasLimit": null,
  "rehearsalMarginMon": null,
  "rehearsalMarginUsdc": null,
  "rehearsalVaultStateRead": null,
  "rehearsalWalletDedicated": null,
  "existingOrdersReconciled": null,
  "openOrdersAtStart": null,
  "balancesReconciled": null,
  "restartBaselineReconciled": null,
  "killSwitchDrilled": null,
  "emergencyCancelDrilled": null,
  "independentReviewDone": null,
  "authorizationSigned": null,
  "acknowledgedRisks": [],
  "artifacts": {
    "paperSoakJournal": null,
    "replayOutput": null,
    "rehearsalOutput": null,
    "independentReviewReport": null
  }
}
```

Cada artefato é `{ "path": "soak-AAAAMMDD.jsonl", "sha256": "<64 hexadecimais>" }`, com caminho relativo a `data/`, sem `..` e sem caminho absoluto. O CLI confere se o arquivo existe, se é arquivo regular e se o SHA-256 bate; o item `evidence.artifacts-verified` só fica `met` com os quatro artefatos declarados e conferidos. Os números do manifesto são **declarações do operador**: o verificador não as recalcula a partir do diário (lacuna G7). O revisor humano compara a declaração com o artefato.

## 9. Riscos abertos conhecidos

Vêm de `docs/RELEASE-v0.0.2.md` e ficam abertos mesmo com a checklist completa. O manifesto precisa listar o id em `acknowledgedRisks` para o item `risk.*` correspondente ficar `met`; reconhecer não remove o risco.

| Id | Risco | Origem | O que o cobre |
| --- | --- | --- | --- |
| `pending-receipt-halts-quotes` | Cotação enviada com recibo pendente bloqueia novas cotações até o recibo aparecer; efeito na cadência nunca medido em RPC real | Release, limitações | `stage1.pending-receipt-cadence` (aproximação) e medição real no Estágio 3 |
| `no-quote-provenance` | O tipo `Quote` de produção não carrega proveniência; fixtures de recibo só exercitam passagem direta | Release, limitações | Reconhecimento; correção exige mudança de código revisada (G8) |
| `unlinked-fill-recorded-journal` | O diário readiness gravado tem um fill sem vínculo, preservado e não reparado; replay dele não é dado como passando | Release, limitações | `stage1.replay-reconciled` com diário **novo**; o antigo não vale como evidência |
| `soak-24h-never-run` | Operação de 24 h nunca foi executada | Release, tabela de capacidades | `stage1.soak-duration` cobre o paper; operação live prolongada continua não qualificada |
| `same-block-confirmation-unqualified` | Confirmação estrita no mesmo bloco depende da semântica de cabeça de bloco da Monad e do tempo real de recibo, nunca observados | Release, contrato em aberto | `stage1.latency-distribution`, `stage1.late-block-rate` e medição real no Estágio 3 |
| `profitability-unproven` | Lucratividade não estabelecida; sem evidência fora da amostra | Release, tabela de capacidades | Reconhecimento. A sessão limitada é qualificação técnica, não busca de lucro |

## 10. Alegações do tweet versus configuração

O `CLAUDE.md` do projeto fixa quatro alegações que não podem ser quebradas por mudanças de design. O verificador mostra, sem bloquear, o que a configuração candidata sustenta:

| Alegação | Sustentada pela configuração quando | Ressalva |
| --- | --- | --- |
| Jev decide comprar ou vender a partir do feed de preço | `MODEL=jev` e chave Jev presente | No perfil `gated` o código pode vetar com `hold` por confiança mínima, filtro econômico e limites |
| Execução real, carteira real | `DRY_RUN=false` e chave de carteira presente | O bloqueio de `Market.init()` ainda impede ordens reais |
| Ordem no livro on-chain a cada bloco de 300 ms | Perfil `every-block`: `QUOTE_INTERVAL_BLOCKS=1`, `ECONOMIC_GATE=false`, `MIN_CONFIDENCE=0` | Mesmo assim não provada: bloco atrasado não cota, recibo pendente bloqueia cotações, confirmação no mesmo bloco não qualificada |
| A demonstração é o painel ao vivo | Fora do escopo do verificador | Painel em `web/` |

O padrão do repositório é o perfil `gated` (`QUOTE_INTERVAL_BLOCKS=100`, `MIN_CONFIDENCE=0.65`, filtro econômico ligado), que **não** sustenta a alegação de ordem a cada bloco. Escolher o perfil é decisão do dono (contrato em aberto em `docs/RELEASE-v0.0.2.md`); este pacote não escolhe nem enfraquece nenhum dos dois contratos. O perfil escolhido define o limiar de latência do item `stage1.latency-distribution`.

## 11. Aritmética de custo para dimensionar limites

Exemplo documentado em `docs/RISCO-E-BACKTEST.md` (diagnóstico de 2026-10-09T16:22:41Z, não é medição atual): gas de 350000 a 102 gwei vale 0,0357 MON por cotação, cerca de US$ 0,00088095 com MON a US$ 0,0246765. Monad cobra sobre o limite de gas.

| Cadência | Cotações por dia (teto) | Gas por dia | Tempo até gastar US$ 1,00 |
| --- | ---: | ---: | --- |
| A cada bloco (300 ms) | 288000 | cerca de US$ 253,71 | cerca de 1135 cotações, ou 5,7 minutos |
| A cada 100 blocos | 2880 | cerca de US$ 2,54 | cerca de 9,5 horas (teto: cotações só ocorrem sem `hold` e com filtro econômico favorável) |

Com `MAX_SPEND_USD=1` (padrão) uma sessão `every-block` termina por limite de gasto em poucos minutos, muito antes de qualquer duração de 60 minutos. A `sessionDurationMinutes` do registro precisa ser lida junto com esse teto. A perda máxima inclui a marcação a mercado do inventário (`SpotLedger.snapshot`), então o limite pode disparar sem nenhum trade.

## 12. Mudança mínima para levantar o bloqueio (descrita, não feita)

Nada abaixo foi aplicado. A recomendação é um **commit separado e revisado**, em branch própria, aprovado por pessoa independente de quem escreveu este pacote, com o teste-guarda atualizado no mesmo commit.

1. **O ponto mecânico.** Em `Market.init()` a primeira instrução é `if (this.wallet) throw new Error("Live execution is not qualified: ...")`. A mudança mínima é substituir esse `throw` incondicional por uma função que falha fechado, por exemplo `assertLiveAuthorized()`, e só deixa passar com registro presente, assinatura declarada, validade em vigor, carteira igual à derivada da chave, limites iguais aos da configuração e modelo igual ao permitido. Recomenda-se **não** apagar a linha e **não** usar `readyForOwnerReview` como permissão, pois ele só descreve a checklist.
2. **`src/config.ts` não precisa mudar.** Já exige `PRIVATE_KEY`, `MODEL=jev`, `TYPESAFE_AI_API_KEY` e `LIVE_ACK=OWN_FUNDS_RISK`. `LIVE_ACK` sozinho nunca levantou o bloqueio.
3. **O que a evidência exige e a mudança mínima não resolve.** Reconciliação na partida de ordens existentes, saldos e base de capital (G4); prazo rígido de sessão e verificação de expiração no processo (G6); caminho de cancelamento de emergência (G5); proveniência de cotação (G8). Sem eles, ou o commit os implementa com testes, ou o dono registra por escrito que aceita a lacuna.
4. **Teste-guarda.** `src/live-qualification.test.ts` falha de propósito se a frase do bloqueio sair de `src/market.ts` ou se a exigência de `LIVE_ACK` sair de `src/config.ts`. O commit de levantamento precisa atualizar esse teste, o que o obriga a passar por revisão.
5. **Reversão.** `git revert` do commit, remover `PRIVATE_KEY` do ambiente, cancelar ordens abertas e conferir no explorador.
6. **Registro no commit.** Citar o SHA-256 do arquivo de autorização assinado, nunca o conteúdo, e nenhum segredo.

## 13. Como usar o verificador

```powershell
bun run scripts/qualify-live.ts                      # relatório: JSON no stdout, resumo em pt-BR no stderr
bun run scripts/qualify-live.ts --print-template authorization
bun run scripts/qualify-live.ts --print-template evidence
bun run scripts/qualify-live.ts --data-dir data --now 2026-10-11T12:00:00Z
```

- Quando o script `qualify:live` for ligado ao `package.json` pelo mantenedor, `bun run qualify:live` é equivalente ao primeiro comando acima. Sem `--no-env-file`, o Bun carrega o `.env`, que é o que se quer para avaliar a configuração real.
- Lê a configuração como `scripts/doctor.ts`, o registro e o manifesto em `data/` se existirem, e os arquivos citados no manifesto só para conferir o SHA-256. Mostra apenas booleanos sobre segredos, nunca valores. Deriva o endereço público de `PRIVATE_KEY` (sem assinar) para compará-lo com o registro.
- Sem rede, sem RPC, sem assinatura e sem escrita em disco. Não constrói `Market`, carteira nem provedor. Um teste estático falha se o CLI ou o módulo puro passarem a referenciar rede, RPC, assinatura, `Market`, variáveis de ambiente (no módulo puro) ou escrita de arquivos.
- Saída de código 0 para qualquer relatório completo; o relatório, não o código de saída, carrega o estado. Uso incorreto de flags sai com 2. Configuração inválida não derruba o CLI: vira `configLoad.ok=false` e os itens ficam `unknown`.
- Cada relatório afirma que o bloqueio de `Market.init()` está inalterado e que nada foi enviado.
- Formato: o JSON (stdout) tem `items`, `summary` (`readyForOwnerReview`, `blockers`, `counts`, `grantsPermission: false`, `codeGate`, `notice`), `claims`, `knownOpenRisks`, `policy` (limiares aplicados), `inputs`, `configLoad` e `io`. Cada item tem `id`, `group`, `requirement`, `codeOrDocReference`, `status`, `evidence`, `reason` e `codes`, tokens estáveis legíveis por máquina como `absent:paperSoakHours`, `below-minimum` ou `exceeds-config:maxLossUsd`. O resumo em pt-BR vai para o stderr.
- Pasta: `--data-dir` (padrão `data`, relativa ao diretório atual, como `JOURNAL_PATH`). Rode a partir da raiz do repositório.
- Relógio: `--now` fixa a data e hora (relatório reproduzível). Sem ele usa o relógio do sistema; o módulo puro nunca consulta o relógio, só recebe o valor.

Fluxo de uso: (1) a cada etapa concluída, o operador acrescenta os campos correspondentes ao manifesto e roda o verificador com a configuração do momento (paper) para ver os itens do estágio passarem de `unknown` para `met` ou `unmet`; (2) o dono preenche e assina o registro por conta própria; (3) com a configuração candidata a live (`DRY_RUN=false`, chave do signatário, `MODEL=jev`, `LIVE_ACK`, `JEV_MODEL_ID` fixo, limites iguais aos do registro) o dono roda o verificador pela última vez; (4) se `readyForOwnerReview=true`, o dono e o revisor independente examinam os arquivos e, só então, o dono decide sobre o commit da seção 12.

Itens que o verificador avalia (estado: `met`, `unmet` ou `unknown`):

| Grupo | Itens |
| --- | --- |
| Configuração | `config.snapshot-valid`, `config.live-requested`, `config.model-jev`, `config.jev-key-present`, `config.signer-key-present`, `config.live-ack`, `config.auto-deposit-off`, `config.model-id-pinned` |
| Autorização | `authorization.record-present`, `authorization.fields-valid`, `authorization.time-window`, `authorization.limits-within-config-caps`, `authorization.config-within-authorized-limits`, `authorization.tiny-caps`, `authorization.model-matches-config`, `authorization.wallet-matches-signer`, `authorization.signed` |
| Evidência | `evidence.manifest-valid`, `evidence.artifacts-verified` |
| Estágio 1 | `stage1.soak-duration`, `stage1.soak-uninterrupted`, `stage1.soak-real-rpc`, `stage1.soak-real-jev`, `stage1.latency-distribution`, `stage1.late-block-rate`, `stage1.pending-receipt-cadence`, `stage1.replay-reconciled`, `stage1.costs-complete` |
| Estágio 2 | `stage2.rehearsal-wallet`, `stage2.rehearsal-fresh`, `stage2.nonce-unchanged`, `stage2.gas-estimated`, `stage2.margin-and-vault-read`, `stage2.wallet-dedicated` |
| Reconciliação | `reconciliation.existing-orders`, `reconciliation.balances`, `reconciliation.restart-baseline` |
| Estágio 3 | `stage3.kill-switch-drilled`, `stage3.emergency-cancel-drilled`, `stage3.independent-review` |
| Riscos | `risk.pending-receipt-halts-quotes`, `risk.no-quote-provenance`, `risk.unlinked-fill-recorded-journal`, `risk.soak-24h-never-run`, `risk.same-block-confirmation-unqualified`, `risk.profitability-unproven` |

Com `DRY_RUN=true` (paper) os itens ligados ao modo live ficam `unmet`; isso é esperado enquanto o bloqueio está ligado. Para ver a checklist completa, o dono roda o verificador com a configuração candidata a live. É seguro, pois `Market.init()` continua recusando e o verificador nunca cria uma carteira.

## 14. Lacunas e desconhecidos

| Id | Lacuna |
| --- | --- |
| G1 | O diário não grava `loopMs`/`readMs` nem `stopReason`; `start` não expõe `Trader.stopReason`. Faltam um auxiliar que calcule percentis de latência, taxa de atraso e totais a partir do diário e o registro da parada. Acrescentar um tipo de linha novo exige alterar também o replay (`src/backtest.ts` recusa tipos desconhecidos) |
| G2 | Não existe sonda somente leitura de atraso de recibo (blocos entre inclusão e recibo disponível no RPC) |
| G3 | Não existe script de ensaio do Estágio 2 nem consulta de ordens abertas de um endereço no mercado. Método e fonte de dados a definir e revisar |
| G4 | O código não reconcilia na partida ordens existentes, saldos de carteira/margem nem a base de capital (o `SpotLedger` nasce da configuração) |
| G5 | Não existe script de cancelamento de emergência fora do processo do robô. Se a interface web da Kuru serve a esse fim é DESCONHECIDO |
| G6 | O código não impõe duração de sessão nem expiração do registro |
| G7 | O verificador não recalcula as declarações do manifesto a partir do diário; só confere forma, limiares e hashes de arquivos |
| G8 | O tipo `Quote` de produção não carrega proveniência |
| G9 | `src/market.receipt.test.ts` e `src/trader.receipt.test.ts` usam o caminho absoluto `C:/Users/gabri/jev-trader-release-v0.0.2-receipt-safety`, que não existe mais, e não carregam. Cópias temporárias com o caminho redirecionado para um worktree também falharam (erro `invalid arrayify value` em `keccak256`; causa não investigada), então é DESCONHECIDO se os 18 testes de recibo passam neste ambiente. A correção é uma mudança separada, fora deste pacote |
| G10 | DESCONHECIDO: latência real de recibo na Monad, semântica de cabeça de bloco, comportamento da Kuru em fila e cancelamento sob carga, e custo real de faturamento do Jev |

Este pacote não elimina nenhuma dessas lacunas; ele as torna visíveis e verificáveis.
