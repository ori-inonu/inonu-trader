# Tasks: SourceError

| ID | Depende de | Done | Verify | Estado inicial |
| --- | --- | --- | --- | --- |
| SE1 | - | Origem, consumidores, spec e plano revisados | diff, imports e decisao consultiva | feito |
| SE2 | SE1 | Classe extraida e API preservada | diff contra main | pendente |
| SE3 | SE2 | Checks obrigatorios passam | inonu, typecheck, test e test:lab | pendente |
| SE4 | SE3 | Diff e registro append-only verificados | diff --check e cerebro verify | pendente |
| SE5 | SE4 | Commit e PR; merge normal conferido | git e gh, identidade e igualdade de arvore | pendente |

Grafo de tarefas: SE1 -> SE2 -> SE3 -> SE4 -> SE5. O status registra somente etapas realmente concluidas.

SE2 e SE3 concluidas com os resultados em status.md. SE4 fica concluida se a verificacao de grafo e o diff seguintes passarem. SE5 depende da publicacao e merge conferidos no recibo local da rotina.
