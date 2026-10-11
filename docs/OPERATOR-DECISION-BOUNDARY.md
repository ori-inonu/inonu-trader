# INONU TRADER: contrato da decisão do operador

## Comportamento

O ciclo aceita somente uma escolha elegível ou `hold`, com todos os pesos fornecidos pelo modelo: exatamente `hold` e os ids elegíveis, valores finitos de 0 a 1 e soma dentro da tolerância de 0,02. Não preenche pesos ausentes. O conversor da avaliação e o ciclo validam a resposta; o ciclo também protege implementações alternativas de `OperatorModel`. Cada campo é lido uma vez e seu valor capturado é validado antes de construir a decisão; getters não podem trocar um valor entre validação e retorno. A decisão aceita possui sua própria cópia dos pesos. Pesos de decisão não são probabilidade de lucro nem taxa de vitória.

| Resultado | Decisão e plano | Execução e warning | Custo de inferência |
|---|---|---|---|
| Nenhum candidato elegível | Ausentes; modelo não consultado | `no_eligible_candidate` | 0 |
| Resposta inválida retornada pelo modelo | Ausentes | `decision_invalid` | `null` |
| Modelo lança ou rejeita | Ausentes | `decision_failed` | `null` |
| Modelo demora além do limite | Ausentes | `decision_timeout` | `null` |
| Escolha válida `hold` | Decisão presente; plano ausente | `jev_chose_hold` | Calculado somente com uso e preço conhecidos |
| Candidato válido | Segue plano e gates existentes | Mantém os controles de execução/simulação | Calculado somente com uso e preço conhecidos |

Nos três erros da decisão, a execução permanece `blocked`. O ciclo conclui com motivo fixo, sem texto da exceção, sem retry e sem uma resposta artificial do Jev dizendo `hold`. Uma falha de conversão que faz o adapter rejeitar aparece como `decision_failed`; uma resposta retornada e rejeitada pela validação do ciclo aparece como `decision_invalid`.

## Prazo e cancelamento

`CycleDeps.decisionTimeoutMs` é opcional: padrão 10000 ms, inteiro entre 1 e 30000. Uma configuração inválida falha antes de consultar inventário ou modelo. O prazo é medido por relógio monotônico; uma resposta após o limite também é recusada quando o event loop atrasa o timer.

O ciclo fornece `options.signal` ao modelo. O adapter Jev encaminha o sinal como `abortSignal` a `experimental_evaluate`, com `maxRetries: 0`. No timeout, o sinal é abortado. Mesmo que o modelo ignore o sinal, uma resolução ou rejeição posterior não altera o ciclo concluído; um ciclo seguinte pode retomar com resposta válida.

O aborto local não comprova cancelamento no provedor. Inferência iniciada pode ter sido faturada, mesmo sem resposta: `null` significa custo desconhecido. A alteração limita a espera pela decisão; inventário, geração de candidatos, execução e reconciliação têm seus contratos próprios. Um processo com o event loop bloqueado não garante resposta de parede no prazo.

## Evidência e limites

Regressões locais exercitam o validador/conversor e `runOperatorCycle` com fixtures e modelos locais, incluindo falha, atraso, retorno tardio, retomada e simulação. A suíte existente preserva gates, executor local e reconciliação. Os comandos usam `--no-env-file`; as cópias de verificação excluem `.env`.

Essa evidência não demonstra saldo real, qualidade das oportunidades, calibração do Jev, rentabilidade, backtest histórico, cancelamento remoto ou operação observada por 24 horas. A consulta de USDT na X Layer, as modalidades de investimento e a qualificação antes do capital continuam na meta ampla.
