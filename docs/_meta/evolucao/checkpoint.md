---
title: "Checkpoint da hierarquia documental"
created: 2026-10-15
updated: 2026-10-15
type: summary
tags: [documentacao, governanca]
sources: ["docs/_meta/evolucao/SPEC.md", "docs/_meta/evolucao/compiler.py", "docs/_meta/evolucao/test_compiler.py"]
confidence: medium
---

# Checkpoint da hierarquia documental

Tarefa desta conversa: organização aditiva de docs/ por versão, pacote, fase/agrupamento e tarefa. Não retomar tarefas de produto nem agentes do checkpoint de outra conversa de 2026-10-13.

## Concluído e verificado em 2026-10-15 às 16:11 -03:00

- Corrigidos os três achados da revisão1 por fixer distinto deleg_0e1905a5. Recebido e conferido: só compiler.py/test_compiler.py modificados; curation.json intacta. Recibos review-1.json e fix-1.json conservam a reprovação e o ciclo de correção.
- Integrador executou 28 testes novos e 21 legados: todos aprovados. Compiler --write e acceptance.py retornaram 0. Manifestos/páginas byte-exatos, grafo reconstruído idêntico, zero erros próprios e nenhum erro atômico novo no harness antigo. Harness antigo continua com falhas preexistentes, sem alegação de verde global.
- Nova cobertura: 1.364 fontes, com 550 Markdown, 813 artefatos e 1 referência sensível somente por caminho. Os seis inputs estáticos entram no catálogo, sem exclusão geral por prefixo. 17 pacotes, 41 agrupamentos e 331 tarefas; 1.765 nós, 1.486 relações e 454 páginas compiladas.
- Inventário materializado da fonte sensível conferido exatamente como dicionário só com path, sem hash ou metadados legados. Caminhos da curadoria sujeitos a confinamento e política antes de leitura; testes de traversal/symlink/privados verdes.
- Verificação adicional real: 331 ponteiros de tarefas; 309 IDs nativos reconferidos contra a linha literal, sem divergência; 22 itens sem ID original permanecem com ID só de navegação. Todas as tarefas conservam release não atribuída e implementação não verificada por este trabalho.

## Entrada e interpretação

docs/README.md e docs/index.md apontam a [[evolucao-do-projeto]], [[estado-atual-do-projeto]] e [[_meta/evolucao/RUNBOOK]].

v0.0.2 é versão declarada/candidato local, não publicação atual. v0.0.1 é referência não comprovada nas refs locais. Sete relações documentais com escopo e fontes; divergência de relato sobre alavancagem continua aberta. Estados das tarefas são os declarados pela fonte, nunca prova automática de implementação ou autorização financeira.

## Preservação

Baseline inicial de 1.468 caminhos segura e imutável. Só seis controles preexistentes foram alvos de escrita própria: README, índice, schema, currentness, log e generated-files. Fontes originais, código do produto e .obsidian não foram alvos.

Uma fonte mudou durante o trabalho (COORDENACAO-CLAUDE-20261013.md), autoria desconhecida e fora dos alvos de escrita desta tarefa. Não foi revertida; hashes registrados em observed-source-drift-20261015.json e inventário atualizado. Aceitação explicita byte_preservation_ok=false, source_drift_inventory_ok=true e zero desvios não registrados. Não afirmar preservação global byte a byte nem revisão semântica do texto concorrente.

## Fecho e revisão independente

Revisão2 independente delimitada aos três achados, deleg_e6a1a10c, recebida com passed=true e sem achados de segurança/lógica. Recibo real review-2.json; REV1-S1, REV1-S2 e REV1-L1 resolvidos. O integrador repetiu acceptance.py às 16:11 -03:00, saída 0, e conferiu que os três hashes abaixo coincidem com o início/fim da revisão:

- compiler.py: 0e579d531e05aa1fe69e5f0982fc50f93b1e1faea920b06f782309afaa52c3b0
- test_compiler.py: 0bfe33c7562ae99fd1bf70065c3e5647281419664803488166cf33be50afa342
- curation.json: 1b6a9e8f93ede6342e0c850f80557d8daeec4ac2c9835ca60d517d224f90a25c

Entrega documental concluída neste escopo. Revisão2 e fix-1 registrados como derivados, navegação integrada e aceitação final executada. Nenhum próximo objetivo de produto foi criado ou retomado. Manutenção é sob demanda pelo RUNBOOK; lacunas de atribuição de release, revisão semântica de todas as fontes e falhas antigas continuam explícitas. A conclusão não certifica runtime ou implementação das tarefas de produto.

## Limites

Sem instalação, rede/API/modelo do produto, trader, operação financeira, commit/staging/publicação ou configuração global. Custo de processamento desconhecido. Configuração Obsidian lida e não alterada. OMH degradado, sem contorno ou alegação de runtime persistente. Playbook global no caminho indicado não encontrado; fluxo injetado preservado.
