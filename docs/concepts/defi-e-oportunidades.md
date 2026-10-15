---
title: "DeFi e oportunidades: pesquisa, custo e execução"
created: 2026-10-13
updated: 2026-10-13
type: concept
tags: ["defi", "pesquisa", "evidencia", "risco"]
sources:
  - "docs/DEFI-DISCOVERY-INTEGRATION-SPEC-DRAFT-20261011.md"
  - "docs/DEFI-DISCOVERY-SCOPE-REVIEW-20261011.md"
  - "docs/GOAL-RECOVERY-DEFI-CHECKPOINT-20261011-2015.md"
  - "docs/okx-alpha-radar-v1/RESEARCH.md"
  - "docs/okx-defi-v1/AUDITORIA.md"
  - "docs/okx-defi-v1/GUIA.md"
  - "docs/okx-defi-v1/PROPOSTA.md"
  - "docs/okx-defi-v1/RESEARCH.md"
  - "docs/okx-defi-v1/SPEC.md"
  - "docs/okx-defi-v1/VERIFICACAO.md"
  - "docs/OKX-EARN-RESEARCH.md"
  - "docs/okx-ecosystem/GUIA.md"
  - "docs/OKX-ECOSYSTEM-PLAN.md"
  - "docs/OKX-ECOSYSTEM-SPEC.md"
  - "docs/okx-ecosystem-v1/DATA-INTEGRATION-AUDIT.md"
  - "docs/okx-ecosystem-v1/GUIA.md"
  - "docs/okx-ecosystem-v1/SPEC.md"
  - "docs/okx-evidence-v1/AUDITORIA.md"
  - "docs/okx-evidence-v1/CYCLE-REVIEW.md"
  - "docs/okx-evidence-v1/GUIA.md"
  - "docs/okx-evidence-v1/PROPOSTA.md"
  - "docs/okx-evidence-v1/SPEC.md"
  - "docs/okx-evidence-v1/VERIFICACAO.md"
  - "docs/okx-exit-security-v1/RESEARCH.md"
  - "docs/okx-leaderboard-v1/RESEARCH.md"
  - "docs/okx-market-v1/OKX-ECOSYSTEM-15-WORKSTREAMS-20261009.md"
  - "docs/okx-market-v1/OKX-ECOSYSTEM-V1-BASELINE.md"
  - "docs/okx-market-v1/OKX-ECOSYSTEM-V1-CONTRACT-ERRATA.md"
  - "docs/okx-market-v1/OKX-ECOSYSTEM-V1-SPEC.md"
  - "docs/okx-rewards-v1/RESEARCH.md"
  - "docs/okx-signals-v1/AUDITORIA.md"
  - "docs/okx-signals-v1/GUIA.md"
  - "docs/okx-signals-v1/SPEC.md"
  - "docs/okx-signals-v1/VERIFICACAO.md"
  - "docs/OPPORTUNITY-ARCHITECTURE.md"
  - "docs/research/codex-operator-c4-research-20261011/defi-discovery-concrete-seams-20261011.md"
  - "docs/research/codex-operator-c4-research-20261011/docs-research-defi-endpoint-coverage-20261011.md"
  - "docs/research/DEFI-CANDIDATE-BOUNDARY-FINDINGS-20261011.md"
  - "docs/research/OKX-DEFI-ENDPOINT-COVERAGE-20261011.md"
  - "docs/research/OKX-DEFI-WIRING-ADDENDUM-20261011.md"
  - "docs/research/OKX-DEFI-WIRING-INDEPENDENT-REVIEW-20261011.md"
  - "src/okx-defi/fixture.ts"
  - "src/okx-defi/report.test.ts"
  - "src/okx-defi/report.ts"
  - "src/okx-evidence/fixture.ts"
  - "src/okx-evidence/report.test.ts"
  - "src/okx-evidence/report.ts"
  - "src/okx-opportunities.test.ts"
  - "src/okx-opportunities.ts"
  - "src/okx-signals/client.test.ts"
  - "src/okx-signals/client.ts"
  - "src/okx-signals/fixture.ts"
  - "src/okx-signals/report.test.ts"
  - "src/okx-signals/report.ts"
  - "scripts/okx-defi.test.ts"
  - "scripts/okx-defi.ts"
  - "scripts/okx-evidence.test.ts"
  - "scripts/okx-evidence.ts"
  - "scripts/okx-signals.test.ts"
  - "scripts/okx-signals.ts"
  - "src/okx-market/okx-api.ts"
  - "src/okx-market/okx-dex.ts"
  - "src/okx-market/round-trip.ts"
  - "src/okx-market/round-trip.test.ts"
  - "package.json"
