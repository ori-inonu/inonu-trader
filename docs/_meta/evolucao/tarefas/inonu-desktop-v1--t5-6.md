---
title: "T5.6: Equivalente on-chain (trades, price-info, hot-token) rotulado aproximação"
created: "2026-10-15"
updated: "2026-10-15"
type: "entity"
tags: ["documentacao", "governanca"]
sources: ["docs/sdd/inonu-desktop-v1/TASKS.md"]
confidence: "medium"
entity_kind: "tarefa"
original_id: "T5.6"
namespace: "inonu-desktop-v1"
implementation_verified: false
release_assignment: "nao_atribuida"
---

# T5.6: Equivalente on-chain (trades, price-info, hot-token) rotulado aproximação

ID com namespace: `inonu-desktop-v1::T5.6`.

ID original: `T5.6`.

- Estado documental normalizado: `concluida_declarada`.
- Implementação verificada nesta organização: **não**.
- Release atribuída: **desconhecida**.

Estado literal da fonte, preservado como dado:

```text
**feito pela sessão da Fase 2 com outro nome de arquivo, conferido por leitura em 2026-10-13**: `src/intel/onchain-digest.ts` calcula o fluxo on-chain como a parcela de compra por volume em USD de `market/trades` (`flowComponent`), com as janelas de `price-info` (m5, h1, h24) e `aprox: true` no Brief, e `onchain-digest.test.ts` confere o rótulo; `hot-token` (`txsBuy` e `txsSell`) entra no Rastreador (pressão on-chain, T8.4). Não é `src/intel/onchain-flow.ts`, não foi escrito por c38db1, e os testes não foram reproduzidos um a um
```

[Abrir tarefa na fonte canônica](../../../sdd/inonu-desktop-v1/TASKS.md), linha 104. O plano, os critérios, arquivos e evidências permanecem exclusivamente na fonte; esta página é um ponteiro.

[[_meta/evolucao/fases/inonu-desktop-v1--m5-motor-de-fluxo-flx-ing|Fase ou agrupamento original]] | [[_meta/evolucao/pacotes/inonu-desktop-v1|Pacote]]

Dependências declaradas: [[_meta/evolucao/tarefas/inonu-desktop-v1--t3-3|T3.3]].
