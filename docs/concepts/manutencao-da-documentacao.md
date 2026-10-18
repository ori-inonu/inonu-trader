---
title: "Manutenção segura da wiki documental"
created: 2026-10-13
updated: 2026-10-13
type: concept
tags: ["documentacao", "governanca"]
sources: ["docs/SCHEMA.md", "docs/README.md", "docs/index.md", "docs/log.md", "docs/_meta/topic-map.md", "docs/_meta/catalog.json", "docs/_meta/source-manifest-20261013.json", "docs/_meta/project-state-20261013.json", "docs/_meta/delegation-contract.md", "docs/_meta/organization-spec.md", "docs/_meta/tools/verify.py", "docs/_meta/catalogs/carteira-e-patrimonio-documentos-01.md", "docs/_meta/catalogs/integracao-real-e-piloto-artefatos-01.md", "docs/_meta/catalogs/relatorios-e-evidencias-artefatos-07.md"]
confidence: medium
---

# Manutenção segura da wiki documental

## Definição e mapa

Este procedimento atualiza a camada compilada sem mover nem reescrever fontes originais. O catálogo organiza fontes para navegação; classificação e contagem não aprovam contratos, não provam estado do produto e não substituem revisão semântica. Consulte [schema](../SCHEMA.md), [README](../README.md), [índice](../index.md) e [mapa completo](../_meta/topic-map.md). ^[docs/SCHEMA.md] ^[docs/_meta/organization-spec.md] ^[docs/README.md]

A wiki fica em `docs/`: `concepts/` guarda sínteses, `_meta/catalogs/` guarda catálogos paginados, e `SCHEMA.md`, `index.md`, `log.md`, `README.md` e `_meta/topic-map.md` formam a navegação. `raw/` é para futuras capturas externas, não para duplicar contratos existentes. ^[docs/SCHEMA.md] ^[docs/_meta/topic-map.md] ^[docs/index.md]

## Limites de ownership

A atribuição observada em `docs/_meta/project-state-20261013.json:17393-17398` reserva para esta frente apenas esta página e `docs/_meta/audits/manutencao-da-documentacao.json`; os arrays de fontes, documentos e artefatos atribuídos estão vazios. O contrato permite a cada frente escrever apenas sua página e recibo. `SCHEMA.md`, `README.md`, `index.md`, `log.md`, catálogos e metadados compartilhados ficam com o integrador. ^[docs/_meta/project-state-20261013.json] ^[docs/_meta/delegation-contract.md] ^[docs/_meta/organization-spec.md]

Portanto, não esperar nem incorporar alterações das outras frentes como evidência desta auditoria. Entregar achados ao integrador; não editar arquivos originais, zonas congeladas ou os outputs de outros responsáveis. Antes de criar um output exclusivo, confira que ele ainda não existe. Consulte também o [log](../log.md). ^[docs/_meta/delegation-contract.md] ^[docs/_meta/organization-spec.md]

## Procedimento executável

1. Na raiz do repositório, leia `docs/SCHEMA.md`, `docs/index.md` e as entradas recentes de `docs/log.md`. Confirme no snapshot o owner, as fontes atribuídas e os caminhos de escrita autorizados. A classificação documental não define precedência por data ou por nome de arquivo. ^[docs/SCHEMA.md] ^[docs/_meta/project-state-20261013.json] ^[docs/_meta/organization-spec.md]

2. Rode o preflight read-only abaixo. Confirme que o recibo existe e que lista todos os outputs compartilhados que serão escritos:

```bash
python -c "from pathlib import Path; p=Path('docs/_meta/generated-files.json'); print('READY' if p.is_file() else 'BLOCKED: docs/_meta/generated-files.json is missing')"
```

3. Se imprimir `BLOCKED`, não rode o verificador nem adivinhe ownership. O recibo existe na reconciliação atual em `docs/_meta/generated-files.json`; a observação anterior de arquivo ausente é histórica. Confirme que o recibo cobre os outputs do lote antes de escrever. `verify.py` lê esse arquivo antes das verificações (`docs/_meta/tools/verify.py:82-107`). ^[docs/_meta/tools/verify.py] ^[docs/SCHEMA.md] ^[docs/_meta/delegation-contract.md]

