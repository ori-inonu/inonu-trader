---
title: "Novas fontes externas imutáveis"
created: 2026-10-13
updated: 2026-10-13
type: summary
tags: [documentacao, evidencia]
sources: [docs/SCHEMA.md, docs/_meta/source-manifest-20261013.json]
confidence: medium
---

# Novas fontes externas imutáveis

As fontes do projeto anteriores à wiki foram preservadas **nos caminhos originais**, sem copiar os contratos ou o plano canônico da carteira. Seu manifesto é `../_meta/source-manifest-20261013.json`. Esta pasta fica reservada a novas fontes externas curadas pelo usuário.

## Captura futura

- `articles/`: artigos, páginas e recortes.
- `papers/`: PDFs e extrações de artigos científicos.
- `transcripts/`: reuniões, entrevistas e textos fornecidos.
- `assets/`: imagens e anexos das fontes.

Para uma captura nova, registrar frontmatter com `source_url` quando houver, `ingested: YYYY-MM-DD` e `sha256` calculado somente sobre o corpo depois do frontmatter. Nenhuma captura externa foi feita nesta organização.

Nunca editar uma captura existente. Se o conteúdo remoto mudou, conservar a captura anterior e acrescentar uma versão com data e hash no nome, registrando a deriva na síntese, no índice e no log. Correções e análises pertencem às páginas compiladas, não às fontes.

Consulte [[manutencao-da-documentacao]] e [[relatorios-e-evidencias]].
