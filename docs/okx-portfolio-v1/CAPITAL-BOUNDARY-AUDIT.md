# Fronteira patrimonial para integração OKX/GEV

Auditoria documental de 2026-10-11, sobre 54 fontes locais capturadas no HEAD `055a637f27f28cbf357cfb492534f7ed33d9b68f`. As alterações locais existentes também fazem parte do baseline; o HEAD sozinho não identifica esse conteúdo. Esta entrega identifica contratos existentes e lacunas para decisões por liquidez, risco e retorno líquido. Os critérios propostos abaixo dependem de uma futura especificação; nenhuma estratégia ou integração financeira foi implementada nesta auditoria.

## Resultado da investigação

O projeto já tem inventário, limites de risco, identificação de operações e contabilidade. Essas camadas medem objetos diferentes. O operador preserva uma proteção decisiva: uma operação concluída fica em `reconciliation_required`, com `realizedUsd: null`, até que seu resultado possa ser atribuído. O crescimento composto demonstrado nos testes pertence ao modelo sintético paper. Fontes: `src/operator/cycle.ts:185–196`; `src/operator/ledger.ts:159–163`; `src/paper-capital.ts:477–515`; `src/paper-capital.test.ts:149–166`.

| Domínio contábil e fonte | O que o código representa | Limite para decidir reinvestimento |
|---|---|---|
| Inventário — `src/okx-wallet/portfolio.ts:213–252,284–307` | Quantidades reportadas, preços convertidos para Number e soma `knownValueUsd` dos produtos finitos. | Valor estimado dos ativos presentes. `valueComplete` verifica a parseabilidade dos ativos retornados; não certifica toda a carteira. |
| Operador — `src/operator/cycle.ts:99–145,185–196`; `src/operator/ledger.ts:123–135,183–194` | Variação de quantidades da chain selecionada aos preços anteriores; realizado qualificado é contabilizado separadamente no ledger. | O consumidor salva `observedBalanceDeltaUsd` com `resultBasis: "inventory_only"`, mantendo realizado desconhecido. `recordRealized` aceita um número finito, sem receber o pacote de atribuição. |
| Paper — `src/paper-capital.ts:2–32,281–303,328–393,477–515` | Um ativo identificado por chain/token/decimals/venue, com strings atômicas e BigInt; reserva, liquidação e liberação de capital. | Declara `synthetic-paper`, `strategyQualified:false` e `financiallyAuthorized:false`. Reinvestimento ocorre nesse universo contábil fechado. |
| Trader — `src/risk.ts:10–33`; `src/trader.ts:3,144–148,463–486,584–601` | SpotLedger inicializado pelo bankroll/MON configurados; caixa, posição, fees, gás e AI rastreados. | Realizado de fills é bruto na fórmula; PnL inclui posição marcada e despesas rastreadas. Esses campos não demonstram reconciliação de toda a carteira. |

O SpotLedger usado pelo trader vem de `./risk` (`src/trader.ts:3`), enquanto o supervisor paper usa o contrato de `paper-capital` (`src/paper-supervisor.ts:2,27–43`). A reutilização deve respeitar esses consumidores e unidades; somar os resultados dos quatro domínios não produz lucro líquido qualificado.

## Fidelidade e cobertura do inventário

O cliente conserva no retorno bruto strings de `balance`, `rawBalance`, `tokenPrice`, endereço por item e identidades de chain/contrato (`src/okx-wallet/portfolio.ts:55–65,99–122`). A normalização retém `balanceText`, mas deixa de carregar `rawBalance`, endereço por item e preço textual. `InventoryAsset` também não contém decimals, envelope da resposta ou relógio de preço (`213–226,289–291`). O snapshot conserva o endereço consultado, `queriedChains`, origem, filtro e `observedAtMs` local fornecido pelo chamador (`238–252,260–268,301–307`).

Converter um decimal para Number finito e rejeitar produto ou soma não representável protege a representação (`254–258,270–273,284–287`); não demonstra a unidade do provedor nem precisão contábil para inteiros grandes. O dimensionamento do operador usa até 15 decimais e conversão BigInt→Number para USD; os decimals dos pares são configurados (`src/operator/candidates.ts:26–35,111–118`).

