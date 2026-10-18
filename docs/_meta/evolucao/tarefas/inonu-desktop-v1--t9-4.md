---
title: "T9.4: Dados do endereço conectado, só leitura, pelo gateway; aba Carteira"
created: "2026-10-15"
updated: "2026-10-15"
type: "entity"
tags: ["documentacao", "governanca"]
sources: ["docs/sdd/inonu-desktop-v1/TASKS.md"]
confidence: "medium"
entity_kind: "tarefa"
original_id: "T9.4"
namespace: "inonu-desktop-v1"
implementation_verified: false
release_assignment: "nao_atribuida"
---

# T9.4: Dados do endereço conectado, só leitura, pelo gateway; aba Carteira

ID com namespace: `inonu-desktop-v1::T9.4`.

ID original: `T9.4`.

- Estado documental normalizado: `planejada_declarada`.
- Implementação verificada nesta organização: **não**.
- Release atribuída: **desconhecida**.

Estado literal da fonte, preservado como dado:

```text
**feito até onde dá sem carteira conectada**: as rotas estão ligadas e lidas ao vivo (T3.12) e o painel "Minha carteira" (leitor estrito, 35 testes) lê as mesmas rotas de verdade; **falta ver o painel desenhado com uma carteira conectada**, que exige a extensão (T1.1); a Solana entrou em 2026-10-13 como escopo próprio do painel, com consulta ao Inonu e resultado por token, lida ao vivo no servidor local com um endereço público ([evidência](evidence/T9.1-T9.4-solana-na-carteira.md)); a leitura única que junte EVM e Solana está aberta ([evidência](evidence/T3.12-rotas-da-carteira.md)); **em 2026-10-13 (tarde)** a consulta "O que fazer com a minha carteira" (`web/src/components/Desk/Dock/HoldingsConsult.tsx`, com testes próprios) passou a valer para **qualquer rede** que o provedor liste, EVM ou Solana, a partir da mesma leitura: até 6 ativos, com consentimento, o Inonu decide ativo por ativo, sem enviar ordem (desvio D4-24, na [evidência da simplificação](evidence/UI-simplificacao-2026-10-13.md))
```

[Abrir tarefa na fonte canônica](../../../sdd/inonu-desktop-v1/TASKS.md), linha 153. O plano, os critérios, arquivos e evidências permanecem exclusivamente na fonte; esta página é um ponteiro.

[[_meta/evolucao/fases/inonu-desktop-v1--m9-carteira-conectada-wal|Fase ou agrupamento original]] | [[_meta/evolucao/pacotes/inonu-desktop-v1|Pacote]]

Dependências declaradas: [[_meta/evolucao/tarefas/inonu-desktop-v1--t3-12|T3.12]], [[_meta/evolucao/tarefas/inonu-desktop-v1--t9-1|T9.1]].
