---
title: "Auditoria integrada da documentação"
created: 2026-10-13
updated: 2026-10-13
type: summary
tags: ["documentacao", "governanca"]
sources: ["docs/_meta/integration-review.json", "docs/_meta/document-status.json", "docs/_meta/generated-files.json"]
confidence: medium
---

# Auditoria integrada da documentação

## Entrega e cobertura

- 15 subagentes paralelos concluíram suas frentes; todas as páginas e recibos foram lidos pelo integrador.
- 412 Markdown e 579 artefatos visíveis, 991 fontes no catálogo; cinco configurações ocultas do Obsidian ficam fora da navegação.
- 14 mapas temáticos de produto, uma página de manutenção e 36 catálogos paginados.
- Cada Markdown possui classificação primária, motivo, modo de leitura, owner e recibo em [document-status.json](document-status.json). Artefatos têm inventário e natureza; isso não equivale a revisão de seu conteúdo.
- O snapshot de integração contém 1073 caminhos de primeira parte/configuração/testes/fixtures, incluindo mudanças locais. Inspeção de código é seletiva, não prova leitura exaustiva ou ausência de defeitos.

## Preservação e deriva

Nenhuma fonte foi movida, renomeada ou excluída pela organização. O manifesto inicial não foi regravado. Acréscimos concorrentes têm manifestos separados; fontes que mudaram foram relidas, sem restauração ou rebaselining. A verificação estrita continua acusando diferenças do baseline mesmo depois de catalogar o estado novo.

As diferenças observadas abrangem `CHECKPOINT.md`, `TASKS.md`, duas evidências do desktop e duas configurações do Obsidian. A causa/autor de cada escrita não é inferido. Os conteúdos do Obsidian não foram lidos nem editados; somente hashes foram comparados. Não declarar preservação byte a byte global enquanto esses seis hashes diferirem.

## Validação

O recibo [verification.json](verification.json) registra o resultado real do lint offline. O campo `navigation_ok` separa cobertura/links/metadados de `preservation_ok`; `ok` exige os dois, e diferenças do baseline continuam levando a saída não zero. A execução e o resumo final são registrados no checkpoint e no log, sem substituir o resultado por um valor inventado.

O verificador foi ampliado para arrays multiline e listas YAML de frontmatter, links exatos de navegação, duplicatas de outputs, catálogos acima de 50 entradas, proveniência de código e proteção de `--output`. A saída só pode sobrescrever o recibo JSON autorizado no repositório, não fontes nem manifestos.

## Questões mantidas explícitas

Veja [[_meta/currentness]] e [findings.json](findings.json). Os principais pontos são contratos Ecossistema/info-diet, divergência do round-trip DEX, custo misto de inferência, planos antigos da carteira, referências r2/r3 e relatos antigos de servidor ausente. As fontes originais e critérios congelados continuam intactos.

## Limites de execução

Testes/build/typecheck do integrador são evidência do código na janela de execução, não prova de runtime financeiro. Dois subagentes rodaram suites de produto apesar do contrato que reservava isso ao integrador; os resultados e as falhas ficaram nos recibos, sem apagar ou atribuir autorização retroativa.

Não houve nesta organização boot do trader, acesso ao cofre, inferência paga do projeto, ordem, publicação, staging ou commit. O relato novo de chamada acidental ao modelo pertence a outra sessão, está documentado como tal e não aprova T7.8. Custos faturados seguem desconhecidos.

## Manutenção reproduzível

- `python -B docs/_meta/tools/verify.test.py`: regressões sintéticas do verificador.
- `python -B docs/_meta/tools/verify.py`: lint estrito de cobertura, links, metadados e hashes.
- `python -B docs/_meta/tools/check-current.py`: detectar mudanças após o snapshot integrado, sem escrita.

Esses comandos não mantêm a wiki continuamente atualizada nem sobrevivem a restart como executor. Novas fontes ou alterações precisam de outro ciclo de leitura, síntese e registro. Consulte [[manutencao-da-documentacao]] e [[governanca-e-historico]].
