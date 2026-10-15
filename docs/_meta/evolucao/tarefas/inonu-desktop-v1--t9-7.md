---
title: "T9.7: \"Aceitar\" a sugestão só preenche o ticket"
created: "2026-10-15"
updated: "2026-10-15"
type: "entity"
tags: ["documentacao", "governanca"]
sources: ["docs/sdd/inonu-desktop-v1/TASKS.md"]
confidence: "medium"
entity_kind: "tarefa"
original_id: "T9.7"
namespace: "inonu-desktop-v1"
implementation_verified: false
release_assignment: "nao_atribuida"
---

# T9.7: "Aceitar" a sugestão só preenche o ticket

ID com namespace: `inonu-desktop-v1::T9.7`.

ID original: `T9.7`.

- Estado documental normalizado: `concluida_declarada`.
- Implementação verificada nesta organização: **não**.
- Release atribuída: **desconhecida**.

Estado literal da fonte, preservado como dado:

```text
verificado em teste puro do fluxo (`acceptOutcome`, que `InonuAsk` só aplica; a parte React não tem DOM de teste): "Aceitar" uma resposta sobre um token preenche o rascunho (rede, token, lado, hash do Brief, nenhum valor) e a frase do cartão diz o que de fato aconteceu, inclusive quando o ticket não foi preenchido; "Ignorar", zona, manter, spot e perpétuo não deixam nada; nenhum caminho de envio. Não visto ao vivo (precisa de uma resposta real do modelo). [evidence/T9.5-T9.7-escada-e-ticket.md](evidence/T9.5-T9.7-escada-e-ticket.md)
```

[Abrir tarefa na fonte canônica](../../../sdd/inonu-desktop-v1/TASKS.md), linha 156. O plano, os critérios, arquivos e evidências permanecem exclusivamente na fonte; esta página é um ponteiro.

[[_meta/evolucao/fases/inonu-desktop-v1--m9-carteira-conectada-wal|Fase ou agrupamento original]] | [[_meta/evolucao/pacotes/inonu-desktop-v1|Pacote]]

Dependências declaradas: [[_meta/evolucao/tarefas/inonu-desktop-v1--t7-5|T7.5]], [[_meta/evolucao/tarefas/inonu-desktop-v1--t9-6|T9.6]].