confidence: medium
---

# DeFi e oportunidades: pesquisa, custo e execução

## Definição e mapa

Esta página separa cinco coisas que os documentos por vezes aproximam: observação de produto DeFi, sinal histórico, comparação local de fontes, candidato de pesquisa e cotação de troca. Nenhuma delas, por si, é execução, saída vendável ou retorno líquido reconciliado.

O recorte atual tem builders distintos: relatório local DeFi, coleta opcional autenticada de Signals, junção offline de Signals com scanner de tokens, filtro de oportunidade e cenário econômico hipotético. Não há um único builder de ecossistema que reúna DeFi e Signals neste snapshot.

## Código observado

- **DeFi:** `src/okx-defi/report.ts:18-54,137-168` ([código](../../src/okx-defi/report.ts)) mantém Search e Detail como observações separadas, cobertura parcial, associação não verificada, `fee.basis: unknown`, `fee.completeCost: null`, `execution: not_qualified` e resultados de retorno/saída/custo total nulos. `scripts/okx-defi.ts:5-20,78-97` ([CLI](../../scripts/okx-defi.ts)) usa demonstração sintética ou arquivos locais; não implementa cotação ou resgate nesse caminho. ^[docs/okx-defi-v1/SPEC.md] ^[docs/okx-defi-v1/GUIA.md] ^[docs/okx-defi-v1/VERIFICACAO.md]
- **Signals:** `src/okx-signals/client.ts:6-8,19-43` ([cliente](../../src/okx-signals/client.ts)) define requests assinadas para endpoints fixos. `scripts/okx-signals.ts:6-21,29-40` separa modo sintético padrão de `--live` explícito. Mesmo um relatório válido deixa acesso, quota e custo observado como desconhecidos em `src/okx-signals/report.ts:86-120` ([relatório](../../src/okx-signals/report.ts)). A auditoria não fez request. ^[docs/okx-signals-v1/SPEC.md] ^[docs/okx-signals-v1/GUIA.md] ^[docs/okx-signals-v1/VERIFICACAO.md]
- **Evidence:** `src/okx-evidence/report.ts:65-101` ([builder](../../src/okx-evidence/report.ts)) recebe Signals e scanner, revalida a projeção de pesquisa e conserva proveniência não verificada, `execution: not_qualified`, retorno, saída executável e custo de API nulos. Não consome `DefiReport`; `scripts/okx-evidence.ts:42-49` escolhe demo sintética ou importação local. ^[docs/okx-evidence-v1/SPEC.md] ^[docs/okx-evidence-v1/GUIA.md] ^[docs/okx-evidence-v1/VERIFICACAO.md]
- **Oportunidades:** `screenOpportunity` em `src/okx-opportunities.ts:193-255` pode produzir `research_candidate`, mas seu campo de qualificação de execução permanece `not_qualified`. `calculateOpportunityScenario` em `:258-296` recebe preços, tamanho, impostos, slippage, taxas e outros custos como entradas; o resultado é um cenário de fill completo hipotético, não medição desses custos nem forecast. Os testes em `src/okx-opportunities.test.ts:117-155` descrevem exemplos, não foram executados nesta auditoria.

## Contrato de quote e fronteira DeFi

