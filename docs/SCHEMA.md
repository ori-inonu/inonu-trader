---
title: "Schema da wiki documental do Inonu Trader"
created: 2026-10-13
updated: 2026-10-15
type: summary
tags: [documentacao, governanca]
sources: [docs/_meta/source-manifest-20261013.json, docs/_meta/organization-spec.md, docs/_meta/project-state-reconciled-final-20261013.json, docs/_meta/source-drift-20261013.json]
confidence: medium
---

# Schema da wiki documental do Inonu Trader

## Domínio e localização

Esta wiki organiza a documentação do projeto Inonu/Jev Trader. Sua raiz é `docs/`, explicitamente escolhida pelo pedido desta conversa, sem modificar `WIKI_PATH`, o cofre pessoal ou a configuração do Obsidian. O vault de projeto já existente em `docs/.obsidian/` permanece intocado.

Orientação em cada sessão: ler este arquivo, [[index]] e as últimas entradas de [[log]] antes de consultar ou modificar as páginas compiladas.

## Três camadas e compatibilidade

1. **Fontes originais in-place:** os arquivos anteriores a esta organização continuam nos caminhos originais. Não são movidos para `raw/`, não recebem frontmatter novo e não são copiados. Contratos, evidências e reservas canônicas continuam valendo. `_meta/source-manifest-20261013.json` guarda o SHA-256 inicial e nunca é rebaselinado silenciosamente. Fontes posteriores ficam em manifestos aditivos; hashes divergentes ficam em `_meta/source-drift-20261013.json`, sem inferir autoria.
2. **Wiki compilada:** `concepts/` reúne sínteses e mapas por tema. `_meta/catalogs/` cataloga cada fonte ou artefato com link e função documental; `_meta/catalog.json` é sua forma legível por máquina. `index.md`, `_meta/topic-map.md` e `README.md` são a navegação. `entities/`, `comparisons/` e `queries/` ficam disponíveis para futuras sínteses que justifiquem páginas próprias.
3. **Schema:** este arquivo define taxonomia, convenções e política de atualização.

`raw/` é reservado a novas capturas externas. Esta adaptação explícita da skill llm-wiki evita duplicar planos canônicos e quebrar as referências existentes. A organização trata as fontes anteriores como somente leitura, mas não presume que seus donos deixarão de atualizá-las.

## Convenções das páginas novas

- Arquivos em minúsculas com hífens; preservar exatamente os nomes e identificadores das fontes.
- Frontmatter obrigatório: `title`, `created`, `updated`, `type`, `tags`, `sources` e `confidence`.
- Tipos: `entity`, `concept`, `comparison`, `query`, `summary`.
- Datas no formato `YYYY-MM-DD`; atualizar `updated` quando a síntese mudar.
- `sources` contém caminhos relativos à raiz do repositório, por exemplo `docs/OKX-SPEC.md`; todos devem existir.
- Tags e listas de fontes preferem arrays JSON compatíveis com YAML para verificação sem dependências.
- Pelo menos dois `[[wikilinks]]` distintos por página de conteúdo. Usar slugs únicos; não usar `[[SPEC]]` ou outro nome ambíguo de fonte.
- Para fontes, usar links Markdown relativos; para a rede da wiki, usar wikilinks. Isso mantém os catálogos utilizáveis no editor e a rede no Obsidian.
- Sínteses de três ou mais fontes incluem marcadores `^[docs/caminho-da-fonte.md]` nos parágrafos derivados. A leitura sugerida fornece os links clicáveis correspondentes.
- Não usar ponto mediano, travessão ou meia-risca no texto criado. Não normalizar identificadores de fontes.
- Máximo desejado de 200 linhas por página compilada; catálogos têm no máximo 50 entradas por arquivo.
- Toda página nova entra em `index.md` ou, para catálogos paginados, no diretório `_meta/topic-map.md` diretamente acessível pelo índice.
- Registrar cada lote e todos os arquivos criados/atualizados em `log.md`; o log é append-only, salvo rotação documentada.

## Taxonomia fechada

- `documentacao`
- `governanca`
- `carteira`
- `defi`
- `jev`
- `analytics`
- `desktop`
- `integracao`
- `interface`
- `pesquisa`
- `dados`
- `onchainos`
- `operador`
- `evidencia`
- `seguranca`
- `risco`
- `backtest`
- `relatorio`

Adicionar uma tag aqui **antes** de usá-la. Temas não são exclusões de escopo: cada arquivo recebe um tema primário para a contagem, mas a wiki relaciona temas transversais.

## Função documental não é estado de implementação

O catálogo classifica `contrato`, `plano`, `proposta`, `guia`, `pesquisa`, `checkpoint`, `revisao`, `evidencia`, `registro-governanca` e `decisao-arquitetural`. Artefatos usam sua natureza: evidência estruturada, log, imagem, ferramenta ou manifesto. Essa classificação é navegacional e não decide precedência, aprovação ou conclusão.

Sempre separar:

- **contrato/critério:** o que deve acontecer;
- **registro datado:** o que uma sessão observou;
- **estado presente:** exige evidência nova no alvo exato;
- **configuração, carga em sessão nova, funcionamento ao vivo e ganho medido:** estados distintos.

Títulos como `FINAL`, `ACCEPTANCE` ou `VERIFICATION` não autorizam tratar a meta como concluída. A data mais nova é uma pista; vínculo ao requisito, revisão e fonte explícita determinam a interpretação.

## Criação e atualização

Criar página quando um tema/entidade é central a uma fonte ou aparece em pelo menos duas. Não criar uma página por checkpoint, execução, data ou hash. Usar catálogo para documentos pequenos e artefatos. Não arquivar ou apagar fonte sem autorização própria.

