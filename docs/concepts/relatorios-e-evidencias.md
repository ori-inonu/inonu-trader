---
title: "Relatórios e interpretação de evidências"
created: 2026-10-13
updated: 2026-10-13
type: concept
tags: ["relatorio", "evidencia", "seguranca", "dados"]
sources: ["src/mobile-decision-report/report.ts", "src/mobile-decision-report/export.ts", "src/mobile-decision-report/export.test.ts", "src/mobile-decision-report/report.test.ts", "src/mobile-decision-report/fixtures.ts", "src/mobile-decision-report/example.ts", "src/mobile-decision-report/preview.ts", "src/dashboard/reports-server.ts", "src/dashboard/reports-server.test.ts", "scripts/reports-server.ts", "scripts/reports-server.test.ts", "src/operator/http.ts", "src/operator/insights.ts", "src/system-one/http.ts", "src/system-one/public-view.ts", "web/src/lib/dex-report.ts", "package.json", "docs/REPORTS-SERVER.md", "docs/mobile-decision-report/README.md", "docs/mobile-decision-report/SPEC.md", "docs/mobile-decision-report/CHECKPOINT.md", "docs/evidence/web3-integration-20261010/inventory-seam-20261010/REPORT.md", "docs/evidence/web3-integration-20261010/served-surface/REPORT.md", "docs/_meta/catalog.json", "docs/_meta/catalogs/relatorios-e-evidencias-documentos-01.md", "docs/_meta/catalogs/relatorios-e-evidencias-artefatos-01.md", "docs/_meta/catalogs/relatorios-e-evidencias-artefatos-02.md", "docs/_meta/catalogs/relatorios-e-evidencias-artefatos-03.md", "docs/_meta/catalogs/relatorios-e-evidencias-artefatos-04.md", "docs/_meta/catalogs/relatorios-e-evidencias-artefatos-05.md", "docs/_meta/catalogs/relatorios-e-evidencias-artefatos-06.md", "docs/_meta/catalogs/relatorios-e-evidencias-artefatos-07.md"]
confidence: medium
---

# Relatórios e interpretação de evidências

## Mapa do código observado

Há duas superfícies distintas. O módulo [mobile-decision-report](../../src/mobile-decision-report/report.ts) projeta uma entrada explícita para JSON ou HTML estático offline. O servidor [reports-server](../../src/dashboard/reports-server.ts), iniciado pela [CLI](../../scripts/reports-server.ts), disponibiliza relatórios já gravados de Operator e System One. O servidor não importa o exportador móvel nem oferece rota para ele: não há integração entre esses caminhos no grafo inspecionado. `package.json:58` liga `reports:serve` à CLI. [^1]

O exemplo e o preview são outra rota separada: [example.ts](../../src/mobile-decision-report/example.ts) escreve HTML, JSON e fixtures sintéticos; [preview.ts](../../src/mobile-decision-report/preview.ts) serve somente o HTML de exemplo em loopback, GET `/`, sem dados de usuário. Não são produtores de evidência de mercado. `src/mobile-decision-report/example.ts:4-18`; `src/mobile-decision-report/preview.ts:1-15`.

## Exportador offline: proveniência e segurança

- `projectMobileDecisionReport` aceita `mobile_decision_input_v1`, usa allowlist de campos próprios de dados, rejeita estruturas inválidas com erro constante e projeta novamente a entrada em cada exportação. Reutiliza `parseDexReport` de [dex-report.ts](../../web/src/lib/dex-report.ts) para validar o contrato DEX e relações declaradas. `src/mobile-decision-report/report.ts:34-53,130-178`; `web/src/lib/dex-report.ts:168-255`.
- O relógio da fonte e o horário de coleta permanecem campos separados. Idade, freshness, validade e alertas derivam de valores explícitos e de `now_ms`; o HTML não reavalia o snapshot depois de gerado. `src/mobile-decision-report/report.ts:141-164,165-176`; `src/mobile-decision-report/export.ts:52,59`.
- SHA-256 vincula o envelope e fatos projetados, mas não autentica produtor ou origem. A origem importada, o rótulo DEX, fontes e recibo JEV continuam não verificados; JEV ausente é `not_evaluated`, não uma inferência executada. `src/mobile-decision-report/report.ts:136-146,165-175`; `src/mobile-decision-report/export.ts:57,61,63`. Custos nulos, cobertura total e quota permanecem desconhecidos; execução é `not_qualified` e o rascunho humano não concede autorização. `src/mobile-decision-report/report.ts:14,24-25,170-176`; `src/mobile-decision-report/export.ts:62,64`.
- HTML insere texto por helpers de escape e normalização de pontuação. O template usa CSS fixo, CSP com scripts e conexões externas bloqueados, sem script, formulário, imagem ou recurso remoto; as escolhas e notas ficam no DOM e são descartadas ao fechar ou recarregar. `src/mobile-decision-report/export.ts:3-11,35-38,54-66`. Os testes-fonte contêm regressões de escape e campos extras, mas não foram executados nesta auditoria. `src/mobile-decision-report/export.test.ts:26-39`.

Esses limites separam consistência estrutural de autenticidade e atualidade. Um campo `okx_authenticated`, hash, screenshot ou texto de revisão não vira prova de API, carteira, saldo ou transação só por estar no relatório. O checkpoint offline e a SPEC fixam esse limite para o candidato que descrevem. `docs/mobile-decision-report/SPEC.md:15-34`; `docs/mobile-decision-report/CHECKPOINT.md:7-13,50-72`. ^[docs/mobile-decision-report/SPEC.md]

## Servidor de relatórios atual

