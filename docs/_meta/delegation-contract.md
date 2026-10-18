---
title: "Contrato da auditoria documental em 15 frentes"
created: 2026-10-13
updated: 2026-10-13
type: summary
tags: [documentacao, governanca]
sources: [docs/_meta/organization-spec.md, docs/_meta/project-state-20261013.json, docs/SCHEMA.md]
confidence: medium
---

# Contrato da auditoria documental em 15 frentes

## Autoridade e recuperação

O usuário pediu nesta conversa: atualizar toda a documentação com base no projeto atual e organizar os arquivos com llm-wiki usando 15 subagentes em paralelo. O domínio é documental. Ler `docs/SCHEMA.md`, `docs/index.md`, `docs/log.md`, `docs/_meta/organization-spec.md` e `C:/Users/gabri/.agents/sdd-multiagent/PLAYBOOK.md` antes de produzir conteúdo. Carregar a skill `llm-wiki`; usar `code-wiki` somente como apoio para referência ao código, sem criar outro vault.

Snapshot: `docs/_meta/project-state-20261013.json`, coletado em 2026-10-13, branch main, HEAD `00a593bcabe25dbb6d83795268533551098f645b`, **incluindo** trabalho modificado e não rastreado. Há 1048 arquivos de código/configuração/teste/fixture atribuídos e 984 fontes documentais visíveis (408 Markdown). Atribuição não prova leitura ou correção. O corpus inicial de 407 Markdown recebeu um arquivo concorrente depois da observação; nenhum estado alheio foi importado como execução desta conversa.

## Responsabilidade exclusiva

Cada responsável recebe um `slug`. Ler a entrada `owners[slug]` no snapshot: `source_paths`, `document_paths`, `artifact_paths`, `output_page`, `output_receipt`. Pode ler qualquer fonte pública local pertinente, mas só pode escrever:

- a página exclusiva `docs/concepts/<slug>.md`;
- o recibo exclusivo `docs/_meta/audits/<slug>.json`;
- scratch próprio fora do repositório, se indispensável.

O integrador é o único escritor de índices, catálogos, schema, log, metadados compartilhados e relatório geral. Não editar fontes originais, código, testes, manifestos do produto, SPECs congeladas, `docs/sdd/**`, `docs/research/**`, `docs/portfolio-evidence-v1/**`, `.obsidian/**`, arquivos do outro responsável ou qualquer cofre pessoal. Não mover, renomear, excluir, stagear, commitar, publicar, instalar ou parar processos.

## Auditoria contra o projeto atual

1. Descobrir os caminhos atribuídos e ler instruções locais antes de analisar. Trace funções/símbolos até definição e uso; não deduza o comportamento só do nome da pasta ou do documento.
2. Ler cada Markdown atribuído integralmente ou por seções relevantes e registrar a modalidade. Contratos, propostas, revisões e checkpoints de snapshots diferentes devem continuar distintos.
3. Inspecionar entradas, APIs, integração, dados, estados, persistência, configuração e fronteiras relevantes do código. Testes lidos sustentam intenção de cobertura, não execução aprovada nesta rodada.
4. Quando um guia antigo diverge do código, registrar a afirmação anterior e a referência atual com caminho e linhas/símbolo. Atualizar a referência compilada da wiki; não alterar o documento histórico ou um contrato reservado para simular aprovação.
5. Registrar fatos verificáveis sobre implementação presente. Runtime, credencial, custo faturado, inferência real, ordens e lucro continuam desconhecidos sem evidência nova. Relatos antigos não são reexecutados por leitura.
6. Não copiar o conteúdo canônico de `docs/sdd/carteira-evidencia/tasks.md`; manter link ao plano. Não reescrever a mensagem central Kuru/Monad/300ms nem resolver tensões de escopo unilateralmente.

## Formato da página

Português, escaneável, idealmente 80 a 160 linhas, máximo 200. Frontmatter obrigatório: `title`, `created: 2026-10-13`, `updated: 2026-10-13`, `type: concept`, `tags` do schema, `sources` com caminhos reais repo-relative e `confidence: medium`. Usar arrays JSON em `tags` e `sources`. Não usar ponto mediano, travessão ou meia-risca no texto criado.

Seções mínimas:

- definição e mapa do tema;
- estado do código observado e suas fronteiras;
- arquivos/entradas principais, com links Markdown relativos a partir de `docs/concepts/`;
- leitura recomendada dos documentos canônicos;
- divergências documentais e limites da atualização;
- verificação e manutenção (comandos apenas quando verificados no manifesto ou testes, sem executar o produto);
- relações: pelo menos dois wikilinks de slugs existentes no índice, incluindo `manutencao-da-documentacao` quando não for a própria página.

Afirmações usam referências `caminho:linha` reais e marcadores `^[docs/fonte.md]` para parágrafos baseados em três ou mais fontes. Linhas são do working tree observado; não garantem estabilidade após edição concorrente. No frontmatter, fonte de código pode ser `src/...`, `web/...`, `scripts/...` ou `python/...`, além de docs. Todas devem existir. Nenhum nome de API, import, componente ou diagrama pode ser inventado.

## Recibo JSON

Estrutura mínima (não é um resultado pré-fabricado):

- `owner`, `snapshot_head`, `observed_at`, `page`;
- `documents`: **uma entrada para cada** Markdown atribuído: `path`, `read_mode` (`full`, `sections`, `metadata_only`), `classification` (`current_reference`, `historical_evidence`, `frozen_contract`, `proposal`, `stale_reference`, `needs_review`), `reason`, `code_refs` quando houver;
- `code_inspected`: caminhos realmente examinados, sem listar arquivo apenas porque foi atribuído;
- `claims`: fatos principais, cada um com `statement`, `source_path`, `symbol` ou `lines`;
- `documentation_findings`: divergências concretas com paths, classificação e referência atual; não supor que data nova dá precedência;
- `tests_run`: [] se não executados; `verification_scope: static_source_and_document_inspection`;
- `unverified`, `source_drift`, `billed_cost: null`.

O responsável por `manutencao-da-documentacao` não tem corpus de produto; deve revisar schema, catálogos e verificador, criar o procedimento de atualização seguro, revisar exemplos reais de links/taxonomia e apresentar limitações. Não editar o verificador compartilhado; relatar correções ao integrador.

## Limites de ferramentas e finalização

Não consultar provedores, Web3, RPC, modelos, credenciais, `.env`, browser autenticado ou dados privados de carteira. Orçamento de chamadas pagas adicionais: nenhum. Não rodar suites de produto em paralelo; o integrador fará a verificação cabível e documentará o resultado. Usar ferramentas locais e leitura delimitada. Não usar output inventado.

Ao terminar, conferir o próprio Markdown e JSON contra o contrato e retornar **os dois caminhos absolutos**, contagens programáticas de documentos classificados e arquivos realmente inspecionados, principais achados e limites. O retorno é self-report; o integrador lê e verifica os arquivos antes de concluir. Se não puder cobrir parte do escopo, registrar `needs_review` e o motivo, sem certificar o que não foi feito.

Ver também [[manutencao-da-documentacao]] e [[governanca-e-historico]].