Chains sem itens reportados são removidas da lista normalizada, embora a lista consultada permaneça. Por consequência da expressão `chains.every(...)`, uma resposta sem ativos produz `knownValueUsd=0` e `valueComplete=true` nessa função (`src/okx-wallet/portfolio.ts:298–307`). Isso é inferência do código, sem observação de uma resposta live. O comentário em `246` explicita que ausência é ausência de reporte. A normalização não rejeita duplicatas de chain/contrato nesse nível (`276–296`); a comparação do operador as rejeita depois (`src/operator/cycle.ts:123–125`).

O cliente `totalValue` conserva outro retorno textual e permite grupos all/tokens/defi (`src/okx-wallet/portfolio.ts:67–72,124–128,197–206`). A busca nas 54 fontes, excluindo testes, encontrou definição/interface e nenhum consumidor nessa cópia. Isso não estabelece ausência em todo o projeto. Somar agregados wallet e DeFi exige examinar sobreposição; a análise histórica já registra essa dependência (`docs/okx-portfolio-v1/CONTRACT-COMPARISON.md:39–45`).

## Atribuição econômica e custos

A função de compatibilidade `reconcileRealizedUsd` compara a mesma carteira, chain consultada, fontes reconhecidas, relógios locais ordenados, ativos/símbolos e quantidades válidas. Rejeita identidades duplicadas ou inventário incompatível (`src/operator/cycle.ts:105–144`). O delta textual usa BigInt antes de voltar a Number (`82–97`). Esses guards não vinculam o intervalo a recibos/blocos, não classificam depósitos e não estabelecem idade máxima do preço.

A fórmula é `sum((quantidadeDepois - quantidadeAntes) * preçoAntes)` (`137–144`). Portanto, um depósito externo do mesmo ativo já presente pode contribuir para o delta se os outros guards forem satisfeitos. Essa é uma inferência da assinatura e fórmula, sem movimento pessoal observado. Uma mudança no conjunto de ativos quebra a comparação. O consumidor conserva `realizedUsd: null` e `result_attribution_unverified` (`185–196`), impedindo promover esse delta a lucro. O gás refletido no saldo nativo já participa da observação; descontar novamente uma estimativa duplicaria essa despesa (`99–102`). Custos off-chain continuam exigindo evidência própria.

Para candidatos cujo `kind` é diferente de `kuru_spot_maker`, o risk gate rejeita custo incompleto, retorno previsto desconhecido/insuficiente, impacto desconhecido/excessivo, capital dimensionado fora dos limites e cotação inválida ou vencida (`src/operator/risk-gate.ts:62–81`). Os checks de pesquisa, saldo de origem, reserva nativa para gás e chain de destino ficam antes desse bloco (`37–60`). Os guards próprios do trader são descritos adiante; nenhuma execução live foi exercitada. O builder calcula previsão após duas cotações, taxas estimadas e allowance de inferência. Sua completude deriva de taxas das duas rotas conhecidas (`src/operator/candidates.ts:154–174`; `src/operator/types.ts:24–33`). Previsão e allowance não comprovam o custo efetivamente pago completo (`src/operator/cycle.ts:178`; `src/operator/types.ts:172–173`).

O executor guarda IDs de approvals/swaps e verifica qualificação, TTL, conta do signer, plano e ledger. Também aplica allowlist, limites por transação e STOP antes das submissões (`src/operator/executor.ts:93–135,166–174,193–199,225–231`; `src/operator/ledger.ts:14–29`). Isso descreve guards do código, sem evidência de ativação ou operação live. Seu contrato de receipt reduzido fornece status e gás nativo, sem movimentos por logs, bloco/hash do receipt ou marca USD (`src/operator/executor.ts:22–29,274–280`).

Há uma lacuna concreta: `gasCostNative` começa em zero e soma apenas recibos cujo gás não é null (`176–181`); a implementação ethers pode retornar null sem preço de gás (`278–279`). Assim, o agregado pode ser parcial ou zero quando existe custo desconhecido. `ExecutionOutcome` não tem indicador agregado de completude nem evidência de custo por receipt (`src/operator/types.ts:144–159`). O consumidor atual mantém resultado não qualificado; esta lacuna precisa ser resolvida antes de usar o agregado como custo total, preservando o bloqueio existente.