4. Atualize somente a síntese autorizada. Mantenha caminhos originais e o manifesto SHA-256 inicial. Registre novas fontes em um manifesto aditivo, e hashes diferentes em `source-drift-20261013.json`; a atribuição de autoria fica desconhecida sem evidência. Não restaure fontes nem altere o baseline para obter resultado verde. Use caminhos existentes relativos à raiz do repositório. ^[docs/SCHEMA.md] ^[docs/_meta/source-manifest-20261013.json] ^[docs/_meta/source-drift-20261013.json] ^[docs/_meta/organization-spec.md]

5. Para páginas novas, respeite campos, datas, tipos e tags de `SCHEMA.md`, inclua ao menos dois wikilinks de saída distintos e marcadores de proveniência quando aplicável. Prefixos aceitos atualmente: `docs/`, `src/`, `scripts/`, `web/`, `python/` e `installer/`. O verificador confirma existência do caminho, não se a afirmação corresponde ao conteúdo citado. ^[docs/SCHEMA.md] ^[docs/_meta/tools/verify.py]

6. Um integrador atualiza índice, mapa, catálogos, status, recibos e log como lote serializado. Cada fonte visível deve aparecer exatamente uma vez; mantenha até 50 entradas por catálogo, contagens atuais e links relativos resolvíveis. Não rebaseie hashes em resposta a escrita concorrente. ^[docs/_meta/catalog.json] ^[docs/_meta/topic-map.md] ^[docs/_meta/catalogs/carteira-e-patrimonio-documentos-01.md] ^[docs/_meta/catalogs/integracao-real-e-piloto-artefatos-01.md]

7. Depois de todos os escritores pararem e os outputs constarem no recibo compartilhado, rode da raiz:

```bash
python -B docs/_meta/tools/verify.py --output docs/_meta/verification.json
```

`ok: true` significa que cobertura, links, metadados e inventário de deriva passaram; não significa preservação byte a byte. Leia separadamente `navigation_ok`, `drift_inventory_ok` e `preservation_ok`. Se houver deriva registrada, é correto que `preservation_ok` seja `false`; não remova a advertência para forçar um resultado verde. `--output` só pode gravar recibos declarados em `writable_receipts`. A execução valida documentação, não executa testes nem o produto. ^[docs/_meta/tools/verify.py] ^[docs/_meta/generated-files.json] ^[docs/SCHEMA.md] ^[docs/README.md]

8. Se a árvore compartilhada mudar durante a verificação, descarte o relatório e repita em janela sem escrita concorrente. O verificador não obtém lock nem compara um snapshot atômico dos inputs. Preserve e reporte divergências; não use `git checkout`, reset, rebaselining ou edição de fontes para silenciá-las. ^[docs/_meta/tools/verify.py] ^[docs/_meta/source-manifest-20261013.json] ^[docs/_meta/organization-spec.md]

## Auditoria atual dos catálogos e baseline

O snapshot reconciliado lista 1.081 fontes visíveis, 446 Markdown e 635 artefatos, em 38 catálogos paginados. O baseline inicial continua com 988 caminhos, incluindo cinco configurações `.obsidian` fora da navegação; manifestos aditivos registram as fontes posteriores. O verificador percorreu 1.081 links de fonte, sem duplicatas ou links inválidos nos catálogos. A busca legada continua sinalizando 25 documentos longos, 7 grupos de Markdown idênticos e 55 links locais não resolvidos; não corrigi referências históricas automaticamente. Isso valida navegação do snapshot, não leitura semântica de cada fonte. ^[docs/index.md] ^[docs/_meta/topic-map.md] ^[docs/_meta/catalog.json] ^[docs/_meta/source-manifest-20261013.json] ^[docs/_meta/source-additions-reconciled-20261013.json] ^[docs/_meta/source-additions-post-reconcile-20261013.json] ^[docs/_meta/verification.json]

