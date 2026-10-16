---
title: "Autoresearch de decisoes: tarefas e dependencias"
created: 2026-10-16
updated: 2026-10-16
type: summary
tags: ["pesquisa", "governanca", "backtest"]
sources: ["docs/specs/autoresearch-decisoes/spec.md", "docs/specs/autoresearch-decisoes/plan.md"]
confidence: medium
---

# Tarefas e dependencias

Navegacao: [[inteligencia-e-resultados]] e [[laboratorio-e-paper]]. [Especificacao](spec.md), [plano](plan.md) e [estado](status.md).

| ID | Entrega | Depende de | Prova |
| --- | --- | --- | --- |
| S | Especificacao e plano revisados | inventarios | revisao tecnica independente |
| C | Contratos e entrypoint | S | comando canonico |
| W | Workload lab e stress de carteira | S, C contrato | workload executado, dados point-in-time |
| P | Inventario do painel e fraquezas | S, C contrato | relatorio de cada metrica com disponibilidade |
| E | Snapshot sanitizado e hashes de capturas e journals no home real do runtime | S, C contrato | congelador offline read-only, projecao agregada sem dados sensiveis |
| V | Integracao e verificacao | W, P, E | duas execucoes identicas, testes pertinentes, revisao |
| I | Inicializacao da baseline | V | init_experiment |

```mermaid
flowchart LR
  S[Especificacao revisada] --> C[Contrato]
  C --> W[Workload]
  C --> P[Metricas do painel]
  C --> E[Snapshot]
  W --> V[Integracao e prova]
  P --> V
  E --> V
  V --> I[Baseline autoresearch]
```

As verificacoes sao executadas uma vez apos a integracao; os agentes nao rodam build, lint, formatacao ou testes no meio das edicoes. Falhas anteriores conhecidas da suite completa devem ser identificadas como baseline, sem correcoes de credenciais ou escopo paralelo.