`recordRealized(nowMs, realizedUsd)` valida um número finito e atualiza o ledger, sem receber identidade de realização ou evidências de fluxo (`src/operator/ledger.ts:130–131,183–194`). A qualificação deve preceder essa chamada. O caminho atual de completed não a invoca e o ledger bloqueia outra execução quando há resultado não atribuído (`src/operator/cycle.ts:185–196`; `src/operator/ledger.ts:159–163`).

## Quando o saldo pode ser reutilizado hoje

No paper, o supervisor persiste reserva e intent antes do adapter; pending/unknown permanece retido. Só após matching do receipt, verificação contábil e persistência da observação ocorre settlement/checkpoint (`src/paper-supervisor.ts:720–765,790–852`). O receipt fornece valor e `costsComplete`; não contém prova de conversão multimoeda ou fatura (`src/paper-capital.ts:23–32,371–374`). `evidenceId` identifica a evidência do adapter e não certifica execução blockchain.

Ganhos liquidados elevam o saldo disponível para uma próxima reserva, respeitando ativo, limites, fundos e paradas (`src/paper-capital.ts:281–303,328–393,503–515`). O alfabeto de eventos não tem depósito/saque/transferência externa (`66–71`); `realizedNetAtoms=balance-initial` pertence a esse universo fechado (`491`). O runner fabrica fixtures de retorno/custo (`src/paper-supervisor-runner.ts:20,44,48–58,142–171`). O teste que devolve 140 sobre principal 100 com custo 5 demonstra a composição desses valores sintéticos (`src/paper-capital.test.ts:149–166`).

No trader, vendas podem aumentar o caixa do SpotLedger e afetar `canFill`; dimensionamento e exposição permanecem sujeitos a bankroll configurado e margem (`src/risk.ts:14–22`; `src/trader.ts:548–555`). A fórmula de `realizedUsd` dos fills, `-closing * (f.price - entry)`, não desconta fee/gás/AI (`src/trader.ts:594`). O PnL marcado do ledger inclui posição e despesas rastreadas (`src/risk.ts:31–33`).

O trader distingue gás estimado/observado, deduplica IDs, mantém conflitos e trata receipt pending/unknown como incerteza (`src/trader.ts:397–460`). Um receipt lost continua com execução desconhecida mesmo com gás observado (`342–358`). A composição de custos rotula a estimativa de AI como `configured-rate-estimate-not-invoice`; custo estimado válido pode satisfazer `costsComplete` dessa contabilidade local, sem confirmar fatura integral (`463–486`). O feed selecionado em `493–516` também não prova reconciliação patrimonial global; seu owner externo `./trades` não integra esta cópia.

## Divergência documental e contratos históricos

`docs/OKX-OPERADOR-JEV.md:55` descreve que o resultado calculado alimenta `dailyRealizedUsd`; `73` descreve gás deduzido do realizado. O consumidor atual mantém realizado null e documenta que a observação do saldo já inclui gás (`src/operator/cycle.ts:99–102,185–196`). Essas linhas antigas não descrevem o caminho atual. A comparação não determina a causa ou data da mudança; a presente entrega registra a divergência preservando a documentação anterior.

`docs/okx-portfolio-v1/RESEARCH.md:3–4,12–22` e `CONTRACT-COMPARISON.md:3–5,21–29,39–45,51–65` são pesquisas históricas: unidades, clocks, cobertura, sobreposição e earnings permaneciam sem qualificação suficiente. Esta auditoria acrescenta os consumidores atuais. Não transforma essa pesquisa em contrato OKX revalidado. `SOURCES.json:33` registra HTML original não salvo; revisão imutável e observação live permanecem null/false em `80–82,146–148,207–209,278–280`. Nenhuma página, carteira ou API foi consultada nesta etapa.

## Três lacunas e critérios candidatos

Estes critérios são propostas para especificação posterior. Não substituem a aceitação congelada de `docs/okx-ecosystem-v1/SPEC.md:9–15`: EC4 mantém `netReturn`, `executableExitLiquidity` e `totalCosts` desconhecidos na entrega de pesquisa; EC7 preserva bot, operador, validators, System One e dependências. Portfolio, Rewards e Alpha continuam fora daquela SPEC (`19`).

