---
title: "Documentação do Inonu/Jev Trader"
created: 2026-10-13
updated: 2026-10-15
type: summary
tags: ["documentacao", "governanca"]
sources: ["docs/SCHEMA.md", "docs/_meta/catalog.json"]
confidence: medium
---

# Documentação do Inonu/Jev Trader

## Entrada atual: evolução e segundo cérebro

Comece por [[evolucao-do-projeto|Versões, milestones, fases e tarefas]] e [[estado-atual-do-projeto|Estado atual e documentos superados]]. O [catálogo de 15 de outubro de 2026](_meta/evolucao/catalogo/catalogo-de-fontes.md) inventaria 1.364 fontes, com 331 tarefas e 41 agrupamentos ligados aos seus planos originais. A navegação preserva os IDs e não transforma estado declarado em implementação comprovada.

**Versões:** v0.0.2 é versão declarada e release candidate local; v0.0.1 não foi comprovada nas refs/manifests locais consultados. As tarefas posteriores permanecem sem release atribuída, em vez de serem retroativamente encaixadas em 0.0.2. Nenhum original foi movido ou reescrito.

**Limite:** os mapas temáticos e resultados descritos abaixo são o retrato histórico de 2026-10-13. Para o refactor atual e as divergências ainda abertas, use as duas entradas acima. Os comandos reproduzíveis estão em [_meta/evolucao/RUNBOOK.md](_meta/evolucao/RUNBOOK.md).

A entrada da documentação é o [índice por temas](index.md). Para encontrar qualquer arquivo, abra o [catálogo completo](_meta/topic-map.md). Todos os documentos originais foram mantidos no lugar.

## Por onde começar

| Quero entender... | Caminho de leitura |
| --- | --- |
| Instalável Windows, Inonu e escopo recente | [Instalável e Inonu](concepts/instalavel-e-inonu.md) |
| Mesa, Central e interface | [Interface e Central](concepts/interface-e-central.md) |
| Gráfico, sinais e análise local | [Gráfico e analytics](concepts/grafico-e-analytics.md) |
| Gateway, configuração e Fase 2 on-chain | [OnchainOS e configurações](concepts/onchainos-e-configuracoes.md) |
| Carteira, patrimônio e reconciliação | [Carteira e patrimônio](concepts/carteira-e-patrimonio.md) |
| Operador, limites e autorização | [Operador](concepts/operador-e-execucao.md) e [qualificação](concepts/seguranca-e-qualificacao.md) |
| Dados de mercado, DEX e histórico | [Mercado e dados](concepts/mercado-e-dados.md) |
| Decisões consultivas da fita | [Fita e decisão do Jev](concepts/fita-e-decisao-jev.md) |
| DeFi, sinais e oportunidades | [DeFi e oportunidades](concepts/defi-e-oportunidades.md) |
| Integração real, piloto e relatórios | [Integração real](concepts/integracao-real-e-piloto.md) e [evidências](concepts/relatorios-e-evidencias.md) |
| Pesquisa, replay e paper | [Laboratório e paper](concepts/laboratorio-e-paper.md) |
| Consolidações e estado histórico | [Governança e histórico](concepts/governanca-e-historico.md) |

## Como a pasta foi organizada

- **Fontes**: contratos, planos, pesquisas e evidências antigos continuam nos caminhos originais; nada foi movido ou renomeado.
- **Wiki**: `concepts/` conecta os temas; os catálogos de `_meta/catalogs/` têm links para todas as fontes visíveis no snapshot reconciliado atual.
- **Proveniência**: `_meta/source-manifest-20261013.json` guarda hashes dos originais; `_meta/catalog.json` guarda classificação e resumo navegacional.
- **Manutenção**: [SCHEMA.md](SCHEMA.md), [log.md](log.md) e [_meta/audit.md](_meta/audit.md).

## Estado desta organização

15 frentes paralelas foram integradas. O snapshot reconciliado de 2026-10-13 contém 1.081 fontes visíveis: 446 Markdown e 635 artefatos, organizados em 14 temas de produto e uma página de manutenção, com dois subtemas transversais adicionais. Cada Markdown tem uma classificação em [_meta/document-status.json](_meta/document-status.json); 36 precisam de revisão semântica. [_meta/currentness.md](_meta/currentness.md) separa fontes atuais, históricas, propostas e pendências. O snapshot inclui 1.222 caminhos de código/configuração/testes/fixtures do working tree, não apenas o HEAD.

Não confunda organização completa com produto completo: contratos congelados não foram reescritos, evidências antigas não foram promovidas a runtime atual e divergências permanecem explícitas. A validação final encontrou cobertura e navegação consistentes (`ok: true`, `navigation_ok: true`, `drift_inventory_ok: true`), mas `preservation_ok: false`: 13 diferenças de hash em relação aos manifestos de referência estão registradas, sem autoria inferida. Consulte [_meta/verification.json](_meta/verification.json) e [_meta/source-drift-20261013.json](_meta/source-drift-20261013.json).

Para detectar mudanças após a integração, use `python -B docs/_meta/tools/check-current.py`. Na verificação de 2026-10-13 às 15:12 -03:00, os 1.222 caminhos de código e 1.081 fontes documentais corresponderam ao snapshot. A ferramenta é uma checagem sob demanda, sem rede, sem modelo e sem agendamento automático.

A configuração em `.obsidian/` não foi alterada. Abra a pasta já existente no Obsidian para usar os wikilinks; no editor, os links Markdown de leitura e catálogo continuam funcionando. Nenhuma configuração global foi criada.

Verificação offline: `python docs/_meta/tools/verify.py`. Os detalhes estão em [[manutencao-da-documentacao]]. Essa verificação é documental; não executa o produto, não chama o modelo e não autoriza operações financeiras. Veja também [[governanca-e-historico]].
