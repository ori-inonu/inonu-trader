---
title: "T3.4: Governador por pedido (15), dia e mês: 402 vira cota esgotada com cache stale e bloqueio de 1 h da camada; 50011 vira..."
created: "2026-10-15"
updated: "2026-10-15"
type: "entity"
tags: ["documentacao", "governanca"]
sources: ["docs/sdd/inonu-desktop-v1/TASKS.md"]
confidence: "medium"
entity_kind: "tarefa"
original_id: "T3.4"
namespace: "inonu-desktop-v1"
implementation_verified: false
release_assignment: "nao_atribuida"
---

# T3.4: Governador por pedido (15), dia e mês: 402 vira cota esgotada com cache stale e bloqueio de 1 h da camada; 50011 vira...

ID com namespace: `inonu-desktop-v1::T3.4`.

ID original: `T3.4`.

- Estado documental normalizado: `concluida_declarada`.
- Implementação verificada nesta organização: **não**.
- Release atribuída: **desconhecida**.

Estado literal da fonte, preservado como dado:

```text
**feito de outra forma, no gateway da sessão da Fase 2**, conferido por leitura em 2026-10-13: `src/onchain-read/client.ts` tem uma fila global com `minIntervalMs` padrão de 1100 ms (o limitador de 1 req/s), um 402 bloqueia a camada por 1 h e o sistema não paga, 429 e 50011 abrem 30 s de recuo e o gateway serve o cache velho; `budget.ts` guarda o orçamento mensal por camada e o ritmo diário; o teto de 15 por pedido está em `src/inonu` (`MAX_ONCHAIN_CALLS`, contado por `countSentCalls`). Sem `governor.ts` nem `governor.test.ts` próprios: os testes são `client.test.ts` e `budget.test.ts`, que não escrevi nem reproduzi um a um
```

[Abrir tarefa na fonte canônica](../../../sdd/inonu-desktop-v1/TASKS.md), linha 74. O plano, os critérios, arquivos e evidências permanecem exclusivamente na fonte; esta página é um ponteiro.

[[_meta/evolucao/fases/inonu-desktop-v1--m3-gateway-e-uso-completo-api-ico-chn|Fase ou agrupamento original]] | [[_meta/evolucao/pacotes/inonu-desktop-v1|Pacote]]

Dependências declaradas: [[_meta/evolucao/tarefas/inonu-desktop-v1--t3-3|T3.3]].
