# INONU TRADER — evidência do replay

O comando de backtest recompõe a contabilidade do journal fornecido. A avaliação `assessment` separa essa recomposição das evidências necessárias para avaliar uma estratégia. Ela não executa novamente a estratégia nem consulta a carteira ou o mercado.

## Uso local

```powershell
bun --no-env-file --no-install run scripts/backtest.ts --journal <journal.jsonl>
bun --no-env-file --no-install run scripts/backtest.ts --journal <journal.jsonl> --manifest <manifest.json>
```

O JSON mantém `ok`, `journal` e `result`, acrescentando `assessment`. `ok: true` significa que o replay contábil foi aceito. Não significa que a estratégia seja lucrativa. Journal inválido continua retornando erro e exit 1. Um manifesto ausente, ilegível ou inválido produz diagnóstico junto do replay válido, com exit 0.

## Como interpretar

| Campo | Significado |
|---|---|
| `evidenceKind` | Sempre `accounting-replay-only`. |
| `strategyQualified` / `financiallyAuthorized` | Sempre `false`. |
| `metadataStatus: missing` | Manifesto não fornecido. |
| `metadataStatus: invalid` | Estrutura, unidades, hashes ou intervalos incoerentes; ou manifesto ilegível/JSON inválido. |
| `metadataStatus: incomplete` | Faltam declarações necessárias ou há custos desconhecidos. |
| `metadataStatus: declared` | Declarações completas e consistentes; não foram verificadas independentemente. |
| `horizons.*.status: covered` | Duração e maior lacuna entre amostras satisfazem os limites declarados. Não certifica causalidade, retorno ou operação contínua. |

Os hashes identificam os bytes observados do journal e da fonte do engine. Rótulos como `live` ou `real-market-paper` não autenticam sua origem. Somente eventos `block` contam como amostras de mercado: registros de custos, quotes e fills não preenchem lacunas de dados.

PnL positivo com zero fills recebe o motivo `no-trade-mark-gain`. Valorização de posição aberta não é ganho realizado disponível para reinvestimento. Para qualquer resultado, a reconciliação de ganhos realizados permanece pendente.

## Manifesto v1

O manifesto é um objeto JSON com `schemaVersion: 1`. Campos desconhecidos são ignorados; declarações não autenticam sua origem. Ambas as janelas de avaliação devem estar dentro do único journal observado nesta entrega.

| Seção | Campos e restrições |
|---|---|
| Raiz | `journalSha256` e `engineSha256`: 64 caracteres hexadecimais, iguais aos hashes observados. |
| `data` | `source`, `venue`, `instrument`, `network`: textos não vazios; `units` exatamente `{time:"ms",price:"USD/MON",size:"MON",cash:"USD"}`; `resolutionMs`: inteiro seguro positivo; `startTs`/`endTs`: limites observados, inteiros seguros não negativos. |
| `strategy` | `version`/`model`: textos não vazios; modelo igual ao header; `promptSha256`/`parametersSha256`: hashes de 64 caracteres hexadecimais. |
| `coverage` | `maxGapMs`: inteiro seguro positivo; `horizons.shortMs`, `mediumMs`, `longMs`: inteiros seguros positivos em ordem crescente, permitindo igualdade. |
| `evaluation` | `selection`/`heldOut`: objetos `{startTs,endTs}`, com início menor que fim e ambos dentro da observação; `selection.endTs <= heldOut.startTs`; `parametersFrozen`/`holdoutNeverTuned`: `true`; `availabilityPolicy`: texto não vazio; `availabilityEvidenceSha256`: hash. |
| `baselines` | Três objetos com `kind` único: `cash`, `hold-initial-inventory`, `simple-maker`. Cada um exige `journalSha256`, `startTs`/`endTs` iguais aos observados, `initialEquityUsd` igual ao replay, `initialMid` positivo igual ao header; `initialMon` é zero para cash e igual ao header para os demais. `netPnlUsd` é finito; `maxDrawdownUsd`/`turnoverUsd` são finitos não negativos. Os hashes dos journals dos baselines podem ser distintos. |
| `costs` | Categorias `fees`, `gas`, `model`, `slippage`, `latency`, `fills`, `taxes`, `liquidation`. Cada uma exige `status` (`known`, `unknown` ou `not-applicable`) e `assumption` não vazia; `known` exige `evidenceSha256`; `not-applicable` exige justificativa; `unknown` permanece lacuna. |
| `scenarios` | Três objetos com `kind` único: `higher-costs`, `slower-fills`, `adverse-prices`; cada um exige `assumption` não vazia e `resultSha256`. |

Todos os hashes declarados têm 64 caracteres hexadecimais. Baselines e cenários são apenas declarações: o diagnóstico não os executa nem verifica suas métricas. Para `horizons.*`, `unknown` indica definições ausentes/inválidas ou ausência de amostras; `insufficient` indica que os limites válidos não foram satisfeitos.

Ausências e incoerências geram códigos estáveis em `reasons`; não são preenchidas com valores presumidos. Um manifesto completo ainda não comprova ausência de lookahead, execução de baselines/cenários, lucro futuro ou funcionamento 24 horas.

## Próximas evidências necessárias

Dados históricos qualificados e acesso verificável; reexecução da estratégia com seleção separada da avaliação; custos e fills conservadores; baselines executados; paper com conciliação de ganhos realizados; recuperação e limites do supervisor. Execução financeira depende de resultado revisável e autorização explícita com limites. Esta entrega não fornece essas evidências ou permissões.
