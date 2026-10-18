---
title: "T9.6: Ticket de ordem que só exibe /swap e /approve-transaction"
created: "2026-10-15"
updated: "2026-10-15"
type: "entity"
tags: ["documentacao", "governanca"]
sources: ["docs/sdd/inonu-desktop-v1/TASKS.md"]
confidence: "medium"
entity_kind: "tarefa"
original_id: "T9.6"
namespace: "inonu-desktop-v1"
implementation_verified: false
release_assignment: "nao_atribuida"
---

# T9.6: Ticket de ordem que só exibe /swap e /approve-transaction

ID com namespace: `inonu-desktop-v1::T9.6`.

ID original: `T9.6`.

- Estado documental normalizado: `parcial_declarada`.
- Implementação verificada nesta organização: **não**.
- Release atribuída: **desconhecida**.

Estado literal da fonte, preservado como dado:

```text
parcial (D4-15 a D4-18): o ticket mostra rede, token, lado do modelo, a escada e o estado de cada tamanho, **sem** botão de envio e sem nada para assinar; `minReceiveAmount`, slippage e etapa de aprovação aparecem como indisponíveis porque o gateway não serve `/swap` nem `/approve-transaction`; só a cotação de pagar com a moeda do registro e receber o token é feita. Visto só em teste de tela. [evidence/T9.5-T9.7-escada-e-ticket.md](evidence/T9.5-T9.7-escada-e-ticket.md)
```

[Abrir tarefa na fonte canônica](../../../sdd/inonu-desktop-v1/TASKS.md), linha 155. O plano, os critérios, arquivos e evidências permanecem exclusivamente na fonte; esta página é um ponteiro.

[[_meta/evolucao/fases/inonu-desktop-v1--m9-carteira-conectada-wal|Fase ou agrupamento original]] | [[_meta/evolucao/pacotes/inonu-desktop-v1|Pacote]]

Dependências declaradas: [[_meta/evolucao/tarefas/inonu-desktop-v1--t9-5|T9.5]].
