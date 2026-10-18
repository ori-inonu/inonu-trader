---
title: "T3.7: Adaptador WebSocket do OnchainOS: só especificação e a chave de desligamento até haver plano pago (sem plano não há c..."
created: "2026-10-15"
updated: "2026-10-15"
type: "entity"
tags: ["documentacao", "governanca"]
sources: ["docs/sdd/inonu-desktop-v1/TASKS.md"]
confidence: "medium"
entity_kind: "tarefa"
original_id: "T3.7"
namespace: "inonu-desktop-v1"
implementation_verified: false
release_assignment: "nao_atribuida"
---

# T3.7: Adaptador WebSocket do OnchainOS: só especificação e a chave de desligamento até haver plano pago (sem plano não há c...

ID com namespace: `inonu-desktop-v1::T3.7`.

ID original: `T3.7`.

- Estado documental normalizado: `concluida_declarada`.
- Implementação verificada nesta organização: **não**.
- Release atribuída: **desconhecida**.

Estado literal da fonte, preservado como dado:

```text
**feito por ausência, com varredura**: nenhum código abre o WebSocket pago do OnchainOS (a especificação está em ADR-6 e `wallet.md`), e `no-send-scan.test.ts` ganhou a regra que falha se algum arquivo desta entrega ou do gateway citar `wsdex.okx.com`; ligar exige o plano pago do dono e um ciclo próprio
```

[Abrir tarefa na fonte canônica](../../../sdd/inonu-desktop-v1/TASKS.md), linha 77. O plano, os critérios, arquivos e evidências permanecem exclusivamente na fonte; esta página é um ponteiro.

[[_meta/evolucao/fases/inonu-desktop-v1--m3-gateway-e-uso-completo-api-ico-chn|Fase ou agrupamento original]] | [[_meta/evolucao/pacotes/inonu-desktop-v1|Pacote]]

Dependências declaradas: [[_meta/evolucao/tarefas/inonu-desktop-v1--t3-3|T3.3]].