1. **Atribuição e custos por execução.** Reutilizar plano, ledger e barreira de reconciliação, associando conta/chain/ativo/unidade/intervalo a todos os movimentos, approvals, swaps e custos. Receipt pendente, reversão não reconciliada, custo desconhecido, efeito extra ou fluxo externo não classificado mantém resultado e reinvestimento desconhecidos. Depósito do mesmo ativo não vira lucro; replay não contabiliza duas vezes; evidência conflitante não fecha a barreira. Gás não é deduzido duas vezes e despesa off-chain sem prova permanece desconhecida. Lacunas atuais: `src/operator/cycle.ts:104–145`; `src/operator/executor.ts:22–29,176–181`; `src/operator/ledger.ts:183–194`.

2. **Fidelidade e cobertura do valor estimado.** Reutilizar cliente/normalização, conservando associação request/resposta, campos brutos, unidades por campo e relógios separados. Vazio, chain ausente, filtro, duplicata, escala não demonstrada ou preço sem as-of são incertezas distintas de zero e total. Agregados wallet/DeFi e overview/detail não podem ser duplicados. Number finito não qualifica unidade. Lacunas atuais: `src/okx-wallet/portfolio.ts:213–226,276–307`; `src/operator/candidates.ts:111–118`.

3. **Rótulos financeiros coerentes.** Cada valor deve explicitar owner, unidade, universo, base de custos e qualificação: inventário, delta observado, bruto de fills, PnL marcado e realizado atribuído. Ganho paper libera somente saldo paper com seus flags falsos; despesas estimadas conservam sua origem. Relatório não soma ledgers nem promove delta/earnings a saldo reinvestível. Corrigir a divergência documental deve preservar a evidência histórica e a proteção do consumidor atual. Fontes: `docs/OKX-OPERADOR-JEV.md:55,73`; `src/operator/cycle.ts:185–196`; `src/risk.ts:31–33`; `src/trader.ts:594`; `src/paper-capital.ts:23–32,491`.

Alternativas delimitadas para uma futura escolha técnica são um contrato offline de atribuição de um plano EVM, um diagnóstico de cobertura do inventário ou um registro documental parcial de movimentos. A primeira ataca a atribuição; a segunda expõe incertezas de valuation sem liberar realizado; a terceira ainda depende de qualificar o contrato histórico necessário. Nenhuma delas foi selecionada ou implementada aqui.

## Verificação executada

Os comandos abaixo foram executados pelo integrador com `bun --no-env-file`, usando os testes existentes, fixtures e dependências injetadas.

| Verificação | Resultado observado |
|---|---|
| `bun --no-env-file test src/okx-wallet/portfolio.test.ts src/okx-wallet/valuation.test.ts src/operator/ledger.test.ts src/operator/result.test.ts src/paper-capital.test.ts --timeout 15000` | 61 pass, 0 fail, 683 expects, 5 arquivos; exit 0. |
| `bun --no-env-file test src/risk.test.ts src/trader.test.ts src/trader.receipt.test.ts --timeout 15000` | 25 pass, 0 fail, 1 skip, 171 expects, 3 arquivos; exit 0. |
| `bun --no-env-file run typecheck` → `tsc --noEmit -p tsconfig.verification.json` | Exit 0; escopo do typecheck raiz. |

Total da execução atual: **86 testes passaram, nenhum falhou, um foi pulado; 854 expects em oito arquivos**. A suite condicional de conformance de receipt ficou pulada porque `RECEIPT_SAFETY_SOURCE` não foi definido. Isso limita a cobertura dessa superfície e não estabelece ausência de todos os guards atuais. As 54 fontes auditadas e as 65 fontes protegidas permaneceram hash-idênticas após a execução. Não foram alterados código, dependências ou funcionamento do bot nesta entrega.

Essa verificação sustenta o comportamento exercitado offline e a análise de interfaces. Reconciliação patrimonial live, lucro líquido reproduzível, liquidez de saída executável, custos totais e crescimento composto real continuam sem demonstração nesta etapa.
