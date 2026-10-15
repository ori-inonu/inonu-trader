---
title: "T3.6: Redes dinâmicas e capacidade por família a partir dos 5 supported/chain; 143, 4663 e 5042 em token-identity.ts"
created: "2026-10-15"
updated: "2026-10-15"
type: "entity"
tags: ["documentacao", "governanca"]
sources: ["docs/sdd/inonu-desktop-v1/TASKS.md"]
confidence: "medium"
entity_kind: "tarefa"
original_id: "T3.6"
namespace: "inonu-desktop-v1"
implementation_verified: false
release_assignment: "nao_atribuida"
---

# T3.6: Redes dinâmicas e capacidade por família a partir dos 5 supported/chain; 143, 4663 e 5042 em token-identity.ts

ID com namespace: `inonu-desktop-v1::T3.6`.

ID original: `T3.6`.

- Estado documental normalizado: `parcial_declarada`.
- Implementação verificada nesta organização: **não**.
- Release atribuída: **desconhecida**.

Estado literal da fonte, preservado como dado:

```text
parcial: o catálogo já serve as 5 listas `supported/chain` com validade de 24 h e a web monta as redes a partir delas (`chainChips`, T4.2); **as sete redes de CHN-2 foram acrescentadas** (143 Monad, 4663 Robinhood, 5042 Arc, 999 HyperEVM, 57073 Ink, 1672 Pharos, 9745 Plasma) em `src/okx-market/token-identity.ts`: só dados, um teste por rede em `token-identity.test.ts`, e os testes de isolamento de `src/okx-market`, `src/pilot` e `src/onchainos` seguem verdes. O SPEC (CHN-2, aprovado) as declara EVM; a página de redes da OKX **não** marca essas sete como EVM (só dá nome e índice), então a conclusão vem do SPEC e do nome das redes, não de uma frase da OKX. **A segunda metade de CHN-2 (derivar a lista da resposta de `supported/chain`) não é possível como está escrita:** nenhuma das quatro variantes da resposta traz marca de EVM; alternativa e decisão em D4-19, na [evidência de T3.12](evidence/T3.12-rotas-da-carteira.md)
```

[Abrir tarefa na fonte canônica](../../../sdd/inonu-desktop-v1/TASKS.md), linha 76. O plano, os critérios, arquivos e evidências permanecem exclusivamente na fonte; esta página é um ponteiro.

[[_meta/evolucao/fases/inonu-desktop-v1--m3-gateway-e-uso-completo-api-ico-chn|Fase ou agrupamento original]] | [[_meta/evolucao/pacotes/inonu-desktop-v1|Pacote]]

Dependências declaradas: [[_meta/evolucao/tarefas/inonu-desktop-v1--t3-3|T3.3]].
