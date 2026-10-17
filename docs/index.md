---
title: "Índice da documentação"
created: 2026-10-13
updated: 2026-10-17
type: summary
tags: ["documentacao", "governanca"]
sources: ["docs/SCHEMA.md", "docs/_meta/catalog.json", "docs/_meta/topic-map.md"]
confidence: medium
---

# Índice da documentação

## Retorno composto por ciclo de 1 minuto (2026-10-17)

Pesquisa (somente leitura), mapa Wayfinder e rascunhos de spec, plano e tarefas. A meta de 0,5% a 1% por ciclo é tratada como hipótese a medir; nada aqui promete lucro nem autoriza operação.

- [Pesquisa e síntese](specs/retorno-composto-por-ciclo/research.md): resposta curta, medidas, raspagem, ranking, correções e bloqueios do dono.
- [Matemática da meta](specs/retorno-composto-por-ciclo/matematica-da-meta.md): escada de metas, janelas, capacidade, amostra.
- [Limites de API, fontes de dados e raspagem](specs/retorno-composto-por-ciclo/api-limites-e-fontes.md).
- [Arquitetura de dados, velocidade de decisão e execução](specs/retorno-composto-por-ciclo/arquitetura-e-decisao.md).
- [Fontes de vantagem](specs/retorno-composto-por-ciclo/fontes-de-edge.md) e [linha de base e validação](specs/retorno-composto-por-ciclo/validacao-e-baseline.md).
- [Ciclo 2: mapa Wayfinder, 12 decisões do Jev, fatias em sombra e entrada do planejamento](specs/retorno-composto-por-ciclo/wayfinder.md); [especificações das fatias](specs/retorno-composto-por-ciclo/specs/) e [decisões e recibos do Jev](specs/retorno-composto-por-ciclo/decisoes-jev/).
- [Revisão de branches e worktrees e integração na main](specs/retorno-composto-por-ciclo/revisao-branches-worktrees.md): inventário, o que foi feito, correções e o que fica para o dono.
- [Integração da branch autoresearch na main](specs/retorno-composto-por-ciclo/integracao-autoresearch.md): decisões de cada conflito, o que ficou de fora e o que fica para o dono.
- [Spec](specs/retorno-composto-por-ciclo/spec.md), [plano](specs/retorno-composto-por-ciclo/plan.md), [tarefas](specs/retorno-composto-por-ciclo/tasks.md) e [status](specs/retorno-composto-por-ciclo/status.md) (rascunhos).
- [Evidência bruta dos agentes](specs/retorno-composto-por-ciclo/evidence/) com o veredito do cético por afirmação.


## Autoresearch real online (2026-10-16)

- [Especificacao vigente](specs/autoresearch-real-online/spec.md): somente leituras reais online, desconhecidos preservados e nenhuma operacao financeira.
- Plano e execucao canonica (nos `plan-autoresearch-real-online`). Estado, tarefas e verificacao: nos `spec-*` do grafo (`docs/_meta/cerebro`).
- [Benchmark offline anterior](specs/autoresearch-decisoes/spec.md): historico superado por instrucao do usuario, nao e mais o procedimento de execucao.
- [Decisão executável do JEV](specs/decisao-executavel-jev/spec.md): sonda, causa em `report.view`, alertas no Brief e estado da entrega local.
- [Grafo documental v2](specs/cerebro-grafo/spec.md): eventos append-only, exportacao limitada para JEV e preservacao byte a byte do v1.

## Inteligência e revisão por ciclo (2026-10-16)

- [Especificação de inteligência e revisão dos ciclos JEV](specs/inteligencia-ciclos-jev/spec.md).
- [Plano](specs/inteligencia-ciclos-jev/plan.md), [tarefas](specs/inteligencia-ciclos-jev/tasks.md), [status e verificação](specs/inteligencia-ciclos-jev/status.md) e [pesquisa/inventário](specs/inteligencia-ciclos-jev/research.md).

- [Inventário e contratos oficiais por recurso](specs/inteligencia-ciclos-jev/inventory.md), [matriz de contratos de API](specs/inteligencia-ciclos-jev/api-contracts.md) e [observações read-only dos ciclos disponíveis](specs/inteligencia-ciclos-jev/observations.md).
- [Captura da HUD ativa com revisão expandida](specs/inteligencia-ciclos-jev/agentview-page10-expanded.webp).

## Cerebro documental

- [Grafo documental v2](specs/cerebro-grafo/spec.md), [plano](specs/cerebro-grafo/plan.md), [tarefas](specs/cerebro-grafo/tasks.md) e [estado](specs/cerebro-grafo/status.md): fonte de eventos append-only, grafo derivado e preservacao de v1.

## Evolução e consulta rápida (2026-10-15)

