---
title: "T3.9: Família token: search, hot-token, basic-info, price-info, top-liquidity, com sonda real de leitura"
created: "2026-10-15"
updated: "2026-10-15"
type: "entity"
tags: ["documentacao", "governanca"]
sources: ["docs/sdd/inonu-desktop-v1/TASKS.md"]
confidence: "medium"
entity_kind: "tarefa"
original_id: "T3.9"
namespace: "inonu-desktop-v1"
implementation_verified: false
release_assignment: "nao_atribuida"
---

# T3.9: Família token: search, hot-token, basic-info, price-info, top-liquidity, com sonda real de leitura

ID com namespace: `inonu-desktop-v1::T3.9`.

ID original: `T3.9`.

- Estado documental normalizado: `bloqueada_declarada`.
- Implementação verificada nesta organização: **não**.
- Release atribuída: **desconhecida**.

Estado literal da fonte, preservado como dado:

```text
feito offline: `basic-info` é a rota `/onchain/token-info` (POST em lote, em `src/onchain-read/catalog.ts`, com teste em `f2-routes.test.ts`); conferido por leitura em 2026-10-13; a sonda ao vivo aguarda autorização (estado da sessão da Fase 2 ([RECONCILIACAO](../config-onchain-smartmoney/fase-2/RECONCILIACAO.md)), não reproduzido por c38db1)
```

[Abrir tarefa na fonte canônica](../../../sdd/inonu-desktop-v1/TASKS.md), linha 67. O plano, os critérios, arquivos e evidências permanecem exclusivamente na fonte; esta página é um ponteiro.

[[_meta/evolucao/fases/inonu-desktop-v1--m3-gateway-e-uso-completo-api-ico-chn|Fase ou agrupamento original]] | [[_meta/evolucao/pacotes/inonu-desktop-v1|Pacote]]

Dependências declaradas: [[_meta/evolucao/tarefas/inonu-desktop-v1--t3-3|T3.3]].
