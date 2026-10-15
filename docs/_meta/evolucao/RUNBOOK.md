---
title: "Como usar e manter a trilha de evolução"
created: 2026-10-15
updated: 2026-10-15
type: summary
tags: [documentacao, governanca]
sources: ["docs/_meta/evolucao/SPEC.md", "docs/_meta/evolucao/compiler.py", "docs/_meta/evolucao/curation.json"]
confidence: medium
---

# Como usar e manter a trilha de evolução

Comece em [[evolucao-do-projeto]]; a leitura do refactor e dos conflitos está em [[estado-atual-do-projeto]]. Não é necessário instalar plugin nem transferir o cofre pessoal.

## Encontrar uma informação

1. Abra `docs/README.md` ou a nota [[evolucao-do-projeto]].
2. Entre na versão comprovada ou em [[_meta/evolucao/marcos/sem-release-atribuida|Trabalho sem release atribuída]].
3. Escolha o pacote, a fase/agrupamento nativo e a tarefa. Por exemplo: agente-autonomo, Fase 0, A0.1; ou desktop, M1, T1.1. São namespaces diferentes.
4. A página da tarefa aponta para a fonte canônica e sua linha na captura. Consulte ali os critérios e evidências, sem usar o ponteiro como novo plano de execução.
5. Para qualquer outro arquivo, use [[_meta/evolucao/catalogo/catalogo-de-fontes|Catálogo completo]]. Ele inclui pesquisas, contratos, evidências e artefatos, não apenas os planos de tarefas.

No Obsidian, abra o cofre de projeto já existente em `docs/`. Wikilinks e links locais formam a rede; o grafo local da nota de um pacote mostra fases e tarefas sem o ruído do grafo global. A configuração existente do grafo não tem filtro de pesquisa que exclua `_meta/evolucao`; não foi alterada.

Filtros opcionais do grafo global: `path:_meta/evolucao` para a camada de evolução ou `path:_meta/evolucao/tarefas` para tarefas. No editor, use os links dos catálogos e pesquise o ID junto do pacote, por exemplo `agente-autonomo A0.1`. Identificador `item-*` significa somente que a fonte não tinha ID próprio.

## Como interpretar

- **Versão declarada:** número no manifesto. **Release candidate:** composição local documentada. **Publicação:** exige evidência própria. Não são equivalentes.
- **Sem release atribuída:** não foi encontrado vínculo suficiente para dizer em qual versão aquilo entrou. Não é sinônimo de não implementado.
- **Estado declarado:** rótulo da fonte, que pode ser antigo ou dizer "feito com modelo falso". Não é resultado de uma execução desta organização.
- **Implementação não verificada nesta organização:** esta tarefa só compilou e verificou documentação. Não executou o produto para fechar tarefas de trading.
- **Histórico/substituído parcialmente:** fonte preservada, com escopo e evidência do que mudou. Datas, nomes `FINAL` e hashes não concedem precedência por si.
- **Contradição aberta:** os dois relatos continuam visíveis, como alavancagem em SPEC:164 versus Solana spot em AUTOEVOLUCAO:348. Não resolve autorização financeira por inferência.

## Atualizar sob demanda

Execute da raiz do repositório, sem abrir o trader:

```bash
python -B docs/_meta/evolucao/test_compiler.py
python -B docs/_meta/evolucao/compiler.py
```

A segunda chamada é somente leitura: recompõe o inventário em memória e valida a geração possível contra as fontes presentes. Ela não certifica que as páginas materializadas ainda correspondam ao disco; essa correspondência foi conferida na aceitação desta entrega. Se uma fonte mudou, reveja primeiro sua semântica, o estado e as referências da curadoria.

Depois dessa revisão, uma atualização explícita dos derivados é:

```bash
python -B docs/_meta/evolucao/compiler.py --write
```

`--write` só escreve os caminhos de saída do compilador, exige hashes compatíveis com `outputs.json` antes de substituir derivados e recusa uma saída alterada por outro escritor. Nunca altera originais, código de produto ou `.obsidian`. Arquivos de curadoria, SPEC, testes e baseline não são saídas substituídas pelo compilador. Novos derivados precisam entrar no registro geral `docs/_meta/generated-files.json`; fontes novas continuam fontes, não devem ser disfarçadas como derivadas. A lista de fontes sensíveis é explícita: novos materiais sensíveis devem ser classificados antes da ingestão.

Os metadados antigos de 2026-10-13 e os hashes iniciais não são substituídos. A ferramenta antiga continua disponível:

```bash
python -B docs/_meta/tools/verify.test.py
python -B docs/_meta/tools/verify.py
```

Ela já tinha falhas antes desta camada, preservadas em `legacy-baseline-20261015.json`. Um resultado verde do verificador novo não equivale a verde global. Corrigir essas pendências antigas é outra entrega, não motivo para enfraquecer seus critérios.

## Controles de segurança e cobertura

Caminhos da curadoria são relativos à raiz, sem traversal ou destinos externos por symlink. Leituras de fontes sensíveis e diretórios privados são recusadas antes de abrir arquivos. O registro sensível é somente o caminho, sem tamanho, hash novo ou legado e sem revisão herdada.

Os seis inputs estáticos desta organização (SPEC, RUNBOOK, compilador, testes, curadoria e script de aceitação) também entram como fontes. Recibos, baselines, checkpoint e páginas materializadas são derivados excluídos por registro explícito; não existe exclusão indiscriminada de todo `_meta/evolucao/`. A cobertura é enumerada separadamente do extrator do inventário.

Para conferir a materialização no disco e o rebuild determinístico, sem executar o produto:

```bash
python -B docs/_meta/evolucao/acceptance.py
```

Esse comando escreve somente seu recibo local `acceptance.json`; inclui testes novos e legados, comparação de hashes, desvios de fontes e comparação dos erros legados com a baseline inicial. `byte_preservation_ok: false` continua visível quando uma fonte mudou durante a tarefa, mesmo se a deriva estiver registrada e a organização for estruturalmente válida.

## Cobertura e limites

- Inventário de todas as fontes visíveis na captura, com exclusões explícitas de derivados registrados, diretórios ocultos e configurações do Obsidian.
- Extração dos sete arquivos dedicados de tarefas e das fatias E0-E5/F0-F6, incluindo F1a/F1b, selecionadas explicitamente na curadoria. Não captura toda menção informal e não transforma H1-H6, hipóteses experimentais, em tarefas aprovadas.
- Frontmatter, fontes, links de saída, órfãos, pais, namespaces, referências de linha, tamanho e hashes foram verificados na entrega. Hash não autentica fonte externa nem comprova implementação.
- `credential-evidence.md` aparece só por caminho; seu conteúdo e hash não são lidos.
- Nenhum monitoramento, cron, processo persistente, sincronização, chamada ao JEV do projeto ou operação financeira foi criado.

Lista exata de páginas e hashes de saída: [outputs.json](outputs.json). Grafo com nós e relações: [graph.json](graph.json). Critérios: [[_meta/evolucao/SPEC]].
