---
title: "T3.12: Família do endereço do usuário: balance/, post-transaction/, portfolio/"
created: "2026-10-15"
updated: "2026-10-15"
type: "entity"
tags: ["documentacao", "governanca"]
sources: ["docs/sdd/inonu-desktop-v1/TASKS.md"]
confidence: "medium"
entity_kind: "tarefa"
original_id: "T3.12"
namespace: "inonu-desktop-v1"
implementation_verified: false
release_assignment: "nao_atribuida"
---

# T3.12: Família do endereço do usuário: balance/, post-transaction/, portfolio/

ID com namespace: `inonu-desktop-v1::T3.12`.

ID original: `T3.12`.

- Estado documental normalizado: `concluida_declarada`.
- Implementação verificada nesta organização: **não**.
- Release atribuída: **desconhecida**.

Estado literal da fonte, preservado como dado:

```text
**feito**: as seis rotas (valor total, saldos, histórico, PnL por token, visão geral, PnL recente) estão em `src/onchain-read/routes/wallet.ts` (38 testes, 7 deles pelo gateway de verdade), **ligadas ao catálogo com a autorização do usuário** (duas edições aditivas em `catalog.ts` e a lista em `catalog.test.ts`) e **lidas ao vivo** pelo núcleo real: 200 nas seis, e o leitor estrito do navegador aceitou a resposta real ([evidência](evidence/T3.12-rotas-da-carteira.md)); fora desta entrega: saldo de tokens escolhidos, detalhe por hash, histórico de DEX e posições DeFi
```

[Abrir tarefa na fonte canônica](../../../sdd/inonu-desktop-v1/TASKS.md), linha 70. O plano, os critérios, arquivos e evidências permanecem exclusivamente na fonte; esta página é um ponteiro.

[[_meta/evolucao/fases/inonu-desktop-v1--m3-gateway-e-uso-completo-api-ico-chn|Fase ou agrupamento original]] | [[_meta/evolucao/pacotes/inonu-desktop-v1|Pacote]]

Dependências declaradas: [[_meta/evolucao/tarefas/inonu-desktop-v1--t3-3|T3.3]].