O relatório atual registra 13 divergências entre hashes observados e os manifestos de referência, sem fontes ausentes e sem deriva não registrada. Os caminhos completos e hashes estão em `source-drift-20261013.json`; a causa e a autoria não foram inferidas. Inclui dois arquivos `.obsidian`; eles não entram na navegação e não foram abertos nem editados por esta tarefa. `preservation_ok` fica `false` enquanto os bytes diferirem do baseline imutável. ^[docs/_meta/source-manifest-20261013.json] ^[docs/_meta/source-drift-20261013.json] ^[docs/_meta/verification.json] ^[docs/_meta/tools/verify.py]

## Limites do verificador

- A cobertura compara caminhos, detecta duplicatas e verifica todos os links Markdown renderizados dos catálogos. O verificador também impõe o teto de 50 entradas por catálogo e confere contagens estruturais do catálogo; não prova que os números do índice descrevam conteúdo semântico (`docs/_meta/tools/verify.py:82-143, 194-215`).
- A preservação calcula hashes dos originais contra o manifesto, inclusive os ocultos, mas não autentica o próprio manifesto. O manifesto não lista a si mesmo, o catálogo JSON nem o verificador. Proteja esse baseline por revisão independente e nunca o regrave silenciosamente (`docs/_meta/tools/verify.py:67-81`; `docs/_meta/source-manifest-20261013.json:8-9`).
- O parser de frontmatter é simplificado. Verifica chaves, tipo, datas, confiança, tags e existência de fontes; não valida YAML completo, unicidade de chaves, conteúdo citado ou validade de símbolos/linhas. Proveniência reconhece caminhos existentes sob `docs/`, `src/`, `scripts/`, `web/`, `python/` e `installer/` (`docs/_meta/tools/verify.py:14-18, 30-65, 172-178`).
- Wikilinks são inspecionados nas páginas geradas registradas. Links ambíguos ou quebrados são erros e o mínimo de saída usa destinos distintos. Ocorrências repetidas não são reportadas como duplicatas. A presença de uma página no índice/mapa é testada por substring do nome, não por resolução real do link (`docs/_meta/tools/verify.py:94-100, 122-150`).
- Links Markdown legados são avaliados por alvo de arquivo local. Âncoras, URLs externas, intenção histórica, comentários HTML e atualidade semântica não são certificados; links quebrados precisam de triagem humana antes de qualquer correção (`docs/_meta/tools/verify.py:25-26, 68-80, 221-227`). Não há detecção automática de contradições nem de fontes obsoletas por data.
- A opção `--output` restringe sobrescritas no repositório a `writable_receipts` declarados; o verificador não protege contra escrita concorrente durante a leitura (`docs/_meta/tools/verify.py:239-258`).

## Guarda contra deriva concorrente

Use um único escritor para `SCHEMA.md`, índice, mapa, catálogos, manifesto, recibos e log. Antes do lote, registre os SHA-256 dos inputs compartilhados; rode uma vez após cessar as escritas e compare os mesmos hashes depois. Se qualquer input mudou durante a varredura, descarte o recibo, identifique o owner e repita sem reverter mudanças alheias. Este controle de janela e comparação pré/pós é uma recomendação operacional, não uma função já implementada pelo verificador. ^[docs/_meta/tools/verify.py] ^[docs/_meta/organization-spec.md] ^[docs/_meta/source-manifest-20261013.json]

## Referências

- [Schema](../SCHEMA.md), [README](../README.md), [índice](../index.md), [log](../log.md) e [mapa de temas](../_meta/topic-map.md).
- [Contrato de ownership](../_meta/delegation-contract.md), [critérios de organização](../_meta/organization-spec.md), [manifesto de hashes](../_meta/source-manifest-20261013.json) e [verificador](../_meta/tools/verify.py).
- [[index]] e [[log]].
