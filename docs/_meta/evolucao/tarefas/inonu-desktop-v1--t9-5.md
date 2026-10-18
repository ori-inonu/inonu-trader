---
title: "T9.5: Escada de cotações (no máximo 5 por ticket) com o estado degradado quando o teste de 60 dias da Trade API acabar"
created: "2026-10-15"
updated: "2026-10-15"
type: "entity"
tags: ["documentacao", "governanca"]
sources: ["docs/sdd/inonu-desktop-v1/TASKS.md"]
confidence: "medium"
entity_kind: "tarefa"
original_id: "T9.5"
namespace: "inonu-desktop-v1"
implementation_verified: false
release_assignment: "nao_atribuida"
---

# T9.5: Escada de cotações (no máximo 5 por ticket) com o estado degradado quando o teste de 60 dias da Trade API acabar

ID com namespace: `inonu-desktop-v1::T9.5`.

ID original: `T9.5`.

- Estado documental normalizado: `concluida_declarada`.
- Implementação verificada nesta organização: **não**.
- Release atribuída: **desconhecida**.

Estado literal da fonte, preservado como dado:

```text
verificado com os desvios D4-15, D4-17 e D4-18: leitor estrito, escada de 1, 3 ou 5 tamanhos (no máximo 5) lida em ordem com 1,1 s entre as leituras, parada nas recusas que se repetem, estado degradado da Trade API; uma leitura real feita ao vivo. [evidence/T9.5-T9.7-escada-e-ticket.md](evidence/T9.5-T9.7-escada-e-ticket.md)
```

[Abrir tarefa na fonte canônica](../../../sdd/inonu-desktop-v1/TASKS.md), linha 154. O plano, os critérios, arquivos e evidências permanecem exclusivamente na fonte; esta página é um ponteiro.

[[_meta/evolucao/fases/inonu-desktop-v1--m9-carteira-conectada-wal|Fase ou agrupamento original]] | [[_meta/evolucao/pacotes/inonu-desktop-v1|Pacote]]

Dependências declaradas: [[_meta/evolucao/tarefas/inonu-desktop-v1--t3-3|T3.3]].