Ao observar incompatibilidade: citar os dois caminhos, suas datas/escopos e a limitação. Usar `contested: true` e `contradictions: [...]` apenas quando há contradição substantiva **não resolvida**, não para diferenças de escopo ou cronologia. `confidence: medium` é o padrão das sínteses documentais; isso não calibra o modelo nem comprova o produto.

Fontes que mudam por outra sessão devem ser relidas antes de atualizar uma síntese. Registrar deriva e uma nova captura versionada quando autorizado. Não substituir o manifesto inicial nem corrigir a fonte para satisfazer o hash. A manutenção pode registrar uma fonte ainda não lida como `needs_review`; inventário por caminho não equivale a revisão semântica.

## Snapshot e reconciliação

O snapshot reconciliado de 2026-10-13 em `_meta/project-state-reconciled-final-20261013.json` observa o working tree, inclusive arquivos locais e não rastreados: 1.222 caminhos de código/configuração/testes/fixtures e 1.081 fontes documentais visíveis, compostas por 446 Markdown e 635 artefatos. Cinco arquivos ocultos do Obsidian estão no manifesto de hashes, mas fora da navegação. O manifesto inicial é de 988 caminhos; novas fontes foram acrescentadas em registros separados. Os números são um retrato com data, não monitoramento contínuo.

Na última validação registrada, `ok: true` e `navigation_ok: true` indicam integridade estrutural, enquanto `preservation_ok: false` indica diferenças de bytes em relação às referências imutáveis. Os 13 caminhos divergentes estão registrados e `drift_inventory_ok: true`; não ocultar essa diferença para obter aprovação. `check-current.py` compara caminhos e hashes do snapshot mais recente, sem avaliar conteúdo, runtime ou autoria.

## Extensão de evolução (2026-10-15)

A camada aditiva `_meta/evolucao/` organiza versão/milestone, pacote, agrupamento nativo e tarefa. Entradas: [[evolucao-do-projeto]] e [[estado-atual-do-projeto]]. Os catálogos e as contagens de 2026-10-13 acima permanecem históricos, não baseline substituída.

- `type: entity` continua válido; `entity_kind` detalha versão, pacote, fase, milestone nativo, onda, objetivo ou tarefa. A referência v0.0.1 é explicitamente não comprovada, não uma release inventada.
- Cada tarefa tem namespace de pacote e `original_id` preservado. Itens sem ID recebem `item-*` apenas como navegação, claramente rotulados. Não renumerar A0.1, T1.1, T00 ou F1a para parecer um histórico uniforme.
- Estado declarado, classificação documental e implementação verificada são campos diferentes. A organização não verifica execução de tarefas de produto. `implementation_verified: false` significa não verificada por este trabalho, não prova de ausência de implementação.
- Versão em package.json, nome de instalador, revisão de módulo e release publicada são fatos distintos. Sem vínculo comprovado, `release_assignment: nao_atribuida`. Não inventar um cutoff nem uma v0.0.3.
- Relações de substituição são parciais, com escopo, fonte e linha; contradição não resolvida fica visível. Fonte mais nova sozinha não concede autorização nem apaga critérios antigos.
- `curation.json` guarda síntese e decisões de classificação verificadas pelo integrador; `graph.json` guarda fontes, entidades, relações e limites; `outputs.json` guarda hashes dos derivados que o compilador pode substituir.
- O inventário cobre fontes visíveis e artefatos. A extração de tarefas cobre os sete arquivos dedicados e fatias E/F explicitamente selecionadas; não afirma extrair toda menção informal nem transformar hipóteses em tarefas aprovadas.
- Originais permanecem in-place e não são copiados para novos planos. Página de tarefa é ponteiro mínimo para a fonte canônica, não novo executor nem novo contrato.
- Fonte sensível recebe só caminho; o compilador não a lê nem calcula seu hash. `.obsidian` não é alterado. Páginas e catálogos novos têm nomes únicos, sem criar outro `index.md` ambíguo.
- Leituras de caminhos da curadoria são confinadas à raiz e recusam fontes sensíveis/privadas antes de abrir. Inventário sensível contém somente o caminho, sem propagar hash ou revisão legados.
- Os seis controles estáticos da evolução entram como inputs de fonte. Derivados são excluídos por registro individual; arquivos novos não registrados em `_meta/evolucao/` são inventariados, e a cobertura usa enumeração independente.
- Recompilação é sob demanda, offline e explícita. Não alterar nem ocultar falhas do verificador legado para apresentar validação global verde.

Comandos e limites: [[_meta/evolucao/RUNBOOK]].

## Verificação e manutenção

Comandos offline: `python -B docs/_meta/tools/verify.py --output docs/_meta/verification.json`, `python -B docs/_meta/tools/verify.test.py` e `python -B docs/_meta/tools/check-current.py`. O verificador confere cobertura, deriva registrada, links, frontmatter, tags, proveniência, referências de navegação, órfãos e tamanho. O relatório de saída é evidência documental daquela execução, não um teste de produto.

Fontes antigas podem ter links quebrados, duplicatas por hash ou mais de 200 linhas; esses achados aparecem como manutenção, sem provocar remoção automática. A validação atual reporta 25 fontes longas, 7 grupos de Markdown idênticos e 55 alvos locais não resolvidos. O verificador não certifica inexistência de contradições semânticas nem atualidade das fontes externas.

Ao exceder 500 entradas em `log.md`, arquivar como `log-YYYY.md` e criar um log novo com ligação ao anterior; não perder entradas. Consulte [[manutencao-da-documentacao]] para o procedimento e [[governanca-e-historico]] para a interpretação dos registros.