- [[evolucao-do-projeto|Versão/milestone, pacote, fase e tarefa]]: 17 pacotes, 41 agrupamentos e 331 tarefas com IDs originais e fonte/linha.
- [[estado-atual-do-projeto|Estado atual e especificações superadas]]: mudança para o agente, limites de evidência e divergências não resolvidas.
- [[_meta/evolucao/catalogo/catalogo-de-fontes|Catálogo atual de todas as fontes]]: 1.364 fontes: 550 documentos Markdown, 813 artefatos e uma referência sensível não lida. Configurações ocultas e derivados registrados não entram na contagem de fontes.
- [[_meta/evolucao/marcos/v0-0-2|v0.0.2, candidato local]]; [[_meta/evolucao/marcos/v0-0-1|v0.0.1, não comprovada]]; [[_meta/evolucao/marcos/sem-release-atribuida|Trabalho ainda sem release atribuída]].
- [[_meta/evolucao/RUNBOOK|Como buscar, atualizar e verificar]].

A seção temática abaixo é o snapshot histórico de 2026-10-13, não a revisão presente de cada documento.

> Snapshot de 2026-10-13: **476 documentos Markdown** e **763 artefatos de apoio**, total de 1239 fontes visíveis. Cinco configurações ocultas do Obsidian permanecem fora da navegação.

Comece por [README.md](README.md). Convenções: [SCHEMA.md](SCHEMA.md). Catálogo: [_meta/topic-map.md](_meta/topic-map.md). Histórico: [log.md](log.md). Atualidade por documento: [_meta/document-status.json](_meta/document-status.json).

## Conceitos e mapas temáticos

- [[carteira-e-patrimonio|Carteira e patrimônio]]: 18 documentos e 6 artefatos.
- [[defi-e-oportunidades|DeFi e oportunidades]]: 41 documentos e 16 artefatos.
- [[fita-e-decisao-jev|Fita e decisão do Jev]]: 42 documentos e 1 artefatos.
- [[governanca-e-historico|Governança e histórico]]: 32 documentos e 10 artefatos.
- [[grafico-e-analytics|Gráfico e analytics]]: 12 documentos e 26 artefatos.
- [[instalavel-e-inonu|Instalável Windows e Inonu]]: 41 documentos e 14 artefatos.
- [[integracao-real-e-piloto|Integração real e piloto]]: 38 documentos e 75 artefatos.
- [[interface-e-central|Interface, Mesa e Central]]: 69 documentos e 141 artefatos.
- [[laboratorio-e-paper|Laboratório, replay e paper]]: 8 documentos e 1 artefatos.
- [[mercado-e-dados|Mercado, captura e contratos de dados]]: 28 documentos e 15 artefatos.
- [[onchainos-e-configuracoes|OnchainOS, gateway e configurações]]: 41 documentos e 120 artefatos.
- [[operador-e-execucao|Operador e fronteiras de execução]]: 48 documentos e 8 artefatos.
- [[relatorios-e-evidencias|Relatórios e evidências de apoio]]: 23 documentos e 327 artefatos.
- [[seguranca-e-qualificacao|Segurança, risco e qualificação]]: 35 documentos e 3 artefatos.
- [[manutencao-da-documentacao|Manutenção da documentação]]: procedimento de atualização e verificação.

## Subtemas complementares

- [[risco-quantitativo|Risco quantitativo]]: componentes, evidência e limites da quantificação.
- [[inteligencia-e-resultados|Inteligência e resultados]]: ciclo, placar e divergências ainda abertas.

## Catálogos e metadados

- [[_meta/topic-map|Mapa completo de fontes]]: catálogos por tema, separados em documentos e artefatos.
- [[_meta/organization-spec|Escopo e critérios da organização]].
- [[_meta/audit|Auditoria documental]].
- [[_meta/currentness|Atualidade e divergências]].
- [[raw/README|Política de fontes externas futuras]].

## Interpretação segura

Mapas e classificações não substituem contratos originais, não autorizam operações e não demonstram estado live. Fontes históricas, propostas e divergências continuam identificadas nos caminhos originais. Consulte [[governanca-e-historico]] e [[seguranca-e-qualificacao]].

## Motor de decisão e orçamento de API do OnchainOS (2026-10-17)

- [Especificação](specs/motor-decisao-onchainos/spec.md): contratos, fronteira com a experimentação, limites verificados da OKX, baseline medido e resultado sobre a hipótese de 0,3% líquido.
- [Roadmap priorizado do dono](specs/motor-decisao-onchainos/roadmap.md): épicos E0 a E13 em P0, P1 e P2; texto recebido cortado em E8, com a cobertura pelo GOAL 1 anotada no fim.
- [ADR 0001](adr/0001-motor-de-decisao-puro-sem-live.md): motor puro, só paper e replay.
- [Glossário](../GLOSSARY.md): perna, pool, executor indisponível, sonda e demais termos.