O adapter DEX adjacente define `amount` como inteiro atômico positivo e envia `swapMode=exactIn` e `singleRouteOnly=true`: `src/okx-market/okx-dex.ts:32-43,90-102,323-340` ([adapter](../../src/okx-market/okx-dex.ts)). O retorno bruto do provedor não basta para fixar a unidade de saída.

`quoteRoundTrip` valida rede, identidade, modo e quantidade de entrada; guarda `toTokenAmount` como `rawQuote.outputRaw` com `outputUnit: unknown` e interrompe com `provider_output_unit_unverified` antes de preencher saída atômica, delta, perna dependente ou líquido: `src/okx-market/round-trip.ts:94-111,129-162` ([normalizador](../../src/okx-market/round-trip.ts)). O relatório mantém `legs: []`, custos e cobertura de custo desconhecidos, `netAtomic: null` e execução não qualificada. Os testes lidos em `src/okx-market/round-trip.test.ts:49-57,63-72,254-257,279-296` ([testes](../../src/okx-market/round-trip.test.ts)) afirmam esses limites; não foram rodados.

Esse quote do agregador DEX não é cotação de resgate de um produto Earn. No fluxo DeFi inspecionado, os endpoints são capturas locais de busca e detalhe. A pesquisa de saída registra unidade `toTokenAmount` não demonstrada e taxas estimadas que não equivalem ao custo completo: `docs/okx-exit-security-v1/RESEARCH.md:13-19` ([pesquisa](../okx-exit-security-v1/RESEARCH.md)).

## Pesquisa, custo conhecido e execução

`sourceClaim`, `source: okx_authenticated`, uma associação de identidade ou um timestamp local qualificam a forma declarada dos dados, não a elegibilidade pessoal, a completude do feed ou uma ordem executável. APY anunciado, preço histórico e `indicative_pool` são evidência de pesquisa, não fill. ^[docs/okx-defi-v1/SPEC.md] ^[docs/okx-signals-v1/GUIA.md] ^[docs/okx-evidence-v1/SPEC.md] ^[docs/okx-ecosystem-v1/SPEC.md]

Nenhum custo real foi confirmado nesta auditoria. Em DeFi, uma taxa textual pode existir sem base/unidade suficiente e `totalCosts` continua nulo. Signals deixa `observedApiCostUsd`, acesso e quota desconhecidos. O wrapper DEX retorna `costUsd: null` e `costsCoverage: unknown`. O cenário de `src/okx-opportunities.ts` só calcula a partir das premissas numéricas fornecidas pelo chamador; `passesNetThreshold` não muda `executionQualification`. ^[docs/okx-defi-v1/SPEC.md] ^[docs/okx-signals-v1/SPEC.md] ^[docs/okx-market-v1/OKX-ECOSYSTEM-15-WORKSTREAMS-20261009.md] ^[docs/OPPORTUNITY-ARCHITECTURE.md]

O contrato congelado define os pares Signals/scanner e search/detail em `docs/okx-ecosystem-v1/SPEC.md:9-15` ([SPEC](../okx-ecosystem-v1/SPEC.md)). A GUIA descreve o schema futuro `okx_ecosystem_research_v1`, com `tokenEvidence` e `defi`, em `docs/okx-ecosystem-v1/GUIA.md:24-31`; ela também registra que o comando ainda não foi implementado em `:3-5` ([GUIA](../okx-ecosystem-v1/GUIA.md)). No snapshot observado, `joinEvidence` ainda produz `okx_evidence_offline_v1` para Signals + scanner; o builder DeFi é separado, e o mapa de scripts de `package.json:44-48` não registra `okx:ecosystem`. Isso é uma lacuna entre contrato e implementação, não uma conclusão sobre o produto inteiro. ^[docs/okx-ecosystem-v1/SPEC.md] ^[docs/okx-ecosystem-v1/GUIA.md] ^[docs/okx-evidence-v1/SPEC.md] ^[docs/okx-defi-v1/SPEC.md]

## Classificação dos documentos atribuídos

Cada Markdown atribuído aparece uma vez abaixo. A classificação é de função para esta auditoria, não precedência nem prova de execução.

