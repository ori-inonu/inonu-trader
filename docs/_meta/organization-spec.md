---
title: "Organização não destrutiva da documentação"
created: 2026-10-13
updated: 2026-10-13
type: summary
tags: [documentacao, governanca]
sources: [docs/CONSOLIDACAO-ESPECIFICACOES-20261012.md, docs/sdd/inonu-desktop-v1/OWNERSHIP.md]
confidence: medium
---

# Organização não destrutiva da documentação

## Objetivo e autorização

Pedido desta conversa: organizar todas as documentações de `docs/` seguindo a skill llm-wiki. O domínio é o próprio Inonu/Jev Trader. A entrega é local e documental; não inicia nenhuma tarefa de produto descrita nas fontes.

Ampliação explícita do usuário em 2026-10-13: atualizar a documentação com base em todo o projeto atual e delegar a organização para **15 subagentes em paralelo**. A wiki passa a registrar o estado verificável do código de produto, além da navegação do corpus. O snapshot inclui alterações locais, não apenas o commit. Históricos, evidências imutáveis e critérios congelados não são reescritos; divergências e guias antigos recebem classificação e contexto atual na wiki. Nenhum documento autoriza executar a tarefa que descreve.

## Requisitos e critérios imutáveis

| ID | Requisito | Verificação |
| --- | --- | --- |
| DOCORG-1 | Preservar byte a byte os arquivos preexistentes; não mover, renomear, excluir ou reformular fontes. | Manifesto SHA-256 antes/depois; mudanças concorrentes devem ser relatadas, nunca revertidas. |
| DOCORG-2 | Catalogar todos os arquivos visíveis, incluindo documentos Markdown e artefatos de apoio. | Comparar conjunto de caminhos do catálogo com a árvore; configurações ocultas do Obsidian são excluídas explicitamente. |
| DOCORG-3 | Oferecer entrada curta, mapa por tema e catálogos completos com links relativos que resolvam. | Validar todos os links criados e a cobertura dos catálogos. |
| DOCORG-4 | Criar páginas interligadas com frontmatter, taxonomia fechada, fontes e pelo menos dois wikilinks de saída. | Lint das páginas novas; nenhum órfão entre páginas de conteúdo. |
| DOCORG-5 | Distinguir contrato, plano, guia, pesquisa, checkpoint, revisão e evidência; não declarar estado atual por nome ou data de arquivo. | Classificação documental explícita e revisão das sínteses. |
| DOCORG-6 | Preservar contratos canônicos, congelações e zonas de outros escritores. | Apenas arquivos novos na raiz documental e em diretórios exclusivos de navegação. |
| DOCORG-7 | Registrar inconsistências documentais, duplicatas por hash e documentos grandes sem apagar nem corrigir as fontes. | Relatório com caminhos e limites de interpretação. |
| DOCORG-8 | Entregar comandos reproduzíveis de verificação local, sem rede, modelo, credencial ou transação. | Executar o verificador documental; manter recibo JSON. |
| DOCORG-9 | Confrontar cada tema com módulos atuais e registrar caminhos, símbolos/linhas, hashes e limites da inspeção. | Snapshot de código, recibos dos 15 responsáveis e páginas atualizadas com evidência local. |
| DOCORG-10 | Distribuir todos os documentos do corpus e módulos de primeira parte entre 15 responsáveis sem colisão de escrita. | Manifesto de ownership, 15 dispatches reais e inventário de cobertura, sem confundir atribuição com inspeção. |

## Estrutura escolhida

A própria pasta `docs/` já contém `.obsidian/` e é o wiki deste projeto. `SCHEMA.md`, `index.md`, `log.md` e `README.md` serão a entrada. `concepts/` terá mapas temáticos; `_meta/catalogs/` terá catálogos paginados; `_meta/` terá inventário, proveniência e verificações. Os arquivos existentes compõem a camada de fontes **in-place**: adaptar esta camada evita duplicar contratos ou quebrar caminhos. `raw/` fica reservado a futuras fontes externas imutáveis, sem copiar o plano canônico da carteira.

## Plano e responsabilidade

1. Inventariar a árvore e congelar os hashes da observação inicial.
2. Ler contratos e navegação existente; compilar sínteses curtas por tema.
3. Criar schema, índice, páginas temáticas, catálogos e relatório de manutenção.
4. Executar checks de cobertura, links, metadados, tags, tamanho e preservação.
5. Revisar a organização e entregar caminhos de entrada e limitações.

O integrador desta conversa é o único escritor de schema, índices, catálogos, log e metadados compartilhados. Cada um dos 15 pesquisadores possui somente uma página temática exclusiva em `docs/concepts/` e um recibo exclusivo de auditoria em `_meta/audits/`. Eles confrontam documentos com o código sem editar fontes originais, código ou trabalho de terceiros. Nenhuma escrita em `docs/sdd/**`, `docs/research/**`, `docs/portfolio-evidence-v1/**` ou `.obsidian/**` está no escopo. Correções adicionais em guias mutáveis são propostas ao integrador, não alterações paralelas em zonas reservadas.

## Exclusões e riscos

- Sem commit, staging, push, publicação, instalação, atualização do Obsidian ou configuração global de WIKI_PATH.
- Auditar a atualidade documental contra o código observado, registrando explicitamente o que foi e o que não foi inspecionado. Não reexecutar evidências financeiras históricas nem certificar funcionamento ao vivo ou rentabilidade por leitura estática.
- Classificação automática é navegação, não aprovação, precedência jurídica ou conclusão de tarefas.
- Fontes mudam por sessões concorrentes; o verificador deve acusar deriva, não sobrescrever documentos.
- Não substituir a mensagem central de Kuru/Monad nem resolver sua tensão com o escopo do instalável.

## Relações

- [[manutencao-da-documentacao]]
- [[governanca-e-historico]]