A CLI declarada em `package.json:58` usa `--no-env-file --no-install`; `scripts/reports-server.ts:14-47` só inicia sob `import.meta.main`, aceita diretório absoluto, porta e origins locais explícitas. `src/dashboard/reports-server.ts:39-78` liga Bun em `127.0.0.1`, limita Host e Origin, responde com `no-store`, aceita GET/OPTIONS nas rotas conhecidas e não publica feed, escrita ou execução. As rotas observadas são `/`, `/health`, `/operator`, `/operator/history`, `/operator/insights` e `/system-one`. `src/dashboard/reports-server.ts:24-37,46-76`; `docs/REPORTS-SERVER.md:30-46`.

Loopback e CORS não são autenticação. A CLI passa `token: null` ao handler Operator; `/operator` devolve o JSON inteiro de `operator/latest.json`, e history lê o journal, sem projeção de campos. `src/dashboard/reports-server.ts:62-65`; `src/operator/http.ts:71-87`. A rota System One usa projeção explícita e limita texto livre, mas ainda publica campos selecionados de carteira, inventário e decisão. A ausência de Origin recebe tratamento local no wrapper. `src/dashboard/reports-server.ts:65-70`; `src/system-one/http.ts:15-27`; `src/system-one/public-view.ts:21-64`. Portanto, trate o diretório configurado como dado sensível, mantenha o servidor no computador local e não o exponha por proxy ou túnel. O guia local também alerta que endereço e inventário podem aparecer. `docs/REPORTS-SERVER.md:19,40,42,46`. ^[docs/REPORTS-SERVER.md]

`/operator/insights` é estatística descritiva sobre ciclos persistidos: os comentários e a implementação distinguem médias de estimativas de previsão e contam realizados somente em resultados reconciliados. Não leia `realized`, médias, decisões ou imagens antigas como lucro atual. `src/operator/insights.ts:3-7,78-87,117-143`.

## Como interpretar o acervo

O ownership e os catálogos atribuem 23 Markdown e 327 artefatos a este tema. Os papéis dos Markdown são 10 evidências, 9 revisões, 1 checkpoint, 2 guias e 1 contrato. Os metadados dos artefatos agrupam 121 evidências estruturadas, 124 logs, 47 imagens, 23 registros textuais, 7 ferramentas, 4 journals e 1 relatório HTML. Catálogos: [documentos](../_meta/catalogs/relatorios-e-evidencias-documentos-01.md), artefatos [01](../_meta/catalogs/relatorios-e-evidencias-artefatos-01.md), [02](../_meta/catalogs/relatorios-e-evidencias-artefatos-02.md), [03](../_meta/catalogs/relatorios-e-evidencias-artefatos-03.md), [04](../_meta/catalogs/relatorios-e-evidencias-artefatos-04.md), [05](../_meta/catalogs/relatorios-e-evidencias-artefatos-05.md), [06](../_meta/catalogs/relatorios-e-evidencias-artefatos-06.md), [07](../_meta/catalogs/relatorios-e-evidencias-artefatos-07.md).

Nesta auditoria, os 327 artefatos foram consultados somente como metadados de catálogo. Nenhum JSON, JSONL, log, screenshot ou arquivo de mercado foi aberto. Assim, os totais organizam a navegação, não validam o conteúdo, a autoria, a execução, o resultado financeiro ou o estado presente. O caminho resumido `docs/sources/artefacts` não existe nesta worktree; o escopo efetivo foi obtido de `owners[relatorios-e-evidencias]` no snapshot e aponta para os caminhos listados no recibo. ^[docs/_meta/catalogs/relatorios-e-evidencias-artefatos-01.md]

Os relatórios de verificação e screenshots registram sessões anteriores, versões e fixtures específicas. Por exemplo, o relatório de superfície servida descreve captures com carteira sintética e feed offline; isso não foi repetido nem inspecionado em pixels aqui. `docs/evidence/web3-integration-20261010/served-surface/REPORT.md:7-25,59-81`. O checkpoint do exportador relata verificações offline do candidato v2, mas esta auditoria não rodou Bun, testes, navegador, servidor ou produtor. `docs/mobile-decision-report/CHECKPOINT.md:15-50`; `docs/evidence/web3-integration-20261010/inventory-seam-20261010/REPORT.md:26-49`. ^[docs/mobile-decision-report/CHECKPOINT.md]

## Divergência documental e manutenção

`docs/mobile-decision-report/README.md:29` diz que `src/dashboard/reports-server.ts` não existe neste checkout. Essa afirmação está desatualizada: o arquivo existe no snapshot atual e a CLI está registrada em `package.json:58`. Continua correto que o exportador móvel não está ligado a produtor ou rota: o servidor atual registra apenas as rotas Operator e System One. Recomenda-se corrigir essa frase no guia, sem alterar este contrato de auditoria.

`docs/mobile-decision-report/SPEC.md:7-10` também registra a ausência do servidor, mas descreve o checkout e baseline da entrega offline de 2026-10-11. É contrato congelado, não inventário da worktree atual; manter sua referência histórica distinta. `docs/REPORTS-SERVER.md` é o guia atual de consulta ao servidor local, mas não prova que exista processo ativo. `docs/mobile-decision-report/README.md` é referência histórica parcialmente obsoleta. ^[docs/mobile-decision-report/README.md]

Nesta captura, SHA-256 dos 11 caminhos de código atribuídos coincide com o snapshot `00a593bcabe25dbb6d83795268533551098f645b`. Isso confirma identidade dos arquivos comparados, não execução dos testes. `tests_run` permanece vazio no recibo.

## Relações

Leia também [[seguranca-e-qualificacao]], [[fita-e-decisao-jev]], [[governanca-e-historico]] e [[manutencao-da-documentacao]].

[^1]: Links de código são relativos a `docs/concepts/`; linhas citadas referem-se à worktree observada em 2026-10-13 e podem mudar depois.