- [docs/DEFI-DISCOVERY-INTEGRATION-SPEC-DRAFT-20261011.md](../DEFI-DISCOVERY-INTEGRATION-SPEC-DRAFT-20261011.md) [proposal]
- [docs/DEFI-DISCOVERY-SCOPE-REVIEW-20261011.md](../DEFI-DISCOVERY-SCOPE-REVIEW-20261011.md) [historical_evidence]
- [docs/GOAL-RECOVERY-DEFI-CHECKPOINT-20261011-2015.md](../GOAL-RECOVERY-DEFI-CHECKPOINT-20261011-2015.md) [historical_evidence]
- [docs/okx-alpha-radar-v1/RESEARCH.md](../okx-alpha-radar-v1/RESEARCH.md) [historical_evidence]
- [docs/okx-defi-v1/AUDITORIA.md](../okx-defi-v1/AUDITORIA.md) [historical_evidence]
- [docs/okx-defi-v1/GUIA.md](../okx-defi-v1/GUIA.md) [current_reference]
- [docs/okx-defi-v1/PROPOSTA.md](../okx-defi-v1/PROPOSTA.md) [proposal]
- [docs/okx-defi-v1/RESEARCH.md](../okx-defi-v1/RESEARCH.md) [historical_evidence]
- [docs/okx-defi-v1/SPEC.md](../okx-defi-v1/SPEC.md) [frozen_contract]
- [docs/okx-defi-v1/VERIFICACAO.md](../okx-defi-v1/VERIFICACAO.md) [historical_evidence]
- [docs/OKX-EARN-RESEARCH.md](../OKX-EARN-RESEARCH.md) [historical_evidence]
- [docs/okx-ecosystem/GUIA.md](../okx-ecosystem/GUIA.md) [needs_review]
- [docs/OKX-ECOSYSTEM-PLAN.md](../OKX-ECOSYSTEM-PLAN.md) [proposal]
- [docs/OKX-ECOSYSTEM-SPEC.md](../OKX-ECOSYSTEM-SPEC.md) [frozen_contract]
- [docs/okx-ecosystem-v1/DATA-INTEGRATION-AUDIT.md](../okx-ecosystem-v1/DATA-INTEGRATION-AUDIT.md) [historical_evidence]
- [docs/okx-ecosystem-v1/GUIA.md](../okx-ecosystem-v1/GUIA.md) [current_reference]
- [docs/okx-ecosystem-v1/SPEC.md](../okx-ecosystem-v1/SPEC.md) [frozen_contract]
- [docs/okx-evidence-v1/AUDITORIA.md](../okx-evidence-v1/AUDITORIA.md) [historical_evidence]
- [docs/okx-evidence-v1/CYCLE-REVIEW.md](../okx-evidence-v1/CYCLE-REVIEW.md) [historical_evidence]
- [docs/okx-evidence-v1/GUIA.md](../okx-evidence-v1/GUIA.md) [current_reference]
- [docs/okx-evidence-v1/PROPOSTA.md](../okx-evidence-v1/PROPOSTA.md) [proposal]
- [docs/okx-evidence-v1/SPEC.md](../okx-evidence-v1/SPEC.md) [frozen_contract]
- [docs/okx-evidence-v1/VERIFICACAO.md](../okx-evidence-v1/VERIFICACAO.md) [historical_evidence]
- [docs/okx-exit-security-v1/RESEARCH.md](../okx-exit-security-v1/RESEARCH.md) [historical_evidence]
- [docs/okx-leaderboard-v1/RESEARCH.md](../okx-leaderboard-v1/RESEARCH.md) [historical_evidence]
- [docs/okx-market-v1/OKX-ECOSYSTEM-15-WORKSTREAMS-20261009.md](../okx-market-v1/OKX-ECOSYSTEM-15-WORKSTREAMS-20261009.md) [historical_evidence]
- [docs/okx-market-v1/OKX-ECOSYSTEM-V1-BASELINE.md](../okx-market-v1/OKX-ECOSYSTEM-V1-BASELINE.md) [historical_evidence]
- [docs/okx-market-v1/OKX-ECOSYSTEM-V1-CONTRACT-ERRATA.md](../okx-market-v1/OKX-ECOSYSTEM-V1-CONTRACT-ERRATA.md) [historical_evidence]
- [docs/okx-market-v1/OKX-ECOSYSTEM-V1-SPEC.md](../okx-market-v1/OKX-ECOSYSTEM-V1-SPEC.md) [frozen_contract]
- [docs/okx-rewards-v1/RESEARCH.md](../okx-rewards-v1/RESEARCH.md) [historical_evidence]
- [docs/okx-signals-v1/AUDITORIA.md](../okx-signals-v1/AUDITORIA.md) [historical_evidence]
- [docs/okx-signals-v1/GUIA.md](../okx-signals-v1/GUIA.md) [current_reference]
- [docs/okx-signals-v1/SPEC.md](../okx-signals-v1/SPEC.md) [frozen_contract]
- [docs/okx-signals-v1/VERIFICACAO.md](../okx-signals-v1/VERIFICACAO.md) [historical_evidence]
- [docs/OPPORTUNITY-ARCHITECTURE.md](../OPPORTUNITY-ARCHITECTURE.md) [proposal]
- [docs/research/codex-operator-c4-research-20261011/defi-discovery-concrete-seams-20261011.md](../research/codex-operator-c4-research-20261011/defi-discovery-concrete-seams-20261011.md) [proposal]
- [docs/research/codex-operator-c4-research-20261011/docs-research-defi-endpoint-coverage-20261011.md](../research/codex-operator-c4-research-20261011/docs-research-defi-endpoint-coverage-20261011.md) [historical_evidence]
- [docs/research/DEFI-CANDIDATE-BOUNDARY-FINDINGS-20261011.md](../research/DEFI-CANDIDATE-BOUNDARY-FINDINGS-20261011.md) [historical_evidence]
- [docs/research/OKX-DEFI-ENDPOINT-COVERAGE-20261011.md](../research/OKX-DEFI-ENDPOINT-COVERAGE-20261011.md) [historical_evidence]
- [docs/research/OKX-DEFI-WIRING-ADDENDUM-20261011.md](../research/OKX-DEFI-WIRING-ADDENDUM-20261011.md) [historical_evidence]
- [docs/research/OKX-DEFI-WIRING-INDEPENDENT-REVIEW-20261011.md](../research/OKX-DEFI-WIRING-INDEPENDENT-REVIEW-20261011.md) [historical_evidence]

