---
title: "A1.9: Preço de preenchimento de swap execute (formato de sucesso real) para o plano abrir com o preço real"
created: "2026-10-15"
updated: "2026-10-15"
type: "entity"
tags: ["documentacao", "governanca"]
sources: ["docs/sdd/agente-autonomo/tasks.md"]
confidence: "medium"
entity_kind: "tarefa"
original_id: "A1.9"
namespace: "agente-autonomo"
implementation_verified: false
release_assignment: "nao_atribuida"
---

# A1.9: Preço de preenchimento de swap execute (formato de sucesso real) para o plano abrir com o preço real

ID com namespace: `agente-autonomo::A1.9`.

ID original: `A1.9`.

- Estado documental normalizado: `planejada_declarada`.
- Implementação verificada nesta organização: **não**.
- Release atribuída: **desconhecida**.

Estado literal da fonte, preservado como dado:

```text
aberta; hoje usa o preço da decisão. A forma real da **cotação** já foi vista (array de um registro, corrigido); a de `swap execute` está no código-fonte da ferramenta (`swapTxHash`, `fromAmount`, `toAmount`, `priceImpact`, `gasUsed`, `nextSteps`) e só se vê com a primeira ordem real. O preço de preenchimento sairá de `fromAmount` e `toAmount` **depois do recibo**; `routerResult` e `estimateGasFee` da cotação são estimativas e nunca são preço de preenchimento nem custo efetivo
```

[Abrir tarefa na fonte canônica](../../../sdd/agente-autonomo/tasks.md), linha 44. O plano, os critérios, arquivos e evidências permanecem exclusivamente na fonte; esta página é um ponteiro.

[[_meta/evolucao/fases/agente-autonomo--fase-1-atos-do-usuario-e-o-que-so-se-ve-com-a-carteira-do-agente-pronta|Fase ou agrupamento original]] | [[_meta/evolucao/pacotes/agente-autonomo|Pacote]]

Dependências declaradas: [[_meta/evolucao/tarefas/agente-autonomo--a1-7|A1.7]].
