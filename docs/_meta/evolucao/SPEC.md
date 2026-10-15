---
title: "SPEC da hierarquia e atualidade documental"
created: 2026-10-15
updated: 2026-10-15
type: summary
tags: [documentacao, governanca]
sources: ["docs/SCHEMA.md", "docs/_meta/organization-spec.md", "docs/sdd/agente-autonomo/tasks.md"]
confidence: medium
---

# SPEC da hierarquia e atualidade documental

Pedido desta conversa: evoluir o segundo cérebro de `docs/` para acesso rápido por versão/milestone, fases e tarefas, reconciliando o refactor sem apagar a história. Esta tarefa não retoma os objetivos nem os 15 agentes do checkpoint de outra conversa em 2026-10-13.

## Critérios imutáveis

- KG-01: preservar caminhos e bytes das fontes originais, código, evidências e `.obsidian`. Apenas navegação compilada explicitamente lida pode receber alterações pequenas. Comparar hashes antes/depois e registrar deriva concorrente sem revertê-la.
- KG-02: inventariar todas as fontes visíveis presentes, inclusive artefatos. Excluir páginas derivadas registradas e configurações ocultas explicitamente. A fonte sensível `docs/sdd/mesa-decisao-20261013/credential-evidence.md` recebe apenas caminho, nunca leitura, hash ou conteúdo.
- KG-03: materializar um grafo navegável em Markdown/Obsidian, com marcos de versão comprovados, pacotes de trabalho, agrupamentos nativos e tarefas. Cada tarefa deve ter ID com namespace, ID original sem normalização, pai e fonte/linha. Cabeçalhos M0/M1 e Fase 0/Fase 1 não são equivalentes e devem conservar a nomenclatura original.
- KG-04: distinguir versão declarada, commit, release candidate e publicação. Não atribuir entregas a v0.0.1/v0.0.2 apenas porque o pacote atual declara 0.0.2. Sem evidência, manter release não atribuída. Não inventar fases/tarefas antigas.
- KG-05: separar estado declarado pela fonte, atualidade documental e grau de evidência observado. Uma linha "feito" ou um arquivo de teste não prova implementação atual, execução live ou lucro. Tarefas antigas continuam históricas se substituídas; lacunas permanecem explícitas.
- KG-06: registrar substituições explícitas e parciais, conflitos e pendências, com fontes e evidência. Estado presente será um retrato datado de inspeção estática e documental, não certificação live.
- KG-07: entrada curta no README/índice existente; catálogo completo paginado; duas ligações de saída por página, frontmatter, sem links novos quebrados, IDs duplicados, tarefas sem pai ou fontes sem inventário. Manter páginas com até 200 linhas e catálogos com até 50 entradas.
- KG-08: compilação e validação offline, sem rede/modelo/segredo no compilador, sem instalação/plugin/commit/staging/push/execução do trader. Testes de regressão com fixtures isoladas e saída real; preservar o harness antigo e seus resultados, sem enfraquecê-lo.
- KG-09: registrar baseline, evidências, comandos, limitações e checkpoint próprio. Inventário não equivale a revisão semântica de todas as fontes. Toda cobertura ou contagem deve vir de execução.

## Plano mínimo

1. Capturar baseline e consultar esquema/índice/log existentes. Resultado inicial: wiki temática existente está desatualizada; verificador legado tem falhas anteriores a esta tarefa. Playbook global no caminho indicado não encontrado; seguir o fluxo global injetado, sem criar substituto.
2. Revisar independentemente história de versões e mudança de produto. Subagentes somente leitura, sem alterar arquivos compartilhados ou chamar serviços externos.
3. Implementar extrator determinístico e testes, compilando nova camada aditiva em `_meta/evolucao/` e dois mapas em `concepts/`. Original é fonte in-place, não cópia reescrita.
4. Integrar apenas entrada, índice, schema, log e registro de derivados. Não regenerar nem substituir os manifestos imutáveis de 2026-10-13.
5. Executar validação de estrutura, cobertura, preservação, idempotência, isolamento e revisão independente; corrigir achados próprios sem tocar contratos de produto.

## Responsabilidade, autorização e limites

O integrador é o único escritor do projeto. Pesquisadores e revisor trabalham somente em leitura e devolvem referências verificáveis. Escolhas técnicas abertas, se necessárias, seguem a delegação real ao JEV; consulta não fornece fatos faltantes nem autorização financeira. Nenhum orçamento financeiro de produto é utilizado. Custos de processamento do assistente são desconhecidos.

A base externa do método é o padrão LLM Wiki de Andrej Karpathy, identificado a partir da transcrição "LEM-IQ"; sua aplicação aqui preserva o schema local. Fontes externas explicam o método, não decidem a verdade do projeto.

Veja [[evolucao-do-projeto]] e [[estado-atual-do-projeto]].