## Limites e relações

O HEAD observado coincide com o snapshot `00a593bcabe25dbb6d83795268533551098f645b`. Os hashes dos 41 documentos e dos 19 caminhos de código atribuídos, mais quatro fontes de quote inspecionadas, não divergiram do snapshot. O snapshot inclui working tree com alterações não commitadas e arquivos não rastreados.

Escopo verificado: leitura estática, validação dos artefatos, typecheck e testes. `bun --no-env-file run typecheck` passou; o recorte DeFi/evidence/signals/opportunities passou em 58 testes, 0 falhas. A suíte do workspace teve 4.432 aprovados, 2 ignorados e 1 falha em `src/desktop/handlers.test.ts:323`: esperava `modo_nao_disponivel`, recebeu `pedido_invalido`; os dois arquivos desktop estão fora da atribuição e diferem do snapshot. O verificador documental parou porque `docs/_meta/generated-files.json` não existe. JSON e asserções de contagem do recibo passaram. Evidências no [recibo](../_meta/audits/defi-e-oportunidades.json). Nenhum CLI do produto, rede, autenticação, carteira ou modelo foi iniciado. Acesso, custo faturado, custo de API, saída/resgate executável, unidade de saída do quote DEX, elegibilidade pessoal, retorno e lucro permanecem sem verificação.

Relações: [[seguranca-e-qualificacao]] e [[manutencao-da-documentacao]].